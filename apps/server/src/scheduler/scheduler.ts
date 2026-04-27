import type { RunConfig } from '@stellar/shared';
import { broadcastRunEvent } from '../ws/runStream.js';
import {
  launchRun,
  subscribeRunEnd,
  validateRunConfig,
  type RunState,
} from '../routes/run.js';
import { loadScheduler, saveScheduler, type SchedulerPersisted } from './store.js';

let persisted: SchedulerPersisted = loadScheduler();

let blockedByOtherRun = false;
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
let nextRunAt: number | null = null;
let kickChain: Promise<void> = Promise.resolve();
let runEndUnsub: (() => void) | null = null;

function headlessFromConfig(c: RunConfig | null | undefined): boolean {
  return c == null || c.headless !== false;
}

function stripForDisk(c: RunConfig): RunConfig {
  const rest = { ...c };
  delete rest.credentials;
  return rest;
}

function emitState(): void {
  broadcastRunEvent({
    type: 'SCHEDULER_STATE',
    enabled: persisted.enabled,
    cooldownSeconds: persisted.cooldownSeconds,
    status: computeStatus(),
    lastRunAt: persisted.lastRunAt,
    nextRunAt,
    hasConfig: persisted.config != null,
    headless: headlessFromConfig(persisted.config),
  });
}

function computeStatus(): 'idle' | 'running' | 'cooling-down' | 'waiting-for-run' | 'disabled' {
  if (!persisted.enabled) return 'disabled';
  if (!persisted.config) return 'idle';
  if (runStateRef == null) return 'idle';
  if (runStateRef.running) {
    return blockedByOtherRun ? 'waiting-for-run' : 'running';
  }
  if (cooldownTimer != null && nextRunAt != null && Date.now() < nextRunAt) {
    return 'cooling-down';
  }
  return 'idle';
}

let runStateRef: RunState | undefined;

function clearCooldown(): void {
  if (cooldownTimer != null) {
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
  nextRunAt = null;
}

function scheduleCooldownAndEmit(): void {
  clearCooldown();
  if (!persisted.enabled || !persisted.config) {
    emitState();
    return;
  }
  const ms = Math.max(0, persisted.cooldownSeconds) * 1000;
  nextRunAt = Date.now() + ms;
  emitState();
  cooldownTimer = setTimeout(() => {
    cooldownTimer = null;
    nextRunAt = null;
    void enqueueKick();
  }, ms);
}

function enqueueKick(): void {
  kickChain = kickChain
    .then(() => kickLoop())
    .catch((e) => {
      console.error('[stellar] scheduler kickLoop', e);
    });
}

async function kickLoop(): Promise<void> {
  if (!persisted.enabled || !persisted.config) {
    emitState();
    return;
  }
  const v = validateRunConfig(persisted.config);
  if (!v.ok) {
    console.warn('[stellar] scheduler: invalid stored config, disabling:', v.error);
    persisted.enabled = false;
    saveScheduler(persisted);
    emitState();
    return;
  }
  const config = v.config;

  if (runStateRef == null) {
    console.error('[stellar] scheduler: runState not initialized');
    return;
  }

  if (runStateRef.running) {
    blockedByOtherRun = true;
    emitState();
    return;
  }

  blockedByOtherRun = false;

  try {
    await launchRun(runStateRef, config);
  } catch (e) {
    console.error('[stellar] scheduler: launchRun failed', e);
  }
  if (!persisted.enabled) {
    clearCooldown();
    emitState();
    return;
  }
  persisted = { ...persisted, lastRunAt: Date.now() };
  const cv = validateRunConfig(persisted.config!);
  if (cv.ok) {
    persisted = {
      ...persisted,
      config: stripForDisk(cv.config) as RunConfig,
    };
  }
  saveScheduler(persisted);
  scheduleCooldownAndEmit();
}

function onExternalRunEnd(): void {
  if (persisted.enabled && persisted.config && blockedByOtherRun) {
    void enqueueKick();
  }
}

/**
 * Call once at process startup with the shared `RunState` from `registerRunRoutes`.
 */
export function initScheduler(runState: RunState): void {
  runStateRef = runState;
  if (runEndUnsub) runEndUnsub();
  runEndUnsub = subscribeRunEnd(onExternalRunEnd);
  emitState();
  if (persisted.enabled && persisted.config) {
    void enqueueKick();
  }
}

export function getSchedulerSnapshot(): {
  enabled: boolean;
  cooldownSeconds: number;
  status: ReturnType<typeof computeStatus>;
  lastRunAt: number | null;
  nextRunAt: number | null;
  hasConfig: boolean;
  headless: boolean;
} {
  return {
    enabled: persisted.enabled,
    cooldownSeconds: persisted.cooldownSeconds,
    status: computeStatus(),
    lastRunAt: persisted.lastRunAt,
    nextRunAt,
    hasConfig: persisted.config != null,
    headless: headlessFromConfig(persisted.config),
  };
}

export function enableScheduler(opts: {
  cooldownSeconds: number;
  config: RunConfig;
}): { ok: true } | { ok: false; error: string } {
  const v = validateRunConfig(opts.config);
  if (!v.ok) {
    return { ok: false, error: v.error };
  }
  if (opts.cooldownSeconds < 30 || opts.cooldownSeconds > 24 * 3600) {
    return { ok: false, error: 'cooldownSeconds must be between 30 and 86400' };
  }
  const diskConfig = stripForDisk(v.config);
  persisted = {
    enabled: true,
    cooldownSeconds: opts.cooldownSeconds,
    lastRunAt: persisted.lastRunAt,
    config: diskConfig,
  };
  saveScheduler(persisted);
  blockedByOtherRun = false;
  clearCooldown();
  emitState();
  void enqueueKick();
  return { ok: true };
}

export function disableScheduler(): void {
  persisted = { ...persisted, enabled: false };
  saveScheduler(persisted);
  blockedByOtherRun = false;
  clearCooldown();
  emitState();
}

/**
 * For tests or graceful shutdown: stop listening to run end (optional).
 */
export function destroySchedulerForTests(): void {
  if (runEndUnsub) {
    runEndUnsub();
    runEndUnsub = null;
  }
  clearCooldown();
}

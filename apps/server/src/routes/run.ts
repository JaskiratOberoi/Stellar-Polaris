import type { RunConfig, TestCodeId } from '@stellar/shared';
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { runVitaminPanelScan } from '../bot/vitaminPanelBot.js';
import { runUrineRoutineScan } from '../bot/urineRoutineBot.js';
import { broadcastRunEvent } from '../ws/runStream.js';
import { isTestCodeId, URINE_ROUTINE } from '../config/testCodes.js';
import { WORKSHEET_STATUS_OPTIONS } from '../config/statuses.js';
import { resolveLisCredentialsFromEnv } from '../config/credentials.js';

const allowedStatuses = new Set<string>(WORKSHEET_STATUS_OPTIONS as unknown as string[]);

export type RunState = {
  running: boolean;
  runId: string | null;
  startedAt: number | null;
  controller: AbortController | null;
};

const runEndListeners = new Set<() => void>();
const runStartListeners = new Set<() => void>();

/** Called from `launchRun` `finally` so the scheduler can re-kick after manual runs. */
function notifyRunEnd(): void {
  for (const fn of runEndListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function notifyRunStart(): void {
  for (const fn of runStartListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Register a callback invoked whenever a run starts (`beginRun`).
 */
export function subscribeRunStart(fn: () => void): () => void {
  runStartListeners.add(fn);
  return () => {
    runStartListeners.delete(fn);
  };
}

/**
 * Register a callback invoked whenever a run fully completes (normal end, error, or stopped).
 * Used by the continuous scheduler to retry `kickLoop` when a user-triggered run finishes.
 */
export function subscribeRunEnd(fn: () => void): () => void {
  runEndListeners.add(fn);
  return () => {
    runEndListeners.delete(fn);
  };
}

export function validateRunConfig(body: unknown): { ok: true; config: RunConfig } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Expected JSON object body' };
  }
  const b = body as Record<string, unknown>;
  const testCodes = b.testCodes;
  const urineRoutineRaw = b.urineRoutineEnabled;
  let urineRoutineEnabled =
    urineRoutineRaw === true ||
    urineRoutineRaw === 1 ||
    (typeof urineRoutineRaw === 'string' &&
      ['true', '1', 'yes', 'on'].includes(urineRoutineRaw.trim().toLowerCase()));
  if (!Array.isArray(testCodes)) {
    return { ok: false, error: 'testCodes must be an array' };
  }
  /** Client may send `testCodes: ['CP004']` alone so the array is never empty; treat as urine run. */
  const onlyUrineRoutineCode =
    testCodes.length > 0 &&
    testCodes.every((c) => typeof c === 'string' && String(c).trim() === URINE_ROUTINE);
  if (onlyUrineRoutineCode) {
    urineRoutineEnabled = true;
  }
  if (testCodes.length === 0 && !urineRoutineEnabled) {
    return {
      ok: false,
      error:
        'Enable at least one test code, or turn on Urine Routine (CP004), or both — testCodes cannot be empty unless the urine routine bot is enabled.',
    };
  }
  const codes: TestCodeId[] = [];
  for (const c of testCodes) {
    if (typeof c !== 'string' || !isTestCodeId(c)) {
      return { ok: false, error: `Invalid test code: ${String(c)}` };
    }
    if (c === URINE_ROUTINE) {
      // CP004 is driven by `urineRoutineEnabled`, not by the testCodes array,
      // so the vitamin panel scan never sees it. Drop silently if a client
      // accidentally includes it.
      continue;
    }
    codes.push(c);
  }
  const businessUnit = typeof b.businessUnit === 'string' && b.businessUnit.trim() ? b.businessUnit.trim() : 'QUGEN';
  const statusLabels = b.statusLabels;
  if (!Array.isArray(statusLabels) || statusLabels.length === 0) {
    return { ok: false, error: 'statusLabels must be a non-empty array' };
  }
  for (const s of statusLabels) {
    if (typeof s !== 'string' || !allowedStatuses.has(s)) {
      return { ok: false, error: `Invalid status: ${String(s)}` };
    }
  }
  const { username, password } = resolveLisCredentialsFromEnv();

  const fromDate = typeof b.fromDate === 'string' && b.fromDate.trim() ? b.fromDate.trim() : undefined;
  const toDate = typeof b.toDate === 'string' && b.toDate.trim() ? b.toDate.trim() : undefined;
  const fromHour = parseHour(b.fromHour);
  const toHour = parseHour(b.toHour);
  const headless = b.headless === false ? false : true;
  const authenticate = b.authenticate === true;

  const config: RunConfig = {
    testCodes: codes,
    businessUnit,
    statusLabels: statusLabels as string[],
    fromDate,
    toDate,
    fromHour,
    toHour,
    headless,
    authenticate,
    urineRoutineEnabled,
    credentials: { username, password },
    loginUrls: {
      primary: process.env.LIS_PRIMARY_URL,
      backup: process.env.LIS_BACKUP_URL,
    },
  };
  return { ok: true, config };
}

function parseHour(v: unknown): number | null | undefined {
  if (v == null) return undefined;
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/**
 * Synchronously marks a run as started and broadcasts `RUN_STARTED`. Pair with
 * `executeRun` (or `launchRun` which does both) so the HTTP response can return a real `runId`.
 */
export function beginRun(state: RunState): string {
  if (state.running) {
    throw new Error('beginRun: run already in progress');
  }
  const runId = randomUUID();
  const controller = new AbortController();
  state.running = true;
  state.runId = runId;
  state.startedAt = Date.now();
  state.controller = controller;
  broadcastRunEvent({ type: 'RUN_STARTED', runId });
  notifyRunStart();
  return runId;
}

/**
 * Runs the bot for an already-begun run. Clears `state` and notifies run-end listeners in `finally`.
 */
export async function executeRun(state: RunState, runId: string, config: RunConfig): Promise<void> {
  if (state.runId !== runId || !state.controller) {
    throw new Error('executeRun: state does not match runId or controller is missing');
  }
  const signal = state.controller.signal;
  const emit = (ev: Parameters<typeof broadcastRunEvent>[0]) => broadcastRunEvent(ev);
  const headed = config.headless === false;
  emit({
    type: 'LOG',
    level: 'info',
    message: `Run pipeline starting (${headed ? 'visible browser' : 'headless'}). The next lines appear after Chromium launches.`,
    ts: Date.now(),
  });
  try {
    if (config.testCodes.length > 0) {
      await runVitaminPanelScan({ runId, config, signal, emit });
    }
    if (!signal.aborted && config.urineRoutineEnabled) {
      await runUrineRoutineScan({ runId, config, signal, emit });
    }
    if (signal.aborted) {
      broadcastRunEvent({ type: 'RUN_STOPPED', runId });
    } else {
      broadcastRunEvent({ type: 'RUN_DONE', runId });
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    broadcastRunEvent({ type: 'RUN_ERROR', runId, error: err });
    console.error(e);
  } finally {
    state.running = false;
    state.runId = null;
    state.startedAt = null;
    state.controller = null;
    notifyRunEnd();
  }
}

/**
 * `beginRun` + `await executeRun` — for the scheduler; do not use when you need to
 * send `runId` in the same HTTP response as `POST /api/run` (use `beginRun` + `void executeRun` there).
 */
export async function launchRun(state: RunState, config: RunConfig): Promise<string> {
  const runId = beginRun(state);
  await executeRun(state, runId, config);
  return runId;
}

export function registerRunRoutes(app: Express, state: RunState): void {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/status', (_req: Request, res: Response) => {
    res.json({
      running: state.running,
      runId: state.runId,
      startedAt: state.startedAt,
    } satisfies {
      running: boolean;
      runId: string | null;
      startedAt: number | null;
    });
  });

  app.get('/api/status-options', (_req: Request, res: Response) => {
    res.json({ options: WORKSHEET_STATUS_OPTIONS });
  });

  app.post('/api/run', (req: Request, res: Response) => {
    if (state.running) {
      res.status(409).json({ error: 'A run is already in progress' });
      return;
    }
    const v = validateRunConfig(req.body);
    if (!v.ok) {
      res.status(400).json({ error: v.error });
      return;
    }
    const config = v.config;
    const runId = beginRun(state);
    res.json({ runId, started: true });
    void executeRun(state, runId, config);
  });

  app.post('/api/stop', (_req: Request, res: Response) => {
    if (!state.running || !state.controller) {
      res.json({ ok: true, message: 'No run in progress' });
      return;
    }
    state.controller.abort();
    res.json({ ok: true, stopped: true });
  });
}

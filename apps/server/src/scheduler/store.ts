import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunConfig } from '@stellar/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SCHEDULER_FILE = path.resolve(__dirname, '../../data/scheduler.json');

export type SchedulerPersisted = {
  enabled: boolean;
  cooldownSeconds: number;
  /** Last run end time (ms); optional for older files. */
  lastRunAt: number | null;
  /** Same shape as `POST /api/run` body (no credentials). */
  config: RunConfig | null;
};

const DEFAULTS: SchedulerPersisted = {
  enabled: false,
  cooldownSeconds: 300,
  lastRunAt: null,
  config: null,
};

function ensureDataDir(): void {
  const dir = path.dirname(SCHEDULER_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

export function loadScheduler(): SchedulerPersisted {
  try {
    if (!fs.existsSync(SCHEDULER_FILE)) {
      return { ...DEFAULTS };
    }
    const raw = fs.readFileSync(SCHEDULER_FILE, 'utf8');
    const j = JSON.parse(raw) as Partial<SchedulerPersisted>;
    return {
      enabled: Boolean(j.enabled),
      cooldownSeconds:
        typeof j.cooldownSeconds === 'number' && Number.isFinite(j.cooldownSeconds)
          ? j.cooldownSeconds
          : DEFAULTS.cooldownSeconds,
      lastRunAt:
        typeof j.lastRunAt === 'number' && Number.isFinite(j.lastRunAt) ? j.lastRunAt : null,
      config: j.config && typeof j.config === 'object' ? (j.config as RunConfig) : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveScheduler(data: SchedulerPersisted): void {
  ensureDataDir();
  const tmp = `${SCHEDULER_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, SCHEDULER_FILE);
}

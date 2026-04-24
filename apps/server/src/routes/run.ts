import type { RunConfig, TestCodeId } from '@stellar/shared';
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { runVitaminPanelScan } from '../bot/vitaminPanelBot.js';
import { broadcastRunEvent } from '../ws/runStream.js';
import { isTestCodeId } from '../config/testCodes.js';
import { WORKSHEET_STATUS_OPTIONS } from '../config/statuses.js';
import { resolveLisCredentialsFromEnv } from '../config/credentials.js';

const allowedStatuses = new Set<string>(WORKSHEET_STATUS_OPTIONS as unknown as string[]);

export type RunState = {
  running: boolean;
  runId: string | null;
  startedAt: number | null;
  controller: AbortController | null;
};

function validateRunConfig(body: unknown): { ok: true; config: RunConfig } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Expected JSON object body' };
  }
  const b = body as Record<string, unknown>;
  const testCodes = b.testCodes;
  if (!Array.isArray(testCodes) || testCodes.length === 0) {
    return { ok: false, error: 'testCodes must be a non-empty array' };
  }
  const codes: TestCodeId[] = [];
  for (const c of testCodes) {
    if (typeof c !== 'string' || !isTestCodeId(c)) {
      return { ok: false, error: `Invalid test code: ${String(c)}` };
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
    const runId = randomUUID();
    const controller = new AbortController();
    state.running = true;
    state.runId = runId;
    state.startedAt = Date.now();
    state.controller = controller;

    broadcastRunEvent({ type: 'RUN_STARTED', runId });
    res.json({ runId, started: true });

    const config = v.config;
    const signal = controller.signal;
    const emit = (ev: Parameters<typeof broadcastRunEvent>[0]) => broadcastRunEvent(ev);

    void (async () => {
      try {
        await runVitaminPanelScan({ runId, config, signal, emit });
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
      }
    })();
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

import { config as loadEnv } from 'dotenv';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import { flushAuditLogs } from './audit/runLog.js';
import { registerRunRoutes, type RunState } from './routes/run.js';
import { registerSchedulerRoutes } from './routes/scheduler.js';
import { registerSidRoutes } from './routes/sids.js';
import { setRuntimePathsForProcess } from './runtime/paths.js';
import { destroySchedulerForTests, initScheduler } from './scheduler/scheduler.js';
import { initSidStore } from './sids/sidStore.js';
import { attachRunStreamWss } from './ws/runStream.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type StartServerOptions = {
  port?: number;
  /** Overrides `STELLAR_DATA_DIR` (scheduler persistence). */
  dataDir?: string;
  /** Overrides `STELLAR_LOGS_DIR` (audit CSV / JSONL). */
  logsDir?: string;
  /** Dotenv file paths, in order. Defaults to monorepo root + `apps/server/.env`. */
  envFiles?: string[];
  /**
   * Serve the built web UI (`vite build` output). Sets `STELLAR_STATIC_DIR` for introspection.
   * When set, `GET /` and non-`/api` routes serve the SPA so `fetch('/api/...')` works.
   */
  staticDir?: string;
};

export type StartedServer = {
  port: number;
  /** Underlying HTTP server (WebSocket attached at `/ws`). */
  httpServer: ReturnType<typeof createServer>;
  /** Idempotent graceful shutdown (flush audit logs, close WS + HTTP). */
  close: () => Promise<void>;
};

function defaultEnvFiles(): string[] {
  return [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../../.env')];
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return path.normalize(fileURLToPath(import.meta.url)) === path.normalize(path.resolve(entry));
  }
}

/**
 * Starts Express + WebSocket server. Call `close()` when embedding (e.g. Electron).
 */
export async function startServer(opts: StartServerOptions = {}): Promise<StartedServer> {
  const envFiles = opts.envFiles ?? defaultEnvFiles();
  for (const p of envFiles) {
    loadEnv({ path: p });
  }

  if (opts.dataDir != null && opts.logsDir != null) {
    setRuntimePathsForProcess(opts.dataDir, opts.logsDir);
  } else {
    if (opts.dataDir != null) process.env.STELLAR_DATA_DIR = opts.dataDir;
    if (opts.logsDir != null) process.env.STELLAR_LOGS_DIR = opts.logsDir;
  }

  const staticDirRaw = opts.staticDir ?? process.env.STELLAR_STATIC_DIR?.trim();
  const staticDir = staticDirRaw ? path.resolve(staticDirRaw) : undefined;
  if (staticDir) {
    process.env.STELLAR_STATIC_DIR = staticDir;
  }

  initSidStore();

  const port = opts.port ?? (Number(process.env.PORT) || 4400);

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  const runState: RunState = {
    running: false,
    runId: null,
    startedAt: null,
    controller: null,
  };

  registerRunRoutes(app, runState);
  initScheduler(runState);
  registerSchedulerRoutes(app);
  registerSidRoutes(app, runState);

  if (staticDir) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  attachRunStreamWss(wss);

  let shuttingDown = false;

  const close = (): Promise<void> => {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;
    console.log('[stellar] closing server');
    runState.controller?.abort();
    destroySchedulerForTests();
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          flushAuditLogs();
        } catch (e) {
          console.error('[stellar] flushAuditLogs', e);
        }
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      }, 200);
    });
  };

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      httpServer.off('error', reject);
      console.log(`[stellar] server listening on http://localhost:${port} (WebSocket: /ws)`);
      resolve({ port, httpServer, close });
    });
  });
}

function registerSignalHandlers(close: () => Promise<void>): void {
  const onSignal = (reason: string) => {
    console.log(`[stellar] shutdown (${reason})`);
    void close().then(
      () => process.exit(0),
      () => process.exit(1)
    );
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
}

if (isMainModule()) {
  void startServer().then(({ close }) => {
    registerSignalHandlers(close);
  });
}

import { config as loadEnv } from 'dotenv';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import { flushAuditLogs } from './audit/runLog.js';
import { registerRunRoutes, type RunState } from './routes/run.js';
import { registerSchedulerRoutes } from './routes/scheduler.js';
import { destroySchedulerForTests, initScheduler } from './scheduler/scheduler.js';
import { attachRunStreamWss } from './ws/runStream.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
loadEnv({ path: path.resolve(__dirname, '../../.env') });

const port = Number(process.env.PORT) || 4400;

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

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
attachRunStreamWss(wss);

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[stellar] shutdown (${reason})`);
  runState.controller?.abort();
  destroySchedulerForTests();
  setTimeout(() => {
    try {
      flushAuditLogs();
    } catch (e) {
      console.error('[stellar] flushAuditLogs', e);
    }
    wss.close(() => {
      server.close((err) => {
        if (err) console.error(err);
        process.exit(0);
      });
    });
  }, 200);
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(port, () => {
  console.log(`[stellar] server listening on http://localhost:${port} (WebSocket: /ws)`);
});

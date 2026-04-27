import { config as loadEnv } from 'dotenv';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import { registerRunRoutes, type RunState } from './routes/run.js';
import { registerSchedulerRoutes } from './routes/scheduler.js';
import { initScheduler } from './scheduler/scheduler.js';
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

server.listen(port, () => {
  console.log(`[stellar] server listening on http://localhost:${port} (WebSocket: /ws)`);
});

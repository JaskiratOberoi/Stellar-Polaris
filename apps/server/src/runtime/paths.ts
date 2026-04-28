import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default `apps/server/data` when running from compiled `dist/`. */
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data');

/**
 * Resolves persistent data and audit log directories.
 * - `STELLAR_DATA_DIR` — scheduler.json and other app data (default: server `data/`)
 * - `STELLAR_LOGS_DIR` — audit logs tree (default: `<dataDir>/logs`)
 */
export function getRuntimePaths(): { dataDir: string; logsDir: string } {
  const dataDir = process.env.STELLAR_DATA_DIR?.trim()
    ? path.resolve(process.env.STELLAR_DATA_DIR)
    : DEFAULT_DATA_DIR;
  const logsDir = process.env.STELLAR_LOGS_DIR?.trim()
    ? path.resolve(process.env.STELLAR_LOGS_DIR)
    : path.join(dataDir, 'logs');
  return { dataDir, logsDir };
}

/** @internal Prefer `startServer({ dataDir, logsDir })` or env vars before any I/O. */
export function setRuntimePathsForProcess(dataDir: string, logsDir: string): void {
  process.env.STELLAR_DATA_DIR = dataDir;
  process.env.STELLAR_LOGS_DIR = logsDir;
}

export function getSchedulerFilePath(): string {
  return path.join(getRuntimePaths().dataDir, 'scheduler.json');
}

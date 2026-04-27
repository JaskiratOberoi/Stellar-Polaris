import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LOGS_ROOT = path.resolve(__dirname, '../../data/logs');
export const RUNS_DIR = path.join(LOGS_ROOT, 'runs');
export const DECISIONS_CSV = path.join(LOGS_ROOT, 'decisions.csv');
export const SCANS_CSV = path.join(LOGS_ROOT, 'scans.csv');
export const SCHEDULER_JSONL = path.join(LOGS_ROOT, 'scheduler.jsonl');
export const ORPHAN_JSONL = path.join(RUNS_DIR, 'orphan.jsonl');

export function ensureLogDirs(): void {
  fs.mkdirSync(LOGS_ROOT, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

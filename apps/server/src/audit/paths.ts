import fs from 'node:fs';
import path from 'node:path';
import { getRuntimePaths } from '../runtime/paths.js';

function logsRoot(): string {
  return getRuntimePaths().logsDir;
}

export function getRunsDir(): string {
  return path.join(logsRoot(), 'runs');
}

export function getDecisionsCsvPath(): string {
  return path.join(logsRoot(), 'decisions.csv');
}

export function getScansCsvPath(): string {
  return path.join(logsRoot(), 'scans.csv');
}

export function getSchedulerJsonlPath(): string {
  return path.join(logsRoot(), 'scheduler.jsonl');
}

export function getOrphanJsonlPath(): string {
  return path.join(getRunsDir(), 'orphan.jsonl');
}

export function ensureLogDirs(): void {
  const root = logsRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(getRunsDir(), { recursive: true });
}

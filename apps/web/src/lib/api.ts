import type { RunConfig, StoredSidEntry, WsClientEvent } from '@stellar/shared';

export type SchedulerSnapshot = Omit<Extract<WsClientEvent, { type: 'SCHEDULER_STATE' }>, 'type'>;

export async function getScheduler(): Promise<SchedulerSnapshot> {
  const res = await fetch('/api/scheduler');
  if (!res.ok) throw new Error('Failed to load scheduler');
  return (await res.json()) as SchedulerSnapshot;
}

export async function postScheduler(
  body:
    | { enabled: false; cooldownSeconds?: number }
    | { enabled: true; cooldownSeconds?: number; config: RunConfig }
): Promise<SchedulerSnapshot & { ok: boolean }> {
  const res = await fetch('/api/scheduler', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || res.statusText || 'Scheduler request failed');
  }
  return (await res.json()) as SchedulerSnapshot & { ok: boolean };
}

export async function postRun(config: RunConfig): Promise<{ runId: string; started: boolean }> {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || res.statusText || 'Run failed');
  }
  return (await res.json()) as { runId: string; started: boolean };
}

export async function postStop(): Promise<void> {
  await fetch('/api/stop', { method: 'POST' });
}

export async function getStatusOptions(): Promise<string[]> {
  const res = await fetch('/api/status-options');
  if (!res.ok) throw new Error('Failed to load status options');
  const j = (await res.json()) as { options: string[] };
  return j.options;
}

export async function getRunStatus(): Promise<{
  running: boolean;
  runId: string | null;
  startedAt: number | null;
}> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Failed to load run status');
  return (await res.json()) as {
    running: boolean;
    runId: string | null;
    startedAt: number | null;
  };
}

export async function getActiveSids(): Promise<{ entries: StoredSidEntry[] }> {
  const res = await fetch('/api/sids/active');
  if (!res.ok) throw new Error('Failed to load active SIDs');
  return (await res.json()) as { entries: StoredSidEntry[] };
}

export async function postArchiveSids(): Promise<{ ok: boolean; archiveFile: string; count: number }> {
  const res = await fetch('/api/sids/archive', { method: 'POST' });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || res.statusText || 'Archive failed');
  }
  return (await res.json()) as { ok: boolean; archiveFile: string; count: number };
}

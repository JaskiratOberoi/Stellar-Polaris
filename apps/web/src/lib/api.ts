import type { RunConfig } from '@stellar/shared';

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

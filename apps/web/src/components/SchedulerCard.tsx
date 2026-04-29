import { useCallback, useEffect, useState } from 'react';
import type { RunConfig } from '@stellar/shared';
import { getScheduler, postScheduler, type SchedulerSnapshot } from '../lib/api';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_COOLDOWN = 300;

type Props = {
  buildConfig: () => RunConfig;
  onError: (message: string) => void;
  remote: SchedulerSnapshot | null;
  className?: string;
};

function formatTs(ts: number | null): string {
  if (ts == null) return '—';
  return new Date(ts).toLocaleString();
}

export function SchedulerCard({ buildConfig, onError, remote, className }: Props) {
  const [runContinuously, setRunContinuously] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(DEFAULT_COOLDOWN);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refreshFromServer = useCallback(() => {
    getScheduler()
      .then((s) => {
        setRunContinuously(s.enabled);
        setCooldownSeconds(s.cooldownSeconds);
      })
      .catch(() => {
        /* dev server not up */
      });
  }, []);

  useEffect(() => {
    refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    if (remote) setRunContinuously(remote.enabled);
  }, [remote?.enabled]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const display = remote;
  const secsToNext =
    display?.nextRunAt != null ? Math.max(0, Math.ceil((display.nextRunAt - nowTick) / 1000)) : null;

  const onSave = async () => {
    setSaving(true);
    try {
      const cd = Math.max(30, Math.min(86400, Math.floor(cooldownSeconds) || DEFAULT_COOLDOWN));
      setCooldownSeconds(cd);
      if (!runContinuously) {
        await postScheduler({ enabled: false, cooldownSeconds: cd });
        setSavedAt(Date.now());
        return;
      }
      const config = buildConfig();
      await postScheduler({
        enabled: true,
        cooldownSeconds: cd,
        config,
      });
      setSavedAt(Date.now());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onDisable = async () => {
    setSaving(true);
    try {
      await postScheduler({ enabled: false, cooldownSeconds: cooldownSeconds });
      setRunContinuously(false);
      setSavedAt(Date.now());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (savedAt == null) return;
    const id = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(id);
  }, [savedAt]);

  return (
    <div className={cn('glass-panel flex min-h-0 flex-col rounded-2xl border p-4', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Background scheduler</h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Loop runs with cooldown. Persists in{' '}
          <code className="text-zinc-600">apps/server/data/scheduler.json</code>.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div
          className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-2.5 py-2"
          title="Run continuously — server loops scans until you disable or change settings"
        >
          <Label
            htmlFor="run-continuous"
            className="cursor-default truncate text-[11px] font-medium leading-tight text-zinc-200"
          >
            Loop scans
          </Label>
          <Switch
            id="run-continuous"
            checked={runContinuously}
            onCheckedChange={(v: boolean) => setRunContinuously(v)}
            className="shrink-0"
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="cooldown" className="text-[9px] uppercase leading-none tracking-wider text-zinc-500">
            Cooldown (s)
          </Label>
          <input
            id="cooldown"
            type="number"
            min={30}
            max={86400}
            className="mt-1 h-8 w-full min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-2 text-xs text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            value={Number.isFinite(cooldownSeconds) ? cooldownSeconds : DEFAULT_COOLDOWN}
            onChange={(e) => setCooldownSeconds(Number(e.target.value))}
          />
          <p className="mt-0.5 text-[9px] text-zinc-600">30–86400</p>
        </div>
      </div>

      {display ? (
        <div className="mt-3 grid gap-1 rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-2.5 font-mono text-[10px] text-zinc-400">
          <p>
            <span className="text-zinc-600">Status</span> <span className="text-zinc-200">{display.status}</span>
          </p>
          <p>
            <span className="text-zinc-600">Last</span> {formatTs(display.lastRunAt)}
          </p>
          <p>
            <span className="text-zinc-600">Next</span>{' '}
            {display.nextRunAt != null
              ? `${formatTs(display.nextRunAt)}${secsToNext != null ? ` · ${secsToNext}s` : ''}`
              : '—'}
          </p>
          <p>
            <span className="text-zinc-600">Config</span> {display.hasConfig ? 'saved' : '—'}
            {!display.headless ? ' · headed' : ''}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void onSave()}>
          {saving ? 'Saving…' : 'Save schedule'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void onDisable()}>
          Disable
        </Button>
        {savedAt ? (
          <span className="text-[10px] text-emerald-400/90">
            Saved {new Date(savedAt).toLocaleTimeString()}
            {!runContinuously ? ' (off)' : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}

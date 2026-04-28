import { useCallback, useEffect, useState } from 'react';
import type { RunConfig } from '@stellar/shared';
import { getScheduler, postScheduler, type SchedulerSnapshot } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Button } from './ui/button';

const DEFAULT_COOLDOWN = 300;

type Props = {
  buildConfig: () => RunConfig;
  onError: (message: string) => void;
  remote: SchedulerSnapshot | null;
};

function formatTs(ts: number | null): string {
  if (ts == null) return '—';
  return new Date(ts).toLocaleString();
}

export function SchedulerCard({ buildConfig, onError, remote }: Props) {
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
    <Card>
      <CardHeader>
        <CardTitle>Background scheduler</CardTitle>
        <CardDescription>
          Run, wait for the cooldown, then run again. Uses the same filters and test codes as a manual run. Settings are
          saved to the server and survive restarts (<code className="text-zinc-500">apps/server/data/scheduler.json</code>
          , gitignored).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="run-continuous" className="text-sm text-zinc-100">
              Run continuously
            </Label>
            <p className="text-xs text-zinc-500">When saved, the server will loop scans until you disable or change settings.</p>
          </div>
          <Switch id="run-continuous" checked={runContinuously} onCheckedChange={(v: boolean) => setRunContinuously(v)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cooldown" className="text-sm text-zinc-200">
            Cooldown between runs (seconds)
          </Label>
          <input
            id="cooldown"
            type="number"
            min={30}
            max={86400}
            className="h-9 w-full max-w-xs rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100"
            value={Number.isFinite(cooldownSeconds) ? cooldownSeconds : DEFAULT_COOLDOWN}
            onChange={(e) => setCooldownSeconds(Number(e.target.value))}
          />
          <p className="text-xs text-zinc-500">Minimum 30, maximum 86400 (24h).</p>
        </div>

        {display ? (
          <div className="rounded-md border border-zinc-800/60 bg-zinc-950/40 p-3 text-xs text-zinc-400">
            <p>
              <span className="text-zinc-500">Status: </span>
              <span className="text-zinc-200">{display.status}</span>
            </p>
            <p className="mt-1">
              <span className="text-zinc-500">Last run end: </span>
              {formatTs(display.lastRunAt)}
            </p>
            <p className="mt-1">
              <span className="text-zinc-500">Next run: </span>
              {display.nextRunAt != null
                ? `${formatTs(display.nextRunAt)} (${secsToNext != null ? `in ${secsToNext}s` : ''})`
                : '—'}
            </p>
            <p className="mt-1">
              <span className="text-zinc-500">Saved: </span>
              {display.hasConfig ? 'yes' : 'no'}
              {!display.headless ? ' · headed (visible browser)' : ''}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void onDisable()}>
            Disable
          </Button>
          {savedAt ? (
            <span className="text-xs text-emerald-400">
              Saved at {new Date(savedAt).toLocaleTimeString()}
              {!runContinuously ? ' (scheduler disabled)' : ''}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

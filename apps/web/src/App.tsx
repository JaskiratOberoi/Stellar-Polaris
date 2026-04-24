import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RunConfig, TestCodeId, WorksheetTestHit, WsClientEvent } from '@stellar/shared';
import { atLeastOneTestCodeOn, selectedTestCodesInOrder, TestCodeToggles } from './components/TestCodeToggles';
import { FiltersPanel } from './components/FiltersPanel';
import { RunControls } from './components/RunControls';
import { SidGrid, type SidEntry } from './components/SidGrid';
import { getRunStatus, postRun, postStop } from './lib/api';
import { connectRunWebSocket } from './lib/wsClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Switch } from './components/ui/switch';

const initialEnabled: Record<TestCodeId, boolean> = { BI235: true, BI005: true, BI133: true };

function parseHourField(s: string): number | null | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s);
  if (Number.isNaN(n) || n < 0 || n > 23) return undefined;
  return n;
}

function buildRunConfig(
  testCodes: TestCodeId[],
  bu: string,
  statuses: string[],
  fromDate: string,
  toDate: string,
  fromHour: string,
  toHour: string,
  authenticate: boolean
): RunConfig {
  const c: RunConfig = {
    testCodes,
    businessUnit: bu.trim() || 'QUGEN',
    statusLabels: statuses,
    headless: true,
  };
  if (authenticate) c.authenticate = true;
  if (fromDate.trim()) c.fromDate = fromDate.trim();
  if (toDate.trim()) c.toDate = toDate.trim();
  const fh = parseHourField(fromHour);
  const th = parseHourField(toHour);
  if (fh != null) c.fromHour = fh;
  if (th != null) c.toHour = th;
  return c;
}

export function App() {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [bu, setBu] = useState('QUGEN');
  const [statusSelection, setStatusSelection] = useState<string[]>(['Tested', 'Partially Tested']);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromHour, setFromHour] = useState('');
  const [toHour, setToHour] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [entries, setEntries] = useState<SidEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skippedDedup, setSkippedDedup] = useState(0);
  const [summary, setSummary] = useState<{
    uniqueSids: number;
    modalsOpened: number;
    modalsSkipped: number;
  } | null>(null);
  const [authenticate, setAuthenticate] = useState(false);

  const onWs = useCallback((ev: WsClientEvent) => {
    if (ev.type === 'LOG') {
      setLogs((prev) => [`[${new Date(ev.ts).toLocaleTimeString()}] ${ev.message}`, ...prev].slice(0, 200));
      return;
    }
    if (ev.type === 'RUN_STARTED') {
      setRunning(true);
      setLastRunId(ev.runId);
      setEntries([]);
      setSkippedDedup(0);
      setSummary(null);
      return;
    }
    if (ev.type === 'SID_TEST_FOUND') {
      setEntries((prev) => upsertSidEntry(prev, ev.sid, ev.discoveredViaTestCode, ev.discoveredViaStatus, ev.tests));
      return;
    }
    if (ev.type === 'SID_AUTH_DECISION') {
      setEntries((prev) => {
        const i = prev.findIndex((e) => e.sid === ev.sid);
        if (i === -1) return prev;
        const row = prev[i]!;
        const authByCode = { ...row.authByCode, [ev.testCode]: {
          decision: ev.decision,
          reason: ev.reason,
          applied: ev.applied,
          saveClicked: ev.saveClicked,
          writeMode: ev.writeMode,
          ageMonths: ev.ageMonths,
          sex: ev.sex,
        } };
        const out = prev.slice();
        out[i] = { ...row, authByCode };
        return out;
      });
      return;
    }
    if (ev.type === 'SID_SKIPPED') {
      setSkippedDedup((n) => n + 1);
      return;
    }
    if (ev.type === 'RUN_SUMMARY') {
      setSummary({
        uniqueSids: ev.uniqueSids,
        modalsOpened: ev.modalsOpened,
        modalsSkipped: ev.modalsSkipped,
      });
      return;
    }
    if (ev.type === 'RUN_DONE' || ev.type === 'RUN_ERROR' || ev.type === 'RUN_STOPPED') {
      setRunning(false);
      if (ev.type === 'RUN_ERROR') {
        setErr(ev.error);
      } else {
        setErr(null);
      }
    }
  }, []);

  function upsertSidEntry(
    prev: SidEntry[],
    sid: string,
    discoveredViaTestCode: TestCodeId,
    discoveredViaStatus: string,
    tests: WorksheetTestHit[]
  ): SidEntry[] {
    const idx = prev.findIndex((e) => e.sid === sid);
    if (idx === -1) {
      const next: SidEntry = {
        sid,
        firstSeenViaTestCode: discoveredViaTestCode,
        firstSeenViaStatus: discoveredViaStatus,
        testsByCode: {},
        authByCode: {},
      };
      for (const t of tests) next.testsByCode[t.testCode] = t;
      return [...prev, next];
    }
    const merged: SidEntry = {
      ...prev[idx]!,
      testsByCode: { ...prev[idx]!.testsByCode },
      authByCode: { ...(prev[idx]!.authByCode ?? {}) },
    };
    for (const t of tests) merged.testsByCode[t.testCode] = t;
    const out = prev.slice();
    out[idx] = merged;
    return out;
  }

  useEffect(() => {
    return connectRunWebSocket(onWs);
  }, [onWs]);

  useEffect(() => {
    getRunStatus()
      .then((s) => {
        if (s.running) setRunning(true);
        if (s.runId) setLastRunId(s.runId);
      })
      .catch(() => {
        /* dev server not up */
      });
  }, []);

  const canStart = useMemo(() => {
    return atLeastOneTestCodeOn(enabled) && statusSelection.length > 0;
  }, [enabled, statusSelection]);

  const onStart = async () => {
    setErr(null);
    const testCodes = selectedTestCodesInOrder(enabled);
    const config = buildRunConfig(testCodes, bu, statusSelection, fromDate, toDate, fromHour, toHour, authenticate);
    try {
      const r = await postRun(config);
      setLastRunId(r.runId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onStop = async () => {
    try {
      await postStop();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl p-6 pb-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Stellar Polaris</h1>
        <p className="text-sm text-zinc-400">Vitamin B12, Vitamin D, and Total IgE worksheet SID results (LIS sample grid + modal rows).</p>
        <p className="mt-1 text-xs text-zinc-500">LIS login uses credentials from the server <code className="text-zinc-400">.env</code> only (e.g. <code className="text-zinc-400">LIS_USERNAME</code> / <code className="text-zinc-400">LIS_PASSWORD</code>).</p>
        {lastRunId && <p className="mt-2 text-xs text-zinc-500">Run id: {lastRunId}</p>}
        {err && <p className="mt-2 text-sm text-red-400">Error: {err}</p>}
        {running && <p className="mt-2 text-sm text-amber-400">Scan in progress…</p>}
      </header>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Test codes</CardTitle>
            <CardDescription>
              Enable any combination. The bot processes enabled codes in order: BI235, then BI005, then BI133.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestCodeToggles
              enabled={enabled}
              onChange={(id, v) => setEnabled((e) => ({ ...e, [id]: v }))}
            />
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-amber-900/40 bg-zinc-950/50 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="authenticate" className="text-sm text-zinc-100">
                  Authenticate (write mode)
                </Label>
                <p className="text-xs text-zinc-500">
                  When on, the bot may tick B12 auth, append a high-result comment, and click Save. Default: dry
                  run (decisions only).
                </p>
                {authenticate ? (
                  <p className="text-xs text-amber-500/90">This modifies live LIS data. Use a test run first.</p>
                ) : null}
              </div>
              <Switch
                id="authenticate"
                checked={authenticate}
                onCheckedChange={(v: boolean) => setAuthenticate(v)}
              />
            </div>
            <div className="pt-4">
              <RunControls
                running={running}
                canStart={canStart}
                onStart={onStart}
                onStop={onStop}
              />
            </div>
          </CardContent>
        </Card>

        <FiltersPanel
          businessUnit={bu}
          onBusinessUnit={setBu}
          statusSelection={statusSelection}
          onStatusSelection={setStatusSelection}
          fromDate={fromDate}
          toDate={toDate}
          onFromDate={setFromDate}
          onToDate={setToDate}
          fromHour={fromHour}
          toHour={toHour}
          onFromHour={setFromHour}
          onToHour={setToHour}
        />

        <SidGrid entries={entries} skippedDedup={skippedDedup} summary={summary} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log (latest first)</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">…</p>
            ) : (
              <ul className="max-h-64 list-none space-y-0.5 overflow-y-auto font-mono text-xs text-zinc-400">
                {logs.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

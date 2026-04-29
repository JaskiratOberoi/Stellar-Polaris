import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RunConfig, StoredSidEntry, TestCodeId, WorksheetTestHit, WsClientEvent } from '@stellar/shared';
import { atLeastOneTestCodeOn, selectedTestCodesInOrder, TestCodeToggles } from './components/TestCodeToggles';
import { FiltersPanel } from './components/FiltersPanel';
import { RunControls } from './components/RunControls';
import { SidGrid } from './components/SidGrid';
import {
  getActiveSids,
  getRunStatus,
  getScheduler,
  postArchiveSids,
  postRun,
  postStop,
  type SchedulerSnapshot,
} from './lib/api';
import { SchedulerCard } from './components/SchedulerCard';
import { connectRunWebSocket } from './lib/wsClient';
import { ControlTile } from './components/ControlTile';
import { ModeToggle } from './components/ModeToggle';
import { MiniToggle } from './components/MiniToggle';
const initialEnabled: Record<TestCodeId, boolean> = {
  BI235: true,
  BI005: true,
  BI133: true,
  BI180: true,
  BI036: true,
};

/** Client-side cap so the DOM stays bounded; server retains up to its own limit in `sids/active.jsonl`. */
const MAX_SID_ENTRIES = 5000;

type ActiveView = 'results' | 'logs';

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
  authenticate: boolean,
  headed: boolean
): RunConfig {
  const c: RunConfig = {
    testCodes,
    businessUnit: bu.trim() || 'QUGEN',
    statusLabels: statuses,
    headless: !headed,
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

function ViewTabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      data-active={active}
      onClick={onClick}
      className="view-tab relative"
    >
      {active ? (
        <motion.span
          layoutId="viewTabBg"
          className="absolute inset-0 -z-10 rounded-lg border border-amber-500/25 bg-amber-500/10 shadow-[0_0_20px_-8px_rgba(245,158,11,0.35)]"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      ) : null}
      <span className="relative z-10">{children}</span>
    </button>
  );
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
  const [entries, setEntries] = useState<StoredSidEntry[]>([]);
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
  const [headed, setHeaded] = useState(false);
  const [schedulerRemote, setSchedulerRemote] = useState<SchedulerSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('results');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);

  function upsertSidEntry(
    prev: StoredSidEntry[],
    runId: string,
    sid: string,
    discoveredViaTestCode: TestCodeId,
    discoveredViaStatus: string,
    tests: WorksheetTestHit[],
    allergyProfileSuppressedTotalIgE?: boolean,
    suppressedTotalIgEValue?: string | null,
    suppressedTotalIgEUnit?: string | null,
    authGateSkipped?: boolean,
    authGateReason?: string
  ): StoredSidEntry[] {
    const idx = prev.findIndex((e) => e.sid === sid && e.runId === runId);
    if (idx === -1) {
      const next: StoredSidEntry = {
        sid,
        runId,
        firstSeenAt: Date.now(),
        firstSeenViaTestCode: discoveredViaTestCode,
        firstSeenViaStatus: discoveredViaStatus,
        testsByCode: {},
        authByCode: {},
        allergyProfileSuppressedTotalIgE: allergyProfileSuppressedTotalIgE || false,
        suppressedTotalIgEValue: suppressedTotalIgEValue ?? undefined,
        suppressedTotalIgEUnit: suppressedTotalIgEUnit ?? undefined,
        authGateSkipped: authGateSkipped || false,
        authGateReason: authGateReason ?? undefined,
      };
      for (const t of tests) next.testsByCode[t.testCode] = t;
      return [...prev, next];
    }
    const prevRow = prev[idx]!;
    const merged: StoredSidEntry = {
      ...prevRow,
      testsByCode: { ...prevRow.testsByCode },
      authByCode: { ...(prevRow.authByCode ?? {}) },
      allergyProfileSuppressedTotalIgE:
        prevRow.allergyProfileSuppressedTotalIgE || Boolean(allergyProfileSuppressedTotalIgE),
      suppressedTotalIgEValue:
        suppressedTotalIgEValue != null
          ? suppressedTotalIgEValue
          : prevRow.suppressedTotalIgEValue,
      suppressedTotalIgEUnit:
        suppressedTotalIgEUnit != null && suppressedTotalIgEUnit !== ''
          ? suppressedTotalIgEUnit
          : prevRow.suppressedTotalIgEUnit,
      authGateSkipped: prevRow.authGateSkipped || Boolean(authGateSkipped),
      authGateReason: authGateReason != null && authGateReason !== '' ? authGateReason : prevRow.authGateReason,
    };
    for (const t of tests) merged.testsByCode[t.testCode] = t;
    const out = prev.slice();
    out[idx] = merged;
    return out;
  }

  const onWs = useCallback((ev: WsClientEvent) => {
    if (ev.type === 'LOG') {
      setLogs((prev) => [`[${new Date(ev.ts).toLocaleTimeString()}] ${ev.message}`, ...prev].slice(0, 200));
      return;
    }
    if (ev.type === 'RUN_STARTED') {
      setRunning(true);
      setLastRunId(ev.runId);
      return;
    }
    if (ev.type === 'SID_TEST_FOUND') {
      setEntries((prev) => {
        const out = upsertSidEntry(
          prev,
          ev.runId,
          ev.sid,
          ev.discoveredViaTestCode,
          ev.discoveredViaStatus,
          ev.tests,
          ev.allergyProfileSuppressedTotalIgE,
          ev.suppressedTotalIgEValue,
          ev.suppressedTotalIgEUnit,
          ev.authGateSkipped,
          ev.authGateReason
        );
        if (out.length > MAX_SID_ENTRIES) {
          return out.slice(-MAX_SID_ENTRIES);
        }
        return out;
      });
      return;
    }
    if (ev.type === 'SID_AUTH_DECISION') {
      setEntries((prev) => {
        const i = prev.findIndex((e) => e.sid === ev.sid && e.runId === ev.runId);
        if (i === -1) return prev;
        const row = prev[i]!;
        const authByCode = {
          ...row.authByCode,
          [ev.testCode]: {
            decision: ev.decision,
            reason: ev.reason,
            applied: ev.applied,
            saveClicked: ev.saveClicked,
            writeMode: ev.writeMode,
            ageMonths: ev.ageMonths,
            sex: ev.sex,
          },
        };
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
      return;
    }
    if (ev.type === 'SID_LIST_ARCHIVED') {
      setEntries([]);
      setSkippedDedup(0);
      const msg =
        ev.count > 0 && ev.archiveFile
          ? `Archived ${ev.count} SID row(s) to ${ev.archiveFile}`
          : 'SID list cleared (nothing was archived on disk)';
      setLogs((prev) => [`[${new Date(ev.archivedAt).toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));
      return;
    }
    if (ev.type === 'SCHEDULER_STATE') {
      setSchedulerRemote({
        enabled: ev.enabled,
        cooldownSeconds: ev.cooldownSeconds,
        status: ev.status,
        lastRunAt: ev.lastRunAt,
        nextRunAt: ev.nextRunAt,
        hasConfig: ev.hasConfig,
        headless: ev.headless,
      });
    }
  }, []);

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

  useEffect(() => {
    getScheduler()
      .then((s) => setSchedulerRemote(s))
      .catch(() => {
        /* dev server not up */
      });
  }, []);

  useEffect(() => {
    getActiveSids()
      .then((r) => setEntries(r.entries.slice(0, MAX_SID_ENTRIES)))
      .catch(() => {
        /* dev server not up */
      });
  }, []);

  const canStart = useMemo(() => {
    return atLeastOneTestCodeOn(enabled) && statusSelection.length > 0;
  }, [enabled, statusSelection]);

  const buildCurrentRunConfig = useCallback((): RunConfig => {
    const testCodes = selectedTestCodesInOrder(enabled);
    return buildRunConfig(testCodes, bu, statusSelection, fromDate, toDate, fromHour, toHour, authenticate, headed);
  }, [enabled, bu, statusSelection, fromDate, toDate, fromHour, toHour, authenticate, headed]);

  const onStart = async () => {
    setErr(null);
    const config = buildCurrentRunConfig();
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

  const onArchive = useCallback(async () => {
    setErr(null);
    try {
      await postArchiveSids();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="sp-app-bg" aria-hidden>
        <div className="sp-mesh-blob sp-mesh-blob-1" />
        <div className="sp-mesh-blob sp-mesh-blob-2" />
        <div className="sp-mesh-blob sp-mesh-blob-3" />
        <div className="sp-mesh-blob sp-mesh-blob-4" />
        <div className="sp-mesh-blob sp-mesh-blob-5" />
      </div>
      <div className="sp-vignette" aria-hidden />

      <main className="relative z-0 mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5 lg:px-8">
        <header className="shrink-0 border-b border-zinc-800/50 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-7 w-7 shrink-0 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]"
              >
                <path d="M12 1l1.6 7.4L21 10l-7.4 1.6L12 19l-1.6-7.4L3 10l7.4-1.6z" fill="currentColor" />
                <circle cx="12" cy="12" r="1.4" fill="#0a0a0f" />
              </svg>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">Stellar Polaris</h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              {running ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400/90">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  Scan in progress
                </span>
              ) : null}
              {lastRunId ? (
                <p className="max-w-[min(100%,12rem)] truncate font-mono text-[10px] text-zinc-500 sm:max-w-xs sm:text-right">
                  Run: {lastRunId}
                </p>
              ) : null}
            </div>
          </div>
          {err ? (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {err}
            </p>
          ) : null}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] gap-3 overflow-hidden lg:grid-cols-[minmax(220px,17rem)_1fr] lg:grid-rows-1 lg:items-stretch lg:gap-4">
          {/* Left rail: test codes + mode + run + toggles + whatsapp (whatsapp UI-only) */}
          <aside className="glass-panel flex h-full min-h-0 w-full min-w-0 max-w-full flex-col gap-3 overflow-y-auto rounded-2xl border p-4 lg:max-h-full">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Test codes</h2>
              <p className="text-[10px] leading-relaxed text-zinc-500">
                Order: BI235 → BI005 → BI133 → BI180 → BI036
              </p>
            </div>
            <TestCodeToggles
              enabled={enabled}
              onChange={(id, v) => setEnabled((e) => ({ ...e, [id]: v }))}
            />
            <div className="h-px bg-zinc-800/80" />
            <ModeToggle authenticate={authenticate} onAuthenticate={setAuthenticate} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <MiniToggle headless={!headed} onHeadless={(h) => setHeaded(!h)} className="justify-between sm:justify-start" />
            </div>
            <div className="h-px bg-zinc-800/80" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Integrations</p>
              <div className="mt-1.5">
                <ControlTile
                  id="wa-toggle"
                  accent="WA"
                  label="WhatsApp"
                  sublabel="Alerts (coming soon)"
                  selected={whatsappEnabled}
                  onToggle={() => setWhatsappEnabled((v) => !v)}
                />
              </div>
            </div>
            <div className="h-px bg-zinc-800/80" />
            <RunControls
              className="pt-0.5"
              running={running}
              canStart={canStart}
              onStart={onStart}
              onStop={onStop}
            />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="grid shrink-0 gap-3 lg:grid-cols-2">
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
                className="min-h-0"
              />
              <SchedulerCard
                className="min-h-0"
                buildConfig={buildCurrentRunConfig}
                remote={schedulerRemote}
                onError={(m) => setErr(m)}
              />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
              <div className="flex shrink-0 items-center gap-1">
                <ViewTabButton
                  id="tab-results"
                  active={activeView === 'results'}
                  onClick={() => setActiveView('results')}
                >
                  Results
                </ViewTabButton>
                <ViewTabButton
                  id="tab-logs"
                  active={activeView === 'logs'}
                  onClick={() => setActiveView('logs')}
                >
                  Logs
                  {logs.length > 0 ? (
                    <span className="ml-1.5 font-mono text-zinc-500">({logs.length})</span>
                  ) : null}
                </ViewTabButton>
              </div>

              <div className="relative min-h-0 min-w-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  {activeView === 'results' ? (
                    <motion.div
                      key="results"
                      className="absolute inset-0 flex min-h-0 min-w-0 flex-col"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <SidGrid
                        className="h-full min-h-0"
                        entries={entries}
                        skippedDedup={skippedDedup}
                        summary={summary}
                        atCapacity={entries.length >= MAX_SID_ENTRIES}
                        running={running}
                        onArchive={onArchive}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="logs"
                      className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="glass-panel flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border p-4">
                        <h3 className="shrink-0 text-sm font-semibold text-zinc-200">Logs (latest first)</h3>
                        {logs.length === 0 ? (
                          <p className="mt-2 shrink-0 text-sm text-zinc-500">No log lines yet.</p>
                        ) : (
                          <ul className="mt-2 min-h-0 flex-1 list-none space-y-0.5 overflow-y-auto font-mono text-xs leading-relaxed text-zinc-400 [scrollbar-gutter:stable]">
                            {logs.map((l, i) => (
                              <li key={i} className="break-words border-b border-zinc-800/40 py-1 last:border-0">
                                {l}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

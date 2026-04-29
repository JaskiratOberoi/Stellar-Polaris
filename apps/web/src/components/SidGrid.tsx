import { useMemo, useState } from 'react';
import type { SidAuthRecord, StoredSidEntry, TestCodeId, WorksheetTestHit } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function shortRunId(runId: string): string {
  return runId.length > 12 ? `${runId.slice(0, 8)}…` : runId;
}

const TEST_CODE_ORDER: TestCodeId[] = ['BI235', 'BI005', 'BI133', 'BI180', 'BI036'];

/** @deprecated Use StoredSidEntry from @stellar/shared */
export type SidEntry = StoredSidEntry;

export type SidGridProps = {
  entries: StoredSidEntry[];
  skippedDedup: number;
  summary: { uniqueSids: number; modalsOpened: number; modalsSkipped: number } | null;
  /** When true, the list is at the UI cap (oldest SIDs may have been dropped). */
  atCapacity?: boolean;
  className?: string;
  running?: boolean;
  onArchive?: () => void | Promise<void>;
};

/** A row from the modal counts as present if we have a hit object, even with empty `value` (e.g. not yet reported). */
function hasModalHit(hit: WorksheetTestHit | undefined): boolean {
  return hit != null;
}

function valueDisplayText(hit: WorksheetTestHit): string {
  const v = hit.value;
  if (v == null) return '—';
  const t = String(v).trim();
  return t === '' ? '—' : t;
}

function dotClass(hit: WorksheetTestHit): string {
  if (hit.borderColor === 'red' || hit.abnormal === true) return 'bg-red-500';
  if (hit.borderColor === 'green' || hit.abnormal === false) return 'bg-emerald-500';
  return 'bg-zinc-500';
}

/** Renders a test the modal actually returned a row for (value may still be empty). */
function TestPill({ code, hit }: { code: TestCodeId; hit: WorksheetTestHit }) {
  const label = TEST_CODE_LABELS[code];
  const hasValue = hit.value != null && String(hit.value).trim() !== '';
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg border border-zinc-600/50 bg-zinc-900/50 px-2 py-1 text-xs text-zinc-200 shadow-sm backdrop-blur-sm"
      title={hit.normalRange ? `Normal range: ${hit.normalRange}` : `${label} (${code})`}
    >
      <span className={cn('h-2 w-2 rounded-full', dotClass(hit))} />
      <span className="font-medium text-zinc-100">{label}</span>
      <span className="font-mono text-zinc-500">{code}</span>
      <span className="text-zinc-500">·</span>
      <span
        className={cn('font-mono tabular-nums', hasValue ? 'text-amber-300' : 'text-zinc-500')}
      >
        {valueDisplayText(hit)}
        {hit.unit ? <span className="ml-1 text-zinc-400">{hit.unit}</span> : null}
      </span>
      {hit.authorized ? (
        <span className="ml-1 rounded bg-emerald-900/50 px-1.5 py-px text-[10px] uppercase tracking-wide text-emerald-300">
          Auth
        </span>
      ) : null}
    </span>
  );
}

function AuthWorkflowBadge({ code, r }: { code: TestCodeId; r: SidAuthRecord }) {
  const t = r.reason;
  const label = TEST_CODE_LABELS[code];
  if (r.decision === 'already-authed') {
    return (
      <span
        className="inline-flex rounded border border-emerald-800 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] text-emerald-200"
        title={t}
      >
        {label} · prior AUTH
      </span>
    );
  }
  if (r.decision === 'defer') {
    return (
      <span
        className="inline-flex rounded border border-sky-800 bg-sky-950/50 px-1.5 py-0.5 text-[10px] text-sky-200"
        title={t}
      >
        {label} · PENDING
      </span>
    );
  }
  if (r.decision === 'skip') {
    return (
      <span
        className="inline-flex rounded border border-zinc-700 bg-zinc-900/50 px-1.5 py-0.5 text-[10px] text-zinc-400"
        title={t}
      >
        {label} · REVIEW
      </span>
    );
  }
  if (r.decision === 'auth') {
    if (!r.writeMode) {
      return (
        <span
          className="inline-flex rounded border border-dashed border-emerald-500/50 px-1.5 py-0.5 text-[10px] text-emerald-300/80"
          title={t}
        >
          {label} · would AUTH
        </span>
      );
    }
    if (r.applied) {
      return (
        <span
          className="inline-flex rounded border border-emerald-700 bg-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-200"
          title={t + (r.saveClicked ? ' · saved' : '')}
        >
          {label} · AUTH{!r.saveClicked ? ' (no save)' : ''}
        </span>
      );
    }
    return (
      <span
        className="inline-flex rounded border border-red-900/60 bg-red-950/30 px-1.5 py-0.5 text-[10px] text-red-300"
        title={t}
      >
        {label} · AUTH failed
      </span>
    );
  }
  if (r.decision === 'auth-inline-comment') {
    if (!r.writeMode) {
      return (
        <span
          className="inline-flex rounded border border-dashed border-cyan-500/50 px-1.5 py-0.5 text-[10px] text-cyan-200/80"
          title={t}
        >
          {label} · would AUTH+inline
        </span>
      );
    }
    if (r.applied) {
      return (
        <span
          className="inline-flex rounded border border-cyan-700 bg-cyan-950/50 px-1.5 py-0.5 text-[10px] text-cyan-200"
          title={t + (r.saveClicked ? ' · saved' : '')}
        >
          {label} · AUTH + inline
        </span>
      );
    }
    return (
      <span
        className="inline-flex rounded border border-red-900/60 bg-red-950/30 px-1.5 py-0.5 text-[10px] text-red-300"
        title={t}
      >
        {label} · AUTH + inline failed
      </span>
    );
  }
  if (r.decision === 'high-comment') {
    if (!r.writeMode) {
      return (
        <span
          className="inline-flex rounded border border-dashed border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-200/80"
          title={t}
        >
          {label} · would HIGH+cmt
        </span>
      );
    }
    if (r.applied) {
      return (
        <span
          className="inline-flex rounded border border-amber-800 bg-amber-950/50 px-1.5 py-0.5 text-[10px] text-amber-200"
          title={t + (r.saveClicked ? ' · saved' : ' · comment line already present or no save needed')}
        >
          {label} · HIGH +cmt
        </span>
      );
    }
    return (
      <span
        className="inline-flex rounded border border-red-900/60 bg-red-950/30 px-1.5 py-0.5 text-[10px] text-red-300"
        title={t}
      >
        {label} · comment failed
      </span>
    );
  }
  return null;
}

function AuthGateBadge({ reason }: { reason?: string }) {
  const t =
    reason?.trim() ||
    'This worksheet is not limited to B12, Vit D, B12+Vit D, or solo Total IgE; authentication is skipped.';
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded border border-amber-500/45 bg-amber-950/35 px-1.5 py-0.5 text-[10px] text-amber-200/95"
      title={t}
    >
      <span className="font-medium">Auth gate</span>
      <span className="text-amber-400/90">·</span>
      <span>skip</span>
      <span className="text-amber-300/80">· other tests present / mixed panel</span>
    </span>
  );
}

function AllergyProfileIgEBadge({
  value,
  unit,
}: {
  value?: string | null;
  unit?: string | null;
}) {
  const v = value != null && String(value).trim() !== '' ? String(value).trim() : null;
  const t = v
    ? `Total IgE ${v}${unit ? ' ' + unit : ''} is inside an Allergy Profile; automated IgE auth and high-IgE comment are skipped.`
    : 'This SID includes an Allergy Profile; Total IgE is not processed separately (no automated IgE auth or comment).';
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded border border-violet-500/50 bg-violet-950/40 px-1.5 py-0.5 text-[10px] text-violet-200/95"
      title={t}
    >
      <span className="font-medium">Total IgE</span>
      <span className="text-violet-400/90">·</span>
      <span>Allergy Profile</span>
      {v ? (
        <span className="font-mono text-amber-200/90 tabular-nums">
          {v}
          {unit ? <span className="ml-0.5 text-violet-300/80">{unit}</span> : null}
        </span>
      ) : null}
      <span className="text-violet-300/80">· auth N/A</span>
    </span>
  );
}

export function SidGrid({
  entries,
  skippedDedup,
  summary,
  atCapacity,
  className,
  running,
  onArchive,
}: SidGridProps) {
  const [hideAuthGateSkips, setHideAuthGateSkips] = useState(false);
  const authGateSkipCount = useMemo(
    () => entries.reduce((n, e) => n + (e.authGateSkipped ? 1 : 0), 0),
    [entries]
  );
  const visibleEntries = useMemo(
    () => (hideAuthGateSkips ? entries.filter((e) => !e.authGateSkipped) : entries),
    [entries, hideAuthGateSkips]
  );

  if (entries.length === 0) {
    return (
      <Card
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden border-dashed border-zinc-600/50 bg-zinc-950/30 shadow-[0_0_0_1px_rgba(24,24,27,0.3)]',
          className
        )}
      >
        <CardHeader className="shrink-0">
          <CardTitle className="text-lg font-semibold tracking-tight">Results</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <p className="text-sm leading-relaxed text-zinc-500">
            No SIDs in the active list. They accumulate across runs on the server until you archive. Start a run or load
            a previous session.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden border-zinc-700/50 bg-gradient-to-b from-zinc-900/40 to-zinc-950/80 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]',
        className
      )}
    >
      <CardHeader className="shrink-0 border-b border-zinc-800/60 bg-zinc-950/40 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold tracking-tight text-zinc-50">Results</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-200/90">
                {hideAuthGateSkips && authGateSkipCount > 0
                  ? `${visibleEntries.length} of ${entries.length} active`
                  : `${entries.length} active`}
                {skippedDedup > 0 ? ` · ${skippedDedup} dedup` : ''}
              </span>
              {hideAuthGateSkips && authGateSkipCount > 0 ? (
                <span
                  className="inline-flex items-center rounded-full border border-zinc-600/80 bg-zinc-900/60 px-2.5 py-0.5 text-[11px] text-zinc-400"
                  title="SIDs where the auth gate skipped (mixed panel / other tests) are hidden from the grid"
                >
                  {authGateSkipCount} gate skip{authGateSkipCount === 1 ? '' : 's'} hidden
                </span>
              ) : null}
              {summary ? (
                <span className="inline-flex items-center rounded-full border border-zinc-700/60 bg-zinc-900/50 px-2.5 py-0.5 text-[11px] text-zinc-400">
                  Last run: {summary.uniqueSids} SIDs · {summary.modalsOpened} modals · {summary.modalsSkipped} skip
                </span>
              ) : null}
              {atCapacity ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/40 px-2.5 py-0.5 text-[11px] text-amber-300/90">
                  Capped at {entries.length} rows
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {onArchive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-zinc-600 text-zinc-200 hover:bg-zinc-800/80"
                disabled={running || entries.length === 0}
                onClick={() => void onArchive()}
              >
                Archive list
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={hideAuthGateSkips}
              title={
                authGateSkipCount === 0
                  ? 'No auth-gate skips in the list'
                  : hideAuthGateSkips
                    ? 'Show SIDs where the auth gate skipped again'
                    : 'Hide SIDs where the auth gate skipped (other tests / mixed panel) so you only see rows that can run auth'
              }
              className={cn(
                'border-zinc-600 text-zinc-200',
                hideAuthGateSkips
                  ? 'border-amber-500/45 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
                  : 'hover:bg-zinc-800/80',
                authGateSkipCount === 0 && 'opacity-50'
              )}
              disabled={authGateSkipCount === 0}
              onClick={() => setHideAuthGateSkips((v) => !v)}
            >
              {hideAuthGateSkips ? 'Show gate skips' : 'Hide gate skips'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-0 [scrollbar-gutter:stable]">
        <ul className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {visibleEntries.length === 0 ? (
            <li className="col-span-full rounded-xl border border-dashed border-zinc-700/60 bg-zinc-950/20 px-4 py-8 text-center text-sm text-zinc-500">
              No cards in this view. All {entries.length} SID{entries.length === 1 ? '' : 's'} in the list {entries.length === 1 ? 'is' : 'are'} auth-gate skips. Choose{' '}
              <span className="font-medium text-zinc-400">Show gate skips</span> to see them.
            </li>
          ) : null}
          {visibleEntries.map((e) => (
            <li
              key={`${e.runId}-${e.sid}`}
              className="group flex flex-col gap-2 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3 transition-colors hover:border-zinc-700/80"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-mono text-[15px] font-medium tracking-tight text-amber-300/95 tabular-nums">
                  {e.sid}
                </span>
                <span className="text-[11px] leading-relaxed text-zinc-500">
                  {shortRunId(e.runId)} · {new Date(e.firstSeenAt).toLocaleString()} · {e.firstSeenViaTestCode} ·{' '}
                  {e.firstSeenViaStatus}
                </span>
              </div>
              <div className="flex min-h-0 min-w-0 flex-col items-stretch gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {TEST_CODE_ORDER.filter((code) => hasModalHit(e.testsByCode[code])).map((code) => (
                    <TestPill key={code} code={code} hit={e.testsByCode[code]!} />
                  ))}
                </div>
                {e.allergyProfileSuppressedTotalIgE ||
                e.authGateSkipped ||
                (e.authByCode && Object.keys(e.authByCode).length > 0) ? (
                  <div className="flex flex-wrap gap-1">
                    {e.authGateSkipped ? <AuthGateBadge reason={e.authGateReason} /> : null}
                    {e.allergyProfileSuppressedTotalIgE ? (
                      <AllergyProfileIgEBadge value={e.suppressedTotalIgEValue} unit={e.suppressedTotalIgEUnit} />
                    ) : null}
                    {e.authByCode && Object.keys(e.authByCode).length > 0
                      ? (Object.entries(e.authByCode) as [TestCodeId, SidAuthRecord][])
                          .filter(([, rec]) => rec)
                          .map(([code, rec]) => (
                            <AuthWorkflowBadge key={`auth-${code}`} code={code} r={rec} />
                          ))
                      : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

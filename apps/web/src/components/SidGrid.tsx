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
      className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-200"
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
  if (entries.length === 0) {
    return (
      <Card className={cn('border-dashed border-zinc-700', className)}>
        <CardHeader>
          <CardTitle className="text-base">Sample IDs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">
            No SIDs in the active list. They accumulate across runs on the server until you archive. Start a run or
            load a previous session.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-zinc-800', className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Sample IDs{' '}
              <span className="text-sm font-normal text-zinc-500">
                ({entries.length} active row(s)
                {skippedDedup > 0 ? `, ${skippedDedup} dedup-skipped this run` : ''})
              </span>
            </CardTitle>
            <p className="mt-1 text-xs text-zinc-500">
              Rows are kept across runs (one row per sample per run). Use Archive to clear the grid and save a JSONL
              snapshot under your server data directory for audit.
            </p>
            {summary ? (
              <p className="mt-1 text-xs text-zinc-500">
                Last run summary: {summary.uniqueSids} unique SID(s), {summary.modalsOpened} modal(s) opened,{' '}
                {summary.modalsSkipped} skipped via dedup.
              </p>
            ) : null}
            {atCapacity ? (
               <p className="mt-1 text-xs text-amber-500/90">
                 Showing latest {entries.length} rows in this view; older rows may have been trimmed client-side.
                </p>
              ) : null}
          </div>
          {onArchive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-zinc-600 text-zinc-200 hover:bg-zinc-800"
              disabled={running || entries.length === 0}
              onClick={() => void onArchive()}
            >
              Archive list
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-zinc-800">
          {entries.map((e) => (
            <li
              key={`${e.runId}-${e.sid}`}
              className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <span className="font-mono text-sm text-amber-400/90 tabular-nums">{e.sid}</span>
                <span className="text-[11px] text-zinc-500">
                  run {shortRunId(e.runId)} · seen {new Date(e.firstSeenAt).toLocaleString()} · via{' '}
                  {e.firstSeenViaTestCode} · {e.firstSeenViaStatus}
                </span>
              </div>
              <div className="flex min-h-[1.75rem] flex-col items-stretch gap-1.5 sm:items-end">
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  {TEST_CODE_ORDER.filter((code) => hasModalHit(e.testsByCode[code])).map((code) => (
                    <TestPill key={code} code={code} hit={e.testsByCode[code]!} />
                  ))}
                </div>
                {e.allergyProfileSuppressedTotalIgE ||
                e.authGateSkipped ||
                (e.authByCode && Object.keys(e.authByCode).length > 0) ? (
                  <div className="flex flex-wrap justify-end gap-1">
                    {e.authGateSkipped ? <AuthGateBadge reason={e.authGateReason} /> : null}
                    {e.allergyProfileSuppressedTotalIgE ? (
                      <AllergyProfileIgEBadge
                        value={e.suppressedTotalIgEValue}
                        unit={e.suppressedTotalIgEUnit}
                      />
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

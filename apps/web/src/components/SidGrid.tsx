import type { TestCodeId, WorksheetTestHit } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TEST_CODE_ORDER: TestCodeId[] = ['BI235', 'BI005'];

export type SidEntry = {
  sid: string;
  firstSeenViaTestCode: TestCodeId;
  firstSeenViaStatus: string;
  testsByCode: Partial<Record<TestCodeId, WorksheetTestHit>>;
};

export type SidGridProps = {
  entries: SidEntry[];
  skippedDedup: number;
  summary: { uniqueSids: number; modalsOpened: number; modalsSkipped: number } | null;
  className?: string;
};

function dotClass(hit: WorksheetTestHit | undefined): string {
  if (!hit) return 'bg-zinc-700';
  if (hit.borderColor === 'red' || hit.abnormal === true) return 'bg-red-500';
  if (hit.borderColor === 'green' || hit.abnormal === false) return 'bg-emerald-500';
  return 'bg-zinc-500';
}

function TestPill({ code, hit }: { code: TestCodeId; hit: WorksheetTestHit | undefined }) {
  const label = TEST_CODE_LABELS[code];
  if (!hit) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-xs text-zinc-500"
        title={`${label} (${code}) — not present in this SID's worksheet`}
      >
        <span className={cn('h-2 w-2 rounded-full', dotClass(undefined))} />
        <span>{label}</span>
        <span className="font-mono text-zinc-600">{code}</span>
        <span className="text-zinc-600">—</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-200"
      title={hit.normalRange ? `Normal range: ${hit.normalRange}` : `${label} (${code})`}
    >
      <span className={cn('h-2 w-2 rounded-full', dotClass(hit))} />
      <span className="font-medium text-zinc-100">{label}</span>
      <span className="font-mono text-zinc-500">{code}</span>
      <span className="text-zinc-500">·</span>
      <span className="font-mono tabular-nums text-amber-300">
        {hit.value ?? '—'}
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

export function SidGrid({ entries, skippedDedup, summary, className }: SidGridProps) {
  if (entries.length === 0) {
    return (
      <Card className={cn('border-dashed border-zinc-700', className)}>
        <CardHeader>
          <CardTitle className="text-base">Sample IDs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">No SIDs yet — start a run or check filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-zinc-800', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Sample IDs{' '}
          <span className="text-sm font-normal text-zinc-500">
            ({entries.length} unique
            {skippedDedup > 0 ? `, ${skippedDedup} dedup-skipped` : ''})
          </span>
        </CardTitle>
        {summary ? (
          <p className="text-xs text-zinc-500">
            Run summary: {summary.uniqueSids} unique SID(s), {summary.modalsOpened} modal(s) opened,{' '}
            {summary.modalsSkipped} skipped via dedup.
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-zinc-800">
          {entries.map((e) => (
            <li
              key={e.sid}
              className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <span className="font-mono text-sm text-amber-400/90 tabular-nums">{e.sid}</span>
                <span className="text-[11px] text-zinc-500">
                  via {e.firstSeenViaTestCode} · {e.firstSeenViaStatus}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TEST_CODE_ORDER.map((code) => (
                  <TestPill key={code} code={code} hit={e.testsByCode[code]} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

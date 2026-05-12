import type { SidCountersSnapshot, TestCodeId } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { cn } from '@/lib/utils';

const ORDER: TestCodeId[] = ['BI235', 'BI005', 'BI133', 'BI180', 'BI036', 'MS111', 'BI034', 'BI181', 'CP004'];

export type SidCounterStripProps = {
  snapshot: SidCountersSnapshot | null;
  testCodeFilter: TestCodeId | null;
  onTestCodeFilterChange: (code: TestCodeId | null) => void;
  className?: string;
};

export function SidCounterStrip({
  snapshot,
  testCodeFilter,
  onTestCodeFilterChange,
  className,
}: SidCounterStripProps) {
  if (!snapshot) {
    return (
      <div
        className={cn(
          'glass-panel shrink-0 rounded-xl border border-zinc-800/60 bg-zinc-950/35 px-3 py-2',
          className
        )}
      >
        <p className="text-[11px] text-zinc-500">Loading server totals (worked-on since last archive)…</p>
      </div>
    );
  }

  const totalAuth = ORDER.reduce((n, c) => n + snapshot.perCode[c].authApplied, 0);
  const totalHigh = ORDER.reduce((n, c) => n + snapshot.perCode[c].highCommentApplied, 0);

  return (
    <div
      className={cn(
        'glass-panel shrink-0 rounded-xl border border-zinc-800/60 bg-zinc-950/35 px-3 py-2.5',
        className
      )}
      title="Unbounded server counts from auth / high-comment decisions. Not limited to the 2,000 visible result cards."
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Worked-on</span>
        <span className="text-[10px] text-zinc-600">·</span>
        <span className="text-[10px] text-zinc-500">
          Since {new Date(snapshot.since).toLocaleString()} ·{' '}
          <span className="font-mono text-zinc-400">{snapshot.totalWorkedOnSids}</span> distinct SIDs
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onTestCodeFilterChange(null)}
          className={cn(
            'rounded-lg border px-2 py-0.5 text-[11px] transition-colors',
            testCodeFilter == null
              ? 'border-amber-500/45 bg-amber-500/10 text-amber-100'
              : 'border-zinc-700/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
          )}
        >
          All
        </button>
        {ORDER.map((code) => {
          const st = snapshot.perCode[code];
          const n = st.workedOn;
          const active = testCodeFilter === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onTestCodeFilterChange(code)}
              title={`${TEST_CODE_LABELS[code]}: ${n} worked-on (auth ${st.authApplied}, high-cmt ${st.highCommentApplied})`}
              className={cn(
                'rounded-lg border px-2 py-0.5 text-[11px] transition-colors',
                active
                  ? 'border-sky-500/45 bg-sky-500/10 text-sky-100'
                  : n === 0
                    ? 'border-zinc-800/80 bg-zinc-950/30 text-zinc-600'
                    : 'border-zinc-700/80 bg-zinc-900/40 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100'
              )}
            >
              <span className="font-medium">{TEST_CODE_LABELS[code]}</span>{' '}
              <span className="font-mono tabular-nums text-amber-300/90">{n}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-zinc-500">
        Auth (incl. filled / inline){' '}
        <span className="text-zinc-400">{totalAuth}</span>
        <span className="text-zinc-600"> · </span>
        High + comment <span className="text-zinc-400">{totalHigh}</span>
        <span className="text-zinc-600"> · </span>
        <span className="text-zinc-600">not capped by UI card limit</span>
      </p>
    </div>
  );
}

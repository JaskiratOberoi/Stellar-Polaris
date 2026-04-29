import { useEffect, useState } from 'react';
import { getStatusOptions } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Duplicated for client bundle (server has config/statuses). */
const DEFAULT_STATUSES: readonly string[] = ['Tested', 'Partially Tested'];
const FALLBACK_STATUS_OPTIONS: readonly string[] = [
  'Partially Tested',
  'Tested',
  'Partially Authorized',
  'Authorized',
  'Printed',
];

function filterDefaultOrAll(options: string[]): string[] {
  const d = new Set(DEFAULT_STATUSES);
  const haveBoth = d.size === 2 && options.includes('Tested') && options.includes('Partially Tested');
  if (haveBoth) {
    return ['Tested', 'Partially Tested'];
  }
  return options.filter((o) => d.has(o)).length
    ? options.filter((o) => d.has(o))
    : [...options].slice(0, 2);
}

function StatusPill({
  opt,
  on,
  onClick,
}: {
  opt: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
        on
          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100 shadow-[0_0_12px_-4px_rgba(16,185,129,0.4)]'
          : 'border-zinc-700/80 bg-zinc-950/30 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
      )}
    >
      {opt}
    </button>
  );
}

export function FiltersPanel(props: {
  businessUnit: string;
  onBusinessUnit: (v: string) => void;
  statusSelection: string[];
  onStatusSelection: (s: string[]) => void;
  fromDate: string;
  toDate: string;
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  fromHour: string;
  toHour: string;
  onFromHour: (v: string) => void;
  onToHour: (v: string) => void;
  className?: string;
}) {
  const {
    businessUnit,
    onBusinessUnit,
    statusSelection,
    onStatusSelection,
    fromDate,
    toDate,
    onFromDate,
    onToDate,
    fromHour,
    toHour,
    onFromHour,
    onToHour,
    className,
  } = props;
  const [allOptions, setAllOptions] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    getStatusOptions()
      .then((opts: string[]) => {
        setAllOptions(opts);
        if (statusSelection.length === 0) {
          onStatusSelection(filterDefaultOrAll(opts));
        }
        setLoadErr(null);
      })
      .catch(() => {
        setLoadErr('Could not load status list (is the server up?)');
        setAllOptions([...FALLBACK_STATUS_OPTIONS]);
      });
  }, []);

  const toggle = (opt: string) => {
    if (statusSelection.includes(opt)) {
      onStatusSelection(statusSelection.filter((s) => s !== opt));
    } else {
      onStatusSelection([...statusSelection, opt]);
    }
  };

  const inputCls =
    'h-8 w-full min-w-0 rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30';

  return (
    <div className={cn('glass-panel flex min-h-0 min-w-0 flex-col rounded-2xl border p-4', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Worksheet filters</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
          BU, status, optional date range (DD/MM/YYYY) and hours (0–23).
        </p>
      </div>
      {loadErr ? <p className="mt-2 text-xs text-amber-500/90">{loadErr}</p> : null}
      <div className="mt-3 space-y-3">
        <div>
          <Label htmlFor="bu" className="text-[10px] uppercase tracking-widest text-zinc-500">
            Business unit
          </Label>
          <input
            id="bu"
            className={cn('mt-1.5', inputCls)}
            value={businessUnit}
            onChange={(e) => onBusinessUnit(e.target.value)}
            placeholder="QUGEN"
            autoComplete="off"
          />
        </div>
        <div>
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Status</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {allOptions.map((opt) => (
              <StatusPill key={opt} opt={opt} on={statusSelection.includes(opt)} onClick={() => toggle(opt)} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <Label htmlFor="fdate" className="text-[10px] text-zinc-500">
              From
            </Label>
            <input
              id="fdate"
              className={cn('mt-1', inputCls)}
              value={fromDate}
              onChange={(e) => onFromDate(e.target.value)}
              placeholder="DD/MM/YYYY"
            />
          </div>
          <div>
            <Label htmlFor="tdate" className="text-[10px] text-zinc-500">
              To
            </Label>
            <input
              id="tdate"
              className={cn('mt-1', inputCls)}
              value={toDate}
              onChange={(e) => onToDate(e.target.value)}
              placeholder="DD/MM/YYYY"
            />
          </div>
          <div>
            <Label htmlFor="fhour" className="text-[10px] text-zinc-500">
              From h
            </Label>
            <input
              id="fhour"
              className={cn('mt-1', inputCls)}
              value={fromHour}
              onChange={(e) => onFromHour(e.target.value)}
              type="number"
              min={0}
              max={23}
            />
          </div>
          <div>
            <Label htmlFor="thour" className="text-[10px] text-zinc-500">
              To h
            </Label>
            <input
              id="thour"
              className={cn('mt-1', inputCls)}
              value={toHour}
              onChange={(e) => onToHour(e.target.value)}
              type="number"
              min={0}
              max={23}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

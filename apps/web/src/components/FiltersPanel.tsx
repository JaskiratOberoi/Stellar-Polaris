import { useEffect, useState } from 'react';
import { getStatusOptions } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

  const toggle = (opt: string, on: boolean) => {
    if (on) {
      if (!statusSelection.includes(opt)) onStatusSelection([...statusSelection, opt]);
    } else {
      onStatusSelection(statusSelection.filter((s) => s !== opt));
    }
  };

  return (
    <Card className={cn('border-zinc-800', className)}>
      <CardHeader>
        <CardTitle>Worksheet filters</CardTitle>
        <CardDescription>Match the LIS sample worksheet: BU, status, and optional date/time range (DD/MM/YYYY).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadErr && <p className="text-sm text-amber-500">{loadErr}</p>}
        <div className="grid gap-2">
          <Label htmlFor="bu">Business unit</Label>
          <input
            id="bu"
            className="h-9 rounded-md border border-zinc-600 bg-zinc-950 px-3 text-sm text-zinc-100"
            value={businessUnit}
            onChange={(e) => onBusinessUnit(e.target.value)}
            placeholder="QUGEN"
          />
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">Status (one or more)</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {allOptions.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-zinc-300">
                <Checkbox
                  checked={statusSelection.includes(opt)}
                  onCheckedChange={(c: boolean | 'indeterminate') => toggle(opt, c === true)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="fdate">From date</Label>
            <input
              id="fdate"
              className="h-9 rounded-md border border-zinc-600 bg-zinc-950 px-3 text-sm"
              value={fromDate}
              onChange={(e) => onFromDate(e.target.value)}
              placeholder="DD/MM/YYYY"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tdate">To date</Label>
            <input
              id="tdate"
              className="h-9 rounded-md border border-zinc-600 bg-zinc-950 px-3 text-sm"
              value={toDate}
              onChange={(e) => onToDate(e.target.value)}
              placeholder="DD/MM/YYYY"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="fhour">From hour (0–23, optional)</Label>
            <input
              id="fhour"
              className="h-9 rounded-md border border-zinc-600 bg-zinc-950 px-3 text-sm"
              value={fromHour}
              onChange={(e) => onFromHour(e.target.value)}
              type="number"
              min={0}
              max={23}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="thour">To hour (0–23, optional)</Label>
            <input
              id="thour"
              className="h-9 rounded-md border border-zinc-600 bg-zinc-950 px-3 text-sm"
              value={toHour}
              onChange={(e) => onToHour(e.target.value)}
              type="number"
              min={0}
              max={23}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

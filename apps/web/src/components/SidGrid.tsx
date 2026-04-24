import type { TestCodeId } from '@stellar/shared';
import { TEST_CODE_LABELS } from '@stellar/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type SidRow = {
  testCode: TestCodeId;
  status: string;
  sid: string;
};

const TEST_CODE_ORDER: TestCodeId[] = ['BI235', 'BI005'];

type SidGroup = {
  sid: string;
  /** key = `${testCode}|${status}` to dedupe duplicates from re-runs/pagination overlap */
  hits: Map<string, { testCode: TestCodeId; status: string }>;
};

function groupBySid(rows: SidRow[]): SidGroup[] {
  const order: string[] = [];
  const map = new Map<string, SidGroup>();
  for (const r of rows) {
    let g = map.get(r.sid);
    if (!g) {
      g = { sid: r.sid, hits: new Map() };
      map.set(r.sid, g);
      order.push(r.sid);
    }
    g.hits.set(`${r.testCode}|${r.status}`, { testCode: r.testCode, status: r.status });
  }
  return order.map((sid) => map.get(sid)!);
}

function sortedHits(g: SidGroup): { testCode: TestCodeId; status: string }[] {
  return [...g.hits.values()].sort((a, b) => {
    const ai = TEST_CODE_ORDER.indexOf(a.testCode);
    const bi = TEST_CODE_ORDER.indexOf(b.testCode);
    if (ai !== bi) return ai - bi;
    return a.status.localeCompare(b.status);
  });
}

export function SidGrid(props: { rows: SidRow[]; className?: string }) {
  const { rows, className } = props;

  if (rows.length === 0) {
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

  const groups = groupBySid(rows);

  return (
    <Card className={cn('border-zinc-800', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Sample IDs <span className="text-sm font-normal text-zinc-500">({groups.length} unique)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-zinc-800">
          {groups.map((g) => {
            const hits = sortedHits(g);
            return (
              <li key={g.sid} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono text-sm text-amber-400/90 tabular-nums">{g.sid}</span>
                <div className="flex flex-wrap gap-1.5">
                  {hits.map((h) => (
                    <span
                      key={`${h.testCode}|${h.status}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-xs text-zinc-300"
                      title={`${TEST_CODE_LABELS[h.testCode]} (${h.testCode}) — ${h.status}`}
                    >
                      <span className="font-medium text-zinc-100">{TEST_CODE_LABELS[h.testCode]}</span>
                      <span className="font-mono text-zinc-500">{h.testCode}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{h.status}</span>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

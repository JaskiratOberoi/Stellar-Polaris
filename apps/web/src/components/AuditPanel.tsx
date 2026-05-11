import { useEffect, useMemo, useState } from 'react';
import type { StoredSidEntry, TestCodeId } from '@stellar/shared';
import { getSidArchive, getSidArchives, type SidArchiveListItem } from '@/lib/api';
import { SidGrid } from './SidGrid';
import { cn } from '@/lib/utils';

function formatArchiveLabel(a: SidArchiveListItem): string {
  const when = new Date(a.archivedAt).toLocaleString();
  return `${when} — ${a.count} SID${a.count === 1 ? '' : 's'}`;
}

export function AuditPanel(props: {
  listRefreshNonce: number;
  testCodeFilter: TestCodeId | null;
  onTestCodeFilterChange: (v: TestCodeId | null) => void;
  className?: string;
}) {
  const { listRefreshNonce, testCodeFilter, onTestCodeFilterChange, className } = props;
  const [archives, setArchives] = useState<SidArchiveListItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [entries, setEntries] = useState<StoredSidEntry[]>([]);
  const [sidQuery, setSidQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setErr(null);
      try {
        const r = await getSidArchives();
        if (cancelled) return;
        setArchives(r.archives);
        setSelectedFile((prev) => {
          if (prev && r.archives.some((x) => x.file === prev)) return prev;
          return r.archives[0]?.file ?? null;
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listRefreshNonce]);

  useEffect(() => {
    if (!selectedFile) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingArchive(true);
      setErr(null);
      try {
        const r = await getSidArchive(selectedFile);
        if (cancelled) return;
        const sorted = [...r.entries].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
        setEntries(sorted);
      } catch (e) {
        if (!cancelled) {
          setEntries([]);
          setErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingArchive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  const searchFiltered = useMemo(() => {
    const q = sidQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.sid.toLowerCase().includes(q));
  }, [entries, sidQuery]);

  async function refreshList() {
    setLoadingList(true);
    setErr(null);
    try {
      const r = await getSidArchives();
      setArchives(r.archives);
      setSelectedFile((prev) => {
        if (prev && r.archives.some((x) => x.file === prev)) return prev;
        return r.archives[0]?.file ?? null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }

  return (
    <div
      className={cn(
        'glass-panel flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-2xl border p-4',
        className
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Archived snapshot</span>
          <select
            value={selectedFile ?? ''}
            onChange={(e) => setSelectedFile(e.target.value === '' ? null : e.target.value)}
            disabled={loadingList || archives.length === 0}
            className="h-9 w-full min-w-0 rounded-md border border-zinc-600 bg-zinc-950 px-2 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:opacity-50"
          >
            {archives.length === 0 ? <option value="">No archives yet</option> : null}
            {archives.map((a) => (
              <option key={a.file} value={a.file}>
                {formatArchiveLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full min-w-[8rem] flex-col gap-1 sm:w-48">
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Search SID</span>
          <input
            type="search"
            value={sidQuery}
            onChange={(e) => setSidQuery(e.target.value)}
            placeholder="Substring…"
            className="h-9 rounded-md border border-zinc-600 bg-zinc-950 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          />
        </label>
        <button
          type="button"
          onClick={() => void refreshList()}
          disabled={loadingList}
          className="h-9 shrink-0 rounded-md border border-zinc-600 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Refresh list
        </button>
      </div>

      {err ? (
        <p className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          {err}
        </p>
      ) : null}

      {loadingList || loadingArchive ? <p className="shrink-0 text-xs text-zinc-500">Loading…</p> : null}

      {archives.length === 0 && !loadingList ? (
        <p className="shrink-0 text-sm text-zinc-500">
          No archived SID lists yet. Use <span className="font-medium text-zinc-400">Archive list</span> on the Results
          tab; snapshots stay on disk under <span className="font-mono text-zinc-400">data/sids/archive/</span>.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedFile && searchFiltered.length === 0 && !loadingArchive && sidQuery.trim() !== '' ? (
          <p className="shrink-0 text-sm text-zinc-500">No SIDs match “{sidQuery.trim()}” in this archive.</p>
        ) : null}
        {selectedFile ? (
          <SidGrid
            className="h-full min-h-0 border-0 bg-transparent shadow-none ring-0"
            entries={searchFiltered}
            skippedDedup={0}
            summary={null}
            atCapacity={false}
            testCodeFilter={testCodeFilter}
            onTestCodeFilterChange={onTestCodeFilterChange}
          />
        ) : null}
      </div>
    </div>
  );
}

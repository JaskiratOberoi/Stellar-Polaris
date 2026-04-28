import fs from 'node:fs';
import path from 'node:path';
import type { StoredSidEntry, TestCodeId, WsClientEvent, WorksheetTestHit } from '@stellar/shared';
import { getRuntimePaths } from '../runtime/paths.js';

/** Cap in-memory SID rows; older rows remain in `active.jsonl` until next full rewrite. */
const MAX_SID_ENTRIES = 5000;

const FLUSH_MS = 150;

let entries: StoredSidEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function sidsRoot(): string {
  return path.join(getRuntimePaths().dataDir, 'sids');
}

function activePath(): string {
  return path.join(sidsRoot(), 'active.jsonl');
}

function ensureSidsDir(): void {
  fs.mkdirSync(sidsRoot(), { recursive: true });
}

function findIdx(runId: string, sid: string): number {
  return entries.findIndex((e) => e.runId === runId && e.sid === sid);
}

function trimOldestFromMemory(): void {
  if (entries.length > MAX_SID_ENTRIES) {
    entries.splice(0, entries.length - MAX_SID_ENTRIES);
  }
}

function flushToDiskSync(): void {
  ensureSidsDir();
  const p = activePath();
  const sorted = [...entries].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
  const body = sorted.map((e) => JSON.stringify(e)).join('\n') + (sorted.length ? '\n' : '');
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, p);
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      flushToDiskSync();
    } catch (e) {
      console.error('[stellar] sidStore flush', e);
    }
  }, FLUSH_MS);
}

/** Call once when the server process starts (after `STELLAR_DATA_DIR` is set). */
export function initSidStore(): void {
  try {
    ensureSidsDir();
    const p = activePath();
    if (!fs.existsSync(p)) {
      entries = [];
      return;
    }
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
    const loaded: StoredSidEntry[] = [];
    for (const line of lines) {
      try {
        loaded.push(JSON.parse(line) as StoredSidEntry);
      } catch {
        /* skip bad line */
      }
    }
    loaded.sort((a, b) => a.firstSeenAt - b.firstSeenAt);
    entries = loaded.slice(-MAX_SID_ENTRIES);
  } catch (e) {
    console.error('[stellar] initSidStore', e);
    entries = [];
  }
}

/** Newest rows first (best for UI). */
export function getActiveSidEntries(): StoredSidEntry[] {
  return [...entries].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
}

export function applySidStoreEvent(ev: WsClientEvent): void {
  try {
    if (ev.type === 'SID_TEST_FOUND') {
      const i = findIdx(ev.runId, ev.sid);
      if (i === -1) {
        const row: StoredSidEntry = {
          sid: ev.sid,
          runId: ev.runId,
          firstSeenAt: Date.now(),
          firstSeenViaTestCode: ev.discoveredViaTestCode,
          firstSeenViaStatus: ev.discoveredViaStatus,
          testsByCode: {},
          authByCode: {},
          allergyProfileSuppressedTotalIgE: Boolean(ev.allergyProfileSuppressedTotalIgE),
          suppressedTotalIgEValue: ev.suppressedTotalIgEValue ?? undefined,
          suppressedTotalIgEUnit: ev.suppressedTotalIgEUnit ?? undefined,
          authGateSkipped: Boolean(ev.authGateSkipped),
          authGateReason: ev.authGateReason ?? undefined,
        };
        for (const t of ev.tests) row.testsByCode[t.testCode] = t;
        entries.push(row);
      } else {
        const prev = entries[i]!;
        const testsByCode: Partial<Record<TestCodeId, WorksheetTestHit>> = {
          ...prev.testsByCode,
        };
        for (const t of ev.tests) testsByCode[t.testCode] = t;
        entries[i] = {
          ...prev,
          testsByCode,
          allergyProfileSuppressedTotalIgE:
            prev.allergyProfileSuppressedTotalIgE || Boolean(ev.allergyProfileSuppressedTotalIgE),
          suppressedTotalIgEValue:
            ev.suppressedTotalIgEValue != null
              ? ev.suppressedTotalIgEValue
              : prev.suppressedTotalIgEValue,
          suppressedTotalIgEUnit:
            ev.suppressedTotalIgEUnit != null && ev.suppressedTotalIgEUnit !== ''
              ? ev.suppressedTotalIgEUnit
              : prev.suppressedTotalIgEUnit,
          authGateSkipped: prev.authGateSkipped || Boolean(ev.authGateSkipped),
          authGateReason:
            ev.authGateReason != null && ev.authGateReason !== ''
              ? ev.authGateReason
              : prev.authGateReason,
        };
      }
      trimOldestFromMemory();
      scheduleFlush();
      return;
    }

    if (ev.type === 'SID_AUTH_DECISION') {
      const i = findIdx(ev.runId, ev.sid);
      if (i === -1) return;
      const row = entries[i]!;
      entries[i] = {
        ...row,
        authByCode: {
          ...(row.authByCode ?? {}),
          [ev.testCode]: {
            decision: ev.decision,
            reason: ev.reason,
            applied: ev.applied,
            saveClicked: ev.saveClicked,
            writeMode: ev.writeMode,
            ageMonths: ev.ageMonths,
            sex: ev.sex,
          },
        },
      };
      scheduleFlush();
    }
  } catch (e) {
    console.error('[stellar] sidStore apply', e);
  }
}

export function syncFlushSidStore(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (entries.length === 0) return;
  flushToDiskSync();
}

/**
 * Moves `active.jsonl` to `archive/sids-<timestamp>.jsonl` and clears in-memory entries.
 * Returns relative path under data dir for clients (e.g. `sids/archive/sids-....jsonl`).
 */
export function archiveActiveSids(): { archiveFile: string; count: number } {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  syncFlushSidStore();

  ensureSidsDir();
  const active = activePath();
  const archDir = path.join(sidsRoot(), 'archive');
  fs.mkdirSync(archDir, { recursive: true });

  if (!fs.existsSync(active)) {
    const c = entries.length;
    entries = [];
    return { archiveFile: '', count: c };
  }

  let countToReport = entries.length;
  if (countToReport === 0) {
    try {
      const raw = fs.readFileSync(active, 'utf8');
      countToReport = raw.split(/\r?\n/).filter((l) => l.trim() !== '').length;
    } catch {
      countToReport = 0;
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `sids-${stamp}.jsonl`;
  const dest = path.join(archDir, base);

  fs.renameSync(active, dest);
  entries = [];
  return { archiveFile: path.join('sids', 'archive', base).replace(/\\/g, '/'), count: countToReport };
}

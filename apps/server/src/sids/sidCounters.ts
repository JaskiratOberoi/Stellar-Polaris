import fs from 'node:fs';
import path from 'node:path';
import type { B12AuthKind, SidCountersSnapshot, StoredSidEntry, TestCodeId, WsClientEvent } from '@stellar/shared';
import { getRuntimePaths } from '../runtime/paths.js';

const ALL_CODES: TestCodeId[] = ['BI235', 'BI005', 'BI133', 'BI180', 'BI036', 'MS111', 'BI034', 'BI181', 'CP004'];
const FLUSH_MS = 150;

type CodeBuckets = {
  authKeys: Set<string>;
  highKeys: Set<string>;
  workedKeys: Set<string>;
};

function sidsRoot(): string {
  return path.join(getRuntimePaths().dataDir, 'sids');
}

function countersPath(): string {
  return path.join(sidsRoot(), 'counters.json');
}

function activePath(): string {
  return path.join(sidsRoot(), 'active.jsonl');
}

function ensureSidsDir(): void {
  fs.mkdirSync(sidsRoot(), { recursive: true });
}

function emptyBuckets(): CodeBuckets {
  return {
    authKeys: new Set(),
    highKeys: new Set(),
    workedKeys: new Set(),
  };
}

let byCode: Record<TestCodeId, CodeBuckets> = {
  BI235: emptyBuckets(),
  BI005: emptyBuckets(),
  BI133: emptyBuckets(),
  BI180: emptyBuckets(),
  BI036: emptyBuckets(),
  MS111: emptyBuckets(),
  BI034: emptyBuckets(),
  BI181: emptyBuckets(),
  CP004: emptyBuckets(),
};

/** Distinct `runId:sid` that had any qualifying work on any test code. */
let globalWorkedKeys = new Set<string>();

/** Epoch ms — set on archive / first init; “since” for the counter dashboard. */
let sinceEpoch = Date.now();

let emitFn: ((ev: Extract<WsClientEvent, { type: 'SID_COUNTERS' }>) => void) | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function registerSidCountersEmit(fn: (ev: Extract<WsClientEvent, { type: 'SID_COUNTERS' }>) => void): void {
  emitFn = fn;
}

function authAppliedKind(decision: B12AuthKind, applied: boolean): boolean {
  return (
    applied &&
    (decision === 'auth' || decision === 'auth-inline-comment' || decision === 'already-authed')
  );
}

function highCommentKind(decision: B12AuthKind, applied: boolean): boolean {
  return applied && decision === 'high-comment';
}

function sidKey(runId: string, sid: string): string {
  return `${runId}:${sid}`;
}

function ingestAuthDecision(
  runId: string,
  sid: string,
  testCode: TestCodeId,
  decision: B12AuthKind,
  applied: boolean
): void {
  const k = sidKey(runId, sid);
  const bucket = byCode[testCode];
  if (!bucket) return;

  const authQ = authAppliedKind(decision, applied);
  const highQ = highCommentKind(decision, applied);

  if (authQ) {
    bucket.authKeys.add(k);
  }
  if (highQ) {
    bucket.highKeys.add(k);
  }
  if (authQ || highQ) {
    bucket.workedKeys.add(k);
    globalWorkedKeys.add(k);
  }
}

function scheduleEmit(): void {
  if (!emitFn) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      emitFn!(buildCountersEvent());
    } catch (e) {
      console.error('[stellar] sidCounters emit', e);
    }
  }, FLUSH_MS);
}

function flushEmitSync(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!emitFn) return;
  try {
    emitFn(buildCountersEvent());
  } catch (e) {
    console.error('[stellar] sidCounters emit sync', e);
  }
}

function buildSnapshot(): SidCountersSnapshot {
  const perCode = {} as SidCountersSnapshot['perCode'];
  for (const code of ALL_CODES) {
    const b = byCode[code]!;
    perCode[code] = {
      workedOn: b.workedKeys.size,
      authApplied: b.authKeys.size,
      highCommentApplied: b.highKeys.size,
    };
  }
  return {
    since: sinceEpoch,
    perCode,
    totalWorkedOnSids: globalWorkedKeys.size,
  };
}

function buildCountersEvent(): Extract<WsClientEvent, { type: 'SID_COUNTERS' }> {
  const s = buildSnapshot();
  return {
    type: 'SID_COUNTERS',
    since: s.since,
    perCode: s.perCode,
    totalWorkedOnSids: s.totalWorkedOnSids,
  };
}

function writeSinceMeta(): void {
  try {
    ensureSidsDir();
    const p = countersPath();
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ since: sinceEpoch }, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  } catch (e) {
    console.error('[stellar] sidCounters writeSinceMeta', e);
  }
}

function readPersistedSince(): number | null {
  try {
    const p = countersPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as { since?: number };
    return typeof j.since === 'number' && Number.isFinite(j.since) ? j.since : null;
  } catch {
    return null;
  }
}

/** Replays auth decisions from `active.jsonl`; returns lowest `firstSeenAt` if any. */
function replayActiveJsonlIngest(): number | null {
  let minFirstSeen: number | null = null;
  try {
    const p = activePath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
    for (const line of lines) {
      let entry: StoredSidEntry;
      try {
        entry = JSON.parse(line) as StoredSidEntry;
      } catch {
        continue;
      }
      if (typeof entry.firstSeenAt === 'number') {
        if (minFirstSeen == null || entry.firstSeenAt < minFirstSeen) minFirstSeen = entry.firstSeenAt;
      }
      const auth = entry.authByCode;
      if (!auth) continue;
      for (const code of ALL_CODES) {
        const rec = auth[code];
        if (!rec) continue;
        ingestAuthDecision(entry.runId, entry.sid, code, rec.decision, rec.applied);
      }
    }
  } catch (e) {
    console.error('[stellar] sidCounters replayActiveJsonlIngest', e);
  }
  return minFirstSeen;
}

/**
 * Call after `initSidStore` (same data dir). Rebuilds dedupe sets from `active.jsonl`.
 */
export function initSidCounters(): void {
  byCode = {
    BI235: emptyBuckets(),
    BI005: emptyBuckets(),
    BI133: emptyBuckets(),
    BI180: emptyBuckets(),
    BI036: emptyBuckets(),
    MS111: emptyBuckets(),
    BI034: emptyBuckets(),
    BI181: emptyBuckets(),
    CP004: emptyBuckets(),
  };
  globalWorkedKeys = new Set();
  const minFirstSeen = replayActiveJsonlIngest();
  const persistedSince = readPersistedSince();
  if (persistedSince != null) {
    sinceEpoch = persistedSince;
  } else if (minFirstSeen != null) {
    sinceEpoch = minFirstSeen;
    writeSinceMeta();
  } else {
    sinceEpoch = Date.now();
    writeSinceMeta();
  }
}

export function applySidCountersEvent(ev: WsClientEvent): void {
  if (ev.type !== 'SID_AUTH_DECISION') return;
  try {
    ingestAuthDecision(ev.runId, ev.sid, ev.testCode, ev.decision, ev.applied);
    scheduleEmit();
  } catch (e) {
    console.error('[stellar] sidCounters apply', e);
  }
}

export function getSidCountersSnapshot(): SidCountersSnapshot {
  return buildSnapshot();
}

/**
 * Clears counters and sets `since` to now. Call when the active SID list is archived.
 */
export function resetSidCountersForArchive(): void {
  byCode = {
    BI235: emptyBuckets(),
    BI005: emptyBuckets(),
    BI133: emptyBuckets(),
    BI180: emptyBuckets(),
    BI036: emptyBuckets(),
    MS111: emptyBuckets(),
    BI034: emptyBuckets(),
    BI181: emptyBuckets(),
    CP004: emptyBuckets(),
  };
  globalWorkedKeys = new Set();
  sinceEpoch = Date.now();
  writeSinceMeta();
  flushEmitSync();
}

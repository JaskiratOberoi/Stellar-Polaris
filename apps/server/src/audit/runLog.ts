import type { TestCodeId, WsClientEvent } from '@stellar/shared';
import fs from 'node:fs';
import type { WriteStream } from 'node:fs';
import path from 'node:path';
import {
  DECISIONS_CSV,
  ORPHAN_JSONL,
  RUNS_DIR,
  SCANS_CSV,
  SCHEDULER_JSONL,
  ensureLogDirs,
} from './paths.js';

const DECISIONS_HEADER =
  'ts_iso,runId,sid,testCode,decision,reason,applied,saveClicked,writeMode,ageMonths,sex';
const SCANS_HEADER =
  'ts_iso,runId,sid,event,discoveredViaTestCode,discoveredViaStatus,testCodesPresent,authGateSkipped,authGateReason,allergyProfileSuppressedTotalIgE,suppressedTotalIgEValue,suppressedTotalIgEUnit,skipOrExtraReason';

let dirsReady = false;
function ensure(): void {
  if (dirsReady) return;
  ensureLogDirs();
  dirsReady = true;
}

type RunCtx = { stream: WriteStream; startedAt: number };
const runStreams = new Map<string, RunCtx>();
const lastSummary = new Map<string, { uniqueSids: number; modalsOpened: number; modalsSkipped: number }>();
let activeRunId: string | null = null;
let decisionsStream: WriteStream | null = null;
let scansStream: WriteStream | null = null;
let schedulerLogStream: WriteStream | null = null;
let orphanStream: WriteStream | null = null;

function runJsonlPath(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.jsonl`);
}

function getDecisionsStream(): WriteStream {
  ensure();
  if (!decisionsStream) {
    const needHeader = !fs.existsSync(DECISIONS_CSV) || fs.statSync(DECISIONS_CSV).size === 0;
    decisionsStream = fs.createWriteStream(DECISIONS_CSV, { flags: 'a' });
    if (needHeader) {
      appendLine(decisionsStream, DECISIONS_HEADER);
    }
  }
  return decisionsStream;
}

function getScansStream(): WriteStream {
  ensure();
  if (!scansStream) {
    const needHeader = !fs.existsSync(SCANS_CSV) || fs.statSync(SCANS_CSV).size === 0;
    scansStream = fs.createWriteStream(SCANS_CSV, { flags: 'a' });
    if (needHeader) {
      appendLine(scansStream, SCANS_HEADER);
    }
  }
  return scansStream;
}

function getSchedulerLogStream(): WriteStream {
  ensure();
  if (!schedulerLogStream) {
    schedulerLogStream = fs.createWriteStream(SCHEDULER_JSONL, { flags: 'a' });
  }
  return schedulerLogStream;
}

function getOrphanStream(): WriteStream {
  ensure();
  if (!orphanStream) {
    orphanStream = fs.createWriteStream(ORPHAN_JSONL, { flags: 'a' });
  }
  return orphanStream;
}

function appendLine(stream: WriteStream, line: string): void {
  if (!stream.write(line + '\n')) {
    /* backpressure: rare for our line sizes */
  }
}

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeRunJsonl(runId: string, line: string, allowOrphan: boolean): void {
  const ctx = runStreams.get(runId);
  if (ctx) {
    appendLine(ctx.stream, line);
  } else if (allowOrphan) {
    appendLine(getOrphanStream(), line);
  }
}

/**
 * Best-effort close of audit streams. Safe to call on SIGINT / SIGTERM before process exit.
 */
export function flushAuditLogs(): void {
  for (const rid of [...runStreams.keys()]) {
    const ctx = runStreams.get(rid);
    if (!ctx) continue;
    try {
      ctx.stream.end();
    } catch {
      /* ignore */
    }
    runStreams.delete(rid);
  }
  activeRunId = null;
  for (const s of [decisionsStream, scansStream, schedulerLogStream, orphanStream]) {
    if (s) {
      try {
        s.end();
      } catch {
        /* ignore */
      }
    }
  }
  decisionsStream = null;
  scansStream = null;
  schedulerLogStream = null;
  orphanStream = null;
}

/**
 * Appends a copy of every WebSocket event the server broadcasts. Run-scoped
 * events (except `SCHEDULER_STATE` and bare `LOG`) are written to
 * `data/logs/runs/<runId>.jsonl` after `RUN_STARTED` opens the stream.
 */
export function recordEvent(ev: WsClientEvent): void {
  try {
    ensure();

    if (ev.type === 'SCHEDULER_STATE') {
      appendLine(
        getSchedulerLogStream(),
        JSON.stringify({ ...ev, _receivedAt: Date.now() })
      );
      return;
    }

    if (ev.type === 'RUN_STARTED') {
      const { runId } = ev;
      const existing = runStreams.get(runId);
      if (existing) {
        try {
          existing.stream.end();
        } catch {
          /* ignore */
        }
        runStreams.delete(runId);
      }
      const startedAt = Date.now();
      const stream = fs.createWriteStream(runJsonlPath(runId), { flags: 'a' });
      runStreams.set(runId, { stream, startedAt });
      activeRunId = runId;
      lastSummary.delete(runId);
      appendLine(stream, JSON.stringify(ev));
      return;
    }

    if (ev.type === 'LOG') {
      const line = JSON.stringify(ev);
      if (activeRunId && runStreams.has(activeRunId)) {
        appendLine(runStreams.get(activeRunId)!.stream, line);
      } else {
        appendLine(getOrphanStream(), line);
      }
      return;
    }

    const runId = (ev as { runId: string }).runId;
    const line = JSON.stringify(ev);
    writeRunJsonl(runId, line, true);

    if (ev.type === 'RUN_SUMMARY') {
      lastSummary.set(runId, {
        uniqueSids: ev.uniqueSids,
        modalsOpened: ev.modalsOpened,
        modalsSkipped: ev.modalsSkipped,
      });
    }

    if (ev.type === 'SID_AUTH_DECISION') {
      const ts = new Date().toISOString();
      const row = [
        ts,
        runId,
        ev.sid,
        ev.testCode,
        ev.decision,
        ev.reason,
        String(ev.applied),
        String(ev.saveClicked),
        String(ev.writeMode),
        ev.ageMonths == null ? '' : String(ev.ageMonths),
        ev.sex == null ? '' : String(ev.sex),
      ]
        .map((c) => csvCell(c))
        .join(',');
      appendLine(getDecisionsStream(), row);
    }

    if (ev.type === 'SID_TEST_FOUND') {
      const ts = new Date().toISOString();
      const testCodes: TestCodeId[] = ev.tests.map((t) => t.testCode);
      const testCodesPresent = testCodes.join('|');
      const row = [
        ts,
        runId,
        ev.sid,
        'SID_TEST_FOUND',
        ev.discoveredViaTestCode,
        ev.discoveredViaStatus,
        testCodesPresent,
        ev.authGateSkipped == null ? '' : String(ev.authGateSkipped),
        ev.authGateReason == null ? '' : String(ev.authGateReason),
        ev.allergyProfileSuppressedTotalIgE == null ? '' : String(ev.allergyProfileSuppressedTotalIgE),
        ev.suppressedTotalIgEValue == null ? '' : String(ev.suppressedTotalIgEValue),
        ev.suppressedTotalIgEUnit == null ? '' : String(ev.suppressedTotalIgEUnit),
        '', // skipOrExtraReason
      ]
        .map((c) => csvCell(c))
        .join(',');
      appendLine(getScansStream(), row);
    }

    if (ev.type === 'SID_SKIPPED') {
      const ts = new Date().toISOString();
      const row = [
        ts,
        runId,
        ev.sid,
        'SID_SKIPPED',
        ev.discoveredViaTestCode,
        ev.discoveredViaStatus,
        '', // testCodesPresent
        '', // authGateSkipped
        '', // authGateReason
        '', // allergy
        '', // ige value
        '', // ige unit
        ev.reason,
      ]
        .map((c) => csvCell(c))
        .join(',');
      appendLine(getScansStream(), row);
    }

    if (ev.type === 'RUN_DONE' || ev.type === 'RUN_ERROR' || ev.type === 'RUN_STOPPED') {
      const ctx = runStreams.get(runId);
      const startedAt = ctx?.startedAt ?? Date.now();
      const endedAt = Date.now();
      const outcome: 'done' | 'error' | 'stopped' =
        ev.type === 'RUN_DONE' ? 'done' : ev.type === 'RUN_ERROR' ? 'error' : 'stopped';
      const err = ev.type === 'RUN_ERROR' ? ev.error : undefined;
      const summary = lastSummary.get(runId) ?? null;
      const outPath = path.join(RUNS_DIR, `${runId}.summary.json`);
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            runId,
            startedAt,
            endedAt,
            outcome,
            error: err,
            summary,
          },
          null,
          2
        ),
        'utf8'
      );
      if (ctx) {
        try {
          ctx.stream.end();
        } catch {
          /* ignore */
        }
        runStreams.delete(runId);
      }
      if (activeRunId === runId) {
        activeRunId = null;
      }
      lastSummary.delete(runId);
    }
  } catch (e) {
    console.error('[stellar] audit: recordEvent failed', e);
  }
}

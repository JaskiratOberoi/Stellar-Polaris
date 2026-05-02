/** Test code toggle keys used in the UI and bot. */
export type TestCodeId = 'BI235' | 'BI005' | 'BI133' | 'BI180' | 'BI036' | 'MS111';

export const TEST_CODE_LABELS: Record<TestCodeId, string> = {
  BI235: 'Vitamin B12',
  BI005: 'Vitamin D',
  BI133: 'Total IgE',
  BI180: 'Prolactin',
  BI036: 'Anti-CCP',
  MS111: 'RA Factor',
};

export interface RunConfig {
  /** Which test codes to scan, in order (e.g. BI235 → BI005 → BI133 → BI180 → BI036 → MS111). */
  testCodes: TestCodeId[];
  businessUnit: string;
  statusLabels: string[];
  fromDate?: string;
  toDate?: string;
  fromHour?: number | null;
  toHour?: number | null;
  headless?: boolean;
  /**
   * When true, the server may tick row auth checkboxes, append high-result
   * comments, and click Save. Default `false` (dry run): only evaluates rules
   * and emits `SID_AUTH_DECISION` with `applied=false`, no DOM writes.
   */
  authenticate?: boolean;
  /**
   * Set only on the server from `.env` (never from the web UI). Same chain as CBC: `CBC_LOGIN_*` → `LOGIN_*` → `LIS_*` → defaults.
   */
  credentials?: {
    username: string;
    password: string;
  };
  loginUrls?: {
    primary?: string;
    backup?: string;
  };
}

/** A single test row extracted from a SID's worksheet modal (`gvWorksheet`). */
export interface WorksheetTestHit {
  testCode: TestCodeId;
  rawName: string;
  value: string | null;
  unit: string | null;
  /** AB checkbox state in the modal row (out-of-range flag). */
  abnormal: boolean | null;
  /** chkAuth checkbox state in the modal row. */
  authorized: boolean | null;
  /** Free-form normal range text from the row's Ranges popup. */
  normalRange: string | null;
  /** Computed border colour of the value textarea: red = out of range, green = normal. */
  borderColor: 'red' | 'green' | 'other' | null;
}

/** B12 (BI235) / future tests: per-SID LIS auth workflow outcome. */
/** `auth-inline-comment` = tick chkAuth plus per-test inline comment (e.g. Prolactin upper–40 band). */
export type B12AuthKind =
  | 'auth'
  | 'auth-inline-comment'
  | 'high-comment'
  | 'defer'
  | 'skip'
  | 'already-authed';

export type SidAuthRecord = {
  decision: B12AuthKind;
  reason: string;
  /** True when a write-mode action (tick, comment) succeeded. */
  applied: boolean;
  saveClicked: boolean;
  /** Mirrors `RunConfig.authenticate` for the run. */
  writeMode: boolean;
  ageMonths: number | null;
  sex: 'M' | 'F' | null;
};

/**
 * One row in the Sample IDs grid / `sids/active.jsonl`. Key is `(runId, sid)` so the
 * same SID in a later run appears as a separate row.
 */
export type StoredSidEntry = {
  sid: string;
  runId: string;
  /** Epoch ms when this row was first created for the run. */
  firstSeenAt: number;
  firstSeenViaTestCode: TestCodeId;
  firstSeenViaStatus: string;
  testsByCode: Partial<Record<TestCodeId, WorksheetTestHit>>;
  authByCode?: Partial<Record<TestCodeId, SidAuthRecord>>;
  allergyProfileSuppressedTotalIgE?: boolean;
  suppressedTotalIgEValue?: string | null;
  suppressedTotalIgEUnit?: string | null;
  authGateSkipped?: boolean;
  authGateReason?: string;
};

export type WsClientEvent =
  | { type: 'LOG'; level: 'info' | 'warn' | 'error'; message: string; ts: number }
  | { type: 'RUN_STARTED'; runId: string }
  | {
      /**
       * Emitted once per SID per modal-open. `tests` is the subset of enabled
       * test codes actually present in this SID's worksheet (may be empty).
       */
      type: 'SID_TEST_FOUND';
      runId: string;
      sid: string;
      discoveredViaTestCode: TestCodeId;
      discoveredViaStatus: string;
      tests: WorksheetTestHit[];
      /**
       * When the modal includes an ALLERGY PROFILE row, Total IgE (BI133) is
       * not listed in `tests` and no IgE `SID_AUTH_DECISION` is emitted; the UI
       * can show this so operators know IgE is covered by the panel.
       */
      allergyProfileSuppressedTotalIgE?: boolean;
      /** Value/unit from the IgE row in the modal when `allergyProfileSuppressedTotalIgE` is true. */
      suppressedTotalIgEValue?: string | null;
      suppressedTotalIgEUnit?: string | null;
      /** Set when the modal has extra tests (not only B12 / Vit D / B12+Vit D / solo IgE). */
      authGateSkipped?: boolean;
      authGateReason?: string;
    }
  | {
      /** Emitted when a later sweep encounters a SID whose modal is already fully resolved. */
      type: 'SID_SKIPPED';
      runId: string;
      sid: string;
      discoveredViaTestCode: TestCodeId;
      discoveredViaStatus: string;
      reason: 'already-resolved';
    }
  | {
      type: 'RUN_SUMMARY';
      runId: string;
      uniqueSids: number;
      modalsOpened: number;
      modalsSkipped: number;
    }
  | {
      type: 'SID_AUTH_DECISION';
      runId: string;
      sid: string;
      testCode: TestCodeId;
      decision: B12AuthKind;
      reason: string;
      ageMonths: number | null;
      sex: 'M' | 'F' | null;
      writeMode: boolean;
      applied: boolean;
      saveClicked: boolean;
    }
  | { type: 'RUN_DONE'; runId: string }
  | { type: 'RUN_ERROR'; runId: string; error: string }
  | { type: 'RUN_STOPPED'; runId: string }
  | {
      /** Broadcast after POST /api/sids/archive; clears server + clients’ active SID list. */
      type: 'SID_LIST_ARCHIVED';
      archivedAt: number;
      /** Basename or relative path under dataDir/sids/archive/. */
      archiveFile: string;
      count: number;
    }
  | {
      /** Emitted when the continuous scheduler’s settings or phase change. */
      type: 'SCHEDULER_STATE';
      enabled: boolean;
      cooldownSeconds: number;
      status: 'idle' | 'running' | 'cooling-down' | 'waiting-for-run' | 'disabled';
      lastRunAt: number | null;
      nextRunAt: number | null;
      hasConfig: boolean;
      headless: boolean;
    };

export interface ServerStatus {
  running: boolean;
  runId: string | null;
  startedAt: number | null;
}

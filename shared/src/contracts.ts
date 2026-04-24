/** Test code toggle keys used in the UI and bot. */
export type TestCodeId = 'BI235' | 'BI005';

export const TEST_CODE_LABELS: Record<TestCodeId, string> = {
  BI235: 'Vitamin B12',
  BI005: 'Vitamin D',
};

export interface RunConfig {
  /** Which test codes to scan, in order (e.g. BI235 then BI005). */
  testCodes: TestCodeId[];
  businessUnit: string;
  statusLabels: string[];
  fromDate?: string;
  toDate?: string;
  fromHour?: number | null;
  toHour?: number | null;
  headless?: boolean;
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
  | { type: 'RUN_DONE'; runId: string }
  | { type: 'RUN_ERROR'; runId: string; error: string }
  | { type: 'RUN_STOPPED'; runId: string };

export interface ServerStatus {
  running: boolean;
  runId: string | null;
  startedAt: number | null;
}

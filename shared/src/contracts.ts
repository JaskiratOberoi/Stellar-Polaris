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

export type WsClientEvent =
  | { type: 'LOG'; level: 'info' | 'warn' | 'error'; message: string; ts: number }
  | { type: 'RUN_STARTED'; runId: string }
  | {
      type: 'SID_FOUND';
      runId: string;
      testCode: string;
      status: string;
      sid: string;
    }
  | { type: 'RUN_DONE'; runId: string }
  | { type: 'RUN_ERROR'; runId: string; error: string }
  | { type: 'RUN_STOPPED'; runId: string };

export interface ServerStatus {
  running: boolean;
  runId: string | null;
  startedAt: number | null;
}

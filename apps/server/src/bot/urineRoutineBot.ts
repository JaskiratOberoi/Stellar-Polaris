import type { RunConfig, WorksheetTestHit, WsClientEvent } from '@stellar/shared';
import type { Browser } from 'puppeteer';
import {
  applyChromiumExecutablePathEnv,
  applyPageLowMemoryOptimizations,
  buildStellarPuppeteerLaunchOptions,
  getChromeInstallHint,
  resolveChromeForStellarLaunch,
} from './lis/puppeteer.js';
import {
  clickSearch,
  ensureWorksheetTestCodeFilter,
  firstSidOnSampleGrid,
  getSampleGridPagerInfo,
  listSidsForCurrentPage,
  loginAndOpenWorksheet,
  navigateToNextSampleGridPage,
  setBusinessUnit,
  setStatus,
  setTestCode,
  setWorksheetDateRange,
  waitForSampleGridAfterSearch,
  waitForSampleGridPageTurn,
} from './lis/navigation.js';
import { closeSidWorksheet, openSidWorksheet } from './lis/sidWorksheet.js';
import { clickSaveAndSettle } from './lis/auth.js';
import { delayMs } from './lis/xpath.js';
import {
  URINE_ROUTINE_FIELD_ALIASES,
  URINE_ROUTINE_NORMAL_DEFAULTS,
  URINE_ROUTINE_SKIP_PATTERNS,
  URINE_ROUTINE_TEST_CODE,
} from '../config/urineRoutineFields.js';
import { URINE_ROUTINE } from '../config/testCodes.js';

const MAX_GRID_PAGES = 500;

/**
 * When `true`, rows we fill get `chkAuth` ticked (see `autofillUrineRoutineWorksheet`).
 * Set to `false` to only write default values (still saves when `config.authenticate` allows).
 * Re-enable without code deletion by flipping this flag.
 */
const URINE_ROUTINE_TICK_CHK_AUTH = false;

/**
 * Urine routine only sweeps `Registered` SIDs (samples that exist on the worksheet
 * but haven't been Tested yet). The UI status pills are intentionally ignored for
 * this bot — change here if the LIS workflow ever needs other statuses.
 */
const URINE_ROUTINE_STATUSES = ['Registered'] as const;

/**
 * Urine routine's only job is to write the default values, so we always click Save
 * after a successful fill regardless of the UI Readonly/Authenticate toggle. The
 * toggle still controls `chkAuth` ticking via `URINE_ROUTINE_TICK_CHK_AUTH` (currently
 * disabled) — Save by itself never authenticates the row.
 */
const URINE_ROUTINE_ALWAYS_SAVE = true;

export type EmitFn = (ev: WsClientEvent) => void;

function log(emit: EmitFn | undefined, level: 'info' | 'warn' | 'error', message: string) {
  const line = `[urine-routine] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  emit?.({ type: 'LOG', level, message, ts: Date.now() });
}

export type UrineRoutineFillReport = {
  ok: boolean;
  /** Field keys that were autofilled on this modal (subset of NORMAL_DEFAULTS keys). */
  filledKeys: string[];
  /** Field keys whose row was found but already had a value — left untouched, no chkAuth. */
  alreadyHadValueKeys: string[];
  /** Field keys whose row was not present in this worksheet. */
  missingKeys: string[];
  /** Rows that match `URINE_ROUTINE_SKIP_PATTERNS` (Pus Cells / Epithelial Cells). */
  skippedSensitiveRows: string[];
  /** chkAuth ticked count, plus rows that were already authenticated and rows with no chkAuth. */
  authTicked: number;
  authAlreadyChecked: number;
  authMissing: number;
  /** True when the value/chkAuth mutations changed any DOM state (Save needed). */
  mutated: boolean;
  error?: string;
};

/**
 * Inside the gvWorksheet modal, autofill default values for matched rows
 * (skipping pus cells / epithelial cells). Optionally ticks `chkAuth` for filled rows
 * when `tickChkAuth` is true (controlled by `URINE_ROUTINE_TICK_CHK_AUTH` at module scope).
 * Returns a structured report so the bot can emit per-SID events.
 */
async function autofillUrineRoutineWorksheet(
  page: import('puppeteer').Page,
  fields: Record<string, string>,
  aliases: Record<string, string[]>,
  skipPatterns: string[],
  tickChkAuth: boolean
): Promise<UrineRoutineFillReport> {
  return page.evaluate(
    (payload) => {
      const { fields, aliases, skipPatterns, tickChkAuth } = payload;
      const norm = (s: string | null | undefined): string =>
        String(s ?? '')
          .replace(/[\u200e\u200f]/g, '')
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) {
        return {
          ok: false,
          error: 'No gvWorksheet table',
          filledKeys: [],
          alreadyHadValueKeys: [],
          missingKeys: Object.keys(fields),
          skippedSensitiveRows: [],
          authTicked: 0,
          authAlreadyChecked: 0,
          authMissing: 0,
          mutated: false,
        };
      }

      const rowsMap = new Map<
        string,
        {
          rowEl: HTMLTableRowElement;
          rawLabel: string;
          valueEl: HTMLTextAreaElement | HTMLInputElement;
          authEl: HTMLInputElement | null;
        }
      >();
      const skippedSensitiveRows: string[] = [];
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      for (const row of rows) {
        const span = row.querySelector("span[id*='lblTestname']");
        const rawLabel = span ? (span.textContent || '').trim() : '';
        if (!rawLabel) continue;
        const labelNorm = norm(rawLabel);

        const isSensitive = skipPatterns.some((p) => labelNorm.includes(p));
        if (isSensitive) {
          skippedSensitiveRows.push(rawLabel);
          continue;
        }

        const valueEl = row.querySelector(
          "textarea[id*='txtValue'], input[id*='txtValue']"
        ) as HTMLTextAreaElement | HTMLInputElement | null;
        if (!valueEl) continue;
        const authCandidate = row.querySelector(
          "input[type='checkbox'][id*='chkAuth']"
        ) as HTMLInputElement | null;
        const authEl =
          authCandidate && !String(authCandidate.id || '').includes('chkAuthAll')
            ? authCandidate
            : null;
        rowsMap.set(labelNorm, { rowEl: row, rawLabel, valueEl, authEl });
      }

      const filledKeys: string[] = [];
      const alreadyHadValueKeys: string[] = [];
      const missingKeys: string[] = [];
      let authTicked = 0;
      let authAlreadyChecked = 0;
      let authMissing = 0;
      let mutated = false;

      for (const key of Object.keys(fields)) {
        const val = fields[key];
        if (val == null || String(val).trim() === '') continue;
        const aliasList = aliases[key];
        if (!aliasList || aliasList.length === 0) continue;

        let matched: { rowEl: HTMLTableRowElement; valueEl: HTMLTextAreaElement | HTMLInputElement; authEl: HTMLInputElement | null } | null = null;
        for (const alias of aliasList) {
          const cell = rowsMap.get(norm(alias));
          if (cell) {
            matched = { rowEl: cell.rowEl, valueEl: cell.valueEl, authEl: cell.authEl };
            break;
          }
        }
        if (!matched) {
          missingKeys.push(key);
          continue;
        }

        const el = matched.valueEl;
        const currentVal = String(el.value ?? '').trim();
        if (currentVal !== '') {
          alreadyHadValueKeys.push(key);
          continue;
        }
        try {
          el.removeAttribute('readonly');
          el.removeAttribute('disabled');
          el.disabled = false;
          el.focus();
          el.value = String(val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          filledKeys.push(key);
          mutated = true;
        } catch {
          /* if we cannot write, count as missing */
          missingKeys.push(key);
          continue;
        }

        if (tickChkAuth) {
          const authEl = matched.authEl;
          if (!authEl) {
            authMissing += 1;
            continue;
          }
          try {
            authEl.removeAttribute('disabled');
            authEl.disabled = false;
          } catch {
            /* ignore */
          }
          if (authEl.checked) {
            authAlreadyChecked += 1;
          } else {
            authEl.click();
            authEl.dispatchEvent(new Event('input', { bubbles: true }));
            authEl.dispatchEvent(new Event('change', { bubbles: true }));
            authTicked += 1;
            mutated = true;
          }
        }
      }

      return {
        ok: true,
        filledKeys,
        alreadyHadValueKeys,
        missingKeys,
        skippedSensitiveRows,
        authTicked,
        authAlreadyChecked,
        authMissing,
        mutated,
      };
    },
    { fields, aliases, skipPatterns, tickChkAuth }
  );
}

/**
 * Polaris urine-routine engine. Login → set test code CP004 → set BU → optional date range
 * + status filters → page through gvSample results → for each SID open the worksheet modal,
 * autofill defaults (skipping Pus Cells / Epithelial Cells); `chkAuth` ticking is gated by
 * `URINE_ROUTINE_TICK_CHK_AUTH`. Save when `config.authenticate` is true and the modal changed.
 * Close. Emits the same `SID_TEST_FOUND` / `SID_AUTH_DECISION` / `RUN_SUMMARY` events
 * the vitamin panel bot uses so the existing UI grid + audit logs pick it up.
 */
export async function runUrineRoutineScan(options: {
  runId: string;
  config: RunConfig;
  signal: AbortSignal;
  emit?: EmitFn;
}): Promise<void> {
  const { runId, config, signal, emit } = options;
  const headless = config.headless !== false;
  const launchOpts = buildStellarPuppeteerLaunchOptions(headless, {});

  const fromEnvOnly = applyChromiumExecutablePathEnv(launchOpts);
  if (!fromEnvOnly) {
    const chosen = resolveChromeForStellarLaunch();
    if (chosen) {
      launchOpts.executablePath = chosen;
    } else {
      const hint = getChromeInstallHint();
      log(emit, 'error', hint);
      throw new Error(hint);
    }
  }

  log(emit, 'info', headless ? 'Launching Chromium (headless)…' : 'Launching Chromium (browser window)…');
  const { default: puppeteer } = await import('puppeteer');
  let browser: Browser | null = null;
  /**
   * On Stop we close the browser eagerly so any in-flight Puppeteer call
   * (login, setStatus, openSidWorksheet, clickSaveAndSettle, …) rejects with
   * "Target closed" and unwinds back to the `finally`. Without this the abort
   * would only land between SIDs / pages, which can be many seconds away.
   */
  const onAbort = (): void => {
    log(emit, 'warn', 'Stop requested — closing Chromium to abort in-flight steps.');
    if (browser) {
      void browser.close().catch(() => {
        /* already closing or closed */
      });
    }
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      const g = globalThis as unknown as { __name?: <T>(target: T, _name?: string) => T };
      if (typeof g.__name !== 'function') {
        g.__name = <T,>(target: T, _name?: string): T => target;
      }
    });
    await applyPageLowMemoryOptimizations(page);

    if (!URINE_ROUTINE_TICK_CHK_AUTH) {
      log(emit, 'info', 'Urine routine: filling defaults only — chkAuth ticking is disabled for this build.');
    }
    if (URINE_ROUTINE_ALWAYS_SAVE) {
      log(
        emit,
        'info',
        'Urine routine: Save is forced on (Readonly/Authenticate toggle ignored for CP004) — defaults are persisted without authentication.'
      );
    }

    if (signal.aborted) {
      log(emit, 'warn', 'Run aborted before login.');
      return;
    }

    log(emit, 'info', 'Logging in and opening sample worksheet…');
    const user = config.credentials?.username;
    const pass = config.credentials?.password;
    if (!user?.trim() || !pass) {
      throw new Error(
        'Missing LIS credentials: set LIS_USERNAME / LIS_PASSWORD (or CBC_LOGIN_* / LOGIN_*) in the server .env'
      );
    }
    await loginAndOpenWorksheet(page, {
      username: user.trim(),
      password: pass,
      primaryUrl: config.loginUrls?.primary,
      backupUrl: config.loginUrls?.backup,
    });

    if (signal.aborted) return;

    log(emit, 'info', `Setting business unit: ${config.businessUnit}`);
    await setBusinessUnit(page, config.businessUnit);

    if (config.fromDate || config.toDate || config.fromHour != null || config.toHour != null) {
      log(emit, 'info', 'Applying worksheet date/time filters…');
      await setWorksheetDateRange(
        page,
        config.fromDate,
        config.toDate,
        config.fromHour ?? null,
        config.toHour ?? null
      );
    }

    /** Set + commit test code *after* BU / date — those controls can clear `txtTestcode` on postback. */
    log(emit, 'info', `Locking worksheet test code filter to ${URINE_ROUTINE_TEST_CODE}…`);
    const initialGate = await ensureWorksheetTestCodeFilter(page, URINE_ROUTINE_TEST_CODE);
    if (!initialGate.ok) {
      throw new Error(
        `Worksheet test code filter could not be set to ${URINE_ROUTINE_TEST_CODE} (read back: ${initialGate.readBack ?? 'n/a'}). Search would return the wrong SIDs.`
      );
    }
    log(
      emit,
      'info',
      `Worksheet test code filter read-back OK (${initialGate.readBack ?? URINE_ROUTINE_TEST_CODE}).`
    );

    /** sid -> processed flag (already-filled or already-saved) so a later status sweep doesn't re-open. */
    const processedSids = new Set<string>();
    let modalsOpened = 0;
    let modalsSkipped = 0;

    /** Urine routine intentionally ignores `config.statusLabels` — only sweep "Registered". */
    const statuses = URINE_ROUTINE_STATUSES;
    if (config.statusLabels.length > 0) {
      log(
        emit,
        'info',
        `Urine routine: ignoring UI status filter [${config.statusLabels.join(', ')}] — using fixed status ${statuses.join(', ')}.`
      );
    }

    for (const status of statuses) {
      if (signal.aborted) break;
      log(emit, 'info', `Status filter: ${status}`);
      const statusOk = await setStatus(page, status);
      if (!statusOk) continue;
      const gate = await ensureWorksheetTestCodeFilter(page, URINE_ROUTINE_TEST_CODE);
      if (!gate.ok) {
        log(
          emit,
          'error',
          `Test code filter lost after status "${status}" (read back: ${gate.readBack ?? 'empty'}); skipping Search for this status to avoid wrong SIDs.`
        );
        continue;
      }
      const searched = await clickSearch(page);
      if (!searched) {
        log(emit, 'warn', `Search failed for status "${status}" (test code ${URINE_ROUTINE_TEST_CODE}).`);
        continue;
      }
      await waitForSampleGridAfterSearch(page);

      for (let pageNo = 0; pageNo < MAX_GRID_PAGES; pageNo += 1) {
        if (signal.aborted) break;
        const gatePage = await ensureWorksheetTestCodeFilter(page, URINE_ROUTINE_TEST_CODE);
        if (!gatePage.ok) {
          log(
            emit,
            'error',
            `Test code filter drifted before grid page ${pageNo + 1} (read back: ${gatePage.readBack ?? 'empty'}); stopping pagination for "${status}".`
          );
          break;
        }
        const pagerBefore = await getSampleGridPagerInfo(page);
        const sids = await listSidsForCurrentPage(page);
        log(
          emit,
          'info',
          `TestCode ${URINE_ROUTINE_TEST_CODE} / "${status}" page ${pageNo + 1}: ${sids.length} SID(s)`
        );

        for (const sid of sids) {
          if (signal.aborted) break;
          if (processedSids.has(sid)) {
            modalsSkipped += 1;
            emit?.({
              type: 'SID_SKIPPED',
              runId,
              sid,
              discoveredViaTestCode: URINE_ROUTINE,
              discoveredViaStatus: status,
              reason: 'already-resolved',
            });
            continue;
          }

          try {
            await openSidWorksheet(page, sid);
            await delayMs(150);
            const fillResult = await autofillUrineRoutineWorksheet(
              page,
              URINE_ROUTINE_NORMAL_DEFAULTS as unknown as Record<string, string>,
              URINE_ROUTINE_FIELD_ALIASES as unknown as Record<string, string[]>,
              URINE_ROUTINE_SKIP_PATTERNS,
              URINE_ROUTINE_TICK_CHK_AUTH
            );

            modalsOpened += 1;

            if (!fillResult.ok) {
              log(emit, 'warn', `SID ${sid}: ${fillResult.error || 'fill failed'}`);
              const hit: WorksheetTestHit = {
                testCode: URINE_ROUTINE,
                rawName: 'Complete Urine Examination',
                value: null,
                unit: null,
                abnormal: null,
                authorized: null,
                normalRange: null,
                borderColor: null,
              };
              emit?.({
                type: 'SID_TEST_FOUND',
                runId,
                sid,
                discoveredViaTestCode: URINE_ROUTINE,
                discoveredViaStatus: status,
                tests: [hit],
              });
              emit?.({
                type: 'SID_AUTH_DECISION',
                runId,
                sid,
                testCode: URINE_ROUTINE,
                decision: 'skip',
                reason: fillResult.error || 'urine routine: worksheet table not found',
                ageMonths: null,
                sex: null,
                writeMode: config.authenticate === true,
                applied: false,
                saveClicked: false,
              });
              processedSids.add(sid);
              continue;
            }

            const filledCount = fillResult.filledKeys.length;
            const summaryValue =
              filledCount > 0
                ? `Auto-filled ${filledCount} field${filledCount === 1 ? '' : 's'}`
                : fillResult.alreadyHadValueKeys.length > 0
                  ? `All ${fillResult.alreadyHadValueKeys.length} field(s) already had values`
                  : 'No fillable fields matched';
            const hit: WorksheetTestHit = {
              testCode: URINE_ROUTINE,
              rawName: 'Complete Urine Examination',
              value: summaryValue,
              unit: null,
              abnormal: null,
              authorized:
                URINE_ROUTINE_TICK_CHK_AUTH &&
                (fillResult.authTicked + fillResult.authAlreadyChecked > 0),
              normalRange: null,
              borderColor: null,
            };
            emit?.({
              type: 'SID_TEST_FOUND',
              runId,
              sid,
              discoveredViaTestCode: URINE_ROUTINE,
              discoveredViaStatus: status,
              tests: [hit],
            });

            /**
             * Urine routine ignores the Readonly/Authenticate toggle for Save:
             * defaults are the entire deliverable, so we persist them whenever the
             * fill mutated the modal. `writeMode` is still reported in the audit
             * event for parity with the vitamin bot, but it doesn't gate the click.
             */
            const writeMode = URINE_ROUTINE_ALWAYS_SAVE || config.authenticate === true;
            let saveClicked = false;
            if (URINE_ROUTINE_ALWAYS_SAVE && fillResult.mutated) {
              saveClicked = await clickSaveAndSettle(page);
              if (!saveClicked) {
                log(emit, 'warn', `SID ${sid}: Save click failed`);
              }
            }

            const reasonParts: string[] = [];
            if (filledCount > 0) reasonParts.push(`filled ${filledCount}`);
            if (fillResult.authTicked > 0) reasonParts.push(`ticked ${fillResult.authTicked}`);
            if (fillResult.authAlreadyChecked > 0)
              reasonParts.push(`already-auth ${fillResult.authAlreadyChecked}`);
            if (fillResult.alreadyHadValueKeys.length > 0)
              reasonParts.push(`pre-filled ${fillResult.alreadyHadValueKeys.length}`);
            if (fillResult.skippedSensitiveRows.length > 0)
              reasonParts.push(
                `skipped sensitive rows ${fillResult.skippedSensitiveRows.length} (Pus/Epithelial)`
              );
            if (fillResult.missingKeys.length > 0)
              reasonParts.push(`missing rows ${fillResult.missingKeys.length}`);

            let decision: 'auth' | 'skip' = 'auth';
            let applied = false;
            if (filledCount === 0) {
              decision = 'skip';
              applied = false;
            } else {
              applied = saveClicked;
            }

            emit?.({
              type: 'SID_AUTH_DECISION',
              runId,
              sid,
              testCode: URINE_ROUTINE,
              decision,
              reason: `urine routine: ${reasonParts.join(', ') || 'no-op'}`,
              ageMonths: null,
              sex: null,
              writeMode,
              applied,
              saveClicked,
            });
            processedSids.add(sid);
          } catch (e) {
            /** Stop closes the browser, which makes Puppeteer reject any in-flight call.
             * Don't pollute the log with that — the abort path already logged a clear
             * "Stop requested" line. */
            if (!signal.aborted) {
              const msg = e instanceof Error ? e.message : String(e);
              log(emit, 'warn', `SID ${sid}: modal open/fill failed: ${msg}`);
            }
          } finally {
            if (!signal.aborted) {
              await closeSidWorksheet(page).catch(() => {});
              await delayMs(200);
            }
          }
        }

        if (sids.length === 0) break;
        const firstBefore = await firstSidOnSampleGrid(page);
        const next = await navigateToNextSampleGridPage(page);
        if (!next) {
          log(emit, 'info', `No further pages for "${status}" (test code ${URINE_ROUTINE_TEST_CODE}).`);
          break;
        }
        const ok = await waitForSampleGridPageTurn(
          page,
          firstBefore,
          pagerBefore?.currentPage ?? null
        );
        if (!ok) {
          log(emit, 'warn', `Pager did not refresh for "${status}"; stopping pagination.`);
          break;
        }
      }
    }

    emit?.({
      type: 'RUN_SUMMARY',
      runId,
      uniqueSids: processedSids.size,
      modalsOpened,
      modalsSkipped,
    });
    log(
      emit,
      'info',
      `Run summary: ${processedSids.size} unique SID(s), ${modalsOpened} modal(s) opened, ${modalsSkipped} skipped via dedup.`
    );
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore — may already be closed by the abort handler */
      }
    }
  }
}

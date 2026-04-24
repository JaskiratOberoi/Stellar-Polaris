import type { RunConfig, TestCodeId, WorksheetTestHit, WsClientEvent } from '@stellar/shared';
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
import {
  closeSidWorksheet,
  extractSidWorksheet,
  openSidWorksheet,
  type WorksheetRow,
} from './lis/sidWorksheet.js';
import { matchTestCode } from '../config/testCodeMatchers.js';

const MAX_GRID_PAGES = 500;

function rowToHit(row: WorksheetRow, testCode: TestCodeId): WorksheetTestHit {
  return {
    testCode,
    rawName: row.rawName,
    value: row.value,
    unit: row.unit,
    abnormal: row.abnormal,
    authorized: row.authorized,
    normalRange: row.normalRange,
    borderColor: row.borderColor,
  };
}

export type EmitFn = (ev: WsClientEvent) => void;

function log(emit: EmitFn | undefined, level: 'info' | 'warn' | 'error', message: string) {
  const line = `[vitamin] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  emit?.({ type: 'LOG', level, message, ts: Date.now() });
}

export async function runVitaminPanelScan(options: {
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

  const { default: puppeteer } = await import('puppeteer');
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    // tsx/esbuild emits a `__name` helper for named functions that gets serialized into
    // every `page.evaluate(...)` payload but is undefined inside the browser context.
    // Install a no-op shim on every document (incl. after navigation) so callbacks run.
    await page.evaluateOnNewDocument(() => {
      const g = globalThis as unknown as { __name?: <T>(target: T, _name?: string) => T };
      if (typeof g.__name !== 'function') {
        g.__name = <T,>(target: T, _name?: string): T => target;
      }
    });
    await applyPageLowMemoryOptimizations(page);

    if (signal.aborted) {
      log(emit, 'warn', 'Run aborted before login.');
      return;
    }

    log(emit, 'info', 'Logging in and opening sample worksheet…');
    const user = config.credentials?.username;
    const pass = config.credentials?.password;
    if (!user?.trim() || !pass) {
      throw new Error('Missing LIS credentials: set LIS_USERNAME / LIS_PASSWORD (or CBC_LOGIN_* / LOGIN_*) in the server .env');
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

    const enabledCodes = new Set<TestCodeId>(config.testCodes);
    /** sid -> set of test codes already confirmed via the SID's worksheet modal. */
    const seenSids = new Map<string, Set<TestCodeId>>();
    let modalsOpened = 0;
    let modalsSkipped = 0;

    for (const code of config.testCodes) {
      if (signal.aborted) break;
      log(emit, 'info', `Setting test code: ${code}`);
      await setTestCode(page, code);
      for (const status of config.statusLabels) {
        if (signal.aborted) break;
        log(emit, 'info', `Status filter: ${status}`);
        const statusOk = await setStatus(page, status);
        if (!statusOk) continue;
        const searched = await clickSearch(page);
        if (!searched) {
          log(emit, 'warn', `Search failed for status "${status}" (test code ${code}).`);
          continue;
        }
        await waitForSampleGridAfterSearch(page);
        for (let pageNo = 0; pageNo < MAX_GRID_PAGES; pageNo += 1) {
          if (signal.aborted) break;
          const pagerBefore = await getSampleGridPagerInfo(page);
          const sids = await listSidsForCurrentPage(page);
          log(
            emit,
            'info',
            `TestCode ${code} / "${status}" page ${pageNo + 1}: ${sids.length} SID(s)`
          );

          for (const sid of sids) {
            if (signal.aborted) break;
            const known = seenSids.get(sid);
            const fullyResolved = !!known && [...enabledCodes].every((c) => known.has(c));
            if (fullyResolved) {
              modalsSkipped += 1;
              emit?.({
                type: 'SID_SKIPPED',
                runId,
                sid,
                discoveredViaTestCode: code,
                discoveredViaStatus: status,
                reason: 'already-resolved',
              });
              continue;
            }

            try {
              await openSidWorksheet(page, sid);
              const rows = await extractSidWorksheet(page);
              const tests: WorksheetTestHit[] = [];
              for (const row of rows) {
                if (row.isPanelHeader) continue;
                const matched = matchTestCode(row.rawName);
                if (matched && enabledCodes.has(matched)) {
                  tests.push(rowToHit(row, matched));
                }
              }
              const acc = seenSids.get(sid) ?? new Set<TestCodeId>();
              for (const t of tests) acc.add(t.testCode);
              seenSids.set(sid, acc);
              modalsOpened += 1;
              emit?.({
                type: 'SID_TEST_FOUND',
                runId,
                sid,
                discoveredViaTestCode: code,
                discoveredViaStatus: status,
                tests,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              log(emit, 'warn', `SID ${sid}: modal open/extract failed: ${msg}`);
            } finally {
              await closeSidWorksheet(page).catch(() => {});
            }
          }

          if (sids.length === 0) break;
          const firstBefore = await firstSidOnSampleGrid(page);
          const next = await navigateToNextSampleGridPage(page);
          if (!next) {
            log(emit, 'info', `No further pages for "${status}" (test code ${code}).`);
            break;
          }
          const ok = await waitForSampleGridPageTurn(page, firstBefore, pagerBefore?.currentPage ?? null);
          if (!ok) {
            log(emit, 'warn', `Pager did not refresh for "${status}"; stopping pagination.`);
            break;
          }
        }
      }
    }

    emit?.({
      type: 'RUN_SUMMARY',
      runId,
      uniqueSids: seenSids.size,
      modalsOpened,
      modalsSkipped,
    });
    log(
      emit,
      'info',
      `Run summary: ${seenSids.size} unique SID(s), ${modalsOpened} modal(s) opened, ${modalsSkipped} skipped via dedup.`
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}

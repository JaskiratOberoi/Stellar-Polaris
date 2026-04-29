import type { B12AuthKind, RunConfig, TestCodeId, WorksheetTestHit, WsClientEvent } from '@stellar/shared';
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
import { matchTestCode, normalizeTestName } from '../config/testCodeMatchers.js';
import {
  ANTI_CCP_HOLD_COMMENT,
  ANTI_CCP_INLINE_COMMENT,
  antiCcpNamePatternSources,
  b12NamePatternSources,
  decideAntiCcp,
  decideB12,
  decideProlactin,
  decideTotalIgE,
  decideVitD,
  HIGH_COMMENT,
  IGE_HIGH_COMMENT,
  igENamePatternSources,
  PROLACTIN_COMPANION_PATTERN_SOURCES,
  PROLACTIN_HOLD_COMMENT,
  PROLACTIN_INLINE_COMMENT,
  prolactinNamePatternSources,
  SUPPLEMENT_HISTORY_PROMPT,
  parseAgeSex,
  vitDNamePatternSources,
} from '../config/authRules.js';
import { ANTI_CCP, B12, PROLACTIN, TOTAL_IGE, VITAMIN_D } from '../config/testCodes.js';
import {
  clickSaveAndSettle,
  ensureHoldComment,
  ensureInlineComment,
  isRowAuthed,
  readPatientAgeSex,
  tickRowAuth,
  tickRowAuthResult,
} from './lis/auth.js';

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

/** LIS sometimes emits two rows that match the same test (e.g. link + value); keep one hit per code. */
function mergeTestsByCode(hits: WorksheetTestHit[]): WorksheetTestHit[] {
  const by = new Map<TestCodeId, WorksheetTestHit>();
  const hasValue = (h: WorksheetTestHit) => {
    const v = h.value;
    return v != null && String(v).trim() !== '';
  };
  for (const h of hits) {
    const prev = by.get(h.testCode);
    if (!prev) {
      by.set(h.testCode, h);
      continue;
    }
    if (hasValue(h) && !hasValue(prev)) by.set(h.testCode, h);
  }
  return [...by.values()];
}

function planKindToAuth(d: {
  kind: 'auth' | 'auth-with-note' | 'high-comment' | 'defer' | 'skip';
}): B12AuthKind {
  if (d.kind === 'auth') return 'auth';
  if (d.kind === 'auth-with-note') return 'auth-inline-comment';
  if (d.kind === 'high-comment') return 'high-comment';
  if (d.kind === 'defer') return 'defer';
  return 'skip';
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
    const b12NamePatterns = b12NamePatternSources();
    const vitDNamePatterns = vitDNamePatternSources();
    const igeNamePatterns = igENamePatternSources();
    const prolactinNamePatterns = prolactinNamePatternSources();
    const antiCcpNamePatterns = antiCcpNamePatternSources();
    const companionRe = PROLACTIN_COMPANION_PATTERN_SOURCES.map((s) => new RegExp(s, 'i'));
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
              const hasAllergyProfile = rows.some(
                (r) => normalizeTestName(r.rawName) === 'allergy profile'
              );
              let suppressedTotalIgEValue: string | null = null;
              let suppressedTotalIgEUnit: string | null = null;
              if (hasAllergyProfile && enabledCodes.has(TOTAL_IGE)) {
                for (const row of rows) {
                  if (row.isPanelHeader) continue;
                  if (matchTestCode(row.rawName) === TOTAL_IGE) {
                    suppressedTotalIgEValue = row.value;
                    suppressedTotalIgEUnit = row.unit;
                    break;
                  }
                }
              }
              const tests: WorksheetTestHit[] = [];
              for (const row of rows) {
                if (row.isPanelHeader) continue;
                const matched = matchTestCode(row.rawName);
                if (!matched || !enabledCodes.has(matched)) continue;
                if (matched === TOTAL_IGE && hasAllergyProfile) continue;
                tests.push(rowToHit(row, matched));
              }
              const deduped = mergeTestsByCode(tests);
              const acc = seenSids.get(sid) ?? new Set<TestCodeId>();
              for (const t of deduped) acc.add(t.testCode);
              if (enabledCodes.has(TOTAL_IGE) && hasAllergyProfile) acc.add(TOTAL_IGE);

              /**
               * Named data rows that are not one of our tracked tests. When the modal
               * has only Prolactin (BI180) as a tracked hit, TSH and Thyroid Profile I
               * are allowed companions and are filtered out here.
               */
              const otherTestRowsRaw = rows.filter((r) => {
                if (!String(r.rawName ?? '').trim()) return false;
                return matchTestCode(r.rawName) == null;
              });
              const eligibleSet = new Set(deduped.map((t) => t.testCode));
              const prolactinOnlyTracked = eligibleSet.has(PROLACTIN) && eligibleSet.size === 1;
              const otherTestRows = prolactinOnlyTracked
                ? otherTestRowsRaw.filter((r) => {
                    const n = normalizeTestName(r.rawName);
                    return !companionRe.some((re) => re.test(n));
                  })
                : otherTestRowsRaw;
              const hasOtherTests = otherTestRows.length > 0;
              const igeMixed = eligibleSet.has(TOTAL_IGE) && eligibleSet.size > 1;
              const prolactinMixed =
                eligibleSet.has(PROLACTIN) &&
                (eligibleSet.has(B12) || eligibleSet.has(VITAMIN_D) || eligibleSet.has(TOTAL_IGE));
              const antiCcpPresent = eligibleSet.has(ANTI_CCP);
              const antiCcpHasCompanions =
                antiCcpPresent && (eligibleSet.size > 1 || otherTestRowsRaw.length > 0);
              const gateBlocked = hasOtherTests || igeMixed || prolactinMixed || antiCcpHasCompanions;
              const gateReason = hasOtherTests
                ? (() => {
                    const names = [...new Set(otherTestRows.map((r) => r.rawName))];
                    const head = names.slice(0, 4).join(', ');
                    return `auth gate: other tests present in worksheet (manual review): ${head}${
                      names.length > 4 ? ', …' : ''
                    }`;
                  })()
                : igeMixed
                  ? 'auth gate: IgE cannot be authenticated alongside B12 or Vit D (manual review)'
                  : prolactinMixed
                    ? 'auth gate: Prolactin cannot be authenticated alongside B12 / Vit D / IgE (manual review)'
                    : 'auth gate: Anti-CCP must be the only test in the worksheet (manual review)';

              const needB12Auth = enabledCodes.has(B12) && deduped.some((t) => t.testCode === B12);
              const needVitDAuth = enabledCodes.has(VITAMIN_D) && deduped.some((t) => t.testCode === VITAMIN_D);
              const needIgEAuth =
                enabledCodes.has(TOTAL_IGE) && deduped.some((t) => t.testCode === TOTAL_IGE);
              const needProlactinAuth =
                enabledCodes.has(PROLACTIN) && deduped.some((t) => t.testCode === PROLACTIN);
              const needAntiCcpAuth =
                enabledCodes.has(ANTI_CCP) && deduped.some((t) => t.testCode === ANTI_CCP);

              type AuthEval = { testCode: TestCodeId; decision: B12AuthKind; reason: string };
              const evals: AuthEval[] = [];
              let ageMonths: number | null = null;
              let sex: 'M' | 'F' | null = null;
              if (
                !gateBlocked &&
                (needB12Auth || needVitDAuth || needIgEAuth || needProlactinAuth || needAntiCcpAuth)
              ) {
                const ageText = await readPatientAgeSex(page);
                const parsed = parseAgeSex(ageText);
                ageMonths = parsed.ageMonths;
                sex = parsed.sex;
              }
              if (gateBlocked) {
                if (needB12Auth) {
                  evals.push({ testCode: B12, decision: 'skip', reason: gateReason });
                }
                if (needVitDAuth) {
                  evals.push({ testCode: VITAMIN_D, decision: 'skip', reason: gateReason });
                }
                if (needIgEAuth) {
                  evals.push({ testCode: TOTAL_IGE, decision: 'skip', reason: gateReason });
                }
                if (needProlactinAuth) {
                  evals.push({ testCode: PROLACTIN, decision: 'skip', reason: gateReason });
                }
                if (needAntiCcpAuth) {
                  evals.push({ testCode: ANTI_CCP, decision: 'skip', reason: gateReason });
                }
                if (evals.length > 0) log(emit, 'warn', `SID ${sid}: ${gateReason}`);
              } else {
                if (needB12Auth) {
                  const b12Hit = deduped.find((t) => t.testCode === B12)!;
                  if (await isRowAuthed(page, b12NamePatterns)) {
                    evals.push({
                      testCode: B12,
                      decision: 'already-authed',
                      reason: 'B12 row already authenticated in LIS',
                    });
                  } else {
                    const d = decideB12(b12Hit.value, ageMonths);
                    evals.push({ testCode: B12, decision: planKindToAuth(d), reason: d.reason });
                  }
                }
                if (needVitDAuth) {
                  const vitDHit = deduped.find((t) => t.testCode === VITAMIN_D)!;
                  if (await isRowAuthed(page, vitDNamePatterns)) {
                    evals.push({
                      testCode: VITAMIN_D,
                      decision: 'already-authed',
                      reason: 'Vitamin D row already authenticated in LIS',
                    });
                  } else {
                    const d = decideVitD(vitDHit.value);
                    const decision = planKindToAuth(d);
                    evals.push({ testCode: VITAMIN_D, decision, reason: d.reason });
                    if (decision === 'high-comment' || decision === 'skip') {
                      log(emit, 'warn', `SID ${sid} Vit D (BI005): ${decision} — ${d.reason} (manual review)`);
                    }
                  }
                }
                if (needIgEAuth) {
                  const igeHit = deduped.find((t) => t.testCode === TOTAL_IGE)!;
                  if (await isRowAuthed(page, igeNamePatterns)) {
                    evals.push({
                      testCode: TOTAL_IGE,
                      decision: 'already-authed',
                      reason: 'IgE row already authenticated in LIS',
                    });
                  } else {
                    const d = decideTotalIgE(igeHit.value);
                    const decision = planKindToAuth(d);
                    evals.push({ testCode: TOTAL_IGE, decision, reason: d.reason });
                    if (decision === 'high-comment' || decision === 'skip') {
                      log(emit, 'warn', `SID ${sid} Total IgE (BI133): ${decision} — ${d.reason} (manual review)`);
                    }
                  }
                }
                if (needProlactinAuth) {
                  const prlHit = deduped.find((t) => t.testCode === PROLACTIN)!;
                  if (await isRowAuthed(page, prolactinNamePatterns)) {
                    evals.push({
                      testCode: PROLACTIN,
                      decision: 'already-authed',
                      reason: 'Prolactin row already authenticated in LIS',
                    });
                  } else {
                    const d = decideProlactin(prlHit.value, ageMonths, sex);
                    const decision = planKindToAuth(d);
                    evals.push({ testCode: PROLACTIN, decision, reason: d.reason });
                    if (decision === 'high-comment' || decision === 'skip') {
                      log(
                        emit,
                        'warn',
                        `SID ${sid} Prolactin (BI180): ${decision} — ${d.reason} (manual review)`
                      );
                    }
                  }
                }
                if (needAntiCcpAuth) {
                  const ccpHit = deduped.find((t) => t.testCode === ANTI_CCP)!;
                  if (await isRowAuthed(page, antiCcpNamePatterns)) {
                    evals.push({
                      testCode: ANTI_CCP,
                      decision: 'already-authed',
                      reason: 'Anti-CCP row already authenticated in LIS',
                    });
                  } else {
                    const d = decideAntiCcp(ccpHit.value);
                    const decision = planKindToAuth(d);
                    evals.push({ testCode: ANTI_CCP, decision, reason: d.reason });
                    if (decision === 'high-comment' || decision === 'skip') {
                      log(
                        emit,
                        'warn',
                        `SID ${sid} Anti-CCP (BI036): ${decision} — ${d.reason} (manual review)`
                      );
                    }
                  }
                }
              }
              for (const e of evals) {
                if (e.decision === 'defer') acc.delete(e.testCode);
              }
              seenSids.set(sid, acc);
              modalsOpened += 1;
              emit?.({
                type: 'SID_TEST_FOUND',
                runId,
                sid,
                discoveredViaTestCode: code,
                discoveredViaStatus: status,
                tests: deduped,
                ...(hasAllergyProfile && enabledCodes.has(TOTAL_IGE)
                  ? {
                      allergyProfileSuppressedTotalIgE: true,
                      suppressedTotalIgEValue,
                      suppressedTotalIgEUnit,
                    }
                  : {}),
                ...(gateBlocked
                  ? { authGateSkipped: true as const, authGateReason: gateReason }
                  : {}),
              });

              const writeMode = config.authenticate === true;
              const applied = new Map<TestCodeId, boolean>();
              let savePending = false;
              if (writeMode && evals.length > 0) {
                for (const e of evals) {
                  if (e.decision === 'already-authed') {
                    applied.set(e.testCode, false);
                    continue;
                  }
                  if (e.decision === 'auth' || e.decision === 'auth-inline-comment') {
                    if (e.testCode === PROLACTIN) {
                      const tick = await tickRowAuthResult(page, prolactinNamePatterns);
                      if (!tick.ok) {
                        applied.set(e.testCode, false);
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: chkAuth not found (Prolactin auth)`);
                      } else if (e.decision === 'auth-inline-comment') {
                        const r = await ensureInlineComment(page, prolactinNamePatterns, PROLACTIN_INLINE_COMMENT);
                        if (r === 'missing') {
                          applied.set(e.testCode, false);
                          log(emit, 'warn', `SID ${sid} ${e.testCode}: inline Comments not found (Prolactin auth+inline)`);
                        } else {
                          applied.set(e.testCode, true);
                          if (tick.changed || r === 'appended' || r === 'set') {
                            savePending = true;
                          }
                        }
                      } else {
                        applied.set(e.testCode, true);
                        if (tick.changed) {
                          savePending = true;
                        }
                      }
                    } else {
                      const pats =
                        e.testCode === B12
                          ? b12NamePatterns
                          : e.testCode === VITAMIN_D
                            ? vitDNamePatterns
                            : e.testCode === TOTAL_IGE
                              ? igeNamePatterns
                              : antiCcpNamePatterns;
                      const ok = await tickRowAuth(page, pats);
                      applied.set(e.testCode, ok);
                      if (ok) savePending = true;
                    }
                  } else if (e.decision === 'high-comment') {
                    if (e.testCode === TOTAL_IGE) {
                      const tick = await tickRowAuthResult(page, igeNamePatterns);
                      const r = await ensureInlineComment(page, igeNamePatterns, IGE_HIGH_COMMENT);
                      if (!tick.ok) {
                        applied.set(e.testCode, false);
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: chkAuth not found (high IgE + comment)`);
                      } else if (r === 'missing') {
                        applied.set(e.testCode, false);
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: inline Comments not found (high-comment)`);
                      } else {
                        applied.set(e.testCode, true);
                        if (tick.changed || r === 'appended' || r === 'set') {
                          savePending = true;
                        }
                      }
                    } else if (e.testCode === PROLACTIN) {
                      // >40: hold + per-test inline; no chkAuth.
                      const sampleR = await ensureHoldComment(page, PROLACTIN_HOLD_COMMENT);
                      const rowR = await ensureInlineComment(
                        page,
                        prolactinNamePatterns,
                        PROLACTIN_INLINE_COMMENT
                      );
                      const sampleOk = sampleR !== 'missing';
                      const rowOk = rowR !== 'missing';
                      applied.set(e.testCode, sampleOk && rowOk);
                      if (!sampleOk) {
                        log(
                          emit,
                          'warn',
                          `SID ${sid} ${e.testCode}: hold Comments not found (Prolactin >40)`
                        );
                      }
                      if (!rowOk) {
                        log(
                          emit,
                          'warn',
                          `SID ${sid} ${e.testCode}: inline Comments not found (Prolactin >40)`
                        );
                      }
                      if (
                        sampleR === 'appended' ||
                        sampleR === 'set' ||
                        rowR === 'appended' ||
                        rowR === 'set'
                      ) {
                        savePending = true;
                      }
                    } else if (e.testCode === ANTI_CCP) {
                      const sampleR = await ensureHoldComment(page, ANTI_CCP_HOLD_COMMENT);
                      const rowR = await ensureInlineComment(
                        page,
                        antiCcpNamePatterns,
                        ANTI_CCP_INLINE_COMMENT
                      );
                      const sampleOk = sampleR !== 'missing';
                      const rowOk = rowR !== 'missing';
                      applied.set(e.testCode, sampleOk && rowOk);
                      if (!sampleOk) {
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: hold Comments not found (Anti-CCP high)`);
                      }
                      if (!rowOk) {
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: inline Comments not found (Anti-CCP high)`);
                      }
                      if (
                        sampleR === 'appended' ||
                        sampleR === 'set' ||
                        rowR === 'appended' ||
                        rowR === 'set'
                      ) {
                        savePending = true;
                      }
                    } else {
                      const pats = e.testCode === B12 ? b12NamePatterns : vitDNamePatterns;
                      const sampleR = await ensureHoldComment(page, SUPPLEMENT_HISTORY_PROMPT);
                      const rowR = await ensureInlineComment(page, pats, HIGH_COMMENT);
                      const sampleOk = sampleR !== 'missing';
                      const rowOk = rowR !== 'missing';
                      applied.set(e.testCode, sampleOk && rowOk);
                      if (!sampleOk) {
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: hold Comments not found (high-comment)`);
                      }
                      if (!rowOk) {
                        log(emit, 'warn', `SID ${sid} ${e.testCode}: inline Comments not found (high-comment)`);
                      }
                      if (
                        sampleR === 'appended' ||
                        sampleR === 'set' ||
                        rowR === 'appended' ||
                        rowR === 'set'
                      ) {
                        savePending = true;
                      }
                    }
                  } else {
                    applied.set(e.testCode, false);
                  }
                }
              }
              const saveClicked = writeMode && savePending ? await clickSaveAndSettle(page) : false;
              for (const e of evals) {
                emit?.({
                  type: 'SID_AUTH_DECISION',
                  runId,
                  sid,
                  testCode: e.testCode,
                  decision: e.decision,
                  reason: e.reason,
                  ageMonths,
                  sex,
                  writeMode,
                  applied: applied.get(e.testCode) ?? false,
                  saveClicked: evals.length > 0 ? saveClicked : false,
                });
              }
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

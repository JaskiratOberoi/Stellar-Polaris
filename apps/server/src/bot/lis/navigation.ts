import type { ElementHandle } from 'puppeteer';
import type { Page, PagerInfo } from './types.js';
import { clickElement, delayMs, escapeXPathText, queryByXPath, typeElement } from './xpath.js';

const DEFAULT_PRIMARY_LOGIN_URL = 'http://122.161.198.159:88/login.aspx';
const DEFAULT_BACKUP_LOGIN_URL = 'http://192.168.1.51:88/login.aspx?ReturnUrl=%2f';

export type LoginCreds = {
  username: string;
  password: string;
  primaryUrl?: string;
  backupUrl?: string;
};

export async function loginAndOpenWorksheet(page: Page, creds: LoginCreds): Promise<void> {
  const primary = creds.primaryUrl || process.env.LIS_PRIMARY_URL || DEFAULT_PRIMARY_LOGIN_URL;
  const backup = creds.backupUrl || process.env.LIS_BACKUP_URL || DEFAULT_BACKUP_LOGIN_URL;
  try {
    await page.goto(primary, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch {
    await page.goto(backup, { waitUntil: 'networkidle2', timeout: 30000 });
  }

  await typeElement(page, ["//input[@type='text']"], creds.username);
  await typeElement(page, ["//input[@type='password']"], creds.password);
  await clickElement(page, [
    "//button[contains(text(), 'Login')]",
    "//input[@type='submit' and contains(@value, 'Login')]",
    "//button[@type='submit']",
    "//input[@type='submit']",
  ]);

  const t0 = Date.now();
  let sidebar = false;
  while (Date.now() - t0 < 20000) {
    const h = await queryByXPath(page, "//nav[@id='sidebar']");
    if (h && h.length > 0) {
      h.forEach((e: ElementHandle<Element>, i: number) => (i > 0 ? e.dispose() : 0));
      sidebar = true;
      break;
    }
    await delayMs(200);
  }
  if (!sidebar) await delayMs(2000);

  await clickElement(page, [
    "//nav[@id='sidebar']//a[@data-toggle='collapse' and @href='#Worksheet']",
    "//a[@data-toggle='collapse' and @href='#Worksheet']",
  ]);
  await delayMs(500);
  let submenuClicked = false;
  try {
    await clickElement(page, [
      "//ul[@id='Worksheet']//a[contains(@href, 'Sampleworksheet.aspx')]",
      "//ul[@id='Worksheet']//a[contains(@href, 'Sampleworksheet')]",
      "//ul[@id='Worksheet']//a[normalize-space(text())='Worksheet']",
      "//a[contains(translate(@href, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'sampleworksheet')]",
    ]);
    submenuClicked = true;
  } catch {
    /* fall through to JS */
  }

  if (!submenuClicked) {
    const opened = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const target = links.find((a) => {
        const href = String(a.getAttribute('href') || '').toLowerCase();
        const text = String(a.textContent || '').trim().toLowerCase();
        return href.includes('sampleworksheet') || (text === 'worksheet' && href.includes('worksheet'));
      });
      if (!target) return false;
      target.click();
      return true;
    });
    if (!opened) {
      throw new Error('Could not open Worksheet submenu');
    }
  }
  await delayMs(1800);
}

export async function setBusinessUnit(page: Page, businessUnit: string): Promise<void> {
  await clickElement(page, [
    "//span[contains(@class, 'select2-selection') and @title='Business Unit']",
    "//select[contains(@id,'BusinessUnit')]/following::span[contains(@class,'select2-selection')][1]",
  ]);
  await delayMs(450);
  await clickElement(page, [
    `//li[contains(@class, 'select2-results__option') and normalize-space(text())=${escapeXPathText(businessUnit)}]`,
    `//li[contains(@class, 'select2-results__option') and contains(text(), ${escapeXPathText(businessUnit)})]`,
  ]);
}

export async function setStatus(page: Page, statusLabel: string): Promise<boolean> {
  const setDirect = await page.evaluate((label) => {
    const select = document.querySelector("select[id*='ddlStatus'], select[name*='ddlStatus']");
    if (!select) return false;
    const opts = Array.from((select as HTMLSelectElement).options || []);
    const target = opts.find(
      (o) => (o.text || '').trim().toLowerCase() === String(label || '').toLowerCase()
    );
    if (!target) return false;
    (select as HTMLSelectElement).value = (target as HTMLOptionElement).value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const w = window as typeof window & { jQuery?: (sel: Element) => { data: (k: string) => unknown; val: (v: string) => { trigger: (e: string) => void } } };
    if (w.jQuery && w.jQuery(select as Element).data('select2')) {
      w.jQuery(select as Element).val((target as HTMLOptionElement).value).trigger('change');
    }
    return true;
  }, statusLabel);
  if (setDirect) {
    await delayMs(180);
    return true;
  }

  try {
    await clickElement(
      page,
      [
        "//select[contains(@id, 'ddlStatus')]/following::span[contains(@class, 'select2-selection')][1]",
        "//span[contains(@class, 'select2-selection') and @title='Status']",
      ],
      { retries: 2, waitTimeout: 1500 }
    );
    await delayMs(200);
    await clickElement(
      page,
      [
        `//li[contains(@class, 'select2-results__option') and normalize-space(text())=${escapeXPathText(statusLabel)}]`,
        `//li[contains(@class, 'select2-results__option') and contains(text(), ${escapeXPathText(statusLabel)})]`,
      ],
      { retries: 2, waitTimeout: 1500 }
    );
    return true;
  } catch {
    console.warn(`Could not switch status to "${statusLabel}". Skipping.`);
    return false;
  }
}

export async function setTestCode(page: Page, testCode: string): Promise<void> {
  const filled = await page.evaluate((code: string) => {
    const lower = (s: string | null | undefined) => String(s ?? '').toLowerCase();
    const candidates = Array.from(document.querySelectorAll('input, textarea')) as (
      | HTMLInputElement
      | HTMLTextAreaElement
    )[];
    const el = candidates.find((e) => {
      const id = lower(e.id);
      const nm = lower(e.getAttribute('name'));
      return id.includes('txttestcode') || nm.includes('txttestcode');
    });
    if (!el || (el as HTMLInputElement).disabled) return false;
    el.removeAttribute('readonly');
    el.focus();
    (el as HTMLInputElement).select?.();
    el.value = String(code);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }, testCode);
  if (filled) {
    await delayMs(180);
    return;
  }

  await typeElement(
    page,
    [
      "//input[contains(translate(@id,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'txttestcode')]",
      "//input[contains(translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'txttestcode')]",
      "//textarea[contains(translate(@id,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'txttestcode')]",
      "//textarea[contains(translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'txttestcode')]",
      "//input[contains(@id, 'txtTestcode')]",
      "//input[contains(@name, 'txtTestcode')]",
    ],
    testCode
  );
}

async function setWorksheetFromTimeHour(page: Page, hour: number): Promise<boolean> {
  if (hour == null || !Number.isFinite(Number(hour))) return false;
  const want = String(Number(hour));
  const ok = await page.evaluate((h) => {
    const sel = Array.from(document.querySelectorAll('select')).find((s) => {
      const id = (s.id || '').toLowerCase();
      const nm = (s.getAttribute('name') || '').toLowerCase();
      if (id.includes('ddlftime0') || nm.includes('ddlftime0')) return false;
      return id.includes('ddlftime') || nm.includes('ddlftime');
    });
    if (!sel) return false;
    const opts = Array.from((sel as HTMLSelectElement).options || []);
    const target = opts.find(
      (o) => String((o as HTMLOptionElement).value).trim() === h || String(o.textContent || o.text || '').trim() === h
    );
    if (!target) return false;
    (sel as HTMLSelectElement).value = (target as HTMLOptionElement).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const w = window as typeof window & { jQuery?: (el: Element) => { data: (k: string) => unknown; val: (v: string) => { trigger: (e: string) => void } } };
    if (w.jQuery && w.jQuery(sel as Element).data('select2')) {
      w.jQuery(sel as Element)
        .val((target as HTMLOptionElement).value)
        .trigger('change');
    }
    return true;
  }, want);
  if (ok) await delayMs(200);
  return ok;
}

async function setWorksheetToTimeHour(page: Page, hour: number): Promise<boolean> {
  if (hour == null || !Number.isFinite(Number(hour))) return false;
  const want = String(Number(hour));
  const ok = await page.evaluate((h) => {
    const sel = Array.from(document.querySelectorAll('select')).find((s) => {
      const id = (s.id || '').toLowerCase();
      const nm = (s.getAttribute('name') || '').toLowerCase();
      return id.includes('ddlftime0') || nm.includes('ddlftime0');
    });
    if (!sel) return false;
    const opts = Array.from((sel as HTMLSelectElement).options || []);
    const target = opts.find(
      (o) => String((o as HTMLOptionElement).value).trim() === h || String(o.textContent || o.text || '').trim() === h
    );
    if (!target) return false;
    (sel as HTMLSelectElement).value = (target as HTMLOptionElement).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const w = window as typeof window & { jQuery?: (el: Element) => { data: (k: string) => unknown; val: (v: string) => { trigger: (e: string) => void } } };
    if (w.jQuery && w.jQuery(sel as Element).data('select2')) {
      w.jQuery(sel as Element)
        .val((target as HTMLOptionElement).value)
        .trigger('change');
    }
    return true;
  }, want);
  if (ok) await delayMs(200);
  return ok;
}

async function setWorksheetDate(page: Page, inputIdSubstring: string, dateStr: string): Promise<boolean> {
  if (!dateStr) return false;
  const ok = await page.evaluate(
    (idSub, val) => {
      const input = document.querySelector(`input[id*='${idSub}']`) as HTMLInputElement | null;
      if (!input) return false;
      input.value = val;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    inputIdSubstring,
    dateStr
  );
  if (ok) await delayMs(200);
  return ok;
}

export async function setWorksheetDateRange(
  page: Page,
  fromDate: string | undefined,
  toDate: string | undefined,
  fromHour: number | null | undefined,
  toHour: number | null | undefined
): Promise<void> {
  const results: string[] = [];
  if (fromDate) {
    const ok = await setWorksheetDate(page, 'txtFdate', fromDate);
    results.push(`FromDate=${fromDate} ${ok ? 'OK' : 'FAIL'}`);
  }
  if (toDate) {
    const ok = await setWorksheetDate(page, 'txtTodate', toDate);
    results.push(`ToDate=${toDate} ${ok ? 'OK' : 'FAIL'}`);
  }
  if (fromHour != null && Number.isFinite(fromHour)) {
    const ok = await setWorksheetFromTimeHour(page, fromHour);
    results.push(`FromHour=${fromHour} ${ok ? 'OK' : 'FAIL'}`);
  }
  if (toHour != null && Number.isFinite(toHour)) {
    const ok = await setWorksheetToTimeHour(page, toHour);
    results.push(`ToHour=${toHour} ${ok ? 'OK' : 'FAIL'}`);
  }
  if (results.length > 0) {
    console.log(`Worksheet date range: ${results.join(', ')}`);
  }
}

export async function clickSearch(page: Page): Promise<boolean> {
  const clickedViaDom = await page.evaluate(() => {
    const el =
      (document.querySelector("input[id*='btnSearch']") as HTMLElement | null) ||
      (document.querySelector("input[type='submit'][value*='Search']") as HTMLElement | null) ||
      (Array.from(document.querySelectorAll('button')).find((b) => /search/i.test(String(b.textContent || ''))) as
        | HTMLElement
        | undefined);
    if (!el) return false;
    if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
    return true;
  });
  if (clickedViaDom) {
    await delayMs(700);
    return true;
  }

  try {
    await clickElement(
      page,
      [
        "//input[contains(@id, 'btnSearch')]",
        "//input[@type='submit' and contains(@value, 'Search')]",
        "//button[contains(text(), 'Search')]",
      ],
      { retries: 2, waitTimeout: 1500 }
    );
    await delayMs(700);
    return true;
  } catch {
    console.warn('Search click failed for current status.');
    return false;
  }
}

export async function listSidsForCurrentPage(page: Page): Promise<string[]> {
  const { sids, regionalSkipped } = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll("table[id*='gvSample'] tbody tr, table[id*='gv'] tbody tr")
    );
    const unique = new Set<string>();
    const out: string[] = [];
    let regionalSkipped = 0;
    const badValues = new Set(['save', 'desc', 'x', 'result', 'export']);
    const sidRegex = /^[A-Za-z0-9-]{5,}$/;
    for (const row of rows) {
      const table = (row as HTMLElement).closest('table');
      const tableId = String((table && (table as HTMLTableElement).id) || '').toLowerCase();
      if (!tableId.includes('gvsample')) continue;
      const regionBadge = row.querySelector("span[id*='lblmccCode'] span.badge, span[id*='lblmccCode'] span[class*='badge']");
      if (regionBadge) {
        regionalSkipped += 1;
        continue;
      }
      const byHp = Array.from(row.querySelectorAll('a')).find((a) => {
        const id = (a.id || '').toLowerCase();
        return id.includes('hpvail') || id.includes('hpvalid');
      });
      const sidLink =
        byHp ||
        row.querySelector('td:nth-child(4) a') ||
        row.querySelector('td:nth-child(3) a') ||
        row.querySelector('td:nth-child(5) a');
      if (!sidLink) continue;
      const sid = String(sidLink.textContent || (sidLink as HTMLElement).innerText || '').trim();
      const sidLower = sid.toLowerCase();
      if (!sidRegex.test(sid) || badValues.has(sidLower)) continue;
      if (!sid || unique.has(sid)) continue;
      unique.add(sid);
      out.push(sid);
    }
    return { sids: out, regionalSkipped };
  });
  if (regionalSkipped > 0) {
    console.log(`Skipped ${regionalSkipped} regional (non-Delhi) sample row(s) on this gvSample page.`);
  }
  return sids;
}

export async function firstSidOnSampleGrid(page: Page): Promise<string | null> {
  const sids = await listSidsForCurrentPage(page);
  return sids.length ? sids[0]! : null;
}

export async function getSampleGridPagerInfo(page: Page): Promise<PagerInfo | null> {
  return page.evaluate(() => {
    const grid = document.querySelector('table[id*="gvSample"]');
    const pgrRow = grid
      ? grid.querySelector('tr.pgr, tr[class*="pgr"]')
      : document.querySelector('tr.pgr, tr[class*="pgr"]');
    if (!pgrRow) return null;
    const nestedTable = pgrRow.querySelector('table');
    const tds = nestedTable
      ? Array.from(nestedTable.querySelectorAll('td'))
      : Array.from(pgrRow.querySelectorAll('td'));
    const elements: (Element | HTMLElement)[] = [];
    for (const td of tds) {
      const children = td.querySelectorAll('a, span');
      if (children.length) elements.push(...Array.from(children));
      else {
        const text = (td.textContent || '').trim();
        const n = parseInt(text, 10);
        if (!Number.isNaN(n) && n >= 1) elements.push(td);
      }
    }
    let currentPageNum: number | null = null;
    for (const el of elements) {
      const text = (el.textContent || '').trim();
      const n = parseInt(text, 10);
      if (Number.isNaN(n) || n < 1) continue;
      const isSpan = el.tagName === 'SPAN';
      const isActive =
        isSpan ||
        el.classList.contains('active') ||
        (window as Window).getComputedStyle(el as Element).fontWeight === 'bold' ||
        (el as HTMLElement).closest('td')?.classList?.toString().includes('selected');
      if (isActive && currentPageNum === null) currentPageNum = n;
    }
    const allPages = [
      ...new Set(
        elements
          .map((el) => parseInt((el.textContent || '').trim(), 10))
          .filter((n) => !Number.isNaN(n) && n >= 1)
      ),
    ].sort((a, b) => a - b);
    if (allPages.length === 0) return null;
    return {
      currentPage: currentPageNum || allPages[0]!,
      allPages: allPages.map((num) => ({ number: num })),
    };
  });
}

export async function waitForSampleGridAfterSearch(page: Page, timeoutMs = 15000): Promise<void> {
  try {
    await page.waitForSelector('table[id*="gvSample"]', { timeout: timeoutMs });
  } catch {
    /* some builds render slightly later */
  }
  await delayMs(400);
}

export async function navigateToNextSampleGridPage(page: Page): Promise<boolean> {
  const info = await getSampleGridPagerInfo(page);
  const currentPage = info?.currentPage ?? 1;
  const availablePages = info?.allPages ? info.allPages.map((p) => p.number) : [];
  const nextNum = availablePages.find((p) => p > currentPage);

  if (nextNum != null) {
    const clicked = await page.evaluate((targetPage) => {
      const grid = document.querySelector('table[id*="gvSample"]');
      const pgrRow = grid
        ? grid.querySelector('tr.pgr, tr[class*="pgr"]')
        : document.querySelector('tr.pgr, tr[class*="pgr"]');
      if (!pgrRow) return false;
      const links = Array.from(pgrRow.querySelectorAll('a'));
      const link = links.find((a) => (a.textContent || '').trim() === String(targetPage));
      if (!link) return false;
      if (link.classList.contains('aspNetDisabled')) return false;
      link.click();
      return true;
    }, nextNum);
    if (clicked) return true;
  }

  const nextViaDom = await page.evaluate(() => {
    const grid = document.querySelector('table[id*="gvSample"]');
    const pgrRow = grid
      ? grid.querySelector('tr.pgr, tr[class*="pgr"]')
      : document.querySelector('tr.pgr, tr[class*="pgr"]');
    const scope: Document | Element = pgrRow || grid || document;

    const tryClick = (el: Element | null) => {
      if (!el || (el as HTMLButtonElement).disabled) return false;
      const cls = String((el as HTMLElement).className || '');
      if (cls.includes('aspNetDisabled') || cls.includes('disabled')) return false;
      (el as HTMLButtonElement).removeAttribute('disabled');
      if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
      return true;
    };

    const anchors = Array.from(scope.querySelectorAll('a'));
    for (const a of anchors) {
      const t = (a.textContent || '').trim();
      const oc = String(a.getAttribute('onclick') || '');
      const href = String(a.getAttribute('href') || '');
      if (/Page\$Next/i.test(oc) || /Page\$Next/i.test(href)) {
        if (tryClick(a)) return true;
      }
      if (t === 'Next' || t === '>' || t === '»') {
        if (tryClick(a)) return true;
      }
    }

    const byId =
      (document.querySelector("a[id*='lnkNext']") as HTMLElement | null) ||
      (document.querySelector("a[id*='LinkButton'][id*='Next']") as HTMLElement | null);
    if (byId && tryClick(byId)) return true;

    return false;
  });
  if (nextViaDom) return true;

  try {
    const handles = await queryByXPath(
      page,
      "//table[contains(@id,'gvSample')]//tr[contains(@class,'pgr')]//a[" +
        "contains(translate(normalize-space(text()), 'NEXT', 'next'), 'next') or " +
        "contains(@onclick, 'Page$Next') or contains(@href, 'Page$Next')]"
    );
    if (handles && handles.length > 0) {
      const el = handles[0]!;
      for (let i = 1; i < handles.length; i++) {
        void handles[i]!.dispose();
      }
      const disabled = await page.evaluate(
        (node) =>
          !node ||
          (node as Element).classList.contains('aspNetDisabled') ||
          (node as Element).classList.contains('disabled'),
        el
      );
      if (!disabled) {
        await page.evaluate(
          (node) => (node as HTMLElement).scrollIntoView({ block: 'center' }),
          el
        );
        await delayMs(80);
        await el.click();
        return true;
      }
      el.dispose();
    }
  } catch {
    /* fall through */
  }

  return false;
}

export async function waitForSampleGridPageTurn(
  page: Page,
  prevFirstSid: string | null,
  prevPagerPage: number | null,
  timeoutMs = 12000
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await delayMs(200);
    const first = await firstSidOnSampleGrid(page);
    if (prevFirstSid != null && first != null && first !== prevFirstSid) return true;
    if (prevFirstSid == null && first != null) return true;
    const info = await getSampleGridPagerInfo(page);
    if (info && prevPagerPage != null && info.currentPage != null && info.currentPage !== prevPagerPage) {
      return true;
    }
  }
  return false;
}

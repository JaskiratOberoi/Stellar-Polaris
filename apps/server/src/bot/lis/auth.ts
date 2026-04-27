import type { Page } from 'puppeteer';
import { delayMs } from './xpath.js';

export async function readPatientAgeSex(page: Page): Promise<string> {
  const h = await page.$("span[id*='lblAgeSex']");
  if (!h) return '';
  return (await h.evaluate((el) => (el as HTMLElement).textContent || '')) ?? '';
}

export async function isRowAuthed(page: Page, patternSources: string[]): Promise<boolean> {
  return page.evaluate(
    (sources: string[]) => {
      const norm = (raw: string) =>
        String(raw ?? '')
          .replace(/\u00A0/g, ' ')
          .replace(/[\u2018\u2019\u201A\u2032\u0060]/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const matchName = (raw: string) => {
        const n = norm(raw);
        if (!n) return false;
        for (const s of sources) {
          try {
            if (new RegExp(s, 'i').test(n)) return true;
          } catch {
            /* ignore */
          }
        }
        return false;
      };
      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) return false;
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      for (const row of rows) {
        const nameEl = row.querySelector("span[id*='lblTestname']");
        if (!nameEl) continue;
        const raw = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!matchName(raw)) continue;
        // Skip section/panel header rows (no value cell) — same rule as extractSidWorksheet.
        const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']");
        if (!valueEl) continue;
        const auth = row.querySelector<HTMLInputElement>("input[type='checkbox'][id*='chkAuth']");
        return !!auth?.checked;
      }
      return false;
    },
    patternSources
  );
}

/** `changed` is true when the row’s `chkAuth` was off and is now ticked. */
export type TickRowAuthResult = { ok: boolean; changed: boolean };

/**
 * Ticks the worksheet row’s `chkAuth` for the first matching data row (skips section headers).
 */
export async function tickRowAuthResult(page: Page, patternSources: string[]): Promise<TickRowAuthResult> {
  return page.evaluate(
    (sources: string[]) => {
      const norm = (raw: string) =>
        String(raw ?? '')
          .replace(/\u00A0/g, ' ')
          .replace(/[\u2018\u2019\u201A\u2032\u0060]/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const matchName = (raw: string) => {
        const n = norm(raw);
        if (!n) return false;
        for (const s of sources) {
          try {
            if (new RegExp(s, 'i').test(n)) return true;
          } catch {
            /* ignore */
          }
        }
        return false;
      };
      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) return { ok: false, changed: false };
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      for (const row of rows) {
        const nameEl = row.querySelector("span[id*='lblTestname']");
        if (!nameEl) continue;
        const raw = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!matchName(raw)) continue;
        const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']");
        if (!valueEl) continue;
        const auth = row.querySelector<HTMLInputElement>("input[type='checkbox'][id*='chkAuth']");
        if (!auth) return { ok: false, changed: false };
        if (auth.checked) return { ok: true, changed: false };
        auth.click();
        auth.dispatchEvent(new Event('input', { bubbles: true }));
        auth.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, changed: true };
      }
      return { ok: false, changed: false };
    },
    patternSources
  );
}

export async function tickRowAuth(page: Page, patternSources: string[]): Promise<boolean> {
  const r = await tickRowAuthResult(page, patternSources);
  return r.ok;
}

export type SampleCommentResult = 'already' | 'appended' | 'set' | 'missing';

export async function ensureSampleComment(page: Page, line: string): Promise<SampleCommentResult> {
  return page.evaluate((text: string) => {
    const el = document.querySelector<HTMLTextAreaElement>("textarea[id*='txtSampleComments']");
    if (!el) return 'missing';
    const cur = (el.value || '').trim();
    if (cur.includes(text)) return 'already';
    const next = cur ? `${cur}\n${text}` : text;
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return cur ? 'appended' : 'set';
  }, line);
}

/**
 * Per-row Comments (`txtComments` in the grid row), e.g. Total IgE high-result note.
 * Does not use the modal-level `txtSampleComments` textarea.
 */
export async function ensureRowComment(
  page: Page,
  patternSources: string[],
  line: string
): Promise<SampleCommentResult> {
  return page.evaluate(
    (payload: { sources: string[]; text: string }) => {
      const { sources, text } = payload;
      const norm = (raw: string) =>
        String(raw ?? '')
          .replace(/\u00A0/g, ' ')
          .replace(/[\u2018\u2019\u201A\u2032\u0060]/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const matchName = (raw: string) => {
        const n = norm(raw);
        if (!n) return false;
        for (const s of sources) {
          try {
            if (new RegExp(s, 'i').test(n)) return true;
          } catch {
            /* ignore */
          }
        }
        return false;
      };
      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) return 'missing';
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      for (const row of rows) {
        const nameEl = row.querySelector("span[id*='lblTestname']");
        if (!nameEl) continue;
        const raw = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!matchName(raw)) continue;
        const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']");
        if (!valueEl) continue;
        const el = row.querySelector<HTMLTextAreaElement>("textarea[id*='txtComments']");
        if (!el) continue;
        const cur = (el.value || '').trim();
        if (cur.includes(text)) return 'already';
        const next = cur ? `${cur}\n${text}` : text;
        el.value = next;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return cur ? 'appended' : 'set';
      }
      return 'missing';
    },
    { sources: patternSources, text: line }
  );
}

export async function clickSampleSave(page: Page): Promise<boolean> {
  const selectors = [
    "input[type='submit'][id*='btnSave']",
    "input[type='button'][id*='btnSave']",
    "input[type='submit'][id*='Save']",
    "input[type='button'][id*='Save']",
  ];
  for (const sel of selectors) {
    const h = await page.$(sel);
    if (h) {
      const box = await h.boundingBox();
      if (box && box.width > 0) {
        await h.click();
        return true;
      }
    }
  }
  const clicked = await page.evaluate(() => {
    const pick = (els: NodeListOf<Element> | HTMLElement[]) => {
      for (const el of Array.from(els)) {
        const h = el as HTMLElement;
        if (h.offsetParent === null) continue;
        const v = (h as HTMLInputElement).value;
        if (v && v.trim() === 'Save' && h.tagName === 'INPUT') {
          h.click();
          return true;
        }
        const t = h.textContent?.trim();
        if (t === 'Save' && (h.tagName === 'A' || h.tagName === 'BUTTON')) {
          h.click();
          return true;
        }
      }
      return false;
    };
    if (pick(document.querySelectorAll("input[type='button'], input[type='submit']"))) return true;
    if (pick(document.querySelectorAll('a.btn, button'))) return true;
    return false;
  });
  if (clicked) return true;
  return false;
}

export async function clickSaveAndSettle(page: Page): Promise<boolean> {
  const ok = await clickSampleSave(page);
  if (ok) await delayMs(800);
  return ok;
}

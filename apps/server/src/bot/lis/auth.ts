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
      const classifyBorder = (
        input: HTMLTextAreaElement | HTMLInputElement | null
      ): 'red' | 'green' | 'other' | null => {
        if (!input) return null;
        const inline = (input.getAttribute('style') || '').toLowerCase();
        if (/border-color\s*:\s*red/.test(inline)) return 'red';
        if (/border-color\s*:\s*green/.test(inline)) return 'green';
        const computed = window.getComputedStyle(input);
        const c = (computed.borderTopColor || '').toLowerCase();
        if (/^rgb\(255,\s*0,\s*0\)$|^red$/.test(c)) return 'red';
        if (/^rgb\(0,\s*128,\s*0\)$|^green$/.test(c)) return 'green';
        return 'other';
      };
      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) return false;
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      const dataRows: { row: HTMLTableRowElement; raw: string }[] = [];
      for (const row of rows) {
        const nameEl = row.querySelector("span[id*='lblTestname']");
        if (!nameEl) continue;
        const raw = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!matchName(raw)) continue;
        const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']");
        if (!valueEl) continue;
        dataRows.push({ row, raw });
      }
      if (dataRows.length === 0) return false;
      const picked =
        dataRows.find((d) => /\bnephelometry\b/i.test(d.raw)) ??
        dataRows.find((d) => {
          const ve = d.row.querySelector(
            "textarea[id*='txtValue'], input[id*='txtValue']"
          ) as HTMLInputElement | HTMLTextAreaElement | null;
          return classifyBorder(ve) === 'red';
        }) ??
        dataRows[0];
      const auth = picked.row.querySelector<HTMLInputElement>("input[type='checkbox'][id*='chkAuth']");
      return !!auth?.checked;
    },
    patternSources
  );
}

/** `changed` is true when the row’s `chkAuth` was off and is now ticked. */
export type TickRowAuthResult = { ok: boolean; changed: boolean };

/**
 * Ticks the worksheet row’s `chkAuth` for the preferred matching data row (RA Factor: Nephelometry row
 * when both header and detail match the same patterns).
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
      const classifyBorder = (
        input: HTMLTextAreaElement | HTMLInputElement | null
      ): 'red' | 'green' | 'other' | null => {
        if (!input) return null;
        const inline = (input.getAttribute('style') || '').toLowerCase();
        if (/border-color\s*:\s*red/.test(inline)) return 'red';
        if (/border-color\s*:\s*green/.test(inline)) return 'green';
        const computed = window.getComputedStyle(input);
        const c = (computed.borderTopColor || '').toLowerCase();
        if (/^rgb\(255,\s*0,\s*0\)$|^red$/.test(c)) return 'red';
        if (/^rgb\(0,\s*128,\s*0\)$|^green$/.test(c)) return 'green';
        return 'other';
      };
      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) return { ok: false, changed: false };
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      const dataRows: { row: HTMLTableRowElement; raw: string }[] = [];
      for (const row of rows) {
        const nameEl = row.querySelector("span[id*='lblTestname']");
        if (!nameEl) continue;
        const raw = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!matchName(raw)) continue;
        const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']");
        if (!valueEl) continue;
        dataRows.push({ row, raw });
      }
      if (dataRows.length === 0) return { ok: false, changed: false };
      const picked =
        dataRows.find((d) => /\bnephelometry\b/i.test(d.raw)) ??
        dataRows.find((d) => {
          const ve = d.row.querySelector(
            "textarea[id*='txtValue'], input[id*='txtValue']"
          ) as HTMLInputElement | HTMLTextAreaElement | null;
          return classifyBorder(ve) === 'red';
        }) ??
        dataRows[0];
      const auth = picked.row.querySelector<HTMLInputElement>("input[type='checkbox'][id*='chkAuth']");
      if (!auth) return { ok: false, changed: false };
      if (auth.checked) return { ok: true, changed: false };
      auth.click();
      auth.dispatchEvent(new Event('input', { bubbles: true }));
      auth.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, changed: true };
    },
    patternSources
  );
}

export async function tickRowAuth(page: Page, patternSources: string[]): Promise<boolean> {
  const r = await tickRowAuthResult(page, patternSources);
  return r.ok;
}

export type SampleCommentResult = 'already' | 'appended' | 'set' | 'missing';

/**
 * Appends a line to the **hold** Comments field (modal-level, top right, `txtSampleComments`).
 * LIS shows this as "Comments" — we call it "hold" in code to distinguish from per-row inline comments.
 */
export async function ensureHoldComment(page: Page, line: string): Promise<SampleCommentResult> {
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
 * Appends a line to the **inline** Comments field for a matched test row (`txtComments` in `gvWorksheet`),
 * e.g. Total IgE high note or Prolactin borderline note. LIS shows this in the per-test "Comments" column;
 * we call it "inline" in code. Does not touch the hold `txtSampleComments` area.
 */
export async function ensureInlineComment(
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
      const classifyBorder = (
        input: HTMLTextAreaElement | HTMLInputElement | null
      ): 'red' | 'green' | 'other' | null => {
        if (!input) return null;
        const inline = (input.getAttribute('style') || '').toLowerCase();
        if (/border-color\s*:\s*red/.test(inline)) return 'red';
        if (/border-color\s*:\s*green/.test(inline)) return 'green';
        const computed = window.getComputedStyle(input);
        const c = (computed.borderTopColor || '').toLowerCase();
        if (/^rgb\(255,\s*0,\s*0\)$|^red$/.test(c)) return 'red';
        if (/^rgb\(0,\s*128,\s*0\)$|^green$/.test(c)) return 'green';
        return 'other';
      };
      const table = document.querySelector("table[id*='gvWorksheet']");
      if (!table) return 'missing';
      const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
      const dataRows: { row: HTMLTableRowElement; raw: string }[] = [];
      for (const row of rows) {
        const nameEl = row.querySelector("span[id*='lblTestname']");
        if (!nameEl) continue;
        const raw = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
        if (!matchName(raw)) continue;
        const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']");
        if (!valueEl) continue;
        const commentEl = row.querySelector<HTMLTextAreaElement>("textarea[id*='txtComments']");
        if (!commentEl) continue;
        dataRows.push({ row, raw });
      }
      if (dataRows.length === 0) return 'missing';
      const picked =
        dataRows.find((d) => /\bnephelometry\b/i.test(d.raw)) ??
        dataRows.find((d) => {
          const ve = d.row.querySelector(
            "textarea[id*='txtValue'], input[id*='txtValue']"
          ) as HTMLInputElement | HTMLTextAreaElement | null;
          return classifyBorder(ve) === 'red';
        }) ??
        dataRows[0];
      const el = picked.row.querySelector<HTMLTextAreaElement>("textarea[id*='txtComments']");
      if (!el) return 'missing';
      const cur = (el.value || '').trim();
      if (cur.includes(text)) return 'already';
      const next = cur ? `${cur}\n${text}` : text;
      el.value = next;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return cur ? 'appended' : 'set';
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

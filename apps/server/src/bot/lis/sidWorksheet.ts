import type { Page } from './types.js';
import { clickElement, delayMs, escapeXPathText } from './xpath.js';

/** A single row scraped from the SID worksheet modal (`gvWorksheet`). */
export type WorksheetRow = {
  rawName: string;
  normalizedName: string;
  value: string | null;
  unit: string | null;
  abnormal: boolean | null;
  authorized: boolean | null;
  normalRange: string | null;
  borderColor: 'red' | 'green' | 'other' | null;
  isPanelHeader: boolean;
};

const MODAL_TABLE_SELECTOR = "table[id*='gvWorksheet']";

/** True when the gvWorksheet modal is laid out and visible in the viewport. */
export async function isSidWorksheetVisible(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const table = document.querySelector(sel);
    if (!table) return false;
    const style = window.getComputedStyle(table as Element);
    const rect = (table as Element).getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, MODAL_TABLE_SELECTOR);
}

/**
 * Click the SID anchor in the current sample-grid row and wait for the
 * `gvWorksheet` modal to render. Caller is responsible for closing it.
 */
export async function openSidWorksheet(page: Page, sid: string, timeoutMs = 12000): Promise<void> {
  const sidLiteral = escapeXPathText(sid);
  await clickElement(
    page,
    [
      `//a[contains(@id,'hpVail') and normalize-space(text())=${sidLiteral}]`,
      `//table[contains(@id,'gvSample')]//a[normalize-space(text())=${sidLiteral}]`,
      `//tr//a[contains(normalize-space(text()), ${sidLiteral})]`,
    ],
    { retries: 3, waitTimeout: 4000 }
  );

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isSidWorksheetVisible(page)) return;
    await delayMs(150);
  }
  throw new Error(`SID worksheet modal did not open for ${sid} within ${timeoutMs}ms`);
}

/**
 * Read every test row inside the current `gvWorksheet` modal. Panel header rows
 * (no value, no unit, no checkboxes) are returned with `isPanelHeader: true` so
 * callers can ignore them or use them as section dividers.
 */
export async function extractSidWorksheet(page: Page): Promise<WorksheetRow[]> {
  return page.evaluate((tableSel: string) => {
    const folded = (s: string | null | undefined): string =>
      String(s ?? '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u2018\u2019\u201A\u2032\u0060]/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const classifyBorder = (input: HTMLTextAreaElement | HTMLInputElement | null): 'red' | 'green' | 'other' | null => {
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

    const out: WorksheetRow[] = [];
    const table = document.querySelector(tableSel);
    if (!table) return out;
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];
    for (const row of rows) {
      const nameEl = row.querySelector("span[id*='lblTestname']") as HTMLElement | null;
      if (!nameEl) continue;
      const rawName = (nameEl.textContent || '').replace(/\u00A0/g, ' ').trim();
      if (!rawName) continue;

      const valueEl = row.querySelector("textarea[id*='txtValue'], input[id*='txtValue']") as
        | HTMLTextAreaElement
        | HTMLInputElement
        | null;
      const unitEl = row.querySelector("span[id*='lblTestunit']") as HTMLElement | null;
      const abEl = row.querySelector("input[id*='chkAbnormal']") as HTMLInputElement | null;
      const authEl = row.querySelector("input[id*='chkAuth']") as HTMLInputElement | null;
      const rangeEl = row.querySelector("[id*='popNormalRanges'] [id*='Label110'], [id*='popNormalRanges'] span") as
        | HTMLElement
        | null;

      const valueText =
        (valueEl &&
          ((valueEl as HTMLTextAreaElement).value ||
            valueEl.getAttribute('title') ||
            valueEl.textContent ||
            '')) ||
        '';
      const trimmedValue = valueText.trim();

      const unitText = (unitEl?.textContent || '').trim();

      // Section headings (e.g. "ALLERGY PROFILE", "Total IgE") can have an empty
      // lblTestunit span but no value control; those are not data rows.
      const isPanelHeader = !valueEl;

      out.push({
        rawName,
        normalizedName: folded(rawName),
        value: trimmedValue ? trimmedValue : null,
        unit: unitText ? unitText : null,
        abnormal: abEl ? !!abEl.checked : null,
        authorized: authEl ? !!authEl.checked : null,
        normalRange: rangeEl ? (rangeEl.textContent || '').trim() || null : null,
        borderColor: valueEl ? classifyBorder(valueEl) : null,
        isPanelHeader,
      });
    }
    return out;
  }, MODAL_TABLE_SELECTOR);
}

/**
 * Best-effort modal close. Tries the close anchor (`lnkClose`), then the legacy
 * `ImageButton1`, then Escape, then a JS-only fallback that hides the wrapper.
 * Returns true if the modal is no longer visible.
 */
export async function closeSidWorksheet(page: Page): Promise<boolean> {
  if (!(await isSidWorksheetVisible(page))) return true;

  try {
    await clickElement(
      page,
      [
        "//a[contains(@id,'lnkClose')]",
        "//a[contains(@class,'btn-danger') and normalize-space(text())='X']",
        "//input[@type='image' and contains(@id,'ImageButton1')]",
        "//input[@type='image' and contains(@name,'ImageButton1')]",
        "//td[@align='right' and @width='1']//input[@type='image' and contains(@src, 'Close.gif')]",
      ],
      { retries: 2, waitTimeout: 1500 }
    );
  } catch {
    /* fall through to Escape / DOM-hide */
  }

  await page.keyboard.press('Escape').catch(() => {});

  await page
    .evaluate((sel: string) => {
      const modal = document.querySelector(sel);
      if (modal) {
        const wraps = [
          (modal as Element).closest('.modal'),
          (modal as Element).closest('.modal-dialog'),
          (modal as Element).closest('.modal-content'),
          (modal as Element).closest("[id*='pnlPerson']"),
        ].filter(Boolean) as HTMLElement[];
        for (const wrap of wraps) {
          wrap.style.display = 'none';
          wrap.setAttribute('aria-hidden', 'true');
        }
      }
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) backdrop.remove();
      document.body.classList.remove('modal-open');
    }, MODAL_TABLE_SELECTOR)
    .catch(() => {});

  await delayMs(200);
  return !(await isSidWorksheetVisible(page));
}

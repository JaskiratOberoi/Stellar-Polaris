import { B12, TOTAL_IGE, VITAMIN_D } from './testCodes.js';
import { TEST_CODE_NAME_PATTERNS } from './testCodeMatchers.js';

/** Per-row B12 / Vit D Comments (`txtComments`) when value is out of range high. */
export const HIGH_COMMENT = 'Result Rechecked, kindly check with supplement history.';

/** Modal-level sample Comments box (top right, `txtSampleComments`) for B12 / Vit D high. */
export const SUPPLEMENT_HISTORY_PROMPT = '? Supplement History';

export const IGE_HIGH_COMMENT =
  'Result Rechecked, kindly correlate clinically. Advice: Allergy Profile.';

export type B12Decision =
  | { kind: 'auth'; reason: string }
  | { kind: 'high-comment'; reason: string }
  | { kind: 'defer'; reason: string }
  | { kind: 'skip'; reason: string };

/** Regex sources for BI235 row name matching inside `page.evaluate` (must match testCodeMatchers B12). */
export function b12NamePatternSources(): string[] {
  return TEST_CODE_NAME_PATTERNS[B12].map((r) => r.source);
}

export type VitDDecision =
  | { kind: 'auth'; reason: string }
  | { kind: 'high-comment'; reason: string }
  | { kind: 'defer'; reason: string }
  | { kind: 'skip'; reason: string };

/** BI005 row name patterns for `isRowAuthed` / `tickRowAuth` in the modal. */
export function vitDNamePatternSources(): string[] {
  return TEST_CODE_NAME_PATTERNS[VITAMIN_D].map((r) => r.source);
}

/** Unisex 5-100. Same outcome shape as B12 (no age in range — empty defers, below skips, over high-comment). */
export function decideVitD(rawValue: string | null): VitDDecision {
  const lower = 5;
  const upper = 100;
  const v = (rawValue ?? '').trim();
  if (!v) return { kind: 'defer', reason: 'value not yet entered; will re-check' };
  if (/^>/.test(v)) return { kind: 'high-comment', reason: `value ${v} above scale` };
  const n = Number(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return { kind: 'skip', reason: `unparseable value '${v}' (manual review)` };
  if (n < lower) return { kind: 'skip', reason: `value ${n} < ${lower} (low, manual review)` };
  if (n > upper) return { kind: 'high-comment', reason: `value ${n} > ${upper}` };
  return { kind: 'auth', reason: `value ${n} within ${lower}-${upper}` };
}

export type IgEDecision =
  | { kind: 'auth'; reason: string }
  | { kind: 'high-comment'; reason: string }
  | { kind: 'defer'; reason: string }
  | { kind: 'skip'; reason: string };

export function igENamePatternSources(): string[] {
  return TEST_CODE_NAME_PATTERNS[TOTAL_IGE].map((r) => r.source);
}

/** 0-100y reference 10-190. Per-row `txtComments` (not `txtSampleComments`) on high. */
export function decideTotalIgE(rawValue: string | null): IgEDecision {
  const lower = 10;
  const upper = 190;
  const v = (rawValue ?? '').trim();
  if (!v) return { kind: 'defer', reason: 'value not yet entered; will re-check' };
  if (/^>/.test(v)) return { kind: 'high-comment', reason: `value ${v} above scale` };
  const n = Number(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return { kind: 'skip', reason: `unparseable value '${v}' (manual review)` };
  if (n < lower) return { kind: 'skip', reason: `value ${n} < ${lower} (low, manual review)` };
  if (n > upper) return { kind: 'high-comment', reason: `value ${n} > ${upper}` };
  return { kind: 'auth', reason: `value ${n} within ${lower}-${upper}` };
}

/**
 * Parse `lblAgeSex` text, e.g. "22  Year(s)Male" / "9 Month(s)Female".
 */
export function parseAgeSex(text: string): { ageMonths: number | null; sex: 'M' | 'F' | null } {
  const t = String(text ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = t.match(/(\d+)\s*(year|month|day|wk|week)s?/i);
  let ageMonths: number | null = null;
  if (m) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith('year')) ageMonths = n * 12;
    else if (u.startsWith('month')) ageMonths = n;
    else if (u.startsWith('week') || u.startsWith('wk')) ageMonths = Math.round(n / 4.345);
    else ageMonths = Math.floor(n / 30);
  }
  const sex: 'M' | 'F' | null = /female/i.test(t) ? 'F' : /male/i.test(t) ? 'M' : null;
  return { ageMonths, sex };
}

/**
 * Age rules: 0-11 months → upper 883; 0-100+ years → 914. Lower 180.
 * Empty value → defer (re-check). Unparseable / <180 → skip. `>` or > upper → high-comment. In range → auth.
 */
export function decideB12(rawValue: string | null, ageMonths: number | null): B12Decision {
  const upper = ageMonths != null && ageMonths < 12 ? 883 : 914;
  const lower = 180;
  const v = (rawValue ?? '').trim();
  if (!v) return { kind: 'defer', reason: 'value not yet entered; will re-check' };
  if (/^>/.test(v)) return { kind: 'high-comment', reason: `value ${v} above scale` };
  const n = Number(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return { kind: 'skip', reason: `unparseable value '${v}' (manual review)` };
  if (n < lower) return { kind: 'skip', reason: `value ${n} < ${lower} (low, manual review)` };
  if (n > upper) return { kind: 'high-comment', reason: `value ${n} > ${upper}` };
  return { kind: 'auth', reason: `value ${n} within ${lower}-${upper}` };
}

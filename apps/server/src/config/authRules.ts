import { ANTI_CCP, B12, PROLACTIN, TOTAL_IGE, VITAMIN_D } from './testCodes.js';
import { TEST_CODE_NAME_PATTERNS } from './testCodeMatchers.js';

/** Inline (per-test row) B12 / Vit D Comments — `txtComments` — when value is out of range high. */
export const HIGH_COMMENT = 'Result Rechecked, kindly check with supplement history.';

/** Hold (modal top-right) Comments — `txtSampleComments` — for B12 / Vit D high. */
export const SUPPLEMENT_HISTORY_PROMPT = '? Supplement History';

export const IGE_HIGH_COMMENT =
  'Result Rechecked, kindly correlate clinically. Advice: Allergy Profile.';

export const PROLACTIN_INLINE_COMMENT =
  'RESULTS RECHECKED. KINDLY CORRELATE CLINICALLY AND WITH TIME OF SAMPLE COLLECTION (Refer to Note)';

export const PROLACTIN_HOLD_COMMENT = '? History for Prolactin';

export const PROLACTIN_HIGH_THRESHOLD = 40;

export const ANTI_CCP_INLINE_COMMENT = 'Result Rechecked, Kindly correlate clinically.';
export const ANTI_CCP_HOLD_COMMENT = '? History';
export const ANTI_CCP_HIGH_THRESHOLD = 17.0;

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

/** 0-100y reference 10-190. Inline `txtComments` (not hold `txtSampleComments`) on high. */
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

export type ProlactinDecision =
  | { kind: 'auth'; reason: string }
  /** Above sex/age upper but <= 40: tick chkAuth and add `PROLACTIN_INLINE_COMMENT` (per-test inline). */
  | { kind: 'auth-with-note'; reason: string }
  | { kind: 'high-comment'; reason: string }
  | { kind: 'defer'; reason: string }
  | { kind: 'skip'; reason: string };

export function prolactinNamePatternSources(): string[] {
  return TEST_CODE_NAME_PATTERNS[PROLACTIN].map((r) => r.source);
}

/** Companions allowed in the same worksheet with Prolactin only (TSH, Thyroid Profile I header). */
export const PROLACTIN_COMPANION_PATTERN_SOURCES: string[] = [
  /\btsh\b/i.source,
  /\bthyroid\s+stimulating\s+hormone\b/i.source,
  /\bthyroid\s+profile\s*[- ]?\s*i\b/i.source,
];

/**
 * F 18–＜45y: 2.8–29.2; F 45–60y: 1.8–29.2; M 18–60y: 2.1–17.7.
 * Value &gt; 40 → high-comment: write mode sets hold `PROLACTIN_HOLD_COMMENT` and row `PROLACTIN_INLINE_COMMENT` (no chkAuth).
 * Within [lower, upper] → auth (tick only). Between upper and 40 → auth-with-note (tick + `PROLACTIN_INLINE_COMMENT`).
 */
export function decideProlactin(
  rawValue: string | null,
  ageMonths: number | null,
  sex: 'M' | 'F' | null
): ProlactinDecision {
  const v = (rawValue ?? '').trim();
  if (!v) return { kind: 'defer', reason: 'value not yet entered; will re-check' };
  if (/[<>]/.test(v)) {
    return { kind: 'skip', reason: `value '${v}' contains '<' or '>' (manual review)` };
  }
  const n = Number(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return { kind: 'skip', reason: `unparseable value '${v}' (manual review)` };
  if (n > PROLACTIN_HIGH_THRESHOLD) {
    return { kind: 'high-comment', reason: `value ${n} > ${PROLACTIN_HIGH_THRESHOLD}` };
  }
  if (sex == null || ageMonths == null) {
    return { kind: 'skip', reason: 'sex or age unknown (manual review)' };
  }
  const years = ageMonths / 12;
  let lower: number | null = null;
  let upper: number | null = null;
  if (sex === 'F') {
    if (years >= 18 && years < 45) {
      lower = 2.8;
      upper = 29.2;
    } else if (years >= 45 && years <= 60) {
      lower = 1.8;
      upper = 29.2;
    }
  } else if (sex === 'M') {
    if (years >= 18 && years <= 60) {
      lower = 2.1;
      upper = 17.7;
    }
  }
  if (lower == null || upper == null) {
    return {
      kind: 'skip',
      reason: `age ${years.toFixed(1)}y / sex ${sex} outside coverage (manual review)`,
    };
  }
  if (n < lower) {
    return { kind: 'skip', reason: `value ${n} < ${lower} (low, manual review)` };
  }
  if (n > upper) {
    if (n <= PROLACTIN_HIGH_THRESHOLD) {
      return {
        kind: 'auth-with-note',
        reason: `value ${n} above ${upper} but <= ${PROLACTIN_HIGH_THRESHOLD} (auth + row note)`,
      };
    }
    return { kind: 'skip', reason: `value ${n} above ${upper} (manual review)` };
  }
  return {
    kind: 'auth',
    reason: `value ${n} within ${lower}-${upper} (sex ${sex}, age ${years.toFixed(1)}y)`,
  };
}

export type AntiCcpDecision =
  | { kind: 'auth'; reason: string }
  | { kind: 'high-comment'; reason: string }
  | { kind: 'defer'; reason: string }
  | { kind: 'skip'; reason: string };

export function antiCcpNamePatternSources(): string[] {
  return TEST_CODE_NAME_PATTERNS[ANTI_CCP].map((r) => r.source);
}

export function decideAntiCcp(rawValue: string | null): AntiCcpDecision {
  const v = (rawValue ?? '').trim();
  if (!v) return { kind: 'defer', reason: 'value not yet entered; will re-check' };
  if (/[<>]/.test(v)) {
    return { kind: 'skip', reason: `value '${v}' contains '<' or '>' (manual review)` };
  }
  const n = Number(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return { kind: 'skip', reason: `unparseable value '${v}' (manual review)` };
  if (n >= ANTI_CCP_HIGH_THRESHOLD) {
    return { kind: 'high-comment', reason: `value ${n} >= ${ANTI_CCP_HIGH_THRESHOLD}` };
  }
  return { kind: 'auth', reason: `value ${n} < ${ANTI_CCP_HIGH_THRESHOLD}` };
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

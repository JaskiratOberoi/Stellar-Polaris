import type { TestCodeId } from '@stellar/shared';
import { B12, VITAMIN_D } from './testCodes.js';

/**
 * Display-name patterns used to recognise an enabled test in a SID's worksheet
 * modal. The LIS labels these with human strings ("VITAMIN D", "Vitamin B12",
 * "25-OH Vitamin D", etc.), so we match on a normalised form of the row name
 * rather than the test code itself.
 *
 * Add new test codes here when extending the bot to other panels.
 */
export const TEST_CODE_NAME_PATTERNS: Record<TestCodeId, RegExp[]> = {
  [B12]: [
    /\bvit(?:amin)?\s*-?\s*b\s*-?\s*12\b/i,
    /\bvitamin\s+b12\b/i,
    /\bcobalamin\b/i,
  ],
  [VITAMIN_D]: [
    /\bvit(?:amin)?\s*-?\s*d\b(?!\s*(?:bind|metabolite))/i,
    /\b25\s*-?\s*oh\s*[- ]?\s*vit(?:amin)?\s*d\b/i,
    /\b25\s*-?\s*hydroxy\s*vit(?:amin)?\s*d\b/i,
  ],
};

/**
 * Collapse the raw test name to a single normalised string so the regexes have
 * a stable surface to match against (handles trailing/embedded whitespace,
 * NBSPs, smart-quotes, parentheses, and casing differences seen in LIS data).
 */
export function normalizeTestName(raw: string): string {
  return String(raw ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019\u201A\u2032\u0060]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Return the test code matched by a worksheet row's display name, or `null` if
 * the row is not one of our tracked tests. The first matching code wins.
 */
export function matchTestCode(rawName: string): TestCodeId | null {
  const normalised = normalizeTestName(rawName);
  if (!normalised) return null;
  for (const code of Object.keys(TEST_CODE_NAME_PATTERNS) as TestCodeId[]) {
    const patterns = TEST_CODE_NAME_PATTERNS[code];
    for (const re of patterns) {
      if (re.test(normalised)) return code;
    }
  }
  return null;
}

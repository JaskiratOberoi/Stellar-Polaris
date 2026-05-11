/**
 * Urine Routine (LIS test code CP004 — Complete Urine Examination) field config.
 *
 * Ported from Listec Automation `urine_routine_autobot.js` (`FIELD_LABEL_MATCHERS`)
 * and `urine-routine-ui/src/fieldConfig.js` (`NORMAL_DEFAULTS`).
 *
 * In Polaris this bot does not take per-SID overrides — it autofills `NORMAL_DEFAULTS`
 * for any worksheet row whose `lblTestname` matches a key here, and authenticates
 * (ticks `chkAuth`) only those rows. Pus Cells and Epithelial Cells are deliberately
 * left untouched (no key in `URINE_ROUTINE_FIELD_ALIASES`, plus `URINE_ROUTINE_SKIP_PATTERNS`
 * as a belt-and-braces guard) so the worksheet still reports them as untested for
 * manual review.
 */

export type UrineRoutineFieldKey =
  | 'quantity'
  | 'colour'
  | 'transparency'
  | 'specificGravity'
  | 'ph'
  | 'protein'
  | 'glucose'
  | 'ketone'
  | 'blood'
  | 'bilirubin'
  | 'urobilinogen'
  | 'nitrite'
  | 'rbcs'
  | 'casts'
  | 'crystals'
  | 'others';

/** Field key → list of normalized `lblTestname` synonyms recognised in `gvWorksheet`. */
export const URINE_ROUTINE_FIELD_ALIASES: Record<UrineRoutineFieldKey, string[]> = {
  quantity: ['volume', 'quantity'],
  colour: ['colour', 'color'],
  transparency: ['appearance', 'transparency'],
  specificGravity: ['specific gravity'],
  ph: ['ph'],
  protein: ['protein'],
  glucose: ['glucose'],
  ketone: ['ketone', 'ketones'],
  blood: ['blood'],
  bilirubin: ['bilirubin'],
  urobilinogen: ['urobilinogen'],
  nitrite: ['nitrite'],
  rbcs: ['rbcs', 'rbc', 'red blood cells'],
  casts: ['casts', 'cast'],
  crystals: ['crystals', 'crystal'],
  others: ['others', 'other'],
};

/**
 * Default values written by the bot when the matching row is empty/has no value.
 *
 * Strings are stored in ALL CAPS so the LIS worksheet renders them in the same casing
 * the lab uses on printed reports. Update both the value and any tests if the casing
 * convention changes.
 */
export const URINE_ROUTINE_NORMAL_DEFAULTS: Record<UrineRoutineFieldKey, string> = {
  quantity: '20 ML',
  colour: 'PALE YELLOW',
  transparency: 'SLIGHTLY TURBID',
  specificGravity: '1.025',
  ph: '6.5',
  protein: 'NEGATIVE',
  glucose: 'NEGATIVE',
  ketone: 'NEGATIVE',
  blood: 'NEGATIVE',
  bilirubin: 'NEGATIVE',
  urobilinogen: 'NORMAL',
  nitrite: 'NEGATIVE',
  rbcs: 'NIL',
  casts: 'NIL',
  crystals: 'NIL',
  others: 'NIL',
};

/**
 * Substrings of a normalised lblTestname that must NEVER be autofilled or auto-authed.
 * Pus Cells and Epithelial Cells are reviewed by a microbiologist; the bot leaves them blank.
 */
export const URINE_ROUTINE_SKIP_PATTERNS: string[] = [
  'pus cell',
  'pus cells',
  'pus_cell',
  'pus-cell',
  'epithelial cell',
  'epithelial cells',
  'epithelial-cell',
];

/** LIS test code that opens the Complete Urine Examination worksheet. */
export const URINE_ROUTINE_TEST_CODE = 'CP004';

export const URINE_ROUTINE_FIELD_KEYS: UrineRoutineFieldKey[] = [
  'quantity',
  'colour',
  'transparency',
  'specificGravity',
  'ph',
  'protein',
  'glucose',
  'ketone',
  'blood',
  'bilirubin',
  'urobilinogen',
  'nitrite',
  'rbcs',
  'casts',
  'crystals',
  'others',
];

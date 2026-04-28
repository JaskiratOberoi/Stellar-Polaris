import type { TestCodeId } from '@stellar/shared';

export const B12 = 'BI235' as const;
export const VITAMIN_D = 'BI005' as const;
export const TOTAL_IGE = 'BI133' as const;
export const PROLACTIN = 'BI180' as const;

export const ALL_TEST_CODES: TestCodeId[] = [B12, VITAMIN_D, TOTAL_IGE, PROLACTIN];

export function isTestCodeId(s: string): s is TestCodeId {
  return s === B12 || s === VITAMIN_D || s === TOTAL_IGE || s === PROLACTIN;
}

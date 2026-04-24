/**
 * Canonical worksheet status labels (same as Autobots CBC / ddlStatus option text).
 */
export const WORKSHEET_STATUS_OPTIONS = [
  'Partially Tested',
  'Tested',
  'Partially Authorized',
  'Authorized',
  'Printed',
] as const;

export const DEFAULT_STATUS_SELECTION = ['Tested', 'Partially Tested'] as const;

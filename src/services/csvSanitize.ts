/**
 * CSV Injection Prevention
 *
 * Spreadsheet applications (Excel, Google Sheets, LibreOffice) interpret
 * cells beginning with =, +, -, @ as formulas. If user-controlled strings
 * enter CSV cells, an attacker could craft a value like =cmd|'/C calc'!A0
 * to execute arbitrary commands when the CSV is opened.
 *
 * This module neutralizes dangerous leading characters by prefixing with
 * a single quote (which is the standard CSV-safe escape).
 */

/**
 * Sanitize a single CSV cell value to prevent formula injection.
 * Prefixes dangerous leading characters (=, +, -, @) with a single quote.
 */
export function sanitizeCsvCell(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  const trimmed = value.trimStart();
  if (trimmed.length > 0 && '=+\-@'.includes(trimmed[0])) {
    return "'" + value;
  }
  return value;
}

/**
 * Sanitize a row of CSV cell values.
 */
export function sanitizeCsvRow(values: string[]): string[] {
  return values.map(sanitizeCsvCell);
}

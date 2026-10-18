const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@|]/;

export function escapeCsvCell(val: unknown): string {
  let text = val == null ? '' : String(val);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

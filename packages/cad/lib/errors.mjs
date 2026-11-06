// Errors that say what went wrong for programs as well as people: a code (var.unknown, design.run, schema, …), the file
// it's in and, where known, the JSON path to fix (variables.cap_h.value). `cad … --json` prints them as they are.

/** An error with a code, and the file and JSON path it's about. */
export class CadError extends Error {
  /** @param {string} code @param {string} message @param {{ file?: string, path?: string, cause?: unknown }} [where] */
  constructor(code, message, { file, path, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.code = code;
    if (file) this.file = file;
    if (path) this.path = path;
  }
}

/** Mark an error with the file it came from (and a code, if it has none). @param {any} e @param {string} file @param {string} [code] */
export function located(e, file, code) {
  if (e && typeof e === 'object') {
    if (!e.file) e.file = file;
    if (!e.code || typeof e.code !== 'string' || /^ERR_/.test(e.code)) e.code = code || e.code || 'error';
  }
  return e;
}

/** An error as plain data: { code, message, file?, line?, path? }. @param {any} e */
export const errorData = (e) => ({ code: e?.code || 'error', message: e?.message || String(e), ...(e?.file ? { file: e.file } : {}), ...(e?.line ? { line: e.line } : {}), ...(e?.path ? { path: e.path } : {}) });

/** The closest name to a typo, one or two letters out, or null. @param {string} word @param {string[]} names */
export function near(word, names) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const best = names.map((n) => [n, d(word, n)]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= 2 ? best[0] : null;
}

/** The line of a module an error was thrown from, read from its stack, or null. @param {any} e @param {string} href the module's file: URL */
export function lineOf(e, href) {
  const at = href.split('?')[0];
  for (const l of String(e?.stack || '').split('\n')) {
    const m = l.match(/(file:\/\/[^\s)]+?)(?:\?[^\s:)]*)?:(\d+):\d+\)?$/);
    if (m && m[1] === at) return Number(m[2]);
  }
  return null;
}

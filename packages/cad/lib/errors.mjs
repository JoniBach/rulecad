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

/** An error as plain data: { code, message, file?, path? }. @param {any} e */
export const errorData = (e) => ({ code: e?.code || 'error', message: e?.message || String(e), ...(e?.file ? { file: e.file } : {}), ...(e?.path ? { path: e.path } : {}) });

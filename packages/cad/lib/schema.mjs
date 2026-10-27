// The file formats' JSON Schemas (schemas/*.schema.json) and a small validator for the parts of JSON Schema they use:
// type, enum, pattern, properties, required, additionalProperties, items, prefixItems, minItems, maxItems, anyOf and
// $ref to $defs. Problems come back with the path to fix (variables.cap_h.unti: not allowed, did you mean unit?).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schemas');
const cache = new Map();
/** A schema by name: object, assembly, rules or layout. @param {'object' | 'assembly' | 'rules' | 'layout'} name */
export function schema(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(fs.readFileSync(path.join(DIR, `${name}.schema.json`), 'utf8')));
  return cache.get(name);
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (v, t) => t === typeOf(v) || (t === 'number' && typeof v === 'number') || (t === 'integer' && Number.isInteger(v));
// The closest allowed name to a typo: one or two letters out
function near(word, names) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const best = names.map((n) => [n, d(word, n)]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= 2 ? best[0] : null;
}

/**
 * Problems with a value against a schema: [{ path, message }], empty when it's valid.
 * @param {any} value @param {object} s a schema @param {object} [root] the schema holding $defs @param {string} [at] the path so far
 * @returns {{ path: string, message: string }[]}
 */
export function validate(value, s, root = s, at = '') {
  const out = [], here = at || '(top)', p = (k) => (at ? `${at}.${k}` : String(k));
  if (s.$ref) return validate(value, s.$ref.replace('#/$defs/', '').split('/').reduce((o, k) => o[k], root.$defs), root, at);
  if (s.anyOf) {
    const each = s.anyOf.map((x) => validate(value, x, root, at));
    if (each.some((e) => !e.length)) return [];
    // Report the alternative that got furthest (the fewest problems), so a near miss says what's wrong with it
    return each.sort((a, b) => a.length - b.length)[0];
  }
  if (s.type) {
    const types = [].concat(s.type);
    if (!types.some((t) => fits(value, t))) return [{ path: here, message: `should be ${types.join(' or ')}, not ${typeOf(value)}` }];
  }
  if (s.enum && !s.enum.includes(value)) out.push({ path: here, message: `should be one of ${s.enum.map((x) => JSON.stringify(x)).join(', ')} (got ${JSON.stringify(value)})` });
  if (s.pattern && typeof value === 'string' && !new RegExp(s.pattern).test(value)) out.push({ path: here, message: `"${value}" isn't in the expected form (${s.pattern})` });
  if (typeOf(value) === 'object') {
    for (const k of s.required || []) if (!(k in value)) out.push({ path: here, message: `needs "${k}"` });
    const props = s.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) out.push(...validate(v, props[k], root, p(k)));
      else if (s.additionalProperties === false) { const guess = near(k, Object.keys(props)); out.push({ path: p(k), message: `not allowed here${guess ? ` (did you mean "${guess}"?)` : ` (allowed: ${Object.keys(props).join(', ')})`}` }); }
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') out.push(...validate(v, s.additionalProperties, root, p(k)));
    }
  }
  if (Array.isArray(value)) {
    if (s.minItems != null && value.length < s.minItems) out.push({ path: here, message: `needs at least ${s.minItems} entries` });
    if (s.maxItems != null && value.length > s.maxItems) out.push({ path: here, message: `takes at most ${s.maxItems} entries` });
    value.forEach((v, i) => {
      const item = s.prefixItems?.[i] || s.items;
      if (item) out.push(...validate(v, item, root, `${at}[${i}]`));
    });
  }
  return out;
}

/** Problems with a file's JSON as findings (code schema), for cad check. @param {any} json @param {'object' | 'assembly' | 'rules' | 'layout'} kind @param {string} file */
export function schemaFindings(json, kind, file) {
  return validate(json, schema(kind)).map((x) => ({ level: 'fail', text: `${file}: ${x.path}: ${x.message}`, code: 'schema', refs: { file, path: x.path } }));
}

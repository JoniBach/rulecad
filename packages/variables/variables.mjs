// Rules and variables: every measurement a design uses, with what it says and where it comes from.
//   rules/<set>.json         shared facts (the printer, a standard), referred to as <set>.<rule>: x1c.line, mx.slot
//   <object>.json variables  the object's own values, by bare name: stem_arm. Values are numbers or expressions.
// Expressions are arithmetic only (+ - * / and brackets, min, max, round, and sind, cosd, tand of degrees) over numbers
// and names: parsed here, never
// eval'd, so a JSON file can't run code.
// No imports and no file access: it runs in a browser as well. Rule sets are handed in (sets) or fetched by name
// through load(name), such as one that reads rules/<name>.json.

/** @typedef {{ value: number | string, unit?: string, rule?: string, kind?: 'spec' | 'community' | 'default' | 'estimate' | 'measured', source?: string, checked?: string, label?: string, show?: boolean, interface?: boolean, tweak?: { min: number, max: number }, choice?: string[], type?: 'text' | 'anchor' | 'layout' }} Variable */
/** @typedef {{ name?: string, rules: Record<string, Variable> }} RuleSet */
/** @typedef {{ uses?: string[], variables?: Record<string, Variable>, [field: string]: any }} DesignObject */
/** @typedef {{ name: string, value: number | string, used?: boolean, set?: boolean, [field: string]: any }} Entry */

export const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
// A variable that holds a name or text, and the names it may hold (null: any text)
export const isName = (d) => !!(d.choice || ['text', 'anchor', 'layout'].includes(d.type));
export const options = (d) => (d.type === 'anchor' ? ANCHORS : d.type === 'text' ? null : d.choice);
export function checkName(name, d, v) {
  const s = String(v), opts = options(d), match = opts?.find((o) => String(o) === s);
  if (opts && match === undefined) throw new Error(`${name} is one of ${opts.join(', ')} (got "${s}")`);
  if (!opts && s.length > (d.max ?? 16)) throw new Error(`${name} is at most ${d.max ?? 16} characters`);
  return typeof match === 'number' ? match : s; // choices can be numbers too (a rotation: 0, 90, 180, 270)
}
const DEG = Math.PI / 180;
const FNS = { min: Math.min, max: Math.max, round: (x, step = 1) => Math.round(x / step) * step,
  sind: (d) => Math.sin(d * DEG), cosd: (d) => Math.cos(d * DEG), tand: (d) => Math.tan(d * DEG) }; // angles in degrees

// ---------- expressions ----------
function tokens(src) {
  const out = [], re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([a-z_][\w]*(?:\.[a-z_][\w]*)*)|([-+*/(),]))/giy;
  let m, at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    if (!(m = re.exec(src))) { if (/^\s*$/.test(src.slice(at))) break; throw new Error(`can't read "${src.slice(at).trim()}"`); }
    out.push(m[1] ? { n: Number(m[1]) } : m[2] ? { id: m[2] } : { op: m[3] });
    at = re.lastIndex;
  }
  return out;
}

// evaluate("line * 3", lookup) -> number. lookup(name) gives a name's value.
/**
 * One expression: + - * / and brackets, min, max, round, sind, cosd, tand, over numbers and names. Never runs code.
 * @param {string | number} src
 * @param {(name: string) => number} lookup the value of a name
 * @returns {number}
 */
export function evaluate(src, lookup) {
  if (typeof src === 'number') return src;
  const t = tokens(String(src));
  let i = 0;
  const peek = () => t[i], take = (op) => (t[i]?.op === op ? (i++, true) : false);
  const expr = () => { let v = term(); for (;;) { if (take('+')) v += term(); else if (take('-')) v -= term(); else return v; } };
  const term = () => { let v = unary(); for (;;) { if (take('*')) v *= unary(); else if (take('/')) v /= unary(); else return v; } };
  const unary = () => (take('-') ? -unary() : take('+') ? unary() : atom());
  const atom = () => {
    const k = t[i++];
    if (!k) throw new Error('ends too soon');
    if (k.n != null) return k.n;
    if (k.op === '(') { const v = expr(); if (!take(')')) throw new Error('missing )'); return v; }
    if (k.id && FNS[k.id] && take('(')) {
      const args = [expr()];
      while (take(',')) args.push(expr());
      if (!take(')')) throw new Error('missing )');
      return FNS[k.id](...args);
    }
    if (k.id) return lookup(k.id);
    throw new Error(`unexpected "${k.op}"`);
  };
  const v = expr();
  if (peek()) throw new Error(`unexpected "${peek().op ?? peek().id ?? peek().n}"`);
  if (!Number.isFinite(v)) throw new Error('is not a finite number');
  return v;
}



// resolve(object, { sets, set }) -> { values, entries }
//   values:  { stem_arm: 1.27, x1c: { line: 0.42, … }, mx: { … } } for the design's main()
//   entries: every variable and every rule in the sets used, with its resolved value, for checks and the rules
//            card; a rule's entry has used: true if a variable refers to it
// object: { uses: ['x1c', 'mx'], variables: { name: { value, unit, rule, source, label, show, interface, tweak } } }
// display: { name: value } for a lighter on-screen copy only (fewer segments, no fine detail): not checked, and it
// wins over set, since it only changes what a screen draws.
// set: { name: value } overrides tweakable variables, within their tweak range, and the inputs below.
// Variables are numbers unless they say otherwise; these hold names or text, which the design reads and expressions
// can't use:
//   { "value": "grid", "choice": ["grid", "staggered-54"] }    one of a list
//   { "type": "text", "value": "", "max": 8 }                  free text, e.g. a keycap's legend
//   { "type": "anchor", "value": "mc" }                        one of 9 places on a face: tl tc tr, ml mc mr, bl bc br
//   { "type": "layout", "value": "grid", "choice": [...] }     a layout file in the project's layouts/ (or a built-in)
/**
 * Every variable's value, and an entry for each variable and rule for checks and rule cards.
 * @param {DesignObject} object
 * @param {{ sets?: Record<string, RuleSet>, set?: Record<string, number | string>, display?: Record<string, number | string>, load?: (name: string) => RuleSet }} [options]
 * @returns {{ values: Record<string, any>, entries: Entry[] }}
 */
export function resolve(object, { sets = {}, set = {}, display = {}, load } = {}) {
  const ruleSets = Object.fromEntries((object.uses || []).map((u) => {
    const s = sets[u] || (load ? load(u) : null);
    if (!s) throw new Error(`no rule set "${u}" (hand it in as sets.${u}, or give a load function)`);
    return [s.name || u, s];
  }));
  const vars = object.variables || {};
  for (const [k, v] of Object.entries(set)) {
    const d = vars[k];
    if (!d) throw new Error(`no variable "${k}" to set (variables: ${Object.keys(vars).join(', ')})`);
    if (isName(d)) { checkName(k, d, v); continue; }
    if (!d.tweak) throw new Error(`"${k}" is fixed by its rule; only variables with a tweak range can be set`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < d.tweak.min || n > d.tweak.max) throw new Error(`${k} must be a number from ${d.tweak.min} to ${d.tweak.max}`);
  }

  const done = new Map(), busy = new Set();
  const lookup = (name) => {
    if (done.has(name)) return done.get(name);
    if (busy.has(name)) throw new Error(`"${name}" refers back to itself`);
    busy.add(name);
    let src, where;
    if (name.includes('.')) {
      let [s, r] = name.split('.');
      if (!ruleSets[s] && ruleSets[s.replace(/_/g, '-')]) s = s.replace(/_/g, '-'); // mx_switch.housing_top reads the set named mx-switch (a - is a minus here)
      if (!ruleSets[s]) throw new Error(`"${name}": rule set "${s}" isn't in uses (${Object.keys(ruleSets).join(', ') || 'none'})`);
      if (!ruleSets[s].rules[r]) throw new Error(`"${name}": no rule "${r}" in ${s}`);
      src = ruleSets[s].rules[r].value; where = (n) => (n.includes('.') ? n : `${s}.${n}`); // a rule's names are its own set's
    } else {
      if (!vars[name]) throw new Error(`no variable "${name}"`);
      if (isName(vars[name])) { busy.delete(name); const c = checkName(name, vars[name], name in display ? display[name] : name in set ? set[name] : vars[name].value); done.set(name, c); return c; }
      src = name in display ? display[name] : name in set ? Number(set[name]) : vars[name].value; where = (n) => n; // display: the screen's settings win
    }
    let v;
    try { v = evaluate(src, (n) => lookup(where(n))); } catch (e) { busy.delete(name); throw e.message.startsWith('"') || e.message.startsWith('no ') ? e : new Error(`"${name}" = ${JSON.stringify(src)}: ${e.message}`); }
    busy.delete(name); done.set(name, v);
    return v;
  };

  const values = {}, entries = [];
  for (const [name, d] of Object.entries(vars)) {
    values[name] = lookup(name);
    entries.push({ name, ...d, value: values[name], expr: typeof d.value === 'string' ? d.value : undefined, set: name in set });
  }
  const used = new Set(done.keys()); // rules the variables actually refer to (directly or through other rules)
  for (const [s, rs] of Object.entries(ruleSets)) {
    values[s] = {};
    for (const [r, d] of Object.entries(rs.rules)) {
      values[s][r] = lookup(`${s}.${r}`);
      entries.push({ name: `${s}.${r}`, ...d, value: values[s][r], expr: typeof d.value === 'string' ? d.value : undefined, used: used.has(`${s}.${r}`), ...(rs.private ? { private: true } : {}) });
    }
    if (rs.footprints) values[s].footprints = rs.footprints; // pad data for boards (v.esp32c6.footprints.module), as the set gives it
  }
  return { values, entries };
}

// Round for display: at most 2 decimals, no trailing zeros.
/** A number to two decimals at most; a name as it is. @param {number | string} n @returns {string} */
export const fmt = (n) => (typeof n === 'number' ? String(Number(n.toFixed(2))) : String(n)); // choices are names

// lint(source) -> [{ line, text }]: number literals in a design's code that should be variables. Every measurement
// belongs in a variable that says where it comes from; only 0, 1 and 2 (and numbers in comments and strings) pass.
/**
 * Number literals in a design's code other than 0, 1 and 2 (outside comments and strings).
 * @param {string} source
 * @returns {{ line: number, text: string }[]}
 */
export function lint(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) => m.replace(/./g, ' '));
  const found = [];
  code.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/(?<![\w.])(\d+\.\d+|\.\d+|\d+)(?![\w.])/g)) if (!['0', '1', '2'].includes(m[1])) found.push({ line: i + 1, text: m[1] });
  });
  return found;
}

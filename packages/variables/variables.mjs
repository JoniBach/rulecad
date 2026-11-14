// Rules and variables: every measurement a design uses, with what it says and where it comes from.
//   rules/<set>.json         shared facts (the printer, a standard), referred to as <set>.<rule>: x1c.line, mx.slot
//   <object>.json variables  the object's own values, by bare name: stem_arm. Values are numbers or expressions.
// Expressions are arithmetic only (+ - * / and brackets, min, max, round, and sind, cosd, tand of degrees) over numbers
// and names: parsed here, never
// eval'd, so a JSON file can't run code.
// A rule may hold a list (the lengths a screw is sold in): "value": [5, 6, 8, 10], each entry a number or an expression
// like any other value, all in the rule's one unit. A design reads it as an array (v.m3.lengths); in an expression only
// min() and max() take a list, and anything else refuses it by name.
// No imports and no file access: it runs in a browser as well. Rule sets are handed in (sets) or fetched by name
// through load(name), such as one that reads rules/<name>.json.

/** @typedef {{ value: number | string | (number | string)[], unit?: string, rule?: string, kind?: 'spec' | 'community' | 'default' | 'estimate' | 'measured' | 'derived', source?: string, licence?: string, checked?: string, label?: string, show?: boolean, interface?: boolean, tweak?: { min: number, max: number }, choice?: string[], type?: 'text' | 'anchor' | 'layout' | 'problem' }} Variable */
/** @typedef {{ name?: string, rules: Record<string, Variable> }} RuleSet */
/** @typedef {{ uses?: string[], variables?: Record<string, Variable>, [field: string]: any }} DesignObject */
/** @typedef {{ name: string, value: number | string, used?: boolean, set?: boolean, [field: string]: any }} Entry */

// An error with a code (var.unknown, set.range, …) and, where known, the JSON path to fix (variables.cap_h.value)
const fail = (code, message, path) => Object.assign(new Error(message), { code, ...(path ? { path } : {}) });

export const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
// A variable that holds a name or text, and the names it may hold (null: any text)
export const isName = (d) => !!(d.choice || ['text', 'anchor', 'layout', 'problem'].includes(d.type));
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

// One grammar: an expression parsed once to a tree, which evaluate() and unitsOf() each walk. Nodes: { n } a number,
// { id } a name, { op: '+' | '-' | '*' | '/', a, b }, { neg: a } (or { pos: a }), { fn, args }.
//   expr = term (('+' | '-') term)* · term = unary (('*' | '/') unary)* · unary = ('-' | '+') unary | atom
//   atom = number | name | name '(' expr (',' expr)* ')' (a function of FNS) | '(' expr ')'
const trees = new Map(); // (a design reads the same expressions over and over: each is parsed once)
function parse(src) {
  const key = String(src);
  if (trees.has(key)) return trees.get(key);
  const t = tokens(key);
  let i = 0;
  const peek = () => t[i], take = (op) => (t[i]?.op === op ? (i++, true) : false);
  const expr = () => { let v = term(); for (;;) { if (take('+')) v = { op: '+', a: v, b: term() }; else if (take('-')) v = { op: '-', a: v, b: term() }; else return v; } };
  const term = () => { let v = unary(); for (;;) { if (take('*')) v = { op: '*', a: v, b: unary() }; else if (take('/')) v = { op: '/', a: v, b: unary() }; else return v; } };
  const unary = () => (take('-') ? { neg: unary() } : take('+') ? { pos: unary() } : atom());
  const atom = () => {
    const k = t[i++];
    if (!k) throw new Error('ends too soon');
    if (k.n != null) return { n: k.n };
    if (k.op === '(') { const v = expr(); if (!take(')')) throw new Error('missing )'); return v; }
    if (k.id && Object.hasOwn(FNS, k.id) && take('(')) {
      const args = [expr()];
      while (take(',')) args.push(expr());
      if (!take(')')) throw new Error('missing )');
      return { fn: k.id, args };
    }
    if (k.id) return { id: k.id };
    throw new Error(`unexpected "${k.op}"`);
  };
  const tree = expr();
  if (peek()) throw new Error(`unexpected "${peek().op ?? peek().id ?? peek().n}"`);
  if (trees.size > 5000) trees.clear();
  trees.set(key, tree);
  return tree;
}

// evaluate("line * 3", lookup) -> number. lookup(name) gives a name's value.
/**
 * One expression: + - * / and brackets, min, max, round, sind, cosd, tand, over numbers and names. Never runs code.
 * @param {string | number} src
 * @param {(name: string) => number} lookup the value of a name
 * @returns {number}
 */
export function evaluate(src, lookup = (name) => { throw new Error(`no value for "${name}"`); }) {
  if (typeof src === 'number') { if (!Number.isFinite(src)) throw new Error('is not a finite number'); return src; }
  const walk = (x, list = false) => { // list: inside min() or max(), where a name may be a list rule
    if (x.n != null) return x.n;
    if (x.id != null) { const v = lookup(x.id); if (Array.isArray(v) && !list) throw new Error(`"${x.id}" is a list: take min(${x.id}) or max(${x.id}), or read it in the design`); return v; }
    if (x.neg) return -walk(x.neg);
    if (x.pos) return walk(x.pos);
    if (x.fn) { const spread = x.fn === 'min' || x.fn === 'max'; return FNS[x.fn](...x.args.flatMap((a) => walk(a, spread))); }
    const a = walk(x.a), b = walk(x.b);
    return x.op === '+' ? a + b : x.op === '-' ? a - b : x.op === '*' ? a * b : a / b;
  };
  const v = walk(parse(src));
  if (!Number.isFinite(v)) throw new Error('is not a finite number');
  return v;
}


// ---------- units ----------
// A unit as powers of its parts: "mm" {mm: 1}, "mm²" {mm: 2}, "deg" {deg: 1}. Numbers and names with no unit are
// unknown (null), which matches anything: only units that are both known and different are a problem.
const SUP = { '²': 2, '³': 3 }, ALIAS = { '°': 'deg', degrees: 'deg', degree: 'deg' };
// Physical units only: counts (keys, u, rows, %) are plain numbers, so 12 keys × 19.05 mm is a length
const PHYSICAL = new Set(['mm', 'cm', 'm', 'in', 'deg', 'rad', 'g', 'kg', 'N', 'W', 'V', 'A', 's', 'ms', 'Hz', 'mAh', 'Wh']);
function parseUnit(u) {
  if (u == null || u === '') return null;
  const base = /^([a-zA-Z°]+)/.exec(String(u).trim())?.[1];
  if (!PHYSICAL.has(ALIAS[base] || base)) return null;
  const m = /^([a-zA-Z°]+)([²³])?$/.exec(String(u).trim());
  if (!m) return { [String(u)]: 1 };
  return { [ALIAS[m[1]] || m[1]]: m[2] ? SUP[m[2]] : 1 };
}
const showUnit = (x) => (x == null ? 'a number' : Object.keys(x).length ? Object.entries(x).map(([k, n]) => (n === 1 ? k : n === 2 ? `${k}²` : n === 3 ? `${k}³` : `${k}^${n}`)).join('·') : 'a plain number');
const sameUnit = (a, b) => a == null || b == null || (Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, n]) => b[k] === n));
const combine = (a, b, sign) => { if (a == null) return sign > 0 ? b : b == null ? null : Object.fromEntries(Object.entries(b).map(([k, n]) => [k, -n])); /* (a plain number over a unit: 2 / w is per mm) */ if (b == null) return a; const o = { ...a }; for (const [k, n] of Object.entries(b)) { o[k] = (o[k] || 0) + sign * n; if (!o[k]) delete o[k]; } return o; };

/**
 * The unit an expression comes to, and any mixing of units on the way (mm added to degrees, a sine of millimetres).
 * @param {string | number} src @param {(name: string) => string | undefined} unitOf a name's unit
 * @returns {{ unit: string | null, problems: string[] }}
 */
export function unitsOf(src, unitOf) {
  if (typeof src === 'number') return { unit: null, problems: [] };
  let tree;
  try { tree = parse(src); } catch { return { unit: null, problems: [] }; } // (an expression that doesn't parse: evaluate says so)
  const problems = [];
  const add = (a, b, op) => { if (!sameUnit(a, b)) problems.push(`${op === '+' ? 'adds' : 'takes'} ${showUnit(b)} ${op === '+' ? 'to' : 'from'} ${showUnit(a)}`); return a ?? b; };
  const walk = (x) => {
    if (x.n != null) return null;
    if (x.id != null) return parseUnit(unitOf(x.id));
    if (x.neg) return walk(x.neg);
    if (x.pos) return walk(x.pos);
    if (x.fn) {
      const args = x.args.map(walk);
      if (['sind', 'cosd', 'tand'].includes(x.fn)) { if (args[0] && !sameUnit(args[0], { deg: 1 })) problems.push(`takes ${x.fn} of ${showUnit(args[0])}, not degrees`); return {}; }
      if (x.fn === 'round') return args[0];
      return args.reduce((a, b) => add(a, b, '+'));
    }
    const a = walk(x.a), b = walk(x.b);
    return x.op === '+' || x.op === '-' ? add(a, b, x.op) : combine(a, b, x.op === '*' ? 1 : -1);
  };
  const v = walk(tree);
  return { unit: v == null ? null : showUnit(v), problems, value: v };
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
//   { "type": "problem", "value": "lever" }                   an optimisation problem in the project's problems/
/**
 * Every variable's value, and an entry for each variable and rule for checks and rule cards.
 * @param {DesignObject} object
 * @param {{ sets?: Record<string, RuleSet>, set?: Record<string, number | string>, display?: Record<string, number | string>, load?: (name: string) => RuleSet }} [options]
 * @returns {{ values: Record<string, any>, entries: Entry[], deps: Record<string, string[]> }} deps: each name with the names its own expression reads
 */
export function resolve(object, { sets = {}, set = {}, display = {}, load } = {}) {
  // Names are looked up as an object's own, never inherited: a variable called constructor is a variable, and a
  // name nobody defined (toString) is unknown, not whatever every object happens to carry
  const own = (o, k) => (o != null && Object.hasOwn(o, k) ? o[k] : undefined);
  const ruleSets = Object.fromEntries((object.uses || []).map((u) => {
    const s = own(sets, u) || (load ? load(u) : null);
    if (!s) throw fail('rules.missing', `no rule set "${u}" (hand it in as sets.${u}, or give a load function)`, 'uses');
    if (typeof s.then === 'function') throw fail('rules.async', `the load function gave a promise for "${u}": load must return the rule set itself (fetch it first, and hand it in as sets.${u})`, 'uses');
    if (!s.rules || typeof s.rules !== 'object') throw fail('rules.shape', `rule set "${u}" has no "rules"`, 'uses');
    return [s.name || u, s];
  }));
  const vars = object.variables || {};
  for (const name of Object.keys(ruleSets)) if (own(vars, name) || own(vars, name.replace(/-/g, '_'))) throw fail('var.clash', `"${name}" is a rule set in uses and a variable too: rename the variable, so each name means one thing`, `variables.${own(vars, name) ? name : name.replace(/-/g, '_')}`);
  for (const [k, v] of Object.entries(set)) {
    const d = own(vars, k);
    if (!d) throw fail('set.unknown', `no variable "${k}" to set (variables: ${Object.keys(vars).join(', ')})`, `variables.${k}`);
    if (isName(d)) { checkName(k, d, v); continue; }
    if (!d.tweak) throw fail('set.fixed', `"${k}" is fixed by its rule; only variables with a tweak range can be set`, `variables.${k}.tweak`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < d.tweak.min || n > d.tweak.max) throw fail('set.range', `${k} must be a number from ${d.tweak.min} to ${d.tweak.max}`, `variables.${k}.tweak`);
  }

  // deps: each name's own references (what its expression reads), for explaining a value; stack: whose expression is being read
  const done = new Map(), busy = new Set(), deps = new Map(), stack = [];
  const pathOf = (name) => (name.includes('.') ? `rules.${name}.value` : `variables.${name}.value`);
  const ruleOf = (name) => { let [t, r] = name.split('.'); if (!own(ruleSets, t)) t = t.replace(/_/g, '-'); return ruleSets[t]?.rules[r]; };
  const lookup = (name) => {
    if (stack.length) deps.get(stack[stack.length - 1]).add(name);
    if (done.has(name)) return done.get(name);
    if (busy.has(name)) throw fail('var.cycle', `"${name}" refers back to itself`, pathOf(name));
    busy.add(name);
    let src, where;
    if (name.includes('.')) {
      let [s, r, more] = name.split('.');
      if (more !== undefined) throw fail('var.unknown-rule', `"${name}": a rule is named <set>.<rule>, with one dot`);
      if (!own(ruleSets, s) && own(ruleSets, s.replace(/_/g, '-'))) s = s.replace(/_/g, '-'); // mx_switch.housing_top reads the set named mx-switch (a - is a minus here)
      if (!own(ruleSets, s)) throw fail('var.unknown-set', `"${name}": rule set "${s}" isn't in uses (${Object.keys(ruleSets).join(', ') || 'none'})`);
      if (!own(ruleSets[s].rules, r)) throw fail('var.unknown-rule', `"${name}": no rule "${r}" in ${s}`);
      src = ruleSets[s].rules[r].value; where = (n) => (n.includes('.') ? n : `${s}.${n}`); // a rule's names are its own set's
    } else {
      const d = own(vars, name);
      if (!d) throw fail('var.unknown', `no variable "${name}"`);
      const shown = Object.hasOwn(display, name), given = Object.hasOwn(set, name);
      if (isName(d)) { busy.delete(name); const c = checkName(name, d, shown ? display[name] : given ? set[name] : d.value); done.set(name, c); return c; }
      src = shown ? display[name] : given ? Number(set[name]) : d.value; where = (n) => n; // display: the screen's settings win
      if (src === undefined) throw fail('var.value', `"${name}" has no value`, `variables.${name}`);
      if (Array.isArray(src)) throw fail('var.list', `"${name}" is a list: only a rule in a rule set holds a list (a design reads it as v.<set>.<rule>)`, `variables.${name}.value`);
    }
    let v;
    deps.set(name, new Set()); stack.push(name);
    // A list rule: each entry through the same grammar, so the list is numbers by the time a design reads it
    const each = (x) => { if (typeof x !== 'number' && typeof x !== 'string') throw new Error('each entry of a list is a number or an expression'); const n = evaluate(x, (k) => lookup(where(k))); if (Array.isArray(n)) throw new Error('holds a list inside a list'); return n; };
    try { v = Array.isArray(src) ? src.map(each) : evaluate(src, (n) => lookup(where(n))); if (Array.isArray(v) && !v.length) throw new Error('is an empty list'); } catch (e) {
      busy.delete(name); stack.pop();
      // A rule with words for a value and no unit (a bearing's "radial", a pinout) is text, read as it is
      if (name.includes('.') && typeof src === 'string' && !ruleOf(name)?.unit) { done.set(name, src); return src; }
      const out = e.message.startsWith('"') || e.message.startsWith('no ') ? e : fail(e.code || 'var.expression', `"${name}" = ${JSON.stringify(src)}: ${e.message}`);
      if (!out.path) out.path = pathOf(name); // the first expression that reads the bad name: where to fix it
      throw out;
    }
    stack.pop(); busy.delete(name); done.set(name, v);
    return v;
  };

  const values = {}, entries = [];
  for (const [name, d] of Object.entries(vars)) {
    values[name] = lookup(name);
    entries.push({ name, ...d, value: values[name], expr: typeof d.value === 'string' ? d.value : undefined, set: Object.hasOwn(set, name) });
  }
  // Units: each variable's expression, its names' units mixed only where they agree, and coming to the unit it says
  const unitOf = (n) => (n.includes('.') ? ruleSets[n.split('.')[0].replace(/_/g, '-')]?.rules[n.split('.')[1]]?.unit ?? ruleSets[n.split('.')[0]]?.rules[n.split('.')[1]]?.unit : vars[n]?.unit);
  const units = [];
  for (const [name, d] of Object.entries(vars)) {
    if (typeof d.value !== 'string' || isName(d)) continue;
    const r = unitsOf(d.value, unitOf), said = parseUnit(d.unit);
    for (const p of r.problems) units.push({ name, path: `variables.${name}.value`, message: `"${name}" = ${d.value}: ${p}` });
    if (said && r.value && !sameUnit(said, r.value)) units.push({ name, path: `variables.${name}.unit`, message: `"${name}" comes to ${r.unit}, but its unit says ${showUnit(said)}` });
  }
  const used = new Set(done.keys()); // rules the variables actually refer to (directly or through other rules)
  for (const [s, rs] of Object.entries(ruleSets)) {
    values[s] = {};
    for (const [r, d] of Object.entries(rs.rules)) {
      values[s][r] = lookup(`${s}.${r}`);
      entries.push({ name: `${s}.${r}`, ...d, value: values[s][r], expr: typeof d.value === 'string' ? d.value : undefined, used: used.has(`${s}.${r}`), ...(rs.private ? { private: true } : {}) });
    }
    if (rs.footprints) values[s].footprints = rs.footprints; // pad data for boards (v.esp32c6.footprints.module), as the set gives it
    if (rs.circuit) values[s].circuit = rs.circuit;
    const pinMaps = Object.entries(rs.rules).filter(([, d]) => d.pins); // rules' pin maps (package pin: name), as v.rp2040.pinMaps.gpio
    if (pinMaps.length) values[s].pinMaps = Object.fromEntries(pinMaps.map(([r, d]) => [r, d.pins])); // (camel case: no rule is named so) // a whole board's circuit, from cad clone (v.sea_picro.circuit), for @rulecad/pcb's clone()
  }
  return { values, entries, deps: Object.fromEntries([...deps].map(([k, v]) => [k, [...v]])), units };
}

// Round for display: at most 2 decimals, no trailing zeros.
/** A number to two decimals at most; a name as it is. @param {number | string} n @returns {string} */
// A published rule set, held to what makes it traceable: every value says what it is, how far to trust it, where it
// comes from and when it was checked. A set with "part" (a motor) uses the shared names in vocabulary (the rule sets'
// vocabulary.json), every required one, each in its unit; an older set says which of its rules is which in "interface".
// A vocabulary may also say what must hold between a part's figures, in "checks": { "<part>": [ … ] }, each one of
//   { "ascending": ["tap_drill", "major_diameter", "clearance"], "says": "…" }   the names it has, each larger than the last
//   { "near": "tap_drill", "to": "major_diameter - pitch", "within": "0.2 * pitch", "says": "…" }   expressions over its own rules
// and a field marked "list": true holds a list (the lengths a screw is sold in), which must ascend.
const KINDS = ['measured', 'spec', 'community', 'default', 'derived', 'estimate'];
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
/**
 * @param {RuleSet & { part?: string, interface?: Record<string, string> }} set
 * @param {{ units: string[], prefixes: string[], fields: Record<string, { unit?: string, choice?: string[], list?: boolean }>, parts: Record<string, string[]>, checks?: Record<string, { ascending?: string[], near?: string, to?: string, within?: string, says: string }[]> }} vocabulary
 * @returns {{ level: 'fail', code: string, text: string, rule?: string, values?: Record<string, number> }[]} what's wrong with it: nothing, if it passes
 */
export function checkRuleSet(set, vocabulary) {
  const out = [], f = (code, text, rule, values) => out.push({ level: 'fail', code, text, ...(rule ? { rule } : {}), ...(values ? { values } : {}) }), { units, prefixes, fields, parts } = vocabulary, rules = set?.rules;
  if (!rules || typeof rules !== 'object' || !Object.keys(rules).length) { f('rules.shape', 'it has no rules'); return out; }
  for (const [name, r] of Object.entries(rules)) {
    const list = Array.isArray(r.value);
    if (!(list ? r.value.length && r.value.every(finite) : finite(r.value) || (typeof r.value === 'string' && r.value))) f('rules.value', list ? `${name} is a list, so every entry is a number and there is at least one` : `${name} has no value`, name);
    else if (list) { const i = r.value.findIndex((x, k) => k && x <= r.value[k - 1]); if (i > 0) f('rules.order', `${name} is a list in ascending order: ${r.value[i]} follows ${r.value[i - 1]}`, name, { before: r.value[i - 1], after: r.value[i] }); }
    if (!(typeof r.rule === 'string' && r.rule.length > 5)) f('rules.says', `${name} doesn't say what it is ("rule")`, name);
    if (!KINDS.includes(r.kind)) f('rules.kind', `${name}: kind ${JSON.stringify(r.kind)} is not one of ${KINDS.join(', ')}`, name);
    if (!(typeof r.source === 'string' && r.source)) f('rules.source', `${name} has no source`, name);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.checked))) f('rules.checked', `${name}: checked is the date it was last checked, YYYY-MM-DD (got ${JSON.stringify(r.checked)})`, name);
    if (set.part) {
      if (r.unit != null && !units.includes(r.unit)) f('rules.unit', `${name}: unit ${JSON.stringify(r.unit)} is not one of ${units.filter(Boolean).join(', ')}`, name);
      if ((typeof r.value === 'number' || list) && r.unit == null) f('rules.unit', `${name} is a number with no unit (give "unit", "" if it has none)`, name);
      const field = fields[name];
      if (prefixes.some((p) => name.startsWith(p)) && !field) f('rules.name', `${name} is not in the vocabulary (a name starting ${prefixes.join(', ')} says how a part mounts, so everything reads it the same way)`, name);
      if (field?.unit != null && r.unit !== field.unit) f('rules.unit', `${name} is in ${JSON.stringify(field.unit)}, not ${JSON.stringify(r.unit ?? null)}`, name);
      if (field?.choice && !field.choice.includes(r.value)) f('rules.choice', `${name} is one of ${field.choice.join(', ')} (got ${JSON.stringify(r.value)})`, name);
      if (field && !!field.list !== list) f('rules.list', field.list ? `${name} is a list: "value": [ … ] (got ${JSON.stringify(r.value)})` : `${name} is one value, not a list`, name);
    }
  }
  if (set.part) {
    if (!parts[set.part]) f('rules.part', `part ${JSON.stringify(set.part)} is not one of ${Object.keys(parts).join(', ')}`);
    else for (const name of parts[set.part]) if (!rules[name]) f('rules.missing', `a ${set.part} needs ${name}`, name);
    // What must hold between its figures: only over the numbers it has, so a size made without a head form passes
    const num = (name) => (finite(rules[name]?.value) ? rules[name].value : undefined);
    const work = (src) => { try { return evaluate(src, (n) => { const v = num(n); if (v === undefined) throw new Error('absent'); return v; }); } catch { return undefined; } };
    for (const c of vocabulary.checks?.[set.part] || []) {
      if (c.ascending) {
        const have = c.ascending.filter((n) => num(n) !== undefined);
        for (let i = 1; i < have.length; i++) if (!(num(have[i]) > num(have[i - 1]))) f('rules.order', `${have[i]} (${num(have[i])}) is not larger than ${have[i - 1]} (${num(have[i - 1])}): ${c.says}`, have[i], { [have[i - 1]]: num(have[i - 1]), [have[i]]: num(have[i]) });
      }
      if (c.near) {
        const v = num(c.near), to = work(c.to), within = work(c.within);
        if (v !== undefined && to !== undefined && within !== undefined && !(Math.abs(v - to) <= within + 1e-9)) f('rules.near', `${c.near} (${v}) is not within ${fmt(within)} of ${c.to} (${fmt(to)}): ${c.says}`, c.near, { [c.near]: v, expected: to, within });
      }
    }
  }
  for (const [shared, own] of Object.entries(set.interface || {})) {
    if (!fields[shared]) f('rules.name', `interface: ${shared} is not in the vocabulary`, own);
    if (!rules[own]) f('rules.interface', `interface: ${shared} names ${own}, which isn't one of its rules`, own);
  }
  for (const [name, v] of Object.entries(set.variants || {})) {
    if (!KINDS.includes(v.kind)) f('rules.kind', `variant ${name}: kind ${JSON.stringify(v.kind)} is not one of ${KINDS.join(', ')}`);
    if (!(typeof v.source === 'string' && v.source)) f('rules.source', `variant ${name} has no source`);
    for (const rule of Object.keys(v.values || {})) if (!rules[rule]) f('rules.variant', `variant ${name} changes ${rule}, which isn't one of its rules`, rule);
  }
  return out;
}

export const fmt = (n) => (typeof n === 'number' ? String(Number(n.toFixed(2))) : Array.isArray(n) ? n.map(fmt).join(', ') : String(n)); // choices are names; a list rule, each entry

// lint(source) -> [{ line, text }]: number literals in a design's code that should be variables. Every measurement
// belongs in a variable that says where it comes from; only 0, 1 and 2 (and numbers in comments and strings) pass.
/**
 * Number literals in a design's code other than 0, 1 and 2 (outside comments and strings).
 * @param {string} source
 * @returns {{ line: number, text: string }[]}
 */
export function lint(source) {
  // A small tokeniser, so a // inside a string doesn't hide the rest of the line, code inside a template's ${…} is read
  // as code, and every way of writing a number is seen (1e3, 0x1F, 1_000, .5)
  const found = [], n = source.length, NUM = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?/;
  let line = 1, i = 0;
  const depth = []; // open template literals: the brace depth their ${ started at
  let braces = 0;
  const skipString = (q) => { i++; while (i < n && source[i] !== q) { if (source[i] === '\\') i++; else if (source[i] === '\n') line++; i++; } i++; };
  const template = () => { // from just after a backtick (or a closing } of ${…}) to the next ${ or the closing backtick
    while (i < n) {
      const c = source[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line++;
      if (c === '`') { i++; return; }
      if (c === '$' && source[i + 1] === '{') { i += 2; depth.push(braces); braces++; return; }
      i++;
    }
  };
  while (i < n) {
    const c = source[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2), stop = end < 0 ? n : end + 2; for (let k = i; k < stop; k++) if (source[k] === '\n') line++; i = stop; continue; }
    if (c === '"' || c === "'") { skipString(c); continue; }
    if (c === '`') { i++; template(); continue; }
    if (c === '{') { braces++; i++; continue; }
    if (c === '}') { braces--; i++; if (depth.length && braces === depth.at(-1)) { depth.pop(); template(); } continue; }
    if (/[\w$]/.test(c) && !/\d/.test(c)) { while (i < n && /[\w$]/.test(source[i])) i++; continue; } // a name (x1, v2: not numbers)
    if (/\d/.test(c) || (c === '.' && /\d/.test(source[i + 1] || '') && !/[\w$)\]]/.test(source[i - 1] || ''))) {
      if (c === '.' && /[\w$)\].]/.test(source[i - 1] || '')) { i++; continue; } // (a property after a dot)
      const m = source.slice(i).match(NUM), text = m[0];
      const value = Number(text.replace(/_/g, '').replace(/n$/, ''));
      if (!(value === 0 || value === 1 || value === 2)) found.push({ line, text });
      i += text.length;
      continue;
    }
    i++;
  }
  return found;
}

// A fixing as a model from its rules: a thread, or a whole screw, nut, washer or insert on that thread, by name. Every
// thread is one rule set in @rulecad/rules, so its numbers are open data and live there, not here; a workspace's own
// rule set for a thread is used before the kit's. Also here: the name grammar, the printer's rules as fixings reads
// them, and the few rules this package adds. Units: mm, degrees, grams.
import m1_6 from '@rulecad/rules/m1_6.json' with { type: 'json' };
import m2 from '@rulecad/rules/m2.json' with { type: 'json' };
import m2_5 from '@rulecad/rules/m2_5.json' with { type: 'json' };
import m3 from '@rulecad/rules/m3.json' with { type: 'json' };
import m4 from '@rulecad/rules/m4.json' with { type: 'json' };
import m5 from '@rulecad/rules/m5.json' with { type: 'json' };
import m6 from '@rulecad/rules/m6.json' with { type: 'json' };
import m8 from '@rulecad/rules/m8.json' with { type: 'json' };
import m10 from '@rulecad/rules/m10.json' with { type: 'json' };
import m12 from '@rulecad/rules/m12.json' with { type: 'json' };
import unc_4_40 from '@rulecad/rules/unc_4_40.json' with { type: 'json' };
import unc_6_32 from '@rulecad/rules/unc_6_32.json' with { type: 'json' };
import unc_8_32 from '@rulecad/rules/unc_8_32.json' with { type: 'json' };
import unc_10_24 from '@rulecad/rules/unc_10_24.json' with { type: 'json' };
import unf_10_32 from '@rulecad/rules/unf_10_32.json' with { type: 'json' };
import unc_1_4_20 from '@rulecad/rules/unc_1_4_20.json' with { type: 'json' };
import unc_5_16_18 from '@rulecad/rules/unc_5_16_18.json' with { type: 'json' };
import unc_3_8_16 from '@rulecad/rules/unc_3_8_16.json' with { type: 'json' };
import pt_k22 from '@rulecad/rules/pt_k22.json' with { type: 'json' };
import pt_k25 from '@rulecad/rules/pt_k25.json' with { type: 'json' };
import pt_k30 from '@rulecad/rules/pt_k30.json' with { type: 'json' };
import pt_k35 from '@rulecad/rules/pt_k35.json' with { type: 'json' };
import pt_k40 from '@rulecad/rules/pt_k40.json' with { type: 'json' };
import pt_k50 from '@rulecad/rules/pt_k50.json' with { type: 'json' };
import x1c from '@rulecad/rules/x1c.json' with { type: 'json' };
import engagementSet from '@rulecad/rules/engagement.json' with { type: 'json' };
import s275 from '@rulecad/rules/s275.json' with { type: 'json' };
import ss304 from '@rulecad/rules/ss304.json' with { type: 'json' };

const KIT = [m1_6, m2, m2_5, m3, m4, m5, m6, m8, m10, m12, unc_4_40, unc_6_32, unc_8_32, unc_10_24, unf_10_32, unc_1_4_20, unc_5_16_18, unc_3_8_16, pt_k22, pt_k25, pt_k30, pt_k35, pt_k40, pt_k50];
const KIT_BY_NAME = Object.fromEntries(KIT.map((s) => [s.name, s]));

/**
 * The rules this package adds to the threads' and the printer's own, each with what it comes from.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string, source: string, checked: string }>}
 */
export const DEFAULTS = {
  nut_sink: { value: 2, unit: 'layers', rule: 'A nut pocket is this many layers deeper than the nut is tall, so the nut sits under the face it went in by', kind: 'community', source: 'How the kit\'s lever bench draws its M4 and M5 nut pockets (examples/bench: nut_height + layer * 2)', checked: '2026-11-15' },
  nut_slack: { value: 1, unit: 'layers', rule: 'A nut dropped in mid-print lies at least this far under the layer printed over it, so the nozzle clears a nut that sits a little high', kind: 'estimate', source: 'A working margin of this package, to be measured on the fixings coupon', checked: '2026-11-15' },
  pitch_diameter: { value: (3 * Math.sqrt(3)) / 8, unit: '× pitch', rule: 'A 60° thread\'s pitch diameter is its major diameter less 0.6495 of its pitch: the diameter a threaded length weighs as', kind: 'spec', source: 'The ISO 68-1 basic profile, as worked at https://en.wikipedia.org/wiki/ISO_metric_screw_thread (D_p = D_maj - 0.649519 P)', checked: '2026-11-15' },
  steel_density: { ...s275.rules.density, rule: 'Density of steel, for a screw\'s, nut\'s or washer\'s mass (the kit\'s S275 figure: carbon steels differ by under 1%)' },
  stainless_density: { ...ss304.rules.density, rule: 'Density of 304 stainless steel (A2), for stainless hardware' },
  brass_density: { value: 8.47, unit: 'g/cm³', rule: 'Density of free-machining brass CW614N (CuZn39Pb3), taken for a heat-set insert. The insert maker\'s sheet names no alloy, so the alloy is assumed', kind: 'estimate', source: 'Aalco, CW614N brass rod datasheet, https://www.aalco.co.uk/datasheets/Copper-and-Copper-Alloys-CW614N-Brass-Rod_31.ashx', checked: '2026-11-15' }
};

// ---------- small things every module here uses ----------
export const r3 = (x) => +x.toFixed(3);
export const mm = (x) => String(+Number(x).toFixed(3));
export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; }; // (a whole rule set handed in by mistake is not printed back)
export const near = (a, b) => { // edits between two names, to suggest the nearest
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
export function positive(what, k, v) { if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is a number above 0, in mm (got ${shown(v)})`); return v; }
export function oneOf(what, k, v, list) { if (!list.includes(v)) throw new Error(`${what}: ${k} is ${list.slice(0, -1).join(', ')} or ${list.at(-1)} (got ${shown(v)})`); return v; }
/** A finding in the kit's one shape. */
export const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
/** What a result rests on: a figure's name, value, kind and source, without its whole rule. */
export const rest = (name, f) => ({ name, value: f.value, ...(f.unit ? { unit: f.unit } : {}), kind: f.kind, source: f.source });
const article = (s) => (/^(M|8-)/.test(s) ? 'an' : 'a');
/** "an M3", "a 1/4-20 UNC", "a PT K30". */
export const a = (thread) => `${article(thread)} ${thread}`;

// ---------- the name grammar ----------
/**
 * The one grammar a fixing's name is read by. parseName reads it and nothing else does.
 * @type {string}
 */
export const GRAMMAR = [
  'name    = thread [ "x" length ] { word }',
  'thread  = "M" number                          metric: M3, M2.5',
  '        | size "-" count [ "UNC" | "UNF" ]    inch: 6-32, #6-32, 1/4-20, 10-32 UNF',
  '        | [ "PT" ] "K" number                 a screw for plastic: K30, PT K30',
  'length  = number [ "mm" | "in" ]              mm on a metric or plastic thread; inches on an inch thread, where',
  '                                              a fraction is read too: 1/2, 1 1/2',
  'word    = "cap" | "button" | "countersunk" | "hex" | "set" | "pan"      a screw\'s head form',
  '        | [ "hex" | "square" | "lock" ] "nut"                           a nut (hex if not said)',
  '        | "washer" | "insert"                                           a plain washer, a heat-set insert',
  '        | a variant of the thread\'s rule set                            torx, on a PT screw'
].join('\n');

/** The head forms a screw's name can say. */
export const HEADS = ['cap', 'button', 'countersunk', 'hex', 'set', 'pan'];
/** The kinds of nut a name can say. */
export const NUTS = ['hex', 'square', 'lock'];
const HEAD_WORDS = { cap: 'cap', socket: 'cap', button: 'button', countersunk: 'countersunk', csk: 'countersunk', flat: 'countersunk', hex: 'hex', set: 'set', grub: 'set', pan: 'pan' };
const NUT_WORDS = { hex: 'hex', square: 'square', lock: 'lock', nyloc: 'lock' };
const NOISE = ['screw', 'bolt', 'head', 'plain', 'heat-set'];
const ITEMS = ['nut', 'washer', 'insert'];
const squash = (s) => String(s).toLowerCase().replace(/[\s#]/g, '');
const inches = (text) => { const [whole, frac] = /\//.test(text) ? (/\s/.test(text.trim()) ? text.trim().split(/\s+/) : ['0', text]) : [text, '0/1'], [n, d] = frac.split('/').map(Number); return Number(whole) + n / d; };

/**
 * A fixing's name read by the grammar, before any rule set is looked at.
 * @param {string} name 'M3', 'M3x12 cap', '1/4-20 x 1/2 cap', 'M4 lock nut', 'K30x10 pan torx'
 * @returns {{ thread: string, form: 'metric' | 'unified' | 'plastic', length: number | null, unit: 'mm' | 'in' | null, item: 'thread' | 'screw' | 'nut' | 'washer' | 'insert', head: string | null, nut: string | null, extra: string[] }}
 *   length: as written, in unit (null: the thread's own, mm or inches); extra: words left for the rule set's variants
 */
export function parseName(name) {
  const what = 'fixing name', help = `A name is a thread, then a length and what it is where it has them: 'M3', 'M3x12 cap', '1/4-20 x 1/2 button', 'M4 lock nut', 'M3 insert'`;
  if (typeof name !== 'string' || !name.trim()) throw new Error(`${what}: give a name, not ${shown(name)}. ${help}`);
  const s = name.trim();
  let t, thread, form;
  if ((t = /^m\s*(\d+(?:\.\d+)?)/i.exec(s))) { thread = `M${t[1]}`; form = 'metric'; }
  else if ((t = /^(?:pt\s*)?k\s*(\d+)/i.exec(s))) { thread = `K${t[1]}`; form = 'plastic'; }
  else if ((t = /^#?\s*(\d+\/\d+|\d+)\s*-\s*(\d+)(?:\s*(unc|unf)\b)?/i.exec(s))) { thread = `${t[1]}-${t[2]}${t[3] ? ` ${t[3].toUpperCase()}` : ''}`; form = 'unified'; }
  else throw new Error(`${what}: "${name}" does not start with a thread (M3, M2.5, 6-32, 1/4-20, K30). ${help}`);
  let tail = s.slice(t[0].length), length = null, unit = null;
  const l = /^\s*[x×*]\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(mm\b|in\b|"|”)?/i.exec(tail);
  if (l) { length = inches(l[1]); unit = l[2] ? (/mm/i.test(l[2]) ? 'mm' : 'in') : null; tail = tail.slice(l[0].length); if (!(length > 0)) throw new Error(`${what}: "${name}": a length is above 0 (got ${l[1]})`); }
  else if (/^\s*[x×*]/.test(tail)) throw new Error(`${what}: "${name}": after the x comes a length (M3x12, 1/4-20 x 1/2). ${help}`);
  const words = tail.toLowerCase().split(/[\s,]+/).filter(Boolean).filter((w) => !NOISE.includes(w));
  const items = words.filter((w) => ITEMS.includes(w));
  if (items.length > 1) throw new Error(`${what}: "${name}" names ${items.join(' and ')}: one thing at a time`);
  const item = items[0] ?? null, others = words.filter((w) => !ITEMS.includes(w)), table = item === 'nut' ? NUT_WORDS : item ? {} : HEAD_WORDS;
  const forms = [...new Set(others.filter((w) => w in table).map((w) => table[w]))], extra = others.filter((w) => !(w in table));
  if (forms.length > 1) throw new Error(`${what}: "${name}" says ${forms.join(' and ')}: ${item === 'nut' ? 'a nut is one of' : 'a head is one of'} ${(item === 'nut' ? NUTS : HEADS).join(', ')}`);
  if (item === 'nut' || item === 'washer') { if (length != null) throw new Error(`${what}: "${name}": a ${item} has no length`); }
  return { thread, form, length, unit, item: item ?? (length != null || forms[0] ? 'screw' : 'thread'), head: item ? null : forms[0] ?? null, nut: item === 'nut' ? forms[0] ?? 'hex' : null, extra };
}

// ---------- rule sets by thread ----------
// The keys a thread is found by: as written, and an inch thread without its series, a plastic screw without its maker's PT
const keysOf = (text) => { const k = squash(text); return [...new Set([k, k.replace(/un[cf]$/, ''), k.replace(/^pt/, '')])]; };
const index = (sets) => { const out = new Map(); for (const s of sets) for (const k of keysOf(s.rules.thread.value)) if (!out.has(k)) out.set(k, s); return out; };
const KIT_INDEX = index(KIT);
const isSet = (s) => !!s && typeof s === 'object' && !!s.rules && typeof s.rules === 'object';
// A workspace's sets, by the thread each is for: the one its `thread` rule names, or (an older set, from before threads
// said what they were) the kit's set of the same name
const OWN = new WeakMap();
function ownIndex(what, sets) {
  if (sets == null) return new Map();
  if (typeof sets !== 'object') throw new Error(`${what}: sets is the workspace's rule sets, by name ({ m3: { name, rules } }) or as a list, not ${shown(sets)}`);
  if (OWN.has(sets)) return OWN.get(sets);
  const out = new Map();
  for (const [n, s] of Array.isArray(sets) ? sets.map((x) => [x?.name, x]) : Object.entries(sets)) {
    if (!isSet(s)) continue;
    const text = typeof s.rules.thread?.value === 'string' ? s.rules.thread.value : KIT_BY_NAME[s.name ?? n]?.rules.thread.value;
    if (text) for (const k of keysOf(text)) if (!out.has(k)) out.set(k, { ...s, name: s.name ?? n });
  }
  OWN.set(sets, out);
  return out;
}

/**
 * The threads there are rule sets for, as each is written: the kit's, and a workspace's own first.
 * @param {{ sets?: object }} [opts] @returns {string[]}
 */
export function threads(opts = {}) {
  const own = [...new Set([...ownIndex('threads', opts?.sets).values()])].map((s) => s.rules.thread?.value ?? KIT_BY_NAME[s.name].rules.thread.value);
  return [...new Set([...own, ...KIT.map((s) => s.rules.thread.value)])];
}

const HEAD_FIGURES = {
  cap: { diameter: 'head', height: 'head_height', key: 'head_key' },
  button: { diameter: 'button_head', height: 'button_head_height', key: 'button_key' },
  countersunk: { diameter: 'countersunk_head', height: 'countersunk_head_height', key: 'countersunk_key', angle: 'countersunk_angle' },
  hex: { flats: 'hex_head_flats', height: 'hex_head_height' },
  set: { key: 'set_screw_key', point: 'set_screw_point' },
  pan: { diameter: 'pan_head', height: 'pan_head_height', drive: 'pan_head_drive' }
};
const NUT_FIGURES = { hex: { flats: 'nut_flats', height: 'nut_height' }, square: { flats: 'square_nut_flats', height: 'square_nut_height' }, lock: { flats: 'lock_nut_flats', height: 'lock_nut_height' } };
const first = (o) => Object.values(o)[0];
const madeOf = (figures) => ({
  heads: HEADS.filter((h) => figures[first(HEAD_FIGURES[h])]), nuts: NUTS.filter((n) => figures[first(NUT_FIGURES[n])]),
  washer: !!figures.washer_diameter, insert: !!figures.insert_hole
});
const list = (xs) => (xs.length ? xs.join(', ') : 'none');

/** @param {Fixing} m @param {string} n a figure's name @returns {string} the name it is cited by: 'm3.clearance' */
export const cite = (m, n) => `${m.set}.${n}`;

/**
 * A figure of a fixing as a number, refused by name where the thread has none or it is not a number.
 * @param {string} what @param {Fixing} m @param {string} n @returns {number}
 */
export function figure(what, m, n) {
  const f = m.figures[n];
  if (!f) throw new Error(`${what}: ${m.thread} has no ${n} in its rule set (${m.set})`);
  if (!isNum(f.value)) throw new Error(`${what}: ${cite(m, n)} is written as ${shown(f.value)}: a number is needed here (hand in the rule set with its values worked out)`);
  return f.value;
}

/**
 * A head form of a thread, from its figures: refused by name where that size is not made with it.
 * @param {string} what @param {Fixing} m @param {string} form cap, button, countersunk, hex, set or pan
 * @returns {Head}
 */
export function headOf(what, m, form) {
  oneOf(what, 'head', form, HEADS);
  if (!m.made.heads.includes(form)) throw new Error(`${what}: ${m.thread} is not made with a ${form} head, by its rule set (${m.set}): it comes as ${list(m.made.heads)}`);
  const names = HEAD_FIGURES[form], h = { form, diameter: 0, height: 0, across: 0, figures: Object.values(names).filter((n) => m.figures[n]) };
  for (const [k, n] of Object.entries(names)) if (m.figures[n]) h[k] = k === 'drive' ? m.figures[n].value : figure(what, m, n);
  h.across = h.flats ? r3(h.flats / Math.cos(Math.PI / 6)) : h.diameter; // (a hexagon's corners)
  return h;
}

/**
 * A nut on a thread, from its figures: refused by name where that size has none.
 * @param {string} what @param {Fixing} m @param {string} kind hex, square or lock
 * @returns {{ kind: string, flats: number, height: number, across: number, figures: string[] }} across: over the corners
 */
export function nutOf(what, m, kind) {
  oneOf(what, 'kind', kind, NUTS);
  if (!m.made.nuts.includes(kind)) throw new Error(`${what}: ${m.thread} has no ${kind} nut in its rule set (${m.set}): its nuts are ${list(m.made.nuts)}`);
  const names = NUT_FIGURES[kind], flats = figure(what, m, names.flats);
  return { kind, flats, height: figure(what, m, names.height), across: r3(kind === 'square' ? flats * Math.SQRT2 : flats / Math.cos(Math.PI / 6)), figures: Object.values(names) };
}

const INCH = 25.4, frac = (x) => { // a length in inches as it is said: 1/2, 1 1/2, or a decimal where it is no 64th
  const n = Math.round(x * 64); if (Math.abs(n / 64 - x) > 1e-6) return String(+x.toFixed(4));
  const g = (p, q) => (q ? g(q, p % q) : p), whole = Math.floor(n / 64), rem = n - whole * 64, d = g(rem, 64);
  return rem ? `${whole ? `${whole} ` : ''}${rem / d}/${64 / d}` : String(whole);
};
const said = (m, L) => (m.form === 'unified' ? `${frac(L / INCH)} in (${mm(L)} mm)` : `${mm(L)} mm`);

/** A screw's name in its one spelling: 'M3x12 cap', '1/4-20 UNC x 1/2 cap'. @param {Fixing} m @param {number | null} length mm @param {string} form @returns {string} */
export const screwName = (m, length, form) => `${m.thread}${length == null ? '' : m.form === 'unified' ? ` x ${frac(length / INCH)}` : `x${mm(length)}`} ${form}`;

/**
 * A screw's length held to the lengths it is sold in: refused, naming the nearest sold, unless the caller allows it.
 * @param {string} what @param {Fixing} m @param {number} length mm @param {boolean} [allow]
 * @returns {{ length: number, sold: boolean | null }} sold: null where the thread's rule set lists no lengths
 */
export function lengthOf(what, m, length, allow = false) {
  positive(what, 'length', length);
  const f = m.figures.lengths;
  if (!f) return { length, sold: null };
  if (!Array.isArray(f.value) || !f.value.every(isNum)) throw new Error(`${what}: ${cite(m, 'lengths')} is a list of numbers in mm (got ${shown(f.value)})`);
  const hit = f.value.find((x) => Math.abs(x - length) < 1e-3);
  if (hit != null) return { length: hit, sold: true };
  if (allow) return { length, sold: false };
  const below = f.value.filter((x) => x < length).at(-1), above = f.value.find((x) => x > length), nearest = [below, above].filter((x) => x != null).map((x) => said(m, x));
  throw new Error(`${what}: ${a(m.thread)} screw is not sold ${said(m, length)} long: the nearest ${nearest.length > 1 ? 'are' : 'is'} ${nearest.join(' and ')} (${cite(m, 'lengths')}: ${f.value.map((x) => (m.form === 'unified' ? frac(x / INCH) : mm(x))).join(', ')}${m.form === 'unified' ? ' in' : ' mm'}, the socket cap screw's). For a length you know you can buy, pass { anyLength: true }`);
}

/**
 * @typedef {{ value: number | string | number[], unit?: string, kind: string, source: string, rule?: string, checked?: string, from?: 'workspace' | 'kit' }} Figure
 *   one figure of a thread: its value, how far to trust it (kind: spec, measured, community, estimate, default, derived or given) and where it comes from
 * @typedef {{ form: string, diameter: number, height: number, across: number, key?: number, flats?: number, angle?: number, point?: number, drive?: string, figures: string[] }} Head
 *   a head: its diameter (0 for a hexagon head, which has flats, and for a set screw), its height (0 for a set screw), across: the widest it is; figures: the rules it was read from
 * @typedef {{ kind: 'fixing', item: 'thread' | 'screw' | 'nut' | 'washer' | 'insert', name: string, said: string, set: string, thread: string,
 *   form: 'metric' | 'unified' | 'plastic', major: number, pitch: number, length: number | null, sold: boolean | null, head: Head | null,
 *   nut: { kind: string, flats: number, height: number, across: number, figures: string[] } | null, variant: string | null,
 *   made: { heads: string[], nuts: string[], washer: boolean, insert: boolean }, figures: Record<string, Figure> }} Fixing
 *   name: the name in its one spelling; said: as it was asked for; set: the rule set's name; major, pitch: the thread, mm;
 *   length: a screw's, from under its head (a countersunk screw's and a set screw's: overall), or an insert's; sold: whether that length
 *   is in the thread's list (null: it lists none); made: the head forms, nuts, washer and insert this size has figures for
 */

/**
 * A fixing by name, from its thread's rule set: a thread ('M3', '1/4-20'), or a whole screw ('M3x12 cap'), nut
 * ('M4 lock nut'), washer or insert on it. See GRAMMAR for what a name may say.
 * @param {string} name
 * @param {Record<string, number | string | number[] | Partial<Figure>>} [change] a different or measured figure, by its rule's name:
 *   { clearance: 3.3 } or { pilot: { value: 2.8, kind: 'measured', source: 'my coupon, 2026-11-20' } }
 * @param {{ sets?: object, anyLength?: boolean, variant?: string }} [opts] sets: the workspace's rule sets, by name or as a
 *   list, where a set for this thread is used before the kit's (its figures first, the kit's for what it lacks);
 *   anyLength: take a length the thread's list does not have; variant: a variant of the rule set, by its name
 * @returns {Fixing}
 */
export function fixingModel(name, change = {}, opts = {}) {
  const what = 'fixingModel', p = parseName(name);
  if (change == null || typeof change !== 'object') throw new Error(`${what}: change is figures by their rules' names ({ clearance: 3.3 }), not ${shown(change)}`);
  const key = squash(p.thread), own = ownIndex(what, opts?.sets).get(key), kit = KIT_INDEX.get(key);
  if (!own && !kit) {
    const all = threads(opts), close = all.filter((t) => keysOf(t).some((k) => near(key, k) <= 1)); // (one near miss is a slip: 10-32 UNC; several, as round M7, are no help)
    throw new Error(`${what}: no thread "${p.thread}"${close.length === 1 ? ` (did you mean ${close[0]}?)` : ''}. There are: ${all.join(', ')}. For another thread, hand in its rule set ({ sets })`);
  }
  const set = own ?? kit, figures = {};
  if (own && kit && own !== kit) for (const [n, r] of Object.entries(kit.rules)) figures[n] = { ...r, from: 'kit' };
  for (const [n, r] of Object.entries(set.rules)) figures[n] = own && kit && own !== kit ? { ...r, from: 'workspace' } : { ...r };
  const variants = { ...(own && kit ? kit.variants : {}), ...set.variants }, variantNames = Object.keys(variants);
  const apply = (v) => { for (const [n, value] of Object.entries(variants[v].values ?? {})) figures[n] = { ...figures[n], value, kind: variants[v].kind ?? figures[n]?.kind, source: variants[v].source ?? figures[n]?.source }; return v; };
  const find = (w) => variantNames.find((v) => squash(v) === squash(w));
  let variant = null;
  if (opts?.variant != null) { const v = find(opts.variant); if (!v) throw new Error(`${what}: ${set.name} has no variant "${opts.variant}" (${list(variantNames)})`); variant = apply(v); }
  for (const w of p.extra) {
    const v = find(w);
    if (!v) throw new Error(`${what}: "${name}": nothing is called "${w}". A head form is one of ${HEADS.join(', ')}; a nut is 'hex nut', 'square nut' or 'lock nut'; and there are 'washer' and 'insert'${variantNames.length ? `. ${set.name}'s variants: ${list(variantNames)}` : ''}`);
    variant = apply(v);
  }
  for (const [n, c] of Object.entries(change)) {
    if (!figures[n]) { const guess = Object.keys(figures).map((k) => [near(n, k), k]).sort((x, y) => x[0] - y[0])[0]; throw new Error(`${what}: ${set.name} has no figure "${n}"${guess[0] <= 3 ? ` (did you mean ${guess[1]}?)` : ''}`); }
    figures[n] = typeof c === 'object' && c && !Array.isArray(c) ? { ...figures[n], ...c } : { ...figures[n], value: c, kind: 'given', source: 'given to fixingModel' };
    if (figures[n].value == null) throw new Error(`${what}: ${n} needs a value (got ${shown(c)})`);
  }
  for (const n of ['thread', 'thread_form', 'major_diameter', 'pitch']) if (!figures[n]) throw new Error(`${what}: ${set.name} is no thread's rule set: it has no ${n} (a thread needs thread, thread_form, major_diameter and pitch)`);
  const form = oneOf(`${what}: ${set.name}.thread_form`, 'the form', figures.thread_form.value, ['metric', 'unified', 'plastic']);
  /** @type {Fixing} */
  const m = { kind: 'fixing', item: p.item, name: '', said: name, set: set.name, thread: String(figures.thread.value), form, major: 0, pitch: 0, length: null, sold: null, head: null, nut: null, variant, made: madeOf(figures), figures };
  m.major = positive(`${what}: ${set.name}`, 'major_diameter', figure(what, m, 'major_diameter')); m.pitch = positive(`${what}: ${set.name}`, 'pitch', figure(what, m, 'pitch'));
  const given = p.length == null ? null : p.item === 'insert' ? (p.unit === 'in' ? p.length * INCH : p.length) : (p.unit ?? (form === 'unified' ? 'in' : 'mm')) === 'in' ? p.length * INCH : p.length;
  if (p.item === 'screw') {
    m.head = headOf(what, m, p.head ?? (m.made.heads.includes('cap') ? 'cap' : m.made.heads[0]));
    // (the list of lengths is the socket cap screw's: a set screw is sold shorter, so its length is not held to it)
    if (given != null && m.head.form === 'set') m.length = positive(what, 'length', given);
    else if (given != null) Object.assign(m, lengthOf(what, m, given, !!opts?.anyLength));
  } else if (p.item === 'nut') m.nut = nutOf(what, m, p.nut);
  else if (p.item === 'washer') { if (!m.made.washer) throw new Error(`${what}: ${m.thread} has no washer in its rule set (${set.name})`); }
  else if (p.item === 'insert') {
    if (!m.made.insert) throw new Error(`${what}: ${m.thread} has no heat-set insert in its rule set (${set.name})`);
    if (given != null && Math.abs(given - figure(what, m, 'insert_length')) > 1e-3) {
      const fits = variantNames.filter((v) => Math.abs((variants[v].values?.insert_length ?? NaN) - given) < 1e-3);
      if (!fits.length) throw new Error(`${what}: ${a(m.thread)} insert is not listed ${mm(given)} mm long: its rule set (${set.name}) has ${[set.rules.insert_length?.value ?? kit?.rules.insert_length?.value, ...variantNames.map((v) => variants[v].values?.insert_length)].filter(isNum).map(mm).join(', ')} mm`);
      m.variant = apply(fits[0]);
    }
    m.length = figure(what, m, 'insert_length');
  }
  const also = m.variant ? ` ${m.variant}` : '';
  m.name = m.item === 'thread' ? `${m.thread}${also}` : m.item === 'screw' ? `${screwName(m, m.length, m.head.form)}${also}`
    : m.item === 'nut' ? `${m.thread} ${m.nut.kind} nut` : m.item === 'washer' ? `${m.thread} washer` : form === 'unified' ? `${m.thread} x ${mm(m.length)} mm insert` : `${m.thread}x${mm(m.length)} insert`;
  return m;
}

/**
 * A fixing from what a function was handed: its model as it is, or a name read with the caller's rule sets.
 * @param {string} what the function asking, for its refusals @param {Fixing | string} m @param {{ sets?: object, anyLength?: boolean }} [o]
 * @returns {Fixing}
 */
export function fixingOf(what, m, o = {}) {
  if (typeof m === 'string') return fixingModel(m, {}, { sets: o?.sets, anyLength: o?.anyLength });
  if (!m || m.kind !== 'fixing') throw new Error(`${what}: give a fixing's model (fixingModel) or its name ('M3', 'M3x12 cap'), not ${shown(m)}`);
  return m;
}

// ---------- the printer ----------
const BASICS = ['hole_comp', 'fit', 'layer', 'line', 'chamfer', 'bridge', 'overhang', 'slip', 'press'];
/**
 * @typedef {{ name: string, figure: (k: string) => (Figure & { name: string, borrowed?: boolean }) | null, n: (k: string) => number, cite: (k: string) => string, rest: (k: string) => object }} Printer
 *   figure: a rule of the printer's own (never borrowed); n: a basic clearance as a number, the printer's own or, where it
 *   has none, the X1C's; cite: the name that number is cited by
 */
/**
 * The printer's rules as fixings reads them. Handed nothing, the kit's X1C. Handed a rule set ({ name, rules }), its
 * figures with their kinds and sources. Handed plain numbers (a design's v.x1c), those, marked as given. A basic
 * clearance the printer lacks (hole_comp, fit, layer, chamfer, bridge, overhang, slip, press) is borrowed from the X1C
 * and cited as the X1C's; a measured figure (pilot_m3) is never borrowed, since it was measured on that machine.
 * @param {string} what @param {object} [p] @returns {Printer}
 */
export function printerOf(what, p) {
  let name = x1c.name, own = x1c.rules;
  if (p != null) {
    if (typeof p !== 'object' || Array.isArray(p)) throw new Error(`${what}: printer is the printer's rule set ({ name, rules }) or its values ({ hole_comp: 0.1, fit: 0.2, layer: 0.2 }), not ${shown(p)}`);
    if (isSet(p)) { name = p.name ?? 'the printer'; own = p.rules; }
    else { name = typeof p.name === 'string' ? p.name : 'the printer'; own = Object.fromEntries(Object.entries(p).filter(([, v]) => isNum(v)).map(([k, v]) => [k, { value: v, kind: 'given', source: 'the printer\'s values, handed in as plain numbers' }])); }
  }
  const sep = name === 'the printer' ? '\'s ' : '.';
  const figure = (k) => (own[k] ? { ...own[k], name: `${name}${sep}${k}` } : null);
  const basic = (k) => figure(k) ?? (BASICS.includes(k) ? { ...x1c.rules[k], name: `x1c.${k}`, borrowed: true } : null);
  const n = (k) => {
    const f = basic(k);
    if (!f) throw new Error(`${what}: the printer (${name}) has no ${k}`);
    if (!isNum(f.value) || f.value < 0) throw new Error(`${what}: ${f.name} is a number of 0 or more (got ${shown(f.value)}): hand in the printer's values worked out`);
    return f.value;
  };
  return { name, figure, n, cite: (k) => basic(k)?.name ?? `${name}${sep}${k}`, rest: (k) => { const f = basic(k); return { ...rest(f.name, f), ...(f.borrowed ? { borrowed: true } : {}) }; } };
}

/** How much thread a screw needs in a material, in diameters: the engagement rule set's figures. */
export const ENGAGEMENT = engagementSet.rules;
/** Which engagement rule a material reads: steel, aluminium or plastic (anything not named a metal). */
export const engagementOf = (material) => { const k = String(material ?? 'plastic').toLowerCase(); return /steel|stainless|iron/.test(k) ? 'steel' : /^alu/.test(k) ? 'aluminium' : 'plastic'; };

/** A height rounded up to whole layers. */
export const layers = (h, layer) => r3(Math.ceil(h / layer - 1e-6) * layer);

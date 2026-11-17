// Beams in assemblies (@rulecad/frames).
//
// A beam item is a length of a profile: { "id": "x1", "beam": { "profile": "2020-misumi-hfs5", "length": 300 },
// "from": [0, 0, 0], "to": [300, 0, 0], "roll": 0 }, or placed with at and rotate as any item is. It is bought, so it is
// drawn faint (a reference), goes on cad list by profile and length, and is in the overlap check by its envelope.
// Its frame is the beam's own: end a at z = 0, end b at z = length, top +y, front -x. Placed by its ends, its z runs
// from to to, and at roll 0 its top faces up (+z), or +y when it stands upright (within 0.1° of z); roll turns it
// about its own axis, a toward b, right-handed.
// Its addresses are anchors (lib/assembly.mjs reads them through beamAnchor): x1.a, x1.b, x1.a.1, x1.top, x1.top@120,
// x1.top@-20, x1.top@50%, x1.top.2@120.
// Its operations ("ops": cut, mitre, tap, access, drill, counterbore, pocket, notch, deburr) are @rulecad/frames': each
// is cut into its preview, a mitre into its envelope too, and their findings (beam.op) are the beam's.
import * as frames from '@rulecad/frames';
import fs from 'node:fs';
import path from 'node:path';
import { beamModel, beam, beamAnchor, cutList, beamMarks, beamSheet } from '@rulecad/frames';
import { frame } from '@rulecad/model-link';
import { RULE_DIRS, paths } from './workspace.mjs';
import { named } from './parts.mjs';
import { referenceBuilt } from './bought.mjs';
import { framesContext as contextIn, givenFor } from './frames.mjs';

const KEYS = ['profile', 'length', 'printed', 'material', 'ops'];
const OP_NUMBERS = ['angle', 'depth', 'diameter', 'length', 'radius'];
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const mm = (x) => String(+Number(x).toFixed(2));
const strip = (e) => String(e?.message ?? e).replace(/^(beamModel|beamAnchor|profileModel|beam): /, '');
/** This workspace's frames sets (lib/frames.mjs framesContext over its rules/) */
export const framesContext = () => contextIn(RULE_DIRS[0]);

/**
 * The beam an item names, its length worked out: { model, length }. A length may be an expression; left out, it is the
 * distance from from to to. Refused by name: an unknown key, no profile, a printed beam (a later release), a length
 * that disagrees with its ends, ends and at both given.
 * @param {object} it the item @param {(x: any) => number} num the assembly's expressions @param {object} [context] framesContext()'s
 */
export function beamOf(it, num, context = framesContext()) {
  const what = `item ${it.id}`, b = it.beam;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error(`${what}: beam is { "profile", "length", "material" } (got ${shown(b)})`);
  for (const k of Object.keys(b)) if (!KEYS.includes(k)) throw new Error(`${what}: a beam has no "${k}": it takes ${KEYS.join(', ')}`);
  if (typeof b.profile !== 'string' || !b.profile) throw new Error(`${what}: beam.profile names a profile, such as 2020-misumi-hfs5 (got ${shown(b.profile)})`);
  if (b.printed != null && typeof b.printed !== 'boolean') throw new Error(`${what}: beam.printed is true or false (got ${shown(b.printed)})`);
  if (b.printed) throw new Error(`${what}: a printed beam ("printed": true) is a later release${b.ops?.length ? ', and its ops become features of the print then' : ''}: leave printed out for a bought beam of ${b.profile}`);
  if (b.ops != null && !Array.isArray(b.ops)) throw new Error(`${what}: beam.ops is a list of operations, [{ "op": "tap", "at": "a" }] (got ${shown(b.ops)})`);
  // an operation's numbers may be expressions, as a length is
  const ops = (b.ops ?? []).map((o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, OP_NUMBERS.includes(k) && v != null ? num(v) : k === 'size' && Array.isArray(v) ? v.map(num) : v])) : o));
  if (b.material != null && typeof b.material !== 'string') throw new Error(`${what}: beam.material is a material set's name, such as al6063-t5 (got ${shown(b.material)})`);
  const ends = it.from != null || it.to != null;
  if (ends && (it.from == null || it.to == null)) throw new Error(`${what}: a beam placed by its ends gives both: from (end a) and to (end b)`);
  if (ends && (it.at != null || it.rotate != null)) throw new Error(`${what}: a beam is placed by its ends (from, to, roll) or by at and rotate, not both`);
  if (!ends && it.roll != null) throw new Error(`${what}: roll turns a beam placed by its ends: give from and to, or turn it with rotate`);
  if (ends && it.repeat) throw new Error(`${what}: a beam placed by its ends is one beam: give each its own item, or place it with at and repeat`);
  for (const k of ['from', 'to']) if (ends && !(Array.isArray(it[k]) && it[k].length === 3)) throw new Error(`${what}: ${k} is a point, [x, y, z] (got ${shown(it[k])})`);
  const span = ends ? Math.hypot(...[0, 1, 2].map((i) => num(it.to[i]) - num(it.from[i]))) : null;
  if (b.length == null && span == null) throw new Error(`${what}: give the beam a length, or place it by its ends (from and to) so the length is theirs`);
  const length = b.length != null ? num(b.length) : span;
  if (!(Number.isFinite(length) && length > 0)) throw new Error(`${what}: a beam's length is above 0 mm (got ${shown(b.length ?? length)}${b.length == null ? ': its ends are at one point' : ''})`);
  if (span != null && Math.abs(span - length) > 1e-3) throw new Error(`${what}: its length is ${mm(length)} mm, and its ends are ${mm(span)} mm apart: leave the length out, or move an end`);
  const given = givenFor(context, b.profile);
  let model;
  try {
    model = beamModel(frames.profileModel(b.profile, {}, given), { length, ...(b.material ? { material: b.material } : {}), ...(ops.length ? { ops } : {}), given });
  } catch (e) { throw new Error(`${what}: ${strip(e)}`); }
  return { model, length };
}

/**
 * Where a beam placed by its ends goes: its frame as 12 numbers by rows (z from end a to end b, top up, turned by roll),
 * or null for a beam placed by at and rotate.
 * @param {object} it @param {(x: any) => number} num @returns {number[] | null}
 */
export function beamPlace(it, num) {
  if (it.from == null) return null;
  const a = it.from.map(num), b = it.to.map(num), z = b.map((v, k) => v - a[k]), l = Math.hypot(...z), u = z.map((v) => v / l);
  const up = Math.abs(u[2]) > Math.cos(0.1 * Math.PI / 180) ? [0, 1, 0] : [0, 0, 1], d = up[0] * u[0] + up[1] * u[1] + up[2] * u[2];
  const yl = up.map((v, k) => v - d * u[k]), n = Math.hypot(...yl), y = yl.map((v) => v / n);
  const x = [y[1] * u[2] - y[2] * u[1], y[2] * u[0] - y[0] * u[2], y[0] * u[1] - y[1] * u[0]]; // y × z
  const r = (it.roll != null ? num(it.roll) : 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return frame(a, u, x.map((v, k) => c * v + s * y[k]));
}

/**
 * An item with "beam", built as a bought reference: its preview solid as the part, its envelope for the overlap check,
 * its named anchors (ends, end bores, faces at mid-length) for joints and fits, and its figures as values (x1.length).
 * @param {object} it @param {(x: any) => number} num @param {string} id
 */
export function beamBuilt(it, num, id, context = framesContext()) {
  const { model: m, length } = beamOf(it, num, context);
  const meta = { body: { label: `${m.profile.name} x ${mm(length)} mm` } };
  const parts = named({ body: beam(m) }, meta), link = named({ body: beam(m, { display: 'link', tracks: true }) }, meta)[0];
  parts[0].collide = link.geometry; // (the overlap check measures the envelope, light, less any V tracks: a V-wheel's rim runs in them, and a rim out of them hits the beam)
  const anchors = Object.fromEntries(Object.entries(m.anchors).map(([k, a]) => [k, { at: a.origin, axis: a.axis, ref: a.ref }]));
  const values = { length, width: m.profile.width, height: m.profile.height, area: m.area, ...(m.mass != null ? { mass: m.mass } : {}) };
  const entries = Object.entries(m.profile.figures).filter(([, f]) => typeof f?.value === 'number').map(([k, f]) => ({ name: `${m.profile.name}.${k}`, value: f.value, unit: f.unit, rule: f.rule, kind: f.kind, source: f.source, checked: f.checked, set: m.profile.name }));
  const grams = m.weight.sheet ?? m.mass; // (weighed by the sheet where it gives a mass per metre: a light section's drawn outline can be 10 to 20% heavy)
  return referenceBuilt({ id, key: 'beam', objName: `beam:${m.profile.name}`, name: m.profile.name, parts, anchors, entries, values,
    extra: { beam: m, bought: { set: m.profile.name, variant: null, part: 'beam', mass: grams != null ? grams / 1000 : null, length } } });
}

/**
 * An anchor on a beam by its address (a, b, a.1, top, top@120, top@-20, top@50%, top.2@120), as a frame of 12 numbers in
 * the beam's own frame. Past the beam's end, or a name it does not have: refused by name, with its length.
 * @param {object} m the beam's model @param {string} address what follows the item's id @param {string} what who asks
 */
export function beamAddress(m, address, what) {
  let a;
  try { a = beamAnchor(m, address); } catch (e) { throw new Error(`${what}: ${strip(e)}`); }
  return frame(a.origin, a.axis, a.ref);
}

/** The assembly's beams, nested ones too, as { id, beam } for @rulecad/frames' cut list. @param {object} s a built assembly */
export const beamsIn = (s) => s.objects.filter((o) => o.beam && !o.unplaced).map((o) => ({ id: o.id, beam: o.beam }));

/** Each beam's mark: beams that are the same share one (A, B, ...), as the cut list and the sheets name them. @returns {Map<string, string>} item to mark */
export function marksOf(objects) {
  const list = objects.filter((o) => o.beam && !o.unplaced), out = new Map();
  if (list.length) for (const m of beamMarks(list.map((o) => ({ id: o.id, beam: o.beam })))) for (const id of m.items) out.set(id, m.mark);
  return out;
}

/** The cut list of an assembly's beams (frames' cutList), or null where it has none. @param {object} s a built assembly */
export function cutListOf(s) { const b = beamsIn(s); return b.length ? cutList(b) : null; }

/** The cut list as the list and the build page keep it: no beam models, the numbers and words only. */
export const cutListData = (c) => c && { marks: c.marks.map(({ beam, ...m }) => m), stock: c.stock, totals: c.totals, rules: Object.fromEntries(Object.entries(c.rules).map(([k, r]) => [k, { value: r.value, unit: r.unit, kind: r.kind }])) };

/** The sheet files cad beams writes for an assembly, by mark: exports/<project>/<assembly>.beam-<mark>.svg */
export const sheetFile = (s, mark) => paths.exports(s.project, `${s.name}.beam-${mark}.svg`);

/**
 * One cut-and-drill sheet per mark, written to exports/<project>/<assembly>.beam-<mark>.svg, old sheets of this
 * assembly removed. @param {object} s a built assembly @returns {{ mark: string, file: string, items: string[], scale: number }[]}
 */
export function writeBeamSheets(s) {
  const c = cutListOf(s), dir = paths.exports(s.project), base = `${s.name}.beam-`;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.startsWith(base) && f.endsWith('.svg')) fs.rmSync(path.join(dir, f));
  if (!c) return [];
  fs.mkdirSync(dir, { recursive: true });
  return c.marks.map((m) => { const sh = beamSheet(m.beam, { mark: m.mark, items: m.items, grams: m.grams }), file = sheetFile(s, m.mark); fs.writeFileSync(file, sh.svg); return { mark: m.mark, file, items: m.items, scale: sh.scale }; });
}

/** Each beam's own findings (its mass beside the sheet's, its length beside the stock's), named by item; and the cut list's (frame.cut). */
export function beamFindings(s, f) {
  for (const o of s.objects) if (o.beam && !o.unplaced) for (const x of o.beam.findings) f(x.level, `${o.id}: ${x.text}`, null, { code: x.code, ...(x.values ? { values: x.values } : {}), refs: { item: o.id, profile: o.beam.profile.name, length: o.beam.length, ...(x.rule ? { rule: x.rule } : {}) } });
  const c = cutListOf(s);
  if (c) for (const x of c.findings) f(x.level, x.text, null, { code: x.code, ...(x.values ? { values: x.values } : {}), refs: x.refs });
}

// Jigs for an assembly's beams (@rulecad/frames jig.mjs), generated from the assembly: a drill guide for each distinct
// hole across a beam (access, drill, counterbore), a tap guide for each distinct tapped end, a cut-length stop for
// each distinct length, and a squaring corner for each distinct pair of profiles a square join (blind, end-tap) holds.
// Distinct means drawn the same: one guide serves every hole of its size at its distance from an end, on every mark.
// Each jig is marked with what it is for (mark and the sheet's operation number: A3; a length stop: A 260), cut into
// a face that faces up as it prints, and laid out on the printer's bed as a plate: exports/<project>/<assembly>.jigs.3mf
// (.jigs-2.3mf and on where one bed is not enough). cad beams <project>/<assembly> --jigs writes them.
import fs from 'node:fs';
import path from 'node:path';
import jscad from '@jscad/modeling';
import { JOINS, beamSheet, drillGuideModel, drillGuide, tapGuideModel, tapGuide, lengthStopModel, lengthStop, squareCornerModel, squareCorner, JIG_KINDS } from '@rulecad/frames';
import { placeItems } from '@rulecad/model-link';
import { text } from '@rulecad/shapes';
import { check as printCheck } from '@rulecad/printcheck';
import { paths, printerOf } from './workspace.mjs';
import { peekRuleSet } from './rules.mjs';
import { threemf } from './threemf.mjs';
import { cutListOf } from './beams.mjs';

const { measureBoundingBox } = jscad.measurements, { translate } = jscad.transforms, { geom3 } = jscad.geometries;
const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const strip = (e) => String(e?.message ?? e).replace(/^\w+Model: /, '');
const HOLES = JIG_KINDS['drill-guide'].ops;
const SQUARE_JOINS = Object.keys(JOINS).filter((k) => ['blind', 'end-tap'].includes(k));

// The project's printer as frames reads it ({ name, rules }), and as printcheck reads it (plain numbers)
function printerFor(project) {
  let set = null;
  try { set = peekRuleSet(printerOf(project)); } catch { set = null; }
  const num = (k, d) => (typeof set?.rules?.[k]?.value === 'number' ? set.rules[k].value : d);
  const layer = num('layer', 0.2);
  return { set, check: { bed: num('bed', 256), overhang: num('overhang', 45), layer, support_gap: num('support_gap', layer), bridge: num('bridge', 5), line: num('line', 0.42), print_gap: num('print_gap', 0.3), foot: num('foot', 0.15) } };
}

// Where a beam item's face lies in the world: its outward normal and a point on it, from the item's placed frame
function faceWorld(W, place, L) {
  const dir = (v) => [0, 1, 2].map((k) => W[4 * k] * v[0] + W[4 * k + 1] * v[1] + W[4 * k + 2] * v[2]);
  const pt = (p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
  return { n: dir([...place.normal, 0]), at: pt([...place.at, L / 2]), along: dir([...place.along, 0]) };
}

/**
 * The jigs an assembly's beams take, each with what it is for. Holes too far from both ends for one print, and square
 * joins with no slotted faces in one plane, give a warning (jig.drill, jig.square) in place of a jig.
 * @param {object} s a built assembly
 * @returns {{ jigs: { kind: string, name: string, model: object, for: object[], label: string }[], findings: object[] }}
 */
export function jigsOf(s) {
  const c = cutListOf(s), jigs = new Map(), findings = [], printer = printerFor(s.project).set ?? undefined;
  const warn = (code, txt, refs) => findings.push({ level: 'warn', code, text: txt, refs });
  const add = (key, kind, model, who) => { if (!jigs.has(key)) jigs.set(key, { kind, name: model.name, model, for: [] }); jigs.get(key).for.push(who); };
  if (!c) return { jigs: [], findings };
  for (const mk of c.marks) {
    const b = mk.beam, sheet = beamSheet(b, { mark: mk.mark, items: mk.items });
    b.ops.forEach((x, i) => {
      const who = { mark: mk.mark, items: mk.items, op: i + 1, at: x.at, line: x.line };
      if (HOLES.includes(x.op)) {
        try {
          const m = drillGuideModel(b, i, { ...(printer ? { printer } : {}) }), z = r3(m.fit[6] * m.bush.at[1] + m.fit[14]); // (the bush's axis, fitted: its distance from end a)
          const dim = sheet.dimensions.find((d) => d.op === i + 1);
          add(`drill|${m.name}|${m.profile}|${m.plate.span.join(',')}`, 'drill-guide', m, { ...who, label: `${mk.mark}${i + 1}`, from: m.from, distance: m.bush.at[1], bush: z, sheet: dim ? dim.distance : null, sheetText: dim ? dim.text : null });
        } catch (e) { warn('jig.drill', `mark ${mk.mark} (${mk.items.join(', ')}), operation ${i + 1}: no drill guide: ${strip(e)}`, { mark: mk.mark, op: i + 1 }); }
      }
      if (x.op === 'tap') {
        const m = tapGuideModel(b, i, { ...(printer ? { printer } : {}) });
        add(`tap|${m.name}|${m.profile}|${JSON.stringify(m.bores)}`, 'tap-guide', m, { ...who, label: `${mk.mark}${i + 1}`, end: x.end, bores: x.bores });
      }
    });
    const m = lengthStopModel(b.profile, b.length, { ...(printer ? { printer } : {}) });
    add(`length|${b.profile.name}|${b.length}`, 'length-stop', m, { mark: mk.mark, items: mk.items, label: `${mk.mark} ${mm(b.length)}`, length: b.length });
  }
  // a squaring corner for each square join: on a face of each beam in one plane, the outer pair where there are two
  const marks = new Map(c.marks.flatMap((mk) => mk.items.map((id) => [id, mk.mark])));
  const placed = s.joins?.length ? placeItems(s.motion, s.jointValues) : [], worlds = Object.fromEntries(s.motion.items.map((x, i) => [x[0], placed[i]])), beams = new Map(s.objects.filter((o) => o.beam && !o.unplaced).map((o) => [o.id, o.beam]));
  const middle = (() => { const pts = [...beams.keys()].filter((id) => worlds[id]).map((id) => { const W = worlds[id], L = beams.get(id).length; return [W[2] * L / 2 + W[3], W[6] * L / 2 + W[7], W[10] * L / 2 + W[11]]; }); return pts.length ? [0, 1, 2].map((k) => pts.reduce((t, p) => t + p[k], 0) / pts.length) : [0, 0, 0]; })();
  for (const j of s.joins ?? []) {
    if (!SQUARE_JOINS.includes(j.kind) || j.model.b.end != null) continue;
    const [ai, bi] = j.items, A = beams.get(ai), B = beams.get(bi), Wa = worlds[ai], Wb = worlds[bi];
    if (!A || !B || !Wa || !Wb) continue;
    const away = [0, 1, 2].map((k) => (j.end[0] === 'a' ? 1 : -1) * Wa[4 * k + 2]); // along a, away from b
    let best = null;
    for (const pa of A.places.filter((q) => q.slot)) for (const pb of B.places.filter((q) => q.slot)) {
      const fa = faceWorld(Wa, pa, A.length), fb = faceWorld(Wb, pb, B.length);
      if (dot(fa.n, fb.n) < 1 - 1e-6 || Math.abs(dot(fa.n, fa.at.map((v, k) => v - fb.at[k]))) > 0.05) continue;
      const out = dot(fa.n, fb.at.map((v, k) => v - middle[k]));
      if (!best || out > best.out + 1e-9) best = { pa, pb, out, edge: dot(fb.along, away) > 0 ? 'hi' : 'lo' };
    }
    if (!best) { warn('jig.square', `${j.label}: no squaring corner: ${ai} and ${bi} have no slotted faces in one plane for it to key into`, { join: j.index }); continue; }
    const m = squareCornerModel({ profile: A.profile, face: best.pa.name }, { profile: B.profile, face: best.pb.name, edge: best.edge }, { ...(printer ? { printer } : {}) });
    add(`corner|${m.name}|${JSON.stringify(m.outline)}`, 'square-corner', m, { join: j.index, label: `${marks.get(ai)}${marks.get(bi)}`, marks: [marks.get(ai), marks.get(bi)], items: [ai, bi], faces: [best.pa.name, best.pb.name], text: j.label });
  }
  const out = [...jigs.values()].map((x) => ({ ...x, label: labelOf(x) }));
  return { jigs: out, findings };
}

// A jig's mark: what it is for, as short as the face it is cut in takes (the first and a + where all do not fit)
function labelOf(x) {
  const marks = [...new Set(x.for.flatMap((w) => w.marks ?? [w.mark]))].sort().join(''), t = x.kind === 'length-stop' ? `${marks} ${mm(x.model.length)}` : marks;
  return t.length <= 9 ? t : `${t.slice(0, 8)}+`;
}

// A mark as a 2D outline that fits the room given ([along, across]), or null where none fits
function markShape(label, room) {
  if (!label || !room || room[1] < 2.5 || room[0] < 4) return null;
  let h = Math.min(4, room[1] * 0.7), g = text({ text: label, height: h, stroke: 0.6 });
  const [lo, hi] = measureBoundingBox(g), w = hi[0] - lo[0];
  if (w > room[0]) { h *= room[0] / w; if (h < 2) return null; g = text({ text: label, height: h, stroke: 0.6 }); }
  return g;
}

/** Each jig's printed parts, in print pose and marked: [{ name, solid, count }]. @param {object} x one of jigsOf's */
export function jigParts(x) {
  const m = x.model, mark = (room) => markShape(x.label, room);
  if (x.kind === 'drill-guide') return [{ name: m.name, solid: drillGuide(m, { mark: mark(m.label.room) }), count: 1 }];
  if (x.kind === 'tap-guide') return [{ name: m.name, solid: tapGuide(m, { mark: mark(m.label?.room) }), count: 1 }];
  if (x.kind === 'square-corner') return [{ name: m.name, solid: squareCorner(m, { mark: mark(m.label.room) }), count: 1 }];
  return [{ name: `${m.name}-block`, solid: lengthStop(m, { mark: mark(m.label.room) }), count: 1 }, { name: `${m.name}-gauge`, solid: lengthStop(m, { part: 'gauge', mark: mark(m.gaugeLabel.room) }), count: m.gauge.pieces }];
}

const triangles = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((v, i) => [[...p.vertices[0]], [...v], [...p.vertices[i + 2]]]));

// Shelves on a bed, largest first, each part gap apart: as many beds as it takes
function pack(items, bed, gap) {
  const sorted = [...items].sort((a, b) => b.size[1] - a.size[1] || b.size[0] - a.size[0]), beds = [], room = bed - 2 * gap;
  for (const p of sorted) {
    if (p.size[0] > room || p.size[1] > room) throw new Error(`${p.name} is ${mm(p.size[0])} x ${mm(p.size[1])} mm, more than the ${mm(bed)} mm bed takes`);
    let done = false;
    for (const b of beds) {
      const shelf = b.shelves.at(-1);
      if (shelf.x + p.size[0] <= room + 1e-9) { b.parts.push({ ...p, at: [shelf.x, shelf.y] }); shelf.x += p.size[0] + gap; shelf.h = Math.max(shelf.h, p.size[1]); done = true; break; }
      const y = shelf.y + shelf.h + gap;
      if (y + p.size[1] <= room + 1e-9) { b.shelves.push({ x: p.size[0] + gap, y, h: p.size[1] }); b.parts.push({ ...p, at: [0, y] }); done = true; break; }
    }
    if (!done) beds.push({ shelves: [{ x: p.size[0] + gap, y: 0, h: p.size[1] }], parts: [{ ...p, at: [0, 0] }] });
  }
  return beds;
}

/** The plate files cad beams --jigs writes for an assembly: exports/<project>/<assembly>.jigs.3mf, .jigs-2.3mf, ... */
export const jigFile = (s, n, of) => paths.exports(s.project, `${s.name}.jigs${of > 1 ? `-${n}` : ''}.3mf`);

/**
 * The jigs of an assembly, made, checked by printcheck and laid out on the printer's bed as plates, written to
 * exports/; old plates of this assembly's jigs removed first.
 * @param {object} s a built assembly @param {{ write?: boolean }} [o]
 * @returns {Promise<{ jigs: object[], plates: { file: string, parts: string[] }[], findings: object[], parts: object[] }>}
 *   jigs: each with its kind, name, mark, what it is for, grams, margin and what printcheck says of each part
 */
export async function writeJigs(s, { write = true } = {}) {
  const { jigs, findings } = jigsOf(s), { check } = printerFor(s.project), dir = paths.exports(s.project), base = `${s.name}.jigs`;
  if (write && fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.startsWith(base) && f.endsWith('.3mf')) fs.rmSync(path.join(dir, f));
  const parts = [], rows = [];
  for (const x of jigs) {
    const made = jigParts(x), checks = [];
    for (const p of made) {
      const tris = triangles(p.solid), issues = printCheck(tris, check).filter((f) => f.level === 'fail' || f.level === 'warn');
      checks.push({ part: p.name, count: p.count, issues: issues.map((f) => `${f.code}: ${f.text}`) });
      const [lo, hi] = measureBoundingBox(p.solid);
      for (let k = 0; k < p.count; k++) parts.push({ name: p.count > 1 ? `${p.name}-${k + 1}` : p.name, jig: x.name, tris: tris.map((t) => t.map((v) => [v[0] - lo[0], v[1] - lo[1], v[2] - lo[2]])), size: [hi[0] - lo[0], hi[1] - lo[1]] });
      for (const f of issues) findings.push({ level: f.level, code: 'jig.print', text: `${p.name}: ${f.text}`, refs: { jig: x.name, check: f.code } });
    }
    const m = x.model;
    rows.push({ kind: x.kind, name: x.name, mark: x.label, for: x.for, grams: m.grams, margin: m.margin, size: m.size, checks, findings: m.findings.map(({ level, code, text: t, values }) => ({ level, code, text: t, ...(values ? { values } : {}) })) });
  }
  const gap = Math.max(2, Math.ceil((check.print_gap + 2 * check.foot) / check.line - 1e-6) * check.line), beds = parts.length ? pack(parts, check.bed, gap) : [];
  const plates = [];
  for (const [n, b] of beds.entries()) {
    const file = jigFile(s, n + 1, beds.length), half = check.bed / 2 - gap;
    const objects = b.parts.map((p) => ({ name: p.name, parts: [{ name: p.name, triangles: p.tris.map((t) => t.map((v) => [v[0] + p.at[0] - half, v[1] + p.at[1] - half, v[2]])), slot: 1 }] }));
    if (write) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, await threemf(objects, { title: `${s.a.title || s.name}: jigs` })); }
    plates.push({ file, parts: b.parts.map((p) => p.name), objects });
  }
  return { jigs: rows, plates: plates.map(({ objects, ...p }) => p), findings, parts: plates.flatMap((p) => p.objects) };
}

/** The jigs as lines for a person: each with its mark, what it is for, its grams and margin, and how it prints. */
export function jigsText(ref, r) {
  const out = [`${ref}: ${r.jigs.length} jig${r.jigs.length === 1 ? '' : 's'}, marked with what each is for`];
  for (const x of r.jigs) {
    const what = x.kind === 'drill-guide' ? x.for.map((w) => `${w.label} (${w.items.join(', ')}: ${w.line}; bush ${mm(w.bush)} mm from end a, the sheet ${w.sheetText})`).join('; ')
      : x.kind === 'tap-guide' ? x.for.map((w) => `${w.label} (${w.items.join(', ')}: ${w.line})`).join('; ')
        : x.kind === 'length-stop' ? x.for.map((w) => `mark ${w.mark} (${w.items.join(', ')})`).join('; ')
          : x.for.map((w) => w.text).join('; ');
    const bad = x.checks.flatMap((c) => c.issues);
    out.push(`  ${x.name} [${x.mark}]: ${mm(x.grams)} g, ${mm(x.margin)}× at its load, ${bad.length ? `${bad.length} print issue${bad.length > 1 ? 's' : ''}` : 'prints clean'}: for ${what}`);
  }
  for (const p of r.plates) out.push(`  plate ${p.file}: ${p.parts.length} part${p.parts.length === 1 ? '' : 's'}`);
  for (const f of r.findings) out.push(`  [${f.level}] ${f.text}`);
  return out.join('\n');
}

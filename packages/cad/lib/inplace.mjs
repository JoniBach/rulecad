// Parts printed in place: an object ("printInPlace": true) whose parts come off the bed together, in the pose they
// print in, and move apart once freed with a turn by hand (a gearbox printed whole, a hinge with its pin). What has to
// hold for that, checked here on the parts as drawn:
//   - each part stands on the bed itself (inplace.bed): a part that starts on another is printed onto it and fuses;
//   - every two parts stand at least the printer's print_gap apart (inplace.gap), measured exactly by Manifold's
//     minGap; the first layer, where the plastic spreads, is printcheck's (print.first-layer);
//   - nothing needs a support (inplace.support): none can come out from between parts that enclose each other, so a
//     bridge wider than the printer spans, an underside in mid-air or on another part, a ledge or an island fails here,
//     where for a part printed alone printcheck only warns.
import { bounds } from '@rulecad/printcheck';
import { ops as booleans } from '@rulecad/shapes';

const mm = (n, d = 2) => `${Number(n.toFixed(d))}`;
const BED = 1e-3; // mm: a face this near z = 0 is on the bed
const LEAST_BED = 1; // mm²: a part's footprint on the bed, at least: a point or an edge on it holds nothing

// The area of a part's faces lying flat on the bed, facing down
function onBed(tris) {
  let area = 0;
  for (const t of tris) {
    if (t.some((p) => Math.abs(p[2]) > BED)) continue;
    for (let i = 1; i < t.length - 1; i++) {
      const [a, b, c] = [t[0], t[i], t[i + 1]], z = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (z < 0) area += -z / 2; // (wound clockwise seen from above: facing down)
    }
  }
  return area;
}

// How far apart two boxes are, 0 if they overlap; and the box they share, grown to touch, as where to look
const boxGap = (a, b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(0, a.lo[k] - b.hi[k], b.lo[k] - a.hi[k])));
const between = (a, b) => { const lo = [0, 1, 2].map((k) => Math.min(Math.max(a.lo[k], b.lo[k]), Math.min(a.hi[k], b.hi[k]))), hi = [0, 1, 2].map((k) => Math.max(Math.max(a.lo[k], b.lo[k]), Math.min(a.hi[k], b.hi[k]))); return { lo, hi }; };

// What printcheck only warns of for a part printed alone, and why each can't be printed in place
const SUPPORTS = {
  'print.bridge': 'a bridge wider than the printer spans',
  'print.mid-air': 'an underside starting in mid-air',
  'print.ledge': 'a ledge held on one side only',
  'print.islands': 'a layer with nothing under it',
  'print.island': 'a point starting in mid-air',
  'print.overhang.sliced': 'layers out past the overhang limit',
  'print.breakaway': 'an underside printed onto the part below it',
};

/**
 * The checks for an object printed in place, in the kit's one shape.
 * @param {{ parts: { name: string, role?: string, label?: string, geometry: object, triangles: number[][][] }[] }} b the built object
 * @param {{ print_gap?: number, foot?: number }} printer the printer's rules, as numbers
 * @param {object[]} printed what printcheck found of the object as a whole
 * @param {{ ops?: object }} [o] the booleans to measure with (Manifold's; found if not given)
 * @returns {Promise<object[]>}
 */
export async function inPlaceChecks(b, printer, printed = [], o = {}) {
  const out = [], f = (level, text, code, extra = {}) => out.push({ level, text, code, ...extra });
  const parts = b.parts.filter((p) => p.role !== 'support'), need = printer.print_gap;
  if (!(typeof need === 'number' && need > 0)) throw new Error(`printInPlace: the printer's print_gap is the gap each side that prints apart, a number above 0 (got ${JSON.stringify(need)}): add it to the printer's rule set`);
  if (parts.length < 2) { f('fail', `printed in place, but ${parts.length ? `only one part (${parts[0].name})` : 'no parts'}: return the parts that move apart as named parts ({ housing, sun, ... }), each described in the .json's parts`, 'inplace.parts'); return out; }

  // Each on the bed
  const boxes = new Map(parts.map((p) => [p.name, bounds(p.triangles)]));
  const off = [];
  for (const p of parts) { const area = onBed(p.triangles), box = boxes.get(p.name); if (area < LEAST_BED) off.push({ p, area, box }); }
  for (const { p, area, box } of off) f('fail', `${p.name} has ${area > 0 ? `only ${mm(area)} mm²` : 'nothing'} on the bed${box.lo[2] > BED ? ` (its lowest point is ${mm(box.lo[2])} mm up)` : ''}: printed in place, a part that starts on another part is printed onto it and fuses. Give it a face of its own on the bed, slanting at 45° up to the rest of it`, 'inplace.bed', { values: { area, least: LEAST_BED }, at: [(box.lo[0] + box.hi[0]) / 2, (box.lo[1] + box.hi[1]) / 2, box.lo[2]], box, refs: { part: p.name } });
  if (!off.length) f('pass', `each of the ${parts.length} parts stands on the bed (${parts.map((p) => `${p.name} ${mm(onBed(p.triangles), 0)} mm²`).join(', ')})`, 'inplace.bed', { values: { parts: Object.fromEntries(parts.map((p) => [p.name, onBed(p.triangles)])) } });

  // Every two apart by the print gap, measured by Manifold
  let ops = o.ops;
  if (!ops) { try { ops = await booleans('manifold'); } catch { ops = null; } }
  if (!ops) { f('warn', 'the gaps between the parts are not measured: they need manifold-3d (npm install manifold-3d in the workspace)', 'inplace.gap'); }
  else {
    const within = 2 * need, gaps = [];
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], c = parts[j], ba = boxes.get(a.name), bc = boxes.get(c.name);
      if (boxGap(ba, bc) >= within) continue;
      let gap;
      try { gap = ops.gap(a.geometry, c.geometry, within); } catch (e) { f('warn', `${a.name} and ${c.name}: the gap between them is not measured (${e.message})`, 'inplace.gap', { refs: { parts: [a.name, c.name] } }); continue; }
      gaps.push({ a: a.name, b: c.name, gap, box: between(ba, bc) });
    }
    const near = gaps.filter((g) => g.gap < need - 1e-3).sort((x, y) => x.gap - y.gap);
    for (const g of near) f('fail', `${g.a} and ${g.b} are ${g.gap > 0 ? `${mm(g.gap, 3)} mm apart at their nearest` : 'touching'}, under the ${mm(need)} mm that prints apart (print_gap): printed in place they fuse there. Move them apart, or widen the gap in the design`, 'inplace.gap', { values: { gap: g.gap, need }, at: g.box.lo.map((x, k) => (x + g.box.hi[k]) / 2), box: g.box, refs: { parts: [g.a, g.b] } });
    if (!near.length) {
      const least = gaps.reduce((m, g) => (!m || g.gap < m.gap ? g : m), null);
      f('pass', least ? `every two parts stand ${mm(need)} mm (print_gap) apart or more: the nearest, ${least.a} and ${least.b}, ${mm(least.gap, 3)} mm` : `no two parts come within ${mm(within)} mm of each other`, 'inplace.gap', { values: { gap: least ? least.gap : within, need, pairs: gaps.map(({ a, b: c, gap }) => ({ a, b: c, gap })) }, ...(least ? { refs: { parts: [least.a, least.b] } } : {}) });
    }
  }

  // Nothing that needs a support
  const needs = printed.filter((x) => SUPPORTS[x.code] && (x.code === 'print.breakaway' ? x.level === 'pass' && x.values?.area > 0 : x.level === 'warn'));
  for (const x of needs) f('fail', `${SUPPORTS[x.code]} (${x.text}): printed in place, no support can come out from between the parts, so it can't be printed. ${x.code === 'print.bridge' ? `Narrow the span to the printer's ${mm(x.values?.max ?? 5)} mm, or slant the underside at 45°` : 'Slant the underside at 45° down to the bed, or give that part a face of its own there'}`, 'inplace.support', { values: { was: x.code, ...(x.values || {}) }, ...(x.at ? { at: x.at } : {}), ...(x.box ? { box: x.box } : {}) });
  if (!needs.length) f('pass', 'nothing needs a support: every bridge within what the printer spans, no underside in mid-air or on another part', 'inplace.support');
  return out;
}

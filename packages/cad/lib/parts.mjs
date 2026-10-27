// A design's result as parts, and its shapes as faces: no file or process access, so the sandboxed runner
// (sandbox-run.mjs) uses them as the build does.
import jscad from '@jscad/modeling';

// A design's result as parts: named ({ cap, pillar }) or one unnamed shape ("body").
export function named(result, meta) {
  const isShape = (r) => Array.isArray(r) || jscad.geometries.geom3.isA(r) || jscad.geometries.geom2.isA(r);
  const entries = isShape(result) ? [['body', result]] : Object.entries(result || {});
  const empty = (g) => g == null || (Array.isArray(g) && !g.length);
  for (const k of Object.keys(meta)) if (!meta[k].optional && !entries.some(([n, g]) => n === k && !empty(g))) throw new Error(`parts in the .json lists "${k}", but main() returns no such part`);
  return entries.filter(([name, g]) => !(empty(g) && meta[name]?.optional)).map(([name, g]) => {
    const m = meta[name] || {};
    if (m.role && !['part', 'support'].includes(m.role)) throw new Error(`part ${name}: role is part or support`);
    // The solid for booleans (fit checks) is JSCAD's own, exactly; a cached build restores the very same faces
    const geometry = solid(g);
    return { name, role: m.role || 'part', label: m.label || name, ...(m.filament ? { filament: m.filament } : {}), ...(m.mirror === false ? { mirror: false } : {}),
      geometry, polygons: polygons(g), triangles: polygons(g, { triangulate: true }) };
  });
}

// A part's result as one JSCAD solid with its transforms applied (several solids become one set of faces), and back from
// the exact faces a cache keeps: the same numbers, so booleans on a cached build agree with a fresh one.
const { geom3, poly3 } = jscad.geometries;
export const solid = (g) => geom3.create([g].flat(Infinity).filter((x) => geom3.isA(x)).flatMap((x) => geom3.toPolygons(x)));
export const faces = (g) => geom3.toPolygons(g).map((p) => p.vertices.map((v) => [v[0], v[1], v[2]]));
export const fromFaces = (list) => geom3.create(list.map((vs) => poly3.create(vs)));


// Any JSCAD result -> polygons (corner lists), transforms applied. triangulate: also split faces at T-junctions (a
// corner of one face in the middle of a neighbour's edge, left by booleans) so every edge pairs up, as slicers want.
export function polygons(result, { triangulate = false } = {}) {
  const { geom3, geom2 } = jscad.geometries;
  const out = [];
  for (const g of [result].flat(Infinity)) {
    if (geom2.isA(g)) throw new Error("2D shapes can't be printed or shown: extrude them first");
    if (!geom3.isA(g)) continue;
    const fixed = jscad.modifiers.generalize({ snap: true, triangulate }, g);
    for (const p of geom3.toPolygons(fixed)) out.push(p.vertices.map((v) => [v[0], v[1], v[2]]));
  }
  if (!out.length) throw new Error('the design has no 3D shapes');
  return out;
}
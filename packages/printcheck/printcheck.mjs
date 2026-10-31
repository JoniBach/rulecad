// Printability, from the faces and the printer's rules. Each finding is { level: 'fail' | 'warn' | 'pass', text }.
//   fits the bed · sits flat on it · a closed solid (slicers need one) · one piece · overhangs past the printer's limit
//   · tips hanging down that start in mid-air
//   flat undersides above the bed: on a built-in breakaway support (one support gap above a surface), or bridges no
//   wider than the printer can span: the widest circle that fits in the underside, measured to the edges that are
//   held up by material below. An underside with no such edge starts in mid-air: it needs support.
// Z is up and the bed is z = 0: a design is checked as it will print, so print orientation is part of the design.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Area-weighted normal of a planar polygon (its length is twice the area).
function areaNormal(poly) {
  let n = [0, 0, 0];
  for (let i = 1; i < poly.length - 1; i++) n = n.map((c, k) => c + cross(sub(poly[i], poly[0]), sub(poly[i + 1], poly[0]))[k]);
  return n;
}

const OVERHANG_SLACK = 0.5; // degrees

/**
 * The box around faces.
 * @param {Face[]} polys
 * @returns {{ lo: Point, hi: Point, size: Point }}
 */
/** @typedef {[number, number, number]} Point a corner in mm, Z up */
/** @typedef {Point[]} Face a polygon: three or more corners, counter-clockwise seen from outside */
/** @typedef {{ bed: number, overhang: number, layer?: number, support_gap?: number, bridge?: number, line?: number }} Printer mm and degrees; layer and line drive the sliced-layer island check */
/**
 * A finding: its level and words, and for programs a code (print.bridge, fit.gap, …), the numbers behind it, and where
 * it is when that's known (the box round the faces it's about, in mm).
 * @typedef {{ level: 'pass' | 'warn' | 'fail' | 'info', text: string, code?: string, values?: Record<string, any>, at?: { lo: number[], hi: number[] }, refs?: Record<string, any> }} Finding
 */

export function bounds(polys) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; // a loop: spreading big models overflows the stack
  for (const p of polys) for (const v of p) for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
  return { lo, hi, size: hi.map((h, k) => h - lo[k]) };
}

// parts ([{ triangles, role }]): when parts print together (a keycap and its inlaid legend), an underside resting on
// another part isn't an overhang, and each part must be closed on its own (their shared faces are inside the print).
// printer: the printer's rules, any printer: { bed, overhang (degrees), layer, support_gap?, bridge?, line? } in mm.
/**
 * Is it printable? Findings in plain words, each pass, warn or fail.
 * @param {Face[]} polys the model as faces (triangles are fine), Z up, the bed at z = 0
 * @param {Printer} printer the printer's limits
 * @param {{ eps?: number, parts?: { triangles: Face[], role?: 'part' | 'support' }[] }} [options]
 * @returns {Finding[]}
 */
export function check(polys, printer, { eps = 1e-3, parts = null } = {}) {
  const out = [], f = (level, text, code, values, at) => out.push({ level, text, code, ...(values && { values }), ...(at && { at }) });
  const solids = (parts || []).filter((p) => p.role !== 'support').map((p) => ({ tris: p.triangles, box: bounds(p.triangles) }));
  // Is the point inside one of the parts? A ray straight up crosses its surface an odd number of times
  const inPart = (pt) => solids.length > 1 && solids.some(({ tris, box }) => {
    if (pt.some((c, k) => c < box.lo[k] - eps || c > box.hi[k] + eps)) return false;
    let n = 0;
    for (const t of tris) for (let i = 1; i < t.length - 1; i++) {
      const [a, b, c] = [t[0], t[i], t[i + 1]], d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((pt[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pt[1] - a[1])) / d, v = ((b[0] - a[0]) * (pt[1] - a[1]) - (pt[0] - a[0]) * (b[1] - a[1])) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      if (a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]) > pt[2]) n++;
    }
    return n % 2 === 1;
  });
  const rests = (p) => { const c = [0, 1, 2].map((k) => p.reduce((s, v) => s + v[k], 0) / p.length); return inPart([c[0] + 1e-4, c[1] + 2e-4, c[2] - printer.layer / 4]); };
  const { lo, size } = bounds(polys);
  const mm = (n) => `${Number(n.toFixed(1))}`;

  const over = size.filter((s) => s > printer.bed);
  f(over.length ? 'fail' : 'pass', `${size.map(mm).join(' × ')} mm${over.length ? `: bigger than the ${printer.bed} mm bed` : ', fits the bed'}`, 'print.bed', { size, bed: printer.bed });

  // Flat on the bed: the lowest point is z = 0, and faces there point straight down.
  let base = 0, down = 0, support = 0, zs = [];
  // Where a finding is: the box round the faces it's about, { lo, hi } (for a reader to point at)
  const overBox = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  const grow = (box, p) => { for (const v of p) for (let k = 0; k < 3; k++) { box.lo[k] = Math.min(box.lo[k], v[k]); box.hi[k] = Math.max(box.hi[k], v[k]); } return box; };
  const boxOf = (faces) => faces.reduce((box, p) => grow(box, p), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
  const flatDown = [], flatUp = [];
  // A face overhanging past the limit (measured from vertical) points down by more than its sine; half a degree to
  // spare, since booleans tip a 45° chamfer by hundredths of a degree. (Cosine was used before: the same at 45° only.)
  const limit = Math.sin(((printer.overhang + OVERHANG_SLACK) * Math.PI) / 180);
  for (const p of polys) {
    const n = areaNormal(p), area = Math.hypot(...n) / 2, nz = n[2] / (2 * area || 1);
    const longest = Math.max(...p.map((v, i) => Math.hypot(...sub(p[(i + 1) % p.length], v))));
    if (2 * area / (longest || 1) < HAIRLINE) continue; // a sliver thinner than a hairline (corners nearly in a line, left by a boolean) faces nowhere
    const zmin = Math.min(...p.map((v) => v[2])), zmax = Math.max(...p.map((v) => v[2]));
    if (nz < -eps && zmax - lo[2] > eps && rests(p)) continue; // on another part (a legend on its keycap)
    if (nz < -1 + eps && zmax - lo[2] < eps) base += area;
    else if (nz < -1 + eps) flatDown.push({ p, z: zmin, area }); // a flat underside above the bed
    else if (nz < -limit) { support += area; zs.push(zmin); grow(overBox, p); }
    if (nz > 1 - eps) flatUp.push({ p, z: zmax });
    if (nz < 0) down += area;
  }
  if (Math.abs(lo[2]) > eps) f('fail', `lowest point is at z = ${mm(lo[2])} mm, not on the bed (z = 0)`, 'print.off-bed', { z: lo[2] });
  f(base > 0 ? 'pass' : 'fail', base > 0 ? `${mm(base)} mm² flat on the bed` : 'nothing sits flat on the bed', 'print.base', { area: base });
  const overAt = support > 0.5 ? overBox : null, slicing = printer.layer != null; // sliced below, the layers are what count; the facets are then a note
  if (support > 0.5) f(slicing ? 'pass' : 'warn', slicing ? `${mm(support)} mm² of facets lean past ${printer.overhang}° (z ${mm(Math.min(...zs))} to ${mm(Math.max(...zs))} mm); sliced, the layers decide` : `${mm(support)} mm² overhangs past ${printer.overhang}° (z ${mm(Math.min(...zs))} to ${mm(Math.max(...zs))} mm): needs supports or another orientation`, 'print.overhang', { area: support, angle: printer.overhang, z: [Math.min(...zs), Math.max(...zs)] }, overAt);
  else f('pass', `no overhangs past ${printer.overhang}°`, 'print.overhang', { area: support, angle: printer.overhang });

  // Flat undersides: on a breakaway support, or bridged
  const gap = printer.support_gap ?? 0.2, inside = (pt, poly) => { // point in the xy footprint of a convex face
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
      if (Math.abs(c) < 1e-9) continue; if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c);
    }
    return true;
  };
  const centroid = (p) => [0, 1].map((k) => p.reduce((s, v) => s + v[k], 0) / p.length);
  const held = flatDown.filter((d) => flatUp.some((u) => d.z - u.z > eps && d.z - u.z <= gap * 1.5 + eps && inside(centroid(d.p), u.p)));
  if (held.length) f('pass', `${mm(held.reduce((s, d) => s + d.area, 0))} mm² rests on a breakaway support (${mm(gap)} mm gap): snip it off after printing`, 'print.breakaway', { area: held.reduce((s, d) => s + d.area, 0), gap });
  const levels = new Map();
  for (const d of flatDown) if (!held.includes(d)) { const k = d.z.toFixed(2); levels.set(k, [...(levels.get(k) || []), d.p]); }
  // Which faces meet at each edge, so an underside's edges can be checked for material below them
  const vkey = (v) => v.map((c) => Math.round(c / eps)).join(','), byEdge = new Map();
  for (const p of polys) p.forEach((a, i) => { const k = [vkey(a), vkey(p[(i + 1) % p.length])].sort().join('|'); byEdge.set(k, [...(byEdge.get(k) || []), p]); });
  const bridgeMax = printer.bridge ?? 5, line = printer.line ?? 0.4;
  for (const [z, group] of levels) {
    const mine = new Set(group), at = boxOf(group);
    if (Math.min(at.hi[0] - at.lo[0], at.hi[1] - at.lo[1]) < line - eps) continue; // a sliver narrower than a print line: the slicer lays nothing there
    const held = (a, b) => (byEdge.get([vkey(a), vkey(b)].sort().join('|')) || []).some((p) => !mine.has(p) && Math.min(...p.map((v) => v[2])) < Number(z) - eps);
    const under = flatUp.filter((u) => Number(z) - u.z > eps && Number(z) - u.z <= gap * 1.5 + eps).map((u) => u.p); // breakaway supports' tops
    const span = widest(group, held, under);
    if (span == null) f('warn', `an underside at z ${mm(Number(z))} starts in mid-air: needs support (or a built-in breakaway support one ${mm(gap)} mm layer below)`, 'print.mid-air', { z: Number(z) }, at);
    else if (span > bridgeMax + eps) f('warn', `${mm(span)} mm bridge at z ${mm(Number(z))}: wider than the ${bridgeMax} mm the printer can span, needs supports`, 'print.bridge', { span, max: bridgeMax, z: Number(z) }, at);
    else f('pass', `bridge ${mm(span)} mm at z ${mm(Number(z))} (up to ${bridgeMax} mm)`, 'print.bridge', { span, max: bridgeMax, z: Number(z) });
  }

  // One piece, and nothing starting in mid-air, part by part (an assembly's parts are apart on purpose)
  for (const tris of parts && parts.length > 1 ? parts.filter((p) => p.role !== 'support').map((p) => p.triangles) : [polys]) {
    const { pieces, tips } = shape(tris, eps, (printer.layer ?? 0.2) / 4);
    const loose = pieces.slice(1);
    if (loose.length) f('warn', `${pieces.length} pieces: ${loose.length} loose from the main one (${loose.length === 1 ? mm(loose[0].volume) : `${mm(Math.min(...loose.map((l) => l.volume)))} to ${mm(Math.max(...loose.map((l) => l.volume)))}`} mm³), which would print as stray bits or fall over`, 'print.pieces', { pieces: pieces.length, loose: loose.map((l) => l.volume) }, loose.reduce((b, l) => grow(grow(b, [l.box.lo]), [l.box.hi]), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    else if (pieces.length) f('pass', 'one piece', 'print.pieces', { pieces: 1 });
    const hanging = tips.filter((t) => t[2] - lo[2] > eps && !rests([t, t, t]));
    if (hanging.length) f('warn', `${hanging.length === 1 ? 'a point starts' : `${hanging.length} points start`} in mid-air (z ${mm(Math.min(...hanging.map((t) => t[2])))}${hanging.length > 1 ? ` to ${mm(Math.max(...hanging.map((t) => t[2])))}` : ''} mm): the lowest points of tips hanging down, with nothing below to print on`, 'print.island', { points: hanging }, hanging.reduce((b, t) => grow(b, [t]), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    else f('pass', 'nothing starts in mid-air', 'print.island', { points: [] });
    // And as the slicer sees it: every layer against the one below
    const sliced = islands(tris, { layer: printer.layer ?? 0.2, overhang: printer.overhang, line: printer.line ?? 0.42 }), isl = sliced.islands;
    // Overhang as the printer meets it: layers lying out past the one below, less the flat undersides the bridge check
    // judges on their own. The face-by-face measure above counts the surface's facets, which on a smoothed, cell-built
    // part are steeper than its layers are.
    const flatArea = flatDown.reduce((s, d) => s + d.area, 0), out = Math.max(0, sliced.overhang - flatArea);
    if (out > 2) f('warn', `${mm(out)} mm² of layers lie out past what the layer below holds at ${printer.overhang}° and a line (sliced at ${printer.layer ?? 0.2} mm): needs supports or another orientation`, 'print.overhang.sliced', { area: out, facets: support }); else f('pass', `every layer lies within ${printer.overhang}° and a line of the one below (sliced at ${printer.layer ?? 0.2} mm)`, 'print.overhang.sliced', { area: out, facets: support });
    if (isl.length) f('warn', `${isl.length === 1 ? 'an island' : `${isl.length} islands`} when sliced: ${isl.length === 1 ? `${mm(isl[0].area)} mm² at z ${mm(isl[0].z)}` : `${mm(Math.min(...isl.map((x) => x.area)))} to ${mm(Math.max(...isl.map((x) => x.area)))} mm², z ${mm(Math.min(...isl.map((x) => x.z)))} to ${mm(Math.max(...isl.map((x) => x.z)))}`}: a layer's region with nothing under it within the overhang reach, which the printer lays on air`, 'print.islands', { islands: isl }, isl.reduce((b, x) => grow(b, [x.at]), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    else f('pass', `no islands in ${sliced.layers} layers of ${printer.layer ?? 0.2} mm`, 'print.islands', { islands: [] });
  }

  // Closed: every edge is matched by an edge running the other way. An edge that meets the middle of a longer edge
  // (a T-junction, left by booleans) is still closed if the edges along the other side cover it exactly.
  const { gaps, tjunctions, hairlines } = parts && parts.length > 1
    ? parts.map((p) => seams(p.triangles, eps)).reduce((s, x) => ({ gaps: s.gaps + x.gaps, tjunctions: s.tjunctions + x.tjunctions, hairlines: s.hairlines + x.hairlines }), { gaps: 0, tjunctions: 0, hairlines: 0 })
    : seams(polys, eps);
  if (gaps) f('warn', `${gaps} edges with nothing on the other side: holes in the surface (slicers may repair them)`, 'print.closed', { gaps });
  else f('pass', `closed solid${tjunctions || hairlines ? ` (${[tjunctions && `${tjunctions} T-junction edges`, hairlines && `${hairlines} hairline seams under ${HAIRLINE} mm`].filter(Boolean).join(', ')}: watertight for printing)` : ''}`, 'print.closed', { gaps, tjunctions, hairlines });
  return out;
}

// The widest circle that fits in a flat region made of faces, measured to the outline edges that are held up
// (held(a, b) -> true), or to the tops of breakaway supports one layer below (under: faces): its diameter in mm, the
// gap a bridge has to span. null if nothing holds it up.
// Sampled: points spread over each face, each measured to the held edges of the region's outline and to the supports.
/**
 * The widest circle that fits in an underside, measured to its held-up edges (the bridge it makes).
 * @param {Face[]} polys @param {(edge: [Point, Point]) => boolean} [held] @param {Face[]} [under]
 * @returns {number} mm
 */
export function widest(polys, held = () => true, under = []) {
  const key = (v) => `${v[0].toFixed(3)},${v[1].toFixed(3)}`, count = new Map(), edges = [];
  for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length], k = [key(a), key(b)].sort().join('|'); count.set(k, (count.get(k) || 0) + 1); edges.push([k, a, b]); });
  const outline = edges.filter(([k]) => count.get(k) === 1).map(([, a, b]) => [a, b]).filter(([a, b]) => held(a, b));
  const tops = under.flatMap((p) => p.map((a, i) => [a, p[(i + 1) % p.length]]));
  if (!outline.length && !tops.length) return null;
  const onTop = (pt) => under.some((p) => { let sign = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); if (Math.abs(c) < 1e-9) continue; if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); } return true; });
  const toSeg = (pt, [a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l)) : 0;
    return Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy);
  };
  let best = 0;
  const N = 6;
  for (const p of polys) for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[0], p[i], p[i + 1]];
    for (let u = 0; u <= N; u++) for (let v = 0; u + v <= N; v++) {
      const w = N - u - v, pt = [0, 1].map((k) => (a[k] * u + b[k] * v + c[k] * w) / N);
      if (onTop(pt)) continue; // right over a support
      let d = Infinity;
      for (const s of outline) d = Math.min(d, toSeg(pt, s));
      for (const s of tops) d = Math.min(d, toSeg(pt, s));
      best = Math.max(best, d);
    }
  }
  return 2 * best;
}

// seams(polys) -> { gaps, tjunctions, hairlines }: edges not matched by a reverse edge, split into T-junctions (covered
// all along by reverse edges on the same line, or lying along a longer reverse edge), hairlines (within HAIRLINE of
// another face) and real gaps.
export const HAIRLINE = 0.01; // mm: a fortieth of a print line
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function pointToTriangle(p, a, b, c) { // Ericson, Real-Time Collision Detection 5.1.5
  const ab = vsub(b, a), ac = vsub(c, a), ap = vsub(p, a), d1 = vdot(ab, ap), d2 = vdot(ac, ap);
  const at = (q) => Math.hypot(...vsub(p, q)), mix = (u, v, w) => [0, 1, 2].map((k) => a[k] * u + b[k] * v + c[k] * w);
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = vsub(p, b), d3 = vdot(ab, bp), d4 = vdot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at(mix(1 - v, v, 0)); }
  const cp = vsub(p, c), d5 = vdot(ab, cp), d6 = vdot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at(mix(1 - w, 0, w)); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at(mix(0, 1 - w, w)); }
  const den = 1 / (va + vb + vc);
  return at(mix(1 - vb * den - vc * den, vb * den, vc * den));
}
/**
 * Open edges, sorted: real gaps, T-junctions (closed) and hairline seams (closed).
 * @param {Face[]} polys @param {number} [eps]
 * @returns {{ gaps: number, tjunctions: number, hairlines: number }}
 */
export function seams(polys, eps = 1e-3) {
  const key = (v) => v.map((c) => Math.round(c / eps)).join(','), segs = [], count = new Map();
  for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length]; if (key(a) !== key(b)) { segs.push([a, b]); const k = `${key(a)}|${key(b)}`; count.set(k, (count.get(k) || 0) + 1); } });
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const on = (p, a, b) => Math.abs(d(a, p) + d(p, b) - d(a, b)) < eps;
  // A seam whose middle lies within HAIRLINE of another face (not one of its own) is a hairline left by booleans, far
  // narrower than anything the printer can make: closed, for printing
  const tris = polys.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]]));
  const hairline = (a, b) => {
    const mid = [0, 1, 2].map((k) => (a[k] + b[k]) / 2), own = (t) => t.some((v) => key(v) === key(a)) && t.some((v) => key(v) === key(b));
    return tris.some((t) => !own(t) && pointToTriangle(mid, ...t) < HAIRLINE);
  };
  let gaps = 0, tjunctions = 0, hairlines = 0;
  for (const [a, b] of segs) {
    if ((count.get(`${key(b)}|${key(a)}`) || 0) > 0) continue;
    // Reverse pieces on this edge, as stretches of it from b (0) to a (1): together they must cover all of it. They may
    // overlap (booleans can cut the faces on the other side in more than one way), so it's their union that counts.
    const len = d(a, b), along = segs.filter(([x, y]) => on(x, b, a) && on(y, b, a) && d(b, x) < d(b, y)).map(([x, y]) => [d(b, x) / len, d(b, y) / len]).sort((p, q) => p[0] - q[0]);
    let reach = 0;
    for (const [from, to] of along) { if (from > reach + eps / len * 10) break; reach = Math.max(reach, to); }
    const covered = along.length > 0 && reach >= 1 - eps / len * 10;
    const within = segs.some(([x, y]) => on(a, y, x) && on(b, y, x) && d(y, a) < d(y, b) && d(x, y) > d(a, b) + eps); // part of a longer reverse edge
    if (covered || within) tjunctions++;
    else if (hairline(a, b)) hairlines++;
    else gaps++;
  }
  return { gaps, tjunctions, hairlines };
}

/**
 * A model's pieces and the tips hanging down from it. Corners closer than eps are one point. A piece is a set of faces
 * joined by their corners; one enclosing no volume, or a negative one (a cavity's surface, facing in), isn't a piece.
 * Pieces come biggest first. A tip is a corner below every corner it shares a face with, by more than drop, on faces
 * facing down (not a hole's floor), and narrow for hang mm above it (not a dip in an underside): the start of
 * something hanging in the air (corners in a flat underside are level with their neighbours, so they're not tips;
 * nor is the bed, which the caller leaves out). Tips closer than a millimetre are one.
 * @param {Face[]} polys @param {number} [eps] @param {number} [drop] @param {number} [hang] how far a tip must hang, mm
 * @returns {{ pieces: { volume: number, box: { lo: number[], hi: number[] } }[], tips: number[][] }}
 */
/**
 * The slicer's view: the mesh cut at every layer, each layer's regions checked against the one below. A region that
 * overlaps nothing in the layer below, within the overhang reach (a layer's height over the tangent of the limit, so a
 * 45° wall counts as held), starts in mid-air: an island, which a printer lays on nothing. Each layer is drawn on a
 * grid of a quarter of the print line and opened by half a line, so anything narrower than a line (which the slicer
 * never extrudes) is not a region, and the rest is compared by pixels.
 * @param {Face[]} polys the closed mesh
 * @param {{ layer?: number, overhang?: number, line?: number, onLayer?: (layer: number, layers: number) => void }} printer
 *   layer height, overhang limit (degrees from vertical), the line width; onLayer: called as each layer is cut (progress)
 * @returns {{ islands: { z: number, area: number, at: number[], cells: number[][] }[], layers: number, overhang: number }}
 *   each island's layer (its z), its area (mm²), its centre, and its pixels' centres ([x, y], for whatever fixes it); how
 *   many layers were cut; and overhang: the area (mm²) of layers lying further out than the one below can hold, flat
 *   undersides included (the bridge check judges those separately)
 */
export function islands(polys, { layer = 0.2, overhang = 45, line = 0.42, onLayer } = {}) {
  // The pixel: a quarter of a line, or coarser on a big part so a layer stays under about a million pixels
  const { lo, hi } = bounds(polys), pitch = Math.max(line / 4, Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 1000), nx = Math.ceil((hi[0] - lo[0]) / pitch) + 6, ny = Math.ceil((hi[1] - lo[1]) / pitch) + 6;
  const r2 = Math.max(1, Math.round(line / 2 / pitch)); // half a line, in pixels
  const reach = Math.ceil(layer / Math.tan((overhang * Math.PI) / 180) / pitch) + 2 * r2; // pixels a layer may step out past the one below, and a line beyond that: a line hanging out is held by the one beside it
  const tris = [];
  for (const p of polys) for (let i = 1; i < p.length - 1; i++) tris.push([p[0], p[i], p[i + 1]]);
  const zmin = tris.map((t) => Math.min(t[0][2], t[1][2], t[2][2])), zmax = tris.map((t) => Math.max(t[0][2], t[1][2], t[2][2]));
  const count = Math.max(1, Math.round((hi[2] - lo[2]) / layer)), out = [];
  // Each triangle filed under the layers whose middle it spans, so a layer looks only at its own
  const byLayer = Array.from({ length: count }, () => []);
  for (let t = 0; t < tris.length; t++) for (let L = Math.max(0, Math.ceil((zmin[t] - lo[2]) / layer - 0.5)); L <= Math.min(count - 1, Math.floor((zmax[t] - lo[2]) / layer - 0.5)); L++) byLayer[L].push(t);
  let below = null, held = null, overhangArea = 0;
  const px = (x) => Math.floor((x - lo[0]) / pitch) + 3;
  // Only what the printer can lay counts: each layer is opened by half a line (eroded, then grown back), so anything
  // narrower than a line, which the slicer drops, is not a region at all
  // Square windows, by running sums along each row and then each column: any (grow) or all (shrink) within r pixels
  const sweep = (f, r, all) => {
    const tmp = new Uint8Array(nx * ny), out = new Uint8Array(nx * ny), w = 2 * r + 1, sum = new Int32Array(Math.max(nx, ny) + 1);
    for (let j = 0; j < ny; j++) { // along x
      const row = j * nx; sum[0] = 0;
      for (let i = 0; i < nx; i++) sum[i + 1] = sum[i] + f[row + i];
      for (let i = 0; i < nx; i++) { const a = Math.max(0, i - r), b = Math.min(nx, i + r + 1), n = sum[b] - sum[a]; tmp[row + i] = all ? (b - a === w && n === w ? 1 : 0) : n > 0 ? 1 : 0; }
    }
    for (let i = 0; i < nx; i++) { // then along y
      sum[0] = 0;
      for (let j = 0; j < ny; j++) sum[j + 1] = sum[j] + tmp[j * nx + i];
      for (let j = 0; j < ny; j++) { const a = Math.max(0, j - r), b = Math.min(ny, j + r + 1), n = sum[b] - sum[a]; out[j * nx + i] = all ? (b - a === w && n === w ? 1 : 0) : n > 0 ? 1 : 0; }
    }
    return out;
  };
  const erode = (f) => sweep(f, r2, true), dilate = (f, r) => sweep(f, r, false);
  const opened = (f) => dilate(erode(f), r2);
  for (let L = 0; L < count; L++) {
    onLayer?.(L, count);
    const z = lo[2] + (L + 0.5) * layer, segs = [];
    for (const t of byLayer[L]) {
      if (zmin[t] > z || zmax[t] < z) continue;
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = tris[t][i], b = tris[t][(i + 1) % 3];
        if ((a[2] < z) !== (b[2] < z)) { const u = (z - a[2]) / (b[2] - a[2]); pts.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); }
      }
      if (pts.length === 2) segs.push(pts);
    }
    // Scanline fill, even-odd, a pixel row at a time
    const raw = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const y = lo[1] + (j - 2.5) * pitch, xs = [];
      for (const [a, b] of segs) if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, px(xs[k])); i <= Math.min(nx - 1, px(xs[k + 1]) - 1); i++) raw[j * nx + i] = 1;
    }
    const filled = opened(raw);
    if (below) {
      held = dilate(below, reach); // where this layer may lie: on the one below, or a step out from it
      for (let n = 0; n < nx * ny; n++) if (filled[n] && !held[n]) overhangArea += pitch * pitch;
      // Regions of this layer: flood fill; each is held if any of its pixels is within reach of a filled pixel below
      const seen = new Uint8Array(nx * ny);
      for (let start = 0; start < nx * ny; start++) {
        if (!filled[start] || seen[start]) continue;
        const stack = [start], cells = [];
        seen[start] = 1;
        while (stack.length) {
          const e = stack.pop(); cells.push(e);
          const i = e % nx, j = Math.floor(e / nx);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && a < nx && b >= 0 && b < ny) { const f = b * nx + a; if (filled[f] && !seen[f]) { seen[f] = 1; stack.push(f); } } }
        }
        let onSomething = false;
        for (const e of cells) if (held[e]) { onSomething = true; break; }
        if (!onSomething) {
          const cx = cells.reduce((s, e) => s + (e % nx), 0) / cells.length, cy = cells.reduce((s, e) => s + Math.floor(e / nx), 0) / cells.length;
          out.push({ z: +z.toFixed(3), area: cells.length * pitch * pitch, at: [lo[0] + (cx - 2.5) * pitch, lo[1] + (cy - 2.5) * pitch, z], cells: cells.map((e) => [lo[0] + ((e % nx) - 2.5) * pitch, lo[1] + (Math.floor(e / nx) - 2.5) * pitch]) });
        }
      }
    }
    below = filled;
  }
  return { islands: out, layers: count, overhang: overhangArea };
}

export function shape(polys, eps = 1e-3, drop = 0.05, hang = 1) {
  const ids = new Map(), at = [], key = (v) => v.map((c) => Math.round(c / eps)).join(',');
  const faces = polys.map((p) => p.map((v) => { const k = key(v); if (!ids.has(k)) { ids.set(k, at.length); at.push(v); } return ids.get(k); }));
  const up = at.map((_, i) => i), find = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  const near = at.map(() => new Set()), facing = at.map(() => 0);
  faces.forEach((f, n) => { const z = areaNormal(polys[n])[2]; for (const v of f) facing[v] += z; });
  for (const f of faces) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; up[find(a)] = find(b); near[a].add(b); near[b].add(a); }
  const by = new Map();
  for (const f of faces) {
    const r = find(f[0]), piece = by.get(r) ?? { volume: 0, box: { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] } };
    for (let i = 1; i < f.length - 1; i++) { const [a, b, c] = [at[f[0]], at[f[i]], at[f[i + 1]]]; piece.volume += vdot(a, cross(b, c)) / 6; }
    for (const v of f) for (let k = 0; k < 3; k++) { piece.box.lo[k] = Math.min(piece.box.lo[k], at[v][k]); piece.box.hi[k] = Math.max(piece.box.hi[k], at[v][k]); }
    by.set(r, piece);
  }
  const pieces = [...by.values()].filter((p) => p.volume > eps).sort((a, b) => b.volume - a.volume);
  const tips = [];
  // A tip hangs: within hang of its point the surface stays narrow (a cone at 45° is as wide as it is tall). A dip in a
  // smoothed underside is shallow: within hang of it, the surface spreads wide, as far as the underside does.
  const narrow = (i) => {
    const seen = new Set([i]), todo = [i], v = at[i];
    while (todo.length) {
      for (const j of near[todo.pop()]) {
        if (seen.has(j) || at[j][2] > v[2] + hang) continue;
        if (Math.hypot(at[j][0] - v[0], at[j][1] - v[1]) > 2 * hang) return false;
        seen.add(j); todo.push(j);
      }
    }
    return true;
  };
  at.forEach((v, i) => {
    if (!near[i].size || facing[i] >= 0 || [...near[i]].some((j) => at[j][2] - v[2] <= drop) || !narrow(i)) return;
    if (!tips.some((t) => Math.hypot(t[0] - v[0], t[1] - v[1], t[2] - v[2]) < 1)) tips.push(v);
  });
  return { pieces, tips };
}

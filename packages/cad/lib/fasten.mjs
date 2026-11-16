// Screwed joints in assemblies: "fasten": [{ "screw": "M3 cap", "through": ["bracket"], "into": "base",
//   "at": ["bracket.h1", "bracket.h2"] | "holes": "bracket.body", "nut", "washer", "length", "torque", "note" }]
// One relation for what a "fastens" fit and a holes fit said apart, and it knows the screw. For each screw the parts
// are read as drawn: a line is followed from under the head, through each part in `through`, into `into`, and what
// lies round that line is measured from the meshes (profile, below). From those measures: the holes share the axis
// (fasten.holes), each part passed has a clearance hole for the thread (fasten.clearance), the far end is a pilot, a
// tapped or printed thread, an insert's hole or a nut's seat, or a nut is given (fasten.end), the length is chosen or
// checked (fasten.length), enough thread is engaged for what it is in (fasten.engagement), and the head has a flat
// seat that takes its pressure (fasten.seat). Every figure for the thread comes from @rulecad/fixings, bound to the
// workspace's rule sets and the project's printer, as v.fixings is. The screws, nuts, washers and inserts are placed
// as reference parts (hardware, below): faint, checked for overlap, and carried into previews and links.
import crypto from 'node:crypto';
import path from 'node:path';
import { fixingsFor, DEFAULTS, screwGroup } from '@rulecad/fixings';
import { placeItems, jointValues } from '@rulecad/model-link';
import { massesOf } from './loads.mjs';
import { mountTorque } from './motors.mjs';
import { jscad, fixingsContext } from './design.mjs';
import { named } from './parts.mjs';
import { paths } from './workspace.mjs';
import { peekRuleSet } from './rules.mjs';
import { orderOf, isBuilt } from './order.mjs';

const { mat4, vec3 } = jscad.maths;
const mm = (n) => String(Number(Number(n).toFixed(3))), r3 = (x) => +x.toFixed(3);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const fan = (poly) => (poly.length === 3 ? [poly] : poly.slice(1, -1).map((_, i) => [poly[0], poly[i + 1], poly[i + 2]]));
const top = (n) => String(n).split(/[.@]/)[0];
const EPS = 1e-4; // mm: under this, two lengths read from a mesh are the same
const an = (t) => (/^(?:[aeiou8]|M\d)/i.test(String(t)) ? 'an' : 'a'); // (an M3 screw, a 6-32 screw)

/** The working figures of the fasten checks that no rule set holds, each with what it rests on. */
export const FASTEN = {
  align: { value: 0.05, unit: 'mm', rule: 'Holes share an axis when their centres lie this near it: the play of floating point and of a hole drawn in flats, far under any clearance', kind: 'default', source: 'A working figure of @rulecad/cad', checked: '2026-11-15' },
  size: { value: 0.06, unit: 'mm', rule: 'A hole as drawn is taken for a thread\'s pilot, tap, insert or clearance hole when its diameter is within this of that figure', kind: 'default', source: 'A working figure of @rulecad/cad: under the least step between two of a thread\'s holes (M2 tap 1.7 mm, pilot 1.9 mm)', checked: '2026-11-15' },
  proud: { value: 1, unit: '× diameter', rule: 'A screw\'s tip may stand up to its own diameter past its nut or the far face of what it is threaded through: more is a longer screw than the joint needs, and it catches', kind: 'default', source: 'A working figure of @rulecad/cad: no standard was found for it', checked: '2026-11-15' },
  countersink: { value: 2, unit: '°', rule: 'A countersink drawn in flat faces is taken for the head\'s angle when it is within this of it', kind: 'default', source: 'A working figure of @rulecad/cad', checked: '2026-11-15' },
};

// ---------- a part measured along an axis ----------
// Coordinates about an axis: z along it from O, x and y across it
function frameOf(O, D) {
  const z = unit(D), seed = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], x = unit(cross(seed, z)), y = cross(z, x);
  return { x, y, z, to: (p) => { const q = [p[0] - O[0], p[1] - O[1], p[2] - O[2]]; return [dot(q, x), dot(q, y), dot(q, z)]; } };
}
// A slice across the axis at z, as 2D segments. Each end is worked out from its edge's lower corner, so the two faces
// that share an edge give the very same point, and the segments join end to end exactly.
function slice(tris, z) {
  const segs = [];
  for (const t of tris) {
    const c = [];
    for (let i = 0; i < 3; i++) {
      let a = t[i], b = t[(i + 1) % 3];
      if ((a[2] - z) * (b[2] - z) >= 0) continue;
      if (a[2] > b[2] || (a[2] === b[2] && (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])))) [a, b] = [b, a];
      const u = (z - a[2]) / (b[2] - a[2]); c.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
    }
    if (c.length === 2) segs.push(c);
  }
  return segs;
}
const toSeg = (p, q) => { // how far the axis (the origin) is from a segment
  const ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey, u = l2 ? Math.max(0, Math.min(1, -(p[0] * ex + p[1] * ey) / l2)) : 0;
  return Math.hypot(p[0] + u * ex, p[1] + u * ey);
};
// The circle through a set of points (Kasa's fit: least squares on x² + y² + Dx + Ey + F), or null where they lie in a line
function circle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  // [sxx sxy sx; sxy syy sy; sx sy n] [D E F]' = -[sxz syz sz]'
  const A = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]];
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    [A[i], A[p]] = [A[p], A[i]];
    for (let k = 0; k < 3; k++) if (k !== i) { const f = A[k][i] / A[i][i]; for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j]; }
  }
  const D = A[0][3] / A[0][0], E = A[1][3] / A[1][1], F = A[2][3] / A[2][2], c = [-D / 2, -E / 2], r2 = c[0] * c[0] + c[1] * c[1] - F;
  return r2 > 0 ? { c, r: Math.sqrt(r2) } : null;
}
// Points as a round: the circle they lie on once the few that do not (a teardrop's roof) are left out, and whether
// they go all the way round it
function roundOf(pts) {
  if (pts.length < 3) return null;
  let fit = circle(pts); if (!fit) return null;
  const off = (f, p) => Math.abs(Math.hypot(p[0] - f.c[0], p[1] - f.c[1]) - f.r), slack = (f) => Math.max(0.02 * f.r, 0.005);
  let on = pts.filter((p) => off(fit, p) <= slack(fit));
  if (on.length < pts.length && on.length >= 6) { const again = circle(on); if (again) { fit = again; on = pts.filter((p) => off(fit, p) <= slack(fit)); } }
  if (on.length < 3 || on.length < pts.length * 0.7) return null;
  const worst = Math.max(...on.map((p) => off(fit, p)));
  if (worst > 0.004 * fit.r + 0.002) return null;
  const angles = on.map((p) => Math.atan2(p[1] - fit.c[1], p[0] - fit.c[0])).sort((a, b) => a - b);
  let gap = angles[0] + 2 * Math.PI - angles.at(-1); for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
  if (gap > (on.length <= 8 ? 2.2 : 1.75)) return null; // (a square's corners are 90° apart; a round with a roof has one gap of 90°)
  return { ...fit, points: on.length, all: on.length === pts.length, corner: on[0] };
}
// What lies round the axis in one slice: how near the nearest wall comes (free), and the outline that wall belongs
// to: whether it closes round the axis (the axis is in a hole), its centre and diameter where it is a round or a
// regular polygon (a nut's seat), and how far that centre is from the axis
function measure(segs, R) {
  let best = -1, free = Infinity;
  segs.forEach(([p, q], i) => { const d = toSeg(p, q); if (d < free) { free = d; best = i; } });
  if (best < 0 || free > R) return { free: Infinity, loop: null };
  const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`, at = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!at.has(k)) at.set(k, []); at.get(k).push(i); } });
  const mine = new Set([best]), todo = [best];
  while (todo.length) for (const p of segs[todo.pop()]) for (const j of at.get(key(p))) if (!mine.has(j)) { mine.add(j); todo.push(j); }
  const pts = new Map(); let closed = true, inside = false;
  for (const i of mine) {
    const [p, q] = segs[i];
    for (const e of [p, q]) { const k = key(e); pts.set(k, e); if (at.get(k).filter((j) => mine.has(j)).length !== 2) closed = false; }
    if ((p[1] > 0) !== (q[1] > 0) && p[0] + ((0 - p[1]) / (q[1] - p[1])) * (q[0] - p[0]) > 0) inside = !inside; // (a ray from the axis along +x)
  }
  // corners only: a point where the outline runs straight on is a seam between two faces, not a corner
  const list = !closed ? [] : [...pts].filter(([k, e]) => {
    const [p, q] = at.get(k).filter((j) => mine.has(j)).map((j) => (key(segs[j][0]) === k ? segs[j][1] : segs[j][0]));
    const ux = e[0] - p[0], uy = e[1] - p[1], vx = q[0] - e[0], vy = q[1] - e[1];
    return Math.abs(ux * vy - uy * vx) > 2e-3 * Math.hypot(ux, uy) * Math.hypot(vx, vy); // (0.1°: a seam left by a boolean lies within its snap of the line; a round's corners turn by degrees)
  }).map(([, e]) => e), round = closed ? roundOf(list) : null;
  let shape = 'other', d = null, flats = null, offset = null, c = null, corner = null;
  if (round) {
    c = round.c; d = 2 * round.r; offset = Math.hypot(c[0], c[1]);
    let least = Infinity; for (const i of mine) { const [p, q] = segs[i]; least = Math.min(least, toSeg([p[0] - c[0], p[1] - c[1]], [q[0] - c[0], q[1] - c[1]])); }
    flats = 2 * least;
    const sides = round.all ? Math.round(Math.PI / Math.acos(Math.min(1, least / round.r))) : 0; // (a regular polygon's flats lie at r cos(π / n))
    shape = round.all && sides === 6 ? 'hex' : round.all && sides === 4 ? 'square' : 'round';
    corner = round.corner;
  }
  const [bp, bq] = segs[best], bl = Math.hypot(bq[0] - bp[0], bq[1] - bp[1]), along = bl > 0 ? [(bq[0] - bp[0]) / bl, (bq[1] - bp[1]) / bl] : null; // (the nearest wall's run: a nut's corners point along a slot's walls)
  return { free, loop: { closed, inside: closed && inside, shape, d, flats, offset, c, corner, along } };
}
const same = (a, b) => {
  if (!a.loop || !b.loop) return !a.loop && !b.loop;
  const near = (x, y) => (x == null || y == null ? x == y : Math.abs(x - y) < 1e-3); // (a fit through corners snapped to a boolean's grid wanders by less)
  return near(a.free, b.free) && a.loop.shape === b.loop.shape && a.loop.inside === b.loop.inside && near(a.loop.d, b.loop.d) && near(a.loop.offset, b.loop.offset);
};

/**
 * A part measured along an axis: the stretches along it, each with what lies round the axis there.
 * @param {number[][][]} tris the part's faces (triangles, or polygons that are fanned) @param {number[]} O a point on the axis @param {number[]} D its direction
 * @param {number} R how far from the axis to look, mm
 * @returns {{ segs: { z0: number, z1: number, solid: boolean, hole: boolean, a: object, b: object }[], near: number[][][], x: number[], y: number[] }}
 *   segs: in order along the axis (z from O along D). solid: the axis is in material; hole: it is in a space the part
 *   closes round; a, b: the measure just inside each end ({ free, loop }, see measure): equal on a straight bore, apart on a cone.
 *   near: the faces within R, in the axis's own coordinates, for further slices; x, y: the directions across the axis
 */
export function profile(tris, O, D, R) {
  const f = frameOf(O, D), near = [], hits = [], cuts = new Set();
  for (const poly of tris) for (const t of fan(poly)) {
    const q = t.map(f.to);
    if (Math.min(q[0][0], q[1][0], q[2][0]) > R || Math.max(q[0][0], q[1][0], q[2][0]) < -R || Math.min(q[0][1], q[1][1], q[2][1]) > R || Math.max(q[0][1], q[1][1], q[2][1]) < -R) continue;
    near.push(q);
    for (const p of q) cuts.add(Math.round(p[2] * 1e6) / 1e6);
    // where the axis itself goes through this face, and which way the face looks
    const [a, b, c] = q, det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < 1e-12) continue;
    const l1 = (b[0] * c[1] - c[0] * b[1]) / det, l2 = (c[0] * a[1] - a[0] * c[1]) / det, l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) hits.push([l1 * a[2] + l2 * b[2] + l3 * c[2], Math.sign(det)]);
  }
  // The axis is in material between a face it enters by (looking back along it) and one it leaves by. Faces that
  // meet on the axis (a hole's floor drawn as a fan, a cone's point) are met together, and count once.
  hits.sort((p, q) => p[0] - q[0]);
  const walls = [];
  for (let i = 0; i < hits.length;) { let j = i, net = 0; while (j < hits.length && hits[j][0] - hits[i][0] < 1e-6) net += hits[j++][1]; if (net) walls.push([hits[i][0], net > 0 ? -1 : 1]); i = j; }
  const solidAt = (z) => { let depth = 0; for (const [w, s] of walls) { if (w > z) break; depth += s; } return depth > 0; };
  let zs = [...cuts].sort((a, b) => a - b);
  if (zs.length > 600) { const lo = zs[0], hi = zs.at(-1); zs = Array.from({ length: 401 }, (_, i) => lo + ((hi - lo) * i) / 400); } // (a drawn thread: sampled evenly)
  const segs = [];
  for (let i = 0; i + 1 < zs.length; i++) {
    const z0 = zs[i], z1 = zs[i + 1], len = z1 - z0; if (len < 1e-5) continue;
    const e = Math.min(1e-3, len / 4), a = measure(slice(near, z0 + e), R), b = measure(slice(near, z1 - e), R), solid = solidAt((z0 + z1) / 2);
    const hole = !solid && !!a.loop?.inside && !!b.loop?.inside, last = segs.at(-1);
    if (last && last.solid === solid && Math.abs(last.z1 - z0) < 1e-4 && same(last.a, last.b) && same(a, b) && same(last.b, a)) last.z1 = z1;
    else segs.push({ z0, z1, solid, hole, a, b });
  }
  return { segs, near, x: f.x, y: f.y };
}

// A placed part measured along a world axis, in the part's own frame, so the answer holds wherever the part is put
// (every pose, every copy): kept by what the part is built from and where the axis lies in it
const kept = new Map();
function partProfile(p, O, D, R) {
  if (!p.m || !p.localTriangles) return profile(p.triangles, O, D, R);
  const inv = mat4.invert(mat4.create(), p.m), o = vec3.transform([0, 0, 0], O, inv), e = vec3.transform([0, 0, 0], add(O, D), inv), d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
  const key = `${p.hash ?? p.shape}|${[...o, ...d, R].map((x) => Math.round(x * 1e6) / 1e6).join(',')}`;
  if (!kept.has(key)) { if (kept.size > 4000) kept.clear(); kept.set(key, profile(p.localTriangles, o, d, R)); }
  return kept.get(key);
}
// The stretches of several parts as one run along the axis, turned to run the other way where asked
function along(parts, O, D, R, flip) {
  const segs = parts.flatMap((p) => { const pr = partProfile(p, O, D, R); return pr.segs.map((s) => ({ ...s, part: p, of: pr })); });
  const out = flip ? segs.map((s) => ({ ...s, z0: -s.z1, z1: -s.z0, a: s.b, b: s.a })) : segs;
  return out.sort((a, b) => a.z0 - b.z0);
}
const reach = (segs) => { const on = segs.filter((s) => s.solid || s.hole); return on.length ? [Math.min(...on.map((s) => s.z0)), Math.max(...on.map((s) => s.z1))] : null; };
// Whether there is material at each of a ring of points round the axis in one slice: counted from the axis outwards,
// each wall crossed changes it. `from`: whether the axis itself is in material there
function ring(near, z, radius, from, n = 24) {
  const segs = slice(near, z); let solid = 0;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.37) * 2 * Math.PI) / n, dx = Math.cos(a), dy = Math.sin(a); let inside = from;
    for (const [p, q] of segs) {
      const ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const t = (p[0] * ey - p[1] * ex) / den, u = (p[0] * dy - p[1] * dx) / den;
      if (t > 1e-9 && t < radius && u >= 0 && u < 1) inside = !inside;
    }
    if (inside) solid++;
  }
  return solid / n;
}

// ---------- the holes of a part, where a relation names a part and not anchors ----------
// Round holes found in a part as drawn, along each of its own three axes: walls that stand along the axis, joined
// where they share a corner, kept where their corners lie on one circle and the walls face its centre.
const found = new Map();
function holesIn(p) {
  const key = p.hash ?? p.shape;
  if (found.has(key)) return found.get(key);
  const out = [], tris = (p.localTriangles ?? p.triangles).flatMap(fan);
  for (let k = 0; k < 3; k++) {
    const [u, w] = k === 0 ? [1, 2] : k === 1 ? [2, 0] : [0, 1]; // (u × w = k, so a normal's sense carries over)
    const id = new Map(), parent = [], pts = [], span = [], face = [];
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const node = (v) => { const q = `${Math.round(v[u] * 1e4)},${Math.round(v[w] * 1e4)}`; if (!id.has(q)) { id.set(q, pts.length); parent.push(pts.length); pts.push([v[u], v[w]]); span.push([v[k], v[k]]); face.push(null); } const i = id.get(q); span[i][0] = Math.min(span[i][0], v[k]); span[i][1] = Math.max(span[i][1], v[k]); return i; };
    for (const t of tris) {
      const n = cross([t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]]), l = Math.hypot(...n);
      if (!(l > 1e-12) || Math.abs(n[k]) > 1e-4 * l) continue; // (a wall: it stands along the axis)
      const [a, b, c] = t.map(node); parent[find(a)] = find(b); parent[find(c)] = find(b);
      face[a] ||= [n[u] / l, n[w] / l];
    }
    const groups = new Map();
    pts.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
    for (const g of groups.values()) {
      if (g.length < 8) continue;
      const round = roundOf(g.map((i) => pts[i])); if (!round || round.r < 0.4 || round.r > 20) continue;
      const i = g.find((j) => face[j]), inward = face[i][0] * (round.c[0] - pts[i][0]) + face[i][1] * (round.c[1] - pts[i][1]) > 0;
      if (!inward) continue; // (a boss's outside, not a hole)
      const lo = Math.min(...g.map((j) => span[j][0])), hi = Math.max(...g.map((j) => span[j][1]));
      const twin = out.find((h) => h.k === k && Math.hypot(h.c[0] - round.c[0], h.c[1] - round.c[1]) < 0.02);
      if (twin) { twin.d = Math.min(twin.d, 2 * round.r); twin.lo = Math.min(twin.lo, lo); twin.hi = Math.max(twin.hi, hi); } else out.push({ k, c: round.c, d: 2 * round.r, lo, hi });
    }
  }
  const holes = out.map((h) => { const [u, w] = h.k === 0 ? [1, 2] : h.k === 1 ? [2, 0] : [0, 1], at = [0, 0, 0], axis = [0, 0, 0]; at[u] = h.c[0]; at[w] = h.c[1]; at[h.k] = (h.lo + h.hi) / 2; axis[h.k] = 1; return { at, axis, d: h.d }; })
    .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1] || a.at[2] - b.at[2]);
  found.set(key, holes);
  return holes;
}

// ---------- the key's way to the head ----------
// The tool a head is turned with, from the hexkey rule set: a hex key in a socket head (its size from the thread's set,
// as the screw model gives it), a socket or a spanner on a hexagon head. radius: the room it needs round the screw's
// axis; reach: how far over the head that room is needed (a key's long arm, put in along the axis)
function toolFor(model, form, fx) {
  let set; try { set = peekRuleSet('hexkey').rules; } catch { return null; }
  const sizes = set.sizes.value, at = (s) => { const i = sizes.findIndex((k) => k >= s - 1e-6); return i < 0 ? sizes.length - 1 : i; };
  if (form === 'hex') {
    const flats = fx.figures.hex_head_flats?.value ?? model.headDiameter, i = at(flats);
    return { name: `${mm(flats)} mm socket or spanner`, size: flats, radius: flats / Math.cos(Math.PI / 6) / 2 + set.socket_wall.value, reach: set.long_arm.value[i], tilt: 0, rests: ['hexkey.socket_wall', 'hexkey.long_arm'] };
  }
  const s = model.key; if (s == null) return null;
  const i = at(s), exact = Math.abs(sizes[i] - s) < 1e-6;
  return { name: `${mm(s)} mm hex key`, size: s, radius: (exact ? set.corners.value[i] : s / Math.cos(Math.PI / 6)) / 2, reach: set.long_arm.value[i], tilt: set.ball_end_tilt?.value ?? 0, rests: ['hexkey.corners', 'hexkey.long_arm', 'hexkey.ball_end_tilt'] };
}
// What stands in a tool's way: every part with material within its radius of the line from P along U, up to its
// reach, each with how far over the head it is first met
function inTheWay(parts, P, U, radius, reach) {
  const out = new Map();
  for (const p of parts) {
    for (const seg of partProfile(p, P, U, radius).segs) {
      if (seg.z1 <= 1e-3 || seg.z0 >= reach) continue;
      if (seg.solid || Math.min(seg.a.free, seg.b.free) < radius - 1e-3) { const z = Math.max(0, seg.z0); if (!out.has(p.item) || out.get(p.item) > z) out.set(p.item, z); break; }
    }
  }
  return [...out].map(([item, z]) => ({ item, z: r3(z) })).sort((a, b) => a.z - b.z);
}
// A screw's access: its tool, what stands on the straight line over its head, and the tilt a ball end reaches it at where that is blocked
function accessOf(parts, tool, P, U) {
  const lift = 0.05, start = add(P, U, lift), blockers = inTheWay(parts, start, U, tool.radius, tool.reach).map((b) => ({ ...b, z: r3(b.z + lift) })); // (from just over the head, so the head's own seat is not met)
  let tilt = null;
  if (blockers.length && tool.tilt > 0) {
    const f = frameOf(start, U), t = (tool.tilt * Math.PI) / 180;
    for (let k = 0; k < 8 && tilt == null; k++) { const a = (k * Math.PI) / 4, W = unit([0, 1, 2].map((c) => U[c] * Math.cos(t) + (f.x[c] * Math.cos(a) + f.y[c] * Math.sin(a)) * Math.sin(t))); if (!inTheWay(parts, start, W, tool.radius, tool.reach).length) tilt = tool.tilt; }
  }
  return { tool: { name: tool.name, size: tool.size, radius: r3(tool.radius), reach: tool.reach, rests: tool.rests }, top: P.map(r3), axis: U.map(r3), blockers, tilt };
}

// ---------- the project's fixings ----------
const bound = new Map();
function fixingsOf(project) {
  const { context, hash } = fixingsContext({ project, dir: paths.project(project) });
  if (bound.get(project)?.hash !== hash) bound.set(project, { hash, F: fixingsFor({ ...(Object.keys(context.sets).length ? { sets: context.sets } : {}), ...(context.printer ? { printer: context.printer } : {}) }), material: context.material, printer: context.printer?.name ?? 'x1c' });
  return bound.get(project);
}
// A piece of hardware as a part's shape, made once for each name: the light solid of @rulecad/fixings, its faces, a hash
const shapes = new Map();
function shapeOf(F, kind, m, o) {
  const key = `${kind}:${m.name}:${JSON.stringify(o)}`;
  if (!shapes.has(key)) {
    const g = F[kind](m, o), [p] = named({ body: g }, { body: { label: g.model.name } });
    shapes.set(key, { geometry: p.geometry, polygons: p.polygons, triangles: p.triangles, model: g.model, hash: `fixing:${crypto.createHash('sha256').update(JSON.stringify([key, p.polygons])).digest('hex').slice(0, 16)}` });
  }
  return shapes.get(key);
}
// Where a piece of hardware stands in the world: its own z along Z from P, its x towards X where one is given
function standing(P, Z, X) {
  const z = unit(Z); let x = X && unit(add(X, z, -dot(X, z)));
  if (!x || !x.every(Number.isFinite)) { const seed = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; x = unit(cross(seed, z)); }
  const y = cross(z, x);
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, P[0], P[1], P[2], 1];
}

const NUTS = ['hex', 'square', 'lock'];

/**
 * An assembly's fasten relations, worked out from its parts as they stand: each screw followed along its axis, what
 * was measured, what was found, and the hardware to place.
 * @param {{ a: object, project: string, parts: object[], objects: object[], motion: object, num: Function }} s the assembly as built (parts placed; hardware parts among them are passed over)
 * @param {number[][]} worlds each motion item's place (3 × 4 by rows), as placeItems gives it for the pose the parts stand in
 * @param {{ access?: boolean }} [opts] access: follow each screw's key from its head (the build pose)
 * @returns {{ relations: object[], hardware: object[], fits: object[] }} relations: one for each entry of "fasten", with its screws
 *   (each with `access` where asked: its tool, and what stands over its head); hardware: every screw, nut, washer and insert to place;
 *   fits: the "fastens" fits the relations stand for, the screws' lines with their key and tightening
 */
export function fastenOf(s, worlds, opts = {}) {
  const list = s.a.fasten || [];
  if (!list.length) return { relations: [], hardware: [], fits: [] };
  const { F, material, printer } = fixingsOf(s.project), parts = s.parts.filter((p) => !p.hardware), ids = s.motion.items.map((x) => x[0]);
  const isNamed = (p, n) => p.name === n || p.leaf === n || p.item === n || p.name.startsWith(`${n}.`);
  const pick = (n) => parts.filter((p) => isNamed(p, n) && p.role !== 'support');
  const world = (k, pt) => [0, 1, 2].map((r) => worlds[k][4 * r] * pt[0] + worlds[k][4 * r + 1] * pt[1] + worlds[k][4 * r + 2] * pt[2] + worlds[k][4 * r + 3]);
  const turned = (k, v) => [0, 1, 2].map((r) => worlds[k][4 * r] * v[0] + worlds[k][4 * r + 1] * v[1] + worlds[k][4 * r + 2] * v[2]);
  const rowsToMat4 = (r) => [r[0], r[4], r[8], 0, r[1], r[5], r[9], 0, r[2], r[6], r[10], 0, r[3], r[7], r[11], 1];
  const relations = [], hardware = [], fits = [];

  list.forEach((x, k) => {
    const what = `fasten ${k + 1}`, through = x.through || [];
    // Refused by name before anything is measured: the screw, the parts, where the screws go
    let fx;
    try { fx = F.fixingModel(String(x.screw), {}, { anyLength: true }); } catch (e) { throw new Error(`${what}: ${e.message}`); }
    if (!['screw', 'thread'].includes(fx.item)) throw new Error(`${what}: "screw" names a screw by its thread and head ("M3 cap", "M4x12 button"): ${x.screw} is ${/^[aeiou]/.test(fx.item) ? 'an' : 'a'} ${fx.item}`);
    const form = fx.head?.form ?? (fx.made.heads.includes('cap') ? 'cap' : fx.made.heads[0]);
    if (!Array.isArray(through)) throw new Error(`${what}: "through" lists the parts the screw passes, in order from under its head (["bracket"])`);
    if (typeof x.into !== 'string' || !x.into) throw new Error(`${what}: "into" names the part the screw ends in`);
    const members = [...through, x.into].map((n) => { const ps = pick(n); if (!ps.length) throw new Error(`${what}: no part "${n}" (items: ${ids.join(', ')})`); return { name: n, parts: ps }; });
    if ((x.at == null) === (x.holes == null)) throw new Error(`${what}: give "at" (an anchor for each screw: ["${top(through[0] ?? x.into)}.h1"]) or "holes" (a part whose holes are the screws' places), one of the two`);
    if (x.nut != null && x.nut !== false && x.nut !== true && !NUTS.includes(x.nut)) throw new Error(`${what}: "nut" is true (a hexagon nut) or ${NUTS.join(', ')} (got ${JSON.stringify(x.nut)}): a slot nut comes with a frame's beam`);
    const wantNut = x.nut === true ? 'hex' : x.nut || null;
    if (form === 'set' && (through.length || wantNut || x.washer)) throw new Error(`${what}: a set screw goes into one part whole: give it "into" alone (no through, nut or washer)`);
    if (form !== 'set' && !through.length) throw new Error(`${what}: "through" names what the screw holds down, the part under its head: only a set screw has none`);
    const given = fx.length ?? (x.length != null ? s.num(x.length) : null);
    if (fx.length != null && x.length != null && Math.abs(s.num(x.length) - fx.length) > 1e-9) throw new Error(`${what}: ${x.screw} gives the length, and "length" says ${s.num(x.length)}: give it once`);
    if (given != null && !(given > 0)) throw new Error(`${what}: "length" is the screw's length, above 0 mm (got ${given})`);
    const torque = x.torque != null ? s.num(x.torque) : null;
    if (torque != null && !(torque > 0)) throw new Error(`${what}: "torque" is the tightening torque, above 0 N m (got ${torque})`);
    let head = null, washer = null;
    if (form !== 'set') { const m = F.screwModel(fx, { length: fx.length ?? 10, head: form, anyLength: true }); head = { form, across: m.headDiameter, height: m.headHeight, angle: fx.head?.angle ?? fx.figures.countersunk_angle?.value ?? 90 }; }
    if (x.washer) { try { washer = F.washerModel(fx.thread); } catch (e) { throw new Error(`${what}: ${e.message}`); } }
    const nutModel = (kind) => F.nutModel(fx.thread, { kind });
    if (wantNut) { try { nutModel(wantNut); } catch (e) { throw new Error(`${what}: ${e.message}`); } }
    const R = Math.max(head?.across ?? fx.major, washer?.diameter ?? 0, fx.major * 2.2) / 2 + 1.5;

    // A motor item ends the screws in its own tapped mounting holes, which its light solid does not draw
    const drive = (s.motion.drives || []).find((d) => d.id === top(x.into)) ?? null, Wm = drive ? worlds[drive.item] : null;
    const onMount = (O, D) => {
      if (!drive?.model.mount?.thread || !drive.model.mount.holes?.length) return null;
      const q = [O[0] - Wm[3], O[1] - Wm[7], O[2] - Wm[11]], l = [Wm[0] * q[0] + Wm[4] * q[1] + Wm[8] * q[2], Wm[1] * q[0] + Wm[5] * q[1] + Wm[9] * q[2]];
      if (Math.abs(Math.abs(dot(unit(D), [Wm[2], Wm[6], Wm[10]])) - 1) > 1e-6) return null;
      const h = drive.model.mount.holes.find(([hx, hy]) => Math.hypot(l[0] - hx, l[1] - hy) <= FASTEN.align.value);
      return h ? { at: h, thread: drive.model.mount.thread, depth: drive.model.mount.depth, model: drive.model.name } : null;
    };

    // The screws' axes: an anchor each, or the holes of a part
    const axes = [];
    if (x.at) s.motion.fasten[k].forEach((an, i) => {
      const fr = an.frame, P = [fr[3], fr[7], fr[11]], Z = [fr[2], fr[6], fr[10]];
      axes.push({ name: an.name ?? `screw ${i + 1}`, O: an.item < 0 ? P : world(an.item, P), D: unit(an.item < 0 ? Z : turned(an.item, Z)) });
    });
    else {
      const ps = pick(x.holes); if (!ps.length) throw new Error(`${what}: "holes" names a part: no part "${x.holes}" (items: ${ids.join(', ')})`);
      const others = members.filter((m) => !m.parts.some((p) => ps.includes(p)));
      for (const p of ps) {
        const board = s.objects.find((o) => o.id === p.leaf)?.built?.circuit;
        const local = board ? board.filter((e) => e.type === 'pcb_hole' && !e.pcb_component_id).map((h) => ({ at: [h.x, h.y, 0], axis: [0, 0, 1], d: h.hole_diameter }))
          : holesIn(p).filter((h) => h.d >= fx.major * 0.6 && h.d <= Math.max((head?.across ?? fx.major * 2) + 1, fx.major * 1.6));
        for (const h of local) {
          const O = vec3.transform([0, 0, 0], h.at, p.m), e = vec3.transform([0, 0, 0], add(h.at, h.axis), p.m), D = unit([e[0] - O[0], e[1] - O[1], e[2] - O[2]]);
          // a hole of this part is a screw's place where its axis goes on to another part of the joint
          if (others.length && !others.some((m) => reach(along(m.parts, O, D, R, false)))) continue;
          if (drive && !onMount(O, D)) continue; // (into a motor: only its mounting holes, not the hole its boss sits in)
          axes.push({ name: `hole at ${mm(h.at[0])}, ${mm(h.at[1])}${Math.abs(h.at[2]) > 1e-6 && !board ? `, ${mm(h.at[2])}` : ''}`, O, D });
        }
      }
    }
    const label = x.note || (through.length ? `${through.join(' and ')} to ${x.into}` : `in ${x.into}`);
    const rel = { index: k, what, label, screw: String(x.screw), thread: fx.thread, form, through, into: x.into, screws: [], general: [] };
    if (!axes.length) rel.general.push({ code: 'fasten.holes', level: 'fail', text: `no holes found in ${x.holes} that lead on to ${[...through, x.into].filter((n) => n !== x.holes).join(' or ') || 'another part'}: draw them with v.fixings, or place each screw with "at"` });

    const matOf = (m) => { // what a member is made of: the project's plastic for a printed part, its own word for a reference
      const p = m.parts[0], own = s.objects.find((o) => o.id === p.leaf)?.built?.object?.material;
      const name = own ? String(own).trim().toLowerCase().split(/\s/)[0] : p.role === 'reference' ? null : material;
      if (!name) return { name: null, cls: null, known: false };
      try { const e = F.engagement(fx, { depth: 1, material: name }); return { name, cls: e.class, known: true }; } catch { return { name, cls: p.role === 'reference' ? null : 'plastic', known: false }; }
    };
    const drawn = (kind) => { try { return F.holeModel(fx, { kind }); } catch { return null; } };
    const clr = { close: drawn('close'), normal: drawn('clearance'), loose: drawn('loose') }, clrOf = clr, sizeTol = FASTEN.size.value;
    // A circuit board's holes are drilled by its fab, not printed: held to the thread's clearance holes as they stand
    const drilled = (n) => (typeof fx.figures[n]?.value === 'number' ? { diameter: fx.figures[n].value, nominal: fx.figures[n].value, comp: 0, basis: { rule: `${fx.set}.${n}` } } : null);
    const clrDrilled = { close: drilled('clearance_close'), normal: drilled('clearance'), loose: drilled('clearance_loose') };
    const isBoard = (m) => m.parts.some((p) => s.objects.find((o) => o.id === p.leaf)?.built?.circuit);

    axes.forEach((ax, i) => {
      const sc = { index: i, name: ax.name, found: {}, hardware: [] }, say = (code, level, text, values) => { (sc.found[code] ||= []).push({ level, text, ...(values ? { values } : {}) }); };
      rel.screws.push(sc);
      // Which way the screw goes: from the part under its head towards the part it ends in (a set screw: against its anchor)
      const raw = members.map((m) => reach(along(m.parts, ax.O, ax.D, R, false)));
      const missing = members.filter((_, j) => !raw[j]);
      sc.at = ax.O; sc.between = [ax.O, ax.O];
      if (missing.length) return say('fasten.holes', 'fail', `${missing.map((m) => m.name).join(' and ')} ${missing.length > 1 ? 'are' : 'is'} nowhere on the screw's axis (nothing of ${missing.length > 1 ? 'them' : 'it'} within ${mm(R)} mm of it): the parts are not where the joint needs them`);
      const mid = (r) => (r[0] + r[1]) / 2, flip = members.length > 1 ? mid(raw.at(-1)) < mid(raw[0]) : true;
      const D = flip ? ax.D.map((c) => -c) : ax.D, O = ax.O, at = (z) => add(O, D, z);
      const runs = members.map((m) => ({ ...m, segs: along(m.parts, O, ax.D, R, flip) }));
      for (const r of runs) r.reach = reach(r.segs);
      const order = runs.slice(1).find((r, j) => mid(r.reach) < mid(runs[j].reach));
      if (order) return say('fasten.holes', 'fail', `${order.name} lies before ${runs[runs.indexOf(order) - 1].name} along the screw: "through" lists the parts in order from under the head, and "into" comes last`);
      const tol = 1e-3, B = runs.at(-1), A = through.length ? runs[0] : null, headR = head ? head.across / 2 : 0;
      const offAxis = (seg) => (seg.a.loop?.offset != null && seg.a.loop.shape === 'round' ? seg.a.loop.offset : null);
      const solidSays = (r, seg) => { const o = offAxis(seg); return `the axis meets solid ${r.name} ${mm(seg.z1 - seg.z0)} mm deep${o != null ? `: its nearest hole is ${mm(o)} mm from the axis` : ': no hole lies near'}`; };
      let bad = false, worst = 0;
      const size = (seg) => (seg.a.loop.shape === 'round' && seg.a.loop.d != null ? Math.min(seg.a.loop.d, seg.b.loop?.d ?? Infinity) : 2 * Math.min(seg.a.free, seg.b.free));

      // The seat: where the hole first comes in under the head's width
      let zSeat = A ? null : B.reach[0], cone = null, flat = true, proud = 0, bore0 = 0;
      if (A) {
        for (const [n, seg] of A.segs.entries()) {
          if (seg.solid) { say('fasten.holes', 'fail', solidSays(A, seg)); bad = true; break; }
          if (!seg.hole) continue;
          const fa = seg.a.free, fb = seg.b.free;
          if (fa >= headR - tol && fb >= headR - tol) continue; // (a counterbore: the head goes down it)
          bore0 = n;
          if (fa >= headR - tol) { zSeat = seg.z0 + ((fa - headR) / (fa - fb)) * (seg.z1 - seg.z0); cone = seg; flat = false; } // (a cone that narrows past the head's width: a countersink)
          else if (form === 'countersunk') { // a countersunk head on a hole narrower than itself: it rides high
            const slope = fa > fb + tol ? (fa - fb) / (seg.z1 - seg.z0) : Math.tan(((head.angle / 2) * Math.PI) / 180);
            if (fa > fb + tol) cone = seg;
            proud = (headR - fa) / slope; zSeat = seg.z0 - proud; flat = false;
          } else zSeat = seg.z0;
          break;
        }
        if (zSeat == null && !bad) { say('fasten.holes', 'fail', `${A.name} has no hole on the screw's axis for its head to sit on`); bad = true; }
      }
      if (bad) return;
      const wt = washer ? washer.thickness : 0, zHead = zSeat - wt;
      sc.at = at(zHead); sc.between = [at(zHead), at(zHead + (given ?? fx.major * 3))];

      // Each part passed through: a hole all the way, wide enough for the thread, on the axis
      const cl = [];
      for (const [j, r] of runs.slice(0, -1).entries()) {
        const segs = r.segs.filter((seg, n) => (j ? true : n >= bore0) && seg !== cone && seg.z1 > zSeat + tol), stop = segs.find((seg) => seg.solid);
        if (stop) { say('fasten.holes', 'fail', solidSays(r, stop)); bad = true; continue; }
        const holes = segs.filter((seg) => seg.hole);
        if (!holes.length) { say('fasten.holes', 'fail', `${r.name} has no hole on the screw's axis`); bad = true; continue; }
        const narrow = holes.reduce((m, seg) => (size(seg) < size(m) ? seg : m), holes[0]), d = size(narrow);
        for (const seg of holes) { const o = offAxis(seg); if (o != null && o > worst) worst = o; if (o != null && o > FASTEN.align.value) { say('fasten.holes', 'fail', `${r.name}'s hole is ${mm(o)} mm off the screw's axis: the holes do not line up`, { distance: r3(o) }); bad = true; break; } }
        cl.push({ name: r.name, d, free: 2 * Math.min(narrow.a.free, narrow.b.free), board: isBoard(r) });
      }
      // The far end: the hole in the last part, from its mouth
      const first = B.segs.find((seg) => seg.solid || seg.hole);
      let end = null;
      const mh = first.solid ? onMount(O, D) : null;
      if (mh) {
        if (mh.thread !== fx.thread) { say('fasten.end', 'fail', `${x.into}'s mounting holes are ${mh.thread} threads, and the screw is ${fx.thread}: use ${an(mh.thread)} ${mh.thread} screw`); bad = true; }
        else end = { mouth: first.z0, d: fx.major, free: fx.major, depth: mh.depth, blind: true, far: first.z0 + mh.depth, pocket: null, main: first, motor: mh };
      } else if (first.solid) { const o = offAxis(first); say('fasten.holes', 'fail', `${solidSays(B, first)}${o != null ? ': the holes do not line up' : ''}`, o != null ? { distance: r3(o) } : undefined); bad = true; }
      else {
        const n0 = B.segs.indexOf(first), mouth = first.z0; let n = n0;
        while (B.segs[n]?.hole && B.segs[n].a.free > B.segs[n].b.free + tol) n++; // (a lead-in at the mouth)
        const main = B.segs[n]?.hole ? B.segs[n] : first, d = size(main), free = Math.min(main.a.free, main.b.free);
        let stop = main.z1, pocket = null, blind = false, m = B.segs.indexOf(main) + 1;
        for (; m < B.segs.length; m++) {
          const seg = B.segs[m];
          if (seg.solid) { blind = true; break; }
          if (!seg.hole) { // a slot open to the side across the screw, the hole going on past it: a nut's slot (v.fixings.nutTrap)
            if (!pocket && seg.a.free > free + 0.3 && same(seg.a, seg.b) && B.segs.slice(m + 1).some((s) => s.hole)) pocket = seg;
            continue;
          }
          if (Math.min(seg.a.free, seg.b.free) < free - tol) { blind = true; break; } // (it narrows: a hole's point, a step)
          if (seg.a.free > free + 0.3 && same(seg.a, seg.b) && !pocket) pocket = seg; // (it widens to a seat on the far side)
          if (!pocket) stop = seg.z1;
        }
        const o = offAxis(main); if (o != null && o > worst) worst = o;
        if (o != null && o > FASTEN.align.value) { say('fasten.holes', 'fail', `${B.name}'s hole is ${mm(o)} mm off the screw's axis: the holes do not line up`, { distance: r3(o) }); bad = true; }
        end = { mouth, d, free: 2 * free, depth: (blind ? B.segs[m].z0 : stop) - mouth, blind, far: B.reach[1], pocket, main };
      }
      if (!bad) say('fasten.holes', 'pass', `one axis from under the head ${through.length ? `through ${through.join(', ')} ` : ''}into ${x.into}${worst > 1e-4 ? ` (the holes within ${mm(worst)} mm of it)` : ''}`, { distance: r3(worst) });

      // fasten.clearance: what each hole passed measures, against the thread's clearance hole as drawn on this printer
      if (cl.length) {
        if (!clr.normal) say('fasten.clearance', 'info', `${fx.thread} has no clearance hole in its rule set (${fx.set}): the holes it passes are not held to one`);
        else for (const c of cl) {
          const clr = c.board && clrDrilled.normal ? clrDrilled : clrOf, as = c.board && clrDrilled.normal ? 'as drilled' : 'as drawn';
          const lo = (clr.close ?? clr.normal).diameter, hi = (clr.loose ?? clr.normal).diameter, want = clr.normal, basis = `${want.basis.rule} ${mm(want.nominal)} mm${want.comp ? ` and ${printer}.hole_comp ${mm(want.comp)} mm` : ''}`;
          const values = { diameter: r3(c.d), wanted: want.diameter, least: lo, most: hi };
          if (c.d < lo - sizeTol) say('fasten.clearance', 'fail', `${c.name}'s hole measures ${mm(c.d)} mm where ${an(fx.thread)} ${fx.thread} screw passes through: a clearance hole should be ${mm(want.diameter)} mm ${as} (${basis}), ${mm(lo)} mm at the closest`, values);
          else if (c.d > hi + sizeTol) say('fasten.clearance', 'warn', `${c.name}'s hole measures ${mm(c.d)} mm, wider than the loosest clearance hole for ${fx.thread}, ${mm(hi)} mm ${as}: the screw does not place the part, and the head has less to sit on (${mm(want.diameter)} mm is the normal hole)`, values);
          else say('fasten.clearance', 'pass', `${c.name}'s hole measures ${mm(c.d)} mm, ${an(fx.thread)} ${fx.thread} clearance hole ${as} (${Math.abs(c.d - want.diameter) <= sizeTol ? basis : `between the close ${mm(lo)} mm and the loose ${mm(hi)} mm; the normal hole is ${mm(want.diameter)} mm`})`, values);
        }
      }
      if (!end) return;

      // fasten.end: what holds the screw there
      const kinds = [['pilot', 'a pilot the screw forms its own thread in'], ['tap', 'a hole to tap'], ['insert', 'a heat-set insert\'s hole']].map(([kind, says]) => ({ kind, says, hole: drawn(kind) })).filter((c) => c.hole);
      const isClearance = clr.normal && end.d >= (clr.close ?? clr.normal).diameter - sizeTol && end.d <= (clr.loose ?? clr.normal).diameter + sizeTol;
      const options = () => [...kinds.map((c) => `${c.says} (${mm(c.hole.diameter)} mm)`), ...(fx.made.nuts.length ? ['a nut\'s seat on a clearance hole, or a clearance hole with "nut"'] : [])].join(', ');
      const endValues = { diameter: r3(end.d), depth: r3(end.depth) };
      let seatNut = null;
      if (end.pocket && !end.blind) { // a seat drawn on the far side: whose nut is it
        const sh = end.pocket.a.loop.shape, across = sh === 'hex' || sh === 'square' ? end.pocket.a.loop.flats : 2 * end.pocket.a.free;
        for (const kind of sh === 'square' ? ['square'] : ['hex', 'lock']) { try { const n = nutModel(kind); if (across >= n.flats - 0.05 && across <= n.flats + 1 && (!seatNut || wantNut === kind)) seatNut = { kind, model: n, across }; } catch {} }
      }
      if (end.motor) { end.kind = 'tap'; say('fasten.end', 'pass', `ends in ${x.into}'s own ${fx.thread} thread, ${mm(end.depth)} mm deep (${end.motor.model}.mount_hole_depth)`, endValues); }
      else if (wantNut || seatNut) {
        const kind = wantNut ?? seatNut.kind, nm = nutModel(kind);
        if (end.blind) say('fasten.end', 'fail', `a nut is given, and ${x.into}'s hole is blind, ${mm(end.depth)} mm deep: a nut holds a screw that comes out of the far side`, endValues);
        else if (!isClearance) say('fasten.end', 'fail', `a nut holds this screw, so ${x.into} is passed through: its hole measures ${mm(end.d)} mm, and a clearance hole should be ${mm(clr.normal?.diameter ?? fx.major)} mm as drawn`, endValues);
        else {
          const zNut = end.pocket && seatNut ? end.pocket.z0 : end.far;
          end.kind = 'nut'; end.nut = { kind, model: nm, z: zNut, seated: !!(end.pocket && seatNut), corner: end.pocket && seatNut && (end.pocket.a.loop.corner || end.pocket.a.loop.along) ? { seg: end.pocket } : null };
          say('fasten.end', 'pass', `ends in ${an(nm.name)} ${nm.name} ${end.nut.seated ? `in its seat in ${x.into}, ${mm(seatNut.across)} mm across the flats for the nut's ${mm(nm.flats)} mm` : `on the far face of ${x.into}`}, past a ${mm(end.d)} mm clearance hole`, { ...endValues, flats: nm.flats });
        }
      } else {
        const hit = kinds.filter((c) => Math.abs(end.d - c.hole.diameter) <= sizeTol).sort((p, q) => Math.abs(end.d - p.hole.diameter) - Math.abs(end.d - q.hole.diameter))[0];
        let threaded = null;
        if (!hit && end.main.a.loop.shape !== 'round') { try { const t = F.threadModel(fx, { internal: true, length: Math.max(end.depth, fx.pitch * 2) }); if (end.free > fx.major - 2 * fx.pitch && end.free < fx.major + 1) threaded = t; } catch {} }
        if (hit) {
          end.kind = hit.kind;
          const basis = hit.hole.basis, trust = basis.kind === 'measured' ? 'measured' : basis.kind === 'spec' ? 'a standard\'s figure' : `${/^[aeiou]/.test(basis.kind) ? 'an' : 'a'} ${basis.kind} figure`;
          say('fasten.end', 'pass', `ends in ${x.into}, in ${hit.says}: ${mm(end.d)} mm as drawn (${basis.rule}, ${trust}), ${end.blind ? `${mm(end.depth)} mm deep` : `through its ${mm(end.depth)} mm`}`, endValues);
          if (hit.kind === 'insert') { try { end.insert = F.insertModel(fx.thread); } catch { end.insert = null; } }
        } else if (threaded) { end.kind = 'thread'; say('fasten.end', 'pass', `ends in ${x.into}, in a thread drawn to print, ${mm(end.free)} mm across its crests, ${end.blind ? `${mm(end.depth)} mm deep` : `through its ${mm(end.depth)} mm`}`, endValues); }
        else if (isClearance) say('fasten.end', 'fail', `nothing holds the screw in ${x.into}: its hole measures ${mm(end.d)} mm, a clearance hole. The far end should be ${options()}`, endValues);
        else say('fasten.end', 'fail', `${x.into}'s hole measures ${mm(end.d)} mm, which is no hole for ${fx.thread}: the far end should be ${options()}`, endValues);
      }

      // fasten.length: the length chosen, or the one given held to the stack as measured
      const zGrip = end.kind === 'nut' ? end.nut.z : end.mouth, grip = zGrip - zHead, stack = zGrip - zSeat, intoMat = matOf(B), tipRoom = DEFAULTS.tip_room.value;
      sc.grip = r3(grip);
      let pick = null, none = null, need = null;
      if (end.motor && form !== 'set') { // the longest sold length that stops short of the motor's thread's end, as motor.mount chooses
        const sold = fx.figures.lengths?.value || [], room = end.depth - tipRoom, L0 = [...sold].reverse().find((l) => l > grip + EPS && l - grip <= room + EPS);
        if (L0) pick = { name: F.screwModel(fx, { length: L0, head: form }).name, length: L0, engaged: r3(L0 - grip), spare: r3(room - (L0 - grip)) };
        else none = `no ${fx.thread} ${form} screw that is sold goes ${mm(grip)} mm under its head into ${x.into} and stops within its ${mm(end.depth)} mm of thread, ${mm(tipRoom)} mm kept at its tip`;
        need = pick ? pick.engaged : null;
      } else if (end.kind && form !== 'set' && stack > 1e-6) {
        const into = { kind: end.kind, ...(end.kind === 'nut' ? { nut: end.nut.kind } : end.blind ? (end.kind === 'insert' ? { room: Math.max(end.depth - tipRoom, end.insert?.length ?? 0) } : { depth: end.depth }) : { through: true }), ...(['tap', 'thread'].includes(end.kind) && intoMat.cls ? { material: intoMat.known ? intoMat.name : intoMat.cls } : {}) };
        try { pick = F.lengthFor(r3(stack), fx, { into, head: form, ...(washer ? { washer: true } : {}) }); need = pick.need; } catch (e) { none = e.message.replace(/^lengthFor: /, ''); }
      }
      // how much thread the far end offers, and how much the rule for it asks
      const avail = !end.kind ? 0 : end.kind === 'nut' ? end.nut.model.height : end.kind === 'insert' ? Math.min(end.insert?.length ?? end.depth, end.depth) : end.depth;
      if (need == null && end.kind) {
        if (end.kind === 'nut') need = end.nut.model.height;
        else if (end.kind === 'insert') need = Math.min(DEFAULTS.insert_engagement.value * fx.major, end.insert?.length ?? Infinity);
        else if (end.kind === 'pilot' && fx.figures.pilot_depth) need = fx.figures.pilot_depth.value;
        else { try { need = F.engagement(fx, { depth: 1, material: end.kind === 'pilot' ? 'plastic' : intoMat.known ? intoMat.name : intoMat.cls ?? 'plastic' }).need; } catch { need = null; } }
      }
      let L = given ?? pick?.length ?? null, sold = true;
      if (form === 'set' && L == null) L = Math.max(1, Math.floor(end.depth));
      if (L == null) { const want = grip + (need ?? fx.major), listed = fx.figures.lengths?.value; L = (Array.isArray(listed) && listed.find((l) => l >= want - 1e-9)) || Math.ceil(want); } // (none fits: drawn at the nearest, so the picture still shows the joint)
      let model;
      try { model = F.screwModel(fx, { length: L, head: form }); } catch (e) { sold = false; model = F.screwModel(fx, { length: L, head: form, anyLength: true }); if (given != null) say('fasten.length', 'fail', e.message.replace(/^screw: /, '')); }
      const inEnd = L - grip, zTip = zHead + L;
      sc.dir = D; sc.engaged = end.kind ? r3(Math.max(0, Math.min(inEnd, avail))) : 0; sc.endKind = end.kind ?? null; sc.intoMaterial = intoMat.known ? intoMat.name : null; sc.bear = (washer ? washer.diameter : head?.across ?? fx.major * 2) / 2;
      sc.length = L; sc.model = model; sc.between = [at(zHead), at(zTip)]; sc.end = end.kind ?? null;
      const lenValues = { length: L, grip: r3(grip), into: r3(inEnd) }, under = `${mm(grip)} mm under its head${washer ? ' (its washer with it)' : ''}`;
      const wouldDo = pick && pick.length !== L ? `${pick.name} would do` : null;
      if (given == null) {
        if (pick) say('fasten.length', 'pass', `${pick.name} chosen, the ${end.motor ? 'longest sold that stops short of the end of the thread' : 'shortest sold that fits'}: ${under} and ${mm(pick.engaged)} mm into ${x.into}${end.kind === 'nut' ? '\'s nut' : ''}${pick.spare != null ? `, ${mm(pick.spare)} mm short of bottoming out` : ''}`, lenValues);
        else if (none) say('fasten.length', 'fail', `no length chosen: ${none}`, lenValues);
        else if (form !== 'set') say('fasten.length', 'info', `no length chosen until the far end is one a screw holds in: ${model.name} is drawn`, lenValues);
      } else if (inEnd <= EPS) say('fasten.length', 'fail', `${model.name} does not reach ${x.into}: it is ${mm(L)} mm long and there is ${under}${wouldDo ? `. ${wouldDo}` : ''}`, lenValues);
      else if (end.blind && inEnd > end.depth - (end.kind === 'insert' ? 0 : tipRoom) + EPS) say('fasten.length', 'fail', `${model.name} bottoms out: with ${under} it goes ${mm(inEnd)} mm into a hole ${mm(end.depth)} mm deep${end.kind === 'insert' ? '' : `, where ${mm(tipRoom)} mm is kept at its tip`}, so it tightens on its tip and not on its head${wouldDo ? `. ${wouldDo}` : `. Deepen the hole to ${mm(inEnd + tipRoom)} mm, or use a shorter screw`}`, { ...lenValues, depth: r3(end.depth) });
      else {
        const far = end.kind === 'nut' ? end.nut.z + end.nut.model.height : end.far, out = end.blind ? 0 : zTip - far, most = FASTEN.proud.value * fx.major;
        if (out > most + EPS) say('fasten.length', 'warn', `${model.name} stands ${mm(out)} mm proud of ${end.kind === 'nut' ? 'its nut' : `${x.into}'s far face`}, more than its own diameter${wouldDo ? `: ${wouldDo}` : ''}`, { ...lenValues, proud: r3(out) });
        else if (sold) say('fasten.length', 'pass', `${model.name} reaches: ${under}, ${mm(inEnd)} mm into ${x.into}${end.kind === 'nut' ? '\'s nut' : ''}${end.blind ? `, ${mm(end.depth - inEnd)} mm short of the hole's end` : out > 1e-6 ? `, its tip ${mm(out)} mm proud` : ''}`, lenValues);
      }

      // fasten.engagement: thread engaged at the far end, against the rule for what it is in
      if (end.motor && form !== 'set') { // a bought part's thread: held to its depth, and to the least engagement any metal is given (engagement.steel), as motor.mount is
        const e = Math.max(0, Math.min(inEnd, end.depth)), least = r3(F.engagement(fx, { depth: 1, material: 'steel' }).need), turns = +(e / fx.pitch).toFixed(1), values = { engaged: r3(e), depth: end.depth, turns, least };
        if (e >= least - EPS) say('fasten.engagement', 'pass', `${mm(e)} mm of ${x.into}'s own thread, ${mm(turns)} turns of its ${mm(end.depth)} mm: a bought part's thread, held to its depth and to the ${mm(least)} mm engagement.steel gives any metal`, values);
        else say('fasten.engagement', 'fail', `${mm(e)} mm of ${x.into}'s own thread, ${mm(turns)} turns of its ${mm(end.depth)} mm: less than the ${mm(least)} mm engagement.steel gives any metal, so the thread strips before the screw holds. A longer screw, or a counterbore to sink its head`, values);
      }
      else if (end.kind && need != null && form !== 'set') {
        const engaged = Math.max(0, Math.min(inEnd, avail)), ok = engaged >= need - EPS, values = { engaged: r3(engaged), need: r3(need), turns: +(engaged / fx.pitch).toFixed(1) };
        const what2 = end.kind === 'nut' ? `its ${end.nut.model.name}, ${mm(avail)} mm high` : end.kind === 'insert' ? `the insert, ${mm(avail)} mm long` : `${intoMat.name ? `${intoMat.name}${intoMat.cls && intoMat.known ? ` (a${intoMat.cls === 'aluminium' ? 'n' : ''} ${intoMat.cls})` : ''}` : end.kind === 'pilot' ? 'plastic' : x.into}`;
        const rule = end.kind === 'nut' ? 'a nut wants its whole height engaged' : end.kind === 'insert' ? `fixings.insert_engagement asks a diameter of thread or the whole insert, ${mm(need)} mm` : end.kind === 'pilot' && fx.figures.pilot_depth ? `${fx.set}.pilot_depth asks ${mm(need)} mm` : `engagement.${end.kind === 'pilot' ? 'plastic' : intoMat.cls ?? 'plastic'} asks ${mm(need / fx.major)} diameters, ${mm(need)} mm`;
        if (ok) say('fasten.engagement', 'pass', `${mm(engaged)} mm of thread in ${what2}, ${mm(values.turns)} turns: ${rule}`, values);
        else {
          const cure = avail < need - EPS ? (end.kind === 'insert' || end.kind === 'nut' ? `there is only ${mm(avail)} mm of it` : `the hole offers ${mm(avail)} mm: ${end.blind ? `deepen it to ${mm(need + tipRoom)} mm` : `${x.into} wants ${mm(need)} mm of thread on the axis`}`)
            : pick && pick.length > L ? `${pick.name} would do` : none ? none : `a screw ${mm(grip + need)} mm or longer would do`;
          say('fasten.engagement', 'fail', `${model.name} engages ${mm(engaged)} mm of thread in ${what2}, ${mm(values.turns)} turns, where ${rule}: ${cure}`, values);
        }
      } else if (end.kind && form !== 'set') say('fasten.engagement', 'info', `nothing says what ${x.into} is made of, so the thread engaged in it is not held to a rule: give its object a "material"`);

      // fasten.seat: a flat seat under the head, as wide as the head and square to the axis, and what it takes
      if (A) {
        const seatPart = A.segs[bore0], near = seatPart.of.near, zLocal = (z) => (flip ? -z : z), bearR = (washer ? washer.diameter : head.across) / 2, boreR = seatPart.a.free, seatMat = matOf(A); // (boreR: the hole's mouth at the seat, a lead-in with it)
        const e = 0.02;
        if (form === 'countersunk') {
          if (!cone) say('fasten.seat', 'fail', `a countersunk head sits in a ${mm(head.angle)}° countersink, and ${A.name}'s hole has a square edge: the head stands ${mm(proud)} mm proud on a line of contact. Draw it with v.fixings.countersink`, { proud: r3(proud) });
          else {
            const ang = (2 * Math.atan((cone.a.free - cone.b.free) / (cone.z1 - cone.z0)) * 180) / Math.PI, okAngle = Math.abs(ang - head.angle) <= FASTEN.countersink.value;
            if (!okAngle) say('fasten.seat', 'fail', `${A.name}'s countersink is ${mm(+ang.toFixed(1))}°, and ${fx.thread}'s countersunk head is ${mm(head.angle)}°: the head bears on a line, not on its cone`, { angle: +ang.toFixed(1), wanted: head.angle });
            else if (proud > 0.05) say('fasten.seat', 'warn', `${A.name}'s countersink is ${mm(2 * cone.a.free)} mm across at its mouth, and the head is ${mm(head.across)} mm: the head stands ${mm(proud)} mm proud`, { proud: r3(proud), angle: +ang.toFixed(1) });
            else say('fasten.seat', 'pass', `the countersunk head sits in a ${mm(+ang.toFixed(1))}° countersink in ${A.name}, its top ${zSeat - A.reach[0] > 0.01 ? `${mm(zSeat - A.reach[0])} mm under the face` : 'flush with the face'}`, { angle: +ang.toFixed(1), sunk: r3(zSeat - A.reach[0]) });
          }
        } else {
          const under = Math.min(ring(near, zLocal(zSeat + e), boreR + 0.6 * (bearR - boreR), false), ring(near, zLocal(zSeat + e), bearR - e, false)), over = Math.max(ring(near, zLocal(zSeat - e), boreR + 0.6 * (bearR - boreR), false), ring(near, zLocal(zSeat - e), bearR - e, false));
          const whole = under > 1 - 1e-9 && over < 1e-9, values = { under: r3(under), across: 2 * bearR, hole: r3(2 * boreR) };
          if (!flat || !whole) say('fasten.seat', 'fail', flat && washer && over > 1e-9 && zSeat - A.reach[0] > 0.01 ? `the washer, ${mm(2 * bearR)} mm across, does not go down ${A.name}'s counterbore to the seat: the counterbore is drawn for the head alone (${mm(head.across)} mm)`
            : !flat || over > 1e-9 ? `the ${washer ? 'washer' : 'head'} has no flat seat on ${A.name}: the face under it is not square to the screw (${cone ? 'a cone' : `material stands above the seat on ${Math.round(over * 100)}% of the way round`})` : `the ${washer ? 'washer' : 'head'} overhangs its seat on ${A.name}: there is material under ${Math.round(under * 100)}% of the ring out to its ${mm(2 * bearR)} mm, where a flat seat as wide as the ${washer ? 'washer' : 'head'} is asked`, values);
          else {
            // what the seat takes: the ring under the head as drawn, against the strength of what it sits on
            let st = null;
            if (seatMat.name && seatMat.known) { try { st = F.seating(fx, { head: form, material: seatMat.name, ...(torque != null ? { torque } : {}) }); } catch { st = null; } }
            const sunk = zSeat - A.reach[0], where = `a flat seat on ${A.name}${sunk > 0.01 ? `, ${mm(sunk)} mm down its counterbore` : ''}, whole out to the ${washer ? 'washer' : 'head'}'s ${mm(2 * bearR)} mm`;
            if (!st) say('fasten.seat', 'pass', `${where}${seatMat.name ? ` (no strength is known for ${seatMat.name}, so the pressure under it is not checked)` : ''}`, values);
            else {
              const D2 = st.head === 'hex' ? head.across * Math.cos(Math.PI / 6) : head.across, area = (d) => (Math.PI / 4) * (d * d - (2 * boreR) ** 2), bare = area(D2), onWasher = st.washer ? area(st.washer.diameter) : null, mine = washer ? onWasher : bare;
              const takes = st.limit * mine, K = DEFAULTS.nut_factor.value, torqueOf = (N) => (K * fx.major * N) / 1000, v2 = { ...values, area: +mine.toFixed(2), limit: st.limit, force: +takes.toFixed(1), torque: +torqueOf(takes).toFixed(3) };
              sc.most = +torqueOf(takes).toFixed(2); sc.seatForce = takes;
              if (torque == null) say('fasten.seat', 'pass', `${where}; on ${st.material} (${mm(st.limit)} MPa) its ${mm(+mine.toFixed(1))} mm² takes ${mm(+takes.toFixed(0))} N, a tightening of ${mm(+torqueOf(takes).toFixed(2))} N m${!washer && onWasher && sunk <= 0.01 ? `: the ${fx.thread} washer would raise that to ${mm(+(st.limit * onWasher).toFixed(0))} N (${mm(+torqueOf(st.limit * onWasher).toFixed(2))} N m)` : ''}`, v2);
              else {
                const p = st.force / mine, within = p <= st.limit + 1e-9, pw = onWasher ? st.force / onWasher : null;
                if (within) say('fasten.seat', 'pass', `${where}; at ${mm(torque)} N m the screw clamps with ${mm(st.force)} N, ${mm(+p.toFixed(1))} MPa under the ${washer ? 'washer' : 'head'} on ${st.material}, whose strength is ${mm(st.limit)} MPa`, { ...v2, pressure: +p.toFixed(1) });
                else say('fasten.seat', 'fail', `at ${mm(torque)} N m the screw clamps with ${mm(st.force)} N: ${mm(+p.toFixed(1))} MPa under the ${washer ? 'washer' : 'head'} on ${st.material}, whose strength is ${mm(st.limit)} MPa. ${!washer && pw != null && pw <= st.limit && sunk <= 0.01 ? `The ${fx.thread} washer, ${mm(st.washer.diameter)} mm across, brings it to ${mm(+pw.toFixed(1))} MPa, within: give "washer": true` : `The seat takes ${mm(+takes.toFixed(0))} N (${mm(+torqueOf(takes).toFixed(2))} N m): tighten to that, or spread the load wider`}`, { ...v2, pressure: +p.toFixed(1), ...(pw != null ? { washer: +pw.toFixed(1) } : {}) });
              }
            }
          }
        }
      }

      // The hardware, each piece where it sits: its own frame, the item it moves with, the way it comes out, what it may overlap
      const host = (r) => r.parts[0], up = D.map((c) => -c), piece = (kind, m, o, P, Z, r, lift, allow, X) => sc.hardware.push({ kind, shape: shapeOf(F, kind, m, o), M: standing(P, Z, X), host: host(r), lift, allow });
      const ends = [...new Set(B.parts.map((p) => p.leaf))];
      if (A) piece('screw', fx, { length: L, head: form, anyLength: true }, at(zHead), up, A, up, ends);
      else piece('screw', fx, { length: L, head: form, anyLength: true }, at(zSeat), up, B, up, ends);
      if (washer) piece('washer', fx.thread, {}, at(zSeat), up, A, up, []);
      if (end.kind === 'nut') {
        let X = null;
        if (end.nut.corner) { const lp = end.nut.corner.seg.a.loop, pr = end.nut.corner.seg.of, v = lp.corner ? [lp.corner[0] - lp.c[0], lp.corner[1] - lp.c[1]] : lp.along, local = add(pr.x.map((c) => c * v[0]), pr.y, v[1]), pm = end.nut.corner.seg.part.m; X = pm ? [0, 1, 2].map((r) => pm[r] * local[0] + pm[4 + r] * local[1] + pm[8 + r] * local[2]) : local; }
        piece('nut', fx.thread, { kind: end.nut.kind }, at(end.nut.z), D, B, D, [], X);
      }
      if (end.kind === 'insert' && end.insert) piece('insert', fx.thread, {}, at(end.mouth), up, B, up, ends);
      // fasten.access: the key's way to the head, along its axis, with every other part in place (said by fastenChecks, with the order)
      const tool = toolFor(model, form, fx);
      sc.tool = tool?.name ?? null;
      if (opts.access && tool) sc.access = accessOf(parts, tool, add(A ? at(zHead) : at(zSeat), up, model.top), up);
    });

    // The pieces of this relation, named, and the fits it stands for
    const count = { screw: 0, nut: 0, washer: 0, insert: 0 };
    for (const sc of rel.screws) for (const h of sc.hardware) {
      const id = `fasten-${k + 1}-${h.kind}-${sc.index + 1}`, hostIndex = ids.indexOf(h.host.item), hostWorld = rowsToMat4(worlds[hostIndex]);
      count[h.kind]++;
      const others = sc.hardware.filter((o) => o !== h).map((o) => `fasten-${k + 1}-${o.kind}-${sc.index + 1}`); // (a screw in its own nut, washer and insert)
      const hm = h.shape.model;
      hardware.push({ id, kind: h.kind, name: hm.name, thread: fx.thread, fasten: k, screw: sc.index, grams: hm.mass, label, length: hm.length ?? null, head: h.kind === 'screw' ? hm.head : h.kind === 'nut' ? hm.kind : null, shape: h.shape, host: hostIndex, hostItem: h.host.item, with: h.host.object || h.host.item,
        local: mat4.multiply(mat4.create(), mat4.invert(mat4.create(), hostWorld), h.M), lift: vec3.transform([0, 0, 0], h.lift, mat4.invert(mat4.create(), [...hostWorld.slice(0, 12), 0, 0, 0, 1])), allow: [...h.allow, ...others] });
    }
    const names = new Map();
    for (const h of hardware.filter((o) => o.fasten === k)) names.set(h.name, (names.get(h.name) ?? 0) + 1);
    // the screws' lines carry the key that turns them and how tight: the torque given, or the most the seat under the head takes
    const keys = [...new Set(rel.screws.map((sc) => sc.tool).filter(Boolean))], most = rel.screws.map((sc) => sc.most).filter((t) => t != null);
    const tighten = torque != null ? { torque, given: true } : most.length ? { torque: Math.min(...most), given: false } : null;
    const lines = [...names].map(([fastener, n]) => ({ fastener, count: n, ...(rel.screws.some((sc) => sc.model?.name === fastener) ? { ...(keys.length ? { key: keys.join(' or ') } : {}), ...(tighten ? { tighten } : {}) } : {}) }));
    through.forEach((t, j) => fits.push({ a: t, b: x.into, fastens: true, silent: true, fasten: k, note: x.note || `${t} fastened to ${x.into}`, ...(j === 0 && lines[0] ? lines[0] : {}) }));
    if (!through.length && lines[0]) fits.push({ a: x.into, b: x.into, silent: true, fasten: k, note: label, ...lines[0] });
    for (const l of lines.slice(1)) fits.push({ a: through[0] ?? x.into, b: x.into, silent: true, fasten: k, note: x.note || `${through[0] ?? x.into} fastened to ${x.into}`, ...l });
    rel.count = count; rel.torque = torque;
    rel.load = loadOf(s, worlds, rel, list, { F, fx, ids });
    if (rel.load?.tighten != null && torque == null) for (const ft of fits.filter((q) => q.fasten === k && q.tighten)) ft.tighten = { torque: rel.load.tighten, given: false, load: true };
    relations.push(rel);
  });
  return { relations, hardware, fits };
}

// ---------- fasten.load: what a joint carries, shared between its screws ----------
const G = 9.80665; // m/s²
const sub3 = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], scale3 = (p, k) => p.map((c) => c * k), rowsAt = (W, p) => [0, 1, 2].map((r) => W[4 * r] * p[0] + W[4 * r + 1] * p[1] + W[4 * r + 2] * p[2] + W[4 * r + 3]);
// The items a joint holds up: those left with no way to the ground (the first item) once the joint's own links are cut.
// Links are the motion's joints, fits that fasten and the other fasten relations; null where both sides keep a way.
function beyondOf(s, rel, list, ids) {
  const idx = (n) => ids.indexOf(top(n)), members = new Set([...rel.through, rel.into].map(idx)), links = [];
  for (const j of s.motion.joints || []) links.push([j.parent, j.child]);
  for (const x of s.a.fits || []) if (x.fastens) links.push([idx(x.a), idx(x.b)]);
  list.forEach((x, k) => { if (k !== rel.index) for (const t of x.through || []) links.push([idx(t), idx(x.into)]); });
  const cut = links.filter(([p, q]) => p >= -1 && q >= 0 && !(members.has(p) && members.has(q))), reach = (from) => {
    const seen = new Set(from);
    for (let grew = true; grew;) { grew = false; for (const [p, q] of cut) { if (seen.has(p) && !seen.has(q)) { seen.add(q); grew = true; } if (seen.has(q) && !seen.has(p)) { seen.add(p); grew = true; } } }
    return seen;
  };
  const ground = reach([-1, 0]), loose = [...members].filter((m) => !ground.has(m));
  if (!loose.length || loose.length === members.size) return null;
  return reach(loose);
}
/**
 * The load on one fasten relation and each screw's share of it: the masses of the parts it holds up and the "loads"
 * hung on them, under the assembly's gravity, and the torque of a motor among them whose reaction it takes; each
 * screw against its strength (screwLoad). Null where nothing loads the joint (no "loads", no motor beyond it).
 */
function loadOf(s, worlds, rel, list, { F, fx, ids }) {
  const ok = rel.screws.filter((sc) => sc.dir && sc.at), loads = (s.motion.loads || []).filter((l) => l.mass != null);
  if (!ok.length || ok.length < rel.screws.length) return null;
  const beyond = beyondOf(s, rel, list, ids);
  const drives = (s.motion.drives || []).filter((d) => beyond?.has(d.item) && d.joint && (() => { const j = s.motion.joints.find((q) => q.id === d.joint); return j && !beyond.has(j.child); })());
  if (!loads.length && !drives.length) return null;
  if (!beyond) return { closed: true };
  const u = unit(ok[0].dir);
  if (ok.some((sc) => Math.abs(dot(unit(sc.dir), u) - 1) > 1e-6)) return { skew: true };
  const headSide = rel.through.some((t) => beyond.has(ids.indexOf(top(t)))), n = headSide ? u.map((c) => -c) : u; // n: the way the held part comes off
  const g = s.motion.gravity || [0, 0, -1], gl = Math.hypot(...g), down = g.map((c) => c / gl);
  let Fw = [0, 0, 0], Mw = [0, 0, 0], kg = 0;
  const hang = (mass, X) => { const f = scale3(down, mass * G); Fw = add(Fw, f); Mw = add(Mw, cross(X, f)); kg += mass; };
  const masses = massesOf(s, { placeItems, jointValues });
  for (const m of masses) if (beyond.has(m.item)) { const d = (s.motion.drives || []).find((q) => q.item === m.item), mass = m.kg || (d ? d.model.mass ?? 0 : 0); if (mass > 0) hang(mass, rowsAt(worlds[m.item], m.centre)); }
  const hung = loads.filter((l) => beyond.has(l.item));
  for (const l of hung) hang(l.mass, rowsAt(worlds[l.item], [l.frame[3], l.frame[7], l.frame[11]]));
  // the joint's frame: e1, e2 across it, n along the screws; places about the screws' centroid
  const c = ok.reduce((t, sc) => add(t, sc.at, 1 / ok.length), [0, 0, 0]), seed = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = unit(cross(seed, n)), e2 = cross(n, e1);
  const places = ok.map((sc) => { const q = sub3(sc.at, c); return [dot(q, e1), dot(q, e2)]; }), local = (v) => [dot(v, e1), dot(v, e2), dot(v, n)];
  const Mc = sub3(Mw, cross(c, Fw)), pivot = Math.min(...ok.map((sc) => sc.bear)); // N mm about the centroid
  const torques = drives.map((d) => { const W = worlds[d.item], T = mountTorque(d), axis = [W[2], W[6], W[10]]; return { id: d.id, torque: T, about: T * dot(axis, n), M: scale3(axis, T * 1000) }; });
  const Mt = torques.reduce((t, q) => add(t, q.M), [0, 0, 0]);
  // the worst of the motor turning either way; each screw against its strength at its share
  const cases = (torques.length ? [1, -1] : [1]).map((sign) => screwGroup(places, { force: local(Fw), moment: local(add(Mc, Mt, sign)).map((m) => m / 1000), pivot }));
  const screws = ok.map((sc, i) => {
    const pick = cases.map((gp) => gp.screws[i]).reduce((a, b) => (b.tension > a.tension + 1e-9 || (Math.abs(b.tension - a.tension) <= 1e-9 && b.shear > a.shear) ? b : a));
    const threaded = ['pilot', 'tap', 'thread'].includes(sc.endKind) && sc.intoMaterial && sc.engaged > 0;
    const r = F.screwLoad(fx, { tension: Math.max(0, pick.tension), shear: pick.shear, ...(threaded ? { depth: sc.engaged, material: sc.intoMaterial } : ['insert', 'nut'].includes(sc.endKind) ? { end: sc.endKind } : {}), ...(rel.torque != null ? { torque: rel.torque } : sc.seatForce ? { most: sc.seatForce } : {}) });
    return { sc, tension: pick.tension, shear: pick.shear, r };
  });
  const share = torques.length ? Math.max(...screwGroup(places, { moment: [0, 0, torques.reduce((t, q) => t + q.about, 0)] }).screws.map((x) => x.shear)) : null;
  const worst = screws.reduce((a, b) => (b.r.margin < a.r.margin ? b : a)), slip = screws.filter((x) => x.r.margins.slip != null).reduce((a, b) => (!a || b.r.margins.slip < a.r.margins.slip ? b : a), null);
  const tighten = rel.torque == null ? Math.min(...screws.map((x) => x.r.preload.torque)) : null;
  const rests = [...new Map(screws.flatMap((x) => x.r.rests).filter((q) => q.kind === 'estimate' || q.kind === 'community').map((q) => [q.name, q])).values()].map((q) => q.name);
  return { beyond: [...beyond].filter((k) => k >= 0).map((k) => ids[k]), kg, hung: hung.length, force: Fw, torques, share, screws, worst, slip, tighten, rests, line: cases[0].line, turns: cases.map((gp) => gp.turns).find((t) => t != null) ?? null };
}

/**
 * A piece of hardware as a placed part, where its item stands.
 * @param {object} h a piece from fastenOf's hardware @param {number[]} hostWorld its item's place (a JSCAD mat4)
 * @returns {object} a part as buildAssembly makes them: a reference, with `hardware` ({ kind, fasten, screw }), `moves` (the
 *   item it moves with), `lift` (the way it comes out, for an exploded view) and `allow` (the leaves it may overlap: what it is threaded into)
 */
export function hardwarePart(h, hostWorld) {
  const m = mat4.multiply(mat4.create(), hostWorld, h.local), move = (polys) => polys.map((poly) => poly.map((v) => vec3.transform([0, 0, 0], v, m)));
  const lift = vec3.transform([0, 0, 0], h.lift, [...hostWorld.slice(0, 12), 0, 0, 0, 1]);
  return { name: `${h.id}.body`, item: h.id, leaf: h.id, object: h.name, role: 'reference', label: `${h.id}: ${h.name}`, part: 'body',
    geometry: jscad.transforms.transform(m, h.shape.geometry), polygons: move(h.shape.polygons), triangles: move(h.shape.triangles),
    shape: `${h.shape.hash}:body`, hash: `${h.shape.hash}:body`, local: h.shape.polygons, localTriangles: h.shape.triangles, m,
    hardware: { kind: h.kind, name: h.name, fasten: h.fasten, screw: h.screw, thread: h.thread, grams: h.grams, from: h.label, length: h.length, head: h.head }, moves: h.hostItem, with: h.with, lift, allow: h.allow };
}

const CODES = ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access'];
// fasten.access for one screw, with the order of assembly: a part over the head that goes on later is no trouble
function accessSays(sc, rel, order) {
  const acc = sc.access, t = acc.tool, values = { key: t.size, radius: t.radius, reach: t.reach };
  if (!acc.blockers.length) return { level: 'pass', text: `${an(t.name)} ${t.name} reaches the head along its axis: nothing within ${mm(t.radius)} mm of it for ${mm(t.reach)} mm over the head (${t.rests[0]}, ${t.rests[1]})`, values };
  const names = (list) => list.map((b) => `${b.item} (${mm(b.z)} mm over the head)`).join(' and ');
  const stuck = order?.stuck?.fasten === rel.index && order.stuck.screws?.includes(sc.index) ? order.stuck : null;
  if (stuck) {
    const b = acc.blockers.find((x) => x.item === stuck.wall) ?? acc.blockers[0], tail = stuck.text.split(`${stuck.wall} stands over it`)[1] ?? '';
    return { level: 'fail', text: `${an(t.name)} ${t.name} cannot reach the head: ${b.item} stands over it, ${mm(b.z)} mm up the screw's axis${tail}${t.size && acc.tilt == null && /hex key/.test(t.name) ? `, and a ball-end key tilted ${mm(peekRuleSet('hexkey').rules.ball_end_tilt.value)}° does not clear it either` : ''}. Move the screw, open a way through ${b.item}, or fit ${b.item} after`, values: { ...values, distance: b.z }, wall: b.item };
  }
  const step = (id) => order?.steps?.find((st) => st.items.includes(id))?.n, last = Math.max(...[...rel.through, rel.into].map((n) => step(top(n)) ?? Infinity));
  const after = order && !order.stuck && acc.blockers.every((b) => step(b.item) > last);
  if (acc.tilt != null && !after) return { level: 'warn', text: `only a ball-end ${t.name} reaches the head, tilted up to ${mm(acc.tilt)}° (hexkey.ball_end_tilt): ${names(acc.blockers)} stand${acc.blockers.length > 1 ? '' : 's'} on the straight line, and a ball end takes less torque than a straight key`, values: { ...values, tilt: acc.tilt } };
  return { level: 'pass', text: `${an(t.name)} ${t.name} reaches the head before ${acc.blockers.map((b) => `${b.item}${step(b.item) ? ` (step ${step(b.item)})` : ''}`).join(' and ')} goes on over it`, values: { ...values, distance: acc.blockers[0].z } };
}
const RANK = { fail: 0, warn: 1, info: 2, pass: 3 };
// fasten.load for one relation: what it carries, the screw that takes the most against its strength, and slipping
function loadSays(s, f, rel, lead) {
  const L = rel.load; if (!L) return;
  const refs = { fasten: rel.index, screw: rel.screw, through: rel.through, into: rel.into, screws: rel.screws.map((sc) => sc.name), ...(s.pose ? { pose: s.pose } : {}) };
  if (L.closed) return f('info', `${lead}: ${[...rel.through, rel.into].join(' and ')} are held to the ground by other ways too, so what this joint carries is not shared out to its screws`, null, { code: 'fasten.load', refs });
  if (L.skew) return f('info', `${lead}: the screws do not stand parallel, so the load is not shared out between them`, null, { code: 'fasten.load', refs });
  const n = rel.screws.length, w = L.worst, who = (x) => (n > 1 ? `screw ${x.sc.index + 1} (${x.sc.name})` : 'the screw'), r1 = (x) => +x.toFixed(1);
  const equal = L.torques.length && L.screws.every((x) => Math.abs(x.shear - L.screws[0].shear) < 1e-6);
  const motor = L.torques.map((q) => `${q.id}'s ${mm(+q.torque.toFixed(3))} N m about its shaft (what it gives at its working speed), ${mm(r1(L.share))} N ${n > 1 ? 'on each screw' : 'on the screw'} from that alone`).join(' and ');
  const carries = `${L.beyond.join(', ')}, ${mm(+L.kg.toFixed(3))} kg${L.hung ? ` with the load${L.hung > 1 ? 's' : ''} hung on ${L.beyond.length > 1 ? 'them' : 'it'}` : ''}${motor ? `, and ${motor}` : ''}`;
  const x0 = w.r.findings[0], rests = L.rests.length ? ` It rests on estimates: ${L.rests.join(', ')}` : '';
  const values = { margin: w.r.margin === Infinity ? null : w.r.margin, tension: r1(Math.max(0, w.tension)), shear: r1(w.shear), preload: w.r.preload.force, torque: w.r.preload.torque, kg: +L.kg.toFixed(4), ...(L.share != null ? { share: L.share } : {}),
    screws: L.screws.map((x) => ({ screw: x.sc.name, tension: r1(Math.max(0, x.tension)), shear: r1(x.shear), margin: x.r.margin === Infinity ? null : x.r.margin })) };
  f(x0.level, `${lead} carry ${carries}: ${who(w)} takes the most: ${x0.text}${L.tighten != null && rel.torque == null ? `. Tighten to ${mm(L.tighten)} N m` : ''}.${rests}`, x0.level === 'pass' ? null : `${rel.label}: load`,
    { code: 'fasten.load', at: w.sc.at.map(r3), between: w.sc.between.map((p) => p.map(r3)), values, refs: { ...refs, rests: L.rests, ...(equal ? { each: true } : {}) } });
  if (L.slip) { const y = L.slip.r.findings[1]; f(y.level, `${lead}: ${who(L.slip)}: ${y.text}`, y.level === 'pass' ? null : `${rel.label}: slips`, { code: 'fasten.load', at: L.slip.sc.at.map(r3), values: y.values, refs }); }
  if (L.turns != null) f('warn', `${lead}: a twist of ${mm(L.turns)} N m about the one screw is held by friction alone: a second screw would hold it by shear`, `${rel.label}: turns`, { code: 'fasten.load', values: { turns: L.turns }, refs });
}
/**
 * The fasten findings of an assembly, in its findings shape: each relation's screws said together where they agree,
 * one by one where they do not, each with `at` (under the head) and `between` (head to tip) so a viewer points at the screw.
 * @param {object} s a built assembly (or one of its poses) @param {Function} f the check's f(level, text, card, extra)
 * @param {{ placeItems: Function }} helpers
 */
export function fastenChecks(s, f, { placeItems }) {
  if (!s.a.fasten?.length) return;
  const r = s.fastened ?? fastenOf(s, placeItems(s.motion, s.jointValues));
  // the key's way, in the build pose: with the order, which places a part that covers a head after the screw
  const built = s.pose == null || s.pose === s.motion.pose, wanted = built && r.relations.some((rel) => rel.screws.some((sc) => sc.access?.blockers.length));
  const order = wanted && isBuilt(s) ? orderOf(s) : null, access = new Map();
  if (built) for (const rel of r.relations) for (const sc of rel.screws) if (sc.access) access.set(sc, [accessSays(sc, rel, order)]);
  for (const rel of r.relations) {
    const n = rel.screws.length, lead = `${rel.label}, ${n === 1 ? `${an(rel.screw)} ${rel.screw} screw` : `${n} ${rel.screw} screws`}`;
    for (const g of rel.general) f(g.level, `${rel.label}: ${g.text}`, `${rel.label}: no screws`, { code: g.code, refs: { fasten: rel.index, through: rel.through, into: rel.into } });
    for (const code of CODES) {
      const groups = new Map();
      for (const sc of rel.screws) for (const x of (code === 'fasten.access' ? access.get(sc) : sc.found[code]) || []) {
        const key = `${x.level}|${x.text}`;
        if (!groups.has(key)) groups.set(key, { ...x, screws: [] });
        groups.get(key).screws.push(sc);
      }
      for (const g of [...groups.values()].sort((a, b) => RANK[a.level] - RANK[b.level])) {
        const all = g.screws.length === n, first = g.screws[0], who = all ? lead : `${rel.label}, ${g.screws.map((sc) => `screw ${sc.index + 1} (${sc.name})`).join(', ')}`;
        f(g.level, `${who}: ${g.text}`, g.level === 'pass' || g.level === 'info' ? null : `${rel.label}: ${code.split('.')[1]}`,
          { code, at: first.at.map(r3), between: first.between.map((p) => p.map(r3)), ...(g.values ? { values: g.values } : {}),
            refs: { ...(g.wall ? { wall: g.wall } : {}), fasten: rel.index, screw: rel.screw, through: rel.through, into: rel.into, screws: g.screws.map((sc) => sc.name), ...(g.screws.length > 1 ? { places: g.screws.map((sc) => sc.at.map(r3)) } : {}), ...(s.pose ? { pose: s.pose } : {}) } });
      }
    }
    loadSays(s, f, rel, lead);
  }
}

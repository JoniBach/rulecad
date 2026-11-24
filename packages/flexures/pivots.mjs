// Rigid links joined by short flexures: the drawing, the clearances and the large-deflection check that the linkages
// (four-bar, slider-crank) and the amplifiers (lever, bridge, rhombus) share. Each joint is a small-length flexural
// pivot (Howell, Compliant Mechanisms, 2001, section 5.2): a short thin strip whose middle is the pin of the rigid
// mechanism it stands for, as stiff in turning as ∫ dx / EI along it. Its ends round into a knuckle, a disc on each
// body, and the bodies' bars run between their knuckles. Units: mm, N, MPa, radians.
//
// The modules that build on this one import it; it imports only core.mjs and beams.mjs, so there is no loop (#278).
import jscad from '@jscad/modeling';
import { beamProfile } from './core.mjs';
import { beamSystem, equilibrium } from './beams.mjs';

const { circle, polygon } = jscad.primitives;
const { union } = jscad.booleans;
const { hull } = jscad.hulls;
const { extrudeLinear } = jscad.extrusions;

export const KNUCKLE = 96; // sides to a knuckle's disc: fine, so a flexure's rounds meet it smoothly
export const n2 = (x, d = 2) => String(Number(Number(x).toFixed(d)));
export const rad = Math.PI / 180;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
export const len = (a) => Math.hypot(a[0], a[1]), unit = (a) => mul(a, 1 / len(a));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * A round for an inside corner at (x, y): the r × r square in the empty quarter (sx, sy) less a circle, as one outline.
 * @param {number} x @param {number} y @param {1 | -1} sx @param {1 | -1} sy @param {number} r
 */
export function cornerRound(x, y, sx, sy, r) {
  const e = 0.01, cx = x + sx * r, cy = y + sy * r, pts = [[x - sx * e, y - sy * e], [cx, y - sy * e]]; // into the material a little, so no edge lies along another
  for (let i = 0; i <= 24; i++) { const a = (Math.PI / 2) * (i / 24); pts.push([cx - sx * r * Math.sin(a), cy - sy * r * Math.cos(a)]); }
  pts.push([x - sx * e, cy]);
  return polygon({ points: sx * sy > 0 ? pts : pts.reverse() });
}
const rot = (a, phi) => [a[0] * Math.cos(phi) - a[1] * Math.sin(phi), a[0] * Math.sin(phi) + a[1] * Math.cos(phi)];

/**
 * A size checked by name: a number above 0, or the default when none is given.
 * @param {string} what @param {object} o @param {string} k @param {string} label @param {number} [d]
 */
export function size(what, o, k, label = k, d) {
  const v = o?.[k] ?? d;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`${what}: ${label} is a size above 0 (got ${JSON.stringify(o?.[k])})`);
  return v;
}

/**
 * The joints' flexure, checked: its length between the knuckles (where its rounds end), its thickness and the round
 * at each end; the knuckle a disc of radius `knuckle` on each body. The rounds end on the knuckle's circle, so the
 * strip meets its disc nearly tangent (no square inside corner): `sink` is how far inside the disc's edge, on the
 * strip's line, the strip's end lies.
 * @param {string} what @param {{ length: number, thickness: number, fillet?: number }} flex @param {number} knuckle
 */
export function flexOf(what, flex, knuckle) {
  if (!flex || typeof flex !== 'object') throw new Error(`${what}: flex is an object { length, thickness, fillet? }: each joint's flexure`);
  const l = size(what, flex, 'length', 'flex.length'), t = size(what, flex, 'thickness', 'flex.thickness'), r = flex.fillet ?? 1;
  if (!(typeof r === 'number' && r >= 0)) throw new Error(`${what}: flex.fillet is the round where a joint's flexure meets its knuckle, 0 or more (got ${JSON.stringify(flex.fillet)})`);
  if (2 * r >= l) throw new Error(`${what}: flex.fillet ${r} leaves no flexure between the rounds of a ${l} mm flex.length: a fillet under ${n2(l / 2)}`);
  if (t / 2 + r >= knuckle) throw new Error(`${what}: the knuckle (${knuckle} mm radius) is narrower than the flexure's rounded end (${n2(t / 2 + r)}): a wider bar, or a smaller flex.fillet`);
  const inner = knuckle * Math.cos(Math.PI / KNUCKLE); // the drawn knuckle's sides lie this far from its middle
  const sink = knuckle - Math.sqrt(inner * inner - (t / 2 + r) ** 2), reach = l / 2 + knuckle - sink; // from the pivot to each knuckle's middle
  return { l, t, r, rk: knuckle, sink, reach, half: beamProfile({ length: l, thickness: t, fillet: r }, 'guided') };
}

/**
 * A joint's flexure as a pivot: its stiffness in turning (N·mm a radian), integrated along its rounded profile, and
 * the most strain a radian puts in it (at its thinnest, under the same moment all along). Without rounds these are
 * EI / l and t / 2l, the small-length flexural pivot's (Howell 2001).
 * @param {ReturnType<typeof flexOf>} fx @param {number} W the width (up the print) @param {number} E MPa
 */
export function pivotModel(fx, W, E) {
  const n = 400, ds = fx.l / n;
  let flex = 0;
  for (let i = 0; i < n; i++) flex += ds / ((E * W * (2 * fx.half((i + 0.5) * ds)) ** 3) / 12);
  const K = 1 / flex, perRad = (K * fx.t / 2) / ((E * W * fx.t ** 3) / 12);
  return { K, perRad, strain: (psi) => perRad * Math.abs(psi), angle: (e) => e / perRad };
}

/**
 * A joint's axis: the line its flexure lies on, halfway between its two links, so each link leaves its knuckle at
 * the same angle to it, never more than 90°. From the pivot toward the body after it.
 * @param {string} what @param {string} name @param {number[]} P @param {number[]} prev a point on the body before
 * @param {number[]} next a point on the body after
 */
export function axisOf(what, name, P, prev, next) {
  const a = unit(sub(prev, P)), b = unit(sub(next, P)), d = sub(b, a);
  if (len(d) < 0.05) throw new Error(`${what}: at joint ${name} the two links fold onto each other (they leave it ${n2(Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1])) / rad, 1)}° apart): no room for its flexure`);
  return unit(d);
}

// A round for an inside corner where bars meet at a knuckle: the knuckle's disc hulled with discs a bar's width
// along each bar, so the corner between two bars opens to more than 90°
function web(c, dirs, rb) {
  if (dirs.length < 2) return null;
  return hull(circle({ radius: rb, center: c, segments: KNUCKLE }), ...dirs.map((d) => circle({ radius: rb, center: add(c, mul(d, 2 * rb)), segments: KNUCKLE })));
}

/**
 * The drawing: every body (its knuckles, the bars between them and any extra outline) and every joint's flexure, in
 * the plane, then one extrusion (JSCAD's 2D unions keep their volume where 3D unions of parts side by side lose it).
 * @param {{ W: number, fx: ReturnType<typeof flexOf>, bw: number, joints: { name: string, P: number[], w: number[], prev: string, next: string }[],
 *   bodies: Record<string, { knuckles: number[][], bars: number[][], extra?: object[], bar?: number }> }} k
 *   bars: index pairs into knuckles; bar: this body's bar width (default bw)
 * @returns {object} a JSCAD geom3, from z = 0 to W
 */
export function draw(k) {
  const parts = [];
  for (const b of Object.values(k.bodies)) {
    const rb = (b.bar ?? k.bw) / 2, out = b.knuckles.map(() => []);
    for (const c of b.knuckles) parts.push(circle({ radius: Math.max(rb, k.fx.rk), center: c, segments: KNUCKLE }));
    for (const [i, j] of b.bars) {
      const A = b.knuckles[i], B = b.knuckles[j];
      parts.push(hull(circle({ radius: rb, center: A, segments: KNUCKLE }), circle({ radius: rb, center: B, segments: KNUCKLE })));
      out[i].push(unit(sub(B, A))); out[j].push(unit(sub(A, B)));
    }
    b.knuckles.forEach((c, i) => { const g = web(c, out[i], rb); if (g) parts.push(g); });
    for (const g of b.extra ?? []) parts.push(g);
  }
  for (const j of k.joints) parts.push(strip(k.fx, j.P, j.w));
  return extrudeLinear({ height: k.W }, union(...parts));
}

// A joint's flexure: its profile along w about the pivot, running on into both knuckles to their middles
function strip(fx, P, w) {
  const n = [-w[1], w[0]], m = 80, into = fx.rk - fx.sink, end = fx.t / 2 + fx.r, top = [], bottom = [];
  const at = (s, h) => add(P, add(mul(w, s - fx.l / 2), mul(n, h)));
  const fine = fx.r ? Array.from({ length: 33 }, (_, i) => (fx.r * i) / 32) : []; // the rounds, finely, so they meet the knuckle smoothly
  const ss = [-into, ...[...new Set([...Array.from({ length: m + 1 }, (_, i) => (fx.l * i) / m), ...fine, ...fine.map((x) => fx.l - x)])].sort((a, b) => a - b), fx.l + into];
  for (const s of ss) { const h = s < 0 || s > fx.l ? end : fx.half(s); top.push(at(s, h)); bottom.push(at(s, -h)); }
  return polygon({ points: [...bottom, ...top.reverse()] });
}

// Where a body's points go when it moves: the rigid move that takes two of its points at rest to where they are now
// (one point: a shift only)
export function moveOf(rest, now) {
  if (rest.length === 1) { const d = sub(now[0], rest[0]); return (p) => add(p, d); }
  const phi = Math.atan2(now[1][1] - now[0][1], now[1][0] - now[0][0]) - Math.atan2(rest[1][1] - rest[0][1], rest[1][0] - rest[0][0]);
  return (p) => add(now[0], rot(sub(p, rest[0]), phi));
}

// The least distance between two segments
function segDist(a, b, c, d) {
  const pt = (p, q, r) => { const qr = sub(r, q), L2 = qr[0] ** 2 + qr[1] ** 2, u = L2 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * qr[0] + (p[1] - q[1]) * qr[1]) / L2)) : 0; return len(sub(p, add(q, mul(qr, u)))); };
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return 0;
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}

/**
 * How near the parts come to each other in one pose: each body as capsules (its bars and knuckles), each flexure as
 * one between its knuckles; every pair that no flexure joins directly is measured (a flexure against bodies other
 * than its two). The least gap and between what.
 * @param {Parameters<typeof draw>[0]} k @param {Record<string, (p: number[]) => number[]>} [moves] each body's move
 *   (none: at rest)
 * @returns {{ gap: number, between: string[], at: number[] }}
 */
export function clearance(k, moves = {}) {
  const caps = [];
  for (const [name, b] of Object.entries(k.bodies)) {
    const mv = moves[name] ?? ((p) => p), K = b.knuckles.map(mv), rb = (b.bar ?? k.bw) / 2;
    K.forEach((c) => caps.push({ owner: name, a: c, b: c, r: Math.max(rb, k.fx.rk) }));
    for (const [i, j] of b.bars) caps.push({ owner: name, a: K[i], b: K[j], r: rb });
    for (const s of b.capsules ?? []) caps.push({ owner: name, a: mv(s.a), b: mv(s.b), r: s.r });
  }
  for (const j of k.joints) {
    const A = (moves[j.prev] ?? ((p) => p))(sub(j.P, mul(j.w, j.reach ?? k.fx.reach))), B = (moves[j.next] ?? ((p) => p))(add(j.P, mul(j.w, j.reach ?? k.fx.reach)));
    const u = unit(sub(B, A)), inset = k.fx.rk - k.fx.sink + k.fx.r; // the thin part, between its rounds
    caps.push({ owner: `flexure ${j.name}`, joint: j, a: add(A, mul(u, inset)), b: sub(B, mul(u, inset)), r: k.fx.t / 2 });
  }
  let best = { gap: Infinity, between: [], at: [0, 0] };
  for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
    const p = caps[i], q = caps[j];
    if (p.owner === q.owner) continue;
    const fl = p.joint ?? q.joint, other = p.joint ? q : p;
    if (fl && (other.joint || other.owner === fl.prev || other.owner === fl.next)) continue; // a flexure and its own bodies, or two flexures
    const g = segDist(p.a, p.b, q.a, q.b) - p.r - q.r;
    if (g < best.gap) best = { gap: g, between: [p.owner, q.owner], at: mul(add(add(p.a, p.b), add(q.a, q.b)), 0.25) };
  }
  return best;
}

/**
 * The linkage as beams that bend as far as they bend (beams.mjs): each body rigid, each joint's flexure a chain of
 * beam elements along its rounded profile. For checking the pseudo-rigid-body model's sums at large angles.
 * @param {Parameters<typeof draw>[0]} k @param {number} E MPa @param {Record<string, number[]>} at each moving
 *   body's reference point @param {string} ground the body that is held
 * @returns {ReturnType<typeof beamSystem>}
 */
export function beamsOf(k, E, at, ground) {
  const bodies = { [ground]: { at: [0, 0], fixed: true } };
  for (const name of Object.keys(k.bodies)) if (name !== ground) bodies[name] = { at: at[name] };
  const spans = 12, beams = k.joints.map((j) => {
    const path = Array.from({ length: spans + 1 }, (_, i) => add(j.P, mul(j.w, (k.fx.l * i) / spans - k.fx.l / 2)));
    const thickness = Array.from({ length: spans }, (_, i) => 2 * k.fx.half(((i + 0.5) * k.fx.l) / spans));
    return { name: j.name, path, thickness, width: k.W, E, from: j.prev, to: j.next };
  });
  return beamSystem({ bodies, beams, segments: 24 });
}

/**
 * Steps a held unknown from 0 to a value, each step from the last one's answer, and returns the last.
 * @param {ReturnType<typeof beamSystem>} sys @param {Map<number, number>} held the unknowns held and where to, at the end
 * @param {number} [steps]
 */
export function stepTo(sys, held, steps = 8) {
  let q, r;
  for (let i = 1; i <= steps; i++) {
    r = equilibrium(sys, { held: new Map([...held].map(([d, v]) => [d, (v * i) / steps])), start: q, iterations: 80 });
    q = r.q;
  }
  return r;
}

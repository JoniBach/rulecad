// Two more things that click over and stay, beside the tilted-leaf bistable and the buckled switch (bistables.mjs),
// each from the source that names it, its force curve from the beam solver (beams.mjs) on the drawn parts.
//
// - The Young bistable mechanism (Jensen, Howell and Roach, US 6215081, 2001, FIGS. 4a to 5b): two links. The base
//   carries two pins; the other link is two compliant arms joined by a rigid coupler, each arm turning on its own pin
//   at one end and fixed into the coupler at the other (class I: both arms fixed-pinned segments). Its
//   pseudo-rigid-body model is a four-bar with torsion springs at the coupler's two joints only, since the pins are
//   free. Turned over, the long arm bends, and the link rests again with that arm bent (the patent's "force loaded"
//   second position, FIG. 4b).
// - The tensural bistable (Howell and Masters, US 7126446, 2006, FIGS. 1 to 3, whose thin segments it calls
//   "tensural pivots", loaded in bending and axial tension; the class is Wilcox and Howell's, FTBM, 2005): a thin
//   segment from the base's anchor out to one end of a thick compressive segment, which runs back past both anchors
//   to a second thin segment, which comes in to the shuttle's anchor. At rest the thin segments are straight and on
//   one line, tilted a little from square to the shuttle's travel. Pushed through, the line must pass square, where
//   the anchors are nearer each other along it than the chain allows: the thin segments are stretched and the thick
//   one squeezed. So it holds by tension, and no thin part is loaded in compression to buckle.
//
// Drawn flat like every flexure here: the plan in x and y, the print from z = 0 up to the width. Units: mm, N, MPa.
import jscad from '@jscad/modeling';
import { pinModel, holeModel } from '@rulecad/fixings';
import { beamProfile, printable, need } from './core.mjs';
import { beamSystem, equilibrium } from './beams.mjs';
import { beamOutline, spansOf, readCurve } from './bistables.mjs';
import { size, n2, rad, sub, add, mul, len, wrap, cornerRound } from './pivots.mjs';

const { polygon, rectangle, circle, cylinder, cuboid } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { hull } = jscad.hulls;
const { extrudeLinear } = jscad.extrusions;
const { translate, mirrorZ } = jscad.transforms;
const { measureVolume } = jscad.measurements;

const SEG = 64;
const M3 = () => holeModel('M3', { kind: 'clearance' }).diameter; // a screw hole to fix a ground to a board
const dir = (deg) => [Math.cos(deg * rad), Math.sin(deg * rad)];
const rect = (x0, x1, y0, y1) => rectangle({ size: [x1 - x0, y1 - y0], center: [(x0 + x1) / 2, (y0 + y1) / 2] });
// A pad at a beam's end, square to the beam, so the beam's rounds meet a flat face (as in bistables.mjs)
const pad = (at, u, along, across) => { const n = [-u[1], u[0]], c = add(at, mul(u, along / 2)); return polygon({ points: [add(sub(c, mul(u, along / 2)), mul(n, across / 2)), sub(sub(c, mul(u, along / 2)), mul(n, across / 2)), sub(add(c, mul(u, along / 2)), mul(n, across / 2)), add(add(c, mul(u, along / 2)), mul(n, across / 2))] }); };
const segDist = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2))); return len(sub(p, add(a, mul(ab, t)))); };
const moved = (p, at, q) => { const c = Math.cos(q[2]), s = Math.sin(q[2]), o = sub(p, at); return [at[0] + q[0] + c * o[0] - s * o[1], at[1] + q[1] + s * o[0] + c * o[1]]; };

// ------------------------------------------------------------------------------------------------ Young bistable

/**
 * @typedef {{ spacing: number, thickness: number, width: number, long?: number, short?: number, longAngle?: number,
 *   shortAngle?: number, fillet?: number, hub?: number, hook?: number, base?: number, gap?: number, pin?: string }} YoungBistable
 *   spacing: the two pins' centres apart (mm), the base link; thickness, width: the arms'; long, short: each arm from
 *   its pin's centre to where it is fixed into the coupler (default 2.26 and 0.92 spacings); longAngle, shortAngle:
 *   each arm's direction at rest, degrees anticlockwise from the line from the long arm's pin to the short arm's
 *   (default 131.7 and 94.4). The defaults are the proportions of the patent's FIG. 4a as measured off the drawing
 *   (it gives no dimensions): an estimate of its layout. fillet: the arms' rounds into hub and coupler (default 1);
 *   hub: each hub's radius (default 3.5); hook: how far the coupler runs on past the long arm's end before it turns
 *   back (default 8, the patent's hook 146: it keeps the coupler clear of the arm); base: the ground bar's thickness
 *   (default 3); gap: the least air (default 0.3); pin: the pins, by name (default a filament pin as long as the bar,
 *   the gap and the hub less 0.5)
 */
function youngLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the mechanism's parameters (spacing, thickness, width)`);
  const g = size(what, p, 'spacing'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), rh = size(what, p, 'hub', 'hub', 3.5), e = size(what, p, 'hook', 'hook', 8), hb = size(what, p, 'base', 'base', 3), gap = size(what, p, 'gap', 'gap', 0.3);
  const lL = size(what, p, 'long', 'long', 2.26 * g), lS = size(what, p, 'short', 'short', 0.92 * g), r = p.fillet ?? 1;
  const aL = p.longAngle ?? 131.7, aS = p.shortAngle ?? 94.4;
  for (const [k, v] of [['longAngle', aL], ['shortAngle', aS]]) if (!(typeof v === 'number' && v > 0 && v < 180)) throw new Error(`${what}: ${k} is the arm's direction at rest in degrees, above 0 and under 180 (got ${JSON.stringify(p[k])}): both arms stand on the same side of the pins' line`);
  if (!(typeof r === 'number' && r >= 0)) throw new Error(`${what}: fillet is the arms' rounds, 0 or more (got ${JSON.stringify(p.fillet)})`);
  const pw = t + 2 * r + 2; // a pad's width across an arm
  if (rh < pw / 2) throw new Error(`${what}: hub ${rh} is narrower than an arm's pad (${n2(pw / 2)} mm round): ${n2(pw / 2)} or more`);
  if (g < 2 * rh + 2 * gap + 2) throw new Error(`${what}: spacing ${g} leaves the two hubs (radius ${rh}) under 2 mm apart: ${n2(2 * rh + 2 * gap + 2)} or more`);
  if (g < 2 * rh + 8) throw new Error(`${what}: spacing ${g} leaves no room between the hubs (radius ${rh}) for the ground's second foot, 4 mm long and 2 mm off each: ${n2(2 * rh + 8)} or more`);
  for (const [k, v] of [['long', lL], ['short', lS]]) if (v - rh <= 2 * r + t + 2) throw new Error(`${what}: ${k} ${v} leaves the arm ${n2(v - rh)} mm past its hub: over ${n2(rh + 2 * r + t + 2)}`);
  const A = [0, 0], B = [g, 0], uL = dir(aL), uS = dir(aS), Pt = mul(uL, lL), Pb = add(B, mul(uS, lS)), H = add(Pt, mul(uL, e));
  if (len(sub(Pt, Pb)) < pw + 2 * gap) throw new Error(`${what}: the arms' ends are ${n2(len(sub(Pt, Pb)))} mm apart, too near to join with a coupler`);
  // The pin: through the hub (a slip fit, it turns) into the ground bar (a press fit); its bottom 0.5 above the table
  const pinName = p.pin ?? `filament pin 1.75x${n2(hb + gap + W - 0.5, 1)}`;
  const slip = pinModel(pinName, { fit: 'slip' }), press = pinModel(pinName, { fit: 'press' });
  if (slip.length > hb + gap + W + 1e-9) throw new Error(`${what}: the pin ${slip.name} is longer than the bar, the gap and the hub (${n2(hb + gap + W)} mm): it would stand on the table`);
  if (slip.hole.diameter > 2 * rh - 2) throw new Error(`${what}: the pin's ${slip.hole.diameter} mm hole leaves under 1 mm of hub round it: a bigger hub`);
  const arm = (from, u, l) => { const a = add(from, mul(u, rh)), L = l - rh; return { a, b: add(from, mul(u, l)), u, L, half: beamProfile({ length: L, thickness: t, fillet: r }, 'guided') }; };
  return { g, t, W, rh, e, hb, gap, r, pw, lL, lS, aL, aS, A, B, uL, uS, Pt, Pb, H, slip, press, long: arm(A, uL, lL), short: arm(B, uS, lS) };
}
// The mover's flat parts: the hubs (each with its arm's pad), the arms, and the coupler (its hook from the long arm's
// end on to H, then a bar from H to the short arm's end)
function youngFlat(k) {
  const hubs = [[k.A, k.uL], [k.B, k.uS]].map(([c, u]) => subtract(hull(circle({ radius: k.rh, center: c, segments: SEG }), pad(add(c, mul(u, k.rh)), mul(u, -1), 1, k.pw)), circle({ radius: k.slip.hole.diameter / 2, center: c, segments: SEG })));
  const arms = [k.long, k.short].map((m) => beamOutline(m.a, m.b, m.half, m.L, k.t, 0.5, k.r));
  const hook = pad(k.Pt, k.uL, k.e, k.pw), bar = hull(circle({ radius: k.pw / 2, center: k.H, segments: SEG }), pad(k.Pb, k.uS, 2, k.pw));
  return { hubs, arms, coupler: union(hook, bar) };
}
// The ground: a bar over both pins, run on past the short arm's pin to an end foot (with a screw hole, to fix it to a
// board), and a second foot between the pins, clear of both hubs, so it stands on the table by itself with its centre
// of mass between the two (the long arm swings out past its own pin's far side, so the second foot goes inboard of
// it). Printed on its back: the bar on the bed, the feet standing up, the corners between them rounded
function youngGround(k) {
  const x0 = -k.rh - 1, f0 = k.g + k.rh + 3, f1 = f0 + 10, bw = 2 * k.rh + 2, H = k.hb + k.gap + k.W, fr = 1.5;
  const m0 = k.rh + 2, m1 = Math.min(k.rh + 10, k.g - k.rh - 2); // the second foot: 2 mm off each hub, up to 8 long
  const round = (x, side) => subtract(rect(side > 0 ? x : x - fr, side > 0 ? x + fr : x, k.hb, k.hb + fr), circle({ radius: fr, center: [x + side * fr, k.hb + fr], segments: 32 }));
  const prof = union(rect(x0, f1, 0, k.hb), rect(f0, f1, 0, H), round(f0, -1), rect(m0, m1, 0, H), round(m0, -1), round(m1, 1));
  const solid = jscad.transforms.rotateX(Math.PI / 2, extrudeLinear({ height: bw }, prof)); // the profile in x and z, bw across y
  const body = translate([0, bw / 2, 0], solid);
  const holes = [k.A, k.B].map((c) => cylinder({ radius: k.press.hole.diameter / 2, height: k.hb + 2, center: [c[0], c[1], k.hb / 2], segments: 32 }));
  const screw = cylinder({ radius: M3() / 2, height: H + 2, center: [(f0 + f1) / 2, 0, H / 2], segments: 32 }); // an M3's clearance hole, as @rulecad/fixings draws it
  return { solid: subtract(body, ...holes, screw), feet: [[f0, f1, -bw / 2, bw / 2], [m0, m1, -bw / 2, bw / 2]], height: H };
}

/**
 * A Young bistable mechanism, class I (YoungBistable above), drawn at rest: the mover (two hubs, two arms and the
 * coupler, one piece printed flat), the ground (a bar over the pins on two feet, printed on its back) and two pins.
 * Assembled, the mover lies on the table and the ground's bar sits over its hubs, a gap above, so the pins can't
 * lift out.
 * @param {YoungBistable} p
 * @param {{ part?: 'all' | 'mover' | 'ground' }} [o] all: as assembled, the ground turned over above the mover;
 *   mover and ground: each as printed
 * @returns {object} a JSCAD geom3
 */
export function youngBistable(p, { part = 'all' } = {}) {
  const k = youngLayout(p, 'youngBistable');
  if (!['all', 'mover', 'ground'].includes(part)) throw new Error(`youngBistable: part is all, mover or ground (got ${JSON.stringify(part)})`);
  const f = youngFlat(k), mover = extrudeLinear({ height: k.W }, union(...f.hubs, ...f.arms, f.coupler)), ground = youngGround(k);
  if (part === 'mover') return mover;
  if (part === 'ground') return ground.solid;
  return union(mover, translate([0, 0, ground.height], mirrorZ(ground.solid)));
}

// The pseudo-rigid-body model (the patent's FIG. 5b): pins at A and B, the arms' characteristic pivots γ l along them,
// springs γ Kθ EI / l there and none at the pins. The long arm's pseudo-link turned in half-degree steps, the coupler
// found on the branch it starts on; the energy in units of K, where the two arms are alike but for length
function youngPRB(k, sense, gamma = 0.85) {
  const r2 = gamma * k.lL, r4 = gamma * k.lS, P0 = mul(k.uL, r2), Q0 = add(k.B, mul(k.uS, r4)), r3 = len(sub(Q0, P0)), r1 = k.g;
  const t20 = k.aL * rad, t40 = k.aS * rad, t30 = Math.atan2(Q0[1] - P0[1], Q0[0] - P0[0]), KA = 1 / k.lL, KB = 1 / k.lS; // (each K over γ Kθ E I, the same for both)
  let prev = { t3: t30 }, out = [];
  for (let i = 0; i <= 720; i++) {
    const t2 = t20 + sense * i * 0.5 * rad, C = [r2 * Math.cos(t2), r2 * Math.sin(t2)], d = len(sub(k.B, C));
    if (d > r3 + r4 || d < Math.abs(r3 - r4)) break;
    const base = Math.atan2(k.B[1] - C[1], k.B[0] - C[0]), gam = Math.acos(Math.max(-1, Math.min(1, (r3 * r3 + d * d - r4 * r4) / (2 * r3 * d))));
    const t3 = [base + gam, base - gam].sort((a, b) => Math.abs(wrap(a - prev.t3)) - Math.abs(wrap(b - prev.t3)))[0], D = add(C, [r3 * Math.cos(t3), r3 * Math.sin(t3)]), t4 = Math.atan2(D[1], D[0] - k.g);
    prev = { t3 };
    const pA = wrap(t3 - t2 - (t30 - t20)), pB = wrap(t4 - t3 - (t40 - t30));
    out.push({ turn: i * 0.5, coupler: sense * wrap(t3 - t30) / rad, V: 0.5 * (KA * pA * pA + KB * pB * pB), pA: pA / rad, pB: pB / rad });
  }
  const sorted = [r1, r2, r3, r4].sort((a, b) => a - b), grashof = sorted[0] + sorted[3] <= sorted[1] + sorted[2];
  const min = out.find((c, i) => i > 0 && i < out.length - 1 && c.V < out[i - 1].V && c.V <= out[i + 1].V) ?? null;
  return { r1, r2, r3, r4, grashof, second: min ? { turn: min.turn, coupler: min.coupler, long: min.pA, short: min.pB } : null, curve: out };
}

/**
 * What a Young bistable does, from the beam solver on its drawn arms (each hub on a pin, free to turn, the coupler
 * rigid): turned by a moment on the coupler from rest, the torque curve, the moment that switches it, the moment it
 * gives back past the middle, where it rests again, the arms' strain on the way and held there, the clearances
 * between the moving parts and the ground's feet over the whole swing, the pins, and the grams. Beside it the
 * patent's pseudo-rigid-body four-bar (γ 0.85, Kθ 2.65), for the class and a check on the second position.
 * @param {YoungBistable} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ steps?: number, to?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] to: how far
 *   the coupler is turned, degrees (default 80); steps: the curve's (default 80)
 * @returns {{ sense: number, snap: { turn: number, torque: number }, back: { turn: number, torque: number }, middle: number | null,
 *   second: number | null, bistable: boolean, strain: number, held: number, margin: number, hubs: { long: number, short: number } | null,
 *   clearance: { least: number, where: string }, prb: { r1: number, r2: number, r3: number, r4: number, grashof: boolean, second: { turn: number, coupler: number, long: number, short: number } | null },
 *   pins: { name: string, slip: number, press: number, grams: number }, curve: object[], grams: { mover: number, ground: number, pins: number, total: number } | null,
 *   findings: object[], rests: string[] }}
 *   turns in degrees of the coupler from rest (sense: +1 anticlockwise); torques in N·mm on the coupler; strain: the
 *   most on the way over; held: at the second position; margin: the limit over the most; hubs: each hub's turn on
 *   its pin at the second position; clearance: the least air between moving parts, or between them and the feet
 */
export function youngBistableModel(p, m, o = {}) {
  const what = 'youngBistableModel', k = youngLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const steps = o.steps ?? 80, to = o.to ?? 80;
  if (!(Number.isInteger(steps) && steps >= 10)) throw new Error(`${what}: steps is a whole number, 10 or more (got ${JSON.stringify(o.steps)})`);
  if (!(typeof to === 'number' && to > 0 && to <= 180)) throw new Error(`${what}: to is how far the coupler is turned, degrees above 0 and at most 180 (got ${JSON.stringify(o.to)})`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), lim = m.strainLimit;
  const mid = mul(add(k.Pt, k.Pb), 0.5), flat = youngFlat(k), ground = youngGround(k);
  const sys = beamSystem({
    bodies: { ground: { at: [0, 0], fixed: true }, 'long hub': { at: k.A }, 'short hub': { at: k.B }, coupler: { at: mid } },
    beams: [{ name: 'long arm', ...spansOf(k.long.a, k.long.b, k.long.half, k.long.L, 24), width: k.W, E: m.E, from: 'long hub', to: 'coupler' }, { name: 'short arm', ...spansOf(k.short.a, k.short.b, k.short.half, k.short.L, 16), width: k.W, E: m.E, from: 'short hub', to: 'coupler' }],
    pins: [{ name: 'long pin', at: k.A, from: 'ground', to: 'long hub', k: m.E * k.W }, { name: 'short pin', at: k.B, from: 'ground', to: 'short hub', k: m.E * k.W }],
    segments: 40,
  });
  const d = sys.body.coupler.dof + 2;
  const sweep = (sense) => {
    const curve = [], qs = [];
    let q, ok = true;
    for (let i = 1; i <= steps; i++) {
      const r = equilibrium(sys, { held: new Map([[d, sense * (to * i) / steps * rad]]), start: q, iterations: 100 });
      q = r.q; ok = ok && r.converged; qs.push(r.q);
      curve.push({ push: (to * i) / steps, force: sense * r.reaction.get(d), strain: Math.max(...Object.values(r.strain)) });
    }
    return { curve, qs, ok, ...readCurve(curve) };
  };
  // The way it snaps: the sense the patent's layout turns (anticlockwise), else the other if only that one does
  let sense = 1, sc = sweep(1);
  if (!sc.bistable) { const other = sweep(-1); if (other.bistable) { sense = -1; sc = other; } }
  const curve = sc.curve.map((c) => ({ turn: c.push, torque: c.force, strain: c.strain })), prb = youngPRB(k, sense);
  // Where it rests again: the solver at that turn, its strain held there and each hub's turn
  let held = null, hubs = null;
  if (sc.bistable) {
    const r = equilibrium(sys, { held: new Map([[d, sense * sc.second * rad]]), start: sc.qs[Math.min(steps - 1, Math.round((sc.second / to) * steps) - 1)], iterations: 100 });
    held = Math.max(...Object.values(r.strain));
    hubs = { long: r.q[sys.body['long hub'].dof + 2] / rad, short: r.q[sys.body['short hub'].dof + 2] / rad };
  }
  // Clearances over the swing (to the second position, or the whole sweep): each arm's nodes from the other hub, the
  // coupler's outline from both hubs, each arm from the coupler's bar (away from its own end), and all from the feet (and the hubs too)
  const cpts = jscad.geometries.geom2.toPoints(flat.coupler), last = sc.bistable ? Math.min(steps, Math.ceil((sc.second / to) * steps) + 1) : steps;
  let least = Infinity, where = '';
  const note = (v, w) => { if (v < least) { least = v; where = w; } };
  const footDist = (pt) => Math.min(...ground.feet.map(([fx0, fx1, fy0, fy1]) => Math.hypot(Math.max(fx0 - pt[0], 0, pt[0] - fx1), Math.max(fy0 - pt[1], 0, pt[1] - fy1))));
  // each hub turns in place: its pad's corners reach √(rh² + (pw / 2)²) from its pin, whichever way it faces
  for (const c of [k.A, k.B]) note(footDist(c) - Math.hypot(k.rh, k.pw / 2), 'a hub and the ground\'s feet');
  for (let i = 0; i < last; i++) {
    const q = sc.qs[i], cq = [q[sys.body.coupler.dof], q[sys.body.coupler.dof + 1], q[sys.body.coupler.dof + 2]], hA = add(k.A, [q[sys.body['long hub'].dof], q[sys.body['long hub'].dof + 1]]), hB = add(k.B, [q[sys.body['short hub'].dof], q[sys.body['short hub'].dof + 1]]);
    const Hm = moved(k.H, mid, cq), Pbm = moved(k.Pb, mid, cq), Ptm = moved(k.Pt, mid, cq);
    for (const n of sys.nodes) {
      const at = [n.at[0] + q[n.dof], n.at[1] + q[n.dof + 1]], own = n.beam === 'long arm' ? Ptm : Pbm, other = n.beam === 'long arm' ? hB : hA;
      note(len(sub(at, other)) - k.rh - k.t / 2, `the ${n.beam} and the ${n.beam === 'long arm' ? 'short' : 'long'} hub`);
      if (len(sub(at, own)) > k.pw + 2) note(segDist(at, Hm, Pbm) - k.pw / 2 - k.t / 2, `the ${n.beam} and the coupler`);
      note(footDist(at) - k.t / 2, `the ${n.beam} and the ground's feet`);
    }
    for (const pt of cpts) { const at = moved(pt, mid, cq); note(Math.min(len(sub(at, hA)), len(sub(at, hB))) - k.rh, 'the coupler and a hub'); note(footDist(at), 'the coupler and the ground\'s feet'); }
  }
  const most = sc.strain, margin = lim / most;
  const rests = ['the force curve is the beam solver\'s on the drawn arms, each hub free to turn on its pin, the coupler rigid and turned by a moment, free to move', 'the pins frictionless; the mover sliding on the table, its own weight\'s friction left out (a few grams)', 'the default proportions measured off the patent\'s FIG. 4a, a drawing with no dimensions: an estimate of its layout', `the pseudo-rigid-body constants γ 0.85 and Kθ 2.65 are the patent's`];
  const r1 = n2(prb.r1, 1), r2 = n2(prb.r2, 1), r3 = n2(prb.r3, 1), r4 = n2(prb.r4, 1);
  f('info', `class I (US 6215081: both compliant segments fixed-pinned, both in the one link): a four-bar r1 ${r1}, r2 ${r2}, r3 ${r3}, r4 ${r4} mm with springs at the coupler's joints only; ${prb.grashof ? 'Grashof' : 'non-Grashof'} (shortest and longest ${prb.grashof ? 'at most' : 'over'} the other two). ${prb.second ? `As a pseudo-rigid-body model it rests again with the coupler turned ${n2(prb.second.coupler, 1)}°, the long arm bent ${n2(Math.abs(prb.second.long), 1)}° and the short ${n2(Math.abs(prb.second.short), 1)}°` : 'As a pseudo-rigid-body model it has no second rest'}`, 'young.class', { values: { r1: prb.r1, r2: prb.r2, r3: prb.r3, r4: prb.r4, grashof: prb.grashof, second: prb.second } });
  if (sc.bistable) f('pass', `turned ${n2(sc.snap.push, 1)}° the coupler takes ${n2(sc.snap.force)} N·mm, the most; past ${n2(sc.middle, 1)}° it turns on by itself, with up to ${n2(-sc.back.force)} N·mm, and rests ${n2(sc.second, 1)}° from where it started, the long arm bent and holding it there. Back takes about ${n2(-sc.back.force)} N·mm`, 'young.snap', { values: { snap: sc.snap, back: sc.back, middle: sc.middle, second: sc.second, sense } });
  else f('fail', `it does not stay over: turned ${to}° either way the moment never falls below 0 (its least ${n2(sc.back.force)} N·mm), so it springs back. The patent's proportions (the defaults) do`, 'young.snap', { values: { snap: sc.snap, back: sc.back } });
  f(margin >= 2 ? 'pass' : margin >= 1 ? 'warn' : 'fail', `on the way over the arms see at most ${n2(most * 100, 2)}%${held != null ? ` and ${n2(held * 100, 2)}% held over` : ''}: ${n2(margin)} times under the limit of ${n2(lim * 100, 1)}%${margin >= 2 ? '' : margin >= 1 ? ', under the twice it should have: longer arms (a wider spacing) or thinner' : ': over it'}`, 'flexure.strain', { values: { strain: most, held, limit: lim, margin } });
  f(least >= k.gap ? 'pass' : 'fail', `over the swing the least air is ${n2(least)} mm, between ${where}${least >= k.gap ? '' : `: under the ${k.gap} mm gap, they meet`}`, 'young.clear', { values: { least, where } });
  if (!sc.ok) f('warn', 'the beam solver did not settle at every step: the torque curve is a guide only', 'young.solver');
  f('info', `${k.slip.name}, two: a ${k.slip.hole.diameter} mm slip hole in each hub, a ${k.press.hole.diameter} mm press hole in the ground's bar; the bar sits ${k.gap} mm over the hubs, so they can't lift off`, 'young.pins', { values: { pin: k.slip.name, slip: k.slip.hole.diameter, press: k.press.hole.diameter } });
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0) {
    const mv = (measureVolume(youngBistable(p, { part: 'mover' })) / 1000) * m.density, gr = (measureVolume(youngBistable(p, { part: 'ground' })) / 1000) * m.density, pins = 2 * k.slip.grams;
    grams = { mover: mv, ground: gr, pins, total: mv + gr + pins };
    f('pass', `${n2(mv, 1)} g mover and ${n2(gr, 1)} g ground printed${m.name ? ` in ${m.name}` : ''}, and ${n2(pins, 2)} g of pins: ${n2(grams.total, 1)} g`, 'young.mass', { values: grams });
  }
  return { sense, snap: { turn: sc.snap.push, torque: sc.snap.force }, back: { turn: sc.back.push, torque: sc.back.force }, middle: sc.middle, second: sc.second, bistable: sc.bistable, strain: most, held, margin, hubs, clearance: { least, where },
    prb: { r1: prb.r1, r2: prb.r2, r3: prb.r3, r4: prb.r4, grashof: prb.grashof, second: prb.second }, pins: { name: k.slip.name, slip: k.slip.hole.diameter, press: k.press.hole.diameter, grams: k.slip.grams }, curve, grams, findings: out, rests };
}

// ---------------------------------------------------------------------------------------------- tensural bistable

// The least distance from a point to an outline's edges (0 inside it)
function outlineDist(pt, outlines) {
  let best = Infinity;
  for (const o of outlines) {
    let inside = false;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
      const a = o[i], b = o[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      best = Math.min(best, segDist(pt, a, b));
    }
    if (inside) return 0;
  }
  return best;
}
const FOOT = 6; // mm: each foot of the compressive segment, along the line
const ccw = (pts) => (pts.reduce((a, q, i) => { const r = pts[(i + 1) % pts.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0) > 0 ? pts : pts.slice().reverse());

/**
 * @typedef {{ length: number, spacing: number, angle: number, thickness: number, width: number, depth?: number,
 *   fillet?: number, offset?: number, gap?: number }} TensuralBistable
 *   length: each thin segment, anchor to the compressive segment (mm); spacing: the two anchors (the base's and the
 *   shuttle's) apart along the segments' line; angle: the line's tilt from square to the shuttle's travel at rest
 *   (degrees, above 0 and at most 15); thickness, width: the thin segments'; depth: the compressive segment's, out
 *   from the line (default 12: stiff beside the thin segments' stretch; across from the anchor blocks it is cut back
 *   by 1.5 times the travel, 2 c sin α, so they pass it); fillet: the thin segments' rounds (default
 *   1); offset: the chain's nearest end from the travel's axis (default 6, room for the base's stem between the two
 *   chains); gap: the least air (default 0.3)
 */
function tensuralLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the bistable's parameters (length, spacing, angle, thickness, width)`);
  const a = size(what, p, 'length'), c = size(what, p, 'spacing'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), D = size(what, p, 'depth', 'depth', 12), h0 = size(what, p, 'offset', 'offset', 6), gap = size(what, p, 'gap', 'gap', 0.3), r = p.fillet ?? 1;
  const al = p.angle;
  if (typeof al !== 'number' || !(al > 0 && al <= 15)) throw new Error(`${what}: angle is the thin segments' tilt from square to the travel, degrees above 0 and at most 15 (got ${JSON.stringify(p.angle)}): steeper, they bend more than they stretch`);
  if (!(typeof r === 'number' && r >= 0 && 2 * r < a)) throw new Error(`${what}: fillet is the thin segments' rounds, 0 or more and under half a segment (got ${JSON.stringify(p.fillet)})`);
  const pw = t + 2 * r + 2, g0 = 1.5; // a pad's width across the line; half the air between the base's and the shuttle's anchors
  if (c < 2 * g0 + 4) throw new Error(`${what}: spacing ${c} leaves the base's and the shuttle's anchor blocks under 2 mm each along the line: ${2 * g0 + 4} or more`);
  if (h0 < 2 + gap + 3) throw new Error(`${what}: offset ${h0} leaves the base's stem between the chains under 1.5 mm each side of the axis: ${n2(5 + gap)} or more`);
  const A = al * rad, ym = h0 + FOOT + c / 2 + a, o1 = pw / 2 + gap; // the chain's middle, 4 mm of foot below its lower end; the slab's inner face from the line
  // each chain, up (sy 1) and its mirror (sy -1): the line through (0, sy ym) along v; n toward the compressive side (-x)
  const chains = [1, -1].map((sy) => {
    const v = [Math.sin(A), sy * Math.cos(A)], n = [-Math.cos(A), sy * Math.sin(A)], C = [0, sy * ym], P = (s, m = 0) => add(add(C, mul(v, s)), mul(n, m));
    return { sy, v, n, C, P, Ab: P(-c / 2), As: P(c / 2), Q1: P(-c / 2 - a), Q2: P(c / 2 + a) };
  });
  const notch = Math.min(1.5 * 2 * c * Math.sin(A), D - 6); // how far the slab's face is cut back across from the anchor blocks
  if (notch <= 0) throw new Error(`${what}: depth ${D} leaves no room to cut the slab back across from the anchor blocks: over 6`);
  const X1 = 12, wb = 5, X2 = 26; // the base's bar (its right face) and the shuttle's (its right face), both wb wide
  return { a, c, t, W, D, h0, gap, r, al, A, pw, g0, ym, o1, notch, chains, X1, wb, X2, half: beamProfile({ length: a, thickness: t, fillet: r }, 'guided') };
}
// The flat parts: the base (two anchor blocks on a bar, a stem along the axis to a block with a screw hole), the
// shuttle (two anchor blocks on a bar, a round tab to push), the two compressive segments (each a slab beside its
// line, with a foot at each end reaching back to it) and the four thin segments
function tensuralFlat(k) {
  const { a, c, pw, g0, o1, D, X1, wb, X2, gap } = k, fr = 1.5;
  const base = [], shuttle = [], slabs = [], thin = [];
  const yb = k.chains[0].P(-g0, -pw / 2)[1], ys = k.chains[0].P(c / 2, -pw / 2)[1]; // the base bar's ends and the shuttle bar's
  for (const ch of k.chains) {
    const { P, sy } = ch, s0 = -c / 2 - a, s1 = c / 2 + a;
    // anchor blocks: from the pad across the line out to the bar (the base's on s from -c/2 to -g0, the shuttle's from g0 to c/2)
    const block = (sa, sb, X) => polygon({ points: ccw([P(sa, pw / 2), P(sa, -pw / 2), [X, P(sa, -pw / 2)[1]], [X, P(sb, -pw / 2)[1]], P(sb, -pw / 2), P(sb, pw / 2)]) });
    base.push(block(-c / 2, -g0, X1));
    shuttle.push(block(g0, c / 2, X2));
    // each bar's inside corner under (or over) its block, rounded
    const lowB = P(-c / 2, -pw / 2)[1], lowS = P(g0, -pw / 2)[1];
    base.push(cornerRound(X1 - wb, lowB, -1, -sy, fr));
    shuttle.push(cornerRound(X2 - wb, lowS, -1, -sy, fr));
    // the compressive segment: a slab from o1 out to o1 + D beside the line, with a foot 4 mm long at each end back
    // across the line to the thin segment's end; the window between the feet rounded where it meets the slab
    const L = (pts) => polygon({ points: ccw(pts.map(([s, m]) => P(s, m))) });
    const outer = L([[s0 - FOOT, -pw / 2], [s1 + FOOT, -pw / 2], [s1 + FOOT, o1 + D], [s0 - FOOT, o1 + D]]);
    const ww = o1 + pw / 2 + 3, wc = P((s0 + s1) / 2, o1 - ww / 2), win = translate([wc[0], wc[1], 0], jscad.transforms.rotateZ(Math.atan2(ch.v[1], ch.v[0]), jscad.primitives.roundedRectangle({ size: [s1 - s0, ww], roundRadius: fr, segments: 32 })));
    // and a notch in its inner face across from the anchor blocks, which move along the line's square by up to about
    // half the shuttle's travel against it
    const nw = k.notch + 2, nc = P(0, o1 + k.notch - nw / 2), notch = translate([nc[0], nc[1], 0], jscad.transforms.rotateZ(Math.atan2(ch.v[1], ch.v[0]), jscad.primitives.roundedRectangle({ size: [c + 3, nw], roundRadius: fr, segments: 32 })));
    slabs.push(subtract(outer, win, notch));
    thin.push(beamOutline(ch.Ab, ch.Q1, k.half, a, k.t, 0.5, k.r), beamOutline(ch.Q2, ch.As, k.half, a, k.t, 0.5, k.r));
  }
  // the bars, the base's stem along the axis to its block, the shuttle's tab
  const hs = k.h0 - 2 - 1.5, xb1 = -(o1 + D) - 5, xb0 = xb1 - 10;
  base.push(rect(X1 - wb, X1, -Math.abs(yb), Math.abs(yb)), rect(xb1 - 0.01, X1 - wb + 0.01, -hs, hs), rect(xb0, xb1, -9, 9));
  for (const sy of [1, -1]) base.push(cornerRound(X1 - wb, sy * hs, -1, sy, fr), cornerRound(xb1, sy * hs, 1, sy, fr));
  shuttle.push(rect(X2 - wb, X2, -Math.abs(ys), Math.abs(ys)), hull(rect(X2 - 0.01, X2 + 1, -3, 3), circle({ radius: 3, center: [X2 + 4, 0], segments: SEG })));
  for (const sy of [1, -1]) shuttle.push(cornerRound(X2, sy * 3, 1, sy, fr));
  const hole = circle({ radius: M3() / 2, center: [(xb0 + xb1) / 2, 0], segments: 32 }); // an M3's clearance hole, as @rulecad/fixings draws it
  return { base: subtract(union(...base), hole), shuttle: union(...shuttle), slabs, thin, stem: { hs, xb0, xb1 } };
}

/**
 * A tensural bistable (TensuralBistable above), drawn at rest, one piece printed flat: two of US 7126446's couplings,
 * mirror images about the shuttle's travel (along x), so the pulls they take through the middle meet inside the
 * shuttle and no guide has to carry them. Each coupling: a thin segment from the base's anchor out to one foot of the
 * compressive segment (a slab beside the line), the slab back past both anchors, and a second thin segment in to the
 * shuttle's anchor. Pushed by its tab along -x, the shuttle snaps over and stays.
 * @param {TensuralBistable} p
 * @param {{ part?: 'all' | 'base' | 'shuttle' }} [o]
 * @returns {object} a JSCAD geom3
 */
export function tensuralBistable(p, { part = 'all' } = {}) {
  const k = tensuralLayout(p, 'tensuralBistable');
  if (!['all', 'base', 'shuttle'].includes(part)) throw new Error(`tensuralBistable: part is all, base or shuttle (got ${JSON.stringify(part)})`);
  const f = tensuralFlat(k);
  return extrudeLinear({ height: k.W }, part === 'all' ? union(f.base, f.shuttle, ...f.slabs, ...f.thin) : f[part]);
}

/**
 * What a tensural bistable does, from the beam solver on its drawn segments: each chain one beam from the base to the
 * shuttle (thin segment, foot, slab, foot, thin segment, the slab and feet as deep as drawn, so they give too), the
 * shuttle pushed along -x and free to move across and turn. The force curve, the push that switches it, the pull back,
 * where it rests again, the thin segments' tension through the middle (what makes it tensural), the strain, the
 * clearances over the swing and the grams. Beside it the hand sum for the stretch: through the middle the anchors are
 * c (1 - cos α) nearer each other along the line than the chain is long.
 * @param {TensuralBistable} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ steps?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] steps: the curve's
 *   (default 60, over 2.6 times 2 c sin α)
 * @returns {{ travel: number, stretch: number, tension: number, solvedTension: number, snap: { push: number, force: number }, back: { push: number, force: number },
 *   middle: number | null, second: number | null, bistable: boolean, strain: number, margin: number, clearance: { least: number, where: string },
 *   curve: object[], grams: number | null, findings: object[], rests: string[] }}
 *   travel: 2 c sin α, where the chain would lie straight again were it free to; stretch: c (1 - cos α); tension: a
 *   thin segment's pull through the middle, EA stretch / 2a (the slab rigid); solvedTension: the solver's, at the
 *   middle of its curve
 */
export function tensuralBistableModel(p, m, o = {}) {
  const what = 'tensuralBistableModel', k = tensuralLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const steps = o.steps ?? 60;
  if (!(Number.isInteger(steps) && steps >= 10)) throw new Error(`${what}: steps is a whole number, 10 or more (got ${JSON.stringify(o.steps)})`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), lim = m.strainLimit, flat = tensuralFlat(k);
  const travel = 2 * k.c * Math.sin(k.A), stretch = k.c * (1 - Math.cos(k.A)), EA = m.E * k.W * k.t, tension = (EA * stretch) / (2 * k.a);
  // Each chain one beam from the base to the shuttle: thin a (Ab to Q1), on along the line 2 mm into the foot, out
  // across to the slab's middle, along the slab, back, in, and thin b (Q2 to As)
  const beams = [];
  for (const ch of k.chains) {
    const { P } = ch, s0 = -k.c / 2 - k.a, s1 = k.c / 2 + k.a, mid = k.o1 + k.D / 2, ta = spansOf(ch.Ab, ch.Q1, k.half, k.a, 16), tb = spansOf(ch.Q2, ch.As, k.half, k.a, 16);
    const path = [...ta.path, P(s0 - FOOT / 2), P(s0 - FOOT / 2, mid), P(s1 + FOOT / 2, mid), P(s1 + FOOT / 2), ...tb.path], thickness = [...ta.thickness, k.pw, FOOT, k.D, FOOT, k.pw, ...tb.thickness];
    beams.push({ name: ch.sy > 0 ? 'chain up' : 'chain down', path, thickness, width: k.W, E: m.E, from: 'base', to: 'shuttle' });
  }
  const sys = beamSystem({ bodies: { base: { at: [0, 0], fixed: true }, shuttle: { at: [k.X2, 0] } }, beams, segments: 120 });
  const d = sys.body.shuttle.dof, to = 2.6 * travel, curve = [], qs = [];
  let q, ok = true;
  for (let i = 1; i <= steps; i++) {
    const r = equilibrium(sys, { held: new Map([[d, (-to * i) / steps]]), start: q, iterations: 100 });
    q = r.q; ok = ok && r.converged; qs.push(r.q);
    curve.push({ push: (to * i) / steps, force: -r.reaction.get(d), strain: Math.max(...Object.values(r.strain)) });
  }
  const rc = readCurve(curve);
  // The thin segments' pull through the middle: an element in the middle of each, its stretch EA (L - L0) / L0
  const iMid = rc.middle != null ? Math.max(0, Math.round((rc.middle / to) * steps) - 1) : Math.round(steps / 3), qm = qs[iMid];
  const pulls = sys.elements.filter((e) => e.a.dof != null && e.b.dof != null && e.t === k.t).map((e) => { const pa = [e.a.at[0] + qm[e.a.dof], e.a.at[1] + qm[e.a.dof + 1]], pb = [e.b.at[0] + qm[e.b.dof], e.b.at[1] + qm[e.b.dof + 1]]; return (e.EA * (len(sub(pb, pa)) - e.L0)) / e.L0; });
  const solvedTension = pulls.length ? Math.min(...pulls) : 0;
  // Clearances over the swing (to the second rest, or the whole curve): the slabs and thin segments from the base and
  // the shuttle (each thin segment from the one it is not fixed to), the shuttle from the base, the two slabs apart
  const last = rc.bistable ? Math.min(steps, Math.ceil((rc.second / to) * steps) + 1) : steps, baseO = jscad.geometries.geom2.toOutlines(flat.base), shO = jscad.geometries.geom2.toOutlines(flat.shuttle);
  const shPts = shO.flat(), slabO = flat.slabs.map((g) => jscad.geometries.geom2.toOutlines(g)), dot = (x, y) => x[0] * y[0] + x[1] * y[1];
  // each chain's thin segments' nodes (on the line, between an anchor and a foot) and the two nodes at the slab's ends,
  // whose moves carry its outline (the slab is near rigid beside the thin segments)
  const per = k.chains.map((ch) => {
    const mine = sys.nodes.filter((nd) => nd.beam === (ch.sy > 0 ? 'chain up' : 'chain down')), local = (pt) => [dot(sub(pt, ch.C), ch.v), dot(sub(pt, ch.C), ch.n)];
    const s0 = -k.c / 2 - k.a, s1 = k.c / 2 + k.a, mid = k.o1 + k.D / 2, nearest = (pt) => mine.reduce((b, nd) => (len(sub(nd.at, pt)) < len(sub(b.at, pt)) ? nd : b));
    const thin = mine.filter((nd) => { const [ss, mm] = local(nd.at); return Math.abs(mm) < 1e-6 && ((ss > s0 && ss < -k.c / 2) || (ss > k.c / 2 && ss < s1)); }).map((nd) => ({ nd, a: local(nd.at)[0] < 0, near: Math.min(len(sub(nd.at, ch.Ab)), len(sub(nd.at, ch.As)), len(sub(nd.at, ch.Q1)), len(sub(nd.at, ch.Q2))) < k.pw }));
    return { ch, thin, g1: nearest(ch.P(s0 - FOOT / 2, mid)), g2: nearest(ch.P(s1 + FOOT / 2, mid)) };
  });
  let least = Infinity, where = '';
  const note = (v, w) => { if (v < least) { least = v; where = w; } };
  for (let i = 0; i < last; i++) {
    const qq = qs[i], shMoved = (pt) => moved(pt, [k.X2, 0], [qq[d], qq[d + 1], qq[d + 2]]), shNow = shO.map((ol) => ol.map(shMoved)), at = (nd) => [nd.at[0] + qq[nd.dof], nd.at[1] + qq[nd.dof + 1]];
    per.forEach(({ ch, thin, g1, g2 }, j) => {
      const name = ch.sy > 0 ? 'upper' : 'lower', m1 = at(g1), m2 = at(g2), phi = Math.atan2(m2[1] - m1[1], m2[0] - m1[0]) - Math.atan2(g2.at[1] - g1.at[1], g2.at[0] - g1.at[0]);
      const slabNow = slabO[j].map((ol) => ol.map((pt) => { const o = sub(pt, g1.at), c = Math.cos(phi), sn = Math.sin(phi); return add(m1, [c * o[0] - sn * o[1], sn * o[0] + c * o[1]]); }));
      for (const pt of slabNow.flat()) { note(outlineDist(pt, baseO), `the ${name} compressive segment and the base`); note(outlineDist(pt, shNow), `the ${name} compressive segment and the shuttle`); }
      for (const pt of [...baseO.flat(), ...shNow.flat()]) note(outlineDist(pt, slabNow), `the ${name} compressive segment and the base or shuttle`);
      for (const { nd, a: onBase, near } of thin) {
        if (near) continue;
        const p0 = at(nd), h = k.t / 2;
        note(outlineDist(p0, slabNow) - h, `the ${name} thin segments and their compressive segment`);
        note(outlineDist(p0, onBase ? shNow : baseO) - h, `the ${name} thin segment ${onBase ? 'from the base and the shuttle' : 'to the shuttle and the base'}`);
      }
    });
    for (const pt of shPts) note(outlineDist(shMoved(pt), baseO), 'the shuttle and the base');
  }
  const most = rc.strain, margin = lim / most;
  const rests = ['the force curve is the beam solver\'s on the drawn chains (the slabs and feet as beams as deep as drawn, so their give is in it), the shuttle pushed along its travel and free to move across and turn; the base rigid', 'two of the patent\'s couplings, mirror images about the travel, so their pulls along the line meet in the shuttle: one coupling on a flexure guide would load the guide\'s leaves along their length (tens of newtons, past a printed leaf\'s buckling load when they are in compression)', 'the layout (thin segments on one line at rest, the compressive segment beside them with a foot at each end) is the patent\'s FIGS. 1 to 3; its sizes are ours, the patent being a MEMS device of microns'];
  f('info', `through the middle the anchors are c (1 - cos α) = ${n2(stretch, 3)} mm nearer each other along the line than the chain is long, so the thin segments stretch: about ${n2(tension, 1)} N each with the slab rigid (EA δ / 2a). The solver's, the slab giving too: ${n2(solvedTension, 1)} N`, 'tensural.tension', { values: { stretch, tension, solvedTension } });
  if (solvedTension <= 0) f('fail', `through the middle the thin segments are not in tension (${n2(solvedTension, 2)} N): it is not working as a tensural bistable`, 'tensural.tension', { values: { solvedTension } });
  if (rc.bistable) f('pass', `pushed ${n2(rc.snap.push)} mm it takes ${n2(rc.snap.force)} N, the most; past ${n2(rc.middle)} mm it snaps on by itself, pulling with up to ${n2(-rc.back.force)} N, and rests ${n2(rc.second)} mm from where it started. Back the other way takes about ${n2(-rc.back.force)} N`, 'tensural.snap', { values: { snap: rc.snap, back: rc.back, middle: rc.middle, second: rc.second } });
  else f('fail', `it does not stay over: pushed ${n2(to)} mm the force never falls below 0 (its least ${n2(rc.back.force)} N), so it springs back: a steeper line, or shorter thin segments`, 'tensural.snap', { values: { snap: rc.snap, back: rc.back } });
  f(margin >= 2 ? 'pass' : margin >= 1 ? 'warn' : 'fail', `on the way over the thin segments see at most ${n2(most * 100, 2)}%: ${n2(margin)} times under the limit of ${n2(lim * 100, 1)}%${margin >= 2 ? '' : margin >= 1 ? ', under the twice it should have: longer thin segments or a smaller angle' : ': over it'}`, 'flexure.strain', { values: { strain: most, limit: lim, margin } });
  f(least >= k.gap ? 'pass' : 'fail', `over the swing the least air is ${n2(least)} mm, between ${where}${least >= k.gap ? '' : `: under the ${k.gap} mm gap, they meet`}`, 'tensural.clear', { values: { least, where } });
  if (!ok) f('warn', 'the beam solver did not settle at every step: the force curve is a guide only', 'tensural.solver');
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(tensuralBistable(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'tensural.mass', { values: { grams } }); }
  return { travel, stretch, tension, solvedTension, snap: rc.snap, back: rc.back, middle: rc.middle, second: rc.second, bistable: rc.bistable, strain: most, margin, clearance: { least, where }, curve, grams, findings: out, rests };
}

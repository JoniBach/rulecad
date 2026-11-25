// Two more things that click over and stay, beside the tilted-leaf bistable and the buckled switch (bistables.mjs),
// each from the source that names it, its force curve from the beam solver (beams.mjs) on the drawn parts.
//
// - The Young bistable mechanism (Jensen, Howell and Salmon, US 6215081, 2001, FIGS. 4a to 5b): two links. The base
//   carries two pins; the other link is two compliant arms joined by a rigid coupler, each arm turning on its own pin
//   at one end and fixed into the coupler at the other (class I: both arms fixed-pinned segments). Its
//   pseudo-rigid-body model is a four-bar with torsion springs at the coupler's two joints only, since the pins are
//   free. Turned over, the long arm bends, and the link rests again with that arm bent (the patent's "force loaded"
//   second position, FIG. 4b).
// - The tensural bistable (Wilcox and Howell, US 7126446, 2006; J. Microelectromech. Syst. 14(6), 2005): a thin
//   segment from the base's anchor out to one end of a thick compressive segment, which runs back past both anchors
//   to a second thin segment, which comes in to the shuttle's anchor. At rest the thin segments are straight and on
//   one line, tilted a little from square to the shuttle's travel. Pushed through, the line must pass square, where
//   the anchors are nearer each other along it than the chain allows: the thin segments are stretched and the thick
//   one squeezed. So it holds by tension, and no thin part is loaded in compression to buckle.
//
// Drawn flat like every flexure here: the plan in x and y, the print from z = 0 up to the width. Units: mm, N, MPa.
import jscad from '@jscad/modeling';
import { pinModel } from '@rulecad/fixings';
import { beamProfile, printable, need } from './core.mjs';
import { beamSystem, equilibrium } from './beams.mjs';
import { beamOutline, spansOf, readCurve } from './bistables.mjs';
import { size, n2, rad, sub, add, mul, unit, len, wrap } from './pivots.mjs';

const { polygon, rectangle, circle, cylinder, cuboid } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { hull } = jscad.hulls;
const { extrudeLinear } = jscad.extrusions;
const { translate, mirrorZ } = jscad.transforms;
const { measureVolume } = jscad.measurements;

const SEG = 64;
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
// The ground: a bar over both pins, run on past the short arm's pin to a foot that stands on the table (or a board,
// by its screw hole). Printed on its back: the bar on the bed, the foot standing up, the corner between them rounded
function youngGround(k) {
  const x0 = -k.rh - 1, f0 = k.g + k.rh + 3, f1 = f0 + 10, bw = 2 * k.rh + 2, H = k.hb + k.gap + k.W, fr = 1.5;
  const prof = union(rect(x0, f1, 0, k.hb), rect(f0, f1, 0, H), subtract(rect(f0 - fr, f0, k.hb, k.hb + fr), circle({ radius: fr, center: [f0 - fr, k.hb + fr], segments: 32 })));
  const solid = jscad.transforms.rotateX(Math.PI / 2, extrudeLinear({ height: bw }, prof)); // the profile in x and z, bw across y
  const body = translate([0, bw / 2, 0], solid);
  const holes = [k.A, k.B].map((c) => cylinder({ radius: k.press.hole.diameter / 2, height: k.hb + 2, center: [c[0], c[1], k.hb / 2], segments: 32 }));
  const screw = cylinder({ radius: 1.7, height: H + 2, center: [(f0 + f1) / 2, 0, H / 2], segments: 32 }); // an M3 clearance (ISO 273 medium, 3.4)
  return { solid: subtract(body, ...holes, screw), foot: [f0, f1, -bw / 2, bw / 2], height: H };
}

/**
 * A Young bistable mechanism, class I (YoungBistable above), drawn at rest: the mover (two hubs, two arms and the
 * coupler, one piece printed flat), the ground (a bar over the pins with a foot, printed on its back) and two pins.
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
 * between the moving parts and the ground's foot over the whole swing, the pins, and the grams. Beside it the
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
 *   its pin at the second position; clearance: the least air between moving parts, or between them and the foot
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
  // coupler's outline from both hubs, each arm from the coupler's bar (away from its own end), and all from the foot
  const cpts = jscad.geometries.geom2.toPoints(flat.coupler), last = sc.bistable ? Math.min(steps, Math.ceil((sc.second / to) * steps) + 1) : steps;
  let least = Infinity, where = '';
  const note = (v, w) => { if (v < least) { least = v; where = w; } };
  const [fx0, fx1, fy0, fy1] = ground.foot, footDist = (pt) => { const dx = Math.max(fx0 - pt[0], 0, pt[0] - fx1), dy = Math.max(fy0 - pt[1], 0, pt[1] - fy1); return Math.hypot(dx, dy); };
  for (let i = 0; i < last; i++) {
    const q = sc.qs[i], cq = [q[sys.body.coupler.dof], q[sys.body.coupler.dof + 1], q[sys.body.coupler.dof + 2]], hA = add(k.A, [q[sys.body['long hub'].dof], q[sys.body['long hub'].dof + 1]]), hB = add(k.B, [q[sys.body['short hub'].dof], q[sys.body['short hub'].dof + 1]]);
    const Hm = moved(k.H, mid, cq), Pbm = moved(k.Pb, mid, cq), Ptm = moved(k.Pt, mid, cq);
    for (const n of sys.nodes) {
      const at = [n.at[0] + q[n.dof], n.at[1] + q[n.dof + 1]], own = n.beam === 'long arm' ? Ptm : Pbm, other = n.beam === 'long arm' ? hB : hA;
      note(len(sub(at, other)) - k.rh - k.t / 2, `the ${n.beam} and the ${n.beam === 'long arm' ? 'short' : 'long'} hub`);
      if (len(sub(at, own)) > k.pw + 2) note(segDist(at, Hm, Pbm) - k.pw / 2 - k.t / 2, `the ${n.beam} and the coupler`);
      note(footDist(at) - k.t / 2, `the ${n.beam} and the ground's foot`);
    }
    for (const pt of cpts) { const at = moved(pt, mid, cq); note(Math.min(len(sub(at, hA)), len(sub(at, hB))) - k.rh, 'the coupler and a hub'); note(footDist(at), 'the coupler and the ground\'s foot'); }
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

// Compliant machine elements: a force gauge read against a scale printed beside it, and a slip clutch whose arms ride
// out of their notches past a set torque. Each is drawn at rest and modelled with the beam solver (beams.mjs) on its
// drawn flexures, with a hand formula beside it to check the solver against.
//
// - The force gauge: a platform on a parallel guide, a needle from it, and a post with a tick every `step` newtons.
//   The ticks are placed where the beam solver puts the needle under each force, so a gauge drawn for a material reads
//   in newtons; a measured calibration (one known load and what it read) corrects the rest.
// - The slip clutch: a hub with arms round it, each a curved cantilever with a bump on its tip in a notch of the ring
//   round it. Turned past the slip torque, the bumps ride up their notches' flanks, the arms bend in, and the ring
//   clicks on a notch: a torque limiter, and a detent that holds a setting.
//
// Drawn flat like every flexure here: the plan in x and y, the print from z = 0 up to the width. Units: mm, N, MPa.
import jscad from '@jscad/modeling';
import { beamProfile, printable, need } from './core.mjs';
import { beamSystem, equilibrium } from './beams.mjs';
import { beamOutline, spansOf } from './bistables.mjs';
import { size, n2, rad } from './pivots.mjs';

const { polygon, rectangle, roundedRectangle, circle } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { extrudeLinear } = jscad.extrusions;
const { measureVolume } = jscad.measurements;
const { offset } = jscad.expansions;

const rect = (x0, x1, y0, y1) => rectangle({ size: [x1 - x0, y1 - y0], center: [(x0 + x1) / 2, (y0 + y1) / 2] });
// Every inside corner of a rigid outline rounded to r (grown by r, then shrunk back: its outside corners round too)
const rounded = (g, r) => offset({ delta: -r, corners: 'round', segments: 32 }, offset({ delta: r, corners: 'round', segments: 32 }, g));
// Holes and slots are cut in 3D, through and past both faces: JSCAD's 2D cuts leave open outlines on these shapes
const solid = (g, W) => extrudeLinear({ height: W }, g), cutter = (g, W) => jscad.transforms.translate([0, 0, -1], extrudeLinear({ height: W + 2 }, g));

// --------------------------------------------------------------------------------------------------------- force gauge

/**
 * @typedef {{ length: number, thickness: number, width: number, range: number, step: number, apart?: number,
 *   fillet?: number, platform?: number, block?: number, needle?: number, tick?: number, base?: number, gap?: number }} ForceGauge
 *   length, thickness, width: each of the guide's two leaves; range: the most force it reads, either way (N); step:
 *   newtons from one tick to the next (every fifth tick, and 0, is long). A force on the platform along -y
 *   (toward the frame's bar) reads positive; apart: the leaves' centrelines apart (default
 *   12); fillet: the leaves' rounds (default 1); platform: the platform's length along x (default 6); block: the back
 *   block's (default 8); needle: from the platform to the needle's tip (default 10); tick: a tick's slot across
 *   (default 0.6); base: the frame's bar under it all (default 6); gap: the least air (default 0.3)
 */
function gaugeLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the gauge's parameters (length, thickness, width, range, step)`);
  const L = size(what, p, 'length'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), range = size(what, p, 'range'), step = size(what, p, 'step');
  const a = size(what, p, 'apart', 'apart', 12), s = size(what, p, 'platform', 'platform', 6), blk = size(what, p, 'block', 'block', 8), nl = size(what, p, 'needle', 'needle', 10);
  const tick = size(what, p, 'tick', 'tick', 0.6), hb = size(what, p, 'base', 'base', 6), gap = size(what, p, 'gap', 'gap', 0.3), r = p.fillet ?? 1;
  if (!(typeof r === 'number' && r >= 0 && 2 * r < L)) throw new Error(`${what}: fillet is the leaves' rounds, 0 or more and under half a leaf (got ${JSON.stringify(p.fillet)})`);
  if (step > range) throw new Error(`${what}: step ${step} N is more than the range ${range} N: the scale would have no tick but 0`);
  if (range / step > 200) throw new Error(`${what}: range ${range} N in steps of ${step} N is ${Math.round(range / step)} ticks each way: 200 or fewer`);
  const pw = t + 2 * r + 2; // a pad's width across a leaf, so the leaf's rounds meet a flat face
  if (a < pw + 2 * gap) throw new Error(`${what}: apart ${a} puts the leaves' rounds into each other: ${n2(pw + 2 * gap)} or more`);
  return { L, t, W, range, step, a, s, blk, nl, tick, hb, gap, r, pw, half: beamProfile({ length: L, thickness: t, fillet: r }, 'guided') };
}

// The parallel guide in the beam solver: the back block the ground, the platform a body
function gaugeSystem(k, E) {
  const leaves = [1, -1].map((sy, i) => ({ name: `leaf ${i + 1}`, ...spansOf([0, (sy * k.a) / 2], [k.L, (sy * k.a) / 2], k.half, k.L), width: k.W, E, from: 'ground', to: 'platform' }));
  return beamSystem({ bodies: { ground: { at: [0, 0], fixed: true }, platform: { at: [k.L + k.s / 2, 0] } }, beams: leaves, segments: 32 });
}

// The force curve: the platform held at each step from rest along -y, free to drop along x and to turn; the force
// it takes, its drop, the leaves' strain. By the guide's mirror symmetry, a push the other way is the same curve.
function gaugeCurve(k, E, to, steps) {
  const sys = gaugeSystem(k, E), d = sys.body.platform.dof, curve = [];
  let q;
  for (let i = 1; i <= steps; i++) {
    const at = (to * i) / steps, r = equilibrium(sys, { held: new Map([[d + 1, -at]]), start: q, iterations: 80 });
    q = r.q; curve.push({ at, force: -r.reaction.get(d + 1), drop: -r.q[d], turn: r.q[d + 2], strain: Math.max(...Object.values(r.strain)), converged: r.converged });
  }
  return curve;
}
const across = (curve, key, v, other) => { // where the curve's `key` reaches v, its `other` read off between the points either side
  let a = { [key]: 0, [other]: 0 };
  for (const c of curve) { if (c[key] >= v) return a[other] + ((c[other] - a[other]) * (v - a[key])) / (c[key] - a[key]); a = c; }
  return null;
};

// The model's sums, shared by the drawing (which places the ticks) and the model (which reports them)
function gaugeSums(k, m) {
  const I = (k.W * k.t ** 3) / 12, stiffness = (2 * 12 * m.E * I) / k.L ** 3;
  // the solver's curve out past the range: the formula's travel at the range and a quarter more, for the stiffening
  const curve = gaugeCurve(k, m.E, (1.25 * k.range) / stiffness, 50);
  const reach = curve[curve.length - 1].force;
  if (!(reach >= k.range)) throw new Error(`gauge: the beam solver's guide takes only ${n2(reach)} N at ${n2(curve[curve.length - 1].at)} mm, short of the range ${k.range} N`);
  const n = Math.floor(k.range / k.step + 1e-9), ticks = [];
  for (let i = -n; i <= n; i++) { const F = i * k.step, at = -Math.sign(F) * (across(curve, 'force', Math.abs(F), 'at') ?? 0); ticks.push({ force: F, at, long: i % 5 === 0 }); }
  const travel = across(curve, 'force', k.range, 'at'), strain = across(curve, 'force', k.range, 'strain'), drop = across(curve, 'force', k.range, 'drop');
  const first = curve[0], solvedStiffness = first.force / first.at, spacing = Math.min(...ticks.slice(1).map((x, i) => x.at - ticks[i].at));
  return { stiffness, solvedStiffness, curve, ticks, travel, strain, drop, spacing, converged: curve.every((c) => c.converged) };
}

function gaugeOutline(k, sums) { // the three bodies in 3D, up to the width
  const top = k.a / 2 + k.pw / 2, room = sums.travel * 1.1 + k.gap + 1; // how far the platform goes, and air
  const xp = k.L + k.s, tip = xp + k.nl, post0 = tip + k.gap + 0.5, post1 = post0 + 6; // the needle's tip a little off the post
  const yb = -top - room; // the bar's top
  // the platform: a block, its needle (tapering to a 0.4 mm flat tip), and a tab up out of the frame with a hole for
  // a string or a hook; every inside corner rounded
  const needle = polygon({ points: [[xp - 0.5, -1.2], [tip, -0.2], [tip, 0.2], [xp - 0.5, 1.2]] });
  const tabTop = top + room + 8, tab = rect(k.L + 0.5, xp - 0.5, 0, tabTop);
  const platform = subtract(solid(rounded(union(rect(k.L, xp, -top, top), needle, tab), 0.8), k.W), cutter(circle({ radius: 1.5, center: [k.L + k.s / 2, tabTop - 3], segments: 32 }), k.W));
  // the frame: the back block, the bar under it all and the post the scale is cut in, which rises past the most travel
  const postTop = Math.max(top, sums.travel + 3), frame0 = union(rect(-k.blk, 0, yb, top), rect(-k.blk, post1, yb - k.hb, yb + 0.01), rect(post0, post1, yb, postTop));
  const slots = sums.ticks.map((x) => { const d = x.long ? 2.5 : 1.2; return roundedRectangle({ size: [2 * d, k.tick], center: [post0, x.at], roundRadius: k.tick / 2 - 0.01, segments: 16 }); });
  const frame = subtract(solid(rounded(frame0, 1), k.W), ...slots.map((x) => cutter(x, k.W)));
  const leaves = [1, -1].map((sy) => solid(beamOutline([0, (sy * k.a) / 2], [k.L, (sy * k.a) / 2], k.half, k.L, k.t, 0.5, k.r), k.W));
  return { platform, frame, leaves, post0, tip, yb, top };
}

/**
 * A force gauge (ForceGauge above), one piece, drawn at rest: a platform on a parallel guide, a needle from it, and
 * a post with the scale cut in its face. The ticks are where the beam solver puts the needle under each force for
 * this material, so the gauge needs the material to be drawn.
 * @param {ForceGauge} p @param {{ E: number }} m
 * @param {{ part?: 'all' | 'frame' | 'platform' }} [o]
 * @returns {object} a JSCAD geom3
 */
export function forceGauge(p, m, { part = 'all' } = {}) {
  const what = 'forceGauge', k = gaugeLayout(p, what);
  need(what, {}, m);
  if (!['all', 'frame', 'platform'].includes(part)) throw new Error(`${what}: part is all, frame or platform (got ${JSON.stringify(part)})`);
  const s = gaugeSums(k, m);
  if (s.spacing < 2 * k.tick) throw new Error(`${what}: ticks every ${k.step} N lie ${n2(s.spacing)} mm apart, under two ${k.tick} mm slots: a larger step, softer leaves, or a narrower tick`);
  const g = gaugeOutline(k, s);
  return part === 'all' ? union(g.frame, g.platform, ...g.leaves) : g[part];
}

/**
 * What a force gauge reads, from the beam solver on its drawn leaves: its stiffness (against two fixed-guided leaves,
 * 24EI / L³), where each tick is, the travel and the leaves' strain at the range against half the limit (twice the
 * margin), how far from straight its scale runs, the needle's drop, and the grams. With a calibration (a known load
 * and what the scale read under it), the factor that corrects every reading.
 * @param {ForceGauge} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ calibration?: { load: number, reading: number }, printer?: { line: number, layer: number, wall_min?: number } }} [o]
 * @returns {{ stiffness: number, solvedStiffness: number, ticks: { force: number, at: number, long: boolean }[], spacing: number,
 *   travel: number, strain: number, margin: number, straight: number, drop: number, factor: number, read: (reading: number) => number,
 *   grams: number | null, findings: object[], rests: string[] }}
 *   stiffness: the formula's (N/mm); solvedStiffness: the solver's at the start; ticks: each tick's force (N) and where
 *   it is along y (mm); spacing: the least between two ticks; travel, strain: at the range; margin: the strain limit
 *   over the strain at the range; straight: how far the force at the range is from the start's stiffness times its
 *   travel, a share (the guide stiffens as it goes); drop: the needle's move along x at the range (3δ² / 5L for a
 *   parallel guide); factor: load / reading, 1 without a calibration; read: a reading on the scale to newtons
 */
export function forceGaugeModel(p, m, o = {}) {
  const what = 'forceGaugeModel', k = gaugeLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const cal = o.calibration;
  if (cal !== undefined && !(cal && cal.load > 0 && cal.reading > 0)) throw new Error(`${what}: calibration is { load, reading }: a known load in newtons and what the scale read under it, both above 0 (got ${JSON.stringify(cal)})`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), lim = m.strainLimit;
  const s = gaugeSums(k, m), margin = lim / s.strain, straight = k.range / (s.solvedStiffness * s.travel) - 1;
  f('pass', `${n2(s.solvedStiffness, 3)} N/mm (the beam solver on the drawn leaves, rounds included); two fixed-guided leaves, 24EI/L³, give ${n2(s.stiffness, 3)} N/mm`, 'gauge.stiffness', { values: { stiffness: s.stiffness, solvedStiffness: s.solvedStiffness } });
  const drawn = s.spacing >= 2 * k.tick;
  f(s.spacing >= 1 ? 'pass' : drawn ? 'warn' : 'fail', `a tick every ${k.step} N, the nearest two ${n2(s.spacing)} mm apart${s.spacing >= 1 ? '' : drawn ? ': under 1 mm the needle is hard to read between them. A larger step, or softer leaves (longer or thinner)' : `: under two ${k.tick} mm slots, so the scale can't be cut. A larger step, or softer leaves (longer or thinner)`}`, 'gauge.ticks', { values: { step: k.step, spacing: s.spacing } });
  f(margin >= 2 ? 'pass' : s.strain <= lim ? 'warn' : 'fail', `at ${k.range} N the platform travels ${n2(s.travel)} mm and the leaves see ${n2(s.strain * 100, 2)}%, ${margin >= 2 ? `under half the limit of ${n2(lim * 100, 1)}% (${n2(margin, 1)}x)` : s.strain <= lim ? `within the limit of ${n2(lim * 100, 1)}% but with only ${n2(margin, 2)}x the margin: longer or thinner leaves, or a smaller range` : `over the limit of ${n2(lim * 100, 1)}%: longer or thinner leaves, or a smaller range`}`, 'flexure.strain', { values: { strain: s.strain, limit: lim, margin, travel: s.travel } });
  f(Math.abs(straight) <= 0.02 ? 'pass' : 'info', `the scale runs ${n2(Math.abs(straight) * 100, 1)}% from straight at the range (the guide ${straight >= 0 ? 'stiffens' : 'softens'} as it goes); the ticks follow the solver's curve, not a straight line`, 'gauge.straight', { values: { straight } });
  f('pass', `at the range the needle drops ${n2(s.drop, 2)} mm away from the scale (a parallel guide's 3δ²/5L: ${n2((3 * s.travel ** 2) / (5 * k.L), 2)})`, 'gauge.drop', { values: { drop: s.drop } });
  const factor = cal ? cal.load / cal.reading : 1;
  if (cal) f(Math.abs(factor - 1) <= 0.2 ? 'pass' : 'warn', `calibrated: ${cal.load} N read ${cal.reading} on the scale, so every reading times ${n2(factor, 3)}${Math.abs(factor - 1) <= 0.2 ? '' : ': over 20% off the drawing. Check the material\'s modulus and the leaves\' printed thickness'}`, 'gauge.calibration', { values: { factor } });
  if (!s.converged) f('warn', 'the beam solver did not settle at every step: the ticks are a guide only', 'gauge.solver');
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0 && drawn) { grams = (measureVolume(forceGauge(p, m)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'gauge.mass', { values: { grams } }); }
  const rests = ['the ticks rest on the material\'s modulus E: a printed leaf is often 10% to 20% off the datasheet (its lines, its layers, how hot it printed), so calibrate it with one known weight', 'held loaded, PLA creeps and the zero walks: read a load and let go; PETG and nylon hold their zero better'];
  return { stiffness: s.stiffness, solvedStiffness: s.solvedStiffness, ticks: s.ticks, spacing: s.spacing, travel: s.travel, strain: s.strain, margin, straight, drop: s.drop, factor, read: (x) => x * factor, grams, findings: out, rests };
}

// --------------------------------------------------------------------------------------------------------- slip clutch

/**
 * @typedef {{ radius: number, thickness: number, width: number, depth: number, arms?: number, sweep?: number,
 *   angle?: number, notches?: number, bore?: number, wall?: number, lug?: number, gap?: number }} SlipClutch
 *   radius: the ring's bore, where the notches open (mm); thickness, width: each arm's; depth: how far a bump lifts
 *   its arm to leave its notch (mm); arms: how many (default 3); sweep: each arm's arc, root to tip (degrees, default
 *   90); angle: the notches' and bumps' flanks from the ring's bore (degrees, default 30: steeper slips at more torque,
 *   past atan(1 / μ) it never slips); notches: in the ring (default four for each arm, a whole number of times the
 *   arms); bore: the hub's hole (default 5); wall: the ring beyond its notches (default 4); lug: an arm's root, along
 *   the arc (default 3); gap: the least air (default 0.3)
 */
function clutchLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the clutch's parameters (radius, thickness, width, depth)`);
  const R = size(what, p, 'radius'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), y = size(what, p, 'depth');
  const n = p.arms ?? 3, sweep = size(what, p, 'sweep', 'sweep', 225 / (Number.isInteger(n) && n > 0 ? n : 1)), al = size(what, p, 'angle', 'angle', 30), bore = size(what, p, 'bore', 'bore', 5);
  const wall = size(what, p, 'wall', 'wall', 4), lug = size(what, p, 'lug', 'lug', 3), gap = size(what, p, 'gap', 'gap', 0.3), m = p.notches ?? 4 * n;
  if (!(Number.isInteger(n) && n >= 1)) throw new Error(`${what}: arms is a whole number, 1 or more (got ${JSON.stringify(p.arms)})`);
  if (!(Number.isInteger(m) && m >= n && m % n === 0)) throw new Error(`${what}: notches is a whole number of times the ${n} arms, so every bump finds a notch at once (got ${JSON.stringify(p.notches)})`);
  if (al >= 75) throw new Error(`${what}: angle ${al}° is a flank too steep to ride up: under 75° (at atan(1 / μ) it locks)`);
  const rc = R - gap - t / 2, rh = rc - t / 2 - y - 2 * gap; // the arms' centreline; the hub, clear of an arm bent in by the depth
  if (rh < bore / 2 + 2) throw new Error(`${what}: radius ${R} leaves the hub ${n2(rh)} mm round a ${bore} mm bore: the hub needs ${n2(bore / 2 + 2)} or more (a larger radius, or a shallower depth)`);
  const flank = (y + gap) / Math.tan(al * rad), nf = 0.8, bumpAng = (2 * flank + nf) / R / rad; // a bump's width along the bore, in degrees
  const lugAng = lug / rc / rad, pitch = 360 / n, free = pitch - sweep - lugAng; // what is left of an arm's share of the turn
  if ((free * rad) * rc < y + 2 + bumpAng * rad * R / 2) throw new Error(`${what}: ${n} arms of ${sweep}° each, with their roots, leave ${n2(free * rad * rc)} mm from a tip to the next root: ${n2(y + 2 + (bumpAng * rad * R) / 2)} or more (fewer arms, or a shorter sweep)`);
  if (360 / m < bumpAng + 2 * (gap / R / rad) + 4) throw new Error(`${what}: ${m} notches ${n2(360 / m, 1)}° apart are too close for notches ${n2(bumpAng, 1)}° wide: fewer notches, a shallower depth or a steeper angle`);
  return { R, t, W, y, n, m, sweep, al, bore, wall, lug, gap, rc, rh, flank, nf, bumpAng, lugAng, Ro: R + y + 2 * gap + wall };
}

// A V notch or bump on a circle: its flanks at the angle, a flat top nf wide, `h` deep from radius r0 outward
function vee(r0, h, flank, nf, angle, sx = 1) {
  const c = [Math.cos(angle), Math.sin(angle)], u = [-Math.sin(angle), Math.cos(angle)], at = (along, r) => [c[0] * r + u[0] * along, c[1] * r + u[1] * along];
  const w0 = flank + nf / 2, w1 = nf / 2, base = r0 - 0.5 * sx; // run into the body a little, so it joins
  const pts = [at(-w0 - 0.5, base), at(w0 + 0.5, base), at(w0, r0), at(w1, r0 + sx * h), at(-w1, r0 + sx * h), at(-w0, r0)];
  const area = pts.reduce((a, q, i) => { const r = pts[(i + 1) % pts.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0);
  return polygon({ points: area > 0 ? pts : pts.reverse() });
}
const arc = (r0, r1, a0, a1, n = 96) => { const pts = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]); } for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]); } return polygon({ points: pts }); };

function clutchOutline(k) { // the hub and the ring in 3D, up to the width
  // the hub: a disc, and for each arm a lug from the disc out to the arm's root, the arm along its arc to its tip, and
  // the bump on the tip's outside; every inside corner rounded (the gaps are wider than twice the round)
  const parts = [circle({ radius: k.rh, segments: 128 })];
  for (let i = 0; i < k.n; i++) {
    const a0 = (i * 360) / k.n, root = a0 * rad, tip = (a0 + k.lugAng + k.sweep) * rad;
    parts.push(arc(k.rh - 0.5, k.rc + k.t / 2, root, root + k.lugAng * rad, 16)); // the lug
    parts.push(arc(k.rc - k.t / 2, k.rc + k.t / 2, root + k.lugAng * rad - 0.01, tip, 96)); // the arm
    parts.push(vee(k.rc + k.t / 2, k.y + k.gap, k.flank, k.nf, tip - ((k.flank + k.nf / 2 + 0.5) / k.rc), 1)); // the bump, its far flank at the tip
  }
  const hub = subtract(solid(rounded(union(...parts), 0.5), k.W), cutter(circle({ radius: k.bore / 2 + 0.1, segments: 64 }), k.W));
  // the ring: its bore at the radius, a notch over each bump at rest and the rest spaced evenly
  const bumpAt = (i) => ((i * 360) / k.n + k.lugAng + k.sweep) * rad - (k.flank + k.nf / 2 + 0.5) / k.rc;
  const notches = Array.from({ length: k.m }, (_, j) => vee(k.R, k.y + 2 * k.gap, k.flank, k.nf, bumpAt(0) + (2 * Math.PI * j) / k.m, 1));
  // (a notch is the bump grown by the gap at its top; its flanks a gap off the bump's, near enough at these angles)
  // (each notch cut by its outline grown by half the gap with round corners, so the notch's bottom corners are round)
  const ring = subtract(solid(subtract(circle({ radius: k.Ro, segments: 192 }), circle({ radius: k.R, segments: 192 })), k.W), ...notches.map((v) => cutter(offset({ delta: k.gap / 2, corners: 'round', segments: 16 }, v), k.W)));
  return { hub, ring };
}

/**
 * A slip clutch (SlipClutch above), drawn at rest: the hub (its arms' bumps in their notches) inside the ring, a gap
 * apart all round, so the two print together in one go as two parts; or either alone.
 * @param {SlipClutch} p @param {{ part?: 'all' | 'hub' | 'ring' }} [o]
 * @returns {object} a JSCAD geom3
 */
export function slipClutch(p, { part = 'all' } = {}) {
  const k = clutchLayout(p, 'slipClutch');
  if (!['all', 'hub', 'ring'].includes(part)) throw new Error(`slipClutch: part is all, hub or ring (got ${JSON.stringify(part)})`);
  const g = clutchOutline(k);
  return part === 'all' ? union(g.hub, g.ring) : g[part];
}

/**
 * What a slip clutch does: each arm's stiffness at its tip, in toward the hub, from the beam solver on the drawn arc
 * (checked against the curved cantilever's 1 / k = r³ (φ/2 - sin 2φ / 4) / EI), the force P that lifts a bump its
 * depth, the push along the bore that rides a bump up its flank, P (μ + tan α) / (1 - μ tan α) (the snap-fit
 * guides' wedge), the torque that slips it (that times the arms and the radius), the arms' strain against half the
 * limit, the clicks a turn, and the grams.
 * @param {SlipClutch} p
 * @param {{ E: number, strainLimit: number, friction?: number, density?: number, name?: string }} m friction: μ
 *   between bump and notch (default 0.3; printed plastics 0.2 to 0.6)
 * @param {{ torque?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] torque: the most it
 *   must carry without slipping (N·mm), checked against the slip torque
 * @returns {{ stiffness: number, arc: number, lift: number, push: number, torque: number, strain: number, margin: number,
 *   clicks: number, grams: number | null, findings: object[], rests: string[] }}
 *   stiffness: the solver's, N/mm at a tip; arc: the curved cantilever's; lift: P at the depth (N); push: along the
 *   bore at a bump (N); torque: the slip torque (N·mm); strain: an arm's at the depth; margin: the limit over it
 */
export function slipClutchModel(p, m, o = {}) {
  const what = 'slipClutchModel', k = clutchLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const mu = m.friction ?? 0.3;
  if (!(typeof mu === 'number' && mu >= 0 && mu < 1)) throw new Error(`${what}: friction is μ, 0 or more and under 1 (got ${JSON.stringify(m.friction)})`);
  if (o.torque !== undefined && !(o.torque > 0)) throw new Error(`${what}: torque is the most it must carry, N·mm above 0 (got ${JSON.stringify(o.torque)})`);
  const tan = Math.tan(k.al * rad);
  if (mu * tan >= 1) throw new Error(`${what}: with friction ${mu} a ${k.al}° flank locks (μ tan α ≥ 1): it would never slip. A shallower angle`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), lim = m.strainLimit;
  // An arm in the solver: its arc from the root (fixed) to the tip, turned so the tip is at the top (radial is y), the
  // tip a body pushed in along -y by the depth, free to slide along the arc and to turn
  const phi = k.sweep * rad, path = Array.from({ length: 49 }, (_, i) => { const a = Math.PI / 2 - phi + (phi * i) / 48; return [k.rc * Math.cos(a), k.rc * Math.sin(a)]; });
  const sys = beamSystem({ bodies: { ground: { at: path[0], fixed: true }, tip: { at: path[48] } }, beams: [{ name: 'arm', path, thickness: k.t, width: k.W, E: m.E, from: 'ground', to: 'tip' }], segments: 48 });
  const d = sys.body.tip.dof + 1;
  let q, r;
  for (let i = 1; i <= 8; i++) { r = equilibrium(sys, { held: new Map([[d, (-k.y * i) / 8]]), start: q, iterations: 80 }); q = r.q; }
  const lift = -r.reaction.get(d), stiffness = lift / k.y, strain = Math.max(...Object.values(r.strain)), margin = lim / strain;
  const EI = (m.E * k.W * k.t ** 3) / 12, arcK = EI / (k.rc ** 3 * (phi / 2 - Math.sin(2 * phi) / 4));
  const push = (lift * (mu + tan)) / (1 - mu * tan), rm = k.R + k.y / 2, torque = k.n * rm * push;
  f('pass', `each arm is ${n2(stiffness, 3)} N/mm at its tip (the beam solver on the drawn arc); a curved cantilever, r³ (φ/2 - sin 2φ / 4) / EI, gives ${n2(arcK, 3)} N/mm`, 'clutch.stiffness', { values: { stiffness, arc: arcK } });
  f('pass', `a bump lifts its arm ${k.y} mm with ${n2(lift, 2)} N; up a ${k.al}° flank at μ ${mu} that takes ${n2(push, 2)} N along the bore, so ${k.n} arms at ${n2(rm, 1)} mm slip at ${n2(torque, 1)} N·mm, ${k.m} clicks a turn`, 'clutch.slip', { values: { lift, push, torque, clicks: k.m } });
  if (o.torque !== undefined) f(torque >= 2 * o.torque ? 'pass' : torque >= o.torque ? 'warn' : 'fail', `it must carry ${o.torque} N·mm: it slips at ${n2(torque, 1)} N·mm, ${n2(torque / o.torque, 2)}x${torque >= 2 * o.torque ? '' : torque >= o.torque ? ', under twice: friction varies (0.2 to 0.6 printed), so it may slip early. Thicker arms, a deeper notch or a steeper flank' : ': it slips under the load. Thicker arms, a deeper notch or a steeper flank'}`, 'clutch.torque', { values: { need: o.torque, torque } });
  f(margin >= 2 ? 'pass' : strain <= lim ? 'warn' : 'fail', `lifted ${k.y} mm an arm sees ${n2(strain * 100, 2)}%, ${margin >= 2 ? `under half the limit of ${n2(lim * 100, 1)}% (${n2(margin, 1)}x)` : strain <= lim ? `within the limit of ${n2(lim * 100, 1)}% but with only ${n2(margin, 2)}x the margin: it clicks round many times, so a longer sweep or a thinner arm` : `over the limit of ${n2(lim * 100, 1)}%: a longer sweep, a thinner arm or a shallower depth`}`, 'flexure.strain', { values: { strain, limit: lim, margin } });
  if (!r.converged) f('warn', 'the beam solver did not settle: the arm\'s stiffness is a guide only', 'clutch.solver');
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(slipClutch(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, hub and ring`, 'clutch.mass', { values: { grams } }); }
  const rests = [`friction μ ${mu}: printed plastic on itself is 0.2 to 0.6, and the slip torque moves with it (an estimate; measure it on the print)`, 'the push along the bore is the snap-fit guides\' wedge at the flank\'s angle, with the arm\'s full lift: a bump\'s rounded top rides a little easier', 'the ring taken as rigid (its wall several times an arm\'s thickness)'];
  return { stiffness, arc: arcK, lift, push, torque, strain, margin, clicks: k.m, grams, findings: out, rests };
}

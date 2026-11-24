// Things that click over and stay: two bistables beside the curved-beam one (core.mjs), each with its force curve
// from the beam solver (beams.mjs, large deflections), so the push that switches it, the pull it gives back on the
// way over, and where its second stable position is are worked out on the drawn beams, not taken from a formula.
//
// - The tilted-leaf bistable: a shuttle on two straight leaves tilted toward it (the fully compliant bistable of
//   Jensen and Howell, 2004). Pushed, the leaves are squeezed, buckle, and pass the line between their roots; past
//   it they push the shuttle on to the mirror of its rest. Printed flat, one piece, stress-free at rest.
// - The buckled-beam switch: a straight strip printed longer than the frame that holds it, so fitted it is squeezed
//   past buckling and bows one way or the other (Vangbo, 1998). Two prints, the strip and its frame; both of its
//   states are mirror images, so it switches with the same push each way.
//
// Drawn flat like every flexure here: the plan in x and y, the print from z = 0 up to the width. Units: mm, N, MPa.
import jscad from '@jscad/modeling';
import { beamProfile, printable, need } from './core.mjs';
import { beamSystem, equilibrium } from './beams.mjs';
import { size, n2, rad, sub, add, mul, unit } from './pivots.mjs';

const { polygon, rectangle, roundedRectangle, circle } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { hull } = jscad.hulls;
const { extrudeLinear } = jscad.extrusions;
const { measureVolume } = jscad.measurements;

const rect = (x0, x1, y0, y1) => rectangle({ size: [x1 - x0, y1 - y0], center: [(x0 + x1) / 2, (y0 + y1) / 2] });
// A beam's outline from a to b, its profile's half-thickness along it, running on `into` past both ends
function beamOutline(a, b, half, L, t, into) {
  const u = unit(sub(b, a)), n = [-u[1], u[0]], m = 120, top = [], bottom = [];
  const ss = [-into, ...Array.from({ length: m + 1 }, (_, i) => (L * i) / m), L + into];
  for (const s of ss) { const h = s < 0 || s > L ? t / 2 : half(s); const c = add(a, mul(u, s)); top.push(add(c, mul(n, h))); bottom.push(sub(c, mul(n, h))); }
  return polygon({ points: [...bottom, ...top.reverse()] });
}
// A pad at a beam's end, square to the beam, so the beam's rounds meet a flat face
const pad = (at, u, along, across) => { const n = [-u[1], u[0]], c = add(at, mul(u, along / 2)); return polygon({ points: [add(sub(c, mul(u, along / 2)), mul(n, across / 2)), sub(sub(c, mul(u, along / 2)), mul(n, across / 2)), sub(add(c, mul(u, along / 2)), mul(n, across / 2)), add(add(c, mul(u, along / 2)), mul(n, across / 2))] }); };
// The beam as the solver's spans, its thickness from the rounded profile
const spansOf = (a, b, half, L, n = 16) => ({ path: Array.from({ length: n + 1 }, (_, i) => add(a, mul(sub(b, a), i / n))), thickness: Array.from({ length: n }, (_, i) => 2 * half(((i + 0.5) * L) / n)) });

/**
 * The force curve of a pushed shuttle, from the beam solver: its y held at each step from rest to `to` (the push,
 * mm, along -y), its x and turn left free; each step from the last one's answer. Reads off the push that switches it
 * (the most push), the pull it gives back past the middle (the least, below 0 if it is bistable), and where it rests
 * again (where the push comes back up through 0).
 * @param {ReturnType<typeof beamSystem>} sys @param {string} body @param {number} to @param {number} [steps]
 * @param {Float64Array} [start] @param {Map<number, number>} [loads] steady loads beside the push (a nudge that picks
 *   the way the beams buckle, where a perfect beam would stand on the knife edge between two)
 * @returns {{ curve: { push: number, force: number, strain: number }[], snap: { push: number, force: number }, back: { push: number, force: number },
 *   middle: number | null, second: number | null, bistable: boolean, strain: number, converged: boolean }}
 */
export function snapCurve(sys, body, to, steps = 60, start, loads = new Map()) {
  const d = sys.body[body].dof + 1, y0 = start ? start[d] : 0, curve = [];
  let q = start, ok = true;
  for (let i = 1; i <= steps; i++) {
    const r = equilibrium(sys, { held: new Map([[d, y0 - (to * i) / steps]]), loads, start: q, iterations: 80 });
    q = r.q; ok = ok && r.converged;
    curve.push({ push: (to * i) / steps, force: -r.reaction.get(d), strain: Math.max(...Object.values(r.strain)) });
  }
  return { curve, ...readCurve(curve), converged: ok };
}

// A force curve read: the push that switches it (the most before the force first falls through 0, or the most of all
// if it never does), where it falls through 0 (the middle), the most it pulls back on after, and where the force
// comes back up through 0 (where it rests again)
function readCurve(curve) {
  const cross = (from, up) => {
    for (let i = Math.max(1, from); i < curve.length; i++) { const a = curve[i - 1], b = curve[i]; if (up ? a.force < 0 && b.force >= 0 : a.force > 0 && b.force <= 0) return { at: a.push + ((b.push - a.push) * a.force) / (a.force - b.force), i }; }
    return null;
  };
  const down = cross(1, false), upTo = down ? curve.slice(0, down.i) : curve, top = upTo.reduce((a, c) => (c.force > a.force ? c : a));
  const up = down ? cross(down.i, true) : null, low = down ? curve.slice(down.i, up ? up.i : curve.length).reduce((a, c) => (c.force < a.force ? c : a)) : curve.reduce((a, c) => (c.force < a.force ? c : a));
  const second = up ? up.at : null, within = curve.filter((c) => second == null || c.push <= second + 1e-9);
  return { snap: { push: top.push, force: top.force }, back: { push: low.push, force: low.force }, middle: down ? down.at : null, second, bistable: !!(down && up), strain: Math.max(...within.map((c) => c.strain)) };
}

// ------------------------------------------------------------------------------------------------- tilted-leaf bistable

/**
 * @typedef {{ length: number, angle: number, thickness: number, width: number, fillet?: number, shuttle?: number,
 *   block?: number, base?: number, gap?: number }} TiltedBistable
 *   length: each leaf's, shuttle to root (mm); angle: its tilt up from the roots' line toward the shuttle (degrees,
 *   above 0 and at most 30); thickness, width: the leaves'; fillet: the rounds where they meet the shuttle and the
 *   roots (default 1); shuttle: the shuttle's length along x (default 8); block: the root blocks' length along x
 *   (default 6); base: the frame's bar under the shuttle (default 6); gap: the least air (default 0.3)
 */
function tiltedLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the bistable's parameters (length, angle, thickness, width)`);
  const L = size(what, p, 'length'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), s = size(what, p, 'shuttle', 'shuttle', 8), blk = size(what, p, 'block', 'block', 6), hb = size(what, p, 'base', 'base', 6), gap = size(what, p, 'gap', 'gap', 0.3), r = p.fillet ?? 1;
  const al = p.angle;
  if (typeof al !== 'number' || !(al > 0 && al <= 30)) throw new Error(`${what}: angle is the leaves' tilt in degrees, above 0 and at most 30 (got ${JSON.stringify(p.angle)}): steeper leaves bend more than they squeeze, and won't stay over`);
  if (!(typeof r === 'number' && r >= 0 && 2 * r < L)) throw new Error(`${what}: fillet is the leaves' rounds, 0 or more and under half a leaf (got ${JSON.stringify(p.fillet)})`);
  const a = al * rad, h = L * Math.sin(a), run = L * Math.cos(a), pw = t + 2 * r + 2; // pw: the pads' width across a leaf
  const leaves = [1, -1].map((sx) => ({ sx, a: [sx * s / 2, h], b: [sx * (s / 2 + run), 0] })); // from the shuttle down to the root
  const sh = Math.max(4, pw), yLow = -h - sh / 2 - gap - 1; // the shuttle's height; its lowest when over (at -h), and a gap
  return { L, t, W, s, blk, hb, gap, r, a, h, run, pw, leaves, sh, yLow, half: beamProfile({ length: L, thickness: t, fillet: r }, 'guided') };
}

/**
 * A tilted-leaf bistable (TiltedBistable above), drawn at rest, one piece: the shuttle at y = rise (L sin α), its two
 * leaves down to root blocks either side, and the frame's bar under it all. Pushed down past the roots' line, the
 * shuttle snaps on to about y = -rise and stays.
 * @param {TiltedBistable} p
 * @param {{ part?: 'all' | 'frame' | 'shuttle' }} [o]
 * @returns {object} a JSCAD geom3
 */
export function tiltedBistable(p, { part = 'all' } = {}) {
  const k = tiltedLayout(p, 'tiltedBistable');
  if (!['all', 'frame', 'shuttle'].includes(part)) throw new Error(`tiltedBistable: part is all, frame or shuttle (got ${JSON.stringify(part)})`);
  const shuttle = [rect(-k.s / 2, k.s / 2, k.h - k.sh / 2, k.h + k.sh / 2)], frame = [], leaves = [];
  for (const lf of k.leaves) {
    const u = unit(sub(lf.b, lf.a));
    leaves.push(beamOutline(lf.a, lf.b, k.half, k.L, k.t, 0.5));
    shuttle.push(pad(lf.a, mul(u, -1), 2, k.pw)); // the shuttle's face square to the leaf
    // the root block: a pad square to the leaf, hulled down to the frame's bar
    const outer = lf.sx * (k.s / 2 + k.run + k.blk);
    frame.push(hull(pad(lf.b, u, 2, k.pw), rect(Math.min(lf.b[0], outer), Math.max(lf.b[0], outer), k.yLow - k.hb, k.yLow - k.hb + 0.01), rect(Math.min(lf.b[0] + lf.sx * 2, outer), Math.max(lf.b[0] + lf.sx * 2, outer), -k.pw / 2, k.pw / 2)));
  }
  const x1 = k.s / 2 + k.run + k.blk;
  frame.push(roundedRectangle({ size: [2 * x1, k.hb], center: [0, k.yLow - k.hb / 2], roundRadius: Math.min(1.5, k.hb / 2 - 0.01), segments: 16 }));
  const flat = { shuttle: hull(...shuttle), frame: union(...frame) };
  return extrudeLinear({ height: k.W }, part === 'all' ? union(flat.shuttle, flat.frame, ...leaves) : flat[part]);
}

/**
 * What a tilted-leaf bistable does, from the beam solver on its drawn leaves: the force curve as the shuttle is
 * pushed through, the push that switches it, the pull it gives back past the middle, where it rests again (if it
 * does), the most strain on the way, its stiffness at rest, and how it prints.
 * @param {TiltedBistable} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ steps?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] steps: the curve's
 *   (default 60, over 2.4 rises)
 * @returns {{ rise: number, stiffness: number, solvedStiffness: number, snap: { push: number, force: number }, back: { push: number, force: number },
 *   middle: number | null, second: number | null, bistable: boolean, strain: number, curve: object[], grams: number | null, findings: object[], rests: string[] }}
 *   stiffness: at rest, both leaves as fixed-guided beams, 2 (EA/L sin²α + 12EI/L³ cos²α) (N/mm); snap: the most
 *   push and where (mm down from rest); back: the most it pulls back on (a negative push) and where; second: where it
 *   rests again, mm down from rest
 */
export function tiltedBistableModel(p, m, o = {}) {
  const what = 'tiltedBistableModel', k = tiltedLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const steps = o.steps ?? 60;
  if (!(Number.isInteger(steps) && steps >= 10)) throw new Error(`${what}: steps is a whole number, 10 or more (got ${JSON.stringify(o.steps)})`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra });
  const A = k.W * k.t, I = (k.W * k.t ** 3) / 12, sa = Math.sin(k.a), ca = Math.cos(k.a);
  const stiffness = 2 * ((m.E * A) / k.L * sa * sa + ((12 * m.E * I) / k.L ** 3) * ca * ca);
  const sys = beamSystem({ bodies: { ground: { at: [0, 0], fixed: true }, shuttle: { at: [0, k.h] } }, beams: k.leaves.map((lf, i) => ({ name: `leaf ${i + 1}`, ...spansOf(lf.a, lf.b, k.half, k.L), width: k.W, E: m.E, from: 'shuttle', to: 'ground' })), segments: 32 });
  // a nudge at each leaf's middle, square to it and down, a thousandth of its buckling load: a perfect leaf squeezed
  // along its length stays straight in the solver, where a printed one bows
  const nudge = new Map(), Pcr = (4 * Math.PI ** 2 * m.E * I) / k.L ** 2;
  for (const lf of k.leaves) {
    const nodes = sys.nodes.filter((n) => n.beam === `leaf ${k.leaves.indexOf(lf) + 1}`), mid = nodes[Math.floor(nodes.length / 2)], u = unit(sub(lf.b, lf.a)), nn = [-u[1] * lf.sx, u[0] * lf.sx];
    const down = nn[1] < 0 ? nn : mul(nn, -1);
    nudge.set(mid.dof, 1e-3 * Pcr * down[0]); nudge.set(mid.dof + 1, 1e-3 * Pcr * down[1]);
  }
  const sc = snapCurve(sys, 'shuttle', 2.4 * k.h, steps, undefined, nudge), lim = m.strainLimit;
  const probe = 1e-4 * k.h, solvedStiffness = -equilibrium(sys, { held: new Map([[sys.body.shuttle.dof + 1, -probe]]) }).reaction.get(sys.body.shuttle.dof + 1) / probe; // a ten-thousandth of the rise, no nudge
  const rests = ['the force curve is the beam solver\'s on the drawn leaves, the shuttle free to slide sideways and turn; the frame taken as rigid'];
  f('pass', `at rest the shuttle is ${n2(stiffness, 2)} N/mm stiff (two fixed-guided leaves, 2 (EA/L sin²α + 12EI/L³ cos²α)); the solver's ${n2(solvedStiffness, 2)} N/mm (rounds included)`, 'bistable.stiffness', { values: { stiffness, solvedStiffness } });
  if (sc.bistable) f('pass', `pushed ${n2(sc.snap.push)} mm it takes ${n2(sc.snap.force)} N, the most; past ${n2(sc.middle)} mm it snaps on by itself, pulling with up to ${n2(-sc.back.force)} N, and rests ${n2(sc.second)} mm from where it started (the rise is ${n2(k.h)} mm). Back the other way takes about ${n2(-sc.back.force)} N`, 'bistable.snap', { values: { snap: sc.snap, back: sc.back, middle: sc.middle, second: sc.second } });
  else f('fail', `it does not stay over: pushed through ${n2(2.4 * k.h)} mm the force never falls below 0 (its least is ${n2(sc.back.force)} N at ${n2(sc.back.push)} mm), so it springs back. Longer, thinner leaves or a steeper tilt`, 'bistable.snap', { values: { snap: sc.snap, back: sc.back } });
  const most = sc.strain;
  f(most <= lim ? 'pass' : 'fail', `on the way over the leaves see at most ${n2(most * 100, 2)}%, ${most <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%`, 'flexure.strain', { values: { strain: most, limit: lim } });
  if (!sc.converged) f('warn', 'the beam solver did not settle at every step: the force curve is a guide only', 'bistable.solver');
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(tiltedBistable(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'bistable.mass', { values: { grams } }); }
  return { rise: k.h, stiffness, solvedStiffness, snap: sc.snap, back: sc.back, middle: sc.middle, second: sc.second, bistable: sc.bistable, strain: most, curve: sc.curve, grams, findings: out, rests };
}

// ----------------------------------------------------------------------------------------------- buckled-beam switch

/**
 * @typedef {{ length: number, thickness: number, width: number, squeeze: number, fillet?: number, pad?: number,
 *   tab?: number[], knob?: number, fit?: number, wall?: number, base?: number, gap?: number }} BuckledSwitch
 *   length: the strip between its end tabs as printed (mm); thickness, width: the strip's; squeeze: how much shorter
 *   the frame holds it (mm); fillet: the strip's rounds into its tabs and middle pad (default 1); pad: the middle
 *   pad's length along x (default 4); tab: each end tab [along x, across y] (default [5, 6]); knob: the stem from the
 *   pad up out of the frame, its length past the frame's top to the knob's middle (default 1.25 rises, the knob's 2.5 mm radius and 1), with a round end to push and pull; fit: the
 *   tab in its pocket, per side (default 0.05, a press fit: an estimate); wall: the frame round the pockets (default
 *   4); base: the frame's bar under the strip (default 10, stiff enough that the strip's push opens it little); gap:
 *   the least air (default 0.3)
 */
// The rise a squeezed uniform clamped strip bows to (first buckled mode, w = h/2 (1 - cos 2πx/L)): the squeeze is
// the arc's extra length π²h²/4L and the strip's own shortening at the buckling load, π²t²/3L
const riseOf = (L, t, s) => (2 / Math.PI) * Math.sqrt(Math.max(0, L * s - (Math.PI * t) ** 2 / 3));

function switchLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the switch's parameters (length, thickness, width, squeeze)`);
  const L = size(what, p, 'length'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), sq = size(what, p, 'squeeze'), pl = size(what, p, 'pad', 'pad', 4), r = p.fillet ?? 1;
  const tab = p.tab ?? [5, 6], fit = p.fit ?? 0.05, wall = size(what, p, 'wall', 'wall', 4), hb = size(what, p, 'base', 'base', 10), gap = size(what, p, 'gap', 'gap', 0.3);
  if (!(Array.isArray(tab) && tab.length === 2 && tab.every((x) => typeof x === 'number' && x > 0))) throw new Error(`${what}: tab is [along x, across y] in mm, both above 0 (got ${JSON.stringify(p.tab)})`);
  if (!(typeof fit === 'number' && fit >= 0)) throw new Error(`${what}: fit is the tab's play in its pocket per side, 0 or more (got ${JSON.stringify(p.fit)})`);
  if (!(typeof r === 'number' && r >= 0)) throw new Error(`${what}: fillet is the strip's rounds, 0 or more (got ${JSON.stringify(p.fillet)})`);
  const lb = (L - pl) / 2; // each half beam, tab to pad
  if (lb <= 2 * r + t) throw new Error(`${what}: length ${L} leaves the half beams ${n2(lb)} mm between tab and pad: over ${n2(2 * r + t + pl)} for a ${pl} mm pad`);
  if (sq >= 0.1 * L) throw new Error(`${what}: squeeze ${sq} is a tenth of the length or more: the strip would bow far past what a flat strip bends to without yielding (under ${n2(0.1 * L)})`);
  const half = beamProfile({ length: lb, thickness: t, fillet: r }, 'guided'), ph = Math.max(t + 2 * r + 2, 4), knobR = 2.5;
  // the knob clears the frame's top by a gap with the pad over at its far side (a quarter past the rise, for room)
  const knob = size(what, p, 'knob', 'knob', 1.25 * riseOf(L - sq, t, sq) + knobR + 1);
  if (knob < 1.25 * riseOf(L - sq, t, sq) + knobR + gap) throw new Error(`${what}: knob ${knob} lets the knob land on the frame's top before the pad is over: ${n2(1.25 * riseOf(L - sq, t, sq) + knobR + gap)} or more`);
  return { L, t, W, sq, pl, r, tab, fit, wall, hb, gap, knob, knobR, lb, half, ph };
}

/**
 * A buckled-beam switch (BuckledSwitch above): two prints, the strip (end tabs, two half beams, a middle pad with a
 * knob on a stem) and the frame (a bar with a pocket at each end, `squeeze` nearer each other than the strip's tabs).
 * Each drawn flat as printed, the strip straight, side by side: the strip above the frame along y.
 * @param {BuckledSwitch} p
 * @param {{ part?: 'all' | 'strip' | 'frame' }} [o]
 * @returns {object} a JSCAD geom3
 */
export function buckledSwitch(p, { part = 'all' } = {}) {
  const k = switchLayout(p, 'buckledSwitch');
  if (!['all', 'strip', 'frame'].includes(part)) throw new Error(`buckledSwitch: part is all, strip or frame (got ${JSON.stringify(part)})`);
  const g = geometry(k);
  const strip = extrudeLinear({ height: k.W }, g.strip), frame = extrudeLinear({ height: k.W }, g.frame);
  if (part === 'strip') return strip;
  if (part === 'frame') return frame;
  return union(jscad.transforms.translate([0, g.stripAt, 0], strip), frame);
}
function geometry(k) {
  const x0 = -k.L / 2, x1 = k.L / 2, [ta, tc] = k.tab, room = riseOf(k.L - k.sq, k.t, k.sq) * 1.25 + k.ph / 2 + k.gap + 1; // how far the pad goes either way, and air
  // the strip: tabs, half beams, the pad, a stem up past the frame's top and a round knob
  const beams = [beamOutline([x0, 0], [x0 + k.lb, 0], k.half, k.lb, k.t, 0.5), beamOutline([k.pl / 2, 0], [x1, 0], k.half, k.lb, k.t, 0.5)];
  const top = room + k.wall, stemW = Math.max(3, k.ph / 2), knobR = k.knobR;
  const stem = roundedRectangle({ size: [stemW, top + k.knob - 0.0], center: [0, (top + k.knob) / 2], roundRadius: Math.min(1, stemW / 2 - 0.01), segments: 16 });
  const tabAt = (xa, xb) => roundedRectangle({ size: [xb - xa, tc], center: [(xa + xb) / 2, 0], roundRadius: 0.8, segments: 16 }); // round corners, seated in the pockets' rounds
  const strip = union(tabAt(x0 - ta, x0 + 1), tabAt(x1 - 1, x1 + ta), roundedRectangle({ size: [k.pl, k.ph], center: [0, 0], roundRadius: Math.min(1, k.pl / 2 - 0.01, k.ph / 2 - 0.01), segments: 16 }), ...beams, stem, circle({ radius: knobR, center: [0, top + k.knob], segments: 32 }));
  // the frame: a C open at the top, its pockets' far faces squeeze nearer than the tabs' (the tabs fitted, the strip
  // between them is length - squeeze); the window between the pockets lets the pad go its rise either way
  const f0 = x0 + k.sq / 2, f1 = x1 - k.sq / 2, outer = f1 + ta + k.wall, yb = -room - k.hb;
  const body = roundedRectangle({ size: [2 * outer, top - yb], center: [0, (top + yb) / 2], roundRadius: 2, segments: 16 });
  const pocketL = roundedRectangle({ size: [ta + 1, tc + 2 * k.fit], center: [f0 - ta / 2 + 0.5, 0], roundRadius: 0.5, segments: 8 });
  const pocketR = roundedRectangle({ size: [ta + 1, tc + 2 * k.fit], center: [f1 + ta / 2 - 0.5, 0], roundRadius: 0.5, segments: 8 });
  // (each pocket's far corners round, its near side open into the window: the tab is held on three sides and its end)
  const window = roundedRectangle({ size: [f1 - f0, 2 * room], center: [0, 0], roundRadius: 1.5, segments: 16 });
  const slot = rect(-(stemW / 2 + k.gap), stemW / 2 + k.gap, 0, top + 1); // the stem's way out at the top, a sliding fit that keeps the pad square
  const frame = subtract(body, pocketL, pocketR, window, slot);
  // each pocket's far face is squeeze/2 nearer the middle than its tab's outer end as printed: fitted, the strip is length - squeeze
  return { strip, frame, stripAt: top - yb + knobR + 2 * k.knob + 4, room, top, yb, outer, f0, f1 };
}

/**
 * What a buckled-beam switch does, from the beam solver: the strip squeezed between its pockets bows to its rise
 * (checked against the uniform strip's (2/π)√(L s - π²t²/3)), then its pad is pushed through to the other side: the
 * force curve, the push that switches it (the same each way: its two states are mirrors), the strain, the frame's
 * give under the strip's end load, and the grams.
 * @param {BuckledSwitch} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ steps?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o]
 * @returns {{ rise: number, formula: number, load: number, euler: number, give: number, snap: { push: number, force: number },
 *   back: { push: number, force: number }, second: number | null, bistable: boolean, strain: number, curve: object[], grams: number | null, findings: object[], rests: string[] }}
 *   rise: the pad's bow once fitted (solver); formula: the uniform strip's; load: the strip's push on each pocket (N);
 *   euler: 4π²EI/L², the clamped strip's buckling load; give: how far the strip's load opens the frame (mm), taken
 *   off the squeeze
 */
export function buckledSwitchModel(p, m, o = {}) {
  const what = 'buckledSwitchModel', k = switchLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const steps = o.steps ?? 60;
  if (!(Number.isInteger(steps) && steps >= 10)) throw new Error(`${what}: steps is a whole number, 10 or more (got ${JSON.stringify(o.steps)})`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), lim = m.strainLimit;
  const I = (k.W * k.t ** 3) / 12, Lc = k.L - k.sq, euler = (4 * Math.PI ** 2 * m.E * I) / (Lc * Lc), g = geometry(k);
  // The frame's give: the strip pushes each pocket out with about the buckling load P, H above the bar's middle and
  // h above its top; the C opens by the bar bending under P H (each end turns P H l / 2EI_bar, so P H² l / E I_bar
  // in all) and each end block, as wide as its tab and wall, bending as a cantilever h long (2 P h³ / 3 E I_block)
  const H = -(g.yb + k.hb / 2), h = g.room, lbar = 2 * g.outer, Ibar = (k.W * k.hb ** 3) / 12, Iblk = (k.W * (k.tab[0] + k.wall) ** 3) / 12;
  const soft = (H * H * lbar) / (m.E * Ibar) + (2 * h ** 3) / (3 * m.E * Iblk); // mm a newton
  let give = euler * soft, sq = k.sq - give;
  const rests = [`the tabs held square in their pockets (fit ${k.fit} mm a side, an estimate of a press fit); a looser fit lets them turn and the strip bows further, with a smaller snap`, 'the frame\'s give from beam sums on the C, at the strip\'s load'];
  if (sq <= 0) throw new Error(`${what}: the frame gives ${n2(give, 3)} mm under the strip's ${n2(euler, 1)} N, all of the ${k.sq} mm squeeze: a deeper base or a thicker wall`);
  // the solver: the left tab is the ground, the right tab a body held where its pocket puts it, the pad a body
  const x0 = -k.L / 2, sys = beamSystem({
    bodies: { ground: { at: [x0, 0], fixed: true }, pad: { at: [0, 0] }, tab: { at: [k.L / 2, 0] } },
    beams: [{ name: 'left', ...spansOf([x0, 0], [x0 + k.lb, 0], k.half, k.lb), width: k.W, E: m.E, from: 'ground', to: 'pad' }, { name: 'right', ...spansOf([k.pl / 2, 0], [k.L / 2, 0], k.half, k.lb), width: k.W, E: m.E, from: 'pad', to: 'tab' }],
    segments: 32,
  });
  const tx = sys.body.tab.dof, py = sys.body.pad.dof + 1, nudge = 1e-3 * euler;
  // squeezed in steps with a nudge up on the pad, so it bows up; then the nudge let go. Twice: first with the frame's
  // give at the buckling load, then at the load the strip really pushes with (its rounds and pad make it stiffer)
  let q, r;
  const squeeze = (to) => {
    q = undefined;
    for (let i = 1; i <= 12; i++) { r = equilibrium(sys, { held: new Map([[tx, (-to * i) / 12], [tx + 1, 0], [tx + 2, 0]]), loads: new Map([[py, nudge]]), start: q, iterations: 80 }); q = r.q; }
    r = equilibrium(sys, { held: new Map([[tx, -to], [tx + 1, 0], [tx + 2, 0]]), start: q, iterations: 80 });
  };
  squeeze(sq);
  give = -r.reaction.get(tx) * soft; sq = k.sq - give;
  if (sq <= 0) throw new Error(`${what}: the frame gives ${n2(give, 3)} mm under the strip's push, all of the ${k.sq} mm squeeze: a deeper base or a thicker wall`);
  squeeze(sq);
  const rise = r.q[py], load = -r.reaction.get(tx), formula = riseOf(Lc, k.t, sq);
  // then the pad pushed down through to past its mirror, the tab still held
  const held = new Map([[tx, -sq], [tx + 1, 0], [tx + 2, 0]]), curve = [];
  q = r.q;
  let ok = r.converged;
  for (let i = 1; i <= steps; i++) {
    const push = (2.4 * rise * i) / steps, s = equilibrium(sys, { held: new Map([...held, [py, rise - push], [py + 1, 0]]), start: q, iterations: 80 }); // the pad kept square: its stem slides in the frame's slot
    q = s.q; ok = ok && s.converged;
    curve.push({ push, force: -s.reaction.get(py), strain: Math.max(...Object.values(s.strain)) });
  }
  const rc = readCurve(curve), top = rc.snap, low = rc.back, second = rc.second, bistable = rc.bistable, most = Math.max(Math.max(...Object.values(r.strain)), rc.strain);
  f('pass', `fitted, the strip is squeezed ${n2(sq, 3)} mm (${k.sq} less the frame's give of ${n2(give, 3)} mm) and pushes each pocket with ${n2(load, 1)} N (it buckles at ${n2(euler, 1)} N, 4π²EI/L²); the pad bows ${n2(rise)} mm (a uniform strip: ${n2(formula)} mm)`, 'switch.rise', { values: { rise, formula, load, euler, give } });
  if (bistable) f('pass', `pushed ${n2(top.push)} mm the pad takes ${n2(top.force)} N, the most; then it snaps over, pulling with up to ${n2(-low.force)} N, and rests ${n2(second)} mm from where it was. The other way is the mirror: ${n2(top.force)} N to switch back`, 'switch.snap', { values: { snap: top, back: low, second } });
  else f('fail', `it does not stay over: the push never falls below 0 (its least ${n2(low.force)} N), so it springs back: more squeeze`, 'switch.snap', { values: { snap: top, back: low } });
  f(most <= lim ? 'pass' : 'fail', `fitted and switched the strip sees at most ${n2(most * 100, 2)}%, ${most <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%`, 'flexure.strain', { values: { strain: most, limit: lim } });
  if (give > 0.25 * k.sq) f('warn', `the frame gives ${n2(give, 3)} mm, over a quarter of the ${k.sq} mm squeeze: the switch depends on the frame's stiffness as much as the strip's. A deeper base or wider end blocks`, 'switch.frame', { values: { give, squeeze: k.sq } });
  if (!ok) f('warn', 'the beam solver did not settle at every step: the force curve is a guide only', 'switch.solver');
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(buckledSwitch(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, strip and frame`, 'switch.mass', { values: { grams } }); }
  return { rise, formula, load, euler, give, snap: { push: top.push, force: top.force }, back: { push: low.push, force: low.force }, second, bistable, strain: most, curve, grams, findings: out, rests };
}

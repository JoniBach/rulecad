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

const STEM = 2; // mm: the knob's stem, across
const rect = (x0, x1, y0, y1) => rectangle({ size: [x1 - x0, y1 - y0], center: [(x0 + x1) / 2, (y0 + y1) / 2] });
// A beam's outline from a to b, its profile's half-thickness along it, running on `into` past both ends
function beamOutline(a, b, half, L, t, into, r = 0) {
  const u = unit(sub(b, a)), n = [-u[1], u[0]], m = 120, top = [], bottom = [], fine = r ? Array.from({ length: 33 }, (_, i) => (r * i) / 32) : []; // the rounds, finely
  const ss = [-into, ...[...new Set([...Array.from({ length: m + 1 }, (_, i) => (L * i) / m), ...fine, ...fine.map((x) => L - x)])].sort((x, y) => x - y), L + into];
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
 * @param {Map<number, number>} [held] other unknowns held throughout (where the frame is supported, when it is a body)
 * @returns {{ curve: { push: number, force: number, strain: number }[], snap: { push: number, force: number }, back: { push: number, force: number },
 *   middle: number | null, second: number | null, bistable: boolean, strain: number, converged: boolean }}
 */
export function snapCurve(sys, body, to, steps = 60, start, loads = new Map(), held = new Map()) {
  const d = sys.body[body].dof + 1, y0 = start ? start[d] : 0, curve = [];
  let q = start, ok = true;
  for (let i = 1; i <= steps; i++) {
    const r = equilibrium(sys, { held: new Map([...held, [d, y0 - (to * i) / steps]]), loads, start: q, iterations: 80 });
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
 *   (default 6); base: the frame's bar under the shuttle (default 20: the leaves' squeeze pushes the roots out above
 *   it, and a shallower bar bends enough to take much of the snap away; see tiltedBistableModel); gap: the least air
 *   (default 0.3)
 */
function tiltedLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the bistable's parameters (length, angle, thickness, width)`);
  const L = size(what, p, 'length'), t = size(what, p, 'thickness'), W = size(what, p, 'width'), s = size(what, p, 'shuttle', 'shuttle', 8), blk = size(what, p, 'block', 'block', 6), hb = size(what, p, 'base', 'base', 20), gap = size(what, p, 'gap', 'gap', 0.3), r = p.fillet ?? 1;
  const al = p.angle;
  if (typeof al !== 'number' || !(al > 0 && al <= 30)) throw new Error(`${what}: angle is the leaves' tilt in degrees, above 0 and at most 30 (got ${JSON.stringify(p.angle)}): steeper leaves bend more than they squeeze, and won't stay over`);
  if (!(typeof r === 'number' && r >= 0 && 2 * r < L)) throw new Error(`${what}: fillet is the leaves' rounds, 0 or more and under half a leaf (got ${JSON.stringify(p.fillet)})`);
  const a = al * rad, h = L * Math.sin(a), run = L * Math.cos(a), pw = t + 2 * r + 2; // pw: the pads' width across a leaf
  const sh = Math.max(4, pw), yLow = -h - sh / 2 - gap - 1; // the shuttle's height; its lowest when over (at -h), and a gap
  // each leaf from the shuttle down to its root; the root block's face square to the leaf (hi and lo its ends), then
  // from lo down at 45° to the bar's top (the foot), so its corners there open to 135°; the block runs out to outer
  const leaves = [1, -1].map((sx) => {
    const a = [sx * s / 2, h], b = [sx * (s / 2 + run), 0], u = unit(sub(b, a)), n = [-u[1], u[0]], e1 = add(b, mul(n, pw / 2)), e2 = sub(b, mul(n, pw / 2));
    const lo = e1[1] < e2[1] ? e1 : e2, hi = e1[1] < e2[1] ? e2 : e1;
    return { sx, a, b, u, lo, hi, foot: [lo[0] - sx * (lo[1] - yLow), yLow], outer: sx * (s / 2 + run + blk) };
  });
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
    const u = lf.u;
    leaves.push(beamOutline(lf.a, lf.b, k.half, k.L, k.t, 0.5, k.r));
    shuttle.push(pad(lf.a, mul(u, -1), 2, k.pw)); // the shuttle's face square to the leaf
    // the root block (its corners at the foot open to 135°, under the leaf, which leaves its root rising at the tilt,
    // or falling at it when over); outward to the frame's end
    const pts = [lf.hi, lf.lo, lf.foot, [lf.outer, k.yLow], [lf.outer, lf.hi[1]]];
    const area = pts.reduce((a, q, i) => { const r = pts[(i + 1) % pts.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0);
    frame.push(polygon({ points: area > 0 ? pts : pts.slice().reverse() })); // anticlockwise, as JSCAD's outlines run
  }
  const x1 = k.s / 2 + k.run + k.blk;
  frame.push(rect(-x1, x1, k.yLow - k.hb, k.yLow)); // (its corners are outside ones: square is fine)
  const flat = { shuttle: hull(...shuttle), frame: union(...frame) };
  return extrudeLinear({ height: k.W }, part === 'all' ? union(flat.shuttle, flat.frame, ...leaves) : flat[part]);
}

/**
 * What a tilted-leaf bistable does, from the beam solver on its drawn leaves and frame: the force curve as the shuttle is
 * pushed through, the push that switches it, the pull it gives back past the middle, where it rests again (if it
 * does), the most strain on the way, its stiffness at rest, and how it prints.
 * @param {TiltedBistable} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ steps?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] steps: the curve's
 *   (default 60, over 2.4 rises)
 * @returns {{ rise: number, stiffness: number, solvedStiffness: number, snap: { push: number, force: number }, back: { push: number, force: number },
 *   middle: number | null, second: number | null, bistable: boolean, strain: number, curve: object[],
 *   rigid: { snap: { push: number, force: number }, back: { push: number, force: number }, second: number | null, bistable: boolean },
 *   grams: number | null, findings: object[], rests: string[] }}
 *   stiffness: at rest, both leaves as fixed-guided beams, 2 (EA/L sin²α + 12EI/L³ cos²α) (N/mm); snap: the most
 *   push and where (mm down from rest); back: the most it pulls back on (a negative push) and where; second: where it
 *   rests again, mm down from rest. These with the frame's bar bending, the frame sat on its two blocks; rigid: the
 *   same on a frame that does not give (screwed down flat it comes near these)
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
  // Two systems. The leaves on a rigid frame (the ground at the roots), for the stiffness at rest and to compare. And
  // the part as drawn: the frame's bar a beam from its middle out to each block's foot, each root block a body. The
  // leaves' squeeze pushes the roots out a few millimetres above the bar, so the bar bends and the blocks turn
  // outward, and the leaves are squeezed less: with the roots that far above it, a bar no deeper than the blocks
  // gives more than the leaves do along their length. The frame sat on its two blocks, held up and down there and free
  // to spread and turn (on a bench, or on two screws that do not clamp); the bar's middle held only as the mirror
  // holds it (no slide across, no turn). Screwed down flat, it is stiffer, nearer the rigid frame's figures.
  const leafBeams = (to) => k.leaves.map((lf, i) => ({ name: `leaf ${i + 1}`, ...spansOf(lf.a, lf.b, k.half, k.L), width: k.W, E: m.E, from: 'shuttle', to: to(i) }));
  const rigid = beamSystem({ bodies: { ground: { at: [0, 0], fixed: true }, shuttle: { at: [0, k.h] } }, beams: leafBeams(() => 'ground'), segments: 32 });
  const yc = k.yLow - k.hb / 2, bodies = { middle: { at: [0, yc] }, shuttle: { at: [0, k.h] } }, bars = [];
  k.leaves.forEach((lf, i) => {
    bodies[`block ${i + 1}`] = { at: [(lf.foot[0] + lf.outer) / 2, yc] }; // the block's support, under its middle
    bars.push({ name: `bar ${i + 1}`, path: Array.from({ length: 9 }, (_, j) => [(lf.foot[0] * j) / 8, yc]), thickness: k.hb, width: k.W, E: m.E, from: 'middle', to: `block ${i + 1}` });
  });
  const sys = beamSystem({ bodies, beams: [...leafBeams((i) => `block ${i + 1}`), ...bars], segments: 32 });
  const support = new Map([[sys.body.middle.dof, 0], [sys.body.middle.dof + 2, 0], ...k.leaves.map((_, i) => [sys.body[`block ${i + 1}`].dof + 1, 0])]);
  // a nudge at each leaf's middle, square to it and down, a thousandth of its buckling load: a perfect leaf squeezed
  // along its length stays straight in the solver, where a printed one bows
  const Pcr = (4 * Math.PI ** 2 * m.E * I) / k.L ** 2, nudgeOf = (sy) => {
    const nudge = new Map();
    k.leaves.forEach((lf, i) => {
      const nodes = sy.nodes.filter((n) => n.beam === `leaf ${i + 1}`), mid = nodes[Math.floor(nodes.length / 2)], nn = [-lf.u[1] * lf.sx, lf.u[0] * lf.sx];
      const down = nn[1] < 0 ? nn : mul(nn, -1);
      nudge.set(mid.dof, 1e-3 * Pcr * down[0]); nudge.set(mid.dof + 1, 1e-3 * Pcr * down[1]);
    });
    return nudge;
  };
  const sc = snapCurve(sys, 'shuttle', 2.4 * k.h, steps, undefined, nudgeOf(sys), support), lim = m.strainLimit;
  const r0 = snapCurve(rigid, 'shuttle', 2.4 * k.h, steps, undefined, nudgeOf(rigid));
  const probe = 1e-4 * k.h, solvedStiffness = -equilibrium(rigid, { held: new Map([[rigid.body.shuttle.dof + 1, -probe]]) }).reaction.get(rigid.body.shuttle.dof + 1) / probe; // a ten-thousandth of the rise, no nudge
  const rests = ['the force curve is the beam solver\'s on the drawn leaves and the frame\'s bar, the shuttle free to slide sideways and turn, the frame sat on its two blocks (held up and down there, free to spread and turn); the root blocks taken as rigid'];
  f('pass', `at rest the shuttle is ${n2(stiffness, 2)} N/mm stiff (two fixed-guided leaves, 2 (EA/L sin²α + 12EI/L³ cos²α)); the solver's ${n2(solvedStiffness, 2)} N/mm (rounds included), both on a rigid frame`, 'bistable.stiffness', { values: { stiffness, solvedStiffness } });
  if (sc.bistable) f('pass', `pushed ${n2(sc.snap.push)} mm it takes ${n2(sc.snap.force)} N, the most; past ${n2(sc.middle)} mm it snaps on by itself, pulling with up to ${n2(-sc.back.force)} N, and rests ${n2(sc.second)} mm from where it started (the rise is ${n2(k.h)} mm). Back the other way takes about ${n2(-sc.back.force)} N`, 'bistable.snap', { values: { snap: sc.snap, back: sc.back, middle: sc.middle, second: sc.second } });
  else f('fail', `it does not stay over: pushed through ${n2(2.4 * k.h)} mm the force never falls below 0 (its least is ${n2(sc.back.force)} N at ${n2(sc.back.push)} mm), so it springs back. ${r0.bistable ? `On a rigid frame it would (${n2(-r0.back.force)} N back): the frame's ${k.hb} mm bar bends and lets the roots spread, so a deeper base` : 'Longer, thinner leaves or a steeper tilt'}`, 'bistable.snap', { values: { snap: sc.snap, back: sc.back, rigid: r0.back } });
  // the frame's share: what the bar's bending costs of the pull back, against the leaves on a rigid frame
  if (sc.bistable && r0.bistable) {
    const kept = sc.back.force / r0.back.force;
    f(kept >= 0.5 ? 'pass' : 'warn', `sat on its blocks, the frame's ${k.hb} mm bar bends and the roots spread: it pulls back with ${n2(-sc.back.force)} N, ${n2(kept * 100, 0)}% of the ${n2(-r0.back.force)} N on a rigid frame${kept >= 0.5 ? '' : ': the frame takes over half of it, so the bistable depends on the frame as much as on its leaves. A deeper base, or the blocks screwed down flat'}`, 'bistable.frame', { values: { back: sc.back.force, rigid: r0.back.force, kept, base: k.hb } });
  }
  const most = sc.strain;
  f(most <= lim ? 'pass' : 'fail', `on the way over the leaves see at most ${n2(most * 100, 2)}%, ${most <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%`, 'flexure.strain', { values: { strain: most, limit: lim } });
  if (!sc.converged) f('warn', 'the beam solver did not settle at every step: the force curve is a guide only', 'bistable.solver');
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W }, o.printer, m)) out.push(x);
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(tiltedBistable(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'bistable.mass', { values: { grams } }); }
  return { rise: k.h, stiffness, solvedStiffness, snap: sc.snap, back: sc.back, middle: sc.middle, second: sc.second, bistable: sc.bistable, strain: most, curve: sc.curve, rigid: { snap: r0.snap, back: r0.back, second: r0.second, bistable: r0.bistable }, grams, findings: out, rests };
}

// ----------------------------------------------------------------------------------------------- buckled-beam switch

/**
 * @typedef {{ length: number, thickness: number, width: number, squeeze: number, fillet?: number, pad?: number,
 *   tab?: number[], knob?: number, fit?: number, wall?: number, base?: number, gap?: number }} BuckledSwitch
 *   length: the strip between its end tabs as printed (mm); thickness, width: the strip's; squeeze: how much shorter
 *   the frame holds it (mm); fillet: the strip's rounds into its tabs and middle pad (default 1); pad: the middle
 *   pad's length along x (default 4, the least: the knob's 2 mm stem stands on it on 45° shoulders); tab: each end tab [along x, across y] (default [5, 6]); knob: the stem from the
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
  if (pl < STEM + 2) throw new Error(`${what}: pad ${pl} is narrower than the knob's stem and its shoulders: ${STEM + 2} mm or more`);
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
  const beams = [beamOutline([x0, 0], [x0 + k.lb, 0], k.half, k.lb, k.t, 0.5, k.r), beamOutline([k.pl / 2, 0], [x1, 0], k.half, k.lb, k.t, 0.5, k.r)];
  const top = room + k.wall, stemW = STEM, knobR = k.knobR;
  const stem = union(rect(-stemW / 2, stemW / 2, 0, top + k.knob), hull(rect(-stemW / 2 - 1, stemW / 2 + 1, k.ph / 2 - 0.01, k.ph / 2), rect(-stemW / 2, stemW / 2, k.ph / 2 + 1, k.ph / 2 + 1.01))); // on 45° shoulders, from the pad's top corners
  const tabAt = (xa, xb) => roundedRectangle({ size: [xb - xa, tc], center: [(xa + xb) / 2, 0], roundRadius: 0.8, segments: 16 }); // round corners, seated in the pockets' rounds
  const strip = union(tabAt(x0 - ta, x0), tabAt(x1, x1 + ta), rect(-k.pl / 2, k.pl / 2, -k.ph / 2, k.ph / 2), ...beams, stem, hull(circle({ radius: knobR, center: [0, top + k.knob], segments: 64 }), rect(-stemW / 2, stemW / 2, top + k.knob - knobR - 1.5, top + k.knob - knobR - 1.49)));
  // the frame: a C open at the top, its pockets' far faces squeeze nearer than the tabs' (the tabs fitted, the strip
  // between them is length - squeeze); the window between the pockets lets the pad go its rise either way
  const f0 = x0 + k.sq / 2, f1 = x1 - k.sq / 2, outer = f1 + ta + k.wall, yb = -room - k.hb;
  const body = roundedRectangle({ size: [2 * outer, top - yb], center: [0, (top + yb) / 2], roundRadius: 2, segments: 16 });
  const pocketL = roundedRectangle({ size: [ta + 1, tc + 2 * k.fit], center: [f0 - ta / 2 + 0.5, 0], roundRadius: 0.5, segments: 32 });
  const pocketR = roundedRectangle({ size: [ta + 1, tc + 2 * k.fit], center: [f1 + ta / 2 - 0.5, 0], roundRadius: 0.5, segments: 32 });
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

// ------------------------------------------------------------------------------------------ the balanced strip cell

// A zero-stiffness cell from the buckled strip. Pushed through with its pad held square, the strip goes over in its
// symmetric shape and is negative only near its straight middle, less so the further it goes. With the pad free to turn
// it goes over in its second, S-shaped mode, and its force falls in a straight line: the same negative stiffness all
// the way to where it turns back to its symmetric shape (Vangbo, An analytical analysis of a compressed bistable buckled
// beam, Sensors and Actuators A 69, 1998). A straight spring as stiff, in parallel, cancels it over all of that.
// So here the pad is a ring round a disc on the knob's stem (a pin printed in place, so the pad turns freely), and the
// knob presses into a carriage on two leaves from a post on the frame: a parallel guide, the spring, straight in its
// force as its leaves are free to draw in at their ends (leaves held at both ends would stretch and stiffen).

/**
 * @typedef {BuckledSwitch & { spring?: { stiffness?: number, thickness?: number, length?: number, gap?: number, post?: number }, disc?: number, within?: number }} BalancedStrip
 *   the buckled switch's strip and frame (BuckledSwitch above; pad defaults to the ring's width here), and:
 *   spring.stiffness, N/mm (default 10% over the strip's negative stiffness, so the pair is just stable); thickness: the
 *   two leaves' (default the least whole number of 0.42 mm lines that keeps them within half the strain limit over
 *   the strip's rise either way); length: each leaf's (default: set by the solver to the stiffness); gap: between the
 *   two leaves (default 6); post: the post's length along x (default 6). disc: the pin's disc radius (default 2.5).
 *   within: the share of the spring's stiffness the pair may stray from 0 in its flat range (default 0.1)
 */
const LINE = 0.42; // mm: the kit's printer's line (x1c), for the leaves' default thickness in whole lines
const RING = 1.5; // mm: the pad's ring round the disc

function cellLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the cell's parameters (length, thickness, width, squeeze)`);
  const rd = size(what, p, 'disc', 'disc', 2.5), gap = p.gap ?? 0.3, ro = rd + gap + RING;
  const k = switchLayout({ ...p, pad: p.pad ?? Math.ceil(2 * ro + 0.5) }, what);
  if (k.pl < 2 * ro) throw new Error(`${what}: pad ${k.pl} is narrower than the ring round the disc: ${n2(2 * ro)} or more`);
  return { ...k, rd, ro };
}

// The spring's two leaves from the stiffness wanted, 2 fixed-guided leaves together 2 E W t³ / l³, so l = t c with
// c = (2 E W / k)^(1/3); a leaf's strain at a travel δ is 3 t δ / l² = 3 δ / (t c²), which falls as t grows: the least
// t in whole lines that keeps it within half the limit
function springOf(k, sp, kpos, reach, m, what) {
  const c = Math.cbrt((2 * m.E * k.W) / kpos), t = sp.thickness ?? Math.max(2, Math.ceil((6 * reach) / (c * c * m.strainLimit) / LINE - 1e-9)) * LINE;
  if (!(typeof t === 'number' && t > 0)) throw new Error(`${what}: spring.thickness is the leaves' thickness, above 0 mm (got ${JSON.stringify(sp.thickness)})`);
  const gap = size(what, sp, 'gap', 'spring.gap', 6), post = size(what, sp, 'post', 'spring.post', 6), l = sp.length ?? t * c;
  if (!(typeof l === 'number' && l > 6 * t)) throw new Error(`${what}: spring.length is each leaf's, over six times its thickness (got ${JSON.stringify(sp.length)})`);
  if (gap < t + 2) throw new Error(`${what}: spring.gap ${gap} leaves the two leaves less than 2 mm of air: ${n2(t + 2)} or more`);
  const r = Math.min(1, l / 6);
  return { t, l, gap, post, r, half: beamProfile({ length: l, thickness: t, fillet: r }, 'guided') };
}

// Both prints' outlines. The strip: tabs, half beams, the pad as a ring with an opening at its top, the disc in it on
// the stem, the knob. The frame: a C as the switch's, its window room for the ring to go the rise either way; on its
// top a deck, the post on the left, the spring's two leaves and the carriage with the knob's hole
function cellGeometry(k, s) {
  const x0 = -k.L / 2, x1 = k.L / 2, [ta, tc] = k.tab, rise = riseOf(k.L - k.sq, k.t, k.sq), room = 1.25 * rise + Math.max(k.ro, k.ph / 2) + k.gap + 1;
  const beams = [beamOutline([x0, 0], [x0 + k.lb, 0], k.half, k.lb, k.t, 0.5, k.r), beamOutline([k.pl / 2, 0], [x1, 0], k.half, k.lb, k.t, 0.5, k.r)];
  const top = room + k.wall, cy = top + k.knob, open = STEM / 2 + k.gap + k.ro * Math.sin(10 * Math.PI / 180); // the stem's way out of the ring, room for the pad to turn 10° either way
  const tabAt = (xa, xb) => roundedRectangle({ size: [xb - xa, tc], center: [(xa + xb) / 2, 0], roundRadius: 0.8, segments: 16 });
  const ring = subtract(union(rect(-k.pl / 2, k.pl / 2, -k.ph / 2, k.ph / 2), circle({ radius: k.ro, segments: 64 })), circle({ radius: k.rd + k.gap, segments: 64 }), roundedRectangle({ size: [2 * open, k.ro + 2], center: [0, k.ro / 2 + 1.5], roundRadius: 0.5, segments: 16 }));
  const pin = union(circle({ radius: k.rd, segments: 64 }), rect(-STEM / 2, STEM / 2, 0, cy), circle({ radius: k.knobR, center: [0, cy], segments: 64 }));
  const strip = union(tabAt(x0 - ta, x0), tabAt(x1, x1 + ta), ring, ...beams, pin);
  const f0 = x0 + k.sq / 2, f1 = x1 - k.sq / 2, outer = f1 + ta + k.wall, yb = -room - k.hb;
  const c = { cy, hole: k.knobR + k.fit }; c.w = Math.max(2 * c.hole + 4, s.gap + s.t + 3); c.h = c.w;
  const xa = -c.w / 2, xb = xa - s.l, postTop = cy + c.h / 2 + 1; // the leaves run from the carriage's left side (xa) to the post (xb)
  const body = roundedRectangle({ size: [2 * outer, top - yb], center: [0, (top + yb) / 2], roundRadius: 2, segments: 16 });
  const pocketL = roundedRectangle({ size: [ta + 1, tc + 2 * k.fit], center: [f0 - ta / 2 + 0.5, 0], roundRadius: 0.5, segments: 32 });
  const pocketR = roundedRectangle({ size: [ta + 1, tc + 2 * k.fit], center: [f1 + ta / 2 - 0.5, 0], roundRadius: 0.5, segments: 32 });
  const window = roundedRectangle({ size: [f1 - f0, 2 * room], center: [0, 0], roundRadius: 1.5, segments: 16 });
  const way = roundedRectangle({ size: [2 * (STEM / 2 + k.gap + 1), 2 * top], center: [0, top], roundRadius: 0.5, segments: 16 }); // clear of the stem, which bends a little
  const left = Math.min(xb - s.post, -outer), deck = roundedRectangle({ size: [-left + 2, 6], center: [left / 2 + 1, top - 1], roundRadius: 1, segments: 16 });
  const post = roundedRectangle({ size: [s.post, postTop - top + 2], center: [xb - s.post / 2, top + (postTop - top) / 2 - 1], roundRadius: 1, segments: 16 });
  const leaves = [-s.gap / 2, s.gap / 2].map((dy) => beamOutline([xb, cy + dy], [xa, cy + dy], s.half, s.l, s.t, 0.5, s.r));
  const carriage = subtract(roundedRectangle({ size: [c.w, c.h], center: [0, cy], roundRadius: 1.5, segments: 16 }), circle({ radius: c.hole, center: [0, cy], segments: 64 }));
  const frame = union(subtract(union(body, deck, post, ...leaves), pocketL, pocketR, window, way), carriage);
  return { strip, frame, c, xa, xb, top, yb, postTop, room };
}

// The cell as the solver's beams: the strip as the switch's (the left tab the ground, the right tab a body held where
// its pocket puts it), the pad a body, the disc a body pinned to it at the middle, the stem a beam from the disc up to
// the carriage (the knob pressed in: one body); with the spring, its two leaves from the post to the carriage
function cellSystem(k, m, s, g, { strip = true } = {}) {
  const x0 = -k.L / 2, beams = [];
  if (strip) beams.push({ name: 'left', ...spansOf([x0, 0], [x0 + k.lb, 0], k.half, k.lb), width: k.W, E: m.E, from: 'ground', to: 'pad' }, { name: 'right', ...spansOf([k.pl / 2, 0], [k.L / 2, 0], k.half, k.lb), width: k.W, E: m.E, from: 'pad', to: 'tab' });
  if (strip && s) beams.push({ name: 'stem', path: [[0, k.rd], [0, g.c.cy - k.knobR]], thickness: STEM, width: k.W, E: m.E, from: 'disc', to: 'carriage' });
  if (s) for (const dy of [-s.gap / 2, s.gap / 2]) beams.push({ name: `leaf ${dy < 0 ? 'low' : 'high'}`, ...spansOf([g.xb, g.c.cy + dy], [g.xa, g.c.cy + dy], s.half, s.l), width: k.W, E: m.E, from: 'ground', to: 'carriage' });
  const bodies = { ground: { at: [x0, 0], fixed: true } };
  if (strip) Object.assign(bodies, { pad: { at: [0, 0] }, tab: { at: [k.L / 2, 0] } });
  if (strip && s) bodies.disc = { at: [0, 0] };
  if (s) bodies.carriage = { at: [0, g.c.cy] };
  const sys = beamSystem({ bodies, beams, pins: strip && s ? [{ name: 'pin', at: [0, 0], from: 'pad', to: 'disc', E: m.E, width: k.W }] : [], segments: 32 });
  // the push: on the carriage, or with no spring on the pad itself (free to turn and slide across)
  return { sys, tx: strip ? sys.body.tab.dof : null, py: s ? sys.body.carriage.dof + 1 : sys.body.pad.dof + 1, turn: strip ? sys.body.pad.dof + 2 : null };
}
// Squeezed in steps with the push held at the middle, and a nudge on the pad's turn so it takes the S-shaped way round
function squeezeMiddle(S, sq) {
  let q, r, ok = true;
  for (let i = 1; i <= 12; i++) { r = equilibrium(S.sys, { held: new Map([[S.tx, (-sq * i) / 12], [S.tx + 1, 0], [S.tx + 2, 0], [S.py, 0]]), loads: new Map([[S.turn, 1]]), start: q, iterations: 80 }); q = r.q; ok = ok && r.converged; }
  // the nudge (1 N·mm) let go in steps, so it stays on the S-shaped branch where there is one
  for (const n of [0.3, 0.1, 0.01, 0]) { r = equilibrium(S.sys, { held: new Map([[S.tx, -sq], [S.tx + 1, 0], [S.tx + 2, 0], [S.py, 0]]), loads: new Map([[S.turn, n]]), start: q, iterations: 80 }); q = r.q; }
  return { q: r.q, ok: ok && r.converged, turn: r.q[S.turn] };
}
// The force to hold the push `push` from the middle (+ down, as the switch's push)
const holdAt = (S, sq, push, start) => { const e = equilibrium(S.sys, { held: new Map([...(S.tx == null ? [] : [[S.tx, -sq], [S.tx + 1, 0], [S.tx + 2, 0]]), [S.py, -push]]), start, iterations: 80 }); return { q: e.q, ok: e.converged, force: -e.reaction.get(S.py), strain: Math.max(...Object.values(e.strain)) }; };

// The strip's stiffness at its middle alone, its pad free to turn (below 0), and the spring sized to it: the leaves as
// drawn differ a little from 2 E W t³ / l³ (their rounds, their ends in the post and carriage), so unless a length is given, a few secant steps on l
// (stiffness goes as 1 / l³) on the leaves alone set it
const springCache = new Map();
function cellSpring(p, m, what) {
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const key = JSON.stringify([p, m.E, m.strainLimit]);
  if (springCache.has(key)) return springCache.get(key);
  const k = cellLayout(p, what), sw = buckledSwitchModel({ ...p, pad: k.pl }, { ...m, density: undefined }, { steps: 24 });
  const sq = k.sq - sw.give, h = 0.05 * sw.rise, S = cellSystem(k, m), b0 = squeezeMiddle(S, sq), lo = holdAt(S, sq, -h, b0.q), hi = holdAt(S, sq, h, b0.q), negative = (hi.force - lo.force) / (2 * h);
  if (!(negative < 0)) throw new Error(`${what}: the strip squeezed ${n2(sq, 3)} mm is not negative at its middle (${n2(negative, 3)} N/mm), so there is nothing to balance: more squeeze`);
  const sp = p.spring ?? {}, kpos = sp.stiffness ?? -1.1 * negative;
  if (!(typeof kpos === 'number' && kpos > 0)) throw new Error(`${what}: spring.stiffness is the spring's, above 0 N/mm (got ${JSON.stringify(sp.stiffness)})`);
  let s = springOf(k, sp, kpos, sw.rise, m, what), leaves = null;
  for (let it = 0; it < 6; it++) {
    const T = cellSystem(k, m, s, cellGeometry(k, s), { strip: false }), a = holdAt(T, 0, -h), b = holdAt(T, 0, h);
    leaves = (b.force - a.force) / (2 * h);
    if (sp.length != null || Math.abs(leaves - kpos) < 0.002 * kpos) break;
    const l = s.l * Math.cbrt(leaves / kpos);
    s = { ...s, l, half: beamProfile({ length: l, thickness: s.t, fillet: s.r }, 'guided') };
  }
  const out = { switch: sw, sq, negative, turn: b0.turn, stiffness: leaves, spring: s, k };
  springCache.set(key, out);
  return out;
}

/**
 * A balanced strip cell (BalancedStrip above): two prints, the strip (the buckled switch's, its pad a ring that turns
 * on a disc printed in it, the disc on the knob's stem) and its frame with the spring on top. Fitted, the knob pressed
 * into the carriage, the strip is held at its middle, where its negative stiffness and the spring's cancel. Each print
 * drawn flat as printed, the strip above the frame.
 * @param {BalancedStrip} p
 * @param {{ E: number, strainLimit: number }} m the spring is sized from it
 * @param {{ part?: 'all' | 'strip' | 'frame' }} [o]
 * @returns {object} a JSCAD geom3
 */
export function balancedStrip(p, m, { part = 'all' } = {}) {
  const what = 'balancedStrip';
  if (!['all', 'strip', 'frame'].includes(part)) throw new Error(`${what}: part is all, strip or frame (got ${JSON.stringify(part)})`);
  const b = cellSpring(p, m, what), g = cellGeometry(b.k, b.spring);
  const strip = extrudeLinear({ height: b.k.W }, g.strip), frame = extrudeLinear({ height: b.k.W }, g.frame);
  if (part === 'strip') return strip;
  if (part === 'frame') return frame;
  return union(jscad.transforms.translate([0, g.postTop - g.yb + g.room + 4, 0], strip), frame);
}

/**
 * What a balanced strip cell does, from the beam solver on the strip, the pin, the stem and the spring's leaves
 * together: the strip squeezed into its pockets with the knob in the carriage, then the carriage pushed from one side of
 * the middle to the other by the strip's rise: the force curve, the flat range where the pair's stiffness stays within
 * `within` of the spring's, the most force there, the most strain (strip, stem and leaves), and the grams.
 * @param {BalancedStrip} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ steps?: number }} [o] steps across the push (default 40, an even number)
 * @returns {{ negative: number, spring: { stiffness: number, thickness: number, length: number, gap: number }, curve: { push: number, force: number, slope: number, strain: number }[],
 *   stiffness: number, flat: { from: number, to: number, span: number, force: number } | null, strain: number, margin: number, grams: number | null, findings: object[], rests: string[] }}
 *   negative: the strip's stiffness at its middle alone, its pad free to turn (N/mm, below 0); spring: the two leaves,
 *   their stiffness as the solver finds them; curve: push from the middle (mm, + down) and the force to hold the
 *   carriage there; stiffness: the pair's at the middle; flat: the run about the middle within the band, and the most
 *   force in it; margin: the limit over the most strain
 */
export function balancedStripModel(p, m, o = {}) {
  const what = 'balancedStripModel', b = cellSpring(p, m, what), { k, spring: s } = b, g = cellGeometry(k, s), within = p.within ?? 0.1;
  if (!(typeof within === 'number' && within > 0 && within < 1)) throw new Error(`${what}: within is a share of the spring's stiffness, between 0 and 1 (got ${JSON.stringify(p.within)})`);
  const steps = o.steps ?? 40;
  if (!(Number.isInteger(steps) && steps >= 10 && steps % 2 === 0)) throw new Error(`${what}: steps is an even whole number, 10 or more (got ${JSON.stringify(o.steps)})`);
  const sq = b.sq, S = cellSystem(k, m, s, g), base = squeezeMiddle(S, sq), reach = b.switch.rise, curve = [];
  let ok = base.ok;
  for (const sg of [-1, 1]) { // pushed each way from the middle, each step from the last
    let q = base.q;
    for (let i = 1; i <= steps / 2; i++) { const push = (sg * reach * i) / (steps / 2), e = holdAt(S, sq, push, q); q = e.q; ok = ok && e.ok; curve.push({ push, force: e.force, strain: e.strain }); }
  }
  const mid = holdAt(S, sq, 0, base.q);
  curve.push({ push: 0, force: mid.force, strain: mid.strain });
  curve.sort((x, y) => x.push - y.push);
  const cs = curve.map((c, i) => { const a = curve[Math.max(0, i - 1)], d = curve[Math.min(curve.length - 1, i + 1)]; return { ...c, slope: (d.force - a.force) / (d.push - a.push) }; });
  const kp = b.stiffness, i0 = cs.findIndex((c) => c.push === 0), band = (c) => Math.abs(c.slope) <= within * kp, stiffness = cs[i0].slope;
  let flat = null;
  if (band(cs[i0])) { let a = i0, d = i0; while (a > 0 && band(cs[a - 1])) a--; while (d < cs.length - 1 && band(cs[d + 1])) d++; flat = { from: cs[a].push, to: cs[d].push, span: cs[d].push - cs[a].push, force: Math.max(...cs.slice(a, d + 1).map((c) => Math.abs(c.force))) }; }
  const strain = Math.max(...cs.map((c) => c.strain)), margin = m.strainLimit / strain;
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra });
  f('pass', `alone, the strip squeezed ${n2(sq, 3)} mm with its pad free to turn (${n2((Math.abs(b.turn) * 180) / Math.PI, 1)}° at the middle) is ${n2(b.negative, 3)} N/mm; the spring's two leaves ${n2(s.t)} by ${k.W} mm, each ${n2(s.l)} mm long, are ${n2(kp, 3)} N/mm (2 E W t³ / l³ gives ${n2((2 * m.E * k.W * s.t ** 3) / s.l ** 3, 3)}, the solver's on the drawn leaves is used)`, 'cell.balance', { values: { negative: b.negative, spring: kp } });
  if (flat) f(flat.span > 0 ? 'pass' : 'warn', `together they are ${n2(stiffness, 3)} N/mm at the middle, and within ${n2(within * 100, 0)}% of the spring's stiffness from ${n2(flat.from)} to ${n2(flat.to)} mm (${n2(flat.span)} mm), holding the carriage anywhere there with at most ${n2(flat.force, 3)} N`, 'cell.flat', { values: { flat, stiffness } });
  else f('fail', `together they are ${n2(stiffness, 3)} N/mm at the middle, over ${n2(within * 100, 0)}% of the spring's ${n2(kp, 3)} N/mm: no flat range. A spring nearer ${n2(-b.negative, 3)} N/mm`, 'cell.flat', { values: { stiffness, spring: kp } });
  if (stiffness < 0) f('fail', `together they are ${n2(stiffness, 3)} N/mm at the middle, below 0: the carriage will not stay there but run off to one side. A stiffer spring`, 'cell.stable', { values: { stiffness } });
  f(strain <= m.strainLimit ? 'pass' : 'fail', `pushed ${n2(reach)} mm either way, the strip, stem and leaves see at most ${n2(strain * 100, 2)}%, ${strain <= m.strainLimit ? 'within' : 'over'} the limit of ${n2(m.strainLimit * 100, 2)}% (${n2(margin)} times)`, 'flexure.strain', { values: { strain, limit: m.strainLimit, margin } });
  if (!ok) f('warn', 'the beam solver did not settle at every step: the force curve is a guide only', 'cell.solver');
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(balancedStrip(p, m)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, strip and frame with its spring`, 'cell.mass', { values: { grams } }); }
  const rests = [...b.switch.rests, `the pin's ${k.gap} mm of play and its rub left out: the disc turns freely in its ring`, 'the knob held in the carriage with no play (a press fit, an estimate)', p.spring?.stiffness ? 'the spring as given' : "the spring 10% over the strip's negative stiffness, a choice so the middle stays stable"];
  return { negative: b.negative, spring: { stiffness: kp, thickness: s.t, length: s.l, gap: s.gap }, curve: cs, stiffness, flat, strain, margin, grams, findings: out, rests };
}

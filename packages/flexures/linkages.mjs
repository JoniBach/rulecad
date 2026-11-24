// Compliant linkages: the four-bar and the slider-crank of rigid machines, each pin replaced by a short flexure
// (pivots.mjs), printed flat in one piece. The pseudo-rigid-body model (Howell, Compliant Mechanisms, 2001, chapter
// 5): the links move as the rigid mechanism's do, and the flexures store energy as torsion springs at its pins, so
// the input needs the torque that energy asks. A compliant linkage turns through tens of degrees, not round and round.
//
// Drawn flat like every flexure here: the ground pivot of the crank at the origin, the plan in x and y, the print
// from z = 0 up to the width. Units: mm, N, MPa, degrees in parameters, radians in sums.
import jscad from '@jscad/modeling';
import { printable, parallelGuideModel, beamProfile, need } from './core.mjs';
import { KNUCKLE, flexOf, pivotModel, axisOf, cornerRound, draw, clearance, moveOf, beamsOf, stepTo, size, n2, rad, sub, add, mul, len, unit, wrap } from './pivots.mjs';

const { measureVolume } = jscad.measurements;
const { rectangle, circle, polygon } = jscad.primitives;
const { hull } = jscad.hulls;
const { union } = jscad.booleans;

const STEPS = 48; // poses a travel is swept in, for the clearances and the most strain

// Common parameters of a linkage, checked by name
function common(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the linkage's parameters`);
  const W = size(what, p, 'width'), bw = size(what, p, 'bar', 'bar', 6), gap = size(what, p, 'gap', 'gap', 0.3);
  const fx = flexOf(what, p.flex, size(what, p, 'knuckle', 'knuckle', bw / 2));
  if (fx.rk < bw / 2) throw new Error(`${what}: knuckle ${fx.rk} is under half the bar (${bw / 2}): the bars would stand proud of their knuckles`);
  if (fx.l - 2 * fx.sink < gap) throw new Error(`${what}: flex.length ${fx.l} leaves the knuckles ${n2(fx.l - 2 * fx.sink)} mm apart, under the print gap ${gap}`);
  return { W, bw, gap, fx };
}
const angleOf = (what, p, k, d) => { const v = p[k] ?? d; if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}: ${k} is an angle in degrees (got ${JSON.stringify(p[k])})`); return v * rad; };

// What a model's options ask, checked
function options(what, o = {}) {
  if (typeof o !== 'object' || o === null) throw new Error(`${what}: the options are an object { travel?, torque?, printer? }`);
  if (o.travel != null && !(typeof o.travel === 'number' && o.travel > 0)) throw new Error(`${what}: travel is the input's swing each way in degrees, above 0 (got ${JSON.stringify(o.travel)})`);
  if (o.torque != null && !(typeof o.torque === 'number' && o.torque > 0)) throw new Error(`${what}: torque is the input's torque in N m, above 0 (got ${JSON.stringify(o.torque)})`);
  return o;
}

// The swing each way at which the most strained joint reaches the limit: [toward -, toward +], degrees; the search
// stops where the linkage no longer closes (it can go no further)
function swings(strainAt, closes, limit) {
  const out = [];
  for (const sg of [-1, 1]) {
    let lo = 0, hi = 0;
    for (let a = 0.5; a <= 180; a += 0.5) { const d = sg * a * rad; if (!closes(d) || strainAt(d) > limit) { hi = a; break; } lo = a; }
    if (!hi) { out.push(180); continue; }
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, d = sg * m * rad; if (closes(d) && strainAt(d) <= limit) lo = m; else hi = m; }
    out.push(lo);
  }
  return out;
}

// The clearances over a swing: the least gap in any pose, and the pose
function swept(k, movesAt, travel) {
  let worst = { ...clearance(k), angle: 0 };
  for (let i = -STEPS / 2; i <= STEPS / 2; i++) {
    const d = (travel * i * 2) / STEPS, mv = movesAt(d);
    if (!mv) continue;
    const c = clearance(k, mv);
    if (c.gap < worst.gap) worst = { ...c, angle: d / rad };
  }
  return worst;
}

// ---------------------------------------------------------------------------------------------------------- four-bar

/**
 * @typedef {{ ground: number, crank: number, coupler: number, rocker: number, angle: number, branch?: 1 | -1,
 *   width: number, flex: { length: number, thickness: number, fillet?: number }, bar?: number, knuckle?: number,
 *   base?: number, gap?: number }} FourBar
 *   ground: the two ground pivots apart (A at the origin, D at x = ground); crank: A to B; coupler: B to C; rocker: C
 *   to D (pivot to pivot, mm); angle: the crank's angle from +x at rest (degrees); branch: which way the coupler and
 *   rocker close (1, the default: C to the left of B looking toward D, the open four-bar when it stands above the
 *   ground line); width: the print's height; flex: each joint's flexure (its length between its rounds, thickness,
 *   and the rounds, default 1); bar: the links' width (default 6); knuckle: the discs the flexures end in (default
 *   half the bar); base: the ground bar's width (default a bar, at most the knuckles' diameter); gap: the least air between parts (default 0.3)
 */

// The four-bar's layout, worked out once after the parameters are checked by name
function fourBarLayout(p, what) {
  const c = common(p, what), a = size(what, p, 'crank'), b = size(what, p, 'coupler'), r = size(what, p, 'rocker'), d = size(what, p, 'ground');
  const th0 = angleOf(what, p, 'angle'), branch = p.branch ?? 1, base = size(what, p, 'base', 'base', c.bw);
  if (base > 2 * c.fx.rk) throw new Error(`${what}: base ${base} is wider than the knuckles (${2 * c.fx.rk}) the ground's flexures end in: a base up to ${2 * c.fx.rk}, or larger knuckles`);
  if (branch !== 1 && branch !== -1) throw new Error(`${what}: branch is 1 or -1, which way the coupler and rocker close (got ${JSON.stringify(p.branch)})`);
  const A = [0, 0], D = [d, 0];
  const pose = (th) => {
    const B = [a * Math.cos(th), a * Math.sin(th)], BD = sub(D, B), e = len(BD);
    if (e > b + r - 1e-9 || e < Math.abs(b - r) + 1e-9) return null;
    const g = Math.acos(Math.max(-1, Math.min(1, (b * b + e * e - r * r) / (2 * b * e)))), phi = Math.atan2(BD[1], BD[0]) + branch * g;
    const C = add(B, [b * Math.cos(phi), b * Math.sin(phi)]);
    const mu = Math.acos(Math.max(-1, Math.min(1, ((B[0] - C[0]) * (D[0] - C[0]) + (B[1] - C[1]) * (D[1] - C[1])) / (b * r))));
    return { B, C, t2: th, t3: Math.atan2(C[1] - B[1], C[0] - B[0]), t4: Math.atan2(C[1] - D[1], C[0] - D[0]), mu };
  };
  const rest = pose(th0);
  if (!rest) throw new Error(`${what}: the links don't close at a crank angle of ${p.angle}°: the coupler and rocker (${b} and ${r}) can't reach between B and D, ${n2(len(sub(D, [a * Math.cos(th0), a * Math.sin(th0)])))} mm apart`);
  const { B, C } = rest;
  const joints = [
    { name: 'A', P: A, prev: 'ground', next: 'crank', w: axisOf(what, 'A', A, D, B) },
    { name: 'B', P: B, prev: 'crank', next: 'coupler', w: axisOf(what, 'B', B, A, C) },
    { name: 'C', P: C, prev: 'coupler', next: 'rocker', w: axisOf(what, 'C', C, B, D) },
    { name: 'D', P: D, prev: 'rocker', next: 'ground', w: axisOf(what, 'D', D, C, A) },
  ];
  const kn = (j, side) => add(j.P, mul(j.w, side * c.fx.reach)), [jA, jB, jC, jD] = joints;
  const bodies = {
    ground: { knuckles: [kn(jA, -1), kn(jD, 1)], bars: [[0, 1]], bar: base },
    crank: { knuckles: [kn(jA, 1), kn(jB, -1)], bars: [[0, 1]] },
    coupler: { knuckles: [kn(jB, 1), kn(jC, -1)], bars: [[0, 1]] },
    rocker: { knuckles: [kn(jC, 1), kn(jD, -1)], bars: [[0, 1]] },
  };
  return { ...c, a, b, r, d, th0, branch, base, pose, rest, joints, bodies, A, D };
}

/**
 * A compliant four-bar (FourBar above), drawn at rest: the ground bar, crank, coupler and rocker, each joint a short
 * flexure on the line halfway between its two links. A crank-rocker turns a crank's small swing into a rocker's
 * larger (or smaller) one; with crank = rocker and coupler = ground it is a parallelogram, whose coupler moves
 * without turning.
 * @param {FourBar} p
 * @returns {object} a JSCAD geom3
 */
export function fourBar(p) {
  const k = fourBarLayout(p, 'fourBar');
  return draw(k);
}

// Each body's move with the crank turned d from rest
function fourBarMoves(k, d) {
  const s = k.pose(k.th0 + d);
  if (!s) return null;
  const { B, C } = k.rest;
  return { crank: moveOf([k.A, B], [k.A, s.B]), coupler: moveOf([B, C], [s.B, s.C]), rocker: moveOf([k.D, C], [k.D, s.C]) };
}

/**
 * What a compliant four-bar does: its kind (Grashof), the rocker's swing for the crank's, the transmission angle,
 * each joint's turn and the strain it puts in its flexure, the torque the flexures ask of the input, the swing the
 * strain limit allows, the clearances over the swing and how it prints, as findings in the kit's one shape.
 * @param {FourBar} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m flexureMaterial(rules)
 * @param {{ travel?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] travel: the crank's
 *   swing each way that the design asks (degrees; default 0.8 of what the strain limit allows, as travelStop)
 * @returns {{ kind: string, grashof: boolean, K: number, swing: number[], travel: number, rocker: (deg: number) => number,
 *   coupler: (deg: number) => number[], transmission: (deg: number) => number, turns: (deg: number) => Record<string, number>,
 *   strain: (deg: number) => number, torque: (deg: number) => number, solve: (deg: number) => { torque: number, strain: number, converged: boolean },
 *   clear: { gap: number, between: string[], angle: number }, grams: number | null, findings: object[], rests: string[] }}
 *   K: each flexure's stiffness (N·mm a radian); swing: the crank's swing at the strain limit [down, up] (degrees);
 *   rocker(deg): the rocker's turn (degrees) for the crank's; coupler(deg): where the coupler's middle is; turns: each
 *   joint's turn (radians); torque(deg): the torque the flexures ask at the crank (N·mm); solve(deg): the same,
 *   and the most strain, from the beam solver (large deflections, the flexures' own give)
 */
export function fourBarModel(p, m, o) {
  const what = 'fourBarModel', k = fourBarLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  options(what, o);
  const piv = pivotModel(k.fx, k.W, m.E), rest = k.rest, out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra });
  const sorted = [k.a, k.b, k.r, k.d].sort((x, y) => x - y), grashof = sorted[0] + sorted[3] <= sorted[1] + sorted[2] + 1e-9;
  const parallel = Math.abs(k.a - k.r) < 1e-9 && Math.abs(k.b - k.d) < 1e-9;
  const kind = parallel ? 'parallelogram' : !grashof ? 'double-rocker (non-Grashof)' : sorted[0] === k.a ? 'crank-rocker' : sorted[0] === k.d ? 'double-crank' : 'double-rocker (Grashof)';
  const turnsR = (d) => {
    const s = k.pose(k.th0 + d);
    if (!s) return null;
    return { A: d, B: wrap(s.t3 - s.t2 - (rest.t3 - rest.t2)), C: wrap(s.t4 - s.t3 - (rest.t4 - rest.t3)), D: wrap(s.t4 - rest.t4) };
  };
  const strainR = (d) => { const t = turnsR(d); return t ? Math.max(...Object.values(t).map(piv.strain)) : Infinity; };
  const energy = (d) => { const t = turnsR(d); return t ? Object.values(t).reduce((s, x) => s + (piv.K * x * x) / 2, 0) : NaN; };
  const torqueR = (d) => (energy(d + 1e-5) - energy(d - 1e-5)) / 2e-5;
  const swing = swings(strainR, (d) => !!k.pose(k.th0 + d), m.strainLimit), travel = o?.travel ?? 0.8 * Math.min(...swing);
  const rests = [];
  if (o?.travel == null) rests.push(`travel ${n2(travel, 1)}°: 0.8 of the least swing the strain limit allows, the travelStop default`);
  rests.push('each flexure a pin with a torsion spring (pseudo-rigid-body model); solve() gives the beam solver\'s figure, the flexures\' own give included');

  f('pass', `${kind}: links ${k.a} (crank), ${k.b} (coupler), ${k.r} (rocker) on a ${k.d} mm ground`, 'linkage.kind', { values: { kind, grashof } });
  // the transmission angle over the travel: a rocker pushed nearly along its own length moves badly (Norton, Design
  // of Machinery: keep it within 40° to 140°, a rule of thumb)
  let lo = 180, hi = 0;
  for (let i = -STEPS / 2; i <= STEPS / 2; i++) { const s = k.pose(k.th0 + (travel * rad * 2 * i) / STEPS); if (!s) continue; lo = Math.min(lo, s.mu / rad); hi = Math.max(hi, s.mu / rad); }
  f(lo >= 40 && hi <= 140 ? 'pass' : 'warn', `the transmission angle stays ${n2(lo, 1)}° to ${n2(hi, 1)}° over ±${n2(travel, 1)}°${lo >= 40 && hi <= 140 ? ', within 40° to 140°' : `: outside 40° to 140° the coupler pushes the rocker nearly along its length (Norton, a rule of thumb)`}`, 'linkage.transmission', { values: { least: lo, most: hi } });
  const e = Math.max(strainR(-travel * rad), strainR(travel * rad)), lim = m.strainLimit;
  f(e <= lim ? 'pass' : 'fail', `swung ±${n2(travel, 1)}° the most strained flexure sees ${n2(e * 100, 2)}%, ${e <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%; the strain limit allows ${n2(swing[0], 1)}° down and ${n2(swing[1], 1)}° up`, 'flexure.strain', { values: { strain: e, limit: lim, swing } });
  const T = Math.max(Math.abs(torqueR(-travel * rad)), Math.abs(torqueR(travel * rad)));
  f('pass', `the flexures ask ${n2(T, 1)} N·mm at the crank at ±${n2(travel, 1)}° (each ${n2(piv.K, 1)} N·mm a radian); the rocker turns ${n2(rockerDeg(k, -travel), 1)}° to ${n2(rockerDeg(k, travel), 1)}°`, 'linkage.torque', { values: { torque: T, K: piv.K } });
  const clear = swept(k, (d) => fourBarMoves(k, d), travel * rad);
  clearFinding(f, clear, k.gap, travel);
  if (o?.printer) for (const x of printable({ thickness: k.fx.t, width: k.W }, o.printer, m)) out.push(x);
  const grams = gramsOf(fourBar(p), m, f);
  return {
    kind, grashof, K: piv.K, swing, travel, rests, findings: out, clear, grams,
    rocker: (deg) => rockerDeg(k, deg),
    coupler: (deg) => { const s = k.pose(k.th0 + deg * rad); return s ? mul(add(s.B, s.C), 0.5) : null; },
    transmission: (deg) => { const s = k.pose(k.th0 + deg * rad); return s ? s.mu / rad : NaN; },
    turns: (deg) => turnsR(deg * rad), strain: (deg) => strainR(deg * rad), torque: (deg) => torqueR(deg * rad),
    solve: (deg) => solveCrank(k, m.E, { crank: k.A, coupler: k.rest.B, rocker: k.D }, deg),
  };
}
function rockerDeg(k, deg) { const s = k.pose(k.th0 + deg * rad); return s ? wrap(s.t4 - k.rest.t4) / rad : NaN; }

// The beam solver's torque and most strain with the crank held turned deg (its turn held; where its pivot goes is
// left to the flexure)
function solveCrank(k, E, at, deg, ground = 'ground') {
  const sys = beamsOf(k, E, at, ground), dof = sys.body.crank.dof + 2, r = stepTo(sys, new Map([[dof, deg * rad]]), Math.max(4, Math.ceil(Math.abs(deg) / 2)));
  return { torque: r.reaction.get(dof), strain: Math.max(...Object.values(r.strain)), converged: r.converged, q: r.q, sys };
}

function clearFinding(f, clear, gap, travel) {
  f(clear.gap >= gap ? 'pass' : 'fail', `swung ±${n2(travel, 1)}° the parts keep ${n2(clear.gap)} mm apart at the least (${clear.between.join(' and ')}${clear.angle ? ` at ${n2(clear.angle, 1)}°` : ', at rest'})${clear.gap >= gap ? `, over the print gap ${gap}` : `: under the print gap ${gap}, they print fused or collide`}`, 'linkage.clear', { at: clear.at, between: clear.between, values: { gap: clear.gap, angle: clear.angle } });
}
function gramsOf(shape, m, f) {
  if (!(m.density > 0)) return null;
  const g = (measureVolume(shape) / 1000) * m.density;
  f('pass', `${n2(g, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'linkage.mass', { values: { grams: g } });
  return g;
}

// ------------------------------------------------------------------------------------------------------ slider-crank

/**
 * @typedef {{ crank: number, coupler: number, offset?: number, angle: number, width: number,
 *   flex: { length: number, thickness: number, fillet?: number }, guide: { length: number, thickness: number, apart?: number, fillet?: number },
 *   slider?: number, bar?: number, knuckle?: number, base?: number, gap?: number }} SliderCrank
 *   crank: A (the origin) to B; coupler: B to C, the slider's pivot (mm); offset: the slider's line, its y (default
 *   0); angle: the crank's angle from +x at rest (degrees); width: the print's height; flex: each joint's flexure as
 *   the four-bar's; guide: the slider's parallel guide, two leaves standing along y under it (their length,
 *   thickness, how far apart their middles are, default 3 bars, and their rounds, default 1); slider: the slider
 *   block's height under its knuckle (default: down its neck and 45° shoulders to the block, and half a bar); bar: the links' width (default 6); knuckle: default half the
 *   bar; base: the ground bar's height (default a bar); gap: the least air between parts (default 0.3)
 */
function sliderLayout(p, what) {
  const c = common(p, what), r = size(what, p, 'crank'), l = size(what, p, 'coupler'), e = p.offset ?? 0, th0 = angleOf(what, p, 'angle');
  if (typeof e !== 'number' || !Number.isFinite(e)) throw new Error(`${what}: offset is the slider line's y in mm (got ${JSON.stringify(p.offset)})`);
  if (!p.guide || typeof p.guide !== 'object') throw new Error(`${what}: guide is an object { length, thickness, apart? }: the slider's parallel guide`);
  const Lg = size(what, p.guide, 'length', 'guide.length'), tg = size(what, p.guide, 'thickness', 'guide.thickness'), apart = size(what, p.guide, 'apart', 'guide.apart', 3 * c.bw), gf = p.guide.fillet ?? 1;
  if (!(gf >= 0) || 2 * gf >= Lg) throw new Error(`${what}: guide.fillet is 0 or more and under half the guide's length (got ${JSON.stringify(p.guide.fillet)})`);
  const hb = size(what, p, 'base', 'base', c.bw);
  const xAt = (th) => { const s = r * Math.sin(th) - e; return Math.abs(s) >= l ? null : r * Math.cos(th) + Math.sqrt(l * l - s * s); };
  if (xAt(th0) == null) throw new Error(`${what}: the coupler (${l}) can't reach the slider's line from the crank at ${p.angle}°`);
  const A = [0, 0], B = [r * Math.cos(th0), r * Math.sin(th0)], C = [xAt(th0), e], u = unit(sub(C, B));
  const joints = [
    { name: 'A', P: A, prev: 'ground', next: 'crank', w: axisOf(what, 'A', A, [0, -1], B) }, // the ground reaches A from below
    { name: 'B', P: B, prev: 'crank', next: 'coupler', w: axisOf(what, 'B', B, A, C) },
    { name: 'C', P: C, prev: 'coupler', next: 'slider', w: axisOf(what, 'C', C, B, add(C, [0, -1])) }, // the slider below: its knuckle down and away, the flexure entering it from above
  ];
  const kn = (j, side) => add(j.P, mul(j.w, side * c.fx.reach)), [jA, jB, jC] = joints;
  const KA = kn(jA, -1), KC = kn(jC, 1);
  // the slider: its knuckle on a neck straight down (its sides tangent to the knuckle, clear of where the flexure
  // enters from above), the neck on the block by 45° shoulders; the guide's leaves stand under the block, on the base
  const sw = apart + tg + 2 * gf + 2 * 1.5, ym = KC[1] - c.fx.rk - 1, shoulder = sw / 2 - c.fx.rk, yTopBlock = ym - shoulder;
  const sh = size(what, p, 'slider', 'slider', KC[1] - yTopBlock + c.bw / 2), y1 = KC[1] - sh, y0 = y1 - Lg, yb = y0 - hb / 2;
  if (y1 > yTopBlock - 1) throw new Error(`${what}: slider ${sh} is too short for the block under the knuckle and its shoulders: ${n2(KC[1] - yTopBlock + 1)} or more`);
  const rect = (x0, x1, ya, yb2) => rectangle({ size: [x1 - x0, yb2 - ya], center: [(x0 + x1) / 2, (ya + yb2) / 2] });
  const neck = rect(KC[0] - c.fx.rk, KC[0] + c.fx.rk, ym, ym + 0.01);
  const block = union(hull(circle({ radius: c.fx.rk, center: KC, segments: KNUCKLE }), neck), hull(neck, rect(KC[0] - sw / 2, KC[0] + sw / 2, y1, yTopBlock)));
  const foot = Math.min(KA[0] - c.fx.rk - hb, KC[0] - sw / 2), right = KC[0] + sw / 2 + hb;
  // the post: straight down from the crank's ground knuckle to the base, as wide as the knuckle, rounded into the base
  const post = union(hull(circle({ radius: c.fx.rk, center: KA, segments: KNUCKLE }), rect(KA[0] - c.fx.rk, KA[0] + c.fx.rk, yb, yb + 0.01)), cornerRound(KA[0] - c.fx.rk, yb + hb / 2, -1, 1, 2), cornerRound(KA[0] + c.fx.rk, yb + hb / 2, 1, 1, 2));
  const baseBar = rect(foot, right, yb - hb / 2, yb + hb / 2);
  if (KA[1] - c.fx.rk < yb + hb / 2) throw new Error(`${what}: the crank's ground knuckle (y ${n2(KA[1])}) is down in the base (top ${n2(yb + hb / 2)}): a longer guide sits the base lower, or move the slider's line (offset) down`);
  const gl = { length: Lg, thickness: tg, width: c.W, fillet: gf }, half = beamProfile(gl, 'guided');
  const fine = Array.from({ length: 33 }, (_, i) => (gf * i) / 32); // the rounds, finely
  const leaf = (x) => { const ys = [...new Set([...Array.from({ length: 81 }, (_, i) => (Lg * i) / 80), ...fine, ...fine.map((v) => Lg - v)])].sort((a, b) => a - b), into = 0.5; return polygon({ points: [[x - tg / 2, y1 + into], ...ys.map((s) => [x - half(s), y1 - s]), [x - tg / 2, y0 - into], [x + tg / 2, y0 - into], ...ys.slice().reverse().map((s) => [x + half(s), y1 - s]), [x + tg / 2, y1 + into]] }); };
  const leaves = [leaf(KC[0] - apart / 2), leaf(KC[0] + apart / 2)];
  const bodies = {
    ground: { knuckles: [KA], bars: [], extra: [post, baseBar, ...leaves], capsules: [{ a: [foot, yb], b: [right, yb], r: hb / 2 }, { a: [KA[0], yb], b: KA, r: c.fx.rk }] },
    crank: { knuckles: [kn(jA, 1), kn(jB, -1)], bars: [[0, 1]] },
    coupler: { knuckles: [kn(jB, 1), kn(jC, -1)], bars: [[0, 1]] },
    slider: { knuckles: [KC], bars: [], extra: [block], capsules: [{ a: [KC[0] - sw / 2 + 1, y1 + 1], b: [KC[0] + sw / 2 - 1, y1 + 1], r: 1 }, { a: [KC[0], y1 + 1], b: KC, r: c.fx.rk }, { a: [KC[0] - sw / 2 + 1, yTopBlock - 1], b: [KC[0] + sw / 2 - 1, yTopBlock - 1], r: 1 }] },
  };
  return { ...c, r, l, e, th0, Lg, tg, apart, gf, sh, hb, xAt, A, B, C, joints, bodies, gl, sw, y0, y1, yb };
}

/**
 * A compliant slider-crank (SliderCrank above), drawn at rest: the crank on a flexure at the origin, the coupler,
 * and the slider on a parallel guide, two leaves standing on the base under it (the slider coupled by a flexure: no
 * pin, no rail). Turning the crank through tens of degrees pushes the slider along x: a press near the toggle, where
 * the crank and coupler line up and a small torque makes a large force, or a pump's stroke.
 * @param {SliderCrank} p
 * @returns {object} a JSCAD geom3
 */
export function sliderCrank(p) {
  return draw(sliderLayout(p, 'sliderCrank'));
}

function sliderMoves(k, d) {
  const th = k.th0 + d, x = k.xAt(th);
  if (x == null) return null;
  const B = [k.r * Math.cos(th), k.r * Math.sin(th)], C = [x, k.e];
  return { crank: moveOf([k.A, k.B], [k.A, B]), coupler: moveOf([k.B, k.C], [B, C]), slider: moveOf([k.C], [C]) };
}

/**
 * What a compliant slider-crank does: the slider's stroke for the crank's swing, the force a torque at the crank
 * makes at the slider (the press's mechanical advantage, from virtual work), what the flexures and the guide ask,
 * each one's strain, the swing the strain limit allows, the guide's drop, the clearances and how it prints.
 * @param {SliderCrank} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ travel?: number, torque?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o]
 *   travel: the crank's swing each way (degrees; default 0.8 of the strain-limited swing); torque: at the crank, N m
 * @returns {{ stroke: number[], slide: (deg: number) => number, rate: (deg: number) => number, force: (deg: number, torque: number) => number,
 *   torque: (deg: number) => number, strain: (deg: number) => number, swing: number[], travel: number, K: number,
 *   guide: number, drop: number, clear: object, grams: number | null, findings: object[], rests: string[] }}
 *   slide(deg): the slider's move (mm) for the crank's turn; rate(deg): dx/dθ (mm a radian); force(deg, torque):
 *   the push at the slider for a torque at the crank (N m), the flexures' and guide's share taken off (N);
 *   torque(deg): what the flexures and guide ask at the crank (N·mm); stroke: the slider's move at -travel and
 *   +travel; guide: its stiffness along x (N/mm); drop: its leaves' parasitic drop at the stroke's end (3δ²/5L)
 */
export function sliderCrankModel(p, m, o) {
  const what = 'sliderCrankModel', k = sliderLayout(p, what);
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  options(what, o);
  const piv = pivotModel(k.fx, k.W, m.E), g = parallelGuideModel(k.gl, m), x0 = k.xAt(k.th0), out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra });
  const slide = (d) => { const x = k.xAt(k.th0 + d); return x == null ? null : x - x0; };
  const turnsR = (d) => {
    const th = k.th0 + d, x = k.xAt(th);
    if (x == null) return null;
    const B = [k.r * Math.cos(th), k.r * Math.sin(th)], t3 = Math.atan2(k.e - B[1], x - B[0]), t30 = Math.atan2(k.C[1] - k.B[1], k.C[0] - k.B[0]);
    return { A: d, B: wrap(t3 - th - (t30 - k.th0)), C: wrap(t3 - t30) };
  };
  const strainR = (d) => { const t = turnsR(d); return t ? Math.max(...Object.values(t).map(piv.strain), g.strain(Math.abs(slide(d)))) : Infinity; };
  const energy = (d) => { const t = turnsR(d); return t ? Object.values(t).reduce((s, x) => s + (piv.K * x * x) / 2, 0) + (g.stiffness * slide(d) ** 2) / 2 : NaN; };
  const torqueR = (d) => (energy(d + 1e-5) - energy(d - 1e-5)) / 2e-5, rateR = (d) => (slide(d + 1e-5) - slide(d - 1e-5)) / 2e-5;
  // virtual work, the crank driven on the way it is turned: T dθ = F |dx| + dU, so F = (T - sign × torque) / |dx/dθ|
  const force = (deg, T) => { const d = deg * rad, sg = Math.sign(d) || 1; return (T * 1000 - sg * torqueR(d)) / Math.abs(rateR(d)); };
  const swing = swings(strainR, (d) => k.xAt(k.th0 + d) != null, m.strainLimit), travel = o?.travel ?? 0.8 * Math.min(...swing);
  const rests = [];
  if (o?.travel == null) rests.push(`travel ${n2(travel, 1)}°: 0.8 of the least swing the strain limit allows, the travelStop default`);
  rests.push('each flexure a pin with a torsion spring (pseudo-rigid-body model), the slider kept on its line; the guide\'s leaves let it drop 3δ²/5L');
  const lo = slide(-travel * rad), hi = slide(travel * rad), drop = (3 * Math.max(Math.abs(lo), Math.abs(hi)) ** 2) / (5 * k.Lg);
  f('pass', `swung ±${n2(travel, 1)}° the crank moves the slider ${n2(lo)} to ${n2(hi)} mm (${n2(Math.abs(hi - lo))} mm of stroke); its guide drops it ${n2(drop, 3)} mm at the ends`, 'linkage.stroke', { values: { stroke: [lo, hi], drop } });
  const e = Math.max(strainR(-travel * rad), strainR(travel * rad)), lim = m.strainLimit;
  f(e <= lim ? 'pass' : 'fail', `swung ±${n2(travel, 1)}° the most strained flexure sees ${n2(e * 100, 2)}%, ${e <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%; the strain limit allows ${n2(swing[0], 1)}° down and ${n2(swing[1], 1)}° up`, 'flexure.strain', { values: { strain: e, limit: lim, swing } });
  const T = Math.max(Math.abs(torqueR(-travel * rad)), Math.abs(torqueR(travel * rad)));
  f('pass', `the flexures and guide ask ${n2(T, 1)} N·mm at the crank at ±${n2(travel, 1)}° (each joint ${n2(piv.K, 1)} N·mm a radian, the guide ${n2(g.stiffness, 3)} N/mm)`, 'linkage.torque', { values: { torque: T, K: piv.K, guide: g.stiffness } });
  if (o?.torque) {
    const ends = [-travel, travel].map((deg) => ({ deg, F: force(deg, o.torque) })), most = ends.reduce((a, b) => (b.F > a.F ? b : a));
    const ok = ends.every((x) => x.F > 0);
    f(ok ? 'pass' : 'fail', `${o.torque} N m driving the crank on pushes the slider ${ends.map((x) => `${n2(x.F, 1)} N at ${n2(x.deg, 1)}°`).join(' and ')}, the flexures' share taken off${ok ? `; most at ${n2(most.deg, 1)}°, where the slider moves ${n2(Math.abs(rateR(most.deg * rad)))} mm a radian of crank` : ': under 0, the torque cannot turn the crank that far against the flexures'}`, 'linkage.force', { values: { ends } });
  }
  const clear = swept(k, (d) => sliderMoves(k, d), travel * rad);
  clearFinding(f, clear, k.gap, travel);
  if (o?.printer) {
    for (const x of printable({ thickness: k.fx.t, width: k.W }, o.printer, m)) out.push({ ...x, part: 'joints' });
    for (const x of printable({ thickness: k.tg, width: k.W }, o.printer, m)) if (x.code === 'flexure.lines') out.push({ ...x, part: 'guide' });
  }
  const grams = gramsOf(sliderCrank(p), m, f);
  return {
    stroke: [lo, hi], slide: (deg) => slide(deg * rad), rate: (deg) => rateR(deg * rad), force, torque: (deg) => torqueR(deg * rad), strain: (deg) => strainR(deg * rad),
    swing, travel, K: piv.K, guide: g.stiffness, drop, clear, grams, findings: out, rests,
    turns: (deg) => turnsR(deg * rad),
  };
}

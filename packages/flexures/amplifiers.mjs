// Displacement amplifiers: a small push made a larger move, for an actuator with force to spare and little stroke (a
// piezo stack, a solenoid, a cam). Each is rigid links on short flexures (pivots.mjs), printed flat in one piece:
//
// - the lever: one link on one flexure, pushed near its pivot, its far end moving b / a times as far;
// - the bridge (the piezo kind): four links between two input blocks and two output blocks, nearly flat, so pushing
//   the input blocks apart by u pulls the output blocks together by about u cot α (α the links' angle to the push);
// - the rhombus: the same four links meeting at four corners, each corner one knuckle, so it folds as a diamond.
//
// The kinematic ratios are the rigid mechanism's and an upper bound: the flexures stretch and shear a little, and a
// nearly flat bridge loses much of its ratio to that. Each model also runs the beam solver (beams.mjs) on the drawn
// flexures for the ratio they give. Drawn flat; the plan in x and y, the print from z = 0 up. Units: mm, N, MPa,
// degrees in parameters.
import jscad from '@jscad/modeling';
import { printable, need } from './core.mjs';
import { flexOf, pivotModel, draw, clearance, beamsOf, stepTo, size, n2, rad, sub, add, mul, unit } from './pivots.mjs';
import { equilibrium } from './beams.mjs';

const { measureVolume } = jscad.measurements;

function common(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the amplifier's parameters`);
  const W = size(what, p, 'width'), bw = size(what, p, 'bar', 'bar', 6), gap = size(what, p, 'gap', 'gap', 0.3);
  const fx = flexOf(what, p.flex, size(what, p, 'knuckle', 'knuckle', bw / 2));
  if (fx.rk < bw / 2) throw new Error(`${what}: knuckle ${fx.rk} is under half the bar (${bw / 2}): the bars would stand proud of their knuckles`);
  return { W, bw, gap, fx };
}
function material(what, m) {
  need(what, {}, m);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
}
function gramsOf(shape, m, f, what) {
  if (!(m.density > 0)) return null;
  const g = (measureVolume(shape) / 1000) * m.density;
  f('pass', `${n2(g, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, `${what}.mass`, { values: { grams: g } });
  return g;
}

// ----------------------------------------------------------------------------------------------------- bridge, rhombus

/**
 * @typedef {{ link: number, angle: number, width: number, flex: { length: number, thickness: number, fillet?: number },
 *   span?: number, inner?: number, bar?: number, knuckle?: number, gap?: number }} Bridge
 *   link: each link's length, pivot to pivot (mm); angle: its angle to the push, along x (degrees, above 0 and under
 *   90: small for a large ratio); width: the print's height; flex: each flexure (length between its rounds,
 *   thickness, rounds default 1), lying along its link; span: the bridge's output block, its two pivots apart along x
 *   (default its knuckles a bar apart); inner: its input block, its two pivots apart along y (likewise); bar: default
 *   6; knuckle: default half the bar; gap: default 0.3. The rhombus takes neither span nor inner: its corners are
 *   single knuckles
 */
function bridgeLayout(p, what, rhombus) {
  const c = common(p, what), L = size(what, p, 'link'), al = p.angle;
  if (typeof al !== 'number' || !(al > 0 && al < 90)) throw new Error(`${what}: angle is the links' angle to the push in degrees, above 0 and under 90 (got ${JSON.stringify(p.angle)})`);
  const a = al * rad, ca = Math.cos(a), sa = Math.sin(a), R = c.fx.reach;
  if (L - 2 * R < c.gap) throw new Error(`${what}: a ${L} mm link leaves no bar between its two flexures (each reaches ${n2(R)} mm to its knuckle): a link over ${n2(2 * R + c.gap)}`);
  if (rhombus && (p.span != null || p.inner != null)) throw new Error(`${what}: a rhombus's corners are single knuckles, so it takes no span or inner (the bridge does)`);
  // the pivots' half spacings: the rhombus's knuckles meet at its corners (x = 0, y = 0); the bridge's sit a bar apart
  const xo = rhombus ? R * ca : size(what, p, 'span', 'span', 2 * (R * ca + c.bw)) / 2, yi = rhombus ? R * sa : size(what, p, 'inner', 'inner', 2 * (R * sa + c.bw)) / 2;
  if (!rhombus && xo < R * ca + c.bw / 2) throw new Error(`${what}: span ${2 * xo} puts the output block's knuckles over each other: ${n2(2 * (R * ca + c.bw / 2))} or more`);
  if (!rhombus && yi < R * sa + c.bw / 2) throw new Error(`${what}: inner ${2 * yi} puts the input block's knuckles over each other: ${n2(2 * (R * sa + c.bw / 2))} or more`);
  const xi = xo + L * ca, yo = yi + L * sa, joints = [], bodies = { left: { knuckles: [], bars: [] }, right: { knuckles: [], bars: [] }, top: { knuckles: [], bars: [] }, bottom: { knuckles: [], bars: [] } };
  for (const sx of [1, -1]) for (const sy of [1, -1]) {
    const Po = [sx * xo, sy * yo], Pi = [sx * xi, sy * yi], u = unit(sub(Pi, Po)), name = `${sy > 0 ? 'top' : 'bottom'}-${sx > 0 ? 'right' : 'left'}`, out = sy > 0 ? 'top' : 'bottom', inn = sx > 0 ? 'right' : 'left';
    joints.push({ name: `${name} out`, P: Po, w: u, prev: out, next: name }, { name: `${name} in`, P: Pi, w: u, prev: name, next: inn });
    bodies[name] = { knuckles: [add(Po, mul(u, R)), sub(Pi, mul(u, R))], bars: [[0, 1]] };
    bodies[out].knuckles.push(sub(Po, mul(u, R)));
    bodies[inn].knuckles.push(add(Pi, mul(u, R)));
  }
  for (const b of ['left', 'right', 'top', 'bottom']) {
    if (rhombus) bodies[b].knuckles = [bodies[b].knuckles[0]]; // the two meet: one knuckle at the corner
    else bodies[b].bars = [[0, 1]];
  }
  return { ...c, L, a, xo, yi, xi, yo, joints, bodies, rhombus };
}

/**
 * A bridge amplifier (Bridge above), drawn at rest: input blocks left and right (the left one the ground), output
 * blocks top and bottom, four links between them on in-line flexures. An actuator between the input blocks pushes
 * them apart and the output blocks come together, about cot α times as far.
 * @param {Bridge} p @returns {object} a JSCAD geom3
 */
export function bridgeAmplifier(p) { return draw(bridgeLayout(p, 'bridgeAmplifier', false)); }
/**
 * A rhombus amplifier: the bridge's four links meeting at four single-knuckle corners, a diamond. Pushing its left
 * and right corners apart brings its top and bottom corners together, about cot α times as far.
 * @param {Omit<Bridge, 'span' | 'inner'>} p @returns {object} a JSCAD geom3
 */
export function rhombusAmplifier(p) { return draw(bridgeLayout(p, 'rhombusAmplifier', true)); }

/**
 * What a bridge or rhombus amplifier does for an input stroke: the kinematic ratio and the beam solver's, the
 * input's stiffness, the output's move, each flexure's strain, the stroke the strain limit allows, the clearances
 * and the grams, as findings in the kit's one shape.
 * @param {Bridge} p @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ input?: number, rhombus?: boolean, printer?: { line: number, layer: number, wall_min?: number } }} [o]
 *   input: the actuator's stroke, pushing the input blocks apart (mm; default 0.8 of what the strain limit allows);
 *   rhombus: the diamond rather than the bridge
 * @returns {{ ratio: number, solved: number, output: (input: number) => number, stiffness: number, solvedStiffness: number,
 *   strain: (input: number) => number, limit: number, input: number, K: number, grams: number | null, findings: object[], rests: string[] }}
 *   ratio: cot α, the rigid links' at the start; solved: the drawn flexures' (beam solver, at the input stroke);
 *   output(input): the rigid links' output for an input, mm; stiffness: at the input, 2K / L² sin²α (N/mm), and
 *   solvedStiffness the solver's; limit: the input stroke at the strain limit
 */
export function bridgeAmplifierModel(p, m, o = {}) {
  const what = o.rhombus ? 'rhombusAmplifierModel' : 'bridgeAmplifierModel', k = bridgeLayout(p, what, !!o.rhombus);
  material(what, m);
  if (o.input != null && !(typeof o.input === 'number' && o.input > 0)) throw new Error(`${what}: input is the actuator's stroke in mm, above 0 (got ${JSON.stringify(o.input)})`);
  const piv = pivotModel(k.fx, k.W, m.E), out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), code = o.rhombus ? 'rhombus' : 'bridge';
  const ca = Math.cos(k.a), sa = Math.sin(k.a);
  // the rigid links: pushed apart by u, each link's run along x grows u / 2, so cos α' = cos α + u / 2L, and each
  // output block comes in by L (sin α - sin α'); both together, v = 2L (sin α - sin α')
  const turn = (u) => Math.acos(Math.min(1, ca + u / (2 * k.L))) - k.a, output = (u) => 2 * k.L * (sa - Math.sin(k.a + turn(u)));
  const strain = (u) => piv.strain(turn(u)), maxU = 2 * k.L * (1 - ca);
  let lo = 0, hi = maxU;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (strain(mid) <= m.strainLimit) lo = mid; else hi = mid; }
  const limit = lo, input = o.input ?? 0.8 * limit, ratio = ca / sa, stiffness = (2 * piv.K) / (k.L * k.L * sa * sa);
  const rests = [];
  if (o.input == null) rests.push(`input ${n2(input, 3)} mm: 0.8 of the stroke the strain limit allows, the travelStop default`);
  rests.push('the ratio cot α is the rigid links\' and an upper bound; the solver\'s is the drawn flexures\'');
  // the beam solver: the left block held, the right one pushed along x by the input; the rest free
  const at = Object.fromEntries(Object.entries(k.bodies).map(([n, b]) => [n, mul(b.knuckles.reduce((s, x) => add(s, x), [0, 0]), 1 / b.knuckles.length)]));
  const sys = beamsOf(k, m.E, at, 'left'), dx = sys.body.right.dof, r = stepTo(sys, new Map([[dx, input]]), 6);
  const v = -(r.q[sys.body.top.dof + 1] - r.q[sys.body.bottom.dof + 1]), solved = v / input, solvedStiffness = r.reaction.get(dx) / input;
  const e = strain(input), lim = m.strainLimit;
  f('pass', `${n2(input, 3)} mm of input brings the top and bottom ${n2(output(input), 3)} mm together by the rigid links (cot ${n2(k.a / rad, 1)}° = ${n2(ratio)} at the start, ${n2(output(input) / input)} over this stroke); the drawn flexures give ${n2(v, 3)} mm, a ratio of ${n2(solved)}, ${n2((v / output(input)) * 100, 0)}% of the rigid links'`, `${code}.ratio`, { values: { ratio, solved, output: output(input), solvedOutput: v } });
  f('pass', `the input is ${n2(stiffness, 1)} N/mm stiff by the pivots (2K / L² sin²α, each flexure ${n2(piv.K, 1)} N·mm a radian), ${n2(solvedStiffness, 1)} N/mm by the solver: ${n2(stiffness * input, 1)} N to push it ${n2(input, 3)} mm`, `${code}.stiffness`, { values: { stiffness, solvedStiffness } });
  f(e <= lim ? 'pass' : 'fail', `at ${n2(input, 3)} mm of input each flexure turns ${n2(Math.abs(turn(input)) / rad, 2)}° and sees ${n2(e * 100, 2)}%, ${e <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%: the input may go ${n2(limit, 3)} mm`, 'flexure.strain', { values: { strain: e, limit: lim, input: limit } });
  if (!r.converged) f('warn', `the beam solver did not settle at ${n2(input, 3)} mm of input: its ratio is a guide only`, `${code}.solver`);
  const moves = { left: (q) => q }, dof = (n) => sys.body[n].dof;
  for (const n of Object.keys(k.bodies)) if (n !== 'left') { const d = dof(n), phi = r.q[d + 2], o0 = at[n]; moves[n] = (q) => { const s = sub(q, o0); return [o0[0] + r.q[d] + s[0] * Math.cos(phi) - s[1] * Math.sin(phi), o0[1] + r.q[d + 1] + s[0] * Math.sin(phi) + s[1] * Math.cos(phi)]; }; }
  const c0 = clearance(k), c1 = clearance(k, moves), clear = c1.gap < c0.gap ? { ...c1, pose: 'pushed' } : { ...c0, pose: 'at rest' };
  f(clear.gap >= k.gap ? 'pass' : 'fail', `the parts keep ${n2(clear.gap)} mm apart at the least (${clear.between.join(' and ')}, ${clear.pose})${clear.gap >= k.gap ? '' : `: under the print gap ${k.gap}`}`, `${code}.clear`, { at: clear.at, between: clear.between, values: { gap: clear.gap } });
  if (o.printer) for (const x of printable({ thickness: k.fx.t, width: k.W }, o.printer, m)) out.push(x);
  const grams = gramsOf(o.rhombus ? rhombusAmplifier(p) : bridgeAmplifier(p), m, f, code);
  return { ratio, solved, output, stiffness, solvedStiffness, strain, limit, input, K: piv.K, grams, findings: out, rests };
}
/**
 * The rhombus's model: bridgeAmplifierModel with its corners single knuckles.
 * @param {Omit<Bridge, 'span' | 'inner'>} p @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ input?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o]
 */
export function rhombusAmplifierModel(p, m, o = {}) { return bridgeAmplifierModel(p, m, { ...o, rhombus: true }); }

// ------------------------------------------------------------------------------------------------------------- lever

/**
 * @typedef {{ input: number, output: number, width: number, flex: { length: number, thickness: number, fillet?: number },
 *   base?: number, bar?: number, knuckle?: number, gap?: number }} Lever
 *   input: from the pivot to where the actuator pushes (a, mm); output: from the pivot to the output (b, mm, past
 *   the input); width: the print's height; flex: the pivot's flexure, along the lever; base: the ground block's length
 *   behind the pivot (default 3 bars); bar: default 6; knuckle: default half the bar; gap: default 0.3
 */
function leverLayout(p, what) {
  const c = common(p, what), a = size(what, p, 'input'), b = size(what, p, 'output'), base = size(what, p, 'base', 'base', 3 * c.bw), R = c.fx.reach;
  if (a < R) throw new Error(`${what}: input ${a} is inside the pivot's flexure (it reaches ${n2(R)} mm to the lever's knuckle): an input of ${n2(R)} or more`);
  if (b <= a) throw new Error(`${what}: output ${b} is not past the input ${a}: a lever amplifies with its output further out`);
  const joints = [{ name: 'pivot', P: [0, 0], w: [1, 0], prev: 'ground', next: 'lever' }];
  const bodies = { ground: { knuckles: [[-R, 0], [-R - base, 0]], bars: [[0, 1]], bar: 2 * c.fx.rk }, lever: { knuckles: [[R, 0], [b, 0]], bars: [[0, 1]] } };
  return { ...c, a, b, base, joints, bodies };
}

/**
 * A lever amplifier (Lever above), drawn at rest: a ground block, the pivot's flexure along x at the origin, and the
 * lever out to its output. Pushed along y at the input, its output moves output / input times as far.
 * @param {Lever} p @returns {object} a JSCAD geom3
 */
export function leverAmplifier(p) { return draw(leverLayout(p, 'leverAmplifier')); }

/**
 * What a lever amplifier does: the ratio b / a and the beam solver's (a push at the input, the flexure free to shear
 * and stretch), the input's stiffness K / a², the strain, the input stroke the limit allows, and the grams.
 * @param {Lever} p @param {{ E: number, strainLimit: number, density?: number, name?: string }} m
 * @param {{ input?: number, printer?: { line: number, layer: number, wall_min?: number } }} [o] input: the stroke
 *   at the input (mm; default 0.8 of the strain-limited)
 * @returns {{ ratio: number, solved: number, stiffness: number, solvedStiffness: number, strain: (input: number) => number,
 *   limit: number, input: number, K: number, grams: number | null, findings: object[], rests: string[] }}
 */
export function leverAmplifierModel(p, m, o = {}) {
  const what = 'leverAmplifierModel', k = leverLayout(p, what);
  material(what, m);
  if (o.input != null && !(typeof o.input === 'number' && o.input > 0)) throw new Error(`${what}: input is the stroke at the input in mm, above 0 (got ${JSON.stringify(o.input)})`);
  const piv = pivotModel(k.fx, k.W, m.E), out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra });
  const strain = (u) => piv.strain(Math.asin(Math.min(1, u / k.a))), limit = k.a * Math.sin(Math.min(Math.PI / 2, piv.angle(m.strainLimit)));
  const input = o.input ?? 0.8 * limit, ratio = k.b / k.a, stiffness = piv.K / (k.a * k.a);
  const rests = o.input == null ? [`input ${n2(input, 3)} mm: 0.8 of the stroke the strain limit allows, the travelStop default`] : [];
  // the beam solver: the force that moves the input point its stroke by the pivots' sums, put on the lever there (a
  // force along y on the lever's reference point, the knuckle, and its moment about it); the input's and output's
  // moves read off the lever's place and turn
  const sys = beamsOf(k, m.E, { lever: [k.fx.reach, 0] }, 'ground'), d = sys.body.lever.dof, F = stiffness * input;
  let q, r;
  for (let i = 1; i <= 6; i++) { r = equilibrium(sys, { loads: new Map([[d + 1, (F * i) / 6], [d + 2, ((F * i) / 6) * (k.a - k.fx.reach)]]), start: q, iterations: 80 }); q = r.q; }
  const yAt = (x) => r.q[d + 1] + (x - k.fx.reach) * Math.sin(r.q[d + 2]);
  const ua = yAt(k.a), ub = yAt(k.b), solved = ub / ua, solvedStiffness = F / ua;
  const e = strain(input), lim = m.strainLimit;
  f('pass', `${n2(input, 3)} mm at the input moves the output ${n2(input * ratio, 3)} mm by the rigid lever (${n2(k.b)} / ${n2(k.a)} = ${n2(ratio)}); pushed with ${n2(F, 2)} N the drawn flexure gives ${n2(solved)} (${n2((solved / ratio) * 100, 0)}%)`, 'lever.ratio', { values: { ratio, solved } });
  f('pass', `the input is ${n2(stiffness, 2)} N/mm stiff by the pivot (K / a², K ${n2(piv.K, 1)} N·mm a radian), ${n2(solvedStiffness, 2)} N/mm by the solver`, 'lever.stiffness', { values: { stiffness, solvedStiffness } });
  f(e <= lim ? 'pass' : 'fail', `at ${n2(input, 3)} mm of input the pivot sees ${n2(e * 100, 2)}%, ${e <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%: the input may go ${n2(limit, 3)} mm`, 'flexure.strain', { values: { strain: e, limit: lim, input: limit } });
  if (!r.converged) f('warn', `the beam solver did not settle: its ratio is a guide only`, 'lever.solver');
  if (o.printer) for (const x of printable({ thickness: k.fx.t, width: k.W }, o.printer, m)) out.push(x);
  const grams = gramsOf(leverAmplifier(p), m, f, 'lever');
  return { ratio, solved, stiffness, solvedStiffness, strain, limit, input, K: piv.K, grams, findings: out, rests };
}

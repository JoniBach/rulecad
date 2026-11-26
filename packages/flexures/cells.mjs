// Negative- and zero-stiffness cells. A shallow cosine arch clamped at both ends (the curved-beam bistable of Qiu,
// Lang and Slocum 2004, drawn by `bistable` in core.mjs) pushes back less the further it is pushed over part of its
// travel: its stiffness there is negative. In parallel with a positive spring as stiff as that, the two cancel, and
// the cell holds a load with next to no change in force over a range of travel: zero stiffness, a statically balanced
// mechanism (a weight carried anywhere in the range, a soft mount, a constant-force stop).
//
// The arch's force curve is the beam solver's (beams.mjs, large deflections) on the drawn beams: the two beams side
// by side, joined at the middle by the shuttle, which is pushed along -y with its slide across and its turn left
// free. Units: mm, N, MPa.
import { beamSystem, equilibrium } from './beams.mjs';
import { snapCurve } from './bistables.mjs';

/** @returns {never} */
const refuse = (code, text) => { throw Object.assign(new Error(`${code}: ${text}`), { code }); };
const said = (v) => JSON.stringify(v) ?? String(v);
const size = (what, p, k, text) => { if (!(typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] > 0)) refuse('cell.size', `${what}: ${k} is ${text}, a size above 0 mm (got ${said(p[k])})`); return p[k]; };

/**
 * @typedef {{ length: number, rise: number, thickness: number, width: number, gap?: number }} CurvedBeams
 *   as `bistable` draws them: length L between the clamped ends; rise h, the arch's height at the middle; thickness t
 *   and width (up z) of each beam; gap between the two beams (default 4 t). The shuttle at the middle is
 *   max(2 t, 2) mm along x, as drawn
 */
function archOf(what, p) {
  if (!p || typeof p !== 'object') refuse('cell.input', `${what}: give the arch as { length, rise, thickness, width } (got ${said(p)})`);
  const L = size(what, p, 'length', 'the span between the clamped ends'), h = size(what, p, 'rise', "the arch's height at the middle"), t = size(what, p, 'thickness', "each beam's thickness"), w = size(what, p, 'width', "each beam's width up z");
  const g = p.gap ?? 4 * t;
  if (!(typeof g === 'number' && g > 0)) refuse('cell.size', `${what}: gap is between the two beams, a size above 0 mm (got ${said(p.gap)})`);
  if (h > 0.2 * L) refuse('cell.rise', `${what}: a rise of ${h} mm is over a fifth of the ${L} mm span: a shallow arch is modelled, up to ${(0.2 * L).toFixed(2)} mm`);
  return { L, h, t, w, g, sw: Math.max(2 * t, 2) };
}

/**
 * A curved-beam cell's force curve and where its stiffness is negative, from the beam solver on the drawn beams.
 * @param {CurvedBeams} p
 * @param {{ E: number, strainLimit?: number }} m
 * @param {{ steps?: number, to?: number }} [o] steps along the push (default 60); to: how far it is pushed, mm (default 2.2 rises)
 * @returns {{ curve: { push: number, force: number, strain: number, slope: number }[], stiffness: number, snap: { push: number, force: number },
 *   negative: { from: number, to: number, least: number, at: number } | null, bistable: boolean, second: number | null, strain: number,
 *   Q: number, converged: boolean, findings: { level: string, text: string, code: string, values?: object }[] }}
 *   curve: the force to hold the shuttle at each push (N) and its slope there (N/mm); stiffness: at rest; snap: the
 *   most force before it gives; negative: the travel over which the slope is below 0, its least slope and where;
 *   second: where it rests again if bistable; strain: the most the beams see over the push; Q: rise over thickness
 */
export function curvedCellModel(p, m, o = {}) {
  const what = 'curvedCellModel', { L, h, t, w, g, sw } = archOf(what, p);
  if (!(m && m.E > 0)) refuse('cell.material', `${what}: the material needs a modulus E above 0 MPa (got ${said(m?.E)})`);
  const steps = o.steps ?? 60, to = o.to ?? 2.2 * h;
  if (!(Number.isInteger(steps) && steps >= 10)) refuse('cell.steps', `${what}: steps is a whole number, 10 or more (got ${said(o.steps)})`);
  const e = g / 2 + t / 2, y = (x) => (h / 2) * (1 - Math.cos((2 * Math.PI * x) / L)), Lh = L / 2 - sw / 2, n = 24, beams = [];
  for (const off of [-e, e]) for (const right of [false, true]) {
    const path = Array.from({ length: n + 1 }, (_, i) => { const x = (Lh * i) / n, xx = right ? L - x : x; return [xx, y(xx) + off]; });
    beams.push({ name: `${off < 0 ? 'lower' : 'upper'} ${right ? 'right' : 'left'}`, path, thickness: t, width: w, E: m.E, from: 'ground', to: 'shuttle' });
  }
  const sys = beamSystem({ bodies: { ground: { at: [0, 0], fixed: true }, shuttle: { at: [L / 2, h] } }, beams, segments: 48 });
  const sc = snapCurve(sys, 'shuttle', to, steps), d = sys.body.shuttle.dof + 1, probe = 1e-4 * h;
  const stiffness = -equilibrium(sys, { held: new Map([[d, -probe]]) }).reaction.get(d) / probe;
  // the slope at each step, centred (one-sided at the ends), from rest (force 0) on
  const pts = [{ push: 0, force: 0 }, ...sc.curve], curve = sc.curve.map((c, i) => { const a = pts[i], b = pts[Math.min(i + 2, pts.length - 1)]; return { ...c, slope: (b.force - a.force) / (b.push - a.push) }; });
  const neg = curve.filter((c) => c.slope < 0);
  const negative = neg.length ? { from: neg[0].push, to: neg[neg.length - 1].push, least: Math.min(...neg.map((c) => c.slope)), at: neg.reduce((a, c) => (c.slope < a.slope ? c : a)).push } : null;
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  if (negative) f('pass', `its stiffness is negative from ${negative.from.toFixed(2)} to ${negative.to.toFixed(2)} mm pushed, down to ${negative.least.toFixed(3)} N/mm at ${negative.at.toFixed(2)} mm; at rest it is ${stiffness.toFixed(3)} N/mm`, 'cell.negative', { negative, stiffness });
  else f('fail', `its force only rises (rise over thickness ${(h / t).toFixed(2)}): no negative stiffness to balance. A higher rise, or thinner beams`, 'cell.negative', { stiffness, Q: h / t });
  if (m.strainLimit != null) f(sc.strain <= m.strainLimit ? 'pass' : 'fail', `pushed ${to.toFixed(2)} mm the beams see at most ${(sc.strain * 100).toFixed(2)}%, ${sc.strain <= m.strainLimit ? 'within' : 'over'} the limit of ${(m.strainLimit * 100).toFixed(2)}%`, 'flexure.strain', { strain: sc.strain, limit: m.strainLimit });
  if (!sc.converged) f('warn', 'the beam solver did not settle at every step: the force curve is a guide only', 'cell.solver');
  return { curve, stiffness, snap: sc.snap, negative, bistable: sc.bistable, second: sc.second, strain: sc.strain, Q: h / t, converged: sc.converged, findings: out };
}

/**
 * A zero-stiffness cell: the curved beams in parallel with a positive spring (a straight-line spring, k N/mm, its rest
 * where the beams' is), and the range of travel over which the pair's stiffness stays within a share of the spring's.
 * With no spring given, it is as stiff as the beams' most negative slope, which cancels it there. Also, what a printed
 * spring of that stiffness takes: fixed-guided leaves in parallel (12 E I / l³ each, strain 3 t δ / l²; Howell 2001)
 * as long as they must be to stay within half the strain limit at the far end of the range, and how many of them.
 * @param {CurvedBeams} p
 * @param {{ E: number, strainLimit?: number }} m
 * @param {{ spring?: number, within?: number, leaf?: { thickness?: number, width?: number }, steps?: number }} [o] spring:
 *   its stiffness, N/mm; within: the share of the spring's stiffness the pair may stray from 0 (default 0.1); leaf: the
 *   printed spring's leaves (default the beams' thickness and width)
 * @returns {{ cell: ReturnType<typeof curvedCellModel>, spring: number, curve: { push: number, force: number, slope: number }[],
 *   flat: { from: number, to: number, force: number, span: number } | null, leaves?: { length: number, count: number, each: number },
 *   findings: object[] }}
 *   flat: the travel either side of the cancelling point where the pair's slope stays within `within` × spring, and
 *   the force there (at its middle); leaves: each leaf's length, how many, and each one's stiffness
 */
export function balancedCellModel(p, m, o = {}) {
  const what = 'balancedCellModel', cell = curvedCellModel(p, m, { steps: o.steps ?? 80 });
  if (!cell.negative) refuse('cell.negative', `${what}: these beams have no negative stiffness to balance (rise over thickness ${cell.Q.toFixed(2)}): a higher rise, or thinner beams`);
  const k = o.spring ?? -cell.negative.least, within = o.within ?? 0.1;
  if (!(typeof k === 'number' && k > 0)) refuse('cell.spring', `${what}: spring is the positive spring's stiffness, above 0 N/mm (got ${said(o.spring)})`);
  if (!(typeof within === 'number' && within > 0 && within < 1)) refuse('cell.within', `${what}: within is a share of the spring's stiffness, between 0 and 1 (got ${said(o.within)})`);
  const curve = cell.curve.map((c) => ({ push: c.push, force: c.force + k * c.push, slope: c.slope + k }));
  // the run of steps round the most negative slope whose slope stays within the band
  const i0 = curve.findIndex((c) => c.push === cell.negative.at), ok = (c) => Math.abs(c.slope) <= within * k;
  let flat = null;
  if (i0 >= 0 && ok(curve[i0])) {
    let a = i0, b = i0;
    while (a > 0 && ok(curve[a - 1])) a--;
    while (b < curve.length - 1 && ok(curve[b + 1])) b++;
    const mid = curve[Math.round((a + b) / 2)];
    flat = { from: curve[a].push, to: curve[b].push, span: curve[b].push - curve[a].push, force: mid.force };
  }
  const out = [...cell.findings], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  if (flat) f(flat.span > 0 ? 'pass' : 'warn', `with a ${k.toFixed(3)} N/mm spring its stiffness stays within ${(within * 100).toFixed(0)}% of the spring's from ${flat.from.toFixed(2)} to ${flat.to.toFixed(2)} mm pushed (${flat.span.toFixed(2)} mm), holding about ${flat.force.toFixed(2)} N there`, 'cell.flat', { flat, spring: k });
  else f('fail', `a ${k.toFixed(3)} N/mm spring does not cancel the beams' ${cell.negative.least.toFixed(3)} N/mm anywhere within ${(within * 100).toFixed(0)}%: a spring nearer ${(-cell.negative.least).toFixed(3)} N/mm`, 'cell.flat', { spring: k, least: cell.negative.least });
  let leaves;
  if (m.strainLimit != null) {
    const lt = o.leaf?.thickness ?? p.thickness, lw = o.leaf?.width ?? p.width, reach = flat ? flat.to : cell.negative.at;
    const length = Math.sqrt((3 * lt * reach) / (m.strainLimit / 2)), each = (m.E * lw * lt ** 3) / length ** 3, count = Math.ceil(k / each - 1e-9);
    leaves = { length, count, each };
    f('info', `a printed spring of ${k.toFixed(3)} N/mm that stays within half the strain limit to ${reach.toFixed(2)} mm takes ${count} fixed-guided leaves ${lt} by ${lw} mm, each ${length.toFixed(1)} mm long (${each.toFixed(4)} N/mm each), side by side: ${(count * length).toFixed(0)} mm of leaf against the curved beams' ${(2 * p.length).toFixed(0)} mm, as its energy at that travel must be held at a low strain`, 'cell.leaves', { leaves, reach });
  }
  return { cell, spring: k, curve, flat, ...(leaves ? { leaves } : {}), findings: out };
}

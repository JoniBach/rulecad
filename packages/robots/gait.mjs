// Legs and gaits: a leg is a chain from the body to a foot, in stance (the foot on the ground, the body carried over it) or
// in swing (the foot lifted and carried forward). A gait is the legs' timing, as a duty factor and a phase each; through
// its cycle, the support polygon against the centre of mass, the load each stance foot takes, the torques that follow.
// Statics only: a quasi-static gait, where the body moves slowly enough that its own acceleration doesn't count.
import { chain, ik, jacobian, refuse } from './kinematics.mjs';

const num = Number.isFinite, G = 9.80665;

/** Duty factors and phases of the patterns the package knows, for legs given front left, front right, back left, back right
 * (a tripod: three each side, alternating). The phase is a share of the cycle. */
export const PATTERNS = {
  crawl: { duty: 0.8, phase: [0.5, 0, 0.75, 0.25], legs: 4, note: 'one foot at a time, each hind foot before the front one on its side: back left, front left, back right, front right', surge: 0.25 },
  walk: { duty: 0.65, phase: [0.5, 0, 0.75, 0.25], legs: 4, note: 'a crawl with less overlap', surge: 0.25 },
  trot: { duty: 0.5, phase: [0, 0.5, 0.5, 0], legs: 4, note: 'diagonals together' },
  tripod: { duty: 0.5, phase: [0, 0.5, 0, 0.5, 0, 0.5], legs: 6, note: 'three feet up, three down' },
};

/**
 * A two-joint leg, hip and knee both turning about y, swinging in the x-z plane below its hip; a straight-down leg is at
 * hip 90°, knee 0°. As a chain, with the foot as its tool.
 * @param {string} name @param {{ at: number[], upper: number, lower: number, hip?: [number, number], knee?: [number, number] }} o
 *   at: the hip in the body's frame, mm; hip and knee: limits, degrees
 */
export function leg(name, { at, upper, lower, hip = [0, 180], knee = [-150, 0] } = {}) {
  if (typeof name !== 'string' || !name) throw refuse('leg.name', `leg: give it a name (got ${JSON.stringify(name)})`);
  if (!Array.isArray(at) || at.length !== 3 || !at.every(num)) throw refuse('leg.at', `leg ${name}: at is the hip in the body's frame, [x, y, z] (got ${JSON.stringify(at)})`);
  for (const [k, v] of [['upper', upper], ['lower', lower]]) if (!num(v) || !(v > 0)) throw refuse('leg.size', `leg ${name}: ${k} is a length above 0 mm (got ${JSON.stringify(v)})`);
  const c = chain({ joints: [{ name: `${name}.hip`, type: 'revolute', origin: at, axis: [0, 1, 0], limits: hip }, { name: `${name}.knee`, type: 'revolute', origin: [upper, 0, 0], axis: [0, 1, 0], limits: knee }], tool: [lower, 0, 0] });
  return { name, chain: c, at: [...at], upper, lower };
}

const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lo = [], hi = [];
  for (const x of p) { while (lo.length >= 2 && cross2(lo.at(-2), lo.at(-1), x) <= 0) lo.pop(); lo.push(x); }
  for (const x of [...p].reverse()) { while (hi.length >= 2 && cross2(hi.at(-2), hi.at(-1), x) <= 0) hi.pop(); hi.push(x); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
/**
 * How far a point is inside the support polygon, mm: below 0, outside it. Two feet make a line and no area: at best 0.
 * @param {number[][]} feet [x, y] @param {number[]} com [x, y] @returns {number}
 */
export function stabilityMargin(feet, com) {
  if (feet.length < 2) return -Infinity;
  const distTo = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return ((dx * (com[1] - a[1]) - dy * (com[0] - a[0])) / l); };
  const P = hull(feet);
  if (P.length < 3) { const [a, b] = [P[0], P.at(-1)], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((com[0] - a[0]) * dx + (com[1] - a[1]) * dy) / l2)); return -Math.hypot(com[0] - a[0] - t * dx, com[1] - a[1] - t * dy); }
  let m = Infinity;
  for (let i = 0; i < P.length; i++) m = Math.min(m, distTo(P[i], P[(i + 1) % P.length]));
  return m;
}

/**
 * The vertical load on each stance foot: balances the weight and its moments, spread as evenly as balance allows.
 * @param {number[][]} feet [x, y] @param {number[]} com [x, y] @param {number} weight N @returns {number[]} N, up on each foot
 */
export function footLoads(feet, com, weight) {
  const n = feet.length;
  if (!n) return [];
  if (n === 1) return [weight];
  if (n === 2) { // the lever rule, along the line between them: a centre of mass off the line is a moment this doesn't hold
    const [a, b] = feet, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, u = ((com[0] - a[0]) * dx + (com[1] - a[1]) * dy) / l2;
    return [weight * (1 - u), weight * u];
  }
  // minimum-norm solution of A f = b, b = weight, moment about x, moment about y
  const rows = [feet.map(() => 1), feet.map((p) => p[0]), feet.map((p) => p[1])], b = [weight, weight * com[0], weight * com[1]];
  const M = rows.map((r, i) => rows.map((s, j) => r.reduce((t, x, k) => t + x * s[k], 0) + (i === j ? 1e-9 : 0)));
  const y = solve3(M, b);
  return feet.map((_, k) => rows[0][k] * y[0] + rows[1][k] * y[1] + rows[2][k] * y[2]);
}
function solve3(A, b) {
  const n = 3, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]));
}

/**
 * The torque at each joint of a leg for a force on its foot: J transposed. N and N m.
 * @param {object} c the leg's chain @param {number[]} q @param {number[]} force the ground's force on the foot, world axes, N
 * @returns {number[]} N m, a joint's torque that resists the load
 */
export function legTorques(c, q, force) {
  const J = jacobian(c, q);
  return J[0].map((_, i) => ((J[0][i] * force[0] + J[1][i] * force[1] + J[2][i] * force[2]) * (180 / Math.PI)) / 1000);
}

/**
 * Run a gait through its cycle.
 * @param {{ legs: object[], pattern: string | { duty: number, phase: number[] }, stride: number, lift: number, height: number, period: number, mass: number, com?: number[], friction?: number, steps?: number, surge?: number }} o
 *   legs: from leg(), in the pattern's order; stride: how far a foot travels along x in stance, mm; lift: the foot's height in swing;
 *   height: body above the ground, mm; period: one cycle, s; mass: kg; com: the centre of mass in the body's frame
 * @returns {{ ok: boolean, frames: object[], summary: object, findings: object[] }}
 */
export function gait(o) {
  if (!o || typeof o !== 'object') throw refuse('gait.input', 'gait: give { legs, pattern, stride, lift, height, period, mass }');
  const { legs, stride, lift, height, period, mass, com = [0, 0, 0], friction = 0.6, steps = 48 } = o;
  if (!Array.isArray(legs) || !legs.length || legs.some((l) => !l?.chain)) throw refuse('gait.legs', 'gait: legs is a list of leg()s');
  const p = typeof o.pattern === 'string' ? PATTERNS[o.pattern] : o.pattern;
  if (!p) throw refuse('gait.pattern', `gait: no pattern "${o.pattern}" (${Object.keys(PATTERNS).join(', ')}, or { duty, phase })`);
  if (p.phase.length !== legs.length) throw refuse('gait.pattern', `gait: the pattern has ${p.phase.length} phases, and there are ${legs.length} legs`);
  if (!(p.duty > 0 && p.duty <= 1)) throw refuse('gait.duty', `gait: duty is above 0 and at most 1 (got ${p.duty})`);
  for (const [k, v] of [['stride', stride], ['lift', lift], ['height', height], ['period', period], ['mass', mass]]) if (!num(v) || !(v > 0)) throw refuse(`gait.${k}`, `gait: ${k} is above 0 (got ${JSON.stringify(v)})`);
  const weight = mass * G, frames = [], findings = [], surge = o.surge ?? (p.surge ?? 0) * stride;
  // The body surges forward when a hind foot swings and back when a front one does (a crawl's centre of mass, with no
  // side-to-side, would sit on the line between two feet)
  const gap = Math.max(0, 0.25 - (1 - p.duty)), shift = (t) => surge * Math.sin(4 * Math.PI * (t - gap / 2)); // through zero while all four feet are down
  const footAt = (l, s, t) => { // s in [0, 1): 0 to duty in stance, duty to 1 in swing; a neutral foot under the hip
    const x0 = l.at[0] - shift(t), y0 = l.at[1];
    if (s < p.duty) { const u = s / p.duty; return { stance: true, foot: [x0 + stride / 2 - stride * u, y0, -height] }; }
    const u = (s - p.duty) / (1 - p.duty), arc = Math.sin(Math.PI * u) * lift;
    return { stance: false, foot: [x0 - stride / 2 + stride * u, y0, -height + arc] };
  };
  let lastQ = legs.map(() => null), worstMargin = Infinity, worstFrame = null, stable = true, clearance = Infinity;
  const torque = Object.fromEntries(legs.flatMap((l) => l.chain.names.map((n) => [n, 0])));
  for (let k = 0; k < steps; k++) {
    const t = k / steps, each = [];
    for (const [i, l] of legs.entries()) {
      const { stance, foot } = footAt(l, (t + p.phase[i]) % 1, t), r = ik(l.chain, foot, { ...(lastQ[i] ? { start: lastQ[i] } : {}), tolerance: 1e-3, maxIterations: 200 });
      if (!r.ok) return { ok: false, frames, summary: {}, findings: [...findings, { level: 'fail', text: `leg ${l.name} can't reach its foot at ${(t * 100).toFixed(0)}% of the cycle: ${r.reason}${r.miss ? ` (${r.miss.toFixed(2)} mm short)` : ''}. A shorter stride or a lower body`, code: 'gait.reach', refs: { leg: l.name }, values: { miss: r.miss ?? null, at: t } }] };
      lastQ[i] = r.q; each.push({ leg: l.name, stance, foot, q: r.q });
    }
    const down = each.filter((e) => e.stance), pts = down.map((e) => e.foot.slice(0, 2)), margin = stabilityMargin(pts, com.slice(0, 2));
    const loads = footLoads(pts, com.slice(0, 2), weight);
    down.forEach((e, j) => { e.load = loads[j]; if (loads[j] < -1e-6) e.tips = true; });
    for (const [i, e] of each.entries()) if (!e.stance) clearance = Math.min(clearance, e.foot[2] + height);
    for (const e of down) {
      const l = legs.find((x) => x.name === e.leg), tau = legTorques(l.chain, e.q, [0, 0, Math.max(0, e.load)]);
      e.torque = tau; l.chain.names.forEach((n, i) => { torque[n] = Math.max(torque[n], Math.abs(tau[i])); });
    }
    if (margin < worstMargin) { worstMargin = margin; worstFrame = t; }
    if (margin < -1e-6 || down.some((e) => e.tips)) stable = false;
    frames.push({ t, time: t * period, margin, feet: each });
  }
  const standing = frames.every((f) => f.feet.filter((e) => e.stance).length >= 3), kind = standing ? (stable ? 'statically stable' : 'not statically stable') : 'quasi-static: it rests on two feet';
  const worst = Object.entries(torque).sort((a, b) => b[1] - a[1])[0], minLift = frames.flatMap((f) => f.feet.filter((e) => !e.stance).map((e) => e.foot[2] + height)), peak = minLift.length ? Math.max(...minLift) : 0;
  const summary = { standing, stable, margin: worstMargin, at: worstFrame, torque, worst: { joint: worst[0], torque: worst[1] }, kind, clearance: peak };
  if (standing && !stable) findings.push({ level: 'fail', text: `the body tips: at ${(worstFrame * 100).toFixed(0)}% of the cycle its centre of mass is ${(-worstMargin).toFixed(1)} mm outside the feet`, code: 'gait.stable', values: { margin: worstMargin, at: worstFrame } });
  else if (standing) findings.push({ level: 'pass', text: `statically stable: the least margin is ${worstMargin.toFixed(1)} mm, at ${(worstFrame * 100).toFixed(0)}% of the cycle`, code: 'gait.stable', values: { margin: worstMargin, at: worstFrame } });
  else findings.push({ level: 'info', text: `quasi-static: at times it rests on two feet, so its balance depends on moving, and is not static (the worst moment is ${Math.max(0, -worstMargin).toFixed(1)} mm off the support line)`, code: 'gait.stable', values: { margin: worstMargin } });
  findings.push({ level: 'info', text: `the worst joint is ${worst[0]}, ${worst[1].toFixed(3)} N m, at a body of ${mass} kg`, code: 'gait.torque', values: { torque } });
  return { ok: !(standing && !stable), frames, summary, findings, friction };
}

// Mechanisms as beams that bend as far as they bend: each flexure a chain of short beam elements along its centreline,
// each rigid part a body, solved for equilibrium by Newton's method on the total energy. Large deflections, buckling,
// snap-through and any number of bodies and flexures. The elements are co-rotational Euler-Bernoulli beams (Crisfield,
// Non-linear Finite Element Analysis of Solids and Structures, 1991): each one's rigid turn taken out, what's left
// small. A part held where a step puts it reports the force it takes to hold it there, so a step's path is a force
// curve. Units: mm, N, MPa, radians.
//
// The unknowns: for each moving body its shift and turn (x, y, φ) about its reference point; for each node inside a
// flexure its shift and turn (u, v, θ). The ground doesn't move. A beam's end on a body moves with the body.

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// One element's energy and its gradient, from its ends' places and turns: axial stretch and bending, the chord's own
// turn taken out
function element(e, xa, ya, ta, xb, yb, tb) {
  const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy), c = dx / L, s = dy / L, beta = wrap(Math.atan2(dy, dx) - e.a0);
  const p1 = wrap(ta - beta), p2 = wrap(tb - beta), k = (2 * e.EI) / e.L0, N = (e.EA * (L - e.L0)) / e.L0;
  const m1 = k * (2 * p1 + p2), m2 = k * (2 * p2 + p1), m = -(m1 + m2); // dU/dφ1, dU/dφ2, and dU/dα through both
  const energy = (e.EA * (L - e.L0) ** 2) / (2 * e.L0) + k * (p1 * p1 + p1 * p2 + p2 * p2);
  const grad = [-N * c + (m * s) / L, -N * s - (m * c) / L, m1, N * c - (m * s) / L, N * s + (m * c) / L, m2];
  return { energy, grad, strain: Math.max(Math.abs(N) / e.EA, 0) + (e.t / 2) * Math.max(Math.abs((2 * (2 * p1 + p2)) / e.L0), Math.abs((2 * (2 * p2 + p1)) / e.L0)) };
}

/**
 * A system of rigid bodies and flexures, at rest.
 * @param {{ bodies: Record<string, { at: number[], fixed?: boolean, mass?: number, inertia?: number }>,
 *   beams: { name: string, path: number[][], thickness: number | number[], width: number, E: number, from?: string, to?: string }[],
 *   segments?: number }} spec bodies: each with its reference point (`at`); `fixed` for the ground. beams: a flexure's
 *   centreline as points from one end to the other (a beam, or a serpentine's folds), its thickness (one, or one per
 *   span between points), width and modulus; `from` and `to` the bodies its ends are fixed to (none: that end free).
 *   Each span is cut into elements no longer than its thickness times `segments` allows (default: 16 a beam)
 */
export function beamSystem({ bodies, beams, pins = [], segments = 16 }) {
  const body = {}, nodes = [], elements = [];
  let dofs = 0;
  for (const [name, b] of Object.entries(bodies)) body[name] = { name, at: b.at, fixed: !!b.fixed, dof: b.fixed ? -1 : (dofs += 3) - 3, mass: b.mass ?? 0, inertia: b.inertia ?? 0 };
  for (const bm of beams) {
    // The path, cut into elements: at least `segments` along the whole, each span in proportion to its length
    const spans = bm.path.length - 1, lengths = bm.path.slice(1).map((p, i) => Math.hypot(p[0] - bm.path[i][0], p[1] - bm.path[i][1])), total = lengths.reduce((a, b) => a + b, 0);
    const pts = [bm.path[0]], tks = [];
    for (let i = 0; i < spans; i++) {
      const n = Math.max(1, Math.round((segments * lengths[i]) / total)), a = bm.path[i], b = bm.path[i + 1], t = Array.isArray(bm.thickness) ? bm.thickness[i] : bm.thickness;
      for (let k = 1; k <= n; k++) { pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); tks.push(t); }
    }
    const end = (which, p) => { const name = which === 0 ? bm.from : bm.to; if (!name) return null; const b = body[name]; if (!b) throw new Error(`beam ${bm.name}: no body "${name}"`); return { body: b, o: [p[0] - b.at[0], p[1] - b.at[1]] }; };
    const ids = pts.map((p, i) => {
      const fix = i === 0 ? end(0, p) : i === pts.length - 1 ? end(1, p) : null;
      if (fix) return { at: p, ...fix };
      const n = { at: p, dof: (dofs += 3) - 3, beam: bm.name };
      nodes.push(n);
      return n;
    });
    for (let i = 0; i + 1 < ids.length; i++) {
      const a = ids[i], b = ids[i + 1], L0 = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]), t = tks[i], I = (bm.width * t ** 3) / 12;
      elements.push({ beam: bm.name, a, b, L0, a0: Math.atan2(b.at[1] - a.at[1], b.at[0] - a.at[0]), EA: bm.E * bm.width * t, EI: bm.E * I, t, w: bm.width, rho: bm.density ?? 0 });
    }
  }
  // Pins: a point on one body kept on the same point of another, stiff as the pin bears (E × its height), free to turn
  const ties = pins.map((p) => {
    const at = (name) => { const b = body[name]; if (!b) throw new Error(`pin ${p.name}: no body "${name}"`); return { body: b, o: [p.at[0] - b.at[0], p.at[1] - b.at[1]] }; };
    return { name: p.name, a: at(p.from), b: at(p.to), k: p.k ?? p.E * p.width };
  });
  return { body, nodes, elements, ties, dofs };
}

// An end's place, turn, and how they change with the unknowns: [dof index, ∂x, ∂y, ∂θ] rows, and the curvature term
function endOf(end, q) {
  if (end.dof != null) return { x: end.at[0] + q[end.dof], y: end.at[1] + q[end.dof + 1], t: q[end.dof + 2], rows: [[end.dof, 1, 0, 0], [end.dof + 1, 0, 1, 0], [end.dof + 2, 0, 0, 1]] };
  const b = end.body;
  if (b.fixed) return { x: b.at[0] + end.o[0], y: b.at[1] + end.o[1], t: 0, rows: [] };
  const phi = q[b.dof + 2], c = Math.cos(phi), s = Math.sin(phi), rx = c * end.o[0] - s * end.o[1], ry = s * end.o[0] + c * end.o[1];
  return { x: b.at[0] + q[b.dof] + rx, y: b.at[1] + q[b.dof + 1] + ry, t: phi, rows: [[b.dof, 1, 0, 0], [b.dof + 1, 0, 1, 0], [b.dof + 2, -ry, rx, 1]], phi: b.dof + 2, rx, ry };
}

/**
 * The system's energy at the unknowns q, its gradient and its stiffness (the Hessian, dense), and the most strain in
 * each beam.
 * @param {ReturnType<typeof beamSystem>} sys @param {Float64Array} q @param {{ hessian?: boolean, extra?: (q: Float64Array, g: Float64Array, H: Float64Array | null) => number }} [o]
 */
export function energyOf(sys, q, { hessian = true, extra } = {}) {
  const n = sys.dofs, g = new Float64Array(n), H = hessian ? new Float64Array(n * n) : null, strain = {}, energies = {};
  let U = 0;
  for (const e of sys.elements) {
    const A = endOf(e.a, q), B = endOf(e.b, q), r = element(e, A.x, A.y, A.t, B.x, B.y, B.t);
    U += r.energy;
    energies[e.beam] = (energies[e.beam] || 0) + r.energy;
    strain[e.beam] = Math.max(strain[e.beam] || 0, r.strain);
    const ends = [A, B];
    // The gradient through each end's rows
    ends.forEach((E, k) => { for (const [d, dx, dy, dt] of E.rows) g[d] += r.grad[3 * k] * dx + r.grad[3 * k + 1] * dy + r.grad[3 * k + 2] * dt; });
    if (!H) continue;
    // The element's own Hessian, by differences of its gradient (exact enough: the gradient is exact)
    const v = [A.x, A.y, A.t, B.x, B.y, B.t], h = 1e-7 * Math.max(1, e.L0), K = new Float64Array(36);
    for (let i = 0; i < 6; i++) {
      const at = v[i];
      v[i] = at + h; const gu = element(e, v[0], v[1], v[2], v[3], v[4], v[5]).grad;
      v[i] = at - h; const gd = element(e, v[0], v[1], v[2], v[3], v[4], v[5]).grad;
      v[i] = at;
      for (let j = 0; j < 6; j++) K[i * 6 + j] = (gu[j] - gd[j]) / (2 * h);
    }
    // Into the system's: each end's rows (a dof and how the end's x, y and turn move with it), Cᵢᵀ K Cⱼ for each pair
    const dofs = [], C = [];
    for (let k = 0; k < 2; k++) for (const [d, dx, dy, dt] of ends[k].rows) { const c = new Float64Array(6); c[3 * k] = dx; c[3 * k + 1] = dy; c[3 * k + 2] = dt; dofs.push(d); C.push(c); }
    const KC = C.map((c) => { const out = new Float64Array(6); for (let a = 0; a < 6; a++) { let t = 0; for (let b = 0; b < 6; b++) t += K[a * 6 + b] * c[b]; out[a] = t; } return out; });
    for (let i = 0; i < dofs.length; i++) for (let j = 0; j < dofs.length; j++) {
      let t = 0;
      for (let a = 0; a < 6; a++) t += C[i][a] * KC[j][a];
      H[dofs[i] * n + dofs[j]] += t;
    }
    // A body's turn bends its arm: the place's second derivative in φ is minus the arm
    ends.forEach((E, k) => { if (E.phi != null) H[E.phi * n + E.phi] += -r.grad[3 * k] * E.rx - r.grad[3 * k + 1] * E.ry; });
  }
  // Each pin: ½ k |a − b|², its stiffness J^T k J, and the turn's own term (a point's second derivative in φ is minus its arm)
  for (const t of sys.ties || []) {
    const A = endOf(t.a, q), B = endOf(t.b, q), dx = A.x - B.x, dy = A.y - B.y;
    U += 0.5 * t.k * (dx * dx + dy * dy);
    const rows = [...A.rows.map((r) => [r[0], r[1], r[2]]), ...B.rows.map((r) => [r[0], -r[1], -r[2]])];
    for (const [d, ax, ay] of rows) g[d] += t.k * (dx * ax + dy * ay);
    if (!H) continue;
    for (const [d1, ax1, ay1] of rows) for (const [d2, ax2, ay2] of rows) H[d1 * n + d2] += t.k * (ax1 * ax2 + ay1 * ay2);
    if (A.phi != null) H[A.phi * n + A.phi] += t.k * (dx * -A.rx + dy * -A.ry);
    if (B.phi != null) H[B.phi * n + B.phi] -= t.k * (dx * -B.rx + dy * -B.ry);
  }
  if (extra) U += extra(q, g, H);
  return { energy: U, grad: g, hessian: H, strain, energies }; // energies: each beam's own (N·mm, mJ)
}

// Solve A x = b, A dense n × n (overwritten), by LU with partial pivoting
// Gaussian elimination with partial pivoting, kept to the matrix's band: a chain of beam elements couples each node
// only to its neighbours, so its stiffness is banded and the work is n·bw² rather than n³. Pivoting keeps the band
// below the diagonal and at most doubles it above, so this is exact for any matrix (a dense one has a band of n).
function luSolve(A, b, n) {
  let bw = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (A[i * n + j] !== 0 && Math.abs(i - j) > bw) bw = Math.abs(i - j);
  const x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    const below = Math.min(n, k + bw + 1), right = Math.min(n, k + 2 * bw + 1);
    let m = k, best = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < below; i++) { const v = Math.abs(A[i * n + k]); if (v > best) { best = v; m = i; } }
    if (best < 1e-300) return null;
    if (m !== k) { for (let j = k; j < right; j++) { const t = A[k * n + j]; A[k * n + j] = A[m * n + j]; A[m * n + j] = t; } const t = x[k]; x[k] = x[m]; x[m] = t; }
    const d = A[k * n + k];
    for (let i = k + 1; i < below; i++) {
      const f = A[i * n + k] / d;
      if (!f) continue;
      A[i * n + k] = f;
      for (let j = k + 1; j < right; j++) A[i * n + j] -= f * A[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; const right = Math.min(n, i + 2 * bw + 1); for (let j = i + 1; j < right; j++) s -= A[i * n + j] * x[j]; x[i] = s / A[i * n + i]; }
  return x;
}

/**
 * Equilibrium: the unknowns that leave no net force, with some held where they're put (`held`: dof index to value) and
 * forces on others (`loads`: dof index to force). Newton's method, with a line search on the energy and a little
 * damping where the stiffness isn't positive (a buckled or snapping state), from `start`.
 * @param {ReturnType<typeof beamSystem>} sys
 * @param {{ held?: Map<number, number>, loads?: Map<number, number>, start?: Float64Array, tol?: number, iterations?: number, extra?: Function }} o
 * @returns {{ q: Float64Array, energy: number, reaction: Map<number, number>, strain: Record<string, number>, converged: boolean, iterations: number }}
 *   reaction: the force (or moment) it takes to hold each held dof where it is
 */
const BALANCE = 1e-4; // the share of the forces at work that may be left unbalanced
export function equilibrium(sys, { held = new Map(), loads = new Map(), start, tol = 1e-7, iterations = 60, extra } = {}) {
  const n = sys.dofs, q = start ? Float64Array.from(start) : new Float64Array(n);
  for (const [d, v] of held) q[d] = v;
  const free = [...Array(n).keys()].filter((d) => !held.has(d)), m = free.length;
  const total = (x, hess) => {
    const r = energyOf(sys, x, { hessian: hess, extra });
    let U = r.energy;
    for (const [d, f] of loads) { U -= f * x[d]; r.grad[d] -= f; }
    return { ...r, energy: U };
  };
  let r = total(q, true), it = 0, lambda = 0, converged = false;
  const scale = Math.max(1e-9, ...sys.elements.map((e) => e.EI / e.L0 ** 2)) ; // a force a typical element makes
  for (; it < iterations; it++) {
    const gf = free.map((d) => r.grad[d]), norm = Math.sqrt(gf.reduce((a, x) => a + x * x, 0));
    // Settled: what's left unbalanced is small beside a typical element's force, and beside the forces at work here
    // (the loads, and what it takes to hold the held). The second matters on a fine mesh, whose short elements make
    // the first so large that a small load would pass as balanced before anything had moved.
    let atWork = 0;
    for (const f of loads.values()) atWork += f * f;
    for (const d of held.keys()) atWork += r.grad[d] * r.grad[d];
    if (norm < Math.min(tol * scale * Math.sqrt(m + 1), Math.max(BALANCE * Math.sqrt(atWork), 1e-9 * scale))) { converged = true; break; }
    let step = null;
    for (let tries = 0; tries < 8 && !step; tries++) {
      const A = new Float64Array(m * m);
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) A[i * m + j] = r.hessian[free[i] * n + free[j]];
      const diag = Math.max(1e-12, ...free.map((d) => Math.abs(r.hessian[d * n + d])));
      if (lambda) for (let i = 0; i < m; i++) A[i * m + i] += lambda * diag;
      const dx = luSolve(A, gf.map((x) => -x), m);
      if (dx && free.reduce((a, d, i) => a + gf[i] * dx[i], 0) < 0) step = dx; // a descent direction
      else lambda = lambda ? lambda * 10 : 1e-6;
    }
    if (!step) break;
    // Line search: the whole step, or less, so the energy falls
    let a = 1, next = null;
    for (let k = 0; k < 30; k++) {
      const x = Float64Array.from(q);
      free.forEach((d, i) => { x[d] += a * step[i]; });
      const t = total(x, false);
      if (t.energy <= r.energy + 1e-4 * a * free.reduce((s, d, i) => s + gf[i] * step[i], 0) || k === 29) { next = x; break; }
      a /= 2;
    }
    q.set(next);
    r = total(q, true);
    lambda = a === 1 ? lambda / 10 : lambda;
    if (lambda < 1e-12) lambda = 0;
  }
  const reaction = new Map([...held.keys()].map((d) => [d, r.grad[d] + (loads.get(d) || 0)]));
  return { q, energy: r.energy, reaction, strain: r.strain, converged, iterations: it };
}

/**
 * Where everything is for unknowns q: each body's place (x, y, φ), each beam's centreline and each of its nodes' turns.
 * @param {ReturnType<typeof beamSystem>} sys @param {Float64Array} q
 */
export function shapeOf(sys, q) {
  const bodies = Object.fromEntries(Object.values(sys.body).map((b) => [b.name, b.fixed ? [0, 0, 0] : [q[b.dof], q[b.dof + 1], q[b.dof + 2]]]));
  const lines = {}, turns = {};
  for (const e of sys.elements) {
    const A = endOf(e.a, q), B = endOf(e.b, q), l = (lines[e.beam] ??= [[A.x, A.y]]), t = (turns[e.beam] ??= [A.t]);
    l.push([B.x, B.y]); t.push(B.t);
  }
  return { bodies, lines, turns };
}

/**
 * What the flexures put on the fixed bodies (the frame) at unknowns q: each element end on a fixed body, where it is,
 * the force on the body there (N) and the moment (N·mm, anticlockwise). Their opposite is what the frame must give,
 * so a frame modelled as elastic can be loaded with them.
 * @param {ReturnType<typeof beamSystem>} sys @param {Float64Array} q
 * @returns {{ body: string, at: number[], force: number[], moment: number }[]}
 */
export function fixedLoads(sys, q) {
  const out = [];
  for (const e of sys.elements) {
    const A = endOf(e.a, q), B = endOf(e.b, q), r = element(e, A.x, A.y, A.t, B.x, B.y, B.t);
    [[e.a, A, 0], [e.b, B, 1]].forEach(([end, P, k]) => { if (end.body?.fixed) out.push({ beam: e.beam, body: end.body.name, at: [P.x, P.y], force: [-r.grad[3 * k], -r.grad[3 * k + 1]], moment: -r.grad[3 * k + 2] }); });
  }
  return out;
}

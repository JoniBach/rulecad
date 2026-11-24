// Layout optimisation of pin-jointed frames: which members to keep between a cloud of candidate nodes, and how thick,
// so the frame carries its loads to its supports with the least material. The plastic ground structure method:
// every pair of nodes is a candidate member (Dorn, Gomory and Greenberg 1964), the least volume is a linear
// programme, and members are added to it a few at a time where the solution's virtual strains say they would help,
// until none would (Gilbert and Tyas 2003). The answer is then the least volume over every candidate, proven so,
// while the programme only ever holds a small share of them. Several load cases share one set of areas (each member
// as thick as its worst case needs). Plain numbers in typed arrays, no dependencies.
//
// Units: millimetres, newtons, MPa (N/mm²), so areas are mm² and volumes mm³; densities in g/cm³, masses in kg.
//
// The programme, for members i of length l_i and load cases k with forces f_k on the free freedoms:
//   least Σ (l_i + s) a_i  such that  B q_k = f_k  and  −σc a_i ≤ q_ik ≤ σt a_i  for every case,
// where B is the equilibrium matrix (a member's column is its unit direction at its two nodes), q_ik the member's
// force (tension positive), a_i its area, σt and σc the strengths in tension and compression and s a joint's cost
// as a length (Parkes 1975; 0 by default). It is solved in the standard form, each force split q = p − n with p and
// n ≥ 0 and a slack per member and case, by a primal-dual interior point method with Mehrotra's predictor and
// corrector (Nocedal and Wright 2006, chapter 14). The dual's equilibrium rows are the nodes' virtual displacements
// u_k; a candidate member not in the programme would lower the volume exactly when
//   Σ_k max(0, σt bᵢ·u_k, −σc bᵢ·u_k) > l_i + s,
// its virtual strain past the limit, which is the test members are added by.

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{ at: number[], r: number, through?: boolean }} LayoutAvoid a ball (a circle in a flat layout) no node or member may enter: centre, mm, and radius; through: members may pass through it and only nodes are kept out (a wheel that stays straddle) */
/** @typedef {{ node: string | number, force: number[] }} LayoutLoad a force, N, at a node: [x, y, z] (or [x, y] in a flat layout) */
/**
 * @typedef {object} LayoutProblem
 * @property {Record<string, number[]> | number[][]} [nodes] the candidate nodes, mm, by name (or a list, named by place)
 * @property {{ from: number[], to: number[], pitch: number }} [grid] more candidate nodes, every `pitch` mm across a
 *   box, named "x,y" or "x,y,z" by their place in it; one within a hundredth of the pitch of a named node gives way to it
 * @property {Record<string, 'pinned' | { x?: boolean, y?: boolean, z?: boolean }>} supports by node: 'pinned' holds
 *   every movement, or say which
 * @property {LayoutLoad[]} [loads] the one load case
 * @property {{ label?: string, loads: LayoutLoad[] }[]} [cases] several load cases, each carried alone, sharing the areas
 * @property {number | { tension: number, compression: number }} strength MPa: one for both, or each
 * @property {number} [density] g/cm³, for the mass
 * @property {number} [joint] a joint's cost as a length of member, mm (0): above 0, fewer and longer members
 * @property {number} [reach] the longest candidate member, mm (no limit)
 * @property {LayoutAvoid[]} [avoid] balls no node or member may enter
 * @property {boolean} [plane] a flat layout in x and y (left out: flat when every node and load is at z = 0)
 */
/**
 * @typedef {object} LayoutMember
 * @property {string} id "a-b"
 * @property {string} a @property {string} b its nodes
 * @property {number} length mm
 * @property {number} area mm²: its worst case's force over the strength
 * @property {number[]} forces N in each case, tension positive
 * @property {'tension' | 'compression' | 'both'} kind
 */

const DIMS = ['x', 'y', 'z'];
const KEYS = ['nodes', 'grid', 'supports', 'loads', 'cases', 'strength', 'density', 'joint', 'reach', 'avoid', 'plane'];
const OPTIONS = ['keep', 'start', 'add', 'tolerance', 'adding'];
/** @returns {never} */
const refuse = (code, text, more) => { throw Object.assign(new Error(text), { code: `fea.layout.${code}`, ...more }); };
const said = (v) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v) ?? String(v));
const isPoint = (v) => Array.isArray(v) && (v.length === 2 || v.length === 3) && v.every(Number.isFinite);
const round = (v, d = 6) => Number(v.toPrecision(d));

// ---- candidate nodes and members ----

/**
 * Candidate nodes every `pitch` mm across a box, both ends included, by name "i,j" (or "i,j,k"): their places along
 * x, y and z.
 * @param {{ from: number[], to: number[], pitch: number }} g
 * @returns {Record<string, Vec3>}
 */
export function nodeGrid(g) {
  if (!g || typeof g !== 'object' || !isPoint(g.from) || !isPoint(g.to) || g.from.length !== g.to.length) refuse('input', `grid is { from, to, pitch }: two corners [x, y] or [x, y, z] in mm and a spacing (got ${said(g)})`);
  if (!(g.pitch > 0) || !Number.isFinite(g.pitch)) refuse('input', `grid.pitch is the spacing in mm, above 0 (got ${said(g.pitch)})`);
  const d = g.from.length, counts = g.from.map((v, i) => Math.round(Math.abs(g.to[i] - v) / g.pitch));
  if (counts.reduce((t, c) => t * (c + 1), 1) > 20000) refuse('input', `grid makes ${counts.reduce((t, c) => t * (c + 1), 1)} nodes: at most 20000 (a coarser pitch, or a smaller box)`);
  const out = {};
  const walk = (i, at, idx) => {
    if (i === d) { out[idx.join(',')] = /** @type {Vec3} */ ([at[0], at[1], at[2] ?? 0]); return; }
    for (let c = 0; c <= counts[i]; c++) walk(i + 1, [...at, counts[i] ? g.from[i] + ((g.to[i] - g.from[i]) * c) / counts[i] : g.from[i]], [...idx, c]);
  };
  walk(0, [], []);
  return out;
}

// the segment from p to q passes within r of c (strictly inside the ball)
const crosses = (p, q, c, r) => {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [c[0] - p[0], c[1] - p[1], c[2] - p[2]], dd = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  const t = Math.min(1, Math.max(0, dd ? (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / dd : 0));
  return Math.hypot(w[0] - t * d[0], w[1] - t * d[1], w[2] - t * d[2]) < r * (1 - 1e-9);
};

/**
 * The candidate members between nodes: every pair, less those that pass through a third node (the same as two
 * shorter ones there, and so never needed: Gilbert and Tyas 2003), those longer than `reach` and those that enter
 * an `avoid` ball (but for one members may pass `through`).
 * @param {Record<string, number[]> | number[][]} nodes mm
 * @param {{ reach?: number, avoid?: LayoutAvoid[] }} [o]
 * @returns {{ ids: string[], at: Float64Array, members: { a: number, b: number, length: number }[] }} at: x, y, z of
 *   each node in turn; members by node index
 */
export function groundStructure(nodes, o = {}) {
  const ids = Object.keys(nodes), n = ids.length, at = new Float64Array(3 * n);
  ids.forEach((id, i) => { const p = nodes[id]; if (!isPoint(p)) refuse('node', `node ${said(id)} is at ${said(p)}: a place [x, y] or [x, y, z] in mm`, { node: id }); at.set([p[0], p[1], p[2] ?? 0], 3 * i); });
  const reach = o.reach ?? Infinity, avoid = (o.avoid ?? []).filter((v) => !v.through).map((v) => ({ c: [v.at[0], v.at[1], v.at[2] ?? 0], r: v.r }));
  let span = 0;
  for (let i = 0; i < 3; i++) { let lo = Infinity, hi = -Infinity; for (let p = 0; p < n; p++) { lo = Math.min(lo, at[3 * p + i]); hi = Math.max(hi, at[3 * p + i]); } span = Math.max(span, hi - lo); }
  const members = [];
  for (let a = 0; a < n; a++) {
    // from a, the nearest node in each direction: a member to any further one there passes through it
    const nearest = new Map();
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      const d = [at[3 * b] - at[3 * a], at[3 * b + 1] - at[3 * a + 1], at[3 * b + 2] - at[3 * a + 2]], L = Math.hypot(...d);
      if (!(L > 1e-9 * span)) refuse('node', `nodes ${said(ids[a])} and ${said(ids[b])} are at the same place`, { nodes: [ids[a], ids[b]] });
      const key = d.map((v) => Math.round((v / L) * 1e6)).join(',');
      const was = nearest.get(key);
      if (!was || L < was.L) nearest.set(key, { b, L });
    }
    for (const { b, L } of nearest.values()) {
      if (b < a || L > reach * (1 + 1e-9)) continue;
      const p = [at[3 * a], at[3 * a + 1], at[3 * a + 2]], q = [at[3 * b], at[3 * b + 1], at[3 * b + 2]];
      if (avoid.some((v) => crosses(p, q, v.c, v.r))) continue;
      members.push({ a, b, length: L });
    }
  }
  return { ids, at, members };
}

// ---- the linear programme: least cᵀx with A x = b, x ≥ 0 ----

// A is given by columns. Its rows are global (the equilibrium rows) or local: each local row belongs to a small block
// (a member's rows, one a case), and each column touches at most one block. The normal matrix A D Aᵀ is then solved
// by eliminating the blocks first: a dense Schur complement over the global rows, and small blocks.
function interior({ cost, start, rows, vals, G, blockOf, blocks, b, tol = 1e-9, loose = 1e-6, most = 120 }) {
  const N = cost.length, R = b.length;
  // each block's global rows touched, and each column's block
  const colBlock = new Int32Array(N).fill(-1), touched = blocks.map(() => new Map());
  for (let j = 0; j < N; j++) for (let e = start[j]; e < start[j + 1]; e++) { const r = rows[e]; if (r >= G) colBlock[j] = blockOf[r - G]; }
  for (let j = 0; j < N; j++) { const k = colBlock[j]; if (k < 0) continue; for (let e = start[j]; e < start[j + 1]; e++) { const r = rows[e]; if (r < G && !touched[k].has(r)) touched[k].set(r, touched[k].size); } }
  const local = new Int32Array(R - G); // a local row's place in its block
  for (const rowsOf of blocks) rowsOf.forEach((r, i) => { local[r - G] = i; });
  const Ax = (x) => { const y = new Float64Array(R); for (let j = 0; j < N; j++) { const v = x[j]; if (v) for (let e = start[j]; e < start[j + 1]; e++) y[rows[e]] += vals[e] * v; } return y; };
  const ATy = (y) => { const x = new Float64Array(N); for (let j = 0; j < N; j++) { let s = 0; for (let e = start[j]; e < start[j + 1]; e++) s += vals[e] * y[rows[e]]; x[j] = s; } return x; };
  // factorise A D Aᵀ, returning its solve
  const factor = (D) => {
    const S = new Float64Array(G * G), H = blocks.map((r) => new Float64Array(r.length ** 2)), C = blocks.map((r, k) => new Float64Array(touched[k].size * r.length));
    for (let j = 0; j < N; j++) {
      const d = D[j], k = colBlock[j], s0 = start[j], s1 = start[j + 1];
      for (let e = s0; e < s1; e++) {
        const r = rows[e], v = d * vals[e];
        for (let f = s0; f < s1; f++) {
          const q = rows[f];
          if (r < G && q < G) { if (q <= r) S[r * G + q] += v * vals[f]; }
          else if (r >= G && q >= G) H[k][local[r - G] * blocks[k].length + local[q - G]] += v * vals[f];
          else if (r < G) C[k][touched[k].get(r) * blocks[k].length + local[q - G]] += v * vals[f];
        }
      }
    }
    // each block's inverse, and its part of the Schur complement S − C H⁻¹ Cᵀ
    const Hinv = H.map((h, k) => invert(h, blocks[k].length)), W = C.map((c, k) => mul(c, Hinv[k], touched[k].size, blocks[k].length));
    blocks.forEach((rowsOf, k) => {
      const m = rowsOf.length, g = [...touched[k].keys()];
      g.forEach((r, i) => g.forEach((q, p) => { if (q > r) return; let s = 0; for (let t = 0; t < m; t++) s += W[k][i * m + t] * C[k][p * m + t]; S[r * G + q] -= s; }));
    });
    const L = cholesky(S, G);
    return (rhs) => {
      const t = rhs.slice(0, G);
      blocks.forEach((rowsOf, k) => { const m = rowsOf.length, g = [...touched[k].keys()]; g.forEach((r, i) => { let s = 0; for (let q = 0; q < m; q++) s += W[k][i * m + q] * rhs[rowsOf[q]]; t[r] -= s; }); });
      const yG = cholSolve(L, t, G), y = new Float64Array(R);
      y.set(yG);
      blocks.forEach((rowsOf, k) => {
        const m = rowsOf.length, g = [...touched[k].keys()], u = rowsOf.map((r) => rhs[r]);
        g.forEach((r, i) => { for (let q = 0; q < m; q++) u[q] -= C[k][i * m + q] * yG[r]; });
        for (let p = 0; p < m; p++) { let s = 0; for (let q = 0; q < m; q++) s += Hinv[k][p * m + q] * u[q]; y[rowsOf[p]] = s; }
      });
      return y;
    };
  };
  const norm = (v) => Math.sqrt(v.reduce((t, x) => t + x * x, 0)), nb = norm(b), nc = norm(cost);
  // Mehrotra's starting point
  const one = new Float64Array(N).fill(1), solve0 = factor(one);
  const x = ATy(solve0(b)), y = solve0(Ax(cost)), z = Float64Array.from(ATy(y), (v, j) => cost[j] - v);
  const dx0 = Math.max(-1.5 * Math.min(...x), 0), dz0 = Math.max(-1.5 * Math.min(...z), 0);
  for (let j = 0; j < N; j++) { x[j] += dx0; z[j] += dz0; }
  let xz = 0, sx = 0, sz = 0;
  for (let j = 0; j < N; j++) { xz += x[j] * z[j]; sx += x[j]; sz += z[j]; }
  for (let j = 0; j < N; j++) { x[j] += (0.5 * xz) / sz + 1e-12; z[j] += (0.5 * xz) / sx + 1e-12; }
  const stepTo = (v, dv) => { let a = 1; for (let j = 0; j < N; j++) if (dv[j] < 0) a = Math.min(a, -v[j] / dv[j]); return a; };
  let best = { x, y, z, value: NaN, iterations: 0, err: Infinity, at: 0 };
  for (let it = 0; it < most; it++) {
    const Axv = Ax(x), rp = Float64Array.from(b, (v, i) => v - Axv[i]), Aty = ATy(y), rd = Float64Array.from(cost, (v, j) => v - Aty[j] - z[j]);
    let gap = 0, cx = 0, by = 0;
    for (let j = 0; j < N; j++) { gap += x[j] * z[j]; cx += cost[j] * x[j]; }
    for (let i = 0; i < R; i++) by += b[i] * y[i];
    const mu = gap / N;
    // the worst of the three relative errors: equilibrium, the members' limits, and the gap between the two values
    const err = Math.max(norm(rp) / (1 + nb), norm(rd) / (1 + nc), Math.abs(cx - by) / (1 + Math.abs(cx)));
    if (err <= tol) return { x, y, z, value: cx, iterations: it, ok: true };
    if (!(cx < 1e14) || !Number.isFinite(mu)) break;
    if (err < best.err) best = { x: x.slice(), y: y.slice(), z: z.slice(), value: cx, iterations: it, err, at: it };
    else if (it - best.at > 15) break; // stalled: rounding in a nearly singular normal matrix stops further progress
    const D = Float64Array.from(x, (v, j) => v / z[j]), solve = factor(D);
    const direction = (rc) => {
      const t = new Float64Array(N);
      for (let j = 0; j < N; j++) t[j] = D[j] * rd[j] - rc[j] / z[j];
      const At = Ax(t), dy = solve(Float64Array.from(rp, (v, i) => v + At[i])), Atdy = ATy(dy);
      const dx = new Float64Array(N), dz = new Float64Array(N);
      for (let j = 0; j < N; j++) { dx[j] = D[j] * (Atdy[j] - rd[j]) + rc[j] / z[j]; dz[j] = rd[j] - Atdy[j]; }
      return { dx, dy, dz };
    };
    const aff = direction(Float64Array.from(x, (v, j) => -v * z[j]));
    const ap = stepTo(x, aff.dx), ad = stepTo(z, aff.dz);
    let muAff = 0;
    for (let j = 0; j < N; j++) muAff += (x[j] + ap * aff.dx[j]) * (z[j] + ad * aff.dz[j]);
    const sigma = (muAff / N / mu) ** 3;
    const { dx, dy, dz } = direction(Float64Array.from(x, (v, j) => sigma * mu - v * z[j] - aff.dx[j] * aff.dz[j]));
    const sp = Math.min(1, 0.995 * stepTo(x, dx)), sd = Math.min(1, 0.995 * stepTo(z, dz));
    for (let j = 0; j < N; j++) { x[j] += sp * dx[j]; z[j] += sd * dz[j]; }
    for (let i = 0; i < R; i++) y[i] += sd * dy[i];
  }
  // else the best point, if it met a looser test (a millionth): its value is good to about that share
  return { x: best.x, y: best.y, z: best.z, value: best.value, iterations: best.iterations, ok: best.err <= loose };
}
// a small symmetric positive definite matrix's inverse (m × m, row by row)
function invert(h, m) {
  const L = cholesky(Float64Array.from(h), m), out = new Float64Array(m * m);
  for (let c = 0; c < m; c++) { const e = new Float64Array(m); e[c] = 1; const v = cholSolve(L, e, m); for (let r = 0; r < m; r++) out[r * m + c] = v[r]; }
  return out;
}
const mul = (c, h, rows, m) => { const out = new Float64Array(rows * m); for (let i = 0; i < rows; i++) for (let j = 0; j < m; j++) { let s = 0; for (let t = 0; t < m; t++) s += c[i * m + t] * h[t * m + j]; out[i * m + j] = s; } return out; };
// Cholesky of a dense symmetric matrix from its lower triangle, in place. A pivot that is nothing beside its own
// row's diagonal (a row no column reaches, or one that depends on the rows before it, so all but rounding cancelled)
// is made huge, so that direction is solved as 0 (as Zhang's LIPSOL does). The test is against the row's own
// diagonal, not the matrix's largest: near the optimum the diagonal spans many orders (a lightly loaded joint beside
// a main member), and a small but sound pivot dropped there leaves its equilibrium error unmended for good.
function cholesky(S, n) {
  for (let j = 0; j < n; j++) {
    const rj = j * n;
    let d = S[rj + j];
    const own = d;
    for (let k = 0; k < j; k++) d -= S[rj + k] * S[rj + k];
    if (!(d > 1e-30 + 1e-13 * own)) { S[rj + j] = 1e64; for (let i = j + 1; i < n; i++) S[i * n + j] = 0; continue; }
    const p = Math.sqrt(d);
    S[rj + j] = p;
    for (let i = j + 1; i < n; i++) {
      const ri = i * n;
      let s = S[ri + j];
      for (let k = 0; k < j; k++) s -= S[ri + k] * S[rj + k];
      S[ri + j] = s / p;
    }
  }
  return S;
}
function cholSolve(L, b, n) {
  const y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { let s = y[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * y[k]; y[i] = s / L[i * n + i]; }
  return y;
}

// ---- the layout ----

/**
 * The least-volume pin-jointed frame that carries the loads to the supports, chosen from every member between the
 * candidate nodes (the ground structure), with each member's area. Proven least over every candidate: members are
 * added to the programme until no left-out one would lower the volume. Refused by name before any maths: unknown
 * keys, a node out of place or twice at one spot, a support or load at no node, no strength above 0, a load where
 * nothing can carry it; and after, a frame the candidates cannot make stand (`fea.layout.unstable`).
 * @param {LayoutProblem} problem
 * @param {{ keep?: number, start?: number, add?: number, tolerance?: number, adding?: boolean }} [o] keep: members
 *   thinner than this share of the thickest are left out of `members` (1e-4; the volume counts them); start: each
 *   node's nearest candidates in the first programme (8 flat, 18 in space); add: most members added a round (a tenth
 *   of the programme's, at least 100); adding: false puts every candidate in the one programme
 * @returns {{ volume: number, mass: number | null, members: LayoutMember[], nodes: Record<string, Vec3>,
 *   cases: string[], plane: boolean, candidates: number, programme: number, rounds: number, strain: number, left: number,
 *   virtual: Record<string, number[]>[], strength: { tension: number, compression: number }, joint: number,
 *   supports: Record<string, string>, loads: { label: string, loads: LayoutLoad[] }[] }}
 *   volume mm³ (the members' l a, every member counted); mass kg with a density; members the kept ones, thickest
 *   first; nodes the ones they meet at, with the loaded and supported ones; candidates how many members the ground
 *   structure has, programme how many the last programme held, rounds how many programmes were solved; strain the
 *   largest virtual strain of any candidate over its limit, 1 at most (to the tolerance) when the layout is the least
 *   over every candidate; left the volume share of the members under `keep`; virtual each case's virtual
 *   displacements by node, mm (the programme's dual), scaled so a member at its tension limit in one case stretches
 *   by its own length
 */
export function layout(problem, o = {}) {
  if (!problem || typeof problem !== 'object') refuse('input', 'layout takes { nodes or grid, supports, loads or cases, strength }');
  for (const k of Object.keys(problem)) if (!KEYS.includes(k)) refuse('input', `a layout has no "${k}": it takes ${KEYS.join(', ')}`);
  for (const k of Object.keys(o)) if (!OPTIONS.includes(k)) refuse('input', `layout has no option "${k}": it takes ${OPTIONS.join(', ')}`);
  // the strengths
  const st = problem.strength, strength = typeof st === 'number' ? { tension: st, compression: st } : st;
  if (!strength || !(strength.tension > 0) || !(strength.compression > 0) || !Number.isFinite(strength.tension) || !Number.isFinite(strength.compression)) refuse('strength', `strength is MPa above 0, one number or { tension, compression } (got ${said(st)})`);
  for (const [k, v] of [['density', problem.density], ['joint', problem.joint], ['reach', problem.reach]]) if (v != null && !(v >= 0 && Number.isFinite(v) && (k !== 'reach' || v > 0))) refuse('input', `${k} is ${k === 'density' ? 'g/cm³' : 'mm'}, ${k === 'reach' ? 'above 0' : '0 or more'} (got ${said(v)})`);
  const keep = o.keep ?? 1e-4, tolerance = o.tolerance ?? 1e-5;
  if (!(keep >= 0 && keep < 1)) refuse('input', `keep is a share of the thickest member, 0 to under 1 (got ${said(o.keep)})`);
  for (const [k, v] of [['start', o.start], ['add', o.add]]) if (v != null && !(Number.isInteger(v) && v >= 1)) refuse('input', `${k} is a whole number from 1 (got ${said(v)})`);
  // the nodes: named ones, then the grid's
  if (!problem.nodes && !problem.grid) refuse('input', 'a layout needs candidate nodes: nodes, or a grid of them, or both');
  const named = Array.isArray(problem.nodes) ? Object.fromEntries(problem.nodes.map((p, i) => [String(i), p])) : { ...(problem.nodes ?? {}) };
  for (const [id, p] of Object.entries(named)) if (!isPoint(p)) refuse('node', `node ${said(id)} is at ${said(p)}: a place [x, y] or [x, y, z] in mm`, { node: id });
  const avoid = problem.avoid ?? [];
  if (!Array.isArray(avoid)) refuse('input', 'avoid is a list of { at, r }: balls no node or member may enter');
  avoid.forEach((v, i) => { if (!v || !isPoint(v.at) || !(v.r > 0) || (v.through != null && typeof v.through !== 'boolean') || Object.keys(v).some((k) => !['at', 'r', 'through'].includes(k))) refuse('input', `avoid ${i + 1} is { at, r, through }: a centre in mm, a radius above 0, and through true where members may pass through it (got ${said(v)})`); });
  const inside = (p, solid) => avoid.some((v) => (!solid || !v.through) && Math.hypot(p[0] - v.at[0], p[1] - v.at[1], (p[2] ?? 0) - (v.at[2] ?? 0)) < v.r * (1 - 1e-9));
  // a named node may sit inside a region members pass through (the axle of a wheel the stays straddle); the grid's may not
  for (const [id, p] of Object.entries(named)) if (inside(p, true)) refuse('node', `node ${said(id)} is inside an avoided region`, { node: id });
  const nodes = /** @type {Record<string, number[]>} */ ({ ...named });
  if (problem.grid) {
    const g = nodeGrid(problem.grid), near = problem.grid.pitch / 100, list = Object.values(named);
    for (const [id, p] of Object.entries(g)) if (!inside(p) && !list.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - (q[2] ?? 0)) < near) && !(id in nodes)) nodes[id] = p;
  }
  // supports and load cases
  if (!problem.supports || typeof problem.supports !== 'object' || !Object.keys(problem.supports).length) refuse('support', 'supports is { node: "pinned" or { x, y, z } }: at least one');
  for (const [id, s] of Object.entries(problem.supports)) {
    if (!(id in nodes)) refuse('support', `a support names node ${said(id)}, which is not a node`, { node: id });
    if (s !== 'pinned' && !(s && typeof s === 'object' && Object.keys(s).every((k) => DIMS.includes(k) && typeof s[k] === 'boolean'))) refuse('support', `the support at ${said(id)} is ${said(s)}: "pinned", or { x, y, z } each true (held) or false`, { node: id });
  }
  if (problem.loads && problem.cases) refuse('input', 'give loads (one case) or cases, not both');
  const cases = problem.cases ? problem.cases.map((c, i) => ({ label: c?.label ?? `case ${i + 1}`, loads: c?.loads })) : [{ label: 'load', loads: problem.loads }];
  if (!cases.length) refuse('load', 'cases is a list of { label, loads }: at least one');
  for (const c of cases) {
    if (!Array.isArray(c.loads) || !c.loads.length) refuse('load', `${c.label} has no loads: a list of { node, force }`);
    for (const l of c.loads) {
      if (!l || (typeof l.node !== 'string' && typeof l.node !== 'number') || !(String(l.node) in nodes)) refuse('load', `a load in ${c.label} names node ${said(l?.node)}, which is not a node`, { node: l?.node });
      if (!isPoint(l.force)) refuse('load', `the load at ${said(l.node)} in ${c.label} has force ${said(l.force)}: [x, y] or [x, y, z] in N`, { node: l.node });
    }
  }
  const flat = Object.values(nodes).every((p) => !p[2]) && cases.every((c) => c.loads.every((l) => !l.force[2]));
  if (problem.plane != null && typeof problem.plane !== 'boolean') refuse('input', `plane is true or false (got ${said(problem.plane)})`);
  const plane = problem.plane ?? flat;
  if (plane && !flat) refuse('input', 'plane is true, and a node or a load is off z = 0: a flat layout lies in x and y');
  const dim = plane ? 2 : 3;

  // the ground structure, and the free freedoms' rows
  const gs = groundStructure(nodes, { reach: problem.reach, avoid }), { ids, at } = gs, n = ids.length, index = new Map(ids.map((id, i) => [id, i]));
  const held = new Uint8Array(dim * n);
  for (const [id, s] of Object.entries(problem.supports)) for (let d = 0; d < dim; d++) held[dim * index.get(id) + d] = s === 'pinned' || s[DIMS[d]] ? 1 : 0;
  const row = new Int32Array(dim * n).fill(-1);
  let free = 0;
  for (let i = 0; i < dim * n; i++) if (!held[i]) row[i] = free++;
  const K = cases.length, forces = cases.map((c) => {
    const f = new Float64Array(free);
    for (const l of c.loads) for (let d = 0; d < dim; d++) { const i = dim * index.get(String(l.node)) + d; if (row[i] >= 0) f[row[i]] += l.force[d] ?? 0; }
    return f;
  });
  const F0 = Math.max(...forces.map((f) => Math.max(0, ...Array.from(f, Math.abs))));
  if (!(F0 > 0)) refuse('load', 'every load falls on a support: there is nothing for a frame to carry');
  const cand = gs.members, m = cand.length;
  if (!m) refuse('unstable', 'there are no candidate members: two nodes or more, out of each other\'s way and within reach');
  const L0 = Math.max(...cand.map((c) => c.length)), rho = strength.tension / strength.compression, joint = problem.joint ?? 0;
  // each candidate's unit direction a → b, and its cost (length plus a joint's) over L0
  const dir = new Float64Array(3 * m), cost = new Float64Array(m);
  cand.forEach((c, i) => { for (let d = 0; d < 3; d++) dir[3 * i + d] = (at[3 * c.b + d] - at[3 * c.a + d]) / c.length; cost[i] = (c.length + joint) / L0; });
  // a member's virtual strain over its limit: Σ_k max(0, b·u_k, −b·u_k / ρ) over its cost (b·u in F0 L0 / σt units)
  const strainOf = (i, u) => {
    const c = cand[i];
    let s = 0;
    for (let k = 0; k < K; k++) {
      let e = 0;
      for (let d = 0; d < dim; d++) { const ra = row[dim * c.a + d], rb = row[dim * c.b + d]; e += dir[3 * i + d] * ((rb >= 0 ? u[k][rb] : 0) - (ra >= 0 ? u[k][ra] : 0)); }
      s += Math.max(0, e, -e / rho);
    }
    return s / cost[i];
  };

  // one programme over the members in `act`
  const solveOver = (act) => {
    const M = act.length, G = K * free, N = M * (1 + 3 * K), start = new Int32Array(N + 1), rowsL = [], valsL = [], c = new Float64Array(N);
    const blockOf = new Int32Array(M * K), blocks = [];
    let j = 0;
    const col = (entries, cj) => { for (const [r, v] of entries) { rowsL.push(r); valsL.push(v); } c[j] = cj; start[++j] = rowsL.length; };
    act.forEach((i, s) => {
      const mrow = (k) => G + s * K + k, bcol = (k, sign) => {
        const e = [];
        for (const [node, side] of [[cand[i].a, -1], [cand[i].b, 1]]) for (let d = 0; d < dim; d++) { const r = row[dim * node + d]; if (r >= 0 && dir[3 * i + d]) e.push([k * free + r, sign * side * dir[3 * i + d]]); }
        return e;
      };
      blocks.push(Array.from({ length: K }, (_, k) => { blockOf[s * K + k] = s; return mrow(k); }));
      col(Array.from({ length: K }, (_, k) => [mrow(k), 1]), cost[i]); // a
      for (let k = 0; k < K; k++) { col([...bcol(k, 1), [mrow(k), -1]], 0); col([...bcol(k, -1), [mrow(k), -rho]], 0); col([[mrow(k), -1]], 0); } // p, n, slack
    });
    const b = new Float64Array(G + M * K);
    forces.forEach((f, k) => { for (let r = 0; r < free; r++) b[k * free + r] = f[r] / F0; });
    const r = interior({ cost: c, start, rows: Int32Array.from(rowsL), vals: Float64Array.from(valsL), G, blockOf, blocks, b });
    const u = Array.from({ length: K }, (_, k) => r.y.subarray(k * free, (k + 1) * free));
    return { ...r, u, M };
  };
  // the first programme: each node's nearest candidates; then members added where they would help
  const byNode = Array.from({ length: n }, () => []);
  cand.forEach((c, i) => { byNode[c.a].push(i); byNode[c.b].push(i); });
  for (const list of byNode) list.sort((p, q) => cand[p].length - cand[q].length);
  const loaded = new Set(cases.flatMap((cs) => cs.loads.map((l) => index.get(String(l.node)))));
  let first = o.start ?? (plane ? 8 : 18), act, r, rounds = 0;
  const adding = o.adding !== false;
  for (;;) {
    act = adding ? [...new Set(byNode.flatMap((list) => list.slice(0, first)))].sort((p, q) => p - q) : cand.map((_, i) => i);
    // a loaded freedom no member reaches cannot be carried
    const reached = new Uint8Array(free);
    for (const i of act) for (const node of [cand[i].a, cand[i].b]) for (let d = 0; d < dim; d++) if (dir[3 * i + d] && row[dim * node + d] >= 0) reached[row[dim * node + d]] = 1;
    const unreached = [...loaded].some((p) => { for (let d = 0; d < dim; d++) { const q = row[dim * p + d]; if (q >= 0 && !reached[q] && forces.some((f) => f[q])) return true; } return false; });
    if (!unreached) { r = solveOver(act); rounds++; if (r.ok) break; }
    if (!adding || first >= n) refuse('unstable', 'no frame of the candidate members carries the loads to the supports: hold more freedoms, or add nodes and members (a larger reach, a finer grid, or less avoided)', { rounds });
    first = Math.min(2 * first, n);
  }
  for (const most = o.add ?? 0; adding;) {
    const inside = new Uint8Array(m);
    for (const i of act) inside[i] = 1;
    const over = [];
    for (let i = 0; i < m; i++) if (!inside[i]) { const s = strainOf(i, r.u); if (s > 1 + tolerance) over.push([i, s]); }
    if (!over.length) break;
    over.sort((p, q) => q[1] - p[1]);
    const take = most || Math.max(100, Math.ceil(act.length / 10));
    act = [...act, ...over.slice(0, take).map(([i]) => i)].sort((p, q) => p - q);
    r = solveOver(act); rounds++;
    if (!r.ok) refuse('unstable', 'the programme did not settle after adding members: the problem may be badly scaled (forces or lengths over many orders)', { rounds });
  }

  // the proof: no candidate's virtual strain is past its limit (1 at the limit)
  let strain = 0;
  for (let i = 0; i < m; i++) strain = Math.max(strain, strainOf(i, r.u));
  // the answer, back in mm², N and mm³
  const scaleA = F0 / strength.tension;
  let volume = 0, amax = 0;
  const all = act.map((i, s) => {
    const base = s * (1 + 3 * K), area = r.x[base] * scaleA, f = Array.from({ length: K }, (_, k) => (r.x[base + 1 + 3 * k] - r.x[base + 2 + 3 * k]) * F0);
    volume += area * cand[i].length; amax = Math.max(amax, area);
    return { i, area, f };
  });
  let thin = 0;
  const members = all.filter((e) => { const k = e.area > keep * amax; if (!k) thin += e.area * cand[e.i].length; return k; }).sort((p, q) => q.area - p.area).map(({ i, area, f }) => {
    const c = cand[i], big = Math.max(...f.map(Math.abs)), t = f.some((v) => v > 1e-9 * big), cmp = f.some((v) => v < -1e-9 * big);
    return { id: `${ids[c.a]}-${ids[c.b]}`, a: ids[c.a], b: ids[c.b], length: round(c.length, 9), area: round(area, 9), forces: f.map((v) => round(v, 9)), kind: /** @type {LayoutMember['kind']} */ (t && cmp ? 'both' : cmp ? 'compression' : 'tension') };
  });
  const used = new Set([...members.flatMap((e) => [e.a, e.b]), ...Object.keys(problem.supports), ...cases.flatMap((c) => c.loads.map((l) => String(l.node)))]);
  const pos = (id) => /** @type {Vec3} */ (Array.from(at.subarray(3 * index.get(id), 3 * index.get(id) + 3)));
  // the virtual displacements, mm, scaled so a member at its tension limit stretches by its own length (a strain of
  // 1), one at its compression limit shortens by σc / σt of it
  const virtual = r.u.map((u) => Object.fromEntries([...used].map((id) => [id, Array.from({ length: dim }, (_, d) => { const q = row[dim * index.get(id) + d]; return q >= 0 ? round(u[q] * L0, 9) : 0; })])));
  return { volume, mass: problem.density != null ? (volume * problem.density) / 1e6 : null, members, nodes: Object.fromEntries([...used].map((id) => [id, pos(id)])), cases: cases.map((c) => c.label), plane, candidates: m, programme: act.length, rounds, strain: round(strain, 9), left: volume ? thin / volume : 0,
    virtual, strength: { ...strength }, joint, supports: Object.fromEntries(Object.entries(problem.supports).map(([id, s]) => [id, s === 'pinned' ? 'pinned' : DIMS.filter((d) => s[d]).join('')])), loads: cases.map((c) => ({ label: c.label, loads: c.loads })) };
}

// ---- handing the layout on: a frame to size, and joints to optimise ----

const isLayout = (r, what) => { if (!r || !Array.isArray(r.members) || !r.nodes || !r.loads) refuse('input', `${what} takes a layout's result (what layout() returns)`); return r; };
const vec3 = (f) => /** @type {Vec3} */ ([f[0] ?? 0, f[1] ?? 0, f[2] ?? 0]);

/**
 * A layout as a frame of beams (@rulecad/fea/frame's model), with its load cases, ready for `sizing` to pick a tube
 * for each member that can be bought (stress and buckling checked, with bending at stiff joints). Each member is a
 * solid round bar of its layout area until sized (or the `section` given). A flat layout is held out of its plane at
 * its supports (z and the two rotations out of plane) and any other way nothing resists is held while its loads do
 * not push it (`loose: 'hold'`).
 * @param {ReturnType<typeof layout>} result
 * @param {{ material: { E: number, nu?: number, G?: number, density?: number, strength?: number }, section?: object, ends?: 'rigid' | 'pinned' }} o
 *   material: the members' (E in MPa); section: one section for every member in place of the round bars; ends:
 *   'rigid' (welded, brazed or bonded: the default) or 'pinned' (each member's ends free to turn: one 'ball', one 'pinned')
 * @returns {{ model: object, cases: { label: string, loads: { node: string, force: Vec3 }[] }[], members: string[] }}
 *   model: nodes, elements (ids as the layout's members), supports, the first case's loads and loose: 'hold';
 *   cases: every case as sizing takes it; members: the element ids
 */
export function layoutFrame(result, o = {}) {
  const r = isLayout(result, 'layoutFrame');
  if (!o.material || !(o.material.E > 0)) refuse('input', `layoutFrame needs the members' material: { E, nu, density, strength } with E in MPa above 0 (got ${said(o.material)})`);
  if (o.ends != null && !['rigid', 'pinned'].includes(o.ends)) refuse('input', `ends is 'rigid' or 'pinned' (got ${said(o.ends)})`);
  const bar = (A) => { const d = Math.sqrt((4 * A) / Math.PI), I = (Math.PI * d ** 4) / 64; return { A, Iy: I, Iz: I, J: 2 * I, cy: d / 2, cz: d / 2 }; };
  const ends = o.ends === 'pinned' ? { a: 'ball', b: 'pinned' } : undefined;
  const elements = r.members.map((m) => ({ id: m.id, a: m.a, b: m.b, section: o.section ?? bar(m.area), material: { ...o.material }, ...(ends ? { ends } : {}) }));
  const supports = Object.fromEntries(Object.entries(r.supports).map(([id, s]) => {
    const held = s === 'pinned' ? 'xyz' : s, out = { x: held.includes('x'), y: held.includes('y'), z: held.includes('z') || r.plane };
    if (r.plane) Object.assign(out, { rx: true, ry: true });
    return [id, out];
  }));
  const cases = r.loads.map((c) => ({ label: c.label, loads: c.loads.map((l) => ({ node: String(l.node), force: vec3(l.force) })) }));
  return { model: { nodes: { ...r.nodes }, elements, supports, loads: cases[0].loads, loose: 'hold' }, cases, members: elements.map((e) => e.id) };
}

/**
 * Each joint of a layout as a problem of its own for the voxel optimiser (cad optimise, @rulecad/topopt), in the
 * problem file's form: the members meeting there as stubs, each member's force in every case as a load on its stub's
 * end, the outside load at the node, and the stub carrying the most held (the frame beyond it). A lug, a dropout or
 * a bracket is then shaped for the forces the layout found. Flat layouts give flat problems, `thickness` the widest
 * member's diameter; the rest give 3D ones. Each problem is centred on its node; `at` says where that is.
 * @param {ReturnType<typeof layout>} result
 * @param {{ material: string, diameters?: Record<string, number>, forces?: Record<string, number[]>, stub?: number, cell?: number, volume?: number, nodes?: string[] }} o
 *   material: the rule set the joint is made of (pla, al6061, ...); diameters: each member's outside diameter by id
 *   (a solid bar of its area if left out: give the sized tubes'); forces: each member's force in each case, N,
 *   tension positive (the layout's own if left out: one set the strengths allow, where a frame with several cases may
 *   have many; give the sized frame's, solved, for the forces it will carry); stub: how far each stub reaches from the node, mm
 *   (twice the widest diameter); cell: the grid's cell (a quarter of the narrowest diameter); volume: share of the
 *   space to fill (0.3); nodes: which joints (every node where two members or more meet)
 * @returns {{ node: string, at: Vec3, members: { id: string, to: string, direction: number[], forces: number[], diameter: number }[], problem: object }[]}
 */
export function layoutJoints(result, o = {}) {
  const r = isLayout(result, 'layoutJoints');
  if (typeof o.material !== 'string' || !o.material) refuse('input', `layoutJoints needs the joints' material, a rule set's name such as "pla" or "al6061" (got ${said(o.material)})`);
  for (const k of ['stub', 'cell', 'volume']) if (o[k] != null && !(o[k] > 0 && Number.isFinite(o[k]) && (k !== 'volume' || o[k] < 1))) refuse('input', `${k} is ${k === 'volume' ? 'a share above 0 and under 1' : 'mm above 0'} (got ${said(o[k])})`);
  const dia = (m) => { const d = o.diameters?.[m.id]; if (d != null && !(d > 0)) refuse('input', `diameters.${m.id} is mm above 0 (got ${said(d)})`); return d ?? Math.sqrt((4 * m.area) / Math.PI); };
  // each member's force in each case: the layout's (one set the strengths allow), or the frame's own, solved
  const K = r.loads.length, forcesOf = (m) => {
    const f = o.forces?.[m.id];
    if (f == null) return m.forces;
    if (!Array.isArray(f) || f.length !== K || !f.every(Number.isFinite)) refuse('input', `forces.${m.id} is its force in each of the ${K} cases, N, tension positive (got ${said(f)})`);
    return f.map((v) => round(v, 9));
  };
  for (const id of Object.keys(o.forces ?? {})) if (!r.members.some((m) => m.id === id)) refuse('input', `forces names member ${said(id)}, which is not in the layout`);
  const meets = new Map();
  for (const m of r.members) for (const [here, there] of [[m.a, m.b], [m.b, m.a]]) { if (!meets.has(here)) meets.set(here, []); meets.get(here).push({ m, there }); }
  const which = o.nodes ?? [...meets.keys()].filter((id) => meets.get(id).length >= 2);
  for (const id of which) if (!meets.has(id)) refuse('node', `layoutJoints names node ${said(id)}, where no member meets`, { node: id });
  const dim = r.plane ? 2 : 3, fig = (v) => round(v, 6);
  return which.map((id) => {
    const p = r.nodes[id], list = meets.get(id);
    const members = list.map(({ m, there }) => {
      const q = r.nodes[there], L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      return { id: m.id, to: there, direction: [0, 1, 2].slice(0, dim).map((d) => fig((q[d] - p[d]) / L)), forces: forcesOf(m), diameter: fig(dia(m)) };
    });
    const widest = Math.max(...members.map((e) => e.diameter)), narrowest = Math.min(...members.map((e) => e.diameter));
    const stub = o.stub ?? 2 * widest, cell = o.cell ?? fig(narrowest / 4), end = (e) => e.direction.map((v) => fig(v * stub));
    // the stub that carries the most, in its worst case, is held; the others' forces load the joint
    const held = members.reduce((b, e) => (Math.max(...e.forces.map(Math.abs)) > Math.max(...b.forces.map(Math.abs)) ? e : b), members[0]);
    const loads = [];
    r.loads.forEach((c, k) => {
      for (const e of members) if (e !== held && e.forces[k]) loads.push({ at: end(e), r: fig(e.diameter / 2), force: e.direction.map((v) => fig(v * e.forces[k])), case: c.label, label: `${e.id}: ${fig(e.forces[k])} N ${e.forces[k] > 0 ? 'tension' : 'compression'}` });
      for (const l of c.loads) if (String(l.node) === id) loads.push({ at: Array(dim).fill(0), r: fig(widest / 2), force: [0, 1, 2].slice(0, dim).map((d) => l.force[d] ?? 0), case: c.label, label: 'the outside load at the joint' });
    });
    const problem = {
      title: `Joint ${id} of a frame layout`,
      description: `The joint where ${members.map((e) => e.id).join(', ')} meet, centred on the node (at ${p.map(fig).join(', ')} mm in the layout). Each member is a stub ${fig(stub)} mm long; ${held.id} is held, and the others carry their forces from the layout in each case.`,
      material: o.material, cell, volume: o.volume ?? 0.3,
      ...(dim === 2 ? { thickness: fig(widest) } : {}),
      space: { at: Array(dim).fill(0), size: Array(dim).fill(fig(2 * (stub + widest))) },
      keep: members.map((e) => ({ at: end(e), r: fig(e.diameter / 2), label: `${e.id}'s end` })),
      supports: [{ at: end(held), r: fig(held.diameter / 2), label: `${held.id}: the frame beyond it` }],
      loads: loads.length ? loads : [{ at: end(members[0]), r: fig(members[0].diameter / 2), force: Array(dim).fill(0), label: 'nothing: no member carries a force here' }],
    };
    return { node: id, at: vec3(p), members, problem };
  });
}

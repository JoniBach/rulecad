// Out of the plane: how a lamina's moving parts lift and tip when pushed across the print (a finger pulling a ring a
// little off the plane), which the in-plane solver can't see. Each flexure element is a grillage beam: bending out of
// the plane about its own breadth, stiff, since it's as tall as the print (E t h³ / 12); twisting about its length,
// soft, since a thin strip twists easily (G h t³ / 3 (1 - 0.63 t / h)). The bodies are rigid, each with a lift and two
// tips; the frame holds still, and anything trapping a body across the plane (a guide, a bridge) is a stiff spring.
// Linear, at rest: a measure of how laminar a mechanism stays, not a large-deflection solve.

const luDense = (A, b, n) => { // Gaussian elimination with partial pivoting (small systems)
  const x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    let m = k; for (let i = k + 1; i < n; i++) if (Math.abs(A[i * n + k]) > Math.abs(A[m * n + k])) m = i;
    if (Math.abs(A[m * n + k]) < 1e-300) return null;
    if (m !== k) { for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[m * n + j]; A[m * n + j] = t; } const t = x[k]; x[k] = x[m]; x[m] = t; }
    for (let i = k + 1; i < n; i++) { const f = A[i * n + k] / A[k * n + k]; if (!f) continue; for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j]; x[i] -= f * x[k]; }
  }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j]; x[i] = s / A[i * n + i]; }
  return x;
};

/**
 * How a beam system's bodies move out of the plane under loads across it.
 * @param {ReturnType<import('./beams.mjs').beamSystem>} sys at rest
 * @param {{ nu?: number, loads: { body: string, at: number[], force: number }[], springs?: { body: string, at: number[], k: number }[] }} o
 *   loads: a force across the plane (N, +z) at a point of a body; springs: a body held across the plane at a point
 *   (N/mm), a guide or a bridge
 * @returns {{ lift: (body: string, p: number[]) => number, bodies: Record<string, number[]> }} lift: how far a point of
 *   a body moves across the plane (mm); bodies: each body's [lift, tip about x, tip about y] at its reference point
 */
export function outOfPlane(sys, { nu = 0.38, loads = [], springs = [] }) {
  // The unknowns: [w, rx, ry] for each moving body, then each node inside a flexure
  const index = new Map(); let n = 0;
  for (const b of Object.values(sys.body)) if (!b.fixed) { index.set(b, n); n += 3; }
  for (const nd of sys.nodes) { index.set(nd, n); n += 3; }
  const K = new Float64Array(n * n), f = new Float64Array(n);
  // An end's rows: its [w, θ along the element, θ across it] in terms of the unknowns, as [dof, coefficient] lists
  const rowsOf = (end, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    if (end.dof != null) { const i = index.get(end); return [[[i, 1]], [[i + 1, c], [i + 2, s]], [[i + 1, s], [i + 2, -c]]]; }
    if (end.body.fixed) return [[], [], []];
    const i = index.get(end.body), [ox, oy] = end.o; // a point on a body: w = w_B + rx oy - ry ox; it tips with the body
    return [[[i, 1], [i + 1, oy], [i + 2, -ox]], [[i + 1, c], [i + 2, s]], [[i + 1, s], [i + 2, -c]]];
  };
  for (const e of sys.elements) {
    const E = e.EI / ((e.w * e.t ** 3) / 12), G = E / (2 * (1 + nu)), h = e.w, t = e.t, L = e.L0;
    const EI = (E * t * h ** 3) / 12, GJ = (G * h * t ** 3) / 3 * Math.max(0.1, 1 - (0.63 * t) / h);
    const kb = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]].map((r) => r.map((x) => (x * EI) / L ** 3));
    const A = rowsOf(e.a, e.a0), B = rowsOf(e.b, e.a0);
    const bend = [A[0], A[2], B[0], B[2]], twist = [A[1], B[1]], kt = [[GJ / L, -GJ / L], [-GJ / L, GJ / L]];
    const add = (rows, k) => rows.forEach((ri, p) => rows.forEach((rj, q) => { for (const [i, ci] of ri) for (const [j, cj] of rj) K[i * n + j] += ci * k[p][q] * cj; }));
    add(bend, kb); add(twist, kt);
  }
  const bodyRows = (name, [x, y]) => { const b = sys.body[name]; if (!b || b.fixed) return null; const i = index.get(b), ox = x - b.at[0], oy = y - b.at[1]; return [[i, 1], [i + 1, oy], [i + 2, -ox]]; };
  for (const s of springs) { const r = bodyRows(s.body, s.at); if (r) for (const [i, ci] of r) for (const [j, cj] of r) K[i * n + j] += s.k * ci * cj; }
  for (const L of loads) { const r = bodyRows(L.body, L.at); if (r) for (const [i, c] of r) f[i] += L.force * c; }
  // A body joined to nothing that holds it across the plane would float: a whisper of stiffness keeps the solve well posed
  const diag = Math.max(1e-12, ...Array.from({ length: n }, (_, i) => Math.abs(K[i * n + i])));
  for (let i = 0; i < n; i++) K[i * n + i] += diag * 1e-12;
  const x = luDense(K, f, n) || new Float64Array(n);
  const bodies = Object.fromEntries(Object.values(sys.body).filter((b) => !b.fixed).map((b) => { const i = index.get(b); return [b.name, [x[i], x[i + 1], x[i + 2]]]; }));
  return { bodies, lift: (name, p) => { const r = bodyRows(name, p); return r ? r.reduce((a, [i, c]) => a + c * x[i], 0) : 0; } };
}

// The checks every solver backend must pass, against plain JavaScript in 64-bit floats (the reference). A new backend
// (WebGPU, TensorFlow.js) runs these in its own tests: checkBackend(backend, { tol }) returns a list of problems, empty
// when it passes. Not published with the package: it's for the repository's tests.
import { grid, cellStiffness, jsBackend, solve } from './fea.mjs';

export function checkBackend(backend, { tol = 1e-9 } = {}) {
  const problems = [], g = grid({ nx: 12, ny: 5, h: 1 }), ke = cellStiffness(0.3), n = g.dofs;
  const scale = Float64Array.from({ length: g.nx * g.ny }, (_, e) => 1 + (e % 7) / 3); // uneven, so mistakes show
  const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i)), y = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 1.3));
  const ref = jsBackend.operator(g, ke), op = backend.operator(g, ke);
  const a = new Float64Array(n), b = new Float64Array(n);
  ref.multiply(scale, x, a); op.multiply(scale, x, b);
  const worst = Math.max(...a.map((v, i) => Math.abs(v - b[i]))) / Math.max(...a.map(Math.abs));
  if (worst > tol) problems.push(`multiply differs from the reference by ${worst.toExponential(2)} (relative)`);
  ref.diagonal(scale, a); op.diagonal(scale, b);
  const dworst = Math.max(...a.map((v, i) => Math.abs(v - b[i]))) / Math.max(...a.map(Math.abs));
  if (dworst > tol) problems.push(`diagonal differs from the reference by ${dworst.toExponential(2)} (relative)`);
  const d = backend.dot(x, y) - jsBackend.dot(x, y);
  if (Math.abs(d) > tol * n) problems.push(`dot differs by ${d}`);
  const z = Float64Array.from(y); backend.axpy(0.5, x, z);
  if (z.some((v, i) => Math.abs(v - (y[i] + 0.5 * x[i])) > tol)) problems.push('axpy is wrong');
  // And a whole solve with it, against the direct solver
  const fixed = new Uint8Array(n); for (let j = 0; j <= g.ny; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; }
  const f = new Float64Array(n); f[2 * g.node(g.nx, g.ny) + 1] = -1;
  const direct = solve(g, { scale, ke, fixed, loads: [f] }).u[0], cg = solve(g, { scale, ke, fixed, loads: [f], method: 'cg', backend, tol: 1e-10 }).u[0];
  const sworst = Math.max(...direct.map((v, i) => Math.abs(v - cg[i]))) / Math.max(...direct.map(Math.abs));
  if (sworst > Math.max(tol, 1e-7)) problems.push(`a solve differs from the direct solver's by ${sworst.toExponential(2)} (relative)`);
  return problems;
}

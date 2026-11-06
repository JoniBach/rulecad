import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grid, analyse, solve, cellStiffness, stress, jsBackend } from '@rulecad/fea';
import { checkBackend } from './backend-suite.mjs';

// A cantilever L long and H deep, held along its left edge, loaded F down along its right edge
function cantilever({ L = 100, H = 10, h = 1, F = 10, E = 2000, t = 5 } = {}) {
  const nx = L / h, ny = H / h, g = grid({ nx, ny, h }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  for (let j = 0; j <= ny; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; f[2 * g.node(nx, j) + 1] = -F / (ny + 1); }
  return { g, fixed, f, beam: (F * L ** 3) / (3 * E * ((t * H ** 3) / 12)), E, t };
}

test('a cantilever bends as beam theory says, within 1%', () => {
  for (const h of [1, 0.5]) {
    const { g, fixed, f, beam, E, t } = cantilever({ h });
    const r = analyse({ grid: g, density: new Float64Array(g.nx * g.ny).fill(1), material: { E, nu: 0.3 }, thickness: t, fixed, loads: [f] });
    const tip = -r.u[0][2 * g.node(g.nx, g.ny / 2) + 1];
    assert.ok(Math.abs(tip / beam - 1) < 0.01, `tip ${tip} against ${beam} at cells of ${h} mm`);
    assert.ok(Math.abs(r.compliance[0] / (10 * tip) - 1) < 0.01, 'compliance is the load times its movement');
  }
});

test('conjugate gradients agree with the direct solver', () => {
  const { g, fixed, f } = cantilever({ L: 40, H: 8 });
  const scale = new Float64Array(g.nx * g.ny).fill(1e4), ke = cellStiffness(0.3);
  const a = solve(g, { scale, ke, fixed, loads: [f] }).u[0], b = solve(g, { scale, ke, fixed, loads: [f], method: 'cg', tol: 1e-12 }).u[0];
  assert.ok(Math.max(...a.map((v, i) => Math.abs(v - b[i]))) < 1e-9 * Math.max(...a.map(Math.abs)));
});

test('the JavaScript backend passes the backend suite', () => {
  assert.deepEqual(checkBackend(jsBackend), []);
});

test('a bar pulled along its length has the same stress everywhere: the load over its section', () => {
  const nx = 20, ny = 4, g = grid({ nx, ny, h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  for (let j = 0; j <= ny; j++) { fixed[2 * g.node(0, j)] = 1; f[2 * g.node(nx, j)] = (j === 0 || j === ny ? 0.5 : 1) * 100 / ny; }
  fixed[2 * g.node(0, 0) + 1] = 1;
  const u = solve(g, { scale: new Float64Array(nx * ny).fill(3000 * 2), ke: cellStiffness(0.3), fixed, loads: [f] }).u[0];
  const s = stress(g, u, new Float64Array(nx * ny).fill(3000), 0.3);
  for (const v of s) assert.ok(Math.abs(v - 100 / (ny * 2)) < 0.01 * (100 / (ny * 2)), `stress ${v}`);
});

test('a part held by nothing says so', () => {
  const g = grid({ nx: 4, ny: 2 });
  assert.throws(() => solve(g, { scale: new Float64Array(8).fill(1), ke: cellStiffness(0.3), fixed: new Uint8Array(g.dofs), loads: [new Float64Array(g.dofs)] }), /nothing is held/);
});

// A 3D cantilever L long, H deep and W wide, held at x = 0, loaded F down (−z) at the far end
function cantilever3({ L = 40, H = 8, W = 4, F = 10, E = 2000 } = {}) {
  const g = grid({ nx: L, ny: W, nz: H, h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs), n = (W + 1) * (H + 1);
  for (let k = 0; k <= H; k++) for (let j = 0; j <= W; j++) { for (let d = 0; d < 3; d++) fixed[3 * g.node(0, j, k) + d] = 1; f[3 * g.node(L, j, k) + 2] = -F / n; }
  return { g, fixed, f, beam: (F * L ** 3) / (3 * E * ((W * H ** 3) / 12)), E };
}

test('3D: a cantilever of cubes bends as beam theory says, within 2%', () => {
  const { g, fixed, f, beam, E } = cantilever3();
  const r = analyse({ grid: g, density: new Float64Array(g.cells).fill(1), material: { E, nu: 0.3 }, fixed, loads: [f] });
  const tip = -r.u[0][3 * g.node(g.nx, g.ny / 2, g.nz / 2) + 2];
  assert.ok(Math.abs(tip / beam - 1) < 0.02, `tip ${tip} against ${beam}`);
});

// Densities like a topology optimisation's: mostly solid or nearly empty (a millionfold apart), in a pattern
const contrast = (cells, seed = 1) => Float64Array.from({ length: cells }, (_, e) => ((e * 7919 + seed * 104729) % 97 < 55 ? 1 : 1e-6));

test('multigrid agrees with the direct solver, in 2D and 3D, with stiffnesses a millionfold apart', () => {
  const g2 = grid({ nx: 64, ny: 32, h: 1 }), f2 = new Float64Array(g2.dofs), x2 = new Uint8Array(g2.dofs);
  for (let j = 0; j <= 32; j++) { x2[2 * g2.node(0, j)] = 1; x2[2 * g2.node(0, j) + 1] = 1; }
  f2[2 * g2.node(64, 16) + 1] = -1;
  const { g: g3, fixed: x3, f: f3 } = cantilever3({ L: 32, H: 8, W: 8 });
  for (const [g, fixed, f] of [[g2, x2, f2], [g3, x3, f3]]) {
    const ke = cellStiffness(0.3, g.dim), scale = contrast(g.cells).map((d) => d * 1000);
    for (let e = 0; e < g.cells; e += 5) scale[e] = 1000; // and a solid path, so the load is carried
    const a = solve(g, { scale, ke, fixed, loads: [f] }), b = solve(g, { scale, ke, fixed, loads: [f], method: 'mg', tol: 1e-10 });
    const ca = jsBackend.dot(f, a.u[0]), cb = jsBackend.dot(f, b.u[0]);
    assert.ok(Math.abs(cb / ca - 1) < 1e-6, `${g.dim}D: compliance ${cb} against ${ca}`);
    assert.ok(b.iterations < 200, `${g.dim}D: ${b.iterations} iterations`);
  }
});

test('the threads backend: the product shared over worker threads matches plain JavaScript, in 2D and 3D, with multigrid', async () => {
  const { threadsBackend } = await import('./threads.mjs');
  assert.deepEqual(checkBackend(threadsBackend), []);
  const g = grid({ nx: 10, ny: 8, nz: 12, h: 1 }), ke = cellStiffness(0.3, 3), n = g.dofs;
  const scale = Float64Array.from({ length: g.cells }, (_, e) => (e % 5 === 0 ? 1e-9 : 1 + (e % 3) / 2));
  const fixed = new Uint8Array(n); for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) for (let d = 0; d < 3; d++) fixed[3 * g.node(i, j, 0) + d] = 1;
  const f = new Float64Array(n); f[3 * g.node(5, 4, g.nz) + 2] = -1;
  const a = solve(g, { scale, ke, fixed, loads: [f], method: 'mg', tol: 1e-9 }).u[0], b = solve(g, { scale, ke, fixed, loads: [f], method: 'mg', backend: threadsBackend, tol: 1e-9 }).u[0];
  const worst = Math.max(...a.map((v, i) => Math.abs(v - b[i]))) / Math.max(...a.map(Math.abs));
  assert.ok(worst < 1e-7, `multigrid solves differ by ${worst.toExponential(2)}`);
});

test('what is wrong with the input is said by name; a part that can still turn is not held still, whichever solver', () => {
  const g = grid({ nx: 20, ny: 4, h: 1 }), material = { E: 2680, nu: 0.35 };
  const problem = () => {
    const fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
    for (let j = 0; j <= 4; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; }
    f[2 * g.node(20, 2) + 1] = -1;
    return { grid: g, density: new Float64Array(g.cells).fill(1), material, thickness: 2, fixed, loads: [f] };
  };
  assert.ok(analyse(problem()).deflection[0].most > 0);
  for (const method of ['direct', 'cg', 'mg']) { // one corner pinned: it can spin about it
    const p = problem(); p.fixed.fill(0); p.fixed[2 * g.node(0, 0)] = 1; p.fixed[2 * g.node(0, 0) + 1] = 1;
    assert.throws(() => analyse({ ...p, method }), /not held still/, method);
  }
  const bad = (change, said) => { const p = problem(); change(p); assert.throws(() => analyse(p), said); };
  bad((p) => { p.density[3] = NaN; p.method = 'cg'; }, /cell 3's density is NaN/); // (conjugate gradients took NaN for settled, and returned zeros)
  bad((p) => { p.loads = [new Float64Array(10)]; }, /load 1 has 10 values for 210 unknowns/);
  bad((p) => { p.method = 'cholesky'; }, /no solver "cholesky"/);
  bad((p) => { p.material = { E: 2680 }; }, /Poisson's ratio/);
  bad((p) => { p.material = { E: 0, nu: 0.35 }; }, /modulus E above 0/);
  bad((p) => { p.thickness = 0; }, /thickness above 0/);
});

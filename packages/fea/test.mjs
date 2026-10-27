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

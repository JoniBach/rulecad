// The stress at a part's surface (analyse().surface, surfaceStress), held to beam theory. In bending the peak is at
// the surface; each cell's centre stress (analyse().stress) is half a cell inside, so it reads low by about one cell's
// share of the depth. These cantilevers are the review's (finding fea-1): 100 mm long, 10 mm deep, 10 N at the tip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grid, analyse, surfaceStress } from '@rulecad/fea';

const E = 2000, nu = 0.3, P = 10, L = 100, H = 10, WIDTH = 5;

// A cantilever n cells deep, held all over its left end, P down spread over its right end: 2D (a plate WIDTH thick) or
// 3D (WIDTH wide). Its section's second moment I, for M c / I.
function cantilever(dim, n, { load = 'tip' } = {}) {
  const h = H / n, nx = L / h, ny = dim === 2 ? n : WIDTH / h, I = (WIDTH * H ** 3) / 12;
  const g = dim === 2 ? grid({ nx, ny, h }) : grid({ nx, ny, nz: n, h }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  const end = (i) => (dim === 2 ? [...Array(ny + 1)].map((_, j) => [g.node(i, j), j]) : [...Array((ny + 1) * (n + 1))].map((_, q) => [g.node(i, q % (ny + 1), Math.floor(q / (ny + 1))), Math.floor(q / (ny + 1))]));
  const up = dim - 1; // the axis through the depth: y in 2D, z in 3D
  if (load === 'tip') {
    for (const [node] of end(0)) for (let d = 0; d < dim; d++) fixed[dim * node + d] = 1;
    // the load spread as a uniform shear over the end: half shares on the top and bottom rows (and the sides, in 3D)
    const ends = end(nx), weight = (node, k) => (k === 0 || k === n ? 0.5 : 1) * (dim === 3 ? (() => { const j = ends.findIndex(([m]) => m === node) % (ny + 1); return j === 0 || j === ny ? 0.5 : 1; })() : 1);
    const total = ends.reduce((s, [node, k]) => s + weight(node, k), 0);
    for (const [node, k] of ends) f[dim * node + up] = -P * weight(node, k) / total;
  } else { // a pure moment M = 1000 N mm: σ = M y / I along the far end, as consistent nodal forces; the near end on rollers
    for (const [node, k] of end(0)) { fixed[dim * node] = 1; if (k === n / 2) for (let d = 1; d < dim; d++) fixed[dim * node + d] = 1; }
    const across = dim === 2 ? WIDTH : 1; // 2D: the plate's thickness; 3D: each node's share of the width is in the loop
    for (const [node, k] of end(nx)) {
      const j = dim === 3 ? end(nx).findIndex(([m]) => m === node) % (ny + 1) : 0, side = dim === 3 ? (j === 0 || j === ny ? h / 2 : h) : across;
      for (const kk of [k - 1, k]) { // the two cells either side along the depth
        if (kk < 0 || kk >= n) continue;
        const y0 = kk * h - H / 2, s0 = (1000 * y0) / I, s1 = (1000 * (y0 + h)) / I;
        f[dim * node] += side * h * (kk === k ? 2 * s0 + s1 : s0 + 2 * s1) / 6;
      }
    }
  }
  const r = analyse({ grid: g, density: new Float64Array(g.cells).fill(1), material: { E, nu }, thickness: WIDTH, fixed, loads: [f] });
  // The largest surface (and centre) stress in the cells whose near face is at x, over M c / I there
  const at = (x) => {
    const i = Math.round(x / h), M = load === 'tip' ? P * (L - i * h) : 1000, hand = (M * (H / 2)) / I;
    let surface = 0, centre = 0;
    for (let e = i; e < g.cells; e += nx) { surface = Math.max(surface, r.surface[0][e]); centre = Math.max(centre, r.stress[0][e]); }
    return { surface: surface / hand, centre: centre / hand };
  };
  return { g, r, at, h };
}

for (const dim of [2, 3]) {
  test(`${dim}D: a cantilever's surface stress is within 5% of M c / I at 4, 8 and 10 cells through, at mid-span and a depth from the support`, () => {
    for (const n of [4, 8, 10]) {
      const { at } = cantilever(dim, n);
      // "The root" is read a beam's depth from the clamp: right at a clamped edge the stress is concentrated (the end
      // can't narrow as the surface stretches), beam theory doesn't hold there, and the grid's reading rises as cells shrink
      for (const [where, x] of [['a depth from the support', H], ['mid-span', L / 2]]) {
        const { surface, centre } = at(x);
        assert.ok(Math.abs(surface - 1) < 0.05, `${n} cells through, ${where}: surface stress ${surface.toFixed(3)} of M c / I`);
        assert.ok(surface > centre, `${n} cells through, ${where}: the surface reads above the centre`);
      }
    }
  });
}

test('at 4 cells through the centre stress reads about 30% low, as the README says, and the surface stress about 0%', () => {
  for (const dim of [2, 3]) {
    const { surface, centre } = cantilever(dim, 4).at(L / 2);
    assert.ok(centre > 0.65 && centre < 0.78, `${dim}D centre ${centre.toFixed(3)}`);
    assert.ok(Math.abs(surface - 1) < 0.02, `${dim}D surface ${surface.toFixed(3)}`);
  }
});

test('under a pure moment (no shear) the surface stress at 4 cells through is within 2% of M c / I, in 2D and 3D', () => {
  for (const dim of [2, 3]) {
    const { surface } = cantilever(dim, 4, { load: 'moment' }).at(L / 2);
    assert.ok(Math.abs(surface - 1) < 0.02, `${dim}D: ${surface.toFixed(3)}`);
  }
});

test('a bar pulled along its length: the surface stress is the load over the section everywhere, as the centre stress is', () => {
  for (const dim of [2, 3]) {
    const nx = 20, ny = 4, nz = dim === 3 ? 4 : undefined, g = grid({ nx, ny, ...(nz ? { nz } : {}), h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
    const face = (i) => (dim === 2 ? [...Array(ny + 1)].map((_, j) => [g.node(i, j), j === 0 || j === ny ? 0.5 : 1]) : [...Array((ny + 1) * (nz + 1))].map((_, q) => { const j = q % (ny + 1), k = Math.floor(q / (ny + 1)); return [g.node(i, j, k), (j === 0 || j === ny ? 0.5 : 1) * (k === 0 || k === nz ? 0.5 : 1)]; }));
    for (const [node] of face(0)) fixed[dim * node] = 1;
    fixed[dim * g.node(0, 0, 0) + 1] = 1; fixed[dim * g.node(0, ny, 0)] = 1;
    if (dim === 3) { fixed[3 * g.node(0, 0, 0) + 2] = 1; fixed[3 * g.node(0, ny, 0) + 2] = 1; fixed[3 * g.node(0, 0, nz) + 1] = 1; }
    const area = dim === 2 ? ny * 2 : ny * nz, total = face(nx).reduce((s, [, w]) => s + w, 0);
    for (const [node, w] of face(nx)) f[dim * node] = (100 * w) / total;
    const r = analyse({ grid: g, density: new Float64Array(g.cells).fill(1), material: { E: 3000, nu: 0.3 }, thickness: 2, fixed, loads: [f] });
    for (const v of r.surface[0]) assert.ok(Math.abs(v / (100 / area) - 1) < 0.01, `${dim}D: surface ${v} against ${100 / area}`);
  }
});

test('surfaceStress: each node\'s stress, averaged over the solid cells round it; an empty cell keeps its centre stress', () => {
  // A 2D cantilever 4 cells deep whose top row past mid-span is empty: the empty cells read at their centres
  const { g, r } = cantilever(2, 4), modulus = new Float64Array(g.cells).fill(E), density = new Float64Array(g.cells).fill(1);
  const all = surfaceStress(g, r.u[0], modulus, nu);
  assert.equal(all.nodes.length, g.nodes);
  assert.equal(all.cells.length, g.cells);
  for (let e = 0; e < g.cells; e++) { const i = e % g.nx, j = Math.floor(e / g.nx); if (j === 3 && i >= g.nx / 2) density[e] = 0; }
  const some = surfaceStress(g, r.u[0], modulus, nu, density);
  const e = 3 * g.nx + g.nx - 2;
  assert.equal(some.cells[e], r.stress[0][e], 'an empty cell: its centre stress');
  assert.equal(some.cells[0], all.cells[0], 'far from the empty cells nothing changes');
});

test('a peak in a member under 8 cells through comes with a warning, in the kit\'s one shape; at 10 cells, none', () => {
  for (const dim of [2, 3]) {
    const { r } = cantilever(dim, 4);
    assert.equal(r.findings.length, 1, `${dim}D: one finding`);
    const [w] = r.findings;
    assert.deepEqual(Object.keys(w).sort(), ['at', 'box', 'code', 'level', 'text', 'values']);
    assert.equal(w.level, 'warn');
    assert.equal(w.code, 'fea.coarse-stress');
    assert.equal(w.values.cells, 4, `${dim}D: the member is 4 cells through (the depth, not the width)`);
    assert.equal(w.values.need, 8);
    assert.ok(w.values.surface > w.values.centre);
    assert.equal(w.at.length, dim);
    assert.ok(w.box.lo.every((x, a) => x <= w.at[a] && w.at[a] <= w.box.hi[a]));
    assert.match(w.text, /only 4 cells through, under the 8 it takes/);
    assert.equal(cantilever(dim, 10).r.findings.length, 0, `${dim}D: 10 cells through, nothing to say`);
  }
});

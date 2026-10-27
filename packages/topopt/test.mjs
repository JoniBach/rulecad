import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimise, model, discretise, outlines, area, densityFilter } from '@rulecad/topopt';
import { grid } from '@rulecad/fea';

// The reference values come from reference/top88.py, a line-by-line port of Andreassen et al. (2011)'s top88.m (the
// density filter, ft = 2): python3 reference/top88.py 60 20 0.5 1.5 mbb, and 48 24 0.4 2 cantilever.
const near = (a, b, rel = 1e-5) => Math.abs(a - b) <= rel * Math.abs(b);
const spec = (nx, ny, volume, filter, hold, load) => {
  const g = grid({ nx, ny, h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  hold(g, fixed); load(g, f);
  return { grid: { nx, ny, h: 1 }, passive: new Int8Array(nx * ny), fixed, loads: [{ name: 'load', force: f, weight: 1, size: 1 }], material: { E: 1, nu: 0.3 }, thickness: 1, volume, filter, penal: 3, projection: false, steps: 1000 };
};

test('the MBB beam matches the 88-line code step for step', () => {
  const r = optimise(spec(60, 20, 0.5, 1.5,
    (g, fixed) => { for (let j = 0; j <= 20; j++) fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(60, 0) + 1] = 1; },
    (g, f) => { f[2 * g.node(0, 20) + 1] = -1; }));
  assert.equal(r.steps, 127);
  assert.ok(near(r.history[0], 1007.0221), `first ${r.history[0]}`);
  assert.ok(near(r.history.at(-1), 218.8032), `last ${r.history.at(-1)}`);
  assert.ok(Math.abs(r.volume - 0.5) < 1e-3);
});

test('the short cantilever matches the 88-line code step for step', () => {
  const r = optimise(spec(48, 24, 0.4, 2,
    (g, fixed) => { for (let j = 0; j <= 24; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; } },
    (g, f) => { f[2 * g.node(48, 12) + 1] = -1; }));
  assert.equal(r.steps, 100);
  assert.ok(near(r.history[0], 615.3317), `first ${r.history[0]}`);
  assert.ok(near(r.history.at(-1), 99.4937), `last ${r.history.at(-1)}`);
});

// A small problem with everything on: kept and avoided cells, two load cases, the filter and projection
const lever = () => discretise({
  space: { at: [10, 0], size: [24, 10] },
  keep: [{ at: [0, 0], r: 3 }, { at: [20, 0], r: 2.5 }], avoid: [{ at: [0, 0], r: 1.2 }, { at: [20, 0], r: 1 }],
  supports: [{ at: [0, 0], r: 1.2 }], loads: [{ at: [20, 0], r: 1, force: [0, -1], case: 'down' }, { at: [20, 0], r: 1, force: [1, -1], case: 'angled' }],
  cases: { angled: 0.5 }, material: { E: 1000, nu: 0.35 }, thickness: 2, cell: 1, volume: 0.45, filter: 2,
});

test('the gradient matches finite differences, through the filter and projection', () => {
  const s = lever(), m = model(s), beta = 4, x = Float64Array.from(s.passive, (p, e) => (p ? (p === 1 ? 1 : 0) : 0.3 + 0.4 * ((e * 7) % 11) / 11));
  const { dc } = m.evaluate(x, beta), c = (y) => m.evaluate(y, beta).compliance;
  const free = [...s.passive.keys()].filter((e) => s.passive[e] === 0);
  for (const e of [free[3], free[Math.floor(free.length / 2)], free.at(-5)]) {
    const h = 1e-6, up = Float64Array.from(x), down = Float64Array.from(x);
    up[e] += h; down[e] -= h;
    const fd = (c(up) - c(down)) / (2 * h);
    assert.ok(Math.abs(fd - dc[e]) <= 1e-4 * Math.abs(fd) + 1e-12, `cell ${e}: ${dc[e]} against ${fd}`);
  }
});

test('a problem in shapes: kept, avoided and outside cells, and the result settles to solid and empty', () => {
  const s = lever();
  assert.deepEqual([s.grid.nx, s.grid.ny], [26, 10], 'the grid covers the space and the keep regions');
  const at = (x, y) => s.passive[Math.floor(y - s.origin[1]) * s.grid.nx + Math.floor(x - s.origin[0])];
  assert.equal(at(0.5, 0.5), -1, 'the hole is avoided');
  assert.equal(at(2, 0.5), 1, 'the boss round it is kept');
  assert.equal(at(10, 3), 0, 'the rest is free');
  const r = optimise(s);
  assert.ok(r.converged);
  assert.ok(Math.abs(r.volume - 0.45) < 0.01, `volume ${r.volume}`);
  const grey = r.density.filter((d) => d > 0.1 && d < 0.9).length / r.density.length;
  assert.ok(grey < 0.1, `${(grey * 100).toFixed(1)}% of cells are neither solid nor empty`);
  assert.deepEqual(r.cases.map((c) => c.name), ['down', 'angled']);
});

test('a load off the material says where', () => {
  assert.throws(() => discretise({ space: { at: [0, 0], size: [10, 10] }, supports: [{ at: [0, 0] }], loads: [{ at: [30, 0], force: [0, 1] }], material: { E: 1, nu: 0.3 }, thickness: 1, cell: 1, volume: 0.5 }), /isn't on any material/);
});

test('outlines: a disc is one loop counter-clockwise, a ring has a hole clockwise', () => {
  const n = 40, h = 0.5, d = (inside) => Float64Array.from({ length: n * n }, (_, e) => (inside(((e % n) + 0.5) * h - 10, (Math.floor(e / n) + 0.5) * h - 10) ? 1 : 0));
  const disc = outlines({ nx: n, ny: n, h }, d((x, y) => Math.hypot(x, y) < 7), [0, 0], { smooth: 4 });
  assert.equal(disc.length, 1);
  assert.ok(Math.abs(area(disc[0]) - Math.PI * 49) < 0.03 * Math.PI * 49, `area ${area(disc[0])}`);
  const ring = outlines({ nx: n, ny: n, h }, d((x, y) => Math.hypot(x, y) < 8 && Math.hypot(x, y) > 4), [0, 0]);
  assert.equal(ring.length, 2);
  assert.deepEqual(ring.map((l) => Math.sign(area(l))).sort(), [-1, 1]);
});

test('the density filter is an average, and its adjoint is its transpose', () => {
  const f = densityFilter({ nx: 9, ny: 7 }, 2.2), ones = new Float64Array(63).fill(1), out = new Float64Array(63);
  assert.ok(f.apply(ones, out).every((v) => Math.abs(v - 1) < 1e-12));
  const a = Float64Array.from({ length: 63 }, (_, i) => Math.sin(i)), b = Float64Array.from({ length: 63 }, (_, i) => Math.cos(2 * i));
  const Fa = f.apply(a, new Float64Array(63)), Ftb = f.adjoint(b, new Float64Array(63));
  const dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
  assert.ok(Math.abs(dot(Fa, b) - dot(a, Ftb)) < 1e-12);
});

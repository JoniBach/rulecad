import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimise, model, discretise, outlines, area, densityFilter, overhangFilter, surface, inside, bounds, mma } from '@rulecad/topopt';
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

// 3D: python3 reference/top3d.py 24 8 8 0.3 1.5, a port of Liu and Tovar (2014)'s top3d.m
test('3D: a cantilever of cubes matches top3d step for step', () => {
  const [nx, ny, nz] = [24, 8, 8], g = grid({ nx, ny, nz, h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let d = 0; d < 3; d++) fixed[3 * g.node(0, j, k) + d] = 1;
  for (let k = 0; k <= nz; k++) f[3 * g.node(nx, 0, k) + 1] = -1;
  const r = optimise({ grid: { nx, ny, nz, h: 1 }, passive: new Int8Array(g.cells), fixed, loads: [{ name: 'load', force: f, weight: 1, size: nz + 1 }], material: { E: 1, nu: 0.3 }, volume: 0.3, filter: 1.5, penal: 3, projection: false, steps: 200 });
  assert.equal(r.steps, 145);
  assert.ok(near(r.history[0], 44189.8256), `first ${r.history[0]}`);
  assert.ok(near(r.history.at(-1), 4906.7282), `last ${r.history.at(-1)}`);
});

test('the overhang filter: nothing unsupported survives, and its gradient matches finite differences', () => {
  const size = { nx: 6, ny: 5, nz: 4 }, f = overhangFilter(size, '+z'), n = 120;
  // A floating block in the top layer, nothing under it: printed as nothing
  const x = new Float64Array(n); for (let j = 1; j < 4; j++) for (let i = 1; i < 5; i++) x[(3 * 5 + j) * 6 + i] = 1;
  const out = f.apply(x, new Float64Array(n));
  assert.ok(Math.max(...out) < 0.05, `floating material printed as ${Math.max(...out)}`);
  // A column from the bed: printed as it is
  const col = new Float64Array(n); for (let k = 0; k < 4; k++) col[(k * 5 + 2) * 6 + 2] = 1;
  assert.ok(f.apply(col, new Float64Array(n))[(3 * 5 + 2) * 6 + 2] > 0.95);
  // Nearly empty everywhere (as an optimisation's empty space is): finite, with a finite gradient
  const empty = new Float64Array(n).fill(1e-8);
  assert.ok(f.apply(empty, new Float64Array(n)).every(Number.isFinite), 'printed densities are numbers');
  assert.ok(f.adjoint(new Float64Array(n).fill(1), new Float64Array(n)).every(Number.isFinite), 'no NaN or infinity in the gradient from empty space');
  // The gradient of a weighted sum of the printed densities, against finite differences
  const y = Float64Array.from({ length: n }, (_, e) => 0.2 + 0.6 * ((e * 37) % 11) / 11), w = Float64Array.from({ length: n }, (_, e) => Math.sin(e));
  const value = (z) => f.apply(z, new Float64Array(n)).reduce((s, v, e) => s + w[e] * v, 0);
  value(y); const grad = f.adjoint(w, new Float64Array(n));
  for (const e of [3, 40, 77, 115]) {
    const up = Float64Array.from(y), down = Float64Array.from(y); up[e] += 1e-6; down[e] -= 1e-6;
    const fd = (value(up) - value(down)) / 2e-6;
    assert.ok(Math.abs(fd - grad[e]) < 1e-5 * Math.max(1, Math.abs(fd)), `cell ${e}: ${grad[e]} against ${fd}`);
  }
});

test('surface: a ball of cubes becomes a closed mesh, facing out, about the ball\'s size', () => {
  const n = 20, h = 1, d = Float64Array.from({ length: n ** 3 }, (_, e) => {
    const i = e % n, j = Math.floor(e / n) % n, k = Math.floor(e / (n * n));
    return Math.hypot(i + 0.5 - 10, j + 0.5 - 10, k + 0.5 - 10) < 7 ? 1 : 0;
  });
  const { vertices, faces } = surface({ nx: n, ny: n, nz: n, h }, d, [0, 0, 0]);
  const edges = new Map();
  for (const [a, b, c] of faces) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = `${p},${q}`; edges.set(k, (edges.get(k) || 0) + 1); }
  for (const [k, count] of edges) { const [p, q] = k.split(','); assert.equal(count, 1, `edge ${k} used ${count} times one way`); assert.ok(edges.has(`${q},${p}`), `edge ${k} has no partner: a hole`); }
  let volume = 0; // positive if the faces face outwards
  for (const [a, b, c] of faces) { const [p, q, r] = [vertices[a], vertices[b], vertices[c]]; volume += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }
  const ball = (4 / 3) * Math.PI * 7 ** 3;
  assert.ok(Math.abs(volume / ball - 1) < 0.08, `volume ${volume} against ${ball}`);
});

test('3D regions: a box, a cylinder, and a closed mesh tell inside from out', () => {
  assert.equal(inside({ at: [0, 0, 0], size: [2, 4, 6] }, [0.9, -1.9, 2.9]), true);
  assert.equal(inside({ at: [0, 0, 0], size: [2, 4, 6] }, [1.1, 0, 0]), false);
  assert.equal(inside({ at: [0, 0, 5], r: 2, length: 10, axis: 'z' }, [1.4, 1.4, 9]), true);
  assert.equal(inside({ at: [0, 0, 5], r: 2, length: 10, axis: 'z' }, [1.5, 1.5, 5]), false);
  // A cube as a mesh: twelve triangles
  const c = [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0], [0, 0, 4], [4, 0, 4], [4, 4, 4], [0, 4, 4]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
  const triangles = quads.flatMap(([a, b, d, e]) => [[c[a], c[b], c[d]], [c[a], c[d], c[e]]]);
  assert.equal(inside({ triangles }, [2, 2, 2]), true);
  assert.equal(inside({ triangles }, [2, 2, 5]), false);
  assert.equal(inside({ triangles }, [5, 2, 2]), false);
  // A teardrop points any way across its axis; along it, it's a plain cylinder
  for (const [axis, teardrop, tip] of [['x', '+z', [0, 0, 2.7]], ['x', '-y', [0, -2.7, 0]], ['z', '+y', [0, 2.7, 0]], ['y', '-x', [-2.7, 0, 0]]]) {
    const r = { at: [0, 0, 0], r: 2, length: 4, axis, teardrop };
    assert.equal(inside(r, tip), true, `${axis} ${teardrop}: its point`);
    assert.equal(inside(r, tip.map((x) => -x)), false, `${axis} ${teardrop}: round the other side`);
    const b = bounds(r), q = 'xyz'.indexOf(teardrop[1]);
    assert.ok(Math.abs((teardrop[0] === '-' ? -b[q] : b[q + 3]) - 2 * Math.SQRT2) < 1e-9, `${axis} ${teardrop}: its bounds reach the point`);
  }
  assert.equal(inside({ at: [0, 0, 0], r: 2, length: 4, axis: 'z', teardrop: '+z' }, [0, 0, 2.1]), false, 'along its axis, no point');
});

test('a 3D problem in shapes: the grid is rounded for multigrid, supports and loads land on material', () => {
  const s = discretise({
    space: { at: [20, 5, 5], size: [40, 10, 10] }, keep: [{ at: [40, 5, 5], r: 3, length: 10, axis: 'y' }],
    supports: [{ at: [0, 5, 5], size: [1, 10, 10] }], loads: [{ at: [40, 5, 5], r: 2, force: [0, 0, -10] }],
    material: { E: 1000, nu: 0.3 }, cell: 1, volume: 0.3,
  });
  assert.deepEqual([s.grid.nx, s.grid.ny, s.grid.nz].map((v) => v % 2), [0, 0, 0]);
  assert.ok(s.fixed.reduce((a, b) => a + b, 0) > 3 * 100, 'the whole end face is held');
  assert.ok(Math.abs(s.loads[0].force.reduce((a, b) => a + b, 0) + 10) < 1e-9, 'the load adds up to 10 N down');
  assert.throws(() => discretise({ space: { at: [0, 0, 0], size: [4, 4, 4] }, supports: [{ at: [0, 0] }], loads: [{ at: [0, 0, 0], force: [0, 0, 1] }], material: { E: 1, nu: 0.3 }, cell: 1, volume: 0.5 }), /isn't on any material|3D/);
});

test('surface: material filling the grid to its faces gives exactly its box, closed and flat', () => {
  const size = { nx: 6, ny: 4, nz: 5, h: 2 }, { vertices, faces } = surface(size, new Float64Array(120).fill(1), [1, 2, 3]);
  const lo = [1, 2, 3], hi = [13, 10, 13];
  for (const v of vertices) for (let q = 0; q < 3; q++) assert.ok(v[q] >= lo[q] - 1e-9 && v[q] <= hi[q] + 1e-9, `vertex ${v} outside the box`);
  let volume = 0;
  for (const [a, b, c] of faces) { const [p, q, r] = [vertices[a], vertices[b], vertices[c]]; volume += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }
  assert.ok(Math.abs(volume - 12 * 8 * 10) < 1e-6, `volume ${volume}`);
  const edges = new Map();
  for (const [a, b, c] of faces) for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(`${p},${q}`, (edges.get(`${p},${q}`) || 0) + 1);
  for (const [k, n] of edges) { const [p, q] = k.split(','); assert.ok(n === 1 && edges.has(`${q},${p}`), `edge ${k}: a hole or a fold`); }
});

test('surface: a printable slope keeps no faces past the overhang limit, in any build direction, nor gains material', () => {
  // A wall leaning out at 45°, one cube further out per layer: smoothing its staircase leaves faces either side of 45°
  const n = [16, 4, 12], volume = (v, f) => f.reduce((s, [a, b, c]) => { const [p, q, r] = [v[a], v[b], v[c]]; return s + (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }, 0);
  for (const [up, axes] of [['+z', [0, 1, 2]], ['+y', [0, 2, 1]]]) {
    const size = { nx: n[axes[0]], ny: n[axes[1]], nz: n[axes[2]], h: 1 }, d = new Float64Array(n[0] * n[1] * n[2]), q = 'xyz'.indexOf(up[1]);
    for (let k = 0; k < size.nz; k++) for (let j = 0; j < size.ny; j++) for (let i = 0; i < size.nx; i++) { const c = [i, j, k]; d[(k * size.ny + j) * size.nx + i] = c[0] <= 2 + c[q] ? 1 : 0.001; }
    const past = ({ vertices: v, faces }) => faces.reduce((s, [a, b, c]) => {
      const u = v[b].map((x, m) => x - v[a][m]), w = v[c].map((x, m) => x - v[a][m]), nv = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...nv);
      return s + (nv[q] / l < -Math.sin((45.5 * Math.PI) / 180) && nv[q] / l > -0.999 ? l / 2 : 0);
    }, 0);
    const plain = surface(size, d), kept = surface(size, d, [0, 0, 0], { overhang: { up, angle: 45 } });
    assert.ok(past(plain) > 1, `${up}: the plain surface should have faces past 45° to fix (${past(plain)} mm²)`);
    assert.equal(past(kept), 0, `${up}: ${past(kept)} mm² past 45°`);
    assert.ok(Math.abs(volume(kept.vertices, kept.faces) / volume(plain.vertices, plain.faces) - 1) < 0.01, `${up}: volume changed`);
  }
});

test('MMA: Svanberg\'s two-constraint example lands on its known optimum', () => {
  // min x1² + x2² + x3², two balls of radius 3 about (5, 2, 1) and (3, 4, 3), 0 ≤ x ≤ 5 (Svanberg's mmasub test)
  const x = Float64Array.from([4, 3, 2]), step = mma({ n: 3, m: 2, xmin: new Float64Array(3), xmax: new Float64Array(3).fill(5) });
  const centres = [[5, 2, 1], [3, 4, 3]];
  for (let k = 0; k < 30; k++) {
    step(x, x.reduce((s, v) => s + v * v, 0), x.map((v) => 2 * v),
      centres.map((c) => x.reduce((s, v, i) => s + (v - c[i]) ** 2, 0) - 9), centres.map((c) => x.map((v, i) => 2 * (v - c[i]))));
  }
  [2.0175, 1.78, 1.2375].forEach((want, i) => assert.ok(Math.abs(x[i] - want) < 1e-3, `x${i + 1} = ${x[i]}, not ${want}`));
});

// A short cantilever: held along its left edge, loaded at the middle of its right
const stressed = (stress) => ({ space: { at: [30, 10], size: [60, 20] }, supports: [{ at: [0, 10], size: [0.1, 20] }], loads: [{ at: [60, 10], r: 2, force: [0, -50] }],
  keep: [{ at: [58, 10], size: [4, 4] }], material: { E: 2680, nu: 0.36 }, thickness: 2, cell: 2, stress, filter: 4.5 });

test('stress limits: the gradient matches finite differences, with multipliers and through the projection', () => {
  const spec = discretise(stressed(10)), m = model(spec), x = new Float64Array(m.cells);
  for (let e = 0; e < m.cells; e++) x[e] = spec.passive[e] ? (spec.passive[e] === 1 ? 1 : 0) : 0.3 + (0.4 * ((e * 7919) % 97)) / 97;
  const multipliers = { lam: [Float64Array.from({ length: m.limits }, (_, e) => ((e * 31) % 7) / 7)], mu: 10 };
  for (const beta of [1, 4]) {
    const { d } = m.evaluate(x, beta, { multipliers }).stress, h = 1e-5;
    for (const e of [40, 95, 150, 222]) {
      if (spec.passive[e]) continue;
      const xp = Float64Array.from(x), xm = Float64Array.from(x); xp[e] += h; xm[e] -= h;
      const fd = (m.evaluate(xp, beta, { multipliers }).stress.J - m.evaluate(xm, beta, { multipliers }).stress.J) / (2 * h);
      assert.ok(Math.abs(d[e] - fd) <= 1e-4 * Math.abs(fd) + 1e-9, `cell ${e} at sharpness ${beta}: ${d[e]} against ${fd}`);
    }
  }
});

test('stress limits: the lightest layout keeps to the limit, and a lower limit takes more material', () => {
  const loose = optimise(discretise(stressed(40))), tight = optimise(discretise(stressed(20)));
  for (const [o, limit] of [[loose, 40], [tight, 20]]) {
    assert.ok(o.converged, `at ${limit} MPa it settles`);
    assert.ok(o.stress.peak <= limit * 1.03, `at ${limit} MPa: peak ${o.stress.peak} MPa`);
  }
  assert.ok(tight.volume > loose.volume + 0.15, `20 MPa takes ${tight.volume}, 40 MPa ${loose.volume}`);
  assert.throws(() => optimise(discretise({ ...stressed(20), volume: 0.4 })), /not both/);
});

test('a 3D grid padded to whole multigrid blocks sits centred round its space, flush with the bed along the build direction', () => {
  const p = { space: { at: [0, 0, 20], r: 23, length: 40, axis: 'z' }, supports: [{ at: [0, 0, 0.5], r: 23, length: 1, axis: 'z' }], loads: [{ at: [0, 0, 39.5], r: 5, length: 1, axis: 'z', force: [0, 0, -1] }], material: { E: 2000, nu: 0.35 }, cell: 2, volume: 0.3, filter: 3 };
  for (const [overhang, z] of [[undefined, -4], ['+z', 0], ['-z', -8]]) {
    const s = discretise({ ...p, ...(overhang ? { overhang } : {}) });
    assert.deepEqual([s.grid.nx, s.grid.ny, s.grid.nz], [24, 24, 24]);
    assert.deepEqual(s.origin, [-24, -24, z], `built ${overhang ?? 'any way'}`);
  }
});

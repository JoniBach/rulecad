import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimise, model, discretise, outlines, area, densityFilter, overhangFilter, surface, inside, bounds, mma, printable, refine, despike, undercuts } from '@rulecad/topopt';
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

test('the overhang filter with bridges: a short bridge between two held cells survives, a long one does not, and the gradient matches finite differences', () => {
  const size = { nx: 9, ny: 3, nz: 3 }, n = 81, at = (i, j, k) => (k * 3 + j) * 9 + i;
  // Two columns up from the bed at i = 1 and i = 7, and a flat run across the top layer between them (5 cells over nothing)
  const x = new Float64Array(n);
  for (let k = 0; k < 3; k++) { x[at(1, 1, k)] = 1; x[at(7, 1, k)] = 1; }
  for (let i = 2; i <= 6; i++) x[at(i, 1, 2)] = 1;
  // (the run's end cells, at i = 2 and 6, sit diagonally above the columns, so the 45° rule holds them anyway)
  const printedBy = (reach) => overhangFilter(size, '+z', reach).apply(x, new Float64Array(n));
  const none = printedBy(0), one = printedBy(1), two = printedBy(2);
  assert.ok(none[at(3, 1, 2)] < 0.05 && none[at(4, 1, 2)] < 0.05, 'with no bridging nothing over nothing survives');
  assert.ok(one[at(3, 1, 2)] > 0.9 && one[at(5, 1, 2)] > 0.9, 'one cell from a held cell, the run survives');
  assert.ok(one[at(4, 1, 2)] < 0.05, 'the middle of a run too long to bridge (2 from either end, reach 1) does not');
  assert.ok(two[at(4, 1, 2)] > 0.9, 'with reach 2 the whole run survives');
  // A run with a gap in it bridges nothing past the gap
  const gap = Float64Array.from(x); gap[at(2, 1, 2)] = 0;
  assert.ok(overhangFilter(size, '+z', 2).apply(gap, new Float64Array(n))[at(3, 1, 2)] < 0.05, 'past a gap in the run, a cell too far from the other column is not held');
  // Nearly empty everywhere, with bridges in play: finite, with a finite gradient (a bridge's share of a cell's support
  // summed after the underflow guard was a denormal, whose power was infinite: NaN, which sank the tree stand at step 6)
  const empty = new Float64Array(n).fill(2e-8), fb = overhangFilter(size, '+z', 1); // (2e-8: a bridge's share raised to P is a denormal, 1e-320, whose power 1/Q − 1 is infinite)
  assert.ok(fb.apply(empty, new Float64Array(n)).every(Number.isFinite));
  assert.ok(fb.adjoint(new Float64Array(n).fill(1e-21), new Float64Array(n)).every(Number.isFinite), 'no NaN or infinity in the gradient from empty space with bridges');
  // The gradient, against finite differences, with bridges in play
  for (const reach of [1, 2]) {
    const f = overhangFilter(size, '+z', reach), y = Float64Array.from({ length: n }, (_, e) => 0.2 + 0.6 * ((e * 37) % 11) / 11), w = Float64Array.from({ length: n }, (_, e) => Math.cos(e));
    const value = (z) => f.apply(z, new Float64Array(n)).reduce((s, v, e) => s + w[e] * v, 0);
    value(y); const grad = f.adjoint(w, new Float64Array(n));
    for (const e of [5, 30, 44, 58, 70]) {
      const up = Float64Array.from(y), down = Float64Array.from(y); up[e] += 1e-6; down[e] -= 1e-6;
      const fd = (value(up) - value(down)) / 2e-6;
      assert.ok(Math.abs(fd - grad[e]) < 1e-5 * Math.max(1, Math.abs(fd)), `reach ${reach}, cell ${e}: ${grad[e]} against ${fd}`);
    }
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

test('surface: with tip, a printable slope keeps no faces past the overhang limit, in any build direction, nor gains material', () => {
  // A wall leaning out at 45°, one cube further out per layer: smoothing its staircase leaves faces either side of 45°
  const n = [16, 4, 12], volume = (v, f) => f.reduce((s, [a, b, c]) => { const [p, q, r] = [v[a], v[b], v[c]]; return s + (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }, 0);
  for (const [up, axes] of [['+z', [0, 1, 2]], ['+y', [0, 2, 1]]]) {
    const size = { nx: n[axes[0]], ny: n[axes[1]], nz: n[axes[2]], h: 1 }, d = new Float64Array(n[0] * n[1] * n[2]), q = 'xyz'.indexOf(up[1]);
    for (let k = 0; k < size.nz; k++) for (let j = 0; j < size.ny; j++) for (let i = 0; i < size.nx; i++) { const c = [i, j, k]; d[(k * size.ny + j) * size.nx + i] = c[0] <= 2 + c[q] ? 1 : 0.001; }
    const past = ({ vertices: v, faces }) => faces.reduce((s, [a, b, c]) => {
      const u = v[b].map((x, m) => x - v[a][m]), w = v[c].map((x, m) => x - v[a][m]), nv = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...nv);
      return s + (nv[q] / l < -Math.sin((45.5 * Math.PI) / 180) && nv[q] / l > -0.999 ? l / 2 : 0);
    }, 0);
    const plain = surface(size, d), kept = surface(size, d, [0, 0, 0], { overhang: { up, angle: 45, tip: true } });
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

test('a twist: forces adding to nothing are reported as the moment they turn with, the angle and the torsion', async () => {
  const { resultant } = await import('@rulecad/topopt');
  const r = 10, F = 5, ring = [0, 90, 180, 270].map((a) => ({ at: [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), 40], force: [-F * Math.sin(a * Math.PI / 180), F * Math.cos(a * Math.PI / 180), 0] }));
  const t = resultant(ring);
  assert.ok(t.size < 1e-9);
  assert.ok(Math.abs(t.moment - 4 * F * r) < 1e-9);
  assert.deepEqual(resultant([{ at: [0, 0, 0], force: [0, 0, -3] }]), { size: 3, moment: 0 });
  // A short tube held at the bottom and twisted at the top: an angle and a torsion, no deflection
  const spec = discretise({ space: { at: [0, 0, 6], size: [12, 12, 12] }, supports: [{ at: [0, 0, 0.5], size: [12, 12, 1] }],
    loads: [0, 90, 180, 270].map((a) => ({ at: [5 * Math.cos(a * Math.PI / 180), 5 * Math.sin(a * Math.PI / 180), 11.5], r: 1, length: 1, axis: 'z', force: [-Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180), 0], case: 'twist' })),
    material: { E: 2000, nu: 0.35 }, cell: 1, volume: 0.5, filter: 1.5, steps: 3 });
  const [c] = optimise(spec).cases;
  assert.ok(c.moment > 19 && c.moment < 21 && c.angle > 0 && Math.abs(c.torsion * c.angle - c.moment) < 1e-9 * c.moment && c.deflection === undefined);
});

test('printable: hanging cells are emptied before a result is drawn; kept cells stay and hold things up; short bridges stay', () => {
  const size = { nx: 5, ny: 1, nz: 4 }, at = (i, k) => k * 5 + i, d = new Float64Array(20);
  // A column up from the bed at i = 0, a cell diagonally above it (45°, fine), an icicle at (3, 2) with nothing below, a kept cell at (4, 3) over nothing
  [at(0, 0), at(0, 1), at(1, 2), at(3, 2), at(4, 3)].forEach((e) => (d[e] = 1));
  const keep = new Uint8Array(20); keep[at(4, 3)] = 1;
  const r = printable(size, d, { up: '+z', keep });
  assert.equal(r.emptied, 1);
  assert.equal(r.density[at(3, 2)], 0);
  assert.equal(r.density[at(1, 2)], 1);
  assert.equal(r.density[at(4, 3)], 1);
  // A row along a layer: held at one end, it stays as far as reach allows, the rest goes (and nothing rests on what went)
  const row = new Float64Array(20);
  [at(0, 0), at(0, 1), at(1, 1), at(2, 1), at(3, 1), at(3, 2)].forEach((e) => (row[e] = 1));
  // ((1, 1) rests on (0, 0) diagonally; (2, 1) and (3, 1) hang, and (3, 2) rests on them)
  assert.equal(printable(size, row, { up: '+z', reach: 0 }).emptied, 3);
  assert.equal(printable(size, row, { up: '+z', reach: 1 }).emptied, 1);
  assert.equal(printable(size, row, { up: '+z', reach: 2 }).emptied, 0);
  // Built the other way up, the bed is the top layer
  const flipped = new Float64Array(20); [at(2, 3), at(2, 2), at(2, 0)].forEach((e) => (flipped[e] = 1));
  assert.equal(printable(size, flipped, { up: '-z' }).emptied, 1);
});

test('a tip left hanging under a smoothed surface is lifted level with its neighbours, so nothing starts in mid-air', () => {
  // A slab with a two-cell stalactite under it: smoothed, the stalactite ends in a point, the lowest corner round
  // about on faces facing down. Built +z, no corner is lower than all round it on faces facing down (except on the bed).
  const n = 8, d = new Float64Array(n ** 3);
  for (let k = 5; k < 8; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d[(k * n + j) * n + i] = 1;
  d[(4 * n + 4) * n + 4] = 1; d[(3 * n + 4) * n + 4] = 1;
  const tips = ({ vertices, faces }) => {
    const near = vertices.map(() => new Set()), facing = new Float64Array(vertices.length);
    for (const f of faces) {
      for (let i = 0; i < 3; i++) { near[f[i]].add(f[(i + 1) % 3]); near[f[i]].add(f[(i + 2) % 3]); }
      const [p, q, r] = f.map((v) => vertices[v]), nz = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      for (const m of f) facing[m] += nz;
    }
    return vertices.filter((v, m) => v[2] > 1e-9 && facing[m] < 0 && [...near[m]].every((o) => vertices[o][2] > v[2] + 1e-6)).length;
  };
  const plain = surface({ nx: n, ny: n, nz: n, h: 1 }, d), built = surface({ nx: n, ny: n, nz: n, h: 1 }, d, [0, 0, 0], { overhang: { up: '+z', angle: 45 } });
  assert.ok(tips(plain) > 0, 'the stalactite should end in a hanging tip when nothing is done about it');
  assert.equal(tips(built), 0);
});

test('with a build direction, a kept region is held up: a kept cell nothing holds up costs the optimiser, and it grows the support', () => {
  // A kept plate across the top of a column of space, held at the bottom and loaded on the plate
  const problem = { space: { at: [0, 0, 8], size: [8, 2, 16] }, keep: [{ at: [0, 0, 15.5], size: [8, 2, 1] }], supports: [{ at: [0, 0, 0.5], size: [8, 2, 1] }],
    loads: [{ at: [0, 0, 15.5], size: [8, 2, 1], force: [0, 0, -10] }], material: { E: 2000, nu: 0.35 }, cell: 1, volume: 0.3, filter: 1.5, steps: 2 };
  const up = discretise({ ...problem, overhang: '+z' }), m = model(up), x = new Float64Array(m.cells).fill(0.05);
  const plate = Int32Array.from(Array.from(up.passive).flatMap((p, e) => (p === 1 ? [e] : [])));
  assert.ok(plate.length > 0);
  assert.ok(plate.every((e) => m.physical(x, 1)[e] === 1), 'a kept cell is solid to the analysis however it is held');
  assert.ok(m.evaluate(x, 1).unsupported > 0.5, 'over next to nothing, most of the plate has nothing holding it up');
  assert.equal(model(discretise(problem)).evaluate(x, 1).unsupported, 0, 'with no build direction, nothing to hold up');
  // (with material enough to stand the plate on: at 30% there isn't, and about a third of it is left unheld, reported)
  const o = optimise(discretise({ ...problem, overhang: '+z', volume: 0.5, steps: 60 }));
  assert.ok(o.unsupported < 0.1, `${(o.unsupported * 100).toFixed(0)}% of the kept plate has nothing under it`);
});

// Sigmund's force inverter: a 40 × 20 mm block held at its left corners, pushed to the right at the middle of its
// left edge against a spring; the output, the middle of its right edge, should move to the left, against its spring
const inverter = (extra = {}) => discretise({
  space: { at: [20, 10], size: [40, 20] }, cell: 1, volume: 0.3, filter: 1.5, material: { E: 1, nu: 0.3 }, thickness: 1,
  supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
  loads: [{ at: [0.5, 10], size: [1, 2], force: [1, 0] }], input_spring: 0.1,
  output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: 0.1 },
  ...extra,
});

test('a mechanism: the output travel and its gradient match finite differences, with springs on the input and output', () => {
  const s = inverter(), m = model(s), beta = 2, x = Float64Array.from(s.passive, (p, e) => (p ? (p === 1 ? 1 : 0) : 0.3 + 0.4 * ((e * 7) % 11) / 11));
  const { mechanism } = m.evaluate(x, beta), travel = (y) => m.evaluate(y, beta).mechanism.travel;
  assert.ok(Number.isFinite(mechanism.travel) && Number.isFinite(mechanism.input));
  const free = [...s.passive.keys()].filter((e) => s.passive[e] === 0);
  for (const e of [free[5], free[Math.floor(free.length / 3)], free.at(-7)]) {
    const h = 1e-6, up = Float64Array.from(x), down = Float64Array.from(x);
    up[e] += h; down[e] -= h;
    const fd = (travel(up) - travel(down)) / (2 * h);
    assert.ok(Math.abs(fd - mechanism.d[e]) <= 1e-4 * Math.abs(fd) + 1e-10, `cell ${e}: ${mechanism.d[e]} against ${fd}`);
  }
});

test('the force inverter: from a block that moves with the push, the optimiser makes a mechanism that moves against it', () => {
  const s = inverter({ steps: 400 }), m = model(s);
  const even = Float64Array.from(s.passive, (p) => (p ? (p === 1 ? 1 : 0) : 0.3));
  assert.ok(m.evaluate(even, 1).mechanism.travel < 0, 'an even block moves its right edge the way it is pushed');
  const r = optimise(s);
  assert.ok(r.mechanism.travel > 0, `the output moves against the push: ${r.mechanism.travel}`);
  // (the optimiser maximises the output's travel, not the ratio; with soft springs either side it comes out about a tenth)
  assert.ok(r.mechanism.advantage > 0.08, `the output travels a share of the input's: ${r.mechanism.advantage}`);
  assert.ok(r.converged && r.steps < 400, `settles: ${r.steps} steps`);
  // Robust: one piece, cell to cell (no point hinges joined only at corners or by half-empty cells)
  const { nx, ny } = s.grid, solid = (e) => r.density[e] >= 0.5, seen = new Uint8Array(r.density.length), stack = [r.density.findIndex((d) => d >= 0.5)];
  seen[stack[0]] = 1;
  while (stack.length) { const e = stack.pop(), i = e % nx, j = Math.floor(e / nx); for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const f = b * nx + a; if (solid(f) && !seen[f]) { seen[f] = 1; stack.push(f); } } }
  const pieces = r.density.filter((d, e) => d >= 0.5 && !seen[e]).length;
  assert.equal(pieces, 0, `${pieces} solid cells not joined, cell to cell, to the rest`);
  assert.ok(Math.abs(r.volume - 0.3) < 0.02, `the volume is held: ${r.volume}`);
  assert.ok(r.density.filter((d) => d > 0.1 && d < 0.9).length < r.density.length * 0.15, 'mostly solid or empty');
});

test('refine: densities interpolated onto a finer grid keep their total and their kept blocks; despike empties a hanging point and nothing else', () => {
  const size = { nx: 4, ny: 4, nz: 4, h: 2 }, d = new Float64Array(64), keep = new Uint8Array(64);
  for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) d[(k * 4 + j) * 4 + i] = k < 2 ? 1 : 0; // the bottom half solid
  keep[(0 * 4 + 0) * 4 + 0] = 1;
  const f = refine(size, d, 2, { keep });
  assert.deepEqual([f.grid.nx, f.grid.ny, f.grid.nz, f.grid.h], [8, 8, 8, 1]);
  assert.ok(Math.abs(f.density.reduce((a, b) => a + b, 0) / 8 - d.reduce((a, b) => a + b, 0)) < 1e-9, 'the same material');
  assert.equal(f.keep.reduce((a, b) => a + b, 0), 8, 'a kept cell is a kept block');
  assert.ok(f.density[(0 * 8 + 0) * 8 + 0] === 1 && f.density[(7 * 8 + 0) * 8 + 0] === 0 && f.density[(3 * 8 + 0) * 8 + 0] > 0.5 && f.density[(4 * 8 + 0) * 8 + 0] < 0.5, 'solid below, empty above, the edge between');
  // A spike: one solid cell hanging under the slab with nothing under it and nothing beside it
  const g = Float64Array.from(d); g[(1 * 4 + 1) * 4 + 1] = 1; // (already solid; make a hanging one above the slab instead)
  const h = new Float64Array(64); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) h[(0 * 4 + j) * 4 + i] = 1; // a slab on the bed
  h[(2 * 4 + 1) * 4 + 1] = 1; // one cell above it with nothing under it and nothing beside it: a hanging point
  const sp = despike(size, h, { up: '+z' });
  assert.equal(sp.emptied, 1); assert.equal(sp.density[(2 * 4 + 1) * 4 + 1], 0);
  h[(1 * 4 + 1) * 4 + 1] = 1; // now something under it: it stays
  assert.equal(despike(size, h, { up: '+z' }).emptied, 0);
  const wall = new Float64Array(64); for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) wall[(k * 4 + j) * 4 + 1] = 1; // a wall, every cell on another
  assert.equal(despike(size, wall, { up: '+z' }).emptied, 0, 'a wall is not spikes');
});


test('a 2D grid covers its space: a 40 × 10 mm space on 3 mm cells is 14 × 4 cells, centred on it, not 13 × 3', async () => {
  const { discretise } = await import('@rulecad/topopt');
  const d = discretise({ space: { at: [20, 5], size: [40, 10] }, cell: 3, volume: 0.5, supports: [{ at: [0, 5], r: 1 }], loads: [{ at: [40, 5], r: 1, force: [0, -1] }] });
  assert.deepEqual([d.grid.nx, d.grid.ny], [14, 4]);
  assert.ok(Math.abs(d.origin[0] - -1) < 1e-9 && Math.abs(d.origin[1] - -1) < 1e-9, `centred: ${d.origin}`);
});

test('surface: no faces of zero area where corners meet at a grid face, and still closed', async () => {
  const { surface } = await import('@rulecad/topopt');
  const nx = 12, ny = 10, nz = 8, d = new Float64Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[(k * ny + j) * nx + i] = (i < 9 && j > 1) || k < 2 ? 1 : 0;
  const s = surface({ nx, ny, nz, h: 1 }, d, [0, 0, 0], { smooth: 4 }), V = s.vertices;
  const area = (f) => { const [a, b, c] = f.map((i) => V[i]); const u = [0, 1, 2].map((k) => b[k] - a[k]), v = [0, 1, 2].map((k) => c[k] - a[k]); return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; };
  const zero = s.faces.filter((f) => area(f) < 1e-9).length;
  assert.ok(zero < s.faces.length * 0.02, `${zero} of ${s.faces.length} faces have no area`);
  const edges = new Map(); for (const f of s.faces) for (let i = 0; i < 3; i++) { const k = `${f[i]}>${f[(i + 1) % 3]}`; edges.set(k, (edges.get(k) || 0) + 1); }
  const open = [...edges.keys()].filter((k) => { const [a, b] = k.split('>'); return !edges.has(`${b}>${a}`); }).length;
  assert.equal(open, 0, 'every edge matched by one running the other way');
});

test('discretise: a space a sliver of a cell over a whole number of cells keeps that number, in 3D its multigrid size too', () => {
  const box = (w, h) => ({ space: { at: [0, 0, h / 2], size: [w, w, h] }, supports: [{ at: [0, 0, 0.5], size: [12, 12, 1] }], loads: [{ at: [0, 0, h - 1], r: 2, force: [1, 0, 0] }], material: { E: 1, nu: 0.3 }, cell: 1, volume: 0.3 });
  const exact = discretise(box(12, 24)).grid, over = discretise(box(12.0001, 24.0001)).grid;
  assert.deepEqual([over.nx, over.ny, over.nz], [exact.nx, exact.ny, exact.nz], 'a surface 0.05 µm out of its space: the same grid');
  const wider = discretise(box(12.1, 24)).grid;
  assert.ok(wider.nx > exact.nx, 'a tenth of a cell over is a cell more');
});

test('the draw filter: no cell emptier than the cells between it and the tool, two halves from a parting plane, and its gradient matches finite differences', async () => {
  const { drawFilter, undercuts } = await import('@rulecad/topopt');
  const size = { nx: 3, ny: 2, nz: 5 }, n = 30, at = (i, j, k) => (k * 2 + j) * 3 + i;
  // Milled from above (+z): one solid cell part way down a column fills everything under it; the column beside, empty, stays empty
  // (an empty cell after empty ones gains the smooth maximum's rounding: ½√ε = 0.5 × 10⁻³ for ε = 10⁻⁶ after one,
  // 0.5 × (0.5 × 10⁻³ + √(0.25 × 10⁻⁶ + 10⁻⁶)) = 0.81 × 10⁻³ after two, about √(k ε / 2) after k: under 2 × 10⁻³ here)
  const x = new Float64Array(n); x[at(1, 0, 3)] = 1;
  const top = drawFilter(size, '+z').apply(x, new Float64Array(n));
  for (let k = 0; k < 5; k++) assert.ok(k <= 3 ? top[at(1, 0, k)] === 1 : top[at(1, 0, k)] < 2e-3, `layer ${k}: ${top[at(1, 0, k)]}`);
  assert.ok(Math.max(...[0, 1, 2, 3, 4].map((k) => top[at(0, 0, k)])) < 2e-3, 'an empty column stays empty');
  // From below (-z), the same cell fills the layer above it to the top instead
  const bottom = drawFilter(size, '-z').apply(x, new Float64Array(n));
  assert.ok(bottom[at(1, 0, 4)] === 1 && bottom[at(1, 0, 2)] < 2e-3);
  // Two halves parted at layer 2: a cell at layer 3 fills layer 2 (its half's side is +z) but not layers 0 and 1
  const two = drawFilter(size, 'z', 2).apply(x, new Float64Array(n));
  assert.ok(two[at(1, 0, 2)] === 1 && two[at(1, 0, 1)] < 2e-3 && two[at(1, 0, 0)] < 2e-3 && two[at(1, 0, 4)] < 2e-3);
  // undercuts on a column with a hole under a solid cell, as seen from above; none from below the hole's own side
  const holed = new Float64Array(n); [0, 2, 3].forEach((k) => (holed[at(2, 1, k)] = 1));
  assert.deepEqual(undercuts(size, holed, { from: '+z' }).cells, [at(2, 1, 1)]);
  assert.equal(undercuts(size, holed, { from: '-z' }).count, 2, 'from below, the hole at layer 1 and the empty layer 4 above it are both behind solid cells');
  assert.equal(undercuts(size, holed, { from: 'z', parting: 2 }).count, 1, 'two halves parted at 2: only the hole is behind a solid cell (the lower half drawn down)');
  assert.throws(() => drawFilter(size, 'z'), /the tool's side is \+x, -x, \+y, -y, \+z or -z/);
  assert.throws(() => drawFilter(size, 'z', 6), /the parting plane is a layer from 0 to 5/);
  // The gradient of a weighted sum of the filtered densities, against finite differences (both ways, and two halves)
  const y = Float64Array.from({ length: n }, (_, e) => 0.1 + 0.8 * ((e * 37) % 11) / 11), w = Float64Array.from({ length: n }, (_, e) => Math.sin(e + 1));
  for (const f of [drawFilter(size, '+z'), drawFilter(size, '-x'), drawFilter(size, 'z', 3)]) {
    const value = (z) => f.apply(z, new Float64Array(n)).reduce((s, v, e) => s + w[e] * v, 0);
    value(y); const grad = f.adjoint(w, new Float64Array(n));
    for (let e = 0; e < n; e++) {
      const up = Float64Array.from(y), down = Float64Array.from(y); up[e] += 1e-7; down[e] -= 1e-7;
      const fd = (value(up) - value(down)) / 2e-7;
      assert.ok(Math.abs(fd - grad[e]) < 1e-5 * Math.max(1, Math.abs(fd)), `cell ${e}: ${grad[e]} against ${fd}`);
    }
  }
});

test('the tie filter: mirror images, half and quarter turns and an extrusion share one density, refused by name when the grid cannot', async () => {
  const { tieFilter } = await import('@rulecad/topopt');
  const x = Float64Array.from({ length: 4 * 4 * 3 }, (_, e) => (e * 7) % 5), size = { nx: 4, ny: 4, nz: 3 }, at = (i, j, k) => (k * 4 + j) * 4 + i;
  const m = tieFilter(size, { mirror: 'x' }).apply(x, new Float64Array(48));
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    assert.equal(m[at(i, j, k)], m[at(3 - i, j, k)]);
    assert.equal(m[at(i, j, k)], (x[at(i, j, k)] + x[at(3 - i, j, k)]) / 2, 'the average of the pair');
  }
  const q = tieFilter(size, { turns: 4 }).apply(x, new Float64Array(48));
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.equal(q[at(i, j, k)], q[at(3 - j, i, k)], 'a quarter turn about z maps (i, j) to (3 - j, i)');
  const ex = tieFilter(size, { extrude: 'z' }).apply(x, new Float64Array(48));
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.ok(ex[at(i, j, 0)] === ex[at(i, j, 1)] && ex[at(i, j, 1)] === ex[at(i, j, 2)], 'one section along z');
  // A passive cell keeps its own density and is left out of its group's average
  const passive = new Int8Array(48); passive[at(0, 0, 0)] = 1;
  const p = tieFilter(size, { mirror: 'x' }, passive).apply(x, new Float64Array(48));
  assert.equal(p[at(0, 0, 0)], x[at(0, 0, 0)]); assert.equal(p[at(3, 0, 0)], x[at(3, 0, 0)]);
  // The average is symmetric, so its adjoint is itself: <A x, y> = <x, A y>
  const t = tieFilter(size, { mirror: 'xy', extrude: 'z' }), y = Float64Array.from({ length: 48 }, (_, e) => Math.cos(e));
  const dot = (a, b) => a.reduce((s, v, e) => s + v * b[e], 0);
  assert.ok(Math.abs(dot(t.apply(x, new Float64Array(48)), y) - dot(x, t.adjoint(y, new Float64Array(48)))) < 1e-12);
  assert.equal(tieFilter(size, {}), null, 'nothing tied: no filter');
  assert.throws(() => tieFilter({ nx: 4, ny: 3, nz: 2 }, { turns: 4 }), /a quarter turn about z needs a square grid across it \(4 by 3 cells\)/);
  assert.throws(() => tieFilter(size, { turns: 3 }), /turns is 2 or 4/);
  assert.throws(() => tieFilter({ nx: 4, ny: 4 }, { mirror: 'z' }), /mirror across x, y \(got "z"\)/);
  assert.throws(() => tieFilter(size, { extrude: 'w' }), /extrude: along x, y, z/);
});

test('voids: a hollow block has one enclosed void of its size; a cup open to the grid edge has none', async () => {
  const { voids } = await import('@rulecad/topopt');
  const n = 5, d = new Float64Array(n ** 3).fill(1), at = (i, j, k) => (k * n + j) * n + i;
  d[at(2, 2, 2)] = 0; d[at(2, 2, 3)] = 0; // a two-cell pocket inside
  const v = voids({ nx: n, ny: n, nz: n, h: 2 }, d, { origin: [10, 0, 0] });
  assert.equal(v.length, 1);
  assert.equal(v[0].volume, 2 * 2 ** 3, 'two cells of 2 mm: 16 mm³');
  assert.deepEqual(v[0].at, [10 + 2 * 2.5, 2 * 2.5, 2 * 3], 'centred on the pocket: cells 2 and 3 up, so 2 × (2.5 + 0.5) = 6 mm');
  d[at(2, 2, 4)] = 0; // open the pocket up through the top face
  assert.deepEqual(voids({ nx: n, ny: n, nz: n, h: 2 }, d), []);
});

test('a problem milled, cast, symmetric or extruded: refused by name with another process or a mirror across the build direction, and the parting plane found on the grid', () => {
  const p = { space: { at: [0, 0, 5], size: [10, 10, 10] }, supports: [{ at: [0, 0, 0.5], size: [10, 10, 1] }], loads: [{ at: [0, 0, 9.5], r: 2, force: [1, 0, 0] }], material: { E: 1, nu: 0.3 }, cell: 1, volume: 0.3 };
  assert.throws(() => discretise({ ...p, overhang: '+z', mill: '+z' }), /printed \(overhang\), milled \(mill\) or cast \(cast\), one of them: this problem gives overhang and mill/);
  assert.throws(() => discretise({ ...p, overhang: '+z', symmetry: { mirror: 'xz' } }), /printed \+z, a part can't be the same mirrored across z/);
  // (the 10 mm space on 1 mm cells is padded to 12 cells, centred: along z from -1 to 11 mm, so its middle at 5 mm is
  // layer (5 + 1) / 1 = 6, and a parting plane asked at 2 mm is layer 3)
  const s = discretise({ ...p, cast: { draw: 'z' } });
  assert.deepEqual(s.cast, { draw: 'z', parting: 6, at: 5 });
  assert.deepEqual(discretise({ ...p, cast: { draw: 'z', parting: 2 } }).cast, { draw: 'z', parting: 3, at: 2 });
  assert.throws(() => discretise({ ...p, cast: { draw: 'z', parting: 40 } }), /cast: the parting plane at 40 mm is off the grid along z \(-1 to 11 mm\)/);
  assert.throws(() => discretise({ ...p, cast: { draw: 'q' } }), /cast: the draw axis is x, y, z/);
  assert.equal(discretise({ ...p, mill: '+z', symmetry: { mirror: 'x' }, extrude: 'y' }).mill, '+z');
});

test('symmetry: a short cantilever loaded at one corner, mirrored across its middle, comes out the same both sides', () => {
  const s = spec(32, 16, 0.4, 1.5, (g, fixed) => { for (let j = 0; j <= 16; j++) fixed[2 * g.node(0, j)] = fixed[2 * g.node(0, j) + 1] = 1; }, (g, f) => { f[2 * g.node(32, 0) + 1] = -1; });
  const free = optimise({ ...s, steps: 60 }), mirrored = optimise({ ...s, steps: 60, symmetry: { mirror: 'y' } });
  let worst = 0, odd = 0;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 32; i++) { worst = Math.max(worst, Math.abs(mirrored.density[j * 32 + i] - mirrored.density[(15 - j) * 32 + i])); odd = Math.max(odd, Math.abs(free.density[j * 32 + i] - free.density[(15 - j) * 32 + i])); }
  assert.ok(worst < 1e-12, `mirrored: the two halves differ by ${worst}`);
  assert.ok(odd > 0.3, `free, loaded at one corner, it is lopsided (${odd})`);
  assert.ok(mirrored.compliance >= free.compliance * 0.999, 'tied cells can only cost stiffness');
});

test('the 3D cantilever milled from above: no undercuts from the tool\'s side, where the free design has hundreds, and it comes out solid or empty', async () => {
  const [nx, ny, nz] = [24, 8, 8], g = grid({ nx, ny, nz, h: 1 }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let d = 0; d < 3; d++) fixed[3 * g.node(0, j, k) + d] = 1;
  for (let k = 0; k <= nz; k++) f[3 * g.node(nx, 0, k) + 1] = -1;
  const s = { grid: { nx, ny, nz, h: 1 }, passive: new Int8Array(g.cells), fixed, loads: [{ name: 'load', force: f, weight: 1, size: nz + 1 }], material: { E: 1, nu: 0.3 }, volume: 0.3, filter: 1.5, penal: 3, projection: true };
  const milled = optimise({ ...s, mill: '+z', steps: 200 }), free = optimise({ ...s, steps: 60 });
  assert.equal(undercuts({ nx, ny, nz }, milled.density, { from: '+z' }).count, 0);
  const { grey } = await import('@rulecad/topopt');
  // (82 of its 1536 cells, 5.3%, on its surfaces: under the tenth cad warns at)
  assert.ok(grey(milled.density) < 0.1, `solid or empty: ${grey(milled.density)} grey`);
  assert.ok(undercuts({ nx, ny, nz }, free.density, { from: '+z' }).count > 100, 'the free design hides material under itself');
  // (200 steps from above: compliance 3227 against the free design's 2989 at the same steps, 8% less stiff, its volume 31%)
  assert.ok(milled.compliance < free.compliance * 1.3 && Math.abs(milled.volume - 0.3) < 0.02, `compliance ${milled.compliance}, volume ${milled.volume}`);
});

test('the gradient matches finite differences through a mirror, an extrusion and the tool\'s side', () => {
  for (const extra of [{ mill: '+y', symmetry: { mirror: 'x' } }, { cast: { draw: 'y', parting: 5 } }, { extrude: 'x' }]) {
    const s = { ...lever(), ...extra }, m = model(s), beta = 4, x = Float64Array.from(s.passive, (p, e) => (p ? (p === 1 ? 1 : 0) : 0.3 + 0.4 * ((e * 7) % 11) / 11));
    const { dc } = m.evaluate(x, beta), c = (y) => m.evaluate(y, beta).compliance;
    // (cells the tool's side fills from elsewhere have next to no gradient of their own, lost in the differences'
    // rounding: three cells spread over those with a gradient worth a hundredth of the largest)
    const free = [...s.passive.keys()].filter((e) => s.passive[e] === 0), big = Math.max(...free.map((e) => Math.abs(dc[e]))), live = free.filter((e) => Math.abs(dc[e]) > big / 100);
    for (const e of [live[3], live[Math.floor(live.length / 2)], live.at(-5)]) {
      const h = 1e-6, up = Float64Array.from(x), down = Float64Array.from(x);
      up[e] += h; down[e] -= h;
      const fd = (c(up) - c(down)) / (2 * h);
      assert.ok(Math.abs(fd - dc[e]) <= 1e-4 * Math.abs(fd) + 1e-12, `${JSON.stringify(extra)}, cell ${e}: ${dc[e]} against ${fd}`);
    }
  }
});

test('the draw filter never leaves a cell emptier than one on its way out, so a cantilever milled from its side has no undercuts with no avoid region', async () => {
  const { drawFilter, grey } = await import('@rulecad/topopt');
  // A column of 8 cells milled from +y: a full cell at the top fills every cell under it to exactly 1 (the smooth
  // maximum used to lose ½√ε = 0.5 × 10⁻³ a cell: 0.9965 at the bottom), and any column comes out as solid as the
  // cells above it, and at least its own
  const size = { nx: 1, ny: 8 }, top = new Float64Array(8); top[7] = 1;
  assert.deepEqual([...drawFilter(size, '+y').apply(top, new Float64Array(8))], [1, 1, 1, 1, 1, 1, 1, 1]);
  const x = Float64Array.from({ length: 8 }, (_, e) => 0.2 + 0.6 * ((e * 5) % 7) / 7), made = drawFilter(size, '+y').apply(x, new Float64Array(8));
  for (let j = 6; j >= 0; j--) assert.ok(made[j] >= made[j + 1] && made[j] >= x[j], `cell ${j}: ${made[j]} under ${made[j + 1]}, its own ${x[j]}`);
  // The 30 × 20 cantilever, held at its left side and loaded down at its right side's middle, no avoid regions, 200
  // steps: milled from above it had 5 undercut cells, from its free end 35 (densities 0.497 falling to 0.481 down a column)
  const s = spec(30, 20, 0.4, 1.5, (g, fixed) => { for (let j = 0; j <= 20; j++) fixed[2 * g.node(0, j)] = fixed[2 * g.node(0, j) + 1] = 1; }, (g, f) => { f[2 * g.node(30, 10) + 1] = -1; });
  for (const from of ['+y', '+x']) {
    const r = optimise({ ...s, projection: true, steps: 200, mill: from });
    assert.equal(undercuts(s.grid, r.density, { from }).count, 0, `milled from ${from}`);
    // (a section milled from its own side is a grey result: a full-height grey column bends as stiffly as a solid one
    // of its share's height, so the optimiser has no reason to choose; grey says so)
    if (from === '+y') assert.ok(grey(r.density) > 0.3, `grey ${grey(r.density)}`);
  }
});

test('symmetry the process can\'t keep is refused by name: a mirror or turn that swaps the tool\'s side, the draw or the build direction', () => {
  const s = spec(30, 20, 0.4, 1.5, (g, fixed) => { for (let j = 0; j <= 20; j++) fixed[2 * g.node(0, j)] = fixed[2 * g.node(0, j) + 1] = 1; }, (g, f) => { f[2 * g.node(30, 10) + 1] = -1; });
  const go = (extra) => optimise({ ...s, projection: true, steps: 40, ...extra });
  // (accepted before: the halves came out 0.762, 0.991 and 0.838 apart while the part was said to be mirrored)
  assert.throws(() => go({ mill: '+y', symmetry: { mirror: 'y' } }), /milled from \+y, a part can't be the same mirrored across y \(the tool's side\)/);
  assert.throws(() => go({ overhang: '+y', symmetry: { turns: 2 } }), /printed \+y, a half turn about z turns the build direction round to face the other way: mirror across x instead/);
  assert.throws(() => go({ cast: { draw: 'y', parting: 5 }, symmetry: { mirror: 'y' } }), /cast in two halves along y, .*mirrored across y \(the draw\).*or part it at the grid's middle \(layer 10 of 20\)/);
  assert.throws(() => go({ mill: '+x', symmetry: { turns: 4 } }), /a quarter turn about z moves the tool's side onto another axis/);
  // Two halves parted at the middle map onto each other, and a mirror across the other axis keeps the tool's side
  const half = (r) => { let w = 0; for (let j = 0; j < 20; j++) for (let i = 0; i < 30; i++) w = Math.max(w, Math.abs(r.density[j * 30 + i] - r.density[(19 - j) * 30 + i])); return w; };
  assert.ok(half(go({ cast: { draw: 'y', parting: 10 }, symmetry: { mirror: 'y' } })) < 1e-12);
  assert.ok(half(go({ mill: '+x', symmetry: { mirror: 'y' } })) < 1e-12);
  // In 3D: a turn about another axis than the tool's
  const p = { space: { at: [0, 0, 5], size: [10, 10, 10] }, supports: [{ at: [0, 0, 0.5], size: [10, 10, 1] }], loads: [{ at: [0, 0, 9.5], r: 2, force: [1, 0, 0] }], material: { E: 1, nu: 0.3 }, cell: 1, volume: 0.3 };
  assert.throws(() => discretise({ ...p, mill: '+z', symmetry: { turns: 2, axis: 'x' } }), /milled from \+z, a half turn about x turns the tool's side round to face the other way: turn about z/);
  assert.throws(() => discretise({ ...p, overhang: '+z', symmetry: { turns: 4, axis: 'y' } }), /printed \+z, a quarter turn about y moves the build direction onto another axis/);
  assert.throws(() => discretise({ ...p, cast: { draw: 'z' }, symmetry: { turns: 4, axis: 'x' } }), /a quarter turn about x moves the draw onto another axis/);
  assert.equal(discretise({ ...p, cast: { draw: 'z' }, symmetry: { turns: 2, axis: 'x' } }).cast.parting, 6, 'parted at the middle: a half turn about x maps each half onto the other');
  assert.equal(discretise({ ...p, mill: '+z', symmetry: { turns: 4 } }).mill, '+z', 'a quarter turn about the tool\'s own axis');
});

test('grey: the share of the design cells neither empty nor solid', async () => {
  const { grey } = await import('@rulecad/topopt');
  // 0.05 and 0.95 are clear, 0.1 and 0.9 on the line count as clear, 0.5 and 0.3 are grey: 2 of 6
  assert.equal(grey([0.05, 0.95, 0.1, 0.9, 0.5, 0.3]), 2 / 6);
  // A kept cell (passive) doesn't count: 1 grey of the 2 free cells
  assert.equal(grey([0.5, 0.5, 1], [0, 1, 0]), 0.5);
  assert.equal(grey([], []), 0);
});

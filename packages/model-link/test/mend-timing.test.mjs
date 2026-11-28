// The mesh mender (mesh(), run by stl() and threemf()) looks along each open edge for loose corners to split it at. It
// used to search every 1 mm cell of the edge's box, so a link of a few dozen characters holding one long diagonal
// triangle froze the writers for seconds to minutes (cost grew with the cube of the edge's length). These tests hold
// it to the length of the edge, and check a mesh too big for the grid walk is still mended, in bounded time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stl, threemf, mesh } from '@rulecad/model-link';

const time = async (f) => { const t0 = performance.now(); const out = await f(); return [performance.now() - t0, out]; };

// Edges used once only, with their direction: an empty list means the mesh is closed
const open = ({ tris }) => {
  const edges = new Set(); for (const [a, b, c] of tris) edges.add(`${a},${b}`).add(`${b},${c}`).add(`${c},${a}`);
  return [...edges].filter((k) => { const [a, b] = k.split(','); return !edges.has(`${b},${a}`); });
};

// A tetrahedron with a long diagonal edge O-Q, one of its two faces there split at `cuts` points along the edge: those
// points are loose corners lying along the other face's edge (T-junctions), which the mender must split it at
const tjunction = (s, cuts = 1) => {
  const O = [0, 0, 0], Q = [s, s, s], P = [0, s, 0], R = [s, 0, 0];
  const on = Array.from({ length: cuts }, (_, i) => O.map((c, k) => c + (Q[k] - c) * (i + 1) / (cuts + 1)));
  const tris = [[O, Q, P], [P, Q, R], [O, P, R]];
  const row = [O, ...on, Q]; // face O, R, Q split into a fan from R along the edge
  for (let i = 0; i < row.length - 1; i++) tris.push([row[i], R, row[i + 1]]);
  return tris;
};

test('a link holding one open diagonal triangle 400 mm across writes STL and 3MF quickly', async () => {
  const m = { q: 1, p: [0, 0, 0, 400, 400, 400, 0, 400, 0], t: [0, 1, 2] };
  const [a, bytes] = await time(() => stl(m));
  const [b, zip] = await time(() => threemf(m));
  assert.equal(bytes.length, 84 + 50, 'one triangle written');
  assert.ok(zip.length > 0);
  assert.ok(a < 1000, `STL took ${a.toFixed(0)} ms`);
  assert.ok(b < 1000, `3MF took ${b.toFixed(0)} ms`);
});

test('a 10 m open diagonal triangle still writes, in bounded time', async () => {
  const s = 1e4, m = { q: 1, p: [0, 0, 0, s, s, s, 0, s, 0], t: [0, 1, 2] };
  const [a, bytes] = await time(() => stl(m));
  assert.equal(bytes.length, 84 + 50);
  assert.ok(a < 1000, `STL took ${a.toFixed(0)} ms`);
});

test('a T-junction on a long diagonal edge is mended: the mesh comes out closed', async () => {
  for (const s of [10, 400, 1e4]) {
    const [ms, out] = await time(() => mesh(tjunction(s)));
    assert.equal(out.tris.length, 6, 'the face along the edge is split at the loose corner');
    assert.deepEqual(open(out), [], `closed at ${s} mm`);
    assert.ok(ms < 1000, `mending at ${s} mm took ${ms.toFixed(0)} ms`);
  }
});

test('many loose corners along a 10 m diagonal edge, where looking at each loose corner is cheaper than the grid walk: all mended, in bounded time', async () => {
  const [ms, out] = await time(() => mesh(tjunction(1e4, 40)));
  assert.deepEqual(open(out), [], 'closed');
  assert.equal(out.tris.length, 3 + 41 + 40, 'the face along the edge is split at every loose corner');
  assert.ok(ms < 1000, `mending took ${ms.toFixed(0)} ms`);
});

test('short and axis-aligned edges mend as before', () => {
  // A unit cube's top face with a corner in the middle of one top edge (a T-junction, as JSCAD's booleans leave)
  const c = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]], M = [5, 0, 10];
  const q = (a, b, d, e) => [[c[a], c[b], c[d]], [c[a], c[d], c[e]]];
  const tris = [...q(0, 3, 2, 1), ...q(3, 7, 6, 2), ...q(1, 2, 6, 5), ...q(0, 4, 7, 3), ...q(4, 5, 6, 7),
    [c[0], c[1], M], [c[1], c[5], M], [c[0], M, c[4]]]; // the front face, in three, with M on the top front edge
  const out = mesh(tris);
  assert.deepEqual(open(out), []);
  assert.equal(out.verts.length, 9);
});

test('thousands of long open edges among thousands of loose corners (a mesh made to be slow) still write in bounded time', async () => {
  // 5,000 open triangles 10 m across, side by side: every edge's walk is long and the loose corners are many, so
  // neither the walk nor a look at every loose corner is cheap for any edge (a few kilobytes as a link)
  const N = 5000, s = 1e4, p = [], t = [];
  for (let i = 0; i < N; i++) { p.push(3 * i, 0, 0, 3 * i + s, s, s, 3 * i, s, 0); t.push(3 * i, 3 * i + 1, 3 * i + 2); }
  const [ms, bytes] = await time(() => stl({ q: 1, p, t }));
  assert.equal(bytes.length, 84 + 50 * N, 'every triangle written');
  assert.ok(ms < 5000, `STL took ${ms.toFixed(0)} ms`);
});

test('with many loose corners elsewhere, the grid walk (slanted edge) and the box (square-on edge) each mend their T-junctions', () => {
  // 2,000 small open triangles far off make looking at every loose corner dearer than either grid search
  const decoys = Array.from({ length: 2000 }, (_, i) => [[1000 + 3 * i, 0, 0], [1001 + 3 * i, 0, 0], [1000 + 3 * i, 1, 0]]);
  const square = (s, cuts) => { // tjunction() turned so its long edge O-Q runs along x
    const O = [0, 0, 0], Q = [s, 0, 0], P = [0, 0, s], R = [0, s, 0];
    const row = [O, ...Array.from({ length: cuts }, (_, i) => [s * (i + 1) / (cuts + 1), 0, 0]), Q];
    const tris = [[O, Q, P], [P, Q, R], [O, P, R]];
    for (let i = 0; i < row.length - 1; i++) tris.push([row[i], R, row[i + 1]]);
    return tris;
  };
  for (const [name, part] of [['slanted', tjunction(50, 3)], ['square-on', square(50, 3)]]) {
    const out = mesh([...part, ...decoys]);
    assert.equal(out.tris.length, 3 + 4 + 3 + decoys.length, `${name}: the face along the edge is split at all three corners`);
    assert.equal(open(out).length, 3 * decoys.length, `${name}: only the far-off triangles are left open`);
  }
});

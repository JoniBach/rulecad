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
  assert.ok(a < 200, `STL took ${a.toFixed(0)} ms`);
  assert.ok(b < 200, `3MF took ${b.toFixed(0)} ms`);
});

test('a 10 m open diagonal triangle still writes, in bounded time', async () => {
  const s = 1e4, m = { q: 1, p: [0, 0, 0, s, s, s, 0, s, 0], t: [0, 1, 2] };
  const [a, bytes] = await time(() => stl(m));
  assert.equal(bytes.length, 84 + 50);
  assert.ok(a < 200, `STL took ${a.toFixed(0)} ms`);
});

test('a T-junction on a long diagonal edge is mended: the mesh comes out closed', async () => {
  for (const s of [10, 400, 1e4]) {
    const [ms, out] = await time(() => mesh(tjunction(s)));
    assert.equal(out.tris.length, 6, 'the face along the edge is split at the loose corner');
    assert.deepEqual(open(out), [], `closed at ${s} mm`);
    assert.ok(ms < 200, `mending at ${s} mm took ${ms.toFixed(0)} ms`);
  }
});

test('many loose corners along a 10 m diagonal edge, more than the grid walk is allowed: mended by the direct scan, in bounded time', async () => {
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

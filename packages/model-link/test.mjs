import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTriangles, encode, decode, triangles, stl, threemf, bambu3mf, filename, fromSTL } from '@rulecad/model-link';

const tris = [[[0, 0, 0], [10, 0, 0], [0, 10, 0]], [[0, 0, 0], [0, 10, 0], [0, 0, 10]]];
const model = { title: 'Wedge', version: '1.0.0', src: 'test/wedge@1.0.0', ...fromTriangles(tris) };

test('a model survives the round trip through a link', async () => {
  const back = await decode(await encode(model));
  assert.deepEqual(triangles(back).flat(2).map((c) => Math.round(c * 1000) / 1000), tris.flat(2));
  assert.equal(filename(back, 'stl'), 'wedge@1.0.0.stl');
});

test('STL and 3MF files, named by their generator', async () => {
  const back = await decode(await encode(model));
  const s = stl(back);
  assert.equal(s.length, 84 + 50 * 2);
  assert.match(new TextDecoder().decode(s.slice(0, 20)), /^rulecad /);
  assert.match(new TextDecoder().decode(stl(back, undefined, { generator: 'my-tool' }).slice(0, 20)), /^my-tool /);
  const z = await threemf(back);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50); // a ZIP
});

test('bambu3mf: objects made of parts, each on its filament slot', async () => {
  const z = await bambu3mf([{ name: 'Key', parts: [{ name: 'cap', triangles: tris, slot: 1 }, { name: 'legend', triangles: tris, slot: 2 }] }]);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
});

test('damaged, future and foreign links are refused', async () => {
  await assert.rejects(decode('1.AAAA'), /damaged/);
  await assert.rejects(decode('2.abc'), /newer page/);
  await assert.rejects(decode('x'), /isn't a model link/);
  await assert.rejects(decode(await encode({ ...model, t: [0, 1, 99] })), /broken/);
});

test('fromSTL reads what stl() writes, and text STL too', async () => {
  const back = await decode(await encode(model));
  const round = (t) => t.flat(2).map((c) => Math.round(c * 1000) / 1000);
  assert.deepEqual(round(fromSTL(stl(back))), round(tris));
  const ascii = `solid w\n${tris.map((t) => `facet normal 0 0 0\n outer loop\n${t.map((p) => `  vertex ${p.join(' ')}`).join('\n')}\n endloop\nendfacet`).join('\n')}\nendsolid w\n`;
  assert.deepEqual(fromSTL(new TextEncoder().encode(ascii)), tris);
  assert.throws(() => fromSTL(new TextEncoder().encode('hello')), /isn't an STL/);
});

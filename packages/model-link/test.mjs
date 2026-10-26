import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromTriangles, encode, decode, triangles, stl, threemf, bambu3mf, filename, fromSTL, frame, jointValues, placeItems, fromShapes } from '@rulecad/model-link';

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

test('a rules sheet travels as text rows, and a malformed one is refused', async () => {
  const sheet = [['plate', 'width', '40', 'mm', 'Fits the tray'], ['x1c', 'line', '0.42', 'mm', 'Line width', '', 'spec', 'https://example.org', '2026-10-11']];
  assert.deepEqual((await decode(await encode({ ...model, sheet }))).sheet, sheet);
  await assert.rejects(decode(await encode({ ...model, sheet: [['plate', 40]] })), /rules sheet/);
});

test('an assembly of five boards carries both drawings of each: ten flat views', async () => {
  const views = (n) => Array.from({ length: n }, (_, i) => [`board ${i >> 1} ${i % 2 ? 'Schematic' : 'Board: both sides'}`, '<svg/>']);
  assert.equal((await decode(await encode({ ...model, views: views(10) }))).views.length, 10);
  await assert.rejects(decode(await encode({ ...model, views: views(33) })), /33 flat views/);
});

test('fromSTL reads what stl() writes, and text STL too', async () => {
  const back = await decode(await encode(model));
  const round = (t) => t.flat(2).map((c) => Math.round(c * 1000) / 1000);
  assert.deepEqual(round(fromSTL(stl(back))), round(tris));
  const ascii = `solid w\n${tris.map((t) => `facet normal 0 0 0\n outer loop\n${t.map((p) => `  vertex ${p.join(' ')}`).join('\n')}\n endloop\nendfacet`).join('\n')}\nendsolid w\n`;
  assert.deepEqual(fromSTL(new TextEncoder().encode(ascii)), tris);
  assert.throws(() => fromSTL(new TextEncoder().encode('hello')), /isn't an STL/);
});

test('bambu3mf with a date gives the same bytes every time', async () => {
  const objects = [{ name: 'Key', parts: [{ name: 'cap', triangles: tris, slot: 1 }] }];
  const [a, b] = [await bambu3mf(objects, { date: '2026-01-01' }), await bambu3mf(objects, { date: '2026-01-01' })];
  assert.deepEqual(a, b);
});

test('motion: each joint type moves its child as it says, followers follow, and a link carries it', async () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], here = frame([0, 0, 0]), r = (m) => m.map((x) => Math.round(x * 1000) / 1000 + 0);
  const at = (type, v, extra = {}) => {
    const mo = { items: [['base', ...I], ['arm']], joints: [{ id: 'j', type, parent: 0, child: 1, a: frame([10, 0, 0]), b: here, dofs: v.map((x) => [-1000, 1000, x]), ...extra }] };
    return r(placeItems(mo, jointValues(mo))[1]);
  };
  assert.deepEqual(at('fixed', []), [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual(at('revolute', [90]), [0, -1, 0, 10, 1, 0, 0, 0, 0, 0, 1, 0], 'turned about the anchor\'s z');
  assert.deepEqual(at('prismatic', [5]), [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 5], 'slid along z');
  assert.deepEqual(at('cylindrical', [90, 5]), [0, -1, 0, 10, 1, 0, 0, 0, 0, 0, 1, 5]);
  assert.deepEqual(at('ball', [90, 0, 0]), [1, 0, 0, 10, 0, 0, -1, 0, 0, 1, 0, 0], 'turned about x');
  const path = [[0, 0, 0], [0, 0, 10], [10, 0, 10]];
  assert.deepEqual(at('path', [15], { path }), [0, 0, 1, 15, 0, 1, 0, 0, -1, 0, 0, 10], 'half way along the second leg, z along it');
  assert.deepEqual(at('path', [99], { path }).slice(3, 12).filter((_, i) => i % 4 === 0), [20, 0, 10], 'kept on the path');
  // A follower takes its leader's values, times its ratio, plus its offset; poses set values by name
  const mo = { items: [['base', ...I], ['a'], ['b']], poses: { open: { j: 30 } }, joints: [
    { id: 'j', type: 'revolute', parent: 0, child: 1, a: here, b: here, dofs: [[0, 90, 0]] },
    { id: 'k', type: 'revolute', parent: 0, child: 2, a: here, b: here, dofs: [[0, 180, 0]], follow: ['j', 2, 1] }] };
  assert.deepEqual(jointValues(mo, 'open'), { j: [30], k: [61] });
  assert.throws(() => jointValues(mo, 'shut'), /no pose "shut"/);
  // In a link: kept, and checked as data
  const m = { title: 'Arm', ...fromShapes([{ shape: 's', triangles: tris, matrix: I, name: 'a.body' }, { shape: 's', triangles: tris, matrix: I, name: 'b.body' }]), motion: { ...mo, part: [1, 2] } };
  assert.deepEqual((await decode(await encode(m))).motion.joints[1].follow, ['j', 2, 1]);
  await assert.rejects(decode(await encode({ ...m, motion: { ...m.motion, part: [1, 9] } })), /broken motion/);
  await assert.rejects(decode(await encode({ ...m, motion: { ...m.motion, joints: [{ ...mo.joints[0], type: 'constructor' }] } })), /broken motion/);
});

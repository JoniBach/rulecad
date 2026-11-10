import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromParts, fromTriangles, encode, decode, triangles, stl, threemf, bambu3mf, filename, fromSTL, frame, jointValues, placeItems, fromShapes } from '@rulecad/model-link';

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

test('a link is held to its limits before it is unpacked or copied out: far corners, a long title, many copies of a big shape', async () => {
  const far = { q: 1, p: [1e300, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 1, 2] };
  await assert.rejects(decode(await encode(far)), /from the origin/, 'its corners could send the file writers walking for ever');
  await assert.rejects(decode(await encode({ ...model, title: 'x'.repeat(5000) })), /broken title/);
  await assert.rejects(decode(await encode({ ...model, set: 5 })), /broken set/);
  await assert.rejects(decode(await encode({ ...model, q: '1' })), /bad grid size/);
  await assert.rejects(decode(await encode({ ...model, parts: [['a', 'part', 'a', 0, -3]] })), /broken parts list/);
  // 400 copies of a 2,000-triangle shape: refused by counting, not by building 800,000 triangles first
  const p = [], t = [];
  for (let i = 0; i < 2000; i++) { p.push(i, 0, 0, i, 1, 0, i, 0, 1); t.push(3 * i, 3 * i + 1, 3 * i + 2); }
  const many = { title: 'many', shapes: [{ q: 1, p, t, label: 'big', role: 'part' }], place: Array.from({ length: 400 }, (_, n) => [0, 1, 0, 0, n, 0, 1, 0, 0, 0, 0, 1, 0]) };
  const t0 = Date.now();
  await assert.rejects(decode(await encode(many)), /model too big for a link/);
  assert.ok(Date.now() - t0 < 2000, `refused in ${Date.now() - t0} ms`);
});

test('a 3MF carries the model\'s own title, and text in it is escaped; parts are kept by place or by a test', async () => {
  const two = fromParts([{ name: 'a', triangles: tris }, { name: 'b', triangles: tris.map((tri) => tri.map(([x, y, z]) => [x + 20, y, z])) }]);
  const file = await bambu3mf([{ name: 'Tray & lid', parts: [{ name: 'tray', triangles: tris }] }], { title: 'Tray <1>', generator: 'gen</metadata><evil/>' });
  // the zip's entries, unpacked: each local header gives its name and its packed size
  const { inflateRawSync } = await import('node:zlib'), dv = new DataView(file.buffer, file.byteOffset), entries = {};
  for (let at = 0; dv.getUint32(at, true) === 0x04034b50;) {
    const method = dv.getUint16(at + 8, true), packed = dv.getUint32(at + 18, true), nameLen = dv.getUint16(at + 26, true), start = at + 30 + nameLen + dv.getUint16(at + 28, true);
    const body = file.subarray(start, start + packed);
    entries[new TextDecoder().decode(file.subarray(at + 30, at + 30 + nameLen))] = new TextDecoder().decode(method ? inflateRawSync(body) : body);
    at = start + packed;
  }
  const text = entries['3D/3dmodel.model'];
  assert.match(entries['Metadata/model_settings.config'], /value="Tray &amp; lid"/);
  assert.match(text, /<metadata name="Title">Tray &lt;1&gt;<\/metadata>/);
  assert.doesNotMatch(text, /mirror-cad|<evil\/>/);
  const count = (bytes) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true);
  assert.equal(count(stl(two)), 4);
  assert.equal(count(stl(two, new Set([1]))), 2);
  assert.equal(count(stl(two, (part) => part[0] === 'a')), 2);
});

test('check gives findings, the kit\'s one result shape', async () => {
  const { check } = await import('@rulecad/model-link');
  assert.deepEqual(check(null), [{ level: 'fail', text: 'no model in the link', code: 'link.data' }]);
  assert.deepEqual(check({ q: 1, p: [0, 0, 0, 1, 0, 0, 0, 1, 0], t: [0, 1, 2] }), []);
});

test('STL edge cases: a binary file of NaNs is damaged, an upper-case text STL is read, a quad is split into triangles', async () => {
  const { fromSTL, fromTriangles } = await import('@rulecad/model-link');
  const bin = new Uint8Array(84 + 50); new DataView(bin.buffer).setUint32(80, 1, true); for (let k = 0; k < 9; k++) new DataView(bin.buffer).setFloat32(84 + 12 + k * 4, NaN, true);
  assert.throws(() => fromSTL(bin), /damaged/);
  const upper = 'SOLID T\nFACET NORMAL 0 0 1\nOUTER LOOP\nVERTEX 0 0 0\nVERTEX 1 0 0\nVERTEX 0 1 0\nENDLOOP\nENDFACET\nENDSOLID T\n';
  assert.deepEqual(fromSTL(new TextEncoder().encode(upper)), [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
  const m = fromTriangles([[[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]]);
  assert.equal(m.t.length, 6, 'a quad is two triangles');
  assert.throws(() => fromTriangles([[[0, 0, 0], [1, 0, 0]]]), /three corners or more/);
});

test('a board\'s fab zip rides in its link, by name and bytes; a name that could leave its folder, or bytes that aren\'t base64, are refused', async () => {
  const { encode, decode, check, fromTriangles } = await import('@rulecad/model-link');
  const m = { title: 'board', ...fromTriangles([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]), fab: [{ name: 'module@0.7.1-fab.zip', zip: Buffer.from('PK').toString('base64') }] };
  assert.deepEqual((await decode(await encode(m))).fab, m.fab);
  assert.deepEqual(check(m), []);
  for (const fab of [[{ name: '../x.zip', zip: 'AA==' }], [{ name: 'x.zip', zip: '<script>' }], [{ name: 'x.txt', zip: 'AA==' }], { name: 'x.zip' }]) assert.deepEqual(check({ ...m, fab }).map((f) => f.text), ['broken fab files']);
});

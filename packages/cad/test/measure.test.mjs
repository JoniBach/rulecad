// cad's tests of cad measure, cad match and cad measured: models measured, and coupons' results written into rule sets. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { workspace, object, railPart, BIN, CAD } from './helpers.mjs';

test('mesh: the stretches with the same section, lines along a part, and STL and 3MF files read back', async () => {
  const m = await import('../lib/mesh.mjs');
  const tris = await railPart();
  const runs = m.profiles(tris, 0).map((r) => [r.from, r.to, r.shape]);
  assert.deepEqual(runs, [[0, 10, 0], [10, 18, 1], [18, 22, 2], [22, 30, 1], [30, 40, 0]], 'plate, key, notch, key, plate: the same sections numbered alike');
  const key = m.profiles(tris, 0)[1];
  assert.deepEqual(key.bands.map((b) => [b.from, b.to, b.pieces]), [[0, 2, 1], [2, 5, 1]], 'a step where the key stands on the plate splits the bands');
  assert.deepEqual(m.spans(tris, 0, [0, 4]).map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]), [[10, 18], [22, 30]]);
  // binary STL, ASCII STL and our own 3MF, read back
  const bin = Buffer.alloc(84 + tris.length * 50);
  bin.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.forEach((v, j) => v.forEach((x, k) => bin.writeFloatLE(x, 84 + i * 50 + 12 + j * 12 + k * 4))));
  const ascii = `solid t\n${tris.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((v) => `vertex ${v.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid t\n`;
  const { threemf } = await import('../lib/threemf.mjs');
  const zip = Buffer.from(await threemf([{ name: 'rail', parts: [{ name: 'body', triangles: tris, slot: 1 }] }]));
  for (const read of [m.readStl(bin), m.readStl(Buffer.from(ascii)), m.read3mf(zip)]) {
    assert.equal(read.length, tris.length);
    assert.deepEqual(m.bounds(read).size.map((x) => Math.round(x * 100) / 100), [40, 10, 5]);
  }
  // laid back over itself after a quarter turn and a shift
  const moved = m.turn(tris, m.parsePlacement('rz90').M, [5, -7, 3]);
  assert.ok(m.align(moved, tris).score < 0.01, 'found the turn and shift back');
});

test('cad measure and cad match: a model measured into draft rules, and a design checked against it both ways', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    cad('export', 'bathroom/soap-tray');
    const file = 'exports/bathroom/soap-tray@0.1.0.3mf';
    const same = cad('match', 'bathroom/soap-tray', file, '--no-pictures', '--samples', '3000');
    assert.match(same, /✓ the design's surface: 95% within 0 mm/);
    assert.match(same, /✓ the reference's surface/);
    const wider = cad.refused("✗ the design's surface", 'match', 'bathroom/soap-tray', file, '--no-pictures', '--samples', '3000', '--set', 'width=60');
    assert.match(wider, /✗ the design's surface/);
    assert.match(wider, /outside the reference \(extra material\)/);
    const measured = cad('measure', file, '--no-pictures', '--rules', 'tray', '--licence', 'CC BY-NC-SA 4.0', '--line', '0,1');
    assert.match(measured, /a closed solid/);
    assert.match(measured, /40 × 30 × 10 mm/);
    assert.match(measured, /licence "CC BY-NC-SA 4.0" limits reuse/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/tray.json'), 'utf8')).rules;
    assert.equal(rules.size_x.value, 40);
    assert.equal(rules.size_x.kind, 'derived');
    assert.equal(rules.size_x.licence, 'CC BY-NC-SA 4.0');
    cad.refused(/already exists/, 'measure', file, '--no-pictures', '--rules', 'tray');
  } finally { done(); }
});

test('cad measure --profile: a beam\'s section from a model or a DXF, as a draft profile set with its outline, its slots matched to a family', async () => {
  const { profileModel, outline, slotModel } = await import('@rulecad/frames'), jscad = (await import('@jscad/modeling')).default, { readDxf } = await import('../lib/profilemeasure.mjs');
  const { ws, cad, done } = workspace();
  try {
    const run = (...a) => cad.run(...a), read = (p) => JSON.parse(fs.readFileSync(path.join(ws, p), 'utf8'));
    // a beam built from the kit's own outline: the outline extruded with JSCAD, off the origin, written as a binary STL
    const stl = (file, loops, length = 90, [dx, dy] = [0, 0]) => {
      const solid = jscad.extrusions.extrudeLinear({ height: length }, jscad.primitives.polygon({ points: loops.map((l) => l.map(([x, y]) => [x + dx, y + dy])) }));
      const tris = jscad.geometries.geom3.toPolygons(solid).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]])), buf = Buffer.alloc(84 + tris.length * 50);
      buf.writeUInt32LE(tris.length, 80); tris.forEach((t, i) => t.forEach((v, k) => v.forEach((c, a) => buf.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4)))); fs.writeFileSync(path.join(ws, file), buf);
    };
    const kit = profileModel('2020-misumi-hfs5'), family = slotModel('slot-6-misumi');
    stl('hfs5.stl', outline(kit).loops, 90, [30, 12]);
    const out = cad('measure', 'hfs5.stl', '--profile', 'profile-2020-measured', '--no-pictures', '--source', 'https://example.com/hfs5-2020.step', '--licence', 'CC BY-NC-SA 4.0');
    assert.match(out, /hfs5\.stl: the section across z at 45, the middle of a stretch of 90 mm that keeps it/); assert.match(out, /20 × 20 mm, 1 hole, area 182\.49 mm²/);
    assert.match(out, /slot A × 4 \(top, bottom, front, back\): opening 6, lip 2, 12 under the lips, 6 deep, floor 5\.9\d?\n {4}matches slot-6-misumi within 0(\.0\d)? mm/);
    assert.match(out, /1 bore Ø4\.2\d? at the cells' middles/); assert.match(out, /licence "CC BY-NC-SA 4\.0" limits reuse: measurements are facts, but the outline is the model's shape\. Keep it in this workspace/);
    assert.match(out, /draft profile: rules\/profile-2020-measured\.json \(8 values, kind derived\)\n {2}outline: {7}rules\/outlines\/profile-2020-measured\.json \(2 loops\)/);
    // the draft: each figure derived, with the model's source and licence; the slot named by the family it matched
    const set = read('rules/profile-2020-measured.json'), r = set.rules;
    assert.deepEqual(Object.keys(r), ['family', 'series', 'cells_across', 'cells_up', 'width', 'height', 'slot', 'bore_diameter']); assert.equal(set.part, 'profile');
    assert.deepEqual([r.family.value, r.series.value, r.cells_across.value, r.cells_up.value, r.width.value, r.height.value, r.slot.value, Math.round(r.bore_diameter.value * 10) / 10], ['t-slot', 20, 1, 1, 20, 20, 'slot-6-misumi', 4.2]);
    for (const [k, x] of Object.entries(r)) assert.deepEqual([x.kind, x.source, x.licence], ['derived', 'https://example.com/hfs5-2020.step', 'CC BY-NC-SA 4.0'], k);
    assert.match(set._doc, /The outline is the model's shape: it stays in this workspace/);
    // the outline: in the workspace, with its source and licence, about the middle of its envelope whatever the model's origin
    const o = read('rules/outlines/profile-2020-measured.json'), xs = o.loops.flat().map((p) => p[0]), ys = o.loops.flat().map((p) => p[1]);
    assert.deepEqual([o.source, o.licence, o.unit, o.loops.length], ['https://example.com/hfs5-2020.step', 'CC BY-NC-SA 4.0', 'mm', 2]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-10, 10, -10, 10]);
    assert.deepEqual(fs.readdirSync(new URL('../rules/outlines/', CAD)), ['profile-custom.json'], 'nothing measured goes into the kit');
    // the slot found, against the set the beam was drawn from: within 0.1 mm, figure by figure
    const drawing = fs.readFileSync(path.join(ws, '.preview/measure/profile-2020-measured-profile.svg'), 'utf8');
    const got = drawing.match(/opening ([\d.]+), lip ([\d.]+), ([\d.]+) under the lips, ([\d.]+) deep: matches slot-6-misumi/).slice(1).map(Number);
    [family.opening, family.lip, family.cavityWidth, family.cavityDepth].forEach((want, i) => assert.ok(Math.abs(got[i] - want) <= 0.1, `slot figure ${i}: ${got[i]} against ${want}`));
    assert.match(drawing, /What was found \(check each against the bar in hand\)/); assert.match(drawing, /1 {2}bore Ø4\.2\d? at 0, 0/); assert.match(drawing, /the outline stays in this workspace/);
    // and it is a profile the kit can use: it checks, and draws from the measured outline
    assert.match(cad('rules', 'check', 'profile-2020-measured'), /^1 of 1 rule sets pass\n$/);
    cad('rules', 'draw', 'profile-2020-measured'); assert.match(fs.readFileSync(path.join(ws, 'profile-2020-measured.svg'), 'utf8'), />drawn from its outline: https:\/\/example\.com\/hfs5-2020\.step</);
    cad.refused(/already exists \(--force to replace them\)/, 'measure', 'hfs5.stl', '--profile', 'profile-2020-measured', '--no-pictures');

    // ---- the same section from a DXF: the outside as lines one by one in any order, the bore a CIRCLE, in inches ----
    const loops = outline(kit).loops, dxf = (entities, units = 4) => ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(units), '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
    const lines = (loop, k = 1) => loop.map((p, i) => [p, loop[(i + 1) % loop.length]]).sort((a, b) => a[0][0] * 7 + a[0][1] - b[0][0] * 7 - b[0][1]).flatMap(([[x, y], [x2, y2]], i) => (i % 2 ? ['0', 'LINE', '8', '0', '10', String(x * k), '20', String(y * k), '11', String(x2 * k), '21', String(y2 * k)] : ['0', 'LINE', '8', '0', '10', String(x2 * k), '20', String(y2 * k), '11', String(x * k), '21', String(y * k)]));
    fs.writeFileSync(path.join(ws, 'section.dxf'), dxf([...lines(loops[0], 1 / 25.4), '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', String(2.1 / 25.4), '0', 'TEXT', '1', 'HFS5-2020'], 1));
    const fromDxf = cad('measure', 'section.dxf', '--profile', 'profile-2020-dxf', '--no-pictures');
    assert.match(fromDxf, /section\.dxf: the DXF's outline\n {2}its units are inches: turned into mm\n {2}passed over: 1 TEXT\n {2}20 × 20 mm, 1 hole/);
    assert.match(fromDxf, /opening 6, lip 2, 12 under the lips, 6 deep, floor 5\.9\d?\n {4}matches slot-6-misumi within 0(\.0\d)? mm/); assert.match(fromDxf, /1 bore Ø4\.2 at the cells' middles/); assert.match(fromDxf, /no --licence given: say what terms the model came under/);
    const d = read('rules/profile-2020-dxf.json').rules; assert.deepEqual([d.slot.value, d.bore_diameter.value, d.width.value, d.slot.licence], ['slot-6-misumi', 4.2, 20, undefined]);
    assert.match(cad('rules', 'check', 'profile-2020-dxf'), /^1 of 1 rule sets pass\n$/);
    cad.refused(/a DXF is a drawing of a section, not a model: cad measure <section\.dxf> --profile <name>/, 'measure', 'section.dxf');
    // the reader on its own: a polyline's bulges are arcs, an ARC and lines join into a loop, and what it cannot read it refuses by name
    const rounded = readDxf(dxf(['0', 'LWPOLYLINE', '90', '8', '70', '1', ...[[-8, -5, 0], [8, -5, Math.tan(Math.PI / 8)], [10, -3, 0], [10, 3, Math.tan(Math.PI / 8)], [8, 5, 0], [-8, 5, Math.tan(Math.PI / 8)], [-10, 3, 0], [-10, -3, Math.tan(Math.PI / 8)]].flatMap(([x, y, b]) => ['10', String(x), '20', String(y), '42', String(b)])]));
    const area = (l) => Math.abs(l.reduce((sum, [x, y], i) => sum + x * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * y, 0) / 2);
    assert.ok(Math.abs(area(rounded.loops[0]) - (20 * 10 - (4 - Math.PI) * 4)) < 0.03, `a 20 x 10 rectangle with corners of radius 2: ${area(rounded.loops[0])}`);
    const dee = readDxf(dxf(['0', 'ARC', '10', '0', '20', '0', '40', '5', '50', '270', '51', '90', '0', 'LINE', '10', '0', '20', '5', '11', '0', '21', '-5'])); assert.ok(Math.abs(area(dee.loops[0]) - (Math.PI * 25) / 2) < 0.03, `a half disc from an arc and a line: ${area(dee.loops[0])}`);
    assert.throws(() => readDxf(dxf(['0', 'SPLINE', '10', '0', '20', '0'])), /the DXF has a spline \(SPLINE\), which this does not read: export the section as lines, arcs and polylines/);
    assert.throws(() => readDxf(dxf(['0', 'ELLIPSE', '10', '0', '20', '0'])), /an ellipse \(ELLIPSE\)/);
    assert.throws(() => readDxf(dxf(['0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0', '0', 'LINE', '10', '10', '20', '0', '11', '10', '21', '10', '0', 'LINE', '10', '10', '20', '10', '11', '0', '21', '0.5'])), /the DXF's outline is not closed: a run of 3 lines and arcs ends 0\.5 mm from where it starts, at 0, 0\.5/);
    assert.throws(() => readDxf(dxf(lines(loops[0]), 2)), /the DXF's units \(\$INSUNITS 2\) are not ones this reads/); assert.throws(() => readDxf('hello\nworld\n'), /not a DXF/);

    // ---- a slot no family fits: drafted as a family of its own, which the profile names ----
    const odd = profileModel('2020-misumi-hfs5', {}, { sets: { 'slot-6-misumi': { name: 'slot-6-misumi', part: 'slot', rules: Object.fromEntries(Object.entries({ opening: 7, lip_thickness: 2.5, cavity_width: 11.4, cavity_depth: 5.6, floor_width: 6.4, flank_angle: 45 }).map(([k, value]) => [k, { value }])) } } });
    stl('odd.stl', outline(odd).loops, 60);
    const drafted = cad('measure', 'odd.stl', '--profile', 'profile-2020-odd', '--no-pictures');
    assert.match(drafted, /opening 7, lip 2\.5, 11\.4 under the lips, 5\.6 deep, floor 6\.4\d?\n {4}no slot family within 0\.1 mm \(nearest slot-[a-z0-9-]+, 0\.\d+ off\): drafted as slot-7-2020-odd/); assert.match(drafted, /draft slot: {4}rules\/slot-7-2020-odd\.json/);
    const slot = read('rules/slot-7-2020-odd.json'); assert.equal(slot.part, 'slot'); assert.deepEqual([slot.rules.opening.value, slot.rules.lip_thickness.value, slot.rules.cavity_width.value, slot.rules.cavity_depth.value, slot.rules.opening.kind], [7, 2.5, 11.4, 5.6, 'derived']);
    assert.ok(Math.abs(slot.rules.flank_angle.value - 45) < 1.5 && Math.abs(slot.rules.floor_width.value - 6.4) < 0.1); assert.equal(read('rules/profile-2020-odd.json').rules.slot.value, 'slot-7-2020-odd');
    assert.match(cad('rules', 'check', 'profile-2020-odd', 'slot-7-2020-odd'), /^2 of 2 rule sets pass\n$/);
    // a wider tolerance takes the nearest family where a person says that is near enough
    assert.match(cad('measure', 'odd.stl', '--profile', 'profile-2020-near', '--no-pictures', '--tol', '1.2'), /matches slot-[a-z0-9-]+ within [01](\.\d+)? mm/);

    // ---- a V-slot rail of two cells standing up: turned to lie flat, its track found; a plain tube has no slot at all ----
    stl('v2040.stl', outline(profileModel('2040-openbuilds')).loops.map((l) => l.map(([x, y]) => [-y, x])), 70);
    const v = cad('measure', 'v2040.stl', '--profile', 'profile-2040-v', '--no-pictures');
    assert.match(v, /turned a quarter turn to lie flat\n {2}40 × 20 mm, 3 holes/); assert.match(v, /slot A × 6 \(top, bottom, front, back\): opening 6\.25, lip 1\.8\d?, 11 under the lips, 6\.1 deep, floor 5\.7\d?, V mouth 9\.16 at 9[01](\.\d+)?°\n {4}matches slot-6-openbuilds/);
    assert.match(v, /2 bores Ø4\.2\d? at the cells' middles/); assert.match(v, /1 hollow: 12\.2 × 16\.4 \(in the outline, not in the rules\)/);
    const vr = read('rules/profile-2040-v.json').rules; assert.deepEqual([vr.family.value, vr.cells_across.value, vr.cells_up.value, vr.series.value, vr.slot.value], ['v-slot', 2, 1, 20, 'slot-6-openbuilds']);
    stl('tube.stl', outline(profileModel('tube', { width: 30, height: 20, wall: 2 })).loops, 50);
    const tube = cad('measure', 'tube.stl', '--profile', 'profile-tube-measured', '--no-pictures'); assert.match(tube, /30 × 20 mm, 1 hole, area 184 mm²/); assert.match(tube, /no slot for a nut found: written as a custom profile/);
    assert.equal(read('rules/profile-tube-measured.json').rules.family.value, 'custom'); assert.match(cad('rules', 'check', 'profile-tube-measured'), /^1 of 1 rule sets pass\n$/);
    // refusals, by name
    cad.refused(/--profile <name>: lower case, digits, - and _/, 'measure', 'hfs5.stl', '--profile', 'Profile 2020');
    cad.refused(/--profile needs a value after it/, 'measure', 'hfs5.stl', '--profile');
    cad.refused(/--tol is how close a slot must be to a known family, in mm, above 0/, 'measure', 'hfs5.stl', '--profile', 'x', '--tol', '0');
    fs.writeFileSync(path.join(ws, 'beam.step'), 'ISO-10303-21;'); cad.refused(/a profile is measured from an STL or 3MF model of the beam, or a DXF of its section \(not \.step\)/, 'measure', 'beam.step', '--profile', 'x');
    assert.equal(run('measure', 'nothing.stl', '--profile', 'x').status, 1);
  } finally { done(); }
});

test('cad measured: a measurement where the estimate was, what moved, the ledger, and the table of what is still assumed', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.json'), JSON.stringify({ name: 'block', title: 'Block', version: '0.1.0', uses: ['x1c'], engine: 'manifold', variables: { side: { value: '200 * x1c.press', unit: 'mm', rule: 'A side, from the press' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.side], center: [v.side / 2, v.side / 2, v.side / 2] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/one.json'), JSON.stringify({ title: 'One', kind: 'fit', items: [{ id: 'a', object: 'block' }, { id: 'b', object: 'block', at: [20, 0, 0] }], fits: [{ a: 'a', b: 'b', min: 0, max: 100, note: 'apart' }] }));
    const first = cad('check', 'home/one');
    assert.match(first, /uses estimates, not measurements: x1c\.press/); assert.match(first, /cad measured home\/one <name>=<value>/);
    assert.match(cad('measured', 'home/one', '--table'), /\| `x1c\.press` \| .*\| `cad measured home\/one x1c\.press=<value>` \|/);
    const out = cad('measured', 'home/one', 'x1c.press=0.08', '--source', 'seats coupon');
    assert.match(out, /x1c\.press: measured 0\.08 mm, predicted 0\.05 \(estimate\), ratio 1\.6/); assert.match(out, /apart: closest gap 4 mm/);
    const rule = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules.press;
    assert.equal(rule.value, 0.08); assert.equal(rule.kind, 'measured'); assert.equal(rule.source, 'seats coupon');
    assert.doesNotMatch(cad('check', 'home/one'), /x1c\.press\. /, 'no longer an estimate');
    assert.match(cad('history', 'home/one'), /x1c\.press: measured 0\.08/);
    assert.match(cad('history', 'home'), /ratio 1\.6/);
    cad.refused(/x1c has no rule "nothing"/, 'measured', 'home/one', 'x1c.nothing=1');
    cad.refused(/is in mm, and this is in in/, 'measured', 'home/one', 'x1c.press=2', '--unit', 'in');
    cad.refused(/no assembly "home\/none"/, 'measured', 'home/none', 'x1c.press=2');
  } finally { done(); }
});

test('cad measured from the slot coupon: the slot fit lands in the printer\'s rule set, a slot\'s caliper figures in the workspace\'s copy of its set, and a carrier is drawn from both', () => {
  const { ws, cad, done } = workspace();
  try {
    const js = `export function main (v) {
  const m = v.frames.carrierModel('slot-8', { thread: 'M5', printer: v.x1c })
  return v.frames.carrier(m, { pose: 'print', printer: v.x1c })
}
`;
    object(ws, 'home/carrier', { uses: ['x1c'], engine: 'manifold', variables: {} }, js);
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['carrier'] }));
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/coupon.json'), JSON.stringify({ title: 'Coupon', kind: 'fit', items: [{ id: 'carrier', object: 'carrier' }] }));
    // the carrier's width across the slot: the cavity less the clearance each side
    const across = () => Number(cad('check', 'home/carrier').match(/([\d.]+) × ([\d.]+) × ([\d.]+) mm, fits the bed/)[2]);
    assert.equal(across(), 16.1, 'before: slot-8\'s community cavity 16.5 less x1c.fit 0.2 each side');
    const kit = ['x1c', 'slot-8'].map((n) => fs.readFileSync(new URL(`../rules/${n}.json`, CAD), 'utf8'));
    const own = (n) => path.join(ws, `rules/${n}.json`), measuredIn = (n, k) => fs.existsSync(own(n)) && JSON.parse(fs.readFileSync(own(n), 'utf8')).rules[k]?.kind === 'measured';
    // figures that make no slot are refused, and nothing is written
    cad.refused(/slot-8: .*cavity_width is wider than opening, 17/, 'measured', 'home/coupon', 'x1c.slot_fit=0.15', 'slot-8.opening=17');
    assert.ok(!measuredIn('x1c', 'slot_fit') && !measuredIn('slot-8', 'opening'), 'nothing written');
    const out = cad('measured', 'home/coupon', 'x1c.slot_fit=0.15', 'x1c.printed_slot_fit=0.25', 'slot-8.opening=8.1', 'slot-8.cavity_width=16.3');
    assert.match(out, /x1c\.slot_fit: measured 0\.15 mm, predicted 0\.2 \(x1c\.fit, community\), ratio 0\.75/);
    assert.match(out, /x1c\.printed_slot_fit: measured 0\.25 mm, predicted 0\.2/);
    assert.match(out, /slot-8\.opening: measured 8\.1 mm, predicted 8 \(community\)/);
    const x1c = JSON.parse(fs.readFileSync(own('x1c'), 'utf8')).rules, slot = JSON.parse(fs.readFileSync(own('slot-8'), 'utf8')).rules, today = new Date().toISOString().slice(0, 10);
    for (const r of [x1c.slot_fit, x1c.printed_slot_fit, slot.opening, slot.cavity_width]) { assert.equal(r.kind, 'measured'); assert.equal(r.checked, today); assert.equal(r.unit, 'mm'); assert.match(r.source, /slot coupon/); }
    assert.match(x1c.slot_fit.rule, /slid the beam's length by hand without rattling/); assert.match(slot.opening.source, /calipers on your own beam/);
    assert.deepEqual([x1c.slot_fit.value, slot.opening.value, slot.cavity_width.value, slot.cavity_depth.kind], [0.15, 8.1, 16.3, 'community'], 'only what was measured');
    assert.deepEqual(['x1c', 'slot-8'].map((n) => fs.readFileSync(new URL(`../rules/${n}.json`, CAD), 'utf8')), kit, 'the kit\'s own rule sets are untouched');
    // drawn again from them: the measured cavity less the measured fit each side
    assert.equal(across(), 16, '16.3 less 0.15 each side');
    assert.match(cad('history', 'home/coupon'), /x1c\.slot_fit: measured 0\.15 mm, predicted 0\.2/);
  } finally { done(); }
});

test('cad measured from the fixings coupon: each result lands in the printer\'s rule set with its source and date, and a pilot then rests on a measured rule', () => {
  const { ws, cad, done } = workspace();
  try {
    const js = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const f = v.fixings, top = v.thick
  return v.ops.subtract(cuboid({ size: [v.width, v.width, top], center: [0, 0, top / 2] }), f.hole('M4', { kind: 'pilot', at: [0, 0, top] }), f.nutPocket('M3', { at: [v.width / 2 - top, 0, top] }))
}
`;
    object(ws, 'home/plate', { uses: ['x1c'], engine: 'manifold', variables: { width: { value: 30, unit: 'mm', rule: 'Room for both' }, thick: { value: 'x1c.layer * 40', unit: 'mm', rule: 'The pilot and a floor' } } }, js);
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['plate'] }));
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/coupon.json'), JSON.stringify({ title: 'Coupon', kind: 'fit', items: [{ id: 'plate', object: 'plate' }] }));
    const drawn = () => JSON.parse(cad('check', 'home/plate', '--json')).findings;
    const pilot = (f) => f.find((x) => x.code === 'hole.drawn' && x.refs.thread === 'M4'), pocket = (f) => f.find((x) => x.code === 'nutPocket.drawn');
    assert.deepEqual([pilot(drawn()).refs.rule, pilot(drawn()).refs.kind], ['m4.pilot', 'community'], 'before: the thread\'s starting figure');
    const kit = fs.readFileSync(new URL('../rules/x1c.json', CAD), 'utf8');
    // a refusal writes nothing: the flank is one of the two forms the coupon prints
    cad.refused(/x1c\.thread_flank is 45 or 60: the flank forms the coupon prints \(got 50\)/, 'measured', 'home/coupon', 'x1c.pilot_m4=3.85', 'x1c.thread_flank=50');
    assert.ok(!fs.existsSync(path.join(ws, 'rules/x1c.json')) || !JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules.pilot_m4, 'nothing written');
    const out = cad('measured', 'home/coupon', 'x1c.pilot_m4=3.85', 'x1c.nut_fit=0.05', 'x1c.thread_gap=0.25', 'x1c.thread_flank=60');
    assert.match(out, /x1c\.pilot_m4: measured 3\.85 mm, predicted 3\.75 \(m4\.pilot, community\), ratio 1\.0267/);
    assert.match(out, /x1c\.nut_fit: measured 0\.05 mm, predicted 0 \(snug, no clearance\)/);
    assert.match(out, /x1c\.thread_gap: measured 0\.25 mm, predicted 0\.2 \(estimate\), ratio 1\.25/);
    assert.match(out, /x1c\.thread_flank: measured 60 °, predicted 45 \(flanks: printed, the default\)/);
    // in the workspace's copy of the printer's rule set, each with its rule, source and date
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules, today = new Date().toISOString().slice(0, 10);
    for (const k of ['pilot_m4', 'nut_fit', 'thread_gap', 'thread_flank']) {
      assert.equal(rules[k].kind, 'measured', k); assert.equal(rules[k].checked, today, k); assert.match(rules[k].source, /fixings coupon|bench/, k); assert.ok(rules[k].rule.length > 40, k);
    }
    assert.deepEqual([rules.pilot_m4.value, rules.pilot_m4.unit, rules.nut_fit.value, rules.thread_gap.value, rules.thread_flank.value, rules.thread_flank.unit], [3.85, 'mm', 0.05, 0.25, 60, '°']);
    assert.match(rules.pilot_m4.rule, /M4 screw to form its own thread in PLA/); assert.match(rules.thread_flank.rule, /designs still draw flanks: 'printed'/);
    assert.equal(fs.readFileSync(new URL('../rules/x1c.json', CAD), 'utf8'), kit, 'the kit\'s own rule set is untouched');
    // fixings.hole('M4', { kind: 'pilot' }) now rests on the measured rule, and the nut pocket takes the measured fit
    const after = drawn();
    assert.deepEqual([pilot(after).values.diameter, pilot(after).refs.rule, pilot(after).refs.kind], [3.85, 'x1c.pilot_m4', 'measured']);
    assert.match(pilot(after).text, /an M4 pilot drawn 3\.85 mm: it rests on x1c\.pilot_m4 \(3\.85 mm\), a measured rule, as drawn/);
    assert.ok(!after.some((x) => x.code === 'hole.material'), 'the measured pilot names the project\'s plastic');
    assert.equal(pocket(after).values.flats, 5.65, 'm3.nut_flats 5.5, x1c.hole_comp 0.1 and x1c.nut_fit 0.05');
    // the ledger: predicted against measured
    const history = cad('history', 'home/coupon');
    assert.match(history, /predicted against measured:/); assert.match(history, /x1c\.pilot_m4: measured 3\.85 mm, predicted 3\.75/);
    // a rule the coupon does not measure, and no rule given, is still refused by name
    cad.refused(/x1c has no rule "pilot_m7"/, 'measured', 'home/coupon', 'x1c.pilot_m7=3');
  } finally { done(); }
});

test('cad measured from the holds coupon: each pin, socket and magnet fit, the snap pins\' barb and a plastic\'s strength across its layers round-trip, and a figure no fit can be is refused', () => {
  const { ws, cad, done } = workspace();
  try {
    // a plate with a dowel's press hole and an 8x3 magnet's press pocket, drawn from the printer's rules
    const js = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const f = v.fixings, top = v.thick
  return v.ops.subtract(cuboid({ size: [v.width, v.width, top], center: [0, 0, top / 2] }), f.pinHole('dowel 3x12', { fit: 'press', at: [-v.apart, 0, top], depth: v.deep }), f.magnetSeat('disc magnet 8x3', { fit: 'press', at: [v.apart, 0, top] }))
}
`;
    object(ws, 'home/plate', { uses: ['x1c'], engine: 'manifold', variables: { width: { value: 30, unit: 'mm', rule: 'Room for both' }, thick: { value: 'x1c.layer * 40', unit: 'mm', rule: 'The holes and a floor' }, deep: { value: 6, unit: 'mm', rule: 'The dowel\'s hole' }, apart: { value: 7, unit: 'mm', rule: 'Each from the middle' } } }, js);
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['plate'] }));
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/coupon.json'), JSON.stringify({ title: 'Coupon', kind: 'fit', items: [{ id: 'plate', object: 'plate' }] }));
    const drawn = () => JSON.parse(cad('check', 'home/plate', '--json')).findings;
    const hole = (f) => f.find((x) => x.code === 'pin.hole').values.diameter;
    // before: 3 + x1c.hole_comp 0.1 - x1c.pin_press 0.05 = 3.05 mm
    assert.equal(hole(drawn()), 3.05);
    const own = (n) => path.join(ws, `rules/${n}.json`), written = (n, k) => fs.existsSync(own(n)) && JSON.parse(fs.readFileSync(own(n), 'utf8')).rules[k]?.kind === 'measured';
    // refused by name, with what would be accepted, and nothing written: a diameter given for a clearance, and a strength
    // across the layers above PLA's 39 MPa along them
    cad.refused(/x1c\.pin_press is from 0 to 0\.3 mm: how much smaller a hole is drawn than the pin it grips, .* \(got 3\)/, 'measured', 'home/coupon', 'x1c.snap_clearance=0.15', 'x1c.pin_press=3');
    cad.refused(/x1c\.snap_clearance is above 0 and up to 0\.5 mm: its gap is drawn with no hole compensation, so at 0 the printed socket comes out smaller than the peg/, 'measured', 'home/coupon', 'x1c.snap_clearance=0');
    cad.refused(/pla\.strength_z is above 0 and no more than pla\.strength, 39 MPa: a print holds less across its layers than along them/, 'measured', 'home/coupon', 'pla.strength_z=45');
    assert.ok(!written('x1c', 'snap_clearance') && !written('pla', 'strength_z'), 'nothing written');
    const out = cad('measured', 'home/coupon', 'x1c.snap_clearance=0.15', 'x1c.pin_press=0.1', 'x1c.pin_slip=0.25', 'x1c.magnet_press=0.05', 'x1c.magnet_glue=0.15', 'x1c.magnet_crush=0.3', 'x1c.snap_barb=0.5', 'pla.strength_z=21.5');
    // each against what the kit drew it from
    assert.match(out, /x1c\.snap_clearance: measured 0\.15 mm, predicted 0\.2 \(estimate\), ratio 0\.75/);
    assert.match(out, /x1c\.pin_press: measured 0\.1 mm, predicted 0\.05 \(estimate\), ratio 2\n/);
    assert.match(out, /x1c\.pin_slip: measured 0\.25 mm, predicted 0\.2/);
    assert.match(out, /x1c\.magnet_press: measured 0\.05 mm, predicted 0\.1 \(estimate\)/);
    assert.match(out, /x1c\.magnet_glue: measured 0\.15 mm, predicted 0\.1/);
    assert.match(out, /x1c\.magnet_crush: measured 0\.3 mm, predicted 0\.2/);
    assert.match(out, /x1c\.snap_barb: measured 0\.5 mm, predicted 0\.4 \(barb 0\.4, the default\)/);
    assert.match(out, /pla\.strength_z: measured 21\.5 MPa, predicted 39 \(pla\.strength, along the layers: no figure across them\)/);
    // in the workspace's copies of the printer's and the plastic's sets, each measured, dated, from the coupon
    const x1c = JSON.parse(fs.readFileSync(own('x1c'), 'utf8')).rules, pla = JSON.parse(fs.readFileSync(own('pla'), 'utf8')).rules, today = new Date().toISOString().slice(0, 10);
    for (const [k, value] of [['snap_clearance', 0.15], ['pin_press', 0.1], ['pin_slip', 0.25], ['magnet_press', 0.05], ['magnet_glue', 0.15], ['magnet_crush', 0.3], ['snap_barb', 0.5]]) {
      assert.deepEqual([x1c[k].value, x1c[k].unit, x1c[k].kind, x1c[k].checked], [value, 'mm', 'measured', today], k); assert.match(x1c[k].source, /holds coupon/, k); assert.doesNotMatch(x1c[k].rule, /estimate|until/, k);
    }
    assert.deepEqual([pla.strength_z.value, pla.strength_z.unit, pla.strength_z.kind], [21.5, 'MPa', 'measured']); assert.match(pla.strength_z.rule, /across its printed layers: the pull bolt/);
    assert.equal(pla.strength.value, 39, 'the strength along the layers is untouched');
    // and the plate is drawn from them: the dowel's press hole 3 + 0.1 - 0.1 = 3 mm, the magnet's pocket 8 + 0.1 - 0.05 = 8.05 mm
    const after = drawn();
    assert.equal(hole(after), 3);
    assert.ok(after.some((x) => /8\.05 mm/.test(x.text) && /x1c\.magnet_press/.test(x.text)), 'the pocket from the measured press');
    assert.match(cad('history', 'home/coupon'), /x1c\.pin_press: measured 0\.1 mm, predicted 0\.05/);
    // 0 is a real fit for a slip and for crush ribs, both past hole_comp: the coupon's lowest row is at 0 once centred on
    // 0.1 (0.1 - x1c.hole_comp 0.1). A snap socket's 0 is still refused: its gap has no hole compensation (above)
    const zero = cad('measured', 'home/coupon', 'x1c.pin_slip=0', 'x1c.magnet_crush=0');
    assert.match(zero, /x1c\.pin_slip: measured 0 mm, predicted 0\.25/); assert.match(zero, /x1c\.magnet_crush: measured 0 mm, predicted 0\.3/);
    const x1c0 = JSON.parse(fs.readFileSync(own('x1c'), 'utf8')).rules; assert.deepEqual([x1c0.pin_slip.value, x1c0.magnet_crush.value], [0, 0]);
  } finally { done(); }
});

test('the holds coupon\'s pull bolt is long enough for the blocks MEASURE.md row 47 clamps it between: their thickness, a washer and a steel nut on full thread, the waist hanging below', async () => {
  const { screwModel, nutModel, washerModel, threadModel } = await import('@rulecad/fixings');
  const bench = fileURLToPath(new URL('../../examples/bench/projects/benchmarks/', CAD));
  const v = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(bench + 'objects/holds-coupon.json', 'utf8')).variables).map(([k, x]) => [k, x.value]));
  const row = fs.readFileSync(bench + 'MEASURE.md', 'utf8').split(/\r?\n/).find((l) => l.startsWith('| 47 |'));
  const blocks = Number(row.match(/blocks are no more than (\d+(?:\.\d+)?) mm thick/)?.[1]);
  assert.ok(blocks > 0, 'row 47 says how thick the blocks may be');
  // As holds-coupon.js draws it, standing on its head: the head k tall, a millimetre of shank, a 45° cone down from the
  // thread's radius R to the waist's r, the waist, a cone back up; full thread from z2 to the tip at k + pull_length
  const k = screwModel(`M8x${v.pull_length} hex`).headHeight, R = 8 / 2, r = v.waist / 2, z2 = k + 1 + (R - r) + v.waist_length + (R - r);
  const thread = k + v.pull_length - z2, needed = blocks + washerModel('M8').thickness + nutModel('M8').height + threadModel('M8', { length: 10 }).pitch;
  // By hand: k = 5.3 (ISO 4017 M8 head), the 3.5 mm waist 3.5 mm long, z2 = 5.3 + 1 + 2.25 + 3.5 + 2.25 = 14.3, so pull_length
  // 45 leaves 5.3 + 45 - 14.3 = 36 mm of full thread above the waist. The blocks (20) + an ISO 7089 washer (1.6) + an ISO
  // 4032 nut at its tallest (6.8) + a pitch to start the nut on (1.25) = 29.65 mm: it fits, 6.35 mm to spare. At pull_length 30 there were 18 mm, room for
  // blocks of 8.35 mm at most: an 18 mm plywood offcut left the waist inside the gap, out of the cord's reach
  assert.equal(Number(z2.toFixed(6)), 14.3); assert.equal(Number(thread.toFixed(6)), 36); assert.equal(Number(needed.toFixed(6)), 29.65);
  assert.ok(thread >= needed, `${thread} mm of thread above the waist holds blocks ${blocks} mm thick, a washer and a nut (${needed} mm)`);
  assert.ok(blocks >= 18, 'an 18 mm plywood offcut, the common board, is thin enough');
});

test('cad measured from the joint rig: a drop read on the dial becomes the join\'s spring, measured, in the rule it came from, and the prediction moves to match; a slot nut\'s hold along its slot lands in its set', async () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/home', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: [] }));
    // the rig as MEASURE.md builds it: a base beam, three beams held out from it by one join each, 2 kg on each one's end
    const beam = (id, x, ops) => ({ id, beam: { profile: '2020-misumi-hfs5', ...(ops ? { ops: [{ op: 'tap', at: 'b', thread: 'M5', depth: 18.5 }] } : {}) }, from: [x, -10, 10], to: [x, -160, 10] });
    fs.writeFileSync(at('assemblies/rig.json'), JSON.stringify({ title: 'Rig', kind: 'fit',
      items: [{ id: 'b0', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 10], to: [400, 0, 10] }, beam('c1', 80, true), beam('c2', 200, true), beam('c3', 320, true)],
      joins: [{ kind: 'blind', a: 'c1.a', b: 'b0.front@80' }, { kind: 'bracket', a: 'c2.a', b: 'b0.front@200', fitting: 'printed', nut: 'slide-in' }, { kind: 'anchor', a: 'c3.a', b: 'b0.front@320', fitting: 'fitting-misumi-hmj5' }],
      loads: ['c1', 'c2', 'c3'].map((c) => ({ mass: 2, at: `${c}.b` })) }));
    const check = () => JSON.parse(cad('check', 'home/rig', '--json')).findings;
    const drop = (f, id) => f.find((x) => x.code === 'join.drop' && x.refs.beam === id), spring = (f, a) => f.find((x) => x.code === 'join.stiffness' && x.refs.a === a);
    const before = check(), F = 2 * 9.80665, L = 150, EI = 69972 * 7420;
    // the drop: the beam's own bending and the join turning, each said, with where the measured spring goes
    const d1 = drop(before, 'c1');
    assert.deepEqual([d1.values.arm, d1.values.beam, d1.values.join, d1.predict.name, d1.refs.rule], [L, +(F * L ** 3 / (3 * EI)).toFixed(3), +(F * L * L / 1.5e6).toFixed(3), 'c1.drop', 'joins.blind_bending']);
    assert.match(d1.text, /2 kg at c1\.b, 150 mm out from b0's face, drops it 0\.337 mm: 0\.042 mm the beam's own bending .* and 0\.294 mm the join turning on its 1\.500 N·m\/mrad spring \(an estimate, until the joint rig \(issue 264\) measures it\)\. .*cad measured home\/rig c1\.drop=<mm>/);
    assert.deepEqual([drop(before, 'c2').refs.rule, drop(before, 'c3').refs.rule], ['joins.bracket_printed_share', 'fitting-misumi-hmj5.bending_stiffness']);
    const fe = spring(before, 'c2.a').refs.rests[0].value, beamDrop = drop(before, 'c1').predict.rig.beam;
    // a drop no more than the beam bends by itself is refused, and nothing is written
    cad.refused(/c1\.drop: 0\.03 mm is no more than the 0\.042 mm the beam bends by itself .*stiffer than solid metal/, 'measured', 'home/rig', 'c1.drop=0.03');
    assert.ok(!fs.existsSync(path.join(ws, 'rules/joins.json')), 'nothing written, not even the joins set\'s first copy');
    // nor when a later value is refused: the good drop before it is not written either, nor any set copied for it
    cad.refused(/c3\.drop: 0\.03 mm is no more than/, 'measured', 'home/rig', 'c1.drop=0.5', 'c3.drop=0.03');
    for (const n of ['joins', 'fitting-misumi-hmj5']) assert.ok(!fs.existsSync(path.join(ws, `rules/${n}.json`)), `${n}: nothing written on a refusal`);
    const out = cad('measured', 'home/rig', 'c1.drop=0.5', 'c2.drop=3', 'c3.drop=0.4', 'slot-nut-6-misumi-m5-slide-in.hold_along=420');
    assert.match(out, /c1\.drop: measured 0\.5 mm, predicted 0\.337/);
    assert.match(out, /slot-nut-6-misumi-m5-slide-in\.hold_along: measured 420 N/);
    const today = new Date().toISOString().slice(0, 10), own = (n) => JSON.parse(fs.readFileSync(path.join(ws, `rules/${n}.json`), 'utf8')).rules;
    // each spring in its rule, measured, with the drop it came from: the kind's (a 20 mm profile), a printed fitting's
    // share of its own finite-element figure, and a bought fitting's own
    const k1 = (F * L * L) / (0.5 - beamDrop), joins = own('joins'), anchor = own('fitting-misumi-hmj5'), nut = own('slot-nut-6-misumi-m5-slide-in');
    assert.equal(joins.blind_bending.value, Number(k1.toPrecision(4)));
    assert.equal(joins.bracket_printed_share.value, Number(((F * L * L) / (3 - beamDrop) / fe).toPrecision(4)));
    assert.equal(anchor.bending_stiffness.value, Number(((F * L * L) / (0.4 - beamDrop)).toPrecision(4)));
    for (const r of [joins.blind_bending, joins.bracket_printed_share, anchor.bending_stiffness, nut.hold_along]) { assert.equal(r.kind, 'measured'); assert.equal(r.checked, today); assert.match(r.source, /joint rig/); }
    assert.match(joins.blind_bending.source, /0\.5 mm drop of c1 under 19\.613 N at 150 mm .*less the beam's own 0\.042 mm/);
    assert.deepEqual([joins.blind_twist.kind, joins.end_tap_bending.kind, nut.hold_along.unit], ['estimate', 'estimate', 'N'], 'only what was measured');
    assert.match(nut.hold_along.rule, /slips/);
    // each spring's sentence is what was measured, not the estimate's "until the joint rig measures it"
    for (const r of [joins.blind_bending, joins.bracket_printed_share, anchor.bending_stiffness]) { assert.match(r.rule, /measured on the joint rig .*: a beam held out by the join, the drop of its end under a hung mass less the beam's own bending/); assert.doesNotMatch(r.rule, /guess|until the joint rig|estimate/); }
    assert.match(joins.blind_bending.rule, /^How stiffly a blind join holds the end of a beam against turning across its axis, for a 20 mm series profile: measured/);
    assert.match(joins.bracket_printed_share.rule, /^A bracket join with a printed fitting, as a share of the fitting's own bending stiffness by finite elements: the join's spring measured/);
    assert.match(anchor.bending_stiffness.rule, /^How stiffly this fitting holds the end of a beam against turning across its axis, its screws tight: measured/);
    assert.match(joins.blind_twist.source, /A working guess/, 'what was not measured stays the estimate it was');
    // the kit's own rule sets are untouched, and it has no joins set of its own
    assert.ok(!fs.existsSync(new URL('../rules/joins.json', CAD)));
    assert.equal(JSON.parse(fs.readFileSync(new URL('../rules/fitting-misumi-hmj5.json', CAD), 'utf8')).rules.bending_stiffness.kind, 'estimate');
    // checked again: each spring says it was measured and when, and each drop predicted is now the one measured
    const after = check();
    for (const [id, d] of [['c1', 0.5], ['c2', 3], ['c3', 0.4]]) assert.ok(Math.abs(drop(after, id).predict.value - d) < 0.002, `${id}: ${drop(after, id).predict.value} against ${d}`);
    assert.match(spring(after, 'c1.a').text, new RegExp(`bending measured on the joint rig on ${today}; twist an estimate until the rig measures it`));
    assert.match(spring(after, 'c2.a').text, new RegExp(`times the [\\d.]+ a printed bracket join keeps of it, measured on the joint rig on ${today}`));
    assert.match(spring(after, 'c3.a').text, new RegExp(`\\(measured: .*\\): bending measured on the joint rig on ${today}`));
    assert.match(drop(after, 'c1').text, /bending measured on the joint rig on/);
    // the HMJ5's own finding read from the workspace's set: its bending measured, and when; its twist still the estimate
    const { boughtFittingModel } = await import('@rulecad/frames');
    const hmj = boughtFittingModel({ name: 'fitting-misumi-hmj5', part: 'fitting', rules: anchor }).findings.find((x) => x.code === 'fitting.stiffness');
    assert.match(hmj.text, new RegExp(`in bending and 500000 in twist: bending measured on the joint rig on ${today} \\(.*0\\.4 mm drop of c3.*\\); twist an estimate: `), hmj.text);
    // the slot nut, read from the workspace's set, says its hold along the slot and that it was measured
    const { framesContext } = await import(pathToFileURL(path.join(path.dirname(BIN), '../lib/frames.mjs')).href);
    const { slotNutModel } = await import('@rulecad/frames');
    const m = slotNutModel('slot-nut-6-misumi-m5-slide-in', {}, { sets: framesContext(path.join(ws, 'rules')).sets });
    assert.deepEqual([m.holdAlong.value, m.holdAlong.kind], [420, 'measured']);
    assert.match(m.findings.find((x) => x.code === 'slot_nut.hold_along').text, new RegExp(`slips along the slot at 420 N: measured on ${today}`));
    assert.doesNotMatch(m.findings.find((x) => x.code === 'slot_nut.hold_along').text, /estimate/, 'a measured hold is not called an estimate');
    assert.match(cad('history', 'home/rig'), /c1\.drop: measured 0\.5 mm, predicted 0\.337/);
  } finally { done(); }
});

test('cad measured from the beam coupon: its sag becomes the modulus a printed beam bends at, the mass it broke at its strength, each in the plastic\'s set as measured, and the predictions move', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/benchmarks', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'benchmarks', material: 'PLA', objects: [] }));
    fs.copyFileSync(new URL('../../examples/bench/projects/benchmarks/assemblies/beam-test.json', CAD), at('assemblies/beam-test.json'));
    const check = () => cad.run('check', 'benchmarks/beam-test', '--json').json.findings; // (as drawn, k2 fails beam.creep, an estimate, until its strength is measured)
    const coupon = (f, id, what) => f.find((x) => x.code === 'beam.coupon' && x.refs.beam === id && x.predict.name === `${id}.${what}`);
    const before = check();
    // Hand calculation: a beam on two bars 220 mm apart, 2 kg at its middle: sag = F L³ / (48 E I), F = 2 x 9.80665 = 19.613 N.
    // k1 printed lying down in PLA: E 2680 MPa (pla.modulus), I its printed section's (2805.31 mm⁴ from 3 walls and 40%
    // infill): 19.613 x 220³ / (48 x 2680 x 2805.31) = 0.5787 mm. It breaks where M = S Z: the stress a kilogram at the
    // middle causes is (9.80665 x 220 / 4) / Z = 539.4 / 364.3 = 1.48 MPa (Z = I / 7.7 mm to its furthest fibre); so at
    // (39 - its own weight's 0.027) / 1.48 = 26.3 kg. k2 stands, so across its layers: E 2160, S 0.6 x 39 = 23.4 (an estimate).
    const s1 = coupon(before, 'k1', 'sag'), b1 = coupon(before, 'k1', 'break'), s2 = coupon(before, 'k2', 'sag'), b2 = coupon(before, 'k2', 'break');
    const I = s1.values.inertia, hand = (19.613 * 220 ** 3) / (48 * 2680 * I);
    assert.ok(Math.abs(I - 2805.31) < 1, `I ${I}`);
    assert.ok(Math.abs(s1.predict.value - hand) < 0.002, `${s1.predict.value} against ${hand}`);
    assert.ok(Math.abs(s2.predict.value - (19.613 * 220 ** 3) / (48 * 2160 * I)) < 0.002);
    assert.ok(Math.abs(b1.predict.value - 26.33) < 0.1 && Math.abs(b2.predict.value - (23.4 - 0.027) / 1.48) < 0.1, `${b1.predict.value} ${b2.predict.value}`);
    assert.deepEqual([s1.refs.rule, b1.refs.rule, s2.refs.rule, b2.refs.rule], ['pla.beam_modulus', 'pla.beam_strength', 'pla.beam_modulus_z', 'pla.beam_strength_z']);
    assert.match(s1.text, /^k1 is the beam coupon, printed lying down, across 220 mm between k1\.bottom@10 and k1\.bottom@230: 2 kg at k1\.bottom@50% sags it 0\.579 mm, .*cad measured benchmarks\/beam-test k1\.sag=<mm>, and the modulus goes to pla\.beam_modulus$/);
    assert.ok(!before.some((x) => x.level === 'fail'), JSON.stringify(before.filter((x) => x.level === 'fail')));
    // written back: a sag of 0.7 mm on k1 and a break at 12 kg on k2
    const out = cad('measured', 'benchmarks/beam-test', 'k1.sag=0.7', 'k2.break=12');
    assert.match(out, /k1\.sag: measured 0\.7 mm, predicted 0\.579/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/pla.json'), 'utf8')).rules, today = new Date().toISOString().slice(0, 10);
    // the modulus scales as the sag: 2680 x 0.5787 / 0.7; the strength is its stress at 12 kg: 0.027 + 1.48 x 12
    assert.equal(rules.beam_modulus.value, Number(((2680 * s1.predict.coupon.sag) / 0.7).toPrecision(4)));
    assert.equal(rules.beam_strength_z.value, Number((b2.predict.coupon.self + b2.predict.coupon.perKg * 12).toPrecision(4)));
    for (const k of ['beam_modulus', 'beam_strength_z']) { const x = rules[k]; assert.deepEqual([x.kind, x.checked, x.unit], ['measured', today, 'MPa'], k); assert.match(x.source, /the beam coupon/, k); }
    assert.match(rules.beam_modulus.rule, /^The modulus a printed beam of PLA bends at, printed lying down/);
    assert.match(rules.beam_modulus.source, /0\.7 mm sag of k1 under 2 kg at k1\.bottom@50%, across 220 mm, against 0\.579 mm at 2680 MPa/);
    assert.match(rules.beam_strength_z.rule, /^The stress a printed beam of PLA breaks at in bending, printed standing up/);
    assert.ok(!rules.beam_strength && !rules.beam_modulus_z, 'only what was measured');
    assert.equal(JSON.parse(fs.readFileSync(new URL('../rules/pla.json', CAD), 'utf8')).rules.beam_modulus, undefined, 'the kit\'s own set is untouched');
    // checked again: the coupon's sag is now the one measured, and the figures say they rest on the coupon
    const after = check(), s1b = coupon(after, 'k1', 'sag'), b2b = coupon(after, 'k2', 'break');
    assert.ok(Math.abs(s1b.predict.value - 0.7) < 0.002, `${s1b.predict.value}`);
    assert.ok(Math.abs(b2b.predict.value - 12) < 0.05, `${b2b.predict.value}`);
    assert.match(s1b.text, /from pla's modulus along its layers [\d.]+ MPa \(pla\.beam_modulus, measured\)/);
    assert.match(b2b.text, /\(pla\.beam_strength_z, measured\)/);
    assert.match(after.find((x) => x.code === 'beam.mass' && /k1/.test(x.text)).text, /\(pla\.beam_modulus, measured, from the beam coupon/);
    // refused by name: a sag of nothing
    cad.refused(/k1\.sag: a sag is above 0/, 'measured', 'benchmarks/beam-test', 'k1.sag=0');
    assert.match(cad('history', 'benchmarks/beam-test'), /k1\.sag: measured 0\.7 mm, predicted 0\.579/);
  } finally { done(); }
});

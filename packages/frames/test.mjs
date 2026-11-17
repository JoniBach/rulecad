import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as frames from '@rulecad/frames';
import { SETS } from './catalogue.mjs';
import { gap, inside } from './section.mjs';
import jscad from '@jscad/modeling';

const { beamModel, beam, beamAnchor, printable, profileModel, slotModel, slotPath, outline, section, profileFindings, readOutline, polygonSection, torsionConstant, signedArea, DEFAULTS } = frames;
const rulesDir = new URL('../rules/', import.meta.url);
const published = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.json') && !['package.json', 'vocabulary.json'].includes(f)).map((f) => JSON.parse(fs.readFileSync(new URL(f, rulesDir), 'utf8')));
const rule = (value, unit) => ({ value, ...(unit != null ? { unit } : {}), rule: 'A figure for a test', kind: 'estimate', source: 'this test', checked: '2026-11-15' });
const plain = (family, w, h, more = {}) => ({ name: `test-${family}`, part: 'profile', rules: { family: rule(family), width: rule(w, 'mm'), height: rule(h, 'mm'), ...more } });
const within = (got, want, share, what) => assert.ok(Math.abs(got / want - 1) <= share, `${what}: ${got} is not within ${share * 100}% of ${want}`);

test('the package: ready, typed, and needing only the rules it reads', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.equal(frames.status.plan, 'https://github.com/JoniBach/rulecad/issues/240');
  assert.equal(frames.status.release, 'ready'); assert.ok(Object.isFrozen(frames.status));
  assert.ok(!pkg.version.startsWith('0.0.'), 'from 0.1.0 it has functions to call');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@rulecad/fea', '@rulecad/fixings', '@rulecad/rules'], 'fixings sizes what an operation names by a thread; fea bends a printed fitting');
  assert.deepEqual(Object.keys(pkg.peerDependencies), ['@jscad/modeling'], 'a beam\'s solid is JSCAD\'s, which a design already has');
  for (const f of pkg.files.filter((x) => x.endsWith('.mjs'))) { assert.ok(fs.existsSync(new URL(f, import.meta.url)), `${f} is shipped and exists`); assert.ok(pkg.files.includes(f.replace(/\.mjs$/, '.d.mts')), `${f} ships its declarations`); }
});

test('the catalogue holds every profile, slot family and slot nut the rules package has, and what they name', () => {
  const parts = published.filter((s) => ['profile', 'slot', 'slot_nut'].includes(s.part));
  assert.ok(parts.length >= 12);
  for (const s of parts) assert.deepEqual(SETS[s.name], s, `${s.name} is in catalogue.mjs as published: add its import`);
  assert.deepEqual(frames.profiles().sort(), published.filter((s) => s.part === 'profile').map((s) => s.name).sort());
  assert.deepEqual(frames.slots().sort(), published.filter((s) => s.part === 'slot').map((s) => s.name).sort());
  for (const p of published.filter((s) => s.part === 'profile')) {
    for (const k of ['slot', 'slot_top', 'slot_bottom', 'slot_front', 'slot_back']) for (const n of String(p.rules[k]?.value ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'closed')) assert.equal(SETS[n]?.part, 'slot', `${p.name}.${k} names the slot family ${n}`);
    if (p.rules.material) assert.ok(SETS[p.rules.material.value]?.rules.density, `${p.name}.material names a material set with a density`);
    const m = profileModel(p.name);
    for (const b of m.bores) if (b.thread) assert.ok(b.threadSet && b.tapDrill > 0, `${p.name}: ${b.thread} names a thread set with a tap drill`);
  }
});

test('area, centroid and second moments by the polygon formulas: a plate with a hole, an angle off its envelope\'s middle', () => {
  const plate = plain('bar', 40, 20), hole = { ...plate, rules: { ...plate.rules, bore_diameter: rule(10, 'mm') } };
  const s = section(profileModel(hole), { torsion: false });
  within(s.area, 40 * 20 - Math.PI * 25, 1e-9, 'area'); within(s.inertiaX, (40 * 20 ** 3) / 12 - (Math.PI * 10 ** 4) / 64, 1e-3, 'Ix'); within(s.inertiaY, (20 * 40 ** 3) / 12 - (Math.PI * 10 ** 4) / 64, 1e-3, 'Iy');
  assert.ok(Math.abs(s.centroid[0]) < 1e-9 && Math.abs(s.centroid[1]) < 1e-9 && Math.abs(s.inertiaXY) < 1e-6);
  within(s.modulusX, s.inertiaX / 10, 1e-9, 'section modulus');
  // an angle 40 x 40 x 4: its centroid sits toward the corner, by the textbook sum of two rectangles
  const a = section(profileModel(plain('angle', 40, 40, { wall: rule(4, 'mm') })), { torsion: false }), A = 40 * 4 + 36 * 4, c = (40 * 4 * 20 + 36 * 4 * 2) / A - 20;
  within(a.area, A, 1e-9, 'angle area'); assert.ok(Math.abs(a.centroid[0] - c) < 1e-9 && Math.abs(a.centroid[1] - c) < 1e-9);
  assert.ok(a.inertiaXY < 0, 'an angle\'s axes are not its principal ones');
  assert.throws(() => polygonSection([[[0, 0], [0, 1], [1, 1], [1, 0]]]), /counter-clockwise/);
});

test('the torsion constant by Prandtl\'s stress function: a round bar, a rectangle and a thin square tube against their closed forms; a slit tube is far weaker', () => {
  const J = (set, o) => section(profileModel(set), o).torsion;
  within(J(plain('round-bar', 20, 20)), (Math.PI * 20 ** 4) / 32, 0.01, 'a solid circle, pi d^4 / 32');
  let sum = 0; for (let n = 1; n < 200; n += 2) sum += Math.tanh((n * Math.PI * 20) / (2 * 10)) / n ** 5; // (Timoshenko's series for a rectangle a x b)
  within(J(plain('bar', 20, 10)), (1 / 3 - ((64 * 10) / (Math.PI ** 5 * 20)) * sum) * 20 * 10 ** 3, 0.02, 'a solid rectangle 20 x 10');
  const tube = J(plain('tube', 40, 40, { wall: rule(2, 'mm') }));
  within(tube, 2 * 38 ** 3 + (4 * 38 * 2 ** 3) / 3, 0.03, 'a thin-walled square tube, Bredt plus the wall\'s own share'); // 4 A² t / s = t (a - t)³
  within(J(plain('round-tube', 30, 30, { wall: rule(2, 'mm') })), (Math.PI * (30 ** 4 - 26 ** 4)) / 32, 0.02, 'a round tube');
  // the same tube with one wall slit open is an open section: about (1/3) s t³, hundreds of times less
  const slit = torsionConstant([[[-20, -20], [20, -20], [20, 20], [0.5, 20], [0.5, 18], [18, 18], [18, -18], [-18, -18], [-18, 18], [-0.5, 18], [-0.5, 20], [-20, 20]]]).torsion;
  within(slit, (4 * 38 * 2 ** 3) / 3, 0.1, 'a slit tube'); assert.ok(tube / slit > 200);
  // and it settles: finer cells change a slotted section little
  const m = profileModel('2020-misumi-hfs5'); within(section(m, { cells: 160000 }).torsion, section(m).torsion, 0.03, 'finer cells');
  const polar = section(m).inertiaX + section(m).inertiaY; assert.ok(section(m).torsion < polar / 10, 'a slotted section twists far more easily than its polar moment suggests');
  assert.throws(() => torsionConstant([[[0, 0], [1, 0], [1, 1], [0, 1]]], { cells: 5 }), /cells is a number of at least 100/);
});

test('profileModel: a profile from its rule set and its slot family, every figure with its kind and source', () => {
  const m = profileModel('profile-2020-misumi-hfs5');
  assert.deepEqual([m.kind, m.name, m.family, m.series, m.cells, m.width, m.height, m.cornerRadius], ['profile', 'profile-2020-misumi-hfs5', 't-slot', 20, [1, 1], 20, 20, 1]);
  assert.deepEqual(profileModel('2020-misumi-hfs5').figures, m.figures, 'the name with or without profile-');
  assert.deepEqual(Object.keys(m.faces), ['top', 'bottom', 'front', 'back']);
  assert.deepEqual(m.faces.top, [{ face: 'top', index: 1, slot: 'slot-6-misumi', at: [0, 10], normal: [0, 1], along: [1, 0] }]);
  assert.deepEqual(m.faces.front[0].at, [-10, 0]); assert.deepEqual(m.faces.back[0].normal, [1, 0]);
  const s = m.slots['slot-6-misumi'];
  assert.deepEqual([s.opening, s.lip, s.cavityWidth, s.cavityDepth, s.flankAngle, s.nutFamily], [6, 2, 12, 6, 45, 'slot-6-misumi']);
  assert.equal(s.figures.opening.kind, 'spec'); assert.equal(s.figures.floor_width.kind, 'estimate'); assert.match(s.figures.opening.source, /MISUMI.*page 2-529/);
  assert.deepEqual(m.bores, [{ at: [0, 0], diameter: 4.2, thread: 'M5', threadSet: 'm5', tapDrill: 4.2, major: 5, threadPitch: 0.8, where: 'cell' }]);
  assert.deepEqual([m.sheet.area, m.sheet.inertiaX, m.sheet.massPerMetre, m.sheet.torsion], [183, 7420, 0.5, null]);
  assert.equal(m.figures.area.kind, 'spec'); assert.match(m.figures.area.source, /https:\/\/my\.misumi-ec\.com/);
  assert.deepEqual([m.material.name, m.material.alloy, m.material.density, m.material.modulus], ['al6n01-t5', 'A6N01SS-T5', 2.7, 69972]);
  assert.deepEqual([m.supply.lengths, m.supply.cutTolerance, m.supply.cutMin, m.supply.cutMax], [[1000, 4000], 0.5, 50, 4000]);
  assert.ok(m.rests.includes('spec') && m.rests.includes('estimate'), 'it says what its figures rest on, the slot\'s included');
  // a change: a number is "given", a figure keeps what it says of itself
  const c = profileModel('2020-misumi-hfs5', { bore_diameter: 5, area: { value: 180, kind: 'measured', source: 'weighed a metre' } });
  assert.deepEqual([c.bores[0].diameter, c.figures.bore_diameter.kind, c.sheet.area, c.figures.area.kind], [5, 'given', 180, 'measured']);
});

test('cells: a 2040 is two cells of its base, with a slot per cell on its wide faces, a bore per cell and the hollow between them', () => {
  const m = profileModel('2040-misumi-hfs5');
  assert.deepEqual([m.cells, m.width, m.height, m.pitch], [[2, 1], 40, 20, [20, 20]]);
  assert.deepEqual(m.faces.top.map((f) => [f.index, f.at]), [[1, [-10, 10]], [2, [10, 10]]]);
  assert.equal(m.faces.front.length, 1); assert.deepEqual(m.bores.map((b) => b.at), [[-10, 0], [10, 0]]);
  assert.deepEqual(m.chambers, [{ at: [0, 0], axis: 'x', width: 16, length: 0, depth: 6, ends: [8, 8], slot: 'slot-6-misumi' }]);
  // a hollow shallower than two cavities back to back (a thick core between the cells) is smaller by what it stops short of
  const shallow = profileModel('2040-misumi-hfs5', { chamber_depth: 5 }), xs = outline(shallow).loops[1].map((p) => p[0]);
  assert.equal(shallow.chambers[0].depth, 5); assert.deepEqual([Math.min(...xs), Math.max(...xs)], [-5, 5]);
  assert.ok(section(shallow, { torsion: false }).area > section(m, { torsion: false }).area + 5 && section(shallow, { torsion: false }).area < section(m, { torsion: false }).area + 2 * 8);
  assert.throws(() => profileModel('2040-misumi-hfs5', { chamber_depth: 10 }), /chamber_depth is above 0 and under half a cell's size, 10 \(got 10\)/);
  const { loops } = outline(m);
  assert.equal(loops.length, 4, 'the outside, the hollow, two bores');
  // a face overridden, a face with a slot family per slot, and a section that mixes families
  const own = (more) => ({ ...SETS['profile-2040-misumi-hfs5'], name: 'mine', rules: { ...SETS['profile-2040-misumi-hfs5'].rules, ...more } });
  const closed = profileModel(own({ slot_bottom: rule('closed') }));
  assert.deepEqual(closed.faces.bottom.map((f) => f.slot), [null, null]); assert.ok(section(closed, { torsion: false }).area > section(m, { torsion: false }).area + 60);
  const mixed = profileModel(own({ slot_top: rule('slot-6-misumi, closed'), slot_back: rule('slot-6-bosch') }));
  assert.deepEqual(mixed.faces.top.map((f) => f.slot), ['slot-6-misumi', null]); assert.deepEqual(Object.keys(mixed.slots).sort(), ['slot-6-bosch', 'slot-6-misumi']);
  assert.throws(() => profileModel(own({ slot_top: rule('slot-6-misumi, closed, closed') })), /slot_top names one slot family \(or closed\) for the whole face, or 2, one for each slot along it/);
  // bores where the set says, and none
  assert.deepEqual(profileModel(own({ bore_at: rule('-10,0') })).bores.map((b) => [b.at, b.where]), [[[-10, 0], 'given']]);
  assert.equal(profileModel(own({ bore_at: rule('none') })).bores.length, 0);
  assert.throws(() => profileModel(own({ bore_at: rule('left') })), /bore_at is cells, none, or x,y pairs/);
  // corner holes and corner hollows, as the 3030 and the 4040 have them
  assert.deepEqual(profileModel('3030-misumi-hfs6').bores.filter((b) => b.where === 'corner').map((b) => b.at), [[-11.6, -11.6], [11.6, -11.6], [11.6, 11.6], [-11.6, 11.6]]);
  assert.deepEqual(profileModel('4040-misumi-hfs8').hollows[2], { at: [15, 15], width: 6 });
});

test('a grid of cells both ways: the hollows round a place where four cells meet stand clear of each other', () => {
  // no two edges of a loop cross or touch, but for neighbours at their shared point
  const simple = (loop) => { const n = loop.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (gap([loop[i], loop[(i + 1) % n], loop[i]], [loop[j], loop[(j + 1) % n], loop[j]]) <= 1e-9) return false; } return true; };
  // the makers' two-cell sections have a hollow wider than a cavity (16 or 17 mm against 12), some stepped: each as a grid
  for (const base of ['profile-2040-misumi-hfs5', 'profile-2040-bosch', 'profile-2040-generic']) for (const [across, up] of [[2, 2], [3, 2], [2, 3]]) {
    const rules = { ...SETS[base].rules, cells_across: rule(across, ''), cells_up: rule(up, ''), width: rule(20 * across, 'mm'), height: rule(20 * up, 'mm') };
    for (const k of ['area', 'inertia_x', 'inertia_y', 'section_modulus_x', 'section_modulus_y', 'torsion_constant', 'mass_per_metre']) delete rules[k]; // (the two-cell sheet's figures are not this section's)
    const what = `${base} as ${across} by ${up}`, m = profileModel({ name: 'grid', part: 'profile', rules }), { loops } = outline(m), cavity = m.slots[rules.slot.value].cavityWidth;
    assert.equal(m.chambers.length, (across - 1) * up + across * (up - 1), `${what}: a hollow between every two neighbours`);
    assert.equal(loops.length, 1 + m.chambers.length + across * up, `${what}: the outside, the hollows and a bore to a cell`);
    assert.ok(m.chambers.every((c) => c.ends.every((e) => e === c.width / 2 || e === cavity / 2)) && m.chambers.some((c) => c.ends[0] !== c.ends[1]), `${what}: an end toward the middle keeps to the cavity's width`);
    assert.ok(signedArea(loops[0]) > 0 && loops.slice(1).every((l) => signedArea(l) < 0), `${what}: the outside counter-clockwise, holes clockwise`);
    for (const [i, l] of loops.entries()) { assert.ok(l.length >= 3 && l.every((p) => p.every(Number.isFinite)), `${what}: loop ${i} is points`); assert.ok(simple(l), `${what}: loop ${i} does not cross itself`); }
    for (let i = 1; i < loops.length; i++) { assert.ok(loops[i].every((p) => inside(p, loops[0])), `${what}: hole ${i} is inside the metal's outside`); for (let j = i + 1; j < loops.length; j++) assert.ok(gap(loops[i], loops[j]) > 0.5, `${what}: holes ${i} and ${j} have metal between them (${gap(loops[i], loops[j])})`); }
    assert.deepEqual(profileFindings(m, { torsion: false }).filter((f) => f.level === 'fail'), [], `${what}: the check finds no hollow running into another`);
    // the area: no hole counted twice (the polygon sum agrees with counting the metal on a raster), and about what its cells come to
    const s = section(m, { torsion: false }), h = 0.01; let metal = 0;
    for (let y = -10 * up + h / 2; y < 10 * up; y += h) { // even-odd along each line: metal is between an odd crossing and the next
      const xs = loops.flatMap((l) => l.flatMap(([ax, ay], i) => { const [bx, by] = l[(i + 1) % l.length]; return (ay > y) !== (by > y) ? [ax + ((y - ay) * (bx - ax)) / (by - ay)] : []; })).sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) metal += (xs[k + 1] - xs[k]) * h;
    }
    within(s.area, metal, 0.002, `${what}: area by the polygon sum against the metal counted along scan lines`);
    const one = section(profileModel(base.replace('2040', '2020')), { torsion: false }).area;
    assert.ok(s.area > 0.8 * across * up * one && s.area < 1.05 * across * up * one, `${what}: ${s.area} mm² against ${across * up} cells of ${one}`);
    assert.ok(Math.abs(s.centroid[0]) < 1e-6 && Math.abs(s.centroid[1]) < 1e-6);
  }
  // one row is as it was: both ends of its hollow face the outside
  assert.deepEqual(profileModel('2040-bosch').chambers[0].ends, [8.5, 8.5]);
});

test('plain sections as families: any size from a base set, its figures worked out and equal to the closed forms', () => {
  const fig = (name, change) => { const m = profileModel(name, change); return { m, s: section(m, { torsion: false }) }; };
  // a family by its name, with the size, wall and material you have: nothing else to write
  const { m: tube, s: ts } = fig('tube', { width: 25, height: 25, wall: 2, material: 'al6063-t5' });
  assert.deepEqual([tube.name, tube.family, tube.title, tube.width, tube.wall, tube.material.name], ['profile-tube', 'tube', '25 x 25 x 2 tube, al6063-t5', 25, 2, 'al6063-t5']);
  assert.equal(tube.figures.width.kind, 'given'); assert.deepEqual(Object.values(tube.faces).flat().map((p) => p.slot), [null, null, null, null], 'a plain section has faces and no slots');
  within(ts.area, 25 * 25 - 21 * 21, 1e-12, 'square tube area'); within(ts.inertiaX, (25 ** 4 - 21 ** 4) / 12, 1e-12, 'square tube I'); within(ts.massPerMetre, (184 * 2.7) / 1000, 1e-12, 'mass from the density');
  const { m: rect, s: rs } = fig('tube', { width: 40, height: 20, wall: 2, material: 's275' });
  assert.equal(rect.title, '40 x 20 x 2 tube, s275'); within(rs.area, 40 * 20 - 36 * 16, 1e-12, 'rectangular tube area');
  within(rs.inertiaX, (40 * 20 ** 3 - 36 * 16 ** 3) / 12, 1e-12, 'Ix'); within(rs.inertiaY, (20 * 40 ** 3 - 16 * 36 ** 3) / 12, 1e-12, 'Iy'); within(rs.massPerMetre, (224 * 7.85) / 1000, 1e-12, 'steel');
  within(section(rect).torsion, (2 * 2 * 38 ** 2 * 18 ** 2) / (38 + 18), 0.04, 'a thin rectangular tube against Bredt, 2 t a² b² / (a + b) on its middle line');
  // a rounded corner takes metal off the outside and the inside alike
  assert.ok(section(profileModel('tube-steel-25x25x2'), { torsion: false }).area < 184 && profileModel('tube-steel-25x25x2').cornerRadius === 4);
  const { m: rt, s: rts } = fig('round-tube', { width: 30, height: 30, wall: 1.5 });
  assert.equal(rt.title, 'Ø30 x 1.5 round tube, al6063-t5'); within(rts.area, (Math.PI * (30 ** 2 - 27 ** 2)) / 4, 1e-9, 'round tube area'); within(rts.inertiaX, (Math.PI * (30 ** 4 - 27 ** 4)) / 64, 2e-3, 'round tube I');
  const { s: bs } = fig('bar', { width: 30, height: 5 }); within(bs.area, 150, 1e-12, 'flat bar'); within(bs.inertiaX, (30 * 5 ** 3) / 12, 1e-12, 'b h³ / 12'); within(bs.modulusX, (30 * 5 ** 2) / 6, 1e-12, 'b h² / 6');
  const { s: rb } = fig('round-bar', { width: 12, height: 12 }); within(rb.area, Math.PI * 36, 1e-9, 'round bar'); within(rb.inertiaY, (Math.PI * 12 ** 4) / 64, 1e-3, 'pi d⁴ / 64');
  // a channel 40 x 20 x 3: web along the bottom, a flange up each side; the textbook sum of three rectangles
  const { s: cs } = fig('channel', { width: 40, height: 20, wall: 3 }), A = 40 * 3 + 2 * 17 * 3, yc = (40 * 3 * 1.5 + 2 * 17 * 3 * (3 + 8.5)) / A, Ix = (40 * 27) / 12 + 120 * (yc - 1.5) ** 2 + 2 * ((3 * 17 ** 3) / 12 + 51 * (11.5 - yc) ** 2);
  within(cs.area, A, 1e-12, 'channel area'); assert.ok(Math.abs(cs.centroid[1] - (yc - 10)) < 1e-9 && Math.abs(cs.centroid[0]) < 1e-9); within(cs.inertiaX, Ix, 1e-9, 'channel Ix');
  const { s: as } = fig('angle', { width: 40, height: 25, wall: 3 }); within(as.area, 40 * 3 + 22 * 3, 1e-12, 'an angle with unequal legs');
  // every ready size is its family at that size
  for (const name of frames.profiles().filter((n) => /-(al|steel)-/.test(n))) {
    const m = profileModel(name), base = profileModel(m.family, { width: m.width, height: m.height, ...(m.wall ? { wall: m.wall } : {}), corner_radius: m.cornerRadius, material: m.material.name });
    assert.deepEqual(outline(m), outline(base), `${name} draws as its family does at that size`); assert.deepEqual(profileFindings(m, { torsion: false }), [], `${name} checks clean`);
  }
  // refusals
  assert.throws(() => profileModel('tube', { wall: 13 }), /a tube needs a wall above 0 and thinner than half its smaller side \(got 13\)/);
  assert.throws(() => profileModel('round-tube', { width: 30 }), /a round section's width and height are both its diameter \(got 30 and 25\)/);
  assert.throws(() => profileModel('pipe'), /no profile "pipe"/);
});

test('beamFigures: the sheet\'s figure where the sheet gives one, the outline\'s where it does not, each saying which', () => {
  const sold = frames.beamFigures(profileModel('2020-misumi-hfs5'));
  assert.deepEqual([sold.area.value, sold.area.kind, sold.area.from, sold.inertiaX.value, sold.massPerMetre.value], [183, 'spec', 'sheet', 7420, 0.5]);
  assert.match(sold.area.source, /MISUMI.*page 2-529/);
  assert.deepEqual([sold.torsion.kind, sold.torsion.from, sold.torsion.unit], ['derived', 'outline', 'mm⁴'], 'MISUMI prints no torsion constant: worked out'); within(sold.torsion.value, 809, 0.02, 'J');
  assert.match(sold.torsion.source, /worked out from the drawn outline of profile-2020-misumi-hfs5/);
  const item = frames.beamFigures(profileModel('2020-item-5')); assert.deepEqual([item.torsion.value, item.torsion.from], [700, 'sheet'], 'item prints one: used as printed');
  const tube = frames.beamFigures(profileModel('tube', { width: 25, height: 25, wall: 2 }));
  for (const k of ['area', 'inertiaX', 'inertiaY', 'modulusX', 'modulusY', 'torsion', 'massPerMetre']) assert.deepEqual([tube[k].kind, tube[k].from], ['derived', 'outline'], `a tube's ${k} is worked out`);
  within(tube.torsion.value, 2 * 23 ** 3 + (4 * 23 * 2 ** 3) / 3, 0.05, 'a square tube against Bredt (a thin-wall formula, and this wall is a twelfth of the side)'); assert.match(tube.massPerMetre.source, /and the density of al6063-t5/);
  assert.throws(() => frames.beamFigures({}), /give a profile's model/);
});

test('custom: any closed outline, its figures worked out, held to the size its set gives', () => {
  // the kit's own example: a 30 x 30 x 3 T, flange uppermost, by the textbook sum of two rectangles
  const m = profileModel('custom'), s = section(m, { torsion: false }), A = 90 + 81, yc = (90 * 13.5 + 81 * -1.5) / A, Ix = (30 * 27) / 12 + 90 * (13.5 - yc) ** 2 + (3 * 27 ** 3) / 12 + 81 * (-1.5 - yc) ** 2;
  assert.deepEqual([m.family, m.title, outline(m).measured], ['custom', '30 x 30 custom (profile-custom)', true]); assert.match(outline(m).source, /drawn for the kit/);
  within(s.area, A, 1e-12, 'T area'); assert.ok(Math.abs(s.centroid[1] - yc) < 1e-9); within(s.inertiaX, Ix, 1e-9, 'T Ix'); within(s.inertiaY, (3 * 30 ** 3 + 27 * 3 ** 3) / 12, 1e-9, 'T Iy');
  within(section(m).torsion, ((30 + 27) * 3 ** 3) / 3, 0.12, 'an open thin section: about the sum of b t³ / 3');
  assert.deepEqual(profileFindings(m), []);
  // any other outline: a set of your own (or the family with your sizes), and the outline handed in
  const hat = { source: 'traced from my own bar', licence: 'my own measurement', loops: [[[-20, -10], [-10, -10], [-10, 8], [10, 8], [10, -10], [20, -10], [20, -8], [12, -8], [12, 10], [-12, 10], [-12, -8], [-20, -8]]] };
  const own = profileModel('custom', { width: 40, height: 20, material: 's275' }, { outline: hat }), os = section(own, { torsion: false });
  within(os.area, 2 * 10 * 2 + 2 * 16 * 2 + 24 * 2, 1e-12, 'a hat section: two feet, two webs and a top'); within(os.massPerMetre, (os.area * 7.85) / 1000, 1e-12, 'in steel'); assert.deepEqual(profileFindings(own, { torsion: false }), []);
  // the set's size is its outline's: said where they differ, and where the outline is not about its envelope's middle
  assert.deepEqual(profileFindings(profileModel('custom', { width: 45, height: 20 }, { outline: hat }), { torsion: false }).map((f) => [f.level, f.code, f.rule]), [['warn', 'profile.outline.size', 'width']]);
  const off = { ...hat, loops: hat.loops.map((l) => l.map(([x, y]) => [x + 5, y])) };
  assert.deepEqual(profileFindings(profileModel('custom', { width: 40, height: 20 }, { outline: off }), { torsion: false }).map((f) => f.code), ['profile.outline.middle']);
  // a custom profile with no outline is nothing
  const bare = { name: 'profile-mine', part: 'profile', rules: { family: rule('custom'), width: rule(40, 'mm'), height: rule(20, 'mm') } };
  assert.throws(() => profileModel(bare), /profile-mine: a custom profile is its outline, and none came with it: hand one in \(\{ outline: \{ source, licence, loops \} \}\), or keep it beside the set as rules\/outlines\/profile-mine\.json/);
  assert.equal(section(profileModel(bare, {}, { outline: hat }), { torsion: false }).area, os.area);
});

test('cells that are not there: a C-beam is four cells by two less the upper middle pair, with slots on the faces they leave open', () => {
  const m = profileModel('4080-openbuilds-cbeam'), o = outline(m), s = section(m);
  assert.deepEqual([m.family, m.cells, m.absent, m.width, m.height], ['v-slot', [4, 2], [[2, 2], [3, 2]], 80, 40]);
  // a place for every open side of a cell, by the way it looks: the tops of the arms, and the floor of the C lower down
  assert.deepEqual(m.faces.top.map((p) => [p.index, p.at]), [[1, [-30, 20]], [2, [-10, 0]], [3, [10, 0]], [4, [30, 20]]]);
  assert.deepEqual(m.faces.back.map((p) => [p.index, p.at]), [[1, [40, -10]], [2, [-20, 10]], [2, [40, 10]]], 'the left arm\'s inside looks the same way as the outside on the right');
  assert.deepEqual(m.faces.front.map((p) => p.at), [[-40, -10], [-40, 10], [20, 10]]); assert.equal(m.faces.bottom.length, 4);
  assert.equal(Object.values(m.faces).flat().filter((p) => p.slot === 'slot-6-openbuilds').length, 14, '14 slots: 10 outside and 4 inside the C');
  assert.deepEqual(m.bores.map((b) => b.at), [[-30, -10], [-10, -10], [10, -10], [30, -10], [-30, 10], [30, 10]], 'a bore to each cell that is there');
  assert.equal(m.chambers.length, 5, 'three hollows along the bottom and one up each arm');
  assert.deepEqual(m.chambers.find((c) => c.at[0] === 0).ends, [8.2, 8.2], 'the middle one faces the bottom and the C\'s floor: full width both ways');
  assert.deepEqual(m.chambers.find((c) => c.at[0] === -20).ends, [8.2, 5.5], 'one beside an arm keeps to the cavity\'s width at the corner it shares with the arm\'s slots');
  // the outline: one outside loop round the C, clear of every hole, nothing outside the envelope or in the channel
  assert.equal(o.loops.length, 1 + 5 + 6); assert.ok(signedArea(o.loops[0]) > 0 && o.loops.slice(1).every((l) => signedArea(l) < 0));
  for (const [x, y] of o.loops[0]) assert.ok(Math.abs(x) <= 40 + 1e-9 && Math.abs(y) <= 20 + 1e-9 && !(Math.abs(x) < 20 - 1e-9 && y > 1e-9), `${x}, ${y} is on the C`);
  for (let i = 1; i < o.loops.length; i++) { assert.ok(o.loops[i].every((p) => inside(p, o.loops[0]))); for (let j = i + 1; j < o.loops.length; j++) assert.ok(gap(o.loops[i], o.loops[j]) > 0.5); }
  for (const [x, y] of [[0, 10], [-10, 5], [-10, -19], [-30, -10], [-22, 10], [-10, -1], [0, -3.2]]) assert.ok(!insideMetal(o.loops, [x, y]), `${x}, ${y} is the channel, a slot or a bore`);
  for (const [x, y] of [[-38, 18], [38, -18], [-10, -7], [0, -1], [-20, -1]]) assert.ok(insideMetal(o.loops, [x, y]), `${x}, ${y} is metal`);
  assert.deepEqual(profileFindings(m).map((f) => f.code), []);
  // about six cells of the 20 x 20 less what joining them saves, and its middle below the envelope's (the C is open upward)
  const one = section(profileModel('2020-openbuilds'), { torsion: false }).area; assert.ok(s.area > 4.5 * one && s.area < 6 * one, `${s.area} mm² against six cells of ${one}`);
  assert.ok(s.centroid[1] < -2 && Math.abs(s.centroid[0]) < 1e-6); assert.ok(s.inertiaX < s.inertiaY);
  // a V-Slot's mouth is its wheel's track
  const v = m.slots['slot-6-openbuilds']; assert.deepEqual([v.opening, v.mouth, v.trackWidth, v.trackAngle], [6.25, 9.15, 9.15, 90]);
  assert.deepEqual(slotPath(v).slice(0, 3).map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), [[-4.575, 0], [-3.125, 1.45], [-3.125, 1.8]], 'the V runs 1.45 down to the opening, then the lip\'s edge');
  // refusals: a pair outside the grid, every cell gone, a hole in the middle
  const grid = (absent, across = 3, up = 3) => ({ name: 'grid', part: 'profile', rules: { ...SETS['profile-2020-openbuilds'].rules, cells_across: rule(across, ''), cells_up: rule(up, ''), width: rule(20 * across, 'mm'), height: rule(20 * up, 'mm'), cells_absent: rule(absent) } });
  assert.throws(() => profileModel(grid('4,1')), /cells_absent is across,up pairs inside the grid of 3 by 3, counted from 1, with semicolons between: 2,2; 3,2 \(got "4,1"\)/);
  assert.throws(() => profileModel(grid('1,1', 1, 1)), /cells_absent leaves no cell/);
  assert.throws(() => outline(profileModel(grid('2,2'))), /its cells do not make one piece with one outside/);
  const ell = profileModel(grid('2,2; 3,2; 2,3; 3,3')); assert.equal(outline(ell).loops.length, 1 + 4 + 5, 'an L of five cells: four hollows and five bores'); assert.deepEqual(profileFindings(ell, { torsion: false }).filter((f) => f.level === 'fail'), []);
});

test('outline: closed loops from the interface values, the outside counter-clockwise and holes clockwise; a measured outline in its place', () => {
  const m = profileModel('2020-misumi-hfs5'), o = outline(m);
  assert.equal(o.measured, false); assert.equal(o.loops.length, 2);
  assert.ok(signedArea(o.loops[0]) > 0 && signedArea(o.loops[1]) < 0);
  const xs = o.loops[0].map((p) => p[0]), ys = o.loops[0].map((p) => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((x) => +x.toFixed(9)), [-10, 10, -10, 10]);
  // the slot as its family dimensions it: 6 between the lips, 12 under them 2 down, a floor 6 down
  assert.deepEqual(slotPath(m.slots['slot-6-misumi']).map(([u, v]) => [+u.toFixed(3), +v.toFixed(3)]), [[-3, 0], [-3, 2], [-6, 2], [-6, 2.95], [-2.95, 6], [2.95, 6], [6, 2.95], [6, 2], [3, 2], [3, 0]]);
  for (const [x, y] of [[0, 9], [5.5, 7.5], [0, 4.5], [9, 0], [0, 0]]) assert.ok(!insideMetal(o.loops, [x, y]), `${x}, ${y} is in a slot or the bore`);
  for (const [x, y] of [[8, 8], [5, 9], [3.5, 3.5], [0, 3]]) assert.ok(insideMetal(o.loops, [x, y]), `${x}, ${y} is metal`);
  // plain sections
  assert.equal(outline(profileModel(plain('tube', 30, 20, { wall: rule(2, 'mm'), corner_radius: rule(3, 'mm') }))).loops.length, 2);
  assert.equal(outline(profileModel(plain('channel', 30, 20, { wall: rule(2, 'mm') }))).loops[0].length, 8);
  // a measured outline: held to its format, turned the right way round, and used in place of the drawn one
  const file = { name: 'profile-2020-misumi-hfs5', source: 'a model measured by cad measure', licence: 'the maker\'s terms: measurements only', loops: [[[-10, -10], [-10, 10], [10, 10], [10, -10]], [[-2, -2], [2, -2], [2, 2], [-2, 2]]] };
  const read = readOutline(file);
  assert.ok(signedArea(read.loops[0]) > 0 && signedArea(read.loops[1]) < 0, 'the outside counter-clockwise and the hole clockwise, whichever way the file ran');
  const mm = profileModel('2020-misumi-hfs5', {}, { outline: file }), s = section(mm, { torsion: false });
  assert.equal(outline(mm).measured, true); assert.equal(outline(mm).source, file.source); within(s.area, 400 - 16, 1e-12, 'the measured area'); assert.equal(s.measured, true);
  assert.throws(() => readOutline({ ...file, licence: '' }), /an outline says its licence/);
  assert.throws(() => readOutline({ ...file, loops: [[[0, 0], [1, 1]]] }), /loop 1 needs at least 3 points/);
  assert.throws(() => readOutline({ ...file, unit: 'in' }), /an outline is in mm/);
  assert.throws(() => readOutline({ ...file, loops: [[[0, 0], [1, 0], ['2', 0]]] }), /a point is \[x, y\] in mm/);
  assert.throws(() => outline({ kind: 'slot' }), /give a profile's model \(profileModel\)/);
});
function insideMetal(loops, [x, y]) { // even-odd over every loop
  let inn = false;
  for (const loop of loops) for (let i = 0, n = loop.length; i < n; i++) { const [ax, ay] = loop[i], [bx, by] = loop[(i + 1) % n]; if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inn = !inn; }
  return inn;
}

test('section: every published profile\'s sheet beside its drawn outline, inside the allowance or said to be out', () => {
  const out = [];
  for (const name of frames.profiles()) {
    const m = profileModel(name), s = section(m), fails = profileFindings(m).filter((f) => f.level === 'fail');
    assert.deepEqual(fails, [], `${name} draws without a slot or bore running into anything`);
    for (const [k, c] of Object.entries(s.sheet)) {
      assert.ok(Math.abs(c.computed / c.sheet - 1 - c.difference) < 1e-12);
      const allow = (k === 'torsion' ? DEFAULTS.torsion : k.startsWith('inertia') ? DEFAULTS.inertia : DEFAULTS.section).value;
      if (!['area', 'inertiaX', 'inertiaY', 'torsion', 'massPerMetre'].includes(k)) continue;
      if (Math.abs(c.difference) > allow) out.push(`${name} ${k}`);
    }
  }
  // what is out is exactly what the check warns of, and each is explained in its set's _doc
  const warned = frames.profiles().flatMap((n) => profileFindings(profileModel(n)).filter((f) => f.code.startsWith('profile.section.')).map((f) => `${n} ${{ area: 'area', inertia_x: 'inertiaX', inertia_y: 'inertiaY', torsion_constant: 'torsion', mass_per_metre: 'massPerMetre' }[f.rule]}`));
  assert.deepEqual(warned.sort(), out.sort());
  for (const w of out) assert.match(SETS[w.split(' ')[0]]._doc, /the drawn outline (comes|leaves)/i, `${w} is out of the allowance: its _doc says why`);
  // MISUMI's 20 mm section, whose slot is fully dimensioned: the drawn area within 1% of the page's 183 mm²
  const s = section(profileModel('2020-misumi-hfs5'));
  within(s.area, 183, 0.01, 'area'); within(s.inertiaX, 7420, 0.01, 'Ix'); within(s.massPerMetre, 0.5, 0.02, 'mass');
  assert.deepEqual(Object.keys(s.sheet).sort(), ['area', 'inertiaX', 'inertiaY', 'massPerMetre']);
});

test('profileFindings: slots that fit, a bore that clears them and suits its tap, and sheet figures the outline bears out', () => {
  const codes = (name, change, given) => profileFindings(profileModel(name, change, given), { torsion: false }).map((f) => `${f.level} ${f.code}`);
  assert.deepEqual(codes('2020-misumi-hfs5'), []);
  assert.deepEqual([...new Set(codes('2020-misumi-hfs5', { bore_diameter: 9 }))], ['fail profile.bore.clear', 'fail profile.bore.tap', 'warn profile.section.area', 'warn profile.section.mass_per_metre']);
  assert.deepEqual(codes('2020-misumi-hfs5', { bore_diameter: 4.6 }), ['info profile.bore.tap'], '38% of an M5 thread is said, not failed: makers do it');
  assert.deepEqual(codes('2020-misumi-hfs5', { bore_diameter: 4.8 }), ['warn profile.bore.tap'], 'under a quarter, the thread is probably not this bore\'s');
  assert.match(profileFindings(profileModel('2020-misumi-hfs5', { bore_diameter: 4.6 }))[0].text, /leaves 38% of a full M5 thread \(its tap drill is Ø4\.2\)/);
  assert.deepEqual(codes('2020-misumi-hfs5', { bore_diameter: 3.5 }).filter((c) => c.includes('tap')), ['warn profile.bore.tap'], 'under the thread\'s root');
  assert.deepEqual(codes('2020-misumi-hfs5', { bore_thread: 'M7' }), ['warn profile.bore.thread']);
  assert.deepEqual(codes('2020-misumi-hfs5', { area: 150 }), ['warn profile.section.area']);
  // a slot too deep or too wide for its cell runs into its neighbours, or out of the section
  const slot = (more) => ({ sets: { 'slot-6-misumi': { ...SETS['slot-6-misumi'], rules: { ...SETS['slot-6-misumi'].rules, ...more } } } });
  assert.ok(codes('2020-misumi-hfs5', {}, slot({ cavity_width: rule(15, 'mm'), floor_width: rule(12, 'mm') })).includes('fail profile.slot.fit'));
  assert.ok(codes('2020-misumi-hfs5', {}, slot({ cavity_depth: rule(9, 'mm') })).includes('fail profile.bore.clear'));
  const f = profileFindings(profileModel('2020-misumi-hfs5', {}, slot({ cavity_width: rule(15, 'mm'), floor_width: rule(12, 'mm') })), { torsion: false }).find((x) => x.code === 'profile.slot.fit');
  assert.match(f.text, /the top face's slot runs into the front face's slot/); assert.equal(f.rule, 'cavity_width'); assert.deepEqual(f.at, [0, 10]);
});

test('bad input is refused by name, with what would be accepted', () => {
  assert.throws(() => profileModel('2020-misumi-hfs6'), /no profile "2020-misumi-hfs6" \(did you mean 2020-misumi-hfs5\?\)\. There are: /);
  assert.throws(() => profileModel(42), /give a profile's name/);
  assert.throws(() => profileModel(SETS.m5), /m5 is a thread, not a profile/);
  assert.throws(() => profileModel('2020-misumi-hfs5', { bore_diamter: 5 }), /has no figure "bore_diamter" \(did you mean bore_diameter\?\)/);
  assert.throws(() => profileModel(plain('girder', 20, 20)), /family is one of t-slot, v-slot, tube, round-tube, angle, channel, bar, round-bar, custom, printed \(got "girder"\)/);
  assert.throws(() => profileModel(plain('bar', 0, 20)), /width is a number above 0 \(got 0\)/);
  assert.throws(() => profileModel(plain('tube', 20, 20)), /a tube needs a wall above 0 and thinner than half its smaller side/);
  assert.throws(() => profileModel(plain('round-bar', 20, 25)), /a round section's width and height are both its diameter/);
  assert.throws(() => profileModel(plain('bar', 20, 20, { slot: rule('slot-6-misumi') })), /a bar has no slots/);
  assert.throws(() => profileModel(plain('t-slot', 20, 20, { cells_across: rule(1.5, '') })), /cells_across is a whole number of cells/);
  assert.throws(() => profileModel(plain('t-slot', 20, 20, { slot: rule('slot-7') })), /no slot family "slot-7"/);
  assert.throws(() => profileModel(plain('t-slot', 20, 20, { material: rule('unobtainium') })), /material names a material's rule set, and there is no "unobtainium"/);
  assert.throws(() => slotModel('slot-6-misumi', { floor_width: 2 }), /its flanks would start above the underside of its lips: closing from 12 to a floor of 2 at 45 degrees takes 5 of depth, and there is 4 below the lips/);
  assert.throws(() => slotModel('slot-6-misumi', { cavity_width: 5 }), /cavity_width is wider than opening, 6 \(got 5\)/);
  assert.throws(() => slotModel('slot-6-misumi', { track_width: 12, track_angle: 90 }), /its V mouth is 3 deep, more than lip_thickness \(2\)/);
  assert.throws(() => section({}), /give a profile's model/);
});

test('a V mouth and a sloped lip are drawn where a slot has them', () => {
  const v = slotModel('slot-6-misumi', { track_width: 9, track_angle: 90, lip_angle: 10 });
  const path = slotPath(v).map(([u, w]) => [+u.toFixed(3), +w.toFixed(3)]);
  assert.deepEqual(path.slice(0, 4), [[-4.5, 0], [-3, 1.5], [-3, 2], [-6, 2.529]]);
  assert.equal(v.mouth, 9);
  // a groove down the middle of the floor (MakerBeamXL's, for a screw's end under the nut), and straight walls with no floor_width
  const xl = slotModel('slot-3-makerbeam-xl');
  assert.deepEqual([xl.opening, xl.lip, xl.cavityWidth, xl.cavityDepth, xl.floorWidth, xl.flankAngle, xl.grooveWidth, xl.grooveDepth], [3, 1, 5.5, 3.5, 5.5, 90, 3, 1.5]);
  assert.deepEqual(slotPath(xl).map(([u, w]) => [+u.toFixed(3), +w.toFixed(3)]), [[-1.5, 0], [-1.5, 1], [-2.75, 1], [-2.75, 3.5], [-1.5, 3.5], [-1.5, 5], [1.5, 5], [1.5, 3.5], [2.75, 3.5], [2.75, 1], [1.5, 1], [1.5, 0]]);
  assert.throws(() => slotModel('slot-3-makerbeam-xl', { groove_width: 6 }), /groove_width is narrower than the floor, 5\.5 \(got 6\)/);
  assert.throws(() => slotModel('slot-6-misumi', { groove_width: 2 }), /a groove in the floor has both groove_width and groove_depth above 0/);
  // the small beams' slots say what they take: a plain M3 nut is 5.5 across flats, and goes in OpenBeam's and the XL's cavity, not MakerBeam's lips
  for (const n of ['slot-3-openbeam', 'slot-3-makerbeam-xl']) assert.ok(slotModel(n).cavityWidth >= 5.5 && slotModel(n).opening < 5.5 && /plain M3 nut/.test(SETS[n].rules.nut_family.rule), n);
  assert.match(SETS['slot-3-makerbeam'].rules.nut_family.rule, /square headed bolt/);
  for (const n of ['1010-makerbeam', '1515-makerbeam-xl', '1515-openbeam']) assert.deepEqual([profileModel(n).bores[0].thread, profileModel(n).bores[0].threadSet], ['M3', 'm3'], `${n} takes M3 hardware`);
  // the inch series name the kit's inch threads, and hold millimetres with the inch figure in the rule
  assert.deepEqual([profileModel('1010-8020').bores[0].threadSet, profileModel('1530-8020').bores[0].threadSet, profileModel('1515-8020').width], ['unc_1_4_20', 'unc_5_16_18', 38.1]);
  assert.match(SETS['slot-6-8020'].rules.opening.rule, /\.256 in/); assert.equal(slotModel('slot-6-8020').lipAngle, 2, '80/20\'s drop lock');
});

const triangles = (g) => jscad.geometries.geom3.toPolygons(g).reduce((n, p) => n + p.vertices.length - 2, 0);

test('a 300 mm 2040 beam: its mass within 2% of the sheet\'s mass per metre, its second moments within 5%, its link solid under 200 triangles', () => {
  // three makers' 40 x 20 sections, each from its own sheet: MISUMI HFS5-2040, item Profile 8 40x20 Line 5, Bosch Rexroth 20x40
  for (const name of ['2040-misumi-hfs5', '2040-item-5', '2040-bosch']) {
    const b = beamModel(name, { length: 300 }), p = b.profile;
    within(b.mass, p.sheet.massPerMetre * 300, 0.02, `${name} mass, g`);
    within(b.weight.sheet, p.sheet.massPerMetre * 300, 1e-12, `${name} the sheet's mass`);
    within(b.mass, (b.area * 300 * p.material.density) / 1000, 1e-12, `${name} mass is the section's area x length x density`);
    const s = section(p, { torsion: false });
    within(s.inertiaX, p.sheet.inertiaX, 0.05, `${name} Ix`); within(s.inertiaY, p.sheet.inertiaY, 0.05, `${name} Iy`);
    const link = beam(b, { display: 'link' });
    assert.ok(triangles(link) < 200, `${name} link: ${triangles(link)} triangles`); assert.equal(triangles(link), 12, 'a plain box');
    assert.deepEqual(jscad.measurements.measureBoundingBox(link), [[-20, -10, 0], [20, 10, 300]]);
    // the preview is the true section: its volume is the drawn area run the whole length
    const preview = beam(b);
    within(jscad.measurements.measureVolume(preview), s.area * 300, 1e-6, `${name} preview volume`);
    assert.deepEqual(jscad.measurements.measureBoundingBox(preview).map((c) => c.map((x) => +x.toFixed(6))), [[-20, -10, 0], [20, 10, 300]]);
    assert.ok(triangles(preview) > 500, 'every slot, bore and hollow');
    assert.equal(preview.model, b); assert.equal(preview.display, 'preview');
    assert.deepEqual(b.findings.map((f) => `${f.level} ${f.code}`), ['info beam.mass']);
  }
  assert.match(beamModel('2040-misumi-hfs5', { length: 300 }).findings[0].text, /264\.\d+ g, from the drawn section's 326\.2\d* mm² and al6n01-t5's density 2\.7 g\/cm³; the sheet's 0\.88 kg\/m gives 264 g \(\+0\.1%\)/);
});

test('a beam\'s mass and centre of mass from its section and its alloy, and the sheet\'s figure said where the section is not the maker\'s', () => {
  // a plain tube, exactly: 25² less 21², 100 mm of 6063 at 2.7 g/cm³
  const t = beamModel('tube', { length: 100, material: 'al6063-t5' });
  within(t.mass, (25 * 25 - 21 * 21) * 100 * 2.7 / 1000, 1e-9, 'tube mass'); assert.deepEqual(t.centreOfMass, [0, 0, 50]);
  // an angle's centre of mass is off the envelope's middle, toward its corner: x̄ = ȳ = (W² + W t - t²) / (2 (2W - t)) - W/2 for equal legs
  const W = 30, th = 3, a = beamModel(profileModel('angle', { width: W, height: W, wall: th, material: 'al6063-t5' }), { length: 200 }), c = (W * W + W * th - th * th) / (2 * (2 * W - th)) - W / 2;
  assert.ok(Math.abs(a.centreOfMass[0] - c) < 1e-6 && Math.abs(a.centreOfMass[1] - c) < 1e-6 && a.centreOfMass[2] === 100, `angle centre ${a.centreOfMass}`);
  // another material: the same section weighed in it, and the sheet's mass no longer compared
  const pla = beamModel('2040-misumi-hfs5', { length: 1000, material: 'al6063-t5' });
  assert.equal(pla.material.name, 'al6063-t5'); assert.equal(pla.material.given, true); assert.equal(pla.weight.sheet, null);
  assert.equal(pla.figures.massPerMetre.from, 'outline'); assert.equal(beamModel('2040-misumi-hfs5', { length: 1000 }).figures.massPerMetre.from, 'sheet');
  // a light section whose hollows the dimensions do not describe weighs heavy, and the beam says to weigh it by the sheet
  const light = beamModel('4040-bosch-l', { length: 300 }), warn = light.findings.find((f) => f.level === 'warn');
  assert.equal(warn.code, 'beam.mass'); assert.match(warn.text, /\+11\.\d% from the sheet's mass per metre, past the 5%.*weigh it by the sheet's 450 g/); assert.equal(warn.values.sheet, 450);
  // the figures to design with are beamFigures': the sheet's where it gives one
  assert.equal(light.figures.inertiaX.value, light.profile.sheet.inertiaX); assert.equal(light.figures.inertiaX.from, 'sheet');
  // a length past what it is sold in, and no material
  const long = beamModel('2040-misumi-hfs5', { length: 4500 });
  assert.ok(long.findings.some((f) => f.code === 'beam.length' && /longer than profile-2040-misumi-hfs5 is sold or cut in \(4000 mm\)/.test(f.text)), JSON.stringify(long.findings));
  const bare = beamModel(plain('bar', 20, 5), { length: 100 });
  assert.equal(bare.mass, null); assert.match(bare.findings[0].text, /names no material with a density/);
});

test('a beam\'s anchors: its ends, the bores in each end, and every place each face offers, with addresses along a face', () => {
  const b = beamModel('2040-misumi-hfs5', { length: 300, ends: { a: 'tapped' } });
  assert.deepEqual(Object.keys(b.anchors), ['a', 'b', 'a.1', 'a.2', 'b.1', 'b.2', 'top.1', 'top', 'top.2', 'bottom.1', 'bottom', 'bottom.2', 'front.1', 'front', 'back.1', 'back']);
  assert.deepEqual(b.anchors.a, { origin: [0, 0, 0], axis: [0, 0, -1], ref: [0, 1, 0] });
  assert.deepEqual(b.anchors.b, { origin: [0, 0, 300], axis: [0, 0, 1], ref: [0, 1, 0] });
  assert.deepEqual(b.anchors['b.2'], { origin: [10, 0, 300], axis: [0, 0, 1], ref: [0, 1, 0] });
  assert.deepEqual(b.anchors['top.2'], { origin: [10, 10, 150], axis: [0, 1, 0], ref: [0, 0, 1] });
  assert.deepEqual(b.anchors.front, { origin: [-20, 0, 150], axis: [-1, 0, 0], ref: [0, 0, 1] });
  assert.deepEqual(b.ends, { a: { kind: 'tapped', thread: 'M5' }, b: { kind: 'cut', thread: null } });
  assert.deepEqual(b.bores.map((x) => `${x.name} ${x.tapped}`), ['a.1 true', 'a.2 true', 'b.1 false', 'b.2 false']);
  assert.deepEqual(b.places.find((p) => p.name === 'top.2'), { name: 'top.2', face: 'top', index: 2, slot: 'slot-6-misumi', at: [10, 10], normal: [0, 1], along: [1, 0], depth: 6 });
  assert.deepEqual(beamAnchor(b, 'top@120'), { name: 'top', origin: [-10, 10, 120], axis: [0, 1, 0], ref: [0, 0, 1], distance: 120 });
  assert.equal(beamAnchor(b, 'top.2@-20').origin[2], 280); assert.equal(beamAnchor(b, 'back@50%').origin[2], 150); assert.equal(beamAnchor(b, 'front@-0').origin[2], 300);
  assert.deepEqual(beamAnchor(b, 'a.1'), { name: 'a.1', origin: [-10, 0, 0], axis: [0, 0, -1], ref: [0, 1, 0], distance: null });
  assert.throws(() => beamAnchor(b, 'top@320'), /"top@320" is past the end of profile-2040-misumi-hfs5 x 300: it is 300 mm long/);
  assert.throws(() => beamAnchor(b, 'top@120%'), /it is 300 mm long/);
  assert.throws(() => beamAnchor(b, 'top.3@10'), /has no "top\.3@10": it has a, b, a\.1/);
  assert.throws(() => beamAnchor(b, 'a@10'), /an end is where it is/);
  assert.throws(() => beamAnchor(b, 'top@ten'), /the distance is in mm from end a/);
  // a C-beam: the places inside the C are on the same faces, numbered after the outside ones of the same column or row
  const c = beamModel('4080-openbuilds-cbeam', { length: 500 });
  assert.deepEqual(c.places.filter((p) => p.face === 'top').map((p) => `${p.name} ${p.at}`), ['top.1 -30,20', 'top.2 -10,0', 'top.3 10,0', 'top.4 30,20']);
  assert.deepEqual(c.places.filter((p) => p.face === 'front').map((p) => `${p.name} ${p.index} ${p.at}`), ['front.1 1 -40,-10', 'front.2 2 -40,10', 'front.3 2 20,10']);
  // a round bar's link is a twelve-sided prism
  assert.equal(triangles(beam(profileModel('round-bar', { width: 12, height: 12, material: 'al6063-t5' }), { length: 50, display: 'link' })), 48);
});

test('a beam is bought: printable says so, for the beam, its solid and its profile', () => {
  const b = beamModel('2020-misumi-hfs5', { length: 200 });
  for (const x of [b, beam(b, { display: 'link' })]) assert.deepEqual(printable(x).map((f) => `${f.level} ${f.code}`), ['fail beam.printable']);
  assert.match(printable(b)[0].text, /profile-2020-misumi-hfs5 x 200 is a bought beam: cut from profile-2020-misumi-hfs5 stock and fitted, not printed/);
  assert.match(printable(b.profile)[0].text, /is a bought profile/);
  assert.equal(b.bought, true); assert.equal(b.printed, false);
  assert.throws(() => printable({}), /printable: give a beam's model/);
});

test('beams refuse bad input by name, with what would be accepted', () => {
  assert.throws(() => beamModel('2040-misumi-hfs5'), /length is a number above 0, in mm from end a to end b \(got nothing\)/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: -5 }), /length is a number above 0/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 300, lenght: 3 }), /no option "lenght": it takes length, ends, ops, material, given, cells, display/);
  assert.throws(() => beamModel('2040-misumi-hfs6', { length: 300 }), /no profile "2040-misumi-hfs6" \(did you mean 2040-misumi-hfs5\?\)/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 300, ends: 'mitred' }), /end a is cut or tapped \(got "mitred"\)/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 300, ends: { c: 'cut' } }), /ends names end a and end b \(got "c"\)/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 300, ends: ['cut'] }), /ends is cut or tapped for both ends, \[a, b\], or \{ a, b \}/);
  assert.throws(() => beamModel('tube', { length: 300, ends: 'tapped' }), /end a is tapped, and profile-tube has no bore with a thread to tap/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 300, material: 'unobtainium' }), /there is no "unobtainium"/);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 300, material: 7 }), /material is a material set's name/);
  assert.throws(() => beam('2040-misumi-hfs5', { length: 300, display: 'fine' }), /display is link or preview \(got "fine"\)/);
  assert.throws(() => beamAnchor({}, 'a'), /give a beam's model/);
});

test('operations on a beam: an end tapped M5 and an access hole 10 mm from the other end, both in its solid', () => {
  const V = jscad.measurements.measureVolume;
  const b = beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'tap', at: 'a', thread: 'M5' }, { op: 'access', at: 'top@-10', thread: 'M5' }] });
  // dimensioned from end a, in order along the beam, with a square cut at each end that has no cut of its own
  assert.deepEqual(b.ops.map((o) => `${o.op} ${o.at} ${o.distance}${o.implied ? ' implied' : ''}`), ['tap a 0', 'cut a 0 implied', 'access top@-10 290', 'cut b 300 implied']);
  const tap = b.ops[0], access = b.ops[2];
  // the tap through fixings: its tap drill, and 2 diameters of thread for aluminium (the engagement rule set)
  assert.deepEqual([tap.thread, tap.bores, tap.tapDrill, tap.major, tap.depth, tap.engagement.class, tap.engagement.enough], ['M5', ['a.1'], 4.2, 5, 10, 'aluminium', true]);
  assert.deepEqual(b.ends.a, { kind: 'tapped', thread: 'M5' }); assert.equal(b.bores.find((x) => x.name === 'a.1').tapped, true);
  // the access hole: the smallest of M5's clearances that passes a 4 mm key's corners, through the slot's floor into the bore
  assert.deepEqual([access.diameter, access.key, access.rule, access.place, access.depth], [5.3, 4, 'm5.clearance_close', 'top.1', 7.897]); // (7.9 to a true circle: the bore is drawn as a polygon of its area)
  assert.match(access.line, /access hole Ø5\.3 mm in top\.1, 290 mm from end a \(10 from end b\), 7\.9 mm deep for a 4 mm key/);
  assert.deepEqual(b.findings.filter((f) => f.level !== 'info').map((f) => f.text), []);
  // both in the solid: the tapped length drawn over the thread's roots, Ø5 for 10 mm round the Ø4.2 bore, and the
  // access hole through 1.9 mm of slot floor
  const whole = V(beam(beamModel('2020-misumi-hfs5', { length: 300 }))), cut = V(beam(b));
  const tapped = (Math.PI / 4) * (5 ** 2 - 4.2 ** 2) * 10, hole = (Math.PI / 4) * 5.3 ** 2 * 1.9;
  within(whole - cut, tapped + hole, 0.03, 'metal taken out');
  const onlyTap = whole - V(beam(beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'tap', at: 'a' }] })));
  within(onlyTap, tapped, 0.03, 'the tap alone'); within(whole - cut - onlyTap, hole, 0.05, 'the access hole alone');
  // ends: 'tapped' is a tap at that end
  assert.deepEqual(beamModel('2040-misumi-hfs5', { length: 300, ends: { b: 'tapped' } }).ops.filter((o) => o.op === 'tap').map((o) => `${o.at} ${o.bores}`), ['b b.1,b.2']);
});

test('a tap in a profile with no end bore is refused by name, as is bad input to any operation', () => {
  assert.throws(() => beamModel('tube-al-20x20x2', { length: 300, ops: [{ op: 'tap', at: 'a', thread: 'M5' }] }), /ops\[0\] \(tap\): profile-tube-al-20x20x2 has no bore in its ends to tap \(no bore_diameter\)/);
  const r = (ops, re) => assert.throws(() => beamModel('2020-misumi-hfs5', { length: 300, ops }), re);
  r([{ op: 'weld', at: 'a' }], /no operation "weld": there are cut, mitre, tap, access, drill, counterbore, pocket, notch, deburr/);
  r([{ op: 'tap', at: 'a', size: 5 }], /\(tap\): no "size": tap takes at, thread, depth/);
  r([{ op: 'tap', at: 'top@10' }], /a tap is in an end bore/);
  r([{ op: 'tap', at: 'a.2' }], /has no bore a\.2: it has a\.1, b\.1/);
  r([{ op: 'tap', at: 'a', thread: 'M4' }], /bore is Ø4\.2 mm, as wide as an M4 thread \(Ø4\): no thread can be cut in it/);
  r([{ op: 'drill', at: 'a', diameter: 5 }], /drill is on a face, not an end/);
  r([{ op: 'drill', at: 'top@400', diameter: 5 }], /"top@400" is past the end of profile-2020-misumi-hfs5 x 300: it is 300 mm long/);
  r([{ op: 'drill', at: 'top@100' }], /give a thread \(M5\) or a diameter in mm/);
  r([{ op: 'drill', at: 'top@100', thread: 'M5', through: 'half' }], /through is wall .* or beam/);
  r([{ op: 'mitre', at: 'a', angle: 90, about: 'top' }], /angle is from square, above 0 and under 90 degrees/);
  r([{ op: 'mitre', at: 'a', angle: 45, about: 'top', long: 'top' }], /long is the side the length is measured on, square to top: front or back/);
  r([{ op: 'mitre', at: 'a', angle: 45, about: 'top' }, { op: 'cut', at: 'a' }], /end a is cut once/);
  r([{ op: 'notch', at: 'top@100' }], /\(notch\): give length/);
  r([{ op: 'pocket', at: 'top@100', depth: 2 }], /give size, \[along, across\] in mm, or outline/);
  assert.throws(() => beamModel('tube', { length: 300, ops: [{ op: 'notch', at: 'top@100', length: 10 }] }), /a notch cuts a slot's lips away, and top\.1 is a closed face/);
  assert.throws(() => beamModel('2020-misumi-hfs5', { length: 300, ops: 'tap' }), /ops is a list of operations/);
});

test('a mitre: by angle about a named face, its length on the long side and said so, and cut from the link too', () => {
  const V = jscad.measurements.measureVolume;
  for (const [about, end] of [['top', 'a'], ['top', 'b'], ['front', 'a'], ['back', 'b']]) {
    const m = beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'mitre', at: end, angle: 45, about }] }), mitre = m.ops.find((o) => o.op === 'mitre');
    assert.equal(m.length, 300); assert.equal(mitre.shortLength, 280);
    // a 45° mitre on a 20 mm side takes half a 20 mm cube off the box, and the true section loses the same share
    within(V(beam(m, { display: 'link' })), 20 * 20 * 300 - 20 ** 3 / 2, 1e-9, `${about} ${end} link`);
    within(V(beam(m)), m.area * (300 - 10), 1e-6, `${about} ${end} preview`);
    assert.ok(m.findings.some((f) => f.code === 'beam.op' && f.level === 'info' && /its 300 mm is measured on the long side, (back|top); mitred, the (front|bottom) is 280 mm/.test(f.text)));
  }
  // a frame's corner: both ends at 45° about the top, the back long; 30° on a 40 mm side takes 23.09 mm
  const both = beamModel('2040-misumi-hfs5', { length: 500, ops: [{ op: 'mitre', at: 'a', angle: 45, about: 'top' }, { op: 'mitre', at: 'b', angle: 45, about: 'top' }] });
  assert.equal(both.ops.find((o) => o.op === 'mitre').shortLength, 420);
  assert.match(both.ops[0].line, /mitre end a 45° about top: the back is the long side, 500 mm \(the length\); the front is 420 mm/);
  assert.equal(beamModel('2040-misumi-hfs5', { length: 500, ops: [{ op: 'mitre', at: 'a', angle: 30, about: 'top' }] }).ops[0].cut, 23.094);
  assert.throws(() => beamModel('2040-misumi-hfs5', { length: 60, ops: [{ op: 'mitre', at: 'a', angle: 45, about: 'top' }, { op: 'mitre', at: 'b', angle: 45, about: 'top' }] }), /the short side would be -20 mm long/);
});

test('beam.op checks: a hole into a slot\'s lips or a bore\'s side, a tap deeper than the bore, a hole too near an end, thread engagement', () => {
  const ops = (o, p = '2020-misumi-hfs5', length = 300) => beamModel(p, { length, ops: o }).findings.filter((f) => f.level !== 'info');
  const say = (fs) => fs.map((f) => `${f.level} ${f.code}`);
  // a 6.6 mm clearance for M6 in a 6 mm slot opening breaks the lips; right through, the far slot's too
  const lips = ops([{ op: 'drill', at: 'front@150', thread: 'M6', through: 'beam' }]);
  assert.deepEqual(say(lips), ['warn beam.op', 'warn beam.op']); assert.match(lips[0].text, /\(Ø6\.6 mm\) is wider than front\.1's slot opening \(6 mm\): it breaks into the slot's lips/); assert.match(lips[1].text, /comes out in back\.1's slot/);
  // a hole off the bore's centre line cuts into its side
  const side = beamModel(profileModel('2020-misumi-hfs5', { bore_at: '2.5,0' }), { length: 300, ops: [{ op: 'drill', at: 'top@100', diameter: 4 }] }).findings.filter((f) => f.code === 'beam.op');
  assert.match(side[0].text, /breaks into the side of the bore at 2\.5, 0 \(Ø4\.2\), 2\.5 mm off its centre/);
  // a tap deeper than the bore runs, and taps at both ends that meet
  assert.match(ops([{ op: 'tap', at: 'a', depth: 320 }])[0].text, /is 320 mm deep, deeper than the bore, which runs the beam's 300 mm/);
  assert.match(ops([{ op: 'tap', at: 'a' }, { op: 'tap', at: 'b', depth: 25 }], '2020-misumi-hfs5', 30).find((f) => f.level === 'fail').text, /the taps at end a \(10 mm\) and end b \(25 mm\) run into each other in a 30 mm beam/);
  // too near an end: under half a diameter of metal warns, past the end fails, and a hole across a tapped thread fails
  assert.match(ops([{ op: 'drill', at: 'top@4', thread: 'M5' }])[0].text, /leaves 1\.25 mm of metal to end a, under the 2\.75 mm/);
  assert.match(ops([{ op: 'drill', at: 'top@2', thread: 'M5' }])[0].text, /runs off end a: its edge is 0\.75 mm past it/);
  const crossed = ops([{ op: 'tap', at: 'a' }, { op: 'drill', at: 'top@8', diameter: 3 }]);
  assert.deepEqual(say(crossed), ['fail beam.op']); assert.match(crossed[0].text, /crosses the M5 thread tapped 10 mm into a\.1: move it past 11\.5 mm/);
  assert.deepEqual(ops([{ op: 'tap', at: 'a' }, { op: 'drill', at: 'top@12', diameter: 3 }]), []);
  // a thread tapped in a 1.9 mm slot floor engages too little aluminium (fixings' engagement)
  const thin = ops([{ op: 'drill', at: 'top@100', thread: 'M5', kind: 'tap' }]);
  assert.deepEqual(say(thin), ['warn engagement.depth']); assert.match(thin[0].text, /tapped hole at top@100: an M5 screw 1\.897 mm into aluminium .* engagement\.aluminium asks 2 \(10 mm\)/);
  // the rest cut cleanly where they fit: a counterbore on a closed face, a pocket, a notch, deburring
  const t = beamModel('tube-al-40x20x2', { length: 300, ops: [{ op: 'counterbore', at: 'top@100', thread: 'M5' }, { op: 'pocket', at: 'front@200', size: [20, 8], depth: 2 }, { op: 'deburr', at: 'b' }] });
  assert.deepEqual(t.ops.map((o) => o.line), ['cut end a square', 'counterbore Ø10 x 5 mm for M5 cap head in top.1, 100 mm from end a, with a Ø5.5 mm hole through the wall (5 mm)', 'pocket 20 x 8 mm, corners R1.5, 2 mm deep in front.1, centred 200 mm from end a', 'deburr end b', 'cut end b square']);
  const n = beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'notch', at: 'top@50%', length: 12 }] });
  within(jscad.measurements.measureVolume(beam(beamModel('2020-misumi-hfs5', { length: 300 }))) - jscad.measurements.measureVolume(beam(n)), 2 * 12 * 3 * 2, 0.02, 'the notch takes both lips');
});

// ---------- the cut list ----------
const box = () => {
  const B = (L, ops) => beamModel('2020-misumi-hfs5', { length: L, ...(ops ? { ops } : {}) }), out = [];
  for (const [p, L] of [['x', 300], ['y', 260], ['z', 220]]) for (let i = 1; i <= 4; i++) out.push({ id: `${p}${i}`, beam: B(L, p === 'z' && i === 1 ? [{ op: 'tap', at: 'a', thread: 'M5' }, { op: 'access', at: 'top@-12.5', thread: 'M5' }] : null) });
  return out;
};

test('the cut list: a box of twelve beams in three lengths, marked, weighed by the sheet, packed into the lengths sold with a kerf and a trim', () => {
  const c = frames.cutList(box());
  // three lengths; the beam with an access hole is its own mark beside the three plain 220s
  assert.deepEqual(c.stock[0].cuts, [{ length: 300, count: 4 }, { length: 260, count: 4 }, { length: 220, count: 4 }]);
  assert.deepEqual(c.marks.map((m) => [m.mark, m.length, m.count, m.items.join(' '), m.grams, m.weighedBy]), [['A', 300, 4, 'x1 x2 x3 x4', 150, 'sheet'], ['B', 260, 4, 'y1 y2 y3 y4', 130, 'sheet'], ['C', 220, 3, 'z2 z3 z4', 110, 'sheet'], ['D', 220, 1, 'z1', 110, 'sheet']]);
  assert.deepEqual(c.marks[3].ops, ['tap M5 x 10 at a', 'access Ø5.3 at top.1@207.5']);
  // MISUMI sells 1000 and 4000 mm bars: four 1000s or one 4000 are both 4000 mm, so the one bar; 3 mm kerf, 10 mm trim
  const s = c.stock[0];
  assert.equal(s.supply, 'sold'); assert.deepEqual(s.buy, [{ length: 4000, count: 1 }]);
  assert.equal(s.bars[0].offcut, 4000 - 10 - 4 * 303 - 4 * 263 - 4 * 223); // 834
  assert.deepEqual(s.bars[0].cuts.slice(0, 2).map((x) => [x.mark, x.item, x.at]), [['A', 'x1', 10], ['A', 'x2', 313]]);
  assert.deepEqual(c.totals, { beams: 12, grams: 1560, bars: 1, bought: 4000, offcut: 834 });
  for (const k of ['kerf', 'trim', 'tolerance', 'stock']) for (const f of ['value', 'unit', 'rule', 'kind', 'source', 'checked']) assert.ok(c.rules[k][f] != null, `${k} has ${f}`);
  assert.equal(c.rules.kerf.value, 3); assert.equal(c.rules.trim.kind, 'estimate'); assert.equal(frames.CUT_DEFAULTS.stock.kind, 'estimate');
  const text = frames.cutListText(c).join('\n');
  assert.match(text, /profile-2020-misumi-hfs5: 3 lengths, 4 × 300, 4 × 260, 4 × 220 mm/);
  assert.match(text, /buy 1 × 4000 mm; kerf 3, trim 10; 834 mm left over/);
  assert.match(text, /bar 1, 4000 mm: trim 10, A 300 \(x1\), .*; offcut 834/);
  // a workshop's own saw: a thinner kerf, as given
  const own = frames.cutList(box(), { kerf: 2, trim: 5 });
  assert.equal(own.stock[0].offcut, 4000 - 5 - 4 * 302 - 4 * 262 - 4 * 222); assert.equal(own.rules.kerf.kind, 'measured');
  assert.throws(() => frames.cutList(box(), { blade: 2 }), /cutList: no option "blade": it takes kerf, trim, tolerance, stock/);
  assert.throws(() => frames.cutList(box(), { kerf: -1 }), /cutList: kerf is a number in mm, at least 0/);
  assert.throws(() => frames.cutList([{ id: 'x1' }]), /cutList: beams\[0\] is a beam's model \(beamModel\) or \{ id, beam \}/);
});

test('packing: first-fit decreasing never puts more on a bar than fits with its kerfs and trim, and picks the bars that buy the least', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 200; t++) {
    const sold = [[1000, 4000], [6000], [250, 500, 1000, 1500, 2000], [3048, 6146.8]][t % 4], kerf = [3, 0, 2.4][t % 3], trim = [10, 0, 5][(t >> 1) % 3];
    const pieces = Array.from({ length: 1 + Math.floor(rnd() * 30) }, (_, i) => ({ id: i, length: Math.round((20 + rnd() * (t % 7 ? 1200 : 7000)) * 10) / 10 }));
    const r = frames.packBars(pieces, sold, { kerf, trim });
    for (const b of r.bars) {
      assert.ok(sold.includes(b.length), `a bar is a length sold (${b.length})`);
      const used = trim + b.cuts.reduce((s, x) => s + x.length + kerf, 0);
      assert.ok(used <= b.length + 1e-6, `bar of ${b.length} holds ${used}`); assert.ok(Math.abs(b.offcut - (b.length - used)) < 1e-6);
      assert.ok(b.cuts.every((x, i) => i === 0 || x.at >= b.cuts[i - 1].at + b.cuts[i - 1].length + kerf - 1e-6), 'cuts in order with a kerf between');
    }
    const longest = Math.max(...sold);
    assert.equal(r.bars.flatMap((b) => b.cuts).length + r.unpacked.length, pieces.length, 'every piece is on a bar or unpacked');
    assert.ok(r.unpacked.every((p) => p.length + kerf + trim > longest), 'only a piece no bar holds is unpacked');
  }
  // a short bar where it holds the rest: 900 + 400 in [1000, 4000] buys 1000 + 1000, not 4000
  assert.deepEqual(frames.packBars([{ length: 900 }, { length: 400 }], [1000, 4000]).buy, [{ length: 1000, count: 2 }]);
  assert.deepEqual(frames.packBars([{ length: 600 }, { length: 600 }, { length: 600 }], [1000, 4000]).buy, [{ length: 1000, count: 3 }]); // (3000 mm of metal, not 4000)
  assert.deepEqual(frames.packBars([{ length: 600 }, { length: 600 }, { length: 600 }], [1300, 4000]).buy, [{ length: 1300, count: 2 }]);
  assert.throws(() => frames.packBars([{ length: 0 }], [1000]), /packBars: pieces is a list of \{ length \}, each above 0 mm/);
  assert.throws(() => frames.packBars([{ length: 10 }], []), /packBars: lengths is a list of the lengths sold/);
});

test('frame.cut: a beam longer than any length sold, lengths the cut tolerance cannot hold apart, beams that must match; a maker\'s cut lengths and an assumed stock', () => {
  const B = (id, L, p = '2020-misumi-hfs5') => ({ id, beam: beamModel(p, { length: L }) });
  const c = frames.cutList([B('long', 3995), B('x1', 300), B('x2', 300.4), B('x3', 300.4)]);
  const say = c.findings.map((f) => `${f.level} ${f.text}`);
  assert.ok(say.some((t) => /^fail long: 3995 mm of profile-2020-misumi-hfs5 is longer than any length it is sold in \(1000, 4000 mm\): a bar gives 3987 mm after a 10 mm trim and a 3 mm cut/.test(t)), say.join('\n'));
  assert.ok(say.some((t) => /^warn profile-2020-misumi-hfs5: mark C \(x1\) at 300 mm and mark B \(x2, x3\) at 300\.4 mm differ by 0\.4 mm, less than two cuts at ±0\.5 mm can hold apart/.test(t)), say.join('\n'));
  assert.ok(say.some((t) => /^info mark B \(x2, x3\): 2 beams of 300\.4 mm, each cut to ±0\.5 mm, may differ by up to 1 mm/.test(t)));
  assert.deepEqual(c.stock[0].unpacked.map((u) => u.item), ['long']); assert.ok(c.findings.every((f) => f.code === 'frame.cut'));
  // no sold length in its set: 6 m assumed (an estimate); cut to length by the maker: each beam bought at its length
  const g = frames.cutList([B('g1', 500, 'angle-al-25x25x3'), B('g2', 500, 'angle-al-25x25x3')]).stock[0];
  assert.deepEqual([g.supply, g.lengths, g.buy], ['assumed', [6000], [{ length: 6000, count: 1 }]]);
  assert.match(frames.cutListText(frames.cutList([B('g1', 500, 'angle-al-25x25x3')])).join('\n'), /no sold length in its set: 6000 mm assumed/);
  const cutBy = profileModel({ ...published.find((s) => s.name === 'profile-2020-misumi-hfs5'), name: 'test-cut' }, { lengths: [] });
  const m = frames.cutList([{ id: 'c1', beam: beamModel(cutBy, { length: 450 }) }, { id: 'c2', beam: beamModel(cutBy, { length: 4500 }) }]);
  assert.deepEqual([m.stock[0].supply, m.stock[0].buy], ['cut', [{ length: 450, count: 1 }]]);
  assert.match(m.findings.find((f) => f.level === 'fail').text, /c2: 4500 mm of test-cut is longer than the 4000 mm the maker cuts it to/);
});

test('a cut-and-drill sheet: to scale, each operation from end a to 0.1 mm, the face up named, each tap\'s thread and depth', () => {
  const c = frames.cutList(box()), d = c.marks.find((m) => m.mark === 'D'), sh = frames.beamSheet(d.beam, { mark: d.mark, items: d.items });
  assert.equal(sh.scale, 2); assert.deepEqual(sh.faces, ['top']);
  // the access hole 12.5 mm from end b of 220: 207.5 from end a, on the sheet as 207.5
  assert.deepEqual(sh.dimensions, [{ op: 3, distance: 207.5, text: '207.5' }]);
  assert.match(sh.svg, />207\.5</); assert.match(sh.svg, />top face up: seen from the top, end a on the left</);
  assert.match(sh.svg, />Mark D: profile-2020-misumi-hfs5 x 220\.0 mm</); assert.match(sh.svg, />1 off: z1/);
  assert.match(sh.svg, />\(1\) a\.1: tap M5 x 10 deep</); assert.match(sh.svg, />tap M5 in bore a\.1, 10 mm deep/);
  assert.match(sh.svg, /width="297mm"/); assert.ok(!/NaN|undefined/.test(sh.svg), 'no NaN on the sheet');
  // a mitre about the top is seen from the top; a hole in the front gets the front's view; long beams drawn smaller
  const m = frames.beamSheet(beamModel('2020-misumi-hfs5', { length: 1200, ops: [{ op: 'mitre', at: 'b', angle: 45, about: 'top' }, { op: 'drill', at: 'front@100.25', diameter: 5 }] }));
  assert.deepEqual([m.scale, m.faces], [10, ['top', 'front']]); assert.match(m.svg, />100\.3</);
  assert.throws(() => frames.beamSheet({}), /beamSheet: give a beam's model/);
});

test('slot nuts: every published nut fits the slot it is made for, weighs what its block does, and says what its hold rests on', () => {
  const { slotNutModel, nutFit, slotNut, slotNuts } = frames, names = slotNuts();
  assert.ok(names.length >= 40, 'the makers\' nuts are in the catalogue');
  // slot 6 (20 mm series) and slot 8 (30 and 40 mm series) each have a slide-in, a drop-in and a roll-in, M3 to M8 where made
  const has = (o, kind, t) => names.some((n) => n.startsWith(`slot-nut-${o}-`) && n.endsWith(`-${t}-${kind}`));
  for (const [o, kinds] of [['6', ['slide-in', 'drop-in', 'roll-in', 'hammer', 'square']], ['8', ['slide-in', 'drop-in', 'roll-in', 'hammer', 'square', 't-bolt']]]) for (const k of kinds) assert.ok(['m3', 'm4', 'm5', 'm6', 'm8'].some((t) => has(o, k, t)), `a ${k} for slot ${o}`);
  for (const t of ['m3', 'm4', 'm5', 'm6', 'm8']) assert.ok(names.some((n) => n.includes(`-${t}-`)), `an ${t} nut`);
  for (const name of names) {
    const n = slotNutModel(name), slot = slotModel(n.slot);
    assert.deepEqual(nutFit(n, slot).filter((f) => f.level === 'fail'), [], `${name} goes in ${n.slot}`);
    assert.match(name, /^slot-nut-\d+(-[a-z0-9]+)*-m\d-(slide-in|drop-in|roll-in|hammer|square|t-bolt)$/);
    assert.equal(name.split('-').slice(-2).join('-').replace(/^m\d-/, ''), n.nutKind); assert.equal(n.thread.toLowerCase(), name.match(/-(m\d)-/)[1]);
    assert.ok(n.hold && n.hold.value > 0 && n.hold.unit === 'N', `${name} says what it holds`);
    if (n.hold.kind !== 'spec') { assert.equal(n.hold.kind, 'estimate'); assert.match(n.hold.rule, /estimate until it is tested \(Frames 2\.13\)/); }
    else assert.match(n.hold.source, /Bosch Rexroth/, 'only Rexroth rates a pull among these makers');
    // its mass is its drawn block's: the solid's volume at steel's density
    const g = slotNut(n), v = jscad.measurements.measureVolume(g);
    within(v, n.volume, 0.03, `${name}'s solid against its volume`); within(n.mass, (n.volume * n.density.value) / 1000, 1e-3, `${name}'s mass`);
    assert.ok(n.mass > 0.3 && n.mass < 20, `${name} weighs ${n.mass} g`);
  }
  // a figure from the sheet: Rexroth's 6 mm sliding block holds 3000 N with M5; MISUMI's HNTT5 is 10 x 10, 3.3 under its 0.8 tongue
  assert.deepEqual([slotNutModel('slot-nut-6-bosch-m5-slide-in').hold.value, slotNutModel('slot-nut-6-bosch-m5-slide-in').hold.kind], [3000, 'spec']);
  const h = slotNutModel('slot-nut-6-misumi-m5-slide-in'); assert.deepEqual([h.width, h.length, h.height, h.tongueWidth, h.tongueHeight], [10, 10, 3.3, 5.8, 0.8]);
  // an M3's hold is its screw's proof load where that is the less
  assert.match(slotNutModel('slot-nut-8-misumi-m3-slide-in').hold.rule, /^The screw's proof load, 2918 N/);
  // a nut too wide, too tall, or no wider than the opening
  const s6 = slotModel('slot-6-misumi'), fit = (change) => nutFit(slotNutModel('slot-nut-6-misumi-m5-slide-in', change), s6).map((f) => `${f.level} ${f.rule}`);
  assert.deepEqual(fit({ width: 13 }), ['fail width']); assert.deepEqual(fit({ height: 5 }), ['fail height']); assert.deepEqual(fit({ width: 6 }), ['fail width']); assert.deepEqual(fit({ tongue_height: 2.5 }), ['warn tongue_height']);
  assert.match(nutFit(slotNutModel('slot-nut-6-misumi-m5-slide-in', { width: 13 }), s6)[0].text, /it is 13 mm across, and slot-6-misumi is 12 mm wide under its lips: it does not go in/);
  // a turned nut may be as wide as the cavity (it turns until it jams); a slid one may not
  assert.deepEqual(nutFit(slotNutModel('slot-nut-8-bosch-m6-drop-in'), slotModel('slot-8-bosch')), []);
  assert.deepEqual(fit({ width: 12 }), ['fail width']);
  // the solid: pulled up under the lips, its tongue in the opening
  const bb = jscad.measurements.measureBoundingBox(slotNut('slot-nut-6-misumi-m5-slide-in'));
  assert.deepEqual(bb.map((p) => p.map((x) => +x.toFixed(3))), [[-5, -5, -5.3], [5, 5, -1.2]]);
  assert.throws(() => slotNutModel('slot-nut-6-misumi-m7-slide-in'), /no slot nut "slot-nut-6-misumi-m7-slide-in"/);
  assert.throws(() => slotNutModel('slot-nut-6-misumi-m5-slide-in', { weight: 3 }), /has no figure "weight"/);
});

test('nutFor: an M5 drop-in for a 6 mm slot\'s face, and M8 refused there, naming the nuts that are made for it', () => {
  const { nutFor } = frames;
  const n = nutFor('profile-2020-openbuilds', 'top', 'M5', { kind: 'drop-in' });
  assert.equal(n.name, 'slot-nut-6-openbuilds-m5-drop-in'); assert.equal(n.nutKind, 'drop-in'); assert.equal(n.thread, 'M5'); assert.equal(n.face, 'top'); assert.deepEqual(n.fits, []);
  assert.throws(() => nutFor('profile-2020-openbuilds', 'top', 'M8'), (e) => /no M8 nut is made for profile-2020-openbuilds's top face \(slot-6-openbuilds/.test(e.message) && /M5 drop-in \(slot-nut-6-openbuilds-m5-drop-in\)/.test(e.message));
  // any kind where none is asked: the strongest of those made for the slot's family
  assert.equal(nutFor('profile-2020-misumi-hfs5', 'top', 'M5').name, 'slot-nut-6-misumi-m5-slide-in');
  // MISUMI makes no M5 drop-in for its 6 mm slot: refused, naming the M3 and M4 drop-ins and the M5s it does make
  assert.throws(() => nutFor('profile-2020-misumi-hfs5', 'front', 'M5', { kind: 'drop-in' }), (e) => /M4 drop-in \(slot-nut-6-misumi-m4-drop-in\)/.test(e.message) && /M5 slide-in \(slot-nut-6-misumi-m5-slide-in\)/.test(e.message));
  // a family's nuts by its nut_family: Motedis' B-type 6 mm slot takes Rexroth's and Motedis' own; its I-type 8 mm, item's family
  assert.ok(nutFor('profile-2020-motedis-b6', 'top', 'M4', { kind: 'drop-in' }).name === 'slot-nut-6-bosch-m4-drop-in');
  assert.equal(nutFor('profile-4040-motedis-i8', 'back', 'M8').name, 'slot-nut-8-i-motedis-m8-roll-in');
  // a nut of your own, in a slot of the kit's
  const own = { ...SETS['slot-nut-6-misumi-m5-slide-in'], name: 'my-nut' }; own.rules = { ...own.rules, nut_kind: { ...own.rules.nut_kind, value: 'drop-in' }, length: { ...own.rules.length, value: 5.5 } };
  assert.equal(nutFor('profile-2020-misumi-hfs5', 'top', 'M5', { kind: 'drop-in', given: { sets: { 'my-nut': own } } }).name, 'my-nut');
  assert.throws(() => nutFor('profile-2020-misumi-hfs5', 'side', 'M5'), /face is top, bottom, front or back/);
  assert.throws(() => nutFor('profile-2020-misumi-hfs5', 'top.2', 'M5'), /top face has 1 slot/);
  assert.throws(() => nutFor('profile-2020-misumi-hfs5', 'top', 'M5', { kind: 'wing' }), /kind is slide-in, drop-in, roll-in, hammer, t-bolt, square or hex|kind is slide-in, drop-in/);
  assert.throws(() => nutFor('profile-2020-misumi-hfs5', 'top', 'M5', { sort: 1 }), /no option "sort"/);
  assert.throws(() => nutFor('profile-tube-al-25x25x2', 'top', 'M5'), /top face has 0 slots|closed/);
});

test('a printed carrier slides into the slot of a profile drawn from the same rules, the printer\'s fit clear all round', () => {
  const { carrierModel, carrier, CARRIER_DEFAULTS } = frames;
  for (const [profile, face, thread, holds] of [['profile-3030-misumi-hfs6', 'top', 'M5', 'nut'], ['profile-2020-misumi-hfs5', 'front', 'M3', 'nut'], ['profile-3030-bosch', 'back', 'M4', 'nut'], ['profile-3030-misumi-hfs6', 'bottom', 'M3', 'insert'], ['profile-2020-openbuilds', 'top', 'M3', 'nut']]) {
    const m = carrierModel(profile, { face, thread, holds }), p = profileModel(profile), place = p.faces[face][0], c = 0.2;
    assert.equal(m.clearance, c, 'the X1C\'s fit');
    // the carrier's section, placed in the profile's: outside the metal and the printer's fit clear of every loop of it
    const sec = m.section.map(([y, z]) => [place.at[0] + y * place.along[0] + z * place.normal[0], place.at[1] + y * place.along[1] + z * place.normal[1]]);
    const loops = outline(p).loops, least = Math.min(...loops.map((l) => gap(sec, l)));
    assert.ok(least >= c - 1e-6 && least <= c + 0.01, `${m.name} in ${profile}: ${least} mm from the metal, the fit ${c}`);
    assert.ok(!loops.slice(1).some((l) => sec.every((q) => inside(q, l))), 'not in a hollow');
    assert.ok(sec.every((q) => Math.abs(q[0]) <= p.width / 2 + 1e-9 && Math.abs(q[1]) <= p.height / 2 + 1e-9), 'inside the envelope: nothing stands proud of the face');
    assert.ok(Math.abs(m.least - c) < 1e-3);
    // it prints floor down without supports, its first layer one piece, and says what it holds and weighs
    const by = Object.fromEntries(m.findings.map((f) => [f.code, f]));
    assert.equal(by['carrier.printable'].level, 'pass', by['carrier.printable'].text); assert.equal(by['carrier.first-layer'].level, 'pass');
    assert.ok(m.hold.value > 100 && m.grams > 0.2 && m.grams < 5, `${m.name}: ${m.hold.value} N, ${m.grams} g`);
    const g = carrier(m, { pose: 'print' }), bb = jscad.measurements.measureBoundingBox(g);
    assert.ok(Math.abs(bb[0][2]) < 1e-9 && Math.abs(bb[1][2] - (m.levels.bottom - m.levels.top)) < 1e-6, 'laid on the bed');
    within(jscad.measurements.measureVolume(g), m.volume, 1e-6, 'grams from the solid');
    if (holds === 'nut') assert.ok(m.levels.nutBottom <= m.levels.bottom - CARRIER_DEFAULTS.floor.value * 0.2 + 1e-9 && m.levels.roofTop - m.levels.top >= 2 * 0.42 - 1e-9, 'floor under the nut, plastic over it');
  }
  // a strip of four at 20 mm, and sized from a load: twice it, or refused
  const s = carrierModel('slot-8-misumi', { thread: 'M5', count: 4, pitch: 20 });
  assert.deepEqual([s.count, s.total, s.at], [4, 73, [6.5, 26.5, 46.5, 66.5]]);
  const one = carrierModel('slot-8-misumi', { thread: 'M5' }); within(s.grams, 4 * one.grams + (3 * (20 - one.length) * Math.abs(signedArea(one.section)) * 1.26) / 1000, 0.01, 'a strip weighs its carriers and the plain lengths between them');
  const strong = carrierModel('slot-8-misumi', { thread: 'M3', load: 250 });
  assert.ok(strong.hold.value >= 500 - 1e-6 && strong.margin >= 2, `${strong.hold.value} N for a 250 N load`);
  assert.equal(carrierModel('slot-8-misumi', { thread: 'M5', load: 1000 }).findings.find((f) => f.code === 'carrier.hold').level, 'fail');
  // refused by name: a nut too big for the slot, an insert with too little wall, bad options
  assert.throws(() => carrierModel('slot-6-misumi', { thread: 'M5' }), /an M5 hex nut does not fit a carrier in slot-6-misumi: .* A smaller thread, an insert/);
  assert.throws(() => carrierModel('slot-6-misumi', { thread: 'M3', holds: 'insert' }), /an M3 insert's/);
  assert.throws(() => carrierModel('slot-8-misumi', { thread: 'M5', count: 3 }), /needs a pitch/);
  assert.throws(() => carrierModel('slot-8-misumi', { thread: 'M5', count: 2, pitch: 5 }), /puts the nuts/);
  assert.throws(() => carrierModel('slot-8-misumi', { thread: 'M5', size: 3 }), /no option "size"/);
  assert.throws(() => carrierModel('slot-8-misumi', {}), /thread is the screw's/);
  assert.throws(() => carrier(one, { pose: 'upside' }), /pose is slot or print/);
});

test('a printer\'s measured slot_fit (the slot coupon) draws a carrier before its general fit, and says so', () => {
  const { carrierModel } = frames, x1c = JSON.parse(fs.readFileSync(new URL('x1c.json', rulesDir), 'utf8'));
  const plain = carrierModel('slot-8', { thread: 'M5' }), values = Object.fromEntries(Object.entries(x1c.rules).filter(([, r]) => typeof r.value === 'number').map(([k, r]) => [k, r.value]));
  const measured = carrierModel('slot-8', { thread: 'M5', printer: { name: 'x1c', rules: { ...x1c.rules, slot_fit: { value: 0.15, unit: 'mm', kind: 'measured', source: 'the slot coupon' } } } });
  assert.deepEqual([plain.clearance, plain.rests[0].name], [0.2, 'x1c.fit']);
  assert.deepEqual([measured.clearance, measured.rests[0].name, measured.rests[0].kind], [0.15, 'x1c.slot_fit', 'measured']);
  assert.ok(Math.abs(measured.least - 0.15) < 1e-3, `stands ${measured.least} mm clear`);
  assert.match(measured.findings.find((f) => f.code === 'carrier.fit').text, /offset in by x1c\.slot_fit 0\.15 mm/);
  // a design's plain values (v.x1c) as well
  assert.equal(carrierModel('slot-8', { thread: 'M5', printer: { ...values, slot_fit: 0.25 } }).clearance, 0.25);
});

test('joins: a blind join taps the end of a and puts an access hole across b in line with it, through to the slot the head sits in, with one button-head screw', () => {
  const { joinModel, JOINS, JOIN_STIFFNESS } = frames;
  const A = beamModel('2020-misumi-hfs5', { length: 200 }), B = beamModel('2020-misumi-hfs5', { length: 300 });
  const j = joinModel('blind', { beam: A, end: 'a' }, { beam: B, address: 'back@120' });
  // the tap: as deep as aluminium's 2 diameters of M5 (10 mm), the screw's 1 mm tip room and 1.5 diameters more (7.5 mm)
  assert.deepEqual(j.a.ops, [{ op: 'tap', at: 'a.1', thread: 'M5', depth: 18.5 }]);
  // the access hole: across from back.1 on the same line, at the same distance, through every wall to the back slot
  assert.deepEqual(j.b.ops, [{ op: 'access', at: 'front.1@120', thread: 'M5', through: 'beam' }]);
  assert.deepEqual([j.b.place, j.b.slot, j.b.distance, j.b.across], ['back.1', 'slot-6-misumi', 120, { place: 'front.1', slot: 'slot-6-misumi' }]);
  assert.deepEqual(j.screws, [{ screw: 'M5 button', thread: 'M5', head: 'button', bore: 'a.1' }]);
  assert.equal(j.fitting, null); assert.deepEqual(j.findings, []);
  // the ops as the beams take them: the access hole 14 mm deep, from the front face to the back slot's cavity
  const hole = beamModel(B.profile, { length: 300, ops: j.b.ops }).ops.find((o) => o.op === 'access');
  assert.deepEqual([hole.diameter, hole.depth, hole.through, hole.distance], [5.3, 14, 'beam', 120]);
  assert.match(hole.line, /access hole Ø5\.3 mm in front\.1, 120 mm from end a, 14 mm deep \(through to the far side\) for a 4 mm key/);
  assert.equal(beamModel(A.profile, { length: 200, ops: j.a.ops }).ops[0].engagement.enough, true);
  // an end-tap join: a clearance hole right through b instead, and a cap screw
  const e = joinModel('end-tap', { beam: A, end: 'a' }, { beam: B, address: 'back@120' });
  assert.deepEqual([e.b.ops, e.screws[0].screw], [[{ op: 'drill', at: 'front.1@120', thread: 'M5', kind: 'clearance', through: 'beam' }], 'M5 cap']);
  assert.equal(joinModel('blind', { beam: A, end: 'b' }, { beam: B, address: 'top@-20' }, { screw: 'M5x12 button' }).screws[0].screw, 'M5x12 button');
  // every kind has a stiffness, each an estimate; a kind whose fitting comes later adds nothing yet, and says so
  assert.deepEqual(Object.keys(JOIN_STIFFNESS), Object.keys(JOINS));
  for (const s of Object.values(JOIN_STIFFNESS)) for (const v of [s.bending, s.twist]) { assert.equal(v.kind, 'estimate'); assert.match(v.source, /joint rig \(issue 264\)/); }
  assert.deepEqual([j.stiffness.bending, j.stiffness.twist, j.stiffness.end], [1.5e6, 3e5, { rx: 3e5, ry: 1.5e6, rz: 1.5e6 }]);
  const br = joinModel('bracket', { beam: A, end: 'a' }, { beam: B, address: 'back@120' }, { fitting: 'bought' });
  assert.deepEqual([br.a.ops, br.b.ops, br.screws, br.findings.map((f) => `${f.level} ${f.code}`)], [[], [], [], ['warn join.fitting']]);
  assert.match(br.findings[0].text, /A bought corner bracket comes with Frames 2\.6 \(bought\).*A printed one is drawn now: give "fitting": "printed"/);
  // printed: the caller draws it (fitting.mjs), so no warning; its estimate stays until the fitting's own replaces it
  const pb = joinModel('bracket', { beam: A, end: 'a' }, { beam: B, address: 'back@120' }, { fitting: 'printed' });
  assert.deepEqual([pb.findings, pb.fitting], [[], { what: 'a corner bracket', later: 'Frames 2.6 (bought)', choice: 'printed', made: true, printed: 'bracket' }]);
  assert.equal(pb.stiffness.bending, 3e6 * 0.3); // a printed bracket: a share of a bought one's
  assert.deepEqual(['gusset', 'splice', 'cube', 'printed'].map((k) => JOINS[k].printed ?? null), ['gusset', 'splice', null, null]);
  const big = beamModel('4040-generic', { length: 300 });
  assert.equal(joinModel('splice', { beam: big, end: 'b' }, { beam: big, address: 'a' }).stiffness.scale, 8); // (40 mm over 20, cubed)
  // a closed face where the head needs a slot: join.geometry fails, and nothing is derived
  const tube = beamModel('tube-al-20x20x2', { length: 300 }), shut = joinModel('blind', { beam: A, end: 'a' }, { beam: tube, address: 'back@120' });
  assert.deepEqual([shut.a.ops, shut.screws, shut.findings.map((f) => `${f.level} ${f.code}`)], [[], [], ['fail join.geometry']]);
  assert.match(shut.findings[0].text, /a blind join meets a slot, and profile-tube-al-20x20x2 x 300's back\.1 is a closed face: join it to a face with a slot, or use an end-tap join/);
});

test('joins refuse by name: an unknown kind, an end that has no bore or two, b the wrong sort of place, a screw or fitting the kind does not take', () => {
  const { joinModel } = frames;
  const A = beamModel('2020-misumi-hfs5', { length: 200 }), B = beamModel('2020-misumi-hfs5', { length: 300 }), W = beamModel('2040-misumi-hfs5', { length: 200 }), T = beamModel('tube-al-20x20x2', { length: 200 });
  const r = (kind, a, b, o, re) => assert.throws(() => joinModel(kind, a, b, o), re);
  r('weld', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, {}, /no kind of join "weld": there are blind, end-tap, bracket, gusset, cube, hidden, anchor, mitre, pivot, splice, printed/);
  r('blind', { beam: A, end: 'top' }, { beam: B, address: 'back@10' }, {}, /a is an end of the beam, a or b, or one bore in it \(a\.1\)/);
  r('blind', { beam: A, end: 'a' }, { beam: B, address: 'b' }, {}, /b is a face with a distance \(back@120, top@50%\) on the other beam, as a blind join meets it/);
  r('splice', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, {}, /b is an end, a or b on the other beam, as a splice join meets it/);
  r('blind', { beam: A, end: 'a' }, { beam: B, address: 'back' }, {}, /b names a face with a distance from its end a, where the end of a meets it: back@120/);
  r('blind', { beam: A, end: 'a' }, { beam: B, address: 'back@320' }, {}, /"back@320" is past the end of .* it is 300 mm long/);
  r('blind', { beam: T, end: 'a' }, { beam: B, address: 'back@10' }, {}, /profile-tube-al-20x20x2 has no bore in its ends to tap, and a blind join screws into one: join it with a bracket or a gusset/);
  r('blind', { beam: W, end: 'a' }, { beam: B, address: 'back@10' }, {}, /end a of profile-2040-misumi-hfs5 x 200 has 2 bores \(a\.1, a\.2\), each meeting .* give a join for each, a: a\.1 and a\.2/);
  r('blind', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, { screw: 'M5 nut' }, /screw names a screw by its thread and head/);
  r('bracket', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, { screw: 'M5 cap' }, /a bracket join's screws come with its fitting \(a printed one's thread is its slot nuts', its lengths chosen by its fastens\): leave screw out/);
  r('blind', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, { fitting: 'printed' }, /a blind join has no fitting to choose: its screws hold it/);
  r('bracket', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, { fitting: 'glued' }, /fitting is printed or bought \(got "glued"\)/);
  // the 2040's bores, one join each
  assert.deepEqual(joinModel('blind', { beam: W, end: 'a.2' }, { beam: B, address: 'back@10' }).a.ops, [{ op: 'tap', at: 'a.2', thread: 'M5', depth: 18.5 }]);
  assert.throws(() => beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'access', at: 'top@50', thread: 'M5', through: 'all' }] }), /through is wall \(through one wall, the default\) or beam \(through every wall on its line, to the slot on the far side/);
});

test('joins: a mitre cuts both ends at the angle given, about the face the corner lies in, and still waits for its key', () => {
  const { joinModel } = frames;
  const A = beamModel('2020-misumi-hfs5', { length: 300 }), B = beamModel('2020-misumi-hfs5', { length: 300 });
  const j = joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }, { mitre: { angle: 45, a: { about: 'top', long: 'front' }, b: { about: 'top', long: 'back' } } });
  assert.deepEqual([j.a.ops, j.b.ops], [[{ op: 'mitre', at: 'a', angle: 45, about: 'top', long: 'front' }], [{ op: 'mitre', at: 'a', angle: 45, about: 'top', long: 'back' }]]);
  assert.match(j.findings[0].text, /The mitres are cut; the corner key or plate comes with Frames 2\.3/);
  // the ops as beamModel takes them: 300 mm on the long side, 280 on the short
  assert.equal(beamModel(A.profile, { length: 300, ops: j.a.ops }).ops.find((o) => o.op === 'mitre').shortLength, 280);
  // without the cuts (cad works them out from where the beams are), nothing is cut; a bad angle or face is refused by name
  assert.deepEqual(joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }).a.ops, []);
  assert.throws(() => joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }, { mitre: { angle: 90, a: { about: 'top', long: 'front' }, b: { about: 'top', long: 'back' } } }), /mitre\.angle is each end's cut from square, above 0 and under 90 degrees \(got 90\)/);
  assert.throws(() => joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }, { mitre: { angle: 45, a: { about: 'side', long: 'front' }, b: { about: 'top', long: 'back' } } }), /mitre\.a is \{ about, long \}, each a face/);
});

// ---------- printed fittings ----------
const PRINTER = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42, print_gap: 0.3, foot: 0.15 };
const faces = (g) => jscad.geometries.geom3.toPolygons(g).map((p) => p.vertices.map((v) => [...v]));
const prints = async (g, what) => { const { check } = await import('@rulecad/printcheck'); assert.deepEqual(check(faces(g), PRINTER).filter((f) => f.level !== 'pass').map((f) => `${f.code}: ${f.text}`), [], what); };
const coded = (m, code) => m.findings.filter((f) => f.code === code);

test('a printed corner bracket for 2020 and for 4040 from one generator: each passes printcheck and reports its mass, stiffness and margin at a named load', async () => {
  const { bracketModel, bracket, FITTING_DEFAULTS } = frames;
  const pla = JSON.parse(fs.readFileSync(new URL('../rules/pla.json', import.meta.url), 'utf8')).rules;
  const want = { '2020-misumi-hfs5': { width: 20, thread: 'M5', slot: 'slot-6-misumi', major: 5 }, '4040-item-8': { width: 40, thread: 'M8', slot: 'slot-8-item', major: 8 } };
  const seen = {};
  for (const [name, w] of Object.entries(want)) {
    const m = bracketModel(name), slot = slotModel(w.slot);
    seen[name] = m;
    // drawn from the profile's rules: its cell's width, the largest thread a slot nut is made for, a tongue keyed into the slot
    assert.equal(m.fitting, 'bracket'); assert.equal(m.width, w.width); assert.equal(m.thread, w.thread);
    for (const k of ['a', 'b']) {
      const tg = m.tongues[k], nut = frames.nutFor(name, 'top', w.thread, { kind: frames.slotNutModel(tg.nut).nutKind });
      assert.equal(tg.width, +(slot.opening - 2 * 0.2).toFixed(3), 'the opening less the fit each side');
      assert.equal(tg.depth, +(slot.lip - nut.tongueHeight - 0.2).toFixed(3), 'the lip less the nut\'s tongue less the fit');
    }
    // sized from the load: no thinner than the thread's major diameter, and about twice the margin
    assert.ok(m.thickness >= w.major * FITTING_DEFAULTS.least.value - 1e-9);
    // (sized to between 2 and 3 times, unless the thread's least thickness or a screw sold made it thicker)
    assert.ok(m.margin >= 2 && (m.margin <= FITTING_DEFAULTS.margin.value * FITTING_DEFAULTS.spread.value || m.sized === w.major || m.thickness > m.sized), `${name}: margin ${m.margin}`);
    // thick enough that a length sold engages the nut fully and stops 0.3 mm or more short of the slot's floor
    const [scr] = coded(m, 'fitting.screw'), nutB = frames.slotNutModel(m.tongues.b.nut), tip = m.screws[0].length - m.thickness;
    assert.equal(scr.level, 'pass'); assert.ok(tip >= slot.lip - nutB.tongueHeight + Math.min(nutB.tongueHeight + nutB.height, w.thread === 'M5' ? 4.7 : 6.8) - 1e-9 && tip <= slot.cavityDepth - 0.3 + 1e-9, `${name}: the tip ${tip} mm under the face`);
    // the named load, the margin, the stiffness and the mass, as findings in the kit's one shape
    assert.equal(m.load.force, 100); assert.match(m.load.what, /^100 N across beam a at the upright's screw, [\d.]+ mm from the corner/);
    const [margin] = coded(m, 'fitting.margin');
    assert.equal(margin.level, 'pass'); assert.equal(margin.values.load, 100); assert.equal(margin.values.margin, m.margin);
    assert.ok(Math.abs(margin.values.margin - pla.strength.value / margin.values.stress) < 0.01, 'the margin is the strength over the peak stress');
    assert.ok(m.stiffness.linear > 0 && m.stiffness.bending > 0); assert.equal(m.stiffness.kind, 'derived'); assert.match(m.stiffness.rule, /issue 264/);
    assert.ok(Math.abs(m.stiffness.bending - (100 * m.screwAt ** 2) / m.deflection) / m.stiffness.bending < 0.01, 'the bending stiffness is F s² over the movement');
    assert.equal(coded(m, 'fitting.stiffness')[0].values.bending, m.stiffness.bending);
    assert.ok(m.grams > 0); assert.ok(Math.abs(m.grams - (m.volume * pla.density.value) / 1000) < 1e-3); assert.equal(coded(m, 'fitting.mass')[0].values.grams, m.grams);
    // the screws: one in each leg, square to it, at the same distance from the corner; the nut holds twice the pull
    assert.deepEqual(m.screws.map((s) => [s.leg, s.axis]), [['b', [0, -1, 0]], ['a', [-1, 0, 0]]]);
    assert.ok(coded(m, 'fitting.nut').every((f) => f.level === 'pass'));
    // print-ready: printcheck passes it as it is laid to print, its first layer the whole L
    const g = bracket(m), bb = jscad.measurements.measureBoundingBox(g);
    await prints(g, `${name} bracket`);
    assert.deepEqual(bb[0].map((x) => +x.toFixed(2)), [-m.tongues.a.depth, -m.tongues.b.depth, 0].map((x) => +x.toFixed(2)));
    assert.deepEqual(bb[1].map((x) => +x.toFixed(2)), [m.leg, m.leg, m.width]);
    // fitted: the corner line on the slots' centre
    const fb = jscad.measurements.measureBoundingBox(bracket(m, { pose: 'fit' }));
    assert.equal(+fb[0][2].toFixed(3), -m.width / 2); assert.equal(+fb[1][2].toFixed(3), m.width / 2);
  }
  // one generator: the 4040 bracket is the 2020's drawn larger, the same findings
  assert.deepEqual(seen['4040-item-8'].findings.map((f) => f.code), seen['2020-misumi-hfs5'].findings.map((f) => f.code));
  assert.ok(seen['4040-item-8'].grams > seen['2020-misumi-hfs5'].grams);
});

test('a bracket is sized from its load, a brace makes it stiffer, and its finite elements are cached', async () => {
  const { bracketModel, bracket } = frames;
  const light = bracketModel('2020-misumi-hfs5'), heavy = bracketModel('2020-misumi-hfs5', { load: 300 });
  assert.ok(heavy.sized > light.sized && heavy.thickness > light.thickness, 'a heavier load, a thicker leg'); assert.ok(heavy.margin >= 2, `margin ${heavy.margin}`);
  assert.match(coded(heavy, 'fitting.size')[0].text, /sized from the load/); assert.match(coded(light, 'fitting.size')[0].text, /as thin as M5 lets it be, 5 mm/);
  const braced = bracketModel('2020-misumi-hfs5', { brace: true });
  assert.equal(braced.screwAt, light.screwAt, 'the brace keeps the screws where they were'); assert.ok(braced.pocket > 0);
  assert.ok(braced.stiffness.linear > 1.5 * light.stiffness.linear, `braced ${braced.stiffness.linear} N/mm against ${light.stiffness.linear}`);
  assert.ok(braced.margin > light.margin); assert.ok(braced.grams > light.grams);
  await prints(bracket(braced), 'the braced bracket, its head pockets teardrops');
  // cached: a second model asks the cache before it solves, and takes what the cache holds
  const store = new Map(), cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  const once = bracketModel('2020-misumi-hfs5', { cache });
  assert.ok(store.size >= 1);
  const fake = new Map([...store].map(([k, v]) => [k, { ...v, stress: v.stress / 2 }]));
  const again = bracketModel('2020-misumi-hfs5', { cache: { get: (k) => fake.get(k), set() {} } });
  assert.equal(once.thickness, 6.4); assert.equal(again.thickness, 6.4);
  assert.equal(again.fe.stress, +(once.fe.stress / 2).toFixed(3), 'the cache\'s answer is taken, not solved again');
});

test('a bracket refuses what it cannot draw, by name', () => {
  const { bracketModel } = frames;
  assert.throws(() => bracketModel('2020-misumi-hfs5', { thickness: 4 }), /bracketModel: no option "thickness": it takes other, face/);
  assert.throws(() => bracketModel('2020-misumi-hfs5', { brace: 'yes' }), /brace is true or false \(got "yes"\)/);
  assert.throws(() => bracketModel('2020-misumi-hfs5', { load: 0 }), /load is the design load in N, above 0/);
  assert.throws(() => bracketModel('2020-misumi-hfs5', { head: 'hex' }), /head is cap or button \(got "hex"\)/);
  assert.throws(() => bracketModel('2020-misumi-hfs5', { width: 9 }), /a bracket 9 mm wide leaves no room round M5's 8.5 mm head: 10.5 mm or more/);
  assert.throws(() => bracketModel('2020-misumi-hfs5', { thread: 'M8' }), /no M8 nut is made for profile-2020-misumi-hfs5's top face/);
  assert.throws(() => bracketModel('4040-misumi-hfs8'), /The kit has no nut sets for that family/);
  assert.throws(() => bracketModel('2020-nobody'), /bracketModel: no profile "2020-nobody"/);
  assert.throws(() => bracketModel('2020-misumi-hfs5', { face: 'side' }), /face is top, bottom, front or back/);
});

test('gusset plates (L, T, cross) and a splice plate from one generator: each passes printcheck, keyed into the slot, sized and weighed', async () => {
  const { plateModel, plate } = frames;
  const screws = { L: 4, T: 6, cross: 8, splice: 4 }, out = {};
  for (const shape of Object.keys(screws)) {
    const m = plateModel('2020-misumi-hfs5', { shape });
    out[shape] = m;
    assert.equal(m.fitting, shape === 'splice' ? 'splice' : 'gusset'); assert.equal(m.screws.length, screws[shape]); assert.equal(m.width, 20);
    assert.ok(m.margin >= 2, `${shape}: margin ${m.margin}`); assert.ok(m.grams > 0); assert.ok(m.stiffness.linear > 0);
    assert.match(m.load.what, /^100 N in the plate's plane across beam a at its farthest screw/);
    // every screw lies on a slot's centre line: y = 0 along b, x = 0 along a (a splice: both along x)
    for (const s of m.screws) assert.ok(s.leg === 'b' || shape === 'splice' ? Math.abs(s.at[1]) < 1e-9 : Math.abs(s.at[0]) < 1e-9, `${shape}: ${s.at}`);
    // two screws on an arm stand the larger of the head and the longest nut that fits apart, and a millimetre: the
    // 17 mm M5 roll-in for slot-6-misumi, so 18 mm
    assert.equal(m.pitch, 18);
    await prints(plate(m), `${shape} plate`);
    // fitted, its tongues reach into the slots below its contact face
    const fb = jscad.measurements.measureBoundingBox(plate(m, { pose: 'fit' }));
    assert.equal(+fb[0][2].toFixed(3), -m.tongues[0].depth); assert.equal(+fb[1][2].toFixed(3), m.thickness);
  }
  assert.ok(out.cross.grams > out.T.grams && out.T.grams > out.L.grams);
  assert.throws(() => plateModel('2020-misumi-hfs5', { shape: 'Y' }), /plateModel: shape is L, T, cross or splice \(got "Y"\)/);
  assert.throws(() => plateModel('2020-misumi-hfs5', { count: 0 }), /count is the screws on each arm, a whole number from 1 to 6 \(got 0\)/);
});

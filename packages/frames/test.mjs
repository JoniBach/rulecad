import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as frames from '@rulecad/frames';
import { SETS } from './catalogue.mjs';
import { gap, inside } from './section.mjs';

const { profileModel, slotModel, slotPath, outline, section, profileFindings, readOutline, polygonSection, torsionConstant, signedArea, DEFAULTS } = frames;
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
  assert.deepEqual(Object.keys(pkg.dependencies), ['@rulecad/rules']);
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
});

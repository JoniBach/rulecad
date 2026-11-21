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

test('the catalogue holds every profile, slot family, slot nut, bought fitting, rail, V-wheel and eccentric the rules package has, and what they name', () => {
  const parts = published.filter((s) => ['profile', 'slot', 'slot_nut', 'fitting', 'rail', 'wheel', 'eccentric'].includes(s.part));
  for (const s of published.filter((x) => x.part === 'wheel')) for (const k of ['wheel_bearing', 'wheel_eccentric']) assert.deepEqual(SETS[s.rules[k].value], published.find((x) => x.name === s.rules[k].value), `${s.name}.${k} is in catalogue.mjs`);
  assert.deepEqual(frames.boughtFittings(), published.filter((s) => s.part === 'fitting').map((s) => s.name).sort());
  for (const s of published.filter((x) => x.part === 'fitting' && x.rules.slot)) assert.equal(SETS[s.rules.slot.value]?.part, 'slot', `${s.name}.slot names a slot family`);
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
  const v = m.slots['slot-6-openbuilds']; assert.deepEqual([v.opening, v.mouth, v.trackWidth, v.trackAngle], [6.25, 9.16, 9.16, 90]);
  assert.deepEqual(slotPath(v).slice(0, 3).map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), [[-4.58, 0], [-3.125, 1.455], [-3.125, 1.8]], 'the V runs 1.455 down to the opening, then the lip\'s edge');
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
  // dimensioned from end a, in their place along the beam, with a square cut at each end that has no cut of its own
  assert.deepEqual(b.ops.map((o) => `${o.op} ${o.at} ${o.distance}${o.implied ? ' implied' : ''}`), ['tap a 0', 'cut a 0 implied', 'access top@-10 290', 'cut b 300 implied']);
  // the order they are done in, as the sheet numbers them: the ends cut, the holes across from end a, the taps last
  assert.deepEqual(frames.workOrder(b).map((i) => `${b.ops[i].op} ${b.ops[i].at}`), ['cut a', 'cut b', 'access top@-10', 'tap a']);
  assert.throws(() => frames.workOrder({}), /workOrder: give a beam's model \(beamModel\), with its ops \(got \{\}\)/);
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
  // a workshop's own tolerance, given, is taken before the maker's cut_tolerance (MISUMI's ±0.5 is for its cut service)
  const own = frames.cutList([B('x2', 300.4), B('x3', 300.4)], { tolerance: 1 });
  assert.equal(own.stock[0].tolerance, 1); assert.ok(own.findings.some((f) => /each cut to ±1 mm, may differ by up to 2 mm/.test(f.text) && f.refs.rule === 'tolerance (given)'));
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
  // in the order they are done: both ends cut (1, 2), the access hole (3), the tap last (4)
  assert.match(sh.svg, />\(4\) a\.1: tap M5 x 10 deep</); assert.match(sh.svg, />Operations, in the order to do them: the ends cut, the holes from end a, the taps</);
  assert.deepEqual([...sh.svg.matchAll(/>(\d)\.<\/text><text[^>]*>([a-z]+) {2}·/g)].map((x) => `${x[1]} ${x[2]}`), ['1 cut', '2 cut', '3 access', '4 tap']); assert.match(sh.svg, />tap M5 in bore a\.1, 10 mm deep/);
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
    assert.match(name, /^slot-nut-\d+(-[a-z0-9]+)*-m\d-(slide-in|drop-in|roll-in|hammer|square|t-bolt|hex)$/);
    assert.equal(name.split('-').slice(-2).join('-').replace(/^m\d-/, ''), n.nutKind); assert.equal(n.thread.toLowerCase(), name.match(/-(m\d)-/)[1]);
    assert.ok(n.hold && n.hold.value > 0 && n.hold.unit === 'N', `${name} says what it holds`);
    if (n.hold.kind !== 'spec') { assert.equal(n.hold.kind, 'estimate'); assert.match(n.hold.rule, /estimate until it is tested \(Frames 2\.13\)/); }
    else assert.match(n.hold.source, /Bosch Rexroth/, 'only Rexroth rates a pull among these makers');
    // its mass is its block's (body, tongue, less the hole) at steel's density; the solid is that block cut back to its
    // slot's flanks, so it is no more than the block and most of it (the most cut, 12 %, is Rexroth's M4 drop-in, 10 mm
    // across in a cavity that closes in to 5.9 mm)
    const g = slotNut(n), v = jscad.measurements.measureVolume(g);
    assert.ok(v <= n.volume * 1.03 && v >= n.volume * 0.85, `${name}'s solid, ${v} mm³, against its block's ${n.volume}`); within(n.mass, (n.volume * n.density.value) / 1000, 1e-3, `${name}'s mass`);
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
  // and held inside its slot's cavity: a nut's sides are shaped to the flanks it sits on. slot-6-misumi is 12 mm wide
  // under its 2 mm lips, its flanks closing at 45 degrees to a 5.9 mm floor 6 mm down, so they start at
  // 6 - (12 - 5.9) / 2 = 2.95 mm and the cavity is 5.9 + 2 x (6 - d) wide at a depth d below that. A drop-in 10 mm
  // across, its body 2 to 5.3 mm down: at 5.3 mm the cavity is 5.9 + 1.4 = 7.3 mm wide, so no point of the solid lies
  // more than 3.65 mm off the slot's middle there (the block drawn whole reached 5). Two such nuts at one height in
  // the neighbouring slots of a 2020 then stand apart, as they do in the aluminium
  const half = (d) => (d <= 2.95 ? 6 : 5.9 / 2 + (6 - d));
  const pts = jscad.geometries.geom3.toPolygons(slotNut('slot-nut-6-misumi-m4-drop-in')).flatMap((q) => q.vertices);
  for (const [, y, z] of pts) if (-z > 2 + 1e-6) assert.ok(Math.abs(y) <= half(-z) + 1e-3, `a point ${y.toFixed(3)} mm off the middle at ${(-z).toFixed(3)} mm down, past the flank at ${half(-z).toFixed(3)}`);
  assert.ok(pts.some(([, y, z]) => Math.abs(-z - 5.3) < 1e-6 && Math.abs(Math.abs(y) - 3.65) < 1e-3), 'it reaches the flank at its floor');
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
  assert.deepEqual(j.b.ops, [{ op: 'access', at: 'front.1@120', thread: 'M5', head: 'button', through: 'beam' }]);
  assert.deepEqual([j.b.place, j.b.slot, j.b.distance, j.b.across], ['back.1', 'slot-6-misumi', 120, { place: 'front.1', slot: 'slot-6-misumi' }]);
  assert.deepEqual(j.screws, [{ screw: 'M5 button', thread: 'M5', head: 'button', bore: 'a.1' }]);
  assert.equal(j.fitting, null); assert.deepEqual(j.findings, []);
  // the ops as the beams take them: the access hole 14 mm deep, from the front face to the back slot's cavity
  const hole = beamModel(B.profile, { length: 300, ops: j.b.ops }).ops.find((o) => o.op === 'access');
  assert.deepEqual([hole.diameter, hole.depth, hole.through, hole.distance], [5.3, 14, 'beam', 120]);
  // sized for the button head's key, 3 mm (m5.button_key), not a cap screw's 4 mm; the hole is still the smallest clearance past its corners
  assert.deepEqual([hole.key, hole.rule], [3, 'm5.clearance_close']);
  assert.match(hole.line, /access hole Ø5\.3 mm in front\.1, 120 mm from end a, 14 mm deep \(through to the far side\) for a 3 mm key/);
  assert.throws(() => beamModel(B.profile, { length: 300, ops: [{ op: 'access', at: 'front@120', thread: 'M5', head: 'pan' }] }), /head is the screw's head the key turns, cap, button, countersunk \(got "pan"\)/);
  assert.equal(beamModel(A.profile, { length: 200, ops: j.a.ops }).ops.find((x) => x.op === 'tap').engagement.enough, true);
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
  assert.match(br.findings[0].text, /A corner bracket is added once one is chosen.*A printed one is drawn now: give "fitting": "printed"\. A bought one is a set: give "fitting": "fitting-motedis-bracket-20-b6"/);
  // printed: the caller draws it (fitting.mjs), so no warning; its estimate stays until the fitting's own replaces it
  const pb = joinModel('bracket', { beam: A, end: 'a' }, { beam: B, address: 'back@120' }, { fitting: 'printed' });
  assert.deepEqual([pb.findings, pb.fitting], [[], { what: 'a corner bracket', choice: 'printed', made: true, printed: 'bracket' }]);
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
  r('bracket', { beam: A, end: 'a' }, { beam: B, address: 'back@10' }, { fitting: 'glued' }, /fitting is printed or bought, or a bought fitting.s set by name \(fitting-motedis-bracket-20-b6\) \(got "glued"\)/);
  // the 2040's bores, one join each
  assert.deepEqual(joinModel('blind', { beam: W, end: 'a.2' }, { beam: B, address: 'back@10' }).a.ops, [{ op: 'tap', at: 'a.2', thread: 'M5', depth: 18.5 }]);
  assert.throws(() => beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'access', at: 'top@50', thread: 'M5', through: 'all' }] }), /through is wall \(through one wall, the default\) or beam \(through every wall on its line, to the slot on the far side/);
});

test('joins: a mitre cuts both ends at the angle given, about the face the corner lies in, and still waits for its key', () => {
  const { joinModel } = frames;
  const A = beamModel('2020-misumi-hfs5', { length: 300 }), B = beamModel('2020-misumi-hfs5', { length: 300 });
  const j = joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }, { mitre: { angle: 45, a: { about: 'top', long: 'front' }, b: { about: 'top', long: 'back' } } });
  assert.deepEqual([j.a.ops, j.b.ops], [[{ op: 'mitre', at: 'a', angle: 45, about: 'top', long: 'front' }], [{ op: 'mitre', at: 'a', angle: 45, about: 'top', long: 'back' }]]);
  assert.match(j.findings[0].text, /The mitres are cut; the corner key or plate comes with a later release/);
  // the ops as beamModel takes them: 300 mm on the long side, 280 on the short
  assert.equal(beamModel(A.profile, { length: 300, ops: j.a.ops }).ops.find((o) => o.op === 'mitre').shortLength, 280);
  // without the cuts (cad works them out from where the beams are), nothing is cut; a bad angle or face is refused by name
  assert.deepEqual(joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }).a.ops, []);
  assert.throws(() => joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }, { mitre: { angle: 90, a: { about: 'top', long: 'front' }, b: { about: 'top', long: 'back' } } }), /mitre\.angle is each end's cut from square, above 0 and under 90 degrees \(got 90\)/);
  assert.throws(() => joinModel('mitre', { beam: A, end: 'a' }, { beam: B, address: 'a' }, { mitre: { angle: 45, a: { about: 'side', long: 'front' }, b: { about: 'top', long: 'back' } } }), /mitre\.a is \{ about, long \}, each a face/);
});

// ---------- printed fittings ----------
// printcheck's figures read from the kit's x1c rule set, as cad's own checks read the project's printer (a value
// written as another rule's name, support_gap's "layer", is that rule's)
const X1C = JSON.parse(fs.readFileSync(new URL('x1c.json', rulesDir), 'utf8')).rules;
const x1c = (k) => { const v = X1C[k]?.value, n = typeof v === 'string' ? X1C[v]?.value : v; if (typeof n !== 'number') throw new Error(`x1c.json gives no number for ${k} (got ${JSON.stringify(v)})`); return n; };
const PRINTER = Object.fromEntries(['bed', 'overhang', 'layer', 'support_gap', 'bridge', 'line', 'print_gap', 'foot'].map((k) => [k, x1c(k)]));
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

// ---------- panels, doors and ends ----------
test('a panel is a sheet by material and thickness, cut to size, weighed by its maker\'s density; a thickness not stocked warns', () => {
  const { panelModel, panel, SHEETS } = frames;
  const p = panelModel('acrylic', 3, { size: [300, 200], holes: [{ thread: 'M3', at: [10, 10] }] });
  assert.deepEqual([p.size, p.thickness, p.sheet], [[300, 200], 3, 'acrylic']);
  const hole = (Math.PI * p.holes[0].diameter ** 2) / 4, area = 300 * 200 - (4 - Math.PI) * 1 - hole;
  assert.ok(Math.abs(p.grams - (area * 3 * SHEETS.acrylic.density.value) / 1000) < 1e-3, `${p.grams} g`);
  assert.equal(SHEETS.acrylic.density.kind, 'spec'); assert.match(SHEETS.acrylic.density.source, /ISO 1183/);
  assert.deepEqual(p.findings.map((f) => [f.code, f.level]), [['panel.size', 'info'], ['panel.thickness', 'pass']]);
  assert.equal(panelModel('acrylic', 3.5, { size: [100, 100] }).findings[1].level, 'warn');
  const bb = jscad.measurements.measureBoundingBox(panel(p));
  assert.deepEqual(bb.map((v) => v.map((x) => +x.toFixed(2) + 0)), [[0, 0, 0], [300, 200, 3]]);
  assert.throws(() => panelModel('glass', 3, { size: [1, 1] }), /sheet is one of acrylic, polycarbonate, aluminium \(got "glass"\)/);
  assert.throws(() => panelModel('acrylic', 3, { size: [100] }), /size is \[x, y\] in mm/);
  assert.throws(() => panelModel('acrylic', 3, { size: [100, 100], holes: [{ thread: 'M3', at: [99, 50] }] }), /hole 1 at \[99, 50\] is off the 100 x 100 mm panel/);
});

test('the parts that hold a panel: a clip, a corner, an in-slot edge, a slot cover and a gasket strip, each print-ready and weighed', async () => {
  const { panelClipModel, panelClip, panelCornerModel, panelCorner, panelEdgeModel, panelEdge, slotCoverModel, slotCover, gasketStripModel, gasketStrip } = frames;
  const clip = panelClipModel('2020-misumi-hfs5', { sheet: 3 });
  // its step as deep as the sheet; then thick enough that a sold screw fits the slot nut; the panel's edge clear of the screw
  assert.equal(clip.section.some(([y, z]) => z === 3 && y > clip.edge), true); assert.ok(clip.height > 3 && clip.margin >= 2, `${clip.height} ${clip.margin}`);
  assert.equal(coded(clip, 'fitting.screw')[0].level, 'pass'); assert.equal(clip.screws[0].length - clip.height > 0, true);
  assert.ok(clip.edge > clip.screws[0].at[1] + 2.75, 'the panel stops clear of the screw\'s hole');
  assert.equal(coded(clip, 'fitting.margin')[0].level, 'pass'); assert.ok(clip.grams > 0.5 && clip.grams < 5, `${clip.grams} g`);
  // a thicker sheet, a taller clip; a heavier load, a thicker reach over the panel
  assert.ok(panelClipModel('2020-misumi-hfs5', { sheet: 6 }).height > clip.height);
  assert.ok(panelClipModel('2020-misumi-hfs5', { sheet: 3, load: 200 }).thickness > clip.thickness);
  await prints(panelClip(clip), 'a clip on its side');
  const fb = jscad.measurements.measureBoundingBox(panelClip(clip, { pose: 'fit' }));
  assert.deepEqual([+fb[0][0].toFixed(2), +fb[1][0].toFixed(2), +fb[1][2].toFixed(2)], [-10, 10, clip.height]);
  const corner = panelCornerModel('2020-misumi-hfs5', { sheet: 3 });
  assert.ok(corner.margin >= 2); assert.ok(corner.screws.every((s) => Math.hypot(s.at[0], s.at[1]) > 10), 'its screws past the crossing beam');
  await prints(panelCorner(corner), 'a corner, top face down');
  const edge = panelEdgeModel('2020-misumi-hfs5', { sheet: 3, length: 100 });
  assert.equal(edge.groove, 3.4); assert.ok(edge.wall >= 0.84); await prints(panelEdge(edge), 'an in-slot edge');
  assert.throws(() => panelEdgeModel('2020-misumi-hfs5', { sheet: 5, length: 100 }), /a 5 mm sheet in slot-6-misumi's 6 mm opening leaves walls of 0\.1 mm, under the 0\.84 mm two of x1c's lines make: a sheet of 3\.52 mm or less/);
  const cover = slotCoverModel('2020-misumi-hfs5', { length: 100 });
  assert.ok(cover.grams > 1); await prints(slotCover(cover), 'a slot cover, flange down');
  const gasket = gasketStripModel({ gap: 10.2, length: 100 });
  assert.equal(gasket.material, 'petg'); assert.equal(coded(gasket, 'fitting.margin')[0].level, 'pass'); await prints(gasketStrip(gasket), 'a gasket strip');
  assert.throws(() => panelClipModel('2020-misumi-hfs5', {}), /panelClipModel: sheet is the panel's thickness in mm/);
  assert.throws(() => panelClipModel('2020-misumi-hfs5', { sheet: 3, load: -1 }), /load is the force pushing the panel out at one clip, in N, above 0/);
});

test('a door\'s hinge swings the door out and away from the frame; its handle, latch and magnet catch print and are sized', async () => {
  const { hingeModel, hinge, handleModel, handle, latchModel, latch, magnetCatchModel, magnetCatch } = frames;
  const h = hingeModel('2020-misumi-hfs5', { sheet: 3 }), [ya, za] = h.axis;
  assert.equal(ya, -10, 'its axis over the beam\'s outer edge'); assert.equal(za, h.standoff + 3, 'at the door\'s outer face');
  assert.ok(h.standoff >= h.leaf + 2.75 + 1 - 1e-9, 'the door passes over the frame leaf\'s heads');
  assert.ok(h.margin >= 2); assert.equal(coded(h, 'fitting.pin')[0].level, 'pass'); assert.match(h.hardware[0].name, /^M4x40 cap$/);
  // the door's section turned about the axis from shut to 180° never comes down to the frame leaf or the beams
  const door = []; for (let y = h.edge; y < 200; y += 2) for (const z of [h.standoff, h.standoff + 3]) door.push([y, z]);
  let low = Infinity;
  for (let a = 0; a <= 180; a += 5) { const t = (a * Math.PI) / 180; for (const [y, z] of door) { const dy = y - ya, dz = z - za; low = Math.min(low, za + dy * Math.sin(t) + dz * Math.cos(t)); } }
  assert.ok(low >= h.standoff - 1e-9, `the door comes down to ${low} mm`);
  await prints(hinge(h), 'the frame leaf as it lies'); await prints(hinge(h, { part: 'door' }), 'the door leaf face down');
  const leaf = jscad.measurements.measureBoundingBox(hinge(h, { part: 'door', pose: 'fit' }));
  assert.ok(leaf[0][2] >= za - h.radius - 1e-3 && leaf[0][2] > h.leaf, 'the door\'s knuckle clears the frame\'s leaf (its round drawn in flats)');
  const hd = handleModel({ sheet: 3 });
  assert.ok(hd.margin >= 2); assert.equal(coded(hd, 'fitting.screw')[0].level, 'pass'); await prints(handle(hd), 'a handle on its side');
  const l = latchModel('2020-misumi-hfs5', { sheet: 3, standoff: h.standoff });
  assert.ok(l.post >= h.standoff + 3); assert.ok(l.margin >= 2); await prints(latch(l), 'a latch, tab down');
  const c = magnetCatchModel('2020-misumi-hfs5', { standoff: h.standoff });
  assert.ok(c.top < h.standoff && c.step + 2.75 < h.standoff); await prints(magnetCatch(c), 'a magnet catch on its side');
  assert.throws(() => magnetCatchModel('2020-misumi-hfs5', { standoff: 3 }), /a 3 mm standoff leaves/);
  assert.throws(() => hingeModel('2020-misumi-hfs5', { sheet: 3, pin: 'Q9' }), /hingeModel: pin and screw are threads/);
});

test('a gusset from MISUMI\'s 2020 onto the kit\'s printed 2020 keys each arm into its own slot and is thickened until a sold screw fits both, counted from where the nut seats under the printed slot\'s sloped lips', async () => {
  const { plateModel, plate } = frames;
  const m = plateModel('2020-misumi-hfs5', { shape: 'T', face: 'top', other: '2020-printed', nut: 'drop-in', material: 'petg' });
  assert.equal(m.name, 'gusset-t-2020-misumi-hfs5-to-2020-printed-m4'); assert.equal(m.other, 'profile-2020-printed');
  assert.deepEqual([...new Set(m.tongues.map((t) => `${t.leg} ${t.slot}`))], ['b slot-6-misumi', 'a slot-6-printed-2020']);
  // Hand, the M4 drop-in nut (3.3 mm high, its tongue 0.8; 4.1 mm of thread, a hex nut's 3.2 asked), the floor kept 0.3:
  //   MISUMI's slot, 2 mm lips square underneath, floor 6 mm down: thread from 2 - 0.8 = 1.2, so the tip from
  //   1.2 + 3.2 = 4.4 to 6 - 0.3 = 5.7 mm under the face
  //   the printed slot, 2 mm lips sloped 45° underneath, 6.1 mm open: the 10 mm nut seats 2 + (10 - 6.1) / 2 = 3.95 mm
  //   down, its thread from 3.15, so the tip from 6.35 to 7.85 - 0.3 = 7.55
  //   the 4.4 mm plate b alone gives (M4x10 into MISUMI's) leaves M4x12 7.6 mm into the printed slot, past 7.55, and
  //   M4x10 5.6, short of 6.35; 4.6 mm (the next layer up) takes M4x10 (tip 5.4) and M4x12 (tip 7.4)
  const screw = m.findings.find((f) => f.code === 'fitting.screw');
  assert.deepEqual(screw.values, { lengths: [10, 12], windows: [{ lo: 4.4, hi: 5.7 }, { lo: 6.35, hi: 7.55 }] });
  assert.equal(m.thickness, 4.6); assert.equal(plateModel('2020-misumi-hfs5', { shape: 'T', face: 'top', nut: 'drop-in', material: 'petg' }).thickness, 4.4);
  assert.deepEqual([...new Set(m.screws.map((q) => `${q.leg} M4x${q.length}`))], ['b M4x10', 'a M4x12']);
  await prints(plate(m), 'gusset onto a printed 2020');
});

test('the parts for a beam\'s end: an end cap, a foot, a levelling foot, a castor plate and a stacking foot, each print-ready and weighed', async () => {
  const { endCapModel, endCap, footModel, foot, levellingFootModel, levellingFoot, castorPlateModel, castorPlate, stackingFootModel, stackingFoot } = frames;
  const cap = endCapModel('2020-misumi-hfs5');
  assert.equal(cap.pegs.length, 5, 'four slots and the bore'); await prints(endCap(cap), 'an end cap, plate down');
  const fb = jscad.measurements.measureBoundingBox(endCap(cap, { pose: 'fit' }));
  assert.equal(+fb[0][2].toFixed(2), -cap.plug, 'fitted, its pegs into the beam');
  // without its pegs (what an overlap check measures, the pegs standing inside the beam's envelope): the plate alone, on the end
  assert.equal(+jscad.measurements.measureBoundingBox(endCap(cap, { pose: 'fit', tongues: false }))[0][2].toFixed(2), 0, 'the plate alone, from the end out');
  for (const [m, g, what] of [[footModel('2020-misumi-hfs5'), foot, 'a foot'], [stackingFootModel('2020-misumi-hfs5'), stackingFoot, 'a stacking foot'], [castorPlateModel('2020-misumi-hfs5', { holes: [38, 38], thread: 'M6' }), castorPlate, 'a castor plate']]) {
    assert.equal(coded(m, 'fitting.screw')[0].level, 'pass', what); assert.deepEqual(m.ops, [{ op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }], what);
    assert.ok(m.margin >= 2 && m.grams > 0, what); await prints(g(m), what);
  }
  const lev = levellingFootModel('2020-misumi-hfs5');
  assert.deepEqual([lev.stud, lev.range, lev.parts], ['M12', 10, ['body', 'pad']]); assert.ok(lev.margin >= 2);
  await prints(levellingFoot(lev), 'a levelling foot\'s body'); await prints(levellingFoot(lev, { part: 'pad' }), 'its pad');
  const bought = levellingFootModel('2020-misumi-hfs5', { stud: 'M8' });
  assert.deepEqual(bought.hardware.map((x) => x.kind), ['nut', 'foot']); await prints(levellingFoot(bought), 'a body for a bought stud');
  assert.throws(() => castorPlateModel('2020-misumi-hfs5', { holes: [20, 20], thread: 'M6' }), /the castor's holes 20 x 20 mm apart lie 10 mm from the middle, under the beam's outline and an M6 head/);
  assert.throws(() => footModel('tube-al-20x20x2'), /has no bore with a thread in its end/);
  assert.throws(() => endCapModel('2020-misumi-hfs5', { end: 'c' }), /end is a or b/);
});

// ---------- services ----------
const ruleSet = (name) => JSON.parse(fs.readFileSync(new URL(`${name}.json`, rulesDir), 'utf8'));

test('a supply and a board mount on a beam from their own rule sets: the holes their makers draw, screws that fit, print-ready and weighed', async () => {
  const { deviceMountModel, deviceMount } = frames, supply = ruleSet('supply-24v'), shield = ruleSet('cnc-shield-v3');
  // the supply: Mean Well's LRS-50 base holes, M3 up from under the plate into its own thread, no deeper than L = 3 mm
  const s = deviceMountModel('2020-misumi-hfs5', { device: supply, variant: 'LRS-50-24' });
  // (its holes lie over the beam, so it is set to the side until a key reaches each from under the plate beside the beam)
  assert.deepEqual(s.device.holes, [[-29, -13.85], [26, -13.85]], 'LRS-50 holes 20.5 mm and 75.5 mm from the terminal end, from the middle of 99 mm, moved 13.35 mm across');
  assert.deepEqual(deviceMountModel('2020-misumi-hfs5', { device: supply, variant: 'LRS-50-24', offset: 0 }).device.holes, [[-29, -0.5], [26, -0.5]], 'as Mean Well draws them, where the offset is given');
  assert.deepEqual(s.anchors.device.at, [0, -13.35, s.thickness]); assert.match(coded(s, 'fitting.device')[0].text, /set 13\.35 mm to the side so a key reaches each from under the plate beside the beam/);
  assert.deepEqual([s.fix, s.device.thread, s.device.length, s.device.engaged, s.device.floor], ['tapped', 'M3', 5, 3, 2]);
  assert.deepEqual(s.screws.map((x) => [x.at[0], x.length]), [[-56.25, 12], [56.25, 12]], 'M5x12 into the slot, clear of the 99 mm case by the head and 1 mm');
  assert.equal(coded(s, 'fitting.device')[0].level, 'pass'); assert.match(coded(s, 'fitting.device')[0].text, /3 mm in: as far as its maker allows \(supply-24v\.mount_hole_reach, spec\)/);
  assert.ok(s.margin >= 2 && s.grams > 0 && s.grams < 30, `${s.grams} g`); await prints(deviceMount(s), 'the supply\'s mount, top face down');
  // the default model (LRS-100) has its own holes, and a variant's holes are its own
  assert.deepEqual(deviceMountModel('2020-misumi-hfs5', { device: supply }).device.holes, [[13.5, -14.5], [13.5, 18.5]]);
  assert.equal(deviceMountModel('2020-misumi-hfs5', { device: supply, variant: 'LRS-350-24' }).device.thread, 'M4');
  // the board: the Uno's four holes under the shield, 2.54 mm from its edges, so M2.5 caps (an M3's head would overhang)
  // down through 1.6 mm of board into pilots on bosses
  const b = deviceMountModel('2020-misumi-hfs5', { device: shield });
  assert.equal(b.device.holes.length, 4); assert.deepEqual(b.device.holes[0], [-19.05, 24.13]);
  assert.deepEqual([b.fix, b.device.thread, b.device.head, b.device.length], ['through', 'M2.5', 'cap', 8]); assert.ok(b.standoff >= 3, 'stood off its soldered leads');
  assert.match(coded(b, 'fitting.head')[0].text, /M2\.5 cap: the largest whose 4\.5 mm head sits whole on the board, its holes 2\.54 mm from its edges at the closest \(M3's head would overhang\)/);
  assert.ok(b.device.engaged >= b.device.need, 'engagement.pla: 2.5 diameters'); assert.equal(b.windows.length, 1, 'a window inside its holes saves plastic');
  assert.equal(deviceMountModel('2020-misumi-hfs5', { device: shield, screw: 'M3' }).findings.find((f) => f.code === 'fitting.head').level, 'warn', 'an M3 given: its head overhangs, and it says so');
  assert.ok(b.margin >= 2 && b.grams > 0, `${b.grams} g`); await prints(deviceMount(b), 'the board\'s mount, beam side down');
  // turned a quarter, its holes turn with it
  assert.deepEqual(deviceMountModel('2020-misumi-hfs5', { device: supply, variant: 'LRS-50-24', turn: 90 }).device.holes, [[0.5, -29], [0.5, 26]]);
  // refused by name
  assert.throws(() => deviceMountModel('2020-misumi-hfs5', { device: ruleSet('supply-12v') }), /gives no mounting holes \(mount_holes/);
  assert.throws(() => deviceMountModel('2020-misumi-hfs5', { device: supply, variant: 'LRS-9' }), /supply-24v has no variant "LRS-9"/);
  assert.throws(() => deviceMountModel('2020-misumi-hfs5', { device: supply, turn: 45 }), /turn is 0, 90, 180 or 270/);
  assert.throws(() => deviceMountModel('2020-misumi-hfs5', {}), /device is the device's rule set/);
});

test('the services\' other parts: a cable clip, a tie anchor, a fan mount, a drag chain end, a DIN rail adapter and a spool holder, each print-ready and weighed', async () => {
  const { cableClipModel, cableClip, tieAnchorModel, tieAnchor, fanMountModel, fanMount, dragChainEndModel, dragChainEnd, dinRailAdapterModel, dinRailAdapter, spoolHolderModel, spoolHolder, FANS } = frames, P = '2020-misumi-hfs5';
  const clip = cableClipModel(P, { cable: 6 });
  assert.equal(clip.stem, 5.6, 'the 6.2 mm opening less the fit each side'); assert.ok(clip.ring.opening < 6 && clip.ring.opening > 3, 'the bundle snaps in past a narrower opening');
  assert.deepEqual(clip.screws, [], 'it snaps in: no screw'); assert.ok(clip.anchors.cable.at[2] > clip.flange); await prints(cableClip(clip), 'a cable clip');
  const tie = tieAnchorModel(P);
  assert.equal(coded(tie, 'fitting.screw')[0].level, 'pass'); assert.ok(tie.tunnel.w >= 3.6); await prints(tieAnchor(tie), 'a tie anchor');
  const fan = fanMountModel(P, { size: 80 });
  assert.equal(fan.device.holes[1][0] - fan.device.holes[0][0], FANS[80].spacing.value, 'ARCTIC\'s 71.5 mm');
  assert.ok(Math.min(...fan.device.holes.map((h) => h[1])) > 10, 'the fan stands beside the beam, clear of its face');
  assert.ok(fan.opening.d > 70); await prints(fanMount(fan), 'a fan mount');
  const chain = dragChainEndModel(P, { holes: [[-6, 0], [6, 0]], screw: 'M3' });
  assert.equal(chain.device.thread, 'M3'); assert.equal(chain.thread, 'M5', 'its own screws into the slot are the slot nut\'s'); await prints(dragChainEnd(chain), 'a drag chain end');
  const din = dinRailAdapterModel(P);
  assert.ok(din.screws.every((x) => Math.abs(x.at[0]) > 17.5), 'its screws clear of the 35 mm rail'); assert.equal(din.hardware[0].kind, 'rail'); await prints(dinRailAdapter(din), 'a DIN rail adapter');
  const spool = spoolHolderModel(P);
  assert.ok(spool.arm.length > spool.spool.width, 'the arm takes the spool\'s width'); assert.ok(spool.margin >= 2); await prints(spoolHolder(spool), 'a spool holder');
  for (const m of [clip, tie, fan, chain, din, spool]) { assert.ok(m.grams > 0, m.name); assert.equal(coded(m, 'fitting.margin')[0].level, 'pass', m.name); }
  assert.throws(() => fanMountModel(P, { size: 50 }), /size is a fan's size in mm, one of 40, 60, 80, 92, 120/);
  assert.throws(() => dragChainEndModel(P, { holes: [[0, 0]] }), /screw is the end bracket's screws' thread/);
  assert.throws(() => spoolHolderModel(P, { spool: { bore: 12, width: 70, mass: 1 } }), /does not pass a 12 mm bore/);
  assert.throws(() => cableClipModel(P, { cable: 0 }), /cable is the bundle's diameter/);
});

test('a run of slot takes clips at a pitch: one at each end and evenly between', () => {
  const { runClips } = frames;
  assert.deepEqual(runClips(360), { count: 5, pitch: 90, at: [0, 90, 180, 270, 360] });
  assert.deepEqual(runClips(100, { pitch: 100 }).count, 2); assert.deepEqual(runClips(101, { pitch: 100 }).count, 3); assert.equal(runClips(0).count, 1);
  assert.throws(() => runClips(100, { pitch: 0 }), /pitch is the most between clips/);
});

test('bought fittings: each set from its maker\'s sheet, what it mounts by, whether it fits, its price and its stiffness, and a join that takes it', () => {
  const { boughtFittingModel, boughtFitting, boughtFittings, BOUGHT_KINDS, joinModel, printedCost } = frames;
  // every kind the ticket names has a set, each drawn as a reference, every stiffness an estimate that says so
  const models = boughtFittings().map((n) => boughtFittingModel(n));
  assert.deepEqual([...new Set(models.map((m) => m.fittingKind))].sort(), Object.keys(BOUGHT_KINDS).sort());
  for (const m of models) {
    assert.ok(boughtFitting(m, { pose: 'fit' }).polygons.length > 0, `${m.set} is drawn`);
    if (m.stiffness) { assert.equal(m.stiffness.kind, 'estimate'); assert.match(m.stiffness.source, /joint rig \(issue 264\)/); }
    for (const q of m.screws) assert.equal(q.thread, m.thread);
  }
  // the cast bracket: an M4x8 cap and a hammer nut through each leg, 11 mm from the corner, 0.36 EUR
  const br = boughtFittingModel('fitting-motedis-bracket-20-b6', { profile: '2020-motedis-b6' });
  assert.deepEqual([br.fitting, br.thread, br.length, br.head, br.nutKind, br.screws.map((q) => [q.leg, q.at, q.axis])], ['bracket', 'M4', 8, 'cap', 'hammer', [['b', [11, 3.5, 0], [0, -1, 0]], ['a', [3.5, 11, 0], [-1, 0, 0]]]]);
  assert.deepEqual([br.cost.value, br.cost.unit, br.findings.map((f) => `${f.level} ${f.code}`)], [0.36, 'EUR', ['info fitting.cost', 'info fitting.stiffness', 'pass fitting.fit']]);
  // each set's stiffness is frames' working guess for its join, the same figure a literal "bought" gets: the finding
  // and the set's rule say so, as an estimate until the joint rig measures it; one unit, the grammar's
  const kindOf = { 'corner-bracket': 'bracket', 'joining-plate': 'gusset', 'inner-connector': 'hidden', 'anchor-connector': 'anchor' };
  for (const m of models.filter((x) => x.stiffness)) {
    const g = frames.JOIN_STIFFNESS[kindOf[m.fittingKind]], set = published.find((x) => x.name === m.set);
    assert.deepEqual([m.stiffness.bending, m.stiffness.twist], [g.bending.value, g.twist.value], m.set);
    assert.deepEqual([set.rules.bending_stiffness.unit, set.rules.twist_stiffness.unit, g.bending.unit, g.twist.unit], ['N mm/rad', 'N mm/rad', 'N mm/rad', 'N mm/rad'], m.set);
    for (const k of ['bending_stiffness', 'twist_stiffness']) assert.match(set.rules[k].rule, /the same figure a join with "fitting": "bought" gets, so choosing this set changes no stiffness until the joint rig measures it/, `${m.set}.${k}`);
    assert.match(coded(m, 'fitting.stiffness')[0].text, /N mm\/rad in bending .*: an estimate: .*the same figure a join with "fitting": "bought" gets/, m.set);
  }
  // measured on the joint rig, its bending says so and when, and its twist, still the guess, says it is an estimate
  const hm = SETS['fitting-misumi-hmj5'], rig = { value: 1.9e6, unit: 'N mm/rad', rule: 'measured on the joint rig', kind: 'measured', source: 'the joint rig: 0.4 mm drop of c3', checked: '2026-12-01' };
  const half = boughtFittingModel({ ...hm, rules: { ...hm.rules, bending_stiffness: rig } }), both = boughtFittingModel({ ...hm, rules: { ...hm.rules, bending_stiffness: rig, twist_stiffness: { ...rig, value: 4e5 } } });
  assert.match(coded(half, 'fitting.stiffness')[0].text, /in bending and 500000 in twist: bending measured on the joint rig on 2026-12-01 \(the joint rig: 0\.4 mm drop of c3\); twist an estimate: .*working guess/);
  assert.match(coded(both, 'fitting.stiffness')[0].text, /: bending measured on the joint rig on 2026-12-01 \(.*\); twist measured on the joint rig on 2026-12-01 \(.*\)$/);
  assert.doesNotMatch(coded(both, 'fitting.stiffness')[0].text, /estimate|guess/);
  // the hinge: two M4 button screws through each leaf, the frame leaf's into b (anchors b1, b2), the door leaf's a1, a2
  const hg = boughtFittingModel('fitting-motedis-hinge-20');
  assert.deepEqual(hg.screws.map((q) => [q.leg, q.thread, q.head, q.nutKind, q.at, q.axis]), [['b', 'M4', 'button', 'hammer', [11.5, -7, 4.8], [0, 0, -1]], ['b', 'M4', 'button', 'hammer', [11.5, 7, 4.8], [0, 0, -1]], ['a', 'M4', 'button', 'hammer', [-11.5, -7, 4.8], [0, 0, -1]], ['a', 'M4', 'button', 'hammer', [-11.5, 7, 4.8], [0, 0, -1]]]);
  // whether it fits: another maker's slot family, another size, a foot's stem against the end's bore
  const wrong = (n, p) => boughtFittingModel(n, { profile: p }).findings.filter((f) => f.level === 'fail').map((f) => f.text);
  assert.match(wrong('fitting-motedis-bracket-20-b6', '2020-misumi-hfs5')[0], /made for slot-6-motedis \(nut family slot-6-bosch\), and 2020-misumi-hfs5's slots are slot-6-misumi/);
  assert.match(wrong('fitting-motedis-bracket-20-b6', '4040-generic')[0], /made for 20 mm profiles, and 4040-generic is 40 mm/);
  assert.match(wrong('fitting-motedis-foot-m6-d19', '2020-misumi-hfs5')[0], /stem is M6, and 2020-misumi-hfs5's end bore is tapped M5: choose a foot with an M5 stem/);
  assert.deepEqual(wrong('fitting-motedis-foot-m6-d19', '2020-motedis-b6'), []);
  // the T plate: three screws on b's centre line, two up a's, in the gusset's frame
  const t = boughtFittingModel('fitting-motedis-plate-t-20');
  assert.deepEqual([t.shape, t.screws.map((q) => `${q.leg} ${q.at[0]},${q.at[1]}`)], ['T', ['b -20,0', 'b 0,0', 'b 20,0', 'a 0,20', 'a 0,40']]);
  // in a join: the bought bracket's own stiffness, saying what it rests on, where the printed one's is a share
  const A = beamModel('2020-motedis-b6', { length: 200 }), B = beamModel('2020-motedis-b6', { length: 300 }), at = (kind, fitting, a = A, b = B) => joinModel(kind, { beam: a, end: 'a' }, { beam: b, address: 'back@120' }, { fitting });
  const cast = at('bracket', 'fitting-motedis-bracket-20-b6'), printed = at('bracket', 'printed');
  assert.deepEqual([cast.fitting.made, cast.fitting.bought.set, cast.stiffness.bending, cast.stiffness.twist, cast.stiffness.kind, cast.findings], [true, 'fitting-motedis-bracket-20-b6', 3e6, 1e6, 'estimate', []]);
  assert.match(cast.stiffness.rests[0].source, /^fitting-motedis-bracket-20-b6\.bending_stiffness: A working guess/);
  assert.notEqual(printed.stiffness.bending, cast.stiffness.bending);
  // an anchor: the hole for its guide drilled into a's slotted face 10 mm from its end, down to the bore
  const M = beamModel('2020-misumi-hfs5', { length: 200 }), N = beamModel('2020-misumi-hfs5', { length: 300 });
  const an = at('anchor', 'fitting-misumi-hmj5', M, N);
  assert.deepEqual([an.a.ops, an.stiffness.bending, an.findings], [[{ op: 'drill', at: 'top.1@10', diameter: 7.1, depth: 10 }], 2e6, []]);
  const drilled = beamModel(M.profile, { length: 200, ops: an.a.ops }).ops.find((x) => x.op === 'drill');
  assert.deepEqual([drilled.diameter, drilled.distance, drilled.depth], [7.1, 10, 10]);
  // a set on the wrong maker's beam: the join says so, by the fit's finding
  assert.deepEqual(at('bracket', 'fitting-motedis-bracket-20-b6', M, N).findings.map((f) => `${f.level} ${f.code}`), ['fail fitting.fit']);
  // refused by name: a set the join does not take, a name that is no set, a plate of the wrong shape, a pivot
  assert.throws(() => at('hidden', 'fitting-motedis-bracket-20-b6'), /fitting-motedis-bracket-20-b6 is a corner bracket, and a hidden join takes an inner connector: fitting-motedis-bracket-20-b6 goes in a bracket join/);
  assert.throws(() => at('bracket', 'cast'), /fitting is printed or bought, or a bought fitting's set by name \(fitting-motedis-bracket-20-b6\) \(got "cast"\)/);
  assert.throws(() => joinModel('splice', { beam: A, end: 'b' }, { beam: B, address: 'a' }, { fitting: 'fitting-motedis-plate-t-20' }), /a splice join takes a straight joining plate, and fitting-motedis-plate-t-20 is a T: give it on a gusset join/);
  assert.throws(() => at('pivot', 'fitting-motedis-hinge-20'), /a pivot join takes no bought fitting yet/);
  assert.throws(() => boughtFittingModel('m5'), /m5 is not a part, not a bought fitting|m5 is a thread/);
  assert.throws(() => boughtFittingModel('fitting-motedis-hinge-20', { join: 'bracket' }), /a bracket join takes a corner bracket: fitting-motedis-hinge-20 goes on an item \("bought": "fitting-motedis-hinge-20"\)/);
  // a printed part's plastic beside a bought one's price
  const c = printedCost(6.71, { name: 'pla', rules: { cost: { value: 13.99, unit: 'EUR/kg', source: 's' } } });
  assert.deepEqual([c.value, c.unit], [0.094, 'EUR']);
  assert.equal(printedCost(6.71, { name: 'x', rules: {} }), null);
});

// ---------- guides ----------
test('a miniature rail on a beam: its holes at the pitch, its screws into slot nuts, each carriage\'s travel, its loads against its ratings, its error terms and a printed jig', async () => {
  const { railModel, rail, carriage, carriageMargin, guideFit, railTerms, railJigModel, railJig, rails } = frames, P = '2020-misumi-hfs5';
  assert.deepEqual(rails(), ['rail-mgn12', 'rail-mgn15', 'rail-mgn7', 'rail-mgn9']);
  // an MGN12 cut to 300 mm: 12 holes 25 mm apart, 12.5 mm from each end; one long carriage travels the rest
  const m = railModel('rail-mgn12', { length: 300, variant: 'MGN12H' });
  assert.deepEqual([m.holes.length, m.holes[0], m.holes[1] - m.holes[0], m.holes.at(-1), m.rail.thread], [12, 12.5, 25, 287.5, 'M3']);
  assert.deepEqual(m.screws.map((q) => q.at[0]), m.holes); assert.deepEqual(m.screws[0].at, [12.5, 0, 3.5], 'each screw\'s head on its counterbore\'s floor, 8 - 4.5 mm up');
  assert.equal(m.travel, 300 - 45.8, 'the rail less the carriage with its seals');
  assert.deepEqual(m.carriage.ratings, { C: 3720, C0: 5880, MR: 38.22, MP: 36.26, MY: 36.26 });
  // two carriages share it: each its own half
  const two = railModel('rail-mgn12', { length: 300, carriages: 2 });
  assert.deepEqual(two.lanes.map((x) => [x.from, x.to, x.travel]), [[0, 150, 114.9], [150, 300, 114.9]]);
  // an end past half the pitch is said, with the lengths that give the standard end
  const odd = railModel('rail-mgn12', { length: 305 });
  assert.deepEqual([odd.holes.length, odd.rail.end], [12, 15]);
  assert.match(odd.findings.find((f) => f.code === 'guide.end').text, /Cut it to 295 or 320 mm for its standard 10 mm ends/);
  // on a 2020: it bridges the slot and its M3 screws take the slot's own M3 nuts; an MGN7's M2 takes none
  const fit = guideFit(m, P, { face: 'top', from: 20, beam: 400 });
  assert.deepEqual(fit.findings.map((f) => f.level), ['pass', 'pass', 'pass']); assert.equal(fit.nut.name, 'slot-nut-6-misumi-m3-slide-in');
  assert.match(guideFit(railModel('rail-mgn7', { length: 200 }), P).findings[1].text, /^no M2 slot nut is made for slot-6-misumi: rail-mgn7's holes take M2, and the nuts there take M3, M4, M5/);
  // its ends clear of a beam that crosses the face, and on the beam
  const crossed = guideFit(m, P, { from: 20, beam: 400, keep: [{ from: 300, to: 320, what: 'y1 at x1.top@310' }] }).findings.filter((f) => f.level === 'fail');
  assert.match(crossed[0].text, /runs into y1 at x1.top@310 at 300 to 320 mm/);
  assert.match(guideFit(m, P, { from: 200, beam: 400 }).findings.at(-1).text, /past its end/);
  assert.match(guideFit(m, '2020-misumi-hfs5', { face: 'top' }).findings[0].text, /bridges slot-6-misumi's 6 mm opening/);
  // loads against its ratings: a moment past MP fails, the sum is the margin
  assert.equal(carriageMargin(m, { force: [0, 0, -10], moment: [0, 1, 0] }).level, 'pass');
  const over = carriageMargin(m, { force: [0, 0, -20], moment: [0, 40, 0] });
  assert.deepEqual([over.level, over.worst], ['fail', 'pitch']); assert.ok(Math.abs(over.margin - 1 / (20 / 5880 + 40 / 36.26)) < 1e-9);
  assert.equal(carriageMargin(railModel('rail-mgn12', { length: 300 }), { force: [0, 0, 0], moment: [0, 20, 0] }).level, 'fail', 'the standard carriage\'s 13.72 N m');
  // what it adds to the error budget: parallelism and play from its set, the beam's straightness and sag
  const t = railTerms(m, P, { beam: 400 });
  assert.deepEqual(t.map((x) => [x.term, x.kind]), [['rail parallelism', 'spec'], ['carriage play', 'spec'], ['beam straightness', 'spec'], ['beam sag', 'estimate']]);
  assert.deepEqual([t[0].value, t[1].value], [0.017, 0.01]);
  // its solids: the rail with its counterbores, the carriage clear of the rail
  const { measureVolume } = jscad.measurements;
  const holes = 12 * Math.PI * (1.75 ** 2 * 3.5 + 3 ** 2 * 4.5); assert.ok(Math.abs(measureVolume(rail(m)) - (12 * 8 * 300 - holes)) < 0.02 * holes, 'the rail, less its counterbored holes');
  const cb = jscad.measurements.measureBoundingBox(carriage(m));
  assert.deepEqual(cb.map((p) => p.map((x) => +x.toFixed(2))), [[-22.7, -13.5, 3], [22.7, 13.5, 13]]);
  // the jig: prints, keys into the side slots, sized from its load
  const j = railJigModel(P, { rail: 'rail-mgn12' });
  assert.equal(j.channel.width, 12.4); assert.deepEqual(j.key.slots, ['slot-6-misumi', 'slot-6-misumi']); assert.ok(j.key.depth >= 0.2 && j.key.depth <= 1);
  assert.equal(coded(j, 'fitting.margin')[0].level, 'pass'); assert.ok(j.margin >= 2 && j.grams > 0 && j.grams < 20);
  await prints(railJig(j), 'a rail jig');
  // refused by name
  assert.throws(() => railModel('rail-mgn12', { length: 2500 }), /rail-mgn12 is sold up to 2000 mm in one piece/);
  assert.throws(() => railModel('rail-mgn12', { length: 80, carriages: 3 }), /3 MGN12C carriages 35.1 mm long each need more than a 26.67 mm share of a 80 mm rail/);
  assert.throws(() => railModel('rail-mgn12', { length: 300, variant: 'MGN12X' }), /rail-mgn12 has no carriage "MGN12X": it has MGN12C, MGN12H/);
  assert.throws(() => railModel('m3', { length: 300 }), /rail is a rail's rule set or its name: rail-mgn12/);
  assert.throws(() => railJigModel('2040-misumi-hfs5', { rail: 'rail-mgn12' }), /top face has 2 slots: a jig centres a rail on a face of one slot/);
});

test('wheels: a carriage on V-wheels for a V-slot 2040 seats its wheels from the track, sets its preload on eccentrics, prints its plate, and is refused on a plain T-slot with why', async () => {
  const { wheelsModel, wheelPlate, vWheel, wheelMargin, trackFit, wheels, WHEEL_DEFAULTS } = frames, V = '2040-openbuilds';
  assert.deepEqual(wheels(), ['v-wheel-mini', 'v-wheel-solid']);
  // the seat from the rules: the 5.9 mm tip into the 9.16 mm track at 45 degrees goes (9.16 - 5.9) / 2 deep, the axle its radius less that
  const fit = trackFit(V, 'front', 'v-wheel-solid');
  assert.ok(fit.ok); assert.deepEqual([fit.seat.depth, fit.seat.axle, fit.seat.contact], [1.63, 10.32, [0, 1.455]]);
  const m = wheelsModel(V, { wheel: 'v-wheel-solid' });
  assert.deepEqual(m.sides, [{ face: 'front', slot: 'slot-6-openbuilds' }, { face: 'back', slot: 'slot-6-openbuilds' }]);
  assert.deepEqual(m.wheels.map((w) => [w.x, w.y, w.at[2], w.eccentric]), [[-20, -30.32, -10, false], [20, -30.32, -10, false], [-20, 30.32, -10, true], [20, 30.32, -10, true]], 'two fixed, two on eccentrics, in the tracks 10 mm under the top face, 20 + 10.32 out');
  // the plate over the face: 6 mm spacers on a wheel 11 mm across its races put it 1.5 mm clear
  assert.equal(m.gap, 1.5); assert.equal(m.length, 63.9, 'the wheels\' 40 mm pitch and a 23.9 mm wheel');
  // the seat beside OpenBuilds' own plate (39.7 mm across a 20 mm rail): 0.94 mm wider in all. The fixed wheels cannot
  // move, so the eccentrics on the back take all of it, more than their 0.79 mm from mid-turn: a warning, not 0.47 a side
  const seatF = coded(m, 'guide.seat')[0];
  assert.equal(seatF.level, 'warn'); assert.deepEqual([seatF.values.mine, seatF.values.maker, seatF.values.difference, seatF.values.eccentric], [40.64, 39.7, 0.94, 0.79]);
  assert.match(seatF.text, /40\.64 mm apart and OpenBuilds' own plate 39\.7 mm: 0\.94 mm wider, all of it taken up by the eccentrics on the back side, the fixed wheels being fixed\. That is more than the eccentric's 0\.79 mm either way from mid-turn: .*the eccentrics cannot bring their wheels in to the track/);
  assert.match(seatF.text, /rests on the slot's and the wheel's figures \(track_width spec, track_angle spec, wheel_diameter spec, wheel_flat spec\)/);
  assert.match(coded(m, 'guide.preload')[0].text, /from 0\.79 mm into the track \(preload\) to 0\.79 mm clear of it, 1\.58 mm in all/);
  // each wheel's rating from its plastic: Hertz line contact at 36 MPa, both flanks across, one along its axle
  const Es = 3100 / (1 - 0.35 ** 2), N = (Math.PI * (10.32 + 1.455 / 2) * (1.455 * Math.SQRT2) * 36 ** 2) / Es;
  within(m.ratings.radial, 2 * N * Math.SQRT1_2, 0.01, 'radial'); within(m.ratings.axial, N * Math.SQRT1_2, 0.01, 'axial');
  // a carriage's loads shared out: 2 kg on the plate's middle presses along every axle, a quarter each
  const two = wheelMargin(m, { force: [0, 0, -2 * 9.80665], moment: [0, 0, 0] });
  for (const w of two.wheels) within(w.axial, 2 * 9.80665 / 4, 1e-3, w.name);
  assert.equal(two.level, 'pass');
  // pushed across toward +y, the -y side's two wheels take it
  const side = wheelMargin(m, { force: [0, 40, 0], moment: [0, 0, 0] });
  assert.deepEqual(side.wheels.map((w) => w.radial), [20, 20, 0, 0]);
  // 3 kg 200 mm ahead pitches it past its wheels' ratings
  assert.equal(wheelMargin(m, { force: [0, 0, -3 * 9.80665], moment: [0, 3 * 9.80665 * 0.2, 0] }).level, 'fail');
  // the plate prints upside down, its first layer its top; sized from its load at twice the margin; weighed
  assert.equal(coded(m, 'fitting.margin')[0].level, 'pass'); assert.ok(m.margin >= 2 && m.grams > 5 && m.grams < 60);
  await prints(wheelPlate(m, { pose: 'print' }), 'a wheel plate');
  // three wheels, the mini wheel: one eccentric in the middle; its seat beside OpenBuilds' mini plate's 31.9 mm
  const mini = wheelsModel(V, { wheel: 'v-wheel-mini', wheels: 3 });
  assert.deepEqual(mini.wheels.map((w) => [w.x, w.eccentric]), [[-17.5, false], [17.5, false], [0, true]]);
  assert.match(coded(mini, 'guide.seat')[0].text, /31\.85 mm apart and OpenBuilds' own plate 31\.9 mm: 0\.05 mm closer, .*within the eccentric's 0\.79 mm/); assert.equal(coded(mini, 'guide.seat')[0].level, 'info');
  // a wheel's collide solid stops at the beam's face; its rim reaches past it into the track
  const bound = (g) => jscad.measurements.measureBoundingBox(g);
  assert.ok(Math.abs(bound(vWheel(m, { collide: true }))[1][0] - 10.32) < 1e-6 && bound(vWheel(m))[1][0] > 11.9);
  // the beam's link with its tracks cut: the whole wheel w1, seated in the front face's track, is clear of it, and the
  // same wheel 0.05 mm into the beam is not; the plain envelope reads the seated rim as 94 mm³ in the beam
  const vol = (g) => jscad.measurements.measureVolume(g), bm = frames.beamModel(V, { length: 200 });
  const box = frames.beam(bm, { display: 'link' }), tracked = frames.beam(bm, { display: 'link', tracks: true });
  const placed = (dx) => jscad.transforms.translate([-(20 + m.seat.axle) + dx, 0, 100], jscad.transforms.rotateX(-Math.PI / 2, vWheel(m)));
  assert.equal(vol(jscad.booleans.intersect(tracked, placed(0))), 0); assert.ok(vol(jscad.booleans.intersect(tracked, placed(0.05))) > 0.05);
  assert.ok(vol(jscad.booleans.intersect(box, placed(0))) > 90);
  // each V track is cut along the beam (its V and the opening under it to the cavity's depth), a plain T-slot's box is whole
  within(vol(box) - vol(tracked), 6 * 200 * (((9.16 + 6.25) / 2) * 1.455 + 6.25 * (6.1 - 1.455)), 0.001, 'six tracks');
  const plainB = frames.beamModel('2040-misumi-hfs5', { length: 200 });
  assert.equal(vol(frames.beam(plainB, { display: 'link', tracks: true })), vol(frames.beam(plainB, { display: 'link' })));
  // refused by name: a plain T-slot has no track, and says why and what guides there instead
  assert.throws(() => wheelsModel('2040-misumi-hfs5', {}), /wheels are refused on profile-2040-misumi-hfs5 under its top face: .*front face has slot-6-misumi, a plain T-slot with no V track .*: a V-wheel's flanks need a V to run on .* a rail \(kind rail\) or a printed slider \(kind slider\)/);
  const plain = trackFit('2040-misumi-hfs5', 'front', 'v-wheel-solid');
  assert.equal(plain.ok, false); assert.equal(plain.findings[0].code, 'guide.fit'); assert.equal(plain.findings[0].level, 'fail');
  assert.throws(() => wheelsModel(V, { wheels: 5 }), /wheels is 4 \(two on each side\) or 3/);
  assert.throws(() => wheelsModel(V, { wheel: 'bearing-625' }), /wheel is a wheel's rule set or its name: v-wheel-mini, v-wheel-solid/);
  assert.throws(() => wheelsModel(V, { pitch: 10 }), /pitch is the wheels' spacing along the beam/);
  assert.equal(WHEEL_DEFAULTS.friction.kind, 'estimate');
});

test('a printed slider over or in a slot: its clearance the printer\'s fit, its plastic named, and what its friction and wear rest on', async () => {
  const { sliderModel, slider } = frames;
  const over = sliderModel('2040-openbuilds', { face: 'top.1', length: 40, load: 30 });
  assert.equal(over.key, 5.85, 'the 6.25 mm opening less 0.2 mm a side'); assert.equal(over.clearance, 0.2); assert.equal(over.material, 'pla');
  assert.match(coded(over, 'guide.friction')[0].text, /PLA on anodised aluminium taken as μ 0\.3 \(9 N to push it under 30 N\)/);
  assert.equal(coded(over, 'fitting.margin')[0].level, 'pass');
  await prints(slider(over), 'a slider over a slot');
  const inside = sliderModel('2020-misumi-hfs5', { mode: 'in', material: 'petg' });
  assert.equal(inside.material, 'petg'); assert.match(coded(inside, 'guide.entry')[0].text, /goes in from the beam's end/);
  assert.ok(Math.min(...inside.section.map((p) => p[1])) < -2, 'its block under the lips');
  await prints(slider(inside), 'a slider in a slot');
  // the overlap check's solid stands only over the face
  assert.ok(jscad.measurements.measureBoundingBox(slider(inside, { pose: 'fit', tongues: false }))[0][2] >= -1e-9);
  assert.throws(() => sliderModel('2040-openbuilds', { mode: 'under' }), /mode is over .* or in/);
  assert.throws(() => sliderModel('tube-al-20x20x2', {}), /top face is closed: a slider runs in a slot/);
});

// ---------- rods, their drive and an endstop (#260) ----------
test('rods: a layout from the rod, bearing, screw, nut and motor sets; holders, a motor plate for any catalogue motor, a carriage and an endstop mount, each print-ready with its grams and margin; refused by name', async () => {
  const { rodsLayout, rodHolderModel, rodHolder, motorPlateModel, motorPlate, rodCarriageModel, rodCarriage, endstopMountModel, endstopMount, rodMargin } = frames;
  const P = '2020-misumi-hfs5', box = (g) => jscad.measurements.measureBoundingBox(g).map((v) => v.map((x) => +x.toFixed(2)));
  // the layout of chapter 13's Z axis: the rods 40 mm apart (an LM8UU's 15 mm, the T8 nut's 22 mm flange and 1.5 mm between),
  // 13 mm over the face, set by the 608 the screw turns in at each holder (its 11 mm radius and a 2 mm wall)
  const L = rodsLayout(P, { screw: 't8-screw', motor: '28byj48' });
  assert.equal(L.spacing, 40); assert.equal(L.height, 13);
  assert.deepEqual(L.needs.map(([w, x]) => [w, x]), [['the carriage under its bearings', 10.5], ['t8-nut\'s flange', 12], ['bearing-608 in a holder', 13], ['coupler-5-8', 10], ['28byj48\'s body', 7]]);
  assert.deepEqual(L.carriage, { length: 27, width: 59, bottom: 3.5, top: 22.5 });
  assert.deepEqual([L.screw.lead, L.nut.flange, L.support.set, L.coupler.set, L.motor.thread], [8, 22, 'bearing-608', 'coupler-5-8', 'M4']);
  // without a screw the rods close up over the face: an LM8UU's pockets and a wall
  assert.equal(rodsLayout(P).spacing, 20);
  // a holder: a saddle over the face, its legs screwed into the side slots, the 608 pressed in from its inner face
  const h = rodHolderModel(P, { spacing: 40, height: 13, screw: 't8-screw', support: 'bearing-608' });
  assert.deepEqual([h.thickness, h.legs, h.top, h.rodHole, h.support.pocket, h.support.depth], [9, 11.5, 26, 8.1, 22, 7]);
  assert.deepEqual(h.screws.map((q) => [q.side, q.thread, q.axis, q.length]), [['front', 'M5', [0, 1, 0], 12], ['back', 'M5', [0, -1, 0], 12]]);
  assert.ok(h.grams > 5 && h.margin >= 2, `${h.grams} g, ${h.margin}×`);
  for (const c of ['fitting.screw', 'guide.support', 'fitting.size', 'fitting.margin', 'fitting.printable', 'fitting.mass']) assert.equal(coded(h, c).length, 1, c);
  // at end b it is the same part turned to face a: its anchors and legs mirrored across the beam's middle line
  const hb = rodHolderModel(P, { spacing: 40, height: 13, screw: 't8-screw', support: 'bearing-608', end: 'b' });
  assert.deepEqual(hb.anchors.s1, { at: [-2, 0, 13], axis: [-1, 0, 0], ref: [0, 0, 1] }); assert.deepEqual(hb.screws.map((q) => [q.side, q.at[1]]), [['front', -16.6], ['back', 16.6]]);
  assert.deepEqual(box(rodHolder(hb, { pose: 'fit' }))[0][0], -11.5);
  // a motor plate for the geared 28BYJ-48 from its rules: M4 through its ears, its 9 mm boss, at least 1.5 diameters thick;
  // a recess takes the coupler in so its short shaft reaches 6 mm in; two screws a leg hold its torque by shear
  const mp = motorPlateModel(P, { motor: '28byj48', height: 13 });
  assert.deepEqual([mp.thickness, mp.legs, mp.engaged, mp.recess, mp.holes.map((q) => q.at), mp.screws.length], [6, 23, 6, { d: 20, depth: 2.5 }, [[17.5, 21], [-17.5, 21]], 4]);
  assert.match(coded(mp, 'fitting.motor')[0].text, /2 M4 clearance holes \(4\.6 mm, through its ears to a nut\) through 6 mm, its 9 mm boss in a 1\.9 mm pocket/);
  // and a NEMA 17's, tapped M3 on its 31 mm square, its shaft over the body's half-width; its 24 mm shaft needs no recess
  const n17 = motorPlateModel('2040-openbuilds', { motor: 'nema17' });
  assert.deepEqual([n17.height, n17.holes.length, n17.recess, n17.mount.thread, n17.mount.tapped], [22.5, 4, null, 'M3', true]);
  // its shaft goes half the coupler in, no further, so it stops short of the screw coming in from the other end (the
  // coupler then stands clear of the plate): 12.5 mm of coupler-5-8's 25, the coupler's face 11.5 mm out
  assert.deepEqual([n17.engaged, n17.anchors.coupler.at[0]], [12.5, 11.5]);
  // a carriage: the LM8UU pockets from its inner end, the T8 nut's bore and its flange's four M3 pilots; a flag for a switch
  const c = rodCarriageModel(P, { spacing: 40, height: 13, screw: 't8-screw', flag: { y: -23.4, z: -2 } });
  assert.deepEqual([c.length, c.own, c.pocket, c.nut.bore, c.pilots.thread, c.pilots.length, c.flag], [27, 30.5, 15, 10.7, 'M3', 12, { y: -23.4, z: -2, width: 4, thickness: 3 }]);
  assert.deepEqual(c.hardware.map((x) => [x.count, x.name]), [[4, 'M3x12 button']]);
  assert.ok(c.margin >= 2 && c.grams > 10, `${c.grams} g, ${c.margin}×`);
  // an endstop's mount on a side face: the switch by its own holes, its lever 12.4 mm along, the slot screw sunk ahead of it
  const e = endstopMountModel(P, { face: 'front' });
  assert.deepEqual([e.lever, e.switchScrew, e.screws[0].length], [{ x: 12.4, out: 14.4, reach: 12, width: 4 }, { thread: 'M2', length: 12 }, 12]);
  assert.equal(e.thickness - e.counterbore.depth, e.screws[0].grip);
  // each prints as drawn, with no supports
  for (const [g, what] of [[rodHolder(h), 'a rod holder'], [rodHolder(hb), 'a rod holder at end b'], [motorPlate(mp), 'a motor plate for a 28BYJ-48'], [motorPlate(n17), 'a motor plate for a NEMA 17'], [rodCarriage(c), 'a rod carriage with a flag'], [endstopMount(e), 'an endstop mount']]) await prints(g, what);
  // the bearings' loads: 2.45 N along the rods is the screw's; 0.074 N m of pitch is shared as a couple along each bush
  const r = rodMargin(c, { force: [2.45, 0, 0], moment: [0, 0.074, 0] });
  assert.equal(r.rating, 400); assert.deepEqual(r.bearings.map((b) => b.radial), [3.083, 3.083]); assert.equal(r.level, 'pass');
  assert.equal(rodMargin(c, { force: [0, 0, -900], moment: [0, 0, 0] }).level, 'fail', '900 N across is past two 400 N bushes');
  // refused by name
  assert.throws(() => rodsLayout(P, { rod: 'lm8uu' }), /rod is a rod's rule set, one of rod-8 \(got "lm8uu"\)/);
  assert.throws(() => rodsLayout(P, { motor: '28byj48' }), /a motor drives the carriage through a screw: give screw/);
  assert.throws(() => rodsLayout(P, { screw: 't8-screw', spacing: 30 }), /spacing is the rods' distance apart, mm, at least 40/);
  assert.throws(() => rodsLayout(P, { screw: 't8-screw', height: 10 }), /height is .* at least 13 for bearing-608 in a holder/);
  assert.throws(() => rodHolderModel('tube-al-20x20x2', {}), /front face beside the top face is closed: a saddle's legs screw into slots either side/);
  assert.throws(() => motorPlateModel(P, { motor: 'sg90' }), /motor is a motor's rule set, one of 28byj48, nema14, nema17/);
  assert.throws(() => rodCarriageModel(P, { flag: { y: -40, z: -2 } }), /the flag would hang 40 mm from the middle, past the carriage's 19.5 mm/);
  assert.throws(() => endstopMountModel(P, { face: 'front', toward: 0 }), /toward is 1 or -1/);
});

// ---------- jigs ----------
test('jigs: a squaring corner has a hand: fitted on beam a, its a tongue lies in a\'s slot clear of the lips (but for its root round at the slot\'s mouth) and its arm b runs along n x u when right-handed, the other way when left, from either end of a', async () => {
  const { squareCornerModel, squareCorner } = frames;
  const { intersect } = jscad.booleans, { measureVolume, measureBoundingBox } = jscad.measurements;
  const P = '2020-misumi-hfs5', L = 200, a = beamModel(P, { length: L }), solid = beam(a), env = beam(a, { display: 'link' });
  const vol = (g, h) => measureVolume(intersect(g, h));
  // on a's top face (n = +y): from end a, u = +z, so n x u = +x; from end b, u = -z, so n x u = -x
  for (const [end, hand, xs, zs] of [['a', 'right', [-10, 70], [-20, 60]], ['a', 'left', [-70, 10], [-20, 60]], ['b', 'right', [-70, 10], [L - 60, L + 20]], ['b', 'left', [-10, 70], [L - 60, L + 20]]]) {
    const m = squareCornerModel({ profile: P, face: 'top', end, length: L }, { profile: P, face: 'front' }, { hand }), g = squareCorner(m, { pose: 'fit' });
    const [lo, hi] = measureBoundingBox(g), what = `end ${end}, ${hand}-handed`;
    assert.deepEqual([lo[0], hi[0], lo[2], hi[2]].map((v) => +v.toFixed(2)), [...xs, ...zs], what);
    assert.ok(Math.abs(lo[1] - (10 - m.tongues.a.depth)) < 1e-3 && Math.abs(hi[1] - (10 + m.plate.thickness)) < 1e-3, `${what}: the plate on a's top face, the tongues in (y ${lo[1]} to ${hi[1]})`);
    // its a tongue in a's slot: inside a's envelope, touching no aluminium
    const inA = vol(g, env);
    assert.ok(inA > 50, `${what}: the tongue in a's slot (${inA} mm³)`);
    // it meets the aluminium only where its tongue's root round touches the slot mouth's round, under 0.1 mm deep
    const meet = intersect(g, solid), [mlo, mhi] = measureBoundingBox(meet);
    assert.ok(measureVolume(meet) < 1 && mlo[1] > 10 - 0.1 && mhi[1] <= 10 + 1e-3, `${what}: it meets ${measureVolume(meet)} mm³ of a, y ${mlo[1]} to ${mhi[1]}`);
    assert.equal(m.hand, hand); assert.equal(m.name, `square-corner-${P}${hand === 'left' ? '-left' : ''}`);
  }
  // the two hands are mirror images: the same grams, margin and play
  const R = squareCornerModel({ profile: P }, { profile: P }), Lh = squareCornerModel({ profile: P }, { profile: P }, { hand: 'left' });
  assert.deepEqual([Lh.grams, Lh.margin, Lh.square], [R.grams, R.margin, R.square]);
  await prints(squareCorner(Lh), 'a left-handed squaring corner');
  // refused by name
  assert.throws(() => squareCornerModel({ profile: P }, { profile: P }, { hand: 'up' }), /hand is the way arm b runs, right .* or left \(the mirror image\) \(got "up"\)/);
  assert.throws(() => squareCornerModel({ profile: P, end: 'c' }, { profile: P }), /a\.end is the end of a that meets b, a or b \(got "c"\)/);
  assert.throws(() => squareCorner(squareCornerModel({ profile: P, end: 'b' }, { profile: P }), { pose: 'fit' }), /a corner on a's end b is fitted from a's length: give a\.length/);
});

test('jigs: a drill guide\'s bush sits where the beam\'s sheet dimensions the hole, from either end; a tap guide, a cut-length stop and a squaring corner each print without supports and report grams and margin', async () => {
  const { drillGuideModel, drillGuide, tapGuideModel, tapGuide, lengthStopModel, lengthStop, squareCornerModel, squareCorner, beamSheet, JIG_DEFAULTS } = frames;
  const { intersect } = jscad.booleans, { measureVolume } = jscad.measurements, { cylinder } = jscad.primitives, { transform } = jscad.transforms;
  const b = beamModel('2020-misumi-hfs5', { length: 300, ops: [{ op: 'access', at: 'front@30', thread: 'M5', through: 'beam' }, { op: 'access', at: 'top@-10', thread: 'M5', through: 'beam' }, { op: 'tap', at: 'a' }] });
  const sheet = beamSheet(b), n = (at) => b.ops.findIndex((x) => x.at === at);
  // a probe through the guide's plate along the face's normal, at a distance z from end a: it meets no plastic where the bore is
  const probe = (m, z, r) => {
    const pl = b.places.find((q) => q.name === m.place), c = cylinder({ radius: r, height: m.plate.thickness - 1, segments: 48, center: [0, 0, 0] });
    const N = [...pl.normal, 0], X = [-N[1], N[0], 0], Y = [0, 0, 1], o = [pl.at[0] + (m.plate.thickness / 2) * N[0], pl.at[1] + (m.plate.thickness / 2) * N[1], z];
    return transform([...X, 0, ...Y.map((v) => -v), 0, ...N, 0, ...o, 1], c);
  };
  for (const [at, from, d] of [['front@30', 'a', 30], ['top@-10', 'b', 10]]) {
    const i = n(at), m = drillGuideModel(b, i), fitted = drillGuide(m, { pose: 'fit' }), z = sheet.dimensions.find((x) => x.op === i + 1).distance;
    assert.deepEqual([m.from, m.bush.at[1], m.bush.sheet, z], [from, d, z, at.endsWith('30') ? 30 : 290], at);
    // measured on the solid: the bore is clear at the sheet's figure, and plastic is met 0.1 mm either side of it
    const r = m.bush.diameter / 2 - 0.01, vol = (zz) => measureVolume(intersect(fitted, probe(m, zz, r)));
    assert.ok(vol(z) < 0.01, `${at}: the bore is at ${z} mm (${vol(z)} mm³ met)`);
    for (const dz of [-0.1, 0.1]) assert.ok(vol(z + dz) > 0.01, `${at}: plastic ${dz} mm off the sheet's figure`);
    await prints(drillGuide(m), `a drill guide ${at}`);
    assert.ok(m.margin >= 2 && m.grams > 5 && m.grams < 20, `${m.grams} g at ${m.margin}×`);
    assert.ok(m.stop.sag <= JIG_DEFAULTS.within.value + 1e-9);
  }
  const g = drillGuideModel(b, n('front@30'));
  // sized from the rules: a bush twice the drill long, Ø5.3 + the printer's slip and hole compensation; a tongue the opening less the slip
  assert.deepEqual([g.bush.diameter, g.plate.thickness, g.tongue.width, g.tongue.depth, g.stop.thickness], [5.5, 10.6, 5.9, 1.8, 3.2]);
  assert.match(coded(g, 'jig.drill')[0].text, /its bush sits 30 mm from end a, where the sheet dimensions the hole 30 mm from end a, on front\.1's slot centre line to within 0\.05 mm/);
  assert.match(coded(g, 'fitting.mass')[0].text, /it weighs \d+\.\d+ g of pla/);
  // a tap guide over end a's bore; a cut-length stop for 300 mm in two gauge pieces; a squaring corner within 0.5° of square
  const tg = tapGuideModel(b, b.ops.find((x) => x.op === 'tap'));
  assert.deepEqual([tg.thread, tg.bores, tg.plate.thickness, tg.sleeve.inside], ['M5', [{ at: [0, 0], diameter: 5.2 }], 10, [20.4, 20.4]]);
  const ls = lengthStopModel('2020-misumi-hfs5', 300);
  assert.deepEqual([ls.gauge.pieces, ls.gauge.length, ls.within], [2, 150, 0.2]);
  const sc = squareCornerModel({ profile: '2020-misumi-hfs5' }, { profile: '2020-misumi-hfs5' });
  assert.ok(sc.square <= 0.5, `${sc.square}°`); assert.equal(coded(sc, 'jig.square')[0].level, 'pass');
  for (const [s, what] of [[tapGuide(tg), 'a tap guide'], [lengthStop(ls), 'a length stop'], [lengthStop(ls, { part: 'gauge' }), 'a gauge piece'], [squareCorner(sc), 'a squaring corner']]) await prints(s, what);
  for (const m of [tg, ls, sc]) { assert.ok(m.margin >= 2, `${m.name} at ${m.margin}×`); assert.ok(m.grams > 1, m.name); assert.equal(coded(m, 'fitting.printable').length, 1); }
  // refused by name
  assert.throws(() => drillGuideModel(b, 0), /give one of profile-2020-misumi-hfs5 x 300's access or drill or counterbore operations, by its index .* it has 2 \(access at front@30\), 3 \(access at top@-10\)/);
  assert.throws(() => drillGuideModel(b, 2, { from: 'c' }), /from is the end the stop goes on, a or b/);
  const long = beamModel('2020-misumi-hfs5', { length: 1000, ops: [{ op: 'access', at: 'top@500', thread: 'M5' }] });
  assert.throws(() => drillGuideModel(long, long.ops.findIndex((x) => x.op === 'access')), /is 500 mm from end a and 500 mm from end b: a guide that reaches it is \d+(\.\d+)? mm long, more than the 236 mm the printer's 256 mm bed takes\. Mark this hole from the sheet/);
  assert.throws(() => tapGuideModel(b, b.ops.findIndex((x) => x.op === 'tap'), { shank: 4 }), /shank is the tap's shank across in mm, at least its 5 mm thread/);
  assert.throws(() => lengthStopModel('2020-misumi-hfs5', -1), /length is the cut in mm, above 0/);
  assert.throws(() => squareCornerModel({ profile: '2020-misumi-hfs5', face: 'side' }, { profile: '2020-misumi-hfs5' }), /a's profile-2020-misumi-hfs5 has no face "side"/);
  assert.throws(() => squareCornerModel({ profile: 'tube-al-20x20x2' }, { profile: '2020-misumi-hfs5' }), /top face is closed: a squaring corner keys into a slot on each beam/);
});

test('squareness: a bay\'s two diagonals and the difference to accept, what the cut tolerance allows with every corner square; refused by name', () => {
  // 260 × 200 opening: d = √(260² + 200²) = 328.02 mm; accept = 2 × 0.5 × 260 / 328.02 = 0.79 mm, a lean of 0.79 × 328.02 / (2 × 260 × 200) rad
  const q = frames.squareness(260, 200);
  assert.deepEqual([q.diagonal, q.accept, q.lean, q.tolerance], [328.02, 0.79, 0.143, 0.5]);
  assert.equal(q.findings[0].code, 'frame.square'); assert.equal(q.rests[0].kind, 'estimate');
  // a beam leaning by that much: the diagonals' difference is the accepted one
  const d = (s) => Math.sqrt(260 ** 2 + 200 ** 2 + s * 2 * 260 * 200 * Math.sin((q.lean * Math.PI) / 180));
  assert.ok(Math.abs(d(1) - d(-1) - q.accept) < 0.01, `${d(1) - d(-1)}`);
  // a tighter saw, the larger side counts, a square bay
  assert.equal(frames.squareness(260, 200, { tolerance: 0.1 }).accept, 0.16);
  assert.equal(frames.squareness(200, 260).accept, 0.79);
  assert.deepEqual([frames.squareness(300, 300).diagonal, frames.squareness(300, 300).accept], [424.26, 0.71]);
  assert.throws(() => frames.squareness(0, 200), /squareness: width is the bay's opening, inside face to inside face, a number of mm above 0 \(got 0\)/);
  assert.throws(() => frames.squareness(260, 200, { kerf: 3 }), /squareness: no option "kerf": it takes tolerance/);
  assert.throws(() => frames.squareness(260, 200, { tolerance: -1 }), /tolerance is how far a cut may be from its length either way/);
  // printed beams are not cut: said as printed, each term and the reason (the same 0.79 mm: 2 x 0.5 x 260 / 328.02)
  const pr = frames.squareness(260, 200, { cuts: [{ name: 'p1', along: 'width', printed: true }, { name: 'p2', along: 'width', printed: true }] });
  assert.equal(pr.accept, 0.79); assert.deepEqual(pr.terms.map((x) => x.term), ['p1 printed', 'p2 printed']);
  assert.match(pr.text, /\(beams printed to ±0\.5 mm, every corner square\)/); assert.doesNotMatch(pr.text, /cut to/);
  const mixed = frames.squareness(260, 200, { cuts: [{ name: 'x1', along: 'width', tolerance: 0.5 }, { name: 'p1', along: 'width', printed: true, tolerance: 0.3 }] });
  assert.match(mixed.text, /\(beams cut to ±0\.5 mm and beams printed to ±0\.3 mm, every corner square\)/);
});

test('squareness stacks each cut and each join\'s play as an error budget stacks its joints: worst case summed, root-sum-square beside it', () => {
  // 260 × 200, d = 328.024 mm. Two rails along the width cut to ±0.5: 0.5 × 260 / 328.024 = 0.39631 each.
  // Four blind joins, each 0.1 mm of play (JOIN_PLAY.blind), two along the width (lever 260/d) and two along the height
  // (lever 200/d): 0.1 × 260 / d = 0.07926 and 0.1 × 200 / d = 0.06097.
  // Worst: 2 × 0.39631 + 2 × 0.07926 + 2 × 0.06097 = 1.07309 -> 1.07; rss: √(2 × 0.39631² + 2 × 0.07926² + 2 × 0.06097²) = 0.58153 -> 0.58
  const d = Math.hypot(260, 200), slip = frames.JOIN_PLAY.blind.value;
  assert.equal(slip, 0.1); assert.equal(frames.JOIN_PLAY.blind.kind, 'estimate');
  for (const [k, r] of Object.entries(frames.JOIN_PLAY)) { assert.ok(frames.JOINS[k], k); for (const f of ['value', 'unit', 'rule', 'kind', 'source', 'checked']) assert.ok(r[f] != null, `${k}.${f}`); }
  const cuts = [{ name: 'x1', along: 'width' }, { name: 'x3', along: 'width' }], plays = [['width', 'j1'], ['width', 'j2'], ['height', 'j3'], ['height', 'j4']].map(([along, name]) => ({ name, along, slip }));
  const q = frames.squareness(260, 200, { cuts, plays });
  const hand = 2 * (0.5 * 260) / d + 2 * (0.1 * 260) / d + 2 * (0.1 * 200) / d;
  assert.ok(Math.abs(hand - 1.07309) < 1e-4, `${hand}`);
  assert.deepEqual([q.accept, q.rss], [1.07, 0.58]);
  assert.deepEqual(q.terms.map((x) => [x.term, x.value, x.kind]), [['x1 cut', 0.396, 'estimate'], ['x3 cut', 0.396, 'estimate'], ['j1 play', 0.079, 'estimate'], ['j2 play', 0.079, 'estimate'], ['j3 play', 0.061, 'estimate'], ['j4 play', 0.061, 'estimate']]);
  assert.match(q.text, /accept a difference of up to 1\.07 mm \(beams cut to ±0\.5 mm and the play of 4 joins, stacked worst case, every corner square; 0\.58 mm root-sum-square\)/);
  // loosening the cut tolerance to ±1 widens it by 2 × 0.5 × 260 / d = 0.79262 mm, the cut terms' own lever
  const loose = frames.squareness(260, 200, { cuts, plays, tolerance: 1 });
  assert.ok(Math.abs(loose.accept - q.accept - 0.79) < 0.011, `${loose.accept} - ${q.accept}`);
  // a beam with its own tolerance, and refusals by name
  assert.equal(frames.squareness(260, 200, { cuts: [{ name: 'x1', along: 'width', tolerance: 0 }, { name: 'x3', along: 'width' }] }).accept, 0.4);
  assert.throws(() => frames.squareness(260, 200, { cuts: [{ name: 'x1', along: 'up' }] }), /squareness: cuts 1 is \{ name, along: 'width' or 'height' \}/);
  assert.throws(() => frames.squareness(260, 200, { plays: [{ name: 'j1', along: 'width' }] }), /squareness: plays 1: slip is the join's play along the beam it meets/);
  assert.throws(() => frames.squareness(260, 200, { plays: 3 }), /squareness: plays is a list/);
});

test('measured joins: the joins set starts from the estimates, a measured figure is taken before the kit\'s and says when, and a slot nut says its hold along the slot', () => {
  const { joinRuleSet, joinStiffness, joinModel, JOIN_STIFFNESS, JOINS, slotNutModel } = frames;
  const set = joinRuleSet(), vocabulary = JSON.parse(fs.readFileSync(new URL('vocabulary.json', rulesDir), 'utf8'));
  // every kind's bending and twist, and a share for each kind a printed fitting can make, in the vocabulary's names
  assert.equal(set.part, 'joins'); assert.ok(vocabulary.parts.joins);
  assert.equal(Object.keys(set.rules).length, Object.keys(JOINS).length * 2 + Object.values(JOINS).filter((j) => j.printed).length);
  assert.deepEqual([set.rules.end_tap_bending.value, set.rules.blind_twist.value, set.rules.bracket_printed_share.value], [JOIN_STIFFNESS['end-tap'].bending.value, JOIN_STIFFNESS.blind.twist.value, 1]);
  for (const [k, r] of Object.entries(set.rules)) { assert.equal(r.kind, 'estimate', k); assert.ok(vocabulary.units.includes(r.unit), `${k}: ${r.unit}`); assert.match(r.source, /joint rig/, k); }
  // a workspace's copy with the blind join's bending measured: taken, said, and the rest still the estimates
  const b = beamModel('2020-misumi-hfs5', { length: 150 }), given = { sets: { joins: { ...set, rules: { ...set.rules, blind_bending: { ...set.rules.blind_bending, value: 9e5, kind: 'measured', source: 'the joint rig', checked: '2026-12-01' } } } } };
  const est = joinStiffness('blind', b), got = joinStiffness('blind', b, { given });
  assert.deepEqual([est.bending, est.kind, est.measured], [1.5e6, 'estimate', { bending: null, twist: null }]);
  assert.deepEqual([got.bending, got.twist, got.kind, got.measured], [9e5, 3e5, 'estimate', { bending: '2026-12-01', twist: null }]);
  assert.deepEqual(got.rests.map((r) => [r.name, r.kind]), [['joins.blind_bending', 'measured'], ['joins.blind_twist', 'estimate']]);
  // scaled for a 40 mm profile as the estimate is; and joinModel hands it on
  assert.equal(joinStiffness('blind', beamModel('4040-misumi-hfs8', { length: 150 }), { given }).bending, 9e5 * 8);
  const post = beamModel('2020-misumi-hfs5', { length: 200 });
  assert.equal(joinModel('blind', { beam: b, end: 'a' }, { beam: post, address: 'back@100' }, { given }).stiffness.bending, 9e5);
  // a slot nut's hold along its slot, from its set where it has one: only ever measured
  const nut = SETS['slot-nut-6-misumi-m5-slide-in'], own = { ...nut, rules: { ...nut.rules, hold_along: { value: 420, unit: 'N', rule: 'The pull along the slot at which it slipped', kind: 'measured', source: 'the joint rig', checked: '2026-12-01' } } };
  assert.equal(slotNutModel('slot-nut-6-misumi-m5-slide-in').holdAlong, null);
  const m = slotNutModel('slot-nut-6-misumi-m5-slide-in', {}, { sets: { 'slot-nut-6-misumi-m5-slide-in': own } });
  assert.deepEqual([m.holdAlong.value, m.findings.find((x) => x.code === 'slot_nut.hold_along').text], [420, 'tightened, it slips along the slot at 420 N: measured on 2026-12-01 (the joint rig)']);
});

// ---------- printed beams (Frames 3.5, issue 269) ----------
test('printable profiles: each worked out from its slot family\'s nuts and the printer, the published sets the same', () => {
  const { printedProfile, PRINTED_SERIES } = frames;
  for (const n of Object.keys(PRINTED_SERIES).map(Number)) {
    const { profile, slot } = printedProfile(n);
    for (const s of [profile, slot]) assert.deepEqual({ _doc: s._doc, name: s.name, part: s.part, rules: s.rules }, ruleSet(s.name), `${s.name}: the published set is printedProfile(${n})'s: regenerate it after a change`);
  }
  // By hand, 2020 round MISUMI's 6 mm drop-ins (10 wide, 3.3 high, a 5.8 x 0.8 tongue) on the X1C (line 0.42, fit 0.2,
  // hole_comp 0.1, chamfer 0.4, overhang 45):
  //   opening = max(6, 5.8 + 0.2) + 0.1 = 6.1; walls: floor((20 - (10 + 0.2)) / (2 x 0.42)) = 11 lines = 4.62, cavity 20 - 9.24 = 10.76
  //   lip: MISUMI's 2 mm, whole layers; lips slope at 90 - 45 = 45 deg, so a nut seats at 2 + (10 - 6.1) / 2 = 3.95 under the face
  //   depth = 3.95 + 3.3 + 0.2 + 0.4 = 7.85; floor = 10.76 - 2 x 0.4 = 9.96; solid under it 20 - 7.85 = 12.15
  //   ends: an M5 insert needs 6.5 + 2 x 2.6 + 2 x 0.42 = 12.54 > 12.15; M4 needs 5.7 + 2 x 2.1 + 0.84 = 10.74: M4, at 0, -7.85 / 2
  //   hold at 100 N: along the slot 6 + 2 x 2 = 10; the wall pushed out by 50 N, 7.85 - 3.95 = 3.9 below the seat:
  //   6 x 50 x 3.9 / (10 x 4.62^2) = 5.482 MPa; the lip's root 2 + 2.33 = 4.33 thick, 0.38 out: 6 x 50 x 0.38 / (10 x 4.33^2) = 0.608 MPa
  //   lying down, the lips lie in the layers and bend along them (PLA 39 MPa); the walls stand up through the layers and
  //   their bending stress runs up them, across the layers: PLA gives no strength_z, so 0.6 x 39 = 23.4 MPa (PRINTED_DEFAULTS.across)
  //   lips 39 / 0.608 = 64 times; walls 23.4 / 5.482 = 4.27 times: the wall governs, 427 N (at 39 MPa it would read 711 N)
  //   PETG gives 23 MPa across its layers (strength_z): 23 / 5.482 = 4.20 times, 420 N
  const { slot, profile, values } = printedProfile(20), r = (k) => slot.rules[k].value;
  assert.deepEqual(['opening', 'lip_thickness', 'lip_angle', 'cavity_width', 'cavity_depth', 'floor_width', 'flank_angle', 'nut_family'].map(r), [6.1, 2, 45, 10.76, 7.85, 9.96, 45, 'slot-6-misumi']);
  assert.deepEqual([values.wallLines, values.wall, values.solid, values.endThread, values.endAt], [11, 4.62, 12.15, 'M4', [0, -3.925]]);
  const wallStress = (6 * 50 * 3.9) / (10 * 4.62 ** 2);
  assert.ok(Math.abs(values.hold - (100 * 23.4) / wallStress) < 0.5, `hold ${values.hold}`);
  assert.ok(Math.abs(printedProfile(20, { material: 'petg' }).values.hold - (100 * 23) / wallStress) < 0.5, 'PETG: its own strength across its layers');
  assert.match(slot.rules.lip_thickness.rule, /hold 426\.89 N in pla, 4\.27 times that pull, the side walls the weaker: .* the walls stand through the layers and bend across them at 23\.4 MPa/);
  assert.deepEqual([profile.rules.slot_top.value, profile.rules.slot.value, profile.rules.end_thread.value, profile.rules.end_at.value], ['slot-6-printed-2020', 'closed', 'M4', '0,-3.925']);
  // 15: OpenBeam's M3 hex nut, held by its flats: a cavity of whole lines between 5.5 + 0.2 and its corners 6.35 less 0.2: 15 - 2 x 11 x 0.42 = 5.76
  assert.equal(printedProfile(15).values.cavityWidth, 5.76);
  // another printer: a 50 deg overhang leans the lips 40 deg, a wider line makes the walls another whole number
  assert.equal(printedProfile(20, { printer: { overhang: 50 } }).slot.rules.lip_angle.value, 40);
  assert.equal(printedProfile(20, { printer: { line: 0.45 } }).values.wall, 4.5);
  // the slot takes its family's nuts: nutFor finds MISUMI's M4 drop-in for it, seated on the sloped lips
  const nut = frames.nutFor('profile-2020-printed', 'top', 'M4', { kind: 'drop-in' });
  assert.equal(nut.name, 'slot-nut-6-misumi-m4-drop-in');
  assert.deepEqual(nut.fits.map((f) => `${f.level} ${f.code}`), ['info slot_nut.seat']); assert.equal(nut.fits[0].values.seat, 3.95);
  // seated on the slope there is 7.85 - 3.95 = 3.9 mm of room for its 3.3; measured from the lip's 2 mm it would read 5.85
  assert.deepEqual(frames.nutFit(frames.slotNutModel('slot-nut-6-misumi-m4-drop-in', { height: 3.95 }), frames.slotModel('slot-6-printed-2020')).map((f) => `${f.level} ${f.rule}`), ['fail height', 'info lip_angle']);
  // refused by name
  assert.throws(() => printedProfile(25), /the kit draws 15, 20, 30, 40 mm; for 25 mm name the slot nut/);
  assert.throws(() => printedProfile(20, { nut: 'slot-6-misumi' }), /nut is a slot nut's set/);
  assert.throws(() => printedProfile(20, { infill: 0.3 }), /no option "infill": it takes nut, printer, pull and material/);
  assert.throws(() => printedProfile(20, { material: 'al6063-t5' }), /material is a plastic's set with a strength and a softening point/);
  assert.throws(() => printedProfile(15, { nut: 'slot-nut-8-misumi-m5-drop-in' }), /a 15 mm section has no wall of whole 0.42 mm lines that leaves 15.2 mm/);
});

test('a printed section from its walls and infill: a solid square by the textbook, a shell, and between', () => {
  const { printedSection } = frames, bar = profileModel('profile-bar', { width: 20, height: 20 });
  // solid (infill 1): b h^3 / 12 = 20^4 / 12 = 13333 mm^4, 400 mm^2
  const solid = printedSection(bar, { walls: 1, infill: 1 });
  within(solid.inertiaX, 20 ** 4 / 12, 0.005, 'solid'); within(solid.area, 400, 0.005, 'solid area');
  // a shell three lines thick (1.26 mm), no infill: (20^4 - 17.48^4) / 12 = 5553 mm^4, 400 - 17.48^2 = 94.4 mm^2
  const shell = printedSection(bar, { walls: 3, infill: 0 });
  within(shell.inertiaX, (20 ** 4 - 17.48 ** 4) / 12, 0.02, 'shell'); within(shell.plastic, 400 - 17.48 ** 2, 0.02, 'shell plastic');
  // 40% infill: the inside counts at 0.4 (PRINTED_DEFAULTS.infill_stiffness 1): 5553 + 0.4 x 17.48^4 / 12 = 8665
  const mid = printedSection(bar, { walls: 3, infill: 0.4 });
  within(mid.inertiaX, (20 ** 4 - 17.48 ** 4) / 12 + (0.4 * 17.48 ** 4) / 12, 0.02, '40% infill'); within(mid.plastic, 94.4 + 0.4 * 17.48 ** 2, 0.02, 'plastic laid');
  assert.throws(() => printedSection(bar, { walls: 2.5 }), /walls is a whole number of lines/);
  assert.throws(() => printedSection(bar, { infill: 40 }), /infill is a share from 0 to 1/);
});

test('a 240 mm printed 2020 beam prints lying down with no support, takes a bought drop-in nut, and has inserts for ends', async () => {
  const b = beamModel('2020-printed', { length: 240, printed: true, ends: 'tapped' });
  assert.equal(b.bought, false); assert.equal(b.printed.pose, 'lying'); assert.match(b.title, /printed lying down$/);
  assert.deepEqual(printable(b).map((f) => f.level), ['pass']);
  // its mass is the plastic laid: the shell and 40% of the inside, times 240 mm and PLA's 1.26 g/cm^3
  const sec = b.printed.section;
  assert.ok(Math.abs(b.mass - (sec.plastic * 240 * 1.26) / 1000) < 1e-3); assert.ok(b.mass > 50 && b.mass < 70, `${b.mass} g`);
  assert.equal(coded(b, 'beam.mass')[0].refs.kind, 'estimate'); assert.equal(b.figures.inertiaX.kind, 'estimate'); assert.equal(b.material.modulus, 2680);
  // designed to carry the strength along its layers over the margin: 39 / 2 x I / c
  assert.ok(Math.abs(b.printed.design - (19.5 * sec.inertiaX) / sec.reach[0]) < 0.01);
  // tapped ends become M4 heat-set inserts, the cut list's square cuts no operation of a print
  assert.deepEqual([b.ends.a, b.ends.b], [{ kind: 'insert', thread: 'M4' }, { kind: 'insert', thread: 'M4' }]); assert.deepEqual(b.ops, []);
  assert.ok(coded(b, 'beam.end').every((f) => f.level === 'pass'));
  // the slot's hold on the beam is the profile's: its walls, upright as it lies, bend across the layers at 0.6 x 39 MPa
  assert.equal(coded(b, 'beam.slot')[0].level, 'pass'); assert.ok(Math.abs(b.printed.slots[0].hold - frames.printedProfile(20).values.hold) < 1e-6 && b.printed.slots[0].governs === 'wall');
  assert.deepEqual([coded(b, 'beam.slot')[0].values.lip, coded(b, 'beam.slot')[0].values.wall], [39, 23.4]);
  // as it prints: on its bottom face along x, the slot on top (a 1 mm slab across the top at mid-length is 20 x 10 less the 6.1 opening)
  const g = frames.printedBeam(b), bb = jscad.measurements.measureBoundingBox(g);
  assert.deepEqual(bb.map((p) => p.map((x) => +x.toFixed(3) + 0)), [[0, -10, 0], [240, 10, 20]]);
  const slab = jscad.booleans.intersect(g, jscad.primitives.cuboid({ size: [10, 30, 1], center: [120, 0, 19.5] }));
  within(jscad.measurements.measureVolume(slab), 10 * (20 - 6.1), 0.001, 'the slot is open at the top');
  // the inserts' holes are in both ends: a probe 5 mm into each end, round the insert's line, is mostly hole
  for (const x of [2.5, 237.5]) { const probe = jscad.primitives.cuboid({ size: [5, 3, 3], center: [x, 0, 10 - 3.925] }); assert.ok(jscad.measurements.measureVolume(jscad.booleans.intersect(g, probe)) < 0.5 * 45, `the insert's hole at x ${x}`); }
  await prints(g, 'a 240 mm printed 2020 lying down');
  // a bought drop-in nut: MISUMI's M4, in its top slot
  assert.equal(frames.nutFor(b.profile, 'top', 'M4', { kind: 'drop-in' }).name, 'slot-nut-6-misumi-m4-drop-in');
});

test('a printed beam stands or lies as it says, and is refused by name where it cannot print so', async () => {
  // an aluminium section lying down: its side slots hang in mid-air, its top lips are flat ledges, its bed slot's floor too wide to bridge
  const al = beamModel('2020-misumi-hfs5', { length: 200, printed: true });
  assert.equal(al.material.name, 'pla', 'printed in PLA where the profile is a metal\'s');
  assert.deepEqual(printable(al).map((f) => `${f.level} ${f.rule}`), ['fail slot_front', 'fail slot_back', 'fail lip_angle', 'fail floor_width']);
  // standing up it prints, exact, and bends across its layers: PLA gives no strength across them, so 0.6 x 39 = 23.4 MPa
  const st = beamModel('2020-misumi-hfs5', { length: 200, printed: { pose: 'standing' } });
  assert.deepEqual(printable(st).map((f) => f.level), ['pass']); assert.equal(st.printed.strength, 23.4); assert.equal(st.printed.strengthKind, 'estimate'); assert.equal(st.material.modulus, 2160);
  // its lips, standing up, bend in the section, which is the layer: along the layers, at 39 MPa, not across them at 23.4.
  // A 100 N pull stresses each lip's root 15 MPa, so they hold 39 / 15 = 2.6 times it, 260 N (at 23.4 MPa it read 1.56
  // times, a warning, as if they bent across the layers)
  for (const f of coded(st, 'beam.slot')) { assert.deepEqual([f.level, f.values.lip, f.values.wall, f.values.stress, f.values.margin], ['pass', 39, 39, 15, 2.6]); assert.match(f.text, /along its layers, standing up: the section is the layer/); }
  await prints(frames.printedBeam(st), 'a standard 2020 standing up');
  // past the bed: lying, splice it; standing, lie it down
  assert.match(printable(beamModel('2020-printed', { length: 300, printed: true }))[0].text, /300 mm long, and x1c's bed is 256 mm: splice it in two/);
  assert.match(printable(beamModel('2020-printed', { length: 300, printed: { pose: 'standing' } }))[0].text, /x1c prints 256 mm high: lie it down/);
  // more walls and infill: heavier and stiffer
  const light = beamModel('2020-printed', { length: 200, printed: { walls: 2, infill: 0.15 } }), heavy = beamModel('2020-printed', { length: 200, printed: { walls: 4, infill: 0.8 } });
  assert.ok(heavy.mass > light.mass && heavy.figures.inertiaX.value > light.figures.inertiaX.value);
  // refused by name
  assert.throws(() => beamModel('2020-printed', { length: 200, printed: { pose: 'sideways' } }), /printed.pose is lying \(on its bottom face, layers along the beam\) or standing/);
  assert.throws(() => beamModel('2020-printed', { length: 200, printed: { colour: 'red' } }), /printed has no "colour": it takes pose, walls, infill, printer, end, pull/);
  assert.throws(() => beamModel('2020-printed', { length: 200, printed: { infill: 2 } }), /printed.infill is a share from 0 to 1/);
  assert.throws(() => beamModel('2020-printed', { length: 200, printed: true, ends: 'welded' }), /a printed beam's end a is cut, tapped, insert, nut/);
  assert.throws(() => frames.printedBeam(beamModel('2020-printed', { length: 200 })), /printedBeam: profile-2020-printed x 200 is a bought beam: give one printed/);
});

test('a printed beam\'s ends: a captive nut or an insert in place of a tap, each printing as it lies or stands', async () => {
  // a tap at an end is the printed end: a nut slid in from the front face, 1.5 x 4 = 6 mm in from the end
  const b = beamModel('2020-printed', { length: 120, printed: { end: 'nut' }, ops: [{ op: 'tap', at: 'a' }] });
  assert.deepEqual([b.ends.a.kind, b.ends.b.kind], ['nut', 'cut']); assert.equal(b.printed.ends.a.wall, 6);
  await prints(frames.printedBeam(b), 'a captive nut at end a, lying');
  await prints(frames.printedBeam(beamModel('2020-printed', { length: 120, printed: { pose: 'standing' }, ends: ['insert', 'nut'] })), 'an insert going up from the bed, a nut slid in from the side, standing');
  // a section with no end_thread has no printed end: said by name
  const plainBar = beamModel('profile-bar', { length: 100, printed: true, ends: 'insert' });
  assert.match(coded(plainBar, 'beam.end')[0].text, /names no end_thread or end_at for a printed end/);
});

test('a beam printed standing from a profile with a bore takes its end\'s screw in the bore\'s place: a captive nut where an insert has no room, the bore filled under it; a foot takes that thread; drawn in place with its ends', async () => {
  const { beamModel, printedBeam, printedInPlace, footModel } = frames;
  const end = (o) => coded(beamModel('2020-misumi-hfs5', { length: 120, material: 'petg', printed: { pose: 'standing', ...o }, ops: [{ op: 'tap', at: 'a' }] }), 'beam.end')[0];
  // MISUMI's 2020 names no end figures; its 4.2 mm bore leaves 4 mm of plastic round its middle (the slots' floors).
  // An M5 screw does not pass the bore (5 > 4.2), so M4 is the largest. Its insert needs 5.7 / 2 + 2.1 = 4.95 mm: no room
  const ins = end({});
  assert.equal(ins.level, 'fail'); assert.match(ins.text, /end a takes M4 in a heat-set insert .* in its 4\.2 mm bore's place .*: none does\): 4 mm of plastic round its middle, short of the hole/);
  // A captive nut: M4's corners need 7 / cos 30° / 2 + 0.42 = 4.46 mm, M3's 5.5 / cos 30° / 2 + 0.42 = 3.6 mm: M3 fits
  const nut = end({ end: 'nut' });
  assert.equal(nut.level, 'pass', nut.text); assert.deepEqual([nut.refs.thread, nut.refs.fixing, nut.values.room], ['M3', 'nut', 4]);
  assert.ok(Math.abs(nut.values.need - (5.5 / Math.cos(Math.PI / 6) / 2 + 0.42)) < 1e-6, String(nut.values.need));
  // drawn as it prints and in its place: it prints clean, and in place the bore is filled where the screw's 3.5 mm hole
  // and the nut's slot are cut, so 1 mm in from the end there is plastic between the hole and the bore's wall
  const b = beamModel('2020-misumi-hfs5', { length: 120, material: 'petg', printed: { pose: 'standing', end: 'nut' }, ops: [{ op: 'tap', at: 'a' }, { op: 'tap', at: 'b' }] });
  await prints(printedBeam(b), 'a standing post with a captive nut in each end');
  const { intersect, subtract } = jscad.booleans, { measureVolume } = jscad.measurements, { cylinder } = jscad.primitives, placed = printedInPlace(b);
  const ring = (z) => measureVolume(intersect(placed, subtract(cylinder({ radius: 2.05, height: 1, center: [0, 0, z], segments: 32 }), cylinder({ radius: 1.8, height: 1, center: [0, 0, z], segments: 32 }))));
  assert.ok(ring(1) > 2, `filled under the nut: ${ring(1)} mm³ between the 3.5 mm hole and the 4.2 mm bore`);
  assert.ok(ring(60) < 0.05, `the bore open in the middle: ${ring(60)} mm³`);
  // the foot under it: its screw the printed end's thread, its tap op that thread, its text the printed end's
  const ft = footModel('2020-misumi-hfs5', { material: 'petg', thread: 'M3' });
  assert.deepEqual([ft.thread, ft.screws[0].thread, ft.ops[0].thread], ['M3', 'M3', 'M3']);
  assert.match(coded(ft, 'fitting.screw')[0].text, /^M3 cap through 3 mm of floor into the printed end's own M3 fixing/);
  await prints(frames.foot(ft), 'a foot for an M3 printed end');
  assert.throws(() => footModel('2020-misumi-hfs5', { thread: 'M6' }), /an M6 screw does not pass up profile-2020-misumi-hfs5's 4\.2 mm bore/);
  assert.throws(() => footModel('2020-misumi-hfs5', { thread: 'big' }), /thread is the printed end's thread, as 'M3'/);
});

test('operations on a printed beam are features of the print: holes sized by the printer, a hole on its side a teardrop', async () => {
  const { opCutters } = await import('./ops.mjs');
  // the X1C's M4 clearance: 4.5 + its hole_comp 0.1 = 4.6 (machined, 4.5 as drawn)
  const b = beamModel('2020-printed', { length: 160, printed: true, ops: [{ op: 'drill', at: 'front@40', thread: 'M4' }, { op: 'drill', at: 'top@120', diameter: 3 }] });
  assert.match(b.ops[0].line, /^drill Ø4\.6 mm in front\.1, 40 mm from end a/);
  // lying down, the front hole lies on its side: its cutter rises r root 2 = 2.3 x 1.414 = 3.25 over its axis, a teardrop's point;
  // the top one stands up, round. Not printed (no way up), the same hole is round: 2.3 over its axis
  const top = (cutters, i) => +jscad.measurements.measureBoundingBox(cutters[i])[1][1].toFixed(2);
  assert.equal(top(opCutters(b, { up: [0, 1, 0] }), 0), +(2.3 * Math.SQRT2).toFixed(2));
  assert.equal(top(opCutters(b, {}), 0), 2.3);
  await prints(frames.printedBeam(b), 'a printed beam with a hole through its side and one down from the top');
  // a printed profile's beam is printed: operations on one not said to be are refused by name
  assert.throws(() => beamModel('2020-printed', { length: 160, ops: [{ op: 'drill', at: 'top@20', diameter: 3 }] }), /profile-2020-printed is a printed profile: a beam of it is printed \(\{ printed: true \}\), and its operations are features of the print/);
});

test('a 400 mm printed 2020 is spliced in two: a keyed lap that prints lying down, each half of the section and the screws checked', async () => {
  const b = beamModel('2020-printed', { length: 400, printed: true, ends: 'tapped' });
  // the frame's moment: 50 N hung in the middle of the beam as a 400 mm simply supported span puts 50 / 2 x 400 / 2 =
  // 5000 N.mm at its middle, the most anywhere on it, so at least as much as at the lap; the joint must carry twice that
  const s = frames.spliceModel(b, { moment: 5000 });
  assert.deepEqual(s.findings.map((f) => `${f.level} ${f.code}`), ['pass splice.fit', 'info splice.place', 'pass splice.strength', 'info splice.screw']);
  // each half on the 256 mm bed; the lap as far from the middle as that allows: at = L + lap / 2 - bed
  assert.ok(s.pieces.every((p) => p.length <= 256 + 1e-9)); assert.ok(Math.abs(s.at - (400 + s.lap / 2 - 256)) < 1e-6);
  // By hand, the screws: an M4 button head's seat is 8.1 across, a teardrop whose point rises 4.05 x root 2 = 5.73 over
  // its axis; under the slot's floor (y 2.15) less two lines: y = min((2.15 - 10) / 2, 2.15 - 0.84 - 5.73) = -4.42, its
  // seat's foot 4.42 + 4.05 = 8.47 down, 1.53 over the bed (M5's 10 mm seat would reach under the bed's two lines).
  // An M4 x 16 from the seat (2.2 deep) reaches 2.2 + 16 = 18.2 of the 20, so the nut's pocket is 20 - 18.2 + 3.2 = 5 deep.
  // One screw across the cut, the thinner half 10 - 0.1 - 5 = 4.9 mm thick, plastic at 0.6 x 39 = 23.4 MPa across its layers:
  //   bearing 4 x 4.9 x 23.4 = 458.6 N; torn out to the bed, e = 10 - 4.42 - 4.6 / 2 = 3.28 mm, two planes at 23.4 / root 3:
  //   2 x 3.28 x 4.9 x 13.51 = 434.5 N, the least
  const [sc] = s.screws, st = s.findings[2].values, e = 10 - 4.418 - 2.3;
  assert.deepEqual([sc.thread, sc.length, sc.head, sc.pocket], ['M4', 16, 'button', 5]);
  assert.ok(Math.abs(st.bearing - 4 * 4.9 * 23.4) < 0.05 && Math.abs(st.per - (2 * e * 4.9 * 23.4) / Math.sqrt(3)) < 0.5, `per screw ${st.per}`);
  // the couple: per x arm; the joint carries the least of it and each half's section, and passes twice the moment given
  assert.ok(Math.abs(s.couple - st.per * st.arm) < 1e-3); assert.equal(s.capacity, Math.min(s.couple, st.a, st.b)); assert.ok(s.capacity >= 2 * 5000);
  // each half's section over the lap is about half the beam's: its modulus 40 to 60% of the whole printed section's
  for (const h of ['a', 'b']) { const r = s.halves[h].modulus / b.printed.section.modulusX; assert.ok(r > 0.4 && r < 0.6, `${h}: ${r}`); }
  // both halves print lying down; together they weigh the beam less the holes
  const [A, B] = frames.splice(s);
  for (const [g, what] of [[A, 'the half toward a'], [B, 'the half toward b']]) { const bb = jscad.measurements.measureBoundingBox(g); assert.ok(bb[0][0] > -1e-6 && bb[1][0] <= 256 + 1e-6 && Math.abs(bb[0][2]) < 1e-6, what); await prints(g, what); }
  assert.ok(A.grams + B.grams < b.mass && A.grams + B.grams > 0.95 * b.mass, `${A.grams} + ${B.grams} against ${b.mass}`);
  // as drawn, half a 1 mm into the lap keeps about half the section (a 0.5 mm slab across it, against one where it is whole)
  const z0 = s.at - s.lap / 2, slab = (x) => jscad.measurements.measureVolume(jscad.booleans.intersect(A, jscad.primitives.cuboid({ size: [0.5, 40, 40], center: [x, 0, 10] }))) / 0.5;
  const ratio = slab(z0 + 1) / slab(20); assert.ok(ratio > 0.45 && ratio < 0.55, `half a over the lap keeps ${ratio} of the section`);
  // with no moment given, the joint must carry what the beam breaks at there: a lap halves the section, so it fails, said
  const full = frames.spliceModel(b), f = full.findings[2], share = (4 * full.at * (400 - full.at)) / 400 ** 2;
  assert.equal(f.level, 'fail'); assert.ok(Math.abs(full.need - share * 2 * b.printed.design) < 1e-3); assert.ok(full.capacity < 0.55 * full.need);
  assert.match(f.text, /a splice carries about half what the beam does: give the moment the frame puts there \(moment\), up to 6\.\d+ N·m/);
  // a smaller moment: the shortest lap does, placed the same way
  const easy = frames.spliceModel(b, { moment: 2000 });
  assert.equal(easy.lap, 40); assert.match(easy.findings[1].text, /where the frame puts 2 N·m/); assert.equal(easy.findings[2].level, 'pass');
  // refused by name
  assert.throws(() => frames.spliceModel(beamModel('2020-printed', { length: 400, printed: { pose: 'standing' } })), /prints standing up: a splice joins halves printed lying down/);
  // a lap's middle where no half fits the bed: refused with where it may go. The shortest lap is 2 x 20 = 40 mm, so its
  // middle is at least 400 + 20 - 256 = 164 mm from end a (half b on the bed) and at most 256 - 20 = 236 (half a)
  assert.throws(() => frames.spliceModel(b, { at: 100 }), /no splice fits x1c's 256 mm bed with its middle at 100 mm: its shortest lap is 40 mm \(2 times the 20 mm height\), so two halves hold a beam of 472 mm at most, its lap's middle between 164 and 236 mm from end a: give at in that range/);
  // a beam too long for two halves at all: 2 x 256 - 80 = 432 mm of 4040, said, not "0 N·m"
  const long = () => frames.spliceModel(beamModel('4040-printed', { length: 500, printed: true, ends: 'tapped' }), { moment: 30000 });
  assert.throws(long, /no splice fits x1c's 256 mm bed: its shortest lap is 80 mm \(2 times the 40 mm height\), so two halves hold a beam of 432 mm at most: shorten the beam, or splice it in three/);
  assert.throws(long, (e) => !/ 0 N·m/.test(e.message));
  // a moment no lap the bed allows carries: what the longest lap does carry, and the moment that fits. 470 mm in two
  // halves of 256 leaves a lap of 2 x 256 - 470 = 42 mm at most; grown from 40 in lines of 0.42, the longest is 41.68.
  // Its screws sit 2.5 x 4 = 10 mm in from each end of it, 21.68 apart: 434.53 N x 21.68 = 9.42 N·m, so 4.71 N·m with the margin
  assert.throws(() => frames.spliceModel(beamModel('2020-printed', { length: 470, printed: true, ends: 'tapped' }), { moment: 6000 }), /the longest lap x1c's 256 mm bed lets halves have \(41\.68 mm\) carries 9\.42 N·m with two M4 screws \(434\.53 N each, 21\.68 mm apart\), under the 12 N·m it must: a moment of 4\.71 N·m or less there fits/);
  assert.throws(() => frames.spliceModel(beamModel('2020-misumi-hfs5', { length: 400, printed: true })), /has a slot where the splice's screws go/);
  assert.throws(() => frames.spliceModel(b, { lap: 50 }), /no option "lap": it takes at, moment, thread and printer/);
});

test('a splice\'s strength is the least of its halves\' sections and its screws: a solid bar by the textbook', () => {
  // a solid 20 x 20 PLA bar (infill 1), 400 mm: whole, Z = b h^2 / 6 = 20 x 20^2 / 6 = 1333 mm^3, 52 N·m at 39 MPa.
  // Over the lap each half is 10 less half the 0.2 fit wide: Z = 9.9 x 20^2 / 6 = 660 mm^3, 25.74 N·m. At each end of
  // the lap that half carries the whole moment alone, so the joint can carry no more than that, however many screws
  const bar = beamModel(profileModel('profile-bar', { width: 20, height: 20 }), { length: 400, printed: { infill: 1 } });
  within(bar.printed.section.modulusX, 20 * 20 ** 2 / 6, 0.01, 'the whole bar');
  const s = frames.spliceModel(bar), st = s.findings[2].values;
  for (const h of ['a', 'b']) within(s.halves[h].modulus, (9.9 * 20 ** 2) / 6, 0.01, `half ${h}`);
  // At its first screw each half still carries the whole moment, and the screw's hole and its seat or pocket cut its
  // section (read through the screw's axis). The bar takes M5 at y = 0: its 5.6 mm hole a teardrop from -2.8 to
  // 2.8 x root 2 = 3.96 right across the half. Half a: its head's seat, 10 across and 2.8 deep from its face, a teardrop
  // from -5 to 7.07, so 9.9 - 2.8 = 7.1 wide from -5 to -2.8 and from 3.96 to 7.07, 9.9 wide beyond. By rectangles:
  //   A = 9.9 x 5 + 7.1 x 2.2 + 7.1 x 3.11 + 9.9 x 2.93 = 116.2 mm², centroid -0.54, I = 5920 mm⁴,
  //   Z = 5920 / (10 + 0.54) = 561.7 mm³ (against 660 between the screws), 21.9 N·m at 39 MPa.
  // Half b: its nut's pocket 5.9 deep and 9.35 across the corners, -4.68 to 4.68: 9.9 - 5.9 = 4 wide there, Z = 600.2 mm³
  within(s.halves.a.net, 561.7, 0.01, 'half a at its first screw'); within(s.halves.b.net, 600.2, 0.01, 'half b at its first screw');
  within(st.a, 39 * 561.7, 0.01, 'half a carries');
  // the screws were made to carry what the halves do (the less of that and what is asked); the halves govern
  assert.ok(s.couple >= Math.min(st.a, st.b) - 1e-6); assert.equal(s.capacity, Math.min(st.a, st.b));
  assert.equal(s.findings[2].level, 'fail'); assert.ok(Math.abs(s.capacity / s.need - 561.7 / 1333) < 0.03, `${s.capacity} of ${s.need}`);
  // a moment within half of it passes: 10 N·m given, 20 N·m with the margin, under 21.9
  assert.equal(frames.spliceModel(bar, { moment: 10000 }).findings[2].level, 'pass');
  assert.equal(frames.spliceModel(bar, { moment: 13000 }).findings[2].level, 'fail');
  assert.throws(() => frames.printedSection(bar.profile, { holes: [[0, 1, 2]] }), /holes is a list of \[x0, x1, y0, y1\] boxes taken out of the section in mm/);
  assert.throws(() => frames.printedSection(bar.profile, { between: [1, -1] }), /between is \[x0, x1\], two upright cuts across the section in mm, x0 under x1/);
});

test('a printed beam\'s creep: a sustained stress against a share of its strength for its pose, and its sag as it creeps; the beam coupon\'s figures taken before the plastic\'s', () => {
  const { beamCreep, PRINTED_DEFAULTS } = frames;
  const lying = beamModel('profile-2020-printed', { length: 240, material: 'petg', printed: true });
  const standing = beamModel('profile-2020-printed', { length: 240, material: 'petg', printed: { pose: 'standing' } });
  // Hand calculation (PETG HF, petg.json): along its layers (lying) 34 MPa, across (standing) 23 MPa (strength_z).
  //   creep limit lying = 0.15 x 34 = 5.1 MPa; standing = 0.15 x 23 = 3.45 MPa (PRINTED_DEFAULTS.creep, an estimate)
  //   2.55 MPa sustained, lying: 5.1 / 2.55 = 2 times under: passes. Standing: 3.45 / 2.55 = 1.353: passes.
  //   6 MPa lying: 5.1 / 6 = 0.85: fails, and the text says it the right way round: 6 / 5.1 = 1.18 times over (to two places).
  //   10 MPa lying: 10 / 5.1 = 1.96 times over (its margin 5.1 / 10 = 0.51).
  assert.equal(PRINTED_DEFAULTS.creep.kind, 'estimate'); assert.match(PRINTED_DEFAULTS.creep.source, /Waseem et al\. \(2020\).*15 MPa.*1\.2 to 2\.3 hours/);
  assert.deepEqual([lying.printed.creep.limit, standing.printed.creep.limit], [5.1, 3.45]);
  const a = beamCreep(lying, { stress: 2.55 });
  assert.deepEqual([a.level, a.code, a.values.margin, a.refs.kind, a.refs.pose], ['pass', 'beam.creep', 2, 'estimate', 'lying']);
  assert.match(a.text, /a sustained 2\.55 MPa against the 5\.1 MPa it may hold for months \(0\.15 of its 34 MPa along its layers, PRINTED_DEFAULTS\.creep, an estimate\): 2 times under it/);
  assert.equal(beamCreep(standing, { stress: 2.55 }).values.margin, 1.353);
  const over = beamCreep(lying, { stress: 6 });
  assert.equal(over.level, 'fail'); assert.match(over.text, /: 1\.18 times over it, so it creeps on toward breaking/); assert.doesNotMatch(over.text, /times under/);
  const ten = beamCreep(beamModel('profile-2020-printed', { length: 200, material: 'petg', printed: true }), { stress: 10 });
  assert.deepEqual([ten.level, ten.values.margin], ['fail', 0.51]); assert.match(ten.text, /a sustained 10 MPa against the 5\.1 MPa .*: 1\.96 times over it, so it creeps on toward breaking/); assert.doesNotMatch(ten.text, /times under/);
  // a moment: stress = M / Z, Z the printed section's (printedSection's modulusX)
  const Z = lying.printed.section.modulusX;
  assert.equal(beamCreep(lying, { moment: 2.55 * Z }).values.stress, 2.55);
  // the sag it creeps to: 0.3 mm short-term over 0.5 (creep_modulus) = 0.6 mm, over a 0.5 mm limit: 1.2 times over
  const sag = beamCreep(lying, { stress: 1, sag: 0.3, limit: 0.5 });
  assert.deepEqual([sag.level, sag.values.creep], ['fail', 0.6]); assert.match(sag.text, /its 0\.3 mm sag creeps to about 0\.6 mm .*1\.2 times over the 0\.5 mm allowed/);
  assert.equal(beamCreep(lying, { stress: 1, sag: 0.2, limit: 0.5 }).level, 'pass');
  // refused by name
  assert.throws(() => beamCreep(beamModel('2020-misumi-hfs5', { length: 240 }), { stress: 1 }), /beamCreep: .* is not a printed beam/);
  assert.throws(() => beamCreep(lying, {}), /give the sustained load as stress/);
  assert.throws(() => beamCreep(lying, { stress: 1, sag: 1 }), /sag and limit go together/);
  assert.throws(() => beamCreep(lying, { load: 1 }), /no option "load"/);
  // the beam coupon's figures, in a copy of the plastic's set (as cad measured writes it): a printed beam takes them
  // before the plastic's own, each for its pose, and its creep limit follows the strength measured
  const petg = structuredClone(SETS.petg), got = (value) => ({ value, unit: 'MPa', rule: 'From the beam coupon', kind: 'measured', source: 'this test', checked: '2026-11-17' });
  petg.rules.beam_modulus = got(1500); petg.rules.beam_strength = got(30); petg.rules.beam_modulus_z = got(1200);
  const given = { sets: { petg } };
  const m = beamModel('profile-2020-printed', { length: 240, material: 'petg', printed: true, given }), z = beamModel('profile-2020-printed', { length: 240, material: 'petg', printed: { pose: 'standing' }, given });
  assert.deepEqual([m.material.modulus, m.printed.strength, m.printed.strengthKind, m.printed.coupon.modulus, m.printed.modulusKind, m.printed.creep.limit], [1500, 30, 'measured', 'petg.beam_modulus', 'measured', 4.5]);
  assert.deepEqual([z.material.modulus, z.printed.strength, z.printed.coupon.strength], [1200, 23, null], 'standing: its own coupon figure where measured, the plastic\'s across the layers where not');
  assert.match(m.findings.find((x) => x.code === 'beam.mass').text, /at 1500 MPa along its layers \(petg\.beam_modulus, measured, from the beam coupon/);
  assert.match(lying.findings.find((x) => x.code === 'beam.mass').text, /All estimates until the beam coupon is measured/);
});

test('frame generators: a box asked for by its inside size has its butting beams one profile width shorter at each end than the uprights they meet; another profile changes every length; refusals by name', () => {
  const { box, portal, table, gantry, shelf, frameModel } = frames;
  const lengths = (m) => Object.fromEntries(m.beams.map((b) => [b.id, b.length]));
  // A box inside 300 x 300 x 350 in 2020 (p = 20), joined blind: the uprights run through, every other beam butts.
  // Hand: outside = inside + 2p each way = 340 x 340 x 390. Uprights: the outside height, 390 = 350 + 2 x 20. A beam
  // across butts at both ends against an upright's face: 340 - 20 - 20 = 300, the inside. So an upright of the same
  // inside span (300) would be 300 + 2 x 20 = 340: the two differ by the profile's width at each butting end.
  const m = box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', join: 'blind' });
  assert.deepEqual([m.inside, m.outside, m.arrangement], [[300, 300, 350], [340, 340, 390], 'face']);
  assert.deepEqual(m.lengths.map((l) => [l.length, l.count]), [[390, 4], [300, 8]]);
  const cube = box({ inside: [300, 300, 300], profile: '2020-misumi-hfs5' }), L = lengths(cube);
  assert.equal(L.z1 - L.x1, 2 * 20, 'an upright and a beam butting into it across the same inside differ by one width at each end');
  // every butting end meets its upright's face at the beam's own centre line: x1 at 10 mm up (p / 2), the top ring at 340 - 10
  assert.deepEqual(m.joins.slice(0, 2), [{ kind: 'blind', a: 'x1.a', b: 'z1.back@10' }, { kind: 'blind', a: 'x1.b', b: 'z2.front@10' }]);
  assert.deepEqual(m.joins.find((j) => j.a === 'y3.a'), { kind: 'blind', a: 'y3.a', b: 'z1.top@380' });
  assert.equal(m.joins.length, 16); assert.deepEqual(m.ends.map((e) => e.at), ['z1.a', 'z1.b', 'z2.a', 'z2.b', 'z3.a', 'z3.b', 'z4.a', 'z4.b']);
  assert.deepEqual(m.beams.find((b) => b.id === 'x1'), { id: 'x1', role: 'across', length: 300, from: [20, 10, 10], to: [320, 10, 10] });
  // The same request in 3030 (p = 30): inside the same, so the butting beams stay 300 and the uprights grow by 2 x 10;
  // asked by the outside instead (340 x 340 x 390), the uprights stay 390 and every butting beam loses 2 x 10 = 20 mm
  const big = box({ inside: [300, 300, 350], profile: '3030-item-6', join: 'blind' });
  assert.deepEqual([big.outside, big.lengths.map((l) => [l.length, l.count])], [[360, 360, 410], [[410, 4], [300, 8]]]);
  assert.deepEqual(big.joins[0], { kind: 'blind', a: 'x1.a', b: 'z1.back@15' });
  const out20 = box({ outside: [340, 340, 390], profile: '2020-misumi-hfs5' }), out30 = box({ outside: [340, 340, 390], profile: '3030-item-6' });
  for (const b of out20.beams) assert.equal(lengths(out30)[b.id], b.role === 'upright' ? b.length : b.length - 2 * (30 - 20), b.id);
  // a profile whose end has several bores: the join screws into the threaded one in the middle (3030-misumi-hfs6's a.1)
  assert.equal(box({ inside: [300, 300, 350], profile: '3030-misumi-hfs6' }).joins[0].a, 'x1.a.1');
  // a cube join: every beam butts into a corner node, so every one is as long as the inside it bounds
  const nodes = box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', join: 'cube' });
  assert.deepEqual([nodes.arrangement, nodes.lengths.map((l) => [l.length, l.count]), nodes.ends.length], ['node', [[350, 4], [300, 8]], 0]);
  assert.deepEqual(nodes.joins.slice(0, 2), [{ kind: 'cube', a: 'y1.a', b: 'x1.a' }, { kind: 'cube', a: 'z1.a', b: 'x1.a' }]);
  // feet under the uprights, caps on the other open ends, a bought set by name. A printed foot is screwed into its
  // upright's end: the end tapped as the foot's model says (M5, 18.5 mm, its end screw's length and a margin) and its M5
  // cap screw named, for cad to fasten
  const footed = box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', feet: 'levelling', caps: 'fitting-motedis-end-cap-20-b6' });
  assert.deepEqual(footed.ends.slice(0, 2), [{ id: 'foot-z1', at: 'z1.a', fitting: 'levelling-foot', role: 'foot', tap: { op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }, screw: 'M5 cap' }, { id: 'cap-z1-b', at: 'z1.b', bought: 'fitting-motedis-end-cap-20-b6', role: 'cap' }]);
  // A blind join drills an access hole across the upright at the bottom ring's centre line, 10 mm up (p / 2): Ø5.3 for
  // the M5 key, so 7.35 to 12.65 mm up, inside the foot's 18.5 mm tap. The bottom ring rises by the tap's depth: its
  // centre line at 10 + 18.5 = 28.5 mm, its holes from 25.85 mm up, clear of the tap. Inside stays 350 between the
  // rings; the outside height grows by the lift, 390 + 18.5 = 408.5, and the uprights with it
  assert.deepEqual([footed.lift, footed.outside, footed.lengths.map((l) => [l.length, l.count])], [18.5, [340, 340, 408.5], [[408.5, 4], [300, 8]]]);
  assert.deepEqual([footed.joins[0], footed.joins.find((j) => j.a === 'y3.a')], [{ kind: 'blind', a: 'x1.a', b: 'z1.back@28.5' }, { kind: 'blind', a: 'y3.a', b: 'z1.top@398.5' }]);
  // a join that drills nothing in the uprights (a printed bracket on slot nuts) keeps the ring at the bottom; plain
  // printed feet take their tap and screw too; a bought foot is the set's to say
  const bracketed = box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', join: { kind: 'bracket', fitting: 'printed' }, feet: 'foot' });
  assert.deepEqual([bracketed.lift, bracketed.outside[2], bracketed.ends[0].screw], [0, 390, 'M5 cap']);
  assert.equal(box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', feet: 'fitting-motedis-foot-m6-d19' }).ends[0].tap, undefined);
  // the siblings: a portal [width, height]; a table, its legs the clear height plus the ring; a shelf's equal bays; a gantry's travel
  const pt = portal({ outside: [500, 400], profile: '2020-misumi-hfs5' });
  assert.deepEqual([pt.inside, pt.lengths.map((l) => [l.length, l.count])], [[460, 0, 380], [[460, 1], [400, 2]]]);
  assert.deepEqual(table({ inside: [600, 400, 700], profile: '2020-misumi-hfs5' }).lengths.map((l) => [l.length, l.count]), [[720, 4], [600, 2], [400, 2]]);
  // a shelf 600 mm inside with one ring between: (600 - 20) / 2 = 290 mm clear above and below it
  const sh = shelf({ inside: [400, 300, 600], profile: '2020-misumi-hfs5' });
  assert.deepEqual([sh.bay, sh.beams.filter((b) => b.role === 'across').map((b) => b.from[2])], [290, [10, 10, 320, 320, 630, 630]]);
  // a gantry: g spans the outside (440) on the top side beams; travel = outside depth 540 - 2 x 20 - 2 x 2 clear - 20 = 476
  const g = gantry({ inside: [400, 500, 200], profile: '2020-misumi-hfs5' });
  assert.deepEqual([g.moving.length, g.moving.travel, g.moving.track, g.beams.filter((b) => b.role === 'across').length], [440, 476, 'y3', 2]);
  // g lies on its track, between the uprights' tops. Hand: outside height = 200 + 3 x 20 = 260; the top side beams'
  // centre line is 20 + 200 + 10 = 230, so their top face is 240; g's centre is 240 + 10 = 250, its top 260, level
  // with the uprights' tops and the outside height it reports (it once floated a width higher, at 270)
  const track = g.beams.find((b) => b.id === 'y3'), up = g.beams.find((b) => b.id === 'z1');
  assert.deepEqual([track.from[2] + 10, g.moving.from[2] - 10, g.moving.from[2] + 10, up.to[2], g.outside[2]], [240, 240, 260, 260, 260]);
  // a printed fitting's slot nuts go in through the opening (drop-in), since every butting beam is shut at both ends
  // by its joins and a slide-in nut could not reach its place; another kind that goes in that way may be named
  const br = box({ inside: [200, 200, 200], profile: '2020-misumi-hfs5', join: { kind: 'bracket', fitting: 'printed' } });
  assert.deepEqual([br.joins.length, new Set(br.joins.map((j) => `${j.kind} ${j.fitting} ${j.nut}`))], [16, new Set(['bracket printed drop-in'])]);
  assert.equal(box({ inside: [200, 200, 200], profile: '2020-misumi-hfs5', join: { kind: 'gusset', fitting: 'printed', nut: 'roll-in' } }).joins[0].nut, 'roll-in');
  // (the kit makes no hammer nut for MISUMI's 6 mm slot: refused here, where the fitting would have found none to draw)
  assert.throws(() => box({ inside: [200, 200, 200], profile: '2020-misumi-hfs5', join: { kind: 'gusset', fitting: 'printed', nut: 'hammer' } }), /the kit has no hammer slot nut for 2020-misumi-hfs5's slot \(slot-6-misumi\): drop-in has one/);
  assert.equal(box({ inside: [200, 200, 200], profile: '2020-misumi-hfs5', join: 'bracket' }).joins[0].nut, undefined, 'no fitting chosen, no nut');
  // braces: that side's joins carry a printed corner bracket; panels: one sheet over a side, on drop-in nuts
  const bp = box({ inside: [300, 300, 350], profile: '2020-misumi-hfs5', braces: ['left'], panels: { sheet: 'acrylic', thickness: 3, sides: ['back'] } });
  assert.deepEqual(bp.joins.filter((j) => j.kind === 'bracket').map((j) => j.a), ['y1.a', 'y1.b', 'y3.a', 'y3.b']);
  assert.deepEqual(bp.panels, [{ id: 'panel-back', sheet: 'acrylic', thickness: 3, bay: ['x2', 'z4', 'x4', 'z3'], out: [0, 1, 0], nut: 'drop-in' }]);
  // refused by name, before any maths
  const no = (o, re, kind = 'box') => assert.throws(() => frameModel(kind, { profile: '2020-misumi-hfs5', ...o }), re);
  no({ inside: [300, 300, 300] }, /no kind of frame "dome": there are box, portal, table, gantry, shelf/, 'dome');
  no({}, /is asked for by one size: inside .* or outside .*\(got neither\)/);
  no({ inside: [300, 300, 300], outside: [340, 340, 340] }, /\(got both\)/);
  no({ outside: [30, 340, 340] }, /an outside width of 30 mm leaves no room inside: its beams take 40 mm of it/);
  no({ inside: [300, 300, 300], profile: '2040-misumi-hfs5' }, /takes a square profile, and 2040-misumi-hfs5 is 40 x 20 mm/);
  no({ inside: [300, 300, 300], join: 'mitre' }, /join is one of blind, end-tap, bracket, gusset, hidden, anchor, cube \(got "mitre"\): a mitre join is two mitred ends/);
  no({ inside: [300, 300, 300], profile: 'tube-al-20x20x2' }, /a blind join screws into the bore in a beam's end, and tube-al-20x20x2 has none: join it with bracket or gusset/);
  no({ inside: [300, 300, 300], join: 'cube', feet: 'foot' }, /feet stand under an upright beam's end, and with a cube join every end of a box's goes into a corner node/);
  no({ inside: [300, 300, 300], braces: ['top'] }, /braces: "top" is not a side of a box closed by four beams: it has front, back, left, right/);
  no({ inside: [600, 400, 700], panels: { sheet: 'acrylic', thickness: 3 } }, /has no side closed by four beams for a panel/, 'table');
  no({ inside: [300, 300, 300], shelves: 2 }, /a box has no shelves: give them on a shelf/);
  no({ inside: [300, 300, 100], shelves: 5 }, /5 shelves of 20 mm leave no clear bay in 100 mm/, 'shelf');
  no({ inside: [300, 300] }, /inside is \[width, depth, height\]/);
  no({ inside: [300, 300, 300], join: { kind: 'bracket', fitting: 'printed', nut: 'slide-in' } }, /join.nut is a slot nut that goes in through the slot's opening, drop-in, roll-in, hammer, t-bolt: every butting beam of a generated frame is shut at both ends/);
  no({ inside: [300, 300, 300], join: { kind: 'bracket', nut: 'drop-in' } }, /join.nut names the slot nuts a printed fitting is drawn for: give "fitting": "printed"/);
  no({ inside: [300, 300, 300], join: { kind: 'bracket', brace: 2 } }, /join takes kind, fitting, screw and nut \(got "brace"\)/);
});

test('profile choices: a profile as a sizing takes it, its section in a beam\'s own axes from the sheet, its alloy and mass; one not square comes turned too', () => {
  const [sq] = frames.profileChoices(frames.profileModel('2020-misumi-hfs5'));
  // MISUMI HFS5-2020: 183 mm², 7420 mm⁴ each way, 0.5 kg/m, in A6N01S-T5 (69 972 MPa, 205 MPa)
  assert.deepEqual([sq.name, sq.roll, sq.section.A, sq.section.Iy, sq.section.Iz, sq.mass, sq.material.E, sq.material.strength, sq.material.density], ['2020-misumi-hfs5', 0, 183, 7420, 7420, 0.5, 69972, 205, 2.7]);
  assert.ok(sq.section.J > 0 && sq.section.Wy > 0 && sq.section.Wz > 0);
  assert.equal(frames.profileChoices(frames.profileModel('2020-misumi-hfs5')).length, 1, 'a square one comes once');
  // a 2040 is described lying flat: inertia_x (13 580 mm⁴) resists bending across its 20 mm height, as Iy, the
  // second moment a beam's own z (its top) bends against; turned a quarter it stands on edge
  const [flat, edge] = frames.profileChoices(frames.profileModel('2040-misumi-hfs5'));
  assert.deepEqual([flat.name, flat.roll, flat.section.Iy, flat.section.Iz, edge.name, edge.roll, edge.section.Iy, edge.mass], ['2040-misumi-hfs5', 0, 13580, 51300, '2040-misumi-hfs5 turned', 90, 13580, 0.88]);
  // a plain tube, worked out from its outline: the same shape, so a frame of tubes is sized alike
  const [tube] = frames.profileChoices(frames.profileModel('tube-al-25x25x2'));
  // hand: (25⁴ - 21⁴) / 12 = (390 625 - 194 481) / 12 = 16 345.3 mm⁴, area 25² - 21² = 184 mm²
  assert.ok(Math.abs(tube.section.Iy - 16345.33) < 0.5 && Math.abs(tube.section.A - 184) < 0.01, JSON.stringify(tube.section));
  assert.throws(() => frames.profileChoices({ kind: 'beam' }), /profileChoices: give a profile's model/);
});

test('MISUMI\'s 3030 has five bores in each end and only the middle one is for M8: a foot, a generated frame\'s foot and a tap at the whole end tap that one alone', () => {
  // its rule set: the middle bore 6.8 mm (M8's tap drill), the four corner holes 4.2 mm with no thread named
  const foot = frames.footModel('3030-misumi-hfs6');
  assert.deepEqual(foot.ops.map((o) => `${o.op} ${o.at} ${o.thread}`), ['tap a.1 M8']);
  const m = frames.box({ inside: [300, 300, 200], profile: '3030-misumi-hfs6', join: { kind: 'bracket', fitting: 'printed' }, feet: 'foot' });
  assert.deepEqual(m.ends.filter((e) => e.tap).map((e) => e.tap.at), ['a.1', 'a.1', 'a.1', 'a.1']);
  const b = beamModel('3030-misumi-hfs6', { length: 300, ops: [{ op: 'tap', at: 'a', depth: 20 }] });
  assert.equal(b.ops.find((x) => x.op === 'tap').line, 'tap M8 in bore a.1, 20 mm deep (tap drill Ø6.8 mm; the bore is Ø6.8)');
  // a profile whose end bores are all for a thread keeps tapping them all (MISUMI's 2040: two M5 bores)
  assert.match(beamModel('2040-misumi-hfs5', { length: 300, ops: [{ op: 'tap', at: 'a', depth: 20 }] }).ops.find((x) => x.op === 'tap').line, /^tap M5 in end a's bores a\.1, a\.2, 20 mm deep/);
  // a 2020 (one bore) keeps its plain address
  assert.deepEqual(frames.footModel('2020-misumi-hfs5').ops.map((o) => o.at), ['a']);
});

test('a generated frame\'s joins against its profile: a blind or end-tap screw the slot cannot take is refused by name, a printed fitting takes a nut the kit has for the slot, and a printed gusset lies on the face looking out', () => {
  const { box } = frames, ask = { inside: [300, 250, 350] };
  // MISUMI's 4040 ends are tapped M12 (bore 10.5) and its slot opens 10 mm: an M12 screw, 12 mm, does not pass between
  // the lips, blind (into the cavity) or end-tap (right across the post). Bosch's 4040 L the same (bore 10, M12). A
  // thread cut in the bore must be wider than it (over 10.5 mm: M12 of M3 to M12) and pass the 10 mm opening (M10 at
  // most): none does both, so neither profile takes a blind or an end-tap join. The kit has no slot-10 nut that goes in
  // through the opening, so no printed fitting either: the refusals say the two ways left, and never send the user to a
  // join that is itself refused
  const left = /Join it with a bracket or gusset with no fitting \(taken, and checked by its estimate: join\.fitting warns that no fitting is drawn for it\), or give a slot nut set of your own for slot-10-\w+ in given\.sets and join with a printed bracket or gusset\. The kit has no other join for 4040-\S+ that checks clean$/;
  for (const profile of ['4040-misumi-hfs8', '4040-bosch-l']) for (const kind of ['blind', 'end-tap']) {
    assert.throws(() => box({ ...ask, profile, join: kind }), (x) => (assert.match(x.message, left), assert.match(x.message, new RegExp(`no screw from M3 to M12 cuts a thread in the Ø10(\\.5)? mm end bore.*, so ${profile} takes no ${kind} join`)), true));
  }
  assert.throws(() => box({ ...ask, profile: '4040-misumi-hfs8', join: 'blind' }), /a blind join's M12 screw \(4040-misumi-hfs8's end thread\) passes between the lips of the post's slot, and slot-10-misumi opens 10 mm, narrower than its 12 mm/);
  for (const kind of ['bracket', 'gusset']) assert.throws(() => box({ ...ask, profile: '4040-bosch-l', join: { kind, fitting: 'printed' } }), /the kit has none for 4040-bosch-l's slot \(slot-10-bosch\): give a nut set of your own in given\.sets, or join it with a bracket or gusset with no fitting \(taken, and checked by its estimate: join\.fitting warns that no fitting is drawn for it\)\. The kit has no other join for 4040-bosch-l that checks clean$/);
  // the way left is taken, as the refusals say
  assert.equal(box({ ...ask, profile: '4040-misumi-hfs8', join: 'bracket' }).joins.length, 16);
  // a screw given in join.screw is cut in the end bore, so its thread must be wider than the bore: M8 (8 mm) in
  // MISUMI's 10.5 mm bore, and M4 in item's 2020 (bore 4.3), cut nothing. Refused before the build, naming the screws
  // that fit (item's 2020: M5, 5 mm, over 4.3 and within the 5 mm opening, its button head 2.75 high under 3 mm)
  assert.throws(() => box({ ...ask, profile: '4040-misumi-hfs8', join: { kind: 'blind', screw: 'M8 button' } }), /a blind join's M8 screw \(join\.screw\) is cut in 4040-misumi-hfs8's end bore, and the bore is Ø10\.5 mm, as wide as its 8 mm thread, so no thread can be cut in it: no screw from M3 to M12/);
  assert.throws(() => box({ ...ask, profile: '4040-misumi-hfs8', join: { kind: 'end-tap', screw: 'M8 cap' } }), /an end-tap join's M8 screw \(join\.screw\) is cut in 4040-misumi-hfs8's end bore/);
  assert.throws(() => box({ ...ask, profile: '2020-item-5', join: { kind: 'blind', screw: 'M4 button' } }), /a blind join's M4 screw \(join\.screw\) is cut in 2020-item-5's end bore, and the bore is Ø4\.3 mm, as wide as its 4 mm thread, so no thread can be cut in it: give join\.screw M5 button, which fit, or join it with a bracket or gusset with no fitting/);
  assert.equal(box({ ...ask, profile: '2020-item-5', join: { kind: 'blind', screw: 'M5 button' } }).joins.length, 16);
  // Bosch's 2020 takes M6 (bore 5.5): its button head is 3.3 mm high (ISO 7380), and its slot has 3 mm under the lips.
  // No other thread cuts in 5.5 mm and passes its 6 mm opening, so blind is out: end-tap (M6 across the post) and a
  // printed fitting (the kit has a drop-in nut for slot-6-bosch) would be the joins left. End-tap's M6 passes a 6.6 mm
  // clearance hole (ISO 273 medium) across the post, wider than the 6 mm opening, so it is refused too (beam.op would
  // warn), and the remedy offers only the printed fitting
  assert.throws(() => box({ ...ask, profile: '2020-bosch', join: 'blind' }), /a blind join's M6 screw \(2020-bosch's end thread\): its button head, 3\.3 mm high, goes under the lips of the post's slot, and slot-6-bosch has 3 mm there: .*so 2020-bosch takes no blind join\. Join it with a printed bracket or gusset \(fitting printed\)$/);
  // MISUMI's 2020 end-tap: M5's 5.5 mm hole within the 6 mm opening, said plainly
  assert.throws(() => box({ ...ask, profile: '2020-misumi-hfs5', join: { kind: 'blind', screw: 'M8 button' } }), /or join it with end-tap, or a printed bracket or gusset \(fitting printed\)$/);
  assert.equal(box({ ...ask, profile: '2020-misumi-hfs5', join: 'end-tap' }).joins.length, 16);
  // ones that fit pass: MISUMI's 2020 (M5 in 6 mm, its button head 2.75 high), item's 4040 (M8 in 8 mm)
  for (const profile of ['2020-misumi-hfs5', '4040-item-8', '3030-misumi-hfs6']) assert.equal(box({ ...ask, profile, join: 'blind' }).joins.length, 16, profile);
  // a printed fitting's nuts go in through the slot's opening: item's 4040 has no drop-in in the kit, so roll-in, the
  // next; a nut kind the kit lacks for the slot is refused naming one it has, and a slot with none at all (item's 3030)
  // is refused before a fitting is drawn
  assert.deepEqual([...new Set(box({ ...ask, profile: '4040-item-8', join: { kind: 'bracket', fitting: 'printed' } }).joins.map((j) => j.nut))], ['roll-in']);
  assert.deepEqual([...new Set(box({ ...ask, profile: '2020-misumi-hfs5', join: { kind: 'bracket', fitting: 'printed' } }).joins.map((j) => j.nut))], ['drop-in']);
  assert.throws(() => box({ ...ask, profile: '4040-item-8', join: { kind: 'bracket', fitting: 'printed', nut: 'drop-in' } }), /the kit has no drop-in slot nut for 4040-item-8's slot \(slot-8-item\): roll-in has one/);
  assert.throws(() => box({ ...ask, profile: '3030-item-6', join: { kind: 'gusset', fitting: 'printed' } }), /a printed gusset is held by slot nuts that go in through the slot's opening \(drop-in, roll-in, hammer, t-bolt\), and the kit has none for 3030-item-6's slot \(slot-6-item\)/);
  assert.throws(() => box({ ...ask, profile: '3030-item-6', braces: ['left'] }), /braces put a printed corner bracket at each of a side's joins, held by slot nuts that go in through the slot's opening \(drop-in, roll-in, hammer, t-bolt\), and the kit has none for 3030-item-6's slot \(slot-6-item\)/);
  assert.throws(() => frames.bracketModel('4040-item-8', { nut: 'drop-in' }), /no drop-in slot nut from M3 to M10 is made for profile-4040-item-8's top face \(slot-8-item\): the kit has roll-in, hammer nuts for it: give nut as one of those/);
  // printed gussets: each on the post's face square to its beam that looks out of the box. x1 runs along x at the
  // front (y = 10, under the middle 145 + 20 = 165): its gusset looks -y, the post's bottom face (roll 0: top is +y);
  // x2 at the back looks +y (top); y1 along y at the left looks -x (front), y2 at the right +x (back)
  const g = box({ ...ask, profile: '2020-misumi-hfs5', join: { kind: 'gusset', fitting: 'printed' } }), faceOf = (id) => [...new Set(g.joins.filter((j) => j.a.startsWith(`${id}.`)).map((j) => j.face))];
  assert.deepEqual(['x1', 'x2', 'y1', 'y2'].map(faceOf), [['bottom'], ['top'], ['front'], ['back']]);
  assert.ok(box({ ...ask, profile: '2020-misumi-hfs5', join: 'blind' }).joins.every((j) => j.face === undefined), 'a face only on a printed gusset');
  // a gantry's top side beams carry its moving beam, whose ends and end caps pass beside the posts' tops: their gussets
  // are Ls (a T's bar would rise there), every other join's shape is cad's to choose
  const gg = frames.gantry({ inside: [400, 500, 200], profile: '3030-misumi-hfs6', join: { kind: 'gusset', fitting: 'printed' } });
  assert.deepEqual(gg.joins.filter((j) => j.shape).map((j) => `${j.a} ${j.shape}`), ['y3.a L', 'y3.b L', 'y4.a L', 'y4.b L']);
  assert.ok(box({ ...ask, profile: '3030-misumi-hfs6', join: { kind: 'gusset', fitting: 'printed' } }).joins.every((j) => j.shape === undefined), 'a box names no shape');
});

test('a generated frame\'s end-tap join is refused by name where its clearance hole across the post is wider than the slot\'s opening, and its remedies offer only screws that check clean', () => {
  const { box } = frames, ask = { inside: [300, 250, 350] };
  // ISO 273's medium clearance for the end thread against the slot's opening. Clean: MISUMI's 2020 (M5, 5.5 in 6) and
  // OpenBuilds' 2020 (M5, 5.5 in 6.25). Wider: item's 2020 (M5, 5.5 in 5), Bosch's 2020 (M6, 6.6 in 6), item's 3030
  // (M6, 6.6 in 6.2), MISUMI's and Bosch's 3030 and item's 4040 (M8, 9 in 8). No smaller thread cuts in those bores
  for (const profile of ['2020-misumi-hfs5', '2020-openbuilds']) assert.equal(box({ ...ask, profile, join: 'end-tap' }).joins.length, 16, profile);
  const wide = [['2020-item-5', 'M5', 5.5, 'slot-5-item', 5, 'blind'], ['2020-bosch', 'M6', 6.6, 'slot-6-bosch', 6, 'a printed bracket or gusset \\(fitting printed\\)'], ['3030-item-6', 'M6', 6.6, 'slot-6-item', 6.2, 'blind'],
    ['3030-misumi-hfs6', 'M8', 9, 'slot-8-misumi', 8, 'blind, or a printed bracket or gusset \\(fitting printed\\)'], ['3030-bosch', 'M8', 9, 'slot-8-bosch', 8, 'blind, or a printed bracket or gusset \\(fitting printed\\)'], ['4040-item-8', 'M8', 9, 'slot-8-item', 8, 'blind, or a printed bracket or gusset \\(fitting printed\\)']];
  for (const [profile, thread, hole, slot, open, instead] of wide) {
    const re = new RegExp(`an end-tap join's ${thread} screw \\(${profile}'s end thread\\) passes a Ø${String(hole).replace('.', '\\.')} mm clearance hole drilled across the post \\(ISO 273's medium series\\), and ${slot} opens ${String(open).replace('.', '\\.')} mm, so the hole breaks into the slot's lips.*so ${profile} takes no end-tap join\\. Join it with ${instead}$`);
    assert.throws(() => box({ ...ask, profile, join: 'end-tap' }), re, profile);
  }
  // a given screw too, and a remedy names only the screws whose hole fits: M6 cap (6.6 mm) is never offered in a 6 mm
  // or 6.25 mm opening
  for (const profile of ['2020-misumi-hfs5', '2020-openbuilds']) {
    assert.throws(() => box({ ...ask, profile, join: { kind: 'end-tap', screw: 'M6 cap' } }), /an end-tap join's M6 screw \(join\.screw\) passes a Ø6\.6 mm clearance hole .*: give join\.screw M5 cap, which fit, or join it with blind/, profile);
    assert.throws(() => box({ ...ask, profile, join: { kind: 'end-tap', screw: 'M8 cap' } }), /: give join\.screw M5 cap, which fit,/, profile);
  }
  // and a blind refusal offers end-tap only where it would check clean: plainly on MISUMI's 2020, never on Bosch's
  assert.throws(() => box({ ...ask, profile: '2020-misumi-hfs5', join: { kind: 'blind', screw: 'M8 button' } }), /or join it with end-tap, or a printed bracket or gusset \(fitting printed\)$/);
  assert.throws(() => box({ ...ask, profile: '3030-item-6', join: { kind: 'blind', screw: 'M8 button' } }), (x) => (assert.doesNotMatch(x.message, /end-tap/), true));
});

test('a generated frame on a 30 series profile: levelling feet on a stud whose bore passes the M8 head, end-tap screws apart, access holes inside the slot', async () => {
  const { box, table, levellingFootModel, levellingFoot, beamModel } = frames;
  // levelling feet: the body's M8 cap screw goes in through the printed stud's bore. Hand: an M8 cap head is 13 mm
  // across (dk); M12's bore is 0.8 x 12 = 9.6 mm, Tr16x4's 16 - 4 = 12 mm (DIN 103's D1), both under 13 mm; Tr20x4's
  // 20 - 4 = 16 mm passes. So a 30 series foot takes Tr20x4, and a 20 series (M5, 8.5 mm head) keeps M12
  const lev = levellingFootModel('3030-bosch');
  assert.deepEqual([lev.stud, lev.printed, lev.thread], ['Tr20x4', true, 'M8']); assert.ok(lev.margin >= 2 && lev.grams > 0);
  await prints(levellingFoot(lev), 'a 30 series levelling foot\'s body'); await prints(levellingFoot(lev, { part: 'pad' }), 'its Tr20x4 pad');
  assert.equal(levellingFootModel('2020-misumi-hfs5').stud, 'M12');
  assert.throws(() => levellingFootModel('3030-bosch', { stud: 'Tr16x4' }), /a printed Tr16x4 stud's bore \(12 mm\) is too small for M8's 13 mm head to pass: give stud "Tr20x4", or leave stud out and the foot takes it/);
  const footed = box({ inside: [400, 250, 300], profile: '3030-bosch', feet: 'levelling' });
  assert.equal(footed.ends.find((e) => e.role === 'foot').screw, 'M8 cap');
  // end-tap: each screw runs right across the upright it meets, so a ring's beams along y stand one width (20 mm) above
  // its beams across x, and no two screws share a height on an upright. Hand: outside height 300 + 2 x 20 (the rings)
  // + 2 x 20 (the stagger) = 380 mm; the bottom ring's x beams at 10 mm, its y beams at 30. (No 30 series profile of the
  // kit's takes end-tap: M8's 9 mm hole across the post is wider than its 8 mm opening, and item's M6 6.6 in 6.2)
  for (const p of ['2020-misumi-hfs5', '2020-openbuilds']) {
    const w = 20, f = box({ inside: [400, 250, 300], profile: p, join: 'end-tap' });
    assert.equal(f.outside[2], 300 + 4 * w, p);
    const y1 = f.beams.find((b) => b.id === 'y1'), x1 = f.beams.find((b) => b.id === 'x1');
    assert.deepEqual([x1.from[2], y1.from[2]], [w / 2, 1.5 * w], p);
    for (const z of f.beams.filter((b) => b.role === 'upright')) {
      const at = f.joins.filter((j) => j.b.startsWith(`${z.id}.`)).map((j) => j.b.split('@')[1]);
      assert.equal(new Set(at).size, at.length, `${p}: ${z.id}'s end-tap screws each at a height of their own (${at})`);
    }
    // the clear inside: from the bottom y beams' top (30 + 10 = 40) to the top x beams' bottom
    const x3 = f.beams.find((b) => b.id === 'x3');
    assert.equal(x3.from[2] - w / 2 - (y1.from[2] + w / 2), 300, p);
  }
  // a table's ring: its beams along y one width below those across, so the clear height under them is still the inside's
  const t = table({ inside: [400, 250, 300], profile: '2020-misumi-hfs5', join: 'end-tap' });
  assert.deepEqual([t.outside[2], t.beams.find((b) => b.id === 'y1').from[2] - 10], [340, 300]);
  // blind joins keep their rings level
  const bl = box({ inside: [400, 250, 300], profile: '3030-bosch' });
  assert.deepEqual([bl.outside[2], bl.beams.find((b) => b.id === 'y1').from[2]], [360, 15]);
  // an access hole only passes the hex key. Hand: an M8 button head takes a 5 mm key, 5 / cos 30° = 5.77 mm across its
  // corners; M8's close clearance (8.4 mm) is wider than the 8 mm slot it is drilled in and comes out in, so the hole is
  // the corners and 0.5 mm (OP_DEFAULTS.key), 6.27, up to a 6.3 mm drill. On 2020 M5's 5.3 mm fits the 6 mm slot
  const op = (p, thread) => beamModel(p, { length: 300, ops: [{ op: 'access', at: 'front.1@120', thread, head: 'button', through: 'beam' }] });
  const b30 = op('3030-bosch', 'M8'), a30 = b30.ops.find((o) => o.op === 'access');
  assert.deepEqual([a30.diameter, a30.key, a30.rule], [6.3, 5, 'OP_DEFAULTS.key']);
  assert.deepEqual(b30.findings.filter((x) => x.code === 'beam.op'), [], 'no lip broken on either side');
  assert.deepEqual([op('2020-misumi-hfs5', 'M5').ops.find((o) => o.op === 'access').diameter], [5.3]);
  // a section warned off its drawn outline (the guide's remedy): Bosch Rexroth's 30 x 30 draws 328.9 mm² against the
  // sheet's 310 (+6.1%: the bore's notches and inner webs are not drawn), and the frame's figures are the sheet's
  const P30 = frames.profileModel('3030-bosch'), warned = frames.profileFindings(P30).filter((x) => x.level === 'warn').map((x) => x.code);
  assert.deepEqual(warned, ['profile.section.area', 'profile.section.torsion_constant']);
  const fig = frames.beamFigures(P30);
  assert.deepEqual([fig.area.value, fig.area.from, fig.inertiaX.value, fig.torsion.value, fig.massPerMetre.value], [310, 'sheet', 28000, 2900, 0.9]);
});

// cad's tests of pins and magnets in an assembly. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace, object, BOX } from './helpers.mjs';

test('pins in an assembly: a lid on two snap pins is listed, its sockets checked, and a pin too long for its part refused by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    // A plate 30 × 20 mm, its thickness and its two holes set: the holes drawn with v.fixings.pinHole for the pin named,
    // or a plain cylinder of a given size (bore) to try a wrong one
    object(ws, 'pins/plate', { uses: ['x1c'], variables: {
      thick: { value: 3, unit: 'mm', rule: 'The plate', tweak: { min: 1, max: 20 } },
      bore: { value: 0, unit: 'mm', rule: 'A hole typed by hand (0: the pin\'s own)', tweak: { min: 0, max: 8 } },
      pin: { value: 'snap pin 4x6', choice: ['snap pin 4x6', 'dowel 3x6'], rule: 'The pin its holes are drawn for' } } }, `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [30, 20, v.thick], center: [0, 0, v.thick / 2] })
  const cut = (x) => (v.bore ? cylinder({ radius: v.bore / 2, height: v.thick * 3, center: [x, 0, v.thick / 2], segments: 48 }) : v.fixings.pinHole(v.pin, { at: [x, 0, v.thick], depth: v.thick, through: true }))
  return v.ops.subtract(plate, cut(-10), cut(10))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/pins/project.json'), JSON.stringify({ name: 'pins', material: 'PLA', objects: ['plate'] }));
    const file = path.join(ws, 'projects/pins/assemblies/lid.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const write = (fastener, lid = {}) => fs.writeFileSync(file, JSON.stringify({ title: 'A lid on its base', kind: 'fit',
      items: [{ id: 'base', object: 'plate' }, { id: 'lid', object: 'plate', at: [0, 0, 3], set: lid }],
      fits: [{ a: 'lid', b: 'base', min: 0, note: 'The lid, pinned to the base', fastener }] }));
    const check = () => cad.findings('check', 'pins/lid', '--json');
    const pinsOf = (all) => all.filter((x) => x.code === 'fit.pin');
    // Two snap pins 4x6 through 3 + 3 mm of plates, in sockets drawn 4 + 2 × x1c.snap_clearance 0.2 = 4.4 mm
    write({ pin: 'snap pin 4x6', count: 2, load: 20 });
    let found = check(), p = pinsOf(found);
    assert.deepEqual(p.map((x) => x.level), ['pass'], JSON.stringify(p));
    assert.match(p[0].text, /The lid, pinned to the base: 2 × snap pin 4x6 in sockets drawn 4\.4 mm \(x1c\.snap_clearance\), each the right length for lid and base/);
    const load = found.find((x) => x.code === 'fit.pin.load'); assert.ok(load && /carries .* N in shear/.test(load.text), JSON.stringify(load));
    // listed, by name, as a printed pin with its grams (no packs: it is printed), and named in its build step
    const l = JSON.parse(cad('list', 'pins/lid', '--json')).fasteners.find((x) => x.fastener === 'snap pin 4x6');
    assert.deepEqual([l.qty, l.kind, l.made, l.packs], [2, 'pin', 'printed', undefined], JSON.stringify(l)); assert.ok(l.grams > 0.1 && l.grams < 0.3, `${l.grams} g`);
    const order = JSON.parse(cad('order', 'pins/lid', '--json'));
    assert.ok(order.steps.some((st) => /The lid, pinned to the base \(2 × snap pin 4x6\)/.test(st.text)), JSON.stringify(order.steps));
    // a pin too long for its part: an 8 mm shaft through 6 mm of plates rattles 2 mm past the far face
    write({ pin: 'snap pin 4x8', count: 2 });
    p = pinsOf(check());
    assert.ok(p.length === 2 && p.every((x) => x.level === 'fail'), JSON.stringify(p));
    assert.match(p[0].text, /The lid, pinned to the base: pin 1 at .* in lid and base: snap pin 4x8's shaft is 8 mm long, and the parts it goes through are 6 mm thick: it is too long for its part/);
    assert.equal(p[0].card, 'The lid, pinned to the base: pin too long'); assert.deepEqual(p[0].values, { length: 8, room: 6 });
    // a socket drawn by hand too small: 4.2 mm, where the pin wants 4.4
    write({ pin: 'snap pin 4x6', count: 2 }, { bore: 4.2 });
    p = pinsOf(check());
    assert.ok(p.some((x) => x.level === 'fail' && /lid's hole is drawn 4\.2 mm, and snap pin 4x6 wants 4\.4 mm \(x1c\.snap_clearance\): too small, it will not go in/.test(x.text)), JSON.stringify(p));
    // more pins named than holes drawn
    write({ pin: 'snap pin 4x6', count: 3 });
    assert.match(pinsOf(check())[0].text, /3 × snap pin 4x6 wanted, and only 2 holes about its 4\.4 mm hole lead from lid into base/);
    // a 3 mm dowel in press-fit holes drawn for it (3 + 0.1 - 0.05 = 3.05 mm), 6 mm long in 6 mm of plates
    const write3 = (fastener, lid = {}) => fs.writeFileSync(file, JSON.stringify({ title: 'A lid on its base', kind: 'fit',
      items: [{ id: 'base', object: 'plate', set: { pin: 'dowel 3x6' } }, { id: 'lid', object: 'plate', at: [0, 0, 3], set: { pin: 'dowel 3x6', ...lid } }],
      fits: [{ a: 'lid', b: 'base', min: 0, note: 'The lid, pinned to the base', fastener }] }));
    write3({ pin: 'dowel 3x6', count: 2, fit: 'press' });
    p = pinsOf(check());
    assert.deepEqual(p.map((x) => x.level), ['pass'], JSON.stringify(p)); assert.match(p[0].text, /2 × dowel 3x6 in holes drawn to press 3\.05 mm/);
    const dowel = JSON.parse(cad('list', 'pins/lid', '--json')).fasteners.find((x) => x.fastener === 'dowel 3x6');
    assert.deepEqual([dowel.kind, dowel.made, dowel.qty, dowel.packs], ['pin', 'bought', 2, 1], 'a bought dowel is bought in packs');
    // a press hole drawn at the pin's bare 3 mm (hole_comp left out) is not the 3.05 mm press hole: it is 0.05 mm off,
    // under fasten's 0.06 mm tolerance, so the press hole is matched to within half its step from the bare pin,
    // |3.05 - 3| / 2 = 0.025 mm, and the 3 mm hole fails as too small
    write3({ pin: 'dowel 3x6', count: 2, fit: 'press' }, { bore: 3 });
    p = pinsOf(check());
    assert.ok(p.some((x) => x.level === 'fail' && /lid's hole is drawn 3 mm, and dowel 3x6 wants 3\.05 mm for a press fit .*: too small/.test(x.text)), JSON.stringify(p));
    write3({ pin: 'dowel 3x6', count: 2, fit: 'slip' });
    assert.match(pinsOf(check()).find((x) => x.level === 'fail').text, /drawn 3\.05 mm, and dowel 3x6 wants 3\.3 mm for a slip fit \(x1c\.hole_comp, x1c\.pin_slip\): too small/);
    // a pin the schema does not know is refused by name
    write({ pin: 'snap pin 4x6', colour: 'red' });
    const r = cad.run('check', 'pins/lid', '--json');
    assert.equal(r.status, 1, r.out); assert.match(`${r.stdout}${r.stderr}`, /pins have no \\?"colour\\?": a fastener naming pins takes pin, count, fit, load, pull/);
    const { schema, validate } = await import('../lib/schema.mjs'), asm = (fastener) => ({ title: 't', kind: 'fit', items: [], fits: [{ a: 'lid', b: 'base', fastener }] });
    assert.deepEqual(validate(asm({ pin: 'snap pin 4x6', count: 2, fit: 'press', load: 20, pull: 5 }), schema('assembly')), [], 'the schema takes pins');
    assert.ok(validate(asm({ pin: 'snap pin 4x6', colour: 'red' }), schema('assembly')).some((x) => /colour/.test(`${x.path} ${x.message}`)), 'and names what it does not');
    assert.deepEqual(validate(asm('Two push pins'), schema('assembly')), [], 'words still do');
    // the free-text form keeps working: named as written, not checked
    write('Two push pins');
    assert.equal(pinsOf(check()).length, 0);
    assert.ok(JSON.parse(cad('list', 'pins/lid', '--json')).fasteners.some((x) => x.fastener === 'Two push pins' && x.qty === 1));
  } finally { done(); }
});

test('magnets in an assembly: a lid held by two 8x3 magnets reports their pull, its pockets come from the rules, and a shallow, thin-floored or wrong pocket fails by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    // A box 30 × 20 mm with two pockets in its top face for the magnets, drawn with v.fixings.magnetSeat for the fit named,
    // or a plain cylinder of a given size and depth (bore, deep) to try a wrong one; a plain lid lies on it
    object(ws, 'mag/box', { uses: ['x1c'], variables: {
      thick: { value: 6, unit: 'mm', rule: 'The box\'s top', tweak: { min: 1, max: 20 } },
      bore: { value: 0, unit: 'mm', rule: 'A pocket typed by hand (0: the magnet\'s own)', tweak: { min: 0, max: 12 } },
      deep: { value: 3, unit: 'mm', rule: 'A hand-typed pocket\'s depth', tweak: { min: 0.5, max: 10 } },
      fit: { value: 'press', choice: ['press', 'glue'], rule: 'The fit its pockets are drawn for' } } }, `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
export function main (v) {
  const box = cuboid({ size: [30, 20, v.thick], center: [0, 0, v.thick / 2] })
  const cut = (x) => (v.bore ? cylinder({ radius: v.bore / 2, height: v.deep + 0.1, center: [x, 0, v.thick - v.deep / 2 + 0.05], segments: 48 }) : v.fixings.magnetSeat('disc magnet 8x3', { fit: v.fit, at: [x, 0, v.thick] }))
  return v.ops.subtract(box, cut(-8), cut(8))
}
`);
    object(ws, 'mag/lid', { variables: { w: { value: 30, unit: 'mm' }, d: { value: 20, unit: 'mm' }, h: { value: 2, unit: 'mm' } } }, BOX);
    fs.writeFileSync(path.join(ws, 'projects/mag/project.json'), JSON.stringify({ name: 'mag', material: 'PLA', objects: ['box', 'lid'] }));
    const file = path.join(ws, 'projects/mag/assemblies/lid.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const write = (fastener, box = {}) => fs.writeFileSync(file, JSON.stringify({ title: 'A lid on its box', kind: 'fit',
      items: [{ id: 'box', object: 'box', set: box }, { id: 'lid', object: 'lid', at: [0, 0, 'box.thick'] }],
      fits: [{ a: 'lid', b: 'box', min: 0, note: 'The lid, held by magnets', fastener }] }));
    const check = () => cad.findings('check', 'mag/lid', '--json');
    const of = (all, code) => all.filter((x) => x.code === code);
    // Two N35 discs 8 x 3 mm. By hand: the seller's 8 x 3 disc is N45 and pulls 14.7 N (magnets.disc_8x3_pull, supermagnete
    // S-08-03-N); as N35, by the square of the middles of the grades' remanence (magnets.remanence_*): N35 (1.17 + 1.21) / 2
    // = 1.19 T, N45 (1.32 + 1.37) / 2 = 1.345 T, so 14.7 × (1.19 / 1.345)² = 14.7 × 0.78279 = 11.507 N each, 23.014 N for two:
    // 2.3 times a 10 N pull. Each press pocket: 8 + x1c.hole_comp 0.1 - x1c.magnet_press 0.1 = 8 mm across, 3 mm deep.
    write({ magnet: 'disc magnet 8x3', count: 2, load: 10 });
    let found = check(), m = of(found, 'fit.magnet');
    assert.deepEqual(m.map((x) => x.level), ['pass'], JSON.stringify(m));
    assert.match(m[0].text, /The lid, held by magnets: 2 × disc magnet 8x3 N35 in press pockets drawn 8 mm \(x1c\.hole_comp, x1c\.magnet_press\) in box, each deep enough for the magnet/);
    const load = of(found, 'fit.magnet.load')[0];
    assert.equal(load.level, 'pass', JSON.stringify(load)); assert.match(load.text, /disc magnet 8x3 N35 pulls 11\.51 N touching steel/); assert.match(load.text, /2 × disc magnet 8x3 N35 pull 23\.01 N together: a pull of 10 N is held 2\.3 times over/);
    assert.ok(Math.abs(load.values.total - 2 * 14.7 * (1.19 / 1.345) ** 2) < 0.01, 'the pull worked by hand');
    // listed by name, as bought magnets with their grams (8 × 8 × π/4 × 3 = 150.8 mm³ at magnets.density 7.5: 1.131 g), and named in the build step
    const l = JSON.parse(cad('list', 'mag/lid', '--json')).fasteners.find((x) => x.fastener === 'disc magnet 8x3 N35');
    assert.deepEqual([l.qty, l.kind, l.made, l.grams], [2, 'magnet', 'bought', 1.131], JSON.stringify(l));
    assert.ok(JSON.parse(cad('order', 'mag/lid', '--json')).steps.some((st) => /The lid, held by magnets \(2 × disc magnet 8x3 N35\)/.test(st.text)));
    // glued pockets are 8 + 0.1 + x1c.magnet_glue 0.1 = 8.2 mm, and found as such
    write({ magnet: 'disc magnet 8x3', count: 2 }, { fit: 'glue' });
    m = of(check(), 'fit.magnet'); assert.deepEqual(m.map((x) => x.level), ['pass']); assert.match(m[0].text, /in glue pockets drawn 8\.2 mm \(x1c\.hole_comp, x1c\.magnet_glue\)/);
    // a pocket 2 mm deep: the 3 mm magnet stands 1 mm proud
    write({ magnet: 'disc magnet 8x3', count: 2 }, { bore: 8, deep: 2 });
    m = of(check(), 'fit.magnet'); assert.ok(m.length === 2 && m.every((x) => x.level === 'fail'), JSON.stringify(m));
    assert.match(m[0].text, /box's pocket at .* is 2 mm deep, and disc magnet 8x3 N35 is 3 mm thick: it stands 1 mm proud of the face/); assert.equal(m[0].card, 'The lid, held by magnets: pocket shallow in box');
    // a box 3.4 mm thick leaves a 0.4 mm floor under each 3 mm pocket, under fixings.magnet_floor's 3 layers (0.6 mm)
    write({ magnet: 'disc magnet 8x3', count: 2 }, { thick: 3.4 });
    m = of(check(), 'fit.magnet'); assert.ok(m.length === 2 && m.every((x) => x.level === 'fail'), JSON.stringify(m));
    assert.match(m[0].text, /leaves a floor of 0\.4 mm under the magnet, under fixings\.magnet_floor's 3 layers \(0\.6 mm at x1c\.layer 0\.2 mm\)/);
    // a pocket typed by hand 7.6 mm across: too small; more magnets than pockets
    write({ magnet: 'disc magnet 8x3', count: 2 }, { bore: 7.6 });
    assert.ok(of(check(), 'fit.magnet').some((x) => x.level === 'fail' && /box's pocket at .* is drawn 7\.6 mm, and disc magnet 8x3 N35 wants 8 mm for a press fit .*: too small, it will not go in/.test(x.text)));
    write({ magnet: 'disc magnet 8x3', count: 3 });
    assert.match(of(check(), 'fit.magnet')[0].text, /3 × disc magnet 8x3 N35 wanted, and only 2 pockets about its 8 or 8\.2 or 8\.2 mm are drawn in lid or box/);
    // refused by name before anything is measured: a stray key, a size with no seller's pull
    write({ magnet: 'disc magnet 8x3', count: 2, strength: 4 });
    let r = cad.run('check', 'mag/lid'); assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /magnets have no "strength": a fastener naming magnets takes magnet, count, fit, load, gap/);
    write({ magnet: 'disc magnet 7x3', count: 2 });
    r = cad.run('check', 'mag/lid'); assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /there is no seller's pull for a disc magnet 7x3/);
  } finally { done(); }
});

test('pins lying on their side (#306): a dowel and a snap pin in teardrop holes across two blocks are found and checked as round ones are', () => {
  const { ws, cad, done } = workspace();
  try {
    // A block 6 mm along x, 20 wide and 10 high, its two holes along x drawn with v.fixings.pinHole lying on their side
    // (into -x): each a teardrop, its roof up, 5 mm high; deep: how far in (through where it is the block); or typed by
    // hand as a plain round (bore)
    object(ws, 'pins/block', { uses: ['x1c'], variables: {
      bore: { value: 0, unit: 'mm', rule: 'A hole typed by hand (0: the pin\'s own)', tweak: { min: 0, max: 8 } },
      deep: { value: 6, unit: 'mm', rule: 'How deep the holes go (6: through)', tweak: { min: 1, max: 6 } },
      pin: { value: 'dowel 3x12', choice: ['dowel 3x12', 'dowel 3x10', 'snap pin 4x12'], rule: 'The pin its holes are drawn for' },
      fit: { value: 'press', choice: ['press', 'slip', 'none'], rule: 'The fit its holes are drawn for' } } }, `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { rotateY } = jscad.transforms
export function main (v) {
  const block = cuboid({ size: [6, 20, 10], center: [3, 0, 5] })
  const cut = (y) => (v.bore ? rotateY(Math.PI / 2, cylinder({ radius: v.bore / 2, height: 20, center: [-5, y, 3], segments: 48 }))
    : v.fixings.pinHole(v.pin, { at: [6, y, 5], into: '-x', depth: v.deep, through: v.deep >= 6, ...(v.fit === 'none' ? {} : { fit: v.fit }) }))
  return v.ops.subtract(block, cut(-5), cut(5))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/pins/project.json'), JSON.stringify({ name: 'pins', material: 'PLA', objects: ['block'] }));
    const file = path.join(ws, 'projects/pins/assemblies/pair.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const write = (fastener, a = {}, b = {}, turn = 0) => fs.writeFileSync(file, JSON.stringify({ title: 'Two blocks pinned side by side', kind: 'fit',
      items: [{ id: 'left', object: 'block', set: b, rotate: [0, 0, turn] }, { id: 'right', object: 'block', at: turn ? [0, 6, 0] : [6, 0, 0], rotate: [0, 0, turn], set: a }],
      fits: [{ a: 'right', b: 'left', min: 0, note: 'The right block, pinned to the left', fastener }] }));
    const check = () => cad.findings('check', 'pins/pair', '--json').filter((x) => x.code === 'fit.pin');
    const said = (f, a, b, turn) => { write(f, a, b, turn); return check().map((x) => [x.level, x.text]); };
    // Two dowels 3x12 pressed across 6 + 6 mm: each teardrop's round is 3 + 0.1 (x1c.hole_comp) - 0.05 (x1c.pin_press)
    //   = 3.05 mm, its 45° roof left out of the circle the check fits, so it is found and held as a round hole is
    assert.deepEqual(said({ pin: 'dowel 3x12', count: 2, fit: 'press' }), [['pass', 'The right block, pinned to the left: 2 × dowel 3x12 in holes drawn to press 3.05 mm, each the right length for right and left']]);
    // slip, 3 + 0.1 + 0.2 (x1c.pin_slip) = 3.3 mm; and the pair turned a quarter on the bench (the holes along y)
    assert.match(said({ pin: 'dowel 3x12', count: 2, fit: 'slip' }, { fit: 'slip' }, { fit: 'slip' })[0][1], /2 × dowel 3x12 in holes drawn to slip 3\.3 mm/);
    assert.equal(said({ pin: 'dowel 3x12', count: 2, fit: 'press' }, {}, {}, 90)[0][0], 'pass');
    // a snap pin's socket lying on its side, 4 + 2 × 0.2 (x1c.snap_clearance) = 4.4 mm, through both
    assert.deepEqual(said({ pin: 'snap pin 4x12', count: 2 }, { pin: 'snap pin 4x12', fit: 'none' }, { pin: 'snap pin 4x12', fit: 'none' }), [['pass', 'The right block, pinned to the left: 2 × snap pin 4x12 in sockets drawn 4.4 mm (x1c.snap_clearance), each the right length for right and left']]);
    // blind in the left block: a dowel 3x10 in 6 + 4.5 mm of room
    assert.equal(said({ pin: 'dowel 3x10', count: 2, fit: 'press' }, { pin: 'dowel 3x10' }, { pin: 'dowel 3x10', deep: 4.5 })[0][0], 'pass');
    // and held to the pin as a round one is: too short for 3 mm of blind room, a round 3.5 mm hole too big, a third pin with no hole
    assert.match(said({ pin: 'dowel 3x12', count: 2, fit: 'press' }, {}, { deep: 3 })[0][1], /dowel 3x12.*too long for its part/);
    assert.match(said({ pin: 'dowel 3x12', count: 2, fit: 'press' }, { bore: 3.5 })[0][1], /right's hole is drawn 3\.5 mm, and dowel 3x12 wants 3\.05 mm for a press fit \(x1c\.hole_comp, x1c\.pin_press\): too big, it will be loose/);
    assert.match(said({ pin: 'dowel 3x12', count: 3, fit: 'press' })[0][1], /3 × dowel 3x12 wanted, and only 2 holes about its 3\.05 mm hole lead from right into left/);
  } finally { done(); }
});

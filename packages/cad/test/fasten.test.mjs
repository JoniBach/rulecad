// cad's tests of v.fixings and fasten: screws, seats, loads, counts and suggestions. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { workspace, fastened, object, run, BIN, ROOT_MODULES, CAD } from './helpers.mjs';

test('v.fixings: a counterbored hole, a pilot and an insert boss with no number typed, each said in the check with the rule it rests on', () => {
  const { ws, cad, done } = workspace();
  try {
    const js = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const f = v.fixings, top = v.thick
  const plate = cuboid({ size: [v.width, v.depth, top], center: [0, 0, top / 2] })
  const boss = f.insertBoss('M3', { at: [v.pitch, 0, top] })
  return v.ops.subtract(v.ops.union(plate, boss.boss), boss.hole,
    f.counterbore('M3x12 cap', { length: top, thickness: top, at: [-v.pitch, 0, top] }),
    f.hole('M3', { kind: 'pilot', at: [0, 0, top] }))
}
`;
    object(ws, 'demo/plate', { uses: ['x1c'], orientation: 'Flat on the bed, the boss up', variables: {
      width: { value: 40, unit: 'mm', rule: 'Three fixings in a row' }, depth: { value: 16, unit: 'mm', rule: 'A fixing and its walls' },
      thick: { value: 'x1c.layer * 40', unit: 'mm', rule: 'Whole layers: the pilot and a floor under it' }, pitch: { value: 12, unit: 'mm', rule: 'Between the fixings' } } }, js);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['plate'] }));
    // no number in the design but 0, 1 and 2: a thread's name is text, so 'M3' and 'M3x12 cap' are no measurements
    assert.deepEqual([...new Set(js.replace(/'[^']*'/g, '').match(/\d+(\.\d+)?/g))].sort(), ['0', '2']);
    const run = () => { const r = spawnSync(process.execPath, [BIN, 'check', 'demo/plate', '--json'], { cwd: ws, encoding: 'utf8' }); return { status: r.status, findings: JSON.parse(r.stdout).findings }; };
    const first = run(), by = (f, code) => f.filter((x) => x.code === code);
    assert.equal(first.status, 0); assert.deepEqual(first.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), [], 'it checks clean');
    assert.equal(by(first.findings, 'lint.numbers')[0].level, 'pass');
    // what each hole and seat was drawn to, with what it rests on
    const holes = by(first.findings, 'hole.drawn');
    assert.deepEqual(holes.map((x) => [x.values.diameter, x.refs.rule, x.refs.kind]), [[3.5, 'm3.clearance', 'spec'], [2.9, 'x1c.pilot_m3', 'measured']]);
    assert.match(holes[0].text, /an M3 clearance hole drawn 3\.5 mm: it rests on m3\.clearance \(3\.4 mm\), a standard's figure, plus x1c\.hole_comp 0\.1 mm across/);
    assert.match(holes[1].text, /an M3 pilot drawn 2\.9 mm: it rests on x1c\.pilot_m3 \(2\.9 mm\), a measured rule, as drawn/);
    assert.deepEqual(by(first.findings, 'counterbore.drawn')[0].values, { diameter: 6, depth: 3, sunk: 0, hole: 3.5 });
    assert.deepEqual((({ hole, outer, height }) => [hole, outer, height])(by(first.findings, 'insertBoss.drawn')[0].values), [4, 7.2, 6.8]);
    // the same from the cache, as a motor's or a mechanism's findings are kept with a build
    assert.deepEqual(run().findings.filter((x) => /^(hole|counterbore|insertBoss)\./.test(x.code)), first.findings.filter((x) => /^(hole|counterbore|insertBoss)\./.test(x.code)));
    // bound to the project: the workspace's own printer rule moves the pilot, and its own thread set is read before the kit's
    const x1c = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')); x1c.rules.pilot_m3.value = 2.8;
    fs.writeFileSync(path.join(ws, 'rules/x1c.json'), JSON.stringify(x1c));
    fs.writeFileSync(path.join(ws, 'rules/m3.json'), JSON.stringify({ name: 'm3', rules: { clearance: { value: 3.6, unit: 'mm', rule: 'A roomier hole, as measured here', kind: 'measured', source: 'this bench', checked: '2026-11-15' } } }));
    assert.deepEqual(by(run().findings, 'hole.drawn').map((x) => [x.values.diameter, x.refs.kind]), [[3.7, 'measured'], [2.8, 'measured']]);
    // a typed diameter is still a number that should be a variable, and a design may import the package itself in the sandbox
    object(ws, 'demo/typed', { variables: { w: { value: 10, unit: 'mm', rule: 'Width' } } }, "import jscad from '@jscad/modeling'\nimport { holeModel } from '@rulecad/fixings'\nexport function main (v) { const r = 2.9 / 2 + holeModel('M3').diameter * 0; return jscad.primitives.cuboid({ size: [v.w, v.w, r * 2], center: [0, 0, r] }) }\n");
    const typed = cad('check', 'demo/typed');
    assert.match(typed, /should be variables: line 3: 2\.9/); assert.match(typed, /fits the bed/);
    // the notes for agents say where holes come from, the kit's and the template's alike
    const notes = fs.readFileSync(new URL('./AGENTS.md', CAD), 'utf8');
    assert.match(notes, /comes from `v\.fixings`, named by its thread, never from a\s+typed number/);
    assert.equal(fs.readFileSync(new URL('../create-rulecad/template/AGENTS.md', CAD), 'utf8'), notes, 'the template\'s AGENTS.md is the kit\'s');
  } finally { done(); }
});

test('fasten: a bracket screwed to a base passes; moved 1 mm, a 3 mm hole, a short screw and a long one each fail by name, with what would do', () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    write();
    let r = check();
    assert.equal(r.status, 0); assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), [], 'a bracket fastened to a base by two M3 screws passes');
    for (const code of ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat']) assert.deepEqual(r.of(code).map((x) => x.level), ['pass'], code);
    assert.match(r.of('fasten.holes')[0].text, /^bracket to base, 2 M3 cap screws: one axis from under the head through bracket into base/);
    assert.match(r.of('fasten.clearance')[0].text, /bracket's hole measures 3\.5 mm, an M3 clearance hole as drawn \(m3\.clearance 3\.4 mm and x1c\.hole_comp 0\.1 mm\)/);
    assert.match(r.of('fasten.end')[0].text, /ends in base, in a pilot the screw forms its own thread in: 2\.9 mm as drawn \(x1c\.pilot_m3, measured\), 9 mm deep/);
    // the length is chosen from the stack as measured: 5 mm of bracket, 5 mm of thread asked in plastic, so M3x10
    assert.match(r.of('fasten.length')[0].text, /M3x10 cap chosen, the shortest sold that fits: 5 mm under its head and 5 mm into base, 3 mm short of bottoming out/);
    assert.deepEqual(r.of('fasten.length')[0].values, { length: 10, grip: 5, into: 5 });
    assert.match(r.of('fasten.engagement')[0].text, /5 mm of thread in pla \(a plastic\), 10 turns: m3\.pilot_depth asks 5 mm/);
    assert.match(r.of('fasten.seat')[0].text, /a flat seat on bracket, whole out to the head's 5\.5 mm; on pla \(39 MPa\) its 14\.2 mm² takes 55\d N, a tightening of 0\.33 N m: the M3 washer would raise that to 112\d N/);
    // every finding points at the screw: under its head, and from there to its tip
    for (const x of r.findings.filter((y) => y.code.startsWith('fasten.'))) { assert.deepEqual(x.at, [-12, 0, 17]); assert.deepEqual(x.between, [[-12, 0, 17], [-12, 0, 7]]); assert.deepEqual(x.refs.screws, ['bracket.h1', 'bracket.h2']); }
    // the screws are placed as reference parts, checked for overlap with the rest, and on the list and in the order as a fit that fastens is
    assert.match(r.of('overlap')[0].text, /no parts overlap \(4 object instances\)/);
    assert.match(cad('list', 'demo/joint'), /2 ×\s+M3x10 cap\s+1\.001 g each, 2 g\s+1 pack of 10, 8 spare\s+bracket to base/);
    assert.match(cad('order', 'demo/joint'), /2\. bracket goes on: bracket fastened to base \(2 × M3x10 cap\)/);

    // moved 1 mm: the holes no longer share an axis, said with the distance
    write({ bracket: { shift: 1 } }); r = check();
    assert.equal(r.status, 1); assert.deepEqual(r.fails, ['fasten.holes']);
    assert.match(r.of('fasten.holes')[0].text, /base's hole is 1 mm off the screw's axis: the holes do not line up/); assert.equal(r.of('fasten.holes')[0].values.distance, 1);
    // a 3 mm hole in the bracket: no clearance hole, said with what it should be
    write({ bracket: { bore: 3 } }); r = check();
    assert.deepEqual(r.fails, ['fasten.clearance']);
    assert.match(r.of('fasten.clearance')[0].text, /bracket's hole measures 3 mm where an M3 screw passes through: a clearance hole should be 3\.5 mm as drawn \(m3\.clearance 3\.4 mm and x1c\.hole_comp 0\.1 mm\), 3\.3 mm at the closest/);
    assert.deepEqual(r.of('fasten.clearance')[0].values, { diameter: 3, wanted: 3.5, least: 3.3, most: 3.7 });
    // an M3x6 through the 5 mm plate into plastic: 1 mm of thread, and the length that would do
    write({ fasten: { screw: 'M3x6 cap' } }); r = check();
    assert.deepEqual(r.fails, ['fasten.engagement']);
    assert.match(r.of('fasten.engagement')[0].text, /M3x6 cap engages 1 mm of thread in pla \(a plastic\), 2 turns, where m3\.pilot_depth asks 5 mm: M3x10 cap would do/);
    assert.equal(r.of('fasten.length')[0].level, 'pass', 'it reaches');
    // an M3x20 into a 6 mm blind hole bottoms out
    write({ base: { hole_depth: 6 }, fasten: { length: 20 } }); r = check();
    assert.deepEqual(r.fails, ['fasten.length']);
    assert.match(r.of('fasten.length')[0].text, /M3x20 cap bottoms out: with 5 mm under its head it goes 15 mm into a hole 6 mm deep, where 1 mm is kept at its tip, so it tightens on its tip and not on its head\. M3x10 cap would do/);
    // one that does not reach, one nobody sells, and a hole too shallow for any: each said
    write({ bracket: { thick: 8 }, fasten: { length: 8 } }); r = check();
    assert.match(r.of('fasten.length')[0].text, /M3x8 cap does not reach base: it is 8 mm long and there is 8 mm under its head\. M3x16 cap would do/);
    write({ fasten: { length: 7 } }); assert.match(check().of('fasten.length')[0].text, /7 mm/);
    write({ base: { hole_depth: 4 } }); r = check();
    assert.match(r.of('fasten.length')[0].text, /no length chosen: .*leaves 3 mm of room for the screw .* where 5 mm of thread is asked: no length can do both\. Deepen the far end to 6 mm or more/);

    // bad input is refused by name before anything is measured
    write({ fasten: { screw: 'M7 cap' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: .*M7.*M3/s);
    write({ fasten: { into: 'lid' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: no part "lid" \(items: base, bracket\)/);
    write({ fasten: { holes: 'bracket.body' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: give "at" .* or "holes" .*, one of the two/);
    write({ fasten: { nut: 'wing' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: "nut" is true \(a hexagon nut\) or hex, square, lock \(got "wing"\)/);
    write({ fasten: { screw: 'M3x12 cap', length: 10 } }); assert.match(cad('check', 'demo/joint'), /fasten 1: M3x12 cap gives the length, and "length" says 10: give it once/);
    // and a misspelt key by the schema, with its path
    write({ fasten: { thru: ['bracket'] } }); assert.match(cad('check', 'demo/joint'), /fasten\[0\]\.thru: not allowed here/);

    // a fasten holds its parts as a fit that fastens does: in a mechanism, a bracket only placed is loose, and fastened it is held, in every pose
    object(ws, 'demo/knob', { variables: { w: { value: 10, unit: 'mm', rule: 'Width' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n");
    const more = { joints: [{ id: 'spin', type: 'revolute', parent: { item: 'base', at: [0, 40, 0] }, child: 'knob.axis', min: 0, max: 90 }], poses: { shut: { spin: 0 }, open: { spin: 90 } } };
    const withKnob = (fasten) => { write({ more }); const a = JSON.parse(fs.readFileSync(file, 'utf8')); a.items.push({ id: 'knob', object: 'knob' }); if (!fasten) delete a.fasten; fs.writeFileSync(file, JSON.stringify(a)); return check(); };
    r = withKnob(false);
    assert.match(r.of('assembly.loose')[0].text, /bracket is placed, but nothing holds it/);
    r = withKnob(true);
    assert.equal(r.of('assembly.loose').length, 0); assert.equal(r.of('assembly.held')[0].level, 'pass');
    assert.match(r.of('poses')[0].text, /2 poses checked/);
    assert.deepEqual(r.of('fasten.holes').map((x) => x.level), ['pass'], 'the same in both poses, so said once');
  } finally { done(); }
});

test('fasten: a yoke: a screw through one cheek, the block between and into the other, its nut outside; engagement held to the micron the length was chosen to', () => {
  const { ws, cad, done } = workspace();
  try {
    // a length read from the mesh a hair over a whole millimetre: the length is chosen from the stack to the micron, and so is the engagement
    const { write, check } = fastened(ws);
    write({ bracket: { thick: 5.0004 } });
    let r = check();
    assert.deepEqual(r.fails, [], 'M3x10 through 5.0004 mm engages the 5 mm m3.pilot_depth asks, as it is said');
    assert.match(r.of('fasten.engagement')[0].text, /5 mm of thread in pla \(a plastic\), 10 turns: m3\.pilot_depth asks 5 mm/);

    // a fork, its cheeks 5 mm thick with a 10 mm slot, and a block in the slot: one axis across all three, along y
    object(ws, 'demo/fork', { uses: ['x1c'], anchors: { h: { at: [0, 0, 'tall / 2'], axis: [0, 1, 0] }, slot: { at: [0, 0, 0], axis: [0, 0, 1] } },
      variables: { cheek: { value: 5, unit: 'mm', rule: 'Each cheek' }, slot: { value: 10, unit: 'mm', rule: 'The slot' }, tall: { value: 20, unit: 'mm', rule: 'Height' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const w = v.slot + 2 * v.cheek, body = v.ops.subtract(cuboid({ size: [16, w, v.tall + 6], center: [0, 0, (v.tall - 6) / 2] }), cuboid({ size: [18, v.slot, v.tall + 1], center: [0, 0, (v.tall + 1) / 2] }))
  return v.ops.subtract(body, v.fixings.hole('M3', { into: '+y', depth: w, at: [0, 0 - w / 2, v.tall / 2] }))
}
`);
    object(ws, 'demo/block', { uses: ['x1c'], anchors: { seat: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { w: { value: 10, unit: 'mm', rule: 'The slot it sits in' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [16, v.w, 20], center: [0, 0, 10] }), v.fixings.hole('M3', { into: '+y', depth: v.w, at: [0, 0 - v.w / 2, 10] }))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['base', 'bracket', 'fork', 'block'] }));
    const file = path.join(ws, 'projects/demo/assemblies/yoke.json');
    const yoke = (fasten, run = true) => { fs.writeFileSync(file, JSON.stringify({ title: 'A block in a fork', kind: 'fit', items: [{ id: 'fork', object: 'fork' }, { id: 'block', object: 'block' }],
      fits: [{ a: 'block', b: 'fork', min: 0, note: 'In the slot' }], fasten: [{ screw: 'M3 cap', through: ['fork', 'block'], into: 'fork', at: ['fork.h'], nut: true, note: 'Across the fork', ...fasten }] }));
      if (!run) return null;
      const out = spawnSync(process.execPath, [BIN, 'check', 'demo/yoke', '--json'], { cwd: ws, encoding: 'utf8' }); let j; try { j = JSON.parse(out.stdout); } catch { assert.fail(`${out.stdout}${out.stderr}`); }
      if (!j.findings) assert.fail(JSON.stringify(j)); return { status: out.status, of: (code) => j.findings.filter((x) => x.code === code), fails: j.findings.filter((x) => x.level === 'fail').map((x) => `${x.code}: ${x.text}`) }; };
    r = yoke();
    assert.deepEqual(r.fails, [], 'the screw passes the near cheek and the block, and its nut holds it on the far cheek');
    assert.match(r.of('fasten.holes')[0].text, /Across the fork, an M3 cap screw: one axis from under the head through fork, block into fork/);
    assert.match(r.of('fasten.end')[0].text, /nut/);
    assert.match(r.of('fasten.length')[0].text, /M3x25 cap chosen, the shortest sold that fits: 20 mm under its head/);
    assert.match(cad('list', 'demo/yoke'), /1 ×\s+M3x25 cap[\s\S]*1 ×\s+M3 hex nut/);
    // the anchor's axis says the way: turned round, the head is on the other cheek and it still holds
    const a = JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/objects/fork.json'), 'utf8')); a.anchors.h.axis = [0, -1, 0]; fs.writeFileSync(path.join(ws, 'projects/demo/objects/fork.json'), JSON.stringify(a));
    assert.deepEqual(yoke().fails, []);
    // a part's own holes can't say which cheek the head is on: refused by name
    yoke({ at: undefined, holes: 'fork' }, false);
    assert.match(cad('check', 'demo/yoke'), /fasten 1: a screw that ends in fork, the part under its head, is placed with "at"/);
  } finally { done(); }
});

test('fasten: seats and ends read from the parts: a counterbore on an insert, a countersunk screw and its nut, a nut\'s seat, a washer, a part\'s own holes; cad add fasten', async () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    // a cap screw down a counterbore into a heat-set insert: the stack is measured from the counterbore's floor
    write({ base: { end: 'insert' }, bracket: { seat: 'counterbore', thick: 8 } });
    let r = check();
    assert.equal(r.status, 0); assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.end')[0].text, /ends in base, in a heat-set insert's hole: 4 mm as drawn \(m3\.insert_hole, a community figure\), 6\.7 mm deep/);
    assert.match(r.of('fasten.length')[0].text, /M3x8 cap chosen, the shortest sold that fits: 5 mm under its head and 3 mm into base/);
    assert.match(r.of('fasten.engagement')[0].text, /3 mm of thread in the insert, 5\.7 mm long, 6 turns: fixings\.insert_engagement asks a diameter of thread or the whole insert, 3 mm/);
    assert.match(r.of('fasten.seat')[0].text, /a flat seat on bracket, 3 mm down its counterbore, whole out to the head's 5\.5 mm/);
    assert.match(r.of('overlap')[0].text, /no parts overlap \(6 object instances\)/, 'two screws and two inserts with the two parts');
    const listed = cad('list', 'demo/joint'); assert.match(listed, /2 ×\s+M3x8 cap/); assert.match(listed, /2 ×\s+M3 insert/);
    // a countersunk screw in a countersink of its angle, held by a nut on the far face
    write({ base: { end: 'through' }, bracket: { seat: 'countersink', thick: 8 }, fasten: { screw: 'M3 countersunk', nut: true } });
    r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.seat')[0].text, /the countersunk head sits in a (89\.\d|90)° countersink in bracket/); assert.ok(Math.abs(r.of('fasten.seat')[0].values.angle - 90) < 1);
    assert.match(r.of('fasten.end')[0].text, /ends in an M3 hex nut on the far face of base, past a 3\.5 mm clearance hole/);
    assert.match(r.of('fasten.length')[0].text, /M3x25 countersunk chosen/); // (8 + 12 mm of parts and a 2.4 mm nut: 20 is short, 25 the next sold)
    assert.match(r.of('fasten.engagement')[0].text, /2\.4 mm of thread in its M3 hex nut, 2\.4 mm high/);
    // with no nut given, nothing holds a screw in a clearance hole; and a cap head has no flat seat in a countersink
    write({ base: { end: 'through' }, bracket: { seat: 'countersink', thick: 8 }, fasten: { screw: 'M3 cap' } });
    r = check();
    assert.deepEqual(r.fails.sort(), ['fasten.end', 'fasten.seat']);
    assert.match(r.of('fasten.end')[0].text, /nothing holds the screw in base: its hole measures 3\.5 mm, a clearance hole\. The far end should be a pilot the screw forms its own thread in \(2\.9 mm\), a hole to tap \(2\.6 mm\), a heat-set insert's hole \(4 mm\), a nut's seat on a clearance hole, or a clearance hole with "nut"/);
    assert.match(r.of('fasten.seat')[0].text, /the head has no flat seat on bracket: the face under it is not square to the screw \(a cone\)/);
    // a countersunk screw on a square-edged hole stands proud on a line
    write({ base: { end: 'through' }, fasten: { screw: 'M3 countersunk', nut: true } });
    assert.match(check().of('fasten.seat')[0].text, /a countersunk head sits in a 90° countersink, and bracket's hole has a square edge: the head stands 1\.\d+ mm proud/);
    // a nut's seat drawn under the base is found, and the nut sits in it, turned to its flats; the screws' places are the bracket's own holes
    write({ base: { end: 'pocket' }, fasten: { at: undefined, holes: 'bracket.body' } });
    r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.end')[0].text, /ends in an M3 hex nut in its seat in base, 5\.6 mm across the flats for the nut's 5\.5 mm, past a 3\.5 mm clearance hole/);
    assert.match(r.of('overlap')[0].text, /no parts overlap \(6 object instances\)/, 'the nuts lie in their seats, corners to corners');
    assert.deepEqual(r.of('fasten.holes')[0].refs.screws, ['hole at -12, 0, 2.5', 'hole at 12, 0, 2.5']);
    assert.deepEqual(r.of('fasten.holes')[0].refs.places, [[-12, 0, 17], [12, 0, 17]]);
    // a nut slid into a slot from the side, across the screw, partway down the base (v.fixings.nutTrap): its seat is found there, and the nut sits in it with its flats to the slot's walls
    write({ base: { end: 'trap' } });
    r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.end')[0].text, /ends in an M3 hex nut in its seat in base, 5\.7 mm across the flats for the nut's 5\.5 mm, past a 3\.5 mm clearance hole/);
    assert.match(r.of('fasten.length')[0].text, /M3x12 cap chosen/, 'the screw ends past the nut in the slot, not at the base\'s far face');
    assert.match(r.of('overlap')[0].text, /no parts overlap \(6 object instances\)/, 'each nut lies in its slot, flats to the walls');
    // a tightening torque is held against what the head sits on, and the washer that brings it within is named; with it, it passes
    write({ fasten: { torque: 0.5 } }); r = check();
    assert.deepEqual(r.fails, ['fasten.seat']);
    assert.match(r.of('fasten.seat')[0].text, /at 0\.5 N m the screw clamps with 833\.3 N: 5\d(\.\d)? MPa under the head on pla, whose strength is 39 MPa\. The M3 washer, 7 mm across, brings it to 2\d(\.\d)? MPa, within: give "washer": true/);
    write({ fasten: { torque: 0.5, washer: true } }); r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.seat')[0].text, /whole out to the washer's 7 mm; at 0\.5 N m the screw clamps with 833\.3 N, 2\d(\.\d)? MPa under the washer on pla/);
    assert.match(r.of('fasten.length')[0].text, /M3x12 cap chosen, the shortest sold that fits: 5\.5 mm under its head \(its washer with it\)/);
    // cad add fasten writes the relation, and refuses one that names no item of the assembly or no place for its screws
    const a = JSON.parse(fs.readFileSync(file, 'utf8')); delete a.fasten; fs.writeFileSync(file, JSON.stringify(a, null, 2));
    assert.match(cad('add', 'fasten', 'demo/joint', '--screw', 'M3 cap', '--through', 'lid', '--into', 'base', '--holes', 'bracket.body'), /fasten: no item "lid" in demo\/joint \(items: base, bracket\)/);
    assert.match(cad('add', 'fasten', 'demo/joint', '--screw', 'M3 cap', '--through', 'bracket', '--into', 'base'), /a fasten needs where its screws go: --at .* or --holes/);
    assert.match(cad('add', 'fasten', 'demo/joint', '--screw', 'M3 cap', '--through', 'bracket', '--into', 'base', '--at', 'bracket.h1,bracket.h2', '--washer', '--note', 'Bracket screwed down'), /added a fasten to/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).fasten, [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'], washer: true, note: 'Bracket screwed down' }]);
    assert.match(cad('check', 'demo/joint'), /Bracket screwed down, 2 M3 cap screws: M3x12 cap chosen/);

    // the measure itself: a plate with a counterbored hole, read along the hole's axis and 0.4 mm off it
    const { profile } = await import('../lib/fasten.mjs'), jscad = (await import('@jscad/modeling')).default, { polygons } = await import('../lib/design.mjs');
    const { cuboid, cylinder } = jscad.primitives, plate = jscad.booleans.subtract(cuboid({ size: [20, 20, 8], center: [0, 0, 4] }), cylinder({ radius: 1.75, height: 20, segments: 48 }), cylinder({ radius: 3, height: 3, center: [0, 0, 6.5], segments: 48 }));
    const tris = polygons(plate, { triangulate: true }), segs = profile(tris, [0, 0, 10], [0, 0, -1], 5).segs.filter((g) => g.hole);
    assert.deepEqual(segs.map((g) => [+g.z0.toFixed(3), +g.z1.toFixed(3), g.a.loop.shape, +g.a.loop.d.toFixed(3), +g.a.loop.offset.toFixed(3)]), [[2, 5, 'round', 6, 0], [5, 10, 'round', 3.5, 0]]);
    const off = profile(tris, [0.4, 0, 10], [0, 0, -1], 5).segs.filter((g) => g.hole).at(-1);
    assert.equal(+off.a.loop.offset.toFixed(3), 0.4); assert.equal(+off.a.loop.d.toFixed(3), 3.5); assert.ok(Math.abs(off.a.free - 1.35) < 0.01, 'the wall is that much nearer');
    assert.ok(profile(tris, [5, 5, 10], [0, 0, -1], 2).segs.every((g) => g.solid && !g.hole), 'through the plate itself: solid all the way');
  } finally { done(); }
});

test('fasten: the older "fastens": true fit gives the same findings with or without a fasten beside it, and states no fasten finding of its own', () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    const strip = (r) => r.findings.map((x) => [x.level, x.code, x.text]);
    // the older form alone: a fit that fastens holds the bracket, and nothing says anything of screws
    write({ fasten: {}, more: { fits: [{ a: 'bracket', b: 'base', min: 0, max: 0.05, fastens: true, note: 'The bracket sits on the base' }] } });
    const a = JSON.parse(fs.readFileSync(file, 'utf8')); delete a.fasten; fs.writeFileSync(file, JSON.stringify(a));
    const old = check();
    assert.equal(old.status, 0); assert.deepEqual(old.findings.filter((x) => x.code.startsWith('fasten.')), [], 'no fasten finding without a fasten');
    assert.match(old.of('overlap')[0].text, /no parts overlap \(2 object instances\)/);
    // a fasten added beside it adds fasten findings and the screws as parts, and changes no other finding
    a.fasten = [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'] }]; fs.writeFileSync(file, JSON.stringify(a));
    const both = check();
    assert.equal(both.status, 0);
    const rest = (r) => strip(r).filter(([, code]) => /^(fit|fits|gap|assembly)\b/.test(code) || /^fit/.test(code));
    assert.ok(rest(old).length >= 1, 'the fit is judged');
    assert.deepEqual(rest(both), rest(old), 'the older fit\'s findings are the same');
    assert.ok(both.findings.some((x) => x.code === 'fasten.holes'));
    // the older form does not look at holes: a misfit passes it, and fails with a fasten
    a.items[1].set = { shift: 1 }; delete a.fasten; fs.writeFileSync(file, JSON.stringify(a));
    assert.equal(check().status, 0, 'a fit that fastens does not follow the holes');
    a.fasten = [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'] }]; fs.writeFileSync(file, JSON.stringify(a));
    assert.deepEqual(check().fails, ['fasten.holes']);
  } finally { done(); }
});

test('fasten: access and order: the key reaches each head, a part over a screw goes on after it, one fitted first fails by name; each step says its screws, key and torque', () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    // a cover over the first screw's head, 8 mm above it, held by a fit that fastens: once to the bracket, and in the second case the bracket hangs from it
    object(ws, 'demo/cover', { variables: { w: { value: 10, unit: 'mm', rule: 'Over one screw', tweak: { min: 2, max: 20 } }, t: { value: 3, unit: 'mm', rule: 'Thick' } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.t], center: [0, 0, v.t / 2] }) }\n");
    const withCover = (fits, set = {}) => { write(); const a = JSON.parse(fs.readFileSync(file, 'utf8')); a.items.splice(1, 0, { id: 'cover', object: 'cover', at: [-12, 0, 28], set }); a.fits.push(...fits); fs.writeFileSync(file, JSON.stringify(a)); return check(); };
    // nothing over the heads: the key, its room and its reach come from the hexkey rule set (ISO 2936)
    write(); let r = check();
    assert.deepEqual(r.of('fasten.access').map((x) => x.level), ['pass']);
    assert.match(r.of('fasten.access')[0].text, /^bracket to base, 2 M3 cap screws: a 2\.5 mm hex key reaches the head along its axis: nothing within 1\.375 mm of it for 58\.5 mm over the head \(hexkey\.corners, hexkey\.long_arm\)/);
    assert.deepEqual(r.of('fasten.access')[0].values, { key: 2.5, radius: 1.375, reach: 58.5 });
    // each step names its screws, their key and how tight: the most the seat under the head takes, where no torque is given
    const order = JSON.parse(cad('order', 'demo/joint', '--json'));
    assert.deepEqual(order.steps[1].fasteners, [{ fit: 'bracket fastened to base', fastener: 'M3x10 cap', count: 2, key: '2.5 mm hex key', tighten: { torque: 0.33, given: false } }]);
    assert.match(cad('order', 'demo/joint'), /2\. bracket goes on: bracket fastened to base \(2 × M3x10 cap\) with a 2\.5 mm hex key, to 0\.33 N m at most \(what the seat takes\)/);
    write({ fasten: { torque: 0.25 } });
    assert.match(cad('order', 'demo/joint'), /\(2 × M3x10 cap\) with a 2\.5 mm hex key, to 0\.25 N m$/m);
    // a cover that goes on after the bracket: the order puts it last, and the key reaches the screw first
    r = withCover([{ a: 'cover', b: 'bracket', fastens: true, note: 'cover on the bracket' }]);
    assert.equal(r.status, 0, JSON.stringify(r.findings.filter((x) => x.level === 'fail')));
    const pass = r.of('fasten.access').find((x) => /cover/.test(x.text));
    assert.equal(pass.level, 'pass'); assert.match(pass.text, /screw 1 \(bracket\.h1\): a 2\.5 mm hex key reaches the head before cover \(step 3\) goes on over it/);
    assert.match(cad('order', 'demo/joint'), /1\. base first\n\s+2\. bracket goes on: bracket fastened to base \(2 × M3x10 cap\) with a 2\.5 mm hex key[^\n]*\n\s+3\. cover goes on/);
    // the bracket hangs from the cover, so the cover is fitted first: the screw under it fails fasten.access, naming it
    r = withCover([{ a: 'cover', b: 'base', fastens: true, note: 'cover on the base' }, { a: 'bracket', b: 'cover', fastens: true, note: 'bracket hangs from the cover' }]);
    assert.equal(r.status, 1); assert.deepEqual([...new Set(r.fails)].sort(), ['assembly.order', 'fasten.access']);
    const fail = r.of('fasten.access').find((x) => x.level === 'fail');
    assert.match(fail.text, /screw 1 \(bracket\.h1\): a 2\.5 mm hex key cannot reach the head: cover stands over it, 8 mm up the screw's axis and goes on first \(bracket hangs from the cover\), and a ball-end key tilted 25° does not clear it either\. Move the screw, open a way through cover, or fit cover after/);
    assert.equal(fail.refs.wall, 'cover'); assert.deepEqual(fail.refs.screws, ['bracket.h1']); assert.equal(fail.values.distance, 8);
    assert.deepEqual(r.of('fasten.access').find((x) => x.level === 'pass').refs.screws, ['bracket.h2'], 'the other screw is clear');
    assert.match(r.of('assembly.order')[0].text, /the screw of "bracket to base" can't be reached in any order: cover stands over it and goes on first/);
    // a narrower cover, 4 mm across: a ball-end key tilted 25° (hexkey.ball_end_tilt) passes it, so it is a warning, and the order is found
    r = withCover([{ a: 'cover', b: 'base', fastens: true, note: 'cover on the base' }, { a: 'bracket', b: 'cover', fastens: true, note: 'bracket hangs from the cover' }], { w: 4 });
    assert.deepEqual(r.fails, []); assert.equal(r.of('assembly.order')[0].level, 'pass');
    assert.match(r.of('fasten.access').find((x) => x.level === 'warn').text, /screw 1 \(bracket\.h1\): only a ball-end 2\.5 mm hex key reaches the head, tilted up to 25° \(hexkey\.ball_end_tilt\): cover \(8 mm over the head\) stands on the straight line, and a ball end takes less torque than a straight key/);
  } finally { done(); }
});

test('fasten.load: a bracket carrying 2 kg on two M3 screws into PLA pilots holds the margin worked by hand; the motor stand\'s four screws carry the force motor.mount gives', () => {
  const { ws, cad, done } = workspace();
  const near = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} against ${y} (±${tol})`);
  try {
    const { write, check } = fastened(ws);
    // The bracket hangs under the base (gravity up the screws), 2 kg at the h2 anchor, right over screw 2, tightened to 0.2 N m.
    // By hand, each figure's source:
    //   W = 2 kg × 9.80665 m/s² = 19.613 N (standard gravity). The bracket's own 40 × 20 × 5 mm less two 3.5 mm holes is
    //   3903.8 mm³, × 1.26 g/cm³ (pla.density) = 4.92 g, 0.048 N at its middle: 0.024 N on each screw. Held up: 2.0049 kg.
    //   Shared (screwGroup, the elastic method): screws at x = ±12 mm, the load at x = +12 mm: P = W/2 + W × 12 × 12 / (2 × 12²) = W
    //   on screw 2 and 0 on screw 1; with the bracket, 19.637 N and 0.024 N.
    //   Thread (stripping): 0.875 π d Le = 0.875 × π × 3 × 5 mm = 41.233 mm² (Le: the 5 mm the M3x10 engages, fasten.length);
    //   shear strength 39 MPa (pla.strength, community) / √3 (fixings.shear_ratio, estimate) = 22.517 MPa; strips at 928.4 N.
    //   Preload: F = T / (K d) = 0.2 N m / (0.2 × 3 mm) = 333.3 N (fixings.nut_factor 0.2, estimate).
    //   Thread margin: (928.4 - 333.3) / 19.637 = 30.30 times the load. Screw: proof load (π/4)(3 - 0.9382 × 0.5)² mm² × 580 MPa
    //   (m3.proof_stress, class 8.8) = 2917.9 N; (2917.9 - 333.3) / 19.637 = 131.6 times. The joint's margin: 30.30, the thread first.
    write({ fasten: { torque: 0.2 }, more: { gravity: [0, 0, 1], loads: [{ mass: 2, at: 'bracket.h2', note: '2 kg hung over screw 2' }] } });
    let r = check(), load = r.of('fasten.load');
    assert.equal(r.status, 0, r.fails.join('\n'));
    const main = load.find((x) => x.values?.margin != null), held = 2 + 3903.8 * 1.26 / 1e6, T2 = (held - 2) * 9.80665 / 2 + 2 * 9.80665;
    assert.equal(main.level, 'pass'); near(main.values.kg, held, 0.0005, 'held up: 2 kg and the bracket');
    near(main.values.tension, T2, 0.05, 'screw 2 takes the 2 kg'); near(main.values.screws[0].tension, 0, 0.05, 'screw 1 next to nothing');
    assert.equal(main.values.preload, 333.3); assert.equal(main.values.torque, 0.2);
    near(main.values.margin, (928.4 - 333.3) / T2, 0.01, 'the margin worked by hand'); near(main.values.margin, 30.30, 0.01, 'as written in the comment');
    assert.match(main.text, /^bracket to base, 2 M3 cap screws carry bracket, 2\.005 kg with the load hung on it: screw 2 \(bracket\.h2\) takes the most: an M3 screw with 19\.6 N of pull and 0 N of shear, clamped with 333\.3 N \(0\.2 N·m, T = K d F with K = 0\.2, an estimate\): its thread in pla strips at about 928\.4 N \(an estimate: 22\.52 MPa in shear\), 30\.3\d? times this pull over the preload; the screw yields at 131\.\d+ times it \(proof load 2917\.9 N\)\. It holds 30\.3\d? times the load, the thread first\. It rests on estimates: /);
    for (const k of ['pla.strength', 'fixings.shear_ratio', 'fixings.nut_factor']) assert.ok(main.refs.rests.includes(k), `rests on ${k}`);
    assert.deepEqual(main.at, [12, 0, 17]); assert.equal(r.findings.filter((x) => x.code === 'motor.loads').length, 0, 'the loads are checked, by the fasten');
    // 25 kg: the thread holds under twice it, a warning naming the kit's margin; no torque given, the step tightens to what the load leaves the thread
    write({ more: { gravity: [0, 0, 1], loads: [{ mass: 25, at: 'bracket.h2' }] } }); r = check(); load = r.of('fasten.load');
    const heavy = load.find((x) => x.values?.margin != null);
    assert.equal(heavy.level, 'pass', heavy.text); near(heavy.values.margin, 2, 0.05, 'tightened only so far as leaves the thread twice the load'); assert.match(heavy.text, /Tighten to 0\.\d+ N m/);
    const step = JSON.parse(cad('order', 'demo/joint', '--json')).steps.flatMap((x) => x.fasteners || []).find((x) => x.fastener === 'M3x10 cap');
    assert.deepEqual(step.tighten, { torque: heavy.values.torque, given: false, load: true }); assert.match(cad('order', 'demo/joint'), /to 0\.\d+ N m \(what the joint's load leaves the thread\)/);
    write({ fasten: { torque: 0.4 }, more: { gravity: [0, 0, 1], loads: [{ mass: 25, at: 'bracket.h2' }] } }); r = check(); // (928.4 - 666.7) / 245.2: 1.07 times
    const tight = r.of('fasten.load').find((x) => x.values?.margin != null); assert.equal(tight.level, 'warn', 'tightened past it, the thread holds under twice the load');
    assert.match(tight.text, /It holds 1\.0\d times the load, the thread first, where the kit asks 2 times/);
    write({ fasten: { torque: 0.5 }, more: { gravity: [0, 0, 1], loads: [{ mass: 25, at: 'bracket.h2' }] } }); r = check();
    assert.equal(r.of('fasten.load').find((x) => x.values?.margin != null).level, 'fail', 'tightened further, it strips under the load'); assert.ok(r.status !== 0);
    // across the screws: a sideways load slips against the clamp, said with the friction it rests on
    write({ fasten: { torque: 0.2 }, more: { gravity: [1, 0, 0], loads: [{ mass: 2, at: 'bracket.h2' }] } }); r = check();
    const slip = r.of('fasten.load').find((x) => x.values?.slip != null); assert.match(slip.text, /holds the 9\.8 N of shear by friction 10\.\d+ times over \(fixings\.clamp_friction 0\.3, an estimate\)/);

    // The motor stand of the bench: motor.mount's numbers as they were before fasten.load (recorded 2026-11-15 on 0ef929d)
    const bench = fileURLToPath(new URL('../../examples/bench/', CAD)), stand = path.join(ws, 'stand');
    fs.cpSync(bench, stand, { recursive: true, filter: (p) => !p.includes('node_modules') }); fs.symlinkSync(ROOT_MODULES, path.join(stand, 'node_modules'), 'junction');
    const motorOf = (name) => { const out = run(stand, ['check', `benchmarks/${name}`, '--json']).stdout; return JSON.parse(out).findings; };
    const before = motorOf('motor-test').find((x) => x.code === 'motor.mount' && x.values?.bearing != null);
    assert.match(before.text, /motor on stand: 5 mm of plate at the screws, each taking 3\.2 N against the torque \(bearing 0\.2 MPa, 212 times under PLA's 39 MPa\)/);
    near(before.values.bearing, 0.18433179723502305, 1e-12, 'bearing as before'); near(before.values.margin, 211.575, 1e-9, 'margin as before');
    // the same stand with the motor fastened by four M3 screws through it into the motor's own threads (the dial left off)
    const a = JSON.parse(fs.readFileSync(path.join(stand, 'projects/benchmarks/assemblies/motor-test.json'), 'utf8'));
    a.items = a.items.filter((x) => x.id !== 'dial'); a.joints = a.joints.filter((x) => x.id !== 'd'); a.fits = a.fits.filter((x) => x.a !== 'dial' && !(x.a === 'motor' && x.fastens));
    a.fasten = [{ screw: 'M3 cap', through: ['stand'], into: 'motor', holes: 'stand', note: 'The motor, on its four screws' }];
    fs.writeFileSync(path.join(stand, 'projects/benchmarks/assemblies/motor-fasten.json'), JSON.stringify(a));
    const fm = motorOf('motor-fasten'), each = 0.28284271247461906 / (4 * Math.hypot(15.5, 15.5) / 1000); // T / (4 r): 3.2258 N, what motor.mount works out
    for (const code of ['fasten.holes', 'fasten.end', 'fasten.length', 'fasten.engagement']) assert.deepEqual(fm.filter((x) => x.code === code).map((x) => x.level), ['pass'], code);
    assert.match(fm.find((x) => x.code === 'fasten.end').text, /ends in motor's own M3 thread, 4\.5 mm deep \(nema17\.mount_hole_depth\)/);
    assert.match(fm.find((x) => x.code === 'fasten.length').text, /M3x8 cap chosen, the longest sold that stops short of the end of the thread: 5 mm under its head and 3 mm into motor/);
    const ml = fm.find((x) => x.code === 'fasten.load' && x.values?.share != null), mount = fm.find((x) => x.code === 'motor.mount' && x.values?.bearing != null);
    near(ml.values.share, each, each * 1e-4, 'fasten.load: each screw\'s share of the motor\'s torque'); assert.ok(ml.refs.each, 'the same on each screw');
    assert.match(ml.text, /motor's 0\.283 N m about its shaft \(what it gives at its working speed\), 3\.2 N on each screw from that alone/);
    assert.match(mount.text, /each taking 3\.2 N against the torque/); near(mount.values.bearing, before.values.bearing, 1e-12, 'motor.mount unchanged beside it');
    assert.equal(ml.values.screws.length, 4); near(ml.values.kg, 0.28, 1e-9, 'the motor held up'); assert.equal(ml.level, 'pass');
  } finally { done(); }
});

test('fasten.count: cad list counts every screw by thread, length and head, with its mass and the packs it is bought in; --json and the build page carry them', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'), { recursive: true });
    // a plate of holes over a block of pilots: twelve under a 3 mm plate, four under a 7 mm one
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    object(ws, 'demo/grid', { uses: ['x1c'], variables: { cols: { value: 2, unit: '', rule: 'Holes across', tweak: { min: 1, max: 6 } }, rows: { value: 2, unit: '', rule: 'Holes down', tweak: { min: 1, max: 6 } },
      pitch: t(12, 'Between the holes', 8, 20), thick: t(12, 'The block or plate', 2, 20), hole_depth: t(9, 'Thread engaged and room at the tip', 3, 11), kind: { value: 'pilot', choice: ['pilot', 'clear'], rule: 'What the holes are' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const holes = [], plate = cuboid({ size: [v.cols * v.pitch, v.rows * v.pitch, v.thick], center: [0, 0, v.thick / 2] })
  for (let i = 0; i < v.cols; i++) for (let j = 0; j < v.rows; j++) {
    const at = [(i - (v.cols - 1) / 2) * v.pitch, (j - (v.rows - 1) / 2) * v.pitch, v.thick]
    holes.push(v.kind === 'pilot' ? v.fixings.hole('M3', { kind: 'pilot', depth: v.hole_depth, at }) : v.fixings.hole('M3', { depth: v.thick, at }))
  }
  return v.ops.subtract(plate, ...holes)
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['grid'] }));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/kit.json'), JSON.stringify({ title: 'Two plates screwed down', kind: 'fit',
      items: [{ id: 'block1', object: 'grid', set: { cols: 4, rows: 3 } }, { id: 'plate1', object: 'grid', at: [0, 0, 12], set: { cols: 4, rows: 3, thick: 3, kind: 'clear' } },
        { id: 'block2', object: 'grid', at: [80, 0, 0] }, { id: 'plate2', object: 'grid', at: [80, 0, 12], set: { thick: 7, kind: 'clear' } }],
      fits: [{ a: 'plate1', b: 'block1', min: 0, max: 0.05 }, { a: 'plate2', b: 'block2', min: 0, max: 0.05 }, { a: 'block2', b: 'block1', fastens: true, note: 'side by side on the bench' }],
      fasten: [{ screw: 'M3 cap', through: ['plate1'], into: 'block1', holes: 'plate1.body' }, { screw: 'M3 cap', through: ['plate2'], into: 'block2', holes: 'plate2.body' }] }));
    const { screwModel } = await import('@rulecad/fixings'), g8 = screwModel('M3x8 cap').mass, g12 = screwModel('M3x12 cap').mass;
    const l = JSON.parse(cad('list', 'demo/kit', '--json'));
    assert.deepEqual(l.fasteners.map(({ fastener, qty, kind, thread, length, head, packs, buy, spare }) => ({ fastener, qty, kind, thread, length, head, packs, buy, spare })), [
      { fastener: 'M3x8 cap', qty: 12, kind: 'screw', thread: 'M3', length: 8, head: 'cap', packs: 2, buy: 20, spare: 8 },
      { fastener: 'M3x12 cap', qty: 4, kind: 'screw', thread: 'M3', length: 12, head: 'cap', packs: 1, buy: 10, spare: 6 }]);
    assert.deepEqual(l.fasteners.map((f) => [f.grams, f.mass]), [[+g8.toFixed(3), +(g8 * 12).toFixed(2)], [+g12.toFixed(3), +(g12 * 4).toFixed(2)]], 'each screw\'s mass from @rulecad/fixings, and the line\'s');
    assert.deepEqual(l.fasteners.map((f) => f.from), [['plate1 to block1'], ['plate2 to block2']]);
    assert.equal(l.totals.fixingsGrams, +(g8 * 12 + g12 * 4).toFixed(1)); assert.equal(l.totals.machineGrams, +(l.totals.printedGrams + l.totals.boughtGrams + l.totals.fixingsGrams).toFixed(1));
    assert.deepEqual(l.totals.pack, { size: 10, rule: 'packs.pack', kind: 'estimate' });
    // as text: the count, the screw, its mass, the packs
    const text = cad('list', 'demo/kit');
    assert.match(text, new RegExp(`12 ×\\s+M3x8 cap\\s+${g8.toFixed(3).replace(/0+$/, '').replace('.', '\\.')} g each, ${(+(g8 * 12).toFixed(2)).toString().replace('.', '\\.')} g\\s+2 packs of 10, 8 spare\\s+plate1 to block1`));
    assert.match(text, /\n\s+4 ×\s+M3x12 cap\s+[\d.]+ g each, [\d.]+ g\s+1 pack of 10, 6 spare\s+plate2 to block2/);
    assert.match(text, /packs of 10: packs\.pack, an estimate/); assert.match(text, /[\d.]+ g of fixings, [\d.]+ g as a machine/);
    // a fit that names its fastener by hand is still counted, beside them
    const a = JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/assemblies/kit.json'), 'utf8')); a.fits[2] = { ...a.fits[2], fastener: 'M4x10 button', count: 2 };
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/kit.json'), JSON.stringify(a));
    assert.deepEqual(JSON.parse(cad('list', 'demo/kit', '--json')).fasteners.map((f) => [f.fastener, f.qty, f.from]).at(-1), ['M4x10 button', 2, ['side by side on the bench']]);
    // the link's build page carries the list, and each step its screws and key
    const out = cad('link', 'demo/kit', '--long'), { decode } = await import('@rulecad/model-link'), m = await decode(out.match(/view\s+(\S+)/)[1].split('#m=')[1]);
    assert.deepEqual(m.build.list.fasteners.slice(0, 2).map((f) => [f.fastener, f.qty, f.packs]), [['M3x8 cap', 12, 2], ['M3x12 cap', 4, 1]]);
    assert.ok(m.build.order.steps.some((st) => st.fasteners.some((f) => f.fastener === 'M3x8 cap' && f.count === 12 && f.key === '2.5 mm hex key')), JSON.stringify(m.build.order).slice(0, 400));
  } finally { done(); }
});

test('fasten.count: nuts of two threads in one assembly are each their own size, placed and listed apart', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'), { recursive: true });
    // a plate with one clearance hole for the thread it is set to, through its whole thickness
    object(ws, 'demo/plate', { uses: ['x1c'], variables: { thick: { value: 12, unit: 'mm', rule: 'The plate', tweak: { min: 2, max: 20 } }, thread: { value: 'M3', choice: ['M3', 'M4'], rule: 'The screw it takes' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [20, 20, v.thick], center: [0, 0, v.thick / 2] }), v.fixings.hole(v.thread, { depth: v.thick, at: [0, 0, v.thick] }))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['plate'] }));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/pair.json'), JSON.stringify({ title: 'An M3 and an M4 joint, each with a nut', kind: 'fit',
      items: [{ id: 'block3', object: 'plate' }, { id: 'top3', object: 'plate', at: [0, 0, 12], set: { thick: 3 } },
        { id: 'block4', object: 'plate', at: [40, 0, 0], set: { thread: 'M4' } }, { id: 'top4', object: 'plate', at: [40, 0, 12], set: { thick: 3, thread: 'M4' } }],
      fits: [{ a: 'top3', b: 'block3', min: 0, max: 0.05 }, { a: 'top4', b: 'block4', min: 0, max: 0.05 }, { a: 'block4', b: 'block3', fastens: true, note: 'side by side' }],
      fasten: [{ screw: 'M3 cap', through: ['top3'], into: 'block3', holes: 'top3.body', nut: true, note: 'M3 joint' }, { screw: 'M4 cap', through: ['top4'], into: 'block4', holes: 'top4.body', nut: true, note: 'M4 joint' }] }));
    const l = JSON.parse(cad('list', 'demo/pair', '--json'));
    assert.deepEqual(l.fasteners.filter((f) => f.kind === 'nut').map(({ fastener, qty, thread, from }) => ({ fastener, qty, thread, from })), [
      { fastener: 'M3 hex nut', qty: 1, thread: 'M3', from: ['M3 joint'] }, { fastener: 'M4 hex nut', qty: 1, thread: 'M4', from: ['M4 joint'] }]);
    const r = JSON.parse(cad('check', 'demo/pair', '--json'));
    assert.deepEqual(r.findings.filter((f) => f.level === 'fail').map((f) => f.text), [], 'the M4 nut is an M4 nut, so it overlaps nothing');
  } finally { done(); }
});

test('a holes fit follows a board\'s mounting holes into what they screw into: inserts under them pass, moved ones fail', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'rules'));
    fs.writeFileSync(path.join(ws, 'rules/demo.json'), JSON.stringify({ name: 'demo', rules: { insert: { value: 3, unit: 'mm', rule: 'Insert depth', kind: 'spec' } } }));
    object(ws, 'demo/board', { engine: 'pcb', role: 'board', uses: ['jlcpcb'], parts: { board: { label: 'PCB' } }, variables: {
      w: { value: 30, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, thickness: { value: 'jlcpcb.thickness', unit: 'mm', rule: 'Standard' },
      hx: { value: 11, unit: 'mm', rule: 'Hole from the centre' } } },
    "export function main (v) { return { center: { x: 0, y: 0 }, width: v.w, height: v.d, thickness: v.thickness, parts: [], traces: [], silk: [], holes: [-1, 1].map((s) => v.pcb.mount('M2', s * v.hx, 0)) } }\n"); // (named by thread: m2.clearance, as drilled)
    assert.match(cad('trust'), /for board designs run outside the sandbox/); // (a board design runs in the tool's process: asked once)
    const block = (offset) => `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives, { translate } = jscad.transforms, { subtract } = jscad.booleans
export function main (v) {
  const holes = v.board.board_holes.map((h) => translate([h.x + v.shift, h.y, v.h - v.demo.insert / 2], cylinder({ radius: v.r, height: v.demo.insert })))
  return subtract(translate([0, 0, -v.h / 2], cuboid({ size: [v.board.board_w, v.board.board_d, v.h] })), ...holes.map((c) => translate([0, 0, -v.h], c)))
}
`;
    const vars = { h: { value: 6, unit: 'mm', rule: 'Block height' }, r: { value: 1.6, unit: 'mm', rule: 'Insert hole radius' }, shift: { value: 0, unit: 'mm', rule: 'Holes moved by' } };
    object(ws, 'demo/block', { uses: ['demo', 'demo/board'], variables: vars }, block());
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/stack.json'), JSON.stringify({ title: 'Board on block', kind: 'fit', uses: ['demo'], items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }],
      fits: [{ holes: 'pcb.board', into: 'blk.body', depth: 'demo.insert', label: 'Screws find their inserts' }, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, label: 'Board on block' }] }));
    assert.match(cad('check', 'demo/stack'), /Screws find their inserts: 2 of 2 holes clear for 3 mm, with material around each/);
    // the same board fastened: its own holes (v.pcb.mount('M2'), 2.4 mm) held to the thread's clearance hole as the fab drills it, not as printed
    const asm = { title: 'Board screwed to block', kind: 'fit', items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }],
      fasten: [{ screw: 'M2 cap', through: ['pcb'], into: 'blk', holes: 'pcb.board' }] };
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/screwed.json'), JSON.stringify(asm));
    const screwed = JSON.parse(cad('check', 'demo/screwed', '--json')).findings, of = (c) => screwed.filter((x) => x.code === c);
    assert.deepEqual(of('fasten.clearance').map((x) => [x.level, x.text]), [['pass', "pcb to blk, 2 M2 cap screws: pcb's hole measures 2.4 mm, an M2 clearance hole as drilled (m2.clearance 2.4 mm)"]]);
    assert.deepEqual(of('fasten.clearance')[0].values, { diameter: 2.4, wanted: 2.4, least: 2.2, most: 2.6 });
    assert.equal(of('fasten.holes').filter((x) => x.level === 'pass').length, 1, JSON.stringify(of('fasten.holes')));
    assert.match(cad('list', 'demo/screwed'), /2 ×\s+M2x\d+ cap/);
    // a workspace's own M2 set moves the board's holes: v.pcb.mount reads it before the kit's
    const m2 = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../rules/m2.json', CAD)), 'utf8'));
    fs.writeFileSync(path.join(ws, 'rules/m2.json'), JSON.stringify({ ...m2, rules: { ...m2.rules, clearance: { ...m2.rules.clearance, value: 2.5 } } }));
    assert.match(cad('check', 'demo/screwed'), /pcb's hole measures 2\.5 mm, an M2 clearance hole as drilled \(m2\.clearance 2\.5 mm\)/);
    fs.rmSync(path.join(ws, 'rules/m2.json'));
    const bj = path.join(ws, 'projects/demo/objects/block.json'), b = JSON.parse(fs.readFileSync(bj, 'utf8'));
    fs.writeFileSync(bj, JSON.stringify({ ...b, variables: { ...vars, shift: { ...vars.shift, value: 4 } } }));
    const moved = cad('check', 'demo/stack');
    assert.match(moved, /Screws find their inserts: hole at -11, 0 mm: solid/, 'moved inserts: the screws hit solid');
    assert.match(moved, /pcb\.board \/ blk\.body: closest gap 0 mm/, 'while the gap fit alone still passes');
  } finally { done(); }
});

test('fasten.suggest: a holes fit and a fit that fastens the same parts suggest the fasten that says both; cad add fasten --from-fits puts it in their place', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/board', { engine: 'pcb', role: 'board', uses: ['jlcpcb', 'm2'], parts: { board: { label: 'PCB' } }, variables: {
      w: { value: 30, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, thickness: { value: 'jlcpcb.thickness', unit: 'mm', rule: 'Standard' },
      hx: { value: 11, unit: 'mm', rule: 'Hole from the centre' }, hd: { value: 'm2.clearance', unit: 'mm', rule: 'M2 clearance' } } },
    'export function main (v) { return { center: { x: 0, y: 0 }, width: v.w, height: v.d, thickness: v.thickness, parts: [], traces: [], silk: [], holes: [-1, 1].map((s) => ({ x: s * v.hx, y: 0, d: v.hd })) } }\n');
    cad('trust'); // (a board design runs in the tool's process: asked once)
    object(ws, 'demo/block', { uses: ['x1c', 'demo/board'], variables: { h: { value: 'x1c.layer * 30', unit: 'mm', rule: 'Whole layers' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const block = cuboid({ size: [v.board.board_w, v.board.board_d, v.h], center: [0, 0, 0 - v.h / 2] })
  return v.ops.subtract(block, ...v.board.board_holes.map((h) => v.fixings.hole('M2', { kind: 'pilot', depth: v.h - v.x1c.layer * 2, at: [h.x, h.y, 0] })))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['board', 'block'] }));
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const file = path.join(ws, 'projects/demo/assemblies/stack.json');
    const write = (fits) => fs.writeFileSync(file, `${JSON.stringify({ title: 'Board on block', kind: 'fit', uses: ['x1c', 'm2'], items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }], fits }, null, 2)}\n`);
    const holes = { holes: 'pcb.board', into: 'blk.body', depth: 'x1c.layer * 20', label: 'Screws find their pilots' };
    const check = () => { const out = cad("check", "demo/stack", "--json"); try { return JSON.parse(out).findings; } catch { assert.fail(out); } };
    // the two older forms together: a note with the fasten to paste, the screw read from the board's holes as drawn (2.4 mm: M2)
    write([holes, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, fastens: true, label: 'Board on block' }]);
    let notes = check().filter((x) => x.code === 'fasten.suggest');
    assert.equal(notes.length, 1); assert.equal(notes[0].level, 'info');
    assert.equal(notes[0].text, 'Screws find their pilots and the fit that fastens pcb to blk are one screwed joint: a fasten says both and knows the screw (its holes, length, thread engaged, the seat under its head and the key that turns it). In place of the two, add to "fasten": {"screw":"M2 cap","through":["pcb.board"],"into":"blk.body","holes":"pcb.board","note":"Screws find their pilots"}, or run cad add fasten demo/stack --from-fits');
    assert.deepEqual(notes[0].refs, { fits: [0, 1], items: ['pcb', 'blk'], paste: { screw: 'M2 cap', through: ['pcb.board'], into: 'blk.body', holes: 'pcb.board', note: 'Screws find their pilots' } });
    // the fit's fastener names the screw where it gives one; a thread set in the depth, where it does not
    write([holes, { a: 'blk', b: 'pcb', fastens: true, fastener: 'M2x8', count: 2 }]);
    assert.equal(check().find((x) => x.code === 'fasten.suggest').refs.paste.screw, 'M2x8 cap');
    write([{ ...holes, depth: 'm2.pilot_depth' }, { a: 'blk', b: 'pcb', fastens: true, note: 'Two screws' }]);
    assert.equal(check().find((x) => x.code === 'fasten.suggest').refs.paste.screw, 'M2 cap');
    // either alone, or a fasten already there: no note
    write([holes]); assert.ok(!check().some((x) => x.code === 'fasten.suggest'), 'a holes fit alone');
    write([{ a: 'pcb.board', b: 'blk.body', fastens: true }]); assert.ok(!check().some((x) => x.code === 'fasten.suggest'), 'a fit that fastens alone');
    // --from-fits: the holes fit goes, the fit that fastens keeps its gap range only, and the fasten is added; the check then follows the screws
    write([holes, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, fastens: true, fastener: 'M2 screws', count: 2, label: 'Board on block' }]);
    // a dry run says what it would add and writes nothing
    const unchanged = fs.readFileSync(file, 'utf8');
    assert.match(cad('add', 'fasten', 'demo/stack', '--from-fits', '--dry-run'), /^dry run, nothing written:\nwould add a fasten to projects\/demo\/assemblies\/stack\.json in place of its holes fit/);
    assert.deepEqual(JSON.parse(cad('add', 'fasten', 'demo/stack', '--from-fits', '--dry-run', '--json')).written, false);
    assert.equal(fs.readFileSync(file, 'utf8'), unchanged, 'a dry run leaves the assembly as it was');
    assert.match(cad('add', 'fasten', 'demo/stack', '--from-fits'), /added a fasten to .*stack\.json in place of its holes fit and its fit that fastens/);
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(a.fits, [{ a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, label: 'Board on block' }]);
    assert.deepEqual(a.fasten, [{ screw: 'M2 cap', through: ['pcb.board'], into: 'blk.body', holes: 'pcb.board', note: 'Screws find their pilots' }]);
    assert.match(fs.readFileSync(file, 'utf8'), /^\{\n  "title": "Board on block",\n/, 'the file keeps its layout');
    const after = check();
    assert.ok(!after.some((x) => x.code === 'fasten.suggest'), 'said once, then gone');
    assert.deepEqual(after.filter((x) => x.level === 'fail').map((x) => x.text), []);
    assert.equal(after.find((x) => x.code === 'fasten.end').level, 'pass');
    assert.match(cad('list', 'demo/stack'), /2 ×\s+M2x\d+ cap/);
    // a fit that fastens with no range goes whole; with nothing to replace, it says so; a screw given is used
    write([holes, { a: 'blk', b: 'pcb', fastens: true }]);
    const j = JSON.parse(cad('add', 'fasten', 'demo/stack', '--from-fits', '--screw', 'M2x6 cap', '--json'));
    assert.deepEqual(j.added.map((x) => x.screw), ['M2x6 cap']);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).fits, []);
    assert.match(cad('add', 'fasten', 'demo/stack', '--from-fits'), /no holes fit with a fit that fastens the same two items/);
  } finally { done(); }
});

test('a screw\'s way: the anchor\'s axis is turned for a tie only where the part is astride what it is screwed into', async () => {
  const { screwFlips } = await import('../lib/fasten.mjs');
  // a saddle's legs either side of a beam, centred on it: the tie the guides' holders make, the axis turned
  assert.equal(screwFlips([-15, 15], [-10, 10]), true);
  // a tie any other way keeps the axis as it was before that rule: a part within the other's reach, or level with it
  assert.equal(screwFlips([-5, 5], [-10, 10]), false);
  assert.equal(screwFlips([-10, 10], [-10, 10]), false);
  // no tie: toward the far part, as ever
  assert.equal(screwFlips([0, 3], [3, 10]), false); assert.equal(screwFlips([3, 10], [0, 3]), true);
});

test('a printed bolt in a fasten: an M8 printed bolt into a printed thread is listed as a printed part, held to its load by its plastic\'s strength, and an M5 one refused naming M6', async () => {
  const { ws, cad, done } = workspace();
  try {
    // A base 40 × 20 × 24 mm with two M8 threads printed in it, 22 mm deep, and a bracket 6 mm thick with two clearance holes
    object(ws, 'pb/base', { uses: ['x1c'], variables: { thread: { value: 'M8', choice: ['M8', 'M5'], rule: 'The thread' }, kind: { value: 'thread', choice: ['thread', 'pilot', 'insert', 'tap'], rule: 'The holes the bolts end in' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const block = cuboid({ size: [40, 20, 24], center: [0, 0, 12] })
  return v.ops.subtract(block, ...[-12, 12].map((x) => v.fixings.hole(v.thread, { kind: v.kind, depth: 22, at: [x, 0, 24] })))
}
`);
    object(ws, 'pb/bracket', { uses: ['x1c'], anchors: { h1: { at: [-12, 0, 6], axis: [0, 0, 1] }, h2: { at: [12, 0, 6], axis: [0, 0, 1] } }, variables: { thread: { value: 'M8', choice: ['M8', 'M5'], rule: 'The thread' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) { return v.ops.subtract(cuboid({ size: [40, 20, 6], center: [0, 0, 3] }), ...[-12, 12].map((x) => v.fixings.hole(v.thread, { depth: 6, at: [x, 0, 6] }))) }
`);
    fs.writeFileSync(path.join(ws, 'projects/pb/project.json'), JSON.stringify({ name: 'pb', material: 'PLA', objects: ['base', 'bracket'] }));
    const file = path.join(ws, 'projects/pb/assemblies/joint.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const write = (screw, kg, thread = 'M8', kind = 'thread') => fs.writeFileSync(file, JSON.stringify({ title: 'A bracket on printed bolts', kind: 'fit', gravity: [0, 0, 1], loads: [{ mass: kg, at: 'bracket.h2' }],
      items: [{ id: 'base', object: 'base', set: { thread, kind } }, { id: 'bracket', object: 'bracket', at: [0, 0, 24], set: { thread } }],
      fits: [{ a: 'bracket', b: 'base', min: 0, max: 0.05, note: 'The bracket sits on the base' }],
      fasten: [{ screw, through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'] }] }));
    const check = () => { const r = spawnSync(process.execPath, [BIN, 'check', 'pb/joint', '--json'], { cwd: ws, encoding: 'utf8' }); const out = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })(); if (!out?.findings) assert.fail(`${r.stdout}${r.stderr}`); return out.findings; };
    // 20 kg hung over screw 2 pulls it with about 20 × 9.80665 = 196.1 N (and the bracket's own few grams). By hand, the M8
    // printed bolt's root as drawn: the basic minor 8 - 2 × (5/8)(√3/2)(1.25) = 6.6467 mm, less its half of x1c.thread_gap
    // (0.1 mm) each side, 6.446 mm; (π/4) 6.446² = 32.634 mm² at pla.strength 39 MPa (no strength_z, so the strength along
    // the layers stands for it) = 1272.7 N. Its teeth in 24 mm of printed thread shear over 0.75 π D1 Le = 0.75 π × 6.6467
    // × Le, far more. So it breaks at 1272.7 N: 1272.7 / 196.1 = 6.49 times the pull, about.
    write('M8 hex printed', 20);
    const found = check(), load = found.find((x) => x.code === 'fasten.load' && x.values?.margin != null);
    assert.ok(load, JSON.stringify(found.filter((x) => /fasten/.test(x.code))));
    assert.deepEqual(found.filter((x) => /^fasten/.test(x.code) && x.level === 'fail').map((x) => x.text), [], 'the joint is whole: its holes, its printed thread, its length');
    assert.ok(found.some((x) => x.code === 'fasten.end' && /in a thread drawn to print/.test(x.text)), 'it ends in the thread printed in the base: a printed pair');
    assert.equal(load.level, 'pass', load.text); assert.match(load.text, /M8x\d+ hex printed in pla, done up by hand, with 196\.\d N of pull and 0 N of shear: it breaks along at about 1272\.7 N \(tension\)/);
    assert.ok(Math.abs(load.values.margin - 1272.7 / load.values.tension) < 0.01 && load.values.margin > 6.4 && load.values.margin < 6.6, `${load.values.margin}`);
    assert.ok(!/Tighten to/.test(load.text), 'a printed bolt is done up by hand: no torque');
    // its head's seat is still read against the plastic it sits on (seating at a force given, not a steel screw's proof load)
    const seat = found.find((x) => x.code === 'fasten.seat' && /hex printed|flat seat/.test(x.text));
    assert.ok(seat && /on pla \(\d+ MPa\)/.test(seat.text) && !/no strength is known/.test(seat.text), seat?.text);
    // listed with the printed parts, by name, and not as a bought screw
    const list = JSON.parse(cad('list', 'pb/joint', '--json')), bolt = list.printed.find((p) => /^M8x\d+ hex printed$/.test(p.id));
    assert.ok(bolt && bolt.count === 2 && bolt.grams > 2, JSON.stringify(list.printed)); assert.ok(!list.fasteners.some((f) => /M8/.test(f.fastener)), JSON.stringify(list.fasteners));
    assert.match(cad('list', 'pb/joint'), /M8x\d+ hex printed \(2 printed bolts, standing on their heads/);
    // worded for a bolt that is printed and done up by hand: no tightening torque under its head, no wrench, no "sold" length
    const said = (code) => found.filter((x) => x.code === code).map((x) => x.text).join(' | ');
    assert.match(said('fasten.length'), /M8x\d+ hex printed chosen, the shortest that fits \(a printed bolt is printed to any whole millimetre\)/); assert.ok(!/sold/.test(said('fasten.length')), said('fasten.length'));
    assert.match(said('fasten.seat'), /done up by hand, with no torque to tighten to/); assert.ok(!/tightening of|N m/.test(said('fasten.seat')), said('fasten.seat'));
    assert.match(said('fasten.access'), /a 13 mm socket or spanner turned by hand reaches the head/);
    // Into a pilot: a plastic bolt forms no thread in plastic, so the end is refused by name, pointing at a printed thread, a nut or an insert
    write('M8 hex printed', 20, 'M8', 'pilot');
    const pilot = check().filter((x) => x.code === 'fasten.end');
    assert.ok(pilot.length && pilot.every((x) => x.level === 'fail'), JSON.stringify(pilot));
    assert.match(pilot[0].text, /M8 hex printed is a printed bolt: a plastic thread cannot form its own thread in plastic\. Print the thread in base \(v\.fixings\.hole\('M8', \{ kind: 'thread' \}\)\), or end it in a nut or a heat-set insert/);
    // Into a heat-set insert or a tapped hole: a standard thread, so the bolt takes the whole 0.2 mm x1c.thread_gap and not half.
    // By hand: root radius 3.3234 - 0.2 = 3.1234 mm, 6.246 mm across; (π/4) 6.246² = 30.640 mm² × 39 MPa = 1195.0 N (not the
    // 1272.7 N of a printed pair). Its teeth in the insert (0.75 π × 6.6467 × Le at 22.517 MPa) shear above 1195 N for any Le
    // over 3.4 mm, so tension governs: 1195.0 / 196.1 = 6.09 times the pull
    for (const kind of ['insert', 'tap']) {
      write('M8 hex printed', 20, 'M8', kind);
      const got = check(), l2 = got.find((x) => x.code === 'fasten.load' && x.values?.margin != null);
      assert.ok(l2, `${kind}: ${JSON.stringify(got.filter((x) => /fasten/.test(x.code)).map((x) => x.text))}`);
      assert.match(l2.text, /breaks along at about 1195 N \(tension\)/, `${kind}: ${l2.text}`);
      assert.ok(Math.abs(l2.values.margin - 1195 / l2.values.tension) < 0.01, `${kind}: ${l2.values.margin}`);
    }
    // 150 kg: about 1471 N, more than it breaks at
    write('M8 hex printed', 150);
    assert.equal(check().find((x) => x.code === 'fasten.load' && x.values?.margin != null).level, 'fail');
    // an M5 printed bolt: its 0.8 mm pitch is finer than five 0.2 mm layers, so it is refused, naming M6
    write('M5 hex printed', 1);
    const r = spawnSync(process.execPath, [BIN, 'check', 'pb/joint'], { cwd: ws, encoding: 'utf8' });
    assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /fasten 1: M5 has a 0\.8 mm pitch, finer than x1c prints.*The smallest metric thread that would print is M6/s);
  } finally { done(); }
});

test('a printed bolt into a slot nut (#305): its length is any whole millimetre that fits, worded as printed, and a torque given for it is a hand\'s turn held to what the bolt breaks at', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/plate.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    object(ws, 'frame/plate', { uses: ['x1c'], variables: { pitch: t(20, 'Between the holes', 5, 60), thick: t(10, 'The plate', 2, 12) } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [40, 40, v.thick], center: [0, 0, v.thick / 2] })
  return v.ops.subtract(plate, ...[-1, 1].map((s) => v.fixings.hole('M6', { depth: v.thick, at: [s * v.pitch / 2, 0, v.thick] })))
}
`);
    const pj = JSON.parse(fs.readFileSync(at('project.json'), 'utf8')); fs.writeFileSync(at('project.json'), JSON.stringify({ ...pj, material: 'PLA' }));
    const write = (extra = {}, screw = 'M6 hex printed') => fs.writeFileSync(file, JSON.stringify({ title: 'A plate on a 3030', kind: 'fit', items: [{ id: 'x1', beam: { profile: '3030-misumi-hfs6' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'plate', object: 'plate', at: [150, 0, 15] }],
      fasten: [{ screw, through: ['plate'], into: 'x1.top', holes: 'plate.body', nut: 'drop-in', ...extra }] }));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/plate'), { orderOf, fastenerText } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/order.mjs')).href)});
      console.log(JSON.stringify({ hardware: s.hardware.map((h) => [h.kind, h.name, h.printed ?? false]), findings: checkAssembly(s).filter((f) => /^fasten/.test(f.code)).map(({ level, code, text, values }) => ({ level, code, text, values })), order: orderOf(s).steps.flatMap((st) => st.fasteners.map(fastenerText)) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // A 10 mm plate on slot-8-misumi's 2 mm lip: 12 mm under the head. The drop-in nut's thread starts 1.2 mm under the
    //   face and m6.nut_height asks 5.2 mm of it, so the bolt is at least 10 + 1.2 + 5.2 = 16.4 mm; the slot's floor is
    //   9 mm under the face and 0.3 mm is kept off it, so at most 10 + 9 - 0.3 = 18.7 mm. No M6 is sold between (16, 20):
    //   a bought screw fails, and the printed bolt is the 17 mm that fits, its tip 17 - 10 = 7 mm into the slot, 2 mm off its floor.
    write({}, 'M6 hex');
    const bought = probe().findings.filter((x) => x.code === 'fasten.length');
    assert.equal(bought[0].level, 'fail'); assert.match(bought[0].text, /no M6 hex screw is sold from 16\.4 to 18\.7 mm long/);
    write();
    let r = probe();
    const said = (code) => r.findings.filter((x) => x.code === code);
    assert.deepEqual(r.hardware.filter((h) => h[0] === 'screw').map((h) => [h[1], h[2]]), [['M6x17 hex printed', true], ['M6x17 hex printed', true]]);
    assert.deepEqual(said('fasten.length').map((x) => x.level), ['pass']);
    assert.match(said('fasten.length')[0].text, /M6x17 hex printed chosen, the shortest that fits \(a printed bolt is printed to any whole millimetre\): 12 mm under its head \(plate and the slot's 2 mm lip\), 5\.8 mm into its nut, its tip 7 mm into the slot and 2 mm short of its floor/);
    assert.ok(!/sold/.test(said('fasten.length')[0].text));
    assert.ok(!('torque' in said('fasten.seat')[0].values), 'no tightening torque in its values'); assert.ok(!said('fasten.torque').length, 'no torque given: none judged');
    // A torque given: 1 N m by T = K d F with K 0.2 is 1 / (0.2 × 0.006) = 833.3 N of clamp. The M6 printed bolt in PLA
    //   into a steel nut breaks at its root: 6 - 2 (5/8)(√3/2)(1) = 4.9175 mm less the whole 0.2 mm x1c.thread_gap each
    //   side, 4.518 mm; (π/4) 4.518² = 16.03 mm² × 39 MPa = 625.2 N. 833.3 N breaks it. Twice over, 312.6 N, is
    //   0.2 × 6 × 312.6 / 1000 = 0.37512 N m, said as 0.37: rounded down, since at 0.38 the clamp is 0.38 / (0.2 × 0.006)
    //   = 316.7 N, and twice that, 633.3 N, is past the 625.2 N it breaks at
    write({ torque: 1 }); r = probe();
    const turn = said('fasten.torque');
    assert.deepEqual(turn.map((x) => x.level), ['fail'], 'one finding for both bolts');
    assert.match(turn[0].text, /turned by hand to 1 N m, it clamps with about 833\.3 N \(T = K d F, fixings\.nut_factor 0\.2 for steel threads: an estimate for a printed one\): more than the 625\.2 N it breaks at \(tension\): turning it that far breaks it\. Turn it to 0\.37 N m at most, or snug by hand with no torque given/); assert.equal(turn[0].values.most, 0.37);
    assert.match(said('fasten.seat')[0].text, /turned by hand to 1 N m, it clamps with about 833\.3 N/); assert.ok(!/the screw clamps/.test(said('fasten.seat')[0].text));
    assert.ok(r.order.some((l) => /M6x17 hex printed\) with a 10 mm socket or spanner turned by hand, to 1 N m and no further \(a printed bolt, turned by hand, not tightened\)/.test(l)), JSON.stringify(r.order));
    // Turned to the most it names, 0.37 N m: 0.37 / (0.2 × 0.006) = 308.3 N, 2.03 times under 625.2 N, so it passes
    write({ torque: turn[0].values.most }); r = probe();
    assert.deepEqual(said('fasten.torque').map((x) => [x.level, x.values.margin]), [['pass', 2.03]], 'the most it names passes its own check');
    // 0.3 N m: 250 N, 2.5 times under 625.2 N, so it passes
    write({ torque: 0.3 }); r = probe();
    assert.deepEqual(said('fasten.torque').map((x) => [x.level, x.values.margin]), [['pass', 2.5]]);
    assert.match(said('fasten.torque')[0].text, /turned by hand to 0\.3 N m, it clamps with about 250 N .*: 2\.5 times under the 625\.2 N it breaks at \(tension\)/);
  } finally { done(); }
});

// cad's tests of the edit commands: cad set, cad add, cad new, cad move and cad remove, and JSON kept as it was. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace } from './helpers.mjs';

test('cad set refuses a value outside its range, cad add fit a part that isn\'t there; --json is JSON for rules, variants, history and export', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'home/tray');
    cad.refused(/not changed: width = -5 is outside its range/, 'set', 'home/tray', 'width=-5');
    assert.match(cad('set', 'home/tray', 'width=50'), /set width/);
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/pair.json'), JSON.stringify({ title: 'Pair', kind: 'fit', items: [{ id: 'a', object: 'tray' }, { id: 'b', object: 'tray', at: [100, 0, 0] }] }));
    cad.refused(/fit a: tray has no part "lid" \(parts: body\)/, 'add', 'fit', 'home/pair', '--a', 'a.lid', '--b', 'b.body', '--min', '0', '--max', '1');
    cad.refused(/fit a: no item "c" in home\/pair/, 'add', 'fit', 'home/pair', '--a', 'c.body', '--b', 'b.body', '--min', '0', '--max', '1');
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'a.body', '--b', 'b.body', '--min', '0', '--max', '1'), /added a fit/);
    for (const args of [['rules', 'home/tray'], ['variants', 'home/tray'], ['history', 'home/tray'], ['export', 'home/tray']]) {
      const out = cad(...args, '--json');
      assert.doesNotThrow(() => JSON.parse(out), `${args.join(' ')} --json: ${out}`);
    }
    assert.ok(JSON.parse(cad('export', 'home/tray', '--json')).file.endsWith('.3mf'));
  } finally { done(); }
});

test('cad set and cad add: edits that keep the file as it was, and refuse to break it', async () => {
  const { setAt, appendAt } = await import('../lib/jsonedit.mjs');
  const t = '{\n  "variables": {\n    "w": { "value": 10, "unit": "mm" },\n    "r": {\n      "value": 2,\n      "rule": "Two × one"\n    }\n  },\n  "fits": []\n}\n';
  const u = setAt(t, ['variables', 'w', 'value'], 12);
  assert.equal(u, t.replace('"value": 10', '"value": 12'), 'only the value changes');
  assert.match(appendAt(setAt(t, ['variables', 'h'], { value: 3, unit: 'mm', rule: 'Height' }), ['fits'], { a: 'a', b: 'b', poses: ['x'] }),
    /"h": \{\n      "value": 3,[\s\S]*"fits": \[\n    \{\n      "a": "a",\n      "b": "b",\n      "poses": \["x"\]\n    \}\n  \]/);
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    const f = path.join(ws, 'projects/bathroom/objects/soap-tray.json'), before = fs.readFileSync(f, 'utf8');
    const name = JSON.parse(cad('values', 'bathroom/soap-tray', '--json')).values.find((v) => typeof v.value === 'number' && !v.expr).name;
    const tw = JSON.parse(before).variables[name].tweak, to = tw ? Math.min(tw.max, Math.max(tw.min, 7)) : 7; // (within its range: a value outside it is refused)
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=${to}`), new RegExp(`set ${name}`));
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, to);
    cad.refused(/not changed: .*no rule "nope"/, 'set', 'bathroom/soap-tray', `${name}=x1c.nope`);
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, to, 'a bad edit leaves the file as it was');
    cad.refused(/has no variable "extra" \(add it with --new/, 'set', 'bathroom/soap-tray', 'extra=1');
    assert.match(cad('set', 'bathroom/soap-tray', 'extra=1', '--new', '--unit', 'mm', '--rule', 'A test'), /set extra/);
    assert.equal(fs.readFileSync(f, 'utf8').split('\n').slice(0, 3).join('\n'), before.split('\n').slice(0, 3).join('\n'), 'the rest of the file is untouched');
    fs.mkdirSync(path.join(ws, 'projects/bathroom/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/bathroom/assemblies/two.json'), JSON.stringify({ title: 'Two', items: [{ id: 'a', object: 'soap-tray' }] }, null, 2));
    assert.match(cad('add', 'item', 'bathroom/two', '--id', 'b', '--object', 'soap-tray', '--at', '100,0,0'), /added an item/);
    assert.match(cad('add', 'fit', 'bathroom/two', '--a', 'a', '--b', 'b', '--min', '1', '--note', 'Apart'), /added a fit/);
    cad.refused(/fits\[1\]: needs "b"/, 'add', 'fit', 'bathroom/two', '--a', 'a', '--min', '1');
    assert.match(cad('check', 'bathroom/two'), /Apart: not near each other/);
  } finally { done(); }
});

test('workspace edits: cad new makes a project and an assembly, cad set, cad move and cad remove change them, each checked first, refused by name with nothing written, with --dry-run and --json', () => {
  const { ws, cad, done } = workspace();
  const file = (f) => path.join(ws, 'projects', f), read = (f) => fs.readFileSync(file(f), 'utf8'), json = (...a) => JSON.parse(cad(...a, '--json'));
  const refused = (r, code) => { assert.notEqual(r.status, 0, `an edit that should be refused exited 0:\n${r.out}`); const e = r.json?.error; assert.equal(e?.code, code, r.out); return e; };
  try {
    // a project: its project.json, laid out as the edits lay one out; PLA unless given
    assert.match(cad('new', 'frame', '--title', 'A box frame', '--printer', 'x1c'), /projects\/frame\/project\.json\n {2}made projects\/frame\/project\.json\n {2}✓ matches the project schema\n {2}✓ prints are checked against x1c/);
    assert.deepEqual(JSON.parse(read('frame/project.json')), { $schema: 'https://jonibach.github.io/rulecad/schemas/project.schema.json', name: 'frame', title: 'A box frame', printer: 'x1c', material: 'PLA', objects: [] });
    refused(cad.run('new', 'frame', '--json'), 'project.exists');
    // run again with the fields it has, it changes nothing and says so; with one that differs, refused by name
    const again = json('new', 'frame', '--printer', 'x1c', '--material', 'pla');
    assert.deepEqual([again.written, again.changes, again.findings.map((f) => [f.level, f.code, f.text])], [false, [], [['pass', 'project.exists', 'projects/frame/project.json is already there with material PLA and printer x1c: nothing to change']]]);
    assert.equal(refused(cad.run('new', 'frame', '--material', 'PETG', '--title', 'A box', '--json'), 'project.exists').message, 'projects/frame/project.json is already there with title A box frame and material PLA, so --title A box and --material PETG would change it: change them with cad set frame title="A box" material=PETG');
    refused(cad.run('new', 'shed', '--printer', 'nope', '--json'), 'project.printer');
    assert.ok(!fs.existsSync(file('shed')), 'a refused project is not made');
    const p = json('new', 'shed', '--dry-run');
    assert.deepEqual([p.command, p.file, p.written, p.dryRun, p.changes[0].op, p.changes[0].after.name, p.findings[0].code], ['new', 'projects/shed/project.json', false, true, 'make', 'shed', 'schema']);
    assert.ok(!fs.existsSync(file('shed')), 'a dry run writes nothing');
    // the project's own fields
    const before = read('frame/project.json');
    const m = json('set', 'frame', 'material=PETG', 'description=Four posts and two rings');
    assert.deepEqual(m.changes.map((c) => [c.path, c.before, c.after]), [['material', 'PLA', 'PETG'], ['description', undefined, 'Four posts and two rings']]);
    assert.deepEqual(m.findings.map((f) => [f.level, f.code]), [['pass', 'schema'], ['pass', 'project.printer'], ['pass', 'project.material']]);
    assert.equal(read('frame/project.json').split('\n').slice(0, 4).join('\n'), before.split('\n').slice(0, 4).join('\n'), 'the lines it did not change are as they were');
    refused(cad.run('set', 'frame', 'objects=[a]', '--json'), 'edit.address');
    cad.refused(/a project has no field "colour" \(fields: title, description, material, printer, filaments\)/, 'set', 'frame', 'colour=red');
    // a plastic no fitting could be sized from is refused: every frame command reads it as it builds the joins
    const petg = read('frame/project.json');
    assert.match(refused(cad.run('set', 'frame', 'material=nylon', '--json'), 'project.material').message, /^project frame: its material is "nylon", and printed fittings are sized from their plastic's strength, modulus and density/);
    assert.equal(read('frame/project.json'), petg, 'refused: nothing written');
    refused(cad.run('new', 'nyl', '--material', 'nylon', '--json'), 'project.material');
    assert.ok(!fs.existsSync(file('nyl')), 'a refused project is not made');
    // an empty assembly that checks
    const e = json('new', 'frame/empty', '--assembly', '--title', 'Nothing yet');
    assert.deepEqual([e.file, e.written, e.changes[0].after], ['projects/frame/assemblies/empty.json', true, { $schema: 'https://jonibach.github.io/rulecad/schemas/assembly.schema.json', title: 'Nothing yet', kind: 'fit', items: [] }]);
    assert.doesNotMatch(cad('check', 'frame/empty'), /✗/);
    refused(cad.run('new', 'frame/empty', '--assembly', '--json'), 'assembly.exists');
    cad.refused(/an assembly's kind is fit \(got "mechanism"\): a mechanism is a fit with joints/, 'new', 'frame/arm', '--assembly', '--kind', 'mechanism');
    // one in a project not made yet makes the project first; a refused one makes neither
    cad.refused(/^not made: frame: a portal stands in one plane/, 'new', 'bench/portal', '--assembly', '--frame', 'portal', '--inside', '300,200', '--profile', '2020-misumi-hfs5');
    assert.ok(!fs.existsSync(file('bench')), 'refused: no project, no assembly');
    const portal = json('new', 'bench/portal', '--assembly', '--frame', 'portal', '--inside', '300,200', '--profile', '2020-misumi-hfs5', 'frame.supports["z1.a"]=fixed', 'frame.supports["z2.a"]=fixed');
    assert.deepEqual(portal.made, ['projects/bench/project.json', 'projects/bench/assemblies/portal.json']);
    assert.deepEqual(JSON.parse(read('bench/assemblies/portal.json')).frame.supports, { 'z1.a': 'fixed', 'z2.a': 'fixed' });
    // a generated box: what it expands into is said as it is made
    const box = json('new', 'frame/box', '--assembly', '--title', 'Box frame', '--frame', 'box', '--inside', '300,300,350', '--profile', '2020-misumi-hfs5', '--join', 'blind', '--feet', 'levelling');
    const gen = box.findings.find((f) => f.code === 'frame.generated');
    assert.deepEqual([gen.level, gen.values.outside, gen.values.beams, gen.values.joins], ['pass', [340, 340, 408.5], 12, 16], '350 + 2 x 20 + 18.5 = 408.5 mm uprights, 12 beams and 16 joins');
    assert.match(read('frame/assemblies/box.json'), /"inside": \[300, 300, 350\],/, 'a short list of numbers on one line, as people write them');
    // cad set: a string standing for its kind takes a field of its own; a generated beam is named as that
    const s = json('set', 'frame/box', 'frame.join.fitting=printed', 'frame.feet=foot');
    assert.deepEqual(s.changes.map((c) => [c.op, c.path, c.after]), [['set', 'frame.join.fitting', 'printed'], ['set', 'frame.feet', 'foot']]);
    assert.deepEqual(JSON.parse(read('frame/assemblies/box.json')).frame.join, { kind: 'blind', fitting: 'printed' });
    assert.match(cad('set', 'frame/box', 'frame.join=bracket', '--dry-run'), /dry run, nothing written: projects\/frame\/assemblies\/box\.json\n {2}would be set frame\.join: \{"kind":"blind","fitting":"printed"\} → "bracket"/);
    assert.equal(JSON.parse(read('frame/assemblies/box.json')).frame.join.kind, 'blind', 'the dry run wrote nothing');
    const kept = read('frame/assemblies/box.json');
    cad.refused(/^not changed: frame: a box: an end-tap join's M6 screw/, 'set', 'frame/box', 'frame.join=end-tap', 'frame.profile=2020-bosch'); // a frame the generator refuses
    assert.equal(read('frame/assemblies/box.json'), kept, 'and nothing written');
    cad.refused(/x1 is made by frame\/box's generated frame \(a box\), so it is not in the file to change: .*cad frame frame\/box --expand/, 'set', 'frame/box', 'x1.at=[0,0,0]');
    refused(cad.run('set', 'frame/box', 'nope.at=1', '--json'), 'edit.address');
    refused(cad.run('set', 'frame/box', 'frame.inside=[300,300]', '--json'), 'frame.refused');
    // cad add names a generated frame's beams: a load, and a guide with its fields as field=value
    assert.match(cad('add', 'load', 'frame/box', '--mass', '5', '--at', 'x3.top@50%', '--note', 'On the top front beam'), /added a load to projects\/frame\/assemblies\/box\.json \(loads\.0\)/);
    const g = json('add', 'guide', 'frame/box', '--kind', 'rail', 'rail=rail-mgn12', 'carriage=MGN12H', 'on=x3.top', 'from=25', 'length=250', 'nut=drop-in');
    assert.deepEqual(g.added, { kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12H', on: 'x3.top', from: 25, length: 250, nut: 'drop-in' });
    cad.refused(/guide on: no beam "q9" in frame\/box \(beams: z1, z2, z3, z4, x1, x2, y1, y2, x3, x4, y3, y4\)/, 'add', 'guide', 'frame/box', '--kind', 'rail', 'on=q9.top');
    assert.match(cad('add', 'join', 'frame/box', '--kind', 'blind', '--a', 'x1.a', '--b', 'z1.back@100'), /added a join/, 'a join may name the generated beams');
    // beams of its own: a join that uses one keeps it, named
    cad('new', 'frame/tee', '--assembly');
    cad('add', 'beam', 'frame/tee', '--id', 'x1', '--profile', '2020-misumi-hfs5', '--from', '0,10,10', '--to', '300,10,10');
    cad('add', 'beam', 'frame/tee', '--id', 'y1', '--profile', '2020-misumi-hfs5', '--from', '120,20,10', '--to', '120,220,10');
    cad('add', 'join', 'frame/tee', '--kind', 'blind', '--a', 'y1.a', '--b', 'x1.back@120');
    const tee = read('frame/assemblies/tee.json');
    const r = refused(cad.run('remove', 'frame/tee', 'x1', '--json'), 'edit.referenced');
    assert.equal(r.message, 'x1 is named by joins.0 (blind y1.a to x1.back@120): remove it first, or add --with-refs to remove it with x1');
    assert.deepEqual(r.refs, ['joins.0 (blind y1.a to x1.back@120)']);
    assert.equal(read('frame/assemblies/tee.json'), tee, 'refused: nothing written');
    const w = json('remove', 'frame/tee', 'x1', '--with-refs');
    assert.deepEqual(w.changes.map((c) => [c.path, c.because]), [['items.0', undefined], ['joins.0', 'names x1']]);
    const left = JSON.parse(read('frame/assemblies/tee.json'));
    assert.deepEqual([left.items.map((x) => x.id), left.joins], [['y1'], []]);
    // a field, and a guide whose going would rename the guides after it
    cad.refused(/has no y1\.roll to remove/, 'remove', 'frame/tee', 'y1.roll');
    cad('add', 'beam', 'frame/tee', '--id', 'x2', '--profile', '2020-misumi-hfs5', '--from', '0,10,10', '--to', '300,10,10', '--roll', '90');
    assert.deepEqual(json('remove', 'frame/tee', 'x2.roll').changes.map((c) => [c.op, c.path, c.before]), [['remove', 'items.1.roll', 90]]);
    cad('add', 'guide', 'frame/tee', '--kind', 'rods', 'on=x2.top', 'from=100', 'length=150');
    cad('add', 'guide', 'frame/tee', '--kind', 'screw', 'guide=g1', 'screw=t8-screw', 'motor.model=nema17');
    cad.refused(/guides\.0 goes before guides\.1, which has no id of its own and so is named by place: g2 would become g1/, 'remove', 'frame/tee', 'guides.0', '--with-refs');
    cad('set', 'frame/tee', 'guides.0.id=rods', 'guides.1.id=drive', 'guides.1.guide=rods');
    cad.refused(/rods is named by guides\.1 \(screw\): remove it first/, 'remove', 'frame/tee', 'rods'); // the screw guide drives the rods
    // cad move: a beam placed by its ends moves both; an item to an address; a beam is not put at an address
    const mv = json('move', 'frame/tee', 'y1', '--at', '150,20,10');
    assert.deepEqual(mv.changes.map((c) => [c.path, c.after]), [['items.0.from', [150, 20, 10]], ['items.0.to', [150, 220, 10]]], 'end b keeps its offset: 120 + 30 = 150 and 220');
    cad('add', 'item', 'frame/tee', '--id', 'cap', '--at', '0,0,0', 'fitting.kind=end-cap', 'fitting.profile=2020-misumi-hfs5');
    assert.deepEqual(json('move', 'frame/tee', 'cap', '--to', 'y1.b').changes.map((c) => [c.path, c.before, c.after]), [['items.2.at', [0, 0, 0], 'y1.b']]);
    cad.refused(/item at: no item "q1" in frame\/tee/, 'move', 'frame/tee', 'cap', '--to', 'q1.b');
    cad.refused(/y1 is a beam placed by its two ends: move it with --at x,y,z/, 'move', 'frame/tee', 'y1', '--to', 'x2.top@50%');
    assert.match(cad('move', 'frame/tee', 'rods', '--at', '120'), /set guides\.0\.from: 100 → 120/, 'a guide along its face');
  } finally { done(); }
});

test('workspace edits: an edit that leaves another entry naming what is gone is refused by name (a beam renamed or removed, a frame changed or removed, guides renumbered), as are a joint\'s and a pose\'s missing names and frame options that would be dropped', () => {
  const { ws, cad, done } = workspace();
  const file = (f) => path.join(ws, 'projects', f), read = (f) => fs.readFileSync(file(f), 'utf8');
  const refused = (r, code) => { assert.notEqual(r.status, 0, `an edit that should be refused exited 0:\n${r.out}`); const e = r.json?.error; assert.equal(e?.code, code, r.out); return e; };
  try {
    cad('new', 'frm');
    // a table with a beam of its own, a join from it to a generated leg and a load on it
    cad('new', 'frm/tbl', '--assembly', '--frame', 'table', '--inside', '300,300,300', '--profile', '2020-misumi-hfs5', '--join', 'blind');
    cad('add', 'beam', 'frm/tbl', '--id', 'brace-1', '--profile', '2020-misumi-hfs5', '--from', '0,20,100', '--to', '300,20,100');
    cad('add', 'join', 'frm/tbl', '--kind', 'blind', '--a', 'brace-1.a', '--b', 'z1.front@50');
    cad('add', 'load', 'frm/tbl', '--mass', '1', '--at', 'brace-1.top@50%');
    const tbl = read('frm/assemblies/tbl.json');
    // the beam renamed: the join and the load still name brace-1
    const a = refused(cad.run('set', 'frm/tbl', 'brace-1.id=brace-2', '--json'), 'edit.dangling');
    assert.equal(a.message, 'not changed: the edit leaves joins.0 (join a: no beam "brace-1" in frm/tbl), loads.0 (load at: no item "brace-1" in frm/tbl) naming what is no longer there: change or remove them first');
    assert.deepEqual(a.refs, ['joins.0', 'loads.0']);
    // no longer a beam: the join needs one
    assert.deepEqual(refused(cad.run('remove', 'frm/tbl', 'brace-1.beam', '--json'), 'edit.dangling').refs, ['joins.0']);
    // the frame taken out: its leg z1 goes with it
    assert.match(refused(cad.run('remove', 'frm/tbl', 'frame', '--json'), 'edit.dangling').message, /joins\.0 \(join b: no beam "z1" in frm\/tbl\)/);
    assert.equal(read('frm/assemblies/tbl.json'), tbl, 'each refused: nothing written');
    // a box's guide on its top beam x3; a table has no x3
    cad('new', 'frm/bx', '--assembly', '--frame', 'box', '--inside', '300,300,300', '--profile', '2020-misumi-hfs5', '--join', 'blind');
    cad('add', 'guide', 'frm/bx', '--kind', 'rail', 'id=rr', 'rail=rail-mgn12', 'on=x3.top', 'length=200');
    assert.match(refused(cad.run('set', 'frm/bx', 'frame.kind=table', '--json'), 'edit.dangling').message, /guides\.0 \(guide on: no beam "x3" in frm\/bx\)/);
    assert.match(cad('set', 'frm/bx', 'frame.kind=shelf'), /set frame\.kind: "box" → "shelf"/, 'a shelf keeps x3: the edit goes through');
    // a name already missing before the edit is left to cad check, and does not stop an edit elsewhere
    const bx = JSON.parse(read('frm/assemblies/bx.json'));
    fs.writeFileSync(file('frm/assemblies/bx.json'), JSON.stringify({ ...bx, loads: [{ mass: 1, at: 'q9.top@50%' }] }, null, 2));
    assert.match(cad('set', 'frm/bx', 'title=Shelf'), /set title/);
    // guides by place: taking out r1 (it has an id) renames the rods (g2 to g1) and the screw (g3 to g2), which then
    // names itself as the guide it drives
    cad('new', 'frm/gd', '--assembly', '--frame', 'table', '--inside', '300,300,300', '--profile', '2020-misumi-hfs5', '--join', 'blind');
    cad('add', 'guide', 'frm/gd', '--kind', 'rail', 'id=r1', 'rail=rail-mgn12', 'on=x1.top', 'length=200');
    cad('add', 'guide', 'frm/gd', '--kind', 'rods', 'on=x2.top', 'from=60', 'length=150');
    cad('add', 'guide', 'frm/gd', '--kind', 'screw', 'guide=g2', 'screw=t8-screw', 'motor.model=28byj48');
    const gd = read('frm/assemblies/gd.json');
    assert.equal(refused(cad.run('remove', 'frm/gd', 'r1', '--json'), 'edit.renumber').message, 'r1 goes before guides.1, guides.2, which have no id of their own and so are named by place: g2 would become g1, g3 would become g2. Give them ids first (cad set frm/gd guides.1.id=g2)');
    cad.refused(/guide g3: it names itself as the guide it drives/, 'set', 'frm/gd', 'guides.2.guide=g3');
    assert.equal(read('frm/assemblies/gd.json'), gd, 'refused: nothing written');
    // a joint's parent and child, and a pose's joints, are names in the assembly too
    cad('new', 'frm/odd', '--assembly');
    cad('add', 'item', 'frm/odd', '--id', 'b', '--object', 'nothing');
    cad.refused(/joint ghostj parent: no item "nope" in frm\/odd \(items: b\)/, 'add', 'joint', 'frm/odd', '--id', 'ghostj', '--type', 'revolute', '--parent', 'nope.x', '--child', 'b.a');
    cad.refused(/joint j2 follow: no joint "nope" in frm\/odd \(joints: none\)/, 'add', 'joint', 'frm/odd', '--id', 'j2', '--type', 'revolute', '--parent', 'b.x', '--child', 'b.a', '--follow', 'nope');
    cad.refused(/pose bad: no joint "nope" in frm\/odd \(joints: none\)/, 'add', 'pose', 'frm/odd', '--name', 'bad', 'nope=45');
    assert.equal(JSON.parse(read('frm/assemblies/odd.json')).joints, undefined, 'refused: nothing written');
    // field=value straight after --assembly is a field, not --assembly's value
    cad('new', 'frm/a1', '--assembly', 'title=Hello');
    assert.equal(JSON.parse(read('frm/assemblies/a1.json')).title, 'Hello');
    // frame options are applied or refused, never dropped
    const box = ['--assembly', '--frame', 'box', '--inside', '300,300,300', '--profile', '2020-misumi-hfs5'];
    cad.refused(/--fitting says how the join is made: give the join's kind with it, as --join blind/, 'new', 'frm/f6', ...box, '--fitting', 'printed');
    assert.deepEqual(JSON.parse(cad('new', 'frm/f7', ...box, '--join', 'bracket', '--screw', 'M5', '--dry-run', '--json')).changes.at(-1).after.frame.join, { kind: 'bracket', screw: 'M5' });
    cad.refused(/--inside is a frame option: give --frame box\|portal\|table\|gantry\|shelf with it/, 'new', 'frm/f8', '--assembly', '--inside', '300,300,300');
    assert.deepEqual(fs.readdirSync(file('frm/assemblies')).sort(), ['a1.json', 'bx.json', 'gd.json', 'odd.json', 'tbl.json']);
  } finally { done(); }
});

test('workspace edits: a wire\'s ends and route, a loop\'s anchors, a load\'s joint and a mount\'s beam are names checked as a join\'s are, and cad new <project>/<assembly> makes its project with the material and printer given', async () => {
  const { ws, cad, done } = workspace();
  const file = (f) => path.join(ws, 'projects', f), read = (f) => fs.readFileSync(file(f), 'utf8');
  const refused = (r, code) => { assert.notEqual(r.status, 0, `an edit that should be refused exited 0:\n${r.out}`); const e = r.json?.error; assert.equal(e?.code, code, r.out); return e; };
  try {
    cad('new', 'q/m', '--assembly');
    cad('add', 'beam', 'q/m', '--id', 'a1', '--profile', '2020-misumi-hfs5', '--from', '0,0,0', '--to', '200,0,0');
    cad('add', 'beam', 'q/m', '--id', 'b2', '--profile', '2020-misumi-hfs5', '--from', '0,100,0', '--to', '200,100,0');
    const m = read('q/assemblies/m.json');
    // each kind of entry, added with a name that is not there: refused by name, nothing written
    assert.equal(refused(cad.run('add', 'wire', 'q/m', 'id=w2', 'from=nope.a', 'to=b2.b', '--json'), 'edit.part').message, 'wire w2 from: no item "nope" in q/m (items: a1, b2)');
    assert.equal(refused(cad.run('add', 'loop', 'q/m', 'a=ghost.a', 'b=b2.b', '--json'), 'edit.part').message, 'loop a: no item "ghost" in q/m (items: a1, b2)');
    assert.equal(refused(cad.run('add', 'load', 'q/m', 'joint=nojoint', 'torque=2', '--json'), 'edit.part').message, 'load joint: no joint "nojoint" in q/m (joints: none)');
    assert.equal(refused(cad.run('add', 'item', 'q/m', 'id=psu', 'bought=supply-24v', 'mount.on=nope.top@50', '--json'), 'edit.part').message, 'item psu mount on: no beam "nope" in q/m (beams: a1, b2)');
    assert.equal(read('q/assemblies/m.json'), m, 'each refused: nothing written');
    // a wire on a1, routed along b2's slot: its route's names are checked too
    assert.match(cad('add', 'wire', 'q/m', 'id=w1', 'from=a1.a', 'to=b2.b'), /the names in wires\.0 are all in q\/m/);
    cad.refused(/wire w1 via: no joint "ghost" in q\/m, and an anchor is <item>\.<anchor>/, 'set', 'q/m', 'wires.0.via=["ghost"]');
    cad.refused(/wire w1 via along: no beam "zz" in q\/m/, 'set', 'q/m', 'wires.0.via=[{"along":"zz.top","from":10,"to":50}]');
    cad('set', 'q/m', 'wires.0.via=[{"along":"b2.top","from":10,"to":50}]');
    // renaming either beam leaves the wire naming what is gone
    const w = read('q/assemblies/m.json');
    assert.deepEqual(refused(cad.run('set', 'q/m', 'a1.id=a9', '--json'), 'edit.dangling').refs, ['wires.0']);
    assert.match(refused(cad.run('set', 'q/m', 'b2.id=b9', '--json'), 'edit.dangling').message, /wires\.0 \(wire w1 to: no item "b2" in q\/m\)/);
    assert.equal(read('q/assemblies/m.json'), w, 'refused: nothing written');
    // a repeated item's copies (key-0, key-1) are names a fit can give, as a guide's own parts are
    cad('add', 'item', 'q/m', '--id', 'key', '--object', 'nothing', 'repeat.x.count=2', 'repeat.x.step=20');
    assert.match(cad('add', 'fit', 'q/m', '--a', 'key-1', '--b', 'a1', '--min', '0'), /the names in fits\.0 are all in q\/m/);
    // a name that only starts with an item's id and a dash is not that item's: rail makes no copies, so rail-3 is no name
    // in the assembly, on add and when a rename leaves a wire naming it (rail-2 is an item, never rail's copy)
    cad('new', 'p-1/m', '--assembly');
    cad('add', 'beam', 'p-1/m', '--id', 'rail', '--profile', '2020-misumi-hfs5', '--from', '0,0,0', '--to', '200,0,0');
    cad('add', 'beam', 'p-1/m', '--id', 'rail-2', '--profile', '2020-misumi-hfs5', '--from', '0,100,0', '--to', '200,100,0');
    const pm = read('p-1/assemblies/m.json');
    assert.equal(refused(cad.run('add', 'wire', 'p-1/m', 'id=w1', 'from=rail-3.a', 'to=rail.b', '--json'), 'edit.part').message, 'wire w1 from: no item "rail-3" in p-1/m (items: rail, rail-2)');
    assert.equal(read('p-1/assemblies/m.json'), pm, 'refused: nothing written');
    cad('add', 'wire', 'p-1/m', 'id=w5', 'from=rail-2.a', 'to=rail.b');
    const pw = read('p-1/assemblies/m.json');
    assert.match(refused(cad.run('set', 'p-1/m', 'rail-2.id=r2', '--json'), 'edit.dangling').message, /wires\.0 \(wire w5 from: no item "rail-2" in p-1\/m\)/);
    assert.equal(read('p-1/assemblies/m.json'), pw, 'refused: nothing written');
    // the names the build does make, each by its maker's pattern
    const { madeBy } = await import('../lib/edit.mjs');
    const mb = madeBy({ items: [{ id: 'rail', beam: {} }, { id: 'key', repeat: {} }, { id: 'psu', mount: {} }, { id: 'front', panel: {} }, { id: 'foot', fitting: { kind: 'levelling-foot' } }, { id: 'cap', fitting: { kind: 'end-cap' } }], guides: ['g1'], wires: ['w1'], joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.back@120' }] });
    assert.deepEqual(['key-0', 'key-0-3', 'psu-mount', 'psu-mount-2', 'front-clip', 'front-clip-3', 'front-hinge-1', 'front-leaf-2', 'front-handle', 'front-latch', 'front-catch', 'foot-pad', 'y1-x1-bracket', 'y1-x1-gusset-2', 'w1-clip', 'w1-clip-2', 'g1-carriage-1', 'g1-wheel-4', 'g1-holder-a', 'g1-endstop-mount', 'g1-rod-2', 'g1-belt', 'g1-idler-block'].filter((n) => !mb.item(n)), []);
    assert.deepEqual(['rail-3', 'rail-mount', 'key-a', 'key-0-x', 'psu-3', 'front-1', 'cap-pad', 'x1-y1-bracket', 'y1-x1-2', 'w1-2', 'g1-2', 'g1-carriage', 'g1-wheel'].filter((n) => mb.item(n)), []);
    assert.deepEqual([mb.joint('g1-1'), mb.joint('front-hinge'), mb.joint('front-bay'), mb.joint('g1-carriage-1'), mb.joint('key-1'), mb.joint('rail-hinge')], [true, true, true, false, false, false]);
    // the project an assembly makes takes the material and printer given, checked as cad new <project> checks them
    cad('new', 'q5/a', '--assembly', '--material', 'PETG', '--printer', 'x1c');
    const p5 = JSON.parse(read('q5/project.json'));
    assert.deepEqual([p5.material, p5.printer], ['PETG', 'x1c']);
    assert.equal(refused(cad.run('new', 'q6/a', '--assembly', '--material', 'nylon', '--json'), 'project.material').code, 'project.material');
    assert.ok(!fs.existsSync(file('q6')), 'refused: no project made');
    assert.equal(refused(cad.run('new', 'q5/b', '--assembly', '--material', 'PLA', '--printer', 'x1c', '--json'), 'project.exists').message, 'projects/q5/project.json is already there with material PETG, so --material PLA would change it: change it with cad set q5 material=PLA');
    assert.ok(!fs.existsSync(file('q5/assemblies/b.json')), 'refused: no assembly made');
    // the project's own material and printer again: the assembly is made, the project left as it was
    const p5text = read('q5/project.json'), b = JSON.parse(cad('new', 'q5/b', '--assembly', '--material', 'petg', '--printer', 'x1c', '--json'));
    assert.deepEqual([b.written, b.made, read('q5/project.json') === p5text], [true, ['projects/q5/assemblies/b.json'], true]);
    assert.ok(b.findings.some((f) => f.code === 'project.exists' && f.level === 'pass' && f.text === 'projects/q5/project.json is already there with material PETG and printer x1c: nothing to change'), JSON.stringify(b.findings));
    // and the change paths of an assembly that makes its project are both from the workspace
    assert.deepEqual(JSON.parse(cad('new', 'q7/a', '--assembly', '--json')).changes.map((c) => c.path), ['projects/q7/project.json', 'projects/q7/assemblies/a.json']);
  } finally { done(); }
});

test('edits to JSON keep its line endings and indentation, and say when it isn\'t JSON', async () => {
  const { setAt } = await import('../lib/jsonedit.mjs');
  const crlf = '{\r\n\t"name": "x",\r\n\t"variables": {\r\n\t\t"w": { "value": 1 }\r\n\t}\r\n}\r\n';
  const out = setAt(crlf, ['variables', 'd'], { value: 3, deep: { a: 1 } });
  assert.equal(out, '{\r\n\t"name": "x",\r\n\t"variables": {\r\n\t\t"w": { "value": 1 },\r\n\t\t"d": {\r\n\t\t\t"value": 3,\r\n\t\t\t"deep": {\r\n\t\t\t\t"a": 1\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n}\r\n');
  assert.throws(() => setAt('{ "name": "hook", ', ['a'], 1), /not valid JSON/, 'not a scan that never ends');
});

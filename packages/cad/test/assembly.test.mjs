// cad's tests of assemblies: objects that read each other, poses, joints, engagement, bought bearings and rods, anchors turned. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, object, BOX, BIN } from './helpers.mjs';

test('objects read each other: a frame sized from a plate follows it, versions are checked, and loops are named', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/plate', { variables: { w: { value: 40, unit: 'mm', rule: 'Plate width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } } }, BOX);
    object(ws, 'demo/frame', { uses: ['demo/plate@^0.1.0'], variables: {
      w: { value: 'plate.w + 2', unit: 'mm', rule: 'Round the plate' }, d: { value: 'plate.d + 2', unit: 'mm', rule: 'Round the plate' }, h: { value: 'plate.h', unit: 'mm', rule: 'As thick' } } }, BOX);
    assert.match(cad('check', 'demo/frame'), /42 × 22 × 2 mm/);
    assert.match(cad('rules', 'demo/frame'), /plate\.w.*demo\/plate@0\.1\.0/);
    const pj = path.join(ws, 'projects/demo/objects/plate.json'), plate = JSON.parse(fs.readFileSync(pj, 'utf8'));
    fs.writeFileSync(pj, JSON.stringify({ ...plate, variables: { ...plate.variables, w: { ...plate.variables.w, value: 50 } } }));
    assert.match(cad('check', 'demo/frame'), /52 × 22 × 2 mm/, 'the frame follows the plate');
    fs.writeFileSync(pj, JSON.stringify({ ...plate, version: '1.0.0' }));
    cad.refused(/uses demo\/plate \^0\.1\.0, but demo\/plate is 1\.0\.0/, 'check', 'demo/frame');
    fs.writeFileSync(pj, JSON.stringify({ ...plate, uses: ['demo/frame'] }));
    cad.refused(/read each other's numbers/, 'check', 'demo/frame');
  } finally { done(); }
});

test('a pose that sets an item\'s variables: the part drawn that way in that pose, as printed in the others', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 40, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } };
    object(ws, 'demo/base', { variables: vars }, BOX);
    object(ws, 'demo/post', { variables: { ...vars, h: { value: 10, unit: 'mm', rule: 'Height', tweak: { min: 1, max: 30 } } } }, BOX);
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    // The post stands on the base; a block 8 mm up only clears it while the post is pressed down to 5 mm
    const write = (poses) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/press.json'), JSON.stringify({ title: 'Press', kind: 'fit',
      items: [{ id: 'base', object: 'base' }, { id: 'post', object: 'post', at: [0, 0, 'base.h'] }, { id: 'stop', object: 'base' }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { at: [0, 0, 8], axis: [0, 0, 1] }, child: { item: 'stop', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 50 }], poses }));
    write({ pressed: { slide: 0, 'post.h': 5 }, free: { slide: 0 } });
    const out = cad.refused(/free: post\.body and stop\.body overlap/, 'check', 'demo/press');
    assert.match(out, /2 poses checked: pressed, free/);
    assert.match(out, /free: post\.body and stop\.body overlap/, 'as printed, the post reaches the stop');
    assert.doesNotMatch(out, /pressed: post\.body and stop\.body overlap/, 'pressed, it clears it');
    assert.match(cad('check', 'demo/press', '--pose', 'pressed'), /no parts overlap/);
    write({ pressed: { slide: 0, 'post.h': 'base.h * 2' } }); // an expression in the assembly's names
    assert.match(cad('check', 'demo/press'), /no parts overlap/);
    // Its link opens free, and carries the post's pressed shape for the page to swap in when the pose is picked
    write({ free: { slide: 0 }, pressed: { slide: 0, 'post.h': 5 } });
    const lib = path.join(path.dirname(BIN), '../lib/');
    const out2 = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly } from ${JSON.stringify(pathToFileURL(lib + 'assembly.mjs').href)};
      import { assemblyModel } from ${JSON.stringify(pathToFileURL(lib + 'links.mjs').href)};
      import { encode, decode, partsOf, posesOf } from '@rulecad/model-link';
      const m = await decode(await encode(await assemblyModel(await buildAssembly('demo/press'), { title: 'Press' })));
      console.log(JSON.stringify({ parts: partsOf(m).map((p) => p[0]), poses: posesOf(m).map((x) => x.part[0]), swap: m.motion.swap, pose: m.motion.pose }));`], { cwd: ws, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out2), { parts: ['base.body', 'post.body', 'stop.body'], poses: ['post.body@pressed'], swap: { pressed: [[1, 3]] }, pose: 'free' });
  } finally { done(); }
});

test('joints: a lid on a hinge, checked in each pose, swept for collisions, with a follower closing a loop', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 40, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } };
    object(ws, 'demo/base', { variables: vars, anchors: { hinge: { at: [0, 'd / 2', 'h'], axis: [1, 0, 0] } } }, BOX);
    object(ws, 'demo/lid', { variables: vars, anchors: { hinge: { at: [0, 'd / 2', 0], axis: [1, 0, 0] } } }, BOX);
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const box = (extra = {}, fits = []) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', fits,
      items: [{ id: 'base', object: 'base' }, { id: 'lid', object: 'lid' }, { id: 'tab', object: 'lid' }, { id: 'spare', assembly: 'spare', at: [100, 0, 0] }],
      joints: [{ id: 'hinge', type: 'revolute', parent: 'base.hinge', child: 'lid.hinge', min: -180, max: 30, label: 'Lid' },
        { id: 'tab', type: 'revolute', parent: { item: 'base', at: ['base.w', 'base.d / 2', 'base.h'], axis: [1, 0, 0] }, child: 'tab.hinge', min: -180, max: 30, follow: 'hinge', ...extra }],
      loops: [{ a: { item: 'lid', at: ['lid.w', '-lid.d / 2', 0], axis: [1, 0, 0] }, b: { item: 'tab', at: [0, '-tab.d / 2', 0], axis: [1, 0, 0] }, label: 'Lid and tab line up' }],
      poses: { closed: { hinge: 0 }, open: { hinge: -90 } } }));
    // A component with no poses of its own: the box's poses still apply (--pose isn't asked of the component)
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/spare.json'), JSON.stringify({ title: 'Spare', kind: 'fit', items: [{ id: 'lid', object: 'lid' }] }));
    box();
    const checked = cad('check', 'demo/box');
    assert.match(checked, /no parts overlap/);
    assert.match(checked, /2 poses checked: closed, open/);
    assert.match(checked, /Lid and tab line up: closed/);
    assert.doesNotMatch(checked, /✗|fail/i);
    cad.refused(/sweep hinge, -180 to 30° in 7 steps: at 30°: base\.body hits lid\.body/, 'check', 'demo/box', '--sweep', '--steps', '7');
    assert.match(cad('check', 'demo/box', '--pose', 'open'), /Box \(open\)/);
    // A fit near an anchor (only the faces within 3 mm of base@hinge), and findings that say which anchor they're near
    box({}, [{ a: 'base@hinge', b: 'lid', within: 3, min: 5, note: 'Lid clear of the hinge' }]);
    const nearOut = cad('check', 'demo/box', '--pose', 'closed', '--json'), near = JSON.parse(nearOut).findings?.find((x) => x.text.startsWith('Lid clear of the hinge'));
    assert.ok(near, nearOut);
    assert.equal(near.level, 'warn'); assert.equal(near.refs.near.endsWith('@hinge'), true); assert.ok(near.at);
    box();
    cad.refused(/no pose "wide"/, 'check', 'demo/box', '--pose', 'wide');
    // The library, as a program uses it: progress while it builds and sweeps, and the joints' data for the page
    const lib = path.join(path.dirname(BIN), '../lib/assembly.mjs');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly, sweep, motionData } from ${JSON.stringify(pathToFileURL(lib).href)};
      const seen = [];
      const s = await buildAssembly('demo/box', [], {}, { progress: (e) => seen.push(e.stage) });
      sweep(s, { steps: 4, progress: (e) => seen.push(e.stage) });
      const m = motionData(s);
      console.log(JSON.stringify({ build: seen.filter((x) => x === 'build').length, sweep: seen.filter((x) => x === 'sweep').length, joints: m.motion.joints.length }));`], { cwd: ws, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), { build: 5, sweep: 5, joints: 2 }); // four items, and the spare component's own one
    box({ ratio: 2 }); // the tab turns twice as far: the loop comes apart once open
    cad.refused(/open: .*Lid and tab line up: apart/, 'check', 'demo/box');
    box({ type: 'ball' });
    cad.refused(/joint tab \(ball\) takes 3 values, but follows hinge \(revolute\), which takes 1/, 'check', 'demo/box');
  } finally { done(); }
});

test('engage: a sleeve seated over a post passes; resting on the post\'s end, touching and not overlapping, it fails', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'shaft/post', { variables: { r: { value: 2, unit: 'mm', rule: 'Post' }, h: { value: 10, unit: 'mm', rule: 'Post' } }, anchors: { top: { at: [0, 0, 'h'], axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: v.r, height: v.h, center: [0, 0, v.h / 2] }) }\n");
    const sleeve = (anchorAt) => object(ws, 'shaft/sleeve', { variables: { r: { value: 4, unit: 'mm', rule: 'Sleeve' }, hole: { value: 2.2, unit: 'mm', rule: 'Round the post' }, t: { value: 4, unit: 'mm', rule: 'Sleeve' } }, anchors: { seat: { at: [0, 0, anchorAt], axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nconst { cylinder } = jscad.primitives\nexport function main (v) { return jscad.booleans.subtract(cylinder({ radius: v.r, height: v.t, center: [0, 0, v.t / 2] }), cylinder({ radius: v.hole, height: v.t, center: [0, 0, v.t / 2] })) }\n");
    fs.mkdirSync(path.join(ws, 'projects/shaft/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/shaft/assemblies/pair.json'), JSON.stringify({ title: 'Sleeve on a post', kind: 'fit',
      items: [{ id: 'post', object: 'post' }, { id: 'sleeve', object: 'sleeve' }],
      joints: [{ id: 'on', type: 'fixed', parent: 'post.top', child: 'sleeve.seat' }],
      fits: [{ a: 'sleeve', b: 'post', engage: 'sleeve.t', note: 'Sleeve over the post' }] }));
    sleeve(0); // its anchor on its bottom face: it stands on the post's end
    const resting = cad.refused('✗ Sleeve over the post: not on at all', 'check', 'shaft/pair');
    assert.match(resting, /no parts overlap/, 'touching end to end overlaps nothing');
    assert.match(resting, /✗ Sleeve over the post: not on at all \(end to end\) along their joint, where it should go 4 mm on/);
    sleeve('t'); // its anchor on its top face: it goes down over the post
    assert.match(cad('check', 'shaft/pair'), /✓ Sleeve over the post: 4 mm on along their joint/);
  } finally { done(); }
});

test('joint.running: a child turning on a printed pin, against the printer\'s fit, less what a bore prints small by', async () => {
  const { runningGap } = await import('../lib/seats.mjs');
  const jscad = (await import('@jscad/modeling')).default, { cylinder } = jscad.primitives, { subtract } = jscad.booleans, { geom3 } = jscad.geometries;
  const tris = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]].map((v) => [...v])));
  const pin = (d, z0 = 0, z1 = 8) => tris(cylinder({ radius: d / 2, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 64 }));
  const ring = (bore, od, z0, z1) => tris(subtract(cylinder({ radius: od / 2, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 64 }), cylinder({ radius: bore / 2, height: z1 - z0 + 2, center: [0, 0, (z0 + z1) / 2], segments: 64 })));
  const g = runningGap(pin(2.79), ring(3, 12, 1, 6));
  assert.ok(Math.abs(g.gap - 0.105) < 0.005, `the gear card's pegs: ${g.gap}`);
  assert.equal(g.pinOn, 'a');
  assert.ok(Math.abs(g.length - 5) < 1, 'as far as they share');
  const round = runningGap(ring(3, 12, 1, 6), pin(2.79));
  assert.equal(round.pinOn, 'b', 'either way round');
  assert.equal(runningGap(pin(2.79), ring(8, 12, 1, 6)), null, 'room, not a running fit');
  assert.equal(runningGap(pin(2.79, 0, 1), ring(3, 12, 2, 6)), null, 'nothing shared along the axis');
  assert.equal(runningGap(ring(3, 12, 0, 5), ring(3, 12, 0, 5)), null, 'two bores: nothing turns on a pin');
});

test('a bought bearing: placed from its set, turning a shaft, its printed seat read as drawn; an unknown part refused by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['housing'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/housing.json'), JSON.stringify({ name: 'housing', title: 'Housing', version: '0.1.0', uses: ['x1c'], engine: 'manifold', anchors: { seat: { at: [0, 0, 'tall - depth'], axis: [0, 0, 1] } }, variables: { tall: { value: 12, unit: 'mm', rule: 'Tall' }, depth: { value: 7, unit: 'mm', rule: 'Depth' }, off: { value: 0, unit: 'mm', rule: 'How far the pocket is from its fit', tweak: { min: -1, max: 1 } } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/housing.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nconst bearing = { bore: 8, outer_diameter: 22, width: 7 }\nexport function main (v) {\n  const seat = v.shapes.bearingSeat(bearing, { fit: v.off ? -0.05 + v.off : 'press', printer: v.x1c, at: [0, 0, v.tall], into: '-z', relief: 2, through: true })\n  return v.ops.subtract(cuboid({ size: [34, 34, v.tall], center: [0, 0, v.tall / 2] }), seat)\n}\n");
    const a = { title: 'Seat', kind: 'fit', items: [{ id: 'housing', object: 'housing' }, { id: 'b1', bought: 'bearing-608', at: [0, 0, 5] }], fits: [{ a: 'b1', b: 'housing', seat: 'press', fastens: true }] };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    const check = (o) => { const r = cad.run('check', 'home/seat', ...(o ?? []), '--json').json; assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    let f = check();
    assert.deepEqual(f.filter((x) => x.level === 'fail').map((x) => x.text), []);
    const seat = f.filter((x) => x.code === 'fit.seat');
    assert.equal(seat[0].level, 'pass'); assert.match(seat[0].text, /bearing-608 \(22 mm\) in a pocket drawn 22\.0\d+ mm, a press fit/);
    assert.equal(seat[1].level, 'pass'); assert.match(seat[1].text, /lip stops the outer race/);
    assert.equal(f.find((x) => x.code === 'bought.item').refs.set, 'bearing-608');
    a.items[0].set = { off: -0.3 }; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    f = check().filter((x) => x.code === 'fit.seat');
    assert.equal(f[0].level, 'fail'); assert.match(f[0].text, /0\.3\d? mm too small: it will not press in/);
    assert.match(cad('list', 'home/seat'), /1 ×\s+bearing-608\s+a bearing/);
    a.items[1].bought = 'bearing-999'; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    cad.refused(/no bought part "bearing-999" \(.*bearing-608/, 'check', 'home/seat');
  } finally { done(); }
});

test('a rod and a linear bushing are bought items, cut to the length set on the item', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/rod.json'), JSON.stringify({ title: 'Rod', kind: 'fit', items: [{ id: 'rod', bought: 'rod-8', set: { length: 123 } }, { id: 'bush', bought: 'lm8uu', at: [0, 0, 10] }], fits: [{ a: 'rod', b: 'bush', fastens: true, min: -1000 }] }));
    const out = cad('list', 'home/rod');
    assert.match(out, /rod-8/); assert.match(out, /lm8uu/);
    assert.match(cad('check', 'home/rod'), /123 mm|rod-8/);
  } finally { done(); }
});

test('a cylinder at an anchor with a rotate lies along the anchor\'s turned z, as an assembly reads it, and one turned off x, y and z is refused', () => {
  const { ws, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'rot');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'rot', objects: ['block'] }));
    // Hand turns (rotate is degrees about x, then y, then z, applied to the anchor's z, [0, 0, 1]):
    // [90, 0, 0] about x takes z to (0, -sin 90, cos 90) = (0, -1, 0), along y; [0, 90, 0] about y takes it to
    // (sin 90, 0, cos 90) = (1, 0, 0), along x; [45, 0, 0] gives (0, -0.707, 0.707), along none of them
    fs.writeFileSync(path.join(project, 'objects', 'block.json'), JSON.stringify({ name: 'block', version: '0.1.0',
      variables: { turn: { value: 90 } },
      anchors: { side: { at: [10, 0, 5], rotate: ['turn', 0, 0] }, end: { at: [0, 0, 5], rotate: [0, 90, 0] }, slant: { at: [5, 0, 5], rotate: [45, 0, 0] } } }));
    fs.writeFileSync(path.join(project, 'objects', 'block.js'), "import jscad from '@jscad/modeling'\nexport function main () { return jscad.primitives.cuboid({ size: [20, 10, 10] }) }\n");
    const base = { title: 'A bracket on the block', uses: ['x1c'], material: 'pla', cell: 1, volume: 0.5, steps: 10,
      space: { at: [5, 0, 5], size: [20, 10, 10] }, loads: [{ at: [14, 0, 5], r: 1, force: [0, 0, -10] }] };
    fs.writeFileSync(path.join(project, 'problems', 'turned.json'), JSON.stringify({ ...base,
      supports: [{ anchor: 'block.side', r: 1.6, length: 10 }], keep: [{ anchor: 'block.end', r: 3, length: 4 }] }));
    fs.writeFileSync(path.join(project, 'problems', 'slant.json'), JSON.stringify({ ...base, supports: [{ anchor: 'block.slant', r: 1.6, length: 10 }] }));
    const read = (ref) => execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readProblem } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
      try { const r = await readProblem('rot', ${JSON.stringify(ref)}); console.log(JSON.stringify(r.problem)); } catch (e) { console.log(JSON.stringify({ error: e.message })); }
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } });
    const p = JSON.parse(read('turned'));
    assert.deepEqual([p.supports[0].axis, p.supports[0].at], ['y', [10, 0, 5]], 'turned 90 degrees about x (a variable): along y, not the unturned z');
    assert.deepEqual([p.keep[0].axis, p.keep[0].at], ['x', [0, 0, 5]], 'turned 90 degrees about y: along x');
    assert.match(JSON.parse(read('slant')).error, /the anchor "block\.slant" points along \[0, -0\.707, 0\.707\], not along x, y or z: give the cylinder an axis/);
  } finally { done(); }
});

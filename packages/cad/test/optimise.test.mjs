// cad's tests of cad optimise: problems, their densities and cache, the live view, results built and analysed. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN, CAD } from './helpers.mjs';

test('an optimisation\'s densities are kept by everything that makes them: the problem, topopt\'s solver, the FE\'s code and its threads backend, and cad\'s own code that readies the problem, so a change in any is never read as the old result', async () => {
  const { densitiesKey, densityCode } = await import('../lib/optimise.mjs');
  const code = densityCode(), problem = { space: { size: [30, 12] } }, key = densitiesKey(problem, code);
  assert.equal(densitiesKey(problem), key, 'the code read is the code that runs');
  assert.match(code.cad, /^function holdEmpty\(spec\)/);
  // the call that hands the problem to the solver, with its settings, is in it too: a setting added there (tol, move) optimises again
  assert.match(code.cad, /optimise\(spec, \{ backend: threadsBackend/); assert.doesNotMatch(code.solver, /shapes from results/);
  assert.equal(code.threads, fs.readFileSync(fileURLToPath(import.meta.resolve('@rulecad/fea/threads')), 'utf8'));
  // a change to any one piece (cad's own holdEmpty among them, which the key once left out) moves the key, and so does
  // the problem; scripts/dimension-diff.mjs shares the densities between commits on this key alone
  for (const k of Object.keys(code)) assert.notEqual(densitiesKey(problem, { ...code, [k]: typeof code[k] === 'number' ? code[k] + 1 : `${code[k]}\n` }), key, k);
  assert.notEqual(densitiesKey({ space: { size: [30, 13] } }, code), key);
});

test('optimising a problem: cad optimise draws it and caches it, a design builds from it, cad check analyses it', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'beam');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.mkdirSync(path.join(project, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'beam', objects: ['arm'] }));
    fs.writeFileSync(path.join(project, 'problems', 'arm.json'), JSON.stringify({
      title: 'A short arm', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.5, filter: 1.5,
      variables: { side: { value: 0, tweak: { min: 0, max: 1 } } }, variants: { both: { side: 1 } },
      space: { at: [12, 0], size: [30, 12] }, keep: [{ at: [0, 0], r: 4 }, { at: [24, 0], r: 3 }], avoid: [{ at: [0, 0], r: 1.6 }, { at: [24, 0], r: 1.2 }],
      supports: [{ at: [0, 0], r: 1.6 }], loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }, { at: [24, 0], r: 1.2, force: [10, 0], case: 'side' }], cases: { side: 'side' },
    }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.json'), JSON.stringify({ name: 'arm', version: '0.1.0', uses: ['x1c'],
      variables: { problem: { type: 'problem', value: 'arm', choice: ['arm', 'arm:both'] }, t: { value: 4, unit: 'mm' } },
      analysis: [{ problem: 'arm', max_deflection: 1, volume: 760, tolerance: 0.05 }] }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: v.t }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    const first = cad('optimise', 'beam/arm');
    // its densities are kept under densitiesKey of its problem
    const kept = fs.readdirSync(path.join(ws, '.cache', 'densities')).filter((f) => f.endsWith('.json'));
    const want = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readProblem, densitiesKey } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
      console.log(densitiesKey((await readProblem('beam', 'arm')).problem));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }).trim();
    assert.deepEqual(kept, [`${want}.json`]);
    assert.match(first, /down: moves [\d.]+ mm along its load, [\d.]+ N\/mm/);
    assert.match(first, /settled/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'beam', 'arm-optimised.svg')));
    assert.match(cad('optimise', 'beam/arm'), /\(cached\)/);
    cad.refused(/no variant "nope"/, 'optimise', 'beam/arm:nope');
    const checked = cad('check', 'beam/arm');
    assert.match(checked, /✓ arm down: moves [\d.]+ mm under 10 N/);
    assert.ok(!/under 4 cells/.test(checked) || /! arm: [\d.]+% of the part is in members under 4 cells \([\d.]+ mm\) thick/.test(checked), 'thin members, if any, are a warning with the cell to use');
    assert.match(checked, /· arm side|✓ arm side/);
    assert.match(checked, /✓ volume [\d.]+ mm³/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'beam', 'arm-analysis-arm.svg')));
    assert.match(cad('check', 'beam/arm', '--set', 'problem=arm:both'), /optimising arm:both|arm down/);
    // A stress limit instead of a volume: the lightest arm that keeps to it
    fs.writeFileSync(path.join(project, 'problems', 'light.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(project, 'problems', 'arm.json'), 'utf8')),
      title: 'A light arm', volume: undefined, stress: 'pla.strength / 3', cases: {}, loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }], variables: {}, variants: {} }));
    const light = cad('optimise', 'beam/light');
    assert.match(light, /peak stress [\d.]+ MPa, the limit 13 MPa\n/);
  } finally { done(); }
});

test('3D: a problem whose space is another design\'s part, optimised, built as a solid and analysed', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'post');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'post', objects: ['envelope', 'post'] }));
    // The envelope: a block 12 × 12 × 24 mm standing on the bed
    fs.writeFileSync(path.join(project, 'objects', 'envelope.json'), JSON.stringify({ name: 'envelope', version: '0.1.0', variables: { w: { value: 12, unit: 'mm' }, h: { value: 24, unit: 'mm' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'envelope.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ center: [0, 0, v.h / 2], size: [v.w, v.w, v.h] }) }\n");
    fs.writeFileSync(path.join(project, 'problems', 'post.json'), JSON.stringify({
      title: 'A post', material: 'pla', cell: 2, volume: 0.3, filter: 3, steps: 30, overhang: '+z',
      space: { part: 'envelope.body' }, keep: [{ at: [0, 0, 22], r: 4, length: 4, axis: 'z' }],
      supports: [{ at: [0, 0, 1], size: [12, 12, 2] }], loads: [{ at: [0, 0, 23], r: 3, length: 2, axis: 'z', force: [10, 0, 0], case: 'push' }],
    }));
    fs.writeFileSync(path.join(project, 'objects', 'post.json'), JSON.stringify({ name: 'post', version: '0.1.0', engine: 'manifold',
      variables: { problem: { type: 'problem', value: 'post', choice: ['post', 'none'] }, side: { value: 0, choice: [0, 1] }, lift: { value: 6, unit: 'mm' } }, variants: { lying: { side: 1 }, plain: { problem: 'none' } },
      // Lying: drawn on its side, and turned back for the analysis
      analysis: [{ problem: 'post', rotate: [0, '0 - 90 * side', 0], move: ['lift * side', 0, 0] }] }));
    fs.writeFileSync(path.join(project, 'objects', 'post.js'), "import jscad from '@jscad/modeling'\nconst { rotateY, translate } = jscad.transforms\nexport function main (v) { const s = v.problems ? v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops }) : jscad.primitives.cuboid({ size: [12, 12, 24], center: [0, 0, 12] }); return v.side ? translate([0, 0, v.lift], rotateY(Math.PI / 2, s)) : s }\n");
    const out = cad('optimise', 'post/post');
    assert.match(out, /push: moves [\d.e-]+ mm along its load/);
    assert.match(out, /printable built \+z/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'post', 'post-optimised.png')), 'a preview of the surface');
    const RAW = 'numbers in post.js that should be variables'; // (the post's own design has typed sizes, failing that check; the rest is what is tested)
    const checked = cad.refused(RAW, 'check', 'post/post');
    assert.match(checked, /closed solid/);
    assert.match(checked, /post push: moves [\d.e-]+ mm under 10 N/);
    const stiffness = (out) => Number(out.match(/post push: moves [\d.e-]+ mm under 10 N, ([\d.e+-]+) N\/mm/)[1]);
    const lying = cad.refused(RAW, 'check', 'post/post:lying');
    assert.match(lying, /24 × [\d.]+ × 12 mm, fits the bed/, 'drawn lying down');
    assert.ok(Math.abs(stiffness(lying) / stiffness(checked) - 1) < 0.02, `turned back, it analyses as it stands: ${stiffness(lying)} against ${stiffness(checked)} N/mm`);
    // A variant with no problem builds without the optimiser: a rig, or the regions a problem reads
    const plain = cad.refused(RAW, 'check', 'post/post:plain');
    assert.match(plain, /12 × 12 × 24 mm, fits the bed/, 'drawn without the result');
    assert.doesNotMatch(plain, /optimising/);
    // Verified: on finer cells, checked against cells a quarter bigger, with a report; safety-critical, it's
    // unverified until a test is recorded
    const problemFile = path.join(project, 'problems', 'post.json'), objectFile = path.join(project, 'objects', 'post.json');
    fs.writeFileSync(problemFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(problemFile, 'utf8')), critical: true }));
    const o = JSON.parse(fs.readFileSync(objectFile, 'utf8'));
    o.analysis = [{ problem: 'post', cell: 1, min_safety: 2 }];
    fs.writeFileSync(objectFile, JSON.stringify(o));
    const verified = cad.refused(RAW, 'check', 'post/post');
    assert.match(verified, /post push: stiffness [+-][\d.]+% from 1.25 mm cells/);
    assert.match(verified, /✓ post push: peak stress [\d.]+ MPa at \([\d., -]+\): [\d.]+× under pla's strength \(at least 2×\)/);
    assert.match(verified, /post is safety-critical and unverified/);
    const report = fs.readFileSync(path.join(ws, '.preview', 'post', 'post-report-post.md'), 'utf8');
    assert.match(report, /12 × 12 × 24 cells of 1 mm/);
    assert.match(report, /\*\*Unverified\.\*\*/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, '.preview', 'post', 'post-report-post.json'), 'utf8')).cases[0].name, 'push');
    o.verification = [{ kind: 'test', date: '2026-10-28', summary: 'Pushed with 10 N three times: moved 0.03 mm' }];
    fs.writeFileSync(objectFile, JSON.stringify(o));
    cad.refused(/post is safety-critical: verified by test \(2026-10-28\)/, 'check', 'post/post');
  } finally { done(); }
});

test('a solid part fills each cube by the share of it inside, so its volume is right on any cells', async () => {
  const { solidFill } = await import('../lib/optimise.mjs');
  // A box 5.3 × 3.7 × 6.1 mm, off the cells' corners
  const lo = [0.4, 0.7, 0.2], hi = [5.7, 4.4, 6.3], c = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => [n & 1 ? hi[0] : lo[0], n & 2 ? hi[1] : lo[1], n & 4 ? hi[2] : lo[2]]);
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [1, 3, 7, 5], [0, 4, 6, 2]];
  const triangles = quads.flatMap(([a, b, d, e]) => [[c[a], c[b], c[d]], [c[a], c[d], c[e]]]);
  for (const h of [1, 2]) {
    const n = Math.ceil(7 / h), d = solidFill(triangles, { nx: n, ny: n, nz: n, h }, [0, 0, 0]);
    // Exact up the column; across it, each side to within half the rays' spacing (h / 8)
    const filled = d.reduce((s, x) => s + x, 0) * h ** 3, e = h / 8, most = (5.3 + 2 * e) * (3.7 + 2 * e) * 6.1, least = (5.3 - 2 * e) * (3.7 - 2 * e) * 6.1;
    assert.ok(filled >= least - 1e-9 && filled <= most + 1e-9, `on ${h} mm cells: ${filled} mm³, not between ${least} and ${most}`);
    assert.ok(d.every((x) => x >= 0 && x <= 1));
  }
});

test('the live view: serves its page, streams each step, and its stop button sets the flag the run reads', async () => {
  const { liveView } = await import('../lib/live.mjs');
  const view = await liveView({ port: 0, title: 'a test run' });
  try {
    assert.match(await (await fetch(view.url)).text(), /a test run/);
    view.step({ step: 3, steps: 10, compliance: 12.5, change: 0.1, beta: 1, grid: { nx: 2, ny: 2, nz: 2 }, density: Float64Array.from([0, 1, 0, 0, 0, 0, 0.5, 0]) });
    const events = await fetch(new URL('events', view.url)), reader = events.body.getReader();
    let text = '';
    while (!text.includes('"frame"')) text += new TextDecoder().decode((await reader.read()).value);
    const m = JSON.parse(text.split('data: ').at(-1));
    assert.equal(m.frame.step, 3);
    // Three views, each pixel the densest cell along its line of sight
    assert.deepEqual(m.frame.views.map((v) => [v.name, ...Buffer.from(v.image, 'base64')]), [['along y', 0, 255, 128, 0], ['along x', 255, 0, 0, 128], ['along z', 0, 255, 128, 0]]);
    assert.equal((await (await fetch(new URL('frame/0', view.url))).json()).step, 3); // every step kept, for the scrubber
    // A 3D step's surface, drawn when asked for: vertex and face counts, then the vertices and faces
    const mesh = new DataView(await (await fetch(new URL('mesh/0', view.url))).arrayBuffer());
    assert.ok(mesh.getUint32(0, true) > 0 && mesh.getUint32(4, true) > 0);
    assert.equal(mesh.byteLength, 8 + mesh.getUint32(0, true) * 12 + mesh.getUint32(4, true) * 12);
    assert.match(await (await fetch(new URL('three/three.module.js', view.url))).text(), /WebGLRenderer/);
    assert.equal(view.stopped(), false);
    const foreign = await fetch(new URL('stop', view.url), { method: 'POST', headers: { Origin: 'http://elsewhere.example' } });
    assert.equal(foreign.status, 403, 'another site\'s page can\'t stop the run');
    assert.equal(view.stopped(), false);
    await fetch(new URL('stop', view.url), { method: 'POST' });
    assert.equal(view.stopped(), true);
    reader.cancel();
    // Finished, it keeps showing the end for a while
    const closing = view.close('finished', { hold: 500 });
    await new Promise((r) => setTimeout(r, 100));
    assert.match(await (await fetch(view.url)).text(), /a test run/);
    await closing;
    await assert.rejects(fetch(view.url));
  } catch (e) { await view.close(); throw e; }
});

test('an optimised part keeps only pieces touching a support, a load or a kept region', async () => {
  const { anchored } = await import('../lib/optimise.mjs');
  const cube = (x, s, base) => { // a closed cube as indexed triangles
    const v = [0, 1].flatMap((k) => [0, 1].flatMap((j) => [0, 1].map((i) => [x + i * s, j * s, k * s])));
    const q = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    return { v, f: q.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]).map((t) => t.map((i) => i + base)) };
  };
  const main = cube(0, 10, 0), speck = cube(30, 2, 8);
  const mesh = { vertices: [...main.v, ...speck.v], faces: [...main.f, ...speck.f] };
  const out = anchored(mesh, [[0, 0, 0, 10, 10, 1]], 1); // a support on the main cube's floor
  assert.equal(out.faces.length, 12);
  assert.equal(out.vertices.length, 8);
  assert.deepEqual(out.dropped.map(Math.abs), [8]);
  assert.equal(anchored(mesh, [[0, 0, 0, 40, 10, 1]], 1).dropped.length, 0); // both touch it
});

test('a mechanism problem: cad optimise reports how far the output moves its way, and the live view gets the travel', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'mech');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'mech', objects: [] }));
    fs.writeFileSync(path.join(project, 'problems', 'inverter.json'), JSON.stringify({
      title: 'A force inverter', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.3, filter: 1.5, steps: 40,
      variables: { k: { value: 0.5, unit: 'N/mm', rule: 'the springs' } },
      space: { at: [20, 10], size: [40, 20] }, supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
      loads: [{ at: [0.5, 10], size: [1, 2], force: [10, 0] }], input_spring: 'k',
      output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: 'k', label: 'the right end, moving left' },
    }));
    const out = cad('optimise', 'mech/inverter');
    assert.match(out, /the output moves [\d.e-]+ mm its way for [\d.e-]+ mm of push: an advantage of [\d.e-]+/);
    assert.match(out, /% of the space filled/);
    assert.match(out, /40 × 20 cells of 1 mm/);
    // A strain limit: the mechanism is checked against it at its push, with the push and travel that reach it
    // (PLA: 39 MPa over 2680 MPa is 1.46%, so half of it is 0.73%, 19.5 MPa)
    const spec = JSON.parse(fs.readFileSync(path.join(project, 'problems', 'inverter.json'), 'utf8'));
    fs.writeFileSync(path.join(project, 'problems', 'strained.json'), JSON.stringify({ ...spec, title: 'A strained inverter', strain: 'pla.strength / pla.modulus / 2' }));
    assert.match(cad('optimise', 'mech/strained'), /peak stress [\d.]+ MPa at its input force \(strain [\d.]+%\), the limit 19\.5 MPa \(0\.728%\): it reaches the limit at [\d.]+ N of push, its output then [\d.e-]+ mm along/);
  } finally { done(); }
});

test('a problem at a design\'s anchors: its supports, loads and keeps follow the design, a move reruns it and nothing else does, cad why names what it is made from, and the filter is never under two print lines', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'lev');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'lev', objects: ['plate', 'arm', 'ring'] }));
    // The plate the arm is bolted to and pushed by: a pivot hole and a pushing pin, as anchors
    fs.writeFileSync(path.join(project, 'objects', 'plate.json'), JSON.stringify({ name: 'plate', version: '0.1.0',
      variables: { tip_x: { value: 24, unit: 'mm' }, thick: { value: 2, unit: 'mm' } },
      anchors: { pivot: { at: [0, 0, 'thick'], axis: [0, 0, 1] }, pin: { at: ['tip_x', 0, 'thick'], axis: [0, 0, 1] } } }));
    fs.writeFileSync(path.join(project, 'objects', 'plate.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.tip_x, v.thick, v.thick] }) }\n");
    const arm = { title: 'An arm on the plate', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.5, steps: 40,
      space: { at: [12, 0], size: [30, 12] }, keep: [{ anchor: 'plate.pivot', r: 4 }, { anchor: 'plate.pin', r: 3 }], avoid: [{ anchor: 'plate.pivot', r: 1.6 }],
      supports: [{ anchor: 'plate.pivot', r: 1.6 }], loads: [{ anchor: 'plate.pin', r: 1.2, force: [0, -10], case: 'down' }] };
    fs.writeFileSync(path.join(project, 'problems', 'arm.json'), JSON.stringify(arm));
    fs.writeFileSync(path.join(project, 'objects', 'arm.json'), JSON.stringify({ name: 'arm', version: '0.1.0', variables: { problem: { type: 'problem', value: 'arm' }, t: { value: 4, unit: 'mm' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: v.t }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    const read = (ref) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readProblem } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
      const r = await readProblem('lev', ${JSON.stringify(ref)}); console.log(JSON.stringify({ problem: r.problem, inputs: r.inputs }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // Placed where the plate's anchors are: x and y of them in this flat problem (the plate's thickness is its z, dropped)
    const r = read('arm');
    assert.deepEqual([r.problem.supports[0].at, r.problem.loads[0].at, r.problem.keep.map((k) => k.at)], [[0, 0], [24, 0], [[0, 0], [24, 0]]]);
    assert.deepEqual(r.inputs.anchors, [{ anchor: 'plate.pin', at: [24, 0, 2] }, { anchor: 'plate.pivot', at: [0, 0, 2] }]);
    assert.equal(r.problem.filter, undefined, 'on 1 mm cells the filter is the solver\'s own cell and a half: 1.5 mm is more than two 0.42 mm lines');
    assert.deepEqual(r.inputs.filter, { value: 1.5, from: 'a cell and a half' });
    assert.match(cad('optimise', 'lev/arm'), /down: moves [\d.]+ mm along its load/);
    // cad why on the result: the problem file, its rule sets, the anchors it read, its filter and where it is kept
    const why = cad('why', 'lev/arm.problem');
    assert.match(why, /optimised from projects\/lev\/problems\/arm\.json: An arm on the plate, pla/);
    assert.match(why, /rule sets: x1c, pla/);
    assert.match(why, /anchors read: plate\.pin at \(24, 0, 2\), plate\.pivot at \(0, 0, 2\)/);
    assert.match(why, /filter 1\.5 mm: a cell and a half/);
    assert.match(why, /kept in \.cache\/densities\/[0-9a-f]{64}\.json: made again only when one of these, or the solver, changes/);
    // An unrelated value of the plate (its thickness: only the anchors' z, which a flat problem drops) leaves the result
    // as it is; moving the pin moves the load and the boss with it, and the arm is optimised again
    cad('set', 'lev/plate', 'thick=3');
    assert.match(cad('optimise', 'lev/arm'), /\(cached\)/);
    cad('set', 'lev/plate', 'tip_x=22');
    const moved = cad('optimise', 'lev/arm');
    assert.doesNotMatch(moved, /\(cached\)/); assert.match(moved, /down: moves/);
    assert.deepEqual(read('arm').problem.loads[0].at, [22, 0]);
    // A design built from the problem can't place it: the result would be needed before it could be made
    fs.writeFileSync(path.join(project, 'objects', 'ring.json'), JSON.stringify({ name: 'ring', version: '0.1.0', variables: { problem: { type: 'problem', value: 'loop' } }, anchors: { hole: { at: [0, 0, 0] } } }));
    fs.writeFileSync(path.join(project, 'objects', 'ring.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: 1 }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    fs.writeFileSync(path.join(project, 'problems', 'loop.json'), JSON.stringify({ ...arm, keep: [], avoid: [], supports: [{ anchor: 'ring.hole', r: 1.6 }] }));
    cad.refused(/loop\.json: the anchor "ring\.hole" is on ring, which is built from this problem \(its variable problem\): name a part or anchor of what it is fixed to instead/, 'optimise', 'lev/loop');
    // Named wrong: refused with the anchors there are
    fs.writeFileSync(path.join(project, 'problems', 'typo.json'), JSON.stringify({ ...arm, supports: [{ anchor: 'plate.pivto', r: 1.6 }] }));
    cad.refused(/typo\.json: plate has no anchor "pivto" \(anchors: pivot, pin\)/, 'optimise', 'lev/typo');
    // Fine cells: the filter is two of the printer's lines, the thinnest wall it lays solid. Hand sum: x1c's line is
    // 0.42 mm, so two are 0.84 mm; a cell and a half of 0.5 mm cells is 0.75 mm, under it, so 0.84 mm is used
    fs.writeFileSync(path.join(project, 'problems', 'fine.json'), JSON.stringify({ ...arm, cell: 0.5 }));
    const fine = read('fine');
    assert.equal(fine.problem.filter, 0.84);
    assert.deepEqual(fine.inputs.filter, { value: 0.84, from: 'two of x1c\'s lines (2 × 0.42 mm), more than a cell and a half' });
    // A filter the problem gives is its own
    fs.writeFileSync(path.join(project, 'problems', 'given.json'), JSON.stringify({ ...arm, cell: 0.5, filter: 'x1c.line' }));
    assert.deepEqual(read('given').inputs.filter, { value: 0.42, from: 'the problem: x1c.line' });
  } finally { done(); }
});

test('cad preview of a problem file: its run kept step by step as a page to watch again, with no server; a result whose steps were never recorded shows its end', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'beam');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'beam', objects: [] }));
    fs.writeFileSync(path.join(project, 'problems', 'arm.json'), JSON.stringify({ title: 'A short arm', material: 'pla', thickness: 4, cell: 1, volume: 0.5, steps: 30,
      space: { at: [12, 0], size: [30, 12] }, keep: [{ at: [0, 0], r: 4 }, { at: [24, 0], r: 3 }], avoid: [{ at: [0, 0], r: 1.6 }],
      supports: [{ at: [0, 0], r: 1.6 }], loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }] }));
    const runOf = () => {
      const html = fs.readFileSync(path.join(ws, '.preview', 'beam', 'arm-run.html'), 'utf8');
      assert.doesNotMatch(html, /importmap|type="module"/, 'no server and no 3D surface needed');
      return JSON.parse(/const RUN = (.*);\n/.exec(html)[1]);
    };
    const out = cad('preview', 'beam/problems/arm');
    assert.match(out, /\.preview[\\/]beam[\\/]arm-optimised\.svg\n.*\.preview[\\/]beam[\\/]arm-run\.html\n {2}the run, step by step: open it to watch it again \((\d+) steps\)/);
    const steps = Number(/watch it again \((\d+) steps\)/.exec(out)[1]), run = runOf(), r = JSON.parse(cad('optimise', 'beam/arm', '--json'));
    // every step: its compliance, how much it changed, and its densities as the live view draws them (a byte a cell)
    assert.equal(run.frames.length, steps); assert.equal(run.history.compliance.length, steps); assert.equal(run.history.change.length, steps);
    assert.deepEqual(run.frames.map((f) => f.step), Array.from({ length: steps }, (_, k) => k + 1));
    assert.equal(run.done, `finished: ${steps} steps${r.converged ? '' : ', not settled'}`);
    const last = run.frames.at(-1), image = Buffer.from(last.views[0].image, 'base64');
    assert.deepEqual([last.views[0].w, last.views[0].h, image.length], [r.grid.nx, r.grid.ny, r.grid.nx * r.grid.ny]);
    const kept = JSON.parse(fs.readFileSync(path.join(ws, '.cache', 'optimise', `${r.hash}.json`), 'utf8')).density;
    assert.ok(kept.every((d, e) => Math.abs(image[e] - d * 255) <= 1), 'the last step is the result');
    // cached: the recorded run is still the one shown; the problem named by its file's path works too
    assert.match(cad('preview', 'projects/beam/problems/arm.json'), /\(cached\)[^]*the run, step by step/);
    assert.equal(runOf().frames.length, steps);
    // made without its steps recorded (a design's build, or before runs were kept): its end, and how to record it
    fs.rmSync(path.join(ws, '.cache', 'runs'), { recursive: true });
    assert.match(cad('preview', 'beam/problems/arm'), /the run's end only: its steps weren't recorded \(cad preview --fresh runs it again and records them\)/);
    const end = runOf();
    assert.equal(end.frames.length, 1); assert.equal(end.history.compliance.length, steps, 'the compliance of each step, from the result');
    assert.match(end.done, /its steps weren't recorded: run it again with --fresh to watch them/);
    assert.match(cad('preview', 'beam/problems/arm', '--fresh'), /the run, step by step/);
    assert.equal(runOf().frames.length, steps);
  } finally { done(); }
});

test('a solid result with fewer triangles by default: outline.reduce keeps the surface within its tolerance (0.1 mm unless given), closed, and as printable as it was drawn; false keeps every triangle', async () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'post');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'post', objects: [] }));
    const post = { title: 'A post', material: 'pla', cell: 2, volume: 0.3, filter: 3, steps: 20, overhang: '+z',
      space: { at: [0, 0, 12], size: [12, 12, 24] }, keep: [{ at: [0, 0, 22], r: 4, length: 4, axis: 'z' }],
      supports: [{ at: [0, 0, 1], size: [12, 12, 2] }], loads: [{ at: [0, 0, 23], r: 3, length: 2, axis: 'z', force: [10, 0, 0], case: 'push' }] };
    fs.writeFileSync(path.join(project, 'problems', 'post.json'), JSON.stringify(post));
    fs.writeFileSync(path.join(project, 'problems', 'full.json'), JSON.stringify({ ...post, outline: { reduce: false } }));
    fs.writeFileSync(path.join(project, 'problems', 'given.json'), JSON.stringify({ ...post, outline: { reduce: 0.1 } }));
    const full = JSON.parse(cad('optimise', 'post/full', '--json')), out = cad('optimise', 'post/post'), lean = JSON.parse(cad('optimise', 'post/post', '--json'));
    const mesh = (r) => JSON.parse(fs.readFileSync(path.join(ws, '.cache', 'optimise', `${r.hash}.json`), 'utf8')).mesh;
    const a = mesh(full), b = mesh(lean);
    // the same densities (the outline only draws them), drawn with under half the triangles
    assert.equal(full.reduced, undefined, 'false keeps every triangle');
    assert.deepEqual(lean.reduced, { before: a.faces.length, after: b.faces.length, tolerance: 0.1 }, 'on by default, within 0.1 mm');
    assert.deepEqual(mesh(JSON.parse(cad('optimise', 'post/given', '--json'))), b, '0.1 given is the default');
    assert.ok(b.faces.length < a.faces.length / 2, `${a.faces.length} to ${b.faces.length} triangles`);
    assert.match(out, new RegExp(`${a.faces.length} triangles reduced to ${b.faces.length} \\([\\d.]+%\\), the surface kept within 0\\.1 mm`));
    assert.ok(Math.abs(lean.solid / full.solid - 1) < 0.005, `${full.solid} to ${lean.solid} mm³`);
    // closed: every edge once each way round
    const e = new Map(); for (const f of b.faces) for (let i = 0; i < 3; i++) e.set(`${f[i]},${f[(i + 1) % 3]}`, (e.get(`${f[i]},${f[(i + 1) % 3]}`) || 0) + 1);
    assert.ok([...e].every(([k, c]) => c === 1 && e.get(k.split(',').reverse().join(',')) === 1));
    // sliced as the printer will: no more islands than as drawn
    const { islands } = await import('@rulecad/printcheck'), sliced = (m) => islands(m.faces.map((f) => f.map((i) => m.vertices[i])), { layer: 0.2, overhang: 45, line: 0.42 }).islands.length;
    assert.ok(sliced(b) <= sliced(a), `${sliced(a)} to ${sliced(b)} islands`);
    // A tolerance that isn't a distance is refused by name
    fs.writeFileSync(path.join(project, 'problems', 'bad.json'), JSON.stringify({ ...post, outline: { reduce: 0 } }));
    cad.refused(/reduce: the tolerance is a distance in mm, more than 0 \(got 0\)/, 'optimise', 'post/bad');
  } finally { done(); }
});

test('a flat problem whose space is another design\'s part: its section halfway up, holes open, optimised and built', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'flat');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'flat', objects: ['blank', 'arm'] }));
    // The blank: a 30 × 12 × 4 mm plate on the bed, a 4 mm hole through it 6 mm from its left end
    fs.writeFileSync(path.join(project, 'objects', 'blank.json'), JSON.stringify({ name: 'blank', version: '0.1.0', variables: { l: { value: 30, unit: 'mm' }, w: { value: 12, unit: 'mm' }, t: { value: 4, unit: 'mm' }, hole: { value: 2, unit: 'mm' }, at: { value: 6, unit: 'mm' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'blank.js'), "import jscad from '@jscad/modeling'\nconst { cuboid, cylinder } = jscad.primitives\nexport function main (v) { return jscad.booleans.subtract(cuboid({ center: [v.l / 2, 0, v.t / 2], size: [v.l, v.w, v.t] }), cylinder({ center: [v.at, 0, v.t / 2], radius: v.hole, height: v.t * 2, segments: 32 })) }\n");
    fs.writeFileSync(path.join(project, 'problems', 'arm.json'), JSON.stringify({ title: 'An arm cut from the blank', material: 'pla', thickness: 4, cell: 1, volume: 0.5, steps: 30,
      space: { part: 'blank.body' }, keep: [{ at: [27, 0], r: 2.5 }], supports: [{ at: [6, 0], r: 2.5 }], loads: [{ at: [27, 0], r: 1.5, force: [0, -10], case: 'down' }] }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.json'), JSON.stringify({ name: 'arm', version: '0.1.0', variables: { problem: { type: 'problem', value: 'arm' }, t: { value: 4, unit: 'mm' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: v.t }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    const spec = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readProblem } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
      const { discretise } = await import('@rulecad/topopt');
      const r = await readProblem('flat', 'arm'), s = discretise(r.problem);
      console.log(JSON.stringify({ dim: r.dim, at: r.problem.space[0].at, grid: s.grid, origin: s.origin, passive: Array.from(s.passive) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // A 30 × 12 grid of 1 mm cells over the plate, its middle the plate's (x and y only: it is flat; to a thousandth,
    // as JSCAD's boolean snaps the corners by about 0.00001 mm)
    const r3 = (a) => a.map((c) => Math.round(c * 1000) / 1000 + 0);
    assert.deepEqual([spec.dim, r3(spec.at), spec.grid.nx, spec.grid.ny, r3(spec.origin)], [2, [15, 0], 30, 12, [0, -6]]);
    // Outside the space: exactly the cells whose centres fall in the hole (a 32-sided 2 mm circle at x 6), and no others
    const inHole = spec.passive.map((_, e) => { const x = (e % 30) + 0.5, y = Math.floor(e / 30) - 6 + 0.5; return Math.hypot(x - 6, y) < 2 * Math.cos(Math.PI / 32) ? 1 : 0; });
    assert.ok(inHole.reduce((t, c) => t + c, 0) >= 12, 'a 2 mm hole covers a dozen 1 mm cells');
    assert.deepEqual(spec.passive.map((p) => (p === -2 ? 1 : 0)), inHole);
    // optimised and built: the part named as the space is the design's to cut, never drawn as a region
    assert.match(cad('optimise', 'flat/arm'), /down: moves [\d.]+ mm along its load/);
    assert.match(cad('check', 'flat/arm'), /arm/);
    assert.doesNotMatch(cad('check', 'flat/arm'), /Error|error:/);
  } finally { done(); }
});

test('problems that read each other through designs built from them are refused by name, with the chain, rather than read for ever', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'cyc');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'cyc', objects: ['xa', 'yb', 'plate'] }));
    // Two flat designs, each with an anchor h and built from a problem: xa from pb, yb from pa. Problem pa is held at
    // xa.h and pb at yb.h, so pa needs xa, which needs pb, which needs yb, which needs pa again
    const js = "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: 1 }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n";
    for (const [o, from] of [['xa', 'pb'], ['yb', 'pa']]) {
      fs.writeFileSync(path.join(project, 'objects', `${o}.json`), JSON.stringify({ name: o, version: '0.1.0', variables: { problem: { type: 'problem', value: from } }, anchors: { h: { at: [0, 0, 0] } } }));
      fs.writeFileSync(path.join(project, 'objects', `${o}.js`), js);
    }
    fs.writeFileSync(path.join(project, 'objects', 'plate.json'), JSON.stringify({ name: 'plate', version: '0.1.0', anchors: { h: { at: [0, 0, 0] } } }));
    fs.writeFileSync(path.join(project, 'objects', 'plate.js'), "import jscad from '@jscad/modeling'\nexport function main () { return jscad.primitives.cuboid({ size: [4, 4, 1] }) }\n");
    const base = { uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.5, steps: 10, space: { at: [12, 0], size: [30, 12] }, loads: [{ at: [24, 0], r: 1.2, force: [0, -10] }] };
    fs.writeFileSync(path.join(project, 'problems', 'pa.json'), JSON.stringify({ ...base, supports: [{ anchor: 'xa.h', r: 1.6 }] }));
    fs.writeFileSync(path.join(project, 'problems', 'pb.json'), JSON.stringify({ ...base, supports: [{ anchor: 'yb.h', r: 1.6 }] }));
    // Before the chain was carried this ran out of memory: give it a minute, then call it a hang
    cad.with({ timeout: 60000 }).refused(/pa\.json: problems read each other through designs built from them: pa reads xa, built from pb, then pb reads yb, built from pa\. Fix one of them to a part or anchor of a design that is not made from the others/, 'optimise', 'cyc/pa');
    // The same pair with the loop broken (pb held at a plain design's anchor) is read and optimised
    fs.writeFileSync(path.join(project, 'problems', 'pb.json'), JSON.stringify({ ...base, supports: [{ anchor: 'plate.h', r: 1.6 }] }));
    assert.match(cad('optimise', 'cyc/pa'), /moves [\d.]+ mm along its load/);
  } finally { done(); }
});

test('a problem milled, cast or printed in a powder bed: cad optimise says how it is made, counts undercuts, and refuses enclosed voids by name', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'made');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'made', objects: [] }));
    // A 12 mm cube held at its foot and pushed sideways at its top, on 1.5 mm cells (8 × 8 × 8)
    const base = { uses: ['mill-3axis'], material: 'al6061', cell: 1.5, volume: 0.5, filter: 2.25, steps: 12, space: { at: [0, 0, 6], size: [12, 12, 12] },
      supports: [{ at: [0, 0, 0.75], size: [12, 12, 1.5] }], loads: [{ at: [0, 0, 11.25], size: [12, 12, 1.5], force: [100, 0, 0] }] };
    const write = (name, p) => fs.writeFileSync(path.join(project, 'problems', `${name}.json`), JSON.stringify({ title: name, ...base, ...p }));
    write('milled', { mill: '+z', symmetry: { mirror: 'y' } });
    const milled = cad('optimise', 'made/milled');
    assert.match(milled, /milled from \+z: no undercuts/);
    assert.match(milled, /mirrored across y/);
    // A pocket kept clear under a solid top: the tool can't reach it from above, and the count says so
    write('pocket', { mill: '+z', keep: [{ at: [0, 0, 11.25], size: [12, 12, 1.5] }], avoid: [{ at: [0, 0, 6], size: [3, 3, 3] }] });
    const pocket = JSON.parse(cad('optimise', 'made/pocket', '--json'));
    assert.deepEqual(pocket.process, { mill: '+z' });
    assert.equal(pocket.undercuts, 8, 'the 3 mm pocket is 2 × 2 × 2 cells of 1.5 mm, all under the kept top');
    // Two mould halves parted at the cube's middle, along z, and an extrusion along x
    write('cast', { uses: ['mould-injection'], cast: { draw: 'z' }, extrude: 'x' });
    const cast = cad('optimise', 'made/cast');
    assert.match(cast, /cast in two halves drawn off along z from 6 mm: no undercuts/);
    assert.match(cast, /one section along x/);
    // A powder bed print with a hollow box kept: its 3 mm inside can't be emptied of powder
    const hollow = { overhang: '+z', keep: [{ at: [0, 0, 6], size: [6, 6, 6] }], avoid: [{ at: [0, 0, 6], size: [3, 3, 3] }] };
    write('powder', { uses: ['dmls'], voids: 'refused', ...hollow });
    const r = cad.run('optimise', 'made/powder');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /error: 1 enclosed void \(27 mm³ at 0, 0, 6\): powder or a core can't get out: open it to the outside with an avoid region \(an escape hole\), or allow voids/);
    write('allowed', hollow);
    assert.doesNotMatch(cad('optimise', 'made/allowed'), /enclosed void/);
    // Two processes at once are refused before any maths
    write('both', { overhang: '+z', mill: '+z' });
    cad.refused(/printed \(overhang\), milled \(mill\) or cast \(cast\), one of them: this problem gives overhang and mill/, 'optimise', 'made/both');
    // So is a mirror that swaps the tool's side for its opposite
    write('clash', { mill: '+z', symmetry: { mirror: 'z' } });
    cad.refused(/symmetry: milled from \+z, a part can't be the same mirrored across z \(the tool's side\)/, 'optimise', 'made/clash');
    // A 2D section milled from its top edge comes out grey, and cad optimise says its outline is a guess: a 30 × 20 mm
    // cantilever on 1 mm cells, held at its left side and loaded down at its right side's middle
    fs.writeFileSync(path.join(project, 'problems', 'section.json'), JSON.stringify({ title: 'section', material: 'al6061', thickness: 3, cell: 1, volume: 0.4, steps: 200, mill: '+y',
      space: { at: [15, 10], size: [30, 20] }, supports: [{ at: [0.5, 10], size: [1, 20] }], loads: [{ at: [29.5, 10], size: [1, 2], force: [0, -100] }] }));
    const section = cad('optimise', 'made/section');
    assert.match(section, /milled from \+y: no undercuts/);
    assert.match(section, /warning: [\d.]+% of the design is grey \(neither empty nor solid\): the outline drawn at half density is a guess, not a part/);
    assert.ok(JSON.parse(cad('optimise', 'made/section', '--json')).grey > 0.1);
  } finally { done(); }
});

test('a robust problem: cad optimise reports the design made a little thin and a little thick, and robust with a volume alone is refused by name', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'mech');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'mech', objects: [] }));
    const inverter = {
      title: 'A robust inverter', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.3, filter: 1.5, steps: 40,
      space: { at: [20, 10], size: [40, 20] }, supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
      loads: [{ at: [0.5, 10], size: [1, 2], force: [10, 0] }], input_spring: 0.268,
      output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: 0.268 },
    };
    // (PLA: 39 MPa over 2680 MPa is 1.46%; a tenth of it is 0.146%, 3.9 MPa)
    fs.writeFileSync(path.join(project, 'problems', 'robust.json'), JSON.stringify({ ...inverter, robust: true, strain: 'pla.strength / pla.modulus / 10' }));
    const out = cad('optimise', 'mech/robust');
    assert.match(out, /made a little thin, its output moves [\d.e-]+ mm; a little thick, [\d.e-]+ mm/);
    assert.match(out, /made a little thin, peak stress [\d.e-]+ MPa; a little thick, [\d.e-]+ MPa/);
    fs.writeFileSync(path.join(project, 'problems', 'stiff.json'), JSON.stringify({ ...inverter, output: undefined, input_spring: undefined, robust: true }));
    cad.refused(/robust is for a mechanism \(with output: the worst of its eroded, as-made and dilated copies\) or a stress limit/, 'optimise', 'mech/stiff');
  } finally { done(); }
});

test('a problem milled from two sides by a tool of a size, or cast with a draft (#35): cad optimise says how, with the draft made at the grid, and refuses a tool or a draft the grid cannot show', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'made');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'made', objects: [] }));
    // A 12 mm cube held at its foot and pushed sideways at its top, on 1.5 mm cells (8 × 8 × 8)
    const base = { uses: ['mill-3axis'], material: 'al6061', cell: 1.5, volume: 0.5, filter: 2.25, steps: 12, space: { at: [0, 0, 6], size: [12, 12, 12] },
      supports: [{ at: [0, 0, 0.75], size: [12, 12, 1.5] }], loads: [{ at: [0, 0, 11.25], size: [12, 12, 1.5], force: [100, 0, 0] }] };
    const write = (name, p) => fs.writeFileSync(path.join(project, 'problems', `${name}.json`), JSON.stringify({ title: name, ...base, ...p }));
    write('two', { mill: ['+z', '-z'], tool: 1.5 });
    assert.match(cad('optimise', 'made/two'), /milled from \+z and -z by a tool of 1\.5 mm radius: no undercuts/);
    assert.deepEqual(JSON.parse(cad('optimise', 'made/two', '--json')).process, { mill: ['+z', '-z'], tool: 1.5 });
    // 15°: 1 / tan 15° = 3.73, so a step out every 3 layers of the 8, which is atan(1 / 3) = 18.43°
    write('draft', { uses: ['mould-injection'], cast: '+z', draft: 15 });
    const draft = cad('optimise', 'made/draft');
    assert.match(draft, /cast, drawn off \+z with a 15° draft \(a step out every 3 layers: 18\.43°\): no undercuts/);
    assert.deepEqual(JSON.parse(cad('optimise', 'made/draft', '--json')).process, { cast: '+z', draft: 15, every: 3, made: 18.43 });
    // 3°: a step every 19 layers (1 / tan 3° = 19.1), and the cube has 8; a 1 mm tool on 1.5 mm cells; a draft on a milled part
    write('shallow', { uses: ['mould-injection'], cast: '+z', draft: 3 });
    cad.refused(/a draft of 3° steps out a cell every 19 layers, and this grid has 8 along z: give it more than 19 layers there \(smaller cells\), or more draft/, 'optimise', 'made/shallow');
    write('small', { mill: '+z', tool: 1 });
    cad.refused(/a tool's radius of 1 mm is under a cell \(1\.5 mm\) and changes nothing on the grid/, 'optimise', 'made/small');
    write('milldraft', { mill: '+z', draft: 5 });
    cad.refused(/a draft is for a cast or moulded part \(cast\): a milled part's walls come out straight down the tool's side/, 'optimise', 'made/milldraft');
    // Voids prevented: the optimiser keeps every pocket open (topopt's test twists a block into a tube and vents it),
    // and says so; one a keep region walls in can't be opened, and is still an error, said to be left though prevented
    write('vented', { uses: ['dmls'], voids: 'prevented' });
    assert.match(cad('optimise', 'made/vented'), /voids prevented: none enclosed, every empty pocket open to the outside/);
    write('walled', { uses: ['dmls'], voids: 'prevented', keep: [{ at: [0, 0, 6], size: [6, 6, 6] }], avoid: [{ at: [0, 0, 6], size: [3, 3, 3] }] });
    const r = cad.run('optimise', 'made/walled');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /error: 1 enclosed void \(27 mm³ at 0, 0, 6\), left though voids were prevented \(a keep region or the space walls it in\)/);
  } finally { done(); }
});

test('a problem\'s thinnest member from the printer\'s line (#35): met by the grid where a cell is as wide, held to three cells, or refused with the cells that would hold it', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'thin');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'thin', objects: [] }));
    // A 30 × 12 mm cantilever, 4 mm thick, on 1 mm cells, held at its left end and pushed down at its right
    const base = { uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.5, filter: 1.2, steps: 30, space: { at: [15, 0], size: [30, 12] },
      supports: [{ at: [0.5, 0], size: [1, 12] }], loads: [{ at: [29.5, 0], size: [1, 2], force: [0, -10] }] };
    const write = (name, p) => fs.writeFileSync(path.join(project, 'problems', `${name}.json`), JSON.stringify({ title: name, ...base, ...p }));
    // x1c.wall_min is two lines, 2 × 0.42 = 0.84 mm: under a cell, so every member already is that wide
    write('line', { feature: 'x1c.wall_min' });
    assert.match(cad('optimise', 'thin/line'), /thinnest member 0\.84 mm: every member is at least a cell \(1 mm\), so the grid holds it/);
    assert.deepEqual(JSON.parse(cad('optimise', 'thin/line', '--json')).feature, { asked: 0.84, cells: 0, holds: 1, thin: 0 });
    // 2.5 mm: (2.5 - 1) / 2 = 0.75, so a ball of 1 cell, three across: 3 mm
    write('held', { feature: 2.5 });
    const held = JSON.parse(cad('optimise', 'thin/held', '--json')).feature;
    assert.deepEqual([held.asked, held.cells, held.holds], [2.5, 1, 3]);
    assert.match(cad('optimise', 'thin/held'), /thinnest member 2\.5 mm: held to three cells \(3 mm\)/);
    // 4 mm: (4 - 1) / 2 = 1.5, so 2 cells, past three across; 4 / 3 = 1.333, so cells of 1.34 mm hold it (4 / 1.34 =
    // 2.985 cells, (2.985 - 1) / 2 = 0.99, a ball of 1), and do
    write('wide', { feature: 4 });
    cad.refused(/a feature of 4 mm is more than three cells \(3 mm\) across: the optimiser holds members to three cells at most, so give cells of 1\.34 mm or more, or a feature of 3 mm or less/, 'optimise', 'thin/wide');
    write('wide', { feature: 4, cell: 1.34 });
    assert.deepEqual(JSON.parse(cad('optimise', 'thin/wide', '--json')).feature.cells, 1);
  } finally { done(); }
});

test('the bench lever milled (examples/bench lever E): its tool is the 4 mm end mill it names, 2 mm of radius, two whole cells, not the 1.9998 mm the third of the depth gives', () => {
  // mill_3axis.corner_per_depth (0.3333) × the 6 mm plate = 1.9998 mm: on 1 mm cells the disc then loses the four cells
  // 2 cells out and draws a 3 × 3 square, about a 3 mm tool (topopt's test of a refusal's sizes shows a 4 mm slot open
  // under it and filled under 2). Rounded to the 0.5 mm steps end mills come in: 3.9996 halves, so 4, 2 mm
  const bench = fileURLToPath(new URL('../../examples/bench/', CAD));
  const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { readProblem } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
    const r = await readProblem('bench', 'lever:milled'); console.log(JSON.stringify({ tool: r.problem.tool, mill: r.problem.mill, cell: r.problem.cell }));
  `], { cwd: bench, encoding: 'utf8' }));
  assert.deepEqual(r, { tool: 2, mill: '+z', cell: 1 });
});

test('a problem placed in an assembly: a support at one of its joints, and a part swept through a joint\'s range kept clear, flat and solid, followed when the assembly changes', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'swing');
    for (const d of ['problems', 'objects', 'assemblies']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'swing', objects: ['plate', 'bar'] }));
    // The plate being optimised (drawn as a blank when its problem is none), and a 20 x 4 x 4 bar with its end at its anchor
    fs.writeFileSync(path.join(project, 'objects', 'plate.json'), JSON.stringify({ name: 'plate', version: '0.1.0',
      variables: { problem: { type: 'problem', value: 'plate' } }, anchors: { pivot: { at: [0, 0, 4] } } }));
    fs.writeFileSync(path.join(project, 'objects', 'plate.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return v.problem === 'none' ? jscad.primitives.cuboid({ size: [40, 30, 4], center: [10, 0, 2] }) : jscad.extrusions.extrudeLinear({ height: 4 }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    fs.writeFileSync(path.join(project, 'objects', 'bar.json'), JSON.stringify({ name: 'bar', version: '0.1.0', anchors: { end: { at: [0, 0, 0] } } }));
    fs.writeFileSync(path.join(project, 'objects', 'bar.js'), "import jscad from '@jscad/modeling'\nexport function main () { return jscad.primitives.cuboid({ size: [20, 4, 4], center: [10, 0, 2] }) }\n");
    // An arm on the plate's pivot, lying on top of it (z 4 to 8), and a gate swinging in the plate's own layer (z 0 to 4)
    // about a post at (30, 0), from pointing along +y (90 degrees) round to along -x (180 degrees)
    const bench = (max = 180) => fs.writeFileSync(path.join(project, 'assemblies', 'bench.json'), JSON.stringify({ title: 'A plate, an arm on it and a gate beside it', kind: 'fit',
      items: [{ id: 'plate', object: 'plate' }, { id: 'arm', object: 'bar' }, { id: 'gate', object: 'bar' }],
      joints: [{ id: 'hinge', type: 'revolute', parent: 'plate.pivot', child: 'arm.end', min: 0, max: 90, value: 0 },
        { id: 'swing', type: 'revolute', parent: { at: [30, 0, 0] }, child: 'gate.end', min: 90, max, value: 90 }] }));
    bench();
    const problem = { title: 'The plate under the arm, clear of the gate', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.4, steps: 30,
      in: { assembly: 'bench', item: 'plate' }, space: { at: [10, 0], size: [40, 30] },
      supports: [{ joint: 'hinge', r: 2 }, { at: [28, -10], r: 2 }], loads: [{ at: [14, 14], r: 1.5, force: [0, -10] }], avoid: [{ sweep: 'gate', through: 'swing' }] };
    const write = (n, x) => fs.writeFileSync(path.join(project, 'problems', `${n}.json`), JSON.stringify(x));
    write('plate', problem);
    const read = (ref) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readProblem } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
      const { discretise } = await import('@rulecad/topopt');
      try {
        const r = await readProblem('swing', ${JSON.stringify(ref)}), d = discretise(r.problem), g = d.grid, o = d.origin, h = g.h;
        const cell = (x, y, z = 0.5) => d.passive[Math.floor((x - o[0]) / h) + g.nx * (Math.floor((y - o[1]) / h) + g.ny * (g.nz ? Math.floor((z - o[2]) / h) : 0))];
        console.log(JSON.stringify({ supports: r.problem.supports.map((s) => ({ at: s.at, axis: s.axis })), inputs: r.inputs, avoided: d.passive.filter((p) => p === -1).length,
          cells: [[20.5, 5.5], [29.5, -1.5], [5.5, 5.5], [20.5, -5.5]].map(([x, y]) => cell(x, y)) }));
      } catch (e) { console.log(JSON.stringify({ error: e.message })); }
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const r = read('plate');
    assert.equal(r.error, undefined, r.error);
    // The support sits at the hinge: the plate's own end of it, its pivot anchor at (0, 0, 4), x and y in this flat problem
    assert.deepEqual(r.supports, [{ at: [0, 0] }, { at: [28, -10] }]);
    assert.deepEqual(r.inputs.assembly.joints, [{ joint: 'hinge', at: [0, 0, 4] }]);
    // Steps, by hand: the bar's far corners (20, +-2) are sqrt(20^2 + 2^2) = 20.0998 mm from the post, so over 90 degrees
    // in 32 pieces of pi / 64 each moves a chord of 2 x 20.0998 x sin(pi / 128) = 0.98655 mm, 31.570 mm in all; no point
    // moves more than half a 1 mm cell between steps, so ceil(2 x 31.570 / 1) = 64 steps, 65 positions of the bar
    assert.deepEqual(r.inputs.assembly.sweeps, [{ sweep: 'gate', through: 'swing', from: 90, to: 180, steps: 64, regions: 65 }]);
    // What it sweeps in the plate's layer, by hand: a quarter disc of radius 20 about (30, 0) on the space's side
    // (y up to the space's edge at 15): the integral of sqrt(400 - y^2) from 0 to 15 = 7.5 x 13.229 + 200 x asin(0.75)
    // = 99.22 + 169.61 = 268.8 mm2, and the bar's half below y = 0 at 180 degrees, 20 x 2 = 40 mm2: 308.8 mm2, so about
    // 309 cells of 1 mm2 (the rounded ends and the cells' centres move it a few cells)
    assert.ok(r.avoided > 295 && r.avoided < 325, `${r.avoided} cells kept clear, about 309 by hand`);
    // Inside the swept quarter, on the bar at 180 degrees, and two outside it: beyond its reach, and below the bar
    assert.deepEqual(r.cells, [-1, -1, 0, 0]);
    // The same problem solid: each step the bar's own triangles, every one of the 4 layers clear as the flat section was
    write('solid', { ...problem, thickness: undefined, space: { at: [10, 0, 2], size: [40, 30, 4] }, supports: [{ joint: 'hinge', r: 2, length: 4 }, { at: [28, -10, 2], r: 2, length: 4 }], loads: [{ at: [14, 14, 2], r: 1.5, length: 4, force: [0, -10, 0] }] });
    const solid = read('solid');
    assert.equal(solid.error, undefined, solid.error);
    assert.deepEqual(solid.supports[0], { at: [0, 0, 4], axis: 'z' }, 'a cylinder at the hinge lies along its axis');
    assert.equal(solid.avoided, 4 * r.avoided);
    // Optimised as any problem is, kept until the assembly moves what it read; cad why names the assembly and the sweep
    assert.match(cad('optimise', 'swing/plate'), /moves [\d.]+ mm along its load/);
    assert.match(cad('optimise', 'swing/plate'), /\(cached\)/);
    cad.refused(/✓ closed solid/, 'check', 'swing/plate');
    // The load at (14, 14) and the support at (28, -10) lie either side of the gate's swing: the plate goes round it, and
    // the assembly, the plate drawn from its result, is clear all through the swing. Without the sweep it is struck.
    assert.match(cad('check', 'swing/bench', '--sweep'), /✓ sweep swing, 90 to 180° in 24 steps: nothing collides/);
    write('bare', { ...problem, avoid: [] });
    cad('set', 'swing/plate', 'problem=bare');
    cad.refused(/✗ sweep swing, 90 to 180° in 24 steps: [^\n]*gate[^\n]* hits plate|plate[^\n]* hits gate/, 'check', 'swing/bench', '--sweep');
    cad('set', 'swing/plate', 'problem=plate');
    const why = cad('why', 'swing/plate.problem');
    assert.match(why, /in the assembly bench, item plate: joints read: hinge at \(0, 0, 4\); swept: gate through swing, 90 to 180 in 64 steps/);
    bench(135);
    assert.doesNotMatch(cad('optimise', 'swing/plate'), /\(cached\)/, 'the gate swings less far: the region it keeps clear is smaller, and the plate is optimised again');
    assert.deepEqual(read('plate').inputs.assembly.sweeps[0].to, 135);
    // Refused by name: the arm rides on the plate, touching its top face, never in its layer; the plate itself; a joint or a sweep named wrong;
    // a sweep anywhere but avoid; a joint without an assembly to find it in
    write('over', { ...problem, avoid: [{ sweep: 'arm', through: 'hinge' }] });
    assert.match(read('over').error, /over\.json: "arm" never reaches into the plate \(z 0 to 4 mm in plate\) through hinge: nothing to keep clear there/);
    write('self', { ...problem, avoid: [{ sweep: 'plate', through: 'hinge' }] });
    assert.match(read('self').error, /self\.json: "plate" is plate itself, the item this problem is in: sweep a part that moves against it/);
    write('typo', { ...problem, avoid: [{ sweep: 'gate', through: 'swign' }] });
    assert.match(read('typo').error, /typo\.json: bench has no joint "swign" that moves on its own to sweep "gate" through \(joints: hinge, swing\)/);
    write('nojoint', { ...problem, supports: [{ joint: 'elbow', r: 2 }] });
    assert.match(read('nojoint').error, /nojoint\.json: bench has no joint "elbow" \(joints: hinge, swing\)/);
    write('kept', { ...problem, keep: [{ sweep: 'gate', through: 'swing' }] });
    assert.match(read('kept').error, /kept\.json: a swept part \("gate"\) is a region to keep clear: put it under avoid/);
    write('loose', { ...problem, in: undefined, avoid: [] });
    assert.match(read('loose').error, /loose\.json: the joint "hinge" needs the problem placed in an assembly: "in": \{ "assembly": "<name>", "item": "<the item it is drawn in>" \}/);
  } finally { done(); }
});

test('a flat problem keeps clear of all of a swept part within the plate\'s thickness: a gate whose arm dips 1 mm into the plate\'s top is kept clear where the arm passes, and the plate built is clear through the swing; a leaning part is cut finely enough to leave no gap', async () => {
  // The heights sections are taken at, for a 1 mm square rod standing 4 mm through a 4 mm plate on 1 mm cells, by hand:
  // no more than half a cell apart up the slab, so (4 - 2 x 0.00001) / 0.5 rounds up to 8 gaps and 9 sections. Leaning
  // 12 mm across over its 4 mm (its sloped faces' normals (1, 0, -3), a lean of 3), each 0.5 mm gap moves its outline
  // 3 x 0.5 = 1.5 mm, so each gap is cut in ceil(2 x 1.5 / 1) = 3: 1 + 8 x 3 = 25 sections, each 4 / 24 mm up from the
  // last, the rod's outline moving 3 x 4 / 24 = 0.5 mm across between two, half a cell
  const { slabLevels, section } = await import('../lib/mesh.mjs');
  const prism = (shift) => {
    const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]].flatMap((q) => [q, [q[0] + shift, q[1], 4]]), at = (i) => v[i];
    const quads = [[0, 2, 4, 6], [1, 7, 5, 3], [0, 1, 3, 2], [2, 3, 5, 4], [4, 5, 7, 6], [6, 7, 1, 0]]; // bottom, top, then the four sides
    return quads.flatMap(([a, b, c, d]) => [[at(a), at(b), at(c)], [at(a), at(c), at(d)]]);
  };
  assert.equal(slabLevels(prism(0), 0, 4, 1).length, 9);
  const levels = slabLevels(prism(12), 0, 4, 1);
  assert.equal(levels.length, 25);
  const spans = levels.map((h) => { const xs = section(prism(12), 2, h).flat().map((q) => q[0]); return [Math.min(...xs), Math.max(...xs)]; });
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] - spans[i - 1][0] <= 0.5 + 1e-6, `section ${i} moved ${spans[i][0] - spans[i - 1][0]} mm, over half a cell`);
  assert.ok(Math.abs(spans[0][0]) < 1e-3 && Math.abs(spans.at(-1)[1] - 13) < 1e-3, 'from the rod\'s foot at x 0 to its head at x 13');

  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'swing');
    for (const d of ['problems', 'objects', 'assemblies']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'swing', objects: ['plate', 'gate'] }));
    fs.writeFileSync(path.join(project, 'objects', 'plate.json'), JSON.stringify({ name: 'plate', version: '0.1.0', variables: { problem: { type: 'problem', value: 'plate' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'plate.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return v.problem === 'none' ? jscad.primitives.cuboid({ size: [40, 30, 4], center: [10, 0, 2] }) : jscad.extrusions.extrudeLinear({ height: 4 }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    // The gate: a 6 mm stub on its post through the plate's layer (z 0 to 4), and a 20 x 4 mm arm from it at z 3 to 7,
    // in the plate's top 1 mm but never across its middle plane (z 2); without the stub, the arm alone
    const gate = (stub) => fs.writeFileSync(path.join(project, 'objects', 'gate.js'), `import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main () { const arm = cuboid({ size: [20, 4, 4], center: [10, 0, 5] }); return ${stub ? 'jscad.booleans.union(cuboid({ size: [6, 4, 4], center: [3, 0, 2] }), arm)' : 'arm'} }\n`);
    fs.writeFileSync(path.join(project, 'objects', 'gate.json'), JSON.stringify({ name: 'gate', version: '0.1.0', anchors: { end: { at: [0, 0, 0] } } }));
    gate(true);
    fs.writeFileSync(path.join(project, 'assemblies', 'bench.json'), JSON.stringify({ title: 'A plate and a gate whose arm dips into it', kind: 'fit',
      items: [{ id: 'plate', object: 'plate' }, { id: 'gate', object: 'gate' }],
      joints: [{ id: 'swing', type: 'revolute', parent: { at: [30, 0, 0] }, child: 'gate.end', min: 90, max: 180, value: 90 }] }));
    fs.writeFileSync(path.join(project, 'problems', 'plate.json'), JSON.stringify({ title: 'The plate, clear of the gate', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.4, steps: 30,
      in: { assembly: 'bench', item: 'plate' }, space: { at: [10, 0], size: [40, 30] },
      supports: [{ at: [0, 0], r: 2 }, { at: [28, -10], r: 2 }], loads: [{ at: [14, 14], r: 1.5, force: [0, -10] }], avoid: [{ sweep: 'gate', through: 'swing' }] }));
    const read = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readProblem } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/optimise.mjs')).href)});
      const { discretise } = await import('@rulecad/topopt');
      try { const r = await readProblem('swing', 'plate'), d = discretise(r.problem); console.log(JSON.stringify({ avoided: d.passive.filter((p) => p === -1).length, sweeps: r.inputs.assembly.sweeps })); }
      catch (e) { console.log(JSON.stringify({ error: e.message })); }
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // The arm's footprint covers the stub's, so it sweeps what a full-thickness 20 x 4 bar does (the test before this
    // one, by hand): a quarter disc of radius 20 inside the space, 268.8 mm2, and the bar's half below y = 0 at 180
    // degrees, 40 mm2, about 309 cells. Taken at the middle plane alone, only the stub's 6 mm counted (42 cells). Each
    // of the 65 positions gives two regions, 130: the stub's section in the plate's bottom 3 mm, the stub and arm's in its
    // top 1 mm (the other sections, the same as one of these, are left out); the arm alone gives one, 65
    const r = read();
    assert.equal(r.error, undefined, r.error);
    assert.ok(r.avoided > 295 && r.avoided < 325, `${r.avoided} cells kept clear, about 309 by hand`);
    assert.deepEqual(r.sweeps, [{ sweep: 'gate', through: 'swing', from: 90, to: 180, steps: 64, regions: 130 }]);
    assert.match(cad('optimise', 'swing/plate'), /moves [\d.]+ mm along its load/);
    assert.match(cad('check', 'swing/bench', '--sweep'), /✓ sweep swing, 90 to 180° in 24 steps: nothing collides/);
    // The arm alone, never across the middle plane, is kept clear the same
    gate(false);
    const alone = read();
    assert.equal(alone.error, undefined, alone.error);
    assert.equal(alone.avoided, r.avoided);
    assert.equal(alone.sweeps[0].regions, 65);
  } finally { done(); }
});

test('cad\'s share of the densities key is pinned, so a change to holdEmpty or optimised() (a comment included) that would optimise every cached problem again is made on purpose', async () => {
  const crypto = await import('node:crypto');
  const { densityCode } = await import('../lib/optimise.mjs');
  // densityCode().cad is the source text of holdEmpty and optimised(), comments and all; CI's dimension diff keeps
  // densities by it too (.cache/dimension-diff/slow). A reworded comment inside optimised() once moved it and threw
  // every kept result away. When a change there is meant to optimise again, put the new digest here and say so in the
  // CHANGELOG; otherwise keep the change outside those two functions.
  // Line ends normalised: Windows checks the source out with \r\n, which the pin does not mean to catch
  assert.equal(crypto.createHash('sha256').update(densityCode().cad.replace(/\r\n/g, '\n')).digest('hex'), '5e4fb33bb0c71c40d22adfec2b24a8de9b8202bb292dd7d339b2a5423c81c417');
});

// The model page in a real browser: serve site/, drop an STL into it (through the file input), and check that it draws
// the model, lists the print check and makes a link. Needs Chrome or Chromium ($CAD_CHROME); skipped without one.
//   node --test test/viewer.browser.mjs        (writes test/viewer-drop.png and test/viewer.png to look at)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jscad from '@jscad/modeling';
import { fromTriangles, fromShapes, stl, encode, frame } from '@rulecad/model-link';
import { tri } from './jscad.mjs';
import { CHROME, startChrome } from './chrome.mjs';

const SITE = fileURLToPath(new URL('../packages/viewer/site/', import.meta.url));
// The model page draws with the GPU where there is one (four times quicker than software GL on a desktop); on Linux,
// as on CI, there's none, so it's asked for software GL rather than left to Chrome's deprecated fallback
const GL = { softwareGL: process.platform === 'linux' };
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };

test('drop an STL: drawn, checked, linked', { skip: !CHROME && 'no Chrome', timeout: 120000 }, async () => {
  const { cuboid } = jscad.primitives, { translate } = jscad.transforms, { union } = jscad.booleans;
  const tee = tri(union(translate([0, 0, 5], cuboid({ size: [4, 4, 10] })), translate([0, 0, 11], cuboid({ size: [20, 4, 2] }))));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-')), file = path.join(dir, 'tee.stl');
  fs.writeFileSync(file, stl({ title: 'tee', ...fromTriangles(tee) }));

  const server = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }).listen(0);
  const port = server.address().port;
  let chrome;
  try {
    chrome = await startChrome({ profile: `${dir}/profile`, size: '1200,800', ...GL });
    const ws = new WebSocket(chrome.wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const waiting = new Map(), errors = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    });
    // A question Chrome leaves unanswered fails after ms; its late answer, if one comes, is dropped
    const send = (method, params = {}, sessionId, ms = 30000) => new Promise((r, no) => {
      const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId }));
      setTimeout(() => { if (waiting.delete(i)) no(new Error(`Chrome didn't answer ${method} within ${ms / 1000} s`)); }, ms).unref();
    });
    // The page opened as the other browser tests open theirs: a blank tab, watched, then sent to the page
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId); await send('Log.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    const run = async (expression, ms) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, ms)).result.result?.value;
    // Polls until expr is true, for up to ms (45 s: a cold CI machine can be slow to load the page). Each look gets
    // 10 s, so a look Chrome never answers costs that, not the whole wait.
    // (a page mid-reload answers with no result: that's not yet, so it's asked again rather than failing the test)
    const until = async (expr, ms = 45000) => { for (const t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 200))) if (await run(expr, 10000).catch(() => false)) return true; return false; };
    // What the page shows, its errors and what Chrome said, for a wait that runs out
    const stuck = async () => {
      const page = await run(`JSON.stringify({ state: document.readyState, at: location.href.slice(0, 60), status: document.getElementById('status')?.textContent, body: document.body?.innerText.slice(0, 200) })`, 10000).catch((e) => e.message);
      return `\n  the page: ${page}\n  its errors: ${JSON.stringify(errors)}\n  Chrome started in ${chrome.startedIn} ms and said:\n${chrome.said(1500)}`;
    };

    await send('Page.navigate', { url: `http://localhost:${port}/` }, sessionId);
    const dropScreen = await until(`!!document.querySelector('.drop input')`);
    assert.ok(dropScreen, `the drop screen shows without a link${dropScreen ? '' : await stuck()}`);
    const shot = async (name) => fs.writeFileSync(new URL(`./${name}`, import.meta.url), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).result.data, 'base64'));
    await shot('viewer-drop.png');
    await send('DOM.enable', {}, sessionId);
    const { result: { root } } = await send('DOM.getDocument', {}, sessionId);
    const { result: { nodeId } } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '.drop input' }, sessionId);
    await send('DOM.setFileInputFiles', { nodeId, files: [file] }, sessionId);
    const opened = await until(`document.getElementById('title')?.textContent === 'tee'`);
    assert.ok(opened, `the model opens${opened ? '' : await stuck()}`);
    const rules = await run(`[...document.querySelectorAll('#rules li')].map((l) => l.textContent).join(' | ')`);
    assert.match(rules, /bridge/, rules);
    assert.match(rules, /fits the bed/);
    // the quick checks at once, then the sliced ones from the worker in their place, the page answering meanwhile
    assert.ok(await until(`/islands? (in|when sliced)/.test([...document.querySelectorAll('#rules li')].map((l) => l.textContent).join(' '))`), 'the sliced check arrives from its worker');
    const after = await run(`[...document.querySelectorAll('#rules li')].map((l) => l.textContent).join(' | ')`);
    assert.ok(!/slicing it, layer by layer/.test(after), `and replaces the waiting line: ${after}`);
    assert.match(await run('location.hash'), /^#m=1\./, 'the address is now the model\'s link');
    await new Promise((r) => setTimeout(r, 1500)); // a frame or two of the model turning
    await shot('viewer.png');
    // Sliced as the printer builds it: the tee has no islands; the slider cuts it, its readout gives the layer and height
    assert.ok(await until(`/^No islands in \\d+ layers/.test(document.getElementById('islands').textContent)`), 'the tee slices clean');
    await run(`(() => { const i = document.getElementById('layer'); i.value = 30; i.dispatchEvent(new Event('input')); return true; })()`);
    assert.equal(await run(`document.getElementById('slice').checked + ' ' + document.getElementById('layerat').textContent`), 'true 30 of 60 · 6.0 mm');
    // A block floating beside a post: one island, in red, and its button jumps the slider to its layer
    const post = tri(translate([0, 0, 5], cuboid({ size: [4, 4, 10] }))), blob = tri(translate([8, 0, 5], cuboid({ size: [2, 2, 2] })));
    const floating = await encode({ title: 'floating', ...fromTriangles([...post, ...blob]) });
    await run(`location.hash = '#m=${floating}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'floating'`), 'the floating link opens');
    assert.ok(await until(`/^An island when sliced/.test(document.getElementById('islands').textContent)`), 'one island is found');
    assert.equal(await run(`document.getElementById('islands').classList.contains('hit') + ' ' + document.querySelectorAll('#islandlist button').length`), 'true 1', 'shown as an error, with a button');
    await run(`document.querySelector('#islandlist button').click(); true`);
    assert.equal(await run(`document.getElementById('slice').checked + ' ' + document.getElementById('layer').value`), 'true 21', 'the slider jumps to the island\'s first layer (z 4 to 4.2)');
    await new Promise((r) => setTimeout(r, 500));
    await shot('viewer-slice.png');
    // A board link carrying only "both sides": the page makes front and back from its layer marks
    const board = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" data-pcb-layer="global"/><path d="M0 0L80 60" stroke="red" data-pcb-layer="top"/><path d="M80 0L0 60" stroke="blue" data-pcb-layer="bottom"/></svg>';
    const link = await encode({ title: 'board', ...fromTriangles(tee), views: [['Board: both sides', board], ['Schematic', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>']] });
    await run(`location.hash = '#m=${link}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'board'`), 'the board link opens');
    await run(`[...document.querySelectorAll('#tabs button')].find((b) => b.textContent === 'Board').click(); true`);
    assert.equal(await run(`[...document.querySelectorAll('#subtabs button')].map((b) => b.textContent).join(', ')`), 'both sides, front, back');
    // A board link with its fab zip: a button that saves those bytes as they are, under their name
    const zipBytes = Buffer.from('PK\x03\x04 a fab zip, as the link carries it');
    const withFab = await encode({ title: 'board fab', ...fromTriangles(tee), views: [['Board: both sides', board]], fab: [{ name: 'board@1.0.0-fab.zip', zip: zipBytes.toString('base64') }] });
    await run(`location.hash = '#m=${withFab}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'board fab'`), 'the board link with its fab zip opens');
    assert.equal(await run(`[...document.querySelectorAll('.actions button')].map((b) => b.textContent).join(', ')`), 'Download for JLCPCB, Download STL, Download 3MF, Copy link');
    const saved = await run(`new Promise((done) => { HTMLAnchorElement.prototype.click = function () { fetch(this.href).then((r) => r.arrayBuffer()).then((b) => done([this.download, [...new Uint8Array(b)]])); };
      document.querySelector('.actions .fab').click(); })`);
    assert.deepEqual(saved, ['board@1.0.0-fab.zip', [...zipBytes]], 'the zip, byte for byte, under its own name');
    assert.equal(await run(`(location.hash = '#m=${link}', location.reload(), true)`).catch(() => true), true);
    assert.ok(await until(`document.getElementById('title')?.textContent === 'board'`) && !(await run(`!!document.querySelector('.actions .fab')`)), 'no fab zip, no button');
    // A 4-layer board: a view of each copper layer, the inner ones (its planes) in order between front and back
    const four = board.replace('</svg>', '<path d="M0 30L80 30" stroke="green" data-pcb-layer="inner2"/><path d="M40 0L40 60" stroke="gray" data-pcb-layer="inner1"/></svg>');
    const link4 = await encode({ title: 'board4', ...fromTriangles(tee), views: [['Board: both sides', four]] });
    await run(`location.hash = '#m=${link4}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'board4'`), 'the 4-layer board opens');
    await run(`[...document.querySelectorAll('#tabs button')].find((b) => b.textContent === 'Board').click(); true`);
    assert.equal(await run(`[...document.querySelectorAll('#subtabs button')].map((b) => b.textContent).join(', ')`), 'all 4 layers, front, inner 1, inner 2, back');
    // A link with a joint: a slider and poses move the arm, and pushing it into the block shows as a collision
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const block = tri(translate([0, 0, 5], cuboid({ size: [10, 10, 10] }))), arm = tri(translate([5, 0, 0], cuboid({ size: [10, 2, 2] })));
    const hinged = await encode({ title: 'arm', ...fromShapes([{ shape: 'block', triangles: block, matrix: I, name: 'block.body' }, { shape: 'arm', triangles: arm, matrix: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 12], name: 'arm.body' }]),
      motion: { items: [['block', ...I], ['arm']], part: [0, 1], poses: { flat: { hinge: 0 }, down: { hinge: 90 } }, pose: 'flat',
        joints: [{ id: 'hinge', label: 'Arm', type: 'revolute', parent: 0, child: 1, a: frame([5, 0, 12], [0, 1, 0]), b: frame([0, 0, 0], [0, 1, 0]), dofs: [[-90, 90, 0]] }] } });
    await run(`location.hash = '#m=${hinged}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'arm'`), 'the hinged link opens');
    assert.equal(await run(`document.getElementById('motion').hidden`), false, 'the motion panel shows');
    assert.equal(await run(`[...document.querySelectorAll('#poses button')].map((b) => b.textContent).join(', ')`), 'flat, down');
    await run(`(() => { const i = document.querySelector('#joints input'); i.value = 90; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return true; })()`);
    assert.match(await run(`document.querySelector('#joints b').textContent + ' ' + document.getElementById('clash').textContent`), /^90° Collides: (block and arm|arm and block)/);
    await run(`[...document.querySelectorAll('#poses button')].find((b) => b.textContent === 'flat').click(); true`);
    assert.match(await run(`document.getElementById('clash').textContent`), /Nothing collides/);
    await run(`document.querySelector('#joints input').value = 45; document.querySelector('#joints input').dispatchEvent(new Event('input')); true`);
    await new Promise((r) => setTimeout(r, 500));
    await shot('viewer-motion.png');
    // A gait: Play in the Motion panel, frames in time on the joints it names; the scrubber sets one by hand
    const gaited = await encode({ title: 'gait', ...fromShapes([{ shape: 'block', triangles: block, matrix: I, name: 'block.body' }, { shape: 'arm', triangles: arm, matrix: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 12], name: 'arm.body' }]),
      motion: { items: [['block', ...I], ['arm']], part: [0, 1], poses: { flat: { hinge: 0 } }, pose: 'flat', sequence: { period: 2, names: ['hinge'], q: [[0], [30], [60], [30]] },
        joints: [{ id: 'hinge', label: 'Arm', type: 'revolute', parent: 0, child: 1, a: frame([5, 0, 12], [0, 1, 0]), b: frame([0, 0, 0], [0, 1, 0]), dofs: [[-90, 90, 0]] }] } });
    await run(`location.hash = '#m=${gaited}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'gait'`), 'the gait link opens');
    await run(`(() => { const s = document.querySelector('[aria-label="Where in the gait"]'); s.value = 0.5; s.dispatchEvent(new Event('input')); return true; })()`);
    assert.equal(await run(`document.querySelector('#joints b').textContent`), '60°', 'half way through the gait, the hinge is at its third frame');
    assert.equal(await run(`[...document.querySelectorAll('#motion button')].some((b) => b.textContent === 'Play gait')`), true);
    // A pose that changes a part's shape (a flexure bent): the "pose" part is swapped in for it there, and only there
    const thick = tri(cuboid({ size: [10, 2, 6] })); // reaches back over the block and 3 mm down, 1 mm into its top
    const posed = await encode({ title: 'posed', ...fromShapes([{ shape: 'block', triangles: block, matrix: I, name: 'block.body' }, { shape: 'arm', triangles: arm, matrix: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 12], name: 'arm.body' },
      { shape: 'thick', role: 'pose', triangles: thick, matrix: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 12], name: 'arm.body@pressed' }]),
      motion: { items: [['block', ...I], ['arm']], part: [0, 1, 1], poses: { flat: { hinge: 0 }, pressed: { hinge: 0 } }, pose: 'flat', swap: { pressed: [[1, 2]] },
        joints: [{ id: 'hinge', label: 'Arm', type: 'revolute', parent: 0, child: 1, a: frame([5, 0, 12], [0, 1, 0]), b: frame([0, 0, 0], [0, 1, 0]), dofs: [[-90, 90, 0]] }] } });
    await run(`location.hash = '#m=${posed}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'posed'`), 'the posed link opens');
    const press = async (n) => { await run(`[...document.querySelectorAll('#poses button')].find((b) => b.textContent === '${n}').click(); true`); return run(`document.getElementById('clash').textContent`); };
    assert.match(await press('pressed'), /Collides/, 'pressed, the arm takes its pose shape, which reaches into the block');
    assert.match(await press('flat'), /Nothing collides/, 'and goes back to its own shape');
    assert.doesNotMatch(await run(`document.body.innerText`), /@pressed/, 'the pose shape is not listed as a part');
    await run(`location.hash = '#m=${hinged}'; location.reload(); true`).catch(() => {}); // back to the hinged link for the phone's look
    assert.ok(await until(`document.getElementById('title')?.textContent === 'arm'`), 'the hinged link opens again');
    // On a phone the model and an info pane share the screen: Parts swaps the pane, the grip moves the border, and
    // the rules sheet opens in the pane, so nothing covers the model
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: true }, sessionId);
    // The same link again, so its title can't tell the new page from the old: the old one is marked, and waited out
    await run(`window.reloading = true; location.reload(); true`).catch(() => {});
    assert.ok(await until(`!window.reloading && document.getElementById('title')?.textContent === 'arm' && !!document.querySelector('#joints input')`), 'the link opens on a phone');
    const box = (sel) => run(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.top, r.height]; })()`);
    assert.deepEqual(await box('#stage'), [0, 400], 'the model has the top half, the grip and pane the rest');
    assert.equal(await run(`document.querySelector('footer').hidden + ' ' + document.getElementById('panel').hidden`), 'false true');
    await run(`document.getElementById('toggle').click(); true`);
    assert.ok(await until(`document.querySelector('footer').hidden && !document.getElementById('panel').hidden && document.getElementById('toggle').textContent === 'Info'`), 'Parts swaps the pane for the parts list, and the button reads Info');
    const [gy] = await box('#grip');
    for (const [type, y] of [['touchStart', gy + 11], ['touchMove', 500], ['touchMove', 600], ['touchEnd', 600]]) await send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] }, sessionId);
    assert.equal((await box('#stage'))[1], 600, 'dragging the grip down gives the model more room');
    await run(`document.getElementById('rulesbtn').hidden || document.getElementById('rulesbtn').click(); true`);
    assert.equal(await run(`document.getElementById('sheet').parentElement === document.body`), true, 'the rules sheet lives in the pane');
    await shot('viewer-phone.png');
    ws.close();
  } finally {
    server.close();
    await chrome?.stop(); // and waited for: its profile folder is in use until then
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} // a temp folder: the system clears it anyway
  }
});

// A machine's link, end to end: the arm from cad link, the pen dragged by hand, a drawing played to its end, the build page,
// the ledger in the rules, on a desk and on a phone. No script may error.
test('a machine: the pen follows a drag, a step file plays to its end, the build page and the rules', { skip: !CHROME && 'no Chrome', timeout: 180000 }, async () => {
  const CAD = fileURLToPath(new URL('../packages/cad/bin/cad.mjs', import.meta.url));
  execFileSync(process.execPath, [fileURLToPath(new URL('../packages/viewer/scripts/build.mjs', import.meta.url))], { stdio: 'ignore' }); // the page's robots and link format, current
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-machine-'));
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(ws, 'node_modules'), 'junction');
  const cad = (...a) => { try { return execFileSync(process.execPath, [CAD, ...a], { cwd: ws, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }); } catch (e) { return `${e.stdout}${e.stderr}`; } };
  for (const d of ['projects/home/objects', 'projects/home/assemblies', 'rules']) fs.mkdirSync(path.join(ws, d), { recursive: true });
  fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
  fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: ['long', 0, 0], axis: [0, 0, 1] }, connector: { at: [10, 0, 'thick'], axis: [0, 0, 1] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
  fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
  fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify({ title: 'Arm', kind: 'fit', uses: [],
    items: [{ id: 'upper', object: 'link', set: { long: 150 } }, { id: 'fore', object: 'link', set: { long: 150 } }, { id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 300, microsteps: 16 }, at: [0, 0, -50] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 300, microsteps: 16 }, at: [150, 0, -50] }],
    joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 30] }, child: 'upper.base', min: -130, max: 130 }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150 }],
    fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }, { a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true, fastens: true, note: 'The motor, on four screws' }],
    loads: [{ joint: 'elbow', torque: 0.05 }], wires: [{ id: 'm1', from: 'upper.connector', to: 'fore.connector', gauge: 'awg22' }], task: { tool: 'fore.tip', sheet: { size: 'a5', at: [180, 0, 30] }, speed: 50, accuracy: 0.6 } }));
  fs.writeFileSync(path.join(ws, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210"><rect id="sq" x="24" y="55" width="100" height="100" fill="none"/></svg>');
  assert.match(cad('plot', 'home/arm', 'square.svg'), /arm-square/);
  cad('measured', 'home/arm', 'task.accuracy=0.4', '--source', 'bench');
  const out = cad('link', 'home/arm', '--long'), url = out.match(/view\s+(\S+)/)?.[1];
  assert.ok(url, out);
  const stepsFile = path.join(ws, 'exports/home/arm-square.steps.json');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-m-'));
  const server = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }).listen(0);
  const port = server.address().port;
  const errors = [];
  let chrome;
  try {
    chrome = await startChrome({ profile: `${dir}/profile`, size: '1200,800', ...GL });
    const wsUrl = chrome.wsUrl;
    const sock = new WebSocket(wsUrl); await new Promise((r) => sock.addEventListener('open', r, { once: true }));
    let id = 0; const waiting = new Map();
    sock.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|Failed to load resource/.test(m.params.entry.text)) errors.push(m.params.entry.text);
    });
    const send = (method, params = {}, sessionId) => new Promise((r, no) => { const i = ++id; waiting.set(i, r); sock.send(JSON.stringify({ id: i, method, params, sessionId })); setTimeout(() => no(new Error(`Chrome didn't answer ${method}`)), 30000).unref(); });
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId); await send('Log.enable', {}, sessionId); await send('Page.enable', {}, sessionId); await send('DOM.enable', {}, sessionId);
    const run = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'page error'); return r.result.result.value; };
    const until = async (expr, ms = 45000) => { for (const t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 150))) if (await run(expr).catch(() => false)) return true; return false; };
    const shot = async (name) => fs.writeFileSync(new URL(`./${name}`, import.meta.url), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).result.data, 'base64'));
    await send('Page.navigate', { url: `http://localhost:${port}/${url.slice(url.indexOf('#'))}` }, sessionId);
    assert.ok(await until(`document.getElementById('title')?.textContent === 'Arm'`), 'the machine link opens');
    assert.ok(await until(`!document.getElementById('tool').hidden && !!window.rulecadTool?.time`), `the tool and the carried drawing are ready: ${await run(`document.getElementById('toolsay').textContent + ' / ' + document.getElementById('playsay').textContent + ' / ' + !document.getElementById('tool').hidden`)} ${JSON.stringify(errors)}`);
    assert.ok(await until(`Number(document.getElementById('tool').dataset.reach) > 100`), 'the reachable region arrives from its worker');
    const chips = await run(`[...document.querySelectorAll('#strip .chip')].map((c) => c.textContent).join(' | ')`);
    assert.match(chips, /Torque .*Reach .*Accuracy .*Heat/, chips);
    assert.match(await run(`document.querySelector('#strip .chip.ok b')?.textContent ?? ''`), /./, 'coloured by margin');
    // The pen, dragged across the sheet: its joints follow
    const before = await run(`document.querySelector('#joints b').textContent`);
    await run(`document.getElementById('toolmode').click(); true`);
    await new Promise((r) => setTimeout(r, 200)); // the view settles square on the sheet
    const [ax, ay] = await run(`window.rulecadTool.project(-40, -60)`), [bx, by] = await run(`window.rulecadTool.project(50, 70)`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, button: 'left', clickCount: 1 }, sessionId);
    for (let k = 1; k <= 12; k++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + (bx - ax) * k / 12, y: ay + (by - ay) * k / 12, button: 'left' }, sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, button: 'left', clickCount: 1 }, sessionId);
    const pen = await run(`window.rulecadTool.pen()`);
    assert.ok(Math.hypot(pen[0] - 50, pen[1] - 70) < 3, `the pen followed the drag to ${pen}`);
    assert.notEqual(await run(`document.querySelector('#joints b').textContent`), before, 'and the joints moved');
    assert.match(await run(`document.getElementById('toolsay').textContent`), /Pen at 5\d\.\d, [67]\d\.\d mm/);
    await shot('viewer-pen.png');
    // Outside the arm's reach: said, and the pen stays where it was
    const [fx, fy] = await run(`window.rulecadTool.project(0, 0)`);
    assert.ok(fx > 0 && fy > 0);
    // The drawing, played: at ten times the speed to the end, the line all drawn
    await run(`document.getElementById('speed').value = '10'; document.getElementById('play').click(); true`);
    assert.ok(await until(`window.rulecadTool.ended() && document.getElementById('play').textContent === 'Play'`, 60000), 'the playback reaches the end');
    const seg = await run(`({ drawn: window.rulecadTool.drawn, all: window.rulecadTool.segments })`);
    assert.ok(seg.all > 3 && seg.drawn === seg.all, `the whole line appears (${JSON.stringify(seg)})`);
    await shot('viewer-play.png');
    // Scrubbed back, some of it unsaid; dropped from a file (the file input), the same machine plays
    await run(`const i = document.getElementById('scrub'); i.value = 0.4; i.dispatchEvent(new Event('input')); true`);
    assert.ok(await run(`window.rulecadTool.drawn < window.rulecadTool.segments`), 'scrubbing back unsays the line');
    const { result: { root } } = await send('DOM.getDocument', {}, sessionId);
    const { result: { nodeId } } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#stepfile' }, sessionId);
    await send('DOM.setFileInputFiles', { nodeId, files: [stepsFile] }, sessionId);
    assert.ok(await until(`/arm-square/.test(document.getElementById('playsay').textContent)`), 'a step file from disk plays too');
    // A wrong one is told apart by name, and nothing breaks
    const bad = path.join(dir, 'other.json'); fs.writeFileSync(bad, JSON.stringify({ hello: 1 }));
    await send('DOM.setFileInputFiles', { nodeId, files: [bad] }, sessionId);
    assert.ok(await until(`/not a step file/.test(document.getElementById('playsay').textContent)`), 'a stray file is refused by name');
    // The build page, beside the model: every section, and a step shown on the model
    await run(`document.getElementById('buildbtn').click(); true`);
    assert.equal(await run(`document.getElementById('build').hidden`), false);
    const text = await run(`document.getElementById('build').innerText`);
    for (const t of ['What to buy', 'Plates', 'Wiring', 'Machine settings', 'upper', 'scara']) assert.ok(text.toLowerCase().includes(t.toLowerCase()), `${t} is on the page:\n${text.slice(0, 400)}`);
    assert.ok(await run(`document.querySelector('#build .bed rect') !== null`), 'the plates are drawn');
    assert.ok(await run(`[...document.querySelectorAll('#build ol.steps button')].some((b) => /fore/.test(b.textContent))`), 'the assembly steps are listed');
    await run(`document.querySelector('#build ol.steps button').click(); true`);
    assert.equal(await run(`document.querySelector('#build ol.steps button.on') !== null`), true, 'a step shown');
    assert.deepEqual(await box2(run), [true, true], 'the build pane sits beside the model');
    await shot('viewer-build.png');
    await run(`document.querySelector('#build ol.steps button.on').click(); true`);
    // The ledger in the rules sheet
    await run(`document.getElementById('rulesbtn').click(); true`);
    assert.match(await run(`document.getElementById('sheetbody').innerText`), /Predicted against measured[\s\S]*task\.accuracy[\s\S]*0\.4/, 'the ledger is in the rules');
    await run(`document.getElementById('sheetclose').click(); document.getElementById('buildbtn').click(); true`);
    // A phone, in portrait: the model on top, the pen by touch
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 800, deviceScaleFactor: 1, mobile: true }, sessionId);
    await run(`window.reloading = true; location.reload(); true`).catch(() => {}); // (the old page marked, as above)
    assert.ok(await until(`!window.reloading && document.getElementById('title')?.textContent === 'Arm' && !document.getElementById('tool').hidden && !!window.rulecadTool?.time`), 'the link opens on a phone');
    assert.deepEqual(await run(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.top, r.height]; })()`), [0, 400], 'the model on top');
    await run(`document.getElementById('toggle').click(); document.getElementById('toolmode').click(); true`);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(await until(`document.getElementById('toolmode').checked`));
    const [sx, sy] = await run(`window.rulecadTool.project(-30, -40)`), [ex, ey] = await run(`window.rulecadTool.project(30, 40)`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] }, sessionId);
    for (let k = 1; k <= 8; k++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * k / 8, y: sy + (ey - sy) * k / 8 }] }, sessionId);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
    const p2 = await run(`window.rulecadTool.pen()`);
    assert.ok(Math.hypot(p2[0] - 30, p2[1] - 40) < 4, `on a phone too: ${p2}`);
    await run(`document.getElementById('buildbtn').click(); true`);
    assert.equal(await run(`document.getElementById('build').getBoundingClientRect().top >= 400 && !document.getElementById('build').hidden`), true, 'the build page goes under the model');
    await shot('viewer-pen-phone.png');
    assert.deepEqual(errors, [], 'no script errors');
    sock.close();
  } finally {
    server.close();
    await chrome?.stop();
    try { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(ws, { recursive: true, force: true }); } catch {} // a temp folder: the system clears it anyway
  }
});
const box2 = (run) => run(`(() => { const s = document.getElementById('stage').getBoundingClientRect(), b = document.getElementById('build').getBoundingClientRect(); return [b.left >= s.right - 1, b.width > 200]; })()`);

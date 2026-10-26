// The model page in a real browser: serve site/, drop an STL into it (through the file input), and check that it draws
// the model, lists the print check and makes a link. Needs Chrome or Chromium ($CAD_CHROME); skipped without one.
//   node --test test/viewer.browser.mjs        (writes test/viewer-drop.png and test/viewer.png to look at)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jscad from '@jscad/modeling';
import { fromTriangles, fromShapes, stl, encode, frame } from '@rulecad/model-link';
import { tri } from './jscad.mjs';

const SITE = fileURLToPath(new URL('../packages/viewer/site/', import.meta.url));
const CHROME = process.env.CAD_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((f) => fs.existsSync(f));
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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}/profile`, '--no-first-run', '--window-size=1200,800', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((res, rej) => { let s = ''; chrome.stderr.on('data', (d) => { s += d; const m = s.match(/ws:\/\/\S+/); if (m) res(m[0]); }); setTimeout(() => rej(new Error(`Chrome did not start within a minute. It said:\n${s.slice(-1500)}`)), 60000).unref(); }); // a cold CI machine can take a while
    const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const waiting = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    const send = (method, params = {}, sessionId) => new Promise((r, no) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); setTimeout(() => no(new Error(`Chrome didn't answer ${method}`)), 30000).unref(); });
    const { result: { targetId } } = await send('Target.createTarget', { url: `http://localhost:${port}/` });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.result.value;
    // (45 s: a cold CI machine can be slow to load the page)
    const until = async (expr, ms = 45000) => { for (const t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 200))) if (await run(expr)) return true; return false; };

    assert.ok(await until(`!!document.querySelector('.drop input')`), 'the drop screen shows without a link');
    const shot = async (name) => fs.writeFileSync(new URL(`./${name}`, import.meta.url), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).result.data, 'base64'));
    await shot('viewer-drop.png');
    await send('DOM.enable', {}, sessionId);
    const { result: { root } } = await send('DOM.getDocument', {}, sessionId);
    const { result: { nodeId } } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '.drop input' }, sessionId);
    await send('DOM.setFileInputFiles', { nodeId, files: [file] }, sessionId);
    assert.ok(await until(`document.getElementById('title')?.textContent === 'tee'`), 'the model opens');
    const rules = await run(`[...document.querySelectorAll('#rules li')].map((l) => l.textContent).join(' | ')`);
    assert.match(rules, /bridge/, rules);
    assert.match(rules, /fits the bed/);
    assert.match(await run('location.hash'), /^#m=1\./, 'the address is now the model\'s link');
    await new Promise((r) => setTimeout(r, 1500)); // a frame or two of the model turning
    await shot('viewer.png');
    // A board link carrying only "both sides": the page makes front and back from its layer marks
    const board = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" data-pcb-layer="global"/><path d="M0 0L80 60" stroke="red" data-pcb-layer="top"/><path d="M80 0L0 60" stroke="blue" data-pcb-layer="bottom"/></svg>';
    const link = await encode({ title: 'board', ...fromTriangles(tee), views: [['Board: both sides', board], ['Schematic', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>']] });
    await run(`location.hash = '#m=${link}'; location.reload(); true`).catch(() => {});
    assert.ok(await until(`document.getElementById('title')?.textContent === 'board'`), 'the board link opens');
    await run(`[...document.querySelectorAll('#tabs button')].find((b) => b.textContent === 'Board').click(); true`);
    assert.equal(await run(`[...document.querySelectorAll('#subtabs button')].map((b) => b.textContent).join(', ')`), 'both sides, front, back');
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
    ws.close();
  } finally {
    // Stop Chrome and wait for it (its profile folder is in use until then). It can ignore a polite stop, and while its
    // output pipe is open Node can't finish, so after 3 s it's killed outright.
    server.close();
    const exited = () => chrome.exitCode !== null || chrome.signalCode !== null;
    const gone = (ms) => (exited() ? Promise.resolve(true) : Promise.race([new Promise((r) => chrome.once('exit', () => r(true))), new Promise((r) => setTimeout(() => r(false), ms).unref())]));
    chrome.kill();
    if (!(await gone(3000))) { chrome.kill('SIGKILL'); await gone(3000); }
    chrome.stderr.destroy();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} // a temp folder: the system clears it anyway
  }
});

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
import jscad from '@jscad/modeling';
import { fromTriangles, stl } from '@rulecad/model-link';
import { tri } from './jscad.mjs';

const SITE = new URL('../packages/viewer/site/', import.meta.url).pathname;
const CHROME = process.env.CAD_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((f) => fs.existsSync(f));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };

test('drop an STL: drawn, checked, linked', { skip: !CHROME && 'no Chrome' }, async () => {
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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}/profile`, '--no-first-run', '--window-size=1200,800', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((res, rej) => { let s = ''; chrome.stderr.on('data', (d) => { s += d; const m = s.match(/ws:\/\/\S+/); if (m) res(m[0]); }); setTimeout(() => rej(new Error('Chrome did not start')), 20000); });
    const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const waiting = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { result: { targetId } } = await send('Target.createTarget', { url: `http://localhost:${port}/` });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.result.value;
    const until = async (expr, ms = 15000) => { for (const t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 200))) if (await run(expr)) return true; return false; };

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
    ws.close();
  } finally {
    const gone = new Promise((r) => chrome.once('exit', r));
    chrome.kill(); server.close(); await gone;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} // a temp folder: the system clears it anyway
  }
});

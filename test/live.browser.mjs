// The live view in a real browser: a 3D step's surface is drawn in view (not from inside it) and turns when dragged.
// Needs Chrome or Chromium ($CAD_CHROME); skipped without one.
//   node --test test/live.browser.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { liveView } from '../packages/cad/lib/live.mjs';

const CHROME = process.env.CAD_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((f) => fs.existsSync(f));

test('the live view draws a 3D part in view, and dragging turns it', { skip: !CHROME && 'no Chrome', timeout: 180000 }, async () => {
  // A block in the middle of a 12-cell cube, as an optimiser's step
  const n = 12, density = new Float64Array(n ** 3);
  for (let k = 3; k < 9; k++) for (let j = 4; j < 8; j++) for (let i = 2; i < 10; i++) density[(k * n + j) * n + i] = 1;
  const t0 = Date.now(), note = (m) => process.stderr.write(`  live view test: ${((Date.now() - t0) / 1000).toFixed(1)} s: ${m}\n`); // where it gets to, for a run that stalls
  const view = await liveView({ port: 0, title: 'a block' });
  view.step({ step: 1, steps: 10, compliance: 1, change: 0.1, beta: 1, grid: { nx: n, ny: n, nz: n, h: 2 }, density });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-live-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}/profile`, '--no-first-run', '--window-size=500,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((r, no) => { let buf = ''; chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) r(m[0]); }); setTimeout(() => no(new Error('Chrome did not start')), 30000); });
    const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const waiting = new Map(), errors = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    });
    const send = (method, params = {}, sessionId) => new Promise((r, no) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); setTimeout(() => no(new Error(`${method} timed out`)), 20000); });
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.result?.value;
    await send('Page.navigate', { url: view.url }, sessionId); note('page opened');
    // The share of the 3D panel's pixels the part covers (lit grey, not the black behind it), and the picture itself
    const look = `(async () => { const c = document.querySelector('#model canvas'); if (!c) return null;
      const img = new Image(); img.src = c.toDataURL(); await img.decode();
      const t = document.createElement('canvas'); t.width = 64; t.height = 64; const g = t.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 40) lit++;
      return { lit: lit / 4096, picture: Array.from(d.filter((_, i) => i % 4 === 0)).join(',') }; })()`;
    let seen = null;
    // The first frame can take a while without a GPU (shaders compiled in software): up to a minute
    for (let t = 0; t < 240 && !(seen?.lit > 0); t++) { await new Promise((r) => setTimeout(r, 250)); seen = await run(look); if (t % 20 === 19) note(`waiting for the part: ${seen ? `${Math.round(seen.lit * 100)}% lit` : 'no canvas yet'}`); }
    note(`drawn: ${seen ? `${Math.round(seen.lit * 100)}% lit` : 'nothing'}`);
    // In view: the block covers some of the panel, not all of it (a camera inside the part sees it everywhere)
    assert.ok(seen && seen.lit > 0.02 && seen.lit < 0.8, `the part covers ${seen ? Math.round(seen.lit * 100) : 0}% of the 3D panel`);
    // Turning: a press stops it spinning on its own; then a drag across, and the picture changes
    const box = await run("(() => { const r = document.querySelector('#model canvas').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()");
    const mouse = (type, x, buttons) => send('Input.dispatchMouseEvent', { type, x, y: box[1], button: 'left', buttons, clickCount: 1 }, sessionId);
    await mouse('mousePressed', box[0], 1); await mouse('mouseReleased', box[0], 0);
    await new Promise((r) => setTimeout(r, 300));
    const before = (await run(look)).picture;
    await mouse('mousePressed', box[0], 1);
    for (let k = 1; k <= 8; k++) await mouse('mouseMoved', box[0] + k * 12, 1);
    await mouse('mouseReleased', box[0] + 96, 0);
    await new Promise((r) => setTimeout(r, 300));
    assert.notEqual((await run(look)).picture, before, 'dragging across the 3D panel turned nothing'); note('turned');
    assert.deepEqual(errors, []);
  } finally {
    // Killed outright: asked politely, Chrome without a GPU can take its time going, and the test would wait on it
    chrome.kill('SIGKILL'); await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 5000); });
    await view.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

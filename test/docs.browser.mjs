// The documentation site in a real browser: build it, serve it, open every library page, and check that each runs
// without a script error and that its demonstration draws something. Screenshots go to $DOCS_SHOTS when it's set.
//   node --test test/docs.browser.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.env.CAD_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((f) => fs.existsSync(f));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
// What each page's demonstration must have drawn, as a script that returns true
const drawn = {
  shapes: "!!document.querySelector('.stage canvas')", printcheck: "document.querySelectorAll('.findings li').length > 2",
  fit: "/closest gap/.test(document.getElementById('gap').textContent)", 'model-link': "/KB/.test(document.getElementById('info').textContent)",
  variables: "document.querySelectorAll('#values tr').length > 4", 'keyboard-layout': "document.querySelectorAll('#keys rect').length > 10",
  versions: "/major/.test(document.getElementById('verdict').textContent)", rules: "document.querySelectorAll('#rules tbody tr').length > 20",
  pcb: "!!document.querySelector('.figure svg')", cad: "!!document.querySelector('img[src=\"soap-tray.png\"]')", index: "document.querySelectorAll('.card').length === 13"
};

test('every library page runs without a script error, and its demonstration draws', { skip: !CHROME && 'no Chrome here' }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-docs-site-'));
  execFileSync(process.execPath, [path.join(ROOT, 'packages/viewer/scripts/build.mjs')], { stdio: 'ignore' });
  execFileSync(process.execPath, [path.join(ROOT, 'docs/build.mjs'), '--out', out], { stdio: 'ignore' });
  const server = http.createServer((req, res) => {
    let file = path.join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-docs-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}/profile`, '--no-first-run', '--window-size=1200,900', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((r, no) => { let buf = ''; chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) r(m[0]); }); setTimeout(() => no(new Error('Chrome did not start')), 20000).unref(); });
    const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const waiting = new Map(), errors = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
    });
    const send = (method, params = {}, sessionId) => new Promise((r, no) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); setTimeout(() => no(new Error(`Chrome didn't answer ${method}`)), 60000).unref(); });
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId); await send('Log.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.result?.value;
    const pages = ['index', ...fs.readdirSync(path.join(out, 'docs')).filter((d) => d !== 'assets' && fs.statSync(path.join(out, 'docs', d)).isDirectory())];
    const problems = [];
    for (const p of pages) {
      errors.length = 0;
      await send('Page.navigate', { url: `http://localhost:${port}/docs/${p === 'index' ? '' : `${p}/`}` }, sessionId);
      let ok = !drawn[p];
      for (let t = 0; t < 40 && !ok; t++) { await new Promise((r) => setTimeout(r, 250)); ok = await run(drawn[p]); }
      await new Promise((r) => setTimeout(r, 400));
      if (process.env.DOCS_SHOTS) fs.writeFileSync(path.join(process.env.DOCS_SHOTS, `${p}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, sessionId)).result.data, 'base64'));
      if (!ok) problems.push(`${p}: its demonstration drew nothing`);
      for (const e of errors) problems.push(`${p}: ${e}`);
    }
    assert.deepEqual(problems, []);
  } finally { chrome.kill(); server.close(); fs.rmSync(out, { recursive: true, force: true }); }
});

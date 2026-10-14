// preview(parts, { title, meta, out, explode }) -> out: a 1800 × 1200 PNG of six views (front, side, 3/4, top, bottom, 3/4 below),
// parts: [{ name, role, label, item, triangles }]; supports and references are drawn faint (lines only); explode drops
// supports below and, in an assembly, lifts each kind of object above the one before (plate, switches, keycaps).
// rendered by headless Chrome from lib/preview/page.html, served on this Mac only for the few seconds it takes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { TOOL } from './workspace.mjs';

// Any Chrome or Chromium: $CAD_CHROME, else the usual places on macOS, Linux and Windows
const CHROME = process.env.CAD_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((f) => fs.existsSync(f));
const THREE = path.dirname(createRequire(import.meta.url).resolve('three')); // wherever npm put it

export async function preview(parts, { title = '', meta = '', out, explode = false }) {
  const flat = (tris) => { const positions = []; for (const t of tris) for (let i = 1; i < t.length - 1; i++) positions.push(...t[0], ...t[i], ...t[i + 1]); return positions; };
  const data = JSON.stringify({ title, meta, explode, parts: parts.map((p) => ({ name: p.name, role: p.role, label: p.label, item: p.object || p.item, positions: flat(p.triangles) })) });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x').pathname;
    const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
    if (u === '/') return send('text/html', fs.readFileSync(path.join(TOOL, 'lib/preview/page.html')));
    if (u === '/data.json') return send('application/json', data);
    const f = path.join(THREE, path.basename(u)); // only three's build files
    if (u.startsWith('/three/') && fs.existsSync(f)) return send('text/javascript', fs.readFileSync(f));
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-preview-'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    await new Promise((resolve, reject) => {
      if (!CHROME) return reject(new Error('no Chrome or Chromium found for previews: set CAD_CHROME to one'));
      const p = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--window-size=1800,1200', '--virtual-time-budget=8000', `--screenshot=${out}`, `http://127.0.0.1:${server.address().port}/`], { stdio: 'ignore' });
      const t = setTimeout(() => { p.kill(); reject(new Error('Chrome took too long to render the preview')); }, 60000);
      p.on('exit', () => { clearTimeout(t); fs.existsSync(out) ? resolve() : reject(new Error('Chrome made no screenshot')); });
    });
  } finally {
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return out;
}

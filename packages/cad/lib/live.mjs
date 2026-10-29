// The live view of an optimisation: `cad optimise <ref> --watch [port]` serves a page that draws the densities as
// they change, charts the progress and can stop the run. The optimiser runs on the main thread and blocks it, so the
// server runs in a worker: the main thread posts each step to it, and the page's stop button sets a shared flag the
// main thread reads between steps.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { surface } from '@rulecad/topopt';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

/**
 * Starts the server; resolves once it listens.
 * @param {{ port?: number, host?: string, title: string }} o host: 127.0.0.1 unless asked (Tailscale's userspace mode
 *   forwards to it; plain 0.0.0.0 would open it to the local network)
 * @returns {Promise<{ url: string, step: (s: object) => void, stopped: () => boolean, close: (summary?: string) => Promise<void> }>}
 */
export function liveView({ port = 8090, host = '127.0.0.1', title }) {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(new URL(import.meta.url), { workerData: { port, host, title, flag } });
  return new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('message', (m) => {
      if (m.error) { worker.terminate(); reject(new Error(`the live view can't listen on ${host}:${port}: ${m.error}`)); return; }
      worker.off('error', reject).on('error', (e) => console.error(`the live view stopped: ${e.message}`));
      resolve({
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${m.listening}/`,
        step: (s) => {
          const list = views(s.density, s.grid);
          const { nx, ny, nz, h } = s.grid;
          // A 3D grid's densities too, a byte a cell, for its surface (drawn when the page asks for it)
          const cells = nz > 1 ? Uint8Array.from(s.density, (d) => Math.round(d * 255)) : null;
          worker.postMessage({ grid: { nx, ny, nz, h }, step: s.step, steps: s.steps, compliance: s.compliance, change: s.change, beta: s.beta, volume: s.volume, stress: s.stress, views: list, cells },
            [...list.map((v) => v.image.buffer), ...(cells ? [cells.buffer] : [])]);
        },
        stopped: () => Atomics.load(flag, 0) === 1,
        // hold: keep showing the end for this long (ms), for whoever opens the page late
        close: (summary, { hold = 0 } = {}) => new Promise((done) => { worker.once('exit', () => done()); worker.postMessage({ done: summary ?? 'finished', hold }); }),
      });
    });
  });
}

// Densities as bytes, one per pixel: a 2D layout as it is, a 3D grid as three views, each pixel the densest cell
// along its line of sight
function views(d, { nx, ny, nz = 1 }) {
  const view = (name, w, h) => ({ name, w, h, image: new Uint8Array(w * h) });
  const z = view(nz > 1 ? 'along z' : '', nx, ny), y = view('along y', nx, nz), x = view('along x', ny, nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = Math.round(d[(k * ny + j) * nx + i] * 255);
    if (v > z.image[j * nx + i]) z.image[j * nx + i] = v;
    if (v > y.image[k * nx + i]) y.image[k * nx + i] = v;
    if (v > x.image[k * ny + j]) x.image[k * ny + j] = v;
  }
  return nz > 1 ? [y, x, z] : [z];
}

const page = (title) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px;max-width:900px}canvas{background:#000;border-radius:6px}.chart{width:100%}#hint{color:#888;font-size:12px;text-align:center;margin:-4px 0 8px}#model{height:50vh;margin-bottom:8px;border-radius:6px;overflow:hidden;background:#000;cursor:grab;touch-action:none}#views{display:flex;gap:8px;align-items:flex-end}figure{flex:1;min-width:0;margin:0;text-align:center}figure canvas{width:100%;height:40vh;object-fit:contain;background:none}figcaption{color:#aaa;font-size:13px;text-align:center}
#chart{height:160px;touch-action:none}#scrub{display:flex;gap:8px;align-items:center}#scrub input{flex:1}#live{background:#357}table{border-collapse:collapse;margin:10px 0;width:100%}td{padding:3px 8px 3px 0;vertical-align:top}td:first-child{color:#999;white-space:nowrap;width:1%}button{font:inherit;padding:8px 16px;border-radius:6px;border:0;background:#d33;color:#fff}button:disabled{background:#555}#state{margin:10px 0}</style>
<h2>${title}</h2><div id="state">waiting for the first step…</div><div id="model" hidden></div><div id="hint" hidden>drag to turn it · double-tap to stop or start it turning</div><div id="views"></div><canvas class="chart" id="chart" width="900" height="160"></canvas><div id="scrub"><input type="range" id="at" min="0" max="0" value="0"><button id="live" disabled>Live</button></div><table id="facts"></table>
<p><button id="stop">Stop the run</button> <span id="note"></span></p>
<script>
const views = document.getElementById('views'), facts = document.getElementById('facts'), state = document.getElementById('state'), stop = document.getElementById('stop');
let history = { compliance: [], change: [] }, about = [], last = null, finished = null, follow = true, shown = 0, newest = null;
const at = document.getElementById('at'), live = document.getElementById('live'), chart = document.getElementById('chart');
const fig = (n) => Number(n.toPrecision(3)), esc = (t) => String(t).replace(/[&<]/g, (c) => c === '&' ? '&amp;' : '&lt;');
const time = (s) => s == null ? '…' : s < 60 ? s.toFixed(s < 10 ? 1 : 0) + ' s' : Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s';
function table() {
  const f = last, rows = f ? [
    ['Step', f.step + ' of at most ' + f.steps + (follow ? '' : ' (looking back: ' + history.compliance.length + ' so far)')],
    ['Run time', time(f.elapsed)], ['Per step', time(f.perStep) + ' (the last ten)'],
    ...(finished || !follow ? [] : [['Time left', 'at most ' + time(f.left) + ' (it may settle sooner)']]),
    ['Compliance', fig(f.compliance) + ' N·mm, from ' + fig(history.compliance[0]) + (history.compliance[0] > f.compliance ? ': ' + fig(history.compliance[0] / f.compliance) + ' times as stiff' : '')],
    ['Change', fig(f.change) + ' (the most any cell moved this step)'], ['Sharpness', f.beta],
    ...(f.volume != null ? [['Material', fig(f.volume * 100) + '% of the space']] : []), ...(f.stress != null ? [['Peak stress', fig(f.stress) + ' MPa']] : []),
    ['Cells', [f.grid.nx, f.grid.ny, f.grid.nz].filter(Boolean).join(' × ') + (f.grid.h ? ' of ' + f.grid.h + ' mm' : '') + ' (' + (f.grid.nx * f.grid.ny * (f.grid.nz || 1)).toLocaleString('en-GB') + ')'],
  ] : [];
  facts.innerHTML = [...(finished ? [['Result', finished]] : []), ...rows, ...about].map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('');
}
function draw(f) {
  document.getElementById('model').hidden = document.getElementById('hint').hidden = f.views.length < 3;
  if (views.children.length !== f.views.length) views.innerHTML = f.views.map((v) => '<figure><canvas></canvas><figcaption>' + v.name + '</figcaption></figure>').join('');
  f.views.forEach((v, n) => {
    const c = views.children[n].firstChild; if (c.width !== v.w) { c.width = v.w; c.height = v.h; }
    const ctx = c.getContext('2d'), img = ctx.createImageData(v.w, v.h), d = atob(v.image);
    for (let j = 0; j < v.h; j++) for (let i = 0; i < v.w; i++) { const g = 255 - d.charCodeAt(j * v.w + i), o = ((v.h - 1 - j) * v.w + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = g; img.data[o + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  });
  last = f; state.textContent = finished ? finished : 'step ' + f.step + ' · ' + time(f.elapsed);
}
// Both against step: compliance on the left axis, change on the right on a log scale (it falls by orders of
// magnitude); the step shown marked
function plot() {
  const c = chart.getContext('2d'), w = chart.width, h = chart.height, n = history.compliance.length; c.clearRect(0, 0, w, h);
  if (n < 2) return;
  const line = (data, log, colour) => {
    const ys = data.map((v) => log ? Math.log10(Math.max(v, 1e-6)) : v), lo = Math.min(...ys), hi = Math.max(...ys);
    c.strokeStyle = colour; c.lineWidth = 2; c.beginPath();
    ys.forEach((v, k) => { const x = k / (n - 1) * w, y = h - 8 - (v - lo) / (hi - lo || 1) * (h - 28); k ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
  };
  line(history.compliance, false, '#6cf'); line(history.change, true, '#fc6');
  const x = shown / (n - 1) * w; c.strokeStyle = '#fff8'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
  c.font = '12px system-ui'; c.fillStyle = '#6cf'; c.fillText('compliance, N·mm: ' + fig(history.compliance[0]) + ' to ' + fig(history.compliance.at(-1)), 8, 14);
  c.fillStyle = '#fc6'; c.textAlign = 'right'; c.fillText('change (log scale): ' + fig(history.change[0]) + ' to ' + fig(history.change.at(-1)), w - 8, 14); c.textAlign = 'left';
}
// The 3D view's step: remembered, so the 3D script picks it up when it loads (it loads after the first steps arrive)
const want3d = (n, grid) => { window.wanted3d = [n, grid]; window.model3d?.(n, grid); };
function show(f) { draw(f); plot(); table(); want3d(shown, f.grid); }
let lastModel = 0; // while following, a new surface at most every two seconds
// Scrubbing: any earlier step, fetched when asked for; the newest only while following
let asked = 0;
async function lookAt(k) {
  const n = history.compliance.length; k = Math.max(0, Math.min(n - 1, k)); shown = k; at.value = k;
  follow = k === n - 1; live.disabled = follow;
  if (follow && newest) return show(newest);
  const ask = ++asked, f = await (await fetch('frame/' + k)).json();
  if (ask === asked) show(f);
}
at.oninput = () => lookAt(Number(at.value));
live.onclick = () => lookAt(history.compliance.length - 1);
chart.onpointerdown = chart.onpointermove = (e) => { if (e.type === 'pointermove' && !e.buttons) return; const r = chart.getBoundingClientRect(); lookAt(Math.round((e.clientX - r.left) / r.width * (history.compliance.length - 1))); };
const events = new EventSource('events');
events.onmessage = (e) => { const m = JSON.parse(e.data); if (m.about) about = m.about; if (m.history) history = m.history;
  if (m.done) { finished = m.done; stop.disabled = true; events.close(); }
  at.max = Math.max(0, history.compliance.length - 1);
  if (m.frame) newest = m.frame;
  if (follow) { shown = Number(at.max); at.value = shown; if (newest) draw(newest); if (Date.now() - lastModel > 2000 || finished) { lastModel = Date.now(); want3d(shown, newest.grid); } }
  if (finished) state.textContent = finished;
  plot(); table(); };
stop.onclick = async () => { stop.disabled = true; await fetch('stop', { method: 'POST' }); document.getElementById('note').textContent = 'stopping after this step'; };
</script>
<script type="importmap">{ "imports": { "three": "/three/three.module.js" } }</script>
<script type="module">
// The 3D view: the step's surface, turning slowly; drag to turn it, double-tap to stop or start it turning
import * as THREE from 'three';
const box = document.getElementById('model');
let renderer, scene, camera, mesh, yaw = 0.6, tilt = 0.4, spin = true, size = 1, centre = null, busy = false, wanted = null, current = null;
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); box.appendChild(renderer.domElement);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e6); camera.up.set(0, 0, 1);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-1, -2, 3); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(2, 1, -1); scene.add(fill);
  const c = renderer.domElement; let last = null;
  c.onpointerdown = (e) => { last = [e.clientX, e.clientY]; spin = false; c.setPointerCapture(e.pointerId); };
  c.onpointermove = (e) => { if (!last) return; yaw -= (e.clientX - last[0]) * 0.01; tilt = Math.max(-1.4, Math.min(1.4, tilt + (e.clientY - last[1]) * 0.01)); last = [e.clientX, e.clientY]; };
  c.onpointerup = () => { last = null; };
  c.ondblclick = () => { spin = !spin; };
  const tick = () => {
    const w = box.clientWidth, h = box.clientHeight;
    if (w && (c.width !== Math.round(w * devicePixelRatio) || c.height !== Math.round(h * devicePixelRatio))) { renderer.setPixelRatio(devicePixelRatio); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (spin) yaw += 0.004;
    // Far enough to fit the grid's half-diagonal in view, less a little: the part seldom fills its grid's corners
    const d = size / Math.sin(camera.fov * Math.PI / 360) * 0.8;
    camera.position.set(d * Math.cos(tilt) * Math.cos(yaw), d * Math.cos(tilt) * Math.sin(yaw), d * Math.sin(tilt)); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera); requestAnimationFrame(tick);
  };
  tick();
}
async function load(n, grid) {
  if (n === current) return;
  if (busy) { wanted = [n, grid]; return; }
  busy = true;
  try {
    const res = await fetch('mesh/' + n);
    if (!res.ok) return;
    const buf = await res.arrayBuffer(), [nv, nf] = new Uint32Array(buf, 0, 2);
    if (!renderer) setup();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 8, nv * 3), 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, 8 + nv * 12, nf * 3), 1));
    g.computeVertexNormals();
    // Framed on the whole grid, so the part stays put as it changes
    if (!centre) { const e = [grid.nx, grid.ny, grid.nz].map((n) => n * grid.h); centre = new THREE.Vector3(e[0] / 2, e[1] / 2, e[2] / 2); size = Math.hypot(...e) / 2; }
    g.translate(-centre.x, -centre.y, -centre.z);
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }));
    scene.add(mesh); current = n;
  } finally {
    busy = false;
    if (wanted != null) { const [w, wg] = wanted; wanted = null; load(w, wg); }
  }
}
window.model3d = (n, grid) => { if (!box.hidden && grid) load(n, grid); };
if (window.wanted3d) window.model3d(...window.wanted3d);
</script>`;

const THREE = path.dirname(createRequire(import.meta.url).resolve('three')); // three's build files, for the 3D view

if (!isMainThread && workerData?.flag) {
  const { port, host, title, flag } = workerData, clients = new Set(), history = { compliance: [], change: [] }, frames = [], densities = [], meshes = new Map(), times = [], t0 = Date.now();
  // What a reader might want beside the numbers of each step: what ran it, where and when
  const cpus = os.cpus(), about = [['Started', new Date(t0).toLocaleString('en-GB')], ['Machine', `${cpus[0]?.model.trim() ?? os.arch()}, ${cpus.length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`],
    ['Software', `@rulecad/cad ${JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}, Node ${process.versions.node}, ${os.type()}`]];
  let latest = null, sent = null, done = null;
  const send = (res, m) => res.write(`data: ${JSON.stringify(m)}\n\n`);
  const frame = (f) => ({ ...f, views: f.views.map((v) => ({ ...v, image: Buffer.from(v.image).toString('base64') })) });
  const server = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      send(res, { about, history, ...(latest ? { frame: latest } : {}), ...(done ? { done } : {}) });
      clients.add(res); req.on('close', () => clients.delete(res));
    // Any earlier step, for the scrubber: every one is kept (about a byte a pixel of its views)
    } else if (req.url.startsWith('/mesh/') && densities[Number(req.url.slice(6))]) {
      // A step's surface: vertex and face counts, then the vertices (float32 x, y, z) and the faces (uint32 corners).
      // The last few are kept, as the page asks for the same step again while it turns.
      const n = Number(req.url.slice(6));
      if (!meshes.has(n)) {
        const g = frames[n].grid, { vertices, faces } = surface(g, Float64Array.from(densities[n], (d) => d / 255), [0, 0, 0]);
        const buf = Buffer.alloc(8 + vertices.length * 12 + faces.length * 12), out = new DataView(buf.buffer, buf.byteOffset);
        out.setUint32(0, vertices.length, true); out.setUint32(4, faces.length, true);
        vertices.forEach((v, i) => { for (let a = 0; a < 3; a++) out.setFloat32(8 + (i * 3 + a) * 4, v[a], true); });
        faces.forEach((f, i) => { for (let a = 0; a < 3; a++) out.setUint32(8 + vertices.length * 12 + (i * 3 + a) * 4, f[a], true); });
        meshes.set(n, buf); if (meshes.size > 4) meshes.delete(meshes.keys().next().value);
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(meshes.get(n));
    } else if (req.url.startsWith('/three/') && fs.existsSync(path.join(THREE, path.basename(req.url)))) {
      res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fs.readFileSync(path.join(THREE, path.basename(req.url))));
    } else if (req.url.startsWith('/frame/') && frames[Number(req.url.slice(7))]) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(frames[Number(req.url.slice(7))]));
    } else if (req.url === '/stop' && req.method === 'POST') { Atomics.store(flag, 0, 1); res.end('stopping'); }
    else if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(title)); }
    else { res.writeHead(404); res.end(); }
  });
  // At most four frames a second, whatever the optimiser's pace
  const tick = setInterval(() => { if (latest && latest !== sent) { sent = latest; const m = { history, frame: latest }; for (const c of clients) send(c, m); } }, 250);
  parentPort.on('message', (m) => {
    if (m.done) {
      done = m.done; clearInterval(tick);
      for (const c of clients) { send(c, { history, ...(latest ? { frame: latest } : {}), done }); c.end(); }
      const shut = () => { server.close(); server.closeAllConnections(); parentPort.close(); };
      if (m.hold) setTimeout(shut, m.hold); else shut();
      return;
    }
    // Timing: the mean of the last ten steps, and what's left at that pace (at most: it may settle sooner)
    const now = Date.now(); times.push(now);
    const last = times.slice(-11), perStep = last.length > 1 ? (last.at(-1) - last[0]) / (last.length - 1) / 1000 : null;
    const { cells, ...rest } = m; m = rest; densities.push(cells);
    latest = frame({ ...m, elapsed: (now - t0) / 1000, perStep, left: perStep && (m.steps - m.step) * perStep }); frames.push(latest);
    history.compliance.push(m.compliance); history.change.push(m.change);
  });
  server.once('error', (e) => parentPort.postMessage({ error: e.code || e.message }));
  server.listen(port, host, () => parentPort.postMessage({ listening: server.address().port }));
}

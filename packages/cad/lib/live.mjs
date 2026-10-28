// The live view of an optimisation: `cad optimise <ref> --watch [port]` serves a page that draws the densities as
// they change, charts the progress and can stop the run. The optimiser runs on the main thread and blocks it, so the
// server runs in a worker: the main thread posts each step to it, and the page's stop button sets a shared flag the
// main thread reads between steps.
import http from 'node:http';
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
        // Densities as bytes, one per cell; a 3D grid seen from above (the densest cell in each column)
        step: (s) => {
          const { nx, ny, nz = 1 } = s.grid, image = new Uint8Array(nx * ny);
          for (let k = 0; k < nz; k++) for (let c = 0; c < nx * ny; c++) image[c] = Math.max(image[c], Math.round(s.density[k * nx * ny + c] * 255));
          worker.postMessage({ step: s.step, steps: s.steps, compliance: s.compliance, change: s.change, beta: s.beta, volume: s.volume, stress: s.stress, nx, ny, flat: nz > 1, image }, [image.buffer]);
        },
        stopped: () => Atomics.load(flag, 0) === 1,
        close: (summary) => new Promise((done) => { worker.once('exit', () => done()); worker.postMessage({ done: summary ?? 'finished' }); }),
      });
    });
  });
}

const page = (title) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px;max-width:900px}canvas{width:100%;image-rendering:pixelated;background:#000;border-radius:6px}
#chart{height:140px;image-rendering:auto}button{font:inherit;padding:8px 16px;border-radius:6px;border:0;background:#d33;color:#fff}button:disabled{background:#555}#state{margin:10px 0}</style>
<h2>${title}</h2><div id="state">waiting for the first step…</div><canvas id="part"></canvas><canvas id="chart" width="900" height="140"></canvas>
<p><button id="stop">Stop the run</button> <span id="note"></span></p>
<script>
const part = document.getElementById('part'), chart = document.getElementById('chart'), state = document.getElementById('state'), stop = document.getElementById('stop');
let history = [];
const fig = (n) => Number(n.toPrecision(3));
function draw(f) {
  if (part.width !== f.nx) { part.width = f.nx; part.height = f.ny; }
  const ctx = part.getContext('2d'), img = ctx.createImageData(f.nx, f.ny), d = atob(f.image);
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const v = 255 - d.charCodeAt(j * f.nx + i), o = ((f.ny - 1 - j) * f.nx + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  state.textContent = 'step ' + f.step + ' of ' + f.steps + ' · compliance ' + fig(f.compliance) + ' N·mm' + (f.volume != null ? ' · ' + fig(f.volume * 100) + '% of the space' : '') + (f.stress != null ? ' · peak stress ' + fig(f.stress) + ' MPa' : '') + ' · sharpness ' + f.beta + (f.flat ? ' · seen from above' : '');
}
function plot() {
  const c = chart.getContext('2d'), w = chart.width, h = chart.height; c.clearRect(0, 0, w, h);
  if (history.length < 2) return;
  const lo = Math.min(...history), hi = Math.max(...history) || 1; c.strokeStyle = '#6cf'; c.lineWidth = 2; c.beginPath();
  history.forEach((v, k) => { const x = k / (history.length - 1) * w, y = h - 8 - (v - lo) / (hi - lo || 1) * (h - 16); k ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.stroke(); c.fillStyle = '#aaa'; c.fillText('compliance: ' + fig(hi) + ' to ' + fig(history.at(-1)) + ' N·mm', 8, 14);
}
const events = new EventSource('events');
events.onmessage = (e) => { const m = JSON.parse(e.data); if (m.history) history = m.history; if (m.frame) draw(m.frame); plot();
  if (m.done) { state.textContent += ' · ' + m.done; stop.disabled = true; events.close(); } };
stop.onclick = async () => { stop.disabled = true; await fetch('stop', { method: 'POST' }); document.getElementById('note').textContent = 'stopping after this step'; };
</script>`;

if (!isMainThread && workerData?.flag) {
  const { port, host, title, flag } = workerData, clients = new Set(), history = [];
  let latest = null, sent = null, done = null;
  const send = (res, m) => res.write(`data: ${JSON.stringify(m)}\n\n`);
  const frame = (f) => ({ ...f, image: Buffer.from(f.image).toString('base64') });
  const server = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      send(res, { history, ...(latest ? { frame: frame(latest) } : {}), ...(done ? { done } : {}) });
      clients.add(res); req.on('close', () => clients.delete(res));
    } else if (req.url === '/stop' && req.method === 'POST') { Atomics.store(flag, 0, 1); res.end('stopping'); }
    else if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(title)); }
    else { res.writeHead(404); res.end(); }
  });
  // At most four frames a second, whatever the optimiser's pace
  const tick = setInterval(() => { if (latest && latest !== sent) { sent = latest; const m = { history, frame: frame(latest) }; for (const c of clients) send(c, m); } }, 250);
  parentPort.on('message', (m) => {
    if (m.done) {
      done = m.done; clearInterval(tick);
      for (const c of clients) { send(c, { history, ...(latest ? { frame: frame(latest) } : {}), done }); c.end(); }
      server.close(); server.closeAllConnections(); parentPort.close(); return;
    }
    latest = m; history.push(m.compliance);
  });
  server.once('error', (e) => parentPort.postMessage({ error: e.code || e.message }));
  server.listen(port, host, () => parentPort.postMessage({ listening: server.address().port }));
}

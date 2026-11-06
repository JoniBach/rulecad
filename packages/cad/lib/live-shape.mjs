// The live view of a flexure being shaped (@rulecad/flexures shapeCurve): a page that draws each round of the search
// as it goes (every shape tried, faint; the best so far at its thickness, mirrored if it is, with how it bends when
// drawn), charts its peak strain and stored energy, can look back at any round, and can stop the run. Like the
// optimiser's live view (live.mjs), the server runs in a worker, since the search blocks the main thread: the main
// thread posts each round, and the page's stop button sets a shared flag it reads between rounds.
import http from 'node:http';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

/**
 * Starts the server; resolves once it listens.
 * @param {{ port?: number, host?: string, title: string, job: { region: { lo: number[], hi: number[] }, root: number[], tip: number[], mirror?: number, travel?: number, moves?: string } }} o
 * @returns {Promise<{ url: string, round: (r: object) => void, stopped: () => boolean, close: (summary?: string, o?: { hold?: number }) => Promise<void> }>}
 */
export function liveShape({ port = 8090, host = '127.0.0.1', title, job }) {
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const setup = { room: job.region, root: job.root, tip: job.tip, mirror: job.mirror ?? null, travel: job.travel ?? 0, moves: job.moves ?? 'y' };
  const worker = new Worker(new URL(import.meta.url), { workerData: { port, host, title, flag, setup } });
  return new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('message', (m) => {
      if (m.error) { worker.terminate(); reject(new Error(`the live view can't listen on ${host}:${port}: ${m.error}`)); return; }
      worker.off('error', reject).on('error', (e) => console.error(`the live view stopped: ${e.message}`));
      resolve({
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${m.listening}/`,
        // A round: the paths thinned to every other point (plenty to see by), numbers to three figures
        round: (r) => {
          const thin = (p) => p?.filter((_, i, a) => i % 2 === 0 || i === a.length - 1).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
          worker.postMessage({ phase: r.phase, round: r.round, evaluations: r.evaluations, limit: r.limit, want: r.want,
            tried: r.tried.map(thin), best: r.best && { ...r.best, path: r.best.path.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]), at: r.best.at?.map((t) => +t.toFixed(3)), drawn: thin(r.best.drawn) } });
        },
        stopped: () => Atomics.load(flag, 0) === 1,
        close: (summary, { hold = 0 } = {}) => new Promise((done) => { worker.once('exit', () => done()); worker.postMessage({ done: summary ?? 'finished', hold }); }),
      });
    });
  });
}

const page = (title) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px;max-width:900px}svg{width:100%;background:#000;border-radius:6px}#view{height:55vh}
#chart{height:150px;margin-top:8px}#scrub{display:flex;gap:8px;align-items:center;position:sticky;bottom:0;background:#111;padding:10px 0;border-top:1px solid #222}#scrub input{flex:1;height:32px}#at-round{color:#aaa;font-size:13px;min-width:6em}
table{border-collapse:collapse;margin:10px 0;width:100%}td{padding:3px 8px 3px 0;vertical-align:top}td:first-child{color:#999;white-space:nowrap;width:1%}button{font:inherit;padding:8px 16px;border-radius:6px;border:0;background:#d33;color:#fff}button:disabled{background:#555}#live{background:#357}.key{color:#aaa;font-size:13px}.key b{display:inline-block;width:14px;height:4px;vertical-align:middle;margin:0 4px 0 12px}</style>
<h2>${title}</h2><div id="state">waiting for the first round…</div>
<svg id="view"></svg>
<div class="key"><b style="background:#e07a1f"></b>best so far<b style="background:#e07a1f55"></b>tried this round<b style="background:#999"></b>the best, drawn back<b style="background:#4a8"></b>its room</div>
<svg id="chart" viewBox="0 0 900 150" preserveAspectRatio="none"></svg>
<div class="key"><b style="background:#6cf"></b>peak strain, share of the limit<b style="background:#fc6"></b>energy stored, share of what's asked</div>
<div id="scrub"><span id="at-round"></span><input type="range" id="at" min="0" max="0" value="0"><button id="live" disabled>Live</button></div>
<table id="facts"></table><p><button id="stop">Stop the run</button> <span id="note"></span></p>
<script>
const view = document.getElementById('view'), chart = document.getElementById('chart'), facts = document.getElementById('facts'), state = document.getElementById('state');
const at = document.getElementById('at'), live = document.getElementById('live'), stop = document.getElementById('stop');
let setup = null, history = [], newest = null, follow = true, finished = null, t0 = Date.now();
const esc = (t) => String(t).replace(/[&<]/g, (c) => c === '&' ? '&amp;' : '&lt;'), pct = (x) => (x * 100).toFixed(2) + '%';
const line = (p, attrs) => p && p.length ? '<polyline points="' + p.map(([x, y]) => x + ',' + (-y)).join(' ') + '" fill="none" ' + attrs + '/>' : '';
const mirrored = (p) => setup.mirror == null ? null : p && p.map(([x, y]) => [x, 2 * setup.mirror - y]);
// The best shape at its thickness: each span a line as thick as the arm is there, round-capped
const thick = (p, at) => p.slice(1).map((b, i) => { const a = p[i]; return '<line x1="' + a[0] + '" y1="' + (-a[1]) + '" x2="' + b[0] + '" y2="' + (-b[1]) + '" stroke="#e07a1f" stroke-width="' + ((at[i] + at[i + 1]) / 2 || 1) + '" stroke-linecap="round"/>'; }).join('');
function draw(f) {
  const r = setup.room, ys = [r.lo[1], r.hi[1], ...(setup.mirror != null ? [2 * setup.mirror - r.lo[1], 2 * setup.mirror - r.hi[1]] : [])];
  const lo = [Math.min(r.lo[0], setup.tip[0], setup.root[0]) - 4, Math.min(...ys) - 4], hi = [Math.max(r.hi[0], setup.tip[0], setup.root[0]) + 4, Math.max(...ys) + 4];
  view.setAttribute('viewBox', lo[0] + ' ' + (-hi[1]) + ' ' + (hi[0] - lo[0]) + ' ' + (hi[1] - lo[1]));
  const box = (y0, y1) => '<rect x="' + r.lo[0] + '" y="' + (-Math.max(y0, y1)) + '" width="' + (r.hi[0] - r.lo[0]) + '" height="' + Math.abs(y1 - y0) + '" fill="none" stroke="#4a8" stroke-width="0.25" stroke-dasharray="1 1"/>';
  let s = box(r.lo[1], r.hi[1]) + (setup.mirror != null ? box(2 * setup.mirror - r.lo[1], 2 * setup.mirror - r.hi[1]) : '');
  for (const p of f.tried || []) s += line(p, 'stroke="#e07a1f" stroke-opacity="0.25" stroke-width="0.3"') + line(mirrored(p), 'stroke="#e07a1f" stroke-opacity="0.25" stroke-width="0.3"');
  if (f.best) {
    s += line(f.best.drawn, 'stroke="#999" stroke-width="0.4"') + line(mirrored(f.best.drawn), 'stroke="#999" stroke-width="0.4"');
    if (f.best.at) s += thick(f.best.path, f.best.at) + (setup.mirror != null ? thick(mirrored(f.best.path), f.best.at) : '');
  }
  s += [setup.root, setup.tip].map(([x, y]) => '<circle cx="' + x + '" cy="' + (-y) + '" r="0.8" fill="#4a8"/>').join('');
  view.innerHTML = s;
  const b = f.best || {};
  const rows = [['Round', f.round + ' (' + f.phase + ')'], ['Shapes tried', f.evaluations], ['Run time', (f.elapsed ?? 0).toFixed(0) + ' s'],
    ...(b.strain != null ? [['Peak strain', pct(b.strain) + ' (' + pct(b.strain / f.limit) + ' of the ' + pct(f.limit) + ' it may reach)'], ['Energy stored', b.energy.toFixed(1) + ' mJ printed ' + b.width.toFixed(1) + ' mm tall (asked: ' + f.want.toFixed(1) + ')']] : []),
    ...(b.why && b.why.length ? [['Still wrong', b.why.join('; ')]] : b.strain != null ? [['Still wrong', 'nothing']] : [])];
  facts.innerHTML = [...(finished ? [['Result', finished]] : []), ...rows].map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('');
  document.getElementById('at-round').textContent = 'round ' + f.round;
  state.textContent = finished || (f.phase + ' · round ' + f.round);
}
function plot(shown) {
  const n = history.length; if (n < 2) { chart.innerHTML = ''; return; }
  const path = (k, colour) => { const ys = history.map((h) => Math.min(2, h[k] ?? 2)); return '<polyline points="' + ys.map((v, i) => (i / (n - 1) * 900) + ',' + (145 - v / 2 * 140)).join(' ') + '" fill="none" stroke="' + colour + '" stroke-width="2"/>'; };
  const one = 145 - 70, x = shown / (n - 1) * 900;
  chart.innerHTML = '<line x1="0" x2="900" y1="' + one + '" y2="' + one + '" stroke="#555" stroke-dasharray="4 4"/><text x="4" y="' + (one - 4) + '" fill="#888" font-size="11">100%</text>' + path('strain', '#6cf') + path('energy', '#fc6') + '<line x1="' + x + '" x2="' + x + '" y1="0" y2="150" stroke="#fff8"/>';
}
async function lookAt(k) {
  const n = history.length; k = Math.max(0, Math.min(n - 1, k)); at.value = k; follow = k === n - 1; live.disabled = follow;
  const f = follow && newest ? newest : await (await fetch('round/' + k)).json();
  draw(f); plot(k);
}
at.oninput = () => lookAt(Number(at.value)); live.onclick = () => lookAt(history.length - 1);
const events = new EventSource('events');
events.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.setup) setup = m.setup; if (m.t0) t0 = m.t0; if (m.history) history = m.history; if (m.frame) newest = m.frame;
  if (m.done) { finished = m.done; stop.disabled = true; events.close(); }
  at.max = Math.max(0, history.length - 1);
  if (follow && newest && setup) { at.value = at.max; draw(newest); }
  plot(Number(at.value)); };
stop.onclick = async () => { stop.disabled = true; await fetch('stop', { method: 'POST' }); document.getElementById('note').textContent = 'stopping after this round'; };
</script>`;

if (!isMainThread && workerData?.flag && workerData?.setup) {
  const { port, host, title, flag, setup } = workerData, clients = new Set(), frames = [], history = [], t0 = Date.now();
  let latest = null, sent = null, done = null;
  const send = (res, m) => res.write(`data: ${JSON.stringify(m)}\n\n`);
  const server = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      send(res, { setup, t0, history, ...(latest ? { frame: latest } : {}), ...(done ? { done } : {}) });
      clients.add(res); req.on('close', () => clients.delete(res));
    } else if (req.url.startsWith('/round/') && frames[Number(req.url.slice(7))]) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(frames[Number(req.url.slice(7))]));
    } else if (req.url === '/stop' && req.method === 'POST') { Atomics.store(flag, 0, 1); res.end('stopping'); }
    else if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(title)); }
    else { res.writeHead(404); res.end(); }
  });
  // At most four updates a second, whatever the search's pace
  const tick = setInterval(() => { if (latest && latest !== sent) { sent = latest; const m = { history, frame: latest }; for (const c of clients) send(c, m); } }, 250);
  parentPort.on('message', (m) => {
    if (m.done) {
      done = m.done; clearInterval(tick);
      for (const c of clients) { send(c, { history, ...(latest ? { frame: latest } : {}), done }); c.end(); }
      const shut = () => { server.close(); server.closeAllConnections(); parentPort.close(); };
      if (m.hold) setTimeout(shut, m.hold); else shut();
      return;
    }
    m.elapsed = (Date.now() - t0) / 1000; latest = m; frames.push(m);
    history.push({ strain: m.best?.strain != null ? m.best.strain / m.limit : null, energy: m.best?.energy != null ? m.best.energy / m.want : null });
  });
  server.once('error', (e) => parentPort.postMessage({ error: e.code || e.message }));
  server.listen(port, host, () => parentPort.postMessage({ listening: server.address().port }));
}

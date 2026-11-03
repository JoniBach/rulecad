// A lamina mechanism's sequence as data and as a page that plays it: every frame's shapes (the frame drawn once, the
// bodies and the bent flexures frame by frame), the forces acting (contacts and their friction, the hand, the flexures'
// pull on the frame), each flexure's energy and strain, the force curves, the shot and the findings. The data is plain
// JSON for any viewer; the page is self-contained (the data inside it), plays in any browser, phone included, and needs
// nothing installed: scrub, step from state to state, slow the shot down, zoom in on a part, tap a force for its x and y.
const r2 = (n) => Math.round(n * 100) / 100;
const loopsOf = (outlines) => outlines.map((o) => o.flatMap(([x, y]) => [r2(x), r2(y)])); // flat [x, y, x, y, …] a loop

/**
 * The mechanism's sequence as data.
 * @param {object} mechanism what a lamina returns as its mechanism (cad keeps it with the build), frames and all
 * @param {{ title?: string, version?: string, object?: string }} [meta]
 * @returns {object} { title, version, object, kinds, ground, frames: [{ label, from, to, t, parts, forces, energy, strain }],
 *   curves, sequence, limit, friction, trip, shot, findings }: lengths in mm, forces in N, energies in mJ
 */
export function playerData(mechanism, { title = '', version = '', object = '' } = {}) {
  const frames = mechanism.frames || [];
  if (!frames.length) throw new Error('the mechanism has no sequence to play: give its lamina a sequence of states');
  const flexures = new Set(Object.keys(mechanism.joints || {}));
  const kinds = Object.fromEntries([...new Set(frames.flatMap((fr) => Object.keys(fr.parts)))].map((n) => [n, n === 'ground' ? 'ground' : flexures.has(n) ? 'flexure' : 'body']));
  return {
    title, version, object, kinds,
    ground: frames[0].parts.ground ? loopsOf(frames[0].parts.ground) : [],
    frames: frames.map((fr) => ({
      label: fr.label || (fr.from === fr.to ? fr.from : `${fr.from} to ${fr.to}`), from: fr.from, to: fr.to, t: fr.t,
      parts: Object.fromEntries(Object.entries(fr.parts).filter(([n]) => n !== 'ground').map(([n, o]) => [n, loopsOf(o)])),
      ...(fr.forces ? { forces: fr.forces } : {}), ...(fr.energy ? { energy: fr.energy } : {}), ...(fr.strain ? { strain: fr.strain } : {}),
    })),
    curves: (mechanism.curves || []).map((c) => ({ from: c.from, to: c.to, curve: c.curve, events: c.events || [], ...(c.holding ? { holding: c.holding } : {}) })),
    sequence: mechanism.sequence || [], limit: mechanism.limit ?? null, friction: mechanism.friction ?? 0,
    joints: mechanism.joints || {}, trip: mechanism.trip || null, shot: mechanism.shot || null,
    findings: (mechanism.findings || []).map((f) => ({ level: f.level, code: f.code, text: f.text })),
  };
}

/**
 * The page that plays it.
 * @param {object} data playerData's
 * @returns {string} HTML
 */
export function playerHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${data.title} ${data.version}`.trim())}</title>
<style>${CSS}</style></head>
<body>
<header><h1>${esc(data.title)} <span class="v">${esc(data.version)}</span></h1><p id="label"></p></header>
<main>
<div id="stage"><canvas id="view"></canvas><div id="pick" hidden></div><div id="coord"></div></div>
<section id="side">
  <div class="controls">
    <button id="play" title="Play or pause (space)">▶</button><button id="prev" title="Back a frame (←)">‹</button><button id="next" title="On a frame (→)">›</button>
    <select id="speed" title="Speed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
    <button id="fit" title="See it all (0)">⤢</button>
  </div>
  <input id="scrub" type="range" min="0" value="0" step="1" aria-label="frame">
  <div id="steps"></div>
  <details open><summary>Show</summary><div id="layers"></div>
    <label class="row">Arrows <input id="scale" type="range" min="-1.5" max="1.5" step="0.05" value="0"></label></details>
  <details open><summary>This frame</summary><div id="now"></div></details>
  <details open><summary>Force along the step</summary><canvas id="chart" height="150"></canvas><p id="chartNote" class="note"></p></details>
  <details><summary>Findings</summary><ul id="findings"></ul></details>
</section>
</main>
<script id="data" type="application/json">${json}</script>
<script>${SCRIPT}</script>
</body></html>
`;
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font:14px/1.4 system-ui,sans-serif;color:#222;background:#f6f6f4}
header{padding:8px 14px;border-bottom:1px solid #ddd;background:#fff}h1{font-size:16px;margin:0}.v{color:#888;font-weight:400}
#label{margin:2px 0 0;color:#555;min-height:1.4em}
main{display:flex;height:calc(100vh - 62px)}#stage{position:relative;flex:1;min-width:0;background:#fff;touch-action:none}
canvas#view{width:100%;height:100%;display:block;cursor:grab}#side{width:330px;overflow:auto;padding:10px;border-left:1px solid #ddd;background:#fbfbfa}
.controls{display:flex;gap:6px;margin-bottom:6px}button,select{font:inherit;padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer}
#scrub{width:100%}#steps{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}#steps button{padding:3px 8px;font-size:12px}#steps button.on{background:#2f6fb3;color:#fff;border-color:#2f6fb3}
details{margin:8px 0}summary{font-weight:600;cursor:pointer}.row{display:flex;align-items:center;gap:6px;margin:3px 0}.row input[type=range]{flex:1}
.sw{display:inline-block;width:12px;height:12px;border-radius:2px}#now table{width:100%;border-collapse:collapse;font-size:13px}#now td{padding:2px 4px;border-bottom:1px solid #eee}
#now td.n{text-align:right;font-variant-numeric:tabular-nums}.bar{height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden}.bar i{display:block;height:100%}
canvas#chart{width:100%;height:150px;background:#fff;border:1px solid #eee}.note{color:#666;font-size:12px;margin:4px 0}
#findings{padding-left:18px;font-size:12px}#findings li.fail{color:#b00020}#findings li.warn{color:#9a6700}
#pick{position:absolute;left:10px;bottom:10px;background:rgba(255,255,255,.95);border:1px solid #ccc;border-radius:6px;padding:6px 9px;font-size:13px;font-variant-numeric:tabular-nums;max-width:80%}
#coord{position:absolute;right:10px;bottom:10px;color:#888;font-size:12px;font-variant-numeric:tabular-nums}
@media (max-width:760px){main{flex-direction:column;height:auto}#stage{height:62vh}#side{width:auto;border-left:0;border-top:1px solid #ddd}}
`;

// The page's own script (plain browser JavaScript; the data is in #data)
const SCRIPT = String.raw`
const D = JSON.parse(document.getElementById('data').textContent), F = D.frames;
const $ = (id) => document.getElementById(id), view = $('view'), ctx = view.getContext('2d');
const COL = { ground: '#c9ccd1', body: '#2f6fb3', flexure: '#e07a1f', contact: '#7b3fe4', friction: '#0a9396', hand: '#d62828', spring: '#9c4a00' };
const LAYERS = [['frame', 'The frame', COL.ground, true], ['parts', 'Moving parts', COL.body, true], ['strain', 'Springs coloured by strain', '#3a9d3a', true],
  ['contact', 'Contact forces', COL.contact, true], ['friction', 'Friction, apart', COL.friction, false], ['hand', 'The hand', COL.hand, true], ['spring', 'Springs on the frame', COL.spring, false], ['labels', 'Newtons on the arrows', '#444', true]];
const on = Object.fromEntries(LAYERS.map(([k, , , v]) => [k, v]));
$('layers').innerHTML = LAYERS.map(([k, t, c]) => '<label class="row"><input type="checkbox" data-k="' + k + '"' + (on[k] ? ' checked' : '') + '><span class="sw" style="background:' + c + '"></span>' + t + '</label>').join('');
$('layers').addEventListener('change', (e) => { on[e.target.dataset.k] = e.target.checked; draw(); });
// The view: all of every frame, then wherever it's panned and zoomed
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
const grow = (l) => { for (let i = 0; i < l.length; i += 2) { lo = [Math.min(lo[0], l[i]), Math.min(lo[1], l[i + 1])]; hi = [Math.max(hi[0], l[i]), Math.max(hi[1], l[i + 1])]; } };
D.ground.forEach(grow); F.forEach((fr) => Object.values(fr.parts).forEach((ls) => ls.forEach(grow)));
let cam = { x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2, s: 1 }, W = 0, H = 0, dpr = 1;
const fit = () => { cam = { x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2, s: Math.min(W / (hi[0] - lo[0]), H / (hi[1] - lo[1])) * 0.92 }; };
const sx = (x) => (x - cam.x) * cam.s + W / 2, sy = (y) => H / 2 - (y - cam.y) * cam.s, wx = (px) => (px - W / 2) / cam.s + cam.x, wy = (py) => cam.y - (py - H / 2) / cam.s;
const resize = () => { dpr = devicePixelRatio || 1; const r = view.getBoundingClientRect(), first = !W; W = r.width; H = r.height; view.width = W * dpr; view.height = H * dpr; if (first) fit(); draw(); };
// Arrows: their length goes as the force, a big one of the steps a hand works (the shot's knocks aside) a fifth of the
// view (the slider scales it)
const mags = F.filter((fr) => !/fired/.test(fr.label)).flatMap((fr) => (fr.forces || []).map((f) => Math.hypot(...f.force))).filter((x) => x > 0.01).sort((a, b) => a - b);
const big = mags.length ? mags[Math.floor(mags.length * 0.9)] : 1;
const mmPerN = () => ((hi[0] - lo[0]) * 0.12 / big) * Math.pow(10, +$('scale').value);
// Strain colours: green at rest, amber at half the limit, red at it
const strainCol = (e) => { const u = D.limit ? Math.min(1, e / D.limit) : 0; const a = u < 0.5 ? [58, 157, 58] : [224, 160, 0], b = u < 0.5 ? [224, 160, 0] : [200, 30, 30], k = u < 0.5 ? u * 2 : (u - 0.5) * 2; return 'rgb(' + a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',') + ')'; };
let i = 0, playing = false, picked = null;
const pathOf = (loops) => { const p = new Path2D(); for (const l of loops) { p.moveTo(sx(l[0]), sy(l[1])); for (let k = 2; k < l.length; k += 2) p.lineTo(sx(l[k]), sy(l[k + 1])); p.closePath(); } return p; };
const arrows = () => { // the forces to draw this frame, as [x, y, fx, fy, colour, what]
  const out = [], fr = F[i];
  for (const f of fr.forces || []) {
    if (f.kind === 'contact') {
      const fr0 = f.friction || [0, 0], n = [f.force[0] - fr0[0], f.force[1] - fr0[1]];
      if (on.friction) { if (on.contact) out.push([...f.at, ...n, COL.contact, f.on + ' pushed by ' + f.by]); out.push([...f.at, ...fr0, COL.friction, 'friction on ' + f.on + ' from ' + f.by]); }
      else if (on.contact) out.push([...f.at, ...f.force, COL.contact, f.on + ' pushed by ' + f.by + (Math.hypot(...fr0) > 0.01 ? ' (friction in it)' : '')]);
    } else if (f.kind === 'hand' && on.hand) out.push([...f.at, ...f.force, COL.hand, 'the hand on ' + f.on]);
    else if (f.kind === 'spring' && on.spring) out.push([...f.at, ...f.force, COL.spring, f.by + ' pulling on the frame']);
  }
  return out.filter((a) => Math.hypot(a[2], a[3]) > 0.005);
};
function arrow(x, y, fx, fy, col, label) {
  const k = mmPerN(), x1 = sx(x), y1 = sy(y), x2 = sx(x + fx * k), y2 = sy(y + fy * k), L = Math.hypot(x2 - x1, y2 - y1), h = Math.min(10, L * 0.35) * dpr / dpr;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  if (L > 1) { const a = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4)); ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill(); }
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1 - 4, y1); ctx.lineTo(x1 + 4, y1); ctx.moveTo(x1, y1 - 4); ctx.lineTo(x1, y1 + 4); ctx.stroke(); // where it acts
  if (on.labels) { ctx.font = '11px system-ui'; ctx.fillText(Math.hypot(fx, fy).toFixed(1) + ' N', x2 + 4, y2 - 4); }
}
function draw() {
  if (!W) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const fr = F[i];
  if (on.frame && D.ground.length) { ctx.fillStyle = COL.ground; ctx.fill(pathOf(D.ground), 'evenodd'); }
  if (on.parts) for (const [n, ls] of Object.entries(fr.parts)) {
    const flex = D.kinds[n] === 'flexure';
    ctx.fillStyle = flex ? (on.strain && fr.strain && fr.strain[n] != null ? strainCol(fr.strain[n]) : COL.flexure) : D.kinds[n] === 'body' ? COL.body : '#8aa';
    ctx.globalAlpha = flex ? 1 : 0.85; ctx.fill(pathOf(ls), 'evenodd'); ctx.globalAlpha = 1;
  }
  for (const a of arrows()) arrow(...a);
  if (picked) { // the picked force: its x and y, drawn as a crosshair and components
    const [x, y, fx, fy, col, what] = picked, k = mmPerN(), x1 = sx(x), y1 = sy(y);
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y1); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke(); ctx.setLineDash([]);
    arrow(x, y, fx, 0, '#555', ''); arrow(x, y, 0, fy, '#555', '');
  }
  $('label').textContent = fr.label + (fr.t && fr.from !== fr.to && !/fired/.test(fr.label) ? ' · ' + Math.round(fr.t * 100) + '%' : '');
  $('scrub').value = i; side(); chart();
}
function side() {
  const fr = F[i], rows = [];
  for (const [n, e] of Object.entries(fr.energy || {})) { const most = Math.max(1e-6, ...F.map((g) => (g.energy || {})[n] || 0)); rows.push('<tr><td>' + n + ' stores</td><td class="n">' + e.toFixed(1) + ' mJ</td><td style="width:35%"><div class="bar"><i style="width:' + (100 * e / most).toFixed(0) + '%;background:' + COL.flexure + '"></i></div></td></tr>'); }
  for (const [n, s] of Object.entries(fr.strain || {})) rows.push('<tr><td>' + n + ' strain</td><td class="n">' + (s * 100).toFixed(2) + '%</td><td><div class="bar"><i style="width:' + Math.min(100, 100 * s / (D.limit || 1)).toFixed(0) + '%;background:' + strainCol(s) + '"></i></div></td></tr>');
  for (const f of (fr.forces || []).filter((f) => f.kind === 'hand')) rows.push('<tr><td>hand on ' + f.on + '</td><td class="n">' + Math.hypot(...f.force).toFixed(2) + ' N</td><td></td></tr>');
  for (const f of (fr.forces || []).filter((f) => f.kind === 'contact').sort((a, b) => Math.hypot(...b.force) - Math.hypot(...a.force)).slice(0, 6)) rows.push('<tr><td>' + f.on + ' on ' + f.by + '</td><td class="n">' + Math.hypot(...f.force).toFixed(2) + ' N</td><td></td></tr>');
  const s = D.shot && D.shot.exit && /fired/.test(fr.label) ? '<p class="note">The disc leaves at ' + D.shot.exit.speed.toFixed(1) + ' m/s after ' + (D.shot.exit.t * 1000).toFixed(1) + ' ms, with ' + (D.shot.exit.energy * 1000).toFixed(1) + ' mJ of the ' + (D.shot.stored * 1000).toFixed(1) + ' stored.</p>' : '';
  $('now').innerHTML = (rows.length ? '<table>' + rows.join('') + '</table>' : '<p class="note">No forces recorded for this frame (a kinematic frame).</p>') + s;
}
function chart() { // the hand's force along the step this frame is in, a dot where it is
  const c = $('chart'), g = c.getContext('2d'), w = c.width = c.clientWidth * dpr, h = c.height = 150 * dpr, fr = F[i];
  g.clearRect(0, 0, w, h);
  const tr = D.curves.find((x) => x.from === fr.from && x.to === fr.to), cv = tr && tr.curve[0];
  if (!cv || cv.points.length < 2) { $('chartNote').textContent = 'No hand drives this step.'; return; }
  const xs = cv.points.map((p) => Math.abs(p[0])), fs = cv.points.map((p) => p[1]), xm = Math.max(1e-9, ...xs), fmin = Math.min(0, ...fs), fmax = Math.max(1e-9, ...fs), m = 28 * dpr;
  const px = (x) => m + (Math.abs(x) / xm) * (w - m * 1.5), py = (f) => h - m * 0.8 - ((f - fmin) / (fmax - fmin)) * (h - m * 1.4);
  g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(m, py(0)); g.lineTo(w, py(0)); g.moveTo(m, 0); g.lineTo(m, h); g.stroke();
  g.strokeStyle = COL.body; g.lineWidth = 2 * dpr; g.beginPath(); cv.points.forEach((p, k) => (k ? g.lineTo(px(p[0]), py(p[1])) : g.moveTo(px(p[0]), py(p[1])))); g.stroke();
  const p = cv.points[Math.min(cv.points.length - 1, Math.round(fr.t * (cv.points.length - 1)))]; g.fillStyle = COL.hand; g.beginPath(); g.arc(px(p[0]), py(p[1]), 4 * dpr, 0, 7); g.fill();
  g.fillStyle = '#555'; g.font = 11 * dpr + 'px system-ui'; g.fillText(fmax.toFixed(1) + ' N', 2, py(fmax) + 4 * dpr); g.fillText(xm.toFixed(1) + (cv.joint ? '' : ''), w - 40 * dpr, h - 4 * dpr);
  const ev = (tr.events || [])[0];
  $('chartNote').textContent = 'Driving ' + cv.joint + ' from ' + tr.from + ' to ' + tr.to + ': now ' + Math.abs(p[0]).toFixed(2) + ' (mm, or degrees turning) under ' + p[1].toFixed(2) + ' N' + (ev ? '; ' + ev.body + ' is let go ' + Math.round(ev.t * 100) + '% of the way' : '') + (tr.holding ? '; held by the catch: ' + Object.values(tr.holding).map((x) => x.toFixed(1) + ' N').join(', ') : '');
}
// Steps: a button for each state, and the shot
const starts = []; F.forEach((fr, k) => { const name = /fired/.test(fr.label) ? 'shot' : fr.t === 0 ? fr.from : null; if (name && (name !== 'shot' || !starts.some((s) => s.name === 'shot'))) starts.push({ name, k }); });
$('steps').innerHTML = starts.map((s) => '<button data-k="' + s.k + '">' + s.name + '</button>').join('');
$('steps').addEventListener('click', (e) => { if (e.target.dataset.k) { go(+e.target.dataset.k); stop(); } });
$('scrub').max = F.length - 1; $('scrub').addEventListener('input', (e) => { go(+e.target.value); stop(); });
const go = (k) => { i = Math.max(0, Math.min(F.length - 1, k)); picked = null; $('pick').hidden = true; for (const b of $('steps').children) b.classList.toggle('on', +b.dataset.k <= i && !(starts.find((s) => s.k > +b.dataset.k && s.k <= i))); draw(); };
// Playing: a frame each 70 ms (scaled), states held a moment, the shot slowed to be seen
let timer = null;
const hold = (fr) => (fr.t === 0 ? 500 : /fired/.test(fr.label) ? 140 : 70);
const tick = () => { if (!playing) return; const next = i + 1 >= F.length ? 0 : i + 1; go(next); timer = setTimeout(tick, hold(F[i]) / +$('speed').value); };
const stop = () => { playing = false; clearTimeout(timer); $('play').textContent = '▶'; };
$('play').onclick = () => { if (playing) return stop(); playing = true; $('play').textContent = '❚❚'; tick(); };
$('prev').onclick = () => { stop(); go(i - 1); }; $('next').onclick = () => { stop(); go(i + 1); }; $('fit').onclick = () => { fit(); draw(); };
$('scale').addEventListener('input', draw);
addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); $('play').click(); } else if (e.key === 'ArrowRight') $('next').click(); else if (e.key === 'ArrowLeft') $('prev').click(); else if (e.key === '0') $('fit').click(); });
// Pan, zoom (wheel, pinch), and a tap on a force picks it
const pts = new Map(); let moved = 0;
view.addEventListener('pointerdown', (e) => { view.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); moved = 0; });
view.addEventListener('pointermove', (e) => {
  $('coord').textContent = 'x ' + wx(e.offsetX).toFixed(1) + '  y ' + wy(e.offsetY).toFixed(1) + ' mm';
  if (!pts.has(e.pointerId)) return;
  const was = pts.get(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pts.size === 1) { cam.x -= (e.offsetX - was[0]) / cam.s; cam.y += (e.offsetY - was[1]) / cam.s; moved += Math.hypot(e.offsetX - was[0], e.offsetY - was[1]); draw(); }
  else if (pts.size === 2) { const [a, b] = [...pts.values()], other = a === pts.get(e.pointerId) ? b : a, d0 = Math.hypot(was[0] - other[0], was[1] - other[1]), d1 = Math.hypot(e.offsetX - other[0], e.offsetY - other[1]); if (d0 > 0) zoomAt((e.offsetX + other[0]) / 2, (e.offsetY + other[1]) / 2, d1 / d0); moved += 10; }
});
const up = (e) => { if (pts.size === 1 && moved < 5) pick(e.offsetX, e.offsetY); pts.delete(e.pointerId); };
view.addEventListener('pointerup', up); view.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
const zoomAt = (px, py, f) => { const x = wx(px), y = wy(py); cam.s *= f; cam.x = x - (px - W / 2) / cam.s; cam.y = y + (py - H / 2) / cam.s; draw(); };
view.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
view.addEventListener('dblclick', () => { fit(); draw(); });
function pick(px, py) { // the nearest arrow to the tap, along its length
  const k = mmPerN(); let best = null;
  for (const a of arrows()) { const x1 = sx(a[0]), y1 = sy(a[1]), x2 = sx(a[0] + a[2] * k), y2 = sy(a[1] + a[3] * k), ex = x2 - x1, ey = y2 - y1, l2 = ex * ex + ey * ey, u = l2 ? Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / l2)) : 0, d = Math.hypot(px - x1 - u * ex, py - y1 - u * ey); if (d < 14 && (!best || d < best.d)) best = { d, a }; }
  picked = best ? best.a : null;
  if (picked) { const [x, y, fx, fy, , what] = picked; $('pick').hidden = false; $('pick').innerHTML = '<b>' + what + '</b><br>' + Math.hypot(fx, fy).toFixed(2) + ' N at ' + (Math.atan2(fy, fx) * 180 / Math.PI).toFixed(0) + '°: x ' + fx.toFixed(2) + ' N, y ' + fy.toFixed(2) + ' N<br>acting at (' + x.toFixed(1) + ', ' + y.toFixed(1) + ') mm'; }
  else $('pick').hidden = true;
  draw();
}
$('findings').innerHTML = D.findings.filter((f) => f.level !== 'pass').map((f) => '<li class="' + f.level + '">' + f.text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]) + '</li>').join('') || '<li>Every check passes.</li>';
// A link can open it at a frame (#f=12), zoomed on a point (&at=x,y&zoom=4); the address follows the frame
const q = new URLSearchParams(location.hash.slice(1));
addEventListener('resize', resize); resize();
if (q.has('at')) { const [x, y] = q.get('at').split(',').map(Number); cam.x = x; cam.y = y; cam.s *= +(q.get('zoom') || 1); }
go(+(q.get('f') || 0));
const follow = () => { try { history.replaceState(null, '', '#f=' + i); } catch (e) {} };
$('scrub').addEventListener('change', follow); $('steps').addEventListener('click', follow); $('prev').addEventListener('click', follow); $('next').addEventListener('click', follow);
`;

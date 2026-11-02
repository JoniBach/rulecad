// A lamina mechanism's sequence as one animated SVG: the frame drawn once, and each moving part (bodies, and the
// flexures drawn bent) frame by frame, holding a moment at each state. Self-contained: it plays in any browser, with
// nothing to install. Frames come from @rulecad/flexures lamina() (followers pushed aside where their drivers meet them).
const COLOURS = { ground: '#c9ccd1', body: '#2f6fb3', flexure: '#e07a1f' };
const HOLD = 8; // a state is shown this many frames' time
const STEP = 0.06; // seconds a frame

const fmt = (n) => +n.toFixed(2);
const pathOf = (outlines) => outlines.map((o) => `M${o.map(([x, y]) => `${fmt(x)} ${fmt(-y)}`).join('L')}Z`).join('');
const escape = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

/**
 * @param {{ frames: { from: string, to: string, t: number, parts: Record<string, number[][][]> }[], joints: Record<string, object> }} mechanism
 * @param {{ title?: string }} [o]
 * @returns {string} the SVG
 */
export function sequenceSvg(mechanism, { title = '' } = {}) {
  const frames = mechanism.frames || [];
  if (!frames.length) throw new Error('the mechanism has no sequence to animate: give its lamina a sequence of states');
  const flexures = new Set(Object.keys(mechanism.joints || {})), kind = (n) => (n === 'ground' ? 'ground' : flexures.has(n) ? 'flexure' : 'body');
  // The view: everything every frame reaches, with a margin and a line for the caption
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const fr of frames) for (const outs of Object.values(fr.parts)) for (const o of outs) for (const [x, y] of o) { lo = [Math.min(lo[0], x), Math.min(lo[1], -y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], -y)]; }
  const pad = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * 0.05, caption = pad * 2;
  // The force curves of the steps a hand drives, a chart each, in a row under the drawing
  const charts = (mechanism.curves || []).flatMap((tr) => tr.curve.filter((c) => c.points.length > 1).map((c) => ({ from: tr.from, to: tr.to, ...c })));
  const chartH = charts.length ? (hi[1] - lo[1]) * 0.35 : 0;
  const vb = [lo[0] - pad, lo[1] - pad - caption, hi[0] - lo[0] + 2 * pad, hi[1] - lo[1] + 2 * pad + caption * 2 + (chartH ? chartH + caption * 1.5 : 0)]; // a band above for the key, below for the step and the charts
  // Timing: each frame its share; a state (the first frame of each step, and the last) held longer
  const weights = frames.map((fr, i) => (fr.t === 0 || i === frames.length - 1 ? HOLD : 1)), total = weights.reduce((a, b) => a + b, 0);
  const starts = []; weights.reduce((at, w) => { starts.push(at / total); return at + w; }, 0);
  const dur = `${fmt(total * STEP)}s`;
  const show = (i) => { // visible only during frame i
    const a = fmt(starts[i]), b = fmt(i + 1 < frames.length ? starts[i + 1] : 1);
    const keys = [...new Set([0, a, b, 1])].sort((x, y) => x - y), values = keys.map((k) => (k >= a && k < b ? 'inline' : 'none'));
    if (i === frames.length - 1) values[values.length - 1] = 'inline';
    return `<animate attributeName="display" values="${values.join(';')}" keyTimes="${keys.join(';')}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`;
  };
  const ground = frames[0].parts.ground ? `<path d="${pathOf(frames[0].parts.ground)}" fill="${COLOURS.ground}" fill-rule="evenodd"/>` : '';
  const size = fmt(caption * 0.45), textY = fmt(hi[1] + pad + caption * 0.65), keyY = fmt(vb[1] + caption * 0.65);
  // Each chart: its box, the curve, and where frame i sits on it (if frame i is in its step)
  const chartTop = hi[1] + pad + caption * 1.5, cw = vb[2] / Math.max(1, charts.length), inner = (k) => ({ x0: vb[0] + k * cw + pad * 1.5, x1: vb[0] + (k + 1) * cw - pad * 0.5, y0: chartTop + caption * 0.6, y1: chartTop + chartH });
  const scaled = charts.map((c, k) => {
    const b = inner(k), xs = c.points.map(([x]) => Math.abs(x)), fs = c.points.map(([, F]) => F), xm = Math.max(1e-9, ...xs), fmin = Math.min(0, ...fs), fmax = Math.max(1e-9, ...fs);
    const at = ([x, F]) => [b.x0 + (Math.abs(x) / xm) * (b.x1 - b.x0), b.y1 - ((F - fmin) / (fmax - fmin)) * (b.y1 - b.y0)];
    return { ...c, b, at, fmax, xm };
  });
  const chartArt = scaled.map((c) => {
    const pts = c.points.map(c.at), zero = c.at([0, 0])[1];
    const small = fmt(Math.min(size * 0.6, (c.b.x1 - c.b.x0) / 22)); // two short lines, sized to fit the chart's width
    return `<g font-family="system-ui, sans-serif" fill="#555"><text x="${fmt(c.b.x0)}" y="${fmt(c.b.y0 - caption * 0.45)}" font-size="${small}">${escape(`${c.from} to ${c.to}, ${c.joint}`)}</text><text x="${fmt(c.b.x0)}" y="${fmt(c.b.y0 - caption * 0.1)}" font-size="${small}">${escape(`up to ${c.fmax.toFixed(1)} N over ${c.xm.toFixed(1)} mm`)}</text>
<line x1="${fmt(c.b.x0)}" y1="${fmt(zero)}" x2="${fmt(c.b.x1)}" y2="${fmt(zero)}" stroke="#ccc" stroke-width="${fmt(size * 0.04)}"/><line x1="${fmt(c.b.x0)}" y1="${fmt(c.b.y0)}" x2="${fmt(c.b.x0)}" y2="${fmt(c.b.y1)}" stroke="#ccc" stroke-width="${fmt(size * 0.04)}"/>
<polyline points="${pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}" fill="none" stroke="#2f6fb3" stroke-width="${fmt(size * 0.08)}"/></g>`;
  }).join('\n');
  const markerOf = (fr) => scaled.filter((c) => c.from === fr.from && c.to === fr.to).map((c) => { const p = c.at(c.points[Math.min(c.points.length - 1, Math.round(fr.t * (c.points.length - 1)))]); return `<circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="${fmt(size * 0.25)}" fill="#e07a1f"/>`; }).join('');
  const body = frames.map((fr, i) => {
    const label = fr.t === 0 && fr.from === fr.to ? fr.from : fr.t === 0 ? fr.from : `${fr.from} to ${fr.to}`;
    const shapes = Object.entries(fr.parts).filter(([n]) => n !== 'ground').map(([n, o]) => `<path d="${pathOf(o)}" fill="${COLOURS[kind(n)]}" fill-rule="evenodd"/>`).join('');
    return `<g display="${i ? 'none' : 'inline'}">${show(i)}${shapes}${markerOf(fr)}<text x="${fmt(vb[0] + pad)}" y="${textY}" font-size="${size}" font-family="system-ui, sans-serif" fill="#333">${escape(label)}</text></g>`;
  }).join('\n');
  const key = Object.entries(COLOURS).map(([k, c], i) => `<rect x="${fmt(vb[0] + pad + i * size * 5)}" y="${fmt(keyY - size * 0.8)}" width="${size}" height="${size}" fill="${c}"/><text x="${fmt(vb[0] + pad + i * size * 5 + size * 1.3)}" y="${keyY}" font-size="${fmt(size * 0.8)}" font-family="system-ui, sans-serif" fill="#555">${{ ground: 'frame', body: 'moves', flexure: 'bends' }[k]}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(fmt).join(' ')}" width="900">
<title>${escape(title)}</title>
<rect x="${fmt(vb[0])}" y="${fmt(vb[1])}" width="${fmt(vb[2])}" height="${fmt(vb[3])}" fill="#fff"/>
${ground}
${body}
${chartArt}
${key}
</svg>
`;
}

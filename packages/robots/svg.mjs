// An SVG drawing as strokes in millimetres: paths, lines, shapes; transforms and nested groups; curves flattened to a
// tolerance. Plain string parsing, so it runs anywhere with no DOM.
import { refuse } from './kinematics.mjs';

const DEG = Math.PI / 180;
const mm = 25.4;
/** @typedef {{ name: string, points: number[][], closed: boolean }} Stroke one continuous pen-down line, in mm */

// ---------- a small XML reader: elements and attributes, nothing else ----------
function parseXML(text) {
  const root = { name: '#root', attrs: {}, children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gi;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === m[1]) { stack.length = i; break; }
    } else if (m[2]) {
      const attrs = {}, are = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = are.exec(m[3]))) attrs[a[1]] = a[2] ?? a[3];
      const el = { name: m[2], attrs, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!m[4]) stack.push(el);
    }
  }
  return root;
}
const local = (n) => n.slice(n.indexOf(':') + 1);

// ---------- 2 × 3 affine transforms [a, b, c, d, e, f] ----------
const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const applyM = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(s, findings, where) {
  let M = [1, 0, 0, 1, 0, 0];
  if (!s) return M;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(s))) {
    const a = (m[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(Number);
    let T;
    switch (m[1]) {
      case 'matrix': if (a.length === 6) T = a; break;
      case 'translate': if (a.length >= 1) T = [1, 0, 0, 1, a[0], a[1] ?? 0]; break;
      case 'scale': if (a.length >= 1) T = [a[0], 0, 0, a[1] ?? a[0], 0, 0]; break;
      case 'rotate': if (a.length >= 1) {
        const c = Math.cos(a[0] * DEG), s2 = Math.sin(a[0] * DEG), R = [c, s2, -s2, c, 0, 0];
        T = a.length >= 3 ? multiply(multiply([1, 0, 0, 1, a[1], a[2]], R), [1, 0, 0, 1, -a[1], -a[2]]) : R;
      } break;
      case 'skewX': if (a.length === 1) T = [1, 0, Math.tan(a[0] * DEG), 1, 0, 0]; break;
      case 'skewY': if (a.length === 1) T = [1, Math.tan(a[0] * DEG), 0, 1, 0, 0]; break;
      default:
    }
    if (T) M = multiply(M, T);
    else findings.push({ level: 'warn', text: `${where}: transform "${m[0]}" was not understood and is ignored`, code: 'svg.transform' });
  }
  return M;
}

// ---------- lengths ----------
const UNIT_MM = { mm: 1, cm: 10, in: mm, pt: mm / 72, pc: mm / 6, q: 0.25, px: mm / 96 };
function parseLength(s) {
  if (s == null) return null;
  const m = String(s).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z%]*)$/);
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2].toLowerCase() };
}
const lengthMM = (l) => (!l ? null : l.unit === '' ? l.value * UNIT_MM.px : l.unit === '%' ? null : UNIT_MM[l.unit] != null ? l.value * UNIT_MM[l.unit] : null);

// ---------- flattening ----------
function flatten(out, p0, p1, p2, p3, tol, depth = 0) {
  const d1 = Math.hypot(p1[0] - (2 * p0[0] + p3[0]) / 3, p1[1] - (2 * p0[1] + p3[1]) / 3);
  const d2 = Math.hypot(p2[0] - (p0[0] + 2 * p3[0]) / 3, p2[1] - (p0[1] + 2 * p3[1]) / 3);
  if (0.75 * Math.max(d1, d2) <= tol || depth >= 24) { out.push(p3); return; }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(p0, p1), b = mid(p1, p2), c = mid(p2, p3), ab = mid(a, b), bc = mid(b, c), m = mid(ab, bc);
  flatten(out, p0, a, ab, m, tol, depth + 1); flatten(out, m, bc, c, p3, tol, depth + 1);
}

// An SVG arc as cubic pieces in user space (SVG 1.1 F.6.5, then at most 30 degrees a piece)
function arcCubics(p0, rx0, ry0, xRot, large, sweep, p1) {
  const [x1, y1] = p0, [x2, y2] = p1;
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rx0), ry = Math.abs(ry0);
  if (rx === 0 || ry === 0) return null; // a straight line
  const phi = xRot * DEG, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
  const L = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (L > 1) { const s = Math.sqrt(L); rx *= s; ry *= s; }
  const a = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, b = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, a / b));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dth = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI; else if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 6))), d = dth / n, t = (4 / 3) * Math.tan(d / 4), out = [];
  const at = (x, y) => [cx + rx * cp * x - ry * sp * y, cy + rx * sp * x + ry * cp * y];
  for (let i = 0; i < n; i++) {
    const a0 = th1 + i * d, a1 = a0 + d, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    out.push([at(c0 - t * s0, s0 + t * c0), at(c1 + t * s1, s1 - t * c1), i === n - 1 ? [x2, y2] : at(c1, s1)]);
  }
  return out;
}

// ---------- paths ----------
const END = /[\s,]*$/y, NUM = /[\s,]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y, FLAG = /[\s,]*([01])/y, CMD = /[\s,]*([a-zA-Z])/y;
const COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function parsePath(d, findings, where) {
  const segs = []; // [{ start: point }, { line: p } | { cubic: [a, b, c] }, …] per subpath, in user space
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0], sub = null, lastCtl = null, lastCmd = null;
  const read = (re) => { re.lastIndex = i; const m = re.exec(d); if (!m) return null; i = re.lastIndex; return m[1]; };
  const bad = () => findings.push({ level: 'warn', text: `${where}: path data is broken at character ${i}; drawn up to there`, code: 'svg.path' });
  while (true) {
    const save = i; const c = read(CMD);
    if (c && COUNT[c.toUpperCase()] !== undefined) cmd = c;
    else if (c) { i = save; bad(); break; }
    else { i = save; END.lastIndex = i; if (END.test(d)) break; if (!cmd || cmd.toUpperCase() === 'Z') { bad(); break; } } // continuation of cmd's numbers (not after Z)
    const U = cmd.toUpperCase(), rel = cmd === cmd.toLowerCase();
    const args = [];
    if (U === 'A') {
      for (let k = 0; k < 7; k++) { const a = read(k === 3 || k === 4 ? FLAG : NUM); if (a === null) break; args.push(Number(a)); }
    } else for (let k = 0; k < COUNT[U]; k++) { const a = read(NUM); if (a === null) break; args.push(Number(a)); }
    if (args.length !== COUNT[U]) { if (args.length || U !== 'Z') bad(); break; }
    const [ox, oy] = rel ? cur : [0, 0];
    const abs = (x, y) => [x + ox, y + oy];
    if (U !== 'M' && !sub) { sub = { start: cur, segs: [] }; segs.push(sub); }
    switch (U) {
      case 'M': { cur = abs(args[0], args[1]); start = cur; sub = { start: cur, segs: [] }; segs.push(sub); cmd = rel ? 'l' : 'L'; lastCtl = null; break; }
      case 'L': { const p = abs(args[0], args[1]); sub.segs.push({ line: p }); cur = p; lastCtl = null; break; }
      case 'H': { const p = [rel ? cur[0] + args[0] : args[0], cur[1]]; sub.segs.push({ line: p }); cur = p; lastCtl = null; break; }
      case 'V': { const p = [cur[0], rel ? cur[1] + args[0] : args[0]]; sub.segs.push({ line: p }); cur = p; lastCtl = null; break; }
      case 'C': { const a = abs(args[0], args[1]), b = abs(args[2], args[3]), p = abs(args[4], args[5]); sub.segs.push({ cubic: [a, b, p] }); lastCtl = b; cur = p; break; }
      case 'S': {
        const a = lastCtl && (lastCmd === 'C' || lastCmd === 'S') ? [2 * cur[0] - lastCtl[0], 2 * cur[1] - lastCtl[1]] : cur;
        const b = abs(args[0], args[1]), p = abs(args[2], args[3]); sub.segs.push({ cubic: [a, b, p] }); lastCtl = b; cur = p; break;
      }
      case 'Q': { const q = abs(args[0], args[1]), p = abs(args[2], args[3]); sub.segs.push({ quad: [q, p] }); lastCtl = q; cur = p; break; }
      case 'T': {
        const q = lastCtl && (lastCmd === 'Q' || lastCmd === 'T') ? [2 * cur[0] - lastCtl[0], 2 * cur[1] - lastCtl[1]] : cur;
        const p = abs(args[0], args[1]); sub.segs.push({ quad: [q, p] }); lastCtl = q; cur = p; break;
      }
      case 'A': {
        const p = abs(args[5], args[6]), cubics = arcCubics(cur, args[0], args[1], args[2], args[3], args[4], p);
        if (cubics === null) sub.segs.push({ line: p }); else for (const c3 of cubics) sub.segs.push({ cubic: c3 });
        cur = p; lastCtl = null; break;
      }
      case 'Z': { sub.closed = true; cur = start; sub = null; lastCtl = null; break; }
      default:
    }
    lastCmd = U;
  }
  return segs;
}

function strokeOf(sub, M, tol) {
  const points = [applyM(M, sub.start)];
  for (const s of sub.segs) {
    const p0 = points[points.length - 1];
    if (s.line) points.push(applyM(M, s.line));
    else if (s.cubic) flatten(points, p0, applyM(M, s.cubic[0]), applyM(M, s.cubic[1]), applyM(M, s.cubic[2]), tol);
    else {
      const q = applyM(M, s.quad[0]), p3 = applyM(M, s.quad[1]);
      flatten(points, p0, [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])], [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])], p3, tol);
    }
  }
  if (sub.closed) points.push(applyM(M, sub.start));
  const out = [points[0]];
  for (const p of points) if (Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 1e-9) out.push(p);
  return { points: out, closed: !!sub.closed };
}

const ellipseSubs = (cx, cy, rx, ry) => [{ start: [cx + rx, cy], closed: true, segs: [[cx, cy + ry], [cx - rx, cy], [cx, cy - ry], [cx + rx, cy]].reduce((o, p, i, all) => {
  const from = i ? all[i - 1] : [cx + rx, cy];
  for (const c of arcCubics(from, rx, ry, 0, 0, 1, p)) o.push({ cubic: c });
  return o;
}, []) }];

// Shapes as subpaths, in user space
function shapeSubs(el, ctx, findings, where) {
  const name = local(el.name), a = el.attrs;
  const len = (v, dflt = 0) => {
    if (v == null) return dflt;
    const l = parseLength(v);
    if (!l) { findings.push({ level: 'warn', text: `${where}: length "${v}" was not understood`, code: 'svg.length' }); return dflt; }
    if (l.unit === '' || l.unit === 'px') return l.value;
    if (l.unit === '%') return (l.value / 100) * Math.max(ctx.vw, ctx.vh);
    return UNIT_MM[l.unit] != null ? (l.value * UNIT_MM[l.unit]) * ctx.userPerMm : dflt;
  };
  switch (name) {
    case 'path': return a.d ? parsePath(a.d, findings, where) : [];
    case 'line': {
      const p = [len(a.x1), len(a.y1)], q = [len(a.x2), len(a.y2)];
      return [{ start: p, segs: [{ line: q }] }];
    }
    case 'polyline': case 'polygon': {
      const nums = (a.points || '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || [];
      if (nums.length % 2) findings.push({ level: 'warn', text: `${where}: an odd number of coordinates; the last is ignored`, code: 'svg.points' });
      const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([Number(nums[i]), Number(nums[i + 1])]);
      return pts.length < 2 ? [] : [{ start: pts[0], segs: pts.slice(1).map((line) => ({ line })), ...(name === 'polygon' ? { closed: true } : {}) }];
    }
    case 'rect': {
      const x = len(a.x), y = len(a.y), w = len(a.width), h = len(a.height);
      if (!(w > 0) || !(h > 0)) return [];
      let rx = a.rx != null ? len(a.rx) : null, ry = a.ry != null ? len(a.ry) : null;
      if (rx == null) rx = ry ?? 0; if (ry == null) ry = rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!(rx > 0) || !(ry > 0)) return [{ start: [x, y], closed: true, segs: [[x + w, y], [x + w, y + h], [x, y + h]].map((line) => ({ line })) }];
      const segs = [];
      const line = (p) => segs.push({ line: p }), arc = (from, to) => { for (const c of arcCubics(from, rx, ry, 0, 0, 1, to)) segs.push({ cubic: c }); };
      line([x + w - rx, y]); arc([x + w - rx, y], [x + w, y + ry]); line([x + w, y + h - ry]); arc([x + w, y + h - ry], [x + w - rx, y + h]);
      line([x + rx, y + h]); arc([x + rx, y + h], [x, y + h - ry]); line([x, y + ry]); arc([x, y + ry], [x + rx, y]);
      return [{ start: [x + rx, y], closed: true, segs }];
    }
    case 'circle': { const r = len(a.r); return r > 0 ? ellipseSubs(len(a.cx), len(a.cy), r, r) : []; }
    case 'ellipse': { const rx = len(a.rx), ry = len(a.ry); return rx > 0 && ry > 0 ? ellipseSubs(len(a.cx), len(a.cy), rx, ry) : []; }
    default: return [];
  }
}

// The transform from an <svg> element's user space to mm (at the top level) or to its parent's user space
function viewportMatrix(el, opts, findings, top, ctx) {
  const a = el.attrs, vb = (a.viewBox || '').trim().split(/[\s,]+/).map(Number);
  const hasVB = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  if (a.viewBox && !hasVB) findings.push({ level: 'warn', text: `the viewBox "${a.viewBox}" was not understood and is ignored`, code: 'svg.viewBox' });
  const wl = parseLength(a.width), hl = parseLength(a.height);
  let w = lengthMM(wl), h = lengthMM(hl);
  const given = opts.unit != null;
  if (given) {
    const u = opts.unit === 'mm' ? 1 : opts.unit === 'px' ? UNIT_MM.px : opts.unit;
    if (!Number.isFinite(u) || !(u > 0)) throw refuse('svg.unit', `svgToStrokes: unit is 'mm', 'px' or the mm in one user unit (got ${JSON.stringify(opts.unit)})`);
    const offset = hasVB ? [1, 0, 0, 1, -vb[0], -vb[1]] : [1, 0, 0, 1, 0, 0];
    if (top) { ctx.userPerMm = 1 / u; ctx.vw = hasVB ? vb[2] : w != null ? w / u : 0; ctx.vh = hasVB ? vb[3] : h != null ? h / u : 0; }
    return { M: multiply([u, 0, 0, u, 0, 0], offset), width: hasVB ? vb[2] * u : w ?? 0, height: hasVB ? vb[3] * u : h ?? 0 };
  }
  if (hasVB) {
    if (!top && w == null && h == null) { w = vb[2]; h = vb[3]; } // a nested <svg> with no size: its parent's user units
    if (w != null || h != null) {
      if (w == null) w = (h * vb[2]) / vb[3];
      if (h == null) h = (w * vb[3]) / vb[2];
      const par = (a.preserveAspectRatio || 'xMidYMid meet').trim().split(/\s+/);
      let sx = w / vb[2], sy = h / vb[3], tx = 0, ty = 0;
      if (par[0] !== 'none') {
        const s = par[1] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
        sx = s; sy = s;
        const free = [w - vb[2] * s, h - vb[3] * s], align = par[0];
        tx = /xMid/.test(align) ? free[0] / 2 : /xMax/.test(align) ? free[0] : 0;
        ty = /YMid/.test(align) ? free[1] / 2 : /YMax/.test(align) ? free[1] : 0;
      }
      if (top) { ctx.vw = vb[2]; ctx.vh = vb[3]; }
      return { M: [sx, 0, 0, sy, tx - vb[0] * sx, ty - vb[1] * sy], width: w, height: h };
    }
    if (top) {
      findings.push({ level: 'info', text: 'the drawing has a viewBox but no physical size: taken as one user unit to the millimetre (give unit to change it)', code: 'svg.units' });
      ctx.userPerMm = 1; ctx.vw = vb[2]; ctx.vh = vb[3];
    }
    return { M: [1, 0, 0, 1, -vb[0], -vb[1]], width: vb[2], height: vb[3] };
  }
  if (top) {
    if (w == null && h == null) {
      findings.push({ level: 'info', text: 'the drawing gives no size or viewBox: taken as one user unit to the millimetre (give unit to change it)', code: 'svg.units' });
      ctx.userPerMm = 1;
      return { M: [1, 0, 0, 1, 0, 0], width: 0, height: 0 };
    }
    ctx.userPerMm = 96 / mm; ctx.vw = (w ?? 0) / UNIT_MM.px; ctx.vh = (h ?? 0) / UNIT_MM.px;
    return { M: [UNIT_MM.px, 0, 0, UNIT_MM.px, 0, 0], width: w ?? 0, height: h ?? 0 };
  }
  return { M: [1, 0, 0, 1, 0, 0], width: 0, height: 0 };
}

const SKIP = new Set(['defs', 'clipPath', 'mask', 'pattern', 'symbol', 'marker', 'metadata', 'title', 'desc', 'style', 'script', 'linearGradient', 'radialGradient', 'filter']);
const NOTE = new Set(['text', 'image', 'use', 'foreignObject']);

/**
 * An SVG drawing as strokes in millimetres, on the page: x to the right, y down, from the top left, as the file has
 * them. Curves are flattened so a stroke stays within half the tolerance of the curve, leaving the other half for
 * planToolpath.
 * @param {string} svgText
 * @param {{ tolerance?: number, unit?: 'mm' | 'px' | number }} [opts] tolerance in mm (default 0.1); unit: the mm in one user unit, overriding the file's own size
 * @returns {{ strokes: Stroke[], width: number, height: number, findings: object[] }}
 */
export function svgToStrokes(svgText, opts = {}) {
  if (typeof svgText !== 'string' || !svgText.trim()) throw refuse('svg.input', `svgToStrokes: give the SVG's text (got ${svgText === '' ? 'an empty string' : typeof svgText})`);
  const { tolerance = 0.1 } = opts;
  if (!Number.isFinite(tolerance) || !(tolerance > 0)) throw refuse('svg.tolerance', `svgToStrokes: tolerance is a distance in mm, above 0 (got ${JSON.stringify(tolerance)})`);
  const root = parseXML(svgText), rootEl = root.children.find((e) => local(e.name) === 'svg');
  if (!rootEl) throw refuse('svg.input', 'svgToStrokes: no <svg> element in this text');
  const findings = [], ctx = { userPerMm: 96 / mm, vw: 0, vh: 0 }, strokes = [], tol = tolerance / 2, counts = {}, skipped = {};
  const vp = viewportMatrix(rootEl, opts, findings, true, ctx);
  const emit = (el, M, name) => {
    const tag = local(el.name);
    counts[tag] = (counts[tag] || 0) + 1;
    const base = el.attrs.id || `${tag}${counts[tag]}`;
    shapeSubs(el, ctx, findings, base).forEach((sub, i, all) => {
      const s = strokeOf(sub, M, tol);
      if (s.points.length >= 2) strokes.push({ name: all.length > 1 ? `${base}#${i + 1}` : base, points: s.points, closed: s.closed });
    });
  };
  const walk = (el, M) => {
    const tag = local(el.name);
    if (SKIP.has(tag) || el.attrs.display === 'none' || /(^|;)\s*display\s*:\s*none/.test(el.attrs.style || '')) return;
    if (NOTE.has(tag)) { skipped[tag] = (skipped[tag] || 0) + 1; return; }
    const here = multiply(M, parseTransform(el.attrs.transform, findings, el.attrs.id || tag));
    if (tag === 'g' || tag === 'a' || tag === 'switch') { for (const c of el.children) walk(c, here); return; }
    if (tag === 'svg') {
      const x = parseFloat(el.attrs.x) || 0, y = parseFloat(el.attrs.y) || 0;
      const inner = viewportMatrix(el, opts, findings, false, ctx);
      const N = multiply(multiply(here, [1, 0, 0, 1, x, y]), inner.M);
      for (const c of el.children) walk(c, N);
      return;
    }
    if (['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'].includes(tag)) emit(el, here);
  };
  const top = parseTransform(rootEl.attrs.transform, findings, 'svg');
  for (const c of rootEl.children) walk(c, multiply(vp.M, top));
  for (const [tag, n] of Object.entries(skipped)) findings.push({ level: 'warn', text: `${n} <${tag}> element${n > 1 ? 's' : ''} not drawn (only paths and shapes are read; convert text to paths first)`, code: 'svg.skipped', refs: { tag, count: n } });
  return { strokes, width: vp.width, height: vp.height, findings };
}

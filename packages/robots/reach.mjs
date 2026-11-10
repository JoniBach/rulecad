// What a chain can reach: a sheet, a rectangle or a volume, sampled on a grid against reach and limits.
import { chain, ik, manipulability, marginAt, refuse } from './kinematics.mjs';

/** Paper sizes, mm, short side first. @type {Record<string, [number, number]>} */
export const PAPER = { a3: [297, 420], a4: [210, 297], a5: [148, 210], a6: [105, 148] };

const num = Number.isFinite, vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(num);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

/**
 * A sheet's size and axes: u across it, v up it, n out of its face; at is its centre.
 * @param {{ size?: string | [number, number], width?: number, height?: number, landscape?: boolean, at: number[], normal?: number[], u?: number[] }} sheet
 * @returns {{ width: number, height: number, at: number[], n: number[], u: number[], v: number[] }}
 */
export function sheetFrame(sheet) {
  if (!sheet || typeof sheet !== 'object') throw refuse('sheet.input', `sheet: give { size or width and height, at } (got ${JSON.stringify(sheet)})`);
  let [w, h] = [sheet.width, sheet.height];
  if (sheet.size != null) {
    if (typeof sheet.size === 'string') {
      const s = PAPER[sheet.size.toLowerCase()];
      if (!s) throw refuse('sheet.size', `sheet: no paper size "${sheet.size}" (sizes: ${Object.keys(PAPER).join(', ')}, or [width, height] in mm)`);
      [w, h] = s;
    } else if (Array.isArray(sheet.size) && sheet.size.length === 2) [w, h] = sheet.size;
    else throw refuse('sheet.size', `sheet: size is a name or [width, height] (got ${JSON.stringify(sheet.size)})`);
  }
  if (!num(w) || !num(h) || !(w > 0) || !(h > 0)) throw refuse('sheet.size', `sheet: needs a size, or a width and a height above 0 (got ${JSON.stringify([w, h])})`);
  if (sheet.landscape) [w, h] = [Math.max(w, h), Math.min(w, h)];
  if (!vec3(sheet.at)) throw refuse('sheet.at', `sheet: at is the sheet's centre, [x, y, z] (got ${JSON.stringify(sheet.at)})`);
  const n0 = sheet.normal ?? [0, 0, 1];
  if (!vec3(n0) || !(Math.hypot(...n0) > 1e-12)) throw refuse('sheet.normal', `sheet: normal is a direction [x, y, z] with length (got ${JSON.stringify(sheet.normal)})`);
  const n = unit(n0);
  const r = sheet.u ?? (Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]);
  if (!vec3(r) || !(Math.hypot(...r.map((x, k) => x - dot(r, n) * n[k])) > 1e-12)) throw refuse('sheet.u', `sheet: u is a direction across the sheet, not along its normal (got ${JSON.stringify(sheet.u)})`);
  const u = unit(r.map((x, k) => x - dot(r, n) * n[k]));
  return { width: w, height: h, at: [...sheet.at], n, u, v: cross(n, u) };
}

/**
 * A point on a sheet in world mm, given (x, y) from the sheet's centre along u and v.
 * @param {object} sheet @param {number} x @param {number} y @param {number} [up] above the sheet's face, mm @returns {number[]}
 */
export function sheetPoint(sheet, x, y, up = 0) {
  const s = sheet.n && sheet.u && sheet.v ? sheet : sheetFrame(/** @type {any} */ (sheet));
  return [0, 1, 2].map((k) => s.at[k] + s.u[k] * x + s.v[k] * y + s.n[k] * up);
}

/** The sheet's four corners in the world: lower left, lower right, upper right, upper left. @param {object} sheet @returns {number[][]} */
export function sheetCorners(sheet) {
  const s = sheetFrame(/** @type {any} */ (sheet)), w = s.width / 2, h = s.height / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => sheetPoint(s, x, y));
}

const ticks = (lo, hi, step) => { const n = hi > lo ? Math.ceil((hi - lo) / step - 1e-9) : 0; return Array.from({ length: n + 1 }, (_, i) => (n ? lo + ((hi - lo) * i) / n : lo)); };
const capped = (count, step) => { if (count > 200000) throw refuse('reach.step', `reach: ${count} samples is too many: take a larger step than ${step} mm`); };
const pair = (what, r, axis) => {
  if (!Array.isArray(r) || r.length !== 2 || !r.every(num)) throw refuse(`${what}.range`, `${what}: ${axis} is [lo, hi] in mm (got ${JSON.stringify(r)})`);
  if (r[0] > r[1]) throw refuse(`${what}.range`, `${what}: ${axis} [${r}] is the wrong way round`);
  return r;
};

function grid(c, opt, step) {
  const given = ['sheet', 'region', 'volume'].filter((k) => opt[k] != null);
  if (given.length !== 1) throw refuse('reach.input', `reach: give one of sheet, region or volume (got ${given.join(', ') || 'none'})`);
  if (opt.sheet) {
    const s = sheetFrame(opt.sheet), W = s.width / 2, H = s.height / 2;
    const us = ticks(-W, W, step), vs = ticks(-H, H, step), points = [];
    capped(us.length * vs.length, step);
    vs.forEach((y, j) => { for (const x of j % 2 ? [...us].reverse() : us) points.push(sheetPoint(s, x, y)); });
    return { points, corners: [[-W, -H], [W, -H], [W, H], [-W, H]].map(([x, y]) => sheetPoint(s, x, y)) };
  }
  const area = opt.region || opt.volume, what = opt.region ? 'region' : 'volume';
  const lo = area.lo, hi = area.hi;
  const xr = pair(what, area.x ?? (lo && [lo[0], hi?.[0]]), 'x'), yr = pair(what, area.y ?? (lo && [lo[1], hi?.[1]]), 'y');
  let zr;
  if (opt.volume) zr = pair(what, area.z ?? (lo && [lo[2], hi?.[2]]), 'z');
  else {
    const z = area.z ?? lo?.[2] ?? 0;
    if (!num(z)) throw refuse('region.z', `region: z is a height in mm (got ${JSON.stringify(z)})`);
    zr = [z, z];
  }
  const xs = ticks(xr[0], xr[1], step), ys = ticks(yr[0], yr[1], step), zs = ticks(zr[0], zr[1], step), points = [];
  capped(xs.length * ys.length * zs.length, step);
  zs.forEach((z) => ys.forEach((y, j) => { for (const x of j % 2 ? [...xs].reverse() : xs) points.push([x, y, z]); }));
  const box = (zs.length > 1 ? [zr[0], zr[1]] : [zr[0]]).flatMap((z) => [[xr[0], yr[0], z], [xr[1], yr[0], z], [xr[1], yr[1], z], [xr[0], yr[1], z]]);
  return { points, corners: box };
}

/**
 * The region a chain reaches, sampled on a grid against reach and limits, with how much margin and dexterity each
 * sample has. margin is signed mm: above 0 inside, the negative of the miss outside.
 * @param {object} c
 * @param {{ sheet?: object, region?: object, volume?: object, step: number, elbow?: 'left' | 'right' }} opt
 * @returns {{ samples: { point: number[], reachable: boolean, q: number[], margin: number, manipulability: number, miss: number }[], summary: { worst: object, margin: number, corners: object[], reachable: number, total: number }, findings: object[] }}
 */
export function reach(c, opt) {
  c = chain(/** @type {any} */ (c));
  if (!opt || typeof opt !== 'object') throw refuse('reach.input', 'reach: give { sheet | region | volume, step }');
  const { step, elbow } = opt;
  if (!num(step) || !(step > 0)) throw refuse('reach.step', `reach: step is a distance in mm, above 0 (got ${JSON.stringify(step)})`);
  const { points, corners } = grid(c, opt, step);
  let last = null;
  const sampleAt = (point) => {
    const options = elbow ? { elbow } : {};
    let r = ik(c, point, { ...options, ...(last ? { start: last } : {}) });
    if (!r.ok && last && r.method === 'numeric') r = ik(c, point, options);
    if (r.ok) last = r.q;
    return { point, reachable: r.ok, q: r.q, margin: r.ok ? marginAt(c, r.q, point) : -r.miss, manipulability: manipulability(c, r.q), miss: r.ok ? 0 : r.miss };
  };
  const samples = points.map(sampleAt), cornerSamples = corners.map(sampleAt);
  const worst = samples.reduce((a, b) => (b.margin < a.margin ? b : a)), reachable = samples.filter((s) => s.reachable).length;
  const out = [];
  const misses = samples.filter((s) => !s.reachable);
  if (misses.length) {
    const lo = [0, 1, 2].map((k) => Math.min(...misses.map((s) => s.point[k]))), hi = [0, 1, 2].map((k) => Math.max(...misses.map((s) => s.point[k])));
    out.push({ level: 'fail', text: `${misses.length} of ${samples.length} samples are out of reach; the worst misses by ${worst.miss.toFixed(2)} mm`, code: 'reach.miss', values: { miss: worst.miss, count: misses.length }, at: worst.point, box: { lo, hi } });
  } else out.push({ level: 'pass', text: `all ${samples.length} samples are in reach; the least margin is ${worst.margin.toFixed(2)} mm`, code: 'reach.ok', values: { margin: worst.margin }, at: worst.point });
  return { samples, summary: { worst, margin: worst.margin, corners: cornerSamples, reachable, total: samples.length }, findings: out };
}

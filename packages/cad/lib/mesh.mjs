// Meshes from elsewhere (an STL or 3MF from the internet, a maker's CAD export): read them, measure them, and compare a
// design with them. Everything works on triangles, [[x, y, z] × 3], in millimetres. No dependencies but node's zlib.
//   readMesh(file) -> triangles
//   profiles(tris, axis) -> the stretches along an axis where the cross-section stays the same, each with its outline
//   spans(tris, axis, at) -> where a line along an axis is inside the solid
//   align(moving, fixed) -> the turn and shift that best lays moving over fixed
//   deviation(from, to) -> how far points on one surface are from the other, signed (+ outside, - inside)
import fs from 'node:fs';
import zlib from 'node:zlib';

export const AXES = ['x', 'y', 'z'];
export const axisOf = (a) => { const i = AXES.indexOf(String(a).toLowerCase()); if (i < 0) throw new Error(`axis is x, y or z, not "${a}"`); return i; };
// The two other axes of a cross-section, in order: across, then up (z when it can be)
export const planeAxes = (axis) => (axis === 2 ? [0, 1] : axis === 1 ? [0, 2] : [1, 2]);
const r2 = (n) => Math.round(n * 100) / 100;

// ---- reading ----

export function readMesh(file) {
  const buf = fs.readFileSync(file);
  if (/\.3mf$/i.test(file)) return read3mf(buf);
  if (/\.stl$/i.test(file)) return readStl(buf);
  throw new Error(`${file}: an STL or 3MF, please (export STEP files from a CAD program as STL first)`);
}

export function readStl(buf) {
  const n = buf.length >= 84 ? buf.readUInt32LE(80) : -1;
  if (n >= 0 && 84 + n * 50 === buf.length) { // binary
    const tris = [];
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12, v = (k) => [buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)];
      tris.push([v(0), v(1), v(2)]);
    }
    return tris;
  }
  const pts = [...buf.toString('utf8').matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  if (!pts.length || pts.length % 3) throw new Error('not an STL: no triangles found');
  const tris = [];
  for (let i = 0; i < pts.length; i += 3) tris.push([pts[i], pts[i + 1], pts[i + 2]]);
  return tris;
}

// A zip's files by name (stored or deflated), from its central directory
export function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file');
  let count = buf.readUInt16LE(e + 10), p = buf.readUInt32LE(e + 16);
  if (p === 0xffffffff && e >= 20 && buf.readUInt32LE(e - 20) === 0x07064b50) { // Zip64: the real numbers are in its own record
    const z = Number(buf.readBigUInt64LE(e - 12));
    count = Number(buf.readBigUInt64LE(z + 32));
    p = Number(buf.readBigUInt64LE(z + 48));
  }
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('a damaged zip file');
    const method = buf.readUInt16LE(p + 10), nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30), noteLen = buf.readUInt16LE(p + 32);
    let local = buf.readUInt32LE(p + 42), csize = buf.readUInt32LE(p + 20);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // Zip64: sizes and offset in the extra field when the 32-bit ones are 0xffffffff
    const ext = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    for (let q = 0; q + 4 <= ext.length;) {
      const id = ext.readUInt16LE(q), len = ext.readUInt16LE(q + 2);
      if (id === 1) {
        let r = q + 4;
        if (buf.readUInt32LE(p + 24) === 0xffffffff) r += 8; // uncompressed size
        if (buf.readUInt32LE(p + 20) === 0xffffffff) { csize = Number(ext.readBigUInt64LE(r)); r += 8; }
        if (local === 0xffffffff) local = Number(ext.readBigUInt64LE(r));
      }
      q += 4 + len;
    }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : method === 0 ? data : null;
    p += 46 + nameLen + extraLen + noteLen;
  }
  return files;
}

// A 3MF: every build item, with its transform, and the components it is made of (in this model file or another)
export function read3mf(buf) {
  const files = unzip(buf);
  const models = Object.fromEntries(Object.entries(files).filter(([n, d]) => d && /\.model$/i.test(n)).map(([n, d]) => ['/' + n.replace(/^\//, ''), d.toString('utf8')]));
  const root = Object.keys(models).find((n) => /^\/3D\/3dmodel\.model$/i.test(n)) || Object.keys(models)[0];
  if (!root) throw new Error('no 3D model in the 3MF');
  const attr = (s, k) => { const m = s.match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)); return m ? m[1] : undefined; };
  const objects = {}; // "<file>#<id>" -> { tris, components }
  for (const [file, xml] of Object.entries(models)) {
    for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
      const id = attr(m[1], 'id'), body = m[2];
      const verts = [...body.matchAll(/<vertex\b([^>]*)\/>/g)].map((v) => ['x', 'y', 'z'].map((k) => +attr(v[1], k)));
      const tris = [...body.matchAll(/<triangle\b([^>]*)\/>/g)].map((t) => ['v1', 'v2', 'v3'].map((k) => verts[+attr(t[1], k)]));
      const components = [...body.matchAll(/<component\b([^>]*)\/>/g)].map((c) => ({ ref: `${attr(c[1], 'p:path') || file}#${attr(c[1], 'objectid')}`, transform: attr(c[1], 'transform') }));
      objects[`${file}#${id}`] = { tris, components };
    }
  }
  const out = [];
  const place = (key, M, depth = 0) => {
    const o = objects[key];
    if (!o || depth > 16) return;
    for (const t of o.tris) out.push(t.map((v) => apply3mf(M, v)));
    for (const c of o.components) place(c.ref, mul3mf(parse3mf(c.transform), M), depth + 1);
  };
  const items = [...models[root].matchAll(/<item\b([^>]*)\/>/g)];
  if (items.length) for (const it of items) place(`${attr(it[1], 'p:path') || root}#${attr(it[1], 'objectid')}`, parse3mf(attr(it[1], 'transform')));
  else for (const k of Object.keys(objects)) if (k.startsWith(root)) place(k, parse3mf());
  if (!out.length) throw new Error('the 3MF has no triangles');
  return out;
}
// 3MF transforms are 3 × 4, row vectors: p' = p · M (m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32)
const parse3mf = (s) => (s ? s.trim().split(/\s+/).map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
const apply3mf = (m, [x, y, z]) => [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
const mul3mf = (a, b) => { // a then b
  const r = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) r.push((i < 3 ? 0 : b[9 + j]) + a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return r;
};

// ---- measuring ----

export function bounds(tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t) for (let a = 0; a < 3; a++) { if (v[a] < min[a]) min[a] = v[a]; if (v[a] > max[a]) max[a] = v[a]; }
  return { min, max, size: max.map((m, a) => m - min[a]) };
}
export const volume = (tris) => Math.abs(tris.reduce((s, [a, b, c]) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0));

// The cross-section at axis = v: segments in the plane's (across, up) coordinates
export function section(tris, axis, v) {
  const [u, w] = planeAxes(axis), segs = [];
  for (const t of tris) {
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3], da = a[axis] - v, db = b[axis] - v;
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) { const f = da / (da - db); pts.push([a[u] + f * (b[u] - a[u]), a[w] + f * (b[w] - a[w])]); }
    }
    if (pts.length === 2) segs.push(pts);
  }
  return segs;
}

// Where a line through a section, at height h, is inside: [[from, to], …] across
export function crossings(segs, h) {
  const xs = [];
  for (const [a, b] of segs) if ((a[1] < h && b[1] >= h) || (a[1] >= h && b[1] < h)) xs.push(a[0] + ((h - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  xs.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

// Where a line along an axis, through the point `at` (the other two coordinates), is inside the solid
export function spans(tris, axis, at) {
  const [u, w] = planeAxes(axis), pu = at[0] + 1e-5, pw = at[1] + 1.3e-5; // off any edge
  const hits = [];
  for (const t of tris) {
    const [a, b, c] = t;
    const d = (b[u] - a[u]) * (c[w] - a[w]) - (c[u] - a[u]) * (b[w] - a[w]);
    if (!d) continue;
    const l1 = ((b[u] - pu) * (c[w] - pw) - (c[u] - pu) * (b[w] - pw)) / d, l2 = ((c[u] - pu) * (a[w] - pw) - (a[u] - pu) * (c[w] - pw)) / d, l3 = 1 - l1 - l2;
    if (l1 >= 0 && l2 >= 0 && l3 >= 0) hits.push(l1 * a[axis] + l2 * b[axis] + l3 * c[axis]);
  }
  hits.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

// Join a section's segments into outlines (closed where they meet up)
export function loops(segs, eps = 1e-4) {
  const key = (p) => `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`;
  const from = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!from.has(k)) from.set(k, []); from.get(k).push(i); } });
  const used = new Set(), out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const line = [segs[i][0], segs[i][1]];
    for (;;) {
      const end = line[line.length - 1], next = (from.get(key(end)) || []).find((j) => !used.has(j));
      if (next === undefined) break;
      used.add(next);
      const [p, q] = segs[next];
      line.push(key(p) === key(end) ? q : p);
    }
    out.push(line);
  }
  return out;
}

// The stretches along an axis where the cross-section stays the same. The section can only change at a vertex, so it
// is taken once between each pair of neighbouring vertex positions, and equal neighbours are merged. Stretches that
// change all along (a taper, a curve) come out as one stretch marked `varies`. Sections are compared by shape (where a
// grid of lines through them is inside, within tol), so a curve triangulated differently along its length still counts
// as the same. A mesh with more distinct positions than `max` is sampled evenly instead.
export function profiles(tris, axis, { max = 4000, tol = 0.05 } = {}) {
  const { min, max: hi } = bounds(tris);
  let cuts = [...new Set(tris.flatMap((t) => t.map((v) => Math.round(v[axis] * 1000) / 1000)))].sort((a, b) => a - b);
  if (cuts.length > max) cuts = Array.from({ length: max + 1 }, (_, i) => min[axis] + ((hi[axis] - min[axis]) * i) / max);
  // A section's signature is its shape, not its triangulation: where lines across it, and up it, are inside
  const [u, w] = planeAxes(axis), grid = 48;
  const lines = (a) => Array.from({ length: grid }, (_, i) => min[a] + ((hi[a] - min[a]) * (i + 0.5)) / grid);
  const swap = (segs) => segs.map((sg) => sg.map(([x, y]) => [y, x]));
  const sig = (segs) => [...lines(w).map((h) => crossings(segs, h).flat()), ...lines(u).map((h) => crossings(swap(segs), h).flat())];
  // The same shape: every line crosses it as often, at places within tol (a curve's facets move a crossing a little)
  const same = (a, b) => a.every((l, i) => l.length === b[i].length && l.every((x, j) => Math.abs(x - b[i][j]) <= tol));
  const runs = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const at = (cuts[i] + cuts[i + 1]) / 2, segs = section(tris, axis, at), s = sig(segs);
    const last = runs[runs.length - 1];
    if (last && same(last.sig, s)) last.to = cuts[i + 1];
    else runs.push({ from: cuts[i], to: cuts[i + 1], sig: s, at, segs });
  }
  // Short runs that differ from each neighbour are a changing stretch (a taper or curve): merge them
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1], short = (x) => x.to - x.from < (hi[axis] - min[axis]) / 200;
    if (last && short(r) && (last.varies || short(last))) { last.to = r.to; last.varies = true; } else out.push({ ...r, varies: false });
  }
  // Number the distinct shapes: a stretch with the same section as an earlier one gets its number
  const distinct = [];
  for (const r of out) {
    if (!r.varies) { r.at = (r.from + r.to) / 2; r.segs = section(tris, axis, r.at); } // the middle: clear of any lead-in at its ends
    Object.assign(r, profileOf(r.segs));
    if (r.varies || r.empty) continue;
    r.shape = distinct.findIndex((x) => same(x, r.sig));
    if (r.shape < 0) { distinct.push(r.sig); r.shape = distinct.length - 1; }
  }
  for (const r of out) delete r.sig;
  return out;
}

// A cross-section described: its extent, and its height bands: the heights over which it has the same number of separate
// pieces across (one for a plate; three where a key stands up between two lips), split again at steps in the outline. Each band gives the pieces at its
// bottom and top and at their widest; `straight` when the sides don't move within the band (no slope or curve).
export function profileOf(segs) {
  if (!segs.length) return { empty: true, bands: [] };
  const pts = segs.flat(), us = pts.map((p) => p[0]), ws = pts.map((p) => p[1]);
  const extent = { across: [Math.min(...us), Math.max(...us)], up: [Math.min(...ws), Math.max(...ws)] };
  const levels = [...new Set(ws.map((w) => Math.round(w * 1000) / 1000))].sort((a, b) => a - b);
  const raw = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const r = { from: levels[i], to: levels[i + 1], inside: crossings(segs, (levels[i] + levels[i + 1]) / 2) };
    if (r.to - r.from < 0.02 && raw.length) raw[raw.length - 1].to = r.to; else raw.push(r); // slivers between facets
  }
  // Steps: flat stretches of outline (a ledge, a shoulder) start a new band even when the piece count doesn't change
  const steps = new Set(segs.filter(([a, b]) => Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[0] - b[0]) > 0.05).map(([a]) => Math.round(a[1] * 1000) / 1000));
  const bands = [];
  for (const r of raw) {
    const last = bands[bands.length - 1];
    if (last && last.pieces === r.inside.length && ![...steps].some((h) => Math.abs(h - r.from) < 0.02)) { last.to = r.to; last.top = r.inside; last.n++; last.widest = last.widest.map(([a, b], j) => [Math.min(a, r.inside[j][0]), Math.max(b, r.inside[j][1])]); }
    else bands.push({ from: r.from, to: r.to, pieces: r.inside.length, bottom: r.inside, top: r.inside, widest: r.inside, n: 1 });
  }
  const near = (x, y) => x.every(([a, b], j) => Math.abs(a - y[j][0]) < 0.01 && Math.abs(b - y[j][1]) < 0.01);
  for (const g of bands) { g.straight = near(g.bottom, g.top) && near(g.bottom, g.widest); g.inside = g.widest; delete g.n; }
  return { extent, bands, curved: bands.some((g) => !g.straight), loops: loops(segs) };
}

// ---- comparing ----

// The 24 ways to turn a part a quarter turn at a time, as 3 × 3 matrices (rows), with names like "rx90 rz180"
export const turns = (() => {
  const rot = (a, q) => { const c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q], m = { 0: [[1, 0, 0], [0, c, -s], [0, s, c]], 1: [[c, 0, s], [0, 1, 0], [-s, 0, c]], 2: [[c, -s, 0], [s, c, 0], [0, 0, 1]] }; return m[a]; };
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
  const seen = new Map();
  for (const [a0, q0] of [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [1, 3]]) for (let q1 = 0; q1 < 4; q1++) {
    const M = mul(rot(2, q1), rot(a0, q0)), k = JSON.stringify(M);
    const name = [q0 ? `r${AXES[a0]}${q0 * 90}` : '', q1 ? `rz${q1 * 90}` : ''].filter(Boolean).join(' ') || 'none';
    if (!seen.has(k)) seen.set(k, { name, M });
  }
  return [...seen.values()];
})();
export const turn = (tris, M, shift = [0, 0, 0]) => tris.map((t) => t.map((v) => M.map((r, i) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + shift[i])));

// "rz90 rx180 t1,2,3" -> { M, shift }: turns applied in order, then the shift
export function parsePlacement(s) {
  let M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], shift = [0, 0, 0];
  for (const w of String(s).trim().split(/\s+/).filter(Boolean)) {
    const r = w.match(/^r([xyz])(-?\d+)$/), t = w.match(/^t(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/);
    if (r) {
      const q = ((+r[2] / 90) % 4 + 4) % 4;
      if (!Number.isInteger(q)) throw new Error(`${w}: quarter turns only (90, 180, 270)`);
      const one = turns.find((x) => x.name === (q ? `r${r[1]}${q * 90}` : 'none'))?.M || rotOne(axisOf(r[1]), q);
      M = one.map((row) => M[0].map((_, j) => row.reduce((s2, x, k) => s2 + x * M[k][j], 0)));
    } else if (t) shift = shift.map((v, i) => v + +t[i + 1]);
    else throw new Error(`placement "${w}": use rx90, ry180, rz270 and t<x>,<y>,<z>`);
  }
  return { M, shift };
}
const rotOne = (a, q) => { const c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q]; return { 0: [[1, 0, 0], [0, c, -s], [0, s, c]], 1: [[c, 0, s], [0, 1, 0], [-s, 0, c]], 2: [[c, -s, 0], [s, c, 0], [0, 0, 1]] }[a]; };

// Nearest-point queries on a mesh, through a grid of its triangles
export function surface(tris) {
  const { min, size } = bounds(tris);
  const h = Math.max(Math.cbrt((size[0] + 1) * (size[1] + 1) * (size[2] + 1) / Math.max(tris.length, 1)) * 1.5, 0.2);
  const dims = size.map((s) => Math.max(1, Math.ceil((s + 1e-9) / h)));
  const cell = (v, a) => Math.min(dims[a] - 1, Math.max(0, Math.floor((v - min[a]) / h)));
  const grid = new Map(), id = (i, j, k) => (i * dims[1] + j) * dims[2] + k;
  const normals = tris.map(([a, b, c]) => { const u = sub(b, a), v = sub(c, a), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; return n.map((x) => x / l); });
  tris.forEach((t, n) => {
    const lo = [0, 1, 2].map((a) => cell(Math.min(t[0][a], t[1][a], t[2][a]), a)), hi = [0, 1, 2].map((a) => cell(Math.max(t[0][a], t[1][a], t[2][a]), a));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const c = id(i, j, k); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(n); }
  });
  const far = Math.max(...dims);
  // nearest(p) -> { d (signed: + outside, - inside), q (the nearest point), n (its triangle) }
  const nearest = (p) => {
    const c = [0, 1, 2].map((a) => Math.floor((p[a] - min[a]) / h));
    let best = null;
    for (let r = 0; r <= far + Math.ceil(Math.max(...[0, 1, 2].map((a) => Math.max(-c[a], c[a] - dims[a] + 1, 0)))); r++) {
      for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let k = c[2] - r; k <= c[2] + r; k++) {
        if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(k - c[2])) !== r) continue; // this ring only
        if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) continue;
        for (const n of grid.get(id(i, j, k)) || []) {
          const q = closest(p, tris[n]), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
          if (!best || d < best.dist - 1e-12) best = { dist: d, q, n };
        }
      }
      // Anything in a farther ring is at least r × h away (less the distance from p to its cell's edge)
      if (best && best.dist <= r * h) break;
    }
    if (!best) return null;
    const v = sub(p, best.q), nn = normals[best.n];
    let sign = Math.sign(v[0] * nn[0] + v[1] * nn[1] + v[2] * nn[2]);
    if (best.dist > 1e-9 && Math.abs(v[0] * nn[0] + v[1] * nn[1] + v[2] * nn[2]) < best.dist * 0.5) sign = pseudoSign(p, best, (grid.get(id(...[0, 1, 2].map((a) => cell(best.q[a], a)))) || []).map((n) => tris[n]), (grid.get(id(...[0, 1, 2].map((a) => cell(best.q[a], a)))) || []).map((n) => normals[n])); // near an edge: ask the neighbours
    return { d: (sign || 1) * best.dist, q: best.q, n: best.n };
  };
  return { nearest, normals };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// At an edge or corner the nearest face's normal can point either way: average the normals of the faces that share the
// nearest point
function pseudoSign(p, best, tris, normals) { // tris and normals: the faces near the nearest point
  const q = best.q, v = sub(p, q), acc = [0, 0, 0];
  tris.forEach((t, n) => { if (Math.hypot(...sub(closest(q, t), q)) < 1e-6) for (let a = 0; a < 3; a++) acc[a] += normals[n][a]; });
  return Math.sign(v[0] * acc[0] + v[1] * acc[1] + v[2] * acc[2]);
}

// The point of triangle t nearest p (Ericson, Real-Time Collision Detection, 5.1.5)
export function closest(p, [a, b, c]) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const at = (s, t) => [a[0] + ab[0] * s + ac[0] * t, a[1] + ab[1] * s + ac[1] * t, a[2] + ab[2] * s + ac[2] * t];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const den = 1 / (va + vb + vc);
  return at(vb * den, vc * den);
}

// Points spread evenly over a surface, by area; the same points every run (a fixed seed)
export function sample(tris, n) {
  const areas = tris.map(([a, b, c]) => { const u = sub(b, a), v = sub(c, a); return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; });
  const total = areas.reduce((s, x) => s + x, 0), cum = [];
  areas.reduce((s, x, i) => (cum[i] = s + x), 0);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rnd() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
    const [a, b, c] = tris[lo];
    let s = rnd(), t = rnd();
    if (s + t > 1) { s = 1 - s; t = 1 - t; }
    out.push([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * s + (c[k] - a[k]) * t));
  }
  return out;
}

// Lay `moving` over `fixed`: try the quarter turns whose bounding box matches best, centre them, then shift by the mean
// offset to the nearest points a few times. Returns { name, M, shift, score (mean distance) }.
export function align(moving, fixed, { samples = 1500 } = {}) {
  const F = bounds(fixed), S = surface(fixed), centre = (b) => b.min.map((m, a) => (m + b.max[a]) / 2);
  const tried = turns.map((t) => { const b = bounds(turn(moving, t.M)); return { ...t, b, fit: b.size.reduce((s, x, a) => s + Math.abs(x - F.size[a]), 0) }; });
  const bestFit = Math.min(...tried.map((t) => t.fit));
  const results = [];
  for (const t of tried.filter((x) => x.fit <= bestFit + 0.5)) {
    let shift = sub(centre(F), centre(t.b));
    const pts = sample(turn(moving, t.M), samples);
    let score = Infinity;
    for (let it = 0; it < 10; it++) {
      const off = [0, 0, 0];
      let sum = 0;
      for (const p of pts) { const q = [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]], n = S.nearest(q); sum += Math.abs(n.d); for (let a = 0; a < 3; a++) off[a] += n.q[a] - q[a]; }
      score = sum / pts.length;
      const step = off.map((x) => x / pts.length);
      shift = shift.map((x, a) => x + step[a]);
      if (Math.hypot(...step) < 1e-4) break;
    }
    results.push({ name: t.name, M: t.M, shift, score });
  }
  return results.sort((a, b) => a.score - b.score)[0];
}

// How far each sampled point of `from` is from the surface of `to`, signed (+: outside `to`, -: inside it)
export function deviation(from, to, { samples = 20000 } = {}) {
  const S = surface(to);
  return sample(from, samples).map((p) => ({ p, d: S.nearest(p).d }));
}

// The worst places: the largest deviations, at least `apart` mm from each other
export function worst(points, { count = 5, apart = 3 } = {}) {
  const out = [];
  for (const x of [...points].sort((a, b) => Math.abs(b.d) - Math.abs(a.d))) {
    if (out.length >= count) break;
    if (out.every((o) => Math.hypot(...sub(o.p, x.p)) >= apart)) out.push(x);
  }
  return out;
}

export function stats(points) {
  const a = points.map((x) => Math.abs(x.d)).sort((p, q) => p - q), n = a.length;
  const pct = (f) => a[Math.min(n - 1, Math.floor(f * n))];
  return { max: a[n - 1], mean: a.reduce((s, x) => s + x, 0) / n, p95: pct(0.95), signed: points.reduce((s, x) => s + x.d, 0) / n };
}

// Licences that limit what can be made from a model (non-commercial, no derivatives, share-alike)
export const limitingLicence = (s) => /\b(NC|ND|SA)\b|non-?commercial|no-?deriv|share-?alike|share alike/i.test(String(s || ''));

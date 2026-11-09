// The order a machine goes together in, worked out from the assembly: a part fastened into another comes after it, a
// bearing goes in before its shaft, a part goes where nothing placed yet stands in its way (a nut trapped by a wall goes
// in before its neighbour). Found by taking it apart: a part is free to leave when a straight line takes it clear of
// everything still there, and no part left depends on it. Taking parts away only ever frees others, so if nothing can leave
// no order exists, and that is a finding, assembly.order. A fit with "access": "<item>.<anchor>" names where a screw's
// tool comes from (its anchor's z points out along the screw): whatever stands on that line must go on after it.
// Works on the assembly's top-level items; a component (an assembly used as an item) is one step.
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { placeItems, jointValues, mul } from '@rulecad/model-link';
import { host } from './host.mjs';
import { paths } from './workspace.mjs';

const top = (n) => String(n).split(/[.@]/)[0];
const round = (v) => v.map((x) => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(6)));
const SIDES = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const fan = (poly) => poly.slice(1, -1).map((_, i) => [poly[0], poly[i + 1], poly[i + 2]]);
function basis(d) {
  const a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]], l = Math.hypot(...u), n = u.map((x) => x / l);
  return [n, [d[1] * n[2] - d[2] * n[1], d[2] * n[0] - d[0] * n[2], d[0] * n[1] - d[1] * n[0]]];
}

// One thing that gets placed: its triangles, its box, what a part is known as
function groups(s) {
  const by = new Map();
  s.parts.forEach((p, order) => {
    if (!by.has(p.item)) by.set(p.item, { id: p.item, order, parts: [], tris: [] });
    const g = by.get(p.item); g.parts.push(p);
    for (const t of p.triangles) g.tris.push(...fan(t));
  });
  const objs = new Map(s.objects.map((o) => [o.id, o]));
  for (const g of by.values()) { const o = objs.get(g.id); g.object = o?.objName ?? null; g.bought = o?.bought ?? null; g.motor = !!o?.motor; }
  return [...by.values()];
}

// A part seen along a direction: for each cell of a grid across it, the nearest and furthest of it along the direction
function raster(g, d, h) {
  const [u, v] = basis(d), cells = new Map();
  let uLo = Infinity, uHi = -Infinity, vLo = Infinity, vHi = -Infinity, sLo = Infinity, sHi = -Infinity;
  const k = (i, j) => (i + 1048576) * 2097152 + (j + 1048576);
  for (const t of g.tris) {
    const P = t.map((p) => [dot(p, u), dot(p, v), dot(p, d)]);
    const lo = [Math.min(P[0][0], P[1][0], P[2][0]), Math.min(P[0][1], P[1][1], P[2][1])], hi = [Math.max(P[0][0], P[1][0], P[2][0]), Math.max(P[0][1], P[1][1], P[2][1])];
    uLo = Math.min(uLo, lo[0]); uHi = Math.max(uHi, hi[0]); vLo = Math.min(vLo, lo[1]); vHi = Math.max(vHi, hi[1]); sLo = Math.min(sLo, P[0][2], P[1][2], P[2][2]); sHi = Math.max(sHi, P[0][2], P[1][2], P[2][2]);
    const det = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
    if (Math.abs(det) < 1e-9) continue; // a face seen edge-on covers no cell: the faces either side of it do
    for (let i = Math.floor(lo[0] / h); i <= Math.floor(hi[0] / h); i++) for (let j = Math.floor(lo[1] / h); j <= Math.floor(hi[1] / h); j++) {
      const x = (i + 0.5) * h, y = (j + 0.5) * h, a = ((P[1][1] - P[2][1]) * (x - P[2][0]) + (P[2][0] - P[1][0]) * (y - P[2][1])) / det, b = ((P[2][1] - P[0][1]) * (x - P[2][0]) + (P[0][0] - P[2][0]) * (y - P[2][1])) / det, c = 1 - a - b;
      if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue; // (exact: a slack in these fractions grows with the triangle)
      const z = a * P[0][2] + b * P[1][2] + c * P[2][2];
      const key = k(i, j), now = cells.get(key);
      if (now) { if (z < now[0]) now[0] = z; if (z > now[1]) now[1] = z; } else cells.set(key, [z, z]);
    }
  }
  return { cells, uLo, uHi, vLo, vHi, sLo, sHi, key: k };
}

// Blocked when, in a cell they share, the other has something further along than this part's rearmost: this part, moved
// on, runs into it. Parts meet at their edges, so this part is thinned by a cell; a thing narrower than that keeps its cells.
function blockers(p, q, d, h, rasterOf) {
  const A = rasterOf(p, d), B = rasterOf(q, d);
  if (A.uHi < B.uLo || B.uHi < A.uLo || A.vHi < B.vLo || B.vHi < A.vLo || B.sHi <= A.sLo + 0.2) return false;
  const inner = [...A.cells].filter(([key]) => {
    const j = key % 2097152, i = (key - j) / 2097152;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => A.cells.has((i + a) * 2097152 + (j + b)));
  });
  for (const [key, a] of inner.length ? inner : [...A.cells]) { const b = B.cells.get(key); if (b && b[1] > a[0] + 0.2) return true; }
  return false;
}

// A pair meant to overlap (a press fit) tells nothing about what stands in whose way
const names = (x) => [x].flat().map(top);
const allowedPair = (s, a, b) => s.fits.some((x) => x.min != null && x.num(x.min) < 0 && ((names(x.a).includes(a.id) && names(x.b).includes(b.id)) || (names(x.a).includes(b.id) && names(x.b).includes(a.id))));

function hitsAlong(origin, dir, tris) {
  for (const t of tris) {
    const e1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
    const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]], det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = [origin[0] - t[0][0], origin[1] - t[0][1], origin[2] - t[0][2]], u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / det > 0.05) return true;
  }
  return false;
}

/**
 * The order to put an assembly together, as data.
 * @param {object} s a built assembly
 * @returns {{ steps: { n: number, items: string[], object: string|null, dir: number[], fasteners: {fit: string, fastener?: string, count?: number}[], text: string }[], stuck: object|null }}
 */
export function assemblyOrder(s) {
  const all = groups(s).filter((g) => g.bought || g.motor || g.parts.some((p) => p.role === 'part' || p.role == null) || s.fits.some((x) => [x.a, x.b].flat().some((n) => top(n) === g.id)));
  if (!all.length) return { steps: [], stuck: null };
  const by = new Map(all.map((g) => [g.id, g])), ids = all.map((g) => g.id), joints = s.motion.joints, items = s.motion.items.map((x) => x[0]);
  const bearing = (id) => by.get(id)?.bought?.part === 'bearing';
  // How far each part is from the base along joints and fastenings: nearer goes first
  const links = new Map(ids.map((id) => [id, new Set()])), tie = (a, b) => { if (links.has(a) && links.has(b) && a !== b) { links.get(a).add(b); links.get(b).add(a); } };
  const fastening = s.fits.filter((x) => x.fastens || x.seat != null || x.shaft != null || x.engage != null);
  for (const x of fastening) for (const a of [x.a].flat()) for (const b of [x.b].flat()) tie(top(a), top(b));
  for (const j of joints) if (j.parent >= 0) tie(items[j.parent], items[j.child]);
  const base = items.find((id) => by.has(id)) ?? ids[0], level = new Map([[base, 0]]);
  for (let queue = [base]; queue.length;) { const id = queue.shift(); for (const o of links.get(id)) if (!level.has(o)) { level.set(o, level.get(id) + 1); queue.push(o); } }
  const lv = (id) => level.get(id) ?? 1e6;
  const rank = (id) => [lv(id), by.get(id).order], earlier = (a, b) => { const [x, y] = [rank(a), rank(b)]; return x[0] - y[0] || x[1] - y[1]; };
  // Constraints: [u, v, why]: u before v
  const before = new Map(ids.map((id) => [id, new Map()])), add = (u, v, why) => { if (by.has(u) && by.has(v) && u !== v) before.get(u).set(v, why); };
  for (const j of joints) if (j.parent >= 0) add(items[j.parent], items[j.child], `${items[j.child]} turns on ${items[j.parent]}`);
  for (const x of fastening) for (const A of [x.a].flat()) for (const B of [x.b].flat()) {
    const a = top(A), b = top(B), [u, v] = earlier(a, b) <= 0 ? [a, b] : [b, a];
    if (x.seat != null && (bearing(a) || bearing(b))) { const [h, r] = bearing(a) ? [b, a] : [a, b]; add(h, r, `${r} is pressed into ${h}`); continue; }
    if ((x.shaft != null || x.engage != null) && (bearing(a) || bearing(b))) { const [r, shaft] = bearing(a) ? [a, b] : [b, a]; add(r, shaft, `${r} goes in before ${shaft}`); continue; }
    if (x.fastens) add(u, v, x.note || `${v} fastens to ${u}`);
  }
  // Screws: what stands on the tool's line goes on after the screw, and if it must already be there, nothing can
  const worlds = placeItems(s.motion, s.jointValues), marks = s.motion.marks, reaches = (u, v, seen = new Set()) => { if (u === v) return true; if (seen.has(u)) return false; seen.add(u); return [...before.get(u).keys()].some((w) => reaches(w, v, seen)); };
  const R = 1.5, bad = [];
  for (const x of s.fits.filter((f) => f.access)) {
    const [id, name] = String(x.access).split('.'), m = marks.find((k) => k.id === id && k.name === name);
    if (!m) throw new Error(`fit ${x.note || `${x.a} / ${x.b}`}: access: no anchor "${x.access}" (give <item>.<anchor>${items.includes(id) ? `; ${id} has ${marks.filter((k) => k.id === id).map((k) => k.name).join(', ') || 'none'}` : ''})`);
    const W = mul(worlds[m.item], m.frame), O = [W[3], W[7], W[11]], D = [W[2], W[6], W[10]], [u, v] = basis(D), starts = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].map(([a, b]) => O.map((c, k) => c + a * u[k] + b * v[k]));
    const screwed = [top(x.a), top(x.b)].filter((t) => by.has(t)), later = [...screwed].sort(earlier).at(-1);
    for (const q of all) {
      if (screwed.includes(q.id) || !starts.some((p) => hitsAlong(p, D, q.tris))) continue;
      if (later && reaches(q.id, later)) bad.push({ fit: x, wall: q.id, at: O, later });
      else if (later) add(later, q.id, `${q.id} covers the screw of ${x.note || later}`);
    }
  }
  const box = (g) => { const p = g.tris.flat(); return [0, 1, 2].map((k) => { const v = p.map((x) => x[k]); return (Math.min(...v) + Math.max(...v)) / 2; }); };
  if (bad.length) {
    const b = bad[0], label = b.fit.note || `${b.fit.a} to ${b.fit.b}`;
    return { steps: [], stuck: { item: b.later, screw: label, wall: b.wall, at: b.at, text: `the screw of "${label}" can't be reached in any order: ${b.wall} stands over it and goes on first (${[...before.get(b.wall)].slice(0, 1).map(([, why]) => why)})` } };
  }
  let span = 1;
  for (const g of all) for (const t of g.tris) for (const p of t) for (const c of p) span = Math.max(span, Math.abs(c) * 2);
  const h = Math.max(0.4, Math.min(1.5, span / 300)), memo = new Map(), rasterOf = (g, d) => { const key = `${g.id}|${d.join(',')}`; if (!memo.has(key)) memo.set(key, raster(g, d, h)); return memo.get(key); };
  const free = (p, rest, d) => { for (const q of rest) if (q !== p && !allowedPair(s, p, q) && blockers(p, q, d, h, rasterOf)) return false; return true; };
  const dirsFor = (p) => { // along its own axes first: a part on a joint goes on along that joint, then from above, then round the sides
    const own = [];
    for (const j of joints) if (items[j.child] === p.id) { const P = j.parent < 0 ? j.a : mul(worlds[j.parent], j.a); own.push([P[2], P[6], P[10]]); }
    for (const m of marks) if (m.id === p.id) { const W = mul(worlds[m.item], m.frame); own.push([W[2], W[6], W[10]]); }
    const list = [...own.flatMap((a) => [round(a), round(a.map((x) => -x))]), ...SIDES];
    return [...new Map(list.map((d) => [d.map((x) => x.toFixed(3)).join(','), d])).values()];
  };
  // What stays together if a part can't leave alone: its joint parent and all that hangs from it (planets on their carrier)
  const below = (a) => { const out = new Set([a]); for (let grew = true; grew;) { grew = false; for (const j of joints) if (j.parent >= 0 && out.has(items[j.parent]) && by.has(items[j.child]) && !out.has(items[j.child])) { out.add(items[j.child]); grew = true; } } return out; };
  const parentOf = (id) => { const j = joints.find((x) => items[x.child] === id); return j && j.parent >= 0 ? items[j.parent] : null; };
  // Take a set of parts apart, the last-attached first: [{ p, d }] or [{ group, d, sub }] (a set that leaves as one, then apart)
  function takeApart(start) {
    let rest = [...start].sort((a, b) => earlier(b.id, a.id));
    const off = [], waits = (p, set) => [...before.get(p.id).keys()].some((v) => set.some((q) => q.id === v));
    while (rest.length) {
      let pick = null;
      for (const p of rest) {
        if (waits(p, rest)) continue;
        if (rest.length === 1) { pick = { p, d: [0, 0, 1] }; break; }
        const d = dirsFor(p).find((x) => free(p, rest, x));
        if (d) { pick = { p, d }; break; }
      }
      if (!pick) for (const p of rest) { // nothing leaves alone: try what's joined to it, as one
        for (let a = parentOf(p.id); a && a !== base && rest.some((q) => q.id === a) && !pick; a = parentOf(a)) {
          const names = below(a), group = rest.filter((q) => names.has(q.id)), others = rest.filter((q) => !names.has(q.id));
          if (group.length < 2 || !others.length || group.length === rest.length || group.some((q) => waits(q, others))) continue;
          const d = dirsFor(by.get(a)).find((x) => group.every((q) => others.every((o) => allowedPair(s, q, o) || !blockers(q, o, x, h, rasterOf))));
          if (d) { const sub = takeApart(group); if (sub.stuck) return sub; pick = { group, d, sub }; }
        }
        if (pick) break;
      }
      if (!pick) {
        const stuckBy = rest.filter((p) => !waits(p, rest))[0] ?? rest[0];
        const holders = [...new Set(SIDES.flatMap((d) => rest.filter((q) => q !== stuckBy && !allowedPair(s, stuckBy, q) && blockers(stuckBy, q, d, h, rasterOf)).map((q) => q.id)))];
        const ringed = rest.filter((p) => waits(p, rest)).map((p) => p.id);
        return { stuck: { item: stuckBy.id, wall: holders[0] ?? null, holders, at: box(stuckBy), text: holders.length ? `${stuckBy.id} can't be reached in any order: ${holders.join(' and ')} ${holders.length > 1 ? 'hold' : 'holds'} it in from every side` : `${ringed.join(', ')} each have to go on before the next, in a ring` } };
      }
      off.push(pick); const gone = pick.group ?? [pick.p]; rest = rest.filter((g) => !gone.includes(g));
    }
    return { off };
  }
  const apart = takeApart(all);
  if (apart.stuck) return { steps: [], stuck: apart.stuck };
  // Put together: last off is first on, a set built up on its own and then fitted as one
  const seq = [], lay = (off) => { for (const x of [...off].reverse()) { if (x.group) { lay(x.sub.off); seq.push({ group: x.group, d: x.d }); } else seq.push(x); } };
  lay(apart.off);
  const at = new Map(), steps = [];
  seq.forEach((x, i) => { for (const g of x.group ?? [x.p]) at.set(g.id, i); });
  for (const [i, x] of seq.entries()) {
    if (x.group) { steps.push({ items: x.group.map((g) => g.id), object: null, dir: round(x.d), fasteners: [], together: true }); continue; }
    const { p, d } = x, list = [...new Set(s.fits.filter((f) => [...names(f.a), ...names(f.b)].includes(p.id) && (f.fastens || f.seat != null || f.fastener) && [...names(f.a), ...names(f.b)].every((n) => (at.get(n) ?? 0) <= i)))];
    steps.push({ items: [p.id], object: p.object, dir: round(d), fasteners: list.map((f) => ({ fit: f.note || f.label || `${f.a} to ${f.b}`, ...(f.fastener ? { fastener: f.fastener } : {}), ...(f.count != null ? { count: f.num(f.count) } : {}) })) });
  }
  // Copies of one thing fitted the same way, one after another, are one step
  const merged = [];
  for (const st of steps) {
    const last = merged.at(-1);
    if (last && st.object && !st.together && last.object === st.object && last.dir.join() === st.dir.join() && JSON.stringify(last.fasteners.map((f) => f.fit)) === JSON.stringify(st.fasteners.map((f) => f.fit))) last.items.push(...st.items);
    else merged.push({ items: [...st.items], object: st.object, dir: st.dir, fasteners: st.fasteners, ...(st.together ? { together: true } : {}) });
  }
  merged.forEach((st, i) => { st.n = i + 1; st.text = `${st.items.join(', ')}${st.object && !st.items.includes(st.object) ? ` (${st.object})` : ''}${st.together ? ' go on as one' : i ? ` goes on${st.items.length > 1 ? ', one by one' : ''}` : ' first'}${st.fasteners.length ? `: ${st.fasteners.map((f) => `${f.fit}${f.fastener ? ` (${f.count != null ? `${f.count} × ` : ''}${f.fastener})` : ''}`).join('; ')}` : ''}`; });
  return { steps: merged, stuck: null };
}

// Cached by what the parts are and where they are, with everything else that changes the answer
function orderFile(s) {
  const key = crypto.createHash('sha256').update(JSON.stringify([4, s.parts.map((p) => [p.item, p.hash ?? p.shape, Array.from(p.m ?? []).map((x) => +x.toFixed(4))]), s.fits.map(({ num, ...x }) => x), s.motion.joints.map((j) => [j.id, j.child, j.parent])])).digest('hex');
  return paths.cache('order', `${key}.json`);
}
export function orderOf(s) {
  if (s.orderSteps) return s.orderSteps;
  const file = orderFile(s);
  if (!process.env.CAD_NO_CACHE && host.exists(file)) return (s.orderSteps = JSON.parse(host.readText(file)));
  const r = assemblyOrder(s);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); host.writeText(file, JSON.stringify(r)); } catch {} // (only slower without it)
  return (s.orderSteps = r);
}

// Whether an assembly is something that goes together with fastenings: anything else has no steps to find
export const isBuilt = (s) => s.a.kind !== 'plate' && s.fits.some((x) => x.fastens || x.seat != null || x.shaft != null || x.access);

/** assembly.order, in the assembly's findings shape. */
export function orderChecks(s, f) {
  if (!isBuilt(s) || (s.pose != null && s.pose !== s.motion.pose)) return;
  const r = orderOf(s);
  if (r.stuck) f('fail', r.stuck.text, `${r.stuck.item}: can't be reached`, { code: 'assembly.order', at: r.stuck.at, refs: { item: r.stuck.item, ...(r.stuck.wall ? { wall: r.stuck.wall } : {}), ...(r.stuck.screw ? { screw: r.stuck.screw } : {}), ...(r.stuck.holders ? { holders: r.stuck.holders } : {}) } });
  else f('pass', `goes together in ${r.steps.length} step${r.steps.length === 1 ? '' : 's'}, ${r.steps[0]?.items[0]} first, nothing trapped`, null, { code: 'assembly.order', values: { steps: r.steps.length }, refs: { first: r.steps[0]?.items[0] } });
}

/** Each step's picture: what's there, and the new part held off along the way it goes on. @returns {object[][]} parts lists, for preview() */
export function stepPictures(s, r) {
  let off = 40;
  for (const p of s.parts) for (const t of p.triangles) for (const v of t) off = Math.max(off, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  off *= 0.5;
  return r.steps.map((st, i) => {
    const shown = new Set(r.steps.slice(0, i + 1).flatMap((x) => x.items)), now = new Set(st.items);
    return s.parts.filter((p) => shown.has(p.item)).map((p) => (now.has(p.item) ? { ...p, role: 'part', triangles: p.triangles.map((t) => t.map((v) => v.map((c, k) => c + st.dir[k] * off))) } : { ...p, role: 'reference' }));
  });
}

export const orderText = (ref, r) => (r.stuck ? `${ref}: ${r.stuck.text}` : [`${ref}: how it goes together`, ...r.steps.map((st) => `  ${String(st.n).padStart(2)}. ${st.text}`)].join('\n'));

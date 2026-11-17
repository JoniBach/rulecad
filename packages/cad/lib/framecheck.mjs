// A frame's own checks (@rulecad/fea/frame): the assembly's beams and joins become beam elements joined at nodes, and
// the frame is solved under its weight and what it carries.
//
// The model. Each beam that is placed and still (no moving joint carries it) is cut into elements at every place
// something meets it: its ends, each join that lands on it, each item mounted on it, each load and named point, each
// support. A join puts a's end on a node at b's axis through a rigid link (a's end stands half b's width off b's
// axis), with the join's spring (its bending and twist, @rulecad/frames' joinStiffness, an estimate until the joint
// rig measures it) at a's element end. Supports are the assembly's "frame": { "supports" } where given, else its feet
// (the beam ends a foot, a levelling foot, a castor plate or a stacking foot is fitted to), else its lowest beam ends:
// each held from moving and free to turn (pinned), as a foot on a floor is.
//
// The loads. Gravity on every beam (its sheet's mass per metre, else its section and alloy), on every item mounted on
// a beam (its mass at its centre, as a force and a moment at the node where its chain of mounts meets the beam), and
// the assembly's "loads" that are masses. A mass carried by a moving joint mounted on a beam (a carriage on a guide, a
// door on its hinge) is solved at each pose: the joint at each end of its travel, every named pose, and as drawn; the
// worst is named.
//
// Every figure is worked out twice: with the joins' springs, and with the joins rigid. The springs are the honest
// estimate; rigid joins bound it from the stiff side. Each finding gives both and says which joins it rests on.
// Units: mm, N, N·mm, MPa, kg.
import fs from 'node:fs';
import path from 'node:path';
import { frame as solveFrame, subdivide } from '@rulecad/fea/frame';
import { placeItems, jointValues, mul } from '@rulecad/model-link';
import { paths } from './workspace.mjs';
import { massesOf } from './loads.mjs';
import { axisOf } from './motors.mjs';

const G = 9.80665;
const FEET = ['foot', 'levelling-foot', 'castor-plate', 'stacking-foot'];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rowsAt = (W, p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
const n3 = (x, d = 3) => String(+Number(x).toFixed(d)), r3 = (x) => +Number(x).toFixed(3), r4 = (p) => p.map(r3);
const fig = (x) => String(+Number(x).toPrecision(3));
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));

/** The working figures of the frame checks, each with what it rests on. */
export const FRAME_CHECK = {
  sag: { value: 360, unit: 'span per mm', rule: 'Where nothing else sets a limit, a beam may sag by its span over this much: a floor member\'s limit under the load it carries, a starting figure for a frame that holds things still. A guide\'s own tolerance, the assembly\'s frame.limit or its task\'s accuracy set a tighter one', kind: 'default', source: 'International Building Code, Table 1604.3, floor members under live load, l/360 (as reproduced in 780 CMR 1604.3, Massachusetts State Building Code); a building\'s serviceability figure taken as a frame\'s starting point', checked: '2026-11-17' },
  margin: { value: 2, unit: '×', rule: 'A beam, a join or a beam in compression is checked against about twice its load: under this margin it warns, under 1 it fails', kind: 'default', source: 'The kit\'s standard of sizing from the load with about twice the margin (issue 240)', checked: '2026-11-17' },
  link: { value: 1000, unit: '×', rule: 'A join\'s link from b\'s axis to a\'s end is a beam this many times stiffer than the stiffest beam it joins: rigid beside them, and not so stiff that the solve loses its digits', kind: 'default', source: 'A working figure of @rulecad/cad: doubles keep about 16 digits, and a ratio of 1000 costs 3 of them', checked: '2026-11-17' },
  euler: { value: 1, unit: '', rule: 'A beam in compression is checked against Euler\'s load for its length with both ends pinned (effective length factor 1): a join holds an end more than a pin does, so this is the low end of what it carries', kind: 'default', source: 'Euler\'s column, P = π² E I / (K L)², K = 1 for both ends pinned (Roark\'s Formulas for Stress and Strain, 7th ed., table 15.1, case 1a)', checked: '2026-11-17' },
};

// what a join's spring rests on, in a few words
const restsWord = (k) => (k.measured?.bending && k.measured?.twist ? 'measured' : k.fitting ? 'a printed fitting by finite elements' : k.bought?.own ? `${k.bought.set}'s own figures, ${k.kind}` : 'an estimate');

/**
 * The frame of a built assembly as @rulecad/fea/frame's model, with what it rests on: the beams it holds, its nodes and
 * elements (with the joins' springs, and a copy with the joins rigid), its supports, and each load case. Null where the
 * assembly has no beams. Refused by name: frame.supports that name no beam or say neither pinned nor fixed.
 * @param {object} s a built assembly @param {{ placeItems: Function, jointValues: Function, mul: Function }} helpers
 */
export function frameModelOf(s, helpers) {
  const motion = s.motion;
  if (!motion || !s.objects.some((o) => o.beam && !o.unplaced)) return null;
  // beams with no joins and nothing said of their supports are parts held by other means (fastened to a plate, a lone
  // upright on a printed base): not a frame to solve
  if (!s.joins?.length && s.a.frame == null) return null;
  const { placeItems, jointValues, mul } = helpers, ids = motion.items.map((x) => x[0]), base = jointValues(motion, motion.pose ?? undefined), worlds = placeItems(motion, base);
  const opts = s.a.frame ?? {};
  if (typeof opts !== 'object' || Array.isArray(opts)) throw new Error(`frame is { "supports", "limit", "points" } (got ${shown(opts)})`);
  for (const k of Object.keys(opts)) if (!['supports', 'limit', 'points'].includes(k)) throw new Error(`frame has no "${k}": it takes supports, limit, points`);
  const byChild = new Map(motion.joints.map((j) => [j.child, j])), moving = (j) => !j.at && j.type !== 'fixed';
  const movesWith = (k) => { for (let i = k, n = 0; n < 99; n++) { const j = byChild.get(i); if (!j) return false; if (moving(j)) return true; i = j.parent; } return false; };
  const down = (() => { const g = motion.gravity || [0, 0, -1], l = Math.hypot(...g) || 1; return g.map((c) => c / l); })();
  // the beams: still ones only (a beam on a carriage is a load, not the frame)
  const beams = new Map(), left = [];
  for (const o of s.objects) {
    if (!o.beam || o.unplaced) continue;
    const k = ids.indexOf(o.id);
    if (k < 0) continue;
    if (movesWith(k)) { left.push(o.id); continue; }
    const W = worlds[k], m = o.beam, L = m.length, A = rowsAt(W, [0, 0, 0]), u = [W[2], W[6], W[10]], top = [W[1], W[5], W[9]];
    const mat = m.profile.material, F = m.figures, E = m.material?.modulus ?? mat?.modulus, nu = mat?.poisson ?? mat?.figures?.poisson?.value;
    const Gs = mat?.figures?.shear_modulus?.value ?? (E && nu != null ? E / (2 * (1 + nu)) : null), grams = m.weight?.sheet ?? m.mass ?? 0;
    const strength = mat?.strength ?? mat?.figures?.strength?.value ?? null;
    beams.set(o.id, { id: o.id, k, m, L, W, A, u, top, E, G: Gs, strength, alloy: m.material?.name ?? mat?.name ?? null, grams,
      section: { A: F.area.value, Iy: F.inertiaX.value, Iz: F.inertiaY.value, J: F.torsion.value, Wy: F.modulusX.value, Wz: F.modulusY.value }, stations: new Set([0, L]) });
  }
  const missing = [...beams.values()].filter((b) => !(b.E > 0 && b.G > 0 && b.section.Iy > 0 && b.section.J > 0)).map((b) => b.id);
  for (const id of missing) { beams.delete(id); left.push(id); }
  if (!beams.size) return { beams, left, missing, empty: true };
  const at = (b, z) => add(b.A, scale(b.u, z)), station = (b, P) => Math.max(0, Math.min(b.L, dot(sub(P, b.A), b.u)));
  const snap = (b, z) => { for (const q of b.stations) if (Math.abs(q - z) < 0.05) return q; b.stations.add(z); return z; };
  // where an item's chain of mounts meets a still beam: that joint, and whether anything on the way moves
  const mountOf = (k) => { let mover = null; for (let i = k, n = 0; n < 99; n++) { const j = byChild.get(i); if (!j) return null; if (moving(j)) mover = mover ?? j; if (beams.has(ids[j.parent])) return { beam: beams.get(ids[j.parent]), joint: j, mover }; i = j.parent; } return null; };
  // a mount's station on its beam at a set of joint values: a slide along the beam moves it
  const mountStation = (mt, values) => { const j = mt.joint, z = j.a[11], v = j.type === 'prismatic' ? (values[j.id]?.[0] ?? 0) : 0; return Math.max(0, Math.min(mt.beam.L, z + v * j.a[10])); };

  // the poses: as drawn, each named pose, and each moving joint mounted on a beam at either end of its travel
  const cases = [{ label: 'as drawn', values: base }];
  for (const p of Object.keys(motion.poses || {})) cases.push({ label: `pose ${p}`, values: jointValues(motion, p) });
  const movers = motion.joints.filter((j) => moving(j) && beams.has(ids[j.parent]) && j.dofs?.length === 1);
  for (const j of movers) for (const v of j.dofs[0].slice(0, 2)) cases.push({ label: `${j.id} at ${n3(v, 1)}`, values: { ...base, [j.id]: [v] } });

  // what weighs on the frame: items (beams' own weight is the elements'), and the masses of "loads"
  const masses = massesOf(s, { placeItems, jointValues }), carried = [], loose = [], unknown = [];
  for (const q of masses) {
    if (beams.has(q.id) || left.includes(q.id)) continue;
    if (!q.known) { unknown.push(q.id); continue; }
    if (!(q.kg > 0)) continue;
    const mt = mountOf(q.item);
    if (!mt) { loose.push(q.id); continue; }
    carried.push({ id: q.id, item: q.item, kg: q.kg, centre: q.centre, mount: mt });
  }
  const loads = [];
  (motion.loads || []).forEach((l, i) => {
    if (l.mass == null) return;
    const where = s.a.loads?.[i]?.at ?? ids[l.item], point = [l.frame[3], l.frame[7], l.frame[11]];
    if (beams.has(ids[l.item])) { const b = beams.get(ids[l.item]); loads.push({ index: i, kg: l.mass, where, item: l.item, point, beam: b, z: snap(b, Math.max(0, Math.min(b.L, point[2]))), note: l.note }); return; }
    const mt = mountOf(l.item);
    if (!mt) { loose.push(`load ${i + 1} (${where})`); return; }
    loads.push({ index: i, kg: l.mass, where, item: l.item, point, mount: mt, note: l.note });
  });
  for (const c of [...carried, ...loads.filter((l) => l.mount)]) for (const cs of cases) snap(c.mount.beam, mountStation(c.mount, cs.values));
  // named points, and every guide's travel
  const points = (opts.points ?? []).map((p, i) => {
    const t = String(p), id = t.split('.')[0], b = beams.get(id);
    if (!b) throw new Error(`frame.points ${i + 1}: ${shown(p)} is on a beam of the frame, as x1.top@50% (beams: ${[...beams.keys()].join(', ')})`);
    const r = motion.address(t, `frame.points ${i + 1}`);
    return { where: t, beam: b, z: snap(b, Math.max(0, Math.min(b.L, r.frame[11]))) };
  });
  const guides = (s.guides || []).filter((g) => beams.has(g.beam)).map((g) => {
    const b = beams.get(g.beam), from = Math.max(0, g.from), to = Math.min(b.L, g.from + g.length);
    snap(b, from); snap(b, to); snap(b, (from + to) / 2);
    return { id: g.id, kind: g.kind, beam: b, from, to, tolerance: (g.terms ?? g.model?.terms ?? []).find((x) => x.term === 'rail parallelism') ?? null };
  });

  // supports
  const supports = [];
  if (opts.supports != null) {
    if (typeof opts.supports !== 'object' || Array.isArray(opts.supports)) throw new Error(`frame.supports is { "z1.a": "pinned", "z2.a": "fixed" } (got ${shown(opts.supports)})`);
    for (const [addr, how] of Object.entries(opts.supports)) {
      const id = addr.split('.')[0], b = beams.get(id);
      if (!b) throw new Error(`frame.supports: "${addr}" is on a beam of the frame, as z1.a or x1.bottom@50% (beams: ${[...beams.keys()].join(', ')})`);
      if (!['pinned', 'fixed'].includes(how)) throw new Error(`frame.supports: "${addr}" is held pinned (from moving) or fixed (from turning too) (got ${shown(how)})`);
      const r = motion.address(addr, 'frame.supports');
      supports.push({ where: addr, beam: b, z: snap(b, Math.max(0, Math.min(b.L, r.frame[11]))), how, why: 'frame.supports', said: true });
    }
  } else {
    for (const it of s.a.items || []) {
      const kind = it.fitting?.kind ?? (it.bought && /foot|castor/i.test(it.bought) ? 'foot' : null), m = typeof it.at === 'string' ? /^([\w-]+)\.([ab])(\.\d+)?$/.exec(it.at.trim()) : null;
      if (!m || !FEET.includes(kind) || !beams.has(m[1])) continue;
      const b = beams.get(m[1]);
      if (!supports.some((x) => x.beam === b && x.z === (m[2] === 'a' ? 0 : b.L))) supports.push({ where: `${m[1]}.${m[2]}`, beam: b, z: m[2] === 'a' ? 0 : b.L, how: 'pinned', why: `${it.id}, a ${kind}` });
    }
    if (!supports.length) {
      const ends = [...beams.values()].flatMap((b) => [['a', 0], ['b', b.L]].map(([e, z]) => ({ b, e, z, h: -dot(at(b, z), down) })));
      const low = Math.min(...ends.map((x) => x.h));
      for (const x of ends) if (x.h <= low + 1) supports.push({ where: `${x.b.id}.${x.e}`, beam: x.b, z: x.z, how: 'pinned', why: 'a lowest end' });
    }
  }

  // joins between beams of the frame
  const joins = [];
  for (const j of s.joins || []) {
    const [ai, bi] = j.items, A = beams.get(ai), B = beams.get(bi);
    if (!A || !B) continue;
    const e = j.end[0], zb = j.model.b.end != null ? (j.model.b.end === 'a' ? 0 : B.L) : j.model.b.distance;
    joins.push({ j, A, B, e, za: e === 'a' ? 0 : A.L, zb: snap(B, zb), k: j.model.stiffness });
  }
  // only what a support holds through joins: the rest is left out, by name
  const group = new Map([...beams.keys()].map((id) => [id, id])), root = (x) => { while (group.get(x) !== x) x = group.get(x); return x; };
  for (const x of joins) group.set(root(x.A.id), root(x.B.id));
  const held = new Set(supports.map((x) => root(x.beam.id)));
  for (const id of [...beams.keys()]) if (!held.has(root(id))) { left.push(id); beams.delete(id); }
  const keep = (x) => beams.has(x.beam?.id ?? x.mount?.beam.id);

  // nodes and elements
  const nodes = {}, elements = [], sections = {}, materials = {}, nameAt = new Map();
  const nodeName = (b, z) => (z === 0 ? `${b.id}.a` : z === b.L ? `${b.id}.b` : `${b.id}@${n3(z)}`);
  let stiffest = 0;
  for (const b of beams.values()) {
    const zs = [...b.stations].sort((p, q) => p - q);
    for (const z of zs) { const n = nodeName(b, z); nodes[n] = at(b, z); nameAt.set(`${b.id}|${z}`, n); }
    sections[b.id] = b.section;
    materials[b.id] = { E: b.E, G: b.G, density: b.grams > 0 ? (b.grams / 1000 / b.L) / (b.section.A * 1e-6) : 0 };
    stiffest = Math.max(stiffest, b.E * Math.max(b.section.Iy, b.section.Iz), b.E * b.section.A);
    for (let i = 0; i + 1 < zs.length; i++) elements.push({ id: `${b.id}#${i + 1}`, of: b.id, a: nodeName(b, zs[i]), b: nodeName(b, zs[i + 1]), section: b.id, material: b.id, up: b.top });
  }
  const nodeAt = (b, z) => { for (const q of b.stations) if (Math.abs(q - z) < 0.05) return nameAt.get(`${b.id}|${q}`); return undefined; };
  const big = FRAME_CHECK.link.value, rigidE = stiffest * big / 1e6;
  materials.link = { E: rigidE, G: rigidE / 2.6 };
  sections.link = { A: 1e6 / 1e3, Iy: 1e6, Iz: 1e6, J: 1e6 }; // (E × these: the link a thousand times the stiffest beam's EI and EA)
  const springs = [];
  for (const x of joins) {
    if (!beams.has(x.A.id)) continue;
    const an = nodeAt(x.A, x.za), bn = nodeAt(x.B, x.zb), gap = Math.hypot(...sub(nodes[an], nodes[bn]));
    if (gap > 1e-6) elements.push({ id: `join ${x.j.index + 1}`, a: bn, b: an, section: 'link', material: 'link' });
    const el = elements.find((q) => q.of === x.A.id && (x.e === 'a' ? q.a === an : q.b === an));
    springs.push({ x, el, end: x.e === 'a' ? 'a' : 'b' });
  }
  const supportMap = {};
  for (const sp of supports.filter(keep)) supportMap[nodeAt(sp.beam, sp.z)] = sp.how === 'fixed' ? 'fixed' : { x: true, y: true, z: true };
  const withSprings = (rigid) => ({ nodes, sections, materials, supports: supportMap, gravity: scale(down, G),
    elements: elements.map((q) => { const sp = rigid ? [] : springs.filter((p) => p.el === q); return sp.length ? { ...q, ends: Object.fromEntries(sp.map((p) => [p.end, { rx: p.x.k.twist, ry: p.x.k.bending, rz: p.x.k.bending }])) } : q; }) });

  // the loads at each pose: every carried item's and load's weight as a force and a moment at its node
  const nodeLoads = (values, only) => {
    const W = placeItems(motion, values), out = [];
    const put = (b, z, C, kg) => { const n = nodeAt(b, z); if (!n) throw new Error(`frame: no node on ${b.id} at ${n3(z)} mm for a load (a pose this check did not foresee)`); const F = scale(down, kg * G); out.push({ node: n, force: F, moment: cross(sub(C, nodes[n]), F) }); };
    for (const c of only ? [] : carried.filter(keep)) put(c.mount.beam, mountStation(c.mount, values), rowsAt(W[c.item], c.centre), c.kg);
    for (const l of loads.filter(keep)) { if (only && only !== l) continue; const C = rowsAt(W[l.item], l.point); if (l.beam) put(l.beam, l.z, C, l.kg); else put(l.mount.beam, mountStation(l.mount, values), C, l.kg); }
    return out;
  };
  return { beams, left, missing, loose, unknown, carried: carried.filter(keep), loads: loads.filter(keep), points, guides: guides.filter(keep), supports: supports.filter(keep), joins: joins.filter((x) => beams.has(x.A.id)),
    cases, down, nodes, nodeAt, model: withSprings(false), rigid: withSprings(true), nodeLoads, mountStation, worlds, axisOf: (j) => axisOf(motion, worlds, j, mul) };
}

// the downward movement of a node, and along a beam between two stations (the worst of the element stations there)
const sagAt = (r, node, down) => dot(r.displacements[node].slice(0, 3), down);
function sagAlong(r, beam, from, to, down) {
  let most = -Infinity, where = from;
  for (const e of r.elements) if (e.of === beam.id) e.along.x.forEach((x, i) => { const z = (e._from ?? 0) + x, v = dot(e.along.d[i], down); if (z >= from - 1e-6 && z <= to + 1e-6 && v > most) { most = v; where = z; } });
  return { sag: most, z: where };
}

/**
 * frame.deflection, frame.stress and frame.buckling on a built assembly, and frame.solve saying what the frame's model
 * holds and what it leaves out. @param {object} s a built assembly @param {Function} f the findings' sink
 * @param {{ placeItems: Function, jointValues: Function, mul: Function }} helpers
 */
export function frameChecks(s, f, helpers) {
  let fm;
  try { fm = frameModelOf(s, helpers); } catch (e) { f('fail', `frame: ${e.message}`, 'frame: refused', { code: 'frame.solve' }); return null; }
  if (!fm) return null;
  if (fm.empty) { if (fm.missing.length) f('info', `the frame is not solved: ${fm.missing.join(', ')} ${fm.missing.length > 1 ? 'give' : 'gives'} no modulus, shear modulus or second moments`, null, { code: 'frame.solve', refs: { beams: fm.missing } }); return null; }
  const solved = solveAll(fm);
  if (solved.error) { const guessed = fm.supports.every((x) => x.why === 'a lowest end'); f(guessed ? 'info' : 'warn', `the frame is not solved: ${solved.error}. Its supports: ${fm.supports.map((x) => `${x.where} (${x.why})`).join(', ') || 'none'}${guessed ? '. Say where it is held: "frame": { "supports": { "z1.a": "pinned" } }, or fit its feet' : ''}`, guessed ? null : 'frame: not solved', { code: 'frame.solve', refs: { supports: fm.supports.map((x) => x.where), code: solved.code } }); return null; }
  const { results } = solved, down = fm.down, margin = FRAME_CHECK.margin.value;
  // what the joins rest on, counted by kind
  const kinds = new Map();
  for (const x of fm.joins) { const key = `${x.j.kind}${x.j.fitting ? ` (${x.j.fitting})` : ''}: ${restsWord(x.k)}`; kinds.set(key, (kinds.get(key) ?? 0) + 1); }
  const estimates = fm.joins.filter((x) => !(x.k.measured?.bending && x.k.measured?.twist)).length;
  const restsJoins = fm.joins.length ? `${fm.joins.length} join${fm.joins.length > 1 ? 's' : ''}' springs (${[...kinds].map(([k, n]) => `${n} ${k}`).join('; ')})` : 'no joins';
  const rests = fm.joins.map((x) => ({ join: x.j.index, kind: x.j.kind, bending: x.k.bending, twist: x.k.twist, value: restsWord(x.k) }));
  f('info', `the frame is solved as ${fm.beams.size} beam${fm.beams.size > 1 ? 's' : ''} on ${Object.keys(fm.nodes).length} nodes, held at ${fm.supports.map((x) => `${x.where} (${x.how}, ${x.why})`).join(', ')}, under its own weight${fm.carried.length ? `, ${fm.carried.length} item${fm.carried.length > 1 ? 's' : ''} mounted on it` : ''}${fm.loads.length ? ` and ${fm.loads.length} load${fm.loads.length > 1 ? 's' : ''}` : ''}, in ${fm.cases.length} pose${fm.cases.length > 1 ? 's' : ''}; ${restsJoins}${estimates ? `, ${estimates} of them an estimate until the joint rig (issue 264) measures it, so each figure is given with the joins rigid too` : ''}${fm.left.length ? `. Left out: ${fm.left.join(', ')} (not held by a support through joins, or moving)` : ''}${fm.loose.length ? `. Not on a beam, so not weighed on the frame: ${fm.loose.join(', ')}` : ''}${fm.unknown.length ? `. No mass known for ${fm.unknown.join(', ')}` : ''}`, null,
    { code: 'frame.solve', values: { beams: fm.beams.size, nodes: Object.keys(fm.nodes).length, cases: fm.cases.length, joins: fm.joins.length, estimates }, refs: { supports: fm.supports.map((x) => x.where), left: fm.left, loose: fm.loose, rests } });

  // ---- frame.deflection: each load's point, each named point, every guide ----
  const worst = (fn) => { let w = null; for (const r of results) { const v = fn(r.spring, r), v0 = fn(r.rigid, r); if (!w || v.sag > w.sag) w = { ...v, rigid: v0.sag, case: { ...r.case, alone: r.alone } }; } return w; };
  const limitFor = (b, own) => {
    if (own) return { value: own.value, from: `${own.from}` };
    if (s.a.frame?.limit != null) return { value: s.num(s.a.frame.limit), from: 'the assembly\'s frame.limit' };
    if (s.task?.accuracy != null) return { value: s.task.accuracy, from: 'the task\'s accuracy' };
    return { value: b.L / FRAME_CHECK.sag.value, from: `${b.id}'s span, ${n3(b.L, 1)} mm, over ${FRAME_CHECK.sag.value} (frame.sag)` };
  };
  const report = (what, where, b, w, own, alone, P) => {
    const lim = limitFor(b, own), level = w.sag > lim.value ? 'fail' : 'pass', soft = estimates && w.sag > w.rigid * 1.001;
    const text = `${what} sags ${n3(w.sag)} mm${fm.cases.length > 1 ? `, worst ${w.case.label}` : ''}, with the joins' springs; ${n3(w.rigid)} mm with the joins rigid${alone ? ` (of these, ${n3(alone.sag)} and ${n3(alone.rigid)} mm from ${alone.what} alone)` : ''}. ${soft ? `The first rests on ${restsJoins}, so the true sag lies near it, and the rigid figure is the least it can be` : `It rests on ${restsJoins}`}: against ${n3(lim.value)} mm, ${lim.from}${level === 'fail' ? `: ${n3(w.sag / lim.value, 2)} times over. Stiffen the beam (a deeper profile), shorten its span, or stiffen its joins` : ''}`;
    f(level, text, level === 'fail' ? `${where}: sags ${n3(w.sag, 2)} mm` : null, { code: 'frame.deflection', at: r4(P), values: { sag: r3(w.sag), rigid: r3(w.rigid), limit: r3(lim.value), ...(alone ? { alone: r3(alone.sag), aloneRigid: r3(alone.rigid) } : {}) },
      refs: { beam: b.id, where, pose: w.case.label, limit: lim.from, rests, ...(soft ? { restsOn: 'estimate' } : { restsOn: fm.joins.length ? 'measured' : 'beams' }) } });
  };
  for (const l of fm.loads) {
    const b = l.beam ?? l.mount.beam, zOf = (values) => (l.beam ? l.z : fm.mountStation(l.mount, values));
    const w = worst((res, r) => ({ sag: sagAt(res, fm.nodeAt(b, zOf(r.values)), down) }));
    const one = w.case.alone?.get(l);
    report(`${b.id} at ${l.where}`, l.where, b, w, null, one ? { ...one, what: `the ${n3(l.kg, 3)} kg there` } : null, fm.nodes[fm.nodeAt(b, zOf(w.case.values))]);
  }
  for (const p of fm.points) { const n = fm.nodeAt(p.beam, p.z), w = worst((r) => ({ sag: sagAt(r, n, down) })); report(`${p.beam.id} at ${p.where}`, p.where, p.beam, w, null, null, fm.nodes[n]); }
  for (const g of fm.guides) {
    const w = worst((r) => sagAlong(r, g.beam, g.from, g.to, down)), own = g.tolerance ? { value: g.tolerance.value, from: `the rail's own parallelism over its length (${g.tolerance.note ?? g.tolerance.term})` } : null;
    report(`${g.beam.id} under guide ${g.id}, between ${n3(g.from, 1)} and ${n3(g.to, 1)} mm`, `${g.id}`, g.beam, w, own, null, add(g.beam.A, scale(g.beam.u, w.z)));
  }

  // ---- frame.stress: the worst in each beam against its alloy; the moment at each join against its fitting ----
  const beamRows = [];
  for (const b of fm.beams.values()) {
    let w = null;
    for (const r of results) for (const [model, res] of [['springs', r.spring], ['rigid', r.rigid]]) for (const e of res.elements) if (e.of === b.id && e.stress && (!w || e.stress.peak > w.peak)) w = { ...e.stress, case: r.case, model, e };
    if (!w) continue;
    const m = b.strength ? b.strength / w.peak : Infinity;
    beamRows.push({ b, w, margin: m });
  }
  for (const { b, w, margin: m } of beamRows) {
    if (!b.strength) { f('info', `${b.id}: ${n3(w.peak, 2)} MPa at worst, and ${b.alloy ?? 'its alloy'} gives no strength to check it against`, null, { code: 'frame.stress', values: { stress: r3(w.peak) }, refs: { beam: b.id } }); continue; }
    const level = m < 1 ? 'fail' : m < margin ? 'warn' : 'pass';
    if (level === 'pass' && beamRows.length > 1) continue;
    const P = add(b.A, scale(b.u, (w.e._from ?? 0) + w.x));
    f(level, `${b.id}: ${n3(w.peak, 2)} MPa at worst (${n3(w.bending, 2)} of it bending), ${w.model === 'rigid' ? 'with the joins rigid' : 'with the joins\' springs'}${fm.cases.length > 1 ? `, ${w.case.label}` : ''}, against ${b.alloy}'s ${b.strength} MPa: ${n3(m, 1)} times under it${level !== 'pass' ? `, where about ${margin} is wanted. A deeper profile or a shorter span` : ''}`, level === 'pass' ? null : `${b.id}: stress ${n3(m, 1)}×`,
      { code: 'frame.stress', at: r4(P), between: [r4(b.A), r4(add(b.A, scale(b.u, b.L)))], values: { stress: r3(w.peak), bending: r3(w.bending), strength: b.strength, margin: r3(m) }, refs: { beam: b.id, pose: w.case.label, joins: w.model } });
  }
  const passing = beamRows.filter((x) => x.b.strength && x.margin >= margin);
  if (beamRows.length > 1 && passing.length) {
    const low = passing.reduce((p, q) => (q.margin < p.margin ? q : p));
    f('pass', `${passing.length === beamRows.length ? 'every beam' : `${passing.length} beams`} stays under its alloy's strength with ${margin} times to spare: the most stressed is ${low.b.id}, ${n3(low.w.peak, 2)} MPa against ${low.b.strength} MPa, ${n3(low.margin, 1)} times under`, null,
      { code: 'frame.stress', at: r4(add(low.b.A, scale(low.b.u, low.b.L / 2))), values: { stress: r3(low.w.peak), strength: low.b.strength, margin: r3(low.margin), beams: passing.length }, refs: { beam: low.b.id, beams: passing.map((x) => x.b.id) } });
  }
  const rated = [], unrated = [];
  for (const x of fm.joins) {
    let M = 0, T = 0, at = null;
    for (const r of results) for (const [model, res] of [['springs', r.spring], ['rigid', r.rigid]]) {
      const mine = res.elements.filter((q) => q.of === x.A.id), e = x.e === 'a' ? mine[0] : mine[mine.length - 1]; if (!e) continue;
      const end = x.e === 'a' ? e.ends.a : e.ends.b, m = Math.hypot(end[4], end[5]);
      if (!at || m > M) { M = m; T = Math.abs(end[3]); at = { case: r.case, model }; }
    }
    const fit = x.j.fitted?.model, cap = fit?.load?.force && fit.margin && Array.isArray(fit.load.at) ? fit.load.force * Math.hypot(...fit.load.at) * fit.margin : null;
    (cap ? rated : unrated).push({ x, M, T, at, fit, cap, margin: cap ? cap / (M || 1e-9) : null, P: fm.nodes[fm.nodeAt(x.A, x.za)], refs: { join: x.j.index, kind: x.j.kind, a: x.j.a, b: x.j.b } });
  }
  for (const q of rated) {
    const level = q.margin < 1 ? 'fail' : q.margin < margin ? 'warn' : 'pass';
    if (level === 'pass' && rated.length > 1) continue;
    f(level, `${q.x.j.label}: ${n3(q.M / 1000, 3)} N·m bending at ${q.x.A.id}'s end ${q.x.e} (${q.at.model === 'rigid' ? 'joins rigid' : 'joins\' springs'}${fm.cases.length > 1 ? `, ${q.at.case.label}` : ''}), against about ${n3(q.cap / 1000, 2)} N·m ${q.x.j.fitted.item} takes: its ${q.fit.load.force} N at ${n3(Math.hypot(...q.fit.load.at), 1)} mm from the corner, ${n3(q.fit.margin, 1)} times under its plastic's strength by finite elements, scaled as the load grows: ${n3(q.margin, 1)} times under it${level !== 'pass' ? `, where about ${margin} is wanted. A larger design load on the join ("load") sizes a stouter fitting` : ''}`, level === 'pass' ? null : `${q.x.j.label}: ${n3(q.margin, 1)}×`,
      { code: 'frame.stress', at: r4(q.P), values: { moment: r3(q.M), twist: r3(q.T), strength: r3(q.cap), margin: r3(q.margin) }, refs: { ...q.refs, item: q.x.j.fitted.item } });
  }
  const okRated = rated.filter((q) => q.margin >= margin);
  if (rated.length > 1 && okRated.length) {
    const low = okRated.reduce((p, q) => (q.margin < p.margin ? q : p));
    f('pass', `${okRated.length} joins with printed fittings each take their moment with ${margin} times to spare: the nearest is ${low.x.j.label}, ${n3(low.M / 1000, 3)} N·m against about ${n3(low.cap / 1000, 2)} N·m, ${n3(low.margin, 1)} times under`, null,
      { code: 'frame.stress', at: r4(low.P), values: { moment: r3(low.M), strength: r3(low.cap), margin: r3(low.margin), joins: okRated.length }, refs: { ...low.refs, item: low.x.j.fitted.item } });
  }
  if (unrated.length) {
    const most = unrated.reduce((p, q) => (q.M > p.M ? q : p)), kindsOf = [...new Set(unrated.map((q) => q.x.j.kind))];
    f('info', `${unrated.length} join${unrated.length > 1 ? 's' : ''} (${kindsOf.join(', ')}) ha${unrated.length > 1 ? 've' : 's'} no strength in the kit to check against: the largest moment is ${n3(most.M / 1000, 3)} N·m bending and ${n3(most.T / 1000, 3)} N·m twist at ${most.x.j.label}`, null,
      { code: 'frame.stress', at: r4(most.P), values: { moment: r3(most.M), twist: r3(most.T), joins: unrated.length }, refs: { ...most.refs, moments: unrated.map((q) => ({ join: q.x.j.index, moment: r3(q.M), twist: r3(q.T) })) } });
  }
  // ---- frame.buckling: each beam in compression against Euler's load, and the frame's own first factor ----
  const squeezed = [];
  for (const b of fm.beams.values()) {
    let N = 0, w = null;
    for (const r of results) for (const res of [r.spring, r.rigid]) for (const e of res.elements) if (e.of === b.id && e.axial < N) { N = e.axial; w = r.case; }
    if (N >= 0) continue;
    const I = Math.min(b.section.Iy, b.section.Iz), Pcr = (Math.PI ** 2 * b.E * I) / (FRAME_CHECK.euler.value * b.L) ** 2;
    squeezed.push({ b, N: -N, Pcr, margin: Pcr / -N, case: w });
  }
  for (const q of squeezed) {
    const level = q.margin < 1 ? 'fail' : q.margin < margin ? 'warn' : 'pass';
    if (level === 'pass' && squeezed.length > 1) continue;
    f(level, `${q.b.id}: ${n3(q.N, 2)} N along it in compression, against ${n3(q.Pcr, 0)} N it buckles at with both ends pinned (Euler, ${n3(q.b.L, 1)} mm): ${n3(q.margin, 1)} times under it`, level === 'pass' ? null : `${q.b.id}: buckles ${n3(q.margin, 1)}×`,
      { code: 'frame.buckling', at: r4(add(q.b.A, scale(q.b.u, q.b.L / 2))), between: [r4(q.b.A), r4(add(q.b.A, scale(q.b.u, q.b.L)))], values: { compression: r3(q.N), euler: r3(q.Pcr), margin: r3(q.margin) }, refs: { beam: q.b.id, pose: q.case?.label } });
  }
  const okSq = squeezed.filter((q) => q.margin >= margin);
  if (squeezed.length > 1 && okSq.length) {
    const low = okSq.reduce((p, q) => (q.margin < p.margin ? q : p));
    f('pass', `${okSq.length} beam${okSq.length > 1 ? 's are' : ' is'} in compression, each far under its buckling load with both ends pinned: the nearest is ${low.b.id}, ${n3(low.N, 2)} N against ${n3(low.Pcr, 0)} N, ${n3(low.margin, 1)} times under`, null,
      { code: 'frame.buckling', at: r4(add(low.b.A, scale(low.b.u, low.b.L / 2))), values: { compression: r3(low.N), euler: r3(low.Pcr), margin: r3(low.margin), beams: okSq.length }, refs: { beam: low.b.id } });
  }
  try {
    const drawn = results[0], bk = solveFrame(subdivide(fm.model, 4)).buckling({ loads: drawn.loads, count: 1 }), factor = bk.factors[0];
    const shape = bk.modes[0].shape, lead = Object.entries(shape).reduce((p, q) => (Math.hypot(...q[1].slice(0, 3)) > Math.hypot(...p[1].slice(0, 3)) ? q : p)), beam = lead[0].split(/[.@#/]/)[0];
    const level = factor < 1 ? 'fail' : factor < margin ? 'warn' : 'pass';
    f(level, `the whole frame, with the joins' springs, buckles first at ${n3(factor, 1)} times its load as drawn, ${beam} moving most: ${level === 'pass' ? 'far from it' : 'too near it: brace it, or a stiffer profile'} (rests on ${restsJoins})`, level === 'pass' ? null : `frame buckles at ${n3(factor, 1)}×`,
      { code: 'frame.buckling', at: r4(fm.nodes[lead[0]] ?? fm.nodes[Object.keys(fm.nodes)[0]]), values: { factor: r3(factor) }, refs: { beam, restsOn: estimates ? 'estimate' : 'measured' } });
  } catch (e) { if (e.code !== 'fea.frame.compression') f('info', `the frame's own buckling factor is not found: ${e.message}`, null, { code: 'frame.buckling' }); }
  return { model: fm, results };
}

// every pose's solve, with the springs and rigid; and, as drawn, each load alone
function solveAll(fm) {
  let fs, fr;
  try { fs = solveFrame(fm.model); fr = solveFrame(fm.rigid); } catch (e) { return { error: e.message, code: e.code }; }
  const results = fm.cases.map((c) => {
    const loads = fm.nodeLoads(c.values), spring = fs.statics({ loads }), rigid = fr.statics({ loads }), out = { case: c, loads, spring, rigid, values: c.values };
    { out.alone = new Map(); for (const l of fm.loads) { const ll = fm.nodeLoads(c.values, l), n = ll[0]?.node; if (!n) continue; out.alone.set(l, { sag: sagAt(fs.statics({ loads: ll, gravity: [0, 0, 0] }), n, fm.down), rigid: sagAt(fr.statics({ loads: ll, gravity: [0, 0, 0] }), n, fm.down) }); } }
    return out;
  });
  // each element's start along its beam, for sagAlong
  for (const r of results) for (const res of [r.spring, r.rigid]) for (const e of res.elements) if (e.of != null) { const b = fm.beams.get(e.of), el = fm.model.elements.find((q) => q.id === e.id); e._from = dot(sub(fm.nodes[el.a], b.A), b.u); }
  return { results };
}

/**
 * The frame's deflected shape for a check view: each beam as a line of points, as drawn and moved by its sag times
 * `scale` (chosen so the largest movement shows as about a twentieth of the frame's size where left out), in the
 * worst pose of the joins' springs. Never part of the model: a picture of the solve.
 * @param {object} s a built assembly @param {{ placeItems: Function, jointValues: Function, mul: Function }} helpers @param {{ scale?: number }} [o]
 * @returns {{ scale: number, most: number, beams: { id: string, drawn: number[][], moved: number[][] }[], label: string } | null}
 */
export function frameShape(s, helpers, o = {}) {
  let fm;
  try { fm = frameModelOf(s, helpers); } catch { return null; }
  if (!fm || fm.empty) return null;
  const solved = solveAll(fm);
  if (solved.error) return null;
  const r = solved.results.reduce((p, q) => (q.spring.deflection.most > p.spring.deflection.most ? q : p)).spring, most = r.deflection.most;
  const pts = Object.values(fm.nodes), size = Math.max(...[0, 1, 2].map((c) => Math.max(...pts.map((p) => p[c])) - Math.min(...pts.map((p) => p[c]))));
  const k = o.scale ?? (most > 0 ? (size / 20) / most : 1);
  const beams = [...fm.beams.values()].map((b) => {
    const els = r.elements.filter((e) => e.of === b.id), drawn = [], moved = [];
    for (const e of els) { const el = fm.model.elements.find((q) => q.id === e.id), A = fm.nodes[el.a], B = fm.nodes[el.b]; e.along.x.forEach((x, i) => { const t = x / e.length, P = add(A, scale(sub(B, A), t)); drawn.push(P); moved.push(add(P, scale(e.along.d[i], k))); }); }
    return { id: b.id, drawn, moved };
  });
  return { scale: k, most, beams, label: `deflection drawn ${fig(k)} times its size (scaled): ${n3(most)} mm at most, with the joins' springs` };
}

/**
 * The deflected shape as an SVG, seen from the front (x across, z up) or another side: the frame as drawn in grey, the
 * shape it takes in colour, and the scale written on it. @param {ReturnType<typeof frameShape>} sh @param {{ view?: 'front' | 'side' | 'top', title?: string }} [o] @returns {string}
 */
export function frameShapeSvg(sh, o = {}) {
  const [i, j] = o.view === 'side' ? [1, 2] : o.view === 'top' ? [0, 1] : [0, 2], all = sh.beams.flatMap((b) => [...b.drawn, ...b.moved]);
  const lo = [Math.min(...all.map((p) => p[i])), Math.min(...all.map((p) => p[j]))], hi = [Math.max(...all.map((p) => p[i])), Math.max(...all.map((p) => p[j]))];
  const W = 640, pad = 40, k = (W - 2 * pad) / Math.max(hi[0] - lo[0], hi[1] - lo[1], 1), H = Math.ceil((hi[1] - lo[1]) * k + 2 * pad + 56);
  const X = (p) => (pad + (p[i] - lo[0]) * k).toFixed(1), Y = (p) => (H - 56 - pad - (p[j] - lo[1]) * k).toFixed(1);
  const line = (ps, attrs) => `<polyline points="${ps.map((p) => `${X(p)},${Y(p)}`).join(' ')}" fill="none" ${attrs}/>`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
${sh.beams.map((b) => line(b.drawn, 'stroke="#bbb" stroke-width="6" stroke-linecap="round"')).join('\n')}
${sh.beams.map((b) => line(b.moved, 'stroke="#c0392b" stroke-width="2"')).join('\n')}
${o.title ? `<text x="${pad}" y="${H - 40}" font-size="13" font-weight="600">${esc(o.title)}</text>` : ''}
<text x="${pad}" y="${H - 23}" font-size="12">${esc(sh.label)}</text>
<text x="${pad}" y="${H - 6}" font-size="11" fill="#666">grey: as drawn; red: the shape it takes, scaled. A check view only, not the model</text>
</svg>`;
}

/**
 * The check view cad beams writes beside the beams' sheets: the frame's deflected shape seen from the front and from the
 * side, scaled and saying so, as exports/<project>/<assembly>.frame-sag.svg. Null where the frame is not solved.
 * @param {object} s a built assembly @returns {{ file: string, scale: number, most: number } | null}
 */
export function writeFrameShape(s) {
  const sh = frameShape(s, { placeItems, jointValues, mul }), file = paths.exports(s.project, `${s.name}.frame-sag.svg`);
  if (fs.existsSync(file)) fs.rmSync(file);
  if (!sh) return null;
  const front = frameShapeSvg(sh, { view: 'front', title: `${s.a.title || s.name}, from the front` }), side = frameShapeSvg(sh, { view: 'side', title: 'from the side' });
  const h = (t) => Number(/height="(\d+)"/.exec(t)[1]), inner = (t) => t.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${h(front) + h(side)}" viewBox="0 0 640 ${h(front) + h(side)}" font-family="system-ui, sans-serif">\n${inner(front)}\n<g transform="translate(0 ${h(front)})">${inner(side)}</g>\n</svg>\n`);
  return { file, scale: sh.scale, most: sh.most };
}

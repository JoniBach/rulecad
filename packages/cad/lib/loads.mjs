// What the machine's own weight and its payload do to it: the force and tipping moment each joint's bearing or printed
// location takes, how far the links bend, how fast the arm rings, and what acceleration the motors can give it. Masses come
// from the parts as drawn (volume and density) and the bought parts' rules. Findings in the assembly's shape.
import crypto from 'node:crypto';
import { grid as makeGrid, analyse, positions } from '@rulecad/fea';
import { jacobian } from '@rulecad/robots';
import { performance } from '@rulecad/motors';
import { host } from './host.mjs';
import { paths } from './workspace.mjs';
import { peekRuleSet } from './rules.mjs';
import { solidFill } from './optimise.mjs';
import { materialOf } from './list.mjs';
import { axisOf, trainFrom, workingSpeed, atCurrent } from './motors.mjs';
import { sample, chainOf } from './task.mjs';

const G = 9.80665, sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scale = (a, k) => a.map((x) => x * k);
const norm = (a) => Math.hypot(a[0], a[1], a[2]), n3 = (x, d = 2) => String(Number(x.toFixed(d)));
const rowsAt = (W, p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
const invAt = (W, p) => { const q = [p[0] - W[3], p[1] - W[7], p[2] - W[11]]; return [W[0] * q[0] + W[4] * q[1] + W[8] * q[2], W[1] * q[0] + W[5] * q[1] + W[9] * q[2], W[2] * q[0] + W[6] * q[1] + W[10] * q[2]]; };

// A mesh's volume and centroid: signed tetrahedra from the origin
function solidOf(tris) {
  let V = 0; const c = [0, 0, 0];
  for (const [a, b, d] of tris) { const v = dot(a, cross(b, d)) / 6; V += v; for (let k = 0; k < 3; k++) c[k] += (v * (a[k] + b[k] + d[k])) / 4; }
  return { volume: Math.abs(V), centroid: V ? c.map((x) => x / V) : [0, 0, 0] };
}

/** Each moving thing's mass in kg and its centre in its item's frame. */
export function massesOf(s, { placeItems, jointValues }) {
  const motion = s.motion, ids = motion.items.map((x) => x[0]), W = placeItems(motion, jointValues(motion, motion.pose ?? undefined)), density = materialOf(s.project).density, out = [];
  ids.forEach((id, k) => {
    const parts = s.parts.filter((p) => p.item === id && p.role !== 'support'); if (!parts.length) return;
    const o = s.objects.find((x) => x.id === id || String(x.id).startsWith(`${id}.`)), reference = parts.every((p) => p.role === 'reference');
    let total = 0, c = [0, 0, 0];
    for (const p of parts) { const q = solidOf(p.triangles); const kg = reference ? 0 : (q.volume / 1000) * density / 1000; total += kg; c = add(c, scale(q.centroid, kg || q.volume)); }
    const weightSum = reference ? parts.reduce((t, p) => t + solidOf(p.triangles).volume, 0) : total;
    const bought = reference ? o?.bought?.mass ?? null : null;
    out.push({ item: k, id, kg: reference ? bought ?? 0 : total, centre: invAt(W[k], weightSum ? scale(c, 1 / weightSum) : c), known: !reference || bought != null });
  });
  return out;
}

const beyond = (motion, j, item) => { const by = new Map(motion.joints.map((x) => [x.child, x])); for (let i = item, n = 0; i >= 0 && n < 99; n++) { const x = by.get(i); if (!x) return false; if (x === j) return true; i = x.parent; } return false; };

// Force and moment about a joint's origin, at one pose
function loadAt(motion, masses, payload, worlds, j, mul) {
  const { O, Z } = axisOf(motion, worlds, j, mul), g = motion.gravity || [0, 0, -1], dir = scale(g, 1 / norm(g));
  let F = [0, 0, 0], M = [0, 0, 0], carried = 0;
  const addMass = (kg, X) => { const f = scale(dir, kg * G); F = add(F, f); M = add(M, scale(cross(sub(X, O), f), 1 / 1000)); carried += kg; };
  for (const m of masses) if (beyond(motion, j, m.item)) addMass(m.kg, rowsAt(worlds[m.item], m.centre));
  if (payload && beyond(motion, j, payload.item)) addMass(payload.kg, rowsAt(worlds[payload.item], payload.point));
  const axial = dot(F, Z), radial = norm(sub(F, scale(Z, axial))), torque = dot(M, Z), tipping = norm(sub(M, scale(Z, torque)));
  return { axial: Math.abs(axial), radial, tipping, torque, carried, F, O, Z };
}

// The poses the machine will be in: the task's samples, the named poses, or each joint at its ends
function posesOf(s, jointValues) {
  const motion = s.motion, base = jointValues(motion, motion.pose ?? undefined), leads = Object.fromEntries(Object.entries(base).filter(([id]) => !motion.joints.find((x) => x.id === id)?.follow)), out = [];
  for (const p of Object.keys(motion.poses || {})) out.push({ label: `pose ${p}`, values: jointValues(motion, p) });
  if (s.task) { const { c, r } = sample(s), every = Math.max(1, Math.ceil(r.samples.length / 40)); r.samples.filter((x, i) => x.reachable && !(i % every)).forEach((x) => out.push({ label: 'on the task', point: x.point, values: jointValues(motion, { ...leads, ...Object.fromEntries(c.names.map((n, i) => [n, [x.q[i]]])) }) })); }
  if (!out.length) for (const j of motion.joints.filter((x) => !x.follow && x.dofs.length === 1)) for (const v of j.dofs[0].slice(0, 2)) out.push({ label: `${j.id} at ${n3(v, 1)}`, values: jointValues(motion, { ...leads, [j.id]: [v] }) });
  out.push({ label: 'as drawn', values: base });
  return out;
}

const X0 = 0.6, Y0 = 0.5; // ISO 76, a single deep-groove ball bearing's static factors
function bearingMargin(rows, loads) {
  const [first] = rows, pair = rows.length >= 2;
  const span = pair ? Math.abs(rows[1].along - rows[0].along) : (first.bore + first.outer) / 2; // mm: a pair's spacing, or the balls' pitch circle
  const radial = pair ? loads.radial / rows.length + (loads.tipping * 1000) / span : loads.radial + (2 * loads.tipping * 1000) / span;
  const P0 = Math.max(radial, X0 * radial + Y0 * (loads.axial / (pair ? 2 : 1)));
  return { P0, C0: first.C0, margin: first.C0 / P0, span };
}

// A printed location's weakest clip, from FE on the part as drawn: fixed at its foot, the load at its head
function clipStress(tris, force, modulus, nu, cell) {
  const key = crypto.createHash('sha256').update(JSON.stringify([tris.length, tris[0], force, modulus, cell])).digest('hex').slice(0, 20), file = paths.cache('clip', key);
  if (!process.env.CAD_NO_CACHE && host.exists(file)) return JSON.parse(host.readText(file));
  const lo = [0, 1, 2].map((k) => Math.min(...tris.flat().map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...tris.flat().map((p) => p[k]))), n = hi.map((h, k) => Math.max(1, Math.ceil((h - lo[k]) / cell)));
  const gr = { nx: n[0], ny: n[1], nz: n[2], h: cell }, density = solidFill(tris, gr, lo), g = makeGrid(gr), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  // nodes at the foot (the lowest two layers) are held, and the load shared over the top two layers
  const at = positions(g), nodeZ = (id) => Math.round(at[id][2] / cell), onPart = new Uint8Array(g.nodes);
  for (let e = 0; e < density.length; e++) if (density[e] >= 0.5) for (let k = 0; k < 8; k++) onPart[g.edof[e * 24 + 3 * k] / 3] = 1;
  const tops = []; for (let id = 0; id < g.nodes; id++) { if (!onPart[id]) continue; const z = nodeZ(id); if (z <= 1) for (let k = 0; k < 3; k++) fixed[3 * id + k] = 1; if (z >= n[2] - 1) tops.push(id); }
  if (!tops.length) return { stress: 0, thin: true };
  for (const id of tops) for (let k = 0; k < 3; k++) f[3 * id + k] = force[k] / tops.length;
  const a = analyse({ grid: g, density, material: { E: modulus, nu }, fixed, loads: [f] });
  let most = 0; for (let e = 0; e < density.length; e++) if (density[e] >= 0.5 && a.stress[0][e] > most) most = a.stress[0][e];
  const out = { stress: most, deflection: a.deflection[0].most }; host.writeText(file, JSON.stringify(out)); return out;
}

export function momentChecks(s, f, helpers, masses, payload) {
  const motion = s.motion, { placeItems, mul, jointValues } = helpers, specs = new Map((s.a.joints || []).map((j) => [j.id, j])), poses = posesOf(s, jointValues), out = {};
  const mat = (() => { const n = materialOf(s.project).name; try { return Object.fromEntries(Object.entries(peekRuleSet(n).rules).map(([k, r]) => [k, r.value])); } catch { return null; } })();
  for (const j of motion.joints) {
    if (j.type !== 'revolute' && j.type !== 'prismatic') continue;
    let worst = null;
    for (const p of poses) { const w = placeItems(motion, p.values), L = loadAt(motion, masses, payload, w, j, mul); if (!worst || L.tipping + L.radial / 50 > worst.L.tipping + worst.L.radial / 50) worst = { L, p, w }; }
    if (!worst || !worst.L.carried) continue;
    const { L, p } = worst, spec = specs.get(j.id) ?? {}, at = L.O, refs = { joint: j.id }, say = `${n3(L.carried * 1000, 0)} g carried: ${n3(L.tipping, 3)} N m tipping, ${n3(L.radial, 2)} N across and ${n3(L.axial, 2)} N along it, worst ${p.label}`, values = { axial: L.axial, radial: L.radial, tipping: L.tipping, carried: L.carried };
    out[j.id] = { ...values, pose: p.label };
    if (spec.support?.bearings?.length) {
      const rows = spec.support.bearings.map((id) => { const o = s.objects.find((x) => x.id === id); if (!o || o.bought?.part !== 'bearing') throw new Error(`joint ${j.id}: support names "${id}", which isn't a bought bearing`); const v = o.built.values, W = worst.w[motion.items.findIndex((x) => x[0] === id)]; return { id, bore: v.bore, outer: v.outer_diameter, C0: v.static_rating, along: dot(sub([W[3], W[7], W[11]], L.O), L.Z) }; });
      const m = bearingMargin(rows, L), level = m.margin < 1 ? 'fail' : m.margin < 2 ? 'warn' : 'pass';
      f(level, `${j.id}: ${say}. ${rows.map((r) => r.id).join(' and ')} take ${n3(m.P0, 1)} N equivalent against ${n3(m.C0, 0)} N static, ${n3(m.margin, 1)} times over`, level === 'pass' ? null : `${j.id}: bearing ${n3(m.margin, 1)}×`, { code: 'joint.moment', at, refs: { ...refs, bearings: rows.map((r) => r.id) }, values: { ...values, equivalent: m.P0, rating: m.C0, margin: m.margin } });
    } else if (spec.support?.clips?.length) {
      const clips = spec.support.clips, D = s.num(spec.support.pitch ?? 40) / 2, share = L.axial / clips.length + (L.tipping * 1000 * 2) / (clips.length * D), cell = s.num(spec.support.cell ?? 0.8);
      let worstClip = null;
      for (const id of clips) {
        const parts = s.parts.filter((x) => x.item === id || x.leaf === id); if (!parts.length) throw new Error(`joint ${j.id}: support names a clip "${id}", which isn't a part`);
        const tris = parts.flatMap((x) => x.triangles), r = clipStress(tris, scale(L.Z, -share), mat?.modulus ?? 2500, mat?.poisson ?? 0.36, cell);
        if (!worstClip || r.stress > worstClip.stress) worstClip = { id, ...r };
      }
      const strength = mat?.strength ?? 30, margin = strength / worstClip.stress, level = margin < 1 ? 'fail' : margin < 2 ? 'warn' : 'pass';
      f(level, `${j.id}: ${say}. ${clips.length} printed clips, the worst (${worstClip.id}) at ${n3(worstClip.stress, 2)} MPa against ${strength} MPa (FE on ${cell} mm cells, an estimate), ${n3(margin, 1)} times over`, level === 'pass' ? null : `${j.id}: clip ${n3(margin, 1)}×`, { code: 'joint.moment', at, refs: { ...refs, clips }, values: { ...values, stress: worstClip.stress, strength, margin } });
    } else f(s.task && (s.a.gravity || s.task.payload != null) ? 'warn' : 'info', `${j.id}: ${say}, and nothing named takes it: give the joint a "support" (bearings, or printed clips)`, `${j.id}: no support named`, { code: 'joint.moment', at, refs, values });
  }
  return out;
}

// A link bent: held at its parent joint, the carried weight at its far end. δ from the FE, the tilt from a cantilever's
// relation (1.5 δ / L), carried on to the tool. Kept in .cache, as this is the slow part.
function linkFE(tris, O, far, force, E, nu, cell) {
  const key = crypto.createHash('sha256').update(JSON.stringify([tris.length, tris.slice(0, 4), O, far, force, E, cell])).digest('hex').slice(0, 20), file = paths.cache('link', key);
  if (!process.env.CAD_NO_CACHE && host.exists(file)) return JSON.parse(host.readText(file));
  const lo = [0, 1, 2].map((k) => Math.min(...tris.flat().map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...tris.flat().map((p) => p[k]))), n = hi.map((h, k) => Math.max(1, Math.ceil((h - lo[k]) / cell)));
  const gr = { nx: n[0], ny: n[1], nz: n[2], h: cell }, density = solidFill(tris, gr, lo), g = makeGrid(gr), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs), onPart = new Uint8Array(g.nodes);
  for (let e = 0; e < density.length; e++) if (density[e] >= 0.5) for (let k = 0; k < 8; k++) onPart[g.edof[e * 24 + 3 * k] / 3] = 1;
  const nodeAt = positions(g), pos = (id) => [lo[0] + nodeAt[id][0], lo[1] + nodeAt[id][1], lo[2] + nodeAt[id][2]];
  const R = 3 * cell, held = [], near = [];
  for (let id = 0; id < g.nodes; id++) if (onPart[id]) { const p = pos(id); if (norm(sub(p, O)) <= R + 4) held.push(id); if (norm(sub(p, far)) <= R + 4) near.push(id); }
  if (!held.length || !near.length) return { deflection: 0, cell, missing: true };
  for (const id of held) for (let k = 0; k < 3; k++) fixed[3 * id + k] = 1;
  for (const id of near) for (let k = 0; k < 3; k++) f[3 * id + k] = force[k] / near.length;
  const size = norm(force), a = analyse({ grid: g, density, material: { E, nu }, fixed, loads: [f] }), out = { deflection: size ? a.compliance[0] / size : 0, stress: Math.max(...Array.from(a.stress[0]).filter((_, e) => density[e] >= 0.5)), cell };
  host.writeText(file, JSON.stringify(out)); return out;
}

export function deflectionChecks(s, f, helpers, masses, payload) {
  if (!s.task) return 0;
  const motion = s.motion, { placeItems, mul, jointValues } = helpers, { c, r } = sample(s), ids = motion.items.map((x) => x[0]), mat = (() => { try { return Object.fromEntries(Object.entries(peekRuleSet(materialOf(s.project).name).rules).map(([k, x]) => [k, x.value])); } catch { return {}; } })(), E = mat.modulus ?? 2500, nu = mat.poisson ?? 0.36;
  const reached = r.samples.filter((x) => x.reachable); if (!reached.length) return 0;
  const lever = (x) => norm(sub(x.point, rowsAt(placeItems(motion, jointValues(motion, motion.pose ?? undefined))[0] || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], [0, 0, 0])));
  const far = reached.reduce((a, b) => (lever(b) > lever(a) ? b : a)), near = reached.reduce((a, b) => (lever(b) < lever(a) ? b : a));
  const links = motion.joints.filter((j) => c.names.includes(j.id));
  const at = (x, label) => {
    const v = jointValues(motion, { ...Object.fromEntries(c.names.map((n, i) => [n, [x.q[i]]])) }), W = placeItems(motion, v), rows = [];
    let total = 0, carried = 0, tool = x.point, dir = (() => { const g = motion.gravity || [0, 0, -1], l = norm(g); return g.map((q) => q / l); })();
    links.forEach((j, i) => {
      const parts = s.parts.filter((p) => p.item === ids[j.child] && p.role !== 'support' && p.role !== 'reference'); if (!parts.length) return;
      const m = masses.filter((q) => beyond(motion, j, q.item)).reduce((t, q) => t + q.kg, 0) + (payload && beyond(motion, j, payload.item) ? payload.kg : 0);
      if (!m) return;
      const O = axisOf(motion, W, j, mul).O, nextJ = links[i + 1], end = nextJ ? axisOf(motion, W, nextJ, mul).O : tool, Wc = W[j.child];
      const local = parts.flatMap((p) => p.localTriangles ?? p.triangles.map((t) => t.map((q) => invAt(Wc, q)))), Lo = invAt(Wc, O), Le = invAt(Wc, end), F = [dir[0] * Wc[0] + dir[1] * Wc[4] + dir[2] * Wc[8], dir[0] * Wc[1] + dir[1] * Wc[5] + dir[2] * Wc[9], dir[0] * Wc[2] + dir[1] * Wc[6] + dir[2] * Wc[10]].map((q) => q * m * G);
      const box = [0, 1, 2].map((k) => Math.max(...local.flat().map((p) => p[k])) - Math.min(...local.flat().map((p) => p[k]))), cell = Math.max(1, Math.min(...box) / 3), fe = linkFE(local, Lo, Le, F, E, nu, cell), L = norm(sub(Lo, Le)) || 1, beyondLength = norm(sub(tool, end)), drop = fe.deflection + (1.5 * fe.deflection * beyondLength) / L;
      total += drop; carried = Math.max(carried, m); rows.push({ link: ids[j.child], deflection: fe.deflection, at_tool: drop, cell: fe.cell, stress: fe.stress });
    });
    return { label, total, carried, rows };
  };
  const stretch = at(far, 'at full stretch'), folded = at(near, 'folded'), worst = stretch.total >= folded.total ? stretch : folded;
  if (!worst.rows.length) return 0;
  f('info', `the tool drops ${n3(worst.total, 3)} mm ${worst.label}: ${worst.rows.map((x) => `${x.link} ${n3(x.at_tool, 3)} mm`).join(', ')} (FE from the parts as drawn, cells ${worst.rows.map((x) => n3(x.cell, 1)).join(', ')} mm: a person can refine with "cell" on the joint's support)`, null, { code: 'link.deflection', predict: { name: 'link.deflection', figure: `drop at ${s.task.tool}`, value: worst.total, unit: 'mm' }, values: { total: worst.total, rows: worst.rows, label: worst.label } });
  const finds = [stretch, folded].filter((x) => x.rows.length).map((x) => { const k = (x.carried * G) / (x.total || 1e-9), Hz = Math.sqrt((k * 1000) / x.carried) / (2 * Math.PI); return { ...x, Hz }; }), low = finds.reduce((a, b) => (b.Hz < a.Hz ? b : a));
  const rings = s.task.speed != null ? ` Expect visible ringing past about ${n3(Math.max(20, low.Hz * 3), 0)} mm/s.` : '';
  f('info', `the lowest mode is about ${n3(low.Hz, 0)} Hz ${low.label}, from the tool's stiffness and the mass it carries.${rings}`, null, { code: 'assembly.frequency', values: { Hz: low.Hz, label: low.label } });
  return worst.total;
}

// What the motors can do to the arm's inertia: the worst acceleration at the tool, and the time a move across the task takes
export function accelChecks(s, f, helpers, masses, payload) {
  const motion = s.motion, { placeItems, jointValues, mul } = helpers; if (!motion.drives?.length) return null;
  const c = s.task ? chainOf(s) : null, names = c ? c.names : motion.joints.filter((j) => !j.follow).map((j) => j.id), base = placeItems(motion, jointValues(motion, motion.pose ?? undefined)), limits = [];
  for (const id of names) {
    const j = motion.joints.find((x) => x.id === id), t = trainFrom(motion, id), d = motion.drives.find((x) => x.joint === t.root); if (!d) { limits.push(null); continue; }
    const axis = axisOf(motion, base, j, mul);
    let I = 0, gravity = 0; // kg mm² about the joint
    for (const m of masses) if (beyond(motion, j, m.item)) { const X = rowsAt(base[m.item], m.centre), r = sub(X, axis.O), rad = norm(sub(r, scale(axis.Z, dot(r, axis.Z)))); I += m.kg * rad * rad; }
    if (payload && beyond(motion, j, payload.item)) { const X = rowsAt(base[payload.item], payload.point), r = sub(X, axis.O), rad = norm(sub(r, scale(axis.Z, dot(r, axis.Z)))); I += payload.kg * rad * rad; }
    for (const p of posesOf(s, jointValues).slice(0, 30)) gravity = Math.max(gravity, Math.abs(loadAt(motion, masses, payload, placeItems(motion, p.values), j, mul).torque));
    const m = d.model, speed = workingSpeed(m, d.spec), ratio = t.ratio, eff = t.efficiency, rotor = (m.figures.rotor_inertia?.value ?? 0) * 0.1, kgmm2 = I / (ratio * ratio * eff) + rotor; // kg mm²
    const avail = atCurrent(m, d.spec, performance(m, { speed }).motor.torque), left = avail - gravity / (ratio * eff), refs = { joint: id, item: d.id }, at = axis.O;
    if (left <= 0) { f('fail', `${id} stalls: ${d.id} gives ${n3(avail, 3)} N m at ${n3(speed, 0)} rpm, and the load takes ${n3(gravity / (ratio * eff), 3)} N m of it through ${n3(ratio, 1)}:1`, `${id}: stalls`, { code: 'motor.accel', at, refs, values: { available: avail, gravity } }); limits.push(0); continue; }
    const alphaMotor = (left * 1e6) / kgmm2, alpha = (alphaMotor / ratio) * (180 / Math.PI); // rad/s² at the motor, deg/s² at the joint
    limits.push(alpha);
    f('info', `${id} can accelerate at ${n3(alpha, 0)} °/s² (reflected inertia ${n3(kgmm2, 1)} kg mm², ${n3(left, 3)} N m left after the load)`, null, { code: 'motor.accel', at, refs, values: { alpha, inertia: kgmm2, torque: left } });
  }
  if (!s.task || limits.some((x) => x == null)) return limits;
  const { r } = sample(s), frame = s.task.sheet ? s.task : null;
  let worst = Infinity;
  for (const x of r.samples) if (x.reachable) {
    const J = jacobian(c, x.q), N = names.length, rows = J.map((row) => row.slice(0, N));
    for (let d = 0; d < 12; d++) { const th = (d * Math.PI) / 6, v = [Math.cos(th), Math.sin(th), 0], lam = pinv2(rows, v); if (!lam) continue; let k = Infinity; for (let i = 0; i < N; i++) if (Math.abs(lam[i]) > 1e-12) k = Math.min(k, limits[i] / Math.abs(lam[i])); worst = Math.min(worst, k); }
  }
  if (worst === Infinity) return limits;
  const accel = 0.7 * worst; s.task.accel = s.a.task.accel != null ? s.num(s.a.task.accel) : accel; void frame;
  if (s.task.speed != null) {
    const L = s.task.sheet ? Math.hypot(...(() => { const c0 = r.summary.corners; const a = c0[0].point, b = c0[2].point; return sub(a, b); })()) : 100, v = s.task.speed, a = s.task.accel, t = L > (v * v) / a ? v / a + L / v : 2 * Math.sqrt(L / a);
    f('info', `a move across the task (${n3(L, 0)} mm) takes ${n3(t, 2)} s, at up to ${n3(worst, 0)} mm/s² at the tool, planned at ${n3(s.task.accel, 0)}`, null, { code: 'task.time', values: { time: t, accel: s.task.accel, limit: worst } });
  }
  return limits;
}
function pinv2(J, v) {
  // Minimum-norm joint rates for a tool velocity, from a 2-row or 3-row Jacobian
  const R = J.map((r) => r), n = R.length, M = R.map((a) => R.map((b) => a.reduce((t, x, i) => t + x * b[i], 0)));
  const y = solveN(M.map((row, i) => [...row, v[i]])); return y && J[0].map((_, i) => R.reduce((t, r, k) => t + r[i] * y[k], 0));
  function solveN(A) { const m = A.length; for (let c = 0; c < m; c++) { let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-9) { A[c][c] = 1e-9; } for (let r = 0; r < m; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= m; k++) A[r][k] -= f * A[c][k]; } } return A.map((r, i) => r[m] / r[i]); }
}

export function loadChecks(s, f, helpers) {
  const motion = s.motion;
  if (!motion?.joints?.length || !(s.task || s.a.gravity)) return;
  const masses = massesOf(s, helpers), payload = s.task?.payload ? { kg: s.task.payload, item: motion.items.findIndex((x) => x[0] === s.task.item), point: s.task.point } : null;
  const unknown = masses.filter((m) => !m.known).map((m) => m.id);
  if (unknown.length && s.task) f('warn', `no mass known for ${unknown.join(', ')}: their rule sets give none, so they weigh nothing here`, 'masses unknown', { code: 'joint.moment.mass', refs: { items: unknown } });
  s.jointLoads = momentChecks(s, f, helpers, masses, payload);
  if (s.task?.payload != null || s.a.gravity) { const d = deflectionChecks(s, f, helpers, masses, payload); if (d && s.a.task?.deflection == null) s.task.deflection = d; }
  accelChecks(s, f, helpers, masses, payload);
}

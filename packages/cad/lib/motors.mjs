// Motors in assemblies: an item with "motor" is drawn from @rulecad/motors, its shaft turns a joint (the assembly's
// slider is the motor turning), and the assembly can say what it has to do: "loads" on joints or masses on links.
// From those, what reaches each loaded joint through the meshes and planetaries, whether the joint holds with the
// power on and off, and whether the shaft and its mount are fit for it.
import { createRequire } from 'node:module';
import { motorModel, motorParts, mountModel, performance } from '@rulecad/motors';
import { stageEfficiency } from '@rulecad/gears';
import { named } from './parts.mjs';
import { referenceBuilt } from './bought.mjs';

const require = createRequire(import.meta.url);
const n3 = (x, d = 3) => String(Number(x.toFixed(d)));
const G = 9.80665; // m/s²

// A motor item, built: its parts (body and shaft), anchors from its model, its figures as values and rules
export function motorBuilt(spec, num, id) {
  const what = `item ${id}: motor`;
  if (!spec || typeof spec !== 'object' || !spec.model) throw new Error(`${what}: give { "model": "nema17", "drives": "<joint>" }`);
  const set = Object.fromEntries(Object.entries(spec.set || {}).map(([k, v]) => { if (typeof v !== 'string') return [k, v]; try { return [k, num(v)]; } catch { return [k, v]; } }));
  const model = motorModel(spec.model, set), { body, shaft } = motorParts(model);
  const parts = named(shaft ? { body, shaft } : { body }, { body: { label: `${model.name} body` }, ...(shaft ? { shaft: { label: `${model.name} shaft` } } : {}) });
  const anchors = Object.fromEntries(Object.entries(model.anchors).map(([k, a]) => [k, { at: a.origin, axis: a.axis }]));
  const values = Object.fromEntries(Object.entries(model.figures).filter(([, f]) => typeof f.value === 'number').map(([k, f]) => [k, f.value]));
  const entries = Object.entries(model.figures).map(([k, f]) => ({ name: `${model.name}.${k}`, value: f.value, unit: f.unit, rule: f.rule, kind: f.kind, source: f.source, checked: f.checked, set: model.name }));
  return referenceBuilt({ id, key: 'motor', objName: `motor:${model.name}`, name: model.name, parts, anchors, entries, values, extra: { motor: model, spec, bought: { set: model.name, variant: null, part: 'motor', mass: model.mass ?? null } } });
}

// Which joint each motor drives, checked by name; a servo's range and a stepper's step go on the joint. The shaft
// turns in what it drives, so that pair may overlap: the body is still checked against everything.
export function motorDrives(a, placed, joints, num) {
  const drives = [], taken = new Map();
  placed.forEach(([it, c], k) => {
    if (!it.motor) return;
    const what = `item ${c.id}: motor`, id = it.motor.drives;
    if (id == null) { drives.push({ item: k, id: c.id, model: c.src.motor, spec: it.motor, joint: null }); return; } // on the bench, turning nothing
    const j = joints.find((x) => x.id === id);
    if (!j) throw new Error(`${what}: drives "${id}", which isn't a joint (${joints.map((x) => x.id).join(', ') || 'none'})`);
    if (j.type !== 'revolute') throw new Error(`${what}: a motor turns a revolute (${j.id} is a ${j.type}): drive the gear, and let the slide follow it`);
    if (j.follow) throw new Error(`${what}: ${j.id} follows ${j.follow[0]}: a motor drives the joint that leads the train`);
    if (taken.has(id)) throw new Error(`${what}: ${id} is driven by ${taken.get(id)} already: one motor to a joint`);
    taken.set(id, c.id);
    const model = c.src.motor, spec = (a.joints || []).find((x) => x.id === id);
    if (model.range != null) {
      const half = model.range / 2, d = j.dofs[0];
      if (spec.min == null && spec.max == null) { d[0] = -half; d[1] = half; d[2] = Math.min(half, Math.max(-half, d[2])); }
      else if (d[0] < -half - 1e-9 || d[1] > half + 1e-9) throw new Error(`${what}: a ${model.name} turns ${model.range}°, and ${j.id} asks for ${d[0]}° to ${d[1]}°`);
    }
    if (model.stepAngle) j.step = model.stepAngle;
    drives.push({ item: k, id: c.id, model, spec: it.motor, joint: id });
  });
  return drives;
}

// The fits a motor brings with it, in the assembly's own shape
export const shaftFits = (drives, joints, ids) => drives.filter((d) => d.joint && d.model.shaft.length).map((d) => ({ a: `${d.id}.shaft`, b: ids[joints.find((j) => j.id === d.joint).child], min: -1000, silent: true }));

// "loads": [{ "joint": "elbow", "torque": 0.5 }, { "joint": "slide", "force": 12 }, { "mass": 0.2, "at": "forearm.tip" }]
export function loadsOf(a, anchor, num, joints) {
  return (a.loads || []).map((l, i) => {
    const what = `load ${i + 1}`;
    if (l.mass != null) { if (l.at == null) throw new Error(`${what}: a mass needs "at", an anchor on what carries it`); const m = num(l.mass); if (!(m > 0)) throw new Error(`${what}: mass is above 0 kg (got ${m})`); return { mass: m, ...anchor(l.at, what), note: l.note }; }
    const j = joints.find((x) => x.id === l.joint);
    if (!j) throw new Error(`${what}: give a "mass" and "at", or a "joint" with its "torque" or "force" (joints: ${joints.map((x) => x.id).join(', ')})`);
    if (j.type === 'prismatic' ? l.force == null : l.torque == null) throw new Error(`${what}: ${j.id} is a ${j.type}, so give its ${j.type === 'prismatic' ? 'force (N)' : 'torque (N m)'}`);
    return { joint: j.id, value: num(j.type === 'prismatic' ? l.force : l.torque), note: l.note };
  });
}

// ---------- the train from a motor to a joint ----------
// Walks up the follow links from a joint to the one that leads it: the turns of that lead per turn of this joint
// (or per mm, where the joint slides), the share of power that gets through, what's in the way.
export function trainFrom(motion, id) {
  const stages = [], meshes = motion.meshes || [];
  let j = motion.joints.find((x) => x.id === id), ratio = 1, efficiency = 1, slide = j.type === 'prismatic' ? 1 : null, locks = null;
  while (j.follow) {
    const [lead, r] = j.follow, m = meshes.find((x) => x.joint === j.id) || meshes.find((x) => x.planetary && (x.members || []).includes(j.id));
    const kind = m?.kind === 'external' ? 'spur' : m?.kind || 'spur';
    const eff = m?.efficiency ?? stageEfficiency(kind, kind === 'worm' ? { worm: m.worm } : {});
    efficiency *= eff; stages.push({ joint: j.id, kind, ratio: r, efficiency: eff });
    if (kind === 'worm' && m.worm.locks) locks = `the worm (its ${n3(m.worm.leadAngle, 1)}° lead is under the friction angle)`;
    if (slide != null && stages.length === 1) slide = Math.abs(r); // mm of slide for each degree of the gear
    else ratio *= 1 / Math.abs(r);
    j = motion.joints.find((x) => x.id === lead);
  }
  return { root: j.id, ratio, efficiency, stages, slide, locks };
}

// World axis of a joint and the world position of a point on an item
const rowsAt = (W, p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
export const axisOf = (motion, worlds, j, mul) => { const P = j.parent < 0 ? j.a : mul(worlds[j.parent], j.a); return { O: [P[3], P[7], P[11]], Z: [P[2], P[6], P[10]] }; };
const sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The load at one joint, at one set of joint values (N m on a revolute, N on a slide), from every mass carried beyond it
function loadAt(motion, loads, worlds, j, mul) {
  const { O, Z } = axisOf(motion, worlds, j, mul), byChild = new Map(motion.joints.map((x) => [x.child, x]));
  const beyond = (k) => { for (let i = k, n = 0; i >= 0 && n < 99; n++) { const x = byChild.get(i); if (!x) return false; if (x === j) return true; i = x.parent; } return false; };
  let total = 0;
  for (const l of loads) {
    if (l.joint === j.id) total += l.value;
    else if (l.mass != null && beyond(l.item)) {
      const X = rowsAt(worlds[l.item], [l.frame[3], l.frame[7], l.frame[11]]), g = motion.gravity || [0, 0, -1], F = g.map((c) => (c * l.mass * G) / Math.hypot(...g));
      total += j.type === 'prismatic' ? dot(Z, F) : dot(Z, cross(sub(X, O), F)) / 1000;
    }
  }
  return total;
}

// The worst load on a joint: at each named pose, and with the motor run through its range
function worstLoad(motion, loads, j, drive, { placeItems, jointValues, mul }) {
  let worst = 0, where = null;
  const look = (values, label) => { const t = loadAt(motion, loads, placeItems(motion, values), j, mul); if (Math.abs(t) > Math.abs(worst)) { worst = t; where = label; } };
  const poses = Object.keys(motion.poses || {});
  for (const p of poses.length ? poses : [null]) look(jointValues(motion, p ?? undefined), p);
  const root = drive && motion.joints.find((x) => x.id === drive.joint);
  if (root) {
    const base = jointValues(motion, motion.pose ?? undefined), [lo, hi] = root.dofs[0];
    for (let k = 0; k <= 24; k++) { const a = lo + ((hi - lo) * k) / 24, set = Object.fromEntries(Object.entries(base).filter(([id]) => !motion.joints.find((x) => x.id === id)?.follow)); look(jointValues(motion, { ...set, [root.id]: [a] }), `${root.id} at ${n3(a, 1)}°`); }
  }
  return { torque: Math.abs(worst), where };
}

// A motor's speed if the assembly doesn't say: its corner speed, its rated speed, or half its free speed
export function workingSpeed(model, spec) {
  if (spec.speed != null) return spec.speed;
  const p = performance(model, {});
  return model.type === 'dc' ? p.limit / 2 : model.figures.pull_in_torque ? p.limit : model.type === 'servo' ? p.limit : model.type === 'brushless' ? p.limit / 4 : p.limit / 5;
}

const material = (name) => { const n = String(name || 'pla').toLowerCase().split(/\s/)[0]; try { return { name: n, ...Object.fromEntries(Object.entries(require(`@rulecad/rules/${n}.json`).rules).map(([k, r]) => [k, r.value])) }; } catch { return null; } };

// The findings: f(level, text, card, extra), as the assembly's check makes them
export function motorChecks(s, f, helpers, materialName) {
  const motion = s.motion, drives = motion?.drives || [], loads = motion?.loads || [], { placeItems, jointValues, mul } = helpers;
  if (!drives.length) { if (loads.length) f('warn', `there are loads, but no motor: nothing has been checked against them (add a "motor" item that "drives" a joint)`, null, { code: 'motor.loads' }); return; }
  const worlds = placeItems(motion, jointValues(motion, motion.pose ?? undefined));
  for (const d of drives) {
    const m = d.model, grams = n3(m.mass * 1000, 1), K = d.spec.margin != null ? d.spec.margin : 2, W = worlds[d.item];
    f('info', `${d.id}: ${m.name}, ${grams} g${d.joint ? `, drives ${d.joint}` : ''}${m.stepAngle ? `, ${n3(m.stepAngle, 4)}° a step` : ''}${m.range ? `, ${m.range}° of travel` : ''}`, null, { code: 'motor.model', refs: { item: d.id, joint: d.joint }, values: { model: m.name, grams: m.mass * 1000, stepAngle: m.stepAngle } });
    if (!d.joint) continue;
    // Its shaft on the joint's axis
    const j = motion.joints.find((x) => x.id === d.joint), { O, Z } = axisOf(motion, worlds, j, mul), S = rowsAt(W, m.anchors.shaft.origin), A = [W[2], W[6], W[10]];
    const off = cross(sub(S, O), Z), apart = Math.hypot(...off), tilt = Math.abs(1 - Math.abs(dot(A, Z)));
    if (apart > 0.05 || tilt > 1e-6) { f('fail', `${d.id}'s shaft isn't on ${d.joint}'s axis: ${n3(apart, 2)} mm off${tilt > 1e-6 ? ', and not parallel to it' : ''}`, `${d.id}: shaft off axis`, { code: 'motor.axis', at: S, refs: { item: d.id, joint: d.joint } }); continue; }
    f('pass', `${d.id}'s shaft is on ${d.joint}'s axis`, null, { code: 'motor.axis', at: S });
    // Everything it drives that carries a load
    const driven = motion.joints.filter((x) => trainFrom(motion, x.id).root === d.joint).map((x) => ({ j: x, t: trainFrom(motion, x.id), load: worstLoad(motion, loads, x, d, helpers) })).filter((x) => x.load.torque > 0);
    const motorSpeed = workingSpeed(m, d.spec), loaded = driven.length ? driven : [];
    if (!loaded.length) {
      const here = performance(m, { speed: motorSpeed });
      f('info', `${d.id} gives ${n3(here.motor.torque)} N m at ${n3(motorSpeed, 1)} rpm; no loads on what it drives, so nothing to check that against (add "loads")`, null, { code: 'motor.torque' });
      continue;
    }
    // Reflected to the motor's own shaft: what each load needs of it, and what it would take to hold against it
    let need = 0, back = 0, backOn = 0;
    const lines = [], at = (x) => axisOf(motion, worlds, x, mul).O;
    let locked = null;
    for (const { j: x, t, load } of loaded) {
      // the lead's torque for a load here: a slide's force through the pinion, a revolute's torque down the ratio
      const atLead = t.slide != null ? (load.torque * t.slide * 180) / Math.PI / 1000 : load.torque;
      const unit = t.slide != null ? 'N' : 'N m', reduction = t.ratio;
      const η = t.efficiency, needed = atLead / (reduction * η);
      need += needed; const ηback = Math.max(0, 2 - 1 / η);
      if (t.locks) locked = t.locks;
      else if (η <= 0.5) locked = `the gears (${n3(η * 100, 0)}% forwards, under the 50% where they can't be driven backwards)`;
      back += (atLead / reduction) * ηback; backOn += atLead / reduction;
      lines.push({ x, t, load, unit, reduction, atLead, η });
    }
    const speedOut = motorSpeed / loaded[0].t.ratio, rated = performance(m, { speed: motorSpeed }), avail = rated.motor.torque, margin = need ? avail / need : Infinity;
    const main = lines[0], what = main.unit === 'N m' ? `${n3(main.load.torque)} N m` : `${n3(main.load.torque, 2)} N`, gives = main.unit === 'N m' ? `${n3(avail * main.reduction * main.η)} N m` : `${n3((avail * main.reduction * main.η * Math.PI * 1000) / (main.t.slide * 180), 1)} N`;
    const trust = rated.rests.filter((k) => k !== 'spec' && k !== 'measured'), caveat = trust.length ? ` (rests on ${trust.join(' and ')} figures: measure it)` : '';
    const level = margin < 1 ? 'fail' : margin < K ? 'warn' : 'pass', fix = margin < 1 && main.t.slide == null ? ` A ratio of ${n3((main.reduction * K) / margin, 1)}:1 would give it ${K} times` : '';
    f(level, `${d.id} into ${main.x.id}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}: ${gives} there against ${what} needed${main.load.where ? ` (worst: ${main.load.where})` : ''}, ${n3(margin, 2)} times over${caveat}.${fix}`, level === 'pass' ? null : `${d.id}: ${n3(margin, 2)}× torque`, { code: 'motor.torque', at: at(main.x), refs: { item: d.id, joint: main.x.id }, values: { available: avail * main.reduction * main.η, needed: main.load.torque, margin } });
    if (d.spec.speed != null && performance(m, { speed: motorSpeed }).findings.some((x) => x.code === 'motor.speed')) f('fail', `${d.id} is asked for ${motorSpeed} rpm, past what a ${m.name} does`, `${d.id}: too fast`, { code: 'motor.speed', refs: { item: d.id } });
    else {
      const slideRate = main.x.type === 'prismatic' ? (speedOut * 360 * main.t.slide) / 60 : null, span = slideRate ? main.x.dofs[0][1] - main.x.dofs[0][0] : 0, time = slideRate ? span / slideRate : 60 / speedOut; // along a slide's travel, or a turn
      f('info', `${main.x.id} moves at ${slideRate ? `${n3(slideRate, 2)} mm/s` : `${n3(speedOut, 2)} rpm`} with ${d.id} at ${n3(motorSpeed, 1)} rpm: ${slideRate ? 'its whole range' : 'a turn'} in ${n3(time, 1)} s`, null, { code: 'motor.speed', at: at(main.x), values: { rpm: speedOut, time } });
    }
    mountCheck(s, d, f, W, avail, materialName);
    // Does it hold?
    const fig = (k) => m.figures[k]?.value, kt = m.type === 'brushless' ? 60 / (2 * Math.PI * fig('kv')) : 0;
    const on = fig('holding_torque') ?? fig('stall_torque') ?? (kt ? kt * fig('rated_current') : 0), off_ = fig('detent_torque') ?? fig('friction_torque') ?? null, brake = lines.map((l) => motion.joints.find((x) => x.id === l.x.id)?.brake).find(Boolean) ?? motion.joints.find((x) => x.id === d.joint)?.brake;
    const backS = n3(back), pmargin = backOn ? on / backOn : Infinity;
    if (locked || brake) f('pass', `${main.x.id} holds with the power off: ${brake ? `its brake (${brake})` : locked} is what holds it`, null, { code: 'motor.holds', at: at(main.x) });
    else if (off_ != null && back <= off_) f('pass', `${main.x.id} holds with the power off: ${backS} N m back at the motor against ${n3(off_)} N m of ${fig('detent_torque') != null ? 'detent' : 'gearbox friction'}`, null, { code: 'motor.holds', at: at(main.x) });
    else if (off_ != null) f('warn', `${main.x.id} drops with the power off: ${backS} N m back at the motor against ${n3(off_)} N m of ${fig('detent_torque') != null ? 'detent' : 'gearbox friction'}. A worm, a ratchet, or more ratio`, `${main.x.id}: drops unpowered`, { code: 'motor.holds', at: at(main.x), values: { back, holds: off_ } });
    else f('warn', `${main.x.id}: there's no figure for what holds it with the power off (${m.name} gives none): assume it can be turned back, and measure it`, `${main.x.id}: unpowered unknown`, { code: 'motor.holds', at: at(main.x) });
    if (pmargin < 1) f('fail', `${main.x.id} slips with the power on: ${n3(backOn)} N m back at the motor against ${n3(on)} N m of ${fig('holding_torque') != null ? 'holding' : 'stall'} torque`, `${main.x.id}: slips`, { code: 'motor.holds', at: at(main.x), values: { back: backOn, holds: on } });
    else f('pass', `${main.x.id} holds with the power on, ${n3(pmargin, 1)} times over`, null, { code: 'motor.holds', at: at(main.x), values: { margin: pmargin } });
    // The case, against what it's bolted to
    const mat = material(materialName), rise = fig('temperature_rise');
    if (mat?.softening != null && rise != null) {
      const duty = d.spec.duty != null ? d.spec.duty : 1, room = 25, caseT = room + rise * duty, ok = caseT <= mat.softening, name = mat.name.toUpperCase(), I = fig('rated_current');
      if (ok) f('pass', `${d.id}'s case reaches at most ${n3(caseT, 1)} °C ${duty < 1 ? `at ${n3(duty * 100, 0)}% duty` : 'at rated current'}, under ${name}'s ${mat.softening} °C`, null, { code: 'motor.heat', at: S });
      else { const k = Math.sqrt((mat.softening - room) / (rise * duty)); f('warn', `${d.id}'s case can reach ${n3(caseT, 1)} °C at rated current, past where ${name} softens (${mat.softening} °C). Set the driver to ${I ? `${n3(I * k, 2)} A` : `${n3(k * 100, 0)}% of its current`} (${n3(k * 100, 0)}% of the torque), or print the mount in a material that takes it`, `${d.id}: mount will soften`, { code: 'motor.heat', at: S, values: { case: caseT, softening: mat.softening } }); }
    }
  }
}

// The part a motor is fastened to, under the motor's full torque as a reaction at its screws: how thick it is at the
// holes (read from the part as drawn), and the screws' bearing on the plastic. Not yet: how far the whole part bends.
function mountCheck(s, d, f, W, avail, materialName) {
  const m = d.model, top = (n) => String(n).split(/[.@]/)[0], fit = s.fits.find((x) => x.fastens && [top(x.a), top(x.b)].includes(d.id));
  if (!fit || !m.mount.holes.length) return;
  const other = top(fit.a) === d.id ? top(fit.b) : top(fit.a), parts = s.parts.filter((p) => p.item === other || p.leaf === other);
  if (!parts.length) return;
  const inv = (p) => { const q = [p[0] - W[3], p[1] - W[7], p[2] - W[11]]; return [W[0] * q[0] + W[4] * q[1] + W[8] * q[2], W[1] * q[0] + W[5] * q[1] + W[9] * q[2], W[2] * q[0] + W[6] * q[1] + W[10] * q[2]]; };
  const pts = parts.flatMap((p) => p.triangles.flat().map(inv)), side = m.mount.side, nominal = mountModel(m, { plate: 10 }), hd = nominal.holes[0].diameter;
  let t = Infinity, plate = 0; // the shortest wall a hole has, and the plate round it (more, if the screw's head is sunk)
  for (const [hx, hy] of m.mount.holes) for (const p of pts) { const r = Math.hypot(p[0] - hx, p[1] - hy), z = p[2] * side; if (r < hd / 2 + 2 && z > 0.5) { t = Math.min(t, z); plate = Math.max(plate, z); } }
  if (t === Infinity) return f('warn', `${d.id}: couldn't find the plate at its screw holes in ${other}`, `${d.id}: mount not found`, { code: 'motor.mount' });
  const here = mountModel(m, { plate: +plate.toFixed(2), ...(d.spec.screw ? { screw: d.spec.screw } : {}) }), mat = material(materialName) || material('pla'), radius = Math.max(...m.mount.holes.map(([x, y]) => Math.hypot(x, y))), each = avail / (m.mount.holes.length * radius / 1000), bearing = each / (hd * t), margin = mat.strength / bearing;
  for (const x of here.findings) f(x.level, `${d.id} on ${other}: ${x.text}`, x.level === 'pass' ? null : `${d.id}: ${x.code.split('.')[1]}`, { code: 'motor.mount' });
  f(margin < 2 ? 'fail' : 'pass', `${d.id} on ${other}: ${n3(plate, 2)} mm of plate at the screws, each taking ${n3(each, 1)} N against the torque (bearing ${n3(bearing, 1)} MPa, ${n3(margin, 0)} times under ${mat.name.toUpperCase()}'s ${mat.strength} MPa)`, margin < 2 ? `${d.id}: screws pull through` : null, { code: 'motor.mount', values: { plate, bearing, margin } });
}

// A "shaft" fit: a motor's shaft in the bore of a part. Reads the bore from the part as drawn: a slice across the
// shaft at the grip, a ray out from the axis every few degrees, the wall inside and outside.
export function shaftFit(x, s, f, { placeItems, jointValues, mul, materialName, holeComp = 0.1 }) {
  // (a printed hole comes out holeComp smaller across, so a drawn bore is that much tighter on the real shaft)
  const motion = s.motion, top = (n) => String(n).split(/[.@]/)[0], drives = motion?.drives || [], d = drives.find((y) => y.id === top(x.a) || y.id === top(x.b)), other = d && (top(x.a) === d.id ? top(x.b) : top(x.a)), label = x.note || `${d?.id ?? x.a}'s shaft in ${other ?? x.b}`;
  if (!d) return f('fail', `${label}: neither ${x.a} nor ${x.b} is a motor`, null, { code: 'shaft.motor' });
  const worlds = placeItems(motion, jointValues(motion, motion.pose ?? undefined)), W = worlds[d.item], m = d.model, S = m.shaft, r = S.diameter / 2;
  const inv = (p) => { const q = [p[0] - W[3], p[1] - W[7], p[2] - W[11]]; return [W[0] * q[0] + W[4] * q[1] + W[8] * q[2], W[1] * q[0] + W[5] * q[1] + W[9] * q[2], W[2] * q[0] + W[6] * q[1] + W[10] * q[2]]; };
  const parts = s.parts.filter((p) => p.item === other || p.leaf === other);
  if (!parts.length) return f('fail', `${label}: no part "${other}"`, null, { code: 'shaft.part' });
  const tris = parts.flatMap((p) => p.triangles).map((t) => t.map(inv));
  // How far along the shaft the part reaches, near the axis
  let lo = Infinity, hi = -Infinity; for (const t of tris) for (const p of t) if (Math.hypot(p[0], p[1]) < r + 6) { lo = Math.min(lo, p[2]); hi = Math.max(hi, p[2]); }
  const from = Math.max(lo, S.base), to = Math.min(hi, S.tip), on = to - from;
  if (!(on > 0.05)) return f('fail', `${label}: the part isn't on the shaft (it reaches ${n3(lo, 2)} to ${n3(hi, 2)} mm along it; the shaft runs ${n3(S.base, 2)} to ${n3(S.tip, 2)})`, `${label}: not on the shaft`, { code: 'shaft.seat' });
  const flatFrom = S.flats ? S.tip - S.flatLength : S.tip, flatOn = Math.max(0, to - Math.max(from, flatFrom)), z = S.flats && flatOn > 0.2 ? (Math.max(from, flatFrom) + to) / 2 : (from + to) / 2;
  // The slice at z, as segments
  const segs = [];
  for (const t of tris) { const c = []; for (let i = 0; i < 3; i++) { const a = t[i], b = t[(i + 1) % 3]; if ((a[2] - z) * (b[2] - z) < 0) { const u = (z - a[2]) / (b[2] - a[2]); c.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); } } if (c.length === 2) segs.push(c); }
  // Each ray: the nearest wall out from the axis, and the part's outside beyond it
  const hits = (ang) => { const dx = Math.cos(ang), dy = Math.sin(ang), out = []; for (const [p, q] of segs) { const ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue; const t = (p[0] * ey - p[1] * ex) / den, u = (p[0] * dy - p[1] * dx) / den; if (t > 1e-6 && u >= 0 && u <= 1) out.push(t); } return out.sort((a, b) => a - b); };
  // The shaft's section at an angle, its flat turned to psi: the shaft turns to meet the bore as it goes on, so the flat is
  // read from the bore. Rays at every 5°; the best angle is the one that leaves the most room at the closest point.
  const flatY = S.flats === 2 ? S.across / 2 : S.across - r;
  const section = (ang, psi) => { const a = Math.sin(ang - psi); if (S.flats === 2) return Math.min(r, flatY / Math.abs(a || 1e-9)); if (S.flats === 1 && a > 0) return Math.min(r, flatY / a); return r; };
  const N = 72, inner = [];
  let minWall = Infinity;
  for (let k = 0; k < N; k++) { const ang = (2 * Math.PI * k) / N, h = hits(ang); if (!h.length) return f('fail', `${label}: at ${n3(z, 1)} mm along the shaft, the part doesn't go round it`, `${label}: no bore`, { code: 'shaft.bore' }); inner.push([ang, h[0]]); if (h.length > 1) minWall = Math.min(minWall, h[1] - h[0]); }
  const gapAt = (psi) => Math.min(...inner.map(([a, h]) => h - section(a, psi)));
  let gap = S.flats ? -Infinity : gapAt(0);
  if (S.flats) for (let k = 0; k < N; k++) gap = Math.max(gap, gapAt((2 * Math.PI * k) / N));
  const code = (c) => ({ code: c, refs: { item: d.id, part: other } }), press = x.shaft === 'press' || gap < 0;
  if (S.flats) {
    const radial = inner.map(([, h]) => h);
    if (Math.max(...radial) - Math.min(...radial) < 0.2) return f('fail', `${label}: the bore is round and the shaft has a flat: nothing turns the part but friction. Cut the flat in the bore (bore() in @rulecad/motors), or add a grub screw`, `${label}: round bore`, { ...code('shaft.flat') });
  }
  if (gap > 0.5) f('fail', `${label}: the bore is ${n3(gap, 2)} mm clear of the shaft at its closest: too slack to hold`, `${label}: slack`, code('shaft.bore'));
  if (gap < -0.2) f('fail', `${label}: the bore is ${n3(-gap, 2)} mm tighter than the shaft: it won't go on`, `${label}: too tight`, code('shaft.bore'));
  const grip = S.flats ? Math.min(flatOn, on) : on, want = S.flats ? Math.min(1.5 * S.diameter, 0.8 * S.flatLength) : 1.5 * S.diameter;
  if (grip < want) f('warn', `${label}: only ${n3(grip, 1)} mm of ${S.flats ? 'the flat' : 'the shaft'} is in the bore: ${n3(want, 1)} mm or more, or it rocks and rounds out`, `${label}: short grip`, code('shaft.grip'));
  else f('pass', `${label}: ${n3(grip, 1)} mm of ${S.flats ? 'the flat' : 'the shaft'} in the bore, ${n3(gap, 2)} mm of play at the closest`, null, code('shaft.grip'));
  if (press && minWall < Infinity) {
    const a = r, u = Math.max(0, holeComp / 2 - gap), b = a + minWall, Kf = (b * b + a * a) / (b * b - a * a), mat = material(materialName) || material('pla'), E = mat.modulus, nu = mat.poisson ?? 0.36, sigma = (E * (u / a) * Kf) / (Kf + nu), limit = mat.strength;
    if (sigma > limit) f('fail', `${label}: pressing it on stretches a ${n3(minWall, 2)} mm wall to ${n3(sigma, 1)} MPa, past ${mat.name.toUpperCase()}'s ${limit} MPa: it splits. A thicker hub or a slide fit`, `${label}: hub splits`, { ...code('shaft.hoop'), values: { stress: sigma, strength: limit } });
    else f('pass', `${label}: pressing it on stretches the wall to ${n3(sigma, 1)} MPa (${mat.name.toUpperCase()} takes ${limit} MPa)`, null, { ...code('shaft.hoop') });
  }
}

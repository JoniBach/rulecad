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
import { axisOf, workingSpeed, trainFrom, atCurrent, mountTorque } from './motors.mjs';
import { joinStiffness, PANEL_DEFAULTS } from '@rulecad/frames';
import { printableCheck, couponChecks, printedOption } from './frameprint.mjs';

const G = 9.80665;
const FEET = ['foot', 'levelling-foot', 'castor-plate', 'stacking-foot'];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rowsAt = (W, p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
const n3 = (x, d = 3) => String(+Number(x).toFixed(d)), r3 = (x) => +Number(x).toFixed(3), r4 = (p) => p.map(r3);
const fig = (x) => String(+Number(x).toPrecision(3));
// a sag in mm to three places, or where that gives fewer than three figures (under 0.1 mm), to three figures: a stiff
// frame's micrometres are still figures
const small = (x) => x && Math.abs(x) < 0.1;
const sagN = (x) => (small(x) ? fig(x) : n3(x)), sagR = (x) => (small(x) ? +Number(x).toPrecision(3) : r3(x));
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));

/** The working figures of the frame checks, each with what it rests on. */
export const FRAME_CHECK = {
  sag: { value: 360, unit: 'span per mm', rule: 'Where nothing else sets a limit, a beam may sag by its span over this much: a floor member\'s limit under the load it carries, a starting figure for a frame that holds things still. A guide\'s own tolerance, the assembly\'s frame.limit or its task\'s accuracy set a tighter one', kind: 'default', source: 'International Building Code, Table 1604.3, floor members under live load, l/360 (as reproduced in 780 CMR 1604.3, Massachusetts State Building Code); a building\'s serviceability figure taken as a frame\'s starting point', checked: '2026-11-17' },
  margin: { value: 2, unit: '×', rule: 'A beam, a join or a beam in compression is checked against about twice its load: under this margin it warns, under 1 it fails', kind: 'default', source: 'The kit\'s standard of sizing from the load with about twice the margin (issue 240)', checked: '2026-11-17' },
  link: { value: 1000, unit: '×', rule: 'A join\'s link from b\'s axis to a\'s end is a beam this many times stiffer than the stiffest beam it joins: rigid beside them, and not so stiff that the solve loses its digits', kind: 'default', source: 'A working figure of @rulecad/cad: doubles keep about 16 digits, and a ratio of 1000 costs 3 of them', checked: '2026-11-17' },
  euler: { value: 1, unit: '', rule: 'A beam in compression is checked against Euler\'s load for its length with both ends pinned (effective length factor 1). That rests on its ends being held from moving sideways, as in a braced bay or on fixed feet, where a join holding an end more than a pin does only raises the load. A post of a frame free to sway (an open frame on pinned feet) buckles sooner, at an effective length factor of 2 or more: that is left to the whole frame\'s own buckling factor, frame.buckling\'s second finding, solved with the joins\' springs', kind: 'default', source: 'Euler\'s column, P = π² E I / (K L)², K = 1 for both ends pinned (Roark\'s Formulas for Stress and Strain, 7th ed., table 15.1, case 1a)', checked: '2026-11-17' },
  push: { value: 20, unit: 'N', rule: 'Where the assembly gives no frame.rack.load, the side push a frame is racked by at its top: a hand steadying it, or a bump while working at it. The stiffness it reports does not depend on this figure; only the sway against the limit does', kind: 'estimate', source: 'A working figure of @rulecad/cad, with no measurement behind it', checked: '2026-11-17' },
  sway: { value: 400, unit: 'height per mm', rule: 'Where nothing else sets a limit, a frame may sway at its top by its height over this much under the side push: the lenient end of the drift limits in common use for buildings under wind, taken as a frame\'s starting point. The task\'s accuracy or frame.rack.limit set a tighter one', kind: 'default', source: 'ASCE/SEI 7-22, Commentary to Appendix C, section CC.2.2: drift limits in common usage are on the order of 1/600 to 1/400 of the building or storey height', checked: '2026-11-17' },
  order: { value: ['gusset', 'brace', 'panel'], unit: '', rule: 'The changes that stiffen a bay against racking, cheapest first: gussets at its corners (four printed or bought plates), one diagonal brace (a length of the bay\'s own profile and two fittings), a panel (a sheet and its clips). The first in this order that brings the sway under the limit is advised, in one bay before every bay that way', kind: 'default', source: 'A working order of @rulecad/cad, by the parts each needs; cad list prices them', checked: '2026-11-17' },
  clip: { value: 200, unit: 'N/mm', rule: 'How stiffly one panel clip holds the sheet\'s edge from sliding along the beam: the clip grips the sheet by friction and its edge sits half a millimetre off the step, so this is a guess at the friction\'s stiffness, the weak link of a panel as a shear web', kind: 'estimate', source: 'A working guess of @rulecad/cad, with no measurement behind it: a panel on the joint rig would measure it', checked: '2026-11-17' },
  band: { value: 0.2, unit: '', rule: 'A mode within this share of a frequency the machine dwells at (a stepper\'s full-step rate at its working speed) is near enough to ring', kind: 'estimate', source: 'A working figure of @rulecad/cad: a lightly damped mode amplifies a forcing within about ±20% of it several times over', checked: '2026-11-17' },
  together: { value: 32, unit: 'poses', rule: 'Where two or more moving joints are mounted on the frame\'s beams, they are also swept together: every joint at each end and each step of frame.sweep, all combined, where that makes no more than this many poses; else each at its ends and middle combined, where that makes no more than this many; else every joint at the same share of its travel at once, and at its ends in every combination that fits under this many. So a gantry\'s carriage at the middle of a beam that is itself at the middle of its travel is found', kind: 'default', source: 'A working figure of @rulecad/cad: each pose is a solve of the whole frame, so the combinations are held to a number a check takes seconds over', checked: '2026-11-25' },
  sweep: { value: 4, unit: 'steps', rule: 'A moving joint mounted on a beam is solved at each end of its travel and at this many equal steps of it between (its quarters), so a worst place between the ends is found: a carriage between two supports at its middle, an arm on a hinge where it lies level', kind: 'default', source: 'A working figure of @rulecad/cad: quarters hold a middle and the quarter points, each step one more solve of every check', checked: '2026-11-24' },
  ramp: { value: 500, unit: 'mm/s²', rule: 'Where the task gives no accel, the acceleration a move ramps at: a move at the task\'s speed ramps for speed over this many seconds, and shakes the frame at about one over that time', kind: 'default', source: 'The same default as cad machine\'s task.accel (lib/machine.mjs)', checked: '2026-11-17' },
};

/** The sheets a panel is cut from as a shear web: each one's modulus and Poisson's ratio, with what each rests on. */
export const SHEET_STIFFNESS = {
  acrylic: { E: 3300, nu: 0.37, kind: 'spec', source: 'Evonik PLEXIGLAS GS technical information (2025): modulus of elasticity 3300 MPa (ISO 527-2, short-term), Poisson\'s ratio 0.37 (ISO 527-1)' },
  polycarbonate: { E: 2400, nu: 0.38, kind: 'community', source: 'Typical figures for solid polycarbonate sheet, not checked against one maker\'s data sheet' },
  aluminium: { E: 70000, nu: 0.33, kind: 'community', source: 'Typical figures for wrought aluminium alloys, not checked against a 5754 data sheet' },
};

// A web's bar is of a made-up material this stiff, its area chosen to give the stiffness wanted along it
const WEB_E = 1000;
const unitv = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

// The bays of a frame: four beams round a rectangle in one plane, two each way, each neighbouring pair joined to each
// other or both joined to one beam at one place (the top of a corner-post box: its rails join the posts, not each
// other). Each corner is the node nearest where two neighbouring beams' axes cross, on either of them or on the beam
// both join (a join puts a station on the beam it lands on there).
function baysOf(beams, joins, nodes, nodeAt) {
  const direct = (p, q) => joins.some((x) => (x.A.id === p && x.B.id === q) || (x.A.id === q && x.B.id === p));
  const reachOf = (id) => { const m = beams.get(id).m.profile; return Math.max(m.width, m.height); };
  // the beams p and q both join at one place: a's end on b's axis within a profile's width of the other's
  const memo = new Map(), via = (p, q) => { const key = `${p}|${q}`; if (!memo.has(key)) memo.set(key, through(p, q)); return memo.get(key); };
  const through = (p, q) => { const out = new Set(); for (const x of joins) for (const y of joins) { if (x === y) continue; const [xo, xr, xz] = x.A.id === p ? [p, x.B.id, x.zb] : x.B.id === p ? [p, x.A.id, x.za] : [];
    const [yo, yr, yz] = y.A.id === q ? [q, y.B.id, y.zb] : y.B.id === q ? [q, y.A.id, y.za] : []; if (xo && yo && xr === yr && xr !== p && xr !== q && Math.abs(xz - yz) <= reachOf(xr)) out.add(xr); } return [...out]; };
  const linked = (p, q) => direct(p, q) || via(p, q).length > 0;
  const ids = [...beams.keys()], out = [], seen = new Set();
  const par = (p, q) => Math.abs(Math.abs(dot(p.u, q.u)) - 1) < 1e-3, square = (p, q) => Math.abs(dot(p.u, q.u)) < 1e-3;
  for (const a of ids) for (const b of ids) if (b !== a && linked(a, b)) for (const c of ids) if (c !== a && c !== b && linked(b, c)) for (const d of ids) {
    if ([a, b, c].includes(d) || !linked(c, d) || !linked(d, a)) continue;
    const key = [a, b, c, d].sort().join(',');
    if (seen.has(key)) continue;
    const B = [a, b, c, d].map((id) => beams.get(id));
    if (!(par(B[0], B[2]) && par(B[1], B[3]) && square(B[0], B[1]))) continue;
    const n = unitv(cross(B[0].u, B[1].u));
    if (B.some((q) => Math.abs(dot(sub(q.A, B[0].A), n)) > 1)) continue;
    const reach = Math.max(...B.map((q) => Math.max(q.m.profile.width, q.m.profile.height)));
    const corners = B.map((p, i) => {
      const q = B[(i + 1) % 4], X = add(p.A, scale(p.u, dot(sub(q.A, p.A), p.u)));
      let best = null, gap = Infinity;
      for (const r of [p, q, ...via(p.id, q.id).map((id) => beams.get(id))]) for (const z of r.stations) { const nm = nodeAt(r, z), g = Math.hypot(...sub(nodes[nm], X)); if (g < gap) { gap = g; best = nm; } }
      return gap <= reach ? best : null;
    });
    if (corners.some((x) => !x) || new Set(corners).size < 4) continue;
    seen.add(key);
    const P = corners.map((x) => nodes[x]);
    out.push({ beams: [a, b, c, d], n, corners, size: [Math.hypot(...sub(P[1], P[0])), Math.hypot(...sub(P[2], P[1]))], name: [a, b, c, d].join('-') });
  }
  return out;
}

/**
 * A panel on a bay as a shear web: one diagonal bar across the bay, free to bend at both ends, as stiff along it as the sheet
 * in shear in series with its clips' grip. Racked along a side of the bay (width a, height h, diagonal d), a bar of
 * stiffness k along it gives k (a/d)²; the sheet in shear gives G t a / h, so the sheet's bar is G t d² / (a h). The
 * clips: shear flow q = F/a round all four edges, each of n clips (k_c each, at a pitch 2(a + h)/n) carrying q times
 * its pitch; their strain energy equal to F δ / 2 gives d² n k_c / (4 (a + h)²) for the clips' bar. The two in series.
 * Its ends: a ball at one corner and pinned at the other. Both free to bend, so it carries only its pull or push; the
 * pinned end holds its spin, so a solve that splits it into pieces (modes, buckling) finds no free twist at the inner
 * nodes. It carries no twist into the frame either, as the ball end lets it turn freely about its own length.
 * @param {{ corners: string[], size: number[] }} bay @param {string} sheet @param {number} t mm @param {number} clips how many hold it (0: worked out from the pitch) @param {string} id
 */
function webOf(bay, sheet, t, clips, id) {
  const m = SHEET_STIFFNESS[sheet] ?? SHEET_STIFFNESS.acrylic, [a, h] = bay.size, d = Math.hypot(a, h), Gs = m.E / (2 * (1 + m.nu));
  const n = clips > 0 ? clips : 2 * (Math.max(2, Math.ceil(a / PANEL_DEFAULTS.pitch.value) + 1) + Math.max(2, Math.ceil(h / PANEL_DEFAULTS.pitch.value) + 1));
  const sheetBar = (Gs * t * d * d) / (a * h), clipBar = (d * d * n * FRAME_CHECK.clip.value) / (4 * (a + h) ** 2), k = 1 / (1 / sheetBar + 1 / clipBar), A = (k * d) / WEB_E;
  return { id, sheet, thickness: t, clips: n, sheetBar, clipBar, k, rests: [{ name: `${sheet} sheet`, E: m.E, nu: m.nu, kind: m.kind, source: m.source }, { name: 'frame.clip', value: FRAME_CHECK.clip.value, kind: FRAME_CHECK.clip.kind }],
    element: { id: `panel ${id}`, a: bay.corners[0], b: bay.corners[2], section: { A, Iy: A * (d / 10) ** 2, Iz: A * (d / 10) ** 2, J: A * (d / 10) ** 2 }, material: { E: WEB_E, G: WEB_E / 2.6, density: 0 }, ends: { a: 'ball', b: 'pinned' } } };
}

// How a frame moves where nothing holds it, in words, from each way @rulecad/fea finds it moves (frame().mechanisms,
// each node's six, its largest movement 1): its top moving across "down" with its feet still is the frame tipping over
// that way (named by the world axis nearest), a movement mostly along "down" a beam dropping, and a way that only
// turns a beam spinning on its own axis (or turning about the axis nearest, where that is not its own). Each said once,
// with the freedoms that showed it.
const beamOfNode = (n) => String(n).split(/[.@#/]/)[0];
function howFree(fm, ways) {
  const out = new Map();
  for (const w of ways ?? []) {
    const sh = w.shape ?? {};
    let lead = null, most = 0, spin = null, turn = 0;
    for (const [n, v] of Object.entries(sh)) { const t = Math.hypot(v[0], v[1], v[2]), r = Math.hypot(v[3], v[4], v[5]); if (t > most) { most = t; lead = n; } if (r > turn) { turn = r; spin = n; } }
    const nearest = (v) => 'xyz'[[0, 1, 2].reduce((p, q) => (Math.abs(v[q]) > Math.abs(v[p]) ? q : p), 0)];
    let says;
    if (lead && most > 1e-6) {
      const d = sh[lead].slice(0, 3), v = dot(d, fm.down), h = sub(d, scale(fm.down, v));
      says = Math.hypot(...h) >= Math.abs(v) ? `the frame tips over along ${nearest(h)}` : `${beamOfNode(lead)} drops at ${lead}`;
    } else if (spin) {
      const r = sh[spin].slice(3), b = fm.beams.get(beamOfNode(spin));
      says = b && Math.abs(Math.abs(dot(unitv(r), b.u)) - 1) < 1e-3 ? `${b.id} spins on its own axis` : `it turns about ${nearest(r)} at ${spin}`;
    } else says = `it moves at ${w.node} (${w.freedom})`;
    out.set(says, [...(out.get(says) ?? []), { node: w.node, freedom: w.freedom }]);
  }
  return [...out].map(([says, at]) => ({ says, at }));
}
// the ways in one clause each, and where each is free: "the frame tips over along y (free at z2.b: rx)"
const howSaid = (hs) => hs.map((h) => `${h.says} (free at ${[...h.at.reduce((m, l) => m.set(l.node, [...(m.get(l.node) ?? []), l.freedom]), new Map())].map(([n, fr]) => `${n}: ${fr.join(', ')}`).join('; ')})`).join(', and ');
// the mechanisms of a solved frame that match freedoms named (a refusal's or buckling's), by node and freedom
const waysAt = (solved, ls) => (solved?.mechanisms ?? []).filter((m) => ls.some((l) => l.node === m.node && l.freedom === m.freedom));

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
  if (!s.joins?.length && !['supports', 'limit', 'points', 'rack', 'printed', 'size'].some((k) => s.a.frame?.[k] != null)) return null;
  const { placeItems, jointValues, mul } = helpers, ids = motion.items.map((x) => x[0]), base = jointValues(motion, motion.pose ?? undefined), worlds = placeItems(motion, base);
  const opts = s.a.frame ?? {};
  if (typeof opts !== 'object' || Array.isArray(opts)) throw new Error(`frame is { "supports", "limit", "points", "rack", "cut", "heat", "printed", "size" } (got ${shown(opts)})`);
  for (const k of Object.keys(opts)) if (!['supports', 'limit', 'points', 'rack', 'cut', 'heat', 'printed', 'size'].includes(k)) throw new Error(`frame has no "${k}": it takes supports, limit, points, rack, cut, heat, printed, size`);
  printedOption(opts.printed);
  if (opts.rack != null) {
    if (typeof opts.rack !== 'object' || Array.isArray(opts.rack)) throw new Error(`frame.rack is { "load": 20, "limit": 1 }: the side push in N and the sway allowed in mm (got ${shown(opts.rack)})`);
    for (const k of Object.keys(opts.rack)) if (!['load', 'limit'].includes(k)) throw new Error(`frame.rack has no "${k}": it takes load (N) and limit (mm)`);
    for (const k of ['load', 'limit']) if (opts.rack[k] != null && !(s.num(opts.rack[k]) > 0)) throw new Error(`frame.rack.${k} is ${k === 'load' ? 'the side push in N' : 'the sway allowed in mm'}, above 0 (got ${shown(opts.rack[k])})`);
  }
  const byChild = new Map(motion.joints.map((j) => [j.child, j])), moving = (j) => !j.at && j.type !== 'fixed';
  const movesWith = (k) => { for (let i = k, n = 0; n < 99; n++) { const j = byChild.get(i); if (!j) return false; if (moving(j)) return true; i = j.parent; } return false; };
  const down = (() => { const g = motion.gravity || [0, 0, -1], l = Math.hypot(...g) || 1; return g.map((c) => c / l); })();
  // the beams: still ones only (a beam on a carriage is a load, not the frame: its weight is carried below)
  const beams = new Map(), left = [], riding = [], loose = [];
  for (const o of s.objects) {
    if (!o.beam || o.unplaced) continue;
    const k = ids.indexOf(o.id);
    if (k < 0) continue;
    if (movesWith(k)) { riding.push({ o, k }); continue; }
    const W = worlds[k], m = o.beam, L = m.length, A = rowsAt(W, [0, 0, 0]), u = [W[2], W[6], W[10]], top = [W[1], W[5], W[9]];
    const mat = m.profile.material, F = m.figures, E = m.material?.modulus ?? mat?.modulus, nu = mat?.poisson ?? mat?.figures?.poisson?.value;
    const Gs = mat?.figures?.shear_modulus?.value ?? (E && nu != null ? E / (2 * (1 + nu)) : null), grams = m.weight?.sheet ?? m.mass ?? 0;
    // a printed beam's strength is the plastic's for its pose: along its layers lying down, across them standing up
    const strength = m.printed?.strength ?? mat?.strength ?? mat?.figures?.strength?.value ?? null;
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
  // (a beam a riding beam also rests on, parallel to its joint's beam: the same station there, turned by sign and moved by shift)
  const mountStation = (mt, values) => { const j = mt.joint, z = j.a[11], v = j.type === 'prismatic' ? (values[j.id]?.[0] ?? 0) : 0; return Math.max(0, Math.min(mt.beam.L, (mt.shift ?? 0) + (mt.sign ?? 1) * (z + v * j.a[10]))); };

  // the beams a riding beam o (item k, its joint mt on a still beam) lies on: its joint's beam, at the joint's anchor
  // along o, and one other still beam parallel to it, square to o, its axis as far below o's and under o's length.
  // Each takes the share of o's weight the lever rule gives (o's weight at its middle); null where there is no other
  // such beam, more than one, or o's middle is not between them (then its joint's beam carries it all)
  const restsOn = (o, k, mt) => {
    const W = worlds[k], u = [W[2], W[6], W[10]], O = rowsAt(W, [0, 0, 0]), L = o.beam.length, T = mt.beam;
    if (Math.abs(dot(u, T.u)) > 1e-3) return null;
    const s1 = mt.joint.b[11], P1 = rowsAt(W, [0, 0, s1]), drop = dot(sub(add(T.A, scale(T.u, dot(sub(P1, T.A), T.u))), P1), down);
    const others = [...beams.values()].filter((b) => b !== T && Math.abs(Math.abs(dot(b.u, T.u)) - 1) < 1e-6).map((b) => {
      const s2 = dot(sub(b.A, O), u), P2 = add(O, scale(u, s2)), foot = add(b.A, scale(b.u, dot(sub(P2, b.A), b.u)));
      return { b, s2, gap: Math.hypot(...sub(sub(foot, P2), scale(down, dot(sub(foot, P2), down)))), drop: dot(sub(foot, P2), down) };
    }).filter((x) => x.s2 >= -1e-6 && x.s2 <= L + 1e-6 && Math.abs(x.s2 - s1) > 1 && x.gap < 1 && Math.abs(x.drop - drop) < 1);
    if (others.length !== 1) return null;
    const { b, s2 } = others[0], c = L / 2, p1 = (s2 - c) / (s2 - s1);
    if (!(p1 >= 0 && p1 <= 1)) return null;
    const sign = Math.sign(dot(b.u, T.u)), shift = dot(sub(T.A, b.A), b.u);
    return [{ mount: mt, part: p1, s: s1 }, { mount: { ...mt, beam: b, sign, shift }, part: 1 - p1, s: s2 }];
  };

  // the poses: as drawn, each named pose, and each moving joint mounted on a beam swept through its travel: each end and
  // frame.sweep steps between (a step where it is drawn is the drawn pose)
  const poses = [{ label: 'as drawn', values: base }];
  for (const p of Object.keys(motion.poses || {})) poses.push({ label: `pose ${p}`, values: jointValues(motion, p) });
  const movers = motion.joints.filter((j) => moving(j) && beams.has(ids[j.parent]) && j.dofs?.length === 1), steps = FRAME_CHECK.sweep.value;
  for (const j of movers) {
    const [lo, hi] = j.dofs[0], drawn = base[j.id]?.[0], between = Array.from({ length: steps - 1 }, (_, k) => lo + ((hi - lo) * (k + 1)) / steps).filter((v) => !(drawn != null && Math.abs(drawn - v) < 1e-6));
    for (const v of [lo, hi, ...between]) poses.push({ label: `${j.id} at ${n3(v, 1)}`, values: { ...base, [j.id]: [v] } });
  }
  // and swept together (frame.together): every combination of their steps, else of their ends and middles, else all at
  // one share of their travel at once and their ends combined; a combination already solved is not solved again
  const together = { joints: movers.map((j) => j.id), how: null };
  if (movers.length > 1) {
    const cap = FRAME_CHECK.together.value, at = (j, share) => j.dofs[0][0] + (j.dofs[0][1] - j.dofs[0][0]) * share;
    const shares = (n) => Array.from({ length: n + 1 }, (_, k) => k / n), grid = (sh) => movers.reduce((acc, j) => acc.flatMap((c) => sh.map((x) => [...c, [j, at(j, x)]])), [[]]);
    let combos;
    if ((steps + 1) ** movers.length <= cap) { combos = grid(shares(steps)); together.how = `every combination of their ${steps + 1} places each`; }
    else if (3 ** movers.length <= cap) { combos = grid(shares(2)); together.how = 'every combination of their ends and middles'; }
    else {
      combos = shares(steps).map((x) => movers.map((j) => [j, at(j, x)]));
      if (2 ** movers.length <= cap) combos.push(...grid([0, 1]));
      together.how = `all at one share of their travel at once, in ${steps} steps${2 ** movers.length <= cap ? ', and their ends in every combination' : ''} (too many joints to combine every place: ${3 ** movers.length} poses for their ends and middles alone)`;
    }
    const seen = new Set(poses.map((c) => JSON.stringify(movers.map((j) => r3(c.values[j.id]?.[0] ?? 0)))));
    for (const c of combos) {
      const key = JSON.stringify(c.map(([, v]) => r3(v)));
      if (seen.has(key)) continue;
      seen.add(key);
      poses.push({ label: c.map(([j, v]) => `${j.id} at ${n3(v, 1)}`).join(', '), values: { ...base, ...Object.fromEntries(c.map(([j, v]) => [j.id, [v]])) } });
    }
  }
  // what a joint must push or turn against ("loads" on joints: a force on a slide, a torque on a hinge, and a belt's
  // push at its carriage's acceleration), carried through the joint, held by its motor, into the beam its chain is
  // mounted on: each in every pose, one way and then the other (none says which way it acts). A belt's share of its
  // carriage's own weight along the travel is that weight, already on the frame, so it is not counted again
  const onJoints = [];
  for (const l of motion.loads || []) {
    if (l.joint == null || l.beltWeight || !(Math.abs(l.value) > 0)) continue;
    const j = motion.joints.find((x) => x.id === l.joint), mt = j ? mountOf(j.child) : null;
    if (!j) continue;
    if (!mt) { loose.push(`the load on ${j.id}`); continue; }
    onJoints.push({ joint: j, value: Math.abs(l.value), unit: j.type === 'prismatic' ? 'N' : 'N m', note: l.note ?? null, belt: l.belt ?? null, mount: mt });
  }
  // a motor turning a joint mounted on a beam, the motor itself on a still beam: what it does to the frame. Driving a
  // hinge, the torque it turns the arm with is held at its own mount (the arm's inertia pushes back through it): its
  // most torque at its working speed, through its gearing, one way and the other in every pose, as a joint's load at the
  // motor's mount. Run into a hard stop at an end of the travel, it stalls there with its holding torque: the stop and
  // the motor's mount take that push (or turn) equal and opposite, a pair inside the frame, along the joint's line
  const stalls = [];
  for (const d of motion.drives || []) {
    if (!d.joint) continue;
    const fg = (x) => d.model?.figures?.[x]?.value, hold = atCurrent(d.model, d.spec, fg('holding_torque') ?? fg('stall_torque') ?? 0);
    for (const j of motion.joints.filter((x) => moving(x) && x.dofs?.length === 1 && !motion.joints.some((y) => y.follow?.[0] === x.id))) {
      let t; try { t = trainFrom(motion, j.id); } catch { continue; }
      if (t.root !== d.joint) continue;
      const mt = mountOf(j.child), mm = mountOf(d.item);
      if (!mt) continue;
      if (!mm || mm.mover) { loose.push(`${d.id}'s push on ${j.id} (the motor moves with what it drives, or is on no beam)`); continue; }
      const out = (T) => (t.slide != null ? (T * t.ratio * t.efficiency * 1000 * Math.PI) / (180 * t.slide) : T * t.ratio * t.efficiency), unit = t.slide != null ? 'N' : 'N m';
      if (j.type === 'revolute') { let avail = 0; try { avail = mountTorque(d); } catch { avail = 0; } if (avail > 0) onJoints.push({ joint: j, value: out(avail), unit, note: `${d.id}'s reaction, the most torque it turns ${j.id} with`, belt: null, mount: mm, motor: d.id }); }
      if (hold > 0) for (const [end, sign] of [[j.dofs[0][0], -1], [j.dofs[0][1], 1]]) stalls.push({ joint: j, motor: d.id, value: out(hold), unit, sign, end, mount: mt, motorMount: mm, hold, label: `${j.id} at ${n3(end, 1)}, ${d.id} stalled against its stop` });
    }
  }
  const cases = [...(onJoints.length ? poses.flatMap((c) => [{ ...c, label: `${c.label}, joint loads +`, push: 1 }, { ...c, label: `${c.label}, joint loads -`, push: -1 }]) : poses),
    ...stalls.map((x) => ({ label: x.label, values: { ...base, [x.joint.id]: [x.end] }, stall: x }))];

  // what weighs on the frame: items (beams' own weight is the elements'), and the masses of "loads"
  const masses = massesOf(s, { placeItems, jointValues }), carried = [], unknown = [];
  // a panel (not a door) on a bay of frame beams is a shear web of the frame: its weight goes to its bay's corners; on
  // beams that make no bay, its weight is spread along those of the frame
  const sheets = (s.panels ?? []).filter((p) => !p.door && p.bay?.some((id) => beams.has(id))).map((p) => ({ ...p, kg: (p.model?.grams ?? 0) / 1000 }));
  for (const q of masses) {
    if (beams.has(q.id) || left.includes(q.id) || riding.some((x) => x.o.id === q.id) || sheets.some((p) => p.id === q.id)) continue;
    if (!q.known) { unknown.push(q.id); continue; }
    if (!(q.kg > 0)) continue;
    const mt = mountOf(q.item);
    if (!mt) { loose.push(q.id); continue; }
    carried.push({ id: q.id, item: q.item, kg: q.kg, centre: q.centre, mount: mt });
  }
  // a beam riding a moving joint (a gantry's cross beam on its carriages): its sheet's weight at its middle, carried
  // where its chain of mounts meets a still beam, like any mounted item
  // A riding beam lying across two parallel beams at one level (a gantry's beam on its two side beams) rests on both,
  // though its joint is on one: its weight is shared between them by the lever rule, as a beam on two supports
  const rides = [];
  for (const { o, k } of riding) {
    const kg = (o.beam.weight?.sheet ?? o.beam.mass ?? 0) / 1000, mt = mountOf(k), on = byChild.get(k);
    if (!(kg > 0)) { unknown.push(o.id); continue; }
    if (!mt) { loose.push(o.id); continue; }
    const share = mt.joint.child === k ? restsOn(o, k, mt) : null;
    if (share) for (const x of share) carried.push({ id: o.id, item: k, kg: kg * x.part, centre: [0, 0, x.s], mount: x.mount });
    else carried.push({ id: o.id, item: k, kg, centre: [0, 0, o.beam.length / 2], mount: mt });
    rides.push({ id: o.id, joint: (mt.mover ?? on)?.id ?? null, kg, on: share ? share.map((x) => ({ beam: x.mount.beam.id, share: x.part })) : [{ beam: mt.beam.id, share: 1 }] });
  }
  const loads = [];
  (motion.loads || []).forEach((l, i) => {
    if (l.mass == null) return;
    const said = s.a.loads?.[i]?.at, where = typeof said === 'string' ? said : said?.item ? `${said.item}${said.at ? ` at (${said.at.map((x) => n3(s.num(x), 1)).join(', ')})` : ''}` : ids[l.item], point = [l.frame[3], l.frame[7], l.frame[11]];
    if (beams.has(ids[l.item])) { const b = beams.get(ids[l.item]); loads.push({ index: i, kg: l.mass, where, item: l.item, point, beam: b, z: snap(b, Math.max(0, Math.min(b.L, point[2]))), note: l.note }); return; }
    const mt = mountOf(l.item);
    if (!mt) { loose.push(`load ${i + 1} (${where})`); return; }
    loads.push({ index: i, kg: l.mass, where, item: l.item, point, mount: mt, note: l.note });
  });
  for (const c of [...carried, ...loads.filter((l) => l.mount), ...onJoints]) for (const cs of poses) snap(c.mount.beam, mountStation(c.mount, cs.values));
  for (const x of stalls) { const v = { ...base, [x.joint.id]: [x.end] }; snap(x.mount.beam, mountStation(x.mount, v)); snap(x.motorMount.beam, mountStation(x.motorMount, v)); }
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
    if (!Object.keys(opts.supports).length) throw new Error('frame.supports names no support: give at least one place the frame is held, as { "z1.a": "pinned" }, or leave supports out to stand the frame on its feet or its lowest ends');
    for (const [addr, how] of Object.entries(opts.supports)) {
      const id = addr.split('.')[0], b = beams.get(id);
      if (!b) throw new Error(`frame.supports: "${addr}" is on a beam of the frame, as z1.a or x1.bottom@50% (beams: ${[...beams.keys()].join(', ')})`);
      if (!['pinned', 'fixed', 'resting'].includes(how)) throw new Error(`frame.supports: "${addr}" is held pinned (from moving), fixed (from turning too) or resting (from moving and from twisting about the beam's length: a beam lying across a round bar) (got ${shown(how)})`);
      const k = b.u.findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-6);
      if (how === 'resting' && k < 0) throw new Error(`frame.supports: "${addr}" rests on a bar, held from twisting about its length, and ${id} does not run along x, y or z: hold it pinned or fixed`);
      const r = motion.address(addr, 'frame.supports');
      supports.push({ where: addr, beam: b, z: snap(b, Math.max(0, Math.min(b.L, r.frame[11]))), how, why: 'frame.supports', said: true, ...(how === 'resting' ? { twist: `r${'xyz'[k]}` } : {}) });
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
  // bays: four beams joined round a rectangle in one plane, two each way; each corner the node where two of their axes
  // cross (the station a join put on the beam it lands on)
  const bays = baysOf(beams, joins.filter((x) => beams.has(x.A.id) && beams.has(x.B.id)), nodes, nodeAt);
  // each panel on a bay as a shear web: one diagonal bar, free to bend at both ends, as stiff along it as the sheet in shear in
  // series with its clips' grip
  // a panel whose beams make no bay (not joined round it) is no web, but it lies on its beams: its weight is spread
  // along each of them, a quarter each
  const webs = [], heldSheets = [], laid = [];
  for (const p of sheets) {
    const bay = bays.find((b) => b.beams.length === p.bay.length && p.bay.every((id) => b.beams.includes(id)));
    if (!bay) { const on = p.bay.filter((id) => beams.has(id)); if (p.kg > 0 && on.length) laid.push({ id: p.id, kg: p.kg, beams: on }); else if (!on.length) loose.push(p.id); continue; }
    const w = webOf(bay, p.sheet, p.thickness, p.items.length, p.id);
    webs.push(w); heldSheets.push({ ...p, bay: bays.indexOf(bay) }); elements.push(w.element);
  }
  const supportMap = {}, mapSupports = () => { for (const sp of supports.filter(keep)) supportMap[nodeAt(sp.beam, sp.z)] = sp.how === 'fixed' ? 'fixed' : { x: true, y: true, z: true, ...(sp.twist ? { [sp.twist]: true } : {}) }; };
  mapSupports();
  // (a freedom nothing holds, which the loads do not move, is held for the solve and named in frame.solve: a frame in
  // one plane on pinned feet sways out of it, a beam pinned at both ends spins on its axis)
  const withSprings = (rigid) => ({ nodes, sections, materials, supports: supportMap, gravity: scale(down, G), loose: 'hold',
    elements: elements.map((q) => { const sp = rigid ? [] : springs.filter((p) => p.el === q); return sp.length ? { ...q, ends: Object.fromEntries(sp.map((p) => [p.end, { rx: p.x.k.twist, ry: p.x.k.bending, rz: p.x.k.bending }])) } : q; }) });

  // Supports guessed at the lowest ends are pinned. Where that leaves the frame free to move (two posts and a rail
  // leaning over out of their plane, a beam on the floor rolling on its axis with a post on it), the guess takes
  // what a beam on the floor has: a beam with both ends lowest lies on its face and rests (held from twisting about
  // its length, as "resting" holds it), and a beam standing on its lowest end stands on its end face, held from
  // turning (fixed). Supports said in "frame": { "supports" } or by feet are never changed.
  const axisOfBeam = (b) => b.u.findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-6);
  // (the guess is said: frame.solve warns that the frame would be free on pinned feet, so every figure rests on ends
  // held that nobody gave, and frame.rack, frame.buckling and frame.frequency say they rest on it: fm.guess)
  const guessed = supports.filter((x) => x.why === 'a lowest end' && keep(x));
  let guess = null;
  if (guessed.length && supports.every((x) => x.why === 'a lowest end')) {
    let free = [];
    // (in the model as solved and in the pieces modes and buckling are solved in, where a freedom can show that
    // rounding hid in the whole: either says the frame is free)
    for (const rigid of [false, true]) for (const m of [withSprings(rigid), subdivide(withSprings(rigid), 4)]) try { free.push(...solveFrame(m).mechanisms); } catch { /* refused: said by the solve itself */ }
    if (free.length) {
      for (const x of guessed) {
        const lies = supports.some((y) => y !== x && y.beam === x.beam) && axisOfBeam(x.beam) >= 0, stands = Math.abs(dot(x.beam.u, down)) > 1 - 1e-6;
        if (lies) Object.assign(x, { how: 'resting', why: 'a lowest end of a beam lying on its face', twist: `r${'xyz'[axisOfBeam(x.beam)]}` });
        else if (stands) Object.assign(x, { how: 'fixed', why: 'a lowest end, standing on its end face' });
      }
      mapSupports();
      const seen = new Set();
      const ways = free.filter((l) => { const k = `${l.node} ${l.freedom}`; return !seen.has(k) && seen.add(k); });
      guess = { free: ways.map(({ node, freedom }) => ({ node, freedom })), ways,
        supports: guessed.filter((x) => x.why !== 'a lowest end').map((x) => ({ where: x.where, how: x.how, why: x.why })) };
      if (!guess.supports.length) guess = null; // (nothing changed: the guess stays pinned, and the solve says what is free)
    }
  }
  // the loads at each pose: every carried item's and load's weight as a force and a moment at its node
  const nodeLoads = (values, only, push, stall) => {
    const W = placeItems(motion, values), out = [];
    const put = (b, z, C, kg) => { const n = nodeAt(b, z); if (!n) throw new Error(`frame: no node on ${b.id} at ${n3(z)} mm for a load (a pose this check did not foresee)`); const F = scale(down, kg * G); out.push({ node: n, force: F, moment: cross(sub(C, nodes[n]), F) }); };
    for (const c of only ? [] : carried.filter(keep)) put(c.mount.beam, mountStation(c.mount, values), rowsAt(W[c.item], c.centre), c.kg);
    for (const l of loads.filter(keep)) { if (only && only !== l) continue; const C = rowsAt(W[l.item], l.point); if (l.beam) put(l.beam, l.z, C, l.kg); else put(l.mount.beam, mountStation(l.mount, values), C, l.kg); }
    for (const p of only ? [] : heldSheets) for (const n of bays[p.bay].corners) out.push({ node: n, force: scale(down, (p.kg / 4) * G), moment: [0, 0, 0] });
    for (const p of only ? [] : laid) for (const id of p.beams) { const b = beams.get(id), w = scale(down, ((p.kg / p.beams.length) * G) / b.L); for (const q of elements) if (q.of === id) out.push({ element: q.id, spread: w }); }
    // a joint's load, one way (push 1) or the other (-1): a slide's force along its axis through the joint's place, a
    // hinge's torque about its axis, each at the node where its chain meets the beam
    for (const x of only || !push ? [] : onJoints.filter(keep)) {
      const n = nodeAt(x.mount.beam, mountStation(x.mount, values));
      if (!n) throw new Error(`frame: no node on ${x.mount.beam.id} for the load on ${x.joint.id} (a pose this check did not foresee)`);
      const { O, Z } = axisOf(motion, W, x.joint, mul), F = x.unit === 'N' ? scale(Z, push * x.value) : [0, 0, 0];
      out.push({ node: n, force: F, moment: x.unit === 'N' ? cross(sub(O, nodes[n]), F) : scale(Z, push * x.value * 1000) });
    }
    // a motor stalled against a stop: the push (or turn) on the stop at the joint's place, and back on the motor's mount,
    // both along the joint's line, so they cancel in the whole and load the frame between them
    if (stall && !only && keep(stall) && keep({ mount: stall.motorMount })) {
      const { O, Z } = axisOf(motion, W, stall.joint, mul);
      for (const [mt, k] of [[stall.mount, 1], [stall.motorMount, -1]]) {
        const n = nodeAt(mt.beam, mountStation(mt, values));
        if (!n) throw new Error(`frame: no node on ${mt.beam.id} for ${stall.motor}'s stall (a pose this check did not foresee)`);
        const F = stall.unit === 'N' ? scale(Z, k * stall.sign * stall.value) : [0, 0, 0];
        out.push({ node: n, force: F, moment: stall.unit === 'N' ? cross(sub(O, nodes[n]), F) : scale(Z, k * stall.sign * stall.value * 1000) });
      }
    }
    return out;
  };
  // the same masses for a modal solve: each at the node it is carried at, in kg (its offset's rotary inertia left out)
  const nodeMasses = (values) => {
    const out = {}, put = (b, z, kg) => { const n = nodeAt(b, z); out[n] = (out[n] ?? 0) + kg; };
    for (const c of carried.filter(keep)) put(c.mount.beam, mountStation(c.mount, values), c.kg);
    for (const l of loads.filter(keep)) { if (l.beam) put(l.beam, l.z, l.kg); else put(l.mount.beam, mountStation(l.mount, values), l.kg); }
    for (const p of heldSheets) for (const n of bays[p.bay].corners) out[n] = (out[n] ?? 0) + p.kg / 4;
    // (a panel laid on its beams: each beam's share at its elements' ends, half an element's length each)
    for (const p of laid) for (const id of p.beams) { const b = beams.get(id); for (const q of elements) if (q.of === id) { const share = (p.kg / p.beams.length) * Math.hypot(...sub(nodes[q.b], nodes[q.a])) / b.L / 2; out[q.a] = (out[q.a] ?? 0) + share; out[q.b] = (out[q.b] ?? 0) + share; } }
    return out;
  };
  const kept = new Set(carried.filter(keep).map((c) => c.id));
  // what is mounted only on beams left out (not held by a support through joins): not weighed, and named
  const off = [...new Map([...carried, ...loads].filter((c) => !keep(c) && !kept.has(c.id)).map((c) => [c.id ?? `load ${c.index + 1} at ${c.where}`, (c.mount?.beam ?? c.beam).id]))].map(([id, on]) => ({ id, on }));
  return { beams, left, missing, loose, unknown, off, riding: rides.filter((x) => kept.has(x.id)), carried: carried.filter(keep), loads: loads.filter(keep), points, guides: guides.filter(keep), supports: supports.filter(keep), joins: joins.filter((x) => beams.has(x.A.id)),
    cases, poses, onJoints: onJoints.filter(keep), stalls: stalls.filter((x) => keep(x) && keep({ mount: x.motorMount })), together, down, nodes, nodeAt, guess, model: withSprings(false), rigid: withSprings(true), nodeLoads, nodeMasses, bays, webs, sheets: heldSheets, laid, elements, mountStation, worlds, axisOf: (j) => axisOf(motion, worlds, j, mul) };
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
  if (solved.error) { const guessed = fm.supports.every((x) => x.why.startsWith('a lowest end')); f(guessed ? 'info' : 'warn', `the frame is not solved: ${solved.error}. Its supports: ${fm.supports.map((x) => `${x.where} (${x.why})`).join(', ') || 'none'}${guessed ? '. Say where it is held: "frame": { "supports": { "z1.a": "pinned" } }, or fit its feet' : ''}`, guessed ? null : 'frame: not solved', { code: 'frame.solve', refs: { supports: fm.supports.map((x) => x.where), code: solved.code } }); return null; }
  const { results } = solved, down = fm.down, margin = FRAME_CHECK.margin.value, held = solved.loose ?? [];
  const heldList = [...held.reduce((m, l) => m.set(l.node, [...(m.get(l.node) ?? []), l.freedom]), new Map())].map(([n, fr]) => `${n} (${fr.join(', ')})`).join(', ');
  // how it moves there, in words: the frame tipping over along y, a beam spinning on its axis
  const heldHow = howFree(fm, solved.mechanisms), heldSaid = howSaid(heldHow);
  // what the joins rest on, counted by kind
  const kinds = new Map();
  for (const x of fm.joins) { const key = `${x.j.kind}${x.j.fitting ? ` (${x.j.fitting})` : ''}: ${restsWord(x.k)}`; kinds.set(key, (kinds.get(key) ?? 0) + 1); }
  const estimates = fm.joins.filter((x) => !(x.k.measured?.bending && x.k.measured?.twist)).length;
  const restsJoins = fm.joins.length ? `${fm.joins.length} join${fm.joins.length > 1 ? 's' : ''}' springs (${[...kinds].map(([k, n]) => `${n} ${k}`).join('; ')})` : 'no joins';
  // what every figure rests on: the joins' springs are an estimate while any is, whether or not they move a figure
  const restsOn = estimates ? 'estimate' : fm.joins.length ? 'measured' : 'beams';
  const rests = fm.joins.map((x) => ({ join: x.j.index, kind: x.j.kind, bending: x.k.bending, twist: x.k.twist, value: restsWord(x.k) }));
  // supports guessed and changed from pinned (fm.guess): the solve warns, and racking, buckling and the modes say they rest on it
  const guess = fm.guess, listFree = (ls) => [...ls.reduce((m, l) => m.set(l.node, [...(m.get(l.node) ?? []), l.freedom]), new Map())].map(([n, fr]) => `${n} (${fr.join(', ')})`).join(', ');
  const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
  const posts = guess ? guess.supports.filter((x) => x.how === 'fixed').map((x) => x.where) : [], lying = guess ? guess.supports.filter((x) => x.how !== 'fixed').map((x) => x.where) : [];
  const guessHeld = [posts.length ? `${and(posts)} fixed, standing on ${posts.length > 1 ? 'their end faces' : 'its end face'}` : null, lying.length ? `${and(lying)} resting, held from twisting as ${lying.length > 1 ? 'ends of beams' : 'an end of a beam'} lying on its face` : null].filter(Boolean).join(', and ');
  const guessFree = guess ? listFree(guess.free) : '', guessHow = guess ? howFree(fm, guess.ways) : [], guessSaid = howSaid(guessHow);
  // supports guessed at the lowest ends and left pinned: nothing in the assembly says the frame stands there
  const pinnedGuess = fm.supports.filter((x) => x.why === 'a lowest end').map((x) => x.where), guessedOnly = fm.supports.length > 0 && fm.supports.every((x) => x.why.startsWith('a lowest end'));
  if (guess) {
    const said = f;
    f = (level, text, card, extra = {}) => (['frame.rack', 'frame.buckling', 'frame.frequency'].includes(extra.code)
      ? said(level, `${text}. This rests on supports guessed, not given: ${guessHeld}, where on pinned feet nothing would hold it: ${guessSaid}`, card, { ...extra, refs: { ...extra.refs, guessed: guess.supports.map((x) => x.where) } })
      : said(level, text, card, extra));
  }
  f(guessedOnly ? 'warn' : 'info', `the frame is solved as ${fm.beams.size} beam${fm.beams.size > 1 ? 's' : ''} on ${Object.keys(fm.nodes).length} nodes, held at ${fm.supports.map((x) => `${x.where} (${x.how}, ${x.why})`).join(', ')}, under its own weight${fm.carried.length ? `, ${new Set(fm.carried.map((c) => c.id)).size} item${new Set(fm.carried.map((c) => c.id)).size > 1 ? 's' : ''} mounted on it` : ''}${fm.loads.length ? ` and ${fm.loads.length} load${fm.loads.length > 1 ? 's' : ''}` : ''}${fm.onJoints.length ? `, with ${fm.onJoints.map((x) => `${n3(x.value, 3)} ${x.unit} on ${x.joint.id}${x.belt || x.motor ? ` (${x.note})` : ''}`).join(', ')} carried into ${[...new Set(fm.onJoints.map((x) => x.mount.beam.id))].join(', ')} through ${fm.onJoints.length > 1 ? 'their joints, each' : 'its joint,'} one way and then the other` : ''}${fm.stalls.length ? `, and ${[...new Map(fm.stalls.map((x) => [`${x.motor} ${x.joint.id}`, x])).values()].map((x) => `${x.motor} stalled against ${x.joint.id}'s stop at each end of its travel (${n3(x.value, 3)} ${x.unit} from its ${n3(x.hold, 3)} N m holding torque, on the stop and back on its mount on ${x.motorMount.beam.id})`).join(', ')}` : ''}, in ${fm.poses.length} pose${fm.poses.length > 1 ? 's' : ''}${fm.together.how ? ` (${fm.together.joints.join(', ')} each swept and then together: ${fm.together.how})` : ''}${fm.onJoints.length || fm.stalls.length ? ` (${fm.cases.length} cases)` : ''}; ${restsJoins}${estimates ? `, ${estimates} of them an estimate until the joint rig (issue 264) measures it, so each figure is given with the joins rigid too` : ''}${fm.riding.length ? `. ${fm.riding.map((x) => `${x.id} rides on ${x.joint}, its ${n3(x.kg, 3)} kg weighed on the frame${x.on.length > 1 ? `, shared as it lies: ${x.on.map((q) => `${n3(q.share * 100, 0)}% on ${q.beam}`).join(', ')}` : `, all of it on ${x.on[0].beam}, the beam its joint is on`}`).join('; ')}` : ''}${fm.webs.length ? `. ${fm.webs.map((w) => `${w.id} is a shear web on its bay, ${n3(w.k, 0)} N/mm along its diagonal (${w.clips} clips, their grip an estimate)`).join('; ')}` : ''}${fm.laid.length ? `. ${fm.laid.map((p) => `${p.id} lies on ${p.beams.join(', ')}, which are not joined round it as a bay: its ${n3(p.kg, 3)} kg is spread along them, and it is no shear web`).join('; ')}` : ''}${held.length ? `. Nothing holds it one way: ${heldSaid}, with nothing resisting. Its loads do not move it that way, so it is held there for the sag and the stresses; its modes and buckling count it free (frame.frequency, frame.buckling), and a push that way finds it free (frame.rack). Hold it with "frame": { "supports" } fixed or resting, or join it into a box` : ''}${fm.left.length ? `. Left out: ${fm.left.join(', ')} (not held by a support through joins)` : ''}${fm.off.length ? `. Not weighed on the frame, as the beam carrying it is left out: ${fm.off.map((x) => `${x.id} (on ${x.on})`).join(', ')}` : ''}${fm.loose.length ? `. Not on a beam, so not weighed on the frame: ${fm.loose.join(', ')}` : ''}${fm.unknown.length ? `. No mass known for ${fm.unknown.join(', ')}` : ''}${guess ? `. Its supports are guessed: nothing says where it is held (no feet, no "frame": { "supports" }), and on its lowest ends pinned, as a foot stands on a floor, nothing would hold it: ${guessSaid}. So it is solved with ${guessHeld}${pinnedGuess.length ? ` (${and(pinnedGuess)} pinned, a guess too)` : ''}, and every sag, rack, buckling and frequency figure rests on those ends held from turning, which nothing in the assembly gives. Give it feet, or say how it is held in "frame": { "supports" }` : guessedOnly ? `. Its supports are guessed: nothing says where it is held (no feet, no "frame": { "supports" }), so it stands on its lowest ends, ${and(pinnedGuess)}, pinned, as feet stand on a floor, and every figure rests on that. Give it feet, or say how it is held in "frame": { "supports" }` : ''}`, guessedOnly ? 'frame: supports guessed' : null,
    { code: 'frame.solve', values: { beams: fm.beams.size, nodes: Object.keys(fm.nodes).length, cases: fm.cases.length, poses: fm.poses.length, joins: fm.joins.length, estimates }, refs: { supports: fm.supports.map((x) => x.where), ...(guess ? { guessed: [...guess.supports.map((x) => x.where), ...pinnedGuess], free: guess.free, how: guessHow.map((h) => h.says) } : guessedOnly ? { guessed: pinnedGuess } : {}), left: fm.left, off: fm.off, onJoints: fm.onJoints.map((x) => ({ joint: x.joint.id, value: r3(x.value), unit: x.unit, beam: x.mount.beam.id, note: x.note })), stalls: fm.stalls.map((x) => ({ joint: x.joint.id, motor: x.motor, end: r3(x.end), value: r3(x.value), unit: x.unit, hold: r3(x.hold), stop: x.mount.beam.id, mount: x.motorMount.beam.id })), together: fm.together, held, ...(held.length ? { how: heldHow.map((h) => h.says) } : {}), laid: fm.laid.map((p) => ({ id: p.id, kg: r3(p.kg), beams: p.beams })), riding: fm.riding.map((x) => ({ ...x, kg: r3(x.kg) })), loose: fm.loose, rests } });

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
    const text = `${what} sags ${sagN(w.sag)} mm${fm.cases.length > 1 ? `, worst ${w.case.label}` : ''}, with the joins' springs; ${sagN(w.rigid)} mm with the joins rigid${alone ? ` (of these, ${sagN(alone.sag)} and ${sagN(alone.rigid)} mm from ${alone.what} alone)` : ''}. ${soft ? `The first rests on ${restsJoins}, so the true sag lies near it, and the rigid figure is the least it can be` : `It rests on ${restsJoins}`}: against ${n3(lim.value)} mm, ${lim.from}${level === 'fail' ? `: ${n3(w.sag / lim.value, 2)} times over. Stiffen the beam (a deeper profile), shorten its span, or stiffen its joins` : ''}`;
    f(level, text, level === 'fail' ? `${where}: sags ${n3(w.sag, 2)} mm` : null, { code: 'frame.deflection', at: r4(P), values: { sag: sagR(w.sag), rigid: sagR(w.rigid), limit: r3(lim.value), ...(alone ? { alone: sagR(alone.sag), aloneRigid: sagR(alone.rigid) } : {}) },
      refs: { beam: b.id, where, pose: w.case.label, limit: lim.from, rests, restsOn } });
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
    // kept for the error budget: the task's terms take the beam's sag along the guide from here (lib/task.mjs terms)
    (s.frameGuideSag ??= new Map()).set(g.id, { sag: sagR(w.sag), rigid: sagR(w.rigid), pose: w.case.label, restsOn, beam: g.beam.id });
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
    const drawn = results[0], fine = solveFrame(subdivide(fm.model, 4)), bk = fine.buckling({ loads: drawn.loads, count: 1 }), factor = bk.factors[0];
    const shape = bk.modes[0].shape, lead = Object.entries(shape).reduce((p, q) => (Math.hypot(...q[1].slice(0, 3)) > Math.hypot(...p[1].slice(0, 3)) ? q : p)), beam = lead[0].split(/[.@#/]/)[0];
    const listed = (ls) => [...ls.reduce((m, l) => m.set(l.node, [...(m.get(l.node) ?? []), l.freedom]), new Map())].map(([n, fr]) => `${n} (${fr.join(', ')})`).join(', ');
    if (bk.tipped) {
      // nothing holds the frame where it is free, and its loads as drawn lean it further that way: it tips over before anything buckles
      const how = howFree(fm, waysAt(fine, bk.tipped));
      f('fail', `the whole frame tips over under its load as drawn before anything buckles: nothing holds it one way, ${how.length ? howSaid(how) : `free at ${listed(bk.tipped)}`}, and its squeezed beams lean it further that way, ${beam} moving most. Its buckling factor is 0. Hold it with "frame": { "supports" } fixed, brace it out of its plane, or join it into a box`, 'frame tips over',
        { code: 'frame.buckling', at: r4(fm.nodes[lead[0]] ?? fm.nodes[Object.keys(fm.nodes)[0]]), values: { factor: 0 }, refs: { beam, restsOn, tipped: bk.tipped, how: how.map((h) => h.says) } });
    } else {
      const level = factor < 1 ? 'fail' : factor < margin ? 'warn' : 'pass', rests = bk.rests ?? [];
      f(level, `the whole frame, with the joins' springs, buckles first at ${rests.length ? 'no more than ' : ''}${n3(factor, 1)} times its load as drawn, ${beam} moving most: ${level === 'pass' ? 'far from it' : 'too near it: brace it, or a stiffer profile'} (rests on ${restsJoins})${rests.length ? `. Nothing holds it at ${listed(rests)}, where its loads pull it back as a hanging frame's do: the figure is with it held there, so the true one may be lower` : ''}`, level === 'pass' ? null : `frame buckles at ${n3(factor, 1)}×`,
        { code: 'frame.buckling', at: r4(fm.nodes[lead[0]] ?? fm.nodes[Object.keys(fm.nodes)[0]]), values: { factor: r3(factor) }, refs: { beam, restsOn, ...(rests.length ? { rests } : {}) } });
    }
  } catch (e) { if (e.code !== 'fea.frame.compression') f('info', `the frame's own buckling factor is not found: ${e.message}`, null, { code: 'frame.buckling' }); }
  try { rackCheck(s, fm, f, { restsJoins, restsOn }); } catch (e) { f('info', `the frame's racking is not found: ${e.message}`, null, { code: 'frame.rack' }); }
  try { frequencyCheck(s, fm, f, { restsJoins, restsOn, heldSaid }); } catch (e) { f('info', `the frame's modes are not found: ${e.message}`, null, { code: 'frame.frequency' }); }
  const ctx = { results, limitFor, sagAt, sagAlong, excitesOf, restsJoins, restsOn, margin };
  try { couponChecks(s, fm, f, ctx); } catch (e) { f('info', `the beam coupon's figures are not predicted: ${e.message}`, null, { code: 'beam.coupon' }); }
  if (s.a.frame?.printed != null) try { printableCheck(s, fm, f, ctx); } catch (e) { f('info', `which beams can be printed is not found: ${e.message}`, null, { code: 'beam.printable' }); }
  return { model: fm, results };
}

// the two directions across "down" a frame is racked in, each named by the world axis it is nearest
export function sideways(down) {
  const flat = (v) => sub(v, scale(down, dot(v, down))), x = flat([1, 0, 0]), e1 = Math.hypot(...x) > 0.5 ? unitv(x) : unitv(flat([0, 1, 0])), e2 = unitv(cross(down, e1));
  const name = (v) => { const k = [0, 1, 2].reduce((p, q) => (Math.abs(v[q]) > Math.abs(v[p]) ? q : p), 0); return `along ${'xyz'[k]}`; };
  return [e1, e2].map((v) => ({ dir: v, name: name(v) }));
}

// The panel a rack check tries in an open bay: a common sheet and thickness (both in SHEETS' stocked lists)
const RACK_PANEL = { sheet: 'acrylic', thickness: 3 };

/**
 * frame.rack: each way across, a side push at the frame's top shared among its top corners, the sway it causes and the
 * stiffness that is; then each change the order names (gussets at a bay's corners, one diagonal brace, a panel), in the
 * best bay that way alone and in every open bay that way, each solved, with its gain; the cheapest that brings the sway
 * under the limit advised.
 */
/**
 * How a frame is racked: the side push (frame.rack.load, else frame.push), the nodes at its top it is shared among (its
 * bays' top corners, else its highest nodes), its height above its supports, and the sway allowed (frame.rack.limit,
 * the task's accuracy, else its height over frame.sway). Null where it has no height to rack. frame.rack and the
 * sizing's racking limit both read it. @param {object} s a built assembly @param {object} fm frameModelOf's
 * @returns {{ F: number, loadFrom: string, top: string[], H: number, lim: { value: number, from: string } } | null}
 */
export function rackOf(s, fm) {
  const opts = s.a.frame?.rack ?? {}, F = opts.load != null ? s.num(opts.load) : FRAME_CHECK.push.value, down = fm.down, height = (n) => -dot(fm.nodes[n], down);
  const feet = fm.supports.map((sp) => fm.nodeAt(sp.beam, sp.z)).filter(Boolean);
  const pool = fm.bays.length ? [...new Set(fm.bays.flatMap((b) => b.corners))] : Object.keys(fm.nodes), topH = Math.max(...pool.map(height)), top = pool.filter((n) => height(n) > topH - 1);
  const H = topH - Math.min(...feet.map(height));
  if (!(H > 1) || !top.length) return null;
  const lim = opts.limit != null ? { value: s.num(opts.limit), from: 'the assembly\'s frame.rack.limit' } : s.task?.accuracy != null ? { value: s.task.accuracy, from: 'the task\'s accuracy' } : { value: H / FRAME_CHECK.sway.value, from: `its height, ${n3(H, 1)} mm, over ${FRAME_CHECK.sway.value} (frame.sway)` };
  return { F, loadFrom: opts.load != null ? 'frame.rack.load' : `frame.push, an estimate`, top, H, lim };
}

/** How a frame moves where nothing holds it, in words (see howFree): for the sizing's racking limit. @param {object} fm @param {object[]} ways frame().mechanisms */
export const freeSaid = (fm, ways) => howSaid(howFree(fm, ways));

function rackCheck(s, fm, f, { restsJoins, restsOn }) {
  const rk = rackOf(s, fm);
  if (!rk) return;
  const { F, top, H, lim, loadFrom } = rk, down = fm.down;
  const swayOf = (model, dir) => { const r = solveFrame(model).statics({ loads: top.map((n) => ({ node: n, force: scale(dir, F / top.length) })), gravity: [0, 0, 0] }); return top.reduce((t, n) => t + dot(r.displacements[n].slice(0, 3), dir), 0) / top.length; };
  const base = fm.model, els = base.elements;
  // the changes, each as the model's elements with it made
  const brace = (bay) => { const lightest = bay.beams.map((id) => fm.beams.get(id)).reduce((p, q) => (q.section.Iy < p.section.Iy ? q : p)); return [{ id: `brace ${bay.name}`, a: bay.corners[0], b: bay.corners[2], section: lightest.section, material: { E: lightest.E, G: lightest.G, density: 0 }, ends: { a: 'ball', b: 'ball' } }]; };
  const panel = (bay) => [webOf(bay, RACK_PANEL.sheet, RACK_PANEL.thickness, 0, bay.name).element];
  const gussetOn = (bays, list) => list.map((q) => {
    if (!q.ends || q.of == null) return q;
    let ends = q.ends;
    for (const x of fm.joins) {
      const bay = bays.find((b) => b.beams.includes(x.A.id) && b.beams.includes(x.B.id));
      if (!bay || x.A.id !== q.of) continue;
      const key = x.e === 'a' ? 'a' : 'b', mine = list.filter((e) => e.of === x.A.id), el = x.e === 'a' ? mine[0] : mine[mine.length - 1];
      if (el !== q || !ends[key] || typeof ends[key] !== 'object') continue;
      const axis = Math.abs(dot(bay.n, x.A.top)) > 0.7 ? 'rz' : 'ry', g = joinStiffness('gusset', x.A.m).bending;
      ends = { ...ends, [key]: { ...ends[key], [axis]: ends[key][axis] + g } };
    }
    return ends === q.ends ? q : { ...q, ends };
  });
  const made = (kind, bays) => ({ ...base, elements: kind === 'gusset' ? gussetOn(bays, els) : [...els, ...bays.flatMap(kind === 'brace' ? brace : panel)] });
  const what = { gusset: 'gussets at the corners of', brace: 'one diagonal brace in', panel: `a ${RACK_PANEL.thickness} mm ${RACK_PANEL.sheet} panel on` };
  for (const { dir, name } of sideways(down)) {
    let sway, rigid;
    try { sway = swayOf(base, dir); rigid = swayOf(fm.rigid, dir); } catch (e) {
      if (e.code !== 'fea.frame.mechanism' || !e.driven) throw e;
      // a frame free to move this way (one plane on pinned feet, pushed across it): the push finds nothing to hold it
      const at = e.loose.map((l) => `${l.node} (${l.freedom})`).join(', '), how = howFree(fm, waysAt(solveFrame(base), e.loose));
      f('warn', `racked ${name}: nothing holds the frame that way, ${how.length ? howSaid(how) : `free at ${at}`}, so ${n3(F, 1)} N pushed at the top (${loadFrom}) moves it with nothing resisting. Fix its feet ("frame": { "supports" } fixed), or join beams across it to make a bay that way and brace it`, `racks ${name}: nothing holds it`,
        { code: 'frame.rack', at: r4(fm.nodes[top[0]]), values: { load: r3(F), limit: r3(lim.value), height: r3(H) }, refs: { direction: name, dir: r4(dir), top, free: e.loose, how: how.map((h) => h.says), limit: lim.from, load: loadFrom, restsOn, advise: null } });
      continue;
    }
    const k = F / sway, k0 = F / rigid;
    const open = fm.bays.filter((b, i) => Math.abs(dot(b.n, down)) < 0.1 && Math.abs(dot(b.n, dir)) < 0.1 && !fm.sheets.some((p) => p.bay === i));
    const options = [];
    for (const kind of FRAME_CHECK.order.value) {
      if (!open.length) break;
      const one = open.map((b) => ({ bays: [b], sway: swayOf(made(kind, [b]), dir) })).reduce((p, q) => (q.sway < p.sway ? q : p));
      options.push({ kind, ...one, every: false });
      if (open.length > 1) options.push({ kind, bays: open, sway: swayOf(made(kind, open), dir), every: true });
    }
    for (const o of options) { o.stiffness = F / o.sway; o.gain = sway / o.sway; }
    // open bays that hold the push by their joins' bending alone: a brace in each makes it many times stiffer
    const braced = options.find((o) => o.kind === 'brace' && (o.every || open.length === 1)), loose = braced && braced.gain >= 10;
    const over = sway > lim.value, singles = options.filter((o) => !o.every), pick = options.filter((o) => !o.every).concat(options.filter((o) => o.every)).find((o) => o.sway <= lim.value);
    const say = (o) => `${o.every ? `${what[o.kind].replace(/^one /, 'a ')} each of ${o.bays.map((b) => b.name).join(', ')}` : `${what[o.kind]} ${o.bays[0].name}`}`;
    const text = `racked ${name}: ${n3(F, 1)} N pushed at the top (${loadFrom}) sways it ${n3(sway)} mm with the joins' springs, ${fig(k)} N/mm${loose ? ` (low: its open bays hold the push by their joins' bending alone)` : ''}; ${n3(rigid)} mm, ${fig(k0)} N/mm, with the joins rigid. It rests on ${restsJoins}: against ${n3(lim.value)} mm, ${lim.from}${over ? `, ${n3(sway / lim.value, 2)} times over` : ''}. ${open.length
      ? `Solved with each change: ${singles.map((o) => `${say(o)} makes it ${fig(o.stiffness)} N/mm (${n3(o.gain, 1)} times)`).join('; ')}${options.some((o) => o.every) ? `; in every open bay ${name} (${open.length}): ${options.filter((o) => o.every).map((o) => `${o.kind}s ${n3(o.gain, 1)} times`).join(', ')}` : ''}. ${over ? (pick ? `The cheapest that brings it under the limit: ${say(pick)}, ${n3(pick.sway)} mm` : 'None of these alone brings it under the limit: stiffer joins, a stiffer profile, or bracing and panels together') : 'It stands within the limit as it is'}`
      : `There is no open bay of four joined beams ${name} to brace${over ? ': join beams round the sides to make one, then brace it' : ''}`}`;
    f(over ? 'warn' : 'pass', text, over ? `racks ${name}: ${n3(sway, 2)} mm` : null, { code: 'frame.rack', at: r4(fm.nodes[top[0]]),
      values: { load: r3(F), sway: r3(sway), stiffness: r3(k), rigid: r3(rigid), rigidStiffness: r3(k0), limit: r3(lim.value), height: r3(H), options: options.map((o) => ({ kind: o.kind, bays: o.bays.map((b) => b.name), every: o.every, sway: r3(o.sway), stiffness: r3(o.stiffness), gain: r3(o.gain) })) },
      refs: { direction: name, dir: r4(dir), top, low: !!loose, limit: lim.from, load: loadFrom, restsOn, advise: over && pick ? { kind: pick.kind, bays: pick.bays.map((b) => b.name) } : null, panels: fm.webs.map((w) => ({ id: w.id, sheet: w.sheet, clips: w.clips, rests: w.rests })) } });
  }
}

/**
 * What the machine shakes its frame at: each stepper drive's full-step rate at its working speed, and the task's moves
 * (a move ramping in t seconds shakes the frame at about 1/t).
 * @param {object} s a built assembly
 * @returns {{ kind: 'step' | 'move', what: string, Hz: number, from: string }[]}
 */
export function excitesOf(s) {
  const excites = [];
  for (const d of s.motion.drives ?? []) if (d.model?.stepAngle) { const rpm = workingSpeed(d.model, d.spec, d.supply), at = (rpm / 60) * (360 / d.model.stepAngle); excites.push({ kind: 'step', what: `${d.id}'s full steps at ${n3(rpm, 1)} rpm`, Hz: at, from: d.spec.speed != null ? 'the motor item\'s speed' : `the working speed of a ${d.model.name}` }); }
  if (s.task?.speed) { const acc = s.task.accel ?? FRAME_CHECK.ramp.value, t = s.task.speed / acc; excites.push({ kind: 'move', what: `the task's moves, ramping to ${n3(s.task.speed, 1)} mm/s in ${n3(t, 3)} s`, Hz: 1 / t, from: s.task.accel != null ? 'the task\'s speed and accel' : 'the task\'s speed and frame.ramp' }); }
  return excites;
}

/**
 * frame.frequency: the frame's lowest modes in each pose, with its beams' own mass and every carried item's and load's
 * mass lumped where it is carried, against what the machine excites: each stepper's full-step rate at its working
 * speed (a mode near it rings while the motor runs at that speed), and the task's moves (a move ramping in t seconds
 * shakes the frame at about 1/t, and the lowest mode should stand twice that clear).
 */
function frequencyCheck(s, fm, f, { restsJoins, restsOn, heldSaid }) {
  const solveIn = (model, values, count) => solveFrame(subdivide({ ...model, masses: fm.nodeMasses(values) }, 4)).modes({ count });
  let worst = null;
  for (const c of fm.poses) { const r = solveIn(fm.model, c.values, 3); if (!worst || r.frequencies[0] < worst.r.frequencies[0]) worst = { c, r }; }
  const hz = worst.r.frequencies, low = hz[0], rigid = solveIn(fm.rigid, worst.c.values, 1).frequencies[0];
  const shape = worst.r.modes[0].shape, lead = Object.entries(shape).reduce((p, q) => (Math.hypot(...q[1].slice(0, 3)) > Math.hypot(...p[1].slice(0, 3)) ? q : p)), beam = lead[0].split(/[.@#/]/)[0];
  const carried = Object.values(fm.nodeMasses(worst.c.values)).reduce((t, x) => t + x, 0), own = [...fm.beams.values()].reduce((t, b) => t + b.grams / 1000, 0);
  const excites = excitesOf(s);
  const margin = FRAME_CHECK.margin.value, band = FRAME_CHECK.band.value;
  const moves = excites.filter((x) => x.kind === 'move'), steps = excites.filter((x) => x.kind === 'step');
  const need = moves.length ? Math.max(...moves.map((x) => x.Hz)) * margin : 0, near = steps.map((x) => ({ ...x, modes: [...new Set(hz.filter((h) => Math.abs(h - x.Hz) <= band * x.Hz).map((h) => n3(h, 1)))] })).filter((x) => x.modes.length);
  // a mode of 0 Hz is the frame moving where nothing holds it (fea's modes count a held freedom free): never a pass
  const free = worst.r.modes.filter((m) => m.free).length;
  const level0 = !excites.length ? 'info' : (moves.length && low < need / margin) ? 'fail' : (low < need || near.length) ? 'warn' : 'pass', level = free && (level0 === 'info' || level0 === 'pass') ? 'warn' : level0;
  const target = Math.max(need, ...near.map((x) => x.Hz * (1 + band)));
  const advice = free ? `. Hold it there with "frame": { "supports" } fixed, brace it, or join it into a box: then it has a mode to lift` : level === 'warn' || level === 'fail' ? `. To lift it to ${n3(target, 1)} Hz takes about ${n3((target / low) ** 2, 2)} times the stiffness where ${beam} moves (a deeper profile, a shorter span, stiffer joins or a brace), or as many times less mass moving with it` : '';
  const text = `the lowest mode is ${n3(low, 1)} Hz${free ? `: nothing holds the frame one way${heldSaid ? `, ${heldSaid}` : ''}, so it moves that way with nothing resisting${free > 1 ? ` (${free} such modes)` : ''}` : ''}${fm.poses.length > 1 ? `, worst ${worst.c.label}` : ''}, ${beam} moving most${fm.joins.length ? `, with the joins' springs; ${n3(rigid, 1)} Hz with the joins rigid` : ''}. Its next: ${hz.slice(1).map((h) => `${n3(h, 1)} Hz`).join(', ')}. With ${n3(own, 3)} kg of beams and ${n3(carried, 3)} kg carried, each item's mass at the node it is carried at (its rotary inertia left out); it rests on ${restsJoins}. ${excites.length
    ? `The machine excites: ${excites.map((x) => `${x.what}, ${n3(x.Hz, 1)} Hz`).join('; ')}. ${near.length ? `A mode within ${band * 100}% of ${near.map((x) => `${x.what} (the mode${x.modes.length > 1 ? 's' : ''} at ${x.modes.join(' and ')} Hz)`).join(', ')}: it rings while the motor runs at that speed` : ''}${near.length && moves.length ? '; ' : ''}${moves.length ? (low < need ? `under ${margin} times the moves' ${n3(need / margin, 1)} Hz` : `${n3(low / (need / margin), 1)} times over the moves' ${n3(need / margin, 1)} Hz, where ${margin} is wanted`) : ''}`
    : 'Nothing named excites it: no stepper drives a joint and the assembly has no task'}${advice}`;
  f(level, text.replace(/\. $/, ''), level === 'warn' || level === 'fail' ? `frame mode ${n3(low, 1)} Hz` : null, { code: 'frame.frequency', at: r4(fm.nodes[lead[0]] ?? fm.nodes[Object.keys(fm.nodes)[0]]),
    values: { Hz: r3(low), rigid: r3(rigid), modes: hz.map(r3), ...(free ? { free } : {}), beams: r3(own), carried: r3(carried), ...(excites.length ? { excites: excites.map((x) => ({ what: x.what, Hz: r3(x.Hz), kind: x.kind })) } : {}) },
    refs: { pose: worst.c.label, beam, restsOn, excites: excites.map((x) => ({ what: x.what, from: x.from })) } });
}

/**
 * The frame's lowest mode for a check view: the subdivided model's elements as drawn and as the mode moves them, its
 * largest movement shown as a tenth of the frame's size, in the pose where it is lowest. Never part of the model.
 * @param {object} s a built assembly @param {{ placeItems: Function, jointValues: Function, mul: Function }} helpers
 * @returns {{ Hz: number, pose: string, beam: string, lines: { id: string, a: number[], b: number[], da: number[], db: number[] }[], scale: number, label: string } | null}
 */
export function frameMode(s, helpers) {
  let fm;
  try { fm = frameModelOf(s, helpers); } catch { return null; }
  if (!fm || fm.empty) return null;
  try {
    let worst = null;
    for (const c of fm.poses) { const m = subdivide({ ...fm.model, masses: fm.nodeMasses(c.values) }, 4), r = solveFrame(m).modes({ count: 1 }); if (!worst || r.frequencies[0] < worst.r.frequencies[0]) worst = { c, r, m }; }
    const shape = worst.r.modes[0].shape, pts = Object.values(worst.m.nodes), size = Math.max(...[0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])))), k = size / 10;
    const move = (n) => scale((shape[n] ?? [0, 0, 0]).slice(0, 3), k);
    const lines = worst.m.elements.map((e) => ({ id: String(e.id), a: worst.m.nodes[e.a], b: worst.m.nodes[e.b], da: move(e.a), db: move(e.b) }));
    const lead = Object.entries(shape).reduce((p, q) => (Math.hypot(...q[1].slice(0, 3)) > Math.hypot(...p[1].slice(0, 3)) ? q : p)), beam = lead[0].split(/[.@#/]/)[0];
    const Hz = worst.r.frequencies[0];
    return { Hz, pose: worst.c.label, beam, lines, scale: k, label: `lowest mode ${n3(Hz, 1)} Hz${fm.poses.length > 1 ? `, ${worst.c.label}` : ''}, ${beam} moving most; its movement drawn as a tenth of the frame's size (scaled)` };
  } catch { return null; }
}

/**
 * The mode as an animated SVG: the frame swinging through the mode's shape and back, seen from the front (x across, z
 * up) or another side, the frame as drawn faint behind. @param {ReturnType<typeof frameMode>} md @param {{ view?: 'front' | 'side' | 'top', title?: string }} [o] @returns {string}
 */
export function frameModeSvg(md, o = {}) {
  const [i, j] = o.view === 'side' ? [1, 2] : o.view === 'top' ? [0, 1] : [0, 2], all = md.lines.flatMap((l) => [l.a, l.b, add(l.a, l.da), add(l.b, l.db), sub(l.a, l.da), sub(l.b, l.db)]);
  const lo = [Math.min(...all.map((p) => p[i])), Math.min(...all.map((p) => p[j]))], hi = [Math.max(...all.map((p) => p[i])), Math.max(...all.map((p) => p[j]))];
  const W = 640, pad = 40, k = (W - 2 * pad) / Math.max(hi[0] - lo[0], hi[1] - lo[1], 1), H = Math.ceil((hi[1] - lo[1]) * k + 2 * pad + 56);
  const X = (p) => (pad + (p[i] - lo[0]) * k).toFixed(1), Y = (p) => (H - 56 - pad - (p[j] - lo[1]) * k).toFixed(1), pts = (a, b) => `${X(a)},${Y(a)} ${X(b)},${Y(b)}`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // (from one extreme: a viewer that shows no animation shows the mode at its largest)
  const swing = (l) => [pts(add(l.a, l.da), add(l.b, l.db)), pts(l.a, l.b), pts(sub(l.a, l.da), sub(l.b, l.db)), pts(l.a, l.b), pts(add(l.a, l.da), add(l.b, l.db))].join(';');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
${md.lines.map((l) => `<polyline points="${pts(l.a, l.b)}" fill="none" stroke="#ddd" stroke-width="6" stroke-linecap="round"/>`).join('\n')}
${md.lines.map((l) => `<polyline points="${pts(add(l.a, l.da), add(l.b, l.db))}" fill="none" stroke="#2c6fbb" stroke-width="2" stroke-linecap="round"><animate attributeName="points" values="${swing(l)}" dur="1.6s" repeatCount="indefinite"/></polyline>`).join('\n')}
${o.title ? `<text x="${pad}" y="${H - 40}" font-size="13" font-weight="600">${esc(o.title)}</text>` : ''}
<text x="${pad}" y="${H - 23}" font-size="12">${esc(md.label)}</text>
<text x="${pad}" y="${H - 6}" font-size="11" fill="#666">grey: as drawn; blue: the mode, swinging (slowed down, scaled). A check view only, not the model</text>
</svg>`;
}

/**
 * The check view cad beams writes beside the sag: the frame's lowest mode, animated, from the front and the side, as
 * exports/<project>/<assembly>.frame-mode.svg, in the two views that hold its largest movement. Null where the frame is not solved.
 * @param {object} s a built assembly @returns {{ file: string, Hz: number, beam: string } | null}
 */
export function writeFrameMode(s) {
  const md = frameMode(s, { placeItems, jointValues, mul }), file = paths.exports(s.project, `${s.name}.frame-mode.svg`);
  if (fs.existsSync(file)) fs.rmSync(file);
  if (!md) return null;
  // the two views that hold the mode's largest movement, the one across the frame's larger extent first
  const move = [0, 1, 2].map((k) => md.lines.reduce((t, l) => t + Math.abs(l.da[k]) + Math.abs(l.db[k]), 0)), most = move.indexOf(Math.max(...move));
  const extent = [0, 1, 2].map((k) => Math.max(...md.lines.flatMap((l) => [l.a[k], l.b[k]])) - Math.min(...md.lines.flatMap((l) => [l.a[k], l.b[k]])));
  const VIEWS = { front: [0, 2], side: [1, 2], top: [0, 1] }, names = { front: 'from the front', side: 'from the side', top: 'from above' };
  const [v1, v2] = Object.keys(VIEWS).filter((v) => VIEWS[v].includes(most)).sort((p, q) => extent[VIEWS[q].find((k) => k !== most)] - extent[VIEWS[p].find((k) => k !== most)]);
  const front = frameModeSvg(md, { view: v1, title: `${s.a.title || s.name}, ${names[v1]}` }), side = frameModeSvg(md, { view: v2, title: names[v2] });
  const h = (t) => Number(/height="(\d+)"/.exec(t)[1]), inner = (t) => t.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${h(front) + h(side)}" viewBox="0 0 640 ${h(front) + h(side)}" font-family="system-ui, sans-serif">\n${inner(front)}\n<g transform="translate(0 ${h(front)})">${inner(side)}</g>\n</svg>\n`);
  return { file, Hz: md.Hz, beam: md.beam };
}

// every pose's solve, with the springs and rigid; and, as drawn, each load alone
function solveAll(fm) {
  let fs, fr, results;
  try { fs = solveFrame(fm.model); fr = solveFrame(fm.rigid); } catch (e) { return { error: e.message, code: e.code }; }
  try { results = solveCases(fm, fs, fr); } catch (e) { if (e.code !== 'fea.frame.mechanism') throw e; return { error: e.message, code: e.code }; }
  // each element's start along its beam, for sagAlong
  for (const r of results) for (const res of [r.spring, r.rigid]) for (const e of res.elements) if (e.of != null) { const b = fm.beams.get(e.of), el = fm.model.elements.find((q) => q.id === e.id); e._from = dot(sub(fm.nodes[el.a], b.A), b.u); }
  return { results, loose: fs.loose, mechanisms: fs.mechanisms };
}
function solveCases(fm, fs, fr) {
  const results = fm.cases.map((c) => {
    const loads = fm.nodeLoads(c.values, null, c.push, c.stall), spring = fs.statics({ loads }), rigid = fr.statics({ loads }), out = { case: c, loads, spring, rigid, values: c.values };
    { out.alone = new Map(); for (const l of fm.loads) { const ll = fm.nodeLoads(c.values, l), n = ll[0]?.node; if (!n) continue; out.alone.set(l, { sag: sagAt(fs.statics({ loads: ll, gravity: [0, 0, 0] }), n, fm.down), rigid: sagAt(fr.statics({ loads: ll, gravity: [0, 0, 0] }), n, fm.down) }); } }
    return out;
  });
  return results;
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

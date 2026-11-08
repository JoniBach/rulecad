// Motors for printed machines: a stepper, a DC gear motor, a servo or a brushless motor as its model (what it is and
// what it does, every figure with how far to trust it and where it comes from), a solid to place in an assembly, the
// negative a part subtracts to hold it (the mount) and the bore a gear takes for its shaft. performance() answers what
// an assembly asks: at this speed, through this ratio, what torque reaches the output?
//
// Every motor is one rule set in @rulecad/rules, so its numbers are open data and live there, not here. A motor is
// drawn with its mounting face at z = 0, its shaft on the z axis at the origin, pointing up +z. Units: mm, degrees,
// N m, rpm, kg.
import jscad from '@jscad/modeling';
import nema17 from '@rulecad/rules/nema17.json' with { type: 'json' };
import nema14 from '@rulecad/rules/nema14.json' with { type: 'json' };
import byj from '@rulecad/rules/28byj48.json' with { type: 'json' };
import n20 from '@rulecad/rules/n20.json' with { type: 'json' };
import sg90 from '@rulecad/rules/sg90.json' with { type: 'json' };
import mg90s from '@rulecad/rules/mg90s.json' with { type: 'json' };
import bldc2204 from '@rulecad/rules/bldc2204.json' with { type: 'json' };
import x1c from '@rulecad/rules/x1c.json' with { type: 'json' };
import m1_6 from '@rulecad/rules/m1_6.json' with { type: 'json' };
import m2 from '@rulecad/rules/m2.json' with { type: 'json' };
import m3 from '@rulecad/rules/m3.json' with { type: 'json' };
import m4 from '@rulecad/rules/m4.json' with { type: 'json' };

const { cuboid, cylinder, polygon } = jscad.primitives;
const { extrudeLinear } = jscad.extrusions;
const { translate } = jscad.transforms;
const booleans = { union: jscad.booleans.union, subtract: jscad.booleans.subtract };

const CATALOGUE = Object.fromEntries([nema17, nema14, byj, n20, sg90, mg90s, bldc2204].map((s) => [s.name, s]));
const SCREWS = { 'M1.6': m1_6, M2: m2, M3: m3, M4: m4 };
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = { ...Object.fromEntries(Object.keys(CATALOGUE).map((n) => [key(n), n])), byj48: '28byj48', '28byj': '28byj48', mg90: 'mg90s', '2204': 'bldc2204', gimbal2204: 'bldc2204', n20gearmotor: 'n20' };
for (const s of Object.values(CATALOGUE)) for (const v of Object.keys(s.variants || {})) ALIASES[key(v)] = s.name;

/**
 * The rules this package adds to the motors' own figures, each with what it comes from.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string }>}
 */
export const DEFAULTS = {
  running: { value: Math.SQRT1_2, unit: '× holding torque', rule: 'A stepper moving, against holding torque: holding has both phases at full current, and a driver moving it keeps the vector the size of one phase, 1/√2 of that', kind: 'spec' },
  supply: { value: 24, unit: 'V', rule: 'The stepper driver\'s supply, if you don\'t say: above the motor\'s rated volts, as a chopper drive needs, and what a printer\'s board runs at', kind: 'default' },
  fit: { value: 0.1, unit: 'mm', rule: 'Gap each side of a shaft in its bore, with the printed hole\'s shrinkage allowed for, so it slides on and no more', kind: 'estimate' },
  press: { value: -0.05, unit: 'mm', rule: 'Each side of a shaft in a press-fit bore: tight enough to hold, and a D flat does the driving', kind: 'estimate' },
  grip: { value: 1.5, unit: '× shaft diameter', rule: 'The shortest length of bore worth trusting to drive a gear', kind: 'community' }
};
const D = (k) => DEFAULTS[k].value;

const r3 = (x) => +x.toFixed(3);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const near = (a, b) => { // edits between two names, to suggest the nearest
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
function positive(what, k, v) { if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is a number above 0 (got ${shown(v)})`); return v; }
function isModel(what, m) { if (!m || m.kind !== 'motor') throw new Error(`${what}: give a motor's model (motorModel), not ${shown(m)}`); return m; }

/** @returns {string[]} the names of the motors in the catalogue */
export const motors = () => Object.keys(CATALOGUE);

/**
 * @typedef {{ value: number | string, unit?: string, kind: string, source: string, rule?: string }} Figure
 * @typedef {{ kind: 'motor', name: string, type: 'stepper' | 'dc' | 'servo' | 'brushless', figures: Record<string, Figure>,
 *   body: { shape: string, width: number, depth: number, length: number, top: number, corner: number, centre: number[] },
 *   boss: { diameter: number, height: number, top: number }, shaft: { diameter: number, length: number, flats: number, across: number, flatLength: number, base: number, tip: number },
 *   mount: { pattern: string, spacing: number, holes: number[][], thread: string | null, depth: number, diameter: number, ear: number, earThickness: number, tab: number, tabThickness: number, side: 1 | -1 },
 *   cable: { width: number, reach: number }, mass: number, ratio: number, stepAngle: number | null, range: number | null,
 *   anchors: Record<string, { origin: number[], axis: number[] }> }} Motor
 */

/**
 * A motor by name, from its rule set, or from a rule set of your own (for a motor not in the catalogue).
 * @param {string | { name?: string, rules: object }} which 'nema17', '28BYJ-48', a maker's part number listed as a
 *   variant ('17HS4401'), or your own rule set in the same names
 * @param {Record<string, number | string | Figure>} [change] a different or measured figure, by its rule's name:
 *   { body_length: 40 } or { holding_torque: { value: 0.38, kind: 'measured', source: 'hung a weight on an arm' } }
 * @returns {Motor}
 */
export function motorModel(which, change = {}) {
  const what = 'motorModel';
  let set = which, variant = null;
  if (typeof which === 'string') {
    const k = key(which), name = ALIASES[k];
    if (!name) {
      const guess = Object.keys(ALIASES).map((a) => [near(k, a), ALIASES[a]]).sort((a, b) => a[0] - b[0])[0];
      throw new Error(`${what}: no motor "${which}"${guess && guess[0] <= 3 ? ` (did you mean ${guess[1]}?)` : ''}. There are: ${motors().join(', ')}. For another motor, hand in a rule set of your own in the same names`);
    }
    set = CATALOGUE[name];
    variant = Object.entries(set.variants || {}).find(([v]) => key(v) === k)?.[1] ?? null;
  }
  if (!set || typeof set !== 'object' || !set.rules) throw new Error(`${what}: give a motor's name (${motors().join(', ')}) or a rule set, not ${shown(which)}`);
  const figures = Object.fromEntries(Object.entries(set.rules).map(([n, r]) => [n, { ...r }]));
  if (variant) for (const [n, value] of Object.entries(variant.values)) figures[n] = { ...figures[n], value, kind: variant.kind, source: variant.source };
  for (const [n, c] of Object.entries(change)) {
    if (!figures[n]) { const guess = Object.keys(figures).map((a) => [near(n, a), a]).sort((a, b) => a[0] - b[0])[0]; throw new Error(`${what}: ${set.name} has no figure "${n}"${guess[0] <= 3 ? ` (did you mean ${guess[1]}?)` : ''}`); }
    figures[n] = typeof c === 'object' && c ? { ...figures[n], ...c } : { ...figures[n], value: c, kind: 'given', source: 'given to motorModel' };
    if (figures[n].value == null) throw new Error(`${what}: ${n} needs a value (got ${shown(c)})`);
  }
  // A gear motor with another gearbox: torque goes up with the ratio and speed down, unless you've given them too
  if (change.ratio != null && set.rules.ratio && set.rules.stall_torque) {
    const k = figures.ratio.value / set.rules.ratio.value, from = `scaled from its ${set.rules.ratio.value}:1 gearbox`;
    if (change.stall_torque == null) figures.stall_torque = { ...figures.stall_torque, value: figures.stall_torque.value * k, kind: 'derived', source: from };
    if (change.no_load_speed == null) figures.no_load_speed = { ...figures.no_load_speed, value: figures.no_load_speed.value / k, kind: 'derived', source: from };
  }
  const v = (n, fallback) => figures[n]?.value ?? fallback;
  const type = v('type');
  if (!['stepper', 'dc', 'servo', 'brushless'].includes(type)) throw new Error(`${what}: ${set.name}: type is stepper, dc, servo or brushless (got ${shown(type)})`);
  const shape = v('body_shape'), round = shape === 'round', width = round ? v('body_diameter') : v('body_width'), depth = round || shape === 'square' ? width : v('body_depth', width);
  for (const [k, x] of [['the body\'s width', width], ['the body\'s depth', depth], ['the shaft\'s diameter', v('shaft_diameter')]]) positive(`${what}: ${set.name}`, k, x);
  const tab = v('mount_tab_length', 0), off = v('boss_offset', 0), centre = tab ? [-off, 0] : [0, -off];
  const top = v('body_top', 0), bossHeight = v('boss_height', 0), base = top ? top + bossHeight : 0, spacing = v('mount_hole_spacing', 0), pattern = v('mount_pattern');
  const holes = pattern === 'square' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [centre[0] + (a * spacing) / 2, centre[1] + (b * spacing) / 2]) : [[centre[0] - spacing / 2, centre[1]], [centre[0] + spacing / 2, centre[1]]];
  const shaftLength = v('shaft_length'), tip = base + shaftLength, shaftFlats = v('shaft_flats', 0);
  const m = {
    kind: 'motor', name: set.name, type, figures,
    body: { shape, width, depth, length: v('body_length'), top, corner: v('body_corner', 0), centre },
    boss: { diameter: v('boss_diameter', 0), height: bossHeight, top: top + bossHeight },
    shaft: { diameter: v('shaft_diameter'), length: shaftLength, flats: shaftFlats, across: v('shaft_flat_across', v('shaft_diameter')), flatLength: v('shaft_flat_length', 0), base, tip },
    mount: { pattern, spacing, holes, thread: v('mount_hole_thread', null), depth: v('mount_hole_depth', 0), diameter: v('mount_hole_diameter', 0), ear: v('mount_ear_radius', 0), earThickness: v('mount_ear_thickness', 0), tab, tabThickness: v('mount_tab_thickness', 0), side: type === 'servo' ? -1 : 1 },
    cable: { width: v('cable_width', 0), reach: v('cable_reach', 0) },
    mass: v('mass', 0), ratio: v('ratio', 1), stepAngle: null, range: v('range', null)
  };
  if (type === 'stepper') m.stepAngle = v('step_angle') / m.ratio;
  // Anchors an assembly places a motor by: the shaft where it leaves the motor, its tip, and the mounting face
  m.anchors = { face: { origin: [0, 0, 0], axis: [0, 0, 1] }, shaft: { origin: [0, 0, base], axis: [0, 0, 1] }, tip: { origin: [0, 0, tip], axis: [0, 0, 1] }, ...(type === 'servo' ? { horn: { origin: [0, 0, tip], axis: [0, 0, 1] } } : {}), ...Object.fromEntries(holes.map((h, i) => [`hole${i + 1}`, { origin: [h[0], h[1], 0], axis: [0, 0, 1] }])) };
  return m;
}

// ---------- shapes ----------
const extrude = (height, pts) => extrudeLinear({ height }, polygon({ points: pts }));
const SEG = 48;
const disc = (d, z0, z1, at = [0, 0]) => cylinder({ radius: d / 2, height: z1 - z0, center: [at[0], at[1], (z0 + z1) / 2], segments: SEG });
const box = (x0, x1, y0, y1, z0, z1) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
// A shaft's section with its flats: a circle less the part past each flat, as a closed outline. Two flats: opposite,
// across = the distance between; one flat (a D): across = the distance from the flat to the far side of the shaft
function dSection(d, flats, across) {
  const r = d / 2, y = flats === 2 ? across / 2 : across - r, a0 = Math.asin(y / r), n = 40, pts = [];
  if (flats === 2) {
    for (const [from, to] of [[-a0, a0], [Math.PI - a0, Math.PI + a0]]) for (let i = 0; i <= n; i++) { const t = from + ((to - from) * i) / n; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
    return pts;
  }
  for (let i = 0; i <= n * 2; i++) { const t = Math.PI - a0 + ((Math.PI + 2 * a0) * i) / (n * 2); pts.push([r * Math.cos(t), r * Math.sin(t)]); } // round the far side, from one end of the flat to the other
  return pts;
}

/**
 * The motor as a solid, to be seen in an assembly: its body, boss, shaft with its flat, and its tabs or ears. It is
 * bought, not printed.
 * @param {Motor} m @param {{ union: Function, subtract: Function }} [ops] the design's v.ops, so Manifold can read it
 * @returns {object} a JSCAD solid
 */
export function motor(m, ops = booleans) {
  isModel('motor', m);
  const { body, boss, shaft, mount: h } = m, [cx, cy] = body.centre, parts = [];
  const low = -body.length, high = body.top;
  if (body.shape === 'square') {
    const w = body.width / 2, c = body.corner;
    parts.push(translate([cx, cy, low], extrude(body.length, [[-w + c, -w], [w - c, -w], [w, -w + c], [w, w - c], [w - c, w], [-w + c, w], [-w, w - c], [-w, -w + c]])));
  } else if (body.shape === 'round') parts.push(disc(body.width, low || 0, high || 0, [cx, cy]));
  else parts.push(box(cx - body.width / 2, cx + body.width / 2, cy - body.depth / 2, cy + body.depth / 2, low, high));
  if (h.ear) for (const p of h.holes) parts.push(disc(2 * h.ear, -h.earThickness, 0, p));
  if (h.ear) parts.push(box(h.holes[0][0], h.holes[1][0], cy - h.ear, cy + h.ear, -h.earThickness, 0));
  if (h.tab) parts.push(box(cx - h.tab / 2, cx + h.tab / 2, cy - body.depth / 2, cy + body.depth / 2, 0, h.tabThickness));
  if (boss.height) parts.push(disc(boss.diameter, high, high + boss.height));
  let solid = ops.union(parts);
  if (m.type === 'brushless') solid = ops.subtract(solid, disc(shaft.diameter, low - 1, high + 1));
  else if (shaft.length) {
    const flatFrom = shaft.flats ? shaft.tip - shaft.flatLength : shaft.tip;
    solid = ops.union(solid, ...(flatFrom > shaft.base ? [disc(shaft.diameter, 0, flatFrom)] : []), ...(shaft.flats ? [translate([0, 0, Math.max(flatFrom, 0)], extrude(shaft.tip - Math.max(flatFrom, 0), dSection(shaft.diameter, shaft.flats, shaft.across)))] : []));
  }
  if (h.holes.length && (h.diameter || h.ear) && h.ear) solid = ops.subtract(solid, h.holes.map((p) => disc(h.diameter, -h.earThickness - 1, 1, p)));
  return solid;
}

// The printer's clearances, from its rule set, with a design's own printer laid over them
function printerOf(p) { return { fit: p?.fit ?? x1c.rules.fit.value, holeComp: p?.hole_comp ?? x1c.rules.hole_comp.value, layer: p?.layer ?? x1c.rules.layer.value, line: p?.line ?? x1c.rules.line.value }; }
function screwOf(thread) {
  const set = SCREWS[thread];
  return set ? { thread, clearance: set.rules.clearance.value, head: set.rules.head.value, headHeight: set.rules.head_height.value } : null;
}

/**
 * What a part needs to hold a motor, as numbers: the pocket, the holes, the screws. mount() cuts it.
 * @param {Motor} m
 * @param {{ plate: number, printer?: object, screw?: string, counterbore?: boolean, recess?: number }} p
 *   plate: the part's thickness at the mount (mm); printer: its fit, hole_comp, layer; screw: the screws going through
 *   a motor's plain holes (default the size they take); counterbore: sink the screw heads; recess: let the body into
 *   the part this far as well
 * @returns {{ plate: number, side: 1 | -1, pocket: number, pocketDepth: number, shaftHole: number, holes: { at: number[], diameter: number }[], screw: object | null, screwLength: number | null, head: number | null, recess: number, findings: object[] }}
 *   side: which side of the mounting face the plate is on, +1 above it (a motor's face against the part), -1 below it (a servo through it)
 */
export function mountModel(m, p) {
  const what = 'mount';
  isModel(what, m);
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the part's { plate } (its thickness at the mount, mm), not ${shown(p)}`);
  const plate = positive(what, 'plate', p.plate), pr = printerOf(p.printer), { mount: h, boss, shaft } = m, out = [], f = (level, text, code) => out.push({ level, text, code });
  const thread = h.thread ?? p.screw ?? (h.diameter >= 4 ? 'M4' : h.diameter >= 3 ? 'M3' : 'M2'), screw = screwOf(thread);
  if (!screw) throw new Error(`${what}: no screw "${thread}" (${Object.keys(SCREWS).join(', ')})`);
  const pocket = boss.diameter ? boss.diameter + 2 * pr.fit + pr.holeComp : 0, pocketDepth = boss.height ? boss.height + 2 * pr.layer : 0;
  const shaftHole = shaft.diameter + 2 * pr.fit + pr.holeComp + 0.4;
  const plain = !h.thread; // holes the screw only passes through, tapped by the screw or nutted
  const holeD = m.type === 'servo' ? h.diameter - 0.4 + pr.holeComp : screw.clearance + pr.holeComp;
  const head = p.counterbore ? screw.head + 2 * pr.fit + pr.holeComp : null;
  if (pocketDepth >= plate && m.mount.side === 1) f('fail', `the plate is ${plate} mm thick and the boss's pocket ${pocketDepth} mm deep: it needs to be thicker than that, or it's only a hole`, 'mount.plate');
  const thickest = h.thread ? h.depth : 0;
  // a screw's length: through the plate, into the thread, its head sunk or not
  const under = plate - (p.counterbore ? screw.headHeight : 0);
  const screwLength = h.thread ? Math.floor(under + Math.min(thickest, 2.5 * parseFloat(thread.slice(1)))) : Math.ceil(plate + (h.earThickness || h.tabThickness) + 2);
  if (m.mount.side === 1 && h.thread && under + thickest < screwLength) f('warn', `an ${thread} × ${screwLength} would bottom out in the motor's ${thickest} mm of thread`, 'mount.screw');
  if (plate < 1.5 * parseFloat(thread.slice(1))) f('warn', `a ${plate} mm plate is thin for ${thread} screws: at least ${1.5 * parseFloat(thread.slice(1))} mm, or the head pulls through`, 'mount.plate');
  return { plate, side: h.side, pocket: r3(pocket), pocketDepth: r3(pocketDepth), shaftHole: r3(shaftHole), holes: h.holes.map((at) => ({ at, diameter: r3(holeD) })), screw, screwLength, head, recess: p.recess ?? 0, printer: pr, findings: out };
}

/**
 * The negative a part subtracts to hold a motor. For most motors the plate sits on the mounting face, on the shaft's
 * side (z from 0 to plate); a servo's plate is under its tabs, with the body through a slot (z from -plate to 0). The
 * part goes where the motor's mounting face is.
 * @param {Motor} m @param {{ plate: number, printer?: object, screw?: string, counterbore?: boolean, recess?: number }} p as mountModel
 * @param {{ union: Function, subtract: Function }} [ops] the design's v.ops
 * @returns {object} a JSCAD solid to subtract
 */
export function mount(m, p, ops = booleans) {
  const g = mountModel(m, p), { plate, pocket, pocketDepth, shaftHole, holes, recess, printer: pr } = g, { body, mount: h } = m, [cx, cy] = body.centre, cuts = [], over = 0.5;
  if (m.type === 'servo') {
    // the body through a slot, with the fit all round; the screws' pilot holes in the plate
    cuts.push(box(cx - body.width / 2 - pr.fit, cx + body.width / 2 + pr.fit, cy - body.depth / 2 - pr.fit, cy + body.depth / 2 + pr.fit, -plate - over, over));
    for (const x of holes) cuts.push(disc(x.diameter, -plate - over, over, x.at));
    return ops.union(cuts);
  }
  if (pocket && pocketDepth) cuts.push(disc(pocket, -over, pocketDepth));
  cuts.push(disc(shaftHole, -over, plate + over));
  for (const x of holes) {
    cuts.push(disc(x.diameter, -over, plate + over, x.at));
    if (g.head) cuts.push(disc(g.head, plate - g.screw.headHeight, plate + over, x.at));
  }
  if (recess) {
    if (body.shape === 'round') cuts.push(disc(body.width + 2 * pr.fit + pr.holeComp, -recess - over, 0, [cx, cy]));
    else cuts.push(box(cx - body.width / 2 - pr.fit, cx + body.width / 2 + pr.fit, cy - body.depth / 2 - pr.fit, cy + body.depth / 2 + pr.fit, -recess - over, 0));
    if (m.cable.width) cuts.push(box(cx - m.cable.width / 2 - pr.fit, cx + m.cable.width / 2 + pr.fit, cy - (m.cable.reach || body.depth / 2 + 8), cy, -recess - over, 0));
  }
  return ops.union(cuts);
}

/**
 * A bore for the motor's shaft, as numbers, with what's wrong with it.
 * @param {Motor} m @param {{ depth: number, fit?: 'slide' | 'press', printer?: object }} p depth: how far the shaft goes in
 * @returns {{ depth: number, diameter: number, across: number, flats: number, flatFrom: number, grip: number, findings: object[] }}
 *   flatFrom: the height in the bore where the flat starts (the shaft's tip end is at depth); below it the bore is round, so the round root of the shaft can pass
 */
export function boreModel(m, p) {
  const what = 'bore'; isModel(what, m);
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the bore's { depth } in mm, not ${shown(p)}`);
  const depth = positive(what, 'depth', p.depth), fit = p.fit ?? 'slide';
  if (!['slide', 'press'].includes(fit)) throw new Error(`${what}: fit is slide or press (got ${shown(fit)})`);
  if (m.type === 'servo' || m.type === 'brushless') throw new Error(`${what}: a ${m.type}'s output is ${m.type === 'servo' ? 'a spline finer than a printer draws: drive it through its horn' : 'its bell: bolt to that'}, not a bore`);
  const pr = printerOf(p.printer), { shaft } = m, each = fit === 'slide' ? D('fit') : D('press'), diameter = shaft.diameter + 2 * each + pr.holeComp, flat = Math.min(depth, shaft.flatLength);
  const out = [], f = (level, text, code) => out.push({ level, text, code });
  if (depth > shaft.length) f('warn', `the bore is ${depth} mm deep and the shaft only ${shaft.length} mm long: the last ${+(depth - shaft.length).toFixed(2)} mm holds nothing`, 'bore.depth');
  const grip = Math.min(depth, shaft.length), want = D('grip') * shaft.diameter;
  if (grip < want) f('warn', `only ${+grip.toFixed(2)} mm of the shaft is in the bore: ${want} mm or more, or the part rocks on it`, 'bore.grip');
  if (shaft.flats && flat < 0.5 * want) f('warn', `only ${+flat.toFixed(2)} mm of bore meets the flat: it's the flat that turns the part`, 'bore.flat');
  if (!shaft.flats) f('warn', 'this shaft has no flat: only friction or a grub screw turns the part', 'bore.flat');
  return { depth, diameter: r3(diameter), across: r3(shaft.across + 2 * each + pr.holeComp), flats: shaft.flats, flatFrom: depth - flat, grip, fit, findings: out };
}

/**
 * The bore a gear or hub takes for the motor's shaft, to subtract: round where the round of the shaft passes, with
 * the flat where the flat is. The shaft goes in from z = 0, its tip going to z = depth.
 * @param {Motor} m @param {{ depth: number, fit?: 'slide' | 'press', printer?: object }} p as boreModel
 * @param {{ union: Function, subtract: Function }} [ops] @returns {object} a JSCAD solid to subtract
 */
export function bore(m, p, ops = booleans) {
  const b = boreModel(m, p), parts = [], over = 0.5;
  if (b.flatFrom > 0) parts.push(disc(b.diameter, -over, b.flatFrom + 0.001));
  if (b.flats) parts.push(translate([0, 0, b.flatFrom > 0 ? b.flatFrom : -over], extrude(b.depth - (b.flatFrom > 0 ? b.flatFrom : -over) + over, dSection(b.diameter, b.flats, b.across))));
  else parts.push(disc(b.diameter, -over, b.depth + over));
  return parts.length > 1 ? ops.union(parts) : parts[0];
}

/** A motor is bought, so a part list can't print one. @param {Motor} m @returns {{ level: 'fail', text: string, code: string }[]} */
export function printable(m) { isModel('printable', m); return [{ level: 'fail', text: `${m.name} is a motor: it's bought and fitted, not printed`, code: 'motor.printable' }]; }

// ---------- what it does ----------
const fig = (x, d = 3) => String(+x.toFixed(d));
// A figure's value, and note how far it is trusted
function used(m, names, rests) { return names.map((n) => { const f = m.figures[n]; if (f == null) throw new Error(`performance: ${m.name} has no ${n}: give it to motorModel`); rests.add(f.kind); return f.value; }); }

/**
 * The torque and speed at the output, at a speed, through a ratio: what an assembly asks of its motor.
 * @param {Motor} m
 * @param {{ speed?: number, ratio?: number, efficiency?: number, supply?: number, volts?: number }} [p] speed: the output's, rpm (default 0, standing still);
 *   ratio: of the gears after the motor, input turns per output turn (default 1); efficiency: of those gears, 0 to 1 (default 1); supply: a stepper's driver supply, volts
 * @returns {{ output: { torque: number, speed: number }, motor: { torque: number, speed: number }, limit: number, ratio: number, efficiency: number, rests: string[], how: string, findings: object[] }}
 *   limit: the fastest the output can go; rests: the kinds of figure the answer rests on
 */
export function performance(m, p = {}) {
  const what = 'performance'; isModel(what, m);
  const speed = p.speed ?? 0, ratio = p.ratio ?? 1, efficiency = p.efficiency ?? 1;
  if (!(isNum(speed) && speed >= 0)) throw new Error(`${what}: speed is the output's, in rpm, 0 or more (got ${shown(speed)})`);
  if (!(isNum(ratio) && ratio > 0)) throw new Error(`${what}: ratio is input turns per output turn, above 0 (got ${shown(ratio)})`);
  if (!(isNum(efficiency) && efficiency > 0 && efficiency <= 1)) throw new Error(`${what}: efficiency is from 0 to 1 (got ${shown(efficiency)})`);
  const n = speed * ratio, rests = new Set(), out = [], f = (level, text, code) => out.push({ level, text, code });
  let torque, limit, how;
  if (m.type === 'stepper' && m.figures.pull_in_torque) {
    // A geared stepper: its pull-in torque, up to the fastest it starts; figures are at its own output
    const [T, rate, step, gear] = used(m, ['pull_in_torque', 'step_rate', 'step_angle', 'ratio'], rests);
    const steps = (360 / step) * gear; limit = (rate / steps) * 60; torque = T;
    how = `pull-in torque, to its ${fig(limit, 2)} rpm`;
  } else if (m.type === 'stepper') {
    const [hold, L, I] = used(m, ['holding_torque', 'inductance', 'rated_current'], rests), [step] = used(m, ['step_angle'], rests), V = p.supply ?? p.volts ?? D('supply');
    positive(what, 'supply', V); rests.add(DEFAULTS.running.kind);
    // Flat until the windings can no longer reach full current in a step (corner speed), then constant power
    const fullSteps = 360 / step, corner = (60 * V) / (2 * (L / 1000) * I * fullSteps), T0 = hold * D('running');
    limit = 5 * corner; torque = n <= corner ? T0 : (T0 * corner) / n;
    how = `${fig(D('running'), 2)} of holding torque, flat to ${fig(corner, 0)} rpm at ${V} V, then falling as 1/speed (no curve for this motor: measure yours)`;
  } else if (m.type === 'dc') {
    const [stall, free] = used(m, ['stall_torque', 'no_load_speed'], rests);
    limit = free; torque = Math.max(0, stall * (1 - n / free));
    how = `the straight line from ${fig(stall)} N m stalled to ${fig(free, 0)} rpm free`;
  } else if (m.type === 'servo') {
    const [stall, s60, range] = used(m, ['stall_torque', 'speed_60', 'range'], rests);
    limit = (60 / s60) / 6; torque = stall; // deg per second to rpm
    how = `rated stall torque, within its ${range}° at up to ${fig(limit, 0)} rpm`;
  } else {
    const [kv, I, V] = used(m, ['kv', 'rated_current', 'rated_voltage'], rests);
    const kt = 60 / (2 * Math.PI * kv); limit = kv * V; torque = n <= limit ? kt * I : 0;
    how = `torque constant ${fig(kt, 4)} N m/A (60 / 2π Kv) at ${I} A`;
  }
  if (n > limit) f('fail', `${fig(speed, 2)} rpm at the output is ${fig(n, 1)} rpm at the motor, past its ${fig(limit, 1)} rpm: more ratio makes it worse, less helps`, 'motor.speed');
  const motorTorque = n > limit ? 0 : torque;
  return { output: { torque: motorTorque * ratio * efficiency, speed }, motor: { torque: motorTorque, speed: n }, limit: limit / ratio, ratio, efficiency, rests: [...rests], how, findings: out };
}

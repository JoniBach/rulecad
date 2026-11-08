// Gears for printed parts: involute spur gears, racks and internal (ring) gears drawn from their rules, each with its
// numbers (pitch, base, tip and root diameters, tooth thickness), how a pair meshes (centre distance, ratio, contact
// ratio, the phase that puts a tooth in a gap) and how it prints. The involute relations are the standard ones (ISO 53
// and ISO 21771; Dudley, Handbook of Practical Gear Design, 1984; KHK, Gear Technical Reference); the printing rules
// are the kit's own, from the printer's line and layer.
//
// Every gear is drawn flat: its axis along z, its first tooth on +x, its face on the bed at z = 0. A spur gear printed
// this way has its teeth in the layers, where the filament is strongest, and needs no supports. Units: mm, degrees.
import jscad from '@jscad/modeling';

const { extrudeFromSlices, slice } = jscad.extrusions;
const { mat4 } = jscad.maths;

const DEG = Math.PI / 180;
const inv = (a) => Math.tan(a) - a; // the involute function
const TAU = 2 * Math.PI;

/**
 * The defaults, each with the rule it comes from. Coefficients are times the module.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string }>}
 */
export const DEFAULTS = {
  pressureAngle: { value: 20, unit: 'deg', rule: 'The standard pressure angle (ISO 53): stronger teeth than 14.5°, and the one tables and cutters use', kind: 'spec' },
  addendum: { value: 1, unit: '× module', rule: 'Tooth height above the pitch circle (ISO 53 basic rack)', kind: 'spec' },
  dedendum: { value: 1.25, unit: '× module', rule: 'Depth below the pitch circle: the addendum and 0.25 module of clearance under the mate\'s tip (ISO 53)', kind: 'spec' },
  rootFillet: { value: 0.38, unit: '× module', rule: 'The root fillet of the ISO 53 profile A rack: a rounded root is where a tooth stops cracking', kind: 'spec' },
  tipRound: { value: 0.1, unit: '× module', rule: 'A tip a printer can draw: rounded about a quarter line at module 1, so no corner is left to the slicer', kind: 'estimate' },
  backlash: { value: 0.15, unit: 'mm', rule: 'Play between mating teeth, split between the two: FDM gear guides give 0.1 to 0.2 mm; measure it with the sampler plate', kind: 'estimate' },
  chamfer: { value: 0.3, unit: 'mm', rule: 'A chamfer round the bed face, so the first layer\'s squish (elephant\'s foot) doesn\'t widen the teeth there', kind: 'estimate' },
  module: { value: 0.8, unit: 'mm at a 0.4 mm nozzle', rule: 'The smallest module worth printing: twice the nozzle, so a tooth is three lines at the pitch circle', kind: 'estimate' },
};
const D = (k) => DEFAULTS[k].value;

// ---------- refusing what isn't a gear ----------

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
/** A size above 0, by name. */
function size(what, k, v) { if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is a size above 0 (got ${shown(v)})`); return v; }
function whole(what, k, v, least) { if (!(Number.isInteger(v) && v >= least)) throw new Error(`${what}: ${k} is a whole number of ${least} or more (got ${shown(v)})`); return v; }
function between(what, k, v, lo, hi, unit = '') { if (!(isNum(v) && v >= lo && v <= hi)) throw new Error(`${what}: ${k} is a number from ${lo} to ${hi}${unit} (got ${shown(v)})`); return v; }
function atLeast0(what, k, v) { if (!(isNum(v) && v >= 0)) throw new Error(`${what}: ${k} is 0 or more (got ${shown(v)})`); return v; }

// The parameters every gear shares, checked and with their defaults
function common(what, p) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the gear's parameters as an object ({ module, teeth, … }), not ${shown(p)}`);
  const module = size(what, 'module', p.module);
  const pressureAngle = between(what, 'pressureAngle', p.pressureAngle ?? D('pressureAngle'), 10, 35, '°');
  const shift = between(what, 'shift', p.shift ?? 0, -1, 1.5, ' (times the module)');
  const backlash = atLeast0(what, 'backlash', p.backlash ?? D('backlash'));
  const addendum = between(what, 'addendum', p.addendum ?? D('addendum'), 0.5, 1.5, ' (times the module)');
  const dedendum = between(what, 'dedendum', p.dedendum ?? D('dedendum'), addendum, 2, ' (times the module, at least the addendum)');
  const rootFillet = between(what, 'rootFillet', p.rootFillet ?? D('rootFillet'), 0, 0.6, ' (times the module)');
  const tipRound = between(what, 'tipRound', p.tipRound ?? D('tipRound'), 0, 0.4, ' (times the module)');
  // Helical teeth: the spur profile turned along the width by the helix angle (the module and pressure angle are the
  // transverse ones, in the gear's own plane, so a helical gear's centre distance is a spur gear's)
  const helix = between(what, 'helix', p.helix ?? 0, 0, 45, '°');
  if (p.hand != null && p.hand !== 'right' && p.hand !== 'left') throw new Error(`${what}: hand is "right" or "left" (got ${shown(p.hand)})`);
  if (p.herringbone != null && typeof p.herringbone !== 'boolean') throw new Error(`${what}: herringbone is true or false (got ${shown(p.herringbone)})`);
  if (p.herringbone && !helix) throw new Error(`${what}: a herringbone needs a helix angle (say helix: 30)`);
  return { module, pressureAngle, shift, backlash, addendum, dedendum, rootFillet, tipRound, helix, hand: p.hand ?? 'right', herringbone: !!p.herringbone };
}

// ---------- the numbers ----------

/** @typedef {{ module: number, teeth: number, pressureAngle?: number, shift?: number, backlash?: number, addendum?: number, dedendum?: number, rootFillet?: number, tipRound?: number }} GearSpec */
/**
 * @typedef {object} GearModel
 * @property {'external' | 'internal'} kind
 * @property {number} module @property {number} teeth @property {number} pressureAngle degrees @property {number} shift times the module
 * @property {number} backlash mm, this gear's share is half
 * @property {number} pitch pitch diameter, module × teeth @property {number} base base circle diameter @property {number} tip tip diameter
 * @property {number} root root diameter @property {number} thickness tooth thickness on the pitch circle (an arc, mm), less half the backlash
 * @property {number} circularPitch π × module @property {number} basePitch π × module × cos(pressure angle)
 * @property {number} topLand the tooth's width across its tip (mm) @property {number} rootThickness the tooth's width where it meets the root (mm)
 * @property {{ pressureAngle: number, addendum: number, dedendum: number, rootFillet: number, tipRound: number }} rack the basic rack it was drawn from
 */

// The half-angle a tooth (or, for an internal gear, a space) takes at radius ρ, from its thickness s on the pitch circle
// of radius r: s / 2r + inv α − inv φ, where cos φ = rb / ρ. Under the base circle the flank runs straight down.
const halfAt = (s, r, rb, rho) => s / (2 * r) + inv(Math.acos(rb / r)) - inv(Math.acos(rb / Math.max(rho, rb)));

/**
 * A spur gear's numbers: its circles, tooth thickness, and the limits it was checked against. Refuses a gear whose teeth
 * would be undercut (fewer than about 17 at 20°: give it a profile shift) or come to a point.
 * @param {GearSpec} p
 * @returns {GearModel}
 */
export function gearModel(p) {
  const what = 'gearModel', c = common(what, p), teeth = whole(what, 'teeth', p?.teeth, 6);
  const { module: m, pressureAngle, shift: x, backlash } = c, a = pressureAngle * DEG;
  // Undercut: the basic rack's tip line reaches under the base circle when z sin²α / 2 < addendum − x (a whisker of
  // slack, so 17 teeth at 20° pass, as tables have it)
  const need = c.addendum - (teeth * Math.sin(a) ** 2) / 2;
  if (x < need - 0.01) {
    throw new Error(`${what}: ${teeth} teeth at ${pressureAngle}° are undercut (the mate's tip would cut under the base circle, or the tooth be cut away there): give a profile shift of at least ${(Math.ceil(need * 100) / 100).toFixed(2)} (shift: ${(Math.ceil(need * 100) / 100).toFixed(2)}), or ${Math.ceil((2 * (c.addendum - x)) / Math.sin(a) ** 2 - 0.1)} teeth or more`);
  }
  const r = (m * teeth) / 2, rb = r * Math.cos(a), ra = r + m * (c.addendum + x), rf = r - m * (c.dedendum - x);
  const s = m * (Math.PI / 2 + 2 * x * Math.tan(a)) - backlash / 2;
  if (!(s > 0)) throw new Error(`${what}: a backlash of ${backlash} mm leaves no tooth (at most ${(2 * m * (Math.PI / 2 + 2 * x * Math.tan(a))).toFixed(2)} mm)`);
  const tipHalf = halfAt(s, r, rb, ra);
  if (!(tipHalf > 0)) throw new Error(`${what}: the teeth come to a point before the tip circle: less profile shift (${x} now), or a smaller addendum`);
  const rootHalf = halfAt(s, r, rb, Math.max(rf, rb));
  return {
    kind: 'external', module: m, teeth, pressureAngle, shift: x, backlash,
    helix: c.helix, hand: c.hand, herringbone: c.herringbone, thrust: c.herringbone ? 0 : Math.tan(c.helix * DEG),
    pitch: 2 * r, base: 2 * rb, tip: 2 * ra, root: 2 * rf, thickness: s,
    circularPitch: Math.PI * m, basePitch: Math.PI * m * Math.cos(a),
    topLand: 2 * ra * Math.sin(tipHalf), rootThickness: 2 * Math.max(rf, rb) * Math.sin(rootHalf),
    rack: { pressureAngle, addendum: c.addendum, dedendum: c.dedendum, rootFillet: c.rootFillet, tipRound: c.tipRound },
  };
}

/**
 * An internal (ring) gear's numbers: the teeth point inwards, tip circle inside the pitch circle. Its spaces are shaped
 * as an outer gear's teeth would be. `rim` is the ring's outer diameter (default: the root diameter and six modules).
 * @param {GearSpec & { rim?: number }} p
 * @returns {GearModel & { rim: number, space: number }}
 */
export function internalModel(p) {
  const what = 'internalModel', c = common(what, p), teeth = whole(what, 'teeth', p?.teeth, 12);
  const { module: m, pressureAngle, shift: x, backlash } = c, a = pressureAngle * DEG;
  const r = (m * teeth) / 2, rb = r * Math.cos(a), ra = r - m * (c.addendum - x), rf = r + m * (c.dedendum + x);
  // the space on the pitch circle: π m minus the tooth (m (π/2 − 2x tan α)), widened by this gear's half of the backlash
  const e = m * (Math.PI / 2 + 2 * x * Math.tan(a)) + backlash / 2, s = Math.PI * m - e;
  if (!(s > 0)) throw new Error(`${what}: a backlash of ${backlash} mm leaves no tooth`);
  const rim = p.rim ?? 2 * rf + 6 * m;
  if (!(isNum(rim) && rim > 2 * rf + 2 * m)) throw new Error(`${what}: rim is the ring's outer diameter, more than the root diameter and two modules (${(2 * rf + 2 * m).toFixed(2)} mm; got ${shown(p.rim)})`);
  // An internal tooth's width at a radius is the pitch angle less the space's
  const toothHalf = (rho) => Math.PI / teeth - halfAt(e, r, rb, rho);
  if (!(toothHalf(ra) > 0)) throw new Error(`${what}: the teeth come to a point at the tip circle: less profile shift`);
  return {
    kind: 'internal', module: m, teeth, pressureAngle, shift: x, backlash,
    helix: c.helix, hand: c.hand, herringbone: c.herringbone, thrust: c.herringbone ? 0 : Math.tan(c.helix * DEG),
    pitch: 2 * r, base: 2 * rb, tip: 2 * ra, root: 2 * rf, thickness: s, space: e, rim,
    circularPitch: Math.PI * m, basePitch: Math.PI * m * Math.cos(a),
    topLand: 2 * Math.max(ra, rb) * Math.sin(toothHalf(Math.max(ra, rb))), rootThickness: 2 * rf * Math.sin(toothHalf(rf)),
    rack: { pressureAngle, addendum: c.addendum, dedendum: c.dedendum, rootFillet: c.rootFillet, tipRound: c.tipRound },
  };
}

/**
 * A rack's numbers: a gear of infinite radius, its teeth straight-flanked at the pressure angle. Its pitch line is y = 0,
 * teeth up +y, the first space centred at x = 0. `height` is how much bar there is under the roots (default 3 modules).
 * @param {GearSpec & { height?: number }} p
 */
export function rackModel(p) {
  const what = 'rackModel', c = common(what, p), teeth = whole(what, 'teeth', p?.teeth, 1);
  const { module: m, pressureAngle, backlash } = c, a = pressureAngle * DEG;
  if (p.shift) throw new Error(`${what}: a rack has no profile shift (shift the pinion instead; got ${shown(p.shift)})`);
  const height = p.height === undefined ? 3 * m : size(what, 'height', p.height);
  const s = (Math.PI * m) / 2 - backlash / 2;
  if (!(s > 0)) throw new Error(`${what}: a backlash of ${backlash} mm leaves no tooth`);
  const tipHalf = s / 2 - m * c.addendum * Math.tan(a);
  if (!(tipHalf > 0)) throw new Error(`${what}: the teeth come to a point: a smaller addendum or pressure angle`);
  return {
    kind: 'rack', module: m, teeth, pressureAngle, shift: 0, backlash, height, thickness: s,
    helix: c.helix, hand: c.hand, herringbone: c.herringbone, thrust: c.herringbone ? 0 : Math.tan(c.helix * DEG),
    length: teeth * Math.PI * m, tipLine: m * c.addendum, rootLine: -m * c.dedendum,
    circularPitch: Math.PI * m, basePitch: Math.PI * m * Math.cos(a),
    topLand: 2 * tipHalf, rootThickness: s + 2 * m * c.dedendum * Math.tan(a),
    rack: { pressureAngle, addendum: c.addendum, dedendum: c.dedendum, rootFillet: c.rootFillet, tipRound: c.tipRound },
  };
}

// ---------- the outline ----------

// How many points each piece of a tooth gets. The same for every tooth and every slice of a solid, so slices loft
// point to point.
const N = { root: 3, fillet: 6, flank: 14, round: 4, tip: 3 };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// The nearest point of the flank to c: a scan, then a golden-section search round the best
function nearest(flank, q0, q1, c) {
  let best = q0, bd = Infinity;
  for (let i = 0; i <= 48; i++) { const q = q0 + ((q1 - q0) * i) / 48, d = dist(flank(q), c); if (d < bd) { bd = d; best = q; } }
  let lo = Math.max(q0, best - (q1 - q0) / 48), hi = Math.min(q1, best + (q1 - q0) / 48);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const a = hi - g * (hi - lo), b = lo + g * (hi - lo);
    if (dist(flank(a), c) < dist(flank(b), c)) hi = b; else lo = a;
  }
  const q = (lo + hi) / 2;
  return { q, d: dist(flank(q), c) };
}
// Points on an arc about c from a to b (the short way), n of them, a included and b not
function arc(c, a, b, n) {
  const r = dist(a, c), a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  let d = Math.atan2(b[1] - c[1], b[0] - c[0]) - a0;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return Array.from({ length: n }, (_, i) => { const t = a0 + (d * i) / n; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; });
}
// n points along a curve from q0 to q1, evenly spaced along its length, q0 included and q1 not
function along(curve, q0, q1, n) {
  const fine = Array.from({ length: 121 }, (_, i) => curve(q0 + ((q1 - q0) * i) / 120)), at = [0];
  for (let i = 1; i < fine.length; i++) at.push(at[i - 1] + dist(fine[i], fine[i - 1]));
  const total = at.at(-1), out = [];
  for (let k = 0, j = 0; k < n; k++) {
    const want = (total * k) / n;
    while (j < fine.length - 2 && at[j + 1] < want) j++;
    const f = (want - at[j]) / (at[j + 1] - at[j] || 1);
    out.push([fine[j][0] + f * (fine[j + 1][0] - fine[j][0]), fine[j][1] + f * (fine[j + 1][1] - fine[j][1])]);
  }
  return out;
}

// Half a tooth, from the middle of the space before it to the middle of its tip: the root, the fillet, the flank, the
// tip's round and the tip. The same for a gear (t an angle, levels radii) and a rack (t along x, levels heights).
// The fillet and the round are each a circle touching the flank and the root (or tip) circle; one that doesn't fit is
// made smaller until it does, and its size is reported.
function half(g) {
  const fit = (want, base, sign, tMid, tooth) => {
    // the circle's centre runs along a level ρ off the base circle (sign: outward from the root, inward from the tip)
    for (let rho = want, tries = 0; ; rho *= 0.8, tries++) {
      const level = base + sign * rho;
      if (rho < 1e-4 || tries > 40) return null;
      if (level <= g.rootLevel || level >= g.tipLevel) continue;
      const tFlank = g.flankT(level), lim = tooth ? tFlank + (tMid - tFlank) * 0.85 : tMid + (tFlank - tMid) * 0.05;
      const d = (t) => nearest(g.flank, g.q0, g.q1, g.point(t, level)).d;
      if (d(lim) < rho) continue; // no room: smaller
      let lo = tFlank, hi = lim; // d(lo) ≈ 0, d(hi) ≥ rho
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (d(mid) < rho) lo = mid; else hi = mid; }
      const c = g.point(hi, level), n = nearest(g.flank, g.q0, g.q1, c);
      return { rho, c, q: n.q, touch: g.flank(n.q), foot: g.point(hi, base), t: hi };
    }
  };
  const root = g.fillet > 0 ? fit(g.fillet, g.rootLevel, 1, g.t0, false) : null;
  const tip = g.round > 0 ? fit(g.round, g.tipLevel, -1, 0, true) : null;
  // without a fillet (or a round), the corner itself
  const rootQ = root ? root.q : g.q0, tipQ = tip ? tip.q : g.q1;
  const rootFoot = root ? root.foot : g.flank(g.q0), tipFoot = tip ? tip.foot : g.flank(g.q1);
  const rootT = root ? root.t : g.flankT(g.rootLevel), tipT = tip ? tip.t : g.flankT(g.tipLevel);
  const pts = [
    ...Array.from({ length: N.root }, (_, i) => g.point(g.t0 + ((rootT - g.t0) * i) / N.root, g.rootLevel)),
    ...(root ? arc(root.c, root.foot, root.touch, N.fillet) : Array(N.fillet).fill(rootFoot).map((p, i) => g.flank(g.q0 + ((rootQ - g.q0) * i) / N.fillet))),
    ...along(g.flank, rootQ, tipQ, N.flank),
    ...(tip ? arc(tip.c, tip.touch, tip.foot, N.round) : Array.from({ length: N.round }, (_, i) => g.flank(tipQ + ((g.q1 - tipQ) * i) / N.round))),
    ...Array.from({ length: N.tip }, (_, i) => g.point(tipT + ((0 - tipT) * i) / N.tip, g.tipLevel)),
  ];
  return { pts, fillet: root ? root.rho : 0, round: tip ? tip.rho : 0, wantFillet: g.fillet, wantRound: g.round };
}

// A gear's (or an internal gear's spaces') outline: one loop, counter-clockwise, tooth 0 on +x. grow moves it outwards
// by that much along its normal (an involute's offset is the same involute, thinner by grow / rb each side).
function loop({ teeth: z, thickness: s, r, rb, ra, rf, fillet, round, grow = 0 }) {
  s += (2 * grow * r) / rb; ra += grow; rf += grow;
  fillet = Math.max(1e-3, fillet - grow); round = Math.max(1e-3, round + grow);
  const hAt = (rho) => halfAt(s, r, rb, rho), rLow = rf, rHigh = ra;
  const flank = (rho) => { const h = hAt(rho); return [rho * Math.cos(h), -rho * Math.sin(h)]; };
  const h = half({
    t0: -Math.PI / z, rootLevel: rf, tipLevel: ra, q0: rLow, q1: rHigh, flank, fillet, round,
    flankT: (rho) => -hAt(rho), point: (t, rho) => [rho * Math.cos(t), rho * Math.sin(t)],
  });
  const tooth = [...h.pts, [ra, 0], ...h.pts.slice(1).reverse().map(([x, y]) => [x, -y])];
  const out = [];
  for (let k = 0; k < z; k++) {
    const c = Math.cos((TAU * k) / z), sn = Math.sin((TAU * k) / z);
    for (const [x, y] of tooth) out.push([x * c - y * sn, x * sn + y * c]);
  }
  return { points: out, fillet: h.fillet, round: h.round };
}

const circle = (d, n, grow = 0) => Array.from({ length: n }, (_, i) => [((d / 2 + grow) * Math.cos((TAU * i) / n)), ((d / 2 + grow) * Math.sin((TAU * i) / n))]);
// A bore: a circle, or with a flat (a D shape) the points past the flat brought onto it. grow: outwards, into the hole.
function bore(d, flat, grow = 0) {
  const pts = circle(d, 48, grow);
  if (!flat) return pts;
  const at = d / 2 - flat + grow;
  return pts.map(([x, y]) => (x > at ? [at, y] : [x, y]));
}
const reversed = (pts) => [...pts].reverse();

/**
 * A spur gear's outline in 2D, as loops of [x, y] points (the first the outside, counter-clockwise; then holes,
 * clockwise), and the fillet and round it was drawn with (smaller than asked where the asked one didn't fit).
 * @param {GearSpec & { bore?: number, flat?: number }} p
 * @param {number} [grow] outwards along the outline's normal, mm (negative: inwards)
 */
export function spurProfile(p, grow = 0) {
  const g = gearModel(p), r = g.pitch / 2, m = g.module;
  const l = loop({ teeth: g.teeth, thickness: g.thickness, r, rb: g.base / 2, ra: g.tip / 2, rf: g.root / 2, fillet: g.rack.rootFillet * m, round: g.rack.tipRound * m, grow });
  const loops = [l.points];
  if (p.bore != null) {
    size('spur', 'bore', p.bore);
    if (p.bore > g.root - 4 * m) throw new Error(`spur: a bore of ${p.bore} mm leaves under two modules of web under the teeth (at most ${(g.root - 4 * m).toFixed(2)} mm)`);
    if (p.flat != null && !(size('spur', 'flat', p.flat) < p.bore / 2)) throw new Error(`spur: flat is how deep the bore's flat cuts, under half the bore (got ${p.flat})`);
    loops.push(reversed(bore(p.bore, p.flat, -grow)));
  }
  return { loops, fillet: l.fillet, round: l.round, model: g };
}

/** An internal gear's outline: the rim (counter-clockwise), then the teeth's inner outline (clockwise). */
export function internalProfile(p, grow = 0) {
  const g = internalModel(p), r = g.pitch / 2, m = g.module;
  // the spaces, drawn as an outer gear's teeth: their "tips" are the ring's roots (the ring's root fillet there), their
  // "roots" the ring's tips (its round there). Growing the ring is shrinking the spaces.
  const l = loop({ teeth: g.teeth, thickness: g.space, r, rb: g.base / 2, ra: g.root / 2, rf: g.tip / 2, fillet: g.rack.tipRound * m, round: g.rack.rootFillet * m, grow: -grow });
  // the ring's tooth 0 on +x: the spaces' loop has a space on +x, so turn it half a pitch
  const c = Math.cos(Math.PI / g.teeth), s = Math.sin(Math.PI / g.teeth), turned = l.points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  return { loops: [circle(g.rim, 96, grow), reversed(turned)], fillet: l.round, round: l.fillet, model: g };
}

/** A rack's outline: one loop, counter-clockwise, its pitch line on y = 0, teeth up +y from x = 0. */
export function rackProfile(p, grow = 0) {
  const g = rackModel(p), m = g.module, a = g.pressureAngle * DEG, pitch = Math.PI * m;
  const s = g.thickness + (2 * grow) / Math.cos(a), yt = g.tipLine + grow, yr = g.rootLine + grow;
  const w = (y) => s / 2 - y * Math.tan(a); // half the tooth's width at height y
  const flank = (y) => [-w(y), y];
  const h = half({
    t0: -pitch / 2, rootLevel: yr, tipLevel: yt, q0: yr, q1: yt, flank,
    fillet: Math.max(1e-3, g.rack.rootFillet * m - grow), round: Math.max(1e-3, g.rack.tipRound * m + grow),
    flankT: (y) => -w(y), point: (t, y) => [t, y],
  });
  const tooth = [...h.pts, [0, yt], ...h.pts.slice(1).reverse().map(([x, y]) => [-x, y])];
  const top = [];
  for (let k = 0; k < g.teeth; k++) for (const [x, y] of tooth) top.push([x + (k + 0.5) * pitch, y]);
  top.push([g.length, yr]);
  const bottom = yr - g.height - grow;
  return { loops: [[[0, bottom], [g.length, bottom], ...reversed(top)]], fillet: h.fillet, round: h.round, model: g };
}

// ---------- solids ----------

// A solid from loops at heights: each slice is the loops at a height, grown (a chamfer: drawn smaller there) and turned
// (a helix), all with the same points, so the walls join point to point. Caps are triangulated with their holes.
function loft(profile, width, { chamfer, twist, slide }) {
  const [bottom, top] = Array.isArray(chamfer) ? chamfer : [chamfer, 0];
  if (bottom + top >= width) throw new Error(`the chamfers (${bottom} and ${top} mm) are as tall as the gear (${width} mm)`);
  // heights: the chamfers' ends, and for a twist enough between that no slice turns more than a degree or so
  const zs = [0, ...(bottom > 0 ? [bottom] : []), ...(top > 0 ? [width - top] : []), width];
  if (twist) {
    const most = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((f) => Math.abs(twist(width * f)))), n = Math.ceil(most / (1.5 * DEG));
    for (let i = 1; i < n; i++) zs.push((width * i) / n);
    zs.push(width / 2); // (a herringbone's apex)
  }
  if (slide) { const n = Math.ceil(width / 0.5); for (let i = 1; i < n; i++) zs.push((width * i) / n); zs.push(width / 2); }
  const heights = [...new Set(zs.map((z) => +z.toFixed(9)))].sort((x, y) => x - y);
  const slices = heights.map((z) => {
    const grow = z < bottom ? -(bottom - z) : z > width - top ? -(z - (width - top)) : 0;
    const loops = profile(grow), turn = twist ? twist(z) : 0, c = Math.cos(turn), s = Math.sin(turn), dx = slide ? slide(z) : 0;
    const at = (p) => [p[0] * c - p[1] * s + dx, p[0] * s + p[1] * c];
    const sides = loops.flatMap((pts) => pts.map((p, i) => [at(p), at(pts[(i + 1) % pts.length])]));
    return slice.transform(mat4.fromTranslation(mat4.create(), [0, 0, z]), slice.fromSides(sides));
  });
  return extrudeFromSlices({ numberOfSlices: slices.length, repair: false, callback: (t, i) => slices[i] }, slices[0]);
}

/** @typedef {{ width: number, chamfer?: number | [number, number], bore?: number, flat?: number }} Solid width up z; chamfer at the bed face (and the top); bore and flat for a shaft */

/**
 * A spur gear: the profile extruded up z, its first tooth on +x, the bed face chamfered.
 * @param {GearSpec & Solid} p
 * @returns {object} a JSCAD geom3
 */
export function spur(p) {
  const width = size('spur', 'width', p?.width), chamfer = chamfers('spur', p, width);
  const { model: g } = spurProfile(p); // (refuses here, before any slicing)
  return loft((grow) => spurProfile(p, grow).loops, width, { chamfer, twist: twistOf(g, width) });
}

// How far a helical gear's profile has turned at height z: z tan β / r, the right hand turning anticlockwise up z; a
// herringbone turns to the middle and back. Gears that mesh outside each other are of opposite hands; a pinion and its
// ring, or its rack, of the same hand.
function twistOf(g, width) {
  if (!g.helix) return null;
  const k = (g.hand === 'left' ? -1 : 1) * Math.tan(g.helix * DEG) / (g.pitch / 2);
  return g.herringbone ? (z) => k * Math.min(z, width - z) : (z) => k * z;
}

/** A helical gear: a spur gear's profile turned along its width by the helix angle. Meshes with one of the opposite hand. @param {GearSpec & Solid & { helix: number, hand?: 'right' | 'left' }} p */
export function helical(p) {
  if (!(p?.helix > 0)) throw new Error(`helical: give a helix angle above 0° (got ${shown(p?.helix)}); 15° to 30° print well`);
  return spur({ ...p, herringbone: false });
}

/** A herringbone gear: helical one way to the middle of its width and back, so it pushes no thrust along its axis and stays on its shaft. Prints with no supports. @param {GearSpec & Solid & { helix?: number }} p */
export function herringbone(p) { return spur({ ...p, helix: p?.helix ?? 30, herringbone: true }); }

/** An internal (ring) gear, its rim round it. @param {GearSpec & Solid & { rim?: number }} p */
export function internal(p) {
  const width = size('internal', 'width', p?.width), chamfer = chamfers('internal', p, width);
  const { model: g } = internalProfile(p);
  return loft((grow) => internalProfile(p, grow).loops, width, { chamfer, twist: twistOf(g, width) });
}

/** A rack along x, its teeth up +y, its width up z. @param {GearSpec & Solid & { height?: number }} p */
export function rack(p) {
  const width = size('rack', 'width', p?.width), chamfer = chamfers('rack', p, width);
  const { model: g } = rackProfile(p);
  // a helical rack's teeth slide along it with height as its pinion's turn: z tan β, the same hand as the pinion
  const k = g.helix ? (g.hand === 'left' ? -1 : 1) * Math.tan(g.helix * DEG) : 0;
  return loft((grow) => rackProfile(p, grow).loops, width, { chamfer, ...(k ? { slide: g.herringbone ? (z) => k * Math.min(z, width - z) : (z) => k * z } : {}) });
}

function chamfers(what, p, width) {
  const most = 0.25 * p.module, c = p.chamfer ?? Math.min(D('chamfer'), most), pair = Array.isArray(c) ? c : [c, 0]; // (the default: no more than the teeth can lose)
  if (pair.length !== 2 || !pair.every((x) => isNum(x) && x >= 0)) throw new Error(`${what}: chamfer is a size in mm (0 or more), or [bed face, top face] (got ${shown(c)})`);
  if (pair.some((x) => x > most)) throw new Error(`${what}: a chamfer over a quarter module (${most.toFixed(2)} mm) eats the tips: at most that`);
  if (pair[0] + pair[1] >= width) throw new Error(`${what}: the chamfers (${pair.join(' and ')} mm) are as tall as the gear (${width} mm)`);
  return pair;
}

// ---------- meshing ----------

// The working pressure angle of shifted gears: inv αw = inv α + 2 tan α (x1 ± x2) / (z1 ± z2), solved by Newton
function working(a, sum, zs) {
  const want = inv(a) + (2 * Math.tan(a) * sum) / zs;
  let w = a;
  for (let i = 0; i < 30; i++) w -= (inv(w) - want) / Math.tan(w) ** 2;
  return w;
}

/**
 * How two gears mesh: the centre distance they need (with their profile shifts), the ratio (turns of b for one of a,
 * negative when they turn opposite ways; for a rack, mm for one turn of the pinion), the contact ratio (how many teeth
 * share the load on average: under 1 the drive jumps, under 1.2 it is rough), and findings. Give `centre` (mm) to have
 * a centre distance checked: closer than needed jams the teeth, further adds backlash.
 * @param {GearModel} a @param {GearModel} b @param {{ centre?: number }} [o]
 */
export function mesh(a, b, { centre, width } = {}) {
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  for (const [k, g] of [['a', a], ['b', b]]) if (!g || !['external', 'internal', 'rack'].includes(g.kind)) throw new Error(`mesh: ${k} is a gear's model (gearModel, internalModel or rackModel), not ${shown(g)}`);
  if (a.kind !== 'external' && b.kind !== 'external') throw new Error(`mesh: a ${a.kind} and a ${b.kind} don't mesh: one of them is an outer gear`);
  if (b.kind === 'external' && a.kind !== 'external') return flip(mesh(b, a, { centre, width }));
  if (Math.abs(a.module - b.module) > 1e-9) f('fail', `modules differ (${a.module} and ${b.module} mm): teeth of different sizes don't mesh`, 'mesh.module');
  if (Math.abs(a.pressureAngle - b.pressureAngle) > 1e-9) f('fail', `pressure angles differ (${a.pressureAngle}° and ${b.pressureAngle}°): the flanks don't roll on each other`, 'mesh.pressure');
  const m = a.module, al = a.pressureAngle * DEG, pb = Math.PI * m * Math.cos(al);
  // Helical teeth: the same angle, opposite hands outside each other, the same hand on a ring or a rack
  const ha = a.helix ?? 0, hb = b.helix ?? 0;
  if (Math.abs(ha - hb) > 1e-9) f('fail', `helix angles differ (${ha}° and ${hb}°): the teeth cross each other`, 'mesh.helix');
  else if (ha > 0) {
    const same = b.kind !== 'external';
    if ((a.hand === b.hand) !== same) f('fail', `both are ${a.hand}-handed: ${same ? `a pinion and its ${b.kind === 'rack' ? 'rack' : 'ring'} are of the same hand` : 'outer gears that mesh are of opposite hands'}`, 'mesh.helix');
    if (!!a.herringbone !== !!b.herringbone) f('fail', 'a herringbone meshes only with a herringbone', 'mesh.helix');
  }
  const ra1 = a.tip / 2, rb1 = a.base / 2, r1 = a.pitch / 2;
  let need, ratio, contact, aw = al;
  if (b.kind === 'external') {
    aw = working(al, a.shift + b.shift, a.teeth + b.teeth);
    need = ((a.teeth + b.teeth) * m * Math.cos(al)) / (2 * Math.cos(aw));
    ratio = -a.teeth / b.teeth;
    contact = (Math.sqrt(ra1 ** 2 - rb1 ** 2) + Math.sqrt((b.tip / 2) ** 2 - (b.base / 2) ** 2) - need * Math.sin(aw)) / pb;
  } else if (b.kind === 'internal') {
    if (b.teeth <= a.teeth) throw new Error(`mesh: a ring of ${b.teeth} teeth can't hold a pinion of ${a.teeth}`);
    aw = working(al, b.shift - a.shift, b.teeth - a.teeth);
    need = ((b.teeth - a.teeth) * m * Math.cos(al)) / (2 * Math.cos(aw));
    ratio = a.teeth / b.teeth;
    const rb2 = b.base / 2, ra2 = Math.max(b.tip / 2, rb2); // (a ring's tip under its base circle doesn't roll)
    contact = (Math.sqrt(ra1 ** 2 - rb1 ** 2) - Math.sqrt(ra2 ** 2 - rb2 ** 2) + need * Math.sin(aw)) / pb;
    const gap = b.teeth - a.teeth;
    // Rule of thumb (KHK, Gear Technical Reference, internal gears): with full-depth 20° teeth and no shift, a ring
    // under about 10 teeth more than its pinion fouls it (involute or trochoid interference); 12 is the safe side
    if (gap < 10) f('fail', `the ring has ${gap} teeth more than its pinion: under 10, their tips foul each other (interference); more teeth on the ring, or fewer on the pinion`, 'mesh.interference', { gap });
    else if (gap < 12) f('warn', `the ring has ${gap} teeth more than its pinion: near the limit of 10 where tips foul; check it by contact`, 'mesh.interference', { gap });
  } else { // a rack
    need = r1 + a.shift * m; // the pinion's centre above the rack's pitch line
    ratio = Math.PI * a.pitch; // mm a turn
    contact = (Math.sqrt(ra1 ** 2 - rb1 ** 2) - r1 * Math.sin(al) + (m * (b.rack.addendum - a.shift)) / Math.sin(al)) / pb;
  }
  // the overlap ratio: how far a tooth's own twist carries the contact on across the width (εβ = b tan β / π m, each
  // half of a herringbone on its own)
  const overlap = ha > 0 && width !== undefined ? ((a.herringbone ? width / 2 : width) * Math.tan(ha * DEG)) / (Math.PI * m) : 0;
  if (overlap) contact += overlap;
  const sense = b.kind === 'rack' ? `${fmt(ratio)} mm of rack a turn (${fmt(ratio / 360, 4)} mm a degree)` : `${fmt(Math.abs(ratio), 4)} turns of the second for each turn of the first (${a.teeth}:${b.teeth}), ${ratio < 0 ? 'turning opposite ways' : 'the same way'}`;
  if (contact < 1) f('fail', `contact ratio ${fmt(contact)}: under 1, a pair of teeth lets go before the next takes up, and the drive jumps: more teeth, or a longer addendum`, 'mesh.contact', { contact });
  else if (contact < 1.2) f('warn', `contact ratio ${fmt(contact)}: under 1.2 the drive is rough, and a printed tooth's errors can make it jump`, 'mesh.contact', { contact });
  else f('pass', `contact ratio ${fmt(contact)}${overlap ? ` (${fmt(contact - overlap)} across the teeth and ${fmt(overlap)} along their twist)` : ''}: ${fmt(contact)} pairs of teeth share the load on average`, 'mesh.contact', { contact });
  let backlash = a.backlash / 2 + b.backlash / 2;
  if (centre !== undefined) {
    if (!isNum(centre)) throw new Error(`mesh: centre is a distance in mm (got ${shown(centre)})`);
    const off = centre - need;
    // further apart opens a gap along the line of action of 2 Δa sin αw, which is 2 Δa tan αw round the pitch circle
    const added = 2 * off * Math.tan(aw);
    backlash += added;
    if (off < -0.01) f('fail', `the axes are ${fmt(-off, 3)} mm closer than these gears need (${fmt(need, 3)} mm${b.kind === 'rack' ? ', centre to the rack\'s pitch line' : ''}): the teeth jam`, 'mesh.centre', { centre, need });
    else if (backlash > 0.4) f('warn', `the axes are ${fmt(off, 3)} mm further apart than these gears need (${fmt(need, 3)} mm): ${fmt(backlash, 2)} mm of backlash, loose enough to knock`, 'mesh.centre', { centre, need });
    else f('pass', `centre distance ${fmt(centre, 3)} mm, as they need${Math.abs(off) > 0.005 ? ` (${off > 0 ? '+' : ''}${fmt(off, 3)})` : ''}: ${fmt(backlash, 2)} mm of backlash`, 'mesh.centre', { centre, need });
  }
  const thrust = a.herringbone || !ha ? 0 : Math.tan(ha * DEG);
  return { kind: b.kind, centre: need, ratio, contact, overlap, thrust, pressureAngle: aw / DEG, backlash, text: sense, findings: out };
}
const flip = (r) => ({ ...r, ratio: r.kind === 'rack' ? r.ratio : 1 / r.ratio });
const fmt = (x, d = 2) => String(+x.toFixed(d));

/**
 * The phase that puts a tooth in a gap: b's angle is ratio × a's angle + phase. Both gears have their first tooth at
 * their own angle 0; `angle` is the direction from a's centre to b's, in degrees, in the frame both angles are measured in.
 * For a pinion in a ring, a is the pinion. Returns degrees, in [0, 360 / b's teeth).
 * @param {GearModel} a @param {GearModel} b @param {number} [angle]
 */
export function phase(a, b, angle = 0) {
  const z1 = a.teeth, z2 = b.teeth, beta = angle * DEG, pitch2 = TAU / z2;
  let p;
  if (a.kind === 'external' && b.kind === 'external') p = beta + Math.PI - Math.PI / z2 + (z1 / z2) * beta; // a tooth on the line meets a space
  else if (a.kind === 'external' && b.kind === 'internal') { const g = beta + Math.PI; p = g - Math.PI / z2 - (z1 / z2) * g; } // the pinion's tooth outward, along ring to pinion
  else throw new Error('phase: give an outer gear and an outer or ring gear (for a rack, rackPhase)');
  p = ((p % pitch2) + pitch2) % pitch2;
  return p / DEG;
}

/**
 * Where a rack must stand so the pinion's teeth fall in its spaces: the rack's travel is (π × pitch diameter / 360) ×
 * the pinion's angle + this, in mm. The rack lies along x with its pitch line on y = 0 and its first space at x = 0;
 * the pinion's centre is at x = `at`, above the rack, its first tooth pointing along +x at angle 0.
 * @param {GearModel} pinion @param {number} [at] @returns {number} mm, in [0, the circular pitch)
 */
export function rackPhase(pinion, at = 0) {
  const r = pinion.pitch / 2, p = Math.PI * pinion.module;
  // at angle −90° the pinion's first tooth points down at the rack, and must sit over a space (spaces at x = kp)
  const s = at - r * (Math.PI / 2);
  return ((s % p) + p) % p;
}

// ---------- printing ----------

/**
 * How a gear prints on a printer ({ line, layer, nozzle?, wall_min? }): the module against the nozzle, lines across a
 * tooth at its root and its tip, and the width in layers. Findings in the kit's shape, each placed on the first tooth.
 * @param {GearModel} g @param {{ line: number, layer: number, nozzle?: number, wall_min?: number }} printer @param {number} [width]
 */
export function printable(g, printer, width) {
  if (!g || !['external', 'internal', 'rack'].includes(g.kind)) throw new Error(`printable: give a gear's model (gearModel, internalModel or rackModel), not ${shown(g)}`);
  if (!printer || !(printer.line > 0) || !(printer.layer > 0)) throw new Error(`printable: the printer needs a line and a layer above 0 mm (got ${shown(printer)})`);
  const out = [], f = (level, text, code, at) => out.push({ level, text, code, ...(at ? { at } : {}) });
  const { line, layer } = printer, nozzle = printer.nozzle ?? line / 1.05, least = printer.wall_min ?? 2 * line;
  const tipAt = g.kind === 'rack' ? [0.5 * g.circularPitch, g.tipLine, 0] : [g.tip / 2, 0, 0];
  const rootAt = g.kind === 'rack' ? [0.5 * g.circularPitch, g.rootLine, 0] : [(g.kind === 'internal' ? g.root : Math.max(g.root, g.base)) / 2, 0, 0];
  const floor = 2 * nozzle;
  if (g.module < floor - 1e-9) f('fail', `module ${g.module} on a ${fmt(nozzle)} mm nozzle: under ${fmt(floor)} (twice the nozzle) a tooth is under three lines at its pitch circle and prints as a blob; module ${fmt(floor)} or more`, 'gear.module', tipAt);
  else f('pass', `module ${g.module}: ${fmt(g.thickness / line, 1)} lines across a tooth at its pitch circle`, 'gear.module');
  const rootLines = g.rootThickness / line;
  if (g.rootThickness < least - 1e-9) f('fail', `a tooth is ${fmt(g.rootThickness)} mm across at its root, under the thinnest wall (${fmt(least)} mm): a larger module`, 'gear.root', rootAt);
  else f('pass', `a tooth is ${fmt(g.rootThickness)} mm across at its root, ${fmt(rootLines, 1)} lines`, 'gear.root', rootAt);
  if (g.topLand < line) f('warn', `the tips are ${fmt(g.topLand)} mm across, under a line (${line} mm): they print as one bead, rounded off; fine for meshing, but don't count on the tip`, 'gear.tip', tipAt);
  if (g.helix > 0) {
    // the flank leans most at the tip: tan β_a = tan β × r_a / r
    const ra = g.kind === 'rack' ? 1 : g.tip / (g.kind === 'internal' ? g.root : g.pitch), lean = Math.atan(Math.tan(g.helix * DEG) * Math.max(1, ra)) / DEG;
    if (lean > 45) f('warn', `the teeth lean ${fmt(lean, 1)}° from upright at their tips: past 45° the flanks sag as they print; a smaller helix angle`, 'gear.helix', tipAt);
    else f('pass', `the teeth lean ${fmt(lean, 1)}° from upright at their tips: prints with no supports`, 'gear.helix');
    if (!g.herringbone) f('info', `a helix of ${g.helix}° pushes ${fmt(Math.tan(g.helix * DEG), 2)} N along the axis for each newton it drives: hold the gear on its shaft, or make it a herringbone`, 'gear.thrust');
  }
  if (width !== undefined) {
    const layers = width / layer;
    if (Math.abs(layers - Math.round(layers)) > 0.05) f('warn', `${width} mm wide is ${fmt(layers)} layers of ${layer} mm: a whole number prints as drawn`, 'gear.layers');
  }
  return out;
}

// Planetary gearboxes: the teeth for a ratio, laid out in phase
export { planetary, planetaryRatio } from './planetary.mjs';

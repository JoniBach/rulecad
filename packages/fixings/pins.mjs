// Pins: what holds two printed parts together with no thread. A snap pin, a printed peg split down its middle with a
// barb at its tip, clicks through a hole and holds; a plain pin, a bought steel dowel, a cut length of filament or a
// printed peg, is pressed into its hole (it grips) or slides in it (it turns, a hinge pin). Each is a model by name
// (pinModel: 'snap pin 4x6', 'dowel 3x12', 'filament pin 1.75x12', 'printed pin 4x10'), its hole's fit read from the
// printer's rules, its mass, what it carries in shear and what the printed hole takes in bearing, and for a snap pin
// the force to push it in and pull it out. pinHole is the hole to subtract, pin the pin's solid. snapPin, snapSocket and
// snapPinModel draw and size a snap pin from plain figures, as @rulecad/flexures has drawn them since 0.5 (it
// re-exports them from here). Units: mm, N, MPa, grams.
import jscad from '@jscad/modeling';
import { teardropHole } from '@rulecad/shapes';
import pinSet from '@rulecad/rules/pins.json' with { type: 'json' };
import { DEFAULTS, printerOf, rest, finding, positive, oneOf, isNum, shown, mm, r3 } from './model.mjs';
import { along, bore, lathe, LIGHT } from './draw.mjs';
import { directionOf, pointOf, optionsOf, said } from './holes.mjs';
import { materialOf, weakest } from './strength.mjs';

const { cuboid, cylinder } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const block = (x, y, z, size) => cuboid({ center: [x, y, z], size });
const n1 = (x) => +x.toFixed(1), n2 = (x) => +x.toFixed(2);
const PINS = pinSet.rules;

// ---------- a snap pin from plain figures (as @rulecad/flexures drew it) ----------
/**
 * A snap pin: a peg with a barbed, slotted head that pushes into a hole and clicks behind it, its two halves bending
 * inward as cantilevers on the way through. Printed standing up: the barb's lead is a cone and its back a 45°
 * chamfer by default, so nothing overhangs past the printer's limit; a square back (back 90) holds for good but
 * overhangs by the lip. The halves are modelled as snap hooks of the slot's length, the peg's half-thickness and
 * four fifths of its diameter wide (a half-round's worth), with the lip as the undercut.
 * @param {{ diameter: number, length: number, lip?: number, slot?: number, gap?: number, lead?: number, back?: number, head?: number }} p
 *   diameter: the peg's; length: the shaft below the barb; lip: the barb's overhang (default 0.4); slot: the split's
 *   length down from the tip (default 3 × diameter); gap: the split's width (default 1); lead: the tip cone's angle
 *   from the axis, degrees (default 45); back: the barb's back angle (default 45); head: a flange at the foot, its
 *   radius past the peg (default diameter / 2)
 * @param {{ union: Function, subtract: Function }} [ops] the booleans to build it with: a design's v.ops, so a design on
 *   Manifold gets a pin Manifold reads as a closed solid (JSCAD's own leave seams it can't)
 * @returns {object} a JSCAD geom3 standing on its foot at z = 0
 */
export function snapPin({ diameter: d, length: L, lip = 0.4, slot, gap = 1, lead = 45, back = 45, head }, ops = { union, subtract }) {
  const r = d / 2, s = slot ?? 3 * d, flange = head ?? r, seg = 48;
  const fall = back >= 90 ? 0 : lip / Math.tan((back * Math.PI) / 180), rise = (r + lip) / Math.tan((lead * Math.PI) / 180);
  const foot = cylinder({ radius: r + flange, height: 2, center: [0, 0, 1], segments: seg }), shaft = cylinder({ radius: r, height: L + fall + 0.01, center: [0, 0, 2 + (L + fall) / 2], segments: seg });
  const z0 = 2 + L, barbBack = jscad.primitives.cylinderElliptic({ height: Math.max(fall, 0.01), startRadius: [r, r], endRadius: [r + lip, r + lip], center: [0, 0, z0 + Math.max(fall, 0.01) / 2], segments: seg });
  const barbTip = jscad.primitives.cylinderElliptic({ height: rise, startRadius: [r + lip, r + lip], endRadius: [0.01, 0.01], center: [0, 0, z0 + fall + rise / 2], segments: seg });
  const split = block(0, 0, z0 + fall + rise - s / 2 + 1, [2 * (r + lip) + 2, gap, s + 2]);
  return ops.subtract(ops.union(foot, shaft, barbBack, barbTip), split);
}
/**
 * The socket for a snap pin: a block with a hole the peg's diameter plus the clearance, through it, so the barb
 * clicks out on the far side.
 * @param {{ diameter: number, depth: number, clearance?: number, wall?: number }} p depth: the block's thickness along
 *   the pin (the shaft's length, so the barb clears); clearance: round the peg, each side (default the X1C's
 *   snap_clearance, 0.2); wall: round the hole (default 3)
 * @returns {object} a JSCAD geom3
 */
export function snapSocket({ diameter: d, depth, clearance = printerOf('snapSocket').n('snap_clearance'), wall = 3 }) {
  const Ro = d / 2 + clearance + wall;
  return subtract(block(0, 0, depth / 2, [2 * Ro, 2 * Ro, depth]), cylinder({ radius: d / 2 + clearance, height: depth + 2, center: [0, 0, depth / 2], segments: 48 }));
}

// One half of a snap pin as a snap hook: a cantilever of length L, thickness t and width w, deflected by the undercut
// y on the way in. Stiffness E w t³ / 4L³ (3EI/L³); the strain at its root for a travel δ is 3tδ / 2L²; the force
// along the push over a face at α from the beam W = P (μ + tan α) / (1 − μ tan α), Infinity where the face is square
// or friction locks it (the BASF and Bayer snap-fit design guides).
function snapHalf({ length: L, thickness: t, width: w, undercut: y, lead, back }, { E, friction: mu = 0.3 }) {
  const stiffness = (E * w * t ** 3) / (4 * L ** 3), strain = (dd) => (3 * t * dd) / (2 * L * L), travel = (e) => (2 * L * L * e) / (3 * t);
  const P = stiffness * y, push = (deg) => { const tan = Math.tan((deg * Math.PI) / 180); return deg >= 90 || mu * tan >= 1 ? Infinity : (P * (mu + tan)) / (1 - mu * tan); };
  return { stiffness, strain, travel, stress: (dd) => E * strain(dd), force: P, insertion: push(lead), removal: push(back), holds: !Number.isFinite(push(back)), undercut: (e) => travel(e) };
}
const above = (what, k, v, unit = 'mm') => { if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is a number above 0${unit ? `, in ${unit}` : ''} (got ${shown(v)})`); return v; };
/**
 * A snap pin's forces: its two halves as snap hooks (snapHalf), together.
 * @param {{ diameter: number, lip?: number, slot?: number, gap?: number, lead?: number, back?: number }} p
 * @param {{ E: number, friction?: number }} m E: the plastic's modulus, MPa; friction: μ between barb and hole (default 0.3)
 * @returns {{ stiffness: number, strain: (travel: number) => number, travel: (strain: number) => number, stress: (travel: number) => number,
 *   force: number, insertion: number, removal: number, holds: boolean, undercut: (strain: number) => number }}
 *   force: to close the halves by the lip, N; insertion and removal: along the pin, N (removal Infinity where the
 *   barb's back is square: it holds); undercut: the most the halves may close at a strain
 */
export function snapPinModel({ diameter: d, lip = 0.4, slot, gap = 1, lead = 45, back = 45 }, m) {
  const what = 'snapPinModel';
  if (!(m && m.E > 0)) throw new Error(`${what}: the material needs a modulus E above 0 MPa (got ${m?.E})`);
  above(what, 'diameter', d); above(what, 'lip', lip);
  if (slot !== undefined) above(what, 'slot', slot);
  if (!(isNum(gap) && gap >= 0 && gap < d)) throw new Error(`${what}: gap is the split's width, 0 mm or more and narrower than the ${mm(d)} mm peg (got ${shown(gap)})`);
  const half = snapHalf({ length: slot ?? 3 * d, thickness: (d - gap) / 2, width: 0.8 * d, undercut: lip, lead, back }, m);
  return { ...half, stiffness: 2 * half.stiffness, force: 2 * half.force, insertion: 2 * half.insertion, removal: 2 * half.removal };
}

// ---------- pins by name ----------
/** The kinds of pin there are: a printed snap pin, a bought steel dowel, a cut length of filament, a printed plain pin. */
export const PIN_KINDS = ['snap', 'dowel', 'filament', 'printed'];
/** The fits a plain pin takes in its hole: press (it grips) and slip (it turns, a hinge pin). */
export const PIN_FITS = ['press', 'slip'];
/**
 * The grammar a pin's name is read by. parsePin reads it and nothing else does.
 * @type {string}
 */
export const PIN_GRAMMAR = [
  'pin      = kind diameter "x" length { word }        snap pin 4x6, dowel 3x12, filament pin 1.75x12, printed pin 4x10',
  'kind     = "snap pin" | "dowel" | "filament pin" | "printed pin"      ("pins" and "dowel pin" are read too)',
  'diameter = number                                    mm: the peg\'s, below a snap pin\'s barb',
  'length   = number [ "mm" ]                           mm: a snap pin\'s shaft from its foot to its barb; a plain pin\'s whole length',
  'word     = "barb" number                             a snap pin\'s barb past its peg (default 0.4)',
  '         | "ISO 8734" | "ISO 2338"                   a dowel\'s standard: hardened and ground (the default), or unhardened'
].join('\n');
const KIND_WORDS = [[/^snap\s*pins?$/i, 'snap'], [/^dowel(?:\s*pins?)?s?$/i, 'dowel'], [/^filament(?:\s*pins?)?$/i, 'filament'], [/^printed\s*pins?$/i, 'printed']];
const STANDARDS = { 'iso 8734': 'ISO 8734', 'iso 2338': 'ISO 2338' };

/**
 * A pin's name read by the grammar.
 * @param {string} name 'snap pin 4x6', 'snap pin 2.5x4 barb 0.3', 'dowel 3x12', 'dowel 3x12 ISO 2338', 'filament pin 1.75x12', 'printed pin 4x10'
 * @returns {{ kind: 'snap' | 'dowel' | 'filament' | 'printed', diameter: number, length: number, barb: number | null, standard: string | null }}
 */
export function parsePin(name) {
  const what = 'pin name', help = 'A pin is its kind, then diameter x length in mm: \'snap pin 4x6\', \'dowel 3x12\', \'filament pin 1.75x12\', \'printed pin 4x10\'';
  if (typeof name !== 'string' || !name.trim()) throw new Error(`${what}: give a name, not ${shown(name)}. ${help}`);
  const t = /^\s*([a-z][a-z\s]*?)\s+(\d*\.?\d+)\s*[x×*]\s*(\d*\.?\d+)\s*(?:mm\b)?(.*)$/i.exec(name);
  const kind = t && KIND_WORDS.find(([re]) => re.test(t[1].trim()))?.[1];
  if (!t || !kind) throw new Error(`${what}: "${name}" is no pin. ${help}`);
  const diameter = Number(t[2]), length = Number(t[3]);
  if (!(diameter > 0 && length > 0)) throw new Error(`${what}: "${name}": a pin's diameter and length are above 0 mm`);
  let rest_ = t[4].trim().toLowerCase(), barb = null, standard = null;
  const b = /\bbarb\s+(\d*\.?\d+)\s*(?:mm\b)?/.exec(rest_);
  if (b) { if (kind !== 'snap') throw new Error(`${what}: "${name}": only a snap pin has a barb`); barb = Number(b[1]); if (!(barb > 0)) throw new Error(`${what}: "${name}": a barb is above 0 mm`); rest_ = rest_.replace(b[0], ' '); }
  const s = /\biso\s*(8734|2338)\b/.exec(rest_);
  if (s) { if (kind !== 'dowel') throw new Error(`${what}: "${name}": only a dowel is bought to a standard`); standard = STANDARDS[`iso ${s[1]}`]; rest_ = rest_.replace(s[0], ' '); }
  const left = rest_.split(/[\s,]+/).filter((w) => w && w !== 'pin' && w !== 'pins');
  if (left.length) throw new Error(`${what}: "${name}": nothing is called "${left.join(' ')}". After the size come only "barb 0.4" (a snap pin) or "ISO 8734" / "ISO 2338" (a dowel)`);
  return { kind, diameter, length, barb, standard: kind === 'dowel' ? standard ?? 'ISO 8734' : null };
}
/** Whether a text is a pin's name, by the grammar. @param {unknown} name @returns {boolean} */
export const isPinName = (name) => { try { parsePin(/** @type {string} */ (name)); return true; } catch { return false; } };
/** A pin's name in its one spelling. */
const pinName = (p) => `${p.kind === 'snap' ? 'snap pin' : p.kind === 'dowel' ? 'dowel' : `${p.kind} pin`} ${mm(p.diameter)}x${mm(p.length)}${p.barb != null && p.barb !== 0.4 ? ` barb ${mm(p.barb)}` : ''}${p.standard && p.standard !== 'ISO 8734' ? ` ${p.standard}` : ''}`;
const pinRest = (k) => rest(`pins.${k}`, PINS[k]);
const nearest = (list, x) => { const below = list.filter((v) => v < x).at(-1), over = list.find((v) => v > x); return [below, over].filter((v) => v != null); };

/**
 * @typedef {{ kind: 'pin', type: 'snap' | 'dowel' | 'filament' | 'printed', name: string, said: string, diameter: number, length: number,
 *   made: 'bought' | 'cut' | 'printed', standard: string | null, fit: 'snap' | 'press' | 'slip', material: string, pinMaterial: string,
 *   hole: { diameter: number, nominal: number, comp: number, clearance: number, into: string, axis: 'x' | 'y' | 'z', teardrop: boolean, rules: string[] },
 *   snap: { lip: number, slot: number, gap: number, lead: number, back: number, head: number, insertion: number, removal: number, force: number, strain: number, holds: boolean } | null,
 *   grams: number, shear: number, bearing: number, pull: number | null, load: number | null, margin: number | null, governs: string | null,
 *   thickness: number | null, rests: object[], findings: object[] }} Pin
 *   diameter, length: the pin's (a snap pin's length is its shaft, foot to barb); made: bought (a dowel), cut (filament) or printed;
 *   fit: how it sits in its hole; material: the part's plastic, which the pin bears on; pinMaterial: the pin's own;
 *   hole: what to draw for it (diameter as drawn; nominal: the pin's; comp: hole compensation added; clearance: added
 *   across past that, less than 0 for a press); snap: a snap pin's figures and forces (insertion and removal along the
 *   pin, N; force: to close the halves; strain: at the halves' roots, closed by the barb); shear: what the pin carries
 *   across its shear planes, N; bearing: what the printed hole takes before it crushes, N; pull: what a snap pin holds
 *   along its axis, N; load and margin: the load given (across the pin, N) and the least of shear, bearing and pull over it
 */

/**
 * A pin as a model by name: its hole's fit from the printer's rules, its mass, what it carries, and for a snap pin the
 * force to push it in and pull it out. Refused by name where it does not fit its part: a plain pin longer than the
 * thickness it goes in stands proud; a snap pin's shaft shorter than the thickness never lets its barb out, and one
 * more than fixings.snap_play longer rattles.
 * @param {string | Pin} p a pin's name (see PIN_GRAMMAR) or its model
 * @param {{ fit?: 'press' | 'slip', printer?: object, material?: string | object, pinMaterial?: string | object, load?: number, pull?: number,
 *   thickness?: number, grip?: number, planes?: number, axis?: 'x' | 'y' | 'z', into?: string, anyLength?: boolean, sets?: object,
 *   slot?: number, gap?: number, lead?: number, back?: number, head?: number, friction?: number }} [o]
 *   fit: a plain pin's, press (the default) or slip; printer: the printer's rule set or values (default the X1C);
 *   material: the part's plastic (default PLA); pinMaterial: a printed or filament pin's (default the part's);
 *   load: across the pin, N, which its shear and the hole's bearing are held to with fixings.load_margin; pull: along a
 *   snap pin, N; thickness: what the pin goes through or into, along it, mm; grip: the shortest length of pin in one
 *   part, which bears the load (default half the thickness, or of the length); planes: shear planes (default 1, two
 *   parts); axis or into: the hole's way (a hole lying on its side is a teardrop); anyLength: a dowel length the sold
 *   list does not have; slot, gap, lead, back, head, friction: a snap pin's, as snapPin and snapPinModel take them
 * @returns {Pin}
 */
export function pinModel(p, o = {}) {
  const what = 'pinModel';
  optionsOf(what, o, '{ fit: \'press\', load: 20 }');
  if (p && typeof p === 'object' && p.kind === 'pin') return p;
  const n = parsePin(p), pr = printerOf(what, o.printer), dir = directionOf(what, o, '-z'), out = [], rests = [];
  const mat = materialOf(what, o.material ?? 'pla', o.sets), pinMat = n.kind === 'dowel' ? null : materialOf(what, o.pinMaterial ?? o.material ?? 'pla', o.sets);
  const { f: weak } = weakest(mat), d = n.diameter, L = n.length;
  // The pin itself: a dowel held to what is sold, filament to its own diameter, a printed pin to what prints
  if (n.kind === 'dowel') {
    const ds = PINS.dowel_diameters.value, ls = PINS.dowel_lengths.value;
    if (!ds.includes(d)) throw new Error(`${what}: no ${n.standard} dowel is ${mm(d)} mm across: the nearest ${nearest(ds, d).length > 1 ? 'are' : 'is'} ${nearest(ds, d).map(mm).join(' and ')} mm (pins.dowel_diameters: ${ds.map(mm).join(', ')})`);
    if (!ls.includes(L) && !o.anyLength) throw new Error(`${what}: a dowel is not sold ${mm(L)} mm long: the nearest ${nearest(ls, L).length > 1 ? 'are' : 'is'} ${nearest(ls, L).map(mm).join(' and ')} mm (pins.dowel_lengths). For a length you know you can buy, pass { anyLength: true }`);
    rests.push(pinRest('dowel_diameters'), pinRest('dowel_lengths'), pinRest('dowel_tolerance'));
  } else if (n.kind === 'filament') {
    if (d !== PINS.filament_diameter.value) throw new Error(`${what}: a filament pin is the printer's filament, ${mm(PINS.filament_diameter.value)} mm across (pins.filament_diameter), not ${mm(d)} mm: for a thicker peg, name a printed pin or a dowel`);
    rests.push(pinRest('filament_diameter'), pinRest('filament_tolerance'));
  } else if (d < DEFAULTS.pin_least.value) throw new Error(`${what}: a ${n.kind === 'snap' ? 'snap' : 'printed'} pin ${mm(d)} mm across is under fixings.pin_least, ${mm(DEFAULTS.pin_least.value)} mm: thinner, it is a few lines of plastic and breaks as it goes in. Use filament or a dowel`);
  if (n.kind === 'snap' && o.fit != null) throw new Error(`${what}: a snap pin's fit is its socket's (x1c.snap_clearance): give fit only for a plain pin`);
  const fit = n.kind === 'snap' ? 'snap' : oneOf(what, 'fit', o.fit ?? 'press', PIN_FITS);

  // The hole: a snap pin's socket is drawn as it is (the peg plus snap_clearance each side); a plain pin's is the pin,
  // plus the hole compensation a printed hole needs, less pin_press or plus pin_slip
  let hole;
  if (n.kind === 'snap') {
    const c = pr.n('snap_clearance'); rests.push(pr.rest('snap_clearance'));
    hole = { diameter: r3(d + 2 * c), nominal: d, comp: 0, clearance: r3(2 * c), rules: [pr.cite('snap_clearance')] };
    out.push(finding('info', `${pinName(n)}'s socket drawn ${mm(hole.diameter)} mm: the ${mm(d)} mm peg plus ${pr.cite('snap_clearance')} ${mm(c)} mm each side (${pr.rest('snap_clearance').kind === 'estimate' ? 'an estimate until the holds coupon measures it' : `${pr.rest('snap_clearance').kind}`}), as drawn, so the split halves close to let the barb through`, 'pin.hole', { values: { diameter: hole.diameter, nominal: d, clearance: hole.clearance }, refs: { pin: pinName(n), rule: pr.cite('snap_clearance') } }));
  } else {
    const comp = pr.n('hole_comp'), k = fit === 'press' ? 'pin_press' : 'pin_slip', c = pr.n(k), clearance = fit === 'press' ? -c : c;
    rests.push(pr.rest('hole_comp'), pr.rest(k));
    hole = { diameter: r3(d + comp + clearance), nominal: d, comp, clearance: r3(clearance), rules: [pr.cite('hole_comp'), pr.cite(k)] };
    out.push(finding('info', `${pinName(n)}'s ${fit} hole drawn ${mm(hole.diameter)} mm: the ${mm(d)} mm pin, plus ${pr.cite('hole_comp')} ${mm(comp)} mm across since a printed hole comes out small, ${fit === 'press' ? 'less' : 'plus'} ${pr.cite(k)} ${mm(c)} mm (${pr.figure(k)?.kind ?? pr.rest(k).kind}) so it ${fit === 'press' ? 'grips' : 'turns'}`, 'pin.hole', { values: { diameter: hole.diameter, nominal: d, comp, clearance: hole.clearance }, refs: { pin: pinName(n), fit, rule: pr.cite(k) } }));
    if (n.kind === 'filament') out.push(finding('info', `filament is ${mm(d)} ± ${mm(PINS.filament_tolerance.value)} mm (pins.filament_tolerance, community): measure the reel the pin is cut from, as a ${fit} fit is closer than that`, 'pin.tolerance', { values: { tolerance: PINS.filament_tolerance.value } }));
    if (n.kind === 'printed') out.push(finding('info', `a printed pin is itself printed, standing, so its size is as close as the printer's: try the ${fit} fit before relying on it`, 'pin.printed'));
  }
  hole.into = dir.into; hole.axis = dir.axis; hole.teardrop = dir.across;
  out.push(finding('pass', dir.across ? `${said(dir.into)}, the hole is a teardrop: a 45° roof, so it prints with no support` : `${said(dir.into)}, a round hole prints as drawn`, 'pin.printable', { values: { into: dir.into } }));

  // A snap pin's barb and its forces
  let snap = null, solid = null;
  if (n.kind === 'snap') {
    const lip = n.barb ?? 0.4, sp = { diameter: d, length: L, lip, slot: o.slot ?? 3 * d, gap: o.gap ?? 1, lead: o.lead ?? 45, back: o.back ?? 45, head: o.head ?? d / 2 };
    const sm = snapPinModel(sp, { E: mat.modulus.value, ...(o.friction != null ? { friction: o.friction } : {}) }), strain = sm.strain(lip);
    snap = { ...sp, insertion: n2(sm.insertion), removal: Number.isFinite(sm.removal) ? n2(sm.removal) : Infinity, force: n2(sm.force), strain: +strain.toFixed(4), holds: sm.holds };
    rests.push(rest(mat.modulus.name, mat.modulus));
    out.push(finding('info', `${pinName(n)}: ${mm(snap.insertion)} N to push in and ${sm.holds ? 'it holds for good (a square back)' : `${mm(snap.removal)} N to pull out`}, its halves bending ${mm(n2(strain * 100))}% at their roots as the ${mm(lip)} mm barb closes them (two snap hooks, 3ty / 2L², on ${mat.modulus.name} ${mm(mat.modulus.value)} MPa, μ ${mm(o.friction ?? 0.3)})`, 'pin.snap', { values: { insertion: snap.insertion, removal: snap.removal, strain: snap.strain } }));
    solid = snapPin(sp);
  }

  // Mass: a solid's volume by its density
  const area = (Math.PI * d * d) / 4, density = n.kind === 'dowel' ? { ...DEFAULTS.steel_density, name: 'fixings.steel_density' } : pinMat.density;
  if (!density) throw new Error(`${what}: ${pinMat.name} has no density in its rule set, so the pin cannot be weighed`);
  const volume = solid ? jscad.measurements.measureVolume(solid) : area * L, grams = +((volume * density.value) / 1000).toFixed(3);
  rests.push(rest(density.name, density));

  // What it fits: a plain pin no longer than the part; a snap pin's shaft as long as the part, and a little more
  let thickness = null;
  if (o.thickness != null) {
    thickness = positive(what, 'thickness', o.thickness);
    if (n.kind === 'snap') {
      const play = DEFAULTS.snap_play.value;
      if (L < thickness - 1e-9) throw new Error(`${what}: ${pinName(n)}'s shaft is ${mm(L)} mm long, and the parts it goes through are ${mm(thickness)} mm thick: it is too short for its part, and the barb never clicks out past the far face. Use a shaft of ${mm(thickness)} mm to ${mm(thickness + play)} mm`);
      if (L > thickness + play + 1e-9) throw new Error(`${what}: ${pinName(n)}'s shaft is ${mm(L)} mm long, and the parts it goes through are ${mm(thickness)} mm thick: it is too long for its part, so the barb clicks out ${mm(r3(L - thickness))} mm past the far face and the pin rattles (fixings.snap_play allows ${mm(play)} mm). Use a shaft of ${mm(thickness)} mm to ${mm(thickness + play)} mm`);
      rests.push(rest('fixings.snap_play', DEFAULTS.snap_play));
      out.push(finding('pass', `${pinName(n)}'s ${mm(L)} mm shaft through ${mm(thickness)} mm of parts: the barb clicks out ${mm(r3(L - thickness))} mm past the far face (fixings.snap_play allows ${mm(play)} mm)`, 'pin.length', { values: { length: L, thickness } }));
    } else {
      if (L > thickness + 1e-9) {
        const fits = n.kind === 'dowel' ? PINS.dowel_lengths.value.filter((x) => x <= thickness).at(-1) : null;
        throw new Error(`${what}: ${pinName(n)} is ${mm(L)} mm long, and the parts it goes in hold ${mm(thickness)} mm of it: it is too long for its part, and stands ${mm(r3(L - thickness))} mm proud. ${fits != null ? `The longest dowel that fits is ${mm(fits)} mm (pins.dowel_lengths)` : `Cut it to ${mm(thickness)} mm`}, or make the parts thicker`);
      }
      out.push(finding('pass', `${pinName(n)}, ${mm(L)} mm long, in ${mm(thickness)} mm of parts: it stands proud of nothing`, 'pin.length', { values: { length: L, thickness } }));
    }
  }

  // Strength: the pin's shear across its planes, and the printed hole's bearing on its grip; a snap pin also its pull
  const planes = o.planes ?? 1;
  if (!(Number.isInteger(planes) && planes >= 1)) throw new Error(`${what}: planes is how many shear planes the pin crosses, a whole number from 1 (two parts; got ${shown(o.planes)})`);
  const grip = o.grip != null ? positive(what, 'grip', o.grip) : (thickness ?? L) / 2, ratio = DEFAULTS.shear_ratio.value;
  let tau, tauSays;
  if (n.kind === 'dowel') { tau = PINS.dowel_shear.value; tauSays = `pins.dowel_shear ${mm(tau)} MPa, an estimate that understates a hardened pin`; rests.push(pinRest('dowel_shear')); }
  else {
    const along_ = n.kind === 'filament' ? pinMat.strength : weakest(pinMat).f; // (filament: the strand's own strength; a printed pin stands, so its shear plane is a layer's)
    tau = along_.value * ratio; tauSays = `${along_.name} ${mm(along_.value)} MPa × fixings.shear_ratio ${mm(+ratio.toFixed(3))}, an estimate`; rests.push(rest(along_.name, along_), rest('fixings.shear_ratio', DEFAULTS.shear_ratio));
  }
  const shearArea = n.kind === 'snap' ? area - (o.gap ?? 1) * d : area, shear = n1(tau * shearArea * planes), bearing = n1(weak.value * d * grip);
  rests.push(rest(weak.name, weak));
  let pull = null;
  if (snap) { const tensile = n1(weakest(pinMat).f.value * shearArea); pull = Number.isFinite(snap.removal) ? Math.min(snap.removal, tensile) : tensile; }
  const caps = { shear, bearing, ...(pull != null ? { pull } : {}) };
  const load = o.load != null ? positive(what, 'load (across the pin, in N)', o.load) : null, pullLoad = o.pull != null ? positive(what, 'pull (along the pin, in N)', o.pull) : null;
  if (pullLoad != null && !snap) throw new Error(`${what}: pull is along a snap pin: a plain pin holds by its press fit, which these sums do not give, so hold it along by a shoulder or glue`);
  const margins = { ...(load != null ? { shear: n2(shear / load), bearing: n2(bearing / load) } : {}), ...(pullLoad != null ? { pull: n2(pull / pullLoad) } : {}) };
  const governs = Object.keys(margins).length ? Object.entries(margins).sort((x, y) => x[1] - y[1])[0][0] : null, margin = governs ? margins[governs] : null;
  const want = DEFAULTS.load_margin.value, says = `${pinName(n)} carries ${mm(shear)} N in shear (${planes} plane${planes > 1 ? 's' : ''}, ${tauSays}); the printed hole takes ${mm(bearing)} N in bearing on ${mm(grip)} mm of grip (${weak.name} ${mm(weak.value)} MPa, taken as what it bears: an estimate)${pull != null ? `; it holds ${mm(pull)} N along` : ''}`;
  if (margin == null) out.push(finding('info', `${says}: give load to have it checked`, 'pin.strength', { values: caps }));
  else out.push(finding(margin >= want ? 'pass' : margin >= 1 ? 'warn' : 'fail', `${says}: ${load != null ? `${mm(load)} N across` : ''}${load != null && pullLoad != null ? ' and ' : ''}${pullLoad != null ? `${mm(pullLoad)} N along` : ''} leaves ${mm(margin)} times over in ${governs}${margin >= want ? '' : margin >= 1 ? `, under the ${mm(want)} times fixings.load_margin asks` : ': it gives way'}`,
    'pin.strength', { values: { ...caps, load, pull: pullLoad, margin, governs } }));
  rests.push(rest('fixings.load_margin', DEFAULTS.load_margin));
  out.push(finding('info', `${pinName(n)} weighs ${mm(grams)} g`, 'pin.mass', { values: { grams } }));
  return { kind: 'pin', type: n.kind, name: pinName(n), said: String(p), diameter: d, length: L, made: n.kind === 'dowel' ? 'bought' : n.kind === 'filament' ? 'cut' : 'printed', standard: n.standard, fit,
    material: mat.name, pinMaterial: pinMat ? pinMat.name : 'steel', hole, snap, grams, shear, bearing, pull, load, margin, governs, thickness, rests, findings: out };
}
/**
 * The hole for a pin, to subtract: round standing up, a teardrop lying on its side, the diameter pinModel gives it.
 * @param {string | Pin} p @param {object} [o] as pinModel, and at: the point on the face where the hole starts; depth:
 *   how deep (default the thickness, else the pin's length); through: out of the far face (default true where depth is the thickness)
 * @returns {object} a JSCAD geom3 with .model holding pinModel's numbers
 */
export function pinHole(p, o = {}) {
  const what = 'pinHole', m = pinModel(p, optionsOf(what, o, '{ fit: \'slip\', depth: 6 }')), at = pointOf(what, o.at);
  const depth = o.depth != null ? positive(what, 'depth', o.depth) : m.thickness ?? m.length, through = o.through ?? (o.depth == null && m.thickness != null);
  if (typeof through !== 'boolean') throw new Error(`${what}: through is true or false (got ${shown(o.through)})`);
  const h = m.hole, g = h.teardrop ? teardropHole({ d: h.diameter, length: depth, at, into: h.into, through }) : along(bore([[h.diameter / 2, depth]], { through }), h.into, at);
  return Object.assign(g, { model: m });
}

/**
 * A pin's solid, standing on the bed at z = 0: a snap pin as snapPin draws it from its model's figures, a plain pin a
 * cylinder with its ends eased (a dowel's are rounded, a printed pin's chamfered against the first layer's spread).
 * @param {string | Pin} p @param {object} [o] as pinModel @param {{ union: Function, subtract: Function }} [ops] for a snap pin
 * @returns {object} a JSCAD geom3 with .model
 */
export function pin(p, o = {}, ops) {
  const m = pinModel(p, o);
  if (m.snap) { const { lip, slot, gap, lead, back, head } = m.snap; return Object.assign(snapPin({ diameter: m.diameter, length: m.length, lip, slot, gap, lead, back, head }, ops), { model: m }); }
  const r = m.diameter / 2, c = Math.min(m.made === 'printed' ? printerOf('pin', o.printer).n('chamfer') : 0.2, r / 3, m.length / 4);
  return Object.assign(lathe([[0, 0], [r - c, 0], [r, c], [r, m.length - c], [r - c, m.length], [0, m.length]], m.made === 'printed' ? 48 : LIGHT * 2), { model: m });
}

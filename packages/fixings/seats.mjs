// Seats: where a screw's head, a nut or an insert sits in a printed part. Each has a twin that gives the numbers with
// findings (counterboreModel) and one that gives the solid (counterbore), and each prints without supports in the
// direction it is drawn for. Sizes come from the thread's rules and the printer's; the shapes come from
// @rulecad/shapes where it has one (countersink, nutPocket, teardropHole, wallOpening), which take plain dimensions.
// A cutter starts at a point on a face (at) and goes into the part along a direction (into).
import jscad from '@jscad/modeling';
import { countersink as cone90, nutPocket as hexPocket, wallOpening } from '@rulecad/shapes';
import { DEFAULTS, fixingOf, printerOf, headOf, nutOf, figure, cite, rest, finding, positive, oneOf, isNum, shown, mm, r3, a, layers } from './model.mjs';
import { holeModel, directionOf, pointOf, optionsOf, said, inPart } from './holes.mjs';
import { along, bore, lathe, teardrop, UP, OUT, SEGMENTS, DIRECTIONS } from './draw.mjs';

/**
 * @typedef {import('./model.mjs').Fixing} Fixing a fixing's model, as fixingModel gives it
 */

const { cuboid, cylinderElliptic, polygon } = jscad.primitives, { translate, rotateZ, transform } = jscad.transforms, { extrudeLinear } = jscad.extrusions;
const COS30 = Math.cos(Math.PI / 6);
const CLEARANCES = ['clearance', 'close', 'loose'];
// The hole a seat sits on: one of the clearances
function through(what, fx, o) {
  const kind = oneOf(what, 'hole', o.hole ?? 'clearance', CLEARANCES), n = kind === 'clearance' ? kind : `clearance_${kind}`;
  if (!fx.figures[n]) throw new Error(`${what}: ${fx.thread} has no ${n} in its rule set (${fx.set}): a seat sits on a clearance hole, and this thread has no figure for one`);
  return holeModel(fx, { kind, printer: o.printer });
}
// A fit by name, from the printer's rules, or a clearance in mm as printed. For a nut (nut: true), snug and slip read
// the printer's measured nut_fit and nut_slip first, where it has them (the fixings coupon measures both)
function fitOf(what, fit, pr, nut = false) {
  if (isNum(fit)) return { name: fit, clearance: fit, rests: [] };
  if (!['snug', 'slip', 'press'].includes(fit)) throw new Error(`${what}: fit is snug (no clearance once printed), slip or press (the printer's), or a clearance in mm (got ${shown(fit)})`);
  const own = nut && fit !== 'press' ? pr.figure(fit === 'snug' ? 'nut_fit' : 'nut_slip') : null;
  if (own) { if (!isNum(own.value)) throw new Error(`${what}: ${own.name} is a clearance in mm (got ${shown(own.value)})`); return { name: own.name.slice(own.name.lastIndexOf('.') + 1), clearance: own.value, rests: [rest(own.name, own)] }; }
  return fit === 'snug' ? { name: fit, clearance: 0, rests: [] } : { name: fit, clearance: fit === 'slip' ? pr.n('slip') : -pr.n('press'), rests: [pr.rest(fit)] };
}
const figures = (fx, names) => names.map((n) => rest(cite(fx, n), fx.figures[n]));
const lengthOf = (what, o, least, why) => {
  if (o.length == null) return null;
  positive(what, 'length', o.length);
  if (o.length < least - 1e-9) throw new Error(`${what}: length is the whole hole's, from the face it starts at: ${mm(o.length)} mm is less than ${why} (${mm(least)} mm)`);
  return o.length;
};

// ---------- counterbore ----------
/**
 * A counterbore for a screw's head, as numbers: wide enough for the head with the printer's fit round it, and deep
 * enough to hide it.
 * @param {Fixing | string} m
 * @param {{ head?: string, depth?: number, diameter?: number, length?: number, thickness?: number, hole?: string, printer?: object, into?: string, axis?: string, sets?: object }} [o]
 *   head: cap, button, hex or pan (default the model's, else cap); depth: of the seat (default the head's height, up to
 *   a whole layer); diameter: of the seat, for a socket's room; length: the whole hole's, from the face, to cut the
 *   screw's hole as well; thickness: the part's there (a seat deeper than the part is refused); hole: clearance, close or loose
 * @returns {{ thread: string, head: string, diameter: number, depth: number, sunk: number, hole: number, length: number | null, cone: number, into: string, teardrop: boolean, rests: object[], findings: object[] }}
 *   sunk: how far the head's top lies under the face (below 0: it stands proud); cone: the height of the 45° cone the seat ends in where it goes up from the bed
 */
export function counterboreModel(m, o = {}) {
  const what = 'counterbore';
  optionsOf(what, o, '{ head: \'cap\', length: 8 }');
  const fx = fixingOf(what, m, o), pr = printerOf(what, o.printer), dir = directionOf(what, o), out = [];
  const form = o.head ?? fx.head?.form ?? (fx.made.heads.includes('cap') ? 'cap' : 'pan');
  if (form === 'countersunk') throw new Error(`${what}: a countersunk head sits in a cone, not a counterbore: use countersink`);
  if (form === 'set') throw new Error(`${what}: a set screw has no head to seat: it goes into its hole whole`);
  const head = headOf(what, fx, form), h = through(what, fx, o), fit = pr.n('fit'), comp = pr.n('hole_comp'), layer = pr.n('layer');
  const least = r3(head.across + comp), diameter = o.diameter == null ? r3(head.across + 2 * fit + comp) : positive(what, 'diameter', o.diameter);
  const depth = o.depth == null ? layers(head.height, layer) : positive(what, 'depth', o.depth), sunk = r3(depth - head.height);
  const cone = dir.into === '+z' ? r3((diameter - h.diameter) / 2) : 0, length = lengthOf(what, o, depth + cone, 'the seat\'s depth');
  inPart(what, o, depth + cone, `a seat ${mm(depth)} mm deep for ${a(fx.thread)} ${form} head${cone ? ` with its ${mm(cone)} mm cone` : ''}`);
  out.push(finding('info', `a counterbore for ${a(fx.thread)} ${form} head drawn ${mm(diameter)} mm across and ${mm(depth)} mm deep: the head is ${mm(head.across)} mm across${head.flats ? ' its corners' : ''} and ${mm(head.height)} mm high (${head.figures.map((n) => cite(fx, n)).join(', ')})${o.diameter == null ? `, with ${pr.cite('fit')} ${mm(fit)} mm each side and ${pr.cite('hole_comp')} ${mm(comp)} mm across` : ''}; its top lies ${sunk > 1e-9 ? `${mm(sunk)} mm under the face` : sunk < -1e-9 ? `${mm(-sunk)} mm proud of the face` : 'flush with the face'}`,
    'counterbore.drawn', { values: { diameter, depth, sunk, hole: h.diameter }, refs: { thread: fx.thread, set: fx.set, head: form } }));
  if (diameter < least - 1e-9) out.push(finding('fail', `a ${mm(diameter)} mm seat is smaller than the ${mm(head.across)} mm head once printed: ${mm(least)} mm at least`, 'counterbore.diameter', { values: { diameter, least } }));
  if (sunk < -1e-9) out.push(finding('warn', `the head stands ${mm(-sunk)} mm proud of a ${mm(depth)} mm seat: ${mm(head.height)} mm hides it`, 'counterbore.proud', { values: { depth, head: head.height } }));
  if (form === 'hex' && o.diameter == null) out.push(finding('warn', `a hexagon head is turned by a socket or a spanner, and this seat clears the head's corners by the printer's fit and no more: give { diameter } for your socket's outside`, 'counterbore.socket'));
  out.push(finding('pass', dir.across ? `${said(dir.into)}, the seat and its hole are teardrops: 45° roofs, no support`
    : cone ? `${said(dir.into)}, the seat ends in a 45° cone ${mm(cone)} mm high from the bore to the hole: nothing spans, and the head bears on the cone's rim` : `${said(dir.into)}, a counterbore prints as drawn`, 'counterbore.printable', { values: { into: dir.into } }));
  return { thread: fx.thread, head: form, diameter, depth, sunk, hole: h.diameter, length, cone, into: dir.into, teardrop: dir.across,
    rests: [...figures(fx, head.figures), pr.rest('fit'), pr.rest('hole_comp'), pr.rest('layer'), ...h.rests], findings: [...out, ...h.findings.filter((f) => f.code === 'hole.drawn')] };
}

/**
 * A counterbore for a screw's head, to subtract, with the screw's hole on through the part where length is given.
 * On its side, the seat and the hole are one teardrop cutter: a 45° roof over each.
 * @param {Fixing | string} m
 * @param {{ head?: string, depth?: number, diameter?: number, length?: number, hole?: string, printer?: object, into?: string, axis?: string, sets?: object, at?: number[] }} [o] as counterboreModel; at: the point on the face
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function counterbore(m, o = {}) {
  const c = counterboreModel(m, o), at = pointOf('counterbore', o.at), R = c.diameter / 2, r = c.hole / 2;
  const steps = [[R, c.depth], ...(c.cone ? [[r, c.depth + c.cone]] : c.length ? [[r, c.depth]] : []), ...(c.length ? [[r, c.length]] : [])];
  return Object.assign(along(c.teardrop ? teardrop(steps, UP[c.into], { through: !!c.length }) : bore(steps, { through: !!c.length }), c.into, at), { model: c });
}

// ---------- countersink ----------
/**
 * A countersink for a flat-head screw, as numbers: a cone to the head's angle, as wide as the head's sharp edge, so
 * any head sits flush.
 * @param {Fixing | string} m
 * @param {{ length?: number, thickness?: number, hole?: string, printer?: object, into?: string, axis?: string, sets?: object }} [o] length: the whole hole's, from the face (default the cone and no more);
 *   thickness: the part's there (a cone deeper than the part is refused)
 * @returns {{ thread: string, diameter: number, angle: number, depth: number, hole: number, length: number, into: string, teardrop: boolean, rests: object[], findings: object[] }}
 *   diameter: of the cone at the face, as drawn; depth: of the cone
 */
export function countersinkModel(m, o = {}) {
  const what = 'countersink';
  optionsOf(what, o, '{ length: 8 }');
  const fx = fixingOf(what, m, o), pr = printerOf(what, o.printer), dir = directionOf(what, o), head = headOf(what, fx, 'countersunk'), h = through(what, fx, o), comp = pr.n('hole_comp');
  const angle = head.angle ?? 90, diameter = r3(head.diameter + comp), depth = r3((diameter - h.diameter) / 2 / Math.tan((angle * Math.PI) / 360));
  if (!(angle > 0 && angle < 180)) throw new Error(`${what}: ${cite(fx, 'countersunk_angle')} is the cone's whole angle, between 0° and 180° (got ${shown(angle)})`);
  const length = lengthOf(what, o, depth, 'the cone\'s depth') ?? depth, slope = angle / 2, limit = pr.n('overhang'), out = [];
  inPart(what, o, depth, `a countersink ${mm(depth)} mm deep for ${a(fx.thread)} flat head`);
  out.push(finding('info', `a countersink for ${a(fx.thread)} flat head drawn ${mm(diameter)} mm across at ${mm(angle)}°, ${mm(depth)} mm deep on a ${mm(h.diameter)} mm hole: ${cite(fx, 'countersunk_head')} ${mm(head.diameter)} mm, the head's sharp-edge diameter, so any head sits flush, plus ${pr.cite('hole_comp')} ${mm(comp)} mm across`,
    'countersink.drawn', { values: { diameter, angle, depth, hole: h.diameter }, refs: { thread: fx.thread, set: fx.set } }));
  out.push(dir.across ? finding('pass', `${said(dir.into)}, the cone and its hole are teardrops: 45° roofs, no support`, 'countersink.printable', { values: { into: dir.into } })
    : dir.into === '+z' ? finding(slope <= limit + 1e-9 ? 'pass' : 'warn', `${said(dir.into)}, the cone opens on to the bed and its wall overhangs ${mm(slope)}° from upright, ${slope <= limit + 1e-9 ? 'within' : 'past'} the printer's ${mm(limit)}°`, 'countersink.printable', { values: { into: dir.into, slope, limit } })
      : finding('pass', `${said(dir.into)}, a countersink prints as drawn`, 'countersink.printable', { values: { into: dir.into } }));
  return { thread: fx.thread, diameter, angle, depth, hole: h.diameter, length, into: dir.into, teardrop: dir.across,
    rests: [...figures(fx, head.figures), pr.rest('hole_comp'), ...h.rests], findings: [...out, ...h.findings.filter((f) => f.code === 'hole.drawn')] };
}

/**
 * A countersink and its hole, to subtract, the head flush with the face at `at`. A 90° head goes through
 * @rulecad/shapes' countersink; another angle (an inch screw's 82°) is drawn here in the same form.
 * @param {Fixing | string} m
 * @param {{ length?: number, hole?: string, printer?: object, into?: string, axis?: string, sets?: object, at?: number[] }} [o] as countersinkModel
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function countersink(m, o = {}) {
  const c = countersinkModel(m, o), at = pointOf('countersink', o.at), through = o.length != null, R = c.diameter / 2, r = c.hole / 2;
  if (c.angle === 90) return Object.assign(cone90({ hole: c.hole, head: c.diameter, length: c.length + (through ? OUT : 0), at, into: c.into }), { model: c });
  const steps = [[R, 0], [r, c.depth], ...(c.length > c.depth ? [[r, c.length]] : [])];
  return Object.assign(along(c.teardrop ? teardrop(steps, UP[c.into], { through }) : bore(steps, { through }), c.into, at), { model: c });
}

// ---------- nuts ----------
// What every nut seat starts from: the nut, the fit, the drawn size across its flats and the screw's hole
function nutSeat(what, m, o, fit) {
  optionsOf(what, o, '{ kind: \'hex\' }');
  const fx = fixingOf(what, m, o), pr = printerOf(what, o.printer), nut = nutOf(what, fx, o.kind ?? fx.nut?.kind ?? 'hex'), f = fitOf(what, o.fit ?? fit, pr, true), comp = pr.n('hole_comp'), h = through(what, fx, o);
  const flats = r3(nut.flats + comp + f.clearance), corner = r3(nut.kind === 'square' ? flats * Math.SQRT2 : flats / COS30);
  const how = `${cite(fx, nut.figures[0])} ${mm(nut.flats)} mm plus ${pr.cite('hole_comp')} ${mm(comp)} mm${f.clearance ? ` and ${isNum(f.name) ? 'the fit given' : pr.cite(f.name)} ${mm(f.clearance)} mm` : ''}`;
  return { fx, pr, nut, f, comp, h, flats, corner, how, rests: [...figures(fx, nut.figures), pr.rest('hole_comp'), ...f.rests, ...h.rests] };
}
const nutName = (s) => `${a(s.fx.thread)} ${s.nut.kind === 'hex' ? '' : `${s.nut.kind} `}nut`;
// A pocket for a nut along the screw's axis, drawn going down from z = 0: a hexagon through shapes, a square drawn here
function pocket(s, flats, depth, hole, at, into) {
  if (s.nut.kind !== 'square') return hexPocket({ flats, height: depth, hole, at, into });
  const box = translate([0, 0, -depth / 2], cuboid({ size: [flats, flats, depth] }));
  if (into === '+z') { // a 45° roof from the corners to the hole, as the hexagon's
    const rise = (flats * Math.SQRT2 - hole) / 2, roof = translate([0, 0, -depth - rise / 2], rotateZ(Math.PI / 4, cylinderElliptic({ height: rise, startRadius: [hole / 2, hole / 2], endRadius: [flats / Math.SQRT2, flats / Math.SQRT2], segments: 4 })));
    return along(jscad.booleans.union(box, roof), into, at);
  }
  return along(into in UP ? rotateZ(Math.PI / 4, box) : box, into, at); // across a part: turned corner up, its two upper faces at 45°
}

/**
 * A pocket for a nut, let in from a face along the screw's axis, as numbers.
 * @param {Fixing | string} m
 * @param {{ kind?: string, depth?: number, thickness?: number, fit?: string | number, hole?: string, printer?: object, into?: string, axis?: string, sets?: object }} [o]
 *   kind: hex, square or lock (default the model's, else hex); depth: of the pocket (default the nut's height and two
 *   layers); thickness: the part's there (a pocket deeper than the part is refused); fit: snug (the default: the printer's measured nut_fit where it has one, else no clearance once printed, so the nut cannot turn), slip, press, or a clearance in mm
 * @returns {{ thread: string, kind: string, flats: number, nominal: number, corner: number, depth: number, height: number, hole: number, clearance: number, roof: number, into: string, rests: object[], findings: object[] }}
 *   flats: across the flats, as drawn; nominal: the nut's; corner: across the pocket's corners; roof: the height of the 45° roof, going up from the bed
 */
export function nutPocketModel(m, o = {}) {
  const what = 'nutPocket', s = nutSeat(what, m, o, 'snug'), { fx, pr, nut, h } = s, dir = directionOf(what, o), layer = pr.n('layer'), out = [];
  const depth = o.depth == null ? r3(nut.height + DEFAULTS.nut_sink.value * layer) : positive(what, 'depth', o.depth), roof = dir.into === '+z' ? r3((s.corner - h.diameter) / 2) : 0;
  inPart(what, o, depth + roof, `a pocket ${mm(depth)} mm deep for ${nutName(s)}${roof ? ` with its ${mm(roof)} mm roof` : ''}`);
  out.push(finding('info', `a pocket for ${nutName(s)} drawn ${mm(s.flats)} mm across the flats and ${mm(depth)} mm deep: ${s.how}; the nut is ${mm(nut.height)} mm high (${cite(fx, nut.figures[1])})${o.depth == null ? `, sunk ${DEFAULTS.nut_sink.value} layers of ${pr.cite('layer')}` : ''}`,
    'nutPocket.drawn', { values: { flats: s.flats, depth, hole: h.diameter, clearance: s.f.clearance }, refs: { thread: fx.thread, set: fx.set, nut: nut.kind } }));
  if (depth < nut.height - 1e-9) out.push(finding('warn', `the nut stands ${mm(nut.height - depth)} mm proud of a ${mm(depth)} mm pocket`, 'nutPocket.proud', { values: { depth, height: nut.height } }));
  const side = r3(s.flats / Math.sqrt(3)), bridge = pr.n('bridge');
  out.push(!dir.across ? finding('pass', roof ? `${said(dir.into)}, the pocket has a 45° roof ${mm(roof)} mm high from its corners to the hole: nothing spans` : `${said(dir.into)}, the pocket is open above: it prints as drawn`, 'nutPocket.printable', { values: { into: dir.into } })
    : nut.kind === 'square' ? finding('pass', `${said(dir.into)}, the square is turned corner up: its two upper faces lie at 45°`, 'nutPocket.printable', { values: { into: dir.into } })
      : finding(side <= bridge + 1e-9 ? 'pass' : 'warn', `${said(dir.into)}, the hexagon has a flat on top: a ${mm(side)} mm bridge, ${side <= bridge + 1e-9 ? 'within' : 'past'} the printer's ${mm(bridge)} mm`, 'nutPocket.printable', { values: { into: dir.into, bridge: side, limit: bridge } }));
  return { thread: fx.thread, kind: nut.kind, flats: s.flats, nominal: nut.flats, corner: s.corner, depth, height: nut.height, hole: h.diameter, clearance: s.f.clearance, roof, into: dir.into, rests: [...s.rests, pr.rest('layer')], findings: out };
}

/**
 * A pocket for a nut, to subtract: open at the face at `at`, going in along the screw's axis. A hexagon goes through
 * @rulecad/shapes' nutPocket. The screw's hole is a hole() of its own.
 * @param {Fixing | string} m
 * @param {{ kind?: string, depth?: number, fit?: string | number, hole?: string, printer?: object, into?: string, axis?: string, sets?: object, at?: number[] }} [o] as nutPocketModel
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function nutPocket(m, o = {}) {
  const p = nutPocketModel(m, o), s = { nut: { kind: p.kind } };
  return Object.assign(pocket(s, p.flats, p.depth, p.hole, pointOf('nutPocket', o.at), p.into), { model: p });
}

/**
 * A slot a nut slides into from the side, across the screw's axis, as numbers.
 * @param {Fixing | string} m
 * @param {{ kind?: string, axis?: 'x' | 'y' | 'z', into?: string, depth: number, fit?: string | number, hole?: string, printer?: object, sets?: object }} o
 *   axis: the screw's (default z, standing up); into: the way the nut slides in, square to the axis (default +x for a
 *   screw standing up, -z, dropped in from the top, for one lying down); depth: from the face to the screw's axis;
 *   fit: slip (the default: the nut slides in by hand; the printer's measured nut_slip where it has one, else its slip), snug, press, or a clearance in mm
 * @returns {{ thread: string, kind: string, width: number, gap: number, depth: number, reach: number, hole: number, clearance: number, axis: string, into: string, span: number, rise: number, rests: object[], findings: object[] }}
 *   width: across the nut's flats, as drawn; clearance: the fit's, across the flats; gap: along the screw, for the nut's height; reach: how far the slot goes
 *   in from the face; span: what its roof bridges; rise: how far the roof rises at 45° where that is wider than the printer bridges
 */
export function nutTrapModel(m, o = {}) {
  const what = o?.slot ?? 'nutTrap', s = nutSeat(what, m, o, 'slip'), { fx, pr, nut, h } = s, layer = pr.n('layer'), bridge = pr.n('bridge'), out = [];
  const axis = oneOf(what, 'axis', o.axis ?? 'z', ['x', 'y', 'z']), into = oneOf(what, 'into', o.into ?? (axis === 'z' ? '+x' : '-z'), DIRECTIONS);
  if (into[1] === axis) throw new Error(`${what}: the nut slides in across the screw, so into is square to axis (got into ${into} with the screw along ${axis}). A pocket along the screw is nutPocket`);
  if (into === '+z') throw new Error(`${what}: a slot open to the bed has the nut's width to bridge over its whole length: turn it so the nut goes in from the top (-z) or from a side (+x, -x, +y, -y)`);
  const depth = positive(what, 'depth (from the face to the screw\'s axis)', o.depth), raw = nut.height + s.comp + s.f.clearance, gap = axis === 'z' ? layers(raw, 2 * layer) : r3(raw); // (an even number of layers, so the slot's floor and roof both fall on layers when its middle does)
  const reach = r3(depth + (nut.kind === 'square' ? s.flats / 2 : s.flats / (2 * COS30))), span = into === '-z' ? 0 : axis === 'z' ? s.flats : gap, rise = span > bridge ? r3((span - bridge) / 2) : 0;
  out.push(finding('info', `a slot for ${nutName(s)} drawn ${mm(s.flats)} mm across the flats and ${mm(gap)} mm along the screw, ${mm(reach)} mm in from the face: ${s.how}; the nut is ${mm(nut.height)} mm high (${cite(fx, nut.figures[1])})${axis === 'z' ? ', its gap an even number of layers' : ''}`,
    'nutTrap.drawn', { values: { width: s.flats, gap, reach, hole: h.diameter, clearance: s.f.clearance }, refs: { thread: fx.thread, set: fx.set, nut: nut.kind } }));
  out.push(finding('pass', into === '-z' ? 'dropped in from the top, the slot is open above: nothing spans' : rise ? `from the side, the slot's roof spans ${mm(span)} mm, more than the printer's ${mm(bridge)} mm bridge: it rises ${mm(rise)} mm at 45° to a flat ${mm(bridge)} mm wide`
    : `from the side, the slot's roof is a ${mm(span)} mm bridge, within the printer's ${mm(bridge)} mm`, 'nutTrap.printable', { values: { into, span, limit: bridge, rise } }));
  if (rise) out.push(finding('info', 'the slot\'s floor is flat and its roof is not: bring the screw in through the floor, so it pulls the nut down on to the flat', 'nutTrap.side'));
  return { thread: fx.thread, kind: nut.kind, width: s.flats, gap, depth, reach, hole: h.diameter, clearance: s.f.clearance, axis, into, span, rise, rests: [...s.rests, pr.rest('layer'), pr.rest('bridge')], findings: out };
}

/**
 * A slot a nut slides into from the side, to subtract. `at` is the point on the face in line with the nut's centre.
 * From a side it goes through @rulecad/shapes' wallOpening (a roof that bridges, rising at 45° where it is too wide);
 * dropped in from the top, the slot ends in the nut's own outline, so the nut sits on the screw's axis.
 * @param {Fixing | string} m
 * @param {{ kind?: string, axis?: 'x' | 'y' | 'z', into?: string, depth: number, fit?: string | number, hole?: string, printer?: object, sets?: object, at?: number[] }} o as nutTrapModel
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function nutTrap(m, o = {}) {
  const t = nutTrapModel(m, o), at = pointOf(o?.slot ?? 'nutTrap', o.at), pr = printerOf('nutTrap', o.printer), w = t.width / 2;
  if (t.into !== '-z') return Object.assign(wallOpening(t.axis === 'z' ? { width: t.width, height: t.gap, depth: t.reach, at, into: t.into, bridge: pr.n('bridge') } : { width: t.gap, height: t.width, depth: t.reach, at, into: t.into, bridge: pr.n('bridge') }), { model: t });
  // from the top: the slot's outline seen along the screw (across, then up), ending in the lower half of the nut
  const end = t.kind === 'square' ? [[-w, -t.depth - w], [w, -t.depth - w]] : [[-w, -t.depth - w * Math.tan(Math.PI / 6)], [0, -t.reach], [w, -t.depth - w * Math.tan(Math.PI / 6)]];
  const slab = translate([0, 0, -t.gap / 2], extrudeLinear({ height: t.gap }, polygon({ points: [[-w, OUT], ...end, [w, OUT]] })));
  // (across, up, along the screw) to the part's x, y, z
  const turn = t.axis === 'x' ? [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1] : [-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
  return Object.assign(translate(at, transform(turn, slab)), { model: t });
}

/** A slot for a thin square nut, as numbers: nutTrapModel for a square nut, dropped in from the top across a screw lying along x unless told otherwise. */
export function squareNutSlotModel(m, o = {}) { optionsOf('squareNutSlot', o, '{ depth: 6 }'); return nutTrapModel(m, { axis: 'x', ...o, kind: 'square', slot: 'squareNutSlot' }); }
/**
 * A slot for a thin square nut (DIN 562), to subtract: the nut drops in from the top and the screw comes in from the side.
 * @param {Fixing | string} m
 * @param {{ axis?: 'x' | 'y' | 'z', into?: string, depth: number, fit?: string | number, printer?: object, sets?: object, at?: number[] }} o as nutTrap
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function squareNutSlot(m, o = {}) { optionsOf('squareNutSlot', o, '{ depth: 6 }'); return nutTrap(m, { axis: 'x', ...o, kind: 'square', slot: 'squareNutSlot' }); }

/**
 * A nut closed inside the part, put in while the print is paused, as numbers: a pocket with a flat floor at `at`, as
 * high as the nut and a layer, and a 45° roof over it to the screw's hole. The pause height is where the pocket's
 * walls end: the printer stops there, the nut goes in, and the next layers close the roof.
 * @param {Fixing | string} m
 * @param {{ kind?: string, fit?: string | number, hole?: string, thickness?: number, printer?: object, sets?: object, at?: number[] }} [o] at: the middle of the pocket's floor, its z measured from the bed; fit: slip by default;
 *   thickness: the part's height there, from the bed (a pocket whose roof would break out of the top is refused)
 * @returns {{ thread: string, kind: string, flats: number, height: number, pause: number, layer: number, roof: number, top: number, hole: number, rests: object[], findings: object[] }}
 *   height: of the pocket's upright walls; pause: the z to pause at; layer: the number of the last layer laid before the pause; top: the z where the roof meets the hole
 */
export function captiveNutModel(m, o = {}) {
  const what = 'captiveNut', s = nutSeat(what, m, o, 'slip'), { fx, pr, nut, h } = s, at = pointOf(what, o.at), layer = pr.n('layer'), out = [];
  if (!(layer > 0)) throw new Error(`${what}: the printer's layer is above 0 mm (got ${shown(layer)})`);
  const height = layers(nut.height + DEFAULTS.nut_slack.value * layer, layer), pause = r3(at[2] + height), n = Math.round(pause / layer), roof = r3((s.corner - h.diameter) / 2);
  if (o.thickness != null) { positive(what, 'thickness', o.thickness); if (pause + roof > o.thickness - 1e-9) throw new Error(`${what}: a closed pocket for ${nutName(s)} from z = ${mm(at[2])} mm ends its roof at z = ${mm(r3(pause + roof))} mm, and the part is ${mm(o.thickness)} mm high there: it is deeper than the part, and would break out of its top. Start it lower, or make the part taller`); }
  out.push(finding('info', `a closed pocket for ${nutName(s)} drawn ${mm(s.flats)} mm across the flats and ${mm(height)} mm high: ${s.how}; the nut is ${mm(nut.height)} mm high (${cite(fx, nut.figures[1])}), with ${DEFAULTS.nut_slack.value} layer over it`,
    'captiveNut.drawn', { values: { flats: s.flats, height, hole: h.diameter, clearance: s.f.clearance }, refs: { thread: fx.thread, set: fx.set, nut: nut.kind } }));
  out.push(finding('info', `pause the print at z = ${mm(pause)} mm, once layer ${n} is down (${mm(layer)} mm layers, the bed at z = 0), drop the ${fx.thread} ${nut.kind === 'hex' ? '' : `${nut.kind} `}nut in, and carry on: the next ${mm(roof)} mm closes a roof over it`, 'captiveNut.pause', { values: { pause, layer: n, height: layer } }));
  out.push(finding('info', 'the nut lies on the pocket\'s flat floor and its roof is a cone: bring the screw in from below, through the floor, so it pulls the nut on to the flat', 'captiveNut.side'));
  out.push(finding('pass', `closed in the part, the pocket has a flat floor and a 45° roof ${mm(roof)} mm high from its corners to the hole: nothing spans`, 'captiveNut.printable', { values: { into: '+z' } }));
  return { thread: fx.thread, kind: nut.kind, flats: s.flats, height, pause, layer: n, roof, top: r3(pause + roof), hole: h.diameter, rests: [...s.rests, pr.rest('layer'), rest('fixings.nut_slack', DEFAULTS.nut_slack)], findings: out };
}

/**
 * A nut closed inside the part, to subtract: the pocket and its roof, from the floor at `at` upwards. The screw's hole
 * is a hole() of its own, through the floor.
 * @param {Fixing | string} m @param {{ kind?: string, fit?: string | number, hole?: string, printer?: object, sets?: object, at?: number[] }} [o] as captiveNutModel
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function captiveNut(m, o = {}) {
  const c = captiveNutModel(m, o);
  return Object.assign(pocket({ nut: { kind: c.kind } }, c.flats, c.height, c.hole, pointOf('captiveNut', o.at), '+z'), { model: c });
}

// ---------- insert boss ----------
/**
 * A boss for a heat-set insert, as numbers: the hole the insert melts into, its depth, and the wall round it, each
 * from the insert's rules. Refused where the wall is thinner than the insert's rule allows, or the part shorter than
 * the insert.
 * @param {Fixing | string} m
 * @param {{ height?: number, outer?: number, wall?: number, through?: boolean, root?: number, printer?: object, sets?: object }} [o]
 *   height: of the boss, or the part's thickness there (default the blind hole's depth, up to a whole layer); outer:
 *   the boss's diameter, or wall: the plastic round the hole (default the insert's least wall); through: the hole runs
 *   out of the far side; root: the 45° flare where the boss meets what it stands on (default the printer's chamfer)
 * @returns {{ thread: string, hole: number, depth: number, through: boolean, outer: number, wall: number, least: number, height: number, root: number, lead: number, below: number, insert: { diameter: number, length: number }, rests: object[], findings: object[] }}
 *   hole: as drawn; least: the wall the insert's rule asks; below: how far a blind hole runs on under the boss's foot
 */
export function insertBossModel(m, o = {}) {
  const what = 'insertBoss';
  optionsOf(what, o, '{ height: 8 }');
  const fx = fixingOf(what, m, o), pr = printerOf(what, o.printer), out = [];
  if (!fx.made.insert) throw new Error(`${what}: ${fx.thread} has no heat-set insert in its rule set (${fx.set})`);
  const through = o.through ?? false, h = holeModel(fx, { kind: 'insert', through, printer: o.printer }), least = figure(what, fx, 'insert_wall'), long = figure(what, fx, 'insert_length'), blind = figure(what, fx, 'insert_depth');
  if (o.outer != null && o.wall != null) throw new Error(`${what}: give outer (the boss's diameter) or wall (the plastic round the hole), not both`);
  const outer = o.outer != null ? positive(what, 'outer', o.outer) : r3(h.diameter + 2 * (o.wall != null ? positive(what, 'wall', o.wall) : least)), wall = r3((outer - h.diameter) / 2);
  if (wall < least - 1e-9) throw new Error(`${what}: ${mm(wall)} mm of wall round ${a(fx.thread)} insert's ${mm(h.diameter)} mm hole is thinner than the insert allows: ${cite(fx, 'insert_wall')} asks ${mm(least)} mm, so a boss ${mm(h.diameter + 2 * least)} mm across or more`);
  const height = o.height == null ? layers(through ? long : blind, pr.n('layer')) : positive(what, 'height', o.height);
  if (height < long - 1e-9) throw new Error(`${what}: the part is ${mm(height)} mm thick there and ${a(fx.thread)} insert ${mm(long)} mm long (${cite(fx, 'insert_length')}): it would stand proud. ${mm(long)} mm or more with { through: true }, ${mm(blind)} mm for a blind hole`);
  const depth = through ? height : blind, below = !through && height < blind - 1e-9 ? r3(blind - height) : 0, root = o.root == null ? pr.n('chamfer') : o.root;
  if (!(isNum(root) && root >= 0)) throw new Error(`${what}: root is the flare at the boss's foot, 0 mm or more (got ${shown(o.root)})`);
  out.push(finding('info', `a boss for ${a(fx.thread)} insert drawn ${mm(outer)} mm across and ${mm(height)} mm high round a ${mm(h.diameter)} mm hole ${through ? 'right through' : `${mm(depth)} mm deep`}: ${h.basis.rule}, as drawn (no hole compensation), with ${mm(wall)} mm of wall where ${cite(fx, 'insert_wall')} asks ${mm(least)} mm`,
    'insertBoss.drawn', { values: { hole: h.diameter, depth, outer, wall, least, height }, refs: { thread: fx.thread, set: fx.set } }));
  if (below) out.push(finding('warn', `the blind hole runs ${mm(below)} mm on under the boss's foot (${cite(fx, 'insert_depth')} asks ${mm(blind)} mm): what it stands on must be thicker than that there`, 'insertBoss.depth', { values: { below, depth, height } }));
  out.push(finding('pass', 'standing up, the boss is a plain column with its hole open above: it prints as drawn, and the insert goes in from the top', 'insertBoss.printable', { values: { into: '-z' } }));
  return { thread: fx.thread, hole: h.diameter, depth, through, outer, wall, least, height, root, lead: h.lead, below, insert: { diameter: figure(what, fx, 'insert_diameter'), length: long },
    rests: [...figures(fx, ['insert_hole', 'insert_wall', 'insert_length', 'insert_depth']), pr.rest('layer'), pr.rest('chamfer')], findings: out };
}

/**
 * A boss for a heat-set insert: the column to add, standing up from `at` (the middle of its foot), and the hole to
 * subtract once the boss is joined to what it stands on.
 * @param {Fixing | string} m @param {{ height?: number, outer?: number, wall?: number, through?: boolean, root?: number, printer?: object, sets?: object, at?: number[] }} [o] as insertBossModel
 * @returns {{ boss: object, hole: object, model: object }} boss: a JSCAD geom3 to add; hole: one to subtract
 */
export function insertBoss(m, o = {}) {
  const b = insertBossModel(m, o), at = pointOf('insertBoss', o.at), R = b.outer / 2, r = b.hole / 2;
  const boss = translate(at, lathe([[0, 0], [R + b.root, 0], [R, b.root], [R, b.height], [0, b.height]], SEGMENTS));
  const cut = along(bore([...(b.lead ? [[r + b.lead, 0], [r, b.lead]] : []), [r, b.depth]], { through: b.through }), '-z', [at[0], at[1], at[2] + b.height]);
  return { boss, hole: cut, model: b };
}

/**
 * What a printer can make of it, as findings. A fixing is bought, so it fails, and so does a screw, a nut, a washer
 * or an insert drawn as a light solid; a hole's, a seat's or a printed thread's model (or the solid made from one)
 * gives its finding on how it prints in the direction it was drawn for, and so does hardware with its thread drawn.
 * @param {object} x a fixing's model, a model from holeModel, threadModel, a seat's twin or a piece of hardware's, or a solid one of them made
 * @returns {object[]} findings
 */
export function printable(x) {
  const bought = (thread, item) => [finding('fail', `${a(thread)} ${item === 'thread' ? 'fixing' : item} is bought and fitted, not printed: its hole and its seat are what print (hole, counterbore, nutPocket)${['screw', 'nut'].includes(item) ? `, or draw it with its thread to print it ({ display: 'thread' })` : ''}`, 'fixing.printable')];
  if (x?.kind === 'fixing') return bought(x.thread, x.item);
  const model = x?.model && Array.isArray(x.model.findings) ? x.model : x?.model?.model && Array.isArray(x.model.model.findings) ? x.model.model : x;
  if (!model || !Array.isArray(model.findings)) throw new Error(`printable: give a fixing's model, or a hole's, a seat's or a thread's (holeModel, counterboreModel, nutPocketModel, threadModel), not ${shown(x)}`);
  const found = model.findings.filter((f) => typeof f.code === 'string' && f.code.endsWith('.printable'));
  return !found.length && ['screw', 'nut', 'washer', 'insert'].includes(model.item) ? bought(model.thread, model.item) : found;
}

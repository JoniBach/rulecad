// Seats for bought parts: the printed side of a bearing or a shaft, drawn so it prints without supports and says what
// fit it was drawn to. As with the print-aware features, sizes come in from rules: a bearing's from its rule set, the
// fit from the printer's (hole_comp, fit, press, slip), and each cutter starts at a point on a face (at) and goes into
// the material along a direction (into): '+x', '-x', '+y', '-y', '+z' (up from the bed) or '-z' (down from a top face).
//   seatSize(bearing, { fit, lip, printer })        the numbers: the pocket as drawn, its depth, the relief, the fit
//   bearingSeat(bearing, { fit, lip, relief, through, lead, printer, at, into })   a pocket to subtract, for the outer race
//   plainBearing(shaft, { clearance, length, wall, through, printer, at, into })   a bore to subtract, or with wall a bush to add
//   shaftShoulder(shaft, { shoulder, height, at })  a collar to add to a printed shaft, stood up: flat on top, 45° below
//   clipGroove(shaft, { width, depth, at })         a ring to subtract from a printed shaft, stood up: flat below, sloped above
import jscad from '@jscad/modeling';

const { cylinder, cylinderElliptic, cuboid, polygon } = jscad.primitives, { translate, rotateX, rotateY, rotateZ } = jscad.transforms;
const { hull } = jscad.hulls, { union } = jscad.booleans, { extrudeRotate } = jscad.extrusions;
const OUT = 0.1, TINY = 1e-3, EDGE = 0.05, SEGMENTS = 64;
const UP = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };

function along(g, into, at = [0, 0, 0]) {
  const turn = { '-z': (x) => x, '+z': (x) => rotateX(Math.PI, x), '+x': (x) => rotateY(-Math.PI / 2, x), '-x': (x) => rotateY(Math.PI / 2, x),
    '+y': (x) => rotateX(Math.PI / 2, x), '-y': (x) => rotateX(-Math.PI / 2, x) }[into];
  if (!turn) throw new Error(`into must be +x, -x, +y, -y, +z or -z (got ${into})`);
  return translate(at, turn(g));
}
function size(what, name, v, { zero = false } = {}) { if (!(typeof v === 'number' && Number.isFinite(v) && (zero ? v >= 0 : v > 0))) throw new Error(`${what}: ${name} is a size ${zero ? 'of 0 mm or more' : 'above 0 mm'} (got ${v})`); return v; }
// A round cutter from z0 down to z1 (radius r0 to r1), with a 45° ridge on the up side when it goes across a part
function tear(r0, r1, z0, z1, up) {
  const ridge = (r, z) => translate([up[0] * (r * Math.SQRT2 - EDGE / Math.SQRT2), up[1] * (r * Math.SQRT2 - EDGE / Math.SQRT2), z], rotateZ(Math.PI / 4, cuboid({ size: [EDGE, EDGE, TINY] })));
  const round = r0 === r1 ? translate([0, 0, (z0 + z1) / 2], cylinder({ radius: r0, height: Math.abs(z0 - z1), segments: SEGMENTS }))
    : translate([0, 0, (z0 + z1) / 2], cylinderElliptic({ height: Math.abs(z0 - z1), startRadius: [r1, r1], endRadius: [r0, r0], segments: SEGMENTS }));
  return up ? hull(round, ridge(r0, z0), ridge(r1, z1)) : round;
}
function printerOf(what, p) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the printer's rules ({ printer: v.x1c }): the fit is theirs, so there are no numbers here`);
  return p;
}
const FITS = ['press', 'slip'];
function bearingOf(what, b) {
  if (!b || typeof b !== 'object') throw new Error(`${what}: give the bearing's rules ({ bore, outer_diameter, width }), not ${b}`);
  const outer = b.outer_diameter ?? b.outer, bore = size(what, 'bore', b.bore);
  if (!(size(what, 'outer_diameter', outer) > bore)) throw new Error(`${what}: the outer diameter (${outer}) is above the bore (${bore})`);
  return { bore, outer, width: size(what, 'width', b.width) };
}

/**
 * What a seat is drawn to, in numbers. The pocket is the bearing's outside, plus the printer's hole compensation (printed
 * holes come out that much small across), less the press (or plus the slip).
 * @param {{ bore: number, outer_diameter: number, width: number }} bearing from its rule set
 * @param {{ fit?: 'press' | 'slip' | number, lip?: number, printer: { hole_comp: number, press?: number, slip?: number } }} o
 *   fit: a printed clearance across the diameter, or a name for the printer's; lip: how far the ledge reaches in under the
 *   outer race (default a quarter of the race's depth, so it never touches the inner race)
 * @returns {{ pocket: number, depth: number, relief: number, lip: number, fit: string | number, clearance: number, comp: number }}
 *   pocket: the diameter as drawn; relief: the diameter past the ledge; clearance: what's left across it once printed (below 0, a press)
 */
export function seatSize(bearing, { fit = 'press', lip, printer } = {}) {
  const what = 'bearingSeat', b = bearingOf(what, bearing), p = printerOf(what, printer), comp = size(what, 'printer.hole_comp', p.hole_comp, { zero: true });
  let clearance;
  if (typeof fit === 'number') clearance = fit;
  else if (fit === 'press') clearance = -size(what, 'printer.press', p.press, { zero: true });
  else if (fit === 'slip') clearance = size(what, 'printer.slip', p.slip, { zero: true });
  else throw new Error(`${what}: fit is ${FITS.join(' or ')}, or a clearance in mm (got ${fit})`);
  const radial = (b.outer - b.bore) / 2, ledge = lip ?? radial / 4;
  size(what, 'lip', ledge);
  if (ledge > radial / 2) throw new Error(`${what}: a lip of ${ledge} mm reaches the inner race (the races are ${radial} mm deep together: ${radial / 2} mm at most)`);
  const pocket = b.outer + comp + clearance;
  return { pocket: +pocket.toFixed(4), depth: b.width, relief: +(pocket - 2 * ledge).toFixed(4), lip: ledge, fit, clearance, comp };
}

/**
 * A pocket for a ball bearing's outer race, to subtract: the fit from the printer's rules, a ledge to stop against, and
 * a relief past it so the inner race runs free. Going down from a top face (-z) the ledge is flat; going up from the bed
 * (+z) it is a 45° cone that takes the race on its corner; across a part (±x, ±y) the pocket has a teardrop's 45° roof.
 * @param {{ bore: number, outer_diameter: number, width: number }} bearing
 * @param {{ fit?: 'press' | 'slip' | number, lip?: number, relief?: number, through?: boolean, lead?: number, printer: object, at?: number[], into?: string }} o
 *   relief: how far past the ledge (mm); through: run the relief out of the far face; lead: the lead-in chamfer at the mouth (none across a part, where its top half would overhang)
 * @returns {object} a JSCAD geom3 to subtract, with .seat holding seatSize's numbers
 */
export function bearingSeat(bearing, { fit = 'press', lip, relief = 1, through = false, into = '-z', lead = UP[into] ? 0 : 0.4, printer, at = [0, 0, 0] } = {}) {
  const what = 'bearingSeat', s = seatSize(bearing, { fit, lip, printer });
  size(what, 'relief', relief); size(what, 'lead', lead, { zero: true });
  const R = s.pocket / 2, r = s.relief / 2, up = UP[into] ?? null, D = s.depth, past = D + relief + (through ? OUT : 0);
  if (up) { // across a part, a teardrop's roof on each step
    const cuts = [tear(R, R, lead ? 0 : OUT, -D, up), tear(r, r, -D + EDGE, -past, up)];
    if (lead) cuts.push(tear(R + lead, R, 0, -lead, up), tear(R + lead, R + lead, OUT, 0, up));
    return Object.assign(along(union(cuts), into, at), { seat: s });
  }
  // Going up or down, one profile turned about the axis: no seams between the steps for a boolean to leak at
  const mouth = lead ? [[R + lead, OUT], [R + lead, 0], [R, -lead]] : [[R, OUT]], z0 = -D, floor = through ? Math.min(-past, -D - R) - OUT : -past;
  const inner = into === '+z' ? (through ? [[R, z0], [r, z0 - (R - r)], [r, floor]] : [[R, z0], [TINY, z0 - (R - TINY)]]) : [[R, z0], [r, z0], [r, -past]];
  const pts = [[0, OUT], ...mouth, ...inner, [0, inner.at(-1)[1]]].reverse();
  const turned = extrudeRotate({ segments: SEGMENTS }, polygon({ points: pts }));
  const g = along(turned, into, at);
  return Object.assign(g, { seat: s });
}

/**
 * A plain bearing for a shaft, where a ball bearing is more than the load needs. Its bore is the shaft plus the running
 * clearance each side, plus the printer's hole compensation. As a bore to subtract; given a wall, a bush standing up
 * from z = 0 to add (a tube lying down wouldn't print round).
 * @param {number} shaft diameter
 * @param {{ clearance?: number, length: number, wall?: number, through?: boolean, printer: object, at?: number[], into?: string }} o
 *   clearance: each side (default the printer's fit)
 * @returns {object} a JSCAD geom3, with .bore the diameter as drawn and .clearance each side
 */
export function plainBearing(shaft, { clearance, length, wall, through = false, printer, at = [0, 0, 0], into = '-z' } = {}) {
  const what = 'plainBearing', p = printerOf(what, printer);
  size(what, 'shaft', shaft); size(what, 'length', length);
  const gap = clearance ?? size(what, 'printer.fit', p.fit), comp = size(what, 'printer.hole_comp', p.hole_comp, { zero: true }), bore = +(shaft + 2 * size(what, 'clearance', gap) + comp).toFixed(4);
  if (wall == null) return Object.assign(along(tear(bore / 2, bore / 2, OUT, -length - (through ? OUT : 0), UP[into] ?? null), into, at), { bore, clearance: gap });
  size(what, 'wall', wall);
  if (UP[into]) throw new Error(`${what}: a bush with a wall prints standing up (into +z or -z): a tube on its side wouldn't print round. Bore across a part with no wall instead`);
  const outer = bore / 2 + wall, inner = bore / 2, chamfer = Math.min(0.4, wall / 2);
  const g = extrudeRotate({ segments: SEGMENTS }, polygon({ points: [[inner + chamfer, 0], [outer - chamfer, 0], [outer, chamfer], [outer, length], [inner, length], [inner, chamfer]] }));
  return Object.assign(translate(at, g), { bore, clearance: gap });
}

/**
 * A collar on a printed shaft, to add, stood up as it prints: a flat top for a bearing's inner race to stop against, and
 * a 45° underside so it starts from the shaft with nothing hanging.
 * @param {number} shaft diameter @param {{ shoulder: number, height: number, at?: number[] }} o shoulder: the collar's diameter;
 *   height: from where it leaves the shaft to its flat top; at: the point on the shaft's axis at its top
 * @returns {object} a JSCAD geom3 to add
 */
export function shaftShoulder(shaft, { shoulder, height, at = [0, 0, 0] } = {}) {
  const what = 'shaftShoulder', a = size(what, 'shaft', shaft) / 2, b = size(what, 'shoulder', shoulder) / 2;
  size(what, 'height', height);
  if (b <= a) throw new Error(`${what}: the shoulder (${shoulder}) stands proud of the shaft (${shaft})`);
  if (height < b - a) throw new Error(`${what}: a ${shoulder} mm collar on a ${shaft} mm shaft is ${b - a} mm of 45° underside, and ${height} mm isn't enough to draw it`);
  // the solid runs in to the axis, so it joins the shaft whatever the shaft is drawn as
  return translate(at, extrudeRotate({ segments: SEGMENTS }, polygon({ points: [[0, -height], [a - TINY, -height], [b, -height + (b - a) + TINY], [b, 0], [0, 0]] })));
}

/**
 * A groove round a printed shaft for a circlip or a printed clip, to subtract, stood up as it prints: a flat lower face
 * for the clip to bear on, a sloped upper face so nothing bridges.
 * @param {number} shaft diameter @param {{ width: number, depth: number, at?: number[] }} o width: of the flat part;
 *   depth: into the shaft each side; at: the point on the axis at the flat lower face
 * @returns {object} a JSCAD geom3 to subtract, with .root the diameter at the groove's root
 */
export function clipGroove(shaft, { width, depth, at = [0, 0, 0] } = {}) {
  const what = 'clipGroove', R = size(what, 'shaft', shaft) / 2;
  size(what, 'width', width); size(what, 'depth', depth);
  if (depth >= R / 2) throw new Error(`${what}: a groove ${depth} mm deep leaves too little of a ${shaft} mm shaft (under ${R / 2} mm)`);
  const r = R - depth, over = R + 1, rise = 1.2 * (over - r);
  // The upper face is a little steeper than 45° (a slope of exactly the limit is an overhang by a hair, sliced). The
  // cutter's outside runs 1 mm past the shaft, with its slope carried on so the face is one line
  const g = extrudeRotate({ segments: SEGMENTS }, polygon({ points: [[r, 0], [over, 0], [over, width + rise], [r, width]] }));
  return Object.assign(translate(at, g), { root: 2 * r });
}

/**
 * A pocket for a linear bearing's outside (an LM8UU), to subtract: a straight press or slip for its whole length, and on
 * through for the rod. Stood up (±z) or across (±x, ±y), with a teardrop's roof when across.
 * @param {{ outer_diameter: number, length: number, bore: number }} bearing
 * @param {{ fit?: 'press' | 'slip' | number, clearance?: number, through?: boolean, printer: object, at?: number[], into?: string }} o clearance: round the rod, each side
 * @returns {object} a JSCAD geom3 to subtract, with .pocket the diameter as drawn
 */
export function lm8uuPocket(bearing, { fit = 'press', clearance = 1, through = false, printer, at = [0, 0, 0], into = '-z' } = {}) {
  const what = 'lm8uuPocket', p = printerOf(what, printer), L = size(what, 'length', bearing?.length), s = seatSize({ bore: bearing?.bore, outer_diameter: bearing?.outer_diameter, width: L }, { fit, printer: p, lip: 0.01 }), up = UP[into] ?? null, R = s.pocket / 2, rod = bearing.bore / 2 + clearance;
  const cuts = [tear(R, R, OUT, -L, up)];
  if (into === '+z') { const rise = R - rod; cuts.push(tear(R, rod, -L, -L - rise)); cuts.push(tear(rod, rod, -L - rise / 2, -(L + rise + (through ? OUT : 2)))); } else cuts.push(tear(rod, rod, -L + EDGE, -(L + 2 + (through ? OUT : 0)), up));
  return Object.assign(along(union(cuts), into, at), { pocket: s.pocket, clearance: s.clearance });
}

/**
 * A pocket for a lead-screw nut, to subtract: its flange let in from a face, its body on through, and its bolts' holes on
 * their circle. Goes down from a top face; the flange sits flush.
 * @param {{ flange_diameter: number, flange_thickness?: number, body_diameter: number, length: number, hole_circle: number, hole_count: number, hole_diameter?: number }} nut
 * @param {{ fit?: number, printer: object, at?: number[], depth?: number }} o fit: clearance across the flange (default the printer's fit, each side)
 */
export function nutTrap(nut, { fit, printer, at = [0, 0, 0], depth } = {}) {
  const what = 'nutTrap', p = printerOf(what, printer), comp = size(what, 'printer.hole_comp', p.hole_comp, { zero: true }), gap = fit ?? 2 * size(what, 'printer.fit', p.fit), flange = size(what, 'flange_diameter', nut?.flange_diameter), body = size(what, 'body_diameter', nut.body_diameter), length = size(what, 'length', nut.length), circle = size(what, 'hole_circle', nut.hole_circle), n = size(what, 'hole_count', nut.hole_count), hole = nut.hole_diameter ?? 3.5;
  const t = nut.flange_thickness ?? 3.5, D = depth ?? length, r = (body + comp + gap) / 2, R = (flange + comp + gap) / 2;
  if (circle / 2 + hole / 2 > R + 0.01 || circle / 2 - hole / 2 < r) throw new Error(`nutTrap: holes on a ${circle} mm circle don't fall between the ${body} mm body and the ${flange} mm flange`);
  const cuts = [tear(R, R, OUT, -t), tear(r, r, -t + EDGE, -D - OUT)], holes = Array.from({ length: n }, (_, i) => { const a = (i * 2 * Math.PI) / n; return translate([(circle / 2) * Math.cos(a), (circle / 2) * Math.sin(a), 0], tear((hole + comp) / 2, (hole + comp) / 2, 0, -D - OUT)); });
  return Object.assign(translate(at, union(...cuts, ...holes)), { flange: 2 * R, body: 2 * r });
}

/**
 * A bore for a pulley on a stepper's round shaft (no flat: a pulley's grub screw bears on the shaft), or a plain idler's
 * axle, to subtract. A pass-through with a chamfered mouth.
 * @param {{ bore: number }} pulley @param {{ length: number, printer: object, at?: number[], into?: string, through?: boolean }} o
 */
export function pulleyBore(pulley, { length, printer, at = [0, 0, 0], into = '-z', through = false } = {}) {
  return plainBearing(size('pulleyBore', 'bore', pulley?.bore), { length, printer, at, into, through, clearance: printerOf('pulleyBore', printer).slip ?? printer.fit / 2 });
}

/**
 * A comb that grips a GT2 belt, to add: teeth of the belt's pitch on a block, the belt pressed in face first and held by
 * a plain cover. Printed teeth up, so nothing overhangs.
 * @param {{ pitch: number, width: number }} belt @param {{ length: number, height: number, wall: number, at?: number[] }} o
 * @returns {object} a JSCAD geom3 to add, x along the belt, z up
 */
export function beltClamp(belt, { length, height, wall, at = [0, 0, 0] } = {}) {
  const what = 'beltClamp', pitch = size(what, 'pitch', belt?.pitch), width = size(what, 'width', belt.width);
  size(what, 'length', length); size(what, 'height', height); size(what, 'wall', wall);
  const count = Math.floor(length / pitch), base = translate([0, 0, height / 2], cuboid({ size: [length, width + 2 * wall, height] })), teeth = [], tooth = pitch * 0.45;
  for (let i = 0; i < count; i++) teeth.push(translate([-length / 2 + pitch * (i + 0.5), 0, height + 0.375], cuboid({ size: [tooth, width + 2 * wall, 0.75] })));
  return translate(at, union(base, ...teeth));
}

// Print-aware features: the holes, pockets and ribs printed parts keep needing, drawn so they print without supports
// in the part's print orientation (z up, the bed at the bottom). Each returns a JSCAD geom3 to subtract from the part
// (crushRibs: to add). Sizes come in from rules (m3.csk_head, m3.nut_flats, x1c.hole_comp …): no numbers live here.
// Every feature starts at a point on a face (at) and goes into the material along a direction (into): '+x', '-x',
// '+y', '-y', '+z' (up from the bed) or '-z' (down from a top face).
//   countersink({ hole, head, length, at, into, teardrop })   a flat-head screw's hole and its 90° cone, the head flush
//     with the face at `at`
//   teardropHole({ d, length, at, into })   a round hole across a part (into ±x or ±y) with a 45° pointed roof
//   nutPocket({ flats, height, hole, at, into })   a hex pocket for a captive nut, open at the face: going up (+z) it
//     gets a 45° hexagonal roof to the hole; across (±x, ±y) a flat top (a bridge across the flats)
//   crushRibs({ at, into, z, radius, protrude })   half-round ribs standing protrude into a pocket from its wall, each at
//     a point on the wall (at: [[x, y], …]) facing into the pocket (into: [[nx, ny], …], unit vectors), from z[0] to z[1]
//   wallOpening({ width, height, depth, at, into })   a square-cornered opening through an upright wall (into ±x or ±y),
//     from the point at on its face (centred), depth into it. Its top is a bridge as wide as the opening: given the
//     printer's bridge, a wider one rises at 45° each side to a flat that wide (height is the square part)
import jscad from '@jscad/modeling';

const { cylinder, cylinderElliptic, cuboid } = jscad.primitives, { translate, rotateX, rotateY, rotateZ } = jscad.transforms;
const { hull } = jscad.hulls, { union } = jscad.booleans;
const TINY = 1e-3; // a slice's thickness, where a hull comes to a point
const OUT = 0.1; // how far a cutter starts outside the face it enters by, so no faces lie on each other
const EDGE = 0.05; // a ridge's width: a sharp point, without the slivers a vanishing one leaves

// A cutter drawn going down from z = 0 (into = -z), turned to go along `into` from the origin, then moved to `at`
function along(g, into, at = [0, 0, 0]) {
  const turn = { '-z': (x) => x, '+z': (x) => rotateX(Math.PI, x), '+x': (x) => rotateY(-Math.PI / 2, x), '-x': (x) => rotateY(Math.PI / 2, x),
    '+y': (x) => rotateX(Math.PI / 2, x), '-y': (x) => rotateX(-Math.PI / 2, x) }[into];
  if (!turn) throw new Error(`into must be +x, -x, +y, -y, +z or -z (got ${into})`);
  return translate(at, turn(g));
}
// Which way is up (+z in the part) in a cutter's own drawing, for one going across: where its roof points
const UP = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
const across = (into) => into in UP;

// A round cutter from z = z0 down to z1, and its 45° ridge on the up side (r(z) the radius at each end)
function tear(r0, r1, z0, z1, up) {
  // The ridge: a thin square turned 45° about the cutter's axis, its far corner at r√2, so the roof meets it at 45°
  const ridge = (r, z) => translate([up[0] * (r * Math.SQRT2 - EDGE / Math.SQRT2), up[1] * (r * Math.SQRT2 - EDGE / Math.SQRT2), z], rotateZ(Math.PI / 4, cuboid({ size: [EDGE, EDGE, TINY] })));
  const round = r0 === r1 ? translate([0, 0, (z0 + z1) / 2], cylinder({ radius: r0, height: Math.abs(z0 - z1), segments: 48 }))
    : translate([0, 0, (z0 + z1) / 2], cylinderElliptic({ height: Math.abs(z0 - z1), startRadius: [r1, r1], endRadius: [r0, r0], segments: 48 }));
  return up ? hull(round, ridge(r0, z0), ridge(r1, z1)) : round;
}

/** A flat-head screw's hole and 90° countersink, the head flush with the face at `at`. */
export function countersink({ hole, head, length, at = [0, 0, 0], into = '-z', teardrop = across(into) }) {
  const up = teardrop ? UP[into] : null, cone = (head - hole) / 2;
  return along(union(tear(head / 2, head / 2, OUT, 0, up), tear(head / 2, hole / 2, 0, -cone, up), tear(hole / 2, hole / 2, -cone / 2, -length, up)), into, at); // overlapping, not touching: clean seams
}

/** A round hole across a part, with a 45° roof so it prints without support. */
export function teardropHole({ d, length, at = [0, 0, 0], into = '+x' }) {
  if (!across(into)) throw new Error('teardropHole goes across a part: into ±x or ±y (a hole up or down is a plain cylinder)');
  return along(tear(d / 2, d / 2, OUT, -length, UP[into]), into, at);
}

/** A hex pocket for a captive nut, open at the face at `at`, with its roof drawn to print. */
export function nutPocket({ flats, height, hole, at = [0, 0, 0], into = '-z' }) {
  const corner = flats / 2 / Math.cos(Math.PI / 6);
  // Across, a flat on top (a short bridge); going up, a corner along x either way
  const hex = (g) => (across(into) && UP[into][0] !== 0 ? rotateZ(Math.PI / 6, g) : g);
  const pocket = translate([0, 0, -height / 2], cylinder({ radius: corner, height, segments: 6 }));
  if (into !== '+z') return along(hex(pocket), into, at);
  // Going up from the bed face: a 45° hexagonal roof from the corners to the hole, so nothing spans
  const rise = corner - hole / 2;
  const roof = translate([0, 0, -height - rise / 2], cylinderElliptic({ height: rise, startRadius: [hole / 2, hole / 2], endRadius: [corner, corner], segments: 6 }));
  return along(union(pocket, roof), into, at);
}

/** Half-round crush ribs on a pocket's wall, for a press fit that takes a range of sizes. To add to the part. */
export function crushRibs({ at, into, z, radius, protrude }) {
  return union(...at.map(([x, y], i) => {
    const [nx, ny] = into[i] || into[0], back = radius - protrude;
    return translate([x - nx * back, y - ny * back, (z[0] + z[1]) / 2], cylinder({ radius, height: z[1] - z[0], segments: 24 }));
  }));
}

/** A square-cornered opening through an upright wall, centred on at (a cable's plug, a switch). */
export function wallOpening({ width, height, depth, at = [0, 0, 0], into = '-y', bridge }) {
  if (!across(into)) throw new Error('wallOpening goes through an upright wall: into ±x or ±y');
  const long = depth + OUT, w = into.endsWith('x') ? [long, width, height] : [width, long, height], dir = into[0] === '+' ? 1 : -1;
  const off = into.endsWith('x') ? [dir * (depth - OUT) / 2, 0, 0] : [0, dir * (depth - OUT) / 2, 0];
  const box = cuboid({ size: w });
  if (bridge == null || width <= bridge) return translate(at.map((a, k) => a + off[k]), box);
  // Wider than the printer bridges: the top rises at 45° each side to a flat as wide as it can span
  const rise = (width - bridge) / 2, top = translate([0, 0, height / 2 + rise], cuboid({ size: into.endsWith('x') ? [long, bridge, TINY] : [bridge, long, TINY] }));
  return translate(at.map((a, k) => a + off[k]), hull(box, top));
}

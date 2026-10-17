// Enclosure helpers: the pieces printed cases are made of, drawn the same way everywhere, so a family of parts looks
// like one system. Footprints are in x and y, centred on 0; z is up, from the bed. Every slope is 45 degrees, so
// everything prints without supports when the part lies as drawn.
//   outline(w, h, { round, bevel })   a rectangle with rounded (round: radius) or cut (bevel: along each side) corners
//   slab({ width, height, depth, round, bevel, bottom, top })   a block on that outline; bottom and top slope its lower
//     and upper edges in at 45 degrees (bottom: against elephant's foot; top: a bevelled front edge)
//   shell({ ...slab, wall, floor })   a slab hollowed out from floor up, open at the top
//   lid({ width, height, round, bevel, thick, edge, wall, fit, lip, ring })   a lid printed face down: its front edge
//     sloped (edge), a lip on top that drops inside a shell's walls (fit away) to locate it
//   dovetail({ base, height, gap })   a rail's 2D profile, rising from y = 0 (gap > 0: the slot that takes it, gap wider
//     each side and deeper)
//   gabled([x0, x1], [y0, y1], [z0, z1], axis)   a box with a 45 degree gabled roof, for openings in upright walls
//   diamond(size, axis)   a square hole turned 45 degrees about axis ('x' | 'y'), for small holes in upright walls
//   vents({ count, width, pitch, length, depth })   slots side by side along x, centred, each length long in z
import jscad from '@jscad/modeling';

const { polygon, roundedRectangle, rectangle, cuboid } = jscad.primitives, { extrudeLinear } = jscad.extrusions;
const { translate, rotateX, rotateY } = jscad.transforms, { subtract, union } = jscad.booleans, { hull } = jscad.hulls;
const THIN = 1e-3; // the height of a slice that hulls join into slopes

/** A rectangle with rounded or cut corners, centred on 0. @returns {object} geom2 */
export function outline(w, h, { round = 0, bevel = 0, segments = 32 } = {}) {
  if (w <= 0 || h <= 0) throw new Error(`outline: ${w} × ${h} mm is not a shape`);
  if (round > 0) return roundedRectangle({ size: [w, h], roundRadius: Math.min(round, w / 2 - THIN, h / 2 - THIN), segments });
  if (bevel > 0) { const b = Math.min(bevel, w / 2, h / 2); return polygon({ points: [[-w / 2 + b, -h / 2], [w / 2 - b, -h / 2], [w / 2, -h / 2 + b], [w / 2, h / 2 - b], [w / 2 - b, h / 2], [-w / 2 + b, h / 2], [-w / 2, h / 2 - b], [-w / 2, -h / 2 + b]] }); }
  return rectangle({ size: [w, h] });
}

// The outline moved in by d all round: a rounded corner keeps its centre, a cut corner its angle
const inset = (o, d) => ({ ...o, width: o.width - d * 2, height: o.height - d * 2, round: o.round ? Math.max(o.round - d, 0) : 0, bevel: o.bevel ? Math.max(o.bevel - d * (2 - Math.SQRT2), 0) : 0 });
const slice = (o, d, z0, z1 = z0 + THIN) => translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, outline(o.width - d * 2, o.height - d * 2, inset(o, d))));

/** A block on an outline, its lower and upper edges sloped in at 45 degrees by bottom and top. @returns {object} geom3 */
export function slab({ width, height, depth, round = 0, bevel = 0, bottom = 0, top = 0, segments = 32 }) {
  const o = { width, height, round, bevel, segments };
  if (bottom + top >= depth) throw new Error(`slab: slopes of ${bottom} and ${top} mm need more than ${depth} mm of depth`);
  if (!bottom && !top) return slice(o, 0, 0, depth);
  return hull(slice(o, bottom, 0), slice(o, 0, bottom, depth - top), slice(o, top, depth - THIN));
}

/** A slab hollowed from floor up, open at the top; the walls wall thick. @returns {object} geom3 */
export function shell({ wall, floor, ...o }) {
  const room = inset({ ...o, round: o.round || 0, bevel: o.bevel || 0 }, wall);
  return subtract(slab(o), translate([0, 0, floor], extrudeLinear({ height: o.depth }, outline(room.width, room.height, room))));
}

/**
 * A lid printed face down: a plate thick deep whose front edge slopes in by edge (on the bed), and on top a lip, ring
 * wide, that drops lip deep inside a shell's walls (wall thick) with fit to spare. @returns {object} geom3
 */
export function lid({ width, height, round = 0, bevel = 0, thick, edge = 0, wall, fit, lip, ring, segments = 32 }) {
  const o = { width, height, round, bevel, segments };
  const plate = slab({ ...o, depth: thick, bottom: edge });
  if (!lip) return plate;
  const out = inset(o, wall + fit), hole = inset(o, wall + fit + ring);
  const band = subtract(outline(out.width, out.height, out), outline(hole.width, hole.height, hole));
  return union(plate, translate([0, 0, thick], extrudeLinear({ height: lip }, band)));
}

/** A dovetail rail's profile (gap 0) or the slot that takes it (gap > 0), rising from y = 0, flanks at 45 degrees. */
export function dovetail({ base, height, gap = 0 }) {
  const b = base / 2 + gap, t = b + height + (gap ? gap : 0), y = height + gap;
  return polygon({ points: [[-b, gap ? -1 : 0], [b, gap ? -1 : 0], [b, 0], [t, y], [-t, y], [-b, 0]] });
}

/** A box [x0, x1] × [y0, y1] × [z0, z1] with a 45 degree gabled roof above z1, its ridge along axis ('x' or 'y'). */
export function gabled([x0, x1], [y0, y1], [z0, z1], axis = 'y') {
  const box = (a0, a1, b0, b1, c0, c1) => translate([(a0 + a1) / 2, (b0 + b1) / 2, (c0 + c1) / 2], cuboid({ size: [a1 - a0, b1 - b0, c1 - c0] }));
  const half = axis === 'y' ? (x1 - x0) / 2 : (y1 - y0) / 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const ridge = axis === 'y' ? box(mx - THIN, mx + THIN, y0, y1, z1, z1 + half) : box(x0, x1, my - THIN, my + THIN, z1, z1 + half);
  return hull(box(x0, x1, y0, y1, z0, z1), ridge);
}

/** A square hole size wide turned 45 degrees about axis, through length, centred on 0. */
export function diamond(size, axis = 'y', length = 10) {
  const a = size / Math.SQRT2;
  return axis === 'y' ? rotateY(Math.PI / 4, cuboid({ size: [a, length, a] })) : rotateX(Math.PI / 4, cuboid({ size: [length, a, a] }));
}

/** Vent slots side by side along x, centred on 0: count of them, width wide, pitch apart, length long in z, depth in y. */
export function vents({ count, width, pitch, length, depth }) {
  return union(...Array.from({ length: count }, (_, i) => translate([(i - (count - 1) / 2) * pitch, 0, 0], cuboid({ size: [width, depth, length] }))));
}

// Optimised layouts as shapes: the outlines @rulecad/topopt finds (v.problems[name] in a design, from cad optimise),
// as a JSCAD 2D shape to extrude. Outlines are closed loops, solid on the left (outer edges counter-clockwise, holes
// clockwise), so they make one shape with its holes as they are. The problem's keep regions are added back exactly
// and its avoid regions cut exactly, so bolt holes and the bosses round them come out true to size, not stepped.
//   fromOutlines(loops)                     the loops as one 2D shape
//   optimisedOutline(result, { segments })  a result's outline with its keep regions added and avoid regions cut
import jscad from '@jscad/modeling';

const { geom2 } = jscad.geometries, { circle, rectangle, polygon } = jscad.primitives, { union, subtract } = jscad.booleans;

/**
 * Closed loops (solid on the left) as one JSCAD 2D shape.
 * @param {[number, number][][]} loops
 */
export function fromOutlines(loops) {
  const sides = [];
  for (const l of loops) for (let i = 0; i < l.length; i++) sides.push([l[i], l[(i + 1) % l.length]]);
  return geom2.create(sides);
}

/**
 * A region of a problem (a circle, a centred rectangle or a polygon) as a JSCAD 2D shape.
 * @param {{ at?: [number, number], r?: number, size?: [number, number], points?: [number, number][] }} r
 * @param {number} [segments]
 */
export function regionShape(r, segments = 48) {
  if (r.points) return polygon({ points: r.points });
  if (r.size) return rectangle({ center: r.at, size: r.size });
  return circle({ center: r.at, radius: r.r, segments });
}

/**
 * An optimised result's outline, its keep regions added and avoid regions cut exactly.
 * @param {{ outlines: [number, number][][], regions: { keep: object[], avoid: object[] } }} result
 * @param {{ segments?: number }} [options]
 */
export function optimisedOutline(result, { segments = 48 } = {}) {
  let shape = fromOutlines(result.outlines);
  if (result.regions.keep.length) shape = union(shape, ...result.regions.keep.map((r) => regionShape(r, segments)));
  if (result.regions.avoid.length) shape = subtract(shape, ...result.regions.avoid.map((r) => regionShape(r, segments)));
  return shape;
}

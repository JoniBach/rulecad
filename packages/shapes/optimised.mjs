// Optimised layouts as shapes: the outlines @rulecad/topopt finds (v.problems[name] in a design, from cad optimise),
// as a JSCAD 2D shape to extrude. Outlines are closed loops, solid on the left (outer edges counter-clockwise, holes
// clockwise), so they make one shape with its holes as they are. The problem's keep regions are added back exactly
// and its avoid regions cut exactly, so bolt holes and the bosses round them come out true to size, not stepped.
//   fromOutlines(loops)                     the loops as one 2D shape
//   optimisedOutline(result, { segments })  a 2D result's outline with its keep regions added and avoid regions cut
//   optimisedSolid(result, { ops })         a 3D result's surface as a solid, its keep regions added and avoid regions
//                                           cut (boxes, cylinders and balls; a part kept is the design's to add). The
//                                           mesh is big: pass v.ops, with the object's engine set to manifold
import jscad from '@jscad/modeling';

const { geom2 } = jscad.geometries, { circle, rectangle, polygon, polyhedron, cuboid, cylinder, sphere } = jscad.primitives, { union, subtract } = jscad.booleans;
const { rotateX, rotateY, rotateZ, translate } = jscad.transforms, { hull } = jscad.hulls;

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

/**
 * A 3D region (a box, a cylinder along x, y or z, a teardrop, or a ball) as a JSCAD solid; a part's mesh region gives
 * null.
 * @param {{ at?: number[], r?: number, size?: number[], length?: number, axis?: string, teardrop?: string, part?: string }} r
 * @param {number} [segments]
 */
export function solidRegion(r, segments = 48) {
  if (r.part || r.triangles) return null;
  if (r.size) return cuboid({ center: r.at, size: r.size });
  if (r.length != null) {
    const c = cylinder({ radius: r.r, height: r.length, segments }), axis = r.axis || 'z', ax = 'xyz'.indexOf(axis);
    const turned = translate(r.at, axis === 'x' ? rotateY(Math.PI / 2, c) : axis === 'y' ? rotateZ(Math.PI / 2, rotateY(Math.PI / 2, c)) : c);
    // A teardrop (across the axis): the cylinder hulled with a thin ridge r√2 from its axis, below it (a boss) or
    // above it (a hole), so that side is 45°
    // The ridge: a thin slice of a square turned 45° about the axis at each end, its far corner a little past r√2: a
    // round of segments is a little inside its circle, so the faces from it to a point at exactly r√2 would be a touch
    // flatter than 45°
    const pa = r.teardrop ? 'xyz'.indexOf(r.teardrop[1]) : -1;
    if (pa < 0 || pa === ax) return turned;
    const edge = 0.05, slice = 1e-3, reach = (r.teardrop[0] === '-' ? -1 : 1) * (r.r * Math.SQRT2 / Math.cos(Math.PI / segments) - edge / Math.SQRT2);
    const square = [0, 1, 2].map((a) => (a === ax ? slice : edge)), spin = [rotateX, rotateY, rotateZ][ax];
    const end = (along) => translate(r.at.map((x, a) => x + (a === pa ? reach : 0) + (a === ax ? along : 0)), spin(Math.PI / 4, cuboid({ size: square })));
    return hull(turned, end((slice - r.length) / 2), end((r.length - slice) / 2));
  }
  return sphere({ center: r.at, radius: r.r, segments });
}

/**
 * A 3D optimised result's surface as a solid, its keep regions added and avoid regions cut exactly.
 * @param {{ mesh: { vertices: number[][], faces: number[][] }, regions: { keep: object[], avoid: object[] } }} result
 * @param {{ ops?: { union: Function, subtract: Function }, segments?: number }} [options] ops: v.ops (Manifold, ideally)
 */
export function optimisedSolid(result, { ops, segments = 48 } = {}) {
  const o = ops || { union, subtract };
  let solid = polyhedron({ points: result.mesh.vertices, faces: result.mesh.faces, orientation: 'outward' });
  const keep = result.regions.keep.map((r) => solidRegion(r, segments)).filter(Boolean), avoid = result.regions.avoid.map((r) => solidRegion(r, segments)).filter(Boolean);
  if (keep.length) solid = o.union(solid, ...keep);
  if (avoid.length) solid = o.subtract(solid, ...avoid);
  return solid;
}

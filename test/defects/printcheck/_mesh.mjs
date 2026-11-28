// Shared by the printcheck cases: one printer, boxes as triangles, and JSCAD shapes as triangles.
import jscad from '@jscad/modeling';
export { box } from '../../box.mjs';
/** A printer like the X1C with its 0.2 mm breakaway gap; the numbers each case is judged by. */
export const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42 };
/** A JSCAD solid as triangles. */
export const trianglesOf = (g) => jscad.geometries.geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [[...p.vertices[0]], [...p.vertices[i + 1]], [...p.vertices[i + 2]]]));
/** A round column 8 mm across and 5 mm tall under a wider collar, joined by a cone leaning `deg` from upright over `reach` mm, turned on 96 sides. */
export function collar(deg, reach) {
  const rise = reach / Math.tan((deg * Math.PI) / 180), r = 4, z = 5;
  const outline = [[0, 0], [r, 0], [r, z], [r + reach, z + rise], [r + reach, z + rise + 3], [0, z + rise + 3]];
  return trianglesOf(jscad.extrusions.extrudeRotate({ segments: 96 }, jscad.primitives.polygon({ points: outline })));
}

// Test shapes made with JSCAD (a development dependency only: the packages themselves import nothing), as the
// triangles a CAD program hands over.
import jscad from '@jscad/modeling';

export const { cuboid } = jscad.primitives;
export const { translate } = jscad.transforms;
export const { union } = jscad.booleans;
export const tri = (...shapes) => shapes.flatMap((g) => jscad.geometries.geom3.toPolygons(jscad.modifiers.generalize({ snap: true, triangulate: true }, g)).map((p) => p.vertices.map((v) => [...v])));

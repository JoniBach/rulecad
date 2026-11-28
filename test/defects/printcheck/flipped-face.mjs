// A 20 mm cube with one triangle of a side turned the wrong way round: the surface is closed, but one face points in.
import { box, printer } from './_mesh.mjs';
export default { triangles: box([0, 0, 0], [20, 20, 20]).map((t, i) => (i === 5 ? [t[0], t[2], t[1]] : t)), printer };

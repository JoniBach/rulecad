// The same cube with one triangle missing: a real hole in the surface.
import { box, printer } from './_mesh.mjs';
export default { triangles: box([0, 0, 0], [20, 20, 20]).slice(1), printer };

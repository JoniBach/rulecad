// The same slab over a pad as big as it: the whole underside rests on the breakaway support.
import { box, printer } from './_mesh.mjs';
export default { triangles: [...box([-20, -20, 10], [20, 20, 12]), ...box([-20, -20, 0], [20, 20, 9.8])], printer };

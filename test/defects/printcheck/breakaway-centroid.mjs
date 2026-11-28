// A 40 x 40 mm slab 0.2 mm above a 14 x 14 mm pad: the slab's underside is two triangles whose centres lie over the
// pad, but 13 mm of slab hangs free on every side.
import { box, printer } from './_mesh.mjs';
export default { triangles: [...box([-20, -20, 10], [20, 20, 12]), ...box([-7, -7, 0], [7, 7, 9.8])], printer };

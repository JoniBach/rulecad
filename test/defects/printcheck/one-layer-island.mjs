// A 20 x 20 mm slab one layer (0.2 mm) above a 20 x 20 mm block: a breakaway support, within the printer's
// support_gap. Sliced, the gap is an empty layer, so the slab's first layer has nothing seen below it.
import { box, printer } from './_mesh.mjs';
export default { triangles: [...box([0, 0, 0], [20, 20, 10]), ...box([0, 0, 10.2], [20, 20, 12])], printer };

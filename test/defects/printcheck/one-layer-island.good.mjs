// The same slab three layers (0.6 mm) above the block: more than the printer's support_gap, so nothing holds it.
import { box, printer } from './_mesh.mjs';
export default { triangles: [...box([0, 0, 0], [20, 20, 10]), ...box([0, 0, 10.6], [20, 20, 12])], printer };

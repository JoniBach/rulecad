// The same collar leaning 40 degrees from upright: within the printer's 45.
import { collar, printer } from './_mesh.mjs';
export default () => ({ triangles: collar(40, 1.15), printer });

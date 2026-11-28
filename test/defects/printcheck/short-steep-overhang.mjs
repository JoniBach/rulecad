// A collar leaning 75 degrees from upright over 1.15 mm: steeper than the printer's 45, but each layer steps out
// only about half a line, so the layer check's grace lets it through.
import { collar, printer } from './_mesh.mjs';
export default () => ({ triangles: collar(75, 1.15), printer });

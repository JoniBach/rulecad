// A 2 m square panel 3 mm thick, made of twelve triangles, with a small box passing through it. The overlap search
// files each 2 m triangle in fixed 2 mm cubes, about a million of them.
import { box } from '../../box.mjs';
export default { a: box([0, 0, 0], [2000, 2000, 3]), b: box([1000, 1000, -1], [1010, 1010, 10]) };

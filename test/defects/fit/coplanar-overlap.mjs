// Two 10 mm cubes on one plane, the second moved 5 mm along x: they share half their volume, and every face of each
// lies in a face plane of the other.
import { box } from '../../box.mjs';
export default { a: box([0, 0, 0], [10, 10, 10]), b: box([5, 0, 0], [15, 10, 10]) };

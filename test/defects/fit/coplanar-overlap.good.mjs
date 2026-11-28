// The same two cubes face to face, the second moved 10 mm: they touch and do not overlap.
import { box } from '../../box.mjs';
export default { a: box([0, 0, 0], [10, 10, 10]), b: box([10, 0, 0], [20, 10, 10]) };

// What the machine can reach on the plane its pen moves on, worked out off the page's thread. The chain and the area
// are the link's data; the answer is one row per sample: x, y, z, reachable (0 or 1).
import { chainFromMotion, reach } from './robots/robots.mjs';

onmessage = ({ data: { motion, tip, tool, sheet, step, elbow } }) => {
  try {
    const c = chainFromMotion(motion, { tip, tool }), { samples, summary } = reach(c, { sheet, step, ...(elbow ? { elbow } : {}) });
    postMessage({ cells: samples.map((x) => [x.point[0], x.point[1], x.point[2], x.reachable ? 1 : 0]), reachable: summary.reachable, total: summary.total });
  } catch (e) { postMessage({ error: e.message }); }
};

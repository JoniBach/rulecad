// The print check of a dropped STL, off the page's thread: slicing a curved part takes seconds, and the page should
// turn and answer meanwhile. In: { tris: Float32Array (x, y, z of each corner), printer }. Out: { findings }, or
// { error } in plain words.
import { check } from './printcheck.mjs';

onmessage = ({ data: { tris, printer } }) => {
  try {
    const polys = [];
    for (let i = 0; i < tris.length; i += 9) polys.push([[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]]);
    postMessage({ findings: check(polys, printer) });
  } catch (e) { postMessage({ error: e.message }); }
};

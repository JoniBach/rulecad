// The slicer's view, off the page's thread: the model's triangles cut at every layer, each layer checked against the
// one below (islands, in printcheck.mjs). Posts { progress } as it goes, then { islands, layers, overhang, lo, layer }.
// In: { tris: Float32Array (x, y, z of each corner, JSCAD's Z up), printer: { layer, overhang, line } }.
import { islands, bounds } from './printcheck.mjs';

onmessage = ({ data: { tris, printer } }) => {
  const polys = [];
  for (let i = 0; i < tris.length; i += 9) polys.push([[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]]);
  if (!polys.length) return postMessage({ islands: [], layers: 0, overhang: 0, lo: 0, layer: printer.layer });
  let last = 0;
  const found = islands(polys, { ...printer, onLayer: (L, n) => { const now = Date.now(); if (now - last > 150) { last = now; postMessage({ progress: L / n }); } } });
  postMessage({ islands: found.islands.map(({ z, area, at, cells }) => ({ z, area, at, cells })), layers: found.layers, overhang: found.overhang, lo: bounds(polys).lo[2], layer: printer.layer });
};

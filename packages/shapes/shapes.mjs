// Shape helpers for JSCAD designs that are printed: text that prints, placing things on a face, and the pieces of
// enclosures (enclosure.mjs: outlines, slabs, shells, lids, dovetail rails, print-safe holes, vents), and print-aware
// features (features.mjs: countersinks, teardrop holes, nut pockets, crush ribs, wall openings).
//   text({ text, height, stroke, segments }) -> a 2D outline of the text, centred on 0: JSCAD's single-line
//     font, scaled so a capital is height tall, each line thickened to stroke wide (whole print lines, so it prints).
//     The arrows the font lacks (up, down, left, right) are drawn in the same stroke.
//   anchor({ width, depth }, size, at) -> [x, y]: where something size wide and deep goes on a face width ×
//     depth (centred on 0, y to the back) at one of 9 anchors: tl tc tr / ml mc mr / bl bc br
import jscad from '@jscad/modeling';
import { ANCHORS } from '@rulecad/variables';

const { vectorText } = jscad.text, { path2 } = jscad.geometries, { expand } = jscad.expansions, { circle } = jscad.primitives;
const { union, subtract } = jscad.booleans, { translate, scale } = jscad.transforms, { measureBoundingBox } = jscad.measurements;

// Arrows the font doesn't have, as lines in a box height tall: a shaft and a head, pointing up, then turned
const ARROWS = { '↑': 0, '→': -90, '↓': 180, '←': 90 };
function arrow(char, height) {
  const h = height / 2, head = height * 0.35, turn = (ARROWS[char] * Math.PI) / 180;
  const r = ([x, y]) => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
  return [[[0, -h], [0, h]], [[-head, h - head], [0, h], [head, h - head]]].map((l) => l.map(r));
}

/**
 * Text as a 2D outline that prints: JSCAD's single-line font, a capital `height` tall, lines `stroke` wide.
 * @param {{ text: string, height: number, stroke: number, segments?: number }} options
 * @returns {object} a JSCAD geom2
 */
export function text({ text: input, height, stroke, segments = 8 }) {
  if (!input) throw new Error('text: nothing to write');
  if (input in ARROWS) return union(...arrow(input, height).map((l) => expand({ delta: stroke / 2, corners: 'round', segments }, path2.fromPoints({}, l))));
  const lines = vectorText({ height, input }).filter((l) => l.length > 1);
  if (!lines.length) throw new Error(`text: the font has none of "${input}"`);
  // One scale for every legend: a capital H is height tall, so a dash or a full stop stays small. Then centre the text
  // on its own outline, and thicken the lines (after scaling, so the stroke is exactly as wide as asked)
  const capital = measureBoundingBox(path2.fromPoints({}, vectorText({ height, input: 'H' }).flat()));
  const k = height / (capital[1][1] - capital[0][1] || 1);
  const [lo, hi] = measureBoundingBox(path2.fromPoints({}, lines.flat()));
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  // Each line, scaled; points closer than half a stroke are dropped (thickening them would fold the outline over itself),
  // and a line smaller than the stroke (a full stop's tiny loop) becomes a round dot
  const strokes = lines.map((l) => {
    const pts = l.map(([x, y]) => [(x - cx) * k, (y - cy) * k]), kept = [pts[0]];
    for (const p of pts.slice(1)) if (Math.hypot(p[0] - kept.at(-1)[0], p[1] - kept.at(-1)[1]) >= stroke / 2) kept.push(p);
    const span = Math.max(...[0, 1].map((i) => Math.max(...pts.map((p) => p[i])) - Math.min(...pts.map((p) => p[i]))));
    if (kept.length < 2 || span < stroke) {
      const c = [0, 1].map((i) => (Math.max(...pts.map((p) => p[i])) + Math.min(...pts.map((p) => p[i]))) / 2);
      return circle({ center: c, radius: Math.max(stroke * 0.75, (span + stroke) / 2), segments: segments * 2 });
    }
    // Each straight piece thickened on its own, then joined: thickening a whole line folds over itself at sharp turns
    // (the point of an M), which leaves holes
    return kept.slice(1).map((p, i) => expand({ delta: stroke / 2, corners: 'round', segments }, path2.fromPoints({}, [kept[i], p])));
  }).flat();
  return strokes.length > 1 ? union(...strokes) : strokes[0];
}

/**
 * Where something w × d goes on a face width × depth (centred on 0, y to the back).
 * @param {{ width: number, depth: number }} face @param {[number, number]} size
 * @param {'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br'} [at]
 * @returns {[number, number]}
 */
export function anchor({ width, depth }, [w, d], at = 'mc') {
  if (!ANCHORS.includes(at)) throw new Error(`anchor: one of ${ANCHORS.join(', ')} (got "${at}")`);
  const col = { l: -1, c: 0, r: 1 }[at[1]], row = { t: 1, m: 0, b: -1 }[at[0]];
  return [col * Math.max(width - w, 0) / 2, row * Math.max(depth - d, 0) / 2];
}

// cut(a, b): a with b taken out, touching only a's faces near b. JSCAD's subtract splits every face of a along the
// planes of b's faces, however far away, and the splits can leave tiny gaps (a keycap's skirt, cut by its legend 8 mm
// above). Here the faces clear of b's box pass through unchanged, and only the rest are cut.
/** a with b taken out, cutting only a's faces near b. @param {object} a JSCAD geom3 @param {object} b JSCAD geom3 @param {number} [margin] @returns {object} */
export function cut(a, b, margin = 0.05) {
  const { geom3 } = jscad.geometries, [lo, hi] = measureBoundingBox(b);
  const near = [], far = [];
  for (const p of geom3.toPolygons(a)) {
    const vs = p.vertices, clear = [0, 1, 2].some((k) => Math.max(...vs.map((v) => v[k])) < lo[k] - margin || Math.min(...vs.map((v) => v[k])) > hi[k] + margin);
    (clear ? far : near).push(p);
  }
  if (!near.length) return a;
  return geom3.create([...far, ...geom3.toPolygons(subtract(geom3.create(near), b))]);
}

export const size = (g) => { const [lo, hi] = measureBoundingBox(g); return [hi[0] - lo[0], hi[1] - lo[1]]; };
export { scale };
export { outline, slab, shell, lid, dovetail, gabled, diamond, vents } from './enclosure.mjs';
export { countersink, teardropHole, nutPocket, crushRibs, wallOpening } from './features.mjs';

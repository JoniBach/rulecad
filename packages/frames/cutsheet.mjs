// A beam's cut-and-drill sheet, as SVG: what a person at the saw and the drill needs, to scale. The section seen from
// end a, each face named and the tapped bores marked; a view of each face that has work on it, that face up, end a on
// the left; every operation dimensioned from end a to 0.1 mm; and a numbered list of the operations, each tap with its
// thread and depth. Units: mm, the sheet drawn in mm too (it prints to scale at 100%).
import { outline } from './profile.mjs';
import { CUT_DEFAULTS } from './cutlist.mjs';

const mm = (x) => String(+Number(x).toFixed(2));
const d1 = (x) => Number(x).toFixed(1);
const f = (x) => String(+Number(x).toFixed(3));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const INK = '#1a1a1a', THIN = '#666', METAL = '#dde3ea', CUT = '#c03a2b';
const SCALES = [1, 2, 5, 10, 20, 50, 100];
// Each face's view: looking at it from outside, end a on the left, and which way in the section is up the page
// (the face frame's y: top +x, bottom -x, front +y, back -y), and how wide the face is
const FACE_VIEW = { top: { up: [1, 0], wide: 'width' }, bottom: { up: [-1, 0], wide: 'width' }, front: { up: [0, 1], wide: 'height' }, back: { up: [0, -1], wide: 'height' } };
const OPPOSITE = { top: 'bottom', bottom: 'top', front: 'back', back: 'front' };
const DIR = { top: [0, 1], bottom: [0, -1], front: [-1, 0], back: [1, 0] };

function pen() {
  const out = [];
  return {
    out,
    line: (a, b, c, d, s = INK, w = 0.25, dash = '') => out.push(`<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(d)}" stroke="${s}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`),
    circle: (x, y, r, s = INK, fill = 'none') => out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${s}" stroke-width="0.25"/>`),
    path: (d, fill = 'none', s = INK, w = 0.25) => out.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>`),
    text: (x, y, t, { anchor = 'start', size = 3, turn = 0, weight = '' } = {}) => out.push(`<text x="${f(x)}" y="${f(y)}"${turn ? ` transform="rotate(${turn} ${f(x)} ${f(y)})"` : ''} text-anchor="${anchor}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} font-family="system-ui, sans-serif" fill="${INK}">${esc(t)}</text>`),
  };
}

/**
 * A beam's cut-and-drill sheet, to scale: its section from end a with the faces named, a view of each face with work
 * on it (that face up), each operation dimensioned from end a to 0.1 mm, and the operations listed in order, each tap
 * with its thread and depth.
 * @param {object} b a beam's model (beamModel)
 * @param {{ mark?: string, items?: string[], grams?: number | null }} [o] the beam's mark on the cut list, the items it is, its mass each
 * @returns {{ svg: string, scale: number, faces: string[], dimensions: { op: number, distance: number, text: string }[] }}
 *   scale: the beam is drawn 1:scale; faces: the views drawn; dimensions: each operation's figure from end a, as on the sheet
 */
export function beamSheet(b, o = {}) {
  if (b?.kind !== 'beam') throw new Error(`beamSheet: give a beam's model (beamModel) (got ${b === undefined ? 'nothing' : typeof b})`);
  const p = b.profile, L = b.length, mark = o.mark ?? null, items = o.items ?? [], grams = o.grams ?? b.weight?.sheet ?? b.mass;
  const ops = b.ops.map((x, i) => ({ ...x, n: i + 1 }));
  // the views: each face with work on it or a mitre seen from it, else the top
  const faces = Object.keys(FACE_VIEW).filter((k) => ops.some((x) => x.face === k || (x.op === 'mitre' && x.about === k)));
  if (!faces.length) faces.push('top');
  const k = SCALES.find((s) => L / s <= 200) ?? Math.ceil(L / 200), s = 1 / k; // the beam's scale, 1:k
  const big = Math.max(p.width, p.height), ks = [4, 2, 1].find((z) => big * z <= 44) ?? 0.5; // the section's, ks:1
  const x0 = 78, W = Math.max(297, x0 + L * s + 24), { out, line, circle, path, text } = pen();
  // heading
  text(10, 12, `${mark ? `Mark ${mark}: ` : ''}${p.name} x ${d1(L)} mm`, { size: 5, weight: 'bold' });
  text(10, 18.5, [items.length ? `${items.length} off: ${items.join(', ')}` : null, p.title, grams != null ? `${mm(grams)} g each` : null, b.material?.name].filter(Boolean).join('  ·  '), { size: 3 });
  text(10, 23.5, `Beam 1:${k}, section ${ks >= 1 ? `${ks}:1` : `1:${1 / ks}`}. All in mm, measured from end a. Cut to ±${mm(p.supply.cutTolerance ?? CUT_DEFAULTS.tolerance.value)}.`, { size: 3 });
  // the section from end a: top up, front on the right (looking from a toward b)
  const cx = 38, cy = 58, X = (x) => cx - x * ks, Y = (y) => cy - y * ks, loops = outline(p).loops;
  path(loops.map((l) => `M ${l.map(([x, y]) => `${f(X(x))} ${f(Y(y))}`).join(' L ')} Z`).join(' '), METAL);
  text(cx, Y(p.height / 2) - 2, 'top', { anchor: 'middle', size: 2.6 }); text(cx, Y(-p.height / 2) + 4.5, 'bottom', { anchor: 'middle', size: 2.6 });
  text(X(p.width / 2) - 1.5, cy + 1, 'back', { anchor: 'end', size: 2.6 }); text(X(-p.width / 2) + 1.5, cy + 1, 'front', { anchor: 'start', size: 2.6 });
  text(cx, cy + big * ks / 2 + 11, 'section at end a,', { anchor: 'middle', size: 2.6 }); text(cx, cy + big * ks / 2 + 14.5, 'seen from a, top up', { anchor: 'middle', size: 2.6 });
  let ty = cy + big * ks / 2 + 20;
  for (const t of ops.filter((x) => x.op === 'tap')) for (const bn of t.bores) {
    const bo = b.bores.find((x) => x.name === bn); if (!bo) continue;
    if (t.end === 'a') circle(X(bo.at[0]), Y(bo.at[1]), (t.major / 2) * ks, CUT);
    text(cx, ty, `(${t.n}) ${bn}: tap ${t.thread} x ${mm(t.depth)} deep`, { anchor: 'middle', size: 2.6 }); ty += 4;
  }
  // each face's view
  const dimensions = [];
  let y = 40;
  for (const face of faces) {
    const v = FACE_VIEW[face], w = p[v.wide], h = w * s < 6 ? 6 / s : w, top = y, mid = y + (h * s) / 2, U = (pt) => mid - ((pt[0] * v.up[0] + pt[1] * v.up[1]) * h / w) * s, Z = (z) => x0 + z * s;
    text(x0, top - 3, `${face} face up: seen from the ${face}, end a on the left${h !== w ? ` (across drawn ${mm(h / w)} times its size)` : ''}`, { size: 3, weight: 'bold' });
    // the outline, with any mitre seen
    const corner = (end, side) => { // where the outline's edge on this side (+1 the upper, -1 the lower) meets the end
      const m = ops.find((x) => x.op === 'mitre' && x.end === end);
      if (!m) return end === 'a' ? 0 : L;
      const seen = m.about === face || m.about === OPPOSITE[face], u = DIR[m.long][0] * v.up[0] + DIR[m.long][1] * v.up[1];
      const c = seen ? ((u > 0) === (side > 0) ? 0 : m.cut) : face === m.long ? 0 : m.cut;
      return end === 'a' ? c : L - c;
    };
    const yT = top, yB = top + h * s, poly = [[corner('a', 1), yT], [corner('b', 1), yT], [corner('b', -1), yB], [corner('a', -1), yB]];
    path(`M ${poly.map(([z, yy]) => `${f(Z(z))} ${f(yy)}`).join(' L ')} Z`, METAL);
    for (const pl of b.places.filter((q) => q.face === face && q.slot)) line(Z(0) - 3, U(pl.at), Z(L) + 3, U(pl.at), THIN, 0.18, '4 1 1 1');
    text(Z(0) - 2, mid + 1, 'a', { anchor: 'end', size: 3.2, weight: 'bold' }); text(Z(L) + 2, mid + 1, 'b', { size: 3.2, weight: 'bold' });
    // the work on this face
    const here = ops.filter((x) => x.face === face);
    for (const x of here) {
      const zc = Z(x.distance), uc = U(x.anchor.origin);
      if (x.op === 'access' || x.op === 'drill') circle(zc, uc, Math.max((x.diameter / 2) * s, 0.4), CUT);
      if (x.op === 'counterbore') { circle(zc, uc, Math.max((x.seat.diameter / 2) * s, 0.6), CUT); circle(zc, uc, Math.max((x.diameter / 2) * s, 0.4), CUT); }
      if (x.op === 'pocket' && x.size) path(`M ${f(zc - x.size[0] * s / 2)} ${f(uc - x.size[1] * s / 2)} h ${f(x.size[0] * s)} v ${f(x.size[1] * s)} h ${f(-x.size[0] * s)} Z`, 'none', CUT);
      if (x.op === 'pocket' && x.outline) path(`M ${x.outline.map(([a, c]) => `${f(zc + a * s)} ${f(uc - c * s)}`).join(' L ')} Z`, 'none', CUT);
      if (x.op === 'notch') path(`M ${f(zc - x.length * s / 2)} ${f(uc - x.width * s / 2)} h ${f(x.length * s)} v ${f(x.width * s)} h ${f(-x.length * s)} Z`, 'none', CUT);
      text(zc + 1, uc - Math.max((x.diameter ?? 2) / 2 * s, 0.6) - 0.8, `(${x.n})`, { size: 2.2 });
    }
    // dimensions from end a: a leader down from each, its figure turned to read up the page, the length last
    const yd = yB + 3, marks = [...here.map((x) => ({ n: x.n, z: x.distance, from: U(x.anchor.origin) })), { n: null, z: Math.max(corner('b', 1), corner('b', -1)), from: yB }];
    line(Z(0), yB, Z(0), yd + 3, THIN, 0.18); text(Z(0) + 1, yd + 3.5, '0', { size: 2.6, turn: 90 });
    let last = Z(0);
    for (const m of marks.sort((a, c) => a.z - c.z)) {
      const at = Math.max(Z(m.z), last + 3.2); last = at;
      line(Z(m.z), m.from, Z(m.z), yd, THIN, 0.18, m.n ? '1 0.6' : ''); line(Z(m.z), yd, at, yd + 2, THIN, 0.18); line(at, yd + 2, at, yd + 3, THIN, 0.18);
      const t = d1(m.z); text(at + 1, yd + 3.5, t, { size: 2.6, turn: 90 });
      if (m.n) dimensions.push({ op: m.n, distance: m.z, text: t });
    }
    y = yd + 26;
  }
  // the operations, in order from end a
  y = Math.max(y, ty + 4);
  text(10, y, 'Operations, in order from end a', { size: 3.4, weight: 'bold' }); y += 5.5;
  for (const x of ops) {
    const where = x.end ? `end ${x.end}` : `${x.place ?? x.face}, ${d1(x.distance)} from a`;
    text(10, y, `${x.n}.`, { size: 3 }); text(17, y, `${x.op}  ·  ${where}`, { size: 3, weight: 'bold' }); text(80, y, x.line, { size: 3 }); y += 5;
  }
  text(10, y + 3, 'Deburr every cut and hole. Check each length against its figure before drilling.', { size: 2.6 });
  const H = y + 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}"><rect width="100%" height="100%" fill="#fff"/>${out.join('')}</svg>\n`;
  return { svg, scale: k, faces, dimensions };
}

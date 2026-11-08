// A gear pair drawn the way a textbook draws it, as an SVG: the pair as it meshes (in phase), and the mesh close up with
// the geometry its numbers come from: the pitch circles rolling on each other at the pitch point, the base circles the
// flanks unwind from, the line of action tangent to both, and the stretch of it where the teeth touch (the path of
// contact, whose length over the base pitch is the contact ratio).
import { gearModel, internalModel, rackModel, spurProfile, internalProfile, rackProfile, mesh, phase, rackPhase } from './gears.mjs';

const DEG = Math.PI / 180;
const C = { a: '#2f6fb3', b: '#e07a1f', aFill: '#d6e4f3', bFill: '#f9e0c8', line: '#333', faint: '#999', contact: '#c0392b' };
const fmt = (x) => String(+x.toFixed(3));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const turn = (pts, a, [dx, dy] = [0, 0]) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [x * c - y * s + dx, x * s + y * c + dy]); };
const path = (loops) => loops.map((l) => `M${l.map(([x, y]) => `${fmt(x)} ${fmt(-y)}`).join('L')}Z`).join('');
const circle = ([x, y], r, colour, dash, w) => `<circle cx="${fmt(x)}" cy="${fmt(-y)}" r="${fmt(r)}" fill="none" stroke="${colour}" stroke-width="${fmt(w)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const seg = (p, q, colour, w, dash) => `<line x1="${fmt(p[0])}" y1="${fmt(-p[1])}" x2="${fmt(q[0])}" y2="${fmt(-q[1])}" stroke="${colour}" stroke-width="${fmt(w)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const dot = (p, r, colour) => `<circle cx="${fmt(p[0])}" cy="${fmt(-p[1])}" r="${fmt(r)}" fill="${colour}"/>`;
const label = (p, text, size, colour = C.line, anchor = 'start') => `<text x="${fmt(p[0])}" y="${fmt(-p[1])}" font-size="${fmt(size)}" fill="${colour}" text-anchor="${anchor}" font-family="system-ui, sans-serif">${esc(text)}</text>`;
// Where a line (through p along d, d a unit vector) crosses a circle: the crossing nearest p
function cross(p, d, centre, r) {
  const f = [p[0] - centre[0], p[1] - centre[1]], b = f[0] * d[0] + f[1] * d[1], c = f[0] ** 2 + f[1] ** 2 - r * r, disc = b * b - c;
  if (disc < 0) return null;
  const ts = [-b - Math.sqrt(disc), -b + Math.sqrt(disc)].sort((x, y) => Math.abs(x) - Math.abs(y));
  return [p[0] + ts[0] * d[0], p[1] + ts[0] * d[1]];
}

/**
 * The pair as an SVG drawing: a (an outer gear, the driver) and b (an outer gear, a ring or a rack), meshing in phase,
 * with the construction close up and the numbers. a and b are the parameters given to gearModel, internalModel or
 * rackModel; b's `kind` says which ('external' by default).
 * @param {object} a @param {object & { kind?: 'external' | 'internal' | 'rack' }} b @param {{ title?: string }} [o]
 * @returns {string} SVG
 */
export function diagram(a, b, { title } = {}) {
  const kind = b.kind ?? 'external', ga = gearModel(a), gb = kind === 'internal' ? internalModel(b) : kind === 'rack' ? rackModel(b) : gearModel(b);
  const m = mesh(ga, gb), al = m.pressureAngle * DEG, mod = ga.module;
  const A = spurProfile(a).loops, rb1 = ga.base / 2, ra1 = ga.tip / 2, rw1 = kind === 'rack' ? ga.pitch / 2 : (m.centre * ga.teeth) / Math.abs(gb.teeth + (kind === 'internal' ? -ga.teeth : ga.teeth));
  let O1, O2 = null, B, P, d, T1, T2 = null, rb2, ra2, rw2, aAngle = 0, extras = [];
  if (kind === 'rack') {
    // the rack along x under the pinion, its pitch line on y = 0; the pinion above, turned so a tooth points down
    O1 = [0, m.centre]; aAngle = -Math.PI / 2;
    const s0 = rackPhase(ga, 0) + (Math.PI * ga.pitch / 360) * -90, shift = s0 - Math.PI * mod * Math.round(gb.teeth / 2);
    B = rackProfile(b).loops.map((l) => l.map(([x, y]) => [x + shift, y]));
    P = [0, m.centre - ga.pitch / 2]; d = [Math.cos(al), -Math.sin(al)];
    T1 = [O1[0] - rb1 * Math.sin(al), O1[1] - rb1 * Math.cos(al)];
  } else {
    O1 = [0, 0]; O2 = [m.centre, 0];
    rb2 = gb.base / 2; ra2 = gb.tip / 2; rw2 = (m.centre * gb.teeth) / Math.abs(gb.teeth + (kind === 'internal' ? -ga.teeth : ga.teeth));
    // b turned to its phase (a at angle 0); a ring drawn round a pinion sits the other way: its centre on −x of the pinion's
    if (kind === 'internal') { O2 = [-m.centre, 0]; B = internalProfile(b).loops.map((l) => turn(l, phase(ga, gb, 180) * DEG, O2)); P = [rw1, 0]; d = [Math.sin(al), Math.cos(al)]; T1 = [rb1 * Math.cos(al), -rb1 * Math.sin(al)]; T2 = [O2[0] + rb2 * Math.cos(al), -rb2 * Math.sin(al)]; }
    else { B = spurProfile(b).loops.map((l) => turn(l, phase(ga, gb, 0) * DEG, O2)); P = [rw1, 0]; d = [Math.sin(al), -Math.cos(al)]; T1 = [rb1 * Math.cos(al), rb1 * Math.sin(al)]; T2 = [O2[0] - rb2 * Math.cos(al), -rb2 * Math.sin(al)]; }
  }
  const Aplaced = A.map((l) => turn(l, aAngle, O1));
  // the path of contact: the line of action between the two tip circles (or the rack's tip line)
  const endA = cross(P, d, O1, ra1);
  const endB = kind === 'rack' ? (() => { const y = gb.tipLine, t = (y - P[1]) / d[1]; return [P[0] + t * d[0], P[1] + t * d[1]]; })() : cross(P, d, O2, kind === 'internal' ? Math.max(ra2, rb2) : ra2);
  const pathLength = endA && endB ? Math.hypot(endA[0] - endB[0], endA[1] - endB[1]) : 0;

  // ---- the pair, whole (left) ----
  const all = [...Aplaced, ...B].flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), pad = span * 0.06, w = span * 0.004;
  const vb1 = [Math.min(...xs) - pad, -Math.max(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const pair = [
    `<path d="${path(B)}" fill="${C.bFill}" stroke="${C.b}" stroke-width="${fmt(w)}" fill-rule="evenodd"/>`,
    `<path d="${path(Aplaced)}" fill="${C.aFill}" stroke="${C.a}" stroke-width="${fmt(w)}" fill-rule="evenodd"/>`,
    circle(O1, rw1, C.a, `${fmt(span * 0.01)} ${fmt(span * 0.008)}`, w), ...(O2 ? [circle(O2, rw2, C.b, `${fmt(span * 0.01)} ${fmt(span * 0.008)}`, w)] : [seg([vb1[0], P[1]], [vb1[0] + vb1[2], P[1]], C.b, w, `${fmt(span * 0.01)} ${fmt(span * 0.008)}`)]),
    dot(O1, span * 0.008, C.a), ...(O2 ? [dot(O2, span * 0.008, C.b)] : []),
    `<rect x="${fmt(P[0] - 4 * mod)}" y="${fmt(-P[1] - 4 * mod)}" width="${fmt(8 * mod)}" height="${fmt(8 * mod)}" fill="none" stroke="${C.contact}" stroke-width="${fmt(w)}"/>`,
  ].join('');

  // ---- the mesh, close up (right) ----
  const h = 4 * mod, vb2 = [P[0] - h, -P[1] - h, 2 * h, 2 * h], w2 = h * 0.008, fs = h * 0.055;
  const along = (p, t) => [p[0] + t * d[0], p[1] + t * d[1]];
  const close = [
    `<path d="${path(B)}" fill="${C.bFill}" stroke="${C.b}" stroke-width="${fmt(w2 * 1.5)}" fill-rule="evenodd"/>`,
    `<path d="${path(Aplaced)}" fill="${C.aFill}" stroke="${C.a}" stroke-width="${fmt(w2 * 1.5)}" fill-rule="evenodd"/>`,
    circle(O1, rw1, C.a, `${fmt(h * 0.03)} ${fmt(h * 0.02)}`, w2), circle(O1, rb1, C.a, `${fmt(h * 0.008)} ${fmt(h * 0.016)}`, w2),
    ...(O2 ? [circle(O2, rw2, C.b, `${fmt(h * 0.03)} ${fmt(h * 0.02)}`, w2), circle(O2, rb2, C.b, `${fmt(h * 0.008)} ${fmt(h * 0.016)}`, w2)]
      : [seg([P[0] - h, P[1]], [P[0] + h, P[1]], C.b, w2, `${fmt(h * 0.03)} ${fmt(h * 0.02)}`)]),
    seg(along(P, -2 * h), along(P, 2 * h), C.line, w2), // the line of action
    ...(endA && endB ? [seg(endA, endB, C.contact, w2 * 4)] : []), // where the teeth touch
    seg(T1, P, C.a, w2, `${fmt(h * 0.012)} ${fmt(h * 0.012)}`), // the string unwound from a's base circle: its end draws the involute
    dot(P, h * 0.018, C.line),
    // a legend in the corner, on white, so nothing is written over a tooth
    `<rect x="${fmt(vb2[0] + h * 0.03)}" y="${fmt(vb2[1] + h * 0.03)}" width="${fmt(h * 1.2)}" height="${fmt(fs * 4.6)}" fill="#fff" fill-opacity="0.88" rx="${fmt(fs * 0.3)}"/>`,
    label([vb2[0] + h * 0.07, -(vb2[1] + h * 0.03 + fs * 1.3)], `line of action, at ${fmt(m.pressureAngle)}° (black)`, fs),
    label([vb2[0] + h * 0.07, -(vb2[1] + h * 0.03 + fs * 2.5)], 'pitch point: where the pitch circles touch (dot)', fs),
    label([vb2[0] + h * 0.07, -(vb2[1] + h * 0.03 + fs * 3.7)], `path of contact: ${fmt(pathLength)} mm (red)`, fs, C.contact),
  ].join('');

  const lines = [
    title ?? `${ga.teeth} teeth on ${kind === 'rack' ? `a rack of ${gb.teeth}` : `${gb.teeth}${kind === 'internal' ? ' (a ring)' : ''}`}, module ${fmt(mod)}`,
    `pitch circles (dashed) roll on each other at the pitch point; each flank is the involute of its base circle (dotted), drawn by the end of a string unwound from it`,
    `centre distance ${fmt(m.centre)} mm${kind === 'rack' ? ' (to the pitch line)' : ''} · ${m.text} · pressure angle ${fmt(m.pressureAngle)}°`,
    `contact ratio ${fmt(m.contact)}: the path of contact (${fmt(pathLength)} mm, red) over the base pitch (${fmt(ga.basePitch)} mm), how many pairs of teeth share the load · backlash ${fmt(m.backlash)} mm`,
  ];
  const W = 1200, H = 600, text = 110;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + text}" viewBox="0 0 ${W} ${H + text}">
<rect width="${W}" height="${H + text}" fill="#fff"/>
<svg x="0" y="0" width="${W / 2}" height="${H}" viewBox="${vb1.map(fmt).join(' ')}">${pair}</svg>
<svg x="${W / 2}" y="0" width="${W / 2}" height="${H}" viewBox="${vb2.map(fmt).join(' ')}">${close}</svg>
<g font-family="system-ui, sans-serif" fill="#333">${lines.map((l, i) => `<text x="20" y="${H + 24 + i * 22}" font-size="${i ? 14 : 17}"${i ? '' : ' font-weight="600"'}>${esc(l)}</text>`).join('')}</g>
</svg>`;
}

// Developable mechanisms: a mechanism whose links are pieces of a surface, here a tube's wall, so at rest it is the
// tube and nothing stands out of it; moved, its links leave the surface, out or in (Nelson, Magleby and Howell,
// Developable mechanisms on developable surfaces, Science Robotics 4(27), 2019). On a cylinder with its joints' axes
// along the cylinder (its rulings) the mechanism is a planar one, seen end on: a four-bar whose four joints are points
// on the wall's circle, its links the arcs of wall between them, the rest of the tube its ground.
//
// Printed standing, the tube's axis up z: each joint is a living hinge, the wall thinned to a web from both faces by a
// pocket with round inside corners, so every hinge bends within its layers and the first layer is the tube's whole
// ring. The links move as the rigid four-bar's (the pseudo-rigid-body model, Howell 2001), each hinge a torsion
// spring EI / l at its web's middle. Units: mm, N, MPa; angles in degrees where a caller gives or reads them.
import jscad from '@jscad/modeling';
import { livingHingeModel } from './core.mjs';

const { circle, polygon, rectangle } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { extrudeLinear } = jscad.extrusions;
const { rotateZ, translate } = jscad.transforms;

/** @returns {never} */
const refuse = (code, text) => { throw Object.assign(new Error(`${code}: ${text}`), { code }); };
const said = (v) => JSON.stringify(v) ?? String(v);
const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const size = (what, p, k, text) => { if (!(typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] > 0)) refuse('developable.size', `${what}: ${k} is ${text}, a size above 0 mm (got ${said(p[k])})`); return p[k]; };

/**
 * @typedef {{ radius: number, wall: number, height: number, joints: number[], hinge: { flex: number, thickness: number }, segments?: number }} TubeFourBar
 *   radius: R, to the wall's middle; wall: its thickness; height: the tube's length up z; joints: the four joints'
 *   places round the circle, degrees, in order: the input's ground joint, input to coupler, coupler to output, the
 *   output's ground joint (going round one way, the moving links between them and the ground the rest of the way
 *   round); hinge: each joint's web, flex long round the wall and thickness thick (under the wall)
 */
function layoutOf(what, p) {
  if (!p || typeof p !== 'object') refuse('developable.input', `${what}: a tube four-bar is { radius, wall, height, joints, hinge } (got ${said(p)})`);
  const R = size(what, p, 'radius', "the wall's middle radius"), w = size(what, p, 'wall', "the wall's thickness"), H = size(what, p, 'height', "the tube's length");
  if (!(w < R)) refuse('developable.wall', `${what}: a wall ${w} mm thick is over the ${R} mm radius`);
  const j = p.joints;
  if (!(Array.isArray(j) && j.length === 4 && j.every((x) => typeof x === 'number' && Number.isFinite(x)))) refuse('developable.joints', `${what}: joints is four angles in degrees round the tube (got ${said(j)})`);
  const hg = p.hinge;
  if (!hg || typeof hg !== 'object') refuse('developable.hinge', `${what}: hinge is { flex, thickness }, each joint's web (got ${said(hg)})`);
  const l = size(`${what}: hinge`, hg, 'flex', "the web's length round the wall"), t = size(`${what}: hinge`, hg, 'thickness', "the web's thickness");
  if (!(t < w)) refuse('developable.hinge', `${what}: a web ${t} mm thick is not thinner than the ${w} mm wall`);
  // the joints going round one way: each moving link's arc from one to the next, the ground the rest
  const a = j.map((x) => x * DEG), dir = Math.sign(wrap(a[1] - a[0])) || 1, spans = [0, 1, 2].map((i) => { const s = dir * wrap(a[i + 1] - a[i]); return s > 0 ? s : s + 2 * Math.PI; });
  const ground = 2 * Math.PI - spans.reduce((s, x) => s + x, 0);
  if (!(ground > 0)) refuse('developable.joints', `${what}: the three moving links' arcs (${spans.map((s) => (s / DEG).toFixed(1)).join(', ')} degrees) go more than once round: give the joints in order round the tube`);
  for (const [i, s] of [...spans, ground].entries()) if (!(R * s >= 2 * l)) refuse('developable.joints', `${what}: the ${['input', 'coupler', 'output', 'ground'][i]}'s arc, ${(R * s).toFixed(2)} mm, is under two hinges' length (${(2 * l).toFixed(2)} mm)`);
  // the web is straight on a curved wall: its ends stand l² / 8R off the wall's middle, kept under a quarter of the cut
  if (l * l / (8 * R) > (w - t) / 4) refuse('developable.hinge', `${what}: a web ${l} mm long on a ${R} mm radius leaves the wall's curve by ${(l * l / (8 * R)).toFixed(2)} mm, over a quarter of the ${(w - t).toFixed(2)} mm the pockets cut: under ${Math.sqrt(2 * R * (w - t)).toFixed(2)} mm long`);
  const P = a.map((x) => [R * Math.cos(x), R * Math.sin(x)]);
  return { R, w, H, l, t, a, dir, spans, ground, P, segments: p.segments ?? 96 };
}

// The four-bar's pose for a turn θ of the input about its ground joint: each moving link's turn, from the rigid
// linkage's loop (the output's joint on the circle about its ground joint, the branch the rest pose is on)
function poseOf(k, th) {
  const [A, B0, C0, D] = k.P, sub = (u, v) => [u[0] - v[0], u[1] - v[1]], rot = (v, q) => [v[0] * Math.cos(q) - v[1] * Math.sin(q), v[0] * Math.sin(q) + v[1] * Math.cos(q)];
  const B = [A[0] + rot(sub(B0, A), th)[0], A[1] + rot(sub(B0, A), th)[1]], b = Math.hypot(...sub(C0, B0)), c = Math.hypot(...sub(C0, D)), dd = Math.hypot(...sub(B, D));
  if (dd > b + c - 1e-12 || dd < Math.abs(b - c) + 1e-12) return null; // the loop no longer closes
  const x = (dd * dd + c * c - b * b) / (2 * dd), h = Math.sqrt(Math.max(0, c * c - x * x)), u = [(B[0] - D[0]) / dd, (B[1] - D[1]) / dd], n = [-u[1], u[0]];
  // the branch: the side of the line from D to B the output's joint lies on at rest
  const side = Math.sign((B0[0] - D[0]) * (C0[1] - D[1]) - (B0[1] - D[1]) * (C0[0] - D[0])) || 1, sB = Math.sign(u[0] * n[1] - u[1] * n[0]);
  const C = [D[0] + u[0] * x + side * sB * n[0] * h, D[1] + u[1] * x + side * sB * n[1] * h];
  const ang = (v) => Math.atan2(v[1], v[0]);
  const coupler = wrap(ang(sub(C, B)) - ang(sub(C0, B0))), output = wrap(ang(sub(C, D)) - ang(sub(C0, D)));
  return { B, C, input: th, coupler, output, turns: [th, coupler - th, output - coupler, -output] };
}

/**
 * A four-bar in a tube's wall, its model: at an input's turn, each joint's turn, each hinge's strain, how far each
 * moving link stands out of the tube and in, and the least gap between links that are not joined; the input's torque
 * from the hinges' energy; the turn each way at the hinges' strain limit.
 * @param {TubeFourBar} p
 * @param {{ E: number, strainLimit?: number, density?: number }} m
 * @returns {{ hinge: { stiffness: number, length: number }, links: { input: number, coupler: number, output: number, ground: number },
 *   at: (input: number) => null | { turns: number[], strain: number, torque: number, out: Record<string, number>, in: Record<string, number>, gap: number },
 *   travel?: [number, number], grams?: number, volume: number }}
 *   hinge: each one's stiffness (N·mm a radian) and the length it bends as (mm: the thin web plus what its round corners
 *   add); links: each one's chord between its joints (mm); at(input degrees): null where the loop no longer closes; turns:
 *   the four joints' turns (degrees); strain: the most any hinge sees; torque: N·mm to hold the input there; out, in:
 *   how far each moving link's wall middle stands outside the circle and inside it (mm); gap: the least between the
 *   middles of links not joined, less a wall; travel: the input's turn each way at the strain limit (degrees)
 */
export function tubeFourBarModel(p, m) {
  const what = 'tubeFourBarModel', k = layoutOf(what, p);
  if (!(m && m.E > 0)) refuse('developable.material', `${what}: the material needs a modulus E above 0 MPa (got ${said(m?.E)})`);
  // the web as drawn: thin for l - 2 rr, then thickening through the pockets' round corners, so it bends as a web of the
  // length that holds the same energy, l_eff = ∫ (t / t(x))³ dx (the peak strain, at the thin part, follows the same l_eff)
  const lEff = webLength(k), hinge = livingHingeModel({ flex: lEff, thickness: k.t, width: k.H }, m), K = hinge.stiffness;
  const chord = (i, j) => Math.hypot(k.P[i][0] - k.P[j][0], k.P[i][1] - k.P[j][1]);
  // each body's wall middle, as points on its arc at rest (the hinges' halves with it), and where it turns about
  const arc = (from, span, n = 48) => Array.from({ length: n + 1 }, (_, i) => { const q = from + (k.dir * span * i) / n; return [k.R * Math.cos(q), k.R * Math.sin(q)]; });
  const bodies = { input: arc(k.a[0], k.spans[0]), coupler: arc(k.a[1], k.spans[1]), output: arc(k.a[2], k.spans[2]), ground: arc(k.a[3], k.ground) };
  const place = (pts, q, from, to) => pts.map((v) => { const x = v[0] - from[0], y = v[1] - from[1]; return [to[0] + x * Math.cos(q) - y * Math.sin(q), to[1] + x * Math.sin(q) + y * Math.cos(q)]; });
  const energy = (th) => { const s = poseOf(k, th); return s ? s.turns.reduce((e, q) => e + 0.5 * K * q * q, 0) : NaN; };
  const at = (deg) => {
    if (!(typeof deg === 'number' && Number.isFinite(deg))) refuse('developable.input', `${what}: at() takes the input's turn in degrees (got ${said(deg)})`);
    const th = deg * DEG, s = poseOf(k, th);
    if (!s) return null;
    const moved = { input: place(bodies.input, s.input, k.P[0], k.P[0]), coupler: place(bodies.coupler, s.coupler, k.P[1], s.B), output: place(bodies.output, s.output, k.P[3], k.P[3]) };
    const out = {}, inn = {};
    for (const [name, pts] of Object.entries(moved)) { const r = pts.map((v) => Math.hypot(v[0], v[1]) - k.R); out[name] = Math.max(0, ...r); inn[name] = Math.max(0, ...r.map((x) => -x)); }
    // links not joined: input and output, coupler and ground (each sampled away from the hinges at its ends)
    const trim = (pts) => pts.slice(8, -8), gapOf = (u, v) => { let g = Infinity; for (const a of trim(u)) for (const b of trim(v)) g = Math.min(g, Math.hypot(a[0] - b[0], a[1] - b[1])); return g - k.w; };
    const e = 1e-6, torque = (energy(th + e) - energy(th - e)) / (2 * e);
    return { turns: s.turns.map((q) => q / DEG), strain: Math.max(...s.turns.map((q) => hinge.strain(Math.abs(q)))), torque, out, in: inn, gap: Math.min(gapOf(moved.input, moved.output), gapOf(moved.coupler, bodies.ground)) };
  };
  let travel;
  if (m.strainLimit != null) {
    const reach = (sgn) => { let lo = 0, hi = 0.5; const bad = (x) => { const r = at(sgn * x / DEG); return !r || r.strain > m.strainLimit; }; if (!bad(hi)) return hi / DEG; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (bad(mid)) hi = mid; else lo = mid; } return lo / DEG; };
    travel = [-reach(-1), reach(1)];
  }
  const volume = measureArea(k) * k.H;
  return {
    hinge: { stiffness: K, length: lEff }, links: { input: chord(0, 1), coupler: chord(1, 2), output: chord(2, 3), ground: chord(3, 0) }, at,
    ...(travel ? { travel } : {}), volume, ...(m.density ? { grams: (volume * m.density) / 1000 } : {}),
  };
}

// The cross-section's area: the ring less each hinge's two pockets (each a rectangle with its two corners at the web
// rounded, the rounds' radius the pocket's depth, or half the web's length if less)
function pocketOf(k) { const d = (k.w - k.t) / 2, rr = Math.min(d, k.l / 2); return { d, rr }; }
// The web's length as it bends: l - 2 rr thin, and at each end a round corner of each pocket, where at s past the
// round's start the web is t + 2 rr (1 - cos φ) thick, s = rr sin φ. Each end adds ∫ (t / t(s))³ ds = ∫ over φ from 0 to
// π/2 of rr cos φ (t / (t + 2 rr (1 - cos φ)))³ dφ, taken by Simpson's rule (the integrand is smooth in φ)
function webLength(k) {
  const { rr } = pocketOf(k), n = 200, h = Math.PI / 2 / n, g = (q) => rr * Math.cos(q) * (k.t / (k.t + 2 * rr * (1 - Math.cos(q)))) ** 3;
  let end = g(0) + g(Math.PI / 2);
  for (let i = 1; i < n; i++) end += (i % 2 ? 4 : 2) * g(i * h);
  return k.l - 2 * rr + 2 * (end * h) / 3;
}
function measureArea(k) {
  const { d, rr } = pocketOf(k), ring = 2 * Math.PI * k.R * k.w;
  // a pocket: l × d, less the two corners' rounds' outside (each (1 - π/4) rr²), measured flat (the wall's curve left out)
  return ring - 4 * 2 * (k.l * d - 2 * (1 - Math.PI / 4) * rr * rr);
}

/**
 * A four-bar in a tube's wall (TubeFourBar), drawn standing at rest: the tube from z = 0 up to its height, and at
 * each joint a pocket from the outside and one from the inside, leaving the web on the wall's middle. One piece.
 * @param {TubeFourBar} p
 * @returns {object} the shape, a JSCAD geom3
 */
export function tubeFourBar(p) {
  const k = layoutOf('tubeFourBar', p), { d, rr } = pocketOf(k), n = k.segments;
  const ring = subtract(circle({ radius: k.R + k.w / 2, segments: n }), circle({ radius: k.R - k.w / 2, segments: n }));
  // a pocket in its own frame: u along the wall, v out from the web's face; the far side runs past the wall
  const over = 1, pocket = union(
    rectangle({ size: [k.l, d - rr + over], center: [0, rr + (d - rr + over) / 2] }),
    rectangle({ size: [k.l - 2 * rr, rr + 0.001], center: [0, rr / 2] }),
    circle({ radius: rr, center: [-k.l / 2 + rr, rr], segments: 32 }), circle({ radius: rr, center: [k.l / 2 - rr, rr], segments: 32 }),
  );
  const cuts = [];
  for (const q of k.a) for (const side of [1, -1]) {
    // the pocket's v along the radius, outward for the outside one; its web face t / 2 from the wall's middle
    const placed = translate([k.R + side * (k.t / 2), 0], side > 0 ? rotateZ(-Math.PI / 2, pocket) : rotateZ(Math.PI / 2, pocket));
    cuts.push(rotateZ(q, placed));
  }
  return extrudeLinear({ height: k.H }, subtract(ring, union(cuts)));
}

/**
 * Whether a tube four-bar prints as drawn and lasts at its turn, as findings in the kit's one shape: the webs in whole
 * printed lines (developable.web), the tube's length in whole layers (developable.layers), the hinges' axes up z so
 * each bends within its layers (developable.direction), the hinges' strain at the input's turn against the limit
 * (developable.strain), the links not joined kept apart (developable.gap), and how far the links stand out of the
 * tube and in there (developable.surface).
 * @param {TubeFourBar & { turn?: number }} p turn: the input's turn it is checked at, degrees
 * @param {{ line: number, layer: number, wall_min?: number }} printer
 * @param {{ strainLimit?: number, name?: string }} [material]
 * @param {ReturnType<typeof tubeFourBarModel>} [model]
 * @param {{ clearance?: number }} [o] the least gap between links (default 0.3)
 * @returns {{ level: 'pass' | 'warn' | 'fail' | 'info', text: string, code: string, values?: object }[]}
 */
export function tubeFourBarFindings(p, printer, material, model, o = {}) {
  const k = layoutOf('tubeFourBarFindings', p), out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  if (!(printer && printer.line > 0 && printer.layer > 0)) refuse('developable.printer', `tubeFourBarFindings: the printer needs its line width and layer height above 0 mm (got ${said(printer)})`);
  const lines = k.t / printer.line, least = (printer.wall_min ?? 2 * printer.line) / printer.line;
  if (lines < least - 0.05) f('fail', `webs ${k.t} mm thick are under ${least} lines of ${printer.line} mm: too thin to print`, 'developable.web', { thickness: k.t, lines });
  else if (Math.abs(lines - Math.round(lines)) > 0.05) f('warn', `webs ${k.t} mm thick are ${lines.toFixed(2)} lines of ${printer.line} mm: a whole number prints as drawn`, 'developable.web', { thickness: k.t, lines });
  else f('pass', `webs ${k.t} mm thick: ${Math.round(lines)} lines of ${printer.line} mm`, 'developable.web', { thickness: k.t, lines: Math.round(lines) });
  const layers = k.H / printer.layer;
  if (Math.abs(layers - Math.round(layers)) > 0.05) f('warn', `${k.H} mm tall is ${layers.toFixed(2)} layers of ${printer.layer} mm: a whole number prints as drawn`, 'developable.layers', { height: k.H, layers });
  f('pass', 'printed standing, every hinge\'s axis is up z: each bends within its layers, and the first layer is the whole ring', 'developable.direction');
  if (p.turn != null && model) {
    const r = model.at(p.turn), limit = material?.strainLimit, gap = o.clearance ?? 0.3;
    if (!r) { f('fail', `the linkage does not reach an input turn of ${p.turn}°: its loop no longer closes`, 'developable.reach', { turn: p.turn }); return out; }
    if (limit != null) f(r.strain <= limit ? 'pass' : 'fail', `turned ${p.turn}° at the input, the hinges see at most ${(r.strain * 100).toFixed(2)}% strain${r.strain <= limit ? ', within' : ', over'} ${material.name ?? 'its'} limit of ${(limit * 100).toFixed(2)}%${r.strain <= limit ? ` (${(limit / r.strain).toFixed(2)} times)` : model.travel ? `: from ${model.travel[0].toFixed(1)}° to ${model.travel[1].toFixed(1)}°` : ''}`, 'developable.strain', { turn: p.turn, strain: r.strain, limit });
    f(r.gap >= gap ? 'pass' : 'fail', `links that are not joined stay ${r.gap.toFixed(2)} mm apart${r.gap >= gap ? '' : `, under ${gap} mm`}`, 'developable.gap', { gap: r.gap, least: gap });
    const outs = Object.entries(r.out).filter(([, v]) => v > 1e-6).map(([n, v]) => `the ${n} ${v.toFixed(2)} mm out`), ins = Object.entries(r.in).filter(([, v]) => v > 1e-6).map(([n, v]) => `the ${n} ${v.toFixed(2)} mm in`);
    f('info', `turned ${p.turn}°, ${[...outs, ...ins].join(', ') || 'nothing leaves the tube'}, taking ${(r.torque).toFixed(1)} N·mm at the input`, 'developable.surface', { out: r.out, in: r.in, torque: r.torque });
  }
  return out;
}

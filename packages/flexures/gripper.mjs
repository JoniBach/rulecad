// Compliant gripper jaws: two jaws, each on a parallel guide (two leaves, so the jaw slides without turning), resting
// closed and opened by a servo's double-arm horn turning between them. The springs hold the grip; the servo only
// opens the jaws, so the gripper holds with the power off and the servo never stalls on a load. Each guide has a
// contact stop both ways: a tongue from the ground between its leaves, its round end in a slot in the moving fork.
//
// Why the horn opens and the springs close. A horn's arm can push only with the round of its tip, and only in a
// direction within 90° of where the arm points. Turning between two bars, it points outward at both, so it pushes
// them apart: a clean contact, the tip's top on the bar's flat inner face, with the lever r cos a (the kit's grip
// check uses the same lever). A horn that pushed the jaws together from between them would have to push with the
// side of its arm on a corner, or pass through the part.
//
// Drawn flat like every flexure here: the horn's axis at the origin in plan, the jaws forward along +x, the upper jaw
// at +y and the lower one its mirror at -y, the print from z = 0 up to the width. The horn turns in the print's own
// plane (a design cuts the room it sweeps from its ground, as the bench gripper does). Units: mm, N, MPa, degrees.
import jscad from '@jscad/modeling';
import { beamProfile, parallelGuideModel, printable, need } from './core.mjs';

const { rectangle, roundedRectangle, circle, polygon } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { translate, mirrorY } = jscad.transforms;
const { extrudeLinear } = jscad.extrusions;
const { measureVolume } = jscad.measurements;

const G = 9.80665, rad = Math.PI / 180, n2 = (x, d = 2) => String(Number(x.toFixed(d)));
const rect = (x0, x1, y0, y1) => rectangle({ size: [x1 - x0, y1 - y0], center: [(x0 + x1) / 2, (y0 + y1) / 2] });
// A round for an inside corner at (x, y): the r × r square in the empty quarter (sx, sy) less a circle, as one outline.
// (Added to the parts, not grown and shrunk: JSCAD's 2D offsets leave outlines its booleans then lose)
function fillet(x, y, sx, sy, r) {
  if (!(r > 0)) return null;
  const pts = [[x, y], [x + sx * r, y]], cx = x + sx * r, cy = y + sy * r;
  for (let i = 1; i < 16; i++) { const a = (Math.PI / 2) * (i / 16); pts.push([cx - sx * r * Math.sin(a), cy - sy * r * Math.cos(a)]); }
  pts.push([x, y + sy * r]);
  return polygon({ points: sx * sy > 0 ? pts : pts.reverse() });
}

/**
 * @typedef {{ width: number, leaf: { length: number, thickness: number, apart: number, fillet?: number, taper?: number },
 *   bar: { inner: number, width: number }, horn: { reach: number, tip?: number, open: number },
 *   jaws: { from: number, to: number, gap: number }, guide?: { end?: number }, stop?: { open?: number, close?: number,
 *   pin?: number, wall?: number, tongue?: number }, gap?: number, round?: number, base?: number }} GripperJaws
 *   width: the print's height, and the leaves' width (z); leaf: each guide's two leaves, their length along x, their
 *   thickness, and how far apart their middles are (y), with the round where each meets a block (fillet, default 1) and
 *   the taper as a leaf's; bar: the jaw's bar, its inner face's y at rest (where the horn's tip pushes) and its width
 *   outward from there; horn: the arm from the axis to the middle of its tip (reach), the tip's radius (default 2.25,
 *   a 4.5 mm arm) and its angle from +x when the jaws are fully open (degrees; at rest the tip touches the bar, which
 *   sets the rest angle); jaws: their x span and the gap between their faces at rest; guide.end: the x of the fork's
 *   front face, behind the horn's sweep (default -(reach + tip + 1)); stop.open: how far a jaw may open before its stop
 *   (default the horn's stroke and 0.5), stop.close: how far it may close (default the jaws' gap and the print gap),
 *   stop.pin: the tongue's round end (default 3), stop.wall: the fork's wall past the slot (default 2), stop.tongue:
 *   the tongue's widest (default 6: stiff enough, light enough); gap: the air
 *   between parts printed together (default 0.3, a printer's print_gap); round: every inside corner of the rigid
 *   parts (default 1.5); base: the root block behind each guide (default 6)
 */

// Everything the shape and the model share, worked out once, after the parameters are checked by name
function layout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the gripper's parameters (width, leaf, bar, horn, jaws)`);
  for (const k of ['leaf', 'bar', 'horn', 'jaws']) if (!p[k] || typeof p[k] !== 'object') throw new Error(`${what}: ${k} is an object (see GripperJaws: leaf { length, thickness, apart }, bar { inner, width }, horn { reach, open }, jaws { from, to, gap })`);
  const pos = (o, k, label = k, d) => { const v = o[k] ?? d; if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`${what}: ${label} is a size above 0 (got ${JSON.stringify(o[k])})`); return v; };
  const W = pos(p, 'width'), L = pos(p.leaf, 'length', 'leaf.length'), t = pos(p.leaf, 'thickness', 'leaf.thickness'), apart = pos(p.leaf, 'apart', 'leaf.apart');
  const fillet = p.leaf.fillet ?? 1, taper = p.leaf.taper ?? 0;
  if (!(fillet >= 0) || !(taper >= 0 && taper <= 1)) throw new Error(`${what}: leaf.fillet is 0 or more and leaf.taper 0 to 1 (got ${fillet}, ${taper})`);
  const inner = pos(p.bar, 'inner', 'bar.inner'), bw = pos(p.bar, 'width', 'bar.width'), r = pos(p.horn, 'reach', 'horn.reach'), rt = pos(p.horn, 'tip', 'horn.tip', 2.25), gap = pos(p, 'gap', 'gap', 0.3), round = p.round ?? 1.5, base = pos(p, 'base', 'base', 6);
  if (!(typeof round === 'number' && round >= 0)) throw new Error(`${what}: round is the inside corners' radius, 0 or more (got ${JSON.stringify(p.round)})`);
  const aOpen = p.horn.open;
  if (inner - rt <= 0) throw new Error(`${what}: bar.inner ${inner} is inside the horn's tip (${rt}): the tip must reach out to the bar`);
  if (inner - rt >= r) throw new Error(`${what}: the horn's reach ${r} doesn't get its tip to the bar at ${inner}: a reach over ${n2(inner - rt)} mm, or the bars nearer`);
  const aRest = Math.asin((inner - rt) / r) / rad;
  if (typeof aOpen !== 'number' || !(aOpen > aRest && aOpen < 90)) throw new Error(`${what}: horn.open is the arm's angle with the jaws open, between its rest angle ${n2(aRest, 1)}° (the tip on the bar) and 90° (got ${JSON.stringify(aOpen)})`);
  const stroke = r * Math.sin(aOpen * rad) - (inner - rt);
  const jf = p.jaws.from, jt = p.jaws.to, g0 = pos(p.jaws, 'gap', 'jaws.gap'), sweep = r * Math.cos(aRest * rad) + rt; // the upper arm reaches furthest forward at rest
  if (!(typeof jf === 'number' && typeof jt === 'number' && jt > jf)) throw new Error(`${what}: jaws.from and jaws.to are the jaws' x span, from before to (got ${jf}, ${jt})`);
  if (jf < sweep + gap) throw new Error(`${what}: the jaws start at x ${jf}, in the horn's sweep (it reaches x ${n2(sweep)}): start them at ${n2(sweep + gap)} or more`);
  if (g0 < gap) throw new Error(`${what}: jaws.gap ${g0} is under the print gap ${gap}: the jaws would print fused`);
  if (g0 / 2 >= inner) throw new Error(`${what}: jaws.gap ${g0} puts the jaws' faces outside the bars (inner ${inner})`);
  const xf = p.guide?.end ?? -(r + rt + 1);
  if (typeof xf !== 'number' || xf > -(r + rt)) throw new Error(`${what}: guide.end ${xf} is in the horn's sweep: the fork's front must be at x -${n2(r + rt)} or further back`);
  const so = p.stop?.open ?? stroke + 0.5, sc = p.stop?.close ?? g0 + gap, rp = (p.stop?.pin ?? 3) / 2, wall = p.stop?.wall ?? 2, tw = p.stop?.tongue ?? 6;
  for (const [k, v] of [['stop.open', so], ['stop.close', sc], ['stop.pin', 2 * rp], ['stop.wall', wall], ['stop.tongue', tw]]) if (!(typeof v === 'number' && v > 0)) throw new Error(`${what}: ${k} is a size above 0 (got ${JSON.stringify(v)})`);
  // the tongue between the leaves keeps clear of each as it bends toward it: the inner leaf comes up by the opening
  // stop, the outer one down by the closing stop. At the fork that leaves apart - t - 2 gap - both stops for the pin
  const least = t + 2 * gap + so + sc + 2 * rp;
  if (apart < least) throw new Error(`${what}: leaf.apart ${apart} leaves no room for the stop's tongue between the leaves as they bend ${n2(so)} mm open and ${n2(sc)} mm closed: ${n2(least)} or more`);
  const yg = inner + bw / 2, low = yg - apart / 2 - t / 2 - fillet - sc; // the guide centred on its bar; the inner leaf's lowest edge, closed to its stop
  if (low <= gap / 2) throw new Error(`${what}: the two guides meet in the middle (the inner leaves come to y ${n2(low)}): move the bars out (bar.inner) or the leaves closer (leaf.apart)`);
  const drop = (3 * so * so) / (5 * L), fx = gap + drop, rc = 1; // the fork comes back toward the root by the guide's drop at the stop
  const xs = xf - wall, xp = xs - rc - fx - rp, xb = xp - rp - 1, xr = xb - L; // the slot's front, the pin's middle, the fork's back face, the roots
  const yt = yg + (so - sc) / 2; // the pin's middle: as far from each leaf as that leaf's stop asks
  if (tw < 2 * rp) throw new Error(`${what}: stop.tongue ${tw} is narrower than its pin (${2 * rp})`);
  return { tw, W, L, t, apart, fillet, taper, inner, bw, r, rt, gap, round, base, aRest, aOpen, stroke, jf, jt, g0, sweep, xf, so, sc, rp, wall, yg, yt, drop, fx, rc, xs, xp, xb, xr, leaf: { length: L, thickness: t, width: W, fillet, taper, into: Math.max(1, fillet) } };
}

// The tongue's edges s mm from the roots: clear of each leaf (rounds included) as it bends to its stop, which moves a
// guided leaf's points by stop × (3u² - 2u³), u = s / L; never narrower than the pin
function tongueEdges(k, s) {
  const half = beamProfile(k.leaf, 'guided')(Math.min(k.L, Math.max(0, s))), u = Math.min(1, Math.max(0, s / k.L)), f = 3 * u * u - 2 * u * u * u;
  const lo = Math.max(k.yg - k.apart / 2 + half + k.gap + k.so * f, k.yt - k.tw / 2), hi = Math.min(k.yg + k.apart / 2 - half - k.gap - k.sc * f, k.yt + k.tw / 2);
  return [Math.min(lo, k.yt - k.rp), Math.max(hi, k.yt + k.rp)];
}

// The upper half in 2D: the ground (root block and tongue) and the jaw (fork, bar, jaw), each with its inside corners
// rounded (the tongue meets its block along the leaves' own rounds, a gap off them)
function halves(k) {
  // the tongue: as wide as the leaves let it be, out to a shoulder where it narrows to the pin, the fork's back face
  // clear of the shoulder at the stop (the fork comes back by the guide's drop)
  const shoulder = k.L - k.fx - 1, n = 48, hs = Array.from({ length: n + 1 }, (_, i) => { const s = (shoulder * i) / n; return [k.xr + s, ...tongueEdges(k, s)]; });
  const outline = [[k.xr - 1, hs[0][1]], ...hs.map(([x, lo]) => [x, lo]), ...hs.slice().reverse().map(([x, , hi]) => [x, hi]), [k.xr - 1, hs[0][2]]];
  const tongue = union(polygon({ points: outline }), rect(k.xr, k.xp, k.yt - k.rp, k.yt + k.rp), translate([k.xp, k.yt], circle({ radius: k.rp, segments: 32 })));
  const across = k.apart / 2 + k.t / 2 + k.fillet + 0.5; // the blocks reach past the leaves' rounds
  const root = rect(k.xr - k.base, k.xr, k.yg - across, k.yg + across);
  const rs = Math.min(k.round, 0.8 * Math.min(k.so, k.sc), k.fx + 0.5); // the shoulder's rounds stay in the slot's mouth and clear of the fork
  const ground = union(root, tongue, ...[fillet(k.xr + shoulder, k.yt - k.rp, 1, -1, rs), fillet(k.xr + shoulder, k.yt + k.rp, 1, 1, rs)].filter(Boolean));
  // the jaw: fork, bar forward to the jaws, and the jaw reaching in to the gap
  const fork = rect(k.xb, k.xf, k.yg - across, k.yg + across), bar = rect(k.xf - k.round, k.jt, k.inner, k.inner + k.bw), jaw = rect(k.jf, k.jt, k.g0 / 2, k.inner + k.bw / 2);
  // the slot, open at the fork's back face, its front corners rounded: the pin's gap to its lower wall is the opening
  // stop (the jaw opens toward +y, so the fork's lower wall comes to the pin), to its upper wall the closing stop
  const sx0 = k.xb - 2 - k.rc, slot = roundedRectangle({ size: [k.xs - sx0, k.sc + k.so + 2 * k.rp], center: [(k.xs + sx0) / 2, k.yt + (k.sc - k.so) / 2], roundRadius: k.rc, segments: 16 });
  const rounds = [fillet(k.xf, k.inner, 1, -1, k.round), fillet(k.jf, k.inner, -1, -1, k.round), ...(k.inner + k.bw < k.yg + across - k.round ? [fillet(k.xf, k.inner + k.bw, 1, 1, k.round)] : [])];
  const moving = subtract(union(fork, bar, jaw, ...rounds.filter(Boolean)), slot);
  return { ground, moving };
}

/**
 * Compliant gripper jaws (GripperJaws above): the ground (two root blocks and the stops' tongues), and the two jaws,
 * each on a parallel guide, drawn at rest (the leaves straight, the jaws closed to their gap), printed flat.
 * @param {GripperJaws} p
 * @param {{ part?: 'all' | 'ground' | 'upper' | 'lower' }} [o] one piece of it, for a check that moves them apart
 * @returns {object} a JSCAD geom3
 */
export function gripperJaws(p, { part = 'all' } = {}) {
  const k = layout(p, 'gripperJaws');
  if (!['all', 'ground', 'upper', 'lower'].includes(part)) throw new Error(`gripperJaws: part is all, ground, upper or lower (got ${JSON.stringify(part)})`);
  // all in the plane, then one extrusion: the whole print is the same outline from the bed up (JSCAD's 3D unions of
  // parts side by side lose volume; its 2D ones of overlapping outlines don't)
  const { ground, moving } = halves(k), half = beamProfile(k.leaf, 'guided'), into = k.leaf.into, xs = [];
  for (let i = 0; i <= 160; i++) xs.push((k.L * i) / 160);
  const leaf = (y) => polygon({ points: [[-into, -k.t / 2], ...xs.map((x) => [x, -half(x)]), [k.L + into, -k.t / 2], [k.L + into, k.t / 2], ...xs.slice().reverse().map((x) => [x, half(x)]), [-into, k.t / 2]].map(([x, yy]) => [k.xr + x, y + yy]) });
  const upper = union(moving, leaf(k.yg - k.apart / 2), leaf(k.yg + k.apart / 2)); // the leaves go with the jaw: they run into the root block too
  const flat = { ground: union(ground, mirrorY(ground)), upper, lower: mirrorY(upper) };
  return extrudeLinear({ height: k.W }, part === 'all' ? union(flat.ground, flat.upper, flat.lower) : flat[part]);
}

/**
 * What the gripper does with a servo: the horn's stroke and push, the stiffest spring it opens at the margin asked,
 * the grip on an object by its width, what that holds, the stops, the leaves' strain, and how it prints, as findings.
 * The grip comes from the springs (each jaw pushed open by the object); the servo's torque sets how far and against
 * how stiff a spring it can open them, so it bounds both.
 * @param {GripperJaws} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m flexureMaterial(rules)
 * @param {{ torque: number, share?: number, payload?: number, accel?: number, friction?: number, margin?: number,
 *   printer?: { line: number, layer: number, wall_min?: number } }} o torque: the servo's stall torque (N m); share:
 *   the part of it counted on to open the jaws (default 0.6, as the kit's grip check; the stops take the full stall torque); payload: the object's mass (kg, default 0);
 *   accel: the arm's (mm/s², default 0); friction: jaw on object (default 0.4, an estimate); margin: asked of the
 *   servo against the springs and of the grip against the load (default 2); printer: for the leaves' lines and layers
 * @returns {{ at: { back: number, root: number, fork: number[], pin: number[], guide: number, jaw: number[], bar: number[] },
 *   stroke: number, rest: number, open: number, stop: { open: number, close: number }, drop: number,
 *   push: (angle: number) => number, stiffness: number, bar: number,
 *   spring: number, stiffest: number, grip: (width: number) => number, widest: number, rated: number | null,
 *   need: number, limit: number, tongue: number, grams: number | null, findings: { level: string, text: string,
 *   code: string, values?: object }[], rests: string[] }}
 *   at: where things are on the upper side, for a design to place by (the lower is its mirror): the root blocks' back
 *   face and front (x), the fork's back and front (x), the stop pin's middle, the guide's middle (y), the jaw's middle
 *   and face, the bar's inner and outer faces (y); stop: each jaw's travel to its stops; drop: how far the fork comes
 *   back toward the roots at the opening stop (3 d² / 5L); stroke: each jaw's opening (mm); rest: the horn's angle at rest (°); push(angle): the push on each bar (N);
 *   stiffness: a jaw's spring at its face (N/mm, the guide and the bar in series); spring: the guide's force at full
 *   open; stiffest: the most the guide could be for the servo to open it at the margin; grip(width): each jaw's
 *   force on an object that wide; widest: the widest object that goes in; rated: the narrowest held at the margin
 *   (null if none); need: the payload's weight and inertia (N); limit: the guide's travel at the strain limit;
 *   tongue: a stop's stiffness (N/mm); grams: the print's mass (with a density)
 */
export function gripperJawsModel(p, m, o) {
  const k = layout(p, 'gripperJawsModel');
  need('gripperJawsModel', {}, m);
  if (!(m.strainLimit > 0)) throw new Error('gripperJawsModel: the material needs a strainLimit (flexureMaterial(rules) gives one)');
  if (!o || typeof o !== 'object') throw new Error('gripperJawsModel: give the servo { torque } in N m (an SG90: 0.1765, sg90.stall_torque)');
  const num = (key, d, ok, says) => { const v = o[key] ?? d; if (typeof v !== 'number' || !Number.isFinite(v) || !ok(v)) throw new Error(`gripperJawsModel: ${key} ${says} (got ${JSON.stringify(o[key])})`); return v; };
  const torque = num('torque', undefined, (v) => v > 0, 'is the servo\'s stall torque in N m, above 0');
  const share = num('share', 0.6, (v) => v > 0 && v <= 1, 'is the part of the stall torque counted on, above 0 and at most 1');
  const payload = num('payload', 0, (v) => v >= 0, 'is the object\'s mass in kg, 0 or more');
  const accel = num('accel', 0, (v) => v >= 0, 'is the arm\'s acceleration in mm/s², 0 or more');
  const mu = num('friction', 0.4, (v) => v > 0, 'is the friction of jaw on object, above 0');
  const want = num('margin', 2, (v) => v >= 1, 'is the margin asked, 1 or more');
  const rests = [];
  if (o.friction == null) rests.push('friction 0.4: jaw on object, an estimate (PETG on a clean dry part); a soft pad doubles it');
  if (o.share == null) rests.push('share 0.6: the part of the servo\'s stall torque counted on, the kit\'s grip check\'s figure, an estimate');
  if (p.stop?.open == null) rests.push('stop.open: the stroke and 0.5 mm, a default, so the horn opens the jaws fully before a stop takes its push');
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });

  // The horn: its tip's top on the bar's flat inner face, at r sin a + tip; it pushes each bar with T / (2 r cos a)
  // (half the torque on each arm, over the arm's lever across the push)
  const T = torque * 1000 * share, push = (a) => T / (2 * k.r * Math.cos(a * rad));
  const guide = parallelGuideModel(k.leaf, m), kg = guide.stiffness, span = (k.jf + k.jt) / 2 - k.xf;
  const kb = (3 * m.E * (k.W * k.bw ** 3) / 12) / span ** 3, stiffness = 1 / (1 / kg + 1 / kb); // the bar a cantilever from the fork to the jaws' middle
  const spring = kg * k.stroke, pushOpen = push(k.aOpen), servoMargin = pushOpen / spring, stiffest = pushOpen / (want * k.stroke);
  // (the spring's force rises with the travel and the push with the angle, as the lever r cos a shortens: the worst is
  // at full open, so the margin there is the least)
  const widest = k.g0 + 2 * k.stroke - 2 * k.gap, grip = (w) => (w <= k.g0 ? 0 : stiffness * (Math.min(w, widest) - k.g0) / 2);
  const needN = payload * (G + accel / 1000), rated = needN > 0 ? k.g0 + (want * needN) / (mu * stiffness) : k.g0, once = needN > 0 ? k.g0 + needN / (mu * stiffness) : k.g0;
  const limit = guide.travel(m.strainLimit);

  f('pass', `the horn opens each jaw ${n2(k.stroke)} mm, turning from ${n2(k.aRest, 1)}° (its tip on the bar) to ${n2(k.aOpen, 1)}°: it pushes each bar with ${n2(push(k.aRest))} N at rest and ${n2(pushOpen)} N fully open (${n2(T / 1000, 4)} N m, ${n2(share * 100, 0)}% of ${torque} N m)`, 'gripper.drive', { stroke: k.stroke, rest: k.aRest, open: k.aOpen, pushRest: push(k.aRest), pushOpen, torque: T / 1000 });
  f(servoMargin >= want ? 'pass' : servoMargin >= 1 ? 'warn' : 'fail', `the servo against the springs: ${n2(pushOpen)} N to open against ${n2(spring)} N from each guide (${n2(kg, 3)} N/mm × ${n2(k.stroke)} mm), ${n2(servoMargin, 1)} times${servoMargin < 1 ? ': it can\'t open them fully' : ''}; the guides could be up to ${n2(stiffest, 3)} N/mm for ${want} times`, 'gripper.servo', { push: pushOpen, spring, margin: servoMargin, stiffest });
  if (kb < 10 * kg) f('warn', `the bar bends: ${n2(kb, 2)} N/mm at the jaws against the guide's ${n2(kg, 3)}, under 10 times: a wider bar keeps the grip`, 'gripper.bar', { bar: kb, guide: kg });
  const g = (w) => n2(grip(w));
  if (needN === 0) f('pass', `the grip: ${n2(stiffness, 3)} N/mm at each jaw, objects ${n2(k.g0)} to ${n2(widest)} mm across; at ${n2(widest)} mm each jaw presses ${g(widest)} N. No payload given, so nothing to hold`, 'gripper.grip', { stiffness, widest });
  else if (rated <= widest) f('pass', `the grip holds ${n2(payload * 1000, 0)} g (${n2(needN, 3)} N with the arm's ${accel} mm/s²) ${want} times over on objects ${n2(rated)} to ${n2(widest)} mm across, by friction ${mu} on two jaws: ${g(rated)} N a jaw at ${n2(rated)} mm, ${g(widest)} N at ${n2(widest)} mm`, 'gripper.grip', { need: needN, rated, widest, stiffness });
  else if (once <= widest) f('warn', `the grip holds ${n2(payload * 1000, 0)} g only under ${want} times: at the widest object, ${n2(widest)} mm, each jaw presses ${g(widest)} N, ${n2((2 * mu * grip(widest)) / needN, 2)} times the ${n2(needN, 3)} N needed. Stiffer guides (to ${n2(stiffest, 3)} N/mm), a longer stroke or a softer pad`, 'gripper.grip', { need: needN, once, widest, stiffness });
  else f('fail', `the grip can't hold ${n2(payload * 1000, 0)} g: even ${n2(widest)} mm across, each jaw presses ${g(widest)} N, ${n2(2 * mu * grip(widest), 3)} N held against ${n2(needN, 3)} N`, 'gripper.grip', { need: needN, widest, stiffness });
  f('pass', `the springs hold the grip with the servo off: it opens the jaws and lets go, so it never stalls on a load`, 'gripper.holds');

  // The stops: open past the stroke, within travelStop's 0.8 of the strain limit; the tongue a cantilever from its
  // root, its width varying, as stiff as ∫ (ℓ - s)² / EI(s) ds says at its pin
  const ell = k.xp - k.xr, steps = 400; let flex = 0;
  for (let i = 0; i < steps; i++) { const s = ((i + 0.5) * ell) / steps, [lo, hi] = s < k.L - k.fx - 1 ? tongueEdges(k, s) : [0, 2 * k.rp]; flex += ((ell - s) ** 2 / (m.E * (k.W * (hi - lo) ** 3) / 12)) * (ell / steps); }
  const tongue = 1 / flex;
  // driven on past full open, the horn pushes a jaw onto its stop: with the tip at the stop's travel the arm stands
  // at asin((inner - tip + stop) / reach), its push less the guide's spring is what the tongue takes, and it gives a
  // little more travel, over = that / its stiffness (no angle reaches it if the tip can't get there). A servo driven
  // onto a stop stalls there, so the push is from its full stall torque, Ts / (2 r cos a), not the share counted on
  const Ts = torque * 1000, sinStop = (k.inner - k.rt + k.so) / k.r, onStop = sinStop < 1 ? Math.max(0, Ts / (2 * k.r * Math.sqrt(1 - sinStop ** 2)) - kg * k.so) : 0, most = k.so + onStop / tongue;
  const stopLevel = most <= 0.8 * limit ? 'pass' : most <= limit ? 'warn' : 'fail';
  if (k.so < k.stroke) f('fail', `the opening stop at ${n2(k.so)} mm is short of the horn's ${n2(k.stroke)} mm stroke: the stop takes the servo's push before the jaws are open`, 'gripper.stop', { stop: k.so, stroke: k.stroke });
  else f(stopLevel, `the stops: each jaw stops ${n2(k.so)} mm open and ${n2(k.sc)} mm closed, a tongue's round end in a slot in its fork (${n2(tongue, 1)} N/mm, ${n2(tongue / kg, 0)} times the guide). ${sinStop < 1 ? `Driven onto it at its full stall torque (${torque} N m) the horn pushes ${n2(onStop)} N more, and the tongue gives to ${n2(most)} mm` : 'The horn\'s tip can\'t reach it'}: ${n2((most / limit) * 100, 0)}% of the leaves' limit of ${n2(limit)} mm${stopLevel === 'pass' ? '' : `, past the 0.8 travelStop allows${stopLevel === 'fail' ? ' and past the limit' : ''}`}`, 'gripper.stop', { open: k.so, close: k.sc, limit, tongue, onStop, most });
  if (o.printer) for (const x of printable({ thickness: k.t, width: k.W, travel: +k.stroke.toFixed(2), stop: +k.so.toFixed(2) }, o.printer, m, guide)) out.push(x);
  else { const e = guide.strain(k.stroke); f(e <= m.strainLimit ? 'pass' : 'fail', `fully open the leaves see ${n2(e * 100, 2)}% strain, ${e <= m.strainLimit ? 'within' : 'over'} the limit of ${n2(m.strainLimit * 100, 2)}%`, 'flexure.strain', { strain: e, limit: m.strainLimit }); }

  let grams = null;
  if (m.density > 0) { grams = (measureVolume(gripperJaws(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'gripper.mass', { grams }); }
  const at = { back: k.xr - k.base, root: k.xr, fork: [k.xb, k.xf], pin: [k.xp, k.yt], guide: k.yg, jaw: [(k.jf + k.jt) / 2, k.g0 / 2], bar: [k.inner, k.inner + k.bw] };
  return { at, stroke: k.stroke, rest: k.aRest, open: k.aOpen, stop: { open: k.so, close: k.sc }, drop: k.drop, push, stiffness, bar: kb, spring, stiffest, grip, widest, rated: needN > 0 && rated <= widest ? rated : needN > 0 ? null : k.g0, need: needN, limit, tongue, grams, findings: out, rests };
}

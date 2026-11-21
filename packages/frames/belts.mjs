// A belt drive along a beam: a timing belt (gt2-belt-6) round a pulley on a motor at end a of the beam and a toothed
// idler at the far end, both its ends held in a printed clamp on a rail's carriage. The motor hangs past the beam's end
// under a flat printed plate whose tab screws into the face's slot, its shaft out of the face; the pulley sits on its
// shaft over the plate. The idler turns on an M5 axle in a printed block beyond the rail's end, which is the tensioner:
// its two screws go into slot nuts in the face's own slot, so loosened it slides along the slot to take up the belt's
// stretch and the length the belt was cut to, and tightened they hold it there. The belt's two runs lie side by side at one height over the face, clear over
// the carriage: the working run in the clamp's toothed channel, the return run beside it.
//
// Every part's frame is a mount's on the face: x along the beam, y across it, z out of the face (0 on it), its origin
// on the face's slot at the address it is placed at. The plate's origin is the beam's end a (it is placed at @0), the
// clamp's the carriage's top, the idler block's its own end toward a. Units: mm, N, kg, grams.
import jscad from '@jscad/modeling';
import { hole, holeModel, fixingModel, counterbore, washerModel, engagement } from '@rulecad/fixings';
import { SETS } from './catalogue.mjs';
import { FITTING_DEFAULTS, options, profileOf, printerOf, ccw, combine, screwOf, sold, slotSide } from './fitting.mjs';
import { partSetup, weigh, closingFindings, bendT, bendMargin } from './panel.mjs';

const { cylinder, polygon, cuboid } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { translate, rotateY } = jscad.transforms;
const CHECKED = '2026-11-21';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const up = (x, step) => Math.ceil(x / step - 1e-9) * step;
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });
const short = (n) => String(n).replace(/^profile-/, '');
const want = () => FITTING_DEFAULTS.margin.value;
const fig = (s, k) => s.rules[k]?.value;
const KIT = 'A working figure of @rulecad/frames';

/** The working figures of a belt drive, each with what it rests on. */
export const BELT_DEFAULTS = {
  tension: rule(25, 'N', 'The tension each span of the belt is set to where none is given', 'estimate', `${KIT}: inside Gates's 9.3 N least static tension and 173 N rated tension for the 6 mm belt (gt2-belt-6); measure it by the span's pluck frequency or a spring balance`),
  thickness: rule(1.38, 'mm', 'A 2 mm pitch GT2 belt\'s whole thickness, its teeth and its back', 'estimate', 'The figure hobby sellers commonly give for GT2 belt, not checked here against a maker\'s drawing: measure your belt'),
  tooth: rule(0.75, 'mm', 'A GT2 belt\'s tooth height', 'estimate', 'The figure hobby sellers commonly give for GT2 belt, not checked here against a maker\'s drawing: measure your belt'),
  mesh: rule(6, 'teeth', 'The least teeth of a belt end in a clamp\'s toothed channel', 'estimate', `${KIT}: enough that the belt's own rubber teeth share the tension; a belt end that slips in its clamp says more are needed`),
  flange: rule(1, 'mm', 'A hobby pulley\'s flange beyond its toothed band, the band at the end away from its hub', 'estimate', `${KIT}: how the 16 mm GT2 pulleys are made (a hub with its grub screws, then the band between flanges); measure where the band of yours lies`),
  boss: rule(1, 'mm', 'The raised ring under an idler\'s inner race, so its flange runs clear of the block', 'default', KIT),
  line: rule(0.25, '°', 'The most the belt\'s working run may lie off square to the pulley and idler, along the travel', 'estimate', `${KIT}: belt makers ask for pulleys aligned within a fraction of a degree, or the belt walks onto a flange and wears`),
  sold: rule(1000, 'mm', 'Open GT2 belt is bought by the metre: the length to buy is the length to cut, rounded up to whole metres', 'estimate', 'How hobby sellers list open GT2 belt (by the metre and in rolls of whole metres), not one seller\'s list'),
  accel: rule(1000, 'mm/s²', 'The carriage\'s acceleration a belt drive is sized for where neither the guide nor the task gives one', 'default', `${KIT}: a slow machine's; give the one you will run`),
  clamp_gap: rule(2, 'mm', 'Between the two belt ends in the middle of a clamp\'s channel', 'default', KIT),
  shear: rule(0.5, '× strength', 'A printed tooth fails in shear at about this share of the plastic\'s strength', 'estimate', `${KIT}: the usual ratio of shear to tensile strength for a plastic, not measured for printed teeth`),
};

// ---------- the sets ----------
const known = (part) => Object.values(SETS).filter((s) => s.part === part).map((s) => s.name).sort();
const setOf = (what, key, part, name) => {
  const s = SETS[String(name ?? '').toLowerCase()];
  if (!s || s.part !== part) throw new Error(`${what}: ${key} is a ${part}'s rule set, one of ${known(part).join(', ') || 'none'} (got ${shown(name)})`);
  return s;
};
/** A belt's, a pulley's and an idler's figures from their sets, checked against each other. @internal */
function setsOf(what, o) {
  const belt = setOf(what, 'belt', 'belt', o.belt ?? 'gt2-belt-6'), pulley = setOf(what, 'pulley', 'pulley', o.pulley ?? 'pulley-gt2-20'), idler = setOf(what, 'idler', 'idler', o.idler ?? 'idler-gt2-toothed-20');
  const p = fig(belt, 'pitch'), w = fig(belt, 'width');
  if (Math.abs(fig(pulley, 'pitch') - p) > 1e-9 || Math.abs(fig(pulley, 'belt_width') - w) > 1e-9) throw new Error(`${what}: ${pulley.name} is for a ${mm(fig(pulley, 'pitch'))} mm pitch, ${mm(fig(pulley, 'belt_width'))} mm belt and ${belt.name} is ${mm(p)} mm, ${mm(w)} mm`);
  if (Math.abs(fig(idler, 'belt_width') - w) > 1e-9) throw new Error(`${what}: ${idler.name} is for a ${mm(fig(idler, 'belt_width'))} mm belt and ${belt.name} is ${mm(w)} mm`);
  const toothed = fig(idler, 'toothed') === 'yes', least = fig(belt, 'min_flat_idler_diameter');
  if (!toothed && isNum(least) && fig(idler, 'outer_diameter') < least) throw new Error(`${what}: ${idler.name} is smooth and ${mm(fig(idler, 'outer_diameter'))} mm across, and it runs inside the belt on its teeth, where ${belt.name}'s maker asks for ${mm(least)} mm at least (min_flat_idler_diameter): use a toothed idler, idler-gt2-toothed-20`);
  if (toothed && isNum(fig(belt, 'min_inside_idler_grooves')) && fig(idler, 'teeth') < fig(belt, 'min_inside_idler_grooves')) throw new Error(`${what}: ${idler.name} has ${fig(idler, 'teeth')} teeth, under the ${fig(belt, 'min_inside_idler_grooves')} ${belt.name}'s maker asks of an idler inside it`);
  const pd = (s) => fig(s, 'pitch_diameter') ?? r3((fig(s, 'teeth') * p) / Math.PI);
  return {
    belt: { set: belt.name, pitch: p, width: w, thickness: BELT_DEFAULTS.thickness.value, tooth: BELT_DEFAULTS.tooth.value, k: fig(belt, 'stiffness') ?? fig(belt, 'stiffness_per_width') * w, kw: fig(belt, 'stiffness_per_width') ?? fig(belt, 'stiffness') / w,
      kKind: belt.rules.stiffness?.kind ?? null, rated: fig(belt, 'rated_tension') ?? null, least: fig(belt, 'min_static_tension') ?? null, breaking: fig(belt, 'breaking_strength') ?? null },
    pulley: { set: pulley.name, teeth: fig(pulley, 'teeth'), pd: pd(pulley), od: fig(pulley, 'outer_diameter'), body: fig(pulley, 'body_width'), bore: fig(pulley, 'bore') },
    idler: { set: idler.name, teeth: toothed ? fig(idler, 'teeth') : null, toothed, pd: toothed ? r3((fig(idler, 'teeth') * p) / Math.PI) : fig(idler, 'outer_diameter'), od: fig(idler, 'outer_diameter'), body: fig(idler, 'body_width'), bore: fig(idler, 'bore') },
  };
}
// a motor's figures a plate takes: its square of mounting holes, their thread, its boss, its shaft, its body
function motorOf(what, name) {
  const s = setOf(what, 'motor', 'motor', name), pattern = fig(s, 'mount_pattern'), sp = fig(s, 'mount_hole_spacing'), thread = fig(s, 'mount_hole_thread');
  if (pattern !== 'square' || !isNum(sp) || typeof thread !== 'string' || fig(s, 'body_shape') !== 'square') throw new Error(`${what}: ${s.name} is not a square-bodied motor with four tapped mounting holes (a NEMA frame's): a belt plate holds one of those, ${known('motor').filter((n) => fig(SETS[n], 'mount_pattern') === 'square').join(' or ')}`);
  return { set: s.name, holes: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [r3((a * sp) / 2), r3((b * sp) / 2)]), thread, body: fig(s, 'body_width'), boss: { d: fig(s, 'boss_diameter') ?? 0, h: fig(s, 'boss_height') ?? 0 }, shaft: { d: fig(s, 'shaft_diameter'), length: fig(s, 'shaft_length') }, mass: fig(s, 'mass') ?? null };
}

// ---------- drawing ----------
const prismZ = (loop, z0, z1) => translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, polygon({ points: ccw(loop) })));
const discZ = (x, y, d, z0, z1) => translate([x, y, (z0 + z1) / 2], cylinder({ radius: d / 2, height: z1 - z0, segments: 48 }));
// a rectangle with its corners rounded by r, as a loop
function roundedRect(x0, y0, x1, y1, r, steps = 8) {
  const out = [], c = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
  for (const [cx, cy, a0] of c) for (let k = 0; k <= steps; k++) { const a = ((a0 + (90 * k) / steps) * Math.PI) / 180; out.push([r3(cx + r * Math.cos(a)), r3(cy + r * Math.sin(a))]); }
  return out;
}
// the printer a part was drawn for, kept with its model (not a figure of it), and its fit
const keep = (m, k) => { Object.defineProperty(m, 'pr', { value: k.pr, enumerable: false }); m.fit = k.fit; };
function tensionOf(what, T) {
  if (T == null) return BELT_DEFAULTS.tension.value;
  if (!(isNum(T) && T > 0)) throw new Error(`${what}: tension is each span's tension, in N, above 0 (got ${shown(T)})`);
  return T;
}

// ---------- the motor's plate ----------
/**
 * A printed plate that holds a square-bodied motor past a beam's end a, its shaft out of the face, with the belt's
 * pulley on the shaft over the plate: a flat plate on the face whose tab over the beam screws into the face's slot
 * (two screws along it) and whose far part holds the motor by its four tapped holes, the motor's boss through a hole.
 * It is as thick as the motor's screws ask (1.5 × their thread), as the load's bend asks at the beam's end (the belt's
 * two spans pulling on the pulley at the belt's height, and the motor's weight), and as the belt's height over the
 * face asks: the pulley's band is over the carriage. It prints flat on its face side, every hole upright.
 * @param {string | object} profile
 * @param {{ face?: string, motor?: string, pulley?: string, belt?: string, across?: number, least?: number, lift?: number, tension?: number, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} [o]
 *   across: the pulley's middle off the slot's line, mm; least: the least height of the belt's middle over the face;
 *   lift: how much further up its shaft the pulley stands, mm (default 0: 1 mm over the plate), to raise the belt
 *   without a thicker plate
 * @returns {object} its model, with anchors motor (the motor's own frame: its face, its shaft out along z) and pulley
 */
export function beltPlateModel(profile, o = {}) {
  const what = 'beltPlateModel';
  options(what, o ?? {}, ['face', 'motor', 'pulley', 'belt', 'across', 'least', 'lift', 'tension', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), k = partSetup(what, o), S = setsOf(what, o), mo = motorOf(what, o.motor ?? 'nema17'), gap = 1, wall = 2;
  if (Math.abs(mo.shaft.d - S.pulley.bore) > 1e-9) throw new Error(`${what}: ${S.pulley.set}'s ${mm(S.pulley.bore)} mm bore does not go on ${mo.set}'s ${mm(mo.shaft.d)} mm shaft`);
  const face = o.face ?? 'top', sd = slotSide(what, p, face, o.thread, o.nut, k.fit, o.given ?? {}), sc = screwOf(what, sd.thread, o.head ?? 'cap', k.pr);
  const T = tensionOf(what, o.tension), across = o.across ?? 0, least = o.least ?? 0, lift = o.lift ?? 0;
  if (!isNum(across) || !isNum(least)) throw new Error(`${what}: across and least are mm (got ${shown(o.across)}, ${shown(o.least)})`);
  if (!(isNum(lift) && lift >= 0)) throw new Error(`${what}: lift is how much further up its shaft the pulley stands, mm, 0 or more (got ${shown(o.lift)})`);
  const xm = r3(-(mo.body / 2 + gap)), clear = holeModel(mo.thread, { kind: 'clearance', printer: k.pr }).diameter, rim = clear / 2 + wall + 1;
  const half = Math.max(...mo.holes.map((h) => Math.abs(h[0]))) + rim, x0 = r3(xm - half), y0 = r3(across - half), y1 = r3(across + half);
  // the band's middle over the plate's top: past the gap the pulley stands off it, its band at its far end
  const band = S.pulley.body - BELT_DEFAULTS.flange.value - S.belt.width / 2 + gap;
  // the tab's two screws along the slot, from the beam's end
  const endBy = r3(up(Math.max(sc.dk / 2 + FITTING_DEFAULTS.reach.value, sc.hd), 0.5)), pitch = r3(up(Math.max(sc.dk, sd.nut.length ?? 0) + FITTING_DEFAULTS.pitch.value, 0.5)), xs = [endBy, r3(endBy + pitch)], x1 = r3(xs[1] + endBy);
  // its thickness: the motor's screws, the bend at the beam's end, the belt's height; then a length of slot screw sold
  const W = (mo.mass ?? 0) * 9.80665, b = y1 - y0, Mof = (t) => 2 * T * (t + band + lift - t / 2) + W * Math.abs(xm);
  let t = Math.max(up(1.5 * fixingModel(mo.thread).major, k.layer), up(least - band, k.layer));
  for (let i = 0; i < 40 && bendMargin(Mof(t), b, t, k.S) < want(); i++) t = r3(t + k.layer);
  t = r3(up(t, k.layer));
  const fits = sold(t, k.layer, [sd], sd.thread);
  if (fits) t = fits.t;
  const z0 = r3(t + gap + lift), top = r3(z0 + S.pulley.body), height = r3(t + band + lift), M = Mof(t), margin = r3(bendMargin(M, b, t, k.S)), stress = r3((6 * M) / (b * t * t));
  if (top > mo.shaft.length + 1e-9 && mo.shaft.length - z0 < S.pulley.body / 2) throw new Error(`${what}: ${S.pulley.set} stands ${mm(z0)} to ${mm(top)} mm over ${mo.set}'s face on a ${mm(mo.shaft.length)} mm shaft, less than half on: a thinner plate, or a belt lower over the carriage`);
  const pocket = r3(mo.boss.d + 2 * k.fit + (k.pr.rules?.hole_comp?.value ?? 0.1));
  const m = { kind: 'fitting', fitting: 'belt-plate', guide: 'belt', name: `belt-plate-${mo.set}-${short(p.name)}-${sd.face.replace('.', '-')}`, title: `printed plate for the motor ${mo.set} and its ${S.pulley.set} on ${p.name}'s ${sd.face} face`,
    profile: p.name, face: sd.face, motor: mo.set, pulley: S.pulley.set, belt: S.belt.set, thickness: t, height, across, lift, outline: roundedRect(x0, y0, x1, y1, 3), x0, x1, y0, y1, motorAt: [xm, across],
    holes: mo.holes.map(([hx, hy]) => ({ at: [r3(xm + hx), r3(across + hy)], diameter: r3(clear) })), boss: pocket, thread: sd.thread, head: sc.head,
    screws: xs.map((x) => ({ thread: sd.thread, head: sc.head, grip: t, at: [x, 0, t], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null })),
    pulleyAt: { at: [xm, across, z0], top, band: height }, engaged: r3(Math.min(mo.shaft.length, top) - z0), hardware: [],
    load: { force: 2 * T, what: `the belt's two spans at ${mm(T)} N each on the pulley, ${mm(height)} mm over the face, and the motor's weight ${mm(Math.abs(xm))} mm past the beam's end` }, stress, margin,
    anchors: { motor: { at: [xm, across, 0], axis: [0, 0, 1], ref: [1, 0, 0] }, pulley: { at: [xm, across, z0], axis: [0, 0, 1], ref: [1, 0, 0] } },
    size: { along: r3(x1 - x0), across: r3(b), thickness: t }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['tension', 'flange'].map((x) => ({ name: `BELT_DEFAULTS.${x}`, value: BELT_DEFAULTS[x].value, kind: BELT_DEFAULTS[x].kind }))] };
  keep(m, k); weigh(m, beltPlate(m), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} ${sc.head} through its ${mm(t)} mm tab into each slot nut, its tip between ${mm(fits.windows[0].lo)} and ${mm(fits.windows[0].hi)} mm in`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } })
    : finding('warn', `no ${sd.thread} ${sc.head} screw sold engages its slot nut fully through ${mm(t)} mm: the screw's length is the fasten check's to choose`, 'fitting.screw', {}));
  m.findings.push(finding('info', `${mo.set} under its far part by four ${mo.thread} through ${mm(clear)} mm holes into its own thread, its ${mm(mo.boss.d)} mm boss through a ${mm(pocket)} mm hole; ${S.pulley.set} on its shaft from ${mm(z0)} to ${mm(top)} mm over the face (${mm(m.engaged)} mm on the shaft), its band's middle ${mm(height)} mm over the face (BELT_DEFAULTS.flange: an estimate of where a hobby pulley's band is)`, 'fitting.motor', { values: { engaged: m.engaged, height, boss: pocket } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(x1 - x0)} mm along the beam (${mm(-x0)} past its end), ${mm(b)} mm across, ${mm(t)} mm thick; two ${sd.thread} into the ${sd.face} slot`, marginText: `under ${m.load.what}, it bends at the beam's end to ${mm(stress)} MPa`, pose: 'flat on its face side, every hole upright' });
  return m;
}
/** A belt plate's solid, in its fitted frame (which is how it prints). @param {object} m beltPlateModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function beltPlate(m, o = {}) {
  if (m?.fitting !== 'belt-plate') throw new Error(`beltPlate: give a belt plate's model (beltPlateModel), not ${shown(m)}`);
  const pr = printerOf('beltPlate', m.pr ?? null), t = m.thickness, cuts = m.holes.map((q) => discZ(q.at[0], q.at[1], q.diameter, -1, t + 1));
  cuts.push(discZ(m.motorAt[0], m.motorAt[1], m.boss, -1, t + 1));
  for (const q of m.screws) cuts.push(hole(q.thread, { kind: 'clearance', into: '-z', at: [q.at[0], q.at[1], t + 0.5], depth: t + 1, printer: pr }));
  return Object.assign(combine([prismZ(m.outline, 0, t)], cuts, o.ops ?? null), { model: m });
}

// ---------- the clamp on the carriage ----------
/**
 * Where a clamp's channel can lie on a carriage's top: beside the heads of the carriage's tapped holes on one side,
 * a wall between. @param {{ holes: number[][], thread: string }} carriage @param {object} [printer] @returns {{ y: number, holes: number[][], cb: object }} @internal
 */
function channelOf(what, c, pr, fit, belt) {
  const side = c.holes.filter((h) => h[1] > 1e-9);
  if (side.length < 2) throw new Error(`${what}: the carriage has no two tapped holes on one side of its middle for the clamp's screws`);
  const cb = counterbore(c.thread, { head: 'cap', printer: pr, into: '-z', at: [0, 0, 0] }).model, wall = 2;
  return { y: r3(Math.min(...side.map((h) => h[1])) - cb.diameter / 2 - wall - belt.thickness / 2 - fit), holes: side, cb };
}
/**
 * A printed clamp for a belt's two ends on a carriage's top: a block screwed down through its counterbores into two of
 * the carriage's tapped holes, with a channel along the beam the belt's ends drop into from above, toothed on the wall
 * the belt's teeth face so they mesh, its floor rounded. Each end meshes over half the channel less the gap between
 * them: at least BELT_DEFAULTS.mesh teeth, and as many as its teeth take the end's pull with twice the margin in shear.
 * It prints as it sits, on its base.
 * @param {{ belt?: string, carriageHoles: number[][], thread: string, width: number, length: number, rise: number, tension?: number, printer?: object, material?: string | object }} o
 *   carriageHoles, thread: the carriage's tapped holes (x along, y across from its middle) and their thread; width, length: the
 *   carriage's; rise: the belt's middle over the carriage's top
 * @returns {object} its model, with anchors b1, b2 (the screws) and belt (the channel's middle at the belt's height)
 */
export function beltClampModel(o = {}) {
  const what = 'beltClampModel';
  options(what, o ?? {}, ['belt', 'carriageHoles', 'carriageDepth', 'thread', 'width', 'length', 'rise', 'tension', 'printer', 'material']);
  const k = partSetup(what, o), S = setsOf(what, { belt: o.belt }), B = S.belt, T = tensionOf(what, o.tension);
  if (!Array.isArray(o.carriageHoles) || !o.carriageHoles.every((h) => Array.isArray(h) && h.length === 2 && h.every(isNum)) || typeof o.thread !== 'string') throw new Error(`${what}: carriageHoles are the carriage's tapped holes, [[x, y], ...] mm from its top's middle, and thread their thread (got ${shown(o.carriageHoles)}, ${shown(o.thread)})`);
  for (const key of ['width', 'length', 'rise']) if (!(isNum(o[key]) && o[key] > 0)) throw new Error(`${what}: ${key} is mm, above 0 (got ${shown(o[key])})`);
  const ch = channelOf(what, { holes: o.carriageHoles, thread: o.thread }, k.pr, k.fit, B), wall = 2, rise = o.rise, floor = r3(rise - B.width / 2 - 0.25);
  if (floor < wall - 1e-9) throw new Error(`${what}: the belt's middle ${mm(rise)} mm over the carriage leaves a ${mm(floor)} mm floor under the channel, under the ${mm(wall)} mm it needs: raise the belt to ${mm(wall + B.width / 2 + 0.25)} mm`);
  // its teeth: each end's pull over its teeth's roots in shear (a tooth's root half a pitch long across the belt's width)
  const tau = (BELT_DEFAULTS.shear.value * k.S), perTooth = tau * (B.pitch / 2) * B.width, n = Math.max(BELT_DEFAULTS.mesh.value, Math.ceil((T * want()) / perTooth));
  const gapMid = BELT_DEFAULTS.clamp_gap.value, xsHoles = ch.holes.map((h) => Math.abs(h[0])), L = r3(Math.max(2 * n * B.pitch + gapMid, 2 * Math.max(...xsHoles) + ch.cb.diameter + 2 * wall)), mesh = Math.floor((L - gapMid) / 2 / B.pitch);
  const half = B.thickness / 2 + k.fit, yLo = r3(ch.y - half - B.tooth - wall), yHi = r3(Math.max(...ch.holes.map((h) => h[1])) + ch.cb.diameter / 2 + wall), top = r3(up(rise + B.width / 2 + 0.25, k.layer));
  // the screws: the shortest length sold that goes as deep as steel asks into the carriage's thread, and a layer more
  // where the hole is that deep (so the counterbore's floor, printed to the nearest layer, never leaves it short), and
  // no deeper than the hole is (carriageDepth); the plastic under each head at least the thread's diameter; the
  // counterbore takes the rest
  const depth = o.carriageDepth ?? null, major = fixingModel(o.thread).major, least = engagement(o.thread, { depth: 1, material: 'steel' }).need, lens = [...(fixingModel(o.thread).figures.lengths?.value ?? [])].sort((a, b) => a - b);
  if (depth != null && !(isNum(depth) && depth > 0)) throw new Error(`${what}: carriageDepth is the carriage's tapped holes' depth, mm (got ${shown(o.carriageDepth)})`);
  const into = r3(Math.min(least, depth ?? least) + Math.max(0, Math.min(k.layer, (depth ?? Infinity) - least)));
  const Ls = lens.find((x) => r3(x - into) >= major - 1e-9 && r3(x - into) <= top - 1e-9);
  if (Ls == null) throw new Error(`${what}: no ${o.thread} cap screw sold reaches ${mm(into)} mm into the carriage through ${mm(major)} to ${mm(top)} mm of clamp`);
  const grip = r3(Ls - into), cbDepth = r3(top - grip), margin = r3((mesh * perTooth) / T);
  const m = { kind: 'fitting', fitting: 'belt-clamp', guide: 'belt', name: `belt-clamp-${B.set}-${o.thread}-${mm(o.width)}`, title: `printed clamp for the two ends of ${B.set} on a carriage`, belt: B.set,
    length: L, yLo, yHi, top, floor, channel: { y: ch.y, half, tooth: B.tooth, pitch: B.pitch }, mesh, gap: gapMid, counterbore: { diameter: ch.cb.diameter, depth: cbDepth }, thread: o.thread, head: 'cap',
    screws: ch.holes.map(([x, y]) => ({ thread: o.thread, head: 'cap', grip, at: [x, y, grip], axis: [0, 0, -1], length: Ls })), hardware: [],
    load: { force: T, what: `${mm(T)} N on each belt end, the span's tension, along its ${mesh} teeth` }, stress: r3(T / (mesh * (B.pitch / 2) * B.width)), margin,
    anchors: { belt: { at: [0, ch.y, rise], axis: [1, 0, 0], ref: [0, 0, 1] } },
    size: { length: L, width: r3(yHi - yLo), height: top }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['shear', 'mesh', 'thickness', 'tooth'].map((x) => ({ name: `BELT_DEFAULTS.${x}`, value: BELT_DEFAULTS[x].value, kind: BELT_DEFAULTS[x].kind }))] };
  keep(m, k); weigh(m, beltClamp(m), k.density);
  m.findings.push(finding('info', `each belt end drops into its channel from above and meshes ${mesh} teeth on the toothed wall (${mm(B.tooth)} mm teeth at ${mm(B.pitch)} mm, BELT_DEFAULTS.tooth and thickness: estimates of a GT2 belt's), ${mm(gapMid)} mm between the ends; two ${o.thread}x${Ls} cap screws down through ${mm(grip)} mm under ${mm(cbDepth)} mm counterbores, ${mm(Ls - grip)} mm into the carriage's tapped holes`, 'fitting.belt', { values: { mesh, channel: ch.y, grip } }));
  m.findings.push(finding(margin >= want() - 1e-9 ? 'pass' : 'fail', `under ${m.load.what}, its teeth shear at ${mm(m.stress)} MPa against ${mm(tau)} MPa (BELT_DEFAULTS.shear of ${k.mat.name.toUpperCase()}'s ${k.S} MPa): ${mm(margin)} times over, an estimate`, 'fitting.margin', { values: { load: T, stress: m.stress, strength: tau, margin } }));
  m.findings.push(finding('info', `${m.title}: ${mm(L)} mm along the carriage, ${mm(yHi - yLo)} mm across, ${mm(top)} mm over its top`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding('info', 'it is drawn to print as it sits, on its base: a plain first layer, its channel and counterbores open upward, no supports (printcheck\'s check() reads the solid)', 'fitting.printable', { values: { pose: 'on its base' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  return m;
}
/** A belt clamp's solid, in its fitted frame (which is how it prints). @param {object} m beltClampModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function beltClamp(m, o = {}) {
  if (m?.fitting !== 'belt-clamp') throw new Error(`beltClamp: give a belt clamp's model (beltClampModel), not ${shown(m)}`);
  const pr = printerOf('beltClamp', m.pr ?? null), L = m.length, c = m.channel, x0 = -L / 2 - 1, x1 = L / 2 + 1;
  // the channel's outline: the toothed wall on its -y side, a wave of the belt's pitch (no corner to start a crack)
  const lo = c.y - c.half, hi = c.y + c.half, steps = Math.ceil((x1 - x0) / (c.pitch / 8)), wave = [];
  for (let i = 0; i <= steps; i++) { const x = x0 + ((x1 - x0) * i) / steps; wave.push([r3(x), r3(lo + (c.tooth * (1 - Math.cos((2 * Math.PI * x) / c.pitch))) / 2)]); }
  const groove = [...wave, [x1, hi], [x0, hi]], r = (hi - lo - c.tooth) / 2;
  const cuts = [prismZ(groove, m.floor + r, m.top + 1), translate([0, (lo + c.tooth + hi) / 2, m.floor + r], rotateY(Math.PI / 2, cylinder({ radius: r, height: L + 2, segments: 24 }))), prismZ([[x0, lo + c.tooth], [x1, lo + c.tooth], [x1, hi], [x0, hi]], m.floor + r, m.top + 1)];
  for (const q of m.screws) cuts.push(counterbore(q.thread, { head: 'cap', printer: pr, into: '-z', at: [q.at[0], q.at[1], m.top], depth: m.counterbore.depth, length: m.top + 1 }));
  return Object.assign(combine([prismZ(roundedRect(-L / 2, m.yLo, L / 2, m.yHi, 2), 0, m.top)], cuts, o.ops ?? null), { model: m });
}

// ---------- the idler and its tensioner ----------
/**
 * A printed block for a belt's idler at the far end of a beam, which is the belt's tensioner: the idler on an M5 axle
 * screwed into a heat-set insert, a raised ring under its inner race, and behind it two screws into slot nuts in the
 * face's slot. The slot is the tensioner's: loosened, the block slides along it; it needs room each way along the slot
 * for half the belt's stretch at its tension and half the one pitch its cut length may be off, twice over (need, and
 * room, twice need). Where no sold screw length suits the block's height, their heads sit in counterbores. It prints
 * as it sits, every hole upright.
 * @param {string | object} profile
 * @param {{ face?: string, idler?: string, belt?: string, rise: number, across?: number, stretch?: number, tension?: number, thread?: string, nut?: string, printer?: object, material?: string | object, given?: object }} o
 *   rise: the belt's middle over the face; across: the idler's axle off the slot's line; stretch: the belt's stretch at its tension, mm (the block moves half of it)
 * @returns {object} its model, with anchors axle (the idler's own frame, on its ring) and b1, b2 (the screws)
 */
export function beltIdlerModel(profile, o = {}) {
  const what = 'beltIdlerModel';
  options(what, o ?? {}, ['face', 'idler', 'belt', 'rise', 'across', 'stretch', 'tension', 'thread', 'nut', 'printer', 'material', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), k = partSetup(what, o), S = setsOf(what, { belt: o.belt, idler: o.idler }), I = S.idler, B = S.belt, wall = 2, gap = 1, T = tensionOf(what, o.tension);
  if (!(isNum(o.rise) && o.rise > 0)) throw new Error(`${what}: rise is the belt's middle over the face, mm (got ${shown(o.rise)})`);
  const across = o.across ?? 0, stretch = o.stretch ?? 0;
  if (!isNum(across) || !(isNum(stretch) && stretch >= 0)) throw new Error(`${what}: across and stretch are mm (got ${shown(o.across)}, ${shown(o.stretch)})`);
  const face = o.face ?? 'top', sd = slotSide(what, p, face, o.thread, o.nut, k.fit, o.given ?? {}), sc = screwOf(what, sd.thread, 'cap', k.pr);
  const axle = 'M5';
  if (Math.abs(fixingModel(axle).major - I.bore) > 1e-9) throw new Error(`${what}: ${I.set}'s ${mm(I.bore)} mm bore takes no M5 axle`);
  const ring = BELT_DEFAULTS.boss.value, washer = washerModel(axle).thickness, topZ = r3(o.rise - I.body / 2 - ring), ins = holeModel(axle, { kind: 'insert', printer: k.pr });
  if (topZ < ins.depth + 2 - 1e-9) throw new Error(`${what}: the belt's middle ${mm(o.rise)} mm over the face leaves the block ${mm(topZ)} mm, under the ${mm(ins.depth + 2)} mm an ${axle} insert and its floor take`);
  // the axle: through the washer, the idler and its ring into the insert, a length sold that reaches into it
  const grip = r3(washer + I.body + ring), lens = [...(fixingModel(axle).figures.lengths?.value ?? [])].sort((a, b) => a - b), axleL = lens.find((x) => x - grip >= 0.5 * ins.depth - 1e-9 && x - grip <= ins.depth - 0.5 + 1e-9) ?? null;
  if (axleL == null) throw new Error(`${what}: no ${axle} screw sold reaches into its insert through ${mm(grip)} mm`);
  // the room it slides in along the slot: half the stretch and half a pitch each way, twice over, in whole mm
  const need = r3(stretch / 2 + B.pitch / 2), room = Math.max(2, up(want() * need, 1));
  const R = I.od / 2, ax = r3(R + wall), ringD = r3(Math.min(I.bore + 4, I.od - 4)), cb = counterbore(sd.thread, { head: 'cap', printer: k.pr, into: '-z', at: [0, 0, 0] }).model;
  const s1 = r3(ax + R + gap + cb.diameter / 2), pitch = r3(up(Math.max(cb.diameter, sd.nut.length ?? 0) + FITTING_DEFAULTS.pitch.value, 0.5)), s2 = r3(s1 + pitch), x1 = r3(s2 + cb.diameter / 2 + wall);
  const half = r3(Math.max(R + wall, Math.abs(across) + R + wall)), y0 = r3(Math.min(-half, across - R - wall)), y1 = r3(Math.max(half, across + R + wall));
  // the screws' grip: the block's height, or the deepest a counterbore leaves where a sold length engages its nut
  let fits = null, held = topZ;
  for (let g0 = topZ; g0 >= fixingModel(sd.thread).major - 1e-9; g0 = r3(g0 - k.layer)) { const q = sold(g0, k.layer, [sd], sd.thread); if (q && Math.abs(q.t - g0) < 1e-9) { fits = q; held = g0; break; } }
  const sink = r3(topZ - held);
  // sized: the belt's two spans at the idler's middle pull the insert against its wall, and bend the block at its base
  const F = 2 * T, bear = r3(F / (ins.diameter * ins.depth)), Mb = F * o.rise, bW = y1 - y0, bendS = r3((6 * Mb) / (bW * x1 * x1)), margin = r3(Math.min(k.S / bear, k.S / bendS));
  const m = { kind: 'fitting', fitting: 'belt-idler', guide: 'belt', name: `belt-idler-${I.set}-${short(p.name)}-${sd.face.replace('.', '-')}`, title: `printed idler block and tensioner for ${I.set} on ${p.name}'s ${sd.face} face`,
    profile: p.name, face: sd.face, idler: I.set, belt: B.set, rise: o.rise, across, top: topZ, length: x1, y0, y1, axleAt: [ax, across], ring: { d: ringD, h: ring }, insert: { d: ins.diameter, depth: ins.depth }, room, need,
    thread: sd.thread, head: 'cap', counterbore: sink > 0 ? { diameter: cb.diameter, depth: sink } : null, screws: [s1, s2].map((x) => ({ thread: sd.thread, head: 'cap', grip: held, at: [x, 0, held], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null })),
    hardware: [{ name: `${axle}x${axleL} cap`, kind: 'screw', thread: axle, length: axleL, head: 'cap', count: 1, why: `the idler's axle, into its insert` }, { name: `${axle} washer`, kind: 'washer', thread: axle, count: 1, why: 'over the idler, under the axle\'s head' }, { name: `${axle} heat-set insert`, kind: 'insert', thread: axle, count: 1, why: 'the idler\'s axle screws into it' }],
    load: { force: F, what: `the belt's two spans at ${mm(T)} N each on the idler, ${mm(o.rise)} mm over the face` }, stress: Math.max(bear, bendS), margin,
    anchors: { axle: { at: [ax, across, r3(topZ + ring)], axis: [0, 0, 1], ref: [1, 0, 0] } },
    size: { length: x1, across: r3(bW), height: topZ }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, { name: 'BELT_DEFAULTS.tension', value: BELT_DEFAULTS.tension.value, kind: BELT_DEFAULTS.tension.kind }] };
  keep(m, k); weigh(m, beltIdler(m), k.density);
  m.findings.push(fits ? finding('pass', `two ${sd.thread}x${fits.lengths[0]} cap through ${mm(held)} mm${sink > 0 ? ` under ${mm(sink)} mm counterbores` : ''} into slot nuts: loosen them, slide the block along the slot toward the beam's end until the belt is at its tension, tighten them`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows, grip: held } })
    : finding('warn', `no ${sd.thread} cap screw sold engages its slot nut fully through the block: the screw's length is the fasten check's to choose`, 'fitting.screw', {}));
  m.findings.push(finding('info', `${I.set} on an ${axle}x${axleL} cap and a washer into an ${axle} heat-set insert (${mm(ins.diameter)} mm, ${mm(ins.depth)} deep), on a ${mm(ring)} mm ring under its inner race; it wants ${mm(room)} mm of slot each way to slide in, twice the ${mm(need)} mm half the belt's ${mm(stretch)} mm stretch and half a ${mm(B.pitch)} mm pitch ask`, 'fitting.idler', { values: { axle: axleL, room, need } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(x1)} mm along the beam, ${mm(bW)} mm across, ${mm(topZ)} mm over the face`, marginText: `under ${m.load.what}, the insert bears on its wall at ${mm(bear)} MPa and the block bends at its base to ${mm(bendS)} MPa`, pose: 'as it sits, on its base, every hole upright' });
  return m;
}
/** A belt idler block's solid, in its fitted frame (which is how it prints). @param {object} m beltIdlerModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function beltIdler(m, o = {}) {
  if (m?.fitting !== 'belt-idler') throw new Error(`beltIdler: give a belt idler block's model (beltIdlerModel), not ${shown(m)}`);
  const pr = printerOf('beltIdler', m.pr ?? null), t = m.top, parts = [prismZ(roundedRect(0, m.y0, m.length, m.y1, 3), 0, t), discZ(m.axleAt[0], m.axleAt[1], m.ring.d, t - 0.01, t + m.ring.h)];
  const cuts = [hole('M5', { kind: 'insert', into: '-z', at: [m.axleAt[0], m.axleAt[1], t + m.ring.h], depth: m.insert.depth + m.ring.h, printer: pr })];
  for (const q of m.screws) cuts.push(m.counterbore ? counterbore(q.thread, { head: 'cap', printer: pr, into: '-z', at: [q.at[0], q.at[1], t], depth: m.counterbore.depth, length: t + 1 }) : hole(q.thread, { kind: 'clearance', into: '-z', at: [q.at[0], q.at[1], t + 0.5], depth: t + 1, printer: pr }));
  return Object.assign(combine(parts, cuts, o.ops ?? null), { model: m });
}

// ---------- the drive as a whole ----------
// A face's frame figures: where the beam's middle is across the face from its first slot, how far it reaches
function faceFrame(what, p, face) {
  const name = String(face ?? 'top').split('.')[0], place = p.faces[name]?.[0];
  if (!place) throw new Error(`${what}: ${p.name} has no ${name} face`);
  const n = place.normal, yd = [n[1], -n[0]], half = (v) => Math.abs(v[0]) * (p.width / 2) + Math.abs(v[1]) * (p.height / 2);
  return { yc: r3(-(place.at[0] * yd[0] + place.at[1] * yd[1])), across: half(yd), deep: 2 * half(n) };
}
const seg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * A belt drive's layout along a beam's face, from the carriage it drives: the motor's plate at end a, the clamp on the
 * carriage, the idler's block past the rail's end, the belt's height and the lines of its runs, its length and the
 * length to cut it, its tension, its stretch and the tensioner's travel. Refused by name: sets that do not go
 * together, a plate or a block that meets the rail, a motor whose shaft the pulley does not fit.
 * @param {string | object} profile
 * @param {{ face?: string, beam: number, rail: { from: number, length: number, width: number, height: number }, carriage: { top: number, width: number, length: number, clearance?: number, holes: number[][], thread: string, rest: number, travel: number },
 *   motor?: string, pulley?: string, idler?: string, belt?: string, tension?: number, across?: number, idlerAt?: number, cut?: number, height?: number, thread?: string, nut?: string, printer?: object, material?: string | object, given?: object }} o
 *   beam: its length; rail: where it lies along the face and its section; carriage: its top over the face, its size, its
 *   tapped holes, its middle along the rail at the start of its travel (rest) and its travel; across: the idler's axle
 *   off the line that squares the belt, mm; idlerAt: the block's end toward a, mm along the beam (default it ends at
 *   end b); cut: the belt's length as cut, mm (default the length that sets the tension with the block in the middle of its slots);
 *   height: the belt's middle over the face, mm (default the least the clamp's floor over the carriage takes; give more
 *   for room under the return run over the carriage's free holes)
 * @returns {object} the layout
 */
export function beltLayout(profile, o = {}) {
  const what = 'beltLayout';
  options(what, o ?? {}, ['face', 'beam', 'rail', 'carriage', 'motor', 'pulley', 'idler', 'belt', 'tension', 'across', 'idlerAt', 'cut', 'height', 'thread', 'nut', 'printer', 'material', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), k = partSetup(what, o), S = setsOf(what, o), B = S.belt, T = tensionOf(what, o.tension), gap = 1, face = o.face ?? 'top';
  const c = o.carriage, rail = o.rail;
  if (!c || !rail || !isNum(o.beam)) throw new Error(`${what}: beam, rail and carriage are the beam's length, the rail's place and the carriage's figures`);
  const across = o.across ?? 0;
  if (!isNum(across)) throw new Error(`${what}: across is the idler's axle off the belt's square line, mm (got ${shown(o.across)})`);
  const pass = { printer: o.printer, material: o.material }, rp = S.pulley.pd / 2, ri = S.idler.pd / 2;
  // the working run's line: the clamp's channel, beside the carriage's holes; the pulley's and idler's middles off it
  const ch = channelOf(what, c, k.pr, k.fit, B), yw = ch.y, yp = r3(yw - rp), yi = r3(yw - ri + across);
  // the belt's least height: the clamp's 2 mm floor under its channel over the carriage, or higher where it is given
  // (room under the belt for what is screwed to the carriage's free holes)
  const lowest = r3(c.top + 2 + B.width / 2 + 0.25);
  if (o.height != null && !(isNum(o.height) && o.height >= lowest - 1e-9)) throw new Error(`${what}: height is the belt's middle over the face, mm, at least ${mm(lowest)} (the carriage's ${mm(c.top)} mm top, the clamp's 2 mm floor and half the belt's ${mm(B.width)} mm width with 0.25 mm) (got ${shown(o.height)})`);
  // (a belt higher than that: the plate as thick as for the least, the pulley further up its shaft)
  const least = lowest, plateWith = (lift) => beltPlateModel(p, { face, motor: o.motor, pulley: S.pulley.set, belt: B.set, across: yp, least, ...(lift ? { lift } : {}), tension: T, ...(o.thread ? { thread: o.thread } : {}), ...(o.nut ? { nut: o.nut } : {}), ...pass, given: o.given });
  let plate = plateWith(0);
  const lift = o.height != null && o.height > plate.height + 1e-9 ? r3(o.height - plate.height) : 0;
  if (lift) plate = plateWith(lift);
  const zb = plate.height, xp = plate.motorAt[0];
  if (rail.from < plate.x1 + gap - 1e-9) throw new Error(`${what}: the motor's plate takes the first ${mm(plate.x1)} mm of the face, and the rail starts ${mm(rail.from)} mm along it: start the rail at ${mm(plate.x1 + gap)} mm or more`);
  const clamp = beltClampModel({ belt: B.set, carriageHoles: c.holes, ...(c.depth != null ? { carriageDepth: c.depth } : {}), thread: c.thread, width: c.width, length: c.length, rise: r3(zb - c.top), tension: T, ...pass });
  // the belt's length round its path with the block in the middle of its slots, and its stretch at the tension
  const end = rail.from + rail.length;
  const trial = beltIdlerModel(p, { face, idler: S.idler.set, belt: B.set, rise: zb, across: yi, stretch: 0, tension: T, ...(o.thread ? { thread: o.thread } : {}), ...(o.nut ? { nut: o.nut } : {}), ...pass, given: o.given });
  const at0 = o.idlerAt ?? r3(o.beam - trial.length - trial.room);
  const pathAt = (xi, xc) => path({ xp, yp, rp, xi, yi, ri, xc, yw, Lc: clamp.length, gapMid: clamp.gap });
  const L0 = pathAt(at0 + trial.axleAt[0], rail.from + c.rest).length, stretch = r3((L0 * T) / B.k);
  const idler = beltIdlerModel(p, { face, idler: S.idler.set, belt: B.set, rise: zb, across: yi, stretch, tension: T, ...(o.thread ? { thread: o.thread } : {}), ...(o.nut ? { nut: o.nut } : {}), ...pass, given: o.given });
  const blockAt = o.idlerAt ?? r3(o.beam - idler.length - idler.room);
  if (!isNum(blockAt)) throw new Error(`${what}: idlerAt is the idler block's end toward a, mm along the beam (got ${shown(o.idlerAt)})`);
  if (blockAt < end + gap - 1e-9) throw new Error(`${what}: the idler's block starts ${mm(blockAt)} mm along the beam, and the rail ends at ${mm(end)} mm: put it at ${mm(end + gap)} mm or more${o.idlerAt == null ? ` (a beam ${mm(end + gap + idler.length + idler.room)} mm long, or a shorter rail)` : ''}`);
  if (blockAt + idler.length > o.beam + 1e-9) throw new Error(`${what}: the idler's block runs ${mm(idler.length)} mm from ${mm(blockAt)} mm, past the beam's ${mm(o.beam)} mm: give idlerAt ${mm(o.beam - idler.length)} or less`);
  const xi0 = r3(blockAt + idler.axleAt[0]), Lmid = pathAt(xi0, rail.from + c.rest).length;
  // the length to cut: whole teeth, which at the tension stretches to the path with the block a little toward a
  const strain = T / B.k, cut = o.cut ?? r3(Math.floor(Lmid / (1 + strain) / B.pitch) * B.pitch);
  if (!(isNum(cut) && cut > 0)) throw new Error(`${what}: cut is the belt's length as cut, mm (got ${shown(o.cut)})`);
  const offset = r3((cut * (1 + strain) - Lmid) / 2), buy = Math.ceil(cut / BELT_DEFAULTS.sold.value - 1e-9) * BELT_DEFAULTS.sold.value;
  // along the travel: each run's line, and the stretch's spans (the motor holds the pulley; the idler turns free)
  const samples = Array.from({ length: 21 }, (_, i) => r3(rail.from + c.rest + (c.travel * i) / 20));
  let worstSpan = 0;
  for (const xc of samples) { const q = pathAt(xi0 + offset, xc); worstSpan = Math.max(worstSpan, (q.a * q.b) / (q.a + q.b)); }
  const F0 = faceFrame(what, p, face);
  const line = r3((Math.atan2(Math.abs(across), xi0 - xp) * 180) / Math.PI);
  const common = { belt: B.set, tension: T, ...(o.thread ? { thread: o.thread } : {}), ...(o.nut ? { nut: o.nut } : {}) };
  const specs = { plate: { face, motor: plate.motor, pulley: S.pulley.set, across: yp, least, ...(lift ? { lift } : {}), ...common }, clamp: { belt: B.set, carriageHoles: c.holes, thread: c.thread, width: c.width, length: c.length, rise: r3(zb - c.top), tension: T },
    idler: { face, idler: S.idler.set, rise: zb, across: yi, stretch, ...common } };
  if (c.depth != null) specs.clamp.carriageDepth = c.depth;
  return { kind: 'belt-layout', profile: p.name, face, sets: S, specs, tension: T, height: zb, working: yw, pulley: { x: xp, y: yp, r: rp }, idler: { x: xi0, y: yi, r: ri, block: blockAt, offset, room: { a: r3(blockAt - end - gap), b: r3(o.beam - blockAt - idler.length) }, want: idler.room },
    plate, clamp, block: idler, rail, carriage: c, beamFrame: F0, length: r3(Lmid), cut, buy, stretch: r3(cut * strain), strain, span: r3(worstSpan), samples, line, across, mmPerTurn: r3(S.pulley.teeth * B.pitch),
    pathAt: (xc) => pathAt(xi0 + offset, xc), drawn: (xc) => pathAt(xi0, xc) };
}

/**
 * A belt's path by its pitch line, flat in the face's plane: from the clamp's end toward a along the working run to the
 * pulley's top, round the pulley, along the return run (the circles' outer tangent on the far side), round the idler to
 * its top, and back along the working run to the clamp's other end; with the ends inside the clamp. The working runs
 * are taken to leave the pulley and the idler at their tops.
 * @param {{ xp: number, yp: number, rp: number, xi: number, yi: number, ri: number, xc: number, yw: number, Lc: number, gapMid: number }} g
 * @returns {{ length: number, a: number, b: number, runs: { name: string, from: number[], to: number[] }[], wraps: { name: string, at: number[], r: number, from: number, angle: number }[] }}
 */
export function path(g) {
  const P = [g.xp, g.yp], I = [g.xi, g.yi], D = seg(P, I), phi = Math.atan2(I[1] - P[1], I[0] - P[0]), beta = Math.asin((g.rp - g.ri) / D), th = phi - Math.PI / 2 + beta;
  const T1 = [P[0] + g.rp * Math.cos(th), P[1] + g.rp * Math.sin(th)], T2 = [I[0] + g.ri * Math.cos(th), I[1] + g.ri * Math.sin(th)];
  const Pt = [g.xp, g.yp + g.rp], It = [g.xi, g.yi + g.ri], cl = [g.xc - g.Lc / 2, g.yw], cr = [g.xc + g.Lc / 2, g.yw];
  const wrapP = 3 * Math.PI / 2 + th, wrapI = Math.PI / 2 - th, ret = seg(T1, T2), A = seg(cl, Pt), Bv = seg(cr, It), inside = g.Lc - g.gapMid;
  const length = A + g.rp * wrapP + ret + g.ri * wrapI + Bv + inside;
  return { length, a: A, b: Bv + g.ri * wrapI + ret, ret, wrapP, wrapI,
    runs: [{ name: 'the working run from the pulley', from: Pt, to: cl }, { name: 'the working run to the idler', from: cr, to: It }, { name: 'the return run', from: T1, to: T2 }],
    wraps: [{ name: 'round the pulley', at: P, r: g.rp, from: Math.PI / 2, angle: wrapP }, { name: 'round the idler', at: I, r: g.ri, from: th, angle: wrapI }] };
}

/**
 * Where a belt's runs pass the beam, the rail, the carriage and its clamp through the carriage's travel: each run's band
 * (the belt's thickness across it, its width over the face) against each part's box, at each of the layout's samples.
 * A run that overlaps a part rubs it. The working runs end at the clamp, so they are not held against it. What else the
 * carriage carries (a plate, a bracket, a toolhead) is held the same way, by its box, moving with the carriage.
 * @param {object} L beltLayout's
 * @param {{ carried?: { part: string, lo: number[], hi: number[] }[] }} [o] carried: boxes in the face's frame, x from
 *   the carriage's middle (y across and z over the face as the layout's)
 * @returns {{ rubs: object[], least: { clearance: number, run: string, part: string, at: number } }}
 */
export function beltRub(L, o = {}) {
  options('beltRub', o ?? {}, ['carried']);
  const carried = o.carried ?? [];
  if (!Array.isArray(carried) || !carried.every((b) => typeof b?.part === 'string' && [b.lo, b.hi].every((v) => Array.isArray(v) && v.length === 3 && v.every(isNum)))) throw new Error(`beltRub: carried is a list of { part, lo: [x, y, z], hi: [x, y, z] } boxes, mm (got ${shown(o.carried)})`);
  const B = L.sets.belt, c = L.carriage, r = L.rail, ch = L.clamp, zb = L.height, t = B.thickness / 2, w = B.width / 2, F = L.beamFrame;
  const boxesAt = (xc) => [
    { part: 'the beam', lo: [-Infinity, F.yc - F.across, -F.deep], hi: [Infinity, F.yc + F.across, 0], all: true },
    { part: 'the rail', lo: [r.from, -r.width / 2, 0], hi: [r.from + r.length, r.width / 2, r.height], all: true },
    { part: 'the carriage', lo: [xc - c.length / 2, -c.width / 2, c.clearance ?? 0], hi: [xc + c.length / 2, c.width / 2, c.top], all: true },
    { part: 'the clamp', lo: [xc - ch.length / 2, ch.yLo, c.top], hi: [xc + ch.length / 2, ch.yHi, c.top + ch.top], all: false },
    ...carried.map((b) => ({ part: b.part, lo: [xc + b.lo[0], b.lo[1], b.lo[2]], hi: [xc + b.hi[0], b.hi[1], b.hi[2]], all: true, carried: true })),
  ];
  const rubs = [];
  let least = null;
  for (const xc of L.samples) {
    const q = L.pathAt(xc), boxes = boxesAt(xc);
    for (const [ri, run] of q.runs.entries()) {
      const n = Math.max(2, Math.ceil(seg(run.from, run.to) / 2));
      for (const b of boxes) {
        if (!b.all && ri < 2) continue;
        let worst = Infinity;
        for (let i = 0; i <= n; i++) {
          const x = run.from[0] + ((run.to[0] - run.from[0]) * i) / n, y = run.from[1] + ((run.to[1] - run.from[1]) * i) / n;
          // (each axis's gap between the belt's band here and the box: the largest is how far apart they are)
          const gx = Math.max(b.lo[0] - x, x - b.hi[0]), gy = Math.max(b.lo[1] - (y + t), (y - t) - b.hi[1]), gz = Math.max(b.lo[2] - (zb + w), (zb - w) - b.hi[2]);
          worst = Math.min(worst, Math.max(gx, gy, gz));
        }
        if (!least || worst < least.clearance) least = { clearance: r3(worst), run: run.name, part: b.part, at: xc };
        if (worst < 0 && !rubs.some((x) => x.run === run.name && x.part === b.part)) rubs.push({ run: run.name, part: b.part, at: xc, depth: r3(-worst), ...(b.carried ? { carried: true, top: r3(b.hi[2]) } : {}) });
      }
    }
  }
  return { rubs, least };
}

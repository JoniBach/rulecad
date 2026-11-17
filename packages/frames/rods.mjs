// Guides on smooth rods, and what drives them: two rods along a beam's face in printed holders at the ends of a stretch,
// a printed carriage riding them on linear bearings (rod-8 and lm8uu, or what their sets name), and for a screw drive a
// printed motor plate holding the catalogue's motor on its own mounting rules, a coupler to the lead screw, a bearing for
// the screw in each holder, and the lead nut on the carriage. An endstop's printed mount goes on a side face of the beam
// by an address, its lever where a flag on the carriage meets it.
//
// The holders and the motor plate are saddles: a plate standing across the beam, its legs down both side faces and a
// screw through each leg into the side face's slot, so the face the rods run over stays clear for the carriage, the
// coupler and the screw. Each part is drawn as it prints and turned into its fitted frame.
//
// A part's fitted frame is a mount's: x along the beam, y across it, z out of the face (0 on it), its origin on the
// address it is placed at (the face's first slot). A holder's outer face is at x = 0, its legs reaching in (+x); the
// motor plate's outer face, where the motor's mounting face lies, is at x = 0, the motor outside it (-x) and its shaft
// in. A carriage's frame: x along the beam about its middle, y and z as a holder's. Units: mm, N, N m, kg, grams.
import jscad from '@jscad/modeling';
import { hole, holeModel, fixingModel, engagement, counterbore, DEFAULTS as FIX } from '@rulecad/fixings';
import { SETS } from './catalogue.mjs';
import { FITTING_DEFAULTS, options, profileOf, printerOf, slotSide, roundConcave, ccw, combine, screwOf, sold } from './fitting.mjs';
import { partSetup, weigh, closingFindings, bendT, bendMargin } from './panel.mjs';

const { cylinder, polygon } = jscad.primitives, { extrudeLinear } = jscad.extrusions;
const { translate, transform } = jscad.transforms;
const CHECKED = '2026-11-17';
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

/** The working figures of rod guides and their drives, each with what it rests on. */
export const ROD_DEFAULTS = {
  gap: rule(1, 'mm', 'Room between a moving part and a still one beside it: the carriage and a holder, a coupler and a plate', 'default', 'A working figure of @rulecad/frames'),
  wall: rule(2, 'mm', 'A printed part\'s least wall round a rod, a bearing or a nut', 'default', 'A working figure of @rulecad/frames: five of the X1C\'s 0.42 mm lines'),
  web: rule(1.5, 'mm', 'Plastic between a linear bearing\'s pocket and the lead nut\'s flange in the carriage', 'estimate', 'A working figure of @rulecad/frames: the wrist Z axis of the worked examples\' chapter 13 stands its rods 20 mm off the screw with this'),
  floor: rule(3, 'mm', 'A carriage\'s floor under a linear bearing\'s pocket, which holds the bearing from sliding through', 'default', 'A working figure of @rulecad/frames'),
  press: rule(0.1, 'mm', 'How much a printed pocket for a bought bearing is drawn under the bearing\'s diameter, for a light press', 'estimate', 'A working figure of @rulecad/frames, to be checked by a test print: a printer\'s holes come out small by about its hole compensation, which is added back'),
  load: rule(50, 'N', 'The design load on a holder, a motor plate or a carriage where none is given: a hand pushing the carriage along its rods, or on it', 'default', 'A working figure of @rulecad/frames, so every part is sized and compared at one named load'),
  switchLoad: rule(10, 'N', 'The design load on an endstop\'s mount: a knock on the switch', 'default', 'A working figure of @rulecad/frames'),
  relief: rule(1, 'mm', 'The round relief cut into a saddle\'s inside corners, where the beam\'s corners sit: no square inside corner, and nothing rubs the beam\'s rounded corner', 'default', 'A working figure of @rulecad/frames'),
  couple: rule(0.5, '× length', 'A linear bearing takes a moment about its middle as two equal and opposite forces this share of its length apart (its ball circuits\' ends)', 'estimate', 'A working figure of @rulecad/frames: the makers rate a single bush by its radial load only, so a moment on one is an estimate until measured'),
  flag: rule({ thickness: 3, width: 4, engage: 4 }, 'mm', 'The flag on a carriage that trips an endstop: its thickness along the beam, its width, and how far it reaches down past the end of the switch\'s lever', 'default', 'A working figure of @rulecad/frames'),
  lever: rule(12.4, 'mm', 'A miniature switch\'s lever face, from its base along its length: its body\'s length, 2 mm to the lever and the lever\'s 0.4 mm, as @rulecad/cad draws a switch', 'estimate', 'How @rulecad/cad draws a switch from its set (its lever 2 mm over the body); measure your switch\'s lever and its pretravel'),
};

// ---------- the sets ----------
const known = (part) => Object.values(SETS).filter((s) => s.part === part).map((s) => s.name).sort();
const setOf = (what, key, part, name) => {
  const s = SETS[String(name ?? '').toLowerCase()];
  if (!s || s.part !== part) throw new Error(`${what}: ${key} is a ${part.replace('_', ' ')}'s rule set, one of ${known(part).join(', ') || 'none'} (got ${shown(name)})`);
  return s;
};
// a motor's mounting figures from its set: the holes in its own frame (x across, y along its body's offset, z along the
// shaft), the thread its screws take, the boss and the shaft; read as @rulecad/motors reads them
function motorFigures(what, s) {
  const pattern = fig(s, 'mount_pattern'), sp = fig(s, 'mount_hole_spacing'), off = fig(s, 'boss_offset') ?? 0;
  if (!['pair', 'square'].includes(pattern) || !isNum(sp)) throw new Error(`${what}: ${s.name} has no mounting holes a plate can take (mount_pattern pair or square, and mount_hole_spacing): a plate for it needs them in its set`);
  const holes = pattern === 'square' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [r3((a * sp) / 2), r3((b * sp) / 2)]) : [[r3(-sp / 2), -off], [r3(sp / 2), -off]];
  let thread = fig(s, 'mount_hole_thread'), tapped = true;
  if (typeof thread !== 'string') {
    // plain holes (a geared motor's ears): the largest metric thread whose major fits the hole, through it to a nut
    const d = fig(s, 'mount_hole_diameter');
    thread = ['M5', 'M4', 'M3', 'M2.5', 'M2'].find((t) => fixingModel(t).major <= d - 0.15 + 1e-9);
    if (!thread) throw new Error(`${what}: ${s.name}'s ${mm(d)} mm mounting holes take no metric screw from M2 up`);
    tapped = false;
  }
  const shape = fig(s, 'body_shape'), body = shape === 'round' ? { round: true, size: fig(s, 'body_diameter'), centre: [0, -off] } : { round: false, size: fig(s, 'body_width'), centre: [0, -off] };
  return { set: s.name, pattern, holes, thread, tapped, depth: fig(s, 'mount_hole_depth') ?? null, ear: fig(s, 'mount_ear_thickness') ?? null, boss: { d: fig(s, 'boss_diameter') ?? 0, h: fig(s, 'boss_height') ?? 0 }, shaft: { d: fig(s, 'shaft_diameter'), length: fig(s, 'shaft_length'), flat: fig(s, 'shaft_flat_length') ?? null }, body, offset: off, mass: fig(s, 'mass') ?? null };
}

// The face the rods run over, and its two sides: where the beam's middle is across the face (yc, from the face's first
// slot), how far it reaches either side (across) and down (deep), and each side face's nearest slot, in a part's frame
function faceOf(what, p, face) {
  const name = String(face ?? 'top');
  if (!['top', 'bottom', 'front', 'back'].includes(name)) throw new Error(`${what}: face is the face the rods run over: top, bottom, front or back (got ${shown(face)})`);
  const place = p.faces[name]?.[0];
  if (!place) throw new Error(`${what}: ${p.name} has no ${name} face`);
  const n = place.normal, ydir = [n[1], -n[0]], half = (v) => Math.abs(v[0]) * (p.width / 2) + Math.abs(v[1]) * (p.height / 2);
  const rel = (q) => [r3((q[0] - place.at[0]) * ydir[0] + (q[1] - place.at[1]) * ydir[1]), r3((q[0] - place.at[0]) * n[0] + (q[1] - place.at[1]) * n[1])];
  const [yc] = rel([0, 0]), across = half(ydir), deep = 2 * half(n);
  const sides = (name === 'top' || name === 'bottom' ? ['front', 'back'] : ['top', 'bottom']).map((sd) => {
    const list = p.faces[sd] ?? [], q = [...list].sort((a, b) => (b.at[0] * n[0] + b.at[1] * n[1]) - (a.at[0] * n[0] + a.at[1] * n[1]))[0];
    const out = q ? Math.sign(q.normal[0] * ydir[0] + q.normal[1] * ydir[1]) : 0, [y, z] = q ? rel(q.at) : [null, null];
    return { side: sd, place: q ?? null, name: q ? `${sd}${list.length > 1 ? `.${q.index}` : ''}` : sd, slot: q?.slot ?? null, out, y, z };
  });
  return { name, place, yc, across, deep, sides, ydir, normal: n };
}

/**
 * The layout of a rod guide on a face of a profile, with what its drive adds: the rods' spacing across the face and their
 * height over it, the carriage's size, and the sets each part reads. The spacing leaves room for the lead nut's flange
 * between the bearings (ROD_DEFAULTS.web); the height clears the carriage, the nut's flange, the screw's bearing in a
 * holder, the coupler and the motor's body over the face. Refused by name: a set of the wrong part, a spacing or height
 * that leaves no room. @param {string | object} profile
 * @param {{ face?: string, rod?: string, bearing?: string, spacing?: number, height?: number, screw?: string, nut?: string, support?: string | null, coupler?: string, motor?: string, given?: object }} [o]
 * @returns {object} the layout
 */
export function rodsLayout(profile, o = {}) {
  const what = 'rodsLayout';
  options(what, o ?? {}, ['face', 'rod', 'bearing', 'spacing', 'height', 'screw', 'nut', 'support', 'coupler', 'motor', 'printer', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), F = faceOf(what, p, o.face);
  const rod = setOf(what, 'rod', 'rod', o.rod ?? 'rod-8'), bearing = setOf(what, 'bearing', 'linear_bearing', o.bearing ?? 'lm8uu');
  const d = fig(rod, 'diameter'), D = fig(bearing, 'outer_diameter'), Lb = fig(bearing, 'length');
  if (Math.abs(fig(bearing, 'bore') - d) > 1e-6) throw new Error(`${what}: ${bearing.name}'s ${mm(fig(bearing, 'bore'))} mm bore does not run on ${rod.name}'s ${mm(d)} mm rod`);
  const screw = o.screw != null ? setOf(what, 'screw', 'leadscrew', o.screw) : null, nut = screw ? setOf(what, 'nut', 'nut', o.nut ?? 't8-nut') : null;
  if (screw && Math.abs(fig(nut, 'diameter') - fig(screw, 'diameter')) > 1e-6) throw new Error(`${what}: ${nut.name} is for a ${mm(fig(nut, 'diameter'))} mm screw and ${screw.name} is ${mm(fig(screw, 'diameter'))} mm`);
  const support = screw && o.support !== null ? setOf(what, 'support', 'bearing', o.support ?? 'bearing-608') : null;
  if (support && fig(support, 'bore') < fig(screw, 'diameter') - 1e-6) throw new Error(`${what}: ${support.name}'s ${mm(fig(support, 'bore'))} mm bore is smaller than ${screw.name}`);
  const coupler = o.motor != null ? setOf(what, 'coupler', 'coupler', o.coupler ?? 'coupler-5-8') : null, motor = o.motor != null ? motorFigures(what, setOf(what, 'motor', 'motor', o.motor)) : null;
  if (motor && !screw) throw new Error(`${what}: a motor drives the carriage through a screw: give screw (t8-screw)`);
  if (coupler && (Math.abs(fig(coupler, 'bore_a') - motor.shaft.d) > 1e-6 || Math.abs(fig(coupler, 'bore_b') - fig(screw, 'diameter')) > 1e-6)) throw new Error(`${what}: ${coupler.name} joins ${mm(fig(coupler, 'bore_a'))} mm to ${mm(fig(coupler, 'bore_b'))} mm, and the motor's shaft is ${mm(motor.shaft.d)} mm and the screw ${mm(fig(screw, 'diameter'))} mm`);
  const wall = ROD_DEFAULTS.wall.value, gap = ROD_DEFAULTS.gap.value, Fd = nut ? fig(nut, 'flange_diameter') : 0;
  const half = r3(up(Math.max(D / 2 + (nut ? Fd / 2 + ROD_DEFAULTS.web.value : wall), F.across), 0.5)), s = o.spacing ?? 2 * half;
  const fewest = D + (nut ? Fd + 2 * ROD_DEFAULTS.web.value : wall);
  if (!(isNum(s) && s >= fewest - 1e-9)) throw new Error(`${what}: spacing is the rods' distance apart, mm, at least ${mm(fewest)} (two ${bearing.name} pockets${nut ? ` and ${nut.name}'s flange` : ''} between) (got ${shown(o.spacing)})`);
  // the rods' and the screw's height over the face: whatever needs most room under them
  const needs = [['the carriage under its bearings', D / 2 + wall + gap], ...(nut ? [[`${nut.name}'s flange`, Fd / 2 + gap]] : []), ...(support ? [[`${support.name} in a holder`, fig(support, 'outer_diameter') / 2 + wall]] : []),
    ...(coupler ? [[`${coupler.name}`, fig(coupler, 'outer_diameter') / 2 + gap]] : []), ...(motor ? [[`${motor.set}'s body`, (motor.body.round ? motor.body.size / 2 : motor.body.size / 2) - motor.offset + gap]] : [])];
  const least = Math.max(...needs.map((x) => x[1])), h = o.height ?? r3(up(least, 0.5));
  if (!(isNum(h) && h >= least - 1e-9)) throw new Error(`${what}: height is the rods' and screw's height over the face, mm, at least ${mm(least)} for ${needs.reduce((a, x) => (x[1] > a[1] ? x : a))[0]} (got ${shown(o.height)})`);
  const Lc = r3(up(Lb + ROD_DEFAULTS.floor.value, 1)), Wc = r3(s + D + 2 * wall), zb = r3(h - D / 2 - wall), zt = r3(h + D / 2 + wall);
  return { kind: 'rods-layout', profile: p.name, face: F.name, frame: F, rod: { set: rod.name, d, straightness: rod.rules.straightness?.value ?? null }, bearing: { set: bearing.name, D, length: Lb, C0: fig(bearing, 'static_rating'), C: fig(bearing, 'dynamic_rating'), mass: fig(bearing, 'mass') ?? null },
    spacing: s, height: h, needs, carriage: { length: Lc, width: Wc, bottom: zb, top: zt },
    screw: screw ? { set: screw.name, d: fig(screw, 'diameter'), lead: fig(screw, 'lead'), friction: fig(screw, 'friction_coefficient') ?? null, frictionKind: screw.rules.friction_coefficient?.kind ?? null } : null,
    nut: nut ? { set: nut.name, flange: Fd, flangeWidth: fig(nut, 'flange_width'), body: fig(nut, 'body_diameter'), length: fig(nut, 'length'), circle: fig(nut, 'hole_circle'), holes: fig(nut, 'hole_count'), hole: fig(nut, 'mount_hole_diameter') } : null,
    support: support ? { set: support.name, D: fig(support, 'outer_diameter'), width: fig(support, 'width'), bore: fig(support, 'bore'), mass: fig(support, 'mass') ?? null } : null,
    coupler: coupler ? { set: coupler.name, length: fig(coupler, 'length'), D: fig(coupler, 'outer_diameter') } : null, motor };
}

// ---------- drawing ----------
// A part drawn as it prints, P = R part + t, turned back into its fitted frame
const toFit = (g, R, t) => {
  // part = Rᵀ (P - t): a column-major 4x4 of Rᵀ and -Rᵀ t
  const RT = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R[j][i])), o = RT.map((row) => -(row[0] * t[0] + row[1] * t[1] + row[2] * t[2]));
  return transform([RT[0][0], RT[1][0], RT[2][0], 0, RT[0][1], RT[1][1], RT[2][1], 0, RT[0][2], RT[1][2], RT[2][2], 0, o[0], o[1], o[2], 1], g);
};
const prismZ = (loop, z0, z1) => translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, polygon({ points: ccw(loop) })));
const discZ = (x, y, d, z0, z1) => translate([x, y, (z0 + z1) / 2], cylinder({ radius: d / 2, height: z1 - z0, segments: 48 }));
// a print frame's (X, Y) from a part's (y, z): sy is +1 (X = y) or -1 (X = -y)
const flat2 = (sy) => ([y, z]) => [sy * y, z];

// A saddle's outline in the part's (y, z): a plate over the face from y0 to y1 and up to top, legs down the sides of
// the beam to zLeg, a relief at each of the beam's corners; its concave corners elsewhere rounded
function saddleLoop(F, fit, legT, zLeg, y0, y1, top) {
  const L1 = F.yc - F.across - fit, R1 = F.yc + F.across + fit, L0 = Math.min(y0, L1 - legT), R0 = Math.max(y1, R1 + legT);
  const loop = [[L1 - legT, zLeg], [L1, zLeg], [L1, 0], [R1, 0], [R1, zLeg], [R1 + legT, zLeg], ...(R0 > R1 + legT + 1e-9 ? [[R1 + legT, 0], [R0, 0]] : []), [R0, top], [L0, top], ...(L0 < L1 - legT - 1e-9 ? [[L0, 0], [L1 - legT, 0]] : [])];
  const pts = ccw(loop), corner = (q) => Math.abs(q[1]) < 1e-9 && (Math.abs(q[0] - L1) < 1e-9 || Math.abs(q[0] - R1) < 1e-9);
  return { loop: roundConcave(pts, Math.min(2, legT / 2), (i) => !corner(pts[i])), L1, R1, L0, R0 };
}

// The screws through a saddle's legs into the side faces' slots: their thread from the slots' nuts, sized so a length
// sold engages the nut and stops short of its floor (the leg's thickness across is the grip)
function legScrews(what, p, F, o, k) {
  const head = o.head ?? 'cap', sds = F.sides.map((x) => { if (!x.slot) throw new Error(`${what}: ${p.name}'s ${x.side} face beside the ${F.name} face is closed: a saddle's legs screw into slots either side`); return slotSide(what, p, x.name, o.thread, o.nut, k.fit, o.given ?? {}); });
  const thread = sds[0].thread;
  if (sds[1].thread !== thread) throw new Error(`${what}: the slots either side of the ${F.name} face take different threads (${sds[0].thread}, ${sds[1].thread}): give thread`);
  const sc = screwOf(what, thread, head, k.pr), least = up(FITTING_DEFAULTS.least.value * sc.major, k.layer), fits = sold(least, k.layer, sds, thread);
  const legT = fits ? fits.t : least, along = r3(up(Math.max(sc.dk + 2 * FITTING_DEFAULTS.reach.value, 2 * sc.hd), 0.5)), endBy = r3(up(Math.max(sc.dk / 2 + FITTING_DEFAULTS.reach.value, sc.hd), 0.5));
  const deepest = Math.min(...F.sides.map((x) => x.z)), zLeg = r3(deepest - endBy);
  return { sds, thread, head, sc, legT, fits, along, zLeg };
}


// ---------- the holders ----------
/**
 * A printed holder for two rods at one end of a rod guide: a saddle standing across the beam, its legs screwed into the
 * slots of the faces either side, the rods pressed through it along the beam (their holes the rod's diameter with the
 * printer's hole compensation: a light press), and, where a screw drives the carriage, the screw's bearing pressed in a
 * pocket from its inner face (a bearing block at each end). Sized from a load along the beam at the rods' height to about
 * twice the margin, by beam formulas. It prints on its outer face, the rods' holes upright.
 * @param {string | object} profile
 * @param {{ face?: string, rod?: string, bearing?: string, spacing?: number, height?: number, screw?: string, nut?: string, support?: string | null, load?: number, thread?: string, head?: 'cap' | 'button', printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model
 */
export function rodHolderModel(profile, o = {}) {
  const what = 'rodHolderModel';
  options(what, o ?? {}, ['face', 'rod', 'bearing', 'spacing', 'height', 'screw', 'nut', 'support', 'load', 'thread', 'head', 'printer', 'material', 'given']);
  const L = rodsLayout(profile, { face: o.face, rod: o.rod, bearing: o.bearing, spacing: o.spacing, height: o.height, screw: o.screw, nut: o.nut, support: o.support, given: o.given });
  const p = profileOf(what, profile, o.given ?? {}), F = L.frame, k = partSetup(what, o), wall = ROD_DEFAULTS.wall.value, s = L.spacing, h = L.height, d = L.rod.d;
  const S = loadOf(what, o.load, ROD_DEFAULTS.load.value), ls = legScrews(what, p, F, o, k), sup = L.support;
  const comp = k.pr.rules?.hole_comp?.value ?? 0.1, rodHole = r3(d + comp), Rtop = Math.max(d / 2 + wall, sup ? sup.D / 2 + wall : 0), top = r3(up(h + Rtop, 0.5)), y0 = r3(F.yc - s / 2 - d / 2 - wall), y1 = r3(F.yc + s / 2 + d / 2 + wall);
  // its thickness along the beam: the rods' grip (a diameter), the screw's bearing and a floor, the load's bend
  const b = y1 - y0, M = S * h, t0 = Math.max(d, sup ? sup.width + wall : 0, up(FITTING_DEFAULTS.least.value * ls.sc.major, k.layer), bendT(M, b, k.S, want()));
  const t = r3(up(t0, k.layer)), legs = r3(Math.max(t, ls.along)), margin = r3(bendMargin(M, b, t, k.S)), stress = r3((6 * M) / (b * t * t));
  const shape = saddleLoop(F, k.fit, ls.legT, ls.zLeg, y0, y1, top);
  const screwHole = L.screw ? r3(L.screw.d + 2 * k.fit + 1) : 0, pocket = sup ? r3(sup.D - ROD_DEFAULTS.press.value + comp) : 0;
  const screws = F.sides.map((x, i) => ({ thread: ls.thread, head: ls.head, grip: ls.legT, side: x.name, at: [r3(legs / 2), r3(x.out > 0 ? shape.R1 + ls.legT : shape.L1 - ls.legT), x.z], axis: [0, -x.out, 0], nut: ls.sds[i].nut.name, nutKind: ls.sds[i].nut.nutKind, length: ls.fits?.lengths[i] ?? null }));
  const m = { kind: 'fitting', fitting: 'rod-holder', guide: 'rods', name: `rod-holder-${L.rod.set}-${short(p.name)}-${F.name}${sup ? `-${sup.set.replace(/^bearing-/, '')}` : ''}`, title: `printed holder for two ${L.rod.set} rods${sup ? ` and a ${sup.set}` : ''} on ${p.name}'s ${F.name} face`,
    profile: p.name, face: F.name, frame: F, rod: L.rod.set, spacing: s, height: h, thickness: t, legs, top, legT: ls.legT, zLeg: ls.zLeg, y0, y1, outline: shape.loop, rodHole, screwHole, support: sup ? { set: sup.set, pocket, depth: sup.width, D: sup.D } : null,
    thread: ls.thread, head: ls.head, screws, hardware: [], load: { force: S, what: `${mm(S)} N along the beam at the rods' ${mm(h)} mm height` }, stress, margin,
    anchors: { r1: { at: [0, r3(F.yc - s / 2), h], axis: [1, 0, 0], ref: [0, 0, 1] }, r2: { at: [0, r3(F.yc + s / 2), h], axis: [1, 0, 0], ref: [0, 0, 1] }, screw: { at: [0, F.yc, h], axis: [1, 0, 0], ref: [0, 0, 1] }, ...(sup ? { s1: { at: [r3(t - sup.width), F.yc, h], axis: [1, 0, 0], ref: [0, 0, 1] } } : {}) },
    size: { along: t, legs, across: r3(shape.R0 - shape.L0), height: r3(top - ls.zLeg) }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['load', 'wall', 'press'].map((x) => ({ name: `ROD_DEFAULTS.${x}`, value: ROD_DEFAULTS[x].value, kind: ROD_DEFAULTS[x].kind }))] };
  keep(m, k); weigh(m, rodHolder(m), k.density);
  m.findings.push(screwFinding(ls, 'leg'));
  if (sup) m.findings.push(finding('info', `${sup.set} pressed ${mm(sup.width)} mm into a pocket from its inner face (${mm(pocket)} mm across: ${mm(ROD_DEFAULTS.press.value)} mm under its ${mm(sup.D)} mm, an estimate of a light press): the screw's bearing at this end`, 'guide.support', { values: { pocket, depth: sup.width } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(b)} mm across, ${mm(top)} mm over the face, ${mm(t)} mm along the beam, legs ${mm(legs)} mm along it down to ${mm(-ls.zLeg)} mm under the face; ${ls.thread} into the slots either side`, marginText: `under ${m.load.what}, it bends at the face to ${mm(stress)} MPa`, pose: 'on its outer face, the rods\' holes upright' });
  return m;
}
/** A rod holder's solid: as it prints (on its outer face) or in its fitted frame. @param {object} m rodHolderModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function rodHolder(m, o = {}) {
  if (m?.fitting !== 'rod-holder') throw new Error(`rodHolder: give a rod holder's model (rodHolderModel), not ${shown(m)}`);
  // print frame: X = y, Y = z, Z = x (its outer face on the bed)
  const pr = printerOf('rodHolder', m.pr ?? null), F = m.frame, P = flat2(1), parts = [prismZ(m.outline.map(P), 0, m.thickness)];
  for (const sd of [-1, 1]) if (m.legs > m.thickness) { const yIn = sd < 0 ? F.yc - F.across - m.fit : F.yc + F.across + m.fit, yOut = yIn + sd * m.legT; parts.push(prismZ([[yIn, m.zLeg], [yOut, m.zLeg], [yOut, 0], [yIn, 0]].map(P), 0, m.legs)); }
  const cuts = [m.anchors.r1.at, m.anchors.r2.at].map(([, y, z]) => discZ(y, z, m.rodHole, -1, m.legs + 1));
  if (m.screwHole) cuts.push(discZ(F.yc, m.height, m.screwHole, -1, m.thickness + 1));
  if (m.support) cuts.push(discZ(F.yc, m.height, m.support.pocket, m.thickness - m.support.depth, m.thickness + 1));
  for (const sd of [-1, 1]) cuts.push(discZ(sd < 0 ? F.yc - F.across - m.fit : F.yc + F.across + m.fit, 0, 2 * ROD_DEFAULTS.relief.value, -1, m.legs + 1));
  for (const q of m.screws) cuts.push(hole(q.thread, { kind: 'clearance', into: q.axis[1] > 0 ? '+x' : '-x', at: [q.at[1] - q.axis[1], q.at[2], q.at[0]], depth: m.legT + 2, printer: pr }));
  const g = combine(parts, cuts, o.ops ?? null);
  return Object.assign(o.pose === 'fit' ? toFit(g, [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [0, 0, 0]) : g, { model: m });
}

// ---------- the motor plate ----------
/**
 * A printed plate that holds a motor of the catalogue on a beam, its shaft along the beam over a face: a saddle standing
 * across the beam, legs screwed into the side faces' slots, and the motor's mount cut from its own rules (its mounting
 * holes, the boss's pocket and the shaft's hole, as @rulecad/motors' mount() cuts them; the screws' clearance holes are
 * @rulecad/fixings'). The motor's mounting face lies on the plate's outer face, its body outside, the offset of a geared
 * motor's body away from the face. Sized from a load at the shaft to about twice the margin, by beam formulas; its legs
 * reach out under the motor so its screws have room. It prints on its inner face.
 * @param {string | object} profile
 * @param {{ motor: string, face?: string, height?: number, load?: number, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} o
 *   motor: its rule set (28byj48, nema14, nema17); height: the shaft's over the face (default the least the body clears)
 * @returns {object} its model, with anchors motor (where the motor's own frame goes), coupler and shaft
 */
export function motorPlateModel(profile, o = {}) {
  const what = 'motorPlateModel';
  options(what, o ?? {}, ['motor', 'face', 'height', 'load', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  if (o.motor == null) throw new Error(`${what}: motor is the motor's rule set, one of ${known('motor').join(', ')}`);
  const p = profileOf(what, profile, o.given ?? {}), F = faceOf(what, p, o.face), k = partSetup(what, o), mo = motorFigures(what, setOf(what, 'motor', 'motor', o.motor)), gap = ROD_DEFAULTS.gap.value, wall = ROD_DEFAULTS.wall.value;
  const least = r3(mo.body.size / 2 - mo.offset + gap), h = o.height ?? r3(up(least, 0.5));
  if (!(isNum(h) && h >= least - 1e-9)) throw new Error(`${what}: height is the shaft's height over the face, mm, at least ${mm(least)} so ${mo.set}'s body clears it (got ${shown(o.height)})`);
  const S = loadOf(what, o.load, ROD_DEFAULTS.load.value), ls = legScrews(what, p, F, o, k), comp = k.pr.rules?.hole_comp?.value ?? 0.1;
  // the motor's holes in the part's (y, z): its x across the beam the other way, its y down toward the face
  const at = ([mx, my]) => [r3(F.yc - mx), r3(h - my)], holes = mo.holes.map(at), clear = holeModel(mo.thread, { kind: 'clearance', printer: k.pr }).diameter;
  const ys = holes.map((q) => q[0]), zs = holes.map((q) => q[1]), rim = clear / 2 + wall + 1;
  const y0 = r3(Math.min(...ys) - rim), y1 = r3(Math.max(...ys) + rim), top = r3(up(Math.max(...zs) + rim, 0.5));
  const pocket = mo.boss.d ? r3(mo.boss.d + 2 * k.fit + comp) : 0, pocketDepth = mo.boss.h ? r3(mo.boss.h + 2 * k.layer) : 0, shaftHole = r3(mo.shaft.d + 2 * k.fit + comp + 0.4);
  const b = y1 - y0, M = S * h, t0 = Math.max(up(FITTING_DEFAULTS.least.value * fixingModel(mo.thread).major, k.layer), pocketDepth + 3 * k.layer, bendT(M, b, k.S, want()));
  const t = r3(up(t0, k.layer)), legs = r3(Math.max(t, ls.along)), margin = r3(bendMargin(M, b, t, k.S)), stress = r3((6 * M) / (b * t * t));
  const shape = saddleLoop(F, k.fit, ls.legT, ls.zLeg, y0, y1, top);
  // the screws into the slots, through the legs' middle, out under the motor (the legs reach from its inner face out)
  const xm = r3(t - legs / 2), screws = F.sides.map((x, i) => ({ thread: ls.thread, head: ls.head, grip: ls.legT, side: x.name, at: [xm, r3(x.out > 0 ? shape.R1 + ls.legT : shape.L1 - ls.legT), x.z], axis: [0, -x.out, 0], nut: ls.sds[i].nut.name, nutKind: ls.sds[i].nut.nutKind, length: ls.fits?.lengths[i] ?? null }));
  const shaftOut = r3(mo.shaft.length - t);
  const m = { kind: 'fitting', fitting: 'motor-plate', name: `motor-plate-${mo.set}-${short(p.name)}-${F.name}`, title: `printed plate for the motor ${mo.set} on ${p.name}'s ${F.name} face`, profile: p.name, face: F.name, frame: F, motor: mo.set, mount: mo,
    height: h, thickness: t, legs, top, legT: ls.legT, zLeg: ls.zLeg, y0, y1, outline: shape.loop, holes: holes.map((q) => ({ at: q, diameter: r3(clear) })), thread: ls.thread, head: ls.head, screws, shaftOut,
    pocket: { d: pocket, depth: pocketDepth }, shaftHole, hardware: [], load: { force: S, what: `${mm(S)} N along the beam at the shaft's ${mm(h)} mm height` }, stress, margin,
    anchors: { motor: { at: [0, F.yc, h], axis: [1, 0, 0], ref: [0, -1, 0] }, shaft: { at: [0, F.yc, h], axis: [1, 0, 0], ref: [0, 0, 1] }, coupler: { at: [r3(t + ROD_DEFAULTS.gap.value / 2), F.yc, h], axis: [1, 0, 0], ref: [0, 0, 1] } },
    size: { along: t, legs, across: r3(shape.R0 - shape.L0), height: r3(top - ls.zLeg) }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['load', 'wall', 'gap'].map((x) => ({ name: `ROD_DEFAULTS.${x}`, value: ROD_DEFAULTS[x].value, kind: ROD_DEFAULTS[x].kind }))] };
  keep(m, k); weigh(m, motorPlate(m), k.density);
  m.findings.push(screwFinding(ls, 'leg'));
  m.findings.push(finding('info', `${mo.set} on its mounting face at the plate's outer face, from its own rules: ${mo.holes.length} ${mo.thread} clearance holes (${mm(clear)} mm${mo.tapped ? `, into the motor's own thread` : ', through its ears to a nut'}), its ${mm(mo.boss.d)} mm boss in a ${mm(pocketDepth)} mm pocket, its shaft through a ${mm(shaftHole)} mm hole and ${mm(shaftOut)} mm past the plate's inner face`, 'fitting.motor', { values: { holes: mo.holes.length, thread: mo.thread, clearance: r3(clear), pocket, pocketDepth, shaftOut } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(b)} mm across, ${mm(top)} mm over the face, ${mm(t)} mm along the beam, legs ${mm(legs)} mm along it; ${ls.thread} into the slots either side`, marginText: `under ${m.load.what}, it bends at the face to ${mm(stress)} MPa`, pose: 'on its inner face, the boss\'s pocket opening up' });
  return m;
}
/** A motor plate's solid: as it prints (on its inner face) or in its fitted frame. @param {object} m motorPlateModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function motorPlate(m, o = {}) {
  if (m?.fitting !== 'motor-plate') throw new Error(`motorPlate: give a motor plate's model (motorPlateModel), not ${shown(m)}`);
  // print frame: X = -y, Y = z, Z = t - x (its inner face on the bed; the legs reach out to x = t - legs)
  const pr = printerOf('motorPlate', m.pr ?? null), F = m.frame, P = flat2(-1), t = m.thickness, parts = [prismZ(m.outline.map(P), 0, t)];
  for (const sd of [-1, 1]) { const yIn = sd < 0 ? F.yc - F.across - m.fit : F.yc + F.across + m.fit, yOut = yIn + sd * m.legT; parts.push(prismZ([[yIn, m.zLeg], [yOut, m.zLeg], [yOut, 0], [yIn, 0]].map(P), 0, m.legs)); }
  const cuts = m.holes.map((q) => discZ(-q.at[0], q.at[1], q.diameter, -1, t + 1));
  cuts.push(discZ(-F.yc, m.height, m.shaftHole, -1, t + 1));
  if (m.pocket.d && m.pocket.depth) cuts.push(discZ(-F.yc, m.height, m.pocket.d, t - m.pocket.depth, t + 1));
  for (const sd of [-1, 1]) cuts.push(discZ(-(sd < 0 ? F.yc - F.across - m.fit : F.yc + F.across + m.fit), 0, 2 * ROD_DEFAULTS.relief.value, -1, m.legs + 1));
  for (const q of m.screws) cuts.push(hole(q.thread, { kind: 'clearance', into: q.axis[1] > 0 ? '-x' : '+x', at: [-(q.at[1] - q.axis[1]), q.at[2], t - q.at[0]], depth: m.legT + 2, printer: pr }));
  const g = combine(parts, cuts, o.ops ?? null);
  return Object.assign(o.pose === 'fit' ? toFit(g, [[0, -1, 0], [0, 0, 1], [-1, 0, 0]], [0, 0, t]) : g, { model: m });
}

// ---------- the carriage ----------
/**
 * A printed carriage for a rod guide: a block over the face, two linear bearings pressed into pockets along the beam
 * (from its inner end, a floor at the far end), and where a screw drives it the lead nut's body in a bore through its
 * middle with the flange screwed to its far end, into pilots. With an endstop, a flag hangs from its far end beside the
 * beam down past the switch's lever. Sized from a load on its middle, between the bearings, by beam formulas. It prints on
 * its far end, the pockets opening up and the flag on the bed.
 * @param {string | object} profile
 * @param {{ face?: string, rod?: string, bearing?: string, spacing?: number, height?: number, screw?: string, nut?: string, flag?: { y: number, z: number }, load?: number, printer?: object, material?: string | object, given?: object }} [o]
 *   flag: where its tip reaches, in its frame (y across, z over the face: below 0 is beside the beam)
 * @returns {object} its model, with anchors slide (its joint), lm1 and lm2 (the bearings), nut and top
 */
export function rodCarriageModel(profile, o = {}) {
  const what = 'rodCarriageModel';
  options(what, o ?? {}, ['face', 'rod', 'bearing', 'spacing', 'height', 'screw', 'nut', 'flag', 'load', 'printer', 'material', 'given']);
  const L = rodsLayout(profile, { face: o.face, rod: o.rod, bearing: o.bearing, spacing: o.spacing, height: o.height, screw: o.screw, nut: o.nut, given: o.given });
  const p = profileOf(what, profile, o.given ?? {}), F = L.frame, k = partSetup(what, o), comp = k.pr.rules?.hole_comp?.value ?? 0.1, wall = ROD_DEFAULTS.wall.value, s = L.spacing, h = L.height, { length: Lc, width: Wc, bottom: zb, top: zt } = L.carriage, B = L.bearing, nut = L.nut;
  const S = loadOf(what, o.load, ROD_DEFAULTS.load.value), pocket = r3(B.D - ROD_DEFAULTS.press.value + comp), bore = r3(L.rod.d + 2 * k.fit + 1);
  const nutBore = nut ? r3(nut.body + 2 * k.fit + comp) : 0;
  // the flange's screws: through the flange into pilots in the carriage's far end, a length sold that engages the plastic
  let pilots = null, hardware = [];
  if (nut) {
    const th = ['M2', 'M2.5', 'M3', 'M4', 'M5'].filter((x) => fixingModel(x).major <= nut.hole - 0.3 + 1e-9).at(-1), need = engagement(th, { depth: 1, material: k.mat.name }).need, lens = [...(fixingModel(th).figures.lengths?.value ?? [])].sort((a, b) => a - b);
    const Ls = lens.find((x) => x - nut.flangeWidth >= need - 1e-9) ?? null, depth = Ls ? r3(up(Ls - nut.flangeWidth + FIX.tip_room.value + k.layer, k.layer)) : null;
    pilots = { thread: th, length: Ls, depth, need, at: Array.from({ length: nut.holes }, (_, i) => { const a = (Math.PI / 4) + (2 * Math.PI * i) / nut.holes; return [r3(F.yc + (nut.circle / 2) * Math.cos(a)), r3(h + (nut.circle / 2) * Math.sin(a))]; }) };
    hardware = [{ name: Ls ? `${th}x${Ls} button` : `${th} button`, kind: 'screw', thread: th, length: Ls, head: 'button', count: nut.holes, why: `${nut.set}'s flange to the carriage, ${mm(need)} mm into ${k.mat.name}` }];
    if (Ls == null || depth > Lc - wall) throw new Error(`${what}: no ${th} screw sold holds ${nut.set}'s flange with ${mm(need)} mm in the carriage's ${mm(Lc)} mm`);
    for (const [y, z] of pilots.at) if (Math.abs(y - F.yc) > s / 2 - B.D / 2 - holeModel(th, { kind: 'pilot', printer: k.pr }).diameter / 2 - 0.5 && Math.abs(z - h) < B.D / 2 + 2) throw new Error(`${what}: ${nut.set}'s flange screws reach the bearings' pockets: a wider spacing`);
  }
  // the flag: from the carriage's underside at its far end down beside the beam to the switch's lever
  let flag = null;
  if (o.flag != null) {
    const fl = o.flag, fd = ROD_DEFAULTS.flag.value;
    if (!fl || !isNum(fl.y) || !isNum(fl.z)) throw new Error(`${what}: flag is where its tip reaches, { y, z } in the carriage's frame (got ${shown(o.flag)})`);
    if (Math.abs(fl.y - F.yc) + fd.width / 2 > Wc / 2 - 1e-9) throw new Error(`${what}: the flag would hang ${mm(Math.abs(fl.y - F.yc))} mm from the middle, past the carriage's ${mm(Wc / 2)} mm: give a wider spacing, or mount the switch closer`);
    if (fl.z > zb - 1e-9) throw new Error(`${what}: the flag's tip at ${mm(fl.z)} mm is not under the carriage's underside (${mm(zb)} mm)`);
    flag = { y: r3(fl.y), z: r3(fl.z), width: fd.width, thickness: fd.thickness };
  }
  // its loop in (y, z): a block, and the flag under it where there is one
  const yl = r3(F.yc - Wc / 2), yr = r3(F.yc + Wc / 2);
  const loop = [[yl, zb], [yr, zb], [yr, zt], [yl, zt]];
  // sized: the load on its middle across the bearings, the block bent over the nut's bore (or the screw's room)
  const M = (S * s) / 4, web = r3(zt - h - Math.max(nutBore, 0) / 2), b = Lc, margin = r3(bendMargin(M, b, Math.max(web, 0.1), k.S)), stress = r3((6 * M) / (b * Math.max(web, 0.1) ** 2));
  const m = { kind: 'fitting', fitting: 'rod-carriage', guide: 'rods', name: `rod-carriage-${B.set}-${short(p.name)}-${F.name}${nut ? `-${nut.set}` : ''}`, title: `printed carriage on two ${B.set} over ${p.name}'s ${F.name} face`,
    profile: p.name, face: F.name, frame: F, bearing: B.set, spacing: s, height: h, length: Lc, width: Wc, bottom: zb, top: zt, loop, pocket, bore, depth: B.length, nut: nut ? { set: nut.set, bore: nutBore, flange: nut.flange, flangeWidth: nut.flangeWidth } : null, pilots, flag,
    hardware, screws: [], load: { force: S, what: `${mm(S)} N on its middle, between its bearings ${mm(s)} mm apart` }, stress, margin, own: r3(Lc + (nut ? nut.flangeWidth : 0)),
    anchors: { slide: { at: [0, F.yc, h], axis: [1, 0, 0], ref: [0, 0, 1] }, lm1: { at: [r3(-Lc / 2), r3(F.yc - s / 2), h], axis: [1, 0, 0], ref: [0, 0, 1] }, lm2: { at: [r3(-Lc / 2), r3(F.yc + s / 2), h], axis: [1, 0, 0], ref: [0, 0, 1] },
      ...(nut ? { nut: { at: [r3(Lc / 2), F.yc, h], axis: [1, 0, 0], ref: [0, 0, 1] } } : {}), top: { at: [0, F.yc, zt], axis: [0, 0, 1], ref: [1, 0, 0] }, ...(flag ? { flag: { at: [r3(Lc / 2 - flag.thickness), flag.y, flag.z], axis: [-1, 0, 0], ref: [0, 0, 1] } } : {}) },
    size: { length: Lc, width: Wc, height: r3(zt - zb) }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['load', 'press', 'web', 'floor'].map((x) => ({ name: `ROD_DEFAULTS.${x}`, value: ROD_DEFAULTS[x].value, kind: ROD_DEFAULTS[x].kind }))] };
  keep(m, k); weigh(m, rodCarriage(m), k.density);
  m.findings.push(finding('info', `two ${B.set} pressed ${mm(B.length)} mm into pockets from its inner end (${mm(pocket)} mm across: ${mm(ROD_DEFAULTS.press.value)} mm under their ${mm(B.D)} mm, an estimate of a light press), on a ${mm(Lc - B.length)} mm floor, ${mm(s)} mm apart`, 'guide.bearings', { values: { pocket, spacing: s, floor: r3(Lc - B.length) } }));
  if (nut) m.findings.push(finding('info', `${nut.set}'s body in a ${mm(nutBore)} mm bore, its flange on the far end held by ${hardware[0].count} ${hardware[0].name} into ${mm(pilots.depth)} mm pilots (${mm(pilots.need)} mm of ${k.mat.name} asked)`, 'guide.nut', { values: { bore: nutBore, screws: hardware[0].count, length: pilots.length, depth: pilots.depth } }));
  if (flag) m.findings.push(finding('info', `a ${mm(flag.thickness)} x ${mm(flag.width)} mm flag at its far end hangs to ${mm(flag.z)} mm, ${mm(Math.abs(flag.y - F.yc))} mm from the middle: it trips the endstop's lever`, 'guide.flag', { values: { ...flag } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(Wc)} mm across, ${mm(Lc)} mm along the beam, from ${mm(zb)} to ${mm(zt)} mm over the face`, marginText: `under ${m.load.what}, the ${mm(web)} mm over ${nut ? 'the nut\'s bore' : 'the middle'} bends to ${mm(stress)} MPa`, pose: 'on its far end, the bearings\' pockets opening up' });
  return m;
}
/** A rod carriage's solid: as it prints (on its far end) or in its fitted frame. @param {object} m rodCarriageModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function rodCarriage(m, o = {}) {
  if (m?.fitting !== 'rod-carriage') throw new Error(`rodCarriage: give a rod carriage's model (rodCarriageModel), not ${shown(m)}`);
  // print frame: X = -y, Y = z, Z = length / 2 - x (its far end on the bed)
  const P = flat2(-1), Lc = m.length, F = m.frame, parts = [prismZ(m.loop.map(P), 0, Lc)], pr = printerOf('rodCarriage', m.pr ?? null);
  if (m.flag) {
    const f = m.flag, y0 = f.y - f.width / 2, y1 = f.y + f.width / 2, r = Math.min(2, f.width / 2);
    // the flag and a fillet where it meets the underside (no square inside corner)
    const drop = ccw([[y0, f.z], [y1, f.z], [y1, m.bottom + 0.01], [y0, m.bottom + 0.01]].map(P));
    const root = (x0, s) => ccw([[x0, m.bottom - r], [x0, m.bottom + 0.01], [x0 + s * r, m.bottom + 0.01]].map(P));
    parts.push(prismZ(drop, 0, f.thickness), prismZ(root(y0, -1), 0, f.thickness), prismZ(root(y1, 1), 0, f.thickness));
  }
  const ys = [m.anchors.lm1.at[1], m.anchors.lm2.at[1]], cuts = [];
  for (const y of ys) cuts.push(discZ(-y, m.height, m.pocket, Lc - m.depth, Lc + 1), discZ(-y, m.height, m.bore, -1, Lc + 1));
  if (m.nut) {
    cuts.push(discZ(-F.yc, m.height, m.nut.bore, -1, Lc + 1));
    for (const [y, z] of m.pilots.at) cuts.push(hole(m.pilots.thread, { kind: 'pilot', into: '+z', at: [-y, z, 0], depth: m.pilots.depth, printer: pr }));
  } else cuts.push(discZ(-F.yc, m.height, 2 * ROD_DEFAULTS.wall.value, -1, Lc + 1));
  const g = combine(parts, cuts, o.ops ?? null);
  return Object.assign(o.pose === 'fit' ? toFit(g, [[0, -1, 0], [0, 0, 1], [-1, 0, 0]], [0, 0, Lc / 2]) : g, { model: m });
}

// ---------- the endstop's mount ----------
/**
 * A printed mount for a miniature switch (the catalogue's endstop-10t85) on a beam's slotted side face, where a carriage
 * passes: a block on the face, the switch screwed to it through its own holes into pilots, its lever facing along the
 * beam toward b and reaching across the face in the direction toward (+1 or -1 along the mount's y), and the block's screw
 * into the slot ahead of the lever, its head sunk in a counterbore so the carriage's flag passes over it. It prints on the
 * face side. @param {string | object} profile
 * @param {{ switch?: string, face: string, toward?: 1 | -1, load?: number, thread?: string, nut?: string, printer?: object, material?: string | object, given?: object }} o
 * @returns {object} its model: anchors.switch (the switch's own frame), lever (where its lever's face is, in the mount's frame)
 */
export function endstopMountModel(profile, o = {}) {
  const what = 'endstopMountModel';
  options(what, o ?? {}, ['switch', 'face', 'toward', 'load', 'thread', 'nut', 'printer', 'material', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), sw = setOf(what, 'switch', 'switch', o.switch ?? 'endstop-10t85'), k = partSetup(what, o), toward = o.toward ?? 1;
  if (![1, -1].includes(toward)) throw new Error(`${what}: toward is 1 or -1, which way across the face the switch's lever reaches (got ${shown(o.toward)})`);
  const w = fig(sw, 'body_width'), dep = fig(sw, 'body_depth'), len = fig(sw, 'body_length'), sp = fig(sw, 'mount_hole_spacing'), hd = fig(sw, 'mount_hole_diameter');
  if (![w, dep, len, sp, hd].every(isNum)) throw new Error(`${what}: ${sw.name} needs body_width, body_depth, body_length, mount_hole_spacing and mount_hole_diameter to be mounted`);
  const sd = slotSide(what, p, o.face, o.thread, o.nut, k.fit, o.given ?? {}), sc = screwOf(what, sd.thread, 'cap', k.pr), S = loadOf(what, o.load, ROD_DEFAULTS.switchLoad.value);
  // the switch's screws: the largest metric thread through its holes, through its body into pilots in the block
  const th = ['M3', 'M2.5', 'M2'].find((x) => fixingModel(x).major <= hd - 0.3 + 1e-9);
  if (!th) throw new Error(`${what}: ${sw.name}'s ${mm(hd)} mm holes take no screw from M2 up`);
  const need = engagement(th, { depth: 1, material: k.mat.name }).need, lens = [...(fixingModel(th).figures.lengths?.value ?? [])].sort((a, b) => a - b), Ls = lens.find((x) => x - dep >= need - 1e-9);
  if (Ls == null) throw new Error(`${what}: no ${th} screw sold passes ${sw.name}'s ${mm(dep)} mm and ${mm(need)} mm into ${k.mat.name}`);
  const pilot = r3(up(Ls - dep + FIX.tip_room.value + k.layer, k.layer)), cb = counterboreModelOf(sd.thread, k), least = up(FITTING_DEFAULTS.least.value * sc.major, k.layer);
  const t0 = Math.max(pilot + 2 * k.layer, cb.depth + least), fits = sold(t0, k.layer, [sd], sd.thread), tb = fits ? fits.t : r3(up(t0, k.layer));
  const lever = ROD_DEFAULTS.lever.value, gap = ROD_DEFAULTS.gap.value, xs = r3(lever + gap + cb.diameter / 2 + FITTING_DEFAULTS.reach.value), x0 = r3(-ROD_DEFAULTS.wall.value), x1 = r3(xs + cb.diameter / 2 + ROD_DEFAULTS.wall.value);
  const W = r3(w), M = S * (tb + dep), stress = r3((6 * M) / (W * tb * tb)), margin = r3(bendMargin(M, W, tb, k.S));
  const holes = [-1, 1].map((q) => [r3(len / 2), r3(q * (sp / 2))]); // (the switch's holes along its width, at its body's mid-length)
  const m = { kind: 'fitting', fitting: 'endstop-mount', name: `endstop-mount-${sw.name}-${short(p.name)}-${sd.face.replace('.', '-')}`, title: `printed mount for the switch ${sw.name} on ${p.name}'s ${sd.face} face`, profile: p.name, face: sd.face, switch: sw.name, toward,
    thickness: tb, outline: [[x0, -W / 2], [x1, -W / 2], [x1, W / 2], [x0, W / 2]], counterbore: cb, holes, pilot, switchScrew: { thread: th, length: Ls },
    thread: sd.thread, head: 'cap', screws: [{ thread: sd.thread, head: 'cap', grip: r3(tb - cb.depth), at: [xs, 0, r3(tb - cb.depth)], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null }],
    lever: { x: lever, out: r3(tb + dep / 2), reach: r3(0.6 * w), width: Math.min(4, dep) },
    hardware: [{ name: `${th}x${Ls} cap`, kind: 'screw', thread: th, length: Ls, head: 'cap', count: 2, why: `${sw.name} to its mount, ${mm(need)} mm into ${k.mat.name}` }],
    load: { force: S, what: `${mm(S)} N on the switch, across the face` }, stress, margin,
    anchors: { switch: { at: [0, 0, r3(tb + dep / 2)], axis: [1, 0, 0], ref: [0, toward, 0] } },
    size: { along: r3(x1 - x0), across: W, thickness: tb }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, { name: 'ROD_DEFAULTS.lever', value: lever, kind: ROD_DEFAULTS.lever.kind }, { name: `${sw.name}.mount_hole_spacing`, value: sp, kind: sw.rules.mount_hole_spacing.kind }] };
  keep(m, k); weigh(m, endstopMount(m), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} cap into its slot nut through ${mm(tb - cb.depth)} mm under a ${mm(cb.depth)} mm counterbore, so the flag passes over its head`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } })
    : finding('warn', `no ${sd.thread} cap screw sold engages its slot nut fully here: the screw's length is the fasten check's to choose`, 'fitting.screw', {}));
  m.findings.push(finding('info', `${sw.name} by 2 × ${th}x${Ls} cap through its ${mm(hd)} mm holes into ${mm(pilot)} mm pilots, ${mm(sp)} mm apart (${sw.rules.mount_hole_spacing.kind}: measure your switch)`, 'fitting.device', { values: { thread: th, length: Ls, pilot } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(x1 - x0)} mm along the beam, ${mm(W)} mm across, ${mm(tb)} mm thick`, marginText: `under ${m.load.what}, it bends to ${mm(stress)} MPa`, pose: 'on the face side, its counterbore and pilots opening up' });
  return m;
}
const counterboreModelOf = (thread, k) => { const c = counterbore(thread, { head: 'cap', printer: k.pr, into: '-z', at: [0, 0, 0] }).model; return { diameter: c.diameter, depth: c.depth }; };
/** An endstop mount's solid, in its fitted frame (which is how it prints). @param {object} m endstopMountModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object} */
export function endstopMount(m, o = {}) {
  if (m?.fitting !== 'endstop-mount') throw new Error(`endstopMount: give an endstop mount's model (endstopMountModel), not ${shown(m)}`);
  const t = m.thickness, pr = printerOf('endstopMount', m.pr ?? null), body = prismZ(m.outline, 0, t), q = m.screws[0];
  const cuts = [counterbore(q.thread, { head: 'cap', printer: pr, into: '-z', at: [q.at[0], q.at[1], t], length: t + 1 })];
  for (const [x, y] of m.holes) cuts.push(hole(m.switchScrew.thread, { kind: 'pilot', into: '-z', at: [x, y * m.toward, t], depth: m.pilot, printer: pr }));
  const g = combine([body], cuts, o.ops ?? null);
  return Object.assign(g, { model: m });
}

// the printer a part was drawn for, kept with its model (not a figure of it), and its fit
const keep = (m, k) => { Object.defineProperty(m, 'pr', { value: k.pr, enumerable: false }); m.fit = k.fit; };
// a load in N, the default where none is given; refused by name
function loadOf(what, F, dflt) {
  if (F == null) return dflt;
  if (!(isNum(F) && F > 0)) throw new Error(`${what}: load is the part's design load, in N, above 0 (got ${shown(F)})`);
  return F;
}
const screwFinding = (ls, where) => (ls.fits
  ? finding('pass', `${ls.thread}x${ls.fits.lengths[0]} ${ls.head} through each ${where} (${mm(ls.legT)} mm) into its slot nut, its tip between ${mm(ls.fits.windows[0].lo)} (the nut's thread engaged) and ${mm(ls.fits.windows[0].hi)} mm in`, 'fitting.screw', { values: { lengths: ls.fits.lengths, windows: ls.fits.windows } })
  : finding('warn', `no ${ls.thread} ${ls.head} screw sold engages its slot nut fully and stops short of the slot's floor through ${mm(ls.legT)} mm: the screw's length is the fasten check's to choose`, 'fitting.screw', {}));

// ---------- the bearings' loads ----------
/**
 * A rod carriage's loads against its linear bearings' static rating: the force and moment on the carriage, in its frame
 * about its slide (on the rods' line between them), shared between its two bearings: the forces across the rods half
 * each, a roll about the rods' line as a couple across their spacing, pitch and yaw as a couple along each bearing
 * (ROD_DEFAULTS.couple: an estimate). Each bearing's radial load over its static rating; the margin is the least.
 * The force along the beam is the drive's. @param {object} m rodCarriageModel's (its bearing named)
 * @param {{ force: number[], moment: number[] }} load N and N m, in the carriage's frame
 * @returns {{ bearings: { name: string, radial: number, ratio: number }[], worst: string, margin: number, level: 'pass' | 'warn' | 'fail', rating: number }}
 */
export function rodMargin(m, load) {
  const B = SETS[m.bearing], C0 = fig(B, 'static_rating'), Lb = fig(B, 'length'), s = m.spacing / 1000, arm = (ROD_DEFAULTS.couple.value * Lb) / 1000;
  const [, Fy, Fz] = load.force, [Mx, My, Mz] = load.moment;
  const bearings = [-1, 1].map((sg, i) => {
    const y = Fy / 2, z = Fz / 2 + (sg * Mx) / s; // (a roll about x pushes one bearing up and the other down)
    const py = Mz / 2 / arm, pz = My / 2 / arm; // (pitch and yaw as forces at each bearing's two ends)
    const radial = Math.hypot(Math.abs(y) + Math.abs(py), Math.abs(z) + Math.abs(pz));
    return { name: `lm${i + 1}`, radial: r3(radial), ratio: r3(radial / C0) };
  });
  const worst = bearings.reduce((a, b) => (b.ratio > a.ratio ? b : a)), margin = worst.ratio > 0 ? r3(1 / worst.ratio) : Infinity;
  return { bearings, worst: worst.name, margin, level: margin < 1 ? 'fail' : margin < want() ? 'warn' : 'pass', rating: C0 };
}


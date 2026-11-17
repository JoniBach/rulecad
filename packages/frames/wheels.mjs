// Guides that roll or slide on the beam itself: a carriage on V-wheels in a V-slot's tracks, and a printed slider in
// or over a slot. A V-wheel (its rule set: v-wheel-solid, v-wheel-mini) runs in the V mouth of a slot that has a track
// (track_width, track_angle on the slot's set: V-Slot's); a plain T-slot's square lips have none, and wheels there are
// refused with why (trackFit). The carriage is a printed plate over one face of the beam, its wheels in the slots of
// the two faces either side, those on one side on eccentric spacers that set the preload. Where each wheel's axle goes
// comes from the track and the wheel's rim: its flat tip enters the V until its flanks seat on the track's. Each
// wheel's load is held to a rating worked out from its plastic's allowed contact pressure (wheelMargin).
//
// A carriage's frame: x along the beam, y across it, z out of the face the plate lies over (0 on that face), its
// origin on the face's middle line at the middle of the plate. A wheel's frame: z along its axle toward the plate, x
// across toward the beam's face it runs on, its origin on the axle at the wheel's middle plane. A slider's frame is a
// mount's: x along the beam, y across, z out of the face (0 on it). Units: mm, N, N m, MPa, kg, grams.
import jscad from '@jscad/modeling';
import { SETS } from './catalogue.mjs';
import { profileOf, options, roundConcave, ccw } from './fitting.mjs';
import { partSetup, weigh, closingFindings, sideToFit } from './panel.mjs';

const { cuboid, cylinder, cylinderElliptic, polygon, roundedRectangle } = jscad.primitives, { extrudeLinear, extrudeRotate } = jscad.extrusions, { subtract, union } = jscad.booleans;
const { translate, transform, mirrorZ, rotateZ } = jscad.transforms;
const CHECKED = '2026-11-17', RAD = Math.PI / 180;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });
const box = (lo, hi) => cuboid({ size: hi.map((h, k) => h - lo[k]), center: hi.map((h, k) => (h + lo[k]) / 2) });
const prism = (loop, h) => extrudeLinear({ height: h }, polygon({ points: ccw(loop) }));
const short = (n) => String(n).replace(/^profile-/, '');

/** The working figures of the wheels and the slider, each with what it rests on. */
export const WHEEL_DEFAULTS = {
  gap: rule(0.5, 'mm', 'A wheel plate stands at least this clear of the face it lies over', 'default', 'A working figure of @rulecad/frames'),
  pitch: rule(15, 'mm', 'Two wheels on one side stand a wheel\'s diameter and this far apart, rounded up to 5 mm: room for a spanner on an eccentric between them', 'default', 'A working figure of @rulecad/frames'),
  wall: rule(2, 'mm', 'A wheel plate\'s least wall round its holes and to its edge', 'default', 'A working figure of @rulecad/frames'),
  thickness: rule(5, 'mm', 'A printed wheel plate\'s least thickness: its eccentric\'s rim seats 2.5 mm into it, with layers over that', 'default', 'A working figure of @rulecad/frames'),
  corner: rule(4, 'mm', 'The rounding of a wheel plate\'s corners', 'default', 'A working figure of @rulecad/frames'),
  load: rule(50, 'N', 'The design load on a wheel plate when none is given: a hand pressing on the carriage. Give the load for what it carries', 'default', 'A working figure of @rulecad/frames'),
  rigid: rule(1, '', 'The track is taken as rigid against the plastic rim: aluminium is about 20 times stiffer than acetal, so the rim takes the strain', 'estimate', 'A working figure of @rulecad/frames'),
  curvature: rule(1, '', 'A rim\'s contact on its track is worked out as a cylinder of the wheel\'s radius at the middle of the contact, on a flat, with the flanks\' slant length as its length (Hertz line contact: p = √(F E* / (π R l))). A flank\'s true radius of curvature along its roll is larger, so this errs low', 'estimate', 'Hertz line contact, Roark\'s Formulas for Stress and Strain, table 14.1, case 2b (a cylinder on a flat plate)'),
  combine: rule(1, '', 'A wheel\'s loads are held to its ratings together: its radial load over its radial rating plus its load along its axle over its axial rating. Under 1 it fails, under 2 it warns', 'estimate', 'A working rule of @rulecad/frames, as the rails\' carriages are held'),
  share: rule(1, '', 'A carriage\'s force across the beam is taken by the wheels on the side it pushes toward, shared evenly; a moment about the axle\'s direction (yaw) by one wheel at each end of the plate; a force along the axles shared by every wheel; roll by the two sides and pitch by the two ends, each shared evenly. No account is taken of the preload the eccentrics set', 'estimate', 'A working rule of @rulecad/frames'),
  density: rule(1.42, 'g/cm³', 'The density of the wheels\' acetal, for their mass', 'estimate', 'A usual figure for acetal homopolymer, not read from the wheel\'s maker'),
  steel: rule(7.9, 'g/cm³', 'The density of the eccentric spacers\' stainless steel and the screws', 'estimate', 'A usual figure for stainless steel'),
  aluminium: rule(2.7, 'g/cm³', 'The density of the plain spacers\' aluminium', 'estimate', 'A usual figure for aluminium alloys'),
  friction: rule(0.3, '', 'A printed slider\'s friction on anodised aluminium, dry: the force along the beam it takes to move it, over the load pressing it on', 'estimate', 'Not measured: a working figure of @rulecad/frames until a test or the rig (#264) measures it for the plastic'),
  pressure: rule(0.1, '× strength', 'A printed slider\'s pressure on the beam is held to this share of its plastic\'s strength, so it wears slowly', 'estimate', 'Not measured: a working figure of @rulecad/frames. How fast a printed slider wears rests on its plastic, its speed and how far it runs, which nothing here measures'),
  round: rule(0.3, 'mm', 'The rounding of a printed slider\'s inside corners: small, so its key stays square to the slot\'s lips (at 0.6 mm printcheck reads the round at the key\'s root as a second part 0.1 mm off it on the first layer)', 'default', 'A working figure of @rulecad/frames'),
  sliderLength: rule(30, 'mm', 'A printed slider\'s length along the beam when none is given', 'default', 'A working figure of @rulecad/frames'),
  sliderLoad: rule(20, 'N', 'The design load on a printed slider when none is given', 'default', 'A working figure of @rulecad/frames'),
};

const WHEELS = () => Object.values(SETS).filter((s) => s.part === 'wheel').map((s) => s.name).sort();
/** The V-wheel sets frames knows, by name. @returns {string[]} */
export const wheels = () => WHEELS();
const setOf = (what, part, set, given = {}, list) => {
  const s = typeof set === 'string' ? given.sets?.[set] ?? SETS[set] : set;
  if (!s?.rules || s.part !== part) throw new Error(`${what}: ${part} is a ${part}'s rule set or its name: ${list().join(', ')} (got ${shown(set)})`);
  return s;
};
const fig = (s, k) => s.rules[k]?.value;
const threadRules = (t) => SETS[String(t).toLowerCase().replace('.', '_')]?.rules;

// a beam face by name, and the two faces either side of it whose slots wheels run in: of each, the slot nearest the face
function sidesOf(p, face) {
  const fname = String(face).split('.')[0], place = p.faces[fname]?.[0];
  const n = place?.normal, half = (v) => Math.abs(v[0]) * (p.width / 2) + Math.abs(v[1]) * (p.height / 2);
  const sides = (fname === 'top' || fname === 'bottom' ? ['front', 'back'] : ['top', 'bottom']).map((sd) => {
    const list = p.faces[sd] ?? [], q = [...list].sort((a, b) => (b.at[0] * n[0] + b.at[1] * n[1]) - (a.at[0] * n[0] + a.at[1] * n[1]))[0];
    return { side: sd, place: q, slot: q?.slot ? p.slots[q.slot] : null, name: q ? `${sd}${list.length > 1 ? `.${q.index}` : ''}` : sd, below: q ? r3(half(n) - (q.at[0] * n[0] + q.at[1] * n[1])) : null, across: half(q?.normal ?? [1, 0]) };
  });
  return { fname, place, normal: n, deep: half(n ?? [0, 1]), sides };
}

/**
 * Where a V-wheel's axle stands from a slot's face, and whether the slot has a track for it to run on, as findings (code
 * guide.fit). Its flat tip enters the V until its flanks lie on the track's: the tip goes (track - flat) / 2 / tan(half
 * the V) deep, and the axle stands its radius less that from the face. The tip must clear the opening below the V, and
 * the flanks must meet within the V. A slot with no track (a plain T-slot), a closed face, or a V of another angle
 * fails, saying why.
 * @param {string | object} profile @param {string} face a slotted face of it: front, back.2
 * @param {string | object} wheel a wheel's rule set or its name @param {{ given?: object }} [o]
 * @returns {{ findings: object[], ok: boolean, seat: { depth: number, axle: number, contact: number[], slant: number, radius: number, clear: number } | null }}
 */
export function trackFit(profile, face, wheel, o = {}) {
  const what = 'trackFit', given = o.given ?? {}, p = profileOf(what, profile, given), w = setOf(what, 'wheel', wheel, given, WHEELS);
  const [fname, idx] = String(face).split('.'), q = p.faces[fname]?.[(idx ? +idx : 1) - 1];
  if (!q) throw new Error(`${what}: ${p.name} has no face ${shown(face)}: top, bottom, front or back, with .2 for a second slot`);
  return seatOn(p, { place: q, slot: q.slot ? p.slots[q.slot] : null, name: face }, w);
}
function seatOn(p, sd, w) {
  const out = [], f = (level, text, values = {}, refs = {}) => out.push(finding(level, text, 'guide.fit', { values, refs: { profile: p.name, wheel: w.name, ...refs } }));
  const D = fig(w, 'wheel_diameter'), R = D / 2, flat = fig(w, 'wheel_flat'), Ww = fig(w, 'wheel_width'), ang = fig(w, 'wheel_angle'), s = sd.slot;
  if (!s) { f('fail', `${p.name}'s ${sd.name} face is closed: a V-wheel runs in a slot's V track, and there is no slot there`, {}, { face: sd.name }); return { findings: out, ok: false, seat: null }; }
  if (!(s.trackWidth > 0)) {
    f('fail', `${p.name}'s ${sd.name} face has ${s.name}, a plain T-slot with no V track (no track_width in its rule set): a V-wheel's flanks need a V to run on and centre in, and on square lips it would ride on its tip and wander. Wheels go on a V-slot profile (profile-2040-openbuilds); on this beam a rail (kind rail) or a printed slider (kind slider) guides instead`, { trackWidth: 0 }, { slot: s.name, face: sd.name });
    return { findings: out, ok: false, seat: null };
  }
  if (Math.abs(s.trackAngle - ang) > 0.5) { f('fail', `${s.name}'s track is a ${mm(s.trackAngle)} degree V and ${w.name}'s rim a ${mm(ang)} degree one: its flanks would touch the track on an edge`, { track: s.trackAngle, wheel: ang }, { slot: s.name }); return { findings: out, ok: false, seat: null }; }
  const t = Math.tan((ang / 2) * RAD), deep = (s.trackWidth - flat) / 2 / t, vDeep = (s.trackWidth - s.opening) / 2 / t, chamfer = ((Ww - flat) / 2) / t;
  const z0 = Math.max(0, deep - chamfer), z1 = Math.min(vDeep, deep), slant = (z1 - z0) / Math.cos((ang / 2) * RAD), axle = R - deep, clear = (s.opening - flat) / 2;
  if (deep <= 0) { f('fail', `${w.name}'s ${mm(flat)} mm flat is wider than ${s.name}'s ${mm(s.trackWidth)} mm track: it would ride on the face`, { flat, track: s.trackWidth }, { slot: s.name }); return { findings: out, ok: false, seat: null }; }
  if (deep > vDeep + 1e-9 && clear <= 0) { f('fail', `${w.name}'s ${mm(flat)} mm tip is wider than ${s.name}'s ${mm(s.opening)} mm opening under its V: its tip would bottom there before its flanks seat`, { flat, opening: s.opening }, { slot: s.name }); return { findings: out, ok: false, seat: null }; }
  if (!(z1 - z0 > 0.2)) { f('fail', `${w.name}'s flanks meet ${s.name}'s V over ${mm(z1 - z0)} mm of its depth: too little to carry it`, { contact: [z0, z1] }, { slot: s.name }); return { findings: out, ok: false, seat: null }; }
  const seat = { depth: r3(deep), axle: r3(axle), contact: [r3(z0), r3(z1)], slant: r3(slant), radius: r3(axle + (z0 + z1) / 2), clear: r3(clear) };
  f('pass', `${w.name} runs in ${s.name}'s V track on ${p.name}'s ${sd.name} face: its ${mm(flat)} mm tip enters ${mm(deep)} mm, its flanks seat on the track's from ${mm(z0)} to ${mm(z1)} mm deep (${mm(slant)} mm a flank), and its tip clears the ${mm(s.opening)} mm opening by ${mm(clear)} mm a side. Its axle stands ${mm(axle)} mm from the face`, { depth: seat.depth, axle: seat.axle, contact: seat.contact, clear: r3(clear) }, { slot: s.name, face: sd.name });
  return { findings: out, ok: true, seat };
}

// A wheel's ratings: its rim's contact on the track by Hertz line contact at its plastic's allowed pressure (both
// flanks radially, one along its axle), and its bearings' static rating
function wheelRatings(w, seat, given) {
  const E = fig(w, 'wheel_modulus'), nu = fig(w, 'wheel_poisson') ?? 0.35, p = fig(w, 'wheel_contact_stress'), Es = E / (1 - nu * nu), half = (fig(w, 'wheel_angle') / 2) * RAD;
  const N = (Math.PI * seat.radius * seat.slant * p * p) / Es, b = setOf('wheel', 'bearing', fig(w, 'wheel_bearing'), given, () => []), C0 = (b.rules.static_rating?.value ?? Infinity) * (fig(w, 'wheel_bearings') ?? 2);
  return { flank: r3(N), radial: r3(Math.min(2 * N * Math.cos(half), C0)), axial: r3(N * Math.sin(half)), bearings: C0, bearing: b.name, bearingWidth: b.rules.width.value, bearingBore: b.rules.bore.value, bearingMass: b.rules.mass?.value ?? null };
}

/**
 * A carriage on V-wheels for a V-slot beam: a printed plate over one face, three or four wheels in the V tracks of the
 * two faces either side of it (two on the fixed side; one or two on eccentric spacers on the other), where each axle
 * goes worked out from the track and the rim (trackFit), the eccentrics' preload range, each wheel's ratings, the plate
 * sized from its load, its screws, nuts and spacers, its travel's length and its mass. Refused by name: a face either
 * side with no V track (a plain T-slot: why, and what guides there), a wheel set that is no wheel, and a plate that
 * would sit in the beam.
 * @param {string | object} profile the beam's profile
 * @param {{ wheel?: string | object, face?: string, wheels?: 3 | 4, pitch?: number, load?: number, printer?: object, material?: string | object, given?: object }} [o]
 *   face: the face the plate lies over (top); wheels: 4 (two a side) or 3 (one eccentric); pitch: the wheels' spacing along the beam, mm; load: the plate's design load, N
 * @returns {object} its model
 */
export function wheelsModel(profile, o = {}) {
  const what = 'wheelsModel';
  options(what, o ?? {}, ['wheel', 'face', 'wheels', 'pitch', 'load', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), w = setOf(what, 'wheel', o.wheel ?? 'v-wheel-solid', given, WHEELS), k = partSetup(what, o);
  const n = o.wheels ?? 4, face = o.face ?? 'top';
  if (n !== 3 && n !== 4) throw new Error(`${what}: wheels is 4 (two on each side) or 3 (two fixed, one on an eccentric) (got ${shown(o.wheels)})`);
  if (!['top', 'bottom', 'front', 'back'].includes(String(face))) throw new Error(`${what}: face is the face the plate lies over: top, bottom, front or back (got ${shown(face)})`);
  const F = o.load ?? WHEEL_DEFAULTS.load.value;
  if (!(isNum(F) && F > 0)) throw new Error(`${what}: load is the plate's design load, in N, above 0 (got ${shown(o.load)})`);
  if (!p.faces[face]?.length) throw new Error(`${what}: ${p.name} has no ${face} face to lay a plate over`);
  const g = sidesOf(p, face), fits = g.sides.map((sd) => ({ sd, ...seatOn(p, sd, w) }));
  const bad = fits.find((x) => !x.ok);
  if (bad) throw new Error(`${what}: wheels are refused on ${p.name} under its ${face} face: ${bad.findings.find((x) => x.level === 'fail').text}`);
  const seat = fits[0].seat, below = Math.max(...fits.map((x) => x.sd.below));
  if (fits.some((x) => Math.abs(x.sd.below - below) > 1e-6)) throw new Error(`${what}: ${p.name}'s tracks either side of its ${face} face are at different depths (${fits.map((x) => mm(x.sd.below)).join(' and ')} mm): a flat plate's wheels run in tracks at one depth`);
  const ecc = setOf(what, 'eccentric', fig(w, 'wheel_eccentric'), given, () => []), He = fig(ecc, 'eccentric_height'), e = fig(ecc, 'eccentric_offset');
  const R = fig(w, 'wheel_diameter') / 2, Ww = fig(w, 'wheel_width'), rt = wheelRatings(w, seat, given), stackHalf = r3(Math.max(Ww, (fig(w, 'wheel_bearings') ?? 2) * rt.bearingWidth + (fig(w, 'wheel_lip') ?? 0)) / 2);
  // the plate's underside over the face: the wheel's middle plane at the tracks' depth, its bearings' inner races, the spacer
  const gap = r3(He + stackHalf - below);
  if (gap < WHEEL_DEFAULTS.gap.value - 1e-9) throw new Error(`${what}: ${p.name}'s tracks are ${mm(below)} mm under its ${face} face, so on ${mm(He)} mm spacers the plate would sit ${mm(-gap)} mm into the beam: a shallower track or a longer spacer is needed`);
  const spacers = fig(w, 'spacer_lengths') ?? [];
  const across = g.sides[0].across, Y = r3(across + seat.axle), pitch = o.pitch ?? Math.ceil((2 * R + WHEEL_DEFAULTS.pitch.value) / 5 - 1e-9) * 5;
  if (!(isNum(pitch) && pitch >= 2 * R + 2)) throw new Error(`${what}: pitch is the wheels' spacing along the beam, mm, more than a wheel's ${mm(2 * R)} mm diameter and 2 mm (got ${shown(o.pitch)})`);
  // the wheels: fixed on the -y side, on eccentrics on the +y side; each its place, the way to its track and its spacer
  const fixed = [-pitch / 2, pitch / 2].map((x) => ({ side: g.sides[0].name, x: r3(x), y: -Y, inward: [0, 1, 0], eccentric: false }));
  const moving = (n === 4 ? [-pitch / 2, pitch / 2] : [0]).map((x) => ({ side: g.sides[1].name, x: r3(x), y: Y, inward: [0, -1, 0], eccentric: true }));
  const list = [...fixed, ...moving].map((x, i) => ({ name: `w${i + 1}`, ...x, at: [x.x, x.y, -below] }));
  // the plate: its thickness from its load, a beam across between the two rows of wheels at twice the margin
  const holeR = Math.max(fig(ecc, 'eccentric_hole') / 2 + k.fit, fig(w, 'spacer_diameter') / 2), edge = r3(holeR + WHEEL_DEFAULTS.wall.value);
  const Lp = r3(pitch + 2 * edge), Wp = r3(2 * (Y + edge)), span = 2 * Y, M = (F * span) / 4;
  const t = r3(Math.max(WHEEL_DEFAULTS.thickness.value, fig(ecc, 'eccentric_rim_height') + 3 * k.layer, Math.ceil(Math.sqrt((6 * M * 2) / (Lp * k.S)) * 10) / 10));
  const stress = r3((6 * M) / (Lp * t * t)), margin = r3(k.S / stress), length = r3(Math.max(Lp, pitch + 2 * R));
  // its screws through the plate, spacer, wheel and a lock nut, the shortest sold; a washer under the head over an eccentric
  const th = fig(w, 'wheel_thread'), T = threadRules(th) ?? {}, nutH = T.lock_nut_height?.value ?? 5, need = t + He + 2 * stackHalf + nutH + 1, lens = T.lengths?.value ?? [], L = lens.find((x) => x >= need - 1e-9) ?? null;
  const ne = list.filter((x) => x.eccentric).length, nf = list.length - ne;
  const hardware = [
    { name: L ? `${th}x${L} cap` : `${th} cap`, kind: 'screw', thread: th, length: L, head: 'cap', count: list.length, why: `through the plate, a spacer and a wheel to its lock nut: ${mm(need)} mm needed` },
    { name: `${th} lock nut`, kind: 'nut', thread: th, count: list.length, why: 'on each wheel\'s screw, under the wheel' },
    { name: `${th} washer`, kind: 'washer', thread: th, count: ne, why: 'under the head of each eccentric\'s screw, over its slot in the plate' },
    { name: ecc.name, kind: 'spacer', count: ne, why: `${mm(He)} mm eccentric spacer under each wheel on the ${g.sides[1].name} side, that sets the preload` },
    { name: `spacer ${mm(fig(w, 'spacer_diameter'))} x ${mm(He)} mm`, kind: 'spacer', count: nf, why: `plain aluminium spacer under each wheel on the ${g.sides[0].name} side` },
  ];
  const kitMass = wheelKitMass(w, rt, stackHalf);
  const m = { kind: 'fitting', fitting: 'wheel-plate', guide: 'wheels', name: `wheel-plate-${w.name.replace(/^v-wheel-/, '')}-${n}-${short(p.name)}-${face}`, title: `printed plate on ${n} ${w.name} wheels over ${p.name}'s ${face} face`,
    profile: p.name, face, wheel: w.name, eccentric: ecc.name, count: n, pitch, seat, below, gap, stackHalf, spacer: He, offset: e, wheels: list, ratings: rt, plate: { length: Lp, width: Wp, thickness: t, holeR, edge }, length, across: Y,
    sides: g.sides.map((x) => ({ face: x.name, slot: x.slot.name })), hardware, screws: [], kitMass, load: { force: F, what: `${mm(F)} N pressing on its middle, across the ${mm(span)} mm between its rows of wheels` }, stress, margin,
    size: { length: Lp, width: Wp, thickness: t, gap }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, fit: k.fit, findings: [],
    anchors: { slide: { at: [0, 0, 0], axis: [1, 0, 0], ref: [0, 0, 1] }, top: { at: [0, 0, r3(gap + t)], axis: [0, 0, 1], ref: [1, 0, 0] }, ...Object.fromEntries(list.map((x) => [x.name, { at: x.at, axis: [0, 0, 1], ref: x.inward }])) },
    rests: [...['wheel_flat', 'wheel_modulus', 'wheel_contact_stress', 'wheel_poisson'].map((x) => ({ name: `${w.name}.${x}`, value: w.rules[x].value, kind: w.rules[x].kind })),
      ...['track_width'].map((x) => ({ name: `${g.sides[0].slot.name}.${x}`, value: g.sides[0].slot.trackWidth, kind: g.sides[0].slot.figures?.[x]?.kind ?? null })),
      ...['curvature', 'combine', 'share'].map((x) => ({ name: `WHEEL_DEFAULTS.${x}`, value: WHEEL_DEFAULTS[x].value, kind: WHEEL_DEFAULTS[x].kind }))] };
  weigh(m, wheelPlate(m), k.density);
  for (const x of fits) m.findings.push(...x.findings);
  closingFindings(m, { S: k.S, sizeText: `${mm(Lp)} x ${mm(Wp)} x ${mm(t)} mm, ${mm(gap)} mm over the face, its ${n} wheels ${mm(pitch)} mm apart along the beam and ${mm(2 * Y)} mm across`, marginText: `under ${m.load.what}, it bends to ${mm(stress)} MPa`, pose: 'upside down, its top the first layer' });
  // the eccentrics' range: turned from end to end each moves its wheel twice its offset across the beam
  m.findings.push(finding('info', `${ne} wheel${ne > 1 ? 's' : ''} on the ${g.sides[1].name} side turn${ne > 1 ? '' : 's'} on ${ecc.name}: drawn at mid-turn, where the wheel just seats; turning it moves the wheel from ${mm(e)} mm into the track (preload) to ${mm(e)} mm clear of it, ${mm(2 * e)} mm in all. Set it with a spanner across its ${mm(fig(ecc, 'eccentric_hex'))} mm hex until the carriage rolls with no play and the wheel can only just be turned by hand`, 'guide.preload', { values: { offset: e, range: r3(2 * e), hex: fig(ecc, 'eccentric_hex') } }));
  // the seat beside the maker's own plate: its axles across a 20 mm rail. The fixed wheels cannot move, so the eccentrics
  // on the other side take up the whole difference, each from mid-turn up to its offset either way
  const maker = fig(w, 'wheel_plate_across'), mine = r3(20 + 2 * seat.axle);
  if (isNum(maker)) {
    const diff = r3(mine - maker), within = Math.abs(diff) <= e + 1e-9, kinds = ['track_width', 'track_angle'].map((x) => `${x} ${g.sides[0].slot.figures?.[x]?.kind ?? 'as given'}`).concat(['wheel_diameter', 'wheel_flat'].map((x) => `${x} ${w.rules[x]?.kind ?? 'as given'}`));
    m.findings.push(finding(within ? 'info' : 'warn', `across a 20 mm rail this seat puts the axles ${mm(mine)} mm apart and OpenBuilds' own plate ${mm(maker)} mm: ${mm(Math.abs(diff))} mm ${diff > 0 ? 'wider' : 'closer'}, all of it taken up by the eccentrics on the ${g.sides[1].name} side, the fixed wheels being fixed. ${within ? `That is within the eccentric's ${mm(e)} mm either way from mid-turn` : `That is more than the eccentric's ${mm(e)} mm either way from mid-turn: if the maker's plate is right, on a plate drawn to this seat the eccentrics cannot ${diff > 0 ? 'bring their wheels in to the track' : 'take their wheels out far enough'}, so measure the track and the wheel across its rim before printing it`}. The seat rests on the slot's and the wheel's figures (${kinds.join(', ')})`, 'guide.seat', { values: { mine, maker, difference: diff, eccentric: e } }));
  }
  m.findings.push(finding('info', `each wheel is rated ${mm(rt.radial)} N across the beam and ${mm(rt.axial)} N along its axle: its rim on the track at ${mm(fig(w, 'wheel_contact_stress'))} MPa by Hertz line contact over ${mm(seat.slant)} mm a flank at ${mm(seat.radius)} mm (an estimate), under its two ${rt.bearing.replace('bearing-', '')} bearings' ${mm(rt.bearings)} N`, 'guide.rating', { values: { radial: rt.radial, axial: rt.axial, bearings: rt.bearings } }));
  m.findings.push(finding('info', `${list.length} ${hardware[0].name} screws, ${list.length} lock nuts, ${ne} washer${ne > 1 ? 's' : ''}, ${ne} ${ecc.name} and ${nf} plain spacers; ${list.length} wheels of ${mm(kitMass * 1000)} g each with their bearings (an estimate from the wheel's volume${rt.bearingMass == null ? `: ${rt.bearing} gives no mass, so its bearings are not counted` : ''})`, 'guide.hardware', { values: { screws: list.length, length: L, need: r3(need) } }));
  return m;
}

// a wheel's mass with its two bearings (an estimate: the plastic from its volume, the bearings from their set)
function wheelKitMass(w, rt, stackHalf) {
  const R = fig(w, 'wheel_diameter') / 2, W = fig(w, 'wheel_width'), seatR = (setOf('wheel', 'bearing', rt.bearing, {}, () => []).rules.outer_diameter.value) / 2;
  const plastic = (Math.PI * (R * R - seatR * seatR) * W * 0.9 * WHEEL_DEFAULTS.density.value) / 1000, bearings = (rt.bearingMass ?? 0) * 1000 * (fig(w, 'wheel_bearings') ?? 2);
  return r3((plastic + bearings) / 1000); // (the wheel's rim less its chamfers taken as 0.9 of a plain ring)
}

/**
 * A wheel plate's solid: fitted (its frame the carriage's) or upside down to print. Its fixed wheels' screws go through
 * plain holes; each eccentric's rim turns in a pocket from the underside, its screw through a hole wide enough for the
 * screw's circle as it turns. @param {object} m wheelsModel's @param {{ pose?: 'print' | 'fit', ops?: object }} [o] @returns {object}
 */
export function wheelPlate(m, o = {}) {
  if (m?.fitting !== 'wheel-plate') throw new Error(`wheelPlate: give a wheel plate's model (wheelsModel), not ${shown(m)}`);
  const { length: Lp, width: Wp, thickness: t } = m.plate, ecc = SETS[m.eccentric]?.rules ?? {}, fit = m.fit ?? 0.2;
  const body = extrudeLinear({ height: t }, roundedRectangle({ size: [Lp, Wp], roundRadius: Math.min(WHEEL_DEFAULTS.corner.value, Lp / 4, Wp / 4), segments: 32 }));
  const hole = (x, y, d, z0 = -1, h = t + 2) => translate([x, y, z0 + h / 2], cylinder({ radius: d / 2, height: h, segments: 32 }));
  const cuts = m.wheels.flatMap((w) => {
    if (!w.eccentric) return [hole(w.x, w.y, (SETS[m.wheel]?.rules.wheel_plate_hole?.value ?? 5.1) + fit)];
    const cx = w.x + m.offset, rim = (ecc.eccentric_rim_height?.value ?? 2.5) + 0.3; // (the rim's axis stands its offset along the beam from the wheel's, at mid-turn)
    return [hole(cx, w.y, (ecc.eccentric_hole?.value ?? 7.2) + fit, -1, rim + 1), hole(cx, w.y, (ecc.eccentric_bore?.value ?? 5) + 2 * m.offset + 2 * fit)];
  });
  const g = translate([0, 0, m.gap], subtract(body, ...cuts));
  return Object.assign(o.pose === 'print' ? mirrorZ(translate([0, 0, -m.gap - t], g)) : g, { model: m });
}

/**
 * A wheel's solid in its frame, with the spacer under it (an eccentric on the eccentric side, drawn at mid-turn, its
 * rim that turns in the plate). collide: the part outside the beam's face only, for an overlap check against a plain
 * envelope; against a beam's link with its tracks cut (beam(m, { display: 'link', tracks: true })) the whole wheel is
 * checked, so a rim out of its track is found.
 * @param {object} m wheelsModel's @param {{ eccentric?: boolean, collide?: boolean }} [o] @returns {object} a JSCAD geom3
 */
export function vWheel(m, o = {}) {
  if (m?.fitting !== 'wheel-plate') throw new Error(`vWheel: give a wheel plate's model (wheelsModel), not ${shown(m)}`);
  const w = SETS[m.wheel].rules, ecc = SETS[m.eccentric].rules, R = w.wheel_diameter.value / 2, W = w.wheel_width.value, f = w.wheel_flat.value, c = (W - f) / 2, hs = m.stackHalf, bore = m.ratings.bearingBore / 2;
  // the rim and hub turned about z, the inner races standing proud of the faces to the spacer
  const race = bore + 1.2, rim = extrudeRotate({ segments: 48 }, polygon({ points: [[bore, -hs], [race, -hs], [race, -W / 2], [R - c, -W / 2], [R, -f / 2], [R, f / 2], [R - c, W / 2], [race, W / 2], [race, hs], [bore, hs]] }));
  const top = hs, Hs = m.spacer, sp = o.eccentric
    ? (() => { const hex = ecc.eccentric_hex.value, rr = ecc.eccentric_rim_diameter.value / 2, rh = ecc.eccentric_rim_height.value, e = m.offset;
      const cam = translate([0, e, top + Hs / 2], subtract(rotateZ(Math.PI / 6, cylinder({ radius: hex / Math.sqrt(3), height: Hs, segments: 6 })), translate([0, -e, 0], cylinder({ radius: bore, height: Hs + 1, segments: 24 }))));
      return union(cam, translate([0, e, top + Hs + rh / 2], subtract(cylinder({ radius: rr, height: rh, segments: 32 }), translate([0, -e, 0], cylinder({ radius: bore, height: rh + 1, segments: 24 }))))); })()
    : translate([0, 0, top + Hs / 2], subtract(cylinder({ radius: w.spacer_diameter.value / 2, height: Hs, segments: 32 }), cylinder({ radius: w.spacer_bore.value / 2, height: Hs + 1, segments: 24 })));
  const g = union(rim, sp);
  return o.collide ? subtract(g, box([m.seat.axle, -R - 20, -R - 20], [R + 20, R + 20, R + 20])) : g;
}

/**
 * A wheel carriage's loads against its wheels' ratings: the force and moment on the carriage, in its frame about its
 * origin on the face, shared out among its wheels (WHEEL_DEFAULTS.share), each wheel's radial load over its radial rating
 * plus its axial load over its axial rating (WHEEL_DEFAULTS.combine). The force along the beam is the drive's.
 * @param {object} m wheelsModel's @param {{ force: number[], moment: number[] }} load N and N m, in the carriage's frame
 * @returns {{ wheels: { name: string, radial: number, axial: number, ratio: number }[], worst: string, margin: number, level: 'pass' | 'warn' | 'fail' }}
 */
export function wheelMargin(m, load) {
  const what = 'wheelMargin';
  if (m?.fitting !== 'wheel-plate') throw new Error(`${what}: give a wheel plate's model (wheelsModel), not ${shown(m)}`);
  const ok = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
  if (!load || !ok(load.force) || !ok(load.moment)) throw new Error(`${what}: load is { force: [along, across, out], moment: [roll, pitch, yaw] }, in N and N m in the carriage's frame (got ${shown(load)})`);
  const [Fx, Fy, Fz] = load.force, zs = m.below, Mx = load.moment[0] * 1000 - zs * Fy, My = load.moment[1] * 1000 + zs * Fx, Mz = load.moment[2] * 1000; // (N mm, about the wheels' middle plane)
  const ws = m.wheels, xs = ws.map((w) => w.x), lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo, n = ws.length, across = 2 * m.across;
  const out = ws.map((w) => {
    const side = ws.filter((v) => v.y === w.y).length, endN = ws.filter((v) => Math.abs(v.x - w.x) < 1e-9).length, end = span > 0 && (Math.abs(w.x - lo) < 1e-9 || Math.abs(w.x - hi) < 1e-9);
    const takesFy = (Fy > 0 && w.y < 0) || (Fy < 0 && w.y > 0);
    const radial = (takesFy ? Math.abs(Fy) / side : 0) + (end ? Math.abs(Mz) / span : 0);
    const axial = Math.abs(Fz) / n + Math.abs(Mx) / across / side + (end ? Math.abs(My) / span / endN : 0);
    return { name: w.name, radial: r3(radial), axial: r3(axial), ratio: r3(radial / m.ratings.radial + axial / m.ratings.axial) };
  });
  const top = [...out].sort((a, b) => b.ratio - a.ratio)[0], margin = top.ratio > 0 ? 1 / top.ratio : Infinity;
  return { wheels: out, worst: top.name, margin, level: margin < 1 ? 'fail' : margin < 2 ? 'warn' : 'pass' };
}

// ---------- a printed slider ----------
/**
 * A printed slider running along a beam's slot: over it (a shoe on the face, a key in the slot's opening that keeps it
 * on line) or in it (a block under the lips, held in, a neck through the opening and a pad over the face). Its
 * clearance in the slot is the printer's fit a side; it prints on its side, its section the first layer. Its friction
 * and wear rest on working figures (WHEEL_DEFAULTS.friction and .pressure), which it says.
 * @param {string | object} profile the beam's profile
 * @param {{ face?: string, mode?: 'over' | 'in', length?: number, load?: number, printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model
 */
export function sliderModel(profile, o = {}) {
  const what = 'sliderModel';
  options(what, o ?? {}, ['face', 'mode', 'length', 'load', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o), face = o.face ?? 'top', mode = o.mode ?? 'over';
  const [fname, idx] = String(face).split('.'), q = p.faces[fname]?.[(idx ? +idx : 1) - 1];
  if (!q) throw new Error(`${what}: ${p.name} has no face ${shown(face)}: top, bottom, front or back, with .2 for a second slot`);
  if (!q.slot) throw new Error(`${what}: ${p.name}'s ${face} face is closed: a slider runs in a slot or keys into one`);
  if (!['over', 'in'].includes(mode)) throw new Error(`${what}: mode is over (a shoe on the face, keyed into the slot) or in (a block held under the slot's lips) (got ${shown(mode)})`);
  const L = o.length ?? WHEEL_DEFAULTS.sliderLength.value, F = o.load ?? WHEEL_DEFAULTS.sliderLoad.value;
  if (!(isNum(L) && L >= 10)) throw new Error(`${what}: length is the slider along the beam, mm, at least 10 (got ${shown(o.length)})`);
  if (!(isNum(F) && F > 0)) throw new Error(`${what}: load is the force pressing it on (over) or pulling it out (in), in N, above 0 (got ${shown(o.load)})`);
  const s = p.slots[q.slot], fit = k.fit, cell = Math.abs(q.along[0]) > 0.5 ? p.pitch[0] : p.pitch[1], rr = WHEEL_DEFAULTS.round.value, line = k.line;
  const key = r3(s.opening - 2 * fit), lipT = s.lip, mouth = s.trackWidth ? (s.trackWidth - s.opening) / 2 : 0;
  if (key < 2 * line) throw new Error(`${what}: ${s.name}'s ${mm(s.opening)} mm opening leaves a key ${mm(key)} mm wide: too thin to print`);
  const allowed = WHEEL_DEFAULTS.pressure.value * k.S;
  let section, area, t, contact;
  if (mode === 'over') {
    // a shoe on the face (its middle cell, less the corners), a key down the opening to the lips' underside less the fit
    const wS = r3(cell - 2 * Math.max(p.cornerRadius ?? 0.5, 0.5) - 1), need = Math.sqrt((6 * (F / 2) * (wS / 4) * 2) / (L * k.S)); t = r3(Math.max(3 * line * 2, 2, Math.ceil(need * 10) / 10));
    const kd = r3(lipT - fit);
    section = [[-wS / 2, 0], [-key / 2, 0], [-key / 2, -kd], [key / 2, -kd], [key / 2, 0], [wS / 2, 0], [wS / 2, t], [-wS / 2, t]];
    area = wS * L; contact = 'its shoe on the face';
  } else {
    // a block under the lips (the cavity less the fit), a neck through the opening, a pad over the face as wide as the V's mouth and a wall each side
    const wB = r3(s.cavityWidth - 2 * fit), wF = r3(Math.max(key, s.floorWidth - 2 * fit)), top = r3(-(lipT + fit)), bend = r3(-Math.max(lipT + fit, s.straight)), floor = r3(-(s.cavityDepth - fit)), wP = r3(Math.min(cell - 2, s.mouth + 4));
    t = r3(top - floor);
    if (t < 1) throw new Error(`${what}: ${s.name} leaves ${mm(t)} mm under its lips: too little for a block to be held there`);
    // the block follows the cavity, the fit inside it: straight walls, then in along the flanks to the floor
    section = [[-wF / 2, floor], [wF / 2, floor], ...(bend > floor + 1e-9 ? [[wB / 2, bend]] : []), [wB / 2, top], [key / 2, top], [key / 2, 0], [wP / 2, 0], [wP / 2, 2], [-wP / 2, 2], [-wP / 2, 0], [-key / 2, 0], [-key / 2, top], [-wB / 2, top], ...(bend > floor + 1e-9 ? [[-wB / 2, bend]] : [])];
    area = (wB - s.opening) * L; contact = 'its block under the lips';
  }
  section = roundConcave(ccw(section), rr).map(([y, z]) => [r3(y), r3(z)]);
  const pressure = r3(F / area), margin = r3(allowed / pressure), mu = WHEEL_DEFAULTS.friction.value, drag = r3(mu * F), stress = r3(pressure);
  const m = { kind: 'fitting', fitting: 'slider', guide: 'slider', name: `slider-${mode}-${short(p.name)}`, title: `printed slider ${mode === 'over' ? 'over' : 'in'} ${s.name} on ${p.name}`, profile: p.name, face, mode, slot: s.name, length: L, section,
    clearance: fit, key, thickness: t, load: { force: F, what: `${mm(F)} N ${mode === 'over' ? 'pressing it on the face' : 'pulling it out against the lips'}` }, pressure, allowed: r3(allowed), friction: mu, drag, stress, margin,
    size: { length: L, width: r3(Math.max(...section.map((x) => x[0])) - Math.min(...section.map((x) => x[0]))), height: r3(Math.max(...section.map((x) => x[1])) - Math.min(...section.map((x) => x[1]))) },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, screws: [], findings: [], anchors: { slide: { at: [0, 0, 0], axis: [1, 0, 0], ref: [0, 0, 1] }, top: { at: [0, 0, r3(Math.max(...section.map((x) => x[1])))], axis: [0, 0, 1], ref: [1, 0, 0] } },
    rests: ['friction', 'pressure'].map((x) => ({ name: `WHEEL_DEFAULTS.${x}`, value: WHEEL_DEFAULTS[x].value, kind: WHEEL_DEFAULTS[x].kind })) };
  weigh(m, slider(m), k.density);
  const ok = margin >= 2 - 1e-9;
  m.findings.push(finding('info', `${m.title}: ${mm(L)} mm along the beam, ${mode === 'over' ? `a ${mm(t)} mm shoe on the face and a ${mm(key)} mm key in ${s.name}'s opening` : `a ${mm(t)} mm block under ${s.name}'s lips and a ${mm(key)} mm neck through its opening`}, ${mm(fit)} mm clear a side (${k.pr.name}'s fit)`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding(ok ? 'pass' : 'fail', `under ${m.load.what}, ${contact} bears ${mm(pressure)} MPa, ${mm(margin)} times under the ${mm(allowed)} MPa allowed for wear (${WHEEL_DEFAULTS.pressure.value} of ${k.mat.name.toUpperCase()}'s ${k.S} MPa; ${ok ? 'within the 2× asked' : 'short of the 2× asked'}): an estimate`, 'fitting.margin', { values: { load: F, pressure, allowed: r3(allowed), margin } }));
  m.findings.push(finding('info', 'it is drawn to print on its side, its section the first layer: a plain first layer, no supports (printcheck\'s check() reads the solid)', 'fitting.printable', { values: { pose: 'on its side' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${k.mat.name} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  if (mode === 'in') m.findings.push(finding('info', `it is held under ${s.name}'s lips, so it goes in from the beam's end before anything closes it`, 'guide.entry', { values: { mode } }));
  m.findings.push(finding('info', `it slides with ${mm(fit)} mm clear a side in ${s.name}'s ${mm(s.opening)} mm opening, the printer's fit (${k.pr.name}), so it may wander that much across the beam`, 'guide.clearance', { values: { clearance: fit, opening: s.opening } }));
  m.findings.push(finding('info', `its friction and wear rest on working figures, not measurements: ${k.mat.name.toUpperCase()} on anodised aluminium taken as μ ${mu} (${mm(drag)} N to push it under ${mm(F)} N), and its pressure held to ${WHEEL_DEFAULTS.pressure.value} of its strength so it wears slowly. A test or the rig (#264) measures them`, 'guide.friction', { values: { friction: mu, drag, pressure, allowed: r3(allowed) } }));
  return m;
}

/** A slider's solid: on its side to print, or fitted. @param {object} m sliderModel's @param {{ pose?: 'print' | 'fit', tongues?: boolean, ops?: object }} [o] @returns {object} */
export function slider(m, o = {}) {
  if (m?.fitting !== 'slider') throw new Error(`slider: give a slider's model (sliderModel), not ${shown(m)}`);
  // (tongues: false keeps only what stands over the face, for an overlap check against the beam's envelope)
  const loop = o.tongues === false ? (() => { const top = Math.max(...m.section.map((x) => x[1])), ys = m.section.map((x) => x[0]).filter((y, i) => m.section[i][1] >= -1e-9); return [[Math.min(...ys), 0], [Math.max(...ys), 0], [Math.max(...ys), top], [Math.min(...ys), top]]; })() : m.section;
  const g = prism(loop, m.length);
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.length), g) : g, { model: m });
}

// Guides: linear motion on a beam. A miniature rail (MGN7, 9, 12 or 15, from its rule set: rail-mgn12) screwed down
// on a beam's slotted face into slot nuts at its hole pitch, and its carriages, each riding its own share of the rail.
// The model says where the holes fall in the length it is cut to, the screws and the slot nut each takes, how far each
// carriage can travel, what the rail adds to a machine's error budget, and whether it fits the face (guideFit). A
// carriage's loads are held to its ratings (carriageMargin). A printed jig centres the rail on the beam while its
// screws are tightened (railJigModel).
//
// A rail's frame: x along it from its end a (0 to its length), y across, z out of the face it is screwed to (0 on the
// face). A carriage's frame: its middle over the rail's centre line, on that face, x along the rail, z up; its top is
// at z = H (carriage_height). A jig's fitted frame is a mount's (x along the beam, y across, z out of the face, 0 on
// it); it prints on its side, its section the first layer. Units: mm, N, N m, kg, grams.
import jscad from '@jscad/modeling';
import { SETS } from './catalogue.mjs';
import { profileOf, options, roundConcave, ccw } from './fitting.mjs';
import { nutFor, NUT_KINDS } from './slotnut.mjs';
import { partSetup, weigh, closingFindings, sideToFit } from './panel.mjs';

const { cuboid, cylinder, polygon } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { subtract } = jscad.booleans;
const { translate, transform } = jscad.transforms;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });
const box = (lo, hi) => cuboid({ size: hi.map((h, k) => h - lo[k]), center: hi.map((h, k) => (h + lo[k]) / 2) });
const prism = (loop, h) => extrudeLinear({ height: h }, polygon({ points: ccw(loop) }));

/** The kinds of guide, each with what it is. Only rails are built yet; wheels, rods, sliders, screws and belts follow. */
export const GUIDE_KINDS = {
  rail: { what: 'a miniature linear rail screwed down on a slotted face, its carriages riding on it', sets: 'rail-mgn7, rail-mgn9, rail-mgn12, rail-mgn15' },
};

/** The working figures of the guides, each with what it rests on. */
export const GUIDE_DEFAULTS = {
  endLeast: rule(1, 'mm', 'A rail\'s last hole is at least this far plus its counterbore\'s radius from the rail\'s cut end, so the steel round the hole does not break out', 'estimate', 'A working figure of @rulecad/frames: HIWIN asks for no less than an E-min its catalogue\'s text does not print; check your maker\'s drawing'),
  clear: rule(1, 'mm', 'A rail\'s end stands at least this clear of a beam or fitting that crosses its face', 'default', 'A working figure of @rulecad/frames'),
  combine: rule(1, '', 'A carriage\'s loads are held to its ratings together: its force across the rail over C0, and each moment over its own rating (MR, MP, MY), summed. The sum\'s inverse is its margin: under 1 it fails, under 2 it warns', 'estimate', 'A working rule of @rulecad/frames: HIWIN\'s catalogue rates each load alone; summing them is the cautious way to combine them'),
  across: rule(1, '× C0', 'A carriage takes a force sideways across its rail as it takes one square to the rail\'s face: one C0 for both', 'estimate', 'HIWIN\'s MG catalogue says its gothic arch contact takes load from all directions (2-4-1), and gives one C0; equal ratings each way are an estimate'),
  sag: rule(1, '', 'A beam carrying a guide sags under its own weight and the carriages\' as a beam on two pinned supports at its ends: the worse of pinned and fixed', 'estimate', 'Simply supported beam formulas, 5wL⁴/384EI and PL³/48EI (Roark\'s Formulas for Stress and Strain, table 8.1, cases 1a and 2e); the joins at the ends hold it more than this'),
  jigLength: rule(20, 'mm', 'A rail jig\'s least length along the beam: longer where the push on the rail needs it', 'default', 'A working figure of @rulecad/frames'),
  jigLoad: rule(20, 'N', 'The design load on a rail jig: a hand pushing the rail sideways against it while the screws go in', 'default', 'A working figure of @rulecad/frames'),
  jigKey: rule(1, 'mm', 'The most a rail jig\'s keys reach into the slots of the beam\'s side faces; less where snapping the jig on over them would bend its legs past half the plastic\'s strength', 'estimate', 'A working figure of @rulecad/frames, to be checked by a test print'),
  jigRound: rule(0.6, 'mm', 'The rounding of a rail jig\'s inside corners', 'default', 'A working figure of @rulecad/frames: no square inside corners, and under the beam\'s own corner radius'),
};

const RAILS = () => Object.values(SETS).filter((s) => s.part === 'rail').map((s) => s.name).sort();
/** The rail sets frames knows, by name. @returns {string[]} */
export const rails = () => RAILS();

// a rail's set by name or as given, its variant's values and whole rules laid over its own
function railSet(what, set, variant, given = {}) {
  const s = typeof set === 'string' ? given.sets?.[set] ?? SETS[set] : set;
  if (!s?.rules || s.part !== 'rail') throw new Error(`${what}: rail is a rail's rule set or its name: ${RAILS().join(', ')} (got ${shown(set)})`);
  if (variant == null) return { set: s, rules: s.rules, variant: Object.keys(s.variants ?? {})[0] ?? null };
  const v = s.variants?.[variant];
  if (!v) throw new Error(`${what}: ${s.name} has no carriage ${shown(variant)}: it has ${Object.keys(s.variants ?? {}).join(', ') || 'none'}`);
  return { set: s, variant, rules: { ...s.rules, ...Object.fromEntries(Object.entries(v.values ?? {}).map(([k, value]) => [k, { ...s.rules[k], value, kind: v.kind ?? s.rules[k]?.kind, source: v.source ?? s.rules[k]?.source }])), ...(v.rules ?? {}) } };
}
const fig = (R, k) => R[k]?.value;
const threadRules = (t) => SETS[String(t).toLowerCase().replace('.', '_')]?.rules;

/**
 * A rail cut to a length and its carriages: where its holes fall, the screws, the share of the rail each carriage
 * rides and its travel, its mass and what it adds to the error budget. Refused by name: a set that is no rail, a
 * carriage it does not have, a length past what its maker sells or too short for one hole or for its carriages.
 * @param {string | object} set a rail's rule set or its name (rail-mgn12)
 * @param {{ variant?: string, length: number, carriages?: number, given?: object }} o
 *   variant: the carriage (MGN12C, standard; MGN12H, long); carriages: how many ride it, each its own share
 * @returns {object} its model: rail, carriage, holes, screws, lanes, travel, terms, findings
 */
export function railModel(set, o = {}) {
  const what = 'railModel';
  options(what, o ?? {}, ['variant', 'length', 'carriages', 'given']);
  const { set: s, rules: R, variant } = railSet(what, set, o.variant, o.given), L = o.length, n = o.carriages ?? 1;
  if (!(isNum(L) && L > 0)) throw new Error(`${what}: length is the rail cut to, in mm, above 0 (got ${shown(o.length)})`);
  if (!(Number.isInteger(n) && n >= 1 && n <= 8)) throw new Error(`${what}: carriages is how many carriages ride the rail, a whole number from 1 to 8 (got ${shown(o.carriages)})`);
  const max = fig(R, 'rail_length_max'); if (isNum(max) && L > max + 1e-9) throw new Error(`${what}: ${s.name} is sold up to ${mm(max)} mm in one piece (got ${mm(L)}): two rails butted end to end are two guides`);
  const P = fig(R, 'rail_hole_pitch'), Es = fig(R, 'rail_hole_end'), D = fig(R, 'rail_counterbore_diameter'), least = r3(D / 2 + GUIDE_DEFAULTS.endLeast.value);
  // the holes: as many as leave each end at least `least`, the rest shared between the two ends
  const count = Math.floor((L - 2 * least) / P + 1e-9) + 1;
  if (count < 1 || L < 2 * least) throw new Error(`${what}: a ${mm(L)} mm rail of ${s.name} has room for no hole ${mm(least)} mm from each end: cut it to at least ${mm(2 * least)} mm`);
  const E = r3((L - (count - 1) * P) / 2), holes = Array.from({ length: count }, (_, i) => r3(E + i * P));
  const Lm = fig(R, 'carriage_length_max'), lane = L / n, travel = r3(lane - Lm);
  if (travel <= 0) throw new Error(`${what}: ${n} ${variant ?? s.name} carriage${n > 1 ? 's' : ''} ${mm(Lm)} mm long ${n > 1 ? 'each need' : 'needs'} more than ${n > 1 ? `a ${mm(lane)} mm share of ` : ''}a ${mm(L)} mm rail to move at all: cut it longer than ${mm(n * Lm)} mm`);
  const HR = fig(R, 'rail_height'), h = fig(R, 'rail_counterbore_depth'), thread = fig(R, 'rail_thread');
  const screws = holes.map((x, i) => ({ name: `h${i + 1}`, at: [x, 0, r3(HR - h)], axis: [0, 0, -1], thread, head: 'cap', listed: fig(R, 'rail_screw_length') }));
  const lanes = Array.from({ length: n }, (_, i) => ({ from: r3(i * lane), to: r3((i + 1) * lane), rest: r3(i * lane + Lm / 2), travel }));
  const par = fig(R, 'rail_parallelism'), steps = Array.from({ length: (par?.length ?? 0) / 2 }, (_, i) => [par[2 * i], par[2 * i + 1]]), parallel = steps.length ? (steps.find(([upTo]) => L <= upTo + 1e-9) ?? steps.at(-1))[1] : null;
  const ct = fig(R, 'carriage_thread'), tr = threadRules(ct);
  const carriage = { variant, length: fig(R, 'carriage_length'), lengthMax: Lm, body: fig(R, 'carriage_body_length'), width: fig(R, 'carriage_width'), height: fig(R, 'carriage_height'), clearance: fig(R, 'carriage_clearance'),
    holes: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [r3((a * fig(R, 'carriage_hole_x')) / 2), r3((b * fig(R, 'carriage_hole_y')) / 2)]), thread: ct, depth: fig(R, 'carriage_thread_depth'), tap: tr?.tap_drill?.value ?? null,
    mass: fig(R, 'carriage_mass'), play: fig(R, 'carriage_play'), stiffness: fig(R, 'carriage_stiffness'),
    ratings: { C: fig(R, 'dynamic_rating'), C0: fig(R, 'static_rating'), MR: fig(R, 'moment_roll'), MP: fig(R, 'moment_pitch'), MY: fig(R, 'moment_yaw') } };
  const rail = { width: fig(R, 'rail_width'), height: HR, pitch: P, end: E, standardEnd: Es, least, hole: fig(R, 'rail_hole_diameter'), counterbore: { diameter: D, depth: h }, thread, screwLength: fig(R, 'rail_screw_length'), mass: r3((fig(R, 'rail_mass') * L) / 1000), parallelism: parallel };
  const terms = [
    ...(parallel != null ? [{ term: 'rail parallelism', value: parallel, kind: R.rail_parallelism.kind, note: `${s.name} over ${mm(L)} mm, normal class`, rule: `${s.name}.rail_parallelism` }] : []),
    ...(carriage.play != null ? [{ term: 'carriage play', value: carriage.play, kind: R.carriage_play.kind, note: `${variant ?? s.name}, light clearance (ZF)`, rule: `${s.name}.carriage_play` }] : []),
  ];
  const m = { kind: 'guide', guide: 'rail', name: `${s.name}-${mm(L)}`, title: `${s.name} rail, ${mm(L)} mm, ${n} × ${variant ?? 'carriage'}`, set: s.name, variant, length: L, rail, carriage, holes, screws, lanes, travel, terms, mass: r3(rail.mass + n * (carriage.mass ?? 0)), findings: [],
    rests: ['rail_hole_pitch', 'rail_hole_end', 'carriage_length_max', 'static_rating', 'moment_roll', 'moment_pitch', 'moment_yaw'].map((k) => ({ name: `${s.name}.${k}`, value: R[k].value, kind: R[k].kind })) };
  m.findings.push(finding('info', `${s.name} cut to ${mm(L)} mm: ${count} holes ${mm(P)} mm apart, the first and last ${mm(E)} mm from its ends (its maker's standard end is ${mm(Es)} mm), each an ${thread} cap screw in a ${mm(D)} mm counterbore`, 'guide.holes', { values: { holes: count, pitch: P, end: E } }));
  if (E > P / 2 + 1e-9) m.findings.push(finding('warn', `its end holes are ${mm(E)} mm from its ends, more than half the ${mm(P)} mm pitch: HIWIN advises no more, so its ends stay steady. Cut it to ${mm((count - 1) * P + 2 * Es)} or ${mm(count * P + 2 * Es)} mm for its standard ${mm(Es)} mm ends`, 'guide.end', { values: { end: E, pitch: P, standard: Es } }));
  m.findings.push(finding('info', `${n} ${variant ?? 'carriage'}${n > 1 ? 's' : ''}, ${mm(Lm)} mm long with ${n > 1 ? 'their' : 'its'} seals, ${n > 1 ? `each in its own ${mm(lane)} mm of the rail, ` : ''}travel ${mm(travel)} mm`, 'guide.travel', { values: { carriages: n, lane: r3(lane), travel, length: Lm } }));
  return m;
}

/**
 * A rail's solid in its frame, its counterbored holes cut. @param {object} m railModel's @returns {object} a JSCAD geom3
 */
export function rail(m) {
  if (m?.guide !== 'rail') throw new Error(`rail: give a rail's model (railModel), not ${shown(m)}`);
  const { width: W, height: H, hole, counterbore: c } = m.rail, cuts = m.holes.flatMap((x) => [
    translate([x, 0, H / 2], cylinder({ radius: hole / 2, height: H + 2, segments: 24 })),
    translate([x, 0, H - c.depth / 2 + 0.5], cylinder({ radius: c.diameter / 2, height: c.depth + 1, segments: 32 }))]);
  return Object.assign(subtract(box([0, -W / 2, 0], [m.length, W / 2, H]), ...cuts), { model: m });
}

/**
 * A carriage's solid in its frame (its middle at the origin, on the rail's face): its block over the rail with a
 * channel the rail runs in, and its four tapped holes drawn at the tap drill. @param {object} m railModel's @returns {object}
 */
export function carriage(m) {
  if (m?.guide !== 'rail') throw new Error(`carriage: give a rail's model (railModel), not ${shown(m)}`);
  const c = m.carriage, Lc = c.length, W = c.width, run = 0.2; // (the channel stands this clear of the rail, so the overlap check reads no contact)
  const block = box([-Lc / 2, -W / 2, c.clearance], [Lc / 2, W / 2, c.height]), channel = box([-Lc / 2 - 1, -m.rail.width / 2 - run, -1], [Lc / 2 + 1, m.rail.width / 2 + run, m.rail.height + run]);
  const taps = c.holes.map(([x, y]) => translate([x, y, c.height - c.depth / 2 + 0.25], cylinder({ radius: (c.tap ?? 2.5) / 2, height: c.depth + 0.5, segments: 24 })));
  return Object.assign(subtract(block, channel, ...taps), { model: m });
}

/**
 * A carriage's loads against its ratings: the force square to the rail's face and across it over C0, each moment over
 * its own rating, summed (GUIDE_DEFAULTS.combine). The force along the rail is the drive's, not the carriage's.
 * @param {object} m railModel's
 * @param {{ force: number[], moment: number[] }} load in the carriage's frame: force [along, across, out of the face] in N; moment [roll about x, pitch about y, yaw about z] in N m
 * @returns {{ ratios: { normal: number, roll: number, pitch: number, yaw: number }, sum: number, margin: number, level: 'pass' | 'warn' | 'fail', worst: string }}
 */
export function carriageMargin(m, load) {
  const what = 'carriageMargin';
  if (m?.guide !== 'rail') throw new Error(`${what}: give a rail's model (railModel), not ${shown(m)}`);
  const ok = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
  if (!load || !ok(load.force) || !ok(load.moment)) throw new Error(`${what}: load is { force: [along, across, out], moment: [roll, pitch, yaw] }, in N and N m in the carriage's frame (got ${shown(load)})`);
  const r = m.carriage.ratings, [, Fy, Fz] = load.force, [Mx, My, Mz] = load.moment;
  const ratios = { normal: (Math.abs(Fz) + GUIDE_DEFAULTS.across.value * Math.abs(Fy)) / r.C0, roll: Math.abs(Mx) / r.MR, pitch: Math.abs(My) / r.MP, yaw: Math.abs(Mz) / r.MY };
  const sum = ratios.normal + ratios.roll + ratios.pitch + ratios.yaw, margin = sum > 0 ? 1 / sum : Infinity, worst = Object.entries(ratios).sort((a, b) => b[1] - a[1])[0][0];
  return { ratios: Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, r3(v * 1000) / 1000])), sum, margin, level: margin < 1 ? 'fail' : margin < 2 ? 'warn' : 'pass', worst };
}

/**
 * Whether a rail fits a beam's face, as findings (code guide.fit): its holes over the slot's centre line and its width
 * over the face, its screws' thread suiting a slot nut made for that slot (named, with the kinds there are), and its
 * ends clear of what crosses the face. Fails are said by name with what would fit.
 * @param {object} m railModel's
 * @param {string | object} profile the beam's profile
 * @param {{ face?: string, from?: number, beam?: number, nut?: string, keep?: { from: number, to: number, what: string }[], given?: object }} [o]
 *   from: where the rail starts along the beam, mm from end a; beam: the beam's length; keep: stretches of the face something else holds
 * @returns {{ findings: object[], nut: object | null, face: string, slot: string | null }}
 */
export function guideFit(m, profile, o = {}) {
  const what = 'guideFit';
  if (m?.guide !== 'rail') throw new Error(`${what}: give a rail's model (railModel), not ${shown(m)}`);
  options(what, o ?? {}, ['face', 'from', 'beam', 'nut', 'keep', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), face = o.face ?? 'top', [fname, idx] = String(face).split('.'), place = p.faces[fname]?.[(idx ? +idx : 1) - 1], out = [], f = (level, text, values = {}, refs = {}) => out.push(finding(level, text, 'guide.fit', { values, refs }));
  if (!place) throw new Error(`${what}: ${p.name} has no face ${shown(face)}: a rail goes on top, bottom, front or back, with .2 for a second slot`);
  if (o.nut != null && !NUT_KINDS.includes(o.nut)) throw new Error(`${what}: nut is a kind of slot nut, ${NUT_KINDS.join(', ')} (got ${shown(o.nut)})`);
  const slot = place.slot ? p.slots[place.slot] : null, cell = Math.abs(place.along[0]) > 0.5 ? p.pitch[0] : p.pitch[1], W = m.rail.width;
  if (!slot) { f('fail', `${p.name}'s ${face} face is closed: a rail's screws go into slot nuts, so it goes on a slotted face`, {}, { profile: p.name }); return { findings: out, nut: null, face, slot: null }; }
  // its holes on the slot's centre line by construction; its width bridging the opening and within the face's cell
  if (W <= slot.opening + 1e-9) f('fail', `${m.set}'s ${mm(W)} mm rail is no wider than ${slot.name}'s ${mm(slot.opening)} mm opening: it would sink into the slot. A rail wider than the opening bridges it`, { width: W, opening: slot.opening });
  else if (W > cell + 1e-9) f('fail', `${m.set}'s ${mm(W)} mm rail is wider than the ${mm(cell)} mm face it sits on: it overhangs the beam`, { width: W, face: cell });
  else f('pass', `${m.set}'s ${mm(W)} mm rail bridges ${slot.name}'s ${mm(slot.opening)} mm opening on the ${mm(cell)} mm face, its holes on the slot's centre line`, { width: W, opening: slot.opening, face: cell });
  // its screws into slot nuts made for this slot
  let nut = null;
  try { nut = nutFor(p, face, m.rail.thread, { ...(o.nut ? { kind: o.nut } : {}), given }); }
  catch (e) {
    const there = ['M3', 'M4', 'M5', 'M6', 'M8'].filter((t) => { try { nutFor(p, face, t, { given }); return true; } catch { return false; } });
    f('fail', `no ${m.rail.thread}${o.nut ? ` ${o.nut}` : ''} slot nut is made for ${slot.name}: ${m.set}'s holes take ${m.rail.thread}, and the nuts there take ${there.join(', ') || 'nothing in the catalogue'}. ${String(e.message).replace(/^nutFor: /, '')}`, { thread: m.rail.thread }, { slot: slot.name });
  }
  if (nut) f('pass', `its ${m.holes.length} ${m.rail.thread} screws go into ${nut.name} (${nut.nutKind}), one at each hole ${mm(m.rail.pitch)} mm apart`, { screws: m.holes.length, pitch: m.rail.pitch }, { nut: nut.name, slot: slot.name });
  // its ends on the beam, and clear of what crosses the face
  if (o.from != null) {
    const a = o.from, b = o.from + m.length, cl = GUIDE_DEFAULTS.clear.value;
    if (a < -1e-9 || (o.beam != null && b > o.beam + 1e-9)) f('fail', `the rail runs from ${mm(a)} to ${mm(b)} mm along a beam ${o.beam != null ? `${mm(o.beam)} mm long` : 'from its end a'}: past its end`, { from: a, to: b, beam: o.beam ?? null });
    for (const k of o.keep ?? []) if (k.from - cl < b && k.to + cl > a) f('fail', `the rail, ${mm(a)} to ${mm(b)} mm along the beam, runs into ${k.what} at ${mm(k.from)} to ${mm(k.to)} mm (with ${mm(cl)} mm clear): move it or cut it shorter`, { from: a, to: b, at: [k.from, k.to] }, { what: k.what });
    if (!out.some((x) => x.level === 'fail' && x.values.from != null)) f('pass', `its ends, ${mm(a)} and ${mm(b)} mm along the beam, are on it and clear of ${o.keep?.length ? (o.keep.map((k) => k.what).join(', ')) : 'anything crossing its face'}`, { from: a, to: b });
  }
  return { findings: out, nut, face, slot: slot.name };
}

/**
 * The error a rail adds to a machine's budget along its travel, in mm: its parallelism and its carriage's play from
 * its rule set, the beam's own straightness over the rail from the profile's, and the beam's sag under its own weight
 * and what it carries (GUIDE_DEFAULTS.sag, an estimate). @param {object} m railModel's @param {string | object} profile
 * @param {{ beam: number, carried?: number, given?: object }} o beam: the beam's length; carried: kg on its carriages
 * @returns {{ term: string, value: number, kind: string, note: string }[]}
 */
export function railTerms(m, profile, o = {}) {
  const what = 'railTerms';
  if (m?.guide !== 'rail') throw new Error(`${what}: give a rail's model (railModel), not ${shown(m)}`);
  options(what, o ?? {}, ['beam', 'carried', 'face', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), L = o.beam;
  if (!(isNum(L) && L > 0)) throw new Error(`${what}: beam is the length of the beam the rail is on, in mm (got ${shown(o.beam)})`);
  const out = [...m.terms], st = p.figures.straightness_per_metre;
  if (isNum(st?.value)) out.push({ term: 'beam straightness', value: r3((st.value * m.length) / 1000), kind: st.kind, note: `${p.name}, ${mm(st.value)} mm a metre over the rail's ${mm(m.length)} mm` });
  const across = ['top', 'bottom'].includes(String(o.face ?? 'top').split('.')[0]), I = (across ? p.figures.inertia_x : p.figures.inertia_y)?.value, mod = p.material?.modulus, E = isNum(mod) ? mod : mod?.value;
  const kgm = p.figures.mass_per_metre?.value, carried = (o.carried ?? 0) + m.mass;
  if (isNum(I) && isNum(E) && isNum(kgm)) {
    const w = (kgm * 9.81) / 1000, P = carried * 9.81, sag = (5 * w * L ** 4) / (384 * E * I) + (P * L ** 3) / (48 * E * I);
    out.push({ term: 'beam sag', value: r3(sag), kind: 'estimate', note: `${mm(L)} mm of ${p.name} pinned at its ends, under its own ${mm(kgm)} kg/m and ${mm(carried)} kg at its middle` });
  }
  return out;
}

// ---------- a printed jig that centres a rail on its beam ----------
/**
 * A printed jig that snaps over a beam and the rail laid on it: a key into the slot of each side face holds it on the
 * beam's centre, and a channel over the rail holds the rail there while its screws are tightened. Slide it along as
 * each screw goes in. It prints on its side, its section the first layer, with no supports.
 * @param {string | object} profile the beam's profile
 * @param {{ rail: string | object, face?: string, length?: number, load?: number, printer?: object, material?: string | object, given?: object }} o
 * @returns {object} its model
 */
export function railJigModel(profile, o = {}) {
  const what = 'railJigModel';
  options(what, o ?? {}, ['rail', 'face', 'length', 'load', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o), { set: s, rules: R } = railSet(what, o.rail, null, given);
  const face = o.face ?? 'top', fname = String(face).split('.')[0], sides = fname === 'top' || fname === 'bottom' ? ['front', 'back'] : ['top', 'bottom'];
  if (!p.faces[fname]?.length) throw new Error(`${what}: ${p.name} has no face ${shown(face)}`);
  if (p.faces[fname].length > 1) throw new Error(`${what}: ${p.name}'s ${fname} face has ${p.faces[fname].length} slots: a jig centres a rail on a face of one slot`);
  const keys = sides.map((sd) => { const q = p.faces[sd]?.[0]; if (!q?.slot) throw new Error(`${what}: ${p.name}'s ${sd} face has no slot for the jig to key into`); return { side: sd, slot: p.slots[q.slot], at: q.at }; });
  const F = o.load ?? GUIDE_DEFAULTS.jigLoad.value;
  if (o.length != null && !(isNum(o.length) && o.length >= 8)) throw new Error(`${what}: length is the jig along the beam in mm, at least 8 (got ${shown(o.length)})`);
  if (!(isNum(F) && F > 0)) throw new Error(`${what}: load is the push on the rail it holds, in N, above 0 (got ${shown(o.load)})`);
  // the section across the beam: y across, z out of the face, the face at z = 0, the beam's middle at z = -depth/2
  const across = fname === 'top' || fname === 'bottom' ? p.width : p.height, deep = fname === 'top' || fname === 'bottom' ? p.height : p.width;
  const fit = k.fit, WR = R.rail_width.value, HR = R.rail_height.value, rr = GUIDE_DEFAULTS.jigRound.value, kd = GUIDE_DEFAULTS.jigKey.value;
  const keyW = r3(Math.min(...keys.map((x) => x.slot.opening)) - 2 * fit), lipMin = Math.min(...keys.map((x) => x.slot.lip));
  if (keyW < 2 * k.line) throw new Error(`${what}: ${p.name}'s side slots leave a key ${mm(keyW)} mm wide: too thin to print`);
  // walls three lines; the keys as deep as snapping on allows at twice the margin (a leg l long bent by the key: 3 E t δ / (2 l²)),
  // and the jig as long as the push on the rail allows at twice the margin (6 F l / (w t²) at the leg's root)
  const t = r3(Math.max(Math.ceil((3 * k.line) / 0.1 - 1e-9) * 0.1, 1.2)), l = r3(deep / 2), E = k.mat.rules.modulus.value, half = k.S / 2;
  const key = r3(Math.min(kd, lipMin, Math.floor(((2 * half * l * l) / (3 * E * t)) * 100) / 100));
  if (key < 0.2) throw new Error(`${what}: snapping the jig over ${p.name}'s ${mm(deep)} mm leaves its keys ${mm(key)} mm deep: too little to hold it (a beam this shallow takes a jig slid on from its end)`);
  const len = Math.max(o.length ?? GUIDE_DEFAULTS.jigLength.value, Math.ceil((6 * F * l) / (t * t * half)));
  const yi = r3(across / 2 + fit), yo = r3(yi + t), zc = r3(-deep / 2), zb = r3(zc - keyW / 2 - t), ch = r3(HR + fit + rr), top = r3(ch + t), wc = r3(WR / 2 + fit);
  // legs: from the bridge down past the side slots' middle; a key on each, its tip in the slot
  const loop = [[-yo, zb], [-yi, zb], [-yi, r3(zc - keyW / 2)], [r3(-yi + key), r3(zc - keyW / 2 + key)], [r3(-yi + key), r3(zc + keyW / 2 - key)], [-yi, r3(zc + keyW / 2)], [-yi, 0], [-wc, 0], [-wc, ch], [wc, ch], [wc, 0], [yi, 0],
    [yi, r3(zc + keyW / 2)], [r3(yi - key), r3(zc + keyW / 2 - key)], [r3(yi - key), r3(zc - keyW / 2 + key)], [yi, r3(zc - keyW / 2)], [yi, zb], [yo, zb], [yo, top], [-yo, top]];
  const section = roundConcave(ccw(loop), rr).map(([y, z]) => [r3(y), r3(z)]);
  // what it takes: the push on the rail bends a leg at the bridge (6 F l / (w t²)); snapping on bends it by the key (3 E t δ / (2 l²))
  const bend = r3((6 * F * l) / (len * t * t)), snap = r3((3 * E * t * key) / (2 * l * l)), stress = Math.max(bend, snap), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'rail-jig', name: `rail-jig-${s.name.replace(/^rail-/, '')}-${p.name.replace(/^profile-/, '')}`, title: `printed jig centring ${s.name} on ${p.name}`, profile: p.name, face, rail: s.name, length: len,
    section, bridge: [[-yo, 0], [-wc, 0], [-wc, ch], [wc, ch], [wc, 0], [yo, 0], [yo, top], [-yo, top]], wall: t, key: { width: keyW, depth: key, slots: keys.map((x) => x.slot.name) }, channel: { width: r3(2 * wc), height: ch }, screws: [], anchors: {},
    load: { force: F, what: `${F} N pushing the rail against it, and snapping it on over its ${mm(key)} mm keys` }, stress, margin, size: { length: len, width: r3(2 * yo), height: r3(top - zb), channel: r3(2 * wc) },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: ['jigKey', 'jigLoad', 'jigRound'].map((x) => ({ name: `GUIDE_DEFAULTS.${x}`, value: GUIDE_DEFAULTS[x].value, kind: GUIDE_DEFAULTS[x].kind })) };
  weigh(m, railJig(m), k.density);
  closingFindings(m, { S: k.S, sizeText: `a ${mm(2 * wc)} mm channel over the ${mm(WR)} mm rail (its fit ${mm(fit)} mm each side), keys ${mm(keyW)} mm wide and ${mm(key)} mm into ${keys.map((x) => x.slot.name).join(' and ')}, walls ${mm(t)} mm, ${mm(len)} mm along the beam`, marginText: `under ${m.load.what}, its legs bend to ${mm(stress)} MPa`, pose: 'on its side, its section the first layer' });
  m.findings.push(finding('info', `it centres the rail to within ${mm(2 * fit)} mm (the printer's fit each side, twice): slide it along to each screw as it is tightened`, 'guide.jig', { values: { within: r3(2 * fit) } }));
  return m;
}

/** A rail jig's solid: on its side to print, or fitted. @param {object} m railJigModel's @param {{ pose?: 'print' | 'fit', tongues?: boolean, ops?: object }} [o] @returns {object} */
export function railJig(m, o = {}) {
  if (m?.fitting !== 'rail-jig') throw new Error(`railJig: give a rail jig's model (railJigModel), not ${shown(m)}`);
  // (tongues: false leaves out the legs and keys beside the beam, for an overlap check against the beam's envelope)
  const g = prism(o.tongues === false ? m.bridge : m.section, m.length);
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.length), g) : g, { model: m });
}

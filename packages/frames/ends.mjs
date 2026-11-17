// Printed parts for a beam's end: an end cap pushed into the slots and the bore, a foot and a stacking foot screwed into
// the end's tapped bore, a levelling foot whose pad screws up and down a printed thread (or holds a bought foot's stud
// in a nut), and a castor plate that carries a castor's top plate under the end. Each is drawn from the profile's, the
// thread's and the printer's rules, prints without supports with a plain first layer, and reports its grams and its
// margin at a named load.
//
// The frame of each (its fitted pose) is the end's address frame on the beam (x1.a, x1.b): z out of the end, the
// part on +z from the end's face at z = 0, x along the beam's top (its section's y), y = z × x. Seen from outside end
// a the section lies mirrored, so a section's point (sx, sy) is at (sy, sx) at end a and (sy, -sx) at end b. Units: mm,
// N, grams.
import jscad from '@jscad/modeling';
import { hole, counterbore, nutPocket, thread as printedThread, fixingModel, engagement, DEFAULTS as FIX, nutModel } from '@rulecad/fixings';
import { FITTING_DEFAULTS, options, profileOf, roundConcave, ccw, combine, screwOf } from './fitting.mjs';
import { partSetup, loadOk, weigh, closingFindings, bendMargin } from './panel.mjs';
import { JOIN_TAP } from './join.mjs';

const { polygon, cylinder } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { union } = jscad.booleans, { hull } = jscad.hulls;
const { translate, transform } = jscad.transforms, { offset } = jscad.expansions;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const an = (t) => `${/^(M|[aeiou8])/i.test(String(t)) ? 'an' : 'a'} ${t}`; // (an M5, a 6-32)
const up = (x, step) => Math.ceil(x / step - 1e-9) * step;
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });
const prism = (loop, h) => extrudeLinear({ height: h }, polygon({ points: ccw(loop) }));
const short = (p) => p.name.replace(/^profile-/, '');

/** The working figures of the end parts, each with what it rests on. */
export const END_DEFAULTS = {
  cap: rule(2, 'mm', 'An end cap\'s plate is this thick', 'default', 'A working figure of @rulecad/frames: ten layers, stiff enough to push on by hand'),
  plug: rule(5, 'mm', 'How far an end cap\'s pegs reach into the slots and the bore', 'estimate', 'A working figure of @rulecad/frames, to be checked by a test print'),
  root: rule(0.4, 'mm', 'A peg\'s root is chamfered this much at 45°, so it has no square inside corner', 'default', 'A working figure of @rulecad/frames: the printer\'s chamfer (x1c.chamfer)'),
  rim: rule(2, 'mm', 'A foot reaches this far past the beam\'s outline each way', 'default', 'A working figure of @rulecad/frames'),
  load: rule(250, 'N', 'The design load on one foot or castor where none is given: a quarter of a 100 kg machine with some over', 'default', 'A working figure of @rulecad/frames, so every foot is sized and compared at one named load'),
  stud: rule('M12', '', 'A printed levelling foot\'s thread: coarse enough to print well and to turn by hand', 'default', 'A working figure of @rulecad/frames: @rulecad/fixings prints threads of M6 and over'),
  range: rule(10, 'mm', 'How far a levelling foot\'s pad screws in and out', 'default', 'A working figure of @rulecad/frames'),
  engage: rule(1, '× diameter', 'A levelling foot\'s pad keeps at least this much of its thread engaged at its lowest', 'estimate', 'A working figure of @rulecad/frames: a printed thread\'s engagement'),
  socket: rule(5, 'mm', 'How deep a stacking foot\'s socket goes over the end of the beam below', 'default', 'A working figure of @rulecad/frames'),
};

// The end's place of a section's point
const toEnd = (end) => (end === 'b' ? ([sx, sy]) => [sy, -sx] : ([sx, sy]) => [sy, sx]);
function endSetup(what, profile, o, keys) {
  options(what, o ?? {}, keys);
  const end = o.end ?? 'a';
  if (!['a', 'b'].includes(end)) throw new Error(`${what}: end is a or b, the beam's end it goes on (got ${shown(o.end)})`);
  const p = profileOf(what, profile, o.given ?? {}), k = partSetup(what, o);
  const rect = (m, rad) => { const hw = p.width / 2 + m, hh = p.height / 2 + m, map = toEnd(end); return roundRect([[-hw, -hh], [hw, hh]], rad).map(map); };
  return { end, p, k, rect, map: toEnd(end) };
}
// A rectangle [lo, hi] with its corners rounded r, as a loop
function roundRect([[x0, y0], [x1, y1]], r, n = 6) {
  if (!(r > 0)) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const out = [], cs = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  for (const [cx, cy, a0] of cs) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
// The end's tapped bore: refused by name where the profile has none
function boreOf(what, p) {
  const b = (p.bores ?? []).find((x) => x.thread);
  if (!b) throw new Error(`${what}: ${p.name} has no bore with a thread in its end, so nothing screws into it: an end cap pushes in, or a bracket holds the end`);
  if ((p.bores ?? []).filter((x) => x.thread).length > 1) throw new Error(`${what}: ${p.name} has ${p.bores.length} end bores: a foot is drawn for one in the middle`);
  return b;
}
// The screw into the end's bore through a floor f thick: the shortest sold that engages the aluminium as fixings asks
// and stops short of a tap as deep as a join's (JOIN_TAP)
function endScrew(thread, f) {
  const fx = fixingModel(thread), need = engagement(thread, { depth: 1, material: 'aluminium' }).need, tap = r3(need + FIX.tip_room.value + JOIN_TAP.value * fx.major);
  const L = [...(fx.figures.lengths?.value ?? [])].sort((a, b) => a - b).find((x) => x >= f + need - 1e-9 && x <= f + tap + 1e-9) ?? null;
  return { thread: fx.thread, need: r3(need), tap, length: L };
}
// A peg's root: a 45° chamfer r round its foot (a hull of the peg's outline grown by r at z0 and the outline at z0 + r)
function rooted(loop, h, r, z0 = 0) {
  const g = polygon({ points: ccw(loop) }), wide = offset({ delta: r, corners: 'chamfer' }, g);
  const slab = (s, z) => translate([0, 0, z], extrudeLinear({ height: 0.01 }, s));
  return union(translate([0, 0, z0], extrudeLinear({ height: h }, g)), hull(slab(wide, z0), slab(g, z0 + r)));
}
function ending(m, k, fits) {
  if (fits) m.findings.unshift(finding(fits.length ? 'pass' : 'warn', fits.length ? `${fits.thread}x${fits.length} cap into the end's tapped bore: through ${mm(fits.floor)} mm of floor, ${mm(fits.need)} mm or more into the aluminium, inside a tap ${mm(fits.tap)} mm deep (the beam's end is tapped ${fits.thread} that deep: a tap op at its bore)` : `no ${fits.thread} cap screw sold reaches ${mm(fits.need)} mm into the tapped end and stops inside a ${mm(fits.tap)} mm tap: the fasten check chooses`, 'fitting.screw', { values: { length: fits.length, need: fits.need, tap: fits.tap, floor: fits.floor } }));
  void k;
}

// ---------- an end cap ----------
/**
 * A printed end cap: a plate the size of the beam's outline, pegs pushed into each slot's opening and into the end's
 * bore, their roots chamfered. It prints plate down, pegs up. @param {string | object} profile
 * @param {{ end?: 'a' | 'b', thickness?: number, printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model
 */
export function endCapModel(profile, o = {}) {
  const what = 'endCapModel', { end, p, k, rect, map } = endSetup(what, profile, o, ['end', 'thickness', 'printer', 'material', 'given']);
  const t = o.thickness ?? END_DEFAULTS.cap.value;
  if (!(isNum(t) && t >= 2 * k.layer)) throw new Error(`${what}: thickness is the plate's, in mm, two layers or more (got ${shown(o.thickness)})`);
  const pegs = [];
  for (const face of ['top', 'bottom', 'front', 'back']) for (const pl of p.faces[face] ?? []) {
    if (!pl.slot) continue;
    const s = p.slots[pl.slot], a = s.opening / 2 - k.fit, n0 = -(s.lip), n1 = -k.fit, P = (u, v) => [pl.at[0] + pl.along[0] * u + pl.normal[0] * v, pl.at[1] + pl.along[1] * u + pl.normal[1] * v];
    if (a > k.line && s.lip > 2 * k.fit) pegs.push({ slot: pl.slot, loop: [P(-a, n0), P(a, n0), P(a, n1), P(-a, n1)].map(map) });
  }
  for (const b of p.bores ?? []) pegs.push({ bore: true, loop: Array.from({ length: 24 }, (_, i) => { const r = b.diameter / 2 - k.fit / 2, q = (i / 24) * 2 * Math.PI; return [b.at[0] + r * Math.cos(q), b.at[1] + r * Math.sin(q)]; }).map(map) });
  const m = { kind: 'fitting', fitting: 'end-cap', name: `end-cap-${short(p)}`, title: `printed end cap for ${short(p)}`, profile: p.name, end, thickness: t, plug: END_DEFAULTS.plug.value, outline: rect(-k.fit / 2, Math.max(0, (p.cornerRadius ?? 0))), pegs,
    screws: [], load: { force: 0, what: 'none: it is pushed on' }, stress: 0, margin: Infinity, size: { thickness: t, pegs: pegs.length, plug: END_DEFAULTS.plug.value }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: ['cap', 'plug', 'root'].map((x) => ({ name: `END_DEFAULTS.${x}`, value: END_DEFAULTS[x].value, kind: END_DEFAULTS[x].kind })) };
  weigh(m, endCap(m), k.density);
  m.findings.push(finding('info', `${m.title}: a ${mm(t)} mm plate the beam's outline less half the fit, ${pegs.filter((x) => x.slot).length} pegs ${mm(m.plug)} mm into the slots' openings and ${pegs.some((x) => x.bore) ? 'one into the bore' : 'no bore'}, each the opening less the fit (an estimate of a push fit: try one)`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding('info', 'it is drawn to print plate down, its pegs up, their roots chamfered 45°: a plain first layer, no supports', 'fitting.printable', { values: { pose: 'plate down' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  return m;
}
/**
 * An end cap's solid: plate down, pegs up to print (pose 'print'), or fitted on the end (pose 'fit'), its pegs into
 * the beam. @param {object} m @param {{ pose?: 'print' | 'fit' }} [o] @returns {object}
 */
export function endCap(m, o = {}) {
  if (m?.fitting !== 'end-cap') throw new Error(`endCap: give an end cap's model (endCapModel), not ${shown(m)}`);
  const t = m.thickness, flip = (pts) => pts.map(([x, y]) => [x, -y]);
  const g = union(prism(flip(m.outline), t), ...m.pegs.map((q) => rooted(flip(q.loop), m.plug, END_DEFAULTS.root.value, t)));
  return Object.assign(o.pose === 'fit' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, t, 1], g) : g, { model: m });
}

// ---------- feet ----------
// A pad on the end: the outline grown by rim, a counterbore for the screw into the end's bore from its far side
function padModel(what, kind, profile, o, keys) {
  const { end, p, k, rect, map } = endSetup(what, profile, o, keys), b = boreOf(what, p);
  loadOk(what, o.load, 'the force on the foot, down the beam');
  const F = o.load ?? END_DEFAULTS.load.value, sc = screwOf(what, b.thread, 'cap', k.pr), rim = END_DEFAULTS.rim.value;
  return { end, p, k, rect, map, b, F, sc, rim };
}

/**
 * A printed foot under a beam's end: a pad the beam's outline and a rim wider, screwed into the end's tapped bore
 * through a counterbore in its underside. It prints as it stands, the beam's side down. Its margin is the plastic's
 * strength over the bearing stress under the named load.
 * @param {string | object} profile @param {{ end?: 'a' | 'b', load?: number, printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model: screws (into the bore), ops (the tap the beam's end needs)
 */
export function footModel(profile, o = {}) {
  const what = 'footModel', s = padModel(what, 'foot', profile, o, ['end', 'load', 'printer', 'material', 'given']), { p, k, b, F, sc, rim } = s;
  const floor = Math.max(up(FITTING_DEFAULTS.least.value * sc.major, k.layer), up(4 * k.layer, k.layer)), sink = up((fixingModel(b.thread).figures.head_height?.value ?? sc.major) + 0.5, k.layer), t = r3(floor + sink);
  const area = (p.width + 2 * rim) * (p.height + 2 * rim) - (Math.PI * (sc.dk + 1) ** 2) / 4, stress = r3(F / area), margin = r3(k.S / stress), fits = { ...endScrew(b.thread, floor), floor };
  const at = s.map(b.at);
  const m = { kind: 'fitting', fitting: 'foot', name: `foot-${short(p)}`, title: `printed foot for ${short(p)}`, profile: p.name, end: s.end, thread: b.thread, thickness: t, floor, sink, rim, outline: s.rect(rim, rim + (p.cornerRadius ?? 0)), bore: at,
    screws: [{ thread: b.thread, head: 'cap', grip: floor, at: [at[0], at[1], floor], axis: [0, 0, -1], into: 'bore', length: fits.length }], ops: [{ op: 'tap', at: s.end, thread: b.thread, depth: fits.tap }],
    load: { force: F, what: `${F} N down the beam onto the floor` }, stress, margin, size: { thickness: t, floor, rim }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['rim', 'load'].map((x) => ({ name: `END_DEFAULTS.${x}`, value: END_DEFAULTS[x].value, kind: END_DEFAULTS[x].kind }))] };
  weigh(m, foot(m, { printer: k.pr }), k.density);
  ending(m, k, fits);
  closingFindings(m, { S: k.S, sizeText: `${mm(t)} mm thick (a ${mm(floor)} mm floor under a ${mm(sink)} mm counterbore for the head), ${mm(rim)} mm past the beam each way`, marginText: `under ${m.load.what}, it bears at ${mm(stress)} MPa`, pose: 'as it stands, the beam\'s side down, its counterbore opening up' });
  return m;
}
/** A foot's solid, as it prints and as it is fitted (the same pose). @param {object} m @param {{ printer?: object, pose?: string }} [o] @returns {object} */
export function foot(m, o = {}) {
  if (m?.fitting !== 'foot') throw new Error(`foot: give a foot's model (footModel), not ${shown(m)}`);
  const pr = o.printer, cb = counterbore(m.thread, { head: 'cap', depth: m.sink + 0.01, length: m.thickness + 2, into: '-z', at: [m.bore[0], m.bore[1], m.thickness], ...(pr ? { printer: pr } : {}) });
  return Object.assign(combine([prism(m.outline, m.thickness)], [cb], o.ops), { model: m });
}

/**
 * A printed levelling foot: a body screwed to the end's tapped bore, and a pad that screws up and down in it, on a
 * printed thread (stud 'printed', default, M12 from @rulecad/fixings' threads) or a bought levelling foot's stud held
 * in a hex nut sunk in the body (stud: its thread, as 'M8'). The body's screw goes in first, through the stud's bore.
 * Both parts print as they stand, threads upright.
 * @param {string | object} profile @param {{ end?: 'a' | 'b', stud?: string, range?: number, load?: number, printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model: parts body and pad (or the bought stud), range, screws, ops
 */
export function levellingFootModel(profile, o = {}) {
  const what = 'levellingFootModel', s = padModel(what, 'levelling', profile, o, ['end', 'stud', 'range', 'load', 'printer', 'material', 'given']), { p, k, b, F, sc } = s;
  const printed = o.stud == null || o.stud === 'printed', stud = printed ? END_DEFAULTS.stud.value : o.stud, range = o.range ?? END_DEFAULTS.range.value;
  if (!(isNum(range) && range > 0 && range <= 40)) throw new Error(`${what}: range is how far the pad screws in and out, in mm, above 0 and up to 40 (got ${shown(o.range)})`);
  let st; try { st = fixingModel(stud); } catch (e) { throw new Error(`${what}: stud is 'printed' or a bought foot's thread, as 'M8' (got ${shown(o.stud)}): ${String(e.message).replace(/^\w+: /, '')}`); }
  const head = fixingModel(b.thread).figures.head_height?.value ?? sc.major;
  if (st.major * 0.8 < sc.dk + 2 * k.fit && printed) throw new Error(`${what}: an ${stud} stud's bore is too small for ${b.thread}'s ${mm(sc.dk)} mm head to pass: a coarser stud`);
  const floor = up(Math.max(FITTING_DEFAULTS.least.value * sc.major, 4 * k.layer), k.layer), well = up(head + 0.5, k.layer), engage = r3(END_DEFAULTS.engage.value * st.major);
  const nutH = printed ? 0 : nutModel(stud).height, threadLen = r3(engage + range), height = r3(floor + well + threadLen + (printed ? 0 : 0)), wall = up(3 * k.line, 0.1) * 2;
  const across = r3(Math.max(Math.min(p.width, p.height), st.major + 2 * wall + (printed ? 0 : st.major * 0.8))), pad = r3(across + 2 * s.rim);
  const fits = { ...endScrew(b.thread, floor), floor }, at = s.map(b.at);
  // the pad's stem in bending at its root under a side push of a tenth of the load, as on uneven ground
  // printed: the pad's stem bent at its root by a side push of a tenth of the load, as on uneven ground; bought (a steel
  // stud): the body's floor bearing the load
  const side = F / 10, root = st.major * 0.8, stress = r3(printed ? (32 * side * threadLen) / (Math.PI * root ** 3) : F / ((Math.PI / 4) * (across ** 2 - (st.major + 0.6) ** 2))), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'levelling-foot', name: `levelling-foot-${short(p)}-${printed ? `printed-${stud.toLowerCase()}` : stud.toLowerCase()}`, title: `printed levelling foot for ${short(p)}, ${printed ? `a printed ${stud} thread` : `a bought ${stud} stud`}`,
    profile: p.name, end: s.end, thread: b.thread, stud, printed, range, engage, floor, well, height: r3(floor + well + threadLen + (printed ? 0 : nutH)), across, pad, bore: at, nut: printed ? null : nutModel(stud).name,
    parts: printed ? ['body', 'pad'] : ['body'], screws: [{ thread: b.thread, head: 'cap', grip: floor, at: [at[0], at[1], floor], axis: [0, 0, -1], into: 'bore', length: fits.length }], ops: [{ op: 'tap', at: s.end, thread: b.thread, depth: fits.tap }],
    hardware: printed ? [] : [{ kind: 'nut', name: nutModel(stud).name, thread: stud, count: 1 }, { kind: 'foot', name: `a levelling foot on an ${stud} stud`, thread: stud, count: 1 }],
    load: { force: F, what: printed ? `${F} N down the foot, and a tenth of it across the pad's stem` : `${F} N down the stud's nut onto the body` }, stress, margin, size: { height: r3(floor + well + threadLen + nutH), range, across }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['stud', 'range', 'engage', 'load'].map((x) => ({ name: `END_DEFAULTS.${x}`, value: END_DEFAULTS[x].value, kind: END_DEFAULTS[x].kind }))] };
  weigh(m, levellingFoot(m, { printer: k.pr }), k.density);
  if (printed) { const pg = levellingFoot(m, { part: 'pad', printer: k.pr }); m.padGrams = r3((jscad.measurements.measureVolume(pg) * k.density) / 1000); m.grams = r3(m.grams + m.padGrams); }
  ending(m, k, fits);
  closingFindings(m, { S: k.S, sizeText: `a body ${mm(across)} mm across and ${mm(floor + well + (printed ? threadLen : nutH + range))} mm high, ${printed ? `its ${stud} thread printed, the pad's stem ${mm(threadLen)} mm: ${mm(range)} mm of travel with ${mm(engage)} mm always engaged` : `an ${stud} nut sunk in its top for the bought foot's stud`}`, marginText: `under ${m.load.what}, ${printed ? 'the stem bends' : 'the body bears'} to ${mm(stress)} MPa`, pose: `as they stand, threads upright${printed ? ', the pad on its foot' : ''}` });
  return m;
}
/**
 * A levelling foot's solid: the body (part 'body', default) or the pad (part 'pad'), each as it prints; fitted, the
 * pad sits screwed in at the middle of its range. @param {object} m @param {{ part?: 'body' | 'pad', pose?: 'print' | 'fit', printer?: object }} [o] @returns {object}
 */
export function levellingFoot(m, o = {}) {
  if (m?.fitting !== 'levelling-foot') throw new Error(`levellingFoot: give a levelling foot's model (levellingFootModel), not ${shown(m)}`);
  const part = o.part ?? 'body', pr = o.printer, fx = pr ? { printer: pr } : {}, [cx, cy] = m.bore, R = m.across / 2;
  if (!['body', 'pad'].includes(part) || (part === 'pad' && !m.printed)) throw new Error(`levellingFoot: part is body${m.printed ? ' or pad' : ''} (got ${shown(o.part)})`);
  const st = fixingModel(m.stud), body = m.floor + m.well + (m.printed ? m.engage + m.range : nutModel(m.stud).height + m.range);
  if (part === 'body') {
    const outer = translate([cx, cy, 0], cylinder({ radius: R, height: body, center: [0, 0, body / 2], segments: 48 }));
    const cuts = [counterbore(m.thread, { head: 'cap', depth: m.well + 0.01, diameter: st.major * 0.8, length: m.floor + m.well + 2, into: '-z', at: [cx, cy, m.floor + m.well], ...fx })];
    if (m.printed) cuts.push(translate([cx, cy, m.floor + m.well], printedThread(m.stud, { length: body - m.floor - m.well, internal: true, ...fx })));
    else cuts.push(nutPocket(m.stud, { at: [cx, cy, body], into: '-z', ...fx }), translate([cx, cy, m.floor + m.well - 0.01], cylinder({ radius: st.major / 2 + 0.3, height: body, center: [0, 0, body / 2], segments: 32 })));
    return Object.assign(combine([outer], cuts, o.ops), { model: m });
  }
  const foot = cylinder({ radius: m.pad / 2, height: 4, center: [0, 0, 2], segments: 48 }), chamfer = hull(translate([0, 0, 4], cylinder({ radius: m.pad / 2, height: 0.01, segments: 48 })), translate([0, 0, 4 + (m.pad - st.major) / 2 * 0.5], cylinder({ radius: st.major / 2, height: 0.01, segments: 48 })));
  const stem = translate([0, 0, 4], printedThread(m.stud, { length: m.engage + m.range, ...fx }));
  const g = union(foot, chamfer, stem);
  return Object.assign(o.pose === 'fit' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, cx, cy, body + m.range / 2 + 4, 1], g) : g, { model: m });
}

/**
 * A printed castor plate: a plate under a beam's end that a castor's top plate bolts to, screwed into the end's tapped
 * bore through a counterbore on its castor side. The castor's holes are given (its maker's drawing): they must lie
 * outside the beam's outline by a head, so the bolts' heads sit on the plate's top beside the beam and the nuts under
 * the castor's plate. Sized from the named load, half of it on each pair of bolts, bending the plate from the beam's
 * edge. It prints its beam side down.
 * @param {string | object} profile @param {{ holes: number[], thread: string, end?: 'a' | 'b', load?: number, printer?: object, material?: string | object, given?: object }} o
 *   holes: [x, y] the castor's hole spacing, from its maker's drawing; thread: its bolts'
 * @returns {object} its model
 */
export function castorPlateModel(profile, o = {}) {
  const what = 'castorPlateModel', s = padModel(what, 'castor', profile, o ?? {}, ['holes', 'thread', 'end', 'load', 'printer', 'material', 'given']), { p, k, b, F, sc } = s;
  if (!(Array.isArray(o.holes) && o.holes.length === 2 && o.holes.every((x) => isNum(x) && x > 0))) throw new Error(`${what}: holes is the castor's hole spacing [x, y] in mm, from its maker's drawing (got ${shown(o.holes)})`);
  if (typeof o.thread !== 'string') throw new Error(`${what}: thread is the castor's bolts', as 'M6' (got ${shown(o.thread)})`);
  const bolt = screwOf(what, o.thread, 'cap', k.pr), [hx, hy] = o.holes.map((x) => x / 2), half = Math.max(p.width, p.height) / 2;
  const need = half + bolt.dk / 2 + FITTING_DEFAULTS.reach.value;
  if (Math.min(hx, hy) < need - 1e-9) throw new Error(`${what}: the castor's holes ${mm(o.holes[0])} x ${mm(o.holes[1])} mm apart lie ${mm(Math.min(hx, hy))} mm from the middle, under the beam's outline and ${an(o.thread)} head (${mm(need)} mm): its bolts' heads would sit under the beam. A castor with wider holes, or a plate between`);
  const endBy = Math.max(FITTING_DEFAULTS.end.value * bolt.hd, bolt.dk / 2 + FITTING_DEFAULTS.reach.value), X = r3(hx + endBy), Y = r3(hy + endBy);
  const M = (F / 2) * (Math.min(hx, hy) - half), width = 2 * Math.max(X, Y), head = fixingModel(b.thread).figures.head_height?.value ?? sc.major;
  const sink = up(head + 0.5, k.layer), floor = Math.max(up(FITTING_DEFAULTS.least.value * sc.major, k.layer), up(Math.sqrt((6 * M * FITTING_DEFAULTS.margin.value) / (width * k.S)), k.layer));
  const t = r3(floor + sink), stress = r3((6 * M) / (width * t * t)), margin = r3(bendMargin(M, width, t, k.S)), fits = { ...endScrew(b.thread, floor), floor }, at = s.map(b.at);
  const corners = [[hx, hy], [-hx, hy], [-hx, -hy], [hx, -hy]];
  const m = { kind: 'fitting', fitting: 'castor-plate', name: `castor-plate-${short(p)}-${mm(o.holes[0])}x${mm(o.holes[1])}-${o.thread.toLowerCase()}`, title: `printed castor plate for ${short(p)}, castor holes ${mm(o.holes[0])} x ${mm(o.holes[1])} mm, ${o.thread}`,
    profile: p.name, end: s.end, thread: b.thread, bolt: o.thread, holes: o.holes, thickness: t, floor, sink, outline: roundRect([[-X, -Y], [X, Y]], 2), bore: at,
    screws: [{ thread: b.thread, head: 'cap', grip: floor, at: [at[0], at[1], 0], axis: [0, 0, 1], into: 'bore', length: fits.length }, ...corners.map(([x, y]) => ({ thread: o.thread, head: 'cap', grip: t, at: [x, y, 0], axis: [0, 0, 1], into: 'castor' }))],
    ops: [{ op: 'tap', at: s.end, thread: b.thread, depth: fits.tap }], load: { force: F, what: `${F} N up the castor, half on each pair of its bolts, ${mm(Math.min(hx, hy) - half)} mm past the beam's edge` }, stress, margin, size: { thickness: t, x: 2 * X, y: 2 * Y },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: [{ name: `${k.mat.name}.strength`, value: k.S }, { name: 'END_DEFAULTS.load', value: END_DEFAULTS.load.value, kind: END_DEFAULTS.load.kind }] };
  weigh(m, castorPlate(m, { printer: k.pr }), k.density);
  // (its screw into the end goes in from the castor's side, before the castor)
  ending(m, k, fits);
  closingFindings(m, { S: k.S, sizeText: `${mm(2 * X)} x ${mm(2 * Y)} mm, ${mm(t)} mm thick, a counterbore ${mm(sink)} mm deep on its castor side for the screw into the end, four ${o.thread} holes for the castor`, marginText: `under ${m.load.what}, it bends at the beam's edge to ${mm(stress)} MPa`, pose: 'its beam side down, the counterbore opening up' });
  return m;
}
/** A castor plate's solid: beam side down to print; fitted, on the end with its castor side out. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object }} [o] @returns {object} */
export function castorPlate(m, o = {}) {
  if (m?.fitting !== 'castor-plate') throw new Error(`castorPlate: give a castor plate's model (castorPlateModel), not ${shown(m)}`);
  const pr = o.printer ? { printer: o.printer } : {}, t = m.thickness, [hx, hy] = m.holes.map((x) => x / 2);
  const cuts = [counterbore(m.thread, { head: 'cap', depth: m.sink + 0.01, length: t + 2, into: '-z', at: [m.bore[0], m.bore[1], t], ...pr }), ...[[hx, hy], [-hx, hy], [-hx, -hy], [hx, -hy]].map(([x, y]) => hole(m.bolt, { kind: 'clearance', into: '-z', depth: t + 2, at: [x, y, t + 1], ...pr }))];
  return Object.assign(combine([prism(m.outline, t)], cuts, o.ops), { model: m });
}

/**
 * A printed stacking foot: a plate on a beam's end, screwed into its tapped bore, with a socket under it that fits
 * over the end of a beam of the same profile below, so one frame stands on another. Its socket's corners are rounded
 * as the beam's, with the fit. It prints its beam side down, the socket up.
 * @param {string | object} profile @param {{ end?: 'a' | 'b', depth?: number, load?: number, printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model
 */
export function stackingFootModel(profile, o = {}) {
  const what = 'stackingFootModel', s = padModel(what, 'stacking', profile, o ?? {}, ['end', 'depth', 'load', 'printer', 'material', 'given']), { p, k, b, F, sc } = s;
  const depth = o.depth ?? END_DEFAULTS.socket.value;
  if (!(isNum(depth) && depth > 0)) throw new Error(`${what}: depth is the socket's, in mm, above 0 (got ${shown(o.depth)})`);
  const head = fixingModel(b.thread).figures.head_height?.value ?? sc.major, wall = up(3 * k.line, 0.1), floor = up(Math.max(FITTING_DEFAULTS.least.value * sc.major, 4 * k.layer), k.layer), sink = up(head + 0.5, k.layer);
  const t = r3(floor + sink + depth), fits = { ...endScrew(b.thread, floor), floor }, at = s.map(b.at);
  const area = 2 * (p.width + p.height + 4 * k.fit) * wall, stress = r3(F / ((p.width + 2 * wall) * (p.height + 2 * wall) - Math.PI * (sc.dk / 2 + 0.5) ** 2)), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'stacking-foot', name: `stacking-foot-${short(p)}`, title: `printed stacking foot for ${short(p)}`, profile: p.name, end: s.end, thread: b.thread, thickness: t, floor, sink, depth, wall,
    outline: s.rect(k.fit + wall, (p.cornerRadius ?? 0) + k.fit + wall), socket: s.rect(k.fit, (p.cornerRadius ?? 0) + k.fit), bore: at, wallArea: r3(area),
    screws: [{ thread: b.thread, head: 'cap', grip: floor, at: [at[0], at[1], floor], axis: [0, 0, -1], into: 'bore', length: fits.length }], ops: [{ op: 'tap', at: s.end, thread: b.thread, depth: fits.tap }],
    load: { force: F, what: `${F} N of the frame above on the beam below, through the floor` }, stress, margin, size: { thickness: t, depth, wall }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['socket', 'load'].map((x) => ({ name: `END_DEFAULTS.${x}`, value: END_DEFAULTS[x].value, kind: END_DEFAULTS[x].kind }))] };
  weigh(m, stackingFoot(m, { printer: k.pr }), k.density);
  ending(m, k, fits);
  closingFindings(m, { S: k.S, sizeText: `${mm(t)} mm thick: a ${mm(floor)} mm floor, a ${mm(sink)} mm counterbore for the head, a socket ${mm(depth)} mm deep the beam's outline and the fit, its wall ${mm(wall)} mm`, marginText: `under ${m.load.what}, it bears at ${mm(stress)} MPa`, pose: 'its beam side down, the socket up' });
  return m;
}
/** A stacking foot's solid: beam side down to print, as it is fitted. @param {object} m @param {{ printer?: object }} [o] @returns {object} */
export function stackingFoot(m, o = {}) {
  if (m?.fitting !== 'stacking-foot') throw new Error(`stackingFoot: give a stacking foot's model (stackingFootModel), not ${shown(m)}`);
  const pr = o.printer ? { printer: o.printer } : {}, t = m.thickness;
  const cuts = [translate([0, 0, t - m.depth], prism(m.socket, m.depth + 1)), counterbore(m.thread, { head: 'cap', depth: m.sink + 0.01, length: m.floor + m.sink + 2, into: '-z', at: [m.bore[0], m.bore[1], m.floor + m.sink], ...pr })];
  return Object.assign(combine([prism(m.outline, t)], cuts, o.ops), { model: m });
}

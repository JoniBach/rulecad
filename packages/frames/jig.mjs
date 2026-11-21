// Jigs: printed parts that put a beam's cut-and-drill sheet on the metal with hand tools. A drill guide stops on the
// beam's end, keys into the slot of the face it drills and holds a bush for the drill where the sheet dimensions the
// hole. A tap guide caps an end and holds a tap square to it over each bore. A cut-length stop sits against a saw's
// fence, set from the blade by a printed gauge as long as the cut. A squaring corner lies on two beams' faces in one
// plane, keyed into both slots, and holds them at a right angle while a join is tightened. Each is drawn from the
// profile's and the printer's rules, prints without supports on a plain first layer, and reports its grams and its
// margin at a named load.
//
// Print frames: X and Y on the bed, Z up from it. A drill guide: X across the face (0 on the slot's centre line), Y
// along the beam from its end (0 at the end the stop is on), Z from its outer face (on the bed) toward the beam; its
// contact face is at Z = t. A tap guide: X and Y the section's (end a; mirrored in X for end b), Z from its outer face
// toward the beam. A length stop: X along the fence (the stop face at X = 0), Y out from the fence, Z up from the saw's
// table. A squaring corner: X along beam b, Y along beam a (b's face that a meets at Y = 0), Z from its outer face;
// its contact face is at Z = t. Units: mm, N, degrees, grams.
import jscad from '@jscad/modeling';
import { outline } from './profile.mjs';
import { workOrder } from './beam.mjs';
import { profileOf, options, roundConcave, ccw, combine, tongueLoop, pfig, FITTING_DEFAULTS } from './fitting.mjs';
import { partSetup, weigh, closingFindings } from './panel.mjs';

const { polygon, cylinder, cylinderElliptic, roundedRectangle } = jscad.primitives, { extrudeLinear } = jscad.extrusions;
const { subtract, union, intersect } = jscad.booleans, { translate, transform } = jscad.transforms, { hull } = jscad.hulls;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const up = (x, step) => r3(Math.ceil(x / step - 1e-9) * step);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });
const short = (name) => String(name).replace(/^profile-/, '');
const deg = (r) => (r * 180) / Math.PI;

/** The kinds of jig, each with what it is for. */
export const JIG_KINDS = {
  'drill-guide': { what: 'a guide for a hand drill: it stops on the beam\'s end, keys into the face\'s slot and holds a bush where the sheet puts the hole', ops: ['access', 'drill', 'counterbore'] },
  'tap-guide': { what: 'a cap over a beam\'s end that holds a tap square to it over each bore to be tapped', ops: ['tap'] },
  'length-stop': { what: 'a stop block against a saw\'s fence or a mitre box\'s back, set from the blade by a printed gauge as long as the cut', ops: ['cut'] },
  'square-corner': { what: 'an L that lies on two beams\' faces in one plane, keyed into both slots, holding them square while a join is tightened', ops: [] },
};

/** The working figures of the jigs, each with what it rests on. */
export const JIG_DEFAULTS = {
  load: rule(20, 'N', 'The design load on a jig: a hand pressing it on, or a drill or tap pushing sideways in its bush', 'estimate', 'A working figure of @rulecad/frames, the same as the rail jig\'s (GUIDE_DEFAULTS.jigLoad)'),
  bush: rule(2, '× diameter', 'A bush guides its drill or tap over this many of the tool\'s diameters, so a play of the printer\'s slip tilts it little', 'estimate', 'Workshop practice for a drill bush\'s length, one to two diameters; not checked against a standard (DIN 179 and ISO 4247 give bush lengths)'),
  stop: rule(0.5, '× depth', 'A drill guide\'s stop reaches this share of the beam\'s depth down its end', 'default', 'A working figure of @rulecad/frames'),
  within: rule(0.05, 'mm', 'The most a drill guide\'s stop may bend under the load, so pressing the guide on does not move the hole', 'default', 'A working figure of @rulecad/frames, a tenth of the cut\'s ±0.5 mm'),
  shank: rule(1, '× major', 'A tap\'s shank is taken as wide as its thread\'s major diameter, so the guide\'s bore passes it: give the shank of your tap where it is wider', 'estimate', 'Hand taps (DIN 352) commonly have a shank near the major diameter; machine taps (DIN 371) are wider. Not checked against the standards'),
  sleeve: rule(0.5, '× section', 'A tap guide\'s sleeve runs this share of the section\'s smaller side down the beam, to centre it on the end', 'default', 'A working figure of @rulecad/frames'),
  arm: rule(3, '× face', 'Each arm of a squaring corner runs this many times the face\'s width past the corner, so its tongues are long beside the play in the slots', 'estimate', 'A working figure of @rulecad/frames'),
  plate: rule(2, 'mm', 'The least thickness of a squaring corner\'s plate, so it stays flat under a hand', 'estimate', 'A working figure of @rulecad/frames'),
  square: rule(0.5, '°', 'How near square a squaring corner holds two beams: the play of its tongues in both slots. The same figure cad\'s join.geometry holds a join to (JOIN_CHECK.square)', 'default', 'A working figure of @rulecad/cad, mirrored here'),
  block: rule(12, 'mm', 'A length stop\'s block along the fence: room for a spring clamp\'s jaw', 'default', 'A working figure of @rulecad/frames'),
  gauge: rule(10, 'mm', 'A length gauge\'s width; it is six tenths of this thick, laid flat', 'default', 'A working figure of @rulecad/frames'),
  gaugeError: rule(0.1, 'mm', 'How far a printed gauge piece may come out from its drawn length', 'estimate', 'Not measured: a printer\'s length error on a part this size; check the gauge with a steel rule before the first cut'),
  edge: rule(10, 'mm', 'Room left on each side of the printer\'s bed: a jig or a gauge piece is no longer than the bed less this each side', 'default', 'A working figure of @rulecad/frames'),
};
const J = (k) => JIG_DEFAULTS[k].value;

// A loop extruded along an axis, the result in the print frame: 'xy' a loop in (X, Y) up Z; 'yz' a loop in (Y, Z)
// along X; 'zx' a loop in (Z, X) along Y (each turn cyclic, so the solid stays outside out)
const TURN = { xy: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], yz: [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], zx: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0] };
const SHIFT = { xy: (w) => [0, 0, w], yz: (w) => [w, 0, 0], zx: (w) => [0, w, 0] };
const prism = (loop, from, to, turn = 'xy') => translate(SHIFT[turn](from), transform([...TURN[turn], 0, 0, 0, 1], extrudeLinear({ height: to - from }, polygon({ points: ccw(loop) }))));
// A bore up Z through a part from its bed face, its first-layer edge chamfered so the squashed first layer does not close it
const bore = (x, y, d, top, c) => union(cylinder({ radius: d / 2, height: top + 2, center: [x, y, top / 2], segments: 48 }),
  cylinderElliptic({ height: c + 0.02, startRadius: [d / 2 + c + 0.02, d / 2 + c + 0.02], endRadius: [d / 2, d / 2], center: [x, y, c / 2 - 0.01], segments: 48 }));
const cleanFigures = (k) => ({ fit: k.fit, slip: pfig(k.pr, 'slip'), comp: pfig(k.pr, 'hole_comp'), chamfer: pfig(k.pr, 'chamfer'), bed: pfig(k.pr, 'bed') });
const rests = (...keys) => keys.map((x) => ({ name: `JIG_DEFAULTS.${x}`, value: J(x), kind: JIG_DEFAULTS[x].kind }));
const loadOf = (what, F) => { const v = F ?? J('load'); if (!(isNum(v) && v > 0)) throw new Error(`${what}: load is the push on the jig in N, above 0 (got ${shown(F)})`); return v; };

// A face's place across and deep: its extents along `dir` from the place's centre, and how deep the section runs
// behind it, from the profile's outline
function spanOf(p, place, dir) {
  const pts = outline(p).loops.flat(), d = pts.map(([x, y]) => (x - place.at[0]) * dir[0] + (y - place.at[1]) * dir[1]);
  return { lo: r3(Math.min(...d)), hi: r3(Math.max(...d)), deep: r3(Math.max(...pts.map(([x, y]) => (place.at[0] - x) * place.normal[0] + (place.at[1] - y) * place.normal[1]))) };
}
// (named by its number on the sheet, the order it is done in)
const opName = (b, i) => `${b.name}'s op ${workOrder(b).indexOf(i) + 1} (${b.ops[i].op}${b.ops[i].at ? ` at ${b.ops[i].at}` : ''})`;
const opOf = (what, b, op, kinds) => {
  if (b?.kind !== 'beam') throw new Error(`${what}: give a beam's model (beamModel), not ${shown(b)}`);
  const i = isNum(op) ? op : b.ops.indexOf(op);
  const x = b.ops[i];
  const fits = b.ops.map((y, k) => (kinds.includes(y.op) ? `${k} (${y.op} at ${y.at})` : null)).filter(Boolean);
  if (!x || !kinds.includes(x.op)) throw new Error(`${what}: give one of ${b.name}'s ${kinds.join(' or ')} operations, by its index in the model's ops (in their place from end a) or the op itself: ${fits.length ? `it has ${fits.join(', ')}` : 'it has none'} (got ${shown(isNum(op) ? op : op?.op ?? op)})`);
  return { x, i };
};

// ---------- a drill guide ----------
/**
 * A drill guide for a hole across a beam (an access hole, a drilled hole or a counterbore's hole), as its model. It
 * stops on the end nearer the hole (or the one asked), keys into the drilled face's slot, and holds a bush for the
 * drill at the sheet's dimension, on the slot's centre line. Its plate is as thick as the bush is long (JIG_DEFAULTS.bush
 * times the drill), its stop as thick as keeps it from bending more than JIG_DEFAULTS.within under the load. It prints
 * on its outer face, the stop and the tongue standing up. Refused by name: not a hole across, a closed face, a hole
 * too far from both ends for one print.
 * @param {object} b the beam's model (beamModel)
 * @param {number | object} op the hole's index in b.ops (in their place from end a, where the sheet numbers them in the order they are done: workOrder), or the op itself
 * @param {{ from?: 'a' | 'b', load?: number, printer?: object, material?: string | object }} [o] from: the end the stop is on (the nearer where not given)
 * @returns {object} its model: name, title, profile, beam, op, from, distance, bush, plate, stop, tongue, size, fit (the 4x4 turn from the print frame to the beam's), findings
 */
export function drillGuideModel(b, op, o = {}) {
  const what = 'drillGuideModel';
  options(what, o ?? {}, ['from', 'load', 'printer', 'material']);
  const { x, i } = opOf(what, b, op, JIG_KINDS['drill-guide'].ops), p = b.profile, L = b.length, place = b.places.find((q) => q.name === x.place);
  if (!place.slot) throw new Error(`${what}: ${opName(b, i)} is in ${b.name}'s ${x.place} face, which is closed: a drill guide keys into the face's slot to centre its bush. Mark this hole from the sheet instead`);
  if (o.from != null && !['a', 'b'].includes(o.from)) throw new Error(`${what}: from is the end the stop goes on, a or b (got ${shown(o.from)})`);
  const k = partSetup(what, o), g = cleanFigures(k), F = loadOf(what, o.load), z = x.distance, from = o.from ?? (z <= L - z ? 'a' : 'b'), d = r3(from === 'a' ? z : L - z);
  const sigma = from === 'a' ? 1 : -1, cz = place.along[0] * place.normal[1] - place.along[1] * place.normal[0], kappa = sigma * Math.sign(cz), A = [kappa * place.along[0], kappa * place.along[1]];
  const { lo, hi, deep } = spanOf(p, place, A), slot = p.slots[place.slot], W = r3(hi - lo), E = k.mat.rules.modulus.value;
  const D = x.diameter, dia = r3(D + g.slip + g.comp), t = up(Math.max(J('bush') * D, 3 * k.line), k.layer);
  const tw = r3(slot.opening - g.slip), dt = r3(slot.lip - k.fit);
  if (tw < 2 * k.line) throw new Error(`${what}: ${slot.name}'s ${mm(slot.opening)} mm opening leaves a tongue ${mm(tw)} mm wide: too thin to print`);
  const hs = r3(J('stop') * deep), byBend = Math.cbrt((4 * F * hs ** 3) / (E * W * J('within'))), byStrength = Math.sqrt((FITTING_DEFAULTS.margin.value * 6 * F * hs) / (W * k.S));
  const ts = up(Math.max(byBend, byStrength, 3 * k.line), 0.1), sEnd = r3(d + dia / 2 + D), length = r3(ts + sEnd), most = g.bed - 2 * J('edge');
  if (d < dia / 2 + 1e-9) throw new Error(`${what}: ${opName(b, i)} is ${mm(d)} mm from end ${from}, inside its own radius: no guide can stop on that end`);
  if (length > most + 1e-9) {
    const other = from === 'a' ? L - z : z;
    throw new Error(`${what}: ${opName(b, i)} is ${mm(d)} mm from end ${from}${o.from == null ? ` and ${mm(other)} mm from end ${from === 'a' ? 'b' : 'a'}` : ''}: a guide that reaches it is ${mm(length)} mm long, more than the ${mm(most)} mm the printer's ${mm(g.bed)} mm bed takes. Mark this hole from the sheet${o.from != null ? `, or stop the guide on end ${from === 'a' ? 'b' : 'a'}` : ''}`);
  }
  // what it takes: pressed on against the end, the stop bends as a cantilever hs long (6 F h / (W ts²)); the drill's side push
  // on the bush is held by the tongue in the slot, bending it at its root (6 F dt / (l tw²))
  const bend = r3((6 * F * hs) / (W * ts * ts)), lt = r3(sEnd - 0.5), root = r3((6 * F * dt) / (lt * tw * tw)), stress = Math.max(bend, root), margin = r3(k.S / stress);
  const sag = r3((4 * F * hs ** 3) / (E * W * ts ** 3)), lean = r3(deg(Math.atan(g.slip / t)));
  const fitM = [A[0], A[1], 0, 0, 0, 0, sigma, 0, -place.normal[0], -place.normal[1], 0, 0, r3(place.at[0] + t * place.normal[0]), r3(place.at[1] + t * place.normal[1]), from === 'a' ? 0 : L, 1];
  const shortName = short(p.name), mark = (tw / 2) + 2 * k.fit + 0.5;
  const m = { kind: 'jig', jig: 'drill-guide', name: `drill-guide-${shortName}-${mm(D)}-at-${mm(d)}`, title: `drill guide for Ø${mm(D)} mm, ${mm(d)} mm from an end of ${shortName}`,
    profile: p.name, beam: b.name, op: i, line: x.line, place: x.place, from, distance: z,
    bush: { drill: D, diameter: dia, length: t, at: [0, d], within: r3(g.slip / 2), lean, sheet: z },
    plate: { thickness: t, width: W, length: sEnd, span: [lo, hi] }, round: k.fit, stop: { thickness: ts, reach: hs, sag }, tongue: { width: tw, depth: dt, slot: slot.name },
    size: { length, width: W, height: r3(t + Math.max(hs, dt)) }, fit: fitM,
    label: { at: [r3((lo + -mark) / 2), r3(sEnd / 2), t], along: [0, 1], room: [r3(sEnd - 2), r3(-mark - lo - 0.5)] },
    load: { force: F, what: `${F} N pressing it on against end ${from}, and the drill pushing sideways in its bush` }, stress, margin,
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: rests('bush', 'stop', 'within', 'load') };
  weigh(m, drillGuide(m), k.density);
  closingFindings(m, { S: k.S, sizeText: `a ${mm(t)} mm plate over ${b.name}'s ${x.place} face with a Ø${mm(dia)} mm bush for a Ø${mm(D)} mm drill (its slip ${mm(g.slip)} and hole compensation ${mm(g.comp)}), a ${mm(ts)} mm stop ${mm(hs)} mm down end ${from}, a tongue ${mm(tw)} mm wide and ${mm(dt)} mm deep in ${slot.name}`, marginText: `under ${m.load.what}, its stop bends to ${mm(bend)} MPa and its tongue to ${mm(root)} MPa`, pose: 'on its outer face, the stop and tongue standing up' });
  m.findings.push(finding('pass', `its bush sits ${mm(d)} mm from end ${from}, where the sheet dimensions the hole ${mm(z)} mm from end a${from === 'b' ? ` (${mm(L)} less ${mm(d)})` : ''}, on ${x.place}'s slot centre line to within ${mm(g.slip / 2)} mm (the tongue's play each side); the stop bends ${mm(sag)} mm under ${F} N and the drill leans no more than ${mm(lean)}° in its ${mm(t)} mm bush`, 'jig.drill', { values: { distance: d, sheet: z, within: r3(g.slip / 2), sag, lean }, refs: { beam: b.name, op: i + 1, place: x.place, from } }));
  m.findings.push(finding('info', `the hole is measured from end ${from}, so the beam's cut to length (±${mm(p.supply?.cutTolerance ?? 0.5)} mm) is in its place along the beam${x.op === 'counterbore' ? `; the guide drills the Ø${mm(D)} mm hole, and the counterbore's cutter is piloted in it` : ''}`, 'jig.drill', { refs: { beam: b.name, op: i + 1 } }));
  return m;
}

/**
 * A drill guide's solid: in its print pose, or fitted on the beam (in the beam's frame). A mark is cut into its contact
 * face beside the tongue where one is given (a geom2 in the label's frame: x along, y across, about its middle).
 * @param {object} m drillGuideModel's @param {{ pose?: 'print' | 'fit', mark?: object, ops?: object }} [o] @returns {object} a JSCAD geom3
 */
export function drillGuide(m, o = {}) {
  if (m?.jig !== 'drill-guide') throw new Error(`drillGuide: give a drill guide's model (drillGuideModel), not ${shown(m)}`);
  const t = m.plate.thickness, [lo, hi] = m.plate.span, sEnd = m.plate.length, ts = m.stop.thickness, hs = m.stop.reach, fit = m.round;
  const side = roundConcave(ccw([[-ts, 0], [sEnd, 0], [sEnd, t], [0, t], [0, t + hs], [-ts, t + hs]]), fit, null, 6);
  const tongue = tongueLoop(-m.tongue.width / 2, m.tongue.width / 2, m.tongue.depth, false, fit, 0.5).map(([n, a]) => [t + n, a]);
  const parts = [prism(side, lo, hi, 'yz'), prism(tongue, 0.5, sEnd, 'zx')];
  const cuts = [bore(0, m.bush.at[1], m.bush.diameter, t + m.tongue.depth, 0.4), ...markCut(m.label, o.mark)];
  const g = combine(parts, cuts, o.ops);
  return Object.assign(o.pose === 'fit' ? transform(m.fit, g) : g, { model: m });
}

// A mark (a geom2 about its middle, x along the label) cut 0.4 mm into the label's face
function markCut(label, mark) {
  if (!mark || !label) return [];
  const [ax, ay] = label.along, turn = [ax, ay, 0, 0, -ay, ax, 0, 0, 0, 0, 1, 0, label.at[0], label.at[1], label.at[2] - 0.4, 1];
  return [transform(turn, extrudeLinear({ height: 1 }, mark))];
}

// ---------- a tap guide ----------
/**
 * A tap guide for a tapped end, as its model: a cap over the end, a sleeve round the section that centres it, and a
 * bore over each bore the op taps, as long as JIG_DEFAULTS.bush times the thread, so the tap starts square to the end.
 * It prints on its outer face, the sleeve standing up, the bores upright.
 * @param {object} b the beam's model @param {number | object} op the tap's index in b.ops, or the op
 * @param {{ shank?: number, load?: number, printer?: object, material?: string | object }} [o] shank: the tap's shank in mm, where it is wider than its thread
 * @returns {object} its model: name, title, profile, beam, op, end, thread, bores (print X, Y), plate, sleeve, size, fit, findings
 */
export function tapGuideModel(b, op, o = {}) {
  const what = 'tapGuideModel';
  options(what, o ?? {}, ['shank', 'load', 'printer', 'material']);
  const { x, i } = opOf(what, b, op, JIG_KINDS['tap-guide'].ops), p = b.profile, k = partSetup(what, o), g = cleanFigures(k), F = loadOf(what, o.load);
  if (o.shank != null && !(isNum(o.shank) && o.shank >= x.major)) throw new Error(`${what}: shank is the tap's shank across in mm, at least its ${mm(x.major)} mm thread (got ${shown(o.shank)})`);
  const shank = o.shank ?? r3(J('shank') * x.major), dia = r3(shank + g.slip + g.comp), t = up(Math.max(J('bush') * x.major, 3 * k.line), k.layer);
  const missing = (x.bores ?? []).filter((n) => !b.bores.some((q) => q.name === n)), own = b.bores.filter((q) => q.end === x.end).map((q) => q.name);
  if (missing.length || !x.bores?.length) throw new Error(`${what}: ${opName(b, i)} taps ${missing.length ? `bore ${missing.join(', ')}, which ${b.name} does not have` : 'no bore'}: end ${x.end} has ${own.length ? own.join(', ') : 'none'}`);
  const mx = x.end === 'a' ? 1 : -1, at = x.bores.map((n) => b.bores.find((q) => q.name === n).at).map(([bx, by]) => [r3(mx * bx), r3(by)]);
  const rc = r3((p.cornerRadius ?? 0) + k.fit), wx = r3(p.width / 2 + k.fit), wy = r3(p.height / 2 + k.fit), hs = up(J('sleeve') * Math.min(p.width, p.height), k.layer);
  // the sleeve's wall: three lines, more where the side push bends it (6 F hs / (B w²)) past half the plastic's strength
  const B = 2 * Math.min(wx, wy), w = up(Math.max(3 * k.line, Math.sqrt((FITTING_DEFAULTS.margin.value * 6 * F * hs) / (B * k.S))), 0.1);
  const stress = r3((6 * F * hs) / (B * w * w)), margin = r3(k.S / stress), lean = r3(deg(Math.atan(g.slip / t)));
  const right = Math.max(...at.map((q) => q[0])) + dia / 2 + 1, room = r3(wx - k.fit - 0.5 - right);
  const fitM = x.end === 'a' ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -t, 1] : [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, r3(b.length + t), 1];
  const m = { kind: 'jig', jig: 'tap-guide', name: `tap-guide-${short(p.name)}-${x.thread}${at.length > 1 ? `-${at.length}` : ''}`, title: `tap guide for ${x.thread} in ${short(p.name)}'s end`,
    profile: p.name, beam: b.name, op: i, line: x.line, end: x.end, thread: x.thread, bores: at.map(([bx, by]) => ({ at: [bx, by], diameter: dia })), shank,
    plate: { thickness: t }, sleeve: { height: hs, wall: w, inside: [r3(2 * wx), r3(2 * wy)], round: rc }, lean,
    size: { length: r3(2 * (wx + w)), width: r3(2 * (wy + w)), height: r3(t + hs) }, fit: fitM,
    label: room >= 3 ? { at: [r3(right + room / 2), 0, t], along: [0, 1], room: [r3(2 * wy - 2 * k.fit - 2), room] } : null,
    load: { force: F, what: `${F} N pushing the tap sideways at the guide` }, stress, margin,
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: rests('bush', 'shank', 'sleeve', 'load') };
  weigh(m, tapGuide(m), k.density);
  closingFindings(m, { S: k.S, sizeText: `a ${mm(t)} mm cap over end ${x.end} with ${at.length} Ø${mm(dia)} mm bore${at.length > 1 ? 's' : ''} (a ${mm(shank)} mm shank, its slip and hole compensation), a sleeve ${mm(hs)} mm deep and ${mm(w)} mm thick round the ${mm(p.width)} x ${mm(p.height)} mm section`, marginText: `under ${m.load.what}, its sleeve bends to ${mm(stress)} MPa`, pose: 'on its outer face, the sleeve standing up' });
  m.findings.push(finding('pass', `it holds the ${x.thread} tap over ${x.bores.join(', ')} square to end ${x.end}, leaning no more than ${mm(lean)}° in its ${mm(t)} mm bore`, 'jig.tap', { values: { lean, length: t, bore: dia }, refs: { beam: b.name, op: i + 1, bores: x.bores } }));
  if (o.shank == null) m.findings.push(finding('info', `its bore passes a shank as wide as the thread (${mm(shank)} mm), an estimate: give shank where your tap's is wider`, 'jig.tap', { refs: { rule: 'JIG_DEFAULTS.shank' } }));
  return m;
}

/** A tap guide's solid: in its print pose, or fitted on the beam's end. @param {object} m tapGuideModel's @param {{ pose?: 'print' | 'fit', mark?: object, ops?: object }} [o] @returns {object} */
export function tapGuide(m, o = {}) {
  if (m?.jig !== 'tap-guide') throw new Error(`tapGuide: give a tap guide's model (tapGuideModel), not ${shown(m)}`);
  const t = m.plate.thickness, { height: hs, wall: w, inside: [ix, iy], round: rc } = m.sleeve, c = Math.min(0.2, rc), top = t + hs;
  const slab = (sx, sy, r, z0, z1) => translate([0, 0, z0], extrudeLinear({ height: z1 - z0 }, roundedRectangle({ size: [sx, sy], roundRadius: r, segments: 32 })));
  const body = slab(ix + 2 * w, iy + 2 * w, rc + w, 0, top);
  // the cavity: the section with its fit, its floor's edge filled 45° by c, so the inside corner is not square
  const cavity = union(hull(slab(ix - 2 * c, iy - 2 * c, Math.max(rc - c, 0.01), t, t + 0.01), slab(ix, iy, rc, t + c, t + c + 0.01)), slab(ix, iy, rc, t + c, top + 1));
  const cuts = [cavity, ...m.bores.map((q) => bore(q.at[0], q.at[1], q.diameter, t, 0.4)), ...markCut(m.label, o.mark)];
  const g = combine([body], cuts, o.ops);
  return Object.assign(o.pose === 'fit' ? transform(m.fit, g) : g, { model: m });
}

// ---------- a cut-length stop ----------
/**
 * A cut-length stop for one length of a profile, as its model: a block that a spring clamp holds against a saw's fence
 * (or a mitre box's back), its face square to the fence, and a printed gauge as long as the cut, in pieces no longer
 * than the bed takes, that sets the block from the blade's near side. Every edge on the table is chamfered by the
 * printer's chamfer so the first layer's spread does not lengthen the gauge or hold the beam off the stop.
 * @param {string | object} profile @param {number} length the cut, mm (a mitred beam's long side)
 * @param {{ load?: number, printer?: object, material?: string | object, given?: object }} [o]
 * @returns {object} its model: name, title, profile, length, block, gauge { pieces, length, section }, within, size, findings
 */
export function lengthStopModel(profile, length, o = {}) {
  const what = 'lengthStopModel';
  options(what, o ?? {}, ['load', 'printer', 'material', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), k = partSetup(what, o), g = cleanFigures(k), F = loadOf(what, o.load);
  if (!(isNum(length) && length > 0)) throw new Error(`${what}: length is the cut in mm, above 0 (got ${shown(length)})`);
  const most = g.bed - 2 * J('edge'), n = Math.ceil(length / most - 1e-9), piece = r3(length / n), c = Math.max(g.chamfer, k.layer);
  const bx = J('block'), by = r3(Math.max(p.width, p.height) + 5), h = r3(Math.min(p.height, 40)), gw = J('gauge'), gh = r3(0.6 * gw);
  const stress = r3((6 * F * (h / 2)) / (by * bx * bx)), margin = r3(k.S / stress), within = r3(n * J('gaugeError'));
  const m = { kind: 'jig', jig: 'length-stop', name: `length-stop-${short(p.name)}-${mm(length)}`, title: `cut-length stop for ${mm(length)} mm of ${short(p.name)}`,
    profile: p.name, length, block: { size: [bx, by, h], chamfer: c }, gauge: { pieces: n, length: piece, section: [gw, gh], chamfer: c }, within,
    size: { length: bx, width: by, height: h, gauge: piece }, label: { at: [bx / 2, by / 2, h], along: [0, 1], room: [by - 2, bx - 2] },
    gaugeLabel: { at: [piece / 2, gw / 2, gh], along: [1, 0], room: [piece - 4, gw - 2] },
    load: { force: F, what: `${F} N of the beam's end pushed against it` }, stress, margin,
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: rests('block', 'gauge', 'gaugeError', 'edge', 'load') };
  const block = lengthStop(m), gauge = lengthStop(m, { part: 'gauge' });
  weigh(m, block, k.density); const gm = { volume: 0, grams: 0 }; weigh(gm, gauge, k.density);
  m.block.grams = m.grams; m.gauge.grams = gm.grams; m.volume = r3(m.volume + n * gm.volume); m.grams = r3(m.grams + n * gm.grams);
  closingFindings(m, { S: k.S, sizeText: `a block ${mm(bx)} x ${mm(by)} x ${mm(h)} mm against the fence, and a gauge of ${n} piece${n > 1 ? 's' : ''} ${mm(piece)} mm long, ${mm(gw)} x ${mm(gh)} mm, its table edges chamfered ${mm(c)} mm`, marginText: `under ${m.load.what}, the block bends to ${mm(stress)} MPa`, pose: 'flat on the face that sits on the saw\'s table' });
  m.findings.push(finding('pass', `the gauge${n > 1 ? `'s ${n} pieces, end to end,` : ''} set${n > 1 ? '' : 's'} the stop ${mm(length)} mm from the blade's near side to within ±${mm(within)} mm, an estimate: check it with a steel rule. The saw cuts on the waste side of the blade`, 'jig.length', { values: { length, pieces: n, piece, within }, refs: { profile: p.name } }));
  return m;
}

/** A length stop's block, or one piece of its gauge, in its print pose. @param {object} m lengthStopModel's @param {{ part?: 'block' | 'gauge', mark?: object, ops?: object }} [o] @returns {object} */
export function lengthStop(m, o = {}) {
  if (m?.jig !== 'length-stop') throw new Error(`lengthStop: give a length stop's model (lengthStopModel), not ${shown(m)}`);
  const part = o.part ?? 'block';
  if (!['block', 'gauge'].includes(part)) throw new Error(`lengthStop: part is block or gauge (got ${shown(o.part)})`);
  if (part === 'gauge') {
    const L = m.gauge.length, [gw, gh] = m.gauge.section, c = m.gauge.chamfer;
    const g = prism([[c, 0], [L - c, 0], [L, c], [L, gh], [0, gh], [0, c]].map(([x, z]) => [z, x]), 0, gw, 'zx');
    return Object.assign(o.mark ? subtract(g, ...markCut(m.gaugeLabel, o.mark)) : g, { model: m, part });
  }
  const [bx, by, h] = m.block.size, c = m.block.chamfer;
  // the stop face (X = 0) and the fence face (Y = 0), each with its table edge chamfered
  const a = prism([[0, c], [c, 0], [bx, 0], [bx, h], [0, h]].map(([x, z]) => [z, x]), 0, by, 'zx');
  const f = prism([[0, c], [c, 0], [by, 0], [by, h], [0, h]], 0, bx, 'yz');
  const g = intersect(a, f);
  return Object.assign(o.mark ? subtract(g, ...markCut(m.label, o.mark)) : g, { model: m, part });
}

// ---------- a squaring corner ----------
/**
 * A squaring corner for two beams that meet square, as its model: an L that lies on a face of each in one plane, a
 * tongue along each arm in that face's slot, so it holds a's end square to b while the join is tightened. Its arms
 * run JIG_DEFAULTS.arm times the face's width past the corner. It prints on its outer face, the tongues on top.
 * An L has a hand: arm a runs along a away from b, and arm b runs along b one way only. Right-handed, arm b runs
 * along n x u, where n is a's face's outward normal and u runs along a away from b (+X of the print frame);
 * left-handed, the other way (-X), the mirror image. Choose the hand whose arm b lies on b, not past its end.
 * @param {{ profile: string | object, face?: string, end?: 'a' | 'b', length?: number }} a the beam whose end meets b, its face in the plane, the end that meets b (a where not given), and its length (for the fitted pose on end b)
 * @param {{ profile: string | object, face?: string, edge?: 'lo' | 'hi' }} b the beam a meets, its face in the plane, and which edge of that face (along the place's across direction) a stands on
 * @param {{ hand?: 'right' | 'left', load?: number, printer?: object, material?: string | object, given?: object }} [o] hand: which way arm b runs (right where not given)
 * @returns {object} its model: name, title, profiles, hand, outline, arms, tongues, square, size, fit (the 4x4 turn from the print frame to a's, or null on end b with no length), findings
 */
export function squareCornerModel(a, b, o = {}) {
  const what = 'squareCornerModel';
  options(what, o ?? {}, ['hand', 'load', 'printer', 'material', 'given']);
  const k = partSetup(what, o), g = cleanFigures(k), F = loadOf(what, o.load), given = o.given ?? {}, hand = o.hand ?? 'right';
  if (!['right', 'left'].includes(hand)) throw new Error(`${what}: hand is the way arm b runs, right (along n x u: a's face's outward normal crossed with a's direction away from b) or left (the mirror image) (got ${shown(o.hand)})`);
  if (a && typeof a === 'object' && a.end != null && !['a', 'b'].includes(a.end)) throw new Error(`${what}: a.end is the end of a that meets b, a or b (got ${shown(a.end)})`);
  if (a && typeof a === 'object' && a.length != null && !(isNum(a.length) && a.length > 0)) throw new Error(`${what}: a.length is a's length in mm, above 0 (got ${shown(a.length)})`);
  const side = (s, w) => {
    if (!s || typeof s !== 'object') throw new Error(`${what}: ${w} is { profile, face${w === 'a' ? ', end, length' : ', edge'} } (got ${shown(s)})`);
    const p = profileOf(what, s.profile, given), [fn, idx] = String(s.face ?? 'top').split('.'), place = p.faces[fn]?.[(idx ? +idx : 1) - 1];
    if (!place) throw new Error(`${what}: ${w}'s ${p.name} has no face ${shown(s.face)}: give top, bottom, front or back, with .2 for a second slot`);
    if (!place.slot) throw new Error(`${what}: ${w}'s ${p.name} ${s.face ?? 'top'} face is closed: a squaring corner keys into a slot on each beam`);
    const slot = p.slots[place.slot], tw = r3(slot.opening - g.slip);
    // a's face is spanned along the print frame's X (n x u in a's section), b's along its place's across direction
    const sigma = w === 'a' && s.end === 'b' ? -1 : 1, dir = w === 'a' ? [sigma * place.normal[1], -sigma * place.normal[0]] : place.along, sp = spanOf(p, place, dir);
    if (tw < 2 * k.line) throw new Error(`${what}: ${slot.name}'s opening leaves a tongue ${mm(tw)} mm wide: too thin to print`);
    return { p, place, sigma, dir, face: s.face ?? 'top', slot, ...sp, w: r3(sp.hi - sp.lo), tongue: { width: tw, depth: r3(slot.lip - k.fit) } };
  };
  const A = side(a, 'a'), B = side(b, 'b'), edge = b.edge ?? 'hi', end = a.end ?? 'a', h = hand === 'right' ? 1 : -1;
  if (!['lo', 'hi'].includes(edge)) throw new Error(`${what}: b.edge is the side of b's face that a stands on, lo or hi (got ${shown(b.edge)})`);
  const arm = r3(J('arm') * Math.max(A.w, B.w)), la = arm, lb = arm, v0 = r3(-B.w), vb = r3(edge === 'hi' ? -B.hi : B.lo);
  // in-plane, the push at a's arm end bends the L at its corner (6 F l / (t w²)); the plate is at least JIG_DEFAULTS.plate
  const t = up(Math.max(J('plate'), (FITTING_DEFAULTS.margin.value * 6 * F * la) / (k.S * A.w * A.w)), k.layer);
  // across a's face (X): its near side xn, its side toward arm b xi, and arm b's far end xb
  const xn = h > 0 ? A.lo : A.hi, xi = h > 0 ? A.hi : A.lo, xb = r3(xi + h * lb);
  const loop = roundConcave(ccw([[xn, v0], [xb, v0], [xb, 0], [xi, 0], [xi, la], [xn, la]]), A.w / 2);
  const ta = [1, r3(la - 1)], tb = [r3(Math.min(xn + h, xb - h)), r3(Math.max(xn + h, xb - h))];
  const play = deg(Math.atan(g.slip / (ta[1] - ta[0]))) + deg(Math.atan(g.slip / (tb[1] - tb[0]))), square = r3(play);
  const stress = r3((6 * F * la) / (t * A.w * A.w)), margin = r3(k.S / stress), mark = A.tongue.width / 2 + 2 * k.fit + 0.5;
  // fitted on a: X across a's face, Y along a from the end that meets b, Z into a from the plate's outer face
  const [nx, ny] = A.place.normal, za = end === 'a' ? 0 : a.length;
  const fitM = za == null ? null : [A.dir[0], A.dir[1], 0, 0, 0, 0, A.sigma, 0, -nx, -ny, 0, 0, r3(A.place.at[0] + t * nx), r3(A.place.at[1] + t * ny), za, 1];
  const m = { kind: 'jig', jig: 'square-corner', name: `square-corner-${short(A.p.name)}${A.p.name === B.p.name ? '' : `-${short(B.p.name)}`}${h > 0 ? '' : '-left'}`, title: `${h > 0 ? '' : 'left-handed '}squaring corner for ${short(A.p.name)} on ${short(B.p.name)}`,
    profiles: [A.p.name, B.p.name], faces: [A.face, B.face], end, edge, hand, outline: loop.map(([u, v]) => [r3(u), r3(v)]), plate: { thickness: t }, round: k.fit,
    arms: { a: la, b: lb }, tongues: { a: { ...A.tongue, at: 0, from: ta[0], to: ta[1] }, b: { ...B.tongue, at: vb, from: tb[0], to: tb[1] } }, square,
    size: { length: r3(A.hi + lb - A.lo), width: r3(la - v0), height: r3(t + Math.max(A.tongue.depth, B.tongue.depth)) }, fit: fitM,
    label: { at: [r3((xn - h * mark) / 2), r3(la / 2), t], along: [0, 1], room: [r3(la - 4), r3(-h * xn - mark - 0.5)] },
    load: { force: F, what: `${F} N pushing a's arm end in the plane` }, stress, margin,
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: rests('arm', 'plate', 'square', 'load') };
  weigh(m, squareCorner(m), k.density);
  closingFindings(m, { S: k.S, sizeText: `an L ${mm(t)} mm thick, ${hand}-handed, its arms ${mm(arm)} mm past the corner, a tongue ${mm(A.tongue.width)} mm wide in ${A.slot.name} and one ${mm(B.tongue.width)} mm wide in ${B.slot.name}`, marginText: `under ${m.load.what}, its corner bends to ${mm(stress)} MPa`, pose: 'on its outer face, the tongues on top' });
  const ok = square <= J('square') + 1e-9;
  m.findings.push(finding(ok ? 'pass' : 'warn', `its tongues, ${mm(ta[1] - ta[0])} and ${mm(tb[1] - tb[0])} mm long with the printer's ${mm(g.slip)} mm slip in each slot, hold the beams within ${mm(square)}° of square where both lie whole on their beams${ok ? `, inside the ${J('square')}° a join is held to` : `: more than the ${J('square')}° a join is held to, so check the corner with a square as it is tightened`}`, 'jig.square', { values: { square, limit: J('square') }, refs: { profiles: [A.p.name, B.p.name] } }));
  return m;
}

/** A squaring corner's solid: in its print pose, or fitted on beam a (in a's frame). @param {object} m squareCornerModel's @param {{ pose?: 'print' | 'fit', mark?: object, ops?: object }} [o] @returns {object} */
export function squareCorner(m, o = {}) {
  if (m?.jig !== 'square-corner') throw new Error(`squareCorner: give a squaring corner's model (squareCornerModel), not ${shown(m)}`);
  if (o.pose === 'fit' && !m.fit) throw new Error(`squareCorner: a corner on a's end b is fitted from a's length: give a.length to squareCornerModel`);
  const t = m.plate.thickness, fit = m.round, { a, b } = m.tongues;
  const ta = tongueLoop(-a.width / 2, a.width / 2, a.depth, false, fit, 0.5).map(([n, x]) => [t + n, a.at + x]);
  const tb = tongueLoop(-b.width / 2, b.width / 2, b.depth, false, fit, 0.5).map(([n, y]) => [b.at + y, t + n]);
  const g = combine([prism(m.outline, 0, t, 'xy'), prism(ta, a.from, a.to, 'zx'), prism(tb, b.from, b.to, 'yz')], markCut(m.label, o.mark), o.ops);
  return Object.assign(o.pose === 'fit' ? transform(m.fit, g) : g, { model: m });
}

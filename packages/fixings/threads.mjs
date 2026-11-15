// Threads cut for printing: a real screw thread as a solid, where a pilot, an insert or a nut will not do (a lid, a
// knob, a lead-screw nut, a bolt of M6 or more). threadModel gives the numbers with what they rest on; thread gives
// the solid: an external thread to add, or the cutter of an internal one to subtract. The forms are the ISO metric
// thread (the basic profile of ISO 68-1, from the major diameter and the pitch), the unified inch thread (the same
// profile) and the metric trapezoidal thread of ISO 2904 (a lead screw's). A thread stands on the z axis as it is
// printed: the flank of each tooth that faces down is laid back to the printer's overhang, the printer's thread_gap is
// left between it and its mate, and each end has a lead-in. Units: mm, degrees.
import jscad from '@jscad/modeling';
import t8screw from '@rulecad/rules/t8-screw.json' with { type: 'json' };
import { DEFAULTS, fixingOf, fixingModel, printerOf, threads as threadNames, cite, rest, finding, positive, oneOf, isNum, shown, mm, r3, a, ENGAGEMENT, engagementOf } from './model.mjs';
import { along, lathe, OUT, SEGMENTS, UP } from './draw.mjs';

/**
 * @typedef {import('./model.mjs').Fixing} Fixing a fixing's model, as fixingModel gives it
 */

const { geom3, poly3 } = jscad.geometries, { rotateY, rotateZ } = jscad.transforms;
const rad = (deg) => (deg * Math.PI) / 180, tan = (deg) => Math.tan(rad(deg));
/** The lead screws of the catalogue a thread can be named by: 'T8' is the kit's t8-screw rule set. */
const LEADSCREWS = { t8: t8screw };
const TR = /^tr\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*\(\s*p\s*(\d+(?:\.\d+)?)\s*\))?\s*(lh)?$/i;
/** The forms of thread there are profiles for. */
export const THREAD_FORMS = ['metric', 'unified', 'trapezoidal'];
// ISO 2904's crest clearance by pitch, as DIN 103 tabulates it (https://en.wikipedia.org/wiki/Trapezoidal_thread_form)
const crestClearance = (what, P) => {
  if (P >= 1.5 - 1e-9 && P <= 12 + 1e-9) return P < 2 - 1e-9 ? 0.15 : P <= 5 + 1e-9 ? 0.25 : 0.5;
  throw new Error(`${what}: a trapezoidal pitch of ${mm(P)} mm is outside the crest clearances this package holds (ISO 2904, pitches from 1.5 to 12 mm): give the thread as { form: 'trapezoidal', diameter, pitch, ac } with its own`);
};

// ---------- what thread is meant ----------
// A thread's basic profile, from whatever names it: a fixing ('M10', '1/4-20'), a trapezoidal designation
// ('Tr8x8(P2)': 8 mm outside, 8 mm lead, 2 mm pitch, so four starts), a lead screw of the catalogue ('T8'), a lead
// screw's or its nut's rule set, or its numbers ({ form, diameter, pitch, starts }).
function basisOf(what, spec, o) {
  const given = (name, value, why) => ({ name, value, unit: 'mm', kind: 'given', source: why });
  const trapezoid = (said, d, P, starts, rests, ac) => ({ form: 'trapezoidal', said, d, P, starts, alpha: 15, ac: ac ?? crestClearance(what, P), rests, fx: null });
  const designation = (text, rests = null) => {
    const t = TR.exec(String(text).trim());
    if (!t) return null;
    const d = Number(t[1]), lead = Number(t[2]), P = t[3] ? Number(t[3]) : lead, starts = lead / P;
    if (!(d > 0 && P > 0) || Math.abs(starts - Math.round(starts)) > 1e-9) throw new Error(`${what}: "${text}" is a trapezoidal thread as diameter x lead (P pitch), the lead a whole number of pitches: Tr8x2, Tr8x8(P2) (got a lead of ${mm(lead)} mm on a ${mm(P)} mm pitch)`);
    return { ...trapezoid(`Tr${mm(d)}x${mm(lead)}${starts > 1 ? `(P${mm(P)})` : ''}`, d, P, Math.round(starts), rests ?? [given('the designation', text, 'the thread as it was named: diameter x lead (P pitch), as ISO 2904 writes it')]), hand: t[4] ? 'left' : null };
  };
  const fromSet = (set) => { // a lead screw's rule set, or its nut's: the thread it names, with a variant's figures over it
    let rules = set.rules;
    if (o.variant != null) {
      const v = Object.keys(set.variants ?? {}).find((k) => k.toLowerCase() === String(o.variant).toLowerCase());
      if (!v) throw new Error(`${what}: ${set.name} has no variant "${o.variant}" (${Object.keys(set.variants ?? {}).join(', ') || 'none'})`);
      rules = { ...rules, ...Object.fromEntries(Object.entries(set.variants[v].values ?? {}).map(([k, value]) => [k, { ...rules[k], value, kind: set.variants[v].kind ?? rules[k]?.kind, source: set.variants[v].source ?? rules[k]?.source }])) };
    }
    const text = rules.thread?.value, b = typeof text === 'string' ? designation(text, [rest(`${set.name}.thread`, rules.thread)]) : null;
    if (!b) throw new Error(`${what}: ${set.name ?? 'the rule set'} names no trapezoidal thread: its thread rule is ${shown(text)}, where a lead screw's says Tr8x8(P2). For a screw thread, give its name ('M10')`);
    if (isNum(rules.starts?.value) && rules.starts.value !== b.starts) throw new Error(`${what}: ${set.name} says ${rules.starts.value} starts and its thread ${b.said} has ${b.starts}: one of the two rules is wrong`);
    for (const k of ['pitch', 'lead', 'starts']) if (rules[k]) b.rests.push(rest(`${set.name}.${k}`, rules[k]));
    return b;
  };
  if (typeof spec === 'string' && LEADSCREWS[spec.trim().toLowerCase()]) return fromSet(LEADSCREWS[spec.trim().toLowerCase()]);
  if (typeof spec === 'string' && /^tr/i.test(spec.trim())) { const b = designation(spec); if (!b) throw new Error(`${what}: "${spec}" does not read as a trapezoidal thread: Tr8x2 (8 mm, 2 mm pitch), Tr8x8(P2) (8 mm lead on a 2 mm pitch: four starts)`); return b; }
  if (spec && typeof spec === 'object' && spec.kind !== 'fixing' && spec.rules && typeof spec.rules === 'object') return fromSet(spec);
  if (spec && typeof spec === 'object' && spec.kind !== 'fixing' && 'form' in spec) {
    oneOf(what, 'form', spec.form, THREAD_FORMS);
    const d = positive(what, 'diameter', spec.diameter), P = positive(what, 'pitch', spec.pitch), starts = spec.starts ?? 1;
    if (spec.ac != null && !(isNum(spec.ac) && spec.ac >= 0)) throw new Error(`${what}: ac is the crest clearance of a trapezoidal thread, 0 mm or more (got ${shown(spec.ac)})`);
    const rests = [given('diameter', d, 'given to threadModel'), given('pitch', P, 'given to threadModel')];
    return spec.form === 'trapezoidal' ? trapezoid(`Tr${mm(d)}x${mm(P * starts)}${starts > 1 ? `(P${mm(P)})` : ''}`, d, P, starts, rests, spec.ac) : { form: spec.form, said: `${mm(d)} x ${mm(P)}`, d, P, starts, alpha: 30, rests, fx: null };
  }
  if (typeof spec !== 'string' && !(spec && spec.kind === 'fixing')) throw new Error(`${what}: give a thread: a fixing's name or model ('M10', '1/4-20'), a trapezoidal thread ('Tr8x2', 'Tr8x8(P2)', or 'T8' for the catalogue's lead screw), a lead screw's rule set, or { form, diameter, pitch }, not ${shown(spec)}`);
  const fx = fixingOf(what, spec, o);
  if (fx.form === 'plastic') throw new Error(`${what}: ${fx.thread} is a thread-forming screw for plastic: it makes its own thread in a pilot (hole kind 'pilot'), and there is no thread to print for it`);
  let P = fx.pitch; const rests = [rest(cite(fx, 'major_diameter'), fx.figures.major_diameter)];
  if (o.pitch != null) { P = positive(what, 'pitch', o.pitch); rests.push(given('pitch', P, 'given to threadModel')); } else rests.push(rest(cite(fx, 'pitch'), fx.figures.pitch));
  return { form: fx.form, said: o.pitch != null ? `${fx.thread}x${mm(P)}` : fx.thread, d: fx.major, P, starts: 1, alpha: 30, rests, fx };
}

// One member of a thread (the screw, or the nut) on the basic profile: where its teeth are rooted, how wide a tooth is
// there, how high it stands and how wide its crest is. Radii in mm; out: the teeth point away from the axis.
function basicMember(b, internal) {
  const { d, P, alpha } = b, t = tan(alpha);
  if (b.form === 'trapezoidal') { // ISO 2904: H1 = 0.5 P, h3 = H4 = H1 + ac, d3 = d - 2 h3, D1 = d - P, D4 = d + 2 ac
    const h = 0.5 * P + b.ac, crest = P / 2 - (P / 2) * t, root = P - crest - 2 * h * t;
    return internal ? { out: false, root: d / 2 + b.ac, h, crest, rootFlat: root, pitchRadius: d / 2 - 0.25 * P } : { out: true, root: d / 2 - h, h, crest, rootFlat: root, pitchRadius: d / 2 - 0.25 * P };
  }
  const H = (Math.sqrt(3) / 2) * P, h = (5 / 8) * H; // ISO 68-1: the triangle's height, less an eighth at the crest and a quarter at the root
  return internal ? { out: false, root: d / 2, h, crest: P / 4, rootFlat: P / 8, pitchRadius: d / 2 - (3 / 8) * H } : { out: true, root: d / 2 - h, h, crest: P / 8, rootFlat: P / 4, pitchRadius: d / 2 - (3 / 8) * H };
}
// The same member as it is drawn: moved off the basic profile by its share of the gap, and its down-facing flank laid
// back to the angle beta (from the axis's normal) about the tooth's root, so the tooth stays inside the standard's
// outline. Its height is what is left under the least crest.
function drawnMember(b, internal, shift, beta, least) {
  const m = basicMember(b, internal), ta = tan(b.alpha), tb = tan(beta), width = b.P - m.rootFlat, laid = beta > b.alpha + 1e-9;
  const h = laid ? Math.min(m.h, (width - Math.min(m.crest, least)) / (ta + tb)) : m.h, crest = width - h * (ta + tb);
  const root = m.root + (m.out ? -shift : shift);
  return { ...m, root, h, crest, tip: m.out ? root + h : root - h, up: h * ta, down: h * tb, standard: m.h };
}

/**
 * @typedef {{ kind: 'thread', thread: string, form: 'metric' | 'unified' | 'trapezoidal', internal: boolean, hand: 'right' | 'left', starts: number, pitch: number, lead: number, length: number,
 *   major: number, basic: { major: number, pitch: number, minor: number }, drawn: { major: number, minor: number }, depth: number, standardDepth: number, crest: number,
 *   flank: { up: number, down: number }, overhang: { standard: number, drawn: number, limit: number }, clearance: number, gap: number, comp: number, mate: 'printed' | 'bought', overlap: number, standardOverlap: number,
 *   leadIn: number, run: number, segments: number, triangles: number, display: 'thread' | 'plain', top: '+z' | '-z', axis: 'x' | 'y' | 'z', flat: number | null, engaged: number,
 *   outline: { lo: number, hi: number, flatLo: number, rise: number, flatHi: number, fall: number }, rests: object[], findings: object[] }} Thread
 *   thread: as it is written ('M10', 'Tr8x8(P2)'); lead: the travel in one turn, pitch times starts; major: the nominal diameter;
 *   basic: the standard's basic diameters of this member; drawn: its diameters as drawn (an internal thread's are its cutter's);
 *   depth: a tooth's height as drawn, and standardDepth the standard's; crest: the flat left on a tooth;
 *   flank: each flank's angle from the axis's normal, the one facing up and the one facing down as printed;
 *   overhang: what the down-facing flank overhangs from upright, by the standard and as drawn, and the printer's limit;
 *   clearance: the gap between this thread and its mate, on the radius; gap: this member's share of it; comp: the hole compensation across an internal thread;
 *   overlap: how far its flanks overlap its mate's, on the radius, and standardOverlap the standard's; leadIn: the lead-in's size on the radius, run: its length along the axis;
 *   triangles: the most the solid has; flat: on its side, how far from the axis its flat lies; engaged: the share of a turn left with thread
 */

/**
 * A thread to print, as numbers: its profile as drawn, the clearance to its mate, how its flanks print, and what each
 * figure rests on. Refused by name where the printer cannot resolve the pitch (with the smallest thread that would
 * print), and where it is asked for lying on its side without a flat.
 * @param {Fixing | string | object} spec a fixing's name or model ('M10', '1/4-20'), a trapezoidal thread ('Tr8x2', 'Tr8x8(P2)',
 *   'T8' for the catalogue's lead screw), a lead screw's or its nut's rule set, or { form, diameter, pitch, starts }
 * @param {{ length: number, internal?: boolean, printer?: object, starts?: number, hand?: 'right' | 'left', pitch?: number, mate?: 'printed' | 'bought', gap?: number,
 *   flanks?: 'printed' | 'standard', leadIn?: number, segments?: number, display?: 'thread' | 'plain', top?: '+z' | '-z', axis?: 'x' | 'y' | 'z', flat?: boolean, variant?: string, sets?: object }} o
 *   length: of the thread, along its axis; internal: the thread of a nut or a threaded hole (the solid is then its cutter);
 *   starts: how many threads run side by side (default 1, or what the designation says); hand: right (the default) or left;
 *   pitch: another pitch on a fixing's diameter (a fine thread); mate: what it screws into, printed (each takes half the
 *   gap) or bought (this one takes all of it); gap: the gap on the radius, in place of the printer's thread_gap;
 *   flanks: printed (the down-facing flank laid back to the printer's overhang, the default) or standard (the standard's
 *   own form); leadIn: the size of the lead-in at each end, on the radius (default a tooth's height); segments: faces
 *   round, a multiple of 4 from 12 to 144 (default 48): it bounds the triangle count; display: thread, or plain for a
 *   plain cylinder; top: which end is up when it prints, +z (as drawn, the default) or -z; axis: z standing up (the
 *   default), x or y lying on its side, which needs flat: true (a flat to lie on, or a pointed roof in a hole)
 * @returns {Thread}
 */
export function threadModel(spec, o = {}) {
  const what = o?.what ?? 'threadModel';
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the second argument is its options ({ length: 20, internal: true }), not ${shown(o)}`);
  const b = basisOf(what, spec, o), pr = printerOf(what, o.printer), out = [], rests = [...b.rests];
  const internal = o.internal ?? false, hand = o.hand ?? b.hand ?? 'right', starts = o.starts ?? b.starts, flanks = o.flanks ?? 'printed', mate = o.mate ?? 'printed', display = o.display ?? 'thread', top = o.top ?? '+z', axis = o.axis ?? 'z', segments = o.segments ?? SEGMENTS;
  if (typeof internal !== 'boolean') throw new Error(`${what}: internal is true (a nut's thread, a threaded hole) or false (a screw's) (got ${shown(o.internal)})`);
  oneOf(what, 'hand', hand, ['right', 'left']); oneOf(what, 'flanks', flanks, ['printed', 'standard']); oneOf(what, 'mate', mate, ['printed', 'bought']);
  oneOf(what, 'display', display, ['thread', 'plain']); oneOf(what, 'top', top, ['+z', '-z']); oneOf(what, 'axis', axis, ['x', 'y', 'z']);
  if (!(Number.isInteger(starts) && starts >= 1)) throw new Error(`${what}: starts is how many threads run side by side, a whole number of 1 or more (got ${shown(starts)})`);
  if (!(Number.isInteger(segments) && segments >= 12 && segments <= 144 && segments % 4 === 0)) throw new Error(`${what}: segments is how many faces go round, a multiple of 4 from 12 to 144 (got ${shown(segments)})`);
  if (o.flat != null && typeof o.flat !== 'boolean') throw new Error(`${what}: flat is true or false: a flat along a thread lying on its side (got ${shown(o.flat)})`);
  if (o.length == null) throw new Error(`${what}: give a length, the thread's along its axis, in mm ({ length: 20 })`);
  const length = positive(what, 'length', o.length), { P, d } = b, lead = P * starts;

  // What the printer resolves: layers to a pitch, and a tooth as deep as a line is wide
  const layer = pr.n('layer'), line = pr.n('line'), limit = pr.n('overhang'), basicTooth = basicMember(b, false).h - (b.form === 'trapezoidal' ? b.ac : 0);
  const byLayers = DEFAULTS.thread_layers.value * layer, byLine = (DEFAULTS.thread_lines.value * line * P) / basicTooth, least = Math.max(byLayers, byLine);
  if (P < least - 1e-9) {
    const family = b.fx ? threadNames(o).map((t) => { try { return fixingModel(t, {}, { sets: o.sets }); } catch { return null; } }).filter((m) => m && m.form === b.fx.form && m.pitch >= least - 1e-9).sort((x, y) => x.major - y.major)[0] : null;
    throw new Error(`${what}: ${b.said} has a ${mm(P)} mm pitch, finer than ${pr.name} prints: a thread needs ${DEFAULTS.thread_layers.value} layers to a pitch (${mm(byLayers)} mm at ${pr.cite('layer')} ${mm(layer)} mm) and a tooth a line deep (a pitch of ${mm(r3(byLine))} mm at ${pr.cite('line')} ${mm(line)} mm). `
      + `${family ? `The smallest ${b.fx.form} thread that would print is ${family.thread} (${mm(family.pitch)} mm pitch)` : `A pitch of ${mm(r3(least))} mm or more would print`}. ${b.fx ? `For ${b.said} use a pilot the screw forms its own thread in, an insert, or a nut (hole kind 'pilot' or 'insert', nutPocket)` : 'Use a coarser thread, or a finer layer'}`);
  }
  if (!(limit > 0 && limit < 90)) throw new Error(`${what}: ${pr.cite('overhang')} is the steepest overhang from upright that prints, between 0° and 90° (got ${shown(limit)})`);
  if (axis !== 'z' && !o.flat) throw new Error(`${what}: a thread lying on its side (axis ${axis}) has ${internal ? 'the crests of its top turns hanging in the hole with nothing under them' : 'its lower half hanging over the bed'}: no printer lays that without support. Stand it up (axis z), or give { flat: true }: ${internal ? 'a pointed roof over the hole, as a teardrop has' : 'a flat along the thread for it to lie on'}, which leaves thread on about three quarters of each turn`);
  if (axis === 'z' && o.flat) throw new Error(`${what}: flat is for a thread lying on its side (axis x or y): standing up, it needs none`);

  // The gap, and this member's share of it
  const gapRule = o.gap == null;
  if (!gapRule && !(isNum(o.gap) && o.gap >= 0)) throw new Error(`${what}: gap is the gap between this thread and its mate on the radius, 0 mm or more (got ${shown(o.gap)})`);
  const clearance = gapRule ? pr.n('thread_gap') : o.gap, gap = r3(mate === 'printed' ? clearance / 2 : clearance), comp = internal ? pr.n('hole_comp') : 0;
  if (gapRule) rests.push(pr.rest('thread_gap')); if (comp) rests.push(pr.rest('hole_comp'));
  rests.push(pr.rest('layer'), pr.rest('line'), pr.rest('overhang'), rest('fixings.thread_layers', DEFAULTS.thread_layers), rest('fixings.thread_lines', DEFAULTS.thread_lines));

  // Flanks: a flank at alpha from the axis's normal overhangs 90 - alpha from upright where it faces down. Lying on
  // its side, a flank faces sideways and needs nothing.
  const laid = flanks === 'printed' && axis === 'z' && 90 - b.alpha > limit + 1e-9, beta = laid ? 90 - limit : b.alpha, crestLeast = DEFAULTS.thread_crest.value * P;
  if (laid) rests.push(rest('fixings.thread_crest', DEFAULTS.thread_crest));
  const me = drawnMember(b, internal, gap + comp / 2, beta, crestLeast), std = basicMember(b, internal);
  const other = mate === 'printed' ? drawnMember(b, !internal, gap + (internal ? 0 : pr.n('hole_comp') / 2), beta, crestLeast) : { tip: (() => { const x = basicMember(b, !internal); return x.out ? x.root + x.h : x.root - x.h; })() };
  const overlap = r3(internal ? other.tip - me.tip : me.tip - other.tip), standardOverlap = r3(b.form === 'trapezoidal' ? 0.5 * P : std.h);
  if (!(me.crest > 1e-9 && me.h > 1e-9)) throw new Error(`${what}: ${b.said} leaves no tooth once its flank is laid back to ${mm(limit)}° (a crest of ${mm(me.crest)} mm): use { flanks: 'standard' }, or a coarser thread`);

  // The outline of the solid over one pitch, going up z: a flat at its low radius, a flank out, a flat at its high
  // radius, a flank back. On a screw the rising flank is the tooth's underside; in a cutter it is the top of the nut's tooth below.
  const downFirst = (top === '+z') !== internal, lo = internal ? me.tip : me.root, hi = internal ? me.root : me.tip;
  const outline = { lo: r3(lo), hi: r3(hi), // (to a micron: the solid is drawn from these, and the diameters below are twice them)
    flatLo: internal ? me.crest : me.rootFlat, rise: downFirst ? me.down : me.up, flatHi: internal ? me.rootFlat : me.crest, fall: downFirst ? me.up : me.down };
  const slope = Math.min(1, Math.tan(rad(limit)));
  if (o.leadIn != null && !(isNum(o.leadIn) && o.leadIn >= 0)) throw new Error(`${what}: leadIn is the lead-in's size at each end, on the radius, 0 mm or more (got ${shown(o.leadIn)})`);
  const leadIn = r3(o.leadIn ?? me.h), run = r3(leadIn / slope);
  if (length < 2 * run + P - 1e-9) throw new Error(`${what}: a ${b.said} thread ${mm(length)} mm long is shorter than its two lead-ins and one pitch (${mm(r3(2 * run + P))} mm): make it longer, or give a smaller { leadIn }`);

  // Lying on its side: a flat where the root's underside would pass the overhang, snapped to a face of the solid
  let flat = null, engaged = 1;
  if (axis !== 'z') { const step = 360 / segments, cut = Math.ceil((90 - limit) / step - 1e-9) * step; flat = r3(me.root * (internal ? 1 : Math.cos(rad(cut)))); engaged = r3(1 - (internal ? 90 - limit : cut) / 180); }

  const rows = 4 * (Math.ceil((length + 2 * OUT + lead + (internal ? hi / slope : 0)) / P) - Math.floor(-(lead + OUT) / P) + 2), triangles = display === 'plain' ? 8 * segments : 2 * segments * (rows + 1);
  const dia = (r) => r3(2 * r3(r)), basic = { major: dia(internal ? std.root : std.root + std.h), pitch: dia(std.pitchRadius), minor: dia(internal ? std.root - std.h : std.root) };
  const says = internal ? 'an internal' : 'an external', angle = (x) => mm(r3(x));
  out.push(finding('info', `${says} ${b.said} thread drawn ${mm(dia(hi))} mm over its ${internal ? 'roots' : 'crests'} and ${mm(dia(lo))} mm over its ${internal ? 'crests' : 'roots'}, ${mm(length)} mm long: ${b.form === 'trapezoidal' ? 'the trapezoidal form of ISO 2904' : b.form === 'unified' ? 'the unified form, the basic profile of ISO 68-1' : 'the basic profile of ISO 68-1'} on a ${mm(P)} mm pitch${starts > 1 ? `, ${starts} starts, a lead of ${mm(lead)} mm` : ''}${hand === 'left' ? ', left hand' : ''} (basic: ${mm(basic.major)} major, ${mm(basic.pitch)} pitch, ${mm(basic.minor)} minor)`,
    'thread.drawn', { values: { major: dia(hi), minor: dia(lo), pitch: P, lead, starts, length }, refs: { thread: b.said, form: b.form, internal, hand } }));
  out.push(finding('info', `${mm(clearance)} mm between this thread and its mate, on the radius: ${gapRule ? `${pr.cite('thread_gap')}, ${pr.rest('thread_gap').kind === 'estimate' ? 'an estimate until the fixings coupon measures it' : `a ${pr.rest('thread_gap').kind} figure`}` : 'the gap given'}. ${mate === 'printed' ? `A printed pair takes half each, so this one is drawn ${mm(gap)} mm off the basic profile` : `Its mate is bought, so this one takes all of it`}${comp ? `, and ${pr.cite('hole_comp')} ${mm(comp)} mm across as any printed hole` : ''}`,
    'thread.clearance', { values: { clearance, gap, comp }, refs: { rule: gapRule ? pr.cite('thread_gap') : 'given', kind: gapRule ? pr.rest('thread_gap').kind : 'given', mate } }));
  if (gapRule && pr.rest('thread_gap').borrowed) out.push(finding('info', `${pr.name} has no thread_gap: the X1C's ${mm(clearance)} mm is used`, 'thread.printer', { values: { clearance } }));
  const overhang = { standard: 90 - b.alpha, drawn: r3(90 - beta), limit };
  if (axis !== 'z') out.push(finding('pass', `lying along ${axis}, ${internal ? `the hole has a pointed roof that leaves its roots, ${mm(flat)} mm from the axis, at ${angle(limit)}°, so nothing hangs` : `the thread has a flat ${mm(flat)} mm from its axis to lie on`}: thread is left on ${mm(r3(engaged * 100))}% of each turn, and its flanks face sideways, so they keep the standard's ${angle(b.alpha)}°`, 'thread.printable', { values: { axis, flat, engaged } }));
  else if (laid) out.push(finding('pass', `standing up, the standard's flank lies ${angle(b.alpha)}° from the axis's normal, which is a ${angle(overhang.standard)}° overhang from upright where it faces down, past ${pr.cite('overhang')} ${angle(limit)}°. The down-facing flank is laid back to ${angle(beta)}° about the tooth's root, a ${angle(overhang.drawn)}° overhang, so the tooth stays inside the standard's outline and still fits a bought mate; the up-facing flank keeps ${angle(b.alpha)}°. Each tooth is ${mm(r3(me.h))} mm high where the standard's is ${mm(r3(std.h))} mm, with a ${mm(r3(me.crest))} mm crest. Print it with ${top} up`,
    'thread.printable', { values: { top, standard: overhang.standard, drawn: overhang.drawn, limit, depth: r3(me.h), standardDepth: r3(std.h) } }));
  else out.push(finding(overhang.standard <= limit + 1e-9 ? 'pass' : 'warn', overhang.standard <= limit + 1e-9 ? `standing up, the flank's ${angle(overhang.standard)}° overhang from upright is within ${pr.cite('overhang')} ${angle(limit)}°: the standard's form prints as it is`
    : `standing up, the standard's flank overhangs ${angle(overhang.standard)}° from upright where it faces down, past ${pr.cite('overhang')} ${angle(limit)}°, over a reach of ${mm(r3(std.h))} mm: the form is the standard's own, and whether the printer lays it is for a test print to say`, 'thread.printable', { values: { top, standard: overhang.standard, drawn: overhang.standard, limit } }));
  out.push(finding(overlap > 0 ? 'info' : 'fail', `its flanks overlap ${mate === 'printed' ? 'a printed mate drawn the same way' : 'a bought mate at its basic size'} by ${mm(overlap)} mm on the radius, where the standard's overlap ${mm(standardOverlap)} mm (${mm(r3((overlap / standardOverlap) * 100))}%)`, 'thread.overlap', { values: { overlap, standard: standardOverlap } }));
  return { kind: 'thread', thread: b.said, form: b.form, internal, hand, starts, pitch: P, lead, length, major: d, basic, drawn: { major: dia(hi), minor: dia(lo) }, depth: r3(me.h), standardDepth: r3(std.h), crest: r3(me.crest),
    flank: { up: b.alpha, down: r3(beta) }, overhang, clearance, gap, comp, mate, overlap, standardOverlap, leadIn, run, segments, triangles, display, top, axis, flat, engaged, outline, rests, findings: out };
}

// ---------- the solid ----------
// A thread's surface as triangles: columns of points round the axis, rows up it. Each row is one corner of the outline
// carried round as a helix, so the corners of the teeth are exact however few faces go round, and a point past either
// end is brought back to the end's plane with the radius the thread has there. shape(r, z, i) bends every radius (a
// lead-in, a roof), and place(i, r, z) may put a point somewhere of its own (a flat). Returns the triangles and the
// two end rings.
function sweep({ outline: o, P, lead, turn, n, z0, z1, shape, place = null, inside = false, caps = true }) {
  const offs = [0, o.flatLo, o.flatLo + o.rise, o.flatLo + o.rise + o.flatHi], radii = [o.lo, o.lo, o.hi, o.hi], per = 4 * Math.round(lead / P);
  const cos = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n)), sin = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n));
  const mod = (x, m) => ((x % m) + m) % m;
  const profile = (z) => { // the outline's radius at a height, on column 0
    const u = mod(z, P);
    if (u <= offs[1]) return o.lo;
    if (u < offs[2]) return o.lo + ((o.hi - o.lo) * (u - offs[1])) / (offs[2] - offs[1]);
    if (u <= offs[3]) return o.hi;
    return o.hi - ((o.hi - o.lo) * (u - offs[3])) / (P - offs[3]);
  };
  const point = (i, r, z) => place?.(i, r, z) ?? [Math.max(r, 0) * cos[i], Math.max(r, 0) * sin[i], z];
  const ringAt = (z) => Array.from({ length: n }, (_, i) => point(i, shape(profile(z - (turn * lead * i) / n), z, i), z));
  const lo = ringAt(z0), hi = ringAt(z1);
  const at = (i, k) => {
    if (i === n) { i = 0; k += turn * per; }
    const z = Math.floor(k / 4) * P + offs[mod(k, 4)] + (turn * lead * i) / n;
    return z <= z0 ? lo[i] : z >= z1 ? hi[i] : point(i, shape(radii[mod(k, 4)], z, i), z);
  };
  const same = (p, q) => p === q || (Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9 && Math.abs(p[2] - q[2]) < 1e-9);
  const tris = [], add = (p, q, r) => { if (!same(p, q) && !same(q, r) && !same(p, r)) tris.push(inside ? [p, r, q] : [p, q, r]); };
  for (let k = 4 * (Math.floor((z0 - lead) / P) - 1); k < 4 * (Math.ceil((z1 + lead) / P) + 1); k++) for (let i = 0; i < n; i++) {
    const p = at(i, k), q = at(i + 1, k), r = at(i + 1, k + 1), s = at(i, k + 1);
    // (a face is split corner to corner; where a flat cuts it, along the diagonal that lies flattest on the flat)
    if (place && Math.abs(place.depth(q) - place.depth(s)) < Math.abs(place.depth(p) - place.depth(r)) - 1e-9) { add(p, q, s); add(q, r, s); } else { add(p, q, r); add(p, r, s); }
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (caps === true || caps === 'low') add([0, 0, z0], lo[j], lo[i]); if (caps === true || caps === 'high') add(hi[i], hi[j], [0, 0, z1]); }
  return { tris, lo, hi };
}
const solid = (tris) => geom3.create(tris.map((t) => poly3.create(t)));
// The flat face between an outline and a ring inside it, both running anticlockwise round the axis: z up or down
function annulus(outer, inner, up) {
  const angle = (p) => Math.atan2(p[1], p[0]), turn = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), from = angle(outer[0]);
  const first = inner.map((p, j) => [turn(angle(p) - from + 1e-9), j]).sort((x, y) => x[0] - y[0])[0][1], ring = inner.map((_, j) => inner[(first + j) % inner.length]);
  const M = outer.length, N = ring.length, tris = [], next = (list, i, count) => (i + 1 >= count ? 2 * Math.PI : 0) + turn(angle(list[(i + 1) % count]) - from + 1e-9);
  // (a corner of the outline sees the ring only as far as its tangent: a face that would turn over waits for the next corner)
  const turns = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) > 1e-12;
  for (let i = 0, j = 0; i < M || j < N;) {
    if (j >= N || (i < M && (next(outer, i, M) <= next(ring, j, N) || !turns(outer[i % M], ring[(j + 1) % N], ring[j % N])))) { tris.push([outer[i % M], outer[(i + 1) % M], ring[j % N]]); i++; } else { tris.push([outer[i % M], ring[(j + 1) % N], ring[j % N]]); j++; }
  }
  return up ? tris : tris.map(([p, q, r]) => [p, r, q]);
}

// How the two ends of a thread are finished, as a function on the radius. A screw's thread is cut back by a cone at a
// chamfered end. A cutter is flared at a face it opens on, and ends in a cone where it stops under a ceiling.
function ends(t, { z0, z1, low, high, face0 = z0, face1 = z1 }) {
  const { lo, hi } = t.outline, k = t.leadIn / t.run || 1;
  if (!t.internal) return (r, z) => Math.min(r, low === 'chamfer' ? hi - t.leadIn + (z - z0) * k : Infinity, high === 'chamfer' ? hi - t.leadIn + (z1 - z) * k : Infinity);
  return (r, z) => {
    let x = Math.max(r, low === 'flare' ? lo + t.leadIn - (z - face0) * k : 0, high === 'flare' ? lo + t.leadIn - (face1 - z) * k : 0);
    if (low === 'point') x = Math.min(x, (z - z0) * k); if (high === 'point') x = Math.min(x, (z1 - z) * k);
    return x;
  };
}
// A flat along a screw's thread lying on its side, as where its points go: what lies past the flat's plane is brought
// back on to it, and the last point of each row to be cut is put where its own circle meets the plane, so the edge of
// the flat is true. toward: the angle the flat faces.
function flatOf(t, n, toward) {
  if (t.flat == null || t.internal) return null;
  const step = (2 * Math.PI) / n, f = t.flat;
  return Object.assign((i, r, z) => {
    let d = (i * step - toward) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; // the column's angle from the flat's middle
    if (!(Math.abs(d) < Math.PI / 2 && r * Math.cos(d) > f + 1e-9)) return null;
    const meets = Math.acos(f / r), last = meets - Math.abs(d) < step - 1e-9 && Math.abs(d) > 1e-9, angle = toward + (last ? Math.sign(d) * meets : d), out = last ? r : f / Math.cos(d);
    return [out * Math.cos(angle), out * Math.sin(angle), z];
  }, { depth: (p) => Math.min(f, p[0] * Math.cos(toward) + p[1] * Math.sin(toward)) }); // how far a point lies towards the flat, as far as the flat itself
}
// A pointed roof over a threaded hole lying on its side, as a function on the radius: what lies under the roof is
// pushed out to it. The roof leaves the circle of the roots at the overhang and rises to a point, as a teardrop's.
function roofOf(t, n, toward) {
  if (t.flat == null || !t.internal) return (r) => r;
  const tangent = Math.PI / 2 - rad(t.overhang.limit), reach = Array.from({ length: n }, (_, i) => { let d = Math.abs((2 * Math.PI * i) / n - toward) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; });
  return (r, z, i) => (reach[i] < tangent - 1e-9 ? Math.max(r, t.flat / Math.cos(tangent - reach[i])) : r);
}
const turnOf = (t) => (t.hand === 'left' ? -1 : 1);

/**
 * A thread's surface between two heights, for a solid that carries a thread as part of itself (a threaded screw, a
 * threaded nut): its triangles and its two end rings, to be joined to the rest.
 * @param {Thread} t @param {{ z0: number, z1: number, low?: string, high?: string, inside?: boolean, caps?: boolean | 'low' | 'high' }} o
 *   low, high: how each end is finished: chamfer or plain on a screw, flare on a nut; inside: faces turned inwards (a nut's bore);
 *   caps: close both ends (the default), one, or neither
 * @returns {{ tris: number[][][], lo: number[][], hi: number[][] }}
 */
export function threadSurface(t, o) {
  const shape = ends(t, o);
  return sweep({ outline: t.outline, P: t.pitch, lead: t.lead, turn: turnOf(t), n: t.segments, z0: o.z0, z1: o.z1, shape, inside: !!o.inside, caps: o.caps ?? true });
}

/**
 * A thread to print: an external thread as a solid to add, standing on z from 0 to its length, or (internal: true)
 * the cutter of an internal thread to subtract, which runs a little past both faces of a part as thick as the thread
 * is long. Each end has its lead-in. With display: 'plain' it is a plain cylinder: a screw's at its crests, a hole's at
 * its crests too (the bore you would see).
 * @param {Fixing | string | object} spec as threadModel
 * @param {{ length: number, internal?: boolean, printer?: object, starts?: number, hand?: 'right' | 'left', pitch?: number, mate?: 'printed' | 'bought', gap?: number,
 *   flanks?: 'printed' | 'standard', leadIn?: number, segments?: number, display?: 'thread' | 'plain', top?: '+z' | '-z', axis?: 'x' | 'y' | 'z', flat?: boolean, variant?: string, sets?: object }} o as threadModel
 * @returns {object} a JSCAD geom3, with .model holding threadModel's numbers. Lying on its side (axis x or y) it runs
 *   along that axis from the origin, its flat facing down (a screw's) or its roof up (a hole's)
 */
export function thread(spec, o = {}) {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`thread: the second argument is its options ({ length: 20, internal: true }), not ${shown(o)}`);
  const t = threadModel(spec, { ...o, what: o.what ?? 'thread' });
  const g = t.internal ? cutter(t, { z0: -OUT, z1: t.length + OUT, face0: 0, face1: t.length, low: 'flare', high: 'flare', toward: Math.PI }) : screwThread(t);
  if (t.axis === 'z') return Object.assign(g, { model: t });
  const laid = rotateY(Math.PI / 2, g); // z to x: the thread's own x (where a screw's flat is) turns down, its -x (a hole's roof) up
  return Object.assign(t.axis === 'x' ? laid : rotateZ(Math.PI / 2, laid), { model: t });
}
function screwThread(t) {
  const { hi } = t.outline, L = t.length;
  if (t.display === 'plain') return lathe([[0, 0], [hi - t.leadIn, 0], [hi, t.run], [hi, L - t.run], [hi - t.leadIn, L], [0, L]], t.segments);
  return solid(sweep({ outline: t.outline, P: t.pitch, lead: t.lead, turn: turnOf(t), n: t.segments, z0: 0, z1: L, shape: ends(t, { z0: 0, z1: L, low: 'chamfer', high: 'chamfer' }), place: flatOf(t, t.segments, 0) }).tris);
}
// An internal thread's cutter between two heights of its own drawing. toward: where its roof points, lying on its side
function cutter(t, o) {
  const { lo } = t.outline, end = ends(t, o), roof = roofOf(t, t.segments, o.toward ?? 0);
  if (t.display === 'plain') {
    const k = t.leadIn / t.run || 1, steps = [[0, o.z0]];
    if (o.low === 'flare') steps.push([lo + t.leadIn + (o.face0 - o.z0) * k, o.z0], [lo, o.face0 + t.run]); else if (o.low !== 'point') steps.push([lo, o.z0]);
    if (o.high === 'flare') steps.push([lo, o.face1 - t.run], [lo + t.leadIn + (o.z1 - o.face1) * k, o.z1]); else if (o.high !== 'point') steps.push([lo, o.z1]); else steps.push([lo, o.z1 - lo / k]);
    if (o.low === 'point') steps.splice(1, 0, [lo, o.z0 + lo / k]);
    return lathe([...steps, [0, o.z1]], t.segments);
  }
  return solid(sweep({ outline: t.outline, P: t.pitch, lead: t.lead, turn: turnOf(t), n: t.segments, z0: o.z0, z1: o.z1, shape: (r, z, i) => roof(end(r, z), z, i) }).tris);
}

// ---------- a threaded hole ----------
/**
 * A threaded hole, as numbers in a hole's shape: hole(m, { kind: 'thread' }) is this. The thread is modelled, so a
 * printed part takes a screw with no tap, no insert and no nut.
 * @param {string} what @param {Fixing} fx @param {object} o hole's options, and a thread's (mate, gap, flanks, hand, starts, segments, display, flat)
 * @param {{ into: string, axis: 'x' | 'y' | 'z', across: boolean }} dir
 * @returns {object} a Hole, with thread holding threadModel's numbers
 */
export function threadedHoleModel(what, fx, o, dir) {
  const pr = printerOf(what, o.printer), e = engagementOf(o.material), need = r3(ENGAGEMENT[e].value * fx.major), through = o.through ?? false;
  if (typeof through !== 'boolean') throw new Error(`${what}: through is true or false (got ${shown(o.through)})`);
  const depth = o.depth != null ? positive(what, 'depth', o.depth) : through && o.thickness != null ? positive(what, 'thickness', o.thickness) : need;
  if (o.lead != null && !(isNum(o.lead) && o.lead >= 0)) throw new Error(`${what}: lead is the lead-in chamfer, 0 mm or more (got ${shown(o.lead)})`);
  const t = threadModel(fx, { what, length: depth, internal: true, printer: o.printer, sets: o.sets, mate: o.mate, gap: o.gap, flanks: o.flanks, hand: o.hand, starts: o.starts, pitch: o.pitch, segments: o.segments, display: o.display,
    leadIn: o.lead, top: dir.into === '+z' ? '-z' : '+z', axis: dir.across ? dir.axis : 'z', flat: dir.across ? o.flat : undefined });
  const point = !through && dir.into === '+z' ? r3(t.outline.lo / (t.leadIn / t.run || 1)) : 0, out = [...t.findings];
  if (o.thickness != null) { positive(what, 'thickness', o.thickness); if (!through && depth + point > o.thickness - 1e-9) throw new Error(`${what}: a blind threaded hole ${mm(depth)} mm deep${point ? ` with its ${mm(point)} mm point` : ''} goes ${mm(r3(depth + point))} mm into a part ${mm(o.thickness)} mm thick there: it is deeper than the part, and would break out of its far face. Make it shallower, or the part thicker`); }
  if (depth < need - 1e-9) out.push(finding('warn', `${a(fx.thread)} thread ${mm(depth)} mm deep is short: engagement.${e} asks ${mm(need)} mm of thread`, 'hole.depth', { values: { depth, need } }));
  out.push(finding('info', `${a(fx.thread)} threaded hole drawn ${mm(t.drawn.major)} mm over its roots: it rests on ${cite(fx, 'major_diameter')} (${mm(fx.major)} mm), the ${t.mate === 'bought' ? 'whole' : 'half'} of ${t.rests.find((r) => /thread_gap$/.test(r.name))?.name ?? 'the gap given'} each side and ${pr.cite('hole_comp')} ${mm(t.comp)} mm across`, 'hole.drawn', { values: { diameter: t.drawn.major, nominal: fx.major, comp: t.comp }, refs: { thread: fx.thread, set: fx.set, rule: cite(fx, 'major_diameter'), kind: fx.figures.major_diameter.kind } }));
  if (point) out.push(finding('info', `going up from the bed, the hole ends in a point ${mm(point)} mm high past its thread, so its end needs no bridge`, 'hole.point', { values: { point } }));
  return { thread: fx.thread, kind: 'thread', diameter: t.drawn.major, nominal: fx.major, comp: t.comp, depth, through, into: dir.into, axis: dir.axis, teardrop: dir.across, lead: t.leadIn, point,
    basis: { rule: cite(fx, 'major_diameter'), kind: fx.figures.major_diameter.kind, source: fx.figures.major_diameter.source }, rests: [...t.rests, rest(`engagement.${e}`, ENGAGEMENT[e])], findings: out, threaded: t };
}
/** A threaded hole's cutter, from its model: drawn going down from the face, then turned to go along `into` from `at`. */
export function threadedHole(h, at) {
  const t = h.threaded, L = h.depth, up = h.into === '+z';
  const g = cutter(t, { z0: h.through ? -L - OUT : up ? -L - h.point : -L, z1: OUT, face0: -L, face1: 0, low: h.through ? 'flare' : up ? 'point' : 'flat', high: 'flare', toward: h.teardrop ? Math.atan2(UP[h.into][1], UP[h.into][0]) : 0 });
  return Object.assign(along(g, h.into, at), { model: h });
}

// ---------- hardware with its thread drawn ----------
/**
 * A screw with its thread drawn, as one closed solid, in a screw's own place: the face its head seats on at z = 0, the
 * thread down to z = -length. It prints standing on its head, so the model it is given is a thread with top: '-z'.
 * @param {{ head: string, length: number, headDiameter: number, headHeight: number, flats?: number, sink?: number }} s a screw's numbers @param {Thread} t
 * @returns {object} a JSCAD geom3
 */
export function threadedScrew(s, t) {
  const n = t.segments, L = s.length, R = s.headDiameter / 2, k = s.headHeight, sink = s.head === 'countersunk' ? s.sink : 0;
  if (s.head === 'set') return solid(threadSurface(t, { z0: -L, z1: 0, low: 'chamfer', high: 'chamfer' }).tris);
  const { tris: out, hi: neck } = threadSurface(t, { z0: -L, z1: -sink, low: 'chamfer', high: 'plain', caps: 'low' }); // the thread and its tip, open under the head
  const ring = (r, z) => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n), z]);
  const band = (p, q) => { for (let i = 0; i < n; i++) { const j = (i + 1) % n; out.push([p[i], p[j], q[j]], [p[i], q[j], q[i]]); } };
  const lid = (p, z) => { for (let i = 0; i < n; i++) out.push([p[i], p[(i + 1) % n], [0, 0, z]]); };
  if (s.head === 'hex') {
    const hex = (z) => Array.from({ length: 6 }, (_, i) => [R * Math.cos((Math.PI * i) / 3), R * Math.sin((Math.PI * i) / 3), z]), lower = hex(0), upper = hex(k);
    out.push(...annulus(lower, neck, false));
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; out.push([lower[i], lower[j], upper[j]], [lower[i], upper[j], upper[i]], [upper[i], upper[j], [0, 0, k]]); }
  } else if (s.head === 'countersunk') { const rim = ring(R, 0); band(neck, rim); lid(rim, 0); }
  else {
    const steps = s.head === 'button' ? [[R, 0], [R, 0.3 * k], [0.55 * R, k]] : [[R, 0], [R, k]];
    let last = neck; for (const [r, z] of steps) { const next = ring(r, z); band(last, next); last = next; }
    lid(last, k);
  }
  return solid(out);
}

/**
 * A nut with its thread drawn, as one closed solid in a nut's own place: on z from 0 to its height, a hexagon's
 * corner on x. It prints as it stands.
 * @param {{ kind: string, across: number, height: number }} nut a nut's numbers @param {Thread} t an internal thread as long as the nut is high
 * @returns {object} a JSCAD geom3
 */
export function threadedNut(nut, t) {
  const sides = nut.kind === 'square' ? 4 : 6, R = nut.across / 2, h = nut.height;
  const outline = (z) => Array.from({ length: sides }, (_, i) => { const th = (2 * Math.PI * (i + (sides === 4 ? 0.5 : 0))) / sides; return [R * Math.cos(th), R * Math.sin(th), z]; });
  const bore = t.display === 'plain' ? null : threadSurface(t, { z0: 0, z1: h, low: 'flare', high: 'flare', inside: true, caps: false });
  const ringAt = (r, z) => Array.from({ length: t.segments }, (_, i) => [r * Math.cos((2 * Math.PI * i) / t.segments), r * Math.sin((2 * Math.PI * i) / t.segments), z]);
  const lower = outline(0), upper = outline(h), lo = bore ? bore.lo : ringAt(t.outline.lo, 0), hi = bore ? bore.hi : ringAt(t.outline.lo, h), out = bore ? bore.tris : [];
  if (!bore) for (let i = 0; i < t.segments; i++) { const j = (i + 1) % t.segments; out.push([lo[i], hi[j], lo[j]], [lo[i], hi[i], hi[j]]); }
  out.push(...annulus(lower, lo, false), ...annulus(upper, hi, true));
  for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; out.push([lower[i], lower[j], upper[j]], [lower[i], upper[j], upper[i]]); }
  return solid(out);
}

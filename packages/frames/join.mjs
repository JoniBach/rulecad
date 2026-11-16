// Joins between beams: how two beams are joined says what is done to each (its operations), what holds them (the
// screws now, the fittings in later releases), and how stiff the joint is taken to be when a frame is solved.
//
// A join names an end of one beam (a) and a place on another (b): a face with a distance from b's end a for a join
// that puts an end against a face (blind, end-tap, bracket and the rest), or b's end for one that meets end to end or
// at a corner (splice, mitre, cube). The addresses are beam.mjs's (back@120, a, a.1). Units: mm, N, radians.
import { parseName, engagement, fixingModel, DEFAULTS as FIX } from '@rulecad/fixings';
import { beamAnchor } from './beam.mjs';

const CHECKED = '2026-11-16';
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const SIDES = { face: 'a face with a distance (back@120, top@50%)', end: 'an end, a or b', either: 'a face with a distance (back@120), or an end (a or b)' };
const FITTINGS = ['printed', 'bought'];

/**
 * The kinds of join, each with what it derives, what b is (a face, an end, or either), whether the end must meet a
 * slot, and, for a kind whose fitting a later release draws, what that fitting is and which release.
 * @type {Record<string, { what: string, b: 'face' | 'end' | 'either', slot: boolean, head?: string, made: boolean, fitting?: string, later?: string }>}
 */
export const JOINS = {
  blind: { what: 'a tap in the end of a, a button-head screw in it, the head in a slot of b, and an access hole across b for the key', b: 'face', slot: true, head: 'button', made: true },
  'end-tap': { what: 'a tap in the end of a, and a cap screw into it through a hole drilled across b', b: 'face', slot: false, head: 'cap', made: true },
  bracket: { what: 'a corner bracket, printed or bought, with its slot nuts and screws', b: 'face', slot: true, made: false, fitting: 'a corner bracket', later: 'Frames 2.3 (printed) and 2.6 (bought)' },
  gusset: { what: 'a flat plate (L, T or cross), printed or bought, over the joint', b: 'face', slot: true, made: false, fitting: 'a gusset plate', later: 'Frames 2.3 (printed) and 2.6 (bought)' },
  cube: { what: 'a three-way corner taking the beam ends', b: 'end', slot: false, made: false, fitting: 'a three-way corner', later: 'Frames 2.3 (printed) and 2.6 (bought)' },
  hidden: { what: 'a bought inner connector in the slots', b: 'face', slot: true, made: false, fitting: 'an inner connector', later: 'Frames 2.6' },
  anchor: { what: 'a bought anchor connector, and its pocket in the end of a', b: 'face', slot: true, made: false, fitting: 'an anchor connector', later: 'Frames 2.6' },
  mitre: { what: 'two mitred ends, and a corner key or plate', b: 'end', slot: false, made: false, fitting: 'a corner key or plate, and the mitres', later: 'Frames 2.3 (printed) and 2.6 (bought)' },
  pivot: { what: 'a hinge or pivot, which also adds a joint so it moves', b: 'face', slot: true, made: false, fitting: 'a pivot and its joint', later: 'Frames 2.3 (printed) and 2.6 (bought)' },
  splice: { what: 'two beams end to end, with a joining plate', b: 'end', slot: false, made: false, fitting: 'a splice plate', later: 'Frames 2.3 (printed) and 2.6 (bought)' },
  printed: { what: 'a printed node that sockets the beam ends', b: 'either', slot: false, made: false, fitting: 'a printed node', later: 'Frames 2.3' },
};

// One kind's stiffness for a 20 mm series profile: bending (about either axis across the beam) and twist, N·mm/rad
const guess = (kind, bending, twist, why) => ({
  bending: { value: bending, unit: 'N·mm/rad', rule: `How stiffly a ${kind} join holds the end of a against turning across its axis, for a 20 mm series profile: ${why}`, kind: 'estimate', source: 'A working guess of @rulecad/frames, made without a measurement or a published figure: the joint rig (issue 264) measures it and cad measured replaces it', checked: CHECKED },
  twist: { value: twist, unit: 'N·mm/rad', rule: `How stiffly a ${kind} join holds the end of a against twisting about its own axis, for a 20 mm series profile: ${why}`, kind: 'estimate', source: 'A working guess of @rulecad/frames, made without a measurement or a published figure: the joint rig (issue 264) measures it and cad measured replaces it', checked: CHECKED },
});

/**
 * Each kind's stiffness, bending and twist, for a 20 mm series profile, as springs at the end of a in a frame's solve
 * (@rulecad/fea/frame's end joins). Every one is an estimate: a joint's stiffness is the honest unknown of a frame, and
 * the joint rig measures it. A profile of another size is scaled by the cube of its width over 20 mm (JOIN_SCALE).
 * @type {Record<string, { bending: object, twist: object }>}
 */
export const JOIN_STIFFNESS = {
  blind: guess('blind', 1.5e6, 3e5, 'one screw on the beam\'s axis, clamped by its head on the slot\'s lips: the lips bend first, and twist is held by friction alone'),
  'end-tap': guess('end-tap', 2e6, 4e5, 'one screw on the beam\'s axis, its head on the far face of b: stiffer than a blind join, as b\'s far wall clamps too; twist by friction alone'),
  bracket: guess('bracket', 3e6, 1e6, 'a bought cast bracket and two slot nuts; a printed bracket is taken at JOIN_PRINTED of it'),
  gusset: guess('gusset', 6e6, 3e6, 'a flat plate over the joint with two or more screws each side: the widest stance of any kind'),
  cube: guess('cube', 3e6, 2e6, 'a three-way corner with the ends screwed into it'),
  hidden: guess('hidden', 1.5e6, 5e5, 'an inner connector clamped in the slots, held by friction and a set screw'),
  anchor: guess('anchor', 2e6, 5e5, 'an anchor connector in a pocket, pulled tight by its screw'),
  mitre: guess('mitre', 1e6, 5e5, 'two mitred ends held by a corner key or plate: the key\'s own stiffness'),
  pivot: guess('pivot', 1.5e6, 5e5, 'a pivot, free about its pin (its joint says which way): this figure is for the other two rotations'),
  splice: guess('splice', 5e6, 3e6, 'two ends held by a plate along both beams'),
  printed: guess('printed', 5e5, 3e5, 'a printed node: plastic, so far softer than the aluminium it joins'),
};
/** A printed fitting's stiffness beside a bought one's, and the size scale, each with what it rests on. */
export const JOIN_SCALE = {
  printed: { value: 0.3, unit: '', rule: 'A printed fitting\'s stiffness as a share of the bought one\'s: PLA or PETG has a modulus of about 2 to 3.5 GPa against cast aluminium\'s 70 GPa, and a printed fitting is drawn thicker to make some of that up', kind: 'estimate', source: 'A working guess of @rulecad/frames: the joint rig (issue 264) measures it', checked: CHECKED },
  size: { value: 3, unit: '', rule: 'A join on a profile of another size is scaled by its width over 20 mm to this power: a guess between a bolted joint (its screw grows with the profile) and a section\'s own bending stiffness', kind: 'estimate', source: 'A working guess of @rulecad/frames', checked: CHECKED },
};

/** How deep a join taps the end of a, with what it rests on. */
export const JOIN_TAP = { value: 1.5, unit: 'diameters', rule: 'A join taps the end of a as deep as the thread engagement asks in the beam\'s metal (engagement in @rulecad/fixings), with the screw\'s tip room (fixings.tip_room) and this many diameters more, so a screw of a sold length both engages fully and stops short of the bottom: the step between sold lengths is up to one diameter, and half a diameter more keeps a screw that only just needs the next length off the bottom', kind: 'default', source: 'A working figure of @rulecad/frames, from the steps in the m5 set\'s sold lengths (20, 25, 30, 35 mm)', checked: CHECKED };
const classOf = (mat) => { const E = mat?.modulus; return E == null ? 'aluminium' : E < 20000 ? 'plastic' : E < 100000 ? 'aluminium' : 'steel'; };

/**
 * The stiffness a join of this kind is taken to have between these beams, as numbers and as an end join for
 * @rulecad/fea/frame ({ rx: twist, ry, rz: bending, in N·mm/rad }), with what it rests on.
 * @param {string} kind @param {object} beam the beam whose end is joined (a) @param {{ fitting?: 'printed' | 'bought' }} [o]
 */
export function joinStiffness(kind, beam, o = {}) {
  const s = JOIN_STIFFNESS[kind];
  if (!s) throw new Error(`joinStiffness: no kind of join ${shown(kind)}: there are ${Object.keys(JOINS).join(', ')}`);
  const w = Math.max(beam.profile.width, beam.profile.height), scale = (w / 20) ** JOIN_SCALE.size.value, printed = o.fitting === 'printed' && JOINS[kind].fitting && kind !== 'printed' ? JOIN_SCALE.printed.value : 1;
  const bending = s.bending.value * scale * printed, twist = s.twist.value * scale * printed;
  return { bending, twist, scale, printed: printed !== 1, end: { rx: twist, ry: bending, rz: bending }, kind: 'estimate',
    rests: [s.bending, s.twist, ...(scale !== 1 ? [JOIN_SCALE.size] : []), ...(printed !== 1 ? [JOIN_SCALE.printed] : [])].map((r) => ({ value: r.value, unit: r.unit, kind: r.kind, source: r.source })) };
}

// The place across the beam from a place, on the same line (front.1 for back.1), or null
function across(b, p) {
  return b.places.find((q) => Math.abs(q.normal[0] + p.normal[0]) < 1e-9 && Math.abs(q.normal[1] + p.normal[1]) < 1e-9 && Math.abs(p.normal[0] * (q.at[1] - p.at[1]) - p.normal[1] * (q.at[0] - p.at[0])) < 1e-6) ?? null;
}

/**
 * A join between two beams as numbers: the operations it puts on each, the screws that hold it (each by the bore in
 * a's end it goes into), the fitting a later release draws for it, its stiffness, and what to know. Bad input is
 * refused by name.
 * @param {string} kind one of JOINS
 * @param {{ beam: object, end: string }} a a beam's model and its end: a, b, or one bore of it (a.2) where the end has several
 * @param {{ beam: object, address: string }} b a beam's model and a place on it: a face with a distance (back@120), or an end
 * @param {{ screw?: string, fitting?: 'printed' | 'bought' }} [o] screw: the screw a blind or end-tap join takes, by its thread and head ("M5 button"; the bore's thread with the kind's head where left out)
 * @returns {{ kind: string, what: string, says: string, a: { end: string, bores: string[], ops: object[] }, b: { address: string, place: string | null, face: string | null, slot: string | null, distance: number | null, end: string | null, ops: object[], across?: { place: string, slot: string | null } },
 *   screws: { screw: string, thread: string, head: string, bore: string }[], fitting: { what: string, later: string, choice: string | null } | null, stiffness: object, findings: object[] }}
 */
export function joinModel(kind, a, b, o = {}) {
  const what = `joinModel`;
  const spec = JOINS[kind];
  if (!spec) throw new Error(`${what}: no kind of join ${shown(kind)}: there are ${Object.keys(JOINS).join(', ')}`);
  if (a?.beam?.kind !== 'beam' || b?.beam?.kind !== 'beam') throw new Error(`${what}: a and b are each { beam, ... } with a beam's model (beamModel)`);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the options are { screw, fitting } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!['screw', 'fitting'].includes(k)) throw new Error(`${what}: no option "${k}": it takes screw, fitting`);
  const A = a.beam, B = b.beam, w = `${what}: a ${kind} join of ${A.name} to ${B.name}`;
  if (o.fitting != null && !FITTINGS.includes(o.fitting)) throw new Error(`${w}: fitting is ${FITTINGS.join(' or ')} (got ${shown(o.fitting)})`);
  if (o.fitting != null && !spec.fitting) throw new Error(`${w}: a ${kind} join has no fitting to choose: its screws hold it. Leave fitting out`);
  if (o.screw != null && !['blind', 'end-tap'].includes(kind)) throw new Error(`${w}: a ${kind} join's screws come with its fitting (${spec.later}): leave screw out`);
  // a: an end, or one bore of it
  const end = typeof a.end === 'string' ? a.end.trim() : null;
  if (!end || !/^[ab](\.\d+)?$/.test(end)) throw new Error(`${w}: a is an end of the beam, a or b, or one bore in it (a.1) (got ${shown(a.end)})`);
  // b: a face with a distance, or an end, as the kind takes
  const address = typeof b.address === 'string' ? b.address.trim() : null, isEnd = address != null && /^[ab]$/.test(address);
  if (!address || (spec.b === 'face' && isEnd) || (spec.b === 'end' && !isEnd)) throw new Error(`${w}: b is ${SIDES[spec.b]} on the other beam, as a ${kind} join meets it (got ${shown(b.address)})`);
  if (!isEnd && !address.includes('@')) throw new Error(`${w}: b names a face with a distance from its end a, where the end of a meets it: ${address}@120, ${address}@-20 or ${address}@50% (got ${shown(address)})`);
  const at = beamAnchor(B, address); // (refused by name where the face is not one of B's, or past its end)
  const place = isEnd ? null : B.places.find((x) => x.name === at.name || (x.face === at.name && x.name.endsWith('.1')));
  const out = { kind, what: spec.what, says: '', a: { end, bores: [], ops: [] }, b: { address, place: place?.name ?? null, face: place?.face ?? null, slot: place?.slot ?? null, distance: isEnd ? null : at.distance, end: isEnd ? address : null, ops: [] },
    screws: [], fitting: spec.fitting ? { what: spec.fitting, later: spec.later, choice: o.fitting ?? null } : null, stiffness: joinStiffness(kind, A, o), findings: [] };
  const says = `${A.name} end ${end} to ${B.name} ${address}`;
  out.says = says;
  if (spec.slot && place && !place.slot) {
    out.findings.push({ level: 'fail', code: 'join.geometry', text: `${says}: a ${kind} join meets a slot, and ${B.name}'s ${place.name} is a closed face: join it to a face with a slot${kind === 'blind' ? ', or use an end-tap join' : ''}`, refs: { kind, place: place.name } });
    return out;
  }
  if (!spec.made) {
    out.findings.push({ level: 'warn', code: 'join.fitting', text: `${says}: a ${kind} join is ${spec.what}. ${spec.fitting[0].toUpperCase()}${spec.fitting.slice(1)} comes with ${spec.later}: until then this join is checked where it meets and stiffens the frame by its estimate, and adds no operations, fittings or screws`, refs: { kind, later: spec.later } });
    return out;
  }
  // blind and end-tap: a screw in each bore of a's end named, tapped
  const e = end[0], bores = A.bores.filter((x) => x.end === e && (end.length === 1 || x.name === end));
  if (!A.profile.bores.length) throw new Error(`${w}: ${A.profile.name} has no bore in its ends to tap, and a ${kind} join screws into one: join it with a bracket or a gusset`);
  if (!bores.length) throw new Error(`${w}: ${A.name} has no bore ${end}: its end ${e} has ${A.bores.filter((x) => x.end === e).map((x) => x.name).join(', ')}`);
  if (bores.length > 1) throw new Error(`${w}: end ${e} of ${A.name} has ${bores.length} bores (${bores.map((x) => x.name).join(', ')}), each meeting ${B.name} at its own place: give a join for each, a: ${bores.map((x) => x.name).join(' and ')}`);
  const bore = bores[0];
  let thread = bore.thread, head = spec.head, length = null;
  if (o.screw != null) {
    let n;
    try { n = parseName(String(o.screw)); } catch (x) { throw new Error(`${w}: screw: ${String(x.message).replace(/^\w+: /, '')}`); }
    if (!['screw', 'thread'].includes(n.item)) throw new Error(`${w}: screw names a screw by its thread and head ("M5 button"): ${o.screw} is not a screw`);
    thread = n.thread; head = n.head ?? head; length = n.length;
  }
  if (thread == null) throw new Error(`${w}: ${A.profile.name}'s bores name no thread (bore_thread): give the screw, { screw: 'M5 button' }`);
  out.a.bores = [bore.name];
  let depth;
  try { const need = engagement(thread, { depth: 1, material: classOf(A.material) }).need; depth = +(need + FIX.tip_room.value + JOIN_TAP.value * fixingModel(thread).major).toFixed(2); }
  catch (x) { throw new Error(`${w}: screw: ${String(x.message).replace(/^\w+: /, '')}`); }
  out.a.ops.push({ op: 'tap', at: bore.name, thread, depth });
  const far = across(B, place);
  if (!far) throw new Error(`${w}: ${B.name} has no face across from ${place.name} on the same line, for the ${kind === 'blind' ? 'key\'s access hole' : 'screw\'s hole'}`);
  const there = `${far.name}@${address.split('@')[1].trim()}`;
  out.b.across = { place: far.name, slot: far.slot };
  out.b.ops.push(kind === 'blind' ? { op: 'access', at: there, thread, through: 'beam' } : { op: 'drill', at: there, thread, kind: 'clearance', through: 'beam' });
  out.screws.push({ screw: `${thread}${length != null ? `x${length}` : ''} ${head}`, thread, head, bore: bore.name });
  if (kind === 'blind' && head !== 'button') out.findings.push({ level: 'info', code: 'join.fitting', text: `${says}: a blind join's head slides in ${B.name}'s slot, and a button head is the usual one; ${head} is checked as drawn`, refs: { kind, head } });
  return out;
}

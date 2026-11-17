// A beam: a length of a profile. Its model holds what the length is worth (mass and centre of mass from the section
// and the alloy, the figures to design it with), what it is cut from, and the anchors an assembly places it and
// anything on it by: its two ends, the bores in each end, and every place a face offers (a slot, or a closed face).
// Its solid comes at two display levels: a plain box for a link, the true section for a preview.
//
// A beam lies along z: end a at z = 0, end b at z = length, the section in x and y as profileModel draws it (the
// middle of its envelope on the z axis, top +y, bottom -y, front -x, back +x). Units: mm, grams, degrees.
import jscad from '@jscad/modeling';
import { profileModel, section, beamFigures, outline, DEFAULTS } from './profile.mjs';
import { opsOf, opCutters } from './ops.mjs';
import { printOptions, printedOf } from './printing.mjs';

const { cuboid, cylinder, polygon } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { subtract } = jscad.booleans;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const FACES = ['top', 'bottom', 'front', 'back'];
const END_KINDS = ['cut', 'tapped'], PRINTED_ENDS = ['cut', 'tapped', 'insert', 'nut'];
const DISPLAYS = ['link', 'preview'];
const OPTIONS = ['length', 'ends', 'ops', 'material', 'given', 'cells', 'display', 'tracks', 'printed'];
const ROUND = ['round-tube', 'round-bar'];

/**
 * @typedef {import('./profile.mjs').Profile} Profile
 * @typedef {{ origin: number[], axis: number[], ref: number[] }} Anchor a point, the direction out of the beam there, and
 *   a direction square to it that fixes the turn about it: at an end, the beam's up (+y); on a face, along the beam toward end b
 * @typedef {{ name: string, face: 'top' | 'bottom' | 'front' | 'back', index: number, slot: string | null, at: [number, number], normal: [number, number], along: [number, number], depth: number }} Place
 *   a place a face offers along the whole beam: its slot family (null where the face is closed there), where it meets
 *   the face in the section, and how far the slot goes in (0 for a closed face)
 * @typedef {{ name: string, end: 'a' | 'b', at: [number, number], diameter: number, thread: string | null, tapped: boolean }} EndBore
 * @typedef {{ kind: 'beam', name: string, title: string, profile: Profile, length: number,
 *   ends: { a: { kind: 'cut' | 'tapped', thread: string | null }, b: { kind: 'cut' | 'tapped', thread: string | null } },
 *   material: { name: string, density: number | null, modulus: number | null, given: boolean } | null,
 *   area: number, centroid: [number, number], mass: number | null, centreOfMass: [number, number, number],
 *   weight: { computed: number | null, sheet: number | null, difference: number | null },
 *   figures: Record<string, { value: number | null, unit: string, kind: string, source: string, from: 'sheet' | 'outline' }>,
 *   places: Place[], bores: EndBore[], anchors: Record<string, Anchor>, ops: object[], bought: true, printed: false,
 *   rests: object[], findings: object[] }} Beam
 */

// ends: one kind for both, [a, b], or { a, b }; a printed beam's may be an insert or a captive nut as well
function endsOf(what, ends, m, printed = null) {
  const pair = ends == null ? ['cut', 'cut'] : typeof ends === 'string' ? [ends, ends] : Array.isArray(ends) ? ends : typeof ends === 'object' ? [ends.a ?? 'cut', ends.b ?? 'cut'] : null;
  if (!pair || pair.length !== 2) throw new Error(`${what}: ends is ${END_KINDS.join(' or ')} for both ends, [a, b], or { a, b } (got ${shown(ends)})`);
  if (ends && typeof ends === 'object' && !Array.isArray(ends)) for (const k of Object.keys(ends)) if (!['a', 'b'].includes(k)) throw new Error(`${what}: ends names end a and end b (got "${k}")`);
  const threaded = m.bores.filter((b) => b.thread != null);
  return Object.fromEntries(pair.map((k, i) => {
    const end = 'ab'[i];
    if (printed) {
      if (!PRINTED_ENDS.includes(k)) throw new Error(`${what}: a printed beam's end ${end} is ${PRINTED_ENDS.join(', ')} (tapped is printed as the beam's printed.end, ${printed.end}) (got ${shown(k)})`);
      const fix = k === 'tapped' ? printed.end : k;
      return [end, { kind: fix, thread: fix === 'cut' ? null : m.end?.thread ?? null }];
    }
    if (!END_KINDS.includes(k)) throw new Error(`${what}: end ${end} is ${END_KINDS.join(' or ')} (got ${shown(k)}). A mitre, a drilled hole and the rest are operations: { ops: [{ op: 'mitre', at: 'a', angle: 45, about: 'top' }] }`);
    if (k === 'tapped' && !threaded.length) throw new Error(`${what}: end ${end} is tapped, and ${m.name} has no bore with a thread to tap (bore_thread): leave it cut, or give the profile a bore_thread`);
    return [end, { kind: k, thread: k === 'tapped' ? threaded[0].thread : null }];
  }));
}

/**
 * A beam as numbers: a length of a profile, its mass and centre of mass from the section and the alloy, the figures to
 * design it with, and its anchors. A beam is bought: it is cut from stock, and its supply is checked.
 * @param {Profile | string | object} profile a profile's model, or what profileModel takes ('2040-misumi-hfs5', or a rule set)
 * @param {{ length: number, ends?: 'cut' | 'tapped' | ['cut' | 'tapped', 'cut' | 'tapped'] | { a?: 'cut' | 'tapped', b?: 'cut' | 'tapped' },
 *   ops?: object[], material?: string, given?: object, cells?: number }} o length: mm, end a to end b (on the long side where
 *   an end is mitred); ends: each end cut square (the default), or tapped (a tap op at that end, in the profile's bore_thread);
 *   ops: operations, each { op, at, ... } as OPS lists (cut, mitre, tap, access, drill, counterbore, pocket, notch,
 *   deburr), placed by an address on the beam (a, a.1, top@120); the model's ops are them worked out, dimensioned from end a; material: a material set's name in place of the profile's
 *   alloy (so a frame can be weighed in another metal or a plastic); given: profileModel's third argument; cells: raster
 *   cells for the torsion constant where the sheet gives none
 * @returns {Beam}
 */
export function beamModel(profile, o = {}) {
  const what = 'beamModel';
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the second argument is { length, ends, material } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!OPTIONS.includes(k)) throw new Error(`${what}: no option "${k}": it takes ${OPTIONS.join(', ')}`);
  if (!(isNum(o.length) && o.length > 0)) throw new Error(`${what}: length is a number above 0, in mm from end a to end b (got ${shown(o.length)})`);
  const given = o.given ?? {}, pr = o.printed != null && o.printed !== false ? printOptions(what, o.printed) : null;
  const base = profile?.kind === 'profile' ? profile : profileModel(profile, {}, given);
  let m = base;
  // printed: in the profile's plastic, or PLA where the profile is a metal's (a printed beam of an aluminium section)
  const material = o.material ?? (pr && !base.material?.figures?.softening ? 'pla' : undefined);
  const changed = material != null && material !== base.material?.name;
  if (changed) {
    if (typeof material !== 'string') throw new Error(`${what}: material is a material set's name, such as al6063-t5 (got ${shown(o.material)})`);
    // the same profile in another material: its own figures, the material changed, and the measured outline kept
    m = profileModel({ name: m.name, part: 'profile', rules: m.figures }, { material }, { ...given, ...(m.measured ? { outline: m.measured } : {}) });
  }
  const L = o.length, ends = endsOf(what, o.ends, m, pr), s = section(m, { torsion: false }), fig = beamFigures(m, { cells: o.cells });
  if (changed) fig.massPerMetre = { value: s.massPerMetre, unit: 'kg/m', kind: 'derived', source: `worked out from the ${s.measured ? 'measured' : 'drawn'} outline of ${m.name} and the density of ${m.material?.name}`, from: 'outline' };
  const density = m.material?.density ?? null, mass = density != null ? (s.area * L * density) / 1000 : null; // mm² x mm x g/cm³ / 1000 = g
  const sheetMass = !changed && m.sheet.massPerMetre != null ? m.sheet.massPerMetre * L : null; // kg/m x mm = g
  const weight = { computed: mass, sheet: sheetMass, difference: mass != null && sheetMass != null ? mass / sheetMass - 1 : null };
  const centreOfMass = [+s.centroid[0].toFixed(6), +s.centroid[1].toFixed(6), L / 2]; // (to a millionth: a symmetric section's centroid is a rounding error off 0)
  // the places a face offers, numbered along each face (top.1, top.2), with top alone for the first
  const places = [];
  for (const face of FACES) {
    const list = [...m.faces[face]].sort((p, q) => p.index - q.index || (q.at[0] * p.normal[0] + q.at[1] * p.normal[1]) - (p.at[0] * p.normal[0] + p.at[1] * p.normal[1]));
    list.forEach((p, i) => places.push({ name: `${face}.${i + 1}`, face, index: p.index, slot: p.slot, at: [...p.at], normal: [...p.normal], along: [...p.along], depth: p.slot ? m.slots[p.slot].cavityDepth : 0 }));
  }
  const bores = ['a', 'b'].flatMap((end) => m.bores.map((b, i) => ({ name: `${end}.${i + 1}`, end, at: [...b.at], diameter: b.diameter, thread: b.thread, tapped: ends[end].kind === 'tapped' && b.thread != null })));
  const up = [0, 1, 0], anchors = { a: { origin: [0, 0, 0], axis: [0, 0, -1], ref: up }, b: { origin: [0, 0, L], axis: [0, 0, 1], ref: up } };
  for (const b of bores) anchors[b.name] = { origin: [b.at[0], b.at[1], b.end === 'a' ? 0 : L], axis: [0, 0, b.end === 'a' ? -1 : 1], ref: up };
  for (const p of places) {
    const a = { origin: [p.at[0], p.at[1], L / 2], axis: [p.normal[0], p.normal[1], 0], ref: [0, 0, 1] };
    anchors[p.name] = a; if (p.name.endsWith('.1')) anchors[p.face] = a;
  }
  // what to know: the mass beside the sheet's, and the length beside what the profile is sold and cut in
  const findings = [], title = `${m.title}, ${mm(L)} mm`, name = `${m.name} x ${mm(L)}`;
  if (mass == null) findings.push({ level: 'warn', code: 'beam.mass', text: `${name}: ${m.name} names no material with a density, so the beam has no mass: give one ({ material: 'al6063-t5' })`, rule: 'material' });
  else {
    findings.push({ level: 'info', code: 'beam.mass', text: `${name}: ${mm(mass)} g, from the ${s.measured ? 'measured' : 'drawn'} section's ${mm(s.area)} mm² and ${m.material.name}'s density ${density} g/cm³${sheetMass != null ? `; the sheet's ${m.sheet.massPerMetre} kg/m gives ${mm(sheetMass)} g (${weight.difference > 0 ? '+' : ''}${(weight.difference * 100).toFixed(1)}%)` : ''}`, values: { mass, ...(sheetMass != null ? { sheet: sheetMass } : {}) }, refs: { material: m.material.name } });
    if (weight.difference != null && Math.abs(weight.difference) > DEFAULTS.section.value) findings.push({ level: 'warn', code: 'beam.mass', text: `${name}: the section weighs ${weight.difference > 0 ? '+' : ''}${(weight.difference * 100).toFixed(1)}% from the sheet's mass per metre, past the ${DEFAULTS.section.value * 100}% a drawn outline is held to: the drawn section is not the maker's (a hollow or a hooked lip it does not describe), so weigh it by the sheet's ${mm(sheetMass)} g`, rule: 'mass_per_metre', values: { mass, sheet: sheetMass, difference: weight.difference } });
  }
  const { lengths, cutMin, cutMax } = m.supply, longest = Math.max(cutMax ?? 0, ...lengths.filter(isNum));
  if (longest > 0 && L > longest + 1e-9) findings.push({ level: 'warn', code: 'beam.length', text: `${name}: ${mm(L)} mm is longer than ${m.name} is sold or cut in (${mm(longest)} mm): it needs a joint along its length`, rule: cutMax != null ? 'cut_length_max' : 'lengths', values: { length: L, longest } });
  if (cutMin != null && L < cutMin - 1e-9) findings.push({ level: 'warn', code: 'beam.length', text: `${name}: ${mm(L)} mm is shorter than the ${mm(cutMin)} mm the maker cuts ${m.name} to: cut it yourself, or ask`, rule: 'cut_length_min', values: { length: L, cutMin } });
  const rests = [m.figures.area, m.figures.mass_per_metre, ...(m.material ? [m.material.figures.density] : [])].filter(Boolean).map((f) => ({ value: f.value, ...(f.unit ? { unit: f.unit } : {}), kind: f.kind, source: f.source }));
  const b = { kind: 'beam', name, title, profile: m, length: L, ends,
    material: m.material ? { name: m.material.name, density, modulus: m.material.modulus, given: changed } : null,
    area: s.area, centroid: s.centroid, mass, centreOfMass, weight, figures: fig, places, bores, anchors, ops: [], bought: true, printed: false, rests, findings };
  // operations: those given, a tap for an end said to be tapped, and a square cut at an end with no cut of its own
  const given_ = o.ops ?? [];
  if (!Array.isArray(given_)) throw new Error(`${what}: ops is a list of operations, [{ op: 'tap', at: 'a' }] (got ${shown(o.ops)})`);
  // printed: a tap at an end is the beam's printed end (an insert or a captive nut), a feature of the print, not an operation
  const list = pr ? given_.filter((x) => { if (x?.op !== 'tap' || !/^[ab](\.|$)/.test(String(x.at ?? '').trim())) return true; const e = String(x.at).trim()[0]; ends[e] = { kind: pr.end, thread: m.end?.thread ?? null }; return false; }) : [...given_];
  for (const e of ['a', 'b']) if (ends[e].kind === 'tapped' && !list.some((x) => x?.op === 'tap' && String(x.at ?? '').trim()[0] === e)) list.push({ op: 'tap', at: e });
  let done;
  try { done = opsOf(b, list, beamAnchor); } catch (e) { throw new Error(`${what}: ${String(e.message).replace(/^beamAnchor: /, '')}`); }
  for (const x of done.ops) if (x.op === 'tap') { ends[x.end] = { kind: 'tapped', thread: x.thread }; for (const bo of bores) if (x.bores.includes(bo.name)) bo.tapped = true; }
  if (!pr) for (const e of ['a', 'b']) if (!done.ops.some((x) => x.end === e && (x.op === 'cut' || x.op === 'mitre'))) done.ops.push({ op: 'cut', at: e, end: e, face: null, place: null, distance: e === 'a' ? 0 : L, line: `cut end ${e} square`, implied: true });
  b.ops = done.ops.sort((p, q) => p.distance - q.distance); b.findings.push(...done.findings);
  return pr ? printedOf(b, pr, { a: ends.a.kind, b: ends.b.kind }) : b;
}

/**
 * A beam as a solid, lying along z from end a at z = 0. display: 'link' is a plain box of the section's envelope (a
 * round section a twelve-sided prism): 12 triangles, light enough for a link and an overlap check. 'preview' (the
 * default) is the true section, every slot, bore and hollow, run the whole length. Each operation is cut from it: a
 * mitre from the link too (its envelope changes), the holes, pockets and notches from the preview only. tracks: a link
 * with its V tracks cut along it (each slot with a track_width: its V mouth, and the opening under it to the cavity's
 * depth), for an overlap check where V-wheels run in them: a rim in its track is clear of it, a rim out of it is not.
 * @param {Beam | Profile | string | object} m a beam's model, or a profile with { length } as beamModel takes
 * @param {{ display?: 'link' | 'preview', tracks?: boolean, length?: number, ends?: any, material?: string, given?: object, cells?: number }} [o]
 * @returns {object} a JSCAD geom3, with .model holding beamModel's numbers (its anchors and mass)
 */
export function beam(m, o = {}) {
  const what = 'beam', display = o.display ?? 'preview';
  if (!DISPLAYS.includes(display)) throw new Error(`${what}: display is ${DISPLAYS.join(' or ')} (got ${shown(display)})`);
  const b = m?.kind === 'beam' ? m : beamModel(m, o), p = b.profile, L = b.length;
  let solid;
  if (display === 'link') solid = ROUND.includes(p.family) ? cylinder({ radius: p.width / 2, height: L, segments: 12, center: [0, 0, L / 2] }) : cuboid({ size: [p.width, p.height, L], center: [0, 0, L / 2] });
  else solid = extrudeLinear({ height: L }, polygon({ points: outline(p).loops }));
  if (display === 'link' && o.tracks) { const tracks = trackCutters(p, L); if (tracks.length) solid = subtract(solid, ...tracks); }
  const cuts = opCutters(b, { envelope: display === 'link' }); // (a link keeps its box, cut only where an end is mitred)
  if (cuts.length) solid = subtract(solid, ...cuts);
  return Object.assign(solid, { model: b, display });
}

// The free space of each V track along a beam, a little longer than it: the V from just outside the face (its sides
// carried on out) to the opening, then the opening's width down to the cavity's depth (the cavity is wider still)
function trackCutters(p, L) {
  const out = [], RAD = Math.PI / 180;
  for (const face of FACES) for (const q of p.faces[face] ?? []) {
    const s = q.slot ? p.slots[q.slot] : null;
    if (!(s?.trackWidth > 0)) continue;
    const t = Math.tan((s.trackAngle / 2) * RAD), deep = (s.trackWidth - s.opening) / 2 / t, D = Math.max(s.cavityDepth, deep), e = 0.5;
    const n = q.normal, u = [-n[1], n[0]], at = (w, v) => [q.at[0] + u[0] * w - n[0] * v, q.at[1] + u[1] * w - n[1] * v];
    let loop = [[-(s.trackWidth / 2 + e * t), -e], [-s.opening / 2, deep], [-s.opening / 2, D], [s.opening / 2, D], [s.opening / 2, deep], [s.trackWidth / 2 + e * t, -e]].map(([w, v]) => at(w, v));
    if (loop.reduce((a, P, i) => { const Q = loop[(i + 1) % loop.length]; return a + P[0] * Q[1] - Q[0] * P[1]; }, 0) < 0) loop = loop.reverse();
    out.push(jscad.transforms.translate([0, 0, -1], extrudeLinear({ height: L + 2 }, polygon({ points: loop }))));
  }
  return out;
}

/**
 * An anchor on a beam by its address: 'a' and 'b' are its ends, 'a.1' the first bore in end a, 'top' the first place on
 * its top face and 'top.2' the second, each with a distance after '@': 'top@120' is 120 mm from end a, 'top@-20' 20 mm
 * from end b, 'top@50%' the middle. A face's place with no distance is at the middle.
 * @param {Beam} b a beam's model @param {string} address
 * @returns {Anchor & { name: string, distance: number | null }}
 */
export function beamAnchor(b, address) {
  const what = 'beamAnchor';
  if (b?.kind !== 'beam') throw new Error(`${what}: give a beam's model (beamModel), not ${shown(b)}`);
  if (typeof address !== 'string') throw new Error(`${what}: an address is a string such as 'a', 'a.1', 'top@120', 'top.2@-20' or 'top@50%' (got ${shown(address)})`);
  const [name, at, ...more] = address.trim().split('@');
  const a = b.anchors[name];
  if (!a || more.length) throw new Error(`${what}: ${b.name} has no "${address}": it has ${Object.keys(b.anchors).join(', ')}, and a face's place takes a distance after @ (top@120, top@-20, top@50%)`);
  if (at == null) return { name, ...a, origin: [...a.origin], distance: null };
  if (/^[ab](\.|$)/.test(name)) throw new Error(`${what}: "${address}": an end is where it is, so it takes no distance; a face does (top@120)`);
  const t = at.trim(), share = /^(-?\d+(?:\.\d+)?)%$/.exec(t), L = b.length;
  if (!share && !/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`${what}: "${address}": the distance is in mm from end a (120), from end b when negative (-20), or a share of the length (50%)`);
  const z = share ? (Number(share[1]) / 100) * L : t.startsWith('-') ? L + Number(t) : Number(t);
  if (!(z >= -1e-9 && z <= L + 1e-9)) throw new Error(`${what}: "${address}" is past the end of ${b.name}: it is ${mm(L)} mm long, so a distance is from 0 to ${mm(L)} mm, -${mm(L)} to -0 from end b, or 0% to 100%`);
  return { name, origin: [a.origin[0], a.origin[1], z], axis: [...a.axis], ref: [...a.ref], distance: z };
}

/**
 * What a printer can make of it, as findings. A printed beam (beamModel's printed) says how it prints and what stops it:
 * a slot in a side face lying down, lips that hang out over the cavity, a length past the bed. A beam of a profile not
 * printed is bought and cut from stock, and so is a profile: both fail.
 * @param {Beam | Profile | object} x a beam's or a profile's model, or a solid beam() or printedBeam() made
 * @returns {{ level: 'pass' | 'fail', code: string, text: string }[]}
 */
export function printable(x) {
  const m = x?.model?.kind === 'beam' ? x.model : x;
  if (m?.kind === 'beam' && m.printed) return m.findings.filter((f) => f.code === 'beam.printable');
  if (m?.kind === 'beam') return [{ level: 'fail', code: 'beam.printable', text: `${m.name} is a bought beam: cut from ${m.profile.name} stock and fitted, not printed. What prints is the parts that fasten to it; a beam given { printed: true } prints (profile-2020-printed lies down)` }];
  if (m?.kind === 'profile') return [{ level: 'fail', code: 'beam.printable', text: `${m.name} is a bought profile: beams of it are cut from stock, not printed` }];
  throw new Error(`printable: give a beam's model (beamModel), a profile's (profileModel), or a solid beam() made, not ${shown(x)}`);
}

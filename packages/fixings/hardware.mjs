// Reference hardware: a screw, a nut, a washer and an insert as light solids, so an assembly can show them and its
// overlap check can see them without thousands of triangles each. The thread is a plain cylinder at the major
// diameter, a head is its outline with no socket, and a bore is drawn just clear of the thread it takes. Each has a
// twin that gives its numbers: the anchors an assembly places it by and its mass. All stand on the z axis.
import jscad from '@jscad/modeling';
import { DEFAULTS, fixingOf, headOf, nutOf, lengthOf, screwName, figure, cite, rest, finding, positive, oneOf, shown, mm, r3, a } from './model.mjs';
import { optionsOf } from './holes.mjs';
import { lathe, turnedVolume, booleans, LIGHT } from './draw.mjs';
import { threadModel, threadedScrew, threadedNut } from './threads.mjs';
import { materialOf } from './strength.mjs';

/**
 * @typedef {import('./model.mjs').Fixing} Fixing a fixing's model, as fixingModel gives it
 */

const { polygon, circle } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { translate } = jscad.transforms;
const COS30 = Math.cos(Math.PI / 6), CLEAR = 1 / Math.cos(Math.PI / LIGHT); // a bore's corners lie this far out, so its flats clear the thread
const anchor = (z, up = 1) => ({ origin: [0, 0, z], axis: [0, 0, up] });
const MATERIALS = { steel: 'steel_density', stainless: 'stainless_density' };
// A mass in grams from a volume in mm³, with the density it used
function massOf(what, volume, material, density = MATERIALS[oneOf(what, 'material', material, Object.keys(MATERIALS))]) {
  return { mass: r3((volume * DEFAULTS[density].value) / 1000), density: rest(`fixings.${density}`, DEFAULTS[density]) };
}
// The area a threaded length weighs as: a 60° thread's, at its pitch diameter; a plastic screw's, midway between its root and its crests
function threadArea(what, fx) {
  const d = fx.form === 'plastic' && fx.figures.root_diameter ? (fx.major + figure(what, fx, 'root_diameter')) / 2 : fx.major - DEFAULTS.pitch_diameter.value * fx.pitch;
  return (Math.PI / 4) * d * d;
}
// The thread of a piece of hardware drawn for printing (display: 'thread'): its model, or null for the light solid
const DISPLAYS = ['plain', 'thread'];
function drawnThread(what, fx, o, extra) {
  if (oneOf(what, 'display', o.display ?? 'plain', DISPLAYS) === 'plain') return null;
  return threadModel(fx, { what, printer: o.printer, sets: o.sets, mate: o.mate, gap: o.gap, flanks: o.flanks, hand: o.hand, starts: o.starts, pitch: o.pitch, segments: o.segments, ...extra });
}
const weighed = (name, mass, material, how) => finding('info', `${name}: ${mm(mass)} g of ${material}, an estimate from its outline (${how})`, 'fixing.mass', { values: { mass }, refs: { material } });

/**
 * @typedef {{ origin: number[], axis: number[] }} Anchor a point and a direction an assembly places a part by, as a motor's are
 */

/**
 * A screw as numbers: its outline, the anchors an assembly places it by, and its mass.
 * It stands on the z axis with its head up: the face its head seats on is at z = 0 and its thread runs down to
 * z = -length. A countersunk screw and a set screw are measured overall, so their top is at z = 0.
 * A printed bolt ('M8x20 hex printed') keeps the word printed in its name and is weighed in its plastic; its strength
 * is printedBoltModel's.
 * @param {Fixing | string} m a screw's model or name ('M3x12 cap'), or a thread with { length, head }
 * @param {{ length?: number, head?: string, material?: string | object, anyLength?: boolean, sets?: object, display?: 'plain' | 'thread', printer?: object,
 *   mate?: 'printed' | 'bought', gap?: number, flanks?: 'printed' | 'standard', hand?: 'right' | 'left', segments?: number }} [o]
 *   length, head: where the model has none, or to change them; material: for its mass, steel (the default) or
 *   stainless, or for a printed bolt its plastic (default PLA); display: plain
 *   (the light solid, the default) or thread (its thread drawn, to print it standing on its head: then printer, mate,
 *   gap, flanks, hand and segments are threadModel's)
 * @returns {{ item: 'screw', name: string, printed?: boolean, thread: string, head: string, length: number, sold: boolean | null, major: number, headDiameter: number, headHeight: number, sink: number, top: number, key: number | null,
 *   mass: number, material: string, display: 'plain' | 'thread', threaded: object | null, anchors: { seat: Anchor, tip: Anchor, axis: Anchor, top: Anchor }, profile: number[][], rests: object[], findings: object[] }}
 *   sink: how deep a countersunk head's cone goes; top: the z of the head's top; mass: grams; threaded: threadModel's numbers where its thread is drawn;
 *   anchors: seat (under the head, or the flush face of a countersunk screw), tip, axis (the thread's, at the seat) and top (where a key goes in)
 */
export function screwModel(m, o = {}) {
  const what = 'screw';
  optionsOf(what, o, '{ length: 12, head: \'cap\' }');
  const fx = fixingOf(what, m, o);
  if (!['screw', 'thread'].includes(fx.item)) throw new Error(`${what}: ${fx.name} is ${a(fx.item)}, not a screw: use ${fx.item}()`);
  const form = o.head ?? fx.head?.form ?? (fx.made.heads.includes('cap') ? 'cap' : fx.made.heads[0]), head = headOf(what, fx, form);
  if (o.length == null && fx.length == null) throw new Error(`${what}: give a length, in the name ('${fx.thread}x12 ${form}') or as { length: 12 }`);
  const { length, sold } = o.length == null ? fx : form === 'set' ? { length: positive(what, 'length', o.length), sold: null } : lengthOf(what, fx, o.length, !!o.anyLength || !!fx.printed); // (a printed screw is printed at any length)
  const r = fx.major / 2, R = head.across / 2, k = head.height, L = length;
  // The outline, turned about z: from the tip up the thread, out under the head and over it
  const sink = form === 'countersunk' ? Math.min(r3((R - r) / Math.tan((((head.angle ?? 90) / 2) * Math.PI) / 180)), L) : 0;
  const profile = form === 'set' ? [[0, -L], [r, -L], [r, 0], [0, 0]]
    : form === 'countersunk' ? [[0, -L], [r, -L], [r, -sink], [R, 0], [0, 0]]
      : form === 'button' ? [[0, -L], [r, -L], [r, 0], [R, 0], [R, 0.3 * k], [0.55 * R, k], [0, k]]
        : [[0, -L], [r, -L], [r, 0], [R, 0], [R, k], [0, k]]; // (a hexagon head's is its corners: the solid has six of them)
  const top = form === 'set' || form === 'countersunk' ? 0 : k, shank = L - sink;
  const headProfile = form === 'countersunk' ? [[0, -sink], [r, -sink], [R, 0], [0, 0]] : profile.filter(([, z]) => z >= 0).map((p, i) => (i === 0 ? [0, 0] : p));
  const headVolume = form === 'set' ? 0 : form === 'hex' ? (Math.sqrt(3) / 2) * head.flats ** 2 * k : turnedVolume(headProfile);
  // a printed bolt ('M8x20 hex printed') is named as printed and weighed in its plastic (PLA unless material names another): its strength is printedBoltModel's
  const volume = threadArea(what, fx) * shank + headVolume, plastic = fx.printed ? materialOf(what, o.material ?? 'pla', o.sets) : null;
  if (plastic && plastic.cls !== 'plastic') throw new Error(`${what}: ${fx.name} is printed, and ${plastic.name} is no plastic: give a plastic as its material (pla, petg), or name a bought screw ('${screwName(fx, L, form)}'). printedBoltModel('${fx.name}') gives its strength`);
  if (plastic && !plastic.density) throw new Error(`${what}: ${plastic.name} has no density in its rule set, so ${fx.name} cannot be weighed`);
  const material = plastic ? plastic.name : o.material ?? 'steel', w = plastic ? { mass: r3((volume * plastic.density.value) / 1000), density: rest(plastic.density.name, plastic.density) } : massOf(what, volume, material), name = `${screwName(fx, L, form)}${fx.printed ? ' printed' : ''}`;
  const threaded = drawnThread(what, fx, o, { length: shank, top: '-z' }); // (it prints standing on its head, so its tip is up)
  return { item: 'screw', name, ...(fx.printed ? { printed: true } : {}), thread: fx.thread, head: form, length: L, sold, major: fx.major, headDiameter: head.across, headHeight: k, sink, top, key: head.key ?? null, mass: w.mass, material,
    display: threaded ? 'thread' : 'plain', threaded, anchors: { seat: anchor(0), tip: anchor(-L, -1), axis: anchor(0), top: anchor(top) }, profile,
    rests: [rest(cite(fx, 'major_diameter'), fx.figures.major_diameter), rest(cite(fx, 'pitch'), fx.figures.pitch), ...head.figures.map((n) => rest(cite(fx, n), fx.figures[n])), w.density, ...(threaded ? threaded.rests : [])],
    findings: [weighed(name, w.mass, material, 'the thread at its pitch diameter, the head with no socket'), ...(fx.printed ? [finding('info', `${name} is printed in ${material}, not bought: printedBoltModel('${name}', { material: '${material}' }) gives its strength`, 'fixing.printed', { values: { grams: w.mass }, refs: { material } })] : []), ...(threaded ? threaded.findings : [])] };
}

/**
 * A screw as a light solid: its thread a plain cylinder at the major diameter, its head an outline with no socket.
 * An M3x12 cap screw is 96 triangles. With display: 'thread' its thread is drawn as threadModel gives it, in one
 * closed solid that prints standing on its head: thousands of triangles, so only where it is asked for.
 * @param {Fixing | string} m @param {{ length?: number, head?: string, material?: 'steel' | 'stainless', anyLength?: boolean, sets?: object, display?: 'plain' | 'thread', printer?: object,
 *   mate?: 'printed' | 'bought', gap?: number, flanks?: 'printed' | 'standard', hand?: 'right' | 'left', segments?: number }} [o] as screwModel
 * @param {{ union: Function }} [ops] the design's v.ops (a hexagon head is joined to its thread)
 * @returns {object} a JSCAD geom3, with .model holding screwModel's numbers (its anchors and mass)
 */
export function screw(m, o = {}, ops = booleans) {
  const s = screwModel(m, o);
  if (s.threaded) return Object.assign(threadedScrew(s, s.threaded), { model: s });
  if (s.head !== 'hex') return Object.assign(lathe(s.profile, LIGHT), { model: s });
  const r = s.major / 2, R = s.headDiameter / 2, k = s.headHeight;
  return Object.assign(ops.union(lathe([[0, 0], [R, 0], [R, k], [0, k]], 6), lathe([[0, -s.length], [r, -s.length], [r, k / 2], [0, k / 2]], LIGHT)), { model: s });
}

/**
 * A nut as numbers. It stands on the z axis, the face it bears on at z = 0 and its top at z = its height.
 * @param {Fixing | string} m a nut's model or name ('M3 lock nut'), or a thread with { kind }
 * @param {{ kind?: string, material?: 'steel' | 'stainless', sets?: object, display?: 'plain' | 'thread', printer?: object, mate?: 'printed' | 'bought', gap?: number, flanks?: 'printed' | 'standard', hand?: 'right' | 'left', segments?: number }} [o]
 *   kind: hex, square or lock (default the model's, else hex); display: plain (the light solid) or thread (its thread drawn, to print it as it stands)
 * @returns {{ item: 'nut', name: string, thread: string, kind: string, flats: number, across: number, height: number, bore: number, mass: number, material: string, display: 'plain' | 'thread', threaded: object | null,
 *   anchors: { seat: Anchor, top: Anchor, axis: Anchor }, rests: object[], findings: object[] }}
 */
export function nutModel(m, o = {}) {
  const what = 'nut';
  optionsOf(what, o, '{ kind: \'lock\' }');
  const fx = fixingOf(what, m, o);
  if (!['nut', 'thread'].includes(fx.item)) throw new Error(`${what}: ${fx.name} is ${a(fx.item)}, not a nut: use ${fx.item}()`);
  const n = nutOf(what, fx, o.kind ?? fx.nut?.kind ?? 'hex'), area = n.kind === 'square' ? n.flats ** 2 : (Math.sqrt(3) / 2) * n.flats ** 2, material = o.material ?? 'steel';
  const w = massOf(what, (area - threadArea(what, fx)) * n.height, material), name = `${fx.thread} ${n.kind} nut`, threaded = drawnThread(what, fx, o, { length: n.height, internal: true });
  return { item: 'nut', name, thread: fx.thread, kind: n.kind, flats: n.flats, across: n.across, height: n.height, bore: fx.major, mass: w.mass, material, display: threaded ? 'thread' : 'plain', threaded,
    anchors: { seat: anchor(0), top: anchor(n.height), axis: anchor(0) }, rests: [...n.figures.map((k) => rest(cite(fx, k), fx.figures[k])), rest(cite(fx, 'major_diameter'), fx.figures.major_diameter), w.density, ...(threaded ? threaded.rests : [])],
    findings: [weighed(name, w.mass, material, n.kind === 'lock' ? 'a plain hexagon as tall as the nut with its collar' : 'its thread at the pitch diameter'), ...(threaded ? threaded.findings : [])] };
}

/**
 * A nut as a light solid: a hexagon or a square with a plain bore just clear of the thread. With display: 'thread'
 * its thread is drawn as threadModel gives it, in one closed solid that prints as it stands.
 * @param {Fixing | string} m @param {{ kind?: string, material?: 'steel' | 'stainless', sets?: object, display?: 'plain' | 'thread', printer?: object, mate?: 'printed' | 'bought', gap?: number, flanks?: 'printed' | 'standard', hand?: 'right' | 'left', segments?: number }} [o] as nutModel
 * @returns {object} a JSCAD geom3, with .model
 */
export function nut(m, o = {}) {
  const n = nutModel(m, o), sides = n.kind === 'square' ? 4 : 6, R = n.across / 2;
  if (n.threaded) return Object.assign(threadedNut(n, n.threaded), { model: n });
  // a hexagon's corner on x, as the pockets of @rulecad/shapes have it; a square's flats square to x and y
  const outline = polygon({ points: Array.from({ length: sides }, (_, i) => { const t = (2 * Math.PI * (i + (sides === 4 ? 0.5 : 0))) / sides; return [R * Math.cos(t), R * Math.sin(t)]; }) });
  return Object.assign(extrudeLinear({ height: n.height }, jscad.booleans.subtract(outline, circle({ radius: (n.bore / 2) * CLEAR, segments: LIGHT }))), { model: n });
}

/**
 * A plain washer as numbers. It lies on z = 0, its top at z = its thickness.
 * @param {Fixing | string} m a washer's model or name ('M3 washer'), or a thread
 * @param {{ material?: 'steel' | 'stainless', sets?: object }} [o]
 * @returns {{ item: 'washer', name: string, thread: string, bore: number, diameter: number, thickness: number, mass: number, material: string, anchors: { seat: Anchor, top: Anchor, axis: Anchor }, rests: object[], findings: object[] }}
 */
export function washerModel(m, o = {}) {
  const what = 'washer';
  optionsOf(what, o, '{ material: \'stainless\' }');
  const fx = fixingOf(what, m, o);
  if (!['washer', 'thread'].includes(fx.item)) throw new Error(`${what}: ${fx.name} is ${a(fx.item)}, not a washer: use ${fx.item}()`);
  if (!fx.made.washer) throw new Error(`${what}: ${fx.thread} has no washer in its rule set (${fx.set})`);
  const bore = figure(what, fx, 'washer_bore'), diameter = figure(what, fx, 'washer_diameter'), thickness = figure(what, fx, 'washer_thickness'), material = o.material ?? 'steel';
  const w = massOf(what, (Math.PI / 4) * (diameter ** 2 - bore ** 2) * thickness, material), name = `${fx.thread} washer`;
  return { item: 'washer', name, thread: fx.thread, bore, diameter, thickness, mass: w.mass, material, anchors: { seat: anchor(0), top: anchor(thickness), axis: anchor(0) },
    rests: [...['washer_bore', 'washer_diameter', 'washer_thickness'].map((k) => rest(cite(fx, k), fx.figures[k])), w.density], findings: [weighed(name, w.mass, material, 'a flat ring')] };
}

/** A plain washer as a light solid: a flat ring. @param {Fixing | string} m @param {{ material?: 'steel' | 'stainless', sets?: object }} [o] @returns {object} a JSCAD geom3, with .model */
export function washer(m, o = {}) {
  const w = washerModel(m, o), r = (w.bore / 2) * CLEAR, R = w.diameter / 2;
  return Object.assign(lathe([[r, 0], [R, 0], [R, w.thickness], [r, w.thickness]], LIGHT), { model: w });
}

/**
 * A heat-set insert as numbers. It hangs down the z axis from the mouth of its hole: its top at z = 0, flush with the
 * face it went in by, its far end at z = -length.
 * @param {Fixing | string} m an insert's model or name ('M3 insert', 'M3x3 insert'), or a thread
 * @param {{ sets?: object }} [o]
 * @returns {{ item: 'insert', name: string, thread: string, diameter: number, length: number, bore: number, hole: number, mass: number, material: string, anchors: { seat: Anchor, bottom: Anchor, axis: Anchor }, rests: object[], findings: object[] }}
 *   diameter: over its knurls; hole: the hole it melts into, as drawn
 */
export function insertModel(m, o = {}) {
  const what = 'insert';
  optionsOf(what, o, '{}');
  const fx = fixingOf(what, m, o);
  if (!['insert', 'thread'].includes(fx.item)) throw new Error(`${what}: ${fx.name} is ${a(fx.item)}, not an insert: use ${fx.item}()`);
  if (!fx.made.insert) throw new Error(`${what}: ${fx.thread} has no heat-set insert in its rule set (${fx.set})`);
  const diameter = figure(what, fx, 'insert_diameter'), length = figure(what, fx, 'insert_length');
  const w = massOf(what, ((Math.PI / 4) * diameter ** 2 - threadArea(what, fx)) * length, 'brass', 'brass_density'), name = fx.item === 'insert' ? fx.name : `${fx.thread} insert`;
  return { item: 'insert', name, thread: fx.thread, diameter, length, bore: fx.major, hole: figure(what, fx, 'insert_hole'), mass: w.mass, material: 'brass', anchors: { seat: anchor(0), bottom: anchor(-length, -1), axis: anchor(0) },
    rests: [...['insert_diameter', 'insert_length'].map((k) => rest(cite(fx, k), fx.figures[k])), w.density], findings: [weighed(name, w.mass, 'brass', 'a plain tube over its knurls: the alloy is assumed')] };
}

/** A heat-set insert as a light solid: a plain tube. @param {Fixing | string} m @param {{ sets?: object }} [o] @returns {object} a JSCAD geom3, with .model */
export function insert(m, o = {}) {
  const i = insertModel(m, o), r = (i.bore / 2) * CLEAR, R = i.diameter / 2;
  if (!(R > r)) throw new Error(`insert: ${i.name} is ${mm(i.diameter)} mm over its knurls, no wider than its ${mm(i.bore)} mm thread (got ${shown(i.diameter)})`);
  return Object.assign(translate([0, 0, -i.length], lathe([[r, 0], [R, 0], [R, i.length], [r, i.length]], LIGHT)), { model: i });
}

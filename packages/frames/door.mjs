// Printed parts for a door on a frame: a hinge (a leaf screwed into a beam's slot, a leaf screwed through the door, a
// bought screw for its pin), a handle, a turn-button latch and a magnet catch. The door lies over its bay at a
// standoff from the beams' faces, so its hinge leaf's screw heads pass under it; its hinge's axis lies over the
// beam's outer edge at the door's outer face, so the door swings out and away from the frame and never into it.
//
// A hinge's frame (fitted): x along its axis (0 at its middle), y across the hinge beam's face toward the door (0 on
// the slot's centre line), z out of the face (0 on the face). The latch and the catch use the same frame on their
// beam. A handle's: y along it between its feet, x across, z out of the door's face. Units: mm, N, grams, degrees.
import jscad from '@jscad/modeling';
import { hole, fixingModel, nutModel, washerModel } from '@rulecad/fixings';
import { FITTING_DEFAULTS, pfig, printerOf, options, profileOf, slotSide, roundConcave, ccw, combine, sold, screwOf } from './fitting.mjs';
import { partSetup, loadOk, weigh, closingFindings, sheetThickness, sidePart, sideToFit, bendT, PANEL_DEFAULTS } from './panel.mjs';

const { polygon, cylinder } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { union } = jscad.booleans, { hull } = jscad.hulls;
const { translate, transform } = jscad.transforms;
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
const want = () => FITTING_DEFAULTS.margin.value;
const arc = (cx, cy, r, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

/** The working figures of the door's parts, each with what it rests on. */
export const DOOR_DEFAULTS = {
  pin: rule('M4', '', 'A hinge\'s pin is a bought cap screw of this thread through its knuckles, held by a lock nut', 'default', 'A working figure of @rulecad/frames: M4 is sold long enough for a hinge whose two slot nuts sit side by side'),
  door: rule('M3', '', 'The thread of the screws through the door: into a hinge leaf\'s nuts, a handle\'s pilots', 'default', 'A working figure of @rulecad/frames'),
  load: rule(50, 'N', 'The design load at one hinge where none is given: the door\'s weight and a hand leaning on the open door, its share at one hinge, across the pin', 'default', 'A working figure of @rulecad/frames, so every hinge is sized and compared at one named load'),
  knuckles: rule(3, '', 'A hinge has three knuckles: two on the frame\'s leaf, one on the door\'s between them', 'default', 'A working figure of @rulecad/frames'),
  clear: rule(1, 'mm', 'Room between a door (or its leaf) and what it passes: a head, the frame\'s leaf, a knuckle', 'default', 'A working figure of @rulecad/frames'),
  pull: rule(100, 'N', 'The design pull on a handle where none is given: a firm pull on a door that sticks', 'default', 'A working figure of @rulecad/frames'),
  span: rule(64, 'mm', 'A handle\'s screws are this far apart: a common pitch for furniture handles', 'community', 'Furniture handle makers\' hole pitches of 64, 96 and 128 mm; not checked against one standard'),
  finger: rule(25, 'mm', 'Room under a handle\'s grip for the fingers', 'estimate', 'A working figure of @rulecad/frames'),
  magnet: rule([10, 3], 'mm', 'A magnet catch\'s disc magnet, diameter and thickness: a common size; give the one you have', 'estimate', 'A working figure of @rulecad/frames: its pull is not checked, as no figure from a maker is held'),
  open: rule(120, '°', 'How far a door opens where nothing else is said', 'default', 'A working figure of @rulecad/frames: past square, short of laying it back on the frame'),
};

// ---------- a hinge ----------
/**
 * A printed hinge for a door over a bay: the frame's leaf lies on the hinge beam's face, two screws into slot nuts on
 * its slot, its two knuckles risen over the beam's outer edge; the door's leaf lies on the door's outer face, its knuckle
 * between them, two screws through the door into nuts; a bought cap screw is the pin. The door stands off the face by
 * the frame leaf, a head and the clearance, so it passes over the heads; its edge on the hinge side stops a knuckle and
 * the clearance from the axis. Sized from a named load across the pin by beam formulas to about twice the margin. The
 * frame's leaf prints as it lies, the door's leaf face down; the pin's hole lies as a teardrop.
 * @param {string | object} profile the hinge beam's @param {{ sheet: number, face?: string, thread?: string, nut?: string, pin?: string, screw?: string, load?: number, printer?: object, material?: string | object, given?: object }} o
 *   sheet: the door's thickness; pin: the pin's thread (default M3); screw: the thread through the door (default M3)
 * @returns {object} its model: standoff (the door's inner face over the beam's), axis [y, z], edge (the door's hinge-side edge, y), screws, hardware, grams, margin
 */
export function hingeModel(profile, o = {}) {
  const what = 'hingeModel';
  options(what, o ?? {}, ['sheet', 'face', 'thread', 'nut', 'pin', 'screw', 'load', 'printer', 'material', 'given']);
  const T = sheetThickness(what, o.sheet), given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  loadOk(what, o.load, 'the force across the pin at one hinge');
  const sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, 'button', k.pr), clear = DOOR_DEFAULTS.clear.value;
  const pin = o.pin ?? DOOR_DEFAULTS.pin.value, dsc = o.screw ?? DOOR_DEFAULTS.door.value;
  let pfx, dfx; try { pfx = fixingModel(pin); dfx = screwOf(what, dsc, 'button', k.pr); } catch (e) { throw new Error(`${what}: pin and screw are threads, as 'M3' (got ${shown(pin)}, ${shown(dsc)}): ${String(e.message).replace(/^\w+: /, '')}`); }
  const ph = screwOf(what, pin, 'cap', k.pr).hd, R = r3(up((ph / 2) * Math.SQRT2 + 2 * k.line, 0.1)), c = sd.cell / 2, ya = -c;
  if (ya + R > -(sc.dk / 2 + FITTING_DEFAULTS.reach.value) + 1e-9) throw new Error(`${what}: on ${short(p)}'s ${mm(sd.cell)} mm face a ${mm(R)} mm knuckle over its edge leaves no room for ${an(sd.thread)} head on the slot's line: a smaller pin`);
  const endBy = Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + FITTING_DEFAULTS.reach.value);
  // the frame's leaf: as thin as its thread lets it, then thick enough that a screw sold fits the slot nut
  const least = Math.max(up(FITTING_DEFAULTS.least.value * sc.major, k.layer), 2 * k.layer), fits = sold(least, k.layer, [sd], sd.thread), tl = fits ? fits.t : least;
  const kh = fixingModel(sd.thread).figures.button_head_height?.value ?? sc.major, g = r3(up(tl + kh + clear, k.layer)), za = r3(g + T), v0 = r3(ya + R + clear);
  const F = o.load ?? DOOR_DEFAULTS.load.value, n = DOOR_DEFAULTS.knuckles.value, gapK = r3(2 * k.fit);
  // the knuckles' length: the two risers bent at their roots by F at the pin's height, to about twice the margin
  // (and long enough that its two screws' slot nuts sit side by side in the slot)
  const nutLen = Math.max(...sd.nuts.map((x) => x.length)), apart = (q) => n * q + (n - 1) * gapK - 2 * endBy;
  let kl = up(Math.max(2 * R + 2, 8), 0.5), stress = 0, margin = 0;
  for (let i = 0; i < 60; i++) { stress = r3((6 * F * za) / (2 * kl * (2 * R) ** 2)); margin = r3(k.S / stress); if (margin >= want() && apart(kl) >= nutLen + 1 - 1e-9) break; kl += 0.5; }
  const L = r3(n * kl + (n - 1) * gapK), dEnd = Math.max(FITTING_DEFAULTS.end.value * dfx.hd, dfx.dk / 2 + FITTING_DEFAULTS.reach.value);
  // the screws through the door stand past the frame's leaf, so their nuts under the door clear its heads
  const dn0 = nutModel(dsc), yd = r3(up(Math.max(endBy, v0 + dEnd) + clear + dn0.flats / Math.sqrt(3), 0.5)), dLeaf = r3(up(yd + dEnd - v0, 0.5));
  const nutH = nutModel(pin, { kind: 'lock' }).height, lengths = [...(pfx.figures.lengths?.value ?? [])].sort((a, b) => a - b), pinLen = lengths.find((x) => x >= L + nutH + 0.5 - 1e-9 && x <= L + nutH + pfx.major + 1e-9) ?? null;
  const dnut = nutModel(dsc), dLen = [...(fixingModel(dsc).figures.lengths?.value ?? [])].sort((a, b) => a - b).find((x) => x >= R + T + dnut.height - 1e-9 && x <= R + T + dnut.height + fixingModel(dsc).major + 1e-9) ?? null;
  const xs = [-(L / 2 - dEnd), L / 2 - dEnd].map(r3), frameX = [-(L / 2 - endBy), L / 2 - endBy].map(r3);
  const m = { kind: 'fitting', fitting: 'hinge', name: `hinge-${short(p)}-${sd.thread.toLowerCase()}-${mm(T)}mm`, title: `printed door hinge for ${short(p)}, a ${mm(T)} mm door, ${sd.thread} into the slot`,
    profile: p.name, face: sd.face, thread: sd.thread, head: 'button', sheet: T, pin, screw: dsc, length: L, knuckle: kl, knuckles: n, gap: gapK, radius: R, leaf: tl, standoff: g, axis: [ya, za], edge: v0, doorLeaf: dLeaf, plate: r3(endBy), headRoom: r3(sc.dk / 2),
    parts: ['frame', 'door'], frameScrews: frameX, doorScrews: xs,
    screws: frameX.map((x) => ({ leaf: 'frame', thread: sd.thread, head: 'button', grip: tl, at: [x, 0, tl], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null })),
    door: xs.map((x) => ({ leaf: 'door', thread: dsc, head: 'button', at: [x, yd, r3(za + R)], axis: [0, 0, -1], length: dLen, nut: dnut.name })),
    hardware: [{ kind: 'screw', name: `${pfx.thread}x${pinLen ?? '?'} cap`, thread: pfx.thread, length: pinLen, head: 'cap', count: 1, why: 'the pin' }, { kind: 'nut', name: nutModel(pin, { kind: 'lock' }).name, thread: pfx.thread, count: 1, why: 'on the pin' }],
    load: { force: F, what: `${F} N across the pin, ${mm(za)} mm off the beam's face` }, stress, margin, size: { length: L, knuckle: kl, standoff: g, leaf: tl, radius: R },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['pin', 'door', 'load', 'knuckles', 'clear'].map((x) => ({ name: `DOOR_DEFAULTS.${x}`, value: DOOR_DEFAULTS[x].value, kind: DOOR_DEFAULTS[x].kind }))] };
  const vf = jscad.measurements.measureVolume(hinge(m, { part: 'frame', printer: k.pr })), vd = jscad.measurements.measureVolume(hinge(m, { part: 'door', printer: k.pr }));
  m.volume = r3(vf + vd); m.grams = r3((m.volume * k.density) / 1000); m.leafGrams = { frame: r3((vf * k.density) / 1000), door: r3((vd * k.density) / 1000) };
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} button into the slot: through the ${mm(tl)} mm leaf, its tip between ${mm(fits.windows[0].lo)} (its nut's thread engaged) and ${mm(fits.windows[0].hi)} mm under the face`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } })
    : finding('warn', `no ${sd.thread} button screw sold engages its slot nut fully through the leaf: the fasten check chooses`, 'fitting.screw', {}));
  m.findings.push(finding(pinLen ? 'pass' : 'warn', pinLen ? `the pin: ${an(pfx.thread)}x${pinLen} cap screw through ${mm(L)} mm of knuckles and ${an(pfx.thread)} lock nut` : `no ${pfx.thread} cap screw sold reaches through ${mm(L)} mm of knuckles and its lock nut`, 'fitting.pin', { values: { length: pinLen, knuckles: L } }));
  m.findings.push(finding('info', `the door stands ${mm(g)} mm off the face (the ${mm(tl)} mm leaf, a ${mm(kh)} mm button head and ${mm(clear)} mm), its axis ${mm(-ya)} mm outside the slot's line at the door's outer face, ${mm(za)} mm up, its hinge-side edge ${mm(v0 - ya)} mm from the axis: so it swings out and away from the frame, up to 180°`, 'fitting.swing', { values: { standoff: g, axis: [ya, za], edge: v0 } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(L)} mm long, ${n} knuckles of ${mm(kl)} mm round ${an(pfx.thread)} pin, ${mm(R)} mm in radius; the frame's leaf ${mm(tl)} mm thick, the door's ${mm(R)} mm, ${mm(dLeaf)} mm onto the door`, marginText: `under ${m.load.what}, the frame's two risers bend at their roots to ${mm(stress)} MPa`, pose: 'the frame\'s leaf as it lies, the door\'s leaf face down, the pin\'s hole a teardrop' });
  return m;
}

/**
 * A hinge's leaves: part 'frame' (as it prints, which is as it lies) or 'door' (face down to print); pose 'fit' puts
 * the door's leaf where it sits with the door closed. @param {object} m @param {{ part?: 'frame' | 'door', pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object}
 */
export function hinge(m, o = {}) {
  if (m?.fitting !== 'hinge') throw new Error(`hinge: give a hinge's model (hingeModel), not ${shown(m)}`);
  const part = o.part ?? 'frame';
  if (!['frame', 'door'].includes(part)) throw new Error(`hinge: part is frame or door (got ${shown(o.part)})`);
  const pr = printerOf('hinge', o.printer), fx = { printer: pr }, [ya, za] = m.axis, R = m.radius, L = m.length, kl = m.knuckle, gk = m.gap, tl = m.leaf;
  const seg = (i) => [-L / 2 + i * (kl + gk), -L / 2 + i * (kl + gk) + kl], along = (g, x0, x1) => translate([x0, 0, 0], transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], extrudeLinear({ height: x1 - x0 }, g)));
  const sec = (pts) => polygon({ points: ccw(pts) }), pinAt = (zc, toward) => hole(m.pin, { kind: 'clearance', into: '+x', depth: L + 2, at: [-L / 2 - 1, toward * ya, zc], ...fx });
  if (part === 'frame') {
    // its plate on the face; at each outer knuckle a riser from the plate to the knuckle, its root toward the slot rounded
    const plate = sec([[ya - R, 0], [m.plate, 0], [m.plate, tl], [ya - R, tl]]);
    // (its root's round no wider than the room left before the heads on the slot's line, so they seat flat)
    const rr = Math.max(0.2, Math.min(2, -(m.headRoom ?? 0) - (ya + R) - 0.5));
    const riser = sec(roundConcave(ccw([[ya - R, 0], [ya + R + rr, 0], [ya + R + rr, tl], [ya + R, tl], [ya + R, za], ...arc(ya, za, R, 0, Math.PI, 16).slice(1, -1), [ya - R, za]]), rr, null, 8));
    const parts = [along(plate, -L / 2, L / 2), ...[0, m.knuckles - 1].map((i) => along(riser, ...seg(i)))];
    const holes = [pinAt(za, 1), ...m.frameScrews.map((x) => hole(m.thread, { kind: 'clearance', into: '-z', depth: tl + 2, at: [x, 0, tl + 1], ...fx }))];
    return Object.assign(combine(parts, holes, o.ops), { model: m });
  }
  // the door's leaf, drawn in its print frame (X = x, Y = -y, Z = za + R - z): its plate on the bed, its knuckle a
  // round standing on it, the pin's hole a teardrop pointing up
  const y0 = -ya, yE = -(m.edge + m.doorLeaf), [m0, m1] = seg(1);
  const plate = sec([[yE, 0], [-m.edge, 0], [-m.edge, R], [yE, R]]), neck = sec([[-m.edge, 0], [y0 + R, 0], ...arc(y0, R, R, 0, Math.PI, 24), [-m.edge, R]]); // (its outer lower corner square, so nothing hangs over the bed)
  const parts = [along(plate, -L / 2, L / 2), along(neck, m0, m1)];
  const holes = [hole(m.pin, { kind: 'clearance', into: '+x', depth: L + 2, at: [-L / 2 - 1, y0, R], ...fx }), ...m.door.map((s) => hole(m.screw, { kind: 'clearance', into: '+z', depth: R + 2, at: [s.at[0], -s.at[1], -1], ...fx }))];
  const g = combine(parts, holes, o.ops);
  return Object.assign(o.pose === 'fit' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, za + R, 1], g) : g, { model: m });
}

// ---------- a handle ----------
/**
 * A printed pull handle for a door: a grip between two feet, screwed from inside the door into a pilot in each foot,
 * room under the grip for the fingers. Sized from a named pull by beam formulas to about twice the margin. It prints
 * on its side, its outline the first layer, its pilots lying as teardrops.
 * @param {{ sheet: number, thread?: string, span?: number, load?: number, printer?: object, material?: string | object }} o
 *   sheet: the door's thickness, for the screws' length; span: between the screws (default 64)
 * @returns {object} its model
 */
export function handleModel(o = {}) {
  const what = 'handleModel';
  options(what, o ?? {}, ['sheet', 'thread', 'span', 'load', 'printer', 'material']);
  const T = sheetThickness(what, o.sheet), k = partSetup(what, o), th = o.thread ?? DOOR_DEFAULTS.door.value, span = o.span ?? DOOR_DEFAULTS.span.value;
  if (!(isNum(span) && span >= 30 && span <= 300)) throw new Error(`${what}: span is between the screws, in mm, from 30 to 300 (got ${shown(o.span)})`);
  loadOk(what, o.load, 'the pull on the handle');
  const sc = screwOf(what, th, 'button', k.pr), fx = fixingModel(th), F = o.load ?? DOOR_DEFAULTS.pull.value, b = r3(up(Math.max(12, fx.major * 3), 0.5));
  const pilot = fx.figures.pilot_depth?.value ?? 2 * fx.major, foot = r3(up(Math.max(2 * fx.major + 2 * k.line * 3, 8), 0.5)), finger = DOOR_DEFAULTS.finger.value;
  const M = (F * span) / 4, hb = r3(Math.max(up(bendT(M, b, k.S, want()), 0.5), 6)), H = r3(finger + hb), stress = r3((6 * M) / (b * hb * hb)), margin = r3(k.S / stress);
  const x0 = -span / 2 - foot / 2, x1 = span / 2 + foot / 2, r = r3(Math.min(hb / 2, finger / 3));
  const loop = roundConcave(ccw([[x0, 0], [-span / 2 + foot / 2, 0], [-span / 2 + foot / 2, finger], [span / 2 - foot / 2, finger], [span / 2 - foot / 2, 0], [x1, 0], [x1, H], [x0, H]]), r, null, 10).map(([x, y]) => [r3(x), r3(y)]);
  const lengths = [...(fx.figures.lengths?.value ?? [])].sort((a, z) => a - z), len = lengths.find((x) => x >= T + Math.min(pilot, 1.5 * fx.major) - 1e-9 && x <= T + Math.min(pilot + 2, H - 1) + 1e-9) ?? null;
  const m = { kind: 'fitting', fitting: 'handle', name: `handle-${Math.round(span)}-${th.toLowerCase()}`, title: `printed door handle, ${mm(span)} mm between its screws, ${th}`, thread: th, sheet: T, span, width: b, height: H, grip: hb, finger, foot, section: loop, pilot: r3(Math.min(pilot + 2, H - 1)),
    screws: [-span / 2, span / 2].map((y) => ({ thread: th, head: 'button', at: [0, y, -T], axis: [0, 0, 1], length: len, into: 'pilot' })),
    load: { force: F, what: `${F} N pulling the grip's middle` }, stress, margin, size: { span, height: H, grip: hb, width: b }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['span', 'finger', 'pull'].map((x) => ({ name: `DOOR_DEFAULTS.${x}`, value: DOOR_DEFAULTS[x].value, kind: DOOR_DEFAULTS[x].kind }))] };
  weigh(m, handle(m, { printer: k.pr }), k.density);
  m.findings.push(finding(len ? 'pass' : 'warn', len ? `${th}x${len} button from inside the door, through its ${mm(T)} mm into each foot's pilot` : `no ${th} button screw sold fits through the door into the feet: the fasten check chooses`, 'fitting.screw', { values: { length: len } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(H)} mm high, ${mm(b)} mm wide, ${mm(finger)} mm under the grip for the fingers, its grip ${mm(hb)} mm deep`, marginText: `under ${m.load.what}, the grip bends to ${mm(stress)} MPa`, pose: 'on its side, its outline the first layer' });
  return m;
}
/** A handle's solid: on its side to print, or fitted (pose 'fit', its feet on the door at z = 0). @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function handle(m, o = {}) {
  if (m?.fitting !== 'handle') throw new Error(`handle: give a handle's model (handleModel), not ${shown(m)}`);
  const pr = printerOf('handle', o.printer), g = sidePart({ loop: m.section, width: m.width, holes: [-m.span / 2, m.span / 2].map((y) => ({ thread: m.thread, y, depth: m.pilot, from: 'face', kind: 'pilot' })), pr, ops: o.ops });
  // fitted: the print frame's X runs along the handle (fitted y), Z across it (fitted x)
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.width), g) : g, { model: m });
}

// ---------- a latch and a magnet catch ----------
/**
 * A printed turn-button latch: a post on the latch beam's face, screwed into a slot nut through its middle, with a tab
 * on top that turns over the door's edge to hold it shut. Shown at rest, turned over the door. It prints tab down.
 * @param {string | object} profile @param {{ sheet: number, standoff: number, edge?: number, face?: string, thread?: string, nut?: string, load?: number, printer?: object, material?: string | object, given?: object }} o
 *   standoff: the door's inner face over the beam's (a hinge's); edge: the door's edge, from the slot's line (default a clip's)
 * @returns {object} its model
 */
export function latchModel(profile, o = {}) {
  const what = 'latchModel';
  options(what, o ?? {}, ['sheet', 'standoff', 'edge', 'face', 'thread', 'nut', 'load', 'printer', 'material', 'given']);
  const T = sheetThickness(what, o.sheet), given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  if (!(isNum(o.standoff) && o.standoff >= 0)) throw new Error(`${what}: standoff is the door's inner face over the beam's face, in mm (a hinge's standoff) (got ${shown(o.standoff)})`);
  loadOk(what, o.load, 'the door pushing out at the latch');
  const sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, 'button', k.pr), clear = DOOR_DEFAULTS.clear.value;
  const rp = r3(up(sc.dk / 2 + FITTING_DEFAULTS.reach.value, 0.5)), edge = o.edge ?? r3(rp + clear), grip = PANEL_DEFAULTS.grip.value, reach = r3(edge + grip);
  if (edge < rp + clear - 1e-9) throw new Error(`${what}: the door's edge ${mm(edge)} mm from the slot's line runs into the latch's ${mm(rp)} mm post: ${mm(rp + clear)} mm or more`);
  const F = o.load ?? PANEL_DEFAULTS.load.value, M = F * (reach - rp), tt0 = Math.max(up(bendT(M, 2 * rp, k.S, want()), k.layer), 4 * k.layer);
  const post = r3(o.standoff + T + 0.5), fits = sold(r3(post + tt0), k.layer, [sd], sd.thread), H = fits ? fits.t : r3(post + tt0), tt = r3(H - post);
  const stress = r3((6 * M) / (2 * rp * tt * tt)), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'latch', name: `latch-${short(p)}-${sd.thread.toLowerCase()}-${mm(T)}mm`, title: `printed turn-button latch for ${short(p)}, a ${mm(T)} mm door, ${sd.thread}`, profile: p.name, face: sd.face, thread: sd.thread, head: 'button',
    sheet: T, standoff: o.standoff, edge, post, height: H, tab: tt, radius: rp, reach,
    screws: [{ thread: sd.thread, head: 'button', grip: H, at: [0, 0, H], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null }],
    load: { force: F, what: `${F} N of the door pushing out under the tab` }, stress, margin, size: { height: H, tab: tt, reach }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, { name: 'PANEL_DEFAULTS.load', value: F, kind: PANEL_DEFAULTS.load.kind }] };
  weigh(m, latch(m, { printer: k.pr }), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} button through its ${mm(H)} mm into the slot nut: the latch turns on it, done up until the tab just drags`, 'fitting.screw', { values: { lengths: fits.lengths } }) : finding('warn', `no ${sd.thread} button screw sold fits through the latch into its nut`, 'fitting.screw', {}));
  closingFindings(m, { S: k.S, sizeText: `a ${mm(2 * rp)} mm post ${mm(post)} mm high (the door's standoff, its ${mm(T)} mm and 0.5 mm), a ${mm(tt)} mm tab reaching ${mm(reach)} mm from the slot's line over the door's edge at ${mm(edge)} mm`, marginText: `under ${m.load.what}, the tab bends to ${mm(stress)} MPa`, pose: 'tab down, its post up' });
  return m;
}
/** A latch's solid: tab down to print, or fitted and turned over the door (pose 'fit'). @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function latch(m, o = {}) {
  if (m?.fitting !== 'latch') throw new Error(`latch: give a latch's model (latchModel), not ${shown(m)}`);
  const pr = printerOf('latch', o.printer), H = m.height, rp = m.radius, tt = m.tab, r0 = 0.6;
  // print frame: z = H - z(fit), y = -y(fit); the tab a stadium on the bed, the post standing on it with a 45° collar
  const tab = polygon({ points: ccw([...arc(0, 0, rp, 0, Math.PI, 16), ...arc(0, -(m.reach - rp), rp, Math.PI, 2 * Math.PI, 16)]) }); // (along -Y: toward the door once fitted)
  // (the post a little inside the tab's width, its root a 45° collar out to it)
  const post = translate([0, 0, tt], cylinder({ radius: rp - r0, height: H - tt, center: [0, 0, (H - tt) / 2], segments: 40 }));
  const collar = hull(translate([0, 0, tt], cylinder({ radius: rp, height: 0.01, segments: 40 })), translate([0, 0, tt + r0], cylinder({ radius: rp - r0, height: 0.01, segments: 40 })));
  const g = combine([extrudeLinear({ height: tt }, tab), post, collar], [hole(m.thread, { kind: 'clearance', into: '+z', depth: H + 2, at: [0, 0, -1], printer: pr })], o.ops);
  return Object.assign(o.pose === 'fit' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, H, 1], g) : g, { model: m });
}

/**
 * A printed magnet catch: a block on a beam's face under the door's edge, screwed into a slot nut on a step lower than
 * its tower, a disc magnet pressed into the tower's top; a steel washer stuck to the door's inner face over it is the
 * strike. The tower's top stops the washer's thickness and a half millimetre under the door. It prints on its side.
 * @param {string | object} profile @param {{ standoff: number, edge?: number, magnet?: number[], face?: string, thread?: string, nut?: string, printer?: object, material?: string | object, given?: object }} o
 *   standoff: the door's (a hinge's); edge: the door's edge from the slot's line (default the head's room); magnet: [diameter, thickness]
 * @returns {object} its model
 */
export function magnetCatchModel(profile, o = {}) {
  const what = 'magnetCatchModel';
  options(what, o ?? {}, ['standoff', 'edge', 'magnet', 'face', 'thread', 'nut', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  if (!(isNum(o.standoff) && o.standoff > 0)) throw new Error(`${what}: standoff is the door's inner face over the beam's face, in mm, above 0 (a hinge's standoff) (got ${shown(o.standoff)})`);
  const [dm, hm] = o.magnet ?? DOOR_DEFAULTS.magnet.value;
  if (!(isNum(dm) && isNum(hm) && dm > 0 && hm > 0)) throw new Error(`${what}: magnet is [diameter, thickness] in mm (got ${shown(o.magnet)})`);
  const sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, 'button', k.pr), w = sd.cell, wall = r3(up(3 * k.line, 0.1));
  const washers = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10'].map((t) => { try { return washerModel(t); } catch { return null; } }).filter(Boolean), strike = washers.find((x) => x.diameter >= dm - 1e-9) ?? washers.at(-1);
  const top = r3(o.standoff - strike.thickness - 0.5), least = Math.max(up(FITTING_DEFAULTS.least.value * sc.major, k.layer), 2 * k.layer), fits = sold(least, k.layer, [sd], sd.thread), step = fits ? fits.t : least;
  const kh = fixingModel(sd.thread).figures.button_head_height?.value ?? sc.major;
  if (top < hm + 2 * k.layer) throw new Error(`${what}: a ${mm(o.standoff)} mm standoff leaves ${mm(top)} mm under the strike, too little for a ${mm(hm)} mm magnet and a floor`);
  if (step + kh + DOOR_DEFAULTS.clear.value > o.standoff + 1e-9) throw new Error(`${what}: the screw's head on its ${mm(step)} mm step stands ${mm(step + kh)} mm off the face, into a ${mm(o.standoff)} mm standoff`);
  const y0 = r3(up(Math.max(sc.dk / 2 + FITTING_DEFAULTS.reach.value, o.edge ?? 0), 0.5)), y1 = r3(y0 + dm + 2 * wall), endBy = r3(up(Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + FITTING_DEFAULTS.reach.value), 0.5));
  const loop = roundConcave(ccw([[-endBy, 0], [y1, 0], [y1, top], [y0, top], [y0, step], [-endBy, step]]), Math.min(2, (top - step) / 2), null, 8).map(([y, z]) => [r3(y), r3(z)]);
  const m = { kind: 'fitting', fitting: 'magnet-catch', name: `magnet-catch-${short(p)}-${mm(dm)}x${mm(hm)}`, title: `printed magnet catch for ${short(p)}, a ${mm(dm)} x ${mm(hm)} mm magnet`, profile: p.name, face: sd.face, thread: sd.thread, head: 'button', width: w,
    standoff: o.standoff, top, step, magnet: [dm, hm], pocket: r3((y0 + y1) / 2), section: loop, strike: strike.name, tongue: { slot: sd.slot.name, ...sd.tongue, nut: sd.nut.name },
    screws: [{ thread: sd.thread, head: 'button', grip: step, at: [0, 0, step], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null }],
    hardware: [{ kind: 'magnet', name: `${mm(dm)} x ${mm(hm)} mm disc magnet`, count: 1, why: 'pressed into the catch' }, { kind: 'washer', name: strike.name, thread: strike.thread, count: 1, why: 'stuck to the door\'s inner face over the magnet, the strike' }],
    load: { force: 0, what: 'the magnet\'s pull, not checked' }, stress: 0, margin: Infinity, size: { top, step, magnet: [dm, hm] }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: 'DOOR_DEFAULTS.magnet', value: [dm, hm], kind: DOOR_DEFAULTS.magnet.kind }] };
  weigh(m, magnetCatch(m, { printer: k.pr }), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} button into the slot through its ${mm(step)} mm step, its head ${mm(o.standoff - step - kh)} mm under the door`, 'fitting.screw', { values: { lengths: fits.lengths } }) : finding('warn', `no ${sd.thread} button screw sold fits through the step into its nut`, 'fitting.screw', {}));
  m.findings.push(finding('info', `${m.title}: its tower ${mm(top)} mm off the face (the standoff less the ${strike.name}'s ${mm(strike.thickness)} mm and 0.5 mm), the magnet's pocket ${mm(hm)} mm deep at ${mm(m.pocket)} mm from the slot's line; the magnet's pull is not checked (an estimate: no maker's figure is held)`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding('info', 'it is drawn to print on its side, its section the first layer, the magnet\'s pocket a teardrop: no supports', 'fitting.printable', { values: { pose: 'on its side' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  return m;
}
/** A magnet catch's solid: on its side to print, or fitted. @param {object} m @param {{ pose?: 'print' | 'fit', tongues?: boolean, printer?: object, ops?: object }} [o] @returns {object} */
export function magnetCatch(m, o = {}) {
  if (m?.fitting !== 'magnet-catch') throw new Error(`magnetCatch: give a magnet catch's model (magnetCatchModel), not ${shown(m)}`);
  const pr = printerOf('magnetCatch', o.printer), g = sidePart({ loop: m.section, width: m.width, tongue: o.tongues === false ? null : { at: 0, ...m.tongue }, holes: [{ thread: m.thread, y: 0, top: m.step }], pockets: [{ y: m.pocket, top: m.top, d: m.magnet[0] + pfig(pr, 'fit'), depth: m.magnet[1] }], pr, ops: o.ops });
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.width), g) : g, { model: m });
}

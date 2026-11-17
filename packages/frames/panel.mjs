// Panels and the printed parts that hold them: a panel is a sheet (acrylic, polycarbonate, aluminium) by its material
// and thickness, cut to the bay of a frame it closes, with its mass from the sheet's density; a panel clip screws into
// a face's slot and holds the panel's edge down; a panel corner holds a corner over two beams; an in-slot panel edge
// holds a thinner sheet in a slot's opening; a slot cover closes a slot nothing uses; a gasket strip seals a door's
// gap. Each printed part is drawn from the profile's, the thread's and the printer's rules, prints without supports
// with a plain first layer, and reports its grams and its margin at a named load.
//
// A clip's frame (its fitted pose): x along the slot (0 at the clip's middle), y across it toward the panel (0 on the
// slot's centre line), z out of the beam's face (0 on the face). It prints on its side: its section in (y, z) is the
// first layer, the slot's direction up. A strip's frame: x along the slot from 0, y across, z out of the face; it
// prints lying down. Units: mm, N, grams.
import jscad from '@jscad/modeling';
import { hole, holeModel } from '@rulecad/fixings';
import { FITTING_DEFAULTS, printerOf, pfig, materialOf, options, profileOf, slotSide, roundConcave, ccw, combine, tongueLoop, sold, screwOf } from './fitting.mjs';

const { polygon, cuboid } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { intersect, subtract } = jscad.booleans;
const { translate, transform } = jscad.transforms, { measureVolume } = jscad.measurements;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const an = (t) => `${/^(M|[aeiou8])/i.test(String(t)) ? 'an' : 'a'} ${t}`; // (an M5, a 6-32)
const up = (x, step) => Math.ceil(x / step - 1e-9) * step;
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });

/**
 * The sheets a panel is cut from, each with its density (from the maker's data sheet) and the thicknesses stockists
 * commonly hold.
 * @type {Record<string, { what: string, density: object, thicknesses: object }>}
 */
export const SHEETS = {
  acrylic: { what: 'cast acrylic (PMMA) sheet', density: rule(1.19, 'g/cm³', 'Cast acrylic sheet weighs 1.19 g/cm³', 'spec', 'Evonik PLEXIGLAS GS technical information: density 1.19 g/cm³ by ISO 1183'),
    thicknesses: rule([2, 3, 4, 5, 6, 8, 10], 'mm', 'Thicknesses stockists commonly cut cast acrylic from', 'community', 'Stockists\' lists of cast acrylic sheet, not one maker\'s range: check your supplier') },
  polycarbonate: { what: 'solid polycarbonate sheet', density: rule(1.2, 'g/cm³', 'Solid polycarbonate sheet weighs 1.20 g/cm³', 'spec', 'Covestro Makrolon GP / Exolon GP technical data sheet: density 1200 kg/m³ by ISO 1183-1'),
    thicknesses: rule([1, 2, 3, 4, 5, 6], 'mm', 'Thicknesses stockists commonly cut solid polycarbonate from', 'community', 'Stockists\' lists of solid polycarbonate sheet, not one maker\'s range: check your supplier') },
  aluminium: { what: 'aluminium sheet, EN AW-5754', density: rule(2.66, 'g/cm³', 'EN AW-5754 aluminium sheet weighs 2.66 g/cm³', 'spec', 'Aalco data sheet, aluminium alloy 5754 H26 sheet: density 2.66 g/cm³'),
    thicknesses: rule([1, 1.5, 2, 3], 'mm', 'Thicknesses stockists commonly cut 5754 sheet from', 'community', 'Stockists\' lists of 5754 sheet, not one maker\'s range: check your supplier') },
};

/** The working figures of panels and their printed parts, each with what it rests on. */
export const PANEL_DEFAULTS = {
  gap: rule(0.5, 'mm', 'Room between a panel\'s cut edge and the printed part it lies against: the cut\'s tolerance', 'estimate', 'A working figure of @rulecad/frames: a laser or saw cut to about ±0.2 mm, with room over'),
  grip: rule(6, 'mm', 'How far a clip reaches over the panel\'s edge', 'estimate', 'A working figure of @rulecad/frames'),
  load: rule(30, 'N', 'The design load on one clip where none is given: the panel pushed out by a hand, its share at one clip', 'default', 'A working figure of @rulecad/frames, so every clip is sized and compared at one named load'),
  pitch: rule(150, 'mm', 'Clips along a panel\'s edge are no further apart than this, with one near each end', 'estimate', 'A working figure of @rulecad/frames: a 3 mm sheet between clips this far apart does not lift visibly at the clip\'s load'),
  corner: rule(1, 'mm', 'A panel\'s corners are rounded this much, so they sit in a corner piece\'s rounded step', 'default', 'A working figure of @rulecad/frames'),
  walls: rule(3, 'lines', 'A printed part\'s thinnest wall, in the printer\'s lines', 'default', 'A working figure of @rulecad/frames: three lines hold together where two may part'),
  barb: rule(0.3, 'mm', 'How far a slot cover\'s barb reaches past the slot\'s opening under its lip', 'estimate', 'A working figure of @rulecad/frames, to be checked by a test print'),
  lap: rule(1, 'mm', 'How far a slot cover\'s flange laps the face past the slot\'s opening on each side', 'default', 'A working figure of @rulecad/frames'),
  squeeze: rule(0.5, 'mm', 'How far a door presses its gasket strip down when it closes', 'estimate', 'A working figure of @rulecad/frames'),
};
const want = () => FITTING_DEFAULTS.margin.value;

// ---------- shared ----------
/** @internal A bending member's least thickness for a margin: b wide, bent by M. @param {number} M @param {number} b @param {number} S @param {number} k @returns {number} */
export const bendT = (M, b, S, k) => Math.sqrt((6 * M * k) / (b * S));
/** @internal A bending member's margin: S over 6M / (b h²). @param {number} M @param {number} b @param {number} h @param {number} S @returns {number} */
export const bendMargin = (M, b, h, S) => S / ((6 * M) / (b * h * h));
/** @internal The common setup of a printed part: printer, plastic and their figures. @param {string} what @param {object} o @returns {any} */
export function partSetup(what, o) {
  const pr = printerOf(what, o.printer), mat = materialOf(what, o.material ?? 'pla');
  return { pr, mat, fit: pfig(pr, 'fit'), layer: pfig(pr, 'layer'), line: pfig(pr, 'line'), S: mat.rules.strength.value, density: mat.rules.density.value };
}
/** @internal A sheet's thickness, refused by name. @param {string} what @param {any} t @returns {number} */
export function sheetThickness(what, t) {
  if (!(isNum(t) && t > 0 && t <= 20)) throw new Error(`${what}: sheet is the panel's thickness in mm, above 0 and up to 20 (got ${shown(t)})`);
  return t;
}
/** @internal A load in N, refused by name. @param {string} what @param {any} F @param {string} said @returns {void} */
export function loadOk(what, F, said) { if (F != null && !(isNum(F) && F > 0)) throw new Error(`${what}: load is ${said}, in N, above 0 (got ${shown(F)})`); }

// A teardrop's outline about (0, 0) in (across, up), its point up at 45°
const teardrop = (r, n = 32) => [[0, r * Math.SQRT2], ...Array.from({ length: n + 1 }, (_, k) => { const a = Math.PI / 4 - (k * 3 * Math.PI) / (2 * n); return [r * Math.cos(a), r * Math.sin(a)]; })];
const prism = (loop, h) => extrudeLinear({ height: h }, polygon({ points: ccw(loop) }));
// print frame (X across, Y out of the face, Z along the slot from 0 to w) to the fitted frame (x along, y across, z out)
/** @internal The turn from a side-printed part's print frame to its fitted frame. @param {number} w @returns {number[]} */
export const sideToFit = (w) => [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, -w / 2, 0, 0, 1];

/**
 * @internal A part printed on its side: its section in (y, z) of the fitted frame (as X, Y) extruded w along the slot
 * (Z), a tongue into the slot under it, and holes square to the face, each a teardrop with its point cut flat just over
 * the round so a head's seat is whole. holes: { thread, y, top, kind }, from the face at height top down through the
 * part and its tongue, or { thread, y, depth, kind, from: 'face' }, a blind hole up from the contact face; pockets: { y, top, d, depth }, round pockets from the face at height top.
 * @param {{ loop: number[][], width: number, tongue?: object, holes?: object[], pockets?: object[], pr: object, ops?: object }} o
 * @returns {object} a JSCAD geom3 in its print pose
 */
export function sidePart({ loop, width, tongue = null, holes = [], pockets = [], pr, ops = null }) {
  const root = pfig(pr, 'fit'), parts = [prism(loop, width)], c = width / 2;
  if (tongue && tongue.depth > 0) parts.push(prism(tongueLoop(tongue.at - tongue.width / 2, tongue.at + tongue.width / 2, tongue.depth, false, root).map(([n, a]) => [a, -n]), width));
  const deep = (top) => top + (tongue?.depth ?? 0) + 2;
  const cuts = holes.map((h) => {
    const g = h.from === 'face' ? hole(h.thread, { kind: h.kind ?? 'pilot', into: '+y', depth: h.depth + 1, at: [h.y, -1, c], printer: pr }) : hole(h.thread, { kind: h.kind ?? 'clearance', into: '-y', depth: deep(h.top), at: [h.y, h.top + 1, c], printer: pr }), r = g.model.diameter / 2;
    return intersect(g, cuboid({ size: [4 * width + 200, 4 * (h.top ?? h.depth) + 200, c + 1.02 * r + 1], center: [h.y, 0, (c + 1.02 * r - 1) / 2] }));
  });
  for (const p of pockets) cuts.push(translate([p.y, p.top + 1, c], transform([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1], prism(teardrop(p.d / 2), p.depth + 1)))); // (u, v) to (X, Z), down along -Y
  return combine(parts, cuts, ops);
}

// The kit's findings every printed part ends with: its size, its margin at its named load, how it prints, its mass
function closing(m, { S, sizeText, marginText, pose }) {
  const ok = m.margin >= want() - 1e-9;
  m.findings.push(finding('info', `${m.title}: ${sizeText}`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding(ok ? 'pass' : 'fail', `${marginText}, ${mm(m.margin)} times under ${m.material.toUpperCase()}'s ${S} MPa (${ok ? `within the ${want()}× asked` : `short of the ${want()}× asked`}): by beam formulas, an estimate`, 'fitting.margin', { values: { load: m.load.force, stress: m.stress, strength: S, margin: m.margin } }));
  m.findings.push(finding('info', `it is drawn to print ${pose}: a plain first layer, no supports (printcheck's check() reads the solid)`, 'fitting.printable', { values: { pose } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
}
/** @internal A finished part's volume and grams from its solid. @param {object} m @param {object} solid @param {number} density @returns {void} */
export function weigh(m, solid, density) { m.volume = r3(measureVolume(solid)); m.grams = r3((m.volume * density) / 1000); }
/** @internal The closing findings, shared with the door's and the ends' parts. */
export { closing as closingFindings };
const screwFinding = (m, fits, sc) => m.findings.push(fits
  ? finding('pass', `${sc.thread}x${fits.lengths[0]} ${sc.head}: through ${mm(fits.t)} mm of ${m.fitting.replace('-', ' ')}, its tip ${mm(fits.lengths[0] - fits.t)} mm under the face, between ${mm(fits.windows[0].lo)} (its nut's thread engaged) and ${mm(fits.windows[0].hi)} (the slot's floor less ${FITTING_DEFAULTS.floor.value} mm)`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } })
  : finding('warn', `no ${sc.thread} ${sc.head} screw sold engages its slot nut fully and stops short of the slot's floor here: the screw's length is the fasten check's to choose`, 'fitting.screw', {}));
const tongueFinding = (m, sd, pr) => m.findings.push(finding(sd.tongue.depth > 0 ? 'pass' : 'info', sd.tongue.depth > 0 ? `its tongue keys into ${sd.slot.name}: ${mm(sd.tongue.width)} mm wide (the ${mm(sd.slot.opening)} mm opening less ${pr.name}'s fit each side), ${mm(sd.tongue.depth)} mm deep (the lip less ${an(sd.thread)} slot nut's tongue, less the fit)` : `${sd.slot.name}'s lip leaves no room for a tongue over ${an(sd.thread)} slot nut: it lies flat on the face`, 'fitting.tongue', { values: { ...sd.tongue }, refs: { slot: sd.slot.name, nut: sd.nut.name } }));
const short = (p) => p.name.replace(/^profile-/, '');

// ---------- a panel ----------
/**
 * @typedef {{ kind: 'panel', name: string, title: string, sheet: string, thickness: number, size: number[], corner: number, area: number, grams: number, holes: { thread: string, at: number[], diameter: number }[],
 *   findings: object[], rests: object[] }} Panel
 */
/**
 * A panel: a sheet of a material and thickness cut to a size, its corners rounded, with holes where screws pass. Its
 * mass is the sheet's density times its volume less the holes. A thickness no stockist commonly holds is a warning.
 * @param {string} sheet acrylic, polycarbonate or aluminium @param {number} thickness mm
 * @param {{ size: number[], corner?: number, holes?: { thread: string, at: number[] }[], printer?: object }} o size: [x, y] in mm; holes at [x, y] from the panel's corner
 * @returns {Panel}
 */
export function panelModel(sheet, thickness, o = {}) {
  const what = 'panelModel';
  const s = SHEETS[String(sheet).toLowerCase()];
  if (!s) throw new Error(`${what}: sheet is one of ${Object.keys(SHEETS).join(', ')} (got ${shown(sheet)})`);
  options(what, o, ['size', 'corner', 'holes', 'printer']);
  const T = sheetThickness(what, thickness);
  if (!(Array.isArray(o.size) && o.size.length === 2 && o.size.every((x) => isNum(x) && x > 0))) throw new Error(`${what}: size is [x, y] in mm, each above 0 (got ${shown(o.size)})`);
  const corner = o.corner ?? PANEL_DEFAULTS.corner.value;
  if (!(isNum(corner) && corner >= 0 && corner < Math.min(...o.size) / 2)) throw new Error(`${what}: corner is the corners' radius in mm, from 0 to under half the panel's least side (got ${shown(o.corner)})`);
  const pr = printerOf(what, o.printer);
  const holes = (o.holes ?? []).map((h, i) => {
    if (!h || typeof h.thread !== 'string' || !(Array.isArray(h.at) && h.at.length === 2 && h.at.every(isNum))) throw new Error(`${what}: hole ${i + 1} is { thread: 'M3', at: [x, y] } (got ${shown(h)})`);
    const d = holeModel(h.thread, { kind: 'clearance', printer: pr }).diameter;
    if (h.at[0] < d / 2 || h.at[1] < d / 2 || h.at[0] > o.size[0] - d / 2 || h.at[1] > o.size[1] - d / 2) throw new Error(`${what}: hole ${i + 1} at [${h.at.map(mm).join(', ')}] is off the ${mm(o.size[0])} x ${mm(o.size[1])} mm panel`);
    return { thread: h.thread, at: h.at.map(r3), diameter: d };
  });
  const [a, b] = o.size.map(r3), area = r3(a * b - (4 - Math.PI) * corner * corner - holes.reduce((t, h) => t + (Math.PI * h.diameter * h.diameter) / 4, 0));
  const grams = r3((area * T * s.density.value) / 1000), name = `panel-${String(sheet).toLowerCase()}-${mm(T)}mm`;
  const findings = [finding('info', `${mm(a)} x ${mm(b)} mm of ${mm(T)} mm ${s.what}, its corners rounded ${mm(corner)} mm${holes.length ? `, ${holes.length} hole${holes.length > 1 ? 's' : ''} for ${[...new Set(holes.map((h) => h.thread))].join(' and ')} screws` : ''}: ${mm(grams)} g`, 'panel.size', { values: { size: [a, b], thickness: T, grams, holes: holes.length } })];
  const stocked = s.thicknesses.value.some((x) => Math.abs(x - T) < 1e-9);
  findings.push(finding(stocked ? 'pass' : 'warn', stocked ? `${mm(T)} mm is a thickness ${sheet} is commonly stocked in (${s.thicknesses.kind})` : `${mm(T)} mm ${sheet} is not commonly stocked: ${s.thicknesses.value.join(', ')} mm are (${s.thicknesses.kind}, check your supplier)`, 'panel.thickness', { values: { thickness: T, stocked: s.thicknesses.value } }));
  return { kind: 'panel', name, title: `${mm(T)} mm ${sheet} panel, ${mm(a)} x ${mm(b)} mm`, sheet: String(sheet).toLowerCase(), thickness: T, size: [a, b], corner, area, grams, holes, findings,
    rests: [{ name: `SHEETS.${sheet}.density`, value: s.density.value, kind: s.density.kind }, { name: 'PANEL_DEFAULTS.corner', value: corner, kind: PANEL_DEFAULTS.corner.kind }] };
}

/**
 * A panel's solid: the sheet from [0, 0] to its size on x and y, z from 0 to its thickness, its corners rounded and its
 * holes cut. @param {Panel} m panelModel's @param {{ printer?: object, ops?: object }} [o] ops: booleans to cut with, JSCAD's where left out
 * @returns {object} a JSCAD geom3, with .model
 */
export function panel(m, o = {}) {
  if (m?.kind !== 'panel') throw new Error(`panel: give a panel's model (panelModel), not ${shown(m)}`);
  const [a, b] = m.size, r = m.corner, pr = printerOf('panel', o.printer);
  const out = r > 0 ? roundConcave(ccw([[0, 0], [a, 0], [a, b], [0, b]]).reverse(), r).reverse() : [[0, 0], [a, 0], [a, b], [0, b]];
  const body = prism(out, m.thickness), cuts = m.holes.map((h) => hole(h.thread, { kind: 'clearance', into: '-z', depth: m.thickness + 2, at: [h.at[0], h.at[1], m.thickness + 1], printer: pr }));
  return Object.assign(cuts.length ? (o.ops ? o.ops.subtract(body, ...cuts) : subtract(body, ...cuts)) : body, { model: m });
}

// ---------- a panel clip ----------
/**
 * A printed clip that holds a panel's edge down on a beam's face: a block on the face, screwed into a slot nut on the
 * slot's centre line, keyed into the slot by a tongue, reaching over the panel's edge with a step as deep as the sheet.
 * Sized from a named load (the panel pushed out at the clip) by beam formulas to about twice the margin; then made
 * thick enough that a screw sold engages its nut and stops short of the slot's floor. It prints on its side.
 * @param {string | object} profile @param {{ sheet: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, load?: number, grip?: number, printer?: object, material?: string | object, given?: object }} o
 *   sheet: the panel's thickness; grip: how far it reaches over the panel (default PANEL_DEFAULTS.grip)
 * @returns {object} the clip's model: edge (where the panel's edge goes, from the slot's centre line), height, screws, grams, margin, findings
 */
export function panelClipModel(profile, o = {}) {
  const what = 'panelClipModel';
  options(what, o ?? {}, ['sheet', 'face', 'thread', 'head', 'nut', 'load', 'grip', 'printer', 'material', 'given']);
  const T = sheetThickness(what, o.sheet), given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  loadOk(what, o.load, 'the force pushing the panel out at one clip');
  const head = o.head ?? 'button';
  if (!['cap', 'button'].includes(head)) throw new Error(`${what}: head is cap or button (got ${shown(o.head)})`);
  const grip = o.grip ?? PANEL_DEFAULTS.grip.value;
  if (!(isNum(grip) && grip > 0)) throw new Error(`${what}: grip is how far the clip reaches over the panel, in mm, above 0 (got ${shown(o.grip)})`);
  const sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, head, k.pr);
  const w = sd.cell, gap = PANEL_DEFAULTS.gap.value, e = r3(up(Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + FITTING_DEFAULTS.reach.value), 0.5)), reach = r3(e + gap + grip);
  const F = o.load ?? PANEL_DEFAULTS.load.value, M = F * (gap + grip / 2), least = up(PANEL_DEFAULTS.walls.value * k.line, k.layer);
  const tc0 = Math.max(least, up(bendT(M, w, k.S, want()), k.layer)), fits = sold(r3(T + tc0), k.layer, [sd], sd.thread), H = fits ? fits.t : r3(T + tc0), tc = r3(H - T);
  const stress = r3((6 * M) / (w * tc * tc)), margin = r3(k.S / stress);
  const loop = roundConcave(ccw([[-e, 0], [e, 0], [e, T], [reach, T], [reach, H], [-e, H]]), gap, null, 8).map(([y, z]) => [r3(y), r3(z)]);
  const m = { kind: 'fitting', fitting: 'panel-clip', name: `panel-clip-${short(p)}-${sd.thread.toLowerCase()}-${mm(T)}mm`, title: `printed panel clip for ${short(p)}, a ${mm(T)} mm sheet, ${sd.thread}`,
    profile: p.name, face: sd.face, thread: sd.thread, head, sheet: T, width: w, height: H, thickness: tc, edge: r3(e + gap), grip, reach, section: loop,
    tongue: { slot: sd.slot.name, ...sd.tongue, nut: sd.nut.name },
    screws: [{ thread: sd.thread, head, grip: H, at: [0, 0, H], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null }],
    load: { force: F, what: `${F} N pushing the panel out at the clip, ${mm(gap + grip / 2)} mm past its step` }, stress, margin, size: { width: w, height: H, thickness: tc, edge: r3(e + gap), grip },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['gap', 'grip', 'load', 'walls'].map((x) => ({ name: `PANEL_DEFAULTS.${x}`, value: PANEL_DEFAULTS[x].value, kind: PANEL_DEFAULTS[x].kind }))] };
  weigh(m, panelClip(m, { printer: k.pr }), k.density);
  tongueFinding(m, sd, k.pr); screwFinding(m, fits, sc);
  closing(m, { S: k.S, sizeText: `${mm(H)} mm high over the face, ${mm(tc)} mm over the panel, ${mm(w)} mm wide; the panel's edge ${mm(e + gap)} mm from the slot's centre line, held ${mm(grip)} mm in`, marginText: `under ${m.load.what}, the step's root bends to ${mm(stress)} MPa`, pose: 'on its side, its section the first layer' });
  return m;
}

/**
 * A panel clip's solid, from panelClipModel's model: on its side to print (pose 'print'), or fitted (pose 'fit').
 * tongues: false leaves the tongue off; ops: booleans to join and cut with.
 * @param {object} m @param {{ pose?: 'print' | 'fit', tongues?: boolean, ops?: object, printer?: object }} [o] @returns {object} a JSCAD geom3, with .model
 */
export function panelClip(m, o = {}) {
  if (m?.fitting !== 'panel-clip') throw new Error(`panelClip: give a clip's model (panelClipModel), not ${shown(m)}`);
  const pr = printerOf('panelClip', o.printer), g = sidePart({ loop: m.section, width: m.width, tongue: o.tongues === false ? null : { at: 0, ...m.tongue }, holes: [{ thread: m.thread, y: 0, top: m.height }], pr, ops: o.ops });
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.width), g) : g, { model: m });
}

// ---------- a panel corner ----------
/**
 * A printed corner piece over a panel's corner where two beams meet: an L on both beams' faces, a screw into each slot
 * past the crossing, a step as deep as the sheet over the panel's corner, rounded where the panel's corner sits.
 * Its frame: the two slots' centre lines along x and y, crossing at the origin, the panel's corner toward +x +y, z out
 * of the faces. It prints its top face down.
 * @param {string | object} profile @param {{ sheet: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, load?: number, grip?: number, printer?: object, material?: string | object, given?: object }} o
 * @returns {object} the corner's model
 */
export function panelCornerModel(profile, o = {}) {
  const what = 'panelCornerModel';
  options(what, o ?? {}, ['sheet', 'face', 'thread', 'head', 'nut', 'load', 'grip', 'printer', 'material', 'given']);
  const clip = panelClipModel(profile, { ...o }), k = partSetup(what, o), p = profileOf(what, profile, o.given ?? {});
  const half = Math.max(p.width, p.height) / 2, nutLen = Math.max(...slotSide(what, p, o.face ?? 'top', clip.thread, o.nut, k.fit, o.given ?? {}).nuts.map((n) => n.length));
  const sc = screwOf(what, clip.thread, clip.head, k.pr), s = r3(up(Math.max(half + nutLen / 2 + k.fit, clip.reach + sc.dk / 2), 0.5)), end = r3(up(s + clip.edge - PANEL_DEFAULTS.gap.value, 0.5));
  const e = clip.edge - PANEL_DEFAULTS.gap.value, R = clip.reach;
  const outline = roundConcave(ccw([[-e, -e], [end, -e], [end, R], [R, R], [R, end], [-e, end]]), Math.min(R - e, 3), null, 10).map(([x, y]) => [r3(x), r3(y)]);
  // the clip's load at the corner, on the step along both edges near it (two grips long): sized as a clip is
  const F = clip.load.force, M = F * (PANEL_DEFAULTS.gap.value + clip.grip / 2), b = 2 * clip.grip, tc0 = Math.max(clip.thickness, up(bendT(M, b, k.S, want()), k.layer));
  const sd = slotSide(what, p, o.face ?? 'top', clip.thread, o.nut, k.fit, o.given ?? {}), fits = sold(r3(clip.sheet + tc0), k.layer, [sd], clip.thread), H = fits ? fits.t : r3(clip.sheet + tc0), T = clip.sheet;
  const stress = r3((6 * M) / (b * (H - T) ** 2)), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'panel-corner', name: clip.name.replace('panel-clip', 'panel-corner'), title: clip.title.replace('panel clip', 'panel corner'), profile: clip.profile, face: clip.face, thread: clip.thread, head: clip.head,
    sheet: T, height: H, thickness: r3(H - T), edge: clip.edge, outline, arm: end, round: PANEL_DEFAULTS.corner.value, tongue: clip.tongue, cross: half,
    screws: [[s, 0], [0, s]].map(([x, y]) => ({ ...clip.screws[0], grip: H, at: [x, y, H], length: fits?.lengths[0] ?? null })), load: { force: F, what: `${F} N pushing the panel's corner out` }, stress, margin, size: { arm: end, height: H, edge: clip.edge },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: clip.rests };
  weigh(m, panelCorner(m, { printer: k.pr }), k.density);
  closing(m, { S: k.S, sizeText: `arms ${mm(end)} mm along each slot from the crossing, ${mm(H)} mm high, its screws ${mm(s)} mm along each slot, clear of the other beam`, marginText: `under ${m.load.what}, the step bends to ${mm(stress)} MPa`, pose: 'top face down, its step and tongues up' });
  return m;
}

/**
 * A panel corner's solid: top face down to print (pose 'print'), or fitted (pose 'fit').
 * @param {object} m @param {{ pose?: 'print' | 'fit', tongues?: boolean, ops?: object, printer?: object }} [o] @returns {object} a JSCAD geom3, with .model
 */
export function panelCorner(m, o = {}) {
  if (m?.fitting !== 'panel-corner') throw new Error(`panelCorner: give a corner's model (panelCornerModel), not ${shown(m)}`);
  const pr = printerOf('panelCorner', o.printer), root = pfig(pr, 'fit'), H = m.height, T = m.sheet, e = m.edge - PANEL_DEFAULTS.gap.value, big = m.arm + 10;
  // in the print frame: y = -y(fit), z = H - z(fit), so the contact face is on top at z = H and the step opens up
  const flip = (pts) => pts.map(([x, y]) => [x, -y]), parts = [prism(flip(m.outline), H)];
  if (o.tongues !== false && m.tongue.depth > 0) {
    const tl = tongueLoop(-m.tongue.width / 2, m.tongue.width / 2, m.tongue.depth, false, root), from = m.cross + root, len = m.arm - root - from;
    parts.push(transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, from, 0, 0, 1], prism(tl.map(([n, a]) => [a, H + n]), len))); // along x: (a, H + n) in (Y, Z)
    parts.push(transform([0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -(from + len), 0, 1], prism(tl.map(([n, a]) => [H + n, a]), len))); // along -y: (H + n, a) in (Z, X)
  }
  // the step over the panel: x > e and y > e (fitted), its corner at (e, e) rounded where the panel's rounded corner sits
  const rr = m.round + PANEL_DEFAULTS.gap.value, arc = Array.from({ length: 13 }, (_, i) => { const t = Math.PI + (i / 12) * (Math.PI / 2); return [e + rr + rr * Math.cos(t), e + rr + rr * Math.sin(t)]; });
  const step = translate([0, 0, H - T], prism(flip([[big, e], [big, big], [e, big], ...arc]), T + 1));
  const holes = m.screws.map((q) => hole(m.thread, { kind: 'clearance', into: '+z', depth: H + 2 + m.tongue.depth, at: [q.at[0], -q.at[1], -1], printer: pr }));
  const g = combine(parts, [step, ...holes], o.ops);
  return Object.assign(o.pose === 'fit' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, H, 1], g) : g, { model: m });
}

// ---------- strips: a slot cover, an in-slot panel edge, a gasket ----------
// A strip's section in (y, z) of its fitted frame, extruded along x for its length (pose 'fit'); to print, turned over
// onto its top (bed 'top') or lifted onto its lowest face (bed 'bottom'), lying along the bed
function stripSolid(loop, length, bed, pose) {
  const fit = transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], prism(loop, length));
  if (pose === 'fit') return fit;
  const zs = loop.map((q) => q[1]), top = Math.max(...zs), low = Math.min(...zs);
  return bed === 'top' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, top, 1], fit) : translate([0, 0, -low], fit);
}
const lengthOk = (what, L) => { if (!(isNum(L) && L > 0 && L <= 2000)) throw new Error(`${what}: length is the strip's, in mm, above 0 and up to 2000 (got ${shown(L)})`); return L; };

/**
 * A printed cover that closes a slot nothing uses: a thin flange on the face, a stem in the slot's opening and a barb
 * under each lip, leaning 45° so it prints. It prints lying down, its flange on the bed.
 * @param {string | object} profile @param {{ length: number, face?: string, printer?: object, material?: string | object, given?: object }} o
 * @returns {object} its model
 */
export function slotCoverModel(profile, o = {}) {
  const what = 'slotCoverModel';
  options(what, o ?? {}, ['length', 'face', 'printer', 'material', 'given']);
  const L = lengthOk(what, o.length), given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  const sd = slotSide(what, p, o.face ?? 'top', undefined, null, k.fit, given);
  const op = sd.slot.opening, lip = sd.slot.lip, ws = r3(op - 2 * k.fit), b = PANEL_DEFAULTS.barb.value, tf = r3(up(2 * k.layer + k.layer, k.layer)), lap = PANEL_DEFAULTS.lap.value, half = r3(op / 2 + lap);
  if (ws < 2 * k.line) throw new Error(`${what}: ${sd.slot.name}'s ${mm(op)} mm opening leaves a stem ${mm(ws)} mm wide: too thin to print`);
  const loop = [[-half, 0], [-ws / 2, 0], [-ws / 2, -lip], [-ws / 2 - b, -lip - b], [-ws / 2, -lip - 2 * b], [-ws / 2 + b, -lip - 2 * b - b], [ws / 2 - b, -lip - 3 * b], [ws / 2, -lip - 2 * b], [ws / 2 + b, -lip - b], [ws / 2, -lip], [ws / 2, 0], [half, 0], [half, tf], [-half, tf]].map(([y, z]) => [r3(y), r3(z)]);
  const m = { kind: 'fitting', fitting: 'slot-cover', name: `slot-cover-${sd.slot.name.replace(/^slot-/, '')}-${Math.round(L)}`, title: `printed slot cover for ${sd.slot.name}, ${mm(L)} mm`, profile: p.name, face: sd.face, slot: sd.slot.name, length: L, section: loop,
    flange: tf, stem: ws, barb: b, screws: [], load: { force: 0, what: 'none: it carries nothing' }, stress: 0, margin: Infinity, size: { length: L, flange: tf, stem: ws, barb: b }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: ['barb', 'lap'].map((x) => ({ name: `PANEL_DEFAULTS.${x}`, value: PANEL_DEFAULTS[x].value, kind: PANEL_DEFAULTS[x].kind })) };
  weigh(m, slotCover(m), k.density);
  m.findings.push(finding('info', `${m.title}: a ${mm(tf)} mm flange lapping the face ${mm(lap)} mm past the opening, a ${mm(ws)} mm stem through the ${mm(lip)} mm lip, barbs ${mm(b)} mm past the opening under it (an estimate: try one in a scrap of beam)`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding('info', 'it is drawn to print lying down, its flange on the bed, the barbs\' faces leaning 45°: no supports (printcheck\'s check() reads the solid)', 'fitting.printable', { values: { pose: 'flange down' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  return m;
}
/** A slot cover's solid: flange down to print (pose 'print'), or fitted (pose 'fit'). @param {object} m @param {{ pose?: 'print' | 'fit' }} [o] @returns {object} */
export function slotCover(m, o = {}) {
  if (m?.fitting !== 'slot-cover') throw new Error(`slotCover: give a slot cover's model (slotCoverModel), not ${shown(m)}`);
  return Object.assign(stripSolid(m.section, m.length, 'top', o.pose), { model: m });
}

/**
 * A printed edge that holds a sheet thinner than a slot's opening in the slot: a channel as wide as the opening less
 * the fit, a groove as wide as the sheet with the fit, as deep as the lip and the cavity allow. Refused by name where
 * the sheet leaves walls thinner than the printer's lines allow. It prints lying down, its groove up.
 * @param {string | object} profile @param {{ sheet: number, length: number, face?: string, printer?: object, material?: string | object, given?: object }} o
 * @returns {object} its model: depth (how far the sheet goes into the slot past the face)
 */
export function panelEdgeModel(profile, o = {}) {
  const what = 'panelEdgeModel';
  options(what, o ?? {}, ['sheet', 'length', 'face', 'printer', 'material', 'given']);
  const T = sheetThickness(what, o.sheet), L = lengthOk(what, o.length), given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  const sd = slotSide(what, p, o.face ?? 'top', undefined, null, k.fit, given), op = sd.slot.opening, ws = r3(op - 2 * k.fit), groove = r3(T + 2 * k.fit), wall = r3((ws - groove) / 2), least = 2 * k.line;
  if (wall < least - 1e-9) throw new Error(`${what}: a ${mm(T)} mm sheet in ${sd.slot.name}'s ${mm(op)} mm opening leaves walls of ${mm(wall)} mm, under the ${mm(least)} mm two of ${k.pr.name}'s lines make: a sheet of ${mm(Math.max(0, ws - 2 * least - 2 * k.fit))} mm or less, or panel clips on the face`);
  const floor = r3(up(2 * k.layer, k.layer)), depth = r3(Math.min(sd.slot.cavityDepth - FITTING_DEFAULTS.floor.value, sd.slot.lip + 2)), h = depth;
  const loop = [[-ws / 2, -h], [ws / 2, -h], [ws / 2, 0], [groove / 2, 0], [groove / 2, -h + floor], [-groove / 2, -h + floor], [-groove / 2, 0], [-ws / 2, 0]].map(([y, z]) => [r3(y), r3(z)]);
  const m = { kind: 'fitting', fitting: 'panel-edge', name: `panel-edge-${sd.slot.name.replace(/^slot-/, '')}-${mm(T)}mm-${Math.round(L)}`, title: `printed in-slot edge for a ${mm(T)} mm sheet in ${sd.slot.name}, ${mm(L)} mm`, profile: p.name, face: sd.face, slot: sd.slot.name,
    sheet: T, length: L, section: loop, width: ws, groove, wall, depth: r3(h - floor), screws: [], load: { force: 0, what: 'the sheet\'s own weight' }, stress: 0, margin: Infinity, size: { width: ws, groove, wall, depth: r3(h - floor), length: L },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: [{ name: `${k.pr.name}.fit`, value: k.fit }] };
  weigh(m, panelEdge(m), k.density);
  m.findings.push(finding('info', `${m.title}: ${mm(ws)} mm wide in the ${mm(op)} mm opening, its groove ${mm(groove)} mm (the sheet and the fit each side), walls ${mm(wall)} mm; the sheet goes ${mm(h - floor)} mm into the slot past the face`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding('info', 'it is drawn to print lying down, its floor on the bed and its groove up: no supports', 'fitting.printable', { values: { pose: 'floor down' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  return m;
}
/** An in-slot panel edge's solid: floor down to print, or fitted. @param {object} m @param {{ pose?: 'print' | 'fit' }} [o] @returns {object} */
export function panelEdge(m, o = {}) {
  if (m?.fitting !== 'panel-edge') throw new Error(`panelEdge: give a panel edge's model (panelEdgeModel), not ${shown(m)}`);
  return Object.assign(stripSolid(m.section, m.length, 'bottom', o.pose), { model: m });
}

/**
 * A printed gasket strip for a door's gap: a hollow triangle of thin walls, its base taped to the door's inner face,
 * as high as the gap and the squeeze, so the closing door presses it onto the beam's face. Its walls lean 30° from
 * upright, so it prints lying on its base and folds rather than buckles. Best in PETG, which springs back where PLA creeps.
 * @param {{ gap: number, length: number, squeeze?: number, printer?: object, material?: string | object }} o
 * @returns {object} its model: strain (its walls' at the squeeze) against the plastic's limit
 */
export function gasketStripModel(o = {}) {
  const what = 'gasketStripModel';
  options(what, o ?? {}, ['gap', 'length', 'squeeze', 'printer', 'material']);
  if (!(isNum(o.gap) && o.gap > 0)) throw new Error(`${what}: gap is the door's standoff from the beam's face, in mm, above 0 (got ${shown(o.gap)})`);
  const L = lengthOk(what, o.length), k = partSetup(what, { material: 'petg', ...o }), sq = o.squeeze ?? PANEL_DEFAULTS.squeeze.value;
  if (!(isNum(sq) && sq > 0 && sq < o.gap)) throw new Error(`${what}: squeeze is how far the door presses it, in mm, above 0 and under the gap (got ${shown(o.squeeze)})`);
  const h = r3(o.gap + sq), t = r3(2 * k.line), half = r3(h * Math.tan(Math.PI / 6)), E = k.mat.rules.modulus.value;
  const outer = [[-half, 0], [half, 0], [0, h]], d = t / Math.cos(Math.PI / 6), inner = [[-half + d * 1.8, t], [half - d * 1.8, t], [0, h - 2 * d]];
  // each wall a cantilever of its slant length, pushed sq at its tip: strain 3 t δ / (2 L²)
  const slant = Math.hypot(half, h), strain = r3((3 * t * sq) / (2 * slant * slant)), limit = r3(k.S / E), margin = r3(limit / strain);
  const m = { kind: 'fitting', fitting: 'gasket-strip', name: `gasket-strip-${mm(o.gap)}mm-${Math.round(L)}`, title: `printed gasket strip for a ${mm(o.gap)} mm gap, ${mm(L)} mm`, length: L, height: h, wall: t, base: r3(2 * half), squeeze: sq, outer, inner,
    screws: [], load: { force: 0, what: `the door pressing it ${mm(sq)} mm` }, strain, stress: r3(strain * E), margin, size: { height: h, base: r3(2 * half), wall: t, length: L }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, { name: `${k.mat.name}.modulus`, value: E }, { name: 'PANEL_DEFAULTS.squeeze', value: sq, kind: PANEL_DEFAULTS.squeeze.kind }] };
  weigh(m, gasketStrip(m), k.density);
  const ok = margin >= want() - 1e-9;
  m.findings.push(finding('info', `${m.title}: a hollow triangle ${mm(h)} mm high on a ${mm(2 * half)} mm base, walls ${mm(t)} mm (two lines), squeezed ${mm(sq)} mm`, 'fitting.size', { values: { ...m.size } }));
  m.findings.push(finding(ok ? 'pass' : 'warn', `pressed ${mm(sq)} mm, its walls bend to a strain of ${mm(strain * 100)}%, ${mm(margin)} times under ${m.material.toUpperCase()}'s ${mm(limit * 100)}% (its strength over its modulus): by beam formulas, an estimate${m.material === 'pla' ? '. PLA creeps held bent: PETG keeps its spring' : ''}`, 'fitting.margin', { values: { strain, limit, margin } }));
  m.findings.push(finding('info', 'it is drawn to print lying on its base, its walls leaning 30° from upright: no supports', 'fitting.printable', { values: { pose: 'base down' } }));
  m.findings.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
  return m;
}
/** A gasket strip's solid, base down (its print pose and, turned over onto the door, its fitted one). @param {object} m @returns {object} */
export function gasketStrip(m) {
  if (m?.fitting !== 'gasket-strip') throw new Error(`gasketStrip: give a gasket strip's model (gasketStripModel), not ${shown(m)}`);
  const turn = (dy) => [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, dy, 0, 1]; // (u, v) to (X, Z), along -Y
  const body = transform(turn(m.length), prism(m.outer, m.length)), hollow = transform(turn(m.length + 1), prism(m.inner, m.length + 2));
  return Object.assign(subtract(body, hollow), { model: m });
}

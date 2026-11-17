// Printed beams, as numbers: printable profiles (rule sets worked out from a slot family's nuts and a printer's rules),
// what a printed section is worth from its walls and infill, and what a beam printed lying down or standing up can
// carry and hold. beamModel reads printedOf for a beam given { printed }; printed.mjs draws the solid as it prints, its
// ends and a splice.
//
// A printed beam lies down on its bottom face (-y) or stands on end a. Lying down, its layers run along the beam, so it
// bends on the plastic's figures along its layers; standing up, its section is the layer, exact, and it bends across
// its layers, where plastic is weakest. A slot prints lying down only facing up, with the undersides of its lips sloped
// at the printer's overhang angle (a flat lip hangs out over the cavity), or facing the bed with a floor narrow enough to
// bridge; a slot in a side face hangs its upper lip in mid-air. So the kit's printable profiles have one slot, on top.
// Units: mm, grams, newtons, MPa.
import x1c from '@rulecad/rules/x1c.json' with { type: 'json' };
import { fixingModel } from '@rulecad/fixings';
import { SETS } from './catalogue.mjs';
import { outline, section } from './profile.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const RAD = Math.PI / 180, COS30 = Math.cos(30 * RAD);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
/** The date the rules this module adds were worked out. */
export const PRINTED_CHECKED = '2026-11-17';
const rule = (value, unit, text, kind, source) => ({ value, ...(unit != null ? { unit } : {}), rule: text, kind, source, checked: PRINTED_CHECKED });
const KIT = 'A working figure of @rulecad/frames';

/**
 * The rules a printed beam is drawn and checked by, each with what it comes from.
 * @type {Record<string, { value: number, unit?: string, rule: string, kind: string, source: string, checked: string }>}
 */
export const PRINTED_DEFAULTS = {
  walls: rule(3, 'lines', 'The walls round every outline of a printed beam\'s section, its outside and its slot: solid plastic where the bending stress is greatest', 'default', `${KIT}: a part that carries load, so one wall more than a slicer's standard two; give the walls you print`),
  infill: rule(0.4, '', 'The share of the section inside the walls that the infill fills', 'default', `${KIT} for a beam that carries load; give the infill you print`),
  infill_stiffness: rule(1, '× infill', 'How much of the solid plastic\'s stiffness and strength the infill keeps, for each unit of its share: lines and grids carry load along their lines about in proportion to how much of them there is', 'estimate', 'A rule of mixtures, not measured: a beam coupon bent between two supports (cad measured) replaces it'),
  across: rule(0.6, '× strength', 'A part pulled across its layers breaks at this share of its strength along them, where the material gives no strength across the layers of its own', 'estimate', 'The kit\'s petg set (Bambu Lab PETG HF) gives 23 MPa across its layers and 34 along them, 0.68; Bambu Lab\'s PLA Basic sheet gives none, so a little under that'),
  pull: rule(100, 'N', 'The pull a nut in a printed beam\'s slot is sized for, where none is given', 'default', 'FITTING_DEFAULTS.load of @rulecad/frames: the design load every printed fitting is sized at'),
  margin: rule(2, '× load', 'A printed beam\'s lips and splice are sized to hold about twice their load', 'default', 'The kit\'s standard for printed parts: sized from the load with about twice the margin'),
  spread: rule(1, '× lip', 'A nut\'s pull spreads along the slot by about one lip\'s thickness beyond each end of the nut', 'estimate', `${KIT}: a 45° spread through the lip`),
  cheek: rule(4, 'lines', 'The least width a splice\'s notch leaves each side where it meets the bed', 'estimate', `${KIT}: four lines, so the notch's cheeks print as solid walls and do not snap off`),
  lap: rule(2, '× height', 'The shortest lap a splice is tried at; its screws\' bearing makes it longer where the joint needs it', 'default', KIT),
  end_wall: rule(1.5, '× diameter', 'Plastic between a beam\'s end and a captive nut that a screw from the end meets, as a share of the thread\'s diameter', 'estimate', `${KIT}: what the nut pulls against, about as much as an insert's own wall`),
  strength_bearing: rule(1, '× strength', 'A screw bearing on the side of its hole in printed plastic crushes it at about the plastic\'s strength', 'estimate', `${KIT}: bearing taken at the tensile strength, below a printed part's compressive strength`),
};

/**
 * The kit's printable profiles by size, and the nut each is drawn round: one of its slot family's (its own family's nuts
 * fit by the same sizes). 15: OpenBeam's slot, which captures a plain M3 nut; 20: MISUMI's 6 mm slot; 30 and 40:
 * MISUMI's 8 mm slot.
 * @type {Readonly<Record<number, { nut: string }>>}
 */
export const PRINTED_SERIES = Object.freeze({ 15: { nut: 'slot-nut-3-openbeam-m3-hex' }, 20: { nut: 'slot-nut-6-misumi-m4-drop-in' }, 30: { nut: 'slot-nut-8-misumi-m5-drop-in' }, 40: { nut: 'slot-nut-8-misumi-m6-drop-in' } });
const END_THREADS = ['M8', 'M6', 'M5', 'M4', 'M3', 'M2.5', 'M2'];

/**
 * A printer's figures as this module reads them: the kit's X1C where none is given, a rule set ({ name, rules }), or
 * plain numbers ({ overhang: 50, line: 0.45 }) over the X1C's.
 * @param {string} what @param {any} p
 * @returns {{ name: string, n: (k: string) => number, cite: (k: string) => string, rules: Record<string, any> }}
 */
export function printerFigures(what, p) {
  if (p != null && (typeof p !== 'object' || Array.isArray(p))) throw new Error(`${what}: printer is a rule set ({ name, rules }) or its values ({ overhang: 45, line: 0.42 }), not ${shown(p)}`);
  const set = p == null ? x1c : p.rules ? p : { name: p.name ?? 'the printer', rules: Object.fromEntries(Object.entries(p).filter(([, v]) => isNum(v)).map(([k, v]) => [k, { value: v, kind: 'given', source: 'given as a number' }])) };
  const own = (k) => isNum(set.rules?.[k]?.value);
  const n = (k) => { const v = own(k) ? set.rules[k].value : x1c.rules[k]?.value; if (!isNum(v)) throw new Error(`${what}: the printer gives no ${k}`); return v; };
  return { name: set.name ?? 'the printer', rules: set.rules ?? {}, n, cite: (k) => `${own(k) ? set.name : 'x1c'}.${k}` };
}

const familyOf = (name) => { const s = SETS[name]; return s?.part === 'slot' ? String(s.rules.nut_family?.value ?? name) : name; };
const v = (s, k) => s?.rules?.[k]?.value;

// The hold of a slot's lips in plastic: the nut pulls on each lip at its edge; the lip bends at its root, and where the
// lip's underside slopes the nut's push also bends the side wall outward from the slot's floor. Returns the stress at a
// pull F and what it rests on.
function lipStress({ opening, lip, lipAngle, cavityWidth, cavityDepth }, wall, nut, F, spread) {
  const w = Math.min(nut.width, cavityWidth), tan = Math.tan(lipAngle * RAD), b = nut.length + 2 * spread * lip;
  const contact = lip + Math.max(0, (w - opening) / 2) * tan; // how deep under the face the nut's corners bear
  const root = lip + ((cavityWidth - opening) / 2) * tan; // the lip's thickness where it meets the wall
  // flat lips: the nut bears from the opening's edge to its own edge, its pull at the middle of that; sloped lips: at the nut's corners
  const arm = tan > 1e-9 ? (cavityWidth - w) / 2 : cavityWidth / 2 - (opening / 2 + w / 2) / 2;
  const sLip = (6 * (F / 2) * Math.max(arm, 0)) / (b * root * root), push = (F / 2) * tan, lever = Math.max(0, cavityDepth - contact);
  const sWall = wall > 0 ? (6 * push * lever) / (b * wall * wall) : Infinity;
  return { stress: Math.max(sLip, sWall), lip: sLip, wall: sWall, along: b, arm, root, contact, lever, push };
}
// What a slot's lips and walls hold, each at the plastic's strength in the direction its bending stress runs: lips and
// walls of a slot bend at their roots, their stress running across the plate from the root out, so a plate lying flat
// in the layers bends along them and one standing up through the layers bends across them.
// Returns the margin (the least of the two), the hold at pull F and which governs.
function slotHold(st, F, sLip, sWall) {
  const lip = st.lip > 0 ? sLip / st.lip : Infinity, wall = st.wall > 0 ? sWall / st.wall : Infinity, margin = Math.min(lip, wall);
  return { margin: r3(margin), hold: r3(F * margin), governs: wall <= lip ? 'wall' : 'lip', lip: r3(lip), wall: r3(wall) };
}

/**
 * A printable profile and its slot, as rule sets: a square section of the size asked with one slot, in its top face, that
 * takes its slot family's nuts. The slot's lips slope underneath at the printer's overhang angle so they print lying
 * down with no support, its floor's corners are chamfered (no square inside corner), the walls beside it are whole
 * lines and its lips whole layers, sized from a nut's pull with about twice the margin. Under the slot the section is
 * solid, with room for a heat-set insert or a captive nut in each end (end_thread, end_at). Every figure is worked out:
 * kind derived, its source naming the nuts and the printer's rules it comes from.
 * @param {number} series 15, 20, 30 or 40 (PRINTED_SERIES), or any size with { nut }
 * @param {{ nut?: string, printer?: object, pull?: number, material?: string }} [o] nut: the slot nut's set the slot is
 *   drawn round (all its family's nuts of the same kind count); printer: as printerFigures; pull: N, a nut's design pull
 *   (PRINTED_DEFAULTS.pull); material: the plastic's set (pla)
 * @returns {{ profile: { name: string, part: 'profile', _doc: string, rules: object }, slot: { name: string, part: 'slot', _doc: string, rules: object },
 *   values: { opening: number, lip: number, cavityWidth: number, cavityDepth: number, wall: number, wallLines: number, solid: number, endThread: string, endAt: [number, number], hold: number, margin: number } }}
 */
export function printedProfile(series, o = {}) {
  const what = 'printedProfile';
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: options are { nut, printer, pull, material }, not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!['nut', 'printer', 'pull', 'material'].includes(k)) throw new Error(`${what}: no option "${k}": it takes nut, printer, pull and material`);
  if (!(isNum(series) && series > 0)) throw new Error(`${what}: series is the section's side in mm, ${Object.keys(PRINTED_SERIES).join(', ')} (got ${shown(series)})`);
  const nutName = o.nut ?? PRINTED_SERIES[series]?.nut;
  if (!nutName) throw new Error(`${what}: the kit draws ${Object.keys(PRINTED_SERIES).join(', ')} mm; for ${series} mm name the slot nut to draw the slot round: { nut: 'slot-nut-6-misumi-m4-drop-in' }`);
  const N = SETS[nutName];
  if (N?.part !== 'slot_nut') throw new Error(`${what}: nut is a slot nut's set, such as slot-nut-6-misumi-m4-drop-in (got ${shown(nutName)})`);
  const S = SETS[v(N, 'slot')], family = familyOf(v(N, 'slot')), kind = v(N, 'nut_kind');
  if (S?.part !== 'slot') throw new Error(`${what}: ${N.name} names no slot family the kit has (${shown(v(N, 'slot'))})`);
  const P = printerFigures(what, o.printer), material = o.material ?? 'pla';
  if (!SETS[material]?.rules?.strength || !SETS[material].rules.softening) throw new Error(`${what}: material is a plastic's set with a strength and a softening point, such as pla or petg (got ${shown(o.material)})`);
  const F = o.pull ?? PRINTED_DEFAULTS.pull.value;
  if (!(isNum(F) && F > 0)) throw new Error(`${what}: pull is a nut's design pull in N, above 0 (got ${shown(o.pull)})`);
  const nuts = Object.values(SETS).filter((s) => s.part === 'slot_nut' && familyOf(v(s, 'slot')) === family && v(s, 'nut_kind') === kind).sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(...nuts.map((s) => v(s, 'width'))), height = Math.max(...nuts.map((s) => v(s, 'height'))), length = Math.min(...nuts.map((s) => v(s, 'length')));
  const tongueW = Math.max(0, ...nuts.map((s) => v(s, 'tongue_width') ?? 0)), tongueH = Math.max(0, ...nuts.map((s) => v(s, 'tongue_height') ?? 0));
  const line = P.n('line'), layer = P.n('layer'), fit = P.n('fit'), comp = P.n('hole_comp'), chamfer = P.n('chamfer'), overhang = P.n('overhang');
  const lipAngle = 90 - overhang, tan = Math.tan(lipAngle * RAD), up = (x, step) => r3(Math.ceil(x / step - 1e-9) * step);
  // the opening: the family's, or the widest tongue and a fit, widened by what a printed gap loses
  const opening = r3(Math.max(v(S, 'opening'), tongueW + fit) + comp);
  // the cavity: the widest nut and a fit, the walls beside it whole lines (the thickest that leave that room); a hex nut
  // is held by its flats, so the cavity stays narrower than its corners less a fit
  const least = width + fit, most = kind === 'hex' ? width / COS30 - fit : series - 4 * line;
  const lines = Math.floor((series - least) / (2 * line) + 1e-9), cavityWidth = r3(series - 2 * lines * line), wall = r3(lines * line);
  if (!(lines >= 2 && cavityWidth <= most + 1e-9)) throw new Error(`${what}: a ${series} mm section has no wall of whole ${line} mm lines that leaves ${mm(least)} mm for ${N.name}${kind === 'hex' ? ` and under ${mm(most)} mm to hold its flats` : ''}: a larger section or a smaller nut`);
  // the lips: the family's thickness (so its nuts' tongues and screws' lengths still serve), whole layers, thicker where the pull needs it
  const geometry = (lip) => { const contact = lip + ((width - opening) / 2) * tan, cavityDepth = r3(contact + height + fit + chamfer); return { opening, lip, lipAngle, cavityWidth, cavityDepth }; };
  // lying down with its slot up, the lips lie flat in the layers and bend along them; the side walls stand up through
  // the layers and bend across them, at the plastic's strength across its layers (strength_z, or PRINTED_DEFAULTS.across of it)
  const strength = SETS[material].rules.strength.value, strengthZ = SETS[material].rules.strength_z?.value ?? r3(strength * PRINTED_DEFAULTS.across.value), margin = PRINTED_DEFAULTS.margin.value, spread = PRINTED_DEFAULTS.spread.value;
  const holdOf = (lip) => slotHold(lipStress(geometry(lip), wall, { width, length }, F, spread), F, strength, strengthZ);
  let lip = up(Math.max(v(S, 'lip_thickness'), tongueH, 2 * layer), layer), g = geometry(lip), st = holdOf(lip);
  while (st.margin < margin && lip < series / 4) { lip = r3(lip + layer); g = geometry(lip); st = holdOf(lip); }
  if (st.margin < margin) throw new Error(`${what}: ${series} mm: no lip under a quarter of the section holds ${F} N with ${margin} times the margin in ${material}: a smaller pull, or a larger section`);
  const { cavityDepth } = g, floorWidth = r3(cavityWidth - 2 * chamfer), solid = r3(series - cavityDepth), yc = r3(-cavityDepth / 2);
  // the ends: the largest thread whose heat-set insert, with its wall and a line to spare, fits in the solid under the slot
  const endThread = END_THREADS.find((t) => { const f = fixingModel(t).figures, h = f.insert_hole?.value, wl = f.insert_wall?.value; return isNum(h) && isNum(wl) && h + 2 * wl + 2 * line <= Math.min(solid, series) + 1e-9; });
  if (!endThread) throw new Error(`${what}: ${series} mm: the ${mm(solid)} mm under the slot holds no heat-set insert of ${END_THREADS.at(-1)} or more`);
  const hold = st.hold, held = st.margin, acrossSaid = SETS[material].rules.strength_z ? `${material}.strength_z` : `${material}.strength x PRINTED_DEFAULTS.across`, cell = `${series}${series}`, opens = String(v(S, 'opening')).split('.')[0];
  const slotName = `slot-${S.name.match(/^slot-([\d.]+)/)?.[1] ?? opens}-printed-${cell}`, name = `profile-${cell}-printed`;
  const by = `worked out by @rulecad/frames printedProfile`, nutsSaid = nuts.map((s) => s.name).join(', '), pr = (...ks) => ks.map((k) => P.cite(k)).join(', ');
  const d = (value, unit, text, from) => rule(value, unit, text, 'derived', `${by} from ${from}`);
  const slot = { _doc: `The slot of the kit's printed ${series} x ${series} mm beam (${name}): the ${family} family's ${kind} nuts (${nutsSaid}) go in it, and it prints lying down facing up with no support. The undersides of its lips slope at the printer's overhang angle, so its nuts bear on their top corners, not their whole top. Worked out from those nuts' sizes and the printer's rules by @rulecad/frames printedProfile; a printer with other rules gives other figures.`,
    name: slotName, part: 'slot', rules: {
      opening: d(opening, 'mm', `Between the lips: ${family}'s ${v(S, 'opening')} mm or its nuts' widest tongue and a fit, whichever is wider, widened by the printer's hole compensation, since a printed gap comes out narrow`, `${S.name}.opening, ${nutsSaid} (tongue_width) and ${pr('fit', 'hole_comp')}`),
      lip_thickness: d(lip, 'mm', `${family}'s lip in whole layers, thicker where a nut's pull of ${F} N needs it: its lips and side walls hold ${mm(hold)} N in ${material}, ${mm(held)} times that pull, the ${st.governs === 'wall' ? 'side walls' : 'lips'} the weaker: the lips lie in the layers and bend along them at ${strength} MPa, the walls stand through the layers and bend across them at ${strengthZ} MPa (an estimate: one lip's spread each side of the nut)`, `${S.name}.lip_thickness, ${pr('layer')}, ${material}.strength, ${acrossSaid} and PRINTED_DEFAULTS pull, spread and margin`),
      lip_angle: d(lipAngle, 'deg', `The undersides of the lips slope at the printer's overhang angle from the face, so they print over the cavity with no support when the beam lies down with its slot up`, pr('overhang')),
      cavity_width: d(cavityWidth, 'mm', `The widest of its nuts and a fit, the wall beside it ${lines} whole lines (${mm(wall)} mm)${kind === 'hex' ? ', and narrower than the nut\'s corners so its flats cannot turn' : ''}`, `${nutsSaid} (width) and ${pr('fit', 'line')}`),
      cavity_depth: d(cavityDepth, 'mm', `To the floor: the nut's corners bear on the sloping lips ${mm(g.lip + ((width - opening) / 2) * tan)} mm under the face, then its height, a fit and the floor's chamfer`, `${nutsSaid} (height) and ${pr('fit', 'chamfer')}`),
      floor_width: d(floorWidth, 'mm', 'The floor less a chamfer at each side: no square inside corner where the wall meets the floor', pr('chamfer')),
      flank_angle: d(45, 'deg', 'The floor\'s chamfers at 45 degrees', pr('chamfer')),
      nut_family: d(family, null, `It takes the nuts made for ${family}: their sizes fit it (nutFit says so for each)`, S.name),
    } };
  const profile = { _doc: `The kit's printed ${series} x ${series} mm beam, to print lying down with no support: one slot, in its top face (${slotName}), taking ${family}'s nuts; the other faces closed, since a slot in a side face hangs its upper lip in mid-air when it lies down; solid under the slot, with a heat-set insert or a captive nut (${endThread}) in place of a tapped end. What it weighs and bends like comes from the walls and infill it is printed with (printedSection). Worked out by @rulecad/frames printedProfile from its nuts' sizes and the printer's rules.`,
    name, part: 'profile', rules: {
      family: d('printed', null, 'A section printed in plastic', by.replace('worked out by ', '')),
      series: d(series, 'mm', 'The size it is drawn to, as the aluminium series of that size', 'the size asked'),
      cells_across: d(1, '', 'One cell', 'the size asked'), cells_up: d(1, '', 'One cell high', 'the size asked'),
      width: d(series, 'mm', 'Across the section', 'the size asked'), height: d(series, 'mm', 'Up the section', 'the size asked'),
      corner_radius: d(0, 'mm', 'Square outside corners: a round on the bottom edges would overhang the bed', pr('chamfer')),
      slot: d('closed', null, 'Faces are closed where slot_top does not say otherwise: a side face\'s slot hangs its upper lip in mid-air lying down, and a slot on the bed leaves too little under it for an end\'s insert', 'printedProfile'),
      slot_top: d(slotName, null, 'One slot, in the top face, which faces up as the beam prints', slotName),
      end_thread: d(endThread, null, `The largest thread whose heat-set insert, with its wall and a line each side, fits in the ${mm(solid)} mm under the slot`, `${endThread.toLowerCase().replace('.', '_')}.insert_hole, insert_wall and ${pr('line')}`),
      end_at: d(`0,${yc}`, null, 'The end\'s insert or nut in the middle of the solid under the slot, from the middle of the section (x,y)', 'the slot\'s depth'),
      material: d(material, null, `Printed in ${material} unless the beam says another plastic`, `${material} rule set`),
    } };
  return { profile, slot, values: { opening, lip, cavityWidth, cavityDepth, wall, wallLines: lines, solid, endThread, endAt: [0, yc], hold, margin: held } };
}

/**
 * What a printed section is worth, from the walls and infill it is printed with: a shell of `walls` lines inside every
 * outline (solid plastic) and infill of share `infill` within, found on a raster of the outline. Stiffness and strength
 * come from the shell and from the infill at its share times infill_stiffness; mass from the plastic laid. Every figure
 * is an estimate until a printed coupon is measured.
 * @param {import('./profile.mjs').Profile} p a profile's model
 * @param {{ walls?: number, infill?: number, line?: number, cells?: number }} [o] walls: lines (PRINTED_DEFAULTS.walls); infill: 0 to 1; line: mm (the X1C's)
 * @returns {{ area: number, shell: number, inner: number, plastic: number, centroid: [number, number], inertiaX: number, inertiaY: number,
 *   solid: { area: number, inertiaX: number, inertiaY: number }, modulusX: number, modulusY: number, reach: [number, number], walls: number, infill: number, thickness: number }}
 *   plastic: the area of plastic laid (shell, and inner times infill), for the mass; area, inertiaX, inertiaY: weighted for stiffness (mm², mm⁴);
 *   solid: the same of a solid section; reach: the furthest fibre from the stiffness centroid, up (y) and across (x)
 */
export function printedSection(p, o = {}) {
  const what = 'printedSection';
  if (p?.kind !== 'profile') throw new Error(`${what}: give a profile's model (profileModel), not ${shown(p)}`);
  const walls = o.walls ?? PRINTED_DEFAULTS.walls.value, infill = o.infill ?? PRINTED_DEFAULTS.infill.value, line = o.line ?? x1c.rules.line.value;
  if (!(Number.isInteger(walls) && walls >= 1)) throw new Error(`${what}: walls is a whole number of lines, 1 or more (got ${shown(o.walls)})`);
  if (!(isNum(infill) && infill >= 0 && infill <= 1)) throw new Error(`${what}: infill is a share from 0 to 1, 0.4 for 40% (got ${shown(o.infill)})`);
  const { loops } = outline(p), segs = [];
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
  for (const loop of loops) for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; segs.push([a[0], a[1], b[0], b[1]]); xa = Math.min(xa, a[0]); xb = Math.max(xb, a[0]); ya = Math.min(ya, a[1]); yb = Math.max(yb, a[1]); }
  const t = walls * line, k = infill * PRINTED_DEFAULTS.infill_stiffness.value, n = Math.round(Math.sqrt(o.cells ?? 40000)), h = Math.max(xb - xa, yb - ya) / n, cell = h * h;
  const inside = (x, y) => { let c = false; for (const [x1, y1, x2, y2] of segs) if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) c = !c; return c; };
  const dist = (x, y) => { let d = Infinity; for (const [x1, y1, x2, y2] of segs) { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, s = l ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l)) : 0, ex = x - x1 - s * dx, ey = y - y1 - s * dy; d = Math.min(d, ex * ex + ey * ey); } return Math.sqrt(d); };
  let shell = 0, inner = 0, A = 0, Sx = 0, Sy = 0, A1 = 0, S1x = 0, S1y = 0;
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = xa + (i + 0.5) * h, y = ya + (j + 0.5) * h;
    if (x > xb || y > yb || !inside(x, y)) continue;
    const f = Math.max(0, Math.min(1, (t - dist(x, y)) / h + 0.5)), w = f + (1 - f) * k; // (a cell the shell's inner edge crosses counts in part, so the walls are as thick as drawn, not to the nearest cell)
    shell += f * cell; inner += (1 - f) * cell;
    A += w * cell; Sx += w * cell * x; Sy += w * cell * y; A1 += cell; S1x += cell * x; S1y += cell * y; pts.push(x, y, w);
  }
  const cx = Sx / A, cy = Sy / A, c1x = S1x / A1, c1y = S1y / A1;
  let Ix = 0, Iy = 0, I1x = 0, I1y = 0;
  for (let q = 0; q < pts.length; q += 3) { const x = pts[q], y = pts[q + 1], w = pts[q + 2]; Ix += w * cell * ((y - cy) ** 2 + h * h / 12); Iy += w * cell * ((x - cx) ** 2 + h * h / 12); I1x += cell * ((y - c1y) ** 2 + h * h / 12); I1y += cell * ((x - c1x) ** 2 + h * h / 12); }
  const reach = [Math.max(yb - cy, cy - ya), Math.max(xb - cx, cx - xa)];
  return { area: r3(A), shell: r3(shell), inner: r3(inner), plastic: r3(shell + infill * inner), centroid: [r3(cx), r3(cy)], inertiaX: r3(Ix), inertiaY: r3(Iy), solid: { area: r3(A1), inertiaX: r3(I1x), inertiaY: r3(I1y) },
    modulusX: r3(Ix / reach[0]), modulusY: r3(Iy / reach[1]), reach: [r3(reach[0]), r3(reach[1])], walls, infill, thickness: r3(t) };
}

const POSES = ['lying', 'standing'], END_FIX = ['insert', 'nut'], PRINT_KEYS = ['pose', 'walls', 'infill', 'printer', 'end', 'pull'];
/**
 * A beam's `printed` option held to its shape: true, or { pose, walls, infill, printer, end, pull }.
 * @param {string} what @param {any} x
 * @returns {{ pose: 'lying' | 'standing', walls: number, infill: number, printer: any, end: 'insert' | 'nut', pull: number }}
 */
export function printOptions(what, x) {
  if (x === true) x = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`${what}: printed is true, or { pose, walls, infill, printer, end, pull } (got ${shown(x)})`);
  for (const k of Object.keys(x)) if (!PRINT_KEYS.includes(k)) throw new Error(`${what}: printed has no "${k}": it takes ${PRINT_KEYS.join(', ')}`);
  const pose = x.pose ?? 'lying', end = x.end ?? 'insert';
  if (!POSES.includes(pose)) throw new Error(`${what}: printed.pose is lying (on its bottom face, layers along the beam) or standing (on end a, its section the layer) (got ${shown(x.pose)})`);
  if (!END_FIX.includes(end)) throw new Error(`${what}: printed.end is what a tapped end becomes in print: insert (a heat-set insert) or nut (a captive nut) (got ${shown(x.end)})`);
  const walls = x.walls ?? PRINTED_DEFAULTS.walls.value, infill = x.infill ?? PRINTED_DEFAULTS.infill.value, pull = x.pull ?? PRINTED_DEFAULTS.pull.value;
  if (!(Number.isInteger(walls) && walls >= 1)) throw new Error(`${what}: printed.walls is a whole number of lines, 1 or more (got ${shown(x.walls)})`);
  if (!(isNum(infill) && infill >= 0 && infill <= 1)) throw new Error(`${what}: printed.infill is a share from 0 to 1, 0.4 for 40% (got ${shown(x.infill)})`);
  if (!(isNum(pull) && pull > 0)) throw new Error(`${what}: printed.pull is a slot nut's design pull in N, above 0 (got ${shown(x.pull)})`);
  printerFigures(what, x.printer);
  return { pose, walls, infill, printer: x.printer ?? null, end, pull };
}

// the widest nut made for a slot's family, for its hold: the family's own nuts, any kind
const widestNut = (slot) => Object.values(SETS).filter((s) => s.part === 'slot_nut' && familyOf(v(s, 'slot')) === slot.nutFamily && v(s, 'width') <= slot.cavityWidth + 1e-9).sort((a, b) => v(b, 'width') - v(a, 'width') || v(a, 'length') - v(b, 'length'))[0] ?? null;

/**
 * What printing makes of a beam, as beamModel adds it: the pose and what it rests on, the plastic's figures for that
 * pose, the section's figures from its walls and infill, its mass, the moment it is designed to carry, each slot's hold,
 * its ends' inserts or captive nuts, and findings (beam.printable, beam.mass, beam.slot, beam.end) in the kit's one
 * shape. Changes b in place: bought false, printed set, mass, weight, figures and material those of the print.
 * @param {object} b a beam's model, as beamModel makes it before this @param {ReturnType<typeof printOptions>} pr
 * @param {{ a: 'cut' | 'insert' | 'nut', b: 'cut' | 'insert' | 'nut' }} ends
 */
export function printedOf(b, pr, ends) {
  const p = b.profile, L = b.length, P = printerFigures('beamModel', pr.printer), mat = p.material, out = [];
  if (!mat?.figures?.strength || !mat.density) throw new Error(`beamModel: a printed beam is of a plastic with a strength and a density, and ${p.name} is of ${mat?.name ?? 'no material'}: give { material: 'pla' }`);
  const fig = (k) => (isNum(mat.figures[k]?.value) ? mat.figures[k].value : null), bed = P.n('bed'), overhang = P.n('overhang'), bridge = P.n('bridge'), line = P.n('line');
  const lying = pr.pose === 'lying', S = lying ? fig('strength') : fig('strength_z') ?? r3(fig('strength') * PRINTED_DEFAULTS.across.value), E = lying ? fig('modulus') : fig('modulus_z') ?? fig('modulus');
  const sAlong = fig('strength'), sAcross = fig('strength_z') ?? r3(sAlong * PRINTED_DEFAULTS.across.value);
  const sKind = lying || fig('strength_z') != null ? mat.figures.strength.kind : 'estimate', said = `${b.name}, printed ${lying ? 'lying down' : 'standing up'}`;
  // ---- can it print so ----
  const why = [];
  if (lying) {
    if (L > bed + 1e-9) why.push([`${mm(L)} mm long, and ${P.name}'s bed is ${mm(bed)} mm: splice it in two (splice()), or stand it up if it is no taller than the printer`, 'bed']);
    if (Math.max(p.width, p.height) > bed + 1e-9) why.push([`its section is larger than the bed`, 'bed']);
    for (const face of ['front', 'back']) for (const q of p.faces[face]) if (q.slot) why.push([`a slot in its ${face} face hangs its upper lip in mid-air lying down: stand it up, or print a profile with that face closed (the kit's printed ones: profile-1515-printed to profile-4040-printed)`, `slot_${face}`]);
    for (const q of p.faces.top) if (q.slot) { const s = p.slots[q.slot], ledge = (s.cavityWidth - s.mouth) / 2; if (s.lipAngle < 90 - overhang - 0.5 && ledge > line) why.push([`its top slot (${s.name}) has lips whose undersides lean ${s.lipAngle}° from the face: lying down they hang ${mm(ledge)} mm out over the cavity, past ${P.name}'s ${overhang}° overhang. Its printable profiles slope them at ${90 - overhang}°`, 'lip_angle']); }
    for (const q of p.faces.bottom) if (q.slot) { const s = p.slots[q.slot]; if (s.floorWidth > bridge + 1e-9 || (s.floorWidth < s.cavityWidth && s.flankAngle < 90 - overhang - 0.5) || s.floorWidth >= s.cavityWidth - 1e-9 && s.cavityWidth > bridge) why.push([`its bottom slot (${s.name}) lies on the bed with its floor above it, ${mm(Math.min(s.floorWidth, s.cavityWidth))} mm wide with flanks at ${s.flankAngle}°: a floor wider than the ${mm(bridge)} mm ${P.name} bridges, or flanks flatter than ${90 - overhang}°, needs support`, 'floor_width']); }
    for (const x of [...p.bores.map((q) => q.diameter), ...p.hollows.map((q) => q.width), ...p.chambers.map((q) => q.width)]) if (x > bridge + 1e-9) why.push([`a hollow ${mm(x)} mm across runs its length: lying down its roof is a bridge wider than ${P.name}'s ${mm(bridge)} mm`, 'bore_diameter']);
  } else if (L > bed + 1e-9) why.push([`${mm(L)} mm long, and ${P.name} prints ${mm(bed)} mm high: lie it down (a printable profile), or splice it`, 'bed']);
  if (why.length) for (const [w, r] of why) out.push(finding('fail', `${said}: ${w}`, 'beam.printable', { rule: r, refs: { profile: p.name, pose: pr.pose } }));
  else out.push(finding('pass', lying ? `${said} on its bottom face: its layers run along it, ${p.faces.top.some((q) => q.slot) ? 'its slot faces up with its lips sloped at the printer\'s overhang angle, ' : ''}no supports (printcheck reads the solid printedBeam draws)` : `${said} on end a: its section is the layer, exact, so it prints with no supports; it bends across its layers, where the plastic is weakest`, 'beam.printable', { values: { pose: pr.pose, length: L, bed }, refs: { profile: p.name, printer: P.name } }));
  // ---- what it is worth: the section from its walls and infill, the plastic for its pose ----
  const sec = printedSection(p, { walls: pr.walls, infill: pr.infill, line }), grams = r3((sec.plastic * L * mat.density) / 1000);
  const est = (value, unit, text) => ({ value, unit, kind: 'estimate', source: `${text}: printedSection of ${p.name} at ${pr.walls} walls of ${line} mm and ${Math.round(pr.infill * 100)}% infill (PRINTED_DEFAULTS.infill_stiffness ${PRINTED_DEFAULTS.infill_stiffness.value})`, from: 'outline' });
  const solid = section(p, { torsion: true }), share = sec.inertiaX / sec.solid.inertiaX;
  const figures = { area: est(sec.area, 'mm²', 'the shell and the infill at its share'), inertiaX: est(sec.inertiaX, 'mm⁴', 'the shell and the infill at its share'), inertiaY: est(sec.inertiaY, 'mm⁴', 'the shell and the infill at its share'),
    modulusX: est(sec.modulusX, 'mm³', 'the second moment over the furthest fibre'), modulusY: est(sec.modulusY, 'mm³', 'the second moment over the furthest fibre'),
    torsion: est(r3(solid.torsion * share), 'mm⁴', `the solid section's torsion constant (${mm(solid.torsion)}) times the share its second moment keeps (${share.toFixed(3)})`),
    massPerMetre: est(r3((sec.plastic * mat.density) / 1000), 'kg/m', `the plastic laid times ${mat.name}'s density ${mat.density} g/cm³`) };
  const design = r3(((S / PRINTED_DEFAULTS.margin.value) * sec.inertiaX) / sec.reach[0]);
  out.push(finding('info', `${said}: ${mm(grams)} g of ${mat.name} (${mm(sec.plastic)} mm² of plastic laid: ${mm(sec.shell)} mm² of ${pr.walls} walls, ${mm(sec.inner)} mm² inside at ${Math.round(pr.infill * 100)}% infill); it bends like ${mm(sec.inertiaX)} mm⁴ of solid plastic (${Math.round(share * 100)}% of the solid section's) at ${E} MPa ${lying ? 'along' : 'across'} its layers. All estimates until a printed coupon is measured`, 'beam.mass', { values: { grams, plastic: sec.plastic, shell: sec.shell, inner: sec.inner, inertia: sec.inertiaX, modulus: E }, refs: { material: mat.name, kind: 'estimate' } }));
  out.push(finding('info', `${said}: it is designed to carry ${mm(design / 1000)} N·m bending it up and down: ${S} MPa ${lying ? 'along' : 'across'} its layers${sKind === 'estimate' ? ` (${PRINTED_DEFAULTS.across.value} of its strength along them, an estimate)` : ''}, over ${PRINTED_DEFAULTS.margin.value} times the margin, times its second moment over ${mm(sec.reach[0])} mm to its furthest fibre`, 'beam.strength', { values: { moment: design, strength: S, margin: PRINTED_DEFAULTS.margin.value }, refs: { kind: sKind } }));
  // ---- each slot's hold in plastic ----
  const slots = [];
  for (const face of ['top', 'bottom', 'front', 'back']) for (const q of p.faces[face]) if (q.slot) {
    const s = p.slots[q.slot], nut = widestNut(s), wall = (face === 'top' || face === 'bottom' ? p.width : p.height) / (face === 'top' || face === 'bottom' ? p.cells[0] : p.cells[1]) / 2 - s.cavityWidth / 2;
    if (!nut) { out.push(finding('info', `${said}: no nut set of ${s.nutFamily} fits its ${face} slot, so its hold is not worked out`, 'beam.slot', { refs: { face, slot: s.name } })); continue; }
    // a plate bends with its stress running from its root out across it: lying down, a top or bottom slot's lips lie in
    // the layers (along them) and its walls stand through them (across); a side slot's the other way round; standing up, all across
    const st = lipStress(s, wall, { width: v(nut, 'width'), length: v(nut, 'length') }, pr.pull, PRINTED_DEFAULTS.spread.value), flat = face === 'top' || face === 'bottom';
    const sLip = lying && flat ? sAlong : sAcross, sWall = lying && !flat ? sAlong : sAcross, h = slotHold(st, pr.pull, sLip, sWall), { hold, margin } = h;
    slots.push({ face, slot: s.name, nut: nut.name, hold, margin, governs: h.governs });
    out.push(finding(margin >= PRINTED_DEFAULTS.margin.value - 1e-9 ? 'pass' : 'warn', `${said}: its ${face} slot's lips and walls hold ${mm(hold)} N on ${nut.name} (${mm(margin)} times a ${pr.pull} N pull${margin < PRINTED_DEFAULTS.margin.value ? `, under the ${PRINTED_DEFAULTS.margin.value} times a printed part is sized for` : ''}), the ${h.governs === 'wall' ? 'walls' : 'lips'} the weaker: the lips bend at their roots${s.lipAngle > 0 ? ', and the nut\'s corners push the side walls apart on the sloped lips' : ''}. An estimate, from ${sLip} MPa in the lips and ${sWall} MPa in the walls (${lying ? `the plastic's strength ${flat ? 'along its layers in the lips, across them in the walls' : 'across its layers in the lips, along them in the walls'}` : 'across its layers, standing up'}) and the pull spread one lip's thickness beyond the nut`, 'beam.slot', { values: { hold, margin, pull: pr.pull, stress: r3(st.stress), lip: sLip, wall: sWall }, refs: { face, slot: s.name, nut: nut.name, governs: h.governs, kind: 'estimate' } }));
  }
  // ---- the ends: an insert or a captive nut in place of a tap ----
  const endFix = {};
  for (const e of ['a', 'b']) {
    if (ends[e] === 'cut') continue;
    const thread = p.end?.thread;
    if (!thread) { out.push(finding('fail', `${said}: end ${e} is to take a screw, and ${p.name} names no end_thread or end_at for a printed end: give the profile them, or join the end another way (a bracket)`, 'beam.end', { rule: 'end_thread', refs: { end: e } })); continue; }
    const f = fixingModel(thread).figures, at = p.end.at, room = roomAt(p, at);
    if (ends[e] === 'insert') {
      const need = f.insert_hole.value / 2 + f.insert_wall.value;
      endFix[e] = { kind: 'insert', thread, at, depth: f.insert_depth.value, hole: f.insert_hole.value, wall: f.insert_wall.value };
      out.push(finding(room >= need - 1e-9 ? 'pass' : 'fail', `${said}: end ${e} takes ${thread} in a heat-set insert (a ${mm(f.insert_hole.value)} mm hole ${mm(f.insert_depth.value)} mm deep) in place of a tap: ${mm(room)} mm of plastic round its middle, ${room >= need - 1e-9 ? 'room for' : 'short of'} the hole and its ${mm(f.insert_wall.value)} mm wall (${thread.toLowerCase()}.insert_wall)`, 'beam.end', { values: { room, need }, refs: { end: e, thread, fixing: 'insert' } }));
    } else {
      const flats = f.nut_flats.value, corner = flats / COS30, need = corner / 2 + line, wallE = r3(Math.max(PRINTED_DEFAULTS.end_wall.value * fixingModel(thread).major, 2 * line));
      endFix[e] = { kind: 'nut', thread, at, wall: wallE, flats, height: f.nut_height.value };
      out.push(finding(room >= need - 1e-9 ? 'pass' : 'fail', `${said}: end ${e} takes ${thread} in a captive nut slid in from its front face, ${mm(wallE)} mm in from the end, in place of a tap: ${mm(room)} mm of plastic round the screw's line, ${room >= need - 1e-9 ? 'room for' : 'short of'} the nut's corners and a line`, 'beam.end', { values: { room, need, wall: wallE }, refs: { end: e, thread, fixing: 'nut' } }));
    }
  }
  b.bought = false;
  b.printed = { pose: pr.pose, walls: pr.walls, infill: pr.infill, printer: P.name, bed, grams, section: sec, modulus: E, strength: S, strengthKind: sKind, design, slots, ends: endFix, pull: pr.pull };
  b.mass = grams; b.weight = { computed: grams, sheet: null, difference: null }; b.figures = figures;
  b.material = { name: mat.name, density: mat.density, modulus: E, given: b.material?.given ?? false };
  b.title = `${b.title}, printed ${lying ? 'lying down' : 'standing up'}`;
  b.findings = [...b.findings.filter((x) => !['beam.mass', 'beam.length'].includes(x.code)), ...out];
  b.rests = [...b.rests, { value: pr.walls, unit: 'lines', kind: 'default', source: 'PRINTED_DEFAULTS.walls or the beam\'s own' }, { value: pr.infill, kind: 'default', source: 'PRINTED_DEFAULTS.infill or the beam\'s own' }, { value: PRINTED_DEFAULTS.infill_stiffness.value, kind: 'estimate', source: PRINTED_DEFAULTS.infill_stiffness.source }];
  return b;
}

// How far a point of the section is from the nearest edge of its outline (its outside, its slots): the room round an end's fixing
function roomAt(p, at) {
  let d = Infinity;
  for (const loop of outline(p).loops) for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length], dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, s = l ? Math.max(0, Math.min(1, ((at[0] - x1) * dx + (at[1] - y1) * dy) / l)) : 0;
    d = Math.min(d, Math.hypot(at[0] - x1 - s * dx, at[1] - y1 - s * dy));
  }
  return r3(d);
}

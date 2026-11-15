// Slot nuts: the bought nuts a slot takes (each a rule set in @rulecad/rules: slide-in, drop-in, roll-in, hammer,
// square, T-bolt), held to the slot they go in, weighed and drawn; the nut for a profile's face and a thread; and a
// printed carrier that holds a hex nut or a heat-set insert and slides in the slot, drawn from the slot's own rules with
// the printer's fit.
//
// A slot's frame here: x along the slot, y across it, z out of the face, the face at z = 0 and the slot's middle on
// y = 0. A bought nut is drawn pulled up against the lips, as it sits once its screw is tight. A carrier is drawn
// clear of the slot all round by the printer's fit; laid on the bed it prints floor down. Units: mm, grams, newtons.
import jscad from '@jscad/modeling';
import { nutTrapModel, nutTrap, holeModel, hole, DEFAULTS as FIX } from '@rulecad/fixings';
import x1c from '@rulecad/rules/x1c.json' with { type: 'json' };
import pla from '@rulecad/rules/pla.json' with { type: 'json' };
import petg from '@rulecad/rules/petg.json' with { type: 'json' };
import { SETS, FIELDS } from './catalogue.mjs';
import { profileModel, slotModel, slotPath, slotNuts } from './profile.mjs';

const { cuboid, cylinder, polygon } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { subtract, union } = jscad.booleans;
const { translate, transform } = jscad.transforms, { measureVolume } = jscad.measurements;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const KINDS = FIELDS.nut_kind.choice, TURNED = ['drop-in', 'hammer', 't-bolt'];
const COS30 = Math.cos(Math.PI / 6);

/**
 * The rules this module adds, each with what it comes from.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string, source: string }>}
 */
export const CARRIER_DEFAULTS = {
  floor: { value: 3, unit: 'layers', rule: 'A carrier keeps this many whole layers under its nut, so its first layer is one solid piece and the nut\'s slot does not open on to the bed', kind: 'default', source: 'The kit\'s standard for printed parts: a simple solid first layer', checked: '2026-11-15' },
  wall: { value: 1, unit: 'lines', rule: 'The least plastic left beside a nut\'s corners, across the slot, where the carrier narrows toward the slot\'s floor', kind: 'estimate', source: 'A working margin of this module: the nut is closed in by the slot\'s walls once in, so one line only keeps it off them', checked: '2026-11-15' },
  roof: { value: 2, unit: 'lines', rule: 'The least plastic over a nut\'s slot, up to the carrier\'s top: what the nut pulls against', kind: 'estimate', source: 'A working margin of this module, to be checked by test (Frames 2.13)', checked: '2026-11-15' },
  end: { value: 2, unit: 'mm', rule: 'Plastic at each end of a carrier beyond its nut, along the slot', kind: 'estimate', source: 'A working margin of this module', checked: '2026-11-15' },
  margin: { value: 2, unit: '× load', rule: 'A printed carrier is sized to hold about twice the load it is given', kind: 'default', source: 'The kit\'s standard for printed parts: sized from the load with about twice the margin', checked: '2026-11-15' },
};

// ---------- a bought nut ----------
const find = (given) => (name) => given?.sets?.[name] ?? given?.load?.(name) ?? SETS[name];
const nutSets = (given) => { const own = Object.values(given?.sets ?? {}).filter((s) => s?.part === 'slot_nut'); return [...own, ...slotNuts().map((n) => SETS[n]).filter((s) => !own.some((o) => o.name === s.name))]; };
const squash = (t) => String(t).toUpperCase().replace(/\s+/g, '');
const threadSet = (t, given) => { const k = String(t).toLowerCase().replace(/\./g, '_').replace(/[^a-z0-9_]/g, ''); const s = find(given)(k); return s?.part === 'thread' ? s : Object.values(SETS).find((x) => x.part === 'thread' && squash(x.rules.thread?.value) === squash(t)) ?? null; };

/**
 * @typedef {{ value: any, unit?: string, kind: string, source: string, rule?: string, checked?: string }} Figure
 * @typedef {{ kind: 'slot-nut', name: string, title: string, slot: string, thread: string, major: number | null, nutKind: string, entry: string,
 *   length: number, width: number, height: number, tongueWidth: number | null, tongueHeight: number, boltLength: number | null,
 *   hold: Figure | null, torque: Figure | null, material: string, density: Figure, volume: number, mass: number,
 *   figures: Record<string, Figure>, bought: true, printed: false, findings: object[] }} SlotNut
 *   volume (mm³) and mass (g) are worked out from the drawn block (body, tongue, less the thread's hole; a T-bolt's shank added)
 */

/**
 * A bought slot nut by name, from its rule set, or from one of your own in the same names.
 * @param {string | { name?: string, part?: string, rules: object }} which 'slot-nut-6-misumi-m5-slide-in', or a rule set with "part": "slot_nut"
 * @param {Record<string, any>} [change] a different or measured figure, by its rule's name
 * @param {{ sets?: object, load?: Function }} [given] rule sets of your own by name (a slot, a thread)
 * @returns {SlotNut}
 */
export function slotNutModel(which, change = {}, given = {}) {
  const what = 'slotNutModel', set = typeof which === 'string' ? find(given)(which) : which;
  if (typeof which === 'string' && !set) throw new Error(`${what}: no slot nut "${which}". There are ${slotNuts().length}, named slot-nut-<opening>[-<maker>]-<thread>-<kind> (${slotNuts().slice(0, 3).join(', ')}, ...); nutFor(profile, face, thread) finds the one for a slot`);
  if (!set || typeof set !== 'object' || !set.rules) throw new Error(`${what}: give a slot nut's name or a rule set, not ${shown(which)}`);
  if (set.part && set.part !== 'slot_nut') throw new Error(`${what}: ${set.name} is a ${set.part}, not a slot nut`);
  if (change == null || typeof change !== 'object' || Array.isArray(change)) throw new Error(`${what}: change is figures by their rules' names ({ height: 3.4 }), not ${shown(change)}`);
  const name = set.name ?? 'slot nut', figures = Object.fromEntries(Object.entries(set.rules).map(([k, r]) => [k, { ...r }]));
  for (const [k, c] of Object.entries(change)) {
    if (!figures[k] && !FIELDS[k]) throw new Error(`${what}: ${name} has no figure "${k}": a slot nut's are ${Object.keys(set.rules).join(', ')}`);
    figures[k] = { ...(figures[k] ?? {}), value: c, kind: 'given', source: `given to ${what}` };
  }
  const v = (k) => figures[k]?.value;
  for (const k of ['slot', 'thread', 'nut_kind', 'nut_entry']) if (typeof v(k) !== 'string' || !v(k)) throw new Error(`${what}: ${name}: ${k} is a word (got ${shown(v(k))})`);
  const pos = (k) => { const x = v(k); if (!(isNum(x) && x > 0)) throw new Error(`${what}: ${name}: ${k} is a number above 0, in mm (got ${shown(x)})`); return x; };
  const opt = (k) => { const x = v(k); if (x == null) return null; if (!(isNum(x) && x >= 0)) throw new Error(`${what}: ${name}: ${k} is a number of 0 or more (got ${shown(x)})`); return x; };
  const nutKind = v('nut_kind');
  if (!KINDS.includes(nutKind)) throw new Error(`${what}: ${name}: nut_kind is ${KINDS.join(', ')} (got ${shown(nutKind)})`);
  const length = pos('length'), width = pos('width'), height = pos('height'), tongueWidth = opt('tongue_width'), tongueHeight = opt('tongue_height') ?? 0, boltLength = opt('bolt_length');
  if (nutKind === 't-bolt' && !boltLength) throw new Error(`${what}: ${name}: a T-bolt needs its bolt_length (20 for an M6x20)`);
  const ts = threadSet(v('thread'), given), major = ts?.rules.major_diameter?.value ?? null, material = String(v('material') ?? 'steel');
  const density = /stainless|a2|a4|sus3/i.test(material) ? FIX.stainless_density : FIX.steel_density;
  // the block as drawn: body, tongue (as wide as the nut's tongue, or 0.2 under the slot's opening where the sheet gives none), less the thread's hole
  const slot = find(given)(v('slot')), opening = slot?.part === 'slot' ? slot.rules.opening?.value : null, tw = tongueWidth ?? (tongueHeight && opening ? r3(opening - 0.2) : 0);
  const bore = nutKind === 't-bolt' || !major ? 0 : (Math.PI * major * major) / 4;
  const volume = r3(width * length * height + tw * length * tongueHeight - bore * (height + tongueHeight) + (nutKind === 't-bolt' && major ? (Math.PI * major * major * Math.max(0, boltLength - (tw ? tongueHeight : 0))) / 4 : 0));
  const mass = r3((volume * density.value) / 1000), hold = figures.hold ?? null, out = [];
  out.push(finding('info', `${name} weighs ${mm(mass)} g: its drawn block, ${mm(volume)} mm³, at ${density.value} g/cm³ (${material})`, 'slot_nut.mass', { values: { mass, volume, density: density.value } }));
  if (hold) out.push(finding('info', `it holds ${hold.value} N straight out of the slot: ${hold.kind === 'spec' ? 'the maker\'s figure' : `an estimate (${hold.rule})`}`, 'slot_nut.hold', { values: { hold: hold.value }, refs: { kind: hold.kind } }));
  const title = `${v('thread')} ${nutKind}${nutKind === 't-bolt' ? ` x ${boltLength}` : ' nut'} for ${v('slot')}`;
  return { kind: 'slot-nut', name, title, slot: v('slot'), thread: v('thread'), major, nutKind, entry: v('nut_entry'), length, width, height, tongueWidth: tw || null, tongueHeight, boltLength,
    hold, torque: figures.tightening_torque ?? null, material, density, volume, mass, figures, bought: true, printed: false, findings: out };
}

/**
 * How a bought nut sits in a slot, as findings: does it go in, does it hold, does its tongue stand proud. fail where
 * it cannot be fitted at all.
 * @param {SlotNut | string} nut @param {import('./profile.mjs').Slot | string} slot @param {{ sets?: object, load?: Function }} [given]
 * @returns {object[]} findings, code slot_nut.fit or slot_nut.entry
 */
export function nutFit(nut, slot, given = {}) {
  const n = typeof nut === 'string' || !nut?.kind ? slotNutModel(nut, {}, given) : nut, s = typeof slot === 'string' ? slotModel(slot, {}, given) : slot;
  if (n?.kind !== 'slot-nut') throw new Error(`nutFit: give a slot nut (slotNutModel), not ${shown(nut)}`);
  if (s?.kind !== 'slot') throw new Error(`nutFit: give a slot (slotModel), not ${shown(slot)}`);
  const out = [], room = r3(s.cavityDepth - s.lip), turned = TURNED.includes(n.nutKind);
  if (turned ? n.width > s.cavityWidth + 1e-9 : !(n.width < s.cavityWidth)) out.push(finding('fail', `it is ${n.width} mm across, and ${s.name} is ${s.cavityWidth} mm wide under its lips: it does not go in`, 'slot_nut.fit', { rule: 'width', values: { width: n.width, cavity_width: s.cavityWidth } }));
  if (!(n.width > s.opening)) out.push(finding('fail', `it is ${n.width} mm across and ${n.length} long, and ${s.name} opens ${s.opening} mm: it pulls straight out`, 'slot_nut.fit', { rule: 'width', values: { width: n.width, opening: s.opening } }));
  if (!(n.height <= room + 1e-9)) out.push(finding('fail', `it is ${n.height} mm tall, and ${s.name} has ${room} mm under its lips: it does not go in`, 'slot_nut.fit', { rule: 'height', values: { height: n.height, room } }));
  if (n.tongueWidth && n.tongueWidth > s.opening + 1e-9) out.push(finding('fail', `its tongue is ${n.tongueWidth} mm wide, and ${s.name} opens ${s.opening} mm: the tongue does not go up into it`, 'slot_nut.fit', { rule: 'tongue_width', values: { tongue_width: n.tongueWidth, opening: s.opening } }));
  else if (n.tongueWidth && n.tongueWidth > s.opening - 1e-9) out.push(finding('warn', `its tongue is ${n.tongueWidth} mm wide, as wide as ${s.name}'s opening: the figures leave it no play, so one of them is rounded (measure it)`, 'slot_nut.fit', { rule: 'tongue_width', values: { tongue_width: n.tongueWidth, opening: s.opening } }));
  if (n.tongueHeight > s.lip + 1e-9) out.push(finding('warn', `its tongue stands ${mm(n.tongueHeight - s.lip)} mm proud of the face (${n.tongueHeight} mm against ${s.name}'s ${s.lip} mm lip): what it clamps must clear it`, 'slot_nut.fit', { rule: 'tongue_height', values: { tongue_height: n.tongueHeight, lip: s.lip } }));
  if (n.entry === 'anywhere' && turned && n.length > s.opening + 1e-9) out.push(finding('warn', `it is ${n.length} mm long and ${s.name} opens ${s.opening} mm: it goes in tilted, not straight down`, 'slot_nut.entry', { rule: 'length', values: { length: n.length, opening: s.opening } }));
  return out;
}

/**
 * A bought nut's reference solid in the slot's frame (x along, y across, z out of the face, the face at z = 0): its
 * body pulled up under the lips, its tongue in the opening, the thread's hole through it; a T-bolt's shank standing out.
 * @param {SlotNut | string} nut @param {{ at?: number[], display?: 'preview' | 'link', given?: object }} [o]
 *   at: where its middle goes on the face (default the origin); display: link draws the body alone
 * @returns {object} a JSCAD geom3, with .model
 */
export function slotNut(nut, o = {}) {
  const n = typeof nut === 'string' || !nut?.kind ? slotNutModel(nut, {}, o.given) : nut, at = o.at ?? [0, 0, 0], display = o.display ?? 'preview';
  if (!['preview', 'link'].includes(display)) throw new Error(`slotNut: display is preview or link (got ${shown(o.display)})`);
  const slot = find(o.given)(n.slot), lip = slot?.part === 'slot' ? slot.rules.lip_thickness.value : n.tongueHeight;
  const body = translate([0, 0, -lip - n.height / 2], cuboid({ size: [n.length, n.width, n.height] }));
  if (display === 'link') return Object.assign(translate(at, body), { model: n });
  let solid = n.tongueHeight && n.tongueWidth ? union(body, translate([0, 0, -lip + n.tongueHeight / 2], cuboid({ size: [n.length, n.tongueWidth, n.tongueHeight] }))) : body;
  if (n.major && n.nutKind === 't-bolt') solid = union(solid, translate([0, 0, -lip + n.boltLength / 2], cylinder({ radius: n.major / 2, height: n.boltLength, segments: 24 })));
  else if (n.major) solid = subtract(solid, translate([0, 0, -lip], cylinder({ radius: n.major / 2, height: 2 * (n.height + n.tongueHeight) + 2, segments: 24 })));
  return Object.assign(translate(at, solid), { model: n });
}

// ---------- the nut for a face ----------
const placeOf = (what, p, face) => {
  const m = /^(top|bottom|front|back)(?:\.(\d+))?$/.exec(String(face ?? ''));
  if (!m) throw new Error(`${what}: face is top, bottom, front or back, with .2 for its second slot (got ${shown(face)})`);
  const places = p.faces[m[1]], i = m[2] ? +m[2] : 1;
  if (!places?.length || i < 1 || i > places.length) throw new Error(`${what}: ${p.name}'s ${m[1]} face has ${places?.length ?? 0} slot${places?.length === 1 ? '' : 's'} (got ${shown(face)})`);
  const place = places[i - 1];
  if (!place.slot) throw new Error(`${what}: ${p.name}'s ${face} face is closed: there is no slot there to take a nut`);
  return { place, slot: p.slots[place.slot], address: `${m[1]}${places.length > 1 ? `.${i}` : ''}` };
};
const familyOf = (given, name) => { const s = find(given)(name); return s?.part === 'slot' ? String(s.rules.nut_family?.value ?? name) : name; };
const said = (models) => models.map((n) => `${n.thread} ${n.nutKind} (${n.name})`).join(', ');

/**
 * The bought nut for a thread in a profile's face: one its maker makes for that slot's nut family, that fits it, of the
 * kind asked (any kind where none is asked), the strongest first. Refused by name where there is none, naming the
 * nuts made for that slot (and, where none of its family's would do, other makers' nuts that fit it by their sizes).
 * @param {string | import('./profile.mjs').Profile} profile a profile's name or model
 * @param {string} face 'top', 'front.2'
 * @param {string} thread 'M5'
 * @param {{ kind?: string, given?: { sets?: object, load?: Function } }} [o]
 * @returns {SlotNut & { face: string, profile: string, fits: object[], others: string[] }} others: the names of other nuts that would also do
 */
export function nutFor(profile, face, thread, o = {}) {
  const what = 'nutFor', given = o.given ?? {};
  if (o == null || typeof o !== 'object') throw new Error(`${what}: options are { kind, given }, not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!['kind', 'given'].includes(k)) throw new Error(`${what}: no option "${k}": it takes kind (${KINDS.join(', ')}) and given`);
  if (o.kind != null && !KINDS.includes(o.kind)) throw new Error(`${what}: kind is ${KINDS.join(', ')} (got ${shown(o.kind)})`);
  if (typeof thread !== 'string' || !threadSet(thread, given)) throw new Error(`${what}: thread is a thread as written, M3 to M8 for slot nuts (got ${shown(thread)})`);
  const p = profile?.kind === 'profile' ? profile : profileModel(profile, {}, given), { slot, address } = placeOf(what, p, face), family = slot.nutFamily;
  const made = nutSets(given).filter((s) => familyOf(given, s.rules.slot?.value) === family).map((s) => slotNutModel(s, {}, given));
  const fitting = (n) => !nutFit(n, slot, given).some((f) => f.level === 'fail');
  const want = (n) => squash(n.thread) === squash(thread) && (!o.kind || n.nutKind === o.kind);
  const fits = made.filter((n) => want(n) && fitting(n)).sort((a, b) => (b.slot === slot.name) - (a.slot === slot.name) || (b.hold?.value ?? 0) - (a.hold?.value ?? 0) || a.name.localeCompare(b.name));
  const where = `${p.name}'s ${address} face (${slot.name}, nut family ${family})`, asked = `${thread}${o.kind ? ` ${o.kind}` : ''} nut`;
  if (!fits.length) {
    const others = nutSets(given).filter((s) => familyOf(given, s.rules.slot?.value) !== family).map((s) => slotNutModel(s, {}, given)).filter((n) => want(n) && fitting(n));
    let text = `${what}: no ${asked} is made for ${where}. ${made.length ? `Made for it: ${said(made.filter(fitting))}` : 'The kit has no nut sets for that family'}`;
    if (others.length) text += `. Of other families' nuts, these fit its slot by their sizes, though their makers do not promise it: ${said(others)}`;
    throw new Error(`${text}. A rule set of your own (part slot_nut) for a nut in hand goes in given.sets; carrierModel prints one`);
  }
  const best = fits[0];
  return { ...best, face: address, profile: p.name, fits: nutFit(best, slot, given), others: fits.slice(1).map((n) => n.name) };
}

// ---------- a printed carrier ----------
const printerFigure = (pr, k) => { const r = pr.rules?.[k] ?? x1c.rules[k]; const v = isNum(r?.value) ? r.value : k === 'wall_min' ? 2 * x1c.rules.line.value : null; return { value: v, name: `${pr.rules?.[k] ? pr.name : 'x1c'}.${k}`, kind: r?.kind, source: r?.source }; };
const printerOf = (what, p) => {
  if (p == null) return x1c;
  if (typeof p !== 'object' || Array.isArray(p)) throw new Error(`${what}: printer is a rule set ({ name, rules }) or its values ({ fit: 0.2, layer: 0.2 }), not ${shown(p)}`);
  return p.rules ? p : { name: p.name ?? 'the printer', rules: Object.fromEntries(Object.entries(p).filter(([, v]) => isNum(v)).map(([k, v]) => [k, { value: v, kind: 'given', source: 'given as a number' }])) };
};
const MATERIALS = { pla, petg };
const materialOf = (what, m) => {
  const set = typeof m === 'string' ? MATERIALS[m.toLowerCase()] : m?.rules ? m : null;
  if (!set) throw new Error(`${what}: material is pla, petg or a material's rule set with strength and density (got ${shown(m)})`);
  for (const k of ['strength', 'density']) if (!isNum(set.rules[k]?.value)) throw new Error(`${what}: ${set.name} has no ${k}`);
  return set;
};

// The slot's cavity as a closed loop [u across, v down from the face], clockwise as v grows down, and its inward offset
// by c: lines moved in and met where the cavity's corner is convex, a round of radius c about the corner where it is
// re-entrant (a lip's tip), so the carrier stands c clear of every point of the slot and no further
function offsetLoop(loop, c) {
  const n = loop.length, area = loop.reduce((s, p, i) => s + p[0] * loop[(i + 1) % n][1] - loop[(i + 1) % n][0] * p[1], 0) / 2, sgn = area > 0 ? 1 : -1, out = [];
  const normal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [(-dy / l) * sgn, (dx / l) * sgn]; }; // inward
  for (let i = 0; i < n; i++) {
    const p = loop[i], a = loop[(i + n - 1) % n], b = loop[(i + 1) % n], n0 = normal(a, p), n1 = normal(p, b);
    const turn = ((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) * sgn;
    if (turn >= -1e-12) { // convex: the two offset lines meet
      const d = [n0[0] + n1[0], n0[1] + n1[1]], k = c / (1 + n0[0] * n1[0] + n0[1] * n1[1]);
      out.push([p[0] + d[0] * k, p[1] + d[1] * k]);
    } else { // re-entrant: a round about the corner
      const a0 = Math.atan2(n0[1], n0[0]); let a1 = Math.atan2(n1[1], n1[0]), da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 12)));
      const R = c / Math.cos(Math.abs(da) / steps / 2); // (the chords, not the corners, stand c off)
      for (let s = 0; s <= steps; s++) { const t = a0 + (da * s) / steps, r = R; out.push([p[0] + r * Math.cos(t), p[1] + r * Math.sin(t)]); }
    }
  }
  return out;
}
// Where a level v crosses a loop: [least u, most u], or null
function across(loop, v) {
  const us = [];
  for (let i = 0; i < loop.length; i++) { const [a, b] = [loop[i], loop[(i + 1) % loop.length]]; if ((a[1] - v) * (b[1] - v) <= 0 && a[1] !== b[1]) us.push(a[0] + ((v - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); }
  return us.length ? [Math.min(...us), Math.max(...us)] : null;
}
function down(loop, u) { // where a line u crosses a loop: [least v, most v]
  const vs = [];
  for (let i = 0; i < loop.length; i++) { const [a, b] = [loop[i], loop[(i + 1) % loop.length]]; if ((a[0] - u) * (b[0] - u) <= 0 && a[0] !== b[0]) vs.push(a[1] + ((u - a[0]) * (b[1] - a[1])) / (b[0] - a[0])); }
  return vs.length ? [Math.min(...vs), Math.max(...vs)] : null;
}
function segGap(p, q) { // least distance between two closed loops' edges
  const d = (a, b, x) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(a[0] + t * dx - x[0], a[1] + t * dy - x[1]); };
  let least = Infinity;
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) least = Math.min(least, d(q[j], q[(j + 1) % q.length], p[i]), d(p[i], p[(i + 1) % p.length], q[j]));
  return least;
}

/**
 * @typedef {{ kind: 'slot-carrier', name: string, title: string, slot: string, profile: string | null, face: string | null, thread: string, holds: 'nut' | 'insert',
 *   clearance: number, section: number[][], cavity: number[][], length: number, count: number, pitch: number, total: number, at: number[],
 *   levels: { top: number, bottom: number, shoulder: number, nutBottom?: number, nutTop?: number, roofTop?: number, insertTop?: number },
 *   nut: object | null, insert: object | null, screwHole: number, hold: { value: number, punch: number, shoulders: number, shear: number },
 *   load: number | null, margin: number | null, volume: number, grams: number, material: string, printer: string, least: number, rests: object[], findings: object[] }} Carrier
 *   section: the carrier's section in the slot's frame [y across, z out of the face]; cavity: the slot's, the same way;
 *   at: each nut's place along the strip from its start; levels: depths below the face (mm); least: the least gap between carrier and slot
 */

/**
 * A printed carrier for a slot: a block drawn from the slot's own rules, the printer's fit clear of it all round, that
 * holds a hex nut (slid into a slot across it, from the side) or a heat-set insert (pressed in from below) and slides
 * along the slot like a bought slide-in nut. Several at a pitch make a strip. Refused by name where the nut or insert
 * does not fit the slot.
 * @param {string | object} where a slot (name or slotModel) or a profile (name or model) with face
 * @param {{ face?: string, thread: string, holds?: 'nut' | 'insert', length?: number, count?: number, pitch?: number, load?: number,
 *   printer?: object, material?: string | object, given?: object, sets?: object }} o
 *   thread: the screw's; holds: nut (default) or insert; length: of one carrier along the slot (default the nut's or
 *   insert's width and the ends', or longer where a load asks it); count and pitch: a strip; load: the pull on each nut
 *   (N), sized to hold twice it; printer: its rule set or values (default the X1C: its fit is the clearance); material:
 *   pla (default), petg or a rule set; given: profiles and slots of your own; sets: thread sets of your own (fixings)
 * @returns {Carrier}
 */
export function carrierModel(where, o = {}) {
  const what = 'carrierModel', OPTS = ['face', 'thread', 'holds', 'length', 'count', 'pitch', 'load', 'printer', 'material', 'given', 'sets'];
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: options are { ${OPTS.join(', ')} }, not ${shown(o)}`);
  for (const k of Object.keys(o)) if (!OPTS.includes(k)) throw new Error(`${what}: no option "${k}": it takes ${OPTS.join(', ')}`);
  const given = o.given ?? {}, holds = o.holds ?? 'nut';
  if (!['nut', 'insert'].includes(holds)) throw new Error(`${what}: holds is nut or insert (got ${shown(o.holds)})`);
  if (typeof o.thread !== 'string') throw new Error(`${what}: thread is the screw's, as written: { thread: 'M5' }`);
  let slot, profile = null, face = null;
  if (where?.kind === 'slot') slot = where;
  else if (where?.kind === 'profile' || (typeof where === 'string' && (find(given)(where) ?? find(given)(`profile-${where}`))?.part === 'profile') || where?.part === 'profile') {
    const p = where?.kind === 'profile' ? where : profileModel(where, {}, given), pl = placeOf(what, p, o.face ?? 'top');
    slot = pl.slot; profile = p.name; face = pl.address;
  } else slot = slotModel(where, {}, given);
  const pr = printerOf(what, o.printer), mat = materialOf(what, o.material ?? 'pla'), fx = { ...(o.sets ? { sets: o.sets } : {}), printer: pr };
  const F = (k) => printerFigure(pr, k), c = F('fit').value, layer = F('layer').value, line = F('line').value, overhang = F('overhang').value;
  if (!(c >= 0 && layer > 0 && line > 0)) throw new Error(`${what}: the printer's fit, layer and line are numbers above 0 (got ${shown([c, layer, line])})`);
  const count = o.count ?? 1;
  if (!(Number.isInteger(count) && count >= 1)) throw new Error(`${what}: count is a whole number, 1 or more (got ${shown(o.count)})`);
  if (count > 1 && !(isNum(o.pitch) && o.pitch > 0)) throw new Error(`${what}: a strip of ${count} needs a pitch, the distance between its nuts along the slot (mm)`);
  if (o.load != null && !(isNum(o.load) && o.load > 0)) throw new Error(`${what}: load is the pull on each nut in N, above 0 (got ${shown(o.load)})`);
  // the section: the cavity (no groove: the carrier stands over it) offset in by the fit
  const cavity = [...slotPath({ ...slot, grooveWidth: 0, grooveDepth: 0 })], loop = offsetLoop(cavity, c);
  const top = Math.min(...loop.map((p) => p[1])), bottom = Math.max(...loop.map((p) => p[1])), shoulder = r3(slot.lip + c), least = segGap(loop, [...cavity]);
  if (!(least > c - 1e-6) || bottom - top < 2 * layer) throw new Error(`${what}: ${slot.name} is too small for a carrier ${mm(c)} mm clear of it (it comes ${least} mm from the slot)`);
  const half = (v) => { const x = across(loop, v); return x ? Math.min(-x[0], x[1]) : 0; };
  const out = [], rests = [{ name: F('fit').name, value: c, kind: F('fit').kind }, { name: F('layer').name, value: layer }, { name: F('line').name, value: line }];
  const floor = r3(CARRIER_DEFAULTS.floor.value * layer), wall = CARRIER_DEFAULTS.wall.value * line, roofMin = CARRIER_DEFAULTS.roof.value * line;
  const ts = threadSet(o.thread, { sets: { ...(given.sets ?? {}), ...(o.sets ?? {}) } }), tr = ts?.rules;
  if (!tr) throw new Error(`${what}: no thread set for ${shown(o.thread)}`);
  const screwHole = holeModel(o.thread, { kind: 'clearance', ...fx }).diameter, tau = r3(mat.rules.strength.value * FIX.shear_ratio.value);
  let nut = null, insert = null, levels = { top: r3(top), bottom: r3(bottom), shoulder }, width, punch;
  if (holds === 'nut') {
    // from the side, its corners across the slot; or, where the carrier is too narrow for that and it is one carrier,
    // from its end, its flats across the slot. The lowest place for the nut, floor layers above the carrier's bottom,
    // where the carrier is wide enough round it
    const place = (into) => {
      const t = nutTrapModel(o.thread, { axis: 'z', into, depth: 20, ...fx }), corner = r3(t.width / COS30), acrossIt = into === '+y' ? corner : t.width;
      for (let vb = r3(bottom - floor); vb - t.gap - t.rise - roofMin >= top - 1e-9; vb = r3(vb - layer)) if (half(vb) >= acrossIt / 2 + wall - 1e-9 && half(vb - t.gap) >= acrossIt / 2 + wall - 1e-9) return { t, corner, vb, into, along: into === '+y' ? t.width : corner };
      return { t, corner, into };
    };
    let pick = place('+y');
    if (pick.vb == null && count === 1) pick = place('+x');
    const { t, corner, vb } = pick;
    if (vb == null) {
      const widest = Math.max(...[...Array(41)].map((_, i) => half(top + ((bottom - top) * i) / 40)));
      throw new Error(`${what}: ${a(o.thread)} hex nut does not fit a carrier in ${slot.name}: drawn with its slip it is ${mm(t.width)} mm across the flats and ${mm(corner)} across the corners, and ${mm(t.gap)} mm high in its slot${t.rise ? ` under a ${mm(t.rise)} mm roof` : ''}; the carrier is ${mm(bottom - top)} mm deep and at most ${mm(2 * widest)} mm wide, and it needs ${mm(floor)} mm under the nut, ${mm(roofMin)} over it and ${mm(wall)} beside it${count > 1 ? ' (a strip takes its nuts from the side, corners across)' : ''}. A smaller thread, an insert ({ holds: 'insert' }) or a larger slot will do`);
    }
    const nutTop = r3(vb - t.gap), roofTop = r3(nutTop - t.rise);
    levels = { ...levels, nutBottom: vb, nutTop, roofTop };
    nut = { model: t, flats: t.width, corner, gap: t.gap, rise: t.rise, from: pick.into === '+y' ? 'side' : 'end' };
    width = pick.along; punch = r3(tau * 2 * Math.sqrt(3) * tr.nut_flats.value * (roofTop - top));
    out.push(...t.findings.filter((f) => f.code === 'nutTrap.printable'));
  } else {
    const h = holeModel(o.thread, { kind: 'insert', into: '+z', ...fx }), d = h.diameter, depth = h.depth, least = tr.insert_wall?.value;
    const insertTop = r3(bottom - depth);
    if (insertTop - roofMin < top - 1e-9) throw new Error(`${what}: ${a(o.thread)} insert's hole is ${mm(depth)} mm deep, and a carrier in ${slot.name} is ${mm(bottom - top)} mm deep: it needs ${mm(roofMin)} mm over it. A smaller thread or a nut will do`);
    const thin = [...Array(21)].map((_, i) => r3(bottom - (depth * i) / 20)).map((v) => [v, r3(half(v) - d / 2)]).sort((x, y) => x[1] - y[1])[0];
    if (thin[1] < least - 1e-9) throw new Error(`${what}: ${a(o.thread)} insert's ${mm(d)} mm hole leaves ${mm(thin[1])} mm of wall ${mm(thin[0])} mm below the face of a carrier in ${slot.name}, and the insert asks ${mm(least)} mm (${tr.insert_wall ? `${ts.name}.insert_wall` : 'its rule'}). A smaller thread or a larger slot will do`);
    levels = { ...levels, insertTop };
    insert = { model: h, diameter: d, depth, wall: thin[1], from: '+z' };
    width = r3(d + 2 * least); punch = r3(tau * Math.PI * tr.insert_diameter.value * (insertTop - top));
  }
  // the length, and the shoulders' shear: the two planes up the sides of the opening, from the shoulder to the bottom, less the nut's slot
  const edge = slot.opening / 2, span = down(loop, edge) ?? down(loop, edge - c), hs = span ? Math.max(0, span[1] - shoulder) : 0;
  const shear = (L) => r3(tau * 2 * Math.max(0, L * hs - (nut ? width * nut.gap : 0)));
  const end = CARRIER_DEFAULTS.end.value, need = o.load != null ? CARRIER_DEFAULTS.margin.value * o.load : 0;
  let length = o.length ?? Math.ceil(width + 2 * end);
  if (!(isNum(length) && length > 0)) throw new Error(`${what}: length is one carrier's along the slot, in mm above 0 (got ${shown(o.length)})`);
  if (length < width + 2 * line - 1e-9) throw new Error(`${what}: a carrier ${mm(length)} mm long leaves no plastic beside its ${mm(width)} mm ${holds}: ${mm(Math.ceil(width + 2 * end))} mm or more`);
  if (o.length == null && need) while (shear(length) < need && length < 200) length += 1;
  const pitch = count > 1 ? o.pitch : length;
  if (count > 1 && pitch < width + 2 * line - 1e-9) throw new Error(`${what}: a pitch of ${mm(pitch)} mm puts the ${holds}s ${mm(pitch - width)} mm apart: ${mm(width + 2 * line)} mm or more`);
  const each = Math.min(length, pitch), shoulders = shear(each), held = Math.min(punch, shoulders), total = r3((count - 1) * pitch + length);
  const at = [...Array(count)].map((_, i) => r3(length / 2 + i * pitch)), margin = o.load != null ? r3(held / o.load) : null;
  // printable floor down: every face that looks down, other than the bed, within the printer's overhang
  let worst = 0;
  for (let i = 0; i < loop.length; i++) {
    const [p, q] = [loop[i], loop[(i + 1) % loop.length]], dz = q[1] - p[1], du = q[0] - p[0];
    if (Math.abs(dz) < 1e-9 && Math.abs(p[1] - bottom) < 1e-9) continue; // the bed
    const n = offsetLoopSide(loop, i), facesDown = n[1] > 1e-9; // (v grows down)
    if (facesDown) worst = Math.max(worst, (Math.acos(Math.min(1, Math.abs(dz) / Math.hypot(du, dz))) * 180) / Math.PI);
  }
  const model = { kind: 'slot-carrier', name: `carrier-${slot.name.replace(/^slot-/, '')}-${o.thread.toLowerCase()}-${holds}${count > 1 ? `-x${count}` : ''}`, title: `printed carrier for ${a(o.thread)} ${holds} in ${slot.name}${count > 1 ? `, ${count} at ${mm(pitch)} mm` : ''}`,
    slot: slot.name, profile, face, thread: o.thread, holds, clearance: c, section: loop.map(([u, v]) => [r3(u), r3(-v)]), cavity: cavity.map(([u, v]) => [u, -v]), length, count, pitch, total, at, levels, nut, insert, screwHole,
    hold: { value: held, punch, shoulders, shear: tau }, load: o.load ?? null, margin, volume: 0, grams: 0, material: mat.name, printer: pr.name, least: r3(least), overhang: r3(worst), rests: [...rests, { name: `${mat.name}.strength`, value: mat.rules.strength.value }, { name: 'fixings.shear_ratio', value: FIX.shear_ratio.value }], findings: out };
  const solid = carrierSolid(model, fx);
  model.volume = r3(measureVolume(solid)); model.grams = r3((model.volume * mat.rules.density.value) / 1000);
  out.unshift(finding('info', `${slot.name}'s cavity offset in by ${F('fit').name} ${mm(c)} mm: ${mm(2 * half(shoulder + 0.01))} mm wide under the lips, ${mm(2 * half(top + 0.01))} mm in the opening, ${mm(bottom - top)} mm deep; it stands ${mm(least)} mm clear of the slot at its nearest, its inside corners at the tongue rounded ${mm(c)} mm (as round as the fit allows against a sharp lip)`, 'carrier.fit', { values: { clearance: c, least: r3(least), depth: r3(bottom - top) } }));
  out.push(finding(worst <= overhang + 0.25 ? 'pass' : 'warn', `laid floor down, its steepest face looking down is ${mm(worst)}° from upright (the printer's overhang ${mm(overhang)}°): ${worst <= overhang + 0.25 ? 'it prints without supports' : 'it needs supports there, or a slot with steeper flanks'}`, 'carrier.printable', { values: { overhang: r3(worst), limit: overhang } }));
  out.push(finding('pass', `its first layer is one solid piece, ${mm(2 * half(bottom - 0.01))} mm across and ${mm(total)} mm long${insert ? `, with the insert's ${mm(insert.diameter)} mm hole${count > 1 ? 's' : ''} in it` : `, with ${mm(floor)} mm (${CARRIER_DEFAULTS.floor.value} layers) under each nut and the screw's ${mm(screwHole)} mm hole through it, room for a long screw's end`}`, 'carrier.first-layer', { values: { width: r3(2 * half(bottom - 0.01)), length: total } }));
  out.push(finding(margin == null ? 'info' : margin >= CARRIER_DEFAULTS.margin.value - 1e-9 ? 'pass' : 'fail', `each ${holds} holds about ${Math.round(held)} N straight out of the slot (${punch <= shoulders ? `the ${mm(levels.roofTop != null ? levels.roofTop - top : levels.insertTop - top)} mm of plastic over it shears through first` : 'the shoulders under the lips shear off first'}: ${Math.round(punch)} N through the top, ${Math.round(shoulders)} N at the shoulders, at ${tau} MPa, ${mat.name}'s strength over √3: an estimate until tested, Frames 2.13)${margin == null ? '' : `: ${margin}× the ${o.load} N load, ${margin >= CARRIER_DEFAULTS.margin.value ? 'within' : 'short of'} the ${CARRIER_DEFAULTS.margin.value}× asked`}`, 'carrier.hold', { values: { hold: held, punch, shoulders, ...(margin != null ? { load: o.load, margin } : {}) } }));
  out.push(finding('info', `${count > 1 ? `the strip of ${count}` : 'it'} weighs ${mm(model.grams)} g of ${mat.name} (${mm(model.volume)} mm³ at ${mat.rules.density.value} g/cm³)`, 'carrier.mass', { values: { grams: model.grams, volume: model.volume } }));
  return model;
}
// The inward normal's v part of a loop's edge i, as offsetLoop takes it: > 0 where the material lies below (the face looks up), < 0 where it looks down
function offsetLoopSide(loop, i) {
  const n = loop.length, area = loop.reduce((s, p, k) => s + p[0] * loop[(k + 1) % n][1] - loop[(k + 1) % n][0] * p[1], 0) / 2, sgn = area > 0 ? 1 : -1, [a, b] = [loop[i], loop[(i + 1) % n]];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), inward = [(-dy / l) * sgn, (dx / l) * sgn];
  return [-inward[0], -inward[1]]; // outward: its v > 0 looks down (v grows down)
}
const a = (t) => (/^[aeiouAEFHILMNORSX]/.test(t) ? `an ${t}` : `a ${t}`);

function carrierSolid(m, fx) {
  const pts = m.section, area = pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0);
  // the section drawn in x, y as (y across, z up), extruded the strip's length along z, then turned so that its z runs along x
  const prism = extrudeLinear({ height: m.total }, polygon({ points: area > 0 ? pts : [...pts].reverse() }));
  const solid = transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], prism);
  const cuts = [];
  for (const x of m.at) {
    cuts.push(translate([x, 0, 0], cylinder({ radius: m.screwHole / 2, height: 4 * (m.levels.bottom + 2), segments: 24 })));
    if (m.nut) {
      const half = Math.max(...m.section.map(([y]) => Math.abs(y))) + 1, mid = -(m.levels.nutBottom + m.levels.nutTop) / 2;
      cuts.push(m.nut.from === 'side' ? nutTrap(m.thread, { axis: 'z', into: '+y', depth: half, at: [x, -half, mid], ...fx }) : nutTrap(m.thread, { axis: 'z', into: '+x', depth: x + 1, at: [-1, 0, mid], ...fx }));
    } else cuts.push(hole(m.thread, { kind: 'insert', into: '+z', at: [x, 0, -m.levels.bottom], ...fx }));
  }
  return subtract(solid, ...cuts);
}

/**
 * A printed carrier's solid, from carrierModel's model or its arguments. In the slot's frame (x along from the strip's
 * start, y across, z out of the face, the face at z = 0), or laid on the bed floor down to print.
 * @param {Carrier | string | object} m @param {object} [o] carrierModel's options, and pose: 'slot' (default) or 'print'
 * @returns {object} a JSCAD geom3, with .model
 */
export function carrier(m, o = {}) {
  const { pose = 'slot', ...rest } = o ?? {};
  if (!['slot', 'print'].includes(pose)) throw new Error(`carrier: pose is slot or print (got ${shown(pose)})`);
  const model = m?.kind === 'slot-carrier' ? m : carrierModel(m, rest), fx = { ...(rest.sets ? { sets: rest.sets } : {}), printer: printerOf('carrier', rest.printer) };
  const solid = carrierSolid(model, fx);
  return Object.assign(pose === 'print' ? translate([0, 0, model.levels.bottom], solid) : solid, { model });
}

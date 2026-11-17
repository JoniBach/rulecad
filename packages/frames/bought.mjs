// Bought fittings for a frame: a corner bracket, a joining plate, an inner connector, an anchor connector, a hinge, an
// end cap or a levelling foot, each a rule set (part "fitting") from its maker's drawing and shop page. A set says what
// the fitting mounts by: the screws, their slot nuts and where each passes into beam a and beam b (holes_a, holes_b), a
// hole a beam must have drilled for it (an anchor's pocket), its price where the seller lists one, and its stiffness,
// which no maker publishes, so every figure of it is an estimate until the joint rig (issue 264) measures it. A join or
// a mount chooses "printed" or a bought set's name; the list, the operations and the stiffness follow the choice.
//
// The frames the solids are drawn in are the printed fittings' (fitting.mjs), so one placement serves both: a corner
// bracket's or an inner connector's corner at the origin, b's face at y = 0 (b below it), a's face at x = 0 (a behind
// it), across the joint along z from its middle; a plate's joint middle at the origin, b along x, a along +y, the
// beams' faces at z = 0 and the plate above them; an anchor's where a's axis meets b's face, a along +z; an end cap's
// and a foot's the end's address frame (z out of the end); a hinge's pin along y at x = 0, its leaves on z = 0.
// Units: mm, N, N mm/rad, the currency its seller lists.
import jscad from '@jscad/modeling';
import { SETS } from './catalogue.mjs';
import { profileModel } from './profile.mjs';

const { cuboid, cylinder, cylinderElliptic, polygon } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { union, subtract } = jscad.booleans;
const { translate, rotateX, rotateY } = jscad.transforms;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const find = (given) => (name) => given?.sets?.[name] ?? given?.load?.(name) ?? SETS[name];
const pairs = (flat) => (Array.isArray(flat) ? Array.from({ length: Math.floor(flat.length / 2) }, (_, i) => [flat[2 * i], flat[2 * i + 1]]) : []);
const box = (lo, hi) => cuboid({ size: hi.map((h, k) => h - lo[k]), center: hi.map((h, k) => (h + lo[k]) / 2) });

/**
 * The kinds of bought fitting, each with what it is, the join kinds that take it, and whether it goes on a beam's end
 * as an item (an end cap, a foot) rather than in a join.
 * @type {Record<string, { what: string, joins: string[], fitting: string }>}
 */
export const BOUGHT_KINDS = {
  'corner-bracket': { what: 'a corner bracket', joins: ['bracket'], fitting: 'bracket' },
  'joining-plate': { what: 'a joining plate', joins: ['gusset', 'splice'], fitting: 'plate' },
  'inner-connector': { what: 'an inner connector', joins: ['hidden'], fitting: 'hidden' },
  'anchor-connector': { what: 'an anchor connector', joins: ['anchor'], fitting: 'anchor' },
  hinge: { what: 'a hinge', joins: [], fitting: 'hinge' },
  'end-cap': { what: 'an end cap', joins: [], fitting: 'end-cap' },
  'levelling-foot': { what: 'a levelling foot', joins: [], fitting: 'levelling-foot' },
};

/** @returns {string[]} the names of the bought fittings in the catalogue (and in given.sets) @param {{ sets?: object }} [given] */
export const boughtFittings = (given = {}) => [...new Set([...Object.values(SETS), ...Object.values(given.sets ?? {})].filter((s) => s?.part === 'fitting').map((s) => s.name))].sort();

/**
 * A bought fitting's set as numbers: what it is, the join kinds that take it, its screws and nuts and where each passes
 * into beam a and beam b, the hole a beam needs for it, its sizes for a reference solid, its price, its stiffness with
 * what that rests on, and (given the profiles it goes on) whether it fits them. Bad input is refused by name.
 * @param {string | { name: string, part: string, rules: object }} which the set, by name or as read
 * @param {{ given?: object, profile?: string | object, other?: string | object, join?: string }} [o] profile: b's
 *   (the beam a's end meets, or the beam an end cap or foot goes on), other: a's; join: the join kind it is asked for
 * @returns {object} the model: kind 'fitting', bought true, fitting (bracket, plate, hidden, anchor, hinge, end-cap,
 *   levelling-foot), set, title, screws, holes, ops, cost, stiffness, findings
 */
export function boughtFittingModel(which, o = {}) {
  const what = 'boughtFittingModel';
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: the options are { given, profile, other, join } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!['given', 'profile', 'other', 'join'].includes(k)) throw new Error(`${what}: no option "${k}": it takes given, profile, other, join`);
  const given = o.given ?? {}, set = typeof which === 'string' ? find(given)(which) : which;
  const names = boughtFittings(given);
  if (!set?.rules) throw new Error(`${what}: no bought fitting ${shown(which)}: there are ${names.join(', ')}`);
  if (set.part !== 'fitting') throw new Error(`${what}: ${set.name} is ${set.part ? `a ${set.part}` : 'not a part'}, not a bought fitting: there are ${names.join(', ')}`);
  const r = set.rules, v = (k) => r[k]?.value, num = (k) => (isNum(v(k)) ? v(k) : null);
  const kind = v('fitting_kind'), spec = BOUGHT_KINDS[kind];
  if (!spec) throw new Error(`${what}: ${set.name}'s fitting_kind is one of ${Object.keys(BOUGHT_KINDS).join(', ')} (got ${shown(kind)})`);
  if (o.join != null && !spec.joins.includes(o.join)) {
    const fit = Object.entries(BOUGHT_KINDS).filter(([, x]) => x.joins.includes(o.join)).map(([k]) => k);
    throw new Error(`${what}: ${set.name} is ${spec.what}, and a ${o.join} join takes ${fit.length ? fit.map((k) => BOUGHT_KINDS[k].what).join(' or ') : 'no bought fitting'}${spec.joins.length ? `: ${set.name} goes in a ${spec.joins.join(' or ')} join` : `: ${set.name} goes on an item ("bought": "${set.name}")`}`);
  }
  const thread = typeof v('thread') === 'string' ? v('thread') : null, length = num('screw_length'), head = v('screw_form') ?? null;
  const t = num('thickness') ?? 0, holes = { a: pairs(v('holes_a')), b: pairs(v('holes_b')) };
  const m = {
    kind: 'fitting', bought: true, set: set.name, fittingKind: kind, fitting: spec.fitting, what: spec.what, joins: spec.joins, name: set.name,
    title: `${set.name}, ${spec.what} (bought)`, series: num('series'), slot: v('slot') ?? null, material: v('material') ?? null,
    thread, head, length, nutKind: v('nut_kind') ?? null, count: num('screw_count') ?? 0, holes,
    width: num('width'), leg: num('leg'), legA: num('leg_a') ?? num('leg'), thickness: t, hole: num('mount_hole_diameter'), shape: v('plate_shape') ?? null,
    pocket: num('pocket_diameter') != null ? { diameter: num('pocket_diameter'), distance: num('pocket_distance') } : null,
    pin: num('pin_diameter'), knuckle: num('knuckle_diameter'), stem: num('thread_length'), base: num('body_diameter'), baseHeight: num('body_length'), stand: num('stand_height'),
    grams: num('mass') != null ? r3(num('mass') * 1000) : null, allowable: num('allowable_load'),
    cost: r.cost ? { value: r.cost.value, unit: r.cost.unit, kind: r.cost.kind, rule: r.cost.rule, source: r.cost.source } : null,
    stiffness: r.bending_stiffness ? { bending: r.bending_stiffness.value, twist: r.twist_stiffness?.value ?? null, kind: r.bending_stiffness.kind, rule: r.bending_stiffness.rule, source: r.bending_stiffness.source, measured: { bending: r.bending_stiffness.kind === 'measured' ? r.bending_stiffness.checked ?? null : null, twist: r.twist_stiffness?.kind === 'measured' ? r.twist_stiffness.checked ?? null : null }, rests: [r.bending_stiffness, ...(r.twist_stiffness ? [r.twist_stiffness] : [])].map((x, i) => ({ name: `${set.name}.${i ? 'twist' : 'bending'}_stiffness`, value: x.value, unit: x.unit, kind: x.kind, source: x.source })) } : null,
    screws: [], ops: [], findings: [], rules: r,
  };
  // the screws in the printed fittings' frames (fitting.mjs), so cad's placement and fasten checks serve both
  const screw = (leg, at, axis) => ({ leg, thread, head, length, grip: t, at, axis, nutKind: m.nutKind });
  if (spec.fitting === 'bracket') { for (const [x, y] of holes.b) m.screws.push(screw('b', [x, t, y], [0, -1, 0])); for (const [x, y] of holes.a) m.screws.push(screw('a', [t, x, y], [-1, 0, 0])); m.screwAt = holes.b[0]?.[0] ?? null; }
  if (spec.fitting === 'plate') { for (const [x, y] of holes.b) m.screws.push(screw('b', [x, y, t], [0, 0, -1])); for (const [x, y] of holes.a) m.screws.push(screw('a', [y, x, t], [0, 0, -1])); m.outline = plateOutline(m); m.arm = Math.max(...m.screws.map((q) => Math.hypot(q.at[0], q.at[1]))); }
  if (spec.fitting === 'hinge') { for (const [x, y] of holes.b) m.screws.push(screw('b', [x, y, t], [0, 0, -1])); for (const [x, y] of holes.a) m.screws.push(screw('a', [-x, y, t], [0, 0, -1])); } // (the frame leaf's into b's slot, the door leaf's through the door)
  if (spec.fitting === 'anchor' && m.pocket) m.ops.push({ op: 'drill', side: 'a', distance: m.pocket.distance, diameter: m.pocket.diameter, through: 'wall', why: `${set.name}'s guide` });
  // what it costs, its stiffness and the maker's load, each saying what it rests on
  if (m.cost) m.findings.push(finding('info', `${set.name} costs ${m.cost.value} ${m.cost.unit} each (${m.cost.kind}): ${m.cost.rule}`, 'fitting.cost', { values: { cost: m.cost.value, unit: m.cost.unit } }));
  if (m.stiffness) {
    // each figure as it rests: measured on the rig (and when), or the estimate's own sentence; one measured leaves the other an estimate
    const st = m.stiffness, tw = r.twist_stiffness, est = (f) => `an ${f.kind}: ${f.rule} (issue 264) (${f.source})`, meas = (f) => `measured on the joint rig${f.checked ? ` on ${f.checked}` : ''} (${f.source})`;
    const says = st.kind === 'measured' ? `bending ${meas(r.bending_stiffness)}${tw ? `; twist ${tw.kind === 'measured' ? meas(tw) : `${est(tw)}`}` : ''}`
      : tw?.kind === 'measured' ? `bending ${est(r.bending_stiffness)}; twist ${meas(tw)}` : est(r.bending_stiffness);
    m.findings.push(finding('info', `${set.name} holds a beam's end at ${st.bending} N mm/rad in bending${st.twist != null ? ` and ${st.twist} in twist` : ''}: ${says}`, 'fitting.stiffness', { values: { bending: st.bending, twist: st.twist }, refs: { kind_of_value: st.kind, ...(tw ? { twist_kind: tw.kind } : {}) } }));
  }
  if (m.allowable != null) m.findings.push(finding('info', `its maker allows ${m.allowable} N on it (${r.allowable_load.kind})`, 'fitting.load', { values: { allowable: m.allowable } }));
  if (o.profile != null) m.findings.push(...fits(m, o.profile, o.other ?? o.profile, given));
  return m;
}

// The plate's outline from its holes: the bar along b round b's holes, the stem (T) or arm (L) along a round a's, as
// wide as the series, the hole's edge distance its maker's (the bar's end beyond its last hole)
function plateOutline(m) {
  const b = m.screws.filter((q) => q.leg === 'b').map((q) => q.at), a = m.screws.filter((q) => q.leg === 'a').map((q) => q.at), s = m.series ?? 20;
  const xs = b.map((p) => p[0]), lo = Math.min(...xs), hi = Math.max(...xs), edge = m.width != null ? (m.width - (hi - lo)) / 2 : s / 2;
  const top = a.length ? Math.max(...a.map((p) => p[1])) + edge : s / 2, band = [-edge, s - edge];
  if (m.shape === 'straight' || !a.length) return [[lo - edge, band[0]], [hi + edge, band[0]], [hi + edge, band[1]], [lo - edge, band[1]]];
  if (m.shape === 'L') return [[lo - edge, band[0]], [hi + edge, band[0]], [hi + edge, band[1]], [s / 2, top], [-s / 2, top], [-s / 2, band[1]]].map(([x, y]) => [r3(x), r3(y)]);
  return [[lo - edge, band[0]], [hi + edge, band[0]], [hi + edge, band[1]], [s / 2, top], [-s / 2, top], [lo - edge, band[1]]].map(([x, y]) => [r3(x), r3(y)]);
}

// Whether a fitting fits the profiles it is put on: their size, the slot family its lugs or nuts are made for, and for
// a foot the thread of the end's bore. Each a finding, a fail where it would not go on
function fits(m, profileB, profileA, given) {
  const out = [], seen = new Set();
  for (const [side, profile] of [['b', profileB], ['a', profileA]]) {
    const p = profile?.kind === 'profile' ? profile : profileModel(profile, {}, given);
    if (seen.has(p.name)) continue; seen.add(p.name);
    const size = Math.min(p.width, p.height), short = p.name.replace(/^profile-/, '');
    if (m.series != null && Math.abs(size - m.series) > 1e-6) out.push(finding('fail', `${m.set} is made for ${m.series} mm profiles, and ${short} is ${mm(size)} mm: choose a fitting made for it, or "fitting": "printed"`, 'fitting.fit', { values: { series: m.series, size }, refs: { set: m.set, profile: p.name, side } }));
    if (m.slot) {
      const family = (n) => { const s = find(given)(n); return s?.part === 'slot' ? String(s.rules.nut_family?.value ?? n) : n; };
      const want = family(m.slot), have = [...new Set(Object.keys(p.slots ?? {}))], ok = have.some((n) => n === m.slot || family(n) === want);
      if (!have.length) out.push(finding('fail', `${m.set} keys into a slot (${m.slot}), and ${short} has none`, 'fitting.fit', { refs: { set: m.set, profile: p.name, side } }));
      else if (!ok) out.push(finding('fail', `${m.set} is made for ${m.slot} (nut family ${want}), and ${short}'s slots are ${have.join(', ')} (${[...new Set(have.map(family))].join(', ')}): its lugs and nuts are not promised to fit. Choose a fitting made for ${have[0]}, or "fitting": "printed"`, 'fitting.fit', { values: { family: want }, refs: { set: m.set, profile: p.name, side, slots: have } }));
    }
    if (m.fitting === 'levelling-foot' && m.thread) {
      const bore = p.bores?.[0]?.thread ?? null;
      if (bore !== m.thread) out.push(finding('fail', `${m.set}'s stem is ${m.thread}, and ${short}'s end bore ${bore ? `is tapped ${bore}` : 'takes no thread'}: ${bore ? `choose a foot with an ${bore} stem` : 'it has nothing to screw into'}`, 'fitting.fit', { values: { thread: m.thread, bore }, refs: { set: m.set, profile: p.name } }));
    }
  }
  if (!out.length) out.push(finding('pass', `${m.set} fits ${[...seen].map((n) => n.replace(/^profile-/, '')).join(' and ')}: made for ${m.series} mm profiles${m.slot ? ` with ${m.slot}'s slot` : ''}${m.fitting === 'levelling-foot' ? `, its ${m.thread} stem into the end's bore` : ''}`, 'fitting.fit', { refs: { set: m.set, profiles: [...seen] } }));
  return out;
}

/**
 * A bought fitting's reference solid, drawn from its set's figures in the printed fittings' frames (above): faint, for
 * the picture and the fasten checks' holes, never printed.
 * @param {object} m boughtFittingModel's @param {{ pose?: 'fit' }} [o]
 */
export function boughtFitting(m, o = {}) {
  if (!m?.bought) throw new Error(`boughtFitting: give a bought fitting's model (boughtFittingModel), not ${shown(m)}`);
  if (o.pose != null && o.pose !== 'fit') throw new Error(`boughtFitting: a bought fitting is drawn as fitted: pose is fit (got ${shown(o.pose)})`);
  const t = m.thickness, r = (m.hole ?? 0) / 2, w = m.width ?? m.series ?? 20;
  const holeAt = (q) => { const [x, y, z] = q.at, h = 3 * t + 2; return q.axis[1] ? translate([x, y - t / 2, z], rotateX(Math.PI / 2, cylinder({ radius: r, height: h, segments: 24 }))) : q.axis[0] ? translate([x - t / 2, y, z], rotateY(Math.PI / 2, cylinder({ radius: r, height: h, segments: 24 }))) : translate([x, y, t / 2], cylinder({ radius: r, height: h, segments: 24 })); };
  let g;
  if (m.fitting === 'bracket') {
    const L = m.leg, La = m.legA ?? L;
    g = union(box([0, 0, -w / 2], [L, t, w / 2]), box([0, 0, -w / 2], [t, La, w / 2]));
    if (r > 0) g = subtract(g, ...m.screws.map(holeAt));
  } else if (m.fitting === 'plate') {
    g = extrudeLinear({ height: t }, polygon({ points: m.outline }));
    if (r > 0) g = subtract(g, ...m.screws.map(holeAt));
  } else if (m.fitting === 'hidden') {
    // in the slots under the lips: b's leg along x below b's face, a's along y behind a's
    const d = t, half = w / 2;
    g = union(box([-d, -d, -half], [m.leg, 0, half]), box([-d, -d, -half], [0, m.legA, half]));
  } else if (m.fitting === 'anchor') {
    // the post along a's axis from under b's lips, its head in b's slot; the guide across a at its pocket
    const head = m.width ?? 10, post = m.leg ?? 20;
    g = union(box([-head / 2, -head / 2, -5], [head / 2, head / 2, -2]), translate([0, 0, (post - 5) / 2 - 2.5], cylinder({ radius: 2, height: post - 5, segments: 24 })));
    if (m.pocket) g = union(g, translate([0, 0, m.pocket.distance], rotateY(Math.PI / 2, cylinder({ radius: m.pocket.diameter / 2 - 0.1, height: (m.series ?? 20) / 2, center: [0, 0, (m.series ?? 20) / 4], segments: 24 }))));
  } else if (m.fitting === 'hinge') {
    const half = (m.width ?? 39) / 2, L = m.leg ?? 30, k = (m.knuckle ?? 8) / 2;
    g = union(box([-half, -L / 2, 0], [half, L / 2, t]), translate([0, 0, k], rotateX(Math.PI / 2, cylinder({ radius: k, height: L, segments: 24 }))));
    if (r > 0) g = subtract(g, ...[...m.holes.b.map(([x, y]) => [x, y]), ...m.holes.a.map(([x, y]) => [-x, y])].map(([x, y]) => translate([x, y, t / 2], cylinder({ radius: r, height: 2 * t + 2, segments: 24 }))));
  } else if (m.fitting === 'end-cap') {
    g = box([-w / 2, -w / 2, 0], [w / 2, w / 2, t || 2]);
  } else {
    // a levelling foot screwed fully home: the nut on the end's face, the base under it, the stem between
    const base = (m.base ?? 19) / 2, bh = m.baseHeight ?? 10, stand = m.stand ?? bh + 6, nut = 5;
    g = union(translate([0, 0, nut / 2], cylinder({ radius: 5.7, height: nut, segments: 6 })), translate([0, 0, (stand - bh) / 2], cylinder({ radius: 3, height: stand - bh, segments: 24 })),
      translate([0, 0, stand - bh / 2], cylinderElliptic({ height: bh, startRadius: [base * 0.84, base * 0.84], endRadius: [base, base], segments: 32 })));
  }
  return Object.assign(g, { model: m });
}

/**
 * What a printed part costs in plastic beside a bought one's price: its grams times the material's cost per kilogram,
 * where the material's set gives one (pla and petg do), else null. @param {number} grams @param {{ name?: string, rules: object }} material
 * @returns {{ value: number, unit: string, rule: string, source: string } | null}
 */
export function printedCost(grams, material) {
  const c = material?.rules?.cost;
  if (!isNum(grams) || !c || !isNum(c.value)) return null;
  const unit = String(c.unit ?? '').replace(/\/kg$/, '');
  return { value: +((grams / 1000) * c.value).toFixed(3), unit, rule: `${mm(grams)} g of ${material.name ?? 'plastic'} at ${c.value} ${c.unit}: the plastic alone, not the printer's time or power`, source: c.source, kind: 'derived' };
}
export { CHECKED as BOUGHT_CHECKED };

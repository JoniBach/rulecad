// Bought parts in assemblies: a bearing, a switch, a driver, a board or a supply named by its rule set, drawn from the
// set's figures as a faint reference (never on a plate), with anchors from what it is. A motor is the same thing with a
// shaft that turns a joint, so its item is built here too (lib/motors.mjs).
import crypto from 'node:crypto';
import fs from 'node:fs';
import jscad from '@jscad/modeling';
import { peekRuleSet as loadRuleSet } from './rules.mjs';
import { RULE_DIRS } from './workspace.mjs';
import { named } from './parts.mjs';

const { cuboid, cylinder, polygon } = jscad.primitives, { translate } = jscad.transforms, { union, subtract } = jscad.booleans, { extrudeRotate } = jscad.extrusions;
const SEG = 48;

// Rule sets that are bought parts, for saying what there is
export function boughtSets() {
  const out = new Map();
  for (const d of RULE_DIRS) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json') || f === 'vocabulary.json' || f === 'package.json') continue;
    try { const set = JSON.parse(fs.readFileSync(`${d}/${f}`, 'utf8')); if (set.part && !out.has(set.name)) out.set(set.name, set.part); } catch {}
  }
  return out;
}

// A reference item the assembly can place, from its parts, anchors and figures: what a motor and any bought part share
export function referenceBuilt({ id, key, objName, name, parts, anchors, entries, values, extra = {} }) {
  const b = { object: { name, title: name, role: 'reference', version: '0.0.0', anchors }, values, entries, deps: [], units: {}, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles), hash: crypto.createHash('sha256').update(JSON.stringify([values, entries.map((e) => e.name)])).digest('hex').slice(0, 16) };
  return { key: `${key}:${id}:${b.hash}`, objName, b, version: '0.0.0', role: 'reference', ...extra };
}

const z = (at, axis = [0, 0, 1]) => ({ at, axis });
const box = (w, d, h, x = 0, y = 0, z0 = 0) => translate([x, y, z0 + h / 2], cuboid({ size: [w, d, h] }));

// What each kind of part looks like, from its figures. Each returns { parts: { name: solid }, anchors }
const SHAPES = {
  bearing(v, set) {
    const r = v.bore / 2, R = v.outer_diameter / 2, w = v.width, c = Math.min(v.chamfer ?? 0.2, (R - r) / 4, w / 4);
    const flange = v.flange_diameter ? v.flange_diameter / 2 : 0, f = v.flange_width ?? 0;
    const pts = flange
      ? [[r + c, 0], [R - c, 0], [R, c], [R, w - f], [flange, w - f], [flange, w], [r + c, w], [r, w - c], [r, c]]
      : [[r + c, 0], [R - c, 0], [R, c], [R, w - c], [R - c, w], [r + c, w], [r, w - c], [r, c]];
    return { parts: { body: extrudeRotate({ segments: SEG }, polygon({ points: pts })) }, anchors: { bore: z([0, 0, w / 2]), outer: z([0, 0, w / 2]), face: z([0, 0, 0]), top: z([0, 0, w]) } };
  },
  switch(v) {
    const w = v.body_width, d = v.body_depth, h = v.body_length, holes = (v.mount_hole_spacing ?? 0) / 2, up = h / 2;
    const pin = (x) => translate([x, 0, up], jscad.transforms.rotateX(Math.PI / 2, cylinder({ radius: (v.mount_hole_diameter ?? 2.4) / 2, height: d + 2, segments: 24 })));
    const body = holes ? subtract(box(w, d, h), pin(-holes), pin(holes)) : box(w, d, h);
    return { parts: { body, lever: box(w, Math.min(4, d), 0.4, w * 0.1, 0, h + 2) }, anchors: { lever: z([w * 0.6, 0, h + 2]), left: z([-holes, 0, up], [0, 1, 0]), right: z([holes, 0, up], [0, 1, 0]), base: z([0, 0, 0]) } };
  },
  board(v, set) {
    const w = v.body_width, d = v.body_depth, t = 1.6;
    const axes = [...new Set(Object.keys(set.rules).map((k) => /^step_pin_(\w+)$/.exec(k)?.[1]).filter(Boolean))].map((a) => a.toUpperCase());
    // Where a board's axis connectors are along its edge is for routing a wire, no closer than that
    const sockets = Object.fromEntries(axes.map((a, i) => [a, z([-w / 2 + ((i + 0.5) * w) / axes.length, d / 2, t], [0, 1, 0])]));
    return { parts: { body: box(w, d, t) }, anchors: { centre: z([0, 0, t / 2]), top: z([0, 0, t]), bottom: z([0, 0, 0]), ...sockets } };
  },
  driver(v) {
    const w = v.body_width, d = v.body_depth, t = 1.6, row = v.row_spacing / 2, pins = v.pin_count / 2, pitch = v.pin_pitch, run = pitch * (pins - 1), pin = 0.64, drop = 8;
    const rows = [-row, row].flatMap((y) => Array.from({ length: pins }, (_, i) => box(pin, pin, drop + t, -run / 2 + i * pitch, y, -drop)));
    return { parts: { body: union(box(w, d, t), box(5, 5, 1, 0, 0, t)), pins: union(rows) }, anchors: { header: z([0, 0, 0]), top: z([0, 0, t]) } };
  },
  encoder(v, set) { return SHAPES.board(v, set); },
  supply(v) {
    const w = v.body_width, d = v.body_depth, h = v.body_length;
    return { parts: { body: box(w, d, h) }, anchors: { base: z([0, 0, 0]), top: z([0, 0, h]), terminals: z([0, -d / 2, h / 2], [0, -1, 0]) } };
  },
};

export function boughtModel(name, variant) {
  const sets = boughtSets();
  if (!sets.has(name)) throw new Error(`no bought part "${name}" (${[...sets.keys()].sort().join(', ')})`);
  const set = loadRuleSet(name);
  let rules = set.rules;
  if (variant != null) {
    const vs = set.variants || {};
    if (!vs[variant]) throw new Error(`${name} has no variant "${variant}" (${Object.keys(vs).join(', ') || 'none'})`);
    rules = { ...set.rules, ...Object.fromEntries(Object.entries(vs[variant].values ?? {}).map(([k, value]) => [k, { ...set.rules[k], value, kind: vs[variant].kind ?? set.rules[k]?.kind, source: vs[variant].source ?? set.rules[k]?.source }])) };
  }
  return { name, part: set.part, variant: variant ?? null, rules };
}

// An item with "bought": built like any other, a reference, its figures in values and its rules in entries
export function boughtBuilt(spec, it, num, id) {
  const m = boughtModel(spec, it.variant);
  // Figures that differ from the set's, by name: a smaller supply, a measured bearing
  for (const [k, x] of Object.entries(it.set || {})) { if (!m.rules[k]) throw new Error(`item ${id}: ${spec} has no figure "${k}" (${Object.keys(m.rules).join(', ')})`); m.rules = { ...m.rules, [k]: { ...m.rules[k], value: num(x), kind: 'estimate', source: 'set on this item' } }; }
  if (!SHAPES[m.part]) throw new Error(`item ${id}: ${spec} is a ${m.part}: bought parts are ${Object.keys(SHAPES).join(', ')}, and a motor goes in "motor"`);
  const values = Object.fromEntries(Object.entries(m.rules).filter(([, r]) => typeof r.value === 'number').map(([k, r]) => [k, r.value]));
  let shape;
  try { shape = SHAPES[m.part](values, m); } catch (e) { throw new Error(`item ${id}: ${spec} doesn't say enough to draw it: ${e.message}`); }
  const missing = Object.entries(shape.anchors).filter(([, a]) => a.at.some((c) => !Number.isFinite(c))).map(([k]) => k);
  if (missing.length) throw new Error(`item ${id}: ${spec}: its rules don't place the anchors ${missing.join(', ')}`);
  const parts = named(shape.parts, Object.fromEntries(Object.keys(shape.parts).map((k) => [k, { label: `${m.name} ${k}` }])));
  const entries = Object.entries(m.rules).map(([k, r]) => ({ name: `${m.name}.${k}`, value: r.value, unit: r.unit, rule: r.rule, kind: r.kind, source: r.source, checked: r.checked, set: m.name }));
  return referenceBuilt({ id, key: 'bought', objName: `bought:${m.name}`, name: m.name, parts, anchors: shape.anchors, entries, values, extra: { bought: { set: m.name, variant: m.variant, part: m.part, mass: values.mass ?? null } } });
}

// One line in the check for each bought item, so the shopping list and the wiring can read it
export function boughtFindings(s, f) {
  for (const o of s.objects) if (o.bought) f('info', `${o.id}: ${o.bought.set}${o.bought.variant ? ` (${o.bought.variant})` : ''}, a ${o.bought.part}`, null, { code: 'bought.item', refs: { item: o.id, set: o.bought.set, variant: o.bought.variant, part: o.bought.part } });
}

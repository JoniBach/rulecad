// Assemblies: objects placed together, in projects/<project>/assemblies/<name>.json.
//   kind "fit":   to check how parts go together (references allowed: the switch a keycap fits on). Supports are
//                 left out: they're removed before parts go together.
//   kind "plate": a print plate, everything laid out on the bed and exported as one 3MF
// {
//   "title": "Keycap on a switch", "kind": "fit", "uses": ["mx"],
//   "requires": { "keycap": "^0.2.0" },                      versions each object must be (^ same major, ~ same minor)
//   "items": [ { "id": "switch", "object": "mx-switch" },
//              { "id": "cap", "object": "keycap", "at": [0, 0, "switch.housing_top - cap.lift"], "rotate": [0, 0, 90] } ],
//   "fits": [ { "a": "cap.cap", "b": "switch.stem", "min": 0, "max": "x1c.fit", "note": "slot over the stem" } ]
// }
// Positions are expressions over rules (mx.pitch) and items' variables (cap.lift); rotate is degrees about x, y, z,
// applied before at (a repeated item turns as a whole, its copies with it). An item can pin a release: "object": "keycap@0.2.1". fits measure the closest gap between two
// items or item.parts; a negative min allows a press fit to overlap.
// A holes fit follows each of a board's mounting holes down its screw's path into another part:
//   { "holes": "pcb.board", "into": "case.body", "depth": "m2.insert_length", "label": "Screws find their inserts" }
// The path must be clear for depth mm (it lands in a hole) and solid within "ring" mm of it (default: the hole's
// diameter) half way down, so the screw has something to grip. "direction": "up" for screws from below.
import { host, readJson } from './host.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, loadRuleSet } from './rules.mjs';
import { paths, printerOf } from './workspace.mjs';
import { locate, build, readObject, jscad } from './design.mjs';
import { materialise } from './versions.mjs';
import { satisfies } from '@rulecad/versions';
import { bounds } from '@rulecad/printcheck';
import { closest, closestAt, inside, distanceToFace, overlapAt } from '@rulecad/fit';
import { keys as keyCentres, readLayout, hasLayout } from './layout.mjs';
import { DOFS, frame, turn, mul, pathLength, jointValues, placeItems, jointMatrix } from '@rulecad/model-link';
import { gearModel, internalModel, rackModel, mesh as meshOf, phase, rackPhase, contact, wormModel, wormMesh, bevelModel, bevelMesh, compoundEfficiency } from '@rulecad/gears';
import { ops as booleans } from '@rulecad/shapes';
import { motorBuilt, motorDrives, shaftFits, loadsOf, motorChecks, shaftFit, axisOf } from './motors.mjs';
import { runningChecks, seatFit } from './seats.mjs';
import { seatSize } from '@rulecad/shapes';
import { wiresOf, wireChecks, wireRows } from './wires.mjs';
import { boughtBuilt, boughtFindings, boughtSets } from './bought.mjs';

export const assemblyPath = (ref) => { const [project, name] = String(ref).split('/'); return path.join(paths.project(project || ''), 'assemblies', `${name || ''}.json`); };
export const isAssembly = (ref) => String(ref).includes('/') && host.exists(assemblyPath(ref.split('@')[0]));

export { satisfies }; // from @rulecad/versions

// buildAssembly('keyboard/keycap-on-switch') -> { a, project, name, items, parts, objects, fits, requires, values, num }
//   parts: [{ name: 'cap.cap', item, leaf, role, label, geometry, polygons, triangles, shape, m }], placed. item: the
//   top-level item it belongs to; leaf: the object instance (key-0-0.cap), for overlap checks inside components too;
//   shape: which built object part it is (the same for every copy), with its faces unmoved in local and localTriangles,
//   and m its placement (a JSCAD mat4), so repeated shapes can be sent once and placed (shapes()).
//   objects: every object instance, nested ones included; fits and requires: this assembly's and its components'.
// An item is an object ("object": "keycap") or another assembly ("assembly": "keycap-on-switch"), placed by at and
// rotate. "repeat": { "x": { "count": "plate.cols", "step": "mx.pitch" }, "y": { … } } makes a grid of copies, with
// ids like key-0-2 (column, row) and at as the first copy's place.
// "repeat": { "layout": "plate/staggered-54", "step": "mx.pitch", "width": "cap.units" } places a copy at each key of
// an object's layout (layouts in plate.json), centred on at, with ids like key-0-11 (row, key; row 0 at the back).
// width names a variable set to each key's width in units: in a component, <item>.<variable>. "rows": { "cap.row":
// ["R1", "R2", …] } sets a variable to one value per row, and "each": { "cap.profile": "oem" } one value for every copy.
// With a layout file ("layout": "staggered", in projects/<project>/layouts/), "per": { "cap.legend": "legend",
// "cap.row": "row" } sets inputs from each key's own properties: the layout says what each key is.
// "place": false builds an item only for its values (what other items' from and positions read): nothing of it is placed,
// checked or printed.
// An object item can be a variant: "object": "keycap:oem-r3" (or "variant": "oem-r3"), and pin a release: "keycap@0.4.0".
// overrides: { itemId: { variable: value } }, set on this assembly's items by the assembly that uses it.
// opts: { mirror: true } builds each object with its mirror settings (cad show).
export async function buildAssembly(ref, stack = [], overrides = {}, opts = {}) {
  await measurer();
  const outer = overrides;
  const [project, name] = ref.split('/');
  if (stack.includes(ref)) throw new Error(`assembly ${ref} contains itself (${[...stack, ref].join(' → ')})`);
  const a = readJson(assemblyPath(ref));
  // A pose may set items' variables as well as joints ("cocked": { "run": -30, "action.travel": 25 }): a flexure bent
  // as the pose bends it, while the part itself is printed as drawn. The pose being built sets them on its items.
  const itemSets = (name) => { const out = {}; for (const [k, v] of Object.entries(a.poses?.[name] || {})) if (k.includes('.')) { const [item, ...rest] = k.split('.'); (out[item] ||= {})[rest.join('.')] = v; } return out; };
  const builtPose = opts.pose ?? a.pose ?? Object.keys(a.poses || {})[0];
  const ownSets = typeof builtPose === 'string' ? itemSets(builtPose) : {};
  overrides = { ...overrides };
  const printer = printerOf(project);
  if (a.kind === 'plate' && !(a.uses || []).includes(printer)) a.uses = [...(a.uses || []), printer]; // a plate is checked as a print
  const values = Object.fromEntries((a.uses || []).map((u) => { const s = loadRuleSet(u); return [u, Object.fromEntries(Object.entries(s.rules).map(([k, r]) => [k, r.value]))]; }));

  // Names in positions: rule sets (mx.pitch), items' variables (cap.lift), or into components (key-0-0.cap.lift).
  // Rule values may still be expressions (rules referring to rules): resolved on demand.
  const seen = new Set(), ids = [];
  const lookup = (n) => {
    const path = n.split('.');
    if ((a.uses || []).includes(path[0])) seen.add(n);
    if (!(path[0] in values)) throw new Error(`"${n}": no item or rule set "${path[0]}" (items: ${ids.join(', ') || 'none yet'}; uses: ${(a.uses || []).join(', ') || 'none'})`);
    let v = values;
    for (const k of path) v = v?.[k];
    if (typeof v === 'string') v = evaluate(v, (k) => lookup(k.includes('.') ? k : `${path.slice(0, -1).join('.')}.${k}`));
    if (typeof v !== 'number') throw new Error(`"${n}" isn't a number`);
    return v;
  };
  const num = (x) => evaluate(x, lookup);
  const { translate, rotate, transform } = jscad.transforms, deg = Math.PI / 180;

  const items = [], parts = [], objects = [], fits = [], requires = [];
  for (const [k, r] of Object.entries(a.requires || {})) requires.push({ object: k, range: r, from: ref });
  const built = new Map(); // each object or component is built once per set of values, however many copies are placed
  const source = async (it, extra) => {
    if (it.motor) { const key = JSON.stringify(['motor', it.id, it.motor]); if (!built.has(key)) built.set(key, motorBuilt(it.motor, num, it.id)); return built.get(key); }
    if (it.bought) {
      const key = JSON.stringify(['bought', it.id, it.bought, it.variant]);
      if (!built.has(key)) built.set(key, boughtSets().get(it.bought) === 'motor' ? motorBuilt({ model: it.bought }, num, it.id) : boughtBuilt(it.bought, it, num, it.id));
      return built.get(key);
    }
    // from: inputs worked out from items built before this one ({ "usb_y": "board.pcb.pico_y" }): numbers, in this
    // assembly's names, so a part can take a value only another part knows once it's built
    const from = Object.fromEntries(Object.entries(it.from || {}).map(([k, x]) => [k, num(x)]));
    // The pose's settings for this item: expressions in the assembly's names (launcher.travel), which may name the item's
    // own variables (magazine.preload: the item is built once as drawn to read them), or a choice as it is
    const base = { ...(it.set || {}), ...from, ...(overrides[it.id] || {}), ...(it.assembly ? {} : extra) };
    let own = null;
    const ownValue = async (x) => {
      if (typeof x !== 'string') return x;
      try { return num(x); } catch {}
      if (!it.object || !new RegExp(`\\b${it.id}\\.`).test(x)) return x;
      if (!own) { const [r, named] = String(it.object).split(':'), [objName, pin] = r.split('@'), d = locate(`${project}/${objName}`); own = (await build({ ...(pin ? materialise(d, pin) : d), ...((named || it.variant) ? { variant: named || it.variant } : {}) }, base, opts)).values; }
      return evaluate(x, (n) => { if (n.startsWith(`${it.id}.`)) { const v = own[n.slice(it.id.length + 1)]; if (typeof v === 'number') return v; } return lookup(n); });
    };
    const posed = {};
    for (const [k, x] of Object.entries(ownSets[it.id] || {})) posed[k] = await ownValue(x);
    const set = { ...(it.set || {}), ...from, ...posed, ...(overrides[it.id] || {}), ...(it.assembly ? {} : extra) };
    // Built for the mirror, an object's mirror settings win (no legends), so copies that differ only there are one shape
    if (opts.mirror && it.object) for (const k of Object.keys(readObject(locate(`${project}/${String(it.object).split(/[:@]/)[0]}`)).mirror || {})) delete set[k];
    const sub = it.assembly ? extra : {}; // a component's values go to its items: { cap: { units: 1.5 } }
    const key = JSON.stringify([it.object, it.variant, it.assembly, set, sub]);
    if (!built.has(key)) {
      if (it.assembly) built.set(key, { key, sub: await buildAssembly(`${project}/${it.assembly}`, [...stack, ref], sub, { ...opts, pose: undefined }) }); // a pose names the outer assembly's joints
      else {
        const [ref, named] = String(it.object).split(':'), [objName, pin] = ref.split('@'), variant = named || it.variant;
        const d = locate(`${project}/${objName}`), at = { ...(pin ? materialise(d, pin) : d), ...(variant ? { variant } : {}) };
        const b = await build(at, set, opts);
        built.set(key, { key, objName, b, version: pin || b.object.version, variant, role: ['reference', 'board'].includes(b.object.role) ? 'reference' : 'part' }); // a board is made by a fab: checked, never printed
      }
    }
    return built.get(key);
  };
  const placing = [];
  let builtCount = 0;
  for (const it of a.items || []) {
    if (!/^[a-z][\w-]*$/.test(it.id || '')) throw new Error(`each item needs an id (letters, digits, - or _): got ${JSON.stringify(it.id)}`);
    if ([it.object, it.assembly, it.motor, it.bought].filter(Boolean).length !== 1) throw new Error(`item ${it.id}: give one of "object", "assembly", "motor" or "bought"`);
    // Copies: one, a grid from repeat x/y, or a layout's keys. Each: { id, offset (from at), extra (values to set) }
    const rx = it.repeat?.x, ry = it.repeat?.y, rl = it.repeat?.layout, copies = [];
    if (rl) {
      // A layout file in the project's layouts/, or (older assemblies) object/name: a layout kept in an object's .json
      const [lp, ln] = String(rl).includes('/') ? String(rl).split('/') : [null, rl];
      const data = lp ? readObject(locate(`${project}/${lp}`)).layouts?.[ln] : readLayout(project, ln);
      if (!data) throw new Error(`item ${it.id}: no layout "${ln}" in ${lp}.json`);
      const step = num(it.repeat.step);
      // Values each copy sets: its width, a value for its row (rows: { "cap.row": ["R1", …] }) and constants (each)
      // per: { "cap.legend": "legend" } sets an input from each key's own property (skipped where the key has none)
      const per = (k) => Object.fromEntries(Object.entries(it.repeat.per || {}).filter(([, f]) => k[f] != null).map(([n, f]) => [n, k[f]]));
      const values = (k) => ({ ...(it.repeat.width ? { [it.repeat.width]: k.units } : {}), ...(it.repeat.each || {}), ...per(k),
        ...Object.fromEntries(Object.entries(it.repeat.rows || {}).map(([n, list]) => {
          if (k.index >= list.length) throw new Error(`item ${it.id}: repeat.rows ${n} has ${list.length} values, the layout ${rows(data)} rows`);
          return [n, list[k.index]];
        })) });
      const rows = (l) => (l.rows || []).length;
      for (const k of keyCentres(data)) {
        const extra = {};
        for (const [n, val] of Object.entries(values(k))) {
          if (!it.assembly) { extra[n] = val; continue; }
          const [item, name] = n.split('.'); // in a component: <item>.<variable>
          if (!name) throw new Error(`item ${it.id}: name a component's variable as <item>.<variable>, e.g. cap.units (got ${n})`);
          (extra[item] ||= {})[name] = val;
        }
        copies.push({ id: `${it.id}-${k.index}-${k.col}`, offset: [k.x * step, k.y * step], extra, label: k.label });
      }
    } else {
      const nx = rx ? Math.round(num(rx.count)) : 1, ny = ry ? Math.round(num(ry.count)) : 1;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        copies.push({ id: it.repeat ? `${it.id}-${i}${ry ? `-${j}` : ''}` : it.id, offset: [rx ? i * num(rx.step) : 0, ry ? j * num(ry.step) : 0], extra: {} });
      }
    }
    const first = await source(it, copies[0].extra);
    values[it.id] = first.sub ? first.sub.values : first.b.values; // a repeated item's own name works too: cap.base, not only cap-0-0
    for (const c of copies) {
      c.src = await source(it, c.extra); values[c.id] = c.src.sub ? c.src.sub.values : c.src.b.values;
      opts.progress?.({ stage: 'build', assembly: ref, item: c.id, done: ++builtCount }); // progress: for a caller to show (cad --progress)
    }
    placing.push([it, copies]);
  }
  // Then place them: every item is built by now, so a position can refer to any item, before or after it (a board
  // placed under the case's top, the case built with the board's Pico position). Each copy is an item of the motion:
  // placed by at and rotate, or by the joint whose child it is.
  const placed = []; // [it, copy], each a motion item, in order
  for (const [it, copies] of placing) {
    if (it.place === false) { // built only for its values ("place": false): a board a print plate's case is sized from
      for (const c of copies) if (!c.src.sub) objects.push({ id: c.id, objName: c.src.objName, version: c.src.version, built: c.src.b, role: c.src.role, unplaced: true });
      continue;
    }
    for (const c of copies) { placed.push([it, c]); ids.push(c.id); }
  }
  const motion = motionOf(a, placed, num, ref), wires = wiresOf(a, placed, motion.joints);
  fits.push(...shaftFits(motion.drives, motion.joints, placed.map(([, c]) => c.id)).map((x) => ({ ...x, num })));
  for (const [it, c] of placed) {
    const src = c.src, id = c.id;
    if (src.sub) {
      const sub = src.sub;
      for (const o of sub.objects) objects.push({ ...o, id: `${id}.${o.id}` });
      for (const x of sub.fits) fits.push({ ...x, a: `${id}.${x.a}`, b: `${id}.${x.b}`, label: x.label && `${x.label} (${id})` });
      requires.push(...sub.requires);
      for (const n of sub.seen) seen.add(n);
      items.push({ ...it, id, sub, role: 'part' });
    } else {
      objects.push({ id, objName: src.objName, version: src.version, built: src.b, role: src.role, ...(src.bought ? { bought: src.bought } : {}), ...(src.motor ? { motor: src.motor } : {}) });
      items.push({ ...it, id, objName: src.objName, built: src.b, version: src.version, role: src.role });
    }
  }
  // Every part, with its item where the joints put it at these values (jointValues)
  const partsAt = (worlds) => {
    const out = [];
    placed.forEach(([, c], k) => {
      const src = c.src, id = c.id, key = src.key, m = toMat4(worlds[k]);
      items[k].m = m;
      // Faces are moved as they are, not re-triangulated in place: triangulating again after a move rounds differently
      const move = (polys) => polys.map((poly) => poly.map((v) => jscad.maths.vec3.transform([0, 0, 0], v, m)));
      if (src.sub) {
        for (const p of src.sub.parts) {
          if (p.role === 'support' && a.kind !== 'plate') continue;
          out.push({ ...p, name: `${id}.${p.name}`, item: id, leaf: `${id}.${p.leaf}`, label: `${id} ${p.label}`,
            geometry: transform(m, p.geometry), polygons: move(p.polygons), triangles: move(p.triangles), m: jscad.maths.mat4.multiply(jscad.maths.mat4.create(), m, p.m) });
        }
      } else {
        for (const p of src.b.parts) {
          if (p.role === 'support' && a.kind !== 'plate') continue; // supports are snipped off before parts go together
          out.push({ name: `${id}.${p.name}`, item: id, leaf: id, object: src.objName, role: src.role === 'reference' ? 'reference' : p.role, label: `${id}: ${p.label}`,
            ...(p.filament ? { filament: p.filament } : {}), ...(p.mirror === false ? { mirror: false } : {}), part: p.name,
            geometry: transform(m, p.geometry), polygons: move(p.polygons), triangles: move(p.triangles),
            shape: `${key}:${p.name}`, hash: `${src.b.hash}:${p.name}`, local: p.polygons, localTriangles: p.triangles, m });
        }
      }
    });
    return out;
  };
  for (const x of a.fits || []) for (const p of x.poses || []) if (!motion.poses[p]) throw new Error(`fit ${x.note || x.label || `${x.a} / ${x.b}`}: no pose "${p}" (poses: ${Object.keys(motion.poses).join(', ') || 'none'})`);
  const pose = opts.pose ?? motion.pose;
  const jv = jointValues(motion, pose);
  parts.push(...partsAt(placeItems(motion, jv)));
  // A fit with * applies to every copy: "key-*.switch.bottom" becomes one fit for key-0-0, key-0-1, …
  // With * on both sides, each copy is checked against all the others: { "a": "key-*.cap", "b": "key-*.cap" }
  for (let x of a.fits || []) {
    if (x.seat != null && x.min == null) x = { ...x, min: -1000 }; // a seat presses, so the pair may overlap
    if (x.holes) x = { ...x, a: x.holes, b: x.into }; // a holes fit: a board's holes (a) over what its screws go into (b)
    const star = [x.a, x.b].find((n) => n.includes('*'));
    if (!star) { fits.push({ ...x, num }); continue; }
    const match = (n) => { const re = new RegExp(`^${n.split('.')[0].replace(/[-]/g, '\\-').replace('*', '([\\w-]+)')}$`); return ids.filter((id) => re.test(id)); };
    const copies = match(star), at = (id, n) => [id, ...n.split('.').slice(1)].join('.');
    if (!copies.length) throw new Error(`fit ${x.a} / ${x.b}: nothing matches ${star}`);
    if (x.a.includes('*') && x.b.includes('*')) {
      const others = match(x.b);
      for (const id of copies) fits.push({ ...x, a: at(id, x.a), b: others.filter((o) => o !== id).map((o) => at(o, x.b)), num });
      continue;
    }
    for (const id of copies) { const swap = (n) => (n === star ? at(id, n) : n); fits.push({ ...x, a: swap(x.a), b: swap(x.b), num }); }
  }
  // at(pose): the same assembly in another pose (a name, or { joint: values }), nothing built again
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const others = {};
  if (!opts.onePose) for (const n of Object.keys(a.poses || {})) if (n !== builtPose && !same(itemSets(n), ownSets)) others[n] = await buildAssembly(ref, stack, outer, { ...opts, pose: n, onePose: true });
  const at = (p) => {
    if (typeof p === 'string' && others[p]) return others[p];
    const v = jointValues(motion, p), moved = partsAt(placeItems(motion, v));
    return { ...s, parts: moved, pose: typeof p === 'string' ? p : null, jointValues: v, polygons: moved.flatMap((x) => x.polygons), triangles: moved.flatMap((x) => x.triangles) };
  };
  const s = { a, project, name, items, parts, objects, fits, requires, values, num, seen, motion, wires, pose: typeof pose === 'string' ? pose : null, jointValues: jv, at,
    polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles) };
  return s;
}

// ---------- joints ----------
// "joints" move items against each other: a joint ties an anchor on its child item to one on its parent, and its
// values (an angle, a distance) move the child from there. A joint's child has no at or rotate: the joint places it.
//   "joints": [{ "id": "hinge", "type": "revolute", "parent": "case.pivot", "child": "lid.pivot", "min": 0, "max": 180,
//                "value": 90, "label": "Lid" }]
// Anchors are named in the object's .json ("anchors": { "pivot": { "at": ["width / 2", 0, "h"], "axis": [1, 0, 0] } },
// expressions over its own variables) and found as <item>.<anchor>, or <item>.<component item>.<anchor> into a
// component. Or written in place, in the assembly's names: { "item": "case", "at": […], "axis": […] } (no item: the
// world). An anchor is a point with axes: z along axis, x towards ref (optional), or turned by rotate as items are.
// At value 0 the two anchors lie together. Types, and what they take (angles in degrees, distances in mm, on z):
//   fixed; revolute (angle); prismatic (distance: a straight rail); cylindrical ([angle, distance]: a pin in a slot);
//   ball ([x, y, z] turns; "cone": how far z may tip); path (distance along "path": [[x, y, z], …], a polyline in the
//   parent anchor's frame: a curved rail, the child's z along it).
// min, max and value are numbers or expressions, one per value ([…] for two or three). "follow": "hinge" gives a joint
// another's values (times "ratio", plus "offset"): the second hinge of a pair, gears. Items joined in a ring (two links
// between the same two parts) can't all be joints: join the ring's last pair with "loops" instead, which the check
// measures in every pose: [{ "a": "link_l.top", "b": "mount_l.axis", "label": "Left pivot lines up" }].
// "poses": { "open": { "hinge": 90 } } names sets of values, "pose" the one shown (default: the first); a pose can set an
// item's variables too ("cocked": { "run": -30, "action.travel": 25 }), so a flexure is drawn bent in that pose and
// straight as printed (each such pose is built on its own; at(pose) returns it); check checks
// every pose, and --sweep moves each joint through its range, looking for parts that collide.
const rows = (m) => [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]]; // JSCAD's mat4 is column-major
const toMat4 = (r) => [r[0], r[4], r[8], 0, r[1], r[5], r[9], 0, r[2], r[6], r[10], 0, r[3], r[7], r[11], 1];
export const LIMITS = { angle: [-180, 180] };
function motionOf(a, placed, num, ref) {
  const { translate, rotate } = jscad.transforms, deg = Math.PI / 180;
  const index = new Map(placed.map(([, c], k) => [c.id, k]));
  const where = (n, what) => { if (!index.has(n)) throw new Error(`${what}: no item "${n}" (items: ${[...index.keys()].join(', ')})`); return index.get(n); };
  const evalIn = (values, label) => (x) => evaluate(x, (n) => {
    let v = values;
    for (const k of n.split('.')) v = v?.[k];
    if (typeof v !== 'number') throw new Error(`${label}: "${n}" isn't one of its numbers`);
    return v;
  });
  const frameOf = (spec, ev) => {
    const at = (spec.at || [0, 0, 0]).map(ev);
    if (spec.rotate) { const m = turn(spec.rotate.map(ev)); m[3] = at[0]; m[7] = at[1]; m[11] = at[2]; return m; }
    return frame(at, (spec.axis || [0, 0, 1]).map(ev), spec.ref && spec.ref.map(ev));
  };
  // An anchor: { item (index, -1 the world), frame (12 numbers, in the item's own frame) }
  const anchor = (spec, what) => {
    if (spec && typeof spec === 'object') return { item: spec.item ? where(spec.item, what) : -1, frame: frameOf(spec, num) };
    const bits = String(spec).split('.'), name = bits.pop(), [id, ...inside] = bits;
    if (!id || !name) throw new Error(`${what}: name an anchor as <item>.<anchor> (got "${spec}")`);
    const k = where(id, what);
    let src = placed[k][1].src, pre = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    for (const n of inside) { // into a component: its item's place there
      const sub = src.sub?.items.find((x) => x.id === n);
      if (!sub) throw new Error(`${what}: ${id} has no item "${n}"`);
      pre = mul(pre, rows(sub.m));
      src = sub.sub ? { sub: sub.sub } : { b: sub.built, objName: sub.objName };
    }
    const anchors = src.b?.object.anchors || {};
    if (!anchors[name]) throw new Error(`${what}: ${src.objName || id} has no anchor "${name}" (anchors: ${Object.keys(anchors).join(', ') || 'none'})`);
    return { item: k, frame: mul(pre, frameOf(anchors[name], evalIn(src.b.values, `${src.objName} anchor ${name}`))) };
  };
  const joints = [], children = new Set();
  for (const j of a.joints || []) {
    const what = `joint ${j.id}`;
    if (!/^[a-z][\w-]*$/.test(j.id || '')) throw new Error(`each joint needs an id (letters, digits, - or _): got ${JSON.stringify(j.id)}`);
    if (!Object.hasOwn(DOFS, j.type)) throw new Error(`${what}: type is one of ${Object.keys(DOFS).join(', ')} (got ${JSON.stringify(j.type)})`);
    const p = j.parent == null ? { item: -1, frame: frame([0, 0, 0]) } : anchor(j.parent, what), c = anchor(j.child, what);
    if (c.item < 0) throw new Error(`${what}: its child must be an item`);
    if (children.has(c.item)) throw new Error(`${what}: ${placed[c.item][1].id} is already placed by another joint (two joints to one item make a ring: use loops)`);
    const [it] = placed[c.item];
    if (it.at || it.rotate || it.repeat) throw new Error(`${what}: ${it.id} is placed by the joint, so it can't have at, rotate or repeat`);
    children.add(c.item);
    const path = j.type === 'path' ? (j.path || []).map((pt) => pt.map(num)) : undefined;
    if (path && path.length < 2) throw new Error(`${what}: a path joint needs "path": two points or more`);
    const kinds = DOFS[j.type], list = (x) => (x == null ? [] : [].concat(x));
    const lo = list(j.min), hi = list(j.max), val = list(j.value);
    const dofs = kinds.map((kind, i) => {
      const range = j.type === 'path' ? [0, pathLength(path)] : kind === 'angle' ? LIMITS.angle : null;
      const mn = lo[i] != null ? num(lo[i]) : range?.[0], mx = hi[i] != null ? num(hi[i]) : range?.[1];
      if (mn == null || mx == null) throw new Error(`${what}: give its ${kind} a min and max`);
      if (mn > mx) throw new Error(`${what}: min ${mn} is above max ${mx}`);
      return [mn, mx, val[i] != null ? num(val[i]) : Math.min(mx, Math.max(mn, 0))];
    });
    joints.push({ id: j.id, type: j.type, parent: p.item, child: c.item, a: p.frame, b: c.frame, dofs,
      ...(j.label ? { label: j.label } : {}), ...(path ? { path } : {}), ...(j.cone != null ? { cone: num(j.cone) } : {}),
      ...(j.follow ? { follow: [j.follow, j.ratio != null ? num(j.ratio) : 1, j.offset != null ? num(j.offset) : 0] } : {}),
      ...(j.mesh ? { meshSpec: j.mesh } : {}), ...(j.brake ? { brake: j.brake } : {}) });
  }
  for (const j of joints) if (j.follow) {
    const l = joints.find((x) => x.id === j.follow[0]);
    if (!l) throw new Error(`joint ${j.id}: follows "${j.follow[0]}", which isn't a joint (${joints.map((x) => x.id).join(', ')})`);
    if (l.dofs.length !== j.dofs.length) throw new Error(`joint ${j.id} (${j.type}) takes ${j.dofs.length} values, but follows ${l.id} (${l.type}), which takes ${l.dofs.length}`);
  }
  const items = placed.map(([it, c], k) => {
    if (children.has(k)) return [c.id];
    const base = (it.at || [0, 0, 0]).map(num), rot = (it.rotate || [0, 0, 0]).map((r) => num(r) * deg);
    // A repeated item turns as a whole about its at: each copy's offset turns with it (keys on a tilted plate)
    return [c.id, ...rows(translate(base, rotate(rot, translate([c.offset[0], c.offset[1], 0], jscad.geometries.geom3.create()))).transforms)];
  });
  const meshes = [...gearMeshes(joints, items, num), ...planetaries(a.planetary || [], joints, items, num)];
  const drives = motorDrives(a, placed, joints, num), loads = loadsOf(a, anchor, num, joints);
  const poses = Object.fromEntries(Object.entries(a.poses || {}).map(([n, set]) => [n, Object.fromEntries(Object.entries(set).filter(([id]) => !id.includes('.')).map(([id, v]) => {
    if (!joints.some((j) => j.id === id)) throw new Error(`pose ${n}: no joint "${id}"`);
    return [id, Array.isArray(v) ? v.map(num) : num(v)];
  }))]));
  if (a.pose && !poses[a.pose]) throw new Error(`pose "${a.pose}" isn't one of the poses (${Object.keys(poses).join(', ') || 'none'})`);
  const loops = (a.loops || []).map((l, i) => ({ label: l.label || `${typeof l.a === 'string' ? l.a : 'anchor'} meets ${typeof l.b === 'string' ? l.b : 'anchor'}`,
    a: anchor(l.a, `loop ${i + 1}`), b: anchor(l.b, `loop ${i + 1}`), tolerance: l.tolerance != null ? num(l.tolerance) : 0.01 }));
  // Every object item's anchors, to say where things are: a finding near one names it (keyboard@pivot)
  const marks = placed.flatMap(([, c], k) => Object.entries(c.src?.b?.object.anchors || {}).map(([name, spec]) => {
    try { return { item: k, id: c.id, name, frame: frameOf(spec, evalIn(c.src.b.values, `${c.src.objName} anchor ${name}`)) }; } catch { return null; }
  })).filter(Boolean);
  return { items, joints, poses, pose: a.pose || Object.keys(poses)[0], loops, ref, marks, meshes, drives, loads, gravity: (a.gravity || [0, 0, -1]).map(num) };
}

// A pair measured from its drawn teeth (@rulecad/gears contact: backlash, transmission error, interference), kept in
// .cache/gears/ by the pair, the centre distance and the gears package's code, as it takes half a second
let gearsCode = null;
function measured(a, b, centre) {
  gearsCode ||= (() => { const dir = path.dirname(fileURLToPath(import.meta.resolve('@rulecad/gears'))); return fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'test.mjs').sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join(''); })();
  const file = paths.cache('gears', `${crypto.createHash('sha256').update(JSON.stringify([gearsCode, a, b, +centre.toFixed(6)])).digest('hex')}.json`);
  if (!process.env.CAD_NO_CACHE && host.exists(file)) return JSON.parse(host.readText(file));
  const r = contact(a, b, { centre, steps: 12 }), keep = { findings: r.findings, backlash: r.backlash, error: r.error };
  try { host.writeText(file, JSON.stringify(keep)); } catch {} // (only slower without it)
  return keep;
}

// A planetary gearbox: "planetary": [{ "sun", "carrier", "ring", "planets": [items], "drive": "sun" | "carrier" | "ring",
// "module", "teeth": [sun, planet, ring] }]. One of the sun, carrier and ring is held (no joint, or a fixed one); the
// one named by drive turns on its joint, and every other moving part (the third, and each planet on the carrier)
// follows it. With one held, each turns in proportion to the driver (Willis), so each is a follow: its ratio from the
// teeth, its offset from where the parts are with their joints at 0, so a tooth sits in a gap everywhere.
function planetaries(list, joints, items, num) {
  const out = [], DEG = Math.PI / 180;
  const col = (W, k) => [W[k], W[4 + k], W[8 + k]], org = (W) => [W[3], W[7], W[11]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crossP = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const flat = (v, z) => sub(v, z.map((x) => x * dot(v, z))), len = (v) => Math.hypot(...v);
  const ang = (v, x0, z) => Math.atan2(dot(crossP(x0, v), z), dot(x0, v)); // radians
  list.forEach((g, n) => {
    const what = `planetary ${n + 1}`, index = (id, role) => { const k = items.findIndex((x) => x[0] === id); if (k < 0) throw new Error(`${what}: ${role} "${id}" isn't an item (${items.map((x) => x[0]).join(', ')})`); return k; };
    const idx = { sun: index(g.sun, 'sun'), carrier: index(g.carrier, 'carrier'), ring: index(g.ring, 'ring') };
    const planets = [].concat(g.planets || []).map((id) => index(id, 'planet'));
    if (!planets.length) throw new Error(`${what}: planets names the planet items`);
    const jointOf = (k) => joints.find((j) => j.child === k), moving = (k) => { const j = jointOf(k); return j && j.type !== 'fixed' ? j : null; };
    const held = ['sun', 'carrier', 'ring'].filter((m) => !moving(idx[m]));
    if (held.length !== 1) throw new Error(`${what}: hold one of the sun, carrier and ring (no joint, or a fixed one), and turn the other two on revolutes (held now: ${held.join(', ') || 'none'})`);
    const drive = g.drive ?? ['carrier', 'sun', 'ring'].find((m) => m !== held[0]);
    if (!['sun', 'carrier', 'ring'].includes(drive) || drive === held[0]) throw new Error(`${what}: drive is the sun, the carrier or the ring, and not the one held (${held[0]})`);
    const third = ['sun', 'carrier', 'ring'].find((m) => m !== held[0] && m !== drive), lead = moving(idx[drive]), follower = moving(idx[third]);
    for (const [m, j] of [[drive, lead], [third, follower]]) if (j.type !== 'revolute') throw new Error(`${what}: the ${m} turns on a revolute (its joint ${j.id} is a ${j.type})`);
    if (follower.follow || follower.meshSpec) throw new Error(`${what}: ${follower.id} turns the ${third}, which follows the ${drive} here: give it no follow or mesh of its own`);
    const planetJoints = planets.map((k) => { const j = jointOf(k); if (!j || j.type !== 'revolute' || j.parent !== idx.carrier) throw new Error(`${what}: planet ${items[k][0]} turns on a revolute on the carrier (${items[idx.carrier][0]})`); return j; });
    const teeth = [].concat(g.teeth || []).map(num);
    if (teeth.length !== 3) throw new Error(`${what}: teeth is [sun, planet, ring] (got ${JSON.stringify(g.teeth)})`);
    const [S, P, R] = teeth, common = { module: num(g.module), ...(g.pressureAngle != null ? { pressureAngle: num(g.pressureAngle) } : {}), ...(g.backlash != null ? { backlash: num(g.backlash) } : {}) };
    let sun, planet, ring;
    try { sun = gearModel({ ...common, teeth: S }); planet = gearModel({ ...common, teeth: P }); ring = internalModel({ ...common, teeth: R }); } catch (e) { throw new Error(`${what}: ${e.message}`); }
    if (R !== S + 2 * P) throw new Error(`${what}: a ring of ${R} isn't the sun and two planets across (${S} + 2 × ${P} = ${S + 2 * P})`);
    // Every part where it is with these joints at 0
    const v = jointValues({ joints, poses: {} }, {});
    for (const j of [lead, follower, ...planetJoints]) v[j.id] = [0];
    const worlds = placeItems({ items, joints }, v), W = (k) => worlds[k];
    const O = org(W(idx.sun)), Z = col(W(idx.sun), 2), X0 = col(W(idx.sun), 0);
    const sign = (j) => Math.sign(dot(mul(j.parent < 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] : worlds[j.parent], j.a).filter((_, i) => [2, 6, 10].includes(i)), Z));
    for (const m of ['carrier', 'ring']) { const c = org(W(idx[m])), z = col(W(idx[m]), 2); if (len(flat(sub(c, O), Z)) > 1e-4 || Math.abs(Math.abs(dot(z, Z)) - 1) > 1e-6) throw new Error(`${what}: the ${m} turns about the sun's axis: centre it there`); }
    const gr = ang(flat(col(W(idx.ring), 0), Z), X0, Z) * (dot(col(W(idx.ring), 2), Z) > 0 ? 1 : -1);
    // planet k: where it sits (its centre's angle round the sun) and which way its first tooth points
    const pl = planets.map((k, i) => { const c = flat(sub(org(W(k)), O), Z); return { id: items[k][0], joint: planetJoints[i], r: len(c), beta: ang(c, X0, Z), gamma: ang(flat(col(W(k), 0), Z), X0, Z), s: sign(planetJoints[i]) }; });
    // One configuration that meshes, everything at its zero: planet 0 in phase with the ring, the sun with planet 0
    const b0 = pl[0].beta, pi0 = (R / P) * (gr - b0 * (1 - P / R) + Math.PI / R), sigma0 = (P / S) * (b0 * (1 + S / P) + Math.PI - Math.PI / P - pi0);
    // Willis on rotations from the zero (sun σ, carrier κ, ring ρ): σ − κ + (R/S)(ρ − κ) = σ0
    const coef = { sun: 1, carrier: -(1 + R / S), ring: R / S };
    const sg = { [drive]: sign(lead), [third]: sign(follower) };
    // the third's rotation for the driver's: from the relation, with the held one still
    const rot = (d) => { const r = { [held[0]]: 0, [drive]: sg[drive] * d }; r[third] = (sigma0 - coef[drive] * r[drive]) / coef[third]; return r; };
    // a straight line in the driver's value (f: degrees in, radians out): [ratio, offset in degrees]
    const lin = (f) => { const a = f(0), b = f(1), o = a / DEG; return [(b - a) / DEG, ((o + 180) % 360 + 360) % 360 - 180]; }; // (the offset a part-turn: a whole turn is the same place)
    const free = (j) => { j.dofs[0] = [-1e6, 1e6, j.dofs[0][2]]; }; // what follows a sun can turn past a turn
    const [k3, o3] = lin((d) => sg[third] * rot(d * DEG)[third]);
    follower.follow = [lead.id, k3, o3]; free(follower);
    const findings = [], f = (level, text, code, between) => findings.push({ level, text, code, ...(between ? { between } : {}) });
    pl.forEach((p, i) => {
      // the planet's first tooth from the sun's mesh: π = −(S/P) σ + β (1 + S/P) + π − π/P, β the planet's place
      const tooth = (d) => { const r = rot(d * DEG), beta = p.beta + r.carrier; return -(S / P) * r.sun + beta * (1 + S / P) + Math.PI - Math.PI / P; };
      const [kp, op] = lin((d) => p.s * (tooth(d) - p.gamma - rot(d * DEG).carrier));
      p.joint.follow = [lead.id, kp, op]; free(p.joint);
      // and with the ring: in phase with it too, or it can't go there
      const ringTooth = (P / R) * tooth(0) + p.beta * (1 - P / R) - Math.PI / R, pitch = (2 * Math.PI) / R;
      const miss = (((ringTooth - gr) % pitch) + pitch * 1.5) % pitch - pitch / 2;
      const centre = org(W(planets[i]));
      if (Math.abs(miss) > 1e-6) f('fail', `planet ${p.id} can't mesh with the sun and the ring at once where it is (${(p.beta / DEG).toFixed(2)}° round the sun): planets go every ${(360 / planets.length).toFixed(2)}°, and (S + R) / planets must be whole (${S + R} / ${planets.length})`, 'planetary.phase', [O, centre]);
      const m = meshOf(sun, planet, { centre: p.r });
      for (const x of m.findings) f(x.level, `sun and ${p.id}: ${x.text}`, x.code, [O, centre]);
      if (i === 0) {
        for (const x of measured({ ...common, teeth: S }, { ...common, teeth: P }, p.r).findings) f(x.level, `sun and ${p.id}: ${x.text}`, x.code, [O, centre]);
        for (const x of measured({ ...common, teeth: P }, { ...common, teeth: R, kind: 'internal' }, p.r).findings) f(x.level, `${p.id} and the ring: ${x.text}`, x.code, [O, centre]);
      }
    });
    const ratioText = `the ${drive} drives the ${third}${held[0] === 'carrier' ? '' : ' and the planets'} (the ${held[0]} held): ${Number(Math.abs(k3).toFixed(4))} turns of the ${third} for each turn of the ${drive}, ${k3 * sg[drive] * sg[third] < 0 ? 'opposite ways' : 'the same way'}`;
    out.push({ joint: follower.id, with: lead.id, kind: 'planetary', text: ratioText, findings, between: [O, O], planetary: true, members: [follower.id, ...planetJoints.map((j) => j.id)] });
    // A second ring, on the planets' second step: it follows the planets' turning as the first ring would
    if (g.output) {
      const k2 = index(g.output.ring, 'output ring'), j2 = moving(k2), P2 = num(g.output.planet), R2 = num(g.output.teeth), oc = { ...common };
      if (!j2 || j2.type !== 'revolute') throw new Error(`${what}: the output ring ${g.output.ring} turns on a revolute`);
      if (j2.follow || j2.meshSpec) throw new Error(`${what}: ${j2.id} follows the planets here: give it no follow or mesh of its own`);
      if (R2 - P2 !== R - P) throw new Error(`${what}: the output ring and the planets' second step must differ as the first do: ${R2} - ${P2} isn't ${R} - ${P}, so one centre distance can't serve both`);
      let p2, r2;
      try { p2 = gearModel({ ...oc, teeth: P2 }); r2 = internalModel({ ...oc, teeth: R2 }); } catch (e) { throw new Error(`${what}: ${e.message}`); }
      const g2 = ang(flat(col(W(k2), 0), Z), X0, Z), s2 = sign(j2), p0 = pl[0], ps = Math.PI / R2;
      const toothAt = (d) => { const r = rot(d * DEG); return -(S / P) * r.sun + (p0.beta + r.carrier) * (1 + S / P) + Math.PI - Math.PI / P; };
      const ring2 = (d) => { const r = rot(d * DEG); return (P2 / R2) * toothAt(d) + (p0.beta + r.carrier) * (1 - P2 / R2) - ps - g2; };
      const [k, o] = lin((d) => s2 * ring2(d));
      j2.follow = [lead.id, k, o]; free(j2);
      const eff = compoundEfficiency({ planet: P, planet2: P2, ring: R, ring2: R2 }), fails = [], ff = (level, text, code) => fails.push({ level, text, code, between: [O, O] });
      for (const x of meshOf(p2, r2, { centre: pl[0].r }).findings) ff(x.level, `${pl[0].id} and the output ring: ${x.text}`, x.code);
      pl.forEach((p, i) => { const t2 = (P2 / R2) * ((-(S / P) * sigma0 + p.beta * (1 + S / P) + Math.PI - Math.PI / P)) + p.beta * (1 - P2 / R2) - ps, pitch2 = (2 * Math.PI) / R2, miss = (((t2 - (P2 / R2) * ((-(S / P) * sigma0 + p0.beta * (1 + S / P) + Math.PI - Math.PI / P)) - p0.beta * (1 - P2 / R2) + ps) % pitch2) + pitch2 * 1.5) % pitch2 - pitch2 / 2; if (Math.abs(miss) > 1e-6) ff('fail', `planet ${p.id} can't mesh with the output ring where it is: every tooth count a multiple of the planets puts them all in phase`, 'planetary.phase'); });
      out.push({ joint: j2.id, with: lead.id, kind: 'planetary', efficiency: eff, text: `the second ring turns ${Number(Math.abs(k).toFixed(5))} of the ${drive}'s turn, ${k * s2 * sg[drive] < 0 ? 'the other way' : 'the same way'} (${Number((1 / Math.abs(k)).toFixed(2))}:1, about ${Math.round(eff * 100)}% efficient, an estimate)`, findings: fails, between: [O, O], planetary: true });
    }
  });
  return out;
}

// Bevel gears: "mesh": { "with": <the other's joint>, "module", "teeth": [its, this one's], "bevel": true } on revolutes
// whose axes meet at the shaft angle, each gear drawn as @rulecad/gears draws one (back end at z = 0, apex up z). The
// cones must share their apex. The ratio is the surface speeds' where the pitch cones touch; the phase puts a tooth
// of one against a space of the other along that line.
function bevelDrive(j, lead, spec, teeth, common, joints, items, num) {
  const what = `joint ${j.id}: mesh`, DEG = Math.PI / 180;
  const col = (W, k) => [W[k], W[4 + k], W[8 + k]], org = (W) => [W[3], W[7], W[11]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => a.map((x, i) => x + b[i]), times = (a, k) => a.map((x) => x * k);
  const crossP = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = (v) => Math.hypot(...v), unit = (v) => times(v, 1 / len(v));
  const ang = (v, x0, z) => Math.atan2(dot(crossP(x0, v), z), dot(x0, v));
  const v = jointValues({ joints, poses: {} }, {}); v[lead.id] = [0]; v[j.id] = [0];
  const worlds = placeItems({ items, joints }, v), W1 = worlds[lead.child], W2 = worlds[j.child];
  const O1 = org(W1), Z1 = col(W1, 2), X1 = col(W1, 0), O2 = org(W2), Z2 = col(W2, 2), X2 = col(W2, 0);
  const shaft = Math.acos(Math.max(-1, Math.min(1, dot(Z1, Z2)))) / DEG;
  let g1, g2;
  try { g1 = bevelModel({ ...common, teeth: teeth[0], mate: teeth[1], shaftAngle: shaft }); g2 = bevelModel({ ...common, teeth: teeth[1], mate: teeth[0], shaftAngle: shaft }); } catch (e) { throw new Error(`${what}: ${e.message}`); }
  // each cone's apex: along its axis, its cone distance × cos δ from its back end
  const A1 = add(O1, times(Z1, g1.coneDistance * Math.cos(g1.pitchAngle * DEG))), A2 = add(O2, times(Z2, g2.coneDistance * Math.cos(g2.pitchAngle * DEG)));
  const findings = [];
  const apart = len(sub(A1, A2));
  if (apart > 0.01) findings.push({ level: 'fail', text: `the cones' apexes are ${Number(apart.toFixed(3))} mm apart: bevel gears mesh only when their cones meet at one point (move one along its axis)`, code: 'mesh.bevel' });
  // where the pitch cones touch: from the apex, δ1 from the first's axis toward the second's (both pointing away)
  const out1 = times(Z1, -1), out2 = times(Z2, -1), across = unit(sub(out2, times(out1, dot(out1, out2))));
  const g = add(times(out1, Math.cos(g1.pitchAngle * DEG)), times(across, Math.sin(g1.pitchAngle * DEG))), P = add(A1, times(g, g1.coneDistance));
  const radial = (Z, X) => { const r = sub(g, times(Z, dot(g, Z))); return ang(r, X, Z); };
  const b1 = radial(Z1, X1), b2 = radial(Z2, X2);
  // the second turns so the surface speeds match where they touch: ω2 = ω1 (Z1 × P)·(Z2 × P) / |Z2 × P|², P from the apex
  const p = sub(P, A1), r = dot(crossP(Z1, p), crossP(Z2, p)) / dot(crossP(Z2, p), crossP(Z2, p));
  const sgn = (jt, Z) => Math.sign(dot(col(mul(jt.parent < 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] : worlds[jt.parent], jt.a), 2), Z));
  const s1 = sgn(lead, Z1), s2 = sgn(j, Z2), z2 = teeth[1];
  const phi = b2 - Math.PI / z2 - r * b1;
  j.follow = [lead.id, s2 * r * s1, (s2 * phi) / DEG];
  const m = bevelMesh({ ...common, teeth: teeth[0], shaftAngle: shaft }, { ...common, teeth: teeth[1], shaftAngle: shaft });
  findings.push(...m.findings);
  return { joint: j.id, with: lead.id, kind: 'bevel', findings, between: [O1, O2], text: `bevel gears at ${Number(shaft.toFixed(2))}°, ${Number((teeth[0] / teeth[1]).toFixed(4))} turns of the second for each of the first (cones of ${Number(g1.pitchAngle.toFixed(2))}° and ${Number(g2.pitchAngle.toFixed(2))}°)` };
}

// A worm and its wheel: "mesh": { "with": <the worm's joint>, "module", "teeth": [starts, wheel's teeth], "worm": {
// "diameter"?, "hand"? } } on the wheel's revolute, the axes crossed. In the wheel's middle plane the worm's thread is a
// rack along the worm's axis, moving a lead a turn: the wheel follows it as a pinion does a rack, its helix's turn at
// that plane taken into account. The worm is drawn as @rulecad/gears draws it (axis up its z, from z = 0).
function wormDrive(j, lead, spec, teeth, common, joints, items, num) {
  const what = `joint ${j.id}: mesh`, DEG = Math.PI / 180;
  const col = (W, k) => [W[k], W[4 + k], W[8 + k]], org = (W) => [W[3], W[7], W[11]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crossP = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = (v) => Math.hypot(...v);
  const ang = (v, x0, z) => Math.atan2(dot(crossP(x0, v), z), dot(x0, v));
  const ws = spec.worm === true ? {} : spec.worm;
  let w, wheel;
  try {
    w = wormModel({ ...common, starts: teeth[0], ...(ws.diameter != null ? { diameter: num(ws.diameter) } : {}), ...(ws.hand ? { hand: ws.hand } : {}) });
    wheel = gearModel({ ...common, teeth: teeth[1], helix: w.leadAngle, hand: w.hand });
  } catch (e) { throw new Error(`${what}: ${e.message}`); }
  const v = jointValues({ joints, poses: {} }, {}); v[lead.id] = [0]; v[j.id] = [0];
  const worlds = placeItems({ items, joints }, v), Ww = worlds[lead.child], W2 = worlds[j.child];
  const Ow = org(Ww), U = col(Ww, 2), Xw = col(Ww, 0), O2 = org(W2), Z2 = col(W2, 2), X2 = col(W2, 0);
  if (Math.abs(dot(U, Z2)) > 1e-6) throw new Error(`${what}: a worm's axis and its wheel's cross at right angles`);
  // the line between the axes: across both (the worm's along U, the wheel's along Z2)
  const rel = sub(O2, Ow), at = dot(rel, U), toWheel = sub(sub(rel, U.map((x) => x * at)), Z2.map((x) => x * dot(rel, Z2))), dist = len(toWheel), Y = toWheel.map((x) => x / dist), Zr = crossP(U, Y);
  const sense = w.hand === 'left' ? -1 : 1, sw = Math.sign(dot(col(mul(lead.parent < 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] : worlds[lead.parent], lead.a), 2), U));
  const s2 = Math.sign(dot(Z2, Zr)), tw = ang(Y, Xw, U), g2 = ang(X2, U, Zr) * 1, r2 = wheel.pitch / 2;
  // the wheel's helix: its tooth 0 at the worm's plane is turned by k z there
  const zMid = dot(sub(Ow, O2), Z2), k = (sense * Math.tan(w.leadAngle * DEG)) / r2;
  const phr = rackPhase(wheel, at), L = w.lead;
  // space centres of the thread, at the wheel, sit at z0 = sense L (tw − θw) / 2π along the worm; the wheel turns as on a rack
  const theta = (dw) => { const z0 = (sense * L * (tw - sw * dw * DEG)) / (2 * Math.PI); return s2 * ((z0 - phr) / r2 - g2) - k * zMid; };
  const a0 = theta(0), a1 = theta(1);
  j.follow = [lead.id, (a1 - a0) / DEG, a0 / DEG];
  const m = wormMesh({ ...common, starts: teeth[0], ...(ws.diameter != null ? { diameter: num(ws.diameter) } : {}), ...(ws.hand ? { hand: ws.hand } : {}) }, { teeth: teeth[1] });
  const c = meshOf(wheel, rackModel({ ...common, teeth: 4 }), { centre: dist - w.pitch / 2 });
  const findings = [...m.findings, ...c.findings.filter((x) => x.code === 'mesh.centre').map((x) => ({ ...x, text: x.text.replace("centre to the rack's pitch line", "the wheel's centre to the worm's pitch cylinder") }))];
  return { joint: j.id, with: lead.id, kind: 'worm', worm: m, findings, between: [Ow.map((x, i) => x + U[i] * at), O2], text: `a worm of ${teeth[0]} start${teeth[0] > 1 ? 's' : ''}, ${Number((teeth[1] / teeth[0]).toFixed(3))} turns of the worm for one of the wheel` };
}

// Gears that mesh: "mesh": { "with": <the driving joint>, "module", "teeth": [its, this one's], "shift"?, "ring"? } on
// a revolute (a gear, or a ring with "ring": true) or a prismatic (a rack). It becomes a follow: the ratio from the
// teeth, and the offset that puts a tooth in a gap, read from where the two gears are with their joints at 0. Each
// gear is drawn as @rulecad/gears draws it (its axis up its own z, its first tooth on +x; a rack along its x, teeth up
// +y, its first space at x = 0), and its joint turns it about its own axis. The centre distance is checked here, the
// rest of the meshing by --sweep.
function gearMeshes(joints, items, num) {
  const out = [], list = (x) => (x == null ? [] : [].concat(x));
  const col = (W, k) => [W[k], W[4 + k], W[8 + k]], org = (W) => [W[3], W[7], W[11]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crossP = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const along = (v, axis) => sub(v, axis.map((x) => x * dot(v, axis))), len = (v) => Math.hypot(...v);
  const angleIn = (v, x0, z) => Math.atan2(dot(crossP(x0, v), z), dot(x0, v)) / (Math.PI / 180); // v's angle from x0 about z, degrees
  // Is an item held still relative to another: every joint between it and the world fixed (or no joint at all)?
  const byChild = new Map(joints.map((j) => [j.child, j]));
  const still = (i) => { for (let k = i, n = 0; k >= 0 && n < 99; n++) { const j = byChild.get(k); if (!j) return true; if (j.type !== 'fixed') return false; k = j.parent; } return true; };
  for (const j of joints) {
    if (!j.meshSpec) continue;
    const spec = j.meshSpec, what = `joint ${j.id}: mesh`;
    delete j.meshSpec;
    if (j.follow) throw new Error(`${what}: a meshed joint follows its mate already: give mesh or follow, not both`);
    const lead = joints.find((x) => x.id === spec.with);
    if (!lead) throw new Error(`${what}: "with" names the driving joint (${joints.filter((x) => x !== j).map((x) => x.id).join(', ')}; got ${JSON.stringify(spec.with)})`);
    if (lead.type !== 'revolute') throw new Error(`${what}: ${lead.id} is a ${lead.type}; the driver is a gear turning on a revolute`);
    if (j.type !== 'revolute' && j.type !== 'prismatic') throw new Error(`${what}: a gear turns on a revolute, a rack slides on a prismatic (this is a ${j.type})`);
    const kind = spec.bevel ? 'bevel' : spec.worm ? 'worm' : j.type === 'prismatic' ? 'rack' : spec.ring ? 'internal' : 'external';
    if (!(lead.parent === j.parent || (still(lead.parent) && still(j.parent)))) throw new Error(`${what}: ${lead.id} and ${j.id} turn on parts that move apart (a planet on a carrier): a mesh needs both on one part, or both on parts held still`);
    const teeth = list(spec.teeth).map(num), shift = list(spec.shift ?? [0, 0]).map(num);
    if (teeth.length !== 2) throw new Error(`${what}: teeth is [the driver's, this one's] (got ${JSON.stringify(spec.teeth)})`);
    const common = { module: num(spec.module), ...(spec.pressureAngle != null ? { pressureAngle: num(spec.pressureAngle) } : {}), ...(spec.backlash != null ? { backlash: num(spec.backlash) } : {}) };
    if (kind === 'worm') { out.push(wormDrive(j, lead, spec, teeth, common, joints, items, num)); continue; }
    if (kind === 'bevel') { out.push(bevelDrive(j, lead, spec, teeth, common, joints, items, num)); continue; }
    let A, B;
    try {
      A = gearModel({ ...common, teeth: teeth[0], shift: shift[0] });
      B = kind === 'rack' ? rackModel({ ...common, teeth: teeth[1] }) : (kind === 'internal' ? internalModel : gearModel)({ ...common, teeth: teeth[1], shift: shift[1] ?? 0 });
    } catch (e) { throw new Error(`${what}: ${e.message}`); }
    // Where the two gears are with their own joints at 0 (everything else as it stands by default)
    const v = jointValues({ joints: joints.map((x) => (x.meshSpec ? { ...x, meshSpec: undefined } : x)), poses: {} }, {});
    v[lead.id] = [0]; v[j.id] = [0];
    const worlds = placeItems({ items, joints }, v), W1 = worlds[lead.child], W2 = worlds[j.child];
    const axisOf = (jt) => { const P = mul(jt.parent < 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] : worlds[jt.parent], jt.a); return { at: org(P), dir: col(P, 2) }; };
    const O1 = org(W1), X1 = col(W1, 0), Z1 = col(W1, 2), ax1 = axisOf(lead);
    // the driver turns about its own centre and axis, or its teeth wander
    if (Math.abs(Math.abs(dot(ax1.dir, Z1)) - 1) > 1e-6 || len(along(sub(O1, ax1.at), ax1.dir)) > 1e-4) throw new Error(`${what}: ${lead.id} doesn't turn its gear about the gear's own centre and axis: anchor the gear's joint at its centre, along its axis`);
    const result = { joint: j.id, with: lead.id, kind, findings: [], between: null };
    if (kind === 'rack') {
      const R0 = org(W2), U = col(W2, 0), Y = col(W2, 1), Zr = col(W2, 2), ax2 = axisOf(j);
      const sTravel = Math.sign(dot(ax2.dir, U));
      if (Math.abs(Math.abs(dot(ax2.dir, U)) - 1) > 1e-6) throw new Error(`${what}: ${j.id} doesn't slide the rack along its length (the rack's x)`);
      if (Math.abs(Math.abs(dot(Z1, Zr)) - 1) > 1e-6) throw new Error(`${what}: the pinion's axis isn't across the rack (along the rack's z)`);
      const s1 = Math.sign(dot(Z1, Zr)), rel = sub(O1, R0), at = dot(rel, U), height = dot(rel, Y);
      const k = (Math.PI * A.pitch) / 360, g1 = angleIn(along(X1, Zr), U, Zr);
      j.follow = [lead.id, sTravel * s1 * k, sTravel * (k * g1 + rackPhase(A, at))];
      const m = meshOf(A, B, { centre: height });
      result.findings = [...m.findings, ...measured({ ...common, teeth: teeth[0], shift: shift[0] }, { ...common, teeth: teeth[1], kind: 'rack' }, height).findings]; result.between = [O1, [R0[0] + at * U[0], R0[1] + at * U[1], R0[2] + at * U[2]]]; result.text = m.text;
    } else {
      const O2 = org(W2), X2 = col(W2, 0), Z2 = col(W2, 2), ax2 = axisOf(j);
      if (Math.abs(Math.abs(dot(ax2.dir, Z2)) - 1) > 1e-6 || len(along(sub(O2, ax2.at), ax2.dir)) > 1e-4) throw new Error(`${what}: ${j.id} doesn't turn its gear about the gear's own centre and axis: anchor the gear's joint at its centre, along its axis`);
      if (Math.abs(Math.abs(dot(Z1, Z2)) - 1) > 1e-6) throw new Error(`${what}: ${lead.id} and ${j.id} turn about axes that aren't parallel (spur gears need parallel axes)`);
      const s = Math.sign(dot(Z1, Z2)), d = along(sub(O2, O1), Z1), beta = angleIn(d, X1, Z1), g2 = angleIn(along(X2, Z1), X1, Z1);
      const m = meshOf(A, B, { centre: len(d) });
      m.findings.push(...measured({ ...common, teeth: teeth[0], shift: shift[0] }, { ...common, teeth: teeth[1], shift: shift[1] ?? 0, kind }, len(d)).findings);
      // b's angle in the driver's frame is ratio × a's + phase; its joint measures about its own z (the other way when flipped)
      j.follow = [lead.id, s * m.ratio, s * (phase(A, B, beta) - g2)];
      result.findings = m.findings; result.between = [O1, O2]; result.text = m.text;
    }
    out.push(result);
  }
  return out;
}

// Where each item's anchors are in a pose: [{ id: 'keyboard@pivot', item, at: [x, y, z] }]
export function anchorsAt(s, values = s.jointValues) {
  const worlds = placeItems(s.motion, values);
  return (s.motion.marks || []).map((m) => { const w = mul(worlds[m.item], m.frame); return { id: `${m.id}@${m.name}`, item: m.id, at: [w[3], w[7], w[11]] }; });
}

// keyCentres(layout): each key's centre, from lib/layout.mjs (kept under this name for older callers)
export { keyCentres };
export const wiresFor = (s) => wireRows(s, { placeItems, jointValues, mul });

// ---------- checks ----------
export { closest };

// How much two parts overlap (mm³), from JSCAD's intersection.
export function overlap(ga, gb) {
  const fell = solid?.stats.fallbacks ?? 0;
  const v = Math.abs(jscad.measurements.measureVolume((solid ? solid.intersect : jscad.booleans.intersect)(ga, gb)));
  if (v < 1e-6) return 0;
  // JSCAD's answer (no Manifold, or a shape Manifold couldn't read): only if their surfaces really cross, which fit
  // says exactly (slower, so only here)
  if (!solid || solid.stats.fallbacks > fell) { const faces = (g) => jscad.geometries.geom3.toPolygons(g).map((q) => q.vertices); if (!overlapAt(faces(ga), faces(gb))) return 0; }
  return v;
}
// How overlaps are measured: whether the surfaces cross, exactly (fit), and then how much, with Manifold where it's
// installed. JSCAD's intersection misreads faces that come near without touching: two gears 0.07 mm apart (their
// backlash) read as 2.7 mm³ into each other at one angle in twenty, and a planet 0.4 mm over a case as 1.3 mm³.
// Manifold is exact; a shape it can't read as a closed solid falls back to JSCAD's for that pair.
let solid = null, tried = false;
async function measurer() {
  if (tried) return; tried = true;
  try { solid = await booleans('manifold'); } catch { solid = null; } // (without manifold-3d, JSCAD's, as before)
}

// Overlaps between placed parts, remembered across runs (.cache/overlaps.json): a part is its build (the build cache's
// hash: everything it's made from) and where it's placed, so after an edit only the pairs it touches are measured again
const OVERLAPS = paths.cache('overlaps.json');
let remembered = null, fresh = 0;
function pairOverlap(pa, pb) {
  if (!pa.hash || !pb.hash) return overlap(pa.geometry, pb.geometry);
  remembered ||= (() => { try { return JSON.parse(host.readText(OVERLAPS)); } catch { return {}; } })();
  const at = (p) => `${p.hash}@${Array.from(p.m || []).map((x) => Math.round(x * 1e6) / 1e6).join(',')}`;
  const [x, y] = [at(pa), at(pb)].sort(), k = crypto.createHash('sha1').update(`crossing+${solid ? 'manifold' : 'jscad'}|${x}|${y}`).digest('hex');
  if (!(k in remembered)) { remembered[k] = overlap(pa.geometry, pb.geometry); fresh++; }
  return remembered[k];
}
function saveOverlaps() {
  if (!fresh) return;
  try { host.writeText(OVERLAPS, JSON.stringify(remembered)); fresh = 0; } catch {} // only slower without it
}

// checkAssembly(built) -> findings, as @rulecad/printcheck: { level, text, card? } (card: a short line for the mirror)
// What a project prints in, for the motors' heat and press-fit checks
const materialOf = (project) => { try { return readJson(path.join(paths.project(project), 'project.json')).material; } catch { return null; } };

export function checkAssembly(s) {
  const out = [], f = (level, text, card, extra) => out.push({ level, text, ...(card && { card }), ...extra }), mm = (n) => `${Number(n.toFixed(3))}`;
  // Versions: every pin, from this assembly and its components, against every copy of that object
  const pins = new Map();
  for (const r of s.requires) pins.set(`${r.object} ${r.range}`, r);
  for (const { object, range } of pins.values()) {
    const copies = s.objects.filter((o) => o.objName === object);
    if (!copies.length) { f('fail', `requires ${object} ${range}, but nothing uses it`, null, { code: 'requires.unused', refs: { object, range } }); continue; }
    const bad = copies.filter((o) => !satisfies(o.version, range));
    f(bad.length ? 'fail' : 'pass', bad.length ? `${object} ${bad[0].version} doesn't meet ${range} (${bad.map((o) => o.id).join(', ')})`
      : `${object} ${copies[0].version} meets ${range}${copies.length > 1 ? ` (${copies.length} copies)` : ''}`, null, { code: 'requires.version', refs: { object, range, items: bad.map((o) => o.id) } });
  }
  // Overlaps between object instances, inside components too. Bounding boxes first: most pairs can't touch.
  const named = (p, n) => p.name === n || p.leaf === n || p.item === n || p.name.startsWith(`${n}.`);
  const allowed = (a, b) => s.fits.some((x) => x.min != null && x.num(x.min) < 0 && ((named(a, x.a) && named(b, x.b)) || (named(a, x.b) && named(b, x.a))));
  const box = new Map(), bx = (p) => box.get(p) || (box.set(p, bounds(p.triangles)), box.get(p));
  const touch = (a, b) => [0, 1, 2].every((k) => bx(a).lo[k] <= bx(b).hi[k] + 1e-6 && bx(b).lo[k] <= bx(a).hi[k] + 1e-6);
  const clashes = [];
  for (let i = 0; i < s.parts.length; i++) for (let j = i + 1; j < s.parts.length; j++) {
    const pa = s.parts[i], pb = s.parts[j];
    if (pa.leaf === pb.leaf || !touch(pa, pb) || allowed(pa, pb)) continue;
    const v = pairOverlap(pa, pb);
    if (v > 0.01) clashes.push({ text: `${pa.name} and ${pb.name} overlap by ${mm(v)} mm³`, a: pa.name, b: pb.name, volume: v });
  }
  if (clashes.length) f('fail', clashes.slice(0, 5).map((c) => c.text).join('; ') + (clashes.length > 5 ? `; and ${clashes.length - 5} more` : ''), `${clashes.length} overlaps`,
    { code: 'overlap', values: { count: clashes.length }, refs: { overlaps: clashes.map(({ a, b, volume }) => ({ a, b, volume })) } });
  else f('pass', `no parts overlap (${new Set(s.parts.map((p) => p.leaf)).size} object instances)`, 'No parts overlap', { code: 'overlap', values: { count: 0 } });
  // Fits: the closest gap between two named things, against a range. Copies of one fit are reported together, worst first.
  // A fit names parts (keyboard, key-0-0.cap), or the faces of an item near one of its anchors (keyboard@pivot, within
  // "within" mm, 10 by default): the pocket round a pivot, not the whole case
  const marks = anchorsAt(s), within = (x) => (x.within != null ? x.num(x.within) : 10);
  const near = (p, mark, r) => ({ ...p, polygons: p.polygons.filter((f) => distanceToFace(mark.at, f) <= r) });
  const pickIn = (n, x) => {
    if (Array.isArray(n)) return n.flatMap((m) => pickIn(m, x));
    if (!n.includes('@')) return s.parts.filter((p) => named(p, n));
    const mark = marks.find((m) => m.id === n);
    if (!mark) return [];
    return s.parts.filter((p) => named(p, mark.item)).map((p) => near(p, mark, within(x))).filter((p) => p.polygons.length);
  };
  const pick = (n) => pickIn(n, {});
  const groups = new Map();
  for (const x of s.fits) {
    if (x.poses && !x.poses.includes(s.pose)) continue; // a fit for some poses only: the folded screen over the keys
    if (x.holes) { holesFit(x); continue; }
    if (x.silent) continue; // lets a pair overlap, and has nothing to report
    if (x.engage != null) { engageFit(x); continue; }
    if (x.seat != null) { seatFit(x, s, f, { placeItems, jointValues, mul, seatSize }); continue; }
    if (x.shaft != null) { shaftFit(x, s, f, { placeItems, jointValues, mul, materialName: materialOf(s.project) }); continue; }
    const A = pickIn(x.a, x), key = x.note || `${x.a} / ${x.b}`;
    const lo = x.min != null ? x.num(x.min) : -Infinity, hi = x.max != null ? x.num(x.max) : Infinity;
    const reach = Math.max(2, ...[lo, hi].filter(Number.isFinite)) + 1; // look past the range, so a gap near it is measured
    let B = pickIn(x.b, x);
    if (Array.isArray(x.b) && A.length) { // against many others: only those within reach
      const lo3 = [0, 1, 2].map((k) => Math.min(...A.map((p) => bx(p).lo[k]))), hi3 = [0, 1, 2].map((k) => Math.max(...A.map((p) => bx(p).hi[k])));
      B = B.filter((p) => [0, 1, 2].every((k) => bx(p).lo[k] <= hi3[k] + reach && lo3[k] <= bx(p).hi[k] + reach));
    }
    if (!A.length || (!B.length && !Array.isArray(x.b))) { f('fail', `fit ${x.a} / ${x.b}: no such ${A.length ? x.b : x.a}`, null, { code: 'fit.missing', refs: { a: x.a, b: x.b, missing: A.length ? x.b : x.a } }); continue; }
    const vol = A.reduce((t, pa) => t + B.reduce((u, pb) => u + (touch(pa, pb) ? pairOverlap(pa, pb) : 0), 0), 0);
    const near = !B.length || vol > 0.01 ? null : closestAt(A.flatMap((p) => p.polygons), B.flatMap((p) => p.polygons), reach);
    const gap = !B.length ? Infinity : vol > 0.01 ? -vol : near.gap; // negative: overlap, mm³
    const ok = vol > 0.01 ? lo < 0 : gap >= lo && gap <= hi;
    if (!groups.has(key)) groups.set(key, { x, lo, hi, results: [] });
    groups.get(key).results.push({ ok, gap, id: x.a, at: near?.at || null });
  }
  // The anchor nearest a point, if one is within 20 mm: where to look
  const nearest = (pt) => {
    if (!pt || !marks.length) return {};
    const m = marks.map((k) => ({ k, d: Math.hypot(k.at[0] - pt[0], k.at[1] - pt[1], k.at[2] - pt[2]) })).sort((a, b) => a.d - b.d)[0];
    return m.d <= 20 ? { near: m.k.id, distance: Number(m.d.toFixed(2)) } : {};
  };
  for (const [key, { x, lo, hi, results }] of groups) {
    const worst = results.reduce((w, r) => (!r.ok && w.ok ? r : r.ok === w.ok && r.gap < w.gap ? r : w), results[0]);
    const say = (g) => (g < 0 ? `press fit, ${mm(-g)} mm³ overlap` : g === Infinity ? 'not near each other' : `closest gap ${mm(g)} mm`);
    const n = results.length > 1 ? ` (${results.filter((r) => r.ok).length} of ${results.length} in range)` : '';
    const label = (x.label || x.a).replace(/ \(.*\)$/, '');
    const where = nearest(worst.at);
    f(worst.ok ? 'pass' : 'warn', `${key}: ${say(worst.gap)}${n}${worst.ok ? '' : `, wanted ${lo === -Infinity ? '' : `${mm(lo)} `}to ${hi === Infinity ? 'any' : mm(hi)} mm (${results.filter((r) => !r.ok).map((r) => r.id).join(', ')})${where.near ? `, ${where.distance} mm from ${where.near}` : ''}`}`,
      `${label}: ${worst.gap < 0 ? `press fit ${mm(-worst.gap)} mm³` : worst.gap === Infinity ? 'apart' : `gap ${Number(worst.gap.toFixed(2))} mm`}${worst.ok ? '' : ' (out of range)'}`,
      { code: 'fit', values: { ...(worst.gap < 0 ? { overlap: -worst.gap } : { gap: worst.gap }), min: lo, max: hi, inRange: results.filter((r) => r.ok).length, copies: results.length },
        refs: { a: x.a, b: x.b, label: x.label, ...(s.pose ? { pose: s.pose } : {}), outOfRange: results.filter((r) => !r.ok).map((r) => r.id), ...where }, ...(worst.at ? { at: { lo: worst.at, hi: worst.at } } : {}) });
  }
  // Engage fits: a part slid onto a shaft, a pin or a peg goes onto it, not just against its end. Along the axis of the
  // joint between them, each part's material near the axis (within radius, 10 mm) spans a stretch; how far the two
  // stretches overlap is how far one is on the other. An arm resting on a shaft's end touches it face to face, as a
  // seated one does, and nothing overlaps either way: only this tells them apart.
  function engageFit(x) {
    const top = (n) => String(n).split(/[.@]/)[0], ids = s.motion?.items.map((i) => i[0]) || [], a = top(x.a), b = top(x.b), label = x.note || `${x.a} onto ${x.b}`;
    const j = (s.motion?.joints || []).find((jt) => { const pair = [ids[jt.child], jt.parent < 0 ? null : ids[jt.parent]]; return pair.includes(a) && pair.includes(b); });
    if (!j) return f('fail', `${label}: no joint between ${a} and ${b} to measure along (engage measures along the joint that holds one on the other)`, null, { code: 'fit.engage', refs: { a: x.a, b: x.b } });
    const worlds = placeItems(s.motion, s.jointValues), P = mul(j.parent < 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] : worlds[j.parent], j.a);
    const O = [P[3], P[7], P[11]], Z = [P[2], P[6], P[10]], r = x.radius != null ? x.num(x.radius) : 10, need = x.num(x.engage);
    const span = (parts) => {
      let lo = Infinity, hi = -Infinity;
      for (const p of parts) for (const t of p.triangles) for (const v of t) {
        const d = [v[0] - O[0], v[1] - O[1], v[2] - O[2]], along = d[0] * Z[0] + d[1] * Z[1] + d[2] * Z[2];
        if (Math.hypot(d[0] - along * Z[0], d[1] - along * Z[1], d[2] - along * Z[2]) <= r) { lo = Math.min(lo, along); hi = Math.max(hi, along); }
      }
      return [lo, hi];
    };
    const [la, ha] = span(pickIn(x.a, x)), [lb, hb] = span(pickIn(x.b, x)), on = Math.max(0, Math.min(ha, hb) - Math.max(la, lb));
    const ok = on >= need - 1e-3; // (flush is on: a hair under, in the floating point, is not short)
    f(ok ? 'pass' : 'fail', `${label}: ${on > 1e-3 ? `${mm(on)} mm on` : `not on at all (${Math.max(la, lb) - Math.min(ha, hb) < 1e-3 ? 'end to end' : 'apart'})`} along their joint${ok ? '' : `, where it should go ${mm(need)} mm on: its anchor is on the wrong face, or the shaft too short`}`, ok ? null : `${a}: not on ${b}`, { code: 'fit.engage', values: { engaged: on, need }, refs: { a: x.a, b: x.b, joint: j.id } });
  }

  // Holes fits: each mounting hole's screw path, clear into a hole, with material round it
  function holesFit(x) {
    const A = pick(x.a), B = pick(x.b), label = x.label || `${x.a} into ${x.b}`;
    const board = A.length && s.objects.find((o) => o.id === A[0].leaf)?.built;
    if (!board?.circuit) return f('fail', `${label}: ${x.a} isn't a circuit board, so it has no mounting holes to follow`);
    if (!B.length) return f('fail', `${label}: no such ${x.b}`);
    const holes = board.circuit.filter((e) => e.type === 'pcb_hole' && !e.pcb_component_id);
    if (!holes.length) return f('fail', `${label}: ${x.a} has no mounting holes`);
    const depth = x.num(x.depth), down = x.direction === 'up' ? 1 : -1, faces = B.flatMap((p) => p.triangles);
    const base = down < 0 ? 0 : board.values.thickness ?? 0, at = (h, dx, dy, t) => jscad.maths.vec3.transform([0, 0, 0], [h.x + dx, h.y + dy, base + down * t], A[0].m);
    const steps = 8, misses = [];
    for (const h of holes) {
      const ring = x.ring != null ? x.num(x.ring) : h.hole_diameter, where = `hole at ${mm(h.x)}, ${mm(h.y)} mm`;
      const blocked = Array.from({ length: steps }, (_, i) => (depth * (i + 0.5)) / steps).find((t) => inside(at(h, 0, 0, t), faces));
      if (blocked != null) { misses.push(`${where}: solid ${mm(blocked)} mm along the screw's path`); continue; }
      const round = Array.from({ length: steps }, (_, i) => (2 * Math.PI * i) / steps).filter((a) => !inside(at(h, ring * Math.cos(a), ring * Math.sin(a), depth / 2), faces));
      if (round.length) misses.push(`${where}: no material ${mm(ring)} mm from the screw on ${round.length} of ${steps} sides`);
    }
    f(misses.length ? 'fail' : 'pass', misses.length ? `${label}: ${misses.join('; ')}` : `${label}: ${holes.length} of ${holes.length} holes clear for ${mm(depth)} mm, with material around each`,
      `${label}: ${misses.length ? `${misses.length} of ${holes.length} miss` : `${holes.length} of ${holes.length} line up`}`,
      { code: 'fit.holes', values: { holes: holes.length, missed: misses.length }, refs: { a: x.a, b: x.b, misses } });
  }
  // Joints: every value in its range (a ball's tip within its cone), and every loop closed
  if (s.motion?.joints.length) {
    const outside = [];
    for (const j of s.motion.joints) {
      const v = s.jointValues[j.id];
      j.dofs.forEach(([lo, hi], i) => { if (v[i] < lo - 1e-9 || v[i] > hi + 1e-9) outside.push(`${j.id} ${mm(v[i])} (${mm(lo)} to ${mm(hi)})`); });
      if (j.cone != null) { const tip = Math.acos(Math.min(1, jointMatrix(j, v)[10])) / (Math.PI / 180); if (tip > j.cone + 1e-9) outside.push(`${j.id} tips ${mm(tip)}° (cone ${mm(j.cone)}°)`); }
    }
    if (outside.length) f('fail', `joints out of range: ${outside.join(', ')}`, `${outside.length} joints out of range`, { code: 'joint.range', refs: { joints: outside } });
    for (const l of loopGaps(s)) f(l.ok ? 'pass' : 'fail', `${l.label}: ${l.ok ? 'closed' : 'apart'} (${mm(l.gap)} mm, axes ${mm(l.angle)}° apart)`, `${l.label}: ${l.ok ? 'closed' : 'apart'}`, { code: 'loop', values: { gap: l.gap, angle: l.angle }, refs: { label: l.label } });
    // Held by something: in a mechanism, every part but the first either turns or slides on a joint, or is fastened,
    // through a chain of fits with "fastens", to the first. A part only placed somewhere stays there in the model and
    // nowhere else: a ring gear resting on its case turns with the planets; a pawl resting on its post walks off it.
    if (s.motion.joints.some((j) => j.type !== 'fixed')) {
      const ids = s.motion.items.map((x) => x[0]), top = (n) => String(n).split(/[.@]/)[0];
      const held = new Set([ids[0], ...s.motion.joints.map((j) => ids[j.child])]), links = s.fits.filter((x) => x.fastens).map((x) => [top(x.a), top(x.b)]);
      for (let grew = true; grew;) { grew = false; for (const [a, b] of links) { if (held.has(a) && !held.has(b)) { held.add(b); grew = true; } if (held.has(b) && !held.has(a)) { held.add(a); grew = true; } } }
      const placed = new Set(s.objects.filter((o) => !o.unplaced && o.role !== 'reference').map((o) => top(o.id)));
      const loose = ids.filter((id) => !held.has(id) && placed.has(id));
      if (loose.length) f('warn', `${loose.join(', ')} ${loose.length > 1 ? 'are' : 'is'} placed, but nothing holds ${loose.length > 1 ? 'them' : 'it'}: give ${loose.length > 1 ? 'each' : 'it'} a joint, or fasten it to what it sits on (pins, screws, a press) and say so with a fit that "fastens"`, `${loose.length} loose`, { code: 'assembly.loose', refs: { items: loose } });
      else f('pass', `every part turns or slides on a joint, or is fastened to the ${ids[0]}`, null, { code: 'assembly.held' });
    }
    // Gears: each mesh's centre distance and contact ratio, said between the two axes (the rest by --sweep)
    for (const g of s.motion.meshes || []) {
      f('info', g.planetary ? g.text : `${g.with} drives ${g.joint}: ${g.text}`, null, { code: 'mesh.ratio', refs: { joints: [g.with, g.joint] } });
      for (const x of g.findings) {
        const between = x.between || g.between, mid = between[0].map((v, k) => (v + between[1][k]) / 2);
        f(x.level, g.planetary ? x.text : `${g.with} and ${g.joint}: ${x.text}`, x.level === 'pass' ? null : `${g.joint}: ${x.code.split('.')[1]}`, { code: x.code, at: mid, between, ...(x.values ? { values: x.values } : {}), refs: { joints: [g.with, g.joint] } });
      }
    }
  }
  boughtFindings(s, f);
  runningChecks(s, f, { axisOf, placeItems, jointValues, mul });
  if (s.wires?.length) wireChecks(s, f, { placeItems, jointValues, mul });
  motorChecks(s, f, { placeItems, jointValues, mul }, materialOf(s.project));
  // Plates print everything: no references
  if (s.a.kind === 'plate') {
    const refs = s.objects.filter((o) => o.role === 'reference' && !o.unplaced); // an unplaced item only lends its numbers
    if (refs.length) f('fail', `a plate can't print references: ${refs.map((o) => o.id).join(', ')}`, null, { code: 'plate.reference', refs: { items: refs.map((o) => o.id) } });
  }
  // Rules that are only estimates, anywhere in the assembly or its components
  const est = new Set();
  for (const o of s.objects) for (const e of o.built.entries) if (e.kind === 'estimate' && (e.used || !e.name.includes('.'))) est.add(e.name);
  for (const n of s.seen) { const [u, k] = n.split('.'); if (loadRuleSet(u).rules[k]?.kind === 'estimate') est.add(n); }
  if (est.size) f('warn', `uses estimates, not measurements: ${[...est].join(', ')}. Measure each and settle it with cad measured ${s.project}/${s.name} <name>=<value>`, `Estimate: ${[...est].join(', ')}`, { code: 'rules.estimate', refs: { rules: [...est] } });
  saveOverlaps();
  return out;
}

// Each loop at the assembly's pose: how far apart its two anchors are (mm), and their axes (degrees, either way round)
export function loopGaps(s) {
  const worlds = placeItems(s.motion, s.jointValues), I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  return s.motion.loops.map((l) => {
    const A = mul(l.a.item < 0 ? I : worlds[l.a.item], l.a.frame), B = mul(l.b.item < 0 ? I : worlds[l.b.item], l.b.frame);
    const gap = Math.hypot(A[3] - B[3], A[7] - B[7], A[11] - B[11]), dot = Math.abs(A[2] * B[2] + A[6] * B[6] + A[10] * B[10]);
    const angle = Math.acos(Math.min(1, dot)) / (Math.PI / 180);
    return { label: l.label, gap, angle, ok: gap <= l.tolerance && angle <= 0.05 };
  });
}

// Pairs of parts that overlap, as checkAssembly finds them (fits with a negative min allowed): [[a, b, mm³]]
function clashesOf(s, named) {
  const allowed = (a, b) => s.fits.some((x) => x.min != null && x.num(x.min) < 0 && ((named(a, x.a) && named(b, x.b)) || (named(a, x.b) && named(b, x.a))));
  const boxes = s.parts.map((p) => bounds(p.triangles)), out = [];
  for (let i = 0; i < s.parts.length; i++) for (let j = i + 1; j < s.parts.length; j++) {
    const pa = s.parts[i], pb = s.parts[j], A = boxes[i], B = boxes[j];
    if (pa.leaf === pb.leaf || ![0, 1, 2].every((k) => A.lo[k] <= B.hi[k] + 1e-6 && B.lo[k] <= A.hi[k] + 1e-6) || allowed(pa, pb)) continue;
    const v = pairOverlap(pa, pb);
    if (v > 0.01) out.push([pa.name, pb.name, v]);
  }
  return out;
}
const isNamed = (p, n) => p.name === n || p.leaf === n || p.item === n || p.name.startsWith(`${n}.`);

// sweep(s, { joint, steps }) -> findings: each free joint (or the one named) moved through its range, the others held
// at the assembly's pose, looking for parts that collide and loops that come apart on the way
export function sweep(s, { joint, steps = 24, progress } = {}) {
  const out = [], f = (level, text, card, extra) => out.push({ level, text, ...(card && { card }), ...extra }), mm = (n) => `${Number(n.toFixed(2))}`;
  const free = s.motion.joints.filter((j) => !j.follow && j.dofs.length && (!joint || j.id === joint));
  if (joint && !free.length) throw new Error(`no joint "${joint}" to sweep (${s.motion.joints.filter((j) => !j.follow && j.dofs.length).map((j) => j.id).join(', ') || 'none'})`);
  const base = s.jointValues;
  for (const j of free) j.dofs.forEach(([lo, hi], d) => {
    const unit = DOFS[j.type][d] === 'angle' ? '°' : ' mm', name = `${j.id}${j.dofs.length > 1 ? ` ${'xyz'[d] && j.type === 'ball' ? 'xyz'[d] : DOFS[j.type][d]}` : ''}`;
    const bad = []; // [value, what]
    for (let i = 0; i <= steps; i++) {
      const v = lo + ((hi - lo) * i) / steps, set = { ...base, [j.id]: base[j.id].map((x, k) => (k === d ? v : x)) };
      const t = s.at(Object.fromEntries(Object.entries(set).filter(([id]) => !s.motion.joints.find((x) => x.id === id).follow)));
      const what = [...clashesOf(t, isNamed).map(([a, b]) => `${a} hits ${b}`), ...loopGaps(t).filter((l) => !l.ok).map((l) => `${l.label} apart by ${mm(l.gap)} mm`)];
      if (what.length) bad.push([v, what]);
      progress?.({ stage: 'sweep', joint: j.id, step: i, steps });
    }
    const ranges = []; // runs of steps in a row that collide
    for (const [v, what] of bad) { const r = ranges[ranges.length - 1]; if (r && Math.abs(v - r.to - (hi - lo) / steps) < 1e-9) { r.to = v; r.what = [...new Set([...r.what, ...what])]; } else ranges.push({ from: v, to: v, what }); }
    const span = `${mm(lo)} to ${mm(hi)}${unit}`;
    if (!ranges.length) f('pass', `sweep ${name}, ${span} in ${steps} steps: nothing collides`, `${name}: clear ${span}`, { code: 'sweep', values: { from: lo, to: hi, steps }, refs: { joint: name, collisions: [] } });
    else f('fail', `sweep ${name}, ${span} in ${steps} steps: ${ranges.map((r) => `${r.from === r.to ? `at ${mm(r.from)}` : `${mm(r.from)} to ${mm(r.to)}`}${unit.trim()}: ${r.what.slice(0, 3).join('; ')}${r.what.length > 3 ? `; and ${r.what.length - 3} more` : ''}`).join(' | ')}`,
      `${name}: collides ${ranges.map((r) => (r.from === r.to ? mm(r.from) : `${mm(r.from)}-${mm(r.to)}`)).join(', ')}${unit.trim()}`,
      { code: 'sweep', values: { from: lo, to: hi, steps }, refs: { joint: name, collisions: ranges.map((r) => ({ from: r.from, to: r.to, what: r.what })) } });
  });
  saveOverlaps();
  return out;
}

// shapes(parts) -> { shapes: [{ part, polygons, triangles }], place: [[shape index, 12 numbers], …] }
// Each distinct shape once, then where each copy goes: a 3 × 4 transform by rows (x' = a·x + b·y + c·z + d, …).
export function shapes(parts) {
  const index = new Map(), list = [], place = [];
  for (const p of parts) {
    if (!index.has(p.shape)) { index.set(p.shape, list.length); list.push({ part: p, polygons: p.local, triangles: p.localTriangles }); }
    const m = p.m, r = (x) => Number(x.toFixed(6)); // JSCAD's mat4 is column-major
    place.push([index.get(p.shape), ...[m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]].map(r)]);
  }
  return { shapes: list, place };
}

// An assembly's joints, for the page's sliders: each part moves with its item (motion in @rulecad/model-link)
export function motionData(s) {
  const mo = s.motion;
  if (!mo.joints.length) return {};
  const r = (x) => Number(x.toFixed(6)), names = mo.items.map((x) => x[0]);
  const named = (p, n) => p.name === n || p.leaf === n || p.item === n || p.name.startsWith(`${n}.`), allow = [];
  const loose = s.fits.filter((x) => x.min != null && x.num(x.min) < 0);
  s.parts.forEach((pa, i) => s.parts.forEach((pb, j) => {
    if (j > i && pa.item !== pb.item && loose.some((x) => (named(pa, x.a) && named(pb, x.b)) || (named(pa, x.b) && named(pb, x.a)))) allow.push([i, j]);
  }));
  return { motion: {
    items: mo.items.map(([n, ...m]) => [n, ...m.map(r)]),
    joints: mo.joints.map(({ id, type, parent, child, a, b, dofs, label, follow, path, cone, step }) => ({ id, type, parent, child, a: a.map(r), b: b.map(r), dofs: dofs.map((d) => d.map(r)),
      ...(label ? { label } : {}), ...(follow ? { follow } : {}), ...(path ? { path: path.map((p) => p.map(r)) } : {}), ...(cone != null ? { cone } : {}), ...(step ? { step } : {}) })),
    poses: mo.poses, ...(s.pose ? { pose: s.pose } : {}),
    part: s.parts.map((p) => names.indexOf(p.item)),
    ...(allow.length ? { allow } : {}),
  } };
}

// ---------- links ----------
// The rules sheet a link carries, for the page's Rules panel: a row for each of an object's own values, then each rule
// they use, as [group, name, value, unit, rule, expr, kind, source, checked] (group: the object, or the rule's set).
// A rule set marked "private" stays out, and --no-rules leaves the sheet out altogether.

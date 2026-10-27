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
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { evaluate, loadRuleSet } from './rules.mjs';
import { paths, printerOf } from './workspace.mjs';
import { locate, build, readObject, jscad } from './design.mjs';
import { materialise } from './versions.mjs';
import { satisfies } from '@rulecad/versions';
import { bounds } from '@rulecad/printcheck';
import { closest, inside } from '@rulecad/fit';
import { keys as keyCentres, readLayout, hasLayout } from './layout.mjs';
import { DOFS, frame, turn, mul, pathLength, jointValues, placeItems, jointMatrix } from '@rulecad/model-link';

export const assemblyPath = (ref) => { const [project, name] = String(ref).split('/'); return path.join(paths.project(project || ''), 'assemblies', `${name || ''}.json`); };
export const isAssembly = (ref) => String(ref).includes('/') && fs.existsSync(assemblyPath(ref.split('@')[0]));

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
  const [project, name] = ref.split('/');
  if (stack.includes(ref)) throw new Error(`assembly ${ref} contains itself (${[...stack, ref].join(' → ')})`);
  const a = JSON.parse(fs.readFileSync(assemblyPath(ref), 'utf8'));
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
    // from: inputs worked out from items built before this one ({ "usb_y": "board.pcb.pico_y" }): numbers, in this
    // assembly's names, so a part can take a value only another part knows once it's built
    const from = Object.fromEntries(Object.entries(it.from || {}).map(([k, x]) => [k, num(x)]));
    const set = { ...(it.set || {}), ...from, ...(overrides[it.id] || {}), ...(it.assembly ? {} : extra) };
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
  for (const it of a.items || []) {
    if (!/^[a-z][\w-]*$/.test(it.id || '')) throw new Error(`each item needs an id (letters, digits, - or _): got ${JSON.stringify(it.id)}`);
    if (!it.object === !it.assembly) throw new Error(`item ${it.id}: give either "object" or "assembly"`);
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
    for (const c of copies) { c.src = await source(it, c.extra); values[c.id] = c.src.sub ? c.src.sub.values : c.src.b.values; }
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
  const motion = motionOf(a, placed, num, ref);
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
      objects.push({ id, objName: src.objName, version: src.version, built: src.b, role: src.role });
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
  const at = (p) => {
    const v = jointValues(motion, p), moved = partsAt(placeItems(motion, v));
    return { ...s, parts: moved, pose: typeof p === 'string' ? p : null, jointValues: v, polygons: moved.flatMap((x) => x.polygons), triangles: moved.flatMap((x) => x.triangles) };
  };
  const s = { a, project, name, items, parts, objects, fits, requires, values, num, seen, motion, pose: typeof pose === 'string' ? pose : null, jointValues: jv, at,
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
// "poses": { "open": { "hinge": 90 } } names sets of values, "pose" the one shown (default: the first); check checks
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
      ...(j.follow ? { follow: [j.follow, j.ratio != null ? num(j.ratio) : 1, j.offset != null ? num(j.offset) : 0] } : {}) });
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
  const poses = Object.fromEntries(Object.entries(a.poses || {}).map(([n, set]) => [n, Object.fromEntries(Object.entries(set).map(([id, v]) => {
    if (!joints.some((j) => j.id === id)) throw new Error(`pose ${n}: no joint "${id}"`);
    return [id, Array.isArray(v) ? v.map(num) : num(v)];
  }))]));
  if (a.pose && !poses[a.pose]) throw new Error(`pose "${a.pose}" isn't one of the poses (${Object.keys(poses).join(', ') || 'none'})`);
  const loops = (a.loops || []).map((l, i) => ({ label: l.label || `${typeof l.a === 'string' ? l.a : 'anchor'} meets ${typeof l.b === 'string' ? l.b : 'anchor'}`,
    a: anchor(l.a, `loop ${i + 1}`), b: anchor(l.b, `loop ${i + 1}`), tolerance: l.tolerance != null ? num(l.tolerance) : 0.01 }));
  return { items, joints, poses, pose: a.pose || Object.keys(poses)[0], loops, ref };
}

// keyCentres(layout): each key's centre, from lib/layout.mjs (kept under this name for older callers)
export { keyCentres };

// ---------- checks ----------
export { closest };

// How much two parts overlap (mm³), from JSCAD's intersection.
export function overlap(ga, gb) {
  const v = jscad.measurements.measureVolume(jscad.booleans.intersect(ga, gb));
  return Math.abs(v) < 1e-6 ? 0 : Math.abs(v);
}

// Overlaps between placed parts, remembered across runs (.cache/overlaps.json): a part is its build (the build cache's
// hash: everything it's made from) and where it's placed, so after an edit only the pairs it touches are measured again
const OVERLAPS = paths.cache('overlaps.json');
let remembered = null, fresh = 0;
function pairOverlap(pa, pb) {
  if (!pa.hash || !pb.hash) return overlap(pa.geometry, pb.geometry);
  remembered ||= (() => { try { return JSON.parse(fs.readFileSync(OVERLAPS, 'utf8')); } catch { return {}; } })();
  const at = (p) => `${p.hash}@${Array.from(p.m || []).map((x) => Math.round(x * 1e6) / 1e6).join(',')}`;
  const [x, y] = [at(pa), at(pb)].sort(), k = crypto.createHash('sha1').update(`${x}|${y}`).digest('hex');
  if (!(k in remembered)) { remembered[k] = overlap(pa.geometry, pb.geometry); fresh++; }
  return remembered[k];
}
function saveOverlaps() {
  if (!fresh) return;
  try { fs.mkdirSync(path.dirname(OVERLAPS), { recursive: true }); fs.writeFileSync(OVERLAPS, JSON.stringify(remembered)); fresh = 0; } catch {} // only slower without it
}

// checkAssembly(built) -> findings, as @rulecad/printcheck: { level, text, card? } (card: a short line for the mirror)
export function checkAssembly(s) {
  const out = [], f = (level, text, card) => out.push({ level, text, ...(card && { card }) }), mm = (n) => `${Number(n.toFixed(3))}`;
  // Versions: every pin, from this assembly and its components, against every copy of that object
  const pins = new Map();
  for (const r of s.requires) pins.set(`${r.object} ${r.range}`, r);
  for (const { object, range } of pins.values()) {
    const copies = s.objects.filter((o) => o.objName === object);
    if (!copies.length) { f('fail', `requires ${object} ${range}, but nothing uses it`); continue; }
    const bad = copies.filter((o) => !satisfies(o.version, range));
    f(bad.length ? 'fail' : 'pass', bad.length ? `${object} ${bad[0].version} doesn't meet ${range} (${bad.map((o) => o.id).join(', ')})`
      : `${object} ${copies[0].version} meets ${range}${copies.length > 1 ? ` (${copies.length} copies)` : ''}`);
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
    if (v > 0.01) clashes.push(`${pa.name} and ${pb.name} overlap by ${mm(v)} mm³`);
  }
  if (clashes.length) f('fail', clashes.slice(0, 5).join('; ') + (clashes.length > 5 ? `; and ${clashes.length - 5} more` : ''), `${clashes.length} overlaps`);
  else f('pass', `no parts overlap (${new Set(s.parts.map((p) => p.leaf)).size} object instances)`, 'No parts overlap');
  // Fits: the closest gap between two named things, against a range. Copies of one fit are reported together, worst first.
  const pick = (n) => (Array.isArray(n) ? n.flatMap(pick) : s.parts.filter((p) => named(p, n)));
  const groups = new Map();
  for (const x of s.fits) {
    if (x.poses && !x.poses.includes(s.pose)) continue; // a fit for some poses only: the folded screen over the keys
    if (x.holes) { holesFit(x); continue; }
    const A = pick(x.a), key = x.note || `${x.a} / ${x.b}`;
    const lo = x.min != null ? x.num(x.min) : -Infinity, hi = x.max != null ? x.num(x.max) : Infinity;
    const reach = Math.max(2, ...[lo, hi].filter(Number.isFinite)) + 1; // look past the range, so a gap near it is measured
    let B = pick(x.b);
    if (Array.isArray(x.b) && A.length) { // against many others: only those within reach
      const lo3 = [0, 1, 2].map((k) => Math.min(...A.map((p) => bx(p).lo[k]))), hi3 = [0, 1, 2].map((k) => Math.max(...A.map((p) => bx(p).hi[k])));
      B = B.filter((p) => [0, 1, 2].every((k) => bx(p).lo[k] <= hi3[k] + reach && lo3[k] <= bx(p).hi[k] + reach));
    }
    if (!A.length || (!B.length && !Array.isArray(x.b))) { f('fail', `fit ${x.a} / ${x.b}: no such ${A.length ? x.b : x.a}`); continue; }
    const vol = A.reduce((t, pa) => t + B.reduce((u, pb) => u + (touch(pa, pb) ? pairOverlap(pa, pb) : 0), 0), 0);
    const gap = !B.length ? Infinity : vol > 0.01 ? -vol : closest(A.flatMap((p) => p.polygons), B.flatMap((p) => p.polygons), reach); // negative: overlap, mm³
    const ok = vol > 0.01 ? lo < 0 : gap >= lo && gap <= hi;
    if (!groups.has(key)) groups.set(key, { x, lo, hi, results: [] });
    groups.get(key).results.push({ ok, gap, id: x.a });
  }
  for (const [key, { x, lo, hi, results }] of groups) {
    const worst = results.reduce((w, r) => (!r.ok && w.ok ? r : r.ok === w.ok && r.gap < w.gap ? r : w), results[0]);
    const say = (g) => (g < 0 ? `press fit, ${mm(-g)} mm³ overlap` : g === Infinity ? 'not near each other' : `closest gap ${mm(g)} mm`);
    const n = results.length > 1 ? ` (${results.filter((r) => r.ok).length} of ${results.length} in range)` : '';
    const label = (x.label || x.a).replace(/ \(.*\)$/, '');
    f(worst.ok ? 'pass' : 'warn', `${key}: ${say(worst.gap)}${n}${worst.ok ? '' : `, wanted ${lo === -Infinity ? '' : `${mm(lo)} `}to ${hi === Infinity ? 'any' : mm(hi)} mm (${results.filter((r) => !r.ok).map((r) => r.id).join(', ')})`}`,
      `${label}: ${worst.gap < 0 ? `press fit ${mm(-worst.gap)} mm³` : worst.gap === Infinity ? 'apart' : `gap ${Number(worst.gap.toFixed(2))} mm`}${worst.ok ? '' : ' (out of range)'}`);
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
      `${label}: ${misses.length ? `${misses.length} of ${holes.length} miss` : `${holes.length} of ${holes.length} line up`}`);
  }
  // Joints: every value in its range (a ball's tip within its cone), and every loop closed
  if (s.motion?.joints.length) {
    const outside = [];
    for (const j of s.motion.joints) {
      const v = s.jointValues[j.id];
      j.dofs.forEach(([lo, hi], i) => { if (v[i] < lo - 1e-9 || v[i] > hi + 1e-9) outside.push(`${j.id} ${mm(v[i])} (${mm(lo)} to ${mm(hi)})`); });
      if (j.cone != null) { const tip = Math.acos(Math.min(1, jointMatrix(j, v)[10])) / (Math.PI / 180); if (tip > j.cone + 1e-9) outside.push(`${j.id} tips ${mm(tip)}° (cone ${mm(j.cone)}°)`); }
    }
    if (outside.length) f('fail', `joints out of range: ${outside.join(', ')}`, `${outside.length} joints out of range`);
    for (const l of loopGaps(s)) f(l.ok ? 'pass' : 'fail', `${l.label}: ${l.ok ? 'closed' : 'apart'} (${mm(l.gap)} mm, axes ${mm(l.angle)}° apart)`, `${l.label}: ${l.ok ? 'closed' : 'apart'}`);
  }
  // Plates print everything: no references
  if (s.a.kind === 'plate') {
    const refs = s.objects.filter((o) => o.role === 'reference' && !o.unplaced); // an unplaced item only lends its numbers
    if (refs.length) f('fail', `a plate can't print references: ${refs.map((o) => o.id).join(', ')}`);
  }
  // Rules that are only estimates, anywhere in the assembly or its components
  const est = new Set();
  for (const o of s.objects) for (const e of o.built.entries) if (e.kind === 'estimate' && (e.used || !e.name.includes('.'))) est.add(e.name);
  for (const n of s.seen) { const [u, k] = n.split('.'); if (loadRuleSet(u).rules[k]?.kind === 'estimate') est.add(n); }
  if (est.size) f('warn', `uses estimates, not measurements: ${[...est].join(', ')}. Measure them and record kind: measured`, `Estimate: ${[...est].join(', ')}`);
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
export function sweep(s, { joint, steps = 24 } = {}) {
  const out = [], f = (level, text, card) => out.push({ level, text, ...(card && { card }) }), mm = (n) => `${Number(n.toFixed(2))}`;
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
    }
    const ranges = []; // runs of steps in a row that collide
    for (const [v, what] of bad) { const r = ranges[ranges.length - 1]; if (r && Math.abs(v - r.to - (hi - lo) / steps) < 1e-9) { r.to = v; r.what = [...new Set([...r.what, ...what])]; } else ranges.push({ from: v, to: v, what }); }
    const span = `${mm(lo)} to ${mm(hi)}${unit}`;
    if (!ranges.length) f('pass', `sweep ${name}, ${span} in ${steps} steps: nothing collides`, `${name}: clear ${span}`);
    else f('fail', `sweep ${name}, ${span} in ${steps} steps: ${ranges.map((r) => `${r.from === r.to ? `at ${mm(r.from)}` : `${mm(r.from)} to ${mm(r.to)}`}${unit.trim()}: ${r.what.slice(0, 3).join('; ')}${r.what.length > 3 ? `; and ${r.what.length - 3} more` : ''}`).join(' | ')}`,
      `${name}: collides ${ranges.map((r) => (r.from === r.to ? mm(r.from) : `${mm(r.from)}-${mm(r.to)}`)).join(', ')}${unit.trim()}`);
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

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
      if (it.assembly) built.set(key, { key, sub: await buildAssembly(`${project}/${it.assembly}`, [...stack, ref], sub, opts) });
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
  // placed under the case's top, the case built with the board's Pico position)
  for (const [it, copies] of placing) {
    if (it.place === false) { // built only for its values ("place": false): a board a print plate's case is sized from
      for (const c of copies) if (!c.src.sub) objects.push({ id: c.id, objName: c.src.objName, version: c.src.version, built: c.src.b, role: c.src.role, unplaced: true });
      continue;
    }
    for (const c of copies) {
      const src = c.src, id = c.id, key = src.key;
      const base = (it.at || [0, 0, 0]).map(num), rot = (it.rotate || [0, 0, 0]).map((r) => num(r) * deg);
      // A repeated item turns as a whole about its at: each copy's offset turns with it (keys on a tilted plate)
      // Faces are moved as they are, not re-triangulated in place: triangulating again after a move rounds differently
      const m = translate(base, rotate(rot, translate([c.offset[0], c.offset[1], 0], jscad.geometries.geom3.create()))).transforms;
      const move = (polys) => polys.map((poly) => poly.map((v) => jscad.maths.vec3.transform([0, 0, 0], v, m)));
      ids.push(id);
      if (src.sub) {
        const sub = src.sub;
        for (const p of sub.parts) {
          if (p.role === 'support' && a.kind !== 'plate') continue;
          parts.push({ ...p, name: `${id}.${p.name}`, item: id, leaf: `${id}.${p.leaf}`, label: `${id} ${p.label}`,
            geometry: transform(m, p.geometry), polygons: move(p.polygons), triangles: move(p.triangles), m: jscad.maths.mat4.multiply(jscad.maths.mat4.create(), m, p.m) });
        }
        for (const o of sub.objects) objects.push({ ...o, id: `${id}.${o.id}` });
        for (const x of sub.fits) fits.push({ ...x, a: `${id}.${x.a}`, b: `${id}.${x.b}`, label: x.label && `${x.label} (${id})` });
        requires.push(...sub.requires);
        for (const n of sub.seen) seen.add(n);
        items.push({ ...it, id, sub, role: 'part' });
      } else {
        const { b } = src;
        for (const p of b.parts) {
          if (p.role === 'support' && a.kind !== 'plate') continue; // supports are snipped off before parts go together
          parts.push({ name: `${id}.${p.name}`, item: id, leaf: id, object: src.objName, role: src.role === 'reference' ? 'reference' : p.role, label: `${id}: ${p.label}`,
            ...(p.filament ? { filament: p.filament } : {}), ...(p.mirror === false ? { mirror: false } : {}), part: p.name,
            geometry: transform(m, p.geometry), polygons: move(p.polygons), triangles: move(p.triangles),
            shape: `${key}:${p.name}`, hash: `${b.hash}:${p.name}`, local: p.polygons, localTriangles: p.triangles, m });
        }
        objects.push({ id, objName: src.objName, version: src.version, built: b, role: src.role });
        items.push({ ...it, id, objName: src.objName, built: b, version: src.version, role: src.role });
      }
    }
  }
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
  return { a, project, name, items, parts, objects, fits, requires, values, num, seen,
    polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles) };
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

// Printed fittings in assemblies (@rulecad/frames' fitting.mjs): an item with "fitting" is a printed corner bracket,
// gusset or splice plate drawn from a profile's and its slot nuts' rules and sized from a named load by finite elements
// (their results kept in .cache/fitting). A join with "fitting": "printed" adds its own: placed from where the two beams
// are, its screws into slot nuts in both as fastens (so the fasten checks choose their lengths and count them), and its
// own stiffness in place of the join's estimate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bracketModel, bracket, plateModel, plate } from '@rulecad/frames';
import { host } from './host.mjs';
import { paths } from './workspace.mjs';
import { named } from './parts.mjs';
import { givenFor } from './frames.mjs';
import { ops as booleans } from '@rulecad/shapes';

const KEYS = ['kind', 'profile', 'other', 'face', 'otherFace', 'shape', 'brace', 'load', 'count', 'thread', 'head', 'nut'];
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const strip = (e) => String(e?.message ?? e).replace(/^(bracketModel|plateModel|bracket|plate): /, '');

/** The finite elements' results kept on disk, as the motor mount's are: .cache/fitting/<hash>.json (CAD_NO_CACHE skips it). */
export const fittingCache = {
  get(key) {
    if (process.env.CAD_NO_CACHE) return undefined;
    const file = paths.cache('fitting', `${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}.json`);
    try { return host.exists(file) ? JSON.parse(host.readText(file)) : undefined; } catch { return undefined; }
  },
  set(key, v) {
    if (process.env.CAD_NO_CACHE) return;
    try { host.writeText(paths.cache('fitting', `${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}.json`), JSON.stringify(v)); } catch {} // (a cache that cannot be written is solved again next time)
  },
};

// The project's plastic, where the fittings know it (pla, petg), else PLA
export function plasticOf(project) {
  try { const m = String(JSON.parse(fs.readFileSync(path.join(paths.project(project), 'project.json'), 'utf8')).material || 'pla').toLowerCase().split(/\s/)[0]; return ['pla', 'petg'].includes(m) ? m : 'pla'; } catch { return 'pla'; }
}

/**
 * A fitting's model from an item's "fitting" (or a join's), refused by name where a key is not one it takes.
 * @param {object} spec { kind: bracket | gusset | splice, profile, other, face, otherFace, shape, brace, load, count, thread, head, nut }
 * @param {object} context framesContext()'s @param {string} [material] pla or petg @param {string} [what] who asks
 */
export function fittingModel(spec, context, material = 'pla', what = 'fitting') {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${what}: fitting is { "kind": "bracket", "profile": "2020-misumi-hfs5" } (got ${shown(spec)})`);
  for (const k of Object.keys(spec)) if (!KEYS.includes(k)) throw new Error(`${what}: a fitting has no "${k}": it takes ${KEYS.join(', ')}`);
  if (!['bracket', 'gusset', 'splice'].includes(spec.kind)) throw new Error(`${what}: fitting.kind is bracket, gusset or splice (got ${shown(spec.kind)})`);
  const given = givenFor(context, spec.profile), o = { given, material, cache: fittingCache };
  for (const k of ['thread', 'head', 'nut', 'load']) if (spec[k] != null) o[k] = spec[k];
  try {
    if (spec.kind === 'bracket') return bracketModel(spec.profile, { ...o, ...(spec.other ? { other: spec.other } : {}), ...(spec.face ? { face: spec.face } : {}), ...(spec.otherFace ? { otherFace: spec.otherFace } : {}), ...(spec.brace != null ? { brace: spec.brace } : {}) });
    return plateModel(spec.profile, { ...o, shape: spec.kind === 'splice' ? 'splice' : spec.shape ?? 'L', ...(spec.face ? { face: spec.face } : {}), ...(spec.count != null ? { count: spec.count } : {}) });
  } catch (e) { throw new Error(`${what}: ${strip(e)}`); }
}

/**
 * An item with "fitting", built: its solid in its fitted frame as a printed part (counted on cad list by its grams), its
 * figures as values (br.thickness, br.grams, br.margin, br.stiffness), and the model kept for the joins' checks.
 * @param {object} it the item @param {string} id @param {object} context @param {string} [material]
 */
export async function fittingBuilt(it, id, context, material = 'pla') {
  const m = fittingModel(it.fitting, context, material, `item ${id}`);
  // joined and cut by Manifold where the workspace has it, so the solid is watertight for the overlap check (JSCAD's
  // booleans leave seams that Manifold cannot read, and JSCAD's own intersection then misreads a head in its seat)
  let ops = null; try { ops = await booleans('manifold'); } catch {}
  const draw = (o) => { const f = m.fitting === 'bracket' ? bracket : plate; try { return f(m, { ...o, ...(ops ? { ops } : {}) }); } catch { return f(m, o); } };
  const parts = named({ body: draw({ pose: 'fit' }) }, { body: { label: m.title } });
  // its tongues stand in the slots, inside the beams' envelopes: the overlap check measures the body without them
  parts[0].collide = named({ body: draw({ pose: 'fit', tongues: false }) }, {})[0].geometry;
  // an anchor on each screw's axis at its head's seat, z out of the fitting toward the head: b1, b2 .. into b; a1 .. into a
  const count = { a: 0, b: 0 }, anchors = Object.fromEntries(m.screws.map((sc) => [`${sc.leg}${++count[sc.leg]}`, { at: m.fitting === 'bracket' ? sc.at : [sc.at[0], sc.at[1], m.thickness], axis: sc.axis.map((c) => (c ? -c : 0)) }]));
  const values = { thickness: m.thickness, width: m.width, grams: m.grams, margin: m.margin, stiffness: m.stiffness.bending, load: m.load.force, ...(m.leg ? { leg: m.leg } : { arm: m.arm }) };
  const entries = Object.entries({ thickness: ['mm', 'sized from the load'], grams: ['g', 'its mass'], margin: ['×', 'its strength over the peak stress at the load, by finite elements'], stiffness: ['N·mm/rad', 'its own bending stiffness about the joint, by finite elements'] })
    .map(([k, [unit, rule]]) => ({ name: `${m.name}.${k}`, value: values[k], unit, rule: `The printed fitting's ${rule}`, kind: 'derived', source: '@rulecad/frames fitting.mjs', checked: '2026-11-17', set: m.name }));
  const hash = crypto.createHash('sha256').update(JSON.stringify([it.fitting, material, m.name, m.thickness, m.grams])).digest('hex').slice(0, 16);
  const b = { object: { name: m.name, title: m.title, role: 'part', version: '0.0.0', anchors }, values, entries, deps: [], units: {}, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles), hash };
  return { key: `fitting:${id}:${hash}`, objName: `fitting:${m.name}`, b, version: '0.0.0', role: 'part', fitting: m };
}

// ---------- a join's printed fitting, placed ----------
const col = (f, k) => [f[k], f[4 + k], f[8 + k]], org = (f) => [f[3], f[7], f[11]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const world = (f, p) => [0, 1, 2].map((k) => f[4 * k] * p[0] + f[4 * k + 1] * p[1] + f[4 * k + 2] * p[2] + f[4 * k + 3]);
const turn = (f, v) => [0, 1, 2].map((k) => f[4 * k] * v[0] + f[4 * k + 1] * v[1] + f[4 * k + 2] * v[2]);
const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3);
// a place's face as slotSide takes it: top, or top.2 where the face has two slots
const faceOf = (B, place) => (B.places.filter((q) => q.face === place.face).length > 1 ? place.name : place.face);

/**
 * Where a join's printed fitting goes, and what it adds: an item placed at an address on b, and a fasten for each leg
 * or arm into its beam's slot. Refused by name: beams not placed by their ends, a's faces not square to b's axis, a
 * bracket with no room on b.
 * @param {object} j the join as written @param {number} i its index @param {{ ia: object, ib: object, A: object, B: object, m: object, ends: object }} beams
 * @param {(x: any) => number} num @param {object} context @param {string} material @param {Set<string>} ids the item ids taken
 * @returns {{ item: object, fasten: object[], model: object, stiffness: object }}
 */
export function joinFitting(j, i, { ia, ib, A, B, m, ends, place: placeOf }, num, context, material, ids) {
  const what = `join ${i + 1}`, label = j.note || `${j.kind} join of ${j.a} to ${j.b}`;
  const fa = placeOf(ia, num), fb = placeOf(ib, num);
  if (!fa || !fb) throw new Error(`${what}: a printed ${j.kind} is placed from where the beams are: place ${!fa ? ia.id : ib.id} by its ends (from, to)`);
  const free = (base) => { let n = base, k = 2; while (ids.has(n)) n = `${base}-${k++}`; ids.add(n); return n; };
  if (j.kind === 'bracket') {
    const bp = B.places.find((q) => q.name === m.b.place), d = m.b.distance, ub = col(fb, 2), nb = turn(fb, [...bp.normal, 0]);
    const P = world(fb, [bp.at[0], bp.at[1], d]), roomB = B.length - d, sign = roomB >= d ? 1 : -1, dir = ub.map((c) => c * sign);
    // a's face that looks along b, toward the side with more room; of its slots, the one in the bracket's plane
    const z = cross(dir, nb), faces = A.places.filter((q) => q.slot && dot(turn(fa, [...q.normal, 0]), dir) > 1 - 1e-6);
    if (!faces.length) throw new Error(`${what}: a printed bracket lies on a face of ${ia.id} that looks along ${ib.id}, and none of ${ia.id}'s slotted faces does: turn ${ia.id} with roll so one faces along ${ib.id}`);
    const ap = faces.map((q) => ({ q, Q: world(fa, [q.at[0], q.at[1], 0]) })).sort((x, y) => Math.abs(dot(sub(x.Q, P), z)) - Math.abs(dot(sub(y.Q, P), z)))[0];
    const off = dot(sub(ap.Q, P), dir), at = d + sign * off, spec = { kind: 'bracket', profile: B.profile.name, ...(A.profile.name !== B.profile.name ? { other: A.profile.name } : {}), face: faceOf(B, bp), otherFace: faceOf(A, ap.q), ...(j.brace != null ? { brace: j.brace } : {}), ...(j.load != null ? { load: j.load } : {}), ...(j.nut ? { nut: j.nut } : {}) };
    const fm = fittingModel(spec, context, material, what), room = sign > 0 ? B.length - at : at, endA = ends.a.rest[0], aRoom = A.length;
    if (room < fm.leg - 1e-6) throw new Error(`${what}: a printed bracket's ${mm(fm.leg)} mm leg runs ${mm(fm.leg - room)} mm past ${ib.id}'s end ${sign > 0 ? 'b' : 'a'}: it goes on the side of ${ia.id} with more of ${ib.id}, and there is only ${mm(room)} mm there. A gusset or a blind join will do`);
    if (aRoom < fm.leg - 1e-6) throw new Error(`${what}: a printed bracket's ${mm(fm.leg)} mm leg is longer than ${ia.id} (${mm(aRoom)} mm)`);
    const id = free(`${ia.id}-${ib.id}-bracket`);
    const item = { id, fitting: spec, at: `${ib.id}.${bp.name}@${r3(at)}`, rotate: sign > 0 ? [90, 0, 0] : [90, 0, 180], join: i };
    const screw = `${fm.thread} ${fm.head}`;
    // (each into the slot nut the bracket was drawn for, so the screw it was thickened for is the one chosen)
    const fasten = [{ screw, through: [id], into: `${ib.id}.${bp.name}`, at: [`${id}.b1`], note: `${label}: the bracket into ${ib.id}`, join: i, nut: j.nut ?? fm.screws[0].nutKind },
      { screw, through: [id], into: `${ia.id}.${ap.q.name}`, at: [`${id}.a1`], note: `${label}: the bracket into ${ia.id}`, join: i, nut: j.nut ?? fm.screws[1].nutKind }];
    return { item, fasten, model: fm, side: sign > 0 ? 'b' : 'a', endA };
  }
  // a plate (a gusset, or a splice plate): on a face of each beam, the two in one plane. Its frame: x along b away from
  // the joint (a gusset's toward b's end with more room; a splice's into b), y along a away from b (a splice's across),
  // z out of the faces; it sits at an address on b, turned in that frame
  const splice = j.kind === 'splice', ua = col(fa, 2).map((c) => (ends.a.rest[0] === 'a' ? c : -c)), ub = col(fb, 2);
  const d = splice ? (m.b.end === 'a' ? 0 : B.length) : m.b.distance;
  let x, y, n, shapeAt = null;
  if (splice) {
    x = ub.map((c) => (m.b.end === 'a' ? c : -c));
    const bq = B.places.find((q) => q.slot && Math.abs(dot(turn(fb, [...q.normal, 0]), x)) < 1e-6 && A.places.some((r) => r.slot && dot(turn(fa, [...r.normal, 0]), turn(fb, [...q.normal, 0])) > 1 - 1e-6));
    if (!bq) throw new Error(`${what}: a printed splice plate lies on a slotted face of both beams, in one plane, and ${ia.id} and ${ib.id} share none`);
    n = turn(fb, [...bq.normal, 0]); y = cross(n, x);
  } else {
    const half = Math.max(A.profile.width, A.profile.height) / 2;
    const room = { b: B.length - d - half, a: d - half };
    shapeAt = { room };
    x = ub.map((c) => (room.b >= room.a ? c : -c)); y = ua; n = cross(x, y);
  }
  const bq = B.places.find((q) => q.slot && dot(turn(fb, [...q.normal, 0]), n) > 1 - 1e-6), aq = A.places.find((q) => q.slot && dot(turn(fa, [...q.normal, 0]), n) > 1 - 1e-6);
  if (!bq || !aq) throw new Error(`${what}: a printed ${splice ? 'splice plate' : 'gusset'} lies on a slotted face of both beams that looks the same way, and ${!bq ? ib.id : ia.id} has none that does: turn it with roll`);
  const Pb = world(fb, [bq.at[0], bq.at[1], d]), Qa = world(fa, [aq.at[0], aq.at[1], 0]), apart = dot(sub(Qa, Pb), n);
  if (Math.abs(apart) > 0.05) throw new Error(`${what}: a printed ${splice ? 'splice plate' : 'gusset'} lies flat on both beams, and ${ia.id}'s ${aq.face} face stands ${mm(Math.abs(apart))} mm ${apart > 0 ? 'proud of' : 'below'} ${ib.id}'s ${bq.face} face`);
  const spec0 = { kind: splice ? 'splice' : 'gusset', profile: B.profile.name, face: faceOf(B, bq), ...(j.load != null ? { load: j.load } : {}), ...(j.nut ? { nut: j.nut } : {}) };
  let fm = fittingModel({ ...spec0, ...(splice ? {} : { shape: 'L' }) }, context, material, what), shape = 'L';
  if (!splice) {
    const reach = fm.width / 2 + fm.arm, { room } = shapeAt;
    if (Math.min(room.a, room.b) + fm.width / 2 >= reach) { shape = 'T'; fm = fittingModel({ ...spec0, shape }, context, material, what); }
    else if (Math.max(room.a, room.b) + fm.width / 2 < reach - 1e-6) throw new Error(`${what}: a printed gusset's ${mm(fm.arm)} mm arm runs past ${ib.id}'s ends: there is ${mm(Math.max(room.a, room.b))} mm beside ${ia.id}, and it needs ${mm(fm.arm)}. A bracket will do`);
    if (A.length < fm.arm - 1e-6) throw new Error(`${what}: a printed gusset's ${mm(fm.arm)} mm arm is longer than ${ia.id} (${mm(A.length)} mm)`);
  } else if (Math.min(A.length, B.length) < fm.arm - 1e-6) throw new Error(`${what}: a printed splice plate's ${mm(fm.arm)} mm arms are longer than ${A.length < B.length ? ia.id : ib.id}`);
  if (A.profile.name !== B.profile.name && faceOf(A, aq) !== faceOf(B, bq)) throw new Error(`${what}: a printed plate is drawn for one profile's slots, and ${ia.id} (${A.profile.name}) and ${ib.id} (${B.profile.name}) differ: a bracket takes two`);
  const id = free(`${ia.id}-${ib.id}-${splice ? 'splice' : 'gusset'}`), along = dot(x, ub) > 0;
  const spec = { ...spec0, ...(splice ? {} : { shape }) };
  const item = { id, fitting: spec, at: `${ib.id}.${bq.name}@${r3(d)}`, ...(along ? {} : { rotate: [0, 0, 180] }), join: i };
  const anchorsOf = (leg) => fm.screws.map((sc, k) => [sc, k]).filter(([sc]) => sc.leg === leg).map((_, k) => `${id}.${leg}${k + 1}`);
  const fasten = [{ screw: `${fm.thread} ${fm.head}`, through: [id], into: `${ib.id}.${bq.name}`, at: anchorsOf('b'), note: `${label}: the ${splice ? 'splice plate' : 'gusset'} into ${ib.id}`, join: i, nut: j.nut ?? fm.screws[0].nutKind },
    { screw: `${fm.thread} ${fm.head}`, through: [id], into: `${ia.id}.${aq.name}`, at: anchorsOf('a'), note: `${label}: the ${splice ? 'splice plate' : 'gusset'} into ${ia.id}`, join: i, nut: j.nut ?? fm.screws[0].nutKind }];
  return { item, fasten, model: fm };
}

/**
 * A join's stiffness once its printed fitting is drawn: the fitting's own bending stiffness by finite elements, its twist
 * still the estimate, in the shape @rulecad/frames' joinStiffness gives.
 * @param {object} k joinStiffness's @param {object} fm the fitting's model
 */
export function fittedStiffness(k, fm) {
  const bending = fm.stiffness.bending;
  return { ...k, bending, end: { rx: k.twist, ry: bending, rz: bending }, fitting: { name: fm.name, bending, linear: fm.stiffness.linear, margin: fm.margin, grams: fm.grams, load: fm.load.force },
    rests: [{ value: bending, unit: 'N·mm/rad', kind: 'derived', source: `${fm.name}: by finite elements on the printed fitting as drawn; the slot nuts and lips not in it` }, ...k.rests.slice(1)] };
}

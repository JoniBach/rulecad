// Printed fittings in assemblies (@rulecad/frames' fitting.mjs): an item with "fitting" is a printed corner bracket,
// gusset or splice plate drawn from a profile's and its slot nuts' rules and sized from a named load by finite elements
// (their results kept in .cache/fitting). A join with "fitting": "printed" adds its own: placed from where the two beams
// are, its screws into slot nuts in both as fastens (so the fasten checks choose their lengths and count them), and its
// own stiffness in place of the join's estimate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as frames from '@rulecad/frames';
const { bracketModel, bracket, plateModel, plate } = frames;
import { host } from './host.mjs';
import { paths, RULE_DIRS } from './workspace.mjs';
import { named } from './parts.mjs';
import { givenFor } from './frames.mjs';
import { peekRuleSet } from './rules.mjs';
import { ops as booleans } from '@rulecad/shapes';
import jscad from '@jscad/modeling';

const KEYS = ['kind', 'profile', 'other', 'face', 'otherFace', 'shape', 'brace', 'load', 'count', 'thread', 'head', 'nut'];
// The printed fittings for panels, doors and beams' ends: each kind's model and solid in @rulecad/frames, whether it
// is drawn for a profile, and the parts it has (a hinge's two leaves, a levelling foot's body and pad: an item each)
const MORE = {
  'panel-clip': ['panelClipModel', 'panelClip'], 'panel-corner': ['panelCornerModel', 'panelCorner'], 'slot-cover': ['slotCoverModel', 'slotCover'], 'panel-edge': ['panelEdgeModel', 'panelEdge'],
  'gasket-strip': ['gasketStripModel', 'gasketStrip', { profile: false }], hinge: ['hingeModel', 'hinge', { parts: ['frame', 'door'] }], handle: ['handleModel', 'handle', { profile: false }], latch: ['latchModel', 'latch'],
  'magnet-catch': ['magnetCatchModel', 'magnetCatch'], 'end-cap': ['endCapModel', 'endCap'], foot: ['footModel', 'foot'], 'levelling-foot': ['levellingFootModel', 'levellingFoot', { parts: ['body', 'pad'] }],
  'castor-plate': ['castorPlateModel', 'castorPlate'], 'stacking-foot': ['stackingFootModel', 'stackingFoot'],
  'device-mount': ['deviceMountModel', 'deviceMount'], 'fan-mount': ['fanMountModel', 'fanMount'], 'drag-chain-end': ['dragChainEndModel', 'dragChainEnd'], 'din-rail': ['dinRailAdapterModel', 'dinRailAdapter'],
  'cable-clip': ['cableClipModel', 'cableClip'], 'tie-anchor': ['tieAnchorModel', 'tieAnchor'], 'spool-holder': ['spoolHolderModel', 'spoolHolder'],
  'rail-jig': ['railJigModel', 'railJig'], 'wheel-plate': ['wheelsModel', 'wheelPlate'], slider: ['sliderModel', 'slider'],
  'nut-carrier': ['carrierModel', 'carrier', { pose: { fit: 'slot', print: 'print' } }],
  'rod-holder': ['rodHolderModel', 'rodHolder'], 'rod-carriage': ['rodCarriageModel', 'rodCarriage'], 'motor-plate': ['motorPlateModel', 'motorPlate'], 'endstop-mount': ['endstopMountModel', 'endstopMount'],
  'belt-plate': ['beltPlateModel', 'beltPlate'], 'belt-clamp': ['beltClampModel', 'beltClamp', { profile: false }], 'belt-idler': ['beltIdlerModel', 'beltIdler'],
};
// the kinds whose tongue or stem stands in the slot, inside the beam's envelope: the overlap check measures them without it
const TONGUED = ['panel-clip', 'magnet-catch', 'panel-corner', 'cable-clip', 'tie-anchor', 'spool-holder', 'rail-jig', 'slider', 'end-cap'];
// parts that lie in a slot by design (an in-slot panel edge, a slot cover's strip): only what stands above the face is
// measured by the overlap check, as a tongue is left out
const IN_SLOT = ['panel-edge', 'slot-cover'];
/** The kinds of fitting an item may name. */
export const FITTING_KINDS = ['bracket', 'gusset', 'splice', ...Object.keys(MORE)];
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

/**
 * The project's plastic for its printed fittings: pla or petg by name; another named in project.json is read from its
 * own rule set (the workspace's rules/, then the kit's) where that gives strength, modulus and density, and refused by
 * name where it does not. A project with no project.json or no material is PLA.
 * @param {string} project @returns {string | object} pla, petg, or the material's rule set
 */
export function plasticOf(project) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(paths.project(project), 'project.json'), 'utf8')).material; } catch { return 'pla'; }
  return plasticNamed(raw, `project ${project}`);
}

/**
 * A plastic by the name a project.json gives it: pla or petg, or a rule set (the workspace's rules/, then the kit's)
 * that gives strength, modulus and density; refused by name otherwise. Used by plasticOf and by cad set's check.
 * @param {any} raw the material as written @param {string} [where] what names it, for the refusal @returns {string | object}
 */
export function plasticNamed(raw, where = 'the project') {
  const m = String(raw || 'pla').trim().toLowerCase().split(/\s/)[0];
  if (['pla', 'petg'].includes(m)) return m;
  let set = null; try { set = peekRuleSet(m); } catch {}
  const lacks = ['strength', 'modulus', 'density'].filter((k) => !(typeof set?.rules?.[k]?.value === 'number'));
  const have = plastics().join(', ');
  if (set && !lacks.length && rubber(set.rules)) throw new Error(`${where}: its material is ${JSON.stringify(raw)}, a rubber (its strength over its modulus is ${(set.rules.strength.value / set.rules.modulus.value).toFixed(2)}, a strain far past where its stiffness holds), and printed fittings are sized with sums for a stiff plastic that do not hold for it. Set the material to one of ${have}`);
  if (set && !lacks.length) return set;
  throw new Error(`${where}: its material is ${JSON.stringify(raw)}, and printed fittings are sized from their plastic's strength, modulus and density: ${set ? `rules/${m}.json gives no ${lacks.join(', ')}` : `the kit and this workspace have rule sets for ${have}, and there is no rules/${m}.json`}. Give rules/${m}.json with all three, or set the material to one of ${have}`);
}

// A rubber (TPU): its strength over its modulus, the strain where a stiff plastic yields, is past 0.5. Its stiffness
// holds only at small strains and it never yields as a plastic does, so the fittings' sums are not for it
const rubber = (r) => r.strength.value / r.modulus.value > 0.5;

/**
 * The plastics a project can name: the rule sets (the workspace's rules/, then the kit's) that give strength, modulus,
 * density and modulus_z, the modulus across a print's layers, which only a printed plastic's set gives; a rubber's is left out.
 * @returns {string[]} their names, sorted
 */
export function plastics() {
  const out = new Set();
  for (const d of RULE_DIRS) {
    let files = []; try { files = fs.readdirSync(d).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      let r; try { r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).rules; } catch { continue; }
      if (['strength', 'modulus', 'density', 'modulus_z'].every((k) => typeof r?.[k]?.value === 'number') && !rubber(r)) out.add(f.slice(0, -5));
    }
  }
  return [...out].sort();
}

/**
 * The printed parts that come with a fitting the assembly places one part of: a printed levelling foot's pad, where an
 * item places its body and none its pad at the same address (a generated frame's feet). The pad is printed and screwed
 * in by hand once the body is on, so it goes on a plate and on the list, and is not placed in the model.
 * @param {object} s a built assembly @returns {{ id: string, of: string, fitting: object, grams: number }[]}
 */
export function companions(s) {
  const items = s.items ?? [], out = [];
  for (const o of s.objects) {
    if (o.unplaced || o.fitting?.fitting !== 'levelling-foot' || !o.fitting.printed) continue;
    const it = items.find((x) => x.id === o.id);
    if (!it?.fitting || (it.fitting.part ?? 'body') !== 'body') continue;
    if (items.some((x) => x.fitting?.kind === 'levelling-foot' && x.fitting.part === 'pad' && JSON.stringify(x.at) === JSON.stringify(it.at))) continue;
    const { pose, ...spec } = it.fitting;
    out.push({ id: `${o.id}-pad`, of: o.id, fitting: { ...spec, part: 'pad' }, grams: o.fitting.padGrams });
  }
  return out;
}

/**
 * A fitting's model from an item's "fitting" (or a join's), refused by name where a key is not one it takes.
 * @param {object} spec { kind: bracket | gusset | splice, profile, other, face, otherFace, shape, brace, load, count, thread, head, nut }
 * @param {object} context framesContext()'s @param {string | object} [material] pla, petg or a material's rule set (plasticOf) @param {string} [what] who asks
 */
export function fittingModel(spec, context, material = 'pla', what = 'fitting') {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`${what}: fitting is { "kind": "bracket", "profile": "2020-misumi-hfs5" } (got ${shown(spec)})`);
  if (!FITTING_KINDS.includes(spec?.kind)) throw new Error(`${what}: fitting.kind is one of ${FITTING_KINDS.join(', ')} (got ${shown(spec?.kind)})`);
  if (MORE[spec.kind]) return moreModel(spec, context, material, what);
  for (const k of Object.keys(spec)) if (!KEYS.includes(k)) throw new Error(`${what}: a fitting has no "${k}": it takes ${KEYS.join(', ')}`);
  const given = givenFor(context, spec.profile), o = { given, material, cache: fittingCache };
  for (const k of ['thread', 'head', 'nut', 'load']) if (spec[k] != null) o[k] = spec[k];
  try {
    if (spec.kind === 'bracket') return bracketModel(spec.profile, { ...o, ...(spec.other ? { other: spec.other } : {}), ...(spec.face ? { face: spec.face } : {}), ...(spec.otherFace ? { otherFace: spec.otherFace } : {}), ...(spec.brace != null ? { brace: spec.brace } : {}) });
    return plateModel(spec.profile, { ...o, shape: spec.kind === 'splice' ? 'splice' : spec.shape ?? 'L', ...(spec.other ? { other: spec.other } : {}), ...(spec.face ? { face: spec.face } : {}), ...(spec.count != null ? { count: spec.count } : {}) });
  } catch (e) { throw new Error(`${what}: ${strip(e)}`); }
}

// A panel's, a door's or an end's fitting: its options are the model's own (refused by name there), its part chosen
function moreModel(spec, context, material, what) {
  const [model, , o = {}] = MORE[spec.kind], { kind, profile, part, ...rest } = spec;
  // (a device mount names its device's rule set, which is read here: its holes come from it)
  if (kind === 'device-mount') {
    if (typeof rest.device !== 'string') throw new Error(`${what}: a device mount names its device's rule set in "device", as supply-24v (got ${shown(rest.device)})`);
    try { rest.device = peekRuleSet(rest.device); } catch (e) { throw new Error(`${what}: device: ${e.message}`); }
  }
  if (o.parts ? part != null && !o.parts.includes(part) : part != null) throw new Error(`${what}: ${o.parts ? `part is ${o.parts.join(' or ')}` : `a ${kind} has one part: leave part out`} (got ${shown(part)})`);
  if (o.profile !== false && typeof profile !== 'string') throw new Error(`${what}: a ${kind} is drawn for a profile: give "profile", as 2020-misumi-hfs5 (got ${shown(profile)})`);
  if (o.profile === false && profile != null) throw new Error(`${what}: a ${kind} is drawn for no profile: leave profile out`);
  // (a gasket strip is PETG, which springs back, unless the item says otherwise; the rest take the project's plastic)
  try {
    const m = o.profile === false ? frames[model]({ ...(kind === 'gasket-strip' ? {} : { material }), ...rest }) : frames[model](profile, { given: givenFor(context, profile), material, ...rest });
    // (a printed carrier in a slot is its own kind of model: named here as a fitting, with the nut or insert it holds to buy)
    if (kind === 'nut-carrier') return { ...m, fitting: 'nut-carrier', hardware: [{ kind: m.holds === 'insert' ? 'insert' : 'nut', name: `${m.thread} ${m.holds === 'insert' ? 'heat-set insert' : 'hex nut'}`, thread: m.thread, count: m.count ?? 1, why: `held in the carrier, ${m.holds === 'insert' ? 'pressed in from below' : 'slid in from the side'}` }] };
    return m;
  } catch (e) { throw new Error(`${what}: ${String(e?.message ?? e).replace(/^\w+: /, '')}`); }
}

/**
 * An item with "fitting", built: its solid in its fitted frame as a printed part (counted on cad list by its grams), its
 * figures as values (br.thickness, br.grams, br.margin, br.stiffness), and the model kept for the joins' checks.
 * @param {object} it the item @param {string} id @param {object} context @param {string} [material]
 */
export async function fittingBuilt(it, id, context, material = 'pla') {
  // "pose": "print" lays it as it prints, for a plate (cad plates writes it so); the model is the same either way
  const { pose = 'fit', ...spec } = it.fitting ?? {};
  if (pose !== 'fit' && pose !== 'print') throw new Error(`item ${id}: fitting.pose is fit (in its place, the default) or print (as it prints, for a plate) (got ${shown(pose)})`);
  const m = fittingModel(spec, context, material, `item ${id}`);
  // joined and cut by Manifold where the workspace has it, so the solid is watertight for the overlap check (JSCAD's
  // booleans leave seams that Manifold cannot read, and JSCAD's own intersection then misreads a head in its seat)
  let ops = null; try { ops = await booleans('manifold'); } catch {}
  if (MORE[it.fitting.kind]) return moreBuilt(it, id, m, ops, pose);
  const draw = (o) => { const f = m.fitting === 'bracket' ? bracket : plate; try { return f(m, { ...o, ...(ops ? { ops } : {}) }); } catch { return f(m, o); } };
  const parts = named({ body: draw({ pose }) }, { body: { label: m.title } });
  // its tongues stand in the slots, inside the beams' envelopes: the overlap check measures the body without them
  if (pose === 'fit') parts[0].collide = named({ body: draw({ pose: 'fit', tongues: false }) }, {})[0].geometry;
  // an anchor on each screw's axis at its head's seat, z out of the fitting toward the head: b1, b2 .. into b; a1 .. into a
  const count = { a: 0, b: 0 }, anchors = Object.fromEntries(m.screws.map((sc) => [`${sc.leg}${++count[sc.leg]}`, { at: m.fitting === 'bracket' ? sc.at : [sc.at[0], sc.at[1], m.thickness], axis: sc.axis.map((c) => (c ? -c : 0)) }]));
  const values = { thickness: m.thickness, width: m.width, grams: m.grams, margin: m.margin, stiffness: m.stiffness.bending, load: m.load.force, ...(m.leg ? { leg: m.leg } : { arm: m.arm }) };
  const entries = Object.entries({ thickness: ['mm', 'sized from the load'], grams: ['g', 'its mass'], margin: ['×', 'its strength over the peak stress at the load, by finite elements'], stiffness: ['N mm/rad', 'its own bending stiffness about the joint, by finite elements'] })
    .map(([k, [unit, rule]]) => ({ name: `${m.name}.${k}`, value: values[k], unit, rule: `The printed fitting's ${rule}`, kind: 'derived', source: '@rulecad/frames fitting.mjs', checked: '2026-11-17', set: m.name }));
  const hash = crypto.createHash('sha256').update(JSON.stringify([it.fitting, material, m.name, m.thickness, m.grams])).digest('hex').slice(0, 16);
  const b = { object: { name: m.name, title: m.title, role: 'part', version: '0.0.0', anchors }, values, entries, deps: [], units: {}, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles), hash };
  return { key: `fitting:${id}:${hash}`, objName: `fitting:${m.name}`, b, version: '0.0.0', role: 'part', fitting: m };
}

// A panel's, a door's or an end's fitting built: fitted, its tongue (where it has one) left out of the overlap check;
// an anchor on each screw's axis at its head (b1, b2 .. for screws into a slot or a bore; d1, d2 .. for a hinge's
// door leaf's, through the door); a hinge's door leaf and a levelling foot's pad carry no findings or hardware of their own
function moreBuilt(it, id, m, ops, pose = 'fit') {
  const [, solid, o = {}] = MORE[it.fitting.kind], part = it.fitting.part ?? o.parts?.[0], second = o.parts && part !== o.parts[0];
  const drawn = o.pose?.[pose] ?? pose, draw = (x) => { const f = (y) => frames[solid](m, { pose: drawn, ...(part ? { part } : {}), ...x, ...y }); try { return f(ops ? { ops } : {}); } catch { return f({}); } };
  const parts = named({ body: draw({}) }, { body: { label: `${m.title}${part ? `, ${part}` : ''}` } });
  if (TONGUED.includes(m.fitting) && pose === 'fit') parts[0].collide = named({ body: draw({ tongues: false }) }, {})[0].geometry;
  if (IN_SLOT.includes(m.fitting) && pose === 'fit') { const { intersect } = jscad.booleans, { cuboid } = jscad.primitives, above = intersect(parts[0].geometry, cuboid({ size: [1e4, 1e4, 1e3], center: [0, 0, 500] })); parts[0].collide = above; }
  const list = it.fitting.kind === 'hinge' && part === 'door' ? m.door.map((q, k) => [`d${k + 1}`, q]) : (m.screws ?? []).filter((q) => q.into !== 'castor' && q.into !== 'pilot').map((q, k) => [`b${k + 1}`, q]);
  const anchors = { ...Object.fromEntries(list.map(([n, q]) => [n, { at: q.at, axis: q.axis.map((c) => (c ? -c : 0)) }])), ...(m.anchors ?? {}) }; // (and its own: a mount's device and screws, a clip's cable)
  const values = { grams: m.grams, ...(m.margin != null && Number.isFinite(m.margin) ? { margin: m.margin } : {}), ...(m.load?.force ? { load: m.load.force } : {}) };
  const hash = crypto.createHash('sha256').update(JSON.stringify([it.fitting, m.name, m.grams, part])).digest('hex').slice(0, 16);
  const b = { object: { name: `${m.name}${part ? `-${part}` : ''}`, title: m.title, role: 'part', version: '0.0.0', anchors }, values, entries: [], deps: [], units: {}, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles), hash };
  const model = second ? { ...m, findings: [], hardware: [] } : m;
  return { key: `fitting:${id}:${hash}`, objName: `fitting:${m.name}${part ? `-${part}` : ''}`, b, version: '0.0.0', role: 'part', fitting: model };
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
  const what = `join ${i + 1}`, label = j.note || `${j.kind} join of ${j.a} to ${j.b}`, bm = m.fitting?.bought ?? null, made = bm ? bm.set : `a printed ${j.kind}`;
  const fa = placeOf(ia, num), fb = placeOf(ib, num);
  if (!fa || !fb) throw new Error(`${what}: ${made} is placed from where the beams are: place ${!fa ? ia.id : ib.id} by its ends (from, to)`);
  const free = (base) => { let n = base, k = 2; while (ids.has(n)) n = `${base}-${k++}`; ids.add(n); return n; };
  // a bought anchor connector: its post along a's axis from b's face, at the place on b the join names
  if (bm && j.kind === 'anchor') {
    const id = free(`${ia.id}-${ib.id}-${j.kind}`);
    return { item: { id, bought: bm.set, at: `${ib.id}.${m.b.place}@${r3(m.b.distance)}`, join: i }, fasten: [], model: bm };
  }
  // its screws, each by the set's thread, length and head, into the set's nut where it names one (a corner bracket's
  // and a plate's); an inner connector's grub screws are part of it
  const boughtFasten = (id, legs) => legs.map(([leg, beam, place]) => ({ screw: `${bm.thread}${bm.length != null ? `x${bm.length}` : ''} ${bm.head}`, through: [id], into: `${beam}.${place}`, at: bm.screws.filter((q) => q.leg === leg).map((_, k) => `${id}.${leg}${k + 1}`), note: `${label}: ${bm.set} into ${beam}`, join: i, ...(bm.nutKind ? { nut: bm.nutKind } : {}) }));
  if (j.kind === 'bracket' || j.kind === 'hidden') {
    const bp = B.places.find((q) => q.name === m.b.place), d = m.b.distance, ub = col(fb, 2), nb = turn(fb, [...bp.normal, 0]);
    const P = world(fb, [bp.at[0], bp.at[1], d]), roomB = B.length - d, sign = roomB >= d ? 1 : -1, dir = ub.map((c) => c * sign);
    // a's face that looks along b, toward the side with more room; of its slots, the one in the bracket's plane
    const z = cross(dir, nb), faces = A.places.filter((q) => q.slot && dot(turn(fa, [...q.normal, 0]), dir) > 1 - 1e-6);
    if (!faces.length) throw new Error(`${what}: a printed bracket lies on a face of ${ia.id} that looks along ${ib.id}, and none of ${ia.id}'s slotted faces does: turn ${ia.id} with roll so one faces along ${ib.id}`);
    const ap = faces.map((q) => ({ q, Q: world(fa, [q.at[0], q.at[1], 0]) })).sort((x, y) => Math.abs(dot(sub(x.Q, P), z)) - Math.abs(dot(sub(y.Q, P), z)))[0];
    const off = dot(sub(ap.Q, P), dir), at = d + sign * off, spec = { kind: 'bracket', profile: B.profile.name, ...(A.profile.name !== B.profile.name ? { other: A.profile.name } : {}), face: faceOf(B, bp), otherFace: faceOf(A, ap.q), ...(j.brace != null ? { brace: j.brace } : {}), ...(j.load != null ? { load: j.load } : {}), ...(j.nut ? { nut: j.nut } : {}) };
    const fm = bm ?? fittingModel(spec, context, material, what), room = sign > 0 ? B.length - at : at, endA = ends.a.rest[0], aRoom = A.length, said = bm ? `${bm.set}'s` : 'a printed bracket\'s';
    if (room < fm.leg - 1e-6) throw new Error(`${what}: ${said} ${mm(fm.leg)} mm leg runs ${mm(fm.leg - room)} mm past ${ib.id}'s end ${sign > 0 ? 'b' : 'a'}: it goes on the side of ${ia.id} with more of ${ib.id}, and there is only ${mm(room)} mm there. A gusset or a blind join will do`);
    if (aRoom < (fm.legA ?? fm.leg) - 1e-6) throw new Error(`${what}: ${said} ${mm(fm.legA ?? fm.leg)} mm leg is longer than ${ia.id} (${mm(aRoom)} mm)`);
    const id = free(`${ia.id}-${ib.id}-${bm ? j.kind : 'bracket'}`);
    if (bm) {
      const item = { id, bought: bm.set, at: `${ib.id}.${bp.name}@${r3(at)}`, rotate: sign > 0 ? [90, 0, 0] : [90, 0, 180], join: i };
      return { item, fasten: j.kind === 'hidden' ? [] : boughtFasten(id, [['b', ib.id, bp.name], ['a', ia.id, ap.q.name]]), model: bm, side: sign > 0 ? 'b' : 'a', endA };
    }
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
  // a gusset on the other face of b (j.face): the same L turned over its diagonal, its arm drawn for b along a and its
  // arm drawn for a along b, so it lies on the faces looking along -n (a mirror image of the L is itself turned so)
  let flip = false;
  if (j.face != null) {
    const want = B.places.find((q) => q.slot && (q.name === j.face || (q.face === j.face && q.name.endsWith('.1'))));
    const along = want ? dot(turn(fb, [...want.normal, 0]), n) : 0;
    if (!want || Math.abs(Math.abs(along) - 1) > 1e-6) {
      const can = B.places.filter((q) => q.slot && Math.abs(Math.abs(dot(turn(fb, [...q.normal, 0]), n)) - 1) < 1e-6).map((q) => faceOf(B, q));
      throw new Error(`${what}: face is the face of ${ib.id} a printed gusset lies on, square to ${ia.id}: ${[...new Set(can)].join(' or ') || 'none of its slotted faces is'} (got ${JSON.stringify(j.face)})`);
    }
    if (along < 0) { flip = true; n = n.map((c) => -c); }
  }
  const bq = B.places.find((q) => q.slot && dot(turn(fb, [...q.normal, 0]), n) > 1 - 1e-6), aq = A.places.find((q) => q.slot && dot(turn(fa, [...q.normal, 0]), n) > 1 - 1e-6);
  if (!bq || !aq) throw new Error(`${what}: a printed ${splice ? 'splice plate' : 'gusset'} lies on a slotted face of both beams that looks the same way, and ${!bq ? ib.id : ia.id} has none that does: turn it with roll`);
  const Pb = world(fb, [bq.at[0], bq.at[1], d]), Qa = world(fa, [aq.at[0], aq.at[1], 0]), apart = dot(sub(Qa, Pb), n);
  if (Math.abs(apart) > 0.05) throw new Error(`${what}: a printed ${splice ? 'splice plate' : 'gusset'} lies flat on both beams, and ${ia.id}'s ${aq.face} face stands ${mm(Math.abs(apart))} mm ${apart > 0 ? 'proud of' : 'below'} ${ib.id}'s ${bq.face} face`);
  const spec0 = { kind: splice ? 'splice' : 'gusset', profile: B.profile.name, ...(A.profile.name !== B.profile.name ? { other: A.profile.name } : {}), face: faceOf(B, bq), ...(j.load != null ? { load: j.load } : {}), ...(j.nut ? { nut: j.nut } : {}) };
  let fm = bm ?? fittingModel({ ...spec0, ...(splice ? {} : { shape: 'L' }) }, context, material, what), shape = bm?.shape ?? 'L';
  if (bm) {
    // a bought plate's shape is its set's: a T needs room along b both sides of a, an L on one
    const { room } = shapeAt ?? { room: { a: Infinity, b: Infinity } }, xs = fm.outline.map((q) => q[0]), reach = Math.max(...xs.map(Math.abs));
    if (shape === 'T' && Math.min(room.a, room.b) + (A.profile.width / 2) < reach - 1e-6) throw new Error(`${what}: ${bm.set} is a T, ${mm(2 * reach)} mm along ${ib.id}, and there is ${mm(Math.min(room.a, room.b))} mm on one side of ${ia.id}: an L or a bracket will do`);
    const id = free(`${ia.id}-${ib.id}-${splice ? 'splice' : 'gusset'}`), along = dot(x, ub) > 0;
    const item = { id, bought: bm.set, at: `${ib.id}.${bq.name}@${r3(d)}`, ...(along ? {} : { rotate: [0, 0, 180] }), join: i };
    return { item, fasten: boughtFasten(id, [['b', ib.id, bq.name], ['a', ia.id, aq.name]]), model: bm };
  }
  if (flip && (A.profile.name !== B.profile.name || aq.slot !== bq.slot)) throw new Error(`${what}: a printed gusset turned onto ${ib.id}'s ${j.face} face puts the arm drawn for ${ib.id}'s slot in ${ia.id}'s, and ${ia.id}'s ${aq.face} face (${aq.slot}) and ${ib.id}'s ${bq.face} face (${bq.slot}) differ: leave face out, or join with a bracket`);
  if (!splice) {
    const reach = fm.width / 2 + fm.arm, { room } = shapeAt;
    const fits = Math.min(room.a, room.b) + fm.width / 2 >= reach;
    if (j.shape === 'T' && flip) throw new Error(`${what}: shape T: a printed gusset turned onto ${ib.id}'s ${j.face} face is an L only (a T's bar would lie along ${ia.id}): give shape L, or leave face out`);
    if (j.shape === 'T' && !fits) throw new Error(`${what}: shape T: a printed T gusset's bar runs ${mm(fm.arm)} mm along ${ib.id} on both sides of ${ia.id}, and there is ${mm(Math.min(room.a, room.b))} mm on one side: give shape L, or leave shape out`);
    if (!flip && fits && j.shape !== 'L') { shape = 'T'; fm = fittingModel({ ...spec0, shape }, context, material, what); } // (an L only, turned over: a T's bar would lie along a)
    else if (Math.max(room.a, room.b) + fm.width / 2 < reach - 1e-6) throw new Error(`${what}: a printed gusset's ${mm(fm.arm)} mm arm runs past ${ib.id}'s ends: there is ${mm(Math.max(room.a, room.b))} mm beside ${ia.id}, and it needs ${mm(fm.arm)}. A bracket will do`);
    if (A.length < fm.arm - 1e-6) throw new Error(`${what}: a printed gusset's ${mm(fm.arm)} mm arm is longer than ${ia.id} (${mm(A.length)} mm)`);
  } else if (Math.min(A.length, B.length) < fm.arm - 1e-6) throw new Error(`${what}: a printed splice plate's ${mm(fm.arm)} mm arms are longer than ${A.length < B.length ? ia.id : ib.id}`);
  if (A.profile.name !== B.profile.name && faceOf(A, aq) !== faceOf(B, bq)) throw new Error(`${what}: a printed plate is drawn for one profile's slots, and ${ia.id} (${A.profile.name}) and ${ib.id} (${B.profile.name}) differ: a bracket takes two`);
  const id = free(`${ia.id}-${ib.id}-${splice ? 'splice' : 'gusset'}`), along = dot(x, ub) > 0;
  const spec = { ...spec0, ...(splice ? {} : { shape }) };
  // (at b's face's anchor the item's x runs along b and its z out of the face; turned over, its x runs along a: a
  // quarter turn about z, the way that keeps its arm drawn for b along a away from b)
  const item = { id, fitting: spec, at: `${ib.id}.${bq.name}@${r3(d)}`, ...(flip ? { rotate: [0, 0, along ? -90 : 90] } : along ? {} : { rotate: [0, 0, 180] }), join: i };
  const anchorsOf = (leg) => fm.screws.map((sc, k) => [sc, k]).filter(([sc]) => sc.leg === (flip ? (leg === 'a' ? 'b' : 'a') : leg)).map((_, k) => `${id}.${flip ? (leg === 'a' ? 'b' : 'a') : leg}${k + 1}`);
  const fasten = [{ screw: `${fm.thread} ${fm.head}`, through: [id], into: `${ib.id}.${bq.name}`, at: anchorsOf('b'), note: `${label}: the ${splice ? 'splice plate' : 'gusset'} into ${ib.id}`, join: i, nut: j.nut ?? fm.screws[0].nutKind },
    { screw: `${fm.thread} ${fm.head}`, through: [id], into: `${ia.id}.${aq.name}`, at: anchorsOf('a'), note: `${label}: the ${splice ? 'splice plate' : 'gusset'} into ${ia.id}`, join: i, nut: j.nut ?? fm.screws[0].nutKind }];
  return { item, fasten, model: fm };
}

/**
 * A join's stiffness once its printed fitting is drawn: the fitting's own bending stiffness by finite elements, times
 * the share of it the joint keeps (the joins set's <kind>_printed_share: 1 until the joint rig measures it), its twist
 * still the kind's, in the shape @rulecad/frames' joinStiffness gives.
 * @param {object} k joinStiffness's @param {object} fm the fitting's model
 */
export function fittedStiffness(k, fm) {
  const share = k.share ?? { value: 1, kind: 'estimate' }, fe = fm.stiffness.bending, bending = fe * share.value;
  return { ...k, bending, end: { rx: k.twist, ry: bending, rz: bending }, measured: { ...(k.measured ?? {}), bending: share.kind === 'measured' ? share.checked ?? null : null }, fitting: { name: fm.name, bending, fe, share: share.value, shareKind: share.kind, linear: fm.stiffness.linear, margin: fm.margin, grams: fm.grams, load: fm.load.force },
    rests: [{ value: fe, unit: 'N mm/rad', kind: 'derived', source: `${fm.name}: by finite elements on the printed fitting as drawn; the slot nuts and lips not in it` }, ...(share.value !== 1 || share.kind === 'measured' ? [{ value: share.value, unit: '', kind: share.kind, source: share.source, ...(share.checked ? { checked: share.checked } : {}) }] : []), ...k.rests.slice(1)] };
}

/**
 * A built assembly's printed fittings' own findings (fitting.size, fitting.margin at the named load, fitting.screw,
 * fitting.stiffness, fitting.mass and the rest), each said of its item. @param {object} s a built assembly @param {Function} f the findings' sink
 */
export function fittingFindings(s, f) {
  for (const o of s.objects) if (o.fitting && !o.unplaced) for (const x of o.fitting.findings) f(x.level, `${o.id}: ${x.text}`, x.level === 'fail' || x.level === 'warn' ? `${o.id}: ${x.code.split('.')[1]}` : null, { code: x.code, ...(x.values ? { values: x.values } : {}), refs: { item: o.id, fitting: o.fitting.name, ...(x.refs ?? {}) } });
}

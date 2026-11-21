// Frames from a size: a box, a portal, a table, a gantry on its base and a shelf, each asked for by the volume it must
// enclose (inside) or fit within (outside), in one square profile, with a kind of join. Each expands into beams placed
// by their ends, the joins between them, the fittings at the ends no join covers (a foot or an end cap) and, where
// asked, panels and gusset braces: plain data in an assembly's own words, so a person can write it out and edit it.
//
// The corner arrangement follows the join. A join that puts an end against a face (blind, end-tap, bracket, gusset,
// hidden, anchor) has the upright beams run through, top to bottom, and every other beam butt against their faces, so
// a butting beam is shorter than the span it closes by the profile's width at each end. A cube join puts every beam's
// end into a three-way corner node, so every beam is as long as the inside it bounds and the corners are the nodes'.
// An end-tap join's screw runs right across the upright it meets, so two of them at one height on an upright (one from
// a beam across, one from a beam along) would cross inside it: with end-tap, each ring's beams along (y) sit one width
// above its beams across (x), and a table's one width below, so each screw has the upright to itself. The rings are
// that width deeper, and the outside grows by it.
//
// Axes: x is the width, y the depth, z up; the frame's outside starts at the origin. Units: mm.
import { profileModel } from './profile.mjs';
import { JOINS } from './join.mjs';
import { footModel, levellingFootModel, stackingFootModel } from './ends.mjs';
import { nutFor } from './slotnut.mjs';
import { fixingModel } from '@rulecad/fixings';

const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const r3 = (x) => +x.toFixed(3);
const mm = (x) => String(r3(x));

/**
 * The kinds of frame there are, each with the size it takes (inside and outside: [width, depth, height], or a
 * portal's [width, height]) and what it is.
 * @type {Record<string, { size: string[], what: string, sides: string[] }>}
 */
export const FRAME_KINDS = {
  box: { size: ['width', 'depth', 'height'], what: 'four upright beams and a ring of four beams at the bottom and at the top', sides: ['front', 'back', 'left', 'right'] },
  portal: { size: ['width', 'height'], what: 'two upright legs and a beam across their tops, standing in the x-z plane', sides: [] },
  table: { size: ['width', 'depth', 'height'], what: 'four legs and a ring of four beams at the top; height is the clear height under the ring', sides: [] },
  gantry: { size: ['width', 'depth', 'height'], what: 'a box without its two top beams across, and a beam g lying across the two top side beams, riding along them (y) on a sliding joint; height is the clear height under the side beams', sides: ['left', 'right'] },
  shelf: { size: ['width', 'depth', 'height'], what: 'a box with rings between the bottom and the top, spacing its height into equal clear bays', sides: ['front', 'back', 'left', 'right'] },
};

/** The joins a generator arranges its corners for: by face (posts run through) or by node (every beam butts into a corner). */
export const FRAME_JOINS = { blind: 'face', 'end-tap': 'face', bracket: 'face', gusset: 'face', hidden: 'face', anchor: 'face', cube: 'node' };

/** The feet a generator puts under the upright beams' lower ends, by name: the printed fitting's kind. */
export const FRAME_FEET = { foot: 'foot', levelling: 'levelling-foot', castor: 'castor-plate', stacking: 'stacking-foot' };

/** The working figures of the generators, each with what it rests on. */
export const FRAME_GEN = {
  clear: { value: 2, unit: 'mm', rule: 'A gantry\'s moving beam stops this far short of the upright beams at either end of its travel, so it never rubs their end caps', kind: 'default', source: 'A working figure of @rulecad/frames', checked: '2026-11-17' },
};

const KEYS = ['inside', 'outside', 'profile', 'join', 'feet', 'caps', 'braces', 'panels', 'shelves', 'given'];
const THROUGH = ['drop-in', 'roll-in', 'hammer', 't-bolt']; // (the slot nuts that go in through the opening)
const SIDE_OUT = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0] };
// the printed feet screwed into an upright's end, by the model that says the tap and screw they take
const FOOT_MODELS = { foot: footModel, 'levelling-foot': levellingFootModel, 'stacking-foot': stackingFootModel };
// the joins that drill an upright where a butting beam meets it (an access hole for the key, a clearance hole)
const DRILLS_POST = ['blind', 'end-tap', 'hidden', 'anchor'];
const feetFix = new Map(); // (each kind's tap and screw in each profile, worked out once)
function footFix(kind, profile, given) {
  const key = `${kind}|${typeof profile === 'string' ? profile : profile?.name}|${JSON.stringify(given ?? {})}`;
  if (!feetFix.has(key)) { const m = FOOT_MODELS[kind](profile, { end: 'a', ...(given ? { given } : {}) }), t = m.ops.find((x) => x.op === 'tap'), sc = m.screws.find((x) => x.into === 'bore'); feetFix.set(key, t && sc ? { thread: t.thread, depth: t.depth, head: sc.head, bore: t.at.slice(1) } : null); }
  return feetFix.get(key);
}

/**
 * A frame from a size: its beams (each { id, role, length, from, to }, placed by its ends, a its from), its joins
 * ({ kind, a, b } and the fitting or screw the join was given), the fittings at the ends no join covers ({ id, at,
 * fitting } for a printed one by kind, or { id, at, bought } for a set), its panels ({ id, sheet, thickness, bay, out }),
 * a gantry's moving beam (moving: { id, length, from, to, track, along, travel }), and its sizes: inside and outside
 * [x, y, z] (a portal's y is the profile's width) and the cut lengths. Refused by name: an unknown kind or key, no size
 * or both, a size that leaves no room for the beams, a profile that is not square, a join the generators do not
 * arrange, a blind or end-tap join on a profile with no bore in its ends, a join's nut that slides in or that has no
 * printed fitting to hold, feet with a cube join, and a side with no bay.
 * @param {string} kind box, portal, table, gantry or shelf (FRAME_KINDS)
 * @param {{ inside?: number[], outside?: number[], profile: string, join?: string | { kind: string, fitting?: string, screw?: string, nut?: string }, feet?: string | null, caps?: boolean | string, braces?: string[], panels?: { sheet: string, thickness: number, sides?: string[] }, shelves?: number, given?: object }} o
 * @returns {{ kind: string, profile: string, width: number, join: object, arrangement: 'face' | 'node', inside: number[], outside: number[], beams: object[], joins: object[], ends: object[], panels: object[], moving: object | null, lengths: { length: number, count: number, ids: string[] }[] }}
 */
export function frameModel(kind, o = {}) {
  const spec = FRAME_KINDS[kind];
  if (!spec) throw new Error(`frameModel: no kind of frame ${shown(kind)}: there are ${Object.keys(FRAME_KINDS).join(', ')}`);
  const w = `frameModel: a ${kind}`;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${w} takes { inside or outside, profile, join, feet, caps, braces, panels${kind === 'shelf' ? ', shelves' : ''} } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!KEYS.includes(k)) throw new Error(`${w} has no "${k}": it takes ${KEYS.filter((x) => x !== 'given').join(', ')}`);
  if ((o.inside == null) === (o.outside == null)) throw new Error(`${w} is asked for by one size: inside (the volume it encloses) or outside (the volume it must fit in), [${spec.size.join(', ')}] in mm (got ${o.inside == null ? 'neither' : 'both'})`);
  const by = o.inside != null ? 'inside' : 'outside', size = o[by];
  if (!Array.isArray(size) || size.length !== spec.size.length || !size.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) throw new Error(`${w}: ${by} is [${spec.size.join(', ')}], each a number of mm above 0 (got ${shown(size)})`);
  if (o.shelves != null && kind !== 'shelf') throw new Error(`${w} has no shelves: give them on a shelf`);
  const shelves = kind === 'shelf' ? (o.shelves ?? 1) : 0;
  if (!Number.isInteger(shelves) || shelves < 0 || shelves > 20) throw new Error(`${w}: shelves is a whole number of rings between the bottom and the top, 1 to 20 (got ${shown(o.shelves)})`);
  // the profile: square, so each beam's width is the same whichever way it lies
  if (typeof o.profile !== 'string' || !o.profile) throw new Error(`${w}: profile names a square profile, such as 2020-misumi-hfs5 (got ${shown(o.profile)})`);
  let P;
  try { P = profileModel(o.profile, {}, o.given ?? {}); } catch (e) { throw new Error(`${w}: ${String(e.message).replace(/^\w+: /, '')}`); }
  if (Math.abs(P.width - P.height) > 1e-9) throw new Error(`${w}: a generated frame takes a square profile, and ${o.profile} is ${mm(P.width)} x ${mm(P.height)} mm: its beams would face differently by which way they lie. Choose a square one (2020, 3030, 4040), or write the frame out (cad frame --expand) and change its beams by hand`);
  const p = P.width;
  // the join, and the arrangement it asks for
  const join = typeof o.join === 'string' ? { kind: o.join } : o.join == null ? { kind: 'blind' } : { ...o.join };
  if (!join || typeof join !== 'object' || Array.isArray(o.join)) throw new Error(`${w}: join is a kind (blind) or { kind, fitting, screw, nut } (got ${shown(o.join)})`);
  for (const k of Object.keys(join)) if (!['kind', 'fitting', 'screw', 'nut'].includes(k)) throw new Error(`${w}: join takes kind, fitting, screw and nut (got "${k}")`);
  const arrangement = FRAME_JOINS[join.kind];
  if (!arrangement) throw new Error(`${w}: join is one of ${Object.keys(FRAME_JOINS).join(', ')} (got ${shown(join.kind)})${JOINS[join.kind] ? `: a ${join.kind} join is ${JOINS[join.kind].what}, and no generator arranges corners for it. Generate with blind and change the joins by hand` : ''}`);
  // a printed fitting's slot nuts: every butting beam is shut at both ends by the joins there, so a nut that slides in
  // from an end cannot reach its place. The generator asks for nuts that go in through the slot's opening (drop-in)
  if (join.nut != null && join.fitting !== 'printed') throw new Error(`${w}: join.nut names the slot nuts a printed fitting is drawn for: give "fitting": "printed" on a bracket or gusset join, or leave nut out (got ${shown(join.nut)})`);
  if (join.nut != null && !THROUGH.includes(join.nut)) throw new Error(`${w}: join.nut is a slot nut that goes in through the slot's opening, ${THROUGH.join(', ')}: every butting beam of a generated frame is shut at both ends by its joins, so a nut that slides in from an end cannot reach its place (got ${shown(join.nut)})`);
  // the slot nut a printed fitting (the join's, or a brace's bracket) is drawn for: the first that goes in through the
  // opening and that the kit (or given) has for the profile's slot, drop-in first
  const slotted = Object.keys(P.faces).filter((f) => P.faces[f].some((q) => q.slot)), nutKinds = (kind) => ['M3', 'M4', 'M5', 'M6', 'M8', 'M10'].some((t) => slotted.every((f) => { try { return !!nutFor(P, f, t, { kind, given: o.given ?? {} }); } catch { return false; } }));
  const throughNut = () => THROUGH.find(nutKinds) ?? null, slotNames = [...new Set(slotted.flatMap((f) => P.faces[f].filter((q) => q.slot).map((q) => q.slot)))].join(', ');
  if (join.fitting === 'printed' && join.nut == null) {
    join.nut = throughNut();
    if (!join.nut) throw new Error(`${w}: a printed ${join.kind} is held by slot nuts that go in through the slot's opening (${THROUGH.join(', ')}), and the kit has none for ${o.profile}'s slot (${slotNames}): give a nut set of your own in given.sets, or ${joinsInstead(P, 'printed', o.profile, slotNames, null)}`);
  }
  if (join.fitting === 'printed' && join.nut != null && !nutKinds(join.nut)) throw new Error(`${w}: the kit has no ${join.nut} slot nut for ${o.profile}'s slot (${slotNames})${throughNut() ? `: ${throughNut()} has one` : `: give a nut set of your own in given.sets, or ${joinsInstead(P, 'printed', o.profile, slotNames, null)}`}`);
  if (['blind', 'end-tap'].includes(join.kind) && !P.bores.length) throw new Error(`${w}: a ${join.kind} join screws into the bore in a beam's end, and ${o.profile} has none: join it with bracket or gusset`);
  if (['blind', 'end-tap'].includes(join.kind)) screwFits(w, P, join, o.profile, slotNames, throughNut());
  if (arrangement === 'node' && o.feet != null && !['table', 'portal'].includes(kind)) throw new Error(`${w}: feet stand under an upright beam's end, and with a cube join every end of a ${kind}'s goes into a corner node: leave feet out (the node's own foot comes with the cube's fitting), or join with blind`);
  if (arrangement === 'node' && o.braces?.length) throw new Error(`${w}: braces put a printed corner bracket at each of a side's joins against a face, and a cube join's beams meet at nodes: brace a frame joined blind (or by another face join)`);
  if (o.feet != null && (typeof o.feet !== 'string' || (!FRAME_FEET[o.feet] && !o.feet.startsWith('fitting-')))) throw new Error(`${w}: feet is ${Object.keys(FRAME_FEET).join(', ')}, or a bought foot's set by name (fitting-motedis-foot-m6-d19) (got ${shown(o.feet)})`);
  // a printed foot is screwed into its upright's end bore: its tap and screw, from its own model. Where the join drills
  // the uprights (an access or clearance hole across, at the bottom ring's centre line), the bottom ring rises up the
  // uprights by the tap's depth, so those holes, within half a width of its centre line, stand clear of the tapped end
  let fix = null;
  if (FOOT_MODELS[FRAME_FEET[o.feet]]) { try { fix = footFix(FRAME_FEET[o.feet], o.profile, o.given); } catch (e) { throw new Error(`${w}: feet: ${String(e.message).replace(/^\w+: /, '')}`); } }
  const lift = fix && arrangement === 'face' && ['box', 'shelf', 'gantry'].includes(kind) && DRILLS_POST.includes(join.kind) ? r3(fix.depth) : 0;
  // end-tap: the beams along a ring stand one width off its beams across, so their screws do not cross in the uprights
  const st = join.kind === 'end-tap' && kind !== 'portal' ? p : 0;
  const caps = o.caps ?? true;
  if (typeof caps !== 'boolean' && !(typeof caps === 'string' && caps.startsWith('fitting-'))) throw new Error(`${w}: caps is true (printed end caps), false (none) or a bought end cap's set by name (fitting-motedis-end-cap-20-b6) (got ${shown(o.caps)})`);
  for (const k of ['braces', 'panels']) {
    const list = k === 'braces' ? o.braces : o.panels?.sides;
    if (list == null) continue;
    if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) throw new Error(`${w}: ${k === 'braces' ? 'braces' : 'panels.sides'} is a list of sides (${spec.sides.join(', ') || 'none on a ' + kind}) (got ${shown(list)})`);
    for (const s of list) if (!spec.sides.includes(s)) throw new Error(`${w}: ${k === 'braces' ? 'braces' : 'panels.sides'}: ${shown(s)} is not a side of a ${kind} closed by four beams${spec.sides.length ? `: it has ${spec.sides.join(', ')}` : ': it has none'}`);
  }
  if (o.panels != null) {
    if (!spec.sides.length) throw new Error(`${w} has no side closed by four beams for a panel: its legs stand open below. Panel a box or a shelf`);
    if (typeof o.panels !== 'object' || Array.isArray(o.panels) || typeof o.panels.sheet !== 'string' || !(typeof o.panels.thickness === 'number' && o.panels.thickness > 0)) throw new Error(`${w}: panels is { sheet, thickness, sides } (got ${shown(o.panels)})`);
    for (const k of Object.keys(o.panels)) if (!['sheet', 'thickness', 'sides'].includes(k)) throw new Error(`${w}: panels takes sheet, thickness and sides (got "${k}")`);
  }

  // the inside and outside, [x, y, z]: what the beams add round the inside, by kind
  const add = kind === 'portal' ? [2 * p, 0, p] : kind === 'table' ? [2 * p, 2 * p, p + st] : kind === 'gantry' ? [2 * p, 2 * p, 3 * p + lift + st] : [2 * p, 2 * p, 2 * p + lift + 2 * st];
  const given3 = kind === 'portal' ? [size[0], null, size[1]] : size;
  const inside = [0, 1, 2].map((k) => (kind === 'portal' && k === 1 ? 0 : by === 'inside' ? given3[k] : given3[k] - add[k]));
  const outside = inside.map((v, k) => (kind === 'portal' && k === 1 ? p : v + add[k]));
  const bay = shelves ? (inside[2] - shelves * (p + st)) / (shelves + 1) : inside[2];
  const short = [0, 1, 2].filter((k) => !(kind === 'portal' && k === 1) && !(inside[k] > 0));
  if (short.length || !(bay > 0)) {
    const k = short[0] ?? 2, n = spec.size[kind === 'portal' && k === 2 ? 1 : k];
    throw new Error(`${w}: ${by === 'outside' ? `an outside ${n} of ${mm(given3[k])} mm leaves no room inside: its beams take ${mm(add[k])} mm of it in ${o.profile}` : `the ${n} is above 0`}${!(bay > 0) && !short.length ? `: ${shelves} shelves of ${mm(p)} mm leave no clear bay in ${mm(inside[2])} mm${st ? ` (an end-tap ring takes two widths)` : ''}` : ''}`);
  }
  const [OW, OD, OH] = outside, h = p / 2;
  const beams = [], joins = [], ends = [], panels = [];
  const beam = (id, role, from, to) => { const length = r3(Math.hypot(...to.map((v, k) => v - from[k]))); beams.push({ id, role, length, from: from.map(r3), to: to.map(r3) }); return id; };

  // the levels: the heights of the rings' centre lines, from the bottom
  const rings = kind === 'table' ? [OH - h] : kind === 'portal' ? [OH - h] : Array.from({ length: shelves + 2 }, (_, k) => k * (bay + p + st) + h + lift);
  const xs = [h, OW - h], ys = kind === 'portal' ? [h] : [h, OD - h];
  const corners = ys.flatMap((y) => xs.map((x) => [x, y])); // z1 (front left), z2 (front right), z3 (back left), z4 (back right)
  const top = kind === 'gantry' ? rings.length - 1 : -1; // (a gantry's top ring has no beams across x: g rides there)
  const alongAt = (z, r) => (r === top ? z : kind === 'table' ? z - st : z + st); // (a ring's beams along y, end-tap's off its beams across)
  if (arrangement === 'face') {
    corners.forEach(([x, y], i) => beam(`z${i + 1}`, 'upright', [x, y, 0], [x, y, OH]));
    let nx = 0, ny = 0;
    rings.forEach((z, r) => {
      if (r !== top) for (const y of ys) beam(`x${++nx}`, 'across', [p, y, z], [OW - p, y, z]);
      if (kind !== 'portal') for (const x of xs) beam(`y${++ny}`, 'along', [x, p, alongAt(z, r)], [x, OD - p, alongAt(z, r)]);
    });
  } else {
    // every beam into the corner nodes: the uprights in a length between each pair of rings
    const nodes = kind === 'table' || kind === 'portal' ? [null, OH - h] : rings; // (a table's legs stand on the floor)
    corners.forEach(([x, y], i) => {
      for (let k = 0; k < nodes.length - 1; k++) {
        const z0 = nodes[k] == null ? 0 : nodes[k] + h, z1 = nodes[k + 1] - h;
        beam(nodes.length > 2 ? `z${i + 1}-${k + 1}` : `z${i + 1}`, 'upright', [x, y, z0], [x, y, z1]);
      }
    });
    let nx = 0, ny = 0;
    rings.forEach((z, r) => {
      if (r !== top) for (const y of ys) beam(`x${++nx}`, 'across', [p, y, z], [OW - p, y, z]);
      if (kind !== 'portal') for (const x of xs) beam(`y${++ny}`, 'along', [x, p, z], [x, OD - p, z]);
    });
  }

  // the joins, found from where the beams are: each end that stops short of the outside meets a beam's face (face) or
  // a corner node (node)
  const braced = new Set(o.braces ?? []);
  const sideOf = (b) => { const m = b.from.map((v, k) => (v + b.to[k]) / 2), out = []; if (b.role !== 'along' && Math.abs(m[1] - h) < 1e-6) out.push('front'); if (b.role !== 'along' && Math.abs(m[1] - (OD - h)) < 1e-6 && kind !== 'portal') out.push('back'); if (b.role !== 'across' && Math.abs(m[0] - h) < 1e-6) out.push('left'); if (b.role !== 'across' && Math.abs(m[0] - (OW - h)) < 1e-6) out.push('right'); return out; };
  const endOf = (b, e) => ({ at: e === 'a' ? b.from : b.to, out: unit(sub(e === 'a' ? b.from : b.to, e === 'a' ? b.to : b.from)) });
  // the bore a blind or end-tap join screws into: where the end has several, the threaded one nearest the middle
  const threaded = P.bores.map((b, k) => ({ k, b, r: Math.hypot(...(b.at ?? [0, 0])) })).filter((x) => x.b.thread).sort((u, v) => u.r - v.r)[0];
  const bore = ['blind', 'end-tap'].includes(join.kind) && P.bores.length > 1 && threaded ? `.${threaded.k + 1}` : '';
  const braceNut = braced.size && arrangement === 'face' ? throughNut() : null;
  if (braced.size && arrangement === 'face' && !braceNut) throw new Error(`${w}: braces put a printed corner bracket at each of a side's joins, held by slot nuts that go in through the slot's opening (${THROUGH.join(', ')}), and the kit has none for ${o.profile}'s slot (${slotNames}): give a nut set of your own in given.sets, or leave braces out`);
  const joinOf = (braceSide) => (braceSide ? { kind: 'bracket', fitting: 'printed', nut: braceNut } : { ...join });
  if (arrangement === 'face') {
    for (const b of beams.filter((x) => x.role !== 'upright')) for (const e of ['a', 'b']) {
      const E = endOf(b, e), meet = E.at.map((v, k) => v + E.out[k] * h); // the centre line of the beam it meets
      const post = beams.find((q) => q.role === 'upright' && Math.abs(q.from[0] - meet[0]) < 1e-6 && Math.abs(q.from[1] - meet[1]) < 1e-6 && meet[2] >= q.from[2] - 1e-6 && meet[2] <= q.to[2] + 1e-6);
      if (!post) throw new Error(`${w}: ${b.id}'s end ${e} meets no upright beam (this is a fault in the generator, not in the request)`);
      const face = faceOf(post, E.out.map((c) => -c)), along = r3(E.at[2] - post.from[2]);
      const side = sideOf(b).find((s) => braced.has(s));
      // a printed gusset lies on a face of the post square to this beam: the one looking out of the frame, so it never
      // lands on the face where the corner's third beam butts (across the frame's middle from the post)
      const k = Math.abs(E.out[0]) > 0.5 ? 1 : 0, out = [0, 0, 0];
      out[k] = post.from[k] < (k === 0 ? OW : OD) / 2 ? -1 : 1;
      const plate = !side && join.kind === 'gusset' && join.fitting === 'printed' ? { face: faceOf(post, out) } : {};
      joins.push({ ...joinOf(side), a: `${b.id}.${e}${side ? '' : bore}`, b: `${post.id}.${face}@${mm(along)}`, ...plate });
    }
  } else {
    // ends grouped by the node they reach; one beam's end is the node's hub (the beam along x, else along y), every
    // other end there joined to it, so no two joined beams lie on one line
    const nodes = new Map();
    for (const b of beams) for (const e of ['a', 'b']) {
      const E = endOf(b, e), c = E.at.map((v, k) => r3(v + E.out[k] * h)), key = c.join(',');
      if (b.role === 'upright' && (E.at[2] < 1e-6)) continue; // a leg's foot on the floor
      if (!nodes.has(key)) nodes.set(key, []);
      nodes.get(key).push({ b, e });
    }
    const rank = { across: 0, along: 1, upright: 2 };
    for (const list of nodes.values()) {
      list.sort((u, v) => rank[u.b.role] - rank[v.b.role]);
      const [hub, ...rest] = list;
      for (const x of rest) {
        const side = sideOf(x.b).filter((s) => sideOf(hub.b).includes(s)).find((s) => braced.has(s));
        joins.push({ ...joinOf(side), a: `${x.b.id}.${x.e}`, b: `${hub.b.id}.${hub.e}` });
      }
    }
  }

  // the ends no join covers: feet under the uprights' lower ends, caps on the rest
  const covered = new Set();
  for (const j of joins) { covered.add(j.a.split('.').slice(0, 2).join('.')); if (/\.[ab]$/.test(j.b)) covered.add(j.b); }
  for (const b of beams) for (const e of ['a', 'b']) {
    const at = `${b.id}.${e}`;
    if (covered.has(at)) continue;
    const low = b.role === 'upright' && e === 'a' && b.from[2] < 1e-6;
    if (low && o.feet != null) ends.push({ id: `foot-${b.id}`, at, ...(FRAME_FEET[o.feet] ? { fitting: FRAME_FEET[o.feet] } : { bought: o.feet }), role: 'foot', ...(fix ? { tap: { op: 'tap', at: `${e}${fix.bore}`, thread: fix.thread, depth: fix.depth }, screw: `${fix.thread} ${fix.head}` } : {}) });
    else if (caps) ends.push({ id: `cap-${b.id}-${e}`, at, ...(caps === true ? { fitting: 'end-cap' } : { bought: caps }), role: 'cap' });
  }

  // a gantry's moving beam: across the two top side beams, lying on them, from the front to the back. The uprights run
  // one width above the side beams, to the outside height, so g lies between their tops: its bottom on the side beams'
  // top faces (OH - p), its top level with the uprights' (OH), and FRAME_GEN.clear keeps it off them at either end
  let moving = null;
  if (kind === 'gantry') {
    const clear = FRAME_GEN.clear.value, z = OH - h, start = p + clear + h, travel = r3(OD - 2 * p - 2 * clear - p);
    if (!(travel > 0)) throw new Error(`${w}: its depth leaves the moving beam no travel: ${mm(inside[1])} mm inside, less the beam's own ${mm(p)} mm and ${mm(clear)} mm clear at each end (FRAME_GEN.clear)`);
    const track = beams.find((b) => b.role === 'along' && Math.abs(b.from[2] - rings.at(-1)) < 1e-6 && Math.abs(b.from[0] - h) < 1e-6);
    moving = { id: 'g', role: 'moving', length: r3(OW), from: [0, r3(start), r3(z)], to: [r3(OW), r3(start), r3(z)], track: track.id, along: [0, 1, 0], travel };
    if (caps) for (const e of ['a', 'b']) ends.push({ id: `cap-g-${e}`, at: `g.${e}`, ...(caps === true ? { fitting: 'end-cap' } : { bought: caps }), role: 'cap' });
  }

  // panels: one sheet over each side, from its lowest beam to its highest, on the two uprights at its edges (a shelf's
  // rings between lie under it, so the sheet closes every bay of the side, its clips only round its edge)
  if (o.panels) {
    if (arrangement === 'node' && shelves) throw new Error(`${w}: a panel lies on one upright beam at each edge, and a shelf joined by cube nodes has its uprights in lengths between the rings: join it blind (or by another face join) to panel it`);
    for (const s of o.panels.sides ?? spec.sides) {
      const inSide = (b) => sideOf(b).includes(s), flat = beams.filter((b) => b.role !== 'upright' && inSide(b)).sort((u, v) => u.from[2] - v.from[2]);
      const ups = beams.filter((b) => b.role === 'upright' && inSide(b)).sort((u, v) => (s === 'left' || s === 'right' ? u.from[1] - v.from[1] : u.from[0] - v.from[0]));
      panels.push({ id: `panel-${s}`, sheet: o.panels.sheet, thickness: o.panels.thickness, bay: [flat[0].id, ups[1].id, flat.at(-1).id, ups[0].id], out: SIDE_OUT[s], nut: 'drop-in' });
    }
  }

  const lengths = [];
  for (const b of [...beams, ...(moving ? [moving] : [])]) { const l = lengths.find((x) => Math.abs(x.length - b.length) < 1e-6); if (l) { l.count++; l.ids.push(b.id); } else lengths.push({ length: b.length, count: 1, ids: [b.id] }); }
  lengths.sort((u, v) => v.length - u.length);
  return { kind, profile: o.profile, width: p, join, arrangement, by, lift, inside: inside.map(r3), outside: outside.map(r3), ...(kind === 'shelf' ? { shelves, bay: r3(bay) } : {}), beams, joins, ends, panels, moving, lengths };
}

// The bore a blind or end-tap join screws into: where the end has several, the threaded one nearest the middle (any,
// where none names a thread)
const endBore = (P) => [...P.bores].sort((u, v) => !!v.thread - !!u.thread || Math.hypot(...(u.at ?? [0, 0])) - Math.hypot(...(v.at ?? [0, 0])))[0] ?? null;
// the threads a generator tries in an end bore when it says which screw would do
const END_THREADS = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];
const headOf = (kind) => (kind === 'blind' ? 'button' : 'cap');

// What stops a blind or end-tap join's screw in this profile, as cad's check would find it, or null where it fits: its
// thread is cut in the end bore (so wider than the bore), it passes between the lips of the post's slot (blind: into
// its cavity; end-tap: right across the post), and a blind join's head goes into the cavity under the lips (cad's
// beam.op, fasten.clearance and fasten.seat)
function screwFault(P, kind, thread, head, profile, from = 'join.screw') {
  let fx;
  try { fx = fixingModel(thread.replace(/x\d+(\.\d+)?$/, '')); } catch { return null; } // (joinModel refuses a screw it cannot read)
  const f = fx.figures, val = (k) => f[k]?.value ?? null, across = head === 'button' ? val('button_head') : val('head'), high = head === 'button' ? val('button_head_height') : val('head_height');
  const bore = endBore(P), a = `${kind === 'end-tap' ? 'an' : 'a'} ${kind} join's ${thread} screw (${from})`;
  if (bore && bore.diameter >= fx.major - 1e-9) return { why: 'tap', text: `${a} is cut in ${profile}'s end bore, and the bore is Ø${mm(bore.diameter)} mm, as wide as its ${mm(fx.major)} mm thread, so no thread can be cut in it` };
  for (const name of new Set(Object.values(P.faces).flat().filter((q) => q.slot).map((q) => q.slot))) {
    const sl = P.slots[name], room = sl.straight > 0 ? sl.straight : sl.cavityDepth - sl.lip;
    if (fx.major > sl.opening + 1e-9) return { why: 'opening', text: `${a} passes between the lips of the post's slot, and ${name} opens ${mm(sl.opening)} mm, narrower than its ${mm(fx.major)} mm` };
    if (kind === 'blind' && across != null && across > sl.cavityWidth + 1e-9) return { why: 'head', text: `${a}: its ${head} head, ${mm(across)} mm across, goes into the post's slot, and ${name} is ${mm(sl.cavityWidth)} mm wide under its lips` };
    if (kind === 'blind' && high != null && high > room + 1e-9) return { why: 'head', text: `${a}: its ${head} head, ${mm(high)} mm high, goes under the lips of the post's slot, and ${name} has ${mm(room)} mm there` };
  }
  return null;
}

// An end-tap join's screw passes a clearance hole drilled across the post, through the slot on either side: where the
// hole is wider than a slot's opening it breaks the lips, which cad's beam.op warns of (said with the join, so a remedy
// never passes it off as clean)
function lipsBroken(P, thread) {
  let d;
  try { d = fixingModel(thread).figures.clearance?.value; } catch { return ''; }
  const open = Math.min(...Object.values(P.faces).flat().filter((q) => q.slot).map((q) => P.slots[q.slot].opening));
  return d != null && d > open + 1e-9 ? ` (its ${thread} screw's Ø${mm(d)} mm hole across the post is wider than the ${mm(open)} mm slot opening, so beam.op warns that it breaks the lips)` : '';
}

// The screws (as join.screw takes them) a blind or end-tap join could take in this profile, none where it has no bore
const endScrews = (P, kind, profile) => (P.bores.length ? END_THREADS.filter((t) => !screwFault(P, kind, t, headOf(kind), profile)).map((t) => `${t} ${headOf(kind)}`) : []);

// The joins a generator takes in this profile, other than the one refused (blind, end-tap or printed), each as the
// remedy says it: the end joins with the screw they would need where their default does not fit, a printed bracket or
// gusset where the kit has a nut that goes in through the slot's opening. Where none is left, it says the two ways that
// remain, neither checked clean by the kit's own sets alone
function joinsInstead(P, but, profile, slotNames, printedNut) {
  const ok = [], bore = endBore(P);
  for (const kind of ['blind', 'end-tap']) {
    if (kind === but) continue;
    const s = endScrews(P, kind, profile);
    if (!s.length) continue;
    const plain = bore?.thread && s.includes(`${bore.thread} ${headOf(kind)}`), thread = plain ? bore.thread : s[0].split(' ')[0];
    ok.push(`${plain ? kind : `${kind} with join.screw ${s.join(' or ')}`}${kind === 'end-tap' ? lipsBroken(P, thread) : ''}`);
  }
  if (but !== 'printed' && printedNut) ok.push('a printed bracket or gusset (fitting printed)');
  if (ok.length) return `join it with ${ok.join(', or ')}`;
  const nut = but === 'printed' ? '' : `, or give a slot nut set of your own for ${slotNames} in given.sets and join with a printed bracket or gusset`;
  return `join it with a bracket or gusset with no fitting (taken, and checked by its estimate: join.fitting warns that no fitting is drawn for it)${nut}. The kit has no other join for ${profile} that checks clean`;
}

// A blind or end-tap join's screw against the profile's end bore and slots, refused by name where the check would fail
// it, with the screws that would fit or, where none does, the joins that are left
function screwFits(w, P, join, profile, slotNames, printedNut) {
  const [given, givenHead] = join.screw ? String(join.screw).trim().split(/\s+/) : [];
  const thread = given ?? endBore(P)?.thread, head = givenHead ?? headOf(join.kind);
  if (!thread) return;
  const fault = screwFault(P, join.kind, thread, head, profile, join.screw ? 'join.screw' : `${profile}'s end thread`);
  if (!fault) return;
  const fits = endScrews(P, join.kind, profile), instead = joinsInstead(P, join.kind, profile, slotNames, printedNut), bore = endBore(P);
  const what = join.kind === 'blind' ? `cuts a thread in the Ø${mm(bore.diameter)} mm end bore, passes between the slot's lips and has a button head that fits under them` : `cuts a thread in the Ø${mm(bore.diameter)} mm end bore and passes between the slot's lips`;
  throw new Error(`${w}: ${fault.text}: ${fits.length ? `give join.screw ${fits.join(' or ')}, which fit, or ${instead}` : `no screw from ${END_THREADS[0]} to ${END_THREADS.at(-1)} ${what}, so ${profile} takes no ${join.kind} join. ${instead[0].toUpperCase()}${instead.slice(1)}`}`);
}

const sub = (a, b) => a.map((v, k) => v - b[k]);
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

// The face of an upright beam (placed by its ends, roll 0: top toward +y, back toward +x) that looks along n
function faceOf(post, n) {
  const faces = { back: [1, 0, 0], front: [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] };
  return Object.keys(faces).find((k) => faces[k].every((c, i) => Math.abs(c - n[i]) < 1e-6));
}

/** A box: four upright beams and a ring of four at the bottom and the top. @param {object} o as frameModel's */
export const box = (o) => frameModel('box', o);
/** A portal: two legs and a beam across their tops; inside and outside are [width, height]. @param {object} o as frameModel's */
export const portal = (o) => frameModel('portal', o);
/** A table: four legs and a ring at the top; height is the clear height under it. @param {object} o as frameModel's */
export const table = (o) => frameModel('table', o);
/** A gantry: a box without its top beams across, and a beam riding along the two top side beams. @param {object} o as frameModel's */
export const gantry = (o) => frameModel('gantry', o);
/** A shelf: a box with rings between, spacing its height into equal clear bays. @param {object} o as frameModel's */
export const shelf = (o) => frameModel('shelf', o);

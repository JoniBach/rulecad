// The build of a frame, from bars to a square frame in numbered steps, worked out from the assembly: cut the bars (the
// cut list), drill and tap each mark (its cut-and-drill sheet), then make the joins, beam by beam, loading each slot nut
// that a join would shut in before that join is made, measure the diagonals of each bay once it is closed, then mount
// everything else. Each join's screws carry their key and how tight (fasten: the seat under the head, the lips of a
// slot under a blind join's head, or the torque given).
//   Sides: a bay is four beams joined in a rectangle in one plane (two parallel beams joined to two others square to
//   them). Bays that share no beam are built flat on the bench as sides, squared, and then joined to the rest (a beam
//   is in one side at most, so of two bays that share a post the first found is the side, and the other is squared
//   once the frame is joined). Beams that are in no side go on one at a time in the assembly's order, each joined to
//   what is already there. A side goes on as one when a beam already there is joined to it, and only where the heads
//   of its blind joins to the frame can slide in as it does: along slots that all run one way, each with a way in from
//   the end that leads that no join already made closes. Where that fails, or a side built flat would stand a beam over
//   a screw before it is driven, the side is built on the frame beam by beam instead, and the build says why (notFlat).
//   Nuts: a slide-in nut goes into a slot from an open end. Where joins close its stretch of slot at both ends
//   (frame.nut), every order shuts it in at the second of those joins: the build is refused, naming the slot and the
//   two joins, and the nut that goes in through the opening. Where joins close one way and an item placed at the end
//   the other (frame.preload), it is loaded just before the first of the joins on that way is made.
//   Squareness: each bay's two diagonals, inside corner to inside corner, and the difference to accept, from the cut
//   tolerance of its beams (@rulecad/frames squareness): a side's once it is built, the rest once the frame is joined,
//   each then tightened.
// The steps of the parts that are not beams (and not a join's fitting) follow the assembly's order (lib/order.mjs); a
// part a beam would stand over the screws of goes on before that beam. Every screw is held to what the assembly order
// found stands over it (its covers): where no build reaches one, the build is refused with that reason.
import { squareness, CUT_DEFAULTS, JOIN_PLAY } from '@rulecad/frames';
import { placeItems } from '@rulecad/model-link';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './workspace.mjs';
import { cutListOf, sheetFile } from './beams.mjs';
import { orderOf, fastenerText } from './order.mjs';
import { preloadOf, trappedOf, closuresOf, nutGroupsOf } from './slotnuts.mjs';

const mm = (x) => String(+Number(x).toFixed(2));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// A beam's cut tolerance and what it rests on: the assembly's frame.cut.tolerance (the workshop's own saw), else the
// profile's cut_tolerance, else CUT_DEFAULTS'
/** The assembly's own cut tolerance (frame.cut.tolerance), mm, or null: refused by name where it is not one. @param {object} s a built assembly */
export function cutToleranceOf(s) {
  const c = s.a.frame?.cut;
  if (c == null) return null;
  if (typeof c !== 'object' || Array.isArray(c)) throw new Error(`frame.cut is { "tolerance": 0.5 }: how far this workshop's cuts may be from the length asked, in mm (got ${JSON.stringify(c)})`);
  for (const k of Object.keys(c)) if (k !== 'tolerance') throw new Error(`frame.cut has no "${k}": it takes tolerance (mm)`);
  if (c.tolerance == null) return null;
  const t = s.num(c.tolerance);
  if (!(Number.isFinite(t) && t >= 0)) throw new Error(`frame.cut.tolerance is how far a cut may be from the length asked, either way, a number of mm, 0 or more (got ${JSON.stringify(c.tolerance)})`);
  return t;
}
function tolOf(s, p, printed = false) {
  // (a printed beam is not cut: its length comes off the printer, held here to a saw cut's tolerance, an estimate)
  if (printed) return { tol: CUT_DEFAULTS.tolerance.value, tolKind: 'estimate', tolFrom: 'frames.cut.tolerance, taken for a printed length', printed: true };
  const given = cutToleranceOf(s);
  if (given != null) return { tol: given, tolKind: 'given', tolFrom: 'the assembly\'s frame.cut.tolerance' };
  if (p.supply?.cutTolerance != null) return { tol: p.supply.cutTolerance, tolKind: p.figures?.cut_tolerance?.kind ?? 'spec', tolFrom: `${p.name}.cut_tolerance` };
  return { tol: CUT_DEFAULTS.tolerance.value, tolKind: CUT_DEFAULTS.tolerance.kind, tolFrom: 'frames.cut.tolerance' };
}

// Each beam as a line in the world: end a, its axis, its section's two axes and sizes, its length, its cut tolerance
function linesOf(s) {
  const placed = placeItems(s.motion, s.jointValues), worlds = Object.fromEntries(s.motion.items.map((x, i) => [x[0], placed[i]])), out = new Map(); // (placeItems: by the order of the motion's items)
  for (const o of s.objects) {
    if (!o.beam || o.unplaced || !worlds[o.id]) continue;
    const W = worlds[o.id], p = o.beam.profile;
    out.set(o.id, { id: o.id, O: [W[3], W[7], W[11]], d: norm([W[2], W[6], W[10]]), X: [W[0], W[4], W[8]], Y: [W[1], W[5], W[9]], w: p.width, h: p.height, L: o.beam.length, ...tolOf(s, p, !!o.beam.printed) });
  }
  return out;
}
// How far a beam reaches from its centre line along a direction in the plane
const reach = (b, e) => (Math.abs(dot(b.X, e)) * b.w + Math.abs(dot(b.Y, e)) * b.h) / 2;

/**
 * A frame's bays: four beams joined in a rectangle in one plane, each with its opening (inside face to inside face)
 * and its diagonals. @param {object} s a built assembly
 * @returns {{ beams: string[], name: string, width: number, height: number, square: object }[]}
 */
export function baysOf(s) {
  const L = linesOf(s), ids = [...L.keys()], joined = new Set();
  for (const j of s.joins ?? []) { joined.add(`${j.items[0]}|${j.items[1]}`); joined.add(`${j.items[1]}|${j.items[0]}`); }
  const J = (a, b) => joined.has(`${a}|${b}`), par = (a, b) => Math.abs(Math.abs(dot(a.d, b.d)) - 1) < 1e-6, perp = (a, b) => Math.abs(dot(a.d, b.d)) < 1e-6;
  const out = [], seen = new Set();
  for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) {
    const A = L.get(ids[i]), B = L.get(ids[k]);
    if (!par(A, B)) continue;
    const cross_ = ids.filter((id) => id !== A.id && id !== B.id && perp(L.get(id), A) && J(id, A.id) && J(id, B.id));
    for (let m = 0; m < cross_.length; m++) for (let q = m + 1; q < cross_.length; q++) {
      const C = L.get(cross_[m]), D = L.get(cross_[q]);
      if (!par(C, D)) continue;
      const n = norm(cross(A.d, C.d)), on = (b) => Math.abs(dot(b.O.map((x, t) => x - A.O[t]), n)) < 1e-3;
      if (![B, C, D].every(on)) continue;
      const key = [A.id, B.id, C.id, D.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const v = C.d, u = A.d, width = Math.abs(dot(A.O, v) - dot(B.O, v)) - reach(A, v) - reach(B, v), height = Math.abs(dot(C.O, u) - dot(D.O, u)) - reach(C, u) - reach(D, u);
      if (!(width > 0 && height > 0)) continue;
      // what squares it: each beam whose end butts a beam of the bay sets the opening along it by its cut length; each
      // join of the bay's beams lets a's end sit off by its play along b (JOIN_PLAY), stacked worst case
      const bay = [A, B, C, D], ids4 = bay.map((x) => x.id), along = (x) => (par(x, C) ? 'width' : 'height');
      const inBay = (s.joins ?? []).filter((j) => ids4.includes(j.items[0]) && ids4.includes(j.items[1]) && j.items[0] !== j.items[1]);
      const cuts = bay.filter((x) => inBay.some((j) => j.items[0] === x.id)).map((x) => ({ name: x.id, along: along(x), tolerance: x.tol, kind: x.tolKind, ...(x.printed ? { printed: true } : {}) }));
      const plays = inBay.map((j) => { const r = JOIN_PLAY[j.kind]; return r ? { name: `join ${j.index + 1} (${j.kind})`, along: along(L.get(j.items[1])), slip: r.value, kind: r.kind } : null; }).filter(Boolean);
      const sq = squareness(width, height, { tolerance: Math.max(...bay.map((x) => x.tol)), cuts, plays });
      out.push({ beams: ids4, name: `${A.id}, ${B.id}, ${C.id} and ${D.id}`, width: +width.toFixed(2), height: +height.toFixed(2), square: sq, joins: inBay.map((j) => j.index), tolFrom: [...new Set(bay.map((x) => x.tolFrom))] });
    }
  }
  return out;
}

// One join's screws as the steps say them: each fastening of its relations, with its key and torque
function joinLines(s, j) {
  const fits = s.fits.filter((f) => j.fasten.includes(f.fasten) && (f.fastener || f.key));
  return fits.map((f) => fastenerText({ fit: f.note, ...(f.fastener ? { fastener: f.fastener } : {}), ...(f.count != null ? { count: f.num ? f.num(f.count) : f.count } : {}), ...(f.key ? { key: f.key } : {}), ...(f.tighten ? { tighten: f.tighten } : {}) }));
}

/**
 * The build of a frame: numbered steps from bars to a square frame, then the rest mounted; or why there is none.
 * @param {object} s a built assembly with joins
 * @returns {{ steps: { n: number, kind: string, text: string, lines?: string[], items?: string[], joins?: number[], side?: number, shown: string[], now: string[], dir: number[] }[], sides: object[], notFlat: object[], bays: object[], torques: object[], stuck: object|null }}
 *   kind: cut, drill, side (a side built flat), join, load, square, mount; shown: what is in view at that step (the side
 *   on the bench, or the frame so far), now: what goes on in it, dir: the way it goes on; sides: the bays built flat;
 *   notFlat: the bays that could be and are not, with why; torques: the tightening of each kind of join; stuck:
 *   { text, item, place, joins, nut, alternative } where a slot's nuts are shut in, or why no order reaches a screw
 */
export function frameBuild(s) {
  return (s.frameBuilt ??= buildFrame(s)); // (worked out once for each built assembly: cad check asks for it twice, cad order once)
}

/**
 * Where each item goes on in a frame's build: its step's number, as cad order prints it. @param {object} b frameBuild's
 * @returns {(id: string) => number|undefined} undefined where the build was refused or the item is in no step
 */
export function frameStepOf(b) {
  if (b?.stuck) return () => undefined;
  const at = new Map();
  for (const st of b?.steps ?? []) for (const id of st.now ?? []) if (!at.has(id)) at.set(id, st.n);
  return (id) => at.get(id);
}

function buildFrame(s) {
  const joins = s.joins ?? [], L = linesOf(s), beamIds = [...L.keys()], none = { steps: [], sides: [], notFlat: [], bays: [], torques: [] };
  const order = orderOf(s);
  if (order.stuck) return { ...none, stuck: { ...order.stuck } };
  // nuts shut in by joins at both ends: in every order the second of those joins shuts them in, so no build is offered
  const trapped = trappedOf(s);
  if (trapped.length) {
    const t = trapped[0], [p, q] = t.joins;
    const alt = t.alternative ? `: give "nut": "${t.alternative.nutKind}" (${t.alternative.name}), which goes in through the opening anywhere` : `: no ${t.kind} nut of this thread goes in through the opening, so move the part to a slot with an open end`;
    return { ...none, stuck: { item: t.item, place: t.place, nut: t.nut, joins: [p.index, q.index], fasten: t.fasten, ...(t.alternative ? { alternative: t.alternative.name } : {}),
      text: `${t.item}'s ${t.named} slot: ${t.count} ${t.kind} nut${t.count > 1 ? 's' : ''} (${t.nut}) for ${t.part} would be shut in between the ${p.label} and the ${q.label}: whichever of the two is made second shuts them in, and a nut loaded before it can never be taken out or replaced${alt}` } };
  }
  const bays = baysOf(s), fittings = new Map(joins.filter((j) => j.fitted?.item).map((j) => [j.fitted.item, j]));
  const rank = new Map(); order.steps.forEach((st, i) => st.items.forEach((id) => rank.set(id, i)));
  const byOrder = [...beamIds].sort((p, q) => (rank.get(p) ?? 1e9) - (rank.get(q) ?? 1e9)); // (beams going on one at a time keep the assembly order's sequence, which reaches every screw)
  const dirOf = (id) => order.steps.find((st) => st.items.includes(id))?.dir ?? [0, 0, 1];
  const joinsBetween = (id, set) => joins.filter((j) => (j.items[0] === id && set.has(j.items[1])) || (j.items[1] === id && set.has(j.items[0])));
  const par = (a, b) => Math.abs(Math.abs(dot(a, b)) - 1) < 1e-6;
  // A side going on as one: the heads of its blind joins to the frame slide along their slots as it goes on, so every
  // slot they go into runs one way, and each has a way in from the end that leads, with no join already made across it
  const slideIn = (bay, js, made) => {
    const heads = js.filter((j) => j.kind === 'blind' && L.has(j.items[1]));
    if (!heads.length) return { why: null, dir: null };
    const u = L.get(heads[0].items[1]).d, odd = heads.find((j) => !par(L.get(j.items[1]).d, u));
    if (odd) return { why: `the heads of its joins to the frame go into slots that run different ways (the ${heads[0].label} along ${heads[0].items[1]}, the ${odd.label} along ${odd.items[1]}), so they can't all slide in as it goes on` };
    let last = null;
    for (const sg of [1, -1]) { // (the side comes from +u or -u: a head enters a slot of the side at the end that leads, a slot of the frame at the other)
      const blocked = heads.map((j) => {
        const rb = j.items[1], want = bay.beams.includes(rb) ? -sg : sg, end = dot(L.get(rb).d, u) * want > 0 ? 'b' : 'a', d = j.model.b.distance;
        const by = closuresOf(s, rb, j.model.b.place).find((c) => c.join && made.has(c.join.index) && !js.includes(c.join) && (end === 'a' ? c.at < d - 1e-3 : c.at > d + 1e-3));
        return by ? { j, end, by: by.join } : null;
      }).find(Boolean);
      if (!blocked) return { why: null, dir: u.map((x) => +(x * sg).toFixed(6) || 0) };
      last = blocked;
    }
    return { why: `the head of the ${last.j.label} can't slide into ${last.j.items[1]}'s slot from either end as it goes on: the ${last.by.label}, made on the bench, closes the way` };
  };
  const barred = new Set(), notFlat = [], key = (b) => b.beams.join('|');
  for (;;) {
    // sides: bays that share no beam with a side already chosen, in the order they are found; a bay that shares one is
    // squared once the frame is joined
    const sides = [], used = new Set();
    for (const bay of bays) if (!barred.has(key(bay)) && !bay.beams.some((b) => used.has(b))) { sides.push(bay); for (const b of bay.beams) used.add(b); }
    const r = attempt(sides, used);
    if (!r.problem) return { ...r, sides: sides.map((b) => ({ beams: b.beams, name: b.name, square: b.square })), notFlat, bays, stuck: null };
    const side = r.problem.bay ?? sides.find((b) => r.problem.ids.some((id) => b.beams.includes(id)));
    if (!side) return { ...none, notFlat, bays, stuck: r.problem.stuck };
    barred.add(key(side)); notFlat.push({ beams: side.beams, name: side.name, why: r.problem.why });
  }

  function attempt(sides, used) {
    const steps = [], made = new Set(), bench = new Map(); // (bench: a beam of a side after the first, built flat away from the frame, to its side)
    sides.forEach((b, i) => { if (i) for (const id of b.beams) bench.set(id, i); });
    const step = (x) => { steps.push({ enters: [], ...x }); };
    // cut and drill
    const c = cutListOf(s);
    if (c) {
      step({ kind: 'cut', text: `Cut the beams: ${c.marks.map((m) => `${m.count} × ${m.mark} at ${mm(m.length)} mm`).join(', ')} (kerf ${c.rules.kerf.value} mm, ${c.rules.trim.value} mm off each bar's first end; cut each mark against one stop)`,
        lines: c.stock.flatMap((st) => [`${st.profile}: buy ${st.buy.map((x) => `${x.count} × ${mm(x.length)} mm`).join(', ')}`, ...st.bars.map((b, i) => `bar ${i + 1}, ${mm(b.length)} mm: ${b.cuts.map((q) => `${q.mark} ${mm(q.length)} (${q.item})`).join(', ')}; offcut ${mm(b.offcut)}`)]) });
      const work = c.marks.filter((m) => m.ops.length);
      if (work.length) step({ kind: 'drill', text: `Drill and tap each mark as its sheet shows, and write the item on each beam`, lines: work.map((m) => `${m.mark} (${m.items.join(', ')}): ${m.ops.join('; ')}: ${['exports', s.project, path.basename(sheetFile(s, m.mark))].join('/')}`) });
    }
    // a beam going on: the joins it makes with what is there, each of its screws
    const joinStep = (ids, set) => {
      const js = [...new Map(ids.flatMap((id) => joinsBetween(id, set)).map((j) => [j.index, j])).values()].filter((j) => !made.has(j.index));
      for (const j of js) made.add(j.index);
      return { joins: js.map((j) => j.index), lines: js.flatMap((j) => { const l = joinLines(s, j); return l.length ? l : [`${j.label}: ${j.fitted ? `its ${j.fitted.item}` : 'no screws: its fitting comes with the kind'}`]; }) };
    };
    // (the way a beam goes on: where its end's head goes into a slot of a beam already there, along that slot from its nearer end)
    const slideOf = (id, js) => { const j = js.find((q) => q.kind === 'blind' && q.items[0] === id && L.has(q.items[1])); if (!j) return {}; const b = L.get(j.items[1]), sg = j.model.b.distance < b.L / 2 ? -1 : 1; return { dir: b.d.map((x) => +(x * sg).toFixed(6) || 0) }; };
    const placeOne = (id, set, prefix = '', side = null) => { const x = joinStep([id], set); step({ kind: 'join', items: [id], ...(side != null ? { side, bench: side > 0 } : {}), ...slideOf(id, x.joins.map((k) => joins[k])), enters: side ? [] : [id], text: `${prefix}${id} goes on${x.joins.length ? `, joined to ${list([...new Set(x.joins.map((k) => joins[k].items.find((q) => q !== id)))])}` : ''}`, ...x }); set.add(id); };
    // sides, each built flat
    sides.forEach((bay, i) => {
      const own = new Set(bay.beams), set = new Set(), name = `Side ${i + 1} (${bay.name})`;
      const first = [...bay.beams].sort((p, q) => joinsBetween(q, own).length - joinsBetween(p, own).length || beamIds.indexOf(p) - beamIds.indexOf(q))[0];
      step({ kind: 'side', side: i, bench: i > 0, items: [first], enters: i ? [] : [first], text: `${name}, built flat on the bench: lay ${first} down` }); set.add(first);
      for (let left = bay.beams.filter((b) => b !== first); left.length;) {
        const next = left.find((b) => joinsBetween(b, set).length) ?? left[0];
        placeOne(next, set, `${name}: `, i); left = left.filter((b) => b !== next);
      }
      step({ kind: 'square', side: i, bench: i > 0, items: bay.beams, text: `Square side ${i + 1}, then tighten its joins: ${bay.square.text}. Push the corners of the long diagonal together until the two are within that, then tighten each join to its torque and measure again` });
    });
    // the frame: from the first side (or the first beam), beams on one at a time, sides on as one
    const set = new Set(sides[0]?.beams ?? byOrder.slice(0, 1)), sideLeft = sides.slice(1).map((b, k) => ({ bay: b, i: k + 1 }));
    if (!sides.length && byOrder.length) step({ kind: 'join', items: [byOrder[0]], enters: [byOrder[0]], text: `${byOrder[0]} first`, joins: [], lines: [] });
    for (let singles = byOrder.filter((b) => !used.has(b) && !set.has(b)); singles.length || sideLeft.length;) {
      const one = singles.find((b) => joinsBetween(b, set).length);
      if (one) { placeOne(one, set); singles = singles.filter((b) => b !== one); continue; }
      const k = sideLeft.findIndex((x) => x.bay.beams.some((b) => joinsBetween(b, set).length));
      if (k >= 0) {
        const { bay, i } = sideLeft.splice(k, 1)[0], js = [...new Map(bay.beams.flatMap((id) => joinsBetween(id, set)).map((j) => [j.index, j])).values()];
        const slide = slideIn(bay, js, made);
        if (slide.why) return { problem: { bay, why: slide.why } };
        const x = joinStep(bay.beams, set);
        step({ kind: 'join', side: i, items: bay.beams, enters: bay.beams, ...(slide.dir ? { dir: slide.dir } : {}), text: `Side ${i + 1} goes on as one, joined to ${list([...new Set(x.joins.flatMap((q) => joins[q].items).filter((q) => !bay.beams.includes(q)))])}`, ...x });
        for (const b of bay.beams) set.add(b);
        continue;
      }
      if (singles.length) { placeOne(singles[0], set); singles = singles.slice(1); continue; } // (a beam joined to nothing yet)
      const { bay, i } = sideLeft.shift(); for (const b of bay.beams) set.add(b);
      step({ kind: 'join', side: i, items: bay.beams, enters: bay.beams, text: `Side ${i + 1} goes on as one`, joins: [], lines: [] });
    }
    const where = () => { const at = new Map(), enter = new Map(), own = new Map(); steps.forEach((x, i) => { for (const k of x.joins ?? []) at.set(k, i); for (const id of x.enters) if (!enter.has(id)) enter.set(id, i); for (const id of x.items ?? []) if (!own.has(id)) own.set(id, i); }); for (const [id, j] of fittings) if (at.has(j.index)) enter.set(id, at.get(j.index)); return { at, enter, own }; };
    // then everything else, in the assembly's order, with its fastenings: a part a beam would stand over the screws of goes on
    // before that beam, once the beams it is fastened to are there; the rest once the frame is square
    const mounts = [];
    for (const st of order.steps) {
      const items = st.items.filter((id) => !L.has(id) && !fittings.has(id));
      if (!items.length) continue;
      const lines = st.fasteners.map(fastenerText), last = mounts.at(-1); // (copies of one thing with no screws of their own, one after another, are one step)
      if (last && st.object && last.object === st.object && !lines.length && !last.lines.length) last.items.push(...items);
      else mounts.push({ items, object: st.object, lines, dir: st.dir });
    }
    const covers = order.covers ?? [], mountStep = (m) => ({ kind: 'mount', items: m.items, enters: m.items, dir: m.dir, text: `${m.items.join(', ')}${m.object && !m.items.includes(m.object) ? ` (${m.object})` : ''} go${m.items.length > 1 ? '' : 'es'} on`, lines: m.lines });
    const late = [];
    for (const m of mounts) {
      const cs = covers.filter((c) => c.screwed.some((id) => m.items.includes(id)) && !m.items.includes(c.wall)), { enter } = where();
      const walls = cs.map((c) => c.wall).filter((w) => enter.has(w)), partners = [...new Set(cs.flatMap((c) => c.screwed).filter((id) => !m.items.includes(id)))];
      if (!walls.length || partners.some((id) => !enter.has(id))) { late.push(m); continue; }
      const w = Math.min(...walls.map((x) => enter.get(x))), wall = walls.find((x) => enter.get(x) === w), p = Math.max(-1, ...partners.map((x) => enter.get(x)));
      if (p >= w) { const later = partners.find((x) => enter.get(x) === p); return { problem: { ids: [wall, later], why: `${wall} would stand over the screws of ${m.items.join(', ')} before ${later}, which they fasten to, is on`, stuck: { item: m.items[0], wall, text: `the screws of ${m.items.join(', ')} can't be reached: ${wall} stands over them, and it goes on before ${later}, which they fasten to` } } }; }
      steps.splice(w, 0, mountStep(m));
    }
    // the bays no side squared, once the frame is joined
    const later = bays.filter((b) => !sides.includes(b));
    if (later.length) step({ kind: 'square', items: [...new Set(later.flatMap((b) => b.beams))], text: `Square the frame, then tighten its joins: measure the diagonals of each bay${sides.length ? ' the sides did not' : ''}, push the corners of the long diagonal together until each is within, then tighten each join to its torque and measure again`, lines: later.map((b) => `${b.name}: ${b.square.text}`) });
    for (const m of late) step(mountStep(m));
    // every screw reached: what stands over a screw goes on after the step that drives it (a join's, or the later of the
    // parts it fastens); on the bench, against the side's own beams only
    const { at: atJ, enter, own } = where();
    for (const cv of covers) {
      const j = cv.fasten != null ? joins.find((x) => x.fasten.includes(cv.fasten)) : null, drive = j ? atJ.get(j.index) : Math.max(...cv.screwed.map((id) => enter.get(id) ?? -1));
      if (drive == null || drive < 0) continue;
      const onBench = j && bench.has(j.items[0]) && bench.get(j.items[0]) === bench.get(j.items[1]) && drive < enter.get(j.items[0]);
      const wallAt = onBench ? (bench.get(cv.wall) === bench.get(j.items[0]) ? own.get(cv.wall) : undefined) : enter.get(cv.wall);
      if (wallAt == null || wallAt >= drive) continue;
      return { problem: { ids: [cv.wall, ...cv.screwed], why: `${cv.wall} would stand over the screw of ${cv.fit} before it is driven`, stuck: { item: cv.screwed.at(-1), wall: cv.wall, text: `the screw of "${cv.fit}" can't be reached with the frame built beam by beam: ${cv.wall} goes on before it and stands over it` } } };
    }
    // what goes into each slot and when: every head and every nut with a way in at its step (slotPlan)
    const plan = slotPlan(s, steps, L, where);
    if (plan.fail) {
      const f = plan.fail, st = f.o.type === 'head' ? steps[f.o.step] : null;
      if (st && st.kind === 'join' && st.side != null && (st.items ?? []).length > 1) return { problem: { bay: sides[st.side], why: `the head of the ${f.o.j.label} has no way into ${f.o.item}'s ${f.o.named} slot as it goes on: ${f.why}` } };
      return { problem: { ids: [], why: f.text, stuck: { item: f.o.item, place: f.o.place, text: f.text, ...(f.o.type === 'head' ? { join: f.o.j.index } : { fasten: f.o.g.rel.index, nut: f.o.g.nut }) } } };
    }
    for (const [i, d] of plan.dirs) steps[i].dir = d;
    const { enter: entered } = where();
    for (const ld of [...plan.loads].sort((x, y) => y.k - x.k)) steps.splice(ld.k, 0, { kind: 'load', items: [ld.o.item], enters: [], ...(bench.has(ld.o.item) && ld.k < entered.get(ld.o.item) ? { side: bench.get(ld.o.item), bench: true } : {}), text: ld.text });
    // what is in view at each step: the side on the bench, or the frame so far
    const frameNow = new Set(), benchNow = new Map();
    steps.forEach((x, i) => {
      x.n = i + 1;
      const onBench = x.bench && x.side != null;
      if (onBench) { const b = benchNow.get(x.side) ?? new Set(); for (const id of x.kind === 'square' ? [] : x.items ?? []) b.add(id); benchNow.set(x.side, b); }
      for (const id of x.enters) frameNow.add(id);
      for (const id of x.kind === 'join' && !onBench ? x.items ?? [] : []) frameNow.add(id);
      for (const [id, jj] of fittings) if (jj && (x.joins ?? []).includes(jj.index)) frameNow.add(id);
      x.shown = [...(onBench ? benchNow.get(x.side) : frameNow)];
      x.now = ['side', 'join', 'mount'].includes(x.kind) ? [...(x.items ?? []), ...[...fittings].filter(([, jj]) => (x.joins ?? []).includes(jj.index)).map(([id]) => id)] : [];
      x.dir ??= x.now.length === 1 ? dirOf(x.now[0]) : [0, 0, 1];
      delete x.enters; delete x.bench;
    });
    // a join made before its bay is squared is left snug, and tightened at that square step, which says so too
    steps.forEach((x, i) => { if (x.kind !== 'join' || !x.joins?.length) return; const sq = steps.slice(i + 1).find((y) => y.kind === 'square'); if (sq) x.lines = [...(x.lines ?? []), `Snug for now: tightened to its torque at step ${sq.n}, once square`]; });
    // the tightening of each kind of join: the least its screws' seats take, or the torque given
    const byKind = new Map();
    for (const j of joins) for (const f of s.fits.filter((q) => j.fasten.includes(q.fasten) && q.tighten)) {
      const k = byKind.get(j.kind) ?? { kind: j.kind, joins: 0, fasteners: new Set(), keys: new Set(), torque: Infinity, given: false, load: false };
      k.torque = Math.min(k.torque, f.tighten.torque); k.given ||= !!f.tighten.given; k.load ||= !!f.tighten.load; if (f.fastener) k.fasteners.add(f.fastener); if (f.key) k.keys.add(f.key);
      byKind.set(j.kind, k);
    }
    for (const j of joins) if (byKind.has(j.kind)) byKind.get(j.kind).joins++;
    const torques = [...byKind.values()].map((k) => ({ kind: k.kind, joins: k.joins, fasteners: [...k.fasteners], key: [...k.keys].join(' or '), torque: k.torque,
      why: k.given ? 'as given' : k.load ? 'what the joint\'s load leaves the thread' : 'at most: what the seat under the head takes (a slot\'s lips under a blind join\'s head, an estimate), or the screw tightened fully, the less' }));
    return { steps, torques };
  }
}

// What goes into each beam's slots, and when. A blind join's head slides into its slot from an end as its beam goes on;
// a slide-in nut goes in from an end at a load step, or with its part; a nut that goes in through the opening, with its
// part. Each needs a way in at its step: an end of the slot not yet closed (by a join on that end, or an item placed
// there) and nothing already in the slot between it and that end (a head, a nut). A beam going on slides along the slots
// its heads go into, from one way or the other, so its heads share the way; where neither way is clear, a head is slid
// into its slot on its own beforehand, and the beam brought to it (its screw turned in through the access hole). A nut
// two joins would close in goes in before the first of them, where that leaves every head its way, else at the first
// step after that does; else it is loaded earlier. Heads are placed first, in the order their beams go on, then nuts.
// Returns the loads ({ k: the step they go before, o, text }), each step's way on (dirs), or fail { o, text, why }.
function slotPlan(s, steps, L, where) {
  const joins = s.joins ?? [], { at, enter, own } = where(), EPS = 1e-3, key = (o) => `${o.item}|${o.place}`;
  const namedOf = (id, place) => { const ps = s.objects.find((o) => o.id === id)?.beam?.places ?? [], p = ps.find((q) => q.name === place); return p && ps.filter((q) => q.face === p.face).length === 1 ? p.face : place; };
  const first = Math.max(0, steps.findIndex((st) => st.kind !== 'cut' && st.kind !== 'drill')); // (a beam is cut and drilled before anything goes into its slots; loose or on, from then on)
  const heads = joins.filter((j) => j.kind === 'blind' && L.has(j.items[1]) && at.has(j.index)).map((j) => ({ type: 'head', id: `h${j.index}`, j, item: j.items[1], place: j.model.b.place, named: namedOf(j.items[1], j.model.b.place), lo: j.model.b.distance, hi: j.model.b.distance, step: at.get(j.index), fastener: s.fits.find((f) => j.fasten.includes(f.fasten) && f.fastener)?.fastener ?? 'screw' }));
  const pre = preloadOf(s);
  const nuts = nutGroupsOf(s).filter((g) => L.has(g.item) && enter.has(g.part)).map((g, n) => {
    const pl = pre.find((p) => p.fasten === g.rel.index && p.item === g.item && p.place === g.place) ?? null, k0 = pl ? Math.min(...pl.closers.map((j) => at.get(j.index) ?? Infinity)) : null;
    return { type: 'nut', id: `n${n}`, g, item: g.item, place: g.place, named: g.named, lo: Math.min(...g.at), hi: Math.max(...g.at), step: enter.get(g.part), slide: g.entry === 'end', pl, k0: Number.isFinite(k0) ? k0 : null };
  });
  const all = [...heads, ...nuts], closes = [];
  for (const sl of new Set(all.map(key))) { const [id, place] = sl.split('|'); for (const c of closuresOf(s, id, place)) if (c.end) { const i = c.join ? at.get(c.join.index) : enter.get(c.item); if (i != null) closes.push({ i, key: sl, end: c.end, join: c.join ?? null, item: c.item ?? null }); } }
  const closeSays = (c) => (c.join ? `the ${c.join.label} closes it` : `${c.item} is on it`), inSays = (o) => (o.type === 'head' ? `the head of the ${o.j.label} at ${mm(o.lo)} mm is in the way` : `the ${o.g.at.length} nut${o.g.at.length > 1 ? 's' : ''} for ${o.g.part} at ${o.g.at.map(mm).join(' and ')} mm ${o.g.at.length > 1 ? 'are' : 'is'} in the way`);
  // one pass over the steps with the loads given (plan: id -> the step it goes before) and only the active heads and nuts
  const sim = (plan, active) => {
    const state = new Map(), slot = (k) => { if (!state.has(k)) state.set(k, { in: [], shut: { a: null, b: null } }); return state.get(k); };
    const block = (o, e) => { const st = slot(key(o)); if (st.shut[e]) return closeSays(st.shut[e]); const by = st.in.find((x) => (e === 'a' ? x.hi < o.lo - EPS : x.lo > o.hi + EPS)); return by ? inSays(by) : null; };
    const way = (o, order = ['a', 'b']) => order.find((e) => !block(o, e)) ?? null, said = (o) => `from end a ${block(o, 'a')}; from end b ${block(o, 'b')}`;
    const dirs = new Map(), ways = new Map(), on = (o) => active.has(o.id);
    for (let i = 0; i <= steps.length; i++) {
      for (const o of all.filter((x) => on(x) && plan.get(x.id) === i)) {
        const e = way(o, o.pl?.way === 'b' ? ['b', 'a'] : ['a', 'b']);
        if (!e) return { fail: { o, i, why: said(o) } };
        ways.set(o.id, e); slot(key(o)).in.push(o);
      }
      if (i === steps.length) break;
      const st = steps[i], M = new Set((st.items ?? []).filter((id) => L.has(id)));
      // the heads that slide in as their beams go on, all one way along the slots
      const sliding = heads.filter((h) => on(h) && !plan.has(h.id) && h.step === i), moving = sliding.map((h) => ({ h, a: M.has(h.j.items[0]) && !M.has(h.item), b: M.has(h.item) && !M.has(h.j.items[0]) })).filter((x) => x.a || x.b);
      if (moving.length) {
        const u = L.get(moving[0].h.item).d, par = (x) => Math.abs(Math.abs(dot(L.get(x.h.item).d, u)) - 1) < 1e-6, d0 = st.dir && Math.abs(Math.abs(dot(st.dir, u)) - 1) < 1e-6 ? Math.sign(dot(st.dir, u)) : 1;
        let chosen = null, why = [];
        for (const sg of [d0, -d0]) {
          const dir = u.map((x) => +(x * sg).toFixed(6) || 0), ends = moving.filter(par).map((x) => { const p = dot(L.get(x.h.item).d, dir) > 0; return { x, e: x.a ? (p ? 'b' : 'a') : (p ? 'a' : 'b') }; });
          const across = moving.find((x) => !par(x)); // (a head whose slot runs across the way the beam goes on can't slide in with it)
          if (across) { why.push({ x: across, e: sg > 0 ? 'b' : 'a', by: `its slot runs across the way ${steps[i].items.join(', ')} go${steps[i].items.length > 1 ? '' : 'es'} on` }); continue; }
          const bad = ends.find(({ x, e }) => block(x.h, e));
          if (!bad) { chosen = { dir, ends }; break; }
          why.push({ ...bad, by: block(bad.x.h, bad.e) });
        }
        if (!chosen) return { fail: { o: why[0].x.h, i, why: why[0].x === why[1].x && why[0].by === why[1].by ? why[0].by : `from end ${why[0].e} ${why[0].by}; from end ${why[1].e} ${why[1].by}` } };
        dirs.set(i, chosen.dir); for (const { x, e } of chosen.ends) ways.set(x.h.id, e);
      }
      for (const h of sliding) slot(key(h)).in.push(h);
      // nuts with their part: a slide-in nut not loaded beforehand needs its way now
      for (const o of nuts.filter((x) => on(x) && !plan.has(x.id) && x.step === i)) {
        if (o.slide) { const e = way(o); if (!e) return { fail: { o, i, why: said(o) } }; ways.set(o.id, e); }
        slot(key(o)).in.push(o);
      }
      for (const c of closes.filter((x) => x.i === i)) slot(c.key).shut[c.end] ||= c;
    }
    return { dirs, ways };
  };
  const plan = new Map(), active = new Set(nuts.filter((o) => !o.slide).map((o) => o.id)), stuck = [];
  const ok = () => !sim(plan, active).fail, tryAt = (o, ks) => { for (const k of ks) { if (k == null) plan.delete(o.id); else plan.set(o.id, k); if (ok()) return true; } plan.delete(o.id); return false; };
  const down = (from, to) => { const out = []; for (let k = from; k >= to; k--) out.push(k); return out; };
  for (const h of [...heads].sort((p, q) => p.step - q.step)) { active.add(h.id); if (!tryAt(h, [null, ...down(h.step, first)])) { active.delete(h.id); stuck.push(h); } }
  for (const o of nuts.filter((x) => x.slide).sort((p, q) => p.step - q.step)) {
    active.add(o.id);
    const lo = first, ks = o.k0 != null ? [o.k0, ...Array.from({ length: Math.max(0, o.step - o.k0) }, (_, n) => o.k0 + n + 1), ...down(o.k0 - 1, lo)] : [null, ...down(o.step, lo)];
    if (!tryAt(o, ks)) { active.delete(o.id); stuck.push(o); }
  }
  if (stuck.length) {
    const o = stuck[0]; active.add(o.id);
    const r = sim(plan, active), why = r.fail?.o === o ? r.fail.why : 'every way in is closed or taken at every step it could go in';
    const text = o.type === 'head' ? `the head of the ${o.j.label} has no way into ${o.item}'s ${o.named} slot, at its step or before: ${why}` : `${o.item}'s ${o.named} slot: ${o.g.at.length} ${o.g.kind} nut${o.g.at.length > 1 ? 's' : ''} (${o.g.nut}) for ${o.g.part} have no way in at any step: ${why}. A nut that goes in through the opening, or the part on another slot`;
    return { fail: { o, text, why } };
  }
  const r = sim(plan, active);
  // each load said: its way, and what closes that way after it (a head or nut coming between, the end closed)
  const timeOf = (o) => (plan.has(o.id) ? plan.get(o.id) - 0.5 : o.step);
  const loads = [...plan].map(([id, k]) => {
    const o = all.find((x) => x.id === id), e = r.ways.get(id), t = k - 0.5, sl = key(o);
    const between = all.filter((x) => x !== o && key(x) === sl && timeOf(x) > t && (e === 'a' ? x.hi < o.lo - EPS : x.lo > o.hi + EPS)).map((x) => ({ t: timeOf(x), says: x.type === 'head' ? `the ${x.j.label} is made` : `the nuts for ${x.g.part} go in` }));
    const shut = closes.filter((c) => c.key === sl && c.end === e && c.i >= k).map((c) => ({ t: c.i, says: c.join ? `the ${c.join.label} is made` : `${c.item} goes on` }));
    const next = [...between, ...shut].sort((p, q) => p.t - q.t)[0], before = next ? `, before ${next.says}` : '';
    if (o.type === 'head') return { k, o, text: `Slide ${/^[aeiou8]|^M/i.test(o.fastener) ? 'an' : 'a'} ${o.fastener} screw into ${o.item}'s ${o.named} slot head first, through its end ${e}, to ${mm(o.lo)} mm, for the ${o.j.label}${before}: that join is made with it in place, the screw turned into ${o.j.items[0]}'s end through the access hole` };
    if (o.pl && k === o.k0 && e === o.pl.way) { const first = o.pl.closers.find((j) => at.get(j.index) === k); return { k, o, text: `Load${o.pl.text.slice(4)}: the next step makes ${o.pl.closers.length > 1 ? `the ${first.label}` : 'that join'}` }; }
    return { k, o, text: `Load ${o.g.at.length} × ${o.g.nut} into ${o.item}'s ${o.named} slot through its end ${e}, for ${o.g.part}${before}` };
  });
  return { loads, dirs: r.dirs };
}

/** Each step's picture, numbered as the frame's build is: what is in view, the beams or parts going on held off along their way. @param {object} s @param {object} b frameBuild's @returns {{ n: number, parts: object[] }[]} the steps with something to show */
export function frameStepPictures(s, b) {
  let off = 40;
  for (const p of s.parts) for (const t of p.triangles) for (const v of t) off = Math.max(off, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  off *= 0.25;
  return b.steps.filter((st) => st.shown.length).map((st) => {
    const shown = new Set(st.shown), now = new Set(st.now);
    return { n: st.n, parts: s.parts.filter((p) => shown.has(p.item)).map((p) => (now.has(p.item) ? { ...p, role: 'part', triangles: p.triangles.map((t) => t.map((v) => v.map((c, k) => c + st.dir[k] * off))) } : { ...p, role: 'reference' })) };
  });
}

/** The frame's build as text, for cad order. @param {string} ref @param {object} b frameBuild's */
export function frameBuildText(ref, b) {
  if (b.stuck) return `${ref}: ${b.stuck.text}`;
  const out = [`${ref}: from bars to a square frame`];
  for (const st of b.steps) { out.push(`  ${String(st.n).padStart(2)}. ${st.text}`); for (const l of st.lines ?? []) out.push(`        ${l}`); }
  for (const x of b.notFlat ?? []) out.push(`  The bay of ${x.name} is built on the frame, not flat: ${x.why}`);
  if (b.torques.length) { out.push('  Tightening, by kind of join:'); for (const t of b.torques) out.push(`    ${t.kind} (${t.joins} join${t.joins > 1 ? 's' : ''}, ${t.fasteners.join(', ')}${t.key ? ` with ${/^[aeiou8]/i.test(t.key) ? 'an' : 'a'} ${t.key}` : ''}): ${mm(t.torque)} N m, ${t.why}`); }
  return out.join('\n');
}


// The latest measurement of each prediction in the project's ledger (cad measured writes it), by name
function measuredOf(s) {
  let text = '';
  try { text = fs.readFileSync(path.join(paths.project(s.project), 'ledger.jsonl'), 'utf8'); } catch { return new Map(); }
  const out = new Map();
  for (const l of text.split('\n')) { if (!l.trim()) continue; try { const e = JSON.parse(l); if (e.assembly === s.name && typeof e.measured === 'number') out.set(e.name, e); } catch {} }
  return out;
}

/**
 * frame.square for each bay of a frame, in the assembly's findings shape: the diagonals to measure and the difference to
 * accept, each cut and join's share of it, and a prediction cad measured takes (frame.square.<beams>=<the difference
 * measured, either sign, since which diagonal is the longer says only which way it leans>): once measured, it says
 * whether the bay is square within what its parts allow.
 */
export function frameSquareChecks(s, f) {
  if (!s.joins?.length) return;
  const measured = measuredOf(s);
  let bays;
  try { bays = baysOf(s); } catch (e) { f('fail', e.message, 'frame.cut: refused', { code: 'frame.square' }); return; }
  for (const b of bays) {
    const q = b.square, name = `frame.square.${b.beams.join('-')}`, m = measured.get(name), soft = q.terms.filter((x) => x.kind === 'estimate');
    const parts = `${q.terms.map((x) => `${x.term} ${mm(x.value)}`).join(', ')} mm`;
    const rests = soft.length ? ` It rests on estimates (${soft.map((x) => x.term).join(', ')}): measure the diagonals once it is squared and tightened, and give their difference to cad measured ${s.project}/${s.name} ${name}=<mm>` : '';
    let level = 'info', said = '';
    if (m) { const d = Math.abs(m.measured), over = d > q.accept + 1e-9; level = over ? 'warn' : 'pass'; said = ` Measured ${mm(m.measured)} mm (${m.date}${m.measured < 0 ? `, ${mm(d)} mm either way` : ''}): ${over ? `${mm(d / q.accept)} times what its cuts and joins allow, so it leans: loosen its joins, push the long diagonal's corners together, tighten and measure again` : 'within what its cuts and joins allow'}.`; }
    f(level, `the bay of ${b.name}: ${q.text}. Its share: ${parts}.${said}${m ? '' : rests}`, level === 'warn' ? `${b.beams.join('-')}: out of square` : null,
      { code: 'frame.square', predict: { name, figure: `the difference between the diagonals of the bay of ${b.name}, inside corner to inside corner, squared and tightened`, value: q.accept, unit: 'mm' },
        values: { ...q.findings[0].values, ...(m ? { measured: m.measured } : {}) }, refs: { beams: b.beams, joins: b.joins, tolerance: b.tolFrom } });
  }
}

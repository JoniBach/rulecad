// The build of a frame, from bars to a square frame in numbered steps, worked out from the assembly: cut the bars (the
// cut list), drill and tap each mark (its cut-and-drill sheet), then make the joins, beam by beam, loading each slot nut
// that a join would shut in before that join is made, measure the diagonals of each bay once it is closed, then mount
// everything else. Each join's screws carry their key and how tight (fasten: the seat under the head, the lips of a
// slot under a blind join's head, or the torque given).
//   Sides: a bay is four beams joined in a rectangle in one plane (two parallel beams joined to two others square to
//   them). Bays that share no beam are built flat on the bench as sides, squared, and then joined to the rest (a beam
//   is in one side at most, so of two bays that share a post the first found is the side, and the other is squared
//   once the frame is joined). Beams that are in no side go on one at a time, each joined to what is already there; a
//   side goes on as one when a beam already there is joined to it.
//   Nuts: a slide-in nut goes into a slot from an open end. Where joins close its stretch of slot at both ends
//   (frame.nut), every order shuts it in at the second of those joins: the build is refused, naming the slot and the
//   join, and the nut that goes in through the opening. Where a join closes one way and an item placed at the end the
//   other (frame.preload), it is loaded just before that join.
//   Squareness: each bay's two diagonals, inside corner to inside corner, and the difference to accept, from the cut
//   tolerance of its beams (@rulecad/frames squareness): a side's once it is built, the rest once the frame is joined.
// The steps of the parts that are not beams (and not a join's fitting) follow the assembly's order (lib/order.mjs),
// whose screw access it keeps: where no order reaches a screw, the build is refused with that reason.
import { squareness, CUT_DEFAULTS } from '@rulecad/frames';
import { placeItems } from '@rulecad/model-link';
import path from 'node:path';
import { cutListOf, sheetFile } from './beams.mjs';
import { orderOf, fastenerText } from './order.mjs';
import { preloadOf, trappedOf } from './slotnuts.mjs';

const mm = (x) => String(+Number(x).toFixed(2));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// Each beam as a line in the world: end a, its axis, its section's two axes and sizes, its length, its cut tolerance
function linesOf(s) {
  const placed = placeItems(s.motion, s.jointValues), worlds = Object.fromEntries(s.motion.items.map((x, i) => [x[0], placed[i]])), out = new Map(); // (placeItems: by the order of the motion's items)
  for (const o of s.objects) {
    if (!o.beam || o.unplaced || !worlds[o.id]) continue;
    const W = worlds[o.id], p = o.beam.profile;
    out.set(o.id, { id: o.id, O: [W[3], W[7], W[11]], d: norm([W[2], W[6], W[10]]), X: [W[0], W[4], W[8]], Y: [W[1], W[5], W[9]], w: p.width, h: p.height, L: o.beam.length, tol: p.supply?.cutTolerance ?? CUT_DEFAULTS.tolerance.value });
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
      const sq = squareness(width, height, { tolerance: Math.max(A.tol, B.tol, C.tol, D.tol) });
      out.push({ beams: [A.id, B.id, C.id, D.id], name: `${A.id}, ${B.id}, ${C.id} and ${D.id}`, width: +width.toFixed(2), height: +height.toFixed(2), square: sq });
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
 * @returns {{ steps: { n: number, kind: string, text: string, lines?: string[], items?: string[], joins?: number[], side?: number }[], sides: object[], bays: object[], torques: object[], stuck: object|null }}
 *   kind: cut, drill, side (a side built flat), join, load, square, mount; sides: the bays built flat, with why another
 *   is not; torques: the tightening of each kind of join; stuck: { text, item, place, joins, nut, alternative } where a
 *   slot's nuts are shut in, or the assembly order's own
 */
export function frameBuild(s) {
  const joins = s.joins ?? [], L = linesOf(s), beamIds = [...L.keys()];
  const order = orderOf(s);
  if (order.stuck) return { steps: [], sides: [], bays: [], torques: [], stuck: { ...order.stuck } };
  const bays = baysOf(s);
  // sides: bays that share no beam with a side already chosen, in the order they are found; a bay that shares one is
  // squared once the frame is joined
  const sides = [], used = new Set();
  for (const bay of bays) if (!bay.beams.some((b) => used.has(b))) { sides.push(bay); for (const b of bay.beams) used.add(b); }
  const joinsBetween = (id, set) => joins.filter((j) => (j.items[0] === id && set.has(j.items[1])) || (j.items[1] === id && set.has(j.items[0])));
  const steps = [], made = new Set(), at = new Map(); // (at: join index to the step that makes it)
  const step = (x) => { steps.push(x); for (const k of x.joins ?? []) at.set(k, steps.length - 1); };
  const fittings = new Set(joins.map((j) => j.fitted?.item).filter(Boolean));
  // cut and drill
  const c = cutListOf(s);
  if (c) {
    step({ kind: 'cut', text: `Cut the beams: ${c.marks.map((m) => `${m.count} × ${m.mark} at ${mm(m.length)} mm`).join(', ')} (kerf ${c.rules.kerf.value} mm, ${c.rules.trim.value} mm off each bar's first end; cut each mark against one stop)`,
      lines: c.stock.flatMap((st) => [`${st.profile}: buy ${st.buy.map((x) => `${x.count} × ${mm(x.length)} mm`).join(', ')}`, ...st.bars.map((b, i) => `bar ${i + 1}, ${mm(b.length)} mm: ${b.cuts.map((q) => `${q.mark} ${mm(q.length)} (${q.item})`).join(', ')}; offcut ${mm(b.offcut)}`)]) });
    const work = c.marks.filter((m) => m.ops.length);
    if (work.length) step({ kind: 'drill', text: `Drill and tap each mark as its sheet shows, and write the item on each beam`, lines: work.map((m) => `${m.mark} (${m.items.join(', ')}): ${m.ops.join('; ')}: ${['exports', s.project, path.basename(sheetFile(s, m.mark))].join('/')}`) });
  }
  // a beam going on: the joins it makes with what is there, each of its screws
  const joinStep = (ids, set, extra = {}) => {
    const js = [...new Map(ids.flatMap((id) => joinsBetween(id, set)).map((j) => [j.index, j])).values()].filter((j) => !made.has(j.index));
    for (const j of js) made.add(j.index);
    return { joins: js.map((j) => j.index), lines: js.flatMap((j) => { const l = joinLines(s, j); return l.length ? l : [`${j.label}: ${j.fitted ? `its ${j.fitted.item}` : 'no screws: its fitting comes with the kind'}`]; }), ...extra };
  };
  const placeOne = (id, set, prefix = '') => { const x = joinStep([id], set); step({ kind: 'join', items: [id], text: `${prefix}${id} goes on${x.joins.length ? `, joined to ${list([...new Set(x.joins.map((k) => joins[k].items.find((q) => q !== id)))])}` : ''}`, ...x }); set.add(id); };
  // sides, each built flat
  sides.forEach((bay, i) => {
    const own = new Set(bay.beams), set = new Set(), name = `Side ${i + 1} (${bay.name})`;
    const first = [...bay.beams].sort((p, q) => joinsBetween(q, own).length - joinsBetween(p, own).length || beamIds.indexOf(p) - beamIds.indexOf(q))[0];
    step({ kind: 'side', side: i, items: [first], text: `${name}, built flat on the bench: lay ${first} down` }); set.add(first);
    for (let left = bay.beams.filter((b) => b !== first); left.length;) {
      const next = left.find((b) => joinsBetween(b, set).length) ?? left[0];
      placeOne(next, set, `${name}: `); left = left.filter((b) => b !== next);
    }
    step({ kind: 'square', side: i, items: bay.beams, text: `Square side ${i + 1} before its joins are tightened fully: ${bay.square.text}` });
  });
  // the frame: from the first side (or the first beam), beams on one at a time, sides on as one
  const set = new Set(sides[0]?.beams ?? beamIds.slice(0, 1)), sideLeft = sides.slice(1).map((b, k) => ({ bay: b, i: k + 1 }));
  if (!sides.length && beamIds.length) step({ kind: 'join', items: [beamIds[0]], text: `${beamIds[0]} first`, joins: [], lines: [] });
  for (let singles = beamIds.filter((b) => !used.has(b) && !set.has(b)); singles.length || sideLeft.length;) {
    const one = singles.find((b) => joinsBetween(b, set).length);
    if (one) { placeOne(one, set); singles = singles.filter((b) => b !== one); continue; }
    const k = sideLeft.findIndex((x) => x.bay.beams.some((b) => joinsBetween(b, set).length));
    if (k >= 0) {
      const { bay, i } = sideLeft.splice(k, 1)[0], x = joinStep(bay.beams, set);
      step({ kind: 'join', side: i, items: bay.beams, text: `Side ${i + 1} goes on as one, joined to ${list([...new Set(x.joins.flatMap((q) => joins[q].items).filter((q) => !bay.beams.includes(q)))])}`, ...x });
      for (const b of bay.beams) set.add(b);
      continue;
    }
    if (singles.length) { placeOne(singles[0], set); singles = singles.slice(1); continue; } // (a beam joined to nothing yet)
    const { bay, i } = sideLeft.shift(); for (const b of bay.beams) set.add(b);
    step({ kind: 'join', side: i, items: bay.beams, text: `Side ${i + 1} goes on as one`, joins: [], lines: [] });
  }
  // nuts: shut in by joins at both ends, refused; else loaded just before the join that closes their way
  const trapped = trappedOf(s);
  if (trapped.length) {
    const t = trapped[0], [p, q] = [...t.joins].sort((x, y) => (at.get(x.index) ?? -1) - (at.get(y.index) ?? -1)), n = (at.get(q.index) ?? 0) + 1;
    const alt = t.alternative ? `: give "nut": "${t.alternative.nutKind}" (${t.alternative.name}), which goes in through the opening anywhere` : `: no ${t.kind} nut of this thread goes in through the opening, so move the part to a slot with an open end`;
    return { steps: [], sides, bays, torques: [], stuck: { item: t.item, place: t.place, nut: t.nut, joins: [p.index, q.index], fasten: t.fasten, ...(t.alternative ? { alternative: t.alternative.name } : {}),
      text: `${t.item}'s ${t.named} slot: ${t.count} ${t.kind} nut${t.count > 1 ? 's' : ''} (${t.nut}) for ${t.part} would be shut in by the ${q.label} (step ${n}), the ${p.label} closing the other end: in any order the second of those joins shuts them in, and a nut loaded before it can never be taken out or replaced${alt}` } };
  }
  const loads = preloadOf(s);
  for (const pl of [...loads].sort((x, y) => (at.get(y.join.index) ?? 0) - (at.get(x.join.index) ?? 0))) {
    const k = at.get(pl.join.index);
    if (k == null) continue;
    steps.splice(k, 0, { kind: 'load', items: [pl.item], text: `Load${pl.text.slice(4)}: the next step makes that join` });
  }
  // the bays no side squared, once the frame is joined
  const later = bays.filter((b) => !sides.includes(b));
  if (later.length) step({ kind: 'square', items: [...new Set(later.flatMap((b) => b.beams))], text: `Square the frame before its joins are tightened fully: measure the diagonals of each bay${sides.length ? ' the sides did not' : ''}, push the long diagonal's corners together until each is within, then tighten`, lines: later.map((b) => `${b.name}: ${b.square.text}`) });
  // then everything else, in the assembly's order, with its fastenings
  const mounts = [];
  for (const st of order.steps) {
    const items = st.items.filter((id) => !L.has(id) && !fittings.has(id));
    if (!items.length) continue;
    const lines = st.fasteners.map(fastenerText), last = mounts.at(-1); // (copies of one thing with no screws of their own, one after another, are one step)
    if (last && st.object && last.object === st.object && !lines.length && !last.lines.length) last.items.push(...items);
    else mounts.push({ items, object: st.object, lines });
  }
  for (const m of mounts) step({ kind: 'mount', items: m.items, text: `${m.items.join(', ')}${m.object && !m.items.includes(m.object) ? ` (${m.object})` : ''} go${m.items.length > 1 ? '' : 'es'} on`, lines: m.lines });
  steps.forEach((x, i) => { x.n = i + 1; });
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
  return { steps, sides: sides.map((b) => ({ beams: b.beams, name: b.name, square: b.square })), bays, torques, stuck: null };
}

/** The frame's build as text, for cad order. @param {string} ref @param {object} b frameBuild's */
export function frameBuildText(ref, b) {
  if (b.stuck) return `${ref}: ${b.stuck.text}`;
  const out = [`${ref}: from bars to a square frame`];
  for (const st of b.steps) { out.push(`  ${String(st.n).padStart(2)}. ${st.text}`); for (const l of st.lines ?? []) out.push(`        ${l}`); }
  if (b.torques.length) { out.push('  Tightening, by kind of join:'); for (const t of b.torques) out.push(`    ${t.kind} (${t.joins} join${t.joins > 1 ? 's' : ''}, ${t.fasteners.join(', ')}${t.key ? ` with ${/^[aeiou8]/i.test(t.key) ? 'an' : 'a'} ${t.key}` : ''}): ${mm(t.torque)} N m, ${t.why}`); }
  return out.join('\n');
}

/** frame.square for each bay of a frame, in the assembly's findings shape: the diagonals to measure and the difference to accept. */
export function frameSquareChecks(s, f) {
  if (!s.joins?.length) return;
  for (const b of baysOf(s)) f('info', `the bay of ${b.name}: ${b.square.text}`, null, { code: 'frame.square', values: b.square.findings[0].values, refs: { beams: b.beams } });
}

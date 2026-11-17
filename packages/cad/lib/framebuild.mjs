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
import { squareness, CUT_DEFAULTS } from '@rulecad/frames';
import { placeItems } from '@rulecad/model-link';
import path from 'node:path';
import { cutListOf, sheetFile } from './beams.mjs';
import { orderOf, fastenerText } from './order.mjs';
import { preloadOf, trappedOf, closuresOf } from './slotnuts.mjs';

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
 * @returns {{ steps: { n: number, kind: string, text: string, lines?: string[], items?: string[], joins?: number[], side?: number, shown: string[], now: string[], dir: number[] }[], sides: object[], notFlat: object[], bays: object[], torques: object[], stuck: object|null }}
 *   kind: cut, drill, side (a side built flat), join, load, square, mount; shown: what is in view at that step (the side
 *   on the bench, or the frame so far), now: what goes on in it, dir: the way it goes on; sides: the bays built flat;
 *   notFlat: the bays that could be and are not, with why; torques: the tightening of each kind of join; stuck:
 *   { text, item, place, joins, nut, alternative } where a slot's nuts are shut in, or why no order reaches a screw
 */
export function frameBuild(s) {
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
    // nuts: loaded just before the first of the joins that close their way is made
    const { at } = where(), loads = preloadOf(s).map((pl) => ({ pl, k: Math.min(...pl.closers.map((j) => at.get(j.index) ?? Infinity)) })).filter((x) => Number.isFinite(x.k));
    for (const { pl, k } of loads.sort((x, y) => y.k - x.k)) {
      const first = pl.closers.find((j) => at.get(j.index) === k);
      steps.splice(k, 0, { kind: 'load', items: [pl.item], enters: [], ...(bench.has(pl.item) && k < where().enter.get(pl.item) ? { side: bench.get(pl.item), bench: true } : {}), text: `Load${pl.text.slice(4)}: the next step makes ${pl.closers.length > 1 ? `the ${first.label}` : 'that join'}` });
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


/** frame.square for each bay of a frame, in the assembly's findings shape: the diagonals to measure and the difference to accept. */
export function frameSquareChecks(s, f) {
  if (!s.joins?.length) return;
  for (const b of baysOf(s)) f('info', `the bay of ${b.name}: ${b.square.text}`, null, { code: 'frame.square', values: b.square.findings[0].values, refs: { beams: b.beams } });
}

// A board's tracks finished as a fab's engineer asks: no acute angles, and every track leaving a surface-mount pad
// square to its edge.
//  - Square exits: where a track leaves an SMD pad at an angle, it is redrawn to leave straight out of the pad's nearest
//    edge (a short run, `stub` past the edge) before it turns. A small part with a track pulling off its pad at an
//    angle can be drawn up on one end as its solder melts (tombstoning); square exits pull evenly.
//  - Acute angles: where two tracks of one net meet at under 90° (a bend, a junction, at a via or a pad), a short piece
//    of the same copper is laid across the corner, so the notch between them (where etchant pools: an acid trap) becomes
//    two obtuse corners.
// Every new piece of copper keeps the board's clearance from everything else; what can't be finished is listed.
import { copperOf, netsOf, padShape, distance, inside, segSeg } from './smooth.mjs';

const EPS = 1e-6;
const len = (v) => Math.hypot(v.x, v.y);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, v, t = 1) => ({ x: a.x + v.x * t, y: a.y + v.y * t });
const dot = (u, v) => u.x * v.x + u.y * v.y;
const unit = (v) => { const l = len(v); return l > EPS ? { x: v.x / l, y: v.y / l } : null; };
const angleAt = (p, a, b) => { const u = unit(sub(a, p)), v = unit(sub(b, p)); return u && v ? (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI : 180; };

// A rectangular SMD pad's frame: centre, its two axes, half its width and height. A polygon pad (a rounded rectangle
// drawn as one): the frame of its bounding rectangle, turned to its longest edge
function frameOf(e) {
  if (e.shape === 'circle') return null; // (a round pad has no edge to be square to)
  if (e.shape === 'polygon') {
    const pts = e.points; let best = null;
    for (let i = 0; i < pts.length; i++) { const d = sub(pts[(i + 1) % pts.length], pts[i]); if (!best || len(d) > len(best)) best = d; }
    const u = unit(best); if (!u) return null;
    const v = { x: -u.y, y: u.x }, cx = pts.reduce((n, p) => n + p.x, 0) / pts.length, cy = pts.reduce((n, p) => n + p.y, 0) / pts.length, c = { x: cx, y: cy };
    const hu = Math.max(...pts.map((p) => Math.abs(dot(sub(p, c), u)))), hv = Math.max(...pts.map((p) => Math.abs(dot(sub(p, c), v))));
    return { c, u, v, hu, hv };
  }
  const t = ((e.shape === 'rotated_rect' || e.shape === 'rotated_pill' ? e.ccw_rotation ?? 0 : 0) * Math.PI) / 180;
  return { c: { x: e.x, y: e.y }, u: { x: Math.cos(t), y: Math.sin(t) }, v: { x: -Math.sin(t), y: Math.cos(t) }, hu: e.width / 2, hv: e.height / 2 };
}
const within = (f, p) => Math.abs(dot(sub(p, f.c), f.u)) <= f.hu + 1e-4 && Math.abs(dot(sub(p, f.c), f.v)) <= f.hv + 1e-4;

/**
 * Finish a board's tracks (Circuit JSON): square exits from SMD pads, acute corners filled.
 * movable(trace): the tracks whose exits may be redrawn (default all). Fill copper is added beside any track.
 * clearance: copper to copper (mm); stubs: how far past a pad's edge a square exit runs before it turns, longest first.
 * Returns { json, exits: [{ trace, pad, at, kept }], fills: [{ at, angle, layer }], left: [{ kind, at, why }] }.
 * A redrawn kept track (rulecad_kept, one segment) carries its first shape as rulecad_squared ({ a, b }); fill copper is
 * a track of its own, marked rulecad_fill.
 */
export function finishCircuit(json, { movable = () => true, clearance, stubs = [0.3, 0.2, 0.12, 0.06], jitter = 0.02, square = (pad) => true } = {}) {
  json = structuredClone(json);
  const net = netsOf(json), board = json.find((e) => e.type === 'pcb_board') || {};
  const gap = clearance ?? board.min_trace_to_pad_edge_clearance ?? 0.1, holeGap = board.min_trace_to_hole_edge_clearance ?? 0.2, edge = board.min_board_edge_clearance ?? 0.2;
  const outline = board.outline?.length ? board.outline : board.center ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: board.center.x + (sx * board.width) / 2, y: board.center.y + (sy * board.height) / 2 })) : null;
  const traces = json.filter((e) => e.type === 'pcb_trace');
  const pads = json.filter((e) => e.type === 'pcb_smtpad' && square(e)).map((e) => ({ e, f: frameOf(e), net: net(e) })).filter((p) => p.f);
  const exits = [], fills = [], left = [];

  // Is a straight run from a to b, w wide, on layer, of net n, clear of everything of other nets (all tracks as they
  // are now) and inside the board, its edge kept?
  let stale = true, obstacles = [];
  const copper = () => { if (stale) { obstacles = copperOf(json, net, new Set(), holeGap); stale = false; } return obstacles; };
  // was: the segments the new copper replaces ([[p, q], ...]): it may also come as close to anything as they already did,
  // never closer (as smoothing does), so a track the router packed in tight can still be finished, and is never worse
  const clearOf = (a, b, layer, w, n, was = null) => {
    const before = (f) => (was?.length ? Math.min(...was.map(([p, q]) => f(p, q))) : -Infinity);
    for (const o of copper()) {
      if (o.layer !== '*' && o.layer !== layer) continue;
      if (n != null && o.net != null && o.net === n) continue;
      const d = distance(a, b, o.shape);
      if (d < w / 2 + (o.clear ?? gap) - 1e-9 && d < before((p, q) => distance(p, q, o.shape)) - 1e-9) return false;
    }
    if (outline) {
      if (!inside(outline, a) || !inside(outline, b)) return false;
      for (let i = 0; i < outline.length; i++) {
        const e = [outline[i], outline[(i + 1) % outline.length]], d = segSeg(a, b, ...e);
        if (d < w / 2 + edge - 1e-9 && d < before((p, q) => segSeg(p, q, ...e)) - 1e-9) return false;
      }
    }
    return true;
  };

  // ---- jitter ----
  // A routed track's points closer than `jitter` to the last one kept (a doubled point, a 0.01 mm zigzag) dropped: its
  // copper moves less than that, and the corners they make aren't real. Ends, vias and layer changes stay
  for (const t of traces) {
    if (!movable(t) || t.rulecad_kept) continue;
    const r = t.route, out = [r[0]];
    for (let i = 1; i < r.length; i++) {
      const p = r[i], q = out.at(-1), keep = i === r.length - 1 || p.route_type !== 'wire' || q.route_type !== 'wire' || p.layer !== q.layer || r[i + 1]?.route_type !== 'wire' // (a width change over less than jitter is no change)
      if (keep || len(sub(p, q)) >= jitter) out.push(p)
    }
    if (out.length !== r.length) { t.route = out; stale = true }
  }

  // ---- square exits ----
  for (const t of traces) {
    const may = movable(t), n = net(t);
    for (const end of ['start', 'end']) {
      const r = end === 'start' ? t.route : [...t.route].reverse();
      const p0 = r[0];
      if (p0?.route_type !== 'wire') continue;
      const pad = pads.find((p) => p.e.layer === p0.layer && within(p.f, p0));
      if (!pad) continue;
      // the first point past the pad along the track (points inside it don't count), and the one after
      let k = 1; while (k < r.length && r[k].route_type === 'wire' && r[k].layer === p0.layer && within(pad.f, r[k])) k++;
      const p1 = r[k];
      if (!p1 || p1.route_type !== 'wire' || p1.layer !== p0.layer) continue;
      const d = unit(sub(p1, r[k - 1])); if (!d) continue;
      const axes = [[pad.f.u, pad.f.hu], [{ x: -pad.f.u.x, y: -pad.f.u.y }, pad.f.hu], [pad.f.v, pad.f.hv], [{ x: -pad.f.v.x, y: -pad.f.v.y }, pad.f.hv]];
      if (axes.some(([a]) => dot(a, d) > Math.cos((1 * Math.PI) / 180))) continue; // already square (within 1°)
      if (!may) { left.push({ kind: 'exit', at: { x: p0.x, y: p0.y }, layer: p0.layer, why: 'not to be moved', kept: !!t.rulecad_kept }); continue; }
      const w = p0.width ?? 0.15, last = k === r.length - 1; // (a trace's last point joins other copper: it stays)
      let done = null;
      for (const [a, half] of axes.filter(([a]) => dot(a, d) > -EPS).sort(([a], [b]) => dot(b, d) - dot(a, d))) {
        for (const s of stubs) {
          const from = r[k - 1], x = add(from, a, half - dot(sub(from, pad.f.c), a) + s); // straight out of the edge, s past it
          // carry on to p1, or (when p1 is behind the stub's end and isn't the track's end) to the point after it
          for (const j of last ? [k] : [k, k + 1, k + 2]) {
            const q = r[j];
            if (!q || q.route_type !== 'wire' || q.layer !== p0.layer) continue;
            if (angleAt(x, from, q) < 90 - 1e-6) continue; // no new acute bend at the stub's end
            const was = r.slice(k - 1, j + 1).map((p, i, all) => [p, all[i + 1]]).slice(0, -1).filter(([p, q]) => q && p.route_type === 'wire' && q.route_type === 'wire')
            if (j > k && r.slice(k, j).some((p) => p.route_type !== 'wire' || p.layer !== p0.layer)) continue // (never skip a via)
            if (!clearOf(from, x, p0.layer, w, n, was) || !clearOf(x, q, p0.layer, w, n, was)) continue;
            done = { x: { ...from, x: x.x, y: x.y }, j }; break;
          }
          if (done) break;
        }
        if (done) break;
      }
      // A track that ends where it joins one other track (a kept source's segments, a pair): the two redrawn together,
      // the first leaving the pad square and joining the second's far end, where nothing else meets at the joint
      if (!done && last) {
        const p1 = r[k], at = (q) => len(sub(q, p1)) < 1e-4
        const joins = traces.filter((o) => o !== t).flatMap((o) => [[o, 0], [o, o.route.length - 1]].filter(([oo, i]) => oo.route[i]?.route_type === 'wire' && oo.route[i].layer === p0.layer && at(oo.route[i])))
        const busy = json.some((e) => (e.type === 'pcb_via' || e.type === 'pcb_plated_hole') && len(sub(e, p1)) < 0.3) || pads.some((q) => q.e.layer === p0.layer && within(q.f, p1))
          || traces.some((o) => o !== t && o.route.some((q, i) => i > 0 && i < o.route.length - 1 && at(q)))
        if (joins.length === 1 && !busy && movable(joins[0][0])) {
          const [o, oi] = joins[0], or = oi === 0 ? o.route : [...o.route].reverse(), p2 = or[1]
          if (p2?.route_type === 'wire' && p2.layer === p0.layer) {
            for (const [a, half] of axes.filter(([a]) => dot(a, d) > -EPS).sort(([a], [b]) => dot(b, d) - dot(a, d))) {
              for (const sx of stubs) {
                const from = r[k - 1], x = add(from, a, half - dot(sub(from, pad.f.c), a) + sx)
                if (angleAt(x, from, p2) < 90 - 1e-6 || (or[2]?.route_type === 'wire' && or[2].layer === p0.layer && angleAt(p2, x, or[2]) < 90 - 1e-6)) continue
                const was = [[from, p1], [p1, p2]], w2 = Math.max(w, p2.width ?? w)
                if (!clearOf(from, x, p0.layer, w, n, was) || !clearOf(x, p2, p0.layer, w2, n, was)) continue
                const X = { ...p1, x: x.x, y: x.y }
                for (const tr of [t, o]) if (tr.rulecad_kept && !tr.rulecad_squared) tr.rulecad_squared = { a: { ...tr.route[0] }, b: { ...tr.route.at(-1) } }
                t.rulecad_pair = o.rulecad_pair = `${t.pcb_trace_id}+${o.pcb_trace_id}` // (redrawn together: undone together)
                o.route = oi === 0 ? [{ ...or[0], x: x.x, y: x.y }, ...or.slice(1)] : [...or.slice(1).reverse(), { ...or[0], x: x.x, y: x.y }]
                done = { x: X, j: k + 1 }; break
              }
              if (done) break
            }
          }
        }
      }
      if (!done) { left.push({ kind: 'exit', at: { x: p0.x, y: p0.y }, layer: p0.layer, why: 'no room for a square exit', kept: !!t.rulecad_kept }); continue; }
      const next = [...r.slice(0, k), done.x, ...r.slice(done.j)];
      if (t.rulecad_kept && !t.rulecad_squared) t.rulecad_squared = { a: { ...t.route[0] }, b: { ...t.route.at(-1) } };
      t.route = end === 'start' ? next : next.reverse(); stale = true;
      exits.push({ trace: t.pcb_trace_id, pad: pad.e.pcb_smtpad_id, at: { x: p0.x, y: p0.y }, kept: !!t.rulecad_kept });
    }
  }

  // ---- acute corners ----
  // Every point where track segments of one layer meet (a shared end, or an end on another segment's middle): each
  // pair of arms closer than 90° gets a piece across the corner, far enough out that the notch between them is covered
  let segs = [];
  for (let round = 0, pending = []; ; round++) {
  segs = []; pending = [];
  let rerooted = 0;
  for (const t of json.filter((e) => e.type === 'pcb_trace')) for (let i = 0; i + 1 < t.route.length; i++) {
    const a = t.route[i], b = t.route[i + 1];
    if (a.route_type === 'wire' && b.route_type === 'wire' && a.layer === b.layer && len(sub(a, b)) > EPS) segs.push({ a, b, i, layer: a.layer, w: Math.min(a.width ?? 0.15, b.width ?? 0.15), t, net: net(t) });
  }
  const key = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`, joints = new Map();
  // an arm: from a joint along a track, its path past the segment's end too, while the track carries on on that layer
  // (so a fill can reach past a short neck or a smoothing point): path, the points from the joint on
  const pathFrom = (p, s, toward) => {
    const r = s.t.route, step = toward === s.b ? 1 : -1, pts = [p];
    for (let i = toward === s.b ? s.i + 1 : s.i; i >= 0 && i < r.length && r[i].route_type === 'wire' && r[i].layer === s.layer; i += step) pts.push(r[i]);
    return pts;
  };
  const lengthOf = (pts) => pts.slice(1).reduce((n, q, i) => n + len(sub(q, pts[i])), 0);
  const pointOn = (pts, d) => { for (let i = 1; i < pts.length; i++) { const l = len(sub(pts[i], pts[i - 1])); if (d <= l + 1e-9) return add(pts[i - 1], unit(sub(pts[i], pts[i - 1])) || { x: 0, y: 0 }, d); d -= l; } return null; };
  const arm = (p, s, to) => { const k = `${s.layer} ${key(p)}`; if (!joints.has(k)) joints.set(k, { p, layer: s.layer, arms: [] }); const path = pathFrom(p, s, to); joints.get(k).arms.push({ dir: unit(sub(to, p)), reach: len(sub(to, p)), far: lengthOf(path), path, w: s.w, s }); };
  for (const s of segs) { arm(s.a, s, s.b); arm(s.b, s, s.a); }
  for (const s of segs) for (const j of joints.values()) { // an end landing on another segment's middle: two arms there
    if (j.layer !== s.layer || key(j.p) === key(s.a) || key(j.p) === key(s.b)) continue;
    const along = dot(sub(j.p, s.a), unit(sub(s.b, s.a))), l = len(sub(s.b, s.a));
    if (along <= EPS || along >= l - EPS || Math.abs((j.p.x - s.a.x) * (s.b.y - s.a.y) - (j.p.y - s.a.y) * (s.b.x - s.a.x)) / l > 1e-3) continue;
    const pa = pathFrom(j.p, s, s.a), pb = pathFrom(j.p, s, s.b);
    j.arms.push({ dir: unit(sub(s.a, j.p)), reach: along, far: lengthOf(pa), path: pa, w: s.w, s }, { dir: unit(sub(s.b, j.p)), reach: l - along, far: lengthOf(pb), path: pb, w: s.w, s });
  }
  for (const j of joints.values()) {
    const arms = j.arms.filter((x) => x.dir);
    for (let i = 0; i < arms.length; i++) for (let m = i + 1; m < arms.length; m++) {
      const A = arms[i], B = arms[m], th = (Math.acos(Math.max(-1, Math.min(1, dot(A.dir, B.dir)))) * 180) / Math.PI;
      if (th >= 90 - 1e-6 || th < 1e-3) continue;
      if (th < 2 && Math.min(A.far, B.far) * Math.sin((th * Math.PI) / 180) < Math.max(A.w, B.w) / 2) continue; // (two tracks lying along each other: one piece of copper, no notch)
      // nothing between the two arms (another arm inside the corner already splits it)
      if (arms.some((C) => C !== A && C !== B && dot(C.dir, A.dir) > dot(B.dir, A.dir) + 1e-9 && dot(C.dir, B.dir) > dot(A.dir, B.dir) + 1e-9)) continue;
      const w = Math.max(A.w, B.w), half = (th * Math.PI) / 360, notch = w / 2 / Math.sin(half); // the notch's corner, out along the bisector
      if (covered(j.p, A.dir, B.dir, notch, j.layer, A.s.net, [A.s, B.s])) continue; // copper there already (a pad, a via, a fill): no notch
      const want = (notch + w / 2) / Math.cos(half); // the piece's inner edge through the notch's corner
      // the piece covers the notch's corner when its centre line lies within w / 2 of it along the bisector: any r from
      // rmin to want (nearer the corner, its copper only overlaps the arms' more)
      const rmin = Math.max(0, (notch - w / 2) / Math.cos(half))
      let r = Math.min(want, A.reach, B.reach), a = add(j.p, A.dir, r), b = add(j.p, B.dir, r);
      if (r < rmin - 1e-6 && Math.min(A.far, B.far) >= rmin) { // along the tracks' paths past a short segment, if the piece still covers the corner
        const rr = Math.min(want, A.far, B.far), pa = pointOn(A.path, rr), pb = pointOn(B.path, rr), bis = unit({ x: A.dir.x + B.dir.x, y: A.dir.y + B.dir.y })
        const q = bis && add(j.p, bis, notch)
        if (pa && pb && q && distance(q, q, { capsule: { a: pa, b: pb, r: w / 2 } }) <= 0.02) { r = rr; a = pa; b = pb; }
      }
      // A very sharp corner whose shorter arm ends (the track bends away) while its copper still overlaps the other's: that
      // track leaves from the other one instead, square to it, where it bends away (a T-junction). The corner it makes
      // there has long arms, filled next round
      if (r < rmin - 1e-6) {
        const [S, O] = A.reach <= B.reach ? [A, B] : [B, A], route = S.s.t.route
        const endAt = key(route[0]) === key(j.p) ? 0 : key(route.at(-1)) === key(j.p) ? route.length - 1 : -1
        const F = add(j.p, S.dir, S.reach), along = dot(sub(F, j.p), O.dir), Q = add(j.p, O.dir, along)
        if (endAt >= 0 && along > 0 && along < O.reach && len(sub(F, Q)) <= O.w / 2 + 1e-9 && movable(S.s.t)) {
          if (!S.s.t.rulecad_squared) S.s.t.rulecad_squared = { a: { ...route[0] }, b: { ...route.at(-1) } }
          S.s.t.rulecad_rerooted = true
          route[endAt] = { ...route[endAt], x: Q.x, y: Q.y }; rerooted++; stale = true
          // where it bent away is now a hair from where it joins (under jitter): that point goes, or it would make a
          // new hook of its own; the track leaves the other straight from the join (a corner there is filled next round)
          const nb = endAt === 0 ? 1 : route.length - 2
          if (route.length > 2 && route[nb].route_type === 'wire' && route[nb].layer === route[endAt].layer && len(sub(route[nb], Q)) < jitter) route.splice(nb, 1)
          exits.push({ trace: S.s.t.pcb_trace_id, at: { x: j.p.x, y: j.p.y }, rerooted: true, kept: !!S.s.t.rulecad_kept }); continue
        }
      }
      if (r < rmin - 1e-6 || !clearOf(a, b, j.layer, w, A.s.net)) { pending.push({ kind: 'acute', at: { x: j.p.x, y: j.p.y }, layer: j.layer, angle: th, kept: !!(A.s.t.rulecad_kept && B.s.t.rulecad_kept), why: r < rmin - 1e-6 ? 'arms too short to cover the notch' : 'no room across the corner' }); continue; }
      const base = A.s.t;
      json.push({ type: 'pcb_trace', pcb_trace_id: `${base.pcb_trace_id}_fill_${fills.length}`, source_trace_id: base.source_trace_id, subcircuit_id: base.subcircuit_id,
        route: [{ route_type: 'wire', x: a.x, y: a.y, width: w, layer: j.layer }, { route_type: 'wire', x: b.x, y: b.y, width: w, layer: j.layer }], rulecad_fill: true });
      fills.push({ at: { x: j.p.x, y: j.p.y }, angle: th, layer: j.layer, kept: !!(A.s.t.rulecad_kept && B.s.t.rulecad_kept) }); stale = true;
    }
  }
  if (!rerooted || round >= 2) { left.push(...pending); break; }
  }

  return { json, exits, fills, left };

  // Is the notch's corner (notch out along the bisector of two arms from p) inside copper of the net already: a pad,
  // a via, or another track (a fill laid across it)? (The arms themselves stop just short of it: it is where their edges meet)
  function covered(p, u, v, notch, layer, n, arms) {
    const bis = unit({ x: u.x + v.x, y: u.y + v.y }); if (!bis) return false;
    const q = add(p, bis, notch), near = (x) => x <= 0.02; // (within 0.02 mm: no gap a fab could etch)
    for (const o of copper()) { // pads and vias of the net
      if ((o.layer !== '*' && o.layer !== layer) || o.net == null || o.net !== n || o.clear != null || o.trace) continue;
      if (near(distance(q, q, o.shape))) return true;
    }
    for (const s of segs) { // tracks of the net, but the two arms (they stop just short of it: it is where their edges meet)
      if (arms.includes(s) || s.layer !== layer || s.net !== n) continue;
      if (near(distance(q, q, { capsule: { a: s.a, b: s.b, r: s.w / 2 } }))) return true;
    }
    for (const t of json) if (t.rulecad_fill && t.route[0].layer === layer && near(distance(q, q, { capsule: { a: t.route[0], b: t.route[1], r: t.route[0].width / 2 } }))) return true;
    return false;
  }
}

/**
 * What a board's tracks still have that a fab's engineer would flag: SMD pad exits not square to the pad's edge and
 * acute corners between tracks of one net (fill copper counts: a corner it covers isn't left). For the checks.
 * @returns {{ exits: { at: object, angle: number }[], acute: { at: object, angle: number }[] }}
 */
export function unfinished(json, { square = () => true } = {}) {
  const { left, fills } = finishCircuit(json, { movable: () => false, square }); // (nothing moved: what's left, and the fills it would need)
  return { exits: left.filter((l) => l.kind === 'exit'), acute: [...left.filter((l) => l.kind === 'acute'), ...fills.map((f) => ({ ...f, kind: 'acute' }))] };
}

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
export function finishCircuit(json, { movable = () => true, clearance, stubs = [0.3, 0.2, 0.12], square = (pad) => true } = {}) {
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
  const clearOf = (a, b, layer, w, n) => {
    for (const o of copper()) {
      if (o.layer !== '*' && o.layer !== layer) continue;
      if (n != null && o.net != null && o.net === n) continue;
      if (distance(a, b, o.shape) < w / 2 + (o.clear ?? gap) - 1e-9) return false;
    }
    if (outline) {
      if (!inside(outline, a) || !inside(outline, b)) return false;
      for (let i = 0; i < outline.length; i++) if (segSeg(a, b, outline[i], outline[(i + 1) % outline.length]) < w / 2 + edge - 1e-9) return false;
    }
    return true;
  };

  // ---- square exits ----
  for (const t of traces) {
    if (!movable(t)) continue;
    const n = net(t);
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
      const w = p0.width ?? 0.15, last = k === r.length - 1; // (a trace's last point joins other copper: it stays)
      let done = null;
      for (const [a, half] of axes.filter(([a]) => dot(a, d) > -EPS).sort(([a], [b]) => dot(b, d) - dot(a, d))) {
        for (const s of stubs) {
          const from = r[k - 1], x = add(from, a, half - dot(sub(from, pad.f.c), a) + s); // straight out of the edge, s past it
          // carry on to p1, or (when p1 is behind the stub's end and isn't the track's end) to the point after it
          for (const j of last ? [k] : [k, k + 1]) {
            const q = r[j];
            if (!q || q.route_type !== 'wire' || q.layer !== p0.layer) continue;
            if (angleAt(x, from, q) < 90 - 1e-6) continue; // no new acute bend at the stub's end
            if (!clearOf(from, x, p0.layer, w, n) || !clearOf(x, q, p0.layer, w, n)) continue;
            done = { x: { ...from, x: x.x, y: x.y }, j }; break;
          }
          if (done) break;
        }
        if (done) break;
      }
      if (!done) { left.push({ kind: 'exit', at: { x: p0.x, y: p0.y }, layer: p0.layer, why: 'no room for a square exit' }); continue; }
      const next = [...r.slice(0, k), done.x, ...r.slice(done.j)];
      if (t.rulecad_kept && !t.rulecad_squared) t.rulecad_squared = { a: { ...t.route[0] }, b: { ...t.route.at(-1) } };
      t.route = end === 'start' ? next : next.reverse(); stale = true;
      exits.push({ trace: t.pcb_trace_id, pad: pad.e.pcb_smtpad_id, at: { x: p0.x, y: p0.y }, kept: !!t.rulecad_kept });
    }
  }

  // ---- acute corners ----
  // Every point where track segments of one layer meet (a shared end, or an end on another segment's middle): each
  // pair of arms closer than 90° gets a piece across the corner, far enough out that the notch between them is covered
  const segs = [];
  for (const t of json.filter((e) => e.type === 'pcb_trace')) for (let i = 0; i + 1 < t.route.length; i++) {
    const a = t.route[i], b = t.route[i + 1];
    if (a.route_type === 'wire' && b.route_type === 'wire' && a.layer === b.layer && len(sub(a, b)) > EPS) segs.push({ a, b, layer: a.layer, w: Math.min(a.width ?? 0.15, b.width ?? 0.15), t, net: net(t) });
  }
  const key = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`, joints = new Map();
  const arm = (p, s, to) => { const k = `${s.layer} ${key(p)}`; if (!joints.has(k)) joints.set(k, { p, layer: s.layer, arms: [] }); joints.get(k).arms.push({ dir: unit(sub(to, p)), reach: len(sub(to, p)), w: s.w, s }); };
  for (const s of segs) { arm(s.a, s, s.b); arm(s.b, s, s.a); }
  for (const s of segs) for (const j of joints.values()) { // an end landing on another segment's middle: two arms there
    if (j.layer !== s.layer || key(j.p) === key(s.a) || key(j.p) === key(s.b)) continue;
    const along = dot(sub(j.p, s.a), unit(sub(s.b, s.a))), l = len(sub(s.b, s.a));
    if (along <= EPS || along >= l - EPS || Math.abs((j.p.x - s.a.x) * (s.b.y - s.a.y) - (j.p.y - s.a.y) * (s.b.x - s.a.x)) / l > 1e-3) continue;
    j.arms.push({ dir: unit(sub(s.a, j.p)), reach: along, w: s.w, s }, { dir: unit(sub(s.b, j.p)), reach: l - along, w: s.w, s });
  }
  for (const j of joints.values()) {
    const arms = j.arms.filter((x) => x.dir);
    for (let i = 0; i < arms.length; i++) for (let m = i + 1; m < arms.length; m++) {
      const A = arms[i], B = arms[m], th = (Math.acos(Math.max(-1, Math.min(1, dot(A.dir, B.dir)))) * 180) / Math.PI;
      if (th >= 90 - 1e-6 || th < 1e-3) continue;
      // nothing between the two arms (another arm inside the corner already splits it)
      if (arms.some((C) => C !== A && C !== B && dot(C.dir, A.dir) > dot(B.dir, A.dir) + 1e-9 && dot(C.dir, B.dir) > dot(A.dir, B.dir) + 1e-9)) continue;
      const w = Math.max(A.w, B.w), half = (th * Math.PI) / 360, notch = w / 2 / Math.sin(half); // the notch's corner, out along the bisector
      if (covered(j.p, A.dir, B.dir, notch, j.layer, A.s.net, [A.s, B.s])) continue; // copper there already (a pad, a via, a fill): no notch
      const want = (notch + w / 2) / Math.cos(half); // the piece's inner edge through the notch's corner
      const r = Math.min(want, A.reach, B.reach), a = add(j.p, A.dir, r), b = add(j.p, B.dir, r);
      if (r < want - 1e-6 || !clearOf(a, b, j.layer, w, A.s.net)) { left.push({ kind: 'acute', at: { x: j.p.x, y: j.p.y }, layer: j.layer, angle: th, why: r < want - 1e-6 ? 'arms too short to cover the notch' : 'no room across the corner' }); continue; }
      const base = A.s.t;
      json.push({ type: 'pcb_trace', pcb_trace_id: `${base.pcb_trace_id}_fill_${fills.length}`, source_trace_id: base.source_trace_id, subcircuit_id: base.subcircuit_id,
        route: [{ route_type: 'wire', x: a.x, y: a.y, width: w, layer: j.layer }, { route_type: 'wire', x: b.x, y: b.y, width: w, layer: j.layer }], rulecad_fill: true });
      fills.push({ at: { x: j.p.x, y: j.p.y }, angle: th, layer: j.layer }); stale = true;
    }
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
  const { left, exits, fills } = finishCircuit(json, { movable: () => true, square, stubs: [] });
  return { exits: left.filter((l) => l.kind === 'exit'), acute: [...left.filter((l) => l.kind === 'acute'), ...fills.map((f) => ({ ...f, kind: 'acute' }))] };
}

// Routed tracks, tidied: where an autorouter's track wiggles, doubles back or detours, the bends between two of its points
// are dropped and the two joined straight, wherever that straight run keeps its clearance from all other copper, holes
// and the board's edge. Only bend points are dropped: a track's ends, its vias and every point it keeps stay exactly
// where they were, so it still starts and finishes on the same pads, and changes layer in the same places. Tracks not
// passed in are never moved; they are only kept clear of.
//
// smoothCircuit(json, { movable, clearance }) works on Circuit JSON (tscircuit's board format) as a whole; smooth()
// is the geometry underneath, for any board description.

/**
 * Tracks pulled tight, round everything in their way.
 * tracks: [{ route: [{ route_type: 'wire', x, y, width, layer } | { route_type: 'via', x, y, ... }], net }]: the tracks that
 *   may change, each route as Circuit JSON has it. net: anything comparable; copper of the same net isn't in the way
 * obstacles: [{ layer, net, shape }] where layer is 'top', 'bottom', ... or '*' (every layer), and shape is
 *   { circle: { x, y, r } }, { capsule: { a, b, r } } (a track or a pill), or { polygon: [{ x, y }, ...] }; each with
 *   clear (mm, its own clearance, overriding the default)
 * outline: the board's edge, a polygon [{ x, y }, ...], with edge (mm): how far copper keeps from it
 * clearance: copper to copper (mm)
 * Returns the routes, in order: each a copy of its track's route with only bend points removed.
 * @param {{ route: object[], net?: any }[]} tracks @param {object[]} obstacles
 * @param {{ clearance?: number, outline?: { x: number, y: number }[] | null, edge?: number }} [o]
 * @returns {object[][]}
 */
export function smooth(tracks, obstacles, { clearance = 0.1, outline = null, edge = 0.2 } = {}) {
  const grid = new Grid(1);
  const add = (o) => { o.box = boxOf(o.shape); grid.insert(o); return o; };
  for (const o of obstacles) add({ ...o });
  // Each track's own segments, in the way of every other track, and updated as it is smoothed
  const own = tracks.map((t) => segmentsOf(t.route).map((s) => add({ layer: s.layer, net: t.net, track: t, shape: { capsule: { a: s.a, b: s.b, r: s.w / 2 } } })));
  return tracks.map((t, k) => {
    const route = pull(t, (a, b, layer, w) => clear(a, b, layer, w, t));
    for (const o of own[k]) grid.remove(o); // its new segments take the old ones' place
    own[k] = segmentsOf(route).map((s) => add({ layer: s.layer, net: t.net, track: t, shape: { capsule: { a: s.a, b: s.b, r: s.w / 2 } } }));
    return route;
  });

  // A straight run from a to b, w wide, on layer, clear of everything not the track's own and not of its net
  function clear(a, b, layer, w, track) {
    const r = w / 2, reach = r + Math.max(clearance, edge) + 1;
    const near = grid.query({ x0: Math.min(a.x, b.x) - reach, y0: Math.min(a.y, b.y) - reach, x1: Math.max(a.x, b.x) + reach, y1: Math.max(a.y, b.y) + reach });
    for (const o of near) {
      if (o.track === track || (o.layer !== '*' && o.layer !== layer)) continue;
      if (track.net != null && o.net != null && o.net === track.net) continue;
      if (distance(a, b, o.shape) < r + (o.clear ?? clearance) - 1e-9) return false;
    }
    if (outline) {
      if (!inside(outline, a) || !inside(outline, b)) return false;
      for (let i = 0; i < outline.length; i++) if (segSeg(a, b, outline[i], outline[(i + 1) % outline.length]) < r + edge - 1e-9) return false;
    }
    return true;
  }
}

// One track pulled tight: along each run of points on one layer and at one width, from each kept point straight to the
// farthest point after it that it can reach clear; the points skipped are dropped. Vias and layer changes end a run.
function pull(track, isClear) {
  const r = track.route, out = [];
  for (let i = 0; i < r.length;) {
    out.push(r[i]);
    let end = i; // the last point of the run from here
    if (r[i].route_type === 'wire') while (end + 1 < r.length && r[end + 1].route_type === 'wire' && r[end + 1].layer === r[i].layer && r[end + 1].width === r[i].width) end++;
    let next = i + 1;
    for (let k = end; k > i + 1; k--) if (isClear(r[i], r[k], r[i].layer, r[i].width)) { next = k; break; }
    i = next;
  }
  return out;
}

// The wire segments of a route: { a, b, w, layer }
function segmentsOf(route) {
  const out = [];
  for (let i = 0; i + 1 < route.length; i++) {
    const p = route[i], q = route[i + 1];
    if (p.route_type === 'wire' && q.route_type === 'wire' && p.layer === q.layer) out.push({ a: p, b: q, w: Math.max(p.width, q.width), layer: p.layer });
  }
  return out;
}

// ---- geometry ----
const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (u, v) => u.x * v.y - u.y * v.x;
function pointSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
// The distance between two segments (0 if they cross)
export function segSeg(a, b, c, d) {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a)), d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}
export function inside(poly, p) {
  let n = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) n = !n;
  return n;
}
// The distance from the segment a-b to a shape's edge (0 if it reaches inside)
export function distance(a, b, shape) {
  if (shape.circle) return Math.max(0, pointSeg(shape.circle, a, b) - shape.circle.r);
  if (shape.capsule) return Math.max(0, segSeg(a, b, shape.capsule.a, shape.capsule.b) - shape.capsule.r);
  const poly = shape.polygon;
  if (inside(poly, a) || inside(poly, b)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segSeg(a, b, poly[i], poly[(i + 1) % poly.length]));
  return d;
}
function boxOf(shape) {
  if (shape.circle) { const { x, y, r } = shape.circle; return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }; }
  if (shape.capsule) { const { a, b, r } = shape.capsule; return { x0: Math.min(a.x, b.x) - r, y0: Math.min(a.y, b.y) - r, x1: Math.max(a.x, b.x) + r, y1: Math.max(a.y, b.y) + r }; }
  const xs = shape.polygon.map((p) => p.x), ys = shape.polygon.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
// Shapes filed by the square cells their bounds cover, to find those near a segment quickly
class Grid {
  constructor(size) { this.size = size; this.cells = new Map(); }
  *keys(b) {
    const s = this.size;
    for (let i = Math.floor(b.x0 / s); i <= Math.floor(b.x1 / s); i++) for (let j = Math.floor(b.y0 / s); j <= Math.floor(b.y1 / s); j++) yield `${i},${j}`;
  }
  insert(o) { for (const k of this.keys(o.box)) { if (!this.cells.has(k)) this.cells.set(k, new Set()); this.cells.get(k).add(o); } }
  remove(o) { for (const k of this.keys(o.box)) this.cells.get(k)?.delete(o); }
  query(b) { const out = new Set(); for (const k of this.keys(b)) for (const o of this.cells.get(k) || []) out.add(o); return out; }
}

// ---- Circuit JSON ----
/**
 * A board's tracks pulled tight, as smooth() does, read from and written back to Circuit JSON. Only the pcb_trace elements
 * movable(trace) picks change; every pad, hole, via, other track and the board's edge (pcb_board's outline, or its
 * rectangle) is kept clear of. Copper of the same net (joined by its source traces) isn't in the way.
 * clearance: copper to copper (default: the board's min_trace_to_pad_edge_clearance, else 0.1);
 * holes keep min_trace_to_hole_edge_clearance (0.2) from their edge, and rulecad_keepout (a screw head's room) from
 * their centre; the board's edge keeps min_board_edge_clearance (0.2).
 * Returns { json: a copy with the tracks replaced, routes: a Map from each changed track's pcb_trace_id to its new route,
 * changed: how many tracks changed, dropped: bend points dropped }.
 * @param {object[]} json @param {{ movable?: (trace: object) => boolean, clearance?: number }} [o]
 */
export function smoothCircuit(json, { movable = () => true, clearance } = {}) {
  const net = netsOf(json);
  const board = json.find((e) => e.type === 'pcb_board') || {};
  const gap = clearance ?? board.min_trace_to_pad_edge_clearance ?? 0.1, holeGap = board.min_trace_to_hole_edge_clearance ?? 0.2;
  const outline = board.outline?.length ? board.outline : board.center ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: board.center.x + (sx * board.width) / 2, y: board.center.y + (sy * board.height) / 2 })) : null;
  const moving = json.filter((e) => e.type === 'pcb_trace' && movable(e));
  const still = new Set(moving);
  const obstacles = [];
  for (const e of json) {
    if (e.type === 'pcb_smtpad') obstacles.push({ layer: e.layer, net: net(e), shape: padShape(e) });
    else if (e.type === 'pcb_plated_hole') {
      const n = net(e), hx = e.x + (e.hole_offset_x ?? 0), hy = e.y + (e.hole_offset_y ?? 0);
      obstacles.push({ layer: '*', net: n, shape: holePadShape(e) });
      obstacles.push({ layer: '*', net: null, clear: holeGap, shape: { circle: { x: hx, y: hy, r: (e.hole_diameter ?? Math.max(e.hole_width ?? 0, e.hole_height ?? 0)) / 2 } } });
    } else if (e.type === 'pcb_via') obstacles.push({ layer: '*', net: net(e), shape: { circle: { x: e.x, y: e.y, r: e.outer_diameter / 2 } } });
    else if (e.type === 'pcb_hole') {
      const r = (e.hole_diameter ?? Math.max(e.hole_width ?? 0, e.hole_height ?? 0)) / 2;
      obstacles.push({ layer: '*', net: null, clear: holeGap, shape: { circle: { x: e.x, y: e.y, r } } });
      if (e.rulecad_keepout) obstacles.push({ layer: '*', net: null, clear: 0, shape: { circle: { x: e.x, y: e.y, r: e.rulecad_keepout } } });
    } else if (e.type === 'pcb_trace' && !still.has(e)) {
      for (const s of segmentsOf(e.route)) obstacles.push({ layer: s.layer, net: net(e), shape: { capsule: { a: s.a, b: s.b, r: s.w / 2 } } });
    }
  }
  const tracks = moving.map((e) => ({ route: e.route, net: net(e) }));
  const routes = smooth(tracks, obstacles, { clearance: gap, outline, edge: board.min_board_edge_clearance ?? 0.2 });
  const by = new Map(moving.map((e, k) => [e, routes[k]]));
  const changes = new Map(), out = json.map((e) => {
    const r = by.get(e);
    if (!r || r.length === e.route.length) return e;
    changes.set(e.pcb_trace_id, r);
    return { ...e, route: r };
  });
  return { json: out, routes: changes, changed: changes.size, dropped: [...by].reduce((n, [e, r]) => n + e.route.length - r.length, 0) };
}

// Each pad's, track's and via's net: the ports its source traces join (and their source nets), followed through
// pcb_port, so copper of one net is one id. null for copper on no net
function netsOf(json) {
  const up = new Map(), find = (a) => { while (up.get(a) !== a) { up.set(a, up.get(up.get(a))); a = up.get(a); } return a; };
  const join = (a, b) => { for (const x of [a, b]) if (!up.has(x)) up.set(x, x); up.set(find(a), find(b)); };
  for (const e of json) if (e.type === 'source_trace') {
    const ids = [...(e.connected_source_port_ids || []), ...(e.connected_source_net_ids || [])];
    for (const id of ids) join(ids[0], id);
    join(e.source_trace_id, ids[0] ?? e.source_trace_id);
  }
  const portSource = new Map(json.filter((e) => e.type === 'pcb_port').map((e) => [e.pcb_port_id, e.source_port_id]));
  const traceSource = new Map(json.filter((e) => e.type === 'pcb_trace').map((e) => [e.pcb_trace_id, e.source_trace_id]));
  const of = (id) => (id && up.has(id) ? find(id) : null);
  return (e) => e.type === 'pcb_trace' ? of(e.source_trace_id) : e.type === 'pcb_via' ? of(traceSource.get(e.pcb_trace_id)) : of(portSource.get(e.pcb_port_id));
}

function padShape(e) {
  if (e.shape === 'circle') return { circle: { x: e.x, y: e.y, r: e.radius } };
  if (e.shape === 'polygon') return { polygon: e.points };
  if (e.shape === 'pill' || e.shape === 'rotated_pill') return pill(e.x, e.y, e.width, e.height, e.ccw_rotation ?? 0);
  return rect(e.x, e.y, e.width, e.height, e.shape === 'rotated_rect' ? e.ccw_rotation ?? 0 : 0);
}
function holePadShape(e) {
  if (e.shape === 'circle') return { circle: { x: e.x, y: e.y, r: e.outer_diameter / 2 } };
  const w = e.rect_pad_width ?? e.outer_width ?? e.outer_diameter, h = e.rect_pad_height ?? e.outer_height ?? e.outer_diameter;
  if (e.shape === 'pill' || e.shape === 'oval') return pill(e.x, e.y, w, h, e.ccw_rotation ?? 0);
  return rect(e.x, e.y, w, h, e.ccw_rotation ?? e.rect_ccw_rotation ?? 0);
}
const turn = (x, y, dx, dy, deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return { x: x + dx * c - dy * s, y: y + dx * s + dy * c }; };
const rect = (x, y, w, h, deg) => ({ polygon: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => turn(x, y, (sx * w) / 2, (sy * h) / 2, deg)) });
function pill(x, y, w, h, deg) {
  const r = Math.min(w, h) / 2, along = Math.max(w, h) / 2 - r, wide = w >= h;
  return { capsule: { a: turn(x, y, wide ? -along : 0, wide ? 0 : -along, deg), b: turn(x, y, wide ? along : 0, wide ? 0 : along, deg), r } };
}

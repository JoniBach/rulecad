// Routed tracks, tidied: where an autorouter's track wiggles, doubles back or detours, the bends between two of its points
// are dropped and the two joined straight, wherever that straight run keeps its clearance from all other copper, holes
// and the board's edge. A bend sharper than a right angle is cut across. A track's ends and vias stay exactly where they
// were, so it still starts and finishes on the same pads, and changes layer in the same places. Tracks not passed in are
// never moved; they are only kept clear of.
//
// smoothCircuit(json, { movable, clearance }) works on Circuit JSON (tscircuit's board format) as a whole; smooth()
// is the geometry underneath, for any board description.

/**
 * Tracks pulled tight, round everything in their way.
 * tracks: [{ route: [{ route_type: 'wire', x, y, width, layer } | { route_type: 'via', x, y, ... }], net, leads }]: the
 *   tracks that may change, each route as Circuit JSON has it. net: anything comparable; copper of the same net isn't in
 *   the way. leads: { start, end }, copper a track carries on from at that end (such as a kept stub), as points from its
 *   root to the track's end: cut back where the track turns back on it (see trimLead); each track's trimmed
 *   { start, end } then says what's left of them
 * obstacles: [{ layer, net, shape }] where layer is 'top', 'bottom', ... or '*' (every layer), and shape is
 *   { circle: { x, y, r } }, { capsule: { a, b, r } } (a track or a pill), or { polygon: [{ x, y }, ...] }; each with
 *   clear (mm, its own clearance, overriding the default)
 * outline: the board's edge, a polygon [{ x, y }, ...], with edge (mm): how far copper keeps from it
 * clearance: copper to copper (mm)
 * Returns the routes, in order: each a copy of its track's route with bend points removed, and sharp bends (under 90°)
 * cut across where there's room.
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
    const ok = (a, b, layer, w, was) => clear(a, b, layer, w, t, was);
    // Pulled tight, then any sharp bend left (under 90°: a hook, or a spike out and back) cut across, again until
    // nothing changes: jumping to the farthest point it can reach, a pass can land on a hook's tip, which the next undoes
    let route = t.route;
    // A lead-in it may cut back first (a kept stub its start or end joins), while the track turns back on it
    t.trimmed = {};
    for (const side of ['start', 'end']) {
      const lead = t.leads?.[side];
      if (!lead || lead.length < 3) continue;
      const cut = trimLead(lead.map((p) => ({ ...p })), side === 'start' ? route : [...route].reverse(), ok);
      if (!cut) continue;
      route = side === 'start' ? cut.route : cut.route.reverse();
      t.trimmed[side] = cut.lead;
    }
    for (let pass = 0; pass < 6; pass++) {
      const was = route;
      route = cutSharp(pull(route, ok), ok);
      if (route.length === was.length && route.every((p, i) => p === was[i])) break;
    }
    for (const o of own[k]) grid.remove(o); // its new segments take the old ones' place
    own[k] = segmentsOf(route).map((s) => add({ layer: s.layer, net: t.net, track: t, shape: { capsule: { a: s.a, b: s.b, r: s.w / 2 } } }));
    return route;
  });

  // A straight run from a to b, w wide, on layer, clear of everything not the track's own and not of its net. was: the
  // segments it replaces: it may also come as close to something as they already did, never closer, so a track the
  // router packed in tighter than clearance can still be straightened, and is never left worse
  function clear(a, b, layer, w, track, was = null) {
    const r = w / 2, reach = r + Math.max(clearance, edge) + 1;
    const near = grid.query({ x0: Math.min(a.x, b.x) - reach, y0: Math.min(a.y, b.y) - reach, x1: Math.max(a.x, b.x) + reach, y1: Math.max(a.y, b.y) + reach });
    const before = (shape) => Math.min(...was.map(([p, q]) => distance(p, q, shape)));
    for (const o of near) {
      if (o.track === track || (o.layer !== '*' && o.layer !== layer)) continue;
      if (track.net != null && o.net != null && o.net === track.net) continue;
      const d = distance(a, b, o.shape);
      if (d < r + (o.clear ?? clearance) - 1e-9 && !(was && d >= before(o.shape) - 1e-9)) return false;
    }
    if (outline) {
      if (!inside(outline, a) || !inside(outline, b)) return false;
      for (let i = 0; i < outline.length; i++) {
        const e = [outline[i], outline[(i + 1) % outline.length]], d = segSeg(a, b, ...e);
        if (d < r + edge - 1e-9 && !(was && d >= Math.min(...was.map(([p, q]) => segSeg(p, q, ...e))) - 1e-9)) return false;
      }
    }
    return true;
  }
}

// One track pulled tight: along each run of points on one layer and at one width, from each kept point straight to the
// farthest point after it that it can reach clear (or no closer to anything than the stretch it replaces already came);
// the points skipped are dropped. Vias and layer changes end a run.
function pull(r, isClear) {
  const out = [];
  for (let i = 0; i < r.length;) {
    out.push(r[i]);
    let end = i; // the last point of the run from here
    if (r[i].route_type === 'wire') while (end + 1 < r.length && r[end + 1].route_type === 'wire' && r[end + 1].layer === r[i].layer && r[end + 1].width === r[i].width) end++;
    let next = i + 1;
    for (let k = end; k > i + 1; k--) if (isClear(r[i], r[k], r[i].layer, r[i].width, r.slice(i, k).map((p, m) => [p, r[i + m + 1]]))) { next = k; break; }
    i = next;
  }
  return out;
}

// A bend sharper than a right angle, with a point before and after it on its run, cut across: the cut joins a point on
// each leg, the same distance back from the bend, as far back as the cut keeps its clearance (all the way back to the
// nearer of the two points, which removes a spike out and back). Each of the two new bends is then wider than 90°
function cutSharp(r, isClear) {
  const out = [...r], same = (p, q) => p.route_type === 'wire' && q.route_type === 'wire' && p.layer === q.layer && p.width === q.width;
  for (let i = 1; i + 1 < out.length; i++) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if (!same(a, b) || !same(b, c)) continue;
    const la = Math.hypot(a.x - b.x, a.y - b.y), lc = Math.hypot(c.x - b.x, c.y - b.y);
    if (la < 1e-6 || lc < 1e-6 || ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (la * lc) <= 1e-9) continue; // 90° or wider
    const at = (d) => [{ ...b, x: b.x + ((a.x - b.x) * d) / la, y: b.y + ((a.y - b.y) * d) / la }, { ...b, x: b.x + ((c.x - b.x) * d) / lc, y: b.y + ((c.y - b.y) * d) / lc }];
    const fits = (d) => { const [p, q] = at(d); return isClear(p, q, b.layer, b.width, [[p, b], [b, q]]); }; // no closer to anything than the corner it cuts
    const most = Math.min(la, lc);
    let d = fits(most) ? most : 0;
    if (!d) { let lo = 0, hi = most; for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } d = lo; }
    if (d < 0.01) continue; // no room to cut: the bend stays
    const [p, q] = at(d), ends = [Math.abs(d - la) < 1e-9 ? null : p, Math.abs(d - lc) < 1e-9 ? null : q].filter(Boolean); // a cut reaching a point joins it there
    const pts = ends.map((e) => { const { start_pcb_port_id, end_pcb_port_id, ...rest } = e; return rest; }); // (a new point is no pad's)
    out.splice(i, 1, ...pts);
    if (Math.abs(d - la) < 1e-9 && Math.abs(d - lc) < 1e-9) i--; // the bend's two points now meet: look at the corner they make
  }
  return out;
}

// A lead-in cut back: lead runs from its root to the track's first point (copper the track carries on from, such as a
// kept stub). While the track leaves that point turning back on the lead (sharper than a right angle), the joint moves
// back along the lead, a point at a time, or part of the way along its last segment, as far as the new first segment
// keeps its clearance (or comes no closer to anything than before). The lead's first segment always stays.
// -> { route, lead } (the lead as now, root first), or null if nothing moved
function trimLead(lead, r, isClear) {
  r = [...r];
  let moved = false;
  while (lead.length > 2) {
    const J = r[0], A = lead[lead.length - 2], N = r[1];
    if (!N || J.route_type !== 'wire' || N.route_type !== 'wire' || N.layer !== J.layer || (A.layer && A.layer !== J.layer)) break;
    if ((A.x - J.x) * (N.x - J.x) + (A.y - J.y) * (N.y - J.y) <= 1e-9) break; // 90° or wider: it doesn't turn back
    const at = (t) => ({ x: A.x + (J.x - A.x) * t, y: A.y + (J.y - A.y) * t }); // 0: at A, 1: at the joint
    const fits = (q) => isClear({ ...J, ...q }, N, J.layer, J.width, [[{ ...J, ...q }, J], [J, N]]);
    let q = null, whole = false;
    if (fits(A)) { q = A; whole = true; } else {
      let lo = 0, hi = 1;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (fits(at(mid))) hi = mid; else lo = mid; }
      if ((1 - hi) * Math.hypot(J.x - A.x, J.y - A.y) > 0.01) q = at(hi);
    }
    if (!q) break;
    const { start_pcb_port_id, end_pcb_port_id, ...joint } = { ...J, x: q.x, y: q.y }; // (a stub's end is no pad's)
    r[0] = joint; moved = true;
    if (whole) lead.pop();
    else { lead[lead.length - 1] = { ...lead[lead.length - 1], x: q.x, y: q.y }; break; }
  }
  return moved ? { route: r, lead } : null;
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
 * holes, a via's among them, keep min_trace_to_hole_edge_clearance (0.2) from their edge, and rulecad_keepout (a screw head's room) from
 * their centre; the board's edge keeps min_board_edge_clearance (0.2).
 * leads(trace): the copper a track carries on from at each end ({ start, end }: points from its root to the track's end),
 * which may be cut back where the track turns back on it; trimmed maps a track's pcb_trace_id to what's left of its
 * leads ({ start, end }, the same way round). The caller shortens that copper to match.
 * Returns { json: a copy with the tracks replaced, routes: a Map from each changed track's pcb_trace_id to its new route,
 * trimmed, changed: how many tracks changed, dropped: bend points dropped }.
 * @param {object[]} json @param {{ movable?: (trace: object) => boolean, clearance?: number, leads?: (trace: object) => any }} [o]
 */
export function smoothCircuit(json, { movable = () => true, clearance, leads = () => null } = {}) {
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
    } else if (e.type === 'pcb_via') {
      obstacles.push({ layer: '*', net: net(e), shape: { circle: { x: e.x, y: e.y, r: e.outer_diameter / 2 } } });
      obstacles.push({ layer: '*', net: net(e), clear: holeGap, shape: { circle: { x: e.x, y: e.y, r: e.hole_diameter / 2 } } }); // (its hole too: a fab measures from it)
    }
    else if (e.type === 'pcb_hole') {
      const r = (e.hole_diameter ?? Math.max(e.hole_width ?? 0, e.hole_height ?? 0)) / 2;
      obstacles.push({ layer: '*', net: null, clear: holeGap, shape: { circle: { x: e.x, y: e.y, r } } });
      if (e.rulecad_keepout) obstacles.push({ layer: '*', net: null, clear: 0, shape: { circle: { x: e.x, y: e.y, r: e.rulecad_keepout } } });
    } else if (e.type === 'pcb_trace' && !still.has(e)) {
      for (const s of segmentsOf(e.route)) obstacles.push({ layer: s.layer, net: net(e), shape: { capsule: { a: s.a, b: s.b, r: s.w / 2 } } });
    }
  }
  const tracks = moving.map((e) => ({ route: e.route, net: net(e), leads: leads(e) }));
  const routes = smooth(tracks, obstacles, { clearance: gap, outline, edge: board.min_board_edge_clearance ?? 0.2 });
  const by = new Map(moving.map((e, k) => [e, routes[k]]));
  const changes = new Map(), out = json.map((e) => {
    const r = by.get(e);
    if (!r || (r.length === e.route.length && r.every((p, i) => p === e.route[i]))) return e;
    changes.set(e.pcb_trace_id, r);
    return { ...e, route: r };
  });
  const trimmed = new Map(moving.map((e, k) => [e.pcb_trace_id, tracks[k].trimmed]).filter(([, t]) => t && (t.start || t.end)));
  return { json: out, routes: changes, trimmed, changed: changes.size, dropped: [...by].reduce((n, [e, r]) => n + e.route.length - r.length, 0) };
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

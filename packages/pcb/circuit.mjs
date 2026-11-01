// Circuit JSON, the open data format tscircuit's tools read (github.com/tscircuit/circuit-json), built directly from a
// plain description of a board, with no React. The fab exporters, the design checks, the drawings and KiCad export all
// read the result. Only two tscircuit libraries are used, and neither needs a framework: footprinter (standard
// footprints such as SOD-123) and the capacity autorouter (connections a board leaves to it).
//
// board: { center: { x, y }, width, height, thickness, parts, traces, nets, track, silk, holes, autoroute }, or
//   { outline: [{ x, y }, ...], thickness, ... }: any shape, a closed polygon (counter-clockwise); its centre and size
//   are its bounds. pcb.shape makes common ones (rounded, bevelled, circle).
//   part   { name, ftype: 'simple_switch' | 'simple_chip' | 'simple_diode', mpn, lcsc, value, x, y, layer: 'top' | 'bottom',
//            bom: false (not bought: edge pads, test points), place: false (not placed by the assembler),
//            rotation: 0 | 90 | 180 | 270 (counter-clockwise, seen from the side the part is on; default 0),
//            pads: [{ pin, x, y, hole, outer }] (plated, relative to the part) or [{ pin, smd: true, hint, x, y, w, h }]
//            (circle: true for a round one, corner: its corners' radius)
//            or [{ pin, smd: true, x, y, points: [[x, y], ...] }] (copper of any shape; x, y: where tracks join it),
//            holes: [{ x, y, d }], courtyard: { w, h } | null,
//            footprint: 'sod123' | 'jst4_sh' | 'pinrow4' ... (a footprinter string, SMD or through-hole, instead of pads),
//            sch: { x, y, symbol?, pinLabels? } }
//   trace  { from: [part, port], to: [part, port], width, path: [{ x, y }] (absolute, between the two ports), layer }; a trace
//            without a path is left to the autorouter when board.autoroute is set
//   nets   { GND: ['U1.GND', 'J1.1', 'J2.1'] } or { GND: { pins: [...], width } }: each net's pins are joined by the
//            shortest set of connections between them (a minimum spanning tree), left to the autorouter, at the net's
//            width or board.track; pins are named part.pin, by the pin's label, its name or its number
//   silk   { rect: { x, y, w, h }, layer } | { text, x, y, size, layer, rotation } (rotation: degrees, counter-clockwise)
//   holes  [{ x, y, d }] in the board (mounting holes)
//   layers 2 (default), 4 or 6 copper layers: tracks on the outer two, planes inside
//   clearance (mm) the router keeps from everything in its way (a clone: the source's); unset, the router's own
//   neck (mm) a routed track still too close to another after repair is narrowed to this where they pass (the fab's smallest)
//   planes { GND: { layer: 'inner1', pins: ['U1.GND', ...] } }: nets joined by copper filling an inner layer. Each SMD pad
//            gets a via beside it before routing, or a track to one nearby; a pad with no room for
//            either is routed to the nearest pad of its net that reaches the plane. via_pad, via_hole, plane_clearance
//            (mm, defaults 0.6, 0.3, 0.2) size them
//   copper { tracks: [{ a, b, width, layer, island }], vias: [{ x, y, pad, hole, island }], islands: [{ id, net, pins, via }] }:
//            a source's own routing, kept (moveGroup's keep): laid as it is; its pins count as joined
//   pads may be castellated ({ castellated: true }: a half hole on the edge, joined at its inner edge) or a rounded
//            rectangle round their hole ({ rect: { w, h, offset: [x, y] } }: an oval pad, a hole off-centre)
// All positions are in mm, in the board's own frame. A part on the bottom is seen from above: mirrored in x.
import { fp } from '@tscircuit/footprinter';
import { symbols } from 'schematic-symbols';

const SUB = 'subcircuit_source_group_0';
const PASTE = 0.7;
// Quarter turns, counter-clockwise, as exact cosines and sines (no rounding error in pad positions)
const QUARTER = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };
function quarter(r = 0) {
  const t = QUARTER[((r % 360) + 360) % 360];
  if (!t) throw new Error(`a part's rotation is ${r}°: boards take 0, 90, 180 or 270`);
  return t;
} // solder paste, as a share of an SMD pad (what tscircuit uses)
// The board's manufacturing minimums (mm): tscircuit's defaults, within what common fabs make. The router keeps to them.
const FAB_MINIMUMS = { min_trace_width: 0.1, min_via_hole_diameter: 0.2, min_via_pad_diameter: 0.3, min_via_hole_edge_to_via_hole_edge_clearance: 0.1,
  min_trace_to_hole_edge_clearance: 0.2, min_trace_to_pad_edge_clearance: 0.1, min_pad_edge_to_pad_edge_clearance: 0.1,
  min_plated_hole_drill_edge_to_drill_edge_clearance: 0.15, min_board_edge_clearance: 0.2 };

// A board with an outline: its centre and size from the outline's bounds (an explicit centre, width or height wins)
export function bounds(points) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, width: x1 - x0, height: y1 - y0 };
}

// Is the point inside the polygon ([{ x, y }])? (even-odd rule)
function insidePolygon(points, { x, y }) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// A polygon as horizontal strips step tall (each the span of the polygon across its middle): boxes a router can use
function strips(points, step) {
  const ys = points.map((q) => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys), out = [];
  for (let y = y0; y < y1; y += step) {
    const mid = Math.min(y + step / 2, y1), xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > mid) !== (b.y > mid)) xs.push(a.x + ((mid - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) out.push({ x: (xs[k] + xs[k + 1]) / 2, y: y + Math.min(step, y1 - y) / 2, w: xs[k + 1] - xs[k], h: Math.min(step, y1 - y) });
  }
  return out;
}

// An SMD pad's box: a rectangle's own, a polygon's bounds
export function smtBounds(e) {
  if (e.shape === 'circle') return { x: e.x, y: e.y, w: e.radius * 2, h: e.radius * 2 };
  if (e.shape !== 'polygon') return { x: e.x, y: e.y, w: e.width, h: e.height };
  const xs = e.points.map((q) => q.x), ys = e.points.map((q) => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

export async function circuitJson(board, { route = defaultRouter } = {}) {
  board = { parts: [], traces: [], silk: [], ...board }; // the lists are optional
  if (board.outline) {
    if (board.outline.length < 3) throw new Error('a board outline needs at least 3 points');
    board = { ...bounds(board.outline), ...board };
  }
  const out = [], next = {}, id = (type) => `${type}_${(next[type] = (next[type] ?? -1) + 1)}`;
  const add = (type, fields) => { const e = { type, [`${type}_id`]: id(type), ...fields }; out.push(e); return e; };

  add('source_project_metadata', { software_used_string: '@rulecad/pcb' });
  add('source_group', { is_subcircuit: true, was_automatically_named: true, subcircuit_id: SUB });
  const sourceBoard = add('source_board', { source_group_id: 'source_group_0' });

  // ---- parts: source records, then their footprints on the board ----
  const copper = copperLayers(board.layers ?? 2); // a hole or a via goes through all of them
  const ports = new Map(); // `${part}.${port name or hint}` -> { source, pcb, x, y, layers }
  const placed = [];
  for (const part of board.parts) {
    const comp = add('source_component', { ftype: part.ftype, name: part.name, manufacturer_part_number: part.mpn,
      ...(part.lcsc ? { supplier_part_numbers: { jlcpcb: [part.lcsc] } } : {}), ...(part.value ? { display_value: part.value } : {}), ...(part.bom === false ? { exclude_from_bom: true } : {}),
      are_pins_interchangeable: part.ftype === 'simple_switch', source_group_id: 'source_group_0', subcircuit_id: SUB });
    const fpEls = part.footprint ? fp.string(part.footprint).circuitJson() : [];
    const mirror = part.layer === 'bottom' ? -1 : 1;
    const [cos, sin] = quarter(part.rotation), swap = sin !== 0;
    const at = (x, y) => ({ x: part.x + mirror * (cos * x - sin * y), y: part.y + (sin * x + cos * y) });
    const size = (w, h) => (swap ? { w: h, h: w } : { w, h }); // a rectangle turned a quarter swaps its sides
    // Pads: from the description, or a footprint's SMD pads and plated holes (pin n: hints ['n'])
    const pads = part.footprint
      ? fpEls.filter((e) => e.type === 'pcb_smtpad' || e.type === 'pcb_plated_hole').map((e) => e.type === 'pcb_smtpad'
        ? { smd: true, pin: `pin${e.port_hints[0]}`, hint: e.port_hints[0], ...at(e.x, e.y), ...size(e.width, e.height) }
        : { pin: `pin${e.port_hints[0]}`, hint: e.port_hints[0], ...at(e.x, e.y), hole: e.hole_diameter ?? Math.min(e.hole_width, e.hole_height),
          outer: e.outer_diameter ?? Math.max(e.rect_pad_width ?? e.outer_width ?? 0, e.rect_pad_height ?? e.outer_height ?? 0) })
      : part.pads.map((p) => {
        if (!p.points) return { ...p, ...at(p.x, p.y), ...(p.smd ? size(p.w, p.h) : {}) };
        const poly = p.points.map(([x, y]) => at(x, y)), xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
        return { ...p, ...at(p.x, p.y), poly, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
      });
    const names = portNames(part, pads);
    const sourcePorts = pads.map((p, i) => add('source_port', { name: names[i].name, pin_number: names[i].n, port_hints: names[i].hints,
      source_component_id: comp.source_component_id, subcircuit_id: SUB }));
    if (part.ftype === 'simple_chip') { // pins with the same label are joined inside the part (a Pico's GND pins)
      const byName = new Map(); for (const sp of sourcePorts) byName.set(sp.name, [...(byName.get(sp.name) || []), sp]); // (Object.groupBy needs Node 21)
      const groups = [...byName.values()].filter((g) => g.length > 1);
      if (groups.length) comp.internally_connected_source_port_ids = groups.map((g) => g.map((s) => s.source_port_id));
      for (const g of groups) add('source_component_internal_connection', { source_component_id: comp.source_component_id, subcircuit_id: SUB, source_port_ids: g.map((s) => s.source_port_id) });
    }
    placed.push({ part, comp, pads, sourcePorts, fpEls, at, mirror, size });
    if (part.model) { const { path, ...m } = part.model; // its 3D model: drawn by partModels, where the part is
      add('cad_component', { source_component_id: comp.source_component_id, position: { x: part.x, y: part.y, z: 0 }, rotation: { x: 0, y: 0, z: part.rotation ?? 0 }, layer: part.layer,
        subcircuit_id: SUB, rulecad_model: { ...m, source: path, x: part.x, y: part.y, rotation: part.rotation ?? 0, layer: part.layer } }); }
  }
  add('pcb_board', { source_board_id: sourceBoard.source_board_id, subcircuit_id: SUB, center: board.center, thickness: board.thickness, num_layers: copper.length,
    width: board.width, height: board.height, ...(board.outline ? { outline: board.outline.map(({ x, y }) => ({ x, y })) } : {}), material: 'fr4', ...FAB_MINIMUMS });

  for (const { part, comp, pads, sourcePorts, fpEls, at, mirror, size } of placed) {
    // The component sits at the middle of its pads and holes (as tscircuit places it: pick-and-place reads this)
    const extent = [...pads.map((p) => (p.poly ? [p.cx - p.w / 2, p.cy - p.h / 2, p.cx + p.w / 2, p.cy + p.h / 2] : p.smd ? [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2] : [p.x - p.outer / 2, p.y - p.outer / 2, p.x + p.outer / 2, p.y + p.outer / 2])),
      ...(part.holes || []).map((h) => { const q = at(h.x, h.y); return [q.x - h.d / 2, q.y - h.d / 2, q.x + h.d / 2, q.y + h.d / 2]; })];
    const box = [Math.min(...extent.map((e) => e[0])), Math.min(...extent.map((e) => e[1])), Math.max(...extent.map((e) => e[2])), Math.max(...extent.map((e) => e[3]))];
    const pc = add('pcb_component', { center: { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 }, width: box[2] - box[0], height: box[3] - box[1],
      layer: part.layer, rotation: part.rotation ?? 0, source_component_id: comp.source_component_id, subcircuit_id: SUB, ...(part.place === false ? { do_not_place: true } : {}) });
    const own = { pcb_component_id: pc.pcb_component_id, subcircuit_id: SUB };
    pads.forEach((p, i) => {
      const layers = p.smd ? [part.layer] : copper;
      const port = add('pcb_port', { pcb_component_id: pc.pcb_component_id, layers, subcircuit_id: SUB, x: p.x, y: p.y, source_port_id: sourcePorts[i].source_port_id });
      if (p.poly) { // copper of any shape: no paste (a contact, not a joint)
        add('pcb_smtpad', { ...own, pcb_port_id: port.pcb_port_id, layer: part.layer, shape: 'polygon', points: p.poly, port_hints: [p.hint ?? p.pin.replace(/^pin/, '')], is_covered_with_solder_mask: false });
      } else if (p.smd) {
        const pad = add('pcb_smtpad', { ...own, pcb_port_id: port.pcb_port_id, layer: part.layer, port_hints: [p.hint], is_covered_with_solder_mask: false, x: p.x, y: p.y,
          ...(p.circle ? { shape: 'circle', radius: p.w / 2 } : { shape: 'rect', width: p.w, height: p.h, ...(p.corner ? { corner_radius: p.corner } : {}) }) });
        add('pcb_solder_paste', { layer: part.layer, shape: 'rect', width: p.w * PASTE, height: p.h * PASTE, x: p.x, y: p.y, pcb_component_id: pc.pcb_component_id, pcb_smtpad_id: pad.pcb_smtpad_id, subcircuit_id: SUB });
      } else if (p.rect) { // an oval pad or a hole off-centre: a rounded rectangle, its hole offset turned with the part
        const sz = size(p.rect.w, p.rect.h), o0 = at(0, 0), o1 = at(p.rect.offset[0], p.rect.offset[1]);
        add('pcb_plated_hole', { ...own, pcb_port_id: port.pcb_port_id, shape: 'circular_hole_with_rect_pad', hole_shape: 'circle', pad_shape: 'rect', hole_diameter: p.hole,
          rect_pad_width: sz.w, rect_pad_height: sz.h, rect_border_radius: Math.min(sz.w, sz.h) / 2, hole_offset_x: Math.round((o1.x - o0.x) * 1e6) / 1e6, hole_offset_y: Math.round((o1.y - o0.y) * 1e6) / 1e6,
          port_hints: [`unnamed_platedhole${i + 1}`, p.pin], x: p.x, y: p.y, layers, is_covered_with_solder_mask: false });
      } else {
        add('pcb_plated_hole', { ...own, pcb_port_id: port.pcb_port_id, outer_diameter: p.outer, hole_diameter: p.hole, shape: 'circle',
          port_hints: [`unnamed_platedhole${i + 1}`, p.pin, ...(p.castellated ? ['castellated'] : [])], x: p.x, y: p.y, layers, is_covered_with_solder_mask: false });
      }
      Object.assign(sourcePorts[i], { _pcb: port });
      // A castellated pad's centre is on the board's edge: tracks join it at its inner side, mid-way across its copper
      // ring (on the ring's very edge, the router may not count the join as in the pad)
      const join = p.castellated ? inward(board, p.x, p.y, (p.outer + (p.hole ?? p.outer)) / 4) : { x: p.x, y: p.y };
      if (p.castellated) Object.assign(port, join);
      for (const key of [sourcePorts[i].name, ...sourcePorts[i].port_hints]) ports.set(`${part.name}.${key}`, { source: sourcePorts[i], pcb: port, x: join.x, y: join.y, layers });
    });
    for (const h of part.holes || []) { const q = at(h.x, h.y); add('pcb_hole', { ...own, hole_shape: 'circle', hole_diameter: h.d, x: q.x, y: q.y, is_covered_with_solder_mask: false }); }
    if (part.courtyard) { const c = size(part.courtyard.w, part.courtyard.h); add('pcb_courtyard_rect', { ...own, layer: part.layer, center: { x: part.x, y: part.y }, width: c.w, height: c.h }); }
    // A footprint's own marks, mirrored with it on the bottom: fab notes, the reference, the courtyard
    for (const e of fpEls) {
      if (e.type === 'pcb_fabrication_note_path') add(e.type, { ...own, layer: part.layer, route: e.route.map((q) => at(q.x, q.y)), stroke_width: e.stroke_width });
      if (e.type === 'pcb_fabrication_note_text' || e.type === 'pcb_silkscreen_text') add(e.type, { anchor_alignment: 'center', anchor_position: at(e.anchor_position.x, e.anchor_position.y),
        font: e.font, font_size: e.type === 'pcb_silkscreen_text' ? 0.5 : e.font_size, layer: part.layer, ...(e.type === 'pcb_silkscreen_text' ? { text: e.text.replace('{REF}', part.name), ccw_rotation: 0 } : { ccw_rotation: mirror < 0 ? 180 : 0, text: e.text }), ...own });
      if (e.type === 'pcb_courtyard_rect') { const c = size(e.width, e.height); add(e.type, { ...own, layer: part.layer, center: at(e.center.x, e.center.y), width: c.w, height: c.h }); }
    }
  }

  // ---- planes: each plane net's pads reach its inner layer, through their own holes or a via each ----
  if (board.planes && copper.length < 4) throw new Error('planes need a board of 4 layers or more (board.layers): the outer two carry the tracks');
  const netOf = new Map(); // `${part}.${pin}` -> net, for the pours
  for (const [net, spec] of Object.entries(board.nets || {})) for (const pin of Array.isArray(spec) ? spec : spec.pins) netOf.set(pin, net);
  for (const [net, spec] of Object.entries(board.planes || {})) for (const pin of spec.pins) netOf.set(pin, net);
  const { nets: planeNets = null, links = [] } = board.planes ? planeVias(out, add, board, copper) : {};
  if (board.copper) keptCopper(out, add, board, copper, planeNets || {});

  // ---- traces: drawn by rule, or left to the autorouter ----
  const port = (part, name) => { const p = ports.get(`${part}.${name}`); if (!p) throw new Error(`no port ${part}.${name}`); return p; };
  const joined = new Map(); // `${part}.${pin}` -> its group: kept islands sharing a pin (meeting at a pad) are one group
  const up = new Map(), root = (g) => { while (up.get(g) !== g) g = up.get(g); return g; };
  for (const k of board.copper?.islands || []) {
    up.set(k.id, k.id);
    for (const p of k.pins) { if (joined.has(p)) up.set(root(joined.get(p)), k.id); joined.set(p, k.id); }
  }
  for (const [p, g] of joined) joined.set(p, root(g));
  const stubOf = new Map((board.copper?.stubs || []).map((b) => [b.pin, b]));
  const layStub = (stub, id) => {
    for (const g of board.copper.tracks.filter((x) => x.stub === stub.id))
      add('pcb_trace', { route: [{ route_type: 'wire', x: g.a.x, y: g.a.y, width: g.width, layer: g.layer }, { route_type: 'wire', x: g.b.x, y: g.b.y, width: g.width, layer: g.layer }], source_trace_id: id, subcircuit_id: SUB });
    for (const v of board.copper.vias.filter((x) => x.stub === stub.id)) {
      const tr = add('pcb_trace', { route: [{ route_type: 'wire', x: v.x, y: v.y, width: Math.min(v.pad, 0.2), layer: 'top' }, { route_type: 'via', x: v.x, y: v.y, from_layer: 'top', to_layer: 'bottom' }], source_trace_id: id, subcircuit_id: SUB });
      add('pcb_via', { pcb_trace_id: tr.pcb_trace_id, x: v.x, y: v.y, hole_diameter: v.hole, outer_diameter: v.pad, layers: copper, from_layer: 'top', to_layer: 'bottom', subcircuit_id: SUB });
    }
  };
  const toRoute = [], traces = [...(board.traces || []), ...netTraces(board, port, joined), ...links];
  for (const t of traces) {
    const a = port(...t.from), b = port(...t.to);
    const st = add('source_trace', { connected_source_port_ids: [a.source.source_port_id, b.source.source_port_id], connected_source_net_ids: [], subcircuit_id: SUB,
      display_name: `.${t.from.join(' > .')} to .${t.to.join(' > .')}`, min_trace_thickness: t.width });
    if (!t.path) { // a kept escape (stub) from either pin: laid as part of this connection, which is routed from its end
      const ends = [a, b].map((q, i) => { const stub = stubOf.get([t.from, t.to][i].join('.')); if (!stub) return q; stubOf.delete([t.from, t.to][i].join('.'));
        layStub(stub, st.source_trace_id); return { ...q, x: stub.end.x, y: stub.end.y, layers: [stub.end.layer] }; });
      toRoute.push({ t, a: ends[0], b: ends[1], id: st.source_trace_id }); continue;
    }
    // A drawn track runs on the layer its first pad is on (a through-hole pad: the front)
    const layer = t.layer ?? (a.layers.length === 1 ? a.layers[0] : 'top'); // or the layer it names
    const pts = [{ x: a.x, y: a.y }, ...t.path, { x: b.x, y: b.y }];
    add('pcb_trace', { route: pts.map((q, i) => ({ route_type: 'wire', x: q.x, y: q.y, width: t.width, layer,
      ...(i === 0 ? { start_pcb_port_id: a.pcb.pcb_port_id } : {}), ...(i === pts.length - 1 ? { end_pcb_port_id: b.pcb.pcb_port_id } : {}) })), source_trace_id: st.source_trace_id, subcircuit_id: SUB });
  }

  // ---- silkscreen and mounting holes ----
  for (const s of board.silk) {
    if (s.rect) add('pcb_silkscreen_rect', { pcb_component_id: null, layer: s.layer, center: { x: s.rect.x, y: s.rect.y }, width: s.rect.w, height: s.rect.h, subcircuit_id: SUB, stroke_width: 0.1, is_filled: false });
    else add('pcb_silkscreen_text', { anchor_alignment: 'center', anchor_position: { x: s.x, y: s.y }, font: 'tscircuit2024', font_size: s.size, layer: s.layer, text: s.text, ccw_rotation: s.rotation ?? 0, pcb_component_id: null, subcircuit_id: SUB });
  }
  for (const h of board.holes || []) add('pcb_hole', { hole_shape: 'circle', hole_diameter: h.d, x: h.x, y: h.y, is_covered_with_solder_mask: false, subcircuit_id: SUB });

  // ---- the autorouter: what the rules don't draw ----
  if (toRoute.length) {
    if (!board.autoroute) throw new Error(`${toRoute.length} connections have no track and the board isn't autorouted`);
    const routed = await route(out, toRoute, board);
    for (const r of routed.traces) {
      const t = add('pcb_trace', { route: r.route, source_trace_id: r.source_trace_id, subcircuit_id: SUB });
      for (const v of r.vias) add('pcb_via', { pcb_trace_id: t.pcb_trace_id, ...v, layers: copper, subcircuit_id: SUB }); // whose via it is: the checks need it
    }
  }
  if (planeNets) await pours(out, add, board, planeNets, netOf);
  if (board.silk?.length) clearSilkAfter(out);

  schematic(out, add, placed, { ...board, traces }, port, netOf);
  return out;
}

// A point on (or near) the board's edge moved in by d, straight in from the nearest side of its bounds
function inward(board, x, y, d) {
  const l = board.center.x - board.width / 2, r = board.center.x + board.width / 2, b = board.center.y - board.height / 2, t = board.center.y + board.height / 2;
  const sides = [[x - l, 1, 0], [r - x, -1, 0], [y - b, 0, 1], [t - y, 0, -1]].sort((p, q) => p[0] - q[0]);
  return { x: x + sides[0][1] * d, y: y + sides[0][2] * d };
}

// A plated hole's copper: its width and height (a round pad, or a rounded rectangle)
export const holeSize = (e) => (e.outer_diameter != null ? { w: e.outer_diameter, h: e.outer_diameter } : { w: e.rect_pad_width ?? e.outer_width, h: e.rect_pad_height ?? e.outer_height });

// The source's copper kept with a block of parts (moveGroup's keep): its tracks and vias as they were, each island a
// source trace joining its pins (and its plane, if its via reaches one), so nothing routes them again
function keptCopper(out, add, board, copper, planeNets) {
  const pins = padsByPin(out);
  for (const k of board.copper.islands) { // (stubs are laid with the connection they start: see the traces below)
    const ports = [...new Set(k.pins.flatMap((p) => (pins.get(p) || []).map((f) => f.sp.source_port_id)))];
    const plane = k.via && planeNets[k.net];
    if (!ports.length || (ports.length < 2 && !plane)) continue; // nothing left to join
    const st = add('source_trace', { connected_source_port_ids: ports, connected_source_net_ids: plane ? [plane.id] : [], subcircuit_id: SUB, display_name: `${k.pins.join(', ')}: the source's own copper` });
    for (const g of board.copper.tracks.filter((t) => t.island === k.id))
      add('pcb_trace', { route: [{ route_type: 'wire', x: g.a.x, y: g.a.y, width: g.width, layer: g.layer }, { route_type: 'wire', x: g.b.x, y: g.b.y, width: g.width, layer: g.layer }], source_trace_id: st.source_trace_id, subcircuit_id: SUB });
    for (const v of board.copper.vias.filter((x) => x.island === k.id)) {
      const t = add('pcb_trace', { route: [{ route_type: 'wire', x: v.x, y: v.y, width: Math.min(v.pad, 0.2), layer: 'top' }, { route_type: 'via', x: v.x, y: v.y, from_layer: 'top', to_layer: 'bottom' }], source_trace_id: st.source_trace_id, subcircuit_id: SUB });
      add('pcb_via', { pcb_trace_id: t.pcb_trace_id, x: v.x, y: v.y, hole_diameter: v.hole, outer_diameter: v.pad, layers: copper, from_layer: 'top', to_layer: 'bottom', subcircuit_id: SUB });
    }
  }
}

/**
 * Labels slid clear of copper boxes ({ x, y, w, h }) and of each other: each across its reading direction, a step at a
 * time up to reach, to the nearest clear place; one with nowhere clear stays, marked clash: true.
 * @param {object[]} silk { text, x, y, size, rotation } @param {object[]} copper @param {object} o
 */
export function slideClear(silk, copper, { reach = 1.5, step = 0.1, gap = 0.15, char = 0.75 } = {}) {
  const turned = (s) => (((s.rotation ?? 0) % 180) + 180) % 180 === 90;
  const box = (s, dx = 0, dy = 0) => { const long = s.text.length * s.size * char; return { x: s.x + dx, y: s.y + dy, w: turned(s) ? s.size : long, h: turned(s) ? long : s.size }; };
  const hits = (a, b, g) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + g && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + g;
  const placed = [], n = Math.round(reach / step);
  return silk.map((s) => {
    if (!s.text) return s;
    for (let i = 0; i <= 2 * n; i++) {
      const d = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step, b = box(s, turned(s) ? d : 0, turned(s) ? 0 : d);
      if (copper.some((c) => hits(b, c, gap)) || placed.some((o) => hits(b, o, gap))) continue;
      placed.push(b);
      return { ...s, x: Math.round(b.x * 1e4) / 1e4, y: Math.round(b.y * 1e4) / 1e4 };
    }
    placed.push(box(s));
    return { ...s, clash: true };
  });
}

// After routing: silkscreen text the router's vias (or any copper) landed on slides clear, as clearLabels does before
function clearSilkAfter(out) {
  const copper = [...out.filter((e) => e.type === 'pcb_via').map((e) => ({ x: e.x, y: e.y, w: e.outer_diameter, h: e.outer_diameter })),
    ...out.filter((e) => e.type === 'pcb_smtpad').map((e) => smtBounds(e)),
    ...out.filter((e) => e.type === 'pcb_plated_hole').map((e) => ({ x: e.x, y: e.y, ...holeSize(e) }))];
  const texts = out.filter((e) => e.type === 'pcb_silkscreen_text' && !e.pcb_component_id);
  const moved = slideClear(texts.map((e) => ({ text: e.text, x: e.anchor_position.x, y: e.anchor_position.y, size: e.font_size, rotation: e.ccw_rotation })), copper);
  texts.forEach((e, i) => { e.anchor_position = { x: moved[i].x, y: moved[i].y }; });
}

// Copper layers, top to bottom: 2, 4 or 6
function copperLayers(n) {
  if (![2, 4, 6].includes(n)) throw new Error(`a board has 2, 4 or 6 copper layers, not ${n}`);
  return ['top', ...Array.from({ length: n - 2 }, (_, i) => `inner${i + 1}`), 'bottom'];
}

// Every pad of a pin: `${part}.${pin}` -> [pcb pad elements] (pads named alike each have a port)
function padsByPin(out) {
  const comp = new Map(out.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e.name]));
  const src = new Map(out.filter((e) => e.type === 'source_port').map((e) => [e.source_port_id, e]));
  const port = new Map(out.filter((e) => e.type === 'pcb_port').map((e) => [e.pcb_port_id, src.get(e.source_port_id)]));
  const map = new Map();
  for (const e of out.filter((x) => (x.type === 'pcb_smtpad' || x.type === 'pcb_plated_hole') && x.pcb_port_id)) {
    const sp = port.get(e.pcb_port_id);
    for (const key of new Set([sp.name, ...(sp.port_hints || [])])) { const k = `${comp.get(sp.source_component_id)}.${key}`; map.set(k, [...(map.get(k) || []), { e, sp }]); }
  }
  return map;
}

// Plane vias. Each pad of a plane net gets to the plane: a plated hole goes through it already (and so does an SMD pad
// with one of its pin's plated holes in it: a chip's centre pad with its thermal vias); an SMD pad gets a via beside it
// and a short track (the nearest clear spot, outward from its part first); failing that, a track to a via of its net nearby; failing that, a link for the router to
// the nearest pad of its net that reaches the plane. Returns { nets: { net: { layer, id } }, links }.
function planeVias(out, add, board, copper) {
  const b = out.find((e) => e.type === 'pcb_board'), clear = board.plane_clearance ?? 0.2, via = { hole: board.via_hole ?? 0.3, pad: board.via_pad ?? 0.6 };
  const width = board.plane_track ?? board.track ?? 0.25, pins = padsByPin(out), nets = {}, stuck = [];
  const rects = out.filter((e) => e.type === 'pcb_smtpad').map((e) => ({ id: e.pcb_smtpad_id, layer: e.layer, ...smtBounds(e) }));
  const circles = [...out.filter((e) => e.type === 'pcb_plated_hole').map((e) => ({ id: e.pcb_plated_hole_id, x: e.x, y: e.y, r: Math.max(holeSize(e).w, holeSize(e).h) / 2 })),
    ...out.filter((e) => e.type === 'pcb_hole').map((e) => ({ id: e.pcb_hole_id, x: e.x, y: e.y, r: e.hole_diameter / 2 }))];
  const segs = [], sameNet = Object.fromEntries(Object.keys(board.planes).map((n) => [n, []])); // plane tracks drawn so far; each net's vias
  const kept = board.copper || { tracks: [], vias: [], islands: [] }; // the source's copper, kept: in the way, and some pads already reach their plane by it
  for (const g of kept.tracks) if (g.layer === 'top' || g.layer === 'bottom') segs.push({ a: g.a, b: g.b, layer: g.layer, w: g.width });
  for (const v of kept.vias) circles.push({ id: `kept${circles.length}`, x: v.x, y: v.y, r: v.pad / 2 });
  const reachedBy = new Set(kept.islands.filter((k) => k.via && board.planes[k.net]).flatMap((k) => k.pins));
  const toRect = (x, y, q) => Math.hypot(Math.max(Math.abs(x - q.x) - q.w / 2, 0), Math.max(Math.abs(y - q.y) - q.h / 2, 0));
  const toSeg = (x, y, a, c) => { const dx = c.x - a.x, dy = c.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l)) : 0; return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
  const edge = (x, y) => { // how far inside the board
    if (!b.outline) return Math.min(x - (b.center.x - b.width / 2), b.center.x + b.width / 2 - x, y - (b.center.y - b.height / 2), b.center.y + b.height / 2 - y);
    let d = Infinity; for (let i = 0; i < b.outline.length; i++) d = Math.min(d, toSeg(x, y, b.outline[i], b.outline[(i + 1) % b.outline.length]));
    return insidePolygon(b.outline, { x, y }) ? d : -d;
  };
  const viaFree = (x, y, own) => edge(x, y) >= via.pad / 2 + (b.min_board_edge_clearance ?? 0.2)
    && rects.every((q) => toRect(x, y, q) >= via.pad / 2 + (q.id === own ? 0.1 : clear))
    && circles.every((c) => Math.hypot(x - c.x, y - c.y) >= c.r + via.pad / 2 + clear)
    && segs.every((g) => toSeg(x, y, g.a, g.b) >= via.pad / 2 + (g.w ?? width) / 2 + clear);
  const trackFree = (a, c, layer, own) => {
    const n = Math.max(2, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / 0.05));
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((c.x - a.x) * i) / n, y = a.y + ((c.y - a.y) * i) / n;
      if (rects.some((q) => q.id !== own && q.layer === layer && toRect(x, y, q) < width / 2 + clear)) return false;
      if (circles.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + width / 2 + clear)) return false;
      if (segs.some((g) => g.layer === layer && toSeg(x, y, g.a, g.b) < width / 2 + (g.w ?? width) / 2 + clear)) return false;
    }
    return true;
  };
  const comps = new Map(out.filter((e) => e.type === 'pcb_component').map((e) => [e.pcb_component_id, e.center]));
  for (const [name, spec] of Object.entries(board.planes)) {
    if (!copper.includes(spec.layer) || /^(top|bottom)$/.test(spec.layer)) throw new Error(`plane ${name}: "${spec.layer}" isn't an inner layer of this board (${copper.slice(1, -1).join(', ')})`);
    const net = add('source_net', { name, member_source_group_ids: [], is_ground: /gnd|ground/i.test(name), is_power: /^\+|vcc|vdd|3v3|5v/i.test(name), subcircuit_id: SUB });
    nets[name] = { layer: spec.layer, id: net.source_net_id };
    for (const pin of spec.pins) {
      if (reachedBy.has(pin)) continue; // the source's own via, kept, takes it to the plane (keptCopper records it)
      const found = pins.get(pin);
      if (!found) throw new Error(`plane ${name}: no pin ${pin}`);
      for (const { e, sp } of found) {
        const st = add('source_trace', { connected_source_port_ids: [sp.source_port_id], connected_source_net_ids: [net.source_net_id], subcircuit_id: SUB, display_name: `${pin} to ${name}` });
        if (e.type === 'pcb_plated_hole') continue; // its barrel reaches every layer
        const sb = smtBounds(e); // a pad with a plated hole of its own pin in it (a chip's centre pad with its thermal vias) has one too
        if (found.some((f) => f.e.type === 'pcb_plated_hole' && Math.abs(f.e.x - sb.x) <= sb.w / 2 && Math.abs(f.e.y - sb.y) <= sb.h / 2)) continue;
        const pad = { x: e.x ?? smtBounds(e).x, y: e.y ?? smtBounds(e).y, ...smtBounds(e) }, start = { route_type: 'wire', x: pad.x, y: pad.y, width, layer: e.layer, start_pcb_port_id: e.pcb_port_id };
        const viaAt = (x, y) => ({ route_type: 'via', x, y, from_layer: e.layer, to_layer: e.layer === 'top' ? 'bottom' : 'top' });
        const places = [];
        {
          const c = comps.get(e.pcb_component_id) || pad, out0 = Math.atan2(pad.y - c.y, pad.x - c.x) || 0;
          const tries = [];
          for (const gap of [0.1, 0.25, 0.45, 0.7, 1, 1.4]) for (let k = 0; k < 16; k++) {
            const a = out0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8), ca = Math.cos(a), sa = Math.sin(a);
            const reach = Math.min(Math.abs(ca) > 1e-9 ? pad.w / 2 / Math.abs(ca) : Infinity, Math.abs(sa) > 1e-9 ? pad.h / 2 / Math.abs(sa) : Infinity) + gap + via.pad / 2;
            tries.push({ x: pad.x + ca * reach, y: pad.y + sa * reach });
          }
          const ok = tries.find((t) => viaFree(t.x, t.y, e.pcb_smtpad_id) && trackFree(pad, t, e.layer, e.pcb_smtpad_id));
          // no room for its own: a short track to a via of the same net already placed, if one is clear to reach
          const shared = !ok && sameNet[name].map((v) => ({ ...v, d: Math.hypot(v.x - pad.x, v.y - pad.y) })).filter((v) => v.d <= 3).sort((a, c) => a.d - c.d)
            .find((v) => trackFree(pad, v, e.layer, e.pcb_smtpad_id));
          if (!ok && !shared) { stuck.push({ pin, name, x: pad.x, y: pad.y }); continue; }
          segs.push({ a: { x: pad.x, y: pad.y }, b: ok || shared, layer: e.layer });
          if (shared) { add('pcb_trace', { route: [start, { route_type: 'wire', x: shared.x, y: shared.y, width, layer: e.layer }], source_trace_id: st.source_trace_id, subcircuit_id: SUB }); continue; }
          places.push(ok);
        }
        const route = [start, ...places.flatMap((v, i) => [{ route_type: 'wire', x: v.x, y: v.y, width, layer: e.layer }, viaAt(v.x, v.y),
          ...(i < places.length - 1 ? [{ route_type: 'wire', x: v.x, y: v.y, width, layer: e.layer }] : [])])];
        const t = add('pcb_trace', { route, source_trace_id: st.source_trace_id, subcircuit_id: SUB });
        for (const v of places) {
          sameNet[name].push(v);
          add('pcb_via', { pcb_trace_id: t.pcb_trace_id, x: v.x, y: v.y, hole_diameter: via.hole, outer_diameter: via.pad, layers: copper, from_layer: e.layer, to_layer: viaAt().to_layer, subcircuit_id: SUB });
          circles.push({ id: `via${circles.length}`, x: v.x, y: v.y, r: via.pad / 2 });
        }
      }
    }
  }
  // Pads with no room for a via, nor one in reach: a routed track to the nearest pad of the same net that reaches the
  // plane, as a board's power pins between close neighbours are wired. Its source trace to the net goes (the track joins it)
  const reached = new Map(Object.keys(board.planes).map((n) => [n, []]));
  for (const t of out.filter((x) => x.type === 'pcb_trace' && x.route[0].start_pcb_port_id)) {
    const st = out.find((x) => x.source_trace_id === t.source_trace_id), n = out.find((x) => x.type === 'source_net' && x.source_net_id === st.connected_source_net_ids?.[0])?.name;
    if (n) reached.get(n).push({ x: t.route[0].x, y: t.route[0].y, pin: [...pins].find(([, l]) => l.some((q) => q.e.pcb_port_id === t.route[0].start_pcb_port_id))?.[0] });
  }
  const links = [];
  for (const s of stuck) {
    const to = reached.get(s.name).filter((r) => r.pin && r.pin !== s.pin).sort((a, c) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(c.x - s.x, c.y - s.y))[0];
    if (!to) throw new Error(`no way for ${s.pin} to reach the ${s.name} plane: no room for a via, and no other pad of ${s.name} reaches it`);
    const i = out.findIndex((x) => x.type === 'source_trace' && x.display_name === `${s.pin} to ${s.name}`);
    if (i >= 0) out.splice(i, 1);
    const cut = (q) => { const k = q.indexOf('.'); return [q.slice(0, k), q.slice(k + 1)]; };
    links.push({ from: cut(s.pin), to: cut(to.pin), width });
  }
  return { nets, links };
}

// The planes: each net's copper filling its inner layer, clear of every other net's holes and vias (tscircuit's copper
// pour solver), joined to its own by thermal spokes
async function pours(out, add, board, nets, netOf) {
  const { CopperPourPipelineSolver, initializeManifoldGeometry } = await import('@tscircuit/copper-pour-solver');
  await initializeManifoldGeometry();
  const b = out.find((e) => e.type === 'pcb_board'), comp = new Map(out.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e.name]));
  const src = new Map(out.filter((e) => e.type === 'source_port').map((e) => [e.source_port_id, e]));
  const portNet = (id) => { const sp = src.get(out.find((e) => e.pcb_port_id === id && e.type === 'pcb_port')?.source_port_id); if (!sp) return null;
    for (const k of [sp.name, ...(sp.port_hints || [])]) { const n = netOf.get(`${comp.get(sp.source_component_id)}.${k}`); if (n) return n; } return null; };
  const traceNet = new Map();
  for (const t of out.filter((e) => e.type === 'source_trace')) {
    const n = t.connected_source_net_ids?.length ? out.find((e) => e.source_net_id === t.connected_source_net_ids[0] && e.type === 'source_net')?.name
      : (() => { for (const id of t.connected_source_port_ids) { const pp = out.find((e) => e.type === 'pcb_port' && e.source_port_id === id); const n2 = pp && portNet(pp.pcb_port_id); if (n2) return n2; } return null; })();
    traceNet.set(t.source_trace_id, n);
  }
  const pcbTraceNet = new Map(out.filter((e) => e.type === 'pcb_trace').map((e) => [e.pcb_trace_id, traceNet.get(e.source_trace_id)]));
  const outline = b.outline || [{ x: b.center.x - b.width / 2, y: b.center.y - b.height / 2 }, { x: b.center.x + b.width / 2, y: b.center.y - b.height / 2 },
    { x: b.center.x + b.width / 2, y: b.center.y + b.height / 2 }, { x: b.center.x - b.width / 2, y: b.center.y + b.height / 2 }];
  const bounds = { minX: Math.min(...outline.map((p) => p.x)), maxX: Math.max(...outline.map((p) => p.x)), minY: Math.min(...outline.map((p) => p.y)), maxY: Math.max(...outline.map((p) => p.y)) };
  for (const [name, { layer, id }] of Object.entries(nets)) {
    const pads = [
      ...out.filter((e) => e.type === 'pcb_plated_hole').map((e) => { const { w, h } = holeSize(e), key = portNet(e.pcb_port_id) ?? `none:${e.pcb_plated_hole_id}`;
        return e.shape === 'circle' ? { padId: e.pcb_plated_hole_id, connectivityKey: key, layer, shape: 'circle', x: e.x, y: e.y, radius: w / 2, isPlatedHole: true }
          : { padId: e.pcb_plated_hole_id, connectivityKey: key, layer, shape: 'pill', x: e.x, y: e.y, width: w, height: h, radius: Math.min(w, h) / 2, ccwRotation: 0, isPlatedHole: true }; }),
      ...out.filter((e) => e.type === 'pcb_via').map((e) => ({ padId: e.pcb_via_id, connectivityKey: pcbTraceNet.get(e.pcb_trace_id) ?? `none:${e.pcb_via_id}`, layer, shape: 'circle', x: e.x, y: e.y, radius: e.outer_diameter / 2 })),
      ...out.filter((e) => e.type === 'pcb_hole').map((e) => ({ padId: e.pcb_hole_id, connectivityKey: `hole:${e.pcb_hole_id}`, layer, shape: 'circle', x: e.x, y: e.y, radius: e.hole_diameter / 2 })),
      ...out.filter((e) => e.type === 'pcb_trace' && e.route.some((p) => p.layer === layer)).map((e) => ({ padId: e.pcb_trace_id, connectivityKey: pcbTraceNet.get(e.pcb_trace_id) ?? `none:${e.pcb_trace_id}`, layer,
        shape: 'trace', width: e.route[0].width, segments: e.route.filter((p) => p.route_type === 'wire').map((p) => ({ x: p.x, y: p.y })) }))];
    const solver = new CopperPourPipelineSolver({ pads, regionsForPour: [{ shape: 'rect', layer, bounds, outline, connectivityKey: name,
      padMargin: board.plane_clearance ?? 0.2, traceMargin: board.plane_clearance ?? 0.2, board_edge_margin: board.plane_edge ?? 0.3,
      use_thermal_reliefs: true, thermal_relief_spoke_width: 0.3, thermal_relief_spoke_count: 4 }] });
    solver.solve();
    if (solver.failed) throw new Error(`the ${name} plane couldn't be drawn: ${solver.error || 'no reason given'}`);
    for (const shape of solver.getOutput().brep_shapes) add('pcb_copper_pour', { layer, shape: 'brep', brep_shape: shape, source_net_id: id, covered_with_solder_mask: true, subcircuit_id: SUB });
  }
}

// A part's port names, in pad order: a switch's pin1 and pin2, a diode's anode and cathode, a chip's pins by label
function portNames(part, pads) {
  if (part.ftype === 'simple_diode') return [{ name: 'pin1', n: 1, hints: ['pin1', 'pos', 'anode', 'left', '1'] }, { name: 'pin2', n: 2, hints: ['pin2', 'neg', 'cathode', 'right', '2'] }];
  return (part.pads || pads).map((p) => {
    const n = Number(p.pin.replace(/\D/g, '')), label = part.sch?.pinLabels?.[p.pin];
    return { name: label || p.pin, n, hints: label ? [label, p.pin, String(n)] : [p.pin, String(n)] };
  });
}

// A net's connections: its pins joined by the shortest set of straight links between them (Prim's minimum spanning
// tree, ties to the earlier pin), so the router gets short, sensible connections to route rather than a long chain
function netTraces(board, port, joined = new Map()) {
  return Object.entries(board.nets || {}).flatMap(([net, spec]) => {
    const list = Array.isArray(spec) ? spec : spec.pins, width = (Array.isArray(spec) ? undefined : spec.width) ?? board.track;
    if (!width) throw new Error(`net ${net}: no track width. Give the board a track width (board.track) or the net one ({ pins, width })`);
    const pins = list.map((p) => { const i = String(p).indexOf('.'); if (i < 1) throw new Error(`net ${net}: "${p}" should name a part and a pin, like U1.GND`); return [p.slice(0, i), p.slice(i + 1)]; });
    // Pins the source's kept copper already joins come in together: only the joins between them are routed
    const at = pins.map((p) => port(...p)), group = pins.map((p) => joined.get(p.join('.'))), links = [];
    const linked = [], take = (i) => { for (let j = 0; j < pins.length; j++) if (j === i || (group[i] && group[j] === group[i])) if (!linked.includes(j)) linked.push(j); };
    take(0);
    while (linked.length < pins.length) {
      let best = null;
      for (const a of linked) for (let b = 0; b < pins.length; b++) {
        if (linked.includes(b)) continue;
        const d = Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y);
        if (!best || d < best.d) best = { a, b, d };
      }
      take(best.b); links.push({ from: pins[best.a], to: pins[best.b], width, net });
    }
    return links;
  });
}

// ---- the schematic: each part at the place the board gives it, wires between neighbours, labels to the chip ----
function schematic(out, add, placed, board, port, netOf = new Map()) {
  const sch = new Map();
  // Parts with no place of their own on the schematic (a clone's: their board places would pile them up) go in rows,
  // biggest first, with room between for the net labels on their pins
  const auto = placed.filter((p) => !p.part.sch), row = { x: 0, y: 0, h: 0 }, width = Math.max(12, Math.sqrt(auto.length) * 3.5);
  for (const p of [...auto].sort((a, b) => b.sourcePorts.length - a.sourcePorts.length)) {
    const pins = new Set(p.sourcePorts.map((sp) => sp.name)).size;
    const w = 1.9 + 2 * 2.2, h = (Math.ceil(pins / 2) + 1) * 0.2 + 0.8; // the box, its pins' labels either side, its title
    if (row.x > 0 && row.x + w > width) { row.x = 0; row.y -= row.h; row.h = 0; }
    p.at = { x: row.x + w / 2, y: row.y - h / 2 }; row.x += w; row.h = Math.max(row.h, h);
  }
  for (const { part, comp, sourcePorts, at } of placed) {
    const s = part.sch || at || { x: 0, y: 0 };
    if (part.ftype === 'simple_chip') { // a box: pins 1 to 20 down the left, 21 to 40 up the right, 0.2 apart
      // laid out here, a pin with several pads (a chip's centre pad and its thermal holes) is drawn once
      const shown = at ? sourcePorts.filter((sp, i) => sourcePorts.findIndex((o) => o.name === sp.name) === i) : sourcePorts;
      const half = Math.ceil(shown.length / 2), size = { width: 1.9, height: (half + 1) * 0.2 };
      const c = add('schematic_component', { center: { x: s.x, y: s.y }, rotation: 0, size, pin_spacing: 0.2, port_labels: part.sch?.pinLabels || {},
        source_component_id: comp.source_component_id, is_box_with_pins: true, schematic_group_id: 'schematic_group_0' });
      add('schematic_text', { text: at ? `${part.name}${part.value ? ` ${part.value}` : ''}` : part.mpn ?? part.name, schematic_component_id: c.schematic_component_id, anchor: 'left', rotation: 0,
        position: { x: s.x - size.width / 2, y: s.y - size.height / 2 - 0.23 }, color: '#006464', font_size: 0.18 });
      shown.forEach((sp, i) => {
        const left = i < half, k = left ? i : shown.length - 1 - i, side = left ? 'left' : 'right';
        const center = { x: s.x + (left ? -1 : 1) * (size.width / 2 + 0.4), y: s.y + size.height / 2 - 0.2 * (k + 1) };
        const sp2 = add('schematic_port', { schematic_component_id: c.schematic_component_id, center, source_port_id: sp.source_port_id,
          facing_direction: side, distance_from_component_edge: 0.4, side_of_component: side, pin_number: sp.pin_number, true_ccw_index: i, display_pin_label: sp.name.replace(/^pin/, '') });
        sch.set(sp.source_port_id, sp2);
        // laid out here: each pin labelled with its net, in place of wires across the sheet
        const net = at && [sp.name, ...(sp.port_hints || [])].map((k) => netOf.get(`${part.name}.${k}`)).find(Boolean);
        if (net) add('schematic_net_label', { text: net.replace(/^\//, ''), anchor_position: center, center, anchor_side: left ? 'right' : 'left', source_port_id: sp.source_port_id });
      });
      for (const sp of sourcePorts) if (!sch.has(sp.source_port_id)) sch.set(sp.source_port_id, sch.get(shown.find((o) => o.name === sp.name).source_port_id)); // its other pads: drawn as one
      continue;
    }
    const symbol = symbols[part.ftype === 'simple_diode' ? 'diode_down' : 'spst_switch_right'];
    const c = add('schematic_component', { center: { x: s.x, y: s.y }, rotation: 0, size: symbol.size, source_component_id: comp.source_component_id,
      is_box_with_pins: true, symbol_name: part.ftype === 'simple_diode' ? 'diode_down' : 'spst_switch_right', schematic_group_id: 'schematic_group_0' });
    sourcePorts.forEach((sp, i) => {
      const q = symbol.ports[i], center = { x: s.x + q.x - symbol.center.x, y: s.y + q.y - symbol.center.y };
      sch.set(sp.source_port_id, add('schematic_port', { schematic_component_id: c.schematic_component_id, center, source_port_id: sp.source_port_id,
        facing_direction: part.ftype === 'simple_diode' ? (i ? 'down' : 'up') : (i ? 'right' : 'left'), distance_from_component_edge: 0.4 }));
    });
  }
  // A wire between two parts' pins (L-shaped), or for a connection to the chip, a label at each end naming the pin
  const labelled = new Set(placed.filter((p) => p.at).map((p) => p.part.name));
  for (const t of board.traces) {
    if (labelled.has(t.from[0]) && labelled.has(t.to[0])) continue; // their pins carry their nets' names already
    const a = port(...t.from), b = port(...t.to), pa = sch.get(a.source.source_port_id), pb = sch.get(b.source.source_port_id);
    const chip = [a, b].find((q) => placed.find((p) => p.sourcePorts.includes(q.source)).part.ftype === 'simple_chip');
    if (chip || t.net) { // a net's ends are labelled with the net's name
      // At the chip, the label points out from its side of the box; at the matrix, it hangs below the pin
      for (const [q, sp] of [[pa, a], [pb, b]]) add('schematic_net_label', { text: t.net ?? chip.source.name, anchor_position: q.center, center: q.center,
        anchor_side: q.side_of_component === 'left' ? 'right' : q.side_of_component === 'right' ? 'left' : 'top', source_port_id: sp.source.source_port_id });
      continue;
    }
    const corner = { x: pb.center.x, y: pa.center.y };
    add('schematic_trace', { source_trace_id: `${pa.schematic_port_id}-${pb.schematic_port_id}`, junctions: [],
      edges: [{ from: pa.center, to: corner }, { from: corner, to: pb.center }].filter((e) => e.from.x !== e.to.x || e.from.y !== e.to.y) });
  }
  add('schematic_group', { is_subcircuit: true, subcircuit_id: SUB, name: 'board', center: { x: 0, y: 0 }, width: 0, height: 0, schematic_component_ids: [], source_group_id: 'source_group_0' });
}

// ---- the autorouter ----
// The connections the rules don't draw, routed by tscircuit's capacity autorouter around everything already on the
// board. The board is described to it as tscircuit's own core describes it (pads, holes, the drawn tracks, and which
// of them are connected), and the same solver runs with the same settings, so a board routes as it did there.
// -> { traces: [{ route, source_trace_id, vias }] }
export async function routeInput(json, toRoute, board = {}) {
  const { getFullConnectivityMapFromCircuitJson } = await import('circuit-json-to-connectivity-map');
  const conn = getFullConnectivityMapFromCircuitJson(json);
  // A plane net's pads (GND, 3V3) are joined by the plane, not by tracks: each is joined only to the links routed from it,
  // so a short link between two close pads isn't tied to every pad of the net across the board (the router's topology
  // merging then fails on far-off ones, such as a chip's thermal vias)
  const planeNet = new Set(json.filter((e) => e.type === 'source_net' && board.planes?.[e.name]).map((e) => conn.getNetConnectedToId(e.source_net_id)).filter(Boolean));
  const linksAt = new Map();
  for (const { a, b: z, id } of toRoute) for (const q of [a, z]) linksAt.set(q.pcb.pcb_port_id, [...(linksAt.get(q.pcb.pcb_port_id) || []), id]);
  const linked = (id, port) => { const net = conn.getNetConnectedToId(id); if (!net) return [id];
    return planeNet.has(net) ? [id, ...(port ? [port, ...(linksAt.get(port) || [])] : [])] : [...new Set([id, net, ...conn.getIdsConnectedToNet(net)])]; };
  const comp = Object.fromEntries(json.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e.name]));
  const src = Object.fromEntries(json.filter((e) => e.type === 'source_port').map((e) => [e.source_port_id, e]));
  const pcbPort = Object.fromEntries(json.filter((e) => e.type === 'pcb_port').map((e) => [e.pcb_port_id, e]));
  const meta = (e, idKey) => { const sp = src[pcbPort[e.pcb_port_id]?.source_port_id];
    return { [idKey]: e[idKey], pcb_port_id: e.pcb_port_id, source_component_name: comp[sp?.source_component_id], source_port_name: sp?.name }; };
  // Pads joined inside their part (a Pico's GND pins) say so: the router may join them on the board too
  const inside = new Map();
  for (const e of json.filter((x) => x.type === 'source_component_internal_connection')) for (const id of e.source_port_ids) inside.set(id, [...(inside.get(id) || []), e.source_component_internal_connection_id]);
  const joined = (e) => { const ids = inside.get(pcbPort[e.pcb_port_id]?.source_port_id); return ids ? { offBoardConnectsTo: ids, netIsAssignable: true } : {}; };
  const b = json.find((e) => e.type === 'pcb_board'), obstacles = [];
  for (const kind of ['pcb_smtpad', 'pcb_plated_hole', 'pcb_hole']) for (const e of json.filter((x) => x.type === kind)) { // by kind, as core lists them
    if (e.type === 'pcb_smtpad' && e.shape === 'polygon') { // copper of any shape, as strips the router can see round
      for (const b of strips(e.points, 0.25)) obstacles.push({ circuitJsonMetadata: meta(e, 'pcb_smtpad_id'), componentId: e.pcb_component_id, type: 'rect', layers: [e.layer],
        center: { x: b.x, y: b.y }, width: b.w, height: b.h, connectedTo: linked(e.pcb_smtpad_id, e.pcb_port_id), ...joined(e) });
      continue;
    }
    if (e.type === 'pcb_smtpad') { const b = smtBounds(e); obstacles.push({ circuitJsonMetadata: meta(e, 'pcb_smtpad_id'), componentId: e.pcb_component_id, type: 'rect', layers: [e.layer],
      center: { x: b.x, y: b.y }, width: b.w, height: b.h, connectedTo: linked(e.pcb_smtpad_id, e.pcb_port_id), ...joined(e) }); }
    if (e.type === 'pcb_plated_hole') obstacles.push({ circuitJsonMetadata: meta(e, 'pcb_plated_hole_id'), componentId: e.pcb_component_id, type: 'oval', layers: ['top', 'bottom'],
      center: { x: e.x, y: e.y }, width: holeSize(e).w, height: holeSize(e).h, connectedTo: linked(e.pcb_plated_hole_id, e.pcb_port_id), ...joined(e) });
    if (e.type === 'pcb_hole') obstacles.push({ componentId: e.pcb_component_id, obstacleId: e.pcb_hole_id, isNonPlatedHole: true, type: 'rect', shape: 'circle',
      layers: ['top', 'bottom'], center: { x: e.x, y: e.y }, width: e.hole_diameter, height: e.hole_diameter, connectedTo: [] });
  }
  // Tracks already on the board, but a plane's vias inside a big pad: the pad is in the router's way already
  const padOf = new Map(json.filter((e) => e.type === 'pcb_smtpad').map((e) => [e.pcb_port_id, smtBounds(e)]));
  const inPad = (e) => { const d = padOf.get(e.route[0].start_pcb_port_id); return d && e.route.every((p) => Math.abs(p.x - d.x) <= d.w / 2 && Math.abs(p.y - d.y) <= d.h / 2); };
  const vias = json.filter((e) => e.type === 'pcb_via');
  const viaSize = (id, p) => vias.find((v) => v.pcb_trace_id === id && Math.abs(v.x - p.x) < 1e-6 && Math.abs(v.y - p.y) < 1e-6)?.outer_diameter;
  const outer = (e) => e.route.every((p) => p.route_type !== 'wire' || p.layer === 'top' || p.layer === 'bottom'); // the router works on the outer two
  const traces = json.filter((e) => e.type === 'pcb_trace' && !inPad(e) && outer(e)).map((e) => ({ type: 'pcb_trace', pcb_trace_id: e.pcb_trace_id, source_trace_id: e.source_trace_id,
    connection_name: e.source_trace_id, connectsTo: [e.route[0].start_pcb_port_id, e.route.at(-1).end_pcb_port_id].filter(Boolean), // a plane's track ends at its via
    route: e.route.map((p) => ({ route_type: p.route_type, x: p.x, y: p.y, width: p.width, layer: p.layer,
      ...(p.route_type === 'via' ? { from_layer: p.from_layer, to_layer: p.to_layer, via_diameter: viaSize(e.pcb_trace_id, p) } : {}) })) })); // each via at its real size
  const connections = toRoute.map(({ t, a, b: z, id }) => ({ name: id, source_trace_id: id, nominalTraceWidth: t.width, width: t.width,
    pointsToConnect: [a, z].map((q) => ({ x: q.x, y: q.y, layer: q.layers.length === 1 ? q.layers[0] : 'top', ...(q.layers.length === 1 ? { onlyLayer: q.layers[0] } : {}), pointId: q.pcb.pcb_port_id, pcb_port_id: q.pcb.pcb_port_id,
      port_selector: `${comp[q.source.source_component_id]}.${q.source.name}` })) }));
  return fixedTraces({ bounds: { minX: b.center.x - b.width / 2, maxX: b.center.x + b.width / 2, minY: b.center.y - b.height / 2, maxY: b.center.y + b.height / 2 },
    ...(b.outline ? { outline: b.outline } : {}), // the router keeps tracks inside a shaped board
    obstacles, connections, traces, layerCount: 2, allowBlindAndBuriedVias: false, minTraceWidth: 0.15, nominalTraceWidth: 0.15, // tscircuit's defaults
    // the board's fab minimums, under the names the router reads
    minViaDiameter: b.min_via_pad_diameter, minViaHoleDiameter: b.min_via_hole_diameter, minViaPadDiameter: b.min_via_pad_diameter,
    min_via_hole_diameter: b.min_via_hole_diameter, min_via_pad_diameter: b.min_via_pad_diameter,
    minTraceToPadEdgeClearance: b.min_trace_to_pad_edge_clearance, minTraceToHoleEdgeClearance: b.min_trace_to_hole_edge_clearance,
    minViaHoleEdgeToViaHoleEdgeClearance: b.min_via_hole_edge_to_via_hole_edge_clearance, minPlatedHoleDrillEdgeToDrillEdgeClearance: b.min_plated_hole_drill_edge_to_drill_edge_clearance,
    minPadEdgeToPadEdgeClearance: b.min_pad_edge_to_pad_edge_clearance, minBoardEdgeClearance: b.min_board_edge_clearance,
    ...(board.clearance ? { defaultObstacleMargin: board.clearance } : {}) }); // a board's own clearance, kept from everything in the way
}

// The drawn tracks become fixed obstacles for the router: each segment a box a track wide (a diagonal one, a run of
// boxes about a track-width long), each via a square. Ported from tscircuit core's withFixedTraces (MIT licence,
// github.com/tscircuit/core), so a board is routed around them as it is there.
function fixedTraces(input) {
  const obstacles = [];
  for (const trace of input.traces) {
    const connectedTo = [trace.connection_name ?? trace.pcb_trace_id, ...(trace.connectsTo ?? [])];
    trace.route.forEach((p, i) => {
      if (p.route_type === 'via') {
        const d = p.via_diameter ?? input.minViaPadDiameter ?? input.minViaDiameter ?? 0.6;
        obstacles.push({ type: 'rect', center: { x: p.x, y: p.y }, width: d, height: d, layers: ['top', 'bottom'], connectedTo });
      }
      const q = trace.route[i + 1];
      if (!q || !['wire', 'via'].includes(p.route_type) || !['wire', 'via'].includes(q.route_type)) return;
      const width = p.route_type === 'wire' ? p.width : q.route_type === 'wire' ? q.width : input.minTraceWidth;
      const layer = p.route_type === 'wire' ? p.layer : p.to_layer;
      const steps = p.x === q.x || p.y === q.y ? 1 : Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / width));
      for (let k = 0; k < steps; k++) {
        const x1 = p.x + ((q.x - p.x) * k) / steps, y1 = p.y + ((q.y - p.y) * k) / steps;
        const x2 = p.x + ((q.x - p.x) * (k + 1)) / steps, y2 = p.y + ((q.y - p.y) * (k + 1)) / steps;
        obstacles.push({ type: 'rect', center: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, width: Math.abs(x2 - x1) + width, height: Math.abs(y2 - y1) + width, layers: [layer], connectedTo });
      }
    });
  }
  return { ...input, traces: [], obstacles: [...input.obstacles, ...obstacles] };
}

/**
 * A route from the autorouter, cut where it changes layer inside a plated hole or a via: the router marks those as points
 * "through an obstacle", which nothing downstream reads, but the hole's copper already joins the layers, so the route
 * ends there on one layer and a second starts there on the other. A pass through anything else is an error.
 * @param {object[]} route @param {object[]} holes pcb_plated_hole and pcb_via elements @returns {object[][]}
 */
export function layerChanges(route, holes) {
  const pieces = [[]];
  for (const p of route) {
    if (p.route_type !== 'through_obstacle') { pieces.at(-1).push(p); continue; }
    const at = p.start, inHole = holes.some((h) => {
      const r = Math.max(holeSize(h).w, holeSize(h).h) / 2;
      return Math.hypot(at.x - h.x, at.y - h.y) <= r + 1e-6 && Math.hypot(p.end.x - h.x, p.end.y - h.y) <= r + 1e-6;
    });
    if (!inHole) throw new Error(`the autorouter ran a track through a part at (${at.x.toFixed(2)}, ${at.y.toFixed(2)}) mm: move the parts apart or give it more room`);
    const width = p.width ?? pieces.at(-1).at(-1)?.width;
    pieces.at(-1).push({ route_type: 'wire', x: at.x, y: at.y, width, layer: p.from_layer });
    pieces.push([{ route_type: 'wire', x: p.end.x, y: p.end.y, width, layer: p.to_layer }]);
  }
  return pieces.filter((q) => q.length > 1);
}

// The autorouter, then repair: its tracks sometimes run too close to, or over, others. Those connections are pulled up and
// routed again together with every good track fixed in place, up to three rounds (a round that can't route keeps the last
// result: on a board too tight for it, the checks then say where)
async function defaultRouter(json, toRoute, board) {
  let traces = (await routeOnce(json, toRoute, board)).traces;
  const { runAllChecks } = await import('@tscircuit/checks');
  const lay = (list) => list.flatMap((t, i) => [{ type: 'pcb_trace', pcb_trace_id: `pcb_trace_rt${i}`, route: t.route, source_trace_id: t.source_trace_id, subcircuit_id: SUB },
    ...t.vias.map((v, k) => ({ type: 'pcb_via', pcb_via_id: `pcb_via_rv${i}x${k}`, pcb_trace_id: `pcb_trace_rt${i}`, ...v, layers: v.layers, subcircuit_id: SUB }))]);
  for (let round = 0; round < 3; round++) {
    const errors = (await runAllChecks([...json, ...lay(traces)])).filter((e) => /_error$/.test(e.type));
    const bad = new Set();
    for (const e of errors) for (const m of JSON.stringify(e).matchAll(/pcb_(?:trace_rt|via_rv)(\d+)/g)) bad.add(traces[Number(m[1])]?.source_trace_id);
    bad.delete(undefined);
    if (!bad.size) break;
    const keep = traces.filter((t) => !bad.has(t.source_trace_id)), again = toRoute.filter((c) => bad.has(c.id));
    const minute = () => Date.now() + 60000; // each repair attempt gets a minute
    try { traces = [...keep, ...(await routeOnce([...json, ...lay(keep)], again, board, minute())).traces]; continue; } catch {} // too tight together:
    if (again.length > 4) break; // a few can go one at a time, each around everything else; more would take too long
    let changed = false;
    for (const c of again) {
      const rest = traces.filter((t) => t.source_trace_id !== c.id);
      try { traces = [...rest, ...(await routeOnce([...json, ...lay(rest)], [c], board, minute())).traces]; changed = true; } catch {}
    }
    if (!changed) break; // too tight to better: the last result stands
  }
  if (board?.neck) traces = await neckDown(json, traces, board.neck);
  return { traces };
}

/**
 * Routed tracks still a little too close to another: straightened where the router doubled back, then necked down where they pass, the segment of each nearest the spot
 * narrowed to neck (the fab's smallest track), which opens the gap. traces as the router gives them; returns them.
 * @param {object[]} json @param {object[]} traces @param {number} neck
 */
export async function neckDown(json, traces, neck) {
  const { runAllChecks } = await import('@tscircuit/checks');
  const toSeg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  const out = traces.map((t) => ({ ...t, route: t.route.map((p) => ({ ...p })) }));
  const lay = () => out.map((t, i) => ({ type: 'pcb_trace', pcb_trace_id: `pcb_trace_rt${i}`, route: t.route, source_trace_id: t.source_trace_id, subcircuit_id: SUB }));
  const close = async () => (await runAllChecks([...json, ...lay()])).filter((e) => e.type === 'pcb_trace_error' && /too close|overlap/.test(e.message) && e.center);
  // First, straighten: a routed track's kink by the spot (a bend point between two runs on one layer) is dropped when that
  // leaves fewer problems; the router sometimes doubles back as it leaves its start
  for (const e of await close()) for (const m of new Set(JSON.stringify(e).match(/pcb_trace_rt\d+/g) || [])) {
    const r = out[Number(m.slice(12))].route, before = (await close()).length;
    const k = r.map((_, i) => i).filter((i) => i > 0 && i < r.length - 1 && [r[i - 1], r[i], r[i + 1]].every((p) => p.route_type === 'wire' && p.layer === r[i].layer))
      .sort((i, j) => Math.hypot(r[i].x - e.center.x, r[i].y - e.center.y) - Math.hypot(r[j].x - e.center.x, r[j].y - e.center.y))[0];
    if (k === undefined || Math.hypot(r[k].x - e.center.x, r[k].y - e.center.y) > 1) continue;
    const [gone] = r.splice(k, 1);
    if ((await close()).length >= before) r.splice(k, 0, gone); // no better: put it back
  }
  for (let pass = 0; pass < 4; pass++) { // two tracks close along a stretch: the next segment along, until they clear
  const laid = out.map((t, i) => ({ type: 'pcb_trace', pcb_trace_id: `pcb_trace_rt${i}`, route: t.route, source_trace_id: t.source_trace_id, subcircuit_id: SUB }));
  const errors = (await runAllChecks([...json, ...laid])).filter((e) => e.type === 'pcb_trace_error' && /too close/.test(e.message) && e.center);
  let narrowed = false;
  for (const e of errors) for (const m of JSON.stringify(e).matchAll(/pcb_trace_rt(\d+)/g)) {
    const r = out[Number(m[1])]?.route; if (!r) continue;
    // the nearest segment still at full width (one already necked: the next along)
    const order = r.map((_, i) => i).filter((i) => i < r.length - 1 && r[i].route_type === 'wire' && r[i + 1].route_type === 'wire')
      .sort((i, k) => toSeg(e.center, r[i], r[i + 1]) - toSeg(e.center, r[k], r[k + 1]));
    const i = order.find((k) => toSeg(e.center, r[k], r[k + 1]) < 1 && (r[k].width > neck || r[k + 1].width > neck));
    if (i !== undefined) { r[i].width = Math.min(r[i].width, neck); r[i + 1].width = Math.min(r[i + 1].width, neck); narrowed = true; }
  }
  if (!narrowed) break;
  }
  return out;
}

async function routeOnce(json, toRoute, board, limit = 0) {
  // The autorouter uses JavaScript features from Node 22 (iterator helpers): say so, rather than fail inside it
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error(`routing a board's remaining connections needs Node 22 or newer (this is Node ${process.versions.node}); boards drawn wholly by rule build on Node 20`);
  const { AutoroutingPipelineSolver } = await import('@tscircuit/capacity-autorouter');
  const srj = await routeInput(json, toRoute, board);
  const solver = new AutoroutingPipelineSolver(srj, { cacheProvider: null });
  // stepped by hand, so a repair can be given a time limit (a first route has none)
  while (!solver.solved && !solver.failed) { solver.step(); if (limit && Date.now() > limit) throw new Error('a repair took too long'); }
  if (solver.failed) throw new Error(`the autorouter couldn't route every connection: ${solver.error || 'no reason given'}`);
  // The routes for the connections asked for (the solver also hands back the fixed ones), each from its first pad to
  // its second, as tscircuit records them
  const traces = [], asked = new Map(srj.connections.map((c) => [c.name, c.pointsToConnect]));
  const far = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  // The router hands back each net as pieces of track, named after one of its connections. A piece's ends are named
  // by the pads they finish on; a piece that reaches a one-sided pad on the other layer gets a via there (the router
  // sometimes leaves it out), set back along the piece just clear of the pad, and a short track on the pad's layer.
  const pads = json.filter((e) => e.type === 'pcb_smtpad' || e.type === 'pcb_plated_hole').map((e) => e.type === 'pcb_smtpad'
    ? { port: e.pcb_port_id, ...smtBounds(e), layer: e.layer, points: e.points } : { port: e.pcb_port_id, x: e.x, y: e.y, ...holeSize(e), layer: null });
  const within = (d, p) => Math.abs(p.x - d.x) <= d.w / 2 + 1e-6 && Math.abs(p.y - d.y) <= d.h / 2 + 1e-6 && (!d.points || insidePolygon(d.points, p));
  const padAt = (p) => pads.filter((d) => within(d, p)).sort((a, b) => a.w * a.h - b.w * b.h)[0]; // the smallest pad there
  const edge = json.find((e) => e.type === 'pcb_board')?.min_trace_to_pad_edge_clearance ?? 0.1;
  const onto = (pad, p, q) => {
    if (!pad?.layer || p.route_type !== 'wire' || p.layer === pad.layer) return [];
    const back = Math.max(pad.w, pad.h) / 2 + srj.minViaPadDiameter / 2 + edge;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1, t = Math.min(back / len, 1), v = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    return [{ route_type: 'wire', x: p.x, y: p.y, width: p.width, layer: pad.layer }, { route_type: 'wire', x: v.x, y: v.y, width: p.width, layer: pad.layer },
      { route_type: 'via', x: v.x, y: v.y, from_layer: pad.layer, to_layer: p.layer }, { route_type: 'wire', x: v.x, y: v.y, width: p.width, layer: p.layer }];
  };
  const holes = json.filter((e) => e.type === 'pcb_plated_hole' || e.type === 'pcb_via'); // copper joining the layers: a track may change layer in it
  // A connection's end that isn't on a pad (a kept escape's end) stands for its pin
  const ends = srj.connections.flatMap((c) => c.pointsToConnect).filter((q) => !padAt(q));
  const endAt = (p) => { const q = ends.find((e) => Math.hypot(e.x - p.x, e.y - p.y) < 0.02); return q && { port: q.pcb_port_id, layer: null, w: 0, h: 0, stub: true }; };
  const viaStub = []; // pins reached at a kept escape's end: the track ends there, not on the pad, so it isn't marked as the pad's
  for (const t of solver.getOutputSimplifiedPcbTraces()) {
    if (!asked.has(t.connection_name)) continue;
    for (const piece of layerChanges(t.route.map((p) => ({ ...p })), holes)) traces.push(finish(piece, t.connection_name));
  }
  function finish(piece, name) {
    let route = piece;
    const first = padAt(route[0]) ?? endAt(route[0]), last = padAt(route.at(-1)) ?? endAt(route.at(-1));
    const head = onto(first, route[0], route[1] || route[0]), tail = onto(last, route.at(-1), route.at(-2) || route.at(-1));
    if (head.length) route = [...head, ...route.slice(1)];
    if (tail.length) route = [...route.slice(0, -1), ...tail.reverse().map((q) => (q.route_type === 'via' ? { ...q, from_layer: q.to_layer, to_layer: q.from_layer } : q))];
    if (first) { if (first.stub) viaStub.push(first.port); else route[0].start_pcb_port_id = first.port; }
    if (last) { if (last.stub) viaStub.push(last.port); else route.at(-1).end_pcb_port_id = last.port; }
    return { route, source_trace_id: name, vias: route.filter((p) => p.route_type === 'via').map((p) => ({ x: p.x, y: p.y,
      hole_diameter: srj.minViaHoleDiameter, outer_diameter: srj.minViaPadDiameter, layers: ['top', 'bottom'], from_layer: p.from_layer, to_layer: p.to_layer })) };
  }
  // Every pad asked for has a track (a pad counts as reached when another pad of the same pin, joined in its part, is)
  const pinOf = new Map(json.filter((e) => e.type === 'pcb_port').map((e) => { const sp = json.find((x) => x.type === 'source_port' && x.source_port_id === e.source_port_id); return [e.pcb_port_id, `${sp?.source_component_id}:${sp?.name}`]; }));
  const reached = new Set([...traces.flatMap((t) => [t.route[0].start_pcb_port_id, t.route.at(-1).end_pcb_port_id]), ...viaStub].map((id) => pinOf.get(id)));
  const missing = srj.connections.flatMap((c) => c.pointsToConnect).filter((p) => !reached.has(pinOf.get(p.pcb_port_id)));
  if (missing.length) throw new Error(`the autorouter left ${missing.length} pads without a track (first: ${missing[0].port_selector})`);
  return { traces };
}

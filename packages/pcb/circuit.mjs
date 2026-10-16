// Circuit JSON, the open data format tscircuit's tools read (github.com/tscircuit/circuit-json), built directly from a
// plain description of a board, with no React. The fab exporters, the design checks, the drawings and KiCad export all
// read the result. Only two tscircuit libraries are used, and neither needs a framework: footprinter (standard
// footprints such as SOD-123) and the capacity autorouter (connections a board leaves to it).
//
// board: { center: { x, y }, width, height, thickness, parts, traces, nets, track, silk, holes, autoroute }, or
//   { outline: [{ x, y }, ...], thickness, ... }: any shape, a closed polygon (counter-clockwise); its centre and size
//   are its bounds. pcb.shape makes common ones (rounded, bevelled, circle).
//   part   { name, ftype: 'simple_switch' | 'simple_chip' | 'simple_diode', mpn, x, y, layer: 'top' | 'bottom',
//            rotation: 0 | 90 | 180 | 270 (counter-clockwise, seen from the side the part is on; default 0),
//            pads: [{ pin, x, y, hole, outer }] (plated, relative to the part) or [{ pin, smd: true, hint, x, y, w, h }]
//            or [{ pin, smd: true, x, y, points: [[x, y], ...] }] (copper of any shape; x, y: where tracks join it),
//            holes: [{ x, y, d }], courtyard: { w, h } | null,
//            footprint: 'sod123' | 'jst4_sh' | 'pinrow4' ... (a footprinter string, SMD or through-hole, instead of pads),
//            sch: { x, y, symbol?, pinLabels? } }
//   trace  { from: [part, port], to: [part, port], width, path: [{ x, y }] (absolute, between the two ports), layer }; a trace
//            without a path is left to the autorouter when board.autoroute is set
//   nets   { GND: ['U1.GND', 'J1.1', 'J2.1'] } or { GND: { pins: [...], width } }: each net's pins are joined by the
//            shortest set of connections between them (a minimum spanning tree), left to the autorouter, at the net's
//            width or board.track; pins are named part.pin, by the pin's label, its name or its number
//   silk   { rect: { x, y, w, h }, layer } | { text, x, y, size, layer }
//   holes  [{ x, y, d }] in the board (mounting holes)
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
  const ports = new Map(); // `${part}.${port name or hint}` -> { source, pcb, x, y, layers }
  const placed = [];
  for (const part of board.parts) {
    const comp = add('source_component', { ftype: part.ftype, name: part.name, manufacturer_part_number: part.mpn,
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
  }
  add('pcb_board', { source_board_id: sourceBoard.source_board_id, subcircuit_id: SUB, center: board.center, thickness: board.thickness, num_layers: 2,
    width: board.width, height: board.height, ...(board.outline ? { outline: board.outline.map(({ x, y }) => ({ x, y })) } : {}), material: 'fr4', ...FAB_MINIMUMS });

  for (const { part, comp, pads, sourcePorts, fpEls, at, mirror, size } of placed) {
    // The component sits at the middle of its pads and holes (as tscircuit places it: pick-and-place reads this)
    const extent = [...pads.map((p) => (p.poly ? [p.cx - p.w / 2, p.cy - p.h / 2, p.cx + p.w / 2, p.cy + p.h / 2] : p.smd ? [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2] : [p.x - p.outer / 2, p.y - p.outer / 2, p.x + p.outer / 2, p.y + p.outer / 2])),
      ...(part.holes || []).map((h) => { const q = at(h.x, h.y); return [q.x - h.d / 2, q.y - h.d / 2, q.x + h.d / 2, q.y + h.d / 2]; })];
    const box = [Math.min(...extent.map((e) => e[0])), Math.min(...extent.map((e) => e[1])), Math.max(...extent.map((e) => e[2])), Math.max(...extent.map((e) => e[3]))];
    const pc = add('pcb_component', { center: { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 }, width: box[2] - box[0], height: box[3] - box[1],
      layer: part.layer, rotation: part.rotation ?? 0, source_component_id: comp.source_component_id, subcircuit_id: SUB });
    const own = { pcb_component_id: pc.pcb_component_id, subcircuit_id: SUB };
    pads.forEach((p, i) => {
      const layers = p.smd ? [part.layer] : ['top', 'bottom'];
      const port = add('pcb_port', { pcb_component_id: pc.pcb_component_id, layers, subcircuit_id: SUB, x: p.x, y: p.y, source_port_id: sourcePorts[i].source_port_id });
      if (p.poly) { // copper of any shape: no paste (a contact, not a joint)
        add('pcb_smtpad', { ...own, pcb_port_id: port.pcb_port_id, layer: part.layer, shape: 'polygon', points: p.poly, port_hints: [p.hint ?? p.pin.replace(/^pin/, '')], is_covered_with_solder_mask: false });
      } else if (p.smd) {
        const pad = add('pcb_smtpad', { ...own, pcb_port_id: port.pcb_port_id, layer: part.layer, shape: 'rect', width: p.w, height: p.h, port_hints: [p.hint], is_covered_with_solder_mask: false, x: p.x, y: p.y });
        add('pcb_solder_paste', { layer: part.layer, shape: 'rect', width: p.w * PASTE, height: p.h * PASTE, x: p.x, y: p.y, pcb_component_id: pc.pcb_component_id, pcb_smtpad_id: pad.pcb_smtpad_id, subcircuit_id: SUB });
      } else {
        add('pcb_plated_hole', { ...own, pcb_port_id: port.pcb_port_id, outer_diameter: p.outer, hole_diameter: p.hole, shape: 'circle',
          port_hints: [`unnamed_platedhole${i + 1}`, p.pin], x: p.x, y: p.y, layers, is_covered_with_solder_mask: false });
      }
      Object.assign(sourcePorts[i], { _pcb: port });
      for (const key of [sourcePorts[i].name, ...sourcePorts[i].port_hints]) ports.set(`${part.name}.${key}`, { source: sourcePorts[i], pcb: port, x: p.x, y: p.y, layers });
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

  // ---- traces: drawn by rule, or left to the autorouter ----
  const port = (part, name) => { const p = ports.get(`${part}.${name}`); if (!p) throw new Error(`no port ${part}.${name}`); return p; };
  const toRoute = [], traces = [...(board.traces || []), ...netTraces(board, port)];
  for (const t of traces) {
    const a = port(...t.from), b = port(...t.to);
    const st = add('source_trace', { connected_source_port_ids: [a.source.source_port_id, b.source.source_port_id], connected_source_net_ids: [], subcircuit_id: SUB,
      display_name: `.${t.from.join(' > .')} to .${t.to.join(' > .')}`, min_trace_thickness: t.width });
    if (!t.path) { toRoute.push({ t, a, b, id: st.source_trace_id }); continue; }
    // A drawn track runs on the layer its first pad is on (a through-hole pad: the front)
    const layer = t.layer ?? (a.layers.length === 1 ? a.layers[0] : 'top'); // or the layer it names
    const pts = [{ x: a.x, y: a.y }, ...t.path, { x: b.x, y: b.y }];
    add('pcb_trace', { route: pts.map((q, i) => ({ route_type: 'wire', x: q.x, y: q.y, width: t.width, layer,
      ...(i === 0 ? { start_pcb_port_id: a.pcb.pcb_port_id } : {}), ...(i === pts.length - 1 ? { end_pcb_port_id: b.pcb.pcb_port_id } : {}) })), source_trace_id: st.source_trace_id, subcircuit_id: SUB });
  }

  // ---- silkscreen and mounting holes ----
  for (const s of board.silk) {
    if (s.rect) add('pcb_silkscreen_rect', { pcb_component_id: null, layer: s.layer, center: { x: s.rect.x, y: s.rect.y }, width: s.rect.w, height: s.rect.h, subcircuit_id: SUB, stroke_width: 0.1, is_filled: false });
    else add('pcb_silkscreen_text', { anchor_alignment: 'center', anchor_position: { x: s.x, y: s.y }, font: 'tscircuit2024', font_size: s.size, layer: s.layer, text: s.text, ccw_rotation: 0, pcb_component_id: null, subcircuit_id: SUB });
  }
  for (const h of board.holes || []) add('pcb_hole', { hole_shape: 'circle', hole_diameter: h.d, x: h.x, y: h.y, is_covered_with_solder_mask: false, subcircuit_id: SUB });

  // ---- the autorouter: what the rules don't draw ----
  if (toRoute.length) {
    if (!board.autoroute) throw new Error(`${toRoute.length} connections have no track and the board isn't autorouted`);
    const routed = await route(out, toRoute, board);
    for (const r of routed.traces) {
      const t = add('pcb_trace', { route: r.route, source_trace_id: r.source_trace_id, subcircuit_id: SUB });
      for (const v of r.vias) add('pcb_via', { pcb_trace_id: t.pcb_trace_id, ...v, subcircuit_id: SUB }); // whose via it is: the checks need it
    }
  }

  schematic(out, add, placed, { ...board, traces }, port);
  return out;
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
function netTraces(board, port) {
  return Object.entries(board.nets || {}).flatMap(([net, spec]) => {
    const list = Array.isArray(spec) ? spec : spec.pins, width = (Array.isArray(spec) ? undefined : spec.width) ?? board.track;
    if (!width) throw new Error(`net ${net}: no track width. Give the board a track width (board.track) or the net one ({ pins, width })`);
    const pins = list.map((p) => { const i = String(p).indexOf('.'); if (i < 1) throw new Error(`net ${net}: "${p}" should name a part and a pin, like U1.GND`); return [p.slice(0, i), p.slice(i + 1)]; });
    const at = pins.map((p) => port(...p)), linked = [0], links = [];
    while (linked.length < pins.length) {
      let best = null;
      for (const a of linked) for (let b = 0; b < pins.length; b++) {
        if (linked.includes(b)) continue;
        const d = Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y);
        if (!best || d < best.d) best = { a, b, d };
      }
      linked.push(best.b); links.push({ from: pins[best.a], to: pins[best.b], width, net });
    }
    return links;
  });
}

// ---- the schematic: each part at the place the board gives it, wires between neighbours, labels to the chip ----
function schematic(out, add, placed, board, port) {
  const sch = new Map();
  for (const { part, comp, sourcePorts } of placed) {
    const s = part.sch || { x: 0, y: 0 };
    if (part.ftype === 'simple_chip') { // a box: pins 1 to 20 down the left, 21 to 40 up the right, 0.2 apart
      const half = Math.ceil(sourcePorts.length / 2), size = { width: 1.9, height: (half + 1) * 0.2 };
      const c = add('schematic_component', { center: { x: s.x, y: s.y }, rotation: 0, size, pin_spacing: 0.2, port_labels: part.sch?.pinLabels || {},
        source_component_id: comp.source_component_id, is_box_with_pins: true, schematic_group_id: 'schematic_group_0' });
      add('schematic_text', { text: part.mpn ?? part.name, schematic_component_id: c.schematic_component_id, anchor: 'left', rotation: 0,
        position: { x: s.x - size.width / 2, y: s.y - size.height / 2 - 0.23 }, color: '#006464', font_size: 0.18 });
      sourcePorts.forEach((sp, i) => {
        const left = i < half, k = left ? i : sourcePorts.length - 1 - i, side = left ? 'left' : 'right';
        const center = { x: s.x + (left ? -1 : 1) * (size.width / 2 + 0.4), y: s.y + size.height / 2 - 0.2 * (k + 1) };
        sch.set(sp.source_port_id, add('schematic_port', { schematic_component_id: c.schematic_component_id, center, source_port_id: sp.source_port_id,
          facing_direction: side, distance_from_component_edge: 0.4, side_of_component: side, pin_number: sp.pin_number, true_ccw_index: i, display_pin_label: sp.name }));
      });
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
  for (const t of board.traces) {
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
export async function routeInput(json, toRoute) {
  const { getFullConnectivityMapFromCircuitJson } = await import('circuit-json-to-connectivity-map');
  const conn = getFullConnectivityMapFromCircuitJson(json);
  const linked = (id) => { const net = conn.getNetConnectedToId(id); return net ? [...new Set([id, net, ...conn.getIdsConnectedToNet(net)])] : [id]; };
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
        center: { x: b.x, y: b.y }, width: b.w, height: b.h, connectedTo: linked(e.pcb_smtpad_id), ...joined(e) });
      continue;
    }
    if (e.type === 'pcb_smtpad') { const b = smtBounds(e); obstacles.push({ circuitJsonMetadata: meta(e, 'pcb_smtpad_id'), componentId: e.pcb_component_id, type: 'rect', layers: [e.layer],
      center: { x: b.x, y: b.y }, width: b.w, height: b.h, connectedTo: linked(e.pcb_smtpad_id), ...joined(e) }); }
    if (e.type === 'pcb_plated_hole') obstacles.push({ circuitJsonMetadata: meta(e, 'pcb_plated_hole_id'), componentId: e.pcb_component_id, type: 'oval', layers: ['top', 'bottom'],
      center: { x: e.x, y: e.y }, width: e.outer_diameter, height: e.outer_diameter, connectedTo: linked(e.pcb_plated_hole_id), ...joined(e) });
    if (e.type === 'pcb_hole') obstacles.push({ componentId: e.pcb_component_id, obstacleId: e.pcb_hole_id, isNonPlatedHole: true, type: 'rect', shape: 'circle',
      layers: ['top', 'bottom'], center: { x: e.x, y: e.y }, width: e.hole_diameter, height: e.hole_diameter, connectedTo: [] });
  }
  const traces = json.filter((e) => e.type === 'pcb_trace').map((e) => ({ type: 'pcb_trace', pcb_trace_id: e.pcb_trace_id, source_trace_id: e.source_trace_id,
    connection_name: e.source_trace_id, connectsTo: [e.route[0].start_pcb_port_id, e.route.at(-1).end_pcb_port_id],
    route: e.route.map((p) => ({ route_type: p.route_type, x: p.x, y: p.y, width: p.width, layer: p.layer })) }));
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
    minPadEdgeToPadEdgeClearance: b.min_pad_edge_to_pad_edge_clearance, minBoardEdgeClearance: b.min_board_edge_clearance });
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

async function defaultRouter(json, toRoute) {
  // The autorouter uses JavaScript features from Node 22 (iterator helpers): say so, rather than fail inside it
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error(`routing a board's remaining connections needs Node 22 or newer (this is Node ${process.versions.node}); boards drawn wholly by rule build on Node 20`);
  const { AutoroutingPipelineSolver } = await import('@tscircuit/capacity-autorouter');
  const srj = await routeInput(json, toRoute);
  const solver = new AutoroutingPipelineSolver(srj, { cacheProvider: null });
  solver.solve();
  if (solver.failed) throw new Error(`the autorouter couldn't route every connection: ${solver.error || 'no reason given'}`);
  // The routes for the connections asked for (the solver also hands back the fixed ones), each from its first pad to
  // its second, as tscircuit records them
  const traces = [], asked = new Map(srj.connections.map((c) => [c.name, c.pointsToConnect]));
  const far = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  // The router hands back each net as pieces of track, named after one of its connections. A piece's ends are named
  // by the pads they finish on; a piece that reaches a one-sided pad on the other layer gets a via there (the router
  // sometimes leaves it out), set back along the piece just clear of the pad, and a short track on the pad's layer.
  const pads = json.filter((e) => e.type === 'pcb_smtpad' || e.type === 'pcb_plated_hole').map((e) => e.type === 'pcb_smtpad'
    ? { port: e.pcb_port_id, ...smtBounds(e), layer: e.layer, points: e.points } : { port: e.pcb_port_id, x: e.x, y: e.y, w: e.outer_diameter, h: e.outer_diameter, layer: null });
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
  for (const t of solver.getOutputSimplifiedPcbTraces()) {
    if (!asked.has(t.connection_name)) continue;
    let route = t.route.map((p) => ({ ...p }));
    const first = padAt(route[0]), last = padAt(route.at(-1));
    const head = onto(first, route[0], route[1] || route[0]), tail = onto(last, route.at(-1), route.at(-2) || route.at(-1));
    if (head.length) route = [...head, ...route.slice(1)];
    if (tail.length) route = [...route.slice(0, -1), ...tail.reverse().map((q) => (q.route_type === 'via' ? { ...q, from_layer: q.to_layer, to_layer: q.from_layer } : q))];
    if (first) route[0].start_pcb_port_id = first.port;
    if (last) route.at(-1).end_pcb_port_id = last.port;
    traces.push({ route, source_trace_id: t.connection_name, vias: route.filter((p) => p.route_type === 'via').map((p) => ({ x: p.x, y: p.y,
      hole_diameter: srj.minViaHoleDiameter, outer_diameter: srj.minViaPadDiameter, layers: ['top', 'bottom'], from_layer: p.from_layer, to_layer: p.to_layer })) });
  }
  // Every pad asked for has a track (a pad counts as reached when another pad of the same pin, joined in its part, is)
  const pinOf = new Map(json.filter((e) => e.type === 'pcb_port').map((e) => { const sp = json.find((x) => x.type === 'source_port' && x.source_port_id === e.source_port_id); return [e.pcb_port_id, `${sp?.source_component_id}:${sp?.name}`]; }));
  const reached = new Set(traces.flatMap((t) => [t.route[0].start_pcb_port_id, t.route.at(-1).end_pcb_port_id]).map((id) => pinOf.get(id)));
  const missing = srj.connections.flatMap((c) => c.pointsToConnect).filter((p) => !reached.has(pinOf.get(p.pcb_port_id)));
  if (missing.length) throw new Error(`the autorouter left ${missing.length} pads without a track (first: ${missing[0].port_selector})`);
  return { traces };
}

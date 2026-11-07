// A board in KiCad's own files, as KiCad reads them: tscircuit's converter (circuit-json-to-kicad) writes the board,
// and this makes up what it leaves out or reads differently, so KiCad's design-rule check sees the board our checks see.
//  - nets: the converter takes each pad's, track's and via's net from a connectivity key that tscircuit's own core
//    writes and a board built here doesn't. kicadNets() works the nets out (the ports each source trace joins, and the
//    copper laid for it) and names each: its source net's name (GND), the net the board gave the trace (/USB+), else
//    after its first pad (Net-(R4-Pad1))
//  - a hole set off-centre in its pad: KiCad puts the pad at its hole and moves its copper by the drill's offset;
//    tscircuit puts the pad at its copper, the hole moved by hole_offset. The converter writes the copper's place, so
//    the hole lands off by the offset: patchKicadPcb() moves each such pad to its hole
//  - castellated pads (a half hole on the edge) marked as KiCad's castellated pads, which may cross the board's edge
//  - a via laid twice at one place (a kept via and the track that names it) written once
//  - the rules: kicadProject() writes the project file KiCad reads them from, with the board's own minimums (pcb_board's
//    min_* values, which our checks use), and a custom rule file for exceptions the source has (pads by its edge)

/**
 * Circuit JSON with every source port, source trace, pcb trace and via keyed to its net, and a named source net for
 * each, as circuit-json-to-kicad reads them. A copy; the input is unchanged.
 * @param {object[]} json @returns {object[]}
 */
export function kicadNets(json) {
  const out = structuredClone(json);
  const up = new Map(), find = (a) => { while (up.get(a) !== a) { up.set(a, up.get(up.get(a))); a = up.get(a); } return a; };
  const join = (a, b) => { for (const x of [a, b]) if (!up.has(x)) up.set(x, x); up.set(find(a), find(b)); };
  for (const e of out) if (e.type === 'source_trace') {
    const ids = [...(e.connected_source_port_ids || []), ...(e.connected_source_net_ids || [])];
    join(e.source_trace_id, e.source_trace_id);
    for (const id of ids) join(e.source_trace_id, id);
  }
  for (const e of out) if (e.type === 'source_net' || e.type === 'source_port') join(e.source_net_id || e.source_port_id, e.source_net_id || e.source_port_id);
  // a pin with more than one pad (a half hole and a header hole) has a port for each: one net
  const pin = new Map();
  for (const e of out) if (e.type === 'source_port') { const k = `${e.source_component_id}:${e.name}`; if (pin.has(k)) join(pin.get(k), e.source_port_id); else pin.set(k, e.source_port_id); }
  const key = (id) => `net_${find(id)}`;
  // each net's name: its source net's, the board's name for one of its traces, else after its first pad
  const names = new Map();
  for (const e of out) if (e.type === 'source_net') names.set(key(e.source_net_id), e.name);
  for (const e of out) if (e.type === 'source_trace' && e.rulecad_net && !names.has(key(e.source_trace_id))) names.set(key(e.source_trace_id), e.rulecad_net);
  const part = new Map(out.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e.name]));
  for (const e of out) if (e.type === 'source_port' && !names.has(key(e.source_port_id))) names.set(key(e.source_port_id), `Net-(${part.get(e.source_component_id) ?? '?'}-Pad${e.pin_number ?? e.name})`);
  // a net no trace joins is a pin on its own: no KiCad net (net 0), as KiCad leaves an unconnected pad
  const joined = new Set(out.filter((e) => e.type === 'source_trace').map((e) => key(e.source_trace_id)));
  for (const k of pin.values()) if ([...pin.values()].filter((x) => key(x) === key(k)).length > 1 || out.some((e) => e.type === 'source_port' && e.source_port_id !== k && key(e.source_port_id) === key(k))) joined.add(key(k)); // (two pads of one pin: a net of their own)
  const nets = new Map(out.filter((e) => e.type === 'source_net').map((e) => [key(e.source_net_id), e]));
  for (const k of joined) if (!nets.has(k)) {
    const n = { type: 'source_net', source_net_id: `rulecad_${k}`, name: names.get(k), member_source_group_ids: [], subcircuit_connectivity_map_key: k };
    out.push(n); nets.set(k, n);
  }
  for (const [k, n] of nets) n.subcircuit_connectivity_map_key = k;
  const traceKey = new Map();
  for (const e of out) {
    if (e.type === 'source_trace') { e.subcircuit_connectivity_map_key = key(e.source_trace_id); }
    else if (e.type === 'source_port' && joined.has(key(e.source_port_id))) e.subcircuit_connectivity_map_key = key(e.source_port_id);
  }
  for (const e of out) if (e.type === 'pcb_trace' && e.source_trace_id && up.has(e.source_trace_id)) { e.subcircuit_connectivity_map_key = key(e.source_trace_id); traceKey.set(e.pcb_trace_id, e.subcircuit_connectivity_map_key); }
  for (const e of out) if (e.type === 'pcb_via' && traceKey.has(e.pcb_trace_id)) e.subcircuit_connectivity_map_key = traceKey.get(e.pcb_trace_id);
  return out;
}

/**
 * The converter's .kicad_pcb made right for KiCad (see the top of this file): pads with an off-centre hole moved to
 * their hole, castellated pads marked, a via laid twice written once.
 * @param {string} text @param {object[]} json @returns {string}
 */
export function patchKicadPcb(text, json) {
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  // a pad with a drill offset: at its hole (the copper keeps its place: the offset is now from the hole to it)
  text = text.replace(/(\(pad "[^"]*" thru_hole \w+\s*\(at )(-?[\d.e-]+) (-?[\d.e-]+)((?: -?[\d.e-]+)?\)(?:(?!\(pad )[\s\S])*?\(drill [^()]*\(offset (-?[\d.e-]+) (-?[\d.e-]+)\))/g,
    (all, head, x, y, rest, dx, dy) => `${head}${r4(Number(x) - Number(dx))} ${r4(Number(y) - Number(dy))}${rest}`);
  // Pads found by where their footprint puts them (the hole, now), in footprint coordinates
  const comp = new Map(json.filter((e) => e.type === 'pcb_component').map((e) => [e.pcb_component_id, e]));
  const at = (e) => { const c = comp.get(e.pcb_component_id); return c && { x: e.x + (e.hole_offset_x ?? 0) - c.center.x, y: -(e.y + (e.hole_offset_y ?? 0) - c.center.y), e }; };
  const holes = json.filter((e) => e.type === 'pcb_plated_hole').map(at).filter(Boolean);
  const find = (x, y) => holes.find((p) => Math.abs(p.x - Number(x)) < 1e-3 && Math.abs(p.y - Number(y)) < 1e-3)?.e;
  // castellated: the half hole and every other pad of its pin (a header pad joined to it reaches the edge with it), as
  // KiCad's castellated pads, which may cross the board's edge
  const edgePins = new Set(holes.filter((p) => p.e.port_hints?.includes('castellated')).map((p) => `${p.e.pcb_component_id}:${p.e.port_hints?.[1]}`));
  // a rectangular pad with rounded corners (rect_border_radius): KiCad's rounded rectangle, which the converter leaves square
  text = text.replace(/\(pad "[^"]*" thru_hole (\w+)\s*\(at (-?[\d.e-]+) (-?[\d.e-]+)[^)]*\)/g, (all, shape, x, y) => {
    const e = find(x, y); if (!e) return all;
    let out = all;
    if (shape === 'rect' && e.rect_border_radius) out = out.replace(' thru_hole rect', ' thru_hole roundrect') + `\n      (roundrect_rratio ${r4(e.rect_border_radius / Math.min(e.rect_pad_width, e.rect_pad_height))})`;
    if (edgePins.has(`${e.pcb_component_id}:${e.port_hints?.[1]}`)) out += '\n      (property pad_prop_castellated)';
    return out;
  });
  // a via twice at one place, the same size, layers and net: once
  const seen = new Set();
  text = text.replace(/\n  \(via\s*\(at (-?[\d.e-]+) (-?[\d.e-]+)\)\s*\(size ([\d.]+)\)\s*\(drill ([\d.]+)\)\s*\(layers ([^)]*)\)\s*(\(net \d+\))?[\s\S]*?\n  \)/g, (all, x, y, size, drill, layers, net) => {
    const k = [r4(Number(x)), r4(Number(y)), size, drill, layers, net].join(' ');
    if (seen.has(k)) return '';
    seen.add(k); return all;
  });
  return text;
}

/**
 * KiCad's project file (.kicad_pro) with the board's own design rules, and a custom rules file (.kicad_dru):
 * minimums from pcb_board's min_* values (what our checks use), the default net class at the board's clearance and
 * track. edgeExempt: parts whose pads may come as close to the board's edge as the source has them ({ ref, edge }).
 * @param {object[]} json @param {{ clearance?: number, track?: number, edgeExempt?: { ref: string, edge: number }[] }} [o]
 * @returns {{ pro: string, dru: string }}
 */
export function kicadProject(json, { clearance, track, edgeExempt = [] } = {}) {
  const b = json.find((e) => e.type === 'pcb_board') || {};
  const via = json.find((e) => e.type === 'pcb_via');
  const vias = json.filter((e) => e.type === 'pcb_via'), holes = json.filter((e) => e.type === 'pcb_plated_hole' || e.type === 'pcb_hole' || e.type === 'pcb_via').map((e) => e.hole_diameter ?? e.hole_width).filter(Boolean);
  const viaPad = Math.min(b.min_via_pad_diameter ?? 0.3, ...vias.map((v) => v.outer_diameter)), viaHole = Math.min(b.min_via_hole_diameter ?? 0.2, ...vias.map((v) => v.hole_diameter));
  const gap = clearance ?? b.min_trace_to_pad_edge_clearance ?? 0.1;
  const rules = {
    min_clearance: gap, min_track_width: Math.min(b.min_trace_width ?? 0.1, ...json.filter((e) => e.type === 'pcb_trace').flatMap((t) => t.route.map((p) => p.width ?? Infinity))),
    min_via_diameter: viaPad, min_through_hole_diameter: Math.min(viaHole, ...holes), min_via_annular_width: Math.min(...vias.map((v) => (v.outer_diameter - v.hole_diameter) / 2), (viaPad - viaHole) / 2),
    min_copper_edge_clearance: b.min_board_edge_clearance ?? 0.2, min_hole_clearance: b.min_trace_to_hole_edge_clearance ?? 0.2,
    min_hole_to_hole: b.min_via_hole_edge_to_via_hole_edge_clearance ?? 0.1, min_silk_clearance: 0, min_microvia_diameter: 0.2, min_microvia_drill: 0.1,
    allow_blind_buried_vias: false, allow_microvias: false, max_error: 0.005, use_height_for_length_calcs: true };
  const pro = { board: { design_settings: { defaults: {}, rules, track_widths: [0], via_dimensions: [{ diameter: 0, drill: 0 }], rule_severities: {} } },
    meta: { filename: 'board.kicad_pro', version: 3 },
    net_settings: { classes: [{ name: 'Default', clearance: gap, track_width: track ?? 0.15, via_diameter: via?.outer_diameter ?? viaPad, via_drill: via?.hole_diameter ?? viaHole,
      microvia_diameter: 0.2, microvia_drill: 0.1, diff_pair_gap: 0.2, diff_pair_width: 0.2, diff_pair_via_gap: 0.25, wire_width: 6, bus_width: 12, line_style: 0, pcb_color: 'rgba(0, 0, 0, 0.000)', schematic_color: 'rgba(0, 0, 0, 0.000)', priority: 2147483647 }], meta: { version: 3 } } };
  const dru = ['(version 1)', ...edgeExempt.map((x) => `(rule "${x.ref}: its pads by the edge, as the source has them"\n  (condition "A.Parent == '${x.ref}' && A.Type == 'Pad'")\n  (constraint edge_clearance (min ${x.edge}mm)))`)].join('\n') + '\n';
  return { pro: JSON.stringify(pro, null, 2) + '\n', dru };
}

// Diodes the right way round: a net joined to a diode's cathode reaches the pad at its cathode end (DO-35's square pad,
// the band's end), and pad 1 is the cathode in the board's files (KiCad's numbering, which assemblers go by), so a
// keyboard's diodes point from the switch to the row (COL2ROW) however the board is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from '@rulecad/variables';
import { grid, keyboard, do35, part, render, kicadFiles, fabFiles } from '@rulecad/pcb';

const loadRuleSet = (name) => createRequire(import.meta.url)(`@rulecad/rules/${name}.json`);
const rules = (name) => Object.fromEntries(Object.entries(loadRuleSet(name).rules).map(([k, r]) => [k, r.value]));
const keyboardValues = (controller) => resolve({ uses: ['mx', 'pico', 'sod123', 'm2', 'jlcpcb'], variables: {
  track: { value: 'jlcpcb.track_min * 2.5' }, clear: { value: 'jlcpcb.gap_min * 2.5' }, thickness: { value: 'jlcpcb.thickness' },
  margin: { value: 5 }, mcu_gap: { value: 2 }, mcu_side: { value: 'left', choice: ['left', 'right'] }, mcu_row: { value: 0 }, mount_holes: { value: 1 },
  controller: { value: controller, choice: ['beside', 'under'] } } }, { load: loadRuleSet }).values;

// a part's ports: [{ sp (source_port), pad (its copper) }]
const portsOf = (json, name) => {
  const c = json.find((e) => e.type === 'source_component' && e.name === name);
  return json.filter((e) => e.type === 'source_port' && e.source_component_id === c.source_component_id).map((sp) => {
    const pp = json.find((e) => e.type === 'pcb_port' && e.source_port_id === sp.source_port_id);
    return { sp, pad: json.find((e) => (e.type === 'pcb_smtpad' || e.type === 'pcb_plated_hole') && e.pcb_port_id === pp.pcb_port_id) };
  });
};
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

test('a DO-35 diode: a track to its cathode ends on the square pad, at the band\'s end, and that pad is pad 1', async () => {
  const d = rules('do35');
  for (const rotation of [0, 90]) {
    const D = do35('D1', 0, 0, d, { rotation });
    const json = await render({ center: { x: 0, y: 0 }, width: 30, height: 30, thickness: 1.6, track: 0.3, parts: [D, part('J1', 'pinrow2', 8, 8)],
      traces: [{ from: ['D1', 'cathode'], to: ['J1', 'pin1'], width: 0.3, path: [] }] });
    const ports = portsOf(json, 'D1'), cathode = ports.find((p) => p.sp.port_hints.includes('cathode')), anode = ports.find((p) => p.sp.port_hints.includes('anode'));
    assert.equal(cathode.pad.shape, 'circular_hole_with_rect_pad', 'the cathode\'s port is the square pad');
    assert.equal(anode.pad.shape, 'circle', 'the anode\'s port is the round pad');
    assert.equal(cathode.sp.pin_number, 1, 'the cathode is pin 1'); assert.equal(anode.sp.pin_number, 2);
    const route = json.find((e) => e.type === 'pcb_trace').route, ends = [route[0], route.at(-1)];
    assert.ok(ends.some((q) => near(q, cathode.pad)), `the track to D1.cathode ends on the square pad (turned ${rotation}°)`);
    assert.ok(!ends.some((q) => near(q, anode.pad)), 'and not on the anode');
  }
});

test('a diode\'s pads with no names: pad 1 is the cathode; two pads at one end are refused', async () => {
  const pad = (pin, x) => ({ pin, x, y: 0, hole: 0.8, outer: 1.6 });
  const D = { name: 'D1', ftype: 'simple_diode', x: 0, y: 0, layer: 'top', pads: [pad('pin2', -2), pad('pin1', 2)] };
  const json = await render({ center: { x: 0, y: 0 }, width: 20, height: 20, thickness: 1.6, track: 0.3, parts: [D], traces: [] });
  const cathode = portsOf(json, 'D1').find((p) => p.sp.port_hints.includes('cathode'));
  assert.equal(cathode.pad.x, 2, 'pad 1, wherever it is in the list, is the cathode');
  const both = { ...D, pads: [pad('cathode', -2), pad('K', 2)] };
  await assert.rejects(render({ center: { x: 0, y: 0 }, width: 20, height: 20, thickness: 1.6, track: 0.3, parts: [both], traces: [] }), /both of the diode's pads are its cathode/);
});

test('the keyboard\'s SOD-123 diodes: pad 1 carries the row, in the circuit, the KiCad board and the placement file, the band beside it', async () => {
  for (const controller of ['beside', 'under']) {
    const v = keyboardValues(controller), { board } = keyboard(v, grid(controller === 'under' ? 3 : 2, 2, v.mx.pitch));
    // (the under board's Pico connections are autorouted: only the matrix, which is drawn by rule, is checked here)
    const json = await render(controller === 'under' ? { ...board, autoroute: false, traces: board.traces.filter((t) => t.to[0] !== 'U1' && t.from[0] !== 'U1') } : board);
    const comps = json.filter((e) => e.type === 'source_component' && /^D\d+$/.test(e.name));
    const owner = new Map(json.filter((e) => e.type === 'source_port').map((sp) => [sp.source_port_id, json.find((c) => c.source_component_id === sp.source_component_id).name]));
    const joins = (sp) => json.filter((t) => t.type === 'source_trace' && t.connected_source_port_ids.includes(sp.source_port_id))
      .flatMap((t) => t.connected_source_port_ids.filter((id) => id !== sp.source_port_id).map((id) => owner.get(id)));
    const bars = board.silk.filter((s) => s.rect && s.layer === 'bottom');
    for (const c of comps) {
      const ports = portsOf(json, c.name), one = ports.find((p) => p.pad.port_hints.includes('1')), two = ports.find((p) => p.pad.port_hints.includes('2'));
      assert.ok(one.sp.port_hints.includes('cathode') && one.sp.pin_number === 1, `${c.name}: pad 1 is the cathode`);
      assert.ok(joins(two.sp).every((n) => /^K\d+$/.test(n)) && joins(two.sp).length === 1, `${c.name}: pad 2, the anode, goes to its switch`);
      assert.ok(joins(one.sp).length > 0 && joins(one.sp).every((n) => /^(D\d+|U1)$/.test(n)), `${c.name}: pad 1 goes along the row (${joins(one.sp)})`);
      // the bar on the back, between the pads, is nearer pad 1
      const pc = json.find((e) => e.type === 'pcb_component' && e.source_component_id === c.source_component_id);
      const bar = bars.find((s) => Math.abs(s.rect.y - pc.center.y) < 1e-6 && Math.abs(s.rect.x - pc.center.x) < 1.65);
      assert.ok(bar, `${c.name}: a cathode bar`);
      assert.ok(Math.abs(bar.rect.x - one.pad.x) < Math.abs(bar.rect.x - two.pad.x), `${c.name}: the bar is at the cathode's end`);
      // the placement file: KiCad's SOD-123 has pad 1 at -1.65 mm; on the back it is mirrored, then turned by the rotation
      const t = (pc.rotation * Math.PI) / 180, at = { x: pc.center.x + Math.cos(t) * 1.65, y: pc.center.y + Math.sin(t) * 1.65 };
      assert.ok(near({ x: Math.round(at.x * 1e6) / 1e6, y: Math.round(at.y * 1e6) / 1e6 }, { x: Math.round(one.pad.x * 1e6) / 1e6, y: Math.round(one.pad.y * 1e6) / 1e6 }),
        `${c.name}: placed at ${pc.rotation}° on the back, the footprint's pad 1 lands on the cathode pad`);
    }
    if (controller === 'under') continue;
    const fab = await fabFiles(json, 'kb'), cpl = fab['kb-cpl.csv'].split('\n').filter((l) => /^D\d+,/.test(l));
    assert.equal(cpl.length, comps.length);
    for (const l of cpl) assert.equal(Number(l.split(',')[4]), 180, `${l}: placed turned half round`);
    // the KiCad board: each diode's pad "1" is on the row's net, pad "2" on its switch's
    const text = (await kicadFiles(json, 'kb'))['kb.kicad_pcb'];
    for (const c of comps) {
      const i = text.indexOf(`"Reference" "${c.name}"`), start = text.lastIndexOf('(footprint', i), end = text.indexOf('\n  (footprint', i);
      const fp = text.slice(start, end > 0 ? end : undefined), net = (n) => fp.match(new RegExp(`\\(pad "${n}"[\\s\\S]*?\\(net \\d+ "([^"]*)"\\)`))?.[1];
      assert.match(net('2'), /^Net-\(K\d+-Pad1\)$/, `${c.name}: KiCad pad 2 is on the switch's net`);
      assert.match(net('1'), /^Net-\(U1-Pad/, `${c.name}: KiCad pad 1 is on the row's net (${net('1')})`);
    }
  }
});

test('a diode in the schematic: its anode at the top of the symbol, its cathode at the bottom', async () => {
  const D = do35('D1', 0, 0, rules('do35'), { sch: { x: 0, y: 0 } });
  const json = await render({ center: { x: 0, y: 0 }, width: 20, height: 20, thickness: 1.6, track: 0.3, parts: [D], traces: [] });
  const ports = portsOf(json, 'D1'), sch = (p) => json.find((e) => e.type === 'schematic_port' && e.source_port_id === p.sp.source_port_id);
  const anode = sch(ports.find((p) => p.sp.port_hints.includes('anode'))), cathode = sch(ports.find((p) => p.sp.port_hints.includes('cathode')));
  assert.ok(anode.center.y > cathode.center.y, 'anode above cathode');
  assert.equal(anode.facing_direction, 'up'); assert.equal(cathode.facing_direction, 'down');
});

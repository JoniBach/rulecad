import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '@rulecad/variables';
import { loadRuleSet } from '@rulecad/cad/rules';
import { grid, keyboard, render, checks, fabFiles, kicadFiles, views } from '@rulecad/pcb';

// A board's values as a design gets them: the published rule sets and the board's own variables
const values = (variables) => resolve({ uses: ['mx', 'pico', 'sod123', 'm2', 'jlcpcb'], variables: {
  track: { value: 'jlcpcb.track_min * 2.5' }, clear: { value: 'jlcpcb.gap_min * 2.5' }, thickness: { value: 'jlcpcb.thickness' },
  margin: { value: 5 }, mcu_gap: { value: 2 }, mcu_side: { value: 'left', choice: ['left', 'right'] }, mcu_row: { value: 0 }, mount_holes: { value: 1 },
  ...variables } }, { load: loadRuleSet }).values;
const build = async (v, rows, cols) => { const { board, matrix } = keyboard(v, grid(rows, cols, v.mx.pitch)); return { json: await render(board), matrix }; };
const failures = (found) => found.filter((f) => f.level === 'fail').map((f) => f.text);

test('a keyboard board with no framework: every track drawn by rule, the checks pass, the fab files and drawings come out', async () => {
  const v = values({ controller: { value: 'beside', choice: ['beside', 'under'] } });
  const { json, matrix } = await build(v, 3, 3);
  assert.deepEqual(failures(await checks(json, v, matrix)), []);
  const count = (t) => json.filter((e) => e.type === t).length;
  assert.equal(count('pcb_trace'), count('source_trace'), 'every connection has a track');
  assert.equal(count('pcb_via'), 0, 'drawn by rule: no vias');
  const fab = await fabFiles(json, 'pad');
  for (const f of ['pad.GTL', 'pad.GBL', 'pad.GKO', 'pad-PTH.DRL', 'pad-bom.csv', 'pad-cpl.csv']) assert.ok(fab[f]?.length > 50, f);
  assert.match(fab['pad-bom.csv'], /"1N4148W","D1,D2,D3,D4,D5,D6,D7,D8,D9","SOD-123"/);
  const kicad = await kicadFiles(json, 'pad');
  assert.match(kicad['pad.kicad_pcb'], /^\(kicad_pcb/);
  const drawn = await views(json);
  assert.ok(drawn.every(([, svg]) => svg.startsWith('<svg')), 'board and schematic drawings');
});

test('the Pico under the board: its connections autorouted around the drawn tracks, cleanly', async () => {
  const v = values({ controller: { value: 'under', choice: ['beside', 'under'] }, margin: { value: -2 }, mount_holes: { value: 0 } });
  const { json, matrix } = await build(v, 4, 6);
  assert.deepEqual(failures(await checks(json, v, matrix)), []);
  const routed = json.filter((e) => e.type === 'pcb_trace').length;
  assert.equal(routed, json.filter((e) => e.type === 'source_trace').length, 'every connection is routed');
  for (const via of json.filter((e) => e.type === 'pcb_via')) assert.ok(json.some((t) => t.pcb_trace_id === via.pcb_trace_id && t.type === 'pcb_trace'), 'each via belongs to a track');
});

// Every board path, start to finish: build (drawn by rule, and autorouted), checks, Gerbers, KiCad, drawings. Run with
// test/watch-loads.mjs to prove none of it loads a web framework (test/fresh-install.sh does).
import { resolve } from '@rulecad/variables';
import { createRequire } from 'node:module';
const loadRuleSet = (name) => createRequire(import.meta.url)(`@rulecad/rules/${name}.json`); // the published sets, read as they are
import { grid, keyboard, render, checks, fabFiles, kicadFiles, views } from '@rulecad/pcb';
for (const controller of ['beside', 'under']) {
  const v = resolve({ uses: ['mx', 'pico', 'sod123', 'm2', 'jlcpcb'], variables: { track: { value: 'jlcpcb.track_min * 2.5' }, clear: { value: 'jlcpcb.gap_min * 2.5' },
    thickness: { value: 'jlcpcb.thickness' }, margin: { value: controller === 'under' ? -2 : 5 }, mcu_gap: { value: 2 }, mcu_side: { value: 'left', choice: ['left', 'right'] },
    mcu_row: { value: 0 }, mount_holes: { value: 0 }, controller: { value: controller, choice: ['beside', 'under'] } } }, { load: loadRuleSet }).values;
  const { board, matrix } = keyboard(v, grid(4, 6, v.mx.pitch)), json = await render(board);
  await checks(json, v, matrix); await fabFiles(json, 'x'); await kicadFiles(json, 'x'); await views(json);
  console.log(controller, 'built, checked, exported, drawn:', json.filter((e) => e.type === 'pcb_trace').length, 'tracks');
}

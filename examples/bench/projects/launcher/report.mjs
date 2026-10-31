// One report for the launcher's flexures: each sized from the rules the way the objects size them, with its strain at
// the travel the design gives it. Run from examples/bench: node projects/launcher/report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { size, report } from '@rulecad/flexures';

const here = path.dirname(fileURLToPath(import.meta.url)), rules = (n) => JSON.parse(fs.readFileSync(path.join(here, '../../rules', `${n}.json`), 'utf8')).rules;
const num = (set, k) => { const v = set[k].value; return typeof v === 'number' ? v : NaN; };
const x1c = rules('x1c'), pla = rules('pla'), L = rules('launcher');
const printer = { line: num(x1c, 'line'), layer: num(x1c, 'layer') }, material = { E: num(pla, 'modulus'), strainLimit: num(L, 'strain_limit'), name: 'PLA' };
const travel = num(L, 'travel'), energy = num(L, 'energy'), draw = (2 * energy * 1000) / travel, width = num(L, 'flexure_width'), tabWidth = 5;
const obj = (n) => JSON.parse(fs.readFileSync(path.join(here, 'objects', `${n}.json`), 'utf8')).variables;
const body = obj('body'), magazine = obj('magazine');

const bow = size.leaf({ travel, force: draw, width, material, maxLength: body.max_leaf.value }, printer);
const searW = width / 2 - tabWidth / 2 - num(x1c, 'fit'), sear = { length: body.sear_len.value, thickness: 3 * printer.line, width: searW, undercut: body.undercut.value, lead: body.lead.value, back: 90 };
const trigger = size.livingHinge({ angle: num(L, 'trigger_travel') / body.finger_arm.value, width, material }, printer);
const feeder = { length: magazine.spring.value, thickness: 2 * printer.line, width: width / 2, turns: magazine.turns.value };
const cap = { length: magazine.hook.value, thickness: 3 * printer.line, width: width / 2, undercut: magazine.undercut.value, lead: magazine.lead.value, back: magazine.back.value };
const stroke = magazine.preload.value + num(L, 'capacity') * num(L, 'disc_t') - (num(L, 'disc_t') + 2 * num(x1c, 'fit')) / 2 + num(x1c, 'fit') / 2 - num(L, 'rail');

console.log(`Draw ${draw.toFixed(1)} N over ${travel} mm stores ${energy} J.`);
console.log(`Bow: a leaf ${bow.length} × ${bow.thickness} × ${bow.width} mm, ${bow.stiffness.toFixed(3)} N/mm, ${(bow.strain * 100).toFixed(2)}% strain at full draw.`);
console.log(`Trigger hinge: a ${trigger.flex} mm strip ${trigger.thickness} mm thick, ${trigger.stiffness.toFixed(0)} N·mm/rad.`);
const r = report([
  { name: 'bow', kind: 'leaf', params: bow, travel, stop: travel },
  { name: 'sear', kind: 'snapHook', params: sear, travel: 4.3 },
  { name: 'trigger hinge', kind: 'livingHinge', params: trigger, angle: num(L, 'trigger_travel') / body.finger_arm.value },
  { name: 'feeder', kind: 'serpentine', params: feeder, travel: stroke },
  { name: 'cap hooks', kind: 'snapHook', params: cap, travel: cap.undercut },
], printer, material);
for (const f of r.findings) console.log(`${f.level === 'fail' ? '✗' : f.level === 'warn' ? '!' : '✓'} ${f.text}`);

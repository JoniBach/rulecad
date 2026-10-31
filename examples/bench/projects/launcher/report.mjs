// One report for the launcher's flexures, from the built parts' own values (so it can't drift from the design): each
// with its strain at the travel or angle the launcher gives it. Run from examples/bench: node projects/launcher/report.mjs
import { size, report } from '@rulecad/flexures';
import { build, locate } from '../../../../packages/cad/lib/design.mjs';

const values = async (name) => (await build(locate(`launcher/${name}`))).values;
const a = await values('action'), m = await values('magazine');
const printer = { line: a.x1c.line, layer: a.x1c.layer }, material = { E: a.pla.modulus, strainLimit: a.strain_limit, name: 'PLA' };

// The bow, as the action sizes it
const bow = size.leaf({ travel: a.travel_max, force: a.draw, width: a.width, material, maxLength: a.max_leaf }, printer);
// The sear: its tip's drop when the trigger is pulled all the way, as the action draws it
const profile = (s) => (3 * s * s - s * s * s) / 2, armEnd = a.tooth_back + a.tooth - a.foot - 2 * a.overlap, searRoot = a.tooth_back - (a.sear_len - a.tooth);
const lift = Math.max(0, (a.pull_max / a.finger_arm) * (armEnd - a.trigger_x) - a.fit) / profile((armEnd - searRoot) / a.sear_len);
const sear = { length: a.sear_len, thickness: a.sear_t, width: a.sear_w, undercut: a.undercut, lead: a.lead, back: 90 };
const hinge = size.livingHinge({ angle: a.pull_max / a.finger_arm, width: a.width, material }, printer);
const feeder = { length: m.spring, thickness: m.thickness, width: m.width, turns: m.turns };
const cap = { length: m.hook, thickness: m.hook_t, width: m.width, undercut: m.undercut, lead: m.lead, back: m.back };

console.log(`Draw ${a.draw.toFixed(1)} N over ${a.travel_max} mm stores ${((a.draw * a.travel_max) / 2000).toFixed(3)} J.`);
console.log(`Bow: a leaf ${bow.length} × ${bow.thickness} × ${bow.width} mm, ${bow.stiffness.toFixed(3)} N/mm, ${(bow.strain * 100).toFixed(2)}% strain at full draw.`);
console.log(`Sear: its tip drops ${lift.toFixed(2)} mm at full pull, past its ${a.undercut} mm undercut${lift > a.undercut ? '' : ': NOT ENOUGH, it would not let go'}.`);
console.log(`Trigger hinge: a ${hinge.flex} mm strip ${hinge.thickness} mm thick, ${hinge.stiffness.toFixed(0)} N·mm/rad.`);
const r = report([
  { name: 'bow', kind: 'leaf', params: bow, travel: a.travel_max, stop: a.travel_max },
  { name: 'sear', kind: 'snapHook', params: sear, travel: +lift.toFixed(2) },
  { name: 'trigger hinge', kind: 'livingHinge', params: hinge, angle: a.pull_max / a.finger_arm },
  { name: 'feeder', kind: 'serpentine', params: feeder, travel: +(m.preload + m.stroke).toFixed(2) },
  { name: 'cap hooks', kind: 'snapHook', params: cap, travel: m.undercut },
], printer, material);
for (const f of r.findings) console.log(`${f.level === 'fail' ? '✗' : f.level === 'warn' ? '!' : '✓'} ${f.part ? `${f.part}: ` : ''}${f.text}`);
process.exitCode = r.ok ? 0 : 1;

// Writes assemblies/card-mounted.json: every gear on its pin on the card, each pair meshed, from the card's variables
// and card-layout.mjs (the card reads the same layout).
//   node projects/benchmarks/make-card.mjs   (from examples/bench)
import fs from 'node:fs';
import * as gears from '@rulecad/gears';
import { layout } from './card-layout.mjs';

const here = new URL('./', import.meta.url), vars = JSON.parse(fs.readFileSync(new URL('objects/gear-card.json', here), 'utf8')).variables, v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, x.value]));
const L = layout(v, gears), items = [{ id: 'card', object: 'gear-card' }], joints = [];
for (const p of L.pins) {
  items.push({ id: p.id, object: 'card-gear', set: { module: p.module, backlash: p.backlash, dots: p.dots } });
  joints.push({ id: p.id, type: 'revolute', parent: { item: 'card', at: [+p.x.toFixed(4), +p.y.toFixed(4), v.thick + 0.3], axis: [0, 0, 1] }, child: `${p.id}.axis`, min: -360, max: 360,
    ...(p.meshes ? { mesh: { with: p.meshes, module: p.module, teeth: [v.teeth, v.teeth], shift: [v.shift, v.shift], backlash: p.backlash } } : {}) });
}
fs.writeFileSync(new URL('assemblies/card-mounted.json', here), JSON.stringify({ title: 'Gear card, mounted', kind: 'fit', description: 'Every gear on its pin, each pair meshed.', items, joints }, null, 2) + '\n');
console.log(`${items.length} items, ${joints.length} joints, card ${L.size.map((x) => x.toFixed(1)).join(' × ')} mm`);

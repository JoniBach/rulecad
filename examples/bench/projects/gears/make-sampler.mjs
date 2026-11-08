// Writes assemblies/sampler-mounted.json: every sampler gear on its pin, each pair meshed, the rack and the ring with
// their pinions, from the plate's own variables and sampler-layout.mjs (the plate reads the same layout).
//   node projects/gears/make-sampler.mjs   (from examples/bench)
import fs from 'node:fs';
import * as gears from '@rulecad/gears';
import { evaluate } from '@rulecad/variables';
import { layout } from './sampler-layout.mjs';

const here = new URL('./', import.meta.url), json = (f) => JSON.parse(fs.readFileSync(new URL(f, here), 'utf8'));
const rules = JSON.parse(fs.readFileSync(new URL('../../rules/x1c.json', here), 'utf8')).rules;
const vars = json('objects/sampler.json').variables, values = {};
const value = (k) => {
  if (k in values) return values[k];
  if (k.startsWith('x1c.')) { const r = rules[k.slice(4)]; return typeof r.value === 'number' ? r.value : evaluate(r.value, (n) => value(n.includes('.') ? n : `x1c.${n}`)); }
  const raw = vars[k].value;
  return (values[k] = typeof raw === 'number' ? raw : evaluate(raw, value));
};
for (const k of Object.keys(vars)) value(k);
const L = layout(values, gears);
const at = (x, y) => [+x.toFixed(4), +y.toFixed(4), 'plate.thick'];
const items = [{ id: 'plate', object: 'sampler' }], joints = [];
for (const p of L.pins) {
  items.push({ id: p.id, object: 'sampler-gear', set: { module: p.module, backlash: p.backlash, dots: p.dots } });
  joints.push({ id: p.id, type: 'revolute', parent: { item: 'plate', at: at(p.x, p.y), axis: [0, 0, 1] }, child: `${p.id}.axis`, min: -360, max: 360,
    ...(p.meshes ? { mesh: { with: p.meshes, module: p.module, teeth: [values.teeth, values.teeth], backlash: p.backlash } } : {}) });
}
items.push({ id: 'rack', object: 'sampler-rack' }, { id: 'ring', object: 'sampler-ring' });
joints.push({ id: 'rack', type: 'prismatic', parent: { item: 'plate', at: at(L.rack.x, L.rack.y), axis: [1, 0, 0] }, child: 'rack.slide', min: -L.rack.travel, max: L.rack.travel,
  mesh: { with: 'rack-pinion', module: 1, teeth: [values.teeth, values.rack_teeth], backlash: values.check_backlash } });
joints.push({ id: 'ring', type: 'revolute', parent: { item: 'plate', at: at(L.ring.x, L.ring.y), axis: [0, 0, 1] }, child: 'ring.axis', min: -360, max: 360,
  mesh: { with: 'ring-pinion', module: 1, teeth: [values.teeth, values.ring_teeth], backlash: values.check_backlash, ring: true } });
// the rack's pinion turns no further than the rack can slide
joints.find((j) => j.id === 'rack-pinion').min = -Math.floor((L.rack.travel / (Math.PI * values.teeth)) * 360);
joints.find((j) => j.id === 'rack-pinion').max = Math.floor((L.rack.travel / (Math.PI * values.teeth)) * 360);
const out = { title: 'Gear sampler, mounted', kind: 'fit', description: 'Every sampler gear on the pin its label names, each pair meshed; the rack on its rail and the ring in its lip, each driven by its pinion. Written by make-sampler.mjs from sampler-layout.mjs, which the plate reads too.', items, joints };
fs.writeFileSync(new URL('assemblies/sampler-mounted.json', here), JSON.stringify(out, null, 2) + '\n');
console.log(`${items.length} items, ${joints.length} joints`);

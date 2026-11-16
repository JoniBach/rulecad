// The fixings migration's guard: screw dimensions typed by hand are counted by place (scripts/fixings-inventory.mjs)
// and held to the count recorded in test/fixings-inventory.json. A count that rises fails, naming what was added; one
// that falls fails too, until the record is lowered with it, so each migration step writes down what it moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inventory, against, kindOf, filesOf, RECORD, ROOT, DELIBERATE, SWEPT } from '../scripts/fixings-inventory.mjs';

const record = JSON.parse(fs.readFileSync(RECORD, 'utf8'));

test('the screw dimensions typed by hand are as many as recorded, place by place', () => {
  const now = inventory(), moved = against(now, record);
  const said = moved.map(({ place, kind, was, now: is }) => is > was
    ? `${place}: ${is - was} more ${kind} (${now.items.filter((x) => x.place === place && x.kind === kind).map((x) => `${x.block || x.file.split('/').pop()} ${x.name}`).join(', ')}): name the thread through v.fixings instead`
    : `${place}: ${was - is} fewer ${kind}, well done: lower the record with node scripts/fixings-inventory.mjs --record`);
  assert.deepEqual(said, []);
});

test('the inventory counts what 2026-11-14 counted: 116 named in 54 objects, 66 in the worked examples, and the motors table', () => {
  const r = inventory(), named = r.items.filter((x) => x.kind === 'named');
  // (the counts of the day the plan was written, less nothing yet migrated; a later migration step lowers these with the record)
  assert.ok(named.filter((x) => !x.place.endsWith('.md')).length <= 116);
  assert.ok(new Set(named.filter((x) => !x.place.endsWith('.md')).map((x) => x.file)).size <= 54);
  assert.ok(named.filter((x) => x.place === 'packages/cad/EXAMPLES.md').length <= 66);
  assert.ok(r.places['packages/motors'] == null || r.places['packages/motors'].table <= 4);
  // chapter 15 reads v.fixings: its plate names M4 countersinks, and is not a typed screw
  assert.ok(!r.items.some((x) => x.block === 'projects/fix/objects/plate.json'), 'a design that reads v.fixings is moved');
});

test('a typed 2.9 is caught: as a named pilot, a thread set read by hand, or a bare pilot', () => {
  assert.equal(kindOf({ value: 2.9, unit: 'mm', rule: 'An M3 self-tapping pilot' }), 'named');
  assert.equal(kindOf({ value: 'm3.clearance + x1c.hole_comp', unit: 'mm', rule: 'The screw passes' }), 'reads');
  assert.equal(kindOf({ value: 2.9, unit: 'mm', rule: 'A self-tapping pilot' }), 'typed');
  assert.equal(kindOf({ value: '6-32', rule: 'Its thread' }), null, 'a value is not a rule');
  assert.equal(kindOf({ value: 20, unit: 'mm', rule: 'Radius of the bolt circle' }), null, 'a layout is not a screw');
  assert.equal(kindOf({ value: 12, unit: 'mm', rule: 'Half the M12-wide slot' }), 'named');
  // one more in a design: the count rises, by name, at that place
  const files = filesOf(ROOT), extra = 'examples/bench/projects/bench/objects/added.json';
  const read = (f) => (f === extra ? JSON.stringify({ name: 'added', variables: { pilot: { value: 2.9, unit: 'mm', rule: 'A self-tapping pilot for the lid' } } }) : fs.readFileSync(`${ROOT}/${f}`, 'utf8'));
  const rose = against(inventory({ files: [...files, extra], read }), record).filter((x) => x.now > x.was);
  assert.deepEqual(rose.map((x) => [x.place, x.kind, x.now - x.was]), [['examples/bench/projects/bench', 'typed', 1]]);
  // and in a document, a JSON block for an object
  const doc = 'docs/added.md', text = '# Added\n\n```json projects/x/objects/y.json\n{ "variables": { "hole": { "value": 2.9, "unit": "mm", "rule": "M3 pilot" } } }\n```\n';
  const inDoc = against(inventory({ files: [...files, doc], read: (f) => (f === doc ? text.replace(/\n/g, '\r\n') : read(f)) }), record).filter((x) => x.now > x.was);
  assert.deepEqual(inDoc.map((x) => [x.place, x.kind]), [['docs/added.md', 'named']], 'with Windows line endings too');
});

test('a screw size kept on purpose has its reason, names a variable still in its file, and is counted nowhere', () => {
  for (const d of DELIBERATE) {
    assert.ok(typeof d.why === 'string' && d.why.length > 40, `${d.file} ${d.name}: give the reason it stays typed`);
    const o = JSON.parse(fs.readFileSync(`${ROOT}/${d.file}`, 'utf8'));
    assert.ok(o.variables?.[d.name], `${d.file} has no variable ${d.name}: take it out of DELIBERATE`);
  }
  for (const s of SWEPT) assert.ok(fs.existsSync(`${ROOT}/${s.place}`) && s.why.length > 40, `${s.place}: a place swept, with what was found there`);
  const r = inventory();
  assert.deepEqual(r.deliberate.map((x) => x.name).sort(), ['hole_d', 'hole_keepout']);
  assert.ok(!r.items.some((x) => DELIBERATE.some((d) => d.file === x.file && d.name === x.name)));
  // the same variable in another object is counted: the reason is for that one place
  const files = filesOf(ROOT), extra = 'examples/bench/projects/bench/objects/added.json';
  const read = (f) => (f === extra ? JSON.stringify({ name: 'added', variables: { hole_d: { value: 2.1, unit: 'mm', rule: 'For M2 screws' } } }) : fs.readFileSync(`${ROOT}/${f}`, 'utf8'));
  assert.deepEqual(against(inventory({ files: [...files, extra], read }), record).map((x) => [x.place, x.kind, x.now - x.was]), [['examples/bench/projects/bench', 'named', 1]]);
});

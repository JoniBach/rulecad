import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keys, width, depth, project } from '@rulecad/keyboard-layout';

const layout = {
  defaults: { legend: '@label' },
  rows: [
    { row: 'R1', keys: ['Q', 'W', ['E', 2]] },
    [['Tab', 1.5], { label: 'A', homing: true }],
  ],
};

test('keys: centres in key units, rows starting at the same left edge, centred on 0', () => {
  const k = keys(layout);
  assert.equal(width(layout), 4);
  assert.equal(depth(layout), 2);
  assert.deepEqual(k.map((x) => [x.label, x.x, x.y]), [['Q', -1.5, 0.5], ['W', -0.5, 0.5], ['E', 1, 0.5], ['Tab', -1.25, -0.5], ['A', 0, -0.5]]);
});

test('keys: properties from defaults, rows and keys; @label is the key\'s label', () => {
  const [q, , , tab, a] = keys(layout);
  assert.equal(q.row, 'R1');
  assert.equal(tab.row, 1); // a plain list: its index
  assert.equal(a.legend, 'A');
  assert.equal(a.homing, true);
});

test('project: only the fields something reads, so other edits are not changes to it', () => {
  const before = project(layout, ['homing']);
  const edited = { ...layout, defaults: { legend: 'x' } };
  assert.deepEqual(project(edited, ['homing']), before);
});

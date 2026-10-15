import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keys, width, depth, project, fromKLE } from '@rulecad/keyboard-layout';

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

test('gaps: space between keys moves the keys after it and counts in the width', () => {
  const l = { rows: [['Esc', { gap: 0.5 }, 'F1'], [['Tab', 2.5]]] };
  assert.equal(width(l), 2.5);
  assert.deepEqual(keys(l).map((k) => [k.label, k.col, k.x]), [['Esc', 0, -0.75], ['F1', 1, 0.75], ['Tab', 0, 0]]);
});

test('fromKLE: rows, widths, gaps and shifted legends from keyboard-layout-editor.com', () => {
  const raw = '["Esc",{x:0.5},"F1"],\n["~\\n`","!\\n1",{w:2},"Backspace"],\n[{w:1.5},"Tab",{y:0.25},"Q"]';
  const { layout, notes } = fromKLE(raw);
  assert.deepEqual(layout.rows, [['Esc', { gap: 0.5 }, 'F1'], [{ label: '`', u: 1, legend2: '~' }, { label: '1', u: 1, legend2: '!' }, ['Backspace', 2]], [['Tab', 1.5], 'Q']]);
  assert.deepEqual(notes, ['rows nudged up or down are placed one row apart']);
  assert.equal(width(layout), 4);
  assert.deepEqual(fromKLE([{ name: 'Mine' }, ['A']]).layout, { title: 'Mine', rows: [['A']] });
  assert.throws(() => fromKLE('hello'), /isn't keyboard-layout-editor data/);
});

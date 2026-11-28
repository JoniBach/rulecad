// cad's tests of mechanisms checked as wholes: a lamina mechanism and a folding sheet. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspace, object, CAD } from './helpers.mjs';

test('a lamina mechanism: its own checks in cad check (through the sandbox and the cache), its sequence as an animated SVG', () => {
  const { ws, cad, done } = workspace();
  try {
    const n = (value, rule) => ({ value, unit: 'mm', rule });
    const variables = { len: n(30, 'The leaf'), t: n(0.84, 'Its thickness'), h: n(6, 'The print\'s height'), gap: n(0.3, 'The gap that prints apart'),
      post: { ...n(0.42, 'How far the stop post stands from the tip block'), tweak: { min: 0.05, max: 2 } }, bend: n(0.3, 'How far the state bends it'), block: n(4, 'The tip block and the root') };
    object(ws, 'demo/flick', { uses: ['pla'], variables, variants: { fused: { post: 0.1 } } }, `import jscad from '@jscad/modeling'
const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })
export function main (v) {
  const f = v.flexures, b = v.block, tipTop = b / 2
  return f.lamina({
    height: v.h, gap: v.gap, material: f.flexureMaterial({ modulus: v.pla.modulus, strength: v.pla.strength }),
    ground: [rect(0 - b, 0 - b, 0, b), rect(v.len, tipTop + v.post, v.len + b, tipTop + v.post + b)],
    bodies: { tip: rect(v.len - b / 2, 0 - b / 2, v.len + b, tipTop) },
    joints: { leaf: { kind: 'leaf', params: { length: v.len, thickness: v.t }, at: [0 - 1, 0], from: 'ground', to: 'tip' } },
    states: { bent: { leaf: v.bend } }, sequence: ['rest', 'bent', 'rest'],
  })
}
`);
    const ok = cad.refused('its strain peaks at a square corner', 'check', 'demo/flick'); // (its leaf's square root fails the corner check; what is tested here passes)
    assert.match(ok, /✓ everything clears what it isn't joined to by 0\.3 mm/);
    assert.match(ok, /✓ leaf: stopped by the ground at [\d.]+ mm, before its limit/);
    assert.match(ok, /✓ rest to bent: clear all the way/);
    assert.match(cad.refused('its strain peaks at a square corner', 'check', 'demo/flick'), /✓ rest to bent: clear all the way/); // the same from the cache
    // The physics, the slow stage, is kept apart (.cache/stages): the sandbox handed it back and the tool wrote it
    const stages = path.join(ws, '.cache', 'stages'), kept = fs.readdirSync(stages);
    assert.ok(kept.some((f) => f.startsWith('physics-')) && JSON.parse(fs.readFileSync(path.join(stages, kept.find((f) => f.startsWith('physics-'))), 'utf8')).transitions, `the physics kept as JSON: ${kept.join(', ')}`);
    // A rule's words aren't what a build is made from: the build is found in the cache, and so is the physics
    const file = path.join(ws, 'projects', 'demo', 'objects', 'flick.json'), json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.variables.len.rule = 'The leaf, reworded'; fs.writeFileSync(file, JSON.stringify(json, null, 2));
    const before = kept.length;
    assert.match(cad.refused('its strain peaks at a square corner', 'check', 'demo/flick'), /✓ rest to bent: clear all the way/);
    assert.equal(fs.readdirSync(stages).length, before, 'reworded: nothing computed again');
    json.variables.bend.value = 0.2; fs.writeFileSync(file, JSON.stringify(json, null, 2));
    assert.match(cad.refused('its strain peaks at a square corner', 'check', 'demo/flick'), /✓ rest to bent: clear all the way/);
    assert.ok(fs.readdirSync(stages).length > before, 'a value changed: the physics made again');
    cad.refused(/✗ the ground and tip are 0\.1 mm apart at rest: under the 0\.3 mm gap, they print as one/, 'check', 'demo/flick:fused');
    const outs = cad('animate', 'demo/flick').trim().split('\n'), out = outs.find((l) => l.endsWith('.svg'));
    assert.ok(out.endsWith('flick-sequence.svg') && /<svg[\s\S]*<animate attributeName="display"[\s\S]*rest to bent/.test(fs.readFileSync(out, 'utf8')));
    // and as data, every frame's shapes and what acts on them, with a page that plays it
    const data = JSON.parse(fs.readFileSync(outs.find((l) => l.endsWith('-sequence.json')), 'utf8'));
    assert.ok(data.frames.length > 2 && data.ground.length && data.kinds.ground === 'ground', 'the frames and the frame');
    assert.ok(data.frames.some((fr) => fr.forces?.some((f) => f.kind === 'hand') && fr.energy && fr.strain), 'what acts each frame: the hand, the energy and strain in each flexure');
    const page = fs.readFileSync(outs.find((l) => l.endsWith('-player.html')), 'utf8');
    assert.ok(/<canvas id="view">/.test(page) && page.includes('"frames":'), 'a page that plays it, its data inside');
    object(ws, 'demo/cube', { variables: { w: n(10, 'Width') } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n");
    cad.refused(/isn't a lamina mechanism/, 'animate', 'demo/cube');
  } finally { done(); }
});

test('a folding sheet in an assembly: the bench tray checked flat and folded, a block that clears it flat caught by the walls\' lands once they stand', () => {
  const { ws, cad, done } = workspace({ printer: 'x1c' });
  const bench = fileURLToPath(new URL('../../examples/bench/', CAD));
  try {
    for (const d of ['rules', 'projects/flexures']) fs.cpSync(path.join(bench, d), path.join(ws, d), { recursive: true });
    const check = (name) => cad.findings('check', name, '--json'); // (pass or fail: the findings are what is read)
    // the tray alone: its own fold check runs with the print checks, every joint within PETG's limit at 90°
    const t = check('flexures/tray');
    assert.deepEqual(t.filter((x) => x.code === 'fold.strain').map((x) => x.level), ['pass', 'pass', 'pass', 'pass']);
    assert.equal(t.find((x) => x.code === 'fold.clearance').level, 'pass'); assert.equal(t.find((x) => x.code === 'shape.pieces')?.level ?? 'pass', 'pass');
    // the assembly: its pose sets tray.fold, so the fit is checked flat and with the walls standing
    let a = check('flexures/tray-fit');
    assert.deepEqual(a.find((x) => x.code === 'poses').refs.poses, ['flat', 'folded']);
    assert.deepEqual(a.filter((x) => x.code === 'fit').map((x) => x.level), ['pass'], 'the block clears in both (a fit passing in every pose is said once)');
    // a 50 mm block (the whole base) clears the sheet flat, 0.5 mm above it, but standing, the lands rise into it
    const file = path.join(ws, 'projects/flexures/objects/block.json'), b = JSON.parse(fs.readFileSync(file, 'utf8'));
    b.variables.side.value = 50; fs.writeFileSync(file, JSON.stringify(b, null, 2));
    a = check('flexures/tray-fit');
    assert.deepEqual(a.filter((x) => x.code === 'fit').map((x) => [x.refs.pose, x.level]).sort(), [['flat', 'pass'], ['folded', 'warn']]);
    assert.equal(a.find((x) => x.code === 'overlap' && x.refs.pose === 'folded').level, 'fail', 'folded, the tray and the block overlap');
  } finally { done(); }
});

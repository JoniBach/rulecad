import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('./bin/cad.mjs', import.meta.url));
const ROOT_MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url)); // stands in for npm install @jscad/modeling

// A fresh workspace, as the README's quick start makes one
function workspace(config) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-'));
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ type: 'module' }));
  if (config) fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify(config));
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction');
  const env = { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') }; // (the user's own trust list, kept out of their home)
  const cad = (...a) => { try { return execFileSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', stdio: 'pipe', env }); } catch (e) { return `${e.stdout}${e.stderr}`; } };
  return { ws, cad, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

test('cad rules check, draw and draft: a set held to its rules, drawn from them, and a datasheet\'s figures offered, never trusted', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('rules', 'check', 'nema17'), /1 of 1 rule sets pass/);
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'rules/bad.json'), JSON.stringify({ name: 'bad', rules: { width: { value: 3, unit: 'mm', rule: 'A width in mm', kind: 'guess', checked: 'soon' } } }));
    const r = spawnSync('node', [BIN, 'rules', 'check', 'bad'], { cwd: ws, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(r.stdout, /kind "guess"/); assert.match(r.stdout, /has no source/); assert.match(r.stdout, /YYYY-MM-DD/);
    const check = JSON.parse(cad('rules', 'check', 'pico', '--json'));
    assert.deepEqual(check.map((x) => [x.name, x.findings, x.notes.map((n) => [n.level, n.code, n.rule, n.values.alias])]), [['pico', [], [['info', 'rules.alias', 'length', 'body_length'], ['info', 'rules.alias', 'width', 'body_width'], ['info', 'rules.alias', 'mount_hole', 'mount_hole_diameter']]]], 'an alias is a note, never a failure');
    // a workspace's copy of a thread set from before the sets were widened (rules 0.3.9's m3): it checks clean, is
    // used as it is, and is told what the kit's set has that it lacks
    const old = { _doc: 'M3 socket head screws, for motor faces. kind as in x1c.json.', name: 'm3', interface: { screw_clearance: 'clearance', screw_head: 'head', screw_head_height: 'head_height' }, rules: {
      clearance: { value: 3.4, unit: 'mm', rule: 'Clearance hole for an M3 screw, medium fit', kind: 'spec', source: 'ISO 273 medium fit', checked: '2026-11-08' },
      head: { value: 5.5, unit: 'mm', rule: 'M3 socket head cap screw head diameter', kind: 'spec', source: 'ISO 4762', checked: '2026-11-08' },
      head_height: { value: 3, unit: 'mm', rule: 'M3 socket head cap screw head height', kind: 'spec', source: 'ISO 4762', checked: '2026-11-08' } } };
    fs.writeFileSync(path.join(ws, 'rules/m3.json'), JSON.stringify(old, null, 2));
    const copy = spawnSync('node', [BIN, 'rules', 'check', 'm3'], { cwd: ws, encoding: 'utf8' });
    assert.equal(copy.status, 0, copy.stdout); assert.match(copy.stdout, /1 of 1 rule sets pass/);
    assert.match(copy.stdout, /m3: NOTE {2}clearance is also read as screw_clearance, head is also read as screw_head, head_height is also read as screw_head_height {2}\(rules\.alias\)/);
    assert.match(copy.stdout, /m3: NOTE {2}your copy is used as it is; the kit's m3 now also has thread_form, thread, .* and \d+ more \(--json lists them\): copy any you want into rules\/m3\.json, or delete it to read the kit's own {2}\(rules\.new\)/);
    const added = JSON.parse(cad('rules', 'check', 'm3', '--json'))[0].notes.find((n) => n.code === 'rules.new').refs.rules;
    for (const k of ['pilot', 'nut_flats', 'insert_hole', 'lengths']) assert.ok(added.includes(k), `told of ${k}`);
    assert.ok(!added.includes('clearance'), 'not told of what it has');
    fs.rmSync(path.join(ws, 'rules/m3.json'));
    // drawn from its figures; a set that says nothing of its shape is refused, not drawn wrong
    cad('rules', 'draw', 'nema17');
    const svg = fs.readFileSync(path.join(ws, 'nema17.svg'), 'utf8');
    for (const t of ['42.3', 'holes 31', 'boss Ø22', 'shaft 24', 'flat 15', '4 × M3, 4.5 deep']) assert.ok(svg.includes(t), `the drawing shows ${t}`);
    assert.equal(spawnSync('node', [BIN, 'rules', 'draw', 'x1c'], { cwd: ws, encoding: 'utf8' }).status, 1);
    // a small PDF with figures in its text, and one with none (a scan): only ever estimates
    const pdf = (body) => Buffer.from(`%PDF-1.4\n1 0 obj<<>>stream\n${body}\nendstream\nendobj\n`, 'latin1');
    fs.writeFileSync(path.join(ws, 'sheet.pdf'), pdf('BT (Shaft 5 mm, torque 0.59 N m) Tj ET'));
    assert.match(cad('rules', 'draft', 'mine', '--from', 'sheet.pdf'), /2 figures/);
    const draft = JSON.parse(fs.readFileSync(path.join(ws, 'rules/mine.json'), 'utf8'));
    assert.deepEqual(Object.values(draft.rules).map((x) => [x.value, x.kind]), [[5, 'estimate'], [0.59, 'estimate']]);
    fs.writeFileSync(path.join(ws, 'scan.pdf'), pdf('q 1 0 0 1 0 0 cm /Im0 Do Q'));
    assert.match(cad('rules', 'draft', 'scan', '--from', 'scan.pdf'), /read it by eye/);
    assert.ok(!fs.existsSync(path.join(ws, 'rules/scan.json')));
    // a thread set: held to the thread vocabulary and to sense, and drawn as the screw in each head form it has, its nuts and its holes
    assert.match(cad('rules', 'check', 'm1_6', 'm3', 'm12', 'unc_6_32', 'unc_1_4_20'), /5 of 5 rule sets pass/);
    cad('rules', 'draw', 'm3');
    const m3 = fs.readFileSync(path.join(ws, 'm3.svg'), 'utf8');
    for (const t of ['socket cap', 'Ø5.5', 'key 2.5', 'button', 'Ø5.7', 'countersunk 90°', 'Ø6.72', 'hexagon nut', 'square nut', 'lock nut', 'washer', 'Ø7', 'tap drill', 'Ø2.5', 'close', 'Ø3.2', 'normal', 'Ø3.4', 'loose', 'Ø3.6', 'M3, metric: pitch 0.5', 'socket cap lengths: 5, 6, 8, 10, 12, 16, 20, 25, 30', 'class 8.8: proof stress 580 MPa', 'insert hole']) assert.ok(m3.includes(`>${t}`), `the M3 drawing shows ${t}`);
    cad('rules', 'draw', 'm1_6'); assert.ok(!fs.readFileSync(path.join(ws, 'm1_6.svg'), 'utf8').includes('>button'), 'a head form a size is not made in is not drawn');
    cad('rules', 'draw', 'unc_6_32'); for (const t of ['6-32 UNC, unified', 'countersunk 82°', 'Ø5.74']) assert.ok(fs.readFileSync(path.join(ws, 'unc_6_32.svg'), 'utf8').includes(`>${t}`), `the 6-32 drawing shows ${t}`);
    const thin = JSON.parse(fs.readFileSync(new URL('../rules/m3.json', import.meta.url), 'utf8')); thin.name = 'thin'; thin.rules.head.value = 3.5; thin.rules.lengths.value = [6, 5, 8];
    fs.writeFileSync(path.join(ws, 'rules/thin.json'), JSON.stringify(thin));
    const t = spawnSync('node', [BIN, 'rules', 'check', 'thin', '--json'], { cwd: ws, encoding: 'utf8' });
    assert.equal(t.status, 1); assert.deepEqual(JSON.parse(t.stdout)[0].findings.map((x) => [x.code, x.rule]), [['rules.order', 'lengths'], ['rules.order', 'head']]);
    assert.match(JSON.parse(t.stdout)[0].findings[1].text, /head \(3.5\) is not larger than clearance_loose \(3.6\): a cap head is wider than the loosest clearance hole/);
    // the drawings in the rules package are what the sets say today
    for (const f of fs.readdirSync(new URL('../rules/drawings/', import.meta.url))) { cad('rules', 'draw', f.slice(0, -4), '--out', 'x.svg'); assert.equal(fs.readFileSync(path.join(ws, 'x.svg'), 'utf8'), fs.readFileSync(new URL(`../rules/drawings/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'), `${f} is stale: cad rules draw it again`); } // (git on Windows checks it out with CRLF)
  } finally { done(); }
});

test('cad rules for a beam\'s profile: a draft filled from a maker\'s sheet passes the check and draws as the sheet does; slots, bores and section figures are held to sense', () => {
  const { ws, cad, done } = workspace();
  try {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(ws, f), 'utf8')), write = (f, x) => fs.writeFileSync(path.join(ws, f), JSON.stringify(x, null, 2)), run = (...a) => spawnSync('node', [BIN, ...a], { cwd: ws, encoding: 'utf8' });
    const vocabulary = JSON.parse(fs.readFileSync(new URL('../rules/vocabulary.json', import.meta.url), 'utf8')), published = (n) => JSON.parse(fs.readFileSync(new URL(`../rules/${n}.json`, import.meta.url), 'utf8'));
    // the published sets: three makers' 20 mm profiles pass, and a warning is said without failing the set
    assert.match(cad('rules', 'check', 'profile-2020-misumi-hfs5', 'profile-2040-misumi-hfs5', 'slot-6-misumi', 'al6n01-t5'), /^4 of 4 rule sets pass\n$/);
    const bosch = run('rules', 'check', 'profile-2020-bosch', 'profile-2020-motedis-b6');
    assert.equal(bosch.status, 0); assert.match(bosch.stdout, /profile-2020-bosch: passes, \d to know\n {2}NOTE {2}the bore \(Ø5\.5\) leaves 38% of a full M6 thread/); assert.match(bosch.stdout, /WARN {2}area: the sheet says 160 mm², the drawn outline comes to 171\.3 \(\+7\.1%, more than 5%\)/); assert.match(bosch.stdout, /2 of 2 rule sets pass \(2 with something to know\)/);
    // plain sections and the custom family: no sheet, so nothing to differ from, and each draws with its figures worked out
    assert.match(cad('rules', 'check', 'profile-tube-al-25x25x2', 'profile-tube', 'profile-round-bar-steel-10', 'profile-custom'), /^4 of 4 rule sets pass\n$/);
    cad('rules', 'draw', 'profile-tube-al-25x25x2'); const tubeSvg = fs.readFileSync(path.join(ws, 'profile-tube-al-25x25x2.svg'), 'utf8');
    assert.match(tubeSvg, />wall 2</); assert.match(tubeSvg, />tube, al6063-t5</); assert.match(tubeSvg, />not given</); assert.match(tubeSvg, />184</, 'its area, worked out: 25² less 21²');
    cad('rules', 'draw', 'profile-custom'); assert.match(fs.readFileSync(path.join(ws, 'profile-custom.svg'), 'utf8'), />drawn from its outline: drawn for the kit: a 30 x 30 x 3 mm T section</);
    // a custom profile of your own: a set with family custom and its outline beside it; without the outline it is refused by name
    fs.mkdirSync(path.join(ws, 'rules/outlines'), { recursive: true });
    write('rules/profile-hat.json', { name: 'profile-hat', part: 'profile', rules: { family: { value: 'custom', rule: 'A hat section, folded from 2 mm sheet', kind: 'measured', source: 'my own bar', checked: '2026-11-15' }, width: { value: 40, unit: 'mm', rule: 'Across the section', kind: 'measured', source: 'my own bar', checked: '2026-11-15' }, height: { value: 20, unit: 'mm', rule: 'Up the section', kind: 'measured', source: 'my own bar', checked: '2026-11-15' } } });
    const noOutline = run('rules', 'check', 'profile-hat'); assert.equal(noOutline.status, 1); assert.match(noOutline.stdout, /FAIL {2}profile-hat: a custom profile is its outline, and none came with it.*rules\/outlines\/profile-hat\.json.*\(profile\.model\)/);
    write('rules/outlines/profile-hat.json', { name: 'profile-hat', source: 'traced from my own bar', licence: 'my own measurement', loops: [[[-20, -10], [-10, -10], [-10, 8], [10, 8], [10, -10], [20, -10], [20, -8], [12, -8], [12, 10], [-12, 10], [-12, -8], [-20, -8]]] });
    assert.match(cad('rules', 'check', 'profile-hat'), /^1 of 1 rule sets pass\n$/);
    cad('rules', 'draw', 'profile-hat'); assert.match(fs.readFileSync(path.join(ws, 'profile-hat.svg'), 'utf8'), />152</, 'the hat\'s area from its outline');
    fs.rmSync(path.join(ws, 'rules/outlines'), { recursive: true }); fs.rmSync(path.join(ws, 'rules/profile-hat.json'));
    // a draft: every field of the vocabulary, each an estimate, and it checks and draws as it stands
    assert.match(cad('rules', 'draft', 'profile', 'my-2020'), /a draft profile in rules.my-2020\.json, every figure an estimate/);
    const draft = read('rules/my-2020.json');
    assert.deepEqual(Object.keys(draft.rules), Object.keys(vocabulary.drafts.profile)); assert.equal(draft.part, 'profile');
    for (const [k, r] of Object.entries(draft.rules)) { assert.equal(r.kind, 'estimate', k); assert.match(r.rule, /^DRAFT, not read from a sheet yet: /); assert.equal(r.unit, vocabulary.fields[k].unit, `${k} in its unit`); }
    assert.match(cad('rules', 'check', 'my-2020'), /1 of 1 rule sets pass/);
    assert.match(cad('rules', 'draft', 'profile', 'my-2020'), /already exists \(--force replaces it\)/);
    assert.match(cad('rules', 'draft', 'profile'), /usage: cad rules draft profile <name>/);
    cad('rules', 'draft', 'slot', 'my-slot'); cad('rules', 'draft', 'slot_nut', 'my-nut');
    assert.deepEqual(Object.keys(read('rules/my-slot.json').rules), Object.keys(vocabulary.drafts.slot)); assert.deepEqual(Object.keys(read('rules/my-nut.json').rules), Object.keys(vocabulary.drafts.slot_nut));
    assert.match(cad('rules', 'check', 'my-slot', 'my-nut'), /2 of 2 rule sets pass/);
    cad('rules', 'draw', 'my-slot'); for (const t of ['>6<', '>12<', '>2<', 'track 9', 'floor 6']) assert.ok(fs.readFileSync(path.join(ws, 'my-slot.svg'), 'utf8').includes(t), `the slot's drawing shows ${t}`);
    cad('rules', 'draw', 'my-nut'); assert.ok(fs.readFileSync(path.join(ws, 'my-nut.svg'), 'utf8').includes('slide-in nut, M5, for slot-6'));
    // a person fills the drafts from MISUMI's page for HFS5-2020: the figures the sheet has, its page as the source, the rest deleted
    const sheet = published('profile-2020-misumi-hfs5').rules, slotSheet = published('slot-6-misumi').rules, fill = (d, from, extra = {}) => { for (const k of Object.keys(d.rules)) { if (from[k]) d.rules[k] = from[k]; else delete d.rules[k]; } Object.assign(d.rules, extra); return d; };
    write('rules/my-slot.json', fill(read('rules/my-slot.json'), slotSheet, { nut_family: { ...slotSheet.nut_family, value: 'my-slot' } }));
    write('rules/my-2020.json', fill(draft, sheet, { slot: { ...sheet.slot, value: 'my-slot' } }));
    assert.match(cad('rules', 'check', 'my-2020', 'my-slot'), /^2 of 2 rule sets pass\n$/);
    cad('rules', 'draw', 'my-2020');
    const svg = fs.readFileSync(path.join(ws, 'my-2020.svg'), 'utf8');
    for (const t of ['>20<', '>6<', '>12<', '>2<', 'Ø4.2', 'R1', '>183<', '>7420<', '-0.3%', 'taps M5 (tap drill Ø4.2)', 'slot: my-slot: 6 wide, 12 under lips 2 thick, 6 deep, floor 5.9', 'A6N01SS-T5 (al6n01-t5)', 'sold as 1000, 4000; cut 50 to 4000 ±0.5']) assert.ok(svg.includes(t), `the drawing shows ${t}`);
    assert.equal(svg.replaceAll('my-slot', 'slot-6-misumi').replaceAll('my-2020', 'profile-2020-misumi-hfs5'), fs.readFileSync(new URL('../rules/drawings/profile-2020-misumi-hfs5.svg', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), 'and it is the drawing of the published set');
    // what the check catches: a bore that breaks into the slots and is no thread, a slot too wide for its cell, a figure off the sheet
    const broken = (change) => { const x = read('rules/my-2020.json'); x.name = 'broken'; for (const [k, v] of Object.entries(change)) x.rules[k] = { ...x.rules[k], value: v }; write('rules/broken.json', x); const r = run('rules', 'check', 'broken', '--json'); return { status: r.status, found: JSON.parse(r.stdout)[0].findings }; };
    let b = broken({ bore_diameter: 9 });
    assert.equal(b.status, 1); assert.deepEqual([...new Set(b.found.map((x) => `${x.level} ${x.code}`))], ['fail profile.bore.clear', 'fail profile.bore.tap', 'warn profile.section.area', 'warn profile.section.mass_per_metre']);
    assert.match(b.found[0].text, /the bore at 0, 0 \(Ø9\) breaks into the top face's slot/); assert.equal(b.found[0].rule, 'bore_diameter');
    b = broken({ area: 150 }); assert.equal(b.status, 0); assert.deepEqual(b.found.map((x) => [x.level, x.code, x.values.sheet]), [['warn', 'profile.section.area', 150]]);
    b = broken({ slot: 'slot-7' }); assert.equal(b.status, 1); assert.match(b.found[0].text, /^broken: no slot family "slot-7"/); assert.equal(b.found[0].code, 'profile.model');
    b = broken({ family: 'girder' }); assert.equal(b.status, 1); assert.deepEqual(b.found.map((x) => x.code), ['rules.choice'], 'held to the vocabulary first');
    const wide = read('rules/my-slot.json'); wide.name = 'wide'; wide.rules.floor_width.value = 2; write('rules/wide.json', wide);
    const w = run('rules', 'check', 'wide'); assert.equal(w.status, 1); assert.match(w.stdout, /FAIL {2}wide: its flanks would start above the underside of its lips.*\(slot\.model\)/);
    // a slot nut against its slot
    const nut = read('rules/my-nut.json'); nut.rules.slot.value = 'slot-6-misumi';
    write('rules/my-nut.json', nut); assert.match(cad('rules', 'check', 'my-nut'), /1 of 1 rule sets pass\n$/);
    nut.rules.width.value = 13; nut.rules.height.value = 5; write('rules/my-nut.json', nut);
    const n = run('rules', 'check', 'my-nut'); assert.equal(n.status, 1); assert.match(n.stdout, /it is 13 mm across, and slot-6-misumi is 12 mm wide under its lips/); assert.match(n.stdout, /it is 5 mm tall, and slot-6-misumi has 4 mm under its lips/);
    // a measured outline beside the set takes the drawn one's place, through its schema
    fs.mkdirSync(path.join(ws, 'rules/outlines'));
    write('rules/outlines/my-2020.json', { name: 'my-2020', source: 'a bar from the shelf, traced', licence: 'my own measurement', checked: '2026-11-15', loops: [[[-10, -10], [10, -10], [10, 10], [-10, 10]], [[-2, -2], [2, -2], [2, 2], [-2, 2]]] });
    const measured = run('rules', 'check', 'my-2020'); assert.equal(measured.status, 0); assert.match(measured.stdout, /area: the sheet says 183 mm², the measured outline comes to 384/);
    cad('rules', 'draw', 'my-2020'); assert.ok(fs.readFileSync(path.join(ws, 'my-2020.svg'), 'utf8').includes('drawn from its outline: a bar from the shelf, traced'));
    write('rules/outlines/my-2020.json', { name: 'my-2020', source: 'a bar', loops: [[[0, 0], [1, 0]]] });
    const bad = run('rules', 'check', 'my-2020'); assert.equal(bad.status, 1); assert.match(bad.stdout, /outlines\/my-2020\.json: \(top\): needs "licence"/); assert.match(bad.stdout, /loops\[0\]: needs at least 3 entries/);
    assert.match(cad('rules', 'check'), /rule sets pass/, 'an outline is not taken for a rule set');
  } finally { done(); }
});

test('the quick start: new, check, tweak, export, link, with the printer rules copied in', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('new', 'bathroom/soap-tray'), /made projects\/bathroom\/objects\/soap-tray/);
    const checked = cad('check', 'bathroom/soap-tray');
    assert.match(checked, /every measurement is a variable/);
    assert.match(checked, /fits the bed/);
    assert.ok(fs.existsSync(path.join(ws, 'rules/x1c.json')), 'the printer rules are the workspace\'s own copy');
    assert.match(cad('check', 'bathroom/soap-tray', '--set', 'width=60'), /60 × 30 × 10 mm/);
    assert.match(cad('check', 'bathroom/soap-tray', '--set', 'width=999'), /from 10 to 200/);
    assert.match(cad('export', 'bathroom/soap-tray'), /soap-tray@0\.1\.0\.3mf/);
    assert.match(cad('link', 'bathroom/soap-tray', '--md'), /\[View and download\]\(https:\/\/.*#m=1\./);
  } finally { done(); }
});

test('a raw number in a design fails the check', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'demo/block');
    const js = path.join(ws, 'projects/demo/objects/block.js');
    fs.writeFileSync(js, fs.readFileSync(js, 'utf8').replace('export function main', 'const sneaky = 17\nexport function main'));
    assert.match(cad('check', 'demo/block'), /should be variables: line \d+: 17/);
  } finally { done(); }
});

test('v.fixings: a counterbored hole, a pilot and an insert boss with no number typed, each said in the check with the rule it rests on', () => {
  const { ws, cad, done } = workspace();
  try {
    const js = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const f = v.fixings, top = v.thick
  const plate = cuboid({ size: [v.width, v.depth, top], center: [0, 0, top / 2] })
  const boss = f.insertBoss('M3', { at: [v.pitch, 0, top] })
  return v.ops.subtract(v.ops.union(plate, boss.boss), boss.hole,
    f.counterbore('M3x12 cap', { length: top, thickness: top, at: [-v.pitch, 0, top] }),
    f.hole('M3', { kind: 'pilot', at: [0, 0, top] }))
}
`;
    object(ws, 'demo/plate', { uses: ['x1c'], orientation: 'Flat on the bed, the boss up', variables: {
      width: { value: 40, unit: 'mm', rule: 'Three fixings in a row' }, depth: { value: 16, unit: 'mm', rule: 'A fixing and its walls' },
      thick: { value: 'x1c.layer * 40', unit: 'mm', rule: 'Whole layers: the pilot and a floor under it' }, pitch: { value: 12, unit: 'mm', rule: 'Between the fixings' } } }, js);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['plate'] }));
    // no number in the design but 0, 1 and 2: a thread's name is text, so 'M3' and 'M3x12 cap' are no measurements
    assert.deepEqual([...new Set(js.replace(/'[^']*'/g, '').match(/\d+(\.\d+)?/g))].sort(), ['0', '2']);
    const run = () => { const r = spawnSync(process.execPath, [BIN, 'check', 'demo/plate', '--json'], { cwd: ws, encoding: 'utf8' }); return { status: r.status, findings: JSON.parse(r.stdout).findings }; };
    const first = run(), by = (f, code) => f.filter((x) => x.code === code);
    assert.equal(first.status, 0); assert.deepEqual(first.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), [], 'it checks clean');
    assert.equal(by(first.findings, 'lint.numbers')[0].level, 'pass');
    // what each hole and seat was drawn to, with what it rests on
    const holes = by(first.findings, 'hole.drawn');
    assert.deepEqual(holes.map((x) => [x.values.diameter, x.refs.rule, x.refs.kind]), [[3.5, 'm3.clearance', 'spec'], [2.9, 'x1c.pilot_m3', 'measured']]);
    assert.match(holes[0].text, /an M3 clearance hole drawn 3\.5 mm: it rests on m3\.clearance \(3\.4 mm\), a standard's figure, plus x1c\.hole_comp 0\.1 mm across/);
    assert.match(holes[1].text, /an M3 pilot drawn 2\.9 mm: it rests on x1c\.pilot_m3 \(2\.9 mm\), a measured rule, as drawn/);
    assert.deepEqual(by(first.findings, 'counterbore.drawn')[0].values, { diameter: 6, depth: 3, sunk: 0, hole: 3.5 });
    assert.deepEqual((({ hole, outer, height }) => [hole, outer, height])(by(first.findings, 'insertBoss.drawn')[0].values), [4, 7.2, 6.8]);
    // the same from the cache, as a motor's or a mechanism's findings are kept with a build
    assert.deepEqual(run().findings.filter((x) => /^(hole|counterbore|insertBoss)\./.test(x.code)), first.findings.filter((x) => /^(hole|counterbore|insertBoss)\./.test(x.code)));
    // bound to the project: the workspace's own printer rule moves the pilot, and its own thread set is read before the kit's
    const x1c = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')); x1c.rules.pilot_m3.value = 2.8;
    fs.writeFileSync(path.join(ws, 'rules/x1c.json'), JSON.stringify(x1c));
    fs.writeFileSync(path.join(ws, 'rules/m3.json'), JSON.stringify({ name: 'm3', rules: { clearance: { value: 3.6, unit: 'mm', rule: 'A roomier hole, as measured here', kind: 'measured', source: 'this bench', checked: '2026-11-15' } } }));
    assert.deepEqual(by(run().findings, 'hole.drawn').map((x) => [x.values.diameter, x.refs.kind]), [[3.7, 'measured'], [2.8, 'measured']]);
    // a typed diameter is still a number that should be a variable, and a design may import the package itself in the sandbox
    object(ws, 'demo/typed', { variables: { w: { value: 10, unit: 'mm', rule: 'Width' } } }, "import jscad from '@jscad/modeling'\nimport { holeModel } from '@rulecad/fixings'\nexport function main (v) { const r = 2.9 / 2 + holeModel('M3').diameter * 0; return jscad.primitives.cuboid({ size: [v.w, v.w, r * 2], center: [0, 0, r] }) }\n");
    const typed = cad('check', 'demo/typed');
    assert.match(typed, /should be variables: line 3: 2\.9/); assert.match(typed, /fits the bed/);
    // the notes for agents say where holes come from, the kit's and the template's alike
    const notes = fs.readFileSync(new URL('./AGENTS.md', import.meta.url), 'utf8');
    assert.match(notes, /comes from `v\.fixings`, named by its thread, never from a\s+typed number/);
    assert.equal(fs.readFileSync(new URL('../create-rulecad/template/AGENTS.md', import.meta.url), 'utf8'), notes, 'the template\'s AGENTS.md is the kit\'s');
  } finally { done(); }
});

// A bracket on a base, each drawn with v.fixings: the base's ends and the bracket's seats are choices, so one pair of objects tries every joint
function fastened(ws) {
  fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'), { recursive: true });
  const size = { width: { value: 40, unit: 'mm', rule: 'Room for two screws' }, depth: { value: 20, unit: 'mm', rule: 'A screw and its walls' }, pitch: { value: 24, unit: 'mm', rule: 'Between the screws' } };
  object(ws, 'demo/base', { uses: ['x1c'], variables: { ...size, tall: { value: 'x1c.layer * 60', unit: 'mm', rule: 'Whole layers' }, hole_depth: { value: 9, unit: 'mm', rule: 'The thread engaged and room at the tip', tweak: { min: 3, max: 11 } },
    end: { value: 'pilot', choice: ['pilot', 'insert', 'through', 'pocket', 'trap'], rule: 'What holds the screw' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const f = v.fixings, block = cuboid({ size: [v.width, v.depth, v.tall], center: [0, 0, v.tall / 2] })
  const cut = (x) => (v.end === 'pilot' ? [f.hole('M3', { kind: 'pilot', depth: v.hole_depth, at: [x, 0, v.tall] })] : v.end === 'insert' ? [f.hole('M3', { kind: 'insert', at: [x, 0, v.tall] })]
    : [f.hole('M3', { depth: v.tall, at: [x, 0, v.tall] }), ...(v.end === 'pocket' ? [f.nutPocket('M3', { at: [x, 0, 0], into: '+z' })] : v.end === 'trap' ? [f.nutTrap('M3', { depth: v.depth / 2, into: '+y', at: [x, 0 - v.depth / 2, v.tall / 2] })] : [])])
  return v.ops.subtract(block, ...[-1, 1].flatMap((s) => cut(s * v.pitch / 2)))
}
`);
  object(ws, 'demo/bracket', { uses: ['x1c'], anchors: { h1: { at: ['-pitch / 2 + shift', 0, 'thick'], axis: [0, 0, 1] }, h2: { at: ['pitch / 2 + shift', 0, 'thick'], axis: [0, 0, 1] }, pivot: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { ...size,
    thick: { value: 'x1c.layer * 25', unit: 'mm', rule: 'Whole layers', tweak: { min: 2, max: 12 } }, shift: { value: 0, unit: 'mm', rule: 'The holes moved along, to try a misfit', tweak: { min: -3, max: 3 } },
    bore: { value: 0, unit: 'mm', rule: 'A hole typed by hand, to try a wrong size (0: the thread\'s own)', tweak: { min: 0, max: 6 } }, seat: { value: 'hole', choice: ['hole', 'counterbore', 'countersink'], rule: 'How the head sits' } } }, `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [v.width, v.depth, v.thick], center: [0, 0, v.thick / 2] })
  const cut = (x) => (v.bore ? cylinder({ radius: v.bore / 2, height: v.thick * 2, center: [x, 0, v.thick / 2] })
    : v.seat === 'hole' ? v.fixings.hole('M3', { depth: v.thick, at: [x, 0, v.thick] }) : v.fixings[v.seat]('M3', { length: v.thick, thickness: v.thick, at: [x, 0, v.thick] }))
  return v.ops.subtract(plate, ...[-1, 1].map((s) => cut(s * v.pitch / 2 + v.shift)))
}
`);
  fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['base', 'bracket'] }));
  const file = path.join(ws, 'projects/demo/assemblies/joint.json');
  // write(change): the assembly with its items' sets and its fasten changed; check(): its findings and exit code
  const write = ({ base = {}, bracket = {}, fasten = {}, more = {} } = {}) => fs.writeFileSync(file, JSON.stringify({ title: 'Bracket on its base', kind: 'fit',
    items: [{ id: 'base', object: 'base', set: base }, { id: 'bracket', object: 'bracket', at: [0, 0, 'base.tall'], set: bracket }],
    fits: [{ a: 'bracket', b: 'base', min: 0, max: 0.05, note: 'The bracket sits on the base' }],
    fasten: [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'], ...fasten }], ...more }));
  const check = () => { const r = spawnSync(process.execPath, [BIN, 'check', 'demo/joint', '--json'], { cwd: ws, encoding: 'utf8' }); let out; try { out = JSON.parse(r.stdout); } catch { assert.fail(`${r.stdout}${r.stderr}`); } return { status: r.status, findings: out.findings, of: (code) => out.findings.filter((x) => x.code === code), fails: out.findings.filter((x) => x.level === 'fail').map((x) => x.code) }; };
  return { file, write, check };
}

test('fasten: a bracket screwed to a base passes; moved 1 mm, a 3 mm hole, a short screw and a long one each fail by name, with what would do', () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    write();
    let r = check();
    assert.equal(r.status, 0); assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), [], 'a bracket fastened to a base by two M3 screws passes');
    for (const code of ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat']) assert.deepEqual(r.of(code).map((x) => x.level), ['pass'], code);
    assert.match(r.of('fasten.holes')[0].text, /^bracket to base, 2 M3 cap screws: one axis from under the head through bracket into base/);
    assert.match(r.of('fasten.clearance')[0].text, /bracket's hole measures 3\.5 mm, an M3 clearance hole as drawn \(m3\.clearance 3\.4 mm and x1c\.hole_comp 0\.1 mm\)/);
    assert.match(r.of('fasten.end')[0].text, /ends in base, in a pilot the screw forms its own thread in: 2\.9 mm as drawn \(x1c\.pilot_m3, measured\), 9 mm deep/);
    // the length is chosen from the stack as measured: 5 mm of bracket, 5 mm of thread asked in plastic, so M3x10
    assert.match(r.of('fasten.length')[0].text, /M3x10 cap chosen, the shortest sold that fits: 5 mm under its head and 5 mm into base, 3 mm short of bottoming out/);
    assert.deepEqual(r.of('fasten.length')[0].values, { length: 10, grip: 5, into: 5 });
    assert.match(r.of('fasten.engagement')[0].text, /5 mm of thread in pla \(a plastic\), 10 turns: m3\.pilot_depth asks 5 mm/);
    assert.match(r.of('fasten.seat')[0].text, /a flat seat on bracket, whole out to the head's 5\.5 mm; on pla \(39 MPa\) its 14\.2 mm² takes 55\d N, a tightening of 0\.33 N m: the M3 washer would raise that to 112\d N/);
    // every finding points at the screw: under its head, and from there to its tip
    for (const x of r.findings.filter((y) => y.code.startsWith('fasten.'))) { assert.deepEqual(x.at, [-12, 0, 17]); assert.deepEqual(x.between, [[-12, 0, 17], [-12, 0, 7]]); assert.deepEqual(x.refs.screws, ['bracket.h1', 'bracket.h2']); }
    // the screws are placed as reference parts, checked for overlap with the rest, and on the list and in the order as a fit that fastens is
    assert.match(r.of('overlap')[0].text, /no parts overlap \(4 object instances\)/);
    assert.match(cad('list', 'demo/joint'), /2 ×\s+M3x10 cap\s+1\.001 g each, 2 g\s+1 pack of 10, 8 spare\s+bracket to base/);
    assert.match(cad('order', 'demo/joint'), /2\. bracket goes on: bracket fastened to base \(2 × M3x10 cap\)/);

    // moved 1 mm: the holes no longer share an axis, said with the distance
    write({ bracket: { shift: 1 } }); r = check();
    assert.equal(r.status, 1); assert.deepEqual(r.fails, ['fasten.holes']);
    assert.match(r.of('fasten.holes')[0].text, /base's hole is 1 mm off the screw's axis: the holes do not line up/); assert.equal(r.of('fasten.holes')[0].values.distance, 1);
    // a 3 mm hole in the bracket: no clearance hole, said with what it should be
    write({ bracket: { bore: 3 } }); r = check();
    assert.deepEqual(r.fails, ['fasten.clearance']);
    assert.match(r.of('fasten.clearance')[0].text, /bracket's hole measures 3 mm where an M3 screw passes through: a clearance hole should be 3\.5 mm as drawn \(m3\.clearance 3\.4 mm and x1c\.hole_comp 0\.1 mm\), 3\.3 mm at the closest/);
    assert.deepEqual(r.of('fasten.clearance')[0].values, { diameter: 3, wanted: 3.5, least: 3.3, most: 3.7 });
    // an M3x6 through the 5 mm plate into plastic: 1 mm of thread, and the length that would do
    write({ fasten: { screw: 'M3x6 cap' } }); r = check();
    assert.deepEqual(r.fails, ['fasten.engagement']);
    assert.match(r.of('fasten.engagement')[0].text, /M3x6 cap engages 1 mm of thread in pla \(a plastic\), 2 turns, where m3\.pilot_depth asks 5 mm: M3x10 cap would do/);
    assert.equal(r.of('fasten.length')[0].level, 'pass', 'it reaches');
    // an M3x20 into a 6 mm blind hole bottoms out
    write({ base: { hole_depth: 6 }, fasten: { length: 20 } }); r = check();
    assert.deepEqual(r.fails, ['fasten.length']);
    assert.match(r.of('fasten.length')[0].text, /M3x20 cap bottoms out: with 5 mm under its head it goes 15 mm into a hole 6 mm deep, where 1 mm is kept at its tip, so it tightens on its tip and not on its head\. M3x10 cap would do/);
    // one that does not reach, one nobody sells, and a hole too shallow for any: each said
    write({ bracket: { thick: 8 }, fasten: { length: 8 } }); r = check();
    assert.match(r.of('fasten.length')[0].text, /M3x8 cap does not reach base: it is 8 mm long and there is 8 mm under its head\. M3x16 cap would do/);
    write({ fasten: { length: 7 } }); assert.match(check().of('fasten.length')[0].text, /7 mm/);
    write({ base: { hole_depth: 4 } }); r = check();
    assert.match(r.of('fasten.length')[0].text, /no length chosen: .*leaves 3 mm of room for the screw .* where 5 mm of thread is asked: no length can do both\. Deepen the far end to 6 mm or more/);

    // bad input is refused by name before anything is measured
    write({ fasten: { screw: 'M7 cap' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: .*M7.*M3/s);
    write({ fasten: { into: 'lid' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: no part "lid" \(items: base, bracket\)/);
    write({ fasten: { holes: 'bracket.body' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: give "at" .* or "holes" .*, one of the two/);
    write({ fasten: { nut: 'wing' } }); assert.match(cad('check', 'demo/joint'), /fasten 1: "nut" is true \(a hexagon nut\) or hex, square, lock \(got "wing"\)/);
    write({ fasten: { screw: 'M3x12 cap', length: 10 } }); assert.match(cad('check', 'demo/joint'), /fasten 1: M3x12 cap gives the length, and "length" says 10: give it once/);
    // and a misspelt key by the schema, with its path
    write({ fasten: { thru: ['bracket'] } }); assert.match(cad('check', 'demo/joint'), /fasten\[0\]\.thru: not allowed here/);

    // a fasten holds its parts as a fit that fastens does: in a mechanism, a bracket only placed is loose, and fastened it is held, in every pose
    object(ws, 'demo/knob', { variables: { w: { value: 10, unit: 'mm', rule: 'Width' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n");
    const more = { joints: [{ id: 'spin', type: 'revolute', parent: { item: 'base', at: [0, 40, 0] }, child: 'knob.axis', min: 0, max: 90 }], poses: { shut: { spin: 0 }, open: { spin: 90 } } };
    const withKnob = (fasten) => { write({ more }); const a = JSON.parse(fs.readFileSync(file, 'utf8')); a.items.push({ id: 'knob', object: 'knob' }); if (!fasten) delete a.fasten; fs.writeFileSync(file, JSON.stringify(a)); return check(); };
    r = withKnob(false);
    assert.match(r.of('assembly.loose')[0].text, /bracket is placed, but nothing holds it/);
    r = withKnob(true);
    assert.equal(r.of('assembly.loose').length, 0); assert.equal(r.of('assembly.held')[0].level, 'pass');
    assert.match(r.of('poses')[0].text, /2 poses checked/);
    assert.deepEqual(r.of('fasten.holes').map((x) => x.level), ['pass'], 'the same in both poses, so said once');
  } finally { done(); }
});

test('fasten: a yoke: a screw through one cheek, the block between and into the other, its nut outside; engagement held to the micron the length was chosen to', () => {
  const { ws, cad, done } = workspace();
  try {
    // a length read from the mesh a hair over a whole millimetre: the length is chosen from the stack to the micron, and so is the engagement
    const { write, check } = fastened(ws);
    write({ bracket: { thick: 5.0004 } });
    let r = check();
    assert.deepEqual(r.fails, [], 'M3x10 through 5.0004 mm engages the 5 mm m3.pilot_depth asks, as it is said');
    assert.match(r.of('fasten.engagement')[0].text, /5 mm of thread in pla \(a plastic\), 10 turns: m3\.pilot_depth asks 5 mm/);

    // a fork, its cheeks 5 mm thick with a 10 mm slot, and a block in the slot: one axis across all three, along y
    object(ws, 'demo/fork', { uses: ['x1c'], anchors: { h: { at: [0, 0, 'tall / 2'], axis: [0, 1, 0] }, slot: { at: [0, 0, 0], axis: [0, 0, 1] } },
      variables: { cheek: { value: 5, unit: 'mm', rule: 'Each cheek' }, slot: { value: 10, unit: 'mm', rule: 'The slot' }, tall: { value: 20, unit: 'mm', rule: 'Height' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const w = v.slot + 2 * v.cheek, body = v.ops.subtract(cuboid({ size: [16, w, v.tall + 6], center: [0, 0, (v.tall - 6) / 2] }), cuboid({ size: [18, v.slot, v.tall + 1], center: [0, 0, (v.tall + 1) / 2] }))
  return v.ops.subtract(body, v.fixings.hole('M3', { into: '+y', depth: w, at: [0, 0 - w / 2, v.tall / 2] }))
}
`);
    object(ws, 'demo/block', { uses: ['x1c'], anchors: { seat: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { w: { value: 10, unit: 'mm', rule: 'The slot it sits in' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [16, v.w, 20], center: [0, 0, 10] }), v.fixings.hole('M3', { into: '+y', depth: v.w, at: [0, 0 - v.w / 2, 10] }))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['base', 'bracket', 'fork', 'block'] }));
    const file = path.join(ws, 'projects/demo/assemblies/yoke.json');
    const yoke = (fasten, run = true) => { fs.writeFileSync(file, JSON.stringify({ title: 'A block in a fork', kind: 'fit', items: [{ id: 'fork', object: 'fork' }, { id: 'block', object: 'block' }],
      fits: [{ a: 'block', b: 'fork', min: 0, note: 'In the slot' }], fasten: [{ screw: 'M3 cap', through: ['fork', 'block'], into: 'fork', at: ['fork.h'], nut: true, note: 'Across the fork', ...fasten }] }));
      if (!run) return null;
      const out = spawnSync(process.execPath, [BIN, 'check', 'demo/yoke', '--json'], { cwd: ws, encoding: 'utf8' }); let j; try { j = JSON.parse(out.stdout); } catch { assert.fail(`${out.stdout}${out.stderr}`); }
      if (!j.findings) assert.fail(JSON.stringify(j)); return { status: out.status, of: (code) => j.findings.filter((x) => x.code === code), fails: j.findings.filter((x) => x.level === 'fail').map((x) => `${x.code}: ${x.text}`) }; };
    r = yoke();
    assert.deepEqual(r.fails, [], 'the screw passes the near cheek and the block, and its nut holds it on the far cheek');
    assert.match(r.of('fasten.holes')[0].text, /Across the fork, an M3 cap screw: one axis from under the head through fork, block into fork/);
    assert.match(r.of('fasten.end')[0].text, /nut/);
    assert.match(r.of('fasten.length')[0].text, /M3x25 cap chosen, the shortest sold that fits: 20 mm under its head/);
    assert.match(cad('list', 'demo/yoke'), /1 ×\s+M3x25 cap[\s\S]*1 ×\s+M3 hex nut/);
    // the anchor's axis says the way: turned round, the head is on the other cheek and it still holds
    const a = JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/objects/fork.json'), 'utf8')); a.anchors.h.axis = [0, -1, 0]; fs.writeFileSync(path.join(ws, 'projects/demo/objects/fork.json'), JSON.stringify(a));
    assert.deepEqual(yoke().fails, []);
    // a part's own holes can't say which cheek the head is on: refused by name
    yoke({ at: undefined, holes: 'fork' }, false);
    assert.match(cad('check', 'demo/yoke'), /fasten 1: a screw that ends in fork, the part under its head, is placed with "at"/);
  } finally { done(); }
});

test('fasten: seats and ends read from the parts: a counterbore on an insert, a countersunk screw and its nut, a nut\'s seat, a washer, a part\'s own holes; cad add fasten', async () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    // a cap screw down a counterbore into a heat-set insert: the stack is measured from the counterbore's floor
    write({ base: { end: 'insert' }, bracket: { seat: 'counterbore', thick: 8 } });
    let r = check();
    assert.equal(r.status, 0); assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.end')[0].text, /ends in base, in a heat-set insert's hole: 4 mm as drawn \(m3\.insert_hole, a community figure\), 6\.7 mm deep/);
    assert.match(r.of('fasten.length')[0].text, /M3x8 cap chosen, the shortest sold that fits: 5 mm under its head and 3 mm into base/);
    assert.match(r.of('fasten.engagement')[0].text, /3 mm of thread in the insert, 5\.7 mm long, 6 turns: fixings\.insert_engagement asks a diameter of thread or the whole insert, 3 mm/);
    assert.match(r.of('fasten.seat')[0].text, /a flat seat on bracket, 3 mm down its counterbore, whole out to the head's 5\.5 mm/);
    assert.match(r.of('overlap')[0].text, /no parts overlap \(6 object instances\)/, 'two screws and two inserts with the two parts');
    const listed = cad('list', 'demo/joint'); assert.match(listed, /2 ×\s+M3x8 cap/); assert.match(listed, /2 ×\s+M3 insert/);
    // a countersunk screw in a countersink of its angle, held by a nut on the far face
    write({ base: { end: 'through' }, bracket: { seat: 'countersink', thick: 8 }, fasten: { screw: 'M3 countersunk', nut: true } });
    r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.seat')[0].text, /the countersunk head sits in a (89\.\d|90)° countersink in bracket/); assert.ok(Math.abs(r.of('fasten.seat')[0].values.angle - 90) < 1);
    assert.match(r.of('fasten.end')[0].text, /ends in an M3 hex nut on the far face of base, past a 3\.5 mm clearance hole/);
    assert.match(r.of('fasten.length')[0].text, /M3x25 countersunk chosen/); // (8 + 12 mm of parts and a 2.4 mm nut: 20 is short, 25 the next sold)
    assert.match(r.of('fasten.engagement')[0].text, /2\.4 mm of thread in its M3 hex nut, 2\.4 mm high/);
    // with no nut given, nothing holds a screw in a clearance hole; and a cap head has no flat seat in a countersink
    write({ base: { end: 'through' }, bracket: { seat: 'countersink', thick: 8 }, fasten: { screw: 'M3 cap' } });
    r = check();
    assert.deepEqual(r.fails.sort(), ['fasten.end', 'fasten.seat']);
    assert.match(r.of('fasten.end')[0].text, /nothing holds the screw in base: its hole measures 3\.5 mm, a clearance hole\. The far end should be a pilot the screw forms its own thread in \(2\.9 mm\), a hole to tap \(2\.6 mm\), a heat-set insert's hole \(4 mm\), a nut's seat on a clearance hole, or a clearance hole with "nut"/);
    assert.match(r.of('fasten.seat')[0].text, /the head has no flat seat on bracket: the face under it is not square to the screw \(a cone\)/);
    // a countersunk screw on a square-edged hole stands proud on a line
    write({ base: { end: 'through' }, fasten: { screw: 'M3 countersunk', nut: true } });
    assert.match(check().of('fasten.seat')[0].text, /a countersunk head sits in a 90° countersink, and bracket's hole has a square edge: the head stands 1\.\d+ mm proud/);
    // a nut's seat drawn under the base is found, and the nut sits in it, turned to its flats; the screws' places are the bracket's own holes
    write({ base: { end: 'pocket' }, fasten: { at: undefined, holes: 'bracket.body' } });
    r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.end')[0].text, /ends in an M3 hex nut in its seat in base, 5\.6 mm across the flats for the nut's 5\.5 mm, past a 3\.5 mm clearance hole/);
    assert.match(r.of('overlap')[0].text, /no parts overlap \(6 object instances\)/, 'the nuts lie in their seats, corners to corners');
    assert.deepEqual(r.of('fasten.holes')[0].refs.screws, ['hole at -12, 0, 2.5', 'hole at 12, 0, 2.5']);
    assert.deepEqual(r.of('fasten.holes')[0].refs.places, [[-12, 0, 17], [12, 0, 17]]);
    // a nut slid into a slot from the side, across the screw, partway down the base (v.fixings.nutTrap): its seat is found there, and the nut sits in it with its flats to the slot's walls
    write({ base: { end: 'trap' } });
    r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.end')[0].text, /ends in an M3 hex nut in its seat in base, 5\.7 mm across the flats for the nut's 5\.5 mm, past a 3\.5 mm clearance hole/);
    assert.match(r.of('fasten.length')[0].text, /M3x12 cap chosen/, 'the screw ends past the nut in the slot, not at the base\'s far face');
    assert.match(r.of('overlap')[0].text, /no parts overlap \(6 object instances\)/, 'each nut lies in its slot, flats to the walls');
    // a tightening torque is held against what the head sits on, and the washer that brings it within is named; with it, it passes
    write({ fasten: { torque: 0.5 } }); r = check();
    assert.deepEqual(r.fails, ['fasten.seat']);
    assert.match(r.of('fasten.seat')[0].text, /at 0\.5 N m the screw clamps with 833\.3 N: 5\d(\.\d)? MPa under the head on pla, whose strength is 39 MPa\. The M3 washer, 7 mm across, brings it to 2\d(\.\d)? MPa, within: give "washer": true/);
    write({ fasten: { torque: 0.5, washer: true } }); r = check();
    assert.deepEqual(r.fails, []);
    assert.match(r.of('fasten.seat')[0].text, /whole out to the washer's 7 mm; at 0\.5 N m the screw clamps with 833\.3 N, 2\d(\.\d)? MPa under the washer on pla/);
    assert.match(r.of('fasten.length')[0].text, /M3x12 cap chosen, the shortest sold that fits: 5\.5 mm under its head \(its washer with it\)/);
    // cad add fasten writes the relation, and refuses one that names no item of the assembly or no place for its screws
    const a = JSON.parse(fs.readFileSync(file, 'utf8')); delete a.fasten; fs.writeFileSync(file, JSON.stringify(a, null, 2));
    assert.match(cad('add', 'fasten', 'demo/joint', '--screw', 'M3 cap', '--through', 'lid', '--into', 'base', '--holes', 'bracket.body'), /fasten: no item "lid" in demo\/joint \(items: base, bracket\)/);
    assert.match(cad('add', 'fasten', 'demo/joint', '--screw', 'M3 cap', '--through', 'bracket', '--into', 'base'), /a fasten needs where its screws go: --at .* or --holes/);
    assert.match(cad('add', 'fasten', 'demo/joint', '--screw', 'M3 cap', '--through', 'bracket', '--into', 'base', '--at', 'bracket.h1,bracket.h2', '--washer', '--note', 'Bracket screwed down'), /added a fasten to/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).fasten, [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'], washer: true, note: 'Bracket screwed down' }]);
    assert.match(cad('check', 'demo/joint'), /Bracket screwed down, 2 M3 cap screws: M3x12 cap chosen/);

    // the measure itself: a plate with a counterbored hole, read along the hole's axis and 0.4 mm off it
    const { profile } = await import('./lib/fasten.mjs'), jscad = (await import('@jscad/modeling')).default, { polygons } = await import('./lib/design.mjs');
    const { cuboid, cylinder } = jscad.primitives, plate = jscad.booleans.subtract(cuboid({ size: [20, 20, 8], center: [0, 0, 4] }), cylinder({ radius: 1.75, height: 20, segments: 48 }), cylinder({ radius: 3, height: 3, center: [0, 0, 6.5], segments: 48 }));
    const tris = polygons(plate, { triangulate: true }), segs = profile(tris, [0, 0, 10], [0, 0, -1], 5).segs.filter((g) => g.hole);
    assert.deepEqual(segs.map((g) => [+g.z0.toFixed(3), +g.z1.toFixed(3), g.a.loop.shape, +g.a.loop.d.toFixed(3), +g.a.loop.offset.toFixed(3)]), [[2, 5, 'round', 6, 0], [5, 10, 'round', 3.5, 0]]);
    const off = profile(tris, [0.4, 0, 10], [0, 0, -1], 5).segs.filter((g) => g.hole).at(-1);
    assert.equal(+off.a.loop.offset.toFixed(3), 0.4); assert.equal(+off.a.loop.d.toFixed(3), 3.5); assert.ok(Math.abs(off.a.free - 1.35) < 0.01, 'the wall is that much nearer');
    assert.ok(profile(tris, [5, 5, 10], [0, 0, -1], 2).segs.every((g) => g.solid && !g.hole), 'through the plate itself: solid all the way');
  } finally { done(); }
});

test('fasten: the older "fastens": true fit gives the same findings with or without a fasten beside it, and states no fasten finding of its own', () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    const strip = (r) => r.findings.map((x) => [x.level, x.code, x.text]);
    // the older form alone: a fit that fastens holds the bracket, and nothing says anything of screws
    write({ fasten: {}, more: { fits: [{ a: 'bracket', b: 'base', min: 0, max: 0.05, fastens: true, note: 'The bracket sits on the base' }] } });
    const a = JSON.parse(fs.readFileSync(file, 'utf8')); delete a.fasten; fs.writeFileSync(file, JSON.stringify(a));
    const old = check();
    assert.equal(old.status, 0); assert.deepEqual(old.findings.filter((x) => x.code.startsWith('fasten.')), [], 'no fasten finding without a fasten');
    assert.match(old.of('overlap')[0].text, /no parts overlap \(2 object instances\)/);
    // a fasten added beside it adds fasten findings and the screws as parts, and changes no other finding
    a.fasten = [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'] }]; fs.writeFileSync(file, JSON.stringify(a));
    const both = check();
    assert.equal(both.status, 0);
    const rest = (r) => strip(r).filter(([, code]) => /^(fit|fits|gap|assembly)\b/.test(code) || /^fit/.test(code));
    assert.ok(rest(old).length >= 1, 'the fit is judged');
    assert.deepEqual(rest(both), rest(old), 'the older fit\'s findings are the same');
    assert.ok(both.findings.some((x) => x.code === 'fasten.holes'));
    // the older form does not look at holes: a misfit passes it, and fails with a fasten
    a.items[1].set = { shift: 1 }; delete a.fasten; fs.writeFileSync(file, JSON.stringify(a));
    assert.equal(check().status, 0, 'a fit that fastens does not follow the holes');
    a.fasten = [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'] }]; fs.writeFileSync(file, JSON.stringify(a));
    assert.deepEqual(check().fails, ['fasten.holes']);
  } finally { done(); }
});

test('fasten: access and order: the key reaches each head, a part over a screw goes on after it, one fitted first fails by name; each step says its screws, key and torque', () => {
  const { ws, cad, done } = workspace();
  try {
    const { file, write, check } = fastened(ws);
    // a cover over the first screw's head, 8 mm above it, held by a fit that fastens: once to the bracket, and in the second case the bracket hangs from it
    object(ws, 'demo/cover', { variables: { w: { value: 10, unit: 'mm', rule: 'Over one screw', tweak: { min: 2, max: 20 } }, t: { value: 3, unit: 'mm', rule: 'Thick' } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.t], center: [0, 0, v.t / 2] }) }\n");
    const withCover = (fits, set = {}) => { write(); const a = JSON.parse(fs.readFileSync(file, 'utf8')); a.items.splice(1, 0, { id: 'cover', object: 'cover', at: [-12, 0, 28], set }); a.fits.push(...fits); fs.writeFileSync(file, JSON.stringify(a)); return check(); };
    // nothing over the heads: the key, its room and its reach come from the hexkey rule set (ISO 2936)
    write(); let r = check();
    assert.deepEqual(r.of('fasten.access').map((x) => x.level), ['pass']);
    assert.match(r.of('fasten.access')[0].text, /^bracket to base, 2 M3 cap screws: a 2\.5 mm hex key reaches the head along its axis: nothing within 1\.375 mm of it for 58\.5 mm over the head \(hexkey\.corners, hexkey\.long_arm\)/);
    assert.deepEqual(r.of('fasten.access')[0].values, { key: 2.5, radius: 1.375, reach: 58.5 });
    // each step names its screws, their key and how tight: the most the seat under the head takes, where no torque is given
    const order = JSON.parse(cad('order', 'demo/joint', '--json'));
    assert.deepEqual(order.steps[1].fasteners, [{ fit: 'bracket fastened to base', fastener: 'M3x10 cap', count: 2, key: '2.5 mm hex key', tighten: { torque: 0.33, given: false } }]);
    assert.match(cad('order', 'demo/joint'), /2\. bracket goes on: bracket fastened to base \(2 × M3x10 cap\) with a 2\.5 mm hex key, to 0\.33 N m at most \(what the seat takes\)/);
    write({ fasten: { torque: 0.25 } });
    assert.match(cad('order', 'demo/joint'), /\(2 × M3x10 cap\) with a 2\.5 mm hex key, to 0\.25 N m$/m);
    // a cover that goes on after the bracket: the order puts it last, and the key reaches the screw first
    r = withCover([{ a: 'cover', b: 'bracket', fastens: true, note: 'cover on the bracket' }]);
    assert.equal(r.status, 0, JSON.stringify(r.findings.filter((x) => x.level === 'fail')));
    const pass = r.of('fasten.access').find((x) => /cover/.test(x.text));
    assert.equal(pass.level, 'pass'); assert.match(pass.text, /screw 1 \(bracket\.h1\): a 2\.5 mm hex key reaches the head before cover \(step 3\) goes on over it/);
    assert.match(cad('order', 'demo/joint'), /1\. base first\n\s+2\. bracket goes on: bracket fastened to base \(2 × M3x10 cap\) with a 2\.5 mm hex key[^\n]*\n\s+3\. cover goes on/);
    // the bracket hangs from the cover, so the cover is fitted first: the screw under it fails fasten.access, naming it
    r = withCover([{ a: 'cover', b: 'base', fastens: true, note: 'cover on the base' }, { a: 'bracket', b: 'cover', fastens: true, note: 'bracket hangs from the cover' }]);
    assert.equal(r.status, 1); assert.deepEqual([...new Set(r.fails)].sort(), ['assembly.order', 'fasten.access']);
    const fail = r.of('fasten.access').find((x) => x.level === 'fail');
    assert.match(fail.text, /screw 1 \(bracket\.h1\): a 2\.5 mm hex key cannot reach the head: cover stands over it, 8 mm up the screw's axis and goes on first \(bracket hangs from the cover\), and a ball-end key tilted 25° does not clear it either\. Move the screw, open a way through cover, or fit cover after/);
    assert.equal(fail.refs.wall, 'cover'); assert.deepEqual(fail.refs.screws, ['bracket.h1']); assert.equal(fail.values.distance, 8);
    assert.deepEqual(r.of('fasten.access').find((x) => x.level === 'pass').refs.screws, ['bracket.h2'], 'the other screw is clear');
    assert.match(r.of('assembly.order')[0].text, /the screw of "bracket to base" can't be reached in any order: cover stands over it and goes on first/);
    // a narrower cover, 4 mm across: a ball-end key tilted 25° (hexkey.ball_end_tilt) passes it, so it is a warning, and the order is found
    r = withCover([{ a: 'cover', b: 'base', fastens: true, note: 'cover on the base' }, { a: 'bracket', b: 'cover', fastens: true, note: 'bracket hangs from the cover' }], { w: 4 });
    assert.deepEqual(r.fails, []); assert.equal(r.of('assembly.order')[0].level, 'pass');
    assert.match(r.of('fasten.access').find((x) => x.level === 'warn').text, /screw 1 \(bracket\.h1\): only a ball-end 2\.5 mm hex key reaches the head, tilted up to 25° \(hexkey\.ball_end_tilt\): cover \(8 mm over the head\) stands on the straight line, and a ball end takes less torque than a straight key/);
  } finally { done(); }
});

test('fasten.load: a bracket carrying 2 kg on two M3 screws into PLA pilots holds the margin worked by hand; the motor stand\'s four screws carry the force motor.mount gives', () => {
  const { ws, cad, done } = workspace();
  const near = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} against ${y} (±${tol})`);
  try {
    const { write, check } = fastened(ws);
    // The bracket hangs under the base (gravity up the screws), 2 kg at the h2 anchor, right over screw 2, tightened to 0.2 N m.
    // By hand, each figure's source:
    //   W = 2 kg × 9.80665 m/s² = 19.613 N (standard gravity). The bracket's own 40 × 20 × 5 mm less two 3.5 mm holes is
    //   3903.8 mm³, × 1.26 g/cm³ (pla.density) = 4.92 g, 0.048 N at its middle: 0.024 N on each screw. Held up: 2.0049 kg.
    //   Shared (screwGroup, the elastic method): screws at x = ±12 mm, the load at x = +12 mm: P = W/2 + W × 12 × 12 / (2 × 12²) = W
    //   on screw 2 and 0 on screw 1; with the bracket, 19.637 N and 0.024 N.
    //   Thread (stripping): 0.875 π d Le = 0.875 × π × 3 × 5 mm = 41.233 mm² (Le: the 5 mm the M3x10 engages, fasten.length);
    //   shear strength 39 MPa (pla.strength, community) / √3 (fixings.shear_ratio, estimate) = 22.517 MPa; strips at 928.4 N.
    //   Preload: F = T / (K d) = 0.2 N m / (0.2 × 3 mm) = 333.3 N (fixings.nut_factor 0.2, estimate).
    //   Thread margin: (928.4 - 333.3) / 19.637 = 30.30 times the load. Screw: proof load (π/4)(3 - 0.9382 × 0.5)² mm² × 580 MPa
    //   (m3.proof_stress, class 8.8) = 2917.9 N; (2917.9 - 333.3) / 19.637 = 131.6 times. The joint's margin: 30.30, the thread first.
    write({ fasten: { torque: 0.2 }, more: { gravity: [0, 0, 1], loads: [{ mass: 2, at: 'bracket.h2', note: '2 kg hung over screw 2' }] } });
    let r = check(), load = r.of('fasten.load');
    assert.equal(r.status, 0, r.fails.join('\n'));
    const main = load.find((x) => x.values?.margin != null), held = 2 + 3903.8 * 1.26 / 1e6, T2 = (held - 2) * 9.80665 / 2 + 2 * 9.80665;
    assert.equal(main.level, 'pass'); near(main.values.kg, held, 0.0005, 'held up: 2 kg and the bracket');
    near(main.values.tension, T2, 0.05, 'screw 2 takes the 2 kg'); near(main.values.screws[0].tension, 0, 0.05, 'screw 1 next to nothing');
    assert.equal(main.values.preload, 333.3); assert.equal(main.values.torque, 0.2);
    near(main.values.margin, (928.4 - 333.3) / T2, 0.01, 'the margin worked by hand'); near(main.values.margin, 30.30, 0.01, 'as written in the comment');
    assert.match(main.text, /^bracket to base, 2 M3 cap screws carry bracket, 2\.005 kg with the load hung on it: screw 2 \(bracket\.h2\) takes the most: an M3 screw with 19\.6 N of pull and 0 N of shear, clamped with 333\.3 N \(0\.2 N·m, T = K d F with K = 0\.2, an estimate\): its thread in pla strips at about 928\.4 N \(an estimate: 22\.52 MPa in shear\), 30\.3\d? times this pull over the preload; the screw yields at 131\.\d+ times it \(proof load 2917\.9 N\)\. It holds 30\.3\d? times the load, the thread first\. It rests on estimates: /);
    for (const k of ['pla.strength', 'fixings.shear_ratio', 'fixings.nut_factor']) assert.ok(main.refs.rests.includes(k), `rests on ${k}`);
    assert.deepEqual(main.at, [12, 0, 17]); assert.equal(r.findings.filter((x) => x.code === 'motor.loads').length, 0, 'the loads are checked, by the fasten');
    // 25 kg: the thread holds under twice it, a warning naming the kit's margin; no torque given, the step tightens to what the load leaves the thread
    write({ more: { gravity: [0, 0, 1], loads: [{ mass: 25, at: 'bracket.h2' }] } }); r = check(); load = r.of('fasten.load');
    const heavy = load.find((x) => x.values?.margin != null);
    assert.equal(heavy.level, 'pass', heavy.text); near(heavy.values.margin, 2, 0.05, 'tightened only so far as leaves the thread twice the load'); assert.match(heavy.text, /Tighten to 0\.\d+ N m/);
    const step = JSON.parse(cad('order', 'demo/joint', '--json')).steps.flatMap((x) => x.fasteners || []).find((x) => x.fastener === 'M3x10 cap');
    assert.deepEqual(step.tighten, { torque: heavy.values.torque, given: false, load: true }); assert.match(cad('order', 'demo/joint'), /to 0\.\d+ N m \(what the joint's load leaves the thread\)/);
    write({ fasten: { torque: 0.4 }, more: { gravity: [0, 0, 1], loads: [{ mass: 25, at: 'bracket.h2' }] } }); r = check(); // (928.4 - 666.7) / 245.2: 1.07 times
    const tight = r.of('fasten.load').find((x) => x.values?.margin != null); assert.equal(tight.level, 'warn', 'tightened past it, the thread holds under twice the load');
    assert.match(tight.text, /It holds 1\.0\d times the load, the thread first, where the kit asks 2 times/);
    write({ fasten: { torque: 0.5 }, more: { gravity: [0, 0, 1], loads: [{ mass: 25, at: 'bracket.h2' }] } }); r = check();
    assert.equal(r.of('fasten.load').find((x) => x.values?.margin != null).level, 'fail', 'tightened further, it strips under the load'); assert.ok(r.status !== 0);
    // across the screws: a sideways load slips against the clamp, said with the friction it rests on
    write({ fasten: { torque: 0.2 }, more: { gravity: [1, 0, 0], loads: [{ mass: 2, at: 'bracket.h2' }] } }); r = check();
    const slip = r.of('fasten.load').find((x) => x.values?.slip != null); assert.match(slip.text, /holds the 9\.8 N of shear by friction 10\.\d+ times over \(fixings\.clamp_friction 0\.3, an estimate\)/);

    // The motor stand of the bench: motor.mount's numbers as they were before fasten.load (recorded 2026-11-15 on 0ef929d)
    const bench = fileURLToPath(new URL('../../examples/bench/', import.meta.url)), stand = path.join(ws, 'stand');
    fs.cpSync(bench, stand, { recursive: true, filter: (p) => !p.includes('node_modules') }); fs.symlinkSync(ROOT_MODULES, path.join(stand, 'node_modules'), 'junction');
    const motorOf = (name) => { const out = run(stand, ['check', `benchmarks/${name}`, '--json']).stdout; return JSON.parse(out).findings; };
    const before = motorOf('motor-test').find((x) => x.code === 'motor.mount' && x.values?.bearing != null);
    assert.match(before.text, /motor on stand: 5 mm of plate at the screws, each taking 3\.2 N against the torque \(bearing 0\.2 MPa, 212 times under PLA's 39 MPa\)/);
    near(before.values.bearing, 0.18433179723502305, 1e-12, 'bearing as before'); near(before.values.margin, 211.575, 1e-9, 'margin as before');
    // the same stand with the motor fastened by four M3 screws through it into the motor's own threads (the dial left off)
    const a = JSON.parse(fs.readFileSync(path.join(stand, 'projects/benchmarks/assemblies/motor-test.json'), 'utf8'));
    a.items = a.items.filter((x) => x.id !== 'dial'); a.joints = a.joints.filter((x) => x.id !== 'd'); a.fits = a.fits.filter((x) => x.a !== 'dial' && !(x.a === 'motor' && x.fastens));
    a.fasten = [{ screw: 'M3 cap', through: ['stand'], into: 'motor', holes: 'stand', note: 'The motor, on its four screws' }];
    fs.writeFileSync(path.join(stand, 'projects/benchmarks/assemblies/motor-fasten.json'), JSON.stringify(a));
    const fm = motorOf('motor-fasten'), each = 0.28284271247461906 / (4 * Math.hypot(15.5, 15.5) / 1000); // T / (4 r): 3.2258 N, what motor.mount works out
    for (const code of ['fasten.holes', 'fasten.end', 'fasten.length', 'fasten.engagement']) assert.deepEqual(fm.filter((x) => x.code === code).map((x) => x.level), ['pass'], code);
    assert.match(fm.find((x) => x.code === 'fasten.end').text, /ends in motor's own M3 thread, 4\.5 mm deep \(nema17\.mount_hole_depth\)/);
    assert.match(fm.find((x) => x.code === 'fasten.length').text, /M3x8 cap chosen, the longest sold that stops short of the end of the thread: 5 mm under its head and 3 mm into motor/);
    const ml = fm.find((x) => x.code === 'fasten.load' && x.values?.share != null), mount = fm.find((x) => x.code === 'motor.mount' && x.values?.bearing != null);
    near(ml.values.share, each, each * 1e-4, 'fasten.load: each screw\'s share of the motor\'s torque'); assert.ok(ml.refs.each, 'the same on each screw');
    assert.match(ml.text, /motor's 0\.283 N m about its shaft \(what it gives at its working speed\), 3\.2 N on each screw from that alone/);
    assert.match(mount.text, /each taking 3\.2 N against the torque/); near(mount.values.bearing, before.values.bearing, 1e-12, 'motor.mount unchanged beside it');
    assert.equal(ml.values.screws.length, 4); near(ml.values.kg, 0.28, 1e-9, 'the motor held up'); assert.equal(ml.level, 'pass');
  } finally { done(); }
});

test('fasten.count: cad list counts every screw by thread, length and head, with its mass and the packs it is bought in; --json and the build page carry them', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'), { recursive: true });
    // a plate of holes over a block of pilots: twelve under a 3 mm plate, four under a 7 mm one
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    object(ws, 'demo/grid', { uses: ['x1c'], variables: { cols: { value: 2, unit: '', rule: 'Holes across', tweak: { min: 1, max: 6 } }, rows: { value: 2, unit: '', rule: 'Holes down', tweak: { min: 1, max: 6 } },
      pitch: t(12, 'Between the holes', 8, 20), thick: t(12, 'The block or plate', 2, 20), hole_depth: t(9, 'Thread engaged and room at the tip', 3, 11), kind: { value: 'pilot', choice: ['pilot', 'clear'], rule: 'What the holes are' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const holes = [], plate = cuboid({ size: [v.cols * v.pitch, v.rows * v.pitch, v.thick], center: [0, 0, v.thick / 2] })
  for (let i = 0; i < v.cols; i++) for (let j = 0; j < v.rows; j++) {
    const at = [(i - (v.cols - 1) / 2) * v.pitch, (j - (v.rows - 1) / 2) * v.pitch, v.thick]
    holes.push(v.kind === 'pilot' ? v.fixings.hole('M3', { kind: 'pilot', depth: v.hole_depth, at }) : v.fixings.hole('M3', { depth: v.thick, at }))
  }
  return v.ops.subtract(plate, ...holes)
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['grid'] }));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/kit.json'), JSON.stringify({ title: 'Two plates screwed down', kind: 'fit',
      items: [{ id: 'block1', object: 'grid', set: { cols: 4, rows: 3 } }, { id: 'plate1', object: 'grid', at: [0, 0, 12], set: { cols: 4, rows: 3, thick: 3, kind: 'clear' } },
        { id: 'block2', object: 'grid', at: [80, 0, 0] }, { id: 'plate2', object: 'grid', at: [80, 0, 12], set: { thick: 7, kind: 'clear' } }],
      fits: [{ a: 'plate1', b: 'block1', min: 0, max: 0.05 }, { a: 'plate2', b: 'block2', min: 0, max: 0.05 }, { a: 'block2', b: 'block1', fastens: true, note: 'side by side on the bench' }],
      fasten: [{ screw: 'M3 cap', through: ['plate1'], into: 'block1', holes: 'plate1.body' }, { screw: 'M3 cap', through: ['plate2'], into: 'block2', holes: 'plate2.body' }] }));
    const { screwModel } = await import('@rulecad/fixings'), g8 = screwModel('M3x8 cap').mass, g12 = screwModel('M3x12 cap').mass;
    const l = JSON.parse(cad('list', 'demo/kit', '--json'));
    assert.deepEqual(l.fasteners.map(({ fastener, qty, kind, thread, length, head, packs, buy, spare }) => ({ fastener, qty, kind, thread, length, head, packs, buy, spare })), [
      { fastener: 'M3x8 cap', qty: 12, kind: 'screw', thread: 'M3', length: 8, head: 'cap', packs: 2, buy: 20, spare: 8 },
      { fastener: 'M3x12 cap', qty: 4, kind: 'screw', thread: 'M3', length: 12, head: 'cap', packs: 1, buy: 10, spare: 6 }]);
    assert.deepEqual(l.fasteners.map((f) => [f.grams, f.mass]), [[+g8.toFixed(3), +(g8 * 12).toFixed(2)], [+g12.toFixed(3), +(g12 * 4).toFixed(2)]], 'each screw\'s mass from @rulecad/fixings, and the line\'s');
    assert.deepEqual(l.fasteners.map((f) => f.from), [['plate1 to block1'], ['plate2 to block2']]);
    assert.equal(l.totals.fixingsGrams, +(g8 * 12 + g12 * 4).toFixed(1)); assert.equal(l.totals.machineGrams, +(l.totals.printedGrams + l.totals.boughtGrams + l.totals.fixingsGrams).toFixed(1));
    assert.deepEqual(l.totals.pack, { size: 10, rule: 'packs.pack', kind: 'estimate' });
    // as text: the count, the screw, its mass, the packs
    const text = cad('list', 'demo/kit');
    assert.match(text, new RegExp(`12 ×\\s+M3x8 cap\\s+${g8.toFixed(3).replace(/0+$/, '').replace('.', '\\.')} g each, ${(+(g8 * 12).toFixed(2)).toString().replace('.', '\\.')} g\\s+2 packs of 10, 8 spare\\s+plate1 to block1`));
    assert.match(text, /\n\s+4 ×\s+M3x12 cap\s+[\d.]+ g each, [\d.]+ g\s+1 pack of 10, 6 spare\s+plate2 to block2/);
    assert.match(text, /packs of 10: packs\.pack, an estimate/); assert.match(text, /[\d.]+ g of fixings, [\d.]+ g as a machine/);
    // a fit that names its fastener by hand is still counted, beside them
    const a = JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/assemblies/kit.json'), 'utf8')); a.fits[2] = { ...a.fits[2], fastener: 'M4x10 button', count: 2 };
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/kit.json'), JSON.stringify(a));
    assert.deepEqual(JSON.parse(cad('list', 'demo/kit', '--json')).fasteners.map((f) => [f.fastener, f.qty, f.from]).at(-1), ['M4x10 button', 2, ['side by side on the bench']]);
    // the link's build page carries the list, and each step its screws and key
    const out = cad('link', 'demo/kit', '--long'), { decode } = await import('@rulecad/model-link'), m = await decode(out.match(/view\s+(\S+)/)[1].split('#m=')[1]);
    assert.deepEqual(m.build.list.fasteners.slice(0, 2).map((f) => [f.fastener, f.qty, f.packs]), [['M3x8 cap', 12, 2], ['M3x12 cap', 4, 1]]);
    assert.ok(m.build.order.steps.some((st) => st.fasteners.some((f) => f.fastener === 'M3x8 cap' && f.count === 12 && f.key === '2.5 mm hex key')), JSON.stringify(m.build.order).slice(0, 400));
  } finally { done(); }
});

test('fasten.count: nuts of two threads in one assembly are each their own size, placed and listed apart', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'), { recursive: true });
    // a plate with one clearance hole for the thread it is set to, through its whole thickness
    object(ws, 'demo/plate', { uses: ['x1c'], variables: { thick: { value: 12, unit: 'mm', rule: 'The plate', tweak: { min: 2, max: 20 } }, thread: { value: 'M3', choice: ['M3', 'M4'], rule: 'The screw it takes' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [20, 20, v.thick], center: [0, 0, v.thick / 2] }), v.fixings.hole(v.thread, { depth: v.thick, at: [0, 0, v.thick] }))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['plate'] }));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/pair.json'), JSON.stringify({ title: 'An M3 and an M4 joint, each with a nut', kind: 'fit',
      items: [{ id: 'block3', object: 'plate' }, { id: 'top3', object: 'plate', at: [0, 0, 12], set: { thick: 3 } },
        { id: 'block4', object: 'plate', at: [40, 0, 0], set: { thread: 'M4' } }, { id: 'top4', object: 'plate', at: [40, 0, 12], set: { thick: 3, thread: 'M4' } }],
      fits: [{ a: 'top3', b: 'block3', min: 0, max: 0.05 }, { a: 'top4', b: 'block4', min: 0, max: 0.05 }, { a: 'block4', b: 'block3', fastens: true, note: 'side by side' }],
      fasten: [{ screw: 'M3 cap', through: ['top3'], into: 'block3', holes: 'top3.body', nut: true, note: 'M3 joint' }, { screw: 'M4 cap', through: ['top4'], into: 'block4', holes: 'top4.body', nut: true, note: 'M4 joint' }] }));
    const l = JSON.parse(cad('list', 'demo/pair', '--json'));
    assert.deepEqual(l.fasteners.filter((f) => f.kind === 'nut').map(({ fastener, qty, thread, from }) => ({ fastener, qty, thread, from })), [
      { fastener: 'M3 hex nut', qty: 1, thread: 'M3', from: ['M3 joint'] }, { fastener: 'M4 hex nut', qty: 1, thread: 'M4', from: ['M4 joint'] }]);
    const r = JSON.parse(cad('check', 'demo/pair', '--json'));
    assert.deepEqual(r.findings.filter((f) => f.level === 'fail').map((f) => f.text), [], 'the M4 nut is an M4 nut, so it overlaps nothing');
  } finally { done(); }
});

test('your own printer, and no extras configured', () => {
  const { ws, cad, done } = workspace({ printer: 'tiny' });
  try {
    fs.mkdirSync(path.join(ws, 'rules'));
    fs.writeFileSync(path.join(ws, 'rules/tiny.json'), JSON.stringify({ name: 'tiny', rules: { bed: { value: 5 }, overhang: { value: 45 }, layer: { value: 0.2 } } }));
    cad('new', 'demo/block');
    assert.match(cad('check', 'demo/block'), /bigger than the 5 mm bed/);
    assert.match(cad('show', 'demo/block'), /no "show" target/);
  } finally { done(); }
});

test('"display" settings and parts are read as the on-screen copy ("mirror", the old name, too)', async () => {
  const { readObject } = await import('./lib/design.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'display-')), json = path.join(dir, 'x.json');
  try {
    fs.writeFileSync(json, JSON.stringify({ display: { smooth: 8 }, parts: { legend: { display: false }, cap: {} } }));
    const o = readObject({ json });
    assert.deepEqual(o.mirror, { smooth: 8 });
    assert.equal(o.parts.legend.mirror, false);
    assert.equal(o.parts.cap.mirror, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('import-kle: a keyboard-layout-editor.com layout into the project, with notes on what it had to change', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.writeFileSync(path.join(ws, 'kle.json'), JSON.stringify([['Esc', { x: 0.5 }, 'F1'], [{ w: 1.5 }, 'Tab', { r: 10 }, 'Q']]));
    const out = cad('import-kle', 'kle.json', 'keys/mine');
    assert.match(out, /made projects[\\/]keys[\\/]layouts[\\/]mine\.json: 2 rows, 4 keys/); // \ on Windows
    assert.match(out, /note: rotated keys/);
    const layout = JSON.parse(fs.readFileSync(path.join(ws, 'projects/keys/layouts/mine.json'), 'utf8'));
    assert.deepEqual(layout.rows[0], ['Esc', { gap: 0.5 }, 'F1']);
    assert.match(cad('import-kle', 'kle.json', 'keys/mine'), /already exists/);
  } finally { done(); }
});

test('cad clone: a published KiCad board into a rule set, its source and licence kept, what boards here can\'t carry said', async () => {
  const { ws, cad, done } = workspace();
  try {
    const board = `(kicad_pcb (version 20211014) (generator pcbnew) (general (thickness 1.6))
      (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal))
      (footprint "R:R_0402" (layer "F.Cu") (at 5 5) (property "Reference" "R1")
        (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "GND")))
      (footprint "J:Pin" (layer "F.Cu") (at 9 5) (property "Reference" "J1")
        (pad "1" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 1) (property pad_prop_castellated) (layers *.Cu) (net 1 "A"))
        (pad "2" thru_hole circle (at 0 -2.54) (size 1.7 1.7) (drill 1) (layers *.Cu) (net 2 "GND")))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
      (zone (net 2) (net_name "GND") (layers "In1.Cu" "B.Cu")))`;
    fs.writeFileSync(path.join(ws, 'tiny.kicad_pcb'), board);
    const out = cad('clone', 'tiny.kicad_pcb', 'tiny', '--source', 'https://example.org/tiny', '--licence', 'CERN-OHL-S-2.0');
    assert.match(out, /made rules[\\/]tiny\.json: 2 parts, 2 nets, 10 × 10 mm, 4 copper layers, planes GND/);
    assert.match(out, /note: planes on inner layers: GND on inner1 \(2 pads\)/);
    assert.match(out, /note: castellated pads on 1 part \(J1\)/);
    assert.match(out, /placement: 0 small parts kept near the pins they serve/);
    assert.match(out, /is reciprocal: boards made from this must be shared under it too/);
    const set = JSON.parse(fs.readFileSync(path.join(ws, 'rules/tiny.json'), 'utf8'));
    assert.equal(set.licence, 'CERN-OHL-S-2.0');
    assert.deepEqual(set.rules.width, { value: 10, unit: 'mm', rule: set.rules.width.rule, kind: 'derived', source: 'https://example.org/tiny', licence: 'CERN-OHL-S-2.0', checked: set.rules.width.checked });
    assert.equal(set.rules.layers.value, 4);
    assert.deepEqual(set.circuit.nets, { A: ['R1.1', 'J1.1'], GND: ['R1.2', 'J1.2'] });
    assert.equal(set.circuit.source.from, 'https://example.org/tiny');
    const { schemaFindings } = await import('./lib/schema.mjs');
    assert.deepEqual(schemaFindings(set, 'rules', 'rules/tiny.json'), [], 'a valid rule set');
    const { resolve } = await import('@rulecad/variables');
    const v = resolve({ uses: ['tiny'], variables: {} }, { load: () => set }).values;
    assert.deepEqual(v.tiny.circuit.nets, set.circuit.nets, 'a design gets the circuit');
    assert.match(cad('clone', 'tiny.kicad_pcb', 'tiny'), /already exists/);
    assert.match(cad('clone', 'tiny.kicad_pcb', 'tiny2'), /no licence given/);
    assert.match(cad('clone', 'tiny.kicad_pcb', 'Tiny'), /usage: cad clone/);
    assert.match(cad('clone', 'missing.kicad_pcb', 'x'), /no file missing\.kicad_pcb/);
  } finally { done(); }
});

test('cad clone keeps each part\'s 3D model: a mesh beside a board read from a file, a box for a STEP-only one', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'lib'));
    fs.writeFileSync(path.join(ws, 'lib/r.wrl'), 'Shape { geometry IndexedFaceSet { coordIndex [0,1,2,-1] coord Coordinate { point [0 0 0,0.2 0 0,0 0.2 0.1] } } }');
    fs.writeFileSync(path.join(ws, 'lib/sock.step'), "DATA; #1=SI_UNIT(.MILLI.,.METRE.); #2=CARTESIAN_POINT('',(-4.,0.,-1.)); #3=CARTESIAN_POINT('',(4.,7.,1.)); ENDSEC;");
    const pad = (n, x) => `(pad "${n}" smd rect (at ${x} 0) (size 0.6 0.5) (layers "F.Cu") (net ${n} "N${n}"))`;
    fs.writeFileSync(path.join(ws, 'b.kicad_pcb'), `(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (footprint "R" (layer "F.Cu") (at 3 5) (property "Reference" "R1") ${pad(1, -0.5)} ${pad(2, 0.5)} (model "\${KIPRJMOD}/lib/r.wrl" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
      (footprint "J" (layer "F.Cu") (at 7 5) (property "Reference" "J1") ${pad(1, -1)} ${pad(2, 1)} (model "\${KIPRJMOD}/lib/sock.step" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
    const out = cad('clone', 'b.kicad_pcb', 'b', '--licence', 'MIT');
    assert.match(out, /3D models: 1 as meshes \(in models\/\), 1 as boxes the size of the part/);
    const set = JSON.parse(fs.readFileSync(path.join(ws, 'rules/b.json'), 'utf8')), models = set.circuit.models;
    assert.equal(models['${KIPRJMOD}/lib/r.wrl'].mesh, 'models/source/r.json');
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, 'models/source/r.json'), 'utf8')).triangles.length, 1);
    assert.deepEqual(models['${KIPRJMOD}/lib/sock.step'].box, { min: [-4, 0, -1], max: [4, 7, 1] });
    assert.doesNotMatch(cad('clone', 'b.kicad_pcb', 'b2', '--licence', 'MIT', '--no-models'), /3D models/);
  } finally { done(); }
});

test('cad agents: AGENTS.md for AI agents, included from CLAUDE.md without losing what was there', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.writeFileSync(path.join(ws, 'CLAUDE.md'), 'Our own notes.\n');
    assert.match(cad('agents'), /wrote AGENTS\.md/);
    assert.match(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Rules first/);
    assert.equal(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8'), 'Our own notes.\n\n@AGENTS.md\n');
    cad('agents');
    assert.equal(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8'), 'Our own notes.\n\n@AGENTS.md\n', 'only once');
    // An AGENTS.md edited here is kept, unless --force
    fs.appendFileSync(path.join(ws, 'AGENTS.md'), '\n## Our house rules\n');
    assert.match(cad('agents'), /AGENTS\.md here has been edited .*: it is kept as it is \(cad agents --force replaces it\)/);
    assert.match(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Our house rules/);
    cad('agents', '--force');
    assert.doesNotMatch(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Our house rules/);
  } finally { done(); }
});

test('cad set refuses a value outside its range, cad add fit a part that isn\'t there; --json is JSON for rules, variants, history and export', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'home/tray');
    assert.match(cad('set', 'home/tray', 'width=-5'), /not changed: width = -5 is outside its range/);
    assert.match(cad('set', 'home/tray', 'width=50'), /set width/);
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/pair.json'), JSON.stringify({ title: 'Pair', kind: 'fit', items: [{ id: 'a', object: 'tray' }, { id: 'b', object: 'tray', at: [100, 0, 0] }] }));
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'a.lid', '--b', 'b.body', '--min', '0', '--max', '1'), /fit a: tray has no part "lid" \(parts: body\)/);
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'c.body', '--b', 'b.body', '--min', '0', '--max', '1'), /fit a: no item "c" in home\/pair/);
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'a.body', '--b', 'b.body', '--min', '0', '--max', '1'), /added a fit/);
    for (const args of [['rules', 'home/tray'], ['variants', 'home/tray'], ['history', 'home/tray'], ['export', 'home/tray']]) {
      const out = cad(...args, '--json');
      assert.doesNotThrow(() => JSON.parse(out), `${args.join(' ')} --json: ${out}`);
    }
    assert.ok(JSON.parse(cad('export', 'home/tray', '--json')).file.endsWith('.3mf'));
  } finally { done(); }
});

// Write an object (its .json and .js) into a workspace
const object = (ws, ref, json, js) => {
  const [project, name] = ref.split('/'), dir = path.join(ws, 'projects', project, 'objects');
  fs.mkdirSync(dir, { recursive: true });
  const pj = path.join(ws, 'projects', project, 'project.json');
  const p = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : { name: project, objects: [] };
  if (!p.objects.includes(name)) p.objects.push(name);
  fs.writeFileSync(pj, JSON.stringify(p));
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, title: name, version: '0.1.0', ...json }));
  fs.writeFileSync(path.join(dir, `${name}.js`), js);
};
const BOX = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives, { translate } = jscad.transforms
export function main (v) { return translate([0, 0, v.h / 2], cuboid({ size: [v.w, v.d, v.h] })) }
`;

test('a link too long for chat says so, and how to get short ones', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/ball', { variables: { r: { value: 10, unit: 'mm', rule: 'Radius' }, n: { value: 256, unit: 'segments', rule: 'Smooth' } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.transforms.translate([0, 0, v.r], jscad.primitives.sphere({ radius: v.r, segments: v.n })) }\n");
    const r = spawnSync(process.execPath, [BIN, 'link', 'demo/ball', '--md'], { cwd: ws, encoding: 'utf8' });
    assert.ok(/too long for chat or email\. For short links, add "shorten": "gist"/.test(r.stderr), 'the warning is on stderr'); // (no regex match: the link is huge)
    assert.equal(r.stdout.trim().split('\n').length, 1, '--md still prints one line');
  } finally { done(); }
});

test('objects read each other: a frame sized from a plate follows it, versions are checked, and loops are named', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/plate', { variables: { w: { value: 40, unit: 'mm', rule: 'Plate width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } } }, BOX);
    object(ws, 'demo/frame', { uses: ['demo/plate@^0.1.0'], variables: {
      w: { value: 'plate.w + 2', unit: 'mm', rule: 'Round the plate' }, d: { value: 'plate.d + 2', unit: 'mm', rule: 'Round the plate' }, h: { value: 'plate.h', unit: 'mm', rule: 'As thick' } } }, BOX);
    assert.match(cad('check', 'demo/frame'), /42 × 22 × 2 mm/);
    assert.match(cad('rules', 'demo/frame'), /plate\.w.*demo\/plate@0\.1\.0/);
    const pj = path.join(ws, 'projects/demo/objects/plate.json'), plate = JSON.parse(fs.readFileSync(pj, 'utf8'));
    fs.writeFileSync(pj, JSON.stringify({ ...plate, variables: { ...plate.variables, w: { ...plate.variables.w, value: 50 } } }));
    assert.match(cad('check', 'demo/frame'), /52 × 22 × 2 mm/, 'the frame follows the plate');
    fs.writeFileSync(pj, JSON.stringify({ ...plate, version: '1.0.0' }));
    assert.match(cad('check', 'demo/frame'), /uses demo\/plate \^0\.1\.0, but demo\/plate is 1\.0\.0/);
    fs.writeFileSync(pj, JSON.stringify({ ...plate, uses: ['demo/frame'] }));
    assert.match(cad('check', 'demo/frame'), /read each other's numbers/);
  } finally { done(); }
});

test('a holes fit follows a board\'s mounting holes into what they screw into: inserts under them pass, moved ones fail', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'rules'));
    fs.writeFileSync(path.join(ws, 'rules/demo.json'), JSON.stringify({ name: 'demo', rules: { insert: { value: 3, unit: 'mm', rule: 'Insert depth', kind: 'spec' } } }));
    object(ws, 'demo/board', { engine: 'pcb', role: 'board', uses: ['jlcpcb'], parts: { board: { label: 'PCB' } }, variables: {
      w: { value: 30, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, thickness: { value: 'jlcpcb.thickness', unit: 'mm', rule: 'Standard' },
      hx: { value: 11, unit: 'mm', rule: 'Hole from the centre' } } },
    "export function main (v) { return { center: { x: 0, y: 0 }, width: v.w, height: v.d, thickness: v.thickness, parts: [], traces: [], silk: [], holes: [-1, 1].map((s) => v.pcb.mount('M2', s * v.hx, 0)) } }\n"); // (named by thread: m2.clearance, as drilled)
    const block = (offset) => `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives, { translate } = jscad.transforms, { subtract } = jscad.booleans
export function main (v) {
  const holes = v.board.board_holes.map((h) => translate([h.x + v.shift, h.y, v.h - v.demo.insert / 2], cylinder({ radius: v.r, height: v.demo.insert })))
  return subtract(translate([0, 0, -v.h / 2], cuboid({ size: [v.board.board_w, v.board.board_d, v.h] })), ...holes.map((c) => translate([0, 0, -v.h], c)))
}
`;
    const vars = { h: { value: 6, unit: 'mm', rule: 'Block height' }, r: { value: 1.6, unit: 'mm', rule: 'Insert hole radius' }, shift: { value: 0, unit: 'mm', rule: 'Holes moved by' } };
    object(ws, 'demo/block', { uses: ['demo', 'demo/board'], variables: vars }, block());
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/stack.json'), JSON.stringify({ title: 'Board on block', kind: 'fit', uses: ['demo'], items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }],
      fits: [{ holes: 'pcb.board', into: 'blk.body', depth: 'demo.insert', label: 'Screws find their inserts' }, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, label: 'Board on block' }] }));
    assert.match(cad('check', 'demo/stack'), /Screws find their inserts: 2 of 2 holes clear for 3 mm, with material around each/);
    // the same board fastened: its own holes (v.pcb.mount('M2'), 2.4 mm) held to the thread's clearance hole as the fab drills it, not as printed
    const asm = { title: 'Board screwed to block', kind: 'fit', items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }],
      fasten: [{ screw: 'M2 cap', through: ['pcb'], into: 'blk', holes: 'pcb.board' }] };
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/screwed.json'), JSON.stringify(asm));
    const screwed = JSON.parse(cad('check', 'demo/screwed', '--json')).findings, of = (c) => screwed.filter((x) => x.code === c);
    assert.deepEqual(of('fasten.clearance').map((x) => [x.level, x.text]), [['pass', "pcb to blk, 2 M2 cap screws: pcb's hole measures 2.4 mm, an M2 clearance hole as drilled (m2.clearance 2.4 mm)"]]);
    assert.deepEqual(of('fasten.clearance')[0].values, { diameter: 2.4, wanted: 2.4, least: 2.2, most: 2.6 });
    assert.equal(of('fasten.holes').filter((x) => x.level === 'pass').length, 1, JSON.stringify(of('fasten.holes')));
    assert.match(cad('list', 'demo/screwed'), /2 ×\s+M2x\d+ cap/);
    // a workspace's own M2 set moves the board's holes: v.pcb.mount reads it before the kit's
    const m2 = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../rules/m2.json', import.meta.url)), 'utf8'));
    fs.writeFileSync(path.join(ws, 'rules/m2.json'), JSON.stringify({ ...m2, rules: { ...m2.rules, clearance: { ...m2.rules.clearance, value: 2.5 } } }));
    assert.match(cad('check', 'demo/screwed'), /pcb's hole measures 2\.5 mm, an M2 clearance hole as drilled \(m2\.clearance 2\.5 mm\)/);
    fs.rmSync(path.join(ws, 'rules/m2.json'));
    const bj = path.join(ws, 'projects/demo/objects/block.json'), b = JSON.parse(fs.readFileSync(bj, 'utf8'));
    fs.writeFileSync(bj, JSON.stringify({ ...b, variables: { ...vars, shift: { ...vars.shift, value: 4 } } }));
    const moved = cad('check', 'demo/stack');
    assert.match(moved, /Screws find their inserts: hole at -11, 0 mm: solid/, 'moved inserts: the screws hit solid');
    assert.match(moved, /pcb\.board \/ blk\.body: closest gap 0 mm/, 'while the gap fit alone still passes');
  } finally { done(); }
});

test('fasten.suggest: a holes fit and a fit that fastens the same parts suggest the fasten that says both; cad add fasten --from-fits puts it in their place', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/board', { engine: 'pcb', role: 'board', uses: ['jlcpcb', 'm2'], parts: { board: { label: 'PCB' } }, variables: {
      w: { value: 30, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, thickness: { value: 'jlcpcb.thickness', unit: 'mm', rule: 'Standard' },
      hx: { value: 11, unit: 'mm', rule: 'Hole from the centre' }, hd: { value: 'm2.clearance', unit: 'mm', rule: 'M2 clearance' } } },
    'export function main (v) { return { center: { x: 0, y: 0 }, width: v.w, height: v.d, thickness: v.thickness, parts: [], traces: [], silk: [], holes: [-1, 1].map((s) => ({ x: s * v.hx, y: 0, d: v.hd })) } }\n');
    object(ws, 'demo/block', { uses: ['x1c', 'demo/board'], variables: { h: { value: 'x1c.layer * 30', unit: 'mm', rule: 'Whole layers' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const block = cuboid({ size: [v.board.board_w, v.board.board_d, v.h], center: [0, 0, 0 - v.h / 2] })
  return v.ops.subtract(block, ...v.board.board_holes.map((h) => v.fixings.hole('M2', { kind: 'pilot', depth: v.h - v.x1c.layer * 2, at: [h.x, h.y, 0] })))
}
`);
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['board', 'block'] }));
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const file = path.join(ws, 'projects/demo/assemblies/stack.json');
    const write = (fits) => fs.writeFileSync(file, `${JSON.stringify({ title: 'Board on block', kind: 'fit', uses: ['x1c', 'm2'], items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }], fits }, null, 2)}\n`);
    const holes = { holes: 'pcb.board', into: 'blk.body', depth: 'x1c.layer * 20', label: 'Screws find their pilots' };
    const check = () => { const out = cad("check", "demo/stack", "--json"); try { return JSON.parse(out).findings; } catch { assert.fail(out); } };
    // the two older forms together: a note with the fasten to paste, the screw read from the board's holes as drawn (2.4 mm: M2)
    write([holes, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, fastens: true, label: 'Board on block' }]);
    let notes = check().filter((x) => x.code === 'fasten.suggest');
    assert.equal(notes.length, 1); assert.equal(notes[0].level, 'info');
    assert.equal(notes[0].text, 'Screws find their pilots and the fit that fastens pcb to blk are one screwed joint: a fasten says both and knows the screw (its holes, length, thread engaged, the seat under its head and the key that turns it). In place of the two, add to "fasten": {"screw":"M2 cap","through":["pcb.board"],"into":"blk.body","holes":"pcb.board","note":"Screws find their pilots"}, or run cad add fasten demo/stack --from-fits');
    assert.deepEqual(notes[0].refs, { fits: [0, 1], items: ['pcb', 'blk'], paste: { screw: 'M2 cap', through: ['pcb.board'], into: 'blk.body', holes: 'pcb.board', note: 'Screws find their pilots' } });
    // the fit's fastener names the screw where it gives one; a thread set in the depth, where it does not
    write([holes, { a: 'blk', b: 'pcb', fastens: true, fastener: 'M2x8', count: 2 }]);
    assert.equal(check().find((x) => x.code === 'fasten.suggest').refs.paste.screw, 'M2x8 cap');
    write([{ ...holes, depth: 'm2.pilot_depth' }, { a: 'blk', b: 'pcb', fastens: true, note: 'Two screws' }]);
    assert.equal(check().find((x) => x.code === 'fasten.suggest').refs.paste.screw, 'M2 cap');
    // either alone, or a fasten already there: no note
    write([holes]); assert.ok(!check().some((x) => x.code === 'fasten.suggest'), 'a holes fit alone');
    write([{ a: 'pcb.board', b: 'blk.body', fastens: true }]); assert.ok(!check().some((x) => x.code === 'fasten.suggest'), 'a fit that fastens alone');
    // --from-fits: the holes fit goes, the fit that fastens keeps its gap range only, and the fasten is added; the check then follows the screws
    write([holes, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, fastens: true, fastener: 'M2 screws', count: 2, label: 'Board on block' }]);
    assert.match(cad('add', 'fasten', 'demo/stack', '--from-fits'), /added a fasten to .*stack\.json in place of its holes fit and its fit that fastens/);
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(a.fits, [{ a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, label: 'Board on block' }]);
    assert.deepEqual(a.fasten, [{ screw: 'M2 cap', through: ['pcb.board'], into: 'blk.body', holes: 'pcb.board', note: 'Screws find their pilots' }]);
    assert.match(fs.readFileSync(file, 'utf8'), /^\{\n  "title": "Board on block",\n/, 'the file keeps its layout');
    const after = check();
    assert.ok(!after.some((x) => x.code === 'fasten.suggest'), 'said once, then gone');
    assert.deepEqual(after.filter((x) => x.level === 'fail').map((x) => x.text), []);
    assert.equal(after.find((x) => x.code === 'fasten.end').level, 'pass');
    assert.match(cad('list', 'demo/stack'), /2 ×\s+M2x\d+ cap/);
    // a fit that fastens with no range goes whole; with nothing to replace, it says so; a screw given is used
    write([holes, { a: 'blk', b: 'pcb', fastens: true }]);
    const j = JSON.parse(cad('add', 'fasten', 'demo/stack', '--from-fits', '--screw', 'M2x6 cap', '--json'));
    assert.deepEqual(j.added.map((x) => x.screw), ['M2x6 cap']);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).fits, []);
    assert.match(cad('add', 'fasten', 'demo/stack', '--from-fits'), /no holes fit with a fit that fastens the same two items/);
  } finally { done(); }
});

// A rail-like test part: a plate with a key standing on part of it, and a notch in the key's top
async function railPart() {
  const { primitives: { cuboid }, booleans: { union, subtract }, transforms: { translate } } = (await import('@jscad/modeling')).default;
  const box = (lo, size) => translate(lo.map((a, i) => a + size[i] / 2), cuboid({ size }));
  const g = subtract(union(box([0, -5, 0], [40, 10, 2]), box([10, -2, 2], [20, 4, 3])), box([18, -3, 3.5], [4, 6, 2]));
  const { polygons } = await import('./lib/design.mjs');
  return polygons(g, { triangulate: true }).flatMap((p) => p.slice(1, -1).map((_, i) => [p[0], p[i + 1], p[i + 2]]));
}

test('mesh: the stretches with the same section, lines along a part, and STL and 3MF files read back', async () => {
  const m = await import('./lib/mesh.mjs');
  const tris = await railPart();
  const runs = m.profiles(tris, 0).map((r) => [r.from, r.to, r.shape]);
  assert.deepEqual(runs, [[0, 10, 0], [10, 18, 1], [18, 22, 2], [22, 30, 1], [30, 40, 0]], 'plate, key, notch, key, plate: the same sections numbered alike');
  const key = m.profiles(tris, 0)[1];
  assert.deepEqual(key.bands.map((b) => [b.from, b.to, b.pieces]), [[0, 2, 1], [2, 5, 1]], 'a step where the key stands on the plate splits the bands');
  assert.deepEqual(m.spans(tris, 0, [0, 4]).map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]), [[10, 18], [22, 30]]);
  // binary STL, ASCII STL and our own 3MF, read back
  const bin = Buffer.alloc(84 + tris.length * 50);
  bin.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.forEach((v, j) => v.forEach((x, k) => bin.writeFloatLE(x, 84 + i * 50 + 12 + j * 12 + k * 4))));
  const ascii = `solid t\n${tris.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((v) => `vertex ${v.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid t\n`;
  const { threemf } = await import('./lib/threemf.mjs');
  const zip = Buffer.from(await threemf([{ name: 'rail', parts: [{ name: 'body', triangles: tris, slot: 1 }] }]));
  for (const read of [m.readStl(bin), m.readStl(Buffer.from(ascii)), m.read3mf(zip)]) {
    assert.equal(read.length, tris.length);
    assert.deepEqual(m.bounds(read).size.map((x) => Math.round(x * 100) / 100), [40, 10, 5]);
  }
  // laid back over itself after a quarter turn and a shift
  const moved = m.turn(tris, m.parsePlacement('rz90').M, [5, -7, 3]);
  assert.ok(m.align(moved, tris).score < 0.01, 'found the turn and shift back');
});

test('cad measure and cad match: a model measured into draft rules, and a design checked against it both ways', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    cad('export', 'bathroom/soap-tray');
    const file = 'exports/bathroom/soap-tray@0.1.0.3mf';
    const same = cad('match', 'bathroom/soap-tray', file, '--no-pictures', '--samples', '3000');
    assert.match(same, /✓ the design's surface: 95% within 0 mm/);
    assert.match(same, /✓ the reference's surface/);
    const wider = cad('match', 'bathroom/soap-tray', file, '--no-pictures', '--samples', '3000', '--set', 'width=60');
    assert.match(wider, /✗ the design's surface/);
    assert.match(wider, /outside the reference \(extra material\)/);
    const measured = cad('measure', file, '--no-pictures', '--rules', 'tray', '--licence', 'CC BY-NC-SA 4.0', '--line', '0,1');
    assert.match(measured, /a closed solid/);
    assert.match(measured, /40 × 30 × 10 mm/);
    assert.match(measured, /licence "CC BY-NC-SA 4.0" limits reuse/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/tray.json'), 'utf8')).rules;
    assert.equal(rules.size_x.value, 40);
    assert.equal(rules.size_x.kind, 'derived');
    assert.equal(rules.size_x.licence, 'CC BY-NC-SA 4.0');
    assert.match(cad('measure', file, '--no-pictures', '--rules', 'tray'), /already exists/);
  } finally { done(); }
});

test('cad measure --profile: a beam\'s section from a model or a DXF, as a draft profile set with its outline, its slots matched to a family', async () => {
  const { profileModel, outline, slotModel } = await import('@rulecad/frames'), jscad = (await import('@jscad/modeling')).default, { readDxf } = await import('./lib/profilemeasure.mjs');
  const { ws, cad, done } = workspace();
  try {
    const run = (...a) => spawnSync('node', [BIN, ...a], { cwd: ws, encoding: 'utf8' }), read = (p) => JSON.parse(fs.readFileSync(path.join(ws, p), 'utf8'));
    // a beam built from the kit's own outline: the outline extruded with JSCAD, off the origin, written as a binary STL
    const stl = (file, loops, length = 90, [dx, dy] = [0, 0]) => {
      const solid = jscad.extrusions.extrudeLinear({ height: length }, jscad.primitives.polygon({ points: loops.map((l) => l.map(([x, y]) => [x + dx, y + dy])) }));
      const tris = jscad.geometries.geom3.toPolygons(solid).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]])), buf = Buffer.alloc(84 + tris.length * 50);
      buf.writeUInt32LE(tris.length, 80); tris.forEach((t, i) => t.forEach((v, k) => v.forEach((c, a) => buf.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4)))); fs.writeFileSync(path.join(ws, file), buf);
    };
    const kit = profileModel('2020-misumi-hfs5'), family = slotModel('slot-6-misumi');
    stl('hfs5.stl', outline(kit).loops, 90, [30, 12]);
    const out = cad('measure', 'hfs5.stl', '--profile', 'profile-2020-measured', '--no-pictures', '--source', 'https://example.com/hfs5-2020.step', '--licence', 'CC BY-NC-SA 4.0');
    assert.match(out, /hfs5\.stl: the section across z at 45, the middle of a stretch of 90 mm that keeps it/); assert.match(out, /20 × 20 mm, 1 hole, area 182\.49 mm²/);
    assert.match(out, /slot A × 4 \(top, bottom, front, back\): opening 6, lip 2, 12 under the lips, 6 deep, floor 5\.9\d?\n {4}matches slot-6-misumi within 0(\.0\d)? mm/);
    assert.match(out, /1 bore Ø4\.2\d? at the cells' middles/); assert.match(out, /licence "CC BY-NC-SA 4\.0" limits reuse: measurements are facts, but the outline is the model's shape\. Keep it in this workspace/);
    assert.match(out, /draft profile: rules\/profile-2020-measured\.json \(8 values, kind derived\)\n {2}outline: {7}rules\/outlines\/profile-2020-measured\.json \(2 loops\)/);
    // the draft: each figure derived, with the model's source and licence; the slot named by the family it matched
    const set = read('rules/profile-2020-measured.json'), r = set.rules;
    assert.deepEqual(Object.keys(r), ['family', 'series', 'cells_across', 'cells_up', 'width', 'height', 'slot', 'bore_diameter']); assert.equal(set.part, 'profile');
    assert.deepEqual([r.family.value, r.series.value, r.cells_across.value, r.cells_up.value, r.width.value, r.height.value, r.slot.value, Math.round(r.bore_diameter.value * 10) / 10], ['t-slot', 20, 1, 1, 20, 20, 'slot-6-misumi', 4.2]);
    for (const [k, x] of Object.entries(r)) assert.deepEqual([x.kind, x.source, x.licence], ['derived', 'https://example.com/hfs5-2020.step', 'CC BY-NC-SA 4.0'], k);
    assert.match(set._doc, /The outline is the model's shape: it stays in this workspace/);
    // the outline: in the workspace, with its source and licence, about the middle of its envelope whatever the model's origin
    const o = read('rules/outlines/profile-2020-measured.json'), xs = o.loops.flat().map((p) => p[0]), ys = o.loops.flat().map((p) => p[1]);
    assert.deepEqual([o.source, o.licence, o.unit, o.loops.length], ['https://example.com/hfs5-2020.step', 'CC BY-NC-SA 4.0', 'mm', 2]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-10, 10, -10, 10]);
    assert.deepEqual(fs.readdirSync(new URL('../rules/outlines/', import.meta.url)), ['profile-custom.json'], 'nothing measured goes into the kit');
    // the slot found, against the set the beam was drawn from: within 0.1 mm, figure by figure
    const drawing = fs.readFileSync(path.join(ws, '.preview/measure/profile-2020-measured-profile.svg'), 'utf8');
    const got = drawing.match(/opening ([\d.]+), lip ([\d.]+), ([\d.]+) under the lips, ([\d.]+) deep: matches slot-6-misumi/).slice(1).map(Number);
    [family.opening, family.lip, family.cavityWidth, family.cavityDepth].forEach((want, i) => assert.ok(Math.abs(got[i] - want) <= 0.1, `slot figure ${i}: ${got[i]} against ${want}`));
    assert.match(drawing, /What was found \(check each against the bar in hand\)/); assert.match(drawing, /1 {2}bore Ø4\.2\d? at 0, 0/); assert.match(drawing, /the outline stays in this workspace/);
    // and it is a profile the kit can use: it checks, and draws from the measured outline
    assert.match(cad('rules', 'check', 'profile-2020-measured'), /^1 of 1 rule sets pass\n$/);
    cad('rules', 'draw', 'profile-2020-measured'); assert.match(fs.readFileSync(path.join(ws, 'profile-2020-measured.svg'), 'utf8'), />drawn from its outline: https:\/\/example\.com\/hfs5-2020\.step</);
    assert.match(cad('measure', 'hfs5.stl', '--profile', 'profile-2020-measured', '--no-pictures'), /already exists \(--force to replace them\)/);

    // ---- the same section from a DXF: the outside as lines one by one in any order, the bore a CIRCLE, in inches ----
    const loops = outline(kit).loops, dxf = (entities, units = 4) => ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(units), '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
    const lines = (loop, k = 1) => loop.map((p, i) => [p, loop[(i + 1) % loop.length]]).sort((a, b) => a[0][0] * 7 + a[0][1] - b[0][0] * 7 - b[0][1]).flatMap(([[x, y], [x2, y2]], i) => (i % 2 ? ['0', 'LINE', '8', '0', '10', String(x * k), '20', String(y * k), '11', String(x2 * k), '21', String(y2 * k)] : ['0', 'LINE', '8', '0', '10', String(x2 * k), '20', String(y2 * k), '11', String(x * k), '21', String(y * k)]));
    fs.writeFileSync(path.join(ws, 'section.dxf'), dxf([...lines(loops[0], 1 / 25.4), '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', String(2.1 / 25.4), '0', 'TEXT', '1', 'HFS5-2020'], 1));
    const fromDxf = cad('measure', 'section.dxf', '--profile', 'profile-2020-dxf', '--no-pictures');
    assert.match(fromDxf, /section\.dxf: the DXF's outline\n {2}its units are inches: turned into mm\n {2}passed over: 1 TEXT\n {2}20 × 20 mm, 1 hole/);
    assert.match(fromDxf, /opening 6, lip 2, 12 under the lips, 6 deep, floor 5\.9\d?\n {4}matches slot-6-misumi within 0(\.0\d)? mm/); assert.match(fromDxf, /1 bore Ø4\.2 at the cells' middles/); assert.match(fromDxf, /no --licence given: say what terms the model came under/);
    const d = read('rules/profile-2020-dxf.json').rules; assert.deepEqual([d.slot.value, d.bore_diameter.value, d.width.value, d.slot.licence], ['slot-6-misumi', 4.2, 20, undefined]);
    assert.match(cad('rules', 'check', 'profile-2020-dxf'), /^1 of 1 rule sets pass\n$/);
    assert.match(cad('measure', 'section.dxf'), /a DXF is a drawing of a section, not a model: cad measure <section\.dxf> --profile <name>/);
    // the reader on its own: a polyline's bulges are arcs, an ARC and lines join into a loop, and what it cannot read it refuses by name
    const rounded = readDxf(dxf(['0', 'LWPOLYLINE', '90', '8', '70', '1', ...[[-8, -5, 0], [8, -5, Math.tan(Math.PI / 8)], [10, -3, 0], [10, 3, Math.tan(Math.PI / 8)], [8, 5, 0], [-8, 5, Math.tan(Math.PI / 8)], [-10, 3, 0], [-10, -3, Math.tan(Math.PI / 8)]].flatMap(([x, y, b]) => ['10', String(x), '20', String(y), '42', String(b)])]));
    const area = (l) => Math.abs(l.reduce((sum, [x, y], i) => sum + x * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * y, 0) / 2);
    assert.ok(Math.abs(area(rounded.loops[0]) - (20 * 10 - (4 - Math.PI) * 4)) < 0.03, `a 20 x 10 rectangle with corners of radius 2: ${area(rounded.loops[0])}`);
    const dee = readDxf(dxf(['0', 'ARC', '10', '0', '20', '0', '40', '5', '50', '270', '51', '90', '0', 'LINE', '10', '0', '20', '5', '11', '0', '21', '-5'])); assert.ok(Math.abs(area(dee.loops[0]) - (Math.PI * 25) / 2) < 0.03, `a half disc from an arc and a line: ${area(dee.loops[0])}`);
    assert.throws(() => readDxf(dxf(['0', 'SPLINE', '10', '0', '20', '0'])), /the DXF has a spline \(SPLINE\), which this does not read: export the section as lines, arcs and polylines/);
    assert.throws(() => readDxf(dxf(['0', 'ELLIPSE', '10', '0', '20', '0'])), /an ellipse \(ELLIPSE\)/);
    assert.throws(() => readDxf(dxf(['0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0', '0', 'LINE', '10', '10', '20', '0', '11', '10', '21', '10', '0', 'LINE', '10', '10', '20', '10', '11', '0', '21', '0.5'])), /the DXF's outline is not closed: a run of 3 lines and arcs ends 0\.5 mm from where it starts, at 0, 0\.5/);
    assert.throws(() => readDxf(dxf(lines(loops[0]), 2)), /the DXF's units \(\$INSUNITS 2\) are not ones this reads/); assert.throws(() => readDxf('hello\nworld\n'), /not a DXF/);

    // ---- a slot no family fits: drafted as a family of its own, which the profile names ----
    const odd = profileModel('2020-misumi-hfs5', {}, { sets: { 'slot-6-misumi': { name: 'slot-6-misumi', part: 'slot', rules: Object.fromEntries(Object.entries({ opening: 7, lip_thickness: 2.5, cavity_width: 11.4, cavity_depth: 5.6, floor_width: 6.4, flank_angle: 45 }).map(([k, value]) => [k, { value }])) } } });
    stl('odd.stl', outline(odd).loops, 60);
    const drafted = cad('measure', 'odd.stl', '--profile', 'profile-2020-odd', '--no-pictures');
    assert.match(drafted, /opening 7, lip 2\.5, 11\.4 under the lips, 5\.6 deep, floor 6\.4\d?\n {4}no slot family within 0\.1 mm \(nearest slot-[a-z0-9-]+, 0\.\d+ off\): drafted as slot-7-2020-odd/); assert.match(drafted, /draft slot: {4}rules\/slot-7-2020-odd\.json/);
    const slot = read('rules/slot-7-2020-odd.json'); assert.equal(slot.part, 'slot'); assert.deepEqual([slot.rules.opening.value, slot.rules.lip_thickness.value, slot.rules.cavity_width.value, slot.rules.cavity_depth.value, slot.rules.opening.kind], [7, 2.5, 11.4, 5.6, 'derived']);
    assert.ok(Math.abs(slot.rules.flank_angle.value - 45) < 1.5 && Math.abs(slot.rules.floor_width.value - 6.4) < 0.1); assert.equal(read('rules/profile-2020-odd.json').rules.slot.value, 'slot-7-2020-odd');
    assert.match(cad('rules', 'check', 'profile-2020-odd', 'slot-7-2020-odd'), /^2 of 2 rule sets pass\n$/);
    // a wider tolerance takes the nearest family where a person says that is near enough
    assert.match(cad('measure', 'odd.stl', '--profile', 'profile-2020-near', '--no-pictures', '--tol', '1.2'), /matches slot-[a-z0-9-]+ within [01](\.\d+)? mm/);

    // ---- a V-slot rail of two cells standing up: turned to lie flat, its track found; a plain tube has no slot at all ----
    stl('v2040.stl', outline(profileModel('2040-openbuilds')).loops.map((l) => l.map(([x, y]) => [-y, x])), 70);
    const v = cad('measure', 'v2040.stl', '--profile', 'profile-2040-v', '--no-pictures');
    assert.match(v, /turned a quarter turn to lie flat\n {2}40 × 20 mm, 3 holes/); assert.match(v, /slot A × 6 \(top, bottom, front, back\): opening 6\.25, lip 1\.8\d?, 11 under the lips, 6\.1 deep, floor 5\.7\d?, V mouth 9\.16 at 9[01](\.\d+)?°\n {4}matches slot-6-openbuilds/);
    assert.match(v, /2 bores Ø4\.2\d? at the cells' middles/); assert.match(v, /1 hollow: 12\.2 × 16\.4 \(in the outline, not in the rules\)/);
    const vr = read('rules/profile-2040-v.json').rules; assert.deepEqual([vr.family.value, vr.cells_across.value, vr.cells_up.value, vr.series.value, vr.slot.value], ['v-slot', 2, 1, 20, 'slot-6-openbuilds']);
    stl('tube.stl', outline(profileModel('tube', { width: 30, height: 20, wall: 2 })).loops, 50);
    const tube = cad('measure', 'tube.stl', '--profile', 'profile-tube-measured', '--no-pictures'); assert.match(tube, /30 × 20 mm, 1 hole, area 184 mm²/); assert.match(tube, /no slot for a nut found: written as a custom profile/);
    assert.equal(read('rules/profile-tube-measured.json').rules.family.value, 'custom'); assert.match(cad('rules', 'check', 'profile-tube-measured'), /^1 of 1 rule sets pass\n$/);
    // refusals, by name
    assert.match(cad('measure', 'hfs5.stl', '--profile', 'Profile 2020'), /--profile <name>: lower case, digits, - and _/);
    assert.match(cad('measure', 'hfs5.stl', '--profile'), /--profile needs a value after it/);
    assert.match(cad('measure', 'hfs5.stl', '--profile', 'x', '--tol', '0'), /--tol is how close a slot must be to a known family, in mm, above 0/);
    fs.writeFileSync(path.join(ws, 'beam.step'), 'ISO-10303-21;'); assert.match(cad('measure', 'beam.step', '--profile', 'x'), /a profile is measured from an STL or 3MF model of the beam, or a DXF of its section \(not \.step\)/);
    assert.equal(run('measure', 'nothing.stl', '--profile', 'x').status, 1);
  } finally { done(); }
});

test('a pose that sets an item\'s variables: the part drawn that way in that pose, as printed in the others', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 40, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } };
    object(ws, 'demo/base', { variables: vars }, BOX);
    object(ws, 'demo/post', { variables: { ...vars, h: { value: 10, unit: 'mm', rule: 'Height', tweak: { min: 1, max: 30 } } } }, BOX);
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    // The post stands on the base; a block 8 mm up only clears it while the post is pressed down to 5 mm
    const write = (poses) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/press.json'), JSON.stringify({ title: 'Press', kind: 'fit',
      items: [{ id: 'base', object: 'base' }, { id: 'post', object: 'post', at: [0, 0, 'base.h'] }, { id: 'stop', object: 'base' }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { at: [0, 0, 8], axis: [0, 0, 1] }, child: { item: 'stop', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 50 }], poses }));
    write({ pressed: { slide: 0, 'post.h': 5 }, free: { slide: 0 } });
    const out = cad('check', 'demo/press');
    assert.match(out, /2 poses checked: pressed, free/);
    assert.match(out, /free: post\.body and stop\.body overlap/, 'as printed, the post reaches the stop');
    assert.doesNotMatch(out, /pressed: post\.body and stop\.body overlap/, 'pressed, it clears it');
    assert.match(cad('check', 'demo/press', '--pose', 'pressed'), /no parts overlap/);
    write({ pressed: { slide: 0, 'post.h': 'base.h * 2' } }); // an expression in the assembly's names
    assert.match(cad('check', 'demo/press'), /no parts overlap/);
    // Its link opens free, and carries the post's pressed shape for the page to swap in when the pose is picked
    write({ free: { slide: 0 }, pressed: { slide: 0, 'post.h': 5 } });
    const lib = path.join(path.dirname(BIN), '../lib/');
    const out2 = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly } from ${JSON.stringify(pathToFileURL(lib + 'assembly.mjs').href)};
      import { assemblyModel } from ${JSON.stringify(pathToFileURL(lib + 'links.mjs').href)};
      import { encode, decode, partsOf, posesOf } from '@rulecad/model-link';
      const m = await decode(await encode(await assemblyModel(await buildAssembly('demo/press'), { title: 'Press' })));
      console.log(JSON.stringify({ parts: partsOf(m).map((p) => p[0]), poses: posesOf(m).map((x) => x.part[0]), swap: m.motion.swap, pose: m.motion.pose }));`], { cwd: ws, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out2), { parts: ['base.body', 'post.body', 'stop.body'], poses: ['post.body@pressed'], swap: { pressed: [[1, 3]] }, pose: 'free' });
  } finally { done(); }
});

test('joints: a lid on a hinge, checked in each pose, swept for collisions, with a follower closing a loop', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 40, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } };
    object(ws, 'demo/base', { variables: vars, anchors: { hinge: { at: [0, 'd / 2', 'h'], axis: [1, 0, 0] } } }, BOX);
    object(ws, 'demo/lid', { variables: vars, anchors: { hinge: { at: [0, 'd / 2', 0], axis: [1, 0, 0] } } }, BOX);
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const box = (extra = {}, fits = []) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', fits,
      items: [{ id: 'base', object: 'base' }, { id: 'lid', object: 'lid' }, { id: 'tab', object: 'lid' }, { id: 'spare', assembly: 'spare', at: [100, 0, 0] }],
      joints: [{ id: 'hinge', type: 'revolute', parent: 'base.hinge', child: 'lid.hinge', min: -180, max: 30, label: 'Lid' },
        { id: 'tab', type: 'revolute', parent: { item: 'base', at: ['base.w', 'base.d / 2', 'base.h'], axis: [1, 0, 0] }, child: 'tab.hinge', min: -180, max: 30, follow: 'hinge', ...extra }],
      loops: [{ a: { item: 'lid', at: ['lid.w', '-lid.d / 2', 0], axis: [1, 0, 0] }, b: { item: 'tab', at: [0, '-tab.d / 2', 0], axis: [1, 0, 0] }, label: 'Lid and tab line up' }],
      poses: { closed: { hinge: 0 }, open: { hinge: -90 } } }));
    // A component with no poses of its own: the box's poses still apply (--pose isn't asked of the component)
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/spare.json'), JSON.stringify({ title: 'Spare', kind: 'fit', items: [{ id: 'lid', object: 'lid' }] }));
    box();
    const checked = cad('check', 'demo/box');
    assert.match(checked, /no parts overlap/);
    assert.match(checked, /2 poses checked: closed, open/);
    assert.match(checked, /Lid and tab line up: closed/);
    assert.doesNotMatch(checked, /✗|fail/i);
    assert.match(cad('check', 'demo/box', '--sweep', '--steps', '7'), /sweep hinge, -180 to 30° in 7 steps: at 30°: base\.body hits lid\.body/);
    assert.match(cad('check', 'demo/box', '--pose', 'open'), /Box \(open\)/);
    // A fit near an anchor (only the faces within 3 mm of base@hinge), and findings that say which anchor they're near
    box({}, [{ a: 'base@hinge', b: 'lid', within: 3, min: 5, note: 'Lid clear of the hinge' }]);
    const nearOut = cad('check', 'demo/box', '--pose', 'closed', '--json'), near = JSON.parse(nearOut).findings?.find((x) => x.text.startsWith('Lid clear of the hinge'));
    assert.ok(near, nearOut);
    assert.equal(near.level, 'warn'); assert.equal(near.refs.near.endsWith('@hinge'), true); assert.ok(near.at);
    box();
    assert.match(cad('check', 'demo/box', '--pose', 'wide'), /no pose "wide"/);
    // The library, as a program uses it: progress while it builds and sweeps, and the joints' data for the page
    const lib = path.join(path.dirname(BIN), '../lib/assembly.mjs');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly, sweep, motionData } from ${JSON.stringify(pathToFileURL(lib).href)};
      const seen = [];
      const s = await buildAssembly('demo/box', [], {}, { progress: (e) => seen.push(e.stage) });
      sweep(s, { steps: 4, progress: (e) => seen.push(e.stage) });
      const m = motionData(s);
      console.log(JSON.stringify({ build: seen.filter((x) => x === 'build').length, sweep: seen.filter((x) => x === 'sweep').length, joints: m.motion.joints.length }));`], { cwd: ws, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), { build: 5, sweep: 5, joints: 2 }); // four items, and the spare component's own one
    box({ ratio: 2 }); // the tab turns twice as far: the loop comes apart once open
    assert.match(cad('check', 'demo/box'), /open: .*Lid and tab line up: apart/);
    box({ type: 'ball' });
    assert.match(cad('check', 'demo/box'), /joint tab \(ball\) takes 3 values, but follows hinge \(revolute\), which takes 1/);
  } finally { done(); }
});

test('findings as data (--json), values, and why a value is what it is', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    const j = JSON.parse(cad('check', 'bathroom/soap-tray', '--json'));
    assert.equal(j.object, 'bathroom/soap-tray');
    assert.ok(j.findings.some((f) => f.code === 'print.bed' && f.level === 'pass' && f.values.size.length === 3));
    assert.ok(j.findings.every((f) => f.code), 'every finding has a code');
    const v = JSON.parse(cad('values', 'bathroom/soap-tray', 'width', '--json'));
    assert.equal(v.values.length, 1); assert.equal(v.values[0].name, 'width');
    const all = JSON.parse(cad('values', 'bathroom/soap-tray', '--json')).values, w = all.find((x) => /x1c\./.test(x.expr || ''));
    const tree = JSON.parse(cad('why', `bathroom/soap-tray.${w.name}`, '--json'));
    assert.equal(tree.name, w.name);
    const rules = (n) => [n, ...(n.reads || []).flatMap(rules)];
    assert.ok(rules(tree).some((n) => n.name.startsWith('x1c.') && n.kind), 'down to the printer rules, with their kind');
    assert.match(cad('why', `bathroom/soap-tray.${w.name}`), new RegExp(`^${w.name} = `));
    const err = JSON.parse(cad('values', 'bathroom/soap-tray', 'nope', '--json'));
    assert.equal(err.error.code, 'var.unknown');
  } finally { done(); }
});

test('schemas: every format checked up front, a typo named with its path', async () => {
  const { validate, schema } = await import('./lib/schema.mjs');
  const ok = { variables: { w: { value: 10, unit: 'mm', rule: 'Width' } } };
  assert.deepEqual(validate(ok, schema('object')), []);
  const bad = validate({ variables: { w: { value: 10, unti: 'mm' } }, varibles: {} }, schema('object'));
  assert.ok(bad.some((x) => x.path === 'variables.w.unti' && /did you mean "unit"/.test(x.message)));
  assert.ok(bad.some((x) => x.path === 'varibles' && /did you mean "variables"/.test(x.message)));
  assert.deepEqual(validate({ items: [{ id: 'a', object: 'a' }], joints: [{ id: 'j', type: 'revolute', parent: 'a.p', child: { item: 'b', at: [0, 0, 'h'] } }] }, schema('assembly')), []);
  assert.ok(validate({ items: [], fits: [{ a: 'x' }] }, schema('assembly')).some((x) => x.path === 'fits[0]' && /needs "b"/.test(x.message)));
  assert.deepEqual(validate({ rows: [['Esc', ['Tab', 1.5], { label: 'F', homing: true }, { gap: 0.25 }]] }, schema('layout')), []);
  assert.deepEqual(validate({ name: 'p', rules: { line: { value: 0.42, unit: 'mm', rule: 'Line', kind: 'spec', source: 'x' } } }, schema('rules')), []);
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    assert.match(cad('check', 'bathroom/soap-tray'), /files match their schemas/);
    const f = path.join(ws, 'projects/bathroom/objects/soap-tray.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.orientaton = 'typo'; fs.writeFileSync(f, JSON.stringify(j));
    assert.match(cad('check', 'bathroom/soap-tray'), /orientaton: not allowed here \(did you mean "orientation"\?\)/);
  } finally { done(); }
});

test('cad set and cad add: edits that keep the file as it was, and refuse to break it', async () => {
  const { setAt, appendAt } = await import('./lib/jsonedit.mjs');
  const t = '{\n  "variables": {\n    "w": { "value": 10, "unit": "mm" },\n    "r": {\n      "value": 2,\n      "rule": "Two × one"\n    }\n  },\n  "fits": []\n}\n';
  const u = setAt(t, ['variables', 'w', 'value'], 12);
  assert.equal(u, t.replace('"value": 10', '"value": 12'), 'only the value changes');
  assert.match(appendAt(setAt(t, ['variables', 'h'], { value: 3, unit: 'mm', rule: 'Height' }), ['fits'], { a: 'a', b: 'b', poses: ['x'] }),
    /"h": \{\n      "value": 3,[\s\S]*"fits": \[\n    \{\n      "a": "a",\n      "b": "b",\n      "poses": \["x"\]\n    \}\n  \]/);
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    const f = path.join(ws, 'projects/bathroom/objects/soap-tray.json'), before = fs.readFileSync(f, 'utf8');
    const name = JSON.parse(cad('values', 'bathroom/soap-tray', '--json')).values.find((v) => typeof v.value === 'number' && !v.expr).name;
    const tw = JSON.parse(before).variables[name].tweak, to = tw ? Math.min(tw.max, Math.max(tw.min, 7)) : 7; // (within its range: a value outside it is refused)
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=${to}`), new RegExp(`set ${name}`));
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, to);
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=x1c.nope`), /not changed: .*no rule "nope"/);
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, to, 'a bad edit leaves the file as it was');
    assert.match(cad('set', 'bathroom/soap-tray', 'extra=1'), /has no variable "extra" \(add it with --new/);
    assert.match(cad('set', 'bathroom/soap-tray', 'extra=1', '--new', '--unit', 'mm', '--rule', 'A test'), /set extra/);
    assert.equal(fs.readFileSync(f, 'utf8').split('\n').slice(0, 3).join('\n'), before.split('\n').slice(0, 3).join('\n'), 'the rest of the file is untouched');
    fs.mkdirSync(path.join(ws, 'projects/bathroom/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/bathroom/assemblies/two.json'), JSON.stringify({ title: 'Two', items: [{ id: 'a', object: 'soap-tray' }] }, null, 2));
    assert.match(cad('add', 'item', 'bathroom/two', '--id', 'b', '--object', 'soap-tray', '--at', '100,0,0'), /added an item/);
    assert.match(cad('add', 'fit', 'bathroom/two', '--a', 'a', '--b', 'b', '--min', '1', '--note', 'Apart'), /added a fit/);
    assert.match(cad('add', 'fit', 'bathroom/two', '--a', 'a', '--min', '1'), /fits\[1\]: needs "b"/);
    assert.match(cad('check', 'bathroom/two'), /Apart: not near each other/);
  } finally { done(); }
});

test('sandbox: a design can make shapes, but not read or write files, reach the network or start programs', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 10, unit: 'mm', rule: 'Width' } };
    const tryIt = (name, body) => {
      object(ws, `demo/${name}`, { variables: vars }, `import jscad from '@jscad/modeling'\n${body}\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n`);
      return cad('check', `demo/${name}`);
    };
    assert.match(tryIt('fine', ''), /fits the bed/);
    assert.match(tryIt('fs', "import fs from 'node:fs'"), /designs can't import "node:fs"/);
    assert.match(tryIt('net', "await fetch('https://example.com')"), /fetch is not defined/);
    assert.match(tryIt('dyn', "await import('node:child_process')"), /designs can't import "node:child_process"/);
    assert.match(tryIt('outside', "await import('../../../../x.mjs')"), /can't import|outside|Cannot find/);
    assert.match(tryIt('write', "process.binding('fs')"), /restricted|denied|not allowed|binding/i);
    assert.ok(!fs.existsSync(path.join(ws, 'pwned')));
    fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify({ sandbox: false }));
    assert.match(tryIt('untrusted', "import fs from 'node:fs'"), /designs can't import "node:fs"/, 'a workspace that turns the sandbox off isn\'t believed until its user trusts it');
    assert.match(cad('trust'), /trusted .* for designs run outside the sandbox/);
    assert.match(tryIt('trusted', "import fs from 'node:fs'"), /fits the bed/, 'a workspace can trust its own designs, once its user says so');
    fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify({ sandbox: false, targets: { show: 'mine/show.mjs' } }));
    assert.match(cad('show', 'demo/fine'), /asks for designs run outside the sandbox and the show target mine\/show\.mjs .* run cad trust once/, 'asking for more is asked again'); // (a design that builds in the sandbox too: this one's about the target, whether or not its build is cached)
  } finally { done(); }
});

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
    const ok = cad('check', 'demo/flick');
    assert.match(ok, /✓ everything clears what it isn't joined to by 0\.3 mm/);
    assert.match(ok, /✓ leaf: stopped by the ground at [\d.]+ mm, before its limit/);
    assert.match(ok, /✓ rest to bent: clear all the way/);
    assert.match(cad('check', 'demo/flick'), /✓ rest to bent: clear all the way/, 'the same from the cache');
    // The physics, the slow stage, is kept apart (.cache/stages): the sandbox handed it back and the tool wrote it
    const stages = path.join(ws, '.cache', 'stages'), kept = fs.readdirSync(stages);
    assert.ok(kept.some((f) => f.startsWith('physics-')) && JSON.parse(fs.readFileSync(path.join(stages, kept.find((f) => f.startsWith('physics-'))), 'utf8')).transitions, `the physics kept as JSON: ${kept.join(', ')}`);
    // A rule's words aren't what a build is made from: the build is found in the cache, and so is the physics
    const file = path.join(ws, 'projects', 'demo', 'objects', 'flick.json'), json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.variables.len.rule = 'The leaf, reworded'; fs.writeFileSync(file, JSON.stringify(json, null, 2));
    const before = kept.length;
    assert.match(cad('check', 'demo/flick'), /✓ rest to bent: clear all the way/);
    assert.equal(fs.readdirSync(stages).length, before, 'reworded: nothing computed again');
    json.variables.bend.value = 0.2; fs.writeFileSync(file, JSON.stringify(json, null, 2));
    assert.match(cad('check', 'demo/flick'), /✓ rest to bent: clear all the way/);
    assert.ok(fs.readdirSync(stages).length > before, 'a value changed: the physics made again');
    assert.match(cad('check', 'demo/flick:fused'), /✗ the ground and tip are 0\.1 mm apart at rest: under the 0\.3 mm gap, they print as one/);
    const outs = cad('animate', 'demo/flick').trim().split('\n'), out = outs.find((l) => l.endsWith('.svg'));
    assert.ok(out.endsWith('flick-sequence.svg') && /<svg[\s\S]*<animate attributeName="display"[\s\S]*rest to bent/.test(fs.readFileSync(out, 'utf8')));
    // and as data, every frame's shapes and what acts on them, with a page that plays it
    const data = JSON.parse(fs.readFileSync(outs.find((l) => l.endsWith('-sequence.json')), 'utf8'));
    assert.ok(data.frames.length > 2 && data.ground.length && data.kinds.ground === 'ground', 'the frames and the frame');
    assert.ok(data.frames.some((fr) => fr.forces?.some((f) => f.kind === 'hand') && fr.energy && fr.strain), 'what acts each frame: the hand, the energy and strain in each flexure');
    const page = fs.readFileSync(outs.find((l) => l.endsWith('-player.html')), 'utf8');
    assert.ok(/<canvas id="view">/.test(page) && page.includes('"frames":'), 'a page that plays it, its data inside');
    object(ws, 'demo/cube', { variables: { w: n(10, 'Width') } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n");
    assert.match(cad('animate', 'demo/cube'), /isn't a lamina mechanism/);
  } finally { done(); }
});

test('engines: a design using v.ops builds the same shape with JSCAD and with Manifold, watertight', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 20, unit: 'mm', rule: 'Width', tweak: { min: 5, max: 50 } }, r: { value: 'w * 0.6', unit: 'mm', rule: 'Radius' }, n: { value: 64, unit: '', rule: 'Segments' } };
    object(ws, 'demo/cut', { variables: vars }, `import jscad from '@jscad/modeling'
const { cuboid, sphere } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }), sphere({ radius: v.r, center: [0, 0, v.w], segments: v.n }))
}
`);
    const j = JSON.parse(cad('check', 'demo/cut', '--json')), m = JSON.parse(execFileSync(process.execPath, [BIN, 'check', 'demo/cut', '--json'], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_ENGINE: 'manifold' } }));
    const size = (r) => r.findings.find((f) => f.code === 'print.bed').values.size, base = (r) => r.findings.find((f) => f.code === 'print.base').values.area;
    assert.deepEqual(size(j).map((x) => x.toFixed(2)), size(m).map((x) => x.toFixed(2)));
    assert.ok(Math.abs(base(j) - base(m)) < 0.5, 'the same footprint');
    const closed = m.findings.find((f) => f.code === 'print.closed');
    assert.equal(closed.level, 'pass'); assert.equal(closed.values.tjunctions, 0, 'Manifold leaves no T-junctions');
  } finally { done(); }
});

test('host: the core builds and checks a design from a workspace in memory, writing nothing to disk', () => {
  const lib = (f) => JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib', f)).href);
  const root = path.resolve('/rulecad-memory-test');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { useHost, memoryHost } from ${lib('host.mjs')};
    const h = memoryHost({
      'cad.config.json': '{}',
      'projects/demo/project.json': JSON.stringify({ name: 'demo', objects: ['box'] }),
      'projects/demo/objects/box.json': JSON.stringify({ name: 'box', version: '0.1.0', uses: ['x1c'], variables: { w: { value: 'x1c.line * 40', unit: 'mm', rule: 'Width' } } }),
      'projects/demo/objects/box.js': "import jscad from '@jscad/modeling'\\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\\n",
    }, { root: ${JSON.stringify(root)} });
    useHost(h);
    const { build, locate, printer } = await import(${lib('design.mjs')});
    const { check } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../../printcheck/printcheck.mjs')).href)});
    const d = locate('demo/box'), b = await build(d);
    const found = check(b.triangles, printer(b, d));
    console.log(JSON.stringify({ size: found.find((f) => f.code === 'print.bed').values.size.map((x) => +x.toFixed(2)),
      onDisk: fs.existsSync(${JSON.stringify(root)}), cached: [...h.files.keys()].some((k) => k.includes('.cache')), rules: [...h.files.keys()].some((k) => k.endsWith('x1c.json')) }));
  `], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, CAD_WORKSPACE: root } });
  assert.deepEqual(JSON.parse(out), { size: [16.8, 16.8, 16.8], onDisk: false, cached: true, rules: true });
});

test('optimising a problem: cad optimise draws it and caches it, a design builds from it, cad check analyses it', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'beam');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.mkdirSync(path.join(project, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'beam', objects: ['arm'] }));
    fs.writeFileSync(path.join(project, 'problems', 'arm.json'), JSON.stringify({
      title: 'A short arm', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.5, filter: 1.5,
      variables: { side: { value: 0, tweak: { min: 0, max: 1 } } }, variants: { both: { side: 1 } },
      space: { at: [12, 0], size: [30, 12] }, keep: [{ at: [0, 0], r: 4 }, { at: [24, 0], r: 3 }], avoid: [{ at: [0, 0], r: 1.6 }, { at: [24, 0], r: 1.2 }],
      supports: [{ at: [0, 0], r: 1.6 }], loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }, { at: [24, 0], r: 1.2, force: [10, 0], case: 'side' }], cases: { side: 'side' },
    }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.json'), JSON.stringify({ name: 'arm', version: '0.1.0', uses: ['x1c'],
      variables: { problem: { type: 'problem', value: 'arm', choice: ['arm', 'arm:both'] }, t: { value: 4, unit: 'mm' } },
      analysis: [{ problem: 'arm', max_deflection: 1, volume: 760, tolerance: 0.05 }] }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: v.t }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    const first = cad('optimise', 'beam/arm');
    assert.match(first, /down: moves [\d.]+ mm along its load, [\d.]+ N\/mm/);
    assert.match(first, /settled/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'beam', 'arm-optimised.svg')));
    assert.match(cad('optimise', 'beam/arm'), /\(cached\)/);
    assert.match(cad('optimise', 'beam/arm:nope'), /no variant "nope"/);
    const checked = cad('check', 'beam/arm');
    assert.match(checked, /✓ arm down: moves [\d.]+ mm under 10 N/);
    assert.ok(!/under 4 cells/.test(checked) || /! arm: [\d.]+% of the part is in members under 4 cells \([\d.]+ mm\) thick/.test(checked), 'thin members, if any, are a warning with the cell to use');
    assert.match(checked, /· arm side|✓ arm side/);
    assert.match(checked, /✓ volume [\d.]+ mm³/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'beam', 'arm-analysis-arm.svg')));
    assert.match(cad('check', 'beam/arm', '--set', 'problem=arm:both'), /optimising arm:both|arm down/);
    // A stress limit instead of a volume: the lightest arm that keeps to it
    fs.writeFileSync(path.join(project, 'problems', 'light.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(project, 'problems', 'arm.json'), 'utf8')),
      title: 'A light arm', volume: undefined, stress: 'pla.strength / 3', cases: {}, loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }], variables: {}, variants: {} }));
    const light = cad('optimise', 'beam/light');
    assert.match(light, /peak stress [\d.]+ MPa, the limit 13 MPa\n/);
  } finally { done(); }
});

test('3D: a problem whose space is another design\'s part, optimised, built as a solid and analysed', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'post');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'post', objects: ['envelope', 'post'] }));
    // The envelope: a block 12 × 12 × 24 mm standing on the bed
    fs.writeFileSync(path.join(project, 'objects', 'envelope.json'), JSON.stringify({ name: 'envelope', version: '0.1.0', variables: { w: { value: 12, unit: 'mm' }, h: { value: 24, unit: 'mm' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'envelope.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ center: [0, 0, v.h / 2], size: [v.w, v.w, v.h] }) }\n");
    fs.writeFileSync(path.join(project, 'problems', 'post.json'), JSON.stringify({
      title: 'A post', material: 'pla', cell: 2, volume: 0.3, filter: 3, steps: 30, overhang: '+z',
      space: { part: 'envelope.body' }, keep: [{ at: [0, 0, 22], r: 4, length: 4, axis: 'z' }],
      supports: [{ at: [0, 0, 1], size: [12, 12, 2] }], loads: [{ at: [0, 0, 23], r: 3, length: 2, axis: 'z', force: [10, 0, 0], case: 'push' }],
    }));
    fs.writeFileSync(path.join(project, 'objects', 'post.json'), JSON.stringify({ name: 'post', version: '0.1.0', engine: 'manifold',
      variables: { problem: { type: 'problem', value: 'post', choice: ['post', 'none'] }, side: { value: 0, choice: [0, 1] }, lift: { value: 6, unit: 'mm' } }, variants: { lying: { side: 1 }, plain: { problem: 'none' } },
      // Lying: drawn on its side, and turned back for the analysis
      analysis: [{ problem: 'post', rotate: [0, '0 - 90 * side', 0], move: ['lift * side', 0, 0] }] }));
    fs.writeFileSync(path.join(project, 'objects', 'post.js'), "import jscad from '@jscad/modeling'\nconst { rotateY, translate } = jscad.transforms\nexport function main (v) { const s = v.problems ? v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops }) : jscad.primitives.cuboid({ size: [12, 12, 24], center: [0, 0, 12] }); return v.side ? translate([0, 0, v.lift], rotateY(Math.PI / 2, s)) : s }\n");
    const out = cad('optimise', 'post/post');
    assert.match(out, /push: moves [\d.e-]+ mm along its load/);
    assert.match(out, /printable built \+z/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'post', 'post-optimised.png')), 'a preview of the surface');
    const checked = cad('check', 'post/post');
    assert.match(checked, /closed solid/);
    assert.match(checked, /post push: moves [\d.e-]+ mm under 10 N/);
    const stiffness = (out) => Number(out.match(/post push: moves [\d.e-]+ mm under 10 N, ([\d.e+-]+) N\/mm/)[1]);
    const lying = cad('check', 'post/post:lying');
    assert.match(lying, /24 × [\d.]+ × 12 mm, fits the bed/, 'drawn lying down');
    assert.ok(Math.abs(stiffness(lying) / stiffness(checked) - 1) < 0.02, `turned back, it analyses as it stands: ${stiffness(lying)} against ${stiffness(checked)} N/mm`);
    // A variant with no problem builds without the optimiser: a rig, or the regions a problem reads
    const plain = cad('check', 'post/post:plain');
    assert.match(plain, /12 × 12 × 24 mm, fits the bed/, 'drawn without the result');
    assert.doesNotMatch(plain, /optimising/);
    // Verified: on finer cells, checked against cells a quarter bigger, with a report; safety-critical, it's
    // unverified until a test is recorded
    const problemFile = path.join(project, 'problems', 'post.json'), objectFile = path.join(project, 'objects', 'post.json');
    fs.writeFileSync(problemFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(problemFile, 'utf8')), critical: true }));
    const o = JSON.parse(fs.readFileSync(objectFile, 'utf8'));
    o.analysis = [{ problem: 'post', cell: 1, min_safety: 2 }];
    fs.writeFileSync(objectFile, JSON.stringify(o));
    const verified = cad('check', 'post/post');
    assert.match(verified, /post push: stiffness [+-][\d.]+% from 1.25 mm cells/);
    assert.match(verified, /✓ post push: peak stress [\d.]+ MPa at \([\d., -]+\): [\d.]+× under pla's strength \(at least 2×\)/);
    assert.match(verified, /post is safety-critical and unverified/);
    const report = fs.readFileSync(path.join(ws, '.preview', 'post', 'post-report-post.md'), 'utf8');
    assert.match(report, /12 × 12 × 24 cells of 1 mm/);
    assert.match(report, /\*\*Unverified\.\*\*/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, '.preview', 'post', 'post-report-post.json'), 'utf8')).cases[0].name, 'push');
    o.verification = [{ kind: 'test', date: '2026-10-28', summary: 'Pushed with 10 N three times: moved 0.03 mm' }];
    fs.writeFileSync(objectFile, JSON.stringify(o));
    assert.match(cad('check', 'post/post'), /post is safety-critical: verified by test \(2026-10-28\)/);
  } finally { done(); }
});

test('a solid part fills each cube by the share of it inside, so its volume is right on any cells', async () => {
  const { solidFill } = await import('./lib/optimise.mjs');
  // A box 5.3 × 3.7 × 6.1 mm, off the cells' corners
  const lo = [0.4, 0.7, 0.2], hi = [5.7, 4.4, 6.3], c = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => [n & 1 ? hi[0] : lo[0], n & 2 ? hi[1] : lo[1], n & 4 ? hi[2] : lo[2]]);
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [1, 3, 7, 5], [0, 4, 6, 2]];
  const triangles = quads.flatMap(([a, b, d, e]) => [[c[a], c[b], c[d]], [c[a], c[d], c[e]]]);
  for (const h of [1, 2]) {
    const n = Math.ceil(7 / h), d = solidFill(triangles, { nx: n, ny: n, nz: n, h }, [0, 0, 0]);
    // Exact up the column; across it, each side to within half the rays' spacing (h / 8)
    const filled = d.reduce((s, x) => s + x, 0) * h ** 3, e = h / 8, most = (5.3 + 2 * e) * (3.7 + 2 * e) * 6.1, least = (5.3 - 2 * e) * (3.7 - 2 * e) * 6.1;
    assert.ok(filled >= least - 1e-9 && filled <= most + 1e-9, `on ${h} mm cells: ${filled} mm³, not between ${least} and ${most}`);
    assert.ok(d.every((x) => x >= 0 && x <= 1));
  }
});

test('the live view: serves its page, streams each step, and its stop button sets the flag the run reads', async () => {
  const { liveView } = await import('./lib/live.mjs');
  const view = await liveView({ port: 0, title: 'a test run' });
  try {
    assert.match(await (await fetch(view.url)).text(), /a test run/);
    view.step({ step: 3, steps: 10, compliance: 12.5, change: 0.1, beta: 1, grid: { nx: 2, ny: 2, nz: 2 }, density: Float64Array.from([0, 1, 0, 0, 0, 0, 0.5, 0]) });
    const events = await fetch(new URL('events', view.url)), reader = events.body.getReader();
    let text = '';
    while (!text.includes('"frame"')) text += new TextDecoder().decode((await reader.read()).value);
    const m = JSON.parse(text.split('data: ').at(-1));
    assert.equal(m.frame.step, 3);
    // Three views, each pixel the densest cell along its line of sight
    assert.deepEqual(m.frame.views.map((v) => [v.name, ...Buffer.from(v.image, 'base64')]), [['along y', 0, 255, 128, 0], ['along x', 255, 0, 0, 128], ['along z', 0, 255, 128, 0]]);
    assert.equal((await (await fetch(new URL('frame/0', view.url))).json()).step, 3); // every step kept, for the scrubber
    // A 3D step's surface, drawn when asked for: vertex and face counts, then the vertices and faces
    const mesh = new DataView(await (await fetch(new URL('mesh/0', view.url))).arrayBuffer());
    assert.ok(mesh.getUint32(0, true) > 0 && mesh.getUint32(4, true) > 0);
    assert.equal(mesh.byteLength, 8 + mesh.getUint32(0, true) * 12 + mesh.getUint32(4, true) * 12);
    assert.match(await (await fetch(new URL('three/three.module.js', view.url))).text(), /WebGLRenderer/);
    assert.equal(view.stopped(), false);
    const foreign = await fetch(new URL('stop', view.url), { method: 'POST', headers: { Origin: 'http://elsewhere.example' } });
    assert.equal(foreign.status, 403, 'another site\'s page can\'t stop the run');
    assert.equal(view.stopped(), false);
    await fetch(new URL('stop', view.url), { method: 'POST' });
    assert.equal(view.stopped(), true);
    reader.cancel();
    // Finished, it keeps showing the end for a while
    const closing = view.close('finished', { hold: 500 });
    await new Promise((r) => setTimeout(r, 100));
    assert.match(await (await fetch(view.url)).text(), /a test run/);
    await closing;
    await assert.rejects(fetch(view.url));
  } catch (e) { await view.close(); throw e; }
});

test('an optimised part keeps only pieces touching a support, a load or a kept region', async () => {
  const { anchored } = await import('./lib/optimise.mjs');
  const cube = (x, s, base) => { // a closed cube as indexed triangles
    const v = [0, 1].flatMap((k) => [0, 1].flatMap((j) => [0, 1].map((i) => [x + i * s, j * s, k * s])));
    const q = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    return { v, f: q.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]).map((t) => t.map((i) => i + base)) };
  };
  const main = cube(0, 10, 0), speck = cube(30, 2, 8);
  const mesh = { vertices: [...main.v, ...speck.v], faces: [...main.f, ...speck.f] };
  const out = anchored(mesh, [[0, 0, 0, 10, 10, 1]], 1); // a support on the main cube's floor
  assert.equal(out.faces.length, 12);
  assert.equal(out.vertices.length, 8);
  assert.deepEqual(out.dropped.map(Math.abs), [8]);
  assert.equal(anchored(mesh, [[0, 0, 0, 40, 10, 1]], 1).dropped.length, 0); // both touch it
});

test('a mechanism problem: cad optimise reports how far the output moves its way, and the live view gets the travel', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'mech');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'mech', objects: [] }));
    fs.writeFileSync(path.join(project, 'problems', 'inverter.json'), JSON.stringify({
      title: 'A force inverter', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.3, filter: 1.5, steps: 40,
      variables: { k: { value: 0.5, unit: 'N/mm', rule: 'the springs' } },
      space: { at: [20, 10], size: [40, 20] }, supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
      loads: [{ at: [0.5, 10], size: [1, 2], force: [10, 0] }], input_spring: 'k',
      output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: 'k', label: 'the right end, moving left' },
    }));
    const out = cad('optimise', 'mech/inverter');
    assert.match(out, /the output moves [\d.e-]+ mm its way for [\d.e-]+ mm of push: an advantage of [\d.e-]+/);
    assert.match(out, /% of the space filled/);
    assert.match(out, /40 × 20 cells of 1 mm/);
  } finally { done(); }
});

// ---------- what a newcomer meets ----------
// A run of the command with its exit status kept (cad() above gives the output only)
const run = (ws, a, env = {}) => { const r = spawnSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', env: { ...process.env, ...env } }); return { out: `${r.stdout}${r.stderr}`, stdout: r.stdout, code: r.status }; };

test('a mistake in a design is named, with its file and line: a misspelt variable, no shape returned, a syntax error, broken JSON', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { width: { value: 10, unit: 'mm', rule: 'Width' } };
    const shape = (expr) => `import jscad from '@jscad/modeling'\nexport function main (v) {\n  ${expr}\n}\n`;
    for (const trust of [{}, { CAD_TRUST: '1' }]) { // in the sandbox, and in the tool's own process
      const tryIt = (name, js) => { object(ws, `demo/${name}`, { variables: vars }, js); return run(ws, ['check', `demo/${name}`], { ...trust, CAD_NO_CACHE: '1' }); }; // (each run afresh: a kept build doesn't run the design)
      const typo = tryIt('typo', shape('return jscad.primitives.cuboid({ size: [v.widht, v.width, v.width] })'));
      assert.match(typo.out, /v\.widht: the design has no variable "widht" \(did you mean "width"\?\).*typo\.js:3\)/, 'not undefined, and another shape drawn');
      assert.doesNotMatch(typo.out, /Warning/, 'Node\'s notes on the sandbox\'s own flags stay out of it');
      assert.equal(typo.code, 1);
      assert.match(tryIt('nothing', shape('jscad.primitives.cuboid({ size: [v.width, v.width, v.width] })')).out, /main\(\) returned no shape.*nothing\.js/);
      assert.match(tryIt('syntax', shape('retrun jscad.primitives.cuboid({ size: [v.width, v.width, v.width] })')).out, /Unexpected identifier.*retrun.*syntax\.js:3\)/);
      assert.match(tryIt('runtime', shape('return v.width.nope.deeper')).out, /reading 'deeper'.*runtime\.js:3\)/);
      const said = tryIt('says', shape("console.log('width is', v.width)\n  return jscad.primitives.cuboid({ size: [v.width, v.width, v.width], center: [0, 0, v.width / 2] })"));
      assert.match(said.out, /width is 10/, 'a design may print what it wants to see');
      assert.match(said.out, /fits the bed/);
    }
    // a name only the on-screen copy sets may be asked for when it isn't there
    object(ws, 'demo/shown', { variables: vars, display: { smooth: 8 } }, shape('return jscad.primitives.cylinder({ radius: v.width, height: v.width, center: [0, 0, v.width / 2], ...(v.smooth ? { segments: v.smooth } : {}) })'));
    assert.match(cad('check', 'demo/shown'), /fits the bed/);
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/typo.json'), '{ "name": "typo", ');
    assert.match(run(ws, ['check', 'demo/typo']).out, /not valid JSON: .*\(projects[\\/]demo[\\/]objects[\\/]typo\.json\)/);
    assert.match(run(ws, ['set', 'demo/typo', 'width=5']).out, /not valid JSON/, 'and an edit says so too, at once');
    fs.writeFileSync(path.join(ws, 'cad.config.json'), '{ "printer": ');
    const cfg = run(ws, ['check', 'demo/shown']);
    assert.match(cfg.out, /^not valid JSON: .*\(cad\.config\.json\)\s*$/, 'in one line, not a stack trace');
  } finally { done(); }
});

test('the command line: its version, a misspelt command or option named, options before or after names, flags that take no value', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'demo/block');
    assert.match(run(ws, ['--version']).out, /^\d+\.\d+\.\d+\s*$/);
    for (const h of ['--help', '-h', 'help']) assert.match(run(ws, [h]).out, /^cad: JSCAD designs/);
    const wrong = run(ws, ['chekc', 'demo/block']);
    assert.match(wrong.out, /^no command "chekc" \(did you mean "check"\?\)/); assert.equal(wrong.code, 1);
    const odd = run(ws, ['check', 'demo/block', '--jsno']);
    assert.match(odd.out, /^no option --jsno \(did you mean --json\?\)/); assert.equal(odd.code, 1);
    assert.equal(JSON.parse(run(ws, ['check', '--json', 'demo/block']).stdout).object, 'demo/block', 'options first');
    assert.match(run(ws, ['check', 'demo/block', '--set']).out, /--set needs a value/);
    assert.match(run(ws, ['add']).out, /usage: cad add fit\|joint\|item\|beam\|loop\|pose/);
    assert.match(run(ws, ['add', 'fit']).out, /usage: cad add fit\|joint\|item\|beam\|loop\|pose/);
    // --new takes no value: what follows it is the next variable, not lost
    assert.match(run(ws, ['set', 'demo/block', '--new', 'lip=3', '--unit', 'mm', '--rule', 'A lip']).out, /set lip/);
    const vars = () => JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/objects/block.json'), 'utf8')).variables;
    assert.equal(vars().lip.value, 3);
    const rule = vars().width.rule;
    assert.match(run(ws, ['set', 'demo/block', 'width=50', '--new', 'rim=2', '--rule', 'A rim']).out, /--rule describes one variable/);
    assert.equal(vars().width.rule, rule, 'no rule written over');
    // a value in a file name can't name another folder
    assert.match(run(ws, ['export', 'demo/block', '--set', 'width=50']).out, /block@0\.1\.0-width=50\.3mf/);
    // projects: a stray file among them is passed over, a missing one named
    fs.writeFileSync(path.join(ws, 'projects/.DS_Store'), '');
    assert.match(run(ws, ['status']).out, /^demo\n\s+block\s+unreleased/);
    assert.match(run(ws, ['status', 'nope']).out, /^no project "nope" \(projects: demo\)/);
    // a preview whose Chrome can't run says so, and leaves no earlier picture to pass for it
    const png = path.join(ws, '.preview/demo/block.png');
    fs.mkdirSync(path.dirname(png), { recursive: true }); fs.writeFileSync(png, 'an earlier picture');
    const shot = run(ws, ['preview', 'demo/block'], { CAD_CHROME: path.join(ws, 'no-chrome-here') });
    assert.match(shot.out, /^couldn't start Chrome for the preview/); assert.equal(shot.code, 1);
    assert.ok(!fs.existsSync(png));
  } finally { done(); }
});

test('sandbox: the roads round the import hook are shut too, and the design sees none of the environment', () => {
  const { ws, done } = workspace();
  try {
    const vars = { w: { value: 10, unit: 'mm', rule: 'Width' } };
    const tryIt = (name, top, body) => {
      object(ws, `demo/${name}`, { variables: vars }, `import jscad from '@jscad/modeling'\n${top}\nexport function main (v) {\n  ${body}\n  return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] })\n}\n`);
      return run(ws, ['check', `demo/${name}`], { SECRET_TOKEN: 'tok123' }).out;
    };
    assert.match(tryIt('builtin', '', "process.getBuiltinModule('node:fs')"), /getBuiltinModule is not a function/);
    assert.match(tryIt('env', '', "if (process.env.SECRET_TOKEN || process.env.HOME) throw new Error('the environment leaked')"), /fits the bed/);
    assert.match(tryIt('kill', '', "if (process.kill || process.binding) throw new Error('process can still reach out')"), /fits the bed/);
    // a node_modules folder inside the project is the design's own code, held to the same imports
    fs.mkdirSync(path.join(ws, 'projects/demo/node_modules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/demo/node_modules/helper.mjs'), "export * as http from 'node:http'\n");
    assert.match(tryIt('own-modules', "import * as h from '../node_modules/helper.mjs'", ''), /designs can't import "node:http"/);
    // and a path out of the project is refused wherever it leads, the workspace's packages included
    assert.match(tryIt('leaves', "import * as ts from '../../../node_modules/typescript/lib/typescript.js'", ''), /it is outside the project/);
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/half.js'), 'export const half = (x) => x / (1 + 1)\n');
    assert.match(tryIt('own-file', "import { half } from './half.js'", 'half(v.w)'), /fits the bed/, 'its own files are still its own');
  } finally { done(); }
});

test('edits to JSON keep its line endings and indentation, and say when it isn\'t JSON', async () => {
  const { setAt } = await import('./lib/jsonedit.mjs');
  const crlf = '{\r\n\t"name": "x",\r\n\t"variables": {\r\n\t\t"w": { "value": 1 }\r\n\t}\r\n}\r\n';
  const out = setAt(crlf, ['variables', 'd'], { value: 3, deep: { a: 1 } });
  assert.equal(out, '{\r\n\t"name": "x",\r\n\t"variables": {\r\n\t\t"w": { "value": 1 },\r\n\t\t"d": {\r\n\t\t\t"value": 3,\r\n\t\t\t"deep": {\r\n\t\t\t\t"a": 1\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n}\r\n');
  assert.throws(() => setAt('{ "name": "hook", ', ['a'], 1), /not valid JSON/, 'not a scan that never ends');
});

// A document replayed: its fenced blocks in turn, in a workspace npm create rulecad makes. A block named for a file
// is written there; a sh block's cad commands are run (previews need Chrome, so they're passed over), each to pass
// with no failing or warning finding. Returns { ws, files, commands } with the workspace for more checks; rm it after
function replay(doc, ws) {
  const text = fs.readFileSync(doc, 'utf8').replace(/\r\n/g, '\n'); // (a Windows checkout has its own line endings)
  execFileSync(process.execPath, [fileURLToPath(new URL('../create-rulecad/index.mjs', import.meta.url)), ws, '--no-install'], { encoding: 'utf8' });
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction'); // stands in for npm install
  let files = 0, commands = 0;
  for (const [, info, body] of text.matchAll(/^```(\S*(?: \S+)?)\n([\s\S]*?)^```$/gm)) {
    const [lang, file] = info.split(' ');
    if (file) { fs.mkdirSync(path.dirname(path.join(ws, file)), { recursive: true }); fs.writeFileSync(path.join(ws, file), body); files++; continue; }
    if (lang !== 'sh') continue;
    // a command the text says warns ("# warns: why") may warn, never fail
    for (const { line, warns } of body.split('\n').map((l) => ({ line: l.replace(/\s+#.*$/, '').trim(), warns: /#\s*warns\b/.test(l) })).filter(({ line: l }) => l.startsWith('npx cad ') && !l.startsWith('npx cad preview'))) {
      const a = [...line.slice('npx cad '.length).matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
      const r = run(ws, a);
      assert.equal(r.code, 0, `${line}\n${r.out}`);
      assert.doesNotMatch(r.out, warns ? /^\s+✗ /m : /^\s+[✗!] /m, `${line}\n${r.out}`);
      commands++;
    }
  }
  return { text, files, commands };
}

test('a motor in an assembly: on the axis of its joint, torque reaching a load, holding on and off, a shaft read from its bore', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const findings = (a) => { const out = cad('check', `home/${a}`, '--json'), r = JSON.parse(out); assert.ok(r.findings, out); return r.findings.filter((x) => /^(motor|shaft)\./.test(x.code)); };
  const code = (list, c) => list.filter((x) => x.code === c);
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['arm', 'hub'] });
    write('projects/home/objects/arm.json', { name: 'arm', version: '0.1.0', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: [100, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 110, unit: 'mm', rule: 'The arm' } } });
    write('projects/home/objects/arm.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 4], center: [v.long / 2 + 12, 0, 40] }) }\n");
    write('projects/home/objects/hub.json', { name: 'hub', version: '0.1.0', engine: 'manifold', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { wall: { value: 4, unit: 'mm', rule: 'The wall', tweak: { min: 1, max: 20 } }, depth: { value: 12, unit: 'mm', rule: 'The bore' }, flat: { value: 1, rule: 'Cut the flat', tweak: { min: 0, max: 1 } }, press: { value: 0, rule: 'Press fit', tweak: { min: 0, max: 1 } }, comp: { value: 0.1, unit: 'mm', rule: 'How much the printed hole shrinks', tweak: { min: -0.2, max: 0.2 } } } });
    write('projects/home/objects/hub.js', "import jscad from '@jscad/modeling'\nconst { cylinder } = jscad.primitives\nexport function main (v) {\n  const m = v.motors.motorModel('nema17'), hole = v.flat ? v.motors.bore(m, { depth: v.depth, tip: v.depth, fit: v.press ? 'press' : 'slide', printer: { hole_comp: v.comp } }, v.ops) : cylinder({ radius: 2.65, height: v.depth + 1, center: [0, 0, v.depth / 2], segments: 48 })\n  return v.ops.subtract(cylinder({ radius: 2.5 + v.wall, height: v.depth, center: [0, 0, v.depth / 2], segments: 48 }), hole)\n}\n");
    const arm = (motor, extra = {}) => ({ title: 'Arm', kind: 'fit', items: [{ id: 'm', motor: { model: 'nema17', drives: 'j', ...motor }, at: [0, 0, 0], rotate: [-90, 0, 0] }, { id: 'arm', object: 'arm' }], joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.axis' }], ...extra });
    // on the axis, or said not to be
    write('projects/home/assemblies/off.json', { ...arm({}), items: [{ id: 'm', motor: { model: 'nema17', drives: 'j' }, at: [3, 0, 0], rotate: [-90, 0, 0] }, { id: 'arm', object: 'arm' }] });
    assert.equal(code(findings('off'), 'motor.axis')[0].level, 'fail');
    // a kilogram 100 mm out is 0.98 N m, more than the motor's 0.417 moving: failed, with the ratio that would do
    write('projects/home/assemblies/heavy.json', arm({}, { loads: [{ mass: 1, at: 'arm.tip' }] }));
    const heavy = findings('heavy'), t = code(heavy, 'motor.torque')[0];
    assert.equal(t.level, 'fail'); assert.match(t.text, /A ratio of [\d.]+:1 would give it 2 times/);
    assert.ok(Math.abs(t.values.needed - 0.980665) < 0.01, `${t.values.needed} N m at the worst angle`);
    assert.ok(code(heavy, 'motor.holds').some((x) => x.level === 'fail'), 'it slips with the power on, too');
    // a tenth of that passes; it holds powered, and says it drops unpowered, past the detent torque
    write('projects/home/assemblies/light.json', arm({}, { loads: [{ mass: 0.15, at: 'arm.tip' }] }));
    const light = findings('light'), h = code(light, 'motor.holds');
    assert.equal(code(light, 'motor.torque')[0].level, 'pass');
    assert.ok(h.some((x) => x.level === 'warn' && /drops with the power off/.test(x.text)), h.map((x) => x.text).join('\n'));
    assert.ok(h.some((x) => x.level === 'pass' && /holds with the power on/.test(x.text)));
    // a brake on the joint holds it
    write('projects/home/assemblies/braked.json', { ...arm({}, { loads: [{ mass: 0.15, at: 'arm.tip' }] }), joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.axis', brake: 'a ratchet and pawl' }] });
    assert.ok(code(findings('braked'), 'motor.holds').some((x) => x.level === 'pass' && /a ratchet and pawl/.test(x.text)));
    // heat: a stepper's 105 °C against PLA's 57, and the current to set
    assert.match(code(light, 'motor.heat')[0].text, /Set the driver to [\d.]+ A/);
    // set to that, the case runs cool enough (its rise goes as the current squared)
    const advised = /Set the driver to ([\d.]+) A/.exec(code(light, 'motor.heat')[0].text)[1];
    write('projects/home/assemblies/cool.json', arm({ current: Number(advised) }, { loads: [{ mass: 0.15, at: 'arm.tip' }] }));
    const cool = code(findings('cool'), 'motor.heat')[0];
    assert.equal(cool.level, 'pass', cool.text); assert.match(cool.text, new RegExp(`at ${advised.replace('.', '\\.')} A, under PLA's`));
    // and says the case's temperature is an estimate, the maker's rise scaled by the current squared
    assert.match(cool.text, /\(an estimate: nema17's [\d.]+ °C rise at rated current, scaled by the current squared \(its copper loss\), over a 25 °C room\)$/, cool.text);
    assert.match(code(light, 'motor.heat')[0].text, /°C at rated current \(an estimate: nema17's [\d.]+ °C rise at rated current, over a 25 °C room\), past where PLA softens/);
    // a shaft read from its bore
    const hub = (name, set, fit = true) => write(`projects/home/assemblies/${name}.json`, { title: 'Hub', kind: 'fit', items: [{ id: 'm', motor: { model: 'nema17', drives: 'j' } }, { id: 'hub', object: 'hub', set }], joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 12], axis: [0, 0, 1] }, child: 'hub.axis' }], fits: [{ a: 'm', b: 'hub', shaft: fit }] });
    hub('good', {});
    assert.ok(code(findings('good'), 'shaft.grip').some((x) => x.level === 'pass'), JSON.stringify(findings('good')));
    hub('round', { flat: 0 });
    assert.match(code(findings('round'), 'shaft.flat')[0].text, /bore is round and the shaft has a flat/);
    hub('thin', { wall: 1, press: 1, comp: -0.1 }, 'press');
    assert.ok(code(findings('thin'), 'shaft.hoop').some((x) => x.level === 'fail'), JSON.stringify(findings('thin')));
    hub('thick', { wall: 4, press: 1 }, 'press');
    assert.ok(code(findings('thick'), 'shaft.hoop').some((x) => x.level === 'pass'), JSON.stringify(findings('thick')));
    // refusals by name
    write('projects/home/assemblies/nojoint.json', arm({ drives: 'nope' }));
    assert.match(cad('check', 'home/nojoint'), /drives "nope", which isn't a joint/);
    write('projects/home/assemblies/two.json', { ...arm({}), items: [{ id: 'm', motor: { model: 'nema17', drives: 'j' } }, { id: 'n', motor: { model: 'nema17', drives: 'j' } }, { id: 'arm', object: 'arm' }] });
    assert.match(cad('check', 'home/two'), /driven by m already/);
    write('projects/home/assemblies/nomotor.json', arm({ model: 'nema99' }));
    assert.match(cad('check', 'home/nomotor'), /no motor "nema99"/);
  } finally { done(); }
});

test('a motor\'s mount bent by FE: a NEMA 17 on a 2 mm PLA plate fails on deflection and warns on heat, a 6 mm plate held close passes', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const findings = (a) => { const out = cad('check', `home/${a}`, '--json'), r = JSON.parse(out); assert.ok(r.findings, out); return r.findings.filter((x) => /^motor\./.test(x.code)); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['plate', 'wall', 'arm'] });
    // A plate standing out 45 mm from a wall, the motor hung under it, its shaft up through the plate
    write('projects/home/objects/plate.json', { name: 'plate', version: '0.1.0', engine: 'manifold', variables: { thick: { value: 2, unit: 'mm', rule: 'The plate', tweak: { min: 1, max: 10 } }, reach: { value: 60, unit: 'mm', rule: 'Out to the wall', tweak: { min: 25, max: 100 } } } });
    write('projects/home/objects/plate.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) {\n  const m = v.motors.motorModel('nema17')\n  return v.ops.subtract(cuboid({ size: [v.reach + 22, 42.3, v.thick], center: [(v.reach - 22) / 2, 0, v.thick / 2] }), v.motors.mount(m, { plate: v.thick }, v.ops))\n}\n");
    write('projects/home/objects/wall.json', { name: 'wall', version: '0.1.0', variables: { at: { value: 45, unit: 'mm', rule: 'Where the wall starts', tweak: { min: 20, max: 100 } }, reach: { value: 60, unit: 'mm', rule: 'As the plate', tweak: { min: 25, max: 100 } } } });
    write('projects/home/objects/wall.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.reach + 10 - v.at, 50, 30], center: [(v.reach + 10 + v.at) / 2, 0, -15] }) }\n");
    write('projects/home/objects/arm.json', { name: 'arm', version: '0.1.0', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 60, unit: 'mm', rule: 'The arm' } } });
    write('projects/home/objects/arm.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 4], center: [v.long / 2 + 12, 0, 40] }) }\n");
    const bracket = (name, set, wall = {}) => write(`projects/home/assemblies/${name}.json`, { title: 'Bracket', kind: 'fit',
      items: [{ id: 'wall', object: 'wall', set: wall }, { id: 'plate', object: 'plate', set }, { id: 'm', motor: { model: 'nema17', drives: 'j' } }, { id: 'arm', object: 'arm' }],
      joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'arm.axis' }],
      fits: [{ a: 'm', b: 'plate', fastens: true, min: 0 }, { a: 'plate', b: 'wall', fastens: true, min: 0 }], loads: [{ joint: 'j', torque: 0.05 }] });
    bracket('thin', {});
    const thin = findings('thin'), bent = thin.find((x) => x.code === 'motor.mount' && x.values?.deflection != null);
    assert.equal(bent.level, 'fail', bent.text);
    assert.ok(bent.values.deflection > 2 * bent.values.limit, `${bent.values.deflection} mm at the shaft's tip`);
    assert.match(bent.text, /shaft's tip moves [\d.]+ mm, [\d.]+ times the 0\.2 mm fit/);
    assert.match(bent.text, /A plate about [\d.]+ mm thick where it bends \(2 mm at the screws now\), or ribs under it, or a stiffer material/, 'what fixes it');
    assert.match(bent.text, /FE on [\d.]+ mm cubes, 2 across the plate, held where it is fastened/, 'how far to trust it');
    const heat = thin.find((x) => x.code === 'motor.heat');
    assert.equal(heat.level, 'warn'); assert.match(heat.text, /past where PLA softens .* Set the driver to [\d.]+ A/, 'and what fixes the heat');
    // fasten.count: the motor's four mounting screws on the shopping list, through its fit that fastens, a length sold that stays out of the motor's own thread
    const listed = cad('list', 'home/thin'); assert.match(listed, /\n\s+4 ×\s+M3x6 cap\s+[\d.]+ g each, [\d.]+ g\s+1 pack of 10, 6 spare\s+m on plate \(its mount, a fit that fastens\)/, listed);
    // thicker, and held right beside the motor: it passes, the stress against PLA's strength with a margin
    bracket('thick', { thick: 6, reach: 30 }, { at: 22, reach: 30 });
    const ok = findings('thick').find((x) => x.code === 'motor.mount' && x.values?.deflection != null);
    assert.equal(ok.level, 'pass', ok.text);
    assert.ok(ok.values.deflection < bent.values.deflection / 5 && ok.values.margin >= 2 && ok.values.stress > 0, JSON.stringify(ok.values));
    // the screws' engagement in the motor's tapped holes, for the screws as bought; in the order, counted, with the key that turns them
    const engaged = (a) => findings(a).filter((x) => x.code === 'motor.mount' && x.values?.engaged != null);
    const fine = engaged('thick'); assert.equal(fine.length, 1); assert.equal(fine[0].level, 'pass', fine[0].text);
    assert.match(fine[0].text, /^m on plate: 4 M3x10 cap screws through 6 mm of plate engage 4 mm of the motor's 4\.5 mm of M3 thread \(nema17\.mount_hole_depth\)/);
    assert.match(cad('order', 'home/thin'), /m to plate \(4 × M3x6 cap\) with a 2\.5 mm hex key/);
    // "screw": "M3x6" on the motor item: through 6 mm of plate it does not reach the motor's thread, and fails by name
    const short = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/thick.json'), 'utf8'));
    short.items.find((x) => x.id === 'm').motor.screw = 'M3x6'; write('projects/home/assemblies/short.json', short);
    const bad = engaged('short'); assert.equal(bad.length, 1); assert.equal(bad[0].level, 'fail');
    assert.match(bad[0].text, /^m on plate: 4 M3x6 cap screws through 6 mm of plate do not reach the motor's thread: M3x6 cap ends at its face\. An M3x10 cap would engage 4 mm/);
    assert.match(cad('list', 'home/short'), /4 ×\s+M3x6 cap/, 'the screw the item names is the one listed');
  } finally { done(); }
});

test('a motor drives a joint in its own steps; a servo brings its range, and refuses more', async () => {
  const { motorDrives } = await import('./lib/motors.mjs'), { motorModel } = await import('@rulecad/motors');
  const item = (model, drives) => [{ motor: { model, drives } }, { id: 'm', src: { motor: motorModel(model) } }];
  const stepper = { id: 'j', type: 'revolute', dofs: [[-180, 180, 0]] };
  motorDrives({ joints: [{ id: 'j' }] }, [item('28byj48', 'j')], [stepper], (x) => x);
  assert.equal(stepper.step, 5.625 / 64);
  const servo = { id: 'j', type: 'revolute', dofs: [[-180, 180, 0]] };
  motorDrives({ joints: [{ id: 'j' }] }, [item('sg90', 'j')], [servo], (x) => x);
  assert.deepEqual(servo.dofs[0], [-90, 90, 0]);
  assert.throws(() => motorDrives({ joints: [{ id: 'j', min: -120, max: 120 }] }, [item('sg90', 'j')], [{ id: 'j', type: 'revolute', dofs: [[-120, 120, 0]] }], (x) => x), /turns 180°/);
  assert.throws(() => motorDrives({ joints: [{ id: 'j' }] }, [item('sg90', 'j')], [{ id: 'j', type: 'prismatic', dofs: [[0, 1, 0]] }], (x) => x), /a motor turns a revolute/);
  assert.throws(() => motorDrives({ joints: [{ id: 'j' }] }, [item('sg90', 'j')], [{ id: 'j', type: 'revolute', follow: ['k', 1, 0], dofs: [[0, 1, 0]] }], (x) => x), /leads the train/);
});

test('the tutorial: every file and command in TUTORIAL.md works as written, in a workspace npm create rulecad makes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial-')), ws = path.join(root, 'my-designs');
  try {
    const { text, files, commands } = replay(fileURLToPath(new URL('./TUTORIAL.md', import.meta.url)), ws);
    assert.ok(files >= 5 && commands >= 10, `${files} files, ${commands} commands`);
    assert.match(run(ws, ['check', 'home/hook-on-screw']).out, /The screw in its hole: closest gap 0\.\d+ mm/);
    // and the mistakes it lists are reported in the words it gives
    const js = path.join(ws, 'projects/home/objects/hook.js'), good = fs.readFileSync(js, 'utf8');
    for (const [from, to, said] of [['v.plate / 2 / 2', 'v.plate / 4', 'numbers in hook.js that should be variables: line 10: 4'], ['v.thick / 2', 'v.thik / 2', 'v.thik: the design has no variable "thik" (did you mean "thick"?)'], ['return v.ops', 'v.ops', 'main() returned no shape: return a JSCAD solid, or named parts']]) {
      fs.writeFileSync(js, good.replace(from, to));
      const out = run(ws, ['check', 'home/hook']).out;
      assert.ok(out.includes(said), `${to}: ${out}`);
      assert.ok(text.includes(said), `the tutorial's table says: ${said}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the worked examples: every file and command in EXAMPLES.md works as written, parts to a mechanism', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'examples-')), ws = path.join(root, 'my-designs');
  try {
    const { files, commands } = replay(fileURLToPath(new URL('./EXAMPLES.md', import.meta.url)), ws);
    assert.ok(files >= 14 && commands >= 16, `${files} files, ${commands} commands`);
    // What each example promises
    assert.ok(fs.existsSync(path.join(ws, 'exports/home/tag@0.1.0.3mf')), 'the tag exported with its parts');
    assert.match(run(ws, ['check', 'home/tag:long']).out, /88 × 28 × [\d.]+ mm/, 'the long variant: 80 mm with its brim');
    assert.match(run(ws, ['check', 'home/box']).out, /2 poses checked: shut, open/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/basemodel.json'), 'utf8')).rules;
    assert.equal(rules.size_x?.kind, 'derived', 'the measured model became draft rules');
    assert.match(run(ws, ['check', 'home/arm']).out, /arm down: moves [\d.]+ mm under 10 N/);
    assert.match(run(ws, ['check', 'home/pad']).out, /matrix: 4 keys on 2 rows × 2 columns/);
    // the pad in its case (chapter 6): the board's own M2 holes followed into insert bosses from v.fixings, and the screws on the list
    const cased = run(ws, ['check', 'home/padcase']).out;
    assert.match(cased, /4 M2 cap screws: pad's hole measures 2\.4 mm, an M2 clearance hole/, cased);
    assert.match(cased, /ends in case, in a heat-set insert's hole: 3\.2 mm as drawn \(m2\.insert_hole/);
    assert.match(cased, /M2x4 cap chosen, the shortest sold that fits/);
    assert.match(run(ws, ['list', 'home/padcase']).out, /4 ×\s+M2x4 cap[\s\S]*4 ×\s+M2 insert/);
    assert.ok(fs.readdirSync(path.join(ws, '.preview/home')).some((f) => f.endsWith('flick-sequence.svg')), 'the mechanism animated');
    const slider = run(ws, ['check', 'home/slider']).out;
    assert.match(slider, /knob drives slide: 43\.98 mm of rack a turn/, 'the gears: travel a turn');
    assert.match(slider, /knob and slide: centre distance 7\.2 mm, as they need/);
    assert.match(run(ws, ['check', 'home/slider', '--sweep', '--steps', '12']).out, /sweep knob, -180 to 180° in 12 steps: nothing collides/);
    const winder = run(ws, ['check', 'home/winder']).out;
    assert.match(winder, /the carrier drives the sun and the planets \(the ring held\): 4 turns of the sun for each turn of the carrier, the same way/, 'the planetary: four turns a crank');
    assert.doesNotMatch(winder, /✗/, winder);
    assert.match(run(ws, ['check', 'home/winder', '--sweep', '--steps', '24']).out, /sweep crank, -180 to 180° in 24 steps: nothing collides/);
    const driven = run(ws, ['check', 'home/driven']).out;
    assert.match(driven, /drive: 28byj48, 30 g, drives pinion, 0\.0879° a step/, 'the motor');
    assert.match(driven, /drive into slide: [\d.]+ N there against 1 N needed .*rests on community figures/, 'the torque, and what it rests on');
    assert.match(driven, /slide holds with the power off/);
    assert.match(driven, /✓ drive on rail: under the motor's 30 g and [\d.]+ N m, the shaft's tip moves [\d.]+ mm/, 'the rail bent under its motor, by FE');
    assert.doesNotMatch(driven, /✗/, driven);
    assert.match(run(ws, ['check', 'home/driven', '--sweep', '--steps', '12']).out, /sweep pinion, -180 to 180° in 12 steps: nothing collides/);
    // The winder, driven: the sun on an N20, the spool on the carrier; enough torque, and an honest unknown when unpowered
    const wound = run(ws, ['check', 'home/winder-driven']).out;
    assert.match(wound, /the sun drives the carrier and the planets \(the ring held\): 0\.25 turns of the carrier for each turn of the sun/);
    assert.match(wound, /The motor's shaft in the sun: 6\.6 mm of the flat in the bore/);
    assert.match(wound, /drive into reel: 0\.45 N m there against 0\.2 N m needed .*2\.25 times over/, 'the 150:1 gearbox, scaled');
    assert.match(wound, /reel: there's no figure for what holds it with the power off/);
    assert.doesNotMatch(wound, /✗/, wound);
    // ...and drawn as the preview draws it: the motor's curve at the working point, the torque through the train
    const drawn = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/assembly.mjs', import.meta.url))).href)};
      import { motorWork, workCurve, trainSvg, workMarks } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/motorsvg.mjs', import.meta.url))).href)};
      import { driveSvg } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/drive.mjs', import.meta.url))).href)};
      const s = await buildAssembly('home/winder-driven'), [w] = motorWork(s);
      console.log(JSON.stringify({ joint: w.joint, margin: w.margin, curve: workCurve(w), train: trainSvg(w), marks: workMarks(s), drive: driveSvg(s) }));`], { cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26 }));
    assert.equal(drawn.joint, 'reel'); assert.ok(Math.abs(drawn.margin - 2.25) < 0.01, String(drawn.margin));
    assert.match(drawn.curve, /n20, through 4:1/); assert.match(drawn.curve, /the load, 0\.2 N m/);
    assert.match(drawn.train, /drive's shaft/); assert.match(drawn.train, /planetary 4:1/); assert.match(drawn.train, /2\.25× the 0\.2/);
    assert.match(drawn.train, /no figure for what holds it/);
    // the check view's labels, at the motor's shaft and at the reel; the drive animated, cut through the gears
    assert.deepEqual(drawn.marks.map((m) => m.text), ['drive: 0.125 N m at the shaft', 'reel: 0.45 N m, 2.25× the load; unpowered unknown']);
    assert.ok(drawn.marks.every((m) => m.at.length === 3));
    assert.match(drawn.drive, /reel turns 90° while sun turns once \(4:1\)/);
    assert.match(drawn.drive, /at [\d.]+ mm: base, ring, sun, reel/);
    assert.ok((drawn.drive.match(/animateTransform/g) || []).length >= 10, 'the sun, the planets and the reel each turn and move');
    assert.ok(drawn.drive.length < 400000, `small: ${drawn.drive.length} bytes`);
    const shoulder = run(ws, ['check', 'home/shoulder']).out;
    assert.match(shoulder, /the second ring turns 0\.02632 of the sun's turn, the other way \(38:1/, 'the compound planetary');
    assert.match(shoulder, /motor into out: 7\.442 N m there against 0\.735 N m needed/, 'the worst of its range, from a mass on the output');
    assert.match(shoulder, /out holds with the power off: the gears/);
    assert.doesNotMatch(shoulder, /✗/, shoulder);
    // The leg (chapter 14): it stands and steps, nothing overlaps (the output ring's phase, a joint whose range leaves out 0), and the motors carry it
    const stand = JSON.parse(run(ws, ['check', 'leg/stand', '--json']).out).findings, of = (c) => stand.filter((x) => x.code === c);
    assert.equal(of('overlap')[0].level, 'pass', of('overlap')[0].text);
    assert.equal(of('gait.clearance')[0].level, 'pass'); assert.equal(of('gait.sweep')[0].level, 'pass');
    assert.ok(stand.some((x) => x.code === 'motor.torque' && /gait: knee needs/.test(x.text) && x.level === 'pass'), JSON.stringify(of('motor.torque')));
    assert.match(of('gait.stable')[0].text, /one leg, on a stand/);
    assert.ok(fs.existsSync(path.join(ws, '.preview/leg/stand-gait.svg')), 'its step animated');
    // The bracket screwed on (chapter 15): each end found where v.fixings drew it, the lengths chosen, the shelf's load carried; a short screw and one the wall hides each fail by name
    const shelf = JSON.parse(run(ws, ['check', 'fix/shelf', '--json']).out).findings, at = (c) => shelf.filter((x) => x.code === c);
    assert.deepEqual(shelf.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    const ends = at('fasten.end').map((x) => x.text).join('\n');
    assert.match(ends, /screw 1 \(bracket\.pilot\): ends in plate, in a pilot .* 2\.9 mm as drawn \(x1c\.pilot_m3, measured\)/);
    assert.match(ends, /screw 2 \(bracket\.insert\): ends in plate, in a heat-set insert's hole: 4 mm as drawn/);
    assert.match(ends, /Back screws, 2 M3 countersunk screws: ends in an M3 hex nut in its seat in bracket, 5\.7 mm across the flats/, 'the nut in its slot, not on the far face');
    assert.deepEqual(at('fasten.length').map((x) => x.text.match(/(M3x\d+ \w+) chosen/)[1]), ['M3x10 cap', 'M3x8 cap', 'M3x16 countersunk']);
    assert.match(at('fasten.seat').map((x) => x.text).join('\n'), /countersunk head sits in a (89\.\d|90)° countersink in plate/);
    assert.deepEqual(at('fasten.load').filter((x) => x.values?.margin != null).map((x) => Math.round(x.values.margin)), [41, 33], 'the margins the chapter gives');
    assert.match(run(ws, ['list', 'fix/shelf']).out, /2 ×\s+M3x16 countersunk[\s\S]*2 ×\s+M3 hex nut[\s\S]*1 ×\s+M3 insert[\s\S]*5\.9 g\s+about \d+ min\s+plate\s+11\.8 g\s+about \d+ min\s+bracket/);
    const short = run(ws, ['check', 'fix/short']);
    assert.equal(short.code, 1); assert.match(short.out, /✗ Front screws, screw 1 \(bracket\.pilot\): M3x6 cap engages 2\.6 mm of thread in pla .* M3x10 cap would do/);
    assert.match(short.out, /✗ Front screws, screw 2 \(bracket\.insert\): M3x6 cap engages 2\.6 mm of thread in the insert.* M3x8 cap would do/);
    const first = run(ws, ['check', 'fix/wall-first']);
    assert.equal(first.code, 1); assert.match(first.out, /✗ Back screws, 2 M3 countersunk screws: a 2 mm hex key cannot reach the head: wall stands over it/);
    assert.match(first.out, /✗ the screw of "Back screws" can't be reached in any order: wall stands over it and goes on first/);
    // The frame (chapter 16): a box of one profile, every end joined or capped, its axis driven within its margins; the
    // cut list from one bar, a sheet per mark and the jigs; its printed fittings on one plate; 37 steps from bars to
    // square; a trapped nut and a plate drawn for another slot spacing each fail by name
    const box = JSON.parse(run(ws, ['check', 'frame/box', '--json']).out).findings, of16 = (c) => box.filter((x) => x.code === c);
    assert.deepEqual(box.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    assert.equal(of16('join.geometry').length, 16); assert.match(of16('join.end')[0].text, /every beam end is joined or capped \(24 ends\)/);
    assert.match(of16('guide.travel')[0].text, /slides 99\.5 mm/); assert.match(of16('guide.coupler')[0].text, /reaches 12\.5 mm into coupler-5-8/);
    assert.equal(+of16('motor.torque')[0].values.margin.toFixed(2), 6.36); assert.match(of16('motor.heat')[0].text, /at 1\.2 A, under PLA's 57 °C/);
    assert.ok(of16('fasten.length').some((x) => /^The board plate, 2 M4 button screws: M4x8 button chosen/.test(x.text)));
    assert.deepEqual([...new Set(of16('frame.nut').map((x) => x.level))], ['pass']); assert.equal(of16('frame.square').length, 4);
    const cut = run(ws, ['list', 'frame/box']).out;
    assert.match(cut, /profile-2020-misumi-hfs5: buy 1 × 4000 mm; kerf 3, trim 10; 1234 mm left over/);
    assert.match(cut, /12 ×\s+M5x12 button[\s\S]*18 ×\s+slot-nut-6-misumi-m4-drop-in/); assert.match(cut, /Total: 124 g printed/);
    // the chapter's fasteners as cad list gives them: the 18 nuts are 16 for the brackets, holders and motor plate and 2 for the board plate
    for (const [n, what] of [[4, 'M3x8 cap'], [4, 'M3x12 button'], [2, 'M4x8 button'], [16, 'M4x10 cap'], [12, 'M5x12 button'], [4, 'M5x16 cap']]) assert.match(cut, new RegExp(`\\n\\s+${n} ×\\s+${what.replace('.', '\\.')}\\s`), what);
    assert.equal((cut.match(/\n\s+18 ×\s+slot-nut-6-misumi-m4-drop-in.*/)[0].match(/The board plate/g) || []).length, 1);
    // what rests on estimates, as the chapter says: the heat scaled by the current squared, the lead nut's friction 0.15
    assert.match(of16('motor.heat')[0].text, /reaches at most [\d.]+ °C at 1\.2 A/);
    assert.ok(box.some((x) => /the nut's friction μ 0\.15 \(estimate\)/.test(x.text)), 'the lead nut\'s friction');
    // one count: cad check's assembly.order counts the build cad order prints
    assert.equal(of16('assembly.order')[0].values.steps, 37);
    for (const m of 'ABCDEFG') assert.ok(fs.existsSync(path.join(ws, `exports/frame/box.beam-${m}.svg`)), `the sheet for mark ${m}`);
    assert.ok(fs.existsSync(path.join(ws, 'exports/frame/box.jigs.3mf')), 'the jigs as one plate');
    const bed = JSON.parse(fs.readFileSync(path.join(ws, 'projects/frame/assemblies/box-base-1.json'), 'utf8'));
    assert.equal(bed.items.length, 17, 'every printed part on one plate'); assert.ok(!fs.existsSync(path.join(ws, 'projects/frame/assemblies/box-base-2.json')));
    assert.equal(run(ws, ['order', 'frame/box']).out.split('\n').filter((l) => /^\s+\d+\. /.test(l)).length, 37);
    const trapped = run(ws, ['check', 'frame/trapped']);
    assert.equal(trapped.code, 1); assert.match(trapped.out, /✗ The board plate: 2 slide-in nuts \(slot-nut-6-misumi-m4-slide-in\) go into x1's top slot at 105 and 155 mm, between .* which close it at both ends: .* give "nut": "drop-in"/);
    const shut = run(ws, ['order', 'frame/trapped']);
    assert.equal(shut.code, 1); assert.match(shut.out, /would be shut in between the blind join of x1\.a to p1\.back@30 and the blind join of x1\.b to p2\.front@30/);
    const wide = run(ws, ['check', 'frame/spacing']);
    assert.equal(wide.code, 1); assert.equal((wide.out.match(/✗ The board plate, screw [12] \(hole at -?15, 0, 1\.5\): plate's hole is 5 mm off the centre line of x1's top\.[12] slot/g) || []).length, 2, wide.out);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('releases: a design released as a git tag, its history, a change bumped, an earlier release rebuilt and compared (paths in git\'s terms on every system)', () => {
  const { ws, cad, done } = workspace();
  const git = (...a) => execFileSync('git', a, { cwd: ws, encoding: 'utf8', stdio: 'pipe' });
  try {
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test'); git('config', 'commit.gpgsign', 'false'); git('config', 'tag.gpgsign', 'false');
    fs.writeFileSync(path.join(ws, '.gitignore'), 'node_modules\n.cache\nexports\n.preview\n.versions\n');
    cad('new', 'home/tray');
    git('add', '-A'); git('commit', '-q', '-m', 'A tray');
    assert.match(cad('release', 'home/tray', '-m', 'First tray', '--dry-run'), /home\/tray@0\.1\.0/);
    assert.match(cad('release', 'home/tray', '-m', 'First tray'), /tagged home\/tray@0\.1\.0/);
    assert.match(git('tag', '-l'), /home\/tray@0\.1\.0/);
    assert.match(cad('history', 'home/tray'), /0\.1\.0 +\d{4}-\d\d-\d\d +first +First tray/);
    // A change: wider, inside its range. Its bump is said, then made; the earlier release still builds from its tag
    const w = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/objects/tray.json'), 'utf8')).variables.width, to = Math.min(w.tweak?.max ?? w.value + 5, w.value + 5);
    cad('set', 'home/tray', `width=${to}`);
    assert.match(cad('release', 'home/tray', '-m', 'Wider', '--dry-run'), /home\/tray@0\.1\.1 \(patch, from 0\.1\.0\)/);
    assert.match(cad('release', 'home/tray', '-m', 'Wider'), /tagged home\/tray@0\.1\.1/);
    assert.match(cad('export', 'home/tray@0.1.0'), /tray@0\.1\.0/);
    assert.ok(fs.existsSync(path.join(ws, 'exports', 'home', 'tray@0.1.0.3mf')), 'the earlier release, rebuilt from its tag');
    assert.match(cad('diff', 'home/tray', '0.1.0', '0.1.1'), /width/);
    assert.match(fs.readFileSync(path.join(ws, 'projects/home/CHANGELOG.md'), 'utf8'), /tray 0\.1\.1 \(patch[\s\S]*Wider/);
  } finally { done(); }
});

test('a check reads the object against its schema first; a measurement with no rule, and an object with no name, are warnings', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/plain', { variables: { w: { value: 10, unit: 'mm' } } }, BOX.replace(/v\.(d|h)\b/g, 'v.w'));
    const out = cad('check', 'demo/plain');
    assert.match(out, /! a variable has no rule saying why it is what it is: w/);
    const file = path.join(ws, 'projects/demo/objects/plain.json'), j = JSON.parse(fs.readFileSync(file, 'utf8'));
    j.variables.w.value = null; fs.writeFileSync(file, JSON.stringify(j));
    assert.match(cad('check', 'demo/plain'), /variables\.w\.value: should be number or string or boolean or array or object, not null/);
  } finally { done(); }
});

test('a node_modules link spelled through another link: the sandbox names the link it was refused, and the remedy', { skip: process.platform === 'win32' && 'linked folders need privileges on Windows' }, () => {
  const { ws, cad, done } = workspace();
  // a folder outside the workspace, reached through a link beside it: the way macOS spells /var/folders through /var
  const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-alias-'))), alias = `${real}-link`;
  try {
    fs.symlinkSync(real, alias, 'dir'); fs.symlinkSync(ROOT_MODULES, path.join(real, 'node_modules'), 'dir');
    fs.rmSync(path.join(ws, 'node_modules')); fs.symlinkSync(path.join(alias, 'node_modules'), path.join(ws, 'node_modules'), 'dir');
    cad('new', 'home/tray');
    const out = cad('check', 'home/tray');
    assert.match(out, new RegExp(`sandbox was refused ${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, a link to ${real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), out);
    assert.match(out, /Make that link with its real path/);
  } finally { done(); fs.rmSync(alias, { force: true }); fs.rmSync(real, { recursive: true, force: true }); }
});

test('gears in an assembly: mesh turns a joint into its mate\'s follower in phase, the centre distance is checked, and the sweep proves it turns', () => {
  const { ws, cad, done } = workspace();
  try {
    const gear = (teeth) => ({ variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: teeth, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' }, bore: { value: 3, unit: 'mm', rule: 'Shaft' } },
      anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } });
    const GEAR = 'export function main (v) { return v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore }) }\n';
    object(ws, 'demo/pinion', gear(18), GEAR);
    object(ws, 'demo/wheel', gear(30), GEAR);
    object(ws, 'demo/bar', { variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: 20, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' } }, anchors: { slide: { at: [0, 0, 0], axis: [1, 0, 0] } } },
      'export function main (v) { return v.gears.rack({ module: v.module, teeth: v.teeth, width: v.width }) }\n');
    object(ws, 'demo/plate', { variables: { t: { value: 2, unit: 'mm', rule: 'Plate' } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [40, 30, v.t], center: [0, -40, v.t / 2] }) }\n");
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const train = (wheelAt, wheel = {}) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/train.json'), JSON.stringify({ title: 'Train', kind: 'fit',
      items: [{ id: 'plate', object: 'plate' }, { id: 'pinion', object: 'pinion' }, { id: 'wheel', object: 'wheel' }, { id: 'bar', object: 'bar' }],
      joints: [
        { id: 'drive', type: 'revolute', parent: { item: 'plate', at: [0, 0, 'plate.t'], axis: [0, 0, 1] }, child: 'pinion.axis', min: -90, max: 90, label: 'Crank' },
        { id: 'wheel', type: 'revolute', parent: { item: 'plate', at: [0, wheelAt, 'plate.t'], axis: [0, 0, 1] }, child: 'wheel.axis', min: -360, max: 360, ...wheel },
        // the rack under the pinion: its pitch line 9 mm below the pinion's centre (the pitch radius), along x
        { id: 'slide', type: 'prismatic', parent: { item: 'plate', at: [-31.4, -9, 'plate.t'], axis: [1, 0, 0] }, child: 'bar.slide', min: -40, max: 40, mesh: { with: 'drive', module: 'pinion.module', teeth: ['pinion.teeth', 'bar.teeth'] } }],
    }));
    const meshed = { mesh: { with: 'drive', module: 'pinion.module', teeth: ['pinion.teeth', 'wheel.teeth'] } };
    train(24, meshed);
    const checked = cad('check', 'demo/train');
    assert.match(checked, /drive drives wheel: 0\.6 turns of the second for each turn of the first \(18:30\), turning opposite ways/);
    assert.match(checked, /drive and wheel: centre distance 24 mm, as they need: 0\.15 mm of backlash/);
    assert.match(checked, /drive and slide: centre distance 9 mm, as they need/);
    assert.match(checked, /drive and wheel: as drawn, 0\.1[45]\d* (to 0\.1[45]\d* )?mm of play at the pitch circle/, 'measured from the drawn teeth');
    assert.match(checked, /drive drives slide: 56\.55 mm of rack a turn/);
    assert.match(checked, /no parts overlap/);
    const swept = cad('check', 'demo/train', '--sweep', '--steps', '18');
    assert.match(swept, /sweep drive, -90 to 90° in 18 steps: nothing collides/, swept);
    // the same follow without the phase: the teeth meet
    train(24, { follow: 'drive', ratio: -0.6, offset: 0 });
    assert.match(cad('check', 'demo/train', '--sweep', '--steps', '18'), /sweep drive, -90 to 90° in 18 steps: .*pinion\.body hits wheel\.body/);
    // axes too close: more than the backlash allows, said between them
    train(23.7, meshed);
    const close = JSON.parse(cad('check', 'demo/train', '--json')).findings.find((x) => x.code === 'mesh.centre' && x.text.startsWith('drive and wheel'));
    assert.equal(close.level, 'fail'); assert.match(close.text, /0\.3 mm closer than these gears need \(24 mm\): more than their 0\.15 mm of backlash allows, and the teeth jam/);
    assert.deepEqual(close.between.map((p) => p.map((x) => +x.toFixed(6))), [[0, 0, 2], [0, 23.7, 2]]);
    // what isn't a mesh
    train(24, { mesh: { with: 'nothing', module: 1, teeth: [18, 30] } });
    assert.match(cad('check', 'demo/train'), /joint wheel: mesh: "with" names the driving joint/);
    train(24, { mesh: { with: 'drive', module: 1, teeth: [12, 30] } });
    assert.match(cad('check', 'demo/train'), /joint wheel: mesh: gearModel: 12 teeth at 20° are undercut/);
  } finally { done(); }
});

test('a planetary gearbox in an assembly: the carrier drives, the sun and every planet follow in phase, and the sweep proves it turns', () => {
  const { ws, cad, done } = workspace();
  try {
    const gear = (teeth) => ({ variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: teeth, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' }, bore: { value: 3, unit: 'mm', rule: 'Shaft' } },
      anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } });
    const GEAR = 'export function main (v) { return v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore }) }\n';
    object(ws, 'box/sun', gear(18), GEAR);
    object(ws, 'box/planet', gear(27), GEAR);
    object(ws, 'box/ring', { variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: 72, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' } } },
      'export function main (v) { return v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width }) }\n');
    // the carrier: a disc over the gears, inside the ring's tips, holding the planets' axles below it
    const at = (deg) => [22.5 * Math.cos((deg * Math.PI) / 180), 22.5 * Math.sin((deg * Math.PI) / 180), '0 - drop'];
    object(ws, 'box/carrier', { variables: { a: { value: 22.5, unit: 'mm', rule: 'Sun to planet: m (S + P) / 2' }, drop: { value: 6.4, unit: 'mm', rule: 'A planet\'s width and a gap' }, r: { value: 28, unit: 'mm', rule: 'Inside the ring\'s tips' }, t: { value: 2, unit: 'mm', rule: 'Plate' } },
      anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] }, p0: { at: at(0), axis: [0, 0, 1] }, p1: { at: at(120), axis: [0, 0, 1] }, p2: { at: at(240), axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: v.r, height: v.t, center: [0, 0, v.t / 2] }) }\n");
    object(ws, 'box/case', { variables: { t: { value: 2, unit: 'mm', rule: 'Base' } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: 45, height: v.t, center: [0, 0, v.t / 2] }) }\n");
    fs.mkdirSync(path.join(ws, 'projects/box/assemblies'));
    const box = (third = 240) => fs.writeFileSync(path.join(ws, 'projects/box/assemblies/gearbox.json'), JSON.stringify({ title: 'Gearbox', kind: 'fit',
      items: ['case', 'sun', 'carrier', 'planet', 'planet', 'planet'].map((o, i) => ({ id: i >= 3 ? `p${i - 3}` : o, object: o })).concat([{ id: 'ring', object: 'ring', at: [0, 0, 2.4] }]),
      joints: [
        { id: 'sun', type: 'revolute', parent: { item: 'case', at: [0, 0, 2.4], axis: [0, 0, 1] }, child: 'sun.axis', min: -1000, max: 1000 },
        { id: 'carrier', type: 'revolute', parent: { item: 'case', at: [0, 0, 8.8], axis: [0, 0, 1] }, child: 'carrier.axis', min: -60, max: 60, label: 'Carrier' },
        ...[0, 1, 2].map((k) => ({ id: `p${k}`, type: 'revolute', parent: k === 2 ? { item: 'carrier', at: [22.5 * Math.cos((third * Math.PI) / 180), 22.5 * Math.sin((third * Math.PI) / 180), '0 - carrier.drop'], axis: [0, 0, 1] } : `carrier.p${k}`, child: `p${k}.axis`, min: -1000, max: 1000 })),
      ],
      planetary: [{ sun: 'sun', carrier: 'carrier', ring: 'ring', planets: ['p0', 'p1', 'p2'], drive: 'carrier', module: 1, teeth: ['sun.teeth', 'p0.teeth', 'ring.teeth'] }],
      poses: { rest: { carrier: 0 }, back: { carrier: -15 } },
    }));
    box();
    const checked = cad('check', 'box/gearbox');
    assert.match(checked, /the carrier drives the sun and the planets \(the ring held\): 5 turns of the sun for each turn of the carrier, the same way/, checked);
    // the ring only placed on the case, nothing fastening it: said
    assert.match(checked, /! ring is placed, but nothing holds it: give it a joint, or fasten it/);
    assert.match(checked, /sun and p2: centre distance 22\.5 mm, as they need/);
    assert.match(checked, /sun and p0: as drawn, [\d.]+ (to [\d.]+ )?mm of play/); assert.match(checked, /p0 and the ring: as drawn, [\d.]+ (to [\d.]+ )?mm of play/);
    assert.match(checked, /no parts overlap/);
    assert.doesNotMatch(checked, /✗/);
    // at −15° JSCAD's intersection read the sun 2.7 mm³ into a planet 0.07 mm from it; measured with Manifold, clear
    assert.match(cad('check', 'box/gearbox', '--pose', 'back'), /Gearbox \(back\)[\s\S]*✓ no parts overlap/);
    const swept = cad('check', 'box/gearbox', '--sweep', '--steps', '16');
    assert.match(swept, /sweep carrier, -60 to 60° in 16 steps: nothing collides/, swept);
    // a planet out of place: it can't mesh with both
    box(250);
    assert.match(cad('check', 'box/gearbox'), /✗ planet p2 can't mesh with the sun and the ring at once where it is/);
  } finally { done(); }
});

test('a worm and its wheel in an assembly: the wheel follows a tooth a turn, in phase, and the sweep proves it', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, bore: { value: 3, unit: 'mm', rule: 'Shaft' } };
    object(ws, 'drive/worm', { variables: { ...vars, length: { value: 24, unit: 'mm', rule: 'Thread length' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } },
      'export function main (v) { return v.gears.worm({ module: v.module, length: v.length, bore: v.bore }) }\n');
    object(ws, 'drive/wheel', { variables: { ...vars, teeth: { value: 30, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } },
      'export function main (v) { return v.gears.wormWheel({ module: v.module }, { teeth: v.teeth, width: v.width, bore: v.bore }) }\n');
    fs.mkdirSync(path.join(ws, 'projects/drive/assemblies'));
    const drive = (wheel) => fs.writeFileSync(path.join(ws, 'projects/drive/assemblies/box.json'), JSON.stringify({ title: 'Worm drive', kind: 'fit',
      items: [{ id: 'worm', object: 'worm' }, { id: 'wheel', object: 'wheel' }],
      // the worm along x, 20 mm over the wheel's axis (along y), the wheel's middle on the worm's axis
      joints: [{ id: 'turn', type: 'revolute', parent: { at: [-12, 0, 20], axis: [1, 0, 0] }, child: 'worm.axis', min: -720, max: 720, label: 'Worm' },
        { id: 'wheel', type: 'revolute', parent: { at: [0, -3, 0], axis: [0, 1, 0] }, child: 'wheel.axis', min: -720, max: 720, ...wheel }],
    }));
    drive({ mesh: { with: 'turn', module: 'worm.module', teeth: [1, 'wheel.teeth'], worm: true } });
    const checked = cad('check', 'drive/box');
    assert.match(checked, /turn drives wheel: a worm of 1 start, 30 turns of the worm for one of the wheel/, checked);
    assert.match(checked, /it locks: the lead angle \(5\.71°\) is under the friction angle/);
    assert.match(checked, /centre distance 15 mm, as they need/, 'the wheel\'s centre its pitch radius (15 mm) from the worm\'s pitch cylinder');
    assert.match(checked, /no parts overlap/);
    assert.match(cad('check', 'drive/box', '--sweep', '--steps', '16'), /sweep turn, -720 to 720° in 16 steps: nothing collides/);
    // the same ratio with no phase: the thread runs into the teeth
    drive({ follow: 'turn', ratio: 1 / 30, offset: 0 });
    assert.match(cad('check', 'drive/box', '--sweep', '--steps', '16'), /worm\.body hits wheel\.body/);
  } finally { done(); }
});

test('bevel gears in an assembly: cones that share their apex mesh in phase at 90°, and the sweep proves it', () => {
  const { ws, cad, done } = workspace();
  try {
    const gear = (teeth, mate) => ({ variables: { module: { value: 1.5, unit: 'mm', rule: 'Tooth size' }, teeth: { value: teeth, rule: 'Teeth' }, mate: { value: mate, rule: 'Its mate' }, bore: { value: 4, unit: 'mm', rule: 'Shaft' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } });
    const BEVEL = 'export function main (v) { return v.gears.bevel({ module: v.module, teeth: v.teeth, mate: v.mate, bore: v.bore }) }\n';
    object(ws, 'corner/small', gear(20, 30), BEVEL);
    object(ws, 'corner/large', gear(30, 20), BEVEL);
    fs.mkdirSync(path.join(ws, 'projects/corner/assemblies'));
    // the small gear up z, its apex 22.5 mm over its back (R cos δ = the large gear's pitch radius); the large one
    // pointing back along −x at that apex, its back end 15 mm from it
    const pair = (at, mesh = { mesh: { with: 'input', module: 1.5, teeth: [20, 30], bevel: true } }) => fs.writeFileSync(path.join(ws, 'projects/corner/assemblies/pair.json'), JSON.stringify({ title: 'Corner drive', kind: 'fit',
      items: [{ id: 'small', object: 'small' }, { id: 'large', object: 'large' }],
      joints: [{ id: 'input', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'small.axis', min: -90, max: 90, label: 'Input' },
        { id: 'output', type: 'revolute', parent: { at, axis: [-1, 0, 0] }, child: 'large.axis', min: -360, max: 360, ...mesh }],
    }));
    pair([15, 0, 22.5]);
    const checked = cad('check', 'corner/pair');
    assert.match(checked, /bevel gears at 90°, 0\.6667 turns of the second for each of the first \(cones of 33\.69° and 56\.31°\)/, checked);
    assert.match(checked, /no parts overlap/); assert.doesNotMatch(checked, /✗/);
    assert.match(cad('check', 'corner/pair', '--sweep', '--steps', '16'), /sweep input, -90 to 90° in 16 steps: nothing collides/);
    // the cones' apexes apart: said
    pair([16, 0, 22.5]);
    assert.match(cad('check', 'corner/pair'), /✗ .*the cones' apexes are 1 mm apart/);
  } finally { done(); }
});

test('engage: a sleeve seated over a post passes; resting on the post\'s end, touching and not overlapping, it fails', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'shaft/post', { variables: { r: { value: 2, unit: 'mm', rule: 'Post' }, h: { value: 10, unit: 'mm', rule: 'Post' } }, anchors: { top: { at: [0, 0, 'h'], axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: v.r, height: v.h, center: [0, 0, v.h / 2] }) }\n");
    const sleeve = (anchorAt) => object(ws, 'shaft/sleeve', { variables: { r: { value: 4, unit: 'mm', rule: 'Sleeve' }, hole: { value: 2.2, unit: 'mm', rule: 'Round the post' }, t: { value: 4, unit: 'mm', rule: 'Sleeve' } }, anchors: { seat: { at: [0, 0, anchorAt], axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nconst { cylinder } = jscad.primitives\nexport function main (v) { return jscad.booleans.subtract(cylinder({ radius: v.r, height: v.t, center: [0, 0, v.t / 2] }), cylinder({ radius: v.hole, height: v.t, center: [0, 0, v.t / 2] })) }\n");
    fs.mkdirSync(path.join(ws, 'projects/shaft/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/shaft/assemblies/pair.json'), JSON.stringify({ title: 'Sleeve on a post', kind: 'fit',
      items: [{ id: 'post', object: 'post' }, { id: 'sleeve', object: 'sleeve' }],
      joints: [{ id: 'on', type: 'fixed', parent: 'post.top', child: 'sleeve.seat' }],
      fits: [{ a: 'sleeve', b: 'post', engage: 'sleeve.t', note: 'Sleeve over the post' }] }));
    sleeve(0); // its anchor on its bottom face: it stands on the post's end
    const resting = cad('check', 'shaft/pair');
    assert.match(resting, /no parts overlap/, 'touching end to end overlaps nothing');
    assert.match(resting, /✗ Sleeve over the post: not on at all \(end to end\) along their joint, where it should go 4 mm on/);
    sleeve('t'); // its anchor on its top face: it goes down over the post
    assert.match(cad('check', 'shaft/pair'), /✓ Sleeve over the post: 4 mm on along their joint/);
  } finally { done(); }
});

test('joint.running: a child turning on a printed pin, against the printer\'s fit, less what a bore prints small by', async () => {
  const { runningGap } = await import('./lib/seats.mjs');
  const jscad = (await import('@jscad/modeling')).default, { cylinder } = jscad.primitives, { subtract } = jscad.booleans, { geom3 } = jscad.geometries;
  const tris = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]].map((v) => [...v])));
  const pin = (d, z0 = 0, z1 = 8) => tris(cylinder({ radius: d / 2, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 64 }));
  const ring = (bore, od, z0, z1) => tris(subtract(cylinder({ radius: od / 2, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 64 }), cylinder({ radius: bore / 2, height: z1 - z0 + 2, center: [0, 0, (z0 + z1) / 2], segments: 64 })));
  const g = runningGap(pin(2.79), ring(3, 12, 1, 6));
  assert.ok(Math.abs(g.gap - 0.105) < 0.005, `the gear card's pegs: ${g.gap}`);
  assert.equal(g.pinOn, 'a');
  assert.ok(Math.abs(g.length - 5) < 1, 'as far as they share');
  const round = runningGap(ring(3, 12, 1, 6), pin(2.79));
  assert.equal(round.pinOn, 'b', 'either way round');
  assert.equal(runningGap(pin(2.79), ring(8, 12, 1, 6)), null, 'room, not a running fit');
  assert.equal(runningGap(pin(2.79, 0, 1), ring(3, 12, 2, 6)), null, 'nothing shared along the axis');
  assert.equal(runningGap(ring(3, 12, 0, 5), ring(3, 12, 0, 5)), null, 'two bores: nothing turns on a pin');
});

test('cad measured: a measurement where the estimate was, what moved, the ledger, and the table of what is still assumed', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.json'), JSON.stringify({ name: 'block', title: 'Block', version: '0.1.0', uses: ['x1c'], engine: 'manifold', variables: { side: { value: '200 * x1c.press', unit: 'mm', rule: 'A side, from the press' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.side], center: [v.side / 2, v.side / 2, v.side / 2] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/one.json'), JSON.stringify({ title: 'One', kind: 'fit', items: [{ id: 'a', object: 'block' }, { id: 'b', object: 'block', at: [20, 0, 0] }], fits: [{ a: 'a', b: 'b', min: 0, max: 100, note: 'apart' }] }));
    const first = cad('check', 'home/one');
    assert.match(first, /uses estimates, not measurements: x1c\.press/); assert.match(first, /cad measured home\/one <name>=<value>/);
    assert.match(cad('measured', 'home/one', '--table'), /\| `x1c\.press` \| .*\| `cad measured home\/one x1c\.press=<value>` \|/);
    const out = cad('measured', 'home/one', 'x1c.press=0.08', '--source', 'seats coupon');
    assert.match(out, /x1c\.press: measured 0\.08 mm, predicted 0\.05 \(estimate\), ratio 1\.6/); assert.match(out, /apart: closest gap 4 mm/);
    const rule = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules.press;
    assert.equal(rule.value, 0.08); assert.equal(rule.kind, 'measured'); assert.equal(rule.source, 'seats coupon');
    assert.doesNotMatch(cad('check', 'home/one'), /x1c\.press\. /, 'no longer an estimate');
    assert.match(cad('history', 'home/one'), /x1c\.press: measured 0\.08/);
    assert.match(cad('history', 'home'), /ratio 1\.6/);
    assert.match(cad('measured', 'home/one', 'x1c.nothing=1'), /x1c has no rule "nothing"/);
    assert.match(cad('measured', 'home/one', 'x1c.press=2', '--unit', 'in'), /is in mm, and this is in in/);
    assert.match(cad('measured', 'home/none', 'x1c.press=2'), /no assembly "home\/none"/);
  } finally { done(); }
});

test('cad measured from the slot coupon: the slot fit lands in the printer\'s rule set, a slot\'s caliper figures in the workspace\'s copy of its set, and a carrier is drawn from both', () => {
  const { ws, cad, done } = workspace();
  try {
    const js = `export function main (v) {
  const m = v.frames.carrierModel('slot-8', { thread: 'M5', printer: v.x1c })
  return v.frames.carrier(m, { pose: 'print', printer: v.x1c })
}
`;
    object(ws, 'home/carrier', { uses: ['x1c'], engine: 'manifold', variables: {} }, js);
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['carrier'] }));
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/coupon.json'), JSON.stringify({ title: 'Coupon', kind: 'fit', items: [{ id: 'carrier', object: 'carrier' }] }));
    // the carrier's width across the slot: the cavity less the clearance each side
    const across = () => Number(cad('check', 'home/carrier').match(/([\d.]+) × ([\d.]+) × ([\d.]+) mm, fits the bed/)[2]);
    assert.equal(across(), 16.1, 'before: slot-8\'s community cavity 16.5 less x1c.fit 0.2 each side');
    const kit = ['x1c', 'slot-8'].map((n) => fs.readFileSync(new URL(`../rules/${n}.json`, import.meta.url), 'utf8'));
    const own = (n) => path.join(ws, `rules/${n}.json`), measuredIn = (n, k) => fs.existsSync(own(n)) && JSON.parse(fs.readFileSync(own(n), 'utf8')).rules[k]?.kind === 'measured';
    // figures that make no slot are refused, and nothing is written
    assert.match(cad('measured', 'home/coupon', 'x1c.slot_fit=0.15', 'slot-8.opening=17'), /slot-8: .*cavity_width is wider than opening, 17/);
    assert.ok(!measuredIn('x1c', 'slot_fit') && !measuredIn('slot-8', 'opening'), 'nothing written');
    const out = cad('measured', 'home/coupon', 'x1c.slot_fit=0.15', 'x1c.printed_slot_fit=0.25', 'slot-8.opening=8.1', 'slot-8.cavity_width=16.3');
    assert.match(out, /x1c\.slot_fit: measured 0\.15 mm, predicted 0\.2 \(x1c\.fit, community\), ratio 0\.75/);
    assert.match(out, /x1c\.printed_slot_fit: measured 0\.25 mm, predicted 0\.2/);
    assert.match(out, /slot-8\.opening: measured 8\.1 mm, predicted 8 \(community\)/);
    const x1c = JSON.parse(fs.readFileSync(own('x1c'), 'utf8')).rules, slot = JSON.parse(fs.readFileSync(own('slot-8'), 'utf8')).rules, today = new Date().toISOString().slice(0, 10);
    for (const r of [x1c.slot_fit, x1c.printed_slot_fit, slot.opening, slot.cavity_width]) { assert.equal(r.kind, 'measured'); assert.equal(r.checked, today); assert.equal(r.unit, 'mm'); assert.match(r.source, /slot coupon/); }
    assert.match(x1c.slot_fit.rule, /slid the beam's length by hand without rattling/); assert.match(slot.opening.source, /calipers on your own beam/);
    assert.deepEqual([x1c.slot_fit.value, slot.opening.value, slot.cavity_width.value, slot.cavity_depth.kind], [0.15, 8.1, 16.3, 'community'], 'only what was measured');
    assert.deepEqual(['x1c', 'slot-8'].map((n) => fs.readFileSync(new URL(`../rules/${n}.json`, import.meta.url), 'utf8')), kit, 'the kit\'s own rule sets are untouched');
    // drawn again from them: the measured cavity less the measured fit each side
    assert.equal(across(), 16, '16.3 less 0.15 each side');
    assert.match(cad('history', 'home/coupon'), /x1c\.slot_fit: measured 0\.15 mm, predicted 0\.2/);
  } finally { done(); }
});

test('cad measured from the fixings coupon: each result lands in the printer\'s rule set with its source and date, and a pilot then rests on a measured rule', () => {
  const { ws, cad, done } = workspace();
  try {
    const js = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const f = v.fixings, top = v.thick
  return v.ops.subtract(cuboid({ size: [v.width, v.width, top], center: [0, 0, top / 2] }), f.hole('M4', { kind: 'pilot', at: [0, 0, top] }), f.nutPocket('M3', { at: [v.width / 2 - top, 0, top] }))
}
`;
    object(ws, 'home/plate', { uses: ['x1c'], engine: 'manifold', variables: { width: { value: 30, unit: 'mm', rule: 'Room for both' }, thick: { value: 'x1c.layer * 40', unit: 'mm', rule: 'The pilot and a floor' } } }, js);
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['plate'] }));
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/coupon.json'), JSON.stringify({ title: 'Coupon', kind: 'fit', items: [{ id: 'plate', object: 'plate' }] }));
    const drawn = () => JSON.parse(cad('check', 'home/plate', '--json')).findings;
    const pilot = (f) => f.find((x) => x.code === 'hole.drawn' && x.refs.thread === 'M4'), pocket = (f) => f.find((x) => x.code === 'nutPocket.drawn');
    assert.deepEqual([pilot(drawn()).refs.rule, pilot(drawn()).refs.kind], ['m4.pilot', 'community'], 'before: the thread\'s starting figure');
    const kit = fs.readFileSync(new URL('../rules/x1c.json', import.meta.url), 'utf8');
    // a refusal writes nothing: the flank is one of the two forms the coupon prints
    assert.match(cad('measured', 'home/coupon', 'x1c.pilot_m4=3.85', 'x1c.thread_flank=50'), /x1c\.thread_flank is 45 or 60: the flank forms the coupon prints \(got 50\)/);
    assert.ok(!fs.existsSync(path.join(ws, 'rules/x1c.json')) || !JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules.pilot_m4, 'nothing written');
    const out = cad('measured', 'home/coupon', 'x1c.pilot_m4=3.85', 'x1c.nut_fit=0.05', 'x1c.thread_gap=0.25', 'x1c.thread_flank=60');
    assert.match(out, /x1c\.pilot_m4: measured 3\.85 mm, predicted 3\.75 \(m4\.pilot, community\), ratio 1\.0267/);
    assert.match(out, /x1c\.nut_fit: measured 0\.05 mm, predicted 0 \(snug, no clearance\)/);
    assert.match(out, /x1c\.thread_gap: measured 0\.25 mm, predicted 0\.2 \(estimate\), ratio 1\.25/);
    assert.match(out, /x1c\.thread_flank: measured 60 °, predicted 45 \(flanks: printed, the default\)/);
    // in the workspace's copy of the printer's rule set, each with its rule, source and date
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules, today = new Date().toISOString().slice(0, 10);
    for (const k of ['pilot_m4', 'nut_fit', 'thread_gap', 'thread_flank']) {
      assert.equal(rules[k].kind, 'measured', k); assert.equal(rules[k].checked, today, k); assert.match(rules[k].source, /fixings coupon|bench/, k); assert.ok(rules[k].rule.length > 40, k);
    }
    assert.deepEqual([rules.pilot_m4.value, rules.pilot_m4.unit, rules.nut_fit.value, rules.thread_gap.value, rules.thread_flank.value, rules.thread_flank.unit], [3.85, 'mm', 0.05, 0.25, 60, '°']);
    assert.match(rules.pilot_m4.rule, /M4 screw to form its own thread in PLA/); assert.match(rules.thread_flank.rule, /designs still draw flanks: 'printed'/);
    assert.equal(fs.readFileSync(new URL('../rules/x1c.json', import.meta.url), 'utf8'), kit, 'the kit\'s own rule set is untouched');
    // fixings.hole('M4', { kind: 'pilot' }) now rests on the measured rule, and the nut pocket takes the measured fit
    const after = drawn();
    assert.deepEqual([pilot(after).values.diameter, pilot(after).refs.rule, pilot(after).refs.kind], [3.85, 'x1c.pilot_m4', 'measured']);
    assert.match(pilot(after).text, /an M4 pilot drawn 3\.85 mm: it rests on x1c\.pilot_m4 \(3\.85 mm\), a measured rule, as drawn/);
    assert.ok(!after.some((x) => x.code === 'hole.material'), 'the measured pilot names the project\'s plastic');
    assert.equal(pocket(after).values.flats, 5.65, 'm3.nut_flats 5.5, x1c.hole_comp 0.1 and x1c.nut_fit 0.05');
    // the ledger: predicted against measured
    const history = cad('history', 'home/coupon');
    assert.match(history, /predicted against measured:/); assert.match(history, /x1c\.pilot_m4: measured 3\.85 mm, predicted 3\.75/);
    // a rule the coupon does not measure, and no rule given, is still refused by name
    assert.match(cad('measured', 'home/coupon', 'x1c.pilot_m7=3'), /x1c has no rule "pilot_m7"/);
  } finally { done(); }
});

test('cad measured from the joint rig: a drop read on the dial becomes the join\'s spring, measured, in the rule it came from, and the prediction moves to match; a slot nut\'s hold along its slot lands in its set', async () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/home', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: [] }));
    // the rig as MEASURE.md builds it: a base beam, three beams held out from it by one join each, 2 kg on each one's end
    const beam = (id, x, ops) => ({ id, beam: { profile: '2020-misumi-hfs5', ...(ops ? { ops: [{ op: 'tap', at: 'b', thread: 'M5', depth: 18.5 }] } : {}) }, from: [x, -10, 10], to: [x, -160, 10] });
    fs.writeFileSync(at('assemblies/rig.json'), JSON.stringify({ title: 'Rig', kind: 'fit',
      items: [{ id: 'b0', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 10], to: [400, 0, 10] }, beam('c1', 80, true), beam('c2', 200, true), beam('c3', 320, true)],
      joins: [{ kind: 'blind', a: 'c1.a', b: 'b0.front@80' }, { kind: 'bracket', a: 'c2.a', b: 'b0.front@200', fitting: 'printed', nut: 'slide-in' }, { kind: 'anchor', a: 'c3.a', b: 'b0.front@320', fitting: 'fitting-misumi-hmj5' }],
      loads: ['c1', 'c2', 'c3'].map((c) => ({ mass: 2, at: `${c}.b` })) }));
    const check = () => JSON.parse(cad('check', 'home/rig', '--json')).findings;
    const drop = (f, id) => f.find((x) => x.code === 'join.drop' && x.refs.beam === id), spring = (f, a) => f.find((x) => x.code === 'join.stiffness' && x.refs.a === a);
    const before = check(), F = 2 * 9.80665, L = 150, EI = 69972 * 7420;
    // the drop: the beam's own bending and the join turning, each said, with where the measured spring goes
    const d1 = drop(before, 'c1');
    assert.deepEqual([d1.values.arm, d1.values.beam, d1.values.join, d1.predict.name, d1.refs.rule], [L, +(F * L ** 3 / (3 * EI)).toFixed(3), +(F * L * L / 1.5e6).toFixed(3), 'c1.drop', 'joins.blind_bending']);
    assert.match(d1.text, /2 kg at c1\.b, 150 mm out from b0's face, drops it 0\.337 mm: 0\.042 mm the beam's own bending .* and 0\.294 mm the join turning on its 1\.500 N·m\/mrad spring \(an estimate, until the joint rig \(issue 264\) measures it\)\. .*cad measured home\/rig c1\.drop=<mm>/);
    assert.deepEqual([drop(before, 'c2').refs.rule, drop(before, 'c3').refs.rule], ['joins.bracket_printed_share', 'fitting-misumi-hmj5.bending_stiffness']);
    const fe = spring(before, 'c2.a').refs.rests[0].value, beamDrop = drop(before, 'c1').predict.rig.beam;
    // a drop no more than the beam bends by itself is refused, and nothing is written
    assert.match(cad('measured', 'home/rig', 'c1.drop=0.03'), /c1\.drop: 0\.03 mm is no more than the 0\.042 mm the beam bends by itself .*stiffer than solid metal/);
    assert.ok(!fs.existsSync(path.join(ws, 'rules/joins.json')), 'nothing written, not even the joins set\'s first copy');
    // nor when a later value is refused: the good drop before it is not written either, nor any set copied for it
    assert.match(cad('measured', 'home/rig', 'c1.drop=0.5', 'c3.drop=0.03'), /c3\.drop: 0\.03 mm is no more than/);
    for (const n of ['joins', 'fitting-misumi-hmj5']) assert.ok(!fs.existsSync(path.join(ws, `rules/${n}.json`)), `${n}: nothing written on a refusal`);
    const out = cad('measured', 'home/rig', 'c1.drop=0.5', 'c2.drop=3', 'c3.drop=0.4', 'slot-nut-6-misumi-m5-slide-in.hold_along=420');
    assert.match(out, /c1\.drop: measured 0\.5 mm, predicted 0\.337/);
    assert.match(out, /slot-nut-6-misumi-m5-slide-in\.hold_along: measured 420 N/);
    const today = new Date().toISOString().slice(0, 10), own = (n) => JSON.parse(fs.readFileSync(path.join(ws, `rules/${n}.json`), 'utf8')).rules;
    // each spring in its rule, measured, with the drop it came from: the kind's (a 20 mm profile), a printed fitting's
    // share of its own finite-element figure, and a bought fitting's own
    const k1 = (F * L * L) / (0.5 - beamDrop), joins = own('joins'), anchor = own('fitting-misumi-hmj5'), nut = own('slot-nut-6-misumi-m5-slide-in');
    assert.equal(joins.blind_bending.value, Number(k1.toPrecision(4)));
    assert.equal(joins.bracket_printed_share.value, Number(((F * L * L) / (3 - beamDrop) / fe).toPrecision(4)));
    assert.equal(anchor.bending_stiffness.value, Number(((F * L * L) / (0.4 - beamDrop)).toPrecision(4)));
    for (const r of [joins.blind_bending, joins.bracket_printed_share, anchor.bending_stiffness, nut.hold_along]) { assert.equal(r.kind, 'measured'); assert.equal(r.checked, today); assert.match(r.source, /joint rig/); }
    assert.match(joins.blind_bending.source, /0\.5 mm drop of c1 under 19\.613 N at 150 mm .*less the beam's own 0\.042 mm/);
    assert.deepEqual([joins.blind_twist.kind, joins.end_tap_bending.kind, nut.hold_along.unit], ['estimate', 'estimate', 'N'], 'only what was measured');
    assert.match(nut.hold_along.rule, /slips/);
    // each spring's sentence is what was measured, not the estimate's "until the joint rig measures it"
    for (const r of [joins.blind_bending, joins.bracket_printed_share, anchor.bending_stiffness]) { assert.match(r.rule, /measured on the joint rig .*: a beam held out by the join, the drop of its end under a hung mass less the beam's own bending/); assert.doesNotMatch(r.rule, /guess|until the joint rig|estimate/); }
    assert.match(joins.blind_bending.rule, /^How stiffly a blind join holds the end of a beam against turning across its axis, for a 20 mm series profile: measured/);
    assert.match(joins.bracket_printed_share.rule, /^A bracket join with a printed fitting, as a share of the fitting's own bending stiffness by finite elements: the join's spring measured/);
    assert.match(anchor.bending_stiffness.rule, /^How stiffly this fitting holds the end of a beam against turning across its axis, its screws tight: measured/);
    assert.match(joins.blind_twist.source, /A working guess/, 'what was not measured stays the estimate it was');
    // the kit's own rule sets are untouched, and it has no joins set of its own
    assert.ok(!fs.existsSync(new URL('../rules/joins.json', import.meta.url)));
    assert.equal(JSON.parse(fs.readFileSync(new URL('../rules/fitting-misumi-hmj5.json', import.meta.url), 'utf8')).rules.bending_stiffness.kind, 'estimate');
    // checked again: each spring says it was measured and when, and each drop predicted is now the one measured
    const after = check();
    for (const [id, d] of [['c1', 0.5], ['c2', 3], ['c3', 0.4]]) assert.ok(Math.abs(drop(after, id).predict.value - d) < 0.002, `${id}: ${drop(after, id).predict.value} against ${d}`);
    assert.match(spring(after, 'c1.a').text, new RegExp(`bending measured on the joint rig on ${today}; twist an estimate until the rig measures it`));
    assert.match(spring(after, 'c2.a').text, new RegExp(`times the [\\d.]+ a printed bracket join keeps of it, measured on the joint rig on ${today}`));
    assert.match(spring(after, 'c3.a').text, new RegExp(`\\(measured: .*\\): bending measured on the joint rig on ${today}`));
    assert.match(drop(after, 'c1').text, /bending measured on the joint rig on/);
    // the HMJ5's own finding read from the workspace's set: its bending measured, and when; its twist still the estimate
    const { boughtFittingModel } = await import('@rulecad/frames');
    const hmj = boughtFittingModel({ name: 'fitting-misumi-hmj5', part: 'fitting', rules: anchor }).findings.find((x) => x.code === 'fitting.stiffness');
    assert.match(hmj.text, new RegExp(`in bending and 500000 in twist: bending measured on the joint rig on ${today} \\(.*0\\.4 mm drop of c3.*\\); twist an estimate: `), hmj.text);
    // the slot nut, read from the workspace's set, says its hold along the slot and that it was measured
    const { framesContext } = await import(pathToFileURL(path.join(path.dirname(BIN), '../lib/frames.mjs')).href);
    const { slotNutModel } = await import('@rulecad/frames');
    const m = slotNutModel('slot-nut-6-misumi-m5-slide-in', {}, { sets: framesContext(path.join(ws, 'rules')).sets });
    assert.deepEqual([m.holdAlong.value, m.holdAlong.kind], [420, 'measured']);
    assert.match(m.findings.find((x) => x.code === 'slot_nut.hold_along').text, new RegExp(`slips along the slot at 420 N: measured on ${today}`));
    assert.doesNotMatch(m.findings.find((x) => x.code === 'slot_nut.hold_along').text, /estimate/, 'a measured hold is not called an estimate');
    assert.match(cad('history', 'home/rig'), /c1\.drop: measured 0\.5 mm, predicted 0\.337/);
  } finally { done(); }
});

test('wires: longest through the poses, a gauge against what it carries, the sheet; a bad route refused by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: [100, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 100, unit: 'mm', rule: 'Long' }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
    const a = { title: 'Arm', kind: 'fit', items: [{ id: 'base', object: 'link' }, { id: 'arm', object: 'link' }, { id: 'stepper', motor: { model: 'nema17' }, at: [0, 60, 40] }],
      joints: [{ id: 'j', type: 'revolute', parent: 'base.tip', child: 'arm.base', min: -90, max: 90 }], fits: [{ a: 'arm', b: 'base', min: -1000, silent: true }],
      wires: [{ id: 'm1', from: 'stepper.connector', to: 'arm.tip', gauge: 'awg22' }, { id: 'thin', from: 'stepper.connector', to: 'arm.tip', gauge: 'awg28' }] };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    const check = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/arm', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings.filter((x) => x.code.startsWith('wire.'));
    const len = check.find((x) => x.code === 'wire.length' && x.refs.wire === 'm1');
    assert.equal(len.values.length, Math.ceil(len.values.longest + 40), 'its longest, and the loop');
    assert.ok(len.values.longest > len.values.shortest + 50, 'it changes as the arm swings');
    assert.equal(check.find((x) => x.code === 'wire.gauge' && x.refs.wire === 'm1').level, 'pass');
    const thin = check.find((x) => x.code === 'wire.gauge' && x.refs.wire === 'thin');
    assert.equal(thin.level, 'fail'); assert.match(thin.text, /awg28 carries 0\.81 A at most, and this carries 2 A/);
    a.wires = [{ from: 'arm.nothing', to: 'base.tip' }]; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    assert.match(cad('check', 'home/arm'), /wire w1: no anchor "arm\.nothing" .*arm has base, tip/);
    a.wires = [{ from: 'arm.tip', to: 'base.tip', gauge: 'thick' }]; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    assert.match(cad('check', 'home/arm'), /wire 1: gauge is awg and a number/);
  } finally { done(); }
});

test('a bought bearing: placed from its set, turning a shaft, its printed seat read as drawn; an unknown part refused by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['housing'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/housing.json'), JSON.stringify({ name: 'housing', title: 'Housing', version: '0.1.0', uses: ['x1c'], engine: 'manifold', anchors: { seat: { at: [0, 0, 'tall - depth'], axis: [0, 0, 1] } }, variables: { tall: { value: 12, unit: 'mm', rule: 'Tall' }, depth: { value: 7, unit: 'mm', rule: 'Depth' }, off: { value: 0, unit: 'mm', rule: 'How far the pocket is from its fit', tweak: { min: -1, max: 1 } } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/housing.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nconst bearing = { bore: 8, outer_diameter: 22, width: 7 }\nexport function main (v) {\n  const seat = v.shapes.bearingSeat(bearing, { fit: v.off ? -0.05 + v.off : 'press', printer: v.x1c, at: [0, 0, v.tall], into: '-z', relief: 2, through: true })\n  return v.ops.subtract(cuboid({ size: [34, 34, v.tall], center: [0, 0, v.tall / 2] }), seat)\n}\n");
    const a = { title: 'Seat', kind: 'fit', items: [{ id: 'housing', object: 'housing' }, { id: 'b1', bought: 'bearing-608', at: [0, 0, 5] }], fits: [{ a: 'b1', b: 'housing', seat: 'press', fastens: true }] };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    const check = (o) => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/seat', ...(o ?? []), '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    let f = check();
    assert.deepEqual(f.filter((x) => x.level === 'fail').map((x) => x.text), []);
    const seat = f.filter((x) => x.code === 'fit.seat');
    assert.equal(seat[0].level, 'pass'); assert.match(seat[0].text, /bearing-608 \(22 mm\) in a pocket drawn 22\.0\d+ mm, a press fit/);
    assert.equal(seat[1].level, 'pass'); assert.match(seat[1].text, /lip stops the outer race/);
    assert.equal(f.find((x) => x.code === 'bought.item').refs.set, 'bearing-608');
    a.items[0].set = { off: -0.3 }; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    f = check().filter((x) => x.code === 'fit.seat');
    assert.equal(f[0].level, 'fail'); assert.match(f[0].text, /0\.3\d? mm too small: it will not press in/);
    assert.match(cad('list', 'home/seat'), /1 ×\s+bearing-608\s+a bearing/);
    a.items[1].bought = 'bearing-999'; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    assert.match(cad('check', 'home/seat'), /no bought part "bearing-999" \(.*bearing-608/);
  } finally { done(); }
});

test('a task: reach and speed over a sheet, the error budget moved by a measurement, a machine, a drawing planned and refused', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true }); fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'rules/armrig.json'), JSON.stringify({ name: 'armrig', rules: { play: { value: 0.05, unit: '°', rule: 'Shoulder play', kind: 'estimate', source: 'a guess', checked: '2026-11-09' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: ['long', 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
    const task = { tool: 'fore.tip', sheet: { size: 'a5', at: [180, 0, 30] }, speed: 50, accuracy: 0.6 };
    const asm = () => ({ title: 'Arm', kind: 'fit', uses: ['armrig'], items: [{ id: 'upper', object: 'link', set: { long: 150 } }, { id: 'fore', object: 'link', set: { long: 150 } }, { id: 'link0', object: 'link', at: [0, 0, 20] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 300, driver: 'd1', microsteps: 16 }, at: [0, 0, -50] }, { id: 'd1', bought: 'drv8825', at: [0, 80, 0] }, { id: 'psu', bought: 'supply-12v', variant: 'LRS-50-12', set: { output_current: 1 }, at: [200, 200, 0] }],
      joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 30] }, child: 'upper.base', min: -130, max: 130 }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150, errors: { play: 'armrig.play' } }],
      fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }], task });
    const write = (a) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    const check = () => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/arm', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    const by = (list, code) => list.find((x) => x.code === code);
    write(asm());
    let f = check();
    assert.equal(by(f, 'task.reach').level, 'pass', by(f, 'task.reach').text);
    assert.match(by(f, 'task.speed').text, /nothing says how fast shoulder/, 'one joint has no motor');
    assert.ok(by(f, 'task.reach').values.samples.length > 50, 'the samples, for other programs');
    assert.ok(fs.existsSync(path.join(ws, '.preview/home/arm-reach.svg')) && fs.existsSync(path.join(ws, '.preview/home/arm-error.svg')));
    const before = by(f, 'task.accuracy').values.worst;
    assert.match(by(f, 'task.accuracy').text, /Rests on estimates \(elbow's play/);
    assert.match(by(f, 'power.supply').text, /draws 1\.25 A at 12 V .* and the supply gives 1 A/); assert.equal(by(f, 'power.supply').level, 'fail');
    assert.ok(f.some((x) => x.code === 'motor.driver' && x.level === 'warn' && /heat sink/.test(x.text)), 'over the bare rating'); assert.ok(f.some((x) => x.code === 'motor.driver' && /set the trimmer to 1 V for 2 A per coil/.test(x.text)));
    // A measurement moves the budget, and the ledger says so
    const m = cad('measured', 'home/arm', 'armrig.play=0.02', '--source', 'bench test 14');
    assert.match(m, /armrig\.play: measured 0\.02 °?, ?predicted 0\.05|armrig\.play: measured 0\.02/); assert.match(m, /fore\.tip error at its worst point: [\d.]+ mm to [\d.]+ mm/);
    assert.ok(by(check(), 'task.accuracy').values.worst < before, 'less play, less error at the pen');
    // A sheet moved further than the arm goes fails at a named corner, by how much
    write({ ...asm(), task: { ...task, sheet: { size: 'a5', at: [290, 0, 30] } } });
    f = check(); assert.equal(by(f, 'task.reach').level, 'fail'); assert.match(by(f, 'task.reach').text, /the (upper|lower) right corner of the sheet can't be reached: fore\.tip misses it by [\d.]+ mm/);
    assert.ok(by(f, 'task.reach').at, 'it says where');
    // a machine needs steppers on every joint of the chain, and says which is missing
    write(asm()); assert.match(cad('machine', 'home/arm'), /joint shoulder has no stepper driving it/);
    const two = asm(); two.items.push({ id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 300, microsteps: 16 }, at: [0, 0, 0] }); two.fits.push({ a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true });
    two.items[3].motor.driver = undefined; write(two);
    const machine = JSON.parse(cad('machine', 'home/arm', '--json'));
    assert.equal(machine.kinematics, 'scara'); assert.equal(machine.axes.length, 2);
    assert.ok(Math.abs(machine.axes[0].stepsPerUnit - (200 * 16) / 360) < 1e-5); assert.equal(machine.task.speed, 50);
    assert.match(machine.axes[0]._why.microsteps, /resolution only/);
    // a drawing, planned and replayed; one bigger than the sheet refused at the stroke that leaves it
    fs.writeFileSync(path.join(ws, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210"><rect id="sq" x="24" y="55" width="100" height="100" fill="none"/><circle id="c" cx="74" cy="105" r="20" fill="none"/></svg>');
    const plotted = spawnSync(process.execPath, [BIN, 'plot', 'home/arm', 'square.svg', '--json'], { cwd: ws, encoding: 'utf8' }), p = JSON.parse(plotted.stdout);
    assert.equal(p.ok, true, plotted.stdout.slice(0, 400)); assert.equal(plotted.status, 0);
    const steps = JSON.parse(fs.readFileSync(p.file, 'utf8'));
    assert.equal(steps.format, 'rulecad.steps/1'); assert.ok(steps.drawn.length >= 2 && steps.drawn[0].error, 'lines carry their predicted error');
    assert.match(fs.readFileSync(path.join(ws, '.preview/home/arm-square-plot.svg'), 'utf8'), /<animate attributeName="points"/);
    const { replay, chainFromMotion } = await import('@rulecad/robots');
    const send = await import(pathToFileURL(fileURLToPath(new URL('../../examples/bench/projects/arm/send.mjs', import.meta.url))).href), lines = send.linesOf(steps), dry = send.dryRun(['e', ...lines, 'd']);
    assert.ok(dry.m > 50 && dry.p > 1, 'the sender takes it'); assert.throws(() => send.linesOf({ format: 'x' }), /not a step file/);
    fs.writeFileSync(path.join(ws, 'big.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="400mm" viewBox="0 0 400 400"><rect id="huge" x="10" y="10" width="380" height="380" fill="none"/></svg>');
    const big = spawnSync(process.execPath, [BIN, 'plot', 'home/arm', 'big.svg'], { cwd: ws, encoding: 'utf8' });
    assert.equal(big.status, 1); assert.match(big.stdout, /stroke huge leaves the 148 × 210 mm sheet/);
  } finally { done(); }
});

test('loads on an upright arm: a tipping moment on its bearing, or printed clips by FE; the links bending; acceleration', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link', 'clip'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 0, 0], axis: [0, 1, 0] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, wide: { value: 12, unit: 'mm', rule: 'Wide', tweak: { min: 2, max: 30 } }, thick: { value: 8, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long + 20, v.wide, v.thick], center: [v.long / 2, 0, 0] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/objects/clip.json'), JSON.stringify({ name: 'clip', title: 'Clip', version: '0.1.0', engine: 'manifold', variables: { side: { value: 2, unit: 'mm', rule: 'Side' }, tall: { value: 8, unit: 'mm', rule: 'Tall' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/clip.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.tall], center: [0, 0, v.tall / 2] }) }\n");
    const asm = (support, payload = 0.1, wide = 12) => ({ title: 'Arm', kind: 'fit', gravity: [0, 0.7, -1], items: [{ id: 'base', object: 'clip', at: [0, 0, -200] }, { id: 'upper', object: 'link', set: { wide } }, { id: 'fore', object: 'link', set: { wide } }, { id: 'b1', bought: 'bearing-6800', at: [0, 30, 0], rotate: [90, 0, 0] }, { id: 'c1', object: 'clip', at: [20, 0, -100] }, { id: 'c2', object: 'clip', at: [-20, 0, -100] }, { id: 'c3', object: 'clip', at: [0, 20, -100] }, { id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 200 }, at: [0, 60, 0], rotate: [90, 0, 0] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 200 }, at: [150, 60, 0], rotate: [90, 0, 0] }],
      joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'upper.base', min: -130, max: 130, support }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150 }], fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }, { a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true }, { a: 'b1', b: 'upper', min: -1000, silent: true }, { a: 'm0', b: 'b1', min: -1000, silent: true }],
      task: { tool: 'fore.tip', sheet: { size: [60, 60], at: [200, 0, 80], normal: [0, 1, 0] }, speed: 20, payload } });
    const write = (a) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    const check = () => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/arm', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    const by = (list, code, n = 0) => list.filter((x) => x.code === code)[n];
    write(asm({ bearings: ['b1'] }));
    let f = check();
    assert.equal(by(f, 'task.reach').level, 'pass', by(f, 'task.reach').text);
    const m = by(f, 'joint.moment'); assert.match(m.text, /shoulder: \d+ g carried: .* N m tipping/); assert.match(m.text, /b1 take [\d.]+ N equivalent against \d+ N static/); assert.ok(m.values.margin > 1 && m.values.tipping > 0);
    const heavy = by(f, 'joint.moment', 0).values.tipping;
    assert.ok(by(f, 'link.deflection').values.total > 0.01, JSON.stringify(by(f, 'link.deflection')));
    assert.equal(by(f, 'link.deflection').predict.name, 'link.deflection');
    assert.match(by(f, 'assembly.frequency').text, /lowest mode is about \d+ Hz/);
    assert.ok(by(f, 'motor.accel').values.alpha > 0); assert.match(by(f, 'task.time').text, /a move across the task/);
    const stiffer = (write(asm({ bearings: ['b1'] }, 0.1, 24)), check());
    assert.ok(by(stiffer, 'link.deflection').values.total < by(f, 'link.deflection').values.total, 'a wider arm bends less');
    write(asm({ bearings: ['b1'] }, 0.14)); assert.ok(by(check(), 'motor.accel').values.alpha < by(f, 'motor.accel').values.alpha, 'more payload, less acceleration');
    write(asm({ bearings: ['b1'] }, 2)); const stall = by(check(), 'motor.accel'); assert.equal(stall.level, 'fail'); assert.match(stall.text, /shoulder stalls/);
    write(asm({ clips: ['c1', 'c2', 'c3'], pitch: 40, cell: 0.5 }, 0.5));
    const clip = by(check(), 'joint.moment'); assert.match(clip.text, /3 printed clips, the worst \(c\d\) at [\d.]+ MPa/); assert.ok(clip.values.stress > 0);
    assert.equal(clip.level, 'fail', clip.text);
    write(asm(undefined)); assert.equal(by(check(), 'joint.moment').level, 'warn');
  } finally { done(); }
});

test('a gait in an assembly: a crawl checked through its cycle, motors against its torque, and legs that collide found', async () => {
  const { ws, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link', 'body'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 0, 0], axis: [0, 1, 0] } }, variables: { long: { value: 90, unit: 'mm', rule: 'Long' }, side: { value: 6, unit: 'mm', rule: 'Side' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.side, v.side], center: [v.long / 2, 0, 0] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/objects/body.json'), JSON.stringify({ name: 'body', title: 'Body', version: '0.1.0', engine: 'manifold', variables: { long: { value: 140, unit: 'mm', rule: 'Long' }, wide: { value: 80, unit: 'mm', rule: 'Wide' }, thick: { value: 10, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/body.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.wide, v.thick] }) }\n");
    const legs = [['fl', 100, 60], ['fr', 100, -60], ['bl', -100, 60], ['br', -100, -60]], items = [{ id: 'body', object: 'body' }], joints = [], fits = [];
    for (const [n, x, y] of legs) {
      items.push({ id: `${n}u`, object: 'link' }, { id: n, object: 'link' }, { id: `${n}m`, motor: { model: 'nema17', drives: `${n}h`, speed: 100 }, at: [x, y + 60 * Math.sign(y), 40], rotate: [Math.sign(y) * 90, 0, 0] });
      joints.push({ id: `${n}h`, type: 'revolute', parent: { at: [x, y, 0], axis: [0, 1, 0] }, child: `${n}u.base`, min: 0, max: 180, value: 90 }, { id: `${n}k`, type: 'revolute', parent: `${n}u.tip`, child: `${n}.base`, min: -150, max: 0, value: -30 });
      fits.push({ a: `${n}u`, b: n, min: -1000, silent: true }, { a: `${n}m`, b: `${n}u`, min: -1000, silent: true });
    }
    const a = { title: 'Quad', kind: 'fit', items, joints, fits, gait: { legs: legs.map(([n]) => `${n}.tip`), pattern: 'crawl', stride: 30, lift: 12, period: 4, height: 150, mass: 1.5 } };
    const write = (x) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/quad.json'), JSON.stringify(x));
    const check = () => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/quad', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    write(a);
    let f = check();
    assert.match(f.find((x) => x.code === 'gait.stable').text, /gait: statically stable: the least margin is/);
    assert.equal(f.find((x) => x.code === 'gait.clearance').level, 'pass');
    assert.equal(f.find((x) => x.code === 'gait.sweep').level, 'pass', f.find((x) => x.code === 'gait.sweep').text);
    assert.ok(f.filter((x) => x.code === 'motor.torque' && /gait: flh needs/.test(x.text)).length === 1);
    assert.ok(f.some((x) => x.code === 'gait.torque' && x.level === 'warn' && /nothing drives flk/.test(x.text)));
    write({ ...a, gait: { ...a.gait, stride: 500 } });
    f = check(); assert.equal(f.find((x) => x.code === 'gait.reach').level, 'fail'); assert.match(f.find((x) => x.code === 'gait.reach').text, /can't reach its foot/);
    write({ ...a, gait: { ...a.gait, legs: ['fl.nowhere'] } });
    const bad = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/quad', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.match(bad.error.message, /gait: no anchor "fl\.nowhere"/);
  } finally { done(); }
});

test('a motor driving a slide: through a lead screw that holds, or a belt that does not, with steps per mm and the belt in the budget', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.json'), JSON.stringify({ name: 'block', title: 'Block', version: '0.1.0', engine: 'manifold', anchors: { tip: { at: [20, 0, 0], axis: [0, 0, 1] }, base: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { side: { value: 10, unit: 'mm', rule: 'Side' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.side], center: [0, 0, v.side / 2] }) }\n");
    const asm = (motor) => ({ title: 'Z', kind: 'fit', items: [{ id: 'carriage', object: 'block' }, { id: 'm', motor: { model: 'nema17', drives: 'z', speed: 200, ...motor }, at: [0, 0, -60] }],
      joints: [{ id: 'z', type: 'prismatic', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'carriage.base', min: 0, max: 50 }], fits: [{ a: 'm', b: 'carriage', min: -1000, silent: true }],
      loads: [{ joint: 'z', force: 10 }], task: { tool: 'carriage.tip', volume: { x: [20, 20], y: [0, 0], z: [0, 40] }, speed: 20 } });
    const write = (a) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/z.json'), JSON.stringify(a));
    const check = () => JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/z', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings;
    write(asm({ leadscrew: { lead: 2 } }));
    let f = check();
    const holds = f.filter((x) => x.code === 'motor.holds');
    assert.ok(holds.some((x) => x.level === 'pass' && /holds with the power off: the lead screw \(its [\d.]+° lead/.test(x.text)), holds.map((x) => x.text).join(' / '));
    const machine = JSON.parse(cad('machine', 'home/z', '--json')); assert.equal(machine.axes[0].unit, 'mm'); assert.equal(machine.axes[0].stepsPerUnit, (200 * 16) / 2);
    write(asm({ belt: { teeth: 20, stiffness: 20, width: 6, length: 400, load: 5 } }));
    f = check();
    assert.ok(f.some((x) => x.code === 'motor.holds' && /drops with the power off/.test(x.text)), f.filter((x) => x.code === 'motor.holds').map((x) => x.text).join(' / '));
    assert.equal(JSON.parse(cad('machine', 'home/z', '--json')).axes[0].stepsPerUnit, (200 * 16) / 40, 'mm per turn: teeth × pitch');
  } finally { done(); }
});

test('building it: the order worked out and refused when nothing reaches a part; plates by filament, re-packed only where a part changed', async () => {
  const { ws, cad, done } = workspace();
  try {
    const dirs = ['projects/home/objects', 'projects/home/assemblies', 'rules'];
    for (const d of dirs) fs.mkdirSync(path.join(ws, d), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block', 'badge', 'cup', 'lid'], filaments: { base: { slot: 1 }, legend: { slot: 2 } } }));
    const object = (name, js, json) => { fs.writeFileSync(path.join(ws, `projects/home/objects/${name}.json`), JSON.stringify({ name, title: name, version: '0.1.0', engine: 'manifold', ...json })); fs.writeFileSync(path.join(ws, `projects/home/objects/${name}.js`), `import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nconst { subtract, union } = jscad.booleans\n${js}\n`); };
    const v = (val, rule = 'A size') => ({ value: val, unit: 'mm', rule, tweak: { min: 1, max: 500 } });
    object('block', 'export function main (v) { return cuboid({ size: [v.long, 20, v.tall], center: [v.long / 2, 0, v.tall / 2] }) }', { anchors: { base: { at: [0, 0, 'tall'], axis: [0, 0, 1] }, tip: { at: ['long', 0, 'tall'], axis: [0, 0, 1] }, head: { at: ['long / 2', 0, 'tall'], axis: [0, 0, 1] } }, variables: { long: v(60), tall: v(10) } });
    object('badge', 'export function main (v) { return { body: cuboid({ size: [v.long, 20, 4], center: [v.long / 2, 0, 2] }), legend: cuboid({ size: [10, 8, 1], center: [v.long / 2, 0, 4.5] }) } }', { parts: { body: { label: 'Body' }, legend: { label: 'Legend', filament: 'legend' } }, variables: { long: v(30) } });
    object('cup', 'export function main (v) { return subtract(cuboid({ size: [40, 40, 20], center: [0, 0, 10] }), cuboid({ size: [30, 30, 40], center: [0, 0, 22] })) }', { variables: { deep: v(1) } });
    object('lid', 'export function main (v) { return cuboid({ size: [40, 40, 3], center: [0, 0, 1.5] }) }', { variables: { deep: v(1) } });
    // A cup, a nut in it, and a lid that stops the nut coming out: the lid is written first, and must go on last
    const pile = { title: 'Pile', kind: 'fit', uses: [], items: [{ id: 'cup', object: 'cup' }, { id: 'lid', object: 'lid', at: [0, 0, 22] }, { id: 'nut', object: 'block', set: { long: 12, tall: 6 }, at: [-6, 0, 10.5] }],
      fits: [{ a: 'lid', b: 'cup', fastens: true, min: 0, note: 'The lid, on two screws', fastener: 'M3x10', count: 2 }, { a: 'nut', b: 'cup', fastens: true, min: 0, note: 'The nut, dropped in its pocket' }] };
    const write = (name, a) => fs.writeFileSync(path.join(ws, `projects/home/assemblies/${name}.json`), JSON.stringify(a));
    write('pile', pile);
    const order = JSON.parse(cad('order', 'home/pile', '--json'));
    const pictures = cad('order', 'home/pile', '--preview');
    if (!/no Chrome|Chrome took|Chrome made/.test(pictures)) { assert.match(pictures, /pile-step-03\.png/, pictures); assert.ok(fs.existsSync(path.join(ws, '.preview/home/pile-step-01.png')), 'each step an exploded picture'); }
    assert.deepEqual(order.steps.map((x) => x.items[0]), ['cup', 'nut', 'lid'], JSON.stringify(order.steps));
    assert.match(order.steps[2].text, /The lid, on two screws \(2 × M3x10\)/, 'its fasteners named from the fit');
    assert.deepEqual(order.steps[2].dir, [0, 0, 1], 'and it comes down from above');
    const check = () => JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/pile', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings;
    assert.equal(check().find((x) => x.code === 'assembly.order').level, 'pass', 'found by cad check');
    // A wall over the screw, fastened on before the screw can go in: no order reaches it. The screw's anchor points up.
    write('walled', { title: 'Walled', kind: 'fit', uses: [], items: [{ id: 'base', object: 'block', set: { long: 60, tall: 10 } }, { id: 'clip', object: 'block', set: { long: 20, tall: 10 }, at: [10, 0, 10] }, { id: 'stud', object: 'block', set: { long: 20, tall: 10 }, at: [10, 0, 20] }, { id: 'wall', object: 'block', set: { long: 60, tall: 10 }, at: [0, 0, 30] }],
      fits: [{ a: 'wall', b: 'base', fastens: true, min: 0, note: 'The wall' }, { a: 'stud', b: 'wall', fastens: true, min: 0, note: 'The stud' }, { a: 'clip', b: 'stud', fastens: true, min: 0, note: 'The clip, to the stud', access: 'clip.head' }] });
    const stuck = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/walled', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings.find((x) => x.code === 'assembly.order');
    assert.equal(stuck.level, 'fail'); assert.match(stuck.text, /screw of "The clip, to the stud" can't be reached in any order: wall stands over it/); assert.equal(stuck.refs.wall, 'wall');
    // A part in a sealed box: nothing can reach it, and the finding names it
    object('shell', 'export function main (v) { return subtract(cuboid({ size: [40, 40, 40], center: [0, 0, 20] }), cuboid({ size: [30, 30, 30], center: [0, 0, 20] })) }', { variables: { deep: v(1) } });
    write('sealed', { title: 'Sealed', kind: 'fit', uses: [], items: [{ id: 'shell', object: 'shell' }, { id: 'loose', object: 'block', set: { long: 10, tall: 5 }, at: [-5, 0, 10] }], fits: [{ a: 'loose', b: 'shell', fastens: true, min: 0 }] });
    const sealed = JSON.parse(cad('order', 'home/sealed', '--json'));
    assert.match(sealed.stuck.text, /shell can't be reached in any order|loose can't be reached in any order/, JSON.stringify(sealed));
    // A bearing pressed in before the shaft goes through it, whichever order they're written in; the shaft is listed first
    write('spindle', { title: 'Spindle', kind: 'fit', uses: [], items: [{ id: 'pin', object: 'block', set: { long: 5, tall: 40 }, at: [-2.5, 0, 45] }, { id: 'brg', bought: 'bearing-608', at: [0, 0, 30] }, { id: 'housing', object: 'block', set: { long: 60, tall: 10 }, at: [-30, 0, 0] }],
      fits: [{ a: 'brg', b: 'housing', seat: 'press' }, { a: 'pin', b: 'brg', engage: 5, min: -1000 }] });
    const spindle = JSON.parse(cad('order', 'home/spindle', '--json')).steps.flatMap((x) => x.items);
    assert.ok(spindle.indexOf('brg') < spindle.indexOf('pin'), `the bearing before its shaft: ${spindle}`);
    assert.ok(spindle.indexOf('housing') < spindle.indexOf('brg'), 'and the bearing into its housing');
    // Plates: one for the base filament, the two-coloured badge on its own, the gap the first layer's rule, on the bed
    write('kit', { title: 'Kit', kind: 'fit', uses: [], items: [{ id: 'a', object: 'block', set: { long: 100 }, at: [0, 0, 0] }, { id: 'b', object: 'block', set: { long: 100 }, at: [0, 50, 0] }, { id: 'c', object: 'block', set: { long: 200 }, at: [0, 100, 0] }, { id: 'e', object: 'badge', at: [0, 150, 0] }, { id: 'motor', motor: { model: 'nema17' }, at: [300, 0, 0] }] });
    const first = JSON.parse(cad('plates', 'home/kit', '--json'));
    assert.deepEqual(first.plates.map((x) => [x.name, x.filament, x.parts.length]), [['kit-base-1', 'base', 3], ['kit-base-legend-1', 'base+legend', 1]], JSON.stringify(first.plates));
    assert.equal(first.gap, 0.84, "the first layer's rule: 0.3 + 2 × 0.15 up to whole lines");
    assert.deepEqual(first.checks.flatMap((x) => x.findings.filter((y) => y.level === 'fail').map((y) => y.text)), [], 'the plates print clean');
    assert.ok(first.plates[0].parts.every((p) => p.x > 0 && p.x + p.w < 256 && p.y > 0 && p.y + p.d < 256), 'all on the bed');
    const sheet = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit-base-1.json'), 'utf8'));
    assert.equal(sheet.kind, 'plate'); assert.ok(sheet.packed.parts.a, 'it remembers what is on it');
    assert.match(cad('export', 'home/kit-base-1'), /kit-base-1\.3mf/, 'exports as a print');
    assert.ok(fs.existsSync(path.join(ws, 'exports/home/kit-base-1.3mf')));
    // A changed part re-packs only its plate: the other file is left exactly as it was
    const stood = fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit-base-legend-1.json'), 'utf8'), asm = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit.json'), 'utf8'));
    asm.items[2].set = { long: 180 }; write('kit', asm);
    const again = JSON.parse(cad('plates', 'home/kit', '--json'));
    assert.deepEqual(again.repacked, ['kit-base-1'], 'only the plate with the changed part'); assert.equal(fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit-base-legend-1.json'), 'utf8'), stood);
    assert.equal(again.plates.find((x) => x.name === 'kit-base-1').parts.find((p) => p.id === 'c').w, 180, 'with its new size');
    assert.equal(again.plates.find((x) => x.name === 'kit-base-legend-1').stood, true);
    // Too big for the bed, by name
    asm.items[2].set = { long: 400 }; write('kit', asm);
    const big = spawnSync(process.execPath, [BIN, 'plates', 'home/kit', '--json'], { cwd: ws, encoding: 'utf8' });
    assert.equal(big.status, 1); assert.match(big.stdout, /c \(block\) is 400 × 20 mm: bigger than the 256 mm bed/);
    assert.equal(JSON.parse(big.stdout).findings[0].code, 'plate.bed');
  } finally { done(); }
});

test('a machine\'s link: the task, the step file, the wires and the build page travel with the model, small and data only; the ledger in the rules', async () => {
  const { ws, cad, done } = workspace();
  try {
    for (const d of ['projects/home/objects', 'projects/home/assemblies', 'rules']) fs.mkdirSync(path.join(ws, d), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'rules/armrig.json'), JSON.stringify({ name: 'armrig', rules: { play: { value: 0.05, unit: '°', rule: 'Shoulder play', kind: 'estimate', source: 'a guess', checked: '2026-11-09' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: ['long', 0, 0], axis: [0, 0, 1] }, connector: { at: [10, 0, 'thick'], axis: [0, 0, 1] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
    const task = { tool: 'fore.tip', sheet: { size: 'a5', at: [180, 0, 30] }, speed: 50, accuracy: 0.6 };
    const asm = { title: 'Arm', kind: 'fit', uses: ['armrig'], items: [{ id: 'upper', object: 'link', set: { long: 150 } }, { id: 'fore', object: 'link', set: { long: 150 } }, { id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 300, microsteps: 16 }, at: [0, 0, -50] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 300, microsteps: 16 }, at: [150, 0, -50] }],
      joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 30] }, child: 'upper.base', min: -130, max: 130 }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150, errors: { play: 'armrig.play' } }],
      fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }, { a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true }], loads: [{ joint: 'elbow', torque: 0.05 }],
      wires: [{ id: 'elbow-motor', from: 'upper.connector', to: 'fore.connector', gauge: 'awg22' }], task };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(asm));
    assert.match(cad('wires', 'home/arm'), /elbow-motor/);
    const sheetFile = path.join(ws, 'exports/home/arm.wiring.md');
    assert.match(fs.readFileSync(sheetFile, 'utf8'), /\| elbow-motor \| upper\.connector \| fore\.connector \|/, 'the wiring sheet in the exports');
    fs.writeFileSync(path.join(ws, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210"><rect id="sq" x="24" y="55" width="100" height="100" fill="none"/></svg>');
    assert.equal(spawnSync(process.execPath, [BIN, 'plot', 'home/arm', 'square.svg'], { cwd: ws, encoding: 'utf8' }).status, 0);
    cad('measured', 'home/arm', 'task.accuracy=0.4', '--source', 'bench');
    const out = cad('link', 'home/arm', '--long');
    assert.match(out, /carries the drawing arm-square/);
    const url = out.match(/view\s+(\S+)/)[1], token = url.split('#m=')[1], { decode } = await import('@rulecad/model-link');
    const m = await decode(token);
    assert.equal(m.task.tool, 'fore.tip'); assert.equal(m.task.plane.width, 148); assert.ok(m.task.torque.length && m.task.elbow, JSON.stringify(m.task).slice(0, 300));
    assert.ok(m.steps.b.length && m.steps.drawn[0][2].length, 'the drawing with its predicted errors'); assert.equal(m.wires[0][0], 'elbow-motor');
    assert.ok(m.build.list.bought.length && m.build.plates.plates.length && m.build.wires[0].length && m.build.machine.axes.length === 2, 'the whole project');
    const ledger = m.sheet.filter((r) => r[0] === 'Predicted against measured'); assert.ok(ledger.find((r) => r[1] === 'task.accuracy' && r[2] === '0.4' && /predicted/.test(r[4])), JSON.stringify(ledger));
    assert.ok(token.length < 200000, `the machine's data is small (${token.length} chars)`);
    // The wire is drawn, faint, with the model, and goes in no check: it is not one of the parts
    assert.ok(!m.parts.some((p) => /wire/.test(p[0])), 'never a part');
    // A step file for another machine's joints is refused by name
    const steps = path.join(ws, 'exports/home/arm-square.steps.json'), data = JSON.parse(fs.readFileSync(steps, 'utf8'));
    data.axes[0].name = 'other'; fs.writeFileSync(path.join(ws, 'wrong.steps.json'), JSON.stringify(data));
    assert.match(cad('link', 'home/arm', '--steps', 'wrong.steps.json'), /for joints other, elbow, and this machine's are shoulder, elbow: plot it again/);
    assert.match(cad('preview', 'home/arm').trim(), /arm\.png$/, 'a preview takes the wires too');
    const { check } = await import('@rulecad/model-link');
    assert.equal(check({ q: 1, p: [], t: [], task: { tool: 1 } })[0].text, 'broken task', 'a link with bad task data is turned away');
    assert.equal(check({ q: 1, p: [], t: [], steps: { names: ['a'], spu: [1], start: [0], b: [[0, 1, 0, 'x']], drawn: [] } })[0].text, 'broken step file');
  } finally { done(); }
});

test('tool.grip: a servo closing compliant fingers on a payload, with the leaves\' strain and a stiff leaf refused', async () => {
  const { gripChecks } = await import('./lib/grip.mjs');
  const servo = { id: 's', model: { type: 'servo', figures: { stall_torque: { value: 0.1765 } } } }, run = (grip, payload = 0.05) => { const out = []; gripChecks({ a: { task: { grip } }, motion: { drives: [servo] }, task: { payload, accel: 500 }, num: (x) => x, project: 'x' }, (level, text, card, extra) => out.push({ level, text, ...extra })); return out; };
  const good = run({ servo: 's', horn: 12, leaf: { length: 30, thickness: 1, width: 8 }, travel: 5, friction: 0.4 });
  const g = good.find((x) => x.code === 'tool.grip'); assert.equal(g.level, 'pass', g.text); assert.ok(g.values.margin >= 2);
  assert.equal(run({ servo: 's', horn: 12, leaf: { length: 30, thickness: 1, width: 8 }, travel: 5, friction: 0.4 }, 2).find((x) => x.code === 'tool.grip').level, 'fail');
  const stiff = run({ servo: 's', horn: 12, leaf: { length: 10, thickness: 3, width: 8 }, travel: 5, friction: 0.4 }); assert.match(stiff.find((x) => x.code === 'tool.grip').text, /can't close them/); assert.equal(stiff.find((x) => x.code === 'tool.strain').level, 'fail');
  assert.throws(() => run({ servo: 'none', horn: 12, leaf: {}, travel: 5 }), /task\.grip: servo "none" isn't a motor item/);
});

test('a gait of one leg: its foot out of the hip anchor\'s plane, a joint behind a gearbox moved by the motor it follows, and played', async () => {
  const { ws, cad, done } = workspace();
  const asm = { title: 'Leg', kind: 'fit', items: [{ id: 'shaft', object: 'link' }, { id: 'thigh', object: 'link' }, { id: 'shin', object: 'shin' }],
    joints: [{ id: 'd', type: 'revolute', parent: { at: [0, -60, 0], axis: [0, 1, 0] }, child: 'shaft.base', min: -10, max: 10 },
      { id: 'h', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'thigh.base', follow: 'd', ratio: 0.5, offset: 90, min: 40, max: 140 },
      { id: 'k', type: 'revolute', parent: 'thigh.tip', child: 'shin.base', min: -150, max: 0, value: -30 }],
    fits: [{ a: 'thigh', b: 'shin', min: -1000 }, { a: 'shaft', b: 'thigh', min: -1000 }], gait: { legs: ['shin.tip'], pattern: { duty: 0.6, phase: [0] }, stride: 20, lift: 10, period: 2, height: 120, mass: 0.75, clearance: 8 } };
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['link', 'shin'] });
    const LINK = "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 6], center: [v.long / 2, 0, 0] }) }\n";
    write('projects/home/objects/link.json', { name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 0, 0], axis: [0, 1, 0] } }, variables: { long: { value: 80, unit: 'mm', rule: 'Long' } } });
    write('projects/home/objects/link.js', LINK);
    // The shin's foot is 8 mm out of the plane of the hip's anchor, as a real leg's is, its gearbox beside its links
    write('projects/home/objects/shin.json', { name: 'shin', title: 'Shin', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 8, 0], axis: [0, 1, 0] } }, variables: { long: { value: 80, unit: 'mm', rule: 'Long' } } });
    write('projects/home/objects/shin.js', LINK);
    write('projects/home/assemblies/leg.json', asm);
    const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/leg', '--json'], { cwd: ws, encoding: 'utf8' }).stdout), f = r.findings;
    assert.ok(f, JSON.stringify(r.error));
    assert.ok(!f.some((x) => x.code === 'gait.reach'), JSON.stringify(f.filter((x) => x.code?.startsWith('gait')))); // reached: the foot stays in its own plane
    assert.equal(f.find((x) => x.code === 'gait.clearance').level, 'pass');
    assert.match(f.find((x) => x.code === 'gait.stable').text, /one leg, on a stand/);
    assert.equal(f.find((x) => x.code === 'gait.sweep').level, 'pass');
    assert.match(cad('animate', 'home/leg'), /leg-gait\.svg/);
    assert.ok(fs.readFileSync(path.join(ws, '.preview/home/leg-gait.svg'), 'utf8').includes('<animate'));
    // In the link: the joints that lead, the motor's shaft in place of what follows it, at the motor's values
    const out = cad('link', 'home/leg', '--long'), token = out.match(/view\s+(\S+)/)[1].split('#m=')[1], { decode } = await import('@rulecad/model-link');
    const m = await decode(token), seq = m.motion.sequence;
    assert.deepEqual(seq.names, ['d', 'k']);
    const hip = (seq.q[0][0] * 0.5) + 90;
    assert.ok(Math.abs(seq.q[0][1]) > 1 && hip > 40 && hip < 140, `${seq.q[0]}`);
    assert.equal(seq.period, 2);
    const { check } = await import('@rulecad/model-link');
    assert.equal(check({ q: 1, p: [], t: [], motion: { items: [['a']], joints: [], part: [], sequence: { period: 2, names: ['nope'], q: [[0]] } } })[0].text, 'broken motion', 'a sequence is data, checked');
  } finally { done(); }
});

test('a rod and a linear bushing are bought items, cut to the length set on the item', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/rod.json'), JSON.stringify({ title: 'Rod', kind: 'fit', items: [{ id: 'rod', bought: 'rod-8', set: { length: 123 } }, { id: 'bush', bought: 'lm8uu', at: [0, 0, 10] }], fits: [{ a: 'rod', b: 'bush', fastens: true, min: -1000 }] }));
    const out = cad('list', 'home/rod');
    assert.match(out, /rod-8/); assert.match(out, /lm8uu/);
    assert.match(cad('check', 'home/rod'), /123 mm|rod-8/);
  } finally { done(); }
});

test('tool.grip reads the finger\'s own material when it names one; a link bends as everything bolted to its joint, and a gearbox output joins the chain through its motor', async () => {
  const { gripChecks } = await import('./lib/grip.mjs');
  const servo = { id: 's', model: { type: 'servo', figures: { stall_torque: { value: 0.1765 } } } }, spec = { servo: 's', horn: 12, leaf: { length: 40, thickness: 1, width: 12 }, travel: 3, friction: 0.4 };
  const run = (grip) => { const out = []; gripChecks({ a: { task: { grip } }, motion: { drives: [servo] }, task: { payload: 0.05, accel: 300 }, num: (x) => x, project: 'x' }, (level, text, card, extra) => out.push({ level, text, ...extra })); return out; };
  assert.match(run({ ...spec, material: 'petg' }).find((x) => x.code === 'tool.strain').text, /in a PETG leaf/);
  assert.doesNotMatch(run(spec).find((x) => x.code === 'tool.strain').text, /PETG/, 'the project\'s material when it names none');
  const { ws, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.join(ws, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const obj = (name, size, anchors) => { write(`projects/home/objects/${name}.json`, { name, version: '0.1.0', engine: 'manifold', anchors, variables: { x: { value: size[0], unit: 'mm', rule: 'Long' }, y: { value: size[1], unit: 'mm', rule: 'Wide' }, z: { value: size[2], unit: 'mm', rule: 'Thick' } } }); write(`projects/home/objects/${name}.js`, "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.x, v.y, v.z], center: [v.x / 2, 0, v.z / 2] }) }\n"); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['hub', 'bar'] });
    obj('hub', [8, 10, 6], { base: { at: [0, 0, 3], axis: [0, 0, 1], ref: [1, 0, 0] }, out: { at: [8, 0, 3], axis: [1, 0, 0], ref: [0, 1, 0] } });
    obj('bar', [100, 10, 6], { in: { at: [0, 0, 3], axis: [1, 0, 0], ref: [0, 1, 0] }, tip: { at: [100, 0, 3], axis: [0, 0, 1], ref: [1, 0, 0] } });
    const a30 = Math.PI / 6, r = 108;
    write('projects/home/assemblies/lift.json', { title: 'A link', kind: 'fit', gravity: [0, 0, -1], items: [{ id: 'hub', object: 'hub' }, { id: 'bar', object: 'bar' }, { id: 'turn', object: 'hub' }],
      joints: [{ id: 'drive', type: 'revolute', parent: { at: [-200, 0, 0], axis: [0, 0, 1] }, child: 'turn.base', min: -360, max: 360 }, { id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'hub.base', follow: 'drive', ratio: 0.5, min: -90, max: 90 }, { id: 'bolted', type: 'fixed', parent: 'hub.out', child: 'bar.in' }],
      task: { tool: 'bar.tip', volume: { x: [r * Math.cos(a30), r * Math.cos(a30)], y: [r * Math.sin(a30), r * Math.sin(a30)], z: [0, 0] }, payload: 0.1, accel: 100 } });
    const res = spawnSync(process.execPath, [BIN, 'check', 'home/lift', '--json'], { cwd: ws, encoding: 'utf8' }), json = JSON.parse(res.stdout);
    const link = json.findings.find((x) => x.code === 'link.deflection');
    assert.ok(link, json.findings.map((x) => x.code).join(', '));
    assert.ok(link.values.total > 0.05 && link.values.total < 5, `the bar, bolted to the joint's hub, bends as a cantilever (${link.values.total} mm)`);
    assert.equal(link.values.rows[0].link, 'hub');
  } finally { done(); }
});

test('a link for a machine working in a volume: flat along any axis, or a single point', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: [100, 0, 0], axis: [0, 1, 0] } }, variables: { side: { value: 6, unit: 'mm', rule: 'Side' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [100, v.side, v.side], center: [50, 0, 0] }) }\n");
    const asm = (volume) => JSON.stringify({ title: 'A', kind: 'fit', items: [{ id: 'arm', object: 'link' }], joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.base', min: -90, max: 90 }], task: { tool: 'arm.tip', volume } });
    for (const volume of [{ x: [60, 90], y: [0, 0], z: [-40, 40] }, { x: [100, 100], y: [0, 0], z: [0, 0] }]) {
      fs.writeFileSync(path.join(ws, 'projects/home/assemblies/a.json'), asm(volume));
      assert.doesNotMatch(cad('link', 'home/a', '--md', '--long'), /broken task/);
    }
  } finally { done(); }
});

test('beams in an assembly: four placed by their ends make a rectangle, a plate at x1.top@50% sits on the slot\'s centre line, and an address past the end is refused with the length', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/frame.json');
    fs.mkdirSync(at('objects'), { recursive: true }); fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: ['plate'] }));
    fs.writeFileSync(at('objects/plate.json'), JSON.stringify({ name: 'plate', title: 'Plate', version: '0.1.0', uses: ['x1c'], anchors: { centre: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { side: { value: 40, unit: 'mm', rule: 'Side' }, thick: { value: 3, unit: 'mm', rule: 'Thick' } } }));
    // v.frames in a design: the tab is the slot's opening, read from the profile's slot family (through the sandbox)
    fs.writeFileSync(at('objects/plate.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) {\n  const p = v.frames.profileModel('2020-misumi-hfs5'), slot = p.slots[p.faces.top[0].slot]\n  return v.ops.union(cuboid({ size: [v.side, v.side, v.thick], center: [0, 0, v.thick / 2] }), cuboid({ size: [v.side / 2, slot.opening, v.thick], center: [0, 0, -v.thick / 2] }))\n}\n");
    const B = (id, from, to, beam = {}) => ({ id, beam: { profile: '2020-misumi-hfs5', ...beam }, from, to });
    const a = { title: 'Frame', kind: 'fit', items: [B('x1', [0, 0, 0], [300, 0, 0]), B('x2', [0, 200, 0], [300, 200, 0], { length: 'x1.length' }),
      B('y1', [-10, -10, 0], [-10, 210, 0]), B('y2', [310, -10, 0], [310, 210, 0]), { id: 'plate', object: 'plate', at: 'x1.top@50%' }],
      fits: [{ a: 'plate', b: 'x1', min: -1000, note: 'the tab in the slot' }, { a: 'plate', b: 'x1.top@50%', min: -1000, max: 0.01, note: 'on the face' }], loops: [{ a: 'plate.centre', b: 'x1.top@50%', label: 'on the centre line' }, { a: 'plate.centre', b: 'x1.top@-20', label: 'not at b' }] };
    const write = () => fs.writeFileSync(file, JSON.stringify(a));
    write();
    // where every part is: each beam's box, and the plate's
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { bounds } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../../printcheck/printcheck.mjs')).href)});
      const s = await buildAssembly('frame/frame'), r = (v) => v.map((x) => Math.round(x * 100) / 100);
      console.log(JSON.stringify({ parts: Object.fromEntries(s.parts.map((p) => { const b = bounds(p.triangles); return [p.name, [r(b.lo), r(b.hi), p.role]]; })), findings: checkAssembly(s).map(({ level, code, text }) => ({ level, code, text })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe();
    // a rectangle 340 by 220 of 20 mm beams: the long sides 300 between the short ones, all on z = 0
    assert.deepEqual(r.parts['x1.body'], [[0, -10, -10], [300, 10, 10], 'reference']);
    assert.deepEqual(r.parts['x2.body'], [[0, 190, -10], [300, 210, 10], 'reference']);
    assert.deepEqual(r.parts['y1.body'], [[-20, -10, -10], [0, 210, 10], 'reference']);
    assert.deepEqual(r.parts['y2.body'], [[300, -10, -10], [320, 210, 10], 'reference']);
    // the plate on the top face, centred on the slot's centre line (y = 0) half way along, its tab down in the slot
    assert.deepEqual(r.parts['plate.body'], [[130, -20, 7], [170, 20, 13], 'part']);
    const by = (code) => r.findings.filter((x) => x.code === code);
    assert.equal(by('overlap')[0].level, 'pass', JSON.stringify(by('overlap'))); // beams meet face to face; the tab is allowed in by its fit
    assert.match(by('fit').find((x) => /on the face/.test(x.text)).text, /on the face: press fit/); // (the faces near the address: the tab is in the beam's envelope)
    assert.deepEqual(by('loop').map((x) => [x.level, x.text]), [['pass', 'on the centre line: closed (0 mm, axes 0° apart)'], ['fail', 'not at b: apart (130 mm, axes 0° apart)']]);
    assert.match(by('beam.mass')[0].text, /^x1: profile-2020-misumi-hfs5 x 300: 147\.82 g/);
    assert.equal(by('bought.item').length, 4);
    // on the list by profile and length, weighed by the sheet's 0.5 kg/m
    const list = cad('list', 'frame/frame');
    assert.match(list, /2 ×\s+profile-2020-misumi-hfs5 x 300 mm\s+a beam\s+150 g each\s+x1, x2/);
    assert.match(list, /2 ×\s+profile-2020-misumi-hfs5 x 220 mm\s+a beam\s+110 g each\s+y1, y2/);
    // turned about its axis: an upright 2040 at roll 90 has its top toward -x, and the plate goes with it
    a.items.splice(0, 4, { id: 'x1', beam: { profile: '2040-misumi-hfs5' }, from: [0, 0, 0], to: [0, 0, 100], roll: 90 }); a.fits = []; a.loops = []; write();
    r = probe();
    assert.deepEqual(r.parts['x1.body'], [[-10, -20, 0], [10, 20, 100], 'reference']);
    assert.deepEqual(r.parts['plate.body'], [[-13, -30, 30], [-7, 10, 70], 'part']);
    // refused by name: past the end (with the length), a length that disagrees with the ends, a printed beam
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); fs.writeFileSync(file, JSON.stringify(b)); assert.match(cad('check', 'frame/frame'), pattern); };
    refused((b) => { b.items[1].at = 'x1.top@120'; }, /item plate: at: x1: "top@120" is past the end of profile-2040-misumi-hfs5 x 100: it is 100 mm long/);
    refused((b) => { b.items[1].at = 'x1.top@-101'; }, /"top@-101" is past the end of .* it is 100 mm long/);
    refused((b) => { b.loops = [{ a: 'plate.centre', b: 'x1.side@20' }]; }, /x1: profile-2040-misumi-hfs5 x 100 has no "side@20": it has a, b, a\.1/);
    refused((b) => { b.items[0].beam.length = 120; }, /item x1: its length is 120 mm, and its ends are 100 mm apart/);
    refused((b) => { b.items[0].beam.printed = true; }, /item x1: a printed beam \("printed": true\) is a later release/);
    refused((b) => { b.items[0].beam.colour = 'red'; }, /item x1: a beam has no "colour": it takes profile, length, printed, material/);
    refused((b) => { delete b.items[0].from; delete b.items[0].to; delete b.items[0].roll; }, /item x1: give the beam a length, or place it by its ends/);
    // cad add beam: one placed by its ends, kept to the schema
    write();
    assert.match(cad('add', 'beam', 'frame/frame', '--id', 'z1', '--profile', '2020-misumi-hfs5', '--from', '30,0,0', '--to', '30,0,100', '--roll', '90'), /added a beam/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).items.at(-1), { id: 'z1', beam: { profile: '2020-misumi-hfs5' }, from: [30, 0, 0], to: [30, 0, 100], roll: 90 });
    assert.match(cad('add', 'item', 'frame/frame', '--id', 'p2', '--object', 'plate', '--at', 'z1.front@50%'), /added an item/);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).items.at(-1).at, 'z1.front@50%');
  } finally { done(); }
});

test('beam operations in an assembly: an end tapped M5 and an access hole by expression, cut into the solid; beam.op findings; a tap with no end bore refused by name', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/ops.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const a = { title: 'Ops', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5', length: 300,
      ops: [{ op: 'tap', at: 'a', thread: 'M5' }, { op: 'access', at: 'top@-10', thread: 'M5', depth: '2 * 3.95' }, { op: 'mitre', at: 'b', angle: 45, about: 'top' }] }, from: [0, 0, 0], to: [300, 0, 0] }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/ops'), o = s.objects.find((x) => x.id === 'x1'), p = s.parts.find((x) => x.name === 'x1.body');
      console.log(JSON.stringify({ ops: o.beam.ops.map((x) => [x.op, x.at, x.distance, x.depth ?? null]), lines: o.beam.ops.map((x) => x.line), triangles: p.triangles.length, collide: p.collide ? 1 : 0, findings: checkAssembly(s).filter((f) => /^beam\\./.test(f.code)).map(({ level, code, text }) => ({ level, code, text })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const r = probe();
    assert.deepEqual(r.ops, [['tap', 'a', 0, 10], ['cut', 'a', 0, null], ['access', 'top@-10', 290, 7.9], ['mitre', 'b', 300, null]]);
    assert.match(r.lines[2], /access hole Ø5\.3 mm in top\.1, 290 mm from end a \(10 from end b\)/);
    assert.ok(r.triangles > 872, `the solid has the tap, the hole and the mitre cut in (${r.triangles} triangles)`);
    assert.ok(r.findings.some((f) => f.level === 'info' && /x1: .*its 300 mm is measured on the long side, back; mitred, the front is 280 mm/.test(f.text)), JSON.stringify(r.findings));
    // a hole across the tapped thread is a beam.op failure on cad check, named by item
    a.items[0].beam.ops.push({ op: 'drill', at: 'top@8', diameter: 3 }); write();
    assert.match(cad('check', 'frame/ops'), /x1: profile-2020-misumi-hfs5 x 300: the drill at top@8 \(Ø3 mm, 8 mm from end a\) crosses the M5 thread tapped 10 mm into a\.1/);
    // refused by name: a tap in a tube, with no end bore; an operation the kit does not have
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); assert.match(cad('check', 'frame/ops'), pattern); };
    refused((b) => { b.items[0].beam.profile = 'tube-al-20x20x2'; b.items[0].beam.ops = [{ op: 'tap', at: 'a', thread: 'M5' }]; }, /item x1: profile-tube-al-20x20x2 x 300: ops\[0\] \(tap\): profile-tube-al-20x20x2 has no bore in its ends to tap/);
    refused((b) => { b.items[0].beam.ops = [{ op: 'weld', at: 'a' }]; }, /no operation "weld": there are cut, mitre, tap/);
    refused((b) => { b.items[0].beam.printed = true; }, /a printed beam \("printed": true\) is a later release, and its ops become features of the print then/);
  } finally { done(); }
});

test('joins between beams: a blind join taps one end and drills an access hole across the other beam in line with it, counts one button-head screw, and a beam 2 mm off the face fails join.geometry with the gap', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/tee.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // y1 stands on x1's back face 120 mm from its end a, on the slot's centre line; the join says how they are held
    const a = { title: 'Tee', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [120, 10, 0], to: [120, 210, 0] }],
      joins: [{ kind: 'blind', a: 'y1.a', b: 'x1.back@120' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/tee'), ops = Object.fromEntries(s.objects.filter((o) => o.beam).map((o) => [o.id, o.beam.ops.filter((x) => !x.implied).map((x) => [x.op, x.at, x.distance, x.depth ?? null, x.diameter ?? x.long ?? null])]));
      console.log(JSON.stringify({ ops, hardware: s.hardware.map((h) => [h.kind, h.name, h.head]), findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap)/.test(f.code)).map(({ level, code, text, values }) => ({ level, code, text, values })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe();
    const by = (code) => r.findings.filter((x) => x.code === code);
    // a tapped end on y1, 18.5 mm deep (aluminium's 10 mm of M5 engaged, tip room, 1.5 diameters more), and on x1 an access
    // hole across from the back face at the same 120 mm, from the front face through to the back slot (14 mm)
    assert.deepEqual(r.ops, { x1: [['access', 'front.1@120', 120, 14, 5.3]], y1: [['tap', 'a.1', 0, 18.5, null]] });
    // one button-head screw, its head in x1's back slot under the lips, into y1's thread, its key through the access hole
    assert.deepEqual(r.hardware, [['screw', 'M5x12 button', 'button']]);
    for (const code of ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access', 'overlap']) assert.deepEqual(by(code).map((x) => x.level), ['pass'], `${code}: ${JSON.stringify(by(code))}`);
    assert.match(by('fasten.seat')[0].text, /the head, 9\.5 mm across, bears on the lips of x1's slot \(slot-6-misumi\) from inside, in its 12 mm cavity/);
    assert.match(by('fasten.end')[0].text, /ends in y1's own M5 thread, tapped 18\.5 mm into its end bore a\.1/);
    assert.match(by('fasten.access')[0].text, /a 3 mm hex key reaches the head along its axis/);
    assert.deepEqual(by('join.geometry').map((x) => [x.level, x.text]), [['pass', 'blind join of y1.a to x1.back@120: y1\'s end a meets x1\'s back.1 face square and flush at 120 mm from x1\'s end a, on the slot\'s centre line']]);
    assert.deepEqual(by('join.stiffness').map((x) => [x.level, x.values]), [['info', { bending: 1.5e6, twist: 3e5 }]]);
    assert.match(by('join.stiffness')[0].text, /an estimate, until the joint rig \(issue 264\) measures it/);
    assert.deepEqual(by('join.end').map((x) => [x.level, x.text.split(':')[0]]), [['warn', '3 beam ends are neither joined nor capped']]);
    // counted on the list once, as one screw of the join
    assert.match(cad('list', 'frame/tee'), /1 ×\s+M5x12 button\s+.*blind join of y1\.a to x1\.back@120/);
    assert.match(cad('list', 'frame/tee'), /access Ø5\.3 at front\.1@120\.0\s+x1/);
    // y1 moved 2 mm off the face: join.geometry fails with the gap
    a.items[1].from = [120, 12, 0]; a.items[1].to = [120, 212, 0]; write();
    r = probe();
    assert.deepEqual(by('join.geometry').map((x) => [x.level, x.values.gap]), [['fail', 2]]);
    assert.match(by('join.geometry')[0].text, /y1's end a stands 2 mm off x1's back\.1 face: a gap of 2 mm, where it meets flush\. Move y1 2 mm toward x1/);
    // 5 mm along: where the join says and where the beam is disagree, and it says which address would do
    a.items[1].from = [125, 10, 0]; a.items[1].to = [125, 210, 0]; write();
    assert.match(probe().findings.find((x) => x.code === 'join.geometry').text, /y1's end a is 5 mm toward x1's end b from x1\.back@120: it meets x1 125 mm from its end a, so the join says x1\.back@125, or y1 moves/);
    // an end-tap join: a clearance hole right through x1, a cap screw on the front slot's lips
    a.items[1].from = [120, 10, 0]; a.items[1].to = [120, 210, 0]; a.joins[0].kind = 'end-tap'; write();
    r = probe();
    assert.deepEqual([r.ops.x1, r.hardware], [[['drill', 'front.1@120', 120, 14, 5.5]], [['screw', 'M5x35 cap', 'cap']]]);
    assert.deepEqual(r.findings.filter((x) => /^(fasten|overlap|join\.geometry)/.test(x.code) && x.level !== 'pass'), []);
    // a kind whose fitting comes later: checked where it meets, nothing drilled, and it says so
    a.joins[0] = { kind: 'bracket', a: 'y1.a', b: 'x1.back@120', fitting: 'bought' }; write();
    r = probe();
    assert.deepEqual([r.ops, r.hardware, by('join.fitting').map((x) => x.level), by('join.geometry').map((x) => x.level)], [{ x1: [], y1: [] }, [], ['warn'], ['pass']]);
    // a mitre: each end cut at 45° about the face the corner lies in, the length on the outside of the corner
    const ell = { title: 'Ell', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [-10, 0, 0], to: [290, 0, 0] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [0, -10, 0], to: [0, 290, 0] }], joins: [{ kind: 'mitre', a: 'x1.a', b: 'y1.a' }] };
    write(ell); r = probe();
    assert.deepEqual(r.ops, { x1: [['mitre', 'a', 0, null, 'front']], y1: [['mitre', 'a', 0, null, 'back']] });
    assert.deepEqual([by('join.geometry').map((x) => [x.level, x.values.miss]), by('join.fitting').map((x) => x.level)], [[['pass', 0]], ['warn']]);
    assert.match(by('join.fitting')[0].text, /The mitres are cut; the corner key or plate comes with a later release/);
    ell.items[1].from = [300, 0, 0]; ell.items[1].to = [500, 0, 0]; write(ell);
    assert.match(cad('check', 'frame/tee'), /join 1: x1 and y1 lie along one line, so there is no corner to mitre: a splice joins them end to end/);
    // refused by name: a join on an item that is not a beam, a key a join does not take; cad add join kept to the beams
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); assert.match(cad('check', 'frame/tee'), pattern); };
    refused((b) => { b.joins = [{ kind: 'blind', a: 'z1.a', b: 'x1.back@120' }]; }, /join 1: a is on a beam item of this assembly, and z1 is not an item \(beams: x1, y1\)/);
    refused((b) => { b.joins = [{ kind: 'blind', a: 'y1.a', b: 'x1.back@120', glue: true }]; }, /join 1: a join has no "glue": it takes kind, a, b, fitting, screw, brace, load, nut, note/);
    refused((b) => { b.joins = [{ kind: 'blind', a: 'y1.a', b: 'y1.back@120' }]; }, /join 1: a and b are on one beam, y1/);
    write({ ...a, joins: [] });
    assert.match(cad('add', 'join', 'frame/tee', '--kind', 'blind', '--a', 'y1.a', '--b', 'x1.back@120'), /added a join/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).joins, [{ kind: 'blind', a: 'y1.a', b: 'x1.back@120' }]);
    assert.match(cad('add', 'join', 'frame/tee', '--kind', 'blind', '--a', 'q1.a', '--b', 'x1.back@120'), /join a: no beam "q1" in frame\/tee \(beams: x1, y1\)/);
    assert.match(cad('check', 'frame/tee'), /files match their schemas/);
  } finally { done(); }
});

test('beam cut list and sheets: a box of twelve beams lists three lengths, the bars to buy and their offcuts; cad beams writes a sheet per mark, the access hole at 207.5 mm', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // four of each length, apart from each other; z1 has its end tapped and an access hole 12.5 mm from end b
    const items = [];
    for (let i = 0; i < 4; i++) items.push({ id: `x${i + 1}`, beam: { profile: '2020-misumi-hfs5' }, from: [0, i * 40, 0], to: [300, i * 40, 0] });
    for (let i = 0; i < 4; i++) items.push({ id: `y${i + 1}`, beam: { profile: '2020-misumi-hfs5' }, from: [400 + i * 40, 0, 0], to: [400 + i * 40, 260, 0] });
    for (let i = 0; i < 4; i++) items.push({ id: `z${i + 1}`, beam: { profile: '2020-misumi-hfs5', ...(i === 0 ? { ops: [{ op: 'tap', at: 'a', thread: 'M5' }, { op: 'access', at: 'top@-12.5', thread: 'M5' }] } : {}) }, from: [700 + i * 40, 0, 0], to: [700 + i * 40, 0, 220] });
    fs.writeFileSync(at('assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', items }));
    const list = cad('list', 'frame/box');
    assert.match(list, /Cut list \(kerf 3 mm, trim 10 mm; a sheet for each mark: cad beams frame\/box\)/);
    assert.match(list, /A\s+4 ×\s+profile-2020-misumi-hfs5 x 300 mm\s+150 g each\s+cut square\s+x1, x2, x3, x4/);
    assert.match(list, /D\s+1 ×\s+profile-2020-misumi-hfs5 x 220 mm\s+110 g each\s+tap M5 x 10 at a; access Ø5\.3 at top\.1@207\.5\s+z1/);
    assert.match(list, /profile-2020-misumi-hfs5: 3 lengths, 4 × 300, 4 × 260, 4 × 220 mm/);
    assert.match(list, /profile-2020-misumi-hfs5: buy 1 × 4000 mm; kerf 3, trim 10; 834 mm left over/);
    assert.match(list, /bar 1, 4000 mm: trim 10, A 300 \(x1\), A 300 \(x2\), .*; offcut 834/);
    const json = JSON.parse(cad('list', 'frame/box', '--json'));
    assert.deepEqual(json.cut.stock[0].buy, [{ length: 4000, count: 1 }]); assert.equal(json.cut.totals.offcut, 834); assert.equal(json.cut.marks[0].beam, undefined);
    // a sheet per mark in exports/, the access hole dimensioned 207.5 from end a, the tap's thread and depth, the face up
    assert.match(cad('beams', 'frame/box'), /mark D \(z1\), 1:2: exports[\\/]frame[\\/]box\.beam-D\.svg/);
    assert.deepEqual(fs.readdirSync(path.join(ws, 'exports/frame')).filter((f) => f.endsWith('.svg')).sort(), ['box.beam-A.svg', 'box.beam-B.svg', 'box.beam-C.svg', 'box.beam-D.svg']);
    const svg = fs.readFileSync(path.join(ws, 'exports/frame/box.beam-D.svg'), 'utf8');
    for (const t of ['>207.5<', '>Mark D: profile-2020-misumi-hfs5 x 220.0 mm<', '>(1) a.1: tap M5 x 10 deep<', '>top face up: seen from the top, end a on the left<']) assert.ok(svg.includes(t), `the sheet shows ${t}`);
    // each beam's mark in its label, the cut list's findings on cad check, and the sheets on the build page
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { buildData } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/buildpage.mjs')).href)});
      const s = await buildAssembly('frame/box');
      console.log(JSON.stringify({ labels: s.parts.filter((p) => /^[xz]1\\./.test(p.name)).map((p) => p.label), marks: s.objects.map((o) => o.mark).join(''), cut: checkAssembly(s).filter((f) => f.code === 'frame.cut').map((f) => f.level + ' ' + f.text), build: (await buildData(s)).build.beams }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    assert.deepEqual(r.labels, ['x1: mark A, profile-2020-misumi-hfs5 x 300 mm', 'z1: mark D, profile-2020-misumi-hfs5 x 220 mm']);
    assert.equal(r.marks, 'AAAABBBBDCCC');
    assert.ok(r.cut.some((t) => /^info mark A \(x1, x2, x3, x4\): 4 beams of 300 mm, each cut to ±0\.5 mm/.test(t)), r.cut.join('\n'));
    assert.deepEqual(r.build.sheets.find((x) => x.mark === 'D'), { mark: 'D', items: ['z1'], file: 'exports/frame/box.beam-D.svg', written: true });
    // a beam longer than any length sold fails on cad check
    items[0].to = [4100, 0, 0]; fs.writeFileSync(at('assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', items }));
    assert.match(cad('check', 'frame/box'), /x1: 4100 mm of profile-2020-misumi-hfs5 is longer than any length it is sold in \(1000, 4000 mm\)/);
  } finally { done(); }
});

test('jigs: a box\'s sixteen blind joins give its drill guides, a tap guide, a cut-length stop per length and a squaring corner of each hand, each lying whole on its beams where the assembly puts it, each marked, printing without supports, each guide\'s bush where the beam\'s sheet puts the hole', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a box: four 300 mm posts; between them x beams at z 30 and 270 and y beams at z 10 and 290, every end blind-joined
    // into a post's face (so each post has an access hole 10 and 30 mm from each end, each beam both ends tapped)
    const P = { profile: '2020-misumi-hfs5' }, items = [], joins = [];
    [[10, 10], [290, 10], [290, 250], [10, 250]].forEach(([x, y], i) => items.push({ id: `p${i + 1}`, beam: P, from: [x, y, 0], to: [x, y, 300] }));
    for (const [n, y, pa, pb, z] of [['x1', 10, 'p1', 'p2', 30], ['x2', 250, 'p4', 'p3', 30], ['x3', 10, 'p1', 'p2', 270], ['x4', 250, 'p4', 'p3', 270]]) {
      items.push({ id: n, beam: P, from: [20, y, z], to: [280, y, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.back@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.front@${z}` });
    }
    for (const [n, x, pa, pb, z] of [['y1', 10, 'p1', 'p4', 10], ['y2', 290, 'p2', 'p3', 10], ['y3', 10, 'p1', 'p4', 290], ['y4', 290, 'p2', 'p3', 290]]) {
      items.push({ id: n, beam: P, from: [x, 20, z], to: [x, 240, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.top@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.bottom@${z}` });
    }
    fs.writeFileSync(at('assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', items, joins }));
    const r = JSON.parse(cad('beams', 'frame/box', '--jigs', '--json'));
    const of = (kind) => r.jigs.filter((x) => x.kind === kind);
    // from the assembly: one drill guide per distinct hole (10 and 30 mm from an end), one tap guide for every tapped
    // end, a stop for each of the three lengths, and a squaring corner of each hand (right and left) for all sixteen joins
    assert.deepEqual(r.jigs.map((x) => [x.kind, x.name, x.mark]), [
      ['drill-guide', 'drill-guide-2020-misumi-hfs5-5.3-at-10', 'ABCD'], ['drill-guide', 'drill-guide-2020-misumi-hfs5-5.3-at-30', 'ABCD'],
      ['length-stop', 'length-stop-2020-misumi-hfs5-300', 'ABCD 300'], ['tap-guide', 'tap-guide-2020-misumi-hfs5-M5', 'EF'],
      ['length-stop', 'length-stop-2020-misumi-hfs5-260', 'E 260'], ['length-stop', 'length-stop-2020-misumi-hfs5-220', 'F 220'],
      ['square-corner', 'square-corner-2020-misumi-hfs5', 'ABCDEF'], ['square-corner', 'square-corner-2020-misumi-hfs5-left', 'ABCDEF']]);
    assert.equal(of('tap-guide')[0].for.length, 4);
    // a squaring corner's arm b runs one way along b: at a post's end only one hand lies on the post, so the box takes both,
    // each for the eight joins whose post runs its way from the beam, every tongue whole on its beam (58 and 78 mm)
    assert.deepEqual(of('square-corner').map((x) => [x.for.length, [...new Set(x.for.map((w) => w.hand))]]), [[8, ['right']], [8, ['left']]]);
    assert.deepEqual(of('square-corner')[1].for.map((w) => w.text).sort(), ['blind join of x1.b to p2.front@30', 'blind join of x2.a to p4.back@30', 'blind join of x3.a to p1.back@270', 'blind join of x4.b to p3.front@270',
      'blind join of y1.a to p1.top@10', 'blind join of y2.b to p3.bottom@10', 'blind join of y3.b to p4.bottom@290', 'blind join of y4.a to p2.top@290']);
    for (const w of of('square-corner').flatMap((x) => x.for)) assert.deepEqual(w.on, { a: 58, b: 78 }, w.text);
    // measured on the solids, each corner fitted where the assembly puts it: its tongues lie whole on their beams (none of
    // either inside the beam's envelope made 400 mm longer past an end; for a, past its far end, as b's tongue crosses the
    // line of a beyond the end that meets b), its plate meets no beam; the other hand, put
    // on the joins given the left, would hang its b tongue past the post's end
    const fitted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { jigsOf } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/jigs.mjs')).href)});
      const { squareCorner, squareCornerModel, beam } = await import(${JSON.stringify(import.meta.resolve('@rulecad/frames'))});
      const { placeItems } = await import(${JSON.stringify(import.meta.resolve('@rulecad/model-link'))});
      const jscad = (await import(${JSON.stringify(import.meta.resolve('@jscad/modeling'))})).default;
      const { intersect } = jscad.booleans, { measureVolume, measureBoundingBox } = jscad.measurements, { transform } = jscad.transforms, { cuboid } = jscad.primitives;
      const s = await buildAssembly('frame/box'), { jigs } = jigsOf(s), placed = placeItems(s.motion, s.jointValues);
      const col = (W) => [W[0], W[4], W[8], 0, W[1], W[5], W[9], 0, W[2], W[6], W[10], 0, W[3], W[7], W[11], 1];
      const mul = (P, Q) => Array.from({ length: 16 }, (_, i) => { const c = Math.floor(i / 4), r = i % 4; return P[r] * Q[4 * c] + P[4 + r] * Q[4 * c + 1] + P[8 + r] * Q[4 * c + 2] + P[12 + r] * Q[4 * c + 3]; });
      const items = s.objects.filter((o) => o.beam).map((o) => { const W = col(placed[s.motion.items.findIndex((x) => x[0] === o.id)]), B = o.beam;
        const longer = (z0, z1) => transform(W, cuboid({ size: [B.profile.width, B.profile.height, z1 - z0], center: [0, 0, (z0 + z1) / 2] }));
        return { id: o.id, B, W, env: transform(W, beam(B, { display: 'link' })), longer: longer(-400, B.length + 400), past: { a: longer(0, B.length + 400), b: longer(-400, B.length) } }; });
      const over = (g, h) => { const [a0, a1] = measureBoundingBox(g), [b0, b1] = measureBoundingBox(h); return [0, 1, 2].every((k) => a0[k] < b1[k] && b0[k] < a1[k]); };
      const vol = (g, h) => (over(g, h) ? measureVolume(intersect(g, h)) : 0), hang = (g, x, far) => vol(g, far ? x.past[far] : x.longer) - vol(g, x.env);
      const out = [];
      for (const j of jigs.filter((x) => x.kind === 'square-corner')) for (const w of j.for) {
        const g = transform(w.fit, squareCorner(j.model)), [A, B] = w.items.map((id) => items.find((x) => x.id === id));
        const row = { text: w.text, hand: w.hand, inA: vol(g, A.env), inB: vol(g, B.env), hangA: hang(g, A, w.end), hangB: hang(g, B), others: items.filter((x) => !w.items.includes(x.id)).map((x) => vol(g, x.env)).reduce((t, v) => t + v, 0) };
        if (w.hand === 'left') { const m = squareCornerModel({ profile: A.B.profile, face: w.faces[0], end: w.end, length: A.B.length }, { profile: B.B.profile, face: w.faces[1], edge: w.edge }, { hand: 'right' }); row.rightHangs = hang(transform(mul(A.W, m.fit), squareCorner(m)), B); }
        out.push(row);
      }
      // a tapped end no guide can be drawn for (its bore gone) is a jig.tap warning, the other jigs still made
      for (const o of s.objects) if (o.beam) for (const x of o.beam.ops) if (x.op === 'tap') x.bores = [x.end + '.9'];
      const t = jigsOf(s);
      console.log(JSON.stringify({ rows: out, tap: { kinds: [...new Set(t.jigs.map((x) => x.kind))], findings: t.findings.map((f) => f.level + ' ' + f.code + ' ' + f.text) } }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    assert.equal(fitted.rows.length, 16);
    assert.deepEqual(fitted.tap.kinds, ['drill-guide', 'length-stop', 'square-corner']);
    assert.equal(fitted.tap.findings.length, 4);
    assert.match(fitted.tap.findings[0], /^warn jig\.tap mark E \(x1, x2, x3, x4\), operation \d+: no tap guide: profile-2020-misumi-hfs5 x 260's op \d+ \(tap at a\.1\) taps bore a\.9, which profile-2020-misumi-hfs5 x 260 does not have: end a has a\.1/);
    for (const f of fitted.rows) {
      assert.ok(f.inA > 100 && f.inB > 100, `${f.text}: its tongues in the slots (${f.inA}, ${f.inB} mm³)`);
      assert.ok(f.hangA < 0.01 && f.hangB < 0.01, `${f.text}: ${f.hangA} and ${f.hangB} mm³ of tongue past the beams' ends`);
      assert.ok(f.others < 0.01, `${f.text}: it meets ${f.others} mm³ of the other beams`);
      if (f.hand === 'left') assert.ok(f.rightHangs > 100, `${f.text}: the right-handed corner would hang ${f.rightHangs} mm³ past the post's end`);
    }
    // every guide's bush where the sheet dimensions its hole, for all 16 access holes in the posts, from whichever end is nearer
    const holes = of('drill-guide').flatMap((x) => x.for);
    assert.equal(holes.length, 16);
    for (const w of holes) { assert.equal(w.bush, w.sheet, `${w.label}: the bush at ${w.bush}, the sheet at ${w.sheet}`); assert.equal(w.distance, Math.min(w.sheet, 300 - w.sheet)); }
    assert.deepEqual([...new Set(holes.map((w) => w.sheetText))].sort(), ['10.0', '270.0', '290.0', '30.0']);
    // each prints without supports, and says its grams and margin
    for (const x of r.jigs) { assert.deepEqual(x.checks.flatMap((c) => c.issues), [], x.name); assert.ok(x.margin >= 2 && x.grams > 1, `${x.name}: ${x.grams} g at ${x.margin}×`); assert.ok(x.findings.some((f) => f.code === 'fitting.mass')); }
    for (const x of of('square-corner')) assert.ok(x.findings.some((f) => f.code === 'jig.square' && f.level === 'pass'), x.name);
    // laid out as one plate: 8 jigs, three of the stops with a gauge in two pieces
    assert.deepEqual(r.plates.map((p) => [p.file.replace(/\\/g, '/'), p.parts.length]), [['exports/frame/box.jigs.3mf', 13]]);
    assert.ok(fs.statSync(path.join(ws, 'exports/frame/box.jigs.3mf')).size > 1000);
    assert.deepEqual(r.findings, []);
    // the text form; a hole too far from both ends for one print is a warning in place of a guide
    assert.match(cad('beams', 'frame/box', '--jigs'), /drill-guide-2020-misumi-hfs5-5\.3-at-30 \[ABCD\]: 11\.\d+ g, 6\.66× at its load, prints clean: for A3 \(p2: access hole Ø5\.3 mm in back\.1, 30 mm from end a/);
    fs.writeFileSync(at('assemblies/long.json'), JSON.stringify({ title: 'Long', kind: 'fit', items: [{ id: 'l1', beam: { ...P, ops: [{ op: 'access', at: 'top@500', thread: 'M5' }] }, from: [0, 0, 0], to: [1000, 0, 0] }] }));
    const l = JSON.parse(cad('beams', 'frame/long', '--jigs', '--json'));
    assert.deepEqual(l.jigs.map((x) => x.kind), ['length-stop']);
    assert.match(l.findings[0].text, /mark A \(l1\), operation 2: no drill guide: .* is 500 mm from end a and 500 mm from end b: a guide that reaches it is [\d.]+ mm long, more than the 236 mm the printer's 256 mm bed takes\. Mark this hole from the sheet/);
  } finally { done(); }
});

test('slot nuts: a plate on a beam between two joins with slide-in nuts fails frame.nut and passes with drop-ins; another slot\'s two nuts are loaded before its corner is closed; fasten.slot catches a plate drawn for another slot spacing', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/frame.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    // a plate with two M4 clearance holes, pitch apart along its length; a cap for a beam's end
    object(ws, 'frame/plate', { uses: ['x1c'], variables: { pitch: t(20, 'Between the holes', 5, 60), thick: t(3, 'The plate', 2, 10), length: t(40, 'Its length', 20, 100) } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [v.length, 20, v.thick], center: [0, 0, v.thick / 2] })
  return v.ops.subtract(plate, ...[-1, 1].map((s) => v.fixings.hole('M4', { depth: v.thick, at: [s * v.pitch / 2, 0, v.thick] })))
}
`);
    object(ws, 'frame/cap', {}, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main () { return cuboid({ size: [20, 20, 3], center: [0, 0, 1.5] }) }
`);
    const pj = JSON.parse(fs.readFileSync(at('project.json'), 'utf8')); fs.writeFileSync(at('project.json'), JSON.stringify({ ...pj, material: 'PLA' }));
    // x1 runs between two posts, a blind join at each end, so both ends of its slots are closed; y1 stands on p1's top
    // face at a corner (its end a joined) and is capped at end b by a foot. A plate on each, on two M4 screws.
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    const a = { title: 'Frame', kind: 'fit', items: [beam('p1', [-10, 0, -120], [-10, 0, 80]), beam('p2', [310, 0, -120], [310, 0, 80]), beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [-10, 10, 50], [-10, 210, 50]),
      { id: 'foot', object: 'cap', at: 'y1.b' }, { id: 'plate', object: 'plate', at: [150, 0, 10] }, { id: 'plate2', object: 'plate', at: [-10, 110, 60], rotate: [0, 0, 90] }],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'p1.back@120' }, { kind: 'blind', a: 'x1.b', b: 'p2.front@120' }, { kind: 'blind', a: 'y1.a', b: 'p1.top@170' }],
      fasten: [{ screw: 'M4 button', through: ['plate'], into: 'x1.top', holes: 'plate.body', nut: 'slide-in' }, { screw: 'M4 button', through: ['plate2'], into: 'y1.top', holes: 'plate2.body', nut: 'slide-in' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = (order = false) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/frame'), out = { hardware: s.hardware.map((h) => [h.fasten, h.kind, h.name]), findings: checkAssembly(s).filter((f) => /^(fasten|frame\\.(nut|preload)|join\\.geometry|overlap)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) };
      if (${order}) { const { withPreload } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/slotnuts.mjs')).href)}), { orderOf } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/order.mjs')).href)}); out.order = withPreload(s, orderOf(s)); }
      console.log(JSON.stringify(out));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe(true);
    const by = (code, fasten) => r.findings.filter((x) => x.code === code && (fasten == null || x.refs?.fasten === fasten));
    // into a slot: the nut is the one made for the slot and thread, of the kind asked, two per plate with an M4x8 each
    assert.deepEqual(r.hardware.filter((h) => h[0] < 2), [[0, 'screw', 'M4x8 button'], [0, 'nut', 'slot-nut-6-misumi-m4-slide-in'], [0, 'screw', 'M4x8 button'], [0, 'nut', 'slot-nut-6-misumi-m4-slide-in'],
      [1, 'screw', 'M4x8 button'], [1, 'nut', 'slot-nut-6-misumi-m4-slide-in'], [1, 'screw', 'M4x8 button'], [1, 'nut', 'slot-nut-6-misumi-m4-slide-in']]);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access', 'overlap', 'join.geometry']) assert.deepEqual([...new Set(by(code).map((x) => x.level))], ['pass'], `${code}: ${JSON.stringify(by(code).filter((x) => x.level !== 'pass'))}`);
    assert.deepEqual(by('fasten.slot', 0).map((x) => [x.values.distance, x.values.play, x.values.along]), [[0, 0.3, 140], [0, 0.3, 160]]);
    assert.match(by('fasten.end', 0)[0].text, /ends in a slide-in nut under the lips of x1's top slot: slot-nut-6-misumi-m4-slide-in, 4\.1 mm of M4 thread from 1\.2 to 5\.3 mm under the face, the slot's floor at 6 mm/);
    // the length: 3 mm of plate and the 2 mm lip under the head, a hex nut's height of thread (3.2 mm), the tip off the floor
    assert.match(by('fasten.length', 0)[0].text, /M4x8 button chosen, the shortest sold that fits: 5 mm under its head \(plate and the slot's 2 mm lip\), 3\.8 mm into its nut, its tip 5 mm into the slot and 1 mm short of its floor/);
    assert.deepEqual(by('fasten.engagement', 0).map((x) => x.values), [{ engaged: 3.8, need: 3.2, turns: 5.4 }]);
    // x1's slot is closed at both ends by joins: the slide-in nuts fail frame.nut, which names the drop-in
    assert.deepEqual(by('frame.nut', 0).map((x) => [x.level, x.refs.joins, x.refs.alternative]), [['fail', [0, 1], 'slot-nut-6-misumi-m4-drop-in']]);
    assert.match(by('frame.nut', 0)[0].text, /2 slide-in nuts \(slot-nut-6-misumi-m4-slide-in\) go into x1's top slot at 140 and 160 mm, between x1's end a \(the blind join of x1\.a to p1\.back@120\) and x1's end b \(the blind join of x1\.b to p2\.front@120\), which close it at both ends: a slide-in nut goes in only from an open end\. slot-nut-6-misumi-m4-drop-in \(an M4 drop-in nut\) goes in through the opening anywhere: give "nut": "drop-in"/);
    // y1's slot: closed at its corner by a join and capped at the other end, so its two nuts go in before the corner is made
    assert.deepEqual(by('frame.nut', 1).map((x) => x.level), ['pass']);
    assert.deepEqual(by('frame.preload').map((x) => [x.level, x.values.nuts, x.refs.item, x.refs.join, x.refs.end]), [['info', 2, 'y1', 2, 'a']]);
    const load = 'load 2 × slot-nut-6-misumi-m4-slide-in into y1\'s top slot through its end a, for plate2, before the blind join of y1.a to p1.top@170 closes it (or through end b before foot goes on)';
    assert.equal(by('frame.preload')[0].text, `plate2 to y1.top: ${load}`);
    // the assembly order lists them at the step that makes that join: before y1 goes on (a frame's build page shows the frame's build instead)
    assert.deepEqual(r.order.steps.filter((st) => st.load).map((st) => [st.items, st.load]), [[['y1'], [load]]]);
    // cad order, a frame's build: x1's nuts would be shut in by its second join, so it is refused with the slot and the join
    assert.match(cad('order', 'frame/frame'), /frame\/frame: x1's top slot: 2 slide-in nuts \(slot-nut-6-misumi-m4-slide-in\) for plate would be shut in between the blind join of x1\.a to p1\.back@120 and the blind join of x1\.b to p2\.front@120: whichever of the two is made second shuts them in/);
    // with drop-ins, x1's plate passes frame.nut: they go in through the opening; cad list counts the nuts by name
    a.fasten[0].nut = 'drop-in'; write();
    r = probe();
    assert.deepEqual(by('frame.nut').map((x) => [x.refs.fasten, x.level]), [[0, 'pass'], [1, 'pass']]);
    assert.match(by('frame.nut', 0)[0].text, /2 drop-in nuts \(slot-nut-6-misumi-m4-drop-in\) go into x1's top slot through its opening, anywhere along it/);
    assert.match(cad('list', 'frame/frame'), /2 ×\s+slot-nut-6-misumi-m4-drop-in\s+.*plate to x1\.top/);
    // and with them, cad order loads y1's nuts on the step before the join that closes their slot
    assert.match(cad('order', 'frame/frame'), new RegExp(`\\d+\\. Load${load.slice(4).replace(/[().@×]/g, '\\$&')}: the next step makes that join\\n\\s+\\d+\\. y1 goes on, joined to p1`));
    // into a slot at a distance places the screws as a group: the plate's two screws at 140 and 160 mm, their middle at
    // 150, pass x1.top@150 (each held to it alone, both failed); 20 mm away fails once, with both screws' spread
    const placed = JSON.parse(JSON.stringify(a)); placed.fasten[0].nut = 'drop-in'; placed.fasten[0].into = 'x1.top@150'; write(placed); r = probe();
    assert.deepEqual(by('fasten.slot', 0).map((x) => x.level), ['pass', 'pass', 'pass']);
    assert.ok(by('fasten.slot', 0).some((x) => /the middle of its 2 screws \(140 to 160 mm from x1's end a\) is 150 mm along x1's top slot, where into says x1\.top@150$/.test(x.text)));
    placed.fasten[0].into = 'x1.top@170'; write(placed); r = probe();
    assert.deepEqual(by('fasten.slot', 0).filter((x) => x.level === 'fail').map((x) => [x.values.along, x.values.wanted, x.values.distance]), [[150, 170, 20]]);
    assert.match(by('fasten.slot', 0).find((x) => x.level === 'fail').text, /the middle of its 2 screws \(140 to 160 mm from x1's end a\) is 150 mm along x1's top slot, and into says x1\.top@170, 170 mm: 20 mm apart, where their holes give 0\.3 mm\. Move plate 20 mm along x1/);
    // one place written two ways: p1's own access hole at front@120 and the join's at front.1@120 are one hole, sized for
    // the button head's 3 mm key (m5.button_key), not a cap screw's 4 mm
    const twice = JSON.parse(JSON.stringify(a)); twice.fasten[0].nut = 'drop-in'; twice.items[0].beam.ops = [{ op: 'access', at: 'front@120', thread: 'M5', head: 'button', through: 'beam' }]; write(twice);
    assert.equal((cad('list', 'frame/frame').split('\n').find((l) => /\sp1$/.test(l)).match(/access Ø[\d.]+ at front/g) || []).length, 1);
    const sheetOf = cad('beams', 'frame/frame').match(/mark \w+ \([^)]*\bp1\b[^)]*\), 1:\d+: (\S+)/)[1], sheet = fs.readFileSync(path.join(ws, sheetOf), 'utf8');
    assert.match(sheet, /access hole Ø5\.3 mm in front\.1, 120 mm from end a \(80 from end b\), 14 mm deep \(through to the far side\) for a 3 mm key/);
    assert.doesNotMatch(sheet, /4 mm key/);
    // a plate 2.999 mm thick: the stack is said to a hundredth, never "4.999 mm under its head"
    const fine = JSON.parse(JSON.stringify(a)); fine.fasten[0].nut = 'drop-in'; fine.items[5].set = { thick: 2.999 }; write(fine); r = probe();
    assert.match(by('fasten.length', 0)[0].text, /M4x8 button chosen, the shortest sold that fits: 5 mm under its head \(plate and the slot's 2 mm lip\), 3\.8 mm into its nut/);
    // a plate drawn for slots 30 mm apart across a 2040's top face, whose slots are 20 mm apart: each screw 5 mm off
    const wide = JSON.parse(JSON.stringify(a));
    wide.items[2].beam.profile = '2040-misumi-hfs5'; wide.items[2].from = [0, 0, 10]; wide.items[2].to = [300, 0, 10]; wide.joins = [];
    wide.items[5] = { id: 'plate', object: 'plate', at: [150, 0, 20], rotate: [0, 0, 90], set: { pitch: 30 } };
    write(wide); r = probe();
    assert.deepEqual(by('fasten.slot', 0).map((x) => [x.level, x.values.distance, x.values.play]), [['fail', 5, 0.3], ['fail', 5, 0.3]]);
    assert.match(by('fasten.slot', 0)[0].text, /plate's hole is 5 mm off the centre line of x1's top\.[12] slot, where its 4\.6 mm hole lets an M4 screw move 0\.3 mm: the screw meets the face beside the slot, not its nut\. x1's top slots are 20 mm apart/);
    // a 4 mm plate: no sold M4 length has a nut's height of thread and stops short of the floor
    const thick = JSON.parse(JSON.stringify(a)); thick.items[5].set = { thick: 4 }; thick.items[5].at = [150, 0, 10]; thick.fasten.length = 1; write(thick);
    r = probe();
    assert.deepEqual(by('fasten.length', 0).map((x) => x.level), ['fail']);
    assert.match(by('fasten.length', 0)[0].text, /no M4 button screw is sold from 8\.4 to 9\.7 mm long, what 6 mm under its head \(plate and the slot's 2 mm lip\) leaves: 3\.2 mm in the nut and 0\.3 mm kept off the slot's floor \(M4x8 engages too little, M4x10 reaches the floor\)/);
    // M4x10 given: it reaches the floor
    thick.fasten[0].screw = 'M4x10 button'; write(thick); r = probe();
    assert.match(by('fasten.length', 0)[0].text, /M4x10 button reaches the slot's floor: with 6 mm under its head its tip goes 6 mm into x1's top slot, whose floor is 6 mm under the face/);
    // refused by name: a slot the face has not got, a kind not made for the thread, a slot nut's kind into a part
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); assert.match(cad('check', 'frame/frame'), pattern); };
    refused((b) => { b.fasten[0].into = 'x1.top.2'; }, /fasten 1: x1's top face has 1 slot: into names x1\.top\.1/);
    refused((b) => { b.fasten[0].screw = 'M5 button'; b.fasten[0].nut = 'drop-in'; }, /fasten 1: no M5 drop-in nut is made for profile-2020-misumi-hfs5's top face/);
    refused((b) => { b.fasten[0].nut = 'wing'; }, /fasten 1: into a slot, "nut" is the slot nut's kind, slide-in, drop-in/);
    refused((b) => { b.fasten[0].into = 'plate2'; }, /fasten 1: "nut" is true \(a hexagon nut\) or hex, square, lock \(got "drop-in"\): a drop-in nut goes in a beam's slot, so "into" names the slot \(x1\.top\)/);
    refused((b) => { b.fasten[0].into = 'x1.top@400'; }, /fasten 1: "top\.1@400" is past the end of/);
    write(); assert.match(cad('check', 'frame/frame'), /files match their schemas/);
  } finally { done(); }
});

test('a frame\'s build: a box goes from bars to square in numbered steps, its two sides built flat and squared by their diagonals, a slot\'s nuts loaded before the join that closes it, each join\'s torque; a nut two joins would shut in is refused with the slot and the join', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/box.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    object(ws, 'frame/plate', { uses: ['x1c'], variables: { pitch: t(20, 'Between the holes', 5, 60), thick: t(3, 'The plate', 2, 10), length: t(40, 'Its length', 20, 100) } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [v.length, 20, v.thick], center: [0, 0, v.thick / 2] })
  return v.ops.subtract(plate, ...[-1, 1].map((s) => v.fixings.hole('M4', { depth: v.thick, at: [s * v.pitch / 2, 0, v.thick] })))
}
`);
    object(ws, 'frame/cap', {}, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main () { return cuboid({ size: [20, 20, 3], center: [0, 0, 1.5] }) }
`);
    const pj = JSON.parse(fs.readFileSync(at('project.json'), 'utf8')); fs.writeFileSync(at('project.json'), JSON.stringify({ ...pj, material: 'PLA' }));
    // a 300 mm box of 2020, the kind chapter 16 builds: four posts, x rails at z 30 and 250, y rails at z 10 and 290,
    // every end blind-joined into a post; a foot and a cap on each post; a bracket on p1's back face above x3, on
    // slide-in nuts, and a plate on x1's top on drop-in nuts
    const P = { profile: '2020-misumi-hfs5' }, items = [], joins = [];
    [[10, 10], [290, 10], [290, 250], [10, 250]].forEach(([x, y], i) => items.push({ id: `p${i + 1}`, beam: P, from: [x, y, 0], to: [x, y, 300] }));
    for (const [n, y, pa, pb, z] of [['x1', 10, 'p1', 'p2', 30], ['x2', 250, 'p4', 'p3', 30], ['x3', 10, 'p1', 'p2', 250], ['x4', 250, 'p4', 'p3', 250]]) {
      items.push({ id: n, beam: P, from: [20, y, z], to: [280, y, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.back@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.front@${z}` });
    }
    for (const [n, x, pa, pb, z] of [['y1', 10, 'p1', 'p4', 10], ['y2', 290, 'p2', 'p3', 10], ['y3', 10, 'p1', 'p4', 290], ['y4', 290, 'p2', 'p3', 290]]) {
      items.push({ id: n, beam: P, from: [x, 20, z], to: [x, 240, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.top@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.bottom@${z}` });
    }
    for (let i = 1; i <= 4; i++) items.push({ id: `foot${i}`, object: 'cap', at: `p${i}.a` }, { id: `cap${i}`, object: 'cap', at: `p${i}.b` });
    items.push({ id: 'plate', object: 'plate', at: [150, 10, 40] }, { id: 'bracket', object: 'plate', at: [20, 10, 280], rotate: [0, 90, 0], set: { pitch: 16, length: 30 } });
    const fasten = [{ screw: 'M4 button', through: ['plate'], into: 'x1.top', holes: 'plate.body', nut: 'drop-in' }, { screw: 'M4 button', through: ['bracket'], into: 'p1.back', holes: 'bracket.body', nut: 'slide-in' }];
    const write = (nut = 'drop-in') => { fasten[0].nut = nut; fs.writeFileSync(file, JSON.stringify({ title: 'Box', kind: 'fit', items, joins, fasten })); };
    write();
    const text = cad('order', 'frame/box'), steps = text.split('\n').filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim());
    // from bars to square: cut, drill and tap, side 1 flat, squared; side 2 flat, squared; the y rails on side 1; side 2
    // on as one; the other two bays squared; then the rest. The bracket's nuts (272 and 288 mm up p1's back slot) go in
    // through end b once x3 is on: loaded through end a before x1, they would leave x3's head at 250 mm no way in, x1's
    // head at 30 mm closing end a and the nuts end b
    assert.match(text, /^frame\/box: from bars to a square frame\n/);
    assert.match(steps[0], /^1\. Cut the beams: .*4 × E at 260 mm, 4 × F at 220 mm \(kerf 3 mm, 10 mm off each bar's first end; cut each mark against one stop\)$/);
    assert.match(text, /profile-2020-misumi-hfs5: buy 1 × 4000 mm\n\s+bar 1, 4000 mm: .*; offcut 834/);
    assert.match(steps[1], /^2\. Drill and tap each mark as its sheet shows/);
    assert.match(text, /E \(x1, x2, x3, x4\): tap M5 x 18\.5 at a; tap M5 x 18\.5 at b: exports\/frame\/box\.beam-E\.svg/);
    assert.deepEqual(steps.slice(2, 8).map((l) => l.replace(/: (?!the next).*$/, '')), ['3. Side 1 (p1, p2, x1 and x3), built flat on the bench',
      '4. Side 1 (p1, p2, x1 and x3)', '5. Side 1 (p1, p2, x1 and x3)', '6. Side 1 (p1, p2, x1 and x3)',
      '7. Load 2 × slot-nut-6-misumi-m4-slide-in into p1\'s back slot through its end b, for bracket, before cap1 goes on', '8. Square side 1, then tighten its joins']);
    assert.match(steps[3], /x1 goes on, joined to p1$/); assert.match(steps[5], /x3 goes on, joined to p1 and p2$/);
    assert.match(steps[7], /measure both diagonals, inside corner to inside corner: each 328\.02 mm across the 260 × 200 mm opening; accept a difference of up to 0\.79 mm \(beams cut to ±0\.5 mm, every corner square\), about 0\.14° of lean\. Push the corners of the long diagonal together until the two are within that, then tighten each join to its torque and measure again$/);
    assert.match(steps[12], /^13\. Square side 2, then tighten its joins: /); assert.match(steps[17], /^18\. Side 2 goes on as one, joined to y2, y4, y1 and y3$/);
    assert.match(steps[18], /^19\. Square the frame, then tighten its joins: .*then tighten each join to its torque and measure again$/);
    assert.match(text, /p1, p4, y1 and y3: measure both diagonals, inside corner to inside corner: each 340\.59 mm across the 220 × 260 mm opening; accept a difference of up to 0\.76 mm/);
    assert.deepEqual(steps.slice(19).map((l) => l.replace(/^\d+\. /, '')), ['foot1, cap1 (cap) go on', 'bracket (plate) goes on', 'plate goes on', 'foot2, cap2, foot4, cap4, foot3, cap3 (cap) go on']);
    // each join's screw with its key and torque: the lips of the post's slot under the head take 3677 N on 17.9 mm²
    assert.match(text, /4\. Side 1 \(p1, p2, x1 and x3\): x1 goes on, joined to p1\n\s+blind join of x1\.a to p1\.back@30 \(1 × M5x12 button\) with a 3 mm hex key, to 3\.68 N m at most \(what the seat takes\)\n\s+Snug for now: tightened to its torque at step 8, once square\n/);
    assert.match(text, /Tightening, by kind of join:\n\s+blind \(16 joins, M5x12 button with a 3 mm hex key\): 3\.68 N m, at most/);
    const json = JSON.parse(cad('order', 'frame/box', '--json'));
    assert.deepEqual(json.frame.steps.map((x) => x.kind).join(' '), 'cut drill side join join join load square side join join join square join join join join join square mount mount mount mount');
    // x3 slides down the posts from their end b (z up), its heads clear of the nuts, which are not in yet
    assert.deepEqual(json.frame.steps[5].dir, [0, 0, 1]);
    // what each step shows: side 2 on the bench away from side 1, then the whole frame as side 2 goes on as one, along its posts
    const st = json.frame.steps;
    assert.deepEqual([st[0].shown, st[9].shown.sort(), st[9].now, st[12].shown.sort(), st[17].now, st[17].shown.length, st[17].dir.map(Math.abs)], [[], ['p3', 'x2'], ['x2'], ['p3', 'p4', 'x2', 'x4'], ['p3', 'p4', 'x2', 'x4'], 12, [0, 0, 1]]);
    assert.deepEqual(json.frame.notFlat, []);
    assert.deepEqual(json.frame.sides.map((x) => x.beams), [['p1', 'p2', 'x1', 'x3'], ['p3', 'p4', 'x2', 'x4']]);
    assert.deepEqual(json.frame.bays.map((x) => [x.beams.join(), x.width, x.height, x.square.diagonal, x.square.accept]), [['p1,p2,x1,x3', 260, 200, 328.02, 0.79], ['p1,p4,y1,y3', 220, 260, 340.59, 0.76], ['p2,p3,y2,y4', 220, 260, 340.59, 0.76], ['p3,p4,x2,x4', 260, 200, 328.02, 0.79]]);
    assert.deepEqual(json.frame.torques.map((x) => [x.kind, x.joins, x.torque]), [['blind', 16, 3.68]]);
    // on cad check: frame.square for each bay, and the seat under a blind join's head with what its lips take
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { buildData } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/buildpage.mjs')).href)});
      const { frameBuild, frameStepPictures } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/framebuild.mjs')).href)});
      const s = await buildAssembly('frame/box'), f = checkAssembly(s), page = (await buildData(s)).build, b = page.frame, pics = frameStepPictures(s, frameBuild(s));
      console.log(JSON.stringify({ order: page.order, pictures: pics.map((p) => p.n).join(), bench: [...new Set(pics.find((p) => p.n === 10).parts.map((p) => p.item))].sort(), moving: [...new Set(pics.find((p) => p.n === 10).parts.filter((p) => p.role === 'part').map((p) => p.item))], square: f.filter((x) => x.code === 'frame.square').map((x) => [x.level, x.refs.beams.join(), x.values.accept]), nut: f.find((x) => x.code === 'frame.nut' && /bracket/.test(x.text)).text, preload: f.find((x) => x.code === 'frame.preload').refs, steps: f.find((x) => x.code === 'assembly.order').values.steps, seat: f.find((x) => x.code === 'fasten.seat' && /x1\\.a/.test(x.text)), page: { steps: b.steps.length, bays: b.bays.map((x) => x.diagonal), torques: b.torques.length, stuck: b.stuck } }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // frame.nut and frame.preload name every closure on the nuts' way: both heads, and foot1 at end a beyond them
    assert.match(r.nut, /go into p1's back slot before a join closes its way, from end a, past 30 and 250 mm \(foot1 off until then\), before the first made of the blind join of x1\.a to p1\.back@30 and the blind join of x3\.a to p1\.back@250, each of which closes that way \(or through end b before cap1 goes on\) \(frame\.preload\)$/);
    assert.deepEqual([r.preload.joins, r.preload.way], [[4, 0], 'a']);
    assert.equal(r.steps, 23, 'cad check counts the frame build\'s steps');
    assert.deepEqual(r.square, [['info', 'p1,p2,x1,x3', 0.79], ['info', 'p1,p4,y1,y3', 0.76], ['info', 'p2,p3,y2,y4', 0.76], ['info', 'p3,p4,x2,x4', 0.79]]);
    assert.deepEqual([r.seat.level, r.seat.values.area, r.seat.values.limit, r.seat.values.torque], ['pass', 17.94, 205, 3.68]);
    assert.match(r.seat.text, /on al6n01-t5 \(205 MPa\) the 17\.9 mm² either side of the opening takes 3677 N, a tightening of 3\.68 N m \(the lips' bending not counted: an estimate\)/);
    assert.deepEqual(r.page, { steps: 23, bays: [328.02, 340.59, 340.59, 328.02], torques: 1, stuck: null });
    // the build page gives the frame's build as its one sequence (no assembly order beside it), and the pictures of cad
    // order --preview are numbered as its steps are: step 10 shows side 2 on the bench, x2 going on to p3
    assert.equal(r.order, null);
    assert.equal(r.pictures, '3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23');
    assert.deepEqual([r.bench, r.moving], [['p3', 'x2'], ['x2']]);
    // the plate on slide-in nuts: x1's slot is closed by a join at each end, so whichever is made second shuts them in
    write('slide-in');
    const refused = spawnSync(process.execPath, [BIN, 'order', 'frame/box'], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } });
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout.trim(), 'frame/box: x1\'s top slot: 2 slide-in nuts (slot-nut-6-misumi-m4-slide-in) for plate would be shut in between the blind join of x1.a to p1.back@30 and the blind join of x1.b to p2.front@30: whichever of the two is made second shuts them in, and a nut loaded before it can never be taken out or replaced: give "nut": "drop-in" (slot-nut-6-misumi-m4-drop-in), which goes in through the opening anywhere');
    const stuck = JSON.parse(cad('order', 'frame/box', '--json')).frame.stuck;
    assert.deepEqual([stuck.item, stuck.place, stuck.joins, stuck.alternative], ['x1', 'top.1', [0, 1], 'slot-nut-6-misumi-m4-drop-in']);
    // every screw reached in the frame's own order: with x3 lowered to 70 mm it stands 15 mm over the plate's screws on
    // x1, so the plate goes on while side 1 is built, before x3, not with the rest at the end
    write();
    const base = JSON.parse(fs.readFileSync(file, 'utf8')), low = JSON.parse(JSON.stringify(base)), x3 = low.items.find((i) => i.id === 'x3');
    x3.from[2] = x3.to[2] = 70; low.joins = low.joins.map((j) => (j.a.startsWith('x3.') ? { ...j, b: j.b.replace('@250', '@70') } : j));
    fs.writeFileSync(file, JSON.stringify(low));
    const lowSteps = cad('order', 'frame/box').split('\n').filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim().replace(/^\d+\. /, ''));
    assert.match(lowSteps[lowSteps.findIndex((l) => /^plate goes on$/.test(l)) + 1], /^Side 1 \(p1, p2, x1 and x3\): x3 goes on, joined to p1 and p2$/);
    // cad check counts the frame's build, and fasten.access names x3's step as cad order numbers it; where the build is
    // refused (the plate on slide-in nuts), it names no step of a build that is never printed
    const lowCheck = cad('check', 'frame/box'), x3Step = lowSteps.findIndex((l) => /x3 goes on/.test(l)) + 1;
    assert.match(lowCheck, new RegExp(`✓ goes together in ${lowSteps.length} steps from bars to a square frame \\(cad order\\), p1 first`));
    assert.match(lowCheck, new RegExp(`plate to x1\\.top, 2 M4 button screws: a 2\\.5 mm hex key reaches the head before x3 \\(step ${x3Step}\\) goes on over it`));
    low.fasten[0].nut = 'slide-in'; fs.writeFileSync(file, JSON.stringify(low));
    const lowRefused = cad('check', 'frame/box');
    assert.match(lowRefused, /plate to x1\.top, 2 M4 button screws: a 2\.5 mm hex key reaches the head before x3 goes on over it/);
    assert.match(lowRefused, /✗ no build from bars to a square frame: x1's top slot: 2 slide-in nuts/);
    // a side goes on as one only where its joins let it: a middle rail m from x3 to x4 puts a head in x4's slot, which runs
    // across the posts' slots that the y rails' heads slide along, so side 2 is built on the frame beam by beam, and says why
    const mid = JSON.parse(JSON.stringify(base));
    mid.items.push({ id: 'm', beam: P, from: [150, 20, 250], to: [150, 240, 250] });
    mid.joins.push({ kind: 'blind', a: 'm.a', b: 'x3.back@130' }, { kind: 'blind', a: 'm.b', b: 'x4.front@130' });
    fs.writeFileSync(file, JSON.stringify(mid));
    const midText = cad('order', 'frame/box'), midJson = JSON.parse(cad('order', 'frame/box', '--json')).frame;
    assert.deepEqual(midJson.sides.map((x) => x.beams), [['p1', 'p2', 'x1', 'x3']]);
    assert.deepEqual(midJson.notFlat.map((x) => x.beams), [['p3', 'p4', 'x2', 'x4']]);
    assert.match(midJson.notFlat[0].why, /^the heads of its joins to the frame go into slots that run different ways \(the blind join of \w+\.b to p\d\.bottom@\d+ along p\d, the blind join of m\.b to x4\.front@130 along x4\), so they can't all slide in as it goes on$/);
    assert.match(midText, /The bay of p3, p4, x2 and x4 is built on the frame, not flat: the heads/);
    // m's heads go into x3's and x4's slots, each closed at both ends once its beam is joined: each screw is slid into its
    // slot from an end before that beam goes on, and m's join made with it in place (x4's slot runs across the way x4
    // goes on, down p4's slot, too)
    assert.match(midText, /\d+\. Slide an M5x12 button screw into x3's back slot head first, through its end a, to 130 mm, for the blind join of m\.a to x3\.back@130, before the blind join of x3\.a to p1\.back@250 is made: that join is made with it in place, the screw turned into m's end through the access hole\n\s+\d+\. Side 1 \(p1, p2, x1 and x3\): x3 goes on/);
    const midSteps = midText.split('\n').filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim().replace(/^\d+\. /, '')), x4At = midSteps.indexOf('x4 goes on, joined to p4 and m');
    assert.match(midSteps[x4At - 1], /^Slide an M5x12 button screw into x4's front slot head first, through its end a, to 130 mm, for the blind join of m\.b to x4\.front@130, /);
    assert.doesNotMatch(midText, /Side 2/);
  } finally { done(); }
});

test('a screw\'s way: the anchor\'s axis is turned for a tie only where the part is astride what it is screwed into', async () => {
  const { screwFlips } = await import('./lib/fasten.mjs');
  // a saddle's legs either side of a beam, centred on it: the tie the guides' holders make, the axis turned
  assert.equal(screwFlips([-15, 15], [-10, 10]), true);
  // a tie any other way keeps the axis as it was before that rule: a part within the other's reach, or level with it
  assert.equal(screwFlips([-5, 5], [-10, 10]), false);
  assert.equal(screwFlips([-10, 10], [-10, 10]), false);
  // no tie: toward the far part, as ever
  assert.equal(screwFlips([0, 3], [3, 10]), false); assert.equal(screwFlips([3, 10], [0, 3]), true);
});

test('printed fittings: a bracket join with "fitting": "printed" adds a printed corner bracket on the side with room, its two screws into slot nuts, its grams on the list and its own stiffness', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/corner.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // y1 stands on x1's top face 100 mm from its end a; a printed bracket holds it
    const a = { title: 'Corner', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [100, 0, 10], to: [100, 0, 210] }],
      joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting: 'printed' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/corner'), id = s.items.find((i) => i.fitting)?.id, br = s.parts.filter((p) => p.item === id), o = s.objects.find((x) => x.id === id);
      const lo = [0, 1, 2].map((k) => Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))), hi = [0, 1, 2].map((k) => Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))));
      console.log(JSON.stringify({ items: s.items.map((i) => [i.id, i.role]), box: [lo, hi].map((v) => v.map((x) => +x.toFixed(2))), fitting: o && { name: o.fitting.name, thickness: o.fitting.thickness, leg: o.fitting.leg, bending: o.fitting.stiffness.bending, grams: o.fitting.grams, margin: o.fitting.margin },
        hardware: s.hardware.map((h) => [h.fasten, h.kind, h.name]), findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame|fitting)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe();
    const by = (code) => r.findings.filter((x) => x.code === code);
    assert.deepEqual(by('fitting.margin').map((x) => [x.level, x.values.load, x.refs.item]), [['pass', 100, 'y1-x1-bracket']]);
    // the bracket is an item of its own, a printed part, on the side of y1 with more of x1 (toward x1's end b)
    assert.deepEqual(r.items, [['x1', 'reference'], ['y1', 'reference'], ['y1-x1-bracket', 'part']]);
    assert.deepEqual(r.fitting, { name: 'bracket-2020-misumi-hfs5-m5', thickness: 6.4, leg: 24, bending: r.fitting.bending, grams: r.fitting.grams, margin: r.fitting.margin });
    assert.ok(r.fitting.margin >= 2 && r.fitting.grams > 0 && r.fitting.bending > 0);
    // its corner on y1's back face (x = 110) and x1's top (z = 10), its legs 24 mm along each, its tongues 1 mm into the slots
    assert.deepEqual(r.box, [[109, -10, 9], [134, 10, 34]]);
    // two screws, one into each beam's slot, each into a slide-in nut, the length it was thickened for
    assert.deepEqual(r.hardware, [[0, 'screw', 'M5x12 cap'], [0, 'nut', 'slot-nut-6-misumi-m5-slide-in'], [1, 'screw', 'M5x12 cap'], [1, 'nut', 'slot-nut-6-misumi-m5-slide-in']]);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access', 'overlap', 'join.geometry', 'frame.nut']) assert.deepEqual([...new Set(by(code).map((x) => x.level))], ['pass'], `${code}: ${JSON.stringify(by(code).filter((x) => x.level !== 'pass'))}`);
    assert.deepEqual(by('fasten.slot').map((x) => x.values.along), [128.05, 18.05]);
    assert.match(by('fasten.length')[0].text, /M5x12 cap chosen, the shortest sold that fits: 8\.4 mm under its head \(y1-x1-bracket and the slot's 2 mm lip\), 4\.1 mm into its nut, its tip 5\.6 mm into the slot and 0\.4 mm short of its floor/);
    // the join's stiffness is the bracket's own by finite elements now, and still says what it leaves out
    assert.deepEqual(by('join.stiffness').map((x) => [x.values.bending, x.refs.item]), [[r.fitting.bending, 'y1-x1-bracket']]);
    assert.match(by('join.stiffness')[0].text, /y1-x1-bracket's own by finite elements \(\d+(\.\d+)? N\/mm at its screw under 100 N, [\d.]+ times under its plastic's strength, [\d.]+ g\).*until the joint rig \(issue 264\) measures it/);
    assert.deepEqual(by('join.fitting'), []);
    // cad check says the bracket's own findings too: its margin at the named load, its mass, the screw it was thickened for
    const check = cad('check', 'frame/corner');
    assert.match(check, /y1-x1-bracket: under 100 N across beam a at the upright's screw, 18\.05 mm from the corner, opening or closing it, the stress peaks at [\d.]+ MPa away from the screws, [\d.]+ times under PLA's 39 MPa \(within the 2× asked\)/);
    assert.match(check, /y1-x1-bracket: it weighs [\d.]+ g of pla/); assert.match(check, /y1-x1-bracket: M5x12 cap: through 6\.4 mm of fitting/);
    // cad list: the printed bracket by its grams, the two screws and nuts
    const list = cad('list', 'frame/corner');
    assert.match(list, /Printed \(pla\)\s+[\d.]+ g\s+about \d+ min\s+y1-x1-bracket \(fitting:bracket-2020-misumi-hfs5-m5\)/);
    assert.match(list, /2 ×\s+M5x12 cap/); assert.match(list, /2 ×\s+slot-nut-6-misumi-m5-slide-in/);
    // y1 near x1's end b: the bracket goes on y1's other side, toward x1's end a
    a.items[1].from = [250, 0, 10]; a.items[1].to = [250, 0, 210]; a.joins[0].b = 'x1.top@250'; write();
    r = probe();
    assert.deepEqual(r.box, [[216, -10, 9], [241, 10, 34]]);
    assert.deepEqual(r.findings.filter((x) => x.level === 'fail'), []);
    // braced: the same screws, a stiffer bracket, every check still passing
    a.items[1].from = [100, 0, 10]; a.items[1].to = [100, 0, 210]; a.joins[0].b = 'x1.top@100'; a.joins[0].brace = true; write();
    const braced = probe();
    assert.equal(braced.fitting.name, 'bracket-2020-misumi-hfs5-m5-braced'); assert.ok(braced.fitting.bending > 1.5 * r.fitting.bending, `${braced.fitting.bending} against ${r.fitting.bending}`);
    assert.deepEqual(braced.findings.filter((x) => x.level === 'fail').map((x) => x.text), []);
    // the same join on 4040: the same generator, M8 into roll-in nuts; each head's seat whole out to its 13 mm (the
    // hole under it is round to its top, its roof cut flat), every check passing
    write({ ...a, items: [{ id: 'x1', beam: { profile: '4040-item-8' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '4040-item-8' }, from: [100, 0, 20], to: [100, 0, 220] }], joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting: 'printed' }] });
    const big = probe();
    assert.deepEqual([big.fitting.name, big.hardware.map((h) => h[2])], ['bracket-4040-item-8-m8', ['M8x20 cap', 'slot-nut-8-i-motedis-m8-roll-in', 'M8x20 cap', 'slot-nut-8-i-motedis-m8-roll-in']]);
    assert.deepEqual(big.findings.filter((x) => x.level === 'fail').map((x) => x.text), []);
    assert.deepEqual(big.findings.filter((x) => x.code === 'fasten.seat').map((x) => x.level), ['pass', 'pass']);
    // a bought bracket still waits for its release, and says the printed one is there
    write({ ...a, joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting: 'bought' }] });
    r = probe();
    assert.deepEqual([r.items.length, r.hardware, by('join.fitting').map((x) => x.level)], [2, [], ['warn']]);
    assert.match(by('join.fitting')[0].text, /A printed one is drawn now: give "fitting": "printed"/);
    // refused by name: a brace on a join with no printed fitting, a bracket with no room on a short beam
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); assert.match(cad('check', 'frame/corner'), pattern); };
    refused((b) => { b.joins = [{ kind: 'blind', a: 'y1.a', b: 'x1.top@100', brace: true }]; }, /join 1: brace is for a printed fitting: give "fitting": "printed" on a bracket, gusset, splice join, or leave brace out/);
    refused((b) => { b.items[0].to = [40, 0, 0]; b.items[1].from = [20, 0, 10]; b.items[1].to = [20, 0, 210]; b.joins[0] = { kind: 'bracket', a: 'y1.a', b: 'x1.top@20', fitting: 'printed' }; }, /join 1: a printed bracket's 24 mm leg runs 14 mm past x1's end b: it goes on the side of y1 with more of x1, and there is only 10 mm there/);
    write();
    assert.match(cad('check', 'frame/corner'), /files match their schemas/);
  } finally { done(); }
});

test('printed fittings: a gusset join puts an L plate on a corner and a T where b runs on both sides, a splice join a plate across two ends, each screwed into both beams\' slots', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/plates.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    // y1 stands on x1's top face at its end a: a corner, so an L gusset on the faces that look along -y
    const a = { title: 'Plates', kind: 'fit', items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [10, 0, 10], [10, 0, 210])], joins: [{ kind: 'gusset', a: 'y1.a', b: 'x1.top@10', fitting: 'printed' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/plates'), o = s.objects.find((x) => x.fitting), br = s.parts.filter((p) => p.item === o.id);
      const lo = [0, 1, 2].map((k) => Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))), hi = [0, 1, 2].map((k) => Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))));
      console.log(JSON.stringify({ id: o.id, fitting: { name: o.fitting.name, shape: o.fitting.shape, thickness: o.fitting.thickness, arm: o.fitting.arm }, box: [lo, hi].map((v) => v.map((x) => +x.toFixed(2))),
        hardware: s.hardware.map((h) => h.kind + ' ' + h.name), findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame)/.test(f.code)).map(({ level, code, text, values }) => ({ level, code, text, values })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const clean = (r) => r.findings.filter((x) => x.level === 'fail').map((x) => x.text);
    write(); let r = probe();
    assert.deepEqual([r.id, r.fitting.shape, r.fitting.name], ['y1-x1-gusset', 'L', 'gusset-l-2020-misumi-hfs5-m5']);
    assert.deepEqual(clean(r), []);
    // on the -y faces of both (x1's front, y1's bottom), the corner square over where they meet (x 0 to 20, z -10 to 10),
    // an arm along each, its tongues 1 mm into the slots
    assert.deepEqual(r.box, [[0, -10 - r.fitting.thickness, -10], [20 + r.fitting.arm, -9, 10 + r.fitting.arm]]);
    assert.equal(r.hardware.filter((h) => h.startsWith('screw')).length, 4); assert.equal(r.hardware.filter((h) => h.startsWith('nut')).length, 4);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.length', 'fasten.engagement', 'overlap', 'join.geometry']) assert.ok(r.findings.some((x) => x.code === code && x.level === 'pass'), code);
    // in the middle of x1, a T: three arms, six screws
    a.items[1] = beam('y1', [150, 0, 10], [150, 0, 210]); a.joins[0].b = 'x1.top@150'; write(); r = probe();
    assert.deepEqual([r.fitting.shape, r.hardware.filter((h) => h.startsWith('screw')).length, clean(r)], ['T', 6, []]);
    // a splice: two beams end to end, a plate across the joint, two screws into each
    write({ title: 'Plates', kind: 'fit', items: [beam('x1', [0, 0, 0], [150, 0, 0]), beam('x2', [150, 0, 0], [300, 0, 0])], joins: [{ kind: 'splice', a: 'x2.a', b: 'x1.b', fitting: 'printed' }] }); r = probe();
    assert.deepEqual([r.id, r.fitting.name, r.hardware.filter((h) => h.startsWith('screw')).length, clean(r)], ['x2-x1-splice', 'splice-2020-misumi-hfs5-m5', 4, []]);
    assert.equal(r.box[0][0], 150 - r.fitting.arm); assert.equal(r.box[1][0], 150 + r.fitting.arm);
    // refused by name: a gusset with no room on a short beam
    write({ ...a, items: [beam('x1', [0, 0, 0], [30, 0, 0]), beam('y1', [10, 0, 10], [10, 0, 210])], joins: [{ kind: 'gusset', a: 'y1.a', b: 'x1.top@10', fitting: 'printed' }] });
    assert.match(cad('check', 'frame/plates'), /join 1: a printed gusset's [\d.]+ mm arm runs past x1's ends: there is 10 mm beside y1, and it needs [\d.]+\. A bracket will do/);
  } finally { done(); }
});

test('panels and doors: a bay closed with a 3 mm panel lists the panel\'s size and its clips; a door on two hinges opens as a joint without hitting the frame', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    // a 400 x 300 mm bay in the x-z plane, its slotted faces looking along -y
    const frame = [beam('x1', [0, 0, 0], [400, 0, 0]), beam('x2', [0, 0, 300], [400, 0, 300]), beam('z1', [10, 0, 10], [10, 0, 290]), beam('z2', [390, 0, 10], [390, 0, 290])];
    const write = (name, panel) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', items: [...frame, { id: name === 'bay' ? 'front' : 'door', panel: { sheet: 'acrylic', thickness: 3, bay: ['x1', 'z2', 'x2', 'z1'], out: [0, -1, 0], ...panel } }] }));
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/${name}'), box = (id) => { const br = s.parts.filter((p) => p.item === id); return [0, 1, 2].map((k) => [Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))), Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))].map((x) => +x.toFixed(2))); };
      console.log(JSON.stringify({ panels: s.panels.map((p) => ({ id: p.id, size: p.size, items: p.items, grams: p.model.grams, holes: p.model.holes.length })), boxes: Object.fromEntries(s.items.filter((i) => i.fitting || i.panel).map((i) => [i.id, box(i.id)])),
        joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses), hardware: s.hardware.map((h) => h.kind + ' ' + h.name),
        findings: checkAssembly(s).filter((f) => f.level === 'fail' || f.level === 'warn').map((f) => f.code + ': ' + f.text) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // the bay closed: the panel cut to it, 6.5 mm in from each slot's line (the clip's edge), 14 clips at no more than 150 mm
    write('bay', {});
    let r = probe('bay');
    assert.deepEqual(r.panels.map((p) => [p.id, p.size, p.items.length]), [['front', [367, 287], 14]]);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.boxes.front, [[16.5, 383.5], [-13, -10], [6.5, 293.5]], 'on the faces, 3 mm thick');
    assert.deepEqual(r.boxes['front-clip'], [[24.5, 44.5], [-14.4, -9], [-6, 12.5]], 'a clip over its edge, keyed 1 mm into x1\'s slot');
    assert.equal(r.hardware.filter((h) => h === 'screw M5x10 button').length, 14);
    const list = cad('list', 'frame/bay');
    assert.match(list, /1 ×\s+acrylic sheet, 3 mm cut 367 x 287 mm\s+a panel\s+376 g each\s+front/);
    assert.match(list, /14 ×\s+M5x10 button/); assert.match(list, /14 ×\s+slot-nut-6-misumi-m5-slide-in/);
    assert.match(list, /1\.5 g\s+about \d+ min\s+front-clip-14 \(fitting:panel-clip-2020-misumi-hfs5-m5-3mm\)/);
    const checked = cad('check', 'frame/bay');
    assert.match(checked, /front: 367 x 287 mm of 3 mm cast acrylic \(PMMA\) sheet, its corners rounded 1 mm: 376\.02 g; held by 14 clips/);
    assert.match(checked, /files match their schemas/);
    // a wider pitch, fewer clips
    write('bay', { pitch: 400 }); r = probe('bay');
    assert.equal(r.panels[0].items.length, 8);
    // the door: on two hinges along z1, a revolute from shut to 120°, standing 10.2 mm off the faces
    write('door', { door: { hinge: 'z1' } });
    r = probe('door');
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.joints, [['door-hinge', 'revolute', [0, 120, 0]]]); assert.deepEqual(r.poses, ['door-shut', 'door-open']);
    assert.deepEqual(r.panels[0].items, ['door-hinge-1', 'door-leaf-1', 'door-hinge-2', 'door-leaf-2', 'door-handle', 'door-catch']);
    assert.deepEqual([r.panels[0].size, r.panels[0].holes], [[377.9, 286], 6]);
    assert.deepEqual(r.boxes.door[1], [-23.2, -20.2], 'the door 10.2 mm off the faces');
    const swept = cad('check', 'frame/door', '--sweep', '--steps', '24');
    assert.match(swept, /sweep door-hinge, 0 to 120° in 24 steps: nothing collides/);
    assert.doesNotMatch(swept, /✗/);
    const dl = cad('list', 'frame/door');
    assert.match(dl, /2 ×\s+M4x40 cap/); assert.match(dl, /2 ×\s+M4 lock nut/); assert.match(dl, /1 ×\s+10 x 3 mm disc magnet/); assert.match(dl, /acrylic sheet, 3 mm cut 377\.9 x 286 mm/);
    // with its turn-button latch shut over the door, the sweep finds the door can't open: it lifts into the tab within
    // its first degree, so the sweep also tries it 0.5° off shut, finer than its 5° steps (which jump past the tab)
    write('door', { door: { hinge: 'z1', latch: true } });
    assert.match(cad('check', 'frame/door', '--sweep', '--steps', '24'), /✗ sweep door-hinge, 0 to 120° in 24 steps \(door-latch shut over door: also tried 0\.5° off shut\): at 0\.5°: door\.body hits door-latch\.body/);
    write('door', { door: { hinge: 'z1', latch: true, open: 4 } });
    assert.match(cad('check', 'frame/door', '--sweep', '--steps', '8'), /sweep door-hinge, 0 to 4° in 8 steps \(door-latch shut over door: also tried 0\.5° off shut\): 0\.5 to 1°: door\.body hits door-latch\.body/);
    // refused by name
    write('door', { door: { hinge: 'y9' } });
    assert.match(cad('check', 'frame/door'), /door\.hinge is the beam of the bay its hinges go on, one of x1, z2, x2, z1 \(got "y9"\)/);
    write('bay', { out: [0, 0, 1] });
    assert.match(cad('check', 'frame/bay'), /z2 runs across the bay's plane, not in it: its beams lie square to out/);
    fs.writeFileSync(at('assemblies/bay.json'), JSON.stringify({ title: 'bay', kind: 'fit', items: [...frame, { id: 'front', panel: { sheet: 'acrylic', thickness: 3, bay: ['x1', 'z2', 'x2', 'x2'], out: [0, -1, 0] } }] }));
    assert.match(cad('check', 'frame/bay'), /bay is four different beams/);
  } finally { done(); }
});

test('printed fittings in a project of another plastic: refused by name where no rule set gives its strength, modulus and density, and sized from it where one does', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'ABS', objects: [] }));
    fs.writeFileSync(at('assemblies/clip.json'), JSON.stringify({ title: 'clip', kind: 'fit', items: [{ id: 'rail', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [200, 0, 0] }, { id: 'c', fitting: { kind: 'cable-clip', profile: '2020-misumi-hfs5' }, at: 'rail.top@100' }] }));
    // once sized as PLA without a word; now refused by name, with what would do
    assert.match(cad('check', 'frame/clip'), /project frame: its material is "ABS", and printed fittings are sized from their plastic's strength, modulus and density: the kit has pla and petg, and there is no rules\/abs\.json\. Give rules\/abs\.json with all three, or set the material to pla or petg/);
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    const pla = JSON.parse(fs.readFileSync(path.join(ROOT_MODULES, '@rulecad/rules/pla.json'), 'utf8'));
    fs.writeFileSync(path.join(ws, 'rules/abs.json'), JSON.stringify({ name: 'abs', rules: { strength: pla.rules.strength } }));
    assert.match(cad('check', 'frame/clip'), /rules\/abs\.json gives no modulus, density/);
    fs.writeFileSync(path.join(ws, 'rules/abs.json'), JSON.stringify({ name: 'abs', rules: { ...pla.rules, density: { ...pla.rules.density, value: 1.04 } } }));
    assert.match(cad('check', 'frame/clip'), /c: it weighs 0\.43 g of abs/);
  } finally { done(); }
});

test('bought fittings: the hinge set gives its screws, an anchor at each (b1, b2 the frame leaf\'s, a1, a2 the door leaf\'s), so a fasten screws its frame leaf into a slot and the list counts them', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // the frame leaf's two holes over x1's top slot line, the pin 11.5 mm off it
    fs.writeFileSync(at('assemblies/hinge.json'), JSON.stringify({ title: 'hinge', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-motedis-b6' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'h', bought: 'fitting-motedis-hinge-20', at: [100, -11.5, 10], rotate: [0, 0, 90] }],
      fasten: [{ screw: 'M4 button', through: ['h'], into: 'x1.top', at: ['h.b1', 'h.b2'], nut: 'hammer' }] }));
    const c = cad('check', 'frame/hinge');
    assert.doesNotMatch(c, /^\s+✗ /m);
    assert.match(c, /h to x1\.top, 2 M4 button screws: M4x10 button chosen, the shortest sold that fits/);
    assert.match(c, /h to x1\.top, 2 M4 button screws: h's hole measures 4\.5 mm, an M4 clearance hole as drawn/);
    const l = cad('list', 'frame/hinge');
    assert.match(l, /2 ×\s+M4x10 button/); assert.match(l, /2 ×\s+slot-nut-6-motedis-m4-hammer/); assert.match(l, /1 ×\s+fitting-motedis-hinge-20\s+a fitting/);
  } finally { done(); }
});

test('a table fastened to a guide\'s carriage by a fit, but placed where it stands, is said to be left behind by name; placed on the carriage it moves with it and its mass is carried', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    const write = (at) => fs.writeFileSync(path.join(ws, 'projects/frame/assemblies/table.json'), JSON.stringify({ title: 'Table', kind: 'fit', gravity: [0, 0, -1],
      items: [beam('p1', [-10, 0, -120], [-10, 0, 80]), beam('p2', [310, 0, -120], [310, 0, 80]), beam('x1', [0, 0, 0], [300, 0, 0]), { id: 'table', bought: 'supply-24v', variant: 'LRS-50-24', at }],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'p1.back@120' }, { kind: 'blind', a: 'x1.b', b: 'p2.front@120' }],
      guides: [{ kind: 'rods', on: 'x1.top', from: 50, length: 200, spacing: 40, height: 22.5, nut: 'drop-in' }],
      fits: [{ a: 'table', b: 'g1-carriage-1', fastens: true }] }));
    // placed where it stands: it would stay behind as the carriage slides, its 340 g not carried; said by name
    write([150, 0, 80]);
    const left = cad('check', 'frame/table');
    assert.match(left, /! table is fastened to g1-carriage-1 \(a fit that fastens\), but only g1-carriage-1 moves on g1-1: table is placed where it stands, so it stays there in every pose and its mass is left out of what g1-1 carries \(joint\.moment\)\. Place table on g1-carriage-1 by an anchor or an address/);
    assert.match(left, /g1-carriage-1 on g1: 59 g carried/);
    // placed on the carriage: it moves with it, its mass carried, and nothing is said
    write('g1-carriage-1.top');
    const on = cad('check', 'frame/table');
    assert.doesNotMatch(on, /is fastened to g1-carriage-1/); assert.match(on, /g1-carriage-1 on g1: 399 g carried/);
  } finally { done(); }
});

test('panels and ends as items by hand: an end cap (its pegs left out of the overlap check) and a foot at a beam\'s ends, a panel corner on a face, and an in-slot panel edge and a slot cover, whose share in the slot the overlap check leaves out', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const P = '2020-misumi-hfs5';
    fs.writeFileSync(at('assemblies/ends.json'), JSON.stringify({ title: 'ends', kind: 'fit', items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 0], to: [300, 0, 0] },
      { id: 'cap', fitting: { kind: 'end-cap', profile: P }, at: 'x1.a' }, { id: 'ft', fitting: { kind: 'foot', profile: P }, at: 'x1.b' },
      { id: 'pc', fitting: { kind: 'panel-corner', profile: P, sheet: 3 }, at: 'x1.top@100' },
      { id: 'pe', fitting: { kind: 'panel-edge', profile: P, sheet: 3, length: 100 }, at: 'x1.front@150' }, { id: 'sc', fitting: { kind: 'slot-cover', profile: P, length: 100 }, at: 'x1.back@20' }] }));
    // nothing overlaps: the end cap's pegs stand in x1's slots and bore (fittings.mjs TONGUED: without it they overlap
    // the beam's envelope), the edge and the cover lie in the slots, measured above the face alone
    const c = cad('check', 'frame/ends');
    assert.match(c, /✓ no parts overlap \(6 object instances\)/); assert.doesNotMatch(c, /^\s+✗ /m);
    assert.match(c, /cap: it weighs [\d.]+ g of pla/); assert.match(c, /ft: M5x16 cap into the end's tapped bore/); assert.match(c, /pe: printed in-slot edge for a 3 mm sheet/);
  } finally { done(); }
});

test('services: the worked arm\'s shield and supply mount on a rail from their own rule sets, and its power wire runs along a slot, its length and its clips reported', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/rack', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'rack', material: 'PLA', objects: [] }));
    // the arm's own shield, supply and power wire (examples/bench arm/arm), on a 400 mm rail of 2020
    const arm = JSON.parse(fs.readFileSync(path.join(path.dirname(ROOT_MODULES), 'examples/bench/projects/arm/assemblies/arm.json'), 'utf8')), mine = (id) => { const { at: _at, ...it } = arm.items.find((x) => x.id === id); return it; };
    const power = arm.wires.find((w) => w.id === 'power');
    const write = (items, wires = [{ ...power, via: [{ along: 'rail.front', from: 300, to: 60 }] }]) => fs.writeFileSync(at('assemblies/rack.json'), JSON.stringify({ title: 'rack', kind: 'fit',
      items: [{ id: 'rail', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [400, 0, 0] }, ...items], wires }));
    write([{ ...mine('shield'), mount: { on: 'rail.top@100' } }, { ...mine('psu'), mount: { on: 'rail.top@-90' } }]);
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('rack/rack'), f = checkAssembly(s);
      console.log(JSON.stringify({ mounts: s.mounts, runs: s.runs, hardware: s.hardware.map((h) => h.kind + ' ' + h.name), at: Object.fromEntries(s.items.filter((i) => ['shield', 'psu'].includes(i.id)).map((i) => [i.id, i.at])),
        bad: f.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.code + ': ' + x.text), said: f.filter((x) => /^(service\\.mount|wire\\.(run|length)|fitting\\.(device|head))$/.test(x.code) || (/^fasten\\.(end|length|engagement)$/.test(x.code) && /on its mount/.test(x.text))).map((x) => x.code + ': ' + x.text) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // each device on its printed mount at its address, the mount listed just before it, the device placed by the mount
    assert.deepEqual(r.mounts.map((m) => [m.id, m.mount, m.set, m.variant, m.fix, m.holes, m.thread, m.length]), [['shield', 'shield-mount', 'cnc-shield-v3', null, 'through', 4, 'M2.5', 8], ['psu', 'psu-mount', 'supply-24v', 'LRS-50-24', 'tapped', 2, 'M3', 5]]);
    assert.deepEqual(r.at, { shield: 'shield-mount.device', psu: 'psu-mount.device' });
    // the supply: into its own thread no further than Mean Well's L = 3 mm; the board: the Uno's 3.2 mm holes, M2.5 caps whose heads sit whole
    const said = r.said.join('\n');
    assert.match(said, /fasten\.length: psu on its mount, from under it, 2 M3 button screws: M3x5 button chosen, the longest sold that goes no further than its maker allows: 2 mm under its head and 3 mm into psu/);
    assert.match(said, /fasten\.engagement: psu on its mount, from under it, 2 M3 button screws: 3 mm into psu's own thread, 6 turns: as far as its maker allows \(supply-24v\.mount_hole_reach, 3 mm\)/);
    assert.match(said, /fasten\.length: shield on its mount, 4 M2\.5 cap screws: M2\.5x8 cap chosen/);
    assert.match(said, /service\.mount: psu: on a printed mount \(psu-mount\) at rail\.top@-90, held by its 2 tapped M3 holes from supply-24v's rule set/);
    // the wire: 240 mm of it along the front slot, four clips no more than 100 mm apart, its length through them
    assert.deepEqual(r.runs.map((x) => [x.wire, x.along, x.length, x.count, x.pitch]), [['power', 'rail.front.1', 240, 4, 80]]);
    assert.match(said, /wire\.run: power: 240 mm along rail\.front\.1 from 300 to 60 mm, held by 4 cable clips 80 mm apart \(no more than 100\) for a 6 mm bundle/);
    assert.match(said, /wire\.length: power: psu\.terminals to shield\.top, \d+ mm with its 40 mm loop .*; 240 mm of it along rail\.front\.1, held by 4 cable clips/);
    // what is left: one warning, true of the Uno, whose 3.2 mm holes are wide for an M2.5 (an M3's head would overhang its edge)
    assert.deepEqual(r.bad.map((x) => x.split(':')[0]), ['fasten.clearance']); assert.match(r.bad[0], /shield's hole measures 3\.2 mm, wider than the loosest clearance hole for M2\.5, 3\.1 mm as drilled/);
    assert.equal(r.hardware.filter((h) => h === 'screw M5x12 button').length, 4, 'two into the slot for each mount');
    const list = cad('list', 'rack/rack');
    assert.match(list, /4 ×\s+M2\.5x8 cap/); assert.match(list, /2 ×\s+M3x5 button/); assert.match(list, /4 ×\s+slot-nut-6-misumi-m5-slide-in/);
    assert.match(list, /shield-mount \(fitting:device-mount-2020-misumi-hfs5-cnc-shield-v3-m5\)/); assert.match(list, /power-clip-4 \(fitting:cable-clip-6-misumi-6mm\)/);
    assert.match(cad('check', 'rack/rack'), /files match their schemas/);
    // the other service parts as fitting items, each screwed into the slot: nothing fails or warns
    const P = '2020-misumi-hfs5', kinds = [['fan', { kind: 'fan-mount', size: 40 }, 'rail.top@60', 2], ['tie', { kind: 'tie-anchor' }, 'rail.top@150', 1], ['din', { kind: 'din-rail' }, 'rail.top@220', 2], ['spool', { kind: 'spool-holder' }, 'rail.front@320', 1]];
    fs.writeFileSync(at('assemblies/more.json'), JSON.stringify({ title: 'more', kind: 'fit', items: [{ id: 'rail', beam: { profile: P }, from: [0, 0, 0], to: [400, 0, 0] }, ...kinds.map(([id, f, a]) => ({ id, fitting: { profile: P, ...f }, at: a }))],
      fasten: kinds.map(([id, , a, n]) => ({ screw: 'M5 button', through: [id], into: a.split('@')[0], at: Array.from({ length: n }, (_, k) => `${id}.b${k + 1}`) })) }));
    const more = cad('check', 'rack/more');
    assert.doesNotMatch(more, /^\s+(✗|!) /m); assert.match(more, /fan: printed mount for a 40 mm fan on 2020-misumi-hfs5/); assert.match(more, /spool: printed spool holder/);
    // the set's default supply (LRS-100-24) and the four-hole M4 ones: each screw read off the cut plate stops within
    // Mean Well's 3 mm, the mesh's grid allowed (a seat read 0.0002 mm off once failed all of these)
    for (const [variant, says] of [[null, /2 M3 button screws: M3x5 button chosen, the longest sold that goes no further than its maker allows: 2 mm under its head and 3 mm into psu/], ['LRS-200-24', /4 M4 button screws: M4x6 button chosen, the longest sold that goes no further than its maker allows: 3 mm under its head and 3 mm into psu/]]) {
      write([{ id: 'psu', bought: 'supply-24v', ...(variant ? { variant } : {}), mount: { on: 'rail.top@-120' } }], []);
      const c = cad('check', 'rack/rack');
      assert.match(c, says, variant ?? 'the default'); assert.doesNotMatch(c, /^\s+✗ /m, variant ?? 'the default');
    }
    // a run along the slot a mount sits on: no clip under the plate (they overlapped it), one each side, and a warning
    // by name that the wire must go round the mount
    write([{ id: 'psu', bought: 'supply-24v', variant: 'LRS-50-24', mount: { on: 'rail.top@200' } }], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.top', from: 20, to: 380 }] }]);
    const round = cad('check', 'rack/rack');
    assert.match(round, /✓ no parts overlap/); assert.doesNotMatch(round, /^\s+✗ /m);
    assert.match(round, /power: 360 mm along rail\.top\.1 from 20 to 380 mm, held by 6 cable clips no more than 100 mm apart but across psu-mount \((\d+(\.\d+)?) mm, a clip each side\), for a 6 mm bundle/);
    assert.match(round, /! power: its run along rail\.top\.1 passes psu-mount \(psu's mount\) from 132\.75 to 267\.25 mm: no clip goes under the plate, so one is set each side of it, and the wire must go round the mount there/);
    write([{ id: 'psu', bought: 'supply-24v', variant: 'LRS-50-24', mount: { on: 'rail.top@200' } }], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.top', from: 150, to: 250 }] }]);
    assert.match(cad('check', 'rack/rack'), /wire power: a run along rail\.top\.1 from 150 to 250 mm lies under psu-mount: no clip has room there; run it along another face/);
    // refused by name
    write([{ ...mine('shield'), at: [0, 0, 0], mount: { on: 'rail.top@100' } }]); assert.match(cad('check', 'rack/rack'), /item shield: a mounted item is placed by its mount: leave out at, rotate and repeat/);
    write([{ id: 'd1', bought: 'drv8825', mount: { on: 'rail.top@100' } }]); assert.match(cad('check', 'rack/rack'), /item d1: mount holds a bought board or supply, and drv8825 is a driver/);
    write([{ id: 'p12', bought: 'supply-12v', mount: { on: 'rail.top@100' } }]); assert.match(cad('check', 'rack/rack'), /item p12: supply-12v gives no mounting holes \(mount_holes/);
    write([{ ...mine('psu'), mount: { on: 'rail.side@100' } }]); assert.match(cad('check', 'rack/rack'), /item psu: on: profile-2020-misumi-hfs5 x 400 has no "side@100": it has a, b, a\.1, b\.1, top\.1, top/);
    write([], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.front', from: 0, to: 500 }] }]); assert.match(cad('check', 'rack/rack'), /wire power: a run's to is from 0 to 400 mm along rail \(got 500\)/);
    write([], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.front', from: 0, to: 100, every: 50 }] }]); assert.match(cad('check', 'rack/rack'), /wire power: a run along a slot has no "every": it takes along, from, to, pitch, cable|must NOT have additional properties/);
  } finally { done(); }
});

test('v.frames reads the workspace\'s own profile sets before the kit\'s, and a beam item takes one by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    const { framesContext, designFrames } = await import(pathToFileURL(path.join(path.dirname(BIN), '../lib/frames.mjs')).href);
    const kit = JSON.parse(fs.readFileSync(path.join(ROOT_MODULES, '@rulecad/rules/profile-2020-misumi-hfs5.json'), 'utf8'));
    const own = { ...kit, name: 'profile-2020-mine', rules: { ...kit.rules, width: { ...kit.rules.width, value: 21 }, height: { ...kit.rules.height, value: 21 } } };
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true }); fs.writeFileSync(path.join(ws, 'rules/profile-2020-mine.json'), JSON.stringify(own));
    const context = framesContext(path.join(ws, 'rules'));
    assert.deepEqual(Object.keys(context.sets), ['profile-2020-mine']);
    const v = designFrames(context);
    assert.equal(v.profileModel('2020-mine').width, 21);
    assert.equal(v.profileModel('2020-misumi-hfs5').width, 20); // the kit's, as before
    assert.equal(v.beamModel('2020-mine', { length: 100 }).profile.width, 21);
    assert.throws(() => designFrames({}).profileModel('2020-mine'), /no profile "2020-mine"/);
    const before = context.hash; fs.writeFileSync(path.join(ws, 'rules/profile-2020-mine.json'), JSON.stringify({ ...own, title: 'changed' }));
    assert.notEqual(framesContext(path.join(ws, 'rules')).hash, before); // (a build that reads it is made again)
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/assemblies/one.json'), JSON.stringify({ title: 'One', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-mine' }, from: [0, 0, 0], to: [0, 250, 0] }] }));
    assert.match(cad('list', 'frame/one'), /1 ×\s+profile-2020-mine x 250 mm\s+a beam/);
  } finally { done(); }
});

test('bought fittings: the same frame with a printed and with a cast bracket lists different parts and reports different joint stiffness, each saying what it rests on', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/corner.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // y1 stands on x1's top face 100 mm from its end a, both Motedis' 20 mm B-type profile
    const frame = (fitting) => ({ title: 'Corner', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-motedis-b6' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '2020-motedis-b6' }, from: [100, 0, 10], to: [100, 0, 210] }],
      joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting }] });
    const probe = (fitting) => {
      fs.writeFileSync(file, JSON.stringify(frame(fitting)));
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
        const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
        const { shoppingList } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/list.mjs')).href)});
        const s = await buildAssembly('frame/corner'), l = shoppingList(s);
        console.log(JSON.stringify({ items: s.items.map((i) => [i.id, i.role]), hardware: s.hardware.map((h) => [h.fasten, h.kind, h.name]), list: { bought: l.bought, printed: l.printed.map((p) => p.id), cost: l.cost },
          findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame|fitting)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
      `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    };
    const printed = probe('printed'), cast = probe('fitting-motedis-bracket-20-b6');
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    // different parts: a printed bracket (a part, by its grams) against a bought one (a reference, by its set and price)
    assert.deepEqual([printed.items[2], cast.items[2]], [['y1-x1-bracket', 'part'], ['y1-x1-bracket', 'reference']]);
    const fittings = (r) => r.list.bought.filter((b) => b.part === 'fitting').map((b) => [b.qty, b.set, b.cost, b.currency, b.items]);
    assert.deepEqual([printed.list.printed, fittings(printed)], [['y1-x1-bracket'], []]);
    assert.deepEqual([cast.list.printed, fittings(cast)], [[], [[1, 'fitting-motedis-bracket-20-b6', 0.36, 'EUR', ['y1-x1-bracket']]]]);
    // the cast bracket's own screws and nuts, as its set lists them: an M4x8 cap into a hammer nut on each leg
    assert.deepEqual(cast.hardware, [[0, 'screw', 'M4x8 cap'], [0, 'nut', 'slot-nut-6-motedis-m4-hammer'], [1, 'screw', 'M4x8 cap'], [1, 'nut', 'slot-nut-6-motedis-m4-hammer']]);
    assert.notDeepEqual(printed.hardware.map((h) => h[2]), cast.hardware.map((h) => h[2]));
    // what each costs: the bought bracket's price, the printed one's plastic at PLA's price a kilogram
    assert.deepEqual([cast.list.cost.bought, cast.list.cost.currency, cast.list.cost.printed, cast.list.cost.unpriced], [0.36, 'EUR', null, ['profile-2020-motedis-b6']]);
    assert.deepEqual([printed.list.cost.bought, printed.list.cost.printedUnit], [null, 'EUR']);
    assert.ok(printed.list.cost.printed > 0 && printed.list.cost.printed < 0.36, `${printed.list.cost.printed} EUR of plastic`);
    assert.match(printed.list.cost.printedRule, /g of pla at 13\.99 EUR\/kg: the plastic alone/);
    // different joint stiffness, each saying what it rests on
    const [kp] = by(printed, 'join.stiffness'), [kc] = by(cast, 'join.stiffness');
    assert.deepEqual([kc.values.bending, kc.values.twist, kc.refs.set, kc.refs.kind_of_value], [3e6, 1e6, 'fitting-motedis-bracket-20-b6', 'estimate']);
    assert.ok(kp.values.bending > 0 && Math.abs(kp.values.bending - kc.values.bending) > 1e5, `${kp.values.bending} against ${kc.values.bending}`);
    assert.match(kp.text, /y1-x1-bracket's own by finite elements .*until the joint rig \(issue 264\) measures it/);
    assert.match(kc.text, /fitting-motedis-bracket-20-b6's own figures from its rule set \(estimate: .*JOIN_STIFFNESS\.bracket.*\): an estimate, until the joint rig \(issue 264\) measures it/);
    assert.match(kc.refs.rests[0].source, /^fitting-motedis-bracket-20-b6\.bending_stiffness: A working guess/);
    // the cast bracket is placed and screwed as the printed one is: on y1's side with room, every check passing
    assert.deepEqual(cast.findings.filter((x) => x.level === 'fail').map((x) => x.text), []);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'join.geometry']) assert.deepEqual([...new Set(by(cast, code).map((x) => x.level))], ['pass'], code);
    // its holes are slots 5.2 mm wide (its lugs place it, not its screws): wider than M4's loosest hole, and said so
    assert.deepEqual(by(cast, 'fasten.clearance').filter((x) => x.level === 'warn').map((x) => x.values?.hole ?? x.text.match(/measures ([\d.]+) mm/)[1]), ['5.2', '5.2']);
    assert.deepEqual(by(cast, 'join.fitting'), []);
    // cad list says each line's price and the total; on another maker's profile the cast bracket does not fit, and says so
    const list = cad('list', 'frame/corner');
    assert.match(list, /1 ×\s+fitting-motedis-bracket-20-b6\s+a fitting\s+mass not given\s+0\.36 EUR each\s+y1-x1-bracket/);
    assert.match(list, /Cost: 0\.36 EUR bought \(no price given for profile-2020-motedis-b6\); fixings and bars are not priced/);
    const other = frame('fitting-motedis-bracket-20-b6'); for (const it of other.items) it.beam.profile = '2020-misumi-hfs5';
    fs.writeFileSync(file, JSON.stringify(other));
    assert.match(cad('check', 'frame/corner'), /fitting-motedis-bracket-20-b6 is made for slot-6-motedis \(nut family slot-6-bosch\), and 2020-misumi-hfs5's slots are slot-6-misumi/);
  } finally { done(); }
});

test('bought fittings: a T plate, an inner connector and an anchor in joins, an end cap and a levelling foot on beam ends, each checked against its beam and listed with its price', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/bought.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to, profile = '2020-motedis-b6') => ({ id, beam: { profile }, from, to });
    const probe = (a) => {
      fs.writeFileSync(file, JSON.stringify({ title: 'Bought', kind: 'fit', ...a }));
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
        const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
        const { shoppingList } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/list.mjs')).href)});
        const s = await buildAssembly('frame/bought'), l = shoppingList(s);
        const box = (id) => { const br = s.parts.filter((p) => p.item === id); return [0, 1, 2].map((k) => [Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))), Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))].map((x) => +x.toFixed(2))); };
        console.log(JSON.stringify({ items: s.items.map((i) => i.id), boxes: Object.fromEntries(s.items.filter((i) => i.role === 'reference' && !/^[xy]\\d$/.test(i.id)).map((i) => [i.id, box(i.id)])), hardware: s.hardware.map((h) => h.kind + ' ' + h.name),
          ops: Object.fromEntries(s.objects.filter((o) => o.beam).map((o) => [o.id, o.beam.ops.filter((x) => !x.implied).map((x) => x.line)])), cost: l.cost, bought: l.bought.filter((b) => b.part === 'fitting').map((b) => [b.qty, b.set, b.cost]),
          findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame|fitting)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
      `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    };
    const fails = (r) => r.findings.filter((x) => x.level === 'fail').map((x) => x.text), by = (r, code) => r.findings.filter((x) => x.code === code);
    // a T plate where y1 meets x1 along its length: its three screws in x1, two in y1, each into a hammer nut
    let r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210])], joins: [{ kind: 'gusset', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-motedis-plate-t-20' }] });
    assert.deepEqual(fails(r), []);
    assert.deepEqual([r.hardware.filter((h) => h === 'screw M5x8 cap').length, r.hardware.filter((h) => h === 'nut slot-nut-6-motedis-m5-hammer').length], [5, 5]);
    assert.deepEqual(r.boxes['y1-x1-gusset'], [[121, 179], [-13, -10], [-9, 49]]); // (58 mm along x1, 3 mm thick on the faces at y = -10, from 9 mm under x1's axis to 49 above)
    for (const code of ['fasten.holes', 'fasten.slot', 'join.geometry']) assert.deepEqual([...new Set(by(r, code).map((x) => x.level))], ['pass'], code);
    assert.deepEqual([by(r, 'join.stiffness')[0].values.bending, r.bought, r.cost.bought], [6e6, [[1, 'fitting-motedis-plate-t-20', 1.21]], 1.21]);
    // an inner connector: in the slots, out of sight, its grub screws part of it; no nuts, no machining, no overlap
    r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210])], joins: [{ kind: 'hidden', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-motedis-inner-20-b6' }] });
    assert.deepEqual([fails(r), r.hardware, r.ops, by(r, 'join.stiffness')[0].values.bending], [[], [], { x1: [], y1: [] }, 1.5e6]);
    assert.deepEqual([...new Set(by(r, 'overlap').map((x) => x.level))], ['pass']);
    assert.deepEqual(by(r, 'join.fitting'), []);
    // MISUMI's centre joint on its own profile: the hole for its guide drilled across y1, 10 mm from its end, on the cut list
    r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0], '2020-misumi-hfs5'), beam('y1', [150, 0, 10], [150, 0, 210], '2020-misumi-hfs5')], joins: [{ kind: 'anchor', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-misumi-hmj5' }] });
    assert.deepEqual(fails(r), []);
    assert.equal(r.ops.y1.length, 1); assert.match(r.ops.y1[0], /Ø7\.1 mm .*10 mm from end a/);
    assert.deepEqual([by(r, 'join.stiffness')[0].values.bending, r.bought, r.cost ?? null], [2e6, [[1, 'fitting-misumi-hmj5', null]], null]); // (MISUMI prints no price, and nothing is printed)
    // on a beam's ends: an end cap and a levelling foot, each a bought item at the end, which covers it
    const ends = { items: [beam('x1', [0, 0, 0], [300, 0, 0]), { id: 'cap', bought: 'fitting-motedis-end-cap-20-b6', at: 'x1.b' }, { id: 'foot', bought: 'fitting-motedis-foot-m6-d19', at: 'x1.a' }] };
    r = probe(ends);
    assert.deepEqual([fails(r), by(r, 'fitting.fit').map((x) => [x.level, x.refs.item]), by(r, 'join.end')], [[], [['pass', 'cap'], ['pass', 'foot']], []]);
    assert.deepEqual([r.bought, r.cost.bought], [[[1, 'fitting-motedis-end-cap-20-b6', 0.07], [1, 'fitting-motedis-foot-m6-d19', 2]], 2.07]);
    // the same foot on MISUMI's profile, whose end bore is tapped M5: it does not fit, and says so
    ends.items[0].beam.profile = '2020-misumi-hfs5'; r = probe(ends);
    assert.deepEqual(fails(r).map((t) => t.replace(/^\w+: /, '')), ["fitting-motedis-end-cap-20-b6 is made for slot-6-motedis (nut family slot-6-bosch), and 2020-misumi-hfs5's slots are slot-6-misumi (slot-6-misumi): its lugs and nuts are not promised to fit. Choose a fitting made for slot-6-misumi, or \"fitting\": \"printed\"", "fitting-motedis-foot-m6-d19's stem is M6, and 2020-misumi-hfs5's end bore is tapped M5: choose a foot with an M5 stem"]);
    // slide-in nuts in a slot whose two ends are closed by bought items (a cap and a foot), not by joins: they go in
    // before either, and nothing has to be loaded before a join (this once failed to read the items' join)
    r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210]), { id: 'cap', bought: 'fitting-motedis-end-cap-20-b6', at: 'x1.b' }, { id: 'foot', bought: 'fitting-motedis-foot-m6-d19', at: 'x1.a' }],
      joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@150', fitting: 'printed' }] });
    assert.deepEqual([fails(r), by(r, 'frame.preload').map((x) => x.level)], [[], ['pass']]);
    assert.match(by(r, 'frame.nut').find((x) => x.refs.item === 'x1').text, /slide-in nut .*into x1's top slot from an end before (foot and cap|cap and foot) go on$/); // (both ends capped: each named)
    // refused by name: a set the join does not take
    fs.writeFileSync(file, JSON.stringify({ title: 'Bought', kind: 'fit', items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210])], joins: [{ kind: 'hidden', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-motedis-plate-t-20' }] }));
    assert.match(cad('check', 'frame/bought'), /join 1: .*fitting-motedis-plate-t-20 is a joining plate, and a hidden join takes an inner connector: fitting-motedis-plate-t-20 goes in a gusset or splice join/);
  } finally { done(); }
});

test('guides: an MGN12 rail on a 2020 beam lists its nuts and screws at its pitch, its carriage slides its travel in a sweep, and a carriage loaded past its moment rating fails', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/slide', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'slide', material: 'PLA', objects: [] }));
    const x1 = { id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [400, 0, 0] };
    const write = (name, a) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', ...a }));
    // a long carriage with 2 kg 100 mm ahead of its middle; the printed jig parked past the rail's end
    write('axis', { items: [x1, { id: 'jig', fitting: { kind: 'rail-jig', profile: '2020-misumi-hfs5', rail: 'rail-mgn12' }, at: 'x1.top@375' }], fits: [{ a: 'jig', b: 'x1', fastens: true, note: 'snapped over x1' }],
      guides: [{ kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12H', on: 'x1.top', from: 50, length: 300 }], loads: [{ mass: 2, at: { item: 'g1-carriage-1', at: [100, 0, 13] } }] });
    // a standard carriage with 4 kg 400 mm ahead: 15.7 N m against its 13.72 N m pitch rating
    write('heavy', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', from: 50, length: 300 }], loads: [{ mass: 4, at: { item: 'g1-carriage-1', at: [400, 0, 13] } }] });
    // an MGN7's M2 screws on a 2020, whose slot nuts start at M3; and an MGN12 run into a beam joined across its face
    write('small', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn7', on: 'x1.top', length: 200, from: 100 }] });
    write('crossed', { items: [x1, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [300, 0, 10], to: [300, 0, 210] }], joins: [{ kind: 'blind', a: 'y1.a', b: 'x1.top@300' }], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', from: 20, length: 300 }] });
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly, sweep } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs'), { terms } = await lib('task.mjs');
      const s = await buildAssembly('slide/${name}'), l = shoppingList(s), centre = (p) => { const t = p.triangles.flat(); return [0, 1, 2].map((k) => t.reduce((a, q) => a + q[k], 0) / t.length); };
      console.log(JSON.stringify({ joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses),
        bought: l.bought.map((b) => [b.qty, b.set, b.variant, b.part, b.length ?? null]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]), printed: l.printed.map((p) => p.id),
        screws: s.parts.filter((p) => /^fasten-\\d+-screw/.test(p.name ?? '')).map((p) => +centre(p)[0].toFixed(2)).sort((a, b) => a - b),
        terms: s.motion.joints.some((j) => j.id === 'g1-1') ? terms(s, { names: ['g1-1'] })[0].terms.map((x) => [x.term, x.kind, x.value]) : [],
        sweep: s.motion.joints.some((j) => j.id === 'g1-1') ? sweep(s, { steps: 12 }).map(({ level, text, values }) => ({ level, text, values })) : [],
        findings: checkAssembly(s).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    const axis = probe('axis');
    // the rail and its carriage are bought; twelve M3 screws into twelve of the slot's own M3 nuts, 25 mm apart
    assert.deepEqual(axis.bought.filter((b) => b[1] === 'rail-mgn12'), [[1, 'rail-mgn12', 'MGN12H', 'carriage', null], [1, 'rail-mgn12', null, 'rail', 300]]);
    assert.deepEqual(axis.fasteners, [[12, 'M3x8 cap'], [12, 'slot-nut-6-misumi-m3-slide-in']]);
    assert.equal(axis.screws.length, 12); assert.deepEqual(axis.screws.slice(1).map((x, i) => +(x - axis.screws[i]).toFixed(2)), Array(11).fill(25));
    assert.deepEqual([axis.screws[0], axis.screws[11]], [62.5, 337.5], 'from 50 mm, 12.5 mm in from each end of the rail');
    assert.deepEqual([...new Set(by(axis, 'guide.fit').map((x) => x.level))], ['pass']);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.length', 'fasten.engagement', 'fasten.seat']) assert.deepEqual([...new Set(by(axis, code).map((x) => x.level))], ['pass'], code);
    assert.deepEqual(axis.findings.filter((x) => x.level === 'fail' || (x.level === 'warn' && !/^(frame|fasten\.order)/.test(x.code))).map((x) => `${x.code} ${x.text}`), []);
    // its carriage on a sliding joint through the travel the lengths allow, both ends a pose; the sweep is clear
    assert.deepEqual(axis.joints, [['g1-1', 'prismatic', [0, 254.2, 0]]], 'from 0 to its travel, at 0 as drawn'); assert.ok(axis.poses.includes('g1-a') && axis.poses.includes('g1-b'));
    assert.deepEqual(axis.sweep.map((x) => [x.level, x.values.from, x.values.to]), [['pass', 0, 254.2]]);
    assert.match(by(axis, 'guide.travel')[0].text, /1 MGN12H, 45\.8 mm long with its seals, travel 254\.2 mm/);
    // its carriage's loads within its ratings: 2 kg 100 mm out pitches it 1.96 N m
    const [jm] = by(axis, 'joint.moment');
    assert.equal(jm.level, 'pass'); assert.ok(Math.abs(jm.values.moment[1] - 2 * 9.80665 * 0.1) < 0.01, `pitch ${jm.values.moment[1]}`); assert.equal(jm.refs.carriage, 'g1-carriage-1');
    // the rail's terms in the error budget, and the jig printed
    assert.deepEqual(axis.terms.map((x) => x.slice(0, 2)), [['rail parallelism', 'spec'], ['carriage play', 'spec'], ['beam straightness', 'spec'], ['beam sag', 'estimate']]);
    assert.match(by(axis, 'guide.budget')[0].text, /rail parallelism 0\.017 mm \(spec\), carriage play 0\.01 mm \(spec\)/);
    assert.deepEqual(axis.printed, ['jig']); assert.match(by(axis, 'guide.jig').find((x) => x.refs?.guide === 'g1').text, /"kind": "rail-jig"/); assert.match(by(axis, 'guide.jig').find((x) => /^jig/.test(x.text)).text, /centres the rail to within 0.4 mm/);
    // past its moment rating it fails, and says which
    const heavy = by(probe('heavy'), 'joint.moment')[0];
    assert.equal(heavy.level, 'fail'); assert.match(heavy.text, /g1-carriage-1 \(MGN12C\) on g1: .* MP 13\.72 .* past its pitch rating/); assert.ok(heavy.values.margin < 1);
    // a rail whose screws no slot nut takes: guide.fit says so, and no screws are guessed
    const small = probe('small');
    assert.match(by(small, 'guide.fit').find((x) => x.level === 'fail').text, /no M2 slot nut is made for slot-6-misumi: rail-mgn7's holes take M2, and the nuts there take M3, M4, M5/);
    assert.deepEqual(small.fasteners, []);
    // a rail run into a beam joined across its face fails, naming the join
    assert.match(by(probe('crossed'), 'guide.fit').find((x) => x.level === 'fail').text, /runs into y1 joined at x1\.top@300 at 290 to 310 mm/);
    // refused by name
    write('bad', { items: [x1], guides: [{ kind: 'belt', rail: 'rail-mgn12', on: 'x1.top', length: 300 }] });
    assert.match(cad('check', 'slide/bad'), /guide 1: kind is rail \(a miniature linear rail\), wheels .* or screw .*; a belt is not built yet|guides\/0\/kind/);
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top@20', length: 300 }] });
    assert.match(cad('check', 'slide/bad'), /guide 1: on is a beam's slotted face, as x1\.top; where along it is "from"/);
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', from: 200, length: 300 }] });
    assert.match(cad('check', 'slide/bad'), /guide 1: the rail runs from 200 to 500 mm along x1, which is 400 mm long/);
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12X', on: 'x1.top', length: 300 }] });
    assert.match(cad('check', 'slide/bad'), /guide 1: rail-mgn12 has no carriage "MGN12X": it has MGN12C, MGN12H/);
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', length: 300, speed: 3 }] });
    assert.match(cad('check', 'slide/bad'), /guide 1: a rail guide has no "speed"|guides\/0.*speed/);
  } finally { done(); }
});

test('guides: a carriage on V-wheels for a V-slot 2040 comes from the profile\'s rules, rolls its travel in a sweep clear of the beam, and the same guide on a plain T-slot is refused with why; a printed slider slides its stretch', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/roll', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'roll', material: 'PLA', objects: [] }));
    const beam = (profile) => ({ id: 'x1', beam: { profile }, from: [0, 0, 0], to: [500, 0, 0] });
    const write = (name, a) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', ...a }));
    // four solid wheels under a plate over the top face, rolling along 400 mm of it; 1 kg 20 mm over the plate
    write('wheels', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', wheel: 'v-wheel-solid', on: 'x1.top', from: 50, length: 400 }], loads: [{ mass: 1, at: { item: 'g1-carriage-1', at: [0, 0, 20] } }] });
    // 3 kg held 200 mm out ahead of the plate pitches it past its wheels' ratings
    write('heavy', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', on: 'x1.top', from: 50, length: 400 }], loads: [{ mass: 3, at: { item: 'g1-carriage-1', at: [200, 0, 20] } }] });
    // the same guide on MISUMI's 2040, a plain T-slot; and a printed slider over the V-slot's first top slot
    write('plain', { items: [beam('2040-misumi-hfs5')], guides: [{ kind: 'wheels', wheel: 'v-wheel-solid', on: 'x1.top', from: 50, length: 400 }] });
    write('slider', { items: [beam('2040-openbuilds')], guides: [{ kind: 'slider', on: 'x1.top.1', from: 100, length: 200, size: 40 }] });
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly, sweep, overlap } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs');
      const { default: jscad } = await import(${JSON.stringify(pathToFileURL(path.join(ROOT_MODULES, '@jscad/modeling/src/index.js')).href)});
      const s = await buildAssembly('roll/${name}'), l = shoppingList(s), j = s.motion.joints.find((x) => x.id === 'g1-1');
      const solidOf = (id) => { const p = s.parts.find((x) => x.item === id); return p && (p.collide ?? p.geometry); }, wh = solidOf('g1-wheel-1');
      const box = (id) => { const t = s.parts.filter((p) => p.item === id).flatMap((p) => p.triangles.flat()); return [0, 1, 2].map((k) => [Math.min(...t.map((q) => q[k])), Math.max(...t.map((q) => q[k]))].map((x) => +x.toFixed(3))); };
      console.log(JSON.stringify({ joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses),
        bought: l.bought.map((b) => [b.qty, b.set, b.part]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]), printed: l.printed.map((p) => [p.id, p.grams]),
        boxes: Object.fromEntries(['g1-carriage-1', 'g1-wheel-1', 'g1-wheel-3'].map((id) => [id, box(id)])),
        sweep: j ? sweep(s, { steps: 12 }).map(({ level, text, values }) => ({ level, text, values })) : [],
        into: wh ? [0, 0.3].map((dy) => +overlap(jscad.transforms.translate([0, dy, 0], wh), solidOf('x1')).toFixed(3)) : null,
        stop: wh ? (() => { const bb = jscad.measurements.measureBoundingBox(wh); return +overlap(wh, jscad.primitives.cuboid({ size: [bb[1][0] - bb[0][0], 1, 4], center: [(bb[0][0] + bb[1][0]) / 2, -19.5, 0] })).toFixed(3); })() : null,
        findings: checkAssembly(s).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    const w = probe('wheels');
    // from the profile's rules: the wheels' seats in the tracks of the front and back faces, both passing guide.fit
    assert.deepEqual(by(w, 'guide.fit').map((x) => [x.level, x.values.axle, x.values.depth]), [['pass', 10.32, 1.63], ['pass', 10.32, 1.63]]);
    assert.match(by(w, 'guide.fit')[0].text, /v-wheel-solid runs in slot-6-openbuilds's V track on profile-2040-openbuilds's front face/);
    // the plate is printed, the four wheels bought, their screws, nuts, washers and spacers on the list
    assert.deepEqual(w.printed.map((p) => p[0]), ['g1-carriage-1']); assert.ok(w.printed[0][1] > 5);
    assert.deepEqual(w.bought.filter((b) => b[2] === 'wheel'), [[4, 'v-wheel-solid', 'wheel']]);
    for (const x of [[4, 'M5x30 cap'], [4, 'M5 lock nut'], [2, 'M5 washer'], [2, 'eccentric-6-openbuilds'], [2, 'spacer 10 x 6 mm']]) assert.ok(w.fasteners.some((f) => f[0] === x[0] && f[1] === x[1]), `${x[1]}: ${JSON.stringify(w.fasteners)}`);
    // the wheels stand either side of the 40 mm beam, their axles 20 + 10.32 out, their middles 10 mm under the top face
    const mid = (id, k) => (w.boxes[id][k][0] + w.boxes[id][k][1]) / 2;
    assert.equal(w.boxes['g1-carriage-1'][2][0], 11.5, 'the plate stands 1.5 mm over the top face, at z = 10');
    assert.deepEqual([mid('g1-wheel-1', 1), mid('g1-wheel-3', 1)], [-30.32, 30.32]); assert.equal(mid('g1-wheel-1', 2), 3, 'a fixed wheel from 5.5 under the beam\'s middle up its spacer to the plate');
    // it rolls its travel, from 0 to the stretch less its 63.9 mm over its wheels, both ends a pose; the sweep is clear of the beam
    assert.deepEqual(w.joints, [['g1-1', 'prismatic', [0, 336.1, 0]]]); assert.ok(w.poses.includes('g1-a') && w.poses.includes('g1-b'));
    assert.deepEqual(w.sweep.map((x) => [x.level, x.values.from, x.values.to]), [['pass', 0, 336.1]]);
    // the overlap check sees the whole wheel against the beam's envelope less its tracks: clear where it seats, and 0.3 mm
    // further in (toward the beam, +y for the front side's w1), its rim in the beam
    assert.equal(w.into[0], 0); assert.ok(w.into[1] > 1, `0.3 mm into the beam: ${w.into[1]} mm³`);
    // and a part across the track's line (a block 1 mm into the front face where w1 rolls, as an end cap or a crossing
    // beam would be) is found in the wheel's rim: the rim inside the face is part of what is checked
    assert.ok(w.stop > 1, `a block in the track's line: ${w.stop} mm³`);
    assert.match(by(w, 'guide.travel')[0].text, /a plate on 4 v-wheel-solid wheels over x1's top face, 63\.9 mm long over its wheels, rolls from 50 to 450 mm along x1: travel 336\.1 mm/);
    // its wheels carry what is on it: 1 kg along their axles, a quarter each with the plate's own weight
    const [jm] = by(w, 'joint.moment');
    assert.equal(jm.level, 'pass'); assert.equal(jm.refs.carriage, 'g1-carriage-1'); assert.ok(jm.values.carried > 1 && jm.values.carried < 1.2, `carried ${jm.values.carried}`);
    // the one warning: the seat is 0.94 mm wider than OpenBuilds' own plate, more than the eccentrics' 0.79 mm can take up
    assert.deepEqual(w.findings.filter((x) => x.level === 'fail' || (x.level === 'warn' && !/^(frame|motor\.loads)/.test(x.code))).map((x) => `${x.code} ${x.values?.difference ?? ''}`), ['guide.seat 0.94']);
    // overloaded, it fails and names its most loaded wheel
    const heavy = by(probe('heavy'), 'joint.moment')[0];
    assert.equal(heavy.level, 'fail'); assert.match(heavy.text, /its most loaded wheel, w\d, takes .* past its rating/); assert.ok(heavy.values.margin < 1);
    // the same guide on a plain T-slot is refused, with why
    assert.match(cad('check', 'roll/plain'), /guide 1: wheels are refused on profile-2040-misumi-hfs5 under its top face: profile-2040-misumi-hfs5's front face has slot-6-misumi, a plain T-slot with no V track .*: a V-wheel's flanks need a V to run on and centre in/);
    // a printed slider: its clearance the printer's fit, its friction said to rest on a working figure; it slides its stretch less its 40 mm
    const sl = probe('slider');
    assert.deepEqual(sl.joints, [['g1-1', 'prismatic', [0, 160, 0]]]); assert.deepEqual(sl.sweep.map((x) => [x.level, x.values.to]), [['pass', 160]]);
    assert.match(by(sl, 'guide.friction')[0].text, /PLA on anodised aluminium taken as μ 0\.3/); assert.match(by(sl, 'guide.clearance')[0].text, /0\.2 mm clear a side/);
    // refused by name
    write('bad', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', on: 'x1.top.2', length: 400 }] });
    assert.match(cad('check', 'roll/bad'), /guide 1: on is the face the plate lies over, as x1\.top/);
    write('bad', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', on: 'x1.top', length: 60 }] });
    assert.match(cad('check', 'roll/bad'), /guide 1: its carriage is 63\.9 mm long over its wheels, so a 60 mm stretch leaves it no travel/);
    write('bad', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', rail: 'rail-mgn12', on: 'x1.top', length: 400 }] });
    assert.match(cad('check', 'roll/bad'), /guide 1: a wheels guide has no "rail"|guides\/0/);
  } finally { done(); }
});

test('guides: chapter 13\'s Z axis rebuilt on a beam, its rods, screw, motor and endstop all placed by addresses, gives its motor checks the same margin; a screw drives only rods, and an endstop out of reach is refused with where it would go', () => {
  const { ws, cad, done } = workspace();
  try {
    // chapter 13's own Z axis, as EXAMPLES.md writes it: its rules, its frame and carriage, its assembly
    const text = fs.readFileSync(fileURLToPath(new URL('./EXAMPLES.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n'), want = ['rules/lift.json', 'projects/arm/objects/zframe.js', 'projects/arm/objects/zframe.json', 'projects/arm/objects/zcar.js', 'projects/arm/objects/zcar.json', 'projects/arm/assemblies/arm-z.json'];
    for (const [, info, body] of text.matchAll(/^```(\S*(?: \S+)?)\n([\s\S]*?)^```$/gm)) { const f = info.split(' ')[1]; if (want.includes(f)) { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), body); } }
    for (const f of want) assert.ok(fs.existsSync(path.join(ws, f)), `${f} is in chapter 13`);
    fs.writeFileSync(path.join(ws, 'projects/arm/project.json'), JSON.stringify({ name: 'arm', material: 'PLA', objects: ['zframe', 'zcar'] }));
    // the same axis on a 2020 standing upright: the rods and the carriage a guide on its top face, the screw and motor a
    // guide driving it, the endstop at an address on its front face; the same motor, lead, friction and load
    const write = (name, guides) => fs.writeFileSync(path.join(ws, `projects/arm/assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', uses: ['lift'],
      items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [0, 0, 200] }], guides,
      loads: [{ mass: 'lift.z_mass', at: 'g1-carriage-1.top', note: 'The gripper, servo, payload and carriage, as the screw sees them' }] }));
    const rods = (endstop) => ({ kind: 'rods', on: 'x1.top', from: 60, length: 101, ...(endstop ? { endstop: { at: endstop } } : {}) });
    const screw = { kind: 'screw', guide: 'g1', screw: 't8-screw', motor: { model: '28byj48', microsteps: 1, duty: 0.3 }, friction: 'lift.z_friction' };
    // placed by an address: one beside the holder is refused, saying where the switch's flag would meet its lever
    write('z-far', [rods('x1.front@60'), screw]);
    const said = cad('check', 'arm/z-far'), place = /at (x1\.front@[\d.]+) it trips 0 mm from the travel's start/.exec(said);
    assert.match(said, /guide 1: endstop at x1\.front@60: its mount reaches back over g1-holder-a's leg \(to 71\.5 mm along x1\)/); assert.ok(place, said);
    write('z-rods', [rods(`x1.front@${Math.ceil(parseFloat(place[1].split('@')[1]))}`), screw]);
    // (the probe is a file, not node -e: a worker thread the motor's finite elements start takes its parent's -e as its own)
    const probe = (name) => { fs.writeFileSync(path.join(ws, 'probe.mjs'), `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly, sweep } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs');
      const s = await buildAssembly('arm/${name}'), l = shoppingList(s), j = s.motion.joints.find((x) => x.type === 'prismatic');
      console.log(JSON.stringify({ joint: [j.id, j.dofs[0].slice(0, 2), j.slide ? [j.slide.kind, j.slide.mmPerTurn] : null], items: s.a.items.map((it) => [it.id, it.at ?? null]), home: (s.a.joints || []).find((x) => x.id === j.id)?.home ?? null,
        bought: l.bought.map((b) => [b.qty, b.set]), printed: l.printed.map((p) => [p.id, p.grams]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]),
        sweep: sweep(s, { steps: 8 }).map(({ level, values }) => ({ level, values })),
        findings: checkAssembly(s).map(({ level, code, text, values }) => ({ level, code, text, values: /^(motor|guide)\./.test(code) ? values : null })) }));
      process.exit(0);
    `); return JSON.parse(execFileSync(process.execPath, [path.join(ws, 'probe.mjs')], { cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } })); };
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    const ch = probe('arm-z'), z = probe('z-rods');
    // the same margin: 15.5 N from the 28BYJ-48 through the 8 mm lead against 2.45 N, 6.32 times over in both
    const [t0] = by(ch, 'motor.torque'), [t1] = by(z, 'motor.torque');
    assert.equal(t1.level, 'pass'); assert.equal(t1.values.margin, t0.values.margin); assert.equal(+t1.values.margin.toFixed(2), 6.32);
    assert.match(t1.text, /15\.5 N there against 2\.45 N needed/);
    assert.deepEqual(z.joint, ['g1-1', [z.joint[1][0], z.joint[1][1]], ['screw', 8]]);
    assert.deepEqual(by(z, 'motor.holds').map((x) => x.level), by(ch, 'motor.holds').map((x) => x.level));
    assert.equal(by(z, 'motor.axis')[0].level, 'pass');
    assert.match(by(z, 'motor.speed')[0].text, /moves at 1\.17 mm\/s/); assert.match(by(ch, 'motor.speed')[0].text, /moves at 1\.17 mm\/s/);
    // all placed by addresses: the holders, the motor plate and the endstop's mount at the beam's; the rods, bearings, motor,
    // coupler, screw, nut and switch at the anchors of the parts they sit in
    const at = Object.fromEntries(z.items);
    assert.deepEqual([at['g1-holder-a'], at['g1-holder-b'], at['g2-plate'], at['g1-endstop-mount']], ['x1.top.1@60', 'x1.top.1@161', 'x1.top.1@30.5', `x1.front@${Math.ceil(parseFloat(place[1].split('@')[1]))}`]);
    assert.deepEqual([at['g1-rod-1'], at['g1-rod-2'], at['g1-bearing-1'], at['g2-motor'], at['g2-coupler'], at['g2-screw'], at['g2-nut'], at['g2-support-a'], at['g2-support-b'], at['g1-endstop']],
      ['g1-holder-a.r1', 'g1-holder-a.r2', 'g1-carriage-1.lm1', 'g2-plate.motor', 'g2-plate.coupler', 'g2-plate.coupler', 'g1-carriage-1.nut', 'g1-holder-a.s1', 'g1-holder-b.s1', 'g1-endstop-mount.switch']);
    // its travel from home to holder b: about chapter 13's 50 mm; the switch homes the joint; the sweep is clear
    const home = by(z, 'guide.endstop')[0].values.home;
    assert.ok(home >= 0 && home < 1, `home ${home}`); assert.deepEqual(z.joint[1], [home, 50.5]); assert.deepEqual(z.home, { endstop: 'g1-endstop.lever', direction: -1 });
    assert.deepEqual(z.sweep.map((x) => x.level), ['pass']);
    // nothing fails or warns but the chapter's own estimate (its nut's friction)
    assert.deepEqual(z.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => `${x.code} ${x.text}`), ['rules.estimate uses estimates, not measurements: lift.z_friction. Measure each and settle it with cad measured arm/z-rods <name>=<value>']);
    assert.equal(by(z, 'joint.moment')[0].level, 'pass'); assert.match(by(z, 'joint.moment')[0].text, /against lm8uu's 400 N static rating/);
    assert.equal(by(z, 'guide.coupler')[0].level, 'pass');
    // the shopping list: what it takes, printed and bought
    assert.deepEqual(z.printed.map((p) => p[0]).sort(), ['g1-carriage-1', 'g1-endstop-mount', 'g1-holder-a', 'g1-holder-b', 'g2-plate']);
    for (const b of [[2, 'rod-8'], [2, 'lm8uu'], [1, '28byj48'], [1, 'coupler-5-8'], [1, 't8-nut'], [2, 'bearing-608'], [1, 'endstop-10t85']]) assert.ok(z.bought.some((x) => x[0] === b[0] && x[1] === b[1]), `${b[1]}: ${JSON.stringify(z.bought)}`);
    for (const x of [[9, 'M5x12 cap'], [4, 'M3x12 button'], [2, 'M2x12 cap']]) assert.ok(z.fasteners.some((f) => f[0] === x[0] && f[1] === x[1]), `${x[1]}: ${JSON.stringify(z.fasteners)}`);
    // refused by name: a screw on wheels, a screw naming no guide, a belt, a motor plate past the beam's end
    const beam = (profile) => ({ id: 'x1', beam: { profile }, from: [0, 0, 0], to: [0, 0, 300] }), bad = (guides, profile = '2020-misumi-hfs5') => { fs.writeFileSync(path.join(ws, 'projects/arm/assemblies/bad.json'), JSON.stringify({ title: 'bad', kind: 'fit', items: [beam(profile)], guides })); return cad('check', 'arm/bad'); };
    assert.match(bad([{ kind: 'wheels', on: 'x1.top', length: 200 }, { kind: 'screw', guide: 'g1', motor: { model: '28byj48' } }], '2040-openbuilds'), /guide 2: a screw drives a rods guide's carriage, and g1 is a wheels guide/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', length: 200 }, { kind: 'screw', guide: 'g9', motor: { model: '28byj48' } }]), /guide 2: guide names the rods guide whose carriage the screw drives, by its id \(got "g9"; guides: g1, g2\)/);
    assert.match(bad([{ kind: 'belt', on: 'x1.top', length: 200 }]), /a belt is not built yet|guides\/0/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', length: 200 }, { kind: 'screw', guide: 'g1', motor: { model: '28byj48' } }]), /guide 2: the motor plate and coupler-5-8 take 29\.5 mm before the stretch, and it starts 0 mm along x1: give the rods guide a "from" of at least 29\.5/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', from: 40, length: 200 }, { kind: 'screw', guide: 'g1', motor: { model: '28byj48', drives: 'z' } }]), /guide 2: motor\.drives comes from the guide: leave it out|guides\/1/);
  } finally { done(); }
});

test('guides on a frame: a rods guide on a beam joined at both ends shuts its holders\' slide-in nuts in, and cad check says so in a mechanism\'s poses; "nut": "drop-in" puts them in through the opening; cad plates lays its printed fittings out as they print', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a beam between two posts, a blind join at each end, so both ends of its slots are closed; two rods along its top,
    // as far apart and as high as a screw between them would set them
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    const write = (rods) => fs.writeFileSync(path.join(ws, 'projects/frame/assemblies/frame.json'), JSON.stringify({ title: 'Frame', kind: 'fit',
      items: [beam('p1', [-10, 0, -120], [-10, 0, 80]), beam('p2', [310, 0, -120], [310, 0, 80]), beam('x1', [0, 0, 0], [300, 0, 0])],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'p1.back@120' }, { kind: 'blind', a: 'x1.b', b: 'p2.front@120' }],
      guides: [{ kind: 'rods', on: 'x1.top', from: 50, length: 200, spacing: 40, height: 22.5, ...rods }] }));
    // slide-in, the strongest made for the slot: shut in by the joins, and said in the check of every pose (g1-a, g1-b)
    write({});
    const slide = cad('check', 'frame/frame');
    assert.match(slide, /2 poses checked: g1-a, g1-b/);
    assert.match(slide, /✗ g1: g1-holder-a's leg into x1's front slot: 1 slide-in nut \(slot-nut-6-misumi-m5-slide-in\) goes into x1's front slot at [\d.]+ mm, between x1's end a \(the blind join of x1\.a to p1\.back@120\) and x1's end b \(the blind join of x1\.b to p2\.front@120\), which close it at both ends/);
    // drop-in: through the opening, anywhere, for the holders' legs on both sides
    write({ nut: 'drop-in' });
    const drop = cad('check', 'frame/frame');
    assert.doesNotMatch(drop, /✗/, drop);
    assert.equal((drop.match(/✓ g1: g1-holder-[ab]'s leg into x1's (front|back) slot: 1 drop-in nut \(slot-nut-6-misumi-m4-drop-in\) goes into x1's (front|back) slot through its opening, anywhere along it/g) || []).length, 4, drop);
    // its printed fittings on a plate: each item's fitting laid as it prints ("pose": "print"), checked as one print
    assert.match(cad('plates', 'frame/frame'), /frame-base-1: base, 3 parts, [\d.]+ g, about \d+ min: (g1-holder-a|g1-holder-b|g1-carriage-1), (g1-holder-a|g1-holder-b|g1-carriage-1), (g1-holder-a|g1-holder-b|g1-carriage-1)\n\s+frame-base-1: prints clean/);
    const plate = JSON.parse(fs.readFileSync(path.join(ws, 'projects/frame/assemblies/frame-base-1.json'), 'utf8'));
    assert.deepEqual(plate.items.map((it) => [it.fitting?.kind, it.fitting?.pose]).sort(), [['rod-carriage', 'print'], ['rod-holder', 'print'], ['rod-holder', 'print']]);
    const onIt = cad('check', 'frame/frame-base-1');
    assert.doesNotMatch(onIt, /[✗!] /, onIt); assert.match(onIt, /no parts overlap \(3 object instances\)/);
  } finally { done(); }
});

test('frame checks: a shelf frame with 5 kg at mid-span sags as a hand calculation says with rigid joins, more on the joins\' estimated springs, and says which it rests on; its supports, limit, stress and buckling', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/shelf.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // four legs 400 mm tall (z), a front and a back beam 600 mm long between them (x1, x2), two sides 300 mm long
    // (y1, y2), all 2020, each end joined blind to a leg's face 390 mm up; 5 kg on x1's top at mid-span
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to }), H = 390;
    const shelf = { title: 'Shelf', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 400]), beam('z2', [620, 0, 0], [620, 0, 400]), beam('z3', [0, 320, 0], [0, 320, 400]), beam('z4', [620, 320, 0], [620, 320, 400]),
      beam('x1', [10, 0, H], [610, 0, H]), beam('x2', [10, 320, H], [610, 320, H]), beam('y1', [0, 10, H], [0, 310, H]), beam('y2', [620, 10, H], [620, 310, H])],
    joins: [['x1.a', 'z1.back'], ['x1.b', 'z2.front'], ['x2.a', 'z3.back'], ['x2.b', 'z4.front'], ['y1.a', 'z1.top'], ['y1.b', 'z3.bottom'], ['y2.a', 'z2.top'], ['y2.b', 'z4.bottom']].map(([a, b]) => ({ kind: 'blind', a, b: `${b}@390` })),
    loads: [{ mass: 5, at: 'x1.top@50%', note: '5 kg at mid-span' }] };
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/shelf');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection|stress|buckling)$/.test(f.code)).map(({ level, code, text, values, refs, at }) => ({ level, code, text, values, refs, at }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    write(shelf);
    let r = probe();
    const by = (code) => r.filter((x) => x.code === code), sag = () => by('frame.deflection')[0];
    // the model: 8 beams, the four leg feet the lowest ends, held pinned; every join's spring an estimate
    assert.match(by('frame.solve')[0].text, /8 beams on 21 nodes, held at z1\.a \(pinned, a lowest end\), z2\.a \(pinned, a lowest end\), z3\.a \(pinned, a lowest end\), z4\.a \(pinned, a lowest end\)/);
    assert.match(by('frame.solve')[0].text, /8 joins' springs \(8 blind: an estimate\), 8 of them an estimate until the joint rig \(issue 264\) measures it/);
    // The hand calculation, the 5 kg alone. x1 spans L = 600 mm between the legs' faces, each end on a rigid offset
    // e = 10 mm from a leg's axis; P = 5 × 9.80665 = 49.03 N at mid-span. 2020 HFS5: I = 7420 mm⁴, A = 183 mm²,
    // J = 809.3 mm⁴ (worked out from the outline); A6N01: E = 69972 MPa, G = E / 2(1 + 0.33) = 26305 MPa.
    // Each front corner turns by θ (the load is symmetric, so the corners turn equally and nothing sways). What holds
    // a corner from turning, K: the leg, pinned at its foot h = 390 mm below, 3EI/h = 3.994e6 N·mm/rad; and the side
    // beam twisting (GJ/Ls = 26305 × 809.3 / 300 = 7.096e4) in series with the back corner, which its leg (3EI/h) and
    // the back beam (2EI/L = 1.731e6, turned the same way at both ends) hold: 1 / (1/7.096e4 + 1/5.725e6) = 7.009e4.
    // K = 3.994e6 + 7.009e4 = 4.064e6 N·mm/rad.
    // x1 as a beam fixed at both ends that turn by θ: its end moment M = PL/8 − (2EI/L) θ; the corner carries M and
    // the end shear P/2 on the offset e: M + Pe/2 = K θ, so θ = (PL/8 + Pe/2) / (K + 2EI/L)
    //   = (3677.5 + 245.2) / (4.064e6 + 1.731e6) = 6.770e-4 rad, and M = 3677.5 − 1.731e6 × 6.770e-4 = 2505.9 N·mm.
    // Mid-span sag: the offset's drop e θ, the simply supported beam's PL³/48EI less the end moments' M L²/8EI, and the
    // leg's shortening (P/2) h / EA:
    //   0.00677 + 0.42498 − 0.21719 + 0.00075 = 0.2153 mm, joins rigid.
    // With each join a spring k = 1.5e6 N·mm/rad (blind, an estimate) at the beam's end, in series: the beam's end turns
    // θ + M/k. With r = (2EI/L)/k = 1.154: M = (PL/8 − (2EI/L) θ) / (1 + r), and the corner's θ = (PL/8 / (1 + r) +
    // Pe/2) / (K' + (2EI/L) / (1 + r)), K' the same with the side beam's two twist springs (3e5 each) and the back beam's
    // two bending springs in its chain: θ = 4.030e-4, M = 1383.6 N·mm, sag = 0.3098 mm.
    const hand = { rigid: 0.21531, spring: 0.30984 };
    const v = sag().values;
    assert.ok(Math.abs(v.aloneRigid - hand.rigid) / hand.rigid < 0.01, `rigid joins: ${v.aloneRigid} mm against the hand's ${hand.rigid}`);
    assert.ok(Math.abs(v.alone - hand.spring) / hand.spring < 0.01, `the joins' springs: ${v.alone} mm against the hand's ${hand.spring}`);
    assert.ok(v.alone > v.aloneRigid * 1.3, 'the estimated springs give the larger sag');
    // with the frame's own weight beside the 5 kg: a little more, both ways; under span / 360 = 1.667 mm, and it says
    // which figure rests on what
    assert.deepEqual([sag().level, v.limit, v.sag > v.alone, v.rigid > v.aloneRigid], ['pass', 1.667, true, true]);
    assert.match(sag().text, /^x1 at x1\.top@50% sags 0\.3\d\d mm, with the joins' springs; 0\.2\d\d mm with the joins rigid \(of these, 0\.31 and 0\.215 mm from the 5 kg there alone\)\. The first rests on 8 joins' springs \(8 blind: an estimate\), so the true sag lies near it, and the rigid figure is the least it can be: against 1\.667 mm, x1's span, 600 mm, over 360/);
    assert.equal(sag().refs.restsOn, 'estimate');
    assert.deepEqual(sag().at.map(Math.round), [310, 0, 390]);
    // stress: x1 the most stressed, far under A6N01's 205 MPa; the blind joins' moments said, with no strength to
    // check them against; buckling: the legs in compression, the most loaded carrying about half the 5 kg and its share of the weight
    const st = by('frame.stress');
    assert.match(st.find((x) => x.level === 'pass').text, /every beam stays under its alloy's strength with 2 times to spare: the most stressed is x1, 8\.\d+ MPa against 205 MPa/);
    assert.match(st.find((x) => x.level === 'info').text, /8 joins \(blind\) have no strength in the kit to check against: the largest moment is 2\.\d+ N·m bending/);
    const legs = by('frame.buckling').find((x) => x.values.compression);
    assert.ok(legs.values.compression > 24.5 && legs.values.compression < 30, JSON.stringify(legs.values));
    assert.match(by('frame.buckling').find((x) => x.values.factor).text, /the whole frame, with the joins' springs, buckles first at \d+(\.\d)? times its load as drawn/);

    // measured joins: the workspace's joins set with blind's springs measured on the joint rig: the same figures, and
    // the finding says it rests on measured joins
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    const rule = (value) => ({ value, unit: 'N mm/rad', rule: 'measured on the joint rig', kind: 'measured', source: 'the joint rig', checked: '2026-11-17' });
    fs.writeFileSync(path.join(ws, 'rules/joins.json'), JSON.stringify({ name: 'joins', part: 'joins', rules: { blind_bending: rule(1.5e6), blind_twist: rule(3e5) } }));
    r = probe();
    assert.match(sag().text, /It rests on 8 joins' springs \(8 blind: measured\): against/);
    assert.equal(sag().refs.restsOn, 'measured');
    fs.rmSync(path.join(ws, 'rules/joins.json'));

    // feet: a foot on each leg's end a holds the frame there; fixed supports (said in "frame") hold it more stiffly;
    // a limit of 0.2 mm fails it, saying by how much; 300 kg fails x1's alloy
    write({ ...shelf, items: [...shelf.items, ...['z1', 'z2', 'z3', 'z4'].map((z, i) => ({ id: `f${i + 1}`, fitting: { kind: 'foot', profile: P }, at: `${z}.a` }))] });
    r = probe();
    assert.match(by('frame.solve')[0].text, /held at z1\.a \(pinned, f1, a foot\), z2\.a \(pinned, f2, a foot\)/);
    const pinned = sag().values.alone;
    write({ ...shelf, frame: { supports: { 'z1.a': 'fixed', 'z2.a': 'fixed', 'z3.a': 'fixed', 'z4.a': 'fixed' }, limit: 0.2 } });
    r = probe();
    assert.match(by('frame.solve')[0].text, /held at z1\.a \(fixed, frame\.supports\)/);
    assert.ok(sag().values.alone < pinned, `fixed feet ${sag().values.alone} mm, pinned ${pinned}`);
    assert.equal(sag().level, 'fail');
    assert.match(sag().text, /against 0\.2 mm, the assembly's frame\.limit: 1\.\d+ times over\. Stiffen the beam/);
    write({ ...shelf, loads: [{ mass: 300, at: 'x1.top@50%' }] });
    r = probe();
    const x1 = by('frame.stress').find((x) => x.refs.beam === 'x1');
    assert.equal(x1.level, 'fail');
    assert.match(x1.text, /^x1: \d+\.\d+ MPa at worst .* against al6n01-t5's 205 MPa: 0\.\d+ times under it, where about 2 is wanted/);
    // a moving mass: a cart sliding along x2 (a bearing standing in for it, 2 kg on it), from 50 to 300 mm along: solved
    // at each end of its travel and as drawn, the worst named; and a named point, x2's middle
    write({ ...shelf, items: [...shelf.items, { id: 'cart', bought: 'bearing-608' }], joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'x2', at: [0, 10, 50], axis: [0, 0, 1] }, child: { item: 'cart', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 250 }],
      loads: [...shelf.loads, { mass: 2, at: 'cart.bore' }], frame: { points: ['x2.top@50%'] } });
    r = probe();
    assert.match(by('frame.solve')[0].text, /1 item mounted on it and 2 loads, in 3 poses/);
    const cart = by('frame.deflection').find((x) => x.refs.where === 'cart.bore'), mid = by('frame.deflection').find((x) => x.refs.where === 'x2.top@50%');
    assert.deepEqual([cart.refs.pose, mid.refs.pose, Math.round(cart.at[0])], ['slide at 250', 'slide at 250', 310]);
    assert.ok(cart.values.alone > 0.05 && cart.values.sag > cart.values.alone, JSON.stringify(cart.values));
    // refused by name: a support on what is not a beam of the frame
    write({ ...shelf, frame: { supports: { 'q9.a': 'pinned' } } });
    r = probe();
    assert.deepEqual(by('frame.solve').map((x) => [x.level, x.text]), [['fail', 'frame: frame.supports: "q9.a" is on a beam of the frame, as z1.a or x1.bottom@50% (beams: z1, z2, z3, z4, x1, x2, y1, y2)']]);
    // the check view: cad beams draws the sag, scaled and saying so
    write(shelf);
    assert.match(cad('beams', 'frame/shelf'), /the frame's sag, drawn [\d.]+ times its size \(a check view\): exports[\\/]frame[\\/]shelf\.frame-sag\.svg/);
    assert.match(fs.readFileSync(path.join(ws, 'exports/frame/shelf.frame-sag.svg'), 'utf8'), /deflection drawn [\d.]+ times its size \(scaled\): 0\.3\d\d mm at most/);
  } finally { done(); }
});

test('frame checks: a figure on estimated joins says so even where the springs change nothing, and a beam riding a moving joint weighs on the frame', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/portal.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a portal: two 2020 legs 400 mm tall, fixed at their feet, a 600 mm beam x1 joined blind between them 390 mm up
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to });
    const portal = { title: 'Portal', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 400]), beam('z2', [620, 0, 0], [620, 0, 400]), beam('x1', [10, 0, 390], [610, 0, 390])],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'z1.back@390' }, { kind: 'blind', a: 'x1.b', b: 'z2.front@390' }], frame: { supports: { 'z1.a': 'fixed', 'z2.a': 'fixed' } } };
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/portal');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r;
    const by = (code) => r.filter((x) => x.code === code), point = (where) => by('frame.deflection').find((x) => x.refs.where === where);

    // 1. the middle of leg z1 hardly sags at all, with the joins' springs or rigid: the two figures match, yet both
    // rest on the two blind joins' estimated springs, and refs.restsOn says so
    write({ ...portal, loads: [{ mass: 5, at: 'x1.top@50%' }], frame: { ...portal.frame, points: ['z1.top@50%'] } });
    r = probe();
    const leg = point('z1.top@50%');
    assert.match(leg.text, /It rests on 2 joins' springs \(2 blind: an estimate\)/);
    assert.equal(leg.refs.restsOn, 'estimate');
    assert.equal(point('x1.top@50%').refs.restsOn, 'estimate');

    // 2. a 2 m beam g rides a slide along x1 (from 100 to 400 mm along it), its middle on the slide: g is not part of
    // the frame, and its whole weight hangs on x1 where the slide is. The hand check is superposition: x1 is linear,
    // so x1's sag 400 mm along with g at the slide's far end equals its sag with g's mass set down as a load on
    // x1.top@400 (its centre straight above the node: no moment, the force alone), within 1%
    const ride = { ...portal, items: [...portal.items, { id: 'g', beam: { profile: P, length: 2000 } }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 100], axis: [0, 0, 1] }, child: { item: 'g', at: [0, 0, 1000], axis: [0, 0, 1] }, min: 0, max: 300 }],
      frame: { ...portal.frame, points: ['x1.top@400'] } };
    write(ride);
    r = probe();
    const solve = by('frame.solve')[0], g = solve.refs.riding.find((x) => x.id === 'g');
    assert.doesNotMatch(solve.text, /Left out/);
    assert.match(solve.text, /g rides on slide, its [\d.]+ kg weighed on the frame/);
    // 2020 HFS5 weighs about 0.5 kg/m (its sheet's mass per metre): 2 m of it about 1 kg
    assert.ok(g.kg > 0.8 && g.kg < 1.3, JSON.stringify(g));
    const riding = point('x1.top@400');
    assert.equal(riding.refs.pose, 'slide at 300');
    write({ ...portal, loads: [{ mass: g.kg, at: 'x1.top@400' }], frame: { ...portal.frame, points: ['x1.top@400'] } });
    r = probe();
    const set = point('x1.top@400');
    assert.ok(Math.abs(riding.values.sag - set.values.sag) / set.values.sag < 0.01, `riding ${riding.values.sag} mm, set down ${set.values.sag} mm`);
    assert.ok(Math.abs(riding.values.rigid - set.values.rigid) / set.values.rigid < 0.01, `rigid: riding ${riding.values.rigid} mm, set down ${set.values.rigid} mm`);
    // and without g at all, x1 sags less: its weight was not dropped
    write({ ...portal, frame: { ...portal.frame, points: ['x1.top@400'] } });
    r = probe();
    assert.ok(point('x1.top@400').values.sag < riding.values.sag * 0.8, `bare ${point('x1.top@400').values.sag} mm, with g ${riding.values.sag} mm`);
  } finally { done(); }
});

// cad's tests of cad rules: rule sets checked, drawn and drafted, and the values and reasons read from them. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace, object, CAD } from './helpers.mjs';

test('cad rules check, draw and draft: a set held to its rules, drawn from them, and a datasheet\'s figures offered, never trusted', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('rules', 'check', 'nema17'), /1 of 1 rule sets pass/);
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'rules/bad.json'), JSON.stringify({ name: 'bad', rules: { width: { value: 3, unit: 'mm', rule: 'A width in mm', kind: 'guess', checked: 'soon' } } }));
    const r = cad.run('rules', 'check', 'bad');
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
    const copy = cad.run('rules', 'check', 'm3');
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
    assert.equal(cad.run('rules', 'draw', 'x1c').status, 1);
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
    const thin = JSON.parse(fs.readFileSync(new URL('../rules/m3.json', CAD), 'utf8')); thin.name = 'thin'; thin.rules.head.value = 3.5; thin.rules.lengths.value = [6, 5, 8];
    fs.writeFileSync(path.join(ws, 'rules/thin.json'), JSON.stringify(thin));
    const t = cad.run('rules', 'check', 'thin', '--json');
    assert.equal(t.status, 1); assert.deepEqual(JSON.parse(t.stdout)[0].findings.map((x) => [x.code, x.rule]), [['rules.order', 'lengths'], ['rules.order', 'head']]);
    assert.match(JSON.parse(t.stdout)[0].findings[1].text, /head \(3.5\) is not larger than clearance_loose \(3.6\): a cap head is wider than the loosest clearance hole/);
    // the drawings in the rules package are what the sets say today
    for (const f of fs.readdirSync(new URL('../rules/drawings/', CAD))) { cad('rules', 'draw', f.slice(0, -4), '--out', 'x.svg'); assert.equal(fs.readFileSync(path.join(ws, 'x.svg'), 'utf8'), fs.readFileSync(new URL(`../rules/drawings/${f}`, CAD), 'utf8').replace(/\r\n/g, '\n'), `${f} is stale: cad rules draw it again`); } // (git on Windows checks it out with CRLF)
  } finally { done(); }
});

test('cad rules for a beam\'s profile: a draft filled from a maker\'s sheet passes the check and draws as the sheet does; slots, bores and section figures are held to sense', () => {
  const { ws, cad, done } = workspace();
  try {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(ws, f), 'utf8')), write = (f, x) => fs.writeFileSync(path.join(ws, f), JSON.stringify(x, null, 2)), run = (...a) => cad.run(...a);
    const vocabulary = JSON.parse(fs.readFileSync(new URL('../rules/vocabulary.json', CAD), 'utf8')), published = (n) => JSON.parse(fs.readFileSync(new URL(`../rules/${n}.json`, CAD), 'utf8'));
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
    for (const [k, r] of Object.entries(draft.rules)) { assert.equal(r.kind, 'estimate', k); assert.match(r.source, /^DRAFT, not read from a sheet yet: /); assert.doesNotMatch(r.rule, /DRAFT/, `${k}'s rule is the field's own sentence, which a person keeps`); assert.equal(r.unit, vocabulary.fields[k].unit, `${k} in its unit`); }
    // it checks as it stands, and says by name that its figures are still the draft's until each is filled or deleted
    const drafted = cad('rules', 'check', 'my-2020'); assert.match(drafted, /1 of 1 rule sets pass \(1 with something to know\)/);
    assert.match(drafted, new RegExp(`WARN  ${Object.keys(draft.rules).length} of its ${Object.keys(draft.rules).length} figures are still the draft's, not read from a sheet: family, series, .* and \\d+ more\\. Fill each from the maker's sheet .*\\(rules\\.draft\\)`));
    assert.deepEqual(JSON.parse(run('rules', 'check', 'my-2020', '--json').stdout)[0].findings.find((x) => x.code === 'rules.draft').refs.rules, Object.keys(draft.rules));
    // filled as the guide says, field by field: its value, kind spec, the sheet as its source, the date, the rule left
    // as the draft wrote it. Every figure then counts as read (the draft's rule once said DRAFT, and the warning stayed)
    const lit = read('rules/my-2020.json'), hfs5 = published('profile-2020-misumi-hfs5').rules;
    lit.name = 'lit-2020';
    for (const k of Object.keys(lit.rules)) { if (hfs5[k] && k !== 'slot') Object.assign(lit.rules[k], { value: hfs5[k].value, kind: 'spec', source: 'MISUMI HFS5-2020, catalogue p. 2-529', checked: '2026-11-20' }); else if (k !== 'slot') delete lit.rules[k]; }
    Object.assign(lit.rules.slot, { value: 'slot-6-misumi', kind: 'spec', source: 'MISUMI HFS5-2020, catalogue p. 2-529', checked: '2026-11-20' });
    write('rules/lit-2020.json', lit);
    assert.ok(!JSON.parse(run('rules', 'check', 'lit-2020', '--json').stdout)[0].findings.some((x) => x.code === 'rules.draft'), 'a literal fill leaves no rules.draft');
    // a figure from a PDF's draft keeps its DRAFT rule until a person names it: still the draft's while it is an estimate
    lit.rules.width = { ...lit.rules.width, rule: 'DRAFT: name and check me. From: "20 x 20"', kind: 'estimate' }; write('rules/lit-2020.json', lit);
    assert.deepEqual(JSON.parse(run('rules', 'check', 'lit-2020', '--json').stdout)[0].findings.find((x) => x.code === 'rules.draft').refs.rules, ['width']);
    fs.rmSync(path.join(ws, 'rules/lit-2020.json'));
    cad.refused(/already exists \(--force replaces it\)/, 'rules', 'draft', 'profile', 'my-2020');
    cad.refused(/usage: cad rules draft profile <name>/, 'rules', 'draft', 'profile');
    cad('rules', 'draft', 'slot', 'my-slot'); cad('rules', 'draft', 'slot_nut', 'my-nut');
    assert.deepEqual(Object.keys(read('rules/my-slot.json').rules), Object.keys(vocabulary.drafts.slot)); assert.deepEqual(Object.keys(read('rules/my-nut.json').rules), Object.keys(vocabulary.drafts.slot_nut));
    assert.match(cad('rules', 'check', 'my-slot', 'my-nut'), /2 of 2 rule sets pass \(2 with something to know\)/);
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
    assert.equal(svg.replaceAll('my-slot', 'slot-6-misumi').replaceAll('my-2020', 'profile-2020-misumi-hfs5'), fs.readFileSync(new URL('../rules/drawings/profile-2020-misumi-hfs5.svg', CAD), 'utf8').replace(/\r\n/g, '\n'), 'and it is the drawing of the published set');
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
    write('rules/my-nut.json', nut); assert.match(cad('rules', 'check', 'my-nut'), /^my-nut: passes, 1 to know\n {2}WARN {2}12 of its 12 figures are still the draft's.*\(rules\.draft\)\n1 of 1 rule sets pass \(1 with something to know\)\n$/, 'it fits its slot: the only thing to know is that it is still a draft');
    nut.rules.width.value = 13; nut.rules.height.value = 5; write('rules/my-nut.json', nut);
    const n = run('rules', 'check', 'my-nut'); assert.equal(n.status, 1); assert.match(n.stdout, /it is 13 mm across, and slot-6-misumi is 12 mm wide under its lips/); assert.match(n.stdout, /it is 5 mm tall, and slot-6-misumi has 4 mm under its lips/);
    // a measured outline beside the set takes the drawn one's place, through its schema
    fs.mkdirSync(path.join(ws, 'rules/outlines'));
    write('rules/outlines/my-2020.json', { name: 'my-2020', source: 'a bar from the shelf, traced', licence: 'my own measurement', checked: '2026-11-15', loops: [[[-10, -10], [10, -10], [10, 10], [-10, 10]], [[-2, -2], [2, -2], [2, 2], [-2, 2]]] });
    const measured = run('rules', 'check', 'my-2020'); assert.equal(measured.status, 0); assert.match(measured.stdout, /area: the sheet says 183 mm², the measured outline comes to 384/);
    cad('rules', 'draw', 'my-2020'); assert.ok(fs.readFileSync(path.join(ws, 'my-2020.svg'), 'utf8').includes('drawn from its outline: a bar from the shelf, traced'));
    write('rules/outlines/my-2020.json', { name: 'my-2020', source: 'a bar', loops: [[[0, 0], [1, 0]]] });
    const bad = run('rules', 'check', 'my-2020'); assert.equal(bad.status, 1); assert.match(bad.stdout, /outlines\/my-2020\.json: \(top\): needs "licence"/); assert.match(bad.stdout, /loops\[0\]: needs at least 3 entries/);
    cad.refused(/rule sets pass/, 'rules', 'check'); // an outline is not taken for a rule set
  } finally { done(); }
});

test('the printed plastics ABS, ASA and PA-CF load in cad values with their units, and a strain limit reads off them', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/plastics', { uses: ['abs', 'asa', 'pa_cf'], variables: {
      // PA-CF's strain at its strength along the layers: 88 / 3860 = 0.0228
      give: { value: 'pa_cf.strength / pa_cf.modulus', rule: 'Strain at strength' },
    } }, "import jscad from '@jscad/modeling'\nexport function main () { return jscad.primitives.cuboid({ size: [10, 10, 10], center: [0, 0, 5] }) }\n");
    const all = JSON.parse(cad('values', 'demo/plastics', '--json')).values, at = (n) => all.find((v) => v.name === n);
    assert.ok(Math.abs(at('give').value - 88 / 3860) < 1e-9, JSON.stringify(at('give')));
    const rules = JSON.parse(cad('rules', 'demo/plastics', '--json')).variables, rule = (n) => rules.find((v) => v.name === n);
    assert.deepEqual([rule('abs.modulus').value, rule('abs.modulus').unit, rule('asa.strength_z').value, rule('asa.strength_z').unit, rule('pa_cf.density').unit], [2246.6, 'MPa', 35, 'MPa', 'g/cm³']);
  } finally { done(); }
});

test('a design reads the weak end of a printed plastic\'s range (pa_cf.strength_z.low) in cad values, with its unit, and cad why says where it comes from', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/weak', { uses: ['pa_cf'], variables: {
      // Bambu Lab PAHT-CF across the layers: 64 ± 3 MPa, so the weak end is 61 MPa; at half of it, 30.5 MPa
      allowed: { value: 'pa_cf.strength_z.low / 2', unit: 'MPa', rule: 'Allowed stress across the layers, twice the margin on the weak end' },
    } }, "import jscad from '@jscad/modeling'\nexport function main () { return jscad.primitives.cuboid({ size: [10, 10, 10], center: [0, 0, 5] }) }\n");
    const all = JSON.parse(cad('values', 'demo/weak', '--json')).values, at = (n) => all.find((v) => v.name === n);
    assert.equal(at('allowed').value, 30.5, JSON.stringify(at('allowed')));
    const tree = JSON.parse(cad('why', 'demo/weak.allowed', '--json')), end = tree.reads[0];
    assert.deepEqual([end.name, end.value, end.unit, end.reads[0].name, end.reads[0].value], ['pa_cf.strength_z.low', 61, 'MPa', 'pa_cf.strength_z', 64]);
    assert.match(end.rule, /^the low end of the range pa_cf\.strength_z is found in/);
    assert.match(end.source, /PAHT-CF/);
  } finally { done(); }
});

test('cad why explains a rule of a set named with a hyphen as an expression writes it (pla_prusament.strength_z and its low end), as cad values reads it', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/hyphen', { uses: ['pla-prusament'], variables: {
      // Prusament PLA across the layers: 37.6 ± 4 MPa, so the weak end is 33.6 MPa; at half of it, 16.8 MPa; half the
      // middle value, 18.8 MPa
      weak: { value: 'pla_prusament.strength_z.low / 2', unit: 'MPa', rule: 'Half the weak end across the layers' },
      mid: { value: 'pla_prusament.strength_z / 2', unit: 'MPa', rule: 'Half the value across the layers' },
    } }, "import jscad from '@jscad/modeling'\nexport function main () { return jscad.primitives.cuboid({ size: [10, 10, 10], center: [0, 0, 5] }) }\n");
    const weak = JSON.parse(cad('why', 'demo/hyphen.weak', '--json')), end = weak.reads[0];
    assert.equal(weak.value, 16.8);
    assert.deepEqual([end.name, end.value, end.unit, end.reads[0].name, end.reads[0].value], ['pla_prusament.strength_z.low', 33.6, 'MPa', 'pla-prusament.strength_z', 37.6]);
    assert.match(end.rule, /^the low end of the range pla-prusament\.strength_z is found in/);
    assert.match(end.source, /Prusament PLA/);
    const mid = JSON.parse(cad('why', 'demo/hyphen.mid', '--json')).reads[0];
    assert.deepEqual([mid.name, mid.value, mid.unit], ['pla_prusament.strength_z', 37.6, 'MPa']);
    assert.match(mid.source, /Prusament PLA/);
  } finally { done(); }
});

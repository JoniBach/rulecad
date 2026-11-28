// cad's tests of what a newcomer meets: the quick start, cad new, --dry-run, the command line, settings, cad agents and mistakes named. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspace, object, run } from './helpers.mjs';

test('the quick start: new, check, tweak, export, link, with the printer rules copied in', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('new', 'bathroom/soap-tray'), /made projects\/bathroom\/objects\/soap-tray/);
    const checked = cad('check', 'bathroom/soap-tray');
    assert.match(checked, /every measurement is a variable/);
    assert.match(checked, /fits the bed/);
    assert.ok(fs.existsSync(path.join(ws, 'rules/x1c.json')), 'the printer rules are the workspace\'s own copy');
    assert.match(cad('check', 'bathroom/soap-tray', '--set', 'width=60'), /60 × 30 × 10 mm/);
    cad.refused(/from 10 to 200/, 'check', 'bathroom/soap-tray', '--set', 'width=999');
    assert.match(cad('export', 'bathroom/soap-tray'), /soap-tray@0\.1\.0\.3mf/);
    assert.match(cad('link', 'bathroom/soap-tray', '--md'), /\[View and download\]\(https:\/\/.*#m=1\./);
  } finally { done(); }
});

test('cad new <project>/<object> answers as the other edits: --dry-run writes nothing, --json says what it makes, refused by name', () => {
  const { ws, cad, done } = workspace();
  const file = (f) => path.join(ws, 'projects', f), json = (...a) => JSON.parse(cad(...a, '--json'));
  try {
    // a dry run on a project that is not there yet: nothing on disk, the project, both files and the listing named
    const d = json('new', 'shelf/widget', '--dry-run');
    assert.deepEqual([d.command, d.file, d.written, d.dryRun, d.made], ['new', 'projects/shelf/objects/widget.json', false, true, ['projects/shelf/project.json', 'projects/shelf/objects/widget.js', 'projects/shelf/objects/widget.json']]);
    assert.deepEqual(d.changes.map((c) => [c.op, c.path]), [['make', 'projects/shelf/project.json'], ['make', 'projects/shelf/objects/widget.js'], ['make', 'projects/shelf/objects/widget.json'], ['add', 'objects.0']]);
    assert.equal(d.changes[2].after.name, 'widget');
    assert.ok(d.findings.some((f) => f.code === 'schema' && f.level === 'pass'), JSON.stringify(d.findings));
    assert.ok(!fs.existsSync(file('shelf')), 'a dry run writes nothing');
    assert.match(cad('new', 'shelf/widget', '--dry-run'), /^dry run, nothing written: would make projects\/shelf\/objects\/widget\.\{js,json\}/);
    assert.ok(!fs.existsSync(file('shelf')), 'a dry run in words writes nothing');
    // made for real, then a second object is added to the project's list, keeping its layout
    assert.match(cad('new', 'shelf/widget'), /^made projects\/shelf\/objects\/widget\.\{js,json\}/);
    const second = json('new', 'shelf/bracket');
    assert.deepEqual([second.written, second.made, second.changes.at(-1)], [true, ['projects/shelf/objects/bracket.js', 'projects/shelf/objects/bracket.json'], { op: 'add', path: 'objects.1', after: 'bracket' }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(file('shelf/project.json'), 'utf8')).objects, ['widget', 'bracket']);
    // refused by name, with nothing written
    const before = fs.readFileSync(file('shelf/objects/widget.json'), 'utf8');
    assert.equal(JSON.parse(cad.refused('object.exists', 'new', 'shelf/widget', '--json')).error.code, 'object.exists');
    assert.equal(fs.readFileSync(file('shelf/objects/widget.json'), 'utf8'), before);
    assert.equal(JSON.parse(cad.refused('edit.name', 'new', 'shelf/Widget', '--json')).error.code, 'edit.name');
  } finally { done(); }
});

test('--dry-run writes nothing in every command that takes it, and any other command refuses it by name', () => {
  const { ws, cad, done } = workspace();
  const file = path.join(ws, 'projects/shed/objects/hinge.json'), read = () => fs.readFileSync(file, 'utf8');
  try {
    cad('new', 'shed/hinge');
    const before = read();
    // cad set on an object's variables: every check run, nothing written (the template's width is 40, its range 10 to 200)
    assert.match(cad('set', 'shed/hinge', 'width=45', '--dry-run'), /^dry run, nothing written: would set width in projects\/shed\/objects\/hinge\.json/);
    assert.equal(read(), before, 'an object set dry run leaves the file as it was');
    const j = JSON.parse(cad('set', 'shed/hinge', 'width=45', '--dry-run', '--json'));
    assert.deepEqual([j.changed, j.written, j.dryRun], [['width'], false, true]);
    assert.equal(read(), before);
    // a dry run is refused as the edit would be, out of range or unknown, with nothing written
    cad.refused(/not changed: width = 500 is outside its range, 10 to 200/, 'set', 'shed/hinge', 'width=500', '--dry-run');
    cad.refused(/has no variable "nothing"/, 'set', 'shed/hinge', 'nothing=1', '--dry-run');
    assert.equal(read(), before);
    // a refused edit never touched the file: the checks run before the one write
    cad.refused(/outside its range/, 'set', 'shed/hinge', 'width=500');
    assert.equal(read(), before, 'a refused set leaves the file byte for byte');
    // made for real, the same edit writes
    assert.deepEqual(JSON.parse(cad('set', 'shed/hinge', 'width=45', '--json')).written, true);
    assert.equal(JSON.parse(read()).variables.width.value, 45);
    // a command that would pass the flag over is refused before it runs, naming the ones that take it
    const after = read();
    for (const a of [['measured', 'shed/box', 'x1c.press=0.08'], ['check', 'shed/hinge'], ['export', 'shed/hinge'], ['frame', 'shed/box'], ['frame', 'shed/box', '--size']]) {
      const out = cad.refused('takes no --dry-run', ...a, '--dry-run');
      assert.match(out, new RegExp(`cad ${a[0]}${a[2] === '--size' ? ' --size' : ''} takes no --dry-run, so nothing is run: the commands that take one are cad new, set, add, remove, move, release, frame --expand and frame --size --write`), a.join(' '));
    }
    assert.equal(read(), after);
    assert.ok(!fs.existsSync(path.join(ws, 'exports')), 'the refused export wrote nothing');
  } finally { done(); }
});

test('your own printer, and no extras configured', () => {
  const { ws, cad, done } = workspace({ printer: 'tiny' });
  try {
    fs.mkdirSync(path.join(ws, 'rules'));
    fs.writeFileSync(path.join(ws, 'rules/tiny.json'), JSON.stringify({ name: 'tiny', rules: { bed: { value: 5 }, overhang: { value: 45 }, layer: { value: 0.2 } } }));
    cad('new', 'demo/block');
    cad.refused(/bigger than the 5 mm bed/, 'check', 'demo/block');
    cad.refused(/no "show" target/, 'show', 'demo/block');
  } finally { done(); }
});

test('"display" settings and parts are read as the on-screen copy ("mirror", the old name, too)', async () => {
  const { readObject } = await import('../lib/design.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'display-')), json = path.join(dir, 'x.json');
  try {
    fs.writeFileSync(json, JSON.stringify({ display: { smooth: 8 }, parts: { legend: { display: false }, cap: {} } }));
    const o = readObject({ json });
    assert.deepEqual(o.mirror, { smooth: 8 });
    assert.equal(o.parts.legend.mirror, false);
    assert.equal(o.parts.cap.mirror, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
    cad.refused(/AGENTS\.md here has been edited .*: it is kept as it is \(cad agents --force replaces it\)/, 'agents');
    assert.match(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Our house rules/);
    cad('agents', '--force');
    assert.doesNotMatch(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Our house rules/);
  } finally { done(); }
});

test('a mistake in a design is named, with its file and line: a misspelt variable, no shape returned, a syntax error, broken JSON', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { width: { value: 10, unit: 'mm', rule: 'Width' } };
    const shape = (expr) => `import jscad from '@jscad/modeling'\nexport function main (v) {\n  ${expr}\n}\n`;
    for (const trust of [{}, { CAD_TRUST: '1' }]) { // in the sandbox, and in the tool's own process
      const tryIt = (name, js) => { object(ws, `demo/${name}`, { variables: vars }, js); return run(ws, ['check', `demo/${name}`], { ...trust, CAD_NO_CACHE: '1' }); }; // (each run afresh: a kept build doesn't run the design)
      const failed = (r) => { assert.equal(r.code, 1, r.out); return r.out; };
      const typo = tryIt('typo', shape('return jscad.primitives.cuboid({ size: [v.widht, v.width, v.width] })'));
      assert.match(typo.out, /v\.widht: the design has no variable "widht" \(did you mean "width"\?\).*typo\.js:3\)/, 'not undefined, and another shape drawn');
      assert.doesNotMatch(typo.out, /Warning/, 'Node\'s notes on the sandbox\'s own flags stay out of it');
      assert.equal(typo.code, 1);
      assert.match(failed(tryIt('nothing', shape('jscad.primitives.cuboid({ size: [v.width, v.width, v.width] })'))), /main\(\) returned no shape.*nothing\.js/);
      assert.match(failed(tryIt('syntax', shape('retrun jscad.primitives.cuboid({ size: [v.width, v.width, v.width] })'))), /Unexpected identifier.*retrun.*syntax\.js:3\)/);
      assert.match(failed(tryIt('runtime', shape('return v.width.nope.deeper'))), /reading 'deeper'.*runtime\.js:3\)/);
      const said = tryIt('says', shape("console.log('width is', v.width)\n  return jscad.primitives.cuboid({ size: [v.width, v.width, v.width], center: [0, 0, v.width / 2] })"));
      assert.equal(said.code, 0, said.out);
      assert.match(said.out, /width is 10/, 'a design may print what it wants to see');
      assert.match(said.out, /fits the bed/);
    }
    // a name only the on-screen copy sets may be asked for when it isn't there
    object(ws, 'demo/shown', { variables: vars, display: { smooth: 8 } }, shape('return jscad.primitives.cylinder({ radius: v.width, height: v.width, center: [0, 0, v.width / 2], ...(v.smooth ? { segments: v.smooth } : {}) })'));
    assert.match(cad('check', 'demo/shown'), /fits the bed/);
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/typo.json'), '{ "name": "typo", ');
    cad.refused(/not valid JSON: .*\(projects[\\/]demo[\\/]objects[\\/]typo\.json\)/, 'check', 'demo/typo');
    cad.refused(/not valid JSON/, 'set', 'demo/typo', 'width=5'); // and an edit says so too, at once
    fs.writeFileSync(path.join(ws, 'cad.config.json'), '{ "printer": ');
    const cfg = run(ws, ['check', 'demo/shown']); assert.equal(cfg.code, 1, cfg.out);
    assert.match(cfg.out, /^not valid JSON: .*\(cad\.config\.json\)\s*$/, 'in one line, not a stack trace');
  } finally { done(); }
});

test('the command line: its version, a misspelt command or option named, options before or after names, flags that take no value', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'demo/block');
    assert.match(cad('--version'), /^\d+\.\d+\.\d+\s*$/);
    for (const h of ['--help', '-h', 'help']) assert.match(cad(h), /^cad: JSCAD designs/);
    const wrong = run(ws, ['chekc', 'demo/block']);
    assert.match(wrong.out, /^no command "chekc" \(did you mean "check"\?\)/); assert.equal(wrong.code, 1);
    const odd = run(ws, ['check', 'demo/block', '--jsno']);
    assert.match(odd.out, /^no option --jsno \(did you mean --json\?\)/); assert.equal(odd.code, 1);
    assert.equal(cad.json('check', '--json', 'demo/block').object, 'demo/block', 'options first');
    cad.refused(/--set needs a value/, 'check', 'demo/block', '--set');
    cad.refused(/usage: cad add fit\|joint\|item\|beam\|loop\|pose/, 'add');
    cad.refused(/usage: cad add fit\|joint\|item\|beam\|loop\|pose/, 'add', 'fit');
    // --new takes no value: what follows it is the next variable, not lost
    assert.match(cad('set', 'demo/block', '--new', 'lip=3', '--unit', 'mm', '--rule', 'A lip'), /set lip/);
    const vars = () => JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/objects/block.json'), 'utf8')).variables;
    assert.equal(vars().lip.value, 3);
    const rule = vars().width.rule;
    cad.refused(/--rule describes one variable/, 'set', 'demo/block', 'width=50', '--new', 'rim=2', '--rule', 'A rim');
    assert.equal(vars().width.rule, rule, 'no rule written over');
    // a value in a file name can't name another folder
    assert.match(cad('export', 'demo/block', '--set', 'width=50'), /block@0\.1\.0-width=50\.3mf/);
    // projects: a stray file among them is passed over, a missing one named
    fs.writeFileSync(path.join(ws, 'projects/.DS_Store'), '');
    assert.match(cad('status'), /^demo\n\s+block\s+unreleased/);
    cad.refused(/^no project "nope" \(projects: demo\)/, 'status', 'nope');
    // a preview whose Chrome can't run says so, and leaves no earlier picture to pass for it
    const png = path.join(ws, '.preview/demo/block.png');
    fs.mkdirSync(path.dirname(png), { recursive: true }); fs.writeFileSync(png, 'an earlier picture');
    const shot = run(ws, ['preview', 'demo/block'], { CAD_CHROME: path.join(ws, 'no-chrome-here') });
    assert.match(shot.out, /^couldn't start Chrome for the preview/); assert.equal(shot.code, 1);
    assert.ok(!fs.existsSync(png));
  } finally { done(); }
});

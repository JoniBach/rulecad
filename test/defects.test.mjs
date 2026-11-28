// Seeded defects: every case in test/defects/ is run through its check, and must give the finding its .expect.json
// names (and none of the findings it must not give). A case whose fault is still open is marked todo with its ticket,
// so the suite stays green while the gap shows; at the end, todo cases that now pass are listed, so the pull request
// that fixes a fault also takes its todo mark off. How a case is written: test/defects/README.md.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checks } from './defects/checks.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'defects');
const KEYS = new Set(['check', 'about', 'finding', 'code', 'level', 'text', 'must_not', 'within_ms', 'todo']);

// Every file under test/defects/, as paths relative to it ('printcheck/flipped-face.mjs'); files and folders whose
// names start with _ are helpers, and checks.mjs and README.md are the folder's own
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name.startsWith('_') ? []
  : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(root, path.join(dir, e.name)).split(path.sep).join('/')]));
const files = walk(root).filter((f) => !['checks.mjs', 'README.md'].includes(f));
const expects = files.filter((f) => f.endsWith('.expect.json')).sort();
const inputs = files.filter((f) => !f.endsWith('.expect.json'));
const caseOf = (f) => f.replace(/\.expect\.json$/, '');
const inputOf = (name) => inputs.filter((f) => f === `${name}.json` || f === `${name}.mjs`);

test('every seeded defect has an input, an expectation and a good twin', () => {
  assert.ok(expects.length, 'test/defects/ holds no cases');
  for (const f of inputs) assert.match(f, /\.(json|mjs)$/, `${f}: a case's input is a .json or an .mjs file`);
  for (const f of inputs) assert.ok(expects.includes(`${f.replace(/\.(json|mjs)$/, '')}.expect.json`), `${f} has no .expect.json beside it`);
  for (const f of expects) {
    const name = caseOf(f);
    assert.equal(inputOf(name).length, 1, `${name}: one input, ${name}.json or ${name}.mjs`);
    if (!name.endsWith('.good')) assert.ok(expects.includes(`${name}.good.expect.json`), `${name} has no good twin (${name}.good)`);
    else assert.ok(expects.includes(`${name.replace(/\.good$/, '')}.expect.json`), `${name} is a twin of no case`);
    const e = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    for (const k of Object.keys(e)) assert.ok(KEYS.has(k), `${f}: "${k}" isn't a field of a case (${[...KEYS].join(', ')})`);
    assert.ok(Object.hasOwn(checks, e.check), `${f}: check "${e.check}" isn't one of ${Object.keys(checks).join(', ')}`);
    assert.ok(e.code && e.level, `${f}: says the code and level the check must give`);
    assert.equal(typeof e.about, 'string', `${f}: "about" says in a sentence what is wrong with the case, or right with the twin`);
    if (e.todo != null) assert.match(e.todo, /^#\d+ /, `${f}: a todo names the ticket that fixes it, "#123 its title"`);
    if (name.endsWith('.good')) assert.equal(e.todo, undefined, `${f}: a good twin must pass today, so it is never todo`);
  }
});

const list = (x) => (Array.isArray(x) ? x : [x]);
const has = (finding, text) => text == null || String(finding.text ?? '').toLowerCase().includes(String(text).toLowerCase());
const describe = (fs_) => fs_.map((x) => `  ${x.level} ${x.code}: ${String(x.text ?? '').slice(0, 160)}`).join('\n');

const nowPassing = [];
for (const f of expects) {
  const name = caseOf(f), e = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const options = e.todo ? { todo: e.todo } : {};
  test(`${name}: ${e.check} gives ${list(e.code).join(' or ')} (${list(e.level).join(' or ')})`, options, async () => {
    const [file] = inputOf(name);
    let input;
    if (file.endsWith('.json')) input = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    else { input = (await import(pathToFileURL(path.join(root, file)).href)).default; if (typeof input === 'function') input = await input(); }
    const t0 = performance.now(), found = checks[e.check](input), ms = performance.now() - t0;
    if (process.env.DEFECTS_SHOW) console.log(`${name} (${ms.toFixed(0)} ms)\n${describe(found)}`);
    const want = found.filter((x) => list(e.code).includes(x.code) && list(e.level).includes(x.level) && has(x, e.text));
    assert.ok(want.length, `${name}: ${e.about}\nexpected ${list(e.code).join(' or ')} at ${list(e.level).join(' or ')}${e.text ? ` saying "${e.text}"` : ''}; the check said:\n${describe(found)}`);
    for (const m of e.must_not || []) {
      const not = typeof m === 'string' ? { code: m } : m;
      const bad = found.filter((x) => x.code === not.code && (not.level ? list(not.level).includes(x.level) : x.level !== 'pass') && has(x, not.text));
      assert.equal(bad.length, 0, `${name}: ${e.about}\nmust not give ${JSON.stringify(m)}, but said:\n${describe(bad)}`);
    }
    if (e.within_ms != null) assert.ok(ms <= e.within_ms, `${name}: took ${ms.toFixed(0)} ms, more than the ${e.within_ms} ms it is given`);
    if (e.todo) nowPassing.push(`${name} (${e.todo})`);
  });
}

// node's test runner never fails a todo test that passes, so say so here: the fix should take the todo mark off
after(() => {
  if (nowPassing.length) console.log(`\nSeeded defects marked todo that now pass: take "todo" out of their .expect.json\n${nowPassing.map((n) => `  ${n}`).join('\n')}`);
});

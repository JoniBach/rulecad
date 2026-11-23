// docs/gui-proposal.md points at its own plan's phases by number. When the phases are renumbered a bare "phase 4" goes
// on pointing at what used to be phase 4, so each one-phase reference also gives the phase's name, as section 8's
// table names it, and a range of phases stays inside the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const doc = fs.readFileSync(new URL('../docs/gui-proposal.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the gui proposal names each phase it points at as section 8 numbers it', () => {
  const plan = doc.slice(doc.indexOf('## 8. A plan in phases'), doc.indexOf('## 9.'));
  const phases = new Map([...plan.matchAll(/^\| (\d+)\. ([^|]+?) \|/gm)].map((m) => [Number(m[1]), m[2]]));
  assert.ok(phases.size >= 8, `section 8's table lists its phases (found ${phases.size})`);
  const text = doc.replace(plan, ''), wrong = [];
  for (const m of text.matchAll(/\bphases (\d+) (?:to|and) (\d+)/gi)) for (const n of [m[1], m[2]].map(Number)) if (!phases.has(n)) wrong.push(`${m[0]}: there is no phase ${n}`);
  for (const m of text.matchAll(/\bphase (\d+)(, "([^"]+)")?/gi)) {
    const n = Number(m[1]), name = phases.get(n);
    if (!name) wrong.push(`${m[0]}: there is no phase ${n}`);
    else if (m[3] !== name) wrong.push(`${m[0]}: write it as phase ${n}, "${name}"`);
  }
  assert.deepEqual(wrong, []);
});

test('the gui proposal sends dry runs only through commands that take one', () => {
  // section 5 previews every edit with a dry run. --dry-run is a flag any command could be given, and before cad's
  // Unreleased changes a command that did not handle it wrote anyway (cad set <project>/<object>, cad add fasten
  // --from-fits, cad frame --expand). Now bin/cad.mjs lists the commands that take one and refuses it everywhere else
  // (packages/cad/test.mjs tests both); this holds the proposal's editing tools to that list
  const cad = fs.readFileSync(new URL('../packages/cad/bin/cad.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const listed = /const DRY_RUNS = 'the commands that take one are cad ([^']+)'/.exec(cad);
  assert.ok(listed, 'bin/cad.mjs names the commands that take --dry-run');
  const takes = listed[1].replace(' and ', ', ').split(', '); // new, set, add, remove, move, release, frame --expand, frame --size --write
  const palette = doc.slice(doc.indexOf('## 4.'), doc.indexOf('## 5.')), wrong = [];
  for (const m of palette.matchAll(/^\| (Project|Object|Assembly|Frame) \| ([^|]+?) \| .*\| `cad (\w+)([^`]*)`([^|]*)\|$/gm)) {
    const [, , tool, verb, rest, after] = m;
    if (/\(read only\)/.test(after)) continue;
    const ok = verb === 'frame' ? takes.some((t) => t.startsWith('frame ') && t.slice(6).split(' ').every((f) => rest.includes(f))) : takes.includes(verb);
    if (!ok) wrong.push(`${tool}: cad ${verb}${rest} takes no --dry-run`);
  }
  assert.deepEqual(wrong, []);
  // the one edit without a dry run is said to send none, where the palette and section 5 describe the edits
  assert.match(palette, /Measured is the one edit without a dry run: `cad measured`/);
  assert.match(doc.slice(doc.indexOf('## 5.'), doc.indexOf('## 6.')), /Measured, whose command takes none, sends nothing until "Apply"/);
  // section 7 says what the dry run used to do, by name, for each command that passed it over
  const gaps = doc.slice(doc.indexOf('## 7.'), doc.indexOf('## 8.'));
  for (const c of ['cad set <project>/<object>', 'cad add fasten --from-fits', 'cad frame <ref> --expand', 'cad frame <ref> --size --write', 'cad measured', 'cad new <project>/<object>']) assert.ok(gaps.includes(`\`${c}\``), c);
  assert.match(doc.slice(doc.indexOf('### 1.1'), doc.indexOf('### 1.2')), /\| `cad new <project>\/<object>` \|/);
});

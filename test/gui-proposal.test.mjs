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
  // section 5 previews every edit with a dry run; the New object tool runs cad new <project>/<object>, which took
  // --dry-run only from cad's Unreleased changes (packages/cad/test.mjs tests the command), so the proposal lists it
  // among section 1.1's edits and says in section 7 what it lacked
  const verbs = doc.slice(doc.indexOf('### 1.1'), doc.indexOf('### 1.2'));
  assert.match(verbs, /\| `cad new <project>\/<object>` \|/);
  assert.match(doc, /`cad new <project>\/<object>` \(the New object tool\)/);
});

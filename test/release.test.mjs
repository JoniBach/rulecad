// scripts/release.mjs: change notes become one release, so feature PRs never touch versions, CHANGELOG headings or the
// lockfile (the cause of a conflict on every merge)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { release, parseNote, groupEntries, nextVersion } from '../scripts/release.mjs';

const repo = (pkgs) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-release-'));
  for (const [name, { version, deps = {}, changelog, notes = {} }] of Object.entries(pkgs)) {
    const dir = path.join(root, 'packages', name);
    fs.mkdirSync(path.join(dir, 'changes'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: `@rulecad/${name}`, version, dependencies: deps }, null, 2)}\n`);
    if (changelog) fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
    for (const [f, text] of Object.entries(notes)) fs.writeFileSync(path.join(dir, 'changes', f), text);
  }
  return root;
};
const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');

test('a change note: its title and bump from the front matter, patch by default, refused by name when wrong', () => {
  assert.deepEqual(parseNote('---\ntitle: slot nuts\n---\n### Added\n\n- a nut'), { title: 'slot nuts', bump: 'patch', body: '### Added\n\n- a nut' });
  assert.equal(parseNote('---\r\nbump: minor\r\n---\r\n- x').bump, 'minor');
  assert.throws(() => parseNote('---\nbump: major\n---\n- x', 'n.md'), /n\.md: bump is patch or minor/);
  assert.throws(() => parseNote('---\ntitle: t\n---\n', 'n.md'), /n\.md: no entries/);
  assert.equal(nextVersion('0.7.93', 'patch'), '0.7.94'); assert.equal(nextVersion('0.7.93', 'minor'), '0.8.0');
  // two notes' entries grouped under their headings, in the order each heading first appears
  assert.equal(groupEntries(['### Added\n\n- one', '### Fixed\n\n- two\n\n### Added\n\n- three', '- loose']), '### Added\n\n- one\n\n- three\n\n### Fixed\n\n- two\n\n### Changed\n\n- loose');
});

test('a release: each package with notes gets its next version and one CHANGELOG section, the notes are removed, released dependents take the new ranges, and the order to publish is dependencies first', () => {
  const root = repo({
    a: { version: '0.2.4', changelog: '# Changelog: @rulecad/a\n\nIntro.\n\n## 0.2.4: before\n\n- old\n', notes: { 'x.md': '---\ntitle: slot nuts\n---\n### Added\n\n- nuts', 'y.md': '---\ntitle: bolts\n---\n### Fixed\n\n- bolts' } },
    b: { version: '0.5.1', deps: { '@rulecad/a': '^0.2.0' }, changelog: '# Changelog: @rulecad/b\n\n## Unreleased: an older entry\n\n### Added\n\n- left from before\n\n## 0.5.1: x\n\n- y\n', notes: { 'z.md': '---\ntitle: gauges\n---\n### Added\n\n- a gauge' } },
    c: { version: '1.0.0', deps: { '@rulecad/a': '^0.2.0' } },
  });
  try {
    const dry = release(root);
    assert.deepEqual(dry.released.map((x) => [x.name, x.to]), [['@rulecad/a', '0.2.5'], ['@rulecad/b', '0.5.2']]);
    assert.ok(fs.existsSync(path.join(root, 'packages/a/changes/x.md')), 'a dry run writes nothing');
    const r = release(root, { write: true });
    assert.deepEqual(r.order, ['@rulecad/a', '@rulecad/b']);
    assert.equal(JSON.parse(read(root, 'packages/a/package.json')).version, '0.2.5');
    // a's notes in one section under the intro, above the last release, titles joined
    assert.equal(read(root, 'packages/a/CHANGELOG.md'), '# Changelog: @rulecad/a\n\nIntro.\n\n## 0.2.5: slot nuts; bolts\n\n### Added\n\n- nuts\n\n### Fixed\n\n- bolts\n\n## 0.2.4: before\n\n- old\n');
    assert.deepEqual(fs.readdirSync(path.join(root, 'packages/a/changes')), []);
    // b: its old Unreleased section folded in with its note; its range on a raised, as both are released
    const b = read(root, 'packages/b/CHANGELOG.md');
    assert.match(b, /^# Changelog: @rulecad\/b\n\n## 0\.5\.2: gauges; an older entry\n\n### Added\n\n- a gauge\n\n- left from before\n\n## 0\.5\.1: x/);
    assert.ok(!/Unreleased/.test(b));
    assert.equal(JSON.parse(read(root, 'packages/b/package.json')).dependencies['@rulecad/a'], '^0.2.5');
    // c is not released: its range still covers a's patch, so it is left as it was
    assert.equal(JSON.parse(read(root, 'packages/c/package.json')).dependencies['@rulecad/a'], '^0.2.0');
    assert.equal(JSON.parse(read(root, 'packages/c/package.json')).version, '1.0.0');
    assert.deepEqual(release(root).released, [], 'nothing left to release');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a minor release of a 0.x package releases the dependents whose caret range no longer covers it, as following it', () => {
  const root = repo({
    a: { version: '0.2.4', notes: { 'x.md': '---\ntitle: a new shape\nbump: minor\n---\n### Added\n\n- shape' } },
    b: { version: '0.5.1', deps: { '@rulecad/a': '^0.2.0' } },
  });
  try {
    const r = release(root, { write: true });
    assert.deepEqual(r.released.map((x) => [x.name, x.to, x.title]), [['@rulecad/a', '0.3.0', 'a new shape'], ['@rulecad/b', '0.5.2', 'follows @rulecad/a 0.3.0']]);
    assert.equal(JSON.parse(read(root, 'packages/b/package.json')).dependencies['@rulecad/a'], '^0.3.0');
    assert.match(read(root, 'packages/b/CHANGELOG.md'), /## 0\.5\.2: follows @rulecad\/a 0\.3\.0\n\n### Changed\n\n- Takes @rulecad\/a 0\.3\.0\./);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

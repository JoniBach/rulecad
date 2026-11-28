// cad's tests of releases: a design released as a git tag and rebuilt. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { workspace } from './helpers.mjs';

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

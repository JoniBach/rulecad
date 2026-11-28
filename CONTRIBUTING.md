# Contributing

Thank you. Everything here is free to use and change, and so is anything you send: code under MIT, rule data under
CC0. No permission is needed to use rulecad, and none is needed to help.

## The most useful thing: a measurement

The rule sets in `packages/rules` hold facts that designs are built from: a printer's limits, a switch's stem, a
controller's pins. Some are estimates nobody has published (`"kind": "estimate"`), and every one could be wrong for
your printer or your parts. If you measured something:

- **Open an issue** with the "Correct a rule" form. Say what you measured, how (calipers, a test print), and what you
  got. That alone is enough.
- **Or a pull request**: change the value in `packages/rules/<set>.json`, set `"kind": "measured"`, and say how in
  `"rule"` and where in `"source"`. Set `"checked"` to the date.

Kinds, from most to least trusted: `measured` (you checked it), `spec` (a datasheet or the manufacturer),
`community` (a widely used figure, such as KiCad's library), `default` (a setting that works), `derived` (read off
someone else's model: check it against the real thing), `estimate`. A test holds every published value to these.

## Code

```sh
git clone https://github.com/JoniBach/rulecad && cd rulecad
npm install
npm test               # every package, with node:test
npm run test:browser   # the model page in headless Chrome (needs Chrome or Chromium)
test/fresh-install.sh  # the packages installed as a stranger gets them: no lockfile
```

- A small package is one `.mjs` file, or a few, each documented at the top and with JSDoc on what it exports (types
  are made from that: `npm run types` fails on a module whose declarations wouldn't be published).
- The small packages depend on nothing but each other, and run in browsers as well as Node: `npm test` checks that
  in every module they ship.
- New behaviour comes with a test. Fix a bug with a test that failed before the fix. New tests go in a file of their
  own (`packages/<name>/test/<topic>.test.mjs`, or `test/<topic>.test.mjs` across packages) rather than at the end of a
  package's `test.mjs`, so two pull requests don't add at the same place.
- The `cad` command's tests are a file per command or topic in `packages/cad/test/`: `rules`, `start` (the quick
  start, `cad new`, the command line), `check`, `edit` (`cad set`, `add`, `move`, `remove`), `links`, `clone`,
  `fasten`, `measure`, `sandbox`, `assembly`, `mechanisms`, `holds`, `optimise`, `motors`, `gears`, `machine`, `build`
  (`cad order`, `plates`, `kit`), `examples` (TUTORIAL.md and EXAMPLES.md replayed), `versions`, `frame`, `fittings`,
  `guides`, `frame-checks`, `frame-sizing` and `printed-beams`, each `<name>.test.mjs`. Add a test to the file of its
  command, or start a new file for a new one. Every file starts the command through `packages/cad/test/helpers.mjs`:
  `workspace()` makes a fresh workspace and gives its `cad()` runner, `write()` puts a file in a workspace, `object()`
  writes an object, and `CAD` is the URL of `packages/cad/` for reading the kit's own files. `cad(...)` is for a run
  that should succeed: it fails the test, with the command, its exit status and its output, on any other exit. A run
  that should fail is `cad.refused(want, ...)`, `want` being the finding or refusal code, or the words, it should print;
  a check whose findings are read pass or fail is `cad.findings('check', ..., '--json')`, which fails the test when the
  exit status disagrees with them; a test that reads the status itself takes `cad.run(...)`
  (`{ status, out, stdout, stderr, json }`), and
  `cad.with({ timeout })` stops a run that would hang. Never give a test file a `workspace()` of its own, nor start
  `bin/cad.mjs` itself: `split.test.mjs` and `runner.test.mjs` in `packages/cad/test/` fail if one does. To find every
  run that fails at once, run the tests with `CAD_TEST_AUDIT=<file>`: each is listed in the file, with its test's line.
- Run one file's tests alone: `node --test packages/cad/test/fasten.test.mjs`; one test in it:
  `node --test --test-name-pattern="a yoke" packages/cad/test/fasten.test.mjs`.
- A check is tested on what it should fail as well as on what it should pass. A new check, or a fix to one, adds a
  seeded defect to `test/defects/`: a small mesh or design wrong in exactly one way, the finding it must give, and a
  good twin (the same shape made right) that must pass. `test/defects/README.md` shows how. A fix for a fault that
  already has a case marked `todo` takes the mark off in the same pull request: the end of the test run lists the todo
  cases that now pass.
- Plain words in messages and docs: say what happened and what to do, for people who aren't programmers too.
- Designs are code: rulecad never runs code from a link, a rule file or a layout, and nothing may change that.

## Releasing

A pull request never changes a package's `version`, its CHANGELOG's headings or `package-lock.json`: when several
pull requests each did, every merge left the others in conflict. Instead it adds a change note for each package it
changes, a file of its own in that package's `changes` folder (any name, say the branch's):

```md
---
title: printed bolts into slot nuts
bump: minor
---
### Added

- What changed, for someone upgrading a workspace. Say whether any printed size moved, and why.
```

`bump` is `patch` (the default) for fixes and `minor` for anything new; in the design format, a change that breaks an
existing design or an earlier print's fit is major, and is a version change made by hand. `title` is a few words for
the release's heading.

When a batch of pull requests has merged, a maintainer makes the release on a branch from `main`:

```sh
node scripts/release.mjs --dry-run   # what it would release, and the order to publish in
node scripts/release.mjs             # versions, CHANGELOG sections, the notes removed, ranges raised, the lockfile
```

and opens it as the release pull request. A package whose dependency's new minor its range no longer covers is
released too, as following it. Merging it to `main` publishes, in this order (`.github/workflows/publish.yml`):

1. **The tests, on every platform.** The `test` workflow runs on the merge: Linux with Node 20 and 24, macOS, Windows,
   the browser tests and the fresh install (the packages installed as a stranger installs them). Nothing is published
   unless every job passes.
2. **The plan.** When that run passes, the `publish` workflow starts. Its first job, which can only read, checks out
   the commit that was tested and says which versions aren't on npm yet (`node scripts/publish-plan.mjs`). When none
   is, the run ends there: "nothing new to publish". It also stands down when `main` has moved on since, because the
   newer commit's own run publishes whatever is due.
3. **Publishing.** Only then does the publish job run, in the GitHub environment `npm-publish`. It is the only job
   that can publish to npm; it installs with `npm ci --ignore-scripts` (no dependency's install script runs there) and
   runs no tests, since they have passed already. Each version goes out with provenance.
4. **The GitHub Releases.** A last job, which can write to the repository but cannot publish, makes a release for each
   version that went out, tagged at the tested commit.

A **blocked release** starts again in one of these ways:

- The tests failed or were cancelled: put the fault right in a pull request, or, for a passing test that failed by
  chance, open the test run on `main` in the Actions tab and choose "Re-run failed jobs". When the run passes,
  publishing follows on its own.
- The publish run stopped part way (a time limit, npm unavailable): run it again from the Actions tab ("Re-run all
  jobs"), or with `gh workflow run publish.yml` from `main`. Started by hand, it publishes only from `main`, and only a
  commit whose test run passed. Whatever is already on npm, and every release already made, is left alone.
- To see what a run would publish without publishing anything, start it on another branch:
  `gh workflow run publish.yml --ref <branch>`. It runs the plan, and stops there.

A **new package** has to be published once by hand first: npm only lets the workflow publish packages that already
exist. The workflow notices one before publishing anything and prints the commands (publish it, run `npm trust` for
it, run the workflow again). Run them one at a time: each asks for two-factor in the browser. `scripts/trust.sh`
trusts the publish job only: the workflow file `publish.yml`, in the environment `npm-publish`.

**Protecting `main`.** A ruleset in the repository's settings (Settings, Rules, Rulesets) lets a pull request merge
only when the four `test` jobs have passed: `test (ubuntu-latest, 20)`, `test (ubuntu-latest, 24)`,
`test (macos-latest, 24)` and `test (windows-latest, 24)`. A failed or cancelled one blocks the merge. Where the
ruleset isn't set up yet, keep to the same rule by hand: never merge with a check that failed or was cancelled.

## Conduct

Be kind, and assume good intent. Help people who are new to this; most of the people who'll use rulecad are.

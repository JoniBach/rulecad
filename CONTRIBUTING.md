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
`community` (a widely used figure, such as KiCad's library), `default` (a setting that works), `estimate`.

## Code

```sh
git clone https://github.com/JoniBach/rulecad && cd rulecad
npm install
npm test               # every package, with node:test
npm run test:browser   # the model page in headless Chrome (needs Chrome or Chromium)
test/fresh-install.sh  # the packages installed as a stranger gets them: no lockfile
```

- One package, one `.mjs` file, documented at the top and with JSDoc on what it exports (types are made from that).
- The small packages depend on nothing but each other, and run in browsers as well as Node: `npm test` checks that.
- New behaviour comes with a test. Fix a bug with a test that failed before the fix.
- Plain words in messages and docs: say what happened and what to do, for people who aren't programmers too.
- Designs are code: rulecad never runs code from a link, a rule file or a layout, and nothing may change that.

## Releasing

Bump the `version` in a package's `package.json` (patch for fixes, minor for anything new, and in the design format,
major for anything that breaks an existing design or an earlier print's fit) and merge to `main`. GitHub Actions
tests it on Linux, macOS and Windows, then publishes every package whose version isn't on npm yet, with provenance.

## Conduct

Be kind, and assume good intent. Help people who are new to this; most of the people who'll use rulecad are.

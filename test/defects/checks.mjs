// The checks a seeded defect can be run through. Each takes a case's input and gives findings in one shape,
// { level, code, text }, the shape @rulecad/printcheck already gives, so that every case's .expect.json reads the same
// way. Where a library gives an answer rather than findings (fit gives a gap, versions a release kind), the finding
// codes below are this folder's own, and are listed in README.md.
import { check as printcheck } from '@rulecad/printcheck';
import { closestAt } from '@rulecad/fit';
import { compare } from '@rulecad/versions';
import { resolve, lint } from '@rulecad/variables';
import { keys } from '@rulecad/keyboard-layout';

/** @typedef {{ level: string, code: string, text?: string }} Finding */

/** @type {Record<string, (input: any) => Finding[]>} */
export const checks = {
  // { triangles, printer, options }: printcheck's own findings, as they are
  printcheck: ({ triangles, printer, options }) => printcheck(triangles, printer, options),

  // { a, b, reach }: fit.overlap (fail) where the two solids run into each other, fit.clear (pass) otherwise
  fit: ({ a, b, reach = 2 }) => {
    const r = closestAt(a, b, reach);
    return [r.overlap ? { level: 'fail', code: 'fit.overlap', text: `the solids run into each other at ${JSON.stringify(r.at)}` }
      : { level: 'pass', code: 'fit.clear', text: `gap ${r.gap} mm` }];
  },

  // { before, after }, each { object, sets?, js? }: versions.release at the level of the release it needs (major,
  // minor or patch; none for no change), with its reasons as the text
  versions: ({ before, after }) => {
    const snap = (s) => ({ object: s.object, entries: resolve(s.object, { sets: s.sets || {} }).entries, js: s.js ?? '' });
    const { kind, reasons } = compare(snap(before), snap(after));
    return [{ level: kind ?? 'none', code: 'versions.release', text: reasons.map((r) => `${r.kind}: ${r.text}`).join('; ') }];
  },

  // { object, sets, set }: the error's own code (fail) if resolve() refuses, var.resolved (pass) if it gives values
  variables: ({ object, sets = {}, set = {} }) => {
    try {
      const { values } = resolve(object, { sets, set });
      return [{ level: 'pass', code: 'var.resolved', text: JSON.stringify(values) }];
    } catch (e) {
      return [{ level: 'fail', code: e.code || 'var.error', text: e.message }];
    }
  },

  // { source }: lint.number (fail) for each number the design should have named, lint.clean (pass) if none
  lint: ({ source }) => {
    const found = lint(source);
    return found.length ? found.map((n) => ({ level: 'fail', code: 'lint.number', text: `line ${n.line}: ${n.text}` }))
      : [{ level: 'pass', code: 'lint.clean', text: 'every measurement is a variable' }];
  },

  // { layout }: layout.refused (fail) if keys() refuses the layout, layout.keys (pass) with the keys it placed
  'keyboard-layout': ({ layout }) => {
    try {
      const k = keys(layout);
      return [{ level: 'pass', code: 'layout.keys', text: k.map((x) => `${x.label} at ${x.x}`).join(', ') }];
    } catch (e) {
      return [{ level: 'fail', code: 'layout.refused', text: e.message }];
    }
  },
};

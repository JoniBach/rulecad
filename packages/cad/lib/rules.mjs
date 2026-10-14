// Rules from files: the variables and expressions of @rulecad/variables, with rule sets read from the workspace's rules/
// (then the tool's) by name. Everything but loading is in @rulecad/variables, which needs no files and runs anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { RULE_DIRS, WS } from './workspace.mjs';
import { resolve as resolveWith } from '@rulecad/variables';

export { ANCHORS, isName, options, checkName, evaluate, fmt } from '@rulecad/variables';

// dir: one folder (a release's own rules), else the workspace's rules, then the tool's. A rule set the tool provides
// is copied into the workspace the first time it's used: the workspace keeps every rule its designs depend on (so a
// release can record them in git), and your own measurements are edits to your copy.
export function loadRuleSet(name, dir) {
  const file = (dir ? [dir] : RULE_DIRS).map((d) => path.join(d, `${name}.json`)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`no rule set "${name}" (rules/${name}.json)`);
  const own = path.join(WS, 'rules', `${name}.json`);
  if (!dir && file !== own) {
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.copyFileSync(file, own);
    console.error(`copied the ${name} rule set into rules/${name}.json: yours to keep and edit`);
  }
  return JSON.parse(fs.readFileSync(own, 'utf8'));
}
// resolve() as @rulecad/variables describes it, loading the rule sets it isn't handed
export const resolve = (object, opts = {}) => resolveWith(object, { load: loadRuleSet, ...opts });

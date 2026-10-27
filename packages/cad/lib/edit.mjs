// Model edits: change a design's JSON by what the change means (set a variable, add a fit, a joint, an item, a pose),
// keeping the file's layout (lib/jsonedit.mjs), and refusing an edit that leaves the file broken: it must still match
// its schema, and an object's variables must still resolve. Used by cad set and cad add; a program can call them too.
import fs from 'node:fs';
import path from 'node:path';
import { setAt, appendAt, getAt } from './jsonedit.mjs';
import { validate, schema } from './schema.mjs';
import { CadError } from './errors.mjs';
import { paths } from './workspace.mjs';
import { locate, readObject, objectSets } from './design.mjs';
import { resolve } from './rules.mjs';

// A value from the command line: a number if it is one, otherwise an expression (or a name) as text
export const parseValue = (s) => (s === undefined ? undefined : /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(String(s).trim()) ? Number(s) : String(s));

function write(file, text, kind) {
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new CadError('edit.broken', `the edit would break ${file}'s JSON: ${e.message}`, { file }); }
  const problems = validate(json, schema(kind));
  if (problems.length) throw new CadError('schema', `${path.basename(file)}: ${problems[0].path}: ${problems[0].message}`, { file, path: problems[0].path });
  fs.writeFileSync(file, text);
  return json;
}

/**
 * Set variables of an object: { name: value }, each with optional unit, rule, label; new ones only with create.
 * @param {string} ref project/object @param {Record<string, { value?: any, unit?: string, rule?: string, label?: string }>} changes
 * @param {{ create?: boolean }} [options] @returns {Promise<{ file: string, changed: string[] }>}
 */
export async function setVariables(ref, changes, { create = false } = {}) {
  const d = locate(ref), before = fs.readFileSync(d.json, 'utf8');
  let text = before;
  for (const [name, c] of Object.entries(changes)) {
    const exists = getAt(text, ['variables', name]) !== undefined;
    if (!exists && !create) throw new CadError('var.unknown', `${ref} has no variable "${name}" (add it with --new, a unit and a rule)`, { file: d.json, path: `variables.${name}` });
    if (!exists && (c.value === undefined || !c.rule)) throw new CadError('edit.incomplete', `a new variable needs a value and a rule (why the value is what it is): ${name}`, { file: d.json });
    if (!exists) { text = setAt(text, ['variables', name], { value: c.value, ...(c.unit !== undefined ? { unit: c.unit } : {}), rule: c.rule, ...(c.label ? { label: c.label } : {}) }); continue; }
    for (const k of ['value', 'unit', 'rule', 'label']) if (c[k] !== undefined) text = setAt(text, ['variables', name, k], c[k]);
  }
  const json = write(d.json, text, 'object');
  try { // the variables must still resolve: an unknown name or a loop puts the file back as it was
    resolve(json, { sets: (await objectSets(d, readObject(d))).sets });
  } catch (e) { fs.writeFileSync(d.json, before); throw Object.assign(e, { file: d.json, message: `not changed: ${e.message}` }); }
  return { file: d.json, changed: Object.keys(changes) };
}

const assemblyFile = (ref) => {
  const [project, name] = ref.split('/'), file = path.join(paths.project(project), 'assemblies', `${name}.json`);
  if (!fs.existsSync(file)) throw new CadError('assembly.missing', `no assembly at ${path.relative(paths.project(project), file)}`, { file });
  return file;
};

/**
 * Add to an assembly: a fit, a joint, an item or a loop (appended to its list), or a pose (by name).
 * @param {string} ref project/assembly @param {'fit' | 'joint' | 'item' | 'loop' | 'pose'} what @param {any} entry (a pose: { name, values })
 * @returns {{ file: string }}
 */
export function addToAssembly(ref, what, entry) {
  const file = assemblyFile(ref), before = fs.readFileSync(file, 'utf8'), list = { fit: 'fits', joint: 'joints', item: 'items', loop: 'loops' }[what];
  let text = before;
  if (what === 'pose') {
    if (getAt(text, ['poses']) === undefined) text = setAt(text, ['poses'], {});
    text = setAt(text, ['poses', entry.name], entry.values);
  } else {
    if (!list) throw new CadError('edit.what', `can't add a ${what} (fit, joint, item, loop or pose)`);
    if (getAt(text, [list]) === undefined) text = setAt(text, [list], []);
    const ids = (getAt(text, [list]) || []).map((x) => x.id).filter(Boolean);
    if (entry.id && ids.includes(entry.id)) throw new CadError('edit.duplicate', `${ref} already has a ${what} "${entry.id}"`, { file });
    text = appendAt(text, [list], entry);
  }
  write(file, text, 'assembly');
  return { file };
}

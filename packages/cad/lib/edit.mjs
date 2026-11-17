// Model edits: change a design's JSON by what the change means (set a variable, add a fit, a joint, an item, a pose),
// keeping the file's layout (lib/jsonedit.mjs), and refusing an edit that leaves the file broken: it must still match
// its schema, and an object's variables must still resolve. Used by cad set and cad add; a program can call them too.
import fs from 'node:fs';
import path from 'node:path';
import { setAt, appendAt, getAt, removeAt } from './jsonedit.mjs';
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
    const { values } = resolve(json, { sets: (await objectSets(d, readObject(d))).sets });
    // and each changed value must lie within the variable's own range, where it has one (a tweak's min and max)
    for (const name of Object.keys(changes)) {
      const t = json.variables?.[name]?.tweak, v = values[name];
      if (!t || typeof v !== 'number') continue;
      const lo = typeof t.min === 'number' ? t.min : -Infinity, hi = typeof t.max === 'number' ? t.max : Infinity;
      if (v < lo || v > hi) throw new CadError('edit.range', `${name} = ${v} is outside its range, ${t.min ?? '…'} to ${t.max ?? '…'} (change the range first if it should go there)`, { file: d.json, path: `variables.${name}` });
    }
  } catch (e) { fs.writeFileSync(d.json, before); throw Object.assign(e, { file: d.json, message: `not changed: ${e.message}` }); }
  return { file: d.json, changed: Object.keys(changes) };
}

const assemblyFile = (ref) => {
  const [project, name] = ref.split('/'), file = path.join(paths.project(project), 'assemblies', `${name}.json`);
  if (!fs.existsSync(file)) throw new CadError('assembly.missing', `no assembly at ${path.relative(paths.project(project), file)}`, { file });
  return file;
};

/**
 * Add to an assembly: a fit, a joint, an item, a loop, a fasten or a join (appended to its list), or a pose (by name).
 * @param {string} ref project/assembly @param {'fit' | 'joint' | 'item' | 'loop' | 'fasten' | 'join' | 'pose'} what @param {any} entry (a pose: { name, values })
 * @returns {{ file: string }}
 */
export function addToAssembly(ref, what, entry) {
  const file = assemblyFile(ref), before = fs.readFileSync(file, 'utf8'), list = { fit: 'fits', joint: 'joints', item: 'items', loop: 'loops', fasten: 'fasten', join: 'joins' }[what];
  let text = before;
  if (what === 'pose') {
    if (getAt(text, ['poses']) === undefined) text = setAt(text, ['poses'], {});
    text = setAt(text, ['poses', entry.name], entry.values);
  } else {
    if (!list) throw new CadError('edit.what', `can't add a ${what} (fit, joint, item, loop, fasten, join or pose)`);
    if (getAt(text, [list]) === undefined) text = setAt(text, [list], []);
    const ids = (getAt(text, [list]) || []).map((x) => x.id).filter(Boolean);
    if (entry.id && ids.includes(entry.id)) throw new CadError('edit.duplicate', `${ref} already has a ${what} "${entry.id}"`, { file });
    // a fit names parts as item.part: the item must be in the assembly, and the part one its object declares (or body)
    if (what === 'fit') for (const side of ['a', 'b']) {
      const named = entry[side]; if (typeof named !== 'string') continue;
      const [item, part = 'body'] = named.split('@')[0].split('.'), it = (getAt(text, ['items']) || []).find((x) => x.id === item);
      if (!it) throw new CadError('edit.part', `fit ${side}: no item "${item}" in ${ref} (items: ${(getAt(text, ['items']) || []).map((x) => x.id).join(', ') || 'none'})`, { file });
      if (it.object) {
        const [project] = ref.split('/'), obj = path.join(paths.project(project), 'objects', `${String(it.object).split(/[@:]/)[0]}.json`);
        const parts = fs.existsSync(obj) ? Object.keys(JSON.parse(fs.readFileSync(obj, 'utf8')).parts || { body: {} }) : null;
        if (parts && !parts.includes(part)) throw new CadError('edit.part', `fit ${side}: ${it.object} has no part "${part}" (parts: ${parts.join(', ')})`, { file });
      }
    }
    // a fasten names the parts its screw passes and ends in, and where the screws go: each must be an item of the assembly
    if (what === 'fasten') {
      const items = (getAt(text, ['items']) || []).map((x) => x.id), has = (n) => items.includes(String(n).split(/[.@]/)[0]);
      if (!entry.screw) throw new CadError('edit.incomplete', 'a fasten needs its screw, by thread and head: --screw "M3 cap"', { file });
      if (!entry.into || !Array.isArray(entry.through)) throw new CadError('edit.incomplete', 'a fasten needs the parts the screw passes and the one it ends in: --through bracket --into base', { file });
      if ((entry.at == null) === (entry.holes == null)) throw new CadError('edit.incomplete', 'a fasten needs where its screws go: --at bracket.h1,bracket.h2 (an anchor each) or --holes bracket.body (a part whose holes they use), one of the two', { file });
      for (const n of [...entry.through, entry.into, ...(entry.holes ? [entry.holes] : []), ...(entry.at || []).filter((x) => typeof x === 'string')]) if (!has(n)) throw new CadError('edit.part', `fasten: no item "${String(n).split(/[.@]/)[0]}" in ${ref} (items: ${items.join(', ') || 'none'})`, { file });
    }
    // a join names a beam's end and a place on another beam: each must be a beam item of the assembly
    if (what === 'join') {
      const beams = (getAt(text, ['items']) || []).filter((x) => x.beam).map((x) => x.id);
      if (!entry.kind || !entry.a || !entry.b) throw new CadError('edit.incomplete', 'a join needs its kind and the two beams: --kind blind --a y1.a --b x1.back@120', { file });
      for (const side of ['a', 'b']) { const id = String(entry[side]).split('.')[0]; if (!beams.includes(id)) throw new CadError('edit.part', `join ${side}: no beam "${id}" in ${ref} (beams: ${beams.join(', ') || 'none'})`, { file }); }
    }
    text = appendAt(text, [list], entry);
  }
  write(file, text, 'assembly');
  return { file };
}

/**
 * Put a fasten in place of each holes fit and the fit that fastens the same two items (as lib/fasten.mjs's fastenFromFits
 * finds them): the holes fit goes, the fit that fastens goes too, or keeps its gap range (min, max) with "fastens",
 * "fastener" and "count" taken off, and the fasten is added. A screw given replaces the one found.
 * @param {string} ref project/assembly @param {{ fasten: object, holes: number, fastens: number }[]} found @param {{ screw?: string }} [options]
 * @returns {{ file: string, added: object[] }}
 */
export function fastenFromFitsEdit(ref, found, { screw } = {}) {
  const file = assemblyFile(ref);
  if (!found.length) throw new CadError('edit.nothing', `${ref} has no holes fit with a fit that fastens the same two items (and no fasten for them yet): nothing to put a fasten in place of`, { file });
  let text = fs.readFileSync(file, 'utf8');
  const fits = getAt(text, ['fits']), drop = new Set(), trim = new Set();
  for (const g of found) { drop.add(g.holes); (fits[g.fastens].min != null || fits[g.fastens].max != null ? trim : drop).add(g.fastens); }
  // last first, so the places of the others hold
  for (const i of [...new Set([...drop, ...trim])].sort((a, b) => b - a)) {
    if (drop.has(i)) { text = removeAt(text, ['fits', i]); continue; }
    for (const k of ['count', 'fastener', 'fastens']) if (getAt(text, ['fits', i, k]) !== undefined) text = removeAt(text, ['fits', i, k]);
  }
  if (getAt(text, ['fasten']) === undefined) text = setAt(text, ['fasten'], []);
  const added = found.map((g) => ({ ...g.fasten, ...(screw ? { screw } : {}) }));
  for (const x of added) text = appendAt(text, ['fasten'], x);
  write(file, text, 'assembly');
  return { file, added };
}

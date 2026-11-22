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
import { resolve, evaluate, peekRuleSet } from './rules.mjs';
import { expandFrame, frameText } from './framegen.mjs';
import { framesContext } from './beams.mjs';
import { plasticNamed } from './fittings.mjs';

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
 * Add to an assembly: a fit, a joint, an item, a loop, a fasten, a join, a guide or a load (appended to its list), or a
 * pose (by name). The names it gives are checked against the assembly's items, a generated frame's beams among them.
 * @param {string} ref project/assembly @param {'fit' | 'joint' | 'item' | 'loop' | 'fasten' | 'join' | 'guide' | 'load' | 'pose'} what @param {any} entry (a pose: { name, values })
 * @param {{ dryRun?: boolean }} [options] @returns {{ file: string, written: boolean, changes: object[], findings: object[] }}
 */
export function addToAssembly(ref, what, entry, { dryRun = false } = {}) {
  const file = assemblyFile(ref), before = fs.readFileSync(file, 'utf8'), list = LIST_OF[what];
  let text = before, at;
  if (what === 'pose') {
    entryProblems('pose', entry, { ref, file, known: knownOf(JSON.parse(text)) });
    if (getAt(text, ['poses']) === undefined) text = setAt(text, ['poses'], {});
    text = setAt(text, ['poses', entry.name], entry.values);
    at = `poses.${entry.name}`;
  } else {
    if (!list) throw new CadError('edit.what', `can't add a ${what} (${Object.keys(LIST_OF).join(', ')} or pose)`);
    if (getAt(text, [list]) === undefined) text = setAt(text, [list], []);
    const json = JSON.parse(text), ids = (json[list] || []).map((x) => x.id).filter(Boolean);
    if (entry.id && ids.includes(entry.id)) throw new CadError('edit.duplicate', `${ref} already has a ${what} "${entry.id}"`, { file });
    const known = knownOf(json);
    if (entry.id && what === 'item' && known.generated.includes(entry.id)) throw new CadError('edit.duplicate', `${ref}'s generated frame already names a part "${entry.id}": give the item another id`, { file });
    entryProblems(what, entry, { ref, file, known, self: idOf(list, entry, (json[list] || []).length) });
    text = appendAt(text, [list], entry);
    at = `${list}.${(json[list] || []).length}`;
  }
  return finish({ ref, file, before, text, kind: 'assembly', changes: [{ op: 'add', path: at, after: entry }], dryRun });
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

// ---------- the workspace's own files: projects and assemblies, made, changed, moved and removed ----------
// Every edit below works the same way: it reads the file, makes the change in its text (lib/jsonedit.mjs keeps the
// layout), holds the result to the file's schema and a quick check of what the change could break, and only then
// writes it. A refusal names what is wrong and writes nothing; --dry-run does all of it and writes nothing either.
// Each returns { file, written, changes: [{ op, path, before, after }], findings }, the shape cad prints with --json.

/** The list each kind of entry goes in. */
export const LIST_OF = { fit: 'fits', joint: 'joints', item: 'items', loop: 'loops', fasten: 'fasten', join: 'joins', guide: 'guides', load: 'loads', wire: 'wires' };
// The lists whose entries have ids (a guide without one is g1, g2 .. by its place)
const ID_LISTS = ['items', 'joints', 'guides', 'wires'];
const LISTS = [...new Set([...Object.values(LIST_OF), 'planetary'])];
const idOf = (list, x, i) => x?.id ?? (list === 'guides' ? `g${i + 1}` : undefined);
const rootOf = (n) => String(n).split(/[.@]/)[0];

// Numbers in an assembly's expressions, from the rule sets it uses (read, never copied in): enough for a frame's size
function numFor(a) {
  const values = {};
  for (const u of a.uses || []) { try { values[u] = Object.fromEntries(Object.entries(peekRuleSet(u).rules || {}).map(([k, r]) => [k, r.value])); } catch {} }
  const lookup = (n) => {
    const p = n.split('.');
    let v = values;
    for (const k of p) v = v?.[k];
    if (typeof v === 'string') v = evaluate(v, (k) => lookup(k.includes('.') ? k : `${p.slice(0, -1).join('.')}.${k}`));
    if (typeof v !== 'number') throw Object.assign(new Error(`"${n}" is not a rule this check can read`), { code: 'edit.unread' });
    return v;
  };
  return (x) => evaluate(x, lookup);
}

/**
 * What an assembly names, its generated frame expanded: its items (with the frame's beams, ends and panels), the beams
 * among them, the ids the generator gives, its guides' ids, and the frame's model (or why it did not expand).
 * @param {object} a the assembly as read
 * @returns {{ items: object[], beams: string[], generated: string[], guides: string[], joints: string[], joins: object[], wires: string[], frame: object | null, refused: Error | null }}
 */
export function knownOf(a) {
  let items = a.items || [], joints = a.joints || [], joins = a.joins || [], frame = null, refused = null, generated = [];
  if (a.frame && typeof a.frame === 'object' && a.frame.kind != null) {
    try { const x = expandFrame(a, numFor(a), framesContext()); frame = x.frame; generated = x.a.items.slice(0, x.a.items.length - items.length).map((it) => it.id); items = x.a.items; joints = x.a.joints || joints; joins = x.a.joins || joins; } catch (e) { refused = e; }
  }
  return { items, beams: items.filter((x) => x?.beam).map((x) => x.id), generated, guides: (a.guides || []).map((g, i) => idOf('guides', g, i)), joints: joints.map((j) => j?.id).filter(Boolean),
    joins: Array.isArray(joins) ? joins : [], wires: (Array.isArray(a.wires) ? a.wires : []).map((w, i) => w?.id ?? `w${i + 1}`), frame, refused };
}

// The names an assembly's build makes that are not in its file, each by the exact pattern its maker uses (lib/assembly,
// fittings, panels, services, guides): a repeated item's copies (key-0-3: <id>-<i>, <id>-<i>-<j>), a mounted item's
// mount (psu-mount), a panel's clips, hinges, leaves, handle and catch, a levelling foot's pad, a join's fitting
// (y1-x1-bracket), a wire's clips (w1-clip), a guide's carriages, wheels, holders, rods, bearings and drive parts
// (g1-carriage-1, g1-belt); and the joints the build makes, a guide's sliding joints (g1-1) and a panel's hinge or bay
// (door-hinge). A name that only starts with an item's id and a dash (rail-3, where rail is one beam) is none of them.
const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GUIDE_PART = /^(carriage-\d+|wheel-\d+|holder-[ab]|endstop|endstop-mount|rod-\d+|bearing-\d+|plate|motor|coupler|screw|nut|support-[ab]|pulley|clamp|idler|idler-block|belt)$/;
const PANEL_PART = /^(clip|hinge-\d+|leaf-\d+|handle|latch|catch)(-\d+)?$/;
/**
 * The items and joints an assembly's build makes from its entries, by name. @param {ReturnType<typeof knownOf>} known
 * @returns {{ item: (n: string) => boolean, joint: (n: string) => boolean }}
 */
export function madeBy(known) {
  const one = (n, id, re) => { const s = String(n), head = `${id}-`; return s.startsWith(head) && re.test(s.slice(head.length)); };
  const joins = (known.joins || []).filter((j) => j && typeof j.a === 'string' && typeof j.b === 'string').map((j) => new RegExp(`^${esc(rootOf(j.a))}-${esc(rootOf(j.b))}-[a-z]+(-\\d+)?$`));
  const items = known.items.filter((it) => it?.id != null);
  const item = (n) => items.some((it) => (it.repeat != null && one(n, it.id, /^\d+(-\d+)?$/)) || (it.mount != null && one(n, it.id, /^mount(-\d+)?$/))
      || (it.panel != null && one(n, it.id, PANEL_PART)) || (it.fitting?.kind === 'levelling-foot' && one(n, it.id, /^pad$/)))
    || known.guides.some((g) => one(n, g, GUIDE_PART)) || (known.wires || []).some((w) => one(n, w, /^clip(-\d+)?$/)) || joins.some((re) => re.test(String(n)));
  const joint = (n) => known.guides.some((g) => one(n, g, /^\d+$/)) || items.some((it) => it.panel != null && one(n, it.id, /^(hinge|bay)$/));
  return { item, joint };
}

// The names an entry gives must be there: a fit's parts, a fasten's, a join's beams, a guide's beam and the guide it
// drives, a joint's parent and child items and the joint it follows, a pose's joints. self is the entry's own id.
function entryProblems(what, entry, { ref, file, known, self }) {
  const items = known.items, ids = items.map((x) => x?.id), list = (xs) => xs.join(', ') || 'none';
  const { item: made, joint: madeJoint } = madeBy(known); // what the build makes: g1-carriage-1, psu-mount, key-0-3 (madeBy)
  if (what === 'fit') for (const side of ['a', 'b']) {
    const named = entry[side]; if (typeof named !== 'string') continue;
    const [item, part = 'body'] = named.split('@')[0].split('.'), it = items.find((x) => x?.id === item);
    if (!it && made(item)) continue; // a guide's part or a repeated item's copy (key-0-3)
    if (!it) throw new CadError('edit.part', `fit ${side}: no item "${item}" in ${ref} (items: ${list(ids)})`, { file });
    if (it.object) {
      const [project] = ref.split('/'), obj = path.join(paths.project(project), 'objects', `${String(it.object).split(/[@:]/)[0]}.json`);
      const parts = fs.existsSync(obj) ? Object.keys(JSON.parse(fs.readFileSync(obj, 'utf8')).parts || { body: {} }) : null;
      if (parts && !parts.includes(part)) throw new CadError('edit.part', `fit ${side}: ${it.object} has no part "${part}" (parts: ${parts.join(', ')})`, { file });
    }
  }
  // a fasten names the parts its screw passes and ends in, and where the screws go: each must be an item of the assembly
  if (what === 'fasten') {
    const has = (n) => ids.includes(rootOf(n)) || made(rootOf(n));
    if (!entry.screw) throw new CadError('edit.incomplete', 'a fasten needs its screw, by thread and head: --screw "M3 cap"', { file });
    if (!entry.into || !Array.isArray(entry.through)) throw new CadError('edit.incomplete', 'a fasten needs the parts the screw passes and the one it ends in: --through bracket --into base', { file });
    if ((entry.at == null) === (entry.holes == null)) throw new CadError('edit.incomplete', 'a fasten needs where its screws go: --at bracket.h1,bracket.h2 (an anchor each) or --holes bracket.body (a part whose holes they use), one of the two', { file });
    for (const n of [...entry.through, entry.into, ...(entry.holes ? [entry.holes] : []), ...(entry.at || []).filter((x) => typeof x === 'string')]) if (!has(n)) throw new CadError('edit.part', `fasten: no item "${rootOf(n)}" in ${ref} (items: ${list(ids)})`, { file });
  }
  // a join names a beam's end and a place on another beam: each must be a beam of the assembly, its frame's included
  if (what === 'join') {
    if (!entry.kind || !entry.a || !entry.b) throw new CadError('edit.incomplete', 'a join needs its kind and the two beams: --kind blind --a y1.a --b x1.back@120', { file });
    for (const side of ['a', 'b']) { const id = rootOf(entry[side]); if (!known.beams.includes(id)) throw new CadError('edit.part', `join ${side}: no beam "${id}" in ${ref} (beams: ${list(known.beams)})`, { file }); }
  }
  // an item placed at an address, and a load carried at one, name an item that is there
  if ((what === 'item' || what === 'load') && typeof entry.at === 'string' && !ids.includes(rootOf(entry.at)) && !made(rootOf(entry.at)))
    throw new CadError('edit.part', `${what} at: no item "${rootOf(entry.at)}" in ${ref} (items: ${list(ids)})`, { file });
  // a guide runs on a beam's face, and a screw guide drives another guide
  if (what === 'guide') {
    if (entry.on != null && !known.beams.includes(rootOf(entry.on))) throw new CadError('edit.part', `guide on: no beam "${rootOf(entry.on)}" in ${ref} (beams: ${list(known.beams)})`, { file });
    if (entry.guide != null && !known.guides.includes(String(entry.guide))) throw new CadError('edit.part', `guide: no guide "${entry.guide}" in ${ref} for it to drive (guides: ${list(known.guides)})`, { file });
    if (entry.guide != null && self != null && String(entry.guide) === self) throw new CadError('edit.part', `guide ${self}: it names itself as the guide it drives (guides: ${list(known.guides)})`, { file });
  }
  // a joint ties an anchor on its child item to one on its parent (an anchor by item.anchor, or { item, at }), and may
  // follow another joint
  if (what === 'joint') {
    for (const side of ['parent', 'child']) {
      const r = entry[side], item = typeof r === 'string' ? rootOf(r) : r && typeof r === 'object' && r.item != null ? String(r.item) : null;
      if (item != null && !ids.includes(item) && !made(item)) throw new CadError('edit.part', `joint ${entry.id ?? ''} ${side}: no item "${item}" in ${ref} (items: ${list(ids)})`.replace('  ', ' '), { file });
    }
    if (entry.follow != null && !known.joints.includes(String(entry.follow))) throw new CadError('edit.part', `joint ${entry.id ?? ''} follow: no joint "${entry.follow}" in ${ref} (joints: ${list(known.joints)})`.replace('  ', ' '), { file });
  }
  // a pose gives values to joints by id (its keys with a dot in them are not joints); a guide's and an item's own
  // joints (g1-1, door-hinge) are made as it is built, so a name under one of theirs is taken as theirs
  if (what === 'pose') for (const k of Object.keys(entry.values || {})) {
    if (k.includes('.') || known.joints.includes(k) || madeJoint(k)) continue;
    throw new CadError('edit.part', `pose ${entry.name}: no joint "${k}" in ${ref} (joints: ${list(known.joints)})`, { file });
  }
  // a wire runs from an anchor to an anchor, by anchors, path joints and runs along a beam's slot (via); a loop closes
  // between two anchors; a load is on a joint or carried at an anchor; a mounted item sits at an address on a beam.
  // An anchor is <item>.<anchor> (or { item, at }): its item must be there, or be one a guide or an item makes (g1-carriage-1,
  // psu-mount, key-0-3)
  const anchorItem = (r) => (typeof r === 'string' ? rootOf(r) : r && typeof r === 'object' && r.item != null ? String(r.item) : null);
  const noItem = (label, r) => { const item = anchorItem(r); if (item != null && !ids.includes(item) && !made(item)) throw new CadError('edit.part', `${label}: no item "${item}" in ${ref} (items: ${list(ids)})`, { file }); };
  const noBeam = (label, r) => { const id = rootOf(r); if (!known.beams.includes(id)) throw new CadError('edit.part', `${label}: no beam "${id}" in ${ref} (beams: ${list(known.beams)})`, { file }); };
  const name = entry.id != null ? ` ${entry.id}` : '';
  if (what === 'wire') {
    for (const side of ['from', 'to']) if (entry[side] != null) noItem(`wire${name} ${side}`, entry[side]);
    for (const v of Array.isArray(entry.via) ? entry.via : []) {
      if (typeof v === 'string' && v.includes('.')) noItem(`wire${name} via`, v);
      else if (typeof v === 'string' && !known.joints.includes(v) && !madeJoint(v)) throw new CadError('edit.part', `wire${name} via: no joint "${v}" in ${ref}, and an anchor is <item>.<anchor> (joints: ${list(known.joints)})`, { file });
      else if (v && typeof v === 'object' && v.along != null) noBeam(`wire${name} via along`, v.along);
    }
  }
  if (what === 'loop') for (const side of ['a', 'b']) noItem(`loop ${side}`, entry[side]);
  if (what === 'load') {
    if (entry.joint != null && !known.joints.includes(String(entry.joint)) && !madeJoint(String(entry.joint))) throw new CadError('edit.part', `load joint: no joint "${entry.joint}" in ${ref} (joints: ${list(known.joints)})`, { file });
    if (entry.at != null && typeof entry.at === 'object') noItem('load at', entry.at);
  }
  if (what === 'item' && entry.mount && typeof entry.mount === 'object' && entry.mount.on != null) noBeam(`item${name} mount on`, entry.mount.on);
}

// Every entry's names, checked as entryProblems checks one: [{ at, key, message }], where key is the same for the same
// problem in the same entry before and after an edit (its place may move, and the lists in its message change)
function namesProblems(json, known, { ref, file }) {
  const out = [], one = (at, what, entry, self) => {
    try { entryProblems(what, entry, { ref, file, known, self }); } catch (e) { out.push({ at, key: `${what}|${JSON.stringify(entry)}|${String(e.message).replace(/ \(.*$/s, '')}`, message: e.message }); }
  };
  for (const [what, list] of Object.entries(LIST_OF)) (Array.isArray(json[list]) ? json[list] : []).forEach((e, i) => { if (e && typeof e === 'object') one(`${list}.${i}`, what, e, idOf(list, e, i)); });
  for (const [name, values] of Object.entries(json.poses && typeof json.poses === 'object' ? json.poses : {})) if (values && typeof values === 'object') one(`poses.${name}`, 'pose', { name, values });
  return out;
}

// A changed assembly, checked: its schema, its generated frame still expanding, and the names in each entry it touched
function assemblyFindings(json, { ref, file, touched = [], before = '' }) {
  const problems = validate(json, schema('assembly'));
  if (problems.length) throw new CadError('schema', `not changed: ${path.basename(file)}: ${problems[0].path}: ${problems[0].message}`, { file, path: problems[0].path });
  const out = [{ level: 'pass', text: 'matches the assembly schema', code: 'schema' }], known = knownOf(json);
  if (known.refused) {
    // a frame the generator refuses is a broken edit; one whose size reads an item's values is left to cad check
    if (/^frame: /.test(known.refused.message)) throw new CadError('frame.refused', `not changed: ${known.refused.message}`, { file, path: 'frame' });
    out.push({ level: 'info', text: `the frame is not expanded here (${known.refused.message}): cad check ${ref} expands it`, code: 'edit.unread' });
  } else if (known.frame) {
    const [what, size] = frameText(known.frame);
    out.push({ level: 'pass', text: `the frame expands: ${what}; ${size}`, code: 'frame.generated', values: { inside: known.frame.inside, outside: known.frame.outside, beams: known.frame.beams.length, joins: known.frame.joins.length } });
  }
  const kinds = Object.fromEntries(Object.entries(LIST_OF).map(([k, v]) => [v, k]));
  for (const [list, i] of touched) if (kinds[list] && json[list]?.[i]) entryProblems(kinds[list], json[list][i], { ref, file, known, self: idOf(list, json[list][i], i) });
  // and every other entry: a name it gave that was there before the edit must still be there (a beam renamed or
  // removed, a frame changed or taken out, a guide renumbered). What was already missing is left to cad check
  if (!known.refused) {
    let was = [];
    if (before) { try { const b = JSON.parse(before), bk = knownOf(b); if (!bk.refused) was = namesProblems(b, bk, { ref, file }); } catch {} }
    const old = new Set(was.map((p) => p.key)), fresh = namesProblems(json, known, { ref, file }).filter((p) => !old.has(p.key));
    if (fresh.length) throw Object.assign(new CadError('edit.dangling', `not changed: the edit leaves ${fresh.map((p) => `${p.at} (${p.message.replace(/ \(.*$/s, '')})`).join(', ')} naming what is no longer there: change or remove ${fresh.length === 1 ? 'it' : 'them'} first`, { file, path: fresh[0].at }), { refs: fresh.map((p) => p.at) });
  }
  if (touched.length) out.push({ level: 'pass', text: `the names in ${touched.map(([l, i]) => `${l}.${i}`).join(', ')} are all in ${ref}`, code: 'edit.refs' });
  return out;
}

// Write the edit, or not: the one end of every edit here
function finish({ ref, file, before, text, kind, changes, dryRun, touched, findings: extra = [] }) {
  let json;
  try { json = JSON.parse(text); } catch (e) { throw new CadError('edit.broken', `the edit would break ${file}'s JSON: ${e.message}`, { file }); }
  const findings = kind === 'assembly' ? assemblyFindings(json, { ref, file, before, touched: touched ?? changes.map((c) => entryAt(c.path)).filter(Boolean) }) : [];
  if (kind !== 'assembly') {
    const problems = validate(json, schema(kind));
    if (problems.length) throw new CadError('schema', `not changed: ${path.basename(file)}: ${problems[0].path}: ${problems[0].message}`, { file, path: problems[0].path });
    findings.push({ level: 'pass', text: `matches the ${kind} schema`, code: 'schema' });
  }
  findings.push(...extra);
  const written = !dryRun && text !== before;
  if (written) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
  return { file, written, ...(dryRun ? { dryRun: true } : {}), changes, findings };
}
// The list entry a path is in: 'joins.3.kind' → ['joins', 3]
const entryAt = (p) => { const m = /^([a-z]+)\.(\d+)/.exec(String(p)); return m && LISTS.includes(m[1]) ? [m[1], Number(m[2])] : null; };

/**
 * A value as cad set takes it: JSON where it is JSON (a number, true, null, [300, 300, 350], {"kind": "bracket"}), a
 * list in brackets without quotes ([1515-openbeam, 2020-misumi-hfs5]), and otherwise a number or a piece of text.
 * @param {string} s @returns {any}
 */
export function parseSetting(s) {
  const t = String(s).trim();
  if (/^[[{"]|^(true|false|null)$/.test(t)) { try { return JSON.parse(t); } catch {} }
  if (/^\[.*\]$/s.test(t)) return t.slice(1, -1).split(',').map((x) => x.trim()).filter((x) => x !== '').map(parseSetting);
  if (/^[{"]/.test(t)) throw new CadError('edit.value', `${t} starts like JSON and isn't: write it as JSON (in single quotes in the shell), or as plain text`);
  return parseValue(t);
}

// An address's parts: x1.at.0 is ["x1", "at", 0]; a key with a dot in it goes in brackets and quotes, as
// frame.supports["z1.a"], and joins[3] is joins.3
export const segmentsOf = (a) => [...String(a).matchAll(/\["((?:[^"\\]|\\.)*)"\]|\[(\d+)\]|([^.[\]]+)/g)].map((m) => (m[1] != null ? m[1] : m[2] != null ? Number(m[2]) : /^\d+$/.test(m[3]) ? Number(m[3]) : m[3]));

// An address in an assembly, as a path into its JSON: x1.at (an entry by its id), joins.3.kind or joins[3].kind (by its
// place), frame.join (a top-level field). Refused by name: an id nothing has, one two lists share, a generated frame's.
function addressPath(json, address, { ref, file, entry = false }) {
  const segs = segmentsOf(address);
  if (!segs.length) throw new CadError('edit.address', 'give what to change, as <id>.<field>, <list>.<n>.<field> or a top-level field', { file });
  const rest = (from) => segs.slice(from);
  const [first] = segs;
  if (LISTS.includes(first) && typeof segs[1] === 'number') {
    const n = segs[1], len = (json[first] || []).length;
    if (n >= len) throw new CadError('edit.address', `${ref} has ${len ? `${len} ${first} (${first}.0 to ${first}.${len - 1})` : `no ${first}`}: there is no ${first}.${n}`, { file });
    return { path: [first, n, ...rest(2)], entry: [first, n] };
  }
  const hits = ID_LISTS.flatMap((l) => (json[l] || []).map((x, i) => (idOf(l, x, i) === first ? [l, i] : null)).filter(Boolean));
  if (hits.length > 1) throw new CadError('edit.ambiguous', `"${first}" names ${hits.map(([l, i]) => `${l}.${i}`).join(' and ')}: say which, as ${hits.map(([l, i]) => `${l}.${i}`).join(' or ')}`, { file });
  if (hits.length) return { path: [...hits[0], ...rest(1)], entry: hits[0] };
  const known = knownOf(json);
  if (known.generated.includes(first)) throw new CadError('edit.generated', `${first} is made by ${ref}'s generated frame (a ${json.frame.kind}), so it is not in the file to change: change the frame's own fields (frame.profile, frame.inside, frame.join ..), or write the frame out with cad frame ${ref} --expand and change ${first} there`, { file, path: first });
  const top = Object.keys(schema('assembly').properties);
  if (!entry && top.includes(first)) return { path: rest(0), entry: null };
  const ids = ID_LISTS.flatMap((l) => (json[l] || []).map((x, i) => idOf(l, x, i))).filter(Boolean);
  throw new CadError('edit.address', `${ref} has nothing called "${first}" (ids: ${ids.join(', ') || 'none'}; or a list entry by its place, as joins.0${entry ? '' : `; or a top-level field: ${top.filter((k) => k !== '$schema').join(', ')}`})`, { file, path: first });
}

// Set at a path, making the objects it passes through where they are missing; a string where an object is asked for
// stands for its kind ("join": "blind" is { "kind": "blind" }), so frame.join.fitting=printed keeps the blind
function setDeep(text, p, value) {
  for (let k = 1; k < p.length; k++) {
    const up = p.slice(0, k), v = getAt(text, up);
    if (v === undefined) {
      if (typeof p[k] === 'number') throw new CadError('edit.address', `there is no ${up.join('.')} list to set entry ${p[k]} of`);
      text = setAt(text, up, {});
    } else if (typeof v === 'string' && typeof p[k] === 'string') text = setAt(text, up, { kind: v });
    else if (Array.isArray(v) && typeof p[k] === 'number' && p[k] > v.length - 1) throw new CadError('edit.address', `${up.join('.')} has ${v.length} entries (0 to ${v.length - 1}): there is no ${up.join('.')}.${p[k]}`);
  }
  return setAt(text, p, value);
}
const shownPath = (p) => p.map((k) => (typeof k === 'string' && /[.[\]"]/.test(k) ? `[${JSON.stringify(k)}]` : `.${k}`)).join('').replace(/^\./, '');

/**
 * Change fields of an assembly: { address: value }, each address an entry's field by its id (x1.at, hinge.max) or its
 * place (joins.3.kind, fits.0.min), or a top-level field (title, frame.join, frame.inside).
 * @param {string} ref project/assembly @param {Record<string, any>} changes @param {{ dryRun?: boolean }} [options]
 */
export function setInAssembly(ref, changes, { dryRun = false } = {}) {
  const file = assemblyFile(ref), before = fs.readFileSync(file, 'utf8');
  let text = before;
  const done = [], touched = [];
  for (const [address, value] of Object.entries(changes)) {
    const { path: p, entry } = addressPath(JSON.parse(text), address, { ref, file });
    if (entry && p.length === 2) throw new CadError('edit.address', `${address} is a whole ${entry[0].replace(/s$/, '')}: set one of its fields (${address}.<field>), or cad remove it and cad add another`, { file });
    const up = p.length > 1 ? getAt(text, p.slice(0, -1)) : undefined, was = typeof up === 'string' && p.at(-1) === 'kind' ? up : getAt(text, p); // ("join": "blind" is a kind of blind)
    try { text = setDeep(text, p, value); } catch (e) { throw e instanceof CadError ? Object.assign(e, { file }) : new CadError('edit.address', `${address}: ${e.message}`, { file }); }
    done.push({ op: 'set', path: shownPath(p), ...(was !== undefined ? { before: was } : {}), after: value });
    if (entry) touched.push(entry);
  }
  return finish({ ref, file, before, text, kind: 'assembly', changes: done, dryRun, touched });
}

// Every place in an assembly that names an id (as itself, or as id.anchor, id.face@mm, id@pose): [{ path, value }].
// Values that never name an entry (kinds, profiles, screws, notes ..) are passed over.
const NOT_NAMES = new Set(['id', 'object', 'assembly', 'profile', 'kind', 'note', 'label', 'title', 'description', 'screw', 'nut', 'material', 'rail', 'carriage', 'model', 'variant', 'type', 'fitting', 'bought', 'sheet', 'thread', 'op', 'colour', 'gauge', 'mode', 'shape', 'rod', 'bearing', 'coupler', 'wheel', 'size', 'pose', 'show', '$schema', 'uses', 'requires', 'packed', 'tool']);
function namesOf(json, id, { prefix = false } = {}) {
  const hit = (s) => typeof s === 'string' && (s === id || s.startsWith(`${id}.`) || s.startsWith(`${id}@`) || (prefix && s.startsWith(`${id}-`)));
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (hit(v)) out.push({ path: p, value: v }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, [...p, i])); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (NOT_NAMES.has(k)) continue;
      if ((p[0] === 'poses' && p.length === 2) || (p[0] === 'frame' && p[1] === 'supports' && p.length === 2)) { if (hit(k)) { out.push({ path: [...p, k], value: k }); continue; } }
      walk(x, [...p, k]);
    }
  };
  walk(json, []);
  return out;
}

/**
 * Remove from an assembly: an entry by its id or place (x1, joins.3), or a field (x1.rotate, frame.feet). Refused by
 * name where other entries name what goes (a join's beam, a fit's part, a load's anchor), unless withRefs, which removes
 * those entries too and lists them; and where taking out a guide without an id would rename the guides after it.
 * @param {string} ref project/assembly @param {string} address @param {{ withRefs?: boolean, dryRun?: boolean }} [options]
 */
export function removeFromAssembly(ref, address, { withRefs = false, dryRun = false } = {}) {
  const file = assemblyFile(ref), before = fs.readFileSync(file, 'utf8'), json = JSON.parse(before);
  const { path: p, entry } = addressPath(json, address, { ref, file });
  const was = getAt(before, p);
  if (was === undefined) throw new CadError('edit.address', `${ref} has no ${address} to remove`, { file, path: address });
  if (p.length === 1 && LISTS.includes(p[0])) throw new CadError('edit.address', `${address} is a whole list: remove its entries by id or place (${p[0]}.0 ..)`, { file });
  const changes = [{ op: 'remove', path: shownPath(p), before: was }], drop = [p];
  if (entry && p.length === 2) {
    const [list, i] = entry, id = idOf(list, json[list][i], i);
    // a guide with no id is g1, g2 .. by its place, so taking out any guide before one renames it, whether the guide
    // taken out has an id or not
    const renamed = list === 'guides' ? json[list].map((g, k) => (k > i && g?.id == null ? k : -1)).filter((k) => k >= 0) : [];
    if (renamed.length)
      throw new CadError('edit.renumber', `${address} goes before ${renamed.map((k) => `guides.${k}`).join(', ')}, which ${renamed.length === 1 ? 'has' : 'have'} no id of ${renamed.length === 1 ? 'its' : 'their'} own and so ${renamed.length === 1 ? 'is' : 'are'} named by place: ${renamed.map((k) => `g${k + 1} would become g${k}`).join(', ')}. Give ${renamed.length === 1 ? 'it an id' : 'them ids'} first (cad set ${ref} guides.${renamed[0]}.id=g${renamed[0] + 1})`, { file });
    const refs = id ? namesOf({ ...json, [list]: json[list].map((x, k) => (k === i ? null : x)) }, id, { prefix: list === 'guides' }) : [];
    if (refs.length) {
      // each name as what holds it: a list entry, or a pose's or a support's key
      const holders = [...new Map(refs.map((r) => { const e = entryAt(shownPath(r.path)); const h = e ? e : r.path[0] === 'poses' || r.path[0] === 'frame' ? r.path.slice(0, 3) : r.path; return [shownPath(h), h]; })).values()];
      const said = holders.map((h) => { const x = getAt(before, h); return `${shownPath(h)}${x && typeof x === 'object' && !Array.isArray(x) && (x.kind || x.a) ? ` (${[x.kind, x.a && `${x.a} to ${x.b}`].filter(Boolean).join(' ')})` : ''}`; });
      if (!withRefs) throw Object.assign(new CadError('edit.referenced', `${id} is named by ${said.join(', ')}: remove ${holders.length === 1 ? 'it' : 'them'} first, or add --with-refs to remove ${holders.length === 1 ? 'it' : 'them'} with ${id}`, { file, path: shownPath(p) }), { refs: said });
      for (const h of holders) { drop.push(h); changes.push({ op: 'remove', path: shownPath(h), before: getAt(before, h), because: `names ${id}` }); }
    }
  }
  // the last first, so the places of the others hold
  const order = (a, b) => { for (let k = 0; k < Math.min(a.length, b.length); k++) { if (a[k] === b[k]) continue; return typeof a[k] === 'number' && typeof b[k] === 'number' ? b[k] - a[k] : String(a[k]).localeCompare(String(b[k])); } return b.length - a.length; };
  let text = before;
  for (const d of [...new Map(drop.map((x) => [shownPath(x), x])).values()].sort(order)) text = removeAt(text, d);
  return finish({ ref, file, before, text, kind: 'assembly', changes, dryRun, touched: [] });
}

/**
 * Move an item or a guide: an item to a point (--at x,y,z: a beam placed by its ends moves both, as one) or to an
 * address on a beam (--to x1.top@50%), turned by rotate; a guide to another face (--to x3.top) or along it (--at 100).
 * @param {string} ref project/assembly @param {string} id @param {{ at?: any, to?: string, rotate?: any[], dryRun?: boolean }} move
 */
export function moveInAssembly(ref, id, { at, to, rotate, dryRun = false } = {}) {
  const file = assemblyFile(ref), before = fs.readFileSync(file, 'utf8'), json = JSON.parse(before);
  if (at == null && to == null && rotate == null) throw new CadError('edit.incomplete', 'say where it goes: --at x,y,z (a point), --to x1.top@50% (an address on a beam), and or --rotate 0,0,90', { file });
  const { entry } = addressPath(json, id, { ref, file, entry: true });
  if (!entry || !['items', 'guides'].includes(entry[0])) throw new CadError('edit.move', `${id} is ${entry ? `a ${entry[0].replace(/s$/, '')}` : 'not an entry'}: cad move moves items and guides (change others with cad set)`, { file });
  const [list, i] = entry, x = json[list][i], base = [list, i], sets = [];
  if (list === 'guides') {
    if (rotate != null) throw new CadError('edit.move', `${id} is a guide: it lies along its beam's face, so it turns only with the beam`, { file });
    if (to != null) { if (!/^[a-z][\w-]*\.[\w.-]+$/i.test(String(to)) || String(to).includes('@')) throw new CadError('edit.move', `a guide goes on a beam's face, as x3.top; how far along it is --at <mm> (got ${to})`, { file }); sets.push([['on'], String(to)]); }
    if (at != null) { if (Array.isArray(at) || typeof at === 'string' && Number.isNaN(Number(at))) throw new CadError('edit.move', `a guide moves along its face by --at <mm> from the beam's end a (got ${at})`, { file }); sets.push([['from'], Number(at)]); }
  } else {
    const ends = Array.isArray(x.from) && Array.isArray(x.to);
    if (ends && (to != null || rotate != null)) throw new CadError('edit.move', `${id} is a beam placed by its two ends: move it with --at x,y,z (where its end a goes; end b keeps its offset), and turn it with cad set ${ref} ${id}.from=… ${id}.to=… or ${id}.roll=90`, { file });
    if (at != null && ends) {
      if (!Array.isArray(at) || at.length !== 3 || [...at, ...x.from, ...x.to].some((v) => typeof v !== 'number')) throw new CadError('edit.move', `${id} is placed by its ends${[...x.from, ...x.to].some((v) => typeof v !== 'number') ? ' as expressions' : ''}: give --at as x,y,z in mm${[...x.from, ...x.to].some((v) => typeof v !== 'number') ? `, or set ${id}.from and ${id}.to` : ''}`, { file });
      const d = at.map((v, k) => v - x.from[k]);
      sets.push([['from'], at], [['to'], x.to.map((v, k) => +(v + d[k]).toFixed(6))]);
    } else if (at != null) {
      if (!(Array.isArray(at) && at.length === 3) && typeof at !== 'string') throw new CadError('edit.move', `--at is a point, x,y,z in mm (got ${JSON.stringify(at)}); an address on a beam is --to`, { file });
      sets.push([['at'], at]);
    }
    if (to != null) sets.push([['at'], String(to)]);
    if (rotate != null) sets.push([['rotate'], rotate]);
  }
  let text = before;
  const changes = sets.map(([k, v]) => { const p = [...base, ...k], was = getAt(text, p); text = setAt(text, p, v); return { op: 'set', path: shownPath(p), ...(was !== undefined ? { before: was } : {}), after: v }; });
  return finish({ ref, file, before, text, kind: 'assembly', changes, dryRun, touched: [entry] });
}

const NAME = /^[a-z][a-z0-9-]*$/;
// A new file laid out as cad's edits lay one out: two spaces, short lists of numbers on one line
const laidOut = (json) => Object.entries(json).reduce((t, [k, v]) => setAt(t, [k], v), '{}\n');
const projectFile = (project) => path.join(paths.project(project), 'project.json');
// A project's own fields checked beyond the schema: its printer must be a rule set, and its material a plastic printed
// fittings can be sized from (pla, petg, or a rule set with strength, modulus and density), as its schema says: every
// frame command reads it (lib/fittings.mjs's plasticOf) as it builds the assembly's joins, guides and panels
function projectFindings(json, project) {
  const out = [];
  if (json.printer != null) {
    let set = null; try { set = peekRuleSet(json.printer); } catch {}
    if (!set) throw new CadError('project.printer', `project ${project}: there is no printer rule set "${json.printer}" (rules/${json.printer}.json, or the kit's, as x1c)`, { path: 'printer' });
    out.push({ level: 'pass', text: `prints are checked against ${json.printer}`, code: 'project.printer' });
  }
  if (json.material != null) {
    try { const m = plasticNamed(json.material, `project ${project}`); out.push({ level: 'pass', text: `printed fittings are sized from ${typeof m === 'string' ? m.toUpperCase() : json.material}`, code: 'project.material' }); }
    catch (e) { throw new CadError('project.material', e.message, { path: 'material' }); }
  }
  return out;
}

/**
 * Make a project: projects/<name>/project.json with its name, and title, description, material (PLA unless given) and
 * printer where given. Run again on a project that is there with the same fields, it changes nothing and says so (a
 * guide's step can be run twice). Refused by name: a name not in lower case with dashes, a project already there given
 * no fields or fields that differ from its own (cad set changes those), a printer with no rule set.
 * @param {string} name @param {{ title?: string, description?: string, material?: string, printer?: string, dryRun?: boolean }} [fields]
 */
export function newProject(name, { dryRun = false, ...fields } = {}) {
  if (!NAME.test(String(name || ''))) throw new CadError('edit.name', `a project's name is lower case, with dashes (got ${JSON.stringify(name)})`);
  const file = projectFile(name);
  const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
  if (fs.existsSync(file)) {
    if (!Object.keys(given).length) throw new CadError('project.exists', `projects/${name}/project.json is already there: change its fields with cad set ${name} material=PETG ..`, { file });
    return { file, written: false, ...(dryRun ? { dryRun: true } : {}), changes: [], findings: [sameProject(name, given)] };
  }
  const json = { $schema: 'https://jonibach.github.io/rulecad/schemas/project.schema.json', name, ...given, material: given.material ?? 'PLA', objects: [] };
  const text = laidOut(json);
  return finish({ file, before: '', text, kind: 'project', changes: [{ op: 'make', path: `projects/${name}/project.json`, after: json }], dryRun, findings: projectFindings(json, name) });
}

// A project that is there, held to the fields given for it (a material by its name in any case, PLA where it gives
// none): a pass finding where each is already its own, refused by name where one differs, naming the cad set that
// changes it
function sameProject(name, given) {
  const file = projectFile(name), own = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ownOf = (k) => (k === 'material' ? own.material ?? 'PLA' : own[k]), same = (k, v) => (k === 'material' ? String(ownOf(k)).toLowerCase() === String(v).toLowerCase() : ownOf(k) === v);
  const differ = Object.entries(given).filter(([k, v]) => !same(k, v)), was = (k) => (ownOf(k) === undefined ? `no ${k}` : `${k} ${ownOf(k)}`);
  if (differ.length) throw new CadError('project.exists', `projects/${name}/project.json is already there with ${differ.map(([k]) => was(k)).join(' and ')}, so ${differ.map(([k, v]) => `--${k} ${v}`).join(' and ')} would change it: change ${differ.length === 1 ? 'it' : 'them'} with cad set ${name} ${differ.map(([k, v]) => `${k}=${/\s/.test(v) ? JSON.stringify(v) : v}`).join(' ')}`, { file });
  return { level: 'pass', text: `projects/${name}/project.json is already there with ${Object.keys(given).map(was).join(' and ')}: nothing to change`, code: 'project.exists', values: Object.fromEntries(Object.keys(given).map((k) => [k, ownOf(k)])) };
}

/**
 * Change a project's own fields: title, description, material, printer, filaments.<name>.slot. Its objects are kept by
 * cad new <project>/<object>, and refused here. @param {string} project @param {Record<string, any>} changes @param {{ dryRun?: boolean }} [options]
 */
export function setProject(project, changes, { dryRun = false } = {}) {
  const file = projectFile(project);
  if (!fs.existsSync(file)) throw new CadError('project.missing', `there is no project ${project} (projects/${project}/project.json): make it with cad new ${project}`, { file });
  const before = fs.readFileSync(file, 'utf8');
  let text = before;
  const done = [], fields = Object.keys(schema('project').properties).filter((k) => !['$schema', 'objects', 'name'].includes(k));
  for (const [address, value] of Object.entries(changes)) {
    const p = segmentsOf(address);
    if (p[0] === 'objects') throw new CadError('edit.address', 'a project\'s objects are listed by cad new <project>/<object>, as each is made', { file });
    if (p[0] === 'name') throw new CadError('edit.address', `a project's name is its folder's: to rename ${project}, rename projects/${project} and its name together`, { file });
    if (!fields.includes(p[0])) throw new CadError('edit.address', `a project has no field "${p[0]}" (fields: ${fields.join(', ')})`, { file, path: p[0] });
    const was = getAt(text, p);
    text = setDeep(text, p, value);
    done.push({ op: 'set', path: shownPath(p), ...(was !== undefined ? { before: was } : {}), after: value });
  }
  return finish({ file, before, text, kind: 'project', changes: done, dryRun, findings: projectFindings(JSON.parse(text), project) });
}

/**
 * Make an assembly: projects/<project>/assemblies/<name>.json, empty (items: []) or a generated frame, checked as it
 * is made; its project is made first where there is none, with the material and printer given for it (checked as cad new
 * <project> checks them). Refused by name: an assembly already there, a kind that is not fit, a frame the generator
 * refuses, a material or printer for a project that is already there with another (cad set <project> changes those).
 * @param {string} ref project/assembly
 * @param {{ title?: string, kind?: string, description?: string, frame?: object, fields?: Record<string, any>, project?: { material?: string, printer?: string }, dryRun?: boolean }} [fields]
 */
export function newAssembly(ref, { title, kind = 'fit', description, frame, fields = {}, project: forProject = {}, dryRun = false } = {}) {
  const [project, name] = String(ref || '').split('/');
  if (!NAME.test(project || '') || !NAME.test(name || '')) throw new CadError('edit.name', `an assembly is <project>/<name>, each lower case with dashes (got ${JSON.stringify(ref)})`);
  const file = path.join(paths.project(project), 'assemblies', `${name}.json`);
  if (fs.existsSync(file)) throw new CadError('assembly.exists', `projects/${project}/assemblies/${name}.json is already there: change it with cad set, cad add, cad move and cad remove`, { file });
  const projectFields = Object.fromEntries(Object.entries(forProject || {}).filter(([, v]) => v != null)), hasProject = fs.existsSync(projectFile(project));
  const same = hasProject && Object.keys(projectFields).length ? sameProject(project, projectFields) : null; // refused where one differs
  if (!hasProject) newProject(project, { ...projectFields, dryRun: true }); // its material and printer refused before anything is written
  if (kind !== 'fit') throw new CadError('edit.kind', `an assembly's kind is fit (got ${JSON.stringify(kind)}): a mechanism is a fit with joints (cad add joint), a machine a fit with a task, and a plate is written by cad plates`, { file });
  const json = { $schema: 'https://jonibach.github.io/rulecad/schemas/assembly.schema.json', title: title ?? name, kind, ...(description ? { description } : {}), ...(frame ? { frame } : { items: [] }) };
  // its other fields as cad set takes them, before it is checked: a portal's supports, its loads
  let text = laidOut(json);
  const top = Object.keys(schema('assembly').properties);
  for (const [address, value] of Object.entries(fields)) {
    const p = segmentsOf(address);
    if (!top.includes(p[0])) throw new CadError('edit.address', `an assembly has no field "${p[0]}" (fields: ${top.filter((k) => k !== '$schema').join(', ')})`, { file });
    text = setDeep(text, p, value);
  }
  const args = { ref, file, before: '', text, kind: 'assembly', changes: [{ op: 'make', path: `projects/${project}/assemblies/${name}.json`, after: JSON.parse(text) }], touched: [] };
  try { finish({ ...args, dryRun: true }); } catch (e) { throw Object.assign(e, { message: e.message.replace(/^not changed: /, 'not made: ') }); } // checked before anything is written, the project too
  const made = [];
  if (!hasProject) made.push(newProject(project, { ...projectFields, dryRun }));
  const r = finish({ ...args, dryRun });
  return { ...r, changes: [...made.flatMap((m) => m.changes), ...r.changes], findings: [...made.flatMap((m) => m.findings.filter((f) => f.code !== 'schema')), ...(same ? [same] : []), ...r.findings], made: [...made.map((m) => m.file), r.file] };
}

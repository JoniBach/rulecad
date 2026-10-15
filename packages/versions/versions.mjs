// Versions for physical parts: semver where the interface is what fits. A part's interface variables are the
// measurements other parts depend on (a keycap's stem slot), so:
//   major: an earlier print may no longer fit: an interface variable changed or went away, a variant changed
//   minor: something added that doesn't break fits: a new interface variable, option, variant or tweak range
//   patch: anything else (print quality, tolerances that aren't interface, the shape's code, the rules it uses)
// compare(before, after) reads two snapshots of a design and says which, with a reason for each change. Releases can
// then be git tags, files, anything: this module only reads and compares, it stores nothing. No files, browsers too.
import { fmt } from '@rulecad/variables';
import { project } from '@rulecad/keyboard-layout';

// ---------- semver ----------
const KINDS = ['patch', 'minor', 'major'];
export const parse = (v) => { const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)$/); if (!m) throw new Error(`"${v}" isn't a version like 1.2.0`); return m.slice(1).map(Number); };
export function bump(v, kind) {
  const [a, b, c] = parse(v);
  return kind === 'major' ? `${a + 1}.0.0` : kind === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}
export const newer = (x, y) => { const [p, q] = [parse(x), parse(y)]; for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] > q[i]; return false; };
export const bigger = (k1, k2) => (KINDS.indexOf(k1) >= KINDS.indexOf(k2) ? k1 : k2);


// satisfies('0.2.1', '^0.2.0') -> true
export function satisfies(version, range) {
  const m = String(range).match(/^([~^]?)(\d+\.\d+\.\d+)$/);
  if (!m) throw new Error(`"${range}" isn't a version range like ^1.2.0, ~1.2.0 or 1.2.0`);
  const [a, b, c] = parse(version), [x, y, z] = parse(m[2]), atLeast = a > x || (a === x && (b > y || (b === y && c >= z)));
  if (m[1] === '^') return a === x && atLeast; // same major: a minor release never breaks a fit, 0.x included
  if (m[1] === '~') return a === x && b === y && c >= z;
  return a === x && b === y && c === z;
}

// ---------- what changed ----------
// compare(before, after) -> { kind: 'major'|'minor'|'patch'|null, reasons }
// before/after: { object, entries, js } (entries from resolve(), js the design's source).
export function compare(before, after) {
  const reasons = [], add = (kind, text) => reasons.push({ kind, text });
  const val = (r, name) => r.entries.find((e) => e.name === name);
  const v = (r, name) => fmt(val(r, name).value); // for reading: 4.2, not 4.199999999999999
  const vars = (r) => r.object.variables || {};
  const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b); // numbers, or choices

  for (const [name, d] of Object.entries(vars(before))) {
    const now = vars(after)[name];
    if (d.interface) {
      if (!now) add('major', `interface ${name} removed`);
      else if (!now.interface) add('major', `${name} is no longer interface`);
      else if (!same(val(before, name).value, val(after, name).value)) add('major', `interface ${name} ${v(before, name)} → ${v(after, name)}`);
    } else if (!now) add('patch', `${name} removed`);
    else if (!same(val(before, name).value, val(after, name).value)) add('patch', `${name} ${v(before, name)} → ${v(after, name)}`);
  }
  for (const [name, d] of Object.entries(vars(after))) {
    const was = vars(before)[name];
    if (d.interface && !was?.interface && was) continue; // reported above as a change of role
    if (d.interface && !was) add('minor', `interface ${name} added (${v(after, name)})`);
    else if (!was) add('patch', `${name} added`);
    if ((d.type === 'text' || d.type === 'anchor') && !was?.type) add('minor', `${name} can now be set (${d.type})`); // a new input
    if (d.choice) { // a choice: options added are new ways to build it; options taken away break what used them
      for (const c of d.choice) if (!was?.choice?.includes(c)) add('minor', `${name} can now be ${c}`);
      for (const c of was?.choice || []) if (!d.choice.includes(c)) add(d.interface ? 'major' : 'patch', `${name} can no longer be ${c}`);
    }
    if (d.tweak && !was?.tweak) add('minor', `${name} can now be set (${d.tweak.min} to ${d.tweak.max})`);
    else if (d.tweak && was?.tweak && (d.tweak.min !== was.tweak.min || d.tweak.max !== was.tweak.max)) add('patch', `${name} range now ${d.tweak.min} to ${d.tweak.max}`);
  }
  // Values the design builds from that changed without any variable changing: a rule's value
  for (const e of after.entries) if (e.name.includes('.')) { const b = val(before, e.name); if (b && !same(b.value, e.value)) add('patch', `rule ${e.name} ${fmt(b.value)} → ${fmt(e.value)}`); }
  // Layouts kept in an object's .json (older designs): moving one into a layout file is no change, if its keys match
  const lay = (r) => r.object.layouts || {}, fields = (r, n) => Object.values(r.object.variables || {}).find((v) => v.type === 'layout' && (v.choice || []).includes(n))?.fields;
  for (const [k, l] of Object.entries(lay(before))) {
    const now = lay(after)[k] ?? after.layouts?.[k];
    if (!now) add('major', `layout ${k} removed`);
    else if (JSON.stringify(project(l, fields(after, k))) !== JSON.stringify(project(now, fields(after, k)))) add('major', `layout ${k} changed`);
    else if (!lay(after)[k]) add('patch', `layout ${k} moved to its own file`);
  }
  for (const k of Object.keys(lay(after))) if (!lay(before)[k]) add('minor', `layout ${k} added`);
  if (before.js.trimEnd() !== after.js.trimEnd()) add('patch', 'shape code changed');
  if (before.engine != null && after.engine != null && before.engine.trimEnd() !== after.engine.trimEnd()) add('patch', 'board engine changed (footprints, routing)');
  for (const k of ['material', 'orientation', 'title']) if (before.object[k] !== after.object[k]) add('patch', `${k} changed`);
  const shown = (o) => JSON.stringify(o.display || o.mirror || {}); // on-screen settings ("display", once "mirror")
  if (shown(before.object) !== shown(after.object)) add('patch', 'display settings changed');
  // Variants: a new one is a new way to build it; changing or removing one changes what was built under that name
  const vb = before.object.variants || {}, va = after.object.variants || {};
  for (const [k, v] of Object.entries(vb)) {
    if (!va[k]) add('major', `variant ${k} removed`);
    else if (JSON.stringify(v) !== JSON.stringify(va[k])) add('major', `variant ${k} changed`);
  }
  for (const k of Object.keys(va)) if (!vb[k]) add('minor', `variant ${k} added`);
  // Layout files: compared only on what this object reads of each key (its layout variable's fields), plus positions
  for (const [name, v] of Object.entries(after.object.variables || {})) if (v.type === 'layout') {
    for (const n of v.choice || [v.value]) {
      const b = before.layouts?.[n], a = after.layouts?.[n];
      if (!a || !b) continue; // new choices are reported above; a layout moved out of the .json just above
      if (JSON.stringify(project(b, v.fields)) !== JSON.stringify(project(a, v.fields))) add('major', `layout ${n} changed (${['positions', ...(v.fields || [])].join(', ')})`);
    }
  }
  const kind = reasons.reduce((k, r) => (k ? bigger(k, r.kind) : r.kind), null);
  return { kind, reasons };
}

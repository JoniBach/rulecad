// Screw dimensions typed by hand, counted by place: what the fixings migration (docs/fixings-and-frames.md, section 3)
// moves onto @rulecad/fixings. Each migration step lowers the count, and test/fixings-inventory.test.mjs fails if it
// rises, so a new design can't quietly type a screw's hole again.
//
// What counts, in a design's variables (an object's .json in a workspace's projects/, or a block of JSON in a document):
//   named  a variable whose rule names a thread ("M3 clearance", "the 6-32 screw's head"): the measure of 2026-11-14
//   reads  a variable whose rule names none, but whose value reads a thread set by hand (m3.head + 2 * x1c.fit)
//   typed  a variable that names neither, holding a typed figure from 1.4 to 13 mm, whose rule says it is a pilot, a
//          clearance, an insert's or a nut's hole, a counterbore or a countersink (a typed 2.9 "self-tapping pilot")
// and in a package's own code:
//   table  a thread set imported by a package other than rules and fixings: a private screw table
// An object whose design reads v.fixings is counted as moved, as is a document's block for one.
//
//   node scripts/fixings-inventory.mjs            the count by place, then the total
//   node scripts/fixings-inventory.mjs --list     every variable counted, by place
//   node scripts/fixings-inventory.mjs --json     the count as JSON
//   node scripts/fixings-inventory.mjs --record   writes the count to test/fixings-inventory.json (after a migration step)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const RECORD = path.join(ROOT, 'test', 'fixings-inventory.json');
export const KINDS = ['named', 'reads', 'typed', 'table'];

// A thread named in words: metric M1.6 to M12, and the inch sizes the kit has sets for
export const THREAD = /\bM(?:1\.6|2\.5|[2-8]|10|12)\b|(?:^|[^\w/.-])(?:4-40|6-32|8-32|10-24|10-32|1\/4-20|5\/16-18|3\/8-16)\b/;
// A thread set read in an expression: m3.clearance, unc_6_32.head
export const SET_READ = /\b(?:m1_6|m2_5|m[2-68]|m1[02]|un[cf]_\w+?|pt_k\d+)\.[a-z_]/;
const SET_FILE = /^(?:m1_6|m2_5|m[2-68]|m1[02]|un[cf]_\w+|pt_k\d+)$/;
const HOLE_WORDS = /pilot|self-tap|clearance|insert|\bnut\b|tapped|screw hole|counterbore|countersink/i;

/**
 * Which kind of hand-typed screw dimension a variable is, if it is one.
 * @param {{ value?: unknown, rule?: string }} v a variable or a rule, as written in its .json
 * @returns {'named' | 'reads' | 'typed' | null}
 */
export function kindOf(v) {
  if (!v || typeof v !== 'object') return null;
  const rule = typeof v.rule === 'string' ? v.rule : '', value = v.value;
  if (THREAD.test(rule)) return 'named';
  if (typeof value === 'string' && SET_READ.test(value)) return 'reads';
  if (typeof value === 'number' && value >= 1.4 && value <= 13 && HOLE_WORDS.test(rule)) return 'typed';
  return null;
}

// Screw sizes that stay typed on purpose, each with its reason (Fixings 3.9, #239). The inventory counts none of them
// (--list shows them apart), and test/fixings-inventory.test.mjs holds each to a variable still in its file, so a
// reason can't outlive what it was given for.
export const DELIBERATE = [
  { file: 'examples/thin-picro/projects/thin-picro/objects/module.json', name: 'hole_d', why: 'The module is a drop-in for a Raspberry Pi Pico, so its two holes are the Pico\'s 2.1 mm, and cases made for a Pico fit it. It goes through v.pcb.mount(\'M2\', ..., { d }), which reads the M2 set and refuses a hole that would not pass the screw; the set\'s clearance (2.4 mm) would move the fab drill' },
  { file: 'examples/thin-picro/projects/thin-picro/objects/module.json', name: 'hole_keepout', why: 'A router keepout round each hole, not a hole: the rule names the M2 head only to say why it is under the head\'s radius (wider crowds the tracks to the right-hand pins, so a nylon screw or washer is asked for)' },
  { file: 'examples/bench/projects/benchmarks/objects/servo-arm.json', name: 'slot', why: 'The screws a servo horn comes with are self-tapping screws sized by the horn\'s holes, no thread a fixings set holds; the slot takes them wherever the holes fall. Moving it to the M2 clearance would widen a printed slot for a screw nobody named' },
  { file: 'examples/bench/projects/benchmarks/objects/servo-arm.json', name: 'middle', why: 'Room over the horn\'s middle for its screw\'s head and a driver, not a hole the screw passes: the horn screw goes into the servo\'s spline, and sg90.horn_screw names it' },
];

// Places swept for screw sizes typed in code, and what was found (Fixings 3.9, #239). None is counted: none types a
// hole a printed part gets for a screw.
export const SWEPT = [
  { place: 'packages/gears', why: 'No screws: spur, helical, bevel and worm take a bore and a flat for a shaft, sized by the design. The arm\'s sun grips its shaft by the flat in its hub, with no set screw' },
  { place: 'packages/flexures', why: 'snapPin and snapSocket size a peg from snapPinModel\'s forces, not from a thread. Where a snap pin does a screw\'s job (the tensioner pawl\'s root on the frame\'s two push pins, the launcher\'s pin), it is chosen to need no hardware, and its 2.5 mm shaft is no screw\'s' },
  { place: 'packages/keyboard-layout', why: 'Key positions only: no holes. A keyboard board\'s corner holes are pcb\'s mount(\'M2\', { set: v.m2 }), which reads the M2 set; a case reads them through pcb.holes() and fastens with fasten' },
  { place: 'packages/viewer', why: 'Shows the screws cad order names (count, name, key, torque) and draws no sizes of its own' },
  { place: 'packages/cad/lib/bought.mjs', why: 'A bought switch drawn with its own holes, 2.4 mm where its rule set gives none: a picture of the part, never a hole a printed part gets' },
  { place: 'packages/cad/lib/sheet.mjs', why: 'A nut\'s data-sheet drawing marks its flange holes 3.5 mm where its rule set gives none: a drawing of the bought nut, never a hole a printed part gets' },
  { place: 'examples/bench/projects/arm/objects/zcar.json', why: 'The T8 nut\'s flange holes read t8_nut.mount_hole_diameter, the bought nut\'s own rule set, through shapes\' nutTrap: no thread typed by hand' },
];
const deliberate = (file, name) => DELIBERATE.find((d) => d.file === file && d.name === name);

const usesFixings = (js) => /\bv\.fixings\b/.test(js);
const variablesOf = (o) => ({ ...(o && typeof o.variables === 'object' ? o.variables : {}), ...(o && typeof o.rules === 'object' ? o.rules : {}) });

// The variables a document's JSON blocks hold. A block that doesn't parse (a fragment, an edit) is read by its rule
// strings alone, so only its named ones count. A block for an object whose design, in the same section, reads
// v.fixings is passed over.
function documentItems(file, text) {
  const out = [];
  for (const section of text.replace(/\r\n/g, '\n').split(/^(?=## )/m)) {
    const blocks = [...section.matchAll(/^```(\w*)[ \t]*(\S*)[^\n]*\n([\s\S]*?)^```/gm)].map((m) => ({ lang: m[1], path: m[2], body: m[3] }));
    const moved = new Set(blocks.filter((b) => /\.js$/.test(b.path) && usesFixings(b.body)).map((b) => b.path.replace(/\.js$/, '')));
    for (const b of blocks) {
      if (b.lang !== 'json' || moved.has(b.path.replace(/\.json$/, ''))) continue;
      let o = null; try { o = JSON.parse(b.body); } catch {}
      if (o) { for (const [name, v] of Object.entries(variablesOf(o))) { const kind = kindOf(v); if (kind) out.push({ file, block: b.path, name, kind, value: v.value, rule: v.rule }); } }
      else for (const m of b.body.matchAll(/"(\w+)":\s*\{[^{}]*?"rule":\s*"([^"]*)"/g)) if (THREAD.test(m[2])) out.push({ file, block: b.path, name: m[1], kind: 'named', rule: m[2] });
    }
  }
  return out;
}

/**
 * The files the inventory reads: what git tracks, and new files it doesn't ignore.
 * @param {string} [root] @returns {string[]} paths relative to root, with forward slashes
 */
export function filesOf(root = ROOT) {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter((f) => f && !f.includes('node_modules/'));
}

/**
 * Every hand-typed screw dimension, and the count by place.
 * @param {{ root?: string, files?: string[], read?: (file: string) => string | null }} [o] files: relative paths (git's,
 *   by default); read: a file's text (null when gone)
 * @returns {{ places: Record<string, Record<string, number>>, objects: Record<string, number>, total: Record<string, number>, named: number, items: object[], deliberate: object[] }}
 *   places: each kind's count by place (a workspace's project, a document, a package); objects: the objects or blocks
 *   counted in each place; total: each kind over every place; named: the objects and blocks with a named one;
 *   deliberate: the ones DELIBERATE keeps, each with its reason (why), counted nowhere
 */
export function inventory({ root = ROOT, files = filesOf(root), read } = {}) {
  read ||= (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return null; } };
  const have = new Set(files), items = [], kept = [];
  for (const f of files) {
    let m;
    if ((m = f.match(/^(.*\/projects\/[^/]+)\/objects\/([^/]+)\.json$/))) {
      const js = have.has(f.replace(/\.json$/, '.js')) ? read(f.replace(/\.json$/, '.js')) : null;
      if (js && usesFixings(js)) continue;
      let o; try { o = JSON.parse(read(f)); } catch { continue; } // (a broken .json is cad check's to name)
      for (const [name, v] of Object.entries(variablesOf({ variables: o?.variables }))) { const kind = kindOf(v), d = kind && deliberate(f, name); if (kind) (d ? kept : items).push({ place: m[1], file: f, name, kind, value: v.value, rule: v.rule, ...(d ? { why: d.why } : {}) }); }
    } else if (/\.md$/.test(f)) {
      const text = read(f);
      if (text) for (const x of documentItems(f, text)) items.push({ place: f, ...x });
    } else if ((m = f.match(/^packages\/([^/]+)\/(?:.*\/)?[^/]+\.mjs$/)) && !['rules', 'fixings'].includes(m[1]) && !/(^|\/)test[^/]*\.mjs$|\.test\.mjs$/.test(f)) {
      const text = read(f) || '';
      for (const s of text.matchAll(/^\s*import\s+\w+\s+from\s+'@rulecad\/rules\/([\w-]+)\.json'/gm)) if (SET_FILE.test(s[1])) items.push({ place: `packages/${m[1]}`, file: f, name: s[1], kind: 'table' });
    }
  }
  const places = {}, objects = {}, seen = {}, named = new Set(), total = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const x of items) {
    (places[x.place] ||= Object.fromEntries(KINDS.map((k) => [k, 0])))[x.kind]++;
    total[x.kind]++;
    const whose = `${x.file}|${x.block || ''}`;
    if (x.kind === 'named') named.add(whose);
    if (!(seen[x.place] ||= new Set()).has(whose)) { seen[x.place].add(whose); objects[x.place] = (objects[x.place] || 0) + 1; }
  }
  const sorted = Object.fromEntries(Object.entries(places).sort(([a], [b]) => a.localeCompare(b)));
  return { places: sorted, objects, total, named: named.size, items, deliberate: kept };
}

/**
 * Where the count differs from the record: each place and kind that rose or fell.
 * @param {{ places: Record<string, Record<string, number>> }} now @param {{ places: Record<string, Record<string, number>> }} record
 * @returns {{ place: string, kind: string, was: number, now: number }[]}
 */
export function against(now, record) {
  const out = [];
  for (const place of new Set([...Object.keys(record.places || {}), ...Object.keys(now.places)])) for (const kind of KINDS) {
    const was = record.places?.[place]?.[kind] || 0, is = now.places[place]?.[kind] || 0;
    if (was !== is) out.push({ place, kind, was, now: is });
  }
  return out;
}

const sum = (c) => KINDS.reduce((t, k) => t + (c[k] || 0), 0);
function table(r) {
  const lines = [`${'place'.padEnd(52)} ${KINDS.map((k) => k.padStart(6)).join(' ')}  objects`];
  for (const [p, c] of Object.entries(r.places)) lines.push(`${p.padEnd(52)} ${KINDS.map((k) => String(c[k] || '').padStart(6)).join(' ')}  ${String(r.objects[p]).padStart(7)}`);
  lines.push(`${'total'.padEnd(52)} ${KINDS.map((k) => String(r.total[k]).padStart(6)).join(' ')}  ${String(Object.values(r.objects).reduce((a, b) => a + b, 0)).padStart(7)}`);
  lines.push(`(${r.total.named} named, in ${r.named} objects and document blocks; ${r.deliberate.length} kept on purpose, each with its reason: --list)`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = inventory(), flag = (f) => process.argv.includes(f);
  if (flag('--json')) console.log(JSON.stringify({ places: r.places, objects: r.objects, total: r.total }, null, 2));
  else if (flag('--list')) {
    for (const x of r.items) console.log(`${x.place}  ${x.kind}  ${x.block ? `${x.block} ` : ''}${x.name} = ${JSON.stringify(x.value)}${x.rule ? `  "${x.rule}"` : ''}`);
    for (const x of r.deliberate) console.log(`${x.place}  kept  ${x.name} = ${JSON.stringify(x.value)}: ${x.why}`);
    console.log(table(r));
  }
  else console.log(table(r));
  if (flag('--record')) {
    fs.writeFileSync(RECORD, JSON.stringify({ _doc: 'Screw dimensions typed by hand, by place: scripts/fixings-inventory.mjs counts them and test/fixings-inventory.test.mjs fails if a count rises. Each fixings migration step lowers them: node scripts/fixings-inventory.mjs --record', places: r.places, total: r.total }, null, 2) + '\n');
    console.log(`recorded ${sum(r.total)} in ${path.relative(ROOT, RECORD)}`);
  }
}

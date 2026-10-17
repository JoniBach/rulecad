#!/usr/bin/env node
// cad: make, check, preview, export and show rule-driven designs. Run `cad help`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fmt, loadRuleSet } from '../lib/rules.mjs';
import { WS, TOOL, paths, config, printerOf } from '../lib/workspace.mjs';
import { fromKLE } from '@rulecad/keyboard-layout';
import { target, hasTarget } from '../lib/targets.mjs';
import { locate, build, pick, lint, readObject, printer, pcbEngine, objectSets } from '../lib/design.mjs';
import { git, tags, bump, bigger, newer, compare, snapshot, materialise, files, prints, printsFile, engineId } from '../lib/versions.mjs';
import { check } from '@rulecad/printcheck';
import { preview } from '../lib/preview.mjs';
import { isAssembly, buildAssembly, checkAssembly, shapes } from '../lib/assembly.mjs';
import { fromParts, fromShapes, encode, check as checkLink, expand } from '@rulecad/model-link';
import { threemf, slotOf } from '../lib/threemf.mjs';

// The project's filaments: { base: { slot: 1, … }, legend: { slot: 2, … } } in project.json
const filaments = (project) => JSON.parse(fs.readFileSync(path.join(paths.project(project), 'project.json'), 'utf8')).filaments || {};
// The filaments in AMS slot order, for the print file: [{ colour }, …], slot 1 first
const slots = (fil) => { const out = []; for (const f of Object.values(fil)) out[(f.slot || 1) - 1] = f; return Array.from(out, (f) => f || {}); };
// What the print file asks of the AMS: which filament each kind of part prints in
function filamentNotes(parts, fil) {
  const used = [...new Set(parts.map((p) => p.filament || 'base'))];
  const missing = used.filter((f) => f !== 'base' && !fil[f]);
  if (missing.length) return [{ level: 'fail', text: `parts print in ${missing.join(', ')}, which project.json's filaments don't list` }];
  return [{ level: 'pass', text: used.length > 1 ? `${used.length} filaments: ${used.map((f) => `${f} in AMS slot ${slotOf(fil, f)}${fil[f]?.name ? ` (${fil[f].name})` : ''}`).join(', ')}` : 'one filament' }];
}

// --open: the 3MF in Bambu Studio (macOS), else whatever opens .3mf files
const openInSlicer = (f) => (process.platform === 'darwin' ? execFileSync('open', ['-a', 'Bambu Studio', f])
  : execFileSync(process.platform === 'win32' ? 'explorer' : 'xdg-open', [f]));
const VIEW = process.env.CAD_VIEW_URL || config.viewUrl;
// A link to the model page; one the page would turn away is an error here, not when someone opens it
async function linkTo(model) {
  const errors = checkLink(model.shapes ? expand(model) : model);
  if (errors.length) throw new Error(`no link: ${errors[0]}`);
  return `${VIEW}#m=${await encode(model)}`;
}

const HELP = `cad: JSCAD designs you can trace, check, share and print (rulecad)

  cad new <project>/<object>        start a design from the template (makes the project if needed)
  cad import-kle <file> <project>/<name>   a keyboard layout from keyboard-layout-editor.com, into layouts/
  cad agents                        AGENTS.md: how an AI agent should design in this workspace
  cad rules <project>/<object>      every variable: value, the rule behind it, its source
  cad check <project>/<object>      raw numbers in the design, then printability (exit 1 on a failure)
  cad preview <project>/<object>    four views as a PNG in .preview/ (prints the path)
  cad export <project>/<object>     a 3MF for Bambu Studio in exports/ [--open: open it in Bambu Studio]
  cad show <project>/<object>       the model on display through your show target, with its rules [--ttl 10m]
  cad link <project>/<object>       links to open the model in a browser, and to download its STL or 3MF
                                    [--md: one labelled Markdown link, for chat (the page downloads any parts): short unless --long]
                                    [--short: the model's data in a secret GitHub Gist, so links are ~80 characters]

  cad status [project]              each object's version, and whether it has changes since its last release
  cad release <project>/<object> -m "what changed" [--bump major|minor|patch] [--dry-run] [--push]
      check it, compare with the last release, suggest the bump, then commit, tag and log it in CHANGELOG.md
  cad release <project> -m "…"      a project release: records the version of each object
  cad history <project>[/<object>]  releases, with what changed and what was printed
  cad diff <project>/<object> <from> [<to>]   what changed between two releases (or a release and now)
  cad printed <project>/<object> --result ok|failed [--note "…"] [--material PETG] [--version 0.1.0]
  cad release <project> --all -m "…"   release every object that changed (each with this message), then the project

  cad variants <project>/<object>   the object's variants: named sets of inputs, built as <project>/<object>:<variant>
  cad compare <project>/<object> <a> <b>   two variants (or releases, 1.2.0) side by side in one preview

  <project>/<object>:<variant>      any command works on a variant: cad export keyboard/keycap:legend-f

  <project>/<object>@<version>      any command but release works on a release: cad export keyboard/keycap@0.1.0
  --set name=value,name=value       change variables that have a tweak range (any command)
  --part <name>                     only that part (check, preview, export, link): e.g. --part cap
  --explode                         preview: parts moved apart, so each can be seen
  --trailer "Co-Authored-By: …"     added to release commits (for agents)`;

const args = process.argv.slice(2);
// --name value, or -m for one-letter names
const opt = (k) => { const i = args.findIndex((a) => a === `--${k}` || (k.length === 1 && a === `-${k}`)); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined; };
const sets = () => Object.fromEntries(String(opt('set') || '').split(',').filter(Boolean).map((p) => p.split('=').map((s) => s.trim())));
const suffix = (set) => Object.entries(set).map(([k, v]) => `-${k}=${v}`).join('');

function report(findings) {
  const mark = { pass: '✓', warn: '!', fail: '✗', info: '·' };
  for (const r of findings) console.log(`  ${mark[r.level]} ${r.text}`);
  return findings.some((r) => r.level === 'fail');
}

async function main() {
  const [cmd, ref] = args;
  if (!cmd || cmd === 'help') return console.log(HELP);

  if (cmd === 'new') {
    const [project, name] = String(ref || '').split('/');
    if (!/^[a-z][a-z0-9-]*$/.test(project || '') || !/^[a-z][a-z0-9-]*$/.test(name || '')) throw new Error('usage: cad new <project>/<object>, lower-case names with dashes');
    const dir = paths.project(project), objects = path.join(dir, 'objects');
    fs.mkdirSync(objects, { recursive: true });
    const pj = path.join(dir, 'project.json');
    const p = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : { name: project, description: '', material: 'PLA', objects: [] };
    for (const ext of ['js', 'json']) {
      const to = path.join(objects, `${name}.${ext}`);
      if (fs.existsSync(to)) throw new Error(`${path.relative(WS, to)} already exists`);
      fs.writeFileSync(to, fs.readFileSync(path.join(TOOL, 'templates', `object.${ext}`), 'utf8').replaceAll('NAME', name));
    }
    if (!p.objects.includes(name)) p.objects.push(name);
    fs.writeFileSync(pj, JSON.stringify(p, null, 2) + '\n');
    return console.log(`made projects/${project}/objects/${name}.{js,json}`);
  }

  if (cmd === 'agents') { // the notes for AI agents, into this workspace (AGENTS.md, and CLAUDE.md pointing at it)
    const to = path.join(WS, 'AGENTS.md');
    fs.copyFileSync(path.join(TOOL, 'AGENTS.md'), to);
    const claude = path.join(WS, 'CLAUDE.md');
    if (!fs.existsSync(claude)) fs.writeFileSync(claude, '@AGENTS.md\n');
    else if (!fs.readFileSync(claude, 'utf8').includes('@AGENTS.md')) fs.appendFileSync(claude, '\n@AGENTS.md\n');
    return console.log(`wrote ${path.relative(process.cwd(), to) || 'AGENTS.md'}: how an AI agent should design here (CLAUDE.md includes it)`);
  }
  if (cmd === 'import-kle') { // a layout from keyboard-layout-editor.com into a project's layouts/
    const [project, name] = String(args[2] || '').split('/');
    if (!ref || !fs.existsSync(ref) || !project || !/^[a-z][a-z0-9-]*$/.test(name || '')) throw new Error('usage: cad import-kle <layout.json> <project>/<name> (the JSON download, or a file with its Raw data)');
    const { layout, notes } = fromKLE(fs.readFileSync(ref, 'utf8'));
    const to = path.join(paths.project(project), 'layouts', `${name}.json`);
    if (fs.existsSync(to) && !opt('force')) throw new Error(`${path.relative(WS, to)} already exists (--force to replace it)`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, `${JSON.stringify({ title: layout.title || name, ...layout }, null, 1)}\n`);
    console.log(`made ${path.relative(WS, to)}: ${layout.rows.length} rows, ${layout.rows.flat().filter((k) => !k.gap).length} keys`);
    for (const n of notes) console.log(`  note: ${n}`);
    return;
  }
  if (cmd === 'status') return status(ref);
  if (!ref) throw new Error(`usage: cad ${cmd} <project>/<object>`);
  if (cmd === 'release') return ref.includes('/') ? releaseObject(locate(ref)) : opt('all') ? releaseAll(ref) : releaseProject(ref);
  if (cmd === 'variants') return variants(locate(ref));
  if (cmd === 'compare') return compareVariants(locate(ref), args[2], args[3]);
  if (cmd === 'history') return history(ref);
  if (cmd === 'diff') return diff(locate(ref), args[2], args[3] && !args[3].startsWith('--') ? args[3] : null);
  if (cmd === 'printed') return printed(locate(ref));
  if (isAssembly(ref)) return assembly(cmd, ref);
  const [base, at] = ref.split('@');
  const d = at ? materialise(locate(base), at) : locate(ref), set = sets();
  const b = opt('part') ? pick(await build(d, set), { part: opt('part') }) : await build(d, set);
  const tag = `${d.variant ? `-${d.variant}` : ''}${suffix(set)}${opt('part') ? `-${opt('part')}` : ''}`; // in file names
  const title = `${b.object.title || b.object.name}${d.variant ? ` (${d.variant})` : ''}`, version = b.object.version || '0.0.0';

  if (b.circuit && ['check', 'preview', 'export'].includes(cmd)) return board(cmd, d, b, { title, version, tag });

  if (cmd === 'rules') {
    for (const e of b.entries) console.log(`${e.name.padEnd(18)} ${`${fmt(e.value)} ${e.unit || ''}`.padEnd(14)} ${e.expr ? `= ${e.expr}  ` : ''}${e.rule || ''}${e.source ? `  [${e.kind ? `${e.kind}: ` : ''}${e.source}]` : ''}${e.set ? '  (set)' : ''}`);
    return;
  }

  if (cmd === 'check') {
    console.log(`${title} ${version}${Object.keys(set).length ? ` (${suffix(set).slice(1)})` : ''}`);
    const raw = lint(fs.readFileSync(d.js, 'utf8'));
    const failed = report([
      raw.length ? { level: 'fail', text: `numbers in ${path.basename(d.js)} that should be variables: ${raw.map((r) => `line ${r.line}: ${r.text}`).join(', ')}` } : { level: 'pass', text: 'every measurement is a variable' },
      ...(b.object.role === 'reference'
        ? [{ level: 'pass', text: `a reference (${(await import('@rulecad/printcheck')).bounds(b.triangles).size.map(fmt).join(' × ')} mm), not printed: no print checks` }]
        : check(b.triangles, printer(b, d), { parts: b.parts })),
    ]);
    if (b.object.orientation) console.log(`  orientation: ${b.object.orientation}`);
    if (b.parts.length > 1) console.log(`  parts: ${b.parts.map((p) => `${p.name}${p.role === 'support' ? ' (support)' : ''}`).join(', ')}`);
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (cmd === 'preview') {
    const out = paths.preview(d.project, `${d.name}${tag}${opt('explode') ? '-exploded' : ''}.png`);
    const size = (await import('@rulecad/printcheck')).bounds(b.triangles).size.map((n) => fmt(n)).join(' × ');
    const parts = b.parts.length > 1 ? ` · ${b.parts.map((p) => (p.role === 'support' ? `${p.label} (faint)` : p.label)).join(', ')}` : '';
    await preview(b.parts, { title: `${title} ${version}${opt('part') ? `: ${b.parts[0].label}` : ''}`, meta: [`${size} mm`, b.object.material].filter(Boolean).join(' · ') + parts, out, explode: !!opt('explode') });
    return console.log(out);
  }

  if (cmd === 'export') {
    const out = paths.exports(d.project, `${d.name}@${version}${tag}.3mf`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const fil = filaments(d.project); // one object, a part per part, each in its filament
    fs.writeFileSync(out, await threemf([{ name: `${d.name}${d.variant ? ` ${d.variant}` : ''}`, parts: b.parts.map((p) => ({ name: p.label, triangles: p.triangles, slot: slotOf(fil, p.filament) })) }], { filaments: slots(fil) }));
    report(filamentNotes(b.parts, fil));
    if (opt('open')) openInSlicer(out);
    return console.log(out);
  }

  if (cmd === 'link') return await printLinks(await links(d, b, set));

  if (cmd === 'show') {
    const light = b.object.mirror && !opt('part') ? await build(d, set, { mirror: true }) : b; // the object's mirror settings
    const shown = pick(light, { forMirror: true }); // the design itself, not what holds it up while printing, nor fine detail
    // The rules card: the variables marked show, one line each
    const items = b.entries.filter((e) => e.show).slice(0, 6).map((e) => `${e.label || e.name} ${fmt(e.value)} ${e.unit || ''}${e.set ? ' (set)' : ''}`.trim());
    await (await target('show'))({ title: `${title} ${version}`, ttl: opt('ttl') || '10m', mesh: { polygons: shown.polygons }, card: { title: `${title} rules`, items } });
    return await printLinks(await links(d, b, set));
  }

  console.log(HELP);
  process.exitCode = 1;
}

// ---------- boards ----------
// A circuit board (engine pcb): its checks are the board's (design rules, the fab's limits, the matrix), its preview is
// drawn from above as well as in 3D, and its export is the fab's zip plus KiCad's files, not a print file.
async function board(cmd, d, b, { title, version, tag }) {
  const pcb = await pcbEngine(), name = `${d.name}@${version}${tag}`;
  if (cmd === 'check') {
    console.log(`${title} ${version}`);
    const raw = lint(fs.readFileSync(d.js, 'utf8'));
    const failed = report([
      raw.length ? { level: 'fail', text: `numbers in ${path.basename(d.js)} that should be variables: ${raw.map((r) => `line ${r.line}: ${r.text}`).join(', ')}` } : { level: 'pass', text: 'every measurement is a variable' },
      ...(await pcb.checks(b.circuit, b.values, b.matrix)),
    ]);
    if (b.object.orientation) console.log(`  ${b.object.orientation}`);
    process.exitCode = failed ? 1 : 0;
    return;
  }
  if (cmd === 'preview') {
    const top = await pcb.png(b.circuit, paths.preview(d.project, `${d.name}${tag}-pcb.png`));
    const sch = await pcb.schematicPng(b.circuit, paths.preview(d.project, `${d.name}${tag}-schematic.png`));
    const size = (await import('@rulecad/printcheck')).bounds(b.triangles).size.map((n) => fmt(n)).join(' × ');
    const out = paths.preview(d.project, `${d.name}${tag}.png`);
    await preview(b.parts, { title: `${title} ${version}`, meta: `${size} mm · a circuit board`, out, explode: false });
    return console.log(`${top}\n${sch}\n${out}`);
  }
  // export: exports/<project>/<name>-fab.zip (Gerbers, drills, BOM, placement: upload it to JLCPCB as it is), KiCad's
  // board and schematic beside it, and the matrix for firmware
  const dir = paths.exports(d.project), { zip: zipOf } = await import('@rulecad/model-link');
  fs.mkdirSync(dir, { recursive: true });
  const fab = await pcb.fabFiles(b.circuit, d.name), zip = path.join(dir, `${name}-fab.zip`);
  fs.writeFileSync(zip, await zipOf(Object.entries(fab)));
  const written = [zip];
  for (const [f, t] of Object.entries(await pcb.kicadFiles(b.circuit, name))) { fs.writeFileSync(path.join(dir, f), t); written.push(path.join(dir, f)); }
  if (b.matrix) { const f = path.join(dir, `${name}-matrix.json`); fs.writeFileSync(f, JSON.stringify(b.matrix, null, 2) + '\n'); written.push(f); }
  report([{ level: 'pass', text: `fab zip: ${Object.keys(fab).length} files (${Object.keys(fab).filter((f) => !/\.(csv|DRL)$/.test(f)).length} Gerber layers, 2 drill files, BOM, placement)` }]);
  for (const f of written) console.log(f);
}

// ---------- assemblies ----------
async function assembly(cmd, ref) {
  const s = await buildAssembly(ref), a = s.a, title = a.title || s.name;
  const versions = [...new Map(s.objects.map((o) => [o.objName, `${o.objName} ${o.version}`])).values()].join(', ');
  const rules = (ns) => Object.fromEntries(Object.keys(loadRuleSet(ns).rules).map((k) => [k, s.num(`${ns}.${k}`)]));
  const printed = s.parts.filter((p) => p.role !== 'reference');

  if (cmd === 'check') {
    console.log(`${title} (${a.kind || 'fit'}: ${versions})`);
    const findings = checkAssembly(s);
    if (a.kind === 'plate') findings.push(...check(printed.flatMap((p) => p.triangles), rules(printerOf(s.project)), { parts: printed }));
    process.exitCode = report(findings) ? 1 : 0;
    return;
  }
  if (cmd === 'preview') {
    const out = paths.preview(s.project, `${s.name}${opt('explode') ? '-exploded' : ''}.png`);
    const size = (await import('@rulecad/printcheck')).bounds(s.triangles).size.map((n) => fmt(n)).join(' × ');
    const faint = [...new Set(s.parts.filter((p) => p.role !== 'part').map((p) => `${p.object || p.item}${p.role === 'support' ? ' supports' : ''}`))]; // each kind once
    await preview(s.parts, { title, meta: `${size} mm · ${versions}${faint.length ? ` · faint: ${faint.join(', ')}` : ''}`, out, explode: !!opt('explode') });
    return console.log(out);
  }
  if (cmd === 'export') {
    if (a.kind !== 'plate') throw new Error(`${ref} is a fit assembly, for checking: export its objects, or make a plate (kind: plate) to print them together`);
    const out = paths.exports(s.project, `${s.name}.3mf`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    // One object per printed thing (a keycap with its legend and supports), a part per part, each in its filament
    const fil = filaments(s.project), things = new Map();
    for (const p of printed) { if (!things.has(p.leaf)) things.set(p.leaf, []); things.get(p.leaf).push({ name: p.label, triangles: p.triangles, slot: slotOf(fil, p.filament) }); }
    fs.writeFileSync(out, await threemf([...things].map(([name, parts]) => ({ name, parts })), { filaments: slots(fil) }));
    report(filamentNotes(printed, fil));
    if (opt('open')) openInSlicer(out);
    return console.log(out);
  }
  const link = async () => {
    const fil = filaments(s.project);
    const model = {
      title, version: versions, src: `${s.project}/${s.name}`, // object versions are in version: the file name stays short orientation: a.note || (a.kind === 'plate' ? 'A print plate: print everything together.' : 'A fit check: references are faint.'),
      rules: [],
      // Its boards' 2D views (copper, schematic), so one link holds the whole build: tabs over the 3D model
      ...(await (async () => {
        const boards = [...new Map(s.objects.filter((o) => o.built?.circuit).map((o) => [o.objName, o])).values()];
        if (!boards.length) return {};
        const pcb = await pcbEngine(), views = [];
        for (const o of boards) for (const [n, svg] of await pcb.views(o.built.circuit)) views.push([boards.length > 1 ? `${o.objName} ${n}` : n, svg]);
        return { views };
      })()),
      // Each shape once and placed: the macropad's nine keys cost one keycap
      ...fromShapes(shapes(s.parts).shapes.length ? (() => {
        const placed = shapes(s.parts), tri = (polys) => polys.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]]));
        return placed.place.map(([i, ...m], n) => { const p = placed.shapes[i].part; return { shape: i, role: p.role, label: p.object || p.label, slot: slotOf(fil, p.filament), triangles: tri(placed.shapes[i].triangles), matrix: m, name: s.parts[n].name }; });
      })() : []),
    };
    const url = await linkTo(model);
    return { view: url, stl: `${url}&get=stl`, '3mf': `${url}&get=3mf`, src: model.src, size: url.length, title, version: '' };
  };
  if (cmd === 'link') return await printLinks(await link());
  if (cmd === 'show') {
    // Each shape once, placed for every copy: nine keys cost one keycap in the mirror's link. Built with each object's
    // mirror settings (fewer segments), so the display gets a lighter mesh; checks and links use the real one
    const m = await buildAssembly(ref, [], {}, { mirror: true });
    const placed = shapes(m.parts.filter((p) => p.role !== 'support' && p.mirror !== false));
    // The card: what the checks found, one short line each
    const items = checkAssembly(s).filter((x) => x.card).slice(0, 6).map((x) => x.card);
    await (await target('show'))({ title, ttl: opt('ttl') || '10m', mesh: { shapes: placed.shapes.map((x) => x.polygons), place: placed.place },
      card: { title: a.kind === 'plate' ? `${title}: ${versions}` : `${title}: checks`, items } });
    return await printLinks(await link());
  }
  throw new Error(`cad ${cmd} doesn't work on an assembly (check, preview, export, show, link do)`);
}

// ---------- links ----------
// The model as a link: full print precision (triangles), the rules card, and exactly which version it is.
async function links(d, b, set) {
  const s = d.tag ? { kind: null } : await since(d), fil = filaments(d.project);
  const version = d.version || b.object.version || '0.0.0';
  const src = `${d.project}/${d.name}${d.variant ? `:${d.variant}` : ''}@${version}${s.kind && s.kind !== 'first' ? '+changes' : s.kind === 'first' ? '+unreleased' : ''}`;
  const model = {
    title: `${b.object.title || b.object.name}${d.variant ? ` (${d.variant})` : ''}`, version, src, ...(Object.keys(set).length ? { set: suffix(set).slice(1).replace(/-(?=\w+=)/g, ',') } : {}),
    material: b.object.material, orientation: b.object.orientation,
    rules: b.entries.filter((e) => e.show).map((e) => [e.label || e.name, fmt(e.value), e.unit || '']),
    ...(b.circuit ? { views: await (await pcbEngine()).views(b.circuit) } : {}), // boards: the 2D board and schematic
    ...fromParts(b.parts.map((p) => ({ name: p.name, role: p.role, label: p.label, slot: slotOf(fil, p.filament), triangles: p.triangles.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]])) }))),
  };
  const url = await linkTo(model);
  return { view: url, stl: `${url}&get=stl`, '3mf': `${url}&get=3mf`, src, size: url.length, title: model.title, version };
}

// Short links: the model's data stored by the shorten target (a secret Gist), and a link that carries only its ID. The
// same model reuses its ID (.cache/links.json, by the data's hash). Without a shorten target, links stay long.
async function shorten(l) {
  if (!hasTarget('shorten')) return l;
  const token = l.view.split('#m=')[1], hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex').slice(0, 16);
  const file = paths.cache('links.json'), cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!cache[hash]) {
    cache[hash] = await (await target('shorten'))(token, { desc: `model: ${l.src}` });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cache, null, 2));
  }
  const url = `${VIEW}#s=${cache[hash]}`;
  return { ...l, view: url, stl: `${url}&get=stl`, '3mf': `${url}&get=3mf`, short: true };
}

// --md: one line of labelled Markdown links, the form agents paste into chat (CLAUDE.md, "Replies with links").
// Short (a Gist) unless --long; plain output is long (nothing uploaded) unless --short.
const TOO_LONG = 8000; // characters: past this, chat apps and email cut a link short or refuse it
async function printLinks(l) {
  if ((opt('md') && !opt('long')) || opt('short')) l = await shorten(l);
  if (!l.short && l.view.length > TOO_LONG) console.error(`this link is ${(l.view.length / 1024).toFixed(0)} KB, too long for chat or email. ${hasTarget('shorten')
    ? 'Leave out --long for a short one.' : 'For short links, add "shorten": "gist" to "targets" in cad.config.json: each model you share is then stored in a secret GitHub Gist (needs the gh command, signed in).'}`);
  // One link: the page picks which parts go in a download (all of them, one key, only the case)
  if (opt('md')) return console.log(`**${[l.title, l.version].filter(Boolean).join(' ')}**${l.src.includes('+') ? ' (not a release)' : ''}: [View and download](${l.view})`);
  console.log(`${l.src}, ${l.short ? 'short links (data in a secret Gist)' : `${(l.size / 1024).toFixed(1)} KB links`}${l.src.includes('+') ? ' (not a release: the link shows it)' : ''}`);
  // A long link is the whole model: printed only when asked for (--long), else written to a file (a link of a
  // keyboard is megabytes: in a terminal or an agent's context it's only noise)
  if (!l.short && !opt('long')) {
    const f = paths.cache('links', `${l.src.replace(/[^\w@.+-]+/g, '-')}.txt`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `view  ${l.view}\nstl   ${l.stl}\n3mf   ${l['3mf']}\n`);
    return console.log(`  links in ${path.relative(WS, f)} (--md: one ${hasTarget('shorten') ? 'short ' : ''}link for chat; --long: print them)`);
  }
  console.log(`  view  ${l.view}`);
  console.log(`  stl   ${l.stl}`);
  console.log(`  3mf   ${l['3mf']}`);
}

// ---------- versions ----------
const KINDS = ['patch', 'minor', 'major'];
const today = () => new Date().toISOString().slice(0, 10);

// Unreleased changes: compare with the last release. -> { last, kind, reasons } (kind null: nothing changed)
// A design that reads other objects is resolved with their numbers (each side with the objects it named then).
const snap = async (d) => snapshot(d, (await objectSets(d, readObject(d))).sets);
async function since(d) {
  const last = tags(d.project, d.name).at(-1);
  if (!last) return { last: null, kind: 'first', reasons: [] };
  return { last, ...compare(await snap(materialise(d, last.version)), await snap(d)) };
}

// Only the design's own files (and its project's changelog and print log) may have uncommitted changes.
// A release commits only its own files, so other work in progress can stay as it is (another object, an assembly, the
// docs). What it can't release past is uncommitted shared code (lib/, bin/) or a rule or layout it uses: those would
// be in the build but not in the release.
function onlyChanged(allowed) {
  const dirty = git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
  const shared = dirty.filter((f) => !allowed.includes(f) && /^(lib|bin)\//.test(f));
  if (shared.length) throw new Error(`commit shared code first (the release would build with it): ${shared.join(', ')}`);
}

function commitAndTag(paths, subject, tag, message) {
  git('add', '--', ...paths);
  git('commit', '-q', '-m', subject, ...(opt('trailer') ? ['--trailer', opt('trailer')] : []), '--', ...paths); // only these, whatever else is staged
  git('tag', '-a', tag, '-m', message);
  if (opt('push')) { git('push', '-q', 'origin', 'HEAD'); git('push', '-q', 'origin', tag); }
}

function changelog(dir, heading, message, reasons) {
  const f = path.join(dir, 'CHANGELOG.md');
  const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/^# .*\n+/, '') : '';
  const entry = `## ${heading}\n\n${message}\n${reasons.length ? `\n${reasons.map((r) => `- ${r.text} (${r.kind})`).join('\n')}\n` : ''}`;
  fs.writeFileSync(f, `# ${path.basename(dir)} changelog\n\n${entry}\n${old}`);
  return path.relative(WS, f);
}

async function releaseObject(d, { batch = false } = {}) {
  const message = opt('m');
  if (!message || message === true) throw new Error('say what changed: -m "Wider slot for a looser fit"');
  const object = readObject(d), b = await build(d);
  const raw = lint(fs.readFileSync(d.js, 'utf8')), fails = (b.circuit ? await (await pcbEngine()).checks(b.circuit, b.values, b.matrix) // boards: the board's checks
    : b.object.role === 'reference' ? [] : check(b.triangles, printer(b, d), { parts: b.parts })).filter((r) => r.level === 'fail'); // references aren't printed
  if (raw.length || fails.length) throw new Error(`fix the check first: ${[...raw.map((r) => `raw number ${r.text} on line ${r.line}`), ...fails.map((f) => f.text)].join('; ')}`);
  let { last, kind, reasons } = await since(d);
  if (!kind) throw new Error(`nothing has changed since ${last.version}`);
  const asked = opt('bump');
  if (asked && last) {
    if (!KINDS.includes(asked)) throw new Error('--bump is major, minor or patch');
    if (bigger(asked, kind) !== asked && !opt('force')) throw new Error(`the changes need at least a ${kind} release (${reasons.filter((r) => r.kind === kind).map((r) => r.text).join('; ')}); --force to override`);
    kind = asked;
  }
  const version = last ? bump(last.version, kind) : object.version || '0.1.0';
  const tag = `${d.project}/${d.name}@${version}`;
  console.log(`${tag} (${kind}${last ? `, from ${last.version}` : ''})`);
  for (const r of reasons) console.log(`  ${r.kind.padEnd(5)} ${r.text}`);
  if (opt('dry-run')) return;
  const allowed = [...files(d, object), `projects/${d.project}/CHANGELOG.md`, path.relative(WS, printsFile(d))];
  if (!batch) onlyChanged(allowed); // releaseAll checked the whole tree first
  fs.writeFileSync(d.json, fs.readFileSync(d.json, 'utf8').replace(/"version":\s*"[^"]*"/, `"version": "${version}"`));
  const log = changelog(d.dir, `${d.name} ${version} (${kind}), ${today()}`, message, reasons);
  commitAndTag([...files(d, object), log].filter((f) => fs.existsSync(path.join(WS, f))), `${tag}: ${message}`, tag, `${kind}: ${message}${b.circuit ? `\n\nengine: ${engineId()}` : ''}`);
  console.log(`tagged ${tag}${opt('push') ? ' and pushed' : ' (not pushed: --push, or git push --follow-tags)'}`);
}

async function releaseProject(project) {
  const message = opt('m');
  if (!message || message === true) throw new Error('say what this release is: -m "First full set"');
  const dir = paths.project(project), pj = path.join(dir, 'project.json');
  if (!fs.existsSync(pj)) throw new Error(`no project "${project}"`);
  const p = JSON.parse(fs.readFileSync(pj, 'utf8')), manifest = {};
  for (const name of p.objects) {
    const d = locate(`${project}/${name}`), s = await since(d);
    if (!s.last) throw new Error(`${name} has no release yet: cad release ${project}/${name} -m "…"`);
    if (s.kind) throw new Error(`${name} has changes since ${s.last.version}: release it first`);
    manifest[name] = s.last.version;
  }
  const last = tags(project).at(-1);
  let kind = 'first', reasons = [];
  if (last) {
    const before = JSON.parse(git('cat-file', '-p', `refs/tags/${last.tag}`).split('\n\n').slice(1).join('\n\n').split('\n').find((l) => l.startsWith('{')) || '{}');
    for (const [name, v] of Object.entries(manifest)) {
      if (!before[name]) reasons.push({ kind: 'minor', text: `${name} ${v} added` });
      else if (before[name] !== v) {
        const k = tags(project, name).filter((t) => newer(t.version, before[name]) && !newer(t.version, v)).reduce((m, t) => bigger(m, t.kind === 'first' ? 'patch' : t.kind || 'patch'), 'patch');
        reasons.push({ kind: k, text: `${name} ${before[name]} → ${v}` });
      }
    }
    for (const name of Object.keys(before)) if (!manifest[name]) reasons.push({ kind: 'major', text: `${name} removed` });
    if (!reasons.length) throw new Error(`nothing has changed since ${project}@${last.version}`);
    kind = reasons.reduce((k, r) => bigger(k, r.kind), 'patch');
  }
  const version = last ? bump(last.version, kind) : p.version || '0.1.0';
  console.log(`${project}@${version} (${kind}): ${Object.entries(manifest).map(([n, v]) => `${n}@${v}`).join(', ')}`);
  if (opt('dry-run')) return;
  onlyChanged([`projects/${project}/project.json`, `projects/${project}/CHANGELOG.md`, `projects/${project}/prints.jsonl`]);
  p.version = version; p.release = manifest;
  fs.writeFileSync(pj, JSON.stringify(p, null, 2) + '\n');
  const log = changelog(dir, `${project} ${version} (${kind}), ${today()}`, message, reasons);
  commitAndTag([`projects/${project}/project.json`, log], `${project}@${version}: ${message}`, `${project}@${version}`, `${kind}: ${message}\n\n${JSON.stringify(manifest)}`);
  console.log(`tagged ${project}@${version}`);
}

// Release every object in a project that changed, then the project: the tree may hold changes only to their files.
async function releaseAll(project) {
  const pj = JSON.parse(fs.readFileSync(path.join(paths.project(project), 'project.json'), 'utf8'));
  const changed = [];
  for (const n of pj.objects) { const d = locate(`${project}/${n}`); if ((await since(d)).kind) changed.push(d); }
  const allowed = new Set([`projects/${project}/project.json`, `projects/${project}/CHANGELOG.md`, `projects/${project}/prints.jsonl`,
    ...changed.flatMap((d) => files(d, readObject(d)))]);
  onlyChanged([...allowed]);
  for (const d of changed) await releaseObject(d, { batch: true });
  if (!opt('dry-run')) await releaseProject(project);
}

// The object's variants, one a line: name, then its inputs
function variants(d) {
  const v = readObject(d).variants || {};
  if (!Object.keys(v).length) return console.log(`${d.name} has no variants: add "variants": { "name": { …inputs } } to its .json`);
  for (const [n, set] of Object.entries(v)) console.log(`${`${d.project}/${d.name}:${n}`.padEnd(32)} ${Object.entries(set).map(([k, x]) => `${k}=${x}`).join(', ')}`);
}

// Two variants or releases side by side in one preview, the second to the right of the first
async function compareVariants(d, a, b) {
  if (!a || !b) throw new Error('usage: cad compare <project>/<object> <variant or version> <variant or version>');
  const one = async (x) => build(/^\d+\.\d+\.\d+$/.test(x) ? materialise(d, x) : { ...d, variant: x }, sets());
  const [A, B] = [await one(a), await one(b)];
  const { bounds } = await import('@rulecad/printcheck');
  const gap = (bounds(A.triangles).size[0] + bounds(B.triangles).size[0]) / 4, dx = bounds(A.triangles).hi[0] - bounds(B.triangles).lo[0] + gap;
  const moved = (p) => ({ ...p, triangles: p.triangles.map((t) => t.map(([x, y, z]) => [x + dx, y, z])) });
  const parts = [...A.parts.map((p) => ({ ...p, item: a, label: `${a}: ${p.label}` })), ...B.parts.map((p) => moved({ ...p, item: b, label: `${b}: ${p.label}` }))];
  const out = paths.preview(d.project, `${d.name}-${a}-vs-${b}.png`);
  await preview(parts, { title: `${A.object.title || d.name}: ${a} and ${b}`, meta: `${a} on the left, ${b} on the right`, out, explode: false });
  console.log(out);
}

async function status(project) {
  for (const p of project ? [project] : fs.readdirSync(paths.projects)) {
    const pj = JSON.parse(fs.readFileSync(path.join(paths.project(p), 'project.json'), 'utf8'));
    console.log(`${p}${pj.version ? `@${pj.version}` : ''}`);
    for (const name of pj.objects) {
      const s = await since(locate(`${p}/${name}`));
      console.log(`  ${name.padEnd(16)} ${s.last ? s.last.version.padEnd(8) : 'unreleased'} ${s.kind === 'first' ? '' : s.kind ? `changed since: needs a ${s.kind} release` : 'up to date'}`);
    }
  }
}

async function history(ref) {
  const [project, name] = ref.split('/');
  if (!name) {
    for (const t of tags(project).reverse()) console.log(`${t.tag}  ${t.date}  ${t.kind}  ${t.message}`);
    return status(project);
  }
  const d = locate(ref), done = prints(d);
  const s = await since(d);
  if (s.kind && s.last) { console.log(`unreleased (needs ${s.kind}):`); for (const r of s.reasons) console.log(`  ${r.text}`); }
  for (const t of tags(d.project, d.name).reverse()) {
    console.log(`${t.version.padEnd(8)} ${t.date}  ${t.kind.padEnd(5)}  ${t.message}`);
    for (const p of done.filter((x) => x.version === t.version)) console.log(`         printed ${p.date} in ${p.material}: ${p.result}${p.note ? `, ${p.note}` : ''}${p.set ? ` (${p.set})` : ''}`);
  }
}

async function diff(d, from, to) {
  if (!from) throw new Error('usage: cad diff <project>/<object> <from> [<to>]');
  const a = await snap(materialise(d, from)), b = await snap(to ? materialise(d, to) : d);
  const r = compare(a, b);
  console.log(`${d.project}/${d.name} ${from} → ${to || 'now'}: ${r.kind ? `a ${r.kind} change` : 'no changes'}`);
  for (const x of r.reasons) console.log(`  ${x.kind.padEnd(5)} ${x.text}`);
}

function printed(d) {
  const result = opt('result');
  if (!['ok', 'failed'].includes(result)) throw new Error('--result ok or --result failed (and --note "what happened")');
  const object = readObject(d), version = opt('version') || tags(d.project, d.name).at(-1)?.version || object.version;
  const entry = { date: today(), object: d.name, version, ...(opt('set') ? { set: opt('set') } : {}), material: opt('material') || object.material, result, ...(opt('note') ? { note: opt('note') } : {}) };
  fs.appendFileSync(printsFile(d), JSON.stringify(entry) + '\n');
  console.log(`logged in ${path.relative(WS, printsFile(d))}: ${d.name}@${version} ${result}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

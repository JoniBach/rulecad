#!/usr/bin/env node
// Builds the rulecad documentation site: a page for each package (what it is, how to use it, a live demonstration,
// and its README as the reference) and an index, under docs/ beside the model page on GitHub Pages
// (https://jonibach.github.io/rulecad/docs/). Packages that run in a browser are demonstrated live, with their own
// code; the rest (the CLI, the project maker, the board engine) are shown with real output made here, at build time.
//   node docs/build.mjs [--out <dir>]   (default docs/_site; the model page's files are copied in too, so the
//                                        result is the whole site: serve it and open /docs/)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { markdown, inline } from './md.mjs'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.dirname(HERE)
const OUT = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(HERE, '_site'))
const DOCS = path.join(OUT, 'docs'), ASSETS = path.join(DOCS, 'assets')
const REPO = 'https://github.com/JoniBach/rulecad'
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to) }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pkg = (dir) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', dir, 'package.json'), 'utf8'))

// ---- the model page, as deployed (built first by packages/viewer/scripts/build.mjs) ----
fs.rmSync(OUT, { recursive: true, force: true })
fs.cpSync(path.join(ROOT, 'packages/viewer/site'), OUT, { recursive: true })

// ---- assets: the style, the 3D stage, the demos, JSCAD and the packages that run in a browser ----
for (const f of fs.readdirSync(path.join(HERE, 'src'))) if (f.endsWith('.css') || f.endsWith('.mjs')) copy(path.join(HERE, 'src', f), path.join(ASSETS, f))
for (const f of fs.readdirSync(path.join(HERE, 'src/demos'))) copy(path.join(HERE, 'src/demos', f), path.join(ASSETS, 'demos', f))
copy(require.resolve('@jscad/modeling/dist/jscad-modeling.min.js'), path.join(ASSETS, 'jscad-modeling.min.js'))
// The file formats' schemas, at the address their $id names (jonibach.github.io/rulecad/schemas/…), for editors
for (const f of fs.readdirSync(path.join(ROOT, 'packages/cad/schemas'))) copy(path.join(ROOT, 'packages/cad/schemas', f), path.join(OUT, 'schemas', f))
copy(path.join(path.dirname(require.resolve('@jscad/modeling/package.json')), 'LICENSE'), path.join(ASSETS, 'jscad.LICENSE'))
const browser = { variables: ['variables.mjs'], shapes: ['shapes.mjs', 'enclosure.mjs'], fit: ['fit.mjs'], printcheck: ['printcheck.mjs'],
  'keyboard-layout': ['keyboard-layout.mjs'], 'model-link': ['model-link.mjs'], versions: ['versions.mjs'] }
for (const [dir, files] of Object.entries(browser)) for (const f of files) copy(path.join(ROOT, 'packages', dir, f), path.join(ASSETS, 'lib', f))
const importMap = { imports: { '@jscad/modeling': '../assets/jscad.mjs', ...Object.fromEntries(Object.entries(browser).map(([dir, [f]]) => [`@rulecad/${dir}`, `../assets/lib/${f}`])) } }

// ---- data: the published rule sets ----
const ruleDir = path.join(ROOT, 'packages/rules'), sets = []
for (const f of fs.readdirSync(ruleDir).filter((f) => f.endsWith('.json') && f !== 'package.json').sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(ruleDir, f), 'utf8'))
  copy(path.join(ruleDir, f), path.join(ASSETS, 'data/rules', f))
  sets.push({ name: set.name || f.replace('.json', ''), doc: set._doc || '', rules: set.rules })
}
write(path.join(ASSETS, 'data/rulesets.json'), JSON.stringify(sets))

// ---- made here: boards from @rulecad/pcb, a project from create-rulecad, cad's own output ----
const made = { boards: [], cad: {} }
try {
  // A 3 × 3 macropad from pcb's keyboard recipe: MX switches, a diode each, a Raspberry Pi Pico beside them, every track
  // drawn by rule from the published rule sets. Then the same board on a rounded outline.
  const pcb = await import('@rulecad/pcb'), { resolve } = await import('@rulecad/variables')
  const load = (n) => require(`@rulecad/rules/${n}.json`)
  const v = resolve({ uses: ['mx', 'pico', 'sod123', 'm2', 'jlcpcb'], variables: {
    track: { value: 'jlcpcb.track_min * 2.5' }, clear: { value: 'jlcpcb.gap_min * 2.5' }, thickness: { value: 'jlcpcb.thickness' },
    margin: { value: 5 }, mcu_gap: { value: 2 }, mcu_side: { value: 'left', choice: ['left', 'right'] }, mcu_row: { value: 0 }, mount_holes: { value: 1 },
    controller: { value: 'beside', choice: ['beside', 'under'] } } }, { load }).values
  const { board, matrix } = pcb.keyboard(v, pcb.grid(3, 3, v.mx.pitch))
  const json = await pcb.render(board), found = await pcb.checks(json, v, matrix)
  const [drawing, schematic] = await pcb.views(json)
  made.boards.push({ title: 'A 3 × 3 macropad: nine MX switches, a diode each, and a Pico beside them', note: 'keyboard(v, grid(3, 3, v.mx.pitch)): the switch, Pico and diode sizes come from the mx, pico and sod123 rule sets; every matrix track is drawn by rule.', svg: drawing[1], schematic: schematic[1], found })
  const rounded = await pcb.render({ ...board, outline: pcb.shape.rounded(board.width, board.height, 6, { at: [board.center.x, board.center.y] }) })
  made.boards.push({ title: 'The same macropad on a shaped board', note: 'outline: shape.rounded(width, height, 6): any outline works (rounded, bevelled, circle, or your own points), and the checks find any pad outside it.', svg: (await pcb.views(rounded))[0][1] })
} catch (e) { console.warn(`boards not drawn: ${e.message}`) }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-docs-'))
try {
  execFileSync(process.execPath, [path.join(ROOT, 'packages/create-rulecad/index.mjs'), 'project', '--no-install'], { cwd: work, stdio: 'ignore' })
  const proj = path.join(work, 'project')
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(proj, 'node_modules'))
  const tree = (dir, pre = '') => fs.readdirSync(dir).filter((f) => f !== 'node_modules' && f !== '.git').sort().flatMap((f) => {
    const p = path.join(dir, f), d = fs.statSync(p).isDirectory()
    return [`${pre}${f}${d ? '/' : ''}`, ...(d ? tree(p, pre + '  ') : [])]
  })
  made.cad.tree = tree(proj).join('\n')
  const cad = (...a) => execFileSync(process.execPath, [path.join(ROOT, 'packages/cad/bin/cad.mjs'), ...a], { cwd: proj, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).trim()
  made.cad.check = cad('check', 'home/soap-tray')
  made.cad.rules = cad('rules', 'home/soap-tray').split('\n').slice(0, 24).join('\n')
  made.cad.link = (cad('link', 'home/soap-tray', '--long').split('\n').find((l) => l.trim().startsWith('view')) || '').trim().replace(/^view\s+/, '').replace(/^https:\/\/jonibach\.github\.io\/rulecad\//, '../../')
  cad('preview', 'home/soap-tray')
  copy(path.join(proj, '.preview/home/soap-tray.png'), path.join(DOCS, 'cad/soap-tray.png'))
} catch (e) { console.warn(`project not made: ${e.message.split('\n')[0]}`) } finally { fs.rmSync(work, { recursive: true, force: true }) }

// ---- the packages, grouped ----
const groups = [
  ['Design', 'Describe a part by its rules and check it.', ['cad', 'create-rulecad', 'variables', 'rules', 'shapes', 'versions']],
  ['Check', 'Will it print? Does it fit?', ['printcheck', 'fit']],
  ['Boards', 'Circuit boards from the same rules.', ['pcb']],
  ['Share', 'A model in a link, and the page that opens it.', ['model-link', 'viewer']],
  ['Keyboards', 'One layout file for plate, keycaps, case and board.', ['keyboard-layout']]
]
const order = groups.flatMap((g) => g[2])
const name = (dir) => pkg(dir).name

// ---- what each page demonstrates ----
const stage3d = '<div class="stage"><span class="hint">Drag to turn, scroll to zoom</span></div>'
const demo = {
  shapes: () => `<div class="demo" id="demo"><div class="controls"><p class="muted">The enclosure kit's own code, running here: a macropad's case as a <code>shell</code> with a gabled opening for the USB cable, its <code>lid</code> (printed face down; shown lifted and turned over), and a <code>dovetail</code> rail.</p><div class="row"><button id="open">Open in the model page</button></div></div>${stage3d}</div>`,
  variables: () => `<div class="demo stack" id="demo"><div><p class="muted">A design's variables, resolved against the published <code>x1c</code> printer rules as you type. Change a rule name, a sum or a value.</p><textarea id="object" spellcheck="false">${esc(JSON.stringify({ uses: ['x1c'], variables: {
    wall: { value: 'x1c.line * 4', unit: 'mm', rule: 'Four print lines' }, floor: { value: 'x1c.layer * 8', unit: 'mm', rule: 'Eight layers' },
    slot: { value: '4 + x1c.fit * 2', unit: 'mm', rule: 'A 4 mm tab slides in, with the printer\'s fit each side', interface: true },
    outside: { value: 'slot + wall * 2', unit: 'mm', rule: 'The slot and a wall each side' } } }, null, 2))}</textarea><p class="muted" id="msg"></p><div class="table"><table id="values"></table></div></div>
    <div><p class="muted">The lint that keeps measurements out of the shape's code: only 0, 1 and 2 may appear.</p><textarea id="code" spellcheck="false" style="min-height:120px">export function main (v) {\n  const box = cuboid({ size: [v.outside, 30, v.floor + 12] })\n  return subtract(box, translate([0, 0, 2], cuboid({ size: [v.slot, 28, 24] })))\n}</textarea><pre class="out" id="lint"></pre></div></div>`,
  printcheck: () => `<div class="demo" id="demo"><div class="controls"><label>Shape <select id="shape"><option value="lean">A leaning wall</option><option value="bridge">A bridge</option><option value="shelf">A shelf</option></select><span></span></label><ul class="findings"></ul><p class="muted">Checked against a Bambu X1C: 256 mm bed, 45° overhangs, 5 mm bridges.</p></div>${stage3d}</div>`,
  fit: () => `<div class="demo" id="demo"><div class="controls"><p class="muted">A 5 mm peg in a hole. <code>closest()</code> measures the smallest gap between the two meshes.</p><p id="gap"></p></div>${stage3d}</div>`,
  'model-link': () => `<div class="demo" id="demo"><div class="controls"><p class="muted">A model made in this page, packed into a link. The model rides in the link's #fragment, which browsers never send, so nothing is uploaded.</p><p id="info" class="muted"></p><div class="row"><a class="button" id="open" target="_blank" rel="noopener">Open in the model page</a><button id="stl">Download STL</button><button id="mf">Download 3MF</button></div></div>${stage3d}</div>`,
  'keyboard-layout': () => `<div class="demo stack" id="demo"><textarea id="layout" spellcheck="false">${esc(JSON.stringify({ defaults: { legend: '@label' }, rows: [
    { row: 'R1', keys: ['Esc', '1', '2', '3', '4', '5'] }, { row: 'R2', keys: [['Tab', 1.5], 'Q', 'W', 'E', 'R'] }, { row: 'R3', keys: [['Caps', 1.75], 'A', 'S', 'D', { label: 'F', homing: true }] },
    { row: 'R4', keys: [['Shift', 2.25], 'Z', 'X', 'C'] }] }, null, 1))}</textarea><svg id="keys" role="img" aria-label="The layout, key by key" style="width:100%;max-height:340px"></svg><p class="muted" id="msg"></p>
    <details><summary class="muted">Bring in a keyboard-layout-editor.com layout</summary><textarea id="kle" spellcheck="false" style="min-height:90px">["Esc","Q","W","E","R"],\n[{w:1.5},"Tab","A","S",{n:true},"D"]</textarea><button id="kle-go">Convert with fromKLE()</button></details></div>`,
  versions: () => `<div class="demo" id="demo"><div><p class="muted">Before</p><textarea id="before" spellcheck="false">${esc(JSON.stringify({ variables: { slot: { value: 4.2, interface: true }, wall: { value: 1.68 }, lip: { value: 2, interface: true } } }, null, 1))}</textarea></div><div><p class="muted">After: edit it. An interface value changed is a major release (old prints may not fit); a value that isn't interface, a patch.</p><textarea id="after" spellcheck="false">${esc(JSON.stringify({ variables: { slot: { value: 4.25, interface: true }, wall: { value: 2.1 }, lip: { value: 2, interface: true } } }, null, 1))}</textarea><p id="verdict"></p><div class="row" style="flex-wrap:nowrap"><input type="text" id="v" value="0.3.1" aria-label="Version"><input type="text" id="range" value="^0.3.0" aria-label="Range"></div><p class="muted" id="ok"></p></div></div>`,
  rules: () => `<div class="demo stack" id="demo"><input type="text" id="q" placeholder="Filter: m2, overhang, jlcpcb, xiao…" aria-label="Filter the rules"><p class="muted" id="count"></p><div class="table"><table id="rules"><thead><tr><th>Rule</th><th>Value</th><th>Why</th><th>Kind</th><th>Source</th></tr></thead><tbody></tbody></table></div></div>`,
  pcb: () => made.boards.length ? made.boards.map((b) => `<h3>${esc(b.title)}</h3>${b.note ? `<p class="muted">${esc(b.note)}</p>` : ''}<div class="figure">${b.svg}</div>${b.schematic ? `<details><summary class="muted">Its schematic, drawn from the same description</summary><div class="figure">${b.schematic}</div></details>` : ''}${b.found ? `<ul class="findings" style="margin-top:12px">${b.found.map((f) => `<li><span class="lv ${f.level}">${f.level}</span><span>${esc(f.text)}</span></li>`).join('')}</ul>` : ''}`).join('') : '<p class="muted">The boards are drawn when the site is built.</p>',
  cad: () => made.cad.check ? `<p class="muted">A project made with create-rulecad, checked with the published packages as this site was built:</p><pre class="out">$ npx cad check home/soap-tray\n${esc(made.cad.check)}</pre><div class="demo"><div class="figure" style="background:#000;padding:0"><img src="soap-tray.png" alt="The soap tray: front, side, top, bottom and three-quarter views, as cad preview draws them"></div><div><pre class="out nowrap">$ npx cad rules home/soap-tray\n${esc(made.cad.rules)}\n…</pre>${made.cad.link ? `<p><a class="button" href="${esc(made.cad.link)}">Turn it round in the model page</a></p>` : ''}</div></div>` : '',
  'create-rulecad': () => made.cad.tree ? `<p class="muted">What <code>npm create rulecad@latest project</code> makes, as this site was built:</p><pre class="out">${esc(made.cad.tree)}</pre>` : '',
  viewer: () => `<div class="demo stack"><p class="muted">The model page itself, live on this site. Open the soap tray from create-rulecad's starter project, or drop an STL file on the page to check it for printing.</p><div class="row">${made.cad.link ? `<a class="button" href="${esc(made.cad.link)}">Open the soap tray</a>` : ''}<a class="button" href="../../">Open an empty model page (drop an STL)</a></div></div>`
}
const intro = {
  cad: 'The command line at the centre: every measurement a variable with its rule, checks for printing and fit, previews, print files and links.',
  'create-rulecad': 'Start a project: a workspace with a printer\'s rules, a starter design and the notes an AI agent needs.',
  variables: 'Variables that say where each number comes from: expressions over rule sets, resolved, and a lint that keeps numbers out of code.',
  rules: 'Published facts: printers, screws, switches, fabs and parts, each value with its source and the date it was checked.',
  shapes: 'Shape helpers for printed parts: text that prints, anchors on a face, clean cuts, and an enclosure kit.',
  versions: 'Semver for physical parts: a major release means an earlier print may no longer fit.',
  printcheck: 'Is this mesh printable? Bed size, overhangs, bridges, floating undersides and closed solids, in plain words.',
  fit: 'Do these parts fit? The smallest gap between two meshes, and whether a point is inside one.',
  pcb: 'Circuit boards from the same rules: parts from rule sets or KiCad footprints, nets, routing, any board shape, fab files.',
  'model-link': 'A model in a link: compressed into the URL fragment, never uploaded; STL and Bambu-ready 3MF made in the browser.',
  viewer: 'The model page: opens model links, checks dropped STL files, writes print files. Plain static files you can host anywhere.',
  'keyboard-layout': 'One layout file that the plate, keycaps, case and board all read; and an importer for keyboard-layout-editor.com.'
}

// ---- pages ----
const nav = (here) => `<header class="top"><nav aria-label="Libraries"><a class="home" href="../">rulecad</a>${order.map((d) => `<a href="../${d}/"${d === here ? ' aria-current="page"' : ''}>${d}</a>`).join('')}<a href="../../">model page</a><a href="${REPO}">GitHub</a></nav></header>`
const page = (title, desc, here, body, { map = false, script = '' } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Crect x=%272%27 y=%272%27 width=%2712%27 height=%2712%27 rx=%273%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%272%27/%3E%3C/svg%3E">
<link rel="stylesheet" href="${here ? '../' : ''}assets/style.css">
${map ? `<script type="importmap">${JSON.stringify(importMap)}</script>` : ''}
</head>
<body>
${here === null ? `<header class="top"><nav aria-label="Libraries"><a class="home" href="./">rulecad</a>${order.map((d) => `<a href="${d}/">${d}</a>`).join('')}<a href="../">model page</a><a href="${REPO}">GitHub</a></nav></header>` : nav(here)}
<main>
${body}
</main>
<footer class="site">rulecad is MIT licensed; its rule data is CC0. Made from the commons, for the commons. <a href="${REPO}">Source on GitHub</a>.</footer>
${script}
</body>
</html>
`
const linkFor = (dir) => (u) => {
  if (/^(https?:|mailto:|#)/.test(u)) return u
  const m = u.match(/^(?:\.\.\/)?(?:packages\/)?([a-z-]+)\/README\.md(#.*)?$/)
  if (m && order.includes(m[1])) return `../${m[1]}/${m[2] || ''}`
  return `${REPO}/blob/main/packages/${dir}/${u.replace(/^\.\//, '')}`
}
for (const dir of order) {
  const p = pkg(dir), readme = fs.readFileSync(path.join(ROOT, 'packages', dir, 'README.md'), 'utf8').replace(/^# .*\n/, '')
  const live = !!browser[dir] || ['rules'].includes(dir)
  const install = dir === 'create-rulecad' ? 'npm create rulecad@latest my-project' : dir === 'viewer' ? 'npm install @rulecad/viewer   # then serve node_modules/@rulecad/viewer/site' : `npm install ${p.name}`
  const body = `<h1>${esc(p.name)}</h1>
<p class="lede">${esc(intro[dir] || p.description)}</p>
<div class="chips"><a class="chip" href="https://www.npmjs.com/package/${p.name}">npm ${esc(p.version)}</a><a class="chip" href="${REPO}/tree/main/packages/${dir}">source</a><span class="chip">${esc(p.license)}</span>${(p.engines?.node ? `<span class="chip">Node ${esc(p.engines.node)}</span>` : '')}${live ? '<span class="chip">runs in this page</span>' : ''}</div>
<pre><code>${esc(install)}</code></pre>
<h2>${live ? 'Try it' : 'See it'}</h2>
${demo[dir] ? demo[dir]() : ''}
<h2>Reference</h2>
<div class="readme">${markdown(readme, { link: linkFor(dir), shift: 1 })}</div>`
  const script = fs.existsSync(path.join(HERE, 'src/demos', `${dir}.mjs`)) ? `<script type="module" src="../assets/demos/${dir}.mjs"></script>` : ''
  write(path.join(DOCS, dir, 'index.html'), page(`${p.name}: rulecad`, intro[dir] || p.description, dir, body, { map: !!script, script }))
}
const index = `<h1>rulecad</h1>
<p class="lede">Design physical things as code, where every measurement says which rule it comes from: a printer's line width, a screw's clearance, a switch's stem. Check that they print and fit, version them by what fits what, draw their circuit boards from the same rules, and share them as links.</p>
<pre><code>npm create rulecad@latest my-project
cd my-project && npx cad check home/soap-tray</code></pre>
<p>${inline('Each library below has a page: what it is for, how to use it, and a demonstration. The ones marked *live* run their own code in this page.')}</p>
${groups.map(([title, line, dirs]) => `<h2>${esc(title)}</h2><p class="muted">${esc(line)}</p><div class="grid">${dirs.map((d) => `<a class="card" href="${d}/"><span class="kind">${esc(name(d))}${browser[d] || d === 'rules' ? ' · live' : ''}</span><h3>${esc(d)}</h3><p>${esc(intro[d] || pkg(d).description)}</p></a>`).join('')}</div>`).join('\n')}
<h2>How they fit together</h2>
<p>${inline('`cad` is the command line. It reads designs whose variables come from `variables` and rule sets such as `rules`, builds shapes with JSCAD and `shapes`, checks them with `printcheck` and `fit`, releases them with `versions`, lays out keyboards with `keyboard-layout`, draws boards with `pcb`, and shares them with `model-link`, which the `viewer` opens. `create-rulecad` starts a project with all of it in place.')}</p>`
write(path.join(DOCS, 'index.html'), page('rulecad libraries', 'Design physical things as code: the rulecad libraries, with live demonstrations.', null, index).replace('href="assets/style.css"', 'href="assets/style.css"'))
console.log(`docs: ${order.length} library pages and an index in ${path.relative(process.cwd(), DOCS) || DOCS}${made.boards.length ? `, ${made.boards.length} boards drawn` : ''}${made.cad.check ? ', the starter project checked' : ''}`)

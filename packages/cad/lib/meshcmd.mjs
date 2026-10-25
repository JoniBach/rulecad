// cad measure and cad match: a mesh from elsewhere, measured into draft rules, and a design checked against it.
import fs from 'node:fs';
import path from 'node:path';
import { fmt } from './rules.mjs';
import { WS, paths } from './workspace.mjs';
import { picture, preview } from './preview.mjs';
import {
  AXES, axisOf, planeAxes, readMesh, bounds, volume, section, profiles, spans, loops, parsePlacement, turn, align, deviation, worst, stats, limitingLicence,
} from './mesh.mjs';

const f2 = (n) => fmt(Math.round(n * 100) / 100);
const range = ([a, b]) => `${f2(a)}..${f2(b)}`;
const letter = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
const today = () => new Date().toISOString().slice(0, 10);

// Edges used by one face only: holes in the surface, which make inside and outside meaningless
function openEdges(tris) {
  const k = (v) => v.map((x) => Math.round(x * 1e4)).join(','), count = new Map();
  for (const t of tris) for (let i = 0; i < 3; i++) { const a = k(t[i]), b = k(t[(i + 1) % 3]), e = a < b ? `${a}|${b}` : `${b}|${a}`; count.set(e, (count.get(e) || 0) + 1); }
  return [...count.values()].filter((n) => n === 1).length;
}

// ---- drawing sections ----

// panels: [{ title, layers: [{ segs, style: 'design' | 'reference' }], marks: [[u, w]] }], all in one scale
function sectionsSvg(panels, { title, note, axis }) {
  const [u, w] = planeAxes(axis), W = 1800, H = 1200, head = 110, cols = Math.min(panels.length, 3), rows = Math.ceil(panels.length / cols);
  const pw = W / cols, ph = (H - head) / rows, pad = 70;
  const all = panels.flatMap((p) => p.layers.flatMap((l) => l.segs.flat()));
  if (!all.length) return '';
  const lo = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))], hi = [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
  const s = Math.min((pw - pad * 2) / (hi[0] - lo[0] || 1), (ph - pad * 2) / (hi[1] - lo[1] || 1));
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  let body = '';
  panels.forEach((p, i) => {
    const ox = (i % cols) * pw, oy = head + Math.floor(i / cols) * ph;
    const X = (x) => ox + pw / 2 + (x - (lo[0] + hi[0]) / 2) * s, Y = (y) => oy + ph / 2 - (y - (lo[1] + hi[1]) / 2) * s;
    body += `<text x="${ox + 32}" y="${oy + 36}" class="h">${esc(p.title)}</text>`;
    // a 1 mm scale bar
    body += `<line x1="${ox + 32}" y1="${oy + ph - 30}" x2="${ox + 32 + s}" y2="${oy + ph - 30}" stroke="#8a8a8a" stroke-width="2"/><text x="${ox + 40 + s}" y="${oy + ph - 24}" class="m">1 mm</text>`;
    for (const l of p.layers) {
      const d = loops(l.segs).map((line) => `M${line.map(([a, b]) => `${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join('L')}`).join('');
      body += l.style === 'reference'
        ? `<path d="${d}" fill="none" stroke="#b4b4b4" stroke-width="2" stroke-dasharray="7 5"/>`
        : `<path d="${d}" fill="#3a3a3a" fill-rule="evenodd" stroke="#ffffff" stroke-width="1.6"/>`;
    }
    for (const [a, b] of p.marks || []) body += `<circle cx="${X(a)}" cy="${Y(b)}" r="9" fill="none" stroke="#ffffff" stroke-width="2"/>`;
    body += `<text x="${ox + 32}" y="${oy + 62}" class="m">${AXES[u]} across, ${AXES[w]} up</text>`;
  });
  const legend = panels.some((p) => p.layers.some((l) => l.style === 'reference'))
    ? `<rect x="1180" y="40" width="34" height="18" fill="#3a3a3a" stroke="#fff"/><text x="1226" y="55" class="m">design</text><line x1="1340" y1="49" x2="1380" y2="49" stroke="#b4b4b4" stroke-width="2" stroke-dasharray="7 5"/><text x="1392" y="55" class="m">reference</text><circle cx="1530" cy="49" r="9" fill="none" stroke="#fff" stroke-width="2"/><text x="1548" y="55" class="m">worst places</text>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>text{font-family:-apple-system,Helvetica,Arial,sans-serif;fill:#fff}.t{font-size:30px}.n{font-size:21px;fill:#9a9a9a}.h{font-size:19px;letter-spacing:2px;fill:#9a9a9a}.m{font-size:17px;fill:#8a8a8a}</style>
<rect width="${W}" height="${H}" fill="#000"/><text x="32" y="52" class="t">${esc(title)}</text><text x="32" y="86" class="n">${esc(note)}</text>${legend}${body}</svg></body></html>`;
}

// ---- cad measure ----

// measure(file, { along, at: ['10', '50'], line: ['0.6,2.5'], rules, source, licence, force, pictures }) -> prints the report;
// writes the profiles' drawing, and draft rules when asked
export async function measure(file, o = {}) {
  if (!fs.existsSync(file)) throw new Error(`no file ${file}`);
  const tris = readMesh(file), B = bounds(tris);
  const axis = o.along ? axisOf(o.along) : B.size.indexOf(Math.max(...B.size)), [u, w] = planeAxes(axis), A = AXES[axis];
  const name = path.basename(file).replace(/\.[^.]+$/, '');
  const open = openEdges(tris);
  console.log(`${path.basename(file)}: ${tris.length} triangles${open ? `, ${open} open edges (not a closed solid: inside and outside are guesses)` : ', a closed solid'}`);
  console.log(`  size ${B.size.map(f2).join(' × ')} mm: ${AXES.map((a, i) => `${a} ${range([B.min[i], B.max[i]])}`).join(', ')}; volume ${fmt(Math.round(volume(tris) / 10) / 100)} cm³`);
  if (o.licence && limitingLicence(o.licence)) console.log(`  ! licence "${o.licence}" limits reuse: measurements are facts, but don't copy the model's shape into a design under another licence`);

  // Stretches along the axis with the same cross-section, and the distinct shapes among them
  const runs = profiles(tris, axis), shapes = [];
  for (const r of runs) {
    if (r.shape === undefined) continue;
    if (!shapes[r.shape]) shapes[r.shape] = { ...r, first: r };
    r.shape = letter(r.shape);
  }
  console.log(`\n  along ${A}: ${runs.length} stretches, ${shapes.length} distinct cross-sections (positions from ${A} = ${f2(B.min[axis])})`);
  for (const r of runs) {
    const len = r.to - r.from, at = `${f2(r.from)}..${f2(r.to)}`.padEnd(16);
    console.log(`    ${at} ${`(${f2(len)})`.padEnd(9)} ${r.varies ? 'changing: a taper, slope or curve' : r.empty ? 'empty' : `section ${r.shape}`}`);
  }
  for (const [i, s] of shapes.entries()) {
    console.log(`\n  section ${letter(i)}: ${AXES[u]} ${range(s.extent.across)} (${f2(s.extent.across[1] - s.extent.across[0])} wide), ${AXES[w]} ${range(s.extent.up)} (${f2(s.extent.up[1] - s.extent.up[0])} high)${s.curved ? ', with sloped or curved sides' : ''}`);
    for (const b of s.bands) {
      const pieces = (x) => x.map(range).join(' + ');
      const how = b.straight ? pieces(b.widest) : `${pieces(b.bottom)} at the bottom, ${pieces(b.top)} at the top, widest ${pieces(b.widest)}`;
      console.log(`    ${AXES[w]} ${range([b.from, b.to])}`.padEnd(24) + (b.pieces ? `${b.pieces} piece${b.pieces === 1 ? '' : 's'} at ${AXES[u]} ${how}` : 'nothing (a gap under material above)'));
    }
  }

  // Lines along the axis: where they are inside
  const lines = (o.line || []).map((t) => { const p = String(t).split(',').map(Number); if (p.length !== 2 || p.some(Number.isNaN)) throw new Error(`--line ${t}: two numbers, ${AXES[u]},${AXES[w]}`); return p; });
  const found = lines.map((p) => ({ p, inside: spans(tris, axis, p) }));
  for (const l of found) console.log(`\n  along ${A} at ${AXES[u]} ${f2(l.p[0])}, ${AXES[w]} ${f2(l.p[1])}: inside ${l.inside.map(range).join(', ') || 'nowhere'}`);

  // The drawing: each distinct section, and any asked for
  const panels = shapes.map((s, i) => ({ title: `SECTION ${letter(i)} · ${A} ${f2(s.first.from)}..${f2(s.first.to)}`, layers: [{ segs: s.first.segs, style: 'design' }] }));
  for (const at of (o.at || []).map(Number)) panels.push({ title: `${A} = ${f2(at)}`, layers: [{ segs: section(tris, axis, at), style: 'design' }] });
  if (panels.length && o.pictures !== false) {
    const out = paths.preview('measure', `${name}.png`);
    await picture(sectionsSvg(panels.slice(0, 9), { title: `${path.basename(file)}: sections across ${A}`, note: `${B.size.map(f2).join(' × ')} mm · ${runs.length} stretches along ${A}`, axis }), out);
    console.log(`\n  drawing: ${out}`);
  }

  if (o.rules) writeDraft({ o, name, file, B, axis, runs, shapes, found });
}

// Draft rules from a measurement: kind derived, every value traced to the file (and its source and licence). Names are
// placeholders (stretch2_from, sectionB_w): rename them for what they are before a design uses them.
function writeDraft({ o, name, file, B, axis, runs, shapes, found }) {
  const set = String(o.rules);
  if (!/^[a-z][a-z0-9_]*$/.test(set)) throw new Error('--rules <name>: lower case, digits and _ (a rule set name)');
  const to = path.join(WS, 'rules', `${set}.json`);
  if (fs.existsSync(to) && !o.force) throw new Error(`rules/${set}.json already exists (--force to replace it)`);
  const [u, w] = planeAxes(axis), A = AXES[axis], base = B.min[axis];
  const src = o.source || path.basename(file), extra = { kind: 'derived', source: src, ...(o.licence ? { licence: o.licence } : {}), checked: today() };
  const rules = {};
  const add = (k, v, rule) => { rules[k] = { value: Math.round(v * 100) / 100, unit: 'mm', rule, ...extra }; };
  AXES.forEach((a, i) => add(`size_${a}`, B.size[i], `Overall size in ${a}`));
  runs.forEach((r, i) => {
    add(`stretch${i + 1}_from`, r.from - base, `Stretch ${i + 1} (${r.varies ? 'changing' : `section ${r.shape}`}) starts, from the model's lowest ${A}`);
    add(`stretch${i + 1}_len`, r.to - r.from, `Stretch ${i + 1} length along ${A}`);
  });
  shapes.forEach((s, i) => {
    const L = letter(i);
    add(`section${L}_w`, s.extent.across[1] - s.extent.across[0], `Section ${L}: width in ${AXES[u]}`);
    add(`section${L}_h`, s.extent.up[1] - s.extent.up[0], `Section ${L}: height in ${AXES[w]}`);
    s.bands.forEach((b, j) => {
      const at = `section${L}_band${j + 1}`;
      add(`${at}_at`, b.from - s.extent.up[0], `Section ${L}, band ${j + 1} (${b.pieces} piece${b.pieces === 1 ? '' : 's'}): its bottom, from the section's lowest ${AXES[w]}`);
      add(`${at}_h`, b.to - b.from, `Section ${L}, band ${j + 1}: its height`);
      b.widest.forEach(([p, q], k) => add(`${at}_piece${k + 1}_w`, q - p, `Section ${L}, band ${j + 1}, piece ${k + 1}: widest, from ${AXES[u]} ${f2(p)}`));
    });
  });
  found.forEach((l, i) => l.inside.forEach(([a, b], j) => {
    add(`line${i + 1}_${j + 1}_from`, a - base, `Along ${A} at ${AXES[u]} ${f2(l.p[0])}, ${AXES[w]} ${f2(l.p[1])}: inside from (from the lowest ${A})`);
    add(`line${i + 1}_${j + 1}_to`, b - base, 'Inside to');
  }));
  const doc = `Measured from ${path.basename(file)} by cad measure (along ${A}). kind derived: read off someone else's model, so check it against the real thing; rename the placeholder names before a design uses them.${o.licence ? ` The model's licence: ${o.licence}.` : ''}`;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, `${JSON.stringify({ _doc: doc, name: set, rules }, null, 2)}\n`);
  console.log(`\n  draft rules: ${path.relative(process.cwd(), to)} (${Object.keys(rules).length} values, kind derived: rename them for what they are)`);
}

// ---- cad match ----

// match(b, d, file, { place, tol, samples, at, pictures }) -> report; exit code 1 when the design is outside the tolerance
export async function match(b, d, file, { place, tol, samples = 20000, at = [], title, tag = '', pictures = true }) {
  if (!fs.existsSync(file)) throw new Error(`no file ${file}`);
  const fan = (polys) => polys.flatMap((p) => p.slice(1, -1).map((_, i) => [p[0], p[i + 1], p[i + 2]]));
  const parts = b.parts.filter((p) => p.role !== 'support'), design = fan(parts.flatMap((p) => p.triangles));
  const ref = readMesh(file);
  const placed = place ? { ...parsePlacement(place), name: place, score: null } : align(ref, design);
  const R = turn(ref, placed.M, placed.shift);
  const words = (p) => `${p.name === 'none' ? '' : `${p.name} `}t${p.shift.map(f2).join(',')}`.trim();
  console.log(`${title} against ${path.basename(file)}`);
  console.log(`  placed ${place ? 'as asked' : 'by fitting it to the design'}: ${words(placed)}${place ? '' : ` (pin it with --place "${words(placed)}")`}`);
  if (openEdges(ref)) console.log(`  ! the reference has ${openEdges(ref)} open edges: inside and outside are guesses near them`);

  const D = deviation(design, R, { samples }), Rv = deviation(R, design, { samples });
  const sd = stats(D), sr = stats(Rv);
  const level = (s) => (s.max <= tol ? 'pass' : s.p95 <= tol ? 'warn' : 'fail');
  const mark = { pass: '✓', warn: '!', fail: '✗' };
  const side = (x) => (x < 0 ? 'inside' : 'outside');
  console.log(`  ${mark[level(sd)]} the design's surface: 95% within ${f2(sd.p95)} mm of the reference, ${f2(sd.max)} at most (mean ${f2(sd.mean)}; on average ${f2(Math.abs(sd.signed))} mm ${side(sd.signed)} it)`);
  console.log(`  ${mark[level(sr)]} the reference's surface: 95% within ${f2(sr.p95)} mm of the design, ${f2(sr.max)} at most (mean ${f2(sr.mean)})`);
  console.log(`    tolerance ${f2(tol)} mm${place ? '' : ''}: ✓ everything within it, ! only the worst 5% past it, ✗ more than that`);

  const wd = worst(D.filter((x) => Math.abs(x.d) > tol)), wr = worst(Rv.filter((x) => Math.abs(x.d) > tol));
  const where = (p) => AXES.map((a, i) => `${a} ${f2(p[i])}`).join(' ');
  if (wd.length) { console.log('  where the design is off:'); for (const x of wd) console.log(`    ${where(x.p)}: ${f2(Math.abs(x.d))} mm ${x.d > 0 ? 'outside the reference (extra material)' : 'inside the reference (material missing, or clearance)'}`); }
  if (wr.length) { console.log('  where the reference has what the design lacks, or lacks what it has:'); for (const x of wr) console.log(`    ${where(x.p)}: the reference is ${f2(Math.abs(x.d))} mm ${x.d > 0 ? 'outside the design (material the design lacks)' : 'inside the design (the design has extra here)'}`); }

  // Along the longest axis: the worst deviation in each eighth, to see where it goes wrong
  const DB = bounds(design), axis = DB.size.indexOf(Math.max(...DB.size)), lo = DB.min[axis], len = DB.size[axis] || 1;
  const bins = Array(8).fill(0);
  for (const x of [...D, ...Rv]) { const i = Math.min(7, Math.max(0, Math.floor(((x.p[axis] - lo) / len) * 8))); bins[i] = Math.max(bins[i], Math.abs(x.d)); }
  console.log(`  worst in each eighth along ${AXES[axis]}: ${bins.map(f2).join(' · ')} mm`);

  const ok = level(sd) !== 'fail' && level(sr) !== 'fail';
  if (!pictures) return ok;
  // Pictures: the reference over the design, and sections through the worst places (and any asked for)
  const out = paths.preview(d.project, `${d.name}${tag}-match.png`);
  await preview([...parts, { name: 'reference', role: 'reference', label: 'reference', triangles: R }], { title: `${title}: match`, meta: `reference ${path.basename(file)} · faint lines`, out });
  // Sections at the places asked for, then through the worst places: just inside the ends (a cut on an end face is
  // empty), and at least 1 mm apart
  const cuts = [];
  for (const c of [...at.map(Number), ...[...wd, ...wr].map((x) => x.p[axis])]) {
    const k = Math.round(Math.min(lo + len - 0.05, Math.max(lo + 0.05, c)) * 100) / 100;
    if (cuts.length < 6 && cuts.every((x) => Math.abs(x - k) >= 1)) cuts.push(k);
  }
  if (!cuts.length) cuts.push(lo + len / 2);
  const [u, w] = planeAxes(axis);
  const panels = cuts.map((c) => ({
    title: `${AXES[axis].toUpperCase()} = ${f2(c)}`,
    layers: [{ segs: section(design, axis, c), style: 'design' }, { segs: section(R, axis, c), style: 'reference' }],
    marks: [...wd, ...wr].filter((x) => Math.abs(x.p[axis] - c) < 0.5).map((x) => [x.p[u], x.p[w]]),
  }));
  const sOut = paths.preview(d.project, `${d.name}${tag}-match-sections.png`);
  await picture(sectionsSvg(panels, { title: `${title} against ${path.basename(file)}`, note: `sections across ${AXES[axis]} · tolerance ${f2(tol)} mm · 95% within ${f2(Math.max(sd.p95, sr.p95))}, worst ${f2(Math.max(sd.max, sr.max))}`, axis }), sOut);
  console.log(`  pictures: ${out}\n            ${sOut}`);
  return ok;
}

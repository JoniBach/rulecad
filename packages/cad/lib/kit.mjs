// A kit: one folder that holds everything a person needs to build an assembly, to hand to someone who never opens the
// model. exports/<project>/<assembly>-kit/:
//   README.md            the build page: what the checks say, what to buy, what to print, the cut list, the drilling
//                        and tapping, and the build in numbered steps with the torques and the diagonals to measure
//   buy.csv              the shopping list as a table: bars, bought parts, screws, nuts and inserts in packs
//   print/<plate>.3mf    each plate of printed parts, by material (cad plates), and the beams' jigs on their own plates
//   sheets/beam-<m>.svg  each mark of beam's cut-and-drill sheet, to scale (print at 100%)
//   pictures/            with --pictures: the whole, and each step of the build that shows something
// Written only for an assembly that cad check passes with nothing failing: a kit of a failing design is refused by name.
import fs from 'node:fs';
import path from 'node:path';
import { paths, WS } from './workspace.mjs';
import { CadError } from './errors.mjs';
import { buildAssembly } from './assembly.mjs';
import { shoppingList } from './list.mjs';
import { platesOf, checkPlate } from './plates.mjs';
import { cutListOf, writeBeamSheets } from './beams.mjs';
import { writeJigs } from './jigs.mjs';
import { frameBuild, frameStepPictures } from './framebuild.mjs';
import { orderOf, isBuilt } from './order.mjs';
import { withPreload } from './slotnuts.mjs';
import { threemf, slotOf } from './threemf.mjs';
import { companions } from './fittings.mjs';

const mm = (x) => String(+Number(x).toFixed(2));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cell = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
// The upright beams (placed by their ends, running up z) and the corner each stands at, seen from above: left and right
// by x, front and back by y (the front the side of least y), where the uprights stand in two rows that way
function uprightPlan(s, marks) {
  const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
  const ups = (s.items ?? []).filter((it) => it.beam && isVec(it.from) && isVec(it.to) && Math.abs(it.from[0] - it.to[0]) < 1e-6 && Math.abs(it.from[1] - it.to[1]) < 1e-6 && Math.abs(it.to[2] - it.from[2]) > 1e-6);
  if (ups.length < 2) return null;
  const xs = [...new Set(ups.map((u) => +u.from[0].toFixed(3)))].sort((a, b) => a - b), ys = [...new Set(ups.map((u) => +u.from[1].toFixed(3)))].sort((a, b) => a - b);
  const side = (v, list, lo, hi) => (list.length === 2 ? (Math.abs(v - list[0]) < 1e-3 ? lo : hi) : null);
  const rows = ups.map((u) => {
    const fb = side(u.from[1], ys, 'front', 'back'), lr = side(u.from[0], xs, 'left', 'right');
    return [u.id, [fb, lr].filter(Boolean).join(' ') || 'see x, y', `${mm(u.from[0])}, ${mm(u.from[1])}`, marks.find((m) => m.items.includes(u.id))?.mark ?? ''];
  });
  const down = ups.every((u) => u.from[2] < u.to[2]) ? ' Each upright stands with its end a down.' : '';
  return { rows, said: `Seen from above, x to the right and y away from you: the front is the side nearest you (least y), the left the side of least x.${down}` };
}
const table = (heads, rows) => [`| ${heads.join(' | ')} |`, `|${heads.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)];
const csv = (rows) => rows.map((r) => r.map((x) => { const t = String(x ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\n');

/** The kit's folder for an assembly: exports/<project>/<assembly>-kit. @param {object} s a built assembly */
export const kitDir = (s) => paths.exports(s.project, `${s.name}-kit`);

// A plate assembly's printed parts as a 3MF: one object per printed thing, a part per part, each in its filament (as
// cad export writes a plate)
async function plate3mf(ref, file) {
  const { filaments, slots } = await import('./links.mjs');
  const s = await buildAssembly(ref), fil = filaments(s.project), things = new Map();
  for (const p of s.parts.filter((q) => q.role !== 'reference')) { if (!things.has(p.leaf)) things.set(p.leaf, []); things.get(p.leaf).push({ name: p.label, triangles: p.triangles, slot: slotOf(fil, p.filament) }); }
  fs.writeFileSync(file, await threemf([...things].map(([name, parts]) => ({ name, parts })), { filaments: slots(fil) }));
}

/**
 * Write an assembly's kit. Refused by name (kit.check) where cad check fails, and (kit.empty) where there is nothing to
 * build from: no beams, nothing printed and nothing bought.
 * @param {object} s a built assembly @param {object[]} findings checkAssembly's
 * @param {{ pictures?: boolean, preview?: Function }} [o] pictures: draw the whole and each step (needs Chrome; preview is lib/preview.mjs's)
 * @returns {Promise<{ dir: string, files: string[], plates: object[], jigs: object | null, sheets: object[], steps: number, findings: object[] }>}
 */
export async function writeKit(s, findings, { pictures = false, preview = null } = {}) {
  const ref = `${s.project}/${s.name}`, fails = findings.filter((f) => f.level === 'fail');
  if (fails.length) throw new CadError('kit.check', `${ref}: cad check fails ${plural(fails.length, 'check')} (${fails.slice(0, 3).map((f) => f.text).join('; ')}${fails.length > 3 ? '; ..' : ''}), and a kit is written only for a design that checks with nothing failing: cad check ${ref}`);
  const dir = kitDir(s), files = [], rel = (f) => path.relative(dir, f).split(path.sep).join('/'), put = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); files.push(rel(f)); };
  fs.rmSync(dir, { recursive: true, force: true }); // (the kit is written whole each time: nothing stale is left in it)
  fs.mkdirSync(dir, { recursive: true });

  // What to print: the plates (cad plates' own, each written as its 3MF) and the beams' jigs
  let pl = null;
  try { pl = await platesOf(s, { write: true }); } catch (e) { if (e.code !== 'plates.empty') throw e; }
  const plates = [];
  for (const p of pl?.plates ?? []) {
    const file = path.join(dir, 'print', `${p.name}.3mf`); fs.mkdirSync(path.dirname(file), { recursive: true });
    await plate3mf(`${s.project}/${p.name}`, file); files.push(rel(file));
    const bad = (await checkPlate(`${s.project}/${p.name}`)).filter((f) => (f.level === 'fail' || f.level === 'warn') && f.code !== 'rules.estimate');
    plates.push({ ...p, file: rel(file), issues: bad.map((f) => `${f.level}: ${f.text}`) });
  }
  const cut = cutListOf(s), jigs = cut ? await writeJigs(s) : null;
  if (jigs) for (const p of jigs.plates) { const file = path.join(dir, 'print', path.basename(p.file)); fs.copyFileSync(p.file, file); files.push(rel(file)); p.kit = rel(file); }
  // The sheets: each mark's, as cad beams writes them
  const sheets = cut ? writeBeamSheets(s).map((x) => { const file = path.join(dir, 'sheets', `beam-${x.mark}.svg`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(x.file, file); files.push(rel(file)); return { ...x, kit: rel(file), was: x.file }; }) : [];
  // What to buy, and how it goes together
  const list = shoppingList(s), frame = s.joins?.length ? frameBuild(s) : null, order = !frame && isBuilt(s) ? withPreload(s, orderOf(s)) : null;
  if (!cut && !plates.length && !list.bought.length && !list.fasteners.length) throw new CadError('kit.empty', `${ref} has nothing to build a kit from: no beams, nothing printed and nothing bought`);
  if (frame?.stuck || order?.stuck) throw new CadError('kit.order', `${ref}: ${(frame ?? order).stuck.text}`);
  // a sheet named in a step by its file in exports/ is named by its file in the kit
  const local = (t) => sheets.reduce((x, sh) => x.split(path.relative(WS, sh.was)).join(sh.kit).split(path.relative(WS, sh.was).split(path.sep).join('/')).join(sh.kit), t);

  // Pictures: the whole, and each step that shows something
  const pics = new Map();
  if (pictures) {
    if (!preview) throw new CadError('kit.pictures', 'cad kit --pictures draws with lib/preview.mjs, and was given none');
    const whole = path.join(dir, 'pictures', `${s.name}.png`);
    await preview(s.parts.map((p) => ({ name: p.name, label: p.label, role: p.role, item: p.item, triangles: p.triangles })), { title: s.a.title || s.name, meta: 'as built', out: whole }); files.push(rel(whole));
    if (frame) for (const { n, parts } of frameStepPictures(s, frame)) { const st = frame.steps[n - 1], out = path.join(dir, 'pictures', `step-${String(n).padStart(2, '0')}.png`); await preview(parts, { title: `${s.a.title || s.name}: step ${n} of ${frame.steps.length}`, meta: st.text, out }); files.push(rel(out)); pics.set(n, rel(out)); }
  }

  // buy.csv: one row a line to buy
  const rows = [['kind', 'quantity', 'what', 'buy', 'for']];
  for (const st of list.cut?.stock ?? []) for (const b of st.buy) rows.push(['bar', b.count, `${st.profile} x ${mm(b.length)} mm`, `${b.count} x ${mm(b.length)} mm`, `the cut list's marks ${[...new Set(st.bars.flatMap((x) => x.cuts.map((c) => c.mark)))].join(', ')}`]);
  for (const b of list.bought.filter((x) => x.part !== 'beam')) rows.push(['bought', b.qty, `${b.set}${b.variant ? ` (${b.variant})` : ''}${b.size ? ` cut ${b.size[0]} x ${b.size[1]} mm` : ''}`, b.cost != null ? `${b.cost} ${b.currency} each` : '', b.items.join(' ')]);
  for (const f of list.fasteners) rows.push([f.kind ?? 'fixing', f.qty, f.fastener, f.packs ? `${f.packs} pack${f.packs > 1 ? 's' : ''} of ${list.totals.pack.size}` : '', f.from.join('; ')]);
  put(path.join(dir, 'buy.csv'), `${csv(rows)}\n`);

  // README.md: the build page
  const title = s.a.title || s.name, out = [`# ${title}: the kit`, '', `Everything needed to build ${title}, made from the assembly \`${ref}\` by \`cad kit\`. The design checks with nothing failing; this folder is enough to buy, print, cut, drill and put it together without opening the model.`, ''];
  out.push('## In this folder', '', ...table(['File', 'What it is'], [
    ['README.md', 'This page: what the checks say, what to buy, what to print, the cut list, the drilling and tapping, and the build step by step'],
    ['buy.csv', 'The shopping list as a table: bars, bought parts, screws, nuts and inserts, each with how many to buy'],
    ...plates.map((p) => [p.file, `A plate to print in ${p.material.toUpperCase()}: ${plural(p.parts.length, 'part')}, ${mm(p.grams)} g, about ${p.minutes} min. Open it in the slicer as it is`]),
    ...(jigs?.plates ?? []).map((p) => [p.kit, `Jigs for cutting, drilling, tapping and squaring the beams, in ${String(p.material).toUpperCase()}: ${plural(p.parts.length, 'part')}`]),
    ...sheets.map((x) => [x.kit, `Mark ${x.mark}'s cut-and-drill sheet (${x.items.join(', ')}), to scale: print it at 100%`]),
    ...(pictures ? [[`pictures/${s.name}.png`, 'The whole, as built, from six sides'], ...[...pics].map(([n, f]) => [f, `Step ${n}, what is on the bench then`])] : []),
  ]), '');

  // what the checks say: the warnings, and what the frame's own checks found, each with what it rests on
  const warns = findings.filter((f) => f.level === 'warn'), passes = findings.filter((f) => f.level === 'pass').length;
  const said = findings.filter((f) => /^frame\.(deflection|stress|buckling|rack|frequency|square)$/.test(f.code ?? '') || f.code === 'mass.parts');
  out.push('## What the checks say', '', `\`cad check ${ref}\`: ${plural(passes, 'check')} pass, none fail${warns.length ? `, ${plural(warns.length, 'warning')}` : ', none warn'}.`, '');
  for (const f of warns) out.push(`- Warning: ${f.text}`);
  for (const f of said) out.push(`- ${f.text}`);
  out.push('');

  // what to buy
  out.push('## What to buy', '');
  if (list.cut) {
    out.push('### Bars', '', `Cut to the cut list below. Each cut takes the saw's ${mm(list.cut.rules.kerf.value)} mm kerf, and ${mm(list.cut.rules.trim.value)} mm is trimmed off each bar's first end.`, '');
    out.push(...table(['Profile', 'Buy', 'Left over, mm'], list.cut.stock.map((st) => [st.profile, st.buy.map((b) => `${b.count} x ${mm(b.length)} mm`).join(', '), mm(st.offcut ?? 0)])), '');
  }
  const bought = list.bought.filter((b) => b.part !== 'beam');
  if (bought.length) out.push('### Bought parts', '', ...table(['Qty', 'Part', 'What', 'Price each', 'Where it goes'], bought.map((b) => [b.qty, `${b.set}${b.variant ? ` (${b.variant})` : ''}${b.size ? `, cut ${b.size[0]} x ${b.size[1]} mm` : ''}`, b.part, b.cost != null ? `${b.cost} ${b.currency}` : 'not given', b.items.join(', ')])), '');
  if (list.fasteners.length) out.push('### Screws, nuts and inserts', '', ...table(['Qty', 'Fixing', 'Buy', 'Where it goes'], list.fasteners.map((f) => [f.qty, f.fastener, f.packs ? `${plural(f.packs, 'pack')} of ${list.totals.pack.size}, ${f.spare} spare` : '', f.from.join('; ')])), '');
  if (list.totals.pack) out.push(`Packs of ${list.totals.pack.size} are ${list.totals.pack.kind === 'estimate' ? 'an estimate' : `${list.totals.pack.kind}`} (${list.totals.pack.rule}).`, '');

  // what to print
  if (plates.length || jigs?.jigs.length) {
    out.push('## What to print', '');
    if (plates.length) {
      out.push(...table(['Plate', 'Material', 'Parts', 'Grams', 'Minutes', 'Prints'], plates.map((p) => [p.file, p.material.toUpperCase(), p.parts.map((x) => x.id).join(', '), mm(p.grams), p.minutes, p.issues.length ? p.issues.join('; ') : 'clean'])), '');
      const companions = list.printed.filter((x) => x.with);
      if (companions.length) out.push(`${companions.map((x) => x.id).join(', ')} ${companions.length === 1 ? 'is' : 'are'} printed beside the part ${companions.length === 1 ? 'it goes' : 'they go'} with (${[...new Set(companions.map((x) => x.with))].join(', ')}) and screwed in by hand once that is on.`, '');
      out.push(`About ${mm(list.totals.printedGrams)} g of ${list.totals.material.toUpperCase()} and ${list.totals.minutes} min of printing (an estimate from each part's volume and the printer's flow).`, '');
    }
    if (jigs?.jigs.length) {
      out.push('### Jigs', '', 'Printed tools for making the beams, each marked with the marks it is for. Print them first.', '');
      out.push(...table(['Jig', 'Mark', 'For', 'Grams', 'Margin at its load'], jigs.jigs.map((x) => [x.name, x.mark, x.kind === 'length-stop' ? `cutting ${x.for.map((w) => `mark ${w.mark}`).join(', ')} to length against one stop` : x.kind === 'square-corner' ? x.for.map((w) => w.text).join('; ') : x.for.map((w) => `${w.label ?? w.mark} (${w.items.join(', ')}): ${w.line}`).join('; '), mm(x.grams), `${mm(x.margin)} x`])), '');
      for (const f of jigs.findings) out.push(`- ${f.level === 'warn' ? 'Warning: ' : ''}${f.text}`);
      if (jigs.findings.length) out.push('');
    }
  }

  // the cut list and the drilling
  if (list.cut) {
    out.push('## Cut', '', 'Beams that are the same share a mark. Write the item on each beam as it is cut.', '');
    out.push(...table(['Mark', 'Qty', 'Profile', 'Length, mm', 'Items'], list.cut.marks.map((m) => [m.mark, m.count, m.profile, mm(m.length), m.items.join(', ')])), '');
    for (const st of list.cut.stock) { out.push(`${st.profile}, the cuts on each bar in order:`, ''); st.bars.forEach((b, i) => out.push(`${i + 1}. A ${mm(b.length)} mm bar: ${b.cuts.map((c) => `${c.mark} ${mm(c.length)} (${c.item})`).join(', ')}; ${mm(b.offcut)} mm left`)); out.push(''); }
    out.push('## Drill and tap', '', 'Each mark\'s work, every hole dimensioned from end a on its sheet.', '');
    out.push(...table(['Mark', 'Work', 'Sheet'], list.cut.marks.map((m) => [m.mark, m.ops.length ? m.ops.join('; ') : 'cut square, nothing else', sheets.find((x) => x.mark === m.mark)?.kit ?? ''])), '');
  }

  // where each upright stands: a plan of the frame's corners, so the build is followed without the pictures
  const plan = uprightPlan(s, list.cut?.marks ?? []);
  if (frame && plan) out.push('## Where the uprights stand', '', plan.said, '', ...table(['Upright', 'Corner', 'x, y (mm, its centre line)', 'Mark'], plan.rows), '');

  // the build
  const pads = companions(s);
  if (frame) {
    out.push('## Build', '', 'From bars to a square frame, then the rest mounted on it. Snug joins are tightened to their torque once their bay is square.', '');
    for (const st of frame.steps) {
      out.push(`${st.n}. ${local(st.text)}`);
      for (const l of st.lines ?? []) out.push(`   - ${local(l)}`);
      for (const c of pads.filter((x) => st.items?.includes(x.of))) out.push(`   - Then screw ${c.id} (printed beside it) into ${c.of} by hand, as far as levels the frame`);
      if (pics.has(st.n)) out.push('', `   ![Step ${st.n}](${pics.get(st.n)})`, '');
    }
    out.push('');
    for (const x of frame.notFlat ?? []) out.push(`The bay of ${x.name} is built on the frame, not flat: ${x.why}.`, '');
    if (frame.torques.length) out.push('### Tightening, by kind of join', '', ...table(['Join', 'Joins', 'Screws', 'Key', 'N m', 'Why'], frame.torques.map((t) => [t.kind, t.joins, t.fasteners.join(', '), t.key, mm(t.torque), t.why])), '');
    if (frame.bays.length) out.push('### Diagonals', '', 'Measure both diagonals of each bay, inside corner to inside corner. Where they differ by more than the last column, push the corners of the long diagonal together, tighten and measure again.', '', ...table(['Bay', 'Opening, mm', 'Each diagonal, mm', 'Accept a difference up to, mm'], frame.bays.map((b) => [b.name, `${mm(b.width)} x ${mm(b.height)}`, mm(b.square.diagonal), mm(b.square.accept)])), '');
  } else if (order) {
    out.push('## Build', '');
    for (const st of order.steps) { out.push(`${st.n}. ${st.text}`); for (const l of st.load ?? []) out.push(`   - First, ${l}`); }
    out.push('');
  }
  put(path.join(dir, 'README.md'), `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`);
  return { dir, files: files.sort(), plates, jigs: jigs ? { count: jigs.jigs.length, plates: jigs.plates.map((p) => ({ file: p.kit, material: p.material, parts: p.parts.length })), findings: jigs.findings } : null, sheets: sheets.map((x) => ({ mark: x.mark, file: x.kit, items: x.items })), steps: frame?.steps.length ?? order?.steps.length ?? 0, findings: warns };
}

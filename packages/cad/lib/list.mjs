// What a machine takes to build, in numbers: the bought items by rule set with quantities, every screw, nut, washer and
// insert (fasten.count: from the fasten relations, a motor's mounting screws, and fits that name a fastener), each by
// thread, length and head with its mass and the packs it is bought in, wires by gauge, the printed parts with their
// grams and an estimate of the minutes, and the beams' cut list (each mark, the bars to buy and the cuts on each:
// @rulecad/frames' cutList).
import { placeItems, jointValues } from '@rulecad/model-link';
import { screwModel } from '@rulecad/fixings';
import { peekRuleSet as loadRuleSet } from './rules.mjs';
import { motorScrews } from './motors.mjs';
import { paths } from './workspace.mjs';
import { readJson } from './host.mjs';
import path from 'node:path';
import { volume } from './mesh.mjs';
import { wiresFor } from './assembly.mjs';
import { cutListOf, cutListData } from './beams.mjs';
import { cutListText } from '@rulecad/frames';

const n = (x, d = 1) => Number(x.toFixed(d));

export function materialOf(project) {
  let name = 'pla';
  try { name = String(readJson(path.join(paths.project(project), 'project.json')).material || 'pla').toLowerCase().split(/\s/)[0]; } catch {}
  try { return { name, density: loadRuleSet(name).rules.density.value }; } catch { return { name, density: 1.25, assumed: true }; }
}

// Every printed thing in the assembly, once for each copy: its volume, grams and minutes
export function printedParts(s) {
  const mat = materialOf(s.project); let flow = 12;
  try { flow = loadRuleSet('x1c').rules.print_flow?.value ?? flow; } catch {}
  const by = new Map();
  for (const p of s.parts) {
    if (p.role !== 'part' && p.role != null) continue;
    const key = p.leaf ?? p.item, mm3 = volume(p.triangles), o = by.get(key) ?? { id: key, object: p.object ?? null, volume: 0 };
    o.volume += mm3; by.set(key, o);
  }
  return [...by.values()].map((o) => ({ ...o, volume: n(o.volume, 0), grams: n((o.volume / 1000) * mat.density), minutes: n(o.volume / flow / 60, 0) }));
}

/** The whole list. @returns {{ bought: object[], fasteners: object[], wires: object[], printed: object[], cut: object | null, totals: object }} */
export function shoppingList(s) {
  const mat = materialOf(s.project), printed = printedParts(s), bought = new Map(), fasteners = new Map();
  for (const o of s.objects) if (o.bought && !o.unplaced) {
    // (a beam by its profile and length: one line for each length cut, lib/beams.mjs)
    // (a panel by its sheet and size: lib/panels.mjs)
    const len = o.bought.length != null ? Number(o.bought.length.toFixed(2)) : null, size = o.bought.size ?? null, key = `${o.bought.set}|${o.bought.variant ?? ''}|${len ?? ''}|${size ?? ''}`;
    const line = bought.get(key) ?? { set: o.bought.set, variant: o.bought.variant, part: o.bought.part, ...(len != null ? { length: len } : {}), ...(size ? { size } : {}), qty: 0, grams: o.bought.mass != null ? o.bought.mass * 1000 : null, items: [] };
    line.qty++; line.items.push(o.id); bought.set(key, line);
  }
  // fasten.count: the hardware a fasten placed (a component's too), one part a piece; a motor's mounting screws; and a fit
  // that names its fastener by hand. Summed by name, which is the thread, length and head, or the nut's kind
  const add = (name, n, from, more = {}) => { const line = fasteners.get(name) ?? { fastener: name, qty: 0, from: [], ...more }; line.qty += n; if (!line.from.includes(from)) line.from.push(from); fasteners.set(name, line); };
  for (const p of s.parts) if (p.hardware) { const h = p.hardware; add(h.name, 1, h.from ?? h.name, { kind: h.kind, thread: h.thread ?? null, length: h.length ?? null, head: h.head ?? null, grams: h.grams ?? null }); }
  for (const m of motorScrews(s, { placeItems, jointValues })) {
    let grams = null; try { grams = screwModel(m.thread, { length: m.length, head: m.head, anyLength: true }).mass; } catch {}
    add(m.name, m.count, `${m.item} on ${m.other} (its mount, a fit that fastens)`, { kind: 'screw', thread: m.thread, length: m.length, head: m.head, grams });
  }
  // what a printed fitting takes besides its screws: a hinge's pin and its nut, a catch's magnet and strike (lib/fittings.mjs)
  for (const o of s.objects) if (o.fitting?.hardware && !o.unplaced) for (const h of o.fitting.hardware) add(h.name, h.count ?? 1, `${o.id} (${h.why ?? 'its fitting'})`, { kind: h.kind, thread: h.thread ?? null, length: h.length ?? null, head: h.head ?? null, grams: null });
  for (const x of s.fits) if (x.fastener && x.fasten == null) add(x.fastener, x.count != null ? x.num(x.count) : 1, x.note || `${x.a} / ${x.b}`);
  // Rounded up to whole packs (packs.pack), the spares said
  let pack = null; try { const r = loadRuleSet('packs').rules.pack; pack = { size: r.value, rule: 'packs.pack', kind: r.kind }; } catch {}
  const fixings = [...fasteners.values()].map((l) => ({ ...l, ...(l.grams != null ? { grams: n(l.grams, 3), mass: n(l.grams * l.qty, 2) } : {}), ...(l.kind && pack ? { packs: Math.ceil(l.qty / pack.size), buy: Math.ceil(l.qty / pack.size) * pack.size, spare: Math.ceil(l.qty / pack.size) * pack.size - l.qty } : {}) }))
    .sort((a, b) => (a.kind ? 0 : 1) - (b.kind ? 0 : 1) || ['screw', 'nut', 'washer', 'insert'].indexOf(a.kind) - ['screw', 'nut', 'washer', 'insert'].indexOf(b.kind) || String(a.thread).localeCompare(String(b.thread)) || (a.length ?? 0) - (b.length ?? 0) || a.fastener.localeCompare(b.fastener));
  const rows = s.wires?.length ? wiresFor(s) : [], wires = new Map();
  for (const w of rows) { const key = w.gauge ?? 'gauge not given', l = wires.get(key) ?? { gauge: w.gauge, conductors: 0, length: 0, runs: [] }; l.length += w.length * w.conductors; l.conductors += w.conductors; l.runs.push(w.id); wires.set(key, l); }
  const boughtList = [...bought.values()].map((b) => ({ ...b, grams: b.grams != null ? n(b.grams) : null })).sort((a, b) => a.part.localeCompare(b.part) || a.set.localeCompare(b.set) || (b.length ?? 0) - (a.length ?? 0));
  const printedGrams = printed.reduce((t, p) => t + p.grams, 0), boughtGrams = boughtList.reduce((t, b) => t + (b.grams ?? 0) * b.qty, 0), unknown = boughtList.filter((b) => b.grams == null).map((b) => b.set);
  const cut = cutListData(cutListOf(s));
  const fixingsGrams = fixings.reduce((t, f) => t + (f.mass ?? 0), 0);
  return { bought: boughtList, fasteners: fixings, wires: [...wires.values()], printed, cut, totals: { printedGrams: n(printedGrams), boughtGrams: n(boughtGrams), fixingsGrams: n(fixingsGrams), machineGrams: n(printedGrams + boughtGrams + fixingsGrams), ...(pack && fixings.some((f) => f.packs) ? { pack } : {}), minutes: n(printed.reduce((t, p) => t + p.minutes, 0), 0), material: mat.name, ...(mat.assumed ? { densityAssumed: true } : {}), ...(unknown.length ? { noMassFor: unknown } : {}) } };
}

export function listText(ref, l) {
  const out = [`${ref}: what it takes to build`];
  const row = (a) => out.push(a.join('  '));
  if (l.bought.length) { out.push('', 'Bought'); for (const b of l.bought) row([`  ${String(b.qty).padStart(3)} ×`, `${b.set}${b.variant ? ` (${b.variant})` : ''}${b.length != null ? ` x ${b.length} mm` : ''}${b.size ? ` cut ${b.size[0]} x ${b.size[1]} mm` : ''}`, `a ${b.part}`, b.grams != null ? `${b.grams} g each` : 'mass not given', b.items.join(', ')]); }
  if (l.cut) { out.push('', `Cut list (kerf ${l.cut.rules.kerf.value} mm, trim ${l.cut.rules.trim.value} mm; a sheet for each mark: cad beams ${ref})`, ...cutListText(l.cut)); }
  if (l.fasteners.length) {
    out.push('', 'Fasteners');
    for (const f of l.fasteners) row([`  ${String(f.qty).padStart(3)} ×`, f.fastener, ...(f.mass != null ? [`${f.grams} g each, ${f.mass} g`] : []), ...(f.packs ? [`${f.packs} pack${f.packs > 1 ? 's' : ''} of ${l.totals.pack.size}, ${f.spare} spare`] : []), f.from.join('; ')]);
    if (l.totals.pack) out.push(`  (packs of ${l.totals.pack.size}: ${l.totals.pack.rule}, ${/^[aeiou]/.test(l.totals.pack.kind) ? 'an' : 'a'} ${l.totals.pack.kind}; masses are estimates from each piece's outline)`);
  }
  if (l.wires.length) { out.push('', 'Wire'); for (const w of l.wires) row([`  ${w.length} mm of`, w.gauge ?? 'gauge not given', `in ${w.runs.join(', ')}`]); }
  if (l.printed.length) { out.push('', `Printed (${l.totals.material})`); for (const p of l.printed) row([`  ${String(p.grams).padStart(7)} g`, `about ${p.minutes} min`, `${p.id}${p.object && p.object !== p.id ? ` (${p.object})` : ''}`]); }
  out.push('', `Total: ${l.totals.printedGrams} g printed, about ${l.totals.minutes} min of printing (an estimate from volume and the printer's flow), ${l.totals.fixingsGrams ? `${l.totals.fixingsGrams} g of fixings, ` : ''}${l.totals.machineGrams} g as a machine${l.totals.noMassFor ? ` (no mass given for ${l.totals.noMassFor.join(', ')})` : ''}`);
  return out.join('\n');
}

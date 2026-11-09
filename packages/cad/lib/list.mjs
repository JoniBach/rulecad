// What a machine takes to build, in numbers: the bought items by rule set with quantities, fasteners from the fits that
// name them, wires by gauge, and the printed parts with their grams and an estimate of the minutes.
import { peekRuleSet as loadRuleSet } from './rules.mjs';
import { paths } from './workspace.mjs';
import { readJson } from './host.mjs';
import path from 'node:path';
import { volume } from './mesh.mjs';
import { wiresFor } from './assembly.mjs';

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

/** The whole list. @returns {{ bought: object[], fasteners: object[], wires: object[], printed: object[], totals: object }} */
export function shoppingList(s) {
  const mat = materialOf(s.project), printed = printedParts(s), bought = new Map(), fasteners = new Map();
  for (const o of s.objects) if (o.bought && !o.unplaced) {
    const key = `${o.bought.set}|${o.bought.variant ?? ''}`, line = bought.get(key) ?? { set: o.bought.set, variant: o.bought.variant, part: o.bought.part, qty: 0, grams: o.bought.mass != null ? o.bought.mass * 1000 : null, items: [] };
    line.qty++; line.items.push(o.id); bought.set(key, line);
  }
  for (const x of s.fits) if (x.fastener) {
    const count = x.count != null ? x.num(x.count) : 1, line = fasteners.get(x.fastener) ?? { fastener: x.fastener, qty: 0, from: [] };
    line.qty += count; line.from.push(x.note || `${x.a} / ${x.b}`); fasteners.set(x.fastener, line);
  }
  const rows = s.wires?.length ? wiresFor(s) : [], wires = new Map();
  for (const w of rows) { const key = w.gauge ?? 'gauge not given', l = wires.get(key) ?? { gauge: w.gauge, conductors: 0, length: 0, runs: [] }; l.length += w.length * w.conductors; l.conductors += w.conductors; l.runs.push(w.id); wires.set(key, l); }
  const boughtList = [...bought.values()].map((b) => ({ ...b, grams: b.grams != null ? n(b.grams) : null })).sort((a, b) => a.part.localeCompare(b.part) || a.set.localeCompare(b.set));
  const printedGrams = printed.reduce((t, p) => t + p.grams, 0), boughtGrams = boughtList.reduce((t, b) => t + (b.grams ?? 0) * b.qty, 0), unknown = boughtList.filter((b) => b.grams == null).map((b) => b.set);
  return { bought: boughtList, fasteners: [...fasteners.values()], wires: [...wires.values()], printed, totals: { printedGrams: n(printedGrams), boughtGrams: n(boughtGrams), machineGrams: n(printedGrams + boughtGrams), minutes: n(printed.reduce((t, p) => t + p.minutes, 0), 0), material: mat.name, ...(mat.assumed ? { densityAssumed: true } : {}), ...(unknown.length ? { noMassFor: unknown } : {}) } };
}

export function listText(ref, l) {
  const out = [`${ref}: what it takes to build`];
  const row = (a) => out.push(a.join('  '));
  if (l.bought.length) { out.push('', 'Bought'); for (const b of l.bought) row([`  ${String(b.qty).padStart(3)} ×`, `${b.set}${b.variant ? ` (${b.variant})` : ''}`, `a ${b.part}`, b.grams != null ? `${b.grams} g each` : 'mass not given', b.items.join(', ')]); }
  if (l.fasteners.length) { out.push('', 'Fasteners'); for (const f of l.fasteners) row([`  ${String(f.qty).padStart(3)} ×`, f.fastener, f.from.join('; ')]); }
  if (l.wires.length) { out.push('', 'Wire'); for (const w of l.wires) row([`  ${w.length} mm of`, w.gauge ?? 'gauge not given', `in ${w.runs.join(', ')}`]); }
  if (l.printed.length) { out.push('', `Printed (${l.totals.material})`); for (const p of l.printed) row([`  ${String(p.grams).padStart(7)} g`, `about ${p.minutes} min`, `${p.id}${p.object && p.object !== p.id ? ` (${p.object})` : ''}`]); }
  out.push('', `Total: ${l.totals.printedGrams} g printed, about ${l.totals.minutes} min of printing (an estimate from volume and the printer's flow), ${l.totals.machineGrams} g as a machine${l.totals.noMassFor ? ` (no mass given for ${l.totals.noMassFor.join(', ')})` : ''}`);
  return out.join('\n');
}

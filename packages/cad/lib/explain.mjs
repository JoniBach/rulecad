// What an object's numbers are, and why: `cad values` and `cad why`. A value's explanation is the tree of names its
// expression reads, down to the rules (each with its kind and source), following other objects' values into their own
// designs (link.l = keyboard.link_l, explained in the keyboard).
import path from 'node:path';
import { locate, build, isObjectRef } from './design.mjs';
import { WS, paths } from './workspace.mjs';
import { host } from './host.mjs';

/**
 * What an optimised result is made from, for a problem variable: the problem file, its title and material, the rule
 * sets it uses, its own values, the parts and anchors of other designs it reads, where its filter came from, and the
 * file its densities are kept in (made, or not yet). Change any of these and the result is made again; nothing else.
 * @param {string} project @param {string} ref the problem, name or name:variant
 */
export async function problemInputs(project, ref) {
  const { readProblem, densitiesKey } = await import('./optimise.mjs'), r = await readProblem(project, ref);
  const kept = paths.cache('densities', `${densitiesKey(r.problem)}.json`);
  return { problem: ref, file: path.relative(WS, r.file).split(path.sep).join('/'), title: r.title, material: r.material.name, ...r.inputs,
    densities: path.relative(WS, kept).split(path.sep).join('/'), made: host.exists(kept) };
}

/**
 * An object's own variables, resolved: name, value, unit, expression and rule (all of them, or the names given).
 * @param {{ entries: any[] }} b a build @param {string[]} [names]
 */
export function valuesOf(b, names = []) {
  const own = b.entries.filter((e) => !e.name.includes('.'));
  const pick = names.length ? names.map((n) => own.find((e) => e.name === n) || (() => { throw Object.assign(new Error(`no variable "${n}" (variables: ${own.map((e) => e.name).join(', ')})`), { code: 'var.unknown' }); })()) : own;
  return pick.map((e) => ({ name: e.name, value: e.value, unit: e.unit || '', ...(e.expr ? { expr: e.expr } : {}), ...(e.rule ? { rule: e.rule } : {}), ...(e.label ? { label: e.label } : {}) }));
}

/**
 * Why a value is what it is: { name, value, unit, expr?, rule?, kind?, source?, object, reads: [...] }, each name its
 * expression reads explained the same way, to `depth` levels. A name met twice is explained once (later: { …, seen: true }).
 * @param {string} ref project/object @param {string} name a variable, or a rule (x1c.line) @param {{ depth?: number }} [options]
 */
export async function why(ref, name, { depth = 12 } = {}) {
  const builds = new Map(), seen = new Set();
  const get = async (r) => builds.get(r) || (builds.set(r, await build(locate(r))), builds.get(r));
  const node = async (r, n, d) => {
    const b = await get(r), e = b.entries.find((x) => x.name === n);
    if (!e) throw Object.assign(new Error(`${r}: no variable or rule "${n}"`), { code: 'var.unknown' });
    const out = { name: n, value: e.value, unit: e.unit || '', object: r, ...(e.expr ? { expr: e.expr } : {}), ...(e.rule ? { rule: e.rule } : {}),
      ...(e.kind ? { kind: e.kind } : {}), ...(e.source ? { source: e.source } : {}) };
    const key = `${r}:${n}`;
    if (seen.has(key)) return { ...out, seen: true };
    seen.add(key);
    // Another object's value (keyboard.link_l in the link): explained in that object's own design
    const [set, rest] = n.includes('.') ? [n.slice(0, n.indexOf('.')), n.slice(n.indexOf('.') + 1)] : [null, null];
    const from = set && (b.object.uses || []).find((u) => isObjectRef(u) && u.split('/').pop().split(/[:@]/)[0] === set);
    if (from && d > 0) return { ...(await node(from.split(/[:@]/)[0], rest, d - 1)), via: `${r}:${n}` };
    out.reads = d > 0 ? await Promise.all((b.deps?.[n] || []).map((m) => node(r, m, d - 1))) : [];
    // A problem variable: the optimised result it picks, and what that is made from
    if (b.object.variables?.[n]?.type === 'problem' && e.value && e.value !== 'none') out.problem = await problemInputs(r.split('/')[0], e.value);
    return out;
  };
  return node(ref, name, depth);
}

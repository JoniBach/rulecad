// A frame's sizing (@rulecad/fea/frame's sizing): "frame": { "size": { "profiles": [...] } } chooses, for each group of
// beams that must match (a pair of rails, the four posts), the lightest profile from a list that meets the frame's own
// limits: the sag allowed at each load, named point and guide (as frame.deflection holds it), each beam's stress against
// its alloy with frame.margin to spare, with the joins' springs and with them rigid (as frame.stress), the whole frame's
// first buckling factor and each grouped beam against Euler's load with the same margin (as frame.buckling), and the
// lowest mode against what the task's moves shake it at, twice over (as frame.frequency), or a floor of the assembly's
// own. The frame is the one frameModelOf builds, solved in every pose; only the beams' sections, alloys, mass and roll
// change. The result is a table: each group's profile, the limit that set it (the one its next lighter profile breaks)
// and the margin, written into the assembly by cad frame --size --write.
// Units: mm, N, MPa, kg, Hz.
import { sizing } from '@rulecad/fea/frame';
import { profileModel, profileChoices } from '@rulecad/frames';
import { frameModelOf, FRAME_CHECK, excitesOf } from './framecheck.mjs';
import { framesContext } from './beams.mjs';
import { givenFor } from './frames.mjs';

const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const n3 = (x, d = 3) => String(+Number(x).toFixed(d)), r3 = (x) => +Number(x).toFixed(3);

/** The working figures of the frame's sizing, each with what it rests on. */
export const FRAME_SIZING = {
  profiles: { value: ['2020-misumi-hfs5', '2040-misumi-hfs5', '2060-misumi-hfs5', '3030-misumi-hfs6', '3060-misumi-hfs6', '4040-misumi-hfs8', '4080-misumi-hfs8'], unit: '', rule: 'Where frame.size gives no profiles, the list each group is chosen from: one maker\'s series from 20 to 40 mm, so the slot nuts and fittings stay within three slot sizes. Each that is not square is tried lying as drawn and turned a quarter', kind: 'default', source: 'A working list of @rulecad/cad, from the profile sets in @rulecad/rules (MISUMI HFS5, HFS6 and HFS8)', checked: '2026-11-20' },
  match: { value: 0.5, unit: 'mm', rule: 'Beams not named in frame.size.groups are grouped by themselves: beams of one profile lying the same way whose lengths agree within this much must match (a pair of rails, four posts)', kind: 'default', source: 'A working figure of @rulecad/cad: under any cut tolerance in the kit\'s profile sets', checked: '2026-11-20' },
};

const SIZE_KEYS = ['profiles', 'groups', 'limits', 'by'];
const LIMIT_KEYS = ['deflection', 'stress', 'buckling', 'frequency'];

/**
 * frame.size read and refused by name: { profiles, groups, limits, by }.
 * @param {object} s a built assembly @returns {{ profiles: string[], groups: Record<string, string[]>, limits: Record<string, number>, by: 'mass' | 'cost' } | null}
 */
export function sizeOption(s) {
  const o = s.a.frame?.size;
  if (o == null) return null;
  if (typeof o !== 'object' || Array.isArray(o)) throw new Error(`frame.size is { "profiles": ["2020-misumi-hfs5", "2040-misumi-hfs5"], "groups": { "legs": ["z1", "z2"] }, "limits": { "deflection": 1 } } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!SIZE_KEYS.includes(k)) throw new Error(`frame.size has no "${k}": it takes ${SIZE_KEYS.join(', ')}`);
  const profiles = o.profiles ?? FRAME_SIZING.profiles.value;
  if (!Array.isArray(profiles) || !profiles.length || !profiles.every((p) => typeof p === 'string' && p)) throw new Error(`frame.size.profiles is a list of profile sets by name, to choose each group's from (got ${shown(o.profiles)})`);
  const groups = o.groups ?? {};
  if (typeof groups !== 'object' || Array.isArray(groups)) throw new Error(`frame.size.groups is { "legs": ["z1", "z2", "z3", "z4"] }: beams that must take one profile, by name (got ${shown(o.groups)})`);
  for (const [g, list] of Object.entries(groups)) if (!Array.isArray(list) || !list.length || !list.every((x) => typeof x === 'string')) throw new Error(`frame.size.groups.${g} is a list of beams by name (got ${shown(list)})`);
  const limits = o.limits ?? {};
  if (typeof limits !== 'object' || Array.isArray(limits)) throw new Error(`frame.size.limits is { "deflection": mm, "stress": margin, "buckling": factor, "frequency": Hz } (got ${shown(o.limits)})`);
  for (const k of Object.keys(limits)) if (!LIMIT_KEYS.includes(k)) throw new Error(`frame.size.limits has no "${k}": it takes deflection (mm), stress (a margin), buckling (a factor) and frequency (Hz)`);
  const out = {};
  for (const [k, v] of Object.entries(limits)) { const x = s.num(v); if (!(x > 0)) throw new Error(`frame.size.limits.${k} is above 0 (got ${shown(v)})`); out[k] = x; }
  if (o.by != null && !['mass', 'cost'].includes(o.by)) throw new Error(`frame.size.by is mass or cost (got ${shown(o.by)})`);
  if (o.by === 'cost') throw new Error('frame.size.by is cost, and no profile set in the kit gives a price per metre: size by mass');
  return { profiles, groups, limits: out, by: o.by ?? 'mass' };
}

/**
 * The frame's sizing: frameModelOf's frame, its beams grouped, each group given the lightest profile from the list that
 * meets the frame's limits. Null where the assembly has no frame to solve. Refused by name: frame.size as sizeOption
 * refuses it, a group naming no beam of the frame or a beam twice, a profile set that does not exist or has no modulus.
 * @param {object} s a built assembly @param {{ placeItems: Function, jointValues: Function, mul: Function }} helpers
 * @param {object} [given] frame.size in place of the assembly's own
 * @returns {null | { ok: boolean, rows: object[], limits: object[], total: number, drawn: number, tried: number, search: string, sized: object, fm: object }}
 */
export function frameSizing(s, helpers, given) {
  const opt = given ?? sizeOption(s) ?? sizeOption({ ...s, a: { ...s.a, frame: { ...s.a.frame, size: {} } } });
  const fm = frameModelOf(s, helpers);
  if (!fm || fm.empty) return null;
  // the groups: named ones, then the rest by direction, profile and length
  const groups = {}, taken = new Map();
  for (const [g, list] of Object.entries(opt.groups)) {
    for (const id of list) {
      if (!fm.beams.has(id)) throw new Error(`frame.size.groups.${g}: ${id} is not a beam of the frame (its beams: ${[...fm.beams.keys()].join(', ')})`);
      if (taken.has(id)) throw new Error(`frame.size.groups: ${id} is in ${taken.get(id)} and in ${g}: a beam takes one profile`);
      taken.set(id, g);
    }
    groups[g] = list;
  }
  const near = FRAME_SIZING.match.value, auto = [];
  for (const b of fm.beams.values()) {
    if (taken.has(b.id)) continue;
    const mate = auto.find((x) => x.profile === b.m.profile.name && Math.abs(x.L - b.L) <= near && Math.abs(Math.abs(x.u[0] * b.u[0] + x.u[1] * b.u[1] + x.u[2] * b.u[2]) - 1) < 1e-6);
    if (mate) mate.ids.push(b.id); else auto.push({ profile: b.m.profile.name, L: b.L, u: b.u, ids: [b.id] });
  }
  for (const x of auto) groups[x.ids.join(', ')] = x.ids;
  // the choices, from the workspace's sets before the kit's
  const context = framesContext(), choices = [];
  for (const name of opt.profiles) {
    let m;
    try { m = profileModel(name, {}, givenFor(context, name)); } catch (e) { throw new Error(`frame.size.profiles: ${String(e.message).replace(/^profileModel: /, '')}`); }
    try { choices.push(...profileChoices(m)); } catch (e) { throw new Error(`frame.size.profiles: ${String(e.message).replace(/^profileChoices: /, '')}`); }
  }
  // the limits: the frame checks' own, or the assembly's in their place
  const margin = FRAME_CHECK.margin.value, deflection = [], limitRows = [];
  const limitOf = (b, own) => (opt.limits.deflection != null ? { value: opt.limits.deflection, from: 'frame.size.limits.deflection' } : own ? { value: own.value, from: own.from }
    : s.a.frame?.limit != null ? { value: s.num(s.a.frame.limit), from: 'frame.limit' } : s.task?.accuracy != null ? { value: s.task.accuracy, from: 'the task\'s accuracy' }
      : { value: b.L / FRAME_CHECK.sag.value, from: `${b.id}'s span over ${FRAME_CHECK.sag.value} (frame.sag)` });
  for (const l of fm.loads) {
    const b = l.beam ?? l.mount.beam, lim = limitOf(b);
    // a load that moves with a joint is held to its limit wherever along the beam it is; a still one at its node
    if (l.beam || !l.mount.mover) { const n = fm.nodeAt(b, l.beam ? l.z : fm.mountStation(l.mount, fm.cases[0].values)); deflection.push({ node: n, limit: lim.value, along: fm.down }); limitRows.push({ limit: 'deflection', where: n, what: l.where, value: lim.value, from: lim.from }); }
    else { deflection.push({ member: b.id, limit: lim.value, along: fm.down }); limitRows.push({ limit: 'deflection', where: b.id, what: `${l.where}, anywhere it moves`, value: lim.value, from: lim.from }); }
  }
  for (const p of fm.points) { const n = fm.nodeAt(p.beam, p.z), lim = limitOf(p.beam); deflection.push({ node: n, limit: lim.value, along: fm.down }); limitRows.push({ limit: 'deflection', where: n, what: p.where, value: lim.value, from: lim.from }); }
  for (const g of fm.guides) {
    const lim = limitOf(g.beam, g.tolerance ? { value: g.tolerance.value, from: `the rail's own parallelism (${g.tolerance.note ?? g.tolerance.term})` } : null);
    deflection.push({ member: g.beam.id, from: g.from, to: g.to, limit: lim.value, along: fm.down });
    limitRows.push({ limit: 'deflection', where: g.beam.id, what: `under guide ${g.id}`, value: lim.value, from: lim.from });
  }
  const stress = opt.limits.stress ?? margin, factor = opt.limits.buckling ?? margin;
  limitRows.push({ limit: 'stress', where: 'each beam', value: stress, from: opt.limits.stress != null ? 'frame.size.limits.stress' : 'frame.margin' });
  limitRows.push({ limit: 'buckling', where: 'the frame and each grouped beam (Euler, K 1)', value: factor, from: opt.limits.buckling != null ? 'frame.size.limits.buckling' : 'frame.margin' });
  const moves = excitesOf(s).filter((x) => x.kind === 'move'), Hz = opt.limits.frequency ?? (moves.length ? Math.max(...moves.map((x) => x.Hz)) * margin : null);
  if (Hz != null) limitRows.push({ limit: 'frequency', where: 'the frame', value: Hz, from: opt.limits.frequency != null ? 'frame.size.limits.frequency' : `twice the task's moves (frame.frequency)` });
  const limits = { ...(deflection.length ? { deflection } : {}), stress: { margin: stress }, buckling: { factor, euler: FRAME_CHECK.euler.value }, ...(Hz != null ? { frequency: { Hz } } : {}) };
  // every beam's alloy carries its strength, so the beams outside the groups are held to it too
  const withStrength = (model) => ({ ...model, materials: Object.fromEntries(Object.entries(model.materials).map(([k, v]) => [k, fm.beams.get(k)?.strength ? { ...v, strength: fm.beams.get(k).strength } : v])) });
  const cases = fm.cases.map((c) => ({ label: c.label, loads: fm.nodeLoads(c.values), inertia: fm.nodeMasses(c.values) }));
  const sized = sizing([withStrength(fm.model), withStrength(fm.rigid)], { groups, choices, limits, cases, by: opt.by });
  const byName = new Map(choices.map((c) => [c.name, c]));
  const rows = sized.groups.map((g) => {
    const c = byName.get(g.choice), drawn = [...new Set(g.members.map((id) => fm.beams.get(id).m.profile.name.replace(/^profile-/, '')))];
    const drawnKg = g.members.reduce((t, id) => t + fm.beams.get(id).grams / 1000, 0);
    return { group: g.name, beams: g.members, profile: c.profile, roll: c.roll, choice: g.choice, drawn, length: r3(g.length), kg: r3(g.mass), drawnKg: r3(drawnKg), lighter: g.lighter,
      governs: g.governs ? { limit: g.governs.limit, where: g.governs.where, value: r3(g.governs.value), allowed: r3(g.governs.allowed), case: g.governs.case, lighter: g.governs.lighter, broken: r3(g.governs.broken) } : null, margin: g.margin == null ? null : r3(g.margin) };
  });
  const drawn = [...fm.beams.values()].filter((b) => sized.groups.some((g) => g.members.includes(b.id))).reduce((t, b) => t + b.grams / 1000, 0);
  return { ok: sized.ok, rows, limits: limitRows, total: r3(sized.total), drawn: r3(drawn), tried: sized.tried, search: sized.search, worst: sized.worst, sized, fm };
}

// a limit's figure in words: what a lighter profile does there
const unitOf = { deflection: 'mm', stress: 'MPa', buckling: 'x', frequency: 'Hz' };
const sayLimit = (g) => {
  if (!g) return 'the lightest in the list';
  const u = unitOf[g.limit], what = g.limit === 'deflection' ? `the sag at ${g.where}` : g.limit === 'stress' ? `the stress in ${g.where}` : g.limit === 'buckling' ? (g.where === 'frame' ? 'the frame\'s buckling factor' : `${g.where.replace(' (Euler)', '')}'s Euler margin`) : 'the lowest mode';
  return `${g.limit}: with ${g.lighter}, ${what} breaks its limit ${n3(g.broken, 2)} times over`;
};

/**
 * The sizing as a table, one line a group. @param {object} r frameSizing's @returns {string[]}
 */
export function sizingText(r) {
  const lines = [`${r.ok ? 'sized' : 'no profile in the list meets every limit; nearest'}: ${n3(r.total, 3)} kg of grouped beams (drawn ${n3(r.drawn, 3)} kg), ${r.tried} designs solved (${r.search === 'every' ? 'every design ranked by mass' : 'by steps'})`];
  lines.push('group | profile | kg | set by | margin');
  for (const x of r.rows) lines.push(`${x.group} | ${x.choice}${x.drawn.length === 1 && x.drawn[0] === x.choice ? '' : ` (drawn ${x.drawn.join(', ')})`} | ${n3(x.kg, 3)} | ${sayLimit(x.governs)} | ${x.margin == null ? '-' : `${n3(x.margin, 2)}x`}`);
  lines.push(`limits: ${r.limits.map((l) => `${l.limit} ${l.limit === 'deflection' ? `${n3(l.value, 3)} mm at ${l.what ?? l.where}` : l.limit === 'frequency' ? `${n3(l.value, 1)} Hz` : `${n3(l.value, 2)}x`} (${l.from})`).join('; ')}`);
  return lines;
}

/**
 * frame.size as a finding: info with the table where every limit is met, warn where none of the profiles meets them.
 * @param {object} s @param {Function} f the findings' sink @param {object} helpers
 */
export function sizeChecks(s, f, helpers) {
  if (s.a.frame?.size == null) return;
  let r;
  try { r = frameSizing(s, helpers); } catch (e) { f('fail', `frame.size: ${e.message}`, 'frame.size: refused', { code: 'frame.size' }); return; }
  if (!r) return;
  const text = r.rows.map((x) => `${x.group}: ${x.choice}, ${n3(x.kg, 3)} kg, ${x.governs ? `set by ${sayLimit(x.governs)}, ${n3(x.margin, 2)} times inside it as chosen` : 'the lightest in the list'}`).join('; ');
  f(r.ok ? 'info' : 'warn', `${r.ok ? 'sized' : `no profile in the list meets every limit: the nearest breaks ${r.worst.limit} at ${r.worst.where} ${n3(r.worst.ratio, 2)} times over`}: ${text}. ${n3(r.total, 3)} kg of grouped beams against ${n3(r.drawn, 3)} kg drawn (cad frame --size --write writes the profiles in)`, r.ok ? null : 'frame.size: not met',
    { code: 'frame.size', values: { kg: r.total, drawn: r.drawn, tried: r.tried }, refs: { groups: r.rows, limits: r.limits, search: r.search } });
}

/**
 * The assembly with the sizing's profiles written in: each grouped beam's profile (and a quarter roll where it was
 * turned), and each printed end fitting on it drawn for the new profile. A generated frame is written out expanded,
 * as cad frame --expand does, as its generator takes one profile. Beams keep their lines, so a deeper profile stands
 * about its middle: check its joins and ends after.
 * @param {object} raw the assembly as read @param {object} expanded the assembly as built (generated frames expanded) @param {object} r frameSizing's
 * @returns {object}
 */
export function writeSizing(raw, expanded, r) {
  const out = structuredClone(raw.frame?.kind != null ? expanded : raw), by = new Map();
  for (const x of r.rows) for (const id of x.beams) by.set(id, x);
  for (const it of out.items ?? []) {
    const x = by.get(it.id);
    if (x && it.beam) {
      it.beam = { ...it.beam, profile: x.profile };
      if (x.roll) it.roll = ((typeof it.roll === 'number' ? it.roll : 0) + x.roll) % 360;
    }
    const on = typeof it.at === 'string' ? by.get(it.at.split('.')[0]) : null;
    if (on && it.fitting?.profile) it.fitting = { ...it.fitting, profile: on.profile };
  }
  return out;
}

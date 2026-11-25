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
import { sizing, frame as solveFrame } from '@rulecad/fea/frame';
import { profileModel, profileChoices, beamModel, boughtFittingModel, JOINS } from '@rulecad/frames';
import { fixingModel } from '@rulecad/fixings';
import { frameModelOf, FRAME_CHECK, excitesOf, rackOf, sideways, freeSaid } from './framecheck.mjs';
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
const LIMIT_KEYS = ['deflection', 'stress', 'buckling', 'frequency', 'rack'];

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
  if (typeof limits !== 'object' || Array.isArray(limits)) throw new Error(`frame.size.limits is { "deflection": mm, "stress": margin, "buckling": factor, "frequency": Hz, "rack": mm } (got ${shown(o.limits)})`);
  for (const k of Object.keys(limits)) if (!LIMIT_KEYS.includes(k)) throw new Error(`frame.size.limits has no "${k}": it takes deflection (mm), stress (a margin), buckling (a factor), frequency (Hz) and rack (the sway allowed at the top, mm)`);
  const out = {};
  for (const [k, v] of Object.entries(limits)) { const x = s.num(v); if (!(x > 0)) throw new Error(`frame.size.limits.${k} is above 0 (got ${shown(v)})`); out[k] = x; }
  if (o.by != null && !['mass', 'cost'].includes(o.by)) throw new Error(`frame.size.by is mass or cost (got ${shown(o.by)})`);
  if (o.by === 'cost') throw new Error('frame.size.by is cost, and no profile set in the kit gives a price per metre: size by mass');
  return { profiles, groups, limits: out, by: o.by ?? 'mass' };
}

// The world direction a beam's face looks, from its section's normal: x across its width, y up its height, turned by roll
const faceAxes = (b, roll) => { const X = [b.W[0], b.W[4], b.W[8]], Y = [b.W[1], b.W[5], b.W[9]], c = Math.cos((roll * Math.PI) / 180), sn = Math.sin((roll * Math.PI) / 180); return { X: X.map((v, k) => c * v + sn * Y[k]), Y: Y.map((v, k) => c * v - sn * X[k]) }; };
const looks = (ax, n) => ax.X.map((v, k) => v * n[0] + ax.Y[k] * n[1]);

/**
 * Whether a join still goes together when its beams take other profiles: a's end on b's face where the drawn join
 * meets it (the face of b's new profile that looks the same way in the world). A blind join needs a bore in a's end and
 * a slot in b's face whose opening passes the screw (the bore's thread) and holds its button head under the lips, the
 * head no wider than the slot's cavity; an end-tap join a bore in a's end and, where b's far face has a slot, a cap
 * head wider than its opening. A bought fitting must fit both profiles (its set's fitting.fit). A printed fitting is
 * drawn for the profiles it joins, so it goes with any; a join whose fitting comes later is not held to one. Null where
 * it fits, else why not. @param {object} x a frame join (frameModelOf's joins) @param {{ model: object, roll: number }} pa a's profile as sized
 * @param {{ model: object, roll: number }} pb b's @param {object} given the workspace's sets
 * @returns {string | null}
 */
export function joinFit(x, pa, pb, given) {
  const kind = x.j.kind, A = pa.model, Bm = pb.model, name = (m) => m.name.replace(/^profile-/, '');
  if (x.j.fitting && x.j.fitting !== 'printed' && JOINS[kind]?.bought) {
    let fm;
    try { fm = boughtFittingModel(x.j.fitting, { given, profile: Bm, other: A, join: kind }); } catch (e) { return String(e.message).replace(/^\w+: /, ''); }
    const bad = fm.findings.find((f) => f.code === 'fitting.fit' && f.level === 'fail');
    return bad ? `${x.j.fitting} does not fit ${name(A)} to ${name(Bm)}: ${bad.text}` : null;
  }
  if (!['blind', 'end-tap'].includes(kind)) return null;
  const e = String(x.j.end ?? 'a')[0], bores = A.bores ?? [];
  if (!bores.length) return `${name(A)} has no bore in its ends to tap, and a ${kind} join screws into one`;
  // b's face where the join meets it, in the world, and the place of the new profile that looks that way
  const drawn = x.B.m.places.find((q) => q.name === x.j.model.b.place);
  if (!drawn) return null;
  const n = looks(faceAxes(x.B, 0), drawn.normal), B = beamModel(Bm, { length: x.B.L }), ax = faceAxes(x.B, pb.roll);
  const place = B.places.filter((q) => { const w = looks(ax, q.normal); return w[0] * n[0] + w[1] * n[1] + w[2] * n[2] > 0.99; })[0];
  const thread = bores[0].thread;
  if (!thread) return `${name(A)}'s bores name no thread`;
  const head = (form) => { try { return fixingModel(`${thread} ${form}`); } catch { return null; } };
  if (kind === 'blind') {
    if (!place?.slot) return `${name(Bm)}'s face there is closed, and a blind join's head sits in a slot`;
    const sl = Bm.slots[place.slot], fx = head('button');
    if (!sl || !fx) return null;
    if (fx.major > sl.opening) return `${a(thread)} ${thread} screw (${name(A)}'s bore) does not pass ${name(Bm)}'s ${sl.opening} mm slot opening`;
    if (fx.head.across <= sl.opening) return `${a(thread)} ${thread} button head, ${fx.head.across} mm across, pulls through ${name(Bm)}'s ${sl.opening} mm slot opening`;
    if (fx.head.across > sl.cavityWidth) return `${a(thread)} ${thread} button head, ${fx.head.across} mm across, does not go into ${name(Bm)}'s slot, ${sl.cavityWidth} mm wide under its lips`;
    return null;
  }
  // end-tap: the screw through b, its cap head on b's far face
  const far = place ? B.places.find((q) => Math.abs(q.normal[0] + place.normal[0]) < 1e-9 && Math.abs(q.normal[1] + place.normal[1]) < 1e-9) : null, fx = head('cap');
  if (far?.slot && fx && Bm.slots[far.slot] && fx.head.across <= Bm.slots[far.slot].opening) return `${a(thread)} ${thread} cap head, ${fx.head.across} mm across, falls through ${name(Bm)}'s ${Bm.slots[far.slot].opening} mm slot opening on its far face`;
  return null;
}
const a = () => 'an'; // (a metric thread's name is said em: an M5, an M3)

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
  const context = framesContext(), choices = [], models = new Map(), modelOf = (name) => { if (!models.has(name)) models.set(name, profileModel(name, {}, givenFor(context, name))); return models.get(name); };
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
  // racking, where the assembly asks it of the frame (frame.rack) or of its sizing (limits.rack): each way across, the
  // side push alone at the top, with no weight, held to the sway allowed at each top node; a way nothing holds the
  // frame (one plane on pinned feet) cannot be sized against, and is said
  const rackCases = [];
  const rk = s.a.frame?.rack != null || opt.limits.rack != null ? rackOf(s, fm) : null;
  if (rk) {
    const lim = opt.limits.rack != null ? { value: opt.limits.rack, from: 'frame.size.limits.rack' } : rk.lim, drawnFrame = solveFrame(fm.model);
    for (const { dir, name } of sideways(fm.down)) {
      const label = `racked ${name}`, loads = rk.top.map((n) => ({ node: n, force: dir.map((v) => (v * rk.F) / rk.top.length) }));
      try { drawnFrame.statics({ loads, gravity: [0, 0, 0] }); } catch (e) {
        if (e.code !== 'fea.frame.mechanism' || !e.driven) throw e;
        limitRows.push({ limit: 'rack', where: name, what: `not sized: nothing holds the frame ${name}, ${freeSaid(fm, (drawnFrame.mechanisms ?? []).filter((m) => e.loose.some((l) => l.node === m.node && l.freedom === m.freedom)))}; a brace or fixed feet, not a profile, holds it`, value: null, from: rk.loadFrom });
        continue;
      }
      rackCases.push({ label, loads, gravity: [0, 0, 0], limits: ['deflection'] });
      for (const n of rk.top) deflection.push({ node: n, limit: lim.value, along: dir, cases: [label] });
      limitRows.push({ limit: 'deflection', where: rk.top.join(', '), what: `the top, ${label} by ${n3(rk.F, 1)} N (${rk.loadFrom})`, value: lim.value, from: lim.from });
    }
    // the sag limits hold in the poses, not under the push
    if (rackCases.length) for (const d of deflection) if (!d.cases) d.cases = fm.cases.map((c) => c.label);
  }
  const limits = { ...(deflection.length ? { deflection } : {}), stress: { margin: stress }, buckling: { factor, euler: FRAME_CHECK.euler.value }, ...(Hz != null ? { frequency: { Hz } } : {}) };
  // every beam's alloy carries its strength, so the beams outside the groups are held to it too
  const withStrength = (model) => ({ ...model, materials: Object.fromEntries(Object.entries(model.materials).map(([k, v]) => [k, fm.beams.get(k)?.strength ? { ...v, strength: fm.beams.get(k).strength } : v])) });
  const cases = [...fm.cases.map((c) => ({ label: c.label, loads: fm.nodeLoads(c.values, null, c.push, c.stall), inertia: fm.nodeMasses(c.values) })), ...rackCases];
  const byName = new Map(choices.map((c) => [c.name, c]));
  // every join a group's beam makes must go together with the profiles chosen (joinFit): a design where one does not is
  // never solved, and a lighter choice that breaks one is what set the group. A join as drawn is not asked again
  const groupOf = new Map(Object.entries(groups).flatMap(([g, ids]) => ids.map((id) => [id, g]))), sets = { sets: context?.sets ?? {} }, fitMemo = new Map();
  const asSized = (b, design) => { const g = groupOf.get(b.id), c = g ? byName.get(design[g]) : null; return c ? { name: c.profile, roll: c.roll ?? 0 } : { name: b.m.profile.name, roll: 0, drawn: true }; };
  const pairs = fm.joins.filter((x) => fm.beams.has(x.A.id) && fm.beams.has(x.B.id) && (groupOf.has(x.A.id) || groupOf.has(x.B.id)));
  const fits = (design) => {
    const out = [];
    for (const x of pairs) {
      const pa = asSized(x.A, design), pb = asSized(x.B, design);
      if (pa.drawn && pb.drawn) continue;
      const key = `${x.j.index}|${pa.name}|${pa.roll}|${pb.name}|${pb.roll}`;
      if (!fitMemo.has(key)) fitMemo.set(key, joinFit(x, { model: modelOf(pa.name), roll: pa.roll }, { model: modelOf(pb.name), roll: pb.roll }, sets));
      const why = fitMemo.get(key);
      if (why) out.push({ where: x.j.label, why });
    }
    return out;
  };
  const sized = sizing([withStrength(fm.model), withStrength(fm.rigid)], { groups, choices, limits, cases, by: opt.by, ...(pairs.length ? { fits } : {}) });
  const rows = sized.groups.map((g) => {
    const c = byName.get(g.choice), drawn = [...new Set(g.members.map((id) => fm.beams.get(id).m.profile.name.replace(/^profile-/, '')))];
    const drawnKg = g.members.reduce((t, id) => t + fm.beams.get(id).grams / 1000, 0);
    return { group: g.name, beams: g.members, profile: c.profile, roll: c.roll, choice: g.choice, drawn, length: r3(g.length), kg: r3(g.mass), drawnKg: r3(drawnKg), lighter: g.lighter,
      governs: g.governs ? (g.governs.limit === 'fit' ? { limit: 'fit', where: g.governs.where, why: g.governs.why, lighter: g.governs.lighter, broken: null } : { limit: g.governs.limit, where: g.governs.where, value: r3(g.governs.value), allowed: r3(g.governs.allowed), case: g.governs.case, lighter: g.governs.lighter, broken: r3(g.governs.broken) }) : null, margin: g.margin == null ? null : r3(g.margin) };
  });
  const drawn = [...fm.beams.values()].filter((b) => sized.groups.some((g) => g.members.includes(b.id))).reduce((t, b) => t + b.grams / 1000, 0);
  return { ok: sized.ok, rows, limits: limitRows, total: r3(sized.total), drawn: r3(drawn), tried: sized.tried, search: sized.search, worst: sized.worst, sized, fm };
}

// a limit's figure in words: what a lighter profile does there
const unitOf = { deflection: 'mm', stress: 'MPa', buckling: 'x', frequency: 'Hz' };
const sayLimit = (g) => {
  if (!g) return 'the lightest in the list';
  if (g.limit === 'fit') return `a join: with ${g.lighter}, ${g.where} does not go together (${g.why})`;
  if (g.limit === 'deflection' && /^racked /.test(g.case ?? '')) return `racking: with ${g.lighter}, the sway at ${g.where} ${g.case.replace(/^racked /, '')} breaks its limit ${n3(g.broken, 2)} times over`;
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
  lines.push(`limits: ${r.limits.map((l) => `${l.limit} ${l.limit === 'rack' ? `${l.where}: ${l.what}` : l.limit === 'deflection' ? `${n3(l.value, 3)} mm at ${l.what ?? l.where}` : l.limit === 'frequency' ? `${n3(l.value, 1)} Hz` : `${n3(l.value, 2)}x`} (${l.from})`).join('; ')}`);
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
  const text = r.rows.map((x) => `${x.group}: ${x.choice}, ${n3(x.kg, 3)} kg, ${x.governs ? `set by ${sayLimit(x.governs)}, ${n3(x.margin, 2)} times inside ${x.governs.limit === 'fit' ? 'its nearest limit' : 'it'} as chosen` : 'the lightest in the list'}`).join('; ');
  const broke = r.worst && /^racked /.test(r.worst.case ?? '') ? `racking (${r.worst.case}) at ${r.worst.where}` : `${r.worst?.limit} at ${r.worst?.where}`;
  f(r.ok ? 'info' : 'warn', `${r.ok ? 'sized' : `no profile in the list meets every limit: the nearest breaks ${broke} ${n3(r.worst.ratio, 2)} times over`}: ${text}. ${n3(r.total, 3)} kg of grouped beams against ${n3(r.drawn, 3)} kg drawn (cad frame --size --write writes the profiles in)`, r.ok ? null : 'frame.size: not met',
    { code: 'frame.size', values: { kg: r.total, drawn: r.drawn, tried: r.tried }, refs: { groups: r.rows, limits: r.limits, search: r.search } });
}

/**
 * The assembly with the sizing's profiles written in: each grouped beam's profile (and a quarter roll where it was
 * turned), and each printed end fitting on it drawn for the new profile. Each beam keeps its line (its axis), so a
 * deeper profile stands about its middle; where a beam's end butts against another's face and that face moves with
 * the other's new size, the end moves with it (the beam's length follows). A generated frame's rings keep their outer faces (a table's top
 * stays level with its legs' tops); a drawn beam whose new size would stand past the end of the beam it meets moves
 * along that beam by as much, if the move fits at its other end, and otherwise nothing is written (refused by name). A blind or end-tap join whose end now
 * has several bores (a 20 x 40) becomes one join a bore, each at its own place on the beam it meets. A generated frame
 * is written out expanded, as cad frame --expand does, as its generator takes one profile.
 * @param {object} raw the assembly as read @param {object} expanded the generated frame expanded (expandFrame's) @param {object} r frameSizing's
 * @returns {object}
 */
export function writeSizing(raw, expanded, r) {
  const out = structuredClone(raw.frame?.kind != null ? expanded : raw), by = new Map(), context = framesContext();
  for (const x of r.rows) for (const id of x.beams) by.set(id, x);
  const models = new Map(), modelOf = (name) => { if (!models.has(name)) models.set(name, profileModel(name, {}, givenFor(context, name))); return models.get(name); };
  // each beam's section axes in the world, as drawn and as written: x across its width, y up its height, u along it
  const axes = (b, roll) => { const X = [b.W[0], b.W[4], b.W[8]], Y = [b.W[1], b.W[5], b.W[9]], c = Math.cos(roll * Math.PI / 180), sn = Math.sin(roll * Math.PI / 180); return { X: X.map((v, k) => c * v + sn * Y[k]), Y: Y.map((v, k) => c * v - sn * X[k]), u: b.u }; };
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const was = (id) => { const b = r.fm.beams.get(id); return { b, profile: modelOf(b.m.profile.name), ax: axes(b, 0) }; };
  const now = (id) => { const x = by.get(id), w = was(id); return x ? { b: w.b, profile: modelOf(x.profile), ax: axes(w.b, x.roll) } : w; };
  const half = (q, dir) => (Math.abs(dot(dir, q.ax.X)) * q.profile.width + Math.abs(dot(dir, q.ax.Y)) * q.profile.height) / 2;
  const items = new Map((out.items ?? []).map((it) => [it.id, it])), numeric = (it) => Array.isArray(it?.from) && Array.isArray(it?.to) && [...it.from, ...it.to].every((v) => typeof v === 'number');
  // a generated frame's rings keep their outer faces: the top ring its top (a table's top stays flat and level with its
  // legs' tops), the bottom ring of a box its bottom, the rings between their middles; a drawn frame keeps every line
  const lift = new Map();
  if (raw.frame?.kind != null) {
    const up = r.fm.down.map((v) => -v), flat = [...by.keys()].map((id) => r.fm.beams.get(id)).filter((b) => Math.abs(dot(b.u, up)) < 1e-6);
    const height = (b) => dot(b.A, up), all = [...r.fm.beams.values()].filter((b) => Math.abs(dot(b.u, up)) < 1e-6).map(height), top = Math.max(...all), low = Math.min(...all);
    for (const b of flat) {
      const side = Math.abs(height(b) - top) < 1e-6 ? 1 : Math.abs(height(b) - low) < 1e-6 && !['table', 'portal'].includes(raw.frame.kind) ? -1 : 0;
      if (!side) continue;
      const d = side * (half(was(b.id), up) - half(now(b.id), up));
      if (Math.abs(d) > 1e-9) lift.set(b.id, up.map((v) => v * d));
    }
  }
  // a beam whose end meets another's face keeps its line, unless its new size would stand past that beam's end (a
  // rail flush with its legs' tops, now deeper): then it moves across its length, along the beam it meets, by as much,
  // so its face there stays where it was. The move must fit at every end it has (its other end's beam), else it stays
  // and the guard below refuses
  for (const id of by.keys()) {
    if (lift.has(id) || !numeric(items.get(id))) continue;
    const b = r.fm.beams.get(id), ends = new Map();
    for (const j of out.joins ?? []) {
      const ma = /^([\w-]+)\.([ab])(?:\.\d+)?$/.exec(String(j.a ?? '')), mb = /^([\w-]+)\.[a-z]+(?:\.\d+)?@/.exec(String(j.b ?? ''));
      if (!ma || ma[1] !== id || !mb || !r.fm.beams.has(mb[1]) || mb[1] === id) continue;
      // where this end's line meets the other beam, along it, and how far the beam stands each way of it, as drawn and as sized
      const post = r.fm.beams.get(mb[1]), P = ma[2] === 'a' ? b.A : b.A.map((v, k) => v + b.u[k] * b.L), at = dot(P.map((v, k) => v - post.A[k]), post.u);
      const hw = half(was(id), post.u), hn = half(now(id), post.u);
      ends.set(`${ma[2]} ${mb[1]}`, { post, at, hn, lo: Math.min(0, at - hw), hi: Math.max(post.L, at + hw) });
    }
    const fits = (e, d) => e.at + d + e.hn <= e.hi + 1e-6 && e.at + d - e.hn >= e.lo - 1e-6;
    const need = [...ends.values()].find((e) => !fits(e, 0));
    if (!need) continue;
    const d = need.at + need.hn > need.hi ? need.hi - (need.at + need.hn) : need.lo - (need.at - need.hn), v = need.post.u.map((x) => x * d);
    if ([...ends.values()].every((e) => fits(e, dot(v, e.post.u)))) lift.set(id, v);
  }
  for (const [id, v] of lift) { const it = items.get(id); if (numeric(it)) { it.from = it.from.map((x, k) => r3(x + v[k])); it.to = it.to.map((x, k) => r3(x + v[k])); } else lift.delete(id); }
  for (const j of out.joins ?? []) {
    const ma = /^([\w-]+)\./.exec(String(j.a ?? '')), mb = /^([\w-]+)\.([a-z]+(?:\.\d+)?)@(-?[\d.]+)$/.exec(String(j.b ?? ''));
    if (ma && mb && lift.has(ma[1]) && r.fm.beams.has(mb[1])) j.b = `${mb[1]}.${mb[2]}@${r3(Number(mb[3]) + dot(lift.get(ma[1]), r.fm.beams.get(mb[1]).u))}`;
  }
  // ends against faces: each moves as the face it meets moves
  for (const j of out.joins ?? []) {
    const ma = /^([\w-]+)\.([ab])(\.\d+)?$/.exec(String(j.a ?? '')), mb = /^([\w-]+)\.[a-z]+(\.\d+)?@/.exec(String(j.b ?? ''));
    if (!ma || !mb || !r.fm.beams.has(ma[1]) || !r.fm.beams.has(mb[1]) || !by.has(mb[1])) continue;
    const it = items.get(ma[1]);
    if (!numeric(it)) continue;
    const a = r.fm.beams.get(ma[1]), out_ = ma[2] === 'a' ? a.u.map((v) => -v) : a.u, shift = half(was(mb[1]), out_) - half(now(mb[1]), out_);
    if (Math.abs(shift) < 1e-9 || it._moved?.[ma[2]]) continue;
    const key = ma[2] === 'a' ? 'from' : 'to';
    it[key] = it[key].map((v, k) => r3(v + out_[k] * shift));
    (it._moved ??= {})[ma[2]] = true;
  }
  for (const it of out.items ?? []) {
    delete it._moved;
    const x = by.get(it.id);
    if (x && it.beam) {
      it.beam = { ...it.beam, profile: x.profile };
      if (x.roll) it.roll = ((typeof it.roll === 'number' ? it.roll : 0) + x.roll) % 360;
    }
    const on = typeof it.at === 'string' ? by.get(it.at.split('.')[0]) : null;
    if (on && it.fitting?.profile) it.fitting = { ...it.fitting, profile: on.profile };
  }
  // a blind or end-tap join at an end that now has several bores: one join a bore, each where its bore meets the face
  if (out.joins) out.joins = out.joins.flatMap((j) => {
    const ma = /^([\w-]+)\.([ab])$/.exec(String(j.a ?? '')), mb = /^([\w-]+)\.([a-z]+(?:\.\d+)?)@(-?[\d.]+)$/.exec(String(j.b ?? ''));
    if (!ma || !mb || !['blind', 'end-tap'].includes(j.kind) || !by.has(ma[1]) || !r.fm.beams.has(mb[1])) return [j];
    const q = now(ma[1]), bores = q.profile.bores;
    if (bores.length < 2) return [j];
    const post = r.fm.beams.get(mb[1]);
    return bores.map((bo, k) => { const o = q.ax.X.map((v, c) => v * bo.at[0] + q.ax.Y[c] * bo.at[1]); return { ...j, a: `${ma[1]}.${ma[2]}.${k + 1}`, b: `${mb[1]}.${mb[2]}@${r3(Number(mb[3]) + dot(o, post.u))}` }; });
  });
  // nothing is written that would not build: every join's place on the beam it meets lies on that beam
  for (const j of out.joins ?? []) {
    const mb = /^([\w-]+)\.[a-z]+(?:\.\d+)?@(-?[\d.]+)$/.exec(String(j.b ?? ''));
    if (!mb || !r.fm.beams.has(mb[1])) continue;
    const it = items.get(mb[1]), L = numeric(it) ? Math.hypot(...it.to.map((v, k) => v - it.from[k])) : r.fm.beams.get(mb[1]).L, s = Number(mb[2]), at = mb[2].startsWith('-') ? L + s : s;
    if (at < -1e-6 || at > L + 1e-6) throw new Error(`the sized profiles do not fit as drawn, so nothing is written: join ${j.a} would meet ${mb[1]} at ${n3(at)} mm, past its ${n3(L)} mm (a deeper beam there stands past the end of the one it meets, and its ends do not agree on a move); give that group a profile no deeper (frame.size.groups and profiles), or move the beam by hand`);
  }
  return out;
}

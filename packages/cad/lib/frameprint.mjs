// Printed beams in a frame: which beams of a frame could be printed in a plastic, and the beam coupon's predictions.
//
// beam.printable. With "frame": { "printed": "petg" } (or { material, walls, infill }), each beam of the solved frame
// is tried printed in that plastic: the kit's printable profile of its size (profile-2020-printed for a 20 mm square
// beam), lying down (spliced where it is longer than the bed, its strength then PRINTED_DEFAULTS.splice_share of the
// whole beam's) and standing up where it fits the printer's height, its section and modulus those printing gives it
// (@rulecad/frames printedOf: walls and infill, the plastic's figures for its pose, or the beam coupon's where
// measured). The frame is solved again with that one beam printed, every other beam as it is, and the printed beam is
// held to the limits the frame's own checks use: every sag (each load's point, each named point, each guide and the
// beam along its length) against its limit; its stress against its plastic's strength with twice the margin; Euler's
// load with twice the margin; its sustained stress against the creep limit (beam.creep); its sag as it creeps (the
// frame solved again with the beam's modulus at PRINTED_DEFAULTS.creep_modulus of it) against the same limits; and
// where the task's moves excite the frame, its lowest mode at twice their rate. A sag the frame as drawn already misses
// (frame.deflection fails there in the beams' own material) is no fault of printing: there the printed beam is held to
// the drawn frame's own sag, within DRAWN_SLACK of it (the kit's choice), so it fails only where printing it makes that
// sag worse, and the findings name each such point. Each is a margin, 1 where it just
// holds; the least is the beam's. Those that pass alone are then printed together and solved once more, and any that
// fail together are put back to the beam's own material, the one that misses most first. Every figure rests on the
// printed section's estimates (walls, infill, creep) until the beam coupon is measured, and on the joins' springs as
// they are (estimates made for metal beams): each finding says so.
//
// beam.coupon. A printed beam held only by two supports of "frame": { "supports" } with a mass on it is the beam
// coupon: its sag under the mass, and the mass it breaks at, are predictions cad measured takes (<beam>.sag=<mm>,
// <beam>.break=<kg>), and the figure measured goes to the plastic's set: the modulus a printed beam bends at
// (beam_modulus, or beam_modulus_z for one printed standing up) and the stress it breaks at (beam_strength, _z).
// Units: mm, N, N·mm, MPa, kg.
import { frame as solveFrame, subdivide } from '@rulecad/fea/frame';
import { PRINTED_SERIES, PRINTED_DEFAULTS, JOINS, beamCreep, printerFigures } from '@rulecad/frames';
import { beamOf } from './beams.mjs';

const G = 9.80665;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const n3 = (x, d = 3) => String(+Number(x).toFixed(d)), r3 = (x) => (x == null || !Number.isFinite(x) ? null : +Number(x).toFixed(3)), r4 = (p) => p.map((x) => +Number(x).toFixed(3));
const fig = (x) => String(+Number(x).toPrecision(3));
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const PRINT_KEYS = ['material', 'walls', 'infill', 'pose'];
const DRAWN_SLACK = 0.02; // a printed beam may add 2% to a sag the frame as drawn already misses (the kit's choice, so that a beam far from it is not blamed for it)
const said = { deflection: 'its sag', stress: 'its stress', buckling: 'buckling', creep: 'its sustained stress (creep)', creepSag: 'its sag as it creeps', frequency: 'its lowest mode' };

/**
 * The frame's "printed" option held to its shape: the plastic every beam is tried in, by name ("petg"), or
 * { material, walls, infill, pose }. Undefined passes (the check is not asked for). Refused by name.
 * @param {any} x @returns {{ material: string, walls?: number, infill?: number, pose?: 'lying' | 'standing' } | null}
 */
export function printedOption(x) {
  if (x == null) return null;
  const o = typeof x === 'string' ? { material: x } : x;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`frame.printed is the plastic each beam is tried printed in, "petg", or { "material": "petg", "walls": 3, "infill": 0.4, "pose": "lying" } (got ${shown(x)})`);
  for (const k of Object.keys(o)) if (!PRINT_KEYS.includes(k)) throw new Error(`frame.printed has no "${k}": it takes ${PRINT_KEYS.join(', ')}`);
  if (typeof o.material !== 'string' || !o.material) throw new Error(`frame.printed.material names a plastic's set, such as pla or petg (got ${shown(o.material)})`);
  if (o.pose != null && !['lying', 'standing'].includes(o.pose)) throw new Error(`frame.printed.pose is lying or standing, or left out to try both (got ${shown(o.pose)})`);
  return o;
}

// each element's start along its beam, as sagAlong reads it
function stamp(fm, model, res) {
  for (const e of res.elements) if (e.of != null) { const b = fm.beams.get(e.of), el = model.elements.find((q) => q.id === e.id); e._from = dot(sub(fm.nodes[el.a], b.A), b.u); }
  return res;
}

// A beam of the frame as a printed one in a pose: its model from the printable profile of its size (or itself, where
// it is printed already), and the figures the solve takes. Null with why where it cannot be.
function candidate(b, opts, pose, cache) {
  let pm, profile;
  if (b.m.printed) { if (pose !== b.m.printed.pose) return null; pm = b.m; profile = b.m.profile.name; }
  else {
    const w = b.m.profile.width, h = b.m.profile.height;
    if (!(Math.abs(w - h) < 1e-6 && PRINTED_SERIES[w])) return { why: `${b.id} is a ${fig(w)} x ${fig(h)} mm section, and the kit prints square ones of ${Object.keys(PRINTED_SERIES).join(', ')} mm (profile-2020-printed and its like)` };
    profile = `profile-${w}${w}-printed`;
    const printed = { pose, ...(opts.walls != null ? { walls: opts.walls } : {}), ...(opts.infill != null ? { infill: opts.infill } : {}) };
    const key = `${profile}|${n3(b.L)}|${pose}`;
    if (!cache.has(key)) cache.set(key, beamOf({ id: b.id, beam: { profile, length: b.L, material: opts.material, printed } }, (x) => x).model);
    pm = cache.get(key);
  }
  const P = printerFigures('frame.printed', null), bed = pm.printed.bed, height = P.n('bed');
  if (pose === 'standing' && b.L > height + 1e-9) return null;
  const spliced = pose === 'lying' && b.L > bed + 1e-9, F = pm.figures, E = pm.material.modulus, nu = pm.profile.material?.poisson ?? 0.36;
  const share = spliced ? PRINTED_DEFAULTS.splice_share.value : 1, A = F.area.value;
  return { b, pm, pose, spliced, profile, E, strength: pm.printed.strength * share, creepLimit: pm.printed.creep.limit * share, grams: pm.mass,
    section: { A, Iy: F.inertiaX.value, Iz: F.inertiaY.value, J: F.torsion.value, Wy: F.modulusX.value, Wz: F.modulusY.value },
    material: { E, G: E / (2 * (1 + nu)), density: pm.mass > 0 ? (pm.mass / 1000 / b.L) / (A * 1e-6) : 0 } };
}

// The frame's model with these beams printed (and their modulus times k, for creep)
const swapped = (base, cands, k = 1) => ({ ...base, sections: { ...base.sections, ...Object.fromEntries(cands.map((c) => [c.b.id, c.section])) },
  materials: { ...base.materials, ...Object.fromEntries(cands.map((c) => [c.b.id, { ...c.material, E: c.material.E * k, G: c.material.G * k }])) } });

// a beam's own sag along its length, as a target
const alongOf = (b, ctx) => ({ what: `${b.id} along its length`, beam: b, from: 0, to: b.L, limit: ctx.limitFor(b, null) });

// The frame as drawn (no beam printed): its sag at every target, and each beam along its length, in every case, keyed
// "what|case". Where one is past its limit the frame already misses it, printed or not.
function drawnSags(fm, ctx, targets) {
  const solver = solveFrame(fm.model), out = new Map(), all = [...targets, ...[...fm.beams.values()].map((b) => alongOf(b, ctx))];
  for (const cs of fm.cases) {
    const res = stamp(fm, fm.model, solver.statics({ loads: fm.nodeLoads(cs.values) }));
    for (const t of all) out.set(`${t.what}|${cs.label}`, t.node ? ctx.sagAt(res, t.node(cs.values), fm.down) : ctx.sagAlong(res, t.beam, t.from, t.to, fm.down).sag);
  }
  const missed = [];
  for (const t of all) { let worst = 0; for (const cs of fm.cases) worst = Math.max(worst, out.get(`${t.what}|${cs.label}`)); if (worst > t.limit.value + 1e-12) missed.push({ what: t.what, sag: worst, limit: t.limit }); }
  return { sags: out, missed };
}

/**
 * Every margin of a frame with these beams printed, each 1 where it just holds: the sags against their limits (and
 * each printed beam along its length), as it creeps too; per printed beam its stress, Euler's load and its sustained
 * stress; and the lowest mode against the task's moves.
 */
function evaluate(s, fm, ctx, cands, targets, drawn) {
  const down = fm.down, margin = ctx.margin, model = swapped(fm.model, cands), creepK = PRINTED_DEFAULTS.creep_modulus.value, creep = swapped(fm.model, cands, creepK);
  const solver = solveFrame(model), creeper = solveFrame(creep);
  const all = [...targets, ...cands.map((c) => alongOf(c.b, ctx))];
  const sagOf = (t, res, values) => (t.node ? ctx.sagAt(res, t.node(values), down) : ctx.sagAlong(res, t.beam, t.from, t.to, down).sag);
  let def = null, creepSag = null;
  const per = new Map(cands.map((c) => [c.b.id, { stress: 0, compression: 0, case: null }]));
  for (const cs of fm.cases) {
    const loads = fm.nodeLoads(cs.values), res = stamp(fm, model, solver.statics({ loads })), cr = stamp(fm, creep, creeper.statics({ loads }));
    for (const t of all) {
      // where the frame as drawn already misses this sag, the printed beam is held to the drawn frame's own figure
      const base = drawn.get(`${t.what}|${cs.label}`) ?? 0, missed = base > t.limit.value + 1e-12, lim = missed ? base * (1 + DRAWN_SLACK) : t.limit.value;
      const sag = sagOf(t, res, cs.values), long = sagOf(t, cr, cs.values), m = sag > 1e-12 ? lim / sag : Infinity, ml = long > 1e-12 ? lim / long : Infinity;
      if (!def || m < def.margin) def = { margin: m, sag, limit: t.limit, what: t.what, case: cs.label, drawn: missed ? base : null };
      if (!creepSag || ml < creepSag.margin) creepSag = { margin: ml, sag: long, limit: t.limit, what: t.what, case: cs.label, drawn: missed ? base : null };
    }
    for (const e of res.elements) { const p = per.get(e.of); if (!p) continue; if (e.stress && e.stress.peak > p.stress) { p.stress = e.stress.peak; p.case = cs.label; } if (e.axial < -p.compression) p.compression = -e.axial; }
  }
  let freq = null;
  const moves = ctx.excitesOf(s).filter((x) => x.kind === 'move');
  if (moves.length) {
    const need = Math.max(...moves.map((x) => x.Hz)) * margin;
    for (const cs of fm.cases) { const low = solveFrame(subdivide({ ...model, masses: fm.nodeMasses(cs.values) }, 4)).modes({ count: 1 }).frequencies[0]; if (!freq || low < freq.low) freq = { low, need, margin: low / need, case: cs.label }; }
  }
  const out = new Map();
  for (const c of cands) {
    const p = per.get(c.b.id), I = Math.min(c.section.Iy, c.section.Iz), Pcr = (Math.PI ** 2 * c.E * I) / c.b.L ** 2;
    const m = { deflection: def?.margin ?? Infinity, creepSag: creepSag?.margin ?? Infinity, stress: p.stress > 0 ? c.strength / p.stress / margin : Infinity,
      buckling: p.compression > 1e-9 ? Pcr / p.compression / margin : Infinity, creep: p.stress > 0 ? c.creepLimit / p.stress : Infinity, ...(freq ? { frequency: freq.margin } : {}) };
    const governs = Object.entries(m).reduce((q, x) => (x[1] < q[1] ? x : q));
    out.set(c.b.id, { c, margins: m, least: governs[1], governs: governs[0], stress: p.stress, compression: p.compression, euler: Pcr, def, creepSag, freq });
  }
  return out;
}

// The joins on a beam a printed one would not take as drawn: a blind, end-tap or anchor join screws into its end, and a
// printed beam has inserts there, no bore to tap or pocket; a join whose screw heads or nuts ride in a slot of the beam's
// face needs that face slotted, and a printable profile has one slot, on top
const INTO_END = ['blind', 'end-tap', 'anchor'];
function joinsToChange(fm, b) {
  const out = [];
  for (const x of fm.joins) {
    const kind = x.j.kind;
    if (x.A === b && INTO_END.includes(kind)) out.push({ join: x.j.index, label: x.j.label, why: `${x.j.label} screws into its end ${x.e}, where a printed beam has an insert, no bore to tap or pocket` });
    else if (x.B === b && JOINS[kind]?.slot && String(x.j.address ?? '').split(/[.@]/)[0] !== 'top') out.push({ join: x.j.index, label: x.j.label, why: `${x.j.label} lands on its ${String(x.j.address).split(/[.@]/)[0]} face, which a printed beam has closed` });
  }
  return out;
}

// what a margin is, in a few words
function sayMargin(r, k) {
  const m = r.margins[k], x = (v) => (v === Infinity ? 'free' : `${n3(v, 2)}`);
  // where the frame as drawn already misses the limit: the figure held to is its own sag plus DRAWN_SLACK
  const held = (d) => `${fig(d.drawn * (1 + DRAWN_SLACK))} mm, the frame as drawn (${fig(d.drawn)} mm, already past its ${fig(d.limit.value)} mm there, printed or not) and ${DRAWN_SLACK * 100}% more`;
  const sagSaid = (d) => (d.drawn != null ? fig(d.sag) : n3(d.sag));
  if (k === 'deflection') return `${x(m)} on sag (${sagSaid(r.def)} mm at ${r.def.what} against ${r.def.drawn != null ? held(r.def) : `${n3(r.def.limit.value)} mm, ${r.def.limit.from}`})`;
  if (k === 'creepSag') return `${x(m)} on sag as it creeps (${sagSaid(r.creepSag)} mm at ${r.creepSag.what}${r.creepSag.drawn != null ? ` against ${held(r.creepSag)}` : ''})`;
  if (k === 'stress') return `${x(m)} on stress (${n3(r.stress, 2)} MPa against ${n3(r.c.strength, 1)} MPa${r.c.spliced ? ' as spliced' : ''}, twice the margin wanted)`;
  if (k === 'buckling') return `${x(m)} on buckling (${n3(r.compression, 1)} N against Euler's ${n3(r.euler, 0)} N, twice wanted)`;
  if (k === 'creep') return `${x(m)} on creep (${n3(r.stress, 2)} MPa held against ${n3(r.c.creepLimit, 2)} MPa)`;
  return `${x(m)} on its lowest mode (${n3(r.freq.low, 1)} Hz against ${n3(r.freq.need, 1)} Hz, twice the task's moves)`;
}

/**
 * beam.printable across a frame: each beam tried printed in the plastic frame.printed names, its margins against the
 * frame's limits, the list of those that can be printed, and those printed together solved once more.
 * @param {object} s a built assembly @param {object} fm frameModelOf's @param {Function} f the findings' sink @param {object} ctx frameChecks' helpers
 */
export function printableCheck(s, fm, f, ctx) {
  const opts = printedOption(s.a.frame.printed), down = fm.down;
  const targets = [
    ...fm.loads.map((l) => { const b = l.beam ?? l.mount.beam; return { what: l.where, node: (values) => fm.nodeAt(b, l.beam ? l.z : fm.mountStation(l.mount, values)), limit: ctx.limitFor(b, null) }; }),
    ...fm.points.map((p) => ({ what: p.where, node: () => fm.nodeAt(p.beam, p.z), limit: ctx.limitFor(p.beam, null) })),
    ...fm.guides.map((g) => ({ what: `guide ${g.id}`, beam: g.beam, from: g.from, to: g.to, limit: g.tolerance ? { value: g.tolerance.value, from: 'the rail\'s own parallelism' } : ctx.limitFor(g.beam, null) })),
  ];
  const rests = `the printed section's walls and infill, its plastic's figures and the creep shares (estimates until the beam coupon is measured)${fm.joins.length ? `, and ${ctx.restsJoins} as they are, made for metal beams` : ''}`;
  const best = new Map(), none = [], cache = new Map(), drawn = drawnSags(fm, ctx, targets);
  for (const b of fm.beams.values()) {
    let pick = null, why = null;
    for (const pose of opts.pose ? [opts.pose] : ['lying', 'standing']) {
      const c = candidate(b, opts, pose, cache);
      if (!c) continue;
      if (c.why) { why = c.why; break; }
      const r = evaluate(s, fm, ctx, [c], targets, drawn.sags).get(b.id);
      if (!pick || r.least > pick.least * 1.01) pick = r; // (lying down, its stronger way, unless standing is clearly better)
    }
    if (!pick) { none.push({ b, why: why ?? `${b.id} prints neither way` }); continue; }
    best.set(b.id, pick);
  }
  const plastic = opts.material.toUpperCase(), poseSaid = (c) => (c.pose === 'lying' ? `lying down${c.spliced ? `, spliced (${n3(c.b.L, 1)} mm, longer than the bed)` : ''}` : 'standing up');
  for (const { b, why } of none) f('info', `${b.id} stays ${b.alloy ?? 'as it is'}: ${why}`, null, { code: 'beam.printable', between: [r4(b.A), r4(add(b.A, scale(b.u, b.L)))], refs: { beam: b.id, material: opts.material, printable: false } });
  for (const r of best.values()) {
    const c = r.c, b = c.b, ok = r.least >= 1, order = Object.keys(r.margins).filter((k) => r.margins[k] !== Infinity).sort((p, q) => r.margins[p] - r.margins[q]);
    const change = b.m.printed ? [] : joinsToChange(fm, b), joinsSaid = change.length ? `. Its joins as drawn need changing to print it: ${change.map((x) => x.why).join('; ')}. A bracket or a gusset on its top slot takes it, its spring then a printed fitting's` : '';
    r.change = change;
    const text = ok
      ? `${b.id} can be printed in ${plastic}, ${poseSaid(c)} (${c.profile}, ${n3(c.grams, 1)} g): its least margin is ${n3(r.least, 2)} times, ${said[r.governs]}. ${order.map((k) => sayMargin(r, k)).join('; ')}${joinsSaid}. It rests on ${rests}`
      : `${b.id} needs ${b.alloy ?? 'its own material'}: printed in ${plastic}, ${poseSaid(c)} (${c.profile}), it misses by ${n3(1 / r.least, 2)} times on ${said[r.governs]}. ${order.map((k) => sayMargin(r, k)).join('; ')}. It rests on ${rests}`;
    f(ok ? 'pass' : 'info', text, null, { code: 'beam.printable', at: r4(add(b.A, scale(b.u, b.L / 2))), between: [r4(b.A), r4(add(b.A, scale(b.u, b.L)))],
      values: { margin: r3(r.least), misses: ok ? null : r3(1 / r.least), grams: r3(c.grams), modulus: c.E, strength: r3(c.strength), margins: Object.fromEntries(Object.entries(r.margins).map(([k, v]) => [k, r3(v)])), sag: r3(r.def?.sag), limit: r3(r.def?.limit.value), creepSag: r3(r.creepSag?.sag), drawnSag: r.def?.drawn != null ? +r.def.drawn.toPrecision(3) : null },
      refs: { beam: b.id, material: opts.material, printable: ok, pose: c.pose, spliced: c.spliced, profile: c.profile, governs: r.governs, alloy: b.alloy, joins: change.map((x) => x.join), restsOn: 'estimate' } });
  }
  // those that pass alone, printed together: put back the one that misses most until all of them hold
  let together = [...best.values()].filter((r) => r.least >= 1).map((r) => r.c), back = [], least = null;
  while (together.length) {
    const rs = evaluate(s, fm, ctx, together, targets, drawn.sags), worst = [...rs.values()].reduce((p, q) => (q.least < p.least ? q : p));
    if (worst.least >= 1) { least = worst; break; }
    back.push(worst.c.b.id); together = together.filter((c) => c !== worst.c);
  }
  const all = fm.beams.size, metal = [...fm.beams.keys()].filter((id) => !together.some((c) => c.b.id === id));
  const changes = [...new Set(together.flatMap((c) => best.get(c.b.id).change ?? []).map((x) => x.join))];
  const changeSaid = changes.length ? `. ${changes.length} of its joins need changing to a bracket or a gusset on a printed beam's top slot (each beam's finding says which)` : '';
  const text = together.length === all
    ? `every beam of the frame can be printed in ${plastic} (${all}), printed together and solved once more: the least margin is ${sayMargin(least, least.governs)}${['deflection', 'creepSag', 'frequency'].includes(least.governs) ? '' : ` at ${least.c.b.id}`}; ${n3(together.reduce((t, c) => t + c.grams, 0), 0)} g of ${plastic} in all`
    : `${together.length} of the frame's ${all} beams can be printed in ${plastic}${together.length ? ` (${together.map((c) => c.b.id).join(', ')}), printed together and solved once more, the least margin ${sayMargin(least, least.governs)}` : ''}; ${metal.join(', ')} stay${metal.length === 1 ? 's' : ''} as ${metal.length === 1 ? 'it is' : 'they are'}${back.length ? `, of them ${back.join(', ')} passing alone but not printed with the rest` : ''}`;
  const missedSaid = drawn.missed.length ? `. As drawn, unprinted, the frame already misses ${drawn.missed.map((x) => `${fig(x.sag)} mm at ${x.what} (against ${fig(x.limit.value)} mm)`).join(', ')} (frame.deflection says so): there a printed beam is held to the frame as drawn, within ${DRAWN_SLACK * 100}%, and blamed only where printing it makes that sag worse` : '';
  f(together.length === all ? 'pass' : 'info', `${text}${changeSaid}${missedSaid}. It rests on ${rests}`, null, { code: 'beam.printable', values: { printable: together.length, beams: all, margin: r3(least?.least), grams: r3(together.reduce((t, c) => t + c.grams, 0)) },
    refs: { material: opts.material, printable: together.map((c) => c.b.id), metal, back, governs: least?.governs ?? null, joins: changes, missed: drawn.missed.map((x) => x.what), poses: Object.fromEntries(together.map((c) => [c.b.id, c.pose])), restsOn: 'estimate' } });
}

/**
 * beam.coupon, and beam.creep for each printed beam of the frame. A printed beam held only by two of frame.supports
 * (no join on it) with masses on it is the beam coupon: its sag under each mass and the mass it breaks at are
 * predictions cad measured takes, written to its plastic's set as the modulus and strength a printed beam has.
 * @param {object} s a built assembly @param {object} fm frameModelOf's @param {Function} f the findings' sink @param {object} ctx frameChecks' helpers
 */
export function couponChecks(s, fm, f, ctx) {
  const drawn = ctx.results[0];
  for (const b of fm.beams.values()) {
    const p = b.m.printed;
    if (!p) continue;
    // beam.creep: its peak stress as drawn and in every pose, held for months
    let stress = 0, where = null;
    for (const r of ctx.results) for (const e of r.spring.elements) if (e.of === b.id && e.stress && e.stress.peak > stress) { stress = e.stress.peak; where = r.case.label; }
    const c = beamCreep(b.m, { stress: r3(stress) });
    f(c.level, `${b.id}: ${c.text.replace(/^[^:]+: /, '')}${fm.cases.length > 1 ? `, worst ${where}` : ''}`, c.level === 'fail' ? `${b.id}: creeps` : null, { code: 'beam.creep', at: r4(add(b.A, scale(b.u, b.L / 2))), values: c.values, refs: { ...c.refs, beam: b.id } });
    // the coupon: two supports on it alone, no join, a mass on it
    const sups = fm.supports.filter((x) => x.beam === b), loads = fm.loads.filter((l) => l.beam === b);
    if (sups.length !== 2 || !sups.every((x) => x.said) || fm.joins.some((x) => x.A === b || x.B === b) || !loads.length) continue;
    const mat = b.m.material.name, lying = p.pose === 'lying', z = lying ? '' : '_z', E = p.modulus, S = p.strength;
    const solver = solveFrame(fm.model), peak = (res) => Math.max(0, ...res.elements.filter((e) => e.of === b.id && e.stress).map((e) => e.stress.peak));
    const self = peak(solver.statics({ loads: [] }));
    for (const l of loads) {
      const one = fm.nodeLoads(drawn.case.values, l), res = solver.statics({ loads: one, gravity: [0, 0, 0] }), node = one[0].node, sag = ctx.sagAt(res, node, fm.down), perKg = peak(res) / l.kg;
      const breaks = (S - self) / perKg, span = Math.abs(sups[0].z - sups[1].z);
      const rests = `${mat}'s ${lying ? 'modulus along its layers' : 'modulus across its layers'} ${E} MPa${p.coupon?.modulus ? ` (${p.coupon.modulus}, ${p.modulusKind})` : ' (the plastic\'s data sheet: an estimate for a printed beam)'} and its printed section, ${n3(p.section.inertiaX, 0)} mm⁴ from ${p.walls} walls and ${Math.round(p.infill * 100)}% infill (an estimate)`;
      f('info', `${b.id} is the beam coupon, printed ${lying ? 'lying down' : 'standing up'}, across ${n3(span, 1)} mm between ${sups.map((x) => x.where).join(' and ')}: ${n3(l.kg, 3)} kg at ${l.where} sags it ${n3(sag)} mm, from ${rests}. Read it with a dial and write it back: cad measured ${s.project}/${s.name} ${b.id}.sag=<mm>, and the modulus goes to ${mat}.beam_modulus${z}`, null,
        { code: 'beam.coupon', at: r4(fm.nodes[node]), values: { sag: r3(sag), kg: l.kg, span: r3(span), modulus: E, inertia: p.section.inertiaX },
          predict: { name: `${b.id}.sag`, figure: `sag of the beam coupon ${b.id} under ${l.kg} kg`, value: r3(sag), unit: 'mm', coupon: { rule: `${mat}.beam_modulus${z}`, kind: 'modulus', base: E, sag, unit: 'MPa', what: `${n3(l.kg, 3)} kg at ${l.where}, across ${n3(span, 1)} mm` } },
          refs: { beam: b.id, rule: `${mat}.beam_modulus${z}`, pose: p.pose, kind: p.modulusKind } });
      f('info', `${b.id}, the beam coupon: it breaks at about ${n3(breaks, 2)} kg hung at ${l.where}, where its stress reaches ${S} MPa (${p.coupon?.strength ? `${p.coupon.strength}, measured` : `${mat}'s strength ${lying ? 'along' : 'across'} its layers, ${p.strengthKind}`}). Last of all, pull it down there until it breaks (a luggage scale on the cord, its peak in kg), and write that: cad measured ${s.project}/${s.name} ${b.id}.break=<kg>, and the strength goes to ${mat}.beam_strength${z}`, null,
        { code: 'beam.coupon', at: r4(fm.nodes[node]), values: { breaks: r3(breaks), strength: S, perKg: r3(perKg), self: r3(self) },
          predict: { name: `${b.id}.break`, figure: `mass the beam coupon ${b.id} breaks at`, value: r3(breaks), unit: 'kg', coupon: { rule: `${mat}.beam_strength${z}`, kind: 'strength', base: S, perKg, self, unit: 'MPa', what: `hung at ${l.where}, across ${n3(span, 1)} mm` } },
          refs: { beam: b.id, rule: `${mat}.beam_strength${z}`, pose: p.pose, kind: p.strengthKind } });
    }
  }
}

/**
 * The figure a coupon's measurement gives, for cad measured: the modulus from a sag (the solve is linear in it, so the
 * modulus is the one taken times the sag predicted over the sag measured), the strength from the mass it broke at (its
 * stress then: its own weight's, plus the stress per kilogram times the mass).
 * @param {{ kind: 'modulus' | 'strength', base: number, sag?: number, perKg?: number, self?: number }} c a beam.coupon prediction's coupon
 * @param {number} predicted @param {number} measured
 */
export function couponFigure(c, predicted, measured) {
  return Number((c.kind === 'modulus' ? (c.base * (c.sag ?? predicted)) / measured : c.self + c.perKg * measured).toPrecision(4));
}

// Joins in assemblies (@rulecad/frames' joinModel): "joins": [{ "kind": "blind", "a": "y1.a", "b": "x1.back@120",
// "fitting", "screw", "note" }]. A join names an end of one beam item (a) and a place on another (b), and says how they
// are held. Before the items are built, each join puts its operations on both beams (a tap in a's end, an access hole
// or a clearance hole across b) and its screws into "fasten", so the screws are followed, checked and counted as any
// fasten's are. Once built, the checks: join.geometry (the end meets the face square and flush, where the join says,
// on a slot where the kind needs one), join.end (every beam end is joined or capped), join.stiffness (each join's
// spring for a frame's solve, an estimate that says so), and join.fitting (a kind whose fitting comes later).
import { JOINS, JOIN_SCALE, joinModel } from '@rulecad/frames';
import { placeItems } from '@rulecad/model-link';
import { beamOf, beamPlace, framesContext } from './beams.mjs';
import { joinFitting, fittedStiffness } from './fittings.mjs';

const KEYS = ['kind', 'a', 'b', 'fitting', 'screw', 'brace', 'load', 'nut', 'note'];
const shown = (v) => (v === undefined ? 'nothing' : JSON.stringify(v));
const mm = (x) => String(+Number(x).toFixed(2)), r3 = (x) => +x.toFixed(3);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The working figures of the join checks, each with what it rests on. */
export const JOIN_CHECK = {
  flush: { value: 0.05, unit: 'mm', rule: 'An end meets a face flush when it stands off it, or runs into it, by no more than this: far under a cut\'s tolerance, so a gap a person can see is a failure', kind: 'default', source: 'A working figure of @rulecad/cad, the same as fasten\'s holes on one axis', checked: '2026-11-16' },
  place: { value: 0.05, unit: 'mm', rule: 'An end is where its join says, on the face, when its centre is within this of the address', kind: 'default', source: 'A working figure of @rulecad/cad', checked: '2026-11-16' },
  square: { value: 0.5, unit: '°', rule: 'An end meets a face square when its axis is within this of the face\'s normal: a beam cut square to ±0.5 mm across 20 mm is about 1.4° out, so this holds the drawing, not the saw', kind: 'default', source: 'A working figure of @rulecad/cad', checked: '2026-11-16' },
};

// "y1.a" into its item and the rest
const split = (n) => { const s = String(n).trim(), i = s.indexOf('.'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
const sameAt = (p, q) => String(p).trim().replace(/\.1$/, '') === String(q).trim().replace(/\.1$/, '');

/**
 * An assembly's joins worked out before its items are built: each join's operations added to its beams' ops, and its
 * screws added to "fasten" (each marked with its join). Refused by name: a join that is not { kind, a, b }, an end or
 * a place on an item that is not a beam, a join of a beam to itself, and what joinModel refuses.
 * @param {object} a the assembly as read @param {(x: any) => number} num its expressions
 * @returns {{ a: object, joins: object[] }} the assembly with the joins' operations and screws in, and each join worked out
 */
export function expandJoins(a, num, context = framesContext(), material = 'pla') {
  const list = a.joins;
  if (list == null) return { a, joins: [] };
  if (!Array.isArray(list)) throw new Error(`joins is a list: [{ "kind": "blind", "a": "y1.a", "b": "x1.back@120" }] (got ${shown(list)})`);
  if (!list.length) return { a, joins: [] };
  const given = { sets: context?.sets ?? {} }; // (a bought fitting of the workspace's own, beside the kit's)
  const items = a.items || [], beams = new Map(items.filter((it) => it.beam).map((it) => [it.id, it])), models = new Map();
  const modelOf = (id) => { if (!models.has(id)) models.set(id, beamOf(beams.get(id), num, context).model); return models.get(id); };
  const extra = new Map(), fasten = [], joins = [], first = (a.fasten || []).length, added = [], ids = new Set(items.map((it) => it.id));
  list.forEach((j, i) => {
    const what = `join ${i + 1}`;
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(`${what} is { "kind", "a", "b" } (got ${shown(j)})`);
    for (const k of Object.keys(j)) if (!KEYS.includes(k)) throw new Error(`${what}: a join has no "${k}": it takes ${KEYS.join(', ')}`);
    if (!JOINS[j.kind]) throw new Error(`${what}: kind is one of ${Object.keys(JOINS).join(', ')} (got ${shown(j.kind)})`);
    const ends = {};
    for (const side of ['a', 'b']) {
      if (typeof j[side] !== 'string' || !j[side].includes('.')) throw new Error(`${what}: ${side} is ${side === 'a' ? 'a beam\'s end, as y1.a' : 'a place on a beam, as x1.back@120 (or an end, x1.b)'} (got ${shown(j[side])})`);
      const [id, rest] = split(j[side]);
      if (!beams.has(id)) throw new Error(`${what}: ${side} is on a beam item of this assembly, and ${id} is ${items.some((it) => it.id === id) ? 'not a beam' : 'not an item'} (beams: ${[...beams.keys()].join(', ') || 'none'})`);
      ends[side] = { id, rest };
    }
    if (ends.a.id === ends.b.id) throw new Error(`${what}: a and b are on one beam, ${ends.a.id}: a join is between two beams`);
    const mitre = j.kind === 'mitre' ? mitreOf(what, beams.get(ends.a.id), ends.a.rest, beams.get(ends.b.id), ends.b.rest, num) : null;
    let m;
    try { m = joinModel(j.kind, { beam: modelOf(ends.a.id), end: ends.a.rest }, { beam: modelOf(ends.b.id), address: ends.b.rest }, { ...(j.screw != null ? { screw: j.screw } : {}), ...(j.fitting != null ? { fitting: j.fitting } : {}), ...(mitre ? { mitre } : {}), given }); }
    catch (e) { throw new Error(`${what}: ${String(e.message).replace(/^(joinModel|beamAnchor): /, '')}`); }
    for (const [side, ops] of [['a', m.a.ops], ['b', m.b.ops]]) { const id = ends[side].id; if (ops.length) extra.set(id, [...(extra.get(id) || []), ...ops]); }
    const label = j.note || `${j.kind} join of ${j.a} to ${j.b}`, mine = [];
    for (const k of ['brace', 'load', 'nut']) if (j[k] != null && !(m.fitting?.printed && j.fitting === 'printed')) throw new Error(`${what}: ${k} is for a printed fitting: give "fitting": "printed" on a ${Object.keys(JOINS).filter((x) => JOINS[x].printed).join(', ')} join, or leave ${k} out`);
    // a printed fitting: its item, placed from where the beams are, and a fasten for each leg into its beam's slot
    let fitted = null;
    if (m.fitting?.printed && j.fitting === 'printed') {
      fitted = joinFitting(j, i, { ia: beams.get(ends.a.id), ib: beams.get(ends.b.id), A: modelOf(ends.a.id), B: modelOf(ends.b.id), m, ends, place: beamPlace }, num, context, material, ids);
      added.push(fitted.item);
      for (const x of fitted.fasten) { mine.push(first + fasten.length); fasten.push(x); }
      m.stiffness = fittedStiffness(m.stiffness, fitted.model);
    } else if (m.fitting?.bought && m.fitting.fits) {
      // a bought one: its set's item placed the same way, its screws into the set's nuts (an inner or anchor connector's
      // are part of it), its stiffness its set's (joinModel's)
      fitted = joinFitting(j, i, { ia: beams.get(ends.a.id), ib: beams.get(ends.b.id), A: modelOf(ends.a.id), B: modelOf(ends.b.id), m, ends, place: beamPlace }, num, context, material, ids);
      added.push(fitted.item);
      for (const x of fitted.fasten) { mine.push(first + fasten.length); fasten.push(x); }
    }
    // the head: inside b's slot under its lips (blind), or on the lips of the slot across b (end-tap), or on a plain face
    const lips = j.kind === 'blind' ? { item: ends.b.id, slot: m.b.slot, inside: true } : m.b.across?.slot ? { item: ends.b.id, slot: m.b.across.slot, inside: false } : null;
    for (const sc of m.screws) { mine.push(first + fasten.length); fasten.push({ screw: sc.screw, through: [ends.b.id], into: ends.a.id, at: [`${ends.a.id}.${sc.bore}`], note: label, join: i, ...(lips ? { lips } : {}) }); }
    joins.push({ index: i, kind: j.kind, a: j.a, b: j.b, items: [ends.a.id, ends.b.id], end: ends.a.rest, address: ends.b.rest, label, fitting: j.fitting ?? null, model: m, fasten: mine, ...(fitted ? { fitted: { item: fitted.item.id, model: fitted.model } } : {}) });
  });
  // each beam's own ops first; a join's op where the beam has none like it at that place (a tap at a and at a.1 are one)
  const withOps = items.map((it) => {
    const add = extra.get(it.id);
    if (!add) return it;
    const own = it.beam.ops || [], ops = [...own];
    for (const op of add) if (!ops.some((g) => g?.op === op.op && (sameAt(g.at, op.at) || (op.op === 'tap' && String(g.at).trim()[0] === op.at[0])))) ops.push(op);
    return { ...it, beam: { ...it.beam, ops } };
  });
  return { a: { ...a, items: [...withOps, ...added], ...(fasten.length ? { fasten: [...(a.fasten || []), ...fasten] } : {}) }, joins };
}

// A mitre's cuts from where the two beams are: the angle from square that halves the corner, the face each sees the
// corner on, and the outside of the corner, where each beam's length is measured. Both beams placed by their ends.
function mitreOf(what, ia, ea, ib, eb, num) {
  const fa = beamPlace(ia, num), fb = beamPlace(ib, num);
  if (!fa || !fb) throw new Error(`${what}: a mitre join is cut from where the beams meet: place ${!fa ? ia.id : ib.id} by its ends (from, to)`);
  if (!/^[ab]$/.test(ea)) throw new Error(`${what}: a mitre join cuts a whole end: a is ${ia.id}.a or ${ia.id}.b (got ${ia.id}.${ea})`);
  const col = (f, k) => [f[k], f[4 + k], f[8 + k]], body = (f, e) => col(f, 2).map((c) => (e === 'a' ? c : -c)); // (along the beam, away from the corner)
  const da = body(fa, ea), db = body(fb, eb), n = cross(da, db), nl = Math.hypot(...n), phi = (Math.acos(Math.max(-1, Math.min(1, dot(da, db)))) * 180) / Math.PI;
  if (nl < 1e-9) throw new Error(`${what}: ${ia.id} and ${ib.id} lie along one line, so there is no corner to mitre: a splice joins them end to end`);
  const side = (f, other) => {
    const back = col(f, 0), top = col(f, 1), u = n.map((c) => c / nl);
    if (Math.abs(Math.abs(dot(u, top)) - 1) < 1e-6) return { about: 'top', long: dot(back, other) > 0 ? 'front' : 'back' };
    if (Math.abs(Math.abs(dot(u, back)) - 1) < 1e-6) return { about: 'back', long: dot(top, other) > 0 ? 'bottom' : 'top' };
    return null;
  };
  const a = side(fa, db), b = side(fb, da);
  if (!a || !b) throw new Error(`${what}: the corner of ${ia.id} and ${ib.id} lies across ${!a ? ia.id : ib.id}'s faces, not square to one: turn it with roll so a face lies in the corner's plane`);
  return { angle: +(90 - phi / 2).toFixed(6), a, b };
}

// What a join's spring rests on, in words: the joint rig's measurement and its date, or an estimate until it is measured
function restsOn(k) {
  const b = k.measured?.bending, t = k.measured?.twist;
  if (b && t) return `measured on the joint rig on ${b}${t !== b ? ` (twist on ${t})` : ''}`;
  if (b) return `bending measured on the joint rig on ${b}; twist an estimate until the rig measures it`;
  if (t) return `twist measured on the joint rig on ${t}; bending an estimate until the rig measures it`;
  return 'an estimate, until the joint rig (issue 264) measures it';
}

/** The ends of each beam item a join or an item placed at it covers: Set of "x1.a". */
function covered(s) {
  const out = new Set();
  for (const j of s.joins) {
    out.add(`${j.items[0]}.${j.end[0]}`);
    if (/^[ab]$/.test(j.address)) out.add(`${j.items[1]}.${j.address}`);
  }
  for (const it of s.a.items || []) if (typeof it.at === 'string') { const m = /^([\w-]+)\.([ab])(\.|$)/.exec(it.at.trim()); if (m) out.add(`${m[1]}.${m[2]}`); }
  return out;
}

/**
 * A built assembly's join findings: join.geometry for each join, its model's own findings (join.fitting), join.stiffness
 * for each, and join.end over the beams. @param {object} s a built assembly @param {Function} f the findings' sink
 */
export function joinChecks(s, f) {
  if (!s.joins?.length) return;
  const worlds = placeItems(s.motion, s.jointValues);
  const ids = s.motion.items.map((x) => x[0]);
  const world = (n, what) => {
    const { item, frame: r } = s.motion.address(n, what), W = worlds[item];
    const pt = (p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
    const dir = (v) => [0, 1, 2].map((k) => W[4 * k] * v[0] + W[4 * k + 1] * v[1] + W[4 * k + 2] * v[2]);
    return { at: pt([r[3], r[7], r[11]]), axis: dir([r[2], r[6], r[10]]), ref: dir([r[0], r[4], r[8]]) };
  };
  const { flush, place, square } = Object.fromEntries(Object.entries(JOIN_CHECK).map(([k, v]) => [k, v.value]));
  for (const j of s.joins) {
    const m = j.model, [ai, bi] = j.items, refs = { join: j.index, kind: j.kind, a: j.a, b: j.b };
    for (const x of m.findings) f(x.level, `${j.label}: ${x.text.startsWith(`${m.says}: `) ? x.text.slice(m.says.length + 2) : x.text}`, x.level === 'fail' || x.level === 'warn' ? `${j.label}: ${x.code.split('.')[1]}` : null, { code: x.code, refs: { ...refs, ...x.refs } });
    // where it meets: from the bore the screw goes in where there is one, else the end's centre
    const A = world(`${ai}.${m.a.bores[0] ?? j.end[0]}`, `join ${j.index + 1}`), B = world(`${bi}.${j.address}`, `join ${j.index + 1}`);
    if (m.b.end == null) {
      const n = B.axis, gap = dot(sub(A.at, B.at), n), off = sub(sub(A.at, B.at), n.map((c) => c * gap)), along = dot(off, B.ref), aside = Math.hypot(...off.map((c, k) => c - B.ref[k] * along));
      const angle = (Math.acos(Math.max(-1, Math.min(1, -dot(A.axis, n)))) * 180) / Math.PI, wrong = [];
      const values = { gap: r3(gap), along: r3(along), across: r3(aside), angle: +angle.toFixed(2) };
      const face = `${bi}'s ${m.b.place} face`, end = `${ai}'s end ${j.end}`;
      if (Math.abs(gap) > flush) wrong.push(gap > 0 ? `${end} stands ${mm(gap)} mm off ${face}: a gap of ${mm(gap)} mm, where it meets flush. Move ${ai} ${mm(gap)} mm toward ${bi}` : `${end} runs ${mm(-gap)} mm into ${face}: move ${ai} ${mm(-gap)} mm back, so it meets the face flush`);
      if (angle > square) wrong.push(`${end} meets ${face} ${mm(+angle.toFixed(2))}° from square`);
      if (Math.hypot(along, aside) > place) wrong.push(`${end} is ${along ? `${mm(Math.abs(along))} mm ${along > 0 ? 'toward' : 'away from'} ${bi}'s end b` : ''}${along && aside > place ? ' and ' : ''}${aside > place ? `${mm(aside)} mm across ${m.b.slot ? 'the slot\'s centre line' : 'the face'}` : ''} from ${j.b}${aside <= place && m.b.distance != null ? `: it meets ${bi} ${mm(m.b.distance + along)} mm from its end a, so the join says ${bi}.${m.b.place.split('.')[0]}@${mm(m.b.distance + along)}, or ${ai} moves` : ''}`);
      if (wrong.length) f('fail', `${j.label}: ${wrong.join('; ')}`, `${j.label}: geometry`, { code: 'join.geometry', at: A.at.map(r3), between: [A.at.map(r3), B.at.map(r3)], values, refs });
      else if (!m.findings.some((x) => x.code === 'join.geometry')) f('pass', `${j.label}: ${end} meets ${face} square and flush at ${mm(m.b.distance)} mm from ${bi}'s end a${m.b.slot && JOINS[j.kind].slot ? ', on the slot\'s centre line' : ''}`, null, { code: 'join.geometry', at: A.at.map(r3), values, refs });
    } else {
      // end to end (a splice): the ends meet face to face on one axis; at a corner (mitre, cube, a node): the axes meet
      const gap = Math.hypot(...sub(A.at, B.at)), angle = (Math.acos(Math.max(-1, Math.min(1, -dot(A.axis, B.axis)))) * 180) / Math.PI;
      if (j.kind === 'splice') {
        const ok = gap <= flush && angle <= square, values = { gap: r3(gap), angle: +angle.toFixed(2) };
        f(ok ? 'pass' : 'fail', `${j.label}: ${ok ? `${ai}'s end ${j.end} meets ${bi}'s end ${j.address} face to face on one axis` : `${ai}'s end ${j.end} and ${bi}'s end ${j.address} are ${mm(gap)} mm apart${angle > square ? ` and ${mm(+angle.toFixed(2))}° off one axis` : ''}, where a splice meets end to end`}`, ok ? null : `${j.label}: geometry`, { code: 'join.geometry', at: A.at.map(r3), between: [A.at.map(r3), B.at.map(r3)], values, refs });
      } else {
        const w = cross(A.axis, B.axis), wl = Math.hypot(...w), d = sub(B.at, A.at), miss = wl < 1e-9 ? Math.hypot(...cross(d, A.axis)) : Math.abs(dot(d, w)) / wl;
        const reach = Math.max(...[ai, bi].map((id) => { const o = s.objects.find((x) => x.id === id)?.beam; return o ? Math.hypot(o.profile.width, o.profile.height) : 0; }));
        const ok = wl > 1e-9 && miss <= place && gap <= reach + flush, values = { miss: r3(miss), gap: r3(gap), angle: +angle.toFixed(2) };
        f(ok ? 'pass' : 'fail', `${j.label}: ${ok ? `the axes of ${ai} and ${bi} meet at the corner, their ends ${mm(gap)} mm apart` : wl <= 1e-9 ? `${ai} and ${bi} lie along one line, where a ${j.kind} join meets at a corner` : miss > place ? `the axes of ${ai} and ${bi} pass ${mm(miss)} mm apart, where a ${j.kind} join's meet at the corner` : `${ai}'s end ${j.end} and ${bi}'s end ${j.address} are ${mm(gap)} mm apart, more than the beams' ${mm(reach)} mm across: they do not meet`}`, ok ? null : `${j.label}: geometry`, { code: 'join.geometry', at: A.at.map(r3), between: [A.at.map(r3), B.at.map(r3)], values, refs });
      }
    }
    // the spring this join puts at a's end in a frame's solve: measured on the joint rig with its date, or an estimate
    // until it is, and it says which
    const k = m.stiffness;
    if (k.bought) {
      const set = k.bought.set, own = k.bought.own;
      f('info', `${j.label}: taken as ${(k.bending / 1e6).toFixed(3)} N·m/mrad in bending and ${(k.twist / 1e6).toFixed(2)} N·m/mrad in twist at ${ai}'s end ${j.end}, ${own ? `${set}'s own figures from its rule set (${k.kind}: ${k.bought.rule})` : `the ${j.kind} join's ${k.measured?.bending ? 'figures' : 'estimate'}, as ${set} gives none`}: ${restsOn(k)}`, null,
        { code: 'join.stiffness', values: { bending: k.bending, twist: k.twist }, refs: { ...refs, ...(j.fitted ? { item: j.fitted.item } : {}), set, kind_of_value: k.kind, measured: k.measured, end: k.end, rests: k.rests } });
      continue;
    }
    if (k.fitting) {
      const fm = k.fitting, shared = fm.shareKind === 'measured';
      f('info', `${j.label}: taken as ${(k.bending / 1e6).toFixed(3)} N·m/mrad in bending, ${shared ? `${j.fitted.item}'s own by finite elements (${(fm.fe / 1e6).toFixed(3)}) times the ${+fm.share.toFixed(3)} a printed ${j.kind} join keeps of it, measured on the joint rig on ${k.measured.bending}` : `${j.fitted.item}'s own by finite elements`} (${fm.linear} N/mm at its screw under ${fm.load} N, ${fm.margin} times under its plastic's strength, ${fm.grams} g), and ${(k.twist / 1e6).toFixed(2)} N·m/mrad in twist at ${ai}'s end ${j.end}: ${shared ? `twist ${k.measured.twist ? `measured on the joint rig on ${k.measured.twist}` : 'an estimate until the rig measures it'}` : 'the slot nuts and lips are not in either, so both are an estimate of the joint until the joint rig (issue 264) measures it'}`, null,
        { code: 'join.stiffness', values: { bending: k.bending, twist: k.twist }, refs: { ...refs, item: j.fitted.item, kind_of_value: shared && k.measured.twist ? 'measured' : 'estimate', measured: k.measured, end: k.end, rests: k.rests } });
      continue;
    }
    f('info', `${j.label}: taken as ${(k.bending / 1e6).toFixed(2)} N·m/mrad in bending and ${(k.twist / 1e6).toFixed(2)} N·m/mrad in twist at ${ai}'s end ${j.end}${k.printed ? ', a printed fitting\'s share of a bought one\'s' : ''}${k.scale !== 1 ? `, scaled ${+k.scale.toFixed(2)}× for the profile's size` : ''}: ${restsOn(k)}`, null,
      { code: 'join.stiffness', values: { bending: k.bending, twist: k.twist }, refs: { ...refs, kind_of_value: k.kind, measured: k.measured, end: k.end, rests: k.rests } });
  }
  dropChecks(s, f, worlds);
  // every beam end joined or capped
  const ends = covered(s), beams = s.objects.filter((o) => o.beam && !o.unplaced && ids.includes(o.id)), open = [];
  for (const o of beams) for (const e of ['a', 'b']) if (!ends.has(`${o.id}.${e}`)) open.push(`${o.id}.${e}`);
  if (open.length) f('warn', `${open.length} beam end${open.length > 1 ? 's are' : ' is'} neither joined nor capped: ${open.join(', ')}. Give each a join, or an item at the end (an end cap or a foot, ${'"at": "' + open[0] + '"'})`, `${open.length} open end${open.length > 1 ? 's' : ''}`, { code: 'join.end', values: { open: open.length }, refs: { ends: open } });
  else f('pass', `every beam end is joined or capped (${beams.length * 2} ends)`, null, { code: 'join.end' });
}

/**
 * join.drop: a beam held by one join at one end and by nothing else, a mass hung on it (on the beam, or on an item placed
 * on it), is a cantilever from that join, as on the joint rig. Its drop under the mass is the beam's own bending and the
 * join's turning: d = F L³ / (3 E I) + F L² / k, L from b's face to the load along the beam, E I the beam's across the
 * load, k the join's bending spring. Each is a prediction cad measured takes (<beam>.drop=<mm>): the measured drop less
 * the beam's own gives the join's spring, F L² / (d - F L³ / 3 E I), written to the rule the spring came from.
 * @param {object} s a built assembly @param {Function} f the findings' sink @param {number[][]} worlds each item's place
 */
function dropChecks(s, f, worlds) {
  const loads = (s.motion.loads || []).map((l, i) => ({ ...l, at: s.a.loads?.[i]?.at })).filter((l) => l.mass != null), ids = s.motion.items.map((x) => x[0]);
  if (!loads.length) return;
  const items = s.a.items || [], G = s.motion.gravity, g = Math.hypot(...G) || 1, down = G.map((c) => c / g);
  const pt = (W, p) => [0, 1, 2].map((r) => W[4 * r] * p[0] + W[4 * r + 1] * p[1] + W[4 * r + 2] * p[2] + W[4 * r + 3]);
  const dir = (W, v) => [0, 1, 2].map((r) => W[4 * r] * v[0] + W[4 * r + 1] * v[1] + W[4 * r + 2] * v[2]);
  for (const j of s.joins) {
    const [id] = j.items, e = j.end[0], other = e === 'a' ? 'b' : 'a';
    // held by this join alone: in no other join, as a or b
    if (s.joins.some((x) => x !== j && x.items.includes(id))) continue;
    const on = new Set([id, ...items.filter((it) => typeof it.at === 'string' && it.at.trim().startsWith(`${id}.`)).map((it) => it.id)]);
    const mine = loads.filter((l) => on.has(ids[l.item]));
    if (!mine.length) continue;
    const beam = s.objects.find((o) => o.id === id)?.beam, W = worlds[ids.indexOf(id)], fig = beam?.figures, mat = beam?.material;
    const E = mat?.modulus, Ix = fig?.inertiaX?.value, Iy = fig?.inertiaY?.value, k = j.model.stiffness.bending;
    if (!(E > 0 && Ix > 0 && Iy > 0 && W)) { f('info', `${j.label}: ${id} hangs from this join alone, but its profile gives no second moments or its material no modulus, so its drop is not predicted`, null, { code: 'join.drop', refs: { join: j.index, beam: id } }); continue; }
    const len = beam.length, root = pt(W, [0, 0, e === 'a' ? 0 : len]), tip = pt(W, [0, 0, e === 'a' ? len : 0]);
    const u = [0, 1, 2].map((c) => (tip[c] - root[c]) / len), sx = dir(W, [1, 0, 0]), sy = dir(W, [0, 1, 0]);
    for (const l of mine) {
      const P = pt(worlds[l.item], [l.frame[3], l.frame[7], l.frame[11]]), L = [0, 1, 2].reduce((a, c) => a + (P[c] - root[c]) * u[c], 0);
      const across = down.map((c, q) => c - u[q] * [0, 1, 2].reduce((a, r) => a + down[r] * u[r], 0)), share = Math.hypot(...across);
      const F = l.mass * 9.80665 * share, dx = [0, 1, 2].reduce((a, c) => a + across[c] * sx[c], 0) / (share || 1), dy = [0, 1, 2].reduce((a, c) => a + across[c] * sy[c], 0) / (share || 1);
      if (!(L > 0) || !(share > 1e-6)) continue;
      const beamDrop = ((F * L ** 3) / (3 * E)) * (dx * dx / Iy + dy * dy / Ix), joinDrop = (F * L * L) / k, drop = beamDrop + joinDrop;
      const rule = writesTo(j), name = `${id}.drop`, where = l.at ?? `${id}`;
      const trust = restsOn(j.model.stiffness);
      f('info', `${j.label}: ${id} hangs from it alone, so ${l.mass} kg at ${where}, ${mm(L)} mm out from ${j.items[1]}'s face, drops it ${n3(drop)} mm: ${n3(beamDrop)} mm the beam's own bending (E ${E} MPa, I ${Math.round(dx * dx > 0.5 ? Iy : Ix)} mm⁴) and ${n3(joinDrop)} mm the join turning on its ${(k / 1e6).toFixed(3)} N·m/mrad spring (${trust}). Measure it with a dial indicator and write it back: cad measured ${s.project}/${s.name} ${name}=<mm>, and the spring goes to ${rule.rule}`, null,
        { code: 'join.drop', at: P.map(r3), values: { drop: n3(drop), beam: n3(beamDrop), join: n3(joinDrop), force: n3(F), arm: n3(L), bending: k },
          predict: { name, figure: `drop of ${id} at ${where} under ${l.mass} kg`, value: n3(drop), unit: 'mm', rig: { force: F, arm: L, beam: beamDrop, spring: k, rule: rule.rule, per: rule.per, unit: rule.unit, what: rule.what, join: j.label } },
          refs: { join: j.index, kind: j.kind, beam: id, rule: rule.rule } });
    }
  }
}
const n3 = (x) => +Number(x).toFixed(3);

// The rule a join's measured spring is written to, and what to multiply the spring by to get it: a bought fitting's own
// bending_stiffness; a printed fitting's share of its finite-element figure; else the kind's figure for a 20 mm profile
function writesTo(j) {
  const k = j.model.stiffness, key = j.kind.replace(/-/g, '_');
  if (k.bought) return { rule: `${k.bought.set}.bending_stiffness`, per: 1, unit: 'N mm/rad', what: `${k.bought.set}'s bending stiffness, holding a beam's end` };
  if (k.fitting) return { rule: `joins.${key}_printed_share`, per: 1 / k.fitting.fe, unit: '', what: `a ${j.kind} join with a printed fitting, as a share of the fitting's own bending stiffness by finite elements (${(k.fitting.fe / 1e6).toFixed(3)} N·m/mrad for ${k.fitting.name})` };
  return { rule: `joins.${key}_bending`, per: 1 / ((k.scale ?? 1) * (k.printed ? JOIN_SCALE.printed.value : 1)), unit: 'N mm/rad', what: `a ${j.kind} join's bending stiffness, for a 20 mm series profile` };
}

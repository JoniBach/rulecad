// Wires in the assembly: anchors at each end, a route between them, and the longest the route gets through the machine's
// poses. A wire that won't reach the elbow at full stretch, or is too thin for what it carries, is found here rather than
// on the bench. "wires": [{ "from": "elbow.connector", "to": "board.Y", "via": ["upper.cable"], "gauge": "awg22" }]
import { peekRuleSet as loadRuleSet } from './rules.mjs';

const n3 = (x, d = 1) => String(Number(x.toFixed(d)));
const GAUGE = /^awg(\d{1,2})$/i;
const areaOf = (gauge, base) => { const d = base * Math.pow(92, (36 - gauge) / 39); return (Math.PI * d * d) / 4; };

// Anchors to world points at given joint values
function pointer(s, { placeItems, jointValues, mul, marksOf }) {
  const motion = s.motion, ids = motion.items.map((x) => x[0]);
  const marks = (id, name) => motion.marks.find((m) => m.id === id && m.name === name);
  return (ref, what) => {
    const bits = String(ref).split('.'), name = bits.pop(), id = bits.join('.'), m = marks(id, name);
    if (!m) throw new Error(`${what}: no anchor "${ref}" (give <item>.<anchor>${ids.includes(id) ? `; ${id} has ${motion.marks.filter((x) => x.id === id).map((x) => x.name).join(', ') || 'none'}` : ''})`);
    const k = ids.indexOf(id), F = m.frame;
    return (worlds) => { const W = mul(worlds[k], F); return [W[3], W[7], W[11]]; };
  };
}
// Joint values to try: each named pose, each moving joint at its ends and middle, all together when few enough
function samples(motion, jointValues) {
  const base = jointValues(motion, motion.pose ?? undefined), free = motion.joints.filter((j) => !j.follow && j.type !== 'fixed' && j.dofs.length === 1), out = [base];
  for (const p of Object.keys(motion.poses || {})) out.push(jointValues(motion, p));
  const levels = (j) => { const [lo, hi] = j.dofs[0]; return [lo, (lo + hi) / 2, hi]; }, leads = Object.fromEntries(Object.entries(base).filter(([id]) => !motion.joints.find((x) => x.id === id)?.follow));
  if (free.length && free.length <= 5) {
    const go = (i, set) => { if (i === free.length) { out.push(jointValues(motion, set)); return; } for (const v of levels(free[i])) go(i + 1, { ...set, [free[i].id]: [v] }); };
    go(0, leads);
  } else for (const j of free) for (const v of levels(j)) out.push(jointValues(motion, { ...leads, [j.id]: [v] }));
  return out;
}

// Each wire as a route of point functions, checked by name when the assembly is built
export function wiresOf(a, placed, joints) {
  return (a.wires || []).map((w, i) => {
    const what = `wire ${w.id || i + 1}`;
    if (!w.from || !w.to) throw new Error(`${what}: give "from" and "to", anchors as <item>.<anchor>`);
    const g = GAUGE.exec(String(w.gauge ?? ''));
    if (w.gauge != null && !g) throw new Error(`${what}: gauge is awg and a number (awg22), not ${JSON.stringify(w.gauge)}`);
    for (const v of w.via ?? []) if (typeof v === 'string' && !v.includes('.') && !joints.some((j) => j.id === v && j.type === 'path')) throw new Error(`${what}: via "${v}" is neither an anchor (<item>.<anchor>) nor a path joint`);
    return { ...w, id: w.id || `w${i + 1}` };
  });
}

// What a wire carries: what it's given, or a motor's current at either end, or a signal's
function currentOf(w, s, top, signal) {
  if (w.current != null) return { current: Number(w.current), why: 'as given' };
  const motors = s.motion.drives.filter((d) => [top(w.from), top(w.to)].includes(d.id));
  for (const d of motors) { const I = d.spec.current ?? d.model.figures.rated_current?.value; if (I != null) return { current: I, why: `${d.id}'s rated current` }; }
  return { current: signal, why: 'a signal' };
}

// A wire ending on a board's axis connector: the board's pins for that axis, from its rule set
function pinsAt(w, s) {
  for (const end of [w.from, w.to]) {
    const [id, anchor] = String(end).split('.'), o = s.objects.find((x) => x.id === id && x.bought?.part === 'board'), e = o?.built.entries;
    if (!e || !/^[A-Z]$/.test(anchor ?? '')) continue;
    const pin = (k) => e.find((x) => x.name === `${o.bought.set}.${k}_pin_${anchor.toLowerCase()}`)?.value;
    if (pin('step')) return `step ${pin('step')}, dir ${pin('dir')}${pin('limit') ? `, limit ${pin('limit')}` : ''}`;
  }
  return null;
}

export function wireRows(s, helpers) {
  const motion = s.motion, wires = s.wires; if (!wires?.length) return [];
  const rules = loadRuleSet('wire').rules, density = rules.current_density.value, loop = rules.service_loop.value, base = rules.awg_base.value, signal = rules.signal_current.value;
  const point = pointer(s, helpers), { placeItems, jointValues } = helpers, top = (n) => String(n).split('.')[0], poses = samples(motion, jointValues).map((v) => placeItems(motion, v));
  return wires.map((w) => {
    const what = `wire ${w.id}`, chain = [w.from, ...(w.via ?? []), w.to];
    const fns = chain.flatMap((v) => (typeof v === 'string' && !v.includes('.') ? [] : [point(v, what)]));
    const pathLen = (w.via ?? []).reduce((t, v) => { const j = typeof v === 'string' && !v.includes('.') && motion.joints.find((x) => x.id === v); if (!j) return t; let l = 0; for (let k = 1; k < j.path.length; k++) l += Math.hypot(...j.path[k].map((c, m) => c - j.path[k - 1][m])); return t + l; }, 0);
    let longest = 0, shortest = Infinity, atLongest = null;
    for (const W of poses) { const P = fns.map((fn) => fn(W)); let l = pathLen; for (let k = 1; k < P.length; k++) l += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1], P[k][2] - P[k - 1][2]); if (l > longest) { longest = l; atLongest = P; } shortest = Math.min(shortest, l); }
    const { current, why } = currentOf(w, s, top, signal), gauge = w.gauge ? Number(GAUGE.exec(w.gauge)[1]) : null, area = gauge != null ? areaOf(gauge, base) : null, capacity = area != null ? area * density : null;
    return { id: w.id, from: w.from, to: w.to, via: w.via ?? [], pins: pinsAt(w, s), gauge: w.gauge ?? null, colour: w.colour ?? null, conductors: w.conductors ?? (s.motion.drives.some((d) => [top(w.from), top(w.to)].includes(d.id)) ? 4 : 1), connectors: w.connectors ?? null,
      longest, shortest, length: Math.ceil(longest + loop), loop, current, why, area, capacity, route: atLongest };
  });
}

export function wireChecks(s, f, helpers) {
  for (const w of wireRows(s, helpers)) {
    const refs = { wire: w.id, from: w.from, to: w.to }, at = w.route?.[0], values = { length: w.length, longest: w.longest, shortest: w.shortest, current: w.current, capacity: w.capacity };
    f('info', `${w.id}: ${w.from} to ${w.to}, ${n3(w.length, 0)} mm with its ${w.loop} mm loop (${n3(w.shortest, 0)} to ${n3(w.longest, 0)} mm as the joints move)`, null, { code: 'wire.length', at, refs, values });
    if (w.capacity == null) { f('warn', `${w.id}: no gauge given, so nothing checks it against ${n3(w.current, 2)} A (${w.why})`, `${w.id}: no gauge`, { code: 'wire.gauge', at, refs, values }); continue; }
    if (w.current > w.capacity) f('fail', `${w.id}: ${w.gauge} carries ${n3(w.capacity, 2)} A at most, and this carries ${n3(w.current, 2)} A (${w.why}): a thicker wire`, `${w.id}: too thin`, { code: 'wire.gauge', at, refs, values });
    else f('pass', `${w.id}: ${w.gauge} takes ${n3(w.current, 2)} A (${w.why}), up to ${n3(w.capacity, 2)} A`, null, { code: 'wire.gauge', at, refs, values });
  }
}

// A route's stations: each anchor as [item, local point]; a path joint in the route is its whole polyline, on its parent
function stations(s, chain, mul) {
  const motion = s.motion, out = [], ids = motion.items.map((x) => x[0]);
  for (const v of chain) {
    if (typeof v === 'string' && !v.includes('.')) { const j = motion.joints.find((x) => x.id === v); if (j) for (const p of j.path) { const W = mul(j.a, [1, 0, 0, p[0], 0, 1, 0, p[1], 0, 0, 1, p[2]]); out.push([j.parent, W[3], W[7], W[11]]); } continue; }
    const bits = String(v).split('.'), name = bits.pop(), id = bits.join('.'), m = motion.marks.find((x) => x.id === id && x.name === name);
    if (m) out.push([ids.indexOf(id), m.frame[3], m.frame[7], m.frame[11]]);
  }
  return out;
}
const worldOf = (W, [, x, y, z]) => [W[0] * x + W[1] * y + W[2] * z + W[3], W[4] * x + W[5] * y + W[6] * z + W[7], W[8] * x + W[9] * y + W[10] * z + W[11]];
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** Each wire's route as stations a link carries: [[id, [[item, x, y, z], …]]], the item -1 (world) when nothing moves. */
export function wireRoutes(s, { placeItems, mul }) {
  const hasJoints = s.motion.joints.length > 0, W = hasJoints ? null : placeItems(s.motion, s.jointValues);
  return (s.wires || []).map((w) => [w.id, stations(s, [w.from, ...(w.via ?? []), w.to], mul).map((p) => (hasJoints ? p.map((v) => +v.toFixed(3)) : [-1, ...worldOf(p[0] < 0 ? I : W[p[0]], p).map((v) => +v.toFixed(3))]))]);
}

// A thin square tube along each wire at the assembly's pose, for previews: drawn faint, never a part, so no check sees it
export function wireTubes(s, { placeItems, mul }) {
  const worlds = placeItems(s.motion, s.jointValues), r = 0.5, out = [];
  for (const w of s.wires || []) {
    const pts = stations(s, [w.from, ...(w.via ?? []), w.to], mul).map((p) => worldOf(p[0] < 0 ? I : worlds[p[0]], p)), tris = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], d = b.map((c, i) => c - a[i]), l = Math.hypot(...d); if (l < 1e-6) continue;
      const z = d.map((c) => c / l), side = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], x0 = [z[1] * side[2] - z[2] * side[1], z[2] * side[0] - z[0] * side[2], z[0] * side[1] - z[1] * side[0]], m = Math.hypot(...x0), x = x0.map((c) => c / m), y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const corner = (o, sx, sy) => o.map((c, i) => c + (sx * x[i] + sy * y[i]) * r), ring = (o) => [corner(o, 1, 1), corner(o, -1, 1), corner(o, -1, -1), corner(o, 1, -1)], A = ring(a), B = ring(b);
      for (let q = 0; q < 4; q++) { const n = (q + 1) % 4; tris.push([A[q], A[n], B[n]], [A[q], B[n], B[q]]); }
      tris.push([A[0], A[2], A[1]], [A[0], A[3], A[2]], [B[0], B[1], B[2]], [B[0], B[2], B[3]]);
    }
    if (tris.length) out.push({ name: `wire.${w.id}`, role: 'wire', label: `wire ${w.id}`, item: null, triangles: tris });
  }
  return out;
}

// The sheet: each wire, its length, gauge, colour and connectors, in Markdown
export function wiringSheet(rows) {
  const line = (a) => `| ${a.join(' | ')} |`;
  return [line(['Wire', 'From', 'To', 'Length (mm)', 'Gauge', 'Conductors', 'Colour', 'Connectors', 'Board pins', 'Carries']), line(['---', '---', '---', '---:', '---', '---:', '---', '---', '---', '---']),
    ...rows.map((w) => line([w.id, w.from, w.to, w.length, w.gauge ?? '', w.conductors, w.colour ?? '', Array.isArray(w.connectors) ? w.connectors.join(' to ') : w.connectors ?? '', w.pins ?? '', `${n3(w.current, 2)} A, ${w.why}`]))].join('\n');
}

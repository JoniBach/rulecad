// A motor turning what it drives, as one animated SVG: the gears cut across their shafts, each part's outline drawn
// once and moved as a rigid body (a turn and a slide per frame), so a gearbox of fine teeth stays small. A section is
// taken at the middle of each gear (rings, suns, planets) and of the part with the load, up to three, side by side.
import { jointValues, placeItems, mul } from '@rulecad/model-link';
import { axisFrame, sliceAt } from './seats.mjs';
import { loops } from './mesh.mjs';
import { trainFrom, axisOf } from './motors.mjs';

const fmt = (n) => +Number(n).toFixed(3);
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const rowsAt = (W, p) => [0, 1, 2].map((k) => W[4 * k] * p[0] + W[4 * k + 1] * p[1] + W[4 * k + 2] * p[2] + W[4 * k + 3]);
const COLOUR = { still: '#c9ccd1', moves: '#2f6fb3', load: '#e07a1f', bought: '#e9eaec' };

/**
 * What the drive moves and where to cut: the joint the motor turns (or a gearbox's input), the joint with the load, the
 * levels across the axis to section at, and how far to turn so the slowest part moves a readable amount.
 */
export function drivePlan(s, { turns } = {}) {
  const motion = s.motion, d = (motion.drives || []).find((x) => x.joint);
  const root = d?.joint ?? motion.joints.find((j) => !j.follow && motion.joints.some((x) => x.follow?.[0] === j.id))?.id;
  if (!root) return null;
  const load = (motion.loads || []).find((l) => l.joint)?.joint ?? motion.joints.filter((j) => trainFrom(motion, j.id).root === root && j.id !== root).sort((a, b) => trainFrom(motion, b.id).ratio - trainFrom(motion, a.id).ratio)[0]?.id ?? root;
  const ratio = Math.abs(trainFrom(motion, load).ratio) || 1;
  const n = turns ?? Math.min(6, Math.max(1, (ratio * 60) / 360)); // the slowest part through about 60°, in one to six turns
  return { root, load, motor: d?.id ?? null, ratio, turns: n };
}

export function driveSvg(s, { turns, title = '' } = {}) {
  const plan = drivePlan(s, { turns });
  if (!plan) throw new Error(`${s.name} has nothing driven to animate: give it a "motor" item that "drives" a joint, or gears that follow one`);
  const motion = s.motion, rootJ = motion.joints.find((j) => j.id === plan.root);
  const v0 = jointValues(motion, motion.pose ?? undefined), W0 = placeItems(motion, v0);
  const { O, Z } = axisOf(motion, W0, rootJ, mul), F = axisFrame(O, Z);
  const indexOf = new Map(s.items.map((it, k) => [it.id, k]));
  const loadItem = motion.joints.find((j) => j.id === plan.load)?.child;
  // Every part, in the axis's frame at rest: what's cut, and what it belongs to
  const parts = s.parts.map((p) => ({ p, k: indexOf.get(p.item), world: p.triangles.map((t) => t.map(F)) })).filter((x) => x.k != null && x.world.length);
  const span = (x) => { let lo = Infinity, hi = -Infinity; for (const t of x.world) for (const q of t) { lo = Math.min(lo, q[2]); hi = Math.max(hi, q[2]); } return [lo, hi]; };
  // Where to cut: through each gear's teeth (the height whose section has the most edges, the middle of that run),
  // rings named in a planetary included, and through the middle of what carries the load
  const geared = new Set([...(motion.meshes || []).flatMap((m) => [m.joint, ...(m.members || [])]), ...motion.joints.filter((j) => j.follow).flatMap((j) => [j.id, j.follow[0]])]);
  const childOf = new Map(motion.joints.map((j) => [j.id, j.child]));
  const ringItems = new Set((s.a.planetary || []).flatMap((g) => [g.ring, g.output?.ring]).filter(Boolean).map((id) => indexOf.get(id)));
  const gearItems = new Set([...[...geared].map((id) => childOf.get(id)), ...ringItems].filter((k) => k != null));
  const teethAt = (x) => {
    const [lo, hi] = span(x), n = Math.min(160, Math.max(8, Math.round((hi - lo) / 0.25))), counts = [];
    for (let i = 1; i < n; i++) { const z = lo + ((hi - lo) * i) / n; counts.push([z, sliceAt(x.world, z).length]); }
    const top = Math.max(...counts.map((c) => c[1])), run = counts.filter((c) => c[1] >= top * 0.9).map((c) => c[0]);
    return run.length ? (run[0] + run.at(-1)) / 2 : (lo + hi) / 2;
  };
  const want = [];
  for (const k of gearItems) { const own = parts.filter((x) => x.k === k && x.p.role === 'part'); if (own.length) want.push({ z: teethAt({ world: own.flatMap((x) => x.world) }), ring: ringItems.has(k) }); }
  if (loadItem != null && !gearItems.has(loadItem)) { const own = parts.filter((x) => x.k === loadItem && x.p.role === 'part'); if (own.length) { const [lo, hi] = span({ world: own.flatMap((x) => x.world) }); want.push({ z: (lo + hi) / 2, ring: false }); } }
  want.sort((a, b) => b.ring - a.ring || a.z - b.z);
  const levels = [];
  for (const { z } of want) if (!levels.some((l) => Math.abs(l - z) < 1.5)) levels.push(z);
  const picked = levels.slice(0, 3).sort((a, b) => a - b); // rings first, then the rest, three at most
  // The frames: the root turned through its turns, each item's rigid move in the plane from two points on it
  const N = Math.min(240, Math.max(24, Math.round(plan.turns * 40))), base = v0[plan.root]?.[0] ?? 0;
  const ks = [...new Set(parts.map((x) => x.k))], moves = new Map(ks.map((k) => [k, []]));
  for (let f = 0; f <= N; f++) {
    const W = f ? placeItems(motion, jointValues(motion, { ...Object.fromEntries(Object.entries(v0).filter(([id]) => !motion.joints.find((j) => j.id === id)?.follow)), [plan.root]: [base + (360 * plan.turns * f) / N] })) : W0;
    for (const k of ks) {
      const a = F(rowsAt(W[k], [0, 0, 0])), local = invRows(W0[k]), axisLocal = rotOnly(local, Z), e = perp(axisLocal);
      const b = F(rowsAt(W[k], e)), a0 = F(rowsAt(W0[k], [0, 0, 0])), b0 = F(rowsAt(W0[k], e));
      const th = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
      const list = moves.get(k), prev = list.length ? list.at(-1).th : 0;
      let t = th; while (t - prev > Math.PI) t -= 2 * Math.PI; while (t - prev < -Math.PI) t += 2 * Math.PI; // turned on, not back
      const c = Math.cos(t), sn = Math.sin(t);
      list.push({ th: t, tx: a[0] - (c * a0[0] - sn * a0[1]), ty: a[1] - (sn * a0[0] + c * a0[1]) });
    }
  }
  const still = (k) => moves.get(k).every((m) => Math.abs(m.th) < 1e-6 && Math.abs(m.tx) < 1e-6 && Math.abs(m.ty) < 1e-6);
  // Each panel: the cut through every part that crosses it, at rest; the moving ones animated
  const panels = picked.map((z) => {
    const cuts = [];
    for (const x of parts) {
      const outlines = loops(sliceAt(x.world, z)).filter((o) => o.length > 2);
      if (outlines.length) cuts.push({ ...x, d: outlines.map((o) => `M${o.map(([u, w]) => `${fmt(u)} ${fmt(w)}`).join('L')}Z`).join('') });
    }
    const names = [...new Set(cuts.filter((c) => c.p.role === 'part').map((c) => c.p.item))];
    return { z, cuts, names };
  }).filter((p) => p.cuts.length);
  if (!panels.length) throw new Error(`${s.name}: no part crosses the planes through its gears`);
  // The view: everything every frame reaches, in each panel
  let r = 0;
  for (const pn of panels) for (const c of pn.cuts) for (const t of c.world) for (const q of t) if (Math.abs(q[2] - pn.z) < 50) r = Math.max(r, Math.hypot(q[0], q[1]));
  const cell = 2 * r * 1.1, gap = cell * 0.08, cap = cell * 0.16, W = panels.length * cell + (panels.length + 1) * gap, H = cell + cap * 2 + gap;
  const dur = `${fmt(Math.max(4, Math.min(12, plan.turns * 2)))}s`;
  const anim = (k) => {
    const m = moves.get(k);
    return { t: `<animateTransform attributeName="transform" type="translate" values="${m.map((x) => `${fmt(x.tx)} ${fmt(x.ty)}`).join(';')}" dur="${dur}" repeatCount="indefinite"/>`,
      r: `<animateTransform attributeName="transform" type="rotate" values="${m.map((x) => fmt((x.th * 180) / Math.PI)).join(';')}" dur="${dur}" repeatCount="indefinite"/>` };
  };
  const colour = (c) => (c.p.role !== 'part' ? COLOUR.bought : c.k === loadItem ? COLOUR.load : still(c.k) ? COLOUR.still : COLOUR.moves);
  const art = panels.map((pn, i) => {
    const cx = gap + i * (cell + gap) + cell / 2, cy = cap + gap + cell / 2;
    const order = [...pn.cuts].sort((a, b) => (a.p.role !== 'part') - (b.p.role !== 'part') || still(b.k) - still(a.k)); // bought faint at the back, still parts under moving ones
    const shapes = order.map((c) => {
      const fill = `<path d="${c.d}" fill="${colour(c)}" fill-rule="evenodd" stroke="#1a1a1a" stroke-width="${fmt(cell / 900)}"/>`;
      if (still(c.k)) return fill;
      const a = anim(c.k);
      return `<g>${a.t}<g>${a.r}${fill}</g></g>`;
    }).join('');
    const size = cap * 0.3, room = Math.floor(cell / (size * 0.55)), text = `at ${fmt(pn.z)} mm: ${pn.names.join(', ')}`;
    const label = `<text x="${fmt(cx - cell / 2)}" y="${fmt(cap * 0.75)}" font-size="${fmt(size)}" font-family="system-ui, sans-serif" fill="#333">${esc(text.length > room ? `${text.slice(0, room - 1)}…` : text)}</text>`;
    return `${label}<g transform="translate(${fmt(cx)} ${fmt(cy)}) scale(1 -1)">${shapes}</g>`;
  }).join('\n');
  const times = (n) => (n === 1 ? 'once' : `${fmt(n)} times`), along = `cut across ${plan.root}'s axis`;
  const out = plan.ratio !== 1 ? `${along}: ${plan.load} turns ${fmt((360 * plan.turns) / plan.ratio)}° while ${plan.root} turns ${times(plan.turns)} (${fmt(plan.ratio)}:1)` : `${along}: ${plan.root} turned ${times(plan.turns)}`;
  const KEY = [['moves', 'moves'], ['load', 'carries the load'], ['still', 'held still'], ['bought', 'bought']];
  const ks2 = Math.min(cap * 0.3, (W - 2 * gap) / (KEY.reduce((n, [, t]) => n + t.length * 0.55 + 3.2, 0))), outSize = Math.min(cap * 0.34, (W - 2 * gap) / (out.length * 0.55));
  let kx = gap;
  const key = KEY.map(([k, t]) => { const x = kx; kx += ks2 * (t.length * 0.55 + 3.2); return `<rect x="${fmt(x)}" y="${fmt(H - cap * 0.95)}" width="${fmt(ks2 * 1.2)}" height="${fmt(ks2 * 1.2)}" fill="${COLOUR[k]}" stroke="#1a1a1a" stroke-width="${fmt(cell / 900)}"/><text x="${fmt(x + ks2 * 1.6)}" y="${fmt(H - cap * 0.95 + ks2)}" font-size="${fmt(ks2)}" font-family="system-ui, sans-serif" fill="#555">${t}</text>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(W)} ${fmt(H)}" width="${Math.min(1400, 480 * panels.length)}">
<title>${esc(title || s.a.title || s.name)}</title>
<rect width="${fmt(W)}" height="${fmt(H)}" fill="#fff"/>
${art}
<text x="${fmt(gap)}" y="${fmt(H - cap * 1.25)}" font-size="${fmt(outSize)}" font-family="system-ui, sans-serif" fill="#333">${esc(out)}</text>
${key}
</svg>
`;
}

// Helpers on the flat row-major 4 × 4 matrices placeItems gives
function invRows(W) { // a rigid move's inverse: the turn transposed, the shift turned back
  const R = [[W[0], W[1], W[2]], [W[4], W[5], W[6]], [W[8], W[9], W[10]]], t = [W[3], W[7], W[11]];
  const o = new Array(16).fill(0);
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) o[4 * i + j] = R[j][i]; o[4 * i + 3] = -(R[0][i] * t[0] + R[1][i] * t[1] + R[2][i] * t[2]); }
  o[15] = 1; return o;
}
const rotOnly = (W, v) => [0, 1, 2].map((k) => W[4 * k] * v[0] + W[4 * k + 1] * v[1] + W[4 * k + 2] * v[2]);
const perp = (z) => { const n = Math.hypot(...z) || 1, u = z.map((c) => c / n), seed = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c = [seed[1] * u[2] - seed[2] * u[1], seed[2] * u[0] - seed[0] * u[2], seed[0] * u[1] - seed[1] * u[0]], m = Math.hypot(...c); return c.map((x) => (x / m) * 10); };

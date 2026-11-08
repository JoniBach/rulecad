// One tooth analysed: the tooth and a slice of rim under it as a flat part of finite elements (@rulecad/fea, plane
// stress), the rim's cut edges held, the load at the tip along the line of action. The peak stress at the root, with
// the fillet and the printed shape as they are, against Lewis's number, which leaves the fillet's concentration out.
import { grid, analyse, positions } from '@rulecad/fea';
import { gearModel, spurProfile, lewisFactor } from './gears.mjs';

const fmt = (x, d = 1) => String(+x.toFixed(d));
const inside = ([x, y], pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const toSeg = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };

/**
 * A tooth's root stress by finite elements, at a torque on the gear.
 * @param {object} p the gear's parameters (as gearModel takes them)
 * @param {{ width: number, torque: number, material: { E: number, nu: number, strength?: number, name?: string }, cells?: number }} o
 *   cells: across a module (16)
 */
export function toothStress(p, { width, torque, material, cells = 32 } = {}) {
  const fine = solveTooth(p, { width, torque, material, cells }), coarse = solveTooth(p, { width, torque, material, cells: Math.round(cells * 0.75) });
  const change = fine.peak / coarse.peak - 1, out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const { peak, lewis, h, nx, ny, atRoot } = fine, name = material.name ?? 'the material', n = material.strength ? material.strength / peak : null;
  f(n == null ? 'info' : n >= 2 ? 'pass' : n >= 1 ? 'warn' : 'fail', `a tooth analysed (${nx} × ${ny} cells of ${fmt(h, 3)} mm): ${fmt(peak)} MPa at the root of its loaded side, ${fmt(atRoot, 2)} mm above the root circle, ${fmt(peak / lewis, 2)}× Lewis's ${fmt(lewis)} MPa (the fillet's concentration)${n == null ? '' : n >= 1 ? `: ${fmt(n)}× under ${name}'s ${material.strength} MPa` : `: over ${name}'s ${material.strength} MPa, it breaks`}`, 'gear.fe', { peak, lewis });
  if (Math.abs(change) > 0.05) f('warn', `the peak changed ${fmt(change * 100)}% from cells a third bigger: not settled; more cells`, 'gear.fe.coarse', { change });
  return { peak, at: fine.at, lewis, ratio: peak / lewis, cells: [nx, ny], change, findings: out };
}

function solveTooth(p, { width, torque, material, cells }) {
  const g = gearModel(p), m = g.module, z = g.teeth, a = (g.pressureAngle * Math.PI) / 180;
  if (!(width > 0) || !(torque > 0)) throw new Error(`toothStress: width and torque are sizes above 0 (got ${width} and ${torque})`);
  if (!(material?.E > 0)) throw new Error('toothStress: the material needs a modulus E (MPa) and a Poisson\'s ratio nu');
  // the tooth on +x between the middles of its spaces, and the rim under it two and a half modules deep
  const loop = spurProfile(p).loops[0], half = Math.PI / z, rf = g.root / 2, rr = rf - 2.5 * m;
  const tooth = loop.filter(([x, y]) => Math.abs(Math.atan2(y, x)) <= half + 1e-9 && x > 0).sort((u, v) => Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0]));
  const arc = Array.from({ length: 13 }, (_, i) => { const t = half - (2 * half * i) / 12; return [rr * Math.cos(t), rr * Math.sin(t)]; });
  const poly = [...tooth, ...arc];
  // a grid over it, each cell as much solid as its 3 × 3 samples say
  const h = m / cells, x0 = Math.min(...poly.map((q) => q[0])), y0 = Math.min(...poly.map((q) => q[1]));
  const nx = Math.ceil((Math.max(...poly.map((q) => q[0])) - x0) / h), ny = Math.ceil((Math.max(...poly.map((q) => q[1])) - y0) / h);
  const G = grid({ nx, ny, h }), density = new Float64Array(G.cells);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let n = 0;
    for (let s = 0; s < 3; s++) for (let t = 0; t < 3; t++) if (inside([x0 + (i + (s + 0.5) / 3) * h, y0 + (j + (t + 0.5) / 3) * h], poly)) n++;
    density[j * nx + i] = n / 9;
  }
  // held: the rim's cut edges (the two radial cuts and the arc under them)
  const at = positions(G).map(([x, y]) => [x + x0, y + y0]), fixed = new Uint8Array(G.dofs);
  const cutA = [[rf * Math.cos(half), rf * Math.sin(half)], [rr * Math.cos(half), rr * Math.sin(half)]], cutB = [[rf * Math.cos(-half), rf * Math.sin(-half)], [rr * Math.cos(-half), rr * Math.sin(-half)]];
  for (let n = 0; n < G.nodes; n++) {
    const q = at[n], r = Math.hypot(...q), near = toSeg(q, ...cutA) < 0.75 * h || toSeg(q, ...cutB) < 0.75 * h || (Math.abs(r - rr) < 0.75 * h && Math.abs(Math.atan2(q[1], q[0])) <= half);
    if (near) fixed[2 * n] = fixed[2 * n + 1] = 1;
  }
  // the load: the mate's push on the lower flank near the tip, along the flank's normal (the line of action), F_t / cos α
  const Ft = torque / (g.pitch / 2), Fn = Ft / Math.cos(a), ra = g.tip / 2;
  const flank = tooth.filter(([x, y]) => y < 0 && Math.hypot(x, y) < ra - 0.2 * m && Math.hypot(x, y) > ra - 0.6 * m);
  const k = Math.floor(flank.length / 2), P = flank[k] ?? tooth[1], Q = flank[Math.min(k + 1, flank.length - 1)] ?? tooth[2];
  const tx = Q[0] - P[0], ty = Q[1] - P[1], tl = Math.hypot(tx, ty) || 1, nIn = [-ty / tl, tx / tl]; // (inward: the tooth is on the left of its outline)
  const load = new Float64Array(G.dofs), touch = [];
  for (let n = 0; n < G.nodes; n++) if (Math.hypot(at[n][0] - P[0], at[n][1] - P[1]) < 0.15 * m) touch.push(n);
  if (!touch.length) throw new Error('toothStress: no node near the load: more cells');
  for (const n of touch) { load[2 * n] = (Fn * nIn[0]) / touch.length; load[2 * n + 1] = (Fn * nIn[1]) / touch.length; }
  const r = analyse({ grid: G, density, material: { E: material.E, nu: material.nu }, thickness: width, fixed, loads: [load], method: 'direct' });
  // the peak on the loaded side (where the root is in tension, as Lewis and the strength mean), away from where the
  // load goes in (a point load's own stress is a property of the model, not the tooth)
  let peak = 0, where = null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = j * nx + i; if (density[e] < 0.5) continue;
    const c = [x0 + (i + 0.5) * h, y0 + (j + 0.5) * h];
    if (c[1] > 0 || Math.hypot(c[0] - P[0], c[1] - P[1]) < 0.6 * m) continue;
    if (r.stress[0][e] > peak) { peak = r.stress[0][e]; where = c; }
  }
  const lewis = Ft / (width * m * lewisFactor(z));
  return { peak, at: where, lewis, h, nx, ny, atRoot: Math.hypot(...where) - rf };
}

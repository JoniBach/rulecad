// Shaping a flexure to a job: a curve's points, its thickness along it and the angles it leaves and meets its blocks
// at, moved until the beam solver says it stores the energy asked for at the travel asked for, with the least peak
// strain, inside the room it's given. Its ends are fixed (where it grows from, where it holds what it moves); what's
// between them is free to find its own form. The search is CMA-ES (no gradients needed: the solver is a black box,
// snap-throughs and all), from the best of a scatter of starting shapes.
import { curvePath, curveSolver } from './curves.mjs';
import { shapeOf } from './beams.mjs';

const clamp = (x) => Math.min(1, Math.max(0, x));

// The eigenvectors and eigenvalues of a symmetric matrix (Jacobi's rotations): C = B diag(D) Bᵀ
function eigen(C, n) {
  const A = C.map((r) => [...r]), B = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const bkp = B[k][p], bkq = B[k][q]; B[k][p] = c * bkp - s * bkq; B[k][q] = s * bkp + c * bkq; }
    }
  }
  return { B, D: A.map((r, i) => Math.max(1e-20, r[i])) };
}

// CMA-ES (Hansen, The CMA Evolution Strategy: A Tutorial, 2016) on [0, 1]^n: each trial clamped into the box, and
// charged for how far outside it was, so the search learns the box's walls
function cmaes(f, x0, { sigma = 0.2, evaluations = 2000, random }) {
  const n = x0.length, lambda = 4 + Math.floor(3 * Math.log(n)), mu = Math.floor(lambda / 2);
  const w0 = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1)), sw = w0.reduce((a, b) => a + b, 0), w = w0.map((x) => x / sw), mueff = 1 / w.reduce((a, x) => a + x * x, 0);
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n), cs = (mueff + 2) / (n + mueff + 5), c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff)), damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  const gauss = () => { let u = 0, v = 0; while (!u) u = random(); while (!v) v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let m = [...x0], C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j))), pc = Array(n).fill(0), ps = Array(n).fill(0), used = 0, best = { x: x0.map(clamp), f: f(x0.map(clamp)) }, stall = 0;
  used++;
  while (used + lambda <= evaluations) {
    const { B, D } = eigen(C, n), sd = D.map(Math.sqrt);
    const pop = Array.from({ length: lambda }, () => {
      const z = Array.from({ length: n }, gauss), y = B.map((row) => row.reduce((a, b, j) => a + b * sd[j] * z[j], 0)), x = m.map((mi, i) => mi + sigma * y[i]);
      const c = x.map(clamp), out = x.reduce((a, xi, i) => a + (xi - c[i]) ** 2, 0), v = f(c) + out;
      return { x, y, c, v };
    });
    used += lambda;
    pop.sort((a, b) => a.v - b.v);
    if (pop[0].v < best.f - 1e-6 * (1 + Math.abs(best.f))) { best = { x: pop[0].c, f: pop[0].v }; stall = 0; } else stall++;
    const old = m, yw = Array(n).fill(0);
    for (let k = 0; k < mu; k++) for (let i = 0; i < n; i++) yw[i] += w[k] * pop[k].y[i];
    m = old.map((x, i) => x + sigma * yw[i]);
    // Cumulation: C^(-1/2) yw = B diag(1/√D) Bᵀ yw
    const bt = B[0].map((_, j) => B.reduce((a, row, i) => a + row[j] * yw[i], 0) / sd[j]), cinv = B.map((row) => row.reduce((a, b, j) => a + b * bt[j], 0));
    ps = ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * cinv[i]);
    const psn = Math.sqrt(ps.reduce((a, x) => a + x * x, 0)), hsig = psn / Math.sqrt(1 - (1 - cs) ** (2 * (used / lambda))) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    pc = pc.map((p, i) => (1 - cc) * p + hsig * Math.sqrt(cc * (2 - cc) * mueff) * yw[i]);
    C = C.map((row, i) => row.map((cij, j) => (1 - c1 - cmu) * cij + c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * cij) + cmu * pop.slice(0, mu).reduce((a, p, k) => a + w[k] * p.y[i] * p.y[j], 0)));
    sigma *= Math.exp((cs / damps) * (psn / chiN - 1));
    if (sigma * Math.sqrt(Math.max(...D)) < 1e-4 || stall > 20 + (30 * n) / lambda) break;
  }
  return { ...best, used };
}

// The least distance between segments ab and cd (zero if they cross)
function segments(a, b, c, d) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  if (Math.sign(cross(a, b, c)) !== Math.sign(cross(a, b, d)) && Math.sign(cross(c, d, a)) !== Math.sign(cross(c, d, b))) return 0;
  const to = (p, u, v) => { const ex = v[0] - u[0], ey = v[1] - u[1], l2 = ex * ex + ey * ey, t = l2 ? Math.max(0, Math.min(1, ((p[0] - u[0]) * ex + (p[1] - u[1]) * ey) / l2)) : 0; return Math.hypot(p[0] - u[0] - t * ex, p[1] - u[1] - t * ey); };
  return Math.min(to(a, c, d), to(b, c, d), to(c, a, b), to(d, a, b));
}

// How far a centreline comes closer to itself than its thickness and a gap allow, segment against segment (parts of
// it far enough apart along it that they could touch; a crossing counts in full): the shortfalls squared, as shares
function crowding(path, at, gap) {
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  let bad = 0;
  for (let i = 0; i + 1 < path.length; i++) for (let j = i + 2; j + 1 < path.length; j++) {
    const need = (Math.max(at[i], at[i + 1]) + Math.max(at[j], at[j + 1])) / 2 + gap;
    if (along[j] - along[i + 1] < Math.PI * need) continue; // neighbours along it, or round a bend's own width
    const d = segments(path[i], path[i + 1], path[j], path[j + 1]);
    if (d < need) bad += ((need - d) / need) ** 2;
  }
  return bad;
}

/**
 * Shape a curve flexure for a job.
 * @param {{ root: number[], tip: number[], start?: number | number[], end?: number | number[], controls?: number,
 *   guess?: number[][], region: { lo: number[], hi: number[] }, thickness: number[], moves?: 'x' | 'y', travel: number,
 *   energy: number, width: number, material: { E: number, strainLimit: number }, mirror?: number, across?: 'free' | 'held',
 *   margin?: number, gap?: number, apart?: number, bend?: number, evaluations?: number, starts?: number, runs?: number, sigma?: number, seed?: number, smooth?: number }} job
 *   root, tip: where its ends are fixed; start, end: the angle it leaves the root at and meets the tip at, in degrees,
 *   fixed or a range [lo, hi] to choose in; controls: how many points between them (default 3), starting at `guess` or
 *   bowed off the straight line; region: the box it stays in, thickness and all (and `gap` clear of its edges);
 *   bend: the tightest it may curve, in thicknesses (default 2: tighter, a curved beam's inside fibre takes much more
 *   than beam theory says, which the finite-element check finds); apart: how far apart its own parts keep (default 1 mm, or the gap if more: a loop that comes nearer may print fused,
 *   and slaps its neighbour when it fires); thickness: [least, most]; width: the print's height, or a range [least, most] to choose in, the energy setting it;
 *   travel: how far the tip moves along `moves`, signed; energy: what it must store there (mJ,
 *   both arms when mirrored); margin: the share of the strain limit it's shaped to (default 0.8)
 * @returns {{ params: object, energy: number, strain: number, force: number[][], ok: boolean, why: string[], evaluations: number }}
 *   params: the curve's, ready for a lamina joint (kind 'curve'); force: [travel, force] along the way
 */
export function shapeCurve(job) {
  const { root, tip, region, thickness: [least, most], travel, energy: want, width, material, margin = 0.8, gap = 0, smooth = 8 } = job, controls = job.guess?.length ?? job.controls ?? 3, apart = job.apart ?? Math.max(gap, 1), bend = job.bend ?? 2;
  const limit = material.strainLimit * margin, ranged = (a) => Array.isArray(a), span = (a, u) => a[0] + (a[1] - a[0]) * u;
  const lo = [region.lo[0] + gap, region.lo[1] + gap], hi = [region.hi[0] - gap, region.hi[1] - gap];
  // The unknowns, each 0 to 1: the points between the ends (x, y across the region), the thickness at every point, the end angles that are ranges
  const npts = controls + 2;
  const decode = (u) => {
    let k = 0;
    const mid = Array.from({ length: controls }, () => [span([lo[0], hi[0]], u[k++]), span([lo[1], hi[1]], u[k++])]);
    const thickness = Array.from({ length: npts }, () => span([least, most], u[k++]));
    const start = ranged(job.start) ? span(job.start, u[k++]) : job.start, end = ranged(job.end) ? span(job.end, u[k++]) : job.end;
    return { points: [root, ...mid, tip], thickness, ...(job.lead != null ? { lead: job.lead } : {}), ...(start != null ? { start } : {}), ...(end != null ? { end } : {}), smooth, width, moves: job.moves ?? 'y', ...(job.mirror != null ? { mirror: job.mirror } : {}), ...(job.across ? { across: job.across } : {}) };
  };
  const guess = job.guess ?? Array.from({ length: controls }, (_, i) => { // bowed off the straight line between the ends, towards the region's middle
    const a = (i + 1) / (controls + 1), x = root[0] + (tip[0] - root[0]) * a, y = root[1] + (tip[1] - root[1]) * a, c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], b = Math.sin(Math.PI * a) * 0.5;
    return [x + (c[0] - x) * b, y + (c[1] - y) * b];
  });
  const u0 = [...guess.flatMap(([x, y]) => [(x - lo[0]) / (hi[0] - lo[0]), (y - lo[1]) / (hi[1] - lo[1])]), ...Array(npts).fill(0.2), ...(ranged(job.start) ? [0.5] : []), ...(ranged(job.end) ? [0.5] : [])].map(clamp);

  // How the shape does: its geometry first (in the room, no bend tighter than its thickness, clear of itself), then
  // solved at the most width it may have (its energy goes as its width; its strain doesn't)
  const wide = ranged(width) ? width[1] : width;
  const judge = (params, full = false) => {
    const c = curvePath({ ...params, smooth: Math.max(smooth, 8) }), why = [], faults = { room: 0, bend: 0, crowd: 0, drawn: 0 }; // (its geometry checked finely, whatever it's solved on)
    c.path.forEach(([x, y], i) => {
      const h = c.at[i] / 2, near = Math.min(Math.hypot(x - root[0], y - root[1]), Math.hypot(x - tip[0], y - tip[1])) < 2 * c.at[i]; // the ends sit on their blocks, at the room's edge
      if (!near) for (const d of [0, 1]) faults.room += ((Math.max(0, lo[d] - ([x, y][d] - h)) + Math.max(0, [x, y][d] + h - hi[d])) / c.at[i]) ** 2;
      if (i > 0 && i < c.path.length - 1) { // the bend's radius from three samples: tighter than `bend` thicknesses, its inside fibre takes much more than beam theory says
        const a = c.path[i - 1], b = c.path[i + 1], A = Math.hypot(x - a[0], y - a[1]), B = Math.hypot(b[0] - x, b[1] - y), C = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const cross = Math.abs((x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])), R = cross > 1e-12 ? (A * B * C) / (2 * cross) : Infinity;
        faults.bend += Math.max(0, (bend * c.at[i] - R) / c.at[i]) ** 2;
      }
    });
    faults.crowd = crowding(c.path, c.at, apart);
    const geometry = () => faults.room + faults.bend + faults.crowd + faults.drawn;
    if (faults.room) why.push('it leaves its room');
    if (faults.bend) why.push(`it bends tighter than ${bend} times its thickness`);
    if (faults.crowd) why.push('it comes too close to itself');
    if (geometry() > 1 && !full) return { f: 1e4 + geometry(), why, faults }; // worse than any shape that solves, however strained
    // In two steps (the force halfway shows a snap-through), each one Newton solve to a working tolerance; the shape
    // found is solved again finely at the end
    const s = curveSolver({ ...params, width: wide }, material), steps = full ? 8 : 2, force = [[0, 0]];
    let r = null, back = 0;
    for (let k = 1; k <= steps; k++) {
      r = s.solve((travel * k) / steps, Math.abs(travel) / steps, full ? 1e-7 : 1e-6);
      if (!r.converged) break;
      force.push([(travel * k) / steps, r.force]);
      if (r.force * Math.sign(travel) <= 0) back++;
    }
    if (!r?.converged) return { f: 5e3 + geometry(), why: [...why, 'the solver lost it: it snaps or folds'], faults };
    // Drawn, it mustn't run into itself either
    const coarse = curvePath({ ...params, smooth }).at; // (the solved shape is on the solver's samples)
    faults.drawn = crowding(Object.values(shapeOf(s.sys, r.q).lines)[0], coarse, gap / 2);
    if (faults.drawn) why.push('drawn, it runs into itself');
    const e = r.strain / limit, short = Math.max(0, 1 - r.energy / want);
    if (short > 0.02) why.push(`it stores ${r.energy.toFixed(1)} mJ${ranged(width) ? ` at its widest, ${wide} mm` : ''}, short of ${want.toFixed(1)}`);
    if (e > 1) why.push(`its peak strain ${(r.strain * 100).toFixed(2)}% is over ${(limit * 100).toFixed(2)}%`);
    if (back) why.push('it snaps through: its force turns back on the way');
    // On a log scale, so a shape far off (a stretched arm, a hundred times the strain) still has a way down; any fault
    // in its geometry costs more than any strain it could save
    return { f: Math.log1p(e) + 10 * Math.log1p(short / 0.05) ** 2 + 10 * Math.log1p(Math.max(0, e - 1) / 0.05) ** 2 + 2 * back + 50 * geometry() + (geometry() > 0 ? 1 : 0), why, faults, energy: r.energy, strain: r.strain, force };
  };
  if (job.check) return judge({ ...job.check, width: wide }, true); // a shape of your own, judged for the job
  let best = null, used = 0;
  const f = (u) => judge(decode(u)).f;
  // Starts: the guess, and shapes scattered about the room (the same each run), the best taken on
  let seed = job.seed ?? 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // (given a guess, the starts are near it: a shape of a known kind, varied; with none, anywhere in the room)
  const gauss = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
  const starts = [u0, ...Array.from({ length: job.starts ?? 24 }, () => u0.map((x, i) => (job.guess ? clamp(x + (job.scatter ?? 0.03) * gauss()) : i < controls * 2 ? random() : 0.2 + 0.6 * random())))];
  // Searched from the few best starts in turn (the landscape has many valleys: an arm looping one way or the other),
  // each with its share of the evaluations left; the best kept
  const ranked = starts.map((u) => ({ x: u, f: f(u) })).sort((a, b) => a.f - b.f), runs = Math.min(job.runs ?? 3, ranked.length);
  used += starts.length;
  for (let k = 0; k < runs; k++) {
    const r = cmaes(f, ranked[k].x, { sigma: job.sigma ?? (job.guess ? 0.05 : 0.15), evaluations: Math.floor(((job.evaluations ?? 6000) - used) / (runs - k)), random });
    used += r.used;
    if (!best || r.f < best.f) best = r;
  }
  // The width that stores what's asked (no less than the least it may have), and the energy and force at it
  const params = decode(best.x), out = judge(params, true), w = ranged(width) ? Math.min(width[1], Math.max(width[0], (want / (out.energy || 1)) * wide)) : width, k = w / wide;
  return { params: { ...params, width: w }, width: w, energy: out.energy * k, strain: out.strain, force: out.force?.map(([d, F]) => [d, F * k]), ok: !out.why?.length, why: out.why ?? [], faults: out.faults, evaluations: used, score: out.f };
}

/**
 * A meander to start shaping from: legs across the room from the root to the tip, joined by round bends (a bow's
 * limb folded to fit), as the points between the ends. Shaping then moves every point and thickness from there.
 * @param {{ root: number[], tip: number[], legs: number, lo: number, hi: number }} o legs: how many (odd: the first
 *   leaves the root and the last meets the tip going the same way); lo, hi: where the bends turn, across the legs (y)
 * @returns {number[][]}
 */
export function meander({ root, tip, legs, lo, hi }) {
  if (legs % 2 !== 1) throw new Error('a meander from a root to a tip on opposite sides needs an odd number of legs');
  const xs = Array.from({ length: legs }, (_, i) => root[0] + ((tip[0] - root[0]) * i) / (legs - 1)), r = Math.abs(xs[1] - xs[0]) / 2, pts = [];
  const down = root[1] > tip[1];
  for (let i = 0; i < legs - 1; i++) {
    const atLow = (i % 2 === 0) === down, y = atLow ? lo : hi, s = atLow ? 1 : -1; // where this leg's bend turns, and which way the legs run from it
    pts.push([xs[i], y + s * r], [(xs[i] + xs[i + 1]) / 2, y], [xs[i + 1], y + s * r]);
  }
  return pts;
}

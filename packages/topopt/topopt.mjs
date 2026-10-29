// Topology optimisation: where to put a fixed amount of material in a region so the part is as stiff as possible
// under its loads, for flat parts (2D, a plate loaded in its own plane) and solid ones (3D, on cubes). The density
// method (SIMP: solid isotropic material with penalisation): every cell has a density from 0 to 1, stiffness grows as
// density cubed (so part-solid cells are poor value and the result settles into solid and empty), and each step moves
// material towards the cells that stiffen the part most. With a density filter (it sets the thinnest member), an
// optional overhang filter (only material a printer can build without supports), and Heaviside projection (it sharpens
// the result). After Andreassen et al. (2011), "Efficient topology optimization in MATLAB using 88 lines of code",
// Wang, Lazarov and Sigmund (2011), and Langelaar (2017), "An additive manufacturing filter for topology optimization
// of print-ready designs". Or, given a stress limit instead of an amount of material, the lightest layout that keeps
// every cell under it: an augmented Lagrangian on the cells' limits (Senhora, Giraldo-Londoño, Menezes, Paulino 2020),
// stepped by the method of moving asymptotes (Svanberg 1987). No dependencies but @rulecad/fea; runs in browsers and
// Node. Millimetres, newtons, MPa.
//
//   optimise(spec)       the method itself, on a grid: densities, supports and loads by dof
//   mma(...)             the method of moving asymptotes, for other problems with limits
//   discretise(problem)  a problem in shapes (a region, bosses to keep, holes to avoid, loads at points) to a spec
//   outlines(result)     a 2D result's edges as closed loops in mm, solid on the left, smoothed: ready to extrude
//   surface(result)      a 3D result's surface as a closed triangle mesh in mm, smoothed: ready to print
import { grid as makeGrid, cellStiffness, solve, positions, jsBackend, centreStress, vonMises } from '@rulecad/fea';

export { jsBackend };

/**
 * @typedef {{ at: number[], r: number } | { at: number[], size: number[] } | { at: number[], r: number, length: number, axis?: 'x' | 'y' | 'z', teardrop?: string } | { points: [number, number][] } | { triangles: number[][][] }} Region
 *   in mm: a circle (2D) or sphere (3D) at, r; a box at (its centre), size; a cylinder at (its centre), r, length,
 *   along axis (default z; teardrop '+z', '-y', …: a 45° point that way, across the axis, so it prints); a polygon (2D);
 *   or a closed triangle mesh (3D: a design's part)
 */
/** @typedef {Region & { fix?: string }} Support holds the nodes in the region (on material): fix the directions, 'xy' or 'xyz' (default all) */
/** @typedef {Region & { force: number[], case?: string }} Load a force in N, shared by the nodes in the region */
/**
 * @typedef {object} Problem
 * @property {Region | Region[]} space where material may go
 * @property {Region[]} [keep] must stay solid (bosses round bolt holes)
 * @property {Region[]} [avoid] must stay empty (the holes, clearances); avoid wins over keep
 * @property {Support[]} supports
 * @property {Load[]} loads each in its load case (default "load"); cases are optimised together
 * @property {Record<string, number>} [cases] each case's weight (default 1)
 * @property {{ E: number, nu: number }} material
 * @property {number} [thickness] mm, for a 2D problem
 * @property {number} cell the grid's cell size, mm
 * @property {number} volume the share of the space to fill, 0 to 1 (keep regions count towards it)
 * @property {number} [filter] the filter radius in mm: about the thinnest member (default 1.5 cells)
 * @property {number} [penal] the penalty (default 3)
 * @property {boolean} [projection] sharpen with Heaviside projection (default true)
 * @property {string} [overhang] printed this way up ('+z', '-y', …): only material supported from below at 45° or less
 * @property {number} [steps] at most this many steps (default 300)
 */

/**
 * A problem described in shapes, on a grid: each cell inside the space (or a keep region) is free, kept or avoided;
 * supports and loads go on the nodes in or near them that touch material that may be solid. A 3D grid's sides are
 * rounded up to a multiple of 2, 4 or 8 cells (extra cells are outside the space), so multigrid can halve it.
 * @param {Problem} p
 * @returns {object} a spec for optimise(), with origin (the grid's lowest corner, mm) and regions
 */
export function discretise(p) {
  const space = [p.space].flat(), keep = p.keep || [], avoid = p.avoid || [], dim = dimension(space[0]);
  if (!(p.cell > 0)) throw new Error('the cell size must be more than 0 mm');
  for (const r of [...space, ...keep, ...avoid]) if (dimension(r) !== dim) throw new Error(`a ${dimension(r)}D region in a ${dim}D problem: give every region ${dim === 3 ? 'x, y and z' : 'x and y'}`);
  const all = [...space, ...keep].map(bounds), lo = [], hi = [], n = [];
  for (let a = 0; a < dim; a++) {
    lo.push(Math.min(...all.map((b) => b[a]))); hi.push(Math.max(...all.map((b) => b[dim + a])));
    n.push(Math.max(1, Math.round((hi[a] - lo[a]) / p.cell)));
  }
  if (dim === 3) { // whole numbers of 2, 4 or 8 cells along every side, for multigrid
    const q = Math.min(...n) >= 16 ? 8 : Math.min(...n) >= 8 ? 4 : 2, build = /^([+-])([xyz])$/.exec(p.overhang ?? '');
    for (let a = 0; a < 3; a++) {
      n[a] = Math.ceil(n[a] / q) * q;
      // The padding split evenly round the space, so a round space sits in the middle of its grid (all on one side, a
      // round wall ran along the grid's edge there and drew as flat blocks). Along the build direction the bed's side
      // stays flush, so the first layer sits on the bed.
      const pad = n[a] * p.cell - (hi[a] - lo[a]);
      lo[a] -= build && 'xyz'.indexOf(build[2]) === a ? (build[1] === '-' ? pad : 0) : pad / 2;
    }
  }
  const size = dim === 3 ? { nx: n[0], ny: n[1], nz: n[2], h: p.cell } : { nx: n[0], ny: n[1], h: p.cell };
  const g = makeGrid(size), origin = lo, h = p.cell;
  // Each cell by its centre: 1 kept, -1 avoided, -2 outside (which doesn't count towards the volume), 0 free
  const passive = new Int8Array(g.cells), test = (rs) => { const f = rs.map(insider); return (c) => f.some((t) => t(c)); };
  const inSpace = test(space), inKeep = test(keep), inAvoid = test(avoid);
  for (let e = 0; e < g.cells; e++) {
    const i = e % n[0], j = Math.floor(e / n[0]) % n[1], k = dim === 3 ? Math.floor(e / (n[0] * n[1])) : 0;
    const c = [origin[0] + (i + 0.5) * h, origin[1] + (j + 0.5) * h, ...(dim === 3 ? [origin[2] + (k + 0.5) * h] : [])];
    const kept = inKeep(c), within = kept || inSpace(c);
    passive[e] = !within ? -2 : inAvoid(c) ? -1 : kept ? 1 : 0;
  }
  const at = positions(g).map((q) => q.map((v, a) => v + origin[a]));
  // A node is on material if a cell it's a corner of may be solid
  const onMaterial = new Uint8Array(g.nodes), corners = 1 << dim;
  for (let e = 0; e < g.cells; e++) if (passive[e] >= 0) for (let k = 0; k < corners; k++) onMaterial[g.edof[e * g.cellDofs + dim * k] / dim] = 1;
  // The nodes a support or load acts on: within r (and three quarters of a cell) of a point, or in a region grown by as much
  const select = (r, what) => {
    const grown = grow(r, h * 0.75), within = r.size || r.points || r.triangles || r.length != null ? insider(grown) : (q) => dist(q, r.at) <= (r.r || 0) + h * 0.75;
    const found = [];
    for (let m = 0; m < g.nodes; m++) if (onMaterial[m] && within(at[m])) found.push(m);
    if (!found.length) throw new Error(`${what}${r.at ? ` at ${r.at.map(fmt).join(', ')}` : ''} isn't on any material: move it onto the space or a keep region, or make it bigger`);
    return found;
  };
  const axes = 'xyz'.slice(0, dim), fixed = new Uint8Array(g.dofs);
  for (const s of p.supports || []) for (const m of select(s, 'a support')) for (let a = 0; a < dim; a++) if ((s.fix || axes).includes(axes[a])) fixed[dim * m + a] = 1;
  const names = [...new Set((p.loads || []).map((l) => l.case || 'load'))];
  if (!names.length) throw new Error('a problem needs at least one load');
  const loads = names.map((name) => {
    const f = new Float64Array(g.dofs), mine = p.loads.filter((x) => (x.case || 'load') === name), total = new Array(dim).fill(0);
    for (const l of mine) {
      if (l.force.length !== dim) throw new Error(`the load "${name}" needs a force with ${dim} parts (${axes.split('').join(', ')})`);
      const ns = select(l, `the load "${name}"`);
      for (const m of ns) for (let a = 0; a < dim; a++) f[dim * m + a] += l.force[a] / ns.length;
      for (let a = 0; a < dim; a++) total[a] += l.force[a];
    }
    return { name, force: f, weight: p.cases?.[name] ?? 1, size: Math.hypot(...total) };
  });
  return {
    grid: size, origin, passive, fixed, loads,
    material: p.material, thickness: p.thickness, volume: p.volume,
    filter: p.filter ?? p.cell * 1.5, penal: p.penal ?? 3, projection: p.projection ?? true, steps: p.steps ?? (p.stress ? 1000 : 300),
    ...(p.overhang ? { overhang: p.overhang } : {}), ...(p.stress ? { stress: p.stress } : {}),
    regions: { keep, avoid },
  };
}

/**
 * The density filter: each cell's filtered density is the weighted average of the cells within radius (weights
 * falling linearly to 0 at the radius). apply filters densities; adjoint carries sensitivities back through it.
 * @param {{ nx: number, ny: number, nz?: number }} size @param {number} radius in cells
 */
export function densityFilter({ nx, ny, nz = 1 }, radius) {
  const reach = Math.ceil(radius) - 1, cells = nx * ny * nz, rz = nz > 1 ? reach : 0;
  // Each cell's neighbours and their weights, as flat arrays (row r's are at start[r] to start[r + 1])
  const start = new Int32Array(cells + 1), index = [], weight = [], total = new Float64Array(cells);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = (k * ny + j) * nx + i;
    for (let c = Math.max(0, k - rz); c <= Math.min(nz - 1, k + rz); c++) for (let b = Math.max(0, j - reach); b <= Math.min(ny - 1, j + reach); b++) for (let a = Math.max(0, i - reach); a <= Math.min(nx - 1, i + reach); a++) {
      const w = radius - Math.hypot(a - i, b - j, c - k);
      if (w > 0) { index.push((c * ny + b) * nx + a); weight.push(w); total[e] += w; } // total: fewer neighbours at the edges
    }
    start[e + 1] = index.length;
  }
  const at = Int32Array.from(index), w = Float64Array.from(weight), scaled = new Float64Array(cells);
  return {
    apply(x, out) {
      for (let e = 0; e < cells; e++) { let s = 0; for (let k = start[e]; k < start[e + 1]; k++) s += w[k] * x[at[k]]; out[e] = s / total[e]; }
      return out;
    },
    adjoint(x, out) {
      for (let e = 0; e < cells; e++) scaled[e] = x[e] / total[e];
      for (let e = 0; e < cells; e++) { let s = 0; for (let k = start[e]; k < start[e + 1]; k++) s += w[k] * scaled[at[k]]; out[e] = s; }
      return out;
    },
  };
}

/**
 * The overhang filter (Langelaar 2017): printed layer by layer from the bed, a cell can only be as solid as the
 * material under it: the cell itself and its neighbours along each side, in the layer below (3 cells in 2D, 5 in 3D,
 * so nothing overhangs by more than 45°). Smooth minimum and maximum keep it differentiable. apply gives the printable
 * densities; adjoint carries sensitivities back through it.
 * @param {{ nx: number, ny: number, nz?: number }} size @param {string} up the build direction: '+z', '-x', …
 */
export function overhangFilter({ nx, ny, nz = 1 }, up) {
  const n = nz > 1 ? [nx, ny, nz] : [nx, ny], dim = n.length, ax = 'xyz'.indexOf(up.at(-1)), sign = up[0] === '-' ? -1 : 1;
  if (ax < 0 || ax >= dim) throw new Error(`overhang: the build direction is ${dim === 3 ? '+x, -x, +y, -y, +z or -z' : '+x, -x, +y or -y'} (got ${up})`);
  const cells = n.reduce((p, c) => p * c, 1), stride = [1, nx, nx * ny];
  const P = 40, eps = 1e-4, xi0 = 0.5;
  // Layers in build order, and each cell's supports: the cell below it and that cell's neighbours along each other axis
  const layer = (e) => { const c = Math.floor(e / stride[ax]) % n[ax]; return sign > 0 ? c : n[ax] - 1 - c; };
  const order = Array.from({ length: cells }, (_, e) => e).sort((a, b) => layer(a) - layer(b));
  const supports = new Array(cells);
  for (let e = 0; e < cells; e++) {
    if (layer(e) === 0) { supports[e] = null; continue; }
    const below = e - sign * stride[ax], list = [below];
    for (let a = 0; a < dim; a++) if (a !== ax) {
      const c = Math.floor(below / stride[a]) % n[a];
      if (c > 0) list.push(below - stride[a]);
      if (c < n[a] - 1) list.push(below + stride[a]);
    }
    supports[e] = Int32Array.from(list);
  }
  const printed = new Float64Array(cells), dSum = new Float64Array(cells), dX = new Float64Array(cells), sums = new Float64Array(cells);
  return {
    apply(x, out) {
      for (const e of order) {
        const sup = supports[e];
        if (!sup) { printed[e] = x[e]; dX[e] = 1; continue; }
        let s = 0;
        for (const q of sup) s += Math.pow(printed[q], P);
        if (s < 1e-200) s = 0; // nothing worth the name below (and no denormals for the gradient to blow up on)
        const Q = P + Math.log(sup.length) / Math.log(xi0), smax = s > 0 ? Math.pow(s, 1 / Q) : 0;
        sums[e] = s;
        const d = x[e] - smax, root = Math.sqrt(d * d + eps);
        printed[e] = 0.5 * (x[e] + smax - root + Math.sqrt(eps));
        dX[e] = 0.5 * (1 - d / root); dSum[e] = 0.5 * (1 + d / root); // d printed / d x, d printed / d smax
      }
      out.set(printed);
      return out;
    },
    // Back from the last layer: each cell's sensitivity, plus what it passes on to the cells it supports
    adjoint(g, out) {
      const lambda = Float64Array.from(g);
      for (let t = cells - 1; t >= 0; t--) {
        const e = order[t], sup = supports[e];
        if (!sup || !sums[e]) continue;
        const Q = P + Math.log(sup.length) / Math.log(xi0), common = lambda[e] * dSum[e] * (1 / Q) * Math.pow(sums[e], 1 / Q - 1) * P;
        for (const q of sup) lambda[q] += common * Math.pow(printed[q], P - 1);
      }
      for (let e = 0; e < cells; e++) out[e] = lambda[e] * dX[e];
      return out;
    },
  };
}

/**
 * The problem as a function of the design densities x (one per cell, 0 to 1), at projection sharpness beta:
 * physical(x, beta) gives the densities the part is made of (filtered, printable, projected, kept and avoided cells
 * set); evaluate(x, beta) analyses it and gives the compliance (summed over the load cases by weight, N·mm) and its
 * gradient with respect to x (dc), with the gradient of the material used (dv). Cases weighted 0 are only solved with
 * evaluate(x, beta, { all: true }).
 * @param {ReturnType<typeof discretise>} spec
 * @param {{ method?: 'direct' | 'cg' | 'mg', backend?: typeof jsBackend }} [options]
 */
export function model(spec, { method, backend = jsBackend } = {}) {
  const g = makeGrid(spec.grid), dim = g.dim, cells = g.cells, m = g.cellDofs, ke = cellStiffness(spec.material.nu, dim);
  const { passive, penal } = spec, E = spec.material.E, Emin = E * 1e-9, eta = 0.5, size = dim === 3 ? g.h : spec.thickness;
  const solver = method || (dim === 3 ? 'mg' : 'direct'), tol = solver === 'direct' ? undefined : 1e-6;
  const filter = densityFilter(spec.grid, spec.filter / spec.grid.h), print = spec.overhang ? overhangFilter(spec.grid, spec.overhang) : null;
  const tilde = new Float64Array(cells), made = new Float64Array(cells), phys = new Float64Array(cells), scale = new Float64Array(cells), back = new Float64Array(cells);
  const fixedValue = (p) => (p === 1 ? 1 : 0);
  // Heaviside projection about eta: steeper as beta grows, so densities are pushed to 0 or 1 (Wang, Lazarov, Sigmund 2011)
  const denominator = (beta) => Math.tanh(beta * eta) + Math.tanh(beta * (1 - eta));
  const project = (t, beta) => (spec.projection ? (Math.tanh(beta * eta) + Math.tanh(beta * (t - eta))) / denominator(beta) : t);
  const slope = (t, beta) => (spec.projection ? (beta * (1 - Math.tanh(beta * (t - eta)) ** 2)) / denominator(beta) : 1);
  const physical = (x, beta) => {
    filter.apply(x, tilde);
    if (print) print.apply(tilde, made); else made.set(tilde);
    for (let e = 0; e < cells; e++) phys[e] = passive[e] ? fixedValue(passive[e]) : project(made[e], beta);
    return phys;
  };
  let last = null;
  // Each step solves only the load cases it optimises for (weight above 0); every case is solved when all is set
  const evaluate = (x, beta, { all = false, multipliers } = {}) => {
    physical(x, beta);
    for (let e = 0; e < cells; e++) scale[e] = size * (Emin + Math.pow(phys[e], penal) * (E - Emin));
    const active = spec.loads.map((l, c) => (all || l.weight > 0 ? c : -1)).filter((c) => c >= 0);
    const run = solve(g, { scale, ke, fixed: spec.fixed, loads: active.map((c) => spec.loads[c].force), method: solver, backend, start: last && active.map((c) => last[c]), ...(tol ? { tol } : {}) }), solved = run.u;
    const u = spec.loads.map((_, c) => (active.includes(c) ? solved[active.indexOf(c)] : last?.[c] || null));
    last = u;
    // Compliance, and its gradient with respect to each cell's physical density: −p ρ^(p−1) (E − Emin) size · uₑᵀ kₑ uₑ
    // (the load is fixed, so the adjoint is the displacement itself)
    let compliance = 0;
    const dc = new Float64Array(cells), dv = new Float64Array(cells);
    spec.loads.forEach((l, c) => {
      const w = l.weight, uc = u[c];
      if (!w || !active.includes(c)) return;
      for (let e = 0; e < cells; e++) {
        let ce = 0;
        const o = e * m;
        for (let a = 0; a < m; a++) { let s = 0; for (let b = 0; b < m; b++) s += ke[a * m + b] * uc[g.edof[o + b]]; ce += uc[g.edof[o + a]] * s; }
        compliance += w * scale[e] * ce;
        dc[e] -= w * penal * Math.pow(phys[e], penal - 1) * (E - Emin) * size * ce;
      }
    });
    // Back through the projection, the overhang filter and the density filter to the design densities; kept and
    // avoided cells don't change
    for (let e = 0; e < cells; e++) { const s = passive[e] ? 0 : slope(made[e], beta); dc[e] *= s; dv[e] = s; }
    const toDesign = (d) => { if (print) { print.adjoint(d, back); d.set(back); } filter.adjoint(d, back); d.set(back); };
    toDesign(dc); toDesign(dv);
    const stress = Ss ? stressLimits(u, active, run.again, multipliers || { lam: active.map(() => new Float64Array(cells * Ss.length)), mu: 1 }) : null;
    const cases = spec.loads.map((l, c) => {
      if (!u[c]) return { name: l.name, compliance: NaN, deflection: NaN, stiffness: NaN };
      const ci = jsBackend.dot(l.force, u[c]), deflection = l.size ? ci / l.size : 0;
      return { name: l.name, compliance: ci, deflection, stiffness: deflection ? l.size / deflection : Infinity };
    });
    if (stress) { for (let e = 0; e < cells; e++) stress.d[e] *= passive[e] ? 0 : slope(made[e], beta); toDesign(stress.d); }
    return { compliance, dc, dv, u, cases, ...(stress ? { stress } : {}) };
  };
  // Stress limits on every cell (Senhora, Giraldo-Londoño, Menezes, Paulino 2020): each cell's von Mises stress at its
  // centre, as if solid, over the limit, less 1, times the cell's density, so an empty cell's limit vanishes. They're
  // kept by an augmented Lagrangian: J = Σ (λ h + μ h² / 2) / N, h = max(g, −λ/μ), whose gradient takes one adjoint
  // solve per load case. Every cell in the space is limited, those where supports and loads act too: a load on a
  // point is a stress there, so give supports and loads some area (a hole's edge, a pad).
  const rows = dim === 3 ? 6 : 3, Ss = spec.stress ? [centreStress(g.h, spec.material.nu, dim)] : null;
  const limited = Uint8Array.from(passive, (p) => (p >= 0 ? 1 : 0));
  const stressLimits = (u, active, again, { lam, mu }) => {
    const P = Ss.length, N = Math.max(1, limited.reduce((a, b) => a + b, 0) * active.length * P), st = new Float64Array(rows), gr = new Float64Array(rows);
    const d = new Float64Array(cells), h = active.map(() => new Float64Array(cells * P));
    let J = 0, peak = 0;
    const rhs = active.map((c, k) => {
      const r = new Float64Array(g.dofs);
      for (let e = 0; e < cells; e++) {
        if (!limited[e]) continue;
        const o = e * m;
        Ss.forEach((S, pi) => {
          for (let q = 0; q < rows; q++) { let t = 0; for (let a = 0; a < m; a++) t += S[q * m + a] * u[c][g.edof[o + a]]; st[q] = E * t; }
          const vm = vonMises(st, dim, gr), over = vm / spec.stress, ge = phys[e] * (over - 1), j = e * P + pi, l = lam[k][j], he = Math.max(ge, -l / mu);
          h[k][j] = he; J += (l * he + (mu / 2) * he * he) / N;
          if (phys[e] >= 0.5) peak = Math.max(peak, vm);
          if (ge <= -l / mu) return;
          const w = (l + mu * he) / N, f = (w * phys[e] * E) / spec.stress;
          d[e] += w * (over - 1);
          for (let a = 0; a < m; a++) { let t = 0; for (let q = 0; q < rows; q++) t += S[q * m + a] * gr[q]; r[g.edof[o + a]] += f * t; }
        });
      }
      return r;
    });
    const adjoint = again(rhs);
    active.forEach((c, k) => {
      const uc = u[c], lc = adjoint[k];
      for (let e = 0; e < cells; e++) {
        if (passive[e]) continue;
        let t = 0;
        const o = e * m;
        for (let a = 0; a < m; a++) { let q = 0; for (let b = 0; b < m; b++) q += ke[a * m + b] * uc[g.edof[o + b]]; t += lc[g.edof[o + a]] * q; }
        d[e] -= penal * Math.pow(phys[e], penal - 1) * (E - Emin) * size * t;
      }
    });
    return { J, d, h, peak };
  };
  return { physical, evaluate, cells, passive, limits: Ss ? cells * Ss.length : 0 };
}

/**
 * The method of moving asymptotes (Svanberg 1987, as his 2007 mmasub and subsolv): one step of minimising f0(x)
 * subject to fi(x) ≤ 0, i = 1..m, xmin ≤ x ≤ xmax, from values and gradients at x. Each step solves a convex
 * approximation, separable in x, by a primal-dual interior-point method. Keeps its asymptotes between steps.
 * @param {{ n: number, m: number, xmin: Float64Array, xmax: Float64Array, move?: number }} o
 */
export function mma({ n, m, xmin, xmax, move = 0.5 }) {
  const low = new Float64Array(n), upp = new Float64Array(n), xold1 = new Float64Array(n), xold2 = new Float64Array(n);
  const a0 = 1, a = new Float64Array(m), c = new Float64Array(m).fill(1000), d = new Float64Array(m).fill(1);
  let iter = 0;
  /**
   * @param {Float64Array} x the design (changed in place to the next)
   * @param {number} f0 @param {Float64Array} df0 @param {number[]} f @param {Float64Array[]} df
   * @param {number} [stepMove] this step's move limit, a share of xmax − xmin
   */
  return function step(x, f0, df0, f, df, stepMove = move) {
    iter++;
    const raa0 = 1e-5, albefa = 0.1, asyinit = 0.5, asyincr = 1.2, asydecr = 0.7;
    const alfa = new Float64Array(n), beta = new Float64Array(n), p0 = new Float64Array(n), q0 = new Float64Array(n);
    const P = df.map(() => new Float64Array(n)), Q = df.map(() => new Float64Array(n)), b = new Float64Array(m);
    for (let j = 0; j < n; j++) {
      const span = xmax[j] - xmin[j];
      if (iter <= 2) { low[j] = x[j] - asyinit * span; upp[j] = x[j] + asyinit * span; }
      else {
        const zzz = (x[j] - xold1[j]) * (xold1[j] - xold2[j]), f = zzz > 0 ? asyincr : zzz < 0 ? asydecr : 1;
        low[j] = Math.min(x[j] - 0.01 * span, Math.max(x[j] - 10 * span, x[j] - f * (xold1[j] - low[j])));
        upp[j] = Math.max(x[j] + 0.01 * span, Math.min(x[j] + 10 * span, x[j] + f * (upp[j] - xold1[j])));
      }
      alfa[j] = Math.max(low[j] + albefa * (x[j] - low[j]), x[j] - stepMove * span, xmin[j]);
      beta[j] = Math.min(upp[j] - albefa * (upp[j] - x[j]), x[j] + stepMove * span, xmax[j]);
      const inv = 1 / Math.max(span, 1e-5), ux2 = (upp[j] - x[j]) ** 2, xl2 = (x[j] - low[j]) ** 2;
      const pp = Math.max(df0[j], 0), qq = Math.max(-df0[j], 0), pq = 0.001 * (pp + qq) + raa0 * inv;
      p0[j] = (pp + pq) * ux2; q0[j] = (qq + pq) * xl2;
      for (let i = 0; i < m; i++) {
        const pi = Math.max(df[i][j], 0), qi = Math.max(-df[i][j], 0), pqi = 0.001 * (pi + qi) + raa0 * inv;
        P[i][j] = (pi + pqi) * ux2; Q[i][j] = (qi + pqi) * xl2;
        b[i] += P[i][j] / (upp[j] - x[j]) + Q[i][j] / (x[j] - low[j]);
      }
    }
    for (let i = 0; i < m; i++) b[i] -= f[i];
    xold2.set(xold1); xold1.set(x);
    x.set(subsolve({ n, m, low, upp, alfa, beta, p0, q0, P, Q, a0, a, b, c, d }));
  };
}

// The MMA subproblem, by a primal-dual Newton method with the barrier ε shrinking tenfold each round (Svanberg's subsolv)
function subsolve({ n, m, low, upp, alfa, beta, p0, q0, P, Q, a0, a, b, c, d }) {
  let x = new Float64Array(n), xsi = new Float64Array(n), eta = new Float64Array(n);
  let y = new Float64Array(m).fill(1), lam = new Float64Array(m).fill(1), mu = new Float64Array(m), s = new Float64Array(m).fill(1), z = 1, zet = 1;
  for (let j = 0; j < n; j++) { x[j] = (alfa[j] + beta[j]) / 2; xsi[j] = Math.max(1, 1 / (x[j] - alfa[j])); eta[j] = Math.max(1, 1 / (beta[j] - x[j])); }
  for (let i = 0; i < m; i++) mu[i] = Math.max(1, c[i] / 2);
  const residual = (epsi, x, y, z, lam, xsi, eta, mu, zet, s) => {
    let sum = 0, most = 0;
    const add = (r) => { sum += r * r; most = Math.max(most, Math.abs(r)); };
    const gvec = new Float64Array(m);
    for (let j = 0; j < n; j++) {
      const ux = upp[j] - x[j], xl = x[j] - low[j];
      let plam = p0[j], qlam = q0[j];
      for (let i = 0; i < m; i++) { plam += P[i][j] * lam[i]; qlam += Q[i][j] * lam[i]; gvec[i] += P[i][j] / ux + Q[i][j] / xl; }
      add(plam / (ux * ux) - qlam / (xl * xl) - xsi[j] + eta[j]);
      add(xsi[j] * (x[j] - alfa[j]) - epsi); add(eta[j] * (beta[j] - x[j]) - epsi);
    }
    let rez = a0 - zet;
    for (let i = 0; i < m; i++) {
      rez -= a[i] * lam[i];
      add(c[i] + d[i] * y[i] - mu[i] - lam[i]); add(gvec[i] - a[i] * z - y[i] + s[i] - b[i]);
      add(mu[i] * y[i] - epsi); add(s[i] * lam[i] - epsi);
    }
    add(rez); add(zet * z - epsi);
    return [Math.sqrt(sum), most];
  };
  for (let epsi = 1; epsi > 1e-7; epsi *= 0.1) {
    let [norm, most] = residual(epsi, x, y, z, lam, xsi, eta, mu, zet, s);
    for (let it = 0; most > 0.9 * epsi && it < 200; it++) {
      // The Newton step, reduced to m + 1 unknowns (dλ, dz)
      const diagx = new Float64Array(n), delx = new Float64Array(n), gvec = new Float64Array(m), GG = Array.from({ length: m }, () => new Float64Array(n));
      for (let j = 0; j < n; j++) {
        const ux = upp[j] - x[j], xl = x[j] - low[j];
        let plam = p0[j], qlam = q0[j];
        for (let i = 0; i < m; i++) { plam += P[i][j] * lam[i]; qlam += Q[i][j] * lam[i]; gvec[i] += P[i][j] / ux + Q[i][j] / xl; GG[i][j] = P[i][j] / (ux * ux) - Q[i][j] / (xl * xl); }
        delx[j] = plam / (ux * ux) - qlam / (xl * xl) - epsi / (x[j] - alfa[j]) + epsi / (beta[j] - x[j]);
        diagx[j] = 2 * (plam / (ux * ux * ux) + qlam / (xl * xl * xl)) + xsi[j] / (x[j] - alfa[j]) + eta[j] / (beta[j] - x[j]);
      }
      const dely = new Float64Array(m), dellam = new Float64Array(m), diagy = new Float64Array(m), diaglamyi = new Float64Array(m);
      let delz = a0 - epsi / z;
      for (let i = 0; i < m; i++) {
        dely[i] = c[i] + d[i] * y[i] - lam[i] - epsi / y[i];
        delz -= a[i] * lam[i];
        dellam[i] = gvec[i] - a[i] * z - y[i] - b[i] + epsi / lam[i];
        diagy[i] = d[i] + mu[i] / y[i];
        diaglamyi[i] = s[i] / lam[i] + 1 / diagy[i];
      }
      // [Alam a; aᵀ −ζ/z] [dλ; dz] = [bλ; δz]
      const A = Array.from({ length: m + 1 }, () => new Float64Array(m + 2));
      for (let i = 0; i < m; i++) {
        let bl = dellam[i] + dely[i] / diagy[i];
        for (let j = 0; j < n; j++) bl -= (GG[i][j] * delx[j]) / diagx[j];
        for (let k = 0; k < m; k++) { let t = 0; for (let j = 0; j < n; j++) t += (GG[i][j] * GG[k][j]) / diagx[j]; A[i][k] = t + (i === k ? diaglamyi[i] : 0); }
        A[i][m] = a[i]; A[m][i] = a[i]; A[i][m + 1] = bl;
      }
      A[m][m] = -zet / z; A[m][m + 1] = delz;
      const sol = gauss(A), dlam = sol.slice(0, m), dz = sol[m];
      const dx = new Float64Array(n), dy = new Float64Array(m), dxsi = new Float64Array(n), deta = new Float64Array(n), dmu = new Float64Array(m), ds = new Float64Array(m);
      for (let j = 0; j < n; j++) {
        let g = 0; for (let i = 0; i < m; i++) g += GG[i][j] * dlam[i];
        dx[j] = -delx[j] / diagx[j] - g / diagx[j];
        dxsi[j] = -xsi[j] + epsi / (x[j] - alfa[j]) - (xsi[j] * dx[j]) / (x[j] - alfa[j]);
        deta[j] = -eta[j] + epsi / (beta[j] - x[j]) + (eta[j] * dx[j]) / (beta[j] - x[j]);
      }
      for (let i = 0; i < m; i++) {
        dy[i] = -dely[i] / diagy[i] + dlam[i] / diagy[i];
        dmu[i] = -mu[i] + epsi / y[i] - (mu[i] * dy[i]) / y[i];
        ds[i] = -s[i] + epsi / lam[i] - (s[i] * dlam[i]) / lam[i];
      }
      const dzet = -zet + epsi / z - (zet * dz) / z;
      // The longest step that keeps everything positive and x inside [α, β], then halved until the residual falls
      let most2 = 1;
      const ratio = (v, dv) => { for (let k = 0; k < v.length; k++) most2 = Math.max(most2, (-1.01 * dv[k]) / v[k]); };
      ratio(y, dy); ratio([z], [dz]); ratio(lam, dlam); ratio(xsi, dxsi); ratio(eta, deta); ratio(mu, dmu); ratio([zet], [dzet]); ratio(s, ds);
      for (let j = 0; j < n; j++) most2 = Math.max(most2, (-1.01 * dx[j]) / (x[j] - alfa[j]), (1.01 * dx[j]) / (beta[j] - x[j]));
      let steg = 1 / most2, next, tries = 0, resinew = 2 * norm;
      const at = (v, dv, t) => { const o = new Float64Array(v.length); for (let k = 0; k < v.length; k++) o[k] = v[k] + t * dv[k]; return o; };
      while (resinew > norm && tries < 50) {
        tries++;
        next = [at(x, dx, steg), at(y, dy, steg), z + steg * dz, at(lam, dlam, steg), at(xsi, dxsi, steg), at(eta, deta, steg), at(mu, dmu, steg), zet + steg * dzet, at(s, ds, steg)];
        [resinew, most] = residual(epsi, ...next);
        steg /= 2;
      }
      [x, y, z, lam, xsi, eta, mu, zet, s] = next;
      norm = resinew;
    }
  }
  return x;
}

// A small dense system by Gaussian elimination with partial pivoting: A is the augmented matrix [M | rhs]
function gauss(A) {
  const k = A.length;
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < k; r++) { const f = A[r][c] / A[c][c]; for (let q = c; q <= k; q++) A[r][q] -= f * A[c][q]; }
  }
  const x = new Array(k).fill(0);
  for (let r = k - 1; r >= 0; r--) { let t = A[r][k]; for (let q = r + 1; q < k; q++) t -= A[r][q] * x[q]; x[r] = t / A[r][r]; }
  return x;
}

/**
 * The optimisation: from an even spread, step by step, until the densities stop changing (less than tol per step)
 * with projection at full sharpness, or steps run out.
 * @param {ReturnType<typeof discretise>} spec
 * @param {{ onStep?: (s: { step: number, steps: number, compliance: number, change: number, beta: number, density: Float64Array }) => void, method?: 'direct' | 'cg' | 'mg', backend?: typeof jsBackend, tol?: number, move?: number }} [options]
 * @returns {{ density: Float64Array, compliance: number, cases: { name: string, compliance: number, deflection: number, stiffness: number }[], volume: number, steps: number, converged: boolean, history: number[], seconds: number }}
 *   each case's deflection is along its load (mm, compliance over the load's size), stiffness the load over that (N/mm)
 */
export function optimise(spec, { onStep, method, backend = jsBackend, tol = 0.01, move = 0.2 } = {}) {
  const started = Date.now(), m = model(spec, { method, backend }), { cells, passive } = m;
  const inSpace = passive.reduce((s, p) => s + (p !== -2 ? 1 : 0), 0), kept = passive.reduce((s, p) => s + (p === 1 ? 1 : 0), 0);
  const free = passive.reduce((s, p) => s + (p === 0 ? 1 : 0), 0);
  // A stress limit asks for the lightest layout that keeps to it; a volume, for the stiffest that fills it
  const lightest = spec.stress > 0;
  if (lightest && spec.volume != null) throw new Error('give a volume (the stiffest layout that fills it) or a stress limit (the lightest that keeps to it), not both');
  if (!lightest && !(spec.volume > 0 && spec.volume <= 1)) throw new Error(`the volume is a share of the space, from 0 to 1 (got ${spec.volume})`);
  const target = lightest ? 0 : spec.volume * inSpace;
  if (!lightest && kept > target) throw new Error(`the keep regions alone fill ${fmt((kept / inSpace) * 100)}% of the space, more than the volume (${fmt(spec.volume * 100)}%): raise the volume`);
  if (!free) throw new Error('no free cells: the keep and avoid regions cover the whole space');

  const betaMax = spec.projection ? (lightest ? 8 : 16) : 1, fixedValue = (p) => (p === 1 ? 1 : 0);
  const x = new Float64Array(cells), xnew = new Float64Array(cells);
  for (let e = 0; e < cells; e++) x[e] = passive[e] ? fixedValue(passive[e]) : lightest ? 0.5 : (target - kept) / free;
  const history = [];
  // The lightest layout: the method of moving asymptotes on the material used plus the stress limits' augmented
  // Lagrangian term, its multipliers raised every INNER steps (λ += μ h) and its penalty grown (μ × 1.1, at most 10⁴)
  const INNER = 5, freeCells = Int32Array.from(Array.from(passive).flatMap((p, e) => (p ? [] : [e]))), n = freeCells.length;
  const mmaStep = lightest ? mma({ n, m: 0, xmin: new Float64Array(n), xmax: new Float64Array(n).fill(1) }) : null;
  const multipliers = lightest ? { lam: spec.loads.filter((l) => l.weight > 0).map(() => new Float64Array(m.limits)), mu: 10 } : undefined;
  const xf = new Float64Array(n), pick = (d) => Float64Array.from(freeCells, (e) => d[e]);
  let step = 0, change = 1, converged = false, beta = 1, sinceBeta = 0, peak = null;
  while (step < spec.steps) {
    step++; sinceBeta++;
    const { compliance, dc, dv, stress } = m.evaluate(x, beta, { multipliers });
    // A sharper projection magnifies each change, so the move limit shrinks with it (else the design flickers)
    const limit = move * Math.min(1, 2 / beta);
    if (lightest) {
      const used = m.physical(x, beta).reduce((s, v, e) => s + (passive[e] !== -2 ? v : 0), 0) / inSpace, d = pick(stress.d), dvf = pick(dv);
      history.push(used); peak = stress.peak;
      // Done at full sharpness when the material used has stopped changing (within 0.2% over 100 steps) and the limit
      // holds (within 2%): this design, as just analysed
      if (beta >= betaMax && sinceBeta > 100 && Math.abs(history.at(-101) - used) <= 0.002 * used && peak <= spec.stress * 1.02) { converged = true; break; }
      xf.set(pick(x));
      mmaStep(xf, used + stress.J, dvf.map((v, k) => v / inSpace + d[k]), [], [], limit);
      xnew.set(x);
      freeCells.forEach((e, k) => { xnew[e] = xf[k]; });
      if (step % INNER === 0) {
        multipliers.lam.forEach((l, k) => { for (let j = 0; j < l.length; j++) l[j] += multipliers.mu * stress.h[k][j]; });
        multipliers.mu = Math.min(1.1 * multipliers.mu, 1e4);
      }
    } else {
      history.push(compliance);
      // Optimality criteria: scale each cell by √(−dc/dv/λ), within the move limit, finding λ by bisection so the
      // physical densities fill exactly the volume
      let lo = 0, hi = 1e9;
      while ((hi - lo) / (hi + lo) > 1e-3) { // as the 88-line code
        const mid = (lo + hi) / 2;
        for (let e = 0; e < cells; e++) {
          if (passive[e]) { xnew[e] = fixedValue(passive[e]); continue; }
          const b = Math.sqrt(Math.max(0, -dc[e]) / Math.max(1e-30, dv[e]) / mid);
          xnew[e] = Math.max(0, Math.max(x[e] - limit, Math.min(1, Math.min(x[e] + limit, x[e] * b))));
        }
        const filled = m.physical(xnew, beta).reduce((s, v) => s + v, 0);
        if (filled > target) lo = mid; else hi = mid;
      }
    }
    change = 0;
    for (let e = 0; e < cells; e++) change = Math.max(change, Math.abs(xnew[e] - x[e]));
    x.set(xnew);
    onStep?.({ step, steps: spec.steps, compliance, change, beta, density: m.physical(x, beta), ...(lightest ? { stress: peak, volume: history.at(-1) } : {}) });
    if (lightest) {
      // Sharper every 25 rounds of the multipliers
      if (beta < betaMax && sinceBeta >= 25 * INNER) { beta *= 2; sinceBeta = 0; }
      continue;
    }
    // Sharpen: double the projection's steepness when the design settles (or every 50 steps), until it's at its sharpest
    if (beta < betaMax && (change < tol || sinceBeta >= 50)) { beta *= 2; sinceBeta = 0; continue; }
    // Done when nothing moves, or at full sharpness the compliance has stopped improving (within 0.1% over 10 steps)
    const settled = spec.projection && history.length > 10 && beta >= betaMax && sinceBeta > 10 && Math.abs(history.at(-11) - compliance) <= 1e-3 * compliance;
    if (beta >= betaMax && (change < tol || settled)) { converged = true; break; }
  }
  // The final design, analysed as it is
  const final = m.evaluate(x, beta, { all: true }), phys = Float64Array.from(m.physical(x, beta));
  return {
    density: phys, compliance: final.compliance, cases: final.cases, ...(final.stress ? { stress: { peak: final.stress.peak, limit: spec.stress } } : {}),
    volume: phys.reduce((s, v, e) => s + (passive[e] !== -2 ? v : 0), 0) / inSpace, steps: step, converged, history, seconds: (Date.now() - started) / 1000,
  };
}

/**
 * How many dimensions a region has: 2 or 3.
 * @param {Region} r
 * @returns {2 | 3}
 */
export function dimension(r) {
  if (r.triangles || r.length != null) return 3;
  if (r.points) return 2;
  return (r.size || r.at).length === 3 ? 3 : 2;
}

/**
 * Whether point pt is inside a region.
 * @param {Region} r @param {number[]} pt
 * @returns {boolean}
 */
export const inside = (r, pt) => insider(r)(pt);

// A test for points inside a region (a closed mesh's is built once: its triangles binned by x and y, then a ray
// straight up from the point crosses the mesh an odd number of times if the point is inside)
const meshTests = new WeakMap();
function insider(r) {
  if (r.triangles) {
    if (!meshTests.has(r.triangles)) meshTests.set(r.triangles, meshInside(r.triangles));
    return meshTests.get(r.triangles);
  }
  if (r.points) return (pt) => {
    let c = false; // even-odd ray crossing
    const P = r.points, [x, y] = pt;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
    return c;
  };
  if (r.size) return (pt) => r.size.every((s, a) => Math.abs(pt[a] - r.at[a]) <= s / 2);
  if (r.length != null) {
    const ax = 'xyz'.indexOf(r.axis || 'z'), others = [0, 1, 2].filter((a) => a !== ax);
    // A teardrop: a cylinder across the build with a 45° point below it (a boss) or above it (a hole), so it prints
    // unsupported. Along the build, it's a plain cylinder.
    const pa = r.teardrop ? 'xyz'.indexOf(r.teardrop[1]) : -1, point = pa >= 0 && pa !== ax ? (r.teardrop[0] === '-' ? -1 : 1) : 0, side = others.find((a) => a !== pa);
    return (pt) => {
      if (Math.abs(pt[ax] - r.at[ax]) > r.length / 2) return false;
      if (Math.hypot(pt[others[0]] - r.at[others[0]], pt[others[1]] - r.at[others[1]]) <= r.r) return true;
      const out = point * (pt[pa] - r.at[pa]);
      return point !== 0 && out > 0 && Math.abs(pt[side] - r.at[side]) + out <= r.r * Math.SQRT2;
    };
  }
  return (pt) => dist(pt, r.at) <= r.r;
}
function meshInside(triangles) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of triangles) for (const [x, y] of t) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const B = Math.max(1, Math.ceil(Math.sqrt(triangles.length / 4))), sx = (x1 - x0) / B || 1, sy = (y1 - y0) / B || 1;
  const bins = Array.from({ length: B * B }, () => []), bin = (v, lo, s) => Math.min(B - 1, Math.max(0, Math.floor((v - lo) / s)));
  triangles.forEach((t, n) => {
    const xs = t.map((p) => p[0]), ys = t.map((p) => p[1]);
    for (let j = bin(Math.min(...ys), y0, sy); j <= bin(Math.max(...ys), y0, sy); j++) for (let i = bin(Math.min(...xs), x0, sx); i <= bin(Math.max(...xs), x0, sx); i++) bins[j * B + i].push(n);
  });
  return ([px, py, pz]) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    const x = px + 1e-7 * Math.SQRT2, y = py + 1e-7 * Math.PI; // off-centre, so the ray meets no edge exactly
    let crossings = 0;
    for (const n of bins[bin(x, x0, sx) + B * bin(y, y0, sy)]) {
      const [a, b, c] = triangles[n], d = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (!d) continue;
      const w0 = ((b[0] - x) * (c[1] - y) - (b[1] - y) * (c[0] - x)) / d, w1 = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) / d, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      if (w0 * a[2] + w1 * b[2] + w2 * c[2] > pz) crossings++;
    }
    return crossings % 2 === 1;
  };
}

// A region grown by d all round (a polygon or mesh as it is)
function grow(r, d) {
  if (r.triangles || r.points) return r;
  if (r.size) return { ...r, size: r.size.map((s) => s + 2 * d) };
  if (r.length != null) return { ...r, r: r.r + d, length: r.length + 2 * d };
  return { ...r, r: (r.r || 0) + d };
}
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

/**
 * A region's bounding box: [min x, min y, (min z), max x, max y, (max z)] in mm.
 * @param {Region} r
 * @returns {number[]}
 */
export function bounds(r) {
  const dim = dimension(r);
  if (r.triangles) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of r.triangles) for (const p of t) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
    return [...lo, ...hi];
  }
  if (r.points) { const xs = r.points.map((p) => p[0]), ys = r.points.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
  const half = r.size ? r.size.map((s) => s / 2) : r.length != null ? [0, 1, 2].map((a) => (a === 'xyz'.indexOf(r.axis || 'z') ? r.length / 2 : r.r)) : new Array(dim).fill(r.r);
  const lo = r.at.map((c, a) => c - half[a]);
  const hi = r.at.map((c, a) => c + half[a]);
  const pa = r.teardrop && r.length != null ? 'xyz'.indexOf(r.teardrop[1]) : -1;
  if (pa >= 0 && pa !== 'xyz'.indexOf(r.axis || 'z')) { if (r.teardrop[0] === '-') lo[pa] = r.at[pa] - r.r * Math.SQRT2; else hi[pa] = r.at[pa] + r.r * Math.SQRT2; } // its point
  return [...lo, ...hi];
}

// ---------- shapes from results ----------
// (Everything above decides the densities; everything below only draws them, so results can be kept by the code above)

/**
 * The edges of a result at density 0.5 as closed loops in mm (marching squares on the densities averaged to the
 * cells' corners), solid on the left: outer edges counter-clockwise, holes clockwise. Smoothed (Taubin, which keeps
 * the size), simplified, and with loops smaller than minArea (mm²) dropped.
 * @param {{ nx: number, ny: number, h: number }} size @param {ArrayLike<number>} density @param {[number, number]} origin
 * @param {{ smooth?: number, minArea?: number, tolerance?: number }} [options]
 * @returns {[number, number][][]}
 */
export function outlines({ nx, ny, h }, density, origin = [0, 0], { smooth = 4, minArea = 0, tolerance = h * 0.05 } = {}) {
  // Corner values, with a ring of empty corners round the outside so every loop closes
  const W = nx + 3, H = ny + 3, v = new Float64Array(W * H);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let s = 0;
    for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && a < nx && b >= 0 && b < ny) s += density[b * nx + a];
    v[(j + 1) * W + i + 1] = s / 4;
  }
  const iso = 0.5, pos = (i, j) => [origin[0] + (i - 1) * h, origin[1] + (j - 1) * h];
  // Edge keys: horizontal edge from corner (i, j) to (i + 1, j) is "h i j", vertical from (i, j) to (i, j + 1) "v i j"
  const point = new Map(), next = new Map();
  const cross = (key, a, b, pa, pb) => {
    if (!point.has(key)) { const t = (iso - a) / (b - a); point.set(key, [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]); }
    return key;
  };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], val = c.map(([a, b]) => v[b * W + a]), inn = val.map((x) => x >= iso);
    const edges = [`h ${i} ${j}`, `v ${i + 1} ${j}`, `h ${i} ${j + 1}`, `v ${i} ${j}`]; // bottom, right, top, left: counter-clockwise
    const crossings = [];
    for (let k = 0; k < 4; k++) {
      const a = k, b = (k + 1) % 4;
      if (inn[a] !== inn[b]) crossings.push({ key: cross(edges[k], val[a], val[b], pos(...c[a]), pos(...c[b])), out: inn[a] });
    }
    if (!crossings.length) continue;
    // Each crossing leaving the solid (going counter-clockwise round the cell) joins the next one entering it; at a
    // saddle, which pairs depends on the middle: solid there joins the two solid corners
    const middle = val.reduce((s, x) => s + x, 0) / 4 >= iso;
    for (let k = 0; k < crossings.length; k++) if (crossings[k].out) {
      const m = crossings.length;
      const to = crossings.length === 4 && !middle ? crossings[(k + m - 1) % m] : crossings[(k + 1) % m];
      next.set(crossings[k].key, to.key);
    }
  }
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    for (let k = start; !seen.has(k); k = next.get(k)) { seen.add(k); loop.push(point.get(k)); }
    loops.push(loop);
  }
  return loops.map((l) => simplify(taubin(l, smooth), tolerance)).filter((l) => l.length >= 3 && Math.abs(area(l)) >= minArea);
}

/**
 * The area of a closed loop in mm², positive if counter-clockwise.
 * @param {[number, number][]} loop
 * @returns {number}
 */
export function area(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % loop.length]; s += x0 * y1 - x1 * y0; }
  return s / 2;
}

// Taubin smoothing on a closed loop: a shrinking step then a growing one, so corners round without the loop shrinking
function taubin(loop, passes, lambda = 0.5, mu = -0.53) {
  let p = loop;
  for (let k = 0; k < passes * 2; k++) {
    const f = k % 2 ? mu : lambda, n = p.length;
    p = p.map((q, i) => { const a = p[(i + n - 1) % n], b = p[(i + 1) % n]; return [q[0] + f * ((a[0] + b[0]) / 2 - q[0]), q[1] + f * ((a[1] + b[1]) / 2 - q[1])]; });
  }
  return p;
}

// Drop points that lie within tolerance of the line through their neighbours (one pass, then repeat while it helps)
function simplify(loop, tolerance) {
  let p = loop, dropped = true;
  while (dropped && p.length > 3) {
    dropped = false;
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = out.length ? out[out.length - 1] : p[(i + p.length - 1) % p.length], q = p[i], b = p[(i + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), off = len ? Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / len : 0;
      if (off < tolerance && p.length - (i - out.length) > 3) { dropped = true; continue; }
      out.push(q);
    }
    p = out;
  }
  return p;
}

/**
 * A 3D result's surface at density 0.5: a closed triangle mesh in mm, outward-facing, smoothed (Taubin, which keeps
 * the size). The densities are averaged to the cells' corners, with a layer of empty corners round the outside so the
 * surface closes, and each cube between corners is split into six tetrahedra, all along the same diagonal, so
 * neighbouring cubes cut their shared faces the same way and the surface has no gaps (marching tetrahedra).
 * @param {{ nx: number, ny: number, nz: number, h: number }} size @param {ArrayLike<number>} density @param {number[]} origin
 * Vertices on the grid's outer faces stay where they are as it's smoothed, so a part that fills its space to a face (a
 * base on the bed) keeps that face flat, and the walls rising from it don't lean out.
 * @param {{ smooth?: number, iso?: number, overhang?: { up: string, angle: number } }} [options] iso: the density the
 * surface is drawn at (0.5). overhang: the build direction ('+z') and the printer's overhang limit (degrees from
 * vertical): faces smoothing left past it are tipped back to it.
 * @returns {{ vertices: number[][], faces: number[][] }}
 */
export function surface({ nx, ny, nz, h }, density, origin = [0, 0, 0], { smooth = 4, iso = 0.5, overhang } = {}) {
  const W = nx + 3, H = ny + 3, D = nz + 3, v = new Float64Array(W * H * D), id = (i, j, k) => (k * H + j) * W + i;
  // Each corner: the average of the cubes round it that are in the grid (on the grid's faces, only those inside it, so
  // material reaching a face reads as solid there, not half)
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let s = 0, count = 0;
    for (let c = k - 1; c <= k; c++) for (let b = j - 1; b <= j; b++) for (let a = i - 1; a <= i; a++) if (a >= 0 && a < nx && b >= 0 && b < ny && c >= 0 && c < nz) { s += density[(c * ny + b) * nx + a]; count++; }
    v[id(i + 1, j + 1, k + 1)] = s / count;
  }
  const corner = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const tets = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];
  const pos = (n) => { const i = n % W, j = Math.floor(n / W) % H, k = Math.floor(n / (W * H)); return [origin[0] + (i - 1) * h, origin[1] + (j - 1) * h, origin[2] + (k - 1) * h]; };
  const vertices = [], faces = [], onEdge = new Map();
  const crossing = (a, b) => { // the point where the density crosses iso on the edge between corners a and b, shared
    const key = a < b ? a * W * H * D + b : b * W * H * D + a;
    let n = onEdge.get(key);
    if (n === undefined) {
      const t = Math.min(0.999, Math.max(0.001, (iso - v[a]) / (v[b] - v[a]))), pa = pos(a), pb = pos(b);
      n = vertices.length; vertices.push([0, 1, 2].map((q) => pa[q] + t * (pb[q] - pa[q]))); onEdge.set(key, n);
    }
    return n;
  };
  // A triangle, turned to face away from the solid: its normal pointing from an inside corner towards an outside one
  const emit = (a, b, c, from, to) => {
    const [p, q, r] = [vertices[a], vertices[b], vertices[c]], pf = pos(from), pt = pos(to);
    const n = [(q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]), (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]), (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])];
    faces.push(n[0] * (pt[0] - pf[0]) + n[1] * (pt[1] - pf[1]) + n[2] * (pt[2] - pf[2]) >= 0 ? [a, b, c] : [a, c, b]);
  };
  for (let k = 0; k < D - 1; k++) for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const cube = corner.map(([a, b, c]) => id(i + a, j + b, k + c));
    if (cube.every((n) => v[n] < iso) || cube.every((n) => v[n] >= iso)) continue;
    for (const t of tets) {
      const p = t.map((q) => cube[q]), inn = p.filter((n) => v[n] >= iso), out = p.filter((n) => v[n] < iso);
      if (inn.length === 1 || inn.length === 3) { // one corner apart from the other three: a triangle round it
        const [lone, rest, from, to] = inn.length === 1 ? [inn[0], out, inn[0], out[0]] : [out[0], inn, inn[0], out[0]];
        emit(crossing(lone, rest[0]), crossing(lone, rest[1]), crossing(lone, rest[2]), from, to);
      } else if (inn.length === 2) { // two and two: a quad, as two triangles
        const [a, b] = inn, [c, d] = out, q = [crossing(a, c), crossing(a, d), crossing(b, d), crossing(b, c)];
        emit(q[0], q[1], q[2], a, c); emit(q[0], q[2], q[3], a, c);
      }
    }
  }
  // Where material reaches the grid's face, the surface closes in the empty layer outside it: those crossings come
  // back onto the face, so it's flat there, and every vertex on a face stays where it is
  const lo = origin, hi = [origin[0] + nx * h, origin[1] + ny * h, origin[2] + nz * h], near = h * 0.01;
  const pinned = vertices.map((p) => p.map((x, q) => (x < lo[q] + near ? lo[q] : x > hi[q] - near ? hi[q] : null)));
  for (let n = 0; n < vertices.length; n++) for (let q = 0; q < 3; q++) if (pinned[n][q] !== null) vertices[n][q] = pinned[n][q];
  // ... and holds still: one on the bed that moved sideways would tip the wall above it out over the edge
  const held = pinned.map((p) => p.some((x) => x !== null));
  // Taubin smoothing: each vertex moves towards its neighbours' average, then back a little further, so the surface
  // rounds off its steps without shrinking
  const nb = vertices.map(() => new Set());
  for (const [a, b, c] of faces) { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const ring = nb.map((s) => Int32Array.from(s));
  let pts = vertices;
  for (let pass = 0; pass < smooth * 2; pass++) {
    const f = pass % 2 ? -0.53 : 0.5;
    pts = pts.map((p, n) => {
      const r = ring[n];
      if (!r.length) return p;
      const avg = [0, 0, 0];
      for (const m of r) for (let q = 0; q < 3; q++) avg[q] += pts[m][q] / r.length;
      return held[n] ? p : p.map((x, q) => Math.min(hi[q], Math.max(lo[q], x + f * (avg[q] - x))));
    });
  }
  if (overhang) steepen(pts, faces, held, overhang, lo, hi);
  return { vertices: pts, faces };
}

// Faces past the overhang limit, tipped back to it. Optimised in cubes, a printable slope is a staircase of 45°, and
// smoothing leaves small faces either side of 45°. Each face facing down more steeply than the limit is turned about
// its centre, moving its corners along the build direction only, until it's a little inside the limit: about as much
// material is added as taken away. A corner shared by several such faces moves by their average; it's repeated until
// none are left. Flat faces (a bridge) and faces held on the grid's sides stay as they are.
function steepen(pts, faces, held, { up, angle }, lo, hi, passes = 200) {
  const q = 'xyz'.indexOf(up[1]), s = up[0] === '-' ? -1 : 1, [a, b] = [0, 1, 2].filter((x) => x !== q);
  const limit = Math.sin((angle * Math.PI) / 180), slope = 1.03 / Math.tan((angle * Math.PI) / 180);
  for (let pass = 0; pass < passes; pass++) {
    const move = new Float64Array(pts.length), count = new Uint16Array(pts.length);
    let left = 0;
    for (const f of faces) {
      if (held[f[0]] && held[f[1]] && held[f[2]]) continue;
      const [p, r, t] = f.map((n) => pts[n]), u = [r[0] - p[0], r[1] - p[1], r[2] - p[2]], w = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], len = Math.hypot(...n);
      if (!len || (s * n[q]) / len >= -limit) continue;
      // The face's plane as a height along the build direction over the other two: x_q = c + ga x_a + gb x_b
      const ga = -n[a] / n[q], gb = -n[b] / n[q], g = Math.hypot(ga, gb);
      if (g < 0.05) continue; // flat: a bridge, which turning won't help
      left++;
      const c = [0, 1, 2].map((x) => (p[x] + r[x] + t[x]) / 3), k = slope / g;
      for (const m of f) {
        const v = pts[m];
        move[m] += c[q] + k * (ga * (v[a] - c[a]) + gb * (v[b] - c[b])) - v[q]; count[m]++;
      }
    }
    if (!left) break;
    for (let m = 0; m < pts.length; m++) if (count[m] && !held[m]) pts[m][q] = Math.min(hi[q], Math.max(lo[q], pts[m][q] + move[m] / count[m]));
  }
}

const fmt = (n) => String(Number(n.toFixed(2)));

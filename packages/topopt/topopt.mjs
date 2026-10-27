// Topology optimisation for flat parts: where to put a fixed amount of material in a region so the part is as stiff as
// possible under its loads. The density method (SIMP: solid isotropic material with penalisation): every cell has a
// density from 0 to 1, stiffness grows as density cubed (so part-solid cells are poor value and the result settles
// into solid and empty), and each step moves material towards the cells that stiffen the part most. With a density
// filter (it sets the thinnest member) and Heaviside projection (it sharpens the result). After Andreassen et al.
// (2011), "Efficient topology optimization in MATLAB using 88 lines of code", and Wang, Lazarov and Sigmund (2011).
// No dependencies but @rulecad/fea; runs in browsers and Node. Millimetres, newtons, MPa.
//
//   optimise(spec)       the method itself, on a grid: densities, supports and loads by dof
//   discretise(problem)  a problem in shapes (a region, bosses to keep, holes to avoid, loads at points) to a spec
//   outlines(result)     the result's edges as closed loops in mm, solid on the left, smoothed: ready to extrude
import { grid as makeGrid, cellStiffness, solve, positions, jsBackend } from '@rulecad/fea';

export { jsBackend };

/** @typedef {{ at: [number, number], r: number } | { at: [number, number], size: [number, number] } | { points: [number, number][] }} Region a circle, a rectangle (centred), or a polygon, in mm */
/** @typedef {{ at: [number, number], r?: number, fix?: 'xy' | 'x' | 'y' }} Support holds the nodes within r of at (on solid material) */
/** @typedef {{ at: [number, number], r?: number, force: [number, number], case?: string }} Load a force in N, shared by the nodes within r of at */
/**
 * @typedef {object} Problem
 * @property {Region | Region[]} space where material may go
 * @property {Region[]} [keep] must stay solid (bosses round bolt holes)
 * @property {Region[]} [avoid] must stay empty (the holes, clearances); avoid wins over keep
 * @property {Support[]} supports
 * @property {Load[]} loads each in its load case (default "load"); cases are optimised together
 * @property {Record<string, number>} [cases] each case's weight (default 1)
 * @property {{ E: number, nu: number }} material
 * @property {number} thickness mm
 * @property {number} cell the grid's cell size, mm
 * @property {number} volume the share of the space to fill, 0 to 1 (keep regions count towards it)
 * @property {number} [filter] the filter radius in mm: about the thinnest member (default 1.5 cells)
 * @property {number} [penal] the penalty (default 3)
 * @property {boolean} [projection] sharpen with Heaviside projection (default true)
 * @property {number} [steps] at most this many steps (default 300)
 */

/**
 * A problem described in shapes, on a grid: each cell inside the space (or a keep region) is free, kept or avoided;
 * supports and loads go on the nodes near them that touch material that may be solid.
 * @param {Problem} p
 * @returns {object} a spec for optimise(), with origin (the grid's lower-left corner, mm) and regions for outlines
 */
export function discretise(p) {
  const space = [p.space].flat(), keep = p.keep || [], avoid = p.avoid || [];
  if (!(p.cell > 0)) throw new Error('the cell size must be more than 0 mm');
  const box = [...space, ...keep].map(bounds).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const nx = Math.max(1, Math.round((box[2] - box[0]) / p.cell)), ny = Math.max(1, Math.round((box[3] - box[1]) / p.cell));
  const g = makeGrid({ nx, ny, h: p.cell }), origin = [box[0], box[1]];
  // Each cell by its centre: 1 kept, -1 avoided or outside (-2 outside, which doesn't count towards the volume), 0 free
  const passive = new Int8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = [origin[0] + (i + 0.5) * p.cell, origin[1] + (j + 0.5) * p.cell];
    const inKeep = keep.some((r) => inside(r, c));
    passive[j * nx + i] = avoid.some((r) => inside(r, c)) ? (inKeep || space.some((r) => inside(r, c)) ? -1 : -2) : inKeep ? 1 : space.some((r) => inside(r, c)) ? 0 : -2;
  }
  const at = positions(g).map(([x, y]) => [x + origin[0], y + origin[1]]);
  // A node is on material if a cell it's a corner of may be solid
  const onMaterial = new Uint8Array(g.nodes);
  for (let e = 0; e < nx * ny; e++) if (passive[e] >= 0) for (let k = 0; k < 4; k++) onMaterial[g.edof[e * 8 + 2 * k] / 2] = 1;
  const near = (pt, r = 0, what) => {
    const reach = r + p.cell * 0.75, found = [];
    for (let n = 0; n < g.nodes; n++) if (onMaterial[n] && Math.hypot(at[n][0] - pt[0], at[n][1] - pt[1]) <= reach) found.push(n);
    if (!found.length) throw new Error(`${what} at ${pt.map(fmt).join(', ')} isn't on any material: move it onto the space or a keep region, or give it a radius`);
    return found;
  };
  const fixed = new Uint8Array(g.dofs);
  for (const s of p.supports || []) for (const n of near(s.at, s.r, 'a support')) {
    if ((s.fix || 'xy').includes('x')) fixed[2 * n] = 1;
    if ((s.fix || 'xy').includes('y')) fixed[2 * n + 1] = 1;
  }
  const names = [...new Set((p.loads || []).map((l) => l.case || 'load'))];
  if (!names.length) throw new Error('a problem needs at least one load');
  const loads = names.map((name) => {
    const f = new Float64Array(g.dofs);
    for (const l of p.loads.filter((x) => (x.case || 'load') === name)) {
      const ns = near(l.at, l.r, `the load "${name}"`);
      for (const n of ns) { f[2 * n] += l.force[0] / ns.length; f[2 * n + 1] += l.force[1] / ns.length; }
    }
    return { name, force: f, weight: p.cases?.[name] ?? 1, size: Math.hypot(...p.loads.filter((x) => (x.case || 'load') === name).reduce((s, l) => [s[0] + l.force[0], s[1] + l.force[1]], [0, 0])) };
  });
  return {
    grid: { nx, ny, h: p.cell }, origin, passive, fixed, loads,
    material: p.material, thickness: p.thickness, volume: p.volume,
    filter: p.filter ?? p.cell * 1.5, penal: p.penal ?? 3, projection: p.projection ?? true, steps: p.steps ?? 300,
    regions: { keep, avoid },
  };
}

/**
 * The density filter: each cell's filtered density is the weighted average of the cells within radius (weights
 * falling linearly to 0 at the radius). apply filters densities; adjoint carries sensitivities back through it.
 * @param {{ nx: number, ny: number }} size @param {number} radius in cells
 */
export function densityFilter({ nx, ny }, radius) {
  const reach = Math.ceil(radius) - 1, cells = nx * ny;
  // Each cell's neighbours and their weights, as flat arrays (row r's are at start[r] to start[r + 1])
  const start = new Int32Array(cells + 1), index = [], weight = [], total = new Float64Array(cells);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = j * nx + i;
    for (let b = Math.max(0, j - reach); b <= Math.min(ny - 1, j + reach); b++) for (let a = Math.max(0, i - reach); a <= Math.min(nx - 1, i + reach); a++) {
      const w = radius - Math.hypot(a - i, b - j);
      if (w > 0) { index.push(b * nx + a); weight.push(w); total[e] += w; } // total: fewer neighbours at the edges
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
 * The problem as a function of the design densities x (one per cell, 0 to 1), at projection sharpness beta:
 * physical(x, beta) gives the densities the part is made of (filtered, projected, kept and avoided cells set);
 * evaluate(x, beta) analyses it and gives the compliance (summed over the load cases by weight, N·mm) and its
 * gradient with respect to x (dc), with the gradient of the material used (dv).
 * @param {ReturnType<typeof discretise>} spec
 * @param {{ method?: 'direct' | 'cg', backend?: typeof jsBackend }} [options]
 */
export function model(spec, { method = 'direct', backend = jsBackend } = {}) {
  const { nx, ny } = spec.grid, cells = nx * ny, g = makeGrid(spec.grid), ke = cellStiffness(spec.material.nu);
  const { passive, penal, thickness } = spec, E = spec.material.E, Emin = E * 1e-9, eta = 0.5;
  const filter = densityFilter(spec.grid, spec.filter / spec.grid.h);
  const tilde = new Float64Array(cells), phys = new Float64Array(cells), scale = new Float64Array(cells), back = new Float64Array(cells);
  const fixedValue = (p) => (p === 1 ? 1 : 0);
  // Heaviside projection about eta: steeper as beta grows, so densities are pushed to 0 or 1 (Wang, Lazarov, Sigmund 2011)
  const denominator = (beta) => Math.tanh(beta * eta) + Math.tanh(beta * (1 - eta));
  const project = (t, beta) => (spec.projection ? (Math.tanh(beta * eta) + Math.tanh(beta * (t - eta))) / denominator(beta) : t);
  const slope = (t, beta) => (spec.projection ? (beta * (1 - Math.tanh(beta * (t - eta)) ** 2)) / denominator(beta) : 1);
  const physical = (x, beta) => {
    filter.apply(x, tilde);
    for (let e = 0; e < cells; e++) phys[e] = passive[e] ? fixedValue(passive[e]) : project(tilde[e], beta);
    return phys;
  };
  let last = null;
  const evaluate = (x, beta) => {
    physical(x, beta);
    for (let e = 0; e < cells; e++) scale[e] = thickness * (Emin + Math.pow(phys[e], penal) * (E - Emin));
    const { u } = solve(g, { scale, ke, fixed: spec.fixed, loads: spec.loads.map((l) => l.force), method, backend, start: last });
    last = u;
    // Compliance, and its gradient with respect to each cell's physical density: −p ρ^(p−1) (E − Emin) t · uₑᵀ kₑ uₑ
    // (the load is fixed, so the adjoint is the displacement itself)
    let compliance = 0;
    const dc = new Float64Array(cells), dv = new Float64Array(cells);
    spec.loads.forEach((l, c) => {
      const w = l.weight, uc = u[c];
      for (let e = 0; e < cells; e++) {
        let ce = 0;
        for (let a = 0; a < 8; a++) { let s = 0; for (let b = 0; b < 8; b++) s += ke[a * 8 + b] * uc[g.edof[e * 8 + b]]; ce += uc[g.edof[e * 8 + a]] * s; }
        compliance += w * scale[e] * ce;
        dc[e] -= w * penal * Math.pow(phys[e], penal - 1) * (E - Emin) * thickness * ce;
      }
    });
    // Back through the projection and the filter to the design densities; kept and avoided cells don't change
    for (let e = 0; e < cells; e++) { const s = passive[e] ? 0 : slope(tilde[e], beta); dc[e] *= s; dv[e] = s; }
    filter.adjoint(dc, back); dc.set(back);
    filter.adjoint(dv, back); dv.set(back);
    const cases = spec.loads.map((l, c) => {
      const ci = jsBackend.dot(l.force, u[c]), deflection = l.size ? ci / l.size : 0;
      return { name: l.name, compliance: ci, deflection, stiffness: deflection ? l.size / deflection : Infinity };
    });
    return { compliance, dc, dv, u, cases };
  };
  return { physical, evaluate, cells, passive };
}

/**
 * The optimisation: from an even spread, step by step, until the densities stop changing (less than tol per step)
 * with projection at full sharpness, or steps run out.
 * @param {ReturnType<typeof discretise>} spec
 * @param {{ onStep?: (s: { step: number, steps: number, compliance: number, change: number, beta: number, density: Float64Array }) => void, method?: 'direct' | 'cg', backend?: typeof jsBackend, tol?: number, move?: number }} [options]
 * @returns {{ density: Float64Array, compliance: number, cases: { name: string, compliance: number, deflection: number, stiffness: number }[], volume: number, steps: number, converged: boolean, history: number[], seconds: number }}
 *   each case's deflection is along its load (mm, compliance over the load's size), stiffness the load over that (N/mm)
 */
export function optimise(spec, { onStep, method = 'direct', backend = jsBackend, tol = 0.01, move = 0.2 } = {}) {
  const started = Date.now(), m = model(spec, { method, backend }), { cells, passive } = m;
  const inSpace = passive.reduce((s, p) => s + (p !== -2 ? 1 : 0), 0), kept = passive.reduce((s, p) => s + (p === 1 ? 1 : 0), 0);
  const free = passive.reduce((s, p) => s + (p === 0 ? 1 : 0), 0), target = spec.volume * inSpace;
  if (!(spec.volume > 0 && spec.volume <= 1)) throw new Error(`the volume is a share of the space, from 0 to 1 (got ${spec.volume})`);
  if (kept > target) throw new Error(`the keep regions alone fill ${fmt((kept / inSpace) * 100)}% of the space, more than the volume (${fmt(spec.volume * 100)}%): raise the volume`);
  if (!free) throw new Error('no free cells: the keep and avoid regions cover the whole space');

  const betaMax = spec.projection ? 16 : 1, fixedValue = (p) => (p === 1 ? 1 : 0);
  const x = new Float64Array(cells), xnew = new Float64Array(cells);
  for (let e = 0; e < cells; e++) x[e] = passive[e] ? fixedValue(passive[e]) : (target - kept) / free;
  const history = [];
  let step = 0, change = 1, converged = false, beta = 1, sinceBeta = 0;
  while (step < spec.steps) {
    step++; sinceBeta++;
    const { compliance, dc, dv } = m.evaluate(x, beta);
    history.push(compliance);
    // Optimality criteria: scale each cell by √(−dc/dv/λ), within the move limit, finding λ by bisection so the
    // physical densities fill exactly the volume
    // A sharper projection magnifies each change, so the move limit shrinks with it (else the design flickers)
    const limit = move * Math.min(1, 2 / beta);
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
    change = 0;
    for (let e = 0; e < cells; e++) change = Math.max(change, Math.abs(xnew[e] - x[e]));
    x.set(xnew);
    onStep?.({ step, steps: spec.steps, compliance, change, beta, density: m.physical(x, beta) });
    // Sharpen: double the projection's steepness when the design settles (or every 50 steps), until it's at its sharpest
    if (beta < betaMax && (change < tol || sinceBeta >= 50)) { beta *= 2; sinceBeta = 0; continue; }
    // Done when nothing moves, or at full sharpness the compliance has stopped improving (within 0.1% over 10 steps)
    const settled = spec.projection && history.length > 10 && beta >= betaMax && sinceBeta > 10 && Math.abs(history.at(-11) - compliance) <= 1e-3 * compliance;
    if (beta >= betaMax && (change < tol || settled)) { converged = true; break; }
  }
  // The final design, analysed as it is
  const final = m.evaluate(x, beta), phys = Float64Array.from(m.physical(x, beta));
  return {
    density: phys, compliance: final.compliance, cases: final.cases,
    volume: phys.reduce((s, v, e) => s + (passive[e] !== -2 ? v : 0), 0) / inSpace, steps: step, converged, history, seconds: (Date.now() - started) / 1000,
  };
}

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
 * Whether point pt is inside a region.
 * @param {Region} r @param {[number, number]} pt
 * @returns {boolean}
 */
export function inside(r, [x, y]) {
  if ('r' in r) return Math.hypot(x - r.at[0], y - r.at[1]) <= r.r;
  if ('size' in r) return Math.abs(x - r.at[0]) <= r.size[0] / 2 && Math.abs(y - r.at[1]) <= r.size[1] / 2;
  let c = false; // even-odd ray crossing
  const P = r.points;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}

/**
 * A region's bounding box, [minX, minY, maxX, maxY] in mm.
 * @param {Region} r
 * @returns {[number, number, number, number]}
 */
export function bounds(r) {
  if ('r' in r) return [r.at[0] - r.r, r.at[1] - r.r, r.at[0] + r.r, r.at[1] + r.r];
  if ('size' in r) return [r.at[0] - r.size[0] / 2, r.at[1] - r.size[1] / 2, r.at[0] + r.size[0] / 2, r.at[1] + r.size[1] / 2];
  const xs = r.points.map((p) => p[0]), ys = r.points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const fmt = (n) => String(Number(n.toFixed(2)));

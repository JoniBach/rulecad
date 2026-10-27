// Optimisation problems and analysis: problems/<name>.json in a project describes a flat part to optimise (where
// material may go, what stays solid or empty, supports, loads, material); @rulecad/topopt finds the stiffest layout,
// and @rulecad/fea analyses any flat part under the same problem's loads (an object's "analysis", run by cad check).
// The problem file is the source: a result is derived from it, cached by everything it's made from, and remade only
// when one of those changes. A name may pick a variant: lever:both.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { host } from './host.mjs';
import { paths } from './workspace.mjs';
import { resolve, loadRuleSet, evaluate } from './rules.mjs';
import { located } from './errors.mjs';
import { discretise, optimise, outlines, area } from '@rulecad/topopt';
import { grid as makeGrid, analyse, positions } from '@rulecad/fea';

const VERSION = 1, source = (m) => fs.readFileSync(new URL(import.meta.resolve(m)), 'utf8'); // the solver's code: a change remakes results
export const problemFile = (project, name) => path.join(paths.project(project), 'problems', `${name}.json`);
export const hasProblem = (project, ref) => host.exists(problemFile(project, String(ref).split(':')[0]));

/**
 * A problem with every expression worked out: what @rulecad/topopt takes, with its material and settings.
 * @param {string} project @param {string} ref name, or name:variant
 */
export function readProblem(project, ref) {
  const [name, variant] = String(ref).split(':'), file = problemFile(project, name);
  if (!host.exists(file)) throw new Error(`no problem "${name}" (projects/${project}/problems/${name}.json)`);
  const p = JSON.parse(host.readText(file));
  if (variant && !p.variants?.[variant]) throw new Error(`problem ${name} has no variant "${variant}" (variants: ${Object.keys(p.variants || {}).join(', ') || 'none'})`);
  const uses = [...new Set([...(p.uses || []), p.material])];
  let values;
  try { ({ values } = resolve({ uses, variables: p.variables || {} }, { set: variant ? p.variants[variant] : {} })); } catch (e) { throw located(e, file, 'var'); }
  const lookup = (n) => {
    const v = n.split('.').reduce((o, k) => (o == null ? o : o[k]), values);
    if (typeof v !== 'number') throw new Error(`${path.basename(file)}: "${n}" isn't a number here (variables: ${Object.keys(p.variables || {}).join(', ')})`);
    return v;
  };
  const ev = (x) => evaluate(x, lookup), pt = (a) => a.map(ev);
  const region = (r) => (r.points ? { points: r.points.map(pt) } : r.size ? { at: pt(r.at), size: r.size.map(ev) } : { at: pt(r.at), r: ev(r.r) });
  const m = values[p.material];
  if (typeof m?.modulus !== 'number' || typeof m?.poisson !== 'number') throw new Error(`material ${p.material}: its rule set needs modulus (MPa) and poisson`);
  const problem = {
    space: [p.space].flat().map(region), keep: (p.keep || []).map(region), avoid: (p.avoid || []).map(region),
    supports: p.supports.map((s) => ({ at: pt(s.at), ...(s.r != null ? { r: ev(s.r) } : {}), fix: s.fix || 'xy' })),
    loads: p.loads.map((l) => ({ at: pt(l.at), ...(l.r != null ? { r: ev(l.r) } : {}), force: pt(l.force), case: l.case || 'load' })),
    cases: Object.fromEntries(Object.entries(p.cases || {}).map(([k, w]) => [k, ev(w)])),
    material: { E: m.modulus, nu: m.poisson }, thickness: ev(p.thickness), cell: ev(p.cell), volume: ev(p.volume),
    ...(p.filter != null ? { filter: ev(p.filter) } : {}), ...(p.penal != null ? { penal: ev(p.penal) } : {}),
    ...(p.projection != null ? { projection: p.projection } : {}), ...(p.steps != null ? { steps: p.steps } : {}),
  };
  const outline = { smooth: p.outline?.smooth ?? 4, minArea: p.outline?.min_area != null ? ev(p.outline.min_area) : problem.cell ** 2 * 2 };
  return { ref, name, variant, file, title: p.title || name, material: { name: p.material, ...m }, problem, outline };
}

/**
 * The optimised layout for a problem, from the cache when nothing it depends on has changed.
 * @param {string} project @param {string} ref
 * @param {{ onStep?: Function, fresh?: boolean }} [options] fresh: run it even if it's cached
 */
export function optimised(project, ref, { onStep, fresh = false } = {}) {
  const r = readProblem(project, ref);
  const hash = crypto.createHash('sha256').update(JSON.stringify([VERSION, r.problem, r.outline, source('@rulecad/topopt'), source('@rulecad/fea')])).digest('hex');
  const file = paths.cache('optimise', `${hash}.json`);
  if (!fresh && !process.env.CAD_NO_CACHE && host.exists(file)) return { ...JSON.parse(host.readText(file)), cached: true };
  const spec = discretise(r.problem);
  const o = optimise(spec, { onStep });
  const loops = outlines(spec.grid, o.density, spec.origin, r.outline);
  const result = {
    problem: ref, title: r.title, hash, material: r.material.name, thickness: r.problem.thickness,
    grid: spec.grid, origin: spec.origin, regions: spec.regions, outlines: loops.map((l) => l.map(([x, y]) => [round(x), round(y)])),
    area: loops.reduce((s, l) => s + area(l), 0), volume: o.volume, compliance: o.compliance, cases: o.cases,
    steps: o.steps, converged: o.converged, seconds: o.seconds, history: o.history, density: Array.from(o.density, (d) => round(d, 3)),
    supports: r.problem.supports, loads: r.problem.loads,
  };
  host.writeText(file, JSON.stringify(result));
  return result;
}

// What a design gets as v.problems[name]: the outlines and regions to build from, and the numbers to report
export const forDesign = ({ density, history, ...r }) => r;

/**
 * Analyse a flat part (triangles, z up, the plate lying on the bed) under a problem's supports and loads, on its grid:
 * each cell is as solid as the share of the problem's thickness the part fills above it.
 * @param {number[][][]} triangles @param {string} project @param {string} ref
 */
export function analysePart(triangles, project, ref) {
  const r = readProblem(project, ref), { problem } = r, h = problem.cell;
  // The grid covers the part and the problem's space
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of triangles) for (const [x, y] of t) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const nx = Math.max(1, Math.ceil((x1 - x0) / h)), ny = Math.max(1, Math.ceil((y1 - y0) / h));
  const density = fill(triangles, { nx, ny, h, origin: [x0, y0] }, problem.thickness);
  const g = makeGrid({ nx, ny, h }), at = positions(g).map(([x, y]) => [x + x0, y + y0]);
  // Supports and loads on the nodes near them that touch the part
  const onPart = new Uint8Array(g.nodes);
  for (let e = 0; e < density.length; e++) if (density[e] >= 0.5) for (let k = 0; k < 4; k++) onPart[g.edof[e * 8 + 2 * k] / 2] = 1;
  const near = (p, rr = 0, what) => {
    const found = [];
    for (let n = 0; n < g.nodes; n++) if (onPart[n] && Math.hypot(at[n][0] - p[0], at[n][1] - p[1]) <= rr + h * 0.75) found.push(n);
    if (!found.length) throw new Error(`${what} at ${p.join(', ')} isn't on the part: is it placed as the problem expects?`);
    return found;
  };
  const fixed = new Uint8Array(g.dofs);
  for (const s of problem.supports) for (const n of near(s.at, s.r, 'a support')) { if (s.fix.includes('x')) fixed[2 * n] = 1; if (s.fix.includes('y')) fixed[2 * n + 1] = 1; }
  const names = [...new Set(problem.loads.map((l) => l.case))];
  const loads = names.map((name) => {
    const f = new Float64Array(g.dofs);
    for (const l of problem.loads.filter((x) => x.case === name)) { const ns = near(l.at, l.r, `the load "${name}"`); for (const n of ns) { f[2 * n] += l.force[0] / ns.length; f[2 * n + 1] += l.force[1] / ns.length; } }
    return f;
  });
  const a = analyse({ grid: g, density, material: problem.material, thickness: problem.thickness, fixed, loads });
  const cases = names.map((name, c) => {
    const size = Math.hypot(...problem.loads.filter((l) => l.case === name).reduce((s, l) => [s[0] + l.force[0], s[1] + l.force[1]], [0, 0]));
    const deflection = size ? a.compliance[c] / size : 0;
    let most = 0;
    for (let e = 0; e < density.length; e++) if (density[e] >= 0.5) most = Math.max(most, a.stress[c][e]);
    return { name, force: size, deflection, stiffness: deflection ? size / deflection : Infinity, stress: most };
  });
  return { problem: ref, material: r.material, cases, volume: volume(triangles), grid: { nx, ny, h }, origin: [x0, y0], density };
}

// How much of the thickness the part fills over each cell's centre: a ray straight up through the part enters it
// through faces that face down and leaves through faces that face up, so the filled length is the sum of the up
// faces' heights there less the down faces'
function fill(triangles, { nx, ny, h, origin }, thickness) {
  const length = new Float64Array(nx * ny), jx = h * 1e-4 * Math.SQRT2, jy = h * 1e-4 * Math.PI; // off-centre, so no ray meets an edge exactly
  for (const [a, b, c] of triangles) {
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(nz) < 1e-12) continue; // a wall: the ray runs alongside it
    const lo = [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1])], hi = [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1])];
    const i0 = Math.max(0, Math.floor((lo[0] - origin[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((hi[0] - origin[0]) / h));
    const j0 = Math.max(0, Math.floor((lo[1] - origin[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((hi[1] - origin[1]) / h));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = origin[0] + (i + 0.5) * h + jx, y = origin[1] + (j + 0.5) * h + jy;
      const w0 = ((b[0] - x) * (c[1] - y) - (b[1] - y) * (c[0] - x)) / nz, w1 = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) / nz, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      length[j * nx + i] += Math.sign(nz) * (w0 * a[2] + w1 * b[2] + w2 * c[2]);
    }
  }
  return length.map((l) => Math.min(1, Math.max(0, l / thickness)));
}

// A closed mesh's volume (mm³), by the divergence theorem
function volume(triangles) {
  let v = 0;
  for (const [a, b, c] of triangles) v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  return Math.abs(v);
}

const round = (n, d = 4) => Number(n.toFixed(d));

/**
 * A picture of a density field (an optimised result, or an analysed part) as SVG: cells shaded by density, outlines,
 * supports (triangles) and loads (arrows).
 * @param {{ grid: { nx: number, ny: number, h: number }, origin: number[], density: ArrayLike<number>, outlines?: number[][][], supports?: any[], loads?: any[] }} r
 * @param {{ title?: string, lines?: string[] }} [label]
 */
export function picture(r, { title = '', lines = [] } = {}) {
  const { nx, ny, h } = r.grid, s = Math.max(2, Math.min(8, Math.floor(1100 / (nx * h)))) , pad = 24, top = 30 + lines.length * 16;
  const W = nx * h * s + 2 * pad, H = ny * h * s + pad + top + 12;
  const X = (x) => pad + (x - r.origin[0]) * s, Y = (y) => top + (ny * h - (y - r.origin[1])) * s;
  const cells = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const d = r.density[j * nx + i];
    if (d > 0.02) cells.push(`<rect x="${X(r.origin[0] + i * h).toFixed(1)}" y="${Y(r.origin[1] + (j + 1) * h).toFixed(1)}" width="${(h * s + 0.3).toFixed(1)}" height="${(h * s + 0.3).toFixed(1)}" fill-opacity="${d.toFixed(2)}"/>`);
  }
  const loops = (r.outlines || []).map((l) => `<path d="M${l.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}Z"/>`);
  const supports = (r.supports || []).map((p) => `<path d="M${X(p.at[0])},${Y(p.at[1])}l-6,10h12z"/>`);
  const loads = (r.loads || []).map((l) => {
    const len = Math.hypot(...l.force) || 1, dx = (l.force[0] / len) * 30, dy = (-l.force[1] / len) * 30, x = X(l.at[0]), y = Y(l.at[1]);
    return `<path d="M${x - dx},${y - dy}L${x},${y}"/><circle cx="${x}" cy="${y}" r="3"/>`;
  });
  const text = [title, ...lines].map((t, i) => `<text x="${pad}" y="${20 + i * 16}" font-size="${i ? 12 : 14}"${i ? '' : ' font-weight="600"'}>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
<rect width="100%" height="100%" fill="#fff"/>${text.join('')}
<g fill="#2b4c7e">${cells.join('')}</g>
<g fill="none" stroke="#e8a33d" stroke-width="1.5">${loops.join('')}</g>
<g fill="#3a9d5d">${supports.join('')}</g>
<g stroke="#c0392b" fill="#c0392b" stroke-width="2.5">${loads.join('')}</g>
</svg>
`;
}

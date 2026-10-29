// Optimisation problems and analysis: problems/<name>.json in a project describes a part to optimise, flat (2D) or
// solid (3D): where material may go, what stays solid or empty, supports, loads, material. @rulecad/topopt finds the
// stiffest layout, and @rulecad/fea analyses any part under the same problem's loads (an object's "analysis", run by
// cad check). The problem file is the source: a result is derived from it, cached by everything it's made from, and
// remade only when one of those changes. A name may pick a variant: lever:both. A 3D region can be a named part of
// another design in the project ({ "part": "envelope.body" }), as it's built.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { host } from './host.mjs';
import { paths, printerOf } from './workspace.mjs';
import { resolve, evaluate } from './rules.mjs';
import { located } from './errors.mjs';
import { discretise, optimise, outlines, surface, area, bounds, resultant, printable } from '@rulecad/topopt';
import { threadsBackend } from '@rulecad/fea/threads'; // the solver's products shared over the machine's cores
import { grid as makeGrid, analyse, positions } from '@rulecad/fea';

const VERSION = 2, source = (m) => fs.readFileSync(new URL(import.meta.resolve(m)), 'utf8'); // the solver's code: a change remakes results
export const problemFile = (project, name) => path.join(paths.project(project), 'problems', `${name}.json`);
export const hasProblem = (project, ref) => host.exists(problemFile(project, String(ref).split(':')[0]));

/**
 * A problem with every expression worked out: what @rulecad/topopt takes, with its material and settings.
 * @param {string} project @param {string} ref name, or name:variant
 */
export async function readProblem(project, ref) {
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
  // A named part of another design in the project, as triangles (built with its defaults)
  const parts = new Map();
  const part = async (ref) => {
    if (!parts.has(ref)) {
      const [object, partName] = ref.split('.'), { build, locate } = await import('./design.mjs');
      const b = await build(locate(`${project}/${object}`)), found = partName ? b.parts.find((q) => q.name === partName) : b.parts.find((q) => q.role !== 'support');
      if (!found) throw new Error(`${path.basename(file)}: ${object} has no part "${partName}" (parts: ${b.parts.map((q) => q.name).join(', ')})`);
      parts.set(ref, found.triangles);
    }
    return parts.get(ref);
  };
  // The build direction: a direction ('+z'), or a variable holding one
  const overhang = p.overhang ? (typeof values[p.overhang] === 'string' ? values[p.overhang] : p.overhang) : null;
  // A teardrop's point: a direction, or up or down the build direction (+z, as drawn, when it's free)
  const point = (t) => { const up = overhang && overhang !== 'none' ? overhang : '+z'; return t === 'up' ? up : t === 'down' ? (up[0] === '-' ? '+' : '-') + up[1] : t; };
  const region = async (r) => {
    if (r.part) return { triangles: await part(r.part), part: r.part };
    if (r.points) return { points: r.points.map(pt) };
    if (r.size) return { at: pt(r.at), size: r.size.map(ev) };
    if (r.length != null) { const axis = r.axis || 'z', t = r.teardrop && point(r.teardrop); return { at: pt(r.at), r: ev(r.r), length: ev(r.length), axis, ...(t && t[1] !== axis ? { teardrop: t } : {}) }; } // along its axis, a teardrop has no point
    return { at: pt(r.at), ...(r.r != null ? { r: ev(r.r) } : {}) };
  };
  const regions = (list) => Promise.all([list || []].flat().map(region));
  const m = values[p.material];
  if (typeof m?.modulus !== 'number' || typeof m?.poisson !== 'number') throw new Error(`material ${p.material}: its rule set needs modulus (MPa) and poisson`);
  const space = await regions(p.space), dim = space[0].triangles || space[0].length != null || (space[0].size || space[0].at)?.length === 3 ? 3 : 2;
  const problem = {
    space, keep: await regions(p.keep), avoid: await regions(p.avoid),
    supports: await Promise.all(p.supports.map(async (s) => ({ ...(await region(s)), fix: s.fix || 'xyz'.slice(0, dim) }))),
    loads: await Promise.all(p.loads.map(async (l) => ({ ...(await region(l)), force: pt(l.force), case: l.case || 'load' }))),
    cases: Object.fromEntries(Object.entries(p.cases || {}).map(([k, w]) => [k, ev(w)])),
    material: { E: m.modulus, nu: m.poisson }, ...(dim === 2 ? { thickness: ev(p.thickness) } : {}), cell: ev(p.cell), ...(p.volume != null ? { volume: ev(p.volume) } : {}), ...(p.stress != null ? { stress: ev(p.stress) } : {}),
    ...(p.filter != null ? { filter: ev(p.filter) } : {}), ...(p.penal != null ? { penal: ev(p.penal) } : {}),
    ...(p.projection != null ? { projection: p.projection } : {}), ...(p.steps != null ? { steps: p.steps } : {}),
    ...(overhang && overhang !== 'none' ? { overhang } : {}),
  };
  if (dim === 2 && !(problem.thickness > 0)) throw new Error(`${path.basename(file)}: a flat (2D) problem needs a thickness`);
  const outline = { smooth: p.outline?.smooth ?? 4, minArea: p.outline?.min_area != null ? ev(p.outline.min_area) : problem.cell ** 2 * 2 };
  // A printable solid's surface is kept within the printer's overhang limit too (smoothing can tip faces past it)
  if (dim === 3 && problem.overhang) { const n = printerOf(project), pr = resolve({ uses: [n] }).values[n]; outline.overhang = { up: problem.overhang, angle: pr?.overhang ?? 45, bridge: pr?.bridge ?? 5 }; problem.bridge = outline.overhang.bridge; } // (the optimiser bridges half that)
  return { ref, name, variant, file, dim, title: p.title || name, material: { name: p.material, ...m }, problem, outline, critical: !!p.critical };
}

/**
 * The optimised layout for a problem, from the cache when nothing it depends on has changed. A 2D result has outlines
 * (closed loops in mm); a 3D one has a mesh ({ vertices, faces }, a closed surface in mm).
 * @param {string} project @param {string} ref
 * @param {{ onStep?: Function, fresh?: boolean }} [options] fresh: run it even if it's cached
 */
export async function optimised(project, ref, { onStep, fresh = false } = {}) {
  const r = await readProblem(project, ref), topopt = source('@rulecad/topopt'), [solver] = topopt.split('// ---------- shapes from results ----------');
  const digest = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
  // Two keeps: the densities, by the problem and the code that decides them (the slow part), and the shape drawn from
  // them, by everything: a change to how shapes are drawn redraws them without optimising again
  // The shape's key holds this file too, so a change to how cad draws a result (anchored below) redraws it
  const hash = digest([VERSION, r.problem, r.outline, topopt, source('@rulecad/fea'), fs.readFileSync(new URL(import.meta.url), 'utf8')]), file = paths.cache('optimise', `${hash}.json`);
  if (!fresh && !process.env.CAD_NO_CACHE && host.exists(file)) return { ...JSON.parse(host.readText(file)), cached: true };
  const spec = discretise(r.problem), densities = paths.cache('densities', `${digest([VERSION, r.problem, solver, source('@rulecad/fea')])}.json`);
  const o = !fresh && !process.env.CAD_NO_CACHE && host.exists(densities) ? (({ density, ...x }) => ({ ...x, density: Float64Array.from(density) }))(JSON.parse(host.readText(densities))) : optimise(spec, { backend: threadsBackend, onStep: onStep && ((st) => onStep({ ...st, grid: spec.grid })) });
  if (!host.exists(densities)) host.writeText(densities, JSON.stringify({ ...o, density: Array.from(o.density) }));
  // Regions as data: a part's triangles are named, not copied
  const named = (list) => list.map(({ triangles, ...x }) => x);
  const shape = r.dim === 2 ? (() => {
    const loops = outlines(spec.grid, o.density, spec.origin, r.outline);
    return { outlines: loops.map((l) => l.map(([x, y]) => [round(x), round(y)])), area: loops.reduce((s, l) => s + area(l), 0) };
  })() : (() => {
    // The surface's level, found so the solid holds as much material as the optimised densities do (drawn at 0.5,
    // thin members come out thinner than they are)
    // Printed without supports: before it's drawn at a level, whatever wouldn't print at that level (hanging with nothing
    // under it) is emptied (printable, in topopt); kept regions stay. A bridge may run out half the printer's span.
    const ov = r.outline.overhang, keep = Uint8Array.from(spec.passive, (p) => (p === 1 ? 1 : 0)), emptied = new Map();
    const clean = (iso) => {
      if (!ov) return o.density;
      const c = printable(spec.grid, o.density, { up: ov.up, iso, keep, reach: Math.floor(ov.bridge / 2 / spec.grid.h) });
      emptied.set(iso, c.emptied);
      return c.density;
    };
    const want = o.density.reduce((t, d) => t + d, 0) * spec.grid.h ** 3, at = (iso) => surface(spec.grid, clean(iso), spec.origin, { smooth: r.outline.smooth, iso, overhang: ov });
    let lo = 0.2, hi = 0.8, best = at(0.5), iso = 0.5;
    for (let k = 0; k < 10 && Math.abs(meshVolume(best.vertices, best.faces) / want - 1) > 0.003; k++) {
      if (meshVolume(best.vertices, best.faces) < want) hi = iso; else lo = iso; // a lower level encloses more
      iso = (lo + hi) / 2; best = at(iso);
    }
    const anchors = [...r.problem.supports, ...r.problem.loads, ...(r.problem.keep || [])].map(bounds);
    const { vertices, faces, dropped } = anchored(best, anchors, spec.grid.h);
    return { mesh: { vertices: vertices.map((v) => v.map((c) => round(c, 3))), faces }, solid: meshVolume(vertices, faces), iso, ...(dropped.length ? { dropped } : {}), ...(emptied.get(iso) ? { emptied: emptied.get(iso) } : {}) };
  })();
  const result = {
    problem: ref, title: r.title, hash, dim: r.dim, material: r.material.name, ...(r.dim === 2 ? { thickness: r.problem.thickness } : {}),
    grid: spec.grid, origin: spec.origin, regions: { keep: named(spec.regions.keep), avoid: named(spec.regions.avoid) }, ...shape,
    volume: o.volume, compliance: o.compliance, cases: o.cases, ...(o.unsupported ? { unsupported: o.unsupported } : {}), ...(o.stress ? { stress: o.stress } : {}), overhang: r.problem.overhang || null,
    steps: o.steps, converged: o.converged, seconds: o.seconds, history: o.history, density: Array.from(o.density, (d) => round(d, 3)),
    supports: named(r.problem.supports), loads: named(r.problem.loads),
  };
  host.writeText(file, JSON.stringify(result));
  return result;
}

// A closed mesh's volume (mm³), by the divergence theorem
function meshVolume(vertices, faces) {
  let v = 0;
  for (const [i, j, k] of faces) { const a = vertices[i], b = vertices[j], c = vertices[k]; v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }
  return v;
}

// What a design gets as v.problems[name]: the outlines and regions to build from, and the numbers to report
export const forDesign = ({ density, history, ...r }) => r;

/**
 * Analyse a part under a problem's supports and loads, on its grid. A flat part (2D problem: triangles, z up, the
 * plate lying on the bed): each cell is as solid as the share of the problem's thickness the part fills above it. A
 * solid part (3D): each cube is solid if its centre is inside the part. Each load case reports how far it moves its load
 * (and the stiffness), the largest stress and where, and the largest movement anywhere and where.
 * @param {number[][][]} triangles @param {string} project @param {string} ref
 * @param {{ cell?: number }} [options] cell: a finer cell size than the problem's, to check a final shape
 */
export async function analysePart(triangles, project, ref, { cell } = {}) {
  const r = await readProblem(project, ref), { problem } = r, h = cell || problem.cell;
  if (r.dim === 3) { // kept: a fine analysis of a solid takes minutes
    const file = paths.cache('analysis', `${crypto.createHash('sha256').update(JSON.stringify([VERSION, triangles, problem, h, source('@rulecad/topopt'), source('@rulecad/fea'), fs.readFileSync(new URL(import.meta.url), 'utf8')])).digest('hex')}.json`);
    if (!process.env.CAD_NO_CACHE && host.exists(file)) { const { density, ...x } = JSON.parse(host.readText(file)); return { ...x, density: Float64Array.from(density) }; }
    const out = analyseSolid(triangles, r, h);
    host.writeText(file, JSON.stringify({ ...out, density: Array.from(out.density) }));
    return out;
  }
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
    const { size, moment } = resultant(problem.loads.filter((l) => l.case === name));
    return measures(name, size, moment, a, c, density, { nx, ny, nz: 1, h }, [x0, y0]);
  });
  return { problem: ref, dim: 2, material: r.material, critical: r.critical, cases, volume: volume(triangles), grid: { nx, ny, h }, origin: [x0, y0], density };
}

// A solid part on the problem's grid: the part itself is the space (keep and avoid regions don't apply), so the
// supports and loads land on it as they would on an optimised layout
function analyseSolid(triangles, r, cell) {
  const { problem } = r, spec = discretise({ ...problem, cell, space: { triangles }, keep: [], avoid: [], volume: 1 });
  const g = makeGrid(spec.grid), density = solidFill(triangles, spec.grid, spec.origin);
  if (!density.some((d) => d)) throw new Error('the part is smaller than one cell of the problem: use a smaller cell');
  const a = analyse({ grid: g, density, material: problem.material, fixed: spec.fixed, loads: spec.loads.map((l) => l.force), backend: threadsBackend });
  const cases = spec.loads.map((l, c) => measures(l.name, l.size, l.moment, a, c, density, spec.grid, spec.origin));
  return { problem: r.ref, dim: 3, material: r.material, critical: r.critical, cases, volume: volume(triangles), grid: spec.grid, origin: spec.origin, density };
}

// A load case's numbers: how far the load moves along itself (compliance over force) and the stiffness (a twist: the
// angle it turns, compliance over its moment, and the torsion, N·mm a radian), the largest
// stress in the part and the centre of the cell it's in, and the largest movement of any point of the part and where
function measures(name, force, moment, a, c, density, { nx, ny, h }, origin) {
  const deflection = force ? a.compliance[c] / force : 0, angle = moment ? a.compliance[c] / moment : 0;
  let most = 0, cellAt = 0;
  for (let e = 0; e < density.length; e++) if (density[e] >= 0.5 && a.stress[c][e] > most) { most = a.stress[c][e]; cellAt = e; }
  const index = [cellAt % nx, Math.floor(cellAt / nx) % ny, Math.floor(cellAt / (nx * ny))];
  const stressAt = origin.map((o, q) => round(o + (index[q] + 0.5) * h, 2)), d = a.deflection[c];
  return {
    name, ...(moment ? { moment, angle, torsion: moment / angle } : { force, deflection, stiffness: deflection ? force / deflection : Infinity }), stress: most, stressAt,
    movement: d.most, movementAt: d.at.map((x, q) => round(x + origin[q], 2)),
  };
}

// How much of each cube the part fills, from 0 to 1, so a wall between cell centres counts for what it is (a 6 mm
// plate on 2.5 mm cubes, solid only where a cube's centre is inside, is 5 mm thick, and bends 40% more). Rays run up
// through each column of cubes, n × n of them (exact up the column, to within half their spacing across it); each enters the part through a face facing down and leaves through
// one facing up, and the lengths inside each cube are averaged.
export function solidFill(triangles, { nx, ny, nz, h }, origin, n = 4) {
  const R = nx * n, hits = Array.from({ length: R * ny * n }, () => []), jx = h * 1e-4 * Math.SQRT2, jy = h * 1e-4 * Math.PI;
  for (const [a, b, c] of triangles) {
    const d = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(d) < 1e-12) continue; // a wall: the ray runs alongside it
    const i0 = Math.max(0, Math.floor(((Math.min(a[0], b[0], c[0]) - origin[0]) / h) * n - 1)), i1 = Math.min(R - 1, Math.ceil(((Math.max(a[0], b[0], c[0]) - origin[0]) / h) * n));
    const j0 = Math.max(0, Math.floor(((Math.min(a[1], b[1], c[1]) - origin[1]) / h) * n - 1)), j1 = Math.min(ny * n - 1, Math.ceil(((Math.max(a[1], b[1], c[1]) - origin[1]) / h) * n));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = origin[0] + ((i + 0.5) / n) * h + jx, y = origin[1] + ((j + 0.5) / n) * h + jy;
      const w0 = ((b[0] - x) * (c[1] - y) - (b[1] - y) * (c[0] - x)) / d, w1 = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) / d, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      hits[j * R + i].push([w0 * a[2] + w1 * b[2] + w2 * c[2], Math.sign(d)]);
    }
  }
  const density = new Float64Array(nx * ny * nz), share = 1 / (n * n * h);
  hits.forEach((list, ray) => {
    if (!list.length) return;
    list.sort((p, q) => p[0] - q[0]);
    const ci = Math.floor((ray % R) / n), cj = Math.floor(Math.floor(ray / R) / n);
    let depth = 0, from = 0;
    for (const [z, sign] of list) {
      const was = depth; depth -= sign; // a face facing down (its normal's z below 0, counter-clockwise from above: sign -1) is the way in
      if (was <= 0 && depth > 0) from = z;
      else if (was > 0 && depth <= 0) for (let k = Math.max(0, Math.floor((from - origin[2]) / h)); k < nz && origin[2] + k * h < z; k++) {
        const lo = Math.max(from, origin[2] + k * h), hi = Math.min(z, origin[2] + (k + 1) * h);
        if (hi > lo) density[(k * ny + cj) * nx + ci] += (hi - lo) * share;
      }
    }
  });
  return density.map((x) => Math.min(1, x));
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

// Loose pieces: drawn from cells, a few grey cells away from the rest can close into a piece of their own, which would
// print as a stray bit. Only pieces touching a support, a load or a kept region (within a cell) stay; the volumes of
// the rest, mm³, come back as dropped.
export function anchored({ vertices, faces }, anchors, h) {
  const up = vertices.map((_, i) => i), find = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  for (const [a, b, c] of faces) { up[find(a)] = find(b); up[find(b)] = find(c); }
  const pieces = new Map();
  for (const f of faces) {
    const r = find(f[0]), p = pieces.get(r) ?? { faces: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    p.faces.push(f);
    for (const v of f) for (let k = 0; k < 3; k++) { p.lo[k] = Math.min(p.lo[k], vertices[v][k]); p.hi[k] = Math.max(p.hi[k], vertices[v][k]); }
    pieces.set(r, p);
  }
  if (pieces.size < 2) return { vertices, faces, dropped: [] };
  const touches = (p) => anchors.some((b) => [0, 1, 2].every((k) => p.lo[k] <= b[3 + k] + h && p.hi[k] >= b[k] - h));
  const kept = [], dropped = [];
  for (const p of pieces.values()) (touches(p) ? kept : dropped).push(p);
  if (!kept.length) return { vertices, faces, dropped: [] }; // nothing anchored: keep it all rather than nothing
  const index = new Map(), out = [];
  const keptFaces = kept.flatMap((p) => p.faces).map((f) => f.map((v) => { if (!index.has(v)) { index.set(v, out.length); out.push(vertices[v]); } return index.get(v); }));
  return { vertices: out, faces: keptFaces, dropped: dropped.map((p) => round(meshVolume(vertices, p.faces), 3)) };
}

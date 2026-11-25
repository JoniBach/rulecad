// Optimisation problems and analysis: problems/<name>.json in a project describes a part to optimise, flat (2D) or
// solid (3D): where material may go, what stays solid or empty, supports, loads, material. @rulecad/topopt finds the
// stiffest layout, and @rulecad/fea analyses any part under the same problem's loads (an object's "analysis", run by
// cad check). The problem file is the source: a result is derived from it, cached by everything it's made from, and
// remade only when one of those changes. A name may pick a variant: lever:both. A 3D region can be a named part of
// another design in the project ({ "part": "envelope.body" }), as it's built.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { host, readJson } from './host.mjs';
import { paths, printerOf } from './workspace.mjs';
import { resolve, evaluate } from './rules.mjs';
import { located } from './errors.mjs';
import { discretise, optimise, outlines, surface, area, bounds, resultant, printable, refine, despike, reduce, undercuts, voids, grey } from '@rulecad/topopt';
import { islands } from '@rulecad/printcheck';
import { turn, mul, inv, placeItems, jointValues } from '@rulecad/model-link';
import { section, loops } from './mesh.mjs';
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
  // The problems being read above this one, each with the design it reads that is built from the next: a problem met
  // again on that chain is refused by name, since each would need the other's result before its own could be made
  const name = String(ref).split(':')[0], chain = reading.getStore() || [], key = `${project}/${name}`;
  if (chain.some((c) => c.key === key)) {
    const from = chain.slice(chain.findIndex((c) => c.key === key)), steps = from.map((c, i) => `${c.name} reads ${c.object}, built from ${(from[i + 1] || { name })?.name}`);
    throw new Error(`${name}.json: problems read each other through designs built from them: ${steps.join(', then ')}. Fix one of them to a part or anchor of a design that is not made from the others`);
  }
  const link = { key, name, object: null };
  return reading.run([...chain, link], () => readOne(project, ref, link));
}
const reading = new AsyncLocalStorage();
async function readOne(project, ref, link) {
  const [name, variant] = String(ref).split(':'), file = problemFile(project, name);
  if (!host.exists(file)) throw new Error(`no problem "${name}" (projects/${project}/problems/${name}.json)`);
  const p = readJson(file);
  if (variant && !p.variants?.[variant]) throw new Error(`problem ${name} has no variant "${variant}" (variants: ${Object.keys(p.variants || {}).join(', ') || 'none'})`);
  const uses = [...new Set([...(p.uses || []), p.material])];
  let values;
  try { ({ values } = resolve({ uses, variables: p.variables || {} }, { set: variant ? p.variants[variant] : {} })); } catch (e) { throw located(e, file, 'var'); }
  const lookup = (n) => {
    const v = n.split('.').reduce((o, k) => (o == null ? o : o[k]), values);
    if (typeof v !== 'number') throw new Error(`${path.basename(file)}: "${n}" isn't a number here (variables: ${Object.keys(p.variables || {}).join(', ')})`);
    return v;
  };
  const ev = (x) => evaluate(x, lookup), pt = (a) => a.map(ev), flat = p.thickness != null;
  // Another design in the project, built once with its defaults, for its parts and anchors. One whose default is built
  // from this very problem is refused: it would need the result before the result could be made.
  const designs = new Map();
  const design = (object, what) => { // (the build kept as it starts: regions are read side by side)
    if (!designs.has(object)) designs.set(object, (async () => {
      const { build, locate, readObject } = await import('./design.mjs'), d = locate(`${project}/${object}`);
      const own = Object.entries(readObject(d).variables || {}).find(([, v]) => v.type === 'problem' && String(v.value).split(':')[0] === name);
      if (own) throw new Error(`${path.basename(file)}: ${what} is on ${object}, which is built from this problem (its variable ${own[0]}): name a part or anchor of what it is fixed to instead`);
      const chain = reading.getStore(); // this problem's place on the chain names the design it reads
      return reading.run([...chain.slice(0, -1), { ...link, object }], () => build(d));
    })());
    return designs.get(object);
  };
  // A named part of another design in the project, as triangles (built with its defaults)
  const parts = new Map();
  const part = async (ref) => {
    if (!parts.has(ref)) {
      const [object, partName] = ref.split('.'), b = await design(object, `the part "${ref}"`);
      const found = partName ? b.parts.find((q) => q.name === partName) : b.parts.find((q) => q.role !== 'support');
      if (!found) throw new Error(`${path.basename(file)}: ${object} has no part "${partName}" (parts: ${b.parts.map((q) => q.name).join(', ')})`);
      parts.set(ref, found.triangles);
    }
    return parts.get(ref);
  };
  // An anchor of another design (object.anchor): where it is and its axis, in that design's frame, worked out from its
  // values as built. A region at an anchor follows the design: move the anchor, and the problem (and its result) moves.
  const anchors = new Map();
  const anchor = async (ref) => {
    if (!anchors.has(ref)) {
      const [object, a, ...more] = String(ref).split('.');
      if (!object || !a || more.length) throw new Error(`${path.basename(file)}: name an anchor as <object>.<anchor> (got "${ref}")`);
      const b = await design(object, `the anchor "${ref}"`), spec = b.object.anchors?.[a];
      if (!spec) throw new Error(`${path.basename(file)}: ${object} has no anchor "${a}" (anchors: ${Object.keys(b.object.anchors || {}).join(', ') || 'none'})`);
      const num = (x) => evaluate(x, (n) => {
        const v = n.split('.').reduce((o, k) => (o == null ? o : o[k]), b.values);
        if (typeof v !== 'number') throw new Error(`${path.basename(file)}: the anchor "${ref}" reads "${n}", which isn't one of ${object}'s numbers`);
        return v;
      });
      // Its axis is its z, as an assembly reads it: turned by its rotate (degrees about x, then y, then z) where it has one
      const m = spec.rotate && turn(spec.rotate.map(num)), axis = m ? [m[2], m[6], m[10]].map((c) => (Math.abs(c) < 1e-12 ? 0 : c)) : (spec.axis || [0, 0, 1]).map(num);
      anchors.set(ref, { anchor: ref, at: (spec.at || [0, 0, 0]).map(num), axis });
    }
    return anchors.get(ref);
  };
  // The assembly the problem is placed in ("in": { "assembly", "item", "pose", "z" }): its coordinates are that item's
  // own there, as the item's design draws the result. Built once, in its pose (default the one it shows), for its
  // joints and its moving parts; the item itself, and any other made from this very problem, is drawn without a result
  // (its problem variables set to none), since the result can't be needed to place the problem it comes from.
  const fileName = path.basename(file);
  let placing = null;
  const inAssembly = (what) => {
    if (!p.in) throw new Error(`${fileName}: ${what} needs the problem placed in an assembly: "in": { "assembly": "<name>", "item": "<the item it is drawn in>" }`);
    return (placing ||= (async () => {
      const { buildAssembly, assemblyPath } = await import('./assembly.mjs'), { locate, readObject } = await import('./design.mjs');
      const ref = `${project}/${p.in.assembly}`, overrides = {};
      if (!host.exists(assemblyPath(ref))) throw new Error(`${fileName}: no assembly "${p.in.assembly}" to place the problem in (projects/${project}/assemblies/${p.in.assembly}.json)`);
      for (const it of readJson(assemblyPath(ref)).items || []) if (typeof it.object === 'string') {
        let vars = {};
        try { vars = readObject(locate(`${project}/${it.object.split(/[:@]/)[0]}`)).variables || {}; } catch { continue; }
        for (const [k, v] of Object.entries(vars)) if (v.type === 'problem' && (it.id === p.in.item || String(it.set?.[k] ?? v.value).split(':')[0] === name)) (overrides[it.id] ||= {})[k] = 'none';
      }
      const chain = reading.getStore();
      const s = await reading.run([...chain.slice(0, -1), { ...link, object: `the assembly ${p.in.assembly}` }], () => buildAssembly(ref, [], overrides, { pose: p.in.pose, onePose: true }));
      const k = s.motion.items.findIndex((x) => x[0] === p.in.item);
      if (k < 0) throw new Error(`${fileName}: ${p.in.assembly} has no item "${p.in.item}" (items: ${s.motion.items.map((x) => x[0]).join(', ')})`);
      return { s, k, W0: placeItems(s.motion, s.jointValues) };
    })());
  };
  // A joint of that assembly, where it is in the item's frame: the joint's anchor on the item when the item is one of
  // its ends (the same in every pose), else the parent's anchor as the pose places it. Its axis is the anchor's z.
  const joints = new Map(), clean = (c) => (Math.abs(c) < 1e-9 ? 0 : round(c, 9));
  const jointAt = async (id) => {
    if (!joints.has(id)) {
      const { s, k, W0 } = await inAssembly(`the joint "${id}"`), j = s.motion.joints.find((x) => x.id === id);
      if (!j) throw new Error(`${fileName}: ${p.in.assembly} has no joint "${id}" (joints: ${s.motion.joints.map((x) => x.id).join(', ') || 'none'})`);
      const F = j.child === k ? j.b : j.parent === k ? j.a : mul(inv(W0[k]), j.parent < 0 ? j.a : mul(W0[j.parent], j.a));
      joints.set(id, { joint: id, at: [F[3], F[7], F[11]].map(clean), axis: [F[2], F[6], F[10]].map(clean) });
    }
    return joints.get(id);
  };
  // A part of the assembly swept through a joint's range, as regions to keep clear: the part at each step, in the
  // item's frame (the other joints held at the pose). Steps by default so no point of it moves more than half a cell
  // between two (its travel measured in 32 pieces of the range). In a flat problem, each step is the part's section
  // in the plate's middle plane (in.z, default half its thickness), so a part passing over or under the plate is clear.
  const sweeps = [];
  const swept = async (r) => {
    const { s, k, W0 } = await inAssembly(`the sweep of "${r.sweep}"`), item = p.in.item, cell = ev(p.cell);
    const isNamed = (q, n) => q.name === n || q.leaf === n || q.item === n || q.name.startsWith(`${n}.`), moving = s.parts.filter((q) => isNamed(q, r.sweep));
    if (!moving.length) throw new Error(`${fileName}: ${p.in.assembly} has no item or part "${r.sweep}" to sweep (items: ${s.motion.items.map((x) => x[0]).join(', ')})`);
    if (moving.some((q) => (q.moves ?? q.item) === item)) throw new Error(`${fileName}: "${r.sweep}" is ${item} itself, the item this problem is in: sweep a part that moves against it`);
    const free = s.motion.joints.filter((j) => !j.follow && j.dofs.length), through = [r.through ?? []].flat();
    if (!through.length) throw new Error(`${fileName}: the sweep of "${r.sweep}" needs the joint it moves through: "through": "<joint>" (joints: ${free.map((j) => j.id).join(', ') || 'none'})`);
    const apply = (M, [x, y, z]) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];
    const idx = moving.map((q) => s.motion.items.findIndex((x) => x[0] === (q.moves ?? q.item)));
    const local = moving.map((q, i) => { const L = inv(W0[idx[i]]); return q.triangles.map((t) => t.map((v) => apply(L, v))); }); // each in its own item's frame
    const sample = local.map((tris) => { const v = tris.flat(), n = Math.ceil(v.length / 400); return v.filter((_, i) => i % n === 0); }); // (no more than about 400 points a part)
    const held = Object.fromEntries(Object.entries(s.jointValues).filter(([id]) => !s.motion.joints.find((x) => x.id === id).follow));
    const z = flat ? (p.in.z != null ? ev(p.in.z) : ev(p.thickness) / 2) : null, out = [];
    for (const id of through) {
      const j = free.find((x) => x.id === id);
      if (!j) throw new Error(`${fileName}: ${p.in.assembly} has no joint "${id}" that moves on its own to sweep "${r.sweep}" through (joints: ${free.map((x) => x.id).join(', ') || 'none'})`);
      j.dofs.forEach(([lo, hi], d) => {
        const at = (v) => { const W = placeItems(s.motion, jointValues(s.motion, { ...held, [id]: held[id].map((x, i) => (i === d ? v : x)) })), T = inv(W[k]); return idx.map((m) => mul(T, W[m])); };
        let travel = 0, before = at(lo).map((M, m) => sample[m].map((v) => apply(M, v)));
        for (let i = 1; i <= 32; i++) {
          const now = at(lo + ((hi - lo) * i) / 32).map((M, m) => sample[m].map((v) => apply(M, v)));
          travel += Math.max(0, ...now.flatMap((pts, m) => pts.map((q, n) => Math.hypot(...q.map((c, a) => c - before[m][n][a])))));
          before = now;
        }
        const what = `${id}${j.dofs.length > 1 ? ` (its value ${d + 1})` : ''}`;
        if (!(travel > 1e-6)) throw new Error(`${fileName}: ${what} doesn't move "${r.sweep}" against ${item} (from ${round(lo)} to ${round(hi)}): sweep it through a joint between them`);
        const steps = r.steps ?? Math.max(1, Math.ceil((2 * travel) / cell));
        if (r.steps == null && steps > 360) throw new Error(`${fileName}: sweeping "${r.sweep}" through ${what} would take ${steps} steps on ${cell} mm cells (its farthest point travels ${round(travel, 1)} mm): give the sweep its steps, or larger cells`);
        let made = 0;
        for (let i = 0; i <= steps; i++) {
          const v = lo + ((hi - lo) * i) / steps, Ms = at(v);
          for (const [m, tris] of local.entries()) {
            const moved = tris.map((t) => t.map((q) => apply(Ms[m], q).map(clean)));
            if (!flat) { out.push({ triangles: moved, sweep: r.sweep, joint: id, value: round(v, 6) }); made++; continue; }
            // The section's outlines, each a ring turned solid on its left (an outline counter-clockwise, a hole in it
            // clockwise), for the design to cut exactly (rings); and for the solver one polygon of them all, each closed and
            // back to the first one's start, so a point is inside where it is inside an odd number of them (a hole in the
            // part stays open) and the joins cancel out
            const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
            const rings = loops(section(moved, 2, z)).map((l) => (same(l[0], l.at(-1)) ? l.slice(0, -1) : l).map((q) => q.map(clean))).filter((l) => l.length >= 3);
            if (!rings.length) continue;
            const within = (q, P) => { let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a][1] > q[1]) !== (P[b][1] > q[1]) && q[0] < ((P[b][0] - P[a][0]) * (q[1] - P[a][1])) / (P[b][1] - P[a][1]) + P[a][0]) c = !c; return c; };
            const turned = rings.map((l, n) => {
              const depth = rings.filter((o, m) => m !== n && within(l[0], o)).length, ccw = l.reduce((t, q, a) => t + q[0] * l[(a + 1) % l.length][1] - l[(a + 1) % l.length][0] * q[1], 0) > 0;
              return ccw === (depth % 2 === 0) ? l : [...l].reverse();
            });
            const start = turned[0][0], points = turned.flatMap((l, n) => [...l, l[0], ...(n ? [start] : [])]);
            out.push({ points, rings: turned, sweep: r.sweep, joint: id, value: round(v, 6) }); made++;
          }
        }
        sweeps.push({ sweep: r.sweep, through: what, from: round(lo, 6), to: round(hi, 6), steps, regions: made });
      });
    }
    if (!out.length) throw new Error(`${fileName}: "${r.sweep}" never crosses the plate's middle plane (z ${round(z)} mm in ${item}) through ${through.join(', ')}: nothing to keep clear there (set in.z if the plate lies elsewhere)`);
    return out;
  };
  // The build direction: a direction ('+z'), or a variable holding one
  const overhang = p.overhang ? (typeof values[p.overhang] === 'string' ? values[p.overhang] : p.overhang) : null;
  // A teardrop's point: a direction, or up or down the build direction (+z, as drawn, when it's free)
  const point = (t) => { const up = overhang && overhang !== 'none' ? overhang : '+z'; return t === 'up' ? up : t === 'down' ? (up[0] === '-' ? '+' : '-') + up[1] : t; };
  const region = async (r) => {
    if (r.sweep != null) throw new Error(`${path.basename(file)}: a swept part ("${r.sweep}") is a region to keep clear: put it under avoid`);
    if (r.anchor || r.joint) { // at an anchor, or an assembly's joint: its place (x and y in a flat problem), and a cylinder along its axis unless it names one
      const kind = r.anchor ? 'anchor' : 'joint', named = `the ${kind} "${r.anchor || r.joint}"`;
      if (r.anchor && r.joint) throw new Error(`${path.basename(file)}: a region is at an anchor or at a joint, not both ("${r.anchor}", "${r.joint}")`);
      if (r.at) throw new Error(`${path.basename(file)}: a region at an ${kind} ("${r.anchor || r.joint}") takes no at: the ${kind} places it`);
      const a = r.anchor ? await anchor(r.anchor) : await jointAt(r.joint), along = a.axis.map((c) => Math.abs(c) > 1e-9);
      if (r.length != null && !r.axis && along.filter(Boolean).length !== 1) throw new Error(`${path.basename(file)}: ${named} points along [${a.axis.map((c) => round(c, 3)).join(', ')}], not along x, y or z: give the cylinder an axis`);
      return region({ ...r, anchor: undefined, joint: undefined, at: flat ? a.at.slice(0, 2) : a.at, ...(r.length != null && !r.axis ? { axis: 'xyz'[along.indexOf(true)] } : {}) });
    }
    if (r.part) { // with where it is (its box's centre), for a load's or support's resultant
      const triangles = await part(r.part), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const t of triangles) for (const q of t) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); }
      const at = lo.map((x, a) => (x + hi[a]) / 2);
      return flat ? { triangles, part: r.part, at: at.slice(0, 2), flat: true } : { triangles, part: r.part, at }; // flat: its section halfway up
    }
    if (r.points) return { points: r.points.map(pt) };
    if (r.size) return { at: pt(r.at), size: r.size.map(ev) };
    if (r.length != null) { const axis = r.axis || 'z', t = r.teardrop && point(r.teardrop); return { at: pt(r.at), r: ev(r.r), length: ev(r.length), axis, ...(t && t[1] !== axis ? { teardrop: t } : {}) }; } // along its axis, a teardrop has no point
    return { at: pt(r.at), ...(r.r != null ? { r: ev(r.r) } : {}) };
  };
  const regions = (list) => Promise.all([list || []].flat().map(region));
  const m = values[p.material];
  if (typeof m?.modulus !== 'number' || typeof m?.poisson !== 'number') throw new Error(`material ${p.material}: its rule set needs modulus (MPa) and poisson`);
  // The filter's radius is about the thinnest member: a cell and a half unless the problem gives one, and never under two
  // of the printer's lines, the thinnest wall it lays solid (so it only binds on cells under 0.56 mm on a 0.42 mm line)
  const printer = printerOf(project), line = printer ? resolve({ uses: [printer] }).values[printer]?.line : null, lines = typeof line === 'number' ? 2 * line : 0;
  const space = await regions(p.space), dim = flat ? 2 : space[0].triangles || space[0].length != null || (space[0].size || space[0].at)?.length === 3 ? 3 : 2;
  const problem = {
    space, keep: await regions(p.keep), avoid: (await Promise.all([p.avoid || []].flat().map(async (r) => (r.sweep != null ? swept(r) : [await region(r)])))).flat(),
    supports: await Promise.all(p.supports.map(async (s) => ({ ...(await region(s)), fix: s.fix || 'xyz'.slice(0, dim) }))),
    loads: await Promise.all(p.loads.map(async (l) => ({ ...(await region(l)), force: pt(l.force), case: l.case || 'load' }))),
    cases: Object.fromEntries(Object.entries(p.cases || {}).map(([k, w]) => [k, ev(w)])),
    material: { E: m.modulus, nu: m.poisson }, ...(dim === 2 ? { thickness: ev(p.thickness) } : {}), cell: ev(p.cell), ...(p.volume != null ? { volume: ev(p.volume) } : {}), ...(p.stress != null ? { stress: ev(p.stress) } : {}), ...(p.strain != null ? { strain: ev(p.strain) } : {}),
    ...(p.filter != null ? { filter: ev(p.filter) } : lines > ev(p.cell) * 1.5 ? { filter: lines } : {}), ...(p.penal != null ? { penal: ev(p.penal) } : {}),
    ...(p.projection != null ? { projection: p.projection } : {}), ...(p.steps != null ? { steps: p.steps } : {}),
    ...(overhang && overhang !== 'none' ? { overhang } : {}),
    // How it's made other than printed: milled from a side, cast in a mould; symmetric, extruded (topopt's filters)
    ...(p.mill ? { mill: p.mill } : {}), ...(p.cast ? { cast: typeof p.cast === 'string' ? p.cast : { draw: p.cast.draw, ...(p.cast.parting != null ? { parting: ev(p.cast.parting) } : {}) } } : {}),
    ...(p.symmetry ? { symmetry: p.symmetry } : {}), ...(p.extrude ? { extrude: p.extrude } : {}),
    // A mechanism: where the output should move, along one axis, against a spring; a spring the input pushes against
    ...(p.output ? { output: { ...(await region(p.output)), direction: pt(p.output.direction), ...(p.output.spring != null ? { spring: ev(p.output.spring) } : {}) } } : {}),
    ...(p.input_spring != null ? { input_spring: ev(p.input_spring) } : {}),
  };
  if (dim === 2 && !(problem.thickness > 0)) throw new Error(`${path.basename(file)}: a flat (2D) problem needs a thickness`);
  const outline = { smooth: p.outline?.smooth ?? 4, minArea: p.outline?.min_area != null ? ev(p.outline.min_area) : problem.cell ** 2 * 2, fine: p.outline?.fine != null ? ev(p.outline.fine) : 1.25, ...(p.outline?.reduce != null ? { reduce: ev(p.outline.reduce) } : {}) }; // fine: the cells a printable solid is cleaned and drawn on, mm (its own cells if smaller)
  // A printable solid's surface is kept within the printer's overhang limit too (smoothing can tip faces past it)
  // (outline.tip: faces the smoothing left steeper than the limit are tipped back to it too; off unless asked, since
  // tipped corners leave dips that slice as islands, and the layers step out no further for it)
  if (dim === 3 && problem.overhang) { const n = printerOf(project), pr = resolve({ uses: [n] }).values[n]; outline.overhang = { up: problem.overhang, angle: pr?.overhang ?? 45, bridge: pr?.bridge ?? 5, layer: pr?.layer ?? 0.2, line: pr?.line ?? 0.42, ...(p.outline?.tip ? { tip: true } : {}) }; problem.bridge = outline.overhang.bridge; } // (the optimiser bridges half that)
  // What the result is made from, for cad why: the rule sets, the problem's own values, the parts and anchors of other
  // designs it reads, and where its filter came from
  const inputs = { uses, variables: Object.fromEntries(Object.keys(p.variables || {}).map((k) => [k, values[k]])), ...(variant ? { set: p.variants[variant] } : {}),
    parts: [...parts.keys()].sort(), ...(p.in ? { assembly: { name: p.in.assembly, item: p.in.item, pose: placing ? (await placing).s.pose : p.in.pose ?? null, joints: [...joints.values()].sort((a, b) => (a.joint < b.joint ? -1 : 1)).map(({ joint: j, at }) => ({ joint: j, at: at.map((c) => round(c, 4)) })), sweeps } } : {}), anchors: [...anchors.values()].sort((a, b) => (a.anchor < b.anchor ? -1 : 1)).map(({ anchor: a, at }) => ({ anchor: a, at: at.map((c) => round(c, 4)) })),
    filter: p.filter != null ? { value: problem.filter, from: `the problem: ${p.filter}` } : problem.filter ? { value: problem.filter, from: `two of ${printer}'s lines (2 × ${line} mm), more than a cell and a half` } : { value: round(problem.cell * 1.5), from: 'a cell and a half' } };
  return { ref, name, variant, file, dim, title: p.title || name, material: { name: p.material, ...m }, problem, outline, critical: !!p.critical, inputs, voids: p.voids || 'allowed' };
}

/**
 * The optimised layout for a problem, from the cache when nothing it depends on has changed. A 2D result has outlines
 * (closed loops in mm); a 3D one has a mesh ({ vertices, faces }, a closed surface in mm).
 * @param {string} project @param {string} ref
 * @param {{ onStep?: Function, onRun?: (why: string) => void, fresh?: boolean }} [options] fresh: run it even if it's cached;
 *   onRun: called once if it has to optimise, with why (no result yet, or the solver has changed since the last one)
 */
// Nodes no cell that may be solid touches (the grid's corners outside a shaped space, the inside of avoided pockets)
// are held: at the void's near-nothing stiffness they are what the solver crawls through, and they carry no material
function holdEmpty(spec) {
  const g = makeGrid(spec.grid), dim = spec.grid.nz ? 3 : 2, corners = 1 << dim, on = new Uint8Array(g.nodes);
  for (let e = 0; e < g.cells; e++) if (spec.passive[e] >= 0) for (let k = 0; k < corners; k++) on[g.edof[e * g.cellDofs + dim * k] / dim] = 1;
  for (let m = 0; m < g.nodes; m++) if (!on[m]) for (let a = 0; a < dim; a++) spec.fixed[dim * m + a] = 1;
  return spec;
}
// How a result is made, and what that process can't make in it: for a milled or cast part, the cells a tool or mould
// half could not reach (undercuts, none by construction unless an avoid region or the space's own shape leaves material between a cell and its side), how grey it is; where enclosed voids are
// refused (a powder bed print, a trapped core), each void with its volume (mm³, or mm² in 2D) and where it is
function made(r, spec, density) {
  const p = r.problem, out = {};
  if (p.mill || p.cast) {
    const c = spec.cast, from = p.mill || (typeof c === 'string' ? c : c.draw), u = undercuts(spec.grid, density, { from, ...(c && typeof c === 'object' ? { parting: c.parting } : {}) });
    out.process = p.mill ? { mill: p.mill } : { cast: typeof c === 'string' ? c : { draw: c.draw, parting: round(c.at, 3) } };
    out.undercuts = u.count;
  }
  if (p.symmetry) out.symmetry = p.symmetry;
  if (p.extrude) out.extrude = p.extrude;
  // How grey it came out: a process or a tie can leave no clear part (a 2D section milled from its side)
  if (p.mill || p.cast || p.symmetry || p.extrude) out.grey = round(grey(density, spec.passive), 3);
  if (r.voids === 'refused') out.voids = voids(spec.grid, density, { origin: spec.origin }).map((v) => ({ volume: round(v.volume, 3), at: v.at.map((x) => round(x, 3)) }));
  return out;
}
const digest = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
/**
 * The code an optimisation's densities are made by, each piece by name: this file's VERSION, topopt's solver (its file
 * up to its shapes from results), the FE's code and its threads backend (the solver's products), and cad's own code
 * that readies the problem for the solver (holdEmpty). Drawing a shape from the densities is not in it.
 * @returns {{ version: number, solver: string, fea: string, threads: string, cad: string }}
 */
export const densityCode = () => ({ version: VERSION, solver: source('@rulecad/topopt').split('// ---------- shapes from results ----------')[0], fea: source('@rulecad/fea'), threads: source('@rulecad/fea/threads'), cad: `${holdEmpty.toString()}\n${optimised.toString()}` });
/**
 * The key an optimisation's densities are kept by (.cache/densities/<key>.json): the problem and every piece of
 * densityCode (cad's own share is holdEmpty and optimised, which readies the problem and calls the solver with its
 * settings), so a change to any of them optimises again, in this checkout or in another commit's copy that shares
 * the folder (scripts/dimension-diff.mjs).
 * @param {object} problem readProblem's problem @param {ReturnType<typeof densityCode>} [code] @returns {string}
 */
export const densitiesKey = (problem, code = densityCode()) => digest([code.version, problem, code.solver, code.fea, code.threads, code.cad]);
export async function optimised(project, ref, { onStep, onRun, fresh = false } = {}) {
  const r = await readProblem(project, ref), topopt = source('@rulecad/topopt');
  // Two keeps: the densities, by the problem and the code that decides them (the slow part), and the shape drawn from
  // them, by everything: a change to how shapes are drawn redraws them without optimising again
  // The shape's key holds this file too, so a change to how cad draws a result (anchored below) redraws it
  const hash = digest([VERSION, r.problem, r.outline, r.voids, topopt, source('@rulecad/fea'), fs.readFileSync(new URL(import.meta.url), 'utf8')]), file = paths.cache('optimise', `${hash}.json`);
  if (!fresh && !process.env.CAD_NO_CACHE && host.exists(file)) return { ...JSON.parse(host.readText(file)), cached: true };
  const spec = holdEmpty(discretise(r.problem)), densities = paths.cache('densities', `${densitiesKey(r.problem)}.json`);
  // A mark that this problem has been optimised before (by any solver), so a run can say whether it's the solver that changed
  const seen = paths.cache('densities', `${digest([VERSION, r.problem])}.seen`);
  if (!fresh && !process.env.CAD_NO_CACHE && !host.exists(densities)) onRun?.(host.exists(seen) ? 'the solver has changed since its last result' : 'no result yet');
  else if (fresh) onRun?.('asked to run afresh');
  const o = !fresh && !process.env.CAD_NO_CACHE && host.exists(densities) ? (({ density, ...x }) => ({ ...x, density: Float64Array.from(density) }))(JSON.parse(host.readText(densities))) : optimise(spec, { backend: threadsBackend, onStep: onStep && ((st) => onStep({ ...st, grid: spec.grid })) });
  if (!host.exists(densities)) host.writeText(densities, JSON.stringify({ ...o, density: Array.from(o.density) }));
  if (!host.exists(seen)) host.writeText(seen, '');
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
    const ov = r.outline.overhang, coarseKeep = Uint8Array.from(spec.passive, (p) => (p === 1 ? 1 : 0)), emptied = new Map();
    const cleaned = (grid, density, keep, iso) => {
      if (!ov) return density;
      const reach = Math.floor(ov.bridge / 2 / grid.h);
      // Spikes off the underside first (a hanging cell with few neighbours), then whatever is left hanging, in turn until neither finds any
      let d = density, gone = 0;
      for (let round = 0; round < 10; round++) {
        const sp = despike(grid, d, { up: ov.up, iso, keep }), c = printable(grid, sp.density, { up: ov.up, iso, keep, reach });
        d = c.density; gone += sp.emptied + c.emptied;
        if (!sp.emptied && !c.emptied) break;
      }
      emptied.set(iso, gone);
      return d;
    };
    // The surface's level, found so the solid holds as much material as the optimised densities do (drawn at 0.5,
    // thin members come out thinner than they are): found on the grid it was optimised on, which is quick
    const want = o.density.reduce((t, d) => t + d, 0) * spec.grid.h ** 3, draw = (grid, density, keep, iso) => surface(grid, cleaned(grid, density, keep, iso), spec.origin, { smooth: r.outline.smooth, iso, overhang: ov });
    let lo = 0.2, hi = 0.8, best = draw(spec.grid, o.density, coarseKeep, 0.5), iso = 0.5;
    for (let k = 0; k < 10 && Math.abs(meshVolume(best.vertices, best.faces) / want - 1) > 0.003; k++) {
      if (meshVolume(best.vertices, best.faces) < want) hi = iso; else lo = iso; // a lower level encloses more
      iso = (lo + hi) / 2; best = draw(spec.grid, o.density, coarseKeep, iso);
    }
    // Then drawn on a finer grid (cells no bigger than the outline's fine size, 1 mm), so the cleaning works at nearer
    // the printer's resolution: between two coarse cells the surface can dip under the overhang line, which sliced is an
    // island; on the fine grid those dips are cells of their own, and go. One correction of the level for the volume.
    const cells = spec.grid.nx * spec.grid.ny * spec.grid.nz, factor = ov ? Math.max(1, Math.min(Math.ceil(spec.grid.h / (r.outline.fine ?? 1) - 1e-9), Math.floor(Math.cbrt(2e6 / cells)))) : 1; // and no more than about two million fine cells
    const fine = factor > 1 ? refine(spec.grid, o.density, factor, { keep: coarseKeep, smooth: 1 }) : null;
    let cleared = 0;
    if (fine) {
      best = draw(fine.grid, fine.density, fine.keep, iso);
      const ratio = meshVolume(best.vertices, best.faces) / want;
      if (Math.abs(ratio - 1) > 0.01) { iso = Math.min(0.8, Math.max(0.2, iso + (ratio - 1) * 0.3)); best = draw(fine.grid, fine.density, fine.keep, iso); } // a touch up or down the level
      // Then as the printer will see it: sliced into layers, each against the one below. Wherever a layer's region has
      // nothing under it (an island, which the printer lays on air), the fine cells it starts from are emptied, the
      // cleaning takes whatever hung on them, and it's drawn again, until a slice finds none (each round a redraw)
      const { nx, ny, nz, h } = fine.grid, [ox, oy, oz] = spec.origin;
      if ('xyz'.indexOf(ov.up[1]) === 2) for (let round = 0; round < 4; round++) { // (the slicer's layers are along z: a part is drawn in its print orientation); a safety net: the drawing leaves none as a rule
        const found = islands(best.faces.map((f) => f.map((n) => best.vertices[n])), { layer: ov.layer, overhang: ov.angle, line: ov.line }).islands;
        if (!found.length) break;
        let hit = 0;
        const clear = (i, j, k) => { if (i < 0 || i >= nx || j < 0 || j >= ny || k < 0 || k >= nz) return 0; const e = (k * ny + j) * nx + i; if (fine.density[e] > 0 && !fine.keep[e]) { fine.density[e] = 0; return 1; } return 0; };
        for (const isl of found) {
          let own = 0;
          for (const [x, y] of isl.cells) { const i = Math.floor((x - ox) / h), j = Math.floor((y - oy) / h), k0 = Math.floor((isl.z - oz) / h); own += clear(i, j, k0) + clear(i, j, k0 + 1); } // the cell the island starts in and the one above it
          // Its own cells already empty: the island is drawn from the cells round them, so those go too
          if (!own) for (const [x, y] of isl.cells) { const i0 = Math.floor((x - ox) / h), j0 = Math.floor((y - oy) / h), k0 = Math.floor((isl.z - oz) / h); for (let k = k0; k <= k0 + 1; k++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) own += clear(i, j, k); }
          hit += own;
        }
        cleared += hit;
        if (!hit) break;
        best = draw(fine.grid, fine.density, fine.keep, iso);
      }
    }
    const anchors = [...r.problem.supports, ...r.problem.loads, ...(r.problem.keep || [])].map(bounds);
    let { vertices, faces, dropped } = anchored(best, anchors, (fine ?? { grid: spec.grid }).grid.h), reduced = null;
    // Fewer triangles, if asked: within outline.reduce mm of the surface as drawn, closed, and no more overhang or tips
    if (r.outline.reduce != null) {
      const { nx, ny, nz, h } = spec.grid, lo = spec.origin, hi = [lo[0] + nx * h, lo[1] + ny * h, lo[2] + nz * h], before = faces.length;
      ({ vertices, faces } = reduce({ vertices, faces }, { tolerance: r.outline.reduce, lo, hi, ...(ov ? { overhang: { up: ov.up, angle: ov.angle } } : {}) }));
      reduced = { before, after: faces.length, tolerance: r.outline.reduce };
    }
    return { mesh: { vertices: vertices.map((v) => v.map((c) => round(c, 3))), faces }, solid: meshVolume(vertices, faces), iso, ...(reduced ? { reduced } : {}), ...(dropped.length ? { dropped } : {}), ...(emptied.get(iso) ? { emptied: emptied.get(iso) } : {}), ...(cleared ? { cleared } : {}) };
  })();
  const result = {
    problem: ref, title: r.title, hash, dim: r.dim, material: r.material.name, ...(r.dim === 2 ? { thickness: r.problem.thickness } : {}),
    grid: spec.grid, origin: spec.origin, regions: { keep: named(spec.regions.keep), avoid: named(spec.regions.avoid) }, ...shape,
    ...made(r, spec, o.density),
    volume: o.volume, compliance: o.compliance, cases: o.cases, ...(o.unsupported ? { unsupported: o.unsupported } : {}), ...(o.mechanism ? { mechanism: o.mechanism } : {}), ...(o.stress ? { stress: o.stress } : {}), overhang: r.problem.overhang || null,
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
  return { problem: ref, dim: 2, material: r.material, critical: r.critical, cases, thin: a.thin, volume: volume(triangles), grid: { nx, ny, h }, origin: [x0, y0], density };
}

// A solid part on the problem's grid: the part itself is the space (keep and avoid regions don't apply), so the
// supports and loads land on it as they would on an optimised layout
function analyseSolid(triangles, r, cell) {
  const { problem } = r, spec = discretise({ ...problem, cell, space: { triangles }, keep: [], avoid: [], volume: 1 });
  const g = makeGrid(spec.grid), density = solidFill(triangles, spec.grid, spec.origin);
  if (!density.some((d) => d)) throw new Error('the part is smaller than one cell of the problem: use a smaller cell');
  const a = analyse({ grid: g, density, material: problem.material, fixed: spec.fixed, loads: spec.loads.map((l) => l.force), backend: threadsBackend });
  const cases = spec.loads.map((l, c) => measures(l.name, l.size, l.moment, a, c, density, spec.grid, spec.origin));
  return { problem: r.ref, dim: 3, material: r.material, critical: r.critical, cases, thin: a.thin, volume: volume(triangles), grid: spec.grid, origin: spec.origin, density };
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

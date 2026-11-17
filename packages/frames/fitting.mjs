// Printed fittings for joins: a corner bracket (with or without a brace) and flat plates over a joint (a gusset, L, T
// or cross, and a splice plate). Each is drawn from the profile's and the thread's rules, so one generator serves every
// profile: its width is the face's cell, its screws the thread a slot nut is made for, a tongue on each leg keys into
// the slot, sized from the slot's lip and the nut's own tongue with the printer's fit. Each is sized from a named load
// by finite elements on the part as drawn, to about twice the margin, and reports its grams, its stiffness and its
// margin. Each prints without supports, laid as its model says, with a plain first layer.
//
// A bracket's frame: x along the base leg (on b's face, away from a), y out of b's face (along a), z across, the corner
// line on the slot's centre at z = 0. Its print pose: laid on its side, z up from the bed (z = 0 to its width). A
// plate's frame: x along b, y along a, the joint's middle at the origin, z out of the beams' faces, its contact face at
// z = 0; it prints contact face up (its tongues on top). Units: mm, N, grams.
import jscad from '@jscad/modeling';
import { hole, holeModel, counterbore, fixingModel } from '@rulecad/fixings';
import { grid as feGrid, analyse } from '@rulecad/fea';
import x1c from '@rulecad/rules/x1c.json' with { type: 'json' };
import pla from '@rulecad/rules/pla.json' with { type: 'json' };
import petg from '@rulecad/rules/petg.json' with { type: 'json' };
import { profileModel } from './profile.mjs';
import { nutFor, NUT_KINDS } from './slotnut.mjs';

const { polygon, cuboid } = jscad.primitives, { extrudeLinear } = jscad.extrusions, { subtract, union } = jscad.booleans;
const { translate, transform } = jscad.transforms, { generalize } = jscad.modifiers, { measureVolume } = jscad.measurements;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const up = (x, step) => Math.ceil(x / step - 1e-9) * step;
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });

/**
 * The rules the fittings add, each with what it rests on.
 * @type {Record<string, { value: number, unit: string, rule: string, kind: string, source: string, checked: string }>}
 */
export const FITTING_DEFAULTS = {
  margin: { value: 2, unit: '× load', rule: 'A printed fitting is sized so its peak stress at the design load is about half the plastic\'s strength', kind: 'default', source: 'The kit\'s standard for printed parts: sized from the load with about twice the margin', checked: CHECKED },
  spread: { value: 1.5, unit: '× margin', rule: 'Sizing stops once the margin lies between the margin asked and this many times it, or the part is as thin as it may be: a thicker part only wastes plastic', kind: 'default', source: 'A working figure of @rulecad/frames: design small', checked: CHECKED },
  load: { value: 100, unit: 'N', rule: 'The design load where none is given: 100 N across beam a at the fitting\'s screw, about a 10 kg mass pulled sideways', kind: 'default', source: 'A working figure of @rulecad/frames, so every fitting is sized and compared at one named load; give the load your frame carries', checked: CHECKED },
  least: { value: 1, unit: '× major', rule: 'A leg or plate under a screw\'s head is no thinner than the thread\'s major diameter, so the head\'s clamp does not dish it', kind: 'estimate', source: 'A working margin of @rulecad/frames, to be checked by test (Frames 2.13)', checked: CHECKED },
  round: { value: 1, unit: '× thickness', rule: 'A bracket\'s inside corner is rounded to this many times its leg\'s thickness, so the bend that loads it most has no sharp corner to start a crack', kind: 'estimate', source: 'A working figure of @rulecad/frames: the finite elements read the stress there', checked: CHECKED },
  brace: { value: 2, unit: '× thickness', rule: 'A braced bracket fills its inside corner with a web this many times the leg\'s thickness along each leg, its two ends rounded half a thickness', kind: 'estimate', source: 'A working figure of @rulecad/frames', checked: CHECKED },
  reach: { value: 1, unit: 'mm', rule: 'Room left between a screw\'s head and the nearest wall of the fitting, for the head to seat and the key to turn', kind: 'default', source: 'A working figure of @rulecad/frames', checked: CHECKED },
  end: { value: 1, unit: '× hole', rule: 'Plastic from a screw\'s hole to the end of its leg or arm: the hole\'s diameter, and the head\'s radius with the reach where that is more', kind: 'estimate', source: 'A working margin of @rulecad/frames, to be checked by test (Frames 2.13)', checked: CHECKED },
  pitch: { value: 1, unit: 'mm', rule: 'Between two screws on one arm of a plate: the larger of the head and the nut along the slot, and this much more', kind: 'default', source: 'A working figure of @rulecad/frames', checked: CHECKED },
  floor: { value: 0.3, unit: 'mm', rule: 'A screw into a slot nut stops at least this far short of the slot\'s floor, as cad\'s fasten check holds it (FASTEN.floor): a fitting is made thick enough that a length sold engages its nut fully and stops there', kind: 'default', source: 'A working figure of @rulecad/cad, mirrored here so the fitting and the check agree', checked: CHECKED },
  cells: { value: 3, unit: 'cells', rule: 'The finite elements put at least this many cubes across the thinnest leg or plate', kind: 'default', source: 'A working figure of @rulecad/frames; @rulecad/fea\'s README shows a member three cells thick reads within about 20% in bending', checked: CHECKED },
};

/** The kinds of printed fitting, each with what it is and the join kinds that use it. */
export const FITTINGS = {
  bracket: { what: 'a corner bracket: an L with a leg on each beam, a screw and slot nut in each, a brace across its inside corner where asked', joins: ['bracket'] },
  gusset: { what: 'a flat plate over a joint, on the faces of both beams: L for a corner, T where a meets b along its length, cross where four arms meet', joins: ['gusset'] },
  splice: { what: 'a flat plate along two beams that meet end to end', joins: ['splice'] },
};
const SHAPES = ['L', 'T', 'cross'];

// ---------- shared ----------
const printerOf = (what, p) => {
  if (p == null) return x1c;
  if (typeof p !== 'object' || Array.isArray(p)) throw new Error(`${what}: printer is a rule set ({ name, rules }) or its values ({ fit: 0.2, layer: 0.2 }), not ${shown(p)}`);
  return p.rules ? p : { name: p.name ?? 'the printer', rules: Object.fromEntries(Object.entries(p).filter(([, v]) => isNum(v)).map(([k, v]) => [k, { value: v, kind: 'given', source: 'given as a number' }])) };
};
const pfig = (pr, k) => (isNum(pr.rules?.[k]?.value) ? pr.rules[k].value : x1c.rules[k].value);
const MATERIALS = { pla, petg };
const materialOf = (what, m) => {
  const set = typeof m === 'string' ? MATERIALS[m.toLowerCase()] : m?.rules ? m : null;
  if (!set) throw new Error(`${what}: material is pla, petg or a material's rule set with strength, modulus and density (got ${shown(m)})`);
  for (const k of ['strength', 'modulus', 'density']) if (!isNum(set.rules[k]?.value)) throw new Error(`${what}: ${set.name} has no ${k}`);
  return set;
};
const options = (what, o, keys) => {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${what}: options are { ${keys.join(', ')} } (got ${shown(o)})`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`${what}: no option "${k}": it takes ${keys.join(', ')}`);
};
const profileOf = (what, p, given) => {
  if (p?.kind === 'profile') return p;
  if (typeof p !== 'string') throw new Error(`${what}: the profile is a profile's name ('2020-misumi-hfs5') or its model (profileModel) (got ${shown(p)})`);
  try { return profileModel(p, {}, given); } catch (e) { throw new Error(`${what}: ${String(e.message).replace(/^profileModel: /, '')}`); }
};

// A face's slot, the cell's width across it, the thread its nuts are made for (the largest, where none is asked) and
// how deep a tongue may reach into its opening: the lip, less the tallest nut tongue of that thread, less the fit
function slotSide(what, p, face, thread, nut, fit, given) {
  const m = /^(top|bottom|front|back)(?:\.(\d+))?$/.exec(String(face ?? ''));
  if (!m) throw new Error(`${what}: face is top, bottom, front or back, with .2 for its second slot (got ${shown(face)})`);
  const places = p.faces[m[1]], i = m[2] ? +m[2] : 1, place = places?.[i - 1];
  if (!place) throw new Error(`${what}: ${p.name}'s ${m[1]} face has ${places?.length ?? 0} slots (got ${shown(face)})`);
  if (!place.slot) throw new Error(`${what}: ${p.name}'s ${face} face is closed: a fitting's screws go into a slot nut, so it needs a face with a slot`);
  const slot = p.slots[place.slot], cell = Math.abs(place.along[0]) > 0.5 ? p.pitch[0] : p.pitch[1];
  if (nut != null && !NUT_KINDS.includes(nut)) throw new Error(`${what}: nut is a kind of slot nut, ${NUT_KINDS.join(', ')} (got ${shown(nut)})`);
  const nutsOf = (t) => (nut ? [nut] : NUT_KINDS).map((kind) => { try { return nutFor(p, face, t, { kind, given }); } catch { return null; } }).filter(Boolean);
  let t = thread, nuts;
  if (t == null) {
    for (const c of ['M10', 'M8', 'M6', 'M5', 'M4', 'M3']) { nuts = nutsOf(c); if (nuts.length) { t = c; break; } }
    if (t == null) { try { nutFor(p, face, 'M5', { given }); } catch (e) { throw new Error(`${what}: ${String(e.message).replace(/^nutFor: /, '')}`); } }
  } else nuts = nutsOf(t);
  if (!nuts.length) { try { nutFor(p, face, t, { ...(nut ? { kind: nut } : {}), given }); } catch (e) { throw new Error(`${what}: ${String(e.message).replace(/^nutFor: /, '')}`); } }
  const tallest = Math.max(...nuts.map((n) => n.tongueHeight ?? 0)), depth = r3(slot.lip - tallest - fit);
  return { face: `${m[1]}${places.length > 1 ? `.${i}` : ''}`, slot, cell, thread: t, nuts, nut: nuts[0], tongue: { width: r3(slot.opening - 2 * fit), depth: Math.max(0, depth), under: tallest } };
}

// A polygon's concave corners (counter-clockwise loop) rounded by r: an arc tangent to both edges
function roundConcave(loop, r, only = null, steps = 10) {
  const pts = loop.filter((p, i) => { const q = loop[(i + 1) % loop.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9; }), out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], p = pts[i], b = pts[(i + 1) % n];
    const turn = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
    if (turn >= -1e-12 || r <= 0 || (only && !only(i))) { out.push(p); continue; }
    const u1 = [a[0] - p[0], a[1] - p[1]], u2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
    u1[0] /= l1; u1[1] /= l1; u2[0] /= l2; u2[1] /= l2;
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))), d = r / Math.tan(th / 2);
    const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis), c = [p[0] + (bis[0] / bl) * (r / Math.sin(th / 2)), p[1] + (bis[1] / bl) * (r / Math.sin(th / 2))];
    const t1 = [p[0] + u1[0] * d, p[1] + u1[1] * d], t2 = [p[0] + u2[0] * d, p[1] + u2[1] * d];
    const a0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]); let da = Math.atan2(t2[1] - c[1], t2[0] - c[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let s = 0; s <= steps; s++) out.push([c[0] + r * Math.cos(a0 + (da * s) / steps), c[1] + r * Math.sin(a0 + (da * s) / steps)]);
  }
  return out;
}
const area2 = (pts) => pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;
const ccw = (pts) => (area2(pts) > 0 ? pts : [...pts].reverse());
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
// A prism: a loop in (u, v) extruded h along w, the frame's axes named by a cyclic turn (so the solid stays outside out)
const TURNS = { xyz: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], yzx: [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], zxy: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0] };
// A boolean's result, its vertices snapped and coplanar faces merged and triangulated: the unions of the tongues with
// the body otherwise leave seams that a slicer reads as gaps
const clean = (g) => generalize({ snap: true, triangulate: true }, g);
// The parts joined and the cutters taken away: by JSCAD, cleaned, or by the booleans handed in ({ union, subtract }: a
// workspace's Manifold, whose result is watertight for the overlap check that follows)
const combine = (parts, cuts, ops) => (ops ? ops.subtract(ops.union(...parts), ...cuts) : clean(subtract(union(...parts), ...cuts)));
const prism = (loop, h, turn = 'xyz', at = [0, 0, 0]) => translate(at, transform([...TURNS[turn], 0, 0, 0, 1], extrudeLinear({ height: h }, polygon({ points: ccw(loop) }))));

// A tongue's section across its slot: n out of the contact face (0 to depth), a across from a0 to a1; its side toward
// -a leans 45° where it prints over the bed (lean), so it needs no support; its roots rounded by the fit, sunk into
// the body by `sink` so the union is one solid
function tongueLoop(a0, a1, depth, lean, root, sink = 0.5) {
  const pts = [[-sink, a0 - 2 * root], [0, a0 - 2 * root], [0, a0], [depth, a0 + (lean ? depth : 0)], [depth, a1], [0, a1], [0, a1 + 2 * root], [-sink, a1 + 2 * root]];
  return roundConcave(ccw(pts), root, null, 6);
}

// A tongue's stretch [lo, hi] along its slot, broken round each screw (at) by gap each side: the screw passes the slot's
// opening clear of it, and the hole stays a closed hole through the leg. Pieces shorter than `least` are left out.
function pieces(lo, hi, at, gap, least = 2) {
  const out = []; let from = lo;
  for (const c of [...at].sort((a, b) => a - b)) { if (c + gap < lo || c - gap > hi) continue; if (c - gap - from >= least) out.push([from, c - gap]); from = Math.max(from, c + gap); }
  if (hi - from >= least) out.push([from, hi]);
  return out;
}

// ---------- finite elements on the part as drawn ----------
const MEMO = new Map();
/**
 * A fitting bent by its load, by finite elements on cubes (@rulecad/fea): cells in the part where inside() holds at
 * their sample points, held where held() holds, the force shared over the nodes where loaded() holds. Read: the
 * loaded nodes' mean movement along the force, and the peak von Mises stress away from the screws (the clamp's own
 * edge is where the model, not the part, is stiff), lifted from a cell's centre to the surface.
 * @param {{ box: { lo: number[], hi: number[] }, inside: (p: number[]) => boolean, held: (p: number[]) => boolean, loaded: (p: number[]) => boolean, near: (p: number[]) => boolean,
 *   force: number[], thin: number, E: number, nu: number, key: string, budget?: number, cache?: { get: (k: string) => any, set: (k: string, v: any) => void } }} o
 * @returns {{ deflection: number, stress: number, cell: number, across: number, cells: number }}
 */
export function fittingFE(o) {
  const key = o.key, kept = o.cache?.get(key), hit = kept ?? MEMO.get(key);
  if (hit) { if (o.cache && !kept) o.cache.set(key, hit); return hit; }
  const { lo, hi } = o.box, span = hi.map((x, k) => x - lo[k]), budget = o.budget ?? 12000;
  let cell = o.thin / FITTING_DEFAULTS.cells.value;
  const count = (h) => span.reduce((t, x) => t * Math.max(1, Math.ceil(x / h)), 1);
  while (count(cell) > budget) cell *= 1.08;
  const n = span.map((x) => Math.max(1, Math.ceil(x / cell))), g = feGrid({ nx: n[0], ny: n[1], nz: n[2], h: cell });
  const density = new Float64Array(g.cells), q = [0.25, 0.75];
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    let s = 0;
    for (const a of q) for (const b of q) for (const c of q) if (o.inside([lo[0] + (i + a) * cell, lo[1] + (j + b) * cell, lo[2] + (k + c) * cell])) s++;
    density[(k * n[1] + j) * n[0] + i] = s / 8;
  }
  const onPart = new Uint8Array(g.nodes);
  for (let e = 0; e < g.cells; e++) if (density[e] >= 0.5) for (let c = 0; c < 8; c++) onPart[g.edof[e * 24 + 3 * c] / 3] = 1;
  const fixed = new Uint8Array(g.dofs), load = new Float64Array(g.dofs), loadedNodes = [];
  for (let k = 0; k <= n[2]; k++) for (let j = 0; j <= n[1]; j++) for (let i = 0; i <= n[0]; i++) {
    const id = g.node(i, j, k); if (!onPart[id]) continue;
    const p = [lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell];
    if (o.held(p)) for (let d = 0; d < 3; d++) fixed[3 * id + d] = 1;
    else if (o.loaded(p)) loadedNodes.push(id);
  }
  if (!loadedNodes.length || !fixed.some((x) => x)) throw new Error(`fittingFE: the grid of ${mm(cell)} mm cubes found ${loadedNodes.length ? 'nothing held' : 'nothing loaded'}: the fitting is too small for it`);
  for (const id of loadedNodes) for (let d = 0; d < 3; d++) load[3 * id + d] = o.force[d] / loadedNodes.length;
  // (conjugate gradients: on grids this small, a few thousand cubes, they take under a second where fea's multigrid and
  // direct solvers take fifteen or more)
  const a = analyse({ grid: g, density, material: { E: o.E, nu: o.nu }, fixed, loads: [load], method: 'cg' });
  const F = Math.hypot(...o.force), dir = o.force.map((x) => x / F), u = a.u[0];
  const deflection = loadedNodes.reduce((t, id) => t + u[3 * id] * dir[0] + u[3 * id + 1] * dir[1] + u[3 * id + 2] * dir[2], 0) / loadedNodes.length;
  const across = Math.max(2, Math.round(o.thin / cell)), lift = across / (across - 1);
  let stress = 0;
  for (let e = 0; e < g.cells; e++) {
    if (density[e] < 0.5) continue;
    const i = e % n[0], j = Math.floor(e / n[0]) % n[1], k = Math.floor(e / (n[0] * n[1])), p = [lo[0] + (i + 0.5) * cell, lo[1] + (j + 0.5) * cell, lo[2] + (k + 0.5) * cell];
    if (o.near(p)) continue;
    stress = Math.max(stress, a.stress[0][e] * lift);
  }
  const out = { deflection: r3(Math.abs(deflection)), stress: r3(stress), cell: r3(cell), across, cells: g.cells };
  MEMO.set(key, out); o.cache?.set(key, out);
  return out;
}

// Size a part's thickness from its load: from a start, thicker by the square root of the shortfall (stress goes with
// the square of a bending member's thickness) until the margin is met, thinner while it is more than spread times it
function sizeBy(start, least, step, solve, want) {
  let t = Math.max(least, up(start, step)), r = solve(t), tries = 0;
  const spread = FITTING_DEFAULTS.spread.value;
  while (tries++ < 8) {
    if (r.margin < want - 1e-9) { const next = up(t * Math.max(1.05, Math.sqrt(want / r.margin)), step); t = next; r = solve(t); continue; }
    if (r.margin > spread * want && t > least + 1e-9) { const next = Math.max(least, up(t * Math.sqrt((1.5 * want) / r.margin), step)); if (next >= t - 1e-9) break; const s = solve(next); if (s.margin < want - 1e-9) break; t = next; r = s; continue; }
    break;
  }
  return r;
}

// Where a screw's tip may stop under the face for a slot nut, as cad's fasten check holds it: past the nut's thread
// (from its tongue, lip less the tongue's height, down through its body) by the thread it needs (a hex nut's height,
// or all the nut has), and the floor's margin short of the slot's floor. A fitting t thick takes a screw of a sold
// length L where t + lo <= L <= t + hi.
function tipWindow(sd, thread) {
  const n = sd.nut, tongue = n.tongueHeight ?? 0, from = sd.slot.lip - tongue, has = tongue + n.height;
  let hex = has; try { hex = fixingModel(thread).figures.nut_height?.value ?? has; } catch {}
  return { lo: r3(from + Math.min(has, hex)), hi: r3(sd.slot.cavityDepth - FITTING_DEFAULTS.floor.value) };
}
const soldOf = (thread) => { try { return [...(fixingModel(thread).figures.lengths?.value ?? [])].sort((a, b) => a - b); } catch { return []; } };
// The least thickness from t up, in steps, at which every side takes a sold screw; with the lengths, or null
function sold(t, step, sides, thread) {
  const lengths = soldOf(thread), wins = sides.map((sd) => tipWindow(sd, thread));
  if (!lengths.length) return null;
  for (let k = 0; k <= 80; k++) {
    const tt = r3(t + k * step), got = wins.map((w) => lengths.find((L) => L >= tt + w.lo - 1e-9 && L <= tt + w.hi + 1e-9) ?? null);
    if (got.every((L) => L != null)) return { t: tt, lengths: got, windows: wins };
  }
  return null;
}

// The figures a screw's head and hole give a fitting
function screwOf(what, thread, head, pr) {
  let fx;
  try { fx = fixingModel(thread); } catch (e) { throw new Error(`${what}: thread: ${String(e.message).replace(/^\w+: /, '')}`); }
  const fig = head === 'cap' ? 'head' : `${head}_head`, dk = fx.figures[fig]?.value;
  if (!isNum(dk)) throw new Error(`${what}: head is cap or button (got ${shown(head)}): ${thread} has no ${fig}`);
  const hd = holeModel(thread, { kind: 'clearance', printer: pr }).diameter;
  return { thread: fx.thread, major: fx.major, head, dk, hd };
}

// ---------- a corner bracket ----------
/**
 * @typedef {{ kind: 'fitting', fitting: 'bracket', name: string, title: string, profile: string, other: string, faces: { b: string, a: string }, thread: string, head: string,
 *   brace: boolean, width: number, thickness: number, leg: number, screwAt: number, round: number, braceSize: number, hole: number, tongues: { b: object, a: object },
 *   screws: { leg: 'b' | 'a', thread: string, head: string, grip: number, at: number[], axis: number[], nut: string }[], load: { force: number, what: string, at: number[], direction: number[] },
 *   stiffness: { linear: number, bending: number, kind: string, rule: string }, stress: number, margin: number, deflection: number, fe: object,
 *   volume: number, grams: number, material: string, printer: string, section: number[][], findings: object[], rests: object[] }} Bracket
 */
/**
 * A printed corner bracket for a profile, from its rules: the width of the face's cell, the thread its slot nuts are
 * made for, a tongue on each leg that keys into the slot, and legs sized from a named load by finite elements to about
 * twice the margin. Laid on its side it prints without supports, its first layer the whole L.
 * @param {string | object} profile b's profile (the beam whose face the base leg lies on), by name or model
 * @param {{ other?: string | object, face?: string, otherFace?: string, thread?: string, head?: 'cap' | 'button', nut?: string, brace?: boolean, load?: number, width?: number,
 *   printer?: object, material?: string | object, given?: object, cache?: object }} [o]
 *   other: a's profile, for the upright leg (default the same); face, otherFace: the faces the legs lie on (default top);
 *   thread: the screws' (default the largest a slot nut is made for in both slots); head: cap (default) or button; nut: a
 *   kind of slot nut, for the tongue's depth (default the tallest tongue of any kind); brace: fill the inside corner with
 *   a web; load: the design load in N, across beam a at the upright's screw (default 100); width: across the bracket
 *   (default the face's cell); cache: { get, set } for the finite elements' results
 * @returns {Bracket}
 */
export function bracketModel(profile, o = {}) {
  const what = 'bracketModel';
  options(what, o, ['other', 'face', 'otherFace', 'thread', 'head', 'nut', 'brace', 'load', 'width', 'printer', 'material', 'given', 'cache']);
  const given = o.given ?? {}, pb = profileOf(what, profile, given), pa = o.other == null ? pb : profileOf(what, o.other, given);
  const pr = printerOf(what, o.printer), mat = materialOf(what, o.material ?? 'pla'), fit = pfig(pr, 'fit'), layer = pfig(pr, 'layer');
  if (o.brace != null && typeof o.brace !== 'boolean') throw new Error(`${what}: brace is true or false (got ${shown(o.brace)})`);
  if (o.load != null && !(isNum(o.load) && o.load > 0)) throw new Error(`${what}: load is the design load in N, above 0: the force across beam a at the bracket's screw (got ${shown(o.load)})`);
  if (o.width != null && !(isNum(o.width) && o.width > 0)) throw new Error(`${what}: width is across the bracket in mm, above 0 (got ${shown(o.width)})`);
  if (o.thread != null && typeof o.thread !== 'string') throw new Error(`${what}: thread is a thread as written, such as M5 (got ${shown(o.thread)})`);
  const head = o.head ?? 'cap';
  if (!['cap', 'button'].includes(head)) throw new Error(`${what}: head is cap or button (got ${shown(o.head)})`);
  let sb = slotSide(what, pb, o.face ?? 'top', o.thread, o.nut, fit, given);
  const sa = slotSide(what, pa, o.otherFace ?? 'top', o.thread ?? sb.thread, o.nut, fit, given);
  if (sa.thread !== sb.thread) sb = slotSide(what, pb, o.face ?? 'top', sa.thread, o.nut, fit, given);
  const sc = screwOf(what, sb.thread, head, pr), brace = !!o.brace, F = o.load ?? FITTING_DEFAULTS.load.value, E = mat.rules.modulus.value, nu = mat.rules.poisson?.value ?? 0.36, S = mat.rules.strength.value;
  const w = r3(o.width ?? Math.min(sb.cell, sa.cell)), c = w / 2, want = FITTING_DEFAULTS.margin.value, least = r3(Math.max(FITTING_DEFAULTS.least.value * sc.major, 2 * layer));
  if (w < sc.dk + 2 * FITTING_DEFAULTS.reach.value) throw new Error(`${what}: a bracket ${mm(w)} mm wide leaves no room round ${sc.thread}'s ${mm(sc.dk)} mm head: ${mm(sc.dk + 2 * FITTING_DEFAULTS.reach.value)} mm or more`);
  const reach = FITTING_DEFAULTS.reach.value, endBy = Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + reach);
  // the screws stand where an unbraced bracket's would, clear of its round; a brace fills the corner past them, with a
  // pocket round each head down to the leg for the head and the key
  const geom = (t) => {
    const rf = FITTING_DEFAULTS.round.value * t, h = brace ? FITTING_DEFAULTS.brace.value * t : 0, rb = brace ? t / 2 : rf;
    const s = r3(t + rf + sc.dk / 2 + reach), L = r3(up(Math.max(s + endBy, t + h + rb + 2 * reach), 0.5));
    const corner = brace ? [[t + h, t], [t, t + h]] : [[t, t]];
    const section = roundConcave([[0, 0], [L, 0], [L, t], ...corner, [t, L], [0, L]], rb, null, 12).map(([x, y]) => [r3(x), r3(y)]);
    return { t, rf: r3(rb), h: r3(h), s, L, section, pocket: brace ? r3(sc.dk / 2 + reach) : 0 };
  };
  const dB = sb.tongue.depth, dA = sa.tongue.depth;
  const solve = (t) => {
    const G = geom(t), { s, L, section } = G, r = sc.hd / 2, grip = sc.dk / 2;
    const tw = (side) => side.tongue.width;
    const inside = ([x, y, z]) => {
      if (z < 0 || z > w) return false;
      if (Math.hypot(x - s, z - c) < r && y < t + 1) return false; // the base leg's hole
      if (Math.hypot(y - s, z - c) < r && x < t + 1) return false; // the upright's
      if (G.pocket && ((Math.hypot(x - s, z - c) < G.pocket && y > t) || (Math.hypot(y - s, z - c) < G.pocket && x > t))) return false; // the heads' pockets in the brace
      if (inPoly(section, x, y)) return true;
      if (y < 0 && y > -dB && x >= 0 && x <= L && z >= c - tw(sb) / 2 - y && z <= c + tw(sb) / 2) return true;
      return x < 0 && x > -dA && y >= 0 && y <= L && z >= c - tw(sa) / 2 - x && z <= c + tw(sa) / 2;
    };
    const held = ([x, y, z]) => Math.hypot(x - s, z - c) <= grip && y <= t + 1e-6;
    const loaded = ([x, y, z]) => Math.hypot(y - s, z - c) <= grip && x <= t + 1e-6;
    const near = ([x, y, z]) => Math.hypot(x - s, z - c) <= grip + 1.5 * (t / 3) || Math.hypot(y - s, z - c) <= grip + 1.5 * (t / 3);
    const key = JSON.stringify(['bracket', 1, section, G.pocket, w, c, r, grip, dB, dA, tw(sb), tw(sa), F, E, nu]);
    const fe = fittingFE({ key, box: { lo: [-dA, -dB, 0], hi: [L, L, w] }, inside, held, loaded, near, force: [-F, 0, 0], thin: t, E, nu, cache: o.cache });
    return { G, fe, margin: S / Math.max(fe.stress, 1e-9) };
  };
  // the start: the base leg bent at its root by F at the upright's screw, s from the corner, a stress raiser of 1.5
  const start = Math.sqrt((want * 6 * F * 1.5 * (2.5 * least + sc.dk / 2)) / (w * S));
  let { G, fe, margin } = sizeBy(start, least, layer, solve, want);
  // thick enough that a length sold engages each slot nut fully and stops short of the slot's floor
  const fits = sold(G.t, layer, [sb, sa], sb.thread), sized = G.t;
  if (fits && fits.t > G.t + 1e-9) ({ G, fe, margin } = solve(fits.t));
  const { t, s, L } = G;
  const linear = r3(F / Math.max(fe.deflection, 1e-9)), bending = Math.round((F * s * s) / Math.max(fe.deflection, 1e-9));
  const out = [], name = `bracket-${pb.name.replace(/^profile-/, '')}${pa !== pb ? `-${pa.name.replace(/^profile-/, '')}` : ''}-${sb.thread.toLowerCase()}${brace ? '-braced' : ''}`;
  const model = { kind: 'fitting', fitting: 'bracket', name, title: `printed corner bracket${brace ? ', braced,' : ''} for ${pb.name.replace(/^profile-/, '')}${pa !== pb ? ` to ${pa.name.replace(/^profile-/, '')}` : ''}, ${sb.thread}`,
    profile: pb.name, other: pa.name, faces: { b: sb.face, a: sa.face }, thread: sb.thread, head, brace, width: w, thickness: r3(t), leg: L, screwAt: s, round: G.rf, braceSize: G.h, pocket: G.pocket, hole: sc.hd,
    tongues: { b: { slot: sb.slot.name, ...sb.tongue, nut: sb.nut.name }, a: { slot: sa.slot.name, ...sa.tongue, nut: sa.nut.name } },
    screws: [{ leg: 'b', thread: sb.thread, head, grip: r3(t), at: [s, t, 0], axis: [0, -1, 0], nut: sb.nut.name, nutKind: sb.nut.nutKind, length: fits?.lengths[0] ?? null }, { leg: 'a', thread: sb.thread, head, grip: r3(t), at: [t, s, 0], axis: [-1, 0, 0], nut: sa.nut.name, nutKind: sa.nut.nutKind, length: fits?.lengths[1] ?? null }],
    sized: r3(sized),
    load: { force: F, what: `${F} N across beam a at the upright's screw, ${mm(s)} mm from the corner, opening or closing it`, at: [0, s, 0], direction: [-1, 0, 0] },
    stiffness: { linear, bending, kind: 'derived', rule: `By finite elements on the bracket as drawn, its base leg held under its screw's head and ${F} N on the upright's: ${linear} N/mm at the screw, and ${bending} N·mm/rad about the corner (the force times the screw's distance squared, over its movement). The slot nuts, the lips and the screws\' own give are not in it, so the joint is softer: an estimate until the joint rig (issue 264) measures it` },
    stress: fe.stress, margin: r3(margin), deflection: fe.deflection, fe, volume: 0, grams: 0, material: mat.name, printer: pr.name, section: G.section, findings: out,
    rests: [{ name: `${mat.name}.strength`, value: S }, { name: `${mat.name}.modulus`, value: E }, { name: `${pr.name}.fit`, value: fit }, ...['margin', 'least', 'round', 'brace', 'reach', 'end', 'cells'].map((k) => ({ name: `FITTING_DEFAULTS.${k}`, value: FITTING_DEFAULTS[k].value, kind: FITTING_DEFAULTS[k].kind }))] };
  const solid = bracketSolid(model, pr);
  model.volume = r3(measureVolume(solid)); model.grams = r3((model.volume * mat.rules.density.value) / 1000);
  addFindings(model, { least, S, F, sc, sides: { b: sb, a: sa }, pr, pose: 'laid on its side, the whole L on the bed', fits });
  return model;
}

function addFindings(m, { least, S, F, sc, sides, pr, pose, fits }) {
  const out = m.findings, want = FITTING_DEFAULTS.margin.value, thinnest = m.sized <= least + 1e-9, thicker = m.thickness > m.sized + 1e-9;
  const why = `${thinnest ? `as thin as ${sc.thread} lets it be, ${mm(least)} mm` : `sized from the load, ${mm(m.sized)} mm`}${thicker ? `, then thickened so a length sold fits: ${[...new Set(fits.lengths)].map((L) => `${sc.thread}x${L}`).join(' and ')} engages its slot nut fully and stops short of the slot's floor` : ''}`;
  if (!fits) out.push(finding('warn', `no ${sc.thread} ${sc.head} screw sold engages its slot nut fully and stops short of the slot's floor through a fitting up to 16 mm thicker: the screw's length is the fasten check's to choose`, 'fitting.screw', { values: { thickness: m.thickness } }));
  else out.push(finding('pass', `${[...new Set(fits.lengths)].map((L) => `${sc.thread}x${L} ${sc.head}`).join(' and ')}: through ${mm(m.thickness)} mm of fitting, ${[...new Set(fits.windows.map((w, i) => `its tip ${mm(fits.lengths[i] - m.thickness)} mm under the face, between ${mm(w.lo)} (its nut's thread engaged) and ${mm(w.hi)} (the slot's floor less ${FITTING_DEFAULTS.floor.value} mm)`))].join('; ')}`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } }));
  out.push(finding('info', `${m.title}: ${mm(m.thickness)} mm thick (${why}), ${m.fitting === 'bracket' ? `legs ${mm(m.leg)} mm, the screws ${mm(m.screwAt)} mm from the corner` : `arms ${mm(m.arm)} mm from the joint, ${m.screws.length} screws`}, ${mm(m.width)} mm wide`, 'fitting.size', { values: { thickness: m.thickness, width: m.width, ...(m.leg ? { leg: m.leg } : { arm: m.arm }) } }));
  for (const [k, sd] of Object.entries(sides)) {
    if (!sd) continue;
    out.push(finding(sd.tongue.depth > 0 ? 'pass' : 'info', sd.tongue.depth > 0 ? `the ${k === 'b' ? (m.fitting === 'bracket' ? 'base leg' : 'arms on b') : (m.fitting === 'bracket' ? 'upright' : 'arms on a')}'s tongue keys into ${sd.slot.name}: ${mm(sd.tongue.width)} mm wide (the ${mm(sd.slot.opening)} mm opening less ${pr.name}'s fit each side), ${mm(sd.tongue.depth)} mm deep (the ${mm(sd.slot.lip)} mm lip less the ${mm(sd.tongue.under)} mm a ${sd.thread} slot nut's tongue rises into it, less the fit)` : `${sd.slot.name}'s ${mm(sd.slot.lip)} mm lip leaves no room for a tongue over a ${sd.thread} slot nut's ${mm(sd.tongue.under)} mm tongue: the ${k} side lies flat on the face`, 'fitting.tongue', { values: { ...sd.tongue }, refs: { slot: sd.slot.name, nut: sd.nut.name } }));
  }
  const fe = m.fe, ok = m.margin >= want - 1e-9;
  out.push(finding(ok ? 'pass' : 'fail', `under ${m.load.what}, the stress peaks at ${mm(fe.stress)} MPa away from the screws, ${mm(m.margin)} times under ${m.material.toUpperCase()}'s ${S} MPa (${ok ? `within the ${want}× asked` : `short of the ${want}× asked`}); it moves ${mm(fe.deflection)} mm there (finite elements on ${mm(fe.cell)} mm cubes, ${fe.across} across its thickness: an estimate, as cells this coarse read a part 10 to 20% stiffer than it is)`, 'fitting.margin', { values: { load: F, stress: fe.stress, strength: S, margin: m.margin, deflection: fe.deflection, cell: fe.cell } }));
  out.push(finding('info', `its own stiffness by finite elements: ${m.stiffness.linear} N/mm at the loaded screw, ${m.stiffness.bending} N·mm/rad about the joint. The slot nuts, the lips and the screws are not in it, so the joint is softer: an estimate until the joint rig (issue 264) measures it`, 'fitting.stiffness', { values: { linear: m.stiffness.linear, bending: m.stiffness.bending } }));
  // each screw pulls its nut with about the load: the nut's rating, and the head bearing on the plastic
  // (a plate's screws are in shear across the slot: its lips and the clamp hold that, which the rig measures)
  const each = F;
  for (const [k, sd] of Object.entries(m.fitting === 'bracket' ? sides : {})) {
    if (!sd) continue;
    const hold = sd.nut.hold?.value, bearing = r3(each / ((Math.PI / 4) * (sc.dk ** 2 - sc.hd ** 2))), crush = r3(S / bearing);
    if (isNum(hold)) out.push(finding(hold >= want * each ? 'pass' : 'fail', `${sd.nut.name} holds ${hold} N (${sd.nut.hold.kind}), ${mm(hold / each)} times the ${mm(each)} N its screw pulls`, 'fitting.nut', { values: { hold, pull: each }, refs: { nut: sd.nut.name, side: k } }));
    out.push(finding(crush >= want ? 'pass' : 'fail', `a ${sc.thread} ${sc.head} head bears on the plastic at ${mm(bearing)} MPa under ${mm(each)} N, ${mm(crush)} times under its ${S} MPa`, 'fitting.bearing', { values: { bearing, margin: crush } }));
  }
  out.push(finding('info', `it is drawn to print ${pose}: a plain first layer, its screw holes ${m.fitting === 'bracket' ? 'lying on their side as teardrops' : 'upright'}, ${m.fitting === 'bracket' ? 'each tongue\'s lower side leaning 45°' : 'its tongues on top'}, no supports (printcheck's check() reads the solid)`, 'fitting.printable', { values: { pose } }));
  out.push(finding('info', `it weighs ${mm(m.grams)} g of ${m.material} (${mm(m.volume)} mm³)`, 'fitting.mass', { values: { grams: m.grams, volume: m.volume } }));
}

function bracketSolid(m, pr, tongues = true, ops = null) {
  const w = m.width, c = w / 2, t = m.thickness, L = m.leg, s = m.screwAt, root = pfig(pr, 'fit');
  const parts = [extrudeLinear({ height: w }, polygon({ points: ccw(m.section) }))];
  const tb = m.tongues.b, ta = m.tongues.a;
  // the base leg's tongue under y = 0, along x: its loop in (y, z) as (-n, a), extruded along x (turn yzx)
  const gap = m.hole / 2 + 1;
  if (tongues && tb.depth > 0) for (const [p, q] of pieces(root, L - root, [s], gap)) parts.push(prism(tongueLoop(c - tb.width / 2, c + tb.width / 2, tb.depth, true, root).map(([n, a]) => [-n, a]), q - p, 'yzx', [p, 0, 0]));
  // the upright's under x = 0, along y: its loop in (z, x) as (a, -n), extruded along y (turn zxy)
  if (tongues && ta.depth > 0) for (const [p, q] of pieces(root, L - root, [s], gap)) parts.push(prism(tongueLoop(c - ta.width / 2, c + ta.width / 2, ta.depth, true, root).map(([n, a]) => [a, -n]), q - p, 'zxy', [0, p, 0]));
  const fx = { printer: pr }, h = m.braceSize, deep = (d) => t + d + 2;
  // through each leg a teardrop hole; braced, a teardrop pocket for the head and the key through the brace, and the hole on
  const holes = m.brace
    ? [counterbore(m.thread, { head: m.head, depth: h + 1, diameter: 2 * m.pocket, length: h + 1 + deep(tb.depth), into: '-y', at: [s, t + h + 1, c], ...fx }),
      counterbore(m.thread, { head: m.head, depth: h + 1, diameter: 2 * m.pocket, length: h + 1 + deep(ta.depth), into: '-x', at: [t + h + 1, s, c], ...fx })]
    : [hole(m.thread, { kind: 'clearance', into: '-y', depth: deep(tb.depth), at: [s, t + 1, c], ...fx }), hole(m.thread, { kind: 'clearance', into: '-x', depth: deep(ta.depth), at: [t + 1, s, c], ...fx })];
  return combine(parts, holes, ops);
}

/**
 * A printed corner bracket's solid, from bracketModel's model or its arguments: laid on its side to print (pose
 * 'print', the default), or in its fitted frame (pose 'fit': x along b's face away from a, y up a, z across, the corner
 * line on the slots' centre). tongues: false leaves them off (the body alone, which may not overlap a beam's envelope);
 * ops: booleans to join and cut with ({ union, subtract }, as @rulecad/shapes' ops gives), JSCAD's where left out.
 * @param {object | string} m a Bracket, or bracketModel's profile @param {object} [o] bracketModel's options, pose, tongues and ops
 * @returns {object} a JSCAD geom3, with .model
 */
export function bracket(m, o = {}) {
  const { pose = 'print', tongues = true, ops = null, ...rest } = o ?? {};
  if (!['print', 'fit'].includes(pose)) throw new Error(`bracket: pose is print or fit (got ${shown(pose)})`);
  const model = m?.fitting === 'bracket' ? m : bracketModel(m, rest), solid = bracketSolid(model, printerOf('bracket', rest.printer), tongues !== false, ops);
  return Object.assign(pose === 'fit' ? translate([0, 0, -model.width / 2], solid) : solid, { model });
}

// ---------- flat plates: gussets and splice plates ----------
/**
 * @typedef {{ kind: 'fitting', fitting: 'gusset' | 'splice', shape: string, name: string, title: string, profile: string, face: string, thread: string, head: string,
 *   width: number, thickness: number, arm: number, round: number, hole: number, outline: number[][], tongues: object[], screws: { leg: 'b' | 'a', thread: string, head: string, grip: number, at: number[], axis: number[], nut: string }[],
 *   load: object, stiffness: object, stress: number, margin: number, deflection: number, fe: object, volume: number, grams: number, material: string, printer: string, findings: object[], rests: object[] }} Plate
 */
/**
 * A printed flat plate over a joint: a gusset (shape L, T or cross) or a splice plate (shape splice), on the faces of
 * beams of one profile that lie in one plane. Each arm runs along a beam's slot with `count` screws into slot nuts and
 * a tongue that keys into the slot; the inside corners are rounded half an arm's width. Sized from the named load (in
 * the plate's plane, across beam a at its farthest screw, b's screws held) by finite elements to about twice the
 * margin. It prints contact face up, its tongues on top.
 * @param {string | object} profile @param {{ shape?: 'L' | 'T' | 'cross' | 'splice', face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, count?: number, load?: number, width?: number,
 *   printer?: object, material?: string | object, given?: object, cache?: object }} [o] count: screws on each arm (default 2)
 * @returns {Plate}
 */
export function plateModel(profile, o = {}) {
  const what = 'plateModel';
  options(what, o, ['shape', 'face', 'thread', 'head', 'nut', 'count', 'load', 'width', 'printer', 'material', 'given', 'cache']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), shape = o.shape ?? 'L';
  if (![...SHAPES, 'splice'].includes(shape)) throw new Error(`${what}: shape is L, T, cross or splice (got ${shown(o.shape)})`);
  const count = o.count ?? 2;
  if (!(Number.isInteger(count) && count >= 1 && count <= 6)) throw new Error(`${what}: count is the screws on each arm, a whole number from 1 to 6 (got ${shown(o.count)})`);
  if (o.load != null && !(isNum(o.load) && o.load > 0)) throw new Error(`${what}: load is the design load in N, above 0 (got ${shown(o.load)})`);
  if (o.width != null && !(isNum(o.width) && o.width > 0)) throw new Error(`${what}: width is an arm's, in mm, above 0 (got ${shown(o.width)})`);
  if (o.thread != null && typeof o.thread !== 'string') throw new Error(`${what}: thread is a thread as written, such as M5 (got ${shown(o.thread)})`);
  const head = o.head ?? 'cap';
  if (!['cap', 'button'].includes(head)) throw new Error(`${what}: head is cap or button (got ${shown(o.head)})`);
  const pr = printerOf(what, o.printer), mat = materialOf(what, o.material ?? 'pla'), fit = pfig(pr, 'fit'), layer = pfig(pr, 'layer');
  const sd = slotSide(what, p, o.face ?? 'front', o.thread, o.nut, fit, given), sc = screwOf(what, sd.thread, head, pr);
  const F = o.load ?? FITTING_DEFAULTS.load.value, E = mat.rules.modulus.value, nu = mat.rules.poisson?.value ?? 0.36, S = mat.rules.strength.value, want = FITTING_DEFAULTS.margin.value;
  const w = r3(o.width ?? sd.cell), half = w / 2, R = r3(half), reach = FITTING_DEFAULTS.reach.value;
  if (w < sc.dk + 2 * reach) throw new Error(`${what}: an arm ${mm(w)} mm wide leaves no room round ${sc.thread}'s ${mm(sc.dk)} mm head: ${mm(sc.dk + 2 * reach)} mm or more`);
  const nutLen = Math.max(...sd.nuts.map((n) => n.length)), pitch = r3(up(Math.max(sc.dk, nutLen) + FITTING_DEFAULTS.pitch.value, 0.5));
  // the first screw on an arm from the joint's edge: clear of the inside round's start (about 0.3 of its radius along the
  // arm's middle) and then of the head and the nut
  const first = r3(up((shape === 'splice' ? 0 : R * 0.3) + Math.max(sc.dk / 2 + reach, nutLen / 2 + fit), 0.5)), endBy = Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + reach);
  const arm = r3(up(first + (count - 1) * pitch + endBy, 0.5)); // from the joint's edge
  // the arms, each a direction from the joint's middle: b's along x, a's along y; a splice's both along x, from x = 0
  const dirs = shape === 'splice' ? [[1, 0, 'b'], [-1, 0, 'a']] : [[1, 0, 'b'], ...(shape !== 'L' ? [[-1, 0, 'b']] : []), [0, 1, 'a'], ...(shape === 'cross' ? [[0, -1, 'a']] : [])];
  const reachOf = shape === 'splice' ? arm : half + arm;
  const outline = (() => {
    if (shape === 'splice') return [[-arm, -half], [arm, -half], [arm, half], [-arm, half]];
    const E2 = (d) => (dirs.some(([x, y]) => x === d[0] && y === d[1]) ? reachOf : half), xp = E2([1, 0]), xm = E2([-1, 0]), yp = E2([0, 1]), ym = E2([0, -1]);
    const pts = [[-xm, -half], ...(ym > half ? [[-half, -half], [-half, -ym], [half, -ym], [half, -half]] : []), [xp, -half], [xp, half], ...(yp > half ? [[half, half], [half, yp], [-half, yp], [-half, half]] : []), [-xm, half]];
    return roundConcave(pts, R, null, 12).map(([x, y]) => [r3(x), r3(y)]);
  })();
  const screws = [];
  for (const [dx, dy, leg] of dirs) for (let k = 0; k < count; k++) { const d = (shape === 'splice' ? 0 : half) + first + k * pitch; screws.push({ leg, at: [r3(dx * d), r3(dy * d)] }); }
  const solve = (t) => {
    const r = sc.hd / 2, grip = sc.dk / 2, far = Math.max(...screws.filter((x) => x.leg === 'a').map((x) => Math.hypot(...x.at))), loadAt = screws.filter((x) => x.leg === 'a' && Math.abs(Math.hypot(...x.at) - far) < 1e-6);
    const along = shape === 'splice' ? [0, 1] : [1, 0]; // across beam a, in the plane
    const inside = ([x, y, z]) => z >= 0 && z <= t && inPoly(outline, x, y) && !screws.some((q) => Math.hypot(x - q.at[0], y - q.at[1]) < r);
    const held = ([x, y]) => screws.some((q) => q.leg === 'b' && Math.hypot(x - q.at[0], y - q.at[1]) <= grip);
    const loaded = ([x, y]) => loadAt.some((q) => Math.hypot(x - q.at[0], y - q.at[1]) <= grip);
    const near = ([x, y]) => screws.some((q) => Math.hypot(x - q.at[0], y - q.at[1]) <= grip + t / 2);
    const xs = outline.map((q) => q[0]), ys = outline.map((q) => q[1]);
    const key = JSON.stringify(['plate', 1, outline, screws, t, r, grip, F, E, nu]);
    const fe = fittingFE({ key, box: { lo: [Math.min(...xs), Math.min(...ys), 0], hi: [Math.max(...xs), Math.max(...ys), t] }, inside, held, loaded, near, force: [F * along[0], F * along[1], 0], thin: t, E, nu, cache: o.cache });
    return { t, fe, margin: S / Math.max(fe.stress, 1e-9), far };
  };
  const least = r3(Math.max(FITTING_DEFAULTS.least.value * sc.major, 2 * layer));
  let r = sizeBy(least, least, layer, solve, want);
  const fits = sold(r.t, layer, [sd], sd.thread), sizedT = r.t;
  if (fits && fits.t > r.t + 1e-9) r = solve(fits.t);
  const { t, fe, margin, far } = r;
  const linear = r3(F / Math.max(fe.deflection, 1e-9)), bending = Math.round((F * far * far) / Math.max(fe.deflection, 1e-9));
  const fitting = shape === 'splice' ? 'splice' : 'gusset', short = p.name.replace(/^profile-/, '');
  const model = { kind: 'fitting', fitting, shape, name: `${fitting === 'splice' ? 'splice' : `gusset-${shape.toLowerCase()}`}-${short}-${sd.thread.toLowerCase()}${count !== 2 ? `-x${count}` : ''}`,
    title: `printed ${fitting === 'splice' ? 'splice plate' : `${shape} gusset`} for ${short}, ${sd.thread}, ${count} screw${count > 1 ? 's' : ''} an arm`,
    profile: p.name, face: sd.face, thread: sd.thread, head, width: w, thickness: r3(t), arm, round: R, hole: sc.hd, outline, count, pitch,
    tongues: dirs.map(([dx, dy, leg]) => ({ leg, along: [dx, dy], slot: sd.slot.name, ...sd.tongue, nut: sd.nut.name })),
    screws: screws.map((q) => ({ leg: q.leg, thread: sd.thread, head, grip: r3(t), at: [q.at[0], q.at[1], 0], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null })), sized: r3(sizedT),
    load: { force: F, what: `${F} N in the plate's plane across beam a at its farthest screw, ${mm(far)} mm from the joint, b's screws held`, at: [...(screws.find((q) => q.leg === 'a' && Math.abs(Math.hypot(...q.at) - far) < 1e-6)?.at ?? [0, 0]), 0], direction: shape === 'splice' ? [0, 1, 0] : [1, 0, 0] },
    stiffness: { linear, bending, kind: 'derived', rule: `By finite elements on the plate as drawn, b's screws held under their heads and ${F} N in its plane on a's farthest: ${linear} N/mm there, and ${bending} N·mm/rad about the joint (the force times that screw's distance squared, over its movement). The slot nuts, the lips and the screws' own give are not in it, so the joint is softer: an estimate until the joint rig (issue 264) measures it` },
    stress: fe.stress, margin: r3(margin), deflection: fe.deflection, fe, volume: 0, grams: 0, material: mat.name, printer: pr.name, findings: [],
    rests: [{ name: `${mat.name}.strength`, value: S }, { name: `${mat.name}.modulus`, value: E }, { name: `${pr.name}.fit`, value: fit }, ...['margin', 'least', 'reach', 'end', 'pitch', 'cells'].map((k) => ({ name: `FITTING_DEFAULTS.${k}`, value: FITTING_DEFAULTS[k].value, kind: FITTING_DEFAULTS[k].kind }))] };
  const solid = plateSolid(model, pr);
  model.volume = r3(measureVolume(solid)); model.grams = r3((model.volume * mat.rules.density.value) / 1000);
  addFindings(model, { least, S, F, sc, sides: { b: sd }, pr, pose: 'contact face up, its head side on the bed', fits });
  return model;
}

function plateSolid(m, pr, tongues = true, ops = null) {
  // (drawn turned over about x: its y runs the other way, so a's arm lies along -y here and along +y once fitted)
  const t = m.thickness, half = m.width / 2, root = pfig(pr, 'fit'), parts = [extrudeLinear({ height: t }, polygon({ points: ccw(m.outline.map(([x, y]) => [x, -y])) }))];
  // its tongues stand on its top (the contact face, in print), along each arm's slot line; in its print frame the
  // plate is turned over, so the tongue of an arm reaches to the arm's end from the joint's far edge (or from 0 for a splice)
  for (const tg of m.tongues) {
    if (!(tg.depth > 0) || !tongues) continue;
    const from = m.fitting === 'splice' ? 0 : -half, to = (m.fitting === 'splice' ? 0 : half) + m.arm - root, loop = tongueLoop(-tg.width / 2, tg.width / 2, tg.depth, false, root);
    const [dx, ny] = tg.along, dy = -ny, start = tg.leg === 'a' && m.fitting !== 'splice' ? half + root : from;
    // along x: the loop in (y, z) = (a, t + n), extruded along x (yzx); along y: in (z, x) = (t + n, a), extruded along y (zxy)
    const d = dx !== 0 ? dx : dy, [lo, hi] = d > 0 ? [start, to] : [-to, -start];
    const at = m.screws.filter((q) => (dx !== 0 ? Math.abs(q.at[1]) < 1e-6 : Math.abs(q.at[0]) < 1e-6)).map((q) => (dx !== 0 ? q.at[0] : -q.at[1]));
    for (const [p, q] of pieces(lo, hi, at, m.hole / 2 + 1)) parts.push(dx !== 0 ? prism(loop.map(([n, a]) => [a, t + n]), q - p, 'yzx', [p, 0, 0]) : prism(loop.map(([n, a]) => [t + n, a]), q - p, 'zxy', [0, p, 0]));
  }
  const fx = { printer: pr }, holes = m.screws.map((q) => hole(m.thread, { kind: 'clearance', into: '+z', depth: t + 4, at: [q.at[0], -q.at[1], -1], ...fx, depth: t + 2 + Math.max(0, ...m.tongues.map((g) => g.depth)) }));
  return combine(parts, holes, ops);
}

/**
 * A printed plate's solid, from plateModel's model or its arguments: contact face up to print (pose 'print', the
 * default; its frame's z then runs down into the beams, so the plate is turned over), or in its fitted frame (pose
 * 'fit': x along b, y along a, the contact face at z = 0 and the plate on +z, away from the beams). tongues: false leaves
 * them off; ops: booleans to join and cut with, as bracket's.
 * @param {object | string} m a Plate, or plateModel's profile @param {object} [o] plateModel's options, pose, tongues and ops
 * @returns {object} a JSCAD geom3, with .model
 */
export function plate(m, o = {}) {
  const { pose = 'print', tongues = true, ops = null, ...rest } = o ?? {};
  if (!['print', 'fit'].includes(pose)) throw new Error(`plate: pose is print or fit (got ${shown(pose)})`);
  const model = m?.fitting === 'gusset' || m?.fitting === 'splice' ? m : plateModel(m, rest), solid = plateSolid(model, printerOf('plate', rest.printer), tongues !== false, ops);
  // fitted: the contact face (z = t in print) at z = 0 and the plate above it: turned over about x
  return Object.assign(pose === 'fit' ? transform([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, model.thickness, 1], solid) : solid, { model });
}

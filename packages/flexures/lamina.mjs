// Lamina mechanisms: a whole mechanism drawn in one plane and printed flat, the way working printed blasters are
// made (Howell's lamina emergent mechanisms; the BYU one-piece blaster, PLOS ONE 2026). Everything is a 2D shape
// extruded the same height off the bed, so every flexure bends within its layers, every moving part stands on the
// bed, and every clearance is a slot in the drawing. The mechanism is a tree of rigid bodies joined to the ground
// and to each other by flexures; states say how far each flexure is moved, and the checks read them:
//   free       at rest, everything clears everything it isn't joined to by the printer's gap (else it fuses), and
//              each flexure touches its two bodies and nothing else
//   stops      something hard stops each flexure before its strain limit (displacement-driven design: the travel,
//              not the force, sets the stress)
//   strain     each flexure's strain at the most any state moves it, and how it prints
//   states     nothing that isn't joined runs into anything in any state, or on the way between them
//   holds      a latch holds: in a state, moving a flexure back towards rest runs its body into the catch
//   energy     what each state stores, and the forces
// Flexures are drawn bent between states by their own shape: each point moves by the part of its joint's motion
// that its distance along the flexure (from root to tip, inside the shape) gives it. Units: mm, N, degrees.
// The plane's geometry and the print in 3D are plane.mjs; a flexure drawn bent and its finite-element peak are
// bent.mjs; a flooded frame is flooded.mjs; the slow stages are kept between builds by cache.mjs.

import * as gens from './flexures.mjs';
import { curveClearance } from './curves.mjs';
import { ports, models } from './compose.mjs';
import { simulate, systemOf, bend, centrelines } from './physics.mjs';
import { stage } from './cache.mjs';
import { shapeOf, fixedLoads, equilibrium } from './beams.mjs';
import { outOfPlane } from './outofplane.mjs';
import { grid as feaGrid, analyse as feaAnalyse } from '@rulecad/fea';
import { AREA, TOUCH, STOP_STEPS, NONE, MARCH, FINE, REFINE, FRAMES, GAMMA, LEAFLIKE, FE_CELLS, FE_MOST, SHARP_TURN, rad, deg, I, mul, apply, shift, turn, ready, empty, union, intersect, subtract, grow, shrink, area, pieces, apart, box, moved, flat, all, solidOf, solidWith, within, gapBetween, collide } from './plane.mjs';
import { shares, split, fromOutlines, smooth, coverage, fePeak } from './bent.mjs';
import { flooded } from './flooded.mjs';

// ---------- the mechanism ----------
// LAMINA_TIMES=1 prints each stage's time to stderr (where a long build's minutes go)
export const timer = (name) => { if (!globalThis.process?.env?.LAMINA_TIMES) return () => {}; const t0 = performance.now(); let last = t0; return (what) => { const now = performance.now(); console.error(`${name} ${what}: ${((now - last) / 1000).toFixed(1)} s (${((now - t0) / 1000).toFixed(1)} s in)`); last = now; }; };
/**
 * A mechanism in one plane, printed flat.
 * @param {object} spec
 * @param {number} spec.height how tall it prints (z): every part's height, and the flexures' width
 * @param {number} spec.gap the least gap that prints apart: the printer's gap for parts printed in place
 * @param {{ E: number, strainLimit: number, name?: string }} spec.material (flexureMaterial(rules) makes one)
 * @param {{ line: number, layer: number, wall_min?: number }} [spec.printer] for the flexures' print findings
 * @param {object | object[]} spec.ground the fixed body: 2D shapes (or prisms, read as their outlines)
 * @param {Record<string, object>} [spec.bodies] the rigid moving bodies, drawn at rest
 * @param {Record<string, { kind?: string, params?: object, at?: number[], angle?: number, shape?: object, from: string, to: string,
 *   axis?: number[], pivot?: number[], stiffness?: number }>} spec.joints a flexure from one body (or 'ground') to another:
 *   a generator's kind and params placed at `at`, turned `angle` degrees (its root at `at`, its length along the turned x),
 *   or your own `shape` with how its `to` end moves (`axis`, a unit direction, or `pivot`, a point) and its `stiffness`
 *   (N/mm, or N·mm a degree for a pivot). A curve given `pin: { d, at, under, clearance?, lip?, lift?, base? }` turns
 *   on a pin printed in place at `at`, standing on `from` on a floor (`under`) and capped; the curve only springs it
 * @param {Record<string, Record<string, number>>} [spec.states] how far the joints you move are moved in each state:
 *   mm along an axis, degrees about a pivot; a leaf's (leaf, snapHook, contactLeaf) is its tip's travel in mm. rest is
 *   all zeros. A follower set by a state (a trigger pulled) starts there, and gives further if it must.
 * @param {Record<string, { by: string[], give?: 1 | -1 }>} [spec.follows] joints moved by contact, not only by hand (a
 *   latch, a sear, a pusher a sear presses back): wherever the bodies `by` run into one, it gives (in the `give`
 *   direction of its travel) just as far as it must to clear them, and springs back when they've passed. A joint being
 *   moved from one state to the next drives; one standing still gives. A contact steeper than friction lets a push turn
 *   into the give (a square face) can't push it: there the driver jams, which is what a latch is for and what a
 *   trigger must undo.
 * @param {string[]} [spec.sequence] the states in the order they happen; every step between two is checked
 * @param {Record<string, [string, string][]>} [spec.holds] in a state, [joint, catch]: the joint pushing back towards
 *   rest must jam on the catch, or run into it
 * @param {Record<string, object>} [spec.loose] parts printed beside it, not joined (a disc), as 3D shapes
 * @param {(solid: object) => object} [spec.finish] 3D work on the printed solid (holes through it, chamfers)
 * @param {false | { steps?: number, force?: number, contact?: number }} [spec.physics] the mechanism solved as it would
 *   behave (physics.mjs): off with false
 * @param {{ step: string, joint?: string, peak?: number[], click?: number, end?: number[] }[]} [spec.requires] what a
 *   driven step's force curve must do: its peak and end force (N), and the share it drops after its peak (a click)
 * @param {number} [spec.round] every inside corner of the ground and the bodies rounded to this radius
 * @param {object | object[]} [spec.fixtures] fixed shapes the physics sees but the print leaves out (another layer's walls)
 * @param {Record<string, { shape: object, mass: number }>} [spec.free] parts not joined to anything and not printed
 *   with it (a disc): in the physics only, held still while a hand works the mechanism, mass in grams
 * @param {Record<string, number[]>} [spec.grips] where a hand takes a joint's body to drive it, at rest (a trigger's
 *   blade, where the finger pulls): its force curve is then the finger's. Default: the body's centre
 * @param {{ from: string, disc: string, hold?: Record<string, number>, duration?: number, most?: number, least?: number, seat?: number[] }} [spec.fire] let go
 *   from a state and step through time, a hand keeping the joints in `hold` at those travels (a finger on the trigger):
 *   the bodies' speeds and the disc's exit speed and energy (J), against `most`
 * @param {{ slack?: number, steps?: number, cell?: number, friction?: number | { pass?: number, hold?: number }, step?: number, bite?: number, side?: number }} [spec.check]
 *   how deep a touch may be (default a tenth of the gap); the fewest steps between states (8), and the most any body
 *   moves in one (`step`, a quarter of a mm); the grid flexures are bent on (a quarter of the thinnest); friction at
 *   contacts, the cautious way for each check: `pass` for what must move (0.5), `hold` for what must hold (0.1); `bite`:
 *   the least a catch's load must press it in, in degrees (5); `side`: the push across the plane (N, default the hand's
 *   pull 15° off the plane)
 * @returns {Promise<{ parts: Record<string, object>, findings: object[], energy: Record<string, number>, at: (state: string | object) => object,
 *   outlines: (state: string | object) => Record<string, number[][][]>, frames: object[], mechanism: object }>} (async: the plane's
 *   geometry is manifold-3d's WASM, loaded the first time)
 */
export async function lamina(spec) {
  await ready();
  if (spec.flood) return flooded(spec);
  const mark = timer(spec.groundRounded ? (spec.bridges === undefined && spec.fire === undefined ? 'lamina (flood probe)' : 'lamina (flooded)') : 'lamina');
  const { height, gap, material, printer } = spec, slack = spec.check?.slack ?? gap / 10, steps = spec.check?.steps ?? 8, stepMost = spec.check?.step ?? 0.25;
  // Friction, taken the cautious way for each question: what must move is checked sticky (a ramp must still push its
  // follower aside at `pass`), what must hold is checked slippery (a catch must still jam at `hold`). Give over push past
  // 1 / μ and a contact jams: the push is within the friction angle of the face's normal.
  const mu = { pass: 0.5, hold: 0.1, ...(typeof spec.check?.friction === 'number' ? { pass: spec.check.friction, hold: spec.check.friction } : spec.check?.friction) };
  const steepFor = (m) => 1 / m;
  // (a finding's at is a point, as everywhere in the kit: a box given as at becomes box, with at its middle; a pair of
  // points, the two places something comes near itself, becomes between, with at halfway)
  const where = (x) => {
    const at = x.at;
    if (at && typeof at === 'object' && !Array.isArray(at) && at.lo && at.hi) return { ...x, at: at.lo.map((v, k) => (v + at.hi[k]) / 2), box: at };
    if (Array.isArray(at) && at.length === 2 && Array.isArray(at[0]) && Array.isArray(at[1])) return { ...x, at: at[0].map((v, k) => (v + at[1][k]) / 2), between: at };
    return x;
  };
  const findings = [], f = (level, text, code, extra = {}) => findings.push({ level, text, code, ...where(extra) });
  if (!(height > 0) || !(gap > 0) || !material?.E || !material?.strainLimit) throw new Error('a lamina needs height, gap and material ({ E, strainLimit })');

  // The parts: the ground, the bodies and the flexures, each a 2D shape at rest
  // round: the inside corners of the frame and the bodies rounded to this radius (grown by it, then shrunk), so no thin
  // arm meets its body at a square corner
  const rounded = (a) => (spec.round > 0 ? shrink(grow(a, spec.round), spec.round, 'Round') : a);
  const parts = { ground: { kind: 'ground', shape: spec.groundRounded ? all(spec.ground) : rounded(all(spec.ground)) } }; // (a flooded frame isn't rounded again: its pockets are the moving parts' room, rounded already by the clearance)
  for (const [n, s] of Object.entries(spec.bodies || {})) { if (parts[n]) throw new Error(`"${n}" is used twice`); parts[n] = { kind: 'body', shape: rounded(all(s)) }; }
  const joints = {};
  for (const [n, j] of Object.entries(spec.joints || {})) {
    if (parts[n]) throw new Error(`joint "${n}" has a body's name`);
    for (const end of ['from', 'to']) if (!parts[j[end]] || parts[j[end]].kind === 'flexure') throw new Error(`joint ${n}: ${end} "${j[end]}" is not the ground or a body`);
    if (j.to === 'ground') throw new Error(`joint ${n}: the ground doesn't move; join from it`);
    const place = mul(shift(j.at || [0, 0]), turn(rad(j.angle || 0))), dir = (v) => apply([place[0], place[1], 0, place[3], place[4], 0], v);
    let shape, motion, model = null, params = null, leafy = false, kind = j.kind;
    if (kind) {
      if (!gens[kind] || !models[kind]) throw new Error(`joint ${n}: no flexure "${kind}"`);
      params = { ...j.params, width: j.params?.width ?? height };
      shape = moved(place, flat(gens[kind](params)));
      // A flexure given rounds has every inside corner rounded to that radius, wherever its parts meet (a round meeting
      // a tapered beam, a beam meeting a block): grown by it, then shrunk
      if (params.fillet > 0 && kind !== 'curve') shape = shrink(grow(shape, params.fillet), params.fillet, 'Round'); // (a curve has no corners of its own, and rounding it whole would close the gaps between its loops)
      model = models[kind](params, material);
      const p = ports(kind, params);
      leafy = LEAFLIKE.has(kind);
      const gam = params.gamma ?? GAMMA; // (a leaf turned by a moment at its tip, not pushed, bends round evenly: about its middle, γ ½)
      motion = leafy ? { pivot: apply(place, [(1 - gam) * params.length, 0]), leaf: gam * params.length }
        : p.moves === 'turn' ? { pivot: apply(place, p.pivot.at) }
          : { axis: dir(p.moves === 'x' ? [1, 0] : [0, 1]), ...(model.drop ? { drop: model.drop, along: dir([-1, 0]) } : {}) }; // a guide's shuttle drops towards its base
      // Pinned: a pin printed in place carries the load and the body turns about it; the flexure only springs it (a
      // pawl's), bent as the physics bends it, so the model of it alone (its travel, its stiffness) no longer holds
      if (j.pin) { if (!(j.pin.d > 0) || !j.pin.at) throw new Error(`joint ${n}: a pin needs its diameter (d) and where it is (at)`); motion = { pivot: j.pin.at }; model = null; leafy = false; }
    } else {
      if (!j.shape || (!j.axis && !j.pivot)) throw new Error(`joint ${n}: give a flexure kind, or a shape and an axis or pivot`);
      shape = all(j.shape);
      const len = j.axis ? Math.hypot(...j.axis) : 1;
      motion = j.axis ? { axis: j.axis.map((c) => c / len) } : { pivot: j.pivot };
    }
    joints[n] = { ...j, kind, params, model, motion, place, leafy, turning: !leafy && !!motion.pivot, stiffness: j.stiffness ?? model?.stiffness };
    parts[n] = { kind: 'flexure', shape, joint: n };
  }
  // A pin printed in place: a round post on the body it's from, through a hole in the body it carries a clearance
  // round (the printer's fit), joined to its body under the other by a floor (`under`) and held down by a cap. In
  // the plane it's a post in a hole; the floor and the cap are put on in 3D
  const ring = (c, r) => [Array.from({ length: 48 }, (_, i) => [c[0] + r * Math.cos((i * Math.PI) / 24), c[1] + r * Math.sin((i * Math.PI) / 24)])];
  const pinsOf = Object.entries(joints).filter(([, j]) => j.pin).map(([n, j]) => {
    const fit = printer?.fit ?? gap, P = { joint: n, from: j.from, to: j.to, at: j.pin.at, r: j.pin.d / 2, c: j.pin.clearance ?? fit, lip: j.pin.lip ?? 1, lift: j.pin.lift ?? printer?.support_gap ?? 0.2, base: j.pin.base ?? (printer?.layer ?? 0.2) * 6, under: j.pin.under ? all(j.pin.under) : null };
    parts[j.from].shape = union([parts[j.from].shape, ring(P.at, P.r)]);
    parts[j.to].shape = subtract(parts[j.to].shape, ring(P.at, P.r + P.c));
    return P;
  });
  // A flexure given rounds meets its bodies in rounds too, whatever their shape: the round filling the corner between the
  // flexure and a band of each body, outside the body, is added to the flexure
  // (only round where it meets them: within two radii of where they touch, so a gap beside the flexure stays open;
  // flexures with blocks of their own, guides and serpentines, round into those already)
  const OWN_BLOCKS = new Set(['parallelGuide', 'compoundGuide', 'foldedGuide', 'serpentine', 'snapHook', 'notchHinge', 'ellipticalHinge', 'livingHinge', 'cartwheel', 'letJoint', 'bistable']);
  for (const [n, j] of Object.entries(joints)) {
    const r = j.params?.fillet;
    if (!(r > 0) || OWN_BLOCKS.has(j.kind) || j.kind === 'curve') continue; // (a curve draws its own rounds, as true quarter circles)
    let F = parts[n].shape;
    for (const b of [j.from, j.to]) {
      if (b === 'ground' && spec.groundRounded) continue; // (a flooded frame draws its own rounds at each root: rounding into it here would close the room beside the flexure)
      const B = parts[b].shape, touch = intersect(F, grow(B, TOUCH)), near = intersect(B, grow(F, r * 3));
      if (area(touch) <= AREA) continue;
      F = union([F, intersect(subtract(shrink(grow(union([F, near]), r), r, 'Round'), B), grow(touch, r * 1.2))]);
    }
    parts[n].shape = F;
  }
  // A curve's end is drawn for a block square to it: it runs on into it, and flares into its face in a quarter circle.
  // Each body it ends on is given that block, its seat: as wide as the flare and a margin either side, from the end on
  // into the body for its run on and as much again, its outside corners rounded and blended into the body in rounds
  // behind its face. Where the body already lies there the seat is lost in it; where it doesn't, the seat stands out of
  // it, a shoulder (lamina.seat). (A flooded frame builds its own block at each root: those are only checked)
  const seats = [], ends = [];
  for (const [n, j] of Object.entries(joints)) {
    if (j.kind !== 'curve') continue;
    const p = ports('curve', j.params), r = j.params.fillet ?? 0, T = [j.params.thickness].flat(), into = j.params.into ?? Math.max(...T);
    for (const [end, b, t] of [['end', j.to, T.at(-1)], ['root', j.from, T[0]]]) {
      const c = apply(j.place, p[end].at), d = apply([j.place[0], j.place[1], 0, j.place[3], j.place[4], 0], p[end].dir), l = Math.hypot(...d) || 1, u = [d[0] / l, d[1] / l], v = [-u[1], u[0]];
      const w = t / 2 + r + Math.max(gap, r / 2), deep = into + Math.max(t, r), at = (s, k) => [c[0] + u[0] * s + v[0] * k, c[1] + u[1] * s + v[1] * k];
      const k = Math.min(r || spec.round || gap, w / 2, deep / 2), block = [[at(0 - k, -w), at(deep, -w), at(deep, w), at(0 - k, w)]], behind = [[at(0, -w * 4), at(deep * 4, -w * 4), at(deep * 4, w * 4), at(0, w * 4)]]; // (behind its face: the half of the plane the body lies in)
      const plug = intersect(parts[n].shape, intersect(behind, [[at(0, -w), at(deep, -w), at(deep, w), at(0, w)]])); // (its flare's foot and run on)
      ends.push({ joint: n, end, body: b, at: c, plug });
      if (b === 'ground' && spec.groundRounded) continue; // (only checked: a flooded frame builds its own block at each root)
      const B = parts[b].shape, seat = intersect(grow(shrink(block, k), k), behind); // its back corners rounded (its face square)
      const out = subtract(seat, B), blend = r || spec.round || 0;
      if (area(out) <= AREA) continue; // (seated already)
      const S = union([B, seat]), fill = blend > 0 ? apart(intersect(subtract(shrink(grow(S, blend), blend, 'Round'), S), intersect(grow(seat, blend * 2), behind))).filter((a) => area(intersect(a, grow(seat, 0.05))) > AREA) : []; // (only the rounds against the seat: not what rounding the whole body would fill elsewhere)
      parts[b].shape = shrink(grow(union([S, ...fill]), 0.01), 0.01); // (closed by a hair: where the seat and its rounds meet edge on, no crack between them)
      seats.push({ joint: n, end, body: b, at: c, added: area(out) });
    }
  }
  // Each body hangs from one joint: the tree from the ground
  const parent = {};
  for (const [n, j] of Object.entries(joints)) { if (parent[j.to]) throw new Error(`${j.to} hangs from two joints (${parent[j.to]} and ${n}): give it one, a guide is one joint`); parent[j.to] = n; }
  for (const [n, p] of Object.entries(parts)) if (p.kind === 'body' && !parent[n]) throw new Error(`body ${n} isn't joined to anything: join it, or print it loose`);
  const follows = spec.follows || {};
  for (const [n, fo] of Object.entries(follows)) {
    if (!joints[n]) throw new Error(`follows: no joint "${n}"`);
    for (const b of fo.by || []) if (!parts[b]) throw new Error(`follows ${n}: no part "${b}"`);
  }
  for (const [s, v] of Object.entries(spec.states || {})) for (const k of Object.keys(v)) {
    if (!joints[k]) throw new Error(`state ${s}: no joint "${k}"`);
  }

  // How a joint moves its body at a travel q (mm or degrees), and every part's place for a set of travels
  const motionAt = (j, q) => {
    const m = j.motion;
    if (m.axis) { const d = m.drop ? m.drop(q) : 0, a = m.along || [0, 0]; return shift([m.axis[0] * q + a[0] * d, m.axis[1] * q + a[1] * d]); }
    if (j.leafy) return turn(Math.asin(Math.max(-1, Math.min(1, q / m.leaf))), m.pivot); // a leaf's tip travel, as the pseudo-rigid-body angle
    return turn(rad(q), m.pivot);
  };
  const places = (values) => {
    const out = { ground: I }, of = (b) => {
      if (out[b]) return out[b];
      const jn = parent[b], j = joints[jn];
      return (out[b] = mul(of(j.from), motionAt(j, values[jn] || 0)));
    };
    for (const n of Object.keys(parts)) if (parts[n].kind === 'body') of(n);
    return out;
  };

  // Bending: each flexure's points with their share of the motion, worked out once
  const thinnest = Math.min(gap * 4, ...Object.values(joints).flatMap((j) => [j.params?.thickness ?? j.params?.neck ?? gap * 4].flat())); // (a curve's thickness is a list)
  const cell = spec.check?.cell ?? Math.max(0.02, thinnest / 4);
  const bendable = {};
  const bending = (n) => {
    if (bendable[n]) return bendable[n];
    const j = joints[n], shape = parts[n].shape, touch = (b) => intersect(shape, grow(parts[b].shape, TOUCH));
    const share = shares(shape, touch(j.from), touch(j.to), cell), outlines = split(shape, Math.max(cell * 4, 0.3));
    return (bendable[n] = outlines.map((o) => o.map((p) => [p, smooth(share(p))])));
  };
  const shapesAt = (values, only = null) => {
    const at = places(values), out = {};
    for (const [n, p] of Object.entries(parts)) {
      if (only && !only.has(n)) continue;
      if (p.kind !== 'flexure') { out[n] = moved(at[n], p.shape); continue; }
      const j = joints[n], q = values[n] || 0, base = at[j.from];
      if (!q && base === I) { out[n] = p.shape; continue; }
      out[n] = fromOutlines(bending(n).map((o) => o.map(([pt, w]) => apply(mul(base, motionAt(j, q * w)), pt))));
    }
    return out;
  };

  // What may touch what: a flexure its two bodies; nothing else
  const names = Object.keys(parts), joined = (a, b) => [a, b].some((x) => parts[x].kind === 'flexure' && [joints[x].from, joints[x].to].includes(x === a ? b : a));
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]));
  const what = (n) => (parts[n]?.kind === 'flexure' ? `the ${n} flexure` : n === 'ground' ? 'the ground' : n);
  // Which parts a joint carries: its body, the bodies below it, and their flexures
  const carried = (jn) => {
    const out = new Set([joints[jn].to, jn]);
    let grew = true;
    while (grew) { grew = false; for (const [n, j] of Object.entries(joints)) if (out.has(j.from) && !out.has(n)) { out.add(n); out.add(j.to); grew = true; } }
    return out;
  };
  const carries = Object.fromEntries(Object.keys(joints).map((n) => [n, carried(n)]));
  // A pair a follower clears for itself (when it's free to give): the solve keeps them apart, so they aren't a clash
  const driven = (a, b, active = NONE) => Object.entries(follows).some(([n, fo]) => !active.has(n) && ((carries[n].has(a) && fo.by.includes(b)) || (carries[n].has(b) && fo.by.includes(a))));
  const clashes = (shapes, only = null, active = NONE) => {
    const out = [];
    for (const [a, b] of pairs) {
      if (joined(a, b) || driven(a, b, active) || (only && !(only.has(a) !== only.has(b)))) continue;
      const hit = collide(shapes[a], shapes[b], slack);
      if (hit) out.push({ a, b, at: hit });
    }
    return out;
  };
  // How far a joint's model lets it go at a strain (a model with no travel to ask, such as a bistable beam's, sets no limit)
  const travelAt = (j, strain, sign) => { const t = typeof j.model?.travel === 'function' ? j.model.travel(strain, sign) : Infinity; return j.turning ? deg(t) : t; };
  const limitOf = (n, sign) => travelAt(joints[n], material.strainLimit, sign); // (sign: the way it moves, for a flexure that isn't the same both ways)

  mark('set up');
  // ---- followers: each gives as far as it must to clear what drives it ----
  const blocked = (values, n) => {
    const fo = follows[n], sh = shapesAt(values, new Set([...carries[n], ...fo.by]));
    return [...carries[n]].some((p) => fo.by.some((b) => collide(sh[p], sh[b], 0))); // exact: a follower is solved to just touching, so its give is measured, not the slack
  };
  const solve = (values, active = NONE) => { // v: every travel; pushed: how far each follower was pushed past where its state put it
    const v = { ...values }, over = [], pushed = {};
    for (const [n, fo] of Object.entries(follows)) {
      const g = fo.give ?? 1, from = g * (v[n] || 0); // where the state put it, either side: it gives on from there
      pushed[n] = 0;
      if (active.has(n)) continue; // being moved: it drives, it doesn't give
      v[n] = g * from;
      if (!blocked(v, n)) continue;
      const most = Math.min(limitOf(n, g), fo.most ?? Infinity), reach = Number.isFinite(most) ? most : gap * 100;
      // March out from where it is to the first place it clears (giving further can run it into something else), then
      // close in on it
      let lo = from, hi = null;
      for (let k = 1; k <= MARCH && hi == null; k++) { const at = from + ((reach - from) * k) / MARCH; if (blocked({ ...v, [n]: g * at }, n)) lo = at; else hi = at; }
      if (hi == null) { v[n] = g * reach; pushed[n] = reach - from; over.push(n); continue; }
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (blocked({ ...v, [n]: g * mid }, n)) lo = mid; else hi = mid; }
      v[n] = g * hi; pushed[n] = hi - from;
    }
    return { v, over, pushed };
  };
  // How far a part's corners move between two sets of travels: a push, or a give
  const corners = (n) => { const { lo, hi } = box(parts[n].shape); return [[lo[0], lo[1]], [hi[0], lo[1]], [lo[0], hi[1]], [hi[0], hi[1]]]; };
  const moveOf = (n, a, b) => {
    if (parts[n].kind === 'ground') return 0;
    const body = parts[n].kind === 'flexure' ? joints[n].to : n, pa = places(a)[body], pb = places(b)[body];
    return Math.max(...corners(body).map((p) => Math.hypot(...apply(pa, p).map((c, k) => c - apply(pb, p)[k]))));
  };

  // Where a follower meets what drives it (the middle of their overlap, grown by a gap), and how far a point on a body moves
  const contactOf = (values, n) => {
    const fo = follows[n], sh = shapesAt(values, new Set([...carries[n], ...fo.by]));
    for (const b of fo.by) for (const p of carries[n]) {
      const o = intersect(grow(sh[p], gap), sh[b]);
      if (area(o) > AREA) { const { lo, hi } = box(o); return { by: b, at: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] }; }
    }
    return null;
  };
  const inverse = (m) => { const d = m[0] * m[4] - m[1] * m[3]; return [m[4] / d, -m[1] / d, (m[1] * m[5] - m[4] * m[2]) / d, -m[3] / d, m[0] / d, (m[3] * m[2] - m[0] * m[5]) / d]; };
  const pointStep = (n, a, b, pt) => {
    if (n === 'ground') return [0, 0];
    const body = parts[n].kind === 'flexure' ? joints[n].to : n, step = mul(places(b)[body], inverse(places(a)[body])), q = apply(step, pt);
    return [q[0] - pt[0], q[1] - pt[1]];
  };
  const pointMove = (n, a, b, pt) => Math.hypot(...pointStep(n, a, b, pt));

  // A path from one set of travels to another, in steps no body moves more than a quarter of a mm in: what jams, what
  // runs into what, how far the followers give
  const used = {};
  const note = (v) => { for (const [k, q] of Object.entries(v)) { used[k] ??= { most: 0, signs: new Set() }; if (Math.abs(q) > Math.abs(used[k].most)) used[k].most = q; if (q) used[k].signs.add(Math.sign(q)); } };
  let reachedLast = null; // where the last walk ended: a state as the sequence reaches it
  let walkRatio = 0; // the most any follower gave for its push, over the last walk: a contact that holds needs friction over its inverse
  const walk = (a, b, { record = true, friction = mu.pass } = {}) => { // record: count the travels it reaches as used (not for probes)
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])], at = (t) => Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]));
    const active = new Set(keys.filter((x) => Math.abs((a[x] || 0) - (b[x] || 0)) > 1e-9)), steep = steepFor(friction), solveAt = (t) => solve(at(t), active);
    const far = Math.max(0, ...Object.keys(parts).filter((n) => parts[n].kind === 'body').map((n) => moveOf(n, a, b)));
    const n = Math.min(400, Math.max(steps, Math.ceil(far / stepMost)));
    // Pushed further aside than the push could make it go, in a step: a face too steep, a jam. A step that pushes a
    // follower is looked at again in tenths, so a square face isn't taken for a ramp because the step was coarse
    const jam = (p, q) => {
      for (const [fn, fo] of Object.entries(follows)) {
        if (q.pushed[fn] <= p.pushed[fn] + 1e-9) continue; // not pushed further (moved by its state, or springing back: fine)
        const g = fo.give ?? 1, asSet = { ...q.v, [fn]: q.v[fn] - g * (q.pushed[fn] - p.pushed[fn]) }; // where it would be with only the last push
        const c = contactOf(asSet, fn) ?? contactOf(p.v, fn); // (where what drives it has moved on and it hasn't given yet: a step from a hair clear meets it there)
        if (!c) continue;
        // the push: how far what drives it moves against what it hangs from (a pawl carried past a still sear is pushed as hard as one a sear moves into)
        const give = pointMove(joints[fn].to, asSet, q.v, c.at), by = pointStep(c.by, p.v, q.v, c.at), from = pointStep(joints[fn].from, p.v, q.v, c.at), push = Math.hypot(by[0] - from[0], by[1] - from[1]);
        if (give > FINE) walkRatio = Math.max(walkRatio, (give - FINE) / Math.max(push, 1e-9));
        if (give > FINE && give > steep * push + FINE) return { joint: fn, by: c.by, grip: push / give }; // grip: the least friction that jams it here
      }
      return null;
    };
    let prev = solveAt(0), t0 = 0;
    walkRatio = 0;
    for (let k = 1; k <= n; k++) {
      const t = k / n, now = solveAt(t), { v, over } = now;
      if (record) note(v);
      if (Object.keys(follows).some((fn) => now.pushed[fn] > prev.pushed[fn] + 1e-9)) {
        let p = prev;
        for (let s = 1; s <= REFINE; s++) {
          const ts = t0 + ((t - t0) * s) / REFINE, q = s === REFINE ? now : solveAt(ts), j = jam(p, q);
          if (j) return { kind: 'jam', t: ts, ...j, v: q.v, last: p.v };
          p = q;
        }
      }
      if (over.length) return { kind: 'over', t, joint: over[0], v, last: prev.v };
      const hit = clashes(shapesAt(v), null, active)[0];
      if (hit) return { kind: 'hit', t, ...hit, v, last: prev.v, pushing: Object.keys(follows).find((fn) => now.pushed[fn] > slack && (carries[fn].has(hit.a) || carries[fn].has(hit.b))) };
      prev = now; t0 = t;
    }
    reachedLast = prev.v;
    return null;
  };

  mark('followers');
  // ---- rigid: no thin arm of the frame or a body tied on at one end only (it bends under load, and spoils what it
  // holds: a rail a stop hits, a hanger a hinge hangs from). Thinner than `check.rigid` (3 mm) and joined to the rest at
  // one place, it's a free end ----
  const rigidW = spec.check?.rigid ?? 3;
  for (const [n, p] of Object.entries(parts)) {
    if (p.kind === 'flexure') continue;
    const core = grow(shrink(p.shape, rigidW / 2, 'Round'), rigidW / 2), thin = subtract(p.shape, grow(core, cell));
    for (const piece of apart(thin)) {
      if (area(piece) < rigidW * rigidW) continue; // a nib, not an arm
      if (pieces(intersect(grow(piece, cell * 2), core)) <= 1) { const b = box(piece); f('warn', `${what(n)} has an arm narrower than ${rigidW} mm tied on at one end only, near (${((b.lo[0] + b.hi[0]) / 2).toFixed(1)}, ${((b.lo[1] + b.hi[1]) / 2).toFixed(1)}): it bends under load. Fill it in, or tie its other end back`, 'lamina.rigid', { part: n, at: b }); }
    }
  }

  // ---- seat: each curve's end in a block square to it, all of its flare and run on inside its body; where a seat had to
  // stand out of the body, said so. (Whether it then hits anything is the free and collide checks', which see it as part
  // of the body) ----
  for (const s of seats) {
    f('info', `the ${s.joint} flexure's ${s.end === 'end' ? 'end' : 'root'} at (${s.at.map((x) => x.toFixed(1)).join(', ')}) is seated on ${what(s.body)} by a block standing ${s.added.toFixed(1)} mm² out of it, rounded into it`, 'lamina.seat', { joint: s.joint, end: s.end, part: s.body, at: s.at, added: s.added });
  }
  let loose = 0;
  for (const e of ends) {
    const out = area(subtract(e.plug, grow(parts[e.body].shape, 0.02)));
    if (out > Math.max(AREA, gap * gap)) { loose++; f('fail', `the ${e.joint} flexure's ${e.end === 'end' ? 'end' : 'root'} at (${e.at.map((x) => x.toFixed(1)).join(', ')}) sticks ${out.toFixed(1)} mm² out of ${what(e.body)}: its flare and run on aren't held. Fill ${what(e.body)} out there, or move the end in`, 'lamina.seat', { joint: e.joint, end: e.end, part: e.body, at: e.at, out }); }
  }
  if (!loose && ends.length) f('pass', `every curve's ends are in their bodies${seats.length ? ` (${seats.length} on a seat)` : ''}`, 'lamina.seat');

  mark('rigid and seats');
  // ---- free: at rest, the gap between everything that isn't joined; each flexure on its two bodies only ----
  let free = true;
  // A curve folded into its room mustn't come nearer itself than the gap either, or its loops print fused
  for (const [n, j] of Object.entries(joints)) {
    if (j.kind !== 'curve') continue;
    const c = curveClearance(j.params);
    if (c && c.clear < gap * 0.98) { free = false; f('fail', `the ${n} flexure comes ${Math.max(0, c.clear).toFixed(2)} mm from ${c.mirror ? 'its mirror image' : 'itself'}, near (${c.at[0].map((x) => x.toFixed(1)).join(', ')}): under the ${gap} mm gap, its loops fuse there`, 'lamina.free', { joint: n, gap: c.clear, at: c.at }); }
  }
  for (const [a, b] of pairs) {
    const A = parts[a].shape, B = parts[b].shape;
    if (!joined(a, b)) {
      if (within(A, B, gap * 0.98)) { free = false; const g = gapBetween(A, B, gap); f('fail', `${what(a)} and ${what(b)} are ${g ? `${g} mm` : 'touching'} apart at rest: under the ${gap} mm gap, they print as one`, 'lamina.free', { parts: [a, b], gap: g, at: box(intersect(grow(A, gap / 2), grow(B, gap / 2))) }); }
      continue;
    }
    const [fx, body] = parts[a].kind === 'flexure' ? [a, b] : [b, a], F = parts[fx].shape, Bd = parts[body].shape;
    const contact = intersect(F, grow(Bd, TOUCH));
    if (area(contact) <= AREA) { free = false; f('fail', `the ${fx} flexure doesn't reach ${what(body)}: it would print loose`, 'lamina.attached', { parts: [fx, body] }); continue; }
    if (area(intersect(F, Bd)) <= AREA) { free = false; f('fail', `the ${fx} flexure only meets ${what(body)} along an edge: run it into it (by a line or two), or it prints as two pieces`, 'lamina.attached', { parts: [fx, body], at: box(contact) }); continue; }
    // Overlapping it in two places is fused (touching along a line, flush, is one material)
    const legs = OWN_BLOCKS.has(joints[fx].kind) ? 1 : (centrelines(joints[fx].kind, joints[fx].params)?.length ?? 1); // a flexure of several leaves meets each body once a leaf
    if (pieces(intersect(F, Bd)) > legs) { free = false; f('fail', `the ${fx} flexure touches ${what(body)} in more than one place: it's fused to it away from its root`, 'lamina.free', { parts: [fx, body], at: box(contact) }); continue; }
    // The flexure away from where it grows out of the body, and its round if it has one (a round lies on the body out to
    // its radius past the flexure's side, and the rounding reaches no further than 1.2 radii)
    const rest = subtract(F, grow(contact, gap * 2 + cell + 1.25 * (joints[fx].params?.fillet ?? 0)));
    if (area(rest) > AREA && within(rest, Bd, gap * 0.98)) { free = false; const g = gapBetween(rest, Bd, gap); f('fail', `the ${fx} flexure runs ${g ? `${g} mm` : 'touching'} from ${what(body)} away from its root: under the ${gap} mm gap, it fuses there`, 'lamina.free', { parts: [fx, body], gap: g, at: box(intersect(grow(rest, gap / 2), grow(Bd, gap / 2))) }); }
  }
  if (free) f('pass', `everything clears what it isn't joined to by ${gap} mm, and each flexure touches only its two bodies: it prints free`, 'lamina.free');

  const kinematic = spec.kinematic !== false; // false: the physics alone says how it moves (contact pushing a follower both ways, a cam)
  // (a state's values are numbers: a NaN or a string would run through every check and pass)
  for (const [s, v] of Object.entries(spec.states || {})) for (const [k, q] of Object.entries(v || {})) if (typeof q !== 'number' || !Number.isFinite(q)) throw new Error(`state ${s}: ${k} is ${JSON.stringify(q)}, not a number (how far the joint moves, mm or degrees)`);
  const states = { rest: {}, ...(spec.states || {}) }, state = (s) => { const v = typeof s === 'string' ? states[s] : s; if (!v) throw new Error(`no state "${s}"`); return v; };
  const seq = spec.sequence || [], frames = [], reached = {}, solved = {};
  let planned = null;
  // The strain, finite-element peak and hard stop of each flexure, from the travels the sequence reached (the
  // kinematic walk's, or the physics')
  function strainAndStops() {
    // ---- the peak strain by finite elements: the corners beam theory doesn't see ----
    const centroid = (a) => { const { lo, hi } = box(a); return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; };
    // Corners where the outline turns into the material, the turn measured over `span` either side (so a round of a
    // radius well over the span turns a little, a square corner a right angle, and a booleans' wiggle not at all)
    const reentrant = (a, span) => a.flatMap((l) => l.map((p, k) => {
      const reach = (dir) => { for (let i = 1; i < l.length; i++) { const q = l[(k + dir * i + l.length * i) % l.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= span) return q; } return l[(k + dir + l.length) % l.length]; };
      const o = reach(-1), q = reach(1), u1 = [p[0] - o[0], p[1] - o[1]], u2 = [q[0] - p[0], q[1] - p[1]];
      return { p, turn: Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]) };
    }).filter((c) => c.turn < -rad(SHARP_TURN)).map((c) => c.p));
    function feCheck(n, j, most, beam) {
      const t = Math.min(...[j.params?.thickness ?? j.params?.neck ?? gap * 4].flat()), to = parts[j.to].shape, from = parts[j.from].shape, c = centroid(to);
      const m = j.motion, dir = m.axis ? m.axis : (() => { const r = [c[0] - m.pivot[0], c[1] - m.pivot[1]], l = Math.hypot(...r); return [-r[1] / l, r[0] / l]; })();
      const travel = m.axis ? most : j.leafy ? (most * Math.hypot(c[0] - m.pivot[0], c[1] - m.pivot[1])) / m.leaf : rad(most) * Math.hypot(c[0] - m.pivot[0], c[1] - m.pivot[1]);
      const r = fePeak({ flexure: parts[n].shape, held: from, moved: to, direction: dir, travel, E: material.E, cell: t / FE_CELLS, band: Math.max(2 * t, gap * 4) });
      if (!r) { f('info', `${n}: its peak strain couldn't be worked out by finite elements (nothing held, or nothing to push)`, 'lamina.peak', { joint: n }); return null; }
      const sharp = reentrant(union([parts[n].shape, intersect(from, grow(parts[n].shape, t * 2)), intersect(to, grow(parts[n].shape, t * 2))]), r.cell).some((p) => Math.hypot(p[0] - r.at[0], p[1] - r.at[1]) <= r.cell * 2.01);
      // The finite elements are linear: what they say at the full travel is a concentration over what a linear beam says
      // there. A model solved for large deflections (a curve) is asked for its own linear strain (at a twentieth of the
      // travel, scaled up), the concentration taken over that, and applied to what it says at the full travel
      const lin = j.model.signed ? (Math.abs(j.model.strain((Math.sign(used[n]?.most || 1) * most) / 20)) * 20) : beam;
      const ratio = lin > 0 ? r.peak / lin : null; r.peak = ratio && j.model.signed ? ratio * beam : r.peak;
      const where = `at (${r.at.map((x) => x.toFixed(1)).join(', ')})`, limit = material.strainLimit;
      if (sharp) f('fail', `${n}: its strain peaks at a square corner ${where}, ${(r.peak * 100).toFixed(2)}% on ${r.cell.toFixed(2)} mm cells and more on finer ones: a sharp inside corner has no bound, and it's where a print yields. Round it (a radius about the flexure's thickness), or taper into it`, 'lamina.peak', { joint: n, strain: r.peak, at: r.at, sharp: true });
      if (!sharp) f(r.peak <= limit ? 'pass' : 'fail', `${n}: finite elements give a peak of ${(r.peak * 100).toFixed(2)}% ${where}${ratio ? ` (${ratio.toFixed(2)} × beam theory)` : ''}, ${r.peak <= limit ? 'within' : 'over'} the limit of ${(limit * 100).toFixed(2)}%`, 'lamina.peak', { joint: n, strain: r.peak, at: r.at, ratio });
      return { ...r, sharp, ratio: sharp ? Infinity : ratio };
    }

    // ---- strain and stops: displacement-driven, each flexure's travel against its limit, and a hard stop before it ----
    for (const [n, j] of Object.entries(joints)) {
      const u = used[n], m = j.model;
      if (!m && j.pin) { f('info', `${n}: turns on a pin, its flexure only springs it: its strain comes from the physics`, 'lamina.model', { joint: n }); continue; }
      if (!m) { f('info', `${n}: your own flexure, with no model: its strain and stop aren't checked`, 'lamina.model', { joint: n }); continue; }
      if (typeof m.strain !== 'function') { // a bistable beam: it has one travel, to its other shape, and one strain on the way
        if (typeof m.strain === 'number') f(m.strain <= material.strainLimit ? 'pass' : 'fail', `${n}: snapping through, it sees ${(m.strain * 100).toFixed(2)}% strain, ${m.strain <= material.strainLimit ? 'within' : 'over'} the limit of ${(material.strainLimit * 100).toFixed(2)}%`, 'lamina.strain', { joint: n, strain: m.strain });
        continue;
      }
      const toModel = (q) => (j.turning ? rad(q) : q), unit = j.turning ? '°' : ' mm', limit = limitOf(n), most = Math.abs(u?.most || 0);
      if (printer) for (const x of gens.printable({ thickness: Math.min(...[j.params.thickness ?? j.params.neck].flat()), width: j.params.width }, printer, material, m)) f(x.level, `${n}: ${x.text}`, x.code, { joint: n });
      const e = Math.abs(m.strain(toModel(m.signed ? u?.most || 0 : most))); // (a curve isn't the same both ways: its strain the way it's moved)
      f(e <= material.strainLimit ? 'pass' : 'fail', `${n}: ${u?.most ? `at its most (${+most.toFixed(2)}${unit}) it sees ${(e * 100).toFixed(2)}% strain, ${e <= material.strainLimit ? 'within' : 'over'} the limit of ${(material.strainLimit * 100).toFixed(2)}% (${+limit.toFixed(2)}${unit})` : 'nothing moves it'}`, 'lamina.strain', { joint: n, strain: e, limit });
      if (j.model.least != null && printer && j.model.least < (printer.wall_min ?? 2 * printer.line) - 1e-6) f('fail', `${n}: tapered to ${j.model.least.toFixed(2)} mm, under the thinnest wall that prints (${printer.wall_min ?? 2 * printer.line} mm)`, 'flexure.thin', { joint: n });
      const fe = u?.most && spec.check?.fe !== false ? feCheck(n, j, most, e) : null;
      // Where the real peak is over beam theory's, the travel it may go is that much less
      const reachOf = (sg) => (fe && !fe.sharp && fe.ratio > 1 ? travelAt(j, material.strainLimit / fe.ratio, sg) : limitOf(n, sg)); // (a sharp corner fails on its own; the model asked, not scaled, since a large deflection isn't linear)
      // A stop: swept from rest to the limit (less a margin), its body, or what it carries, runs into something
      const signs = follows[n] ? [follows[n].give ?? 1] : u?.signs.size ? [...u.signs] : [1, -1]; // a follower only ever gives one way
      for (const sgn of signs) {
        const reach = reachOf(sgn), limit = limitOf(n, sgn); // (the limit the way it moves)
        let hits = [], at = 0;
        for (let k = 1; k <= STOP_STEPS && !hits.length; k++) {
          at = (sgn * reach * 0.95 * k) / STOP_STEPS;
          const { v: sv, over } = solve({ [n]: at }, new Set([n])), sh = shapesAt(sv);
          hits = pairs.filter(([a, b]) => !joined(a, b) && !driven(a, b) && carries[n].has(a) !== carries[n].has(b) && (kinematic || a === 'ground' || b === 'ground') && collide(sh[a], sh[b], slack)).map(([a, b]) => ({ a, b })); // (with the physics alone, another moving part would just move: only the frame stops it)
          if (!hits.length && over.length) hits = [{ a: joints[n].to, b: joints[over[0]].to }]; // what it drives has reached its own limit
        }
        const side = signs.length > 1 ? (sgn > 0 ? ' one way' : ' the other way') : '';
        const lim = `${+reach.toFixed(2)}${unit}${reach < limit ? ' (by its finite-element peak)' : ''}`;
        if (hits.length) f('pass', `${n}: stopped by ${what(carries[n].has(hits[0].a) ? hits[0].b : hits[0].a)} at ${+Math.abs(at).toFixed(2)}${unit}${side}, before its limit of ${lim}`, 'lamina.stop', { joint: n, at });
        else f('fail', `${n}: nothing stops it${side} before ${lim}, where it breaks: add a hard stop (a post or a wall it meets)`, 'lamina.stop', { joint: n, limit: reach });
      }
    }

  }

  // The mechanism in the plane: what the kinematic and the frame stages are made from. Nothing of the 3D (straps,
  // guides, the finish) or the physics is part of them
  const kinematicSpec = { ...spec, bridges: undefined, guides: undefined, finish: undefined, fire: undefined, physics: undefined, flood: undefined, grips: undefined, fixtures: undefined };
  if (kinematic) {
    // The kinematics (the sequence walked, each state, the latches, the strain and stops) are a stage kept between builds
    // (cache.mjs), by the mechanism in the plane: nothing of the 3D (straps, guides, the finish) or the physics is part
    // of them. What it found, and what the later stages read of it (where the sequence reached, each state solved, how far
    // each joint was used), is kept with it; a build gets the kept copy whether it ran or not
    const start = findings.length;
    const kept = await stage('kinematics', kinematicSpec, async () => {
    mark('free');
    // ---- the sequence, then each state as the sequence reaches it: nothing runs into anything, nothing jams ----
    for (let i = 0; i + 1 < seq.length; i++) {
      // From where the last step settled; a joint both states set alike stays where it settled, so it isn't moved
      const a = reached[seq[i]] ?? state(seq[i]), said = state(seq[i]), b = { ...state(seq[i + 1]) };
      for (const k of Object.keys(b)) if (said[k] === b[k] && a[k] != null) b[k] = a[k];
      const r = walk(a, b), pct = r ? `${Math.round(r.t * 100)}% of the way` : '';
      // A step into a state that a catch holds may end on the catch: it settles there, short of the state's own travel
      const catches = (spec.holds?.[seq[i + 1]] || []).filter(([jn]) => Math.abs((a[jn] || 0) - (b[jn] || 0)) > 1e-9);
      const caught = r && catches.find(([jn, by]) => {
        const mine = (x) => carries[jn].has(x), theirs = (x) => x === by || Object.keys(follows).some((fn) => carries[fn].has(by) && carries[fn].has(x));
        return (r.kind === 'jam' && (mine(r.by) || r.by === joints[jn].to) && carries[r.joint].has(by)) || (r.kind === 'jam' && carries[jn].has(r.joint) && theirs(r.by)) || (r.kind === 'hit' && ((mine(r.a) && theirs(r.b)) || (mine(r.b) && theirs(r.a))));
      });
      if (caught) {
        const [jn, by] = caught, at = r.last[jn] || 0;
        reached[seq[i + 1]] ??= r.last;
        f('pass', `${seq[i]} to ${seq[i + 1]}: settles on ${by} at ${+Math.abs(at).toFixed(2)}${joints[jn].turning ? '°' : ' mm'} (${jn})`, 'lamina.sequence', { from: seq[i], to: seq[i + 1], settles: at });
      } else if (!r) { reached[seq[i + 1]] ??= reachedLast; f('pass', `${seq[i]} to ${seq[i + 1]}: clear all the way`, 'lamina.sequence', { from: seq[i], to: seq[i + 1] }); }
      else if (r.kind === 'jam') f('fail', `${seq[i]} to ${seq[i + 1]}: ${r.by} jams on ${joints[r.joint].to} ${pct}: it meets a face too steep to push aside (at a friction of ${mu.pass})`, 'lamina.jam', { from: seq[i], to: seq[i + 1], joint: r.joint, t: r.t });
      else if (r.kind === 'over') f('fail', `${seq[i]} to ${seq[i + 1]}: ${r.joint} would have to give past its limit ${pct}`, 'lamina.follow', { from: seq[i], to: seq[i + 1], joint: r.joint, t: r.t });
      else if (r.pushing) f('fail', `${seq[i]} to ${seq[i + 1]}: ${follows[r.pushing].by.join(' and ')} pushes ${joints[r.pushing].to} aside until ${what(r.a)} and ${what(r.b)} meet, ${pct}: it can't get out of the way (give it more room, or a shallower face)`, 'lamina.sequence', { from: seq[i], to: seq[i + 1], parts: [r.a, r.b], joint: r.pushing, at: r.at, t: r.t });
      else f('fail', `${seq[i]} to ${seq[i + 1]}: ${what(r.a)} runs into ${what(r.b)} ${pct}`, 'lamina.sequence', { from: seq[i], to: seq[i + 1], parts: [r.a, r.b], at: r.at, t: r.t });
    }
    for (const s of Object.keys(states)) {
      const r = reached[s] ? { v: reached[s], over: [], pushed: Object.fromEntries(Object.keys(follows).map((n) => [n, Math.abs((reached[s][n] || 0) - (state(s)[n] || 0))])) } : solve(state(s)), { v, over, pushed } = r;
      solved[s] = v; note(v);
      if (s === 'rest') continue;
      const hits = clashes(shapesAt(v));
      for (const n of over) f('fail', `${s}: ${n} would have to give past its limit to clear ${follows[n].by.join(' and ')}`, 'lamina.follow', { state: s, joint: n });
      for (const h of hits) f('fail', `${s}: ${what(h.a)} runs into ${what(h.b)}`, 'lamina.collide', { state: s, parts: [h.a, h.b], at: h.at });
      if (!hits.length && !over.length) f('pass', `${s}: nothing runs into anything${Object.keys(follows).some((n) => pushed[n] > slack) ? ` (${Object.keys(follows).filter((n) => pushed[n] > slack).map((n) => `${n} pushed ${+pushed[n].toFixed(2)}${joints[n].turning ? '°' : ' mm'} by what it meets`).join(', ')})` : ''}`, 'lamina.collide', { state: s });
    }
  
    mark('sequence');
    // ---- holds: a latch. Pushing back towards rest jams on the catch, or runs into it ----
    for (const [s, list] of Object.entries(spec.holds || {})) for (const [jn, by] of list) {
      if (!joints[jn] || !parts[by]) throw new Error(`holds in ${s}: no joint "${jn}" or part "${by}"`);
      if (seq.includes(s) && !reached[s]) { f('info', `${s}: the sequence doesn't reach it, so whether ${by} holds isn't checked`, 'lamina.holds', { state: s, joint: jn, catch: by }); continue; }
      const v = solved[s] ?? solve(state(s)).v, q = v[jn] || 0, back = Math.sign(q) * Math.max(gap * 2, Math.abs(q) * 0.1);
      // The follower that is the catch (or carries it): how far it must move to let go is found by moving it along its give
      const fn = Object.keys(follows).find((x) => carries[x].has(by) || joints[x].to === by), unit = fn && joints[fn].turning ? '°' : ' mm';
      const grips = [];
      // A catch that bites presses into what it holds as it's moved to let go (its face leaning back): what it holds is
      // cammed back first, out of it, then pushed towards rest from there
      const cammed = (vals) => {
        const out = { ...vals }, mine = carries[jn], sgn = Math.sign(q) || -1, touching = (x) => { const sh = shapesAt(x); return [...mine].some((a) => collide(sh[a], sh[by], slack)); };
        for (let k = 0; k < 80 && touching(out); k++) out[jn] += sgn * gap / 4;
        return out;
      };
      const holding = (vals0) => { const vals = fn && vals0[fn] ? cammed(vals0) : vals0, r = walk(vals, { ...vals, [jn]: (vals[jn] ?? q) - back }, { record: false, friction: mu.hold }); grips.push(r?.kind === 'jam' ? r.grip : walkRatio > 0 ? 1 / walkRatio : null); return !!r && (r.kind === 'jam' || r.kind === 'over' || (r.kind === 'hit' && [r.a, r.b].some((x) => carries[jn].has(x)) && [r.a, r.b].some((x) => x === by || (fn && carries[fn].has(x))))); }; // held: it jams, or what it moves runs into the catch
      const held = holding(v), grip = grips[0]; // the least friction it holds at: 0 when it holds whatever the friction
      let lets = null;
      if (held && fn) {
        const g = follows[fn].give ?? 1, most = Math.min(limitOf(fn, g), follows[fn].most ?? Infinity), reach = Number.isFinite(most) ? most : gap * 100;
        if (!holding({ ...v, [fn]: g * reach })) { let lo = 0, hi = reach; for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (holding({ ...v, [fn]: g * mid })) lo = mid; else hi = mid; } lets = hi; }
      }
      const tight = lets != null && lets < gap; // a catch that lets go within a print gap holds by luck
      f(held && !tight ? 'pass' : 'fail', `${s}: ${held ? `${by} holds ${joints[jn].to} against the ${jn} flexure ${grip > 0 ? `at any friction over ${+grip.toFixed(2)} (checked at ${mu.hold})` : 'whatever the friction'}${lets != null ? `, and lets go once ${fn} moves ${+lets.toFixed(2)}${unit}${tight ? `: less than the ${gap} mm gap, too shallow to trust` : ''}` : fn ? `, and ${fn} can't move far enough to let go` : ''}` : `nothing holds ${joints[jn].to}: pushed ${+Math.abs(back).toFixed(2)} back towards rest it passes ${by}${grip ? `, pushing it aside: it would take a friction over ${+grip.toFixed(2)} to hold (checked at ${mu.hold}); tilt the catch so the load presses it in` : ''}`}`, 'lamina.holds', { state: s, joint: jn, catch: by, ...(lets != null ? { release: lets } : {}) });
    }
  
    strainAndStops();
      return { findings: findings.slice(start), reached, solved, used: Object.fromEntries(Object.entries(used).map(([k, u]) => [k, { most: u.most, signs: [...u.signs] }])), reachedLast };
    });
    findings.splice(start); findings.push(...kept.findings);
    for (const k of Object.keys(reached)) delete reached[k]; Object.assign(reached, kept.reached);
    for (const k of Object.keys(solved)) delete solved[k]; Object.assign(solved, kept.solved);
    for (const k of Object.keys(used)) delete used[k]; for (const [k, u] of Object.entries(kept.used)) used[k] = { most: u.most, signs: new Set(u.signs) };
    reachedLast = kept.reachedLast;
  } else for (const s of Object.keys(states)) solved[s] = state(s);

  mark('holds');
  // ---- energy and forces ----
  // (a slider whose force isn't its stiffness times its travel gives its own: a constant-force linkage, whose stiffness
  // is its leaf's, torsional; a contact-aided leaf, two rates)
  const ownForce = (j) => !j.turning && (j.model?.torsional || j.model?.second != null) && typeof j.model.force === 'function' && typeof j.model.energy === 'function';
  const energy = {};
  for (const [s, v] of Object.entries(solved)) {
    let e = 0;
    for (const [jn, q] of Object.entries(v)) { // a model's turning stiffness is a radian's; your own pivot's is a degree's
      const j = joints[jn]; if (!j?.stiffness) continue;
      // (a model that isn't a linear spring along its own motion gives its own energy: a constant-force slider's
      // stiffness is its leaf's, torsional, and its force along x comes from the linkage)
      if (ownForce(j)) { const u = j.model.energy(Math.abs(q)); if (Number.isFinite(u)) { e += u; continue; } }
      e += j.turning ? (j.stiffness * (j.model ? rad(q) : q) * rad(q)) / 2 : (j.stiffness * q * q) / 2;
    }
    energy[s] = e / 1000; // N·mm to J
  }
  const forces = Object.entries(joints).filter(([n]) => used[n]?.most).map(([n, j]) => {
    const q = used[n].most;
    const along = ownForce(j) ? Math.abs(j.model.force(Math.abs(q))) : NaN; // (its own force along its motion)
    return j.turning ? `${n} ${Math.abs(j.stiffness * (j.model ? rad(q) : q)).toFixed(1)} N·mm at ${+Math.abs(q).toFixed(1)}°` : `${n} ${(Number.isFinite(along) ? along : Math.abs(j.stiffness * q)).toFixed(2)} N at ${+Math.abs(q).toFixed(2)} mm`;
  });
  const most = Object.entries(energy).sort((x, y) => y[1] - x[1])[0], joules = (e) => (e < 0.01 ? `${(e * 1000).toFixed(1)} mJ` : `${e.toFixed(3)} J`);
  if (most && most[1] > 0) f('info', `the most stored is ${joules(most[1])}, in ${most[0]}${forces.length ? `; at their most: ${forces.join(', ')}` : ''}`, 'lamina.energy', { energy });

  mark('energy');
  // ---- the mechanism as it would behave: its flexures as beams bending as far as they bend, its bodies touching, a
  // hand driving, holding and letting go (physics.mjs). The force each step takes, where a latch lets go, whether a
  // catch holds when let go of, the strain all the way, and the shapes as they bend ----
  let sim = null, physicsInputs = null;
  const handMost = (typeof spec.physics === 'object' && spec.physics.force) || 50; // N: the most a hand pulls or pushes
  if (spec.physics !== false && seq.length) {
    const o = typeof spec.physics === 'object' ? spec.physics : {};
    const loose = Object.fromEntries(Object.entries(spec.free || {}).map(([n, l]) => [n, { shape: all(l.shape), mass: l.mass }]));
    const seen = spec.fixtures ? { ...parts, ground: { ...parts.ground, shape: union([parts.ground.shape, all(spec.fixtures)]) } } : parts; // fixtures: fixed, in the physics, not in the print
    const m = { parts: seen, joints, material, height, gap, states, sequence: seq, holds: spec.holds, loose, grips: spec.grips, ...(spec.fire ? { fire: spec.fire } : {}) };
    // (the solve is the slow stage, kept between builds by what it's made from; the system it ran on is made afresh)
    physicsInputs = { m, o };
    const S = systemOf(m), run = await stage('physics', physicsInputs, () => { const { sys, centre, beamOf, ...rest } = simulate({ ...m, kinematic: places }, { ...o, system: S }); return rest; });
    sim = run.skipped ? run : { ...run, sys: S.sys, centre: S.centre, beamOf: S.beamOf };
    if (sim.skipped) { f('info', `${sim.skipped.join(', ')}: no centreline to solve as beams (a notch, a cartwheel, a shape of your own), so how it behaves comes from the kinematic model only`, 'lamina.physics'); sim = null; }
  }
  if (sim) {
    const unitOf = (jn) => (joints[jn].turning ? '°' : ' mm');
    for (const tr of sim.transitions) {
      for (const c of tr.curve) {
        const peak = Math.max(...c.points.map(([, F]) => Math.abs(F))), travel = Math.abs(c.points.at(-1)[0]);
        f(peak <= handMost ? 'info' : 'fail', `${tr.from} to ${tr.to}: driving ${c.joint} ${+travel.toFixed(2)} mm takes up to ${peak.toFixed(2)} N${peak <= handMost ? '' : `, more than a hand's ${handMost} N: it jams`}`, 'lamina.force', { from: tr.from, to: tr.to, joint: c.joint, peak, curve: c.points });
      }
      const seen = new Set();
      for (const ev of tr.events) {
        if (seen.has(ev.body)) continue;
        seen.add(ev.body);
        const by = ev.hand.map((h) => `${h.joint} moved ${+Math.abs(h.travel).toFixed(2)} mm under ${Math.abs(h.force).toFixed(2)} N`).join(', ');
        f('info', `${tr.from} to ${tr.to}: ${ev.body} is let go ${Math.round(ev.t * 100)}% of the way${by ? `, with ${by}` : ''}, and jumps ${ev.jump.toFixed(1)} mm`, 'lamina.release', { from: tr.from, to: tr.to, body: ev.body, t: ev.t, hand: ev.hand });
      }
      // Back to rest at the end of the sequence: does everything come home?
      if (tr.to === 'rest' && seq.at(-1) === 'rest' && tr === sim.transitions.at(-1)) {
        const away = Object.keys(sim.sys.body).filter((b) => !sim.sys.body[b].fixed).map((b) => { const d = sim.sys.body[b].dof; return [b, Math.hypot(tr.end[d], tr.end[d + 1])]; }).filter(([, x]) => x > gap);
        f(away.length ? 'fail' : 'pass', away.length ? `back at rest, ${away.map(([b, x]) => `${b} is ${x.toFixed(2)} mm from where it started`).join(', ')}: it doesn't come home` : 'back at rest, everything is where it started', 'lamina.home', { away });
      }
      // Into a state a catch holds: let go of, does it stay?
      for (const [jn, by] of spec.holds?.[tr.to] || []) {
        const b = joints[jn].to, d = sim.sys.body[b].dof, now = Math.hypot(tr.end[d], tr.end[d + 1]), T = places(state(tr.to))[b], c = sim.centre[b];
        const meant = Math.hypot(T[0] * c[0] + T[1] * c[1] + T[2] - c[0], T[3] * c[0] + T[4] * c[1] + T[5] - c[1]), kept = meant > 0 ? now / meant : 1;
        f(kept > 0.75 ? 'pass' : 'fail', `${tr.to}: let go of, ${b} ${kept > 0.75 ? `stays on ${by}, ${now.toFixed(2)} mm from rest${tr.holding?.[jn] != null ? `, which takes ${tr.holding[jn].toFixed(1)} N` : ''} (beams and contact, ${sim.friction ? `friction ${sim.friction}` : 'no friction'})` : `doesn't stay: it runs back to ${now.toFixed(2)} mm from rest, past ${by}`}`, 'lamina.held', { state: tr.to, joint: jn, kept });
        // The bite: which way the load on the catch pushes it, against the way it moves to let go. Leaning into the catch
        // (pressed in), it holds by its shape; square, or leaning out, only friction holds it, and a printed face is
        // slicker than any figure and a little twist walks it off. The normal force alone, so friction can't flatter it
        const fn = Object.keys(follows).find((x) => carries[x].has(by) || joints[x].to === by), last = sim.frames.filter((fr) => fr.from === tr.from && fr.to === tr.to).at(-1);
        const touches = fn ? (last?.forces || []).filter((x) => x.kind === 'contact' && ((carries[fn].has(x.on) && x.by === b) || (x.on === b && carries[fn].has(x.by)))) : [];
        if (touches.length && kept > 0.75) {
          // every contact's normal force on the catch, against how that point moves as the catch lets go: the work they
          // do on it letting go, over the most they could (sin of the lean, summed over the contacts)
          const v = solved[tr.to] ?? solve(state(tr.to)).v, g = follows[fn].give ?? 1, small = joints[fn].turning ? 0.5 : 0.05;
          let work = 0, most = 0, total = 0;
          for (const t of touches) {
            const sgn = carries[fn].has(t.on) ? 1 : -1, F = [sgn * (t.force[0] - t.friction[0]), sgn * (t.force[1] - t.friction[1])], r = pointStep(joints[fn].to, v, { ...v, [fn]: (v[fn] || 0) + g * small }, t.at);
            work += F[0] * r[0] + F[1] * r[1]; most += Math.hypot(...F) * Math.hypot(...r); total += Math.hypot(...F);
          }
          if (most > 1e-12) {
            const bite = deg(Math.asin(Math.max(-1, Math.min(1, -work / most)))), least = spec.check?.bite ?? 5, at = touches.sort((x, y) => Math.hypot(...y.force) - Math.hypot(...x.force))[0].at;
            f(bite >= least ? 'pass' : 'fail', `${tr.to}: the load on ${by} (${total.toFixed(1)} N, near (${at.map((x) => x.toFixed(1)).join(', ')})) ${bite >= 0 ? `presses it ${bite.toFixed(1)}° into the catch` : `pushes it ${(-bite).toFixed(1)}° towards letting go`}${bite >= least ? '' : `: under the ${least}° a printed catch needs, it holds by friction (or its own spring) alone, and slips. Lean the hooked face back so the pull draws ${by} into it, and let the finger lift it out`}`, 'lamina.bite', { state: tr.to, joint: jn, catch: by, bite, at });
          }
        }
      }
    }
    // Requirements on the force curves: [{ step: 'from>to', joint, peak: [least, most], click: least share it drops after
    // the peak, end: [least, most] }], in N: what a key's feel or a latch's push must be
    for (const req of spec.requires || []) {
      const [from, to] = req.step.split('>'), tr = sim.transitions.find((x) => x.from === from && x.to === to), c = tr?.curve.find((x) => !req.joint || x.joint === req.joint);
      if (!c) { f('fail', `${req.step}: no driven ${req.joint || 'joint'} to measure`, 'lamina.requires', { step: req.step }); continue; }
      // The click: the deepest fall from a peak before the force climbs back over it; the peak is that one (the tactile
      // bump), or the highest when nothing falls
      const F = c.points.map(([, x]) => Math.abs(x)), end = F.at(-1);
      let drop = 0, top = Math.max(...F);
      F.forEach((x, i) => { if (!(x > 0)) return; let low = x; for (let k = i + 1; k < F.length && F[k] <= x; k++) low = Math.min(low, F[k]); const d = (x - low) / x; if (d > drop) { drop = d; if (d > 0.05) top = x; } });
      const within = (x, [lo, hi]) => x >= lo - 1e-9 && x <= hi + 1e-9, said = [];
      if (req.peak) said.push([within(top, req.peak), `peaks at ${top.toFixed(2)} N${drop > 0.05 ? ' (its click)' : ''} (wanted ${req.peak[0]} to ${req.peak[1]})`]);
      if (req.click != null) said.push([drop >= req.click, `falls ${Math.round(drop * 100)}% after it (a click wants ${Math.round(req.click * 100)}% or more)`]);
      if (req.end) said.push([within(end, req.end), `ends at ${end.toFixed(2)} N (wanted ${req.end[0]} to ${req.end[1]})`]);
      f(said.every(([ok]) => ok) ? 'pass' : 'fail', `${req.step}: ${c.joint} ${said.map(([, t]) => t).join(', ')}`, 'lamina.requires', { step: req.step, joint: c.joint, peak: top, drop, end });
    }
    if (!kinematic) { // how far the physics moved each joint, as the kinematic model counts it
      for (const [jn, j] of Object.entries(joints)) {
        const d = sim.sys.body[j.to].dof;
        for (const fr of sim.frames) {
          const [dx, dy, phi] = [fr.q[d], fr.q[d + 1], fr.q[d + 2]], m = j.motion;
          const q = m.axis ? dx * m.axis[0] + dy * m.axis[1] : j.leafy ? Math.sin(phi) * m.leaf : deg(phi);
          if (Math.abs(q) > (j.turning ? 0.5 : gap)) note({ [jn]: q }); // a twitch isn't a travel
        }
      }
      strainAndStops();
    }
    // Tripped: pulling the trigger let the catch go. How far and how hard the finger pulled, against what the catch held
    if (sim.trip) {
      const t = sim.trip, h = t.hand[0], held = sim.transitions.find((x) => x.to === t.from)?.holding, most = held ? Math.max(...Object.values(held)) : null;
      if (h) f('info', `${t.from} to ${t.to}: pulling ${h.joint} ${+Math.abs(h.travel).toFixed(2)} mm, at up to ${h.force.toFixed(2)} N, lets ${t.body} go${most ? `: the catch held ${most.toFixed(1)} N, ${(h.force / most).toFixed(2)} of it on the finger` : ''}${sim.friction ? ` (friction ${sim.friction})` : ' (no friction)'}`, 'lamina.trip', { ...t, held: most });
    }
    // Firing: let go from a state, step through time
    if (spec.fire) {
      const fr = sim.fire;
      if (!fr) f('fail', `fire: the sequence never reaches ${spec.fire.from}`, 'lamina.fire');
      else if (fr.pressed > 0.01 * fr.stored) f('fail', `fire: at ${spec.fire.from}, something is already pressed into something (${(fr.pressed * 1000).toFixed(1)} mJ of it, against ${(fr.stored * 1000).toFixed(1)} mJ in the springs): put ${spec.fire.disc} clear of where the pusher is drawn to`, 'lamina.fire', { pressed: fr.pressed });
      else {
        const quick = Object.entries(fr.speeds).filter(([b]) => b !== spec.fire.disc).sort((a, b) => b[1] - a[1])[0];
        const ex = fr.exit, share = ex && fr.stored > 0 ? ex.energy / fr.stored : 0;
        const least = spec.fire.least ?? 0.25, weak = ex && share < least; // (the disc must get a fair share of what the spring stored: the rest is a thud)
        const rest = ex && weak ? Object.entries(ex.kinetic || {}).filter(([, e]) => e > 0.01 * fr.stored).sort((a, b) => b[1] - a[1]).map(([b, e]) => `${b} still moving with ${(e * 1000).toFixed(1)} mJ`) : [];
        f(ex ? (spec.fire.most != null && ex.energy > spec.fire.most ? 'fail' : weak ? 'fail' : 'info') : 'fail', ex && weak
          ? `fired from ${spec.fire.from}: ${spec.fire.disc} leaves at ${ex.speed.toFixed(1)} m/s with ${(ex.energy * 1000).toFixed(1)} mJ, ${Math.round(share * 100)}% of the ${(fr.stored * 1000).toFixed(1)} mJ stored, under the ${Math.round(least * 100)}% it should get. As it leaves, ${[...rest, ex.spring > 0.01 * fr.stored ? `${(ex.spring * 1000).toFixed(1)} mJ still in the springs` : null].filter(Boolean).join(', ') || 'the rest has gone into what the pusher hit'}: lighten what moves with the disc, let the springs bring it to rest rather than a stop, keep the disc on the nose to the end of the stroke`
          : ex
          ? `fired from ${spec.fire.from}${sim.trip ? ' (from the moment the trigger lets go)' : ''}: ${quick ? `${quick[0]} reaches ${quick[1].toFixed(1)} m/s; ` : ''}${spec.fire.disc} leaves at ${ex.speed.toFixed(1)} m/s after ${(ex.t * 1000).toFixed(1)} ms, with ${(ex.energy * 1000).toFixed(1)} mJ: ${Math.round(share * 100)}% of the ${(fr.stored * 1000).toFixed(1)} mJ stored${spec.fire.most != null ? (ex.energy > spec.fire.most ? `, over the ${spec.fire.most * 1000} mJ allowed` : `, within the ${spec.fire.most * 1000} mJ allowed`) : ''}`
          : `fired from ${spec.fire.from}: ${spec.fire.disc} never leaves`, 'lamina.fire', { speeds: fr.speeds, exit: ex, stored: fr.stored });
      }
    }
    for (const [jn, e] of Object.entries(sim.strain)) f(e <= material.strainLimit ? 'pass' : 'fail', `${jn}: bending as far as it bends through the sequence, it sees up to ${(e * 100).toFixed(2)}% strain (large-deflection beams), ${e <= material.strainLimit ? 'within' : 'over'} the limit of ${(material.strainLimit * 100).toFixed(2)}%`, 'lamina.beams', { joint: jn, strain: e });
  }

  mark('physics');
  // ---- bridges: the frame printed over a moving part on the top layers (a barrel's roof over a stem, so it can't lift
  // out of its channel). Every body that passes under one is cut down by the bridge and a gap, along all of it that
  // ever passes under; the bridge spans no wider than the printer bridges, and stands on the frame both sides ----
  const layer = printer?.layer ?? 0.2, bridgeMost = printer?.bridge ?? 5;
  // (a bridge may belong to a moving body rather than the frame, `body`: a strap from it over or under another, to a post
  // of its own on the far side, a clevis; it moves with that body, and what passes it is cut back where it ever passes.
  // The frame may have straps too, `strap`: from the frame to a post of its own standing in a slot in what slides, over
  // it and under it, cut back the same way: a gap all round, flat under the upper, and over the lower a ceiling
  // slanting in from the walls at 45° (not arched along the travel as over a floor, which a long travel would stand
  // taller than the print)
  const bridges = [spec.bridges || []].flat().map((b) => ({ shape: all(b.shape), depth: b.depth ?? layer * 6, gap: b.gap ?? layer * 3, bottom: b.side === 'bottom', owner: b.body ?? 'ground', strap: !!b.body || !!b.strap }));
  for (const br of bridges) if (!parts[br.owner] || parts[br.owner].kind === 'flexure') throw new Error(`a bridge's body "${br.owner}" is not the ground or a body`);
  const arches = []; // a floor strip's: the parts passing over it arched up at 45°, which prints without support
  const guidesHeld = []; // what guides hold across the plane
  const cuts = [];
  if (bridges.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    bridges.forEach((br, i) => {
      const own = br.owner, onBody = own !== 'ground', mine = parts[own].shape, whose = onBody ? own : 'the frame';
      const name = br.strap ? `${onBody ? `${own}'s` : "the frame's"} ${br.bottom ? 'lower' : 'upper'} strap` : br.bottom ? `floor ${i + 1}` : `bridge ${i + 1}`, left = height - br.depth - br.gap;
      // (what it crosses: off its own; a body's strap rests on what it passes over, a support gap up, so only open air is spanned)
      const under = subtract(br.shape, onBody ? union(Object.values(parts).map((x) => x.shape)) : mine);
      if (empty(subtract(br.shape, mine))) { f('warn', `${name} has nothing to cross: it's all on ${whose}`, 'lamina.bridge'); return; }
      if (!br.bottom) { // (a floor stands on the bed: it spans nothing)
        const wide = !empty(under) && !empty(shrink(under, bridgeMost / 2 + 0.01, 'Round'));
        f(wide ? 'fail' : 'pass', `${name} spans ${wide ? 'more than' : 'no more than'} the ${bridgeMost} mm the printer bridges`, 'lamina.bridge', { bridge: i });
      }
      const feet = pieces(intersect(br.shape, mine));
      const need = br.bottom && !br.strap ? 1 : 2; // (a floor is printed on the bed: a ledge off the frame on one side is held; a bridge must stand on both, and a strap joins its body, or the frame, to its post)
      f(feet >= need ? 'pass' : 'fail', `${name} stands on ${whose} ${feet >= 2 ? 'on both sides' : feet ? (br.bottom ? 'on one side, a ledge on the bed' : 'on one side only: it would droop') : br.bottom ? 'nowhere: it would come loose' : 'nowhere: it would print in mid-air'}`, 'lamina.bridge', { bridge: i });
      for (const [n, p] of Object.entries(parts)) {
        if (p.kind === 'flexure' && area(intersect(br.shape, p.shape)) > AREA) f('fail', `${name} is over the ${n} flexure: a bridge goes over what slides, not what bends`, 'lamina.bridge', { bridge: i, joint: n });
        if (n === own || (p.kind !== 'body' && !(onBody && n === 'ground'))) continue;
        // all of it that ever passes under, where it is at rest, and for a strap a gap round it in the plane too: a
        // strap narrower than what it passes would otherwise print touching the walls left either side of it (a frame's
        // floor or bridge needs none: what passes is arched or cut clear of it, and a wider arch would stand taller)
        const swept = union(poses.map((P) => moved(mul(inverse(P[n]), P[own]), br.shape)));
        const pocket = br.strap ? grow(swept, br.gap) : swept, cut = intersect(p.shape, pocket);
        if (empty(cut)) continue;
        if (br.strap && br.bottom) { // (a lower strap: what passes over it is cut back, a gap over it, and prints on it a support gap up, as a pin's ring does on its floor)
          const top = br.depth + br.gap;
          cuts.push({ shape: cut, from: 0, to: top, body: n, gap: br.gap, bottom: true, ...(onBody ? { owner: own } : {}) });
          // Its ceiling isn't flat: either side of the slot that would be a ledge hanging in the air over the strap,
          // each layer a string drooping onto it. From the pocket's walls it slants in at 45°, a layer in for each
          // layer up (a hip roof, no taller than the pocket is wide), so every layer stands on the one below
          let rise = 0;
          for (let k = 0; ; k++) {
            const s = intersect(p.shape, shrink(pocket, (k + 1) * layer));
            if (empty(s)) break;
            cuts.push({ shape: s, from: top + k * layer, to: top + (k + 1) * layer });
            rise = (k + 1) * layer;
          }
          f(height - top >= 2 * layer * 5 ? 'pass' : 'fail', `${name}: ${n} passes over it, cut up to ${top.toFixed(2)} mm there, its ceiling slanting in at 45° from the walls to ${(top + rise).toFixed(2)} mm`, 'lamina.bridge', { bridge: i, body: n, left, rise });
          continue;
        }
        if (!br.bottom) {
          cuts.push({ shape: cut, from: left, to: height, body: n, gap: br.gap, ...(onBody ? { owner: own } : {}) });
          f(left >= 2 * layer * 5 ? 'pass' : 'fail', `${name}: ${n} passes under it, cut down to ${left.toFixed(2)} mm there (the bridge ${br.depth.toFixed(2)} mm, a gap of ${br.gap.toFixed(2)} mm over it)`, 'lamina.bridge', { bridge: i, body: n, left });
          continue;
        }
        // Over a floor: the part's underside arched up over all of it that ever passes over, the arch's flanks at 45°
        // along the way it moves (so each layer overhangs the one below by no more than it rises), high enough over
        // the whole stretch
        const T = poses.reduce((a, P) => { const d = Math.hypot(P[n][2], P[n][5]); return d > a.d ? { d, u: [P[n][2] / d, P[n][5] / d] } : a; }, { d: 0, u: [1, 0] });
        const turned = poses.some((P) => Math.abs(Math.atan2(P[n][3], P[n][0])) > rad(1));
        if (turned) { f('fail', `${name}: ${n} turns as it passes over it: a floor's arch is for what slides`, 'lamina.bridge', { bridge: i, body: n }); continue; }
        const u = T.u, along = cut.flat().map(([x, y]) => x * u[0] + y * u[1]), lo = Math.min(...along), hi = Math.max(...along), clear = br.depth + br.gap;
        const apex = clear + (hi - lo) / 2;
        arches.push({ body: n, shape: intersect(p.shape, grow(cut, clear + 0.5)), u, lo: lo - clear, hi: hi + clear, apex, gap: br.gap });
        f(height - apex >= 2 ? 'pass' : 'fail', `${name}: ${n} passes over it, its underside arched up to ${apex.toFixed(2)} mm at 45° (${clear.toFixed(2)} mm clear over the floor all along), leaving ${(height - apex).toFixed(2)} mm above`, 'lamina.bridge', { bridge: i, body: n, apex });
      }
    });
  }

  mark('bridges');
  // ---- guides: where a body slides through a strip of the frame, a ridge on its sides with 45° flanks, centred on
  // the print's height, runs in a matching groove in the frame's wall (a tortoise's shell in its socket), so it can't
  // lift or tip out of the plane. Both are drawn out from the same faces by the same amount at each height, so the gap
  // between them is the gap in the plane; each flank overhangs at 45° and prints without support ----
  const guides = [spec.guides || []].flat().map((x) => ({ body: x.body, shape: all(x.shape), depth: x.depth ?? Math.min(1.5, height / 4) }));
  const layers = []; // slabs added to and cut from the print: { from, to, add?, cut? }
  if (guides.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    guides.forEach((gd, i) => {
      const n = gd.body, body = parts[n]?.shape;
      if (!body || parts[n].kind !== 'body') { f('fail', `guide ${i + 1}: no body "${n}" to guide`, 'lamina.guide'); return; }
      const mine = intersect(body, union(poses.map((P) => moved(inverse(P[n]), gd.shape)))); // all of the body that ever passes through the strip, at rest
      if (empty(mine)) { f('fail', `guide ${i + 1}: ${n} never passes through it`, 'lamina.guide'); return; }
      const sweptAll = (a) => union(poses.map((P) => moved(P[n], a)));
      const away = (a) => subtract(a, body); // (what's drawn out from the body's faces, not the body)
      // A slab a layer: on the printer's layers, so each layer steps out (or in) by no more than a layer, 45°
      for (let k = Math.floor((height / 2 - gd.depth) / layer); k * layer < height / 2 + gd.depth; k++) {
        const z0 = k * layer, z1 = z0 + layer, v = Math.max(0, gd.depth - Math.abs((z0 + z1) / 2 - height / 2));
        if (v < 0.01) continue;
        const ridge = intersect(away(grow(body, v)), grow(mine, v)); // the body's sides there, drawn out by v
        const groove = intersect(parts.ground.shape, grow(sweptAll(ridge), gap * 1.05 + 0.02)); // the frame cut back to clear the ridge wherever it goes (not only in the strip: the ridge runs on past it)
        layers.push({ from: z0, to: z1, add: ridge }, { from: z0, to: z1, cut: groove });
      }
      const span = box(mine);
      f('pass', `guide ${i + 1}: ${n} runs in it for ${(span.hi[0] - span.lo[0]).toFixed(1)} mm with a ${gd.depth.toFixed(2)} mm ridge in a groove, flanks at 45°: held across the plane`, 'lamina.guide', { guide: i, body: n });
      guidesHeld.push({ body: n, shape: mine });
    });
  }

  mark('guides');
  // ---- pins: each post stands on a floor of its own body (`under`, from the bed up `base`) that runs under the body
  // it carries, and is capped at the top by a cone flaring out at 45° over the hole's rim (prints without support).
  // The carried body is cut back from the floor, a lift over it, wherever it ever passes over, and from the cap a lift
  // under it: it breaks free with a twist, and can't lift off the post ----
  const pinWork = [];
  if (pinsOf.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    for (const P of pinsOf) {
      const post = ring(P.at, P.r), mine = subtract(parts[P.from].shape, grow(post, 0.01));
      const joined = P.under && area(intersect(P.under, grow(post, 0.05))) > AREA && area(intersect(P.under, mine)) > AREA;
      f(joined ? 'pass' : 'fail', `${P.joint}: its pin (${(2 * P.r).toFixed(1)} mm, ${P.c.toFixed(2)} mm round it) ${joined ? `stands on a floor ${P.base.toFixed(2)} mm thick that joins it to ${P.from} under ${P.to}` : `isn't joined to ${P.from}: give it a floor (pin.under) from the post to ${P.from}, under ${P.to}`}`, 'lamina.pin', { joint: P.joint });
      if (P.c < (printer?.fit ?? gap) - 1e-9) f('warn', `${P.joint}: ${P.c} mm round the pin is under the printer's fit: it may print onto the post`, 'lamina.pin', { joint: P.joint });
      const left = height - P.base - 2 * P.lift - P.lip;
      f(left >= height / 2 ? 'pass' : 'fail', `${P.joint}: ${P.to} turns on it ${left.toFixed(2)} mm tall (the floor and the cap take the rest)`, 'lamina.pin', { joint: P.joint, left });
      const floorCut = P.under ? intersect(parts[P.to].shape, union(poses.map((T) => moved(mul(inverse(T[P.to]), T[P.from]), P.under)))) : [];
      pinWork.push({ at: P.at, r: P.r, c: P.c, lip: P.lip, lift: P.lift, base: P.base, under: P.under ? subtract(P.under, parts.ground.shape) : [], floorCut });
    }
  }

  mark('pins');
  // ---- the print, everything at rest, and frames along the sequence for an animation ----
  const extrude = (shapes) => solidOf(union(Object.values(shapes)), height);
  let solid = bridges.length || layers.length || pinWork.length ? solidWith(union(Object.values(parts).map((p) => p.shape)), height, cuts, bridges.map((b) => (b.bottom ? { shape: b.shape, from: 0, to: b.depth } : { shape: b.shape, from: height - b.depth, to: height })), arches, layers, pinWork) : extrude(Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, p.shape])));
  if (spec.finish) solid = spec.finish(solid);
  const outline = (v) => Object.fromEntries(Object.entries(shapesAt(v)).map(([n, g]) => [n, g.map((o) => o.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]))]));
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = reached[seq[i]] ?? state(seq[i]), said = state(seq[i]), b = { ...state(seq[i + 1]) };
    for (const k of Object.keys(b)) if (said[k] === b[k] && a[k] != null) b[k] = a[k];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])], active = new Set(keys.filter((x) => Math.abs((a[x] || 0) - (b[x] || 0)) > 1e-9)); // followers solved per frame
    for (let k = 0; k < FRAMES; k++) { const t = k / FRAMES, v = solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t])), active).v; frames.push({ from: seq[i], to: seq[i + 1], t, v, parts: outline(v) }); }
  }
  if (seq.length) frames.push({ from: seq[seq.length - 1], to: seq[seq.length - 1], t: 0, v: solved[seq[seq.length - 1]], parts: outline(solved[seq[seq.length - 1]]) });
  if (sim) { // the frames as the beams solved them: each body where it went, each flexure bent along its centreline
    const still = shapeOf(sim.sys, new Float64Array(sim.sys.dofs));
    const poseT = (n, q) => { if (parts[n].kind === 'ground') return I; const d = sim.sys.body[n].dof, c = sim.centre[n], cs = Math.cos(q[d + 2]), sn = Math.sin(q[d + 2]); return [cs, -sn, c[0] + q[d] - cs * c[0] + sn * c[1], sn, cs, c[1] + q[d + 1] - sn * c[0] - cs * c[1]]; };
    const round3 = (a) => a.map((o) => o.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]));
    // How far a frame's bodies are from where they're meant to be (the kinematic model): a flood's first pass, solved
    // without a frame, lets a body tip in its play, and its flexures fling about with it
    const offPlan = (fr) => {
      const a = reached[fr.from] ?? state(fr.from), b = state(fr.to), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const at = places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * fr.t]))).v);
      return Math.max(0, ...Object.keys(parts).filter((n) => parts[n].kind === 'body').map((n) => Math.max(...corners(n).map((c) => Math.hypot(...apply(poseT(n, fr.q), c).map((x, k) => x - apply(at[n], c)[k]))))));
    };
    const physical = sim.frames.filter((fr, i, all) => fr.t === 0 || i % 2 === 0 || i === all.length - 1).map((fr) => ({ from: fr.from, to: fr.to, t: fr.t, off: offPlan(fr), forces: fr.forces, energy: fr.energy, strain: fr.strain, parts: Object.fromEntries(Object.entries(parts).map(([n, p]) => {
      if (p.kind !== 'flexure') return [n, round3(moved(poseT(n, fr.q), p.shape))];
      const j = joints[n], lines = Object.keys(sim.beamOf).filter((b) => sim.beamOf[b] === n).map((b) => ({ rest: still.lines[b], now: fr.shape.lines[b], turn: fr.shape.turns[b], from: poseT(j.from, fr.q), to: poseT(j.to, fr.q) }));
      return [n, round3(bend(p.shape, lines))];
    })) }));
    if (sim.fire) for (const fr of sim.fire.frames) physical.push({ from: `${spec.fire.from}, fired`, to: `${spec.fire.from}, fired`, t: fr.t, label: `fired, ${(fr.t * 1000).toFixed(1)} ms`, forces: fr.forces, energy: fr.energy, strain: fr.strain, speeds: sim.fire.speeds, parts: {
      ...Object.fromEntries(Object.entries(parts).map(([n, p]) => {
        if (p.kind !== 'flexure') return [n, round3(moved(poseT(n, fr.q), p.shape))];
        const j = joints[n], sh = shapeOf(sim.sys, Float64Array.from(fr.q)), lines = Object.keys(sim.beamOf).filter((b) => sim.beamOf[b] === n).map((b) => ({ rest: still.lines[b], now: sh.lines[b], turn: sh.turns[b], from: poseT(j.from, fr.q), to: poseT(j.to, fr.q) }));
        return [n, round3(bend(p.shape, lines))];
      })),
      ...Object.fromEntries(Object.keys(spec.free || {}).map((n) => { const d = sim.sys.body[n].dof, c = sim.centre[n], q = fr.q, cs = Math.cos(q[d + 2]), sn = Math.sin(q[d + 2]); return [n, round3(moved([cs, -sn, c[0] + q[d] - cs * c[0] + sn * c[1], sn, cs, c[1] + q[d + 1] - sn * c[0] - cs * c[1]], all(spec.free[n].shape)))]; })),
    } });
    // The kinematic frames' flexures as they really bend: every body held where it's meant to be, the beams solved
    // between them (the kinematic model only smears each flexure from its root to its tip: a folded spring isn't bent
    // like that, and its room cut from that shape is the wrong room). Each solve starts from the last, in smaller steps
    // where it doesn't settle
    let last = new Float64Array(sim.sys.dofs), lastHeld = null;
    const heldAt = (v) => { const at = places(v), held = new Map(); for (const [n, b] of Object.entries(sim.sys.body)) { if (b.fixed) continue; const M = at[n] ?? I, c = sim.centre[n], P = apply(M, c); held.set(b.dof, P[0] - c[0]); held.set(b.dof + 1, P[1] - c[1]); held.set(b.dof + 2, Math.atan2(M[3], M[0])); } return held; };
    const bentAt = (v) => {
      const target = heldAt(v), from = lastHeld ?? new Map([...target.keys()].map((d) => [d, 0]));
      let r = equilibrium(sim.sys, { held: target, start: last, iterations: 80 });
      for (let k = 2; !r.converged && k <= 16; k *= 2) { let q = last; for (let i = 1; i <= k; i++) q = equilibrium(sim.sys, { held: new Map([...target].map(([d, x]) => [d, from.get(d) + (x - from.get(d)) * (i / k)])), start: q, iterations: 80 }).q; r = equilibrium(sim.sys, { held: target, start: q, iterations: 80 }); }
      last = r.q; lastHeld = target;
      const sh = shapeOf(sim.sys, r.q);
      return { converged: r.converged, parts: Object.fromEntries(Object.entries(parts).filter(([, p]) => p.kind === 'flexure').map(([n, p]) => { const j = joints[n], lines = Object.keys(sim.beamOf).filter((b) => sim.beamOf[b] === n).map((b) => ({ rest: still.lines[b], now: sh.lines[b], turn: sh.turns[b], from: poseT(j.from, r.q), to: poseT(j.to, r.q) })); return [n, round3(bend(p.shape, lines))]; })) };
    };
    let unsettled = 0;
    for (const fr of frames) { if (!fr.v) continue; const b = bentAt(fr.v); if (!b.converged) unsettled++; Object.assign(fr.parts, b.parts); }
    if (unsettled) f('warn', `${unsettled} of the ${frames.length} planned frames' flexures didn't settle in the beam solver: their room may be wrong there`, 'lamina.room');
    planned = [...frames]; // (the kinematic frames: where the bodies are meant to go, the flexures bent between them)
    frames.length = 0;
    frames.push(...physical);

    mark('print and frames');
    // ---- room: in every frame, planned or as the physics moved it (the shot too), nothing that moves runs into the
    // frame deeper than half the gap (a flexure where it's anchored aside): a frame that fills a spring's room stops it ----
    if (!empty(parts.ground.shape)) {
      const G = parts.ground.shape, deep = gap / 2, worst = {};
      const own = Object.fromEntries(Object.entries(parts).filter(([n, p]) => p.kind === 'flexure' && joints[n].from === 'ground').map(([n, p]) => [n, grow(intersect(p.shape, G), Math.max(gap * 2, 0.5))])); // (where a flexure grows from the frame, and a little round it)
      for (const fr of [...planned, ...physical]) for (const [n, o] of Object.entries(fr.parts)) {
        if (n === 'ground' || (!parts[n] && !spec.free?.[n]) || empty(o)) continue;
        let hit = intersect(o, G);
        if (own[n]) hit = subtract(hit, own[n]);
        if (empty(shrink(hit, deep))) continue;
        const a = area(hit);
        if (!worst[n] || a > worst[n].a) worst[n] = { a, fr, at: box(hit) };
      }
      for (const [n, w] of Object.entries(worst)) f('fail', `${what(n)} runs into the frame${w.fr.label ? ` (${w.fr.label})` : ` going from ${w.fr.from} to ${w.fr.to}`}, ${w.a.toFixed(1)} mm² of it at worst, near (${((w.at.lo[0] + w.at.hi[0]) / 2).toFixed(1)}, ${((w.at.lo[1] + w.at.hi[1]) / 2).toFixed(1)}): the frame is in its room, so it can't move there`, 'lamina.room', { part: n, from: w.fr.from, to: w.fr.to, t: w.fr.t, area: w.a, at: w.at });
      if (!Object.keys(worst).length) f('pass', `in all ${planned.length + physical.length} frames, planned and as the physics moved them, nothing runs into the frame`, 'lamina.room');
    }

    mark('room');
    // ---- carried: a loose part lying in the plane (a disc) falls out of it unless something holds it across the plane
    // on both faces, a roof (a bridge) over it and a floor under it, all the way it goes while it's in the frame: its
    // middle over what holds it each side (else it tips off the edge), loaded and through the shot ----
    if (spec.free && !empty(parts.ground.shape)) {
      const hullOf = (pts) => { const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = []; for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), q) <= 0) hi.pop(); hi.push(q); } return [...lo.slice(0, -1), ...hi.slice(0, -1)]; };
      const within = (h, [x, y]) => h.length >= 3 && h.every((a, i) => { const b = h[(i + 1) % h.length]; return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9; });
      const faces = { over: union(bridges.filter((b) => !b.bottom && b.owner === 'ground').map((b) => b.shape)), under: union(bridges.filter((b) => b.bottom && b.owner === 'ground').map((b) => b.shape)) }, G = box(parts.ground.shape);
      for (const n of Object.keys(spec.free)) {
        const along = [{ label: 'loaded', shape: all(spec.free[n].shape) }, ...physical.filter((fr) => fr.parts[n] && fr.label).map((fr) => ({ label: fr.label, shape: fr.parts[n] }))];
        const lost = {};
        for (const fr of along) {
          const { lo, hi } = box(fr.shape), mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
          if (mid[0] < G.lo[0] || mid[0] > G.hi[0] || mid[1] < G.lo[1] || mid[1] > G.hi[1]) break; // (out of the frame: gone)
          for (const [side, F] of Object.entries(faces)) { if (lost[side]) continue; const o = intersect(fr.shape, F); if (empty(o) || !within(hullOf(o.flat()), mid)) lost[side] = { label: fr.label, mid }; }
        }
        for (const [side, w] of Object.entries(lost)) f('fail', `${n} isn't held ${side === 'over' ? 'from above' : 'from below'} ${w.label === 'loaded' ? 'where it is loaded' : `(${w.label})`}, at (${w.mid.map((x) => x.toFixed(1)).join(', ')}): ${side === 'over' ? 'nothing over' : 'nothing under'} its middle, so it falls out of the plane. ${side === 'over' ? 'Bridge over' : 'Floor under'} its way, from where it's loaded to where it leaves`, 'lamina.carried', { part: n, side, at: w.mid, frame: w.label });
        if (!Object.keys(lost).length) f('pass', `${n} is held over and under all the way it goes in the frame`, 'lamina.carried', { part: n });
      }
    }

    mark('carried');
    // ---- the frame under the mechanism's own forces: at the end of each step, what the flexures pull on the frame
    // with (from the beams), the frame an elastic plate as tall as the print, held where a hand holds it (`grip`, or
    // its back quarter); every clearance to what moves then checked on the frame as it bends. A frame that closes
    // onto what moves (prongs either side of a channel pulled together) fails ----
    // (a stage kept between builds, by the mechanism in the plane, the physics it ran, the frame's own bridges and where
    // it's held: a strap or a check after it doesn't start it again)
    const frameStart = findings.length, frameKept = spec.check?.frame !== false && !empty(parts.ground.shape) ? await stage('frame', { spec: kinematicSpec, physics: physicsInputs, bridges: bridges.filter((x) => x.owner === 'ground').map((x) => x.shape), grip: spec.grip }, async () => {
      const G = parts.ground.shape, { lo, hi } = box(G), side = Math.max(0.25, Math.sqrt(((hi[0] - lo[0]) * (hi[1] - lo[1])) / FE_MOST));
      const nx = Math.ceil((hi[0] - lo[0]) / side) + 2, ny = Math.ceil((hi[1] - lo[1]) / side) + 2, x0 = lo[0] - side, y0 = lo[1] - side;
      const g = feaGrid({ nx, ny, h: side }), fill = coverage(G, g, x0, y0);
      // Bridges and floors are frame too, as thick as they are: a roof over a channel ties its two sides
      for (const br of bridges.filter((x) => x.owner === 'ground')) { const c = coverage(br.shape, g, x0, y0); for (let e = 0; e < g.cells; e++) fill[e] = Math.min(1, fill[e] + c[e] * (1 - Math.min(1, fill[e])) * (br.depth / height)); }
      const grip = spec.grip ? all(spec.grip) : [[[lo[0] - 1, lo[1] - 1], [lo[0] + (hi[0] - lo[0]) / 4, lo[1] - 1], [lo[0] + (hi[0] - lo[0]) / 4, hi[1] + 1], [lo[0] - 1, hi[1] + 1]]];
      const held = coverage(grip, g, x0, y0), fixed = new Uint8Array(g.dofs);
      for (let e = 0; e < g.cells; e++) if (fill[e] >= 0.5 && held[e] > 0.5) { const i = e % nx, j = (e - i) / nx; for (const n of [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)]) fixed[2 * n] = fixed[2 * n + 1] = 1; }
      const cellAt = ([x, y]) => { const i = Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / side))), j = Math.max(0, Math.min(ny - 1, Math.floor((y - y0) / side))); return { i, j, s: (x - x0) / side - i, t: (y - y0) / side - j }; };
      // A load where the flexure meets the frame's face lands in a cell that's mostly empty: put it on the nearest solid one
      const solidAt = (p) => { const c = cellAt(p); let best = null; for (let r = 0; r < 12 && !best; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { const i = c.i + di, j = c.j + dj; if (i < 0 || j < 0 || i >= nx || j >= ny || fill[j * nx + i] < 0.5) continue; const d = Math.hypot(di, dj); if (!best || d < best.d) best = { d, p: [x0 + (i + 0.5) * side, y0 + (j + 0.5) * side] }; } return best ? best.p : p; };
      const cornersOf = ({ i, j, s, t }) => [[g.node(i, j), (1 - s) * (1 - t), [i, j]], [g.node(i + 1, j), s * (1 - t), [i + 1, j]], [g.node(i + 1, j + 1), s * t, [i + 1, j + 1]], [g.node(i, j + 1), (1 - s) * t, [i, j + 1]]];
      let worst = null, most = 0, shown = null, unheld = null; // shown: the frame where it bends most, its outline and how far each point moves
      for (const tr of sim.transitions) {
        const q = Float64Array.from(tr.end), f = new Float64Array(g.dofs);
        // Each load to the corners of its cell: the force shared as the point's place in the cell, the moment as a couple
        for (const L of fixedLoads(sim.sys, q)) {
          const P = solidAt(L.at), c = cellAt(P), cs = cornersOf(c), r = cs.map(([, , [i, j]]) => [x0 + i * side - P[0], y0 + j * side - P[1]]), rr = r.reduce((a, [rx, ry]) => a + rx * rx + ry * ry, 0) || 1;
          cs.forEach(([n, w], k) => { f[2 * n] += L.force[0] * w - (L.moment * r[k][1]) / rr; f[2 * n + 1] += L.force[1] * w + (L.moment * r[k][0]) / rr; });
        }
        if (!f.some((x) => Math.abs(x) > 1e-12)) continue;
        let u;
        try { ({ u: [u] } = feaAnalyse({ grid: g, density: Float64Array.from(fill, (x) => Math.min(1, x)), material: { E: material.E, nu: 0.38 }, thickness: height, fixed, loads: [f] })); } catch (e) {
          if (e.code !== 'fea.unheld') throw e;
          // The frame, as it's held here, can slide or turn under its springs' loads: nothing to measure its bending against
          unheld ||= tr; // (said once, after the last transition)
          continue;
        }
        const at = (p) => { let dx = 0, dy = 0; for (const [n, w] of cornersOf(cellAt(p))) { dx += w * u[2 * n]; dy += w * u[2 * n + 1]; } return [dx, dy]; };
        // The frame's outline, finely, moved as it bends
        let here = 0;
        const fine = split(G, side), moves = fine.map((o) => o.map((p) => { const d = at(p); here = Math.max(here, Math.hypot(...d)); return d; }));
        const bent = union([fine.map((o, k) => o.map((p, i) => [p[0] + moves[k][i][0], p[1] + moves[k][i][1]]))]);
        if (here > most) { most = here; shown = { state: tr.to, outline: fine, moves }; }
        const fr = frames.filter((x) => x.from === tr.from && x.to === tr.to).sort((a, b) => b.t - a.t)[0];
        // What moves where it is then, and what's loose (a disc, waiting in its channel) where it was put
        // (a loose part lies in the frame and goes where the frame round it goes: moved as the frame at its edge moves on
        // average, so what's checked is its slot closing on it, not the frame bending past where it was put)
        const carried = (shape) => { const pts = shape.flat(), d = pts.reduce((a, p) => { const m = at(p); return [a[0] + m[0] / pts.length, a[1] + m[1] / pts.length]; }, [0, 0]); return shape.map((l) => l.map(([x, y]) => [x + d[0], y + d[1]])); };
        const there = { ...Object.fromEntries(Object.entries(fr?.parts || {}).filter(([n]) => n !== 'ground' && !spec.free?.[n])), ...Object.fromEntries(Object.entries(spec.free || {}).map(([n, x]) => [n, all(x.shape)])) };
        const thereBent = Object.fromEntries(Object.entries(there).map(([n, sh]) => [n, spec.free?.[n] ? carried(sh) : sh]));
        for (const [n, shape] of Object.entries(there)) {
          const moved = thereBent[n], before = gapBetween(G, shape, gap * 2) ?? gap * 2, after = area(intersect(bent, moved)) > AREA ? 0 : (gapBetween(bent, moved, gap * 2) ?? gap * 2);
          const closed = before - after;
          if (closed > 0.01 && (!worst || after < worst.after)) worst = { part: n, state: tr.to, before, after, closed, at: box(intersect(grow(bent, gap), shape)) };
        }
      }
      if (unheld) f('warn', `the frame isn't held where its springs load it (${unheld.from} to ${unheld.to}), so how it bends can't be worked out: say where it is held with grip (by default, its back quarter)`, 'lamina.frame', { from: unheld.from, to: unheld.to });
      if (most > 0) {
        const w = worst, where = w && !empty(w.at) && Number.isFinite(w.at.lo[0]) ? ` near (${((w.at.lo[0] + w.at.hi[0]) / 2).toFixed(1)}, ${((w.at.lo[1] + w.at.hi[1]) / 2).toFixed(1)})` : '';
        const level = !w ? 'pass' : w.after <= 0.02 ? 'fail' : w.after < gap / 2 ? 'warn' : 'pass';
        f(level, w
          ? `the frame bends up to ${most.toFixed(2)} mm under the flexures' pull; at ${w.state} it closes ${w.closed.toFixed(2)} mm towards ${what(w.part)}${where}, leaving ${w.after.toFixed(2)} mm${level === 'fail' ? ': it pinches it. Stiffen the frame there, or tie it across' : ''}`
          : `the frame bends up to ${most.toFixed(2)} mm under the flexures' pull, closing no gap to what moves`, 'lamina.frame', { most, ...(w || {}), shown });
      }
      return { findings: findings.slice(frameStart) };
    }) : null;
    if (frameKept) { findings.splice(frameStart); findings.push(...frameKept.findings); }

    mark('frame');
    // ---- across the plane: each moving body pushed across the print at its farthest point from what holds it, by a
    // tenth of the hand's pull (a finger a little off the plane); a lamina's flexures are stiff bending across it but
    // soft twisting, so a body on long thin arms tips out of the plane. Bridges over it hold it from lifting, floors
    // under it from dropping ----
    if (spec.check?.across !== false) {
      const peak = Math.max(0, ...sim.transitions.flatMap((tr) => tr.curve.flatMap((c) => c.points.map(([, F]) => Math.abs(F)))));
      const push = spec.check?.side ?? Math.max(1, peak * Math.sin(rad(15))); // (a finger pulling 15° off the plane)
      // A pin holds what turns on it to what it's on, both ways (the cap over it, the floor under it), at the ring
      // where they overlap, after the lift between them
      const pinHolds = pinsOf.flatMap((P) => Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3, R = P.r + P.c + P.lip / 2; return { body: P.to, ...(P.from === 'ground' ? {} : { to: P.from }), at: [P.at[0] + R * Math.cos(a), P.at[1] + R * Math.sin(a)], k: material.E * height, gap: P.lift }; }));
      for (const b of new Set(Object.values(joints).map((j) => j.to))) {
        if (!sim.sys.body[b] || sim.sys.body[b].fixed) continue;
        const ends = sim.sys.elements.flatMap((e) => [e.a, e.b]).filter((x) => x.body?.name === b).map((x) => [x.body.at[0] + x.o[0], x.body.at[1] + x.o[1]]);
        const c = ends.length ? [ends.reduce((a, p) => a + p[0], 0) / ends.length, ends.reduce((a, p) => a + p[1], 0) / ends.length] : centroid(parts[b].shape);
        const pts = parts[b].shape.flat(), P = pts.reduce((a, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) > Math.hypot(a[0] - c[0], a[1] - c[1]) ? p : a), pts[0]);
        // (each with its play: a guide's ridge moves the print gap in its groove before it bears, a bridge or a floor its
        // own gap; held rigidly, a printed part looked held where it wobbles)
        const holds = (top) => [...cuts.filter((x) => x.body === b && top === !x.bottom).flatMap((x) => x.shape.flat().map((at) => ({ at, gap: x.gap ?? gap, ...(x.owner ? { to: x.owner } : {}) }))), ...arches.filter((x) => x.body === b && !top).flatMap((x) => x.shape.flat().map((at) => ({ at, gap: x.gap ?? gap }))), ...guidesHeld.filter((x) => x.body === b).flatMap((x) => x.shape.flat().map((at) => ({ at, gap })))].map((h) => ({ body: b, k: 1e3, ...h }));
        const arms = new Set(Object.entries(joints).filter(([, j]) => j.to === b).map(([n]) => n)), beams = Object.keys(sim.beamOf).filter((x) => arms.has(sim.beamOf[x]));
        let worst = { most: 0, dir: '' };
        for (const [dir, sign] of [['up', 1], ['down', -1]]) {
          const r = outOfPlane(sim.sys, { loads: [{ body: b, at: P, force: sign * push }], springs: [...holds(sign > 0), ...pinHolds] });
          const body = Math.max(...pts.map((p) => Math.abs(r.lift(b, p)))), arm = Math.max(0, ...beams.map((x) => r.most(x))), most = Math.max(body, arm);
          if (most > worst.most) worst = { most, dir, arm: arm > body };
        }
        const level = worst.most > 1 ? 'fail' : worst.most > gap ? 'warn' : 'pass';
        f(level, `${b}: pushed ${push.toFixed(1)} N across the plane at (${P.map((x) => x.toFixed(1)).join(', ')}) (the hand's pull 15° off the plane), ${worst.arm ? 'the flexures holding it move' : 'it moves'} ${worst.most.toFixed(2)} mm out of the plane, its guides' play included${level === 'pass' ? '' : `: it flexes out of the plane, ${level === 'fail' ? 'far' : 'more than the print gap'}. Trap it across the plane (a guide or a bridge), or stiffen what holds it`}`, 'lamina.across', { body: b, most: worst.most, push, at: P });
      }
    }
  }
  mark('across');
  return {
    parts: { body: solid, ...(spec.loose || {}) },
    findings,
    energy,
    frames,
    planned: planned ?? frames,
    at: (s) => extrude(shapesAt(solve(state(s)).v)),
    outlines: (s) => outline(solve(state(s)).v),
    mechanism: { height, sequence: seq, states: Object.keys(states), limit: material.strainLimit, ...(sim ? { curves: sim.transitions.map((tr) => ({ from: tr.from, to: tr.to, curve: tr.curve, events: tr.events.map((e) => ({ body: e.body, t: e.t, jump: e.jump })), ...(tr.holding ? { holding: tr.holding } : {}) })), physical: true, friction: sim.friction, ...(sim.trip ? { trip: sim.trip } : {}), ...(sim.fire ? { shot: { from: spec.fire.from, disc: spec.fire.disc, exit: sim.fire.exit, stored: sim.fire.stored, speeds: sim.fire.speeds } } : {}) } : {}), joints: Object.fromEntries(Object.entries(joints).map(([n, j]) => [n, { from: j.from, to: j.to, kind: j.kind || 'own', ...(follows[n] ? { follows: follows[n].by } : {}) }])) },
  };
}


/**
 * A material for flexures from its rule set ({ modulus, strength }): the strain it may see is its strength over its
 * modulus, the strain where it starts to yield, over a safety factor. The ratio is the figure of merit for compliant
 * mechanisms (Howell): the higher it is, the further a flexure of a given size can bend. PLA's is about 1.5%,
 * PETG's 1.9%, nylon's higher still.
 * @param {{ modulus: number, strength: number, name?: string }} rules @param {{ safety?: number }} [o] (default 1.5)
 */
export function flexureMaterial({ modulus, strength, name, density }, { safety = 1.5 } = {}) {
  if (!(modulus > 0) || !(strength > 0)) throw new Error('a flexure material needs its modulus and strength (MPa)');
  const yieldStrain = strength / modulus;
  return { E: modulus, strength, yieldStrain, strainLimit: yieldStrain / safety, safety, ...(name ? { name } : {}), ...(density ? { density } : {}) }; // density g/cm³, for firing
}

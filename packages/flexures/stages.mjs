// Pivots and stages built from the simple flexures: the butterfly pivot (four blade pivots in series, their drift
// cancelling), the rolling-contact joint (two rollers held by crossed bands) and the three-axis stage (an XY stage
// carrying a cartwheel). Each is a shape and a model, as in core.mjs.
//
// Drawn flat like every flexure here: the plan in x and y, the print from z = 0 up to the width. Units: mm, N, MPa,
// radians in the models (degrees where a parameter says so).
import jscad from '@jscad/modeling';
import { beamProfile, need, xyStage, xyStageModel, cartwheel, cartwheelModel } from './core.mjs';
import { beamSystem } from './beams.mjs';
import { stepTo, n2, rad, sub, add, mul, unit } from './pivots.mjs';

const { polygon, circle } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { hull } = jscad.hulls;
const { extrudeLinear } = jscad.extrusions;
const { translate, rotateZ } = jscad.transforms;
const { measureVolume } = jscad.measurements;

const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
// An annular sector, r0 to r1, from angle a0 to a1 (radians), as one outline
function sector(r0, r1, a0, a1) {
  const n = Math.max(8, Math.ceil(((a1 - a0) * r1) / 0.4)), out = [], back = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push(polar(r1, a)); back.push(polar(r0, a)); }
  return polygon({ points: [...out, ...back.reverse()] }); // anticlockwise: out along the outer arc, back along the inner
}
// A beam's outline from a to b, its profile's half-thickness along it, running on `into` past both ends
function beamOutline(a, b, half, L, t, into, r = 0) {
  const u = unit(sub(b, a)), n = [-u[1], u[0]], m = 120, top = [], bottom = [], fine = r ? Array.from({ length: 33 }, (_, i) => (r * i) / 32) : [];
  const ss = [-into, ...[...new Set([...Array.from({ length: m + 1 }, (_, i) => (L * i) / m), ...fine, ...fine.map((x) => L - x)])].sort((x, y) => x - y), L + into];
  for (const s of ss) { const h = s < 0 || s > L ? t / 2 : half(s); const c = add(a, mul(u, s)); top.push(add(c, mul(n, h))); bottom.push(sub(c, mul(n, h))); }
  return polygon({ points: [...bottom, ...top.reverse()] });
}

// ---------- the butterfly pivot ----------
/**
 * @typedef {{ length: number, thickness: number, width: number, inner?: number, narrow?: number, wide?: number,
 *   turn?: number, block?: number, frame?: number, gap?: number, fillet?: number, arm?: number, hole?: number }} Butterfly
 *   length: each blade's (L); thickness, width: the blades' (t, and up z); inner: the blades' inner ends from the axis
 *   (a, default 0.4 L); narrow, wide: the two blade pairs' angles either side of the y axis, degrees (default 20 and
 *   45); turn: the most the output is drawn to turn either way, degrees, which sets the gaps (default 20); block: the
 *   base's and the output's depth (default 3 × thickness, at least the hole and 1.2 mm either side); frame: block 2's
 *   depth outside the base (default 3 × thickness, at least 3); gap: the least gap between parts at
 *   rest and at the drawn turn (default 0.4); fillet: the blades' rounds (default the thickness); arm: how far the
 *   output's arm reaches past the frame (default the length); hole: the base's two screw holes (default 3.4, an M3
 *   clearance hole, ISO 273 medium)
 */
function butterflyLayout(p, what) {
  need(what, p);
  const L = p.length, t = p.thickness, g1 = (p.narrow ?? 20) * rad, g2 = (p.wide ?? 45) * rad, turn = (p.turn ?? 20) * rad;
  const w = p.width, hole = p.hole ?? 3.4, B = p.block ?? Math.max(3 * t, hole + 2.4), F = p.frame ?? Math.max(3, 3 * t), gap = p.gap ?? 0.4, r = p.fillet ?? t, arm = p.arm ?? L;
  // the inner ends far enough out that the narrow and wide blades, with their rounds, are a gap apart where they meet block 1
  const a = p.inner ?? Math.max(0.4 * L, (t + 2 * r + gap) / Math.sin(g2 - g1) + 0.5);
  for (const [k, v] of [['inner', a], ['block', B], ['frame', F], ['gap', gap], ['arm', arm], ['hole', hole]]) if (!(typeof v === 'number' && v > 0 && Number.isFinite(v))) throw new Error(`${what}: ${k} is a size above 0 (got ${JSON.stringify(v)})`);
  if (!(r >= 0)) throw new Error(`${what}: fillet is 0 or more (got ${JSON.stringify(p.fillet)})`);
  if (!(g1 > 0 && g2 > g1 && g2 < (75 * Math.PI) / 180)) throw new Error(`${what}: narrow and wide are angles from the y axis with 0 < narrow < wide < 75 degrees (got ${p.narrow ?? 20} and ${p.wide ?? 45})`);
  if (!(turn > 0 && turn < Math.PI / 2)) throw new Error(`${what}: turn is the most the output turns either way, above 0 and under 90 degrees (got ${p.turn})`);
  if (B < hole + 2.4) throw new Error(`${what}: block (${B} mm) must be at least the hole (${hole} mm) and 1.2 mm either side of it`);
  const R = a + L, foot = t / 2 + r + 1; // a blade's end with its rounds, and a millimetre more
  // Between the narrow and the wide blades where both meet block 1 (the least gap between them, rounds included; the
  // two do not move against each other there)
  const between = a * Math.sin(g2 - g1) - t - 2 * r;
  if (between < gap) throw new Error(`${what}: the narrow and wide blades are ${n2(between)} mm apart where they meet block 1, under the gap (${gap} mm): a larger inner, or wide further from narrow`);
  const d1 = foot / a, d2 = foot / R, win = g2 - d2, half = (turn / 2) + gap / R; // block 2's window either side of y; the margin the base and the output need in it
  const sides = win - half;
  if (sides < g1 + d2) throw new Error(`${what}: the base and the output do not fit between the wide blades at the drawn turn (${n2(sides / rad, 1)}° either side, the narrow blades need ${n2((g1 + d2) / rad, 1)}°): wide further from narrow, or a smaller turn`);
  // Blocks 1 and 3 face each other across the x axis, their edges φ from it: at a radius ρ they are 2ρ sin φ apart,
  // less ρ θ/2 at the drawn turn, so they stop short of the axis where that is the gap
  const phi = Math.PI / 2 - g2 - d1, spread = 2 * Math.sin(phi) - turn / 2;
  if (!(spread > 0)) throw new Error(`${what}: the two inner blocks meet at the drawn turn: wide is too near 90 degrees for the turn (their edges are ${n2(phi / rad, 1)}° from the x axis)`);
  const ri = Math.max(a / 3, a - B, gap / spread + 0.5);
  if (a - ri < 1.5) throw new Error(`${what}: the inner blocks are ${n2(a - ri)} mm deep, under 1.5 mm: a larger inner`);
  const top = R + B + gap + 0.05 * L, Ro = top + F; // block 2's cap over the base (a twentieth of a blade's length more, for the drift)
  return { L, t, w, a, g1, g2, turn, hole, B, F, gap, r, arm, R, d1, d2, win, sides, ri, top, Ro, half: beamProfile({ length: L, thickness: t, fillet: r }, 'guided') };
}

// The blades, as [angle, from body, to body, inward?]: from the base the narrow pair inward to block 1, the wide pair
// out to block 2 (the frame round it all), the wide pair at the bottom in to block 3, the narrow pair out to the output
const bladesOf = (k) => [-1, 1].flatMap((s) => [[Math.PI / 2 + s * k.g1, 'base', 'b1', true], [Math.PI / 2 + s * k.g2, 'b1', 'b2', false], [-Math.PI / 2 + s * k.g2, 'b2', 'b3', true], [-Math.PI / 2 + s * k.g1, 'b3', 'output', false]]);

/**
 * A butterfly pivot (Henein, Spanoudakis, Droz, Myklebust and Onillon, "Flexure pivot for aerospace mechanisms",
 * ESMATS 2003): four blade pivots in series, every blade alike, all four turning about the same axis. Each pivot is a
 * pair of blades whose lines meet on the axis; the four share the turn, a quarter each, and they are laid out so the
 * drift of one pair runs against the next's, so the output turns about its axis with far less drift than one pair
 * would. Drawn here as: the base at the top (two screw holes), the narrow pair from it in to block 1 near the axis, the
 * wide pair from block 1 out to block 2 (a frame round it all, capped over the base, open at the bottom), the wide pair
 * at the bottom back in to block 3, and the narrow pair from block 3 out to the output, whose arm leaves through the
 * frame's opening along -y. The axis is the origin. Printed flat, one piece.
 * @param {Butterfly} p
 * @returns {object} a JSCAD geom3, z = 0 to the width
 */
export function butterflyPivot(p) {
  const k = butterflyLayout(p, 'butterflyPivot'), up = Math.PI / 2, down = -Math.PI / 2, parts = [];
  for (const [ang, , , inward] of bladesOf(k)) { const A = polar(k.a, ang), Bp = polar(k.R, ang); parts.push(inward ? beamOutline(Bp, A, k.half, k.L, k.t, 1) : beamOutline(A, Bp, k.half, k.L, k.t, 1)); }
  // blocks 1 and 3: arcs inside the inner ends, wide enough for the wide blades' feet
  parts.push(sector(k.ri, k.a, up - k.g2 - k.d1, up + k.g2 + k.d1), sector(k.ri, k.a, down - k.g2 - k.d1, down + k.g2 + k.d1));
  const flat = union(...parts);
  // the base: in block 2's window at the top, the turn's room either side; its holes along z
  const base = subtract(sector(k.R, k.R + k.B, up - k.sides, up + k.sides), ...[-1, 1].map((s) => circle({ radius: k.hole / 2, center: polar(k.R + k.B / 2, up + (s * k.sides) / 2), segments: 32 })));
  // the output: the same at the bottom, and its arm, a hull from the sector's outer edge to the arm's end (so the arm
  // meets it with no inside corner)
  // the output: the same at the bottom, and its arm, a hull from the middle of the sector's outer edge to the arm's
  // end, its sides at 45° (so the arm meets it with no square inside corner)
  const aw = Math.max(3, 2 * k.t), tip = k.Ro + k.arm, R1 = k.R + k.B, wide = Math.min((aw / 2 + k.Ro - R1) / R1, k.sides), edge = sector(R1 - 0.5, R1, down - wide, down + wide);
  const output = union(sector(k.R, R1, down - k.sides, down + k.sides), hull(edge, polygon({ points: [[-aw / 2, -tip], [aw / 2, -tip], [aw / 2, -tip + 0.5], [-aw / 2, -tip + 0.5]] })));
  // block 2: a ring from the blades' outer ends out to Ro, less a pocket round the base (its top corners round) and an
  // opening at the bottom for the output's arm
  const rc = Math.min(k.B / 2, 2), pr = k.win, cr = rc / (k.top - rc);
  const pocket = union(sector(k.R - 1, k.top - rc, up - pr, up + pr), sector(k.R - 1, k.top, up - pr + cr, up + pr - cr), ...[-1, 1].map((s) => circle({ radius: rc, center: polar(k.top - rc, up + s * (pr - cr)), segments: 32 })));
  const opening = polygon({ points: [[0, 0], polar(k.Ro + 2, down - pr), polar((k.Ro + 2) / Math.cos(pr), down), polar(k.Ro + 2, down + pr)] });
  const ring = subtract(circle({ radius: k.Ro, segments: 192 }), circle({ radius: k.R, segments: 192 }));
  const frame = subtract(extrudeLinear({ height: k.w }, ring), extrudeLinear({ height: k.w + 2 }, pocket), extrudeLinear({ height: k.w + 2 }, opening));
  return union(frame, extrudeLinear({ height: k.w }, union(flat, base, output)));
}

/**
 * The butterfly pivot as the beam solver's system: the blades along their rounded profiles, the four blocks rigid.
 * @param {Butterfly} p @param {number} E MPa
 * @param {{ rounds?: boolean }} [o] rounds: the blades' rounds in their thickness (default true)
 */
export function butterflyBeams(p, E, { rounds = true } = {}) {
  const k = butterflyLayout(p, 'butterflyBeams'), n = 16;
  const bodies = { base: { at: [0, 0], fixed: true }, b1: { at: [0, 0] }, b2: { at: [0, 0] }, b3: { at: [0, 0] }, output: { at: [0, 0] } };
  const beams = bladesOf(k).map(([ang, from, to, inward], i) => {
    const A = polar(k.a, ang), Bp = polar(k.R, ang), [s, e] = inward ? [Bp, A] : [A, Bp];
    return { name: `blade ${i + 1}`, path: Array.from({ length: n + 1 }, (_, j) => add(s, mul(sub(e, s), j / n))), thickness: Array.from({ length: n }, (_, j) => (rounds ? 2 * k.half(((j + 0.5) * k.L) / n) : k.t)), width: k.w, E, from, to };
  });
  return beamSystem({ bodies, beams, segments: 32 });
}

/**
 * What a butterfly pivot does. Each blade is a beam fixed at one block, its other end turned with the next block
 * through φ about the axis and so carried round by a φ: its moment at the inner end 4EI/L (1 + 1.5 a/L) φ, and the
 * torque it gives 4EI/L (1 + 3a/L + 3a²/L²) φ (as the cartwheel's spokes). A pair is twice that; four pairs in series,
 * a quarter. The strain is the inner end's, t/L (2 + 3a/L) at a quarter of the turn. The drift is the beam solver's,
 * on the drawn blades (rounds included), the output turned and left free to shift.
 * @param {Butterfly} p @param {{ E: number, strainLimit?: number, density?: number, name?: string }} m
 * @returns {{ stiffness: number, stage: number, strain: (angle: number) => number, angle: (strain: number) => number,
 *   travel: (strain: number) => number, stress: (angle: number) => number, drift: (angle: number) => number[],
 *   pair: (angle: number) => number[], grams: number | null, findings: object[], rests: string[] }} stiffness: N·mm a
 *   radian at the output; stage: one pair's; drift: where the output's axis has gone at a turn (radians), [x, y] mm;
 *   pair: the same for one pair of the same blades turned as far, to compare
 */
export function butterflyPivotModel(p, m) {
  const what = 'butterflyPivotModel', k = butterflyLayout(p, what);
  need(what, {}, m);
  const I = (k.w * k.t ** 3) / 12, q = k.a / k.L, stage = 2 * ((4 * m.E * I) / k.L) * (1 + 3 * q + 3 * q * q), stiffness = stage / 4;
  const per = (k.t / k.L) * (2 + 3 * q) / 4, strain = (th) => per * Math.abs(th), angle = (e) => e / per;
  const drift = (th) => { const sys = butterflyBeams(p, m.E), d = sys.body.output.dof, r = stepTo(sys, new Map([[d + 2, th]]), 8); return [r.q[d], r.q[d + 1]]; };
  const pair = (th) => {
    const sys = beamSystem({ bodies: { base: { at: [0, 0], fixed: true }, output: { at: [0, 0] } }, segments: 32, beams: [-1, 1].map((s) => { const ang = Math.PI / 2 + s * k.g1, A = polar(k.a, ang), Bp = polar(k.R, ang); return { name: `blade ${s}`, path: Array.from({ length: 17 }, (_, j) => add(Bp, mul(sub(A, Bp), j / 16))), thickness: Array.from({ length: 16 }, (_, j) => 2 * k.half(((j + 0.5) * k.L) / 16)), width: k.w, E: m.E, from: 'base', to: 'output' }; }) });
    const d = sys.body.output.dof, r = stepTo(sys, new Map([[d + 2, th]]), 8);
    return [r.q[d], r.q[d + 1]];
  };
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra });
  f('info', `${n2(stiffness, 1)} N·mm a radian at the output: four pairs in series, each ${n2(stage, 1)} (blades ${k.L} long, their inner ends ${n2(k.a)} mm from the axis)`, 'pivot.stiffness', { values: { stiffness, stage } });
  if (m.strainLimit > 0) {
    const at = strain(k.turn), lim = m.strainLimit;
    f(at <= lim ? 'pass' : 'fail', `at the drawn turn of ${n2(k.turn / rad, 1)}° the blades see ${n2(at * 100, 2)}%, ${at <= lim ? 'within' : 'over'} the limit of ${n2(lim * 100, 1)}%; the limit allows ${n2(angle(lim) / rad, 1)}° either way`, 'flexure.strain', { values: { strain: at, limit: lim, angle: angle(lim) } });
  }
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(butterflyPivot(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}, one piece`, 'pivot.mass', { values: { grams } }); }
  const rests = ['the stiffness and strain treat each blade as a straight beam of its least thickness, its rounds left out (they stiffen it a little); the drift is the beam solver\'s on the drawn blades, the blocks rigid'];
  return { stiffness, stage, strain, angle, travel: angle, stress: (th) => m.E * strain(th), drift, pair, grams, findings: out, rests };
}

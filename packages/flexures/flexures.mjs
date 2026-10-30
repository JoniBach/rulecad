// Compliant mechanisms for printed parts: flexures that move by bending. Each is a JSCAD shape and a model: its
// stiffness, the strain its material sees at a travel (so a rule can say whether it lasts), and the travel a strain
// allows. The models are beam theory and the pseudo-rigid-body model (Howell, Compliant Mechanisms, 2001; Smith,
// Flexures, 2000; Paros and Weisbord 1965 for the notch hinge), good while deflections are a few times the thickness.
//
// Every flexure is drawn flat: its length along x, it bends along y, and its width is its height off the bed (z). A
// flexure printed this way bends within its layers, where the filament's own strength is; one bending across the
// layers pulls them apart. Units: mm, N, MPa.
import jscad from '@jscad/modeling';

const { cuboid, cylinder } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { translate } = jscad.transforms;

/** @typedef {{ length: number, thickness: number, width: number }} Leaf a beam: along x, bending along y, width up z */
/** @typedef {{ E: number, strainLimit?: number }} Material Young's modulus (MPa), and the strain it may see (say 0.02 for 2%) */
/** @typedef {{ stiffness: number, strain: (travel: number) => number, travel: (strain: number) => number, stress: (travel: number) => number }} Model */

const block = (x, y, z, size) => cuboid({ center: [x, y, z], size });

/**
 * A leaf spring: a cantilever, fixed at x = 0, pushed along y at its tip. The commonest flexure, and the softest.
 * Stiffness E w t³ / 4L³ (3EI/L³); the strain at the root for a tip travel δ is 3tδ / 2L².
 * @param {Leaf} p
 * @returns {object} the shape, a JSCAD geom3
 */
export function leaf({ length, thickness, width }) {
  return block(length / 2, 0, width / 2, [length, thickness, width]);
}
/** @param {Leaf} p @param {Material} m @returns {Model} */
export function leafModel({ length: L, thickness: t, width: w }, { E }) {
  const stiffness = (E * w * t ** 3) / (4 * L ** 3), strain = (d) => (3 * t * d) / (2 * L * L);
  return { stiffness, strain, travel: (e) => (2 * L * L * e) / (3 * t), stress: (d) => E * strain(d) };
}

/**
 * A fixed-guided beam: fixed at one end, the other end moved along y without turning (held by a shuttle that keeps
 * it parallel). Four times as stiff as a leaf: E w t³ / L³ (12EI/L³); strain at either end 3tδ / L².
 * @param {Leaf} p
 */
export function fixedGuided({ length, thickness, width }) {
  return block(length / 2, 0, width / 2, [length, thickness, width]);
}
/** @param {Leaf} p @param {Material} m @returns {Model} */
export function fixedGuidedModel({ length: L, thickness: t, width: w }, { E }) {
  const stiffness = (E * w * t ** 3) / L ** 3, strain = (d) => (3 * t * d) / (L * L);
  return { stiffness, strain, travel: (e) => (L * L * e) / (3 * t), stress: (d) => E * strain(d) };
}

/**
 * A parallel guide: two fixed-guided leaves a gap apart, joined by a shuttle, so the shuttle moves along y and stays
 * parallel: a linear bearing with no parts. Stiffness 2 E w t³ / L³. The shuttle also drops a little toward the base
 * as it moves (the leaves' ends swing on arcs): about 3δ² / 5L (Howell), given as drop.
 * @param {Leaf & { gap: number, shuttle?: number, base?: number }} p gap: between the leaves; shuttle, base: the
 *   blocks' thickness along x (default 2 × thickness, at least 3 mm)
 */
export function parallelGuide({ length, thickness, width, gap, shuttle, base }) {
  const end = Math.max(3, 2 * thickness), s = shuttle ?? end, b = base ?? end, y = (gap + thickness) / 2;
  return union(
    block(-b / 2, 0, width / 2, [b, gap + 2 * thickness, width]),
    block(length / 2, y, width / 2, [length, thickness, width]), block(length / 2, -y, width / 2, [length, thickness, width]),
    block(length + s / 2, 0, width / 2, [s, gap + 2 * thickness, width]),
  );
}
/** @param {Leaf} p @param {Material} m @returns {Model & { drop: (travel: number) => number }} */
export function parallelGuideModel(p, m) {
  const one = fixedGuidedModel(p, m);
  return { ...one, stiffness: 2 * one.stiffness, drop: (d) => (3 * d * d) / (5 * p.length) };
}

/**
 * A serpentine spring: n fixed-guided leaves end to end, zigzagging along y, so a long spring fits a short space.
 * Each leaf takes 1/n of the travel: stiffness E w t³ / n L³, strain 3t(δ/n) / L². The leaves run along x, stacked
 * along y a pitch apart, joined at alternate ends.
 * @param {Leaf & { turns: number, pitch?: number }} p turns: how many leaves (2 or more); pitch: leaf to leaf along y
 *   (default 3 × thickness)
 */
export function serpentine({ length, thickness, width, turns, pitch }) {
  const step = pitch ?? 3 * thickness, joint = Math.max(1.5 * thickness, 1), parts = [];
  for (let i = 0; i < turns; i++) parts.push(block(length / 2, i * step, width / 2, [length, thickness, width]));
  for (let i = 0; i + 1 < turns; i++) parts.push(block(i % 2 ? joint / 2 : length - joint / 2, (i + 0.5) * step, width / 2, [joint, step + thickness, width]));
  return union(...parts);
}
/** @param {Leaf & { turns: number }} p @param {Material} m @returns {Model} */
export function serpentineModel({ length: L, thickness: t, width: w, turns: n }, { E }) {
  const stiffness = (E * w * t ** 3) / (n * L ** 3), strain = (d) => (3 * t * (d / n)) / (L * L);
  return { stiffness, strain, travel: (e) => (n * L * L * e) / (3 * t), stress: (d) => E * strain(d) };
}

/**
 * A notch hinge: a pivot that's a thin neck between two round notches. It turns about the neck, a little, with no
 * play. Rotational stiffness 2 E w t^(5/2) / 9π√R (Paros and Weisbord 1965, for a neck much thinner than the notch
 * radius); the nominal bending stress at an angle θ is 4 E θ √(t/R) / 3π, and the notch concentrates it by a factor
 * of about 1.2 on a well-rounded notch (Smith 2000).
 * @param {{ radius: number, neck: number, width: number, arms?: number }} p radius: of each notch; neck: the thinnest
 *   part, along y; width: up z; arms: the blocks either side, along x (default 4 × radius)
 */
export function notchHinge({ radius: R, neck: t, width, arms }) {
  const a = arms ?? 4 * R, total = 2 * a + 2 * R, h = t + 2 * R;
  const bar = block(total / 2, 0, width / 2, [total, h, width]);
  const notch = (y) => translate([a + R, y, width / 2], cylinder({ radius: R, height: width + 2, segments: 48 }));
  return subtract(bar, notch(t / 2 + R), notch(-t / 2 - R));
}
/**
 * @param {{ radius: number, neck: number, width: number }} p @param {Material & { concentration?: number }} m
 * @returns {{ stiffness: number, strain: (angle: number) => number, angle: (strain: number) => number, stress: (angle: number) => number }}
 *   stiffness in N·mm a radian; angles in radians
 */
export function notchHingeModel({ radius: R, neck: t, width: w }, { E, concentration = 1.2 }) {
  const stiffness = (2 * E * w * t ** 2.5) / (9 * Math.PI * Math.sqrt(R)), strain = (th) => (concentration * 4 * th * Math.sqrt(t / R)) / (3 * Math.PI);
  return { stiffness, strain, angle: (e) => (3 * Math.PI * e) / (concentration * 4 * Math.sqrt(t / R)), stress: (th) => E * strain(th) };
}

/**
 * A bistable beam: a shallow cosine arch clamped at both ends, which snaps to its mirror image when pushed at the
 * middle, and stays there: a switch, a latch, a sear. Two such beams side by side (as drawn: Qiu, Lang and Slocum
 * 2004), joined at the middle, so the middle can't twist on the way over, which is what makes it bistable at all.
 * It is bistable when the rise is more than 2.31 times the thickness (Qiu et al.); the second stable shape is the
 * first's mirror, about twice the rise away.
 * @param {{ length: number, rise: number, thickness: number, width: number, gap?: number, ends?: number }} p rise: the
 *   arch's height at the middle (h); gap: between the two beams (default 4 × thickness); ends: the clamped blocks
 *   either end along x (default 3 × thickness)
 */
export function bistable({ length: L, rise: h, thickness: t, width, gap, ends }) {
  const g = gap ?? 4 * t, e = ends ?? Math.max(3, 3 * t), n = 24, parts = [];
  // Each beam as short straight pieces along the cosine, each hull-free: a block turned to the local slope
  const y = (x) => (h / 2) * (1 - Math.cos((2 * Math.PI * x) / L));
  for (const off of [-g / 2 - t / 2, g / 2 + t / 2]) {
    for (let i = 0; i < n; i++) {
      const x0 = (i * L) / n, x1 = ((i + 1) * L) / n, ym = (y(x0) + y(x1)) / 2, angle = Math.atan2(y(x1) - y(x0), x1 - x0), len = Math.hypot(x1 - x0, y(x1) - y(x0)) + t * 0.6;
      parts.push(translate([(x0 + x1) / 2, ym + off, width / 2], jscad.transforms.rotateZ(angle, cuboid({ size: [len, t, width] }))));
    }
  }
  const bar = g + 2 * t + 2 * h;
  parts.push(block(-e / 2, 0, width / 2, [e, bar, width]), block(L + e / 2, 0, width / 2, [e, bar, width]));
  parts.push(block(L / 2, h, width / 2, [Math.max(2 * t, 2), g + 2 * t, width])); // the middle, joined: a shuttle to push
  return union(...parts);
}
/**
 * @param {{ length: number, rise: number, thickness: number, width: number }} p @param {Material} m
 * @returns {{ bistable: boolean, Q: number, stiffness: number, travel: number, strain: number, stress: number }}
 *   Q: rise over thickness (bistable past 2.31); stiffness: at the start of a push, both beams, as straight
 *   clamped beams (384EI/L³); travel: to the other stable shape (about 2 × rise); strain: the most the material sees
 *   on the way over, from the curvature reversing: 2π² h t / L²
 */
export function bistableModel({ length: L, rise: h, thickness: t, width: w }, { E }) {
  const I = (w * t ** 3) / 12, Q = h / t, strain = (2 * Math.PI * Math.PI * h * t) / (L * L);
  return { bistable: Q > 2.31, Q, stiffness: (384 * E * I) / L ** 3, travel: 2 * h, strain, stress: E * strain };
}

/**
 * A living hinge: a thin strip between two blocks that folds like a hinge. Printed flat, the strip's thickness lies
 * in the layer plane, so folding bends the filament rather than the layer bonds. Its strain at an angle is t θ / 2l
 * (a strip of length l bent through θ has curvature θ / l), so a longer strip folds further: 1 mm of 0.84 mm strip
 * reaches 2% strain at 2.7°, 3 mm at 8°. PLA won't fold far or often; TPU and polypropylene will.
 * @param {{ flex: number, thickness: number, width: number, arms?: number }} p flex: the strip's length along x (l);
 *   thickness: across the fold (t); width: up z; arms: the blocks either side along x (default 10)
 */
export function livingHinge({ flex: l, thickness: t, width, arms }) {
  const a = arms ?? 10, h = Math.max(4 * t, 3);
  return union(block(-a / 2, 0, width / 2, [a, h, width]), block(l / 2, 0, width / 2, [l, t, width]), block(l + a / 2, 0, width / 2, [a, h, width]));
}
/**
 * @param {{ flex: number, thickness: number, width: number }} p @param {Material} m
 * @returns {{ stiffness: number, strain: (angle: number) => number, angle: (strain: number) => number, stress: (angle: number) => number }}
 *   stiffness in N·mm a radian (EI / l); angles in radians
 */
export function livingHingeModel({ flex: l, thickness: t, width: w }, { E }) {
  const I = (w * t ** 3) / 12, strain = (th) => (t * th) / (2 * l);
  return { stiffness: (E * I) / l, strain, angle: (e) => (2 * l * e) / t, stress: (th) => E * strain(th) };
}

/**
 * A leaf spring bent for real: the elastica, Euler and Bernoulli's beam with its exact curvature, for a cantilever
 * pushed at the tip by a force that keeps its direction (Bisshopp and Drucker 1945). Beam theory holds while the
 * travel is a few times the thickness; past that the leaf curls, shortens along x, and stiffens. This integrates the
 * beam along its length (Runge-Kutta, shooting on the root's curvature) and gives the tip's travel and the strain at
 * the root, which is where it breaks.
 * @param {Leaf} p @param {Material} m
 * @param {{ force?: number, travel?: number }} load one of: the tip force (N), or the travel to reach (mm)
 * @returns {{ force: number, travel: number, shortening: number, angle: number, strain: number, stiffness: number, centreline: number[][] }}
 *   shortening: how much nearer the tip is along x; angle: the tip's turn, radians; stiffness: force over travel (secant);
 *   centreline: the bent leaf's middle line, [x, y] along it
 */
export function elastica({ length: L, thickness: t, width: w }, { E }, { force, travel } = {}) {
  const I = (w * t ** 3) / 12, n = 200, h = L / n;
  // The beam under a tip force P: θ' = κ, κ' = −(P / EI) cos θ (the moment falls as the tip's lever shortens),
  // θ(0) = 0 and κ(L) = 0 at the free end, found by shooting on κ(0)
  const bend = (P, k0) => {
    let th = 0, k = k0, x = 0, y = 0;
    const line = [[0, 0]], f = (th) => (-P / (E * I)) * Math.cos(th);
    for (let i = 0; i < n; i++) {
      const a1 = k, b1 = f(th), a2 = k + (h / 2) * b1, b2 = f(th + (h / 2) * a1), a3 = k + (h / 2) * b2, b3 = f(th + (h / 2) * a2), a4 = k + h * b3, b4 = f(th + h * a3);
      const thNext = th + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
      k += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
      x += (h / 2) * (Math.cos(th) + Math.cos(thNext)); y += (h / 2) * (Math.sin(th) + Math.sin(thNext)); th = thNext;
      line.push([x, y]);
    }
    return { k, th, x, y, line };
  };
  const solve = (P) => { // the root curvature that leaves the tip free of moment
    let lo = 0, hi = 2 * (P * L) / (E * I) + 1e-9;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (bend(P, mid).k > 0) hi = mid; else lo = mid; }
    const k0 = (lo + hi) / 2, r = bend(P, k0);
    return { force: P, travel: r.y, shortening: L - r.x, angle: r.th, strain: (t / 2) * k0, stiffness: r.y > 0 ? P / r.y : (E * w * t ** 3) / (4 * L ** 3), centreline: r.line };
  };
  if (force != null) return solve(force);
  // A travel: the force that reaches it, by bisection (the leaf can't travel its own length)
  if (!(travel > 0) || travel >= L) throw new Error(`a leaf ${L} mm long can't travel ${travel} mm: give a travel under its length, or a force`);
  let lo = 0, hi = (E * w * t ** 3) / (4 * L ** 3) * travel * 2;
  while (solve(hi).travel < travel) hi *= 2;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (solve(mid).travel < travel) lo = mid; else hi = mid; }
  return solve((lo + hi) / 2);
}

/**
 * A leaf spring drawn bent, from the elastica: for a picture of the spring at work, or a fit check at full travel.
 * @param {Leaf} p @param {Material} m @param {{ force?: number, travel?: number }} load
 * @returns {object} the shape, a JSCAD geom3
 */
export function leafFlexed(p, m, load) {
  const { centreline } = elastica(p, m, load), half = p.thickness / 2, left = [], right = [];
  for (let i = 0; i < centreline.length; i++) {
    const [x, y] = centreline[i], [px, py] = centreline[Math.max(0, i - 1)], [nx, ny] = centreline[Math.min(centreline.length - 1, i + 1)];
    const dx = nx - px, dy = ny - py, len = Math.hypot(dx, dy) || 1, ox = (-dy / len) * half, oy = (dx / len) * half;
    left.push([x + ox, y + oy]); right.push([x - ox, y - oy]);
  }
  return jscad.extrusions.extrudeLinear({ height: p.width }, jscad.primitives.polygon({ points: [...right, ...left.reverse()] }));
}

/**
 * A compound parallel guide: two parallel guides in series, the second folded back inside the first, so the shuttle
 * moves along y with no drop: each stage drops 3(δ/2)² / 5L, in opposite directions, and they cancel (Howell 2001;
 * Smith 2000). Half as stiff as one guide, E w t³ / L³, and each stage takes half the travel: strain 3t(δ/2) / L², so
 * twice a parallel guide's travel at a strain.
 * Drawn: the base is a U round the back, its two arms carrying the outer leaves out along x to an intermediate block,
 * which carries the inner leaves back along −x to the shuttle, between the base's arms with room to move. The shuttle
 * moves δ against the arms, and the inner leaves δ/2 against the outer, so clearance must cover the travel.
 * @param {Leaf & { gap: number, clearance?: number, shuttle?: number, base?: number }} p gap: between the inner
 *   leaves; clearance: between an inner leaf and its outer one, and the shuttle and the base (default gap / 2);
 *   shuttle, base: the blocks' thickness (default 2 × thickness, at least 3 mm)
 */
export function compoundGuide({ length, thickness: t, width, gap, clearance, shuttle, base }) {
  const end = Math.max(3, 2 * t), s = shuttle ?? end, b = base ?? end, c = clearance ?? gap / 2;
  const yi = gap / 2 + t / 2, yo = gap / 2 + t + c + t / 2, full = 2 * (gap / 2 + 2 * t + c + end);
  const leafAt = (y) => block(length / 2, y, width / 2, [length, t, width]);
  return union(
    leafAt(yi), leafAt(-yi), leafAt(yo), leafAt(-yo),
    block(-s / 2, 0, width / 2, [s, gap + 2 * t, width]), // the shuttle, on the inner leaves
    block(-(s + c + b) / 2, gap / 2 + 1.5 * t + c + end / 2, width / 2, [s + c + b, t + end, width]), block(-(s + c + b) / 2, -(gap / 2 + 1.5 * t + c + end / 2), width / 2, [s + c + b, t + end, width]), // the base's arms, from its back to the outer leaves
    block(-s - c - b / 2, 0, width / 2, [b, full, width]), // the base's back, behind the shuttle
    block(length + end / 2, 0, width / 2, [end, full, width]), // the intermediate block, joining all four leaves
  );
}
/** @param {Leaf} p @param {Material} m @returns {Model & { drop: (travel: number) => number }} */
export function compoundGuideModel(p, m) {
  const one = fixedGuidedModel(p, m);
  return { stiffness: one.stiffness, strain: (d) => one.strain(d / 2), travel: (e) => 2 * one.travel(e), stress: (d) => m.E * one.strain(d / 2), drop: () => 0 };
}

/**
 * A lamina-emergent torsion (LET) joint: a hinge cut into a flat sheet, turning about an axis that lies in the sheet
 * (Jacobsen, Chen, Howell and Magleby 2009). Two panels along x meet at the axis, along y at x = 0. An H of slots
 * leaves a torsion bar along y either side of a central slot, each joined to its panel by a bridge at the middle and
 * to the other bar by a bridge at each end. Turning the joint twists the four half-bars and bends the two end bridges:
 * two paths in parallel (top and bottom), each a half-bar, an end bridge and a half-bar in series, so the stiffness is
 * 2 / (2/k_t + 1/k_b), with k_t = GJ / L_t for a half-bar and k_b = EI / L_b for a bridge across the central slot.
 * Unlike the other flexures this one moves out of its plane: printed flat, the bars twist about an axis in the layer
 * plane and the bridges bend across the layers, so PLA cracks sooner here than in a flexure bending within its layers.
 * PETG, nylon or TPU; and a sheet several layers thick.
 * @param {{ width: number, thickness: number, bar: number, slot: number, bridge: number, panel?: number }} p width:
 *   the hinge's extent along y (W); thickness: the sheet, up z (h); bar: a torsion bar's width along x; slot: the
 *   slots' width; bridge: the bridges' width along y; panel: each panel's length along x (default width)
 */
export function letJoint({ width: W, thickness: h, bar: wt, slot: sl, bridge: wb, panel }) {
  const a = panel ?? W, c = sl / 2 + wt + sl, cut = (x, y, sx, sy) => block(x, y, h / 2, [sx, sy, h + 2]);
  const sheet = block(0, 0, h / 2, [2 * (a + c), W, h]), centre = cut(0, 0, sl, W - 2 * wb), len = (W - wb) / 2;
  const outer = [1, -1].flatMap((s) => [cut(s * (sl + wt), (W + wb) / 4, sl, len), cut(s * (sl + wt), -(W + wb) / 4, sl, len)]);
  return subtract(sheet, centre, ...outer);
}
/**
 * @param {{ width: number, thickness: number, bar: number, slot: number, bridge: number }} p
 * @param {Material & { nu?: number }} m nu: Poisson's ratio (default 0.35), for the shear modulus
 * @returns {{ stiffness: number, strain: (angle: number) => number, angle: (strain: number) => number, stress: (angle: number) => number, twist: (angle: number) => number, bend: (angle: number) => number }}
 *   stiffness in N·mm a radian; strain: the most the material sees, the bars' shear as an equivalent (von Mises) strain
 *   or the bridges' bending; twist: each half-bar's share of the angle; bend: each bridge's
 */
export function letJointModel({ width: W, thickness: h, bar: wt, slot: sl, bridge: wb }, { E, nu = 0.35 }) {
  const G = E / (2 * (1 + nu)), a = Math.max(wt, h), b = Math.min(wt, h);
  const J = a * b ** 3 * (1 / 3 - 0.21 * (b / a) * (1 - b ** 4 / (12 * a ** 4))); // a rectangle's torsion constant (Roark)
  const Lt = (W - 3 * wb) / 2, kt = (G * J) / Lt; // a half-bar: from the middle bridge to an end bridge
  const Ib = (wb * h ** 3) / 12, kb = (E * Ib) / sl; // an end bridge: across the central slot, bending about y
  const path = 1 / (2 / kt + 1 / kb), stiffness = 2 * path;
  const strain = (th) => { const T = path * th, tau = (T * (3 * a + 1.8 * b)) / (a * a * b * b); return Math.max((Math.sqrt(3) * tau) / E, (T * h) / (2 * E * Ib)); };
  return { stiffness, strain, angle: (e) => e / strain(1), stress: (th) => E * strain(th), twist: (th) => (path * th) / kt, bend: (th) => (path * th) / kb };
}

/**
 * A constant-force mechanism: a slider-crank whose coupler is a leaf (Howell, Midha and Murphy 1994; Howell 2001,
 * class 1A). The leaf is fixed to the slider and pinned to the crank, the crank pinned to ground on the slider's line.
 * Pushed in, the slider's force is there almost at once and then stays nearly flat, because the leaf bends further
 * as the crank's lever shortens: with the crank half the leaf's length and the rest angle a few degrees, within ±5%
 * from the first millimetre to about a quarter of the leaf's length. The feel of a trigger, or a gripper that holds the
 * same whatever its size. Modelled as a pseudo-rigid body (Howell): the leaf as a rigid link turning at a pivot
 * 0.85 of its length from the slider, with a torsional spring 0.85 × 2.65 EI / l.
 * Pins, since the crank turns too far for a flexure: a pin of filament through the bosses. Drawn at rest: the
 * coupler as a leaf along x from the slider block to a boss at its tip (the crank joint); the crank, from
 * constantForceCrank, as a bar with a boss at each end, to pin to the coupler and to the ground. The ground pin
 * sits a little beside the slider's line (the model's offset, r2 sin rest), so the leaf is straight at rest and the
 * crank already turned by the rest angle.
 * @param {{ leaf: number, thickness: number, width: number, crank?: number, rest?: number, pin?: number, boss?: number, slider?: number }} p
 *   leaf: its length (l); crank: pivot to pivot (default l / 2); rest: the crank's angle at rest, degrees (default 5);
 *   pin: the pin's diameter (default 1.75, filament); boss: a boss's radius (default 3); slider: the block's length
 *   along x (default 2 × thickness, at least 3)
 */
export function constantForce({ leaf: l, thickness: t, width, pin = 1.75, boss = 3, slider }) {
  const s = slider ?? Math.max(3, 2 * t), hole = cylinder({ radius: pin / 2 + 0.1, height: width + 2, center: [l, 0, width / 2], segments: 32 });
  return subtract(union(block(-s / 2, 0, width / 2, [s, 2 * boss, width]), block(l / 2, 0, width / 2, [l, t, width]), cylinder({ radius: boss, height: width, center: [l, 0, width / 2], segments: 48 })), hole);
}
/** The crank for constantForce: a bar with a boss and a pin hole at each end. @param {{ leaf: number, thickness: number, width: number, crank?: number, pin?: number, boss?: number }} p */
export function constantForceCrank({ leaf: l, thickness: t, width, crank, pin = 1.75, boss = 3 }) {
  const r = crank ?? l / 2, at = (x, radius) => cylinder({ radius, height: width + (radius < boss ? 2 : 0), center: [x, 0, width / 2], segments: radius < boss ? 32 : 48 });
  return subtract(union(block(r / 2, 0, width / 2, [r, Math.max(2 * t, boss), width]), at(0, boss), at(r, boss)), at(0, pin / 2 + 0.1), at(r, pin / 2 + 0.1));
}
/**
 * @param {{ leaf: number, thickness: number, width: number, crank?: number, rest?: number }} p @param {Material} m
 * @returns {{ force: (stroke: number) => number, strain: (stroke: number) => number, travel: (strain: number) => number, stroke: number, flat: { from: number, to: number, force: number }, stiffness: number, offset: number, reach: number }}
 *   force: on the slider at a stroke (mm in from rest); strain: in the leaf, at its root; travel: the stroke a strain
 *   allows; stroke: as far as the crank turns to square with the slider's line; flat: the longest stroke over which
 *   the force stays within ±5% of a level; stiffness: the leaf's torsional spring in the model, N·mm a radian;
 *   offset: how far the ground pin sits beside the slider's line (r2 sin rest), so the leaf is straight at rest;
 *   reach: from the coupler's pin to the ground pin along the line at rest (r2 cos rest)
 */
export function constantForceModel({ leaf: l, thickness: t, width: w, crank, rest = 5 }, { E }) {
  const g = 0.85, Kt = 2.65, r2 = crank ?? l / 2, I = (w * t ** 3) / 12, K = (g * Kt * E * I) / l, rest0 = (rest * Math.PI) / 180;
  // The slider's line is y = 0; the ground pin O sits at (0, −d) beside it, so at rest the pin B is on the line and the
  // leaf straight. The slider at xC: the leaf's pivot P at xP = xC − (1 − γ)l, its rigid part γl long reaching B, which
  // is also r2 from O: where the two circles cross, on the side B rises to
  const d = r2 * Math.sin(rest0), reach = r2 * Math.cos(rest0), gl = g * l;
  const at = (xC) => {
    const xP = xC - (1 - g) * l, D = Math.hypot(xP, d), a = (r2 * r2 - gl * gl + D * D) / (2 * D), hh = r2 * r2 - a * a;
    if (!(hh >= 0) || D < 1e-9) return null;
    const ux = xP / D, uy = (0 + d) / D, h = Math.sqrt(hh); // from O toward P
    const B = [[a * ux - h * uy, -d + a * uy + h * ux], [a * ux + h * uy, -d + a * uy - h * ux]].sort((p, q) => q[1] - p[1])[0];
    return { Th: Math.atan2(B[1], B[0] - xP), t2: Math.atan2(B[1] + d, B[0]) };
  };
  const xRest = reach + l, Th0 = Math.PI;
  const U = (xC) => { const a = at(xC); return a ? 0.5 * K * (a.Th - Th0) ** 2 : NaN; };
  const square = gl > Math.abs(r2 - d) ? Math.sqrt(gl * gl - (r2 - d) ** 2) + (1 - g) * l : null; // the crank square to the line: B at (0, r2 − d)
  const stroke = square != null && square < xRest ? xRest - square : xRest - (1 - g) * l - r2 - 1e-6;
  const force = (s) => (s <= 0 || s > stroke ? 0 : -(U(xRest - s + 1e-4) - U(xRest - s - 1e-4)) / 2e-4);
  const strain = (s) => { const a = at(xRest - Math.min(Math.max(s, 0), stroke)); return a ? (g * Kt * t * Math.abs(a.Th - Th0)) / (2 * l) : NaN; };
  const travel = (e) => { let lo = 0, hi = stroke; if (strain(hi) <= e) return hi; for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (strain(mid) < e) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  // The flat stretch: the longest run of the curve within ±5% of one of its own values
  const n = 400, pts = Array.from({ length: n }, (_, i) => { const s = ((i + 1) * stroke) / n; return { s, F: force(s) }; });
  let flat = { from: 0, to: 0, force: 0 };
  for (let i = 0; i < n; i += 2) {
    const lvl = pts[i].F; if (!(lvl > 0)) continue;
    let j = i; while (j < n && Math.abs(pts[j].F - lvl) <= 0.05 * lvl) j++;
    let i0 = i; while (i0 > 0 && Math.abs(pts[i0 - 1].F - lvl) <= 0.05 * lvl) i0--;
    if (pts[j - 1].s - pts[i0].s > flat.to - flat.from) flat = { from: pts[i0].s, to: pts[j - 1].s, force: lvl };
  }
  return { force, strain, travel, stroke, flat, stiffness: K, offset: d, reach };
}

/**
 * An elliptical notch hinge: a notch hinge whose notches are half-ellipses, longer along the beam than deep (or the
 * other way), so the bending spreads along a longer neck for less stress at the same angle (Smith 2000; Lobontiu
 * 2003). With equal axes it is the circular notch hinge. Its stiffness is the bending compliance integrated along the
 * notch, ∫ dx / EI(x) with the neck's height t + 2b(1 − √(1 − (x/a)²)), which for a circle agrees with Paros and
 * Weisbord's formula within a few per cent.
 * @param {{ along: number, across: number, neck: number, width: number, arms?: number }} p along: each notch's
 *   semi-axis along x (a); across: its semi-axis along y (b, the notch's depth); neck: the thinnest part; width: up z;
 *   arms: the blocks either side, along x (default 4 × along)
 */
export function ellipticalHinge({ along: a, across: b, neck: t, width, arms }) {
  const arm = arms ?? 4 * a, total = 2 * arm + 2 * a, h = t + 2 * b;
  const bar = block(total / 2, 0, width / 2, [total, h, width]);
  const notch = (y) => translate([arm + a, y, width / 2], jscad.transforms.scale([a, b, 1], cylinder({ radius: 1, height: width + 2, segments: 64 })));
  return subtract(bar, notch(t / 2 + b), notch(-t / 2 - b));
}
/**
 * @param {{ along: number, across: number, neck: number, width: number }} p @param {Material & { concentration?: number }} m
 *   concentration: the notch's stress concentration (default 1.2, a well-rounded notch; a flatter ellipse's is less)
 * @returns {{ stiffness: number, strain: (angle: number) => number, angle: (strain: number) => number, stress: (angle: number) => number }}
 *   stiffness in N·mm a radian; angles in radians
 */
export function ellipticalHingeModel({ along: a, across: b, neck: t, width: w }, { E, concentration = 1.2 }) {
  const n = 2000, dx = (2 * a) / n;
  let compliance = 0;
  for (let i = 0; i < n; i++) { const x = -a + (i + 0.5) * dx, h = t + 2 * b * (1 - Math.sqrt(Math.max(0, 1 - (x / a) ** 2))); compliance += dx / ((E * w * h ** 3) / 12); }
  const stiffness = 1 / compliance, Imin = (w * t ** 3) / 12, strain = (th) => (concentration * stiffness * th * (t / 2)) / (E * Imin);
  return { stiffness, strain, angle: (e) => e / strain(1), stress: (th) => E * strain(th) };
}

/**
 * A cartwheel pivot: two leaves crossing at a hub inside a rim, joined where they cross, so the hub turns about the
 * crossing with little drift: the flat-printable cousin of the cross-axis pivot (whose leaves pass each other in
 * different planes). The rim is one body, the hub and its arm the other. Each half-leaf is a spoke from the hub to
 * the rim, bent by the hub's turn: stiffness 16 EI / s × (1 + 1.5 r / s) for spokes s long from a hub of radius r
 * (four beams fixed at the rim, their hub ends turned through θ and carried round by rθ), and the strain at the hub
 * end 2tθ / s × (1 + 1.5 r / s).
 * @param {{ spoke: number, thickness: number, width: number, hub?: number, rim?: number, arm?: number, opening?: number }} p
 *   spoke: hub edge to rim (s); hub: the hub's radius (default 2 × thickness, at least 2); rim: the ring's radial
 *   thickness (default 3); arm: how far the hub's arm reaches past the rim along +x (default 2 × spoke); opening: the
 *   gap in the rim the arm passes through, degrees (default 60)
 */
export function cartwheel({ spoke: s, thickness: t, width, hub, rim = 3, arm, opening = 60 }) {
  const r = hub ?? Math.max(2, 2 * t), Ri = r + s, Ro = Ri + rim, reach = arm ?? 2 * s, aw = Math.max(3, 2 * t);
  const ring = subtract(cylinder({ radius: Ro, height: width, center: [0, 0, width / 2], segments: 96 }), cylinder({ radius: Ri, height: width + 2, center: [0, 0, width / 2], segments: 96 }));
  const gap = block(Ro / 2 + 1, 0, width / 2, [Ro + 2, 2 * Ro * Math.sin((opening * Math.PI) / 360), width + 2]);
  const leaf = (angle) => jscad.transforms.rotateZ(angle, block(0, 0, width / 2, [2 * Ri + 1, t, width]));
  return union(subtract(ring, gap), cylinder({ radius: r, height: width, center: [0, 0, width / 2], segments: 48 }), leaf(Math.PI / 4), leaf(-Math.PI / 4), block((Ro + reach) / 2, 0, width / 2, [Ro + reach, aw, width]));
}
/**
 * @param {{ spoke: number, thickness: number, width: number, hub?: number }} p @param {Material} m
 * @returns {{ stiffness: number, strain: (angle: number) => number, angle: (strain: number) => number, stress: (angle: number) => number }}
 *   stiffness in N·mm a radian; angles in radians
 */
export function cartwheelModel({ spoke: s, thickness: t, width: w, hub }, { E }) {
  const r = hub ?? Math.max(2, 2 * t), I = (w * t ** 3) / 12, carried = 1 + (1.5 * r) / s, stiffness = (16 * E * I * carried) / s, strain = (th) => (2 * t * th * carried) / s;
  return { stiffness, strain, angle: (e) => e / strain(1), stress: (th) => E * strain(th) };
}

/**
 * A snap-fit hook: a cantilever with a hook at its tip, the commonest compliant feature in a printed enclosure. Pushed
 * into its catch the lead face deflects the beam by the undercut, and it springs back behind the catch; pulled, the
 * back face either holds (square) or lets go at a higher force (sloped). The deflection force is the leaf's: P = k y
 * with the strain 3ty / 2L² at the root; the insertion force W = P (μ + tan α) / (1 − μ tan α) and the removal force
 * the same with the back angle (the BASF and Bayer snap-fit design guides).
 * @param {{ length: number, thickness: number, width: number, undercut: number, lead?: number, back?: number, root?: number }} p
 *   undercut: the hook's height off the beam (y); lead: the insertion face's angle from the beam, degrees (default
 *   30); back: the retention face's (default 90, square: holds); root: the block the beam grows from, along x
 *   (default 2 × thickness, at least 3)
 */
export function snapHook({ length: L, thickness: t, width, undercut: y, lead = 30, back = 90, root }) {
  const b = root ?? Math.max(3, 2 * t), rise = y / Math.tan((lead * Math.PI) / 180), fall = back >= 90 ? 0 : y / Math.tan((back * Math.PI) / 180), flat = Math.max(t, 1);
  const top = t / 2, pts = [[L, top], [L - rise, top + y], [L - rise - flat, top + y], [L - rise - flat - fall, top]]; // the hook: lead face, flat, back face
  const hook = jscad.extrusions.extrudeLinear({ height: width }, jscad.primitives.polygon({ points: [[L, top - t / 2], ...pts, [L - rise - flat - fall, top - t / 2]] }));
  return union(block(-b / 2, 0, width / 2, [b, Math.max(2 * t, 3), width]), block(L / 2, 0, width / 2, [L, t, width]), hook);
}
/**
 * @param {{ length: number, thickness: number, width: number, undercut: number, lead?: number, back?: number }} p
 * @param {Material & { friction?: number }} m friction: μ between hook and catch (default 0.3; printed plastics 0.2 to 0.6)
 * @returns {Model & { force: number, insertion: number, removal: number, holds: boolean, undercut: (strain: number) => number }}
 *   force: to deflect the hook its undercut; insertion and removal: along the push, N (removal Infinity when the back
 *   face is square); undercut: the most the hook may be deflected at a strain
 */
export function snapHookModel({ length: L, thickness: t, width: w, undercut: y, lead = 30, back = 90 }, { E, friction: mu = 0.3 }) {
  const m = leafModel({ length: L, thickness: t, width: w }, { E }), P = m.stiffness * y;
  const along = (deg) => { const tan = Math.tan((deg * Math.PI) / 180); return deg >= 90 || mu * tan >= 1 ? Infinity : (P * (mu + tan)) / (1 - mu * tan); };
  return { ...m, force: P, insertion: along(lead), removal: along(back), holds: !Number.isFinite(along(back)), undercut: (e) => m.travel(e) };
}

/**
 * A ratchet: a wheel of saw teeth on a pin and a leaf pawl whose tip rides them. Turned one way, each tooth's ramp
 * lifts the pawl by the tooth height and drops it with a click; turned the other, the pawl's tip meets a tooth's
 * square face and holds. A one-way click: a sear, a winder, a cable tie. The teeth are chords, so the ramp's angle
 * from the rim is atan(height / pitch).
 * @param {{ teeth: number, radius: number, height: number, width: number, pin?: number }} p teeth: how many; radius:
 *   to the teeth's tips; height: a tooth's, tip to root; width: up z; pin: the pin's diameter (default 1.75, filament)
 */
export function ratchetWheel({ teeth: n, radius: R, height: ht, width, pin = 1.75 }) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n; pts.push([(R - ht) * Math.cos(a0), (R - ht) * Math.sin(a0)], [R * Math.cos(a1), R * Math.sin(a1)]); }
  return subtract(jscad.extrusions.extrudeLinear({ height: width }, jscad.primitives.polygon({ points: pts })), cylinder({ radius: pin / 2 + 0.1, height: width + 2, center: [0, 0, width / 2], segments: 32 }));
}
/**
 * The pawl: a leaf from a root block, its tip squared to meet the teeth. Drawn along x; its tip at x = length rides a
 * wheel whose teeth cross the tip's path.
 * @param {{ length: number, thickness: number, width: number, root?: number }} p
 */
export function ratchetPawl({ length: L, thickness: t, width, root }) {
  const b = root ?? Math.max(3, 2 * t);
  return union(block(-b / 2, 0, width / 2, [b, Math.max(2 * t, 3), width]), block(L / 2, 0, width / 2, [L, t, width]));
}
/**
 * @param {{ teeth: number, radius: number, height: number }} wheel @param {{ length: number, thickness: number, width: number }} pawl
 * @param {Material & { friction?: number }} m
 * @returns {Model & { ramp: number, pitch: number, lift: number, click: number, holds: true }} ramp: the teeth's
 *   angle, radians; pitch: tooth to tooth at the rim, mm; lift: the force to lift the pawl a tooth; click: the force
 *   along the rim to turn the wheel past a tooth; the pawl's strain is at the tooth height
 */
export function ratchetModel({ teeth: n, radius: R, height: ht }, pawl, { E, friction: mu = 0.3 }) {
  const m = leafModel(pawl, { E }), pitch = (2 * Math.PI * R) / n, ramp = Math.atan2(ht, pitch), tan = Math.tan(ramp), lift = m.stiffness * ht;
  return { ...m, ramp, pitch, lift, click: mu * tan < 1 ? (lift * (mu + tan)) / (1 - mu * tan) : Infinity, holds: true };
}

/**
 * A folded-beam guide: the suspension of every MEMS stage, in a printed part. A shuttle hangs on two folds, one each
 * side: a beam out along x to a floating truss, a beam back to an anchor beside the shuttle. The shuttle moves along
 * y; each fold is two fixed-guided beams in series, and the two folds act in parallel, so the stiffness is E w t³ / L³
 * with each beam taking half the travel (strain 3t(δ/2) / L²), the same as a compound guide in a shorter box. The
 * folds' pulls on the shuttle cancel by symmetry, so it doesn't drift along x; past a few thicknesses of travel the
 * beams stretch and the guide stiffens.
 * Drawn: the shuttle is a T, its bar carrying the upper beams out to the trusses; the lower beams come back to posts
 * standing on a base bar under the shuttle, a clearance from it.
 * @param {Leaf & { gap: number, clearance?: number, shuttle?: number, end?: number }} p gap: between a fold's two
 *   beams; clearance: shuttle to posts and base, the travel it can make (default gap / 2); shuttle: the shuttle's
 *   width along x (default 2 × thickness, at least 3); end: the trusses', posts' and base's thickness (default the same)
 */
export function foldedGuide({ length: L, thickness: t, width, gap, clearance, shuttle, end }) {
  const e = end ?? Math.max(3, 2 * t), s = shuttle ?? e, c = clearance ?? gap / 2;
  const y1 = gap / 2 + t / 2, y2 = -y1, x0 = s / 2 + c + e, parts = [block(0, 0, width / 2, [s, gap + 2 * t, width]), block(0, y1, width / 2, [2 * x0, t, width])]; // the shuttle and its bar
  for (const sg of [1, -1]) {
    parts.push(block(sg * (x0 + L / 2), y1, width / 2, [L, t, width]), block(sg * (x0 + L / 2), y2, width / 2, [L, t, width])); // the fold's beams
    parts.push(block(sg * (x0 + L + e / 2), 0, width / 2, [e, gap + 2 * t, width])); // the truss
    parts.push(block(sg * (x0 - e / 2), y2 - (c + e) / 2, width / 2, [e, t + c + e, width])); // the post, from inside the base bar up to the lower beam
  }
  parts.push(block(0, y2 - t / 2 - c - e / 2, width / 2, [2 * (x0 + L + e), e, width])); // the base bar
  return union(...parts);
}
/** @param {Leaf} p @param {Material} m @returns {Model & { drop: (travel: number) => number }} */
export function foldedGuideModel(p, m) { return compoundGuideModel(p, m); }

/**
 * A pin joint printed in place: a pin standing from a base, a ring round it with an arm, a cap on the pin that keeps
 * the ring on. The ring is a clearance from the pin all round and a support gap off the base and under the cap, so
 * the three print as one piece that breaks free with a twist; the cap's underside flares at 45°, so it prints without
 * support. Not compliant: this is the joint to compare the flexures against, with play where they have none.
 * @param {{ pin: number, width: number, clearance?: number, lift?: number, lip?: number, ring?: number, arm?: number, base?: number }} p
 *   pin: the pin's diameter; width: the ring's height, up z; clearance: ring to pin, radially (default 0.2, the
 *   printer's fit); lift: the ring off the base and the cap off the ring, a support gap (default 0.2); lip: how far
 *   the cap overhangs the pin (default 1); ring: the ring's wall (default 3); arm: a bar from the ring along +x
 *   (default 0); base: the plate under it all, its thickness (default 2), reaching a wall past the ring and under the arm
 * @param {'both' | 'pin' | 'ring'} [which] which body to return: both as one shape (default), the pin with its base and
 *   cap, or the ring with its arm (for a design's named parts, so a check knows they're apart on purpose)
 */
export function pinJoint({ pin: d, width: w, clearance = 0.2, lift = 0.2, lip = 1, ring = 3, arm = 0, base = 2 }, which = 'both') {
  const r = d / 2, Ri = r + clearance, Ro = Ri + ring, top = base + lift + w + lift, seg = 64;
  const col = (radius, z0, z1) => cylinder({ radius, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: seg });
  const cap = jscad.primitives.cylinderElliptic({ height: lip, startRadius: [r, r], endRadius: [r + lip, r + lip], center: [0, 0, top + lip / 2], segments: seg });
  const fixed = [col(Ro + ring, 0, base), col(r, 0, top + lip), cap, col(r + lip, top + lip, top + 2 * lip)];
  if (arm > 0) fixed.push(block((Ri + arm + ring) / 2, 0, base / 2, [Ri + arm + ring, 2 * Ro, base])); // the base under the arm too, so it breaks free rather than hangs
  const band = subtract(col(Ro, base + lift, base + lift + w), col(Ri, base + lift - 1, base + lift + w + 1));
  const moving = arm > 0 ? union(band, block(Ri + (arm + ring) / 2, 0, base + lift + w / 2, [arm + ring, Math.max(ring, 2 * clearance + 2), w])) : band;
  return which === 'pin' ? union(...fixed) : which === 'ring' ? moving : union(...fixed, moving);
}
/**
 * How a pin joint prints and moves, as findings: the clearance against the printer's fit, the gaps against its
 * support gap (a gap one support gap high breaks free; a bigger one starts in mid-air), and the ring's play.
 * @param {{ pin: number, width: number, clearance?: number, lift?: number }} p
 * @param {{ fit?: number, support_gap?: number, layer?: number }} printer
 * @returns {{ level: 'pass' | 'warn' | 'fail', text: string, code: string }[]}
 */
export function pinJointCheck({ pin: d, width: w, clearance = 0.2, lift = 0.2 }, printer) {
  const out = [], f = (level, text, code) => out.push({ level, text, code }), fit = printer.fit ?? 0.2, gap = printer.support_gap ?? 0.2;
  f(clearance >= fit - 1e-9 ? 'pass' : 'warn', `${clearance} mm round the pin${clearance >= fit - 1e-9 ? ': the printer\'s fit' : ` is under the printer's fit of ${fit} mm: the ring may print onto the pin`}`, 'joint.clearance');
  f(lift <= gap * 1.5 + 1e-9 ? 'pass' : 'warn', `${lift} mm under the ring and the cap${lift <= gap * 1.5 + 1e-9 ? ': breaks free with a twist after printing' : `: more than a support gap (${gap} mm), so the ring starts in mid-air`}`, 'joint.gap');
  const play = Math.atan2(2 * clearance, w);
  f('pass', `the ring can rock ${((play * 180) / Math.PI).toFixed(1)}° on the pin (${clearance} mm each side over ${w} mm)`, 'joint.play');
  return out;
}

/**
 * A snap pin: a peg with a barbed, slotted head that pushes into a hole and clicks behind it, its two halves bending
 * inward as cantilevers on the way through. Printed standing up: the barb's lead is a cone and its back a 45°
 * chamfer by default, so nothing overhangs past the printer's limit; a square back (back 90) holds for good but
 * overhangs by the lip. The halves are modelled as snap hooks of the slot's length, the peg's half-thickness and
 * four fifths of its diameter wide (a half-round's worth), with the lip as the undercut.
 * @param {{ diameter: number, length: number, lip?: number, slot?: number, gap?: number, lead?: number, back?: number, head?: number }} p
 *   diameter: the peg's; length: the shaft below the barb; lip: the barb's overhang (default 0.4); slot: the split's
 *   length down from the tip (default 3 × diameter); gap: the split's width (default 1); lead: the tip cone's angle
 *   from the axis, degrees (default 45); back: the barb's back angle (default 45); head: a flange at the foot, its
 *   radius past the peg (default diameter / 2)
 */
export function snapPin({ diameter: d, length: L, lip = 0.4, slot, gap = 1, lead = 45, back = 45, head }) {
  const r = d / 2, s = slot ?? 3 * d, flange = head ?? r, seg = 48;
  const fall = back >= 90 ? 0 : lip / Math.tan((back * Math.PI) / 180), rise = (r + lip) / Math.tan((lead * Math.PI) / 180);
  const foot = cylinder({ radius: r + flange, height: 2, center: [0, 0, 1], segments: seg }), shaft = cylinder({ radius: r, height: L + fall + 0.01, center: [0, 0, 2 + (L + fall) / 2], segments: seg });
  const z0 = 2 + L, barbBack = jscad.primitives.cylinderElliptic({ height: Math.max(fall, 0.01), startRadius: [r, r], endRadius: [r + lip, r + lip], center: [0, 0, z0 + Math.max(fall, 0.01) / 2], segments: seg });
  const barbTip = jscad.primitives.cylinderElliptic({ height: rise, startRadius: [r + lip, r + lip], endRadius: [0.01, 0.01], center: [0, 0, z0 + fall + rise / 2], segments: seg });
  const split = block(0, 0, z0 + fall + rise - s / 2 + 1, [2 * (r + lip) + 2, gap, s + 2]);
  return subtract(union(foot, shaft, barbBack, barbTip), split);
}
/**
 * The socket for a snap pin: a block with a hole the peg's diameter plus the clearance, through it, so the barb
 * clicks out on the far side.
 * @param {{ diameter: number, depth: number, clearance?: number, wall?: number }} p depth: the block's thickness along
 *   the pin (the shaft's length, so the barb clears); clearance: round the peg (default 0.2); wall: round the hole
 */
export function snapSocket({ diameter: d, depth, clearance = 0.2, wall = 3 }) {
  const Ro = d / 2 + clearance + wall;
  return subtract(block(0, 0, depth / 2, [2 * Ro, 2 * Ro, depth]), cylinder({ radius: d / 2 + clearance, height: depth + 2, center: [0, 0, depth / 2], segments: 48 }));
}
/**
 * @param {{ diameter: number, lip?: number, slot?: number, gap?: number, lead?: number, back?: number }} p
 * @param {Material & { friction?: number }} m
 * @returns {Model & { force: number, insertion: number, removal: number, holds: boolean, undercut: (strain: number) => number }}
 *   as a snap hook's, for both halves together
 */
export function snapPinModel({ diameter: d, lip = 0.4, slot, gap = 1, lead = 45, back = 45 }, m) {
  const half = snapHookModel({ length: slot ?? 3 * d, thickness: (d - gap) / 2, width: 0.8 * d, undercut: lip, lead, back }, m);
  return { ...half, stiffness: 2 * half.stiffness, force: 2 * half.force, insertion: 2 * half.insertion, removal: 2 * half.removal };
}

/**
 * A travel stop: a post each side of a flexure's moving end, placed where the material's strain limit says the travel
 * must end, less a margin, so the flexure meets the stop before it meets the limit. The rule as a shape: the stop is
 * at factor × travel(strainLimit). For a leaf by default; give any model whose travel is along y at the end (a
 * fixed-guided beam, a guide's shuttle, a serpentine's last leaf) with where that end is.
 * @param {Leaf} p @param {Material} m with strainLimit
 * @param {{ factor?: number, post?: number, reach?: number, model?: Model, end?: number[] }} [o] factor: the share of
 *   the limit the stop allows (default 0.8); post: the stops' size along x and y (default 3); reach: how far back from
 *   the end the stop sits along x (default 0); model: the flexure's model (default the leaf's); end: the moving
 *   end's [x, y] (default the leaf's tip)
 * @returns {{ shape: object, at: number, limit: number }} shape: the two posts, as a JSCAD geom3, drawn on the
 *   flexure's ground; at: the travel the stops allow; limit: the travel at the strain limit
 */
export function travelStop(p, m, { factor = 0.8, post = 3, reach = 0, model, end } = {}) {
  const limit = (model ?? leafModel(p, m)).travel(m.strainLimit), at = factor * limit, [ex, ey] = end ?? [p.length, 0];
  const y = p.thickness / 2 + at + post / 2, x = ex - reach - post / 2;
  return { shape: union(block(x, ey + y, p.width / 2, [post, post, p.width]), block(x, ey - y, p.width / 2, [post, post, p.width])), at, limit };
}
/**
 * An angle stop for a pivot: a post each side of the arm's end, where the hinge's strain limit says the turn must end,
 * less a margin. The arm turns about the pivot; the posts stand at the arm's end, a travel of arm × sin(angle) off it.
 * @param {{ width: number, thickness?: number }} p the pivot's width (and the arm's thickness along y, default 6)
 * @param {Material} m with strainLimit
 * @param {{ model: { angle: (strain: number) => number }, pivot: number[], arm: number, factor?: number, post?: number }} o
 *   model: the hinge's (notchHinge, livingHinge, cartwheel, ellipticalHinge, letJoint); pivot: its [x, y]; arm: from
 *   the pivot to the arm's end along x; factor as travelStop's
 * @returns {{ shape: object, angle: number, limit: number, travel: number }} angle: the turn the stops allow (radians);
 *   limit: at the strain limit; travel: at the arm's end
 */
export function angleStop({ width, thickness = 6 }, m, { model, pivot, arm, factor = 0.8, post = 3 }) {
  const limit = model.angle(m.strainLimit), angle = factor * limit, travel = arm * Math.sin(angle), y = thickness / 2 + travel + post / 2, x = pivot[0] + arm - post / 2;
  return { shape: union(block(x, pivot[1] + y, width / 2, [post, post, width]), block(x, pivot[1] - y, width / 2, [post, post, width])), angle, limit, travel };
}

/**
 * A pre-curved leaf: a cantilever drawn as an arc, so its rest is in the middle of its working range. Pushed one way it
 * straightens, the other it curls further; either way the strain is counted from the curved rest, so the range to a
 * strain limit is twice a straight leaf's, centred where it sits. A magazine spring or a return spring that must
 * work from a loaded rest. Modelled as the straight leaf (stiffness E w t³ / 4L³ along the chord's normal), with the
 * curvature's own strain t / 2ρ noted: the material already sees it as printed, since the leaf is drawn bent.
 * @param {Leaf & { rise: number }} p rise: how far the tip sits off the chord at rest (the arc's sagitta)
 */
export function curvedLeaf({ length: L, thickness: t, width, rise: s }) {
  const rho = (L * L + 4 * s * s) / (8 * s), half = Math.asin(Math.min(1, L / (2 * rho))), n = 40, pts = []; // the arc's radius and half-angle, the chord along x
  for (let i = 0; i <= n; i++) { const a = -half + (2 * half * i) / n; pts.push([rho * Math.sin(a) + L / 2, rho * (1 - Math.cos(a)) - s + s]); }
  const off = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [-dy / l * d, dx / l * d]; };
  const left = [], right = [];
  for (let i = 0; i <= n; i++) { const [ox, oy] = off(pts[Math.max(0, i - 1)], pts[Math.min(n, i + 1)], t / 2); left.push([pts[i][0] + ox, pts[i][1] + oy]); right.push([pts[i][0] - ox, pts[i][1] - oy]); }
  return jscad.extrusions.extrudeLinear({ height: width }, jscad.primitives.polygon({ points: [...right, ...left.reverse()] }));
}
/**
 * @param {Leaf & { rise: number }} p @param {Material} m
 * @returns {Model & { range: (strain: number) => [number, number], preset: number }} travel and strain from the curved
 *   rest, either way; range(strain): how far it may go each way, [toward straight, further curled]; preset: the strain
 *   the curvature already puts in as printed (t / 2ρ), to add to the bending strain when the limit is tight
 */
export function curvedLeafModel({ length: L, thickness: t, width: w, rise: s }, m) {
  const straight = leafModel({ length: L, thickness: t, width: w }, m), rho = (L * L + 4 * s * s) / (8 * s);
  return { ...straight, preset: t / (2 * rho), range: (e) => [-straight.travel(e), straight.travel(e)] };
}

export { ports, size, report, models } from './compose.mjs';

/**
 * A contact-aided leaf: a cantilever with a stop partway along it, a gap off the beam, so it bends freely until the
 * beam touches the stop and then bends from the stop on, stiffer. Two rates in one spring: the first the leaf's,
 * the second a shorter leaf's (from the stop to the tip, with the root part held), and the tip travel where they
 * meet from the cantilever's shape: the beam at the stop drops g when the tip has moved g × 2L³ / (3La² − a³).
 * @param {Leaf & { stop: number, gap: number, post?: number }} p stop: how far the stop reaches from the root along x
 *   (a), as a bar beside the beam; gap: between the beam and the stop at rest (g); post: the bar's thickness (default 3)
 */
export function contactLeaf({ length, thickness: t, width, stop: a, gap: g, post = 3 }) {
  const b = Math.max(3, 2 * t), y = t / 2 + g + post / 2; // the stop: a bar beside the beam from the root to a, a gap off it; the beam meets its far end first
  return union(block(-b / 2, 0, width / 2, [b, 2 * y + post, width]), leaf({ length, thickness: t, width }), block(a / 2, y, width / 2, [a, post, width]));
}
/**
 * @param {Leaf & { stop: number, gap: number }} p @param {Material} m
 * @returns {Model & { first: number, second: number, contact: number, force: (travel: number) => number }}
 *   first, second: the stiffness before and after contact (N/mm); contact: the tip travel where the beam meets the
 *   stop; stiffness: the first; force(travel): along the curve; strain(travel): at the root before contact, at the
 *   stop after
 */
export function contactLeafModel({ length: L, thickness: t, width: w, stop: a, gap: g }, m) {
  const one = leafModel({ length: L, thickness: t, width: w }, m), rest = leafModel({ length: L - a, thickness: t, width: w }, m);
  const contact = (g * 2 * L ** 3) / (3 * L * a * a - a ** 3), force = (d) => (d <= contact ? one.stiffness * d : one.stiffness * contact + rest.stiffness * (d - contact));
  const strain = (d) => (d <= contact ? one.strain(d) : Math.max(one.strain(contact), rest.strain(d - contact)));
  const travel = (e) => (one.strain(contact) >= e ? one.travel(e) : contact + rest.travel(e));
  return { stiffness: one.stiffness, first: one.stiffness, second: rest.stiffness, contact, force, strain, travel, stress: (d) => m.E * strain(d) };
}

/**
 * A parallelogram four-bar with flexure pivots: two equal links from a ground bar to a coupler bar, a notch hinge at
 * each of the four corners, so the coupler moves sideways and stays parallel (a lever's worth of a parallel guide,
 * with the links' length as the travel's radius). Printed flat: the links along y, the motion along x.
 * Stiffness at the coupler 4K / L² for four hinges of rotational stiffness K and links L long; the coupler rises
 * by L(1 − cos θ) as it moves Lsin θ, and the hinges' strain is the notch hinge's at θ.
 * @param {{ link: number, apart: number, width: number, radius: number, neck: number, bar?: number }} p link: the links,
 *   hinge neck to hinge neck (L); apart: the links' spacing along x; width: up z; radius, neck: the notch hinges';
 *   bar: the ground's and coupler's thickness along y (default 6). The ground bar is centred on y = 0, the coupler
 *   above it at y = L + 2R + bar
 */
export function parallelogram({ link: L, apart, width, radius: R, neck: t, bar = 6 }) {
  const y1 = bar / 2 + R, y2 = y1 + L, top = y2 + R + bar / 2, across = apart + t + 2 * R + 2 * bar; // the hinges' necks at y1 and y2
  const linkAt = (x) => {
    const notch = (y, side) => translate([x + side * (t / 2 + R), y, width / 2], cylinder({ radius: R, height: width + 2, segments: 48 }));
    return subtract(block(x, top / 2, width / 2, [t + 2 * R, top, width]), notch(y1, 1), notch(y1, -1), notch(y2, 1), notch(y2, -1));
  };
  return union(block(apart / 2, 0, width / 2, [across, bar, width]), block(apart / 2, top, width / 2, [across, bar, width]), linkAt(0), linkAt(apart));
}
/**
 * @param {{ link: number, width: number, radius: number, neck: number }} p @param {Material & { concentration?: number }} m
 * @returns {Model & { rise: (travel: number) => number, angle: (travel: number) => number }} stiffness at the coupler,
 *   N/mm; strain and travel through the hinges' angle; rise: how far the coupler lifts along y at a travel
 */
export function parallelogramModel({ link: L, width: w, radius: R, neck: t }, m) {
  const h = notchHingeModel({ radius: R, neck: t, width: w }, m), angle = (d) => Math.asin(Math.min(1, d / L));
  return { stiffness: (4 * h.stiffness) / (L * L), strain: (d) => h.strain(angle(d)), travel: (e) => L * Math.sin(h.angle(e)), stress: (d) => m.E * h.strain(angle(d)), rise: (d) => L * (1 - Math.cos(angle(d))), angle };
}

/**
 * Tweezers: two arms joined at a leaf spring, their jaws apart at rest; squeezing the arms bends the spring and
 * closes the jaws. The simplest compliant gripper, one piece, printed flat. The spring is a leaf in the plane,
 * fixed-guided between the two arms' roots (each arm turns about its own end of the spring), so the arms close
 * through the spring's bend: a squeeze δ at the fingers moves each jaw δ × jaw / finger, and the spring's strain at a
 * closing is that of a leaf whose tip moves the squeeze.
 * @param {{ spring: number, thickness: number, width: number, arm: number, jaw?: number, open: number, bar?: number }} p
 *   spring: the leaf's length along y, between the arms' roots; thickness: the leaf's; width: up z; arm: the arms'
 *   length along x from the spring to the jaws; jaw: the flat tips' length past the arms (default 6); open: the jaws'
 *   inner faces apart at rest; bar: the arms' thickness (default 4)
 */
export function tweezers({ spring: s, thickness: t, width, arm, jaw = 6, open, bar = 4 }) {
  const parts = [block(0, 0, width / 2, [t, s + bar, width])]; // the spring, along y, standing between the arms' roots
  for (const sg of [1, -1]) {
    const y0 = sg * (s / 2 + bar / 2), y1 = sg * (open / 2 + bar / 2);
    parts.push(block(bar / 2 - t / 2, y0, width / 2, [bar + t, bar, width])); // the root, on the spring's end
    const dx = arm, dy = y1 - y0, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    parts.push(translate([bar / 2 + dx / 2, (y0 + y1) / 2, width / 2], jscad.transforms.rotateZ(ang, cuboid({ size: [len + bar, bar, width] })))); // the arm, angled in to the jaw
    parts.push(block(bar / 2 + arm + bar / 2 + jaw / 2, y1, width / 2, [jaw + bar, bar, width])); // the jaw: a flat tip on the arm, its inner face at the opening
  }
  return union(...parts);
}
/**
 * @param {{ spring: number, thickness: number, width: number, arm: number, open: number }} p @param {Material} m
 * @returns {Model & { close: number, squeeze: (closing: number) => number, grip: (squeeze: number) => number }}
 *   stiffness: at the fingers (the spring as a fixed-guided leaf, N/mm); close: the squeeze that brings the jaws
 *   together (the opening); squeeze(closing): how far to squeeze for a closing at the jaws; grip(squeeze): the force
 *   the jaws hold with for a squeeze, once closed (the arms as levers from the spring: here 1:1, so the spring's
 *   force); strain and travel through the squeeze
 */
export function tweezersModel({ spring: s, thickness: t, width: w, open }, m) {
  const leafM = fixedGuidedModel({ length: s, thickness: t, width: w }, m);
  return { ...leafM, close: open, squeeze: (closing) => closing, grip: (squeeze) => leafM.stiffness * Math.max(0, squeeze - open) };
}

/**
 * How a flexure prints, as findings (pass, warn, fail, in plain words): the thickness in whole extrusion lines and at
 * least two of them, the width in whole layers, the strain at its travel against the material's limit, and whether a
 * stop bounds its travel.
 * @param {{ thickness: number, width: number, travel?: number, stop?: number | false }} p stop: the travel a stop allows,
 *   or false for a flexure with none (a warning: its travel could exceed the material's limit)
 * @param {{ line: number, layer: number, wall_min?: number }} printer
 * @param {Material & { name?: string }} [material] with strainLimit, to check the travel
 * @param {Model} [model]
 * @returns {{ level: 'pass' | 'warn' | 'fail', text: string, code: string }[]}
 */
export function printable({ thickness: t, width: w, travel, stop }, printer, material, model) {
  const out = [], f = (level, text, code) => out.push({ level, text, code });
  const lines = t / printer.line, whole = Math.abs(lines - Math.round(lines)) < 0.05, least = (printer.wall_min ?? 2 * printer.line) / printer.line;
  if (lines < least - 0.05) f('fail', `${t} mm thick is under ${least} lines of ${printer.line} mm: too thin to print as a wall`, 'flexure.thin');
  else if (!whole) f('warn', `${t} mm thick is ${lines.toFixed(2)} lines of ${printer.line} mm: a whole number prints as drawn (${(Math.round(lines) * printer.line).toFixed(2)} mm)`, 'flexure.lines');
  else f('pass', `${t} mm thick: ${Math.round(lines)} lines of ${printer.line} mm`, 'flexure.lines');
  const layers = w / printer.layer;
  if (Math.abs(layers - Math.round(layers)) > 0.05) f('warn', `${w} mm wide is ${layers.toFixed(2)} layers of ${printer.layer} mm: a whole number prints as drawn`, 'flexure.layers');
  if (stop != null && model && material?.strainLimit != null) {
    const limit = model.travel(material.strainLimit);
    if (stop === false) f('warn', `nothing stops this flexure before its limit of ${limit.toFixed(2)} mm (${(material.strainLimit * 100).toFixed(1)}% strain): add a stop (travelStop) or a rule that bounds its travel`, 'flexure.stop');
    else f(stop <= limit ? 'pass' : 'fail', `a stop at ${stop} mm${stop <= limit ? `, within the limit of ${limit.toFixed(2)} mm` : `: past the limit of ${limit.toFixed(2)} mm, the material fails before the stop`}`, 'flexure.stop');
  }
  if (travel != null && model && material?.strainLimit != null) {
    const e = model.strain(travel), limit = material.strainLimit;
    f(e <= limit ? 'pass' : 'fail', `at ${travel} mm of travel the material sees ${(e * 100).toFixed(2)}% strain${e <= limit ? ', within' : ', over'} ${material.name ?? 'its'} limit of ${(limit * 100).toFixed(1)}%${e > limit ? `: at most ${model.travel(limit).toFixed(2)} mm` : ''}`, 'flexure.strain');
  }
  return out;
}

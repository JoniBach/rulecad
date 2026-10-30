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
 * How a flexure prints, as findings (pass, warn, fail, in plain words): the thickness in whole extrusion lines and at
 * least two of them, the width in whole layers, and the strain at its travel against the material's limit.
 * @param {{ thickness: number, width: number, travel?: number }} p
 * @param {{ line: number, layer: number, wall_min?: number }} printer
 * @param {Material & { name?: string }} [material] with strainLimit, to check the travel
 * @param {Model} [model]
 * @returns {{ level: 'pass' | 'warn' | 'fail', text: string, code: string }[]}
 */
export function printable({ thickness: t, width: w, travel }, printer, material, model) {
  const out = [], f = (level, text, code) => out.push({ level, text, code });
  const lines = t / printer.line, whole = Math.abs(lines - Math.round(lines)) < 0.05, least = (printer.wall_min ?? 2 * printer.line) / printer.line;
  if (lines < least - 0.05) f('fail', `${t} mm thick is under ${least} lines of ${printer.line} mm: too thin to print as a wall`, 'flexure.thin');
  else if (!whole) f('warn', `${t} mm thick is ${lines.toFixed(2)} lines of ${printer.line} mm: a whole number prints as drawn (${(Math.round(lines) * printer.line).toFixed(2)} mm)`, 'flexure.lines');
  else f('pass', `${t} mm thick: ${Math.round(lines)} lines of ${printer.line} mm`, 'flexure.lines');
  const layers = w / printer.layer;
  if (Math.abs(layers - Math.round(layers)) > 0.05) f('warn', `${w} mm wide is ${layers.toFixed(2)} layers of ${printer.layer} mm: a whole number prints as drawn`, 'flexure.layers');
  if (travel != null && model && material?.strainLimit != null) {
    const e = model.strain(travel), limit = material.strainLimit;
    f(e <= limit ? 'pass' : 'fail', `at ${travel} mm of travel the material sees ${(e * 100).toFixed(2)}% strain${e <= limit ? ', within' : ', over'} ${material.name ?? 'its'} limit of ${(limit * 100).toFixed(1)}%${e > limit ? `: at most ${model.travel(limit).toFixed(2)} mm` : ''}`, 'flexure.strain');
  }
  return out;
}

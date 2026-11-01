// Composing flexures into mechanisms: where each one attaches (ports), how big one must be for a job (sizing), and one
// report for a mechanism's worth of them (report). Units: mm, N, MPa, radians.
import { leafModel, fixedGuidedModel, parallelGuideModel, compoundGuideModel, foldedGuideModel, serpentineModel, notchHingeModel, ellipticalHingeModel, cartwheelModel, livingHingeModel, letJointModel, bistableModel, constantForceModel, contactLeafModel, parallelogramModel, tweezersModel, snapHookModel, printable } from './flexures.mjs';

/** @typedef {{ at: number[], dir: number[] }} Port a point on a flexure and the direction a mating part faces from it */

const X = [1, 0, 0], Y = [0, 1, 0], mX = [-1, 0, 0], mY = [0, -1, 0];
/**
 * Where a flexure attaches: its root (the ground side) and its moving end, as points in the shape's own frame (root
 * at the origin, length along x, bending along y, width up z) with the direction a mating part faces from each, plus
 * what moves there (`moves`: the axis the end travels along, or 'turn' about z). A design places the shape and its
 * mates by these instead of by arithmetic.
 * @param {string} kind the generator's name (leaf, fixedGuided, parallelGuide, compoundGuide, foldedGuide, serpentine,
 *   notchHinge, ellipticalHinge, cartwheel, livingHinge, letJoint, bistable, constantForce, contactLeaf,
 *   parallelogram, tweezers, snapHook)
 * @param {object} p the generator's parameters
 * @returns {{ root: Port, end: Port, moves: 'x' | 'y' | 'turn', [name: string]: any }}
 */
export function ports(kind, p) {
  const w = p.width ?? 0, z = w / 2;
  switch (kind) {
    case 'leaf': case 'fixedGuided': case 'snapHook': case 'contactLeaf':
      return { root: { at: [0, 0, z], dir: mX }, end: { at: [p.length, 0, z], dir: X }, moves: 'y' };
    case 'serpentine': {
      const step = p.pitch ?? 3 * p.thickness, last = (p.turns - 1) * step;
      return { root: { at: [0, 0, z], dir: mX }, end: { at: [p.turns % 2 ? p.length : 0, last, z], dir: p.turns % 2 ? X : mX }, moves: 'y' };
    }
    case 'parallelGuide': {
      const end = Math.max(3, 2 * p.thickness), s = p.shuttle ?? end, b = p.base ?? end;
      return { root: { at: [-b, 0, z], dir: mX }, end: { at: [p.length + s, 0, z], dir: X }, moves: 'y' };
    }
    case 'compoundGuide': {
      const end = Math.max(3, 2 * p.thickness), s = p.shuttle ?? end, b = p.base ?? end, c = p.clearance ?? p.gap / 2;
      return { root: { at: [-s - c - b, 0, z], dir: mX }, end: { at: [-s, 0, z], dir: mX }, moves: 'y', shuttle: { at: [-s, 0, z], dir: mX } };
    }
    case 'foldedGuide': {
      const e = p.end ?? Math.max(3, 2 * p.thickness), c = p.clearance ?? p.gap / 2, y2 = -(p.gap / 2 + p.thickness / 2);
      return { root: { at: [0, y2 - p.thickness / 2 - c - e, z], dir: mY }, end: { at: [0, p.gap / 2 + p.thickness, z], dir: Y }, moves: 'y' };
    }
    case 'notchHinge': { const a = p.arms ?? 4 * p.radius; return { root: { at: [0, 0, z], dir: mX }, end: { at: [2 * a + 2 * p.radius, 0, z], dir: X }, moves: 'turn', pivot: { at: [a + p.radius, 0, z], dir: [0, 0, 1] } }; }
    case 'ellipticalHinge': { const a = p.arms ?? 4 * p.along; return { root: { at: [0, 0, z], dir: mX }, end: { at: [2 * a + 2 * p.along, 0, z], dir: X }, moves: 'turn', pivot: { at: [a + p.along, 0, z], dir: [0, 0, 1] } }; }
    case 'livingHinge': { const a = p.arms ?? 10; return { root: { at: [-a, 0, z], dir: mX }, end: { at: [p.flex + a, 0, z], dir: X }, moves: 'turn', pivot: { at: [p.flex / 2, 0, z], dir: [0, 0, 1] } }; }
    case 'cartwheel': { const r = p.hub ?? Math.max(2, 2 * p.thickness), Ro = r + p.spoke + (p.rim ?? 3), reach = p.arm ?? 2 * p.spoke; return { root: { at: [0, -Ro, z], dir: mY }, end: { at: [Ro + reach, 0, z], dir: X }, moves: 'turn', pivot: { at: [0, 0, z], dir: [0, 0, 1] } }; }
    case 'letJoint': { const a = p.panel ?? p.width, c = p.slot / 2 + p.bar + p.slot, h = p.thickness; return { root: { at: [-(a + c), 0, h / 2], dir: mX }, end: { at: [a + c, 0, h / 2], dir: X }, moves: 'turn', pivot: { at: [0, 0, h / 2], dir: Y } }; }
    case 'bistable': { const e = p.ends ?? Math.max(3, 3 * p.thickness); return { root: { at: [-e, 0, z], dir: mX }, end: { at: [p.length / 2, p.rise, z], dir: Y }, moves: 'y', far: { at: [p.length + e, 0, z], dir: X } }; }
    case 'constantForce': { const s = p.slider ?? Math.max(3, 2 * p.thickness); return { root: { at: [-s, 0, z], dir: mX }, end: { at: [p.leaf, 0, z], dir: X }, moves: 'x', pin: { at: [p.leaf, 0, z], dir: [0, 0, 1] } }; }
    case 'parallelogram': { const R = p.radius, bar = p.bar ?? 6, top = bar / 2 + R + p.link + R + bar / 2; return { root: { at: [p.apart / 2, 0, z], dir: mY }, end: { at: [p.apart / 2, top, z], dir: Y }, moves: 'x' }; }
    case 'tweezers': { const bar = p.bar ?? 4, jaw = p.jaw ?? 6; return { root: { at: [0, 0, z], dir: mX }, end: { at: [bar + p.arm + jaw, 0, z], dir: X }, moves: 'y', jaws: [{ at: [bar + p.arm + jaw, p.open / 2, z], dir: mY }, { at: [bar + p.arm + jaw, -p.open / 2, z], dir: Y }] }; }
    default: throw new Error(`no ports for ${kind}: give a generator's name (leaf, notchHinge, compoundGuide, …)`);
  }
}

/** The model for a kind, by name */
export const models = { leaf: leafModel, fixedGuided: fixedGuidedModel, parallelGuide: parallelGuideModel, compoundGuide: compoundGuideModel, foldedGuide: foldedGuideModel, serpentine: serpentineModel, notchHinge: notchHingeModel, ellipticalHinge: ellipticalHingeModel, cartwheel: cartwheelModel, livingHinge: livingHingeModel, letJoint: letJointModel, bistable: bistableModel, constantForce: constantForceModel, contactLeaf: contactLeafModel, parallelogram: parallelogramModel, tweezers: tweezersModel, snapHook: snapHookModel };

const lines = (printer, from = 2, to = 8) => Array.from({ length: to - from + 1 }, (_, i) => +((from + i) * printer.line).toFixed(4));
/**
 * How big a flexure must be for a job, from the models the other way round: the thinnest whole-line thickness and the
 * length that give the travel at the force, with the material's strain at that travel under its limit times a margin.
 * Each returns the parameters to hand the generator, with what it will do (`stiffness`, `strain` at the travel), or
 * null when no thickness up to eight lines manages it (then widen it, or allow a longer part).
 * @param {{ line: number }} printer the extrusion line, so thicknesses are whole lines
 */
export const size = {
  /**
   * Displacement first (Howell; the BYU blaster, PLOS ONE 2026): the travel and the strain limit set the length for a
   * thickness, and the force is set last, by the width (stress doesn't depend on it). Give `width` when the print fixes
   * it (a lamina's height): then the thickness sets the force, the thinnest whole-line one that reaches it, lengthened
   * until it gives exactly that. Leave `width` out and it's the thinnest thickness that prints, at the shortest length,
   * as wide (in whole layers) as the force needs, up to `maxWidth`.
   * @param {'leaf' | 'fixedGuided' | 'parallelGuide' | 'compoundGuide' | 'foldedGuide' | 'serpentine'} kind
   * @param {{ travel: number, force?: number, energy?: number, width?: number, maxWidth?: number, maxLength?: number, turns?: number,
   *   material: { E: number, strainLimit: number }, margin?: number }} job energy in N·mm (mJ); force at full travel, N
   * @param {{ line: number, layer: number }} printer
   * @returns {{ kind: string, length: number, thickness: number, width: number, turns?: number, stiffness: number, force: number,
   *   energy: number, strain: number, ratio: number } | null} ratio: travel over length, the paper's measure of how hard
   *   it works (it scales: the same ratio at any size is the same strain)
   */
  forTravel(kind, { travel, force, energy, width, maxWidth = Infinity, maxLength = Infinity, turns, material, margin = 0.8 }, printer) {
    const model = models[kind];
    if (!model || !['leaf', 'fixedGuided', 'parallelGuide', 'compoundGuide', 'foldedGuide', 'serpentine'].includes(kind)) throw new Error(`size.forTravel: no beam model for ${kind}`);
    const want = force ?? (energy != null ? (2 * energy) / travel : null), target = margin * material.strainLimit;
    if (!(want > 0)) throw new Error('size.forTravel: give the force at full travel, or the energy to store');
    const mk = (L, t, w) => model({ length: L, thickness: t, width: w, ...(kind === 'serpentine' ? { turns: turns ?? 2 } : {}) }, material);
    const shortest = (t) => { const e0 = mk(10, t, 1).strain(travel); return 10 * Math.sqrt(e0 / target); }; // strain goes as 1 / L²
    const out = (L, t, w) => { const m = mk(L, t, w); return { kind, length: +L.toFixed(2), thickness: t, width: w, ...(kind === 'serpentine' ? { turns: turns ?? 2 } : {}), stiffness: m.stiffness, force: m.stiffness * travel, energy: (m.stiffness * travel * travel) / 2, strain: m.strain(travel), ratio: travel / L }; };
    for (const t of lines(printer, 2, 12)) {
      const L = Math.ceil(shortest(t) * 100) / 100;
      if (L > maxLength) return null; // thicker only needs longer
      if (width != null) { // the width is fixed: the thickness sets the force; lengthen it to give just that
        const most = mk(L, t, width).stiffness * travel;
        if (most < want) continue;
        const longer = L * Math.cbrt(most / want); // stiffness goes as 1 / L³
        return out(Math.min(longer, maxLength), t, width);
      }
      const k1 = mk(L, t, 1).stiffness, w = Math.ceil(want / (k1 * travel) / printer.layer - 1e-9) * printer.layer; // the force from the width, whole layers
      if (w <= maxWidth) return out(L, t, +w.toFixed(4));
    }
    return null;
  },
  /** A leaf for a force at a travel: tip force F at travel δ. @returns {{ length: number, thickness: number, width: number, stiffness: number, strain: number } | null} */
  leaf({ travel, force, width, material, margin = 0.8, maxLength = Infinity }, printer) {
    for (const t of lines(printer)) {
      const L = Math.cbrt((material.E * width * t ** 3 * travel) / (4 * force)), m = leafModel({ length: L, thickness: t, width }, material);
      if (L <= maxLength && m.strain(travel) <= margin * material.strainLimit) return { length: +L.toFixed(2), thickness: t, width, stiffness: m.stiffness, strain: m.strain(travel) };
    }
    return null;
  },
  /** A fixed-guided beam, or one leaf of a guide. */
  fixedGuided({ travel, force, width, material, margin = 0.8, maxLength = Infinity }, printer) {
    for (const t of lines(printer)) {
      const L = Math.cbrt((material.E * width * t ** 3 * travel) / force), m = fixedGuidedModel({ length: L, thickness: t, width }, material);
      if (L <= maxLength && m.strain(travel) <= margin * material.strainLimit) return { length: +L.toFixed(2), thickness: t, width, stiffness: m.stiffness, strain: m.strain(travel) };
    }
    return null;
  },
  /** A compound guide (or folded guide) for a force at a travel: each beam takes half the travel. */
  compoundGuide({ travel, force, width, material, margin = 0.8, maxLength = Infinity }, printer) {
    for (const t of lines(printer)) {
      const L = Math.cbrt((material.E * width * t ** 3 * travel) / force), m = compoundGuideModel({ length: L, thickness: t, width }, material);
      if (L <= maxLength && m.strain(travel) <= margin * material.strainLimit) return { length: +L.toFixed(2), thickness: t, width, stiffness: m.stiffness, strain: m.strain(travel) };
    }
    return null;
  },
  /** A serpentine for a force at a travel in a box: the fewest turns of the longest leaf that fits `box` along x. */
  serpentine({ travel, force, width, material, box, margin = 0.8 }, printer) {
    for (const t of lines(printer)) for (let n = 2; n <= 12; n++) {
      const L = Math.min(box, Math.cbrt((material.E * width * t ** 3 * travel) / (n * force))), m = serpentineModel({ length: L, thickness: t, width, turns: n }, material);
      if (Math.abs(m.stiffness * travel - force) / force < 0.05 && m.strain(travel) <= margin * material.strainLimit) return { length: +L.toFixed(2), thickness: t, width, turns: n, stiffness: m.stiffness, strain: m.strain(travel) };
    }
    return null;
  },
  /** A notch hinge for an angle (radians) at a torque (N·mm): the thinnest neck and the radius that reach it within the strain limit. */
  notchHinge({ angle, torque, width, material, margin = 0.8, radii = [1.5, 2, 3, 4, 5, 6] }, printer) {
    for (const t of lines(printer)) for (const R of radii) {
      const m = notchHingeModel({ radius: R, neck: t, width }, material);
      if (m.strain(angle) <= margin * material.strainLimit && (torque == null || m.stiffness * angle <= torque)) return { radius: R, neck: t, width, stiffness: m.stiffness, strain: m.strain(angle) };
    }
    return null;
  },
  /** A living hinge for an angle: the thinnest strip and the shortest length within the strain limit. */
  livingHinge({ angle, width, material, margin = 0.8 }, printer) {
    for (const t of lines(printer)) {
      const l = Math.ceil(((t * angle) / (2 * margin * material.strainLimit)) * 100) / 100, m = livingHingeModel({ flex: l, thickness: t, width }, material); // rounded up, so the margin holds
      return { flex: l, thickness: t, width, stiffness: m.stiffness, strain: m.strain(angle) };
    }
    return null;
  },
  /** A constant-force mechanism for a force over a stroke: the thinnest leaf (whole lines) and the length whose flat stretch covers the stroke at about the force. */
  constantForce({ force, stroke, width, material, margin = 0.8 }, printer) {
    for (const t of lines(printer)) for (let l = 20; l <= 120; l += 5) {
      const m = constantForceModel({ leaf: l, thickness: t, width }, material);
      if (m.flat.to >= stroke && m.flat.force >= force && m.strain(stroke) <= margin * material.strainLimit) return { leaf: l, thickness: t, width, crank: l / 2, force: m.flat.force, flat: m.flat, strain: m.strain(stroke) };
    }
    return null;
  },
};

/**
 * One report for a mechanism's worth of flexures: each one's print findings and its strain at the travel or angle
 * its pose gives it, and a line for the whole. Travels in mm for the ones that bend, angles in radians for the ones
 * that turn (`moves: 'turn'` in ports).
 * @param {{ name: string, kind: string, params: object, travel?: number, angle?: number, stop?: number | false }[]} parts
 * @param {{ line: number, layer: number, wall_min?: number }} printer @param {{ E: number, strainLimit?: number, name?: string }} material
 * @returns {{ findings: { level: string, text: string, code: string, part: string }[], worst: { part: string, strain: number } | null, ok: boolean }}
 */
export function report(parts, printer, material) {
  const findings = [];
  let worst = null;
  for (const part of parts) {
    const model = models[part.kind]?.(part.params, material), turning = ports(part.kind, part.params).moves === 'turn';
    if (!model) { findings.push({ level: 'fail', text: `${part.name}: no model for ${part.kind}`, code: 'flexure.kind', part: part.name }); continue; }
    const travel = turning ? part.angle : part.travel, dims = { thickness: part.params.thickness ?? part.params.neck ?? part.params.bar, width: part.params.width };
    for (const f of printable({ ...dims, travel: turning ? undefined : travel, stop: part.stop }, printer, material, model)) findings.push({ ...f, part: part.name });
    if (travel != null && model.strain) {
      const e = model.strain(travel), limit = material.strainLimit;
      if (turning && limit != null) findings.push({ level: e <= limit ? 'pass' : 'fail', text: `${part.name}: at ${((travel * 180) / Math.PI).toFixed(1)}° the material sees ${(e * 100).toFixed(2)}% strain${e <= limit ? ', within' : ', over'} the limit of ${(limit * 100).toFixed(1)}%`, code: 'flexure.strain', part: part.name });
      if (!worst || e > worst.strain) worst = { part: part.name, strain: e };
    }
  }
  const ok = !findings.some((f) => f.level === 'fail');
  findings.push({ level: ok ? 'pass' : 'fail', text: worst ? `${parts.length} flexures; the most strained is ${worst.part} at ${(worst.strain * 100).toFixed(2)}%${ok ? ': all within their limits' : ''}` : `${parts.length} flexures`, code: 'mechanism', part: '' });
  return { findings, worst, ok };
}

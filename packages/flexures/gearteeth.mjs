// Gear teeth on flexures, for gears without backlash: each involute tooth of @rulecad/gears split down its middle by a
// slit into two compliant halves, and each gap's root cut on down by a second slit, so every half is a long member
// standing on the rim. Drawn a little fuller than its mate's gap, the mate's tooth, entering a gap, pushes the two
// halves that face it back into their slits and is held between them on both flanks. The principle is
// the compliant anti-backlash gear of Smith, Ricks and Morrise (US 2023/0003291 A1, 2023): each tooth a pair of
// compliant members with a gap between them, the tooth gaps running on down between the members too, the mating
// tooth wider than the tooth gap, the members pressed apart and pinching it. The slit's own width is a stop: driven
// hard, a half closes onto its sibling and the two bend on together as a whole tooth. The involute, its circles and
// the mesh are @rulecad/gears'; the slits and the members' sums are ours.
//
// Drawn flat: the gear in x and y, its first tooth on +x, the print from z = 0 up to the width. Units: mm, N, MPa.
import jscad from '@jscad/modeling';
import { gearModel, spurProfile, mesh } from '@rulecad/gears';
import { beamSystem, equilibrium } from './beams.mjs';
import { size, n2, rad } from './pivots.mjs';

const { polygon, circle, rectangle } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { hull } = jscad.hulls;
const { rotateZ } = jscad.transforms;
const { extrudeLinear } = jscad.extrusions;
const { measureVolume } = jscad.measurements;

/**
 * @typedef {{ module: number, teeth: number, width: number, pressureAngle?: number, slit?: number, depth?: number,
 *   preload?: number, mateBacklash?: number, bore?: number }} SplitToothGear
 *   module, teeth, pressureAngle: the involute's, as @rulecad/gears takes them (drawn with no backlash of its own);
 *   width: the gear's face, up z; slit: each tooth's slit and each gap's, across (default 0.4); depth: how far the slit runs on below
 *   the root circle, and the gaps' slits with it (default four modules: the members' length, and so how soft they are); preload: how far each half is pushed back along the flank's normal by a mate
 *   in mesh at the standard centre distance (default 0.1); mateBacklash: the mate's backlash as @rulecad/gears draws
 *   it (default its 0.15), which the halves take up before they preload; bore: the shaft's hole (default none)
 */
function splitLayout(p, what) {
  if (!p || typeof p !== 'object') throw new Error(`${what}: give the gear's parameters (module, teeth, width)`);
  const W = size(what, p, 'width'), mod = size(what, p, 'module'), w = size(what, p, 'slit', 'slit', 0.4), depth = size(what, p, 'depth', 'depth', 4 * mod), pre = size(what, p, 'preload', 'preload', 0.1);
  const mb = p.mateBacklash ?? 0.15;
  if (!(typeof mb === 'number' && mb >= 0)) throw new Error(`${what}: mateBacklash is the mate's backlash in mm, 0 or more (got ${JSON.stringify(p.mateBacklash)})`);
  const spec = { module: mod, teeth: p.teeth, pressureAngle: p.pressureAngle, backlash: 0, ...(p.bore != null ? { bore: p.bore } : {}) };
  const g = gearModel(spec), al = g.pressureAngle * rad, r = g.pitch / 2, rb = g.base / 2, ra = g.tip / 2, rf = g.root / 2, z = g.teeth;
  // each flank grows along its normal by the preload and by the mate's thinning there (half its backlash, along the
  // pitch circle, cos α along the normal; split over the two flanks of the gap)
  const grow = pre + (mb / 4) * Math.cos(al), rs = rf - depth;
  if (pre >= w) throw new Error(`${what}: preload ${pre} is the slit's ${w} or more: the halves would close on each other in mesh, with nothing left to give. A wider slit or less preload`);
  if (!(rs > 2 * mod)) throw new Error(`${what}: depth ${depth} takes the slits to the middle: under ${n2(rf - 2 * mod)}`);
  if (p.bore != null && rs - w / 2 < p.bore / 2 + 2 * mod) throw new Error(`${what}: the slits run down to ${n2(2 * (rs - w / 2))} mm across, leaving under two modules of rim over the ${p.bore} mm bore: a shallower depth or a smaller bore`);
  return { W, mod, w, depth, pre, mb, spec, g, al, r, rb, ra, rf, z, grow, rs };
}
// The drawn outline: the involute grown by `grow`, and a slit down each tooth's middle from past the tip to rs,
// round-ended
function splitFlat(k) {
  const prof = spurProfile(k.spec, k.grow), outline = polygon({ points: prof.loops[0] });
  const holes = prof.loops.slice(1).map((l) => polygon({ points: [...l].reverse() }));
  const slit0 = hull(circle({ radius: k.w / 2, center: [k.rs, 0], segments: 24 }), rectangle({ size: [0.01, k.w], center: [k.ra + 2, 0] }));
  const slit1 = hull(circle({ radius: k.w / 2, center: [k.rs, 0], segments: 24 }), rectangle({ size: [0.01, k.w], center: [k.rf + 0.2, 0] })); // (the gap's: up into the gap's air)
  const slits = Array.from({ length: k.z }, (_, i) => [rotateZ((2 * Math.PI * i) / k.z, slit0), rotateZ((2 * Math.PI * (i + 0.5)) / k.z, slit1)]).flat();
  return { outline: subtract(outline, ...holes, ...slits), loop: prof.loops[0] };
}

/**
 * A spur gear whose teeth are split into compliant halves (SplitToothGear above), drawn at rest: the involute of
 * @rulecad/gears grown by the preload, a slit down each tooth. Meshed with a plain gear of the same module at the
 * standard centre distance, it runs without backlash.
 * @param {SplitToothGear} p
 * @returns {object} a JSCAD geom3, its face on the bed
 */
export function splitToothGear(p) {
  const k = splitLayout(p, 'splitToothGear');
  return extrudeLinear({ height: k.W }, splitFlat(k).outline);
}

// A member's width (along the pitch circle's tangent) at radius ρ, read off the drawn outline: from the tooth's slit
// to the flank above the root, to the gap's slit below it
function halfWidth(k, loop) {
  const flank = loop.map(([x, y]) => [Math.hypot(x, y), Math.atan2(y, x)]).filter(([, th]) => th >= 0 && th <= Math.PI / k.z);
  return (rho) => {
    let th = Math.PI / k.z - k.w / (2 * rho);
    for (let i = 1; i < flank.length; i++) {
      const [ra, ta] = flank[i - 1], [rb, tb] = flank[i];
      if ((ra - rho) * (rb - rho) <= 0 && ra !== rb) { th = Math.min(th, ta + ((tb - ta) * (rho - ra)) / (rb - ra)); }
    }
    return rho * th - k.w / 2;
  };
}

/**
 * What a split-tooth gear does in mesh with a plain gear of the same module: each half as a cantilever from the
 * slit's end to the pitch point, its width read off the drawn tooth, loaded along the line of action; its stiffness
 * along the flank's normal (bending and shear, Timoshenko), the preload the mate's tooth puts on it, the torque up to
 * which the mesh has no backlash (2 F rb: the driving half takes on what the trailing half lets go of, until it lets
 * go entirely), the force at which a half closes its slit (the stop) and the strain there, against the limit; the
 * halves' widths in printed lines, the mesh's numbers from @rulecad/gears, and the grams. Beside it, the beam solver
 * on the same tapered half, for its bending.
 * @param {SplitToothGear} p
 * @param {{ E: number, strainLimit: number, nu?: number, density?: number, name?: string }} m
 * @param {{ mate?: number, torque?: number, printer?: { line: number, layer: number, wall_min?: number, gap?: number } }} [o] mate: its teeth (default
 *   as many); torque: what it drives, N·mm, its strain checked against the limit (default the hold)
 * @returns {{ stiffness: number, solvedBending: number, bending: number, preload: number, force: number, hold: number, strain: number,
 *   stop: { force: number, strain: number }, driven: { torque: number, force: number, strain: number, margin: number }, halves: { pitch: number, tip: number, root: number },
 *   mesh: { centre: number, contact: number }, grams: number | null, findings: object[], rests: string[] }}
 *   stiffness: a half's, N/mm along the flank's normal at the pitch point; bending: its bending part alone (no shear),
 *   and solvedBending: the beam solver's; preload: mm each half is pushed back; force: N it pushes the mate with;
 *   hold: N·mm, the torque the mesh carries with no backlash; strain: at the preload; stop: the force on a half's flank
 *   when its slit closes, and the strain then; driven: at the torque, the driving half's flank force, its strain and
 *   the limit over it; halves: each half's width at the pitch, tip and slit's end
 */
export function splitToothGearModel(p, m, o = {}) {
  const what = 'splitToothGearModel', k = splitLayout(p, what);
  if (!(m && m.E > 0)) throw new Error(`${what}: the material needs a modulus E above 0 MPa (got ${m?.E})`);
  if (!(m.strainLimit > 0)) throw new Error(`${what}: the material needs a strainLimit (flexureMaterial(rules) gives one)`);
  const out = [], f = (level, text, code, extra) => out.push({ level, text, code, ...extra }), lim = m.strainLimit, nu = m.nu ?? 0.36, G = m.E / (2 * (1 + nu));
  const flat = splitFlat(k), h = halfWidth(k, flat.loop), r = k.r, n = 400;
  // Castigliano on the half, a tangential unit load at the pitch radius: bending (r - ρ)² / EI and shear 1 / κGA over
  // the half from the slit's end; and to the tip, for where it closes its slit, (r - ρ)(ra - ρ) / EI
  let bend = 0, shear = 0, toTip = 0;
  const step = (r - k.rs) / n;
  for (let i = 0; i < n; i++) {
    const rho = k.rs + (i + 0.5) * step, hw = h(rho), I = (k.W * hw ** 3) / 12;
    if (!(hw > 0)) throw new Error(`${what}: the slit leaves no half tooth at ${n2(rho)} mm from the centre: a narrower slit`);
    bend += ((r - rho) ** 2 / (m.E * I)) * step; shear += (1 / ((5 / 6) * G * k.W * hw)) * step; toTip += (((r - rho) * (k.ra - rho)) / (m.E * I)) * step;
  }
  const ca = Math.cos(k.al), Ct = bend + shear, stiffness = 1 / (Ct * ca * ca), bending = 1 / (bend * ca * ca);
  // the solver: the half as a beam up the tooth's middle line (offset to its own middle), spans as wide as the half
  const pts = Array.from({ length: 41 }, (_, i) => k.rs + ((r - k.rs) * i) / 40), sys = beamSystem({ bodies: { rim: { at: [0, 0], fixed: true } }, beams: [{ name: 'half', path: pts.map((x) => [x, 0]), thickness: pts.slice(1).map((x, i) => h((x + pts[i]) / 2)), width: k.W, E: m.E, from: 'rim' }], segments: 80 });
  const tip = sys.nodes[sys.nodes.length - 1], probe = 1, eq = equilibrium(sys, { loads: new Map([[tip.dof + 1, probe]]) }), solvedBending = probe / (eq.q[tip.dof + 1] * ca * ca);
  // preload and its strain; the hold torque; the stop
  const force = stiffness * k.pre, strainAt = (Ft) => { let e = 0; for (let i = 0; i <= n; i++) { const rho = k.rs + i * step, hw = h(rho); e = Math.max(e, (6 * Ft * (r - rho)) / (m.E * k.W * hw * hw)); } return e; };
  const strain = strainAt(force * ca), hold = 2 * force * k.rb, Fstop = k.w / (toTip + shear), stopStrain = strainAt(Fstop);
  // Driven with a torque T on one pair of teeth: up to the hold the driving half takes its preload and half of T / rb
  // (the trailing half lets go of the rest); past it, all of T / rb. Past the stop (its slit closed) the half and its
  // sibling bend on together, sharing what is more: the strain then is the stop's and the half's share of the rest
  // (more members join as each next slit closes, so this is the most it can be)
  const T = o.torque ?? hold;
  if (!(typeof T === 'number' && T > 0)) throw new Error(`${what}: torque is what the gear drives, N·mm above 0 (got ${JSON.stringify(o.torque)})`);
  const Fn = T <= hold ? force + T / (2 * k.rb) : T / k.rb, Ft = Fn * ca, driven = Ft <= Fstop ? strainAt(Ft) : stopStrain + strainAt((Ft - Fstop) / 2), margin = lim / driven;
  const halves = { pitch: h(r), tip: h(k.ra - 0.05), root: h(k.rs) };
  const mate = gearModel({ module: k.mod, teeth: o.mate ?? k.z, pressureAngle: k.g.pressureAngle }), ms = mesh(k.g, mate);
  const rests = ['each half a cantilever from the slit\'s end, its width read off the drawn tooth, loaded at the pitch point along the line of action; the rim under it taken as rigid, and the radial part of the load left out', 'one pair of teeth in mesh carries the preload (the contact ratio shares it, so the hold is the least)', 'the strain is the nominal bending\'s: each slit\'s round end (a radius of half the slit) raises it at the root by a factor this leaves out, so keep to the twice margin', 'the mate\'s backlash and the preload as drawn: a printed tooth comes out fuller or thinner by about a tenth of a millimetre, so measure it before relying on the hold', `the principle (a pair of compliant members per tooth, the mating tooth wider than the gap) is US 2023/0003291 A1's; the slit on the kit's involute is ours`];
  f('pass', `a mate in mesh at ${n2(ms.centre)} mm pushes each half back ${k.pre} mm along the flank (the gear is drawn ${n2(k.grow, 3)} mm fuller each flank, the mate's ${k.mb} mm backlash taken up first): each half ${n2(stiffness)} N/mm, so ${n2(force)} N on each flank, ${n2(strain * 100, 2)}% strain. No backlash up to ${n2(hold, 1)} N·mm (2 F rb)`, 'gear.preload', { values: { stiffness, force, hold, strain, grow: k.grow } });
  f('info', `driven harder, a half closes its ${k.w} mm slit at ${n2(Fstop / ca)} N on its flank (${n2(stopStrain * 100, 2)}% strain), and bends on with its sibling from there`, 'gear.stop', { values: { force: Fstop / ca, strain: stopStrain } });
  f(margin >= 2 ? 'pass' : margin >= 1 ? 'warn' : 'fail', `driving ${n2(T, 1)} N·mm${o.torque == null ? ' (the hold: give torque for yours)' : ''}, the driving half takes ${n2(Fn)} N on its flank${Ft > Fstop ? ', its slit closed' : ''}: ${n2(driven * 100, 2)}%, ${n2(margin)} times under the limit of ${n2(lim * 100, 1)}%${margin >= 2 ? '' : margin >= 1 ? ', under the twice it should have: a deeper slit, a wider face or a bigger module' : ': over it'}`, 'flexure.strain', { values: { torque: T, force: Fn, strain: driven, limit: lim, margin } });
  if (o.printer) {
    const line = o.printer.line, least = (o.printer.wall_min ?? 2 * line) / line;
    f(halves.pitch / line >= least - 0.05 ? 'pass' : 'fail', `each half is ${n2(halves.pitch)} mm wide at the pitch circle, ${n2(halves.pitch / line)} lines of ${line} mm${halves.pitch / line >= least - 0.05 ? '' : `: under ${least} lines, too thin to print as a wall. A bigger module or a narrower slit`}`, 'gear.halves', { values: halves });
    if (halves.tip < line) f('warn', `each half is ${n2(halves.tip)} mm at the tip, under one ${line} mm line: the tips print ragged. A bigger module`, 'gear.halves', { values: halves });
    const gap = o.printer.gap ?? 0.3;
    if (k.w < gap) f('fail', `the ${k.w} mm slit is under the printer's ${gap} mm gap: the halves print fused`, 'gear.slit', { values: { slit: k.w, gap } });
  }
  f(ms.contact >= 1.2 ? 'pass' : 'warn', `with a ${mate.teeth}-tooth mate: centre ${n2(ms.centre)} mm, contact ratio ${n2(ms.contact)} (@rulecad/gears)`, 'gear.mesh', { values: { centre: ms.centre, contact: ms.contact } });
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(splitToothGear(p)) / 1000) * m.density; f('pass', `${n2(grams, 1)} g printed${m.name ? ` in ${m.name}` : ''}`, 'gear.mass', { values: { grams } }); }
  return { stiffness, bending, solvedBending, preload: k.pre, force, hold, strain, stop: { force: Fstop / ca, strain: stopStrain }, driven: { torque: T, force: Fn, strain: driven, margin }, halves, mesh: { centre: ms.centre, contact: ms.contact }, grams, findings: out, rests };
}

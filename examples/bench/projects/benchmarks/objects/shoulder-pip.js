// The bench shoulder printed in place: the compound planetary in one print, with nothing to put together but the motor.
// Printed the other way up from the assembled one: the output ring on the bed, the held ring above it inside the
// housing's skirt, the motor on the housing's roof, face down. Every part stands on the bed; every gap between them is
// the printer's print gap, the housing's underside, the planets' upper step and the sun's teeth rise at 45° where they
// pass over another part. The variants draw one part each, unrotated, for the assembly.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives
const { translate, rotateX, rotateZ } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('17HS4401')
  const deg = Math.PI / v.half_turn
  // The teeth, as compoundPlanetary finds them printed in place: the .json's are the ones it must find
  const box = v.gears.compoundPlanetary({ module: v.module, ratio: v.ratio, planets: v.planets, step: v.step, printInPlace: true, gap: v.gap, helix: v.helix }), b = box.best
  const found = [b.sun.teeth, b.planet.teeth, b.planet2.teeth, b.ring.teeth, b.ring2.teeth], given = [v.sun, v.planet, v.planet2, v.ring, v.ring2]
  if (found.some((t, k) => t !== given[k])) throw new Error(`compoundPlanetary finds teeth ${found.join('/')}, the .json says ${given.join('/')}: set sun, planet, planet2, ring and ring2 to its`)
  const pip = b.printInPlace, spec = { module: v.module, backlash: pip.backlash, dedendum: pip.dedendum }
  const gear = (teeth, hand, width, chamfer) => v.gears.herringbone({ ...spec, teeth, hand, helix: pip.helix, width, chamfer })
  const plain = (teeth, width) => v.gears.spur({ ...spec, teeth, width, chamfer: 0 })
  const ring = (teeth, hand, width, rim, chamfer) => v.gears.internal({ ...spec, teeth, hand, helix: pip.helix, herringbone: true, width, rim, chamfer })
  const plainRing = (teeth, width, rim) => v.gears.internal({ ...spec, teeth, width, rim, chamfer: 0 })
  const disc = (r, z0, z1) => cylinder({ radius: r, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: v.segments })
  const cone = (r0, r1, z0, z1) => cylinderElliptic({ startRadius: [r0, r0], endRadius: [r1, r1], height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: v.segments })

  // Heights: the output stage on the bed, the held stage a gap above it, the roof's cone over the planets
  const g = v.gap, c = v.chamfer, a = b.centre, z1 = v.low + g, top = z1 + v.high
  const tipP1 = b.planet.model.tip / 2, tipP2 = b.planet2.model.tip / 2, rootR1 = b.ring.model.root / 2, rootR2 = b.ring2.model.root / 2
  const reach = a + tipP1 + g // the planets' upper step, at its widest, and a gap
  const under = z1 + g + a + tipP2 + g // the housing's underside: z = under − r, a gap above the planets' lower step everywhere
  const roofAt = top + g + reach // the roof's underside: z = roofAt − r, a gap above the planets' tops
  const face = roofAt - v.opening / 2 + v.lip // the motor's face, on the roof
  if (Math.abs(face - v.face) > v.gap / v.half_turn) throw new Error(`the motor's face is at ${face} mm and the .json's face, its anchor, at ${v.face}: make them agree`)
  const R2 = v.rim2 / 2, skirt = R2 + g, R = skirt + v.wall

  // The planet: its lower step (on the output ring) on the bed and on up a gap, its upper step (on the sun and the
  // held ring) widening at 45° from the lower's tips, so it prints on it
  const planet = () => v.ops.union(gear(v.planet2, 'left', v.low, undefined), translate([0, 0, v.low], plain(v.planet2, g)),
    v.ops.intersect(translate([0, 0, z1], gear(v.planet, 'left', v.high, 0)), cone(tipP2, tipP2 + v.high, z1, top)))
  // The sun: a hub on the bed inside the planets' lower step, its teeth widening at 45° once over it, a hub on up to
  // the motor with the shaft's D bore, from the top
  const sunPart = () => {
    const hub = a - tipP2 - g, teeth = v.ops.union(translate([0, 0, z1 - g], plain(v.sun, g)), translate([0, 0, z1], gear(v.sun, 'right', v.high, 0)))
    const shape = v.ops.union(cone(hub - c, hub, 0, c), disc(hub, c, z1 - g), v.ops.intersect(teeth, v.ops.union(disc(hub, z1 - g, z1 + g), cone(hub, hub + v.high, z1 + g, top))), disc(v.hub / 2, top, face - motor.boss.height - g))
    const mouth = face - motor.boss.height - g, tip = motor.shaft.length - (face - mouth), depth = tip + 1
    const bore = translate([0, 0, mouth], rotateX(Math.PI, v.motors.bore(motor, { depth, tip, fit: 'slide', printer: { hole_comp: v.comp } }, v.ops)))
    return v.ops.subtract(shape, bore)
  }
  // The output ring: on the bed, its top cut back at 45° under the housing, a gap from it; four pilots from below for
  // the arm's screws, from v.fixings
  const output = () => {
    const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
    const outline = v.ops.intersect(v.ops.union(cone(R2 - c, R2, 0, c), disc(R2, c, v.low)), cone(under - g * Math.SQRT2, under - g * Math.SQRT2 - v.low, 0, v.low))
    const holes = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: pilot / 2, height: v.pilot_depth + c, center: [v.bolt * Math.cos((2 * k + 1) * Math.PI / v.bolts), v.bolt * Math.sin((2 * k + 1) * Math.PI / v.bolts), (v.pilot_depth - c) / 2], segments: v.segments / 2 }))
    return v.ops.subtract(v.ops.intersect(ring(v.ring2, 'left', v.low, v.rim2 + 2 * v.wall, undefined), outline), holes)
  }
  // The housing: the held ring standing on its skirt, its underside at 45° over the output ring, the roof's cone over the
  // planets up to the motor's face; the motor's four screws come up from below between the planets, their flat heads
  // in countersinks from v.fixings
  const housing = () => {
    const teeth = v.ops.union(plainRing(v.ring, z1, 2 * R), translate([0, 0, z1], ring(v.ring, 'left', v.high, 2 * R, 0)))
    const below = v.ops.union(v.ops.intersect(cone(under, under - top, 0, top), disc(skirt, 0, top)), cone(skirt + c, skirt, 0, c))
    const roof = v.ops.subtract(disc(R, top, face), cone(reach + g, v.opening / 2, top, roofAt - v.opening / 2), disc(v.opening / 2, top, face + 1))
    const seat = face - v.plate
    const screws = motor.mount.holes.map(([x, y]) => v.ops.union(v.fixings.countersink('M3', { into: '+z', at: [x, y, seat], length: v.plate + 1 }), translate([x, y, 0], disc(v.fixings.countersinkModel('M3').diameter / 2, top, seat))))
    return v.ops.subtract(v.ops.union(v.ops.subtract(teeth, below), roof), screws)
  }

  // One part alone, unrotated at the origin (the assembly's variants), or the whole gearbox as it prints, turned so the
  // held ring is at 0
  if (v.alone) {
    const one = v.housing ? { housing: housing() } : v.sun_part ? { sun: sunPart() } : v.planets_part ? { planet_a: planet() } : { output: output() }
    return one
  }
  const turn = -b.ring.angle * deg, placed = (k) => { const p = b.planets[k], at = rotateZ(turn, translate([p.at[0], p.at[1], 0], rotateZ(p.angle * deg, planet()))); return at }
  return { housing: housing(), sun: rotateZ(turn, sunPart()), planet_a: placed(0), planet_b: placed(1), planet_c: placed(2), output: rotateZ(b.ring2.angle * deg + turn, output()) }
}

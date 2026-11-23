// The bench shoulder printed in place, its parts drawn for shoulder-pip (the whole print) and for the assembly's
// objects (shoulder-pip-housing, -sun, -planet, -output), from shoulder-pip's numbers.
// Printed the other way up from the assembled one: the output ring on the bed, the held ring above it inside the
// housing's skirt, the motor on the housing's roof, face down. Every part stands on the bed; every gap between them is
// the printer's print gap; the housing's underside, the planets' upper step and the sun's teeth rise at 45° where they
// pass over another part.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, cuboid } = jscad.primitives
const { hull } = jscad.hulls
const { translate, rotateX, rotateZ } = jscad.transforms

// The motor's four screws, from v.motors and v.fixings: its own thread, hexagon-headed so a spanner turns them in the
// posts' windows, at the longest length sold that mountModel lets through the posts' tops (plate) without bottoming out
// in the motor's thread. The figures the posts are drawn to (plate, window_w, window_h) are held to that screw here: the
// thread and its head are never typed in the .json
export function pipScrews (v) {
  const motor = v.motors.motorModel('17HS4401'), thread = motor.mount.thread
  const most = v.motors.mountModel(motor, { plate: v.plate, screw: `${thread} hex` }).screwLength
  const length = Math.max(...v.fixings.fixingModel(thread).figures.lengths.value.filter((l) => l <= most))
  const screw = v.fixings.screwModel(`${thread}x${length} hex`), mount = v.motors.mountModel(motor, { plate: v.plate, screw: screw.name })
  const said = mount.findings.filter((f) => f.level === 'fail' || f.level === 'warn').map((f) => f.text)
  if (said.length) throw new Error(`the posts' tops (plate, ${v.plate} mm) under the motor: ${said.join('; ')}`)
  if (v.window_w < screw.headDiameter + 2 * v.gap) throw new Error(`each post's window (window_w, ${v.window_w} mm) is narrower than ${screw.name}'s head across its corners (${screw.headDiameter} mm) and a print gap each side`)
  if (v.window_h < screw.headHeight + v.gap) throw new Error(`each post's window (window_h, ${v.window_h} mm) is lower than ${screw.name}'s head (${screw.headHeight} mm) and a print gap`)
  return { thread, screw, mount }
}

export function pipParts (v) {
  const motor = v.motors.motorModel('17HS4401')
  const deg = Math.PI / v.half_turn
  // The teeth, as compoundPlanetary finds them printed in place: the .json's are the ones it must find
  const box = v.gears.compoundPlanetary({ module: v.module, ratio: v.ratio, planets: v.planets, step: v.step, printInPlace: true, gap: v.clear, helix: v.helix }), b = box.best
  const found = [b.sun.teeth, b.planet.teeth, b.planet2.teeth, b.ring.teeth, b.ring2.teeth], given = [v.sun, v.planet, v.planet2, v.ring, v.ring2]
  if (found.some((t, k) => t !== given[k])) throw new Error(`compoundPlanetary finds teeth ${found.join('/')}, the .json says ${given.join('/')}: set sun, planet, planet2, ring and ring2 to its`)
  const pip = b.printInPlace, spec = { module: v.module, backlash: pip.backlash, dedendum: pip.dedendum }
  const gear = (teeth, hand, width, chamfer) => v.gears.herringbone({ ...spec, teeth, hand, helix: pip.helix, width, chamfer })
  const plain = (teeth, width) => v.gears.spur({ ...spec, teeth, width, chamfer: 0 })
  const ring = (teeth, hand, width, rim, chamfer) => v.gears.internal({ ...spec, teeth, hand, helix: pip.helix, herringbone: true, width, rim, chamfer })
  const plainRing = (teeth, width, rim) => v.gears.internal({ ...spec, teeth, width, rim, chamfer: 0 })
  // The first layer of the teeth on the bed, straight-cut with the gap the first layer needs (it spreads foot each side
  // as it is squashed on): the backlash and tip room for that gap, as compoundPlanetary works them out for the rest
  const firstGap = v.clear + 2 * v.foot, alpha = b.sun.model.pressureAngle * deg
  // (teeth that thin come to a point at a full addendum: the bed layer's tips are cut back to bed_addendum)
  const bedSpec = { module: v.module, backlash: (2 * firstGap) / Math.cos(alpha), addendum: v.bed_addendum, dedendum: Math.max(pip.dedendum, v.bed_addendum + firstGap / v.module), chamfer: 0 }
  const bedGear = (teeth) => v.gears.spur({ ...bedSpec, teeth, width: v.layer })
  const bedRing = (teeth, rim) => v.gears.internal({ ...bedSpec, teeth, width: v.layer, rim })
  const disc = (r, z0, z1) => cylinder({ radius: r, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: v.segments })
  const cone = (r0, r1, z0, z1) => cylinderElliptic({ startRadius: [r0, r0], endRadius: [r1, r1], height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: v.segments })

  // Heights: the output stage on the bed, the held stage a gap above it, the roof's cone over the planets
  // (the held stage's teeth run straight for s0 before they turn, so where the housing's underside and the planets'
  // upper step widen at 45° the teeth don't twist as well: the two together lean past what prints)
  const g = v.clear, c = v.chamfer, a = b.centre, z1 = v.low + g, top = z1 + v.high, s0 = v.straight
  const tipP1 = b.planet.model.tip / 2, tipP2 = b.planet2.model.tip / 2, rootR1 = b.ring.model.root / 2, rootR2 = b.ring2.model.root / 2
  const reach = a + tipP1 + g // the planets' upper step, at its widest, and a gap
  const under = z1 + g + a + tipP2 + g // the housing's underside: z = under − r, a gap above the planets' lower step everywhere
  const roofAt = top + g + reach // the roof's underside: z = roofAt − r, a gap above the planets' tops
  const roofTop = roofAt - v.opening / 2 + v.lip, face = roofTop + v.window_h + (v.window_w - v.bridge) / 2 + v.plate // the roof's top, and the motor's face on its posts
  if (Math.abs(face - v.face) > v.gap / v.half_turn) throw new Error(`the motor's face is at ${face} mm and the .json's face, its anchor, at ${v.face}: make them agree`)
  const R2 = v.rim2 / 2, skirt = R2 + g, R = skirt + v.wall

  // The planet: its lower step (on the output ring) on the bed and on up a gap, its upper step (on the sun and the
  // held ring) where it stands on the lower's teeth, and widening at 45° from the lower's root, so it prints on it
  const rootP2 = b.planet2.model.root / 2
  const planet = () => v.ops.union(bedGear(v.planet2), translate([0, 0, v.layer], gear(v.planet2, 'left', v.low - v.layer, 0)), translate([0, 0, v.low], plain(v.planet2, g)),
    v.ops.intersect(v.ops.union(translate([0, 0, z1], plain(v.planet, s0)), translate([0, 0, z1 + s0], gear(v.planet, 'left', v.high - s0, 0))), v.ops.union(cone(rootP2, rootP2 + v.high, z1, top), translate([0, 0, z1], plain(v.planet2, v.high)))))
  // The sun: a hub on the bed inside the planets' lower step, its teeth widening at 45° once over it, a hub on up to
  // the motor with the shaft's D bore, from the top
  const sunPart = () => {
    const hub = a - tipP2 - g, teeth = v.ops.union(translate([0, 0, z1 - g], plain(v.sun, g + s0)), translate([0, 0, z1 + s0], gear(v.sun, 'right', v.high - s0, 0)))
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
    return v.ops.subtract(v.ops.intersect(v.ops.union(bedRing(v.ring2, v.rim2 + 2 * v.wall), translate([0, 0, v.layer], ring(v.ring2, 'left', v.low - v.layer, v.rim2 + 2 * v.wall, 0))), outline), holes)
  }
  // The housing: the held ring standing on its skirt, its underside at 45° over the output ring, the roof's cone over the
  // planets, and on the roof four posts the motor sits on, face down. Each post has a window through it, its top rising
  // at 45° to what the printer bridges: an M3 hex-head screw's head goes in there and up into the motor, turned by a
  // spanner from outside
  const housing = () => {
    const teeth = v.ops.union(plainRing(v.ring, z1 + s0, 2 * R), translate([0, 0, z1 + s0], ring(v.ring, 'left', v.high - s0, 2 * R, 0)))
    const below = v.ops.union(v.ops.intersect(cone(under, under - top, 0, top), disc(skirt, 0, top)), cone(skirt + c, skirt, 0, c))
    const roof = v.ops.subtract(disc(R, top, roofTop), cone(reach + g, v.opening / 2, top, roofAt - v.opening / 2), disc(v.opening / 2, top, roofTop + 1))
    const hole = v.fixings.holeModel(pipScrews(v).thread).diameter, rise = (v.window_w - v.bridge) / 2
    const block = (x0, x1, y0, y1, z0, z2) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z2) / 2], cuboid({ size: [x1 - x0, y1 - y0, z2 - z0] }))
    const post = (x, y) => {
      const r = Math.hypot(x, y), x0 = r - v.post_r / 2, x1 = r + v.post_r / 2
      const window = hull(block(x0 - 1, x1 + 1, -v.window_w / 2, v.window_w / 2, roofTop - 1, roofTop + v.window_h), block(x0 - 1, x1 + 1, -v.bridge / 2, v.bridge / 2, roofTop + v.window_h + rise - v.gap, roofTop + v.window_h + rise))
      const shape = v.ops.subtract(block(x0, x1, -v.post_w / 2, v.post_w / 2, roofTop - 1, face), window, translate([r, 0, 0], disc(hole / 2, roofTop, face + 1)))
      return rotateZ(Math.atan2(y, x), shape)
    }
    return v.ops.union(v.ops.subtract(teeth, below), roof, motor.mount.holes.map(([x, y]) => post(x, y)))
  }

  const turn = -b.ring.angle * deg, placed = (k) => { const p = b.planets[k]; return rotateZ(turn, translate([p.at[0], p.at[1], 0], rotateZ(p.angle * deg, planet()))) }
  // Each part unrotated at the origin (the assembly's objects), and the whole gearbox as it prints, turned so the held
  // ring is at 0
  return { housing, sun: sunPart, planet, output, printed: () => ({ housing: housing(), sun: rotateZ(turn, sunPart()), planet_a: placed(0), planet_b: placed(1), planet_c: placed(2), output: rotateZ(b.ring2.angle * deg + turn, output()) }), best: b }
}

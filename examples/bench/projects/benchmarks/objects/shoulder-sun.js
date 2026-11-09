// The sun with a hub above it, for grip on the shaft's flat.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const motor = v.motors.motorModel('17HS4401')
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width })
  const hub = cylinder({ radius: v.hub / 2, height: v.tall, center: [0, 0, v.tall / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(gear, hub), v.motors.bore(motor, { depth: v.tall, tip: v.tip, printer: { hole_comp: v.comp } }, v.ops))
}

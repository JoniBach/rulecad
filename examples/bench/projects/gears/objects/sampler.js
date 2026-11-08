// The sampler plate: rows by module (largest at the back), columns by backlash. Each pair is two pins at the pair's
// centre distance with its label in front; the front row is a rack and a ring printed into the plate, each with a pin
// for a 17-tooth pinion (printed into the plate, so with no chamfer at their foot). The gears themselves are sampler-gears, printed beside it.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const modules = [v.module_a, v.module_b, v.module_c, v.module_d], backlashes = [v.backlash_a, v.backlash_b, v.backlash_c]
  const g = v.gears, z = v.teeth, cols = backlashes.length, parts = []
  const label = (text, x, y) => translate([x, y, v.thick], extrudeLinear({ height: v.emboss }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))
  const pin = (x, y) => cylinder({ radius: v.pin / 2, height: v.pin_height, center: [x, y, v.thick + v.pin_height / 2] })
  // Front row: a rack and a ring, module 1, each with a pin where its pinion meshes
  const m = 1, pinion = g.gearModel({ module: m, teeth: z })
  const rackModel = g.rackModel({ module: m, teeth: v.rack_teeth, height: v.rack_bar, backlash: v.check_backlash })
  const ringModel = g.internalModel({ module: m, teeth: v.ring_teeth, backlash: v.check_backlash })
  const rowTop = v.label + v.margin, pitchLine = rowTop - rackModel.rootLine + v.rack_bar // the rack's pitch line on the plate
  parts.push(translate([v.margin, pitchLine, v.thick], g.rack({ module: m, teeth: v.rack_teeth, width: v.width, height: v.rack_bar, backlash: v.check_backlash, chamfer: 0 })))
  parts.push(pin(v.margin + rackModel.length / 2, pitchLine + g.mesh(pinion, rackModel).centre))
  parts.push(label(`RACK M${m} B${v.check_backlash}`, v.margin + rackModel.length / 2, v.label))
  const ringX = v.column * (cols - 1) + v.column / 2, ringY = rowTop + ringModel.rim / 2
  parts.push(translate([ringX, ringY, v.thick], g.internal({ module: m, teeth: v.ring_teeth, width: v.width, backlash: v.check_backlash, chamfer: 0 })))
  parts.push(pin(ringX + g.mesh(pinion, ringModel).centre, ringY))
  parts.push(label(`RING M${m} B${v.check_backlash}`, ringX, v.label))
  let y = rowTop + ringModel.rim + v.margin
  // A row a module: a pair at each backlash, the pins the pair's centre distance apart
  for (const mod of modules) {
    const tip = mod * (z + 2), centre = mod * z, at = y + v.label + v.margin + tip / 2
    backlashes.forEach((b, k) => {
      const x0 = v.column * k + (v.column - centre) / 2
      parts.push(pin(x0, at), pin(x0 + centre, at), label(`M${mod} B${b}`, v.column * k + v.column / 2, y + v.label))
    })
    y += v.label + v.margin + tip + v.margin
  }
  const plate = cuboid({ size: [v.column * cols, y, v.thick], center: [v.column * cols / 2, y / 2, v.thick / 2] })
  return v.ops.union(plate, ...parts)
}

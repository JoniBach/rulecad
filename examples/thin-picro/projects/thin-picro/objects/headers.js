// The module's pin headers, as they join it to a board above it (the rear macropad): at each of the module's header
// holes, a 0.1 in pin through the module and the board, the strip's plastic spacer between the two. The board's
// underside is z = 0, the module below it; flip -1 mirrors the module's pins left to right (seen from above, the
// module is upside down). Not printed: a reference for an assembly.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate } = jscad.transforms
const { union } = jscad.booleans

export function main (v) {
  const holes = v.thin_picro_pins.footprints.module.pins.filter((p) => p.hole).map((p) => [v.flip * p.hole.x, p.hole.y])
  const box = (x, y, w, z0, z1) => translate([x, y, (z0 + z1) / 2], cuboid({ size: [w, w, z1 - z0] }))
  const spacer = union(...holes.map(([x, y]) => box(x, y, v.pitch - v.gap, -v.spacer, 0)))
  const pins = union(...holes.map(([x, y]) => box(x, y, v.pin, -v.spacer - v.module_t - v.below, v.board_t + v.above)))
  return { spacer, pins }
}

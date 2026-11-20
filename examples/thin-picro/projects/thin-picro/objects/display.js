// A display breakout (by default a 2.0 in ST7789, st7789_2in) as it plugs into a socket: its male header's plastic
// spacer on the socket's top, the board on the spacer, the glass panel on the board. The origin is the header's middle
// pin, at the spacer's underside (the socket's top), the board running back along -x from the header's edge.
// Not printed: a reference for an assembly.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const d = v.st7789_2in, box = (x0, x1, h, z0, z1) => translate([(x0 + x1) / 2, 0, (z0 + z1) / 2], cuboid({ size: [x1 - x0, h, z1 - z0] }))
  const right = d.header_in, left = d.header_in - d.width
  const board = box(left, right, d.height, v.spacer, v.spacer + d.thickness)
  const panel = box(left + d.panel_in, left + d.panel_in + d.panel_w, d.panel_h, v.spacer + d.thickness, v.spacer + d.thickness + d.panel_t)
  const header = translate([0, 0, v.spacer / 2], cuboid({ size: [v.pitch, d.pins * v.pitch, v.spacer] }))
  return { board, panel, header }
}

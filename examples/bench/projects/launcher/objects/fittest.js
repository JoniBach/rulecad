// The launcher's fit test: one plate with three channels for the disc and the sled (each wall a different gap from
// what slides in it, a roof over the middle where the frame's back plate would be), three leaves standing on the bed
// in windows through the floor (joined only at their roots, each window a different gap round its leaf), and a wall
// with three sideways holes for the pins (each a different radial clearance); and loose beside it a disc, a slice of
// the sled's plate and three pins with different barbs. Every test is labelled with its gap.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, cylinderElliptic } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateX } = jscad.transforms
const { hull } = jscad.hulls

const box = (lo, size) => translate(lo.map((a, i) => a + size[i] / 2), cuboid({ size }))

export function main (v) {
  const gaps = [0, 1, 2].map((i) => v.gaps + i * v.step), fmt = (g) => g.toFixed(2).replace(/0$/, '')
  const label = (s, x, y) => translate([x, y, v.floor], extrudeLinear({ height: v.label_t }, v.shapes.text({ text: s, height: v.label_h, stroke: v.stroke })))
  const add = [], cut = [], windows = [] // windows cut the floor only, never what stands in them

  // Channels along x, side by side in y: two walls a disc's thickness plus two gaps apart, as tall as the disc plus
  // two gaps above the floor; a roof over the middle at that height
  let y = 0
  const tall = v.disc + gaps[2] * 2
  for (const g of gaps) {
    const inner = v.disc_t + g * 2, h = v.floor + v.disc + g * 2
    add.push(box([0, y, v.floor - 1], [v.channel_l, v.wall, tall + 1]), box([0, y + v.wall + inner, v.floor - 1], [v.channel_l, v.wall, tall + 1]))
    add.push(box([(v.channel_l - v.roof_l) / 2, y, h], [v.roof_l, v.wall * 2 + inner, v.roof_t]))
    if (h + v.roof_t < v.floor + tall) cut.push(box([(v.channel_l - v.roof_l) / 2 - 1, y - 1, h + v.roof_t], [v.roof_l + 2, v.wall * 2 + inner + 2, tall])) // walls stop at the roof
    add.push(label(fmt(g), v.channel_l + v.spacing, y + v.wall + inner / 2))
    y += v.wall * 2 + inner + v.spacing
  }
  const channelsEnd = y

  // Leaves: each stands on the bed in a window through the floor, its root block on the floor; the window leaves the
  // gap all round it, and the travel to swing either side
  y = channelsEnd
  for (const g of gaps) {
    const x0 = v.root
    add.push(box([0, y, 0], [v.root, v.leaf_t + (g + v.travel) * 2, v.floor + v.leaf_h])) // the root block
    add.push(box([x0 - 1, y + g + v.travel, 0], [v.leaf_l + 1, v.leaf_t, v.leaf_h])) // the leaf, on the bed
    windows.push(box([x0, y, 0 - 1], [v.leaf_l + g, v.leaf_t + (g + v.travel) * 2, v.floor + 2])) // its window through the floor
    add.push(label(fmt(g), v.channel_l + v.spacing, y + v.travel + g + v.leaf_t / 2))
    y += v.leaf_t + (g + v.travel) * 2 + v.spacing
  }

  // The pin wall: standing along x, the pins' holes through it along y, teardrops pointing up so their tops print
  const wl = v.channel_l + v.spacing * 2 + v.label_h * 2 - v.spacing, wy = y, holes = [0, 1, 2].map((i) => v.hole_gaps * (i ? 2 * i : 1)) // 0.05, 0.1, 0.2
  add.push(box([0, wy, 0], [wl, v.pin_wall, v.pin_wall_h]))
  holes.forEach((c, i) => {
    const r = v.pin / 2 + c, x = wl * (i + 1) / (2 + 2), z = v.pin_wall_h / 2, len = v.pin_wall + 2
    const round = translate([x, wy + v.pin_wall / 2, z], rotateX(Math.PI / 2, cylinder({ radius: r, height: len, segments: v.smooth })))
    cut.push(hull(round, box([x - v.step / 2, wy - 1, z + r * Math.SQRT2 - v.step / 2], [v.step, len, v.step])))
    add.push(label(fmt(c), x, wy + v.pin_wall + v.spacing / 2 + v.label_h / 2))
  })
  y = wy + v.pin_wall + v.spacing + v.label_h

  // The floor under it all
  const base = v.ops.subtract(box([0 - v.spacing / 2, 0 - v.spacing / 2, 0], [v.channel_l + v.spacing * 2 + v.label_h * 2, y + v.spacing / 2, v.floor]), ...windows)
  const plate = v.ops.subtract(v.ops.union(base, ...add), ...cut)

  // Loose beside it: a disc, the sled coupon (on its face, as the sled prints), and three pins
  const lx = v.channel_l + v.spacing * 2 + v.label_h * 2 + v.spacing, r = v.disc / 2, c = v.chamfer
  const disc = translate([lx + r, r, 0], v.ops.union(cylinderElliptic({ height: c, startRadius: [r - c, r - c], endRadius: [r, r], center: [0, 0, c / 2], segments: v.smooth }), cylinder({ radius: r, height: v.disc_t - c, center: [0, 0, c + (v.disc_t - c) / 2], segments: v.smooth })))
  const coupon = box([lx, v.disc + v.spacing, 0], [v.disc, v.coupon_l, v.disc_t])
  const pins = [[v.lip_a, v.back_a], [v.lip_b, v.back_b], [v.lip_c, v.back_c]].map(([lip, back], i) => {
    const p = v.flexures.snapPin({ diameter: v.pin, length: v.pin_len, lip, back, slot: v.slot, head: v.head })
    const flats = [0, 1, 2].slice(0, i + 1).map((k) => jscad.transforms.rotateZ((k * Math.PI * 2) / (2 + 2 + 2), box([v.pin / 2 + v.head - v.flat, 0 - v.pin, 0 - 1], [v.pin, v.pin * 2, v.head + 1]))) // one, two or three flats on the foot
    return translate([lx + (v.pin + v.head * 2 + v.spacing / 2) * (i + 1 / 2), v.disc + v.coupon_l + v.spacing * 2 + v.pin, 0], v.ops.subtract(p, ...flats))
  })
  return { plate, disc, coupon, pin_a: pins[0], pin_b: pins[1], pin_c: pins[2] }
}

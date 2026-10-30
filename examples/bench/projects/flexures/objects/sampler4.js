// The fourth flexure sampler: stops and two mechanisms made compliant, on one rail along x. A leaf with travel stops at
// its tip, placed where PLA's 2% strain says; a pre-curved leaf; a contact-aided leaf whose stop bar stiffens it partway; a parallelogram
// four-bar on notch hinges; and tweezers, their spring in the rail.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const f = v.flexures, h = v.height, parts = []
  const at = (shape, dx, dy) => parts.push(translate([dx, dy, 0], shape))
  const up = (shape) => rotateZ(Math.PI / 2, shape) // a flexure drawn along x, stood off the rail along y; what pointed +y now points -x
  const material = { E: v.pla.modulus, strainLimit: v.strain_limit }
  // A leaf with travel stops: the posts stand on the rail, reaching up to the tip
  let x = v.stop_post / 2 + v.stop_reach
  const leaf = { length: v.length, thickness: v.thin, width: h }, stop = f.travelStop(leaf, material, { factor: v.stop_factor, post: v.stop_post })
  at(up(f.leaf(leaf)), x, -v.overlap)
  for (const sg of [1, -1]) parts.push(cuboid({ center: [x - sg * (v.thin / 2 + stop.at + v.stop_post / 2), (v.length - v.overlap) / 2 - v.rail / 2, h / 2], size: [v.stop_post, v.length - v.overlap + v.rail, h] })) // the posts, from the rail to the tip
  x += v.stop_reach + v.stop_post / 2 + v.spacing
  // A pre-curved leaf, its arc bowing to +x, its root in the rail
  at(up(f.curvedLeaf({ length: v.length, thickness: v.thin, width: h, rise: v.rise })), x + v.rise, -v.overlap)
  x += v.rise + v.spacing
  // The contact-aided leaf: its stop bar on the +x side, both growing from the rail
  x += v.gap + v.stop_post
  at(up(f.contactLeaf({ length: v.length, thickness: v.thin, width: h, stop: v.contact_at, gap: v.gap, post: v.stop_post })), x, -v.overlap)
  x += v.spacing
  // The parallelogram: its ground bar in the rail, the coupler free above
  x += v.bar + v.notch + v.thin / 2
  at(f.parallelogram({ link: v.link, apart: v.apart, width: h, radius: v.notch, neck: v.thin, bar: v.bar }), x, v.bar / 2 - v.overlap)
  x += v.apart + v.bar + v.notch + v.thin / 2 + v.spacing
  // Tweezers: the spring along the rail, lifted off it on a post at its middle, so both halves bend; the arms reach away
  x += v.spring / 2 + v.bar
  at(rotateZ(Math.PI / 2, f.tweezers({ spring: v.spring, thickness: v.mid, width: h, arm: v.arm, open: v.open, bar: v.bar })), x, v.lift + v.mid / 2)
  parts.push(cuboid({ center: [x, (v.lift - v.overlap) / 2, h / 2], size: [v.bar, v.lift + v.overlap + v.overlap, h] })) // the post
  x += v.spring / 2 + v.bar + v.spacing
  const rail = cuboid({ center: [(x - v.spacing) / 2, -v.rail / 2, h / 2], size: [x - v.spacing, v.rail, h] })
  return v.ops.union(rail, ...parts)
}

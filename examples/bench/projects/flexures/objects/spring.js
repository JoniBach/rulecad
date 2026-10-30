// A leaf spring on a block: straight at rest, and drawn bent (the elastica) when pressed, so the pressed variant shows
// the spring at work and can be checked for fit. The leaf runs along x from the block and bends along y.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const leaf = { length: v.length, thickness: v.thickness, width: v.height }, material = { E: v.pla.modulus }
  const bent = v.travel > 0 ? v.flexures.leafFlexed(leaf, material, { travel: v.travel }) : v.flexures.leaf(leaf)
  const block = cuboid({ center: [-v.block / 2, 0, v.height / 2], size: [v.block, v.block, v.height] })
  return v.ops.union(block, translate([-v.overlap, 0, 0], bent))
}

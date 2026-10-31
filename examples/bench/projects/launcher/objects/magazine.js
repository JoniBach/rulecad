// The magazine insert: a follower plate, a serpentine spring (on the bed side, pressing the middle of the follower)
// and a cap bar with a snap hook hanging from each end, printed as one piece. The cap drops into the column from the
// top, the hooks snap into notches in the column's walls, and the spring presses the follower onto the discs (or onto
// the column's ledge when there are none). Their backs are sloped, so a firm pull lifts the cap out to reload. The
// spring is drawn at rest; the empty and full variants draw its leaves closer by the compression, so the assembly can
// check the follower where it will be.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate, rotateZ, mirrorX } = jscad.transforms

export function main (v) {
  const f = v.flexures, t = v.thickness, material = { E: v.pla.modulus, strainLimit: v.launcher.strain_limit }
  const model = f.serpentineModel({ length: v.spring, thickness: t, width: v.width, turns: v.turns }, material)
  const most = v.preload + v.stroke, gaps = (v.turns - 1) * (v.pitch - t)
  if (most > gaps) throw new Error(`the spring must squeeze ${most.toFixed(1)} mm but its gaps only close ${gaps.toFixed(1)}: more turns or a wider pitch`)
  if (model.stiffness * v.preload < v.launcher.feed) throw new Error(`the feed on the last disc is ${(model.stiffness * v.preload).toFixed(2)} N, under ${v.launcher.feed}: more preload or a stiffer spring`)
  if (model.strain(most) > material.strainLimit) throw new Error(`the spring sees ${(model.strain(most) * 100).toFixed(1)}% strain when full: longer leaves or more turns`)
  const hook = f.snapHookModel({ length: v.hook, thickness: v.hook_t, width: v.width, undercut: v.undercut, lead: v.lead, back: v.back }, material)
  if (hook.strain(v.undercut) > material.strainLimit) throw new Error(`a hook sees ${(hook.strain(v.undercut) * 100).toFixed(1)}% strain pressed in: a longer or thinner leaf`)
  if (hook.removal * 2 < model.stiffness * most) throw new Error(`the spring's push when full (${(model.stiffness * most).toFixed(1)} N) would lift the cap: its two hooks let go at ${(hook.removal * 2).toFixed(1)} N`)
  const pitch = v.pitch - v.compression / (v.turns - 1), last = (v.turns - 1) * pitch
  const spring = f.serpentine({ length: v.spring, thickness: t, width: v.width, turns: v.turns, pitch })
  const x = v.spring / 2, plate = (y0, y1, w) => cuboid({ center: [x, (y0 + y1) / 2, v.across / 2], size: [w, y1 - y0, v.across] })
  const follower = plate(-t / 2 - v.follower, -t / 2 + v.overlap, v.follower_w)
  const capBottom = last + t / 2 - v.overlap, cap = plate(capBottom, capBottom + v.bar, v.follower_w)
  // The hooks: drawn along x with the barb rising +y, turned to hang down from the cap's ends with the barbs outward
  const hang = (side) => { // side 1: the +x end, barb pointing +x
    const h = f.snapHook({ length: v.hook, thickness: v.hook_t, width: v.width, undercut: v.undercut, lead: v.lead, back: v.back, root: v.hook_root })
    const down = rotateZ(-Math.PI / 2, h) // along -y, the barb to +x
    return translate([x + side * (v.follower_w / 2 - v.hook_root / 2), capBottom + v.overlap + v.hook_root / 2, 0], side > 0 ? down : mirrorX(down)) // the root block flush with the cap's edge
  }
  return v.ops.union(follower, spring, cap, hang(1), hang(-1))
}

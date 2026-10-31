// The barrel cartridge: a tray whose bottom wall is the slot's floor and whose top band holds the slot's ceiling and
// a hollow the pins' barbs click into, with the magazine column standing over the mouth. The floor wall is left out over the sled's
// tab run (its roof would be a bridge) and slit for the sear's tooth; the back wall has a notch, open to the open
// side, for the sled's rod; the column walls have the notches the insert's cap snaps into.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const z0 = v.wall, zTop = v.case_h, t = v.case_t, a = v.action, s = v.sled
  const box = (x0, x1, y0, y1, zlo = z0, zhi = zTop) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, (zlo + zhi) / 2], size: [x1 - x0, y1 - y0, zhi - zlo] })
  const floorTop = -v.slot / 2, floorBottom = floorTop - v.rail, ceiling = -floorBottom, parts = [], cuts = []
  const x0 = v.back, x1 = v.muzzle
  // The tube: floor plate, the slot's floor wall (the bottom edge), the top band with the slot's ceiling in it
  parts.push(box(x0, x1, floorBottom, v.band, 0, z0)) // the floor plate under the tube
  parts.push(box(x0, x1, floorBottom, floorTop), box(x0, x1, -floorTop, ceiling), box(x0, x1, v.band - t, v.band)) // floor wall, ceiling wall, top wall: a hollow between the last two
  parts.push(box(x0, x0 + t, floorBottom, v.band), box(x1 - t, x1, floorBottom, v.band)) // back and front walls
  // The column: its floor plate, walls either side up to the top, open above; the mouth cut through the ceiling
  const col0 = v.col0, col1 = v.col1
  parts.push(box(col0 - t, col1 + t, v.band - v.overlap, v.top, 0, z0))
  parts.push(box(col0 - t, col0, v.band - v.overlap, v.top), box(col1, col1 + t, v.band - v.overlap, v.top))
  cuts.push(box(col0, col1, ceiling, v.top + 1, z0, zTop + 1)) // the column's inside, through the band
  cuts.push(box(col0 + v.magazine.ledge, col1 - v.magazine.ledge, floorTop, ceiling + 1, z0, zTop + 1)) // the mouth
  const notch = v.magazine.undercut + v.fit
  cuts.push(box(col0 - notch, col0 + 1, v.notch_y, v.notch_y + v.notch_h, z0, zTop + 1), box(col1 - 1, col1 + notch, v.notch_y, v.notch_y + v.notch_h, z0, zTop + 1)) // the cap's notches, open to the open side
  // The sled's tab run through the floor wall, the sear's tooth slit, and the rod's notch in the back wall
  const tabBack = a.bead - a.travel_max, tabFront = a.rest_x + s.tab
  cuts.push(box(tabBack - v.fit, tabFront + v.fit, floorBottom - 1, floorTop + 1, z0, zTop + 1))
  cuts.push(box(v.tooth_back - v.fit, v.tooth_back + v.tooth + v.fit, floorBottom - 1, floorTop + 1, z0, z0 + v.sear_w + v.fit))
  cuts.push(box(x0 - 1, x0 + t + 1, floorTop, -floorTop, s.rod_z - v.fit, zTop + 1))
  // The pins' holes: through the back wall and the muzzle's front wall, into the hollow
  const r = v.pin / 2 + v.fit, hole = (x, y, along) => cuts.push(jscad.transforms.translate([x, y, v.pin_z], jscad.transforms[along === 'x' ? 'rotateY' : 'rotateX'](Math.PI / 2, cylinder({ radius: r, height: t + 2, segments: v.smooth }))))
  hole(x0 + t / 2, v.pin_y, 'x'); hole(x1 - t / 2, v.pin_y, 'x')
  return v.ops.subtract(v.ops.union(...parts), ...cuts)
}

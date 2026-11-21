// MX keycap, 1u or wider (units): a tapered shell with a dished top and a round post with a cross slot, printed upright.
// The post is what's left when the hollow is carved around it, so no solids are joined face to face (JSCAD's unions
// leave small gaps there). Under the post, a breakaway pillar one layer below holds it up while it prints; a wider cap
// also gets breakaway ribs either side, so no part of its roof bridges further than the printer can span.
// profile oem sculpts the top for its row (oem rules: height, tilt, a smaller top set back, a cylindrical dish); dsa is
// the same on every row. Every measurement is a variable in keycap.json; this file only says how they combine.
import jscad from '@jscad/modeling'
const { roundedRectangle, cylinder, cuboid, sphere } = jscad.primitives
const { subtract, intersect, union } = jscad.booleans
const { translate, rotateX } = jscad.transforms
const { degToRad } = jscad.utils
const { hull } = jscad.hulls
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  // A thin rounded square at height z: two of them hulled make a tapered block
  // Wider keys are longer along x by whole key pitches; across the row (y) every key is the same
  const extra = v.length - v.base
  const outline = (width, corner, z) => translate([0, 0, z],
    extrudeLinear({ height: v.sliver }, roundedRectangle({ size: [width + extra, width], roundRadius: corner, segments: v.corner_smooth })))
  const column = (radius, from, to) => translate([0, 0, (from + to) / 2], cylinder({ radius, height: to - from, segments: v.smooth / 2 }))

  const oem = v.profile === 'oem'
  const sculpt = oem ? sculpted(v, extra) : null
  const height = oem ? sculpt.height : v.height, dishDepth = oem ? v.oem.dish : v.dish
  const ceiling = oem ? sculpt.ceiling : v.height - v.dish - v.roof
  const widthAt = (z) => v.base + (v.top - v.base) * z / v.height // the outside, which tapers from base to top
  const shell = oem ? sculpt.shell : hull(outline(v.base, v.corner_base, 0), outline(v.top, v.corner_top, v.height - v.sliver))
  const hollow = oem ? sculpt.hollow : hull(
    outline(v.base - 2 * v.wall, v.corner_inner, -v.sliver),
    outline(widthAt(ceiling) - 2 * v.wall, v.corner_inner, ceiling)
  )
  const cavity = subtract(hollow, column(v.post / 2, v.lift, ceiling + v.overcut)) // the hollow, less the post
  const ball = (x) => translate([x, 0, v.height + v.dish_radius - v.dish], sphere({ radius: v.dish_radius, segments: v.smooth }))
  const dish = oem ? sculpt.dish : extra > 0 ? hull(ball(-extra / 2), ball(extra / 2)) : ball(0) // stretched along a wide key
  const slotMiddle = v.lift + v.slot_depth / 2 - v.overcut
  const slots = [translate([0, 0, slotMiddle], cuboid({ size: [v.slot, v.slot_arm, v.slot_depth] })),
    translate([0, 0, slotMiddle], cuboid({ size: [v.slot_arm, v.slot, v.slot_depth] }))]

  // The legend: the letters as a plain column standing on a flat floor parallel to the top, a dish and the inlay depth
  // below its rim (four layers at the dish's middle, a little more towards its sides). The cap is cut by that column in
  // its one cut, with the hollow, dish and slots; the legend is the column trimmed by the same shell and dish. Made from
  // the same simple pieces, their surfaces match (cutting a finished cap's curved top leaves slivers).
  let cut = null
  if (v.legend || v.legend2) {
    const face = oem ? { w: sculpt.topW, d: sculpt.topD, y: sculpt.back, tilt: sculpt.tilt } : { w: v.top + extra, d: v.top, y: 0, tilt: 0 }
    // Each legend (the plain one, and a second such as the shifted character) placed at its anchor on the top
    const room = { width: face.w - 2 * v.legend_pad, depth: face.d - 2 * v.legend_pad }
    const placed = [[v.legend, v.legend_anchor], [v.legend2, v.legend2_anchor]].filter(([t]) => t).map(([t, at]) => {
      const letters = v.shapes.text({ text: t, height: v.legend_size, stroke: v.legend_stroke, segments: v.corner_smooth }), [lw, ld] = v.shapes.size(letters)
      if (lw > room.width || ld > room.depth) throw new Error(`legend "${t}" is ${lw.toFixed(1)} × ${ld.toFixed(1)} mm: the top has room for ${room.width.toFixed(1)} × ${room.depth.toFixed(1)} (use a smaller legend_size)`)
      const [x, y] = v.shapes.anchor(room, [lw, ld], at)
      return { t, shape: translate([x, y * Math.cos(face.tilt)], letters), box: { left: x - lw / 2, front: y - ld / 2, right: x + lw / 2, back: y + ld / 2 } } // seen from above, a tilted top is shorter
    })
    if (placed.length > 1) { // two legends must stay a stroke apart, or they print as one blot
      const [a, b] = placed.map((p) => p.box), apart = Math.max(b.left - a.right, a.left - b.right, b.front - a.back, a.front - b.back)
      if (apart < v.legend_stroke) throw new Error(`legends "${placed[0].t}" and "${placed[1].t}" are ${apart.toFixed(1)} mm apart: at least ${v.legend_stroke} (a stroke) is needed (use a smaller legend_size)`)
    }
    const letters = placed.length > 1 ? union(...placed.map((p) => p.shape)) : placed[0].shape
    const from = ceiling + v.roof / 2, column = translate([0, face.y, from], extrudeLinear({ height: height * 2 - from }, letters))
    const floor = height - dishDepth - v.legend_depth, slab = translate([0, face.y, floor + height / 2], cuboid({ size: [face.w * 2, face.d * 2, height] }))
    const above = face.tilt ? translate([0, face.y, height], rotateX(-face.tilt, translate([0, -face.y, -height], slab))) : slab
    cut = intersect(column, above)
  }
  const cap = subtract(shell, cavity, dish, ...slots, ...(cut ? [cut] : []))
  const legend = cut ? intersect(cut, subtract(shell, dish)) : null

  // Breakaway supports, snipped off after printing: the pillar under the post, and on a wide cap, ribs across the hollow
  // (front to back) between the post and the end walls, standing one layer short of the roof and clear of the walls
  const supports = [column(v.post / 2, 0, v.lift - v.support_gap)]
  const inside = (oem ? sculpt.insideAt(ceiling)[0] - extra : widthAt(ceiling)) - 2 * v.wall, reach = (inside + extra) / 2 - v.post / 2 // from the post to an end wall
  const ribs = Math.ceil(reach / v.rib_span) - 1, top = ceiling - v.support_gap
  for (let i = 1; i <= ribs; i++) {
    for (const side of [-1, 1]) {
      const x = side * (v.post / 2 + (reach * i) / (ribs + 1))
      const across = oem ? sculpt.insideAt(ceiling)[1] - 2 * v.wall : inside, at = oem ? sculpt.insideAt(ceiling)[2] : 0
      supports.push(translate([x, at, top / 2], cuboid({ size: [v.rib, across - 2 * v.support_gap, top] })))
    }
  }
  // And ribs side to side, in front of or behind the post, where the hollow reaches further than the printer can bridge
  // (an oem top is deeper and set back): only oem caps need them
  if (oem) {
    const [iw, id, iy] = sculpt.insideAt(ceiling), span = iw - 2 * v.wall - 2 * v.support_gap
    for (const side of [-1, 1]) {
      const far = side * iy + (id - 2 * v.wall) / 2 - v.post / 2 // from the post to the back (1) or front (-1) wall
      const n = Math.ceil(far / v.rib_span) - 1
      for (let i = 1; i <= n; i++) supports.push(translate([0, side * (v.post / 2 + (far * i) / (n + 1)), top / 2], cuboid({ size: [span, v.rib, top] })))
    }
  }
  return { cap, legend, pillar: supports }
}

// An oem cap for its row: the top is smaller than the base, set back, and tilted about its centre (positive raises the
// front edge); the dish is a cylinder running front to back, so the top curves side to side. The roof under it is flat,
// one roof thickness below the lowest point of the dish.
function sculpted (v, extra) {
  const o = v.oem, n = v.row.toLowerCase()
  const height = o[`${n}_height`], tilt = degToRad(o[`${n}_tilt`])
  const topW = v.base - o.top_narrower + extra, topD = v.base - o.top_shorter, back = o.top_skew
  const pivot = [0, back, height]
  const tilted = (g) => translate(pivot, rotateX(-tilt, translate(pivot.map((c) => -c), g)))
  const slab = (w, d, corner, y, z) => translate([0, y, z],
    extrudeLinear({ height: v.sliver }, roundedRectangle({ size: [w, d], roundRadius: corner, segments: v.corner_smooth })))
  const top = tilted(slab(topW, topD, v.corner_top, back, height - v.sliver))
  const shell = hull(slab(v.base + extra, v.base, v.corner_base, 0, 0), top)
  // The inside follows the outside's taper, less the wall; the lowest point of the top is at its tilted-down edge
  const ceiling = height - o.dish - v.roof - (topD / 2) * Math.sin(Math.abs(tilt))
  const insideAt = (z) => { const f = z / height; return [v.base + extra + (topW - v.base - extra) * f, v.base + (topD - v.base) * f, back * f] }
  const [iw, id, iy] = insideAt(ceiling)
  const hollow = hull(
    slab(v.base + extra - 2 * v.wall, v.base - 2 * v.wall, v.corner_inner, 0, -v.sliver),
    slab(iw - 2 * v.wall, id - 2 * v.wall, v.corner_inner, iy, ceiling))
  // A cylinder across the top's width, as deep as the dish at its middle
  const radius = ((topW / 2) ** 2 + o.dish ** 2) / (2 * o.dish)
  const dish = tilted(translate([0, back, height - o.dish + radius],
    rotateX(Math.PI / 2, cylinder({ radius, height: v.base * 2, segments: v.smooth * 2 }))))
  return { height, ceiling, shell, hollow, dish, insideAt, topW, topD, back, tilt }
}

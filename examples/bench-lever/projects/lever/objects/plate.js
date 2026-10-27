// Lever bench specimen B: the envelope, less a row of windows between the second fixing boss and the load boss. The
// frame round them and the webs between them share one width w, found by halving the range until the volume (the
// envelope less the bolt holes and windows, times the thickness) is the target. Flat on the bed, z up.
import jscad from '@jscad/modeling'
const { rectangle, roundedRectangle, circle } = jscad.primitives
const { subtract } = jscad.booleans
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const b = v.bench, n = b.windows, holes = Math.PI * (v.hole5 * v.hole5 * 2 + v.hole4 * v.hole4)
  const from = b.pitch + b.boss5, to = b.span - b.boss4 // the windows' row, between the bosses
  const window = (w) => [(to - from - (n + 1) * w) / n, b.depth - 2 * w] // each window's size for frame and webs w
  // The corners' rounding takes a little back: a rounded rectangle is short of its box by (4 - π) r² 
  const area = (w) => { const [a, c] = window(w); return b.length * b.depth - holes - n * (a * c - (2 * 2 - Math.PI) * v.corner * v.corner) }
  let lo = 0, hi = b.depth / 2
  while (hi - lo > v.x1c.layer / (2 * 2 * 2 * 2)) { const w = (lo + hi) / 2; if (area(w) * b.thickness < v.target) lo = w; else hi = w }
  const w = (lo + hi) / 2, [a, c] = window(w)
  if (w < v.thinnest) throw new Error(`the frame would be ${w.toFixed(2)} mm: thinner than ${v.thinnest} mm (fewer windows, or a bigger fill)`)
  const windows = Array.from({ length: n }, (_, i) => roundedRectangle({ center: [from + w + a / 2 + i * (a + w), 0], size: [a, c], roundRadius: v.corner, segments: v.corner_smooth }))
  const outline = subtract(
    rectangle({ center: [b.length / 2 - b.behind, 0], size: [b.length, b.depth] }),
    circle({ center: [0, 0], radius: v.hole5, segments: v.smooth }),
    circle({ center: [b.pitch, 0], radius: v.hole5, segments: v.smooth }),
    circle({ center: [b.span, 0], radius: v.hole4, segments: v.smooth }),
    ...windows
  )
  return extrudeLinear({ height: b.thickness }, outline)
}

// The in-line action's layout, shared by the design (inline.js) and the script that shapes its spring
// (../shape-inline.mjs): x along the barrel, y up, the barrel's axis on y = 0. A pusher bar on the axis, a curved arm
// above it and its mirror image below, each grown from the frame's top or bottom wall and meeting the bar square;
// pulled back, the arms bend (a bow's limbs, either side of its string) and their sideways pulls cancel.
// f: @rulecad/flexures
export function layout (v, f) {
  const g = v.gap, half = v.bar / 2
  const back = 0 - v.bar_back, nose = v.bar_front // the bar's ends, the arms meeting its top at x = 0
  const stop = back - v.stroke - v.over // the stops' faces: the bar's back meets them a little past the stroke
  const top = half + v.rise // the frame's inside, above the arms' room
  const discAt = nose + v.nose + g, front = discAt + v.launcher.disc // the disc ahead of the bar's nose; the front wall past it
  const root = [v.root_x, top], tip = [0, half]
  return {
    half, back, nose, stop, top, discAt, front, railAt: nose + g, // the rails start a gap ahead of the bar: they stop it at rest
    rear: Math.min(stop, 0 - v.reach) - v.stop_len, // the back wall's inside face: the stops reach forward from it
    // The spring's job: its ends, the angles they meet their blocks at, the room it may fill, what it must store, and
    // the meander it starts from
    job: {
      root, tip, start: 270, end: -90, lead: v.spring_round + v.least, // square off each block for longer than the round where it meets it
      region: { lo: [0 - v.reach, half + g * 2], hi: [front - g, top] }, gap: g, apart: v.arm_gap, bend: v.arm_bend,
      thickness: [v.least, v.most], moves: 'x', travel: 0 - v.stroke, energy: v.energy, mirror: 0,
      width: [v.height_min, v.height_max], margin: v.margin,
      guess: f.meander({ root, tip, legs: v.legs, lo: v.bend_lo, hi: v.bend_hi }),
    },
  }
}

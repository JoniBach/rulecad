// The in-line action's layout, shared by the design (inline.js) and the script that shapes its spring
// (../shape-inline.mjs): x along the barrel, y up, the barrel's axis on y = 0. A pusher bar on the axis, a curved arm
// above it and its mirror image below, each grown from the frame behind and meeting the bar square;
// pulled back, the arms bend (a bow's limbs, either side of its string) and their sideways pulls cancel.
// f: @rulecad/flexures
export function layout (v, f) {
  const g = v.gap, half = v.bar / 2
  const back = 0 - v.bar_back, nose = v.bar_front // the bar's ends, the arms meeting its top at x = 0
  const top = half + v.rise // the frame's inside, above the arms' room
  const discAt = nose + v.nose + g, front = discAt + v.launcher.disc // the disc ahead of the bar's nose, lying flat; the front wall past it
  const root = [v.root_x, top], tip = [0, half] // the arms grow from the frame behind where they meet the bar, so they pull on the closed back of the frame, not on its front
  return {
    half, back, nose, top, discAt, front,
    // The spring's job: its ends, the angles they meet their blocks at, the room it may fill, what it must store, and
    // the meander it starts from
    job: {
      root, tip, start: 270, end: -90, lead: v.spring_round + v.least, // square off each block for longer than the round where it meets it
      region: { lo: [0 - v.reach, half + g * 2], hi: [v.room_front, top] }, gap: g, apart: v.arm_gap, bend: v.arm_bend, // (their room ends where the disc's slot begins)
      thickness: [v.least, v.most], moves: 'x', travel: 0 - v.stroke, energy: v.energy, mirror: 0,
      width: [v.height_min, v.height_max], margin: v.margin,
      guess: f.meander({ root, tip, legs: v.legs, lo: v.bend_lo, hi: v.bend_hi }),
    },
  }
}

// The catch and trigger, in the room under the stem just behind the arms (the pull ring stands on top of the stem,
// out of the way). One part: the trigger is its own sear. A tooth under the stem is caught by the hook on the trigger's
// top; the trigger hangs on a hinge that lies on the line the tooth pulls along, so the spring's pull is the hinge's
// tension, not a bend, and holds however strong the spring. The trigger's body curves down and back from the hook, and
// the finger, in the crook in front of it, pulls it back: it turns about the hinge's middle, and the hook slides down
// off the tooth (a little friction is all it costs), the lever's length making that light.
// v: the design's values; height: the print's (the arms' shaping sets it)
export function catchOf (v, height) {
  const draw = v.stroke - v.short, cock = draw - v.settle, g = v.gap, deg = Math.PI / 180
  const stemLow = 0 - v.stem_h / 2, toothLow = stemLow - v.tooth
  const xs = v.tooth_x - cock, yc = toothLow + v.engage / 2 // the cocked tooth's front, and the middle of where it bears
  const P = [xs - v.sear_reach, yc - v.sear_drop], len = Math.hypot(v.sear_reach, v.sear_drop), u = [v.sear_reach / len, v.sear_drop / len] // the hinge's middle, and the line it pulls along
  const along = Math.atan2(u[1], u[0]) / deg, at = (k) => [P[0] + u[0] * k, P[1] + u[1] * k], root = at(0 - v.hinge / 2), tip = at(v.hinge / 2)
  const under = toothLow - g - v.room // the trigger keeps below the tooth's way
  return {
    draw, cock, stemLow, toothLow, xs, yc, P, u, along, root, tip, under,
    hingeJob: {
      root, tip, start: [along - v.hinge_swing, along + v.hinge_swing], end: [along - v.hinge_swing, along + v.hinge_swing], lead: v.hinge_round + v.least,
      region: { lo: [root[0] - v.room, P[1] - v.hinge_room], hi: [tip[0] + v.room, under] }, gap: g, apart: v.arm_gap, bend: v.arm_bend,
      thickness: [v.hinge_least, v.most], moves: 'turn', about: P, travel: 0 - v.pull, energy: v.hinge_energy, width: height, margin: v.margin,
      hold: { force: [u[0] * v.hold_design, u[1] * v.hold_design], at: P, most: v.hold_give }, // the spring's pull, for a spring far stronger than this one
      guess: [at(0 - v.hinge / 4), P, at(v.hinge / 4)],
    },
  }
}

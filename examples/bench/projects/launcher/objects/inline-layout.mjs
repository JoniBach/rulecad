// The in-line action's layout, shared by the design (inline.js) and the scripts that shape its springs
// (../shape-inline.mjs, ../shape-hinge.mjs, ../shape-slide.mjs): x along the barrel, y up, the barrel's axis on y = 0.
// What flies is kept light, since the disc can only take its share of everything moving with it: a shuttle (a block
// the arms meet, a thin spine forward, a tooth under it and a concave nose) and the arms. What only draws stays
// behind: the pull ring on a slide, which pulls the shuttle back by a head on the shuttle's tail caught in a pocket in
// its stem, and is put back by a spring of its own while the trigger holds the shuttle.
// f: @rulecad/flexures
export function layout (v, f) {
  const g = v.gap, half = v.bar / 2
  const top = half + v.rise // the frame's inside, above the arms' room
  const root = [v.root_x, top], tip = [0, half] // the arms grow from the frame behind where they meet the block, so they pull on the closed back of the frame, not on its front
  const draw = v.stroke - v.short, cock = draw - v.settle
  return {
    half, top, draw, cock,
    // The spring's job: its ends, the angles they meet their blocks at, the room it may fill, what it must store, and
    // the meander it starts from. Its room ends a little ahead of where it meets the block: ahead of that, under the
    // shuttle, is the catch's
    job: {
      root, tip, start: 270, end: -90, lead: v.spring_round + v.least, // square off each block for longer than the round where it meets it
      region: { lo: [0 - v.reach, half + g * 2], hi: [v.room_front, top] }, gap: g, apart: v.arm_gap, bend: v.arm_bend,
      thickness: [v.least, v.most], moves: 'x', travel: 0 - v.stroke, energy: v.energy, mirror: 0,
      width: [v.height_min, v.height_max], margin: v.margin,
      guess: f.meander({ root, tip, legs: v.legs, lo: v.bend_lo, hi: v.bend_hi }),
    },
  }
}

// The catch and the trigger, under the shuttle ahead of the arms. A tooth hangs under the shuttle's spine; cocked, its
// front bears on the hooked back face of the trigger's head. The trigger hangs on a hinge behind the hook,
// along the line from the hinge's middle (P) to where the tooth bears, so the pull is the hinge's tension, not a bend.
// The hooked face leans back past square to that line by the bite: the pull then turns the trigger up into the tooth,
// so the catch holds by its shape, not by friction. The finger pulls the trigger's body back, which turns the hook
// down: it cams the shuttle back a little and lets it go.
// v: the design's values; height: the print's (the arms' shaping sets it)
export function catchOf (v, height) {
  const g = v.gap, deg = Math.PI / 180, { draw, cock } = layout(v, { meander: () => null })
  const spineLow = 0 - v.spine / 2, toothLow = spineLow - v.tooth
  const xs = v.catch_x, yc = toothLow + v.engage / 2 // the cocked tooth's front, and the middle of where it bears
  const P = [xs - v.sear_reach, yc - v.sear_drop], len = Math.hypot(v.sear_reach, v.sear_drop), u = [v.sear_reach / len, v.sear_drop / len] // the hinge's middle, and the line it pulls along
  const along = Math.atan2(u[1], u[0]) / deg, at = (k) => [P[0] + u[0] * k, P[1] + u[1] * k], root = at(0 - v.hinge / 2), tip = at(v.hinge / 2)
  const normal = (along + v.bite) * deg, n = [Math.cos(normal), Math.sin(normal)] // the hooked face's normal, into the hook: the line's turned up by the bite
  const under = toothLow - g - v.room - v.dip // the trigger keeps below the tooth's way, and its sag
  const toothFront = xs + cock, reachFront = toothFront + v.overshoot // the tooth at rest, and the furthest its follow-through takes it
  return {
    draw, cock, spineLow, toothLow, xs, yc, P, u, n, along, root, tip, under, toothFront, reachFront,
    hingeJob: {
      root, tip, start: [along - v.hinge_swing, along + v.hinge_swing], end: [along - v.hinge_swing, along + v.hinge_swing], lead: v.hinge_round + v.least,
      region: { lo: [root[0] - v.room, P[1] - v.hinge_room], hi: [tip[0] + v.room, spineLow - g - v.room] }, gap: g, apart: v.arm_gap, bend: v.arm_bend,
      thickness: [v.hinge_least, v.most], moves: 'turn', about: P, travel: 0 - v.hinge_travel, energy: v.hinge_energy, width: height, margin: v.margin,
      hold: { force: [n[0] * v.hold_design, n[1] * v.hold_design], at: P, most: v.hold_give }, // the pull along the face's normal, for a spring far stronger than this one
      guess: [at(0 - v.hinge / 4), P, at(v.hinge / 4)],
    },
  }
}

// The slide: the pull ring on a stem behind the shuttle, on a spring of its own that brings it back home. Its stem's
// front is a pocket the shuttle's tail head sits in: pulled back, the pocket's lips draw the head (and the shuttle)
// back; let go, the slide goes home while the trigger holds the shuttle, the head left at the pocket's back, so the shot
// carries none of it. The stem's front stays behind the shuttle however far back the trigger holds it, so the tail's
// neck is as long as the shuttle is cocked
export function slideOf (v, f, height) {
  const { cock } = layout(v, { meander: () => null })
  const back = 0 - v.bar_back, front = back - cock - v.cam - v.fit // the shuttle's back; the stem's front, behind it cocked and cammed back
  // The lips sit a little ahead of the head: drawn, the slide goes back that much further than the shuttle; home, the
  // shot's run on past rest, or the slide stopping a little short, doesn't bring the head up to them
  const slack = v.slide_slack
  const lips = [front - v.lip, front], head = [lips[0] - slack - v.tail_head, lips[0] - slack], neck = [head[1], back] // (x ranges)
  const pocket = [head[0] - cock - v.cam - v.fit, lips[0]] // the pocket the head runs back in as the slide goes home with the shuttle cocked (and cammed back)
  const R = v.ring_in + v.ring_wall, ringAt = [v.ring_x, v.stem_h / 2 + v.ring_in + v.ring_wall / 2]
  const anchor = [v.slide_anchor_x, 0 - v.stem_h / 2], root = [v.slide_root_x, 0 - (v.bar / 2 + v.rise) + v.slide_floor] // where the slide's spring meets the stem's underside, and grows from the frame's floor
  return {
    neck, head, lips, pocket, slack, R, ringAt, end: ringAt[0] - R - v.stem_tail, ringBack: ringAt[0] - R, anchor, front,
    job: {
      root, tip: anchor, start: 90, end: 90, lead: v.spring_round + v.least,
      region: { lo: [v.slide_lo, root[1]], hi: [v.slide_hi, anchor[1] - v.gap * 2] }, gap: v.gap, apart: v.arm_gap, bend: v.arm_bend,
      thickness: [v.least, v.most], moves: 'x', travel: 0 - (v.stroke + v.slide_slack), energy: v.slide_energy, across: 'held', width: height, margin: v.margin,
      guess: f.meander({ root, tip: anchor, legs: v.slide_legs, lo: root[1] + v.slide_bend, hi: anchor[1] - v.gap * 2 - v.slide_bend }),
    },
  }
}

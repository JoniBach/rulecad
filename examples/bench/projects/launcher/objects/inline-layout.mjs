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
  // a point of the trigger's finger part, turned forward about the hinge's middle by rest_up (see inline.js)
  const up = (v.rest_up || 0) * deg, turned = ([x, y]) => [P[0] + (x - P[0]) * Math.cos(up) - (y - P[1]) * Math.sin(up), P[1] + (x - P[0]) * Math.sin(up) + (y - P[1]) * Math.cos(up)]
  return {
    draw, cock, spineLow, toothLow, xs, yc, P, u, n, along, root, tip, under, toothFront, reachFront, turned,
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
  const { cock, draw } = layout(v, { meander: () => null })
  // The link: a slot up the shuttle's tail and a pin on the slide in it, the pin hung between two straps from the
  // slide's front, over and under the tail. Drawn, the pin bears on the slot's back end; cocked with the slide home, it
  // sits at the front end; the shot runs the slot forward past it, the slack to spare. (x along the barrel)
  const back = 0 - v.bar_back, slack = v.slide_slack, rp = v.link_pin / 2
  const slotFront = back - v.link_wall, pin = slotFront - rp - cock - v.fit // (cocked, slide home: the pin a fit short of the front end)
  const slotBack = pin - rp - (slack - v.gap), tailEnd = slotBack - v.link_wall // (drawn: the slide a slack further back, the pin bearing)
  const front = tailEnd - cock - v.fit // the stem's front: behind the tail's end, cocked, with the slide home
  const R = v.ring_in + v.ring_wall, ringAt = [v.ring_x, v.stem_h / 2 + v.ring_in + v.ring_wall / 2]
  const anchor = [v.slide_anchor_x, 0 - v.stem_h / 2], root = [v.slide_root_x, 0 - (v.bar / 2 + v.rise) + v.slide_floor] // where the slide's spring meets the stem's underside, and grows from the frame's floor
  // The guide behind the ring: a pin of the frame's standing in a slot up the stem's tail, as the link's pin stands in
  // the shuttle's, hung between two straps from the handle, over the tail and under it. It keeps the stem from pitching
  // in its channel, and the straps keep it in the plane. The slot ends under the ring's solid back and is as long as the
  // slide's whole travel and the pin: at rest the pin is at its back end, drawn at its front. The stem ends a wall
  // behind the slot
  const travel = draw + slack - v.gap, gr = v.guide_pin / 2, guideFront = ringAt[0] - v.guide_front, guideBack = guideFront - travel - 2 * (gr + v.fit)
  const guide = { at: [guideBack + v.fit + gr, v.guide_y], r: gr, slot: [guideBack, guideFront], travel }
  return {
    slack, R, ringAt, pin, rp, slot: [slotBack, slotFront], tailEnd, back, end: guideBack - v.link_wall, ringBack: ringAt[0] - R, anchor, front, guide,
    job: {
      root, tip: anchor, start: 90, end: 90, lead: v.spring_round + v.least,
      region: { lo: [v.slide_lo, root[1]], hi: [v.slide_hi, anchor[1] - v.gap * 2] }, gap: v.gap, apart: v.arm_gap, bend: v.arm_bend,
      thickness: [v.least, v.most], moves: 'x', travel: 0 - (v.stroke + v.slide_slack), energy: v.slide_energy, across: 'held', width: height, margin: v.margin,
      guess: f.meander({ root, tip: anchor, legs: v.slide_legs, lo: root[1] + v.slide_bend, hi: anchor[1] - v.gap * 2 - v.slide_bend }),
    },
  }
}

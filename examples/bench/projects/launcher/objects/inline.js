// The launcher's action in line, one flat print. What flies is kept light, because the disc only gets its share of
// everything moving with it: a shuttle between the spring's two arms (a block the arms meet, a thin spine forward, a
// tooth under it and a nose whose hollow holds the disc's edge), and the arms, each a curve shaped by the beam solver
// (../shape-inline.mjs). What only draws stays behind: the pull ring on a slide, whose stem's pocket catches the head on
// the shuttle's tail and pulls the shuttle back, then goes home on a spring of its own (../shape-slide.mjs) while the
// trigger holds the shuttle. The trigger, under the shuttle ahead of the arms, is its own sear: its hook's face leans
// back past square to the line of its hinge, so the spring's pull turns it into the tooth, and the finger, in the crook
// in front of its body, turns it down and lets the shuttle go. The frame is flooded: solid everywhere inside the outline
// but the room the moving parts sweep; the disc and the shuttle's nose run in a tunnel, a floor under them and a roof
// over, so the disc can't fall out of the plane. Holes in the corners take snap pins, should a plate either side ever
// be wanted.
import jscad from '@jscad/modeling'
import { layout, catchOf, slideOf } from './inline-layout.mjs'
import { shaped } from './inline-spring.mjs'
import { shaped as hingeShaped } from './inline-hinge.mjs'
import { shaped as slideShaped } from './inline-slide.mjs'
const { polygon, circle, roundedRectangle } = jscad.primitives
const { subtract, union } = jscad.booleans
const { offset } = jscad.expansions

const rect = (x0, y0, x1, y1) => polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })
const rounded = (shape, r, segments) => offset({ delta: r, corners: 'round', segments }, offset({ delta: 0 - r, corners: 'round', segments }, shape)) // every outside corner rounded

export function main (v) {
  const f = v.flexures, g = v.gap
  const material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, density: v.petg.density, name: 'PETG' }, { safety: v.safety })
  const printer = { line: v.x1c.line, layer: v.x1c.layer, wall_min: v.x1c.wall_min }
  const L = layout(v, f)
  // Each spring as shaped for this very job: if the layout or the rules have moved since, shape it again
  const same = (s, j, script) => { if (s.job !== JSON.stringify({ ...j, E: material.E, limit: material.strainLimit })) throw new Error(`a spring was shaped for another layout or material: run node examples/bench/projects/launcher/${script}`) }
  same(shaped, L.job, 'shape-inline.mjs')
  const spring = { ...shaped.params, into: v.into, fillet: v.spring_round }, height = shaped.params.width // printed as tall as the shaping found it must be
  const C = catchOf(v, height), S = slideOf(v, f, height)
  same(hingeShaped, C.hingeJob, 'shape-hinge.mjs')
  same(slideShaped, S.job, 'shape-slide.mjs')
  const hinge = { ...hingeShaped.params, into: v.into, fillet: v.hinge_round }, home = { ...slideShaped.params, into: v.into, fillet: v.spring_round }

  // Along the barrel: the trigger's front, then the tunnel the disc runs in (its floor from just ahead of the trigger,
  // its roof from just ahead of where the tooth's follow-through reaches), the loaded disc's middle over both
  const r = v.launcher.disc / 2, slot = r + v.slide, out = L.top + v.wall
  const triggerFront = C.xs + v.head + v.ramp, floorFrom = triggerFront + v.room + 1, roofFrom = C.reachFront + v.room // (the floor's ledges let the tooth by; the roof must be ahead of it)
  const loadedBack = Math.max(floorFrom, roofFrom) + 2 - r, noseFront = loadedBack - g + C.cock, front = loadedBack + 2 * slot + v.wall

  // The shuttle: the block the arms meet, the spine, the nose, the tooth, the tail
  const face = (dx) => (y) => C.xs + dx - (y - C.yc) * (C.n[1] / C.n[0]) // the hooked faces' line, moved along by dx: leaning back, square to the normal
  const toothFace = face(C.cock), toothBack = C.toothFront - v.tooth_w
  // its front leans to match the hook's face, and is a little round: tangent to that face where the tooth bears, falling
  // back from it either way, so tipped a little it rolls rather than bearing on its corner
  const t = [0 - C.n[1], C.n[0]], bear = [C.xs + C.cock, C.yc], sOf = (y) => (y - bear[1]) / t[1]
  const dropAt = (s) => (Math.abs(s) <= v.engage ? (s * s) / (2 * v.face_r) : (v.engage * v.engage) / (2 * v.face_r) + ((Math.abs(s) - v.engage) * v.engage) / v.face_r) // (round over the engagement, on along its tangent beyond)
  const roundFace = Array.from({ length: 9 }, (_, i) => { const y = C.toothLow + v.chamfer + ((C.spineLow + v.round - C.toothLow - v.chamfer) * i) / 8, drop = dropAt(sOf(y)); return [toothFace(y) - drop * C.n[0], y - drop * C.n[1]]; })
  const tooth = polygon({ points: [[toothBack, C.spineLow + v.round], [toothBack, C.toothLow + v.tooth_w / 2], [toothBack + v.tooth_w / 2, C.toothLow], [toothFace(C.toothLow) - v.chamfer, C.toothLow], ...roundFace] }) // its back bevelled to ride the hook's ramp
  const R = r + g, hollow = Array.from({ length: 13 }, (_, i) => { const y = v.nose_w / 2 - (v.nose_w * i) / 12; return [noseFront + g + r - Math.sqrt(R * R - y * y), y]; }) // the nose's hollow, round the disc's edge
  const shuttle = [
    rect(0 - v.bar_back, 0 - L.half, v.bar_back, L.half),
    rect(v.bar_back - v.round, 0 - v.spine / 2, noseFront - v.nose_l + v.round, v.spine / 2),
    polygon({ points: [[noseFront - v.nose_l, 0 - v.nose_w / 2], ...hollow.slice().reverse(), [noseFront - v.nose_l, v.nose_w / 2]] }),
    tooth,
    rect(S.neck[0] - v.round, v.tail_low, S.neck[1] + v.round, v.tail_low + v.neck_h), // the tail's neck, low
    rect(S.head[0], v.tail_low, S.head[1], v.tail_top), // and its head, a step up off the neck
  ]

  // The slide: the ring on its stem, the stem's front a pocket round the tail's head, its mouth round the neck
  // (its front runs over the tail only, with a recess open underneath that the head sits in, the lip ahead of it)
  const over = v.tail_low + v.neck_h + v.fit // the stem's front clears the neck by a gap
  const stem = union(rect(S.end, 0 - v.stem_h / 2, S.pocket[0] + v.round, v.stem_h / 2), subtract(rect(S.pocket[0], over, S.front, v.stem_h / 2), rect(S.pocket[0], over - 1, S.lips[0], v.tail_top + v.fit)))
  const ring = subtract(union(circle({ radius: S.R, center: S.ringAt, segments: v.smooth }), rect(S.ringBack, 0, S.ringAt[0], S.ringAt[1])), circle({ radius: v.ring_in, center: S.ringAt, segments: v.smooth })) // its back filled out solid down to the stem
  const slide = [stem, ring]

  // The trigger: one solid part, its own sear. Its top carries the hook, ahead of the cocked tooth (the hooked face
  // behind, a flat top, a ramp in front for the tooth to ride as it's drawn back); its front comes down and curves back
  // to its toe on the frame's bottom, the finger's crook; its back runs up under the hinge to the hinge's tip
  const bottom = 0 - out + v.trigger_floor, hookFace = face(0), headTop = C.toothLow + v.engage
  const rear = C.tip[0] - v.into, along = (x) => C.tip[1] + (x - C.tip[0]) * (C.u[1] / C.u[0]) // the hinge's line
  const neck = [triggerFront, C.under - v.trigger_neck], toe = [v.trigger_toe, bottom], heel = [v.trigger_heel, bottom]
  const crook = Array.from({ length: v.crook_steps + 1 }, (_, i) => { const t = i / v.crook_steps, ex = toe[0] - neck[0], ey = toe[1] - neck[1], l = Math.hypot(ex, ey), b = v.crook * Math.sin(Math.PI * t); return [neck[0] + ex * t + (ey / l) * b, neck[1] + ey * t - (ex / l) * b]; }) // bowed in from the straight line, a hollow for the finger
  const body = polygon({ points: [[rear, C.under], [triggerFront, C.under], ...crook, heel, [v.trigger_heel, bottom + v.heel_h], [rear - v.trigger_waist, along(rear - v.trigger_waist) - v.hinge_clear], [rear, along(rear) - v.hinge_clear]] })
  // and a shoulder behind the hook, up round the hinge's tip, just behind where the tooth is drawn to
  const shoulderTop = Math.min(C.tip[1] + v.hinge_clear, C.spineLow - g - v.room), shoulderFront = C.xs + C.cock - L.draw - v.tooth_w - v.room
  const shoulder = rounded(rect(rear - v.trigger_waist, C.under - v.round * 2, shoulderFront, shoulderTop), v.round, v.smooth)
  const sear = [
    rounded(body, v.trigger_round, v.smooth), shoulder,
    polygon({ points: [[hookFace(C.under), C.under], [triggerFront - v.round, C.under], [C.xs + v.head, headTop], [hookFace(headTop) + v.chamfer, headTop], [hookFace(headTop - v.chamfer), headTop - v.chamfer]] }), // the hook, solid all through
  ]
  const finger = [toe[0] + (neck[0] - toe[0]) * v.finger_at, toe[1] + (neck[1] - toe[1]) * v.finger_at] // where the finger pulls it, on the crook's face

  // The frame: the outline, flooded but for what moves, the disc's tunnel and the finger's room
  const back = S.end - S.slack - L.draw - v.handle // (behind the drawn slide, the handle)
  const outline = roundedRectangle({ size: [front - back, out * 2], center: [(front + back) / 2, 0], roundRadius: v.corner, segments: v.smooth })
  const fingerBox = polygon({ points: [[neck[0] - v.finger_round, neck[1]], [front - v.wall - v.finger_wall, neck[1]], [front - v.wall - v.finger_wall, bottom], [toe[0] + v.finger_round, bottom]] }) // in front of the crook, under the tunnel's floor
  const fingerRoom = rounded(fingerBox, v.finger_round, v.smooth)
  // (three in the corners; the fourth behind the stem's drawn end, since the slide's spring has the back corner below)
  const holes = [[back + v.plate_in, out - v.plate_in], [front - v.plate_in, out - v.plate_in], [front - v.plate_in, 0 - out + v.plate_in], [back + v.plate_low_in, v.plate_low]].map((at) => ({ at, diameter: v.plate_hole, wall: v.plate_wall }))
  // The disc lies flat in the tunnel ahead of the cocked nose, and leaves through the front. The floor under it and
  // the roof over it each stand on the frame either side; the disc slides on the floor, under the roof
  const channel = rect(loadedBack - g, 0 - slot, front + 1, slot)
  const disc = circle({ radius: r, center: [loadedBack + v.load_gap + r, 0], segments: v.smooth })
  const roofGap = v.x1c.layer * v.bridge_gap, roofZ = v.floor_depth + v.floor_gap + v.launcher.disc_t + roofGap // the roof's underside: the floor, its gap, the disc and a gap over it
  const bridges = [
    // the floor: two ledges off the slot's walls, either side of where the nose and the tooth pass (they run between, not over)
    { shape: rect(loadedBack - g, v.nose_w / 2 + v.room, front + 1, slot + v.bridge_foot), depth: v.floor_depth, gap: v.floor_gap, side: 'bottom' },
    { shape: rect(Math.max(loadedBack - g, floorFrom) + v.lower_ledge, 0 - slot - v.bridge_foot, front + 1, C.toothLow - v.room), depth: v.floor_depth, gap: v.floor_gap, side: 'bottom' }, // (the lower one ahead of the trigger's swing)
    { shape: rect(roofFrom, 0 - slot - v.bridge_foot, front + 1, slot + v.bridge_foot), depth: height - roofZ, gap: roofGap },
    { shape: rect(v.tie_from, C.spineLow - v.shuttle_clear - v.tie_foot, v.tie_to, 0 - C.spineLow + v.fit + v.bridge_foot) }, // the tie over the spine, so the frame the hinge roots in doesn't bend away under the pull
  ]
  // Trapped in the plane: the ring's top and the stem's in grooves in the frame over them, the spine's top likewise, and the
  // trigger's heel in the frame under it
  const guides = [
    { body: 'slide', shape: rect(S.ringBack - S.slack - L.draw - v.fit, S.ringAt[1] + S.R - v.bridge_foot, S.ringAt[0] + S.R, S.ringAt[1] + S.R + v.fit + v.bridge_foot), depth: v.guide_depth },
    { body: 'slide', shape: rect(S.end - S.slack - L.draw - v.fit, v.stem_h / 2 - v.bridge_foot, S.ringBack - v.fit, v.stem_h / 2 + v.fit + v.bridge_foot), depth: v.guide_depth }, // the stem's tail, behind the ring, in the handle
    { body: 'sear', shape: rect(v.trigger_heel - v.bridge_foot, bottom - v.room - v.bridge_foot, v.trigger_toe, bottom + v.bridge_foot), depth: v.guide_depth },
    { body: 'shuttle', shape: rect(v.spine_guide_from, v.spine / 2 - v.bridge_foot, v.spine_guide_to, v.spine / 2 + v.fit + v.bridge_foot), depth: v.guide_depth }, // the spine's top
    { body: 'slide', shape: rect(v.stem_guide_from, v.stem_h / 2 - v.bridge_foot, v.stem_guide_to, v.stem_h / 2 + v.fit + v.bridge_foot), depth: v.guide_depth }, // the stem's top, ahead of the ring
  ]
  const drawn = 0 - L.draw, slideDrawn = 0 - L.draw - S.slack + g, cocked = 0 - C.cock // (the lips a gap short of the head: they bear on it in the physics)
  return f.lamina({
    height, gap: g, material, printer: { ...printer, bridge: Math.max(v.x1c.bridge, v.roof_span) }, round: v.round,
    flood: { outline, keep: [channel, fingerRoom], clear: { default: v.room, shuttle: v.shuttle_clear, slide: v.fit, sear: v.trigger_room, spring: v.spring_clear, home: v.home_clear }, least: v.least_frame, band: v.band, holes },
    bridges, guides,
    bodies: { shuttle, slide, sear },
    joints: {
      spring: { kind: 'curve', params: spring, from: 'ground', to: 'shuttle' },
      hinge: { kind: 'curve', params: hinge, from: 'ground', to: 'sear' }, // a spring that is a hinge and a strut
      home: { kind: 'curve', params: home, from: 'ground', to: 'slide' }, // the slide's own spring, that brings it home
    },
    follows: { hinge: { by: ['shuttle'], give: -1 }, spring: { by: ['sear'], give: -1 } }, // the tooth rides the hook down as it's drawn; pulled, the hook's lean cams the shuttle back a little
    states: {
      drawn: { spring: drawn, home: slideDrawn },
      cocked: { spring: cocked, home: cocked - S.slack + g }, // let go of the shuttle: it comes forward on to the hook
      returned: { spring: cocked }, // let go of the ring: the slide goes home, the shuttle held
      pulled: { spring: cocked, hinge: 0 - v.pull },
      fired: { hinge: 0 - v.pull, spring: v.overshoot }, // the shot's run on past rest, its arms bringing it back
    },
    sequence: ['rest', 'drawn', 'cocked', 'returned', 'pulled', 'fired', 'rest'],
    holds: { returned: [['spring', 'sear']] }, // (with the slide home: cocked, the hand on the ring holds the shuttle too)
    grips: { hinge: finger, home: S.ringAt },
    physics: { friction: v.friction },
    free: { disc: { shape: disc, mass: v.launcher.disc_mass } },
    fire: { from: 'pulled', disc: 'disc', most: v.launcher.disc_energy, least: v.shot_least, seat: [-1, 0] }, // (the disc dropped in the slot rests back on the nose) // from the moment the trigger lets it go
  })
}

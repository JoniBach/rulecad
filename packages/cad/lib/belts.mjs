// A belt guide's load, worked out once the assembly is built: the carriage and everything it carries, pushed at the
// carriage's acceleration (the guide's accel, else the task's, else BELT_DEFAULTS.accel). That force goes on the drive's
// joint as a load, so the motor's checks hold the motor to it through the belt's ratio (motor.torque, motor.speed), and
// the belt's stretch under it is a term of the error budget (task.mjs reads the joint's slide). Where the travel is not
// level, the belt also carries the weight's part along it all the time: belt.tension and the stretch read the two
// together (the motor's checks already have the weight, from the loads). Units: kg, mm/s², N.
import { BELT_DEFAULTS, beltRub } from '@rulecad/frames';
import { massesOf, beyond } from './loads.mjs';
import { axisOf } from './motors.mjs';

const G = 9.80665;
const invAt = (W, p) => { const q = [p[0] - W[3], p[1] - W[7], p[2] - W[11]]; return [W[0] * q[0] + W[4] * q[1] + W[8] * q[2], W[1] * q[0] + W[5] * q[1] + W[9] * q[2], W[2] * q[0] + W[6] * q[1] + W[10] * q[2]]; };

// An item's box in the belt's own frame (the face's: x along the beam from end a, y across, z over the face), from its
// drawn triangles, which are in the world at the motion's pose
function boxIn(W, parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (const t of p.triangles) for (const v of t) { const q = invAt(W, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
  return Number.isFinite(lo[0]) ? { lo, hi } : null;
}

/**
 * Each belt guide's carried mass and the force that pushes it, added to the motion's loads and to the drive's stretch.
 * @param {object} s a built assembly @param {{ placeItems: Function, jointValues: Function, mul: Function }} helpers
 */
export function beltLoads(s, helpers) {
  const motion = s.motion, belts = (s.guides ?? []).filter((x) => x.kind === 'belt');
  if (!motion || !belts.length) return;
  const ids = motion.items.map((x) => x[0]), masses = massesOf(s, helpers), worlds = helpers.placeItems(motion, helpers.jointValues(motion, motion.pose ?? undefined));
  const g = motion.gravity || [0, 0, -1], gn = Math.hypot(...g);
  for (const r of belts) {
    const j = motion.joints.find((x) => x.id === r.joints[0]);
    if (!j) continue;
    let kg = 0;
    for (const q of masses) if (beyond(motion, j, q.item)) kg += q.kg;
    const own = kg; // (the parts' own: the carriage, the clamp, what is drawn on them; the loads' masses the motor checks have)
    for (const l of motion.loads ?? []) if (l.mass != null && !l.belt) { const k = typeof l.item === 'number' ? l.item : ids.indexOf(l.item); if (beyond(motion, j, k)) kg += l.mass; }
    const tool = s.task?.item != null ? ids.indexOf(s.task.item) : -1;
    if (s.task?.payload && tool >= 0 && beyond(motion, j, tool)) kg += s.task.payload;
    const accel = r.accel ?? s.task?.accel ?? BELT_DEFAULTS.accel.value, force = (kg * accel) / 1000;
    // the weight's part along the travel: kg × g × the cosine between the slide and gravity (0 on a level axis)
    const { Z } = axisOf(motion, worlds, j, helpers.mul), cos = (Z[0] * g[0] + Z[1] * g[1] + Z[2] * g[2]) / (Math.hypot(...Z) * gn), along = Math.abs(cos) > 1e-9 ? cos : 0, weight = kg * G * Math.abs(along);
    Object.assign(r, { carried: kg, accelUsed: accel, accelFrom: r.accel != null ? 'the guide' : s.task?.accel != null ? 'the task' : 'BELT_DEFAULTS.accel', force, weight });
    // the push, either way along the travel (motors.mjs adds it in the worse direction); off level, the parts' own weight
    // along it too, signed as gravity's (the declared loads' weight the motor checks read from their masses)
    motion.loads = [...(motion.loads ?? []).filter((l) => l.belt !== r.id && l.beltWeight !== r.id), { joint: j.id, value: force, note: `${r.id}: ${(kg * 1000).toFixed(0)} g pushed at ${accel} mm/s²`, belt: r.id },
      ...(along && own ? [{ joint: j.id, value: own * G * along, note: `${r.id}: the carriage's own ${(own * 1000).toFixed(0)} g along the travel`, beltWeight: r.id }] : [])];
    if (j.slide?.stretch) Object.assign(j.slide.stretch, { load: force + weight, length: r.layout.span });
    // what else the carriage carries, by its box: held against the belt's runs through the travel (belt.rub), as the
    // beam, the rail, the carriage and the clamp are
    const kb = ids.indexOf(r.items.belt), kc = ids.indexOf(r.carriage), mine = new Set([r.carriage, r.items.clamp, r.items.belt]), partsOf = (id) => s.parts.filter((p) => p.item === id && p.role !== 'support' && p.triangles?.length);
    const cbox = kb >= 0 && kc >= 0 ? boxIn(worlds[kb], partsOf(r.carriage)) : null;
    if (!cbox) continue;
    const xc = (cbox.lo[0] + cbox.hi[0]) / 2, carried = [];
    ids.forEach((id, k) => {
      if (mine.has(id) || !beyond(motion, j, k)) return;
      const b = boxIn(worlds[kb], partsOf(id));
      if (b) carried.push({ part: id, lo: [b.lo[0] - xc, b.lo[1], b.lo[2]], hi: [b.hi[0] - xc, b.hi[1], b.hi[2]] });
    });
    if (carried.length) Object.assign(r, { rub: beltRub(r.layout, { carried }), carriedParts: carried.map((x) => x.part) });
  }
}

// A belt guide's load, worked out once the assembly is built: the carriage and everything it carries, pushed at the
// carriage's acceleration (the guide's accel, else the task's, else BELT_DEFAULTS.accel). That force goes on the drive's
// joint as a load, so the motor's checks hold the motor to it through the belt's ratio (motor.torque, motor.speed), and
// the belt's stretch under it is a term of the error budget (task.mjs reads the joint's slide). Units: kg, mm/s², N.
import { BELT_DEFAULTS } from '@rulecad/frames';
import { massesOf, beyond } from './loads.mjs';

/**
 * Each belt guide's carried mass and the force that pushes it, added to the motion's loads and to the drive's stretch.
 * @param {object} s a built assembly @param {{ placeItems: Function, jointValues: Function }} helpers
 */
export function beltLoads(s, helpers) {
  const motion = s.motion, belts = (s.guides ?? []).filter((x) => x.kind === 'belt');
  if (!motion || !belts.length) return;
  const ids = motion.items.map((x) => x[0]), masses = massesOf(s, helpers);
  for (const r of belts) {
    const j = motion.joints.find((x) => x.id === r.joints[0]);
    if (!j) continue;
    let kg = 0;
    for (const q of masses) if (beyond(motion, j, q.item)) kg += q.kg;
    for (const l of motion.loads ?? []) if (l.mass != null && !l.belt) { const k = typeof l.item === 'number' ? l.item : ids.indexOf(l.item); if (beyond(motion, j, k)) kg += l.mass; }
    const tool = s.task?.item != null ? ids.indexOf(s.task.item) : -1;
    if (s.task?.payload && tool >= 0 && beyond(motion, j, tool)) kg += s.task.payload;
    const accel = r.accel ?? s.task?.accel ?? BELT_DEFAULTS.accel.value, force = (kg * accel) / 1000;
    Object.assign(r, { carried: kg, accelUsed: accel, accelFrom: r.accel != null ? 'the guide' : s.task?.accel != null ? 'the task' : 'BELT_DEFAULTS.accel', force });
    motion.loads = [...(motion.loads ?? []).filter((l) => l.belt !== r.id), { joint: j.id, value: force, note: `${r.id}: ${(kg * 1000).toFixed(0)} g pushed at ${accel} mm/s²`, belt: r.id }];
    if (j.slide?.stretch) Object.assign(j.slide.stretch, { load: force, length: r.layout.span });
  }
}

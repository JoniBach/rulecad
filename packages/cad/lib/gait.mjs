// A gait in an assembly: poses in time. Each leg is the chain from the body to its foot; the cycle comes from
// @rulecad/robots, and the checks run through it: stability, the swing foot's clearance, each joint's torque against its
// motor, and the sweep along the sequence for one leg hitting another or the body.
//   "gait": { "legs": ["fl.foot.tip", …], "pattern": "trot", "stride": 40, "lift": 15, "period": 1.2, "height": 120, "mass": 1.5 }
import { chainFromMotion, fk, gait } from '@rulecad/robots';
import { performance } from '@rulecad/motors';
import { trainFrom, workingSpeed, atCurrent } from './motors.mjs';

const n3 = (x, d = 2) => String(Number(x.toFixed(d)));

/** The gait as written, its legs as chains, refused by name when the assembly is built. */
export function gaitOf(a, motion, num) {
  const g = a.gait; if (!g) return null;
  if (!Array.isArray(g.legs) || !g.legs.length) throw new Error('gait: legs is a list of feet, <item>.<anchor>');
  const legs = g.legs.map((ref) => {
    const [id, name] = String(ref).split('.'), mark = motion.marks.find((m) => m.id === id && m.name === name);
    if (!mark) throw new Error(`gait: no anchor "${ref}" (items: ${[...new Set(motion.marks.map((m) => m.id))].join(', ')})`);
    // A leg's gearbox sits beside its links, so the foot's plane is not the hip anchor's: it stands in its own plane, over the hip
    const c = chainFromMotion(motion, { tip: id, tool: [mark.frame[3], mark.frame[7], mark.frame[11]] }), zero = fk(c, c.names.map(() => 0)), hip = zero.frames[0].at;
    return { name: id, chain: c, at: [hip[0], zero.position[1], hip[2]] };
  });
  const out = { legs, pattern: g.pattern, stride: num(g.stride), lift: num(g.lift), period: num(g.period), height: num(g.height), mass: num(g.mass), ...(g.steps ? { steps: num(g.steps) } : {}), ...(g.com ? { com: g.com.map(num) } : {}) };
  return out;
}

// The joint values of a frame of the cycle, in the assembly's terms
export const frameValues = (s, frame, jointValues) => { // a joint behind a gearbox is moved by the motor's shaft it follows
  const set = {};
  for (const e of frame.feet) { const l = s.gait.legs.find((x) => x.name === e.leg); l.chain.names.forEach((n, i) => { let j = s.motion.joints.find((x) => x.id === n), v = e.q[i]; while (j.follow) { const [lead, r = 1, o = 0] = j.follow; v = (v - o) / r; j = s.motion.joints.find((x) => x.id === lead); } set[j.id] = [v]; }); }
  return jointValues(s.motion, set);
};
export const framesOf = (s) => (s.gaitRun ??= gait(s.gait));

export function gaitChecks(s, f, { jointValues, placeItems, sweepOne }) {
  if (!s.gait) return;
  const r = framesOf(s);
  for (const x of r.findings) f(x.level, `gait: ${x.text}`, x.level === 'pass' || x.level === 'info' ? null : 'gait: fails', { code: x.code, values: x.values, refs: x.refs });
  if (!r.summary?.torque) return;
  const lift = r.summary.clearance, min = s.a.gait.clearance != null ? s.num(s.a.gait.clearance) : s.gait.lift * 0.5;
  f(lift >= min ? 'pass' : 'fail', `gait: the swing foot clears the ground by ${n3(lift, 1)} mm (wanted ${n3(min, 1)})`, lift >= min ? null : 'gait: foot drags', { code: 'gait.clearance', values: { lift, min } });
  // Each driven joint's torque through the cycle, against its motor
  const motion = s.motion;
  for (const [id, t] of Object.entries(r.summary.torque)) {
    const j = motion.joints.find((x) => x.id === id), tr = j && trainFrom(motion, id), d = tr && motion.drives.find((x) => x.joint === tr.root);
    if (!d) { f('warn', `gait: nothing drives ${id}, so its ${n3(t, 3)} N m through the cycle isn't checked`, `gait: ${id} undriven`, { code: 'gait.torque', refs: { joint: id } }); continue; }
    const speed = workingSpeed(d.model, d.spec), avail = atCurrent(d.model, d.spec, performance(d.model, { speed }).motor.torque) * tr.ratio * tr.efficiency, margin = avail / t, level = margin < 1 ? 'fail' : margin < 2 ? 'warn' : 'pass';
    f(level, `gait: ${id} needs ${n3(t, 3)} N m at its worst in the cycle, and ${d.id} gives ${n3(avail, 3)} N m there, ${n3(margin, 1)} times over`, level === 'pass' ? null : `gait: ${id} ${n3(margin, 1)}×`, { code: 'motor.torque', refs: { joint: id, item: d.id }, values: { needed: t, available: avail, margin } });
  }
  // Leg against leg, leg against body: the cycle as a sweep
  const every = Math.max(1, Math.floor(r.frames.length / 12)); let clashes = null, first = null;
  for (const [k, frame] of r.frames.entries()) { if (k % every) continue; const c = sweepOne(frameValues(s, frame, jointValues)); if (c.length && !clashes) { clashes = c; first = frame.t; } }
  if (clashes) f('fail', `gait: at ${n3(first * 100, 0)}% of the cycle ${clashes.slice(0, 3).map(([a, b]) => `${a} hits ${b}`).join(', ')}`, 'gait: clash', { code: 'gait.sweep', refs: { at: first } });
  else f('pass', `gait: nothing collides through the cycle (${Math.ceil(r.frames.length / every)} poses of it)`, null, { code: 'gait.sweep' });
}

// A gait as joint values through its cycle, for the viewer's Motion panel and cad animate: the joints that lead
// (a motor's shaft in place of a gearbox's output), and their values at each frame
export function gaitSequence(s) {
  if (!s.gait) return null;
  const r = framesOf(s); if (!r.frames.length) return null;
  const leads = (id) => { let j = s.motion.joints.find((x) => x.id === id); while (j.follow) j = s.motion.joints.find((x) => x.id === j.follow[0]); return j.id; };
  const names = [...new Set(s.gait.legs.flatMap((l) => l.chain.names).map(leads))];
  const toLead = (id, q) => { let j = s.motion.joints.find((x) => x.id === id), v = q; while (j.follow) { const [lead, ratio = 1, offset = 0] = j.follow; v = (v - offset) / ratio; j = s.motion.joints.find((x) => x.id === lead); } return v; };
  const round = (x) => Number(x.toFixed(4));
  return { kind: 'gait', period: s.gait.period, names, q: r.frames.map((f) => names.map((n) => { for (const e of f.feet) { const l = s.gait.legs.find((x) => x.name === e.leg); const i = l.chain.names.findIndex((m) => leads(m) === n); if (i >= 0) return round(toLead(l.chain.names[i], e.q[i])); } return 0; })) };
}

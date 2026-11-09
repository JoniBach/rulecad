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
    const c = chainFromMotion(motion, { tip: id, tool: [mark.frame[3], mark.frame[7], mark.frame[11]] }), hip = fk(c, c.names.map(() => 0)).frames[0].at;
    return { name: id, chain: c, at: hip };
  });
  const out = { legs, pattern: g.pattern, stride: num(g.stride), lift: num(g.lift), period: num(g.period), height: num(g.height), mass: num(g.mass), ...(g.steps ? { steps: num(g.steps) } : {}), ...(g.com ? { com: g.com.map(num) } : {}) };
  return out;
}

// The joint values of a frame of the cycle, in the assembly's terms
export const frameValues = (s, frame, jointValues) => jointValues(s.motion, Object.fromEntries(frame.feet.flatMap((e) => { const l = s.gait.legs.find((x) => x.name === e.leg); return l.chain.names.map((n, i) => [n, [e.q[i]]]); })));
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

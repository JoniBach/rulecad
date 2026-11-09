// Worms and their wheels. A worm is a screw whose thread, cut along its axis, is the basic rack's tooth; its wheel is
// a helical gear at the worm's lead angle, the usual printable wheel (not throated: the two touch at a point, which
// printed teeth, a little soft, spread). One turn of a worm of s starts moves its wheel s teeth. With a lead angle
// under the friction angle it locks: the wheel can't turn the worm.
import jscad from '@jscad/modeling';
import { rackProfile, helical, gearModel } from './gears.mjs';

const { extrudeFromSlices, slice } = jscad.extrusions;
const { mat4 } = jscad.maths;
const DEG = Math.PI / 180;
const fmt = (x, d = 3) => String(+x.toFixed(d));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
function size(what, k, v) { if (!(isNum(v) && v > 0)) throw new Error(`${what}: ${k} is a size above 0 (got ${JSON.stringify(v)})`); return v; }

/**
 * A worm's numbers. module: its axial module (the wheel's transverse module); starts: threads round it (1 to 4);
 * diameter: its pitch diameter (default 10 modules, a stout worm); friction: the coefficient between the flanks
 * (0.25 for printed PLA on PLA, an estimate) for whether it locks and how efficient it is.
 * @param {{ module: number, starts?: number, diameter?: number, pressureAngle?: number, backlash?: number, hand?: 'right' | 'left', friction?: number }} p
 */
export function wormModel(p) {
  const what = 'wormModel';
  if (!p || typeof p !== 'object') throw new Error(`${what}: give it { module, starts, diameter }`);
  const m = size(what, 'module', p.module), starts = p.starts ?? 1;
  if (!(Number.isInteger(starts) && starts >= 1 && starts <= 4)) throw new Error(`${what}: starts is a whole number from 1 to 4 (got ${JSON.stringify(p.starts)})`);
  const d = p.diameter === undefined ? 10 * m : size(what, 'diameter', p.diameter);
  if (d < 2 * 1.25 * m + 4 * m) throw new Error(`${what}: a pitch diameter of ${d} mm leaves under two modules of core under the threads (at least ${fmt(6.5 * m)} mm)`);
  const mu = p.friction ?? 0.25, axialPitch = Math.PI * m, lead = starts * axialPitch;
  const gamma = Math.atan(lead / (Math.PI * d)), phi = Math.atan(mu), alpha = (p.pressureAngle ?? 20) * DEG;
  // efficiency driving from the worm, through the normal pressure angle: tan γ (cos αn − μ tan γ) / (cos αn tan γ + μ)
  const an = Math.atan(Math.tan(alpha) * Math.cos(gamma));
  const efficiency = (Math.tan(gamma) * (Math.cos(an) - mu * Math.tan(gamma))) / (Math.cos(an) * Math.tan(gamma) + mu);
  return {
    kind: 'worm', module: m, starts, pitch: d, tip: d + 2 * m, root: d - 2.5 * m, axialPitch, lead, hand: p.hand ?? 'right',
    pressureAngle: alpha / DEG, backlash: p.backlash ?? 0.15, leadAngle: gamma / DEG, friction: mu, frictionAngle: phi / DEG,
    locks: gamma < phi, efficiency,
  };
}

/**
 * A worm: the thread along z, from z = 0 to its length, its axis on z.
 * @param {{ module: number, starts?: number, diameter?: number, length: number, bore?: number, pressureAngle?: number, backlash?: number, hand?: 'right' | 'left' }} p
 */
export function worm(p) {
  const w = wormModel(p), length = size('worm', 'length', p.length), m = w.module, r = w.pitch / 2;
  // the thread's axial section: the basic rack's tooth, its pitch line on the pitch radius (heights above it outward)
  const teeth = Math.max(2, w.starts * 2);
  const [loop] = rackProfile({ module: m, teeth, pressureAngle: w.pressureAngle, backlash: w.backlash, height: m }).loops;
  const p0 = w.axialPitch, top = loop.slice(2).reverse().filter(([x]) => x >= p0 && x <= 2 * p0); // one pitch of the top outline, along x
  const heightAt = (u) => { // the rack's height above its pitch line at u along it (one pitch repeating)
    const x = p0 + (((u % p0) + p0) % p0);
    for (let i = 1; i < top.length; i++) if (top[i][0] >= x) { const [a, b] = [top[i - 1], top[i]]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1); }
    return top.at(-1)[1];
  };
  // the section across the axis at z = 0: a point at angle θ is on the thread's axial section at u = −lead θ / 2π
  const sense = w.hand === 'left' ? -1 : 1, n = 90 * w.starts;
  const section = Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n, rho = r + heightAt((-sense * w.lead * t) / (2 * Math.PI)); return [rho * Math.cos(t), rho * Math.sin(t)]; });
  const hole = p.bore ? Array.from({ length: 48 }, (_, i) => { const t = (-2 * Math.PI * i) / 48; return [(p.bore / 2) * Math.cos(t), (p.bore / 2) * Math.sin(t)]; }) : null;
  if (p.bore && !(p.bore < w.root - 2 * m)) throw new Error(`worm: a bore of ${p.bore} mm leaves under a module of wall under the threads`);
  // up the axis the section turns: a turn for each lead, the thread's own helix
  const steps = Math.max(2, Math.ceil((length / w.lead) * 72)), slices = [];
  for (let k = 0; k <= steps; k++) {
    const z = (length * k) / steps, a = (sense * 2 * Math.PI * z) / w.lead, c = Math.cos(a), s = Math.sin(a), at = ([x, y]) => [x * c - y * s, x * s + y * c];
    const sides = [section, ...(hole ? [hole] : [])].flatMap((pts) => pts.map((q, i) => [at(q), at(pts[(i + 1) % pts.length])]));
    slices.push(slice.transform(mat4.fromTranslation(mat4.create(), [0, 0, z]), slice.fromSides(sides)));
  }
  return extrudeFromSlices({ numberOfSlices: slices.length, repair: false, callback: (t, i) => slices[i] }, slices[0]);
}

/**
 * The wheel a worm drives: a helical gear at the worm's lead angle, of the worm's hand, its transverse module the
 * worm's axial module. @param {object} wormSpec the worm's parameters @param {{ teeth: number, width: number, bore?: number, shift?: number }} p
 */
export function wormWheel(wormSpec, p) {
  const w = wormModel(wormSpec);
  return helical({ module: w.module, teeth: p.teeth, width: p.width, bore: p.bore, shift: p.shift, pressureAngle: w.pressureAngle, backlash: w.backlash, helix: w.leadAngle, hand: w.hand, chamfer: p.chamfer });
}

/**
 * How a worm drives its wheel: the centre distance (axes crossed at 90°), turns of the wheel for one of the worm,
 * whether it locks, and how efficient it is. @param {object} wormSpec @param {{ teeth: number, shift?: number }} wheel
 */
export function wormMesh(wormSpec, wheel) {
  const w = wormModel(wormSpec), g = gearModel({ module: w.module, teeth: wheel.teeth, shift: wheel.shift ?? 0, pressureAngle: w.pressureAngle, helix: w.leadAngle, hand: w.hand });
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const ratio = w.starts / g.teeth;
  f('info', `${g.teeth / w.starts} turns of the worm for one of the wheel; lead angle ${fmt(w.leadAngle, 2)}°`, 'worm.ratio', { ratio });
  if (w.locks) f('pass', `it locks: the lead angle (${fmt(w.leadAngle, 2)}°) is under the friction angle (${fmt(w.frictionAngle, 1)}° at μ ${w.friction}), so the wheel can't turn the worm; ${fmt(w.efficiency * 100, 0)}% efficient driving`, 'worm.locks', { locks: true });
  else f('info', `it doesn't lock: the lead angle (${fmt(w.leadAngle, 2)}°) is over the friction angle (${fmt(w.frictionAngle, 1)}°), so a load on the wheel can turn the worm back; ${fmt(w.efficiency * 100, 0)}% efficient driving`, 'worm.locks', { locks: false });
  if (w.leadAngle > 25) f('warn', `a lead angle of ${fmt(w.leadAngle, 1)}° is steep for a worm: the wheel's teeth lean as much, and print poorly past about 45° at their tips`, 'worm.lead');
  return { centre: (w.pitch + g.pitch) / 2 + (wheel.shift ?? 0) * w.module, ratio, locks: w.locks, efficiency: w.efficiency, leadAngle: w.leadAngle, findings: out };
}

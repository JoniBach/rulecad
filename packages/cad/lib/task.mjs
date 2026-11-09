// The task at the top of a machine: what it is for, and whether the tool gets there. The assembly's joints from its base
// to the tool become a chain (@rulecad/robots); the sheet is sampled against the chain; the joints' speeds and their
// errors are carried to the tool through the Jacobian. The picture and the figures come from the same samples.
//   "task": { "tool": "pen.tip", "sheet": { "size": "a5", "at": [60, -74, 0] }, "speed": 50, "accuracy": 0.3 }
import fs from 'node:fs';
import { chainFromMotion, reach, sheetFrame, sheetPoint, jacobian, fk } from '@rulecad/robots';
import { evaluate, peekRuleSet } from './rules.mjs';
import { paths } from './workspace.mjs';
import { trainFrom, workingSpeed } from './motors.mjs';

const n3 = (x, d = 2) => String(Number(x.toFixed(d)));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const CORNERS = ['lower left', 'lower right', 'upper right', 'upper left'];

/** The task as written, checked by name when the assembly is built. */
export function taskOf(a, motion, num) {
  const t = a.task; if (!t) return null;
  const what = 'task';
  if (!t.tool || !String(t.tool).includes('.')) throw new Error(`${what}: tool is an anchor, <item>.<anchor> (got ${JSON.stringify(t.tool)})`);
  const given = ['sheet', 'region', 'volume'].filter((k) => t[k] != null);
  if (given.length !== 1) throw new Error(`${what}: give one of sheet, region or volume (got ${given.join(', ') || 'none'})`);
  const [id, name] = String(t.tool).split('.'), mark = motion.marks.find((m) => m.id === id && m.name === name);
  if (!mark) throw new Error(`${what}: no anchor "${t.tool}" (anchors: ${motion.marks.filter((m) => m.id === id).map((m) => m.name).join(', ') || `no item ${id}`})`);
  const vec = (v) => v.map(num), value = (k) => { if (t[k] == null) return null; const x = num(t[k]); if (!(x > 0)) throw new Error(`${what}: ${k} is above 0 (got ${x})`); return x; };
  const out = { tool: t.tool, item: id, point: [mark.frame[3], mark.frame[7], mark.frame[11]], speed: value('speed'), accuracy: value('accuracy'), elbow: t.elbow ?? null, deflection: t.deflection != null ? num(t.deflection) : 0, payload: t.payload != null ? num(t.payload) : null, accel: t.accel != null ? num(t.accel) : null };
  if (t.elbow != null && !['left', 'right'].includes(t.elbow)) throw new Error(`${what}: elbow is left or right (got ${JSON.stringify(t.elbow)})`);
  if (t.sheet) out.sheet = { ...t.sheet, at: vec(t.sheet.at), ...(t.sheet.normal ? { normal: vec(t.sheet.normal) } : {}), ...(t.sheet.u ? { u: vec(t.sheet.u) } : {}) };
  if (t.region) out.region = t.region;
  if (t.volume) out.volume = t.volume;
  try { if (out.sheet) sheetFrame(out.sheet); } catch (e) { throw new Error(`${what}: ${e.message}`); }
  return out;
}

export const chainOf = (s) => chainFromMotion(s.motion, { tip: s.task.item, tool: s.task.point });

// One sampling of the task, kept so the three checks and the picture read the same samples
export function sample(s) {
  if (s.taskSamples) return s.taskSamples;
  const t = s.task, c = chainOf(s), spec = t.sheet ? { sheet: t.sheet } : t.region ? { region: t.region } : { volume: t.volume };
  let step = 10;
  if (t.sheet) { const f = sheetFrame(t.sheet); step = Math.min(f.width, f.height) / 12; }
  const go = (elbow) => reach(c, { ...spec, step, ...(elbow ? { elbow } : {}) });
  // Hold the elbow it's given, or the one that reaches the most
  let r, elbow = t.elbow;
  if (c.dof === 2 && !elbow) { const a = go('right'), b = go('left'); r = b.summary.reachable > a.summary.reachable || (b.summary.reachable === a.summary.reachable && b.summary.margin > a.summary.margin) ? (elbow = 'left', b) : (elbow = 'right', a); } else r = go(elbow);
  return (s.taskSamples = { c, r, elbow, step });
}

// A point on the sheet, said in millimetres from its centre
const onSheet = (t, p) => { if (!t.sheet) return `(${p.map((x) => n3(x, 1)).join(', ')})`; const f = sheetFrame(t.sheet), d = p.map((x, k) => x - f.at[k]); return `(${n3(dot(d, f.u), 1)}, ${n3(dot(d, f.v), 1)}) from its centre`; };

function reachCheck(s, f, picture) {
  const t = s.task, { r, elbow } = sample(s), code = 'task.reach', { summary } = r, thing = t.sheet ? 'sheet' : t.region ? 'region' : 'volume';
  const miss = summary.corners.map((c, i) => ({ c, name: CORNERS[i] ?? `corner ${i + 1}` })).filter((x) => !x.c.reachable).sort((a, b) => b.c.miss - a.c.miss);
  const values = { margin: summary.margin, reachable: summary.reachable, total: summary.total, elbow, samples: r.samples.map((x) => ({ point: x.point.map((v) => +v.toFixed(3)), reachable: x.reachable, q: x.q.map((v) => +v.toFixed(4)), margin: +x.margin.toFixed(3), manipulability: +x.manipulability.toFixed(1) })), picture };
  if (miss.length) {
    const w = miss[0];
    return f('fail', `the ${w.name} corner of the ${thing} can't be reached: ${t.tool} misses it by ${n3(w.c.miss)} mm (${summary.reachable} of ${summary.total} points on it are in reach)`, `${thing}: ${w.name} out of reach`, { code, at: w.c.point, refs: { corner: w.name, tool: t.tool }, values: { ...values, miss: w.c.miss } });
  }
  if (summary.reachable < summary.total) {
    const w = summary.worst;
    return f('fail', `${summary.total - summary.reachable} of ${summary.total} points on the ${thing} can't be reached, ${n3(w.miss)} mm short at worst, at ${onSheet(t, w.point)}: limits or the hole near the base`, `${thing}: not all in reach`, { code, at: w.point, refs: { tool: t.tool }, values: { ...values, miss: w.miss } });
  }
  const w = summary.corners.reduce((a, b) => (b.margin < a.margin ? b : a)), near = Math.min(summary.margin, w.margin);
  f('pass', `${t.tool} reaches the whole ${thing} with ${elbow ? `the elbow to the ${elbow}` : 'its joints'}: ${n3(near)} mm to spare at the worst point`, null, { code, at: summary.worst.point, refs: { tool: t.tool }, values });
}

// How fast a sampled point can go: in each direction across the sheet, the speed at which the first joint hits its limit
function fastest(c, q, frame, limits) {
  const J = jacobian(c, q), rows = frame ? [frame.u, frame.v].map((d) => c.names.map((_, i) => d[0] * J[0][i] + d[1] * J[1][i] + d[2] * J[2][i])) : [J[0], J[1]];
  const N = c.names.length, a = dot2(rows[0], rows[0]), b = dot2(rows[0], rows[1]), d = dot2(rows[1], rows[1]), det = a * d - b * b;
  if (Math.abs(det) < 1e-9) return 0;
  let worst = Infinity;
  for (let k = 0; k < 24; k++) {
    const th = (k * Math.PI) / 12, vx = Math.cos(th), vy = Math.sin(th), l0 = (d * vx - b * vy) / det, l1 = (a * vy - b * vx) / det;
    let scale = Infinity;
    for (let i = 0; i < N; i++) { const qd = Math.abs(rows[0][i] * l0 + rows[1][i] * l1); if (qd > 1e-12) scale = Math.min(scale, limits[i] / qd); }
    worst = Math.min(worst, scale);
  }
  return worst;
}
const dot2 = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);

// deg/s (or mm/s) each joint of the chain can go, from what drives it. null: nothing drives it
function jointSpeeds(s, c) {
  const motion = s.motion;
  return c.names.map((id) => {
    const t = trainFrom(motion, id), d = motion.drives.find((x) => x.joint === t.root);
    if (!d) return null;
    const rpm = workingSpeed(d.model, d.spec), output = (rpm / t.ratio) * 6; // deg/s at the joint
    return t.slide != null ? output * t.slide : output;
  });
}

function speedCheck(s, f) {
  const t = s.task, code = 'task.speed'; if (t.speed == null) return;
  const { c, r } = sample(s), limits = jointSpeeds(s, c), frame = t.sheet ? sheetFrame(t.sheet) : null;
  const free = c.names.filter((_, i) => limits[i] == null);
  if (free.length) return f('warn', `nothing says how fast ${free.join(' and ')} can turn, so ${t.speed} mm/s isn't checked: give ${free.length > 1 ? 'them' : 'it'} a motor`, `speed: ${free.join(', ')} undriven`, { code, refs: { joints: free } });
  let worst = null;
  for (const x of r.samples) if (x.reachable) { const v = fastest(c, x.q, frame, limits); if (!worst || v < worst.v) worst = { v, x }; }
  if (!worst) return;
  const values = { slowest: worst.v, wanted: t.speed, margin: worst.v / t.speed }, at = worst.x.point, say = `at ${n3(worst.v, 1)} mm/s at the slowest point, ${onSheet(t, at)}, against the ${t.speed} mm/s it's asked for`;
  if (worst.v < t.speed) f('fail', `${t.tool} moves ${say}: a faster motor speed, less ratio or a shorter arm`, `speed ${n3(worst.v, 0)} mm/s`, { code, at, values });
  else f('pass', `${t.tool} moves ${say}`, null, { code, at, values });
}

// Each joint's error terms: step resolution from its motor, and what the assembly says of its play, its twist and so on
function terms(s, c) {
  const motion = s.motion, specs = new Map((s.a.joints || []).map((j) => [j.id, j]));
  return c.names.map((id) => {
    const out = [], t = trainFrom(motion, id), d = motion.drives.find((x) => x.joint === t.root), spec = specs.get(id);
    if (d?.model.stepAngle) { const micro = d.spec.microsteps ?? 16; out.push({ term: 'step', value: t.slide != null ? (d.model.stepAngle / micro) * t.slide : d.model.stepAngle / micro / t.ratio, kind: 'spec', note: `${n3(d.model.stepAngle, 3)}° at 1/${micro} step, ${n3(t.ratio, 1)}:1` }); }
    const belt = motion.joints.find((x) => x.id === id)?.slide?.stretch; if (belt) out.push({ term: 'belt stretch', value: (belt.load * belt.length) / (belt.k * belt.width), kind: 'estimate', note: `${belt.load} N over ${belt.length} mm` });
    for (const [term, expr] of Object.entries(spec?.errors ?? {})) out.push({ term, value: s.num(expr), kind: kindOf(expr), expr });
    return { joint: id, terms: out, geared: t.stages.length > 0 };
  });
}
function kindOf(expr) {
  const kinds = [...String(expr).matchAll(/([a-z][\w-]*)\.([a-z_]\w*)/gi)].map(([, set, rule]) => { try { return peekRuleSet(set).rules[rule]?.kind ?? 'estimate'; } catch { return 'estimate'; } });
  return kinds.length ? (kinds.includes('estimate') ? 'estimate' : kinds[0]) : 'estimate';
}

// The error at one sample: each angle times what it swings at the tool. Worst case, root-sum-square, and each term's share
function errorAt(c, q, list, extra) {
  const J = jacobian(c, q), lever = c.names.map((_, i) => Math.hypot(J[0][i], J[1][i], J[2][i])), parts = [];
  list.forEach((j, i) => { for (const x of j.terms) parts.push({ joint: j.joint, term: x.term, kind: x.kind, note: x.note, angle: x.value, mm: x.value * lever[i] }); });
  if (extra) parts.push({ joint: null, term: 'link deflection', kind: 'estimate', mm: extra });
  return { worst: parts.reduce((t, p) => t + p.mm, 0), rss: Math.sqrt(parts.reduce((t, p) => t + p.mm * p.mm, 0)), parts };
}

// The worst-case error at one joint configuration
export const jacobianError = (c, q, list, extra) => errorAt(c, q, list, extra).worst;

export function accuracyOf(s) {
  const { c, r } = sample(s), list = terms(s, c), at = r.samples.filter((x) => x.reachable).map((x) => ({ x, e: errorAt(c, x.q, list, s.task.deflection) }));
  return { list, at, worst: at.reduce((a, b) => (b.e.worst > a.e.worst ? b : a), at[0]) };
}

function accuracyCheck(s, f, picture) {
  const t = s.task, code = 'task.accuracy'; if (t.accuracy == null) return null;
  const { list, at, worst } = accuracyOf(s); if (!worst) return null;
  const big = [...worst.e.parts].sort((a, b) => b.mm - a.mm)[0], soft = worst.e.parts.filter((p) => p.kind === 'estimate');
  const name = (p) => `${p.joint ? `${p.joint}'s ` : ''}${p.term}${p.angle != null ? ` (${n3(p.angle, 3)}°)` : ''}`;
  const unmeasured = list.filter((j) => j.geared && !j.terms.some((x) => /play|backlash/.test(x.term))).map((j) => j.joint);
  const predict = { name: code, figure: `${t.tool} error at its worst point`, value: worst.e.worst, unit: 'mm' };
  const margin = worst.e.worst / t.accuracy, level = margin > 1 ? 'fail' : margin > 0.8 ? 'warn' : 'pass';
  const caveat = soft.length ? ` Rests on estimates (${soft.map(name).join(', ')}): settle them with cad measured.` : '', missing = unmeasured.length ? ` ${unmeasured.join(' and ')} ${unmeasured.length > 1 ? 'have' : 'has'} gears and no play given: it counts as none until measured (bench test 14).` : '';
  const text = `${t.tool} can be out by ${n3(worst.e.worst, 3)} mm at worst, ${n3(worst.e.rss, 3)} mm root-sum-square, at ${onSheet(t, worst.x.point)}, against ${t.accuracy} mm. Biggest: ${name(big)}, ${n3(big.mm, 3)} mm.${caveat}${missing}`;
  f(level, text, level === 'pass' ? null : `pen error ${n3(worst.e.worst, 2)} mm`, { code, at: worst.x.point, predict, refs: { biggest: big.term, joint: big.joint }, values: { worst: worst.e.worst, rss: worst.e.rss, wanted: t.accuracy, margin, terms: worst.e.parts, picture } });
  return at;
}

// Pictures in .preview/: the sheet, what's reachable, shaded; the arm at its worst point
const colour = (x) => `rgb(${Math.round(240 - 180 * x)},${Math.round(240 - 100 * x)},${Math.round(250 - 40 * x)})`;
function pictures(s, errors) {
  if (!s.task.sheet) return null;
  const { c, r } = sample(s), f = sheetFrame(s.task.sheet), toSheet = (p) => { const d = p.map((x, k) => x - f.at[k]); return [dot(d, f.u), -dot(d, f.v)]; };
  const pts = [...r.samples.map((x) => toSheet(x.point)), ...fk(c, r.summary.worst.q).frames.map((x) => toSheet(x.at))], lo = [0, 1].map((k) => Math.min(...pts.map((p) => p[k]))), hi = [0, 1].map((k) => Math.max(...pts.map((p) => p[k])));
  const m = 15, W = hi[0] - lo[0] + 2 * m, H = hi[1] - lo[1] + 2 * m, step = sample(s).step;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lo[0] - m} ${lo[1] - m} ${W} ${H}" width="${Math.round(W * 3)}" height="${Math.round(H * 3)}" font-family="sans-serif" font-size="5">`;
  const sheet = `<rect x="${-f.width / 2}" y="${-f.height / 2}" width="${f.width}" height="${f.height}" fill="none" stroke="#333" stroke-width="0.6"/>`;
  const arm = (q) => { const F = fk(c, q), P = [...F.frames.map((x) => x.at), F.position].map(toSheet); return `<polyline points="${P.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#c33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` + P.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="#c33"/>`).join(''); };
  const cells = (val) => r.samples.map((x) => { const [px, py] = toSheet(x.point), v = val(x); return `<rect x="${px - step / 2}" y="${py - step / 2}" width="${step}" height="${step}" fill="${v == null ? '#f8c0c0' : colour(v)}"/>`; }).join('');
  const dir = paths.preview(s.project, ''); fs.mkdirSync(dir, { recursive: true });
  const write = (name, body, title) => { const file = paths.preview(s.project, `${s.name}-${name}.svg`); fs.writeFileSync(file, `${head}<text x="${lo[0] - m + 2}" y="${lo[1] - m + 7}">${title}</text>${body}</svg>\n`); return file; };
  const top = Math.max(...r.samples.map((x) => x.manipulability), 1e-9);
  const out = { reach: write('reach', cells((x) => (x.reachable ? x.manipulability / top : null)) + sheet + arm(r.summary.worst.q), 'Reach: darker has more dexterity, red is out of reach. The arm at the least margin') };
  if (errors?.length) {
    const most = Math.max(...errors.map((e) => e.e.worst), 1e-9), by = new Map(errors.map((e) => [e.x, e.e.worst / most])), worst = errors.reduce((a, b) => (b.e.worst > a.e.worst ? b : a));
    out.error = write('error', cells((x) => (by.has(x) ? by.get(x) : null)) + sheet + arm(worst.x.q), `Predicted error: darkest is ${n3(most, 3)} mm. The arm at its worst point`);
  }
  return out;
}

/** The task's findings, in the assembly's shape. */
export function taskChecks(s, f) {
  if (!s.task) return;
  const relative = (x) => x && x.replace(`${paths.preview(s.project, '')}/`, '');
  let drawn = null;
  try { const { c } = sample(s); if (!c.dof) return; drawn = true; } catch (e) { return f('fail', `task: ${e.message}`, 'task: no chain', { code: 'task.chain' }); }
  const pic = pictures(s, s.task.accuracy != null ? accuracyOf(s).at : null);
  reachCheck(s, f, relative(pic?.reach));
  speedCheck(s, f);
  accuracyCheck(s, f, relative(pic?.error));
  return drawn;
}

// A point on the sheet, for what plans on it
export const pointOnSheet = (sheet, x, y) => sheetPoint(sheet, x, y);

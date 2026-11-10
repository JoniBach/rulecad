// One description of a machine, read from its assembly: the axes with the steps they take, where each comes from, and
// the task. cad plot plans a drawing on it, checks it against the task, and shows the result before anything moves.
import fs from 'node:fs';
import path from 'node:path';
import { svgToStrokes, orderStrokes, planToolpath, stepBlocks, estimate, sheetFrame, fk } from '@rulecad/robots';
import { trainFrom, workingSpeed } from './motors.mjs';
import { chainOf, accuracyOf, sample, jacobianError } from './task.mjs';
import { paths } from './workspace.mjs';

const r6 = (x) => +Number(x).toFixed(6), n3 = (x, d = 2) => String(Number(x.toFixed(d)));

/** The machine as plain data. Every figure's origin is said in _why, by the name of the figure. @param {object} s a built assembly with a task */
export function machineOf(s) {
  if (!s.task) throw new Error(`${s.project}/${s.name} has no "task": a machine says what it is for`);
  const c = chainOf(s), motion = s.motion, specs = new Map((s.a.joints || []).map((j) => [j.id, j]));
  const axes = c.names.map((id) => {
    const t = trainFrom(motion, id), d = motion.drives.find((x) => x.joint === t.root), j = motion.joints.find((x) => x.id === id), spec = specs.get(id) ?? {};
    if (!d?.model.stepAngle) throw new Error(`${s.project}/${s.name}: joint ${id} has no stepper driving it, and a step file needs one`);
    const micro = d.spec.microsteps ?? 16, per = (360 / d.model.stepAngle) * micro, stepsPerUnit = j.type === 'prismatic' ? (per * t.ratio) / t.slide / 360 : (per * t.ratio) / 360;
    const rpm = workingSpeed(d.model, d.spec), maxRate = (rpm / 60) * per, home = spec.home;
    const homing = home ? { endstop: home.endstop, direction: home.direction ?? -1, rate: Math.round(maxRate / 8), back: Math.round(stepsPerUnit * 3) } : null;
    return { name: id, joint: id, motor: d.id, model: d.model.name, driver: d.spec.driver ?? null, stepAngle: d.model.stepAngle, microsteps: micro, ratio: r6(t.ratio), stepsPerUnit: r6(stepsPerUnit), unit: j.type === 'prismatic' ? 'mm' : 'deg', limits: (j.limits ?? j.dofs[0].slice(0, 2)).map(r6), maxRate: Math.round(maxRate), homing,
      _why: { stepAngle: `${d.model.name}.step_angle`, microsteps: d.spec.microsteps != null ? `the motor item's "microsteps" (resolution only, not accuracy)` : 'the default, 1/16 (resolution only, not accuracy)', ratio: t.stages.length ? `the train from ${t.root} to ${id}` : 'direct', maxRate: `${n3(rpm, 1)} rpm, ${d.spec.speed != null ? 'the motor item\'s speed' : `the working speed of a ${d.model.name}`}` } };
  });
  const kinematics = c.names.length === 2 && motion.joints.filter((j) => c.names.includes(j.id)).every((j) => j.type === 'revolute') ? 'scara' : motion.joints.filter((j) => c.names.includes(j.id)).every((j) => j.type === 'prismatic') ? 'cartesian' : 'serial';
  const pen = s.a.task.pen ?? null;
  return { format: 'rulecad.machine/1', name: `${s.project}/${s.name}`, kinematics, tool: s.task.tool, elbow: sample(s).elbow, axes, task: { sheet: s.a.task.sheet ?? null, region: s.a.task.region ?? null, volume: s.a.task.volume ?? null, speed: s.task.speed, accuracy: s.task.accuracy, accel: s.task.accel ?? 500 }, ...(pen ? { pen } : {}) };
}

// A drawing's size against the sheet: the first stroke that leaves it, named
function fitsSheet(strokes, frame) {
  const off = [];
  for (const st of strokes) {
    let worst = 0;
    for (const p of st.points) worst = Math.max(worst, -p[0], p[0] - frame.width, -p[1], p[1] - frame.height);
    if (worst > 1e-6) off.push({ stroke: st.name, by: worst });
  }
  return off.sort((a, b) => b.by - a.by);
}

export const CALIBRATION = (w, h) => {
  const cx = w / 2, cy = h / 2, side = Math.min(100, Math.min(w, h) - 20), r = Math.min(15, (Math.min(w, h) - side) / 4 + 10);
  const at = [[cx, cy], [cx - (side / 2 - r), cy - (side / 2 - r)], [cx + (side / 2 - r), cy + (side / 2 - r)]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect id="square" x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" fill="none" stroke="black"/>${at.map(([x, y], i) => `<circle id="circle-${i + 1}" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="black"/>`).join('')}</svg>`;
};

/**
 * Plan a drawing on a machine. Refused (ok: false, nothing written) if it leaves the sheet or can't be reached.
 * @param {object} s a built assembly with a task and a sheet @param {string} svg the drawing @param {{ tolerance?: number, name: string }} o
 */
export function plot(s, svg, { tolerance, name } = {}) {
  if (!s.task?.sheet) throw new Error(`${s.project}/${s.name}: plot draws on a "sheet", and the task has none`);
  const m = machineOf(s), frame = sheetFrame(s.task.sheet), c = chainOf(s), tol = tolerance ?? Math.min(0.1, (s.task.accuracy ?? 0.3) / 3);
  const page = svgToStrokes(svg, { tolerance: tol }), findings = [...page.findings], ok = () => findings.every((x) => x.level !== 'fail');
  if (!page.strokes.length) return { ok: false, findings: [...findings, { level: 'fail', text: 'the drawing has no strokes', code: 'plot.empty' }] };
  const off = fitsSheet(page.strokes, frame);
  if (off.length) { findings.push({ level: 'fail', text: `stroke ${off[0].stroke} leaves the ${n3(frame.width, 0)} × ${n3(frame.height, 0)} mm sheet by ${n3(off[0].by)} mm${off.length > 1 ? `, and ${off.length - 1} more` : ''}: the drawing is larger than the sheet`, code: 'plot.sheet', refs: { stroke: off[0].stroke }, values: { by: off[0].by, count: off.length } }); return { ok: false, findings }; }
  const ordered = orderStrokes(page, {}), plan = planToolpath(c, ordered, { tolerance: tol, elbow: m.elbow, sheet: s.task.sheet });
  findings.push(...plan.findings);
  if (!plan.ok) return { ok: false, findings, plan };
  const speed = s.task.speed ?? 50, accel = m.task.accel, axes = m.axes.map((a) => ({ name: a.name, stepsPerUnit: a.stepsPerUnit, maxRate: a.maxRate }));
  const steps = stepBlocks(plan, { axes, speed, accel, travelSpeed: speed * 2 });
  // The pen-down lines, with what the budget predicts along them
  const { list } = s.task.accuracy != null ? accuracyOf(s) : { list: null }, drawn = plan.moves.filter((x) => x.kind === 'draw').map((x) => ({ stroke: x.stroke, name: x.name, points: x.points.map((p) => p.map(r6)), error: list ? x.q.map((q) => +jacobianError(c, q, list, s.task.deflection).toFixed(4)) : null }));
  const time = estimate(steps), out = { ...steps, machine: m.name, drawing: name, drawn };
  findings.push(...steps.findings, { level: 'info', text: `${ordered.strokes?.length ?? ordered.length} strokes, ${n3(plan.length.draw, 0)} mm drawn, ${n3(plan.length.travel, 0)} mm of travel, ${n3(time.time, 1)} s, with tool speed ${speed} mm/s`, code: 'plot.time', values: { time: time.time, draw: plan.length.draw, travel: plan.length.travel } });
  return { ok: ok(), findings, plan, steps: out, machine: m, time };
}

// An animated SVG: the sheet, the drawing appearing, the arm sweeping over it
export function animation(s, result) {
  const { c } = sample(s), f = sheetFrame(s.task.sheet), plan = result.plan, moves = plan.moves, toS = (p) => { const d = p.map((x, k) => x - f.at[k]); return [r6(d[0] * f.u[0] + d[1] * f.u[1] + d[2] * f.u[2]), r6(-(d[0] * f.v[0] + d[1] * f.v[1] + d[2] * f.v[2]))]; };
  const speed = s.task.speed ?? 50, frames = [];
  let t = 0;
  for (const m of moves) for (let i = 1; i < m.points.length; i++) { const dt = Math.hypot(...m.points[i].map((x, k) => x - m.points[i - 1][k])) / speed; frames.push({ t: t + dt, q: m.q[i], kind: m.kind }); t += dt; }
  const every = Math.max(1, Math.floor(frames.length / 240)), keep = frames.filter((_, i) => !(i % every)), last = frames.at(-1) || { t: 1 }, T = last.t || 1;
  const arm = (q) => armPoints(c, q).map(toS).map((p) => p.join(',')).join(' ');
  const pts = [...moves.flatMap((m) => m.points.map(toS)), ...armPoints(c, moves[0].q[0]).map(toS)], lo = [0, 1].map((k) => Math.min(-f.width / 2 * (k ? f.height / f.width : 1), ...pts.map((p) => p[k]))), hi = [0, 1].map((k) => Math.max((k ? f.height : f.width) / 2, ...pts.map((p) => p[k])));
  const m = 10, draw = result.steps.drawn;
  const lines = draw.map((d, i) => { const len = d.points.reduce((a, p, j) => (j ? a + Math.hypot(...p.map((x, k) => x - d.points[j - 1][k])) : 0), 0), start = moves.slice(0, moves.findIndex((x) => x.kind === 'draw' && x.stroke === d.stroke)).reduce((a, x) => a + x.points.reduce((b, p, j) => (j ? b + Math.hypot(...p.map((v, k) => v - x.points[j - 1][k])) : 0), 0), 0) / speed; return `<polyline points="${d.points.map(toS).map((p) => p.join(',')).join(' ')}" fill="none" stroke="#135" stroke-width="0.5" stroke-dasharray="${len}" stroke-dashoffset="${len}"><animate attributeName="stroke-dashoffset" from="${len}" to="0" begin="${n3(start, 2)}s" dur="${n3(len / speed, 2)}s" fill="freeze"/></polyline>`; }).join('');
  const values = keep.map((x) => arm(x.q)).join(';');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lo[0] - m} ${lo[1] - m} ${hi[0] - lo[0] + 2 * m} ${hi[1] - lo[1] + 2 * m}" width="${Math.round((hi[0] - lo[0] + 2 * m) * 3)}" height="${Math.round((hi[1] - lo[1] + 2 * m) * 3)}"><rect x="${-f.width / 2}" y="${-f.height / 2}" width="${f.width}" height="${f.height}" fill="#fff" stroke="#333" stroke-width="0.4"/>${lines}<polyline points="${arm(moves[0].q[0])}" fill="none" stroke="#c33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="points" dur="${n3(T, 2)}s" fill="freeze" values="${values}"/></polyline></svg>\n`;
}
const armPoints = (c, q) => { const F = fk(c, q); return [...F.frames.map((x) => x.at), F.position]; };

export function writePlot(s, result, base) {
  const dir = paths.exports(s.project); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, `${base}.steps.json`);
  fs.writeFileSync(file, JSON.stringify(result.steps));
  const prev = paths.preview(s.project, `${base}-plot.svg`); fs.mkdirSync(path.dirname(prev), { recursive: true }); fs.writeFileSync(prev, animation(s, result));
  return { file, preview: prev };
}
export function writeMachine(s, m) { const dir = paths.exports(s.project); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, `${s.name}.machine.json`); fs.writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`); return file; }

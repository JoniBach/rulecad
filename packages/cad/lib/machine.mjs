// One description of a machine, read from its assembly: the axes with the steps they take, where each comes from, and
// the task. cad plot plans a drawing on it, checks it against the task, and shows the result before anything moves.
import fs from 'node:fs';
import path from 'node:path';
import { svgToStrokes, orderStrokes, planToolpath, stepBlocks, estimate, sheetFrame, fk, gaitBlocks } from '@rulecad/robots';
import { gaitSequence } from './gait.mjs';
import { trainFrom, workingSpeed } from './motors.mjs';
import { chainOf, accuracyOf, sample, jacobianError } from './task.mjs';
import { paths } from './workspace.mjs';

const num = Number.isFinite, r6 = (x) => +Number(x).toFixed(6), n3 = (x, d = 2) => String(Number(x.toFixed(d)));

// One driven joint as an axis: its motor, the steps it takes a degree (or mm) through its train, and the fastest it steps
function axisOf(s, id) {
  const motion = s.motion, t = trainFrom(motion, id), d = motion.drives.find((x) => x.joint === t.root), j = motion.joints.find((x) => x.id === id), spec = new Map((s.a.joints || []).map((x) => [x.id, x])).get(id) ?? {};
  if (!d?.model.stepAngle) throw new Error(`${s.project}/${s.name}: joint ${id} has no stepper driving it, and a step file needs one`);
  const micro = d.spec.microsteps ?? 16, per = (360 / d.model.stepAngle) * micro, stepsPerUnit = j.type === 'prismatic' ? (per * t.ratio) / t.slide / 360 : (per * t.ratio) / 360;
  const rpm = workingSpeed(d.model, d.spec, d.supply), maxRate = (rpm / 60) * per, home = spec.home;
  const homing = home ? { endstop: home.endstop, direction: home.direction ?? -1, rate: Math.round(maxRate / 8), back: Math.round(stepsPerUnit * 3) } : null;
  return { name: id, joint: id, motor: d.id, model: d.model.name, driver: d.spec.driver ?? null, stepAngle: d.model.stepAngle, microsteps: micro, ratio: r6(t.ratio), stepsPerUnit: r6(stepsPerUnit), unit: j.type === 'prismatic' ? 'mm' : 'deg', limits: (j.limits ?? j.dofs[0].slice(0, 2)).map(r6), maxRate: Math.round(maxRate), homing,
    _why: { stepAngle: `${d.model.name}.step_angle`, microsteps: d.spec.microsteps != null ? `the motor item's "microsteps" (resolution only, not accuracy)` : 'the default, 1/16 (resolution only, not accuracy)', ratio: t.stages.length ? `the train from ${t.root} to ${id}` : 'direct', maxRate: `${n3(rpm, 1)} rpm, ${d.spec.speed != null ? 'the motor item\'s speed' : `the working speed of a ${d.model.name}`}` } };
}

/** The slots of a CNC shield each motor is wired to, by motor item: from a wire "<motor>.<anchor>" to "<item>.X" (X, Y, Z or A). */
export function shieldSlots(a) { return slotsOf(a, CONTROLLERS['cnc-shield-v3']); }
/** The step and direction slots of the streamer (arm.ino on a CNC Shield V3), in its axis order: axis 0 on X, 1 on Y, 2 on Z. */
export const STREAMER_SLOTS = ['X', 'Y', 'Z'];

/** The boards the streamer runs on, by the bought part that is the machine's controller: its build (board, as send.mjs and
 * scripts/firmware.mjs name it), its step and direction slots in its axis order, the anchor a wire ends on for each, and
 * how a finding names them. The Mega's slots S0 to S7 are its pins for axes 0 to 7 (arduino-mega-2560's rules). */
export const CONTROLLERS = {
  'cnc-shield-v3': { board: 'uno', title: 'an Uno under a CNC Shield V3', of: "the shield's", any: "a shield's slot", slots: STREAMER_SLOTS, wired: /^[^.]+\.([XYZA])$/ },
  'arduino-mega-2560': { board: 'mega', title: 'a Mega 2560', of: "the Mega's", any: "a slot of the Mega", slots: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'], wired: /^[^.]+\.(S[0-7])$/ },
};

/** The machine's controller: the bought board in its assembly that the streamer runs on, or the Uno under a CNC shield where
 * it has none (as every machine had before the Mega). Two different ones are refused by name.
 * @param {object} a the assembly's JSON @returns {{ set: string, item: string | null, board: string, title: string, of: string, any: string, slots: string[], wired: RegExp }} */
export function controllerOf(a) {
  const found = (a.items || []).filter((it) => typeof it.bought === 'string' && CONTROLLERS[it.bought]);
  if (new Set(found.map((it) => it.bought)).size > 1) throw new Error(`items ${found.map((it) => `${it.id} (${it.bought})`).join(', ')}: a machine streams through one controller, ${Object.keys(CONTROLLERS).join(' or ')}`);
  const set = found[0]?.bought ?? 'cnc-shield-v3';
  return { set, item: found[0]?.id ?? null, ...CONTROLLERS[set] };
}

/** The controller's slot each motor is wired to, by motor item: a wire from "<motor>.<anchor>" to "<board>.<slot>" (a CNC
 * shield's slot), or a signal wire to the slot from the motor's driver (its "driver" item) or from the board its own wire
 * ends on (an external driver's breakout: the motor's wire to it, its STEP and DIR on to the controller).
 * @param {object} a the assembly's JSON @param {{ wired: RegExp }} c a controller (CONTROLLERS) */
export function slotsOf(a, c) {
  const out = {}, motors = new Set((a.items || []).filter((it) => it.motor).map((it) => it.id)), top = (x) => String(x).split('.')[0];
  const driverOf = Object.fromEntries((a.items || []).filter((it) => it.motor?.driver).map((it) => [it.motor.driver, it.id]));
  for (const w of a.wires || []) for (const [m, o] of [[top(w.from), top(w.to)], [top(w.to), top(w.from)]]) if (motors.has(m) && !motors.has(o) && !(o in driverOf)) driverOf[o] = m;
  for (const w of a.wires || []) {
    for (const [from, to] of [[String(w.from), String(w.to)], [String(w.to), String(w.from)]]) {
      const m = c.wired.exec(to), id = from.split('.')[0];
      if (m && from.includes('.')) out[driverOf[id] ?? id] = m[1];
    }
  }
  return out;
}

/** The machine as plain data. Every figure's origin is said in _why, by the name of the figure. A machine with a gait and no
 * task is its legs: an axis for each joint a motor turns, in the order the shield's slots are wired. @param {object} s a built assembly with a task or a gait */
export function machineOf(s) {
  if (!s.task && s.gait) return gaitMachineOf(s);
  if (!s.task) throw new Error(`${s.project}/${s.name} has no "task" and no "gait": a machine says what it is for`);
  const c = chainOf(s), motion = s.motion;
  const axes = c.names.map((id) => axisOf(s, id));
  const kinematics = c.names.length === 2 && motion.joints.filter((j) => c.names.includes(j.id)).every((j) => j.type === 'revolute') ? 'scara' : motion.joints.filter((j) => c.names.includes(j.id)).every((j) => j.type === 'prismatic') ? 'cartesian' : 'serial';
  const pen = s.a.task.pen ?? null;
  return { format: 'rulecad.machine/1', name: `${s.project}/${s.name}`, kinematics, tool: s.task.tool, elbow: sample(s).elbow, axes, controller: controllerSummary(controllerOf(s.a)), task: { sheet: s.a.task.sheet ?? null, region: s.a.task.region ?? null, volume: s.a.task.volume ?? null, speed: s.task.speed, accuracy: s.task.accuracy, accel: s.task.accel ?? 500, ...(s.task.blockTime ? { blockTime: s.task.blockTime } : {}) }, ...(pen ? { pen } : {}) };
}

// The controller as the machine description carries it: its build, and the bought item it is
const controllerSummary = (c) => ({ board: c.board, set: c.set, item: c.item, slots: c.slots });

function gaitMachineOf(s) {
  const seq = gaitSequence(s), c = controllerOf(s.a), slots = slotsOf(s.a, c);
  let axes = seq.names.map((id) => { const a = axisOf(s, id); return { ...a, ...(slots[a.motor] ? { slot: slots[a.motor] } : {}) }; });
  if (axes.every((a) => c.slots.includes(a.slot))) axes = [...axes].sort((a, b) => c.slots.indexOf(a.slot) - c.slots.indexOf(b.slot));
  const g = s.gait, pattern = typeof s.a.gait.pattern === 'string' ? s.a.gait.pattern : `duty ${s.a.gait.pattern?.duty}`;
  return { format: 'rulecad.machine/1', name: `${s.project}/${s.name}`, kinematics: 'legged', tool: null, axes, task: null, controller: controllerSummary(c),
    gait: { legs: g.legs.map((l) => l.name), pattern, period: g.period, stride: g.stride, lift: g.lift, height: g.height, frames: seq.q.length } };
}

/**
 * A gait as a step file: its cycle played for some cycles from a pose of the assembly and back to it, every leg's joints
 * in the same blocks. Findings say how long a cycle takes on the motors against the gait's period, and whether the
 * streamer can take the file: as many axes as its controller has slots (three on an Uno under a CNC shield, eight on a
 * Mega 2560), each on the slot of its own number.
 * @param {object} s a built assembly with a gait @param {{ cycles?: number, period?: number, from?: string }} [o] from: a pose's name (default the pose the assembly shows)
 */
export function plotGait(s, { cycles = 3, period, from } = {}) {
  if (!s.gait) throw new Error(`${s.project}/${s.name} has no "gait" to play`);
  const m = machineOf(s), seq = gaitSequence(s), names = m.axes.map((a) => a.name), cols = names.map((n) => seq.names.indexOf(n));
  const ordered = { period: seq.period, names, q: seq.q.map((r) => cols.map((i) => r[i])) };
  const poses = s.motion.poses || {}, poseName = from ?? s.motion.pose ?? null;
  if (from != null && !poses[from]) throw new Error(`--pose ${from}: no such pose (poses: ${Object.keys(poses).join(', ') || 'none'})`);
  const pose = poseName ? poses[poseName] : null, findings = [];
  const start = pose && names.every((n) => num(pose[n])) ? names.map((n) => pose[n]) : null;
  if (poseName && !start) findings.push({ level: 'info', text: `the pose "${poseName}" does not set ${names.filter((n) => !num(pose?.[n])).join(', ')}, so the file starts and ends at the cycle's first frame`, code: 'gait.from', values: {} });
  const r = gaitBlocks(ordered, { axes: m.axes.map((a) => ({ name: a.name, stepsPerUnit: a.stepsPerUnit, maxRate: a.maxRate, unit: a.unit })), cycles, ...(period != null ? { period } : {}), ...(start ? { from: start } : {}) });
  findings.push(...r.findings);
  // the streamer: as many axes as the controller has slots, axis k on its slot k (the shield's X, Y, Z; the Mega's S0 to S7)
  const c = CONTROLLERS[m.controller.set], slots = c.slots;
  if (names.length > slots.length) findings.push({ level: 'warn', text: `${names.length} axes, and the streamer steps ${slots.length} on ${c.title}: the file is written, and send.mjs refuses it${c.board === 'uno' ? ' (an arduino-mega-2560 in the assembly streams up to 8)' : ''}`, code: 'stream.axes', values: { axes: names.length, streamer: slots.length } });
  else for (const [k, a] of m.axes.entries()) {
    if (!a.slot) findings.push({ level: 'info', text: `${a.name}'s motor ${a.motor} has no wire to ${c.any}: the streamer steps it as axis ${k}, on ${slots[k]}`, code: 'stream.wiring', refs: { item: a.motor } });
    else if (a.slot !== slots[k]) findings.push({ level: 'fail', text: `${a.name}'s motor ${a.motor} is wired to ${c.of} ${a.slot}, and the streamer steps axis ${k} on ${slots[k]}`, code: 'stream.wiring', refs: { item: a.motor } });
  }
  const n = r.blocks.length;
  findings.push({ level: 'info', text: `${cycles} cycle${cycles === 1 ? '' : 's'} of the gait (${m.gait.pattern}) in ${n} blocks, ${n3(r.time, 1)} s${start ? `, from the pose "${poseName}" and back to it` : ''}`, code: 'plot.time', values: { time: r.time, cycles, blocks: n } });
  const steps = { ...r, machine: m.name, drawing: 'gait', ...(start ? { pose: poseName } : {}) };
  return { ok: findings.every((x) => x.level !== 'fail'), findings, steps, machine: m, time: { time: r.time } };
}

// A picture of a gait's step file: each axis's position through the run, from its blocks, with the gait's frames as dots
export function gaitPicture(result) {
  const f = result.steps, W = 720, H = 160, pad = 40, colours = ['#135', '#c33', '#383', '#a60'];
  const series = f.axes.map(() => []);
  let t = 0, pos = [...f.start];
  series.forEach((p, k) => p.push([0, pos[k] / f.axes[k].stepsPerUnit]));
  for (const b of f.blocks) { t += b.time; pos = pos.map((x, k) => x + b.steps[k]); series.forEach((p, k) => p.push([t, pos[k] / f.axes[k].stepsPerUnit, b.kind])); }
  const panels = series.map((p, k) => {
    const lo = Math.min(...p.map((x) => x[1])), hi = Math.max(...p.map((x) => x[1])), y = (v) => H - 20 - ((v - lo) / (hi - lo || 1)) * (H - 40), x = (s) => pad + (s / (t || 1)) * (W - 2 * pad);
    const line = p.map(([s, v]) => `${n3(x(s))},${n3(y(v))}`).join(' '), dots = p.filter((q) => q[2] === 'gait').map(([s, v]) => `<circle cx="${n3(x(s))}" cy="${n3(y(v))}" r="1.6" fill="${colours[k % 4]}"/>`).join('');
    return `<g transform="translate(0 ${k * H})"><text x="${pad}" y="14" font-size="12" font-family="sans-serif">${f.axes[k].name}: ${n3(lo, 0)} to ${n3(hi, 0)} ${f.axes[k].unit} (the motor's shaft)</text><polyline points="${line}" fill="none" stroke="${colours[k % 4]}" stroke-width="1"/>${dots}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H * series.length + 24}" viewBox="0 0 ${W} ${H * series.length + 24}"><rect width="100%" height="100%" fill="#fff"/>${panels}<text x="${pad}" y="${H * series.length + 16}" font-size="12" font-family="sans-serif">${n3(t, 1)} s: ${f.cycles} cycles, ${n3(f.cycleTime, 2)} s each against the gait's ${f.period} s; dots are the gait's frames</text></svg>\n`;
}

export function writeGait(s, result) {
  const dir = paths.exports(s.project); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, `${s.name}-gait.steps.json`);
  fs.writeFileSync(file, JSON.stringify(result.steps));
  const prev = paths.preview(s.project, `${s.name}-gait.svg`); fs.mkdirSync(path.dirname(prev), { recursive: true }); fs.writeFileSync(prev, gaitPicture(result));
  return { file, preview: prev };
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
  const steps = stepBlocks(plan, { axes, speed, accel, travelSpeed: speed * 2, ...(m.task.blockTime ? { minBlockTime: m.task.blockTime } : {}) });
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

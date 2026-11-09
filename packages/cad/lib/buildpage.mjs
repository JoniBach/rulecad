// What a machine's model link adds to the model, all read from the same assembly the checks read: the task (the pen, the
// plane, the margins' figures), a step file, the wires' routes, and the build page (shopping list, plates, wiring sheet,
// assembly steps, machine settings).
import fs from 'node:fs';
import path from 'node:path';
import { sheetFrame } from '@rulecad/robots';
import { compactSteps } from '@rulecad/model-link';
import { paths } from './workspace.mjs';
import { host } from './host.mjs';
import { accuracyOf, sample, chainOf } from './task.mjs';
import { machineOf } from './machine.mjs';
import { shoppingList } from './list.mjs';
import { wiresFor, wireRoutesOf } from './assembly.mjs';
import { orderOf, isBuilt } from './order.mjs';
import { platesOf } from './plates.mjs';
import { wiringSheet } from './wires.mjs';
import { readLedger } from './measured.mjs';
import { fmt } from './rules.mjs';

const guard = async (fn) => { try { return await fn(); } catch (e) { return { error: e.message }; } };
const r = (x) => +Number(x).toFixed(6);

// The plane the pen moves on: the sheet, or the middle of a region or a volume
function planeOf(t) {
  if (t.sheet) { const f = sheetFrame(t.sheet); return { at: f.at, u: f.u, v: f.v, n: f.n, width: f.width, height: f.height }; }
  const area = t.region ?? t.volume, xr = area.x ?? [area.lo[0], area.hi[0]], yr = area.y ?? [area.lo[1], area.hi[1]], zr = area.z != null ? (Array.isArray(area.z) ? area.z : [area.z, area.z]) : area.lo ? [area.lo[2] ?? 0, area.hi?.[2] ?? area.lo[2] ?? 0] : [0, 0];
  return { at: [(xr[0] + xr[1]) / 2, (yr[0] + yr[1]) / 2, (zr[0] + zr[1]) / 2], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], width: xr[1] - xr[0], height: yr[1] - yr[0] };
}

/** The task as the page reads it. @param {object} s a built assembly with a task @param {object[]} findings from checkAssembly */
export function taskData(s, findings) {
  const t = s.task, { elbow } = sample(s), plane = planeOf(t);
  const terms = t.accuracy != null ? accuracyOf(s).list.flatMap((j, i) => j.terms.map((x) => [i, x.term, r(x.value), x.kind ?? ''])) : [];
  const loads = (s.motion.loads || []).map((l) => (l.mass != null ? { item: l.item, at: [l.frame[3], l.frame[7], l.frame[11]].map(r), mass: l.mass } : { joint: l.joint, value: l.value }));
  const torque = findings.filter((x) => x.code === 'motor.torque' && x.values?.available != null).map((x) => ({ joint: x.refs.joint, available: r(x.values.available) }));
  const hot = findings.filter((x) => x.code === 'motor.heat' && x.values?.case != null).sort((a, b) => (b.values.case / b.values.softening) - (a.values.case / a.values.softening))[0];
  return { tool: t.tool, item: t.item, point: t.point.map(r), plane: { at: plane.at.map(r), u: plane.u.map(r), v: plane.v.map(r), n: plane.n.map(r), width: r(plane.width), height: r(plane.height) },
    ...(elbow ? { elbow } : {}), ...(t.speed != null ? { speed: t.speed } : {}), ...(t.accuracy != null ? { accuracy: t.accuracy } : {}), ...(t.deflection ? { deflection: t.deflection } : {}),
    ...(terms.length ? { terms } : {}), ...(loads.length ? { loads, gravity: s.motion.gravity } : {}), ...(torque.length ? { torque } : {}), ...(hot ? { heat: { motor: hot.refs?.item ?? '', case: r(hot.values.case), softening: hot.values.softening } } : {}) };
}

/** A step file for the link: the one asked for, or the newest cad plot wrote for this assembly. @returns {object|null} the compact form */
export function stepsData(s, asked) {
  const dir = paths.exports(s.project), base = `${s.name}-`;
  let file = typeof asked === 'string' ? asked : null;
  if (!file && asked !== false && fs.existsSync(dir)) file = fs.readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith('.steps.json')).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
  if (!file) return null;
  if (!host.exists(file)) throw new Error(`no step file "${file}": cad plot writes them to exports/`);
  const steps = compactSteps(JSON.parse(fs.readFileSync(file, 'utf8'))), names = chainOf(s).names;
  if (names.join() !== steps.names.join()) throw new Error(`the step file ${path.basename(file)} is for joints ${steps.names.join(', ')}, and this machine's are ${names.join(', ')}: plot it again`);
  return steps;
}

/** The build page. @param {object} s a built assembly */
export async function buildData(s) {
  const list = await guard(() => shoppingList(s));
  const wires = await guard(() => (s.wires?.length ? wiresFor(s).map(({ route, ...w }) => w) : null));
  const plates = await guard(() => platesOf(s).then(({ bed, gap, plates: p, findings }) => ({ bed, gap, plates: p, findings })));
  const order = isBuilt(s) ? await guard(() => orderOf(s)) : null;
  const machine = s.task ? await guard(() => machineOf(s)) : null;
  return { build: { list, wires, plates, order, machine } };
}

// The ledger, in the rules sheet's own rows: each prediction the bench can measure, the measurement once it's in
export function ledgerRows(s, findings) {
  const entries = readLedger(s.project).filter((e) => e.assembly === s.name), rows = [], done = new Set();
  for (const e of entries) { done.add(e.name); rows.push(['Predicted against measured', e.name, fmt(e.measured), e.unit || '', `predicted ${e.predicted != null ? `${fmt(e.predicted)}${e.was ? ` (${e.was})` : ''}` : 'nothing'}${e.ratio != null ? `, ratio ${fmt(+e.ratio.toFixed(3))}` : ''}${e.figure ? `, ${e.figure}` : ''}`, '', 'measured', e.source ?? '', e.date ?? '']); }
  for (const x of findings) if (x.predict && !done.has(x.predict.name ?? x.code)) rows.push(['Predicted against measured', x.predict.name ?? x.code, fmt(x.predict.value), x.predict.unit ?? '', `${x.predict.figure}: nobody has measured it yet (cad measured ${s.project}/${s.name} ${x.predict.name ?? x.code}=<value>)`, '', 'prediction']);
  return rows.map((row) => row.map(String));
}

/** The wiring sheet in the exports: <assembly>.wiring.md. @returns {string|null} the file */
export function writeWiring(s) {
  if (!s.wires?.length) return null;
  const dir = paths.exports(s.project), file = path.join(dir, `${s.name}.wiring.md`);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, `# ${s.project}/${s.name}: wiring\n\n${wiringSheet(wiresFor(s))}\n`);
  return file;
}

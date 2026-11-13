// A motor at work, in 2D, beside an assembly's preview: its curve with the working point marked, and the torque
// through its train, a bar for each stage, against what the load needs there. The numbers are the check's own.
import { mul, jointValues, placeItems } from '@rulecad/model-link';
import { curve } from '@rulecad/motors/diagram';
import { motorChecks, trainFrom } from './motors.mjs';
import { materialOf } from './list.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fig = (x, d = 3) => String(+Number(x).toPrecision(d));
const FONT = 'font-family="system-ui, sans-serif"';
const wrap = (text, n) => text.split(' ').reduce((lines, word) => { const last = lines[lines.length - 1]; if (last && (last + ' ' + word).length <= n) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word); return lines; }, []);

// What each motor does, from the check: its joint, the train to the load, the torque there, its speed, whether it holds
export function motorWork(s) {
  const found = [], helpers = { placeItems, jointValues, mul };
  motorChecks(s, (level, text, card, extra = {}) => found.push({ level, text, ...extra }), helpers, materialOf(s.project));
  const out = [];
  let mine = null;
  for (const x of found) {
    if (x.code === 'motor.model') { mine = { id: x.refs?.item, findings: [] }; out.push(mine); continue; }
    if (mine) mine.findings.push(x);
  }
  return out.map(({ id, findings }) => {
    const d = (s.motion?.drives || []).find((x) => x.id === id), torque = findings.find((x) => x.code === 'motor.torque' && x.values);
    if (!d || !torque) return null;
    const joint = torque.refs.joint, t = trainFrom(s.motion, joint), speed = findings.find((x) => x.code === 'motor.speed' && x.values);
    return { id, drive: d, joint, train: t, ...torque.values, level: torque.level, rpm: speed?.values.rpm ?? null,
      holds: findings.filter((x) => x.code === 'motor.holds').map((x) => ({ level: x.level, text: x.text })) };
  }).filter(Boolean);
}

// The motor's curve at its output, the load and the working speed marked
export function workCurve(w) {
  const slide = w.train.slide != null;
  return curve(w.drive.model, { ratio: w.train.ratio, efficiency: w.train.efficiency, ...(w.rpm != null ? { at: { speed: w.rpm, ...(slide ? {} : { load: w.needed }) } } : {}) });
}

// The torque through the train: from the motor's shaft, stage by stage, to the joint with the load; the load's need
// carried back through the same stages, so each bar shows the margin where it is
export function trainSvg(w, { title = '' } = {}) {
  const stages = [...w.train.stages].reverse(), slide = w.train.slide != null; // trainFrom walks from the load back to the motor
  const atMotor = w.available / (w.train.ratio * w.train.efficiency), rows = [{ name: `${w.id}'s shaft`, have: atMotor, kind: 'the motor' }];
  let have = atMotor;
  for (const [k, st] of stages.entries()) {
    const last = k === stages.length - 1;
    if (slide && last) rows.push({ name: st.joint, have: w.available, kind: `${st.kind}, ${fig(st.efficiency * 100, 2)}%`, unit: 'N' });
    else { have *= (1 / Math.abs(st.ratio)) * st.efficiency; rows.push({ name: st.joint, have, kind: `${st.kind} ${fig(1 / Math.abs(st.ratio))}:1, ${fig(st.efficiency * 100, 2)}%` }); }
  }
  // the need, carried back from the load through the same stages: the same margin at every one
  for (const r of rows) r.need = w.margin > 0 && Number.isFinite(w.margin) ? r.have / w.margin : null;
  const width = 720, rowH = 46, top = 64, L = 200, R = width - 150;
  const scale = (r) => (R - L) / Math.max(r.have, r.need ?? 0, 1e-9) / 1.08; // each bar on its own scale: the margin is what reads
  const out = [`<rect width="100%" height="100%" fill="#fff"/>`,
    `<text x="24" y="28" font-size="15" ${FONT} fill="#1a1a1a">${esc(title || `${w.id} into ${w.joint}: the torque through the train`)}</text>`,
    `<text x="24" y="48" font-size="11" ${FONT} fill="#888">each stage: what reaches it (blue) against what the load needs there (red), with the margin</text>`];
  rows.forEach((r, i) => {
    const y = top + i * rowH, k = scale(r), u = r.unit || 'N m';
    out.push(`<text x="24" y="${y + 18}" font-size="13" ${FONT} fill="#1a1a1a">${esc(r.name)}</text><text x="24" y="${y + 33}" font-size="11" ${FONT} fill="#888">${esc(r.kind)}</text>`);
    out.push(`<rect x="${L}" y="${y + 8}" width="${fig(r.have * k, 4)}" height="20" fill="#2266cc"/>`);
    if (r.need != null) out.push(`<line x1="${fig(L + r.need * k, 4)}" x2="${fig(L + r.need * k, 4)}" y1="${y + 2}" y2="${y + 34}" stroke="#cc3322" stroke-width="2.4"/>`);
    out.push(`<text x="${R + 10}" y="${y + 18}" font-size="12" ${FONT} fill="#1a1a1a">${fig(r.have)} ${u}</text>`);
    if (r.need) out.push(`<text x="${R + 10}" y="${y + 33}" font-size="11" ${FONT} fill="${r.have / r.need < 1 ? '#cc3322' : '#555'}">${fig(r.have / r.need, 3)}× the ${fig(r.need)}</text>`);
  });
  // whether it holds, power on and off, each line wrapped to the drawing's width
  let y = top + rows.length * rowH + 18;
  for (const h of w.holds) {
    const colour = h.level === 'pass' ? '#2a7a2a' : h.level === 'fail' ? '#cc3322' : '#b06a00', lines = wrap(`${h.level === 'pass' ? '✓' : h.level === 'fail' ? '✗' : '!'} ${h.text}`, 104);
    for (const l of lines) { out.push(`<text x="24" y="${y}" font-size="12" ${FONT} fill="${colour}">${esc(l)}</text>`); y += 17; }
    y += 4;
  }
  const height = y + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${out.join('')}</svg>\n`;
}

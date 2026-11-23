#!/usr/bin/env node
// Sends a step file (rulecad.steps/1, from cad plot) to the arm's Uno, line by line, each after the last was answered.
//   node send.mjs <file.steps.json> --port /dev/tty.usbmodem101 [--machine arm.machine.json] [--no-home]
//   node send.mjs <file.steps.json> --dry-run [--machine arm.machine.json] [--quiet]
//                                                 echoes each line it would send with the answer the streamer would give,
//                                                 checked against the protocol, the streamer's MAX_RATE and the machine's rates
// The protocol is written up in STREAMER.md, beside this file.
// No dependencies: a serial port is a file, set up with stty.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The fastest block the streamer takes, steps/s on its major axis: arm.ino's RATE_LIMIT (a test holds the two equal). */
export const MAX_RATE = 8000;

/** One step file as the protocol's lines, in order. @param {object} file @param {{ pen?: { up: number, down: number }, axes?: number }} [o] */
export function linesOf(file, { pen = { up: 90, down: 30 }, axes = 3 } = {}) {
  if (file?.format !== 'rulecad.steps/1') throw new Error(`not a step file (format is ${JSON.stringify(file?.format)}, wanted rulecad.steps/1)`);
  if (file.axes.length > axes) throw new Error(`${file.axes.length} axes in the file, and the streamer has ${axes}`);
  const lines = [];
  for (const b of file.blocks) {
    if (b.type === 'pen') lines.push(`p ${b.state === 'down' ? pen.down : pen.up} ${Math.round(b.dwell * 1000)}`);
    else if (b.type === 'dwell') lines.push(`w ${Math.round(b.time * 1000)}`);
    else if (b.type === 'move') {
      const s = [0, 1, 2].map((k) => b.steps[k] ?? 0), r = b.rate;
      lines.push(`m ${s.join(' ')} ${Math.round(r.entry)} ${Math.max(1, Math.round(r.peak))} ${Math.round(r.exit)} ${Math.max(1, Math.round(r.accel))} ${b.accelSteps} ${b.decelSteps}`);
    } else throw new Error(`a block of type ${JSON.stringify(b.type)}`);
  }
  return lines;
}

/** The lines to home a machine, from cad machine's description. @param {object} machine */
export function homeLines(machine) {
  return machine.axes.flatMap((a, i) => (a.homing ? [`h ${i} ${a.homing.direction} ${a.homing.rate} ${a.homing.back}`] : []));
}

/** What the streamer would answer to each line, so the protocol can be tested with no board. Throws at the first line it
 * would refuse, naming it. With a machine (cad machine's description), each axis's share of a block's rate is held to that
 * axis's maxRate too. @param {string[]} lines @param {{ machine?: object }} [o]
 * @returns {{ lines: number, m: number, p: number, w: number, h: number, e: number, d: number, peakRate: number, axisPeaks: number[], said: string[] }} */
export function dryRun(lines, { machine } = {}) {
  const seen = { m: 0, p: 0, w: 0, h: 0, e: 0, d: 0 }, axisPeaks = [0, 0, 0], said = [];
  let peak = 0;
  for (const [i, l] of lines.entries()) {
    const [c, ...args] = l.split(' '), n = args.map(Number), at = `line ${i + 1} ("${l}")`;
    if (l.length > 95) throw new Error(`${at}: longer than the streamer's 95 characters`);
    if (!(c in seen)) throw new Error(`${at}: no such command (the streamer takes e, d, h, p, w, m, ? and !)`);
    if (n.some((x) => !Number.isInteger(x))) throw new Error(`${at}: its numbers are whole`);
    if (c === 'h' && (n.length !== 4 || n[0] < 0 || n[0] > 2 || n[2] <= 0)) throw new Error(`${at}: a home is an axis 0, 1 or 2, a direction, a rate over 0 and the steps back`);
    if (c === 'm') {
      if (n.length !== 9) throw new Error(`${at}: a block is 9 numbers`);
      const major = Math.max(...n.slice(0, 3).map(Math.abs));
      if (!major) throw new Error(`${at}: a block that moves nothing`);
      if (n[4] <= 0 || n[6] <= 0) throw new Error(`${at}: a block's peak rate and acceleration are over 0`);
      const fastest = Math.max(n[3], n[4], n[5]);
      if (fastest > MAX_RATE) throw new Error(`${at}: ${fastest} steps/s is past the streamer's MAX_RATE of ${MAX_RATE} (it would answer "error: rate")`);
      for (const k of [0, 1, 2]) {
        const r = (fastest * Math.abs(n[k])) / major, axis = machine?.axes?.[k];
        axisPeaks[k] = Math.max(axisPeaks[k], r);
        if (axis?.maxRate && r > axis.maxRate * (1 + 1e-6) + 0.5) throw new Error(`${at}: axis ${axis.name ?? k} at ${Math.round(r)} steps/s, past the machine's ${axis.maxRate} for it`);
      }
      peak = Math.max(peak, fastest);
    }
    seen[c]++;
    said.push(`${l}  ok`);
  }
  return { lines: lines.length, ...seen, peakRate: peak, axisPeaks, said };
}

async function send(port, lines, say) {
  const r = spawnSync('stty', [process.platform === 'darwin' ? '-f' : '-F', port, '115200', 'raw', '-echo', '-hupcl'], { encoding: 'utf8' });
  if (r.status) throw new Error(`stty ${port}: ${r.stderr}`);
  const rd = fs.createReadStream(port), wr = fs.createWriteStream(port);
  let buffer = '', answer = null;
  rd.on('data', (d) => { buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) { const l = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1); if (answer && /^(ok|error)/.test(l)) { const a = answer; answer = null; a(l); } else if (l) say(l); } });
  await new Promise((res) => setTimeout(res, 2500)); // the Uno resets when the port opens
  for (const [i, l] of lines.entries()) {
    const reply = await new Promise((res) => { answer = res; wr.write(`${l}\n`); });
    if (reply !== 'ok') { wr.write('!\n'); throw new Error(`line ${i + 1} ("${l}"): ${reply}`); }
    if (i % 100 === 0) say(`${i} of ${lines.length}`);
  }
  rd.destroy(); wr.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; }, has = (k) => args.includes(`--${k}`);
  const fileName = args.find((a, i) => !a.startsWith('--') && !['--port', '--machine'].includes(args[i - 1]));
  if (!fileName) { console.error('usage: node send.mjs <file.steps.json> --port <device> [--machine <file>] [--no-home] | --dry-run'); process.exit(2); }
  const file = JSON.parse(fs.readFileSync(fileName, 'utf8')), machine = opt('machine') ? JSON.parse(fs.readFileSync(opt('machine'), 'utf8')) : null;
  const lines = ['e', ...(machine && !has('no-home') ? homeLines(machine) : []), ...linesOf(file, machine?.pen ? { pen: machine.pen } : {}), 'd'];
  if (has('dry-run')) {
    let r;
    try { r = dryRun(lines, { machine }); } catch (e) { console.error(`dry run: ${e.message}`); process.exit(1); }
    if (!has('quiet')) for (const s of r.said) console.log(s);
    console.log(`dry run: ${r.lines} lines, ${r.m} blocks, ${r.p} pen moves, ${r.h} homes, peak ${r.peakRate} steps/s (the streamer takes ${MAX_RATE})${machine ? `, axes at most ${r.axisPeaks.slice(0, machine.axes.length).map((x, k) => `${Math.round(x)} of ${machine.axes[k].maxRate}`).join(', ')} steps/s` : ''}`);
    process.exit(0);
  }
  if (!opt('port')) { console.error('--port <device>, or --dry-run'); process.exit(2); }
  send(opt('port'), lines, console.log).then(() => console.log('done')).catch((e) => { console.error(e.message); process.exit(1); });
}

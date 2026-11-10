#!/usr/bin/env node
// Sends a step file (rulecad.steps/1, from cad plot) to the arm's Uno, line by line, each after the last was answered.
//   node send.mjs <file.steps.json> --port /dev/tty.usbmodem101 [--machine arm.machine.json] [--no-home]
//   node send.mjs <file.steps.json> --dry-run     says what it would send, and checks it against the protocol
// No dependencies: a serial port is a file, set up with stty.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// What the firmware would say to a line, so the protocol can be tested with no board
export function dryRun(lines) {
  const seen = { m: 0, p: 0, w: 0, h: 0, e: 0, d: 0 };
  let peak = 0;
  for (const [i, l] of lines.entries()) {
    const [c, ...args] = l.split(' '), n = args.map(Number), at = `line ${i + 1} ("${l}")`;
    if (l.length > 95) throw new Error(`${at}: longer than the streamer's 95 characters`);
    if (!(c in seen)) throw new Error(`${at}: no such command`);
    if (n.some((x) => !Number.isInteger(x))) throw new Error(`${at}: its numbers are whole`);
    if (c === 'm') { if (n.length !== 9) throw new Error(`${at}: a block is 9 numbers`); if (!n.slice(0, 3).some(Boolean)) throw new Error(`${at}: a block that moves nothing`); if (n[4] > 8000) throw new Error(`${at}: ${n[4]} steps/s is past the streamer's 8000`); peak = Math.max(peak, n[4]); }
    seen[c]++;
  }
  return { lines: lines.length, ...seen, peakRate: peak };
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
  if (has('dry-run')) { const r = dryRun(lines); console.log(`dry run: ${r.lines} lines, ${r.m} blocks, ${r.p} pen moves, ${r.h} homes, peak ${r.peakRate} steps/s`); process.exit(0); }
  if (!opt('port')) { console.error('--port <device>, or --dry-run'); process.exit(2); }
  send(opt('port'), lines, console.log).then(() => console.log('done')).catch((e) => { console.error(e.message); process.exit(1); });
}

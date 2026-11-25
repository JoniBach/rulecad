#!/usr/bin/env node
// Sends a step file (rulecad.steps/1, from cad plot: an arm's drawing or a leg's gait) to the streamer, line by line, each
// after the last was answered. The streamer runs on an Uno under a CNC Shield V3 (three axes) or a Mega 2560 (eight): the
// machine description's controller says which.
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

/** The boards the streamer is built for: its axes (a block line has a signed step count for each) and the longest line it
 * reads (its LINE_MAX), as arm.ino has them. */
export const STREAMERS = { uno: { board: 'Uno under a CNC Shield V3', axes: 3, lineMax: 95 }, mega: { board: 'Mega 2560', axes: 8, lineMax: 127 } };
/** The streamer a machine's files go to: its controller's board (cad machine writes it), the Uno where it names none.
 * @param {object} [machine] @returns {{ name: string, board: string, axes: number, lineMax: number }} */
export function streamerOf(machine) {
  const name = machine?.controller?.board ?? 'uno';
  if (!STREAMERS[name]) throw new Error(`the machine's controller.board is "${name}", and the streamer runs on ${Object.keys(STREAMERS).join(' or ')}`);
  return { name, ...STREAMERS[name] };
}

/** The serial line's time for one byte, s: 115200 baud, 10 bits a byte (a start bit, 8 data bits, a stop bit). */
export const BYTE_TIME = 10 / 115200;
/** The bytes of the streamer's answer to a block: "ok", then CR and LF (Serial.println). */
export const ANSWER_BYTES = 4;
/** The time a line and its answer wait in the USB link, past their own bytes on the wire, s: an estimate. The Uno's
 * USB chip (an ATmega16U2 running Arduino-usbserial) passes the streamer's answer on to the computer when its timer 0
 * overflows, every 256 x 256 / 16 MHz = 4.1 ms (Arduino-usbserial.c in ArduinoCore-avr, "TCCR0B = (1 << CS02)" and the
 * TOV0 flush, read 2026-11-23), and the computer sends the next line in a USB frame, every 1 ms at full speed. A board
 * with another USB chip (a CH340 on many copies) differs: the bench test times it. */
export const TURNAROUND = 0.0051;

/** The least time a block must last for the streamer to keep up, s: its line's bytes and newline, then the answer, on the
 * wire, and the turnaround. The sender sends a line only after the last was answered, so a run of shorter blocks empties
 * the queue and the motors stop between blocks. On a simulated Uno the streamer answers a line as soon as its last byte
 * is in (it parses each character as it arrives), so the line and its answer are the whole of its cost there.
 * @param {string} line @param {{ turnaround?: number }} [o] turnaround 0 for a board with no USB link (the simulation) */
export function leastBlockTime(line, { turnaround = TURNAROUND } = {}) {
  return (line.length + 1 + ANSWER_BYTES) * BYTE_TIME + turnaround;
}

/** One step file as the protocol's lines, in order. @param {object} file
 * @param {{ pen?: { up: number, down: number }, axes?: number }} [o] axes: the streamer's (3 on the Uno, 8 on the Mega), a
 * number for each in a block's line */
export function linesOf(file, { pen = { up: 90, down: 30 }, axes = 3 } = {}) {
  if (file?.format !== 'rulecad.steps/1') throw new Error(`not a step file (format is ${JSON.stringify(file?.format)}, wanted rulecad.steps/1)`);
  if (file.axes.length > axes) throw new Error(`${file.axes.length} axes in the file, and the streamer has ${axes}${axes < STREAMERS.mega.axes ? ` (on an Uno; give --machine with a Mega 2560 as its controller for up to ${STREAMERS.mega.axes})` : ''}`);
  const lines = [];
  for (const b of file.blocks) {
    if (b.type === 'pen') lines.push(`p ${b.state === 'down' ? pen.down : pen.up} ${Math.round(b.dwell * 1000)}`);
    else if (b.type === 'dwell') lines.push(`w ${Math.round(b.time * 1000)}`);
    else if (b.type === 'move') {
      const s = Array.from({ length: axes }, (_, k) => b.steps[k] ?? 0), r = b.rate;
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
 * would refuse, naming it, and at a block too short for the streamer to keep up with (leastBlockTime). With a machine
 * (cad machine's description), each axis's share of a block's rate is held to that axis's maxRate too, and the streamer is
 * its controller's (streamerOf: the Uno's three axes where it names none). A dry run has no clock, so it takes each block as
 * finished before the next line: `?` answers the positions summed from the blocks so far (a home sets its axis to 0) with
 * 0 blocks queued, and `!` answers `ok`.
 * @param {string[]} lines @param {{ machine?: object, turnaround?: number }} [o] turnaround as leastBlockTime takes it
 * @returns {{ lines: number, m: number, p: number, w: number, h: number, e: number, d: number, '?': number, '!': number, peakRate: number, axisPeaks: number[], position: number[], said: string[] }} */
export function dryRun(lines, { machine, turnaround = TURNAROUND } = {}) {
  const st = streamerOf(machine), n = st.axes, all = Array.from({ length: n }, (_, k) => k);
  const seen = { m: 0, p: 0, w: 0, h: 0, e: 0, d: 0, '?': 0, '!': 0 }, axisPeaks = all.map(() => 0), position = all.map(() => 0), said = [];
  let peak = 0;
  for (const [i, l] of lines.entries()) {
    const [c, ...args] = l.split(' '), x = args.map(Number), at = `line ${i + 1} ("${l}")`;
    if (l.length > st.lineMax) throw new Error(`${at}: longer than the streamer's ${st.lineMax} characters`);
    if (!(c in seen)) throw new Error(`${at}: no such command (the streamer takes e, d, h, p, w, m, ? and !)`);
    if (x.some((v) => !Number.isInteger(v))) throw new Error(`${at}: its numbers are whole`);
    if (c === 'h' && (x.length !== 4 || x[0] < 0 || x[0] >= n || x[2] <= 0)) throw new Error(`${at}: a home is an axis ${n === 3 ? '0, 1 or 2' : `0 to ${n - 1}`}, a direction, a rate over 0 and the steps back`);
    if (c === 'm') {
      if (x.length !== n + 6) throw new Error(`${at}: a block is ${n + 6} numbers (a step count for each of the streamer's ${n} axes, then six rates and counts)`);
      const major = Math.max(...x.slice(0, n).map(Math.abs)), [entry, top, exit, accel] = x.slice(n, n + 4);
      if (!major) throw new Error(`${at}: a block that moves nothing`);
      if (top <= 0 || accel <= 0) throw new Error(`${at}: a block's peak rate and acceleration are over 0`);
      const fastest = Math.max(entry, top, exit);
      if (fastest > MAX_RATE) throw new Error(`${at}: ${fastest} steps/s is past the streamer's MAX_RATE of ${MAX_RATE} (it would answer "error: rate")`);
      for (const k of all) {
        const r = (fastest * Math.abs(x[k])) / major, axis = machine?.axes?.[k];
        axisPeaks[k] = Math.max(axisPeaks[k], r);
        if (axis?.maxRate && r > axis.maxRate * (1 + 1e-6) + 0.5) throw new Error(`${at}: axis ${axis.name ?? k} at ${Math.round(r)} steps/s, past the machine's ${axis.maxRate} for it`);
      }
      // the block is over in major / fastest seconds at the soonest
      const least = leastBlockTime(l, { turnaround });
      if (major / fastest < least) throw new Error(`${at}: ${major} steps at up to ${fastest} steps/s can be over in ${(major / fastest * 1000).toFixed(2)} ms, and the streamer needs ${(least * 1000).toFixed(2)} ms for each block's line and answer: it would fall behind and stop between blocks (plan with a least block time, task.blockTime for cad plot, or a lower speed)`);
      peak = Math.max(peak, fastest);
      for (const k of all) position[k] += x[k];
    }
    if (c === 'h') position[x[0]] = 0;
    seen[c]++;
    said.push(`${l}  ${c === '?' ? `q ${position.join(' ')} 0` : 'ok'}`);
  }
  return { lines: lines.length, ...seen, peakRate: peak, axisPeaks, position, said };
}

/** What a gait's step file is, for the summary: its cycles, time and start pose (nothing for a drawing). @param {object} file */
export const gait = (file) => (file?.kind === 'gait' ? `, ${file.cycles} cycle${file.cycles === 1 ? '' : 's'} of a gait, ${Number(file.time).toFixed(1)} s${file.pose ? ` from the pose "${file.pose}" and back` : ''}` : '');

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
  // the whole file is checked before anything moves: a block refused halfway through a drawing would spoil it
  let r;
  try { r = dryRun(lines, { machine }); } catch (e) { console.error(`${has('dry-run') ? 'dry run' : 'not sent'}: ${e.message}`); process.exit(1); }
  if (has('dry-run')) {
    if (!has('quiet')) for (const s of r.said) console.log(s);
    console.log(`dry run: ${r.lines} lines, ${r.m} blocks, ${r.p} pen moves, ${r.h} homes, peak ${r.peakRate} steps/s (the streamer takes ${MAX_RATE})${machine ? `, axes at most ${r.axisPeaks.slice(0, machine.axes.length).map((x, k) => `${Math.round(x)} of ${machine.axes[k].maxRate}`).join(', ')} steps/s` : ''}${gait(file)}`);
    process.exit(0);
  }
  if (!opt('port')) { console.error('--port <device>, or --dry-run'); process.exit(2); }
  // a gait has no home: the streamer counts from where the motors stand when it starts, so the leg must be in its pose
  if (file.kind === 'gait') console.log(`a gait${gait(file)}: the streamer counts from where the motors stand now, so the leg must be in ${file.pose ? `its pose "${file.pose}"` : "the cycle's first frame"}`);
  send(opt('port'), lines, console.log).then(() => console.log('done')).catch((e) => { console.error(e.message); process.exit(1); });
}

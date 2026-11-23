#!/usr/bin/env node
// The kit's Arduino sketches, compiled for an Uno, and the arm's streamer run on a simulated one.
//   node scripts/firmware.mjs                      compile every sketch for arduino:avr:uno with arduino-cli; a compile error fails
//   node scripts/firmware.mjs --list               the sketches it finds, compiling nothing
//   node scripts/firmware.mjs --simulate <file.steps.json> --machine <file.machine.json>
//                                                  also run the arm's streamer on a simulated Uno (avr8js): home it, stream the
//                                                  step file through send.mjs's lines, and measure its steps against the file
//                                                  and its fastest step rate against the rates the machine asks for
// arduino-cli needs the arduino:avr core and the Servo library installed. The simulation needs avr8js (npm install --prefix
// .cache/avr8js avr8js@0.21.1, and AVR8JS=.cache/avr8js/node_modules/avr8js); it is not a dependency of the kit.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FQBN = 'arduino:avr:uno';
/** The Uno's clock, Hz: its 16 MHz crystal (Arduino Uno Rev3 datasheet, "Clock Speed 16 MHz"). */
export const CLOCK = 16e6;
/** The shortest STEP pulse the drivers on the arm take, µs: "With the DRV8825, the high and low STEP pulses must each be at
 * least 1.9 us; they can be as short as 1 us when using the A4988" (Pololu's DRV8825 carrier page, pololu.com/product/2133,
 * read 2026-11-23; TI's datasheet SLVSA73F section 7.6 is its source). */
export const STEP_HIGH_US = 1.9;
// The CNC Shield V3's pins on the Uno, as arm.ino has them: step X, Y, Z on D2, D3, D4 (port D bits 2 to 4), direction on D5,
// D6, D7 (bits 5 to 7), the X, Y, Z limit switches on D9, D10, D12 (port B bits 1, 2, 4).
const STEP_BITS = [2, 3, 4], DIR_BITS = [5, 6, 7], LIMIT_BITS = [1, 2, 4];

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every Arduino sketch in the kit: a folder holding a .ino of its own name, outside node_modules and caches.
 * @param {string} [root] @returns {{ name: string, dir: string, file: string }[]} paths relative to root, with forward slashes */
export function sketches(root = ROOT) {
  const found = [], skip = new Set(['node_modules', '.cache', '.git', 'exports', '.preview', 'scratch']);
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (!e.isDirectory() || skip.has(e.name)) continue;
      const dir = rel ? `${rel}/${e.name}` : e.name;
      if (fs.existsSync(path.join(root, dir, `${e.name}.ino`))) found.push({ name: e.name, dir, file: `${dir}/${e.name}.ino` });
      walk(dir);
    }
  };
  for (const top of ['examples', 'packages']) if (fs.existsSync(path.join(root, top))) walk(top);
  return found.sort((a, b) => a.dir.localeCompare(b.dir));
}

/** The flash and RAM a sketch takes, read from arduino-cli compile's report (null where a line is missing).
 * @param {string} text @returns {{ flash: number | null, flashMax: number | null, ram: number | null, ramMax: number | null }} bytes */
export function sizes(text) {
  const f = /Sketch uses (\d+) bytes .*?Maximum is (\d+) bytes/.exec(text), r = /Global variables use (\d+) bytes .*?Maximum is (\d+) bytes/.exec(text);
  return { flash: f ? +f[1] : null, flashMax: f ? +f[2] : null, ram: r ? +r[1] : null, ramMax: r ? +r[2] : null };
}

/** An Intel HEX file (as arduino-cli writes for an Uno) as the flash's bytes. Refuses a bad checksum, a record type it
 * does not know and data past the flash, by line. @param {string} text @param {number} [size] the flash, bytes */
export function hexBytes(text, size = 0x8000) {
  const flash = new Uint8Array(size);
  let ended = false;
  for (const [i, raw] of text.replace(/\r\n/g, '\n').split('\n').entries()) {
    const line = raw.trim(), at = `line ${i + 1} of the hex file`;
    if (!line || ended) continue;
    if (!/^:([0-9A-Fa-f]{2})+$/.test(line)) throw new Error(`${at}: not an Intel HEX record (":" then pairs of hex digits)`);
    const b = Buffer.from(line.slice(1), 'hex'), n = b[0], addr = (b[1] << 8) | b[2], type = b[3];
    if (b.length !== n + 5) throw new Error(`${at}: says ${n} data bytes and holds ${b.length - 5}`);
    if (b.reduce((s, x) => s + x, 0) & 0xff) throw new Error(`${at}: its checksum is wrong`);
    if (type === 1) { ended = true; continue; }
    if (type !== 0) throw new Error(`${at}: record type ${type}; an Uno's hex has only data (0) and end (1)`);
    if (addr + n > size) throw new Error(`${at}: data at ${addr + n} bytes, past the ${size} byte flash`);
    flash.set(b.subarray(4, 4 + n), addr);
  }
  if (!ended) throw new Error('the hex file has no end record (type 1): it was cut short');
  return flash;
}

/** One sketch compiled for the Uno. @param {string} dir the sketch's folder @param {string} out where the hex goes
 * @param {string[]} [defines] such as "RATE_LIMIT=1000000", passed to the compiler as -D */
export function compile(dir, out, defines = []) {
  fs.mkdirSync(out, { recursive: true });
  const extra = defines.length ? ['--build-property', `compiler.cpp.extra_flags=${defines.map((d) => `-D${d}`).join(' ')}`] : [];
  const r = spawnSync('arduino-cli', ['compile', '--fqbn', FQBN, '--warnings', 'default', ...extra, '--output-dir', out, dir], { encoding: 'utf8' });
  if (r.error) throw new Error(`arduino-cli: ${r.error.message} (install it, then arduino-cli core install arduino:avr and arduino-cli lib install Servo)`);
  const output = `${r.stdout}${r.stderr}`;
  return { ok: r.status === 0, output, hex: path.join(out, `${path.basename(dir)}.ino.hex`), ...sizes(output) };
}

/** An Uno running a compiled sketch on avr8js, with the CNC shield's step, direction and limit pins watched and driven.
 * @param {Uint8Array} flash @param {object} avr the avr8js module @param {{ limits?: { dir: number, at: number }[] }} [o]
 * where each axis's limit switch closes: past at steps in the direction dir */
export function uno(flash, avr, { limits = [] } = {}) {
  const cpu = new avr.CPU(new Uint16Array(flash.buffer, flash.byteOffset, flash.length / 2));
  for (const t of [avr.timer0Config, avr.timer1Config, avr.timer2Config]) new avr.AVRTimer(cpu, t);
  const usart = new avr.AVRUSART(cpu, avr.usart0Config, CLOCK), portB = new avr.AVRIOPort(cpu, avr.portBConfig), portD = new avr.AVRIOPort(cpu, avr.portDConfig);
  new avr.AVRIOPort(cpu, avr.portCConfig);
  const s = { cpu, position: [0, 0, 0], edges: [[], [], []], highMin: Infinity, lines: [], text: '', rx: [] };
  const highSince = [0, 0, 0];
  const switches = () => { for (const [k, l] of limits.entries()) if (l) portB.setPin(LIMIT_BITS[k], !(s.position[k] * l.dir >= l.at)); };
  for (const b of LIMIT_BITS) portB.setPin(b, true); // open: the pull-up reads high
  portD.addListener((v, old) => {
    for (const [k, bit] of STEP_BITS.entries()) {
      const m = 1 << bit;
      if (v & m && !(old & m)) { highSince[k] = cpu.cycles; s.position[k] += v & (1 << DIR_BITS[k]) ? 1 : -1; s.edges[k].push(cpu.cycles); switches(); }
      if (!(v & m) && old & m) s.highMin = Math.min(s.highMin, cpu.cycles - highSince[k]);
    }
  });
  usart.onByteTransmit = (c) => { if (c === 10) { s.lines.push(s.text.replace(/\r$/, '')); s.text = ''; } else s.text += String.fromCharCode(c); };
  const feed = () => { if (s.rx.length && !usart.rxBusy) usart.writeByte(s.rx.shift()); };
  usart.onRxComplete = feed;
  /** Run until test() holds or cycles pass; true if it held. */
  s.run = (test, cycles) => {
    const end = cpu.cycles + cycles;
    while (cpu.cycles < end) {
      for (let i = 0; i < 1000; i++) { avr.avrInstruction(cpu); cpu.tick(); }
      if (test()) return true;
    }
    return false;
  };
  /** Send a line and wait for its answer ("ok", "error: ..." or a "q" report): the sender's flow control. */
  s.ask = (line, seconds = 120) => {
    const from = s.lines.length;
    for (const c of `${line}\n`) s.rx.push(c.charCodeAt(0));
    feed();
    const answer = () => s.lines.slice(from).find((l) => /^(ok|error|q )/.test(l));
    if (!s.run(() => answer() !== undefined, seconds * CLOCK)) return `no answer in ${seconds} s`;
    return answer();
  };
  return s;
}

/** The ways a block's steps run through arm.ino's tick(): at its cruise (no change of speed, no division), speeding up
 * and slowing down (a float multiply and a division, gap = 1000000 / rate, on every step). */
export const PHASES = ['cruise', 'up', 'down'];

/** The block that holds the streamer's loop in one phase for all its steps, on the given axes: entry, peak and exit far
 * past any rate the loop can do, and for 'up' or 'down' an acceleration so large that every step changes the rate
 * (it is clamped back to the peak, or to the exit, and the gap divided out again).
 * @param {number} axes 1 to 3 @param {'cruise' | 'up' | 'down'} phase @param {number} [n] steps on each axis */
export function ceilingLine(axes, phase, n = 4000) {
  if (![1, 2, 3].includes(axes)) throw new Error(`axes ${axes}: a block steps 1, 2 or 3 axes`);
  if (!PHASES.includes(phase)) throw new Error(`phase "${phase}": one of ${PHASES.join(', ')}`);
  const steps = [0, 1, 2].map((k) => (k < axes ? n : 0));
  return `m ${steps.join(' ')} 50000 50000 50000 ${phase === 'cruise' ? 1000000 : 100000000} ${phase === 'up' ? n : 0} ${phase === 'down' ? n : 0}`;
}

/** The fastest a streamer's loop steps, on a simulated Uno: one long block on the given axes at a rate far past any it can
 * do, in one phase (ceilingLine). Needs a build whose MAX_RATE takes the block (-DRATE_LIMIT=1000000).
 * @param {'cruise' | 'up' | 'down'} [phase]
 * @returns {number} steps/s, the mean over the major axis's middle steps (0 if the block is refused) */
export function ceiling(flash, avr, axes, phase = 'cruise') {
  const u = uno(flash, avr), n = 4000;
  if (!u.run(() => u.lines.includes('arm ready'), 2 * CLOCK)) throw new Error('the streamer never said "arm ready"');
  u.ask('e');
  const reply = u.ask(ceilingLine(axes, phase, n));
  if (reply !== 'ok') return 0;
  u.run(() => u.edges[0].length >= n, 10 * CLOCK);
  // the mean over the middle steps: a step that works out the speed takes longer than one that does not, and above 5000
  // steps/s they alternate, so a median gap would read the quick ones
  const e = u.edges[0], from = 100, to = n - 101;
  return (CLOCK * (to - from)) / (e[to] - e[from]);
}

/** The loop's ceilings held to MAX_RATE: every phase on every axis count must keep up with the fastest block the streamer
 * takes, so the slowest of them is the loop's real ceiling.
 * @param {{ cruise: number[], up: number[], down: number[] }} ceilings steps/s for 1, 2 and 3 axes in each phase
 * @param {number} max MAX_RATE, steps/s
 * @returns {{ slowest: { phase: string, axes: number, rate: number }, margin: number, problems: string[] }} */
export function ceilingCheck(ceilings, max) {
  let slowest = null;
  const problems = [];
  for (const phase of PHASES) {
    const row = ceilings[phase];
    if (!Array.isArray(row) || row.length !== 3) throw new Error(`ceilings.${phase}: three rates (1, 2 and 3 axes), got ${JSON.stringify(row)}`);
    for (const [i, rate] of row.entries()) {
      if (!slowest || rate < slowest.rate) slowest = { phase, axes: i + 1, rate };
      if (rate < max) problems.push(`the loop steps ${i + 1} axes at ${Math.round(rate)} steps/s at most while ${phase === 'cruise' ? 'at its cruise' : phase === 'up' ? 'speeding up' : 'slowing down'}, under MAX_RATE (${max})`);
    }
  }
  return { slowest, margin: slowest.rate / max, problems };
}

/** The shortest block the sender passes, streamed: on the given axes at rate steps/s, in a phase (cruise, or 'down' with
 * every step changing speed and clamped back to rate, the loop's slowest path), with the fewest steps n that last at least
 * least(line) seconds, the sender's leastBlockTime for that line.
 * @param {number} axes 1 to 3 @param {'cruise' | 'down'} phase @param {number} rate steps/s @param {(line: string) => number} least
 * @returns {{ n: number, line: string, seconds: number }} */
export function shortBlock(axes, phase, rate, least) {
  if (![1, 2, 3].includes(axes)) throw new Error(`axes ${axes}: a block steps 1, 2 or 3 axes`);
  if (phase !== 'cruise' && phase !== 'down') throw new Error(`phase "${phase}": cruise or down`);
  if (!(rate > 0)) throw new Error(`rate ${rate}: steps/s, above 0`);
  for (let n = 1; ; n++) {
    const steps = [0, 1, 2].map((k) => (k < axes ? n : 0));
    const line = `m ${steps.join(' ')} ${rate} ${rate} ${rate} ${phase === 'cruise' ? 100000 : 100000000} 0 ${phase === 'down' ? n : 0}`;
    if (n / rate >= least(line)) return { n, line, seconds: n / rate };
  }
}

/** A stream of the same block, each line sent when the last was answered, as send.mjs sends: the time from the first step
 * to the last against the plan, (blocks x n - 1) / rate. A streamer that falls behind takes longer.
 * @returns {{ blocks: number, steps: number, seconds: number, planned: number, rate: number, shortestUs: number, longestUs: number }} */
export function stream(flash, avr, { n, line }, rate, blocks) {
  const u = uno(flash, avr);
  if (!u.run(() => u.lines.includes('arm ready'), 2 * CLOCK)) throw new Error('the streamer never said "arm ready"');
  u.ask('e');
  for (let i = 0; i < blocks; i++) { const r = u.ask(line); if (r !== 'ok') throw new Error(`"${line}" answered "${r}"`); }
  u.run(() => u.edges[0].length >= blocks * n, (blocks * n / rate + 2) * CLOCK);
  const e = u.edges[0], seconds = (e.at(-1) - e[0]) / CLOCK;
  let lo = Infinity, hi = 0;
  for (let i = 1; i < e.length; i++) { lo = Math.min(lo, e[i] - e[i - 1]); hi = Math.max(hi, e[i] - e[i - 1]); }
  return { blocks, steps: e.length, seconds, planned: (blocks * n - 1) / rate, rate: (e.length - 1) / seconds, shortestUs: (lo / CLOCK) * 1e6, longestUs: (hi / CLOCK) * 1e6 };
}

/** The arm's streamer on a simulated Uno, fed a step file the way send.mjs feeds a board.
 * @param {{ hex: string, fastHex: string, steps: string, machine: string, sender?: string, maxRate: number }} o the build, the same
 * built with its rate limit raised (for its loop's own ceiling), the step file, cad machine's description, send.mjs, MAX_RATE
 * @returns {object} what it measured */
export async function simulate({ hex, fastHex, steps: stepsFile, machine: machineFile, sender = path.join(ROOT, 'examples/bench/projects/arm/send.mjs'), maxRate }) {
  const avr = loadAvr(), flash = hexBytes(fs.readFileSync(hex, 'utf8')), fast = hexBytes(fs.readFileSync(fastHex, 'utf8'));
  const file = JSON.parse(fs.readFileSync(stepsFile, 'utf8')), machine = JSON.parse(fs.readFileSync(machineFile, 'utf8'));
  const send = await import(pathToFileURL(sender).href);
  // the shortest blocks the sender passes, at MAX_RATE on three axes, at the cruise and changing speed on every step;
  // the simulation has no USB link, so no turnaround: the line and its answer on the wire are the whole wait
  const least = (l) => send.leastBlockTime(l, { turnaround: 0 });
  const short = Object.fromEntries(['cruise', 'down'].map((p) => { const b = shortBlock(3, p, maxRate, least); return [p, { block: b, ...stream(flash, avr, b, maxRate, Math.ceil(2000 / b.n)) }]; }));
  const homes = send.homeLines(machine), body = send.linesOf(file, machine.pen ? { pen: machine.pen } : {});
  // every homed axis's switch 300 steps from where it starts, in its homing direction
  const limits = machine.axes.map((a) => (a.homing ? { dir: a.homing.direction, at: 300 } : null));
  const u = uno(flash, avr, { limits });
  if (!u.run(() => u.lines.includes('arm ready'), 2 * CLOCK)) throw new Error('the streamer never said "arm ready"');
  const problems = [], answer = (l) => { const a = u.ask(l); if (a !== 'ok') problems.push(`"${l}": ${a}`); };
  answer('e');
  const homed = [];
  for (const [i, l] of homes.entries()) {
    const k = +l.split(' ')[1], before = u.edges[k].length;
    answer(l);
    homed.push({ axis: k, steps: u.edges[k].length - before, closedAt: u.edges[k].length - before - machine.axes[k].homing.back });
    u.position[k] = 0; // the streamer counts from its switch; so does this
  }
  for (const k of [0, 1, 2]) u.edges[k] = [];
  const t0 = u.cpu.cycles;
  for (const l of body) answer(l);
  // the last blocks are still running when their lines are answered: wait for the queue to empty and the steps to stop
  let report = '';
  for (let i = 0; i < 600; i++) {
    const n = u.edges.reduce((s, e) => s + e.length, 0);
    u.run(() => false, CLOCK / 10);
    report = u.ask('?');
    if (/ 0$/.test(report) && u.edges.reduce((s, e) => s + e.length, 0) === n) break;
  }
  const seconds = (Math.max(t0, ...u.edges.map((e) => e.at(-1) ?? t0)) - t0) / CLOCK; // to the last step
  // a block past the streamer's limit is refused by name, and one at it is taken
  const position = [...u.position];
  const over = u.ask(`m 100 0 0 0 ${maxRate + 1} 0 1000 0 0`), at = u.ask(`m 100 0 0 ${maxRate} ${maxRate} ${maxRate} 1000 0 0`);
  u.run(() => false, CLOCK / 10);
  answer('d');
  const want = [0, 1, 2].map((k) => file.blocks.reduce((s, b) => s + (b.type === 'move' ? b.steps[k] ?? 0 : 0), 0));
  const total = [0, 1, 2].map((k) => file.blocks.reduce((s, b) => s + (b.type === 'move' ? Math.abs(b.steps[k] ?? 0) : 0), 0));
  const counted = u.edges.map((e, k) => (k ? e.length : e.length - 100)); // less the 100 of the block at the limit
  // the shortest gap between two steps, as a rate: past the block's own rate where a late step is caught up
  const shortest = u.edges.map((e) => { let g = Infinity; for (let i = 1; i < e.length - 100; i++) g = Math.min(g, e[i] - e[i - 1]); return e.length > 101 ? CLOCK / g : 0; });
  return { lines: homes.length + body.length + 2, problems, homed, want, total, counted, position, report, over, at,
    seconds, planned: typeof file.time === 'number' ? file.time : null, peakAsked: Math.max(0, ...file.blocks.filter((b) => b.type === 'move').map((b) => b.rate.peak)), shortest,
    highUs: (u.highMin / CLOCK) * 1e6, short, ceilings: Object.fromEntries(PHASES.map((p) => [p, [1, 2, 3].map((a) => ceiling(fast, avr, a, p))])), maxRates: machine.axes.map((a) => a.maxRate) };
}

function loadAvr() {
  const where = process.env.AVR8JS ? path.resolve(process.env.AVR8JS) : 'avr8js';
  try { return createRequire(import.meta.url)(where); } catch {
    throw new Error(`avr8js is not installed: npm install --prefix .cache/avr8js avr8js@0.21.1, then AVR8JS=.cache/avr8js/node_modules/avr8js (looked for ${where})`);
  }
}

/** The streamer's own ceiling on a block's rate, steps/s: MAX_RATE in arm.ino, from its default RATE_LIMIT.
 * @param {string} source the sketch */
export function sketchMaxRate(source) {
  const m = /#define\s+RATE_LIMIT\s+(\d+)/.exec(source);
  if (!m) throw new Error('arm.ino has no "#define RATE_LIMIT <steps/s>", the default of its MAX_RATE');
  return +m[1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; };
  const list = sketches();
  if (args.includes('--list')) { for (const s of list) console.log(s.file); process.exit(0); }
  let failed = 0;
  const built = {};
  for (const s of list) {
    const r = compile(path.join(ROOT, s.dir), path.join(ROOT, '.cache/firmware', s.dir.replace(/\//g, '-')));
    built[s.dir] = r;
    if (!r.ok) { failed++; console.log(`FAIL ${s.file}: it does not compile for ${FQBN}\n${r.output}`); continue; }
    console.log(`ok   ${s.file}: ${r.flash} of ${r.flashMax} bytes of flash, ${r.ram} of ${r.ramMax} bytes of RAM`);
  }
  const stepsFile = opt('simulate');
  if (stepsFile && !failed) {
    const arm = list.find((s) => s.dir === 'examples/bench/projects/arm/firmware/arm');
    if (!arm) throw new Error('no arm streamer at examples/bench/projects/arm/firmware/arm');
    if (!opt('machine')) throw new Error('--simulate needs --machine <file.machine.json> (cad machine arm/arm writes it)');
    const fast = compile(path.join(ROOT, arm.dir), path.join(ROOT, '.cache/firmware/arm-unlimited'), ['RATE_LIMIT=1000000']);
    if (!fast.ok) throw new Error(`arm.ino with RATE_LIMIT raised does not compile:\n${fast.output}`);
    const max = sketchMaxRate(fs.readFileSync(path.join(ROOT, arm.file), 'utf8'));
    const r = await simulate({ hex: built[arm.dir].hex, fastHex: fast.hex, steps: stepsFile, machine: opt('machine'), maxRate: max });
    const fail = (t) => { failed++; console.log(`FAIL ${t}`); }, round = (a) => a.map((x) => Math.round(x)).join(', ');
    console.log(`simulated Uno: ${r.lines} lines sent, ${r.homed.length} axes homed, ${r.seconds.toFixed(2)} s from the first step to the last (planned ${r.planned?.toFixed(2)} s)`);
    console.log(`  steps counted ${r.counted.join(', ')}, in the file ${r.total.join(', ')}; net ${r.position.join(', ')}, in the file ${r.want.join(', ')}; the streamer's own report "${r.report}"`);
    console.log(`  the file asks up to ${Math.round(r.peakAsked)} steps/s; the shortest gap between steps ${round(r.shortest)} steps/s (a late step caught up); STEP pulses at least ${r.highUs.toFixed(2)} µs high`);
    const held = ceilingCheck(r.ceilings, max);
    console.log(`  the loop's ceiling with 1, 2, 3 axes stepping: ${round(r.ceilings.cruise)} steps/s at its cruise, ${round(r.ceilings.up)} speeding up, ${round(r.ceilings.down)} slowing down; the slowest ${Math.round(held.slowest.rate)} (${held.slowest.axes} axes, ${held.slowest.phase}), ${held.margin.toFixed(2)} times MAX_RATE ${max} (a block past it: "${r.over}", at it: "${r.at}"); the machine's axes ask up to ${r.maxRates.join(', ')}`);
    for (const p of r.problems) fail(`the streamer answered ${p}`);
    for (const h of r.homed) if (h.closedAt !== 300) fail(`axis ${h.axis} homed ${h.closedAt} steps to its switch, and it was 300 away`);
    for (const k of [0, 1, 2]) if (r.counted[k] !== r.total[k] || r.position[k] !== r.want[k]) fail(`axis ${k}: ${r.counted[k]} steps (net ${r.position[k]}), and the file has ${r.total[k]} (net ${r.want[k]})`);
    if (r.report !== `q ${r.want.join(' ')} 0`) fail(`the streamer reports "${r.report}", and the file ends at "q ${r.want.join(' ')} 0"`);
    if (r.highUs < STEP_HIGH_US) fail(`a STEP pulse ${r.highUs.toFixed(2)} µs high, under the DRV8825's ${STEP_HIGH_US} µs`);
    if (r.planned && r.seconds > r.planned * 1.05) fail(`the moves took ${r.seconds.toFixed(2)} s, over the planned ${r.planned.toFixed(2)} s by more than 5%: the streamer falls behind`);
    if (r.over !== 'error: rate') fail(`a block at ${max + 1} steps/s was answered "${r.over}", and the streamer refuses past its MAX_RATE of ${max}`);
    if (r.at !== 'ok') fail(`a block at MAX_RATE was answered "${r.at}"`);
    for (const p of held.problems) fail(p);
    for (const [phase, b] of Object.entries(r.short)) {
      console.log(`  the shortest block the sender passes, three axes at ${max} steps/s ${phase === 'cruise' ? 'at the cruise' : 'slowing down every step'}: ${b.block.n} steps (${(b.block.seconds * 1000).toFixed(2)} ms, "${b.block.line}"); ${b.blocks} streamed in ${b.seconds.toFixed(4)} s of ${b.planned.toFixed(4)} s planned, ${Math.round(b.rate)} steps/s, gaps ${b.longestUs.toFixed(0)} µs at most and ${b.shortestUs.toFixed(0)} µs at least`);
      if (b.seconds > b.planned * 1.01) fail(`streamed blocks of ${b.block.n} steps (${phase}) took ${b.seconds.toFixed(4)} s, over the planned ${b.planned.toFixed(4)} s by more than 1%: the streamer falls behind on the shortest blocks the sender passes`);
    }
    for (const [k, m] of r.maxRates.entries()) if (m > max) fail(`axis ${k} of the machine asks ${m} steps/s, past the streamer's MAX_RATE of ${max}`);
  }
  process.exit(failed ? 1 : 0);
}

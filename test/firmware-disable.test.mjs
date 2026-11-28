// The drivers stay on until the last move has run. The streamer answers a block "ok" when it is queued, not when it has
// run, so a "d" (drivers off) obeyed at once left up to 12 queued blocks to run with the motors slack: the arm lost the end
// of its last stroke and the leg dropped instead of coming back to its pose. Here the arm's and the leg's own step files
// are sent through send.mjs's own lines and stream to the streamer on a simulated Uno, and every step must come before
// the enable pin goes high. Then each half of the repair is shown to hold alone: a board flashed with the streamer as it
// was (d at once) is kept safe by the sender, and the streamer is safe with a sender that sends d straight after the last
// "ok"; with neither, the fault shows.
//
// Needs arduino-cli (with the arduino:avr core and the Servo library), avr8js (AVR8JS=<its folder>, as CI's firmware job
// sets it) and the step files cad machine and cad plot write (examples/bench/exports): CI's firmware job has all three.
// Anywhere else these tests are skipped, saying what is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile, simulate, sketchMaxRate } from '../scripts/firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARM = path.join(ROOT, 'examples/bench/projects/arm'), EXPORTS = path.join(ROOT, 'examples/bench/exports');
const SKETCH = path.join(ARM, 'firmware/arm/arm.ino'), SENDER = path.join(ARM, 'send.mjs');
const JOBS = {
  arm: { steps: path.join(EXPORTS, 'arm/arm-test.steps.json'), machine: path.join(EXPORTS, 'arm/arm.machine.json') },
  leg: { steps: path.join(EXPORTS, 'leg/stand-gait.steps.json'), machine: path.join(EXPORTS, 'leg/stand.machine.json') },
};

/** What these tests need and is missing here, or null if nothing is. */
function missing() {
  if (spawnSync('arduino-cli', ['version'], { encoding: 'utf8' }).status !== 0) return 'arduino-cli is not installed';
  try { createRequire(import.meta.url)(process.env.AVR8JS ? path.resolve(process.env.AVR8JS) : 'avr8js'); } catch { return 'avr8js is not installed (AVR8JS=<its folder>)'; }
  for (const j of Object.values(JOBS)) for (const f of [j.steps, j.machine]) if (!fs.existsSync(f)) return `${path.relative(ROOT, f)} is not written (cad machine and cad plot in examples/bench)`;
  return null;
}
const skip = missing() ?? false;

const tmp = skip ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-firmware-disable-'));
test.after(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

/** The streamer compiled for the Uno: as it is, or as it was before d waited for the queue (its wait taken out). */
function build(name, { old = false } = {}) {
  const dir = path.join(tmp, name, 'arm');
  fs.mkdirSync(dir, { recursive: true });
  let source = fs.readFileSync(SKETCH, 'utf8');
  if (old) {
    const wait = '    if (running || waiting || count()) return false;\n';
    assert.ok(source.includes(wait), "arm.ino's d waits for the queue with this line");
    source = source.replace(wait, '');
  }
  fs.writeFileSync(path.join(dir, 'arm.ino'), source);
  const r = compile(dir, path.join(tmp, name, 'build'));
  assert.ok(r.ok, r.output);
  return r.hex;
}

/** A short job on the arm: 8 blocks of 2000 steps at 4000 steps/s, 4 s of moves, all of them in the queue at once. */
function shortJob() {
  const machine = JSON.parse(fs.readFileSync(JOBS.arm.machine, 'utf8'));
  const move = { type: 'move', steps: [2000, 1000], rate: { entry: 4000, peak: 4000, exit: 4000, accel: 20000 }, accelSteps: 0, decelSteps: 0 };
  const file = { format: 'rulecad.steps/1', axes: machine.axes.map((a) => ({ name: a.name })), blocks: [{ type: 'pen', state: 'down', dwell: 0.1 }, ...Array.from({ length: 8 }, () => move)] };
  const steps = path.join(tmp, 'short.steps.json');
  fs.writeFileSync(steps, JSON.stringify(file));
  return { steps, machine: JOBS.arm.machine };
}

/** A sender that sends each line after the last was answered and d straight after the last "ok", as send.mjs did. */
const atOnce = async (lines, ask) => { for (const l of lines) { const a = await ask(l); if (a !== 'ok') throw new Error(`"${l}": ${a}`); } };

const run = async (hex, job, streamWith) => simulate({ hex, ...job, sender: SENDER, maxRate: sketchMaxRate(fs.readFileSync(SKETCH, 'utf8')), measure: false, streamWith });
/** Every step of the job before the drivers went off, and the drivers off at the end. */
function heldToTheEnd(r) {
  assert.deepEqual(r.problems, []);
  assert.notEqual(r.drivers.offAt, null, 'the drivers went off at the end');
  assert.equal(r.drivers.late, 0, `${r.drivers.late} steps after the drivers went off`);
  assert.ok(r.drivers.offAt > r.drivers.lastStep, 'the drivers went off after the last step');
}

test("firmware: the arm's drawing and the leg's gait, sent as send.mjs sends them, run every step before the drivers go off", { skip, timeout: 900_000 }, async () => {
  const send = await import(pathToFileURL(SENDER).href), hex = build('today');
  for (const [name, job] of Object.entries(JOBS)) {
    const r = await run(hex, job);
    heldToTheEnd(r);
    // the lines are send.mjs's own, d last
    const lines = send.jobLines(JSON.parse(fs.readFileSync(job.steps, 'utf8')), JSON.parse(fs.readFileSync(job.machine, 'utf8')));
    assert.equal(r.lines, lines.length, name);
    assert.equal(lines.at(-1), 'd');
    // every step counted, and the machine where the file ends: the leg back in its pose (where it started: net 0)
    assert.deepEqual(r.counted, r.total, `${name}: every step`);
    assert.deepEqual(r.position, r.want, `${name}: where the file ends`);
    assert.equal(r.report, `q ${r.want.join(' ')} 0`);
    if (name === 'leg') assert.deepEqual(r.want, [0, 0, 0], 'the gait ends at the pose it started from');
  }
});

test('firmware: each half of the repair holds alone, and without either the last blocks run with the drivers off', { skip, timeout: 900_000 }, async () => {
  const today = build('today-short'), was = build('was', { old: true }), job = shortJob();
  // the streamer as it was, d obeyed at once: the fault (most of the 16000 steps ran with the drivers off)
  const bare = await run(was, job, atOnce);
  assert.notEqual(bare.drivers.offAt, null);
  assert.ok(bare.drivers.late > 10000, `${bare.drivers.late} steps after the drivers went off, on a board whose d did not wait`);
  // the same board, today's sender: it asks where the board is until nothing is queued and nothing moves, then sends d
  heldToTheEnd(await run(was, job));
  // today's streamer, a sender that does not wait: d waits for the queue on the board
  heldToTheEnd(await run(today, job, atOnce));
});

// The sender's half on its own, with no toolchain: a board that answers a block when it is queued, and runs one block of
// 300 steps in each 100 ms the sender pauses for
function fakeBoard() {
  const b = { said: [], queued: 0, running: false, position: [0, 0, 0], at: [] };
  const step = () => { if (b.running) b.position[0] += 300; b.running = b.queued > 0; if (b.queued) b.queued--; };
  b.ask = async (l) => {
    b.said.push(l);
    if (l === '?') return `q ${b.position.join(' ')} ${b.queued}`;
    if (l.startsWith('m ')) { if (b.running) b.queued++; else b.running = true; }
    if (l === 'd') b.at.push({ queued: b.queued, running: b.running });
    return 'ok';
  };
  b.pause = async () => step();
  return b;
}

test("firmware: send.mjs's stream asks where the board is until nothing is queued and nothing moves, then sends d", async () => {
  const send = await import(pathToFileURL(SENDER).href), board = fakeBoard();
  const lines = ['e', ...Array.from({ length: 5 }, () => 'm 300 0 0 3000 3000 3000 30000 0 0'), 'd'];
  await send.stream(lines, board.ask, { pause: board.pause });
  // d only once nothing was queued or running, after two reports in a row with the same positions
  assert.deepEqual(board.at, [{ queued: 0, running: false }]);
  assert.equal(board.position[0], 1500);
  const asked = board.said.slice(6, -1);
  assert.ok(asked.length >= 2 && asked.every((l) => l === '?'), asked.join(', '));
  assert.equal(board.said.at(-1), 'd');
  // the report read: a position for each axis, then the blocks queued
  assert.deepEqual(send.report('q 12 -3 0 2'), { position: [12, -3, 0], queued: 2 });
  assert.equal(send.report('ok'), null);
  assert.equal(send.report('q'), null);
  // a board that does not answer "?" with a report is refused by name, and nothing is turned off
  await assert.rejects(send.settle(async () => 'ok', async () => {}), /the board answered "\?" with "ok", and the streamer answers "q <positions> <blocks queued>"/);
  // a line refused stops the board ("!") and names the line
  let stopped = 0;
  await assert.rejects(send.stream(['e', 'm 0 0 0 1 1 1 1 0 0'], async (l) => (l === 'e' ? 'ok' : 'error: block'), { stop: () => stopped++ }), /line 2 \("m 0 0 0 1 1 1 1 0 0"\): error: block/);
  assert.equal(stopped, 1);
  // the lines of a job: drivers on, homes, the file's blocks, drivers off last
  const machine = { axes: [{ name: 'a', homing: { direction: -1, rate: 1000, back: 50 } }, { name: 'b' }] };
  const file = { format: 'rulecad.steps/1', axes: [{ name: 'a' }, { name: 'b' }], blocks: [{ type: 'move', steps: [100, 0], rate: { entry: 0, peak: 1000, exit: 0, accel: 10000 }, accelSteps: 50, decelSteps: 50 }] };
  assert.deepEqual(send.jobLines(file, machine), ['e', 'h 0 -1 1000 50', 'm 100 0 0 0 1000 0 10000 50 50', 'd']);
  assert.deepEqual(send.jobLines(file, machine, { home: false }), ['e', 'm 100 0 0 0 1000 0 10000 50 50', 'd']);
});

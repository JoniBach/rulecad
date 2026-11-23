// The firmware's checks that need no Arduino toolchain: which sketches CI compiles, the job that compiles them, the
// readers scripts/firmware.mjs uses, and the arm's sender held to the streamer's own limits. The compile and the
// simulated Uno run in CI's firmware job (node scripts/firmware.mjs --simulate).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sketches, sizes, hexBytes, sketchMaxRate } from '../scripts/firmware.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => fs.readFileSync(`${ROOT}${f}`, 'utf8').replace(/\r\n/g, '\n');
const ARM = 'examples/bench/projects/arm', COPY = 'packages/create-rulecad/machines/arm/projects/arm';

test('firmware: every sketch in the kit is found, and the CI job compiles them and fails on an error', () => {
  const found = sketches().map((s) => s.file);
  assert.deepEqual(found, [`${ARM}/firmware/arm/arm.ino`, 'examples/bench/projects/benchmarks/firmware/bench/bench.ino', `${COPY}/firmware/arm/arm.ino`]);
  const yml = read('.github/workflows/test.yml'), job = yml.slice(yml.indexOf('\n  firmware:'), yml.indexOf('\n  dimensions:'));
  assert.ok(job.length > 100, 'a firmware job');
  for (const want of ['arduino/setup-arduino-cli@v2', 'arduino-cli core install arduino:avr@', 'arduino-cli lib install Servo@', 'avr8js@'])
    assert.ok(job.includes(want), want);
  // the run that compiles is the job's last step, and it is never allowed to fail quietly
  const last = job.slice(job.lastIndexOf('      - '));
  assert.match(last, /node scripts\/firmware\.mjs --simulate examples\/bench\/exports\/arm\/arm-test\.steps\.json --machine examples\/bench\/exports\/arm\/arm\.machine\.json/);
  assert.doesNotMatch(last, /continue-on-error/);
  assert.doesNotMatch(yml.slice(yml.indexOf('\n  firmware:'), yml.indexOf('\n    steps:', yml.indexOf('\n  firmware:'))), /continue-on-error/, 'the job itself can fail');
});

test('firmware: the compile report read for its flash and RAM', () => {
  const out = 'Sketch uses 8244 bytes (25%) of program storage space. Maximum is 32256 bytes.\r\nGlobal variables use 924 bytes (45%) of dynamic memory, leaving 1124 bytes for local variables. Maximum is 2048 bytes.\r\n';
  assert.deepEqual(sizes(out), { flash: 8244, flashMax: 32256, ram: 924, ramMax: 2048 });
  assert.deepEqual(sizes('error: no such file'), { flash: null, flashMax: null, ram: null, ramMax: null });
});

test('firmware: an Intel HEX file read into flash, and a broken one refused by line', () => {
  // :02 0004 00 0C94 sum: 0x02 + 0x00 + 0x04 + 0x00 + 0x0C + 0x94 = 0xA6, so the checksum is 0x100 - 0xA6 = 0x5A
  const flash = hexBytes(':020004000C945A\r\n:00000001FF\r\n', 16);
  assert.deepEqual([...flash.slice(3, 7)], [0, 0x0c, 0x94, 0]);
  assert.throws(() => hexBytes(':020004000C945B\n:00000001FF\n', 16), /line 1 of the hex file: its checksum is wrong/);
  assert.throws(() => hexBytes(':020000040000FA\n:00000001FF\n', 16), /record type 4; an Uno's hex has only data \(0\) and end \(1\)/);
  assert.throws(() => hexBytes(':020004000C945A\n', 16), /no end record/);
  assert.throws(() => hexBytes(':02000F000C944F\n:00000001FF\n', 16), /past the 16 byte flash/);
  assert.throws(() => hexBytes('hello\n', 16), /not an Intel HEX record/);
});

test('firmware: the arm streamer, its sender and its write-up are the same in the example and in create-rulecad', () => {
  for (const f of ['firmware/arm/arm.ino', 'send.mjs', 'STREAMER.md']) assert.equal(read(`${COPY}/${f}`), read(`${ARM}/${f}`), f);
});

test('firmware: the sender holds a block to the streamer\'s MAX_RATE and to each axis\'s rate in the machine description', async () => {
  const send = await import(pathToFileURL(`${ROOT}${ARM}/send.mjs`).href);
  assert.equal(send.MAX_RATE, sketchMaxRate(read(`${ARM}/firmware/arm/arm.ino`)), 'send.mjs and arm.ino agree');
  assert.equal(send.MAX_RATE, 8000);
  assert.throws(() => sketchMaxRate('void loop() {}'), /no "#define RATE_LIMIT/);
  // A block of 1000 steps on axis 0 and 500 on axis 1, at 6000 steps/s on its major axis (axis 0). Axis 1 steps in
  // proportion: 6000 × 500 / 1000 = 3000 steps/s.
  const block = 'm 1000 500 0 0 6000 6000 60000 300 0';
  const ok = send.dryRun(['e', block, 'd']);
  assert.deepEqual([ok.m, ok.peakRate, ok.axisPeaks], [1, 6000, [6000, 3000, 0]]);
  assert.deepEqual(ok.said, ['e  ok', `${block}  ok`, 'd  ok'], 'it echoes each line with its answer');
  // a machine whose axis 1 takes 2500 steps/s refuses the block at that axis; one that takes 3000 passes it
  const machine = (r) => ({ axes: [{ name: 'out', maxRate: 8000 }, { name: 'elbow', maxRate: r }] });
  assert.throws(() => send.dryRun([block], { machine: machine(2500) }), /line 1 .*axis elbow at 3000 steps\/s, past the machine's 2500 for it/);
  assert.equal(send.dryRun([block], { machine: machine(3000) }).m, 1);
  // past MAX_RATE at entry, peak or exit: what the streamer answers "error: rate"
  assert.throws(() => send.dryRun(['m 100 0 0 0 8001 0 1000 0 0']), /8001 steps\/s is past the streamer's MAX_RATE of 8000 \(it would answer "error: rate"\)/);
  assert.throws(() => send.dryRun(['m 100 0 0 8500 8000 0 1000 0 0']), /8500 steps\/s/);
  assert.throws(() => send.dryRun(['h 3 1 1000 50']), /a home is an axis 0, 1 or 2/);
  assert.throws(() => send.dryRun(['x']), /no such command \(the streamer takes e, d, h, p, w, m, \? and !\)/);
});

test('firmware: the streamer refuses a block past MAX_RATE by name, and steps its axes on port D', () => {
  const ino = read(`${ARM}/firmware/arm/arm.ino`);
  assert.match(ino, /if \(b\.peak > MAX_RATE \|\| b\.entry > MAX_RATE \|\| b\.exit_ > MAX_RATE\) \{ Serial\.println\(F\("error: rate"\)\)/);
  assert.match(ino, /const uint8_t STEP\[3\] = \{ 2, 3, 4 \}/, 'D2 to D4 are PD2 to PD4, as STEP_MASK has them');
  assert.match(ino, /STEP_MASK\[3\] = \{ _BV\(PD2\), _BV\(PD3\), _BV\(PD4\) \}/);
  assert.match(read(`${ARM}/STREAMER.md`), /\| `m` \|.*`error: rate` if a rate is past MAX_RATE \|/);
});

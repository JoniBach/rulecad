// The firmware's checks that need no Arduino toolchain: which sketches CI compiles, the job that compiles them, the
// readers scripts/firmware.mjs uses, and the arm's sender held to the streamer's own limits. The compile and the
// simulated Uno run in CI's firmware job (node scripts/firmware.mjs --simulate).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sketches, sizes, hexBytes, sketchMaxRate, ceilingLine, ceilingCheck, shortBlock, simulations } from '../scripts/firmware.mjs';

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

test('firmware: the dry run takes the protocol\'s own ? and ! lines, and answers ? as the streamer would', async () => {
  const send = await import(pathToFileURL(`${ROOT}${ARM}/send.mjs`).href);
  // Positions as of the last step, every block taken as finished: 1000 + 200 = 1200 on axis 0, 500 - 100 = 400 on
  // axis 1; then a home of axis 1 calls it 0. Queued blocks: 0, so the answer is "q 1200 400 0 0", then "q 1200 0 0 0".
  const r = send.dryRun(['e', 'm 1000 500 0 0 6000 6000 60000 300 0', 'm 200 -100 0 0 2000 0 60000 20 20', '?', '!', 'h 1 -1 1000 50', '?', 'd']);
  assert.deepEqual([r['?'], r['!'], r.h, r.position], [2, 1, 1, [1200, 0, 0]]);
  assert.deepEqual(r.said.filter((s) => /^[?!]/.test(s)), ['?  q 1200 400 0 0', '!  ok', '?  q 1200 0 0 0']);
  // the streamer's own answer to ?, from arm.ino, is "q " then three positions each followed by a space, then the count
  assert.match(read(`${ARM}/firmware/arm/arm.ino`), /if \(c == '\?'\) \{ Serial\.print\(F\("q "\)\); for \(uint8_t i = 0; i < 3; i\+\+\) \{ Serial\.print\(position\[i\]\); Serial\.print\(' '\); \} Serial\.println\(count\(\)\)/);
  assert.match(read(`${ARM}/firmware/arm/arm.ino`), /if \(c == '!'\) \{ head = tail = 0; running = false; waiting = false; chained = false; Serial\.println\(F\("ok"\)\)/);
});

test('firmware: the streamer refuses a block past MAX_RATE by name, and steps its axes on port D', () => {
  const ino = read(`${ARM}/firmware/arm/arm.ino`);
  assert.match(ino, /if \(b\.peak > MAX_RATE \|\| b\.entry > MAX_RATE \|\| b\.exit_ > MAX_RATE\) \{ Serial\.println\(F\("error: rate"\)\)/);
  assert.match(ino, /const uint8_t STEP\[3\] = \{ 2, 3, 4 \}/, 'D2 to D4 are PD2 to PD4, as STEP_MASK has them');
  assert.match(ino, /STEP_MASK\[3\] = \{ _BV\(PD2\), _BV\(PD3\), _BV\(PD4\) \}/);
  assert.match(read(`${ARM}/STREAMER.md`), /\| `m` \|.*`error: rate` if a rate is past MAX_RATE \|/);
});

test('firmware: the loop\'s ceiling is measured speeding up and slowing down as well as at the cruise, and the slowest is held to MAX_RATE', () => {
  // arm.ino's tick() divides (gap = 1000000 / rate) only on a step that changes the rate, that is while done < up or
  // done >= major - down. A block with up = down = 0 never takes that path, so each phase gets its own block.
  assert.equal(ceilingLine(3, 'cruise', 4000), 'm 4000 4000 4000 50000 50000 50000 1000000 0 0');
  assert.equal(ceilingLine(2, 'up', 4000), 'm 4000 4000 0 50000 50000 50000 100000000 4000 0');
  assert.equal(ceilingLine(1, 'down', 4000), 'm 4000 0 0 50000 50000 50000 100000000 0 4000');
  // every step of an 'up' block changes the rate: a = 1e8 steps/s² over a gap of 1 / 50000 s adds 1e8 x 20e-6 = 2000
  // steps/s, and the rate is clamped back to the peak of 50000, so the division runs on all 4000 steps
  assert.throws(() => ceilingLine(4, 'up'), /axes 4: a block steps 1, 2 or 3 axes/);
  assert.throws(() => ceilingLine(1, 'coast'), /phase "coast": one of cruise, up, down/);
  // the figures measured on the simulated Uno (arduino:avr 1.8.8, RATE_LIMIT=1000000), each the mean over a block's middle
  // steps: the cruise alone is 2.65 times MAX_RATE (21237 / 8000), and the slowest, three axes slowing down, is
  // 12428 / 8000 = 1.55 times (it was 8904, 1.11 times, before the speed was worked out every other step past 5000 steps/s)
  const measured = { cruise: [24290, 22658, 21237], up: [13530, 13009, 12526], down: [13415, 12904, 12428] };
  const held = ceilingCheck(measured, 8000);
  assert.deepEqual(held.slowest, { phase: 'down', axes: 3, rate: 12428 });
  assert.equal(held.margin.toFixed(2), '1.55');
  assert.deepEqual(held.problems, []);
  // a loop fast at its cruise and slow while speeding up fails: the old check read the cruise's three axes only
  const slow = ceilingCheck({ ...measured, up: [8200, 7900, 7600] }, 8000);
  assert.deepEqual(slow.problems, [
    'the loop steps 2 axes at 7900 steps/s at most while speeding up, under MAX_RATE (8000)',
    'the loop steps 3 axes at 7600 steps/s at most while speeding up, under MAX_RATE (8000)']);
  assert.throws(() => ceilingCheck({ cruise: [1, 2, 3], up: [1, 2] }, 8000), /ceilings\.up: three rates/);
  // and the simulation run in CI uses this check, not the cruise's three-axis figure alone
  const script = read('scripts/firmware.mjs');
  assert.match(script, /ceilings: measure \? Object\.fromEntries\(PHASES\.map\(\(p\) => \[p, \[1, 2, 3\]\.map\(\(a\) => ceiling\(fast, avr, a, p\)\)\]\)\)/);
  assert.match(script, /for \(const p of held\.problems\) fail\(p\)/);
  assert.doesNotMatch(script, /r\.ceilings\[2\] < max/);
});

test('firmware: a block must last as long as its line and answer take, and the sender refuses a shorter one before anything moves', async () => {
  const send = await import(pathToFileURL(`${ROOT}${ARM}/send.mjs`).href);
  // 115200 baud at 10 bits a byte is 86.8 µs a byte. A 36-character line, its newline and the 4-byte answer "ok\r\n" are
  // 41 bytes: 41 x 10 / 115200 = 3.559 ms on the wire, and 3.559 + 5.1 = 8.659 ms with the USB turnaround
  const line = 'm 20 20 20 8000 8000 8000 100000 0 0';
  assert.equal(line.length, 36);
  assert.equal((send.leastBlockTime(line, { turnaround: 0 }) * 1000).toFixed(3), '3.559');
  assert.equal((send.leastBlockTime(line) * 1000).toFixed(3), '8.659');
  // the checker's case: 20 steps at 8000 steps/s are over in 2.5 ms; the streamer fell 55% behind on them
  assert.throws(() => send.dryRun(['e', line]), /line 2 .*20 steps at up to 8000 steps\/s can be over in 2\.50 ms, and the streamer needs 8\.66 ms for each block's line and answer: it would fall behind/);
  assert.throws(() => send.dryRun([line], { turnaround: 0 }), /needs 3\.56 ms/);
  // 70 steps at 8000 steps/s last 8.75 ms, over 8.659 (the line is still 36 characters): taken
  assert.equal(send.dryRun(['m 70 70 70 8000 8000 8000 100000 0 0']).m, 1);
  // the soonest a block can be over is at its fastest of entry, peak and exit: 70 steps at a peak of 4000 last 17.5 ms
  assert.equal(send.dryRun(['m 70 0 0 0 4000 0 100000 35 35']).m, 1);
  // send.mjs checks the whole file before it opens the port, not only on a dry run
  assert.match(read(`${ARM}/send.mjs`), /let r;\n  try \{ r = dryRun\(lines, \{ machine \}\); \} catch \(e\) \{ console\.error\(`\$\{has\('dry-run'\) \? 'dry run' : 'not sent'\}/);
  // the worked arm plans with a least block time that covers a 60-character line: (60 + 1 + 4) x 10 / 115200 + 0.0051 =
  // 0.01074 s, under its task.blockTime of 0.011 (the worked file's lines are 34 to 41 characters)
  for (const f of [ARM, COPY]) {
    const task = JSON.parse(read(`${f}/assemblies/arm.json`)).task;
    assert.equal(task.blockTime, 0.011, f);
    assert.ok(send.leastBlockTime('m'.padEnd(60, ' ')) <= task.blockTime, f);
  }
});

test('firmware: CI streams the shortest blocks the sender passes, and the streamer reads a line a character at a time', () => {
  // with no USB link (the simulation), at 8000 steps/s on three axes: the 36-character cruise line needs 3.559 ms, so 28
  // steps (3.5 ms) are too few and 29 (3.625 ms) do; the 40-character slowing line needs 45 x 10 / 115200 = 3.906 ms, so
  // 31 steps (3.875 ms) are too few and 32 (4.0 ms) do
  const least = (l) => ((l.length + 1 + 4) * 10) / 115200;
  assert.deepEqual(shortBlock(3, 'cruise', 8000, least), { n: 29, line: 'm 29 29 29 8000 8000 8000 100000 0 0', seconds: 29 / 8000 });
  assert.deepEqual(shortBlock(3, 'down', 8000, least), { n: 32, line: 'm 32 32 32 8000 8000 8000 100000000 0 32', seconds: 32 / 8000 });
  assert.throws(() => shortBlock(3, 'up', 8000, least), /phase "up": cruise or down/);
  assert.throws(() => shortBlock(4, 'down', 8000, least), /axes 4/);
  const script = read('scripts/firmware.mjs');
  assert.match(script, /const least = \(l\) => send\.leastBlockTime\(l, \{ turnaround: 0 \}\)/);
  assert.match(script, /if \(b\.seconds > b\.planned \* 1\.01\) fail\(/);
  // the streamer: no strtol over a whole line at its end (it held the steps 520 to 600 µs), a character taken as it comes,
  // and a block that follows another keeps its time
  const ino = read(`${ARM}/firmware/arm/arm.ino`);
  assert.doesNotMatch(ino, /strtol\(/);
  assert.match(ino, /    take\(c\);/);
  assert.match(ino, /if \(done >= cur\.major\) \{ running = false; nextAt \+= \(unsigned long\)gap; chained = true; return; \}/);
  assert.match(ino, /if \(!chained\) nextAt = micros\(\);/);
  // the job's comment says so
  const yml = read('.github/workflows/test.yml');
  assert.match(yml.slice(yml.indexOf('\n  firmware:'), yml.indexOf('\n    runs-on:', yml.indexOf('\n  firmware:'))), /shortest blocks the sender passes/);
});

test('firmware: CI streams the leg\'s gait through the streamer as well as the arm\'s drawing, each step file with its own machine', () => {
  const arm = ['examples/bench/exports/arm/arm-test.steps.json', 'examples/bench/exports/arm/arm.machine.json'], leg = ['examples/bench/exports/leg/stand-gait.steps.json', 'examples/bench/exports/leg/stand.machine.json'];
  assert.deepEqual(simulations(['--simulate', arm[0], '--machine', arm[1], '--simulate', leg[0], '--machine', leg[1]]), [{ steps: arm[0], machine: arm[1] }, { steps: leg[0], machine: leg[1] }]);
  assert.deepEqual(simulations(['--list']), []);
  assert.throws(() => simulations(['--simulate', arm[0], '--simulate', leg[0], '--machine', leg[1]]), /--simulate examples\/bench\/exports\/arm\/arm-test\.steps\.json needs --machine <file\.machine\.json> after it/);
  assert.throws(() => simulations(['--simulate', '--machine', arm[1]]), /--simulate needs a step file/);
  // the loop's ceilings and the shortest blocks are measured once, on the first file; every file is streamed and counted
  const script = read('scripts/firmware.mjs');
  assert.match(script, /measure: n === 0/);
  // the job writes the leg's machine and gait, then streams both files in one run
  const yml = read('.github/workflows/test.yml'), job = yml.slice(yml.indexOf('\n  firmware:'), yml.indexOf('\n  dimensions:'));
  assert.match(job, /cad\.mjs machine leg\/stand && node \.\.\/\.\.\/packages\/cad\/bin\/cad\.mjs plot leg\/stand\n/);
  const last = job.slice(job.lastIndexOf('      - '));
  assert.match(last, /--simulate examples\/bench\/exports\/arm\/arm-test\.steps\.json --machine examples\/bench\/exports\/arm\/arm\.machine\.json\n\s+--simulate examples\/bench\/exports\/leg\/stand-gait\.steps\.json --machine examples\/bench\/exports\/leg\/stand\.machine\.json/);
});

test('firmware: the sender names a gait file\'s cycles, time and start pose, and says the leg must stand in that pose', async () => {
  const send = await import(pathToFileURL(`${ROOT}${ARM}/send.mjs`).href);
  assert.equal(send.gait({ kind: 'gait', cycles: 3, time: 13.66, pose: 'standing' }), ', 3 cycles of a gait, 13.7 s from the pose "standing" and back');
  assert.equal(send.gait({ kind: 'gait', cycles: 1, time: 2 }), ', 1 cycle of a gait, 2.0 s');
  assert.equal(send.gait({ format: 'rulecad.steps/1', blocks: [] }), '', 'a drawing says nothing more');
  assert.match(read(`${ARM}/send.mjs`), /if \(file\.kind === 'gait'\) console\.log\(`a gait\$\{gait\(file\)\}: the streamer counts from where the motors stand now/);
  // a file with more axes than the streamer's three is refused before anything is sent: the quadruped's eight
  assert.throws(() => send.linesOf({ format: 'rulecad.steps/1', axes: new Array(8).fill({}), blocks: [] }), /8 axes in the file, and the streamer has 3/);
  assert.match(read(`${ARM}/STREAMER.md`), /## A leg on the same streamer/);
});

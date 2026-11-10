#!/usr/bin/env node
// npm create rulecad [folder]: a new rulecad workspace with a design to start from (a soap tray), then npm install.
//   --machine arm | leg   start from a whole machine instead: the arm drawn on a sheet (EXAMPLES chapter 12) or a leg on a stand
//                         (chapter 14), sized when it is made, with its task, bought parts, wires and firmware
//   --sheet a5 --accuracy 0.3 (for --machine arm), --robot 1.5 (for --machine leg): the sizes it is made to
//   --no-install   make the files only
//   --share gist   short model links: each model you share is stored in a secret GitHub Gist (needs gh, signed in)
//   --share long   links that carry the whole model (nothing is uploaded; too long for chat on bigger models)
// Without --share it asks, in a terminal; elsewhere it keeps links long, since nothing is uploaded without a choice.
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), install = !args.includes('--no-install');
const VALUED = new Set(['--share', '--machine', '--sheet', '--accuracy', '--robot']);
const optionValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] ?? '' : null);
// The folder is the argument that isn't an option, or an option's value
const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1])) || 'my-designs'), name = path.basename(dir);
const machine = optionValue('--machine'), MACHINES = ['arm', 'leg'];
if (machine !== null && !MACHINES.includes(machine)) { console.error(`--machine is ${MACHINES.join(' or ')} (got "${machine}")`); process.exit(1); }
if (fs.existsSync(dir) && fs.readdirSync(dir).length) { console.error(`${dir} isn't empty: name a new folder (npm create rulecad my-designs)`); process.exit(1); }

const TEMPLATE = fileURLToPath(new URL('./template/', import.meta.url));
fs.cpSync(TEMPLATE, dir, { recursive: true });
fs.renameSync(path.join(dir, 'gitignore'), path.join(dir, '.gitignore')); // npm drops files named .gitignore from packages
const readme = path.join(dir, 'README.md');
fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replaceAll('NAME', name));
// The cad command a new workspace gets. Before 1.0 a caret covers one minor version only, so this follows
// @rulecad/cad's minor (the test fails when it falls behind, and a new workspace would get an old cad).
const CAD = '^0.7.0';
// $RULECAD_LOCAL: a rulecad checkout to use instead of npm (to try unpublished changes)
const from = (pkg) => (process.env.RULECAD_LOCAL ? `file:${path.join(path.resolve(process.env.RULECAD_LOCAL), 'packages', pkg)}` : CAD);
fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
  name: name.toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[._-]+|-+$/g, '') || 'my-designs', // a name npm takes, whatever the folder is called
  private: true, type: 'module',
  scripts: { check: 'cad check home/soap-tray' },
  dependencies: { '@rulecad/cad': from('cad'), '@jscad/modeling': '^2.12.0' },
}, null, 2)}\n`);

console.log(`made ${path.relative(process.cwd(), dir) || '.'}: a soap tray to start from, in projects/home`);

// A machine: copy it in, and size it to what was asked
const SHEETS = { a6: [148, 105], a5: [210, 148], a4: [297, 210] };
async function sized() {
  const arm = machine === 'arm', o = { sheet: optionValue('--sheet'), accuracy: optionValue('--accuracy'), robot: optionValue('--robot') };
  const asking = process.stdin.isTTY && process.stdout.isTTY && o.sheet === null && o.accuracy === null && o.robot === null;
  if (asking) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (arm) { o.sheet = (await rl.question('Sheet to draw on (a6, a5, a4) [a5]: ')).trim() || null; o.accuracy = (await rl.question('Accuracy at the pen, in mm [0.3]: ')).trim() || null; } else o.robot = (await rl.question('Robot this leg is for, in kg [1.5]: ')).trim() || null;
    rl.close();
  }
  const sheet = (o.sheet || 'a5').toLowerCase(), accuracy = o.accuracy == null ? 0.3 : Number(o.accuracy), robot = o.robot == null ? 1.5 : Number(o.robot);
  fs.cpSync(fileURLToPath(new URL(`./machines/${machine}/`, import.meta.url)), dir, { recursive: true });
  if (machine === 'leg') {
    if (!(robot > 0)) { console.error(`--robot is a mass in kg (got "${o.robot}")`); process.exit(1); }
    const file = path.join(dir, 'rules/leg.json'), rules = JSON.parse(fs.readFileSync(file, 'utf8'));
    rules.rules.robot = { ...rules.rules.robot, value: robot };
    fs.writeFileSync(file, `${JSON.stringify(rules, null, 2)}\n`);
    return console.log(`  a leg on its stand, for a ${robot} kg robot; its share of the weight is ${robot / 2} kg: rules/leg.json`);
  }
  if (!SHEETS[sheet]) { console.error(`--sheet is ${Object.keys(SHEETS).join(', ')} (got "${o.sheet}"; a larger sheet's links wouldn't fit a 256 mm bed)`); process.exit(1); }
  if (!(accuracy > 0)) { console.error(`--accuracy is above 0 mm (got "${o.accuracy}")`); process.exit(1); }
  const [w, h] = SHEETS[sheet], near = 70;
  // Reach from the sheet: the far corner at 88% of the links' stretch, the shortest forearm that folds to the near edge (EXAMPLES chapter 12)
  const far = Math.hypot(near + h, w / 2), reach = Math.round(far / 0.88);
  let fore = 60; for (; fore < reach; fore += 5) { const upper = reach - fore; if (Math.sqrt(upper ** 2 + fore ** 2 - 2 * upper * fore * Math.cos((20 * Math.PI) / 180)) <= near) break; }
  const upper = reach - fore;
  const rulesFile = path.join(dir, 'rules/arm.json'), set = JSON.parse(fs.readFileSync(rulesFile, 'utf8')), label = sheet.toUpperCase();
  Object.assign(set.rules.sheet_w, { value: w, rule: `A ${label} sheet's long side, across the arm's front` });
  Object.assign(set.rules.sheet_h, { value: h, rule: `A ${label} sheet's short side, away from the arm` });
  Object.assign(set.rules.upper, { value: upper }); Object.assign(set.rules.fore, { value: fore });
  fs.writeFileSync(rulesFile, `${JSON.stringify(set, null, 2)}\n`);
  const file = path.join(dir, 'projects/arm/assemblies/arm.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"size": "a5"', `"size": "${sheet}"`).replace('"accuracy": 0.3', `"accuracy": ${accuracy}`));
  // A test drawing that fits the sheet: a square, and a circle in it
  const side = Math.round(Math.min(w, h) * 0.675), svg = path.join(dir, 'projects/arm/drawings/test.svg');
  fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect id="square" x="${(w - side) / 2}" y="${(h - side) / 2}" width="${side}" height="${side}" fill="none"/><circle id="circle" cx="${w / 2}" cy="${h / 2}" r="${Math.round(side * 0.35)}" fill="none"/></svg>\n`);
  console.log(`  an arm for a landscape ${label} sheet at ${accuracy} mm: upper arm ${upper} mm, forearm ${fore} mm: rules/arm.json`);
}
if (machine) {
  await sized();
  fs.appendFileSync(readme, `\n## The machine\n\nA ${machine === 'arm' ? 'two-link arm that draws' : 'leg on a test stand'}, in \`projects/${machine}\`, made by \`--machine ${machine}\`: its task, bought parts, wires and firmware are in the assembly (EXAMPLES chapters 12 and 14 explain every part). \`npx cad check ${machine === 'arm' ? 'arm/arm' : 'leg/stand'}\` first.\n`);
}

// How models are shared: short links need somewhere to keep the model (a secret Gist); long links carry it
let share = args.includes('--share') ? args[args.indexOf('--share') + 1] || '' : null;
if (share !== null && !['gist', 'long'].includes(share)) { console.error(`--share is gist or long (got "${share}")`); process.exit(1); }
if (!share && process.stdin.isTTY && process.stdout.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question('\nModel links: short ones are easy to paste into chat, but each model you share is stored in a secret\nGitHub Gist (needs the gh command, signed in). Long ones carry the model and upload nothing. Short links? [y/N] ');
  rl.close();
  share = /^y/i.test(a.trim()) ? 'gist' : 'long';
}
if (share === 'gist') {
  const cfg = path.join(dir, 'cad.config.json'), c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  c.targets = { ...c.targets, shorten: 'gist' };
  fs.writeFileSync(cfg, `${JSON.stringify(c, null, 2)}\n`);
  let ready = true;
  try { execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' }); } catch { ready = false; }
  console.log(ready ? 'short links: models you share go into secret Gists (unlisted: only people with the link find them)'
    : 'short links are on, but the gh command isn\'t installed or signed in: install it from cli.github.com and run gh auth login');
} else console.log(`model links carry the whole model${share ? '' : ' (no --share given)'}; for short ones later, add "shorten": "gist" to "targets" in cad.config.json`);
if (install) execSync('npm install', { cwd: dir, stdio: 'inherit' });
const start = machine === 'arm' ? 'arm/arm' : machine === 'leg' ? 'leg/stand' : 'home/soap-tray';
console.log(`\n  cd ${path.relative(process.cwd(), dir)}\n  npx cad check ${start}\n  npx cad preview ${start}${machine === 'arm' ? '\n  npx cad plot arm/arm projects/arm/drawings/test.svg' : ''}\n\nREADME.md says what's where.`);

// cad's tests of generated frames and frame sizing. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN } from './helpers.mjs';

test('generated frames: a box asked for by its inside size expands into beams one profile width shorter at each butting end, checks clean with its joins and feet, changes every length with the profile, and writes out to edit by hand', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = (n) => at(`assemblies/${n}.json`);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (n, x) => fs.writeFileSync(file(n), JSON.stringify({ title: n, kind: 'fit', ...x }));
    const probe = (n) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { bounds } = await import('@rulecad/printcheck');
      const s = await buildAssembly('frame/${n}'), f = checkAssembly(s);
      console.log(JSON.stringify({ z: Object.fromEntries(s.parts.filter((p) => ['g.body', 'y3.body', 'z1.body'].includes(p.name)).map((p) => { const b = bounds(p.triangles); return [p.name.split('.')[0], [+b.lo[2].toFixed(2), +b.hi[2].toFixed(2)]]; })), lengths: Object.fromEntries(s.objects.filter((o) => o.beam).map((o) => [o.id, +o.beam.length.toFixed(3)])), items: s.items.map((i) => i.id),
        joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses),
        geometry: f.filter((x) => x.code === 'join.geometry').map((x) => [x.level, x.values.gap]), fastened: f.filter((x) => x.code === 'fasten.length' && /^foot-/.test(x.text)).map((x) => [x.text.split(' ')[0], x.text.split(' ')[3].split(\"'\")[0], x.text.split(': ')[1].split(' chosen')[0]]), generated: f.find((x) => x.code === 'frame.generated') ?? null,
        bad: f.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.code + ': ' + x.text) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // 1. The specification's own example: a box round 300 x 300 x 350 mm in 2020 (p = 20 mm), joined blind, on levelling
    // feet. Hand: the uprights run through; every other beam butts against two uprights' faces, so each is its outside
    // span less a width at each end, 340 - 20 - 20 = 300 mm, the inside. Each foot is screwed into its upright's end,
    // tapped M5 18.5 mm, and the bottom ring's blind joins drill an access hole across the upright at the ring's centre
    // line (Ø5.3), so the ring rises 18.5 mm, clear of the tap: the uprights are 350 + 2 x 20 + 18.5 = 408.5 mm. Its 16
    // blind joins meet flush (gap 0), its 4 lower ends stand on feet screwed in by an M5 cap screw each, its 4 upper ends
    // are capped, and nothing in its check fails or warns: the joins' operations, screws, the feet's screws and seats,
    // the caps, the cut list, the order
    const ask = { kind: 'box', inside: [300, 300, 350], profile: '2020-misumi-hfs5', join: 'blind', feet: 'levelling' };
    write('box', { frame: ask });
    let r = probe('box');
    assert.deepEqual(r.bad, []);
    assert.deepEqual(Object.entries(r.lengths).map(([id, l]) => `${id} ${l}`), ['z1 408.5', 'z2 408.5', 'z3 408.5', 'z4 408.5', 'x1 300', 'x2 300', 'y1 300', 'y2 300', 'x3 300', 'x4 300', 'y3 300', 'y4 300']);
    assert.deepEqual(r.geometry, Array(16).fill(['pass', 0]));
    assert.ok(['foot-z1', 'cap-z1-b', 'foot-z4', 'cap-z4-b'].every((id) => r.items.includes(id)), r.items.join(', '));
    assert.deepEqual([r.generated.values.inside, r.generated.values.outside, r.generated.refs.arrangement], [[300, 300, 350], [340, 340, 408.5], 'face']);
    assert.match(r.generated.text, /^generated: a box of 2020-misumi-hfs5 \(20 mm\), joined blind: the upright beams run through and the rest butt against their faces; inside 300 x 300 x 350 mm, outside 340 x 340 x 408\.5 mm; the bottom ring stands 18\.5 mm up the uprights, so its joins' holes clear the feet's tapped ends; 4 x 408\.5 mm: z1, z2, z3, z4; 8 x 300 mm/);
    assert.deepEqual(r.fastened, [['foot-z1', 'z1', 'M5x16 cap'], ['foot-z2', 'z2', 'M5x16 cap'], ['foot-z3', 'z3', 'M5x16 cap'], ['foot-z4', 'z4', 'M5x16 cap']]);
    // 2. The same request in 3030 (p = 30 mm): every length follows. Inside the same, the butting beams stay the inside,
    // 300 mm, and the uprights are 350 + 2 x 30 = 410 mm; every join still meets flush, now 15 mm (p / 2) from the ends
    write('box', { frame: { ...ask, profile: '3030-item-6', feet: undefined } });
    r = probe('box');
    assert.deepEqual(Object.values(r.lengths), [410, 410, 410, 410, 300, 300, 300, 300, 300, 300, 300, 300]);
    // (with no feet, it stands on its lowest ends, a guess the frame's solve warns of: issue 304)
    assert.deepEqual(r.geometry, Array(16).fill(['pass', 0])); assert.deepEqual(r.bad.map((x) => x.replace(/:.*Its supports are guessed: nothing says where it is held.*$/, ': guessed')), ['frame.solve: guessed']);
    // asked by its outside, 340 x 340 x 390, the uprights are that height in either profile and each butting beam is
    // 340 - 2 x 30 = 280 mm in 3030 where it was 300 in 2020
    write('box', { frame: { ...ask, inside: undefined, outside: [340, 340, 390], profile: '3030-item-6', feet: undefined } });
    assert.deepEqual(Object.values(probe('box').lengths), [390, 390, 390, 390, 280, 280, 280, 280, 280, 280, 280, 280]);
    // 3. cad frame says what it expands into; --expand writes it into the assembly, which builds the same frame by hand
    write('box', { frame: { ...ask, limit: 2 } });
    assert.match(cad('frame', 'frame/box'), /frame\/box: a box of 2020-misumi-hfs5 \(20 mm\), joined blind[^]*inside 300 x 300 x 350 mm, outside 340 x 340 x 408\.5 mm; the bottom ring stands 18\.5 mm up the uprights[^\n]*\n  4 x 408\.5 mm: z1, z2, z3, z4\n  8 x 300 mm: x1, x2, y1, y2, x3, x4, y3, y4\n16 joins \(blind\); 8 end fittings \(levelling-foot, end-cap\)/);
    const unexpanded = fs.readFileSync(file('box'), 'utf8');
    assert.match(cad('frame', 'frame/box', '--expand', '--dry-run'), /^dry run, nothing written: would write projects\/frame\/assemblies\/box\.json: the box as 12 beams, 16 joins and 8 fittings/);
    assert.deepEqual(JSON.parse(cad('frame', 'frame/box', '--expand', '--dry-run', '--json')).expanded.joins.length, 16);
    assert.equal(fs.readFileSync(file('box'), 'utf8'), unexpanded, 'a dry run leaves the assembly as it was');
    assert.match(cad('frame', 'frame/box', '--expand'), /wrote projects[\\/]frame[\\/]assemblies[\\/]box\.json: the box as 12 beams, 16 joins and 8 fittings, to edit by hand \(its "frame" keeps only how it is solved\)/);
    const written = JSON.parse(fs.readFileSync(file('box'), 'utf8'));
    assert.deepEqual([written.frame, written.items.length, written.joins.length, written.items[4], written.joins[0]], [{ limit: 2 }, 20, 16, { id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [20, 10, 28.5], to: [320, 10, 28.5] }, { kind: 'blind', a: 'x1.a', b: 'z1.back@28.5' }]);
    assert.deepEqual([written.items[0].beam.ops, written.fasten[0]], [[{ op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }], { screw: 'M5 cap', through: ['foot-z1'], into: 'z1', at: ['foot-z1.b1'], note: 'foot-z1 screwed into z1\'s end a' }]);
    r = probe('box');
    assert.deepEqual([r.bad, r.generated, Object.values(r.lengths).join(' ')], [[], null, '408.5 408.5 408.5 408.5 300 300 300 300 300 300 300 300']);
    cad.refused(/asks for no generated frame/, 'frame', 'frame/box');
    // an item of the assembly's own named as the frame names its parts is refused by name
    write('clash', { frame: ask, items: [{ id: 'z1', beam: { profile: '2020-misumi-hfs5', length: 100 } }] });
    cad.refused(/frame: the box names its parts z1, z2, z3 \.\., and this assembly already has z1: rename it/, 'check', 'frame/clash');
    // 4. A gantry: its moving beam rides the left top side beam on a sliding joint through 476 mm (the outside depth
    // 540 less the two uprights, 2 x 2 mm clear and its own 20 mm), and its caps and feet are held by the beams they are
    // on, so nothing is loose; a box braced on its left side (printed corner brackets) with a back panel checks clean too
    write('gantry', { frame: { kind: 'gantry', inside: [400, 500, 200], profile: '2020-misumi-hfs5', feet: 'levelling' } });
    r = probe('gantry');
    assert.deepEqual([r.bad, r.joints, r.poses, r.lengths.g], [[], [['gantry', 'prismatic', [0, 476, 0]]], ['gantry-front', 'gantry-back'], 440]);
    // and g lies on y3, its bottom on y3's top face and its top level with the uprights' and the outside height. Hand:
    // its feet tap the uprights' ends 18.5 mm and its bottom ring rises by that; outside 200 + 3 x 20 + 18.5 = 278.5;
    // y3's centre 18.5 + 20 + 200 + 10 = 248.5, so it spans 238.5 to 258.5; g spans 258.5 to 278.5
    assert.deepEqual([r.z.y3, r.z.g, r.z.z1], [[238.5, 258.5], [258.5, 278.5], [0, 278.5]]);
    // 5. Joined by printed corner brackets: their slot nuts drop in through the opening (every butting beam is shut at
    // both ends by its brackets, so a slide-in nut could not reach its place), and nothing fails. It warns only that
    // the frame racks: 16 printed brackets are softer than blind joins, a finding about the frame, not a fault; and,
    // with no feet, that it stands on its lowest ends, a guess (issue 304)
    const guessed = (x) => /^frame\.solve: .*Its supports are guessed: nothing says where it is held/.test(x);
    write('bracket', { frame: { kind: 'box', inside: [200, 200, 200], profile: '2020-misumi-hfs5', join: { kind: 'bracket', fitting: 'printed' } } });
    r = probe('bracket');
    assert.ok(r.bad.some(guessed), r.bad.join('\n'));
    assert.deepEqual([...new Set(r.bad.filter((x) => !guessed(x)).map((x) => x.split(':')[0]))], ['frame.rack'], r.bad.join('\n'));
    write('braced', { frame: { kind: 'box', inside: [300, 300, 350], profile: '2020-misumi-hfs5', braces: ['left'], panels: { sheet: 'acrylic', thickness: 3, sides: ['back'] } } });
    r = probe('braced');
    assert.deepEqual(r.bad.filter((x) => !guessed(x)), []);
    assert.ok(['y1-z1-bracket', 'y3-z3-bracket', 'panel-back'].every((id) => r.items.includes(id)), r.items.join(', '));
    // 6. Across the series and makers, with blind joins: MISUMI's and Bosch's 3030 (M8 in an 8 mm slot, the access hole
    // 6.3 mm, inside the opening) and item's 4040 (M8, 8 mm) check clean with nothing warned. (MISUMI's and Bosch's 4040
    // take M12 in a 10 mm slot, and Bosch's 2020 an M6 button head 3.3 mm high under 3 mm lips: the generator refuses
    // those by name, frames' test.) By printed gussets: each lies on the post's face looking out of the box, so none
    // lands on the face where the corner's third beam butts, and the box checks clean. By printed brackets in item's
    // 4040, whose slot the kit has no drop-in nut for: its roll-in nuts, chosen by the generator, and it checks clean
    for (const profile of ['3030-misumi-hfs6', '3030-bosch', '4040-item-8']) {
      write('box', { frame: { kind: 'box', inside: [300, 250, 350], profile, join: 'blind', feet: 'foot' } });
      assert.deepEqual(probe('box').bad, [], profile);
    }
    write('gussets', { frame: { kind: 'box', inside: [300, 250, 350], profile: '2020-misumi-hfs5', join: { kind: 'gusset', fitting: 'printed' }, feet: 'foot' } });
    r = probe('gussets');
    assert.deepEqual(r.bad, []); assert.equal(r.items.filter((id) => /-gusset$/.test(id)).length, 16);
    // written out, each gusset join names its face; a face not square to a, or a face on another kind, is refused by name
    cad('frame', 'frame/gussets', '--expand');
    const g = JSON.parse(fs.readFileSync(file('gussets'), 'utf8'));
    assert.deepEqual([g.joins[0].b, g.joins[0].face], ['z1.back@10', 'bottom']);
    fs.writeFileSync(file('gussets'), JSON.stringify({ ...g, joins: [{ ...g.joins[0], face: 'back' }, ...g.joins.slice(1)] }));
    cad.refused(/join 1: face is the face of z1 a printed gusset lies on, square to x1: top or bottom \(got "back"\)/, 'check', 'frame/gussets');
    fs.writeFileSync(file('gussets'), JSON.stringify({ ...g, joins: [{ kind: 'blind', a: g.joins[0].a, b: g.joins[0].b, face: 'bottom' }, ...g.joins.slice(1)] }));
    cad.refused(/join 1: face names the face of b a printed gusset lies on: give it on a gusset join with "fitting": "printed", or leave face out/, 'check', 'frame/gussets');
    // a gusset's shape: T only where b runs on both sides of a far enough for its bar (a box's corner has none below its
    // bottom ring), never turned over onto the other face, and only on a printed gusset
    fs.writeFileSync(file('gussets'), JSON.stringify({ ...g, joins: [{ ...g.joins[0], shape: 'T' }, ...g.joins.slice(1)] }));
    cad.refused(/join 1: shape T: a printed gusset turned onto z1's bottom face is an L only \(a T's bar would lie along x1\): give shape L, or leave face out/, 'check', 'frame/gussets');
    fs.writeFileSync(file('gussets'), JSON.stringify({ ...g, joins: [{ ...g.joins[0], face: undefined, shape: 'T' }, ...g.joins.slice(1)] }));
    cad.refused(/join 1: shape T: a printed T gusset's bar runs [\d.]+ mm along z1 on both sides of x1, and there is 0 mm on one side: give shape L, or leave shape out/, 'check', 'frame/gussets');
    fs.writeFileSync(file('gussets'), JSON.stringify({ ...g, joins: [{ kind: 'blind', a: g.joins[0].a, b: g.joins[0].b, shape: 'L' }, ...g.joins.slice(1)] }));
    cad.refused(/join 1: shape names a printed gusset's shape \(L or T\): give it on a gusset join with "fitting": "printed", or leave shape out/, 'check', 'frame/gussets');
    // a gantry in 3030 by printed gussets: its uprights run one width (30 mm) above the top side beams, room for a T's
    // bar, but a T there puts the inside round between its bar and the arm along the side beam where the moving beam's
    // end cap passes at either end of its travel (an overlap of about 52 mm³ at rest). Its top side beams' gussets are
    // Ls, so it checks clean, in MISUMI's 3030 at two sizes and in Bosch's
    for (const [profile, inside] of [['3030-misumi-hfs6', [400, 500, 200]], ['3030-misumi-hfs6', [400, 300, 350]], ['3030-bosch', [400, 500, 200]]]) {
      write('gantry3030', { frame: { kind: 'gantry', inside, profile, join: { kind: 'gusset', fitting: 'printed' }, feet: 'levelling' } });
      assert.deepEqual(probe('gantry3030').bad, [], `${profile} ${inside}`);
    }
    cad('frame', 'frame/gantry3030', '--expand');
    const ls = JSON.parse(fs.readFileSync(file('gantry3030'), 'utf8')).joins.filter((j) => j.shape).map((j) => `${j.a} ${j.shape}`);
    assert.deepEqual(ls, ['y3.a L', 'y3.b L', 'y4.a L', 'y4.b L']);
    write('item', { frame: { kind: 'box', inside: [300, 250, 350], profile: '4040-item-8', join: { kind: 'bracket', fitting: 'printed' }, feet: 'foot' } });
    r = probe('item');
    assert.deepEqual(r.bad, []); assert.ok(r.items.some((id) => /-bracket$/.test(id)));
  } finally { done(); }
});

test('generated frames: a portal, which lies in one plane and tips over on its feet alone, is refused by name until its feet are said to be held down, and then checks clean in 2020 joined blind and in 3030 and 4040 by printed gussets', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = (n) => at(`assemblies/${n}.json`);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (n, x) => fs.writeFileSync(file(n), JSON.stringify({ title: n, kind: 'fit', ...x }));
    const probe = (n) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const f = checkAssembly(await buildAssembly('frame/${n}'));
      console.log(JSON.stringify(f.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.code + ': ' + x.text)));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // Two legs and a beam across, in the x-z plane, on levelling feet. A foot stops a leg's end moving and lets it
    // turn, so nothing holds the portal out of its plane: checked as it stands it fails frame.buckling (it tips over,
    // factor 0) and frame.rack finds it free along y, whatever the join. So the generator refuses it by name, before
    // any check, and says how to hold it
    const ask = { kind: 'portal', inside: [400, 350], profile: '2020-misumi-hfs5', join: 'blind', feet: 'levelling' };
    write('portal', { frame: ask });
    cad.refused(/frame: a portal stands in one plane \(x-z\) on its two feet[^]*it tips over sideways \(frame\.buckling fails it, frame\.rack finds it free along y\)\. Say how its feet are held down, bolted to a bench or a wall: "supports": \{ "z1\.a": "fixed", "z2\.a": "fixed" \}; or, to stand free, generate a table or a box/, 'check', 'frame/portal');
    // its feet bolted down, it checks clean: in 2020 joined blind, and by printed gussets in MISUMI's and Bosch's 3030
    // and item's 4040 (each checked with nothing failed or warned)
    const held = { supports: { 'z1.a': 'fixed', 'z2.a': 'fixed' } };
    write('portal', { frame: { ...ask, ...held } });
    assert.deepEqual(probe('portal'), []);
    for (const profile of ['3030-misumi-hfs6', '3030-bosch', '4040-item-8']) {
      write('portal', { frame: { ...ask, profile, join: { kind: 'gusset', fitting: 'printed' }, ...held } });
      assert.deepEqual(probe('portal'), [], profile);
    }
  } finally { done(); }
});

test('frame sizing: a table under a named load gets heavier long rails than legs, each group\'s profile named by the limit that set it, lighter as the limit loosens, and written in to check clean', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = (n) => at(`assemblies/${n}.json`);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (n, x) => fs.writeFileSync(file(n), JSON.stringify({ title: n, kind: 'fit', ...x }));
    const sized = (n) => { const out = cad('frame', `frame/${n}`, '--size', '--json'); try { return JSON.parse(out); } catch { assert.fail(out); } };
    // A table 800 x 500 mm inside, 700 mm clear under its top ring, in 2020 joined blind, on levelling feet: legs z1..z4
    // 720 mm, long rails x1, x2 800 mm, short rails y1, y2 500 mm. The named load: a tabletop's 80 kg, 30 kg at the
    // middle of each long rail and 10 kg at the middle of each short one. The list runs from 1010 to 4040
    const table = { kind: 'table', inside: [800, 500, 700], profile: '2020-misumi-hfs5', join: 'blind', feet: 'levelling' };
    const loads = [{ mass: 30, at: 'x1.top@50%', note: 'the tabletop on the front rail' }, { mass: 30, at: 'x2.top@50%', note: 'on the back rail' }, { mass: 10, at: 'y1.top@50%', note: 'on the left rail' }, { mass: 10, at: 'y2.top@50%', note: 'on the right rail' }];
    const profiles = ['1010-makerbeam', '1515-openbeam', '2020-misumi-hfs5', '2040-misumi-hfs5', '3030-misumi-hfs6', '4040-misumi-hfs8'];
    write('table', { frame: { ...table, size: { profiles } }, loads });
    const r = sized('table'), g = Object.fromEntries(r.groups.map((x) => [x.group, x]));
    assert.ok(r.ok && r.search === 'every', JSON.stringify(r));
    assert.deepEqual(Object.keys(g), ['z1, z2, z3, z4', 'x1, x2', 'y1, y2'], 'beams grouped by themselves: one profile, one direction, one length');
    const legs = g['z1, z2, z3, z4'], rails = g['x1, x2'], short = g['y1, y2'];
    // the long rails' profile is heavier than the legs': 2040 standing on edge (0.88 kg/m) against 2020 (0.5 kg/m)
    assert.deepEqual([legs.choice, rails.choice, short.choice, rails.profile, rails.roll], ['2020-misumi-hfs5', '2040-misumi-hfs5 turned', '2020-misumi-hfs5', '2040-misumi-hfs5', 90]);
    assert.ok(rails.kg / rails.length > legs.kg / legs.length);
    // each choice names what set it: the long rails a limit their next lighter profile breaks; the legs and short rails
    // a join their next lighter profile cannot make (issue 303). Without that, they came out 1515 OpenBeam (0.297 kg/m),
    // whose joins do not go together: a 2040 rail's end takes an M5 screw (its bore, M5 by HFS5's set), and M5's 5 mm
    // does not pass OpenBeam's 3.2 mm slot opening; a 1515 short rail's end takes an M3 button head 5.7 mm across
    // (ISO 7380), which pulls through a 2020 leg's 6 mm slot opening
    assert.deepEqual([legs.governs.limit, legs.governs.where, legs.governs.lighter, rails.governs.limit, rails.governs.lighter, short.governs.limit, short.governs.lighter], ['fit', 'blind join of x1.a to z1.back@710', '1515-openbeam', 'deflection', '2020-misumi-hfs5', 'fit', '1515-openbeam']);
    assert.match(legs.governs.why, /an M5 screw \(2040-misumi-hfs5's bore\) does not pass 1515-openbeam's 3\.2 mm slot opening/);
    assert.match(short.governs.why, /an M3 button head, 5\.7 mm across, pulls through 2020-misumi-hfs5's 6 mm slot opening/);
    assert.ok(rails.governs.broken > 1 && rails.margin >= 1, JSON.stringify(rails));
    for (const x of [legs, short]) assert.ok(x.margin >= 1, `${x.group}: margin ${x.margin}`);
    // Hand, for the long rails' sag under their own 30 kg (294.2 N) at the middle of 800 mm: simply supported it is
    // P L³ / 48 E I and with both ends fixed a quarter of that (Roark's, table 8.1, cases 1e and 1d); the blind joins'
    // springs hold the ends part way. 2040 on edge (I 51 300 mm⁴, E 69 972 MPa): 294.2 x 800³ / (48 x 69 972 x 51 300)
    // = 0.874 mm, and 0.219 mm fixed; its own 0.88 kg/m adds 5 w L⁴ / 384 E I = 0.013 mm at most. Against the limit,
    // 800 / 360 = 2.222 mm. 2020 (I 7420): 6.04 and 1.51 mm, so the lighter rail breaks it
    const sag = 2.222 / rails.margin, lighter = rails.governs.broken * 2.222;
    assert.ok(sag > 0.219 && sag < 1.1 * (0.874 + 0.013), `2040 on edge sags ${sag} mm`);
    assert.ok(lighter > 2.222 && lighter > 1.51 && lighter < 6.04 * 1.1, `2020 sags ${lighter} mm`);
    assert.ok(r.limits.some((l) => l.limit === 'deflection' && l.what === 'x1.top@50%' && Math.abs(l.value - 800 / 360) < 1e-3 && /frame\.sag/.test(l.from)));
    // loosening the limit lightens the result: 6 mm allowed at every load, and the long rails drop to 2020
    write('loose', { frame: { ...table, size: { profiles, limits: { deflection: 6 } } }, loads });
    const lo = sized('loose');
    assert.ok(lo.ok && lo.total < r.total, `${lo.total} kg against ${r.total} kg`);
    assert.equal(lo.groups.find((x) => x.group === 'x1, x2').choice, '2020-misumi-hfs5');
    // beams named in groups take one profile together; the check says the sizing as a finding
    write('grouped', { frame: { ...table, size: { profiles, groups: { rails: ['x1', 'x2', 'y1', 'y2'] } } }, loads });
    const gr = sized('grouped');
    assert.deepEqual(gr.groups.map((x) => [x.group, x.choice]), [['rails', '2040-misumi-hfs5 turned'], ['z1, z2, z3, z4', '2020-misumi-hfs5']]);
    const check = cad.refused('(frame.sag)', 'check', 'frame/table'); // (as drawn, all 2020, its long rails sag)
    assert.match(check, /sized: z1, z2, z3, z4: 2020-misumi-hfs5, 1\.44 kg, set by a join: with 1515-openbeam, blind join of x1\.a to z1\.back@710 does not go together \(an M5 screw[^;]*; x1, x2: 2040-misumi-hfs5 turned, 1\.408 kg, set by deflection/);
    // refused by name
    write('bad', { frame: { ...table, size: { profiles, groups: { rails: ['x1', 'q9'] } } }, loads });
    cad.refused(/frame\.size\.groups\.rails: q9 is not a beam of the frame \(its beams: z1, z2/, 'frame', 'frame/bad', '--size');
    write('bad', { frame: { ...table, size: { profiles: ['2020-nobody'] } }, loads });
    cad.refused(/frame\.size\.profiles: .*2020-nobody/, 'frame', 'frame/bad', '--size');
    write('bad', { frame: { ...table, size: { shape: 1 } }, loads });
    cad.refused(/frame\.size has no "shape": it takes profiles, groups, limits, by/, 'check', 'frame/bad');
    // Written in: one family (MISUMI HFS5, whose joins fit each other), so the written frame builds. The long rails
    // stand 2040 on edge, their tops kept level with the legs' (the ring's centre line drops from 710 to 700 mm), and
    // each blind join at a rail's end becomes one join a bore, at 690 and 710 mm up the leg (the bores 20 mm apart)
    write('hfs5', { frame: { ...table, size: { profiles: ['2020-misumi-hfs5', '2040-misumi-hfs5', '2060-misumi-hfs5', '2080-misumi-hfs5'] } }, loads });
    const unsized = fs.readFileSync(file('hfs5'), 'utf8');
    assert.match(cad('frame', 'frame/hfs5', '--size', '--write', '--dry-run'), /dry run, nothing written: would write projects\/frame\/assemblies\/hfs5\.json$/m);
    assert.equal(fs.readFileSync(file('hfs5'), 'utf8'), unsized, 'a dry run leaves the assembly as it was');
    assert.match(cad('frame', 'frame/hfs5', '--size', '--write'), /wrote projects[\\/]frame[\\/]assemblies[\\/]hfs5\.json: 8 beams given their profiles \(the generated frame written out expanded/);
    const w = JSON.parse(fs.readFileSync(file('hfs5'), 'utf8'));
    assert.deepEqual([w.frame, w.items.find((x) => x.id === 'x1'), w.items.find((x) => x.id === 'z1')], [{ size: { profiles: ['2020-misumi-hfs5', '2040-misumi-hfs5', '2060-misumi-hfs5', '2080-misumi-hfs5'] } },
      { id: 'x1', beam: { profile: '2040-misumi-hfs5' }, from: [20, 10, 700], to: [820, 10, 700], roll: 90 }, { id: 'z1', beam: { profile: '2020-misumi-hfs5', ops: [{ op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }] }, from: [10, 10, 0], to: [10, 10, 720] }]); // (its foot's tap: the generator's)
    assert.deepEqual(w.joins.slice(0, 2), [{ kind: 'blind', a: 'x1.a.1', b: 'z1.back@690' }, { kind: 'blind', a: 'x1.a.2', b: 'z1.back@710' }]);
    // it checks with nothing failing; the one warning is the table's racking, which its 2020 drawing has as well
    const bad = (n, status = 0) => { const r = cad.run('check', `frame/${n}`); assert.equal(r.status, status, r.out); return r.out.split('\n').filter((l) => /^\s*[✗!]/.test(l)); };
    assert.deepEqual(bad('hfs5').map((l) => l.trim().slice(0, 18)), ['! racked along y: '], bad('hfs5').join('\n'));
    write('drawn', { frame: table, loads });
    assert.ok(bad('drawn', 1).some((l) => /racked along y/.test(l)));
    // sized again, the written frame keeps its profiles
    assert.deepEqual(sized('hfs5').groups.map((x) => x.choice), ['2020-misumi-hfs5', '2040-misumi-hfs5', '2020-misumi-hfs5']);
  } finally { done(); }
});

test('frame sizing: a drawn table written in moves a deeper rail down its legs so every join lands on its leg, or writes nothing and says why', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = (n) => at(`assemblies/${n}.json`);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // A table 1200 x 400 mm inside, 750 mm clear, in 2020 joined blind, on levelling feet, 40 kg at the middle of each
    // long rail, drawn by hand (the generated frame expanded): legs 770 mm, the long rails' centre lines at 760 mm, their
    // tops level with the legs' tops at 770. Sized within HFS5 the long rails stand 2060 on edge: 1200 mm at 40 kg
    // (392.3 N) sags 392.3 x 1200³ / (48 x 69 972 x I) simply supported (Roark's, table 8.1, case 1e), against 1200 / 360
    // = 3.333 mm; 2040 on edge breaks it, 2060 does not. Kept on its line, a 2060 would stand 30 mm each side of 760, to
    // 790, past the legs' 770 mm tops, and its end's bores at 740, 760 and 780 mm up the leg (20 mm apart): 780 is off
    // the leg and the frame would not build. So it moves down 20 mm, its top kept at 770, its bores at 720, 740 and 760
    const profiles = ['2020-misumi-hfs5', '2040-misumi-hfs5', '2060-misumi-hfs5', '2080-misumi-hfs5'];
    const loads = [{ mass: 40, at: 'x1.top@50%' }, { mass: 40, at: 'x2.top@50%' }];
    fs.writeFileSync(file('d'), JSON.stringify({ title: 'd', kind: 'fit', frame: { kind: 'table', inside: [1200, 400, 750], profile: '2020-misumi-hfs5', join: 'blind', feet: 'levelling' }, loads }));
    // On cad's default list (11 choices, 3 groups, 1331 designs: by steps) it is sized as the HFS5 list sizes it, though
    // 3030 and a 20 x N lying flat are heavier than a 2040 on edge and weaker this way: the steps pass over them
    const def = JSON.parse(cad('frame', 'frame/d', '--size', '--json'));
    assert.deepEqual([def.ok, def.search, def.groups.map((x) => x.choice), def.total], [true, 'steps', ['2020-misumi-hfs5', '2060-misumi-hfs5 turned', '2020-misumi-hfs5'], 4.964]);
    cad('frame', 'frame/d', '--expand');
    const drawn = JSON.parse(fs.readFileSync(file('d'), 'utf8'));
    assert.deepEqual([drawn.frame, drawn.items.find((x) => x.id === 'x1').from, drawn.joins[0]], [undefined, [20, 10, 760], { kind: 'blind', a: 'x1.a', b: 'z1.back@760' }]);
    drawn.frame = { size: { profiles } };
    fs.writeFileSync(file('d'), JSON.stringify(drawn));
    fs.writeFileSync(file('e'), JSON.stringify({ ...drawn, title: 'e' }));
    assert.match(cad('frame', 'frame/d', '--size', '--write'), /x1, x2 \| 2060-misumi-hfs5 turned[\s\S]*wrote projects[\\/]frame[\\/]assemblies[\\/]d\.json/);
    const w = JSON.parse(fs.readFileSync(file('d'), 'utf8'));
    assert.deepEqual([w.items.find((x) => x.id === 'x1'), w.items.find((x) => x.id === 'z1'), w.items.find((x) => x.id === 'y1')], [{ id: 'x1', beam: { profile: '2060-misumi-hfs5' }, from: [20, 10, 740], to: [1220, 10, 740], roll: 90 },
      { id: 'z1', beam: { profile: '2020-misumi-hfs5', ops: [{ op: 'tap', at: 'a', thread: 'M5', depth: 18.5 }] }, from: [10, 10, 0], to: [10, 10, 770] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [10, 20, 760], to: [10, 420, 760] }]);
    assert.deepEqual(w.joins.filter((j) => /^x1\.a/.test(j.a)).map((j) => j.b), ['z1.back@720', 'z1.back@740', 'z1.back@760']);
    // it builds and checks with nothing failing; the one warning is the table's racking, as drawn
    const bad = cad('check', 'frame/d').split('\n').filter((l) => /^\s*[✗!]/.test(l));
    assert.deepEqual(bad.map((l) => l.trim().slice(0, 18)), ['! racked along y: '], bad.join('\n'));
    // Where the move does not fit the rail's other end (its far legs start at 750 mm and run up, so moving down 20 mm
    // would put the rail's foot 10 mm below them), nothing is written and the refusal names the join and the beam
    const e = JSON.parse(fs.readFileSync(file('e'), 'utf8'));
    for (const it of e.items) if (it.id === 'z2' || it.id === 'z4') { it.from[2] = 750; it.to[2] = 1500; }
    for (const j of e.joins) j.b = j.b.replace(/^(z[24]\.\w+)@760$/, '$1@10');
    fs.writeFileSync(file('e'), JSON.stringify(e));
    const before = fs.readFileSync(file('e'), 'utf8');
    cad.refused(/the sized profiles do not fit as drawn, so nothing is written: join x1\.a\.3 would meet z1 at 780 mm, past its 770 mm/, 'frame', 'frame/e', '--size', '--write');
    assert.equal(fs.readFileSync(file('e'), 'utf8'), before);
  } finally { done(); }
});

test('frame sizing: racking is a limit where the frame asks it, set by a hand figure on a post fixed at its foot; a way nothing holds the frame is said and left out', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = (n) => at(`assemblies/${n}.json`);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (n, x) => fs.writeFileSync(file(n), JSON.stringify({ title: n, kind: 'fit', ...x }));
    const sized = (n) => { const out = cad('frame', `frame/${n}`, '--size', '--json'); try { return JSON.parse(out); } catch { assert.fail(out); } };
    const P = '2020-misumi-hfs5', profiles = ['2020-misumi-hfs5', '3030-misumi-hfs6', '4040-misumi-hfs8'];
    // A post 700 mm tall fixed at its foot, pushed 20 N at its top, allowed 1 mm of sway there (frame.rack). Hand, a
    // cantilever: sway = F H^3 / 3 E I (Roark's, table 8.1, case 1a), E = 69972 MPa (A6N01), I from each set:
    //   2020 (I 7420):   20 x 700^3 / (3 x 69972 x 7420)   = 4.404 mm, 4.40 times over
    //   3030 (I 28300):  20 x 700^3 / (3 x 69972 x 28300)  = 1.155 mm, 1.15 times over
    //   4040 (I 104000): 20 x 700^3 / (3 x 69972 x 104000) = 0.314 mm, 3.18 times inside
    // so the post is 4040, set by racking, its next lighter 3030 breaking it 1.155 times over
    const sway = (I) => (20 * 700 ** 3) / (3 * 69972 * I);
    write('post', { items: [{ id: 'z1', beam: { profile: P }, from: [0, 0, 0], to: [0, 0, 700] }], frame: { supports: { 'z1.a': 'fixed' }, rack: { load: 20, limit: 1 }, size: { profiles } } });
    const r = sized('post'), g = r.groups[0];
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepEqual([g.choice, g.governs.limit, g.governs.lighter, g.governs.where, g.governs.case], ['4040-misumi-hfs8', 'deflection', '3030-misumi-hfs6', 'z1.b', 'racked along x']);
    assert.ok(Math.abs(g.governs.broken / sway(28300) - 1) < 0.01, `3030 sways ${g.governs.broken} mm per mm allowed, ${sway(28300)} by hand`);
    assert.ok(Math.abs(g.margin / (1 / sway(104000)) - 1) < 0.01, `4040: ${g.margin} times inside, ${1 / sway(104000)} by hand`);
    assert.deepEqual(r.limits.filter((l) => /racked/.test(l.what ?? '')).map((l) => [l.where, l.value, l.from]), [['z1.b', 1, 'the assembly\'s frame.rack.limit'], ['z1.b', 1, 'the assembly\'s frame.rack.limit']]);
    assert.match(cad('frame', 'frame/post', '--size'), /4040-misumi-hfs8 \(drawn 2020-misumi-hfs5\) \| [\d.]+ \| racking: with 3030-misumi-hfs6, the sway at z1\.b along x breaks its limit 1\.1[56] times over/);
    // limits.rack in its place: 2 mm lets 3030 through
    write('post2', { items: [{ id: 'z1', beam: { profile: P }, from: [0, 0, 0], to: [0, 0, 700] }], frame: { supports: { 'z1.a': 'fixed' }, size: { profiles, limits: { rack: 2 } } } });
    assert.equal(sized('post2').groups[0].choice, '3030-misumi-hfs6');
    // with no frame.rack and no limits.rack, racking is not a limit: the post stays 2020
    write('post3', { items: [{ id: 'z1', beam: { profile: P }, from: [0, 0, 0], to: [0, 0, 700] }], frame: { supports: { 'z1.a': 'fixed' }, size: { profiles } } });
    assert.equal(sized('post3').groups[0].choice, '2020-misumi-hfs5');
    // A portal in one plane (x-z) on pinned feet: nothing holds it along y, so no profile can; that way is said and
    // left out, and along x it is sized
    write('portal', { items: [{ id: 'z1', beam: { profile: P }, from: [0, 0, 0], to: [0, 0, 400] }, { id: 'z2', beam: { profile: P }, from: [620, 0, 0], to: [620, 0, 400] }, { id: 'x1', beam: { profile: P }, from: [10, 0, 390], to: [610, 0, 390] }],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'z1.back@390' }, { kind: 'blind', a: 'x1.b', b: 'z2.front@390' }], frame: { supports: { 'z1.a': 'pinned', 'z2.a': 'pinned' }, rack: { limit: 5 }, size: { profiles: ['2020-misumi-hfs5', '2040-misumi-hfs5'] } } });
    const pr = sized('portal'), free = pr.limits.find((l) => l.limit === 'rack');
    assert.match(free.what, /^not sized: nothing holds the frame along y, the frame tips over along y \(free at z2\.b: rx\); a brace or fixed feet, not a profile, holds it/);
    assert.ok(pr.limits.some((l) => l.limit === 'deflection' && /racked along x/.test(l.what)));
  } finally { done(); }
});

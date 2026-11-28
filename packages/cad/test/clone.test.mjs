// cad's tests of cad import-kle and cad clone: layouts and published boards brought into a project. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace } from './helpers.mjs';

test('import-kle: a keyboard-layout-editor.com layout into the project, with notes on what it had to change', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.writeFileSync(path.join(ws, 'kle.json'), JSON.stringify([['Esc', { x: 0.5 }, 'F1'], [{ w: 1.5 }, 'Tab', { r: 10 }, 'Q']]));
    const out = cad('import-kle', 'kle.json', 'keys/mine');
    assert.match(out, /made projects[\\/]keys[\\/]layouts[\\/]mine\.json: 2 rows, 4 keys/); // \ on Windows
    assert.match(out, /note: rotated keys/);
    const layout = JSON.parse(fs.readFileSync(path.join(ws, 'projects/keys/layouts/mine.json'), 'utf8'));
    assert.deepEqual(layout.rows[0], ['Esc', { gap: 0.5 }, 'F1']);
    assert.match(cad('import-kle', 'kle.json', 'keys/mine'), /already exists/);
  } finally { done(); }
});

test('cad clone: a published KiCad board into a rule set, its source and licence kept, what boards here can\'t carry said', async () => {
  const { ws, cad, done } = workspace();
  try {
    const board = `(kicad_pcb (version 20211014) (generator pcbnew) (general (thickness 1.6))
      (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal))
      (footprint "R:R_0402" (layer "F.Cu") (at 5 5) (property "Reference" "R1")
        (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "GND")))
      (footprint "J:Pin" (layer "F.Cu") (at 9 5) (property "Reference" "J1")
        (pad "1" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 1) (property pad_prop_castellated) (layers *.Cu) (net 1 "A"))
        (pad "2" thru_hole circle (at 0 -2.54) (size 1.7 1.7) (drill 1) (layers *.Cu) (net 2 "GND")))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
      (zone (net 2) (net_name "GND") (layers "In1.Cu" "B.Cu")))`;
    fs.writeFileSync(path.join(ws, 'tiny.kicad_pcb'), board);
    const out = cad('clone', 'tiny.kicad_pcb', 'tiny', '--source', 'https://example.org/tiny', '--licence', 'CERN-OHL-S-2.0');
    assert.match(out, /made rules[\\/]tiny\.json: 2 parts, 2 nets, 10 × 10 mm, 4 copper layers, planes GND/);
    assert.match(out, /note: planes on inner layers: GND on inner1 \(2 pads\)/);
    assert.match(out, /note: castellated pads on 1 part \(J1\)/);
    assert.match(out, /placement: 0 small parts kept near the pins they serve/);
    assert.match(out, /is reciprocal: boards made from this must be shared under it too/);
    const set = JSON.parse(fs.readFileSync(path.join(ws, 'rules/tiny.json'), 'utf8'));
    assert.equal(set.licence, 'CERN-OHL-S-2.0');
    assert.deepEqual(set.rules.width, { value: 10, unit: 'mm', rule: set.rules.width.rule, kind: 'derived', source: 'https://example.org/tiny', licence: 'CERN-OHL-S-2.0', checked: set.rules.width.checked });
    assert.equal(set.rules.layers.value, 4);
    assert.deepEqual(set.circuit.nets, { A: ['R1.1', 'J1.1'], GND: ['R1.2', 'J1.2'] });
    assert.equal(set.circuit.source.from, 'https://example.org/tiny');
    const { schemaFindings } = await import('../lib/schema.mjs');
    assert.deepEqual(schemaFindings(set, 'rules', 'rules/tiny.json'), [], 'a valid rule set');
    const { resolve } = await import('@rulecad/variables');
    const v = resolve({ uses: ['tiny'], variables: {} }, { load: () => set }).values;
    assert.deepEqual(v.tiny.circuit.nets, set.circuit.nets, 'a design gets the circuit');
    assert.match(cad('clone', 'tiny.kicad_pcb', 'tiny'), /already exists/);
    assert.match(cad('clone', 'tiny.kicad_pcb', 'tiny2'), /no licence given/);
    assert.match(cad('clone', 'tiny.kicad_pcb', 'Tiny'), /usage: cad clone/);
    assert.match(cad('clone', 'missing.kicad_pcb', 'x'), /no file missing\.kicad_pcb/);
  } finally { done(); }
});

test('cad clone keeps each part\'s 3D model: a mesh beside a board read from a file, a box for a STEP-only one', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'lib'));
    fs.writeFileSync(path.join(ws, 'lib/r.wrl'), 'Shape { geometry IndexedFaceSet { coordIndex [0,1,2,-1] coord Coordinate { point [0 0 0,0.2 0 0,0 0.2 0.1] } } }');
    fs.writeFileSync(path.join(ws, 'lib/sock.step'), "DATA; #1=SI_UNIT(.MILLI.,.METRE.); #2=CARTESIAN_POINT('',(-4.,0.,-1.)); #3=CARTESIAN_POINT('',(4.,7.,1.)); ENDSEC;");
    const pad = (n, x) => `(pad "${n}" smd rect (at ${x} 0) (size 0.6 0.5) (layers "F.Cu") (net ${n} "N${n}"))`;
    fs.writeFileSync(path.join(ws, 'b.kicad_pcb'), `(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (footprint "R" (layer "F.Cu") (at 3 5) (property "Reference" "R1") ${pad(1, -0.5)} ${pad(2, 0.5)} (model "\${KIPRJMOD}/lib/r.wrl" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
      (footprint "J" (layer "F.Cu") (at 7 5) (property "Reference" "J1") ${pad(1, -1)} ${pad(2, 1)} (model "\${KIPRJMOD}/lib/sock.step" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
    const out = cad('clone', 'b.kicad_pcb', 'b', '--licence', 'MIT');
    assert.match(out, /3D models: 1 as meshes \(in models\/\), 1 as boxes the size of the part/);
    const set = JSON.parse(fs.readFileSync(path.join(ws, 'rules/b.json'), 'utf8')), models = set.circuit.models;
    assert.equal(models['${KIPRJMOD}/lib/r.wrl'].mesh, 'models/source/r.json');
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, 'models/source/r.json'), 'utf8')).triangles.length, 1);
    assert.deepEqual(models['${KIPRJMOD}/lib/sock.step'].box, { min: [-4, 0, -1], max: [4, 7, 1] });
    assert.doesNotMatch(cad('clone', 'b.kicad_pcb', 'b2', '--licence', 'MIT', '--no-models'), /3D models/);
  } finally { done(); }
});

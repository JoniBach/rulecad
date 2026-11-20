// The module's edge pins as a rule set (rules/thin_picro_pins.json), read from the KiCad board `cad export` made of it:
// each pin's signal, its half hole on the edge and its header hole, in mm from the board's centre, seen from above with
// USB-C at the top (y up). Boards that carry the module (the macropads) place it from these, so they need no build of
// the module (whose route takes 40 minutes). Run it again after a new module release:
//   node scripts/module-pins.mjs exports/thin-picro/module@0.7.1.kicad_pcb 0.7.1 > rules/thin_picro_pins.json
import fs from 'node:fs';
import { fromKicadPcb } from '@rulecad/pcb';

const [file, version] = process.argv.slice(2);
if (!file || !version) { console.error('usage: node scripts/module-pins.mjs <module.kicad_pcb> <version>'); process.exit(1); }
const b = fromKicadPcb(fs.readFileSync(file, 'utf8'));
const xs = b.outline.map((p) => p.x), ys = b.outline.map((p) => p.y);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const r3 = (n) => Math.round(n * 1000) / 1000;
const j2 = b.parts.find((p) => p.ref === 'J2');
// Sea-Picro's net names as the module's signals: GPIO numbers as GP12, the rest by name
const signal = (net) => {
  const n = String(net).replace(/^\//, '');
  const io = n.match(/^(\d+)(_|$)/), analog = n.match(/^A([0-3])$/);
  if (io) return `GP${io[1]}`;
  if (analog) return `GP${26 + Number(analog[1])}`;
  return { '+3V3': '3V3', '+5V': '5V', 'USB+': 'D+', 'USB-': 'D-' }[n] ?? n;
};
const at = (q, dx = 0, dy = 0) => ({ x: r3(j2.x + q.x + dx - cx), y: r3(j2.y + q.y + dy - cy) });
const byPin = {};
for (const q of j2.pads) (byPin[q.pin] ||= []).push(q);
const pins = [];
for (const [pin, qs] of Object.entries(byPin)) {
  const half = qs.find((q) => q.castellated && !q.hole_offset), head = qs.find((q) => q.hole_offset);
  if (!half) continue; // pad 32 (LED5V) is inside the board, not on its edge
  const h = at(half), side = Math.abs(h.y - (Math.min(...ys) - cy)) < 1 ? 'bottom' : h.x < 0 ? 'left' : 'right';
  pins.push({ pin, signal: signal(half.net), side, half: h, ...(head ? { hole: at(head, ...head.hole_offset), pad: { ...at(head), w: r3(head.w), h: r3(head.h) } } : {}) });
}
const order = { left: 0, bottom: 1, right: 2 };
pins.sort((a, b) => order[a.side] - order[b.side] || (a.side === 'left' ? b.half.y - a.half.y : a.side === 'bottom' ? a.half.x - b.half.x : a.half.y - b.half.y));
const length = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys), src = `thin-picro/module@${version}, read from its KiCad board (cad export) by scripts/module-pins.mjs`;
const rule = (value, text, unit = 'mm') => ({ value: r3(value), unit, rule: text, kind: 'design', source: src });
const hole = pins.find((p) => p.hole), halfQ = j2.pads.find((q) => q.castellated && !q.hole_offset), headQ = j2.pads.find((q) => q.hole_offset);
console.log(JSON.stringify({
  _doc: 'The thin RP2040 module\'s edge pins, for boards that carry it: each pin\'s signal (GP12 is GPIO12), its half hole on the board\'s edge and its 0.1 in header hole, in mm from the module\'s centre, seen from above with USB-C at the top. Generated; do not edit by hand.',
  name: 'thin_picro_pins',
  rules: {
    length: rule(length, 'Module length, end to end'),
    height: rule(height, 'Module height, bottom edge to top edge'),
    half_hole: rule(halfQ.hole, 'Castellated half hole: drill'),
    half_pad: rule(halfQ.w, 'Castellated half hole: its round pad'),
    header_hole: rule(headQ.hole, 'Header hole: drill (a 0.64 mm square pin)'),
    header_pad_w: rule(Math.max(headQ.w, headQ.h), 'Header pad: long side, from the half hole inwards'),
    header_pad_h: rule(Math.min(headQ.w, headQ.h), 'Header pad: short side'),
    pitch: rule(2.54, 'Pin pitch'),
  },
  footprints: { module: { pins } }, // v.thin_picro_pins.footprints.module.pins
}, null, 1));

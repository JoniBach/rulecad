// Boards: a design whose .json says "engine": "pcb". Its main(v) returns a board, described as plain data (parts, the
// tracks the rules draw, silkscreen), which circuit.mjs builds into Circuit JSON (tscircuit's open format, no React);
// from that come a solid (previews, fits, the on-screen copy), checks and the files a fab needs. Designs get it as v.pcb.
//
// The keyboard: keys in a matrix, one diode each, and a Pico beside them. Nothing is autorouted: the keyboard router
// draws every track by rule, from the switch's footprint (mx rules) and our margins (the board's track and clear):
//   columns  on the front copper: down each column from pin 2 to pin 2, jogging between the centre post and the left
//            peg; then below the keys, right, and up a lane beside the Pico to its pin
//   diodes   SOD-123s on the back, under each switch below the centre post; pin 1 runs to the anode up a lane right
//            of the right peg
//   rows     on the back copper: cathode to cathode under each row of switches, then right and up or down a lane
//            beside the Pico to its pin
// Diodes point from the switch to the row (COL2ROW in QMK's terms).
import fs from 'node:fs';
import path from 'node:path';
import { circuitJson, bounds } from './circuit.mjs';
export { bounds };
import { loadRuleSet } from '@rulecad/cad/rules';
import jscad from '@jscad/modeling';

// A rows × cols grid of keys at the key pitch, centred on the origin: [{ r, c, x, y, n }], n counting from 1, row 0
// at the back (+y)
export function grid(rows, cols, pitch) {
  const keys = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) keys.push({ r, c, n: r * cols + c + 1, x: (c - (cols - 1) / 2) * pitch, y: ((rows - 1) / 2 - r) * pitch });
  return keys;
}

// ---------- footprints, from rules ----------
const pad = (pin, x, y, hole, outer) => ({ pin, x, y, hole, outer }); // plated, round, relative to the part
const hole = (x, y, d) => ({ x, y, d });

// An MX switch, PCB mount: two pins, the centre post and the two fixing pegs
export function mx(name, x, y, m, sch = {}) {
  return { name, ftype: 'simple_switch', mpn: 'Cherry MX (PCB mount)', x, y, layer: 'top', sch,
    pads: [pad('pin1', m.pcb_pin1_x, m.pcb_pin1_y, m.pcb_pin_drill, m.pcb_pin_pad), pad('pin2', m.pcb_pin2_x, m.pcb_pin2_y, m.pcb_pin_drill, m.pcb_pin_pad)],
    holes: [hole(0, 0, m.pcb_centre_hole), hole(-m.pcb_peg_x, 0, m.pcb_peg_hole), hole(m.pcb_peg_x, 0, m.pcb_peg_hole)],
    courtyard: { w: m.pcb_body, h: m.pcb_body } }; // the housing's footprint on the board
}

// A Raspberry Pi Pico on header pins, USB at the back (+y): pins 1 to 20 down its left edge, 21 to 40 up its right
export function pico(name, x, y, p, sch = {}) {
  const pins = [];
  for (let n = 1; n <= 40; n++) {
    const left = n <= 20, i = left ? n - 1 : 40 - n;
    pins.push(pad(`pin${n}`, (left ? -1 : 1) * p.pin_rows / 2, (19 / 2 - i) * p.pin_pitch, p.pin_hole, p.pin_pad));
  }
  return { name, ftype: 'simple_chip', mpn: 'Raspberry Pi Pico', x, y, layer: 'top', sch, pads: pins, courtyard: { w: p.width, h: p.length } };
}
// Where a Pico pin is, from its centre
export const picoPin = (n, p) => { const left = n <= 20, i = left ? n - 1 : 40 - n; return { x: (left ? -1 : 1) * p.pin_rows / 2, y: (19 / 2 - i) * p.pin_pitch }; };
// The Pico's GPIO pins down one edge: [{ pin, gpio }]
export const picoGpio = (side) => Object.entries(loadRuleSet('pico').rules[`gpio_${side}`].pins).map(([pin, gpio]) => ({ pin: Number(pin), gpio }));

// ---------- any board ----------
// Parts for any board, not only keyboards. Each returns a part as circuit.mjs describes it: put them in board.parts, join
// their pins with board.nets, and set board.autoroute. o (all optional): { rotation: 0 | 90 | 180 | 270, layer,
// mpn, labels: { pin1: 'GND', ... }, sch: { x, y } }. Pin labels name the pins in nets ('U1.GND') and on the schematic.
const chip = (name, x, y, o, more) => ({ name, ftype: 'simple_chip', x, y, layer: o.layer ?? 'top', rotation: o.rotation ?? 0, mpn: o.mpn,
  courtyard: o.courtyard ?? null, sch: { x: o.sch?.x ?? x / 2, y: o.sch?.y ?? y / 2, pinLabels: o.labels ?? {} }, ...more });
const pinNo = (p) => Number(p.pin.replace(/\D/g, ''));
// A rule set's pin map ({ "1": "GND", ... }) as pin labels ({ pin1: 'GND', ... })
const labelsFrom = (set, rule) => Object.fromEntries(Object.entries(loadRuleSet(set).rules[rule].pins).map(([n, l]) => [`pin${n}`, l]));

/**
 * Any standard footprint as a part, by its footprinter name: 'jst4_sh', 'pinrow4', 'soic8', '0603', 'sot23' ...
 * (SMD and through-hole). Pins are numbered as the footprint numbers them.
 * @param {string} name @param {string} footprint @param {number} x @param {number} y @param {object} [o]
 */
export const part = (name, footprint, x, y, o = {}) => chip(name, x, y, o, { footprint });

/**
 * A pin header from rules (r: pitch, drill, pad; row_spacing for two rows): o.pins pins per row, o.rows 1 or 2.
 * Two rows are numbered as a DIP: 1 to n down the left, n + 1 to 2n up the right.
 */
export function header(name, x, y, r, o = {}) {
  const n = o.pins, two = (o.rows ?? 1) === 2, pads = [];
  for (let i = 0; i < n; i++) {
    const py = ((n - 1) / 2 - i) * r.pitch;
    pads.push(pad(`pin${i + 1}`, two ? -r.row_spacing / 2 : 0, py, r.drill, r.pad));
    if (two) pads.push(pad(`pin${2 * n - i}`, r.row_spacing / 2, py, r.drill, r.pad));
  }
  return chip(name, x, y, o, { pads: pads.sort((a, b) => pinNo(a) - pinNo(b)) });
}

/** A Seeed Studio XIAO module (any of the family) on header pins, USB at +y, from the xiao rules; pins labelled D0..D10, 5V, GND, 3V3. */
export const xiao = (name, x, y, r, o = {}) =>
  header(name, x, y, r, { pins: r.pins / 2, rows: 2, mpn: 'Seeed Studio XIAO', courtyard: { w: r.width, h: r.length }, labels: labelsFrom('xiao', 'pins'), ...o });

/** A Qwiic / STEMMA QT socket (JST SH, 4 pins, side entry), from the qwiic rules: the plug goes in from +y, the tabs' side. */
export function qwiic(name, x, y, r, o = {}) {
  const n = r.pins, smd = (k, x, y, w, h) => ({ pin: `pin${k}`, smd: true, hint: String(k), x, y, w, h });
  const pads = Array.from({ length: n }, (_, i) => smd(i + 1, (i - (n - 1) / 2) * r.pitch, r.pad_y, r.pad_w, r.pad_h))
    .concat([-1, 1].map((side, i) => smd(n + i + 1, side * r.tab_x, r.tab_y, r.tab_w, r.tab_h)));
  return chip(name, x, y, { mpn: 'JST SM04B-SRSS-TB', labels: { ...labelsFrom('qwiic', 'pins'), pin5: 'TAB1', pin6: 'TAB2' }, ...o }, { pads });
}

/** A JST PH socket (2.0 mm, through-hole), from the jstph rules: o.pins pins in a row along x (default 2). */
export function jstph(name, x, y, r, o = {}) {
  const n = o.pins ?? 2;
  return chip(name, x, y, { mpn: `JST B${n}B-PH-K-S`, ...o }, { pads: Array.from({ length: n }, (_, i) => pad(`pin${i + 1}`, (i - (n - 1) / 2) * r.pitch, 0, r.drill, r.pad)) });
}

// ---------- the keyboard ----------
// Keys from a layout file (lib/layout.mjs keys, in key units) -> [{ r, c, x, y, u, n, label }] in mm. The matrix row is
// the layout row; the matrix column comes from lining every row up with the widest one: each row's keys take, in order,
// the columns whose positions they are closest to (so a row with fewer keys leaves the columns it has no key for).
export function fromLayout(list, pitch) {
  const ks = list.map((k, i) => ({ label: k.label, u: k.u, n: i + 1, r: k.index, x: k.x * pitch, y: k.y * pitch }));
  const rows = [...new Set(ks.map((k) => k.r))].sort((a, b) => a - b), inRow = (r) => ks.filter((k) => k.r === r).sort((a, b) => a.x - b.x);
  const anchors = inRow(rows.reduce((best, r) => (inRow(r).length > inRow(best).length ? r : best), rows[0])).map((k) => k.x);
  for (const r of rows) {
    const row = inRow(r), n = row.length, M = anchors.length, f = [], from = [];
    // f[i][j]: the least total offset placing the first i + 1 keys with key i on column j (columns rising left to right)
    for (let i = 0; i < n; i++) {
      f[i] = []; from[i] = [];
      for (let j = 0; j < M; j++) {
        const cost = Math.abs(row[i].x - anchors[j]);
        if (i === 0) { f[i][j] = cost; continue; }
        let best = Infinity, at = -1;
        for (let q = 0; q < j; q++) if (f[i - 1][q] < best) { best = f[i - 1][q]; at = q; }
        f[i][j] = best + cost; from[i][j] = at;
      }
    }
    let j = f[n - 1].indexOf(Math.min(...f[n - 1]));
    for (let i = n - 1; i >= 0; i--) { row[i].c = j; j = from[i][j]; }
  }
  return ks;
}

// keyboard(v, keys) -> { board (as circuit.mjs describes it), matrix }; v holds the mx, pico, sod123, m2 and jlcpcb rules and
// the board's variables:
//   track, clear      our track width and the gap we keep to anything
//   margin            board edge beyond the keys (and the Pico, beside them)
//   controller        beside: the Pico on the front, right of the keys, every track drawn by rule (the macropad)
//                     under: the Pico on header pins under the board, components down, turned so its two rows of pins
//                     lie in the gaps either side of key row mcu_row + 1, its USB out the mcu_side edge; the matrix is
//                     drawn by rule and the connections to the Pico autorouted
//   mcu_gap, mcu_side, mcu_row, mount_holes (1: an M2 hole in each corner), thickness
// matrix: each key's row and column and the GPIO each row and column uses, for checks and firmware.
export function keyboard(v, keys) {
  const m = v.mx, p = v.pico, d = v.sod123, lane = v.track + v.clear, half = m.pitch / 2, under = v.controller === 'under';
  const rows = [...new Set(keys.map((k) => k.r))].sort((a, b) => a - b), cols = [...new Set(keys.map((k) => k.c))].sort((a, b) => a - b);
  const keyBox = { left: Math.min(...keys.map((k) => k.x - (k.u || 1) * half)), right: Math.max(...keys.map((k) => k.x + (k.u || 1) * half)),
    top: Math.max(...keys.map((k) => k.y)) + half, bottom: Math.min(...keys.map((k) => k.y)) - half };
  const rowY = (r) => keys.find((k) => k.r === r).y;

  // Around each switch (from its centre): the diode on the back below the post, its anode lane right of the right peg,
  // the row line below the diodes; the column lane on the front between the post and the left peg
  const anodeX = m.pcb_peg_x + m.pcb_peg_hole / 2 + v.clear + v.track / 2;
  const diode = { x: anodeX - d.pad_x, y: -(m.pcb_centre_hole / 2 + v.clear + d.pad_h / 2) }; // on the back, the anode is at +pad_x
  const cathodeX = anodeX - 2 * d.pad_x, lineY = diode.y - d.pad_h / 2 - v.clear - v.track / 2;
  const jogX = -(m.pcb_centre_hole / 2 + (m.pcb_peg_x - m.pcb_peg_hole / 2 - m.pcb_centre_hole / 2) / 2), slant = Math.abs(m.pcb_pin2_x) - Math.abs(jogX);
  const pegEdge = m.pcb_peg_x + m.pcb_peg_hole / 2 + v.clear + v.track / 2; // a track this far from a key's centre clears its pegs
  // Between key rows r and r + 1 the front copper is free from below row r's posts to above row r + 1's pins
  const bandTop = (r) => rowY(r) - m.pcb_centre_hole / 2 - v.clear - v.track / 2;
  const bandBottom = (r) => rowY(r + 1) + m.pcb_pin1_y + m.pcb_pin_pad / 2 + v.clear + v.track / 2;

  // ---- the Pico ----
  const SX = 3, SY = 2.5; // schematic grid
  const other = Object.entries(loadRuleSet('pico').rules.other_pins.pins).map(([pin, name]) => ({ pin: Number(pin), gpio: name }));
  const gpio = [...picoGpio('left'), ...picoGpio('right')];
  const pinLabels = Object.fromEntries([...gpio, ...other].map((g) => [`pin${g.pin}`, g.gpio]));
  const sch = { x: (cols.length + 1.5) * SX, y: -(rows.length - 1) * SY / 2, pinLabels };
  let left = keyBox.left - v.margin, right = keyBox.right + v.margin, pico0, pinAt, pinRows = [];
  if (under) {
    // Its pin rows in the gaps below key rows mcu_row and mcu_row + 1: clear of the row line above (back copper), the
    // next row's pins below and the switch housings either side, and 0.7 in apart
    const r0 = rows[v.mcu_row], r1 = rows[v.mcu_row + 1], r2 = rows[v.mcu_row + 2];
    if (r2 == null) throw new Error(`mcu_row ${v.mcu_row}: the Pico's pins need the two gaps below it, and there are ${rows.length} rows`);
    const keep = p.pin_pad / 2 + v.clear + v.track / 2;
    const bodyKeep = m.pcb_body / 2 + v.clear + p.pin_pad / 2; // header joints stay out from under the switch housings
    const hi = (r) => Math.min(rowY(r) + lineY - keep, rowY(r) - bodyKeep), lo = (r) => Math.max(rowY(r + 1) + m.pcb_pin1_y + m.pcb_pin_pad / 2 + v.clear + p.pin_pad / 2, rowY(r + 1) + bodyKeep);
    const top = Math.min(hi(r0), hi(r1) + p.pin_rows), bottom = Math.max(lo(r0), lo(r1) + p.pin_rows);
    if (top < bottom) throw new Error('the Pico\'s pin rows don\'t fit between the key rows');
    const ya = (top + bottom) / 2, cy = ya - p.pin_rows / 2, toLeft = v.mcu_side !== 'right';
    const cx = toLeft ? left + p.usb_overhang + p.length / 2 : right - p.usb_overhang - p.length / 2;
    // Seen from above the board the Pico is upside down (mirrored), USB towards mcu_side
    pinAt = (n) => { const q = picoPin(n, p), mx_ = -q.x, my = q.y; return toLeft ? { x: cx - my, y: cy + mx_ } : { x: cx + my, y: cy - mx_ }; };
    pico0 = { x: cx, y: cy, toLeft };
    for (const [gap, ys] of [[r0, ya], [r1, ya - p.pin_rows]]) {
      const xs = Array.from({ length: 40 }, (_, i) => pinAt(i + 1)).filter((q) => Math.abs(q.y - ys) < p.pin_pitch / 2).map((q) => q.x).sort((a, b) => a - b);
      pinRows.push({ gap, y: ys, xs, keep });
    }
  } else {
    const cx = keyBox.right + v.mcu_gap + p.width / 2, cy = (keyBox.top + keyBox.bottom) / 2;
    pinAt = (n) => { const q = picoPin(n, p); return { x: cx + q.x, y: cy + q.y }; };
    pico0 = { x: cx, y: cy };
    right = cx + p.width / 2 + v.margin;
  }
  const picoPart = { name: 'U1', ftype: 'simple_chip', mpn: 'Raspberry Pi Pico', x: pico0.x, y: pico0.y, layer: 'top', sch,
    pads: Array.from({ length: 40 }, (_, i) => { const q = pinAt(i + 1); return pad(`pin${i + 1}`, q.x - pico0.x, q.y - pico0.y, p.pin_hole, p.pin_pad); }),
    courtyard: under ? null : { w: p.width, h: p.length } };

  const parts = [picoPart], traces = [];
  const pts = (list) => list.map(([x, y]) => ({ x, y })); // a track's corners between its two pads, on the board
  for (const k of keys) {
    parts.push(mx(`K${k.n}`, k.x, k.y, m, { x: k.c * SX, y: -k.r * SY }),
      { name: `D${k.n}`, ftype: 'simple_diode', footprint: 'sod123', mpn: '1N4148W', x: k.x + diode.x, y: k.y + diode.y, layer: 'bottom', sch: { x: k.c * SX + 1, y: -k.r * SY - 0.8 } });
    traces.push({ from: [`D${k.n}`, 'anode'], to: [`K${k.n}`, 'pin1'], width: v.track, path: pts([[k.x + anodeX, k.y + m.pcb_pin1_y]]) });
  }

  // ---- rows: cathode to cathode along the back ----
  for (const r of rows) {
    const ks = keys.filter((k) => k.r === r).sort((a, b) => a.x - b.x);
    for (let i = 1; i < ks.length; i++) {
      const a = ks[i - 1], b = ks[i];
      traces.push({ from: [`D${a.n}`, 'cathode'], to: [`D${b.n}`, 'cathode'], width: v.track, path: pts([[a.x + cathodeX, a.y + lineY], [b.x + cathodeX, b.y + lineY]]) });
    }
  }

  // ---- columns: pin 2 to pin 2 down the front ----
  // Down the lane between post and left peg; between rows, across the free band to the next key's lane (a key of
  // another column in the way: through the gap between two keys of that row); past the Pico's pins, between two of them
  const corridor = (r, x) => {
    const ks = keys.filter((k) => k.r === r).sort((a, b) => a.x - b.x), gaps = [];
    for (let i = 1; i < ks.length; i++) gaps.push([ks[i - 1].x + pegEdge, ks[i].x - pegEdge]);
    gaps.push([-Infinity, ks[0].x - pegEdge], [ks.at(-1).x + pegEdge, Infinity]);
    const ok = gaps.filter(([a, b]) => b - a > 0).map(([a, b]) => Math.min(Math.max(x, a + v.track), b - v.track));
    return ok.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
  };
  const throughPins = (pr, a, b, t) => {
    if (Math.max(a, b) < pr.xs[0] - p.pin_pitch / 2 || Math.min(a, b) > pr.xs.at(-1) + p.pin_pitch / 2) return null;
    const mids = pr.xs.slice(1).map((x, i) => (x + pr.xs[i]) / 2);
    return mids.sort((u, w) => Math.abs(u - t) - Math.abs(w - t))[0];
  };
  const columnPath = (A, B) => {
    let x = A.x + jogX;
    const pts = [[x, A.y + m.pcb_pin2_y - slant]];
    for (let r = A.r; r < B.r; r++) {
      const next = rows[rows.indexOf(r) + 1], target = next === B.r ? B.x + jogX : corridor(next, x);
      pts.push([x, bandTop(r)]);
      const pr = pinRows.find((q) => q.gap === r), xg = pr && throughPins(pr, x, target, target);
      if (xg != null) pts.push([xg, pr.y + pr.keep], [xg, pr.y - pr.keep]);
      pts.push([target, bandBottom(r)]);
      x = target;
      if (next === B.r) break;
      r = next - 1;
    }
    pts.push([x, B.y + m.pcb_pin2_y + slant]);
    return pts;
  };
  for (const c of cols) {
    const ks = keys.filter((k) => k.c === c).sort((a, b) => a.r - b.r);
    for (let j = 1; j < ks.length; j++) {
      const a = ks[j - 1], b = ks[j];
      traces.push({ from: [`K${a.n}`, 'pin2'], to: [`K${b.n}`, 'pin2'], width: v.track, path: pts(columnPath(a, b)) });
    }
  }

  // ---- the Pico's connections ----
  const rowPin = {}, colPin = {};
  if (under) {
    // Each row and column takes the free GPIO nearest it, nearest pairs first; then a track the autorouter finds
    const ends = [...rows.map((r) => ({ kind: 'row', id: r, at: keys.filter((k) => k.r === r).map((k) => ({ x: k.x + cathodeX, y: k.y + diode.y, sel: [`D${k.n}`, 'cathode'] })) })),
      ...cols.map((c) => ({ kind: 'col', id: c, at: keys.filter((k) => k.c === c).map((k) => ({ x: k.x + m.pcb_pin2_x, y: k.y + m.pcb_pin2_y, sel: [`K${k.n}`, 'pin2'] })) }))];
    const free = [...gpio];
    const dist = (e, g) => Math.min(...e.at.map((q) => Math.hypot(q.x - pinAt(g.pin).x, q.y - pinAt(g.pin).y)));
    const left_ = [...ends];
    while (left_.length) {
      if (!free.length) throw new Error(`the Pico has ${gpio.length} GPIO; this matrix needs ${ends.length}`);
      let best = null;
      for (const e of left_) for (const g of free) { const dd = dist(e, g); if (!best || dd < best.dd) best = { e, g, dd }; }
      left_.splice(left_.indexOf(best.e), 1); free.splice(free.indexOf(best.g), 1);
      (best.e.kind === 'row' ? rowPin : colPin)[best.e.id] = best.g;
      const q = pinAt(best.g.pin), near = [...best.e.at].sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
      traces.push({ from: near.sel, to: ['U1', `pin${best.g.pin}`], width: v.track }); // no path: the autorouter's
    }
  } else {
    // Beside: rows take the free left-edge pins nearest their row line, columns the lowest of the rest; every track
    // drawn: rows right then up or down a lane beside the Pico (back), columns below the keys and up a lane (front),
    // the leftmost column lowest and nearest the Pico, so no two cross
    const nearPins = pinAt(1).x - p.pin_pad / 2 - v.clear - v.track / 2, free = picoGpio('left'), take = (pin) => free.splice(free.findIndex((g) => g.pin === pin), 1)[0];
    for (const r of rows) {
      const y = rowY(r) + lineY, best = [...free].sort((a, b) => Math.abs(pinAt(a.pin).y - y) - Math.abs(pinAt(b.pin).y - y))[0];
      if (!best) throw new Error(`the Pico's left edge has no GPIO left for row ${r}`);
      rowPin[r] = take(best.pin);
    }
    const lowest = [...free].sort((a, b) => pinAt(a.pin).y - pinAt(b.pin).y);
    if (lowest.length < cols.length) throw new Error(`${cols.length} columns need ${cols.length} more GPIO on the Pico's left edge; ${lowest.length} are left`);
    cols.forEach((c, i) => { colPin[c] = lowest[i]; });
    for (const r of rows) {
      const last = keys.filter((k) => k.r === r).sort((a, b) => a.x - b.x).at(-1), pinY = pinAt(rowPin[r].pin).y;
      traces.push({ from: [`D${last.n}`, 'cathode'], to: ['U1', `pin${rowPin[r].pin}`], width: v.track,
        path: pts([[last.x + cathodeX, last.y + lineY], [nearPins - lane, last.y + lineY], [nearPins - lane, pinY]]) });
    }
    cols.forEach((c, i) => {
      const last = keys.filter((k) => k.c === c).sort((a, b) => b.r - a.r)[0], depth = keyBox.bottom - (cols.length - i) * lane, laneX = nearPins - i * lane;
      traces.push({ from: [`K${last.n}`, 'pin2'], to: ['U1', `pin${colPin[c].pin}`], width: v.track,
        path: pts([[last.x + jogX, last.y + m.pcb_pin2_y - slant], [last.x + jogX, depth], [laneX, depth], [laneX, pinAt(colPin[c].pin).y]]) });
    });
  }

  // ---- the board ----
  const lanesBelow = under ? 0 : cols.length * lane;
  const top = Math.max(keyBox.top, under ? -Infinity : pico0.y + p.length / 2) + v.margin;
  const bottom = Math.min(keyBox.bottom - lanesBelow, under ? Infinity : pico0.y - p.length / 2) - v.margin;
  const cx = (left + right) / 2, cy = (top + bottom) / 2, inset = v.margin / 2;
  const corners = v.mount_holes ? [[left + inset, top - inset], [right - inset, top - inset], [left + inset, bottom + inset], [right - inset, bottom + inset]] : [];
  // Silkscreen for whoever solders it: the Pico's outline (on the side it's fitted) with USB marked, each switch's
  // outline, and a bar at each diode's cathode (on the back, between its pads, next to the cathode)
  const silk = v.jlcpcb.silk_line * 2, text = v.jlcpcb.silk_text * 2;
  const rect = (x, y, w, ht, layer) => ({ rect: { x, y, w, h: ht }, layer });
  const outline = (x, y, w, ht, layer = 'top') => [rect(x, y + ht / 2, w, silk, layer), rect(x, y - ht / 2, w, silk, layer), rect(x - w / 2, y, silk, ht, layer), rect(x + w / 2, y, silk, ht, layer)];
  const usbAt = under ? { x: pico0.x + (pico0.toLeft ? -1 : 1) * (p.length / 2 - text * 1.5), y: pico0.y } : { x: pico0.x, y: pico0.y + p.length / 2 - text };
  const marks = [...(under ? outline(pico0.x, pico0.y, p.length, p.width, 'bottom') : outline(pico0.x, pico0.y, p.width, p.length)),
    { text: 'USB', x: usbAt.x, y: usbAt.y, size: text, layer: under ? 'bottom' : 'top' },
    ...keys.flatMap((k) => outline(k.x, k.y, m.pcb_body, m.pcb_body)),
    ...keys.map((k) => rect(k.x + cathodeX + d.pad_w / 2 + silk * 2, k.y + diode.y, silk, d.pad_h, 'bottom')),
    ...(v.margin >= text * 2 ? [{ text: 'rulecad: diodes point to the rows', x: (keyBox.left + keyBox.right) / 2, y: bottom + v.margin / 2, size: text, layer: 'bottom' }] : [])];
  const board = { center: { x: cx, y: cy }, width: right - left, height: top - bottom, thickness: v.thickness, autoroute: under,
    parts, traces, silk: marks, holes: corners.map(([x, y]) => hole(x, y, v.m2.clearance)) };
  const matrix = {
    keys: keys.map((k) => ({ key: `K${k.n}`, ...(k.label ? { label: k.label } : {}), row: k.r, col: k.c })),
    rows: Object.fromEntries(rows.map((r) => [r, rowPin[r].gpio])), cols: Object.fromEntries(cols.map((c) => [c, colPin[c].gpio])),
    ...(under ? { pico: { x: pico0.x, y: pico0.y, usb: pico0.toLeft ? 'left' : 'right' } } : {}),
  };
  return { board, matrix };
}

// ---------- footprints from KiCad ----------
/**
 * A KiCad footprint (.kicad_mod text) as pad data: { pads, courtyard: { w, h } }, in mm, y up (KiCad's y is down).
 * Keep the result in a rule set's "footprints" (with its source), and place it with footprint(): a design never
 * reads files. SMD pads: { pin, smd: true, x, y, w, h } (a turned pad's w and h swapped); plated holes: { pin, x, y,
 * hole, outer }. Pads named alike (several GND pads) keep their name; unnamed pads (mechanical) are left out.
 * @param {string} text @returns {{ pads: object[], courtyard: { w: number, h: number } | null }}
 */
export function fromKicad(text) {
  const num = (s) => Number(s), pads = [];
  for (const m of text.matchAll(/\(pad\s+"([^"]*)"\s+(smd|thru_hole|np_thru_hole)\s+(\w+)([\s\S]*?)\(layers/g)) {
    const [, name, kind, , rest] = m;
    if (!name) continue;
    const at = rest.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)/), sz = rest.match(/\(size\s+([-\d.]+)\s+([-\d.]+)\)/);
    if (!at || !sz) continue;
    const turn = ((num(at[3] || 0) % 180) + 180) % 180 === 90, w = num(turn ? sz[2] : sz[1]), h = num(turn ? sz[1] : sz[2]);
    const x = +num(at[1]).toFixed(4), y = +(-num(at[2])).toFixed(4);
    if (kind === 'smd') pads.push({ pin: name, smd: true, x, y, w, h });
    else if (kind === 'thru_hole') { const d = rest.match(/\(drill\s+(?:oval\s+)?([-\d.]+)/); pads.push({ pin: name, x, y, hole: num(d[1]), outer: Math.max(w, h) }); }
  }
  const pts = text.split(/\n\s*(?=\(fp_|\(pad|\(model|\(zone)/).filter((el) => /^\(fp_(?:line|rect|poly)/.test(el) && /\(layer\s+"F\.CrtYd"\)/.test(el)) // the courtyard's corners
    .flatMap((el) => [...el.matchAll(/\((?:start|end|xy)\s+([-\d.]+)\s+([-\d.]+)\)/g)].map((m) => [num(m[1]), num(m[2])]));
  const span = (k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
  return { pads, courtyard: pts.length ? { w: +span(0).toFixed(3), h: +span(1).toFixed(3) } : null };
}

/**
 * A part from footprint data (fromKicad's, kept in a rule set): pads as given, pins named by pad name (GND pads
 * alike are joined in the part); data.labels ({ pin1: 'GND' }) and data.mpn name them. o: as part() (rotation,
 * layer, mpn, labels, sch).
 */
export function footprint(name, data, x, y, o = {}) {
  const pads = data.pads.map((p, i) => p.smd ? { pin: `pin${p.pin}`, smd: true, hint: String(p.pin), x: p.x, y: p.y, w: p.w, h: p.h } : pad(`pin${p.pin}`, p.x, p.y, p.hole, p.outer));
  return chip(name, x, y, { courtyard: data.courtyard, mpn: data.mpn, labels: data.labels, ...o }, { pads });
}

// ---------- whole boards from KiCad: clones ----------
// A published board (a .kicad_pcb, KiCad 6 or later) read as a circuit: its parts with their pads, its nets, its planes and
// its outline. Keep the result in a rule set's "circuit" (cad clone writes it, with the source and its licence), and
// build boards from it with clone(): the circuit stays the source's, and the layout is redrawn by rules. sameCircuit()
// checks that a board still joins exactly the pins the source joins.

// KiCad's files are S-expressions: (name value (child ...) ...) as nested arrays, strings unquoted
function sexpr(text) {
  const stack = [[]];
  for (const t of text.match(/"(?:[^"\\]|\\.)*"|\(|\)|[^\s()"]+/g) || []) {
    if (t === '(') stack.push([]);
    else if (t === ')') { const l = stack.pop(); if (!stack.length) throw new Error('not a KiCad file: a ")" closes nothing'); stack.at(-1).push(l); }
    else stack.at(-1).push(t[0] === '"' ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t);
  }
  if (stack.length !== 1) throw new Error('not a KiCad file: a "(" is never closed');
  return stack[0][0];
}
const kidsOf = (l, name) => l.filter((c) => Array.isArray(c) && c[0] === name);
const kidOf = (l, name) => kidsOf(l, name)[0];
const r4 = (n) => Math.round(n * 1e4) / 1e4 || 0; // 0.1 mm to the micron, and never -0
const turnOf = (deg) => ((Math.round(deg * 1e3) / 1e3 % 360) + 360) % 360;

// Edge.Cuts pieces ({ a, b } lines, arcs already cut into lines) joined end to end into closed loops
function loops(pieces, tol = 0.005) {
  const same = (p, q) => Math.abs(p.x - q.x) < tol && Math.abs(p.y - q.y) < tol, out = [], left = [...pieces];
  while (left.length) {
    const loop = [left[0].a, left[0].b]; left.shift();
    for (let found = true; found && !same(loop[0], loop.at(-1));) {
      found = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i], end = loop.at(-1);
        if (same(s.a, end) || same(s.b, end)) { loop.push(same(s.a, end) ? s.b : s.a); left.splice(i, 1); found = true; break; }
      }
    }
    if (same(loop[0], loop.at(-1)) && loop.length > 3) out.push(loop.slice(0, -1));
    else return null; // an open edge: the outline isn't one closed shape
  }
  return out;
}
const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

/**
 * A KiCad board (.kicad_pcb text, KiCad 6 or later) as a circuit, in mm, y up, centred on the outline's bounds:
 * { layers, width, height, outline, parts, nets, planes, holes, source }. Each part keeps its place on the source
 * board ({ ref, footprint, value, mpn, lcsc, x, y, rotation, layer }) and its pads in its own frame, as seen from
 * the side it's on ({ pin, x, y, w, h, angle, smd, shape, net } and, for holes, hole, hole_offset, castellated).
 * nets: { name: ['U1.3', 'C4.1'] }, part and pad, for nets joining two pads or more. planes: nets the source fills on
 * whole layers ({ GND: ['In1.Cu', 'B.Cu'] }). source: what the file says beyond the circuit (track and via counts).
 * @param {string} text @returns {object}
 */
export function fromKicadPcb(text) {
  const root = sexpr(text);
  if (root?.[0] !== 'kicad_pcb') throw new Error('not a KiCad board: a .kicad_pcb starts with (kicad_pcb');
  if (!kidOf(root, 'footprint')) throw new Error('no footprints in this board: KiCad 6 or later is needed (older files call them "module": open and save it in KiCad 6+)');
  const layers = kidOf(root, 'layers').slice(1).filter((l) => l[2] === 'signal').map((l) => l[1]);
  const num = Number, pieces = [], holes = [], raw = [];
  const edge = (l, place) => { // a line or an arc on Edge.Cuts, as straight pieces in the board's frame
    if ((kidOf(l, 'layer')?.[1]) !== 'Edge.Cuts') return;
    const pt = (k) => { const p = kidOf(l, k); return p && place(num(p[1]), num(p[2])); };
    const a = pt('start'), b = pt('end'), m = pt('mid');
    if (!a || !b) return;
    if (!m) return pieces.push({ a, b });
    const ax = b.x - a.x, ay = b.y - a.y, bx = m.x - a.x, by = m.y - a.y, d = 2 * (ax * by - ay * bx); // the circle through a, m, b
    const cx = a.x + (by * (ax * ax + ay * ay) - ay * (bx * bx + by * by)) / d, cy = a.y + (ax * (bx * bx + by * by) - bx * (ax * ax + ay * ay)) / d;
    const r = Math.hypot(a.x - cx, a.y - cy), at = (p) => Math.atan2(p.y - cy, p.x - cx), t0 = at(a);
    let t1 = at(b), tm = at(m);
    const norm = (t) => ((t - t0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    t1 = norm(t1); tm = norm(tm); const sweep = tm < t1 ? t1 : t1 - 2 * Math.PI, n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
    let prev = a;
    for (let i = 1; i <= n; i++) { const t = t0 + (sweep * i) / n, q = i === n ? b : { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }; pieces.push({ a: prev, b: q }); prev = q; }
  };
  for (const g of root) if (Array.isArray(g) && ['gr_line', 'gr_arc'].includes(g[0])) edge(g, (x, y) => ({ x, y }));
  for (const g of kidsOf(root, 'gr_rect')) if (kidOf(g, 'layer')?.[1] === 'Edge.Cuts') {
    const s = kidOf(g, 'start'), e = kidOf(g, 'end'), [x0, y0, x1, y1] = [s[1], s[2], e[1], e[2]].map(num);
    pieces.push({ a: { x: x0, y: y0 }, b: { x: x1, y: y0 } }, { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } }, { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } }, { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } });
  }
  for (const f of kidsOf(root, 'footprint')) {
    const at = kidOf(f, 'at'), fx = num(at[1]), fy = num(at[2]), deg = num(at[3] || 0), t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const bottom = (kidOf(f, 'layer')?.[1]) === 'B.Cu';
    const place = (x, y) => ({ x: fx + x * c + y * s, y: fy - x * s + y * c }); // KiCad's frame: y down, angles counter-clockwise on screen
    for (const l of [...kidsOf(f, 'fp_line'), ...kidsOf(f, 'fp_arc')]) edge(l, place);
    const props = Object.fromEntries(kidsOf(f, 'property').map((p) => [String(p[1]).trim(), p[2]]));
    const ref = props.Reference ?? kidsOf(f, 'fp_text').find((x) => x[1] === 'reference')?.[2];
    const pads = [];
    for (const p of kidsOf(f, 'pad')) {
      const [, name, kind, shape] = p, pa = kidOf(p, 'at'), sz = kidOf(p, 'size'), drill = kidOf(p, 'drill');
      if (kind === 'np_thru_hole') { const q = place(num(pa[1]), num(pa[2])); holes.push({ x: q.x, y: q.y, d: num(drill[1]) }); continue; }
      if (!name) continue; // unnamed pads are mechanical: no net
      // A pad's place in the part's frame, y up, seen from the side the part is on: (x, -y) on top; a part on the back
      // is stored mirrored by KiCad, and turned the other way, so (-x, -y) with the turn negated (see rotation below)
      const px = num(pa[1]), py = num(pa[2]), angle = turnOf((num(pa[3] || 0) - deg) * (bottom ? -1 : 1));
      const pad = { pin: name, x: r4(bottom ? -px : px), y: r4(-py), w: num(sz[1]), h: num(sz[2]), angle, smd: kind === 'smd', shape, net: kidOf(p, 'net')?.[2] || null };
      if (drill) {
        const d = drill.slice(1), oval = d[0] === 'oval', ds = d.filter((x) => !Array.isArray(x) && x !== 'oval').map(num), off = kidOf(drill, 'offset');
        pad.hole = Math.min(...ds);
        if (oval && ds.length > 1 && ds[0] !== ds[1]) pad.hole_size = [ds[0], ds[1]];
        if (off && (num(off[1]) || num(off[2]))) pad.hole_offset = [r4(num(off[1]) * (bottom ? -1 : 1)), r4(-num(off[2]))];
      }
      if (p.some((x) => Array.isArray(x) && x[0] === 'property' && x[1] === 'pad_prop_castellated')) pad.castellated = true;
      pads.push(pad);
    }
    if (!pads.length) continue; // a logo, a picture: nothing to connect
    raw.push({ ref, footprint: f[1], value: props.Value, mpn: props.MPN ?? props['Manufacturer Part Number'], lcsc: props.LCSC, x: fx, y: fy, rotation: turnOf(bottom ? -deg : deg), layer: bottom ? 'bottom' : 'top', pads });
  }
  // The outline: the loops on Edge.Cuts, the biggest outside (counter-clockwise, y up); without one closed loop, its bounds
  const found = loops(pieces);
  const all = pieces.flatMap((p) => [p.a, p.b]);
  if (!all.length) throw new Error('no board outline: nothing is drawn on Edge.Cuts');
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const to = (p) => ({ x: r4(p.x - cx), y: r4(cy - p.y) }); // into the circuit's frame: centred, y up
  let outline = null, cutouts = [];
  if (found) {
    const shapes = found.map((l) => l.map(to)).map((l) => (area(l) < 0 ? l.reverse() : l)).sort((a, b) => area(b) - area(a));
    [outline, ...cutouts] = shapes;
  }
  const parts = raw.map((p) => ({ ...p, ...to(p) }));
  const nets = {};
  for (const p of parts) for (const q of p.pads) if (q.net) (nets[q.net] ||= new Set()).add(`${p.ref}.${q.pin}`);
  const planes = {};
  for (const z of kidsOf(root, 'zone')) {
    const net = kidOf(z, 'net_name')?.[1], on = [...(kidOf(z, 'layers')?.slice(1) || []), ...(kidOf(z, 'layer') ? [kidOf(z, 'layer')[1]] : [])];
    if (net) planes[net] = [...new Set([...(planes[net] || []), ...on])];
  }
  return {
    layers: layers.length, copper: layers, width: r4(Math.max(...xs) - Math.min(...xs)), height: r4(Math.max(...ys) - Math.min(...ys)),
    thickness: num(kidOf(kidOf(root, 'general') || [], 'thickness')?.[1]) || null,
    outline, cutouts, parts,
    nets: Object.fromEntries(Object.entries(nets).filter(([, s]) => s.size > 1).map(([k, s]) => [k, [...s]])),
    planes, holes: holes.map((h) => ({ ...to(h), d: h.d })),
    source: { generator: kidOf(root, 'generator')?.[1], version: kidOf(root, 'version')?.[1], tracks: kidsOf(root, 'segment').length + kidsOf(root, 'arc').length, vias: kidsOf(root, 'via').length }
  };
}

/**
 * A circuit's parts and nets (fromKicadPcb's, kept in a rule set) for a board, each part where the source put it: put
 * them in board.parts and board.nets. o.planes: nets left out of the routing, for planes to join (default: the nets
 * the source fills on inner layers, when it has them). Returns { parts, nets, holes, outline, notes }: notes say what
 * this board can't carry yet (castellated pads, oval holes), in plain words.
 * @param {object} circuit @param {{ planes?: string[] }} [o]
 */
export function clone(circuit, o = {}) {
  const inner = (l) => /^In\d+\.Cu$/.test(l);
  const planes = o.planes ?? Object.entries(circuit.planes || {}).filter(([, ls]) => ls.some(inner)).map(([n]) => n);
  const notes = [], castellated = new Set(), oval = new Set(), offset = new Set();
  const parts = circuit.parts.map((p) => {
    const quarterTurn = p.rotation % 90 === 0, t = (p.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const pads = p.pads.filter((q) => !(q.castellated && castellated.add(p.ref))).map((q) => {
      const pin = `pin${q.pin}`;
      if (!q.smd) {
        if (q.hole_size || q.w !== q.h) oval.add(p.ref);
        if (q.hole_offset) offset.add(p.ref);
        const at = quarterTurn ? { x: q.x, y: q.y } : { x: q.x * c - q.y * s, y: q.x * s + q.y * c };
        return { pin, hint: q.pin, ...at, hole: q.hole, outer: Math.min(q.w, q.h) };
      }
      const turn = q.angle + (quarterTurn ? 0 : p.rotation);
      if (turn % 90 === 0) { // a rectangle, its sides swapped by a quarter turn of its own
        const sw = turn % 180 !== 0, at = quarterTurn ? { x: q.x, y: q.y } : { x: q.x * c - q.y * s, y: q.x * s + q.y * c };
        return { pin, smd: true, hint: q.pin, ...at, w: sw ? q.h : q.w, h: sw ? q.w : q.h };
      }
      const a = (turn * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), at = quarterTurn ? { x: q.x, y: q.y } : { x: q.x * c - q.y * s, y: q.x * s + q.y * c };
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [r4(at.x + (u * q.w / 2) * ca - (v * q.h / 2) * sa), r4(at.y + (u * q.w / 2) * sa + (v * q.h / 2) * ca)]);
      return { pin, smd: true, hint: q.pin, ...at, points: pts }; // corners relative to the part, as circuit.mjs takes them
    });
    return { name: p.ref, ftype: 'simple_chip', x: p.x, y: p.y, layer: p.layer, rotation: quarterTurn ? p.rotation : 0, mpn: p.lcsc ?? p.mpn, courtyard: null, sch: { x: p.x / 2, y: p.y / 2, pinLabels: {} }, pads };
  }).filter((p) => p.pads.length);
  const have = new Set(parts.flatMap((p) => p.pads.map((q) => `${p.name}.${q.pin}`))), dropped = new Set();
  const nets = Object.fromEntries(Object.entries(circuit.nets).filter(([n]) => !planes.includes(n))
    .map(([n, pins]) => [n, pins.map((x) => { const i = x.indexOf('.'); return `${x.slice(0, i)}.pin${x.slice(i + 1)}`; })
      .filter((x) => have.has(x) || !dropped.add(x))]).filter(([, pins]) => pins.length > 1));
  const plural = (set, one, many) => `${set.size} ${set.size === 1 ? one : many} (${[...set].join(', ')})`;
  if (planes.length) notes.push(`left to planes, not routed: ${planes.map((n) => `${n} (${circuit.nets[n]?.length ?? 0} pads)`).join(', ')}. Boards here have 2 layers so far: these nets need a plane or a pour joined to every pad`);
  if (castellated.size) notes.push(`castellated pads left out, on ${plural(castellated, 'part', 'parts')}: they sit half off the board's edge, which boards here can't carry yet`);
  if (oval.size) notes.push(`oval pads drawn round, at their narrow width, on ${plural(oval, 'part', 'parts')}`);
  if (dropped.size) notes.push(`${dropped.size} pins with no pad left on this board are out of their nets: ${[...dropped].slice(0, 5).join(', ')}`);
  if (offset.size) notes.push(`holes set off-centre in their pads drawn centred, on ${plural(offset, 'part', 'parts')}`);
  return { parts, nets, holes: circuit.holes, outline: circuit.outline, notes };
}

// A part's pads on the board (the circuit's frame), as render places them: turned, and mirrored in x on the back
export function padsOnBoard(part) {
  const m = part.layer === 'bottom' ? -1 : 1, t = (part.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return part.pads.map((q) => ({ ...q, bx: r4(part.x + m * (c * q.x - s * q.y)), by: r4(part.y + (s * q.x + c * q.y)) }));
}

/**
 * Placement rules learnt from the source: each small part (fewer than 4 pads: resistors, capacitors, LEDs) stays near
 * the pad of a bigger part (an anchor: a chip, a connector, a crystal) on its most particular net (the one joining the
 * fewest pins), the nearest such pad on the source board: a decoupling capacitor by its power pin, a crystal's capacitors by the crystal. Each rule:
 * { part, anchor, pin, net, source (mm, pad centre to pad centre on the source), max (mm) }. max allows a quarter more,
 * and at least 0.5 mm: edit it in the rule set to be stricter or freer. o.anchor: the fewest pads an anchor has (4).
 * @param {object} circuit @param {{ anchor?: number }} [o] @returns {object[]}
 */
export function learnPlacement(circuit, o = {}) {
  const min = o.anchor ?? 4, anchors = circuit.parts.filter((p) => p.pads.length >= min), rules = [];
  const anchorPads = anchors.flatMap((a) => padsOnBoard(a).filter((q) => q.net).map((q) => ({ ...q, ref: a.ref })));
  for (const p of circuit.parts.filter((x) => x.pads.length < min)) {
    let best = null; // on its most particular net (the fewest pins: a crystal's pin before GND), then the nearest pad
    for (const q of padsOnBoard(p)) for (const a of anchorPads) {
      if (!q.net || a.net !== q.net) continue;
      const d = Math.hypot(a.bx - q.bx, a.by - q.by), n = circuit.nets[q.net]?.length ?? Infinity;
      if (!best || n < best.n || (n === best.n && d < best.d)) best = { d, n, q, a };
    }
    if (best) rules.push({ part: p.ref, anchor: best.a.ref, pin: best.a.pin, net: best.q.net, source: r4(best.d), max: r4(Math.max(best.d * 1.25, best.d + 0.5)) });
  }
  return rules;
}

/**
 * The circuit with some parts moved, each small part going with the anchor its placement rule names (turned with it,
 * kept the same way round): moves { U3: { x, y, rotation } } (any of the three; rotation in quarter turns from above).
 * Parts not moved, and not following a moved anchor, stay where the source put them. Returns a new circuit.
 * @param {object} circuit @param {Record<string, { x?: number, y?: number, rotation?: number }>} moves @param {object[]} [rules]
 */
export function arrange(circuit, moves, rules = circuit.placement || learnPlacement(circuit)) {
  const byRef = new Map(circuit.parts.map((p) => [p.ref, p])), follow = new Map(rules.map((r) => [r.part, r.anchor]));
  for (const ref of Object.keys(moves)) if (!byRef.has(ref)) throw new Error(`arrange: no part ${ref} in the circuit`);
  const moved = (p) => {
    const to = moves[p.ref];
    if (to) { const dr = ((to.rotation ?? p.rotation) - p.rotation + 360) % 360; return { ...p, x: to.x ?? p.x, y: to.y ?? p.y, rotation: (to.rotation ?? p.rotation) % 360, dr }; }
    const a = follow.has(p.ref) && !moves[p.ref] ? byRef.get(follow.get(p.ref)) : null, at = a && moves[a.ref];
    if (!at) return p;
    const turn = ((at.rotation ?? a.rotation) - a.rotation + 360) % 360, t = (turn * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const dx = p.x - a.x, dy = p.y - a.y, own = p.layer === a.layer ? turn : -turn; // a part on the other side turns the other way, seen from its side
    return { ...p, x: r4((at.x ?? a.x) + c * dx - s * dy), y: r4((at.y ?? a.y) + s * dx + c * dy), rotation: turnOf(p.rotation + own) };
  };
  return { ...circuit, parts: circuit.parts.map(moved).map(({ dr, ...p }) => p) };
}

/**
 * Are the small parts still near their anchors? Findings ({ level, text }): one fail per broken rule, naming the part,
 * the pin and the distances, or a pass.
 * @param {object} circuit @param {object[]} [rules]
 */
export function placementChecks(circuit, rules = circuit.placement || learnPlacement(circuit)) {
  const byRef = new Map(circuit.parts.map((p) => [p.ref, p])), out = [];
  for (const r of rules) {
    const p = byRef.get(r.part), a = byRef.get(r.anchor);
    if (!p || !a) { out.push({ level: 'fail', text: `placement: ${!p ? r.part : r.anchor} isn't on the board` }); continue; }
    const pin = padsOnBoard(a).filter((q) => q.pin === r.pin), mine = padsOnBoard(p).filter((q) => q.net === r.net);
    const d = Math.min(...mine.flatMap((q) => pin.map((x) => Math.hypot(x.bx - q.bx, x.by - q.by))));
    if (!(d <= r.max + 1e-6)) out.push({ level: 'fail', text: `placement: ${r.part} is ${mm(d)} mm from ${r.anchor} pin ${r.pin} (${r.net}): at most ${mm(r.max)} (${mm(r.source)} on the source)` });
  }
  if (!out.length) out.push({ level: 'pass', text: `placement: all ${rules.length} small parts within reach of their anchors, as the source has them` });
  return out;
}

/**
 * Does the board join exactly the pins the circuit joins? Each of the circuit's nets (but planes) must be one group of
 * pins on the board, with no other net's pins in it. Findings as checks() gives them ({ level, text }).
 * @param {object[]} json Circuit JSON (render's) @param {object} circuit @param {{ planes?: string[] }} [o]
 */
export function sameCircuit(json, circuit, o = {}) {
  const { nets } = clone(circuit, o), up = new Map(), find = (a) => { while (up.get(a) !== a) a = up.get(a); return a; };
  const join = (a, b) => { up.set(find(a), find(b)); };
  const comp = new Map(json.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e]));
  const name = new Map(json.filter((e) => e.type === 'source_port').map((e) => [e.source_port_id, `${comp.get(e.source_component_id)?.name}.${e.name}`]));
  for (const id of name.keys()) up.set(id, id);
  for (const c of comp.values()) for (const g of c.internally_connected_source_port_ids || []) g.forEach((id) => join(id, g[0]));
  for (const t of json.filter((e) => e.type === 'source_trace')) t.connected_source_port_ids.forEach((id) => join(id, t.connected_source_port_ids[0]));
  const group = new Map(); // pin name -> group
  for (const [id, n] of name) group.set(n, find(id));
  const out = [], missing = [], split = [], shorted = [];
  const owner = new Map(); // group -> net
  for (const [net, pins] of Object.entries(nets)) {
    const gs = new Set(pins.map((p) => group.get(p)));
    if (gs.has(undefined)) { missing.push(`${net}: ${pins.filter((p) => !group.has(p)).join(', ')}`); continue; }
    if (gs.size > 1) split.push(net);
    for (const g of gs) { if (owner.has(g) && owner.get(g) !== net) shorted.push(`${owner.get(g)} and ${net}`); owner.set(g, net); }
  }
  const extra = []; // board pins in a net's group that the source doesn't put in that net
  for (const [pin, g] of group) { const net = owner.get(g); if (net && !nets[net].includes(pin)) extra.push(`${pin} in ${net}`); }
  if (extra.length) out.push({ level: 'fail', text: `${extra.length} pins joined to nets the source leaves them out of: ${extra.slice(0, 5).join(', ')}` });
  const n = Object.keys(nets).length;
  if (missing.length) out.push({ level: 'fail', text: `${missing.length} nets name pins the board doesn't have: ${missing.slice(0, 3).join('; ')}` });
  if (split.length) out.push({ level: 'fail', text: `${split.length} nets are split in two or more on the board: ${split.slice(0, 5).join(', ')}` });
  if (shorted.length) out.push({ level: 'fail', text: `nets joined that the source keeps apart: ${[...new Set(shorted)].slice(0, 5).join('; ')}` });
  if (!out.length) out.push({ level: 'pass', text: `same circuit as the source: all ${n} nets join the same pins, and no others${Object.keys(circuit.nets).length > n ? ` (${Object.keys(circuit.nets).length - n} left to planes)` : ''}` });
  return out;
}

// ---------- board shapes ----------
// Outlines for board.outline: closed polygons, counter-clockwise, centred on at (default the origin). Curves are cut
// into segments (default 8 per quarter circle: fine for a router and a fab, which mills them as arcs anyway).
const arc = (cx, cy, r, a0, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (Math.PI / 2) * (i / n); return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
export const shape = {
  rect: (w, h, { at = [0, 0] } = {}) => shape.polygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], { at }),
  // corners rounded to radius r
  rounded: (w, h, r, { at = [0, 0], segments = 8 } = {}) => {
    if (r <= 0) return shape.rect(w, h, { at });
    const x = w / 2 - r, y = h / 2 - r;
    return [...arc(x, -y, r, -Math.PI / 2, segments), ...arc(x, y, r, 0, segments), ...arc(-x, y, r, Math.PI / 2, segments), ...arc(-x, -y, r, Math.PI, segments)]
      .map((p) => ({ x: p.x + at[0], y: p.y + at[1] }));
  },
  // corners cut at 45 degrees, b along each side
  bevelled: (w, h, b, { at = [0, 0] } = {}) => shape.polygon([[-w / 2 + b, -h / 2], [w / 2 - b, -h / 2], [w / 2, -h / 2 + b], [w / 2, h / 2 - b], [w / 2 - b, h / 2], [-w / 2 + b, h / 2], [-w / 2, h / 2 - b], [-w / 2, -h / 2 + b]], { at }),
  // a ring from radius r0 to r1, open by gap at angle (radians) so it is one outline: for a contact ring's copper
  ring: (r0, r1, { gap = 0.3, angle = 0, segments = 48, at = [0, 0] } = {}) => {
    const a0 = angle + gap / r1 / 2, a1 = angle + Math.PI * 2 - gap / r1 / 2, b0 = angle + gap / r0 / 2, b1 = angle + Math.PI * 2 - gap / r0 / 2;
    const arcAt = (r, s, e) => Array.from({ length: segments + 1 }, (_, i) => { const a = s + ((e - s) * i) / segments; return [at[0] + r * Math.cos(a), at[1] + r * Math.sin(a)]; });
    return [...arcAt(r1, a0, a1), ...arcAt(r0, b1, b0)];
  },
  circle: (d, { at = [0, 0], segments = 32 } = {}) => Array.from({ length: segments }, (_, i) => ({ x: at[0] + (d / 2) * Math.cos((Math.PI * 2 * i) / segments), y: at[1] + (d / 2) * Math.sin((Math.PI * 2 * i) / segments) })),
  polygon: (points, { at = [0, 0] } = {}) => points.map(([x, y]) => ({ x: x + at[0], y: y + at[1] }))
};
// Is the point inside the polygon? (even-odd rule)
export function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// ---------- building ----------
// render(board) -> Circuit JSON (circuit.mjs)
export const render = (board, options) => circuitJson(board, options); // options.route: a router in place of the autorouter

// The board as a solid (previews, fits, the on-screen copy, the model page): the bare board, drilled, bottom at z = 0. Its
// copper is drawn in the 2D views (views), not in 3D. The board is a 2D outline with its holes, extruded: its faces
// triangulate cleanly (cylinders subtracted from a block leave long slivers).
export function solids(json, { thickness, smooth = 16 }) { // smooth: segments per hole (a board without the variable gets 16)
  const { rectangle, circle, polygon } = jscad.primitives, { subtract } = jscad.booleans, { extrudeLinear } = jscad.extrusions;
  const b = json.find((e) => e.type === 'pcb_board');
  const drills = json.filter((e) => e.type === 'pcb_hole' || e.type === 'pcb_plated_hole' || e.type === 'pcb_via')
    .map((e) => circle({ center: [e.x, e.y], radius: (e.hole_diameter ?? e.hole_width) / 2, segments: smooth }));
  const outline = b.outline ? polygon({ points: b.outline.map((p) => [p.x, p.y]) }) : rectangle({ center: [b.center.x, b.center.y], size: [b.width, b.height] });
  return { board: extrudeLinear({ height: thickness }, drills.length ? subtract(outline, ...drills) : outline) };
}

// What a built board tells the parts around it, as numbers an assembly can use (board.pico_y): its outline (centre and
// size, mm, in the layout's frame) and, with the Pico under it, the Pico's centre
export function outputs(json, matrix) {
  const b = json.find((e) => e.type === 'pcb_board');
  return { board_x: b.center.x, board_y: b.center.y, board_w: b.width, board_d: b.height, ...(b.outline ? { board_outline: b.outline } : {}), ...(matrix?.pico ? { pico_x: matrix.pico.x, pico_y: matrix.pico.y } : {}) };
}

/**
 * A board's mounting holes (the board's own holes, not a part's): [{ x, y, d }] in mm, in the board's frame (as
 * board_x and board_y). A case reads them to put its bosses under them; a holes fit checks screws find their inserts.
 */
/**
 * Where a board's parts are, by name: { U1: { x, y, w, h, layer } } in mm, in the board's frame (w and h as placed,
 * so a turned part's are swapped). A case reads them to put openings over a USB socket, a light or a button.
 */
export function parts(json) {
  const names = Object.fromEntries(json.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e.name]));
  return Object.fromEntries(json.filter((e) => e.type === 'pcb_component').map((e) => [names[e.source_component_id], { x: e.center.x, y: e.center.y, w: e.width, h: e.height, layer: e.layer, rotation: e.rotation ?? 0 }]));
}

export const holes = (json) => json.filter((e) => e.type === 'pcb_hole' && !e.pcb_component_id).map((e) => ({ x: e.x, y: e.y, d: e.hole_diameter }));

// ---------- checks ----------
const mm = (x) => String(Number(x.toFixed(3))); // 0.30000000000000004 reads as 0.3
// checks(json, v) -> findings ({ level, text }): tscircuit's own design checks, the fab's limits, and the matrix
export async function checks(json, v, matrix) {
  const { runAllChecks } = await import('@tscircuit/checks');
  const out = [], j = v.jlcpcb;
  const board = json.find((e) => e.type === 'pcb_board');
  // On a shaped board, a part's box can reach past a curved edge when its copper doesn't (a ring on a round disc): that
  // part is checked here pad by pad against the outline instead (below)
  const padsOf = (id) => json.filter((e) => e.pcb_component_id === id && ['pcb_smtpad', 'pcb_plated_hole'].includes(e.type));
  const fits = (id) => board.outline && padsOf(id).every((e) => (e.points || [e]).every((q) => inside(board.outline, q.x, q.y)));
  const drc = (await runAllChecks(json)).filter((e) => !(e.type === 'pcb_component_outside_board_error' && fits(e.pcb_component_id)));
  const problems = [...json, ...drc].filter((e) => /_error$/.test(e.type));
  const seen = new Set(), errors = problems.filter((e) => !seen.has(e.message) && seen.add(e.message));
  out.push(errors.length ? { level: 'fail', text: `${errors.length} design-rule errors: ${errors.slice(0, 3).map((e) => e.message).join('; ')}` } : { level: 'pass', text: 'tscircuit\'s design checks: no errors (traces, clearances, holes, board edge)' });
  const traces = json.filter((e) => e.type === 'pcb_trace'), unrouted = json.filter((e) => e.type === 'source_trace').length - traces.length;
  out.push(unrouted > 0 ? { level: 'fail', text: `${unrouted} connections have no track` } : { level: 'pass', text: `every connection is routed (${traces.length} tracks, ${json.filter((e) => e.type === 'pcb_via').length} vias)` });
  const thin = traces.flatMap((t) => t.route).filter((p) => p.width != null && p.width < j.track_min);
  out.push(thin.length ? { level: 'fail', text: `tracks under JLCPCB's ${j.track_min} mm` } : { level: 'pass', text: `tracks ${mm(v.track ?? Math.min(...traces.flatMap((t) => t.route).map((p) => p.width).filter((w) => w != null)))} mm${v.clear != null ? `, gaps ${mm(v.clear)} mm` : ''}: over JLCPCB's ${j.track_min} / ${j.gap_min} mm` });
  const drills = json.filter((e) => e.type === 'pcb_hole' || e.type === 'pcb_plated_hole').map((e) => e.hole_diameter ?? e.hole_width);
  if (drills.length) out.push(Math.min(...drills) < j.drill_min ? { level: 'fail', text: `a hole under JLCPCB's ${j.drill_min} mm` } : { level: 'pass', text: `${drills.length} holes, smallest ${Math.min(...drills)} mm (JLCPCB: ${j.drill_min} mm)` });
  const b = json.find((e) => e.type === 'pcb_board'), size = `${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm`;
  if (b.outline) { // a shaped board: every pad and hole inside it
    const pads = json.filter((e) => ['pcb_smtpad', 'pcb_plated_hole', 'pcb_hole'].includes(e.type)), out_ = pads.filter((e) => (e.points || [e]).some((q) => !inside(b.outline, q.x, q.y)));
    out.push(out_.length ? { level: 'fail', text: `${out_.length} pads or holes outside the board's outline (first at ${mm(out_[0].x)}, ${mm(out_[0].y)} mm)` } : { level: 'pass', text: `shaped board (${b.outline.length} points): all ${pads.length} pads and holes inside it` });
  }
  out.push(Math.max(b.width, b.height) <= j.cheap_size ? { level: 'pass', text: `${size}: within JLCPCB's lowest price (${j.cheap_size} × ${j.cheap_size} mm)` } : { level: 'info', text: `${size}: over ${j.cheap_size} × ${j.cheap_size} mm, priced by quote` });
  if (matrix) {
    const cells = new Set(matrix.keys.map((k) => `${k.row},${k.col}`)), gpio = [...Object.values(matrix.rows), ...Object.values(matrix.cols)];
    out.push(cells.size === matrix.keys.length && new Set(gpio).size === gpio.length
      ? { level: 'pass', text: `matrix: ${matrix.keys.length} keys on ${Object.keys(matrix.rows).length} rows × ${Object.keys(matrix.cols).length} columns, ${gpio.length} GPIO (rows ${Object.values(matrix.rows).join(' ')}; columns ${Object.values(matrix.cols).join(' ')})` }
      : { level: 'fail', text: 'matrix: two keys share a row and column, or a GPIO is used twice' });
  }
  const notes = new Set([...json, ...drc].filter((e) => /_warning$/.test(e.type)).map((e) => e.type.replace(/^(source|pcb)_|_warning$/g, '').replace(/_/g, ' ')));
  if (notes.size) out.push({ level: 'info', text: `tscircuit notes, none about the copper: ${[...notes].join(', ')}` });
  return out;
}

// ---------- files ----------
// The fab files: Gerbers (KiCad's Protel names, which JLCPCB reads), drill files, BOM and placement -> { name: text }
const PROTEL = { F_Cu: 'GTL', B_Cu: 'GBL', F_Mask: 'GTS', B_Mask: 'GBS', F_SilkScreen: 'GTO', B_SilkScreen: 'GBO', F_Paste: 'GTP', B_Paste: 'GBP', Edge_Cuts: 'GKO' };
export async function fabFiles(json, name) {
  const { convertSoupToGerberCommands, stringifyGerberCommandLayers, convertSoupToExcellonDrillCommands, stringifyExcellonDrill } = await import('circuit-json-to-gerber');
  const { convertCircuitJsonToPickAndPlaceCsv } = await import('circuit-json-to-pnp-csv');
  const out = {};
  for (const [layer, text] of Object.entries(stringifyGerberCommandLayers(convertSoupToGerberCommands(json)))) if (PROTEL[layer]) out[`${name}.${PROTEL[layer]}`] = text; // fab notes (B_Fab) stay out
  out[`${name}-PTH.DRL`] = stringifyExcellonDrill(convertSoupToExcellonDrillCommands({ circuitJson: json, is_plated: true }));
  out[`${name}-NPTH.DRL`] = stringifyExcellonDrill(convertSoupToExcellonDrillCommands({ circuitJson: json, is_plated: false }));
  out[`${name}-bom.csv`] = bom(json);
  out[`${name}-cpl.csv`] = convertCircuitJsonToPickAndPlaceCsv(json);
  return out;
}

// The BOM in JLCPCB's columns (Comment, Designator, Footprint, LCSC Part #), one line per kind of part. The LCSC
// numbers are blank until parts are chosen for assembly; a hand-soldered board doesn't need them.
const FOOTPRINT = { K: 'Cherry MX, PCB mount', U: 'Raspberry Pi Pico, 0.1 in header pins', D: 'SOD-123' };
function bom(json) {
  const lines = new Map(), q = (x) => `"${String(x).replace(/"/g, '""')}"`;
  for (const c of json.filter((e) => e.type === 'source_component')) {
    const comment = c.manufacturer_part_number || c.name, footprint = FOOTPRINT[c.name[0]] || '', key = `${comment}|${footprint}`;
    if (!lines.has(key)) lines.set(key, { comment, footprint, refs: [] });
    lines.get(key).refs.push(c.name);
  }
  return ['Comment,Designator,Footprint,LCSC Part #', ...[...lines.values()].map((l) => [l.comment, l.refs.join(','), l.footprint, ''].map(q).join(','))].join('\n') + '\n';
}

// KiCad's own files, to check with kicad-cli or finish by hand: { 'name.kicad_pcb': text, 'name.kicad_sch': text }
export async function kicadFiles(json, name) {
  const { CircuitJsonToKicadPcbConverter, CircuitJsonToKicadSchConverter } = await import('circuit-json-to-kicad');
  const pcb = new CircuitJsonToKicadPcbConverter(json); pcb.runUntilFinished();
  const sch = new CircuitJsonToKicadSchConverter(json); sch.runUntilFinished();
  return { [`${name}.kicad_pcb`]: pcb.getOutputString(), [`${name}.kicad_sch`]: sch.getOutputString() };
}

// The 2D views for the model page, as SVG drawings: [[name, svg]]. "Group: view" names group into one tab with a
// choice inside it (Board: both sides, front, back).
export async function views(json) {
  const { convertCircuitJsonToPcbSvg, convertCircuitJsonToSchematicSvg } = await import('circuit-to-svg');
  return [
    ['Board: both sides', convertCircuitJsonToPcbSvg(json)], // the model page makes front and back from its layers
    ['Schematic', convertCircuitJsonToSchematicSvg(json)],
  ].map(([name, svg]) => [name, light(svg)]);
}

/**
 * A drawing made lighter for a link, looking the same: numbers in attributes rounded to 0.01 (the drawings are
 * 800 px wide, so that's invisible; text keeps every digit), tscircuit's data-* attributes gone but each element's
 * copper layer (data-pcb-layer, which the model page uses to show one side), and empty style tags gone.
 * A board's link was mostly its drawings' 15-digit coordinates, which don't compress.
 * @param {string} svg @returns {string}
 */
export function light(svg) {
  const round = (v) => v.replace(/-?\d+\.\d{3,}/g, (n) => String(Math.round(Number(n) * 100) / 100));
  return svg.replace(/ data-(?!pcb-layer=)[\w-]+="[^"]*"/g, '').replace(/<style><\/style>/g, '')
    .replace(/(<[^>]+>)/g, (tag) => tag.replace(/="([^"]*)"/g, (_, v) => `="${round(v)}"`));
}

// The schematic as a PNG
export async function schematicPng(json, out, width = 1600) {
  const { convertCircuitJsonToSchematicSvg } = await import('circuit-to-svg'), { Resvg } = await import('@resvg/resvg-js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, new Resvg(convertCircuitJsonToSchematicSvg(json), { fitTo: { mode: 'width', value: width } }).render().asPng());
  return out;
}

// The board drawn from above as a PNG (front copper, back copper, silkscreen, holes)
export async function png(json, out, width = 1600) {
  const { convertCircuitJsonToPcbSvg } = await import('circuit-to-svg'), { Resvg } = await import('@resvg/resvg-js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, new Resvg(convertCircuitJsonToPcbSvg(json), { fitTo: { mode: 'width', value: width } }).render().asPng());
  return out;
}

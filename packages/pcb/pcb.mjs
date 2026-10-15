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
import { circuitJson } from './circuit.mjs';
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

// ---------- building ----------
// render(board) -> Circuit JSON (circuit.mjs)
export const render = (board) => circuitJson(board);

// The board as a solid (previews, fits, the on-screen copy, the model page): the bare board, drilled, bottom at z = 0. Its
// copper is drawn in the 2D views (views), not in 3D. The board is a 2D outline with its holes, extruded: its faces
// triangulate cleanly (cylinders subtracted from a block leave long slivers).
export function solids(json, { thickness, smooth }) {
  const { rectangle, circle } = jscad.primitives, { subtract } = jscad.booleans, { extrudeLinear } = jscad.extrusions;
  const b = json.find((e) => e.type === 'pcb_board');
  const drills = json.filter((e) => e.type === 'pcb_hole' || e.type === 'pcb_plated_hole' || e.type === 'pcb_via')
    .map((e) => circle({ center: [e.x, e.y], radius: (e.hole_diameter ?? e.hole_width) / 2, segments: smooth }));
  const outline = rectangle({ center: [b.center.x, b.center.y], size: [b.width, b.height] });
  return { board: extrudeLinear({ height: thickness }, drills.length ? subtract(outline, ...drills) : outline) };
}

// What a built board tells the parts around it, as numbers an assembly can use (board.pico_y): its outline (centre and
// size, mm, in the layout's frame) and, with the Pico under it, the Pico's centre
export function outputs(json, matrix) {
  const b = json.find((e) => e.type === 'pcb_board');
  return { board_x: b.center.x, board_y: b.center.y, board_w: b.width, board_d: b.height, ...(matrix?.pico ? { pico_x: matrix.pico.x, pico_y: matrix.pico.y } : {}) };
}

// ---------- checks ----------
// checks(json, v) -> findings ({ level, text }): tscircuit's own design checks, the fab's limits, and the matrix
export async function checks(json, v, matrix) {
  const { runAllChecks } = await import('@tscircuit/checks');
  const out = [], j = v.jlcpcb;
  const drc = await runAllChecks(json), problems = [...json, ...drc].filter((e) => /_error$/.test(e.type));
  const seen = new Set(), errors = problems.filter((e) => !seen.has(e.message) && seen.add(e.message));
  out.push(errors.length ? { level: 'fail', text: `${errors.length} design-rule errors: ${errors.slice(0, 3).map((e) => e.message).join('; ')}` } : { level: 'pass', text: 'tscircuit\'s design checks: no errors (traces, clearances, holes, board edge)' });
  const traces = json.filter((e) => e.type === 'pcb_trace'), unrouted = json.filter((e) => e.type === 'source_trace').length - traces.length;
  out.push(unrouted > 0 ? { level: 'fail', text: `${unrouted} connections have no track` } : { level: 'pass', text: `every connection is routed (${traces.length} tracks, ${json.filter((e) => e.type === 'pcb_via').length} vias)` });
  const thin = traces.flatMap((t) => t.route).filter((p) => p.width != null && p.width < j.track_min);
  out.push(thin.length ? { level: 'fail', text: `tracks under JLCPCB's ${j.track_min} mm` } : { level: 'pass', text: `tracks ${v.track} mm, gaps ${v.clear} mm: over JLCPCB's ${j.track_min} / ${j.gap_min} mm` });
  const drills = json.filter((e) => e.type === 'pcb_hole' || e.type === 'pcb_plated_hole').map((e) => e.hole_diameter ?? e.hole_width);
  out.push(Math.min(...drills) < j.drill_min ? { level: 'fail', text: `a hole under JLCPCB's ${j.drill_min} mm` } : { level: 'pass', text: `${drills.length} holes, smallest ${Math.min(...drills)} mm (JLCPCB: ${j.drill_min} mm)` });
  const b = json.find((e) => e.type === 'pcb_board'), size = `${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm`;
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
    ['Board: both sides', convertCircuitJsonToPcbSvg(json)],
    ['Board: front', convertCircuitJsonToPcbSvg(json, { layer: 'top' })],
    ['Board: back', convertCircuitJsonToPcbSvg(json, { layer: 'bottom' })],
    ['Schematic', convertCircuitJsonToSchematicSvg(json)],
  ];
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

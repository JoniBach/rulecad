// Rule sets looked at: cad rules check holds every set to what makes it traceable, cad rules draw makes a dimension
// drawing from what a set says a part mounts by (so whoever read a datasheet can compare the two by eye), and cad
// rules draft pulls the figures out of a datasheet's text for a person to choose from. Nothing here writes a value
// the kit trusts: a draft is all "estimate" until someone has checked it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { checkRuleSet } from '@rulecad/variables';
import { RULE_DIRS } from './workspace.mjs';

const vocabularyFile = fileURLToPath(import.meta.resolve('@rulecad/rules/vocabulary.json'));
const readSet = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const vocabulary = () => readSet(vocabularyFile);

// Every set by name, a workspace's own copy before the published one
function allSets() {
  const found = new Map();
  for (const d of RULE_DIRS) if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.json') && !['package.json', 'vocabulary.json'].includes(f)) { const n = f.slice(0, -5); if (!found.has(n)) found.set(n, path.join(d, f)); }
  return found;
}
function fileOf(name) {
  const all = allSets(), file = all.get(name);
  if (!file) throw new Error(`no rule set "${name}" (there are: ${[...all.keys()].join(', ')})`);
  return file;
}

/** Every named set checked (or all of them): [{ name, file, findings }] */
export function checkSets(names = []) {
  const v = vocabulary(), all = allSets();
  return (names.length ? names.map((n) => [n, fileOf(n)]) : [...all]).map(([name, file]) => ({ name, file, findings: checkRuleSet(readSet(file), v) }));
}

// ---------- a dimension drawing ----------
const fig = (x) => String(+Number(x).toFixed(2));
const INK = '#1a1a1a', THIN = '#666', FILL = '#eceae4', METAL = '#c4c8cc';

/** @param {string} name the rule set's name @returns {string} an SVG drawing of what it says the part mounts by */
export function drawSet(name) { return drawing(readSet(fileOf(name)), vocabulary()); }

// The drawing's marks, in sheet units: each adds to out, and span is a dimension with its extension lines, ticks and figure
function pen() {
  const out = [];
  const line = (a, b, c, e, s = INK, sw = 1.2, dash = '') => out.push(`<line x1="${fig(a)}" y1="${fig(b)}" x2="${fig(c)}" y2="${fig(e)}" stroke="${s}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
  const circle = (x, y, r, fill = 'none', s = INK) => out.push(`<circle cx="${fig(x)}" cy="${fig(y)}" r="${fig(r)}" fill="${fill}" stroke="${s}" stroke-width="1.2"/>`);
  const rect = (x, y, a, b, fill = FILL) => out.push(`<rect x="${fig(x)}" y="${fig(y)}" width="${fig(a)}" height="${fig(b)}" fill="${fill}" stroke="${INK}" stroke-width="1.2"/>`);
  const text = (x, y, t, a = 'middle', z = 12) => out.push(`<text x="${fig(x)}" y="${fig(y)}" text-anchor="${a}" font-size="${z}" font-family="system-ui, sans-serif" fill="${INK}">${t}</text>`);
  const span = (x1, y1, x2, y2, t, across_ = 14) => { // a dimension: extension lines, a line with its ticks, the figure
    const horizontal = Math.abs(y2 - y1) < 1e-6, ox = horizontal ? 0 : across_, oy = horizontal ? across_ : 0;
    line(x1, y1, x1 + ox, y1 + oy, THIN, 0.6); line(x2, y2, x2 + ox, y2 + oy, THIN, 0.6); line(x1 + ox, y1 + oy, x2 + ox, y2 + oy, THIN, 0.8);
    for (const [a, b] of [[x1 + ox, y1 + oy], [x2 + ox, y2 + oy]]) line(a - 3, b + 3, a + 3, b - 3, THIN, 0.8);
    if (horizontal) text((x1 + x2) / 2, y1 + oy + (across_ > 0 ? 13 : -4), t); else text(x1 + ox + (across_ > 0 ? 4 : -4), (y1 + y2) / 2 + 4, t, across_ > 0 ? 'start' : 'end');
  };
  return { out, line, circle, rect, text, span };
}

// The sheet's heading (what's trustworthy) and its frame
function sheet(set, { out, text }, W, H) {
  const kinds = Object.values(set.rules).reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {});
  text(20, 26, set.name, 'start', 16);
  text(20, 44, `all in mm. ${Object.entries(kinds).map(([k, c]) => `${c} ${k}`).join(', ')}: compare it with the datasheet`, 'start', 11);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fig(W)} ${fig(H + 60)}" width="${fig(W)}" height="${fig(H + 60)}"><rect width="100%" height="100%" fill="#fff"/>${out.join('')}</svg>\n`;
}

// A bearing from its end and in section: bore, outer diameter, width, and the flange or the thrust washers where it has them
function bearingDrawing(set) {
  const n = (k) => set.rules[k]?.value ?? 0, thrust = set.rules.type?.value === 'thrust';
  const d = n('bore'), D = n('outer_diameter'), B = n('width'), F = n('flange_diameter'), Fw = n('flange_width'), d1 = n('shaft_washer_diameter'), D1 = n('housing_washer_bore');
  const R = Math.max(D, F) / 2, S = Math.max(4, Math.min(20, 90 / R)), W = 2 * R * S + B * S + 330, H = 2 * R * S + 170;
  const cx = R * S + 70, cy = H / 2 + 22, sx = cx + R * S + 120, top = cy - R * S, bottom = cy + R * S;
  const pens = pen(), { line, circle, rect, text, span } = pens;
  // ---- from the end ----
  if (F) circle(cx, cy, (F / 2) * S, '#f6f4ee');
  circle(cx, cy, (D / 2) * S, FILL);
  if (D1) circle(cx, cy, (D1 / 2) * S, 'none', THIN);
  circle(cx, cy, (d / 2) * S, '#fff');
  line(cx - R * S - 8, cy, cx + R * S + 8, cy, THIN, 0.5, '8 3 2 3'); line(cx, cy - R * S - 8, cx, cy + R * S + 8, THIN, 0.5, '8 3 2 3');
  span(cx - (D / 2) * S, bottom + 6, cx + (D / 2) * S, bottom + 6, `Ø${fig(D)}`, 18);
  span(cx - (d / 2) * S, top - 6, cx + (d / 2) * S, top - 6, `bore Ø${fig(d)}`, -14);
  if (F) text(cx, bottom + 66, `flange Ø${fig(F)}, ${fig(Fw)} thick`);
  if (thrust) text(cx, bottom + 66, `shaft washer Ø${fig(d1)}, housing washer bore Ø${fig(D1)}`);
  // ---- the section, axis along the sheet ----
  for (const side of [-1, 1]) {
    const y = (a, b) => (side < 0 ? [cy - b * S, (b - a) * S] : [cy + a * S, (b - a) * S]);
    const [ry, rh] = y(d / 2, D / 2); rect(sx, ry, B * S, rh);
    if (F) { const [fy, fh] = y(D / 2, F / 2); rect(sx, fy, Fw * S, fh, '#ddd9cf'); }
    if (thrust) line(sx + (B * S) / 2, ry, sx + (B * S) / 2, ry + rh, THIN, 0.8, '4 3');
  }
  line(sx - 12, cy, sx + B * S + 12, cy, THIN, 0.5, '8 3 2 3');
  span(sx, bottom + 6, sx + B * S, bottom + 6, `${fig(B)}`, 18);
  span(sx + B * S + 6, cy - (D / 2) * S, sx + B * S + 6, cy + (D / 2) * S, `Ø${fig(D)}`, 30);
  text(sx + (B * S) / 2, top - 22, `chamfer ${fig(n('chamfer'))}`, 'middle', 11);
  text(cx, bottom + 86, `${set.rules.type?.value || 'bearing'}: ${fig(n('dynamic_rating'))} N dynamic, ${fig(n('static_rating'))} N static${set.rules.radial_play ? `, ${set.rules.radial_play.value}` : ''}`, 'middle', 11);
  return sheet(set, pens, W, H);
}

// A driver module from above: the board and its two header rows, at their spacing
function driverDrawing(set) {
  const n = (k) => set.rules[k]?.value ?? 0, w = n('body_width'), d = n('body_depth'), pitch = n('pin_pitch'), row = n('row_spacing'), count = n('pin_count') / 2;
  const S = 16, W = w * S + 260, H = d * S + 170, cx = W / 2, cy = H / 2 + 22, X = (x) => cx + x * S, Y = (y) => cy - y * S;
  const pens = pen(), { line, circle, rect, text, span } = pens;
  rect(X(-w / 2), Y(d / 2), w * S, d * S);
  const pins = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * pitch);
  for (const y of [-row / 2, row / 2]) for (const x of pins) circle(X(x), Y(y), (pitch / 3.2) * S, METAL);
  line(X(-w / 2) - 10, Y(0), X(w / 2) + 10, Y(0), THIN, 0.5, '8 3 2 3');
  span(X(-w / 2), Y(-d / 2) + 6, X(w / 2), Y(-d / 2) + 6, `${fig(w)}`, 18);
  span(X(-w / 2) - 6, Y(d / 2), X(-w / 2) - 6, Y(-d / 2), `${fig(d)}`, -18);
  span(X(w / 2) + 6, Y(row / 2), X(w / 2) + 6, Y(-row / 2), `rows ${fig(row)}`, 18);
  span(X(pins[0]), Y(d / 2) - 6, X(pins[1]), Y(d / 2) - 6, `pitch ${fig(pitch)}`, -14);
  text(cx, Y(-d / 2) + 66, `${n('pin_count')} pins: ${set.rules.vref_formula?.value ?? ''}`, 'middle', 11);
  text(cx, Y(-d / 2) + 84, `Rs ${n('sense_resistor')} ohm, ${n('vref_gain')} A per volt of Vref`, 'middle', 11);
  return sheet(set, pens, W, H);
}

export function drawing(set, vocab) {
  if (set.part === 'bearing') return bearingDrawing(set);
  if (set.part === 'driver') return driverDrawing(set);
  const get = (k) => { const r = set.rules[set.interface?.[k] ?? k]; return r?.value; }, n = (k, d = 0) => { const x = get(k); return typeof x === 'number' ? x : d; };
  if (!set.part && !Object.keys(set.interface || {}).some((k) => k.startsWith('body_'))) throw new Error(`rule set "${set.name}" doesn't say what shape it is (no body_ names in it, or "part", or "interface"): there's nothing to draw`);
  const shape = get('body_shape') ?? 'box', round = shape === 'round', w = round ? n('body_diameter') : n('body_width'), d = round ? w : shape === 'square' ? w : n('body_depth', n('body_width'));
  const tabs = n('mount_tab_length'), off = n('boss_offset'), cx = tabs ? -off : 0, cy = tabs ? 0 : -off; // the body's centre, from the shaft
  const spacing = n('mount_hole_spacing'), pattern = get('mount_pattern'), hole = n('mount_hole_diameter') || (parseFloat(String(get('mount_hole_thread') ?? '').slice(1)) || 2);
  const holes = !spacing ? [] : pattern === 'square' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + (a * spacing) / 2, cy + (b * spacing) / 2]) : [[cx - spacing / 2, cy], [cx + spacing / 2, cy]];
  const earR = n('mount_ear_radius'), reach = Math.max(w / 2, d / 2, spacing / 2 + (earR || hole), tabs / 2) + 2, shaftD = n('shaft_diameter'), bossD = n('boss_diameter');
  const L = n('body_length'), top = n('body_top'), bossH = n('boss_height'), shaftL = n('shaft_length'), flat = n('shaft_flat_length'), flats = n('shaft_flats'), across = n('shaft_flat_across');
  // scaled so a small part fills the sheet as a large one does
  const scale = 300 / (2 * reach + Math.max(L + top, shaftL + L, 10)) / 1.4, S = Math.max(3, Math.min(12, scale));
  const W = 2 * reach * S + (L + Math.max(shaftL, top + bossH) + 8) * S + 200, H = Math.max(2 * reach * S + 150, 280);
  const fx = reach * S + 70, fy = H / 2 + 8, X = (x) => fx + x * S, Y = (y) => fy - y * S; // the face view, shaft at the origin
  const sx = fx + reach * S + 90 + L * S, SX = (z) => sx + z * S, SY = (y) => fy - y * S; // the side view: z along the sheet, the mounting face at z = 0
  const pens = pen(), { out, line, circle, rect, text, span } = pens;
  // ---- the face, from the shaft's end ----
  if (tabs) rect(X(cx - tabs / 2), Y(cy + d / 2), tabs * S, d * S, '#f6f4ee');
  for (const [hx, hy] of earR ? holes : []) circle(X(hx), Y(hy), earR * S, '#f6f4ee');
  if (shape === 'square') { const c = n('body_corner'), h = w / 2; const p = [[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]].map(([a, b]) => `${fig(X(cx + a))},${fig(Y(cy + b))}`).join(' '); out.push(`<polygon points="${p}" fill="${FILL}" stroke="${INK}" stroke-width="1.2"/>`); }
  else if (round) circle(X(cx), Y(cy), (w / 2) * S, FILL); else rect(X(cx - w / 2), Y(cy + d / 2), w * S, d * S);
  if (bossD) circle(X(0), Y(0), (bossD / 2) * S, '#ddd9cf');
  if (shaftD) circle(X(0), Y(0), (shaftD / 2) * S, METAL);
  if (flats && across) { const a = flats === 2 ? across / 2 : across - shaftD / 2, c = Math.sqrt(Math.max(0, (shaftD / 2) ** 2 - a ** 2)); line(X(-c), Y(a), X(c), Y(a), INK, 1.4); if (flats === 2) line(X(-c), Y(-a), X(c), Y(-a), INK, 1.4); }
  for (const [hx, hy] of holes) circle(X(hx), Y(hy), (hole / 2) * S, '#fff');
  line(X(-reach), Y(0), X(reach), Y(0), THIN, 0.5, '8 3 2 3'); line(X(0), Y(-reach), X(0), Y(reach), THIN, 0.5, '8 3 2 3');
  const bottom = Y(Math.min(cy - d / 2, -reach + 2)), topY = Y(Math.max(cy + d / 2, 0));
  if (!round && !tabs) span(X(cx - w / 2), bottom, X(cx + w / 2), bottom, `${fig(w)}`, 18);
  if (round) span(X(cx - w / 2), bottom, X(cx + w / 2), bottom, `Ø${fig(w)}`, 18);
  if (tabs) span(X(cx - tabs / 2), bottom, X(cx + tabs / 2), bottom, `tabs ${fig(tabs)}`, 18);
  if (spacing) span(X(holes[0][0]), bottom, X(holes[1][0]), bottom, `holes ${fig(spacing)}`, 40);
  if (bossD) span(X(-bossD / 2), topY, X(bossD / 2), topY, `boss Ø${fig(bossD)}`, -14);
  if (off) { text(X(reach), Y(reach) + 2, `shaft ${fig(off)} from centre`, 'end'); }
  const thread = get('mount_hole_thread'), holeNote = thread ? `${holes.length} × ${thread}${n('mount_hole_depth') ? `, ${fig(n('mount_hole_depth'))} deep` : ''}` : hole ? `${holes.length} × Ø${fig(hole)}` : '';
  if (holeNote) text(fx, bottom + 78, holeNote);
  // ---- the side, shaft to the right ----
  const halfH = (d / 2) * S;
  if (L) rect(SX(-L), SY(cy + d / 2), L * S, d * S);
  if (top) rect(SX(0), SY(cy + d / 2), top * S, d * S);
  const bossAt = top; if (bossH) rect(SX(bossAt), SY(bossD / 2), bossH * S, bossD * S, '#ddd9cf');
  if (shaftL) rect(SX(bossAt), SY(shaftD / 2), (shaftL + (top ? bossH : 0)) * S, shaftD * S, METAL);
  if (flat) { const tip = bossAt + (top ? bossH : 0) + shaftL; const a = flats === 2 ? across / 2 : across - shaftD / 2; line(SX(tip - flat), SY(a), SX(tip), SY(a), INK, 1.2); if (flats === 2) line(SX(tip - flat), SY(-a), SX(tip), SY(-a), INK, 1.2); }
  line(SX(0), SY(reach), SX(0), SY(-reach), THIN, 0.6, '4 3');
  text(SX(0), SY(reach) - 6, 'mounting face', 'middle', 10);
  const under = SY(cy - d / 2) + halfH * 0 + 6;
  if (L) span(SX(-L), under, SX(0), under, `${fig(L)}`, 14);
  if (shaftL) span(SX(top + (top ? bossH : 0)), under, SX(top + (top ? bossH : 0) + shaftL), under, `shaft ${fig(shaftL)}`, 36);
  if (flat) span(SX(top + (top ? bossH : 0) + shaftL - flat), SY(shaftD / 2) - 4, SX(top + (top ? bossH : 0) + shaftL), SY(shaftD / 2) - 4, `flat ${fig(flat)}`, -14);
  if (bossH) text(SX(bossAt + bossH / 2), under + 74, `boss ${fig(bossH)} high`, 'middle', 11);
  return sheet(set, pens, W, H);
}

// ---------- a draft from a datasheet's text ----------
const UNITS = /(-?\d+(?:\.\d+)?)\s*(mm|N\s?m|N\.m|Ncm|N\.cm|kg\s?cm|kgf?\.?cm|V|A|mH|Ω|ohm|rpm|RPM|Hz|g|kg|°)(?![a-zA-Z])/g;
// Text drawn in a PDF: its streams unpacked, then the strings shown with Tj and TJ. A datasheet that is a picture has none.
export function pdfText(file) {
  const raw = fs.readFileSync(file), latin = raw.toString('latin1'), lines = [];
  for (const m of latin.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = latin.indexOf('endstream', start);
    if (end < 0) continue;
    const body = raw.subarray(start, end);
    let s; try { s = zlib.inflateSync(body).toString('latin1'); } catch { s = body.toString('latin1'); }
    if (!/\b(Tj|TJ)\b/.test(s)) continue;
    for (const block of s.matchAll(/BT([\s\S]*?)ET/g)) {
      const words = [...block[1].matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((x) => (x[1] != null ? [...x[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map((y) => y[1]).join('') : x[2]));
      const t = words.join(' ').replace(/\\([()\\])/g, '$1').trim();
      if (t) lines.push(t);
    }
  }
  return lines;
}

/** Every figure a datasheet's text gives, as a rule set of estimates for a person to name and check. @returns {{ set: object, found: number }} */
export function draftSet(name, file) {
  if (!fs.existsSync(file)) throw new Error(`no file ${file}`);
  const lines = pdfText(file), rules = {}, stamp = new Date().toISOString().slice(0, 10), source = path.basename(file);
  let i = 0;
  for (const line of lines) for (const m of line.matchAll(UNITS)) {
    i += 1;
    rules[`figure_${String(i).padStart(3, '0')}`] = { value: Number(m[1]), unit: m[2], rule: `DRAFT: name and check me. From: "${line.slice(0, 120)}"`, kind: 'estimate', source, checked: stamp };
  }
  return { set: { _doc: `A draft from ${source}: rename each figure from vocabulary.json, delete the ones you don't want, and only then change its kind to spec.`, name, rules }, found: i };
}

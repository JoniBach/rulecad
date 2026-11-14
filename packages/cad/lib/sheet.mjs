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

// A round part from its end and along its axis: linear bearings, nuts, couplers, pulleys, idlers, rods. Each says what it has: flange, hole circle, a dashed pitch circle, the bores of a coupler
function roundDrawing(set, { D, d = 0, L, bores, flange, circle: holeCircle, pitchD, notes = [] }) {
  const R = Math.max(D, flange?.D ?? 0) / 2, S = Math.max(3, Math.min(14, 90 / R)), W = 2 * R * S + L * S + 340, H = 2 * R * S + 190;
  const cx = R * S + 70, cy = H / 2 + 22, sx = cx + R * S + 120, top = cy - R * S, bottom = cy + R * S;
  const pens = pen(), { line, circle, rect, text, span } = pens;
  // ---- from the end ----
  if (flange) circle(cx, cy, (flange.D / 2) * S, '#f6f4ee');
  circle(cx, cy, (D / 2) * S, FILL);
  if (pitchD) circle(cx, cy, (pitchD / 2) * S, 'none', THIN);
  if (d) circle(cx, cy, (d / 2) * S, '#fff');
  if (holeCircle) for (let i = 0; i < holeCircle.count; i++) { const a = (2 * Math.PI * i) / holeCircle.count; circle(cx + (holeCircle.D / 2) * Math.cos(a) * S, cy + (holeCircle.D / 2) * Math.sin(a) * S, (holeCircle.hole / 2) * S, '#fff'); }
  line(cx - R * S - 8, cy, cx + R * S + 8, cy, THIN, 0.5, '8 3 2 3'); line(cx, cy - R * S - 8, cx, cy + R * S + 8, THIN, 0.5, '8 3 2 3');
  span(cx - R * S, bottom + 6, cx + R * S, bottom + 6, `Ø${fig(flange?.D ?? D)}`, 18);
  if (d) span(cx - (d / 2) * S, top - 6, cx + (d / 2) * S, top - 6, `bore Ø${fig(d)}`, -14);
  // ---- along the axis ----
  const ring = (x, len, a, b, fill = FILL) => { for (const side of [-1, 1]) rect(x, side < 0 ? cy - (b / 2) * S : cy + (a / 2) * S, len * S, ((b - a) / 2) * S, fill); };
  if (bores) { ring(sx, L / 2, bores[0], D); ring(sx + (L / 2) * S, L / 2, bores[1], D); }
  else if (d) ring(sx, L, d, D);
  else rect(sx, cy - (D / 2) * S, L * S, D * S, METAL);
  if (flange) ring(sx + flange.at * S, flange.w, d, flange.D, '#ddd9cf');
  line(sx - 12, cy, sx + L * S + 12, cy, THIN, 0.5, '8 3 2 3');
  span(sx, bottom + 6, sx + L * S, bottom + 6, `${fig(L)}`, 18);
  span(sx + L * S + 6, cy - (D / 2) * S, sx + L * S + 6, cy + (D / 2) * S, `Ø${fig(D)}`, 30);
  notes.forEach((t, i) => text(cx, bottom + 66 + i * 18, t, 'middle', 11));
  return sheet(set, pens, W, H);
}

// A lead screw from the side: the crest and root, the starts' flanks, and pitch against lead
function leadScrewDrawing(set) {
  const n = (k) => set.rules[k]?.value ?? 0, D = n('diameter'), root = n('root_diameter'), P = n('pitch'), lead = n('lead'), starts = n('starts') || 1;
  const L = Math.max(3 * lead, 20), S = Math.min(14, 420 / L), W = L * S + 240, H = D * S + 200, x0 = 110, cy = H / 2 + 12;
  const pens = pen(), { line, rect, text, span } = pens;
  rect(x0, cy - (D / 2) * S, L * S, D * S, METAL);
  for (const side of [-1, 1]) line(x0, cy + side * (root / 2) * S, x0 + L * S, cy + side * (root / 2) * S, THIN, 0.6, '4 3');
  const lean = (D * S * Math.tan((n('helix_angle') * Math.PI) / 180)) / 2;
  for (let i = 0; i * P <= L + 1e-9; i++) { const x = x0 + i * P * S; if (x - lean >= x0 && x + lean <= x0 + L * S) line(x - lean, cy + (D / 2) * S, x + lean, cy - (D / 2) * S, i % starts === 0 ? INK : THIN, i % starts === 0 ? 1.6 : 0.7); }
  line(x0 - 12, cy, x0 + L * S + 12, cy, THIN, 0.5, '8 3 2 3');
  const below = cy + (D / 2) * S + 6, above = cy - (D / 2) * S - 6;
  span(x0, below, x0 + P * S, below, `pitch ${fig(P)}`, 18);
  span(x0, below, x0 + lead * S, below, `lead ${fig(lead)}`, 44);
  span(x0 + L * S + 6, cy - (D / 2) * S, x0 + L * S + 6, cy + (D / 2) * S, `Ø${fig(D)}`, 30);
  span(x0 - 6, cy - (root / 2) * S, x0 - 6, cy + (root / 2) * S, `root Ø${fig(root)}`, -18);
  text(x0 + (L * S) / 2, above - 8, `${set.rules.thread?.value ?? ''}, ${fig(starts)} start${starts > 1 ? 's' : ''}, helix ${fig(n('helix_angle'))}°`, 'middle', 12);
  text(x0 + (L * S) / 2, below + 72, 'each dark line one start, repeating at the lead', 'middle', 11);
  return sheet(set, pens, W, H);
}

// A short length of belt, teeth along it
function beltDrawing(set) {
  const n = (k) => set.rules[k]?.value ?? 0, P = n('pitch'), w = n('width'), L = P * 8, S = 12, W = L * S + 220, H = w * S + 190, x0 = 90, cy = H / 2 + 10;
  const pens = pen(), { line, rect, text, span } = pens;
  rect(x0, cy - (w / 2) * S, L * S, w * S);
  for (let i = 0; i <= 8; i++) line(x0 + i * P * S, cy - (w / 2) * S, x0 + i * P * S, cy + (w / 2) * S, THIN, 0.7);
  span(x0, cy + (w / 2) * S + 6, x0 + P * S, cy + (w / 2) * S + 6, `pitch ${fig(P)}`, 18);
  span(x0 + L * S + 6, cy - (w / 2) * S, x0 + L * S + 6, cy + (w / 2) * S, `${fig(w)}`, 18);
  text(x0 + (L * S) / 2, cy + (w / 2) * S + 66, `${fig(n('stiffness'))} N per unit strain, pitch line ${n('pitch_line_offset')} beyond the teeth`, 'middle', 11);
  text(x0 + (L * S) / 2, cy + (w / 2) * S + 84, `rated ${fig(n('rated_tension'))} N, breaks at ${fig(n('breaking_strength'))} N`, 'middle', 11);
  return sheet(set, pens, W, H);
}

// A thread set: the screw in each head form it has, its nuts and washer from above and from the side, and its holes,
// every one dimensioned from the set's own figures, to hold against the standard's table. Seats are level across the
// row: a head stands above the line, a countersunk head sits under it, and a length runs from that line to the tip.
function threadDrawing(set) {
  const n = (k) => (typeof set.rules[k]?.value === 'number' ? set.rules[k].value : 0), has = (k) => n(k) > 0, says = (k) => String(set.rules[k]?.value ?? '');
  const d = n('major_diameter'), P = n('pitch'), lengths = Array.isArray(set.rules.lengths?.value) ? set.rules.lengths.value : [];
  const L = lengths.find((l) => l >= 2.5 * d) ?? lengths.at(-1) ?? 3 * d; // a length it is sold in, near three diameters
  const heads = [
    has('head') && { name: 'socket cap', form: 'cap', D: n('head'), k: n('head_height'), key: n('head_key') },
    has('button_head') && { name: 'button', form: 'button', D: n('button_head'), k: n('button_head_height'), key: n('button_key') },
    has('countersunk_head') && { name: `countersunk ${fig(n('countersunk_angle'))}°`, form: 'countersunk', D: n('countersunk_head'), k: n('countersunk_head_height') || (n('countersunk_head') - d) / 2 / Math.tan((n('countersunk_angle') * Math.PI) / 360), key: n('countersunk_key') },
    has('hex_head_flats') && { name: 'hexagon', form: 'hex', D: n('hex_head_flats'), k: n('hex_head_height'), note: 'across flats' },
    has('pan_head') && { name: 'pan', form: 'pan', D: n('pan_head'), k: n('pan_head_height'), note: says('pan_head_drive') },
  ].filter(Boolean);
  if (!heads.length) heads.push({ name: 'thread', form: 'stud', D: d, k: 0 });
  const nuts = [
    has('nut_flats') && { name: 'hexagon nut', s: n('nut_flats'), m: n('nut_height'), sides: 6 },
    has('square_nut_flats') && { name: 'square nut', s: n('square_nut_flats'), m: n('square_nut_height'), sides: 4 },
    has('lock_nut_height') && { name: 'lock nut', s: n('lock_nut_flats') || n('nut_flats'), m: n('lock_nut_height'), sides: 6 },
    has('washer_diameter') && { name: 'washer', s: n('washer_diameter'), m: n('washer_thickness'), bore: n('washer_bore') },
  ].filter(Boolean);
  const holes = [['tap drill', 'tap_drill'], ['close', 'clearance_close'], ['normal', 'clearance'], ['loose', 'clearance_loose'], ['pilot in plastic', 'pilot'], ['insert hole', 'insert_hole']].filter(([, k]) => has(k)).map(([name, k]) => ({ name, D: n(k), ring: k === 'insert_hole' ? n('insert_diameter') : k === 'pilot' ? n('pilot_boss') : k.startsWith('clearance') ? d : 0 })); // (dashed round a hole: an insert's knurls, a pilot's boss; grey inside one: the thread passing through)
  const widest = Math.max(d, ...heads.map((h) => h.D), ...nuts.map((x) => x.s), ...holes.map((h) => Math.max(h.D, h.ring))), S = Math.max(3, Math.min(16, 90 / widest));
  const col = widest * S + 84, count = Math.max(heads.length, nuts.length, 3), X = (i) => 60 + col * (i + 0.5);
  const big = Math.max(0, ...holes.map((h) => Math.max(h.D, h.ring))) * S, holeCol = Math.max(big + 64, Math.min(col, (count * col) / Math.max(holes.length, 1))), HX = (i) => 60 + holeCol * (i + 0.5); // (holes are small: their row is spaced closer, so six fit under four screws)
  const W = Math.max(count * col, holes.length * holeCol) + 80;
  const pens = pen(), { out, line, circle, rect, text, span } = pens, poly = (pts, fill = FILL) => out.push(`<polygon points="${pts.map(([a, b]) => `${fig(a)},${fig(b)}`).join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="1.2"/>`);
  // ---- the screws, from the side ----
  const maxK = Math.max(...heads.map((h) => (h.form === 'countersunk' ? 0 : h.k))), yFace = 92 + maxK * S, yTip = yFace + L * S, root = (has('root_diameter') ? (d - n('root_diameter')) / 2 : 0.6134 * P) * S; // (its root where the set gives one; else an external thread is 0.6134 of its pitch deep: ISO 68-1)
  heads.forEach((h, i) => {
    const cx = X(i), r = (h.D / 2) * S, kS = h.k * S, sunk = h.form === 'countersunk', top = sunk ? yFace : yFace - kS, under = sunk ? yFace + kS : yFace;
    rect(cx - (d / 2) * S, under, d * S, yTip - under, METAL);
    for (const side of [-1, 1]) line(cx + side * ((d / 2) * S - root), under + 2, cx + side * ((d / 2) * S - root), yTip, THIN, 0.6, '4 3');
    if (h.form === 'cap' || h.form === 'hex') rect(cx - r, top, 2 * r, kS, METAL);
    if (h.form === 'pan') out.push(`<rect x="${fig(cx - r)}" y="${fig(top)}" width="${fig(2 * r)}" height="${fig(kS)}" rx="${fig(Math.min(kS, r) * 0.45)}" fill="${METAL}" stroke="${INK}" stroke-width="1.2"/>`);
    if (h.form === 'button') { const R = (r * r + kS * kS) / (2 * kS); out.push(`<path d="M ${fig(cx - r)} ${fig(yFace)} A ${fig(R)} ${fig(R)} 0 0 1 ${fig(cx + r)} ${fig(yFace)} Z" fill="${METAL}" stroke="${INK}" stroke-width="1.2"/>`); }
    if (sunk) poly([[cx - r, top], [cx + r, top], [cx + (d / 2) * S, under], [cx - (d / 2) * S, under]], METAL);
    if (h.key) { const kw = (h.key / 2) * S, deep = Math.min(kS * 0.6, h.key * S); for (const side of [-1, 1]) line(cx + side * kw, top, cx + side * kw, top + deep, THIN, 0.7, '3 2'); line(cx - kw, top + deep, cx + kw, top + deep, THIN, 0.7, '3 2'); }
    if (h.form !== 'stud') span(cx - r, top - 6, cx + r, top - 6, `${h.form === 'hex' ? '' : 'Ø'}${fig(h.D)}`, -14);
    if (h.k) span(cx + r + 6, top, cx + r + 6, top + kS, fig(h.k), 12);
    if (i === 0) { span(cx - (d / 2) * S, yTip + 6, cx + (d / 2) * S, yTip + 6, `Ø${fig(d)}`, 14); span(cx - Math.max(r, (d / 2) * S) - 6, yFace, cx - Math.max(r, (d / 2) * S) - 6, yTip, fig(L), -14); }
    text(cx, yTip + 58, h.name);
    const under2 = [h.key ? `key ${fig(h.key)}` : '', h.note || ''].filter(Boolean).join(', ');
    if (under2) text(cx, yTip + 74, under2, 'middle', 11);
  });
  line(40, yFace, W - 40, yFace, THIN, 0.5, '8 3 2 3');
  // ---- nuts and the washer: from above, then from the side ----
  const tall = Math.max(0, ...nuts.map((x) => (x.sides === 6 ? x.s * 2 / Math.sqrt(3) : x.s))) * S, yPlan = yTip + 104 + tall / 2, ySide = yPlan + tall / 2 + 48, maxM = Math.max(0, ...nuts.map((x) => x.m)) * S;
  nuts.forEach((x, i) => {
    const cx = X(i), r = (x.s / 2) * S, across = x.sides === 6 ? x.s * S / Math.sqrt(3) : r;
    if (x.sides === 6) poly([[r, across / 2], [0, across], [-r, across / 2], [-r, -across / 2], [0, -across], [r, -across / 2]].map(([a, b]) => [cx + a, yPlan + b]));
    else if (x.sides === 4) rect(cx - r, yPlan - r, 2 * r, 2 * r);
    else circle(cx, yPlan, r, FILL);
    circle(cx, yPlan, ((x.bore || d) / 2) * S, '#fff');
    span(cx - r, yPlan + tall / 2 + 4, cx + r, yPlan + tall / 2 + 4, `${x.sides ? '' : 'Ø'}${fig(x.s)}`, 14);
    const half = x.sides === 6 ? across : r;
    rect(cx - half, ySide, 2 * half, x.m * S, METAL);
    span(cx + half + 6, ySide, cx + half + 6, ySide + x.m * S, fig(x.m), 12);
    text(cx, ySide + maxM + 20, x.name);
    if (x.bore) text(cx, ySide + maxM + 36, `hole Ø${fig(x.bore)}`, 'middle', 11);
    else if (x.sides) text(cx, ySide + maxM + 36, 'across flats', 'middle', 11);
  });
  // ---- the holes ----
  const yHole = (nuts.length ? ySide + maxM + 62 : yTip + 104) + big / 2;
  holes.forEach((h, i) => {
    const cx = HX(i);
    if (h.ring > h.D) out.push(`<circle cx="${fig(cx)}" cy="${fig(yHole)}" r="${fig((h.ring / 2) * S)}" fill="none" stroke="${THIN}" stroke-width="0.8" stroke-dasharray="4 3"/>`);
    circle(cx, yHole, (h.D / 2) * S, '#fff');
    if (h.ring && h.ring < h.D) out.push(`<circle cx="${fig(cx)}" cy="${fig(yHole)}" r="${fig((h.ring / 2) * S)}" fill="${METAL}" stroke="${THIN}" stroke-width="0.8"/>`);
    span(cx - (h.D / 2) * S, yHole + big / 2 + 4, cx + (h.D / 2) * S, yHole + big / 2 + 4, `Ø${fig(h.D)}`, 14);
    text(cx, yHole + big / 2 + 50, h.name);
  });
  // ---- what a drawing can't show ----
  const notes = [
    `${says('thread')}, ${says('thread_form')}: pitch ${fig(P)}${has('pitch_fine') ? `, fine ${fig(n('pitch_fine'))}` : ''}${has('set_screw_key') ? `, set screw key ${fig(n('set_screw_key'))}` : ''}${says('thread_form') === 'unified' ? ' (divide by 25.4 for the inch table)' : ''}`,
    lengths.length ? `socket cap lengths: ${lengths.map(fig).join(', ')}` : '',
    has('proof_stress') ? `${has('property_class') ? `class ${fig(n('property_class'))}: ` : ''}proof stress ${fig(n('proof_stress'))} MPa${has('stainless_proof_stress') ? `; ${says('stainless_class')}: ${fig(n('stainless_proof_stress'))} MPa` : ''}` : '',
    has('insert_hole') ? `insert${has('insert_diameter') ? ` Ø${fig(n('insert_diameter'))}` : ''}${has('insert_length') ? ` × ${fig(n('insert_length'))} long` : ''} (dashed) in a Ø${fig(n('insert_hole'))} hole${has('insert_taper') ? `, tapered ${fig(n('insert_taper'))}°` : ''}${has('insert_wall') ? `, ${fig(n('insert_wall'))} of wall round it at least` : ''}` : '',
    has('pilot') ? `pilot Ø${fig(n('pilot'))}${has('pilot_depth') ? `, ${fig(n('pilot_depth'))} deep at least` : ''}${has('pilot_boss') ? `, in a boss of Ø${fig(n('pilot_boss'))} at least (dashed)` : ''}: a starting figure, your printer's measured one comes first` : '',
  ].filter(Boolean);
  const yNotes = (holes.length ? yHole + big / 2 + 80 : nuts.length ? ySide + maxM + 66 : yTip + 104);
  notes.forEach((t, i) => text(40, yNotes + i * 17, t, 'start', 11));
  return sheet(set, pens, Math.max(W, 620), yNotes + notes.length * 17 - 50);
}

export function drawing(set, vocab) {
  if (set.part === 'thread') return threadDrawing(set);
  if (set.part === 'bearing') return bearingDrawing(set);
  if (set.part === 'driver') return driverDrawing(set);
  const v = (k) => set.rules[k]?.value ?? 0;
  if (set.part === 'leadscrew') return leadScrewDrawing(set);
  if (set.part === 'belt') return beltDrawing(set);
  if (set.part === 'linear_bearing') return roundDrawing(set, { D: v('outer_diameter'), d: v('bore'), L: v('length'), notes: [`linear bearing: ${fig(v('dynamic_rating'))} N dynamic, ${fig(v('static_rating'))} N static`] });
  if (set.part === 'nut') { return roundDrawing(set, { D: v('body_diameter'), d: v('diameter'), L: v('length'), flange: { D: v('flange_diameter'), w: v('flange_width'), at: v('flange_offset') }, circle: { D: v('hole_circle'), count: v('hole_count'), hole: v('mount_hole_diameter') || 3.5 }, notes: [`${set.rules.thread?.value ?? ''}, ${set.rules.material?.value ?? ''}, lead ${fig(v('lead'))}`, `${fig(v('hole_count'))} × Ø${fig(v('mount_hole_diameter'))} on Ø${fig(v('hole_circle'))}`] }); }
  if (set.part === 'coupler') return roundDrawing(set, { D: v('outer_diameter'), L: v('length'), bores: [v('bore_a'), v('bore_b')], d: 0, notes: [`bores Ø${fig(v('bore_a'))} and Ø${fig(v('bore_b'))}`, String(set.rules.style?.value ?? '')] });
  if (set.part === 'pulley' || set.part === 'idler') return roundDrawing(set, { D: v('outer_diameter'), d: v('bore'), L: v('body_width'), pitchD: v('pitch_diameter'), notes: [set.part === 'pulley' ? `${fig(v('teeth'))} teeth, pitch circle Ø${fig(v('pitch_diameter'))} (thin), across the teeth Ø${fig(v('tooth_diameter'))}` : `${set.rules.toothed?.value === 'yes' ? `${fig(v('teeth'))} teeth` : 'smooth'}, for ${fig(v('belt_width'))} mm belt`, set.part === 'pulley' ? `for ${fig(v('belt_width'))} mm belt` : ''] });
  if (set.part === 'rod') return roundDrawing(set, { D: v('diameter'), L: 40, notes: [`${String(set.rules.tolerance?.value ?? '')}; ${String(set.rules.hardness?.value ?? '')}`] });
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

// cad measure <model> --profile <name>: a beam's section read from a model from elsewhere (STL, 3MF) or from a DXF of
// the section, and written as a draft profile set with its outline in the workspace's rules/. The outline is the
// model's shape, so it goes into the person's own workspace with its source and licence, and nowhere else: the kit
// holds only outlines drawn for it. What is read off it (size, slots, bores) is measurement: kind derived, to check
// against the bar in hand.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signedArea, polygonSection, slotModel } from '@rulecad/frames';
import { fmt } from './rules.mjs';
import { WS, paths, RULE_DIRS } from './workspace.mjs';
import { picture } from './preview.mjs';
import { AXES, axisOf, readMesh, bounds, section, profiles, loops as chain, limitingLicence } from './mesh.mjs';

const f2 = (n) => fmt(Math.round(n * 100) / 100), r2 = (n) => Math.round(n * 100) / 100, today = () => new Date().toISOString().slice(0, 10);
const RAD = Math.PI / 180;

// ---------- a DXF section ----------
const REFUSED = { SPLINE: 'a spline', ELLIPSE: 'an ellipse', POLYLINE: 'an old-style POLYLINE', INSERT: 'a block (INSERT)', HATCH: 'a hatch', '3DFACE': 'a 3D face', MLINE: 'a multiline', REGION: 'a region', LEADER: 'a leader' };
const IGNORED = new Set(['TEXT', 'MTEXT', 'DIMENSION', 'POINT', 'ATTDEF', 'ATTRIB', 'VIEWPORT']);
const UNITS = { 0: 1, 4: 1, 1: 25.4, 5: 10, 6: 1000 }; // $INSUNITS: unitless and mm as they are, inches, cm, m

/**
 * A DXF's section as closed loops in mm. Reads LINE, LWPOLYLINE (with its bulges), ARC and CIRCLE from the ENTITIES
 * section; text and dimensions are passed over; a SPLINE, an ELLIPSE or a block is refused by name, since guessing at
 * one would put a wrong outline in a rule set. @param {string} text @returns {{ loops: number[][][], notes: string[] }}
 */
export function readDxf(text, { chord = 0.002 } = {}) {
  const lines = String(text).split(/\r?\n/), pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const code = Number(lines[i].trim()); if (!Number.isInteger(code)) throw new Error(`not a DXF: line ${i + 1} should be a group code (a whole number), and is ${JSON.stringify(lines[i].slice(0, 30))}`); pairs.push([code, lines[i + 1].trim()]); }
  if (!pairs.some(([c, v]) => c === 0 && v === 'SECTION')) throw new Error('not a DXF: it has no SECTION (an ASCII DXF is wanted, not a binary one or a DWG)');
  let scale = 1; const notes = [];
  const units = pairs.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (units >= 0) { const u = Number(pairs[units + 1]?.[1]); if (!(u in UNITS)) throw new Error(`the DXF's units ($INSUNITS ${u}) are not ones this reads: millimetres (4), inches (1), centimetres (5), metres (6) or none (taken as mm)`); scale = UNITS[u]; if (scale !== 1) notes.push(`its units are ${{ 1: 'inches', 5: 'centimetres', 6: 'metres' }[u]}: turned into mm`); }
  else notes.push('it names no units ($INSUNITS): taken as mm');
  const start = pairs.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && pairs[i - 1]?.[1] === 'SECTION');
  if (start < 0) throw new Error('the DXF has no ENTITIES section: nothing is drawn in it');
  const entities = []; let cur = null;
  for (let i = start + 1; i < pairs.length; i++) { const [c, v] = pairs[i]; if (c === 0) { if (v === 'ENDSEC') break; cur = { type: v, codes: [] }; entities.push(cur); } else if (cur) cur.codes.push([c, v]); }
  const segs = [], closed = [], passed = new Map();
  // an arc as chords that stay within `chord` mm of it; a model's circle is likewise facets with their corners on it
  const arc = (cx, cy, r, a0, sweep) => { const c = chord / scale, n = Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.acos(Math.max(0, 1 - c / Math.max(r, c)))))); return Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos(a0 + (sweep * k) / n), cy + r * Math.sin(a0 + (sweep * k) / n)]); };
  const bulged = (p, q, b) => { // the arc from p to q that a polyline's bulge asks for: b is tan of a quarter of its angle
    if (!b) return [p, q];
    const dx = q[0] - p[0], dy = q[1] - p[1], c = Math.hypot(dx, dy); if (!c) return [p];
    const d = ((c / 2) * (1 - b * b)) / (2 * b), cx = (p[0] + q[0]) / 2 - (dy / c) * d, cy = (p[1] + q[1]) / 2 + (dx / c) * d;
    const pts = arc(cx, cy, Math.hypot(p[0] - cx, p[1] - cy), Math.atan2(p[1] - cy, p[0] - cx), 4 * Math.atan(b)); pts[0] = p; pts[pts.length - 1] = q; return pts;
  };
  for (const e of entities) {
    const g = (code) => { const x = e.codes.find(([c]) => c === code); return x ? Number(x[1]) : undefined; }, all = (code) => e.codes.filter(([c]) => c === code).map(([, v]) => Number(v));
    if (REFUSED[e.type]) throw new Error(`the DXF has ${REFUSED[e.type]} (${e.type}), which this does not read: export the section as lines, arcs and polylines (most CAD programs can "explode" or "convert to polyline"), and measure that`);
    if (e.type === 'LINE') segs.push([[g(10), g(20)], [g(11), g(21)]]);
    else if (e.type === 'CIRCLE') closed.push(arc(g(10), g(20), g(40), 0, 2 * Math.PI).slice(0, -1));
    else if (e.type === 'ARC') { const a0 = g(50) * RAD; let sweep = (g(51) - g(50)) * RAD; while (sweep <= 0) sweep += 2 * Math.PI; const pts = arc(g(10), g(20), g(40), a0, sweep); for (let k = 0; k + 1 < pts.length; k++) segs.push([pts[k], pts[k + 1]]); }
    else if (e.type === 'LWPOLYLINE') {
      const pts = [], isClosed = ((g(70) ?? 0) & 1) === 1; let b = null;
      for (const [c, v] of e.codes) { if (c === 10) { pts.push({ p: [Number(v), 0], b: 0 }); b = pts[pts.length - 1]; } else if (c === 20 && b) b.p[1] = Number(v); else if (c === 42 && b) b.b = Number(v); }
      const out = [];
      for (let k = 0; k < pts.length - (isClosed ? 0 : 1); k++) { const run = bulged(pts[k].p, pts[(k + 1) % pts.length].p, pts[k].b); out.push(...run.slice(0, -1)); if (!isClosed && k === pts.length - 2) out.push(run[run.length - 1]); }
      if (isClosed) closed.push(out); else for (let k = 0; k + 1 < out.length; k++) segs.push([out[k], out[k + 1]]);
    } else if (IGNORED.has(e.type)) passed.set(e.type, (passed.get(e.type) || 0) + 1);
    else throw new Error(`the DXF has a ${e.type}, which this does not read: a section is LINE, LWPOLYLINE, ARC and CIRCLE entities`);
    if ([...all(10), ...all(20)].some((x) => !Number.isFinite(x))) throw new Error(`the DXF's ${e.type} has a coordinate that is not a number`);
  }
  if (passed.size) notes.push(`passed over: ${[...passed].map(([t, n]) => `${n} ${t}`).join(', ')}`);
  // lines and arcs drawn one by one: joined end to end into loops, which must close
  for (const line of chain(segs, 1e-3)) {
    const gap = Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]);
    if (gap > 0.01) throw new Error(`the DXF's outline is not closed: a run of ${line.length - 1} lines and arcs ends ${f2(gap * scale)} mm from where it starts, at ${f2(line[line.length - 1][0] * scale)}, ${f2(line[line.length - 1][1] * scale)}. Close the gap (or delete the stray line) and measure again`);
    closed.push(line.slice(0, -1));
  }
  if (!closed.length) throw new Error('the DXF has no outline: no LINE, LWPOLYLINE, ARC or CIRCLE in its ENTITIES section');
  return { loops: closed.map((l) => l.map(([x, y]) => [x * scale, y * scale])), notes };
}

// ---------- the section of a model ----------
// The loops of the longest stretch of a mesh that keeps one cross-section
function meshSection(file, along) {
  const tris = readMesh(file), B = bounds(tris), axis = along ? axisOf(along) : B.size.indexOf(Math.max(...B.size));
  const runs = profiles(tris, axis).filter((r) => !r.varies && !r.empty).sort((a, b) => b.to - b.from - (a.to - a.from));
  if (!runs.length) throw new Error(`${path.basename(file)} has no stretch along ${AXES[axis]} that keeps one cross-section: a beam's profile is measured where its section is constant (--along x|y|z picks another axis)`);
  const run = runs[0], lines = chain(section(tris, axis, run.at));
  for (const l of lines) if (Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) > 1e-3) throw new Error(`${path.basename(file)}: its section at ${AXES[axis]} = ${f2(run.at)} is not closed outlines (the mesh has open edges there)`);
  return { loops: lines.map((l) => l.slice(0, -1)), says: `the section across ${AXES[axis]} at ${f2(run.at)}, the middle of a stretch of ${f2(run.to - run.from)} mm that keeps it (of ${f2(B.size[axis])} mm)`, length: run.to - run.from };
}

// Loops tidied: no point twice, no point in the middle of a straight run, nothing with no area; about the middle of
// the envelope, lying flat (wider than high), the outside counter-clockwise and holes clockwise
export function tidy(loops) {
  let out = loops.map((l) => { const p = l.filter((q, i) => { const n = l[(i + 1) % l.length]; return Math.hypot(q[0] - n[0], q[1] - n[1]) > 1e-6; }); return p.filter((q, i) => { const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length]; return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-7 * (1 + Math.hypot(b[0] - a[0], b[1] - a[1])); }); }).filter((l) => l.length >= 3 && Math.abs(signedArea(l)) > 1e-6);
  if (!out.length) throw new Error('the section has no outline with any area');
  const xs = out.flat().map((p) => p[0]), ys = out.flat().map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let turned = false; out = out.map((l) => l.map(([x, y]) => [x - cx, y - cy]));
  if (Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs) + 1e-6) { out = out.map((l) => l.map(([x, y]) => [y, -x])); turned = true; }
  out.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const inside = ([x, y], loop) => { let inn = false; for (let i = 0, n = loop.length; i < n; i++) { const [ax, ay] = loop[i], [bx, by] = loop[(i + 1) % n]; if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inn = !inn; } return inn; };
  out = out.map((l, i) => { const depth = out.filter((o, j) => j !== i && inside(l[0], o)).length; return (depth % 2 === 0) === signedArea(l) > 0 ? l : l.slice().reverse(); });
  return { loops: out.map((l) => l.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])), turned };
}

// ---------- what a section has ----------
const FACES = { top: { n: [0, 1], a: [1, 0] }, bottom: { n: [0, -1], a: [1, 0] }, front: { n: [-1, 0], a: [0, 1] }, back: { n: [1, 0], a: [0, 1] } };

// One slot from its run of the outline in face coordinates [u along the face, v below it], mouth to mouth
function slotOf(run) {
  const D = Math.max(...run.map((p) => p[1])), n = 600, step = D / n, mouth = Math.abs(run[run.length - 1][0] - run[0][0]), centre = (run[0][0] + run[run.length - 1][0]) / 2;
  const width = (v) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i + 1 < run.length; i++) { const [a, b] = [run[i], run[i + 1]]; if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) { const u = a[0] + ((v - a[1]) * (b[0] - a[0])) / (b[1] - a[1]); lo = Math.min(lo, u); hi = Math.max(hi, u); } } return hi - lo; };
  const w = Array.from({ length: n }, (_, k) => width((k + 0.5) * step)), widest = Math.max(...w);
  // the neck: from the face down to where the width jumps toward the cavity's
  let least = w[0], neck = -1;
  for (let k = 0; k < n; k++) { least = Math.min(least, w[k]); if (widest - least > 0.2 && w[k] > least + 0.5 * (widest - least)) { neck = k; break; } }
  if (neck < 0) return { kind: 'groove', centre, mouth, depth: D }; // no wider below than at its mouth: a groove, not a slot for a nut
  const opening = Math.min(...w.slice(0, neck));
  let tip = 0; for (let k = 0; k < neck; k++) if (w[k] <= opening + 0.05) tip = k; // the last depth still at the opening: the lip's tip
  const lip = (tip + 1) * step;
  let straight = neck; for (let k = neck; k < n; k++) if (w[k] >= widest - 0.05) straight = k;
  const floor = w[n - 1], out = { kind: 'slot', centre, mouth, opening, lip, cavityWidth: widest, cavityDepth: D, floorWidth: floor };
  if (floor < widest - 0.1) { out.flankAngle = Math.atan2(D - (straight + 1) * step, (widest - floor) / 2) / RAD; if (!(out.flankAngle > 1)) { delete out.flankAngle; out.floorWidth = widest; } } else out.floorWidth = widest;
  if (mouth > opening + 0.2) { let k = 0; while (k < neck && w[k] > opening + 0.05) k++; out.trackWidth = mouth; out.trackAngle = (2 * Math.atan2((mouth - opening) / 2, Math.max(k * step, step))) / RAD; }
  return out;
}

/**
 * What a section has, from its tidied loops: the envelope, each face's slots (opening, lip, width under the lips,
 * depth, floor, flanks, a V mouth), round bores and other hollows.
 * @param {number[][][]} loops the outside first (counter-clockwise), then holes
 */
export function findFeatures(loops) {
  const outer = loops[0], xs = outer.map((p) => p[0]), ys = outer.map((p) => p[1]), W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys), on = 0.25;
  const faces = {};
  for (const [face, { n, a }] of Object.entries(FACES)) {
    const half = n[0] ? W / 2 : H / 2, across = n[0] ? H : W, uv = outer.map(([x, y]) => [x * a[0] + y * a[1], half - (x * n[0] + y * n[1])]), N = uv.length, found = [];
    const start = uv.findIndex((p, i) => p[1] <= on && uv[(i + 1) % N][1] > on);
    if (start >= 0) for (let i = 0; i < N; i++) {
      const k = (start + i) % N; if (!(uv[k][1] <= on && uv[(k + 1) % N][1] > on)) continue;
      const run = [uv[k]]; let j = (k + 1) % N; while (uv[j][1] > on && run.length <= N) { run.push(uv[j]); j = (j + 1) % N; } run.push(uv[j]);
      const deep = Math.max(...run.map((p) => p[1])), wide = Math.max(...run.map((p) => p[0])) - Math.min(...run.map((p) => p[0]));
      if (deep >= (n[0] ? W : H) - on || wide > across * 0.9 || deep < 0.5) continue; // round a corner to another face, or a scratch
      const s = slotOf(run[0][0] <= run[run.length - 1][0] ? run : run.slice().reverse());
      found.push({ ...s, face, at: [a[0] * s.centre + n[0] * half, a[1] * s.centre + n[1] * half] });
    }
    faces[face] = found.sort((p, q) => p.centre - q.centre);
  }
  const bores = [], hollows = [];
  for (const l of loops.slice(1)) {
    const p = polygonSection([l.slice().reverse()]), c = p.centroid, rs = l.map(([x, y]) => Math.hypot(x - c[0], y - c[1])), mean = rs.reduce((s, r) => s + r, 0) / rs.length;
    const bx = l.map((q) => q[0]), by = l.map((q) => q[1]);
    if (Math.max(...rs) - Math.min(...rs) < 0.03 * mean + 0.03) bores.push({ at: [r2(c[0]), r2(c[1])], diameter: 2 * mean });
    else hollows.push({ at: [r2(c[0]), r2(c[1])], width: Math.max(...bx) - Math.min(...bx), height: Math.max(...by) - Math.min(...by), area: p.area });
  }
  return { width: W, height: H, faces, bores, hollows, area: polygonSection(loops).area };
}

// ---------- slots against the families there are ----------
const DIMS = [['opening', 'opening'], ['lip_thickness', 'lip'], ['cavity_width', 'cavityWidth'], ['cavity_depth', 'cavityDepth']];
function allSets() { // every rule set by name, the workspace's own first
  const found = new Map();
  for (const d of RULE_DIRS) if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.json') && !['package.json', 'vocabulary.json'].includes(f) && !found.has(f.slice(0, -5))) found.set(f.slice(0, -5), path.join(d, f));
  return found;
}
/** The slot family nearest a measured slot, and how far off its worst figure is: { name, off } or null where there is none */
export function nearestFamily(slot, families) {
  let best = null;
  for (const [name, set] of Object.entries(families)) { const off = Math.max(...DIMS.map(([rule, k]) => Math.abs((set.rules[rule]?.value ?? Infinity) - slot[k]))); if (!best || off < best.off) best = { name, off }; }
  return best;
}

// ---------- the drawing ----------
function drawingSvg({ name, file, loops, feat, groups, bores, source, licence }) {
  const W = feat.width, H = feat.height, S = Math.min(22, 560 / Math.max(W, H)), pad = 150, w = W * S + 2 * pad, top = 110, X = (x) => pad + (x + W / 2) * S, Y = (y) => top + (H / 2 - y) * S;
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const d = loops.map((l) => `M ${l.map(([x, y]) => `${X(x).toFixed(2)} ${Y(y).toFixed(2)}`).join(' L ')} Z`).join(' ');
  let body = `<path d="${d}" fill="#c4c8cc" fill-rule="evenodd" stroke="#1a1a1a" stroke-width="1.2" stroke-linejoin="round"/>`;
  const text = (x, y, t, anchor = 'start', size = 13, weight = 400) => { body += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}">${esc(t)}</text>`; };
  body += `<line x1="${X(-W / 2)}" y1="${Y(-H / 2) + 46}" x2="${X(W / 2)}" y2="${Y(-H / 2) + 46}" stroke="#666"/>`; text(X(0), Y(-H / 2) + 64, `${f2(W)}`, 'middle');
  body += `<line x1="${X(-W / 2) - 46}" y1="${Y(H / 2)}" x2="${X(-W / 2) - 46}" y2="${Y(-H / 2)}" stroke="#666"/>`; text(X(-W / 2) - 52, Y(0) + 4, `${f2(H)}`, 'end');
  for (const [face, list] of Object.entries(feat.faces)) for (const s of list) {
    const n = FACES[face].n, x = X(s.at[0]) + n[0] * 22, y = Y(s.at[1]) - n[1] * 22 + 5;
    body += `<circle cx="${x}" cy="${y - 5}" r="11" fill="#fff" stroke="#b0412e" stroke-width="1.4"/>`; text(x, y, s.kind === 'slot' ? s.letter : '~', 'middle', 13, 600);
  }
  bores.forEach((b, i) => { body += `<circle cx="${X(b.at[0])}" cy="${Y(b.at[1])}" r="${(b.diameter / 2) * S + 4}" fill="none" stroke="#2e6db0" stroke-width="1.4" stroke-dasharray="4 3"/>`; text(X(b.at[0]) + (b.diameter / 2) * S + 8, Y(b.at[1]) - (b.diameter / 2) * S - 4, `${i + 1}`, 'start', 12, 600); });
  let y = Y(-H / 2) + 104; const line = (t, weight) => { text(40, y, t, 'start', 13, weight); y += 19; };
  line('What was found (check each against the bar in hand):', 600);
  for (const g of groups) line(`${g.letter}  × ${g.count} on ${g.faces.join(', ')}: opening ${f2(g.opening)}, lip ${f2(g.lip)}, ${f2(g.cavityWidth)} under the lips, ${f2(g.cavityDepth)} deep${g.trackWidth ? `, V mouth ${f2(g.trackWidth)} at ${f2(g.trackAngle)}°` : ''}: ${g.family ? `${g.drafted ? 'no family fits, drafted as' : 'matches'} ${g.family}${g.drafted ? '' : ` (within ${f2(g.off)} mm)`}` : ''}`);
  const grooves = Object.values(feat.faces).flat().filter((s) => s.kind === 'groove');
  for (const g of grooves) line(`~  ${g.face}: an opening ${f2(g.mouth)} wide and ${f2(g.depth)} deep with no room under lips: not a slot for a nut (what is inside it is in the outline only)`);
  bores.forEach((b, i) => line(`${i + 1}  bore Ø${f2(b.diameter)} at ${f2(b.at[0])}, ${f2(b.at[1])}`));
  if (feat.hollows.length) line(`${feat.hollows.length} other hollow${feat.hollows.length === 1 ? '' : 's'} (${feat.hollows.map((h) => `${f2(h.width)} × ${f2(h.height)}`).join(', ')}): kept in the outline, not in the rules`);
  line(`area of the section ${f2(feat.area)} mm²`);
  const h = y + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(w, 1080).toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${Math.max(w, 1080).toFixed(0)} ${h.toFixed(0)}" font-family="-apple-system, Helvetica, Arial, sans-serif" fill="#1a1a1a"><rect width="100%" height="100%" fill="#fff"/>
<text x="40" y="40" font-size="20">${esc(name)}: measured from ${esc(path.basename(file))}</text><text x="40" y="64" font-size="12" fill="#555">all in mm · source: ${esc(source)}${licence ? ` · licence: ${esc(licence)}` : ''} · the outline stays in this workspace</text>${body}</svg>`;
}

// ---------- the command ----------
/**
 * measureProfile(file, { profile, source, licence, along, tol, force, pictures }): the report, the outline and the
 * draft sets written to the workspace's rules/, and the drawing in .preview/measure/.
 */
export async function measureProfile(file, o = {}) {
  const name = String(o.profile);
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new Error('--profile <name>: lower case, digits, - and _ (a rule set name, like profile-2020-mine)');
  if (!fs.existsSync(file)) throw new Error(`no file ${file}`);
  const ext = path.extname(file).toLowerCase(), tol = o.tol == null ? 0.1 : Number(o.tol);
  if (!(tol > 0)) throw new Error(`--tol is how close a slot must be to a known family, in mm, above 0 (got ${o.tol})`);
  if (!['.stl', '.3mf', '.dxf'].includes(ext)) throw new Error(`${path.basename(file)}: a profile is measured from an STL or 3MF model of the beam, or a DXF of its section (not ${ext || 'a file with no extension'})`);
  const rulesDir = path.join(WS, 'rules'), to = path.join(rulesDir, `${name}.json`), outlineTo = path.join(rulesDir, 'outlines', `${name}.json`);
  // the kit holds no maker's outline: this writes to a workspace, never into the published rules
  const kit = path.dirname(fileURLToPath(import.meta.resolve('@rulecad/rules/vocabulary.json')));
  if (fs.realpathSync(fs.existsSync(rulesDir) ? rulesDir : WS).startsWith(fs.realpathSync(kit))) throw new Error('this is the kit\'s own rules folder: a measured outline goes into a workspace of your own, never into the kit');
  if ((fs.existsSync(to) || fs.existsSync(outlineTo)) && !o.force) throw new Error(`rules/${name}.json or its outline already exists (--force to replace them)`);
  const read = ext === '.dxf' ? { ...readDxf(fs.readFileSync(file, 'utf8')), says: 'the DXF\'s outline' } : meshSection(file, o.along);
  const { loops, turned } = tidy(read.loops), feat = findFeatures(loops), source = o.source || path.basename(file), stamp = today();
  console.log(`${path.basename(file)}: ${read.says}${turned ? ', turned a quarter turn to lie flat' : ''}`);
  for (const n of read.notes || []) console.log(`  ${n}`);
  if (o.licence && limitingLicence(o.licence)) console.log(`  ! licence "${o.licence}" limits reuse: measurements are facts, but the outline is the model's shape. Keep it in this workspace, and don't publish it or build it into a design under another licence`);
  console.log(`  ${f2(feat.width)} × ${f2(feat.height)} mm, ${loops.length - 1} hole${loops.length === 2 ? '' : 's'}, area ${f2(feat.area)} mm²`);
  // ---- slots: alike ones grouped, each group matched to a family or drafted as a new one ----
  const sets = allSets(), families = Object.fromEntries([...sets].map(([n, f]) => [n, JSON.parse(fs.readFileSync(f, 'utf8'))]).filter(([, s]) => s.part === 'slot'));
  const groups = [], found = Object.values(feat.faces).flat().filter((s) => s.kind === 'slot');
  for (const s of found) {
    let g = groups.find((x) => DIMS.every(([, k]) => Math.abs(x[k] - s[k]) <= tol));
    if (!g) { g = { ...s, count: 0, faces: [], letter: String.fromCharCode(65 + groups.length) }; groups.push(g); }
    g.count++; if (!g.faces.includes(s.face)) g.faces.push(s.face); s.letter = g.letter;
  }
  const extra = { kind: 'derived', source, ...(o.licence ? { licence: o.licence } : {}), checked: stamp }, written = [];
  const rule = (value, unit, says) => ({ value: typeof value === 'number' ? r2(value) : value, ...(unit != null ? { unit } : {}), rule: says, ...extra });
  const base = name.replace(/^profile-/, '');
  for (const g of groups) {
    const near = nearestFamily(g, families);
    if (near && near.off <= tol) { g.family = near.name; g.off = near.off; continue; }
    g.family = `slot-${Math.max(1, Math.round(g.opening))}-${base}${groups.filter((x) => x.drafted).length ? `-${String.fromCharCode(98 + groups.filter((x) => x.drafted).length - 1)}` : ''}`; g.drafted = true; g.near = near;
    const rules = { opening: rule(g.opening, 'mm', 'Between the lips, at their narrowest: measured off the model\'s section'), lip_thickness: rule(g.lip, 'mm', 'From the face to the underside of the lip at its tip: measured off the model\'s section'), cavity_width: rule(g.cavityWidth, 'mm', 'Width under the lips, at its widest: measured off the model\'s section'), cavity_depth: rule(g.cavityDepth, 'mm', 'From the face to the deepest point of the slot: measured off the model\'s section') };
    if (g.flankAngle) { rules.floor_width = rule(g.floorWidth, 'mm', 'Width of the slot at its floor: measured off the model\'s section'); rules.flank_angle = rule(g.flankAngle, 'deg', 'How steeply the walls close in to the floor, from the face\'s plane: worked out from where they leave the full width'); }
    if (g.trackWidth) { rules.track_width = rule(g.trackWidth, 'mm', 'Width of the V mouth at the face: measured off the model\'s section'); rules.track_angle = rule(g.trackAngle, 'deg', 'The angle between the V mouth\'s two sides: worked out from its width and depth'); }
    rules.nut_family = rule(g.family, null, `No known slot family is within ${tol} mm of this one${near ? ` (the nearest, ${near.name}, is ${f2(near.off)} mm off in its worst figure)` : ''}: name the family whose nuts it takes once you know`);
    const set = { _doc: `A draft slot family, measured from ${path.basename(file)} by cad measure --profile ${name}. kind derived: read off someone else's model, so check it against the real thing.${o.licence ? ` The model's licence: ${o.licence}.` : ''}`, name: g.family, part: 'slot', rules };
    slotModel(set); // (held to sense before it is written)
    written.push([path.join(rulesDir, `${g.family}.json`), set]);
  }
  // ---- the profile's own rules ----
  const count = (f) => feat.faces[f].filter((s) => s.kind === 'slot').length, across = Math.max(1, count('top'), count('bottom')), up = Math.max(1, count('front'), count('back'));
  const main = groups.slice().sort((a, b) => b.count - a.count)[0], family = !groups.length ? 'custom' : groups.some((g) => g.trackWidth) ? 'v-slot' : 't-slot';
  const rules = { family: rule(family, null, family === 'custom' ? 'No slot for a nut was found in the section: it is taken as an outline of its own' : family === 'v-slot' ? 'Slots with a V mouth were found: a rail for wheels' : 'Slots with room under their lips were found: a profile for T-nuts') };
  if (groups.length) { const pitch = Math.min(feat.width / across, feat.height / up); rules.series = rule(pitch, 'mm', `The size of one cell: ${across} slot${across === 1 ? '' : 's'} along the wide faces and ${up} up the sides`); rules.cells_across = rule(across, '', 'Slots found side by side on a wide face'); rules.cells_up = rule(up, '', 'Slots found one above the other on a side'); }
  rules.width = rule(feat.width, 'mm', 'Across the section\'s envelope, measured off the model'); rules.height = rule(feat.height, 'mm', 'Up the section\'s envelope, measured off the model');
  if (main) {
    rules.slot = rule(main.family, null, `The slot found on ${main.faces.join(', ')} (${main.count} in all): ${main.drafted ? 'drafted as a family of its own' : `it matches ${main.family} within ${f2(main.off)} mm`}`);
    for (const f of Object.keys(FACES)) { const list = feat.faces[f].filter((s) => s.kind === 'slot'), n = f === 'top' || f === 'bottom' ? across : up, names = list.length === n ? list.map((s) => groups.find((g) => g.letter === s.letter).family) : null; const written2 = !list.length ? 'closed' : names && names.every((x) => x === main.family) ? null : names ? names.join(', ') : 'closed'; if (written2) rules[`slot_${f}`] = rule(written2, null, !list.length ? `No slot was found on the ${f} face` : names ? `The ${f} face's slots, as found` : `The ${f} face has ${list.length} slot${list.length === 1 ? '' : 's'} where its cells would give ${n}: left closed here, see the outline`); }
  }
  // bores: the round holes at the middles of the cells are the profile's bores; others are told, and stay in the outline
  const cells = Array.from({ length: across * up }, (_, k) => [((k % across) - (across - 1) / 2) * (feat.width / across), (Math.floor(k / across) - (up - 1) / 2) * (feat.height / up)]);
  const central = feat.bores.filter((b) => cells.some((c) => Math.hypot(c[0] - b.at[0], c[1] - b.at[1]) < 0.15)), others = feat.bores.filter((b) => !central.includes(b));
  const bore = central.length ? central : groups.length ? [] : [];
  if (bore.length) { rules.bore_diameter = rule(bore.reduce((s, b) => s + b.diameter, 0) / bore.length, 'mm', `The round hole at the middle of ${bore.length === 1 ? 'the section' : `each of ${bore.length} cells`}, measured off the model. Name the thread it taps to (bore_thread) once you know`); if (bore.length !== cells.length) rules.bore_at = rule(bore.map((b) => `${b.at[0]},${b.at[1]}`).join('; '), null, 'Where the bores are: not every cell has one'); }
  const doc = `A draft profile, measured from ${path.basename(file)} by cad measure --profile (${read.says}). kind derived: read off someone else's model, so check each figure against the bar in hand, name its maker and series, and add what a model cannot say: the alloy, a material set (for its mass), the thread its bore taps to and the lengths it is sold in. Its outline is rules/outlines/${name}.json, which the check and the drawing use in place of a drawn one${others.length || feat.hollows.length ? `; it also holds ${[others.length ? `${others.length} round hole${others.length === 1 ? '' : 's'} off the cells' middles` : '', feat.hollows.length ? `${feat.hollows.length} hollow${feat.hollows.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} that the rules do not name` : ''}.${o.licence ? ` The model's licence: ${o.licence}.` : ''} The outline is the model's shape: it stays in this workspace.`;
  written.push([to, { _doc: doc, name, part: 'profile', rules }]);
  fs.mkdirSync(path.dirname(outlineTo), { recursive: true });
  fs.writeFileSync(outlineTo, `${JSON.stringify({ _doc: `The section of ${path.basename(file)}, measured by cad measure --profile. It is the model's shape: keep it in this workspace.`, name, unit: 'mm', source, licence: o.licence || 'not given: find the model\'s terms before sharing this', checked: stamp, loops })}\n`);
  for (const [f, set] of written) fs.writeFileSync(f, `${JSON.stringify(set, null, 2)}\n`);
  // ---- the report ----
  for (const g of groups) console.log(`  slot ${g.letter} × ${g.count} (${g.faces.join(', ')}): opening ${f2(g.opening)}, lip ${f2(g.lip)}, ${f2(g.cavityWidth)} under the lips, ${f2(g.cavityDepth)} deep${g.flankAngle ? `, floor ${f2(g.floorWidth)}` : ''}${g.trackWidth ? `, V mouth ${f2(g.trackWidth)} at ${f2(g.trackAngle)}°` : ''}\n    ${g.drafted ? `no slot family within ${tol} mm${g.near ? ` (nearest ${g.near.name}, ${f2(g.near.off)} off)` : ''}: drafted as ${g.family}` : `matches ${g.family} within ${f2(g.off)} mm`}`);
  const grooves = Object.values(feat.faces).flat().filter((s) => s.kind === 'groove');
  for (const g of grooves) console.log(g.depth > 2 && g.mouth > 0.3 * Math.min(feat.width, feat.height) ? `  an open channel ${f2(g.mouth)} wide and ${f2(g.depth)} deep in the ${g.face} face (a C section): whatever slots are inside it are in the outline, not in the rules. Give the set cells_absent for them (see profile-4080-openbuilds-cbeam)` : `  a groove ${f2(g.mouth)} wide and ${f2(g.depth)} deep in the ${g.face} face, with no room under lips: not a slot for a nut`);
  if (!groups.length) console.log('  no slot for a nut found: written as a custom profile (its outline is all of it)');
  if (bore.length) console.log(`  ${bore.length} bore${bore.length === 1 ? '' : 's'} Ø${f2(rules.bore_diameter.value)} at the cells' middles`);
  if (others.length) console.log(`  ${others.length} other round hole${others.length === 1 ? '' : 's'}: ${others.map((b) => `Ø${f2(b.diameter)} at ${f2(b.at[0])}, ${f2(b.at[1])}`).join('; ')} (in the outline, not in the rules)`);
  if (feat.hollows.length) console.log(`  ${feat.hollows.length} hollow${feat.hollows.length === 1 ? '' : 's'}: ${feat.hollows.map((h) => `${f2(h.width)} × ${f2(h.height)}`).join(', ')} (in the outline, not in the rules)`);
  const rel = (f) => path.relative(process.cwd(), f).split(path.sep).join('/');
  console.log(`\n  draft profile: ${rel(to)} (${Object.keys(rules).length} values, kind derived)\n  outline:       ${rel(outlineTo)} (${loops.length} loops${o.licence ? '' : '; no --licence given: say what terms the model came under'})`);
  for (const [f] of written.slice(0, -1)) console.log(`  draft slot:    ${rel(f)}`);
  const svg = drawingSvg({ name, file, loops, feat, groups, bores: feat.bores, source, licence: o.licence }), svgTo = paths.preview('measure', `${name}-profile.svg`);
  fs.mkdirSync(path.dirname(svgTo), { recursive: true }); fs.writeFileSync(svgTo, svg);
  console.log(`  drawing:       ${rel(svgTo)}`);
  if (o.pictures !== false) { const png = paths.preview('measure', `${name}-profile.png`); const size = svg.match(/width="(\d+)" height="(\d+)"/); await picture(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`, png, { width: Number(size[1]), height: Number(size[2]) }); console.log(`                 ${rel(png)}`); }
  console.log(`\n  next: look at the drawing, then npx cad rules check ${name}, and npx cad rules draw ${name}`);
  return { name, loops, features: feat, groups, files: written.map(([f]) => f).concat(outlineTo, svgTo) };
}

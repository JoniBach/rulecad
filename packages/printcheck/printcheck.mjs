// Printability, from the faces and the printer's rules. Each finding is { level: 'fail' | 'warn' | 'pass', text }.
//   fits the bed · sits flat on it · a closed solid (slicers need one) · one piece · overhangs past the printer's limit
//   · tips hanging down that start in mid-air
//   flat undersides above the bed: on a built-in breakaway support (one support gap above a surface), or bridges no
//   wider than the printer can span: the widest circle that fits in the underside, measured to the edges that are
//   held up by material below. An underside with no such edge starts in mid-air: it needs support; one held on one
//   side only past a print line is a ledge, which droops. Each underside
//   is taken on its own (the faces at a height joined edge to edge), and one no wider than a print line anywhere is
//   a step of a slope printed in layers, not a bridge.
// Z is up and the bed is z = 0: a design is checked as it will print, so print orientation is part of the design.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Area-weighted normal of a planar polygon (its length is twice the area).
function areaNormal(poly) {
  let n = [0, 0, 0];
  for (let i = 1; i < poly.length - 1; i++) n = n.map((c, k) => c + cross(sub(poly[i], poly[0]), sub(poly[i + 1], poly[0]))[k]);
  return n;
}

const OVERHANG_SLACK = 0.5; // degrees
const LINE = 0.42; // mm: the line width when the printer gives none (a 0.4 mm nozzle's usual line)
const LEDGE_SLACK = (15 * Math.PI) / 180; // a point's supports all within a half turn and this: a ledge

/**
 * The box around faces.
 * @param {Face[]} polys
 * @returns {{ lo: Point, hi: Point, size: Point }}
 */
/** @typedef {[number, number, number]} Point a corner in mm, Z up */
/** @typedef {Point[]} Face a polygon: three or more corners, counter-clockwise seen from outside */
/** @typedef {{ bed: number, overhang: number, layer?: number, support_gap?: number, bridge?: number, line?: number, print_gap?: number, foot?: number }} Printer mm and degrees; layer and line drive the sliced-layer island check; print_gap and foot (how far the first layer spreads each side) the first-layer check */
/**
 * A finding: its level and words, and for programs a code (print.bridge, fit.gap, …), the numbers behind it, and where
 * it is when that's known: at, a point (the middle of it), and box, the box round the faces it's about, in mm.
 * @typedef {{ level: 'pass' | 'warn' | 'fail' | 'info', text: string, code?: string, values?: Record<string, any>, at?: number[], box?: { lo: number[], hi: number[] }, refs?: Record<string, any> }} Finding
 */

export function bounds(polys) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; // a loop: spreading big models overflows the stack
  for (const p of polys) for (const v of p) for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
  return { lo, hi, size: hi.map((h, k) => h - lo[k]) };
}

// parts ([{ triangles, role }]): when parts print together (a keycap and its inlaid legend), an underside resting on
// another part isn't an overhang, and each part must be closed on its own (their shared faces are inside the print).
// printer: the printer's rules, any printer: { bed, overhang (degrees), layer, support_gap?, bridge?, line? } in mm.
/**
 * Is it printable? Findings in plain words, each pass, warn or fail.
 * @param {Face[]} polys the model as faces (triangles are fine), Z up, the bed at z = 0
 * @param {Printer} printer the printer's limits
 * @param {{ eps?: number, parts?: { triangles: Face[], role?: 'part' | 'support' }[] }} [options]
 * @returns {Finding[]}
 */
export function check(polys, printer, { eps = 1e-3, parts = null, slice = true } = {}) {
  // (a finding's at is a point, the middle of where it is; box is the box round it: one shape across the kit)
  const out = [], f = (level, text, code, values, box) => out.push({ level, text, code, ...(values && { values }), ...(box && Number.isFinite(box.lo?.[0]) ? { at: box.lo.map((x, k) => (x + box.hi[k]) / 2), box } : {}) });
  // What can't be checked is said at the door, not found out deep inside
  for (const k of ['bed', 'overhang']) if (!(Number(printer?.[k]) > 0)) throw new Error(`check(model, printer): the printer's "${k}" is needed, a number above 0 (got ${JSON.stringify(printer?.[k])}): { bed: 256, overhang: 45, layer: 0.2 }`);
  for (const k of ['layer', 'line', 'bridge', 'support_gap']) if (printer[k] != null && !(Number(printer[k]) > 0)) throw new Error(`check(model, printer): the printer's "${k}" must be a number above 0 (got ${JSON.stringify(printer[k])})`);
  polys = (Array.isArray(polys) ? polys : []).filter((p) => Array.isArray(p) && p.length >= 3 && p.every((v) => Array.isArray(v) && v.length >= 3 && v.every(Number.isFinite)));
  if (!polys.length) return [{ level: 'fail', text: 'nothing to check: the model has no faces (each face is three or more corners, each [x, y, z] in mm)', code: 'print.empty' }];
  const solids = (parts || []).filter((p) => p.role !== 'support').map((p) => ({ tris: p.triangles, box: bounds(p.triangles) }));
  // Is the point inside one of the parts? A ray straight up crosses its surface an odd number of times
  const inPart = (pt) => solids.length > 1 && solids.some(({ tris, box }) => {
    if (pt.some((c, k) => c < box.lo[k] - eps || c > box.hi[k] + eps)) return false;
    let n = 0;
    for (const t of tris) for (let i = 1; i < t.length - 1; i++) {
      const [a, b, c] = [t[0], t[i], t[i + 1]], d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((pt[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (pt[1] - a[1])) / d, v = ((b[0] - a[0]) * (pt[1] - a[1]) - (pt[0] - a[0]) * (b[1] - a[1])) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      if (a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]) > pt[2]) n++;
    }
    return n % 2 === 1;
  });
  const rests = (p) => { const c = [0, 1, 2].map((k) => p.reduce((s, v) => s + v[k], 0) / p.length); return inPart([c[0] + 1e-4, c[1] + 2e-4, c[2] - printer.layer / 4]); };
  const { lo, size } = bounds(polys);
  const mm = (n) => `${Number(n.toFixed(1))}`;

  const over = size.filter((s) => s > printer.bed);
  f(over.length ? 'fail' : 'pass', `${size.map(mm).join(' × ')} mm${over.length ? `: bigger than the ${printer.bed} mm bed` : ', fits the bed'}`, 'print.bed', { size, bed: printer.bed });

  // Faces the wrong way round: a closed solid's faces all point out, so the volume they enclose (signed, by the way
  // their corners run) is positive. Negative, every face points in, and nothing below reads right (the base faces up,
  // the top faces down): say that, not what follows from it
  let signed = 0;
  for (const p of polys) for (let i = 1; i < p.length - 1; i++) { const [a, b, c] = [p[0], p[i], p[i + 1]]; signed += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }
  if (signed < -eps) { f('fail', `the faces point inwards (their corners run clockwise seen from outside): the solid is inside out. Reverse every face's corners, or the exporter's winding`, 'print.inside-out', { volume: signed }); return out; }

  // Flat on the bed: the lowest point is z = 0, and faces there point straight down.
  let base = 0, down = 0, support = 0, zs = [];
  // Where a finding is: the box round the faces it's about, { lo, hi } (for a reader to point at)
  const overBox = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  const grow = (box, p) => { for (const v of p) for (let k = 0; k < 3; k++) { box.lo[k] = Math.min(box.lo[k], v[k]); box.hi[k] = Math.max(box.hi[k], v[k]); } return box; };
  const boxOf = (faces) => faces.reduce((box, p) => grow(box, p), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
  const flatDown = [], flatUp = [];
  // A face overhanging past the limit (measured from vertical) points down by more than its sine; half a degree to
  // spare, since booleans tip a 45° chamfer by hundredths of a degree. (Cosine was used before: the same at 45° only.)
  const limit = Math.sin(((printer.overhang + OVERHANG_SLACK) * Math.PI) / 180);
  for (const p of polys) {
    const n = areaNormal(p), area = Math.hypot(...n) / 2, nz = n[2] / (2 * area || 1);
    const longest = Math.max(...p.map((v, i) => Math.hypot(...sub(p[(i + 1) % p.length], v))));
    if (2 * area / (longest || 1) < HAIRLINE) continue; // a sliver thinner than a hairline (corners nearly in a line, left by a boolean) faces nowhere
    const zmin = Math.min(...p.map((v) => v[2])), zmax = Math.max(...p.map((v) => v[2]));
    if (nz < -eps && zmax - lo[2] > eps && rests(p)) continue; // on another part (a legend on its keycap)
    if (nz < -1 + eps && zmax - lo[2] < eps) base += area;
    else if (nz < -1 + eps) flatDown.push({ p, z: zmin, area }); // a flat underside above the bed
    else if (nz < -limit) { support += area; zs.push(zmin); grow(overBox, p); }
    if (nz > 1 - eps) flatUp.push({ p, z: zmax });
    if (nz < 0) down += area;
  }
  if (Math.abs(lo[2]) > eps) f('fail', `lowest point is at z = ${mm(lo[2])} mm, not on the bed (z = 0)`, 'print.off-bed', { z: lo[2] });
  if (base <= 0) f('fail', 'nothing sits flat on the bed', 'print.base', { area: base });
  else if (Math.abs(lo[2]) <= eps) f('pass', `${mm(base)} mm² flat on the bed`, 'print.base', { area: base }); // (off the bed, its flat underside isn't on it: the finding above says so)
  const overAt = support > 0.5 ? overBox : null, slicing = printer.layer != null; // sliced below, the layers are what count; the facets are then a note
  if (support > 0.5) f(slicing ? 'pass' : 'warn', slicing ? `${mm(support)} mm² of facets lean past ${printer.overhang}° (z ${mm(Math.min(...zs))} to ${mm(Math.max(...zs))} mm); sliced, the layers decide` : `${mm(support)} mm² overhangs past ${printer.overhang}° (z ${mm(Math.min(...zs))} to ${mm(Math.max(...zs))} mm): needs supports or another orientation`, 'print.overhang', { area: support, angle: printer.overhang, z: [Math.min(...zs), Math.max(...zs)] }, overAt);
  else f('pass', `no overhangs past ${printer.overhang}°`, 'print.overhang', { area: support, angle: printer.overhang });

  // Flat undersides: on a breakaway support, or bridged
  const gap = printer.support_gap ?? 0.2, inside = (pt, poly) => { // point in the xy footprint of a convex face
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
      if (Math.abs(c) < 1e-9) continue; if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c);
    }
    return true;
  };
  const centroid = (p) => [0, 1].map((k) => p.reduce((s, v) => s + v[k], 0) / p.length);
  // (a breakaway gap, or two layers: a part printed in place rests on what is two layers under it as it does on the bed)
  const nearBed = Math.max(gap * 1.5, 2 * (printer.layer ?? 0.2));
  const held = flatDown.filter((d) => flatUp.some((u) => d.z - u.z > eps && d.z - u.z <= nearBed + eps && inside(centroid(d.p), u.p)));
  if (held.length) f('pass', `${mm(held.reduce((s, d) => s + d.area, 0))} mm² rests on a breakaway support (${mm(gap)} mm gap): snip it off after printing`, 'print.breakaway', { area: held.reduce((s, d) => s + d.area, 0), gap });
  // And the bed is a support too: an underside within a breakaway gap of it (a smoothed base's facets a hair up) is
  // squashed on to it with the first layer, not printed in the air
  const onBed = flatDown.filter((d) => !held.includes(d) && d.z - lo[2] <= nearBed + eps);
  if (onBed.length) f('pass', `${mm(onBed.reduce((s, d) => s + d.area, 0))} mm² lies within ${mm(nearBed)} mm of the bed: laid down with the first layers`, 'print.bed-near', { area: onBed.reduce((s, d) => s + d.area, 0) });
  const levels = new Map();
  // (undersides within a layer of each other are one height: a smoothed surface's facets sit a hair apart)
  const layerH = printer.layer ?? 0.2;
  for (const d of flatDown) if (!held.includes(d) && !onBed.includes(d)) { const k = (Math.round(d.z / layerH) * layerH).toFixed(2); levels.set(k, [...(levels.get(k) || []), d.p]); }
  // A point on a segment (in the plane), within eps; and a segment lying along another, overlapping it
  const onSeg = (pt, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; if (l < eps * eps) return Math.hypot(pt[0] - a[0], pt[1] - a[1]) <= eps; const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l; return t >= -eps && t <= 1 + eps && Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy) <= eps; };
  const along = (a, b, c, d) => { // c–d lies on the line of a–b and overlaps it (an edge matched exactly, or by a part of it: a T-junction)
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); if (l < eps) return false;
    if (Math.abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / l > eps || Math.abs((d[0] - a[0]) * dy - (d[1] - a[1]) * dx) / l > eps) return false;
    const t0 = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (l * l), t1 = ((d[0] - a[0]) * dx + (d[1] - a[1]) * dy) / (l * l);
    return Math.min(t0, t1) < 1 - eps && Math.max(t0, t1) > eps;
  };
  const bridgeMax = printer.bridge ?? 5, line = printer.line ?? LINE;
  // Each underside on its own: the faces at a level joined where they touch, edge to edge or a corner on another's
  // edge (a T-junction, which a boolean leaves plenty of). Two pockets' ceilings at one height are two bridges, each
  // measured to its own held edges, not to the other's across the part
  const regions = (group) => {
    const parent = group.map((_, i) => i), root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i]))), join = (i, j) => { parent[root(i)] = root(j); };
    const cell = 1, cellOf = (v) => `${Math.floor(v[0] / cell)},${Math.floor(v[1] / cell)}`, byCell = new Map();
    group.forEach((p, i) => { for (const v of p) { const k = cellOf(v); byCell.set(k, [...(byCell.get(k) || []), [v, i]]); } });
    group.forEach((p, i) => p.forEach((a, k) => { // every corner of another face on this edge joins the two
      const b = p[(k + 1) % p.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / cell) * 2 + 1, seen = new Set();
      for (let t = 0; t <= n; t++) {
        const q = [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n], ci = Math.floor(q[0] / cell), cj = Math.floor(q[1] / cell);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const key = `${ci + di},${cj + dj}`; if (seen.has(key)) continue; seen.add(key); for (const [v, j] of byCell.get(key) || []) if (j !== i && onSeg(v, a, b)) join(i, j); }
      }
    }));
    const out = new Map();
    group.forEach((p, i) => { const r = root(i); out.set(r, [...(out.get(r) || []), p]); });
    return [...out.values()];
  };
  // The top edges of walls that reach a level from below: an underside's edge lying along one is held up there
  const wallsAt = (z, tol = eps) => polys.filter((p) => Math.min(...p.map((v) => v[2])) < z - tol).flatMap((p) => p.flatMap((a, i) => { const b = p[(i + 1) % p.length]; return Math.abs(a[2] - z) <= tol && Math.abs(b[2] - z) <= tol ? [[a, b]] : []; }));
  // (a smoothed surface has many small undersides at a height: what starts in mid-air and what hangs as a ledge are
  // said once per height, with how many and the worst; each bridge on its own)
  for (const [z, level] of levels) {
    const walls = wallsAt(Number(z), layerH / 2 + eps), midAir = [], ledges = []; // (the level's faces lie within half a layer of it)
    for (const group of regions(level)) {
      const at = boxOf(group);
      if (Math.min(at.hi[0] - at.lo[0], at.hi[1] - at.lo[1]) < line - eps) continue; // a sliver narrower than a print line: the slicer lays nothing there
      if (widest(group) < line - eps) continue; // no wider than a line anywhere (a step of a slope cut in layers, a chamfer's tread): one layer's overhang, which the perimeter takes in its stride
      const held = (a, b) => walls.some(([c, d]) => along(a, b, c, d));
      const under = flatUp.filter((u) => Number(z) - u.z > eps && Number(z) - u.z <= nearBed + eps).map((u) => u.p); // breakaway supports' tops, and what a part printed in place rests on
      const measured = spans(group, held, under), span = measured?.span ?? null, groupArea = group.reduce((s, p) => s + Math.hypot(...areaNormal(p)) / 2, 0);
      if (span == null) midAir.push({ at, area: groupArea });
      else if (measured.reach > line + eps) ledges.push({ at, reach: measured.reach, where: measured.where });
      else if (span > bridgeMax + eps) f('warn', `${mm(span)} mm bridge at z ${mm(Number(z))}: wider than the ${bridgeMax} mm the printer can span, needs supports`, 'print.bridge', { span, max: bridgeMax, z: Number(z) }, at);
      else f('pass', `bridge ${mm(span)} mm at z ${mm(Number(z))} (up to ${bridgeMax} mm)`, 'print.bridge', { span, max: bridgeMax, z: Number(z) });
    }
    if (midAir.length) {
      const biggest = midAir.reduce((m, x) => (x.area > m.area ? x : m)), total = midAir.reduce((s, x) => s + x.area, 0);
      f('warn', `${midAir.length === 1 ? 'an underside' : `${midAir.length} undersides (${mm(total)} mm²)`} at z ${mm(Number(z))} start${midAir.length === 1 ? 's' : ''} in mid-air: needs support (or a built-in breakaway support one ${mm(gap)} mm layer below)`, 'print.mid-air', { z: Number(z), count: midAir.length, area: total }, biggest.at);
    }
    if (ledges.length) {
      const worst = ledges.reduce((m, x) => (x.reach > m.reach ? x : m));
      f('warn', `${ledges.length === 1 ? 'a ledge' : `${ledges.length} ledges`} at z ${mm(Number(z))} reach${ledges.length === 1 ? 'es' : ''} ${ledges.length === 1 ? '' : 'up to '}${mm(worst.reach)} mm out past what holds ${ledges.length === 1 ? 'it' : 'them'}, held on one side only: ${ledges.length === 1 ? 'it droops' : 'they droop'}. Slant the underside in at 45° to the wall, or support it`, 'print.ledge', { reach: worst.reach, z: Number(z), count: ledges.length, where: worst.where }, worst.at);
    }
  }

  // One piece, and nothing starting in mid-air, part by part (an assembly's parts are apart on purpose)
  for (const tris of parts && parts.length > 1 ? parts.filter((p) => p.role !== 'support').map((p) => p.triangles) : [polys]) {
    const { pieces, tips } = shape(tris, eps, (printer.layer ?? 0.2) / 4);
    const loose = pieces.slice(1);
    if (loose.length) f('warn', `${pieces.length} pieces: ${loose.length} loose from the main one (${loose.length === 1 ? mm(loose[0].volume) : `${mm(Math.min(...loose.map((l) => l.volume)))} to ${mm(Math.max(...loose.map((l) => l.volume)))}`} mm³), which would print as stray bits or fall over`, 'print.pieces', { pieces: pieces.length, loose: loose.map((l) => l.volume) }, loose.reduce((b, l) => grow(grow(b, [l.box.lo]), [l.box.hi]), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    else if (pieces.length) f('pass', 'one piece', 'print.pieces', { pieces: 1 });
    const hanging = tips.filter((t) => t[2] - lo[2] > eps && !rests([t, t, t]));
    if (hanging.length) f('warn', `${hanging.length === 1 ? 'a point starts' : `${hanging.length} points start`} in mid-air (z ${mm(Math.min(...hanging.map((t) => t[2])))}${hanging.length > 1 ? ` to ${mm(Math.max(...hanging.map((t) => t[2])))}` : ''} mm): the lowest points of tips hanging down, with nothing below to print on`, 'print.island', { points: hanging }, hanging.reduce((b, t) => grow(b, [t]), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    else f('pass', 'nothing starts in mid-air', 'print.island', { points: [] });
    // And as the slicer sees it: every layer against the one below (slice: false leaves this out, the slow part: a page
    // can check a part at once, then slice it off its own thread)
    if (!slice) { f('info', 'not sliced: the layers are checked on their own (islands, the first layer, layer overhang)', 'print.unsliced'); continue; }
    // (the first layer spreads `foot` each side as it is squashed on to the bed: two parts printed in place must stand
    // further apart there than the gap that prints apart higher up, or they print as one)
    const firstGap = printer.foot > 0 && printer.print_gap > 0 ? printer.print_gap + 2 * printer.foot : 0;
    const sliced = islands(tris, { layer: printer.layer ?? 0.2, overhang: printer.overhang, line: printer.line ?? LINE, firstGap }), isl = sliced.islands;
    for (const x of sliced.fused) f('warn', `on the first layer, two parts are about ${mm(x.gap)} mm apart at (${mm(x.at[0])}, ${mm(x.at[1])}): the first layer spreads ${printer.foot} mm each side as it is squashed on, so under ${mm(firstGap)} mm they print as one. Keep them ${mm(firstGap)} mm apart on the bed, or lift one off it`, 'print.first-layer', { gap: x.gap, need: firstGap }, { lo: [x.at[0] - 1, x.at[1] - 1, 0], hi: [x.at[0] + 1, x.at[1] + 1, printer.layer ?? 0.2] });
    if (firstGap && !sliced.fused.length) f('pass', `on the first layer, nothing printed in place stands within ${mm(firstGap)} mm of another part (the first layer spreads ${printer.foot} mm each side)`, 'print.first-layer', { need: firstGap });
    // Overhang as the printer meets it: layers lying out past the one below, less the flat undersides the bridge check
    // judges on their own. The face-by-face measure above counts the surface's facets, which on a smoothed, cell-built
    // part are steeper than its layers are.
    const flatArea = flatDown.reduce((s, d) => s + d.area, 0), out = Math.max(0, sliced.overhang - flatArea);
    if (out > 2) f('warn', `${mm(out)} mm² of layers lie out past what the layer below holds at ${printer.overhang}° and a line (sliced at ${printer.layer ?? 0.2} mm): needs supports or another orientation`, 'print.overhang.sliced', { area: out, facets: support }); else f('pass', `every layer lies within ${printer.overhang}° and a line of the one below (sliced at ${printer.layer ?? 0.2} mm)`, 'print.overhang.sliced', { area: out, facets: support });
    if (isl.length) f('warn', `${isl.length === 1 ? 'an island' : `${isl.length} islands`} when sliced: ${isl.length === 1 ? `${mm(isl[0].area)} mm² at z ${mm(isl[0].z)}` : `${mm(Math.min(...isl.map((x) => x.area)))} to ${mm(Math.max(...isl.map((x) => x.area)))} mm², z ${mm(Math.min(...isl.map((x) => x.z)))} to ${mm(Math.max(...isl.map((x) => x.z)))}`}: a layer's region with nothing under it within the overhang reach, which the printer lays on air`, 'print.islands', { islands: isl }, isl.reduce((b, x) => grow(b, [x.at]), { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    else f('pass', `no islands in ${sliced.layers} layers of ${printer.layer ?? 0.2} mm`, 'print.islands', { islands: [] });
  }

  // Closed: every edge is matched by an edge running the other way. An edge that meets the middle of a longer edge
  // (a T-junction, left by booleans) is still closed if the edges along the other side cover it exactly.
  const { gaps, tjunctions, hairlines } = parts && parts.length > 1
    ? parts.map((p) => seams(p.triangles, eps)).reduce((s, x) => ({ gaps: s.gaps + x.gaps, tjunctions: s.tjunctions + x.tjunctions, hairlines: s.hairlines + x.hairlines }), { gaps: 0, tjunctions: 0, hairlines: 0 })
    : seams(polys, eps);
  if (gaps) f('warn', `${gaps === 1 ? '1 edge' : `${gaps} edges`} with nothing on the other side: ${gaps === 1 ? 'a hole' : 'holes'} in the surface (slicers may repair ${gaps === 1 ? 'it' : 'them'})`, 'print.closed', { gaps });
  else f('pass', `closed solid${tjunctions || hairlines ? ` (${[tjunctions && `${tjunctions} T-junction edges`, hairlines && `${hairlines} hairline seams under ${HAIRLINE} mm`].filter(Boolean).join(', ')}: watertight for printing)` : ''}`, 'print.closed', { gaps, tjunctions, hairlines });
  return out;
}

// The widest circle that fits in a flat region made of faces, measured to the outline edges that are held up
// (held(a, b) -> true), or to the tops of breakaway supports one layer below (under: faces): its diameter in mm, the
// gap a bridge has to span. null if nothing holds it up.
// Sampled: points spread over each face, each measured to the held edges of the region's outline and to the supports.
// A point with support on one side only (nothing held beyond it, away from its nearest held edge) is on a ledge, not
// a bridge: `ledges(polys, held, under)` gives how far the longest reaches.
/**
 * The widest circle that fits in an underside, measured to its held-up edges (the bridge it makes).
 * @param {Face[]} polys @param {(edge: [Point, Point]) => boolean} [held] @param {Face[]} [under]
 * @returns {number} mm
 */
export function widest(polys, held = () => true, under = []) { return spans(polys, held, under)?.span ?? null; }
/**
 * How far an underside reaches out past its last support, held on one side only (a ledge in the air): mm, 0 if it is
 * held on both sides everywhere (a bridge), null if nothing holds it.
 * @param {Face[]} polys @param {(edge: [Point, Point]) => boolean} [held] @param {Face[]} [under]
 * @returns {number | null} mm
 */
export function ledges(polys, held = () => true, under = []) { return spans(polys, held, under)?.reach ?? null; }

function spans(polys, held, under) {
  const key = (v) => `${v[0].toFixed(3)},${v[1].toFixed(3)}`, count = new Map(), edges = [];
  for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length], k = [key(a), key(b)].sort().join('|'); count.set(k, (count.get(k) || 0) + 1); edges.push([k, a, b]); });
  const outline = edges.filter(([k]) => count.get(k) === 1).map(([, a, b]) => [a, b]).filter(([a, b]) => held(a, b));
  const tops = under.flatMap((p) => p.map((a, i) => [a, p[(i + 1) % p.length]]));
  if (!outline.length && !tops.length) return null;
  const onTop = (pt) => under.some((p) => { let sign = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); if (Math.abs(c) < 1e-9) continue; if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); } return true; });
  const nearest = (pt, [a, b]) => { // the segment's closest point to pt, and how far
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l)) : 0, c = [a[0] + t * dx, a[1] + t * dy];
    return { c, d: Math.hypot(pt[0] - c[0], pt[1] - c[1]) };
  };
  const supports = [...outline, ...tops];
  let best = 0, reach = 0, where = null;
  const N = 6;
  for (const p of polys) for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[0], p[i], p[i + 1]];
    for (let u = 0; u <= N; u++) for (let v = 0; u + v <= N; v++) {
      const w = N - u - v, pt = [0, 1].map((k) => (a[k] * u + b[k] * v + c[k] * w) / N);
      if (onTop(pt)) continue; // right over a support
      const near = supports.map((s) => nearest(pt, s)), first = near.reduce((m, x) => (x.d < m.d ? x : m));
      best = Math.max(best, first.d);
      // Held round it, or on one side only? The directions to its supports: all within one half-plane (a gap of more
      // than a half turn between them) and it hangs out past the last of them, a ledge reaching first.d; supports
      // on opposing sides, and a line between two of them crosses it: a bridge
      if (first.d > 1e-9) {
        const angles = near.filter((x) => x.d > 1e-9).map((x) => Math.atan2(x.c[1] - pt[1], x.c[0] - pt[0])).sort((a, b) => a - b);
        let gap = angles.length ? angles[0] + 2 * Math.PI - angles.at(-1) : 2 * Math.PI;
        for (let k = 1; k < angles.length; k++) gap = Math.max(gap, angles[k] - angles[k - 1]);
        // (a bridge between two supports nearly opposite each other, a strap from a wall to a post, leaves a gap a few
        // degrees over a half turn where the post's nearest point is off its line: some slack, LEDGE_SLACK, before it
        // counts as a ledge)
        if (gap > Math.PI + LEDGE_SLACK && first.d > reach) { reach = first.d; where = pt; }
      }
    }
  }
  return { span: 2 * best, reach, where };
}

// seams(polys) -> { gaps, tjunctions, hairlines }: edges not matched by a reverse edge, split into T-junctions (covered
// all along by reverse edges on the same line, or lying along a longer reverse edge), hairlines (within HAIRLINE of
// another face) and real gaps.
export const HAIRLINE = 0.01; // mm: a fortieth of a print line
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function pointToTriangle(p, a, b, c) { // Ericson, Real-Time Collision Detection 5.1.5
  const ab = vsub(b, a), ac = vsub(c, a), ap = vsub(p, a), d1 = vdot(ab, ap), d2 = vdot(ac, ap);
  const at = (q) => Math.hypot(...vsub(p, q)), mix = (u, v, w) => [0, 1, 2].map((k) => a[k] * u + b[k] * v + c[k] * w);
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = vsub(p, b), d3 = vdot(ab, bp), d4 = vdot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at(mix(1 - v, v, 0)); }
  const cp = vsub(p, c), d5 = vdot(ab, cp), d6 = vdot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at(mix(1 - w, 0, w)); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at(mix(0, 1 - w, w)); }
  const den = 1 / (va + vb + vc);
  return at(mix(1 - vb * den - vc * den, vb * den, vc * den));
}
/**
 * Open edges, sorted: real gaps, T-junctions (closed) and hairline seams (closed).
 * @param {Face[]} polys @param {number} [eps]
 * @returns {{ gaps: number, tjunctions: number, hairlines: number }}
 */
export function seams(polys, eps = 1e-3) {
  const key = (v) => v.map((c) => Math.round(c / eps)).join(','), segs = [], count = new Map();
  for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length]; if (key(a) !== key(b)) { segs.push([a, b]); const k = `${key(a)}|${key(b)}`; count.set(k, (count.get(k) || 0) + 1); } });
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const on = (p, a, b) => Math.abs(d(a, p) + d(p, b) - d(a, b)) < eps;
  // A seam whose middle lies within HAIRLINE of another face (not one of its own) is a hairline left by booleans, far
  // narrower than anything the printer can make: closed, for printing
  const tris = polys.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]]));
  const hairline = (a, b) => {
    const mid = [0, 1, 2].map((k) => (a[k] + b[k]) / 2), own = (t) => t.some((v) => key(v) === key(a)) && t.some((v) => key(v) === key(b));
    return tris.some((t) => !own(t) && pointToTriangle(mid, ...t) < HAIRLINE);
  };
  let gaps = 0, tjunctions = 0, hairlines = 0;
  for (const [a, b] of segs) {
    if ((count.get(`${key(b)}|${key(a)}`) || 0) > 0) continue;
    // Reverse pieces on this edge, as stretches of it from b (0) to a (1): together they must cover all of it. They may
    // overlap (booleans can cut the faces on the other side in more than one way), so it's their union that counts.
    const len = d(a, b), along = segs.filter(([x, y]) => on(x, b, a) && on(y, b, a) && d(b, x) < d(b, y)).map(([x, y]) => [d(b, x) / len, d(b, y) / len]).sort((p, q) => p[0] - q[0]);
    let reach = 0;
    for (const [from, to] of along) { if (from > reach + eps / len * 10) break; reach = Math.max(reach, to); }
    const covered = along.length > 0 && reach >= 1 - eps / len * 10;
    const within = segs.some(([x, y]) => on(a, y, x) && on(b, y, x) && d(y, a) < d(y, b) && d(x, y) > d(a, b) + eps); // part of a longer reverse edge
    if (covered || within) tjunctions++;
    else if (hairline(a, b)) hairlines++;
    else gaps++;
  }
  return { gaps, tjunctions, hairlines };
}

/**
 * A model's pieces and the tips hanging down from it. Corners closer than eps are one point. A piece is a set of faces
 * joined by their corners; one enclosing no volume, or a negative one (a cavity's surface, facing in), isn't a piece.
 * Pieces come biggest first. A tip is a corner below every corner it shares a face with, by more than drop, on faces
 * facing down (not a hole's floor), and narrow for hang mm above it (not a dip in an underside): the start of
 * something hanging in the air (corners in a flat underside are level with their neighbours, so they're not tips;
 * nor is the bed, which the caller leaves out). Tips closer than a millimetre are one.
 * @param {Face[]} polys @param {number} [eps] @param {number} [drop] @param {number} [hang] how far a tip must hang, mm
 * @returns {{ pieces: { volume: number, box: { lo: number[], hi: number[] } }[], tips: number[][] }}
 */
/**
 * The slicer's view: the mesh cut at every layer, each layer's regions checked against the one below. A region that
 * overlaps nothing in the layer below, within the overhang reach (a layer's height over the tangent of the limit, so a
 * 45° wall counts as held), starts in mid-air: an island, which a printer lays on nothing. Each layer is drawn on a
 * grid of a quarter of the print line and opened by half a line, so anything narrower than a line (which the slicer
 * never extrudes) is not a region, and the rest is compared by pixels.
 * @param {Face[]} polys the closed mesh
 * @param {{ layer?: number, overhang?: number, line?: number, onLayer?: (layer: number, layers: number) => void }} printer
 *   layer height, overhang limit (degrees from vertical), the line width; onLayer: called as each layer is cut (progress)
 * @returns {{ islands: { z: number, area: number, at: number[], cells: number[][] }[], layers: number, overhang: number }}
 *   each island's layer (its z), its area (mm²), its centre, and its pixels' centres ([x, y], for whatever fixes it); how
 *   many layers were cut; and overhang: the area (mm²) of layers lying further out than the one below can hold, flat
 *   undersides included (the bridge check judges those separately)
 */
const SPANS = [5, 20]; // layers: the spans a lean is held over (see islands)
export function islands(polys, { layer = 0.2, overhang = 45, line = LINE, firstGap = 0, onLayer } = {}) {
  if (!(layer > 0) || !(line > 0) || !(overhang > 0 && overhang < 90)) throw new Error(`islands: layer and line are lengths above 0 and overhang an angle between 0 and 90 (got layer ${layer}, line ${line}, overhang ${overhang})`);
  if (!polys.length) return { islands: [], layers: 0, overhang: 0 };
  // The pixel: a quarter of a line, or coarser on a big part so a layer stays under about a million pixels
  const { lo, hi } = bounds(polys), pitch = Math.max(line / 4, Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 1000), nx = Math.ceil((hi[0] - lo[0]) / pitch) + 6, ny = Math.ceil((hi[1] - lo[1]) / pitch) + 6;
  const r2 = Math.max(1, Math.round(line / 2 / pitch)); // half a line, in pixels
  // Pixels a layer may step out past the one below: its height times the tangent of the limit (measured from upright,
  // so a wall leaning 45° steps out one layer's height each layer), and a line beyond that: a line hanging out is held
  // by the one beside it
  const step = layer * Math.tan((overhang * Math.PI) / 180), reach = Math.ceil(step / pitch) + 2 * r2;
  // That line's grace is for a ledge, once. A wall that leans on, layer after layer, would take it every layer (at
  // 0.2 mm layers and a 0.42 mm line, a 72° lean would pass), so each layer is also held against the ones SPANS
  // layers down, with the same single line's grace over the whole span: the longer a lean goes on, the nearer to the
  // limit it is held.
  const reachOver = SPANS.map((n) => Math.ceil((n * step) / pitch) + 2 * r2), history = [];
  const tris = [];
  for (const p of polys) for (let i = 1; i < p.length - 1; i++) tris.push([p[0], p[i], p[i + 1]]);
  const zmin = tris.map((t) => Math.min(t[0][2], t[1][2], t[2][2])), zmax = tris.map((t) => Math.max(t[0][2], t[1][2], t[2][2]));
  const count = Math.max(1, Math.round((hi[2] - lo[2]) / layer)), out = [];
  // Each triangle filed under the layers whose middle it spans, so a layer looks only at its own
  const byLayer = Array.from({ length: count }, () => []);
  for (let t = 0; t < tris.length; t++) for (let L = Math.max(0, Math.ceil((zmin[t] - lo[2]) / layer - 0.5)); L <= Math.min(count - 1, Math.floor((zmax[t] - lo[2]) / layer - 0.5)); L++) byLayer[L].push(t);
  let below = null, held = null, prev = null, counted = null, overhangArea = 0;
  const fused = []; // on the first layer, regions nearer each other than firstGap: { at, gap } (the first layer spreads, and they print as one)
  const px = (x) => Math.floor((x - lo[0]) / pitch) + 3;
  // Only what the printer can lay counts: each layer is opened by half a line (eroded, then grown back), so anything
  // narrower than a line, which the slicer drops, is not a region at all
  // Square windows, by running sums along each row and then each column: any (grow) or all (shrink) within r pixels
  const sweep = (f, r, all) => {
    const tmp = new Uint8Array(nx * ny), out = new Uint8Array(nx * ny), w = 2 * r + 1, sum = new Int32Array(Math.max(nx, ny) + 1);
    for (let j = 0; j < ny; j++) { // along x
      const row = j * nx; sum[0] = 0;
      for (let i = 0; i < nx; i++) sum[i + 1] = sum[i] + f[row + i];
      for (let i = 0; i < nx; i++) { const a = Math.max(0, i - r), b = Math.min(nx, i + r + 1), n = sum[b] - sum[a]; tmp[row + i] = all ? (b - a === w && n === w ? 1 : 0) : n > 0 ? 1 : 0; }
    }
    for (let i = 0; i < nx; i++) { // then along y
      sum[0] = 0;
      for (let j = 0; j < ny; j++) sum[j + 1] = sum[j] + tmp[j * nx + i];
      for (let j = 0; j < ny; j++) { const a = Math.max(0, j - r), b = Math.min(ny, j + r + 1), n = sum[b] - sum[a]; out[j * nx + i] = all ? (b - a === w && n === w ? 1 : 0) : n > 0 ? 1 : 0; }
    }
    return out;
  };
  const erode = (f) => sweep(f, r2, true), dilate = (f, r) => sweep(f, r, false);
  const opened = (f) => dilate(erode(f), r2);
  for (let L = 0; L < count; L++) {
    onLayer?.(L, count);
    const z = lo[2] + (L + 0.5) * layer, segs = [];
    for (const t of byLayer[L]) {
      if (zmin[t] > z || zmax[t] < z) continue;
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = tris[t][i], b = tris[t][(i + 1) % 3];
        if ((a[2] < z) !== (b[2] < z)) { const u = (z - a[2]) / (b[2] - a[2]); pts.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); }
      }
      if (pts.length === 2) segs.push(pts);
    }
    // Scanline fill, even-odd, a pixel row at a time
    const raw = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const y = lo[1] + (j - 2.5) * pitch, xs = [];
      for (const [a, b] of segs) if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, px(xs[k])); i <= Math.min(nx - 1, px(xs[k + 1]) - 1); i++) raw[j * nx + i] = 1;
    }
    // A layer drawn the same as the one below (an upright wall, most of most parts) lies wholly on it: nothing to measure
    let same = !!prev;
    for (let n = 0; same && n < nx * ny; n++) if (raw[n] !== prev[n]) same = false;
    prev = raw;
    history.push(same ? below : null); // (filled in below, once this layer is drawn)
    if (history.length > SPANS.at(-1) + 1) history[history.length - SPANS.at(-1) - 2] = null; // older layers are let go
    if (same) continue;
    const filled = opened(raw);
    history[L] = filled;
    if (L === 0 && firstGap > 0) {
      // Each region labelled; grown by half the gap, two that meet were nearer than it. Where they meet is the spot
      const label = (mask) => { const lab = new Int32Array(nx * ny), stack = new Int32Array(nx * ny); let n = 0; for (let st = 0; st < nx * ny; st++) { if (!mask[st] || lab[st]) continue; n++; let top = 0; stack[top++] = st; lab[st] = n; while (top) { const e = stack[--top], i = e % nx; for (const d of [i + 1 < nx ? e + 1 : -1, i > 0 ? e - 1 : -1, e + nx < nx * ny ? e + nx : -1, e >= nx ? e - nx : -1]) if (d >= 0 && mask[d] && !lab[d]) { lab[d] = n; stack[top++] = d; } } } return { lab, n }; };
      const own = label(filled), r = Math.max(1, Math.round(firstGap / 2 / pitch)), grown = label(dilate(filled, r));
      if (own.n > 1) {
        const seen = new Map(); // a grown region → the first own label in it, and the first pixel of a second
        for (let e = 0; e < nx * ny; e++) {
          if (!own.lab[e]) continue;
          const g = grown.lab[e], first = seen.get(g);
          if (first == null) seen.set(g, own.lab[e]);
          else if (first !== own.lab[e] && !fused.some((x) => x.region === g)) fused.push({ region: g, at: [lo[0] + ((e % nx) - 2.5) * pitch, lo[1] + (Math.floor(e / nx) - 2.5) * pitch, z] });
        }
        for (const x of fused) { // the gap itself: how far this pixel is from the other region, in pixels, by growing it until they meet
          let d = 1; const mine = own.lab[Math.round((x.at[1] - lo[1]) / pitch + 2.5) * nx + Math.round((x.at[0] - lo[0]) / pitch + 2.5)];
          for (; d <= 2 * r + 1; d++) { const i0 = Math.round((x.at[0] - lo[0]) / pitch + 2.5), j0 = Math.round((x.at[1] - lo[1]) / pitch + 2.5); let met = false; for (let dj = -d; dj <= d && !met; dj++) for (let di = -d; di <= d && !met; di++) { const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < nx && j < ny && own.lab[j * nx + i] && own.lab[j * nx + i] !== mine) met = true; } if (met) break; }
          x.gap = +(Math.max(0, d - 1) * pitch).toFixed(2); delete x.region;
        }
      }
    }
    if (below) {
      held = dilate(below, reach); // where this layer may lie: on the one below, or a step out from it
      let unheld = 0;
      for (let n = 0; n < nx * ny; n++) if (filled[n] && !held[n]) unheld++;
      // A lean kept up over a span: what isn't straight above the layer below, and lies out past what the layer a
      // span down allows. (What is straight above the layer below rests on it: the layers over a bridge, say.)
      let leant = 0;
      for (let k = 0; k < SPANS.length; k++) {
        const far = L >= SPANS[k] ? history[L - SPANS[k]] : null;
        if (!far || far === below) continue;
        const heldOver = dilate(far, reachOver[k]);
        for (let n = 0; n < nx * ny; n++) if (filled[n] && held[n] && !below[n] && !heldOver[n] && !(counted && counted[n])) { leant++; (counted ||= new Uint8Array(nx * ny))[n] = 1; }
      }
      counted = null;
      overhangArea += (unheld + leant) * pitch * pitch;
      // Regions of this layer that lie on nothing: an island is a region with no pixel within reach of the layer
      // below, so only a region holding an unheld pixel can be one. Most layers have none, and are done here.
      if (unheld) {
        const seen = new Uint8Array(nx * ny), stack = new Int32Array(nx * ny);
        for (let start = 0; start < nx * ny; start++) {
          if (!filled[start] || held[start] || seen[start]) continue;
          let top = 0, onSomething = false;
          const cells = [];
          stack[top++] = start; seen[start] = 1;
          while (top) {
            const e = stack[--top], i = e % nx;
            cells.push(e);
            if (held[e]) onSomething = true;
            if (i + 1 < nx && filled[e + 1] && !seen[e + 1]) { seen[e + 1] = 1; stack[top++] = e + 1; }
            if (i > 0 && filled[e - 1] && !seen[e - 1]) { seen[e - 1] = 1; stack[top++] = e - 1; }
            if (e + nx < nx * ny && filled[e + nx] && !seen[e + nx]) { seen[e + nx] = 1; stack[top++] = e + nx; }
            if (e >= nx && filled[e - nx] && !seen[e - nx]) { seen[e - nx] = 1; stack[top++] = e - nx; }
          }
          if (!onSomething) {
            const cx = cells.reduce((s, e) => s + (e % nx), 0) / cells.length, cy = cells.reduce((s, e) => s + Math.floor(e / nx), 0) / cells.length;
            out.push({ z: +z.toFixed(3), area: cells.length * pitch * pitch, at: [lo[0] + (cx - 2.5) * pitch, lo[1] + (cy - 2.5) * pitch, z], cells: cells.map((e) => [lo[0] + ((e % nx) - 2.5) * pitch, lo[1] + (Math.floor(e / nx) - 2.5) * pitch]) });
          }
        }
      }
    }
    below = filled;
  }
  return { islands: out, layers: count, overhang: overhangArea, fused };
}

export function shape(polys, eps = 1e-3, drop = 0.05, hang = 1) {
  const ids = new Map(), at = [], key = (v) => v.map((c) => Math.round(c / eps)).join(',');
  const faces = polys.map((p) => p.map((v) => { const k = key(v); if (!ids.has(k)) { ids.set(k, at.length); at.push(v); } return ids.get(k); }));
  const up = at.map((_, i) => i), find = (i) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  const near = at.map(() => new Set()), facing = at.map(() => 0);
  faces.forEach((f, n) => { const z = areaNormal(polys[n])[2]; for (const v of f) facing[v] += z; });
  for (const f of faces) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; up[find(a)] = find(b); near[a].add(b); near[b].add(a); }
  const by = new Map();
  for (const f of faces) {
    const r = find(f[0]), piece = by.get(r) ?? { volume: 0, box: { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] } };
    for (let i = 1; i < f.length - 1; i++) { const [a, b, c] = [at[f[0]], at[f[i]], at[f[i + 1]]]; piece.volume += vdot(a, cross(b, c)) / 6; }
    for (const v of f) for (let k = 0; k < 3; k++) { piece.box.lo[k] = Math.min(piece.box.lo[k], at[v][k]); piece.box.hi[k] = Math.max(piece.box.hi[k], at[v][k]); }
    by.set(r, piece);
  }
  const pieces = [...by.values()].filter((p) => p.volume > eps).sort((a, b) => b.volume - a.volume);
  const tips = [];
  // A tip hangs: within hang of its point the surface stays narrow (a cone at 45° is as wide as it is tall). A dip in a
  // smoothed underside is shallow: within hang of it, the surface spreads wide, as far as the underside does.
  const narrow = (i) => {
    const seen = new Set([i]), todo = [i], v = at[i];
    while (todo.length) {
      for (const j of near[todo.pop()]) {
        if (seen.has(j) || at[j][2] > v[2] + hang) continue;
        if (Math.hypot(at[j][0] - v[0], at[j][1] - v[1]) > 2 * hang) return false;
        seen.add(j); todo.push(j);
      }
    }
    return true;
  };
  at.forEach((v, i) => {
    if (!near[i].size || facing[i] >= 0 || [...near[i]].some((j) => at[j][2] - v[2] <= drop) || !narrow(i)) return;
    if (!tips.some((t) => Math.hypot(t[0] - v[0], t[1] - v[1], t[2] - v[2]) < 1)) tips.push(v);
  });
  return { pieces, tips };
}

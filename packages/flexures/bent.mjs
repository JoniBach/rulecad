// A flexure drawn bent, and its peak strain by finite elements (for lamina.mjs). Each point of a flexure moves by
// the share of its joint's motion its place along the flexure gives it; the peak is a plane-stress solution of the
// flexure and a band of the bodies it joins, scaled to the travel.
import { grid as feaGrid, solve as feaSolve, cellStiffness } from '@rulecad/fea';
import { AREA, FE_MOST, empty, union, intersect, grow, area, box, moved, all, within } from './plane.mjs';

// ---------- drawing a flexure bent ----------
// Each point's share of the joint's motion: its distance along the flexure from the root over that plus its distance
// from the tip, measured inside the shape (on a grid), so a serpentine or a folded guide bends fold by fold
export function shares(shape, root, tip, cell) {
  const { lo, hi } = box(shape), nx = Math.ceil((hi[0] - lo[0]) / cell) + 3, ny = Math.ceil((hi[1] - lo[1]) / cell) + 3;
  const x0 = lo[0] - cell, y0 = lo[1] - cell, at = (i, j) => [x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell];
  const fill = (g) => { // which cells' centres are inside: crossings along each row, even-odd
    const inside = new Uint8Array(nx * ny), edges = g.flatMap((l) => l.map((p, k) => [p, l[(k + 1) % l.length]]));
    for (let j = 0; j < ny; j++) {
      const y = y0 + (j + 0.5) * cell, xs = [];
      for (const [[ax, ay], [bx, by]] of edges) if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)); i < nx && x0 + (i + 0.5) * cell < xs[k + 1]; i++) inside[j * nx + i] = 1;
    }
    return inside;
  };
  const inside = fill(shape), from = (seeds) => { // distances inside the shape from the seed cells, a step a cell
    const dist = new Float64Array(nx * ny).fill(Infinity), queue = [];
    for (let k = 0; k < seeds.length; k++) if (seeds[k] && inside[k]) { dist[k] = 0; queue.push(k); }
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h], i = k % nx, j = (k - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, n = b * nx + a;
        if (a >= 0 && b >= 0 && a < nx && b < ny && inside[n] && dist[n] === Infinity) { dist[n] = dist[k] + 1; queue.push(n); }
      }
    }
    return dist;
  };
  const dr = from(fill(root)), dt = from(fill(tip));
  return ([x, y]) => { // the nearest cell inside with both distances
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 3 && best == null; r++) for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (!inside[n] || dr[n] === Infinity || dt[n] === Infinity) continue;
      const [cx, cy] = at(a, b), d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) { bd = d; best = dr[n] / (dr[n] + dt[n] || 1); }
    }
    return best ?? 0;
  };
}
// The flexure's outline with its long edges split, so it bends smoothly
export const split = (a, most) => a.map((o) => o.flatMap((p, k) => {
  const q = o[(k + 1) % o.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / most));
  return Array.from({ length: n }, (_, i) => [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]);
}));
export const fromOutlines = (outlines) => union([outlines]); // a bent outline that crosses itself comes out as the area it covers
// Shared by the interpolation: a weight that leaves both ends square, as a guided beam bends
export const smooth = (s) => s * s * (3 - 2 * s);

// ---------- a flexure's peak strain by finite elements ----------
// Beam theory says what a bar's strain is; it doesn't see the corner where the bar meets its block, which is where a
// printed flexure yields. Here the flexure and a band of each body it grows from are laid on a grid of squares (each
// filled by how much of it is inside), the body it grows from held, the body on its tip made stiff and pushed along the
// way it moves, and the plane-stress solution scaled to the travel. The peak is the most any solid cell sees (von
// Mises, as a strain); done again on cells 0.6 the size, a peak that keeps rising is a sharp corner.
export function coverage(shape, g, x0, y0, sub = 3) {
  const { nx, ny, h } = g, out = new Float64Array(nx * ny), edges = shape.flatMap((l) => l.map((p, k) => [p, l[(k + 1) % l.length]]));
  for (let j = 0; j < ny; j++) for (let b = 0; b < sub; b++) {
    const y = y0 + (j + (b + 0.5) / sub) * h, xs = [];
    for (const [[ax, ay], [bx, by]] of edges) if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = 0; i < nx; i++) for (let a = 0; a < sub; a++) {
      const x = x0 + (i + (a + 0.5) / sub) * h;
      if (x >= xs[k] && x < xs[k + 1]) out[j * nx + i] += 1 / (sub * sub);
    }
  }
  return out;
}
export function fePeak({ flexure, held, moved, direction, travel, E, nu = 0.35, cell, band }) {
  // The bodies as material too, in a band round the flexure (so the corner where it meets them is a real corner); held
  // and pushed only beyond the band
  // (only near where the flexure joins them, within a fine cell of it: a body it merely runs past a print gap off
  // would be welded to it by a grid coarser than the gap)
  // (a body the flexure doesn't quite reach: all of it within twice the band, as before)
  const nearJoin = (body) => { const join = intersect(flexure, grow(body, cell)); return intersect(body, area(join) > AREA ? grow(join, band * 2) : grow(flexure, band * 2)); };
  held = nearJoin(held); moved = nearJoin(moved);
  const near = grow(flexure, band), region = union([flexure, held, moved]), { lo, hi } = box(region);
  let h = cell;
  while (((hi[0] - lo[0]) / h + 2) * ((hi[1] - lo[1]) / h + 2) > FE_MOST) h *= 1.25;
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 2, ny = Math.ceil((hi[1] - lo[1]) / h) + 2, x0 = lo[0] - h, y0 = lo[1] - h;
  const g = feaGrid({ nx, ny, h }), fill = coverage(region, g, x0, y0), isNear = coverage(near, g, x0, y0, 1);
  const isHeld = coverage(held, g, x0, y0, 1), isMoved = coverage(moved, g, x0, y0, 1);
  // A cell with some of the frame and some of what moves in it straddles the gap between them (a stop a print gap off,
  // narrower than a cell): empty, or the grid would weld them together
  const heldPart = coverage(held, g, x0, y0), movedPart = coverage(moved, g, x0, y0);
  // (and a cell of either beside a cell of the other: neighbours share nodes, which would weld them just the same)
  const isH = (e) => heldPart[e] > 0.01, isM = (e) => movedPart[e] > 0.01, cut = [];
  for (let e = 0; e < g.cells; e++) {
    if (!isH(e) && !isM(e)) continue;
    const i = e % nx, j = (e - i) / nx;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const o = b * nx + a;
      if ((isH(e) && isM(o)) || (isM(e) && isH(o))) cut.push(e);
    }
  }
  for (const e of cut) fill[e] = 0;
  const modulus = new Float64Array(g.cells), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs), loaded = new Set();
  for (let e = 0; e < g.cells; e++) {
    const i = e % nx, j = (e - i) / nx, far = isNear[e] < 0.5, nodes = [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)];
    modulus[e] = E * Math.max(1e-6, fill[e] > 0 && far && isMoved[e] > 0.5 ? 50 : fill[e]);
    if (fill[e] < 0.5 || !far) continue;
    if (isHeld[e] > 0.5) for (const n of nodes) { fixed[2 * n] = 1; fixed[2 * n + 1] = 1; }
    else if (isMoved[e] > 0.5) for (const n of nodes) loaded.add(n);
  }
  if (!loaded.size) for (let e = 0; e < g.cells; e++) { // a tip body all within the band: push all of it
    const i = e % nx, j = (e - i) / nx;
    if (fill[e] >= 0.5 && isMoved[e] > 0.5) for (const n of [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)]) loaded.add(n);
  }
  if (!fixed.some(Boolean) || !loaded.size) return null;
  for (const n of loaded) { f[2 * n] += direction[0] / loaded.size; f[2 * n + 1] += direction[1] / loaded.size; }
  const { u: [u] } = feaSolve(g, { scale: modulus, ke: cellStiffness(nu, 2), fixed, loads: [f] });
  let moves = 0;
  for (const n of loaded) moves += (u[2 * n] * direction[0] + u[2 * n + 1] * direction[1]) / loaded.size;
  const scale = travel / moves, k = 1 / (1 - nu * nu);
  // Strain at each solid cell's corners (on the surface, where a bar's strain is most), as von Mises in plane stress over E
  const equiv = (ex, ey, gxy) => { const sx = k * (ex + nu * ey), sy = k * (ey + nu * ex), txy = (gxy / 2) / (1 + nu); return Math.sqrt(Math.max(0, sx * sx - sx * sy + sy * sy + 3 * txy * txy)); };
  let peak = 0, at = null;
  for (let e = 0; e < g.cells; e++) {
    const i = e % nx, j = (e - i) / nx;
    if (fill[e] < 0.5 || isNear[e] < 0.5 && (isHeld[e] > 0.5 || isMoved[e] > 0.5)) continue;
    const [a, b, c, d] = [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)].map((n) => [u[2 * n] * scale, u[2 * n + 1] * scale]);
    const bx = (b[0] - a[0]) / h, tx = (c[0] - d[0]) / h, ly = (d[1] - a[1]) / h, ry = (c[1] - b[1]) / h; // εx along the bottom and top, εy up the left and right
    const corners = [[bx, ly, (d[0] - a[0]) / h + (b[1] - a[1]) / h, 0, 0], [bx, ry, (c[0] - b[0]) / h + (b[1] - a[1]) / h, 1, 0], [tx, ry, (c[0] - b[0]) / h + (c[1] - d[1]) / h, 1, 1], [tx, ly, (d[0] - a[0]) / h + (c[1] - d[1]) / h, 0, 1]];
    for (const [ex, ey, gxy, ci, cj] of corners) { const v = equiv(ex, ey, gxy); if (v > peak) { peak = v; at = [x0 + (i + ci) * h, y0 + (j + cj) * h]; } }
  }
  return { peak, at, cell: h };
}

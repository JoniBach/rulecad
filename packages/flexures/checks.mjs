// The checks on the mechanism as it moved, for lamina.mjs (see checksStage below).
import { AREA, FE_MOST, rad, empty, union, intersect, subtract, grow, shrink, area, box, all, gapBetween } from './plane.mjs';
import { split, coverage } from './bent.mjs';
import { fixedLoads } from './beams.mjs';
import { outOfPlane } from './outofplane.mjs';
import { stage } from './cache.mjs';
import { grid as feaGrid, analyse as feaAnalyse } from '@rulecad/fea';

// A shape's middle: its box's. (Before this was its own module, the across-the-plane check called a centroid that only
// existed inside the strain check, so a moving body with no beam ends to push at threw instead of being checked)
const centroid = (a) => { const { lo, hi } = box(a); return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; };

// The checks on the mechanism as it moved, for lamina.mjs: nothing that moves runs into the frame in any frame
// (planned, or as the physics moved it), a loose part (a disc) is held across the plane where it lies, the frame
// bent by the flexures' own pull closes no gap to what moves (finite elements, a stage kept between builds), and
// each moving body pushed across the plane stays in it. A stage of lamina(): it says what it finds through f.
export async function checksStage({ arches, bridges, carried, cuts, ends, f, findings, frames, gap, guidesHeld, height, joints, kinematicSpec, mark, material, parts, physical, physicsInputs, pinsOf, planned, sim, spec, what }) {
  if (!empty(parts.ground.shape)) {
    const G = parts.ground.shape, deep = gap / 2, worst = {};
    const own = Object.fromEntries(Object.entries(parts).filter(([n, p]) => p.kind === 'flexure' && joints[n].from === 'ground').map(([n, p]) => [n, grow(intersect(p.shape, G), Math.max(gap * 2, 0.5))])); // (where a flexure grows from the frame, and a little round it)
    for (const fr of [...planned, ...physical]) for (const [n, o] of Object.entries(fr.parts)) {
      if (n === 'ground' || (!parts[n] && !spec.free?.[n]) || empty(o)) continue;
      let hit = intersect(o, G);
      if (own[n]) hit = subtract(hit, own[n]);
      if (empty(shrink(hit, deep))) continue;
      const a = area(hit);
      if (!worst[n] || a > worst[n].a) worst[n] = { a, fr, at: box(hit) };
    }
    for (const [n, w] of Object.entries(worst)) f('fail', `${what(n)} runs into the frame${w.fr.label ? ` (${w.fr.label})` : ` going from ${w.fr.from} to ${w.fr.to}`}, ${w.a.toFixed(1)} mm² of it at worst, near (${((w.at.lo[0] + w.at.hi[0]) / 2).toFixed(1)}, ${((w.at.lo[1] + w.at.hi[1]) / 2).toFixed(1)}): the frame is in its room, so it can't move there`, 'lamina.room', { part: n, from: w.fr.from, to: w.fr.to, t: w.fr.t, area: w.a, at: w.at });
    if (!Object.keys(worst).length) f('pass', `in all ${planned.length + physical.length} frames, planned and as the physics moved them, nothing runs into the frame`, 'lamina.room');
  }

  mark('room');
  // ---- carried: a loose part lying in the plane (a disc) falls out of it unless something holds it across the plane
  // on both faces, a roof (a bridge) over it and a floor under it, all the way it goes while it's in the frame: its
  // middle over what holds it each side (else it tips off the edge), loaded and through the shot ----
  if (spec.free && !empty(parts.ground.shape)) {
    const hullOf = (pts) => { const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = []; for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), q) <= 0) hi.pop(); hi.push(q); } return [...lo.slice(0, -1), ...hi.slice(0, -1)]; };
    const within = (h, [x, y]) => h.length >= 3 && h.every((a, i) => { const b = h[(i + 1) % h.length]; return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9; });
    const faces = { over: union(bridges.filter((b) => !b.bottom && b.owner === 'ground').map((b) => b.shape)), under: union(bridges.filter((b) => b.bottom && b.owner === 'ground').map((b) => b.shape)) }, G = box(parts.ground.shape);
    for (const n of Object.keys(spec.free)) {
      const along = [{ label: 'loaded', shape: all(spec.free[n].shape) }, ...physical.filter((fr) => fr.parts[n] && fr.label).map((fr) => ({ label: fr.label, shape: fr.parts[n] }))];
      const lost = {};
      for (const fr of along) {
        const { lo, hi } = box(fr.shape), mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
        if (mid[0] < G.lo[0] || mid[0] > G.hi[0] || mid[1] < G.lo[1] || mid[1] > G.hi[1]) break; // (out of the frame: gone)
        for (const [side, F] of Object.entries(faces)) { if (lost[side]) continue; const o = intersect(fr.shape, F); if (empty(o) || !within(hullOf(o.flat()), mid)) lost[side] = { label: fr.label, mid }; }
      }
      for (const [side, w] of Object.entries(lost)) f('fail', `${n} isn't held ${side === 'over' ? 'from above' : 'from below'} ${w.label === 'loaded' ? 'where it is loaded' : `(${w.label})`}, at (${w.mid.map((x) => x.toFixed(1)).join(', ')}): ${side === 'over' ? 'nothing over' : 'nothing under'} its middle, so it falls out of the plane. ${side === 'over' ? 'Bridge over' : 'Floor under'} its way, from where it's loaded to where it leaves`, 'lamina.carried', { part: n, side, at: w.mid, frame: w.label });
      if (!Object.keys(lost).length) f('pass', `${n} is held over and under all the way it goes in the frame`, 'lamina.carried', { part: n });
    }
  }

  mark('carried');
  // ---- the frame under the mechanism's own forces: at the end of each step, what the flexures pull on the frame
  // with (from the beams), the frame an elastic plate as tall as the print, held where a hand holds it (`grip`, or
  // its back quarter); every clearance to what moves then checked on the frame as it bends. A frame that closes
  // onto what moves (prongs either side of a channel pulled together) fails ----
  // (a stage kept between builds, by the mechanism in the plane, the physics it ran, the frame's own bridges and where
  // it's held: a strap or a check after it doesn't start it again)
  const frameStart = findings.length, frameKept = spec.check?.frame !== false && !empty(parts.ground.shape) ? await stage('frame', { spec: kinematicSpec, physics: physicsInputs, bridges: bridges.filter((x) => x.owner === 'ground').map((x) => x.shape), grip: spec.grip }, async () => {
    const G = parts.ground.shape, { lo, hi } = box(G), side = Math.max(0.25, Math.sqrt(((hi[0] - lo[0]) * (hi[1] - lo[1])) / FE_MOST));
    const nx = Math.ceil((hi[0] - lo[0]) / side) + 2, ny = Math.ceil((hi[1] - lo[1]) / side) + 2, x0 = lo[0] - side, y0 = lo[1] - side;
    const g = feaGrid({ nx, ny, h: side }), fill = coverage(G, g, x0, y0);
    // Bridges and floors are frame too, as thick as they are: a roof over a channel ties its two sides
    for (const br of bridges.filter((x) => x.owner === 'ground')) { const c = coverage(br.shape, g, x0, y0); for (let e = 0; e < g.cells; e++) fill[e] = Math.min(1, fill[e] + c[e] * (1 - Math.min(1, fill[e])) * (br.depth / height)); }
    const grip = spec.grip ? all(spec.grip) : [[[lo[0] - 1, lo[1] - 1], [lo[0] + (hi[0] - lo[0]) / 4, lo[1] - 1], [lo[0] + (hi[0] - lo[0]) / 4, hi[1] + 1], [lo[0] - 1, hi[1] + 1]]];
    const held = coverage(grip, g, x0, y0), fixed = new Uint8Array(g.dofs);
    for (let e = 0; e < g.cells; e++) if (fill[e] >= 0.5 && held[e] > 0.5) { const i = e % nx, j = (e - i) / nx; for (const n of [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)]) fixed[2 * n] = fixed[2 * n + 1] = 1; }
    const cellAt = ([x, y]) => { const i = Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / side))), j = Math.max(0, Math.min(ny - 1, Math.floor((y - y0) / side))); return { i, j, s: (x - x0) / side - i, t: (y - y0) / side - j }; };
    // A load where the flexure meets the frame's face lands in a cell that's mostly empty: put it on the nearest solid one
    const solidAt = (p) => { const c = cellAt(p); let best = null; for (let r = 0; r < 12 && !best; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { const i = c.i + di, j = c.j + dj; if (i < 0 || j < 0 || i >= nx || j >= ny || fill[j * nx + i] < 0.5) continue; const d = Math.hypot(di, dj); if (!best || d < best.d) best = { d, p: [x0 + (i + 0.5) * side, y0 + (j + 0.5) * side] }; } return best ? best.p : p; };
    const cornersOf = ({ i, j, s, t }) => [[g.node(i, j), (1 - s) * (1 - t), [i, j]], [g.node(i + 1, j), s * (1 - t), [i + 1, j]], [g.node(i + 1, j + 1), s * t, [i + 1, j + 1]], [g.node(i, j + 1), (1 - s) * t, [i, j + 1]]];
    let worst = null, most = 0, shown = null, unheld = null; // shown: the frame where it bends most, its outline and how far each point moves
    for (const tr of sim.transitions) {
      const q = Float64Array.from(tr.end), f = new Float64Array(g.dofs);
      // Each load to the corners of its cell: the force shared as the point's place in the cell, the moment as a couple
      for (const L of fixedLoads(sim.sys, q)) {
        const P = solidAt(L.at), c = cellAt(P), cs = cornersOf(c), r = cs.map(([, , [i, j]]) => [x0 + i * side - P[0], y0 + j * side - P[1]]), rr = r.reduce((a, [rx, ry]) => a + rx * rx + ry * ry, 0) || 1;
        cs.forEach(([n, w], k) => { f[2 * n] += L.force[0] * w - (L.moment * r[k][1]) / rr; f[2 * n + 1] += L.force[1] * w + (L.moment * r[k][0]) / rr; });
      }
      if (!f.some((x) => Math.abs(x) > 1e-12)) continue;
      let u;
      try { ({ u: [u] } = feaAnalyse({ grid: g, density: Float64Array.from(fill, (x) => Math.min(1, x)), material: { E: material.E, nu: 0.38 }, thickness: height, fixed, loads: [f] })); } catch (e) {
        if (e.code !== 'fea.unheld') throw e;
        // The frame, as it's held here, can slide or turn under its springs' loads: nothing to measure its bending against
        unheld ||= tr; // (said once, after the last transition)
        continue;
      }
      const at = (p) => { let dx = 0, dy = 0; for (const [n, w] of cornersOf(cellAt(p))) { dx += w * u[2 * n]; dy += w * u[2 * n + 1]; } return [dx, dy]; };
      // The frame's outline, finely, moved as it bends
      let here = 0;
      const fine = split(G, side), moves = fine.map((o) => o.map((p) => { const d = at(p); here = Math.max(here, Math.hypot(...d)); return d; }));
      const bent = union([fine.map((o, k) => o.map((p, i) => [p[0] + moves[k][i][0], p[1] + moves[k][i][1]]))]);
      if (here > most) { most = here; shown = { state: tr.to, outline: fine, moves }; }
      const fr = frames.filter((x) => x.from === tr.from && x.to === tr.to).sort((a, b) => b.t - a.t)[0];
      // What moves where it is then, and what's loose (a disc, waiting in its channel) where it was put
      // (a loose part lies in the frame and goes where the frame round it goes: moved as the frame at its edge moves on
      // average, so what's checked is its slot closing on it, not the frame bending past where it was put)
      const carried = (shape) => { const pts = shape.flat(), d = pts.reduce((a, p) => { const m = at(p); return [a[0] + m[0] / pts.length, a[1] + m[1] / pts.length]; }, [0, 0]); return shape.map((l) => l.map(([x, y]) => [x + d[0], y + d[1]])); };
      const there = { ...Object.fromEntries(Object.entries(fr?.parts || {}).filter(([n]) => n !== 'ground' && !spec.free?.[n])), ...Object.fromEntries(Object.entries(spec.free || {}).map(([n, x]) => [n, all(x.shape)])) };
      const thereBent = Object.fromEntries(Object.entries(there).map(([n, sh]) => [n, spec.free?.[n] ? carried(sh) : sh]));
      for (const [n, shape] of Object.entries(there)) {
        const moved = thereBent[n], before = gapBetween(G, shape, gap * 2) ?? gap * 2, after = area(intersect(bent, moved)) > AREA ? 0 : (gapBetween(bent, moved, gap * 2) ?? gap * 2);
        const closed = before - after;
        if (closed > 0.01 && (!worst || after < worst.after)) worst = { part: n, state: tr.to, before, after, closed, at: box(intersect(grow(bent, gap), shape)) };
      }
    }
    if (unheld) f('warn', `the frame isn't held where its springs load it (${unheld.from} to ${unheld.to}), so how it bends can't be worked out: say where it is held with grip (by default, its back quarter)`, 'lamina.frame', { from: unheld.from, to: unheld.to });
    if (most > 0) {
      const w = worst, where = w && !empty(w.at) && Number.isFinite(w.at.lo[0]) ? ` near (${((w.at.lo[0] + w.at.hi[0]) / 2).toFixed(1)}, ${((w.at.lo[1] + w.at.hi[1]) / 2).toFixed(1)})` : '';
      const level = !w ? 'pass' : w.after <= 0.02 ? 'fail' : w.after < gap / 2 ? 'warn' : 'pass';
      f(level, w
        ? `the frame bends up to ${most.toFixed(2)} mm under the flexures' pull; at ${w.state} it closes ${w.closed.toFixed(2)} mm towards ${what(w.part)}${where}, leaving ${w.after.toFixed(2)} mm${level === 'fail' ? ': it pinches it. Stiffen the frame there, or tie it across' : ''}`
        : `the frame bends up to ${most.toFixed(2)} mm under the flexures' pull, closing no gap to what moves`, 'lamina.frame', { most, ...(w || {}), shown });
    }
    return { findings: findings.slice(frameStart) };
  }) : null;
  if (frameKept) { findings.splice(frameStart); findings.push(...frameKept.findings); }

  mark('frame');
  // ---- across the plane: each moving body pushed across the print at its farthest point from what holds it, by a
  // tenth of the hand's pull (a finger a little off the plane); a lamina's flexures are stiff bending across it but
  // soft twisting, so a body on long thin arms tips out of the plane. Bridges over it hold it from lifting, floors
  // under it from dropping ----
  if (spec.check?.across !== false) {
    const peak = Math.max(0, ...sim.transitions.flatMap((tr) => tr.curve.flatMap((c) => c.points.map(([, F]) => Math.abs(F)))));
    const push = spec.check?.side ?? Math.max(1, peak * Math.sin(rad(15))); // (a finger pulling 15° off the plane)
    // A pin holds what turns on it to what it's on, both ways (the cap over it, the floor under it), at the ring
    // where they overlap, after the lift between them
    const pinHolds = pinsOf.flatMap((P) => Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3, R = P.r + P.c + P.lip / 2; return { body: P.to, ...(P.from === 'ground' ? {} : { to: P.from }), at: [P.at[0] + R * Math.cos(a), P.at[1] + R * Math.sin(a)], k: material.E * height, gap: P.lift }; }));
    for (const b of new Set(Object.values(joints).map((j) => j.to))) {
      if (!sim.sys.body[b] || sim.sys.body[b].fixed) continue;
      const ends = sim.sys.elements.flatMap((e) => [e.a, e.b]).filter((x) => x.body?.name === b).map((x) => [x.body.at[0] + x.o[0], x.body.at[1] + x.o[1]]);
      const c = ends.length ? [ends.reduce((a, p) => a + p[0], 0) / ends.length, ends.reduce((a, p) => a + p[1], 0) / ends.length] : centroid(parts[b].shape);
      const pts = parts[b].shape.flat(), P = pts.reduce((a, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) > Math.hypot(a[0] - c[0], a[1] - c[1]) ? p : a), pts[0]);
      // (each with its play: a guide's ridge moves the print gap in its groove before it bears, a bridge or a floor its
      // own gap; held rigidly, a printed part looked held where it wobbles)
      const holds = (top) => [...cuts.filter((x) => x.body === b && top === !x.bottom).flatMap((x) => x.shape.flat().map((at) => ({ at, gap: x.gap ?? gap, ...(x.owner ? { to: x.owner } : {}) }))), ...arches.filter((x) => x.body === b && !top).flatMap((x) => x.shape.flat().map((at) => ({ at, gap: x.gap ?? gap }))), ...guidesHeld.filter((x) => x.body === b).flatMap((x) => x.shape.flat().map((at) => ({ at, gap })))].map((h) => ({ body: b, k: 1e3, ...h }));
      const arms = new Set(Object.entries(joints).filter(([, j]) => j.to === b).map(([n]) => n)), beams = Object.keys(sim.beamOf).filter((x) => arms.has(sim.beamOf[x]));
      let worst = { most: 0, dir: '' };
      for (const [dir, sign] of [['up', 1], ['down', -1]]) {
        const r = outOfPlane(sim.sys, { loads: [{ body: b, at: P, force: sign * push }], springs: [...holds(sign > 0), ...pinHolds] });
        const body = Math.max(...pts.map((p) => Math.abs(r.lift(b, p)))), arm = Math.max(0, ...beams.map((x) => r.most(x))), most = Math.max(body, arm);
        if (most > worst.most) worst = { most, dir, arm: arm > body };
      }
      const level = worst.most > 1 ? 'fail' : worst.most > gap ? 'warn' : 'pass';
      f(level, `${b}: pushed ${push.toFixed(1)} N across the plane at (${P.map((x) => x.toFixed(1)).join(', ')}) (the hand's pull 15° off the plane), ${worst.arm ? 'the flexures holding it move' : 'it moves'} ${worst.most.toFixed(2)} mm out of the plane, its guides' play included${level === 'pass' ? '' : `: it flexes out of the plane, ${level === 'fail' ? 'far' : 'more than the print gap'}. Trap it across the plane (a guide or a bridge), or stiffen what holds it`}`, 'lamina.across', { body: b, most: worst.most, push, at: P });
    }
  }
}

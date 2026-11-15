// How fixings draws: cutters that start at a point on a face (at) and go into the material along a direction (into),
// as @rulecad/shapes' features do, and solids of revolution made face by face so a reference screw is a few dozen
// triangles. Nothing here knows a thread: sizes come in as plain numbers.
import jscad from '@jscad/modeling';

const { translate, rotateX, rotateY } = jscad.transforms, { geom3, poly3 } = jscad.geometries;

export const OUT = 0.1; // how far a cutter starts outside the face it enters by, so no faces lie on each other
export const SEGMENTS = 48; // round cutters
export const LIGHT = 12; // round reference hardware: an M3x12 cap screw in 96 triangles
/** The directions a cutter can go, as @rulecad/shapes names them. */
export const DIRECTIONS = ['+x', '-x', '+y', '-y', '+z', '-z'];
// Which way is up (+z in the part) in a cutter's own drawing, for one going across: where its roof points
export const UP = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
export const booleans = { union: jscad.booleans.union, subtract: jscad.booleans.subtract };

/** A cutter drawn going down from z = 0 (into -z), turned to go along `into` from the origin, then moved to `at`. */
export function along(g, into, at = [0, 0, 0]) {
  const turn = { '-z': (x) => x, '+z': (x) => rotateX(Math.PI, x), '+x': (x) => rotateY(-Math.PI / 2, x), '-x': (x) => rotateY(Math.PI / 2, x),
    '+y': (x) => rotateX(Math.PI / 2, x), '-y': (x) => rotateX(-Math.PI / 2, x) }[into];
  return translate(at, turn(g));
}

/**
 * A solid of revolution about z, from its profile: points [radius, z] running from the axis at the bottom, out, up and
 * back to the axis at the top (or a closed loop clear of the axis, anticlockwise, for a ring). Each edge of the profile
 * is one band of n flat faces, so the count of triangles is known: 2 n for a band, n where it meets the axis.
 * @param {number[][]} profile @param {number} [n] faces round @param {number} [phase] the first corner's angle, radians
 * @returns {object} a JSCAD geom3
 */
export function lathe(profile, n = SEGMENTS, phase = 0) {
  const ring = (r, z) => Array.from({ length: n }, (_, i) => { const a = phase + (2 * Math.PI * i) / n; return [r * Math.cos(a), r * Math.sin(a), z]; });
  const pts = profile.filter((p, i) => i === 0 || Math.abs(p[0] - profile[i - 1][0]) > 1e-9 || Math.abs(p[1] - profile[i - 1][1]) > 1e-9);
  const rings = pts.map(([r, z]) => (r > 1e-9 ? ring(r, z) : null)), polys = [], closed = !!rings[0] && !!rings.at(-1);
  for (let e = 0; e < (closed ? pts.length : pts.length - 1); e++) {
    const b = (e + 1) % pts.length, P = rings[e], Q = rings[b];
    if (!P && !Q) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      polys.push(!P ? [[0, 0, pts[e][1]], Q[j], Q[i]] : !Q ? [P[i], P[j], [0, 0, pts[b][1]]] : [P[i], P[j], Q[j], Q[i]]);
    }
  }
  return geom3.create(polys.map((p) => poly3.create(p)));
}

/** The volume a profile turns into, with true circles: each edge a frustum (mm³). @param {number[][]} profile @returns {number} */
export function turnedVolume(profile) {
  let v = 0;
  for (let i = 0; i < profile.length; i++) {
    const [r0, z0] = profile[i], [r1, z1] = profile[(i + 1) % profile.length];
    v += (Math.PI / 3) * (z0 - z1) * (r0 * r0 + r0 * r1 + r1 * r1); // (the shoelace sum of a turned outline: edges going down the outside add, going up take away)
  }
  return Math.abs(v);
}

/**
 * A round cutter going down from z = 0, from its steps: [radius, depth] pairs from the mouth inwards, the radius
 * changing between one depth and the next. It starts OUT above the face, and with through it runs OUT past its end.
 * @param {number[][]} steps @param {{ through?: boolean }} [o] @returns {object} a JSCAD geom3 to subtract
 */
export function bore(steps, { through = false } = {}) {
  const last = steps.at(-1), end = last[1] + (through ? OUT : 0);
  const side = [[steps[0][0], OUT], ...steps.map(([r, d]) => [r, -d])];
  if (through) side.push([last[0], -end]);
  return lathe([[0, -end], ...side.reverse(), [0, OUT]]);
}

/**
 * A cutter lying on its side, going down from z = 0 in its own drawing, from its steps as bore takes them: at every
 * depth its section is a teardrop, a circle with a 45° pointed roof on the up side, so it prints with no support. One
 * closed solid with no joins in it, for the stepped and coned cutters @rulecad/shapes has no helper for.
 * @param {number[][]} steps [radius, depth] pairs from the mouth inwards @param {number[]} up which way is up in the drawing: [1, 0], [0, 1] …
 * @param {{ through?: boolean }} [o] @returns {object} a JSCAD geom3 to subtract
 */
export function teardrop(steps, up, { through = false } = {}) {
  // 35 steps round: no corner then lies level with the axis or 30° off it, the only places a corner's height is a round
  // number of mm, where it could sit exactly in the plane a slicer (or printcheck) cuts a layer at
  const turn = Math.atan2(up[1], up[0]), n = 35, last = steps.at(-1);
  // the point of the roof, then the circle from 45° past it round to 45° short of it
  const section = (r, z) => [[r * Math.SQRT2 * Math.cos(turn), r * Math.SQRT2 * Math.sin(turn), z], ...Array.from({ length: n + 1 }, (_, i) => { const t = turn + Math.PI / 4 + (1.5 * Math.PI * i) / n; return [r * Math.cos(t), r * Math.sin(t), z]; })];
  const rings = [[steps[0][0], OUT], ...steps.map(([r, d]) => [r, -d]), ...(through ? [[last[0], -last[1] - OUT]] : [])].map(([r, z]) => section(r, z)), polys = [rings[0]];
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n + 2; i++) { const j = (i + 1) % (n + 2); polys.push([rings[k][i], rings[k + 1][i], rings[k + 1][j], rings[k][j]]); }
  polys.push([...rings.at(-1)].reverse());
  return geom3.create(polys.map((p) => poly3.create(p)));
}

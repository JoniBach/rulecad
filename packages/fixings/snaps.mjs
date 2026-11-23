// Annular snaps: a lid that clicks on. A bead runs round the outside of a round box's wall near its rim; the lid's
// skirt has a groove inside it the bead's shape plus a clearance. Pushed on, the bead's lead face spreads the skirt and
// squeezes the box's wall; past it, both spring back and the bead sits in the groove with no stress left in either.
// Pulled, the bead's return face has to spread the skirt again. annularSnapModel gives the forces and the hoop strain in
// each part from the Bayer snap-fit design guide's annular joint (a beam on an elastic foundation: P = y d Es X, with
// X from the tube's proportions), the two parts as springs in series where both give, and the strain held to the
// plastic's limit by the guide's rule for a brief snap. annularBead is the bead to add to the box's wall, annularGroove
// the groove (and the skirt's lead-in) to cut from the lid. Units: mm, N, MPa, degrees.
import { DEFAULTS, printerOf, rest, finding, positive, oneOf, isNum, shown, mm, r3 } from './model.mjs';
import { lathe } from './draw.mjs';
import { optionsOf } from './holes.mjs';
import { materialOf } from './strength.mjs';

const n1 = (x) => +x.toFixed(1), n2 = (x) => +x.toFixed(2), n4 = (x) => +x.toFixed(4), pc = (x) => `${mm(n2(x * 100))}%`;
const tan = (deg) => Math.tan((deg * Math.PI) / 180);
/** The uses an annular snap is sized for: opened often (a lid, the guide's 60% of the brief-snap strain) or snapped once. */
export const SNAP_USES = ['often', 'once'];

/**
 * The geometric factor of the Bayer guide's annular snap joint for the outer part, a tube (the hub, here the lid's
 * skirt) spread over a rigid shaft: X_N = 0.62 √((k − 1)/(k + 1)) / ((k² + 1)/(k² − 1) + ν), k = d0 / d.
 * @param {number} k the tube's outside diameter over its inside diameter at the joint @param {number} nu Poisson's ratio
 * @returns {number}
 */
export const hubFactor = (k, nu) => (0.62 * Math.sqrt((k - 1) / (k + 1))) / ((k * k + 1) / (k * k - 1) + nu);
/**
 * The same for the inner part, a hollow shaft (here the box's wall) squeezed in a rigid tube:
 * X_W = 0.62 √((k − 1)/(k + 1)) / ((k² + 1)/(k² − 1) − ν), k = d / di.
 * @param {number} k the shaft's outside diameter at the joint over its inside diameter @param {number} nu Poisson's ratio
 * @returns {number}
 */
export const shaftFactor = (k, nu) => (0.62 * Math.sqrt((k - 1) / (k + 1))) / ((k * k + 1) / (k * k - 1) - nu);

// The force along the push to make a transverse force P over a face at deg from the axis, with friction mu: the
// guide's W = P (μ + tan α) / (1 − μ tan α). A square face, or one friction locks, never lets go
const along = (P, deg, mu) => (deg >= 90 || mu * tan(deg) >= 1 ? Infinity : (P * (mu + tan(deg))) / (1 - mu * tan(deg)));
const per = (deg, mu) => along(1, deg, mu);
// How much stiffer a joint is for lying away from its tube's free end: 1 at the end, the guide's 3 once it is at least
// 1.8 √(d t) in, and straight between (the guide gives only the ends; the line between is an estimate)
const remote = (end, d, t) => { const far = 1.8 * Math.sqrt(d * t), k = DEFAULTS.snap_remote.value; return { far: n2(far), factor: 1 + (k - 1) * Math.min(1, end / far) }; };

// e^(s u) (A cos u + B sin u) and its n-th derivative in u, at u
const wave = (s, A, B, u, n) => { for (let i = 0; i < n; i++) [A, B] = [s * A + B, s * B - A]; return Math.exp(s * u) * (A * Math.cos(u) + B * Math.sin(u)); };
const LONG = 12; // a tube this many 1/β long is long: e^-12 of the load is left at its far end
/**
 * A ring load on a thin tube, as Hetényi's beam on an elastic foundation (the theory the Bayer guide's annular joint is
 * built on): the tube's wall in ξ = βx, with β⁴ = 3 (1 − ν²) / (R² t²), bends as w'''' + 4 w = 0, and a ring load q
 * per mm round it puts a step of q / (D β³) in w''' (D = E t³ / (12 (1 − ν²))). The load is a from one end and b from
 * the other (each in 1/β), and each end is 'free' (no moment, no shear), 'closed' (held by an end wall: no deflection,
 * no slope, the stiffest an end can be) or 'long' (far enough off not to count). Gives the deflection under the load and
 * the curvature w'' at each end, both per q / (D β³). The free-standing checks: a long tube both ways gives w = 1/8,
 * a free end at the load gives 1/2 (Hetényi, Beams on Elastic Foundation, 1946: w = Pβ / 2k and 2Pβ / k).
 * @param {number} a the load's distance from end A, in 1/β @param {number} b from end B
 * @param {{ A?: 'free' | 'closed' | 'long', B?: 'free' | 'closed' | 'long' }} [ends] (default both long)
 * @returns {{ w: number, bendA: number, bendB: number }}
 */
export function tubeRing(a, b, ends = {}) {
  const what = 'tubeRing', kinds = ['free', 'closed', 'long'];
  for (const [k, v] of [['a', a], ['b', b]]) if (!(isNum(v) && v >= 0)) throw new Error(`${what}: ${k} is the load's distance from an end, in 1/β, 0 or more (got ${shown(v)})`);
  if (ends == null || typeof ends !== 'object' || Array.isArray(ends)) throw new Error(`${what}: ends is { A, B }, each free, closed or long (got ${shown(ends)})`);
  // An end more than twice LONG away is long whatever it is: e^-24 of the load reaches it, and its e^u waves would
  // overflow a double past about 709/β (its curvature there is then 0 to that precision)
  const A0 = oneOf(what, 'ends.A', ends.A ?? 'long', kinds), B0 = oneOf(what, 'ends.B', ends.B ?? 'long', kinds);
  const A = a > 2 * LONG ? 'long' : A0, B = b > 2 * LONG ? 'long' : B0, la = A === 'long' ? LONG : a, lb = B === 'long' ? LONG : b;
  // Each side of the load has its own four waves, from its start: e^-u cos u, e^-u sin u, e^u cos u, e^u sin u
  const row = (side, u, n, sign = 1) => { const r = Array(8).fill(0); [[-1, 1, 0], [-1, 0, 1], [1, 1, 0], [1, 0, 1]].forEach(([s, c, si], i) => { r[side * 4 + i] = sign * wave(s, c, si, u, n); }); return r; };
  const end = (side, u, kind) => (kind === 'closed' ? [0, 1] : [2, 3]).map((n) => [row(side, u, n), 0]);
  const eqs = [...end(0, 0, A), ...end(1, lb, B)];
  for (const n of [0, 1, 2, 3]) { const l = row(0, la, n, -1), r = row(1, 0, n); eqs.push([l.map((x, i) => x + r[i]), n === 3 ? 1 : 0]); }
  // Gauss with partial pivoting
  const M = eqs.map(([r, v]) => [...r, v]);
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j < 9; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = M.map((r, i) => r[8] / r[i]), at = (side, u, n) => row(side, u, n).reduce((t, v, i) => t + v * x[i], 0);
  return { w: at(1, 0, 0), bendA: A === A0 ? at(0, 0, 2) : 0, bendB: B === B0 ? at(1, lb, 2) : 0 };
}
// A closed end near the joint: how much stiffer it makes the part (the beam's deflection with the end open over that
// with it closed, the rest of the tube as it is) and the bending strain at the closed end's root per N of P
const closedEnd = (free, shut, Rm, t, d, E, nu) => {
  const beta = Math.pow((3 * (1 - nu * nu)) / (Rm * Rm * t * t), 0.25), a = free * beta, b = shut * beta;
  const open = tubeRing(a, LONG, { A: 'free' }), closed = tubeRing(a, b, { A: 'free', B: 'closed' });
  // q = P / (π d) per mm round; M = D w''(x) = w''(ξ) q / β; the strain at the face is 6 M (1 − ν²) / (E t²)
  const perP = (6 * Math.abs(closed.bendB) * (1 - nu * nu)) / (Math.PI * d * beta * E * t * t);
  return { beta, stiffer: open.w / closed.w, perP };
};

/**
 * @typedef {{ diameter: number, inside: number, outside: number, wall: number, end: number, far: number, factor: number,
 *   remote: number, X: number, stiffness: number, deflection: number, strain: number, closed: number | null, stiffer?: number, decay?: number, root?: number }} SnapPart
 *   one part of the joint: its diameters at the joint, wall, how far the joint is from its free end and the guide's
 *   "remote" distance, the stiffening that gives (remote), and with a closed end's too (factor), the geometric factor, its stiffness (N per mm of diameter),
 *   how much of the interference it takes (on the diameter) and the hoop strain that leaves in it; with a closed end
 *   (closed, its distance from the joint), how much stiffer that end makes it, the length 1/β over which its wall
 *   bends, and the bending strain at the end's root
 */
/**
 * @typedef {{ kind: 'annular snap', diameter: number, wall: number, skirt: number, clearance: number, bead: number, length: number, undercut: number,
 *   interference: number, lead: number, back: number, land: number, sized: boolean, uses: 'often' | 'once', material: string,
 *   lidMaterial: string, friction: number, permissible: number, box: SnapPart, lid: SnapPart, force: number, insertion: number,
 *   removal: number, holds: boolean, pull: number | null, margin: number | null, most: { undercut: number, removal: number },
 *   groove: { inner: number, outer: number, depth: number }, rests: object[], findings: object[] }} AnnularSnap
 *   diameter: the box's wall outside at the joint; bead: how far the bead stands off it (radial); length: the bead's
 *   height along the axis, return face, land and lead face; undercut: the
 *   bead less the clearance, the radial overlap the skirt is spread by; interference: the same on the diameter, shared
 *   between the parts; force: the transverse force P that takes; insertion and removal: along the push, N;
 *   permissible: the hoop strain each part may see; most: the largest undercut that strain allows and the removal
 *   force it would give; groove: the groove's radii and depth in the skirt
 */

/**
 * An annular snap: a lid with a skirt that clicks over a bead round a round box's rim. Each part is a tube; the
 * interference (the bead less the clearance, on the diameter) is shared between them as two springs in series, each
 * P = y d Es X (Bayer, Snap-Fit Joints for Plastics, the annular snap joint), with Es taken as the material's modulus.
 * The hoop strain in each is its share over its diameter, held to the plastic's limit: about 70% of its yield strain
 * for a brief snap in an amorphous plastic, and 60% of that for a joint opened often (the same guide). Without a bead
 * height, the bead is sized: the smallest the print can hold (fixings.snap_least), or more where pull asks it, up to
 * what the strain allows. Refused by name: a bead no taller than the clearance (it never catches), walls that leave no
 * tube, angles outside 0° to 90°, a lead friction locks, a groove deeper than the skirt. A closed end near the joint
 * (the box's floor, the lid's top) is a beam on an elastic foundation held round there (Hetényi): the part is stiffer,
 * so its mate takes more of the interference, and the bending at that end's root is held to the same limit.
 * @param {{ diameter: number, wall: number, skirt: number, bead?: number, lead?: number, back?: number, land?: number, boxEnd?: number, lidEnd?: number, boxFloor?: number, lidTop?: number }} p
 *   diameter: the box's wall outside, at the joint, mm; wall: the box's wall thickness there; skirt: the lid's skirt
 *   thickness; bead: how far the bead stands off the wall (default sized); lead: the face the lid pushes over, its
 *   angle from the axis (default 30); back: the return face's (default 45: the steepest the box prints without support,
 *   as it is the underside of the bead); land: the bead's flat top, along the axis (default two layers); boxEnd: from the
 *   bead to the box's rim, its free end; lidEnd: from the groove to the skirt's mouth (each default 0, at the end);
 *   boxFloor: from the bead to the box's floor, its closed end; lidTop: from the groove to the underside of the lid's
 *   top (each default none: far enough off not to count; each at least its part's wall, the box's wall or the skirt)
 * @param {{ material?: string | object, lidMaterial?: string | object, printer?: object, sets?: object, uses?: 'often' | 'once', friction?: number, pull?: number, push?: number }} [o]
 *   material: the box's plastic (default PLA); lidMaterial: the lid's (default the box's); printer: the printer's rule
 *   set or values (default the X1C: its fit is the clearance, its overhang the steepest return face); uses: often (the
 *   default, a lid) or once; friction: μ between the parts (default fixings.snap_friction); pull: the force along the
 *   axis the lid must stay on against, N, held to fixings.load_margin; push: the force it is pushed on with, N (warns
 *   where pushing it on square takes more)
 * @returns {AnnularSnap}
 */
export function annularSnapModel(p, o = {}) {
  const what = 'annularSnapModel';
  if (p == null || typeof p !== 'object' || Array.isArray(p)) throw new Error(`${what}: give the joint's figures ({ diameter: 60, wall: 1.68, skirt: 1.26 }), not ${shown(p)}`);
  optionsOf(what, o, '{ material: \'pla\', pull: 10 }');
  const d = positive(what, 'diameter', p.diameter), t = positive(what, 'wall', p.wall), s = positive(what, 'skirt', p.skirt);
  if (t >= d / 2) throw new Error(`${what}: a wall of ${mm(t)} mm fills a ${mm(d)} mm box: the box's wall is under half its diameter, so it is a tube that gives`);
  const pr = printerOf(what, o.printer), c = pr.n('fit'), layer = pr.n('layer'), overhang = pr.n('overhang');
  const angle = (k, v, dflt) => { const x = v ?? dflt; if (!(isNum(x) && x > 0 && x <= 90)) throw new Error(`${what}: ${k} is an angle from the axis above 0° and at most 90°, in degrees (got ${shown(v)})`); return x; };
  const lead = angle('lead', p.lead, 30), back = angle('back', p.back, 45);
  if (lead >= 90) throw new Error(`${what}: a lead of 90° is a square face the lid cannot be pushed over: give a lead under 90°, 30° to 45° is usual`);
  const land = p.land != null ? positive(what, 'land', p.land) : r3(2 * layer);
  const end = (k) => { const v = p[k] ?? 0; if (!(isNum(v) && v >= 0)) throw new Error(`${what}: ${k} is how far the joint is from that part's free end, 0 mm or more (got ${shown(p[k])})`); return v; };
  // A closed end at the joint itself (0 mm) holds the wall rigid there, so it cannot give at all; one nearer than the
  // wall is thick is a solid corner, not a tube's wall that bends, which the beam on an elastic foundation (a thin-shell
  // theory) does not model, and its sums lose their sign to rounding as the distance goes to 0. Both refused
  const shut = (k, what2, wall, wallName) => { if (p[k] == null) return null; const v = p[k]; if (!(isNum(v) && v >= wall - 1e-9)) throw new Error(`${what}: ${k} is how far the joint is from ${what2}, its closed end, at least the ${mm(wall)} mm ${wallName} (got ${shown(v)}): a joint nearer its closed end than that is a solid corner that cannot give, so move it further off`); return v; };
  const boxFloor = shut('boxFloor', 'the box\'s floor', t, 'wall'), lidTop = shut('lidTop', 'the lid\'s top', s, 'skirt');
  const boxEnd = end('boxEnd'), lidEnd = end('lidEnd'), uses = oneOf(what, 'uses', o.uses ?? 'often', SNAP_USES);
  const mu = o.friction ?? DEFAULTS.snap_friction.value;
  if (!(isNum(mu) && mu >= 0 && mu < 1)) throw new Error(`${what}: friction is μ between the parts, 0 or more and under 1 (got ${shown(o.friction)})`);
  if (mu * tan(lead) >= 1 - 1e-9) throw new Error(`${what}: a ${mm(lead)}° lead at friction ${mm(mu)} locks: μ tan α is ${mm(n2(mu * tan(lead)))}, 1 or more, so no push slides the skirt over it. Give a lead under ${mm(n1((Math.atan(1 / mu) * 180) / Math.PI))}° at that friction, 30° to 45° is usual`);
  const pull = o.pull != null ? positive(what, 'pull (along the axis, in N)', o.pull) : null, push = o.push != null ? positive(what, 'push (along the axis, in N)', o.push) : null;
  if (p.bead != null && !(isNum(p.bead) && p.bead > c + 1e-9)) throw new Error(`${what}: a bead of ${shown(p.bead)} mm is no taller than the ${pr.cite('fit')} clearance of ${mm(c)} mm round the skirt, so it never catches: give a bead over ${mm(c)} mm, or leave it out to have it sized`);
  if (p.bead != null && p.bead >= s - 1e-9) throw new Error(`${what}: a bead of ${mm(p.bead)} mm needs a groove as deep in the ${mm(s)} mm skirt, which cuts right through it: give a skirt thicker than the bead, by a print line or more`);
  const box = materialOf(what, o.material ?? 'pla', o.sets), lidMat = materialOf(what, o.lidMaterial ?? o.material ?? 'pla', o.sets);
  for (const m of [box, lidMat]) if (!m.poisson) throw new Error(`${what}: ${m.name} has no poisson in its rule set, which the guide's geometric factor needs`);
  if (box.cls !== 'plastic' || lidMat.cls !== 'plastic') throw new Error(`${what}: an annular snap is two printed plastic parts; ${box.cls !== 'plastic' ? box.name : lidMat.name} is a ${box.cls !== 'plastic' ? box.cls : lidMat.cls}`);

  // The permissible hoop strain: the guide's share of the yield strain, the yield strain taken as strength over modulus
  // (a straight line to the strength, so below the real yield strain: on the safe side), and 60% of that if opened often
  const brief = DEFAULTS.snap_brief.value, often = uses === 'often' ? DEFAULTS.snap_often.value : 1;
  const limitOf = (m) => (brief * often * m.strength.value) / m.modulus.value, permissible = Math.min(limitOf(box), limitOf(lidMat));

  // Each part as a spring on the diameter: P = y d Es X, stiffened where the joint lies away from its free end
  const di = d - 2 * t, dh = d + 2 * c, d0 = dh + 2 * s;
  // A closed end (the box's floor, the lid's top) near the joint holds the tube round there: Hetényi's beam on an elastic
  // foundation gives how much stiffer that makes it than the same tube open, and the bending at the closed end's root
  const part = (diameter, inside, outside, wall, endAt, closedAt, X, m) => {
    const r = remote(endAt, diameter, wall), E = m.modulus.value, nu = m.poisson.value;
    const ce = closedAt == null ? null : closedEnd(endAt, closedAt, (inside + outside) / 4, wall, diameter, E, nu), factor = r.factor * (ce ? ce.stiffer : 1);
    return { diameter: r3(diameter), inside: r3(inside), outside: r3(outside), wall, end: endAt, far: r.far, remote: n2(r.factor), factor: n2(factor), X, stiffness: factor * diameter * E * X,
      closed: closedAt, ...(ce ? { stiffer: n2(ce.stiffer), decay: n2(1 / ce.beta), rootPerP: ce.perP } : {}) };
  };
  const B = part(d, di, d, t, boxEnd, boxFloor, shaftFactor(d / di, box.poisson.value), box), L = part(dh, dh, d0, s, lidEnd, lidTop, hubFactor(d0 / dh, lidMat.poisson.value), lidMat);
  const k = 1 / (1 / B.stiffness + 1 / L.stiffness);
  // The most force (and so interference) the strain allows: P = ε k_i d_i in each part
  // The most force (and so interference) the strain allows: P = ε k_i d_i in each part, and at a closed end's root P = ε / (strain per N)
  const Pmost = Math.min(permissible * B.stiffness * B.diameter, permissible * L.stiffness * L.diameter, ...[B, L].filter((q) => q.rootPerP).map((q) => permissible / q.rootPerP)), mostUndercut = Pmost / k / 2;
  // to the thousandth: the sized bead is rounded up to what the pull needs and down to what the strain allows
  const up = (x) => Math.ceil(x * 1000 - 1e-6) / 1000, down = (x) => Math.floor(x * 1000 + 1e-6) / 1000;
  const least = DEFAULTS.snap_least.value, back1 = per(back, mu), want = DEFAULTS.load_margin.value;
  let undercut, sized = false, sizeSays = null;
  if (p.bead != null) undercut = p.bead - c;
  else {
    sized = true;
    const need = pull != null && Number.isFinite(back1) ? (want * pull) / back1 / k / 2 : 0;
    undercut = Math.max(least, up(need));
    sizeSays = need > least ? `sized from the ${mm(pull)} N pull: ${mm(want)} times it over the ${mm(back)}° return face` : `sized as the smallest the print holds, fixings.snap_least ${mm(least)} mm${pull != null ? `, which already holds the ${mm(pull)} N pull ${mm(want)} times over` : ''}`;
    if (undercut > mostUndercut) { sizeSays += `, more than the ${mm(r3(mostUndercut))} mm the strain allows, so held to that`; undercut = Math.max(down(mostUndercut), 0); }
    undercut = r3(undercut);
  }
  const bead = r3(undercut + c), Y = 2 * undercut, P = k * Y, length = r3(bead / tan(back) + land + bead / tan(lead));
  // The strains are judged unrounded (exact, below), and shown to 4 places: a bead held to the strain's limit could round over it
  const exact = new Map();
  for (const q of [B, L]) { const e = { strain: P / q.stiffness / q.diameter, root: q.rootPerP != null ? P * q.rootPerP : null }; exact.set(q, e);
    q.deflection = r3(P / q.stiffness); q.strain = n4(e.strain); if (q.rootPerP != null) { q.root = n4(e.root); delete q.rootPerP; } q.X = +q.X.toPrecision(3); q.stiffness = n1(q.stiffness); }
  const insertion = along(P, lead, mu), removal = along(P, back, mu), holds = !Number.isFinite(removal), most = { undercut: down(mostUndercut), removal: Number.isFinite(back1) ? n1(back1 * Pmost) : Infinity };

  const out = [], rests = [], cited = (m) => `${m.strength.name} ${mm(m.strength.value)} MPa over ${m.modulus.name} ${mm(m.modulus.value)} MPa`;
  rests.push(pr.rest('fit'), pr.rest('overhang'), rest(box.modulus.name, box.modulus), rest(box.strength.name, box.strength), rest(box.poisson.name, box.poisson),
    rest('fixings.snap_brief', DEFAULTS.snap_brief), ...(uses === 'often' ? [rest('fixings.snap_often', DEFAULTS.snap_often)] : []), rest('fixings.snap_remote', DEFAULTS.snap_remote), pr.rest('line'));
  if (lidMat !== box && lidMat.name !== box.name) rests.push(rest(lidMat.modulus.name, lidMat.modulus), rest(lidMat.strength.name, lidMat.strength), rest(lidMat.poisson.name, lidMat.poisson));
  if (o.friction == null) rests.push(rest('fixings.snap_friction', DEFAULTS.snap_friction));
  if (sized) rests.push(rest('fixings.snap_least', DEFAULTS.snap_least));
  if (pull != null) rests.push(rest('fixings.load_margin', DEFAULTS.load_margin));
  out.push(finding('info', `a ${mm(bead)} mm bead round the ${mm(d)} mm box, in a skirt ${mm(c)} mm clear of the wall (${pr.cite('fit')}): ${mm(undercut)} mm of undercut, ${mm(r3(Y))} mm on the diameter, shared by the box's wall (${mm(B.deflection)} mm) and the lid's skirt (${mm(L.deflection)} mm)${sized ? `, ${sizeSays}` : ''}`,
    'snap.undercut', { values: { bead, undercut, interference: r3(Y), box: B.deflection, lid: L.deflection } }));
  for (const [q, name, m] of [[B, 'the box\'s wall', box], [L, 'the lid\'s skirt', lidMat]]) {
    const ok = exact.get(q).strain <= permissible * (1 + 1e-9);
    out.push(finding(ok ? 'pass' : 'fail', `${name} is ${ok ? '' : 'over its limit: '}${pc(q.strain)} hoop strain (${mm(q.deflection)} mm over ${mm(q.diameter)} mm) where ${m.name} may see ${pc(permissible)}: ${mm(DEFAULTS.snap_brief.value)} of its yield strain, ${cited(m)}${uses === 'often' ? `, and ${mm(DEFAULTS.snap_often.value)} of that since it is opened often` : ''}${ok ? '' : `. The most undercut the strain allows is ${mm(most.undercut)} mm: a smaller bead, a thinner ${q === B ? 'wall' : 'skirt'}, or a bigger box`}`,
      'snap.strain', { values: { strain: q.strain, permissible: n4(permissible), deflection: q.deflection, diameter: q.diameter }, refs: { part: q === B ? 'box' : 'lid', material: m.name } }));
  }
  for (const [q, name, m, endName] of [[B, 'the box\'s wall', box, 'floor'], [L, 'the lid\'s skirt', lidMat, 'top']]) {
    if (q.closed == null) continue;
    out.push(finding('info', `${name} meets its ${endName} ${mm(n2(q.closed))} mm from the joint, where a tube's wall bends over about 1/β = ${mm(q.decay)} mm: ${q.stiffer >= 1.01 ? `held round there, it is ${mm(q.stiffer)} times as stiff as the same tube open` : 'far enough off to make no difference to its stiffness'} (Hetényi's beam on an elastic foundation, the ${endName} taken as fully closed, the stiffest it can be)`,
      'snap.closed', { values: { closed: q.closed, decay: q.decay, stiffer: q.stiffer }, refs: { part: q === B ? 'box' : 'lid' } }));
    const ok = exact.get(q).root <= permissible * (1 + 1e-9);
    out.push(finding(ok ? 'pass' : 'fail', `${name} bends where it meets its ${endName}: ${pc(q.root)} strain at the root where ${m.name} may see ${pc(permissible)}${ok ? '' : `. Move the joint further from the ${endName} (the wall bends over about 1/β, ${mm(q.decay)} mm), or a smaller bead: the most undercut the strain allows is ${mm(most.undercut)} mm`}`,
      'snap.root', { values: { strain: q.root, permissible: n4(permissible), closed: q.closed }, refs: { part: q === B ? 'box' : 'lid', material: m.name } }));
  }
  // The groove is cut the bead's depth into the skirt: what is left behind it must print as a wall of at least one line
  const line = pr.n('line'), left = r3(s - bead), thick = left >= line - 1e-9;
  out.push(finding(thick ? 'pass' : 'fail', `the groove leaves ${mm(left)} mm of the ${mm(s)} mm skirt behind it${thick ? `, at least the ${pr.cite('line')} ${mm(line)} mm line` : `, under the ${pr.cite('line')} ${mm(line)} mm line, so it prints thin or not at all: a thicker skirt, or a smaller bead`}`,
    'snap.skirt', { values: { left, skirt: s, line } }));
  if (undercut < least - 1e-9) out.push(finding('warn', `an undercut of ${mm(undercut)} mm is under fixings.snap_least, ${mm(least)} mm: the print's own error is that size, so the lid may not catch, or catch only in places`, 'snap.least', { values: { undercut, least } }));
  out.push(finding('info', `${mm(n1(insertion))} N to push the lid on square and ${holds ? 'it holds for good (a square return face)' : `${mm(n1(removal))} N to pull it off square`}: a transverse force of ${mm(n1(P))} N (P = y d Es X, Bayer's annular snap joint, X ${mm(B.X)} for the wall and ${mm(L.X)} for the skirt) through the ${mm(lead)}° lead and ${mm(back)}° return faces at μ ${mm(mu)}. Pressed on at a tilt, a part of the bead at a time, it takes much less, as the guide says of a lid put on by hand`,
    'snap.forces', { values: { force: n1(P), insertion: n1(insertion), removal: Number.isFinite(removal) ? n1(removal) : null, friction: mu } }));
  if (B.remote > 1 || L.remote > 1) out.push(finding('info', `the joint lies in from a free end (box ${mm(boxEnd)} mm of ${mm(B.far)}, lid ${mm(lidEnd)} mm of ${mm(L.far)}, where 1.8 √(d t) counts as remote), so it is stiffer by ${mm(B.remote)} and ${mm(L.remote)} times: the guide gives 3 at a remote joint, and the line between is an estimate`, 'snap.remote', { values: { box: B.remote, lid: L.remote } }));
  if (push != null) { const ok = insertion <= push; out.push(finding(ok ? 'pass' : 'warn', `pushed with ${mm(push)} N, the lid goes on ${ok ? `square, ${mm(n1(insertion))} N` : `only at a tilt: square it takes ${mm(n1(insertion))} N. A shallower lead or a smaller bead lowers it`}`, 'snap.push', { values: { push, insertion: n1(insertion) } })); }
  const margin = pull != null ? (holds ? Infinity : n2(removal / pull)) : null;
  if (pull != null) out.push(finding(margin >= want ? 'pass' : margin >= 1 ? 'warn' : 'fail', `pulled with ${mm(pull)} N, the lid stays on ${holds ? 'for good' : `${mm(margin)} times over (${mm(n1(removal))} N)`}${margin >= want ? '' : margin >= 1 ? `, under the ${mm(want)} times fixings.load_margin asks` : ': it comes off'}${margin >= want ? '' : `. The strain allows up to ${mm(most.undercut)} mm of undercut, which would hold ${mm(most.removal)} N`}`,
    'snap.hold', { values: { pull, removal: Number.isFinite(removal) ? n1(removal) : null, margin: Number.isFinite(margin) ? margin : null, want } }));
  else out.push(finding('info', `give pull, the force the lid must stay on against, to have its hold checked`, 'snap.hold'));
  // Printing: the box stands on its floor, so the bead's return face is an overhang; the lid is printed on its top, so
  // the groove's face nearest the mouth, the return face's mate, is a ceiling at the same angle. The lead face and the
  // skirt's lead-in lean the other way and always print
  const prints = back <= overhang + 1e-9;
  out.push(finding(prints ? 'pass' : 'fail', prints ? `the box printed standing on its floor and the lid on its top print with no support: the bead's ${mm(back)}° return face and the groove's mating face are within ${pr.cite('overhang')} ${mm(overhang)}°, and the ${mm(lead)}° lead face leans the way that always prints`
    : `the ${mm(back)}° return face is past ${pr.cite('overhang')} ${mm(overhang)}°: under the box's bead and over the lid's groove it needs support. Give back ${mm(overhang)}° or less; a steeper face holds harder, so let the bead be taller instead`, 'snap.printable', { values: { back, overhang } }));
  const groove = { inner: r3(dh / 2), outer: r3(dh / 2 + bead), depth: bead };
  return { kind: 'annular snap', diameter: d, wall: t, skirt: s, clearance: c, bead, length, undercut, interference: r3(Y), lead, back, land, sized, uses, material: box.name, lidMaterial: lidMat.name, friction: mu,
    permissible: n4(permissible), box: B, lid: L, force: n1(P), insertion: Number.isFinite(insertion) ? n1(insertion) : Infinity, removal: Number.isFinite(removal) ? n1(removal) : Infinity, holds, pull, margin, most, groove, rests, findings: out };
}

// The bead's outline in [radius, z] from its foot on the wall at z: up the return face, along the land, down the lead
// face, sunk into the wall by a little so it joins it
const beadOutline = (m, z, grow = 0) => {
  const R = m.diameter / 2 + grow, h = m.bead, rise = h / tan(m.back), fall = h / tan(m.lead), sink = Math.min(m.wall / 2, 0.3);
  const z0 = z - grow, top = z0 + rise + m.land + 2 * grow + fall;
  return [[R - sink - grow, z0], [R, z0], [R + h, z0 + rise], [R + h, z0 + rise + m.land + 2 * grow], [R, top], [R - sink - grow, top]];
};
/**
 * The bead to add to the box: a ring round the wall's outside, its foot (the bottom of the return face) at z = at.
 * Union it with a box whose wall's outside is the model's diameter about the z axis.
 * @param {object | AnnularSnap} p the joint's figures, as annularSnapModel takes them, or its model
 * @param {object} [o] as annularSnapModel, and at: the bead's foot, mm up z (default 0); segments: faces round (default 96)
 * @returns {object} a JSCAD geom3 with .model
 */
export function annularBead(p, o = {}) {
  const m = p?.kind === 'annular snap' ? p : annularSnapModel(p, o), at = o.at ?? 0, n = o.segments ?? 96;
  if (!isNum(at)) throw new Error(`annularBead: at is the bead's foot up z, in mm (got ${shown(o.at)})`);
  return Object.assign(lathe(beadOutline(m, at), n), { model: m });
}
/**
 * The groove to cut from the lid's skirt, in the same place as the bead it takes (at, as annularBead's): the bead's
 * outline grown by the clearance all round, so the seated bead touches nothing, and with mouth, the skirt's mouth's z,
 * a lead-in cone there at the lead angle, as wide as the bead, so the skirt's edge starts over it.
 * @param {object | AnnularSnap} p the joint's figures or its model
 * @param {object} [o] as annularSnapModel, and at: the bead's foot (default 0); mouth: the z of the skirt's open end,
 *   below at (default none: no lead-in); segments: faces round (default 96)
 * @returns {object} a JSCAD geom3 to subtract, with .model
 */
export function annularGroove(p, o = {}) {
  const what = 'annularGroove', m = p?.kind === 'annular snap' ? p : annularSnapModel(p, o), at = o.at ?? 0, n = o.segments ?? 96, c = m.clearance;
  if (!isNum(at)) throw new Error(`${what}: at is the bead's foot up z, in mm (got ${shown(o.at)})`);
  const ring = beadOutline(m, at, c);
  if (o.mouth == null) return Object.assign(lathe(ring, n), { model: m });
  if (!(isNum(o.mouth) && o.mouth < at - c - 1e-9)) throw new Error(`${what}: mouth is the z of the skirt's open end, below the groove's foot at ${mm(at - c)} mm (got ${shown(o.mouth)})`);
  // The lead-in: from the groove's full radius at the mouth up to the skirt's inside, joined to the groove by a band at
  // the skirt's inside so the two are one cutter
  const R = m.diameter / 2 + c, h = m.bead, rise = h / tan(m.lead), z = o.mouth - 0.1, sink = Math.min(m.wall / 2, 0.3) + c;
  const top = Math.min(o.mouth + rise, ring[1][1]);
  return Object.assign(lathe([[R - sink, z], [R + h, z], [R + h, o.mouth], [R + h - (top - o.mouth) * tan(m.lead), top], ...(top < ring[1][1] ? [[R, top], [R, ring[1][1]]] : []), ...ring.slice(1, -1), [R - sink, ring.at(-1)[1]]], n), { model: m });
}

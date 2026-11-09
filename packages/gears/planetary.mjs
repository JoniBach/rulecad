// Planetary gearboxes: a sun in the middle, planets round it on a carrier, and a ring round them all. Hold one of the
// three and the other two turn at a ratio set by the teeth alone (Willis: (ω_sun − ω_carrier) / (ω_ring − ω_carrier) =
// −R / S). planetary() finds the teeth for a wanted ratio that also put together: the ring is the sun and two planets
// across (R = S + 2P), the planets go in evenly spaced ((S + R) a whole number of times the planets), and they clear
// each other. It lays the gearbox out with every planet in phase with the sun and the ring.
import { gearModel, internalModel, mesh, phase } from './gears.mjs';

const DEG = Math.PI / 180;
const MEMBERS = ['sun', 'carrier', 'ring'];
const fmt = (x, d = 3) => String(+x.toFixed(d));

/**
 * Turns of the input for one of the output, with one member held: the planetary's ratio, by Willis's relation.
 * @param {{ sun: number, ring: number }} teeth @param {{ held: string, input: string, output: string }} how
 */
export function planetaryRatio({ sun: S, ring: R }, { held, input, output }) {
  // ω for each member with the held one at 0, from ω_s − ω_c = −(R/S)(ω_r − ω_c)
  const w = held === 'ring' ? { ring: 0, carrier: 1, sun: 1 + R / S } : held === 'carrier' ? { carrier: 0, ring: 1, sun: -R / S } : { sun: 0, carrier: 1, ring: (R + S) / R };
  return w[input] / w[output];
}

/**
 * Teeth for a planetary gearbox: the sets that put together, nearest the wanted ratio first (then the smallest).
 * @param {{ module: number, ratio: number, planets?: number, held?: 'sun' | 'carrier' | 'ring', input?: 'sun' | 'carrier' | 'ring',
 *   output?: 'sun' | 'carrier' | 'ring', size?: number, least?: number, most?: number, pressureAngle?: number, backlash?: number }} spec
 *   size: the most the ring's rim may be across (mm); least: the fewest teeth on the sun and planets (17 at 20°, so none is undercut)
 * @returns {{ best: object, others: object[], findings: object[] }}
 */
export function planetary(spec) {
  const what = 'planetary';
  if (!spec || typeof spec !== 'object') throw new Error(`${what}: give it { module, ratio, planets, held, input, output }`);
  const { module: m, ratio } = spec, n = spec.planets ?? 3, held = spec.held ?? 'ring', input = spec.input ?? 'sun';
  if (!(typeof m === 'number' && m > 0)) throw new Error(`${what}: module is a size above 0 (got ${JSON.stringify(m)})`);
  if (!(typeof ratio === 'number' && Number.isFinite(ratio) && ratio !== 0)) throw new Error(`${what}: ratio is turns of the input for one of the output, a number (got ${JSON.stringify(ratio)})`);
  if (!(Number.isInteger(n) && n >= 2 && n <= 8)) throw new Error(`${what}: planets is a whole number from 2 to 8 (got ${JSON.stringify(n)})`);
  for (const [k, v] of [['held', held], ['input', input]]) if (!MEMBERS.includes(v)) throw new Error(`${what}: ${k} is one of ${MEMBERS.join(', ')} (got ${JSON.stringify(v)})`);
  const output = spec.output ?? MEMBERS.find((x) => x !== held && x !== input);
  if (!MEMBERS.includes(output) || new Set([held, input, output]).size !== 3) throw new Error(`${what}: held, input and output are the sun, the carrier and the ring, one each (got ${held}, ${input}, ${output})`);
  const least = spec.least ?? 17, most = spec.most ?? 150, pa = spec.pressureAngle ?? 20;
  const common = { module: m, pressureAngle: pa, ...(spec.backlash != null ? { backlash: spec.backlash } : {}) };
  // Every set that puts together, scored by how near its ratio is
  const sets = [];
  for (let S = least; S <= most; S++) for (let P = least; P <= most; P++) {
    const R = S + 2 * P;
    if ((S + R) % n) continue; // the planets go in evenly spaced
    if (R - P < 12) continue; // a ring at least 12 teeth more than its planets, or their tips foul (KHK)
    const a = (m * (S + P)) / 2, tip = m * (P + 2);
    if (n > 1 && 2 * a * Math.sin(Math.PI / n) < tip + m) continue; // the planets' tips a module apart
    const rim = m * (R + 2.5) + 6 * m;
    if (spec.size != null && rim > spec.size) continue;
    const i = planetaryRatio({ sun: S, ring: R }, { held, input, output });
    sets.push({ sun: S, planet: P, ring: R, ratio: i, off: Math.abs(i - ratio) / Math.abs(ratio), rim });
  }
  if (!sets.length) throw new Error(`${what}: no teeth put together${spec.size != null ? ` within a rim of ${spec.size} mm` : ''} with ${n} planets of ${least} teeth or more: a larger size, fewer planets, or a smaller module`);
  sets.sort((x, y) => x.off - y.off || x.rim - y.rim);
  const best = layout(sets[0], { n, m, common, held, input, output });
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const off = sets[0].off;
  f(off < 0.005 ? 'pass' : off < 0.05 ? 'warn' : 'fail', `${fmt(best.ratio)} : 1 (${input} to ${output}, ${held} held), ${off < 0.005 ? 'as asked' : `${fmt(off * 100, 1)}% from the ${fmt(ratio)} asked: the nearest that puts together`}: sun ${best.sun.teeth}, planets ${best.planet.teeth} × ${n}, ring ${best.ring.teeth}`, 'planetary.ratio', { ratio: best.ratio, asked: ratio });
  for (const [pair, ms] of [['sun and planet', best.sunMesh], ['planet and ring', best.ringMesh]]) for (const x of ms.findings) out.push({ ...x, text: `${pair}: ${x.text}` });
  return { best, others: sets.slice(1, 6).map((x) => ({ sun: x.sun, planet: x.planet, ring: x.ring, ratio: x.ratio, rim: x.rim })), findings: out };
}

// The gearbox laid out: the sun at the centre, its first tooth on +x; each planet at its place round the carrier,
// turned so a tooth sits in a gap of the sun and of the ring; the ring turned to suit
function layout({ sun: S, planet: P, ring: R, ratio }, { n, m, common, held, input, output }) {
  const sun = gearModel({ ...common, teeth: S }), planet = gearModel({ ...common, teeth: P }), ring = internalModel({ ...common, teeth: R });
  const sunMesh = mesh(sun, planet), ringMesh = mesh(planet, ring), a = sunMesh.centre;
  const planets = Array.from({ length: n }, (_, k) => {
    const at = (360 * k) / n;
    return { at: [a * Math.cos(at * DEG), a * Math.sin(at * DEG)], angle: phase(sun, planet, at), place: at };
  });
  // the ring, from the first planet: the line from that planet to the ring's centre points back along 180°
  const ringAngle = (P / R) * planets[0].angle + phase(planet, ring, 180);
  return { sun: { teeth: S, model: sun }, planet: { teeth: P, model: planet }, ring: { teeth: R, model: ring, angle: ringAngle },
    planets, centre: a, ratio, held, input, output, rim: ring.rim, module: m, sunMesh, ringMesh };
}

/**
 * The turns of the sun for one of the output ring, in a compound planetary with one ring held: its planets stepped,
 * P1 teeth on the held ring and the sun, P2 on the ring that turns. The ring turns the sun's way when the result is positive.
 * @param {{ sun: number, planet: number, planet2: number, ring: number, ring2: number }} t
 */
export function compoundRatio({ sun: S, planet: P1, planet2: P2, ring: R1, ring2: R2 }) {
  return ((S + R1) / S) / (1 - (R1 * P2) / (P1 * R2));
}

/**
 * The share of the power a compound planetary passes on (printed teeth): the sun's mesh, and the rings', where the
 * carrier-relative power is the output's times rho / |1 - rho|, rho being the rings' ratio through the planets: all of
 * it rubbing, for a small movement out, which is why a high ratio is so much less efficient than its gears look.
 * @param {{ sun: number, planet: number, planet2: number, ring: number, ring2: number }} t
 * @param {number} [each] the share per mesh (default 0.95, an estimate)
 */
export function compoundEfficiency({ planet: P1, planet2: P2, ring: R1, ring2: R2 }, each = 0.95) {
  const rho = (R1 * P2) / (P1 * R2), lost = 1 - each ** 2;
  return each / (1 + (lost * rho) / Math.abs(1 - rho));
}

/**
 * Teeth for a compound (split-ring) planetary: the held ring and the sun mesh the planets' P1 teeth, the output ring
 * their P2. Two rings a few teeth apart give ratios of 30 to 200 in one stage, input and output on one axis, which is
 * what printed robot joints use. Stepped planets (P2 = P1 + the rings' difference) keep one centre distance with no
 * profile shift: a single planet on two rings can't, at sizes that print, without a shift far past what a tooth takes.
 * Every tooth count is a multiple of the planets, so identical planets go in evenly and in phase on both rings.
 * @param {{ module: number, ratio: number, planets?: number, size?: number, least?: number, most?: number, step?: number, pressureAngle?: number, backlash?: number }} spec
 *   ratio: turns of the sun for one of the output ring, in size (a negative one turns the other way); step: the rings' difference, in planets (default tries 1 and 2)
 * @returns {{ best: object, others: object[], findings: object[] }}
 */
export function compoundPlanetary(spec) {
  const what = 'compoundPlanetary';
  if (!spec || typeof spec !== 'object') throw new Error(`${what}: give it { module, ratio, planets, size }`);
  const { module: m, ratio } = spec, n = spec.planets ?? 3;
  if (!(typeof m === 'number' && m > 0)) throw new Error(`${what}: module is a size above 0 (got ${JSON.stringify(m)})`);
  if (!(typeof ratio === 'number' && Number.isFinite(ratio) && Math.abs(ratio) > 1)) throw new Error(`${what}: ratio is turns of the sun for one of the output, more than 1 either way (got ${JSON.stringify(ratio)})`);
  if (!(Number.isInteger(n) && n >= 2 && n <= 6)) throw new Error(`${what}: planets is a whole number from 2 to 6 (got ${JSON.stringify(n)})`);
  const least = spec.least ?? 17, most = spec.most ?? 90, pa = spec.pressureAngle ?? 20, steps = spec.step != null ? [spec.step] : [1, -1, 2, -2];
  const common = { module: m, pressureAngle: pa, ...(spec.backlash != null ? { backlash: spec.backlash } : {}) };
  const multiple = (x, k) => Math.ceil(x / k) * k, sets = [];
  for (let S = multiple(least, n); S <= most; S += n) for (let P1 = multiple(least, n); P1 <= most; P1 += n) {
    const R1 = S + 2 * P1;
    if (R1 - P1 < 12) continue;
    if (2 * ((m * (S + P1)) / 2) * Math.sin(Math.PI / n) < m * (P1 + 2) + m) continue; // the planets' tips a module apart
    for (const k of steps) {
      const j = k * n, P2 = P1 + j, R2 = R1 + j;
      if (P2 < least) continue;
      const set = { sun: S, planet: P1, planet2: P2, ring: R1, ring2: R2 }, i = compoundRatio(set), rim = m * (Math.max(R1, R2) + 2.5) + 6 * m;
      if (spec.size != null && rim > spec.size) continue;
      sets.push({ ...set, ratio: i, efficiency: compoundEfficiency(set), off: Math.abs(i - ratio) / Math.abs(ratio), rim });
    }
  }
  if (!sets.length) throw new Error(`${what}: no teeth put together${spec.size != null ? ` within a rim of ${spec.size} mm` : ''} with ${n} planets of ${least} teeth or more: a larger size, or a smaller module`);
  sets.sort((x, y) => x.off - y.off || x.rim - y.rim);
  const b = sets[0], sun = gearModel({ ...common, teeth: b.sun }), planet = gearModel({ ...common, teeth: b.planet }), planet2 = gearModel({ ...common, teeth: b.planet2 }), ring = internalModel({ ...common, teeth: b.ring }), ring2 = internalModel({ ...common, teeth: b.ring2 });
  const sunMesh = mesh(sun, planet), ringMesh = mesh(planet, ring), ring2Mesh = mesh(planet2, ring2), a = sunMesh.centre, out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const planets = Array.from({ length: n }, (_, k) => { const at = (360 * k) / n; return { at: [a * Math.cos(at * DEG), a * Math.sin(at * DEG)], angle: phase(sun, planet, at), place: at }; });
  const ringAngle = (b.planet / b.ring) * planets[0].angle + phase(planet, ring, 180), ring2Angle = (b.planet2 / b.ring2) * planets[0].angle + phase(planet2, ring2, 180);
  f(b.off < 0.05 ? 'pass' : b.off < 0.2 ? 'warn' : 'fail', `${fmt(b.ratio, 2)} : 1 (sun to the output ring, the other ring held), ${b.off < 0.01 ? 'as asked' : `${fmt(b.off * 100, 1)}% from the ${fmt(ratio)} asked`}: sun ${b.sun}, stepped planets ${b.planet}/${b.planet2} × ${n}, rings ${b.ring} and ${b.ring2}`, 'compound.ratio', { ratio: b.ratio, asked: ratio });
  f('info', `about ${fmt(b.efficiency * 100, 0)}% efficient (an estimate): ${b.efficiency <= 0.5 ? 'under 50%, so it can\'t be driven backwards' : 'it can be driven backwards'}`, 'compound.efficiency', { efficiency: b.efficiency });
  if (Math.abs(ring2Mesh.centre - a) > 1e-9) f('fail', `the output ring's centre distance is ${fmt(ring2Mesh.centre)} mm and the planets' ${fmt(a)} mm: the rings' difference must equal the planets'`, 'compound.centre');
  for (const [pair, ms] of [['sun and planet', sunMesh], ['planet and held ring', ringMesh], ['planet and output ring', ring2Mesh]]) for (const x of ms.findings) out.push({ ...x, text: `${pair}: ${x.text}` });
  return { best: { sun: { teeth: b.sun, model: sun }, planet: { teeth: b.planet, model: planet }, planet2: { teeth: b.planet2, model: planet2 }, ring: { teeth: b.ring, model: ring, angle: ringAngle }, ring2: { teeth: b.ring2, model: ring2, angle: ring2Angle }, planets, centre: a, ratio: b.ratio, efficiency: b.efficiency, rim: Math.max(ring.rim, ring2.rim), module: m }, others: sets.slice(1, 6).map(({ off, ...x }) => x), findings: out };
}

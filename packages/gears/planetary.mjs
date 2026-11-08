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

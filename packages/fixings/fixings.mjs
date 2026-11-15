// @rulecad/fixings: screws, nuts, washers and inserts from rule sets, and the holes and seats they need in a printed
// part. A fixing is a model made from its thread's rule set (fixingModel), and everything else reads that model: a
// hole sized by what it is for (hole), a seat for a head, a nut or an insert (counterbore, countersink, nutPocket,
// nutTrap, squareNutSlot, captiveNut, insertBoss), and light solids of the hardware for an assembly (screw, nut,
// washer, insert). Where it applies each comes as a pair: one function gives the numbers with findings (holeModel),
// its twin the solid (hole). Every thread's figures live in @rulecad/rules as open data: this package holds no
// screw's numbers of its own. Units: mm, degrees, grams. The plan is https://github.com/JoniBach/rulecad/issues/212.
import { fixingModel } from './model.mjs';
import { holeModel, hole } from './holes.mjs';
import { counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket, nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable } from './seats.mjs';
import { screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert } from './hardware.mjs';

export { fixingModel, parseName, threads, GRAMMAR, HEADS, NUTS, DEFAULTS } from './model.mjs';
export { holeModel, hole, HOLE_KINDS } from './holes.mjs';
export { counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket, nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable } from './seats.mjs';
export { screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert } from './hardware.mjs';

/**
 * What this release is. `release` is `'placeholder'` until the package has functions to call (0.1.0), then `'ready'`:
 * code that wants fixings can test it instead of failing on a missing export.
 * @type {Readonly<{ release: 'placeholder' | 'ready', plan: string }>}
 */
export const status = Object.freeze({ release: 'ready', plan: 'https://github.com/JoniBach/rulecad/issues/212' });

const MODELS = { holeModel, counterboreModel, countersinkModel, nutPocketModel, nutTrapModel, squareNutSlotModel, captiveNutModel, insertBossModel, screwModel, nutModel, washerModel, insertModel };
const SOLIDS = { hole, counterbore, countersink, nutPocket, nutTrap, squareNutSlot, captiveNut, insertBoss, nut, washer, insert }, JOINED = { screw };

/**
 * Every function of this package with a workspace's rule sets and printer already in hand, so a design writes
 * `fixings.hole('M3', { kind: 'pilot' })` and gets its own project's figures. This is the hook a host such as
 * @rulecad/cad calls once per design: the package itself reads no files.
 * @param {{ sets?: object, printer?: object, ops?: { union: Function, subtract: Function } }} [workspace]
 *   sets: the workspace's rule sets, by name ({ m3: { name, rules } }) or as a list: one for a thread is used before the
 *   kit's; printer: the printer's rule set ({ name, rules }, so each figure keeps its kind and source) or its values;
 *   ops: the design's booleans (v.ops)
 * @returns {Record<string, Function>} fixingModel(name, change, opts) and the rest, each taking (fixing, options)
 */
export function fixingsFor({ sets, printer, ops } = {}) {
  const with_ = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? { ...(sets ? { sets } : {}), ...(printer ? { printer } : {}), ...o } : o);
  const out = { fixingModel: (name, change, opts) => fixingModel(name, change, { ...(sets ? { sets } : {}), ...opts }), printable, status };
  for (const [k, f] of Object.entries({ ...MODELS, ...SOLIDS })) out[k] = (m, o = {}) => f(m, with_(o));
  for (const [k, f] of Object.entries(JOINED)) out[k] = (m, o = {}) => (ops ? f(m, with_(o), ops) : f(m, with_(o)));
  return out;
}

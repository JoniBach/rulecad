// @rulecad/fixings: screws, nuts, washers and inserts from rule sets, and the holes and seats they need in a printed
// part. A fixing is a model made from its thread's rule set (fixingModel), and everything else reads that model: a
// hole sized by what it is for (hole), a seat for a head, a nut or an insert (counterbore, countersink, nutPocket,
// nutTrap, squareNutSlot, captiveNut, insertBoss), and light solids of the hardware for an assembly (screw, nut,
// washer, insert), a real thread to print where one is wanted (thread), and first sums for a joint: thread engaged,
// the load that strips it, clamp force from torque, pressure under a head, and the sold length that fits a stack
// (engagement, stripping, preload, seating, lengthFor), and pins that hold two parts with no thread: a printed snap pin, a
// steel dowel, a length of filament or a printed peg, each with its hole's fit from the printer's rules (pinModel, pinHole,
// pin), and magnets pressed, glued or held by crush ribs in a pocket from the printer's rules, with their pull (magnetModel,
// magnetSeatModel, magnetSeat, magnet), printed bolts with their own strength (printedBoltModel, printedBolt), and annular snaps, a
// lid that clicks on to a round box, with the forces and hoop strain from the Bayer snap-fit guide (annularSnapModel, annularBead, annularGroove). Where it applies each comes as a pair: one function gives the
// numbers with findings (holeModel), its twin the solid (hole). Every thread's figures live in @rulecad/rules as open data: this package holds no
// screw's numbers of its own. Units: mm, degrees, grams. The plan is https://github.com/JoniBach/rulecad/issues/212.
import { fixingModel } from './model.mjs';
import { holeModel, hole } from './holes.mjs';
import { counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket, nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable } from './seats.mjs';
import { screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert } from './hardware.mjs';
import { threadModel, thread } from './threads.mjs';
import { engagement, stripping, preload, torqueFor, seating, lengthFor, screwGroup, screwLoad } from './strength.mjs';
import { pinModel, pinHole, pin, snapPin, snapSocket, snapPinModel, parsePin, isPinName } from './pins.mjs';
import { printedBoltModel, printedBolt } from './bolts.mjs';
import { magnetModel, magnetSeatModel, magnetSeat, magnet, parseMagnet, isMagnetName, fieldShare } from './magnets.mjs';
import { annularSnapModel, annularBead, annularGroove } from './snaps.mjs';

export { fixingModel, parseName, threads, GRAMMAR, HEADS, NUTS, DEFAULTS } from './model.mjs';
export { holeModel, hole, HOLE_KINDS } from './holes.mjs';
export { counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket, nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable } from './seats.mjs';
export { screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert } from './hardware.mjs';
export { threadModel, thread, THREAD_FORMS } from './threads.mjs';
export { engagement, stripping, preload, torqueFor, seating, lengthFor, screwGroup, screwLoad, MATERIALS, MATERIAL_CLASSES, ENDS } from './strength.mjs';
export { pinModel, pinHole, pin, snapPin, snapSocket, snapPinModel, parsePin, isPinName, PIN_KINDS, PIN_FITS, PIN_GRAMMAR } from './pins.mjs';
export { printedBoltModel, printedBolt, BOLT_NUTS } from './bolts.mjs';
export { magnetModel, magnetSeatModel, magnetSeat, magnet, parseMagnet, isMagnetName, fieldShare, MAGNET_GRADES, MAGNET_FITS, MAGNET_SIZES, MAGNET_GRAMMAR } from './magnets.mjs';
export { annularSnapModel, annularBead, annularGroove, hubFactor, shaftFactor, SNAP_USES } from './snaps.mjs';

/**
 * What this release is. `release` is `'placeholder'` until the package has functions to call (0.1.0), then `'ready'`:
 * code that wants fixings can test it instead of failing on a missing export.
 * @type {Readonly<{ release: 'placeholder' | 'ready', plan: string }>}
 */
export const status = Object.freeze({ release: 'ready', plan: 'https://github.com/JoniBach/rulecad/issues/212' });

const MODELS = { engagement, stripping, preload, torqueFor, seating, screwLoad, threadModel, holeModel, counterboreModel, countersinkModel, nutPocketModel, nutTrapModel, squareNutSlotModel, captiveNutModel, insertBossModel, screwModel, nutModel, washerModel, insertModel, pinModel, magnetModel, magnetSeatModel, printedBoltModel, annularSnapModel };
const SOLIDS = { thread, hole, counterbore, countersink, nutPocket, nutTrap, squareNutSlot, captiveNut, insertBoss, nut, washer, insert, pinHole, magnetSeat, magnet, annularBead, annularGroove }, JOINED = { screw, pin, printedBolt };

/**
 * Every function of this package with a workspace's rule sets and printer already in hand, so a design writes
 * `fixings.hole('M3', { kind: 'pilot' })` and gets its own project's figures. This is the hook a host such as
 * @rulecad/cad calls once per design: the package itself reads no files.
 * @param {{ sets?: object, printer?: object, ops?: { union: Function, subtract: Function }, display?: 'thread' | 'plain' }} [workspace]
 *   sets: the workspace's rule sets, by name ({ m3: { name, rules } }) or as a list: one for a thread is used before the
 *   kit's; printer: the printer's rule set ({ name, rules }, so each figure keeps its kind and source) or its values;
 *   ops: the design's booleans (v.ops); display: how a printed thread is drawn where a call does not say (thread and a
 *   hole of kind 'thread'): 'plain' for a viewer or a link, where a real thread's thousands of triangles are not wanted
 * @returns {Record<string, Function>} fixingModel(name, change, opts) and the rest, each taking (fixing, options); lengthFor takes (stack, fixing, options)
 */
export function fixingsFor({ sets, printer, ops, display } = {}) {
  const with_ = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? { ...(sets ? { sets } : {}), ...(printer ? { printer } : {}), ...o } : o);
  const out = { fixingModel: (name, change, opts) => fixingModel(name, change, { ...(sets ? { sets } : {}), ...opts }), printable, status };
  const drawn = ['threadModel', 'thread', 'holeModel', 'hole'], as = (k, o) => (display && drawn.includes(k) && o && typeof o === 'object' && !Array.isArray(o) ? { display, ...o } : o);
  for (const [k, f] of Object.entries({ ...MODELS, ...SOLIDS })) out[k] = (m, o = {}) => f(m, with_(as(k, o)));
  out.lengthFor = (stack, m, o = {}) => lengthFor(stack, m, with_(o));
  out.screwGroup = screwGroup;
  // (a snap pin from plain figures, as @rulecad/flexures draws it, built with the design's booleans)
  Object.assign(out, { snapPin: (p, o) => snapPin(p, o ?? ops ?? undefined), snapSocket, snapPinModel, parsePin, isPinName, parseMagnet, isMagnetName, fieldShare });
  for (const [k, f] of Object.entries(JOINED)) out[k] = (m, o = {}) => (ops ? f(m, with_(o), ops) : f(m, with_(o)));
  return out;
}

// Gears for printed parts: involute spur gears, racks and internal (ring) gears drawn from their rules, each with its
// numbers (pitch, base, tip and root diameters, tooth thickness), how a pair meshes (centre distance, ratio, contact
// ratio, the phase that puts a tooth in a gap) and how it prints. The involute relations are the standard ones (ISO 53
// and ISO 21771; Dudley, Handbook of Practical Gear Design, 1984; KHK, Gear Technical Reference); the printing rules
// are the kit's own, from the printer's line and layer.
//
// Every gear is drawn flat: its axis along z, its first tooth on +x, its face on the bed at z = 0. A spur gear printed
// this way has its teeth in the layers, where the filament is strongest, and needs no supports. Units: mm, degrees.
//
// The package's main module: it only gathers the others. The code shared by all of them is in core.mjs.
export * from './core.mjs';
// Planetary gearboxes, plain and compound
export { planetary, planetaryRatio, compoundPlanetary, compoundRatio, compoundEfficiency } from './planetary.mjs';
// The mesh measured from the drawn teeth: backlash, transmission error, interference
export { contact } from './contact.mjs';
// A tooth's root stress by finite elements
export { toothStress } from './tooth.mjs';
// Worms and their wheels
export { wormModel, worm, wormWheel, wormMesh } from './worm.mjs';

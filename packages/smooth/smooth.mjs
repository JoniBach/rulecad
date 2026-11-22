// Routed tracks, tidied: where an autorouter's track wiggles, doubles back or detours, the bends between two of its points
// are dropped and the two joined straight, wherever that straight run keeps its clearance from all other copper, holes
// and the board's edge. A bend sharper than a right angle is cut across. A track's ends and vias stay exactly where they
// were, so it still starts and finishes on the same pads, and changes layer in the same places. Tracks not passed in are
// never moved; they are only kept clear of.
//
// smoothCircuit(json, { movable, clearance }) works on Circuit JSON (tscircuit's board format) as a whole; smooth()
// is the geometry underneath, for any board description.
//
// The package's main module: it only gathers the others. The code shared by both is in core.mjs.
export * from './core.mjs';
export { finishCircuit, unfinished } from './finish.mjs'; // (finish.mjs: square exits, acute corners filled)

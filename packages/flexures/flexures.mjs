// Compliant mechanisms for printed parts: flexures that move by bending. Each is a JSCAD shape and a model: its
// stiffness, the strain its material sees at a travel (so a rule can say whether it lasts), and the travel a strain
// allows. The models are beam theory and the pseudo-rigid-body model (Howell, Compliant Mechanisms, 2001; Smith,
// Flexures, 2000; Paros and Weisbord 1965 for the notch hinge), good while deflections are a few times the thickness.
//
// Every flexure is drawn flat: its length along x, it bends along y, and its width is its height off the bed (z). A
// flexure printed this way bends within its layers, where the filament's own strength is; one bending across the
// layers pulls them apart. Units: mm, N, MPa.
//
// The package's main module: it only gathers the others. The flexures themselves are in core.mjs.
export * from './core.mjs';
export { ports, size, report, models } from './compose.mjs';
export { lamina, flexureMaterial } from './lamina.mjs';
export { laminaCache } from './cache.mjs';
export { beamSystem, equilibrium, energyOf, shapeOf, fixedLoads } from './beams.mjs';
export { place, combine } from './modules.mjs';
export { curve, curvePath, curveLines, curveModel, curveSolver, curveClearance } from './curves.mjs';
export { shapeCurve, meander } from './synth.mjs';
export { gripperJaws, gripperJawsModel } from './gripper.mjs';
export { letArray, letArrayModel, foldSheet, foldSheetModel, foldCheck } from './folding.mjs';
export { miura, miuraModel } from './origami.mjs';

// @rulecad/frames: structures from beams, of any profile. This release reads a profile (a beam's constant section, as
// a model from its rule set, its outline, and what that outline is worth beside the maker's sheet) and makes beams of
// it: a length with its mass, its anchors and its solid. Beams in assemblies, joins, fittings and guides follow: the
// plan is https://github.com/JoniBach/rulecad/issues/240.
//
// Every profile, slot family and slot nut is a rule set in @rulecad/rules, so the numbers are open data and live
// there. A section is drawn in x (across, its width) and y (up, its height), with the middle of its envelope at the
// origin; a beam runs along z from end a at z = 0. Its faces are top (+y), bottom (-y), front (-x) and back (+x).
// Units: mm, grams, degrees.
export * from './profile.mjs';
export { beamModel, beam, beamAnchor, printable } from './beam.mjs';

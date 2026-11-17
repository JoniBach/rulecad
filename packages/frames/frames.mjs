// @rulecad/frames: structures from beams, of any profile. This release reads a profile (a beam's constant section, as
// a model from its rule set, its outline, and what that outline is worth beside the maker's sheet) and makes beams of
// it: a length with its mass, its anchors, the operations on it (cut, mitre, tap, holes, pockets, notches) and its solid;
// and a frame's cut list (the bars to buy and the cuts on each) and a cut-and-drill sheet for each kind of beam; and joins
// between beams by kind (the operations on both, the screws, a stiffness for the solver); and printed fittings for those
// joins (a corner bracket, gusset and splice plates), sized from a named load by finite elements; panels cut to a bay
// and the printed parts that hold them, a door's hinges, handle, latch and catch, and the parts for a beam's end (caps,
// feet, levelling feet, castor plates, stacking feet); and the parts that carry a machine's services (cable clips and
// tie anchors, mounts for boards, supplies, fans and drag chains read from their rule sets, a DIN rail adapter and a
// spool holder); and bought fittings as rule sets (a cast corner bracket, joining plates, inner and anchor
// connectors, hinges, end caps, levelling feet), which a join or a mount chooses by name in place of a printed one,
// with their price and their stiffness, an estimate until the joint rig measures it; and guides: a miniature rail on a
// slotted face (its holes at its pitch, its screws into slot nuts, each carriage's travel, its carriages' loads against
// their ratings, its terms in an error budget) and a printed jig that centres it; a carriage on V-wheels in a V-slot's
// tracks (a printed plate, the wheels' seats from the track, their eccentrics' preload, each wheel's load against its
// rating) and a printed slider in or over a slot; and two smooth rods in printed holders with a printed carriage on
// linear bearings, driven by a lead screw from a printed motor plate for the catalogue's motors, with an endstop's
// printed mount and a flag on the carriage; and jigs for hand tools from a beam's operations (a drill guide, a tap
// guide, a cut-length stop and a squaring corner); and a bay squared by its diagonals (their length and the difference
// to accept, from the cut tolerance). Belts follow: the plan is https://github.com/JoniBach/rulecad/issues/240.
//
// Every profile, slot family, slot nut, bought fitting and rail is a rule set in @rulecad/rules, so the numbers are open data and live
// there. A section is drawn in x (across, its width) and y (up, its height), with the middle of its envelope at the
// origin; a beam runs along z from end a at z = 0. Its faces are top (+y), bottom (-y), front (-x) and back (+x).
// Units: mm, grams, degrees.
export * from './profile.mjs';
export { beamModel, beam, beamAnchor, printable } from './beam.mjs';
export { OPS, OP_DEFAULTS } from './ops.mjs';
export { JOINS, JOIN_STIFFNESS, JOIN_PLAY, JOIN_SCALE, JOIN_TAP, JOIN_SET, joinRuleSet, joinStiffness, joinModel, boughtStiffness } from './join.mjs';
export { BOUGHT_KINDS, boughtFittings, boughtFittingModel, boughtFitting, printedCost } from './bought.mjs';
export { CUT_DEFAULTS, beamMarks, packBars, cutList, cutListText } from './cutlist.mjs';
export { beamSheet } from './cutsheet.mjs';
export { slotNutModel, nutFit, slotNut, nutFor, carrierModel, carrier, CARRIER_DEFAULTS, NUT_KINDS } from './slotnut.mjs';
export { FITTINGS, FITTING_DEFAULTS, bracketModel, bracket, plateModel, plate, fittingFE } from './fitting.mjs';
export { SHEETS, PANEL_DEFAULTS, panelModel, panel, panelClipModel, panelClip, panelCornerModel, panelCorner, slotCoverModel, slotCover, panelEdgeModel, panelEdge, gasketStripModel, gasketStrip } from './panel.mjs';
export { DOOR_DEFAULTS, hingeModel, hinge, handleModel, handle, latchModel, latch, magnetCatchModel, magnetCatch } from './door.mjs';
export { SERVICE_DEFAULTS, FANS, DIN_RAIL, deviceMountModel, deviceMount, fanMountModel, fanMount, dragChainEndModel, dragChainEnd, dinRailAdapterModel, dinRailAdapter, cableClipModel, cableClip, runClips, tieAnchorModel, tieAnchor, spoolHolderModel, spoolHolder } from './services.mjs';
export { GUIDE_KINDS, GUIDE_DEFAULTS, rails, railModel, rail, carriage, carriageMargin, guideFit, railTerms, railJigModel, railJig } from './guide.mjs';
export { WHEEL_DEFAULTS, wheels, trackFit, wheelsModel, wheelPlate, vWheel, wheelMargin, sliderModel, slider } from './wheels.mjs';
export { ROD_DEFAULTS, rodsLayout, rodHolderModel, rodHolder, motorPlateModel, motorPlate, rodCarriageModel, rodCarriage, endstopMountModel, endstopMount, rodMargin } from './rods.mjs';
export { END_DEFAULTS, endCapModel, endCap, footModel, foot, levellingFootModel, levellingFoot, castorPlateModel, castorPlate, stackingFootModel, stackingFoot } from './ends.mjs';
export { JIG_KINDS, JIG_DEFAULTS, drillGuideModel, drillGuide, tapGuideModel, tapGuide, lengthStopModel, lengthStop, squareCornerModel, squareCorner } from './jig.mjs';
export { squareness } from './square.mjs';
export { PRINTED_DEFAULTS, PRINTED_SERIES, PRINTED_CHECKED, printedProfile, printedSection, printerFigures } from './printing.mjs';
export { printedBeam, spliceModel, splice } from './printed.mjs';

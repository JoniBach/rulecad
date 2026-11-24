// A bicycle frame from a layout optimiser: which tubes, where, and how thick. Seen from the side (a flat layout),
// with the rider seated, pedalling hard standing up, and braking hard. Run it:  node examples/bicycle-frame/bicycle.mjs
// The README beside this file says where every figure comes from; most are estimates.
import { layout, layoutFrame, layoutJoints } from '@rulecad/fea/layout';
import { sizing, frame } from '@rulecad/fea/frame';
import { profileModel, profileChoices } from '@rulecad/frames';
import { pathToFileURL } from 'node:url';

// The frame's fixed points, mm, rear axle at the origin, x forward and y up (a road frame's proportions: estimates)
export const points = {
  rear: [0, 0],        // rear axle (the dropouts)
  front: [990, 0],     // front axle: 990 mm wheelbase
  bb: [405, -70],      // bottom bracket: 411 mm chainstays, 70 mm drop below the axles
  seat: [252, 448],    // seat cluster: a 540 mm seat tube at 73.5 degrees
  head: [833, 338],    // the head tube's bottom: a 72 degree head angle, 370 mm fork with 45 mm offset
  bars: [787, 481],    // the head tube's top: 150 mm long, where the stem and bars bear
};
const rider = 80 * 9.81; // N: an 80 kg rider (estimate)
const pedal = 1000;      // N: one pedal pushed down standing up (estimate)
const chain = (pedal * 170) / 101; // N: chain pull, 170 mm cranks on a 50-tooth ring (pitch radius 101 mm)
const brake = 0.6;       // deceleration braking hard, in g (estimate)

/** The layout problem: candidate nodes every 75 mm over the frame's side, kept off the front tyre (the rear wheel's
 * disc only keeps nodes out: the stays straddle it), held at the rear axle (up and down) and the head tube (which
 * the fork bears on). A joint costs as much as 600 mm of tube, so the layout keeps to a few long tubes. */
export const problem = {
  nodes: { rear: points.rear, bb: points.bb, seat: points.seat, head: points.head, bars: points.bars },
  grid: { from: [250, -100], to: [850, 500], pitch: 75 },
  avoid: [{ at: points.front, r: 350 }, { at: points.rear, r: 350, through: true }],
  supports: { rear: { y: true }, head: { x: true, y: true } },
  cases: [
    { label: 'seated', loads: [{ node: 'seat', force: [0, -0.7 * rider] }, { node: 'bars', force: [0, -0.3 * rider] }] },
    { label: 'pedalling', loads: [{ node: 'bb', force: [-chain, -pedal] }, { node: 'rear', force: [chain, 0] }, { node: 'bars', force: [0, pedal - rider] }] },
    { label: 'braking', loads: [{ node: 'seat', force: [0.7 * brake * rider, -0.7 * rider] }, { node: 'bars', force: [0.3 * brake * rider, -0.3 * rider] }] },
  ],
  strength: 275 / 2, // MPa: S275 steel's yield over a margin of 2
  density: 7.85,
  joint: 600,
};

// Round steel tubes in the inch sizes bicycle tubing is sold in, two walls each (sizes an estimate: check a supplier's list)
export const tubes = [12.7, 15.9, 19.05, 22.2, 25.4, 28.6, 31.8, 34.9].flatMap((d) => [0.9, 1.2].map((w) =>
  ({ ...profileChoices(profileModel('round-tube', { width: d, height: d, wall: w, material: 's275' }))[0], name: `${d} x ${w}` })));

export function bicycle() {
  const found = layout(problem);
  const f = layoutFrame(found, { material: { E: 210000, nu: 0.3, density: 7.85, strength: 275 } });
  const cases = f.cases.map((c) => ({ label: c.label, loads: c.loads }));
  // each tube its own size: stress (margin 2), buckling (each squeezed tube twice its force under Euler's load), and
  // the bottom bracket and the bars moving no more than 0.5 mm and 1 mm under any case (estimates of a stiff frame)
  const sized = sizing(f.model, { groups: Object.fromEntries(f.members.map((id) => [id, [id]])), choices: tubes, cases,
    limits: { stress: { margin: 2 }, buckling: { factor: 2, euler: 1 }, deflection: [{ node: 'bb', limit: 0.5 }, { node: 'bars', limit: 1 }] } });
  // the sized frame's own forces in each case (welded joints), handed to the joints
  const solved = frame(sized.model), forces = {};
  cases.forEach((c, k) => solved.statics({ loads: c.loads }).elements.forEach((e) => { (forces[e.id] ??= [])[k] = e.axial; }));
  const outside = Object.fromEntries(sized.groups.map((g) => [g.name, Number(g.choice.split(' x ')[0])]));
  const joints = layoutJoints(found, { material: 's275', diameters: outside, forces, nodes: ['bb', 'seat', 'head'] });
  return { layout: found, sizing: sized, joints };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { layout: l, sizing: s, joints } = bicycle();
  console.log(`Layout: ${l.members.length} tubes, ${(l.mass * 1000).toFixed(0)} g fully stressed (${l.candidates} candidates, ${l.rounds} rounds)`);
  for (const g of s.groups) console.log(`  ${g.name.padEnd(12)} ${g.choice.padEnd(11)} ${(g.mass * 1000).toFixed(0).padStart(4)} g  ${g.governs ? `set by ${g.governs.limit} at ${g.governs.where}` : 'lightest tube'}, margin ${g.margin?.toFixed(2)}`);
  console.log(`Sized: ${(s.total * 1000).toFixed(0)} g of tube, limits ${s.ok ? 'met' : 'NOT met'}; worst ${s.worst.limit} at ${s.worst.where}, ${(100 * s.worst.ratio).toFixed(0)}% of its limit`);
  for (const j of joints) console.log(`Joint ${j.node}: ${j.members.length} tubes, ${j.problem.loads.length} loads`);
}

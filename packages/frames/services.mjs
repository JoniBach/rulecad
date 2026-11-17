// Printed fittings that carry a machine's services on its frame: a cable clip that snaps into a slot, a cable tie
// anchor, a mount for a board or a supply that reads the device's mounting holes from its rule set, a fan mount by the
// fan's size, a drag chain's end, a DIN rail adapter and a spool holder; and the clips a wire run along a slot takes at
// a pitch. Each printed part is drawn from the profile's, the thread's and the printer's rules, prints without supports
// with a plain first layer, and reports its grams and its margin at a named load.
//
// A mount's frame (its fitted pose): x along the slot (0 at the mount's middle), y across it, z out of the beam's face
// (0 on the face). The device sits on the mount at its anchor "device", the device's own x and y turned by `turn` about
// z. A part printed on its side (a clip, a tie anchor, a spool holder) has the frame panel.mjs gives a clip: its section
// in (y, z) is the first layer and the slot's direction is up. Units: mm, N, grams.
import jscad from '@jscad/modeling';
import { hole, counterbore, fixingModel, engagement, holeModel, DEFAULTS as FIX } from '@rulecad/fixings';
import { FITTING_DEFAULTS, printerOf, pfig, options, profileOf, slotSide, roundConcave, ccw, combine, sold, screwOf } from './fitting.mjs';
import { partSetup, loadOk, weigh, closingFindings, bendT, bendMargin, sidePart, sideToFit } from './panel.mjs';

const { polygon, cylinder, cylinderElliptic } = jscad.primitives, { extrudeLinear } = jscad.extrusions;
const { translate, transform, rotateX } = jscad.transforms;
const CHECKED = '2026-11-17';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const shown = (v) => { const s = v === undefined ? 'nothing' : JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };
const mm = (x) => String(+Number(x).toFixed(2));
const r3 = (x) => +x.toFixed(3);
const up = (x, step) => Math.ceil(x / step - 1e-9) * step;
const finding = (level, text, code, extra = {}) => ({ level, text, code, ...extra });
const rule = (value, unit, text, kind, source) => ({ value, ...(unit ? { unit } : {}), rule: text, kind, source, checked: CHECKED });
const prism = (loop, h) => extrudeLinear({ height: h }, polygon({ points: ccw(loop) }));
const short = (p) => p.name.replace(/^profile-/, '');
const want = () => FITTING_DEFAULTS.margin.value;
const G = 9.81;

const ARCTIC40 = 'ARCTIC, 40 mm fan mounting hole pattern (a drawing): 32.00 mm between holes, https://support.arctic.de/products/fan-grills/techdocs/40mm%20Fan%20-%20Mounting%20Hole%20Pattern.pdf';
const ARCTIC80 = 'ARCTIC, 80 mm fan mounting hole pattern (a drawing): 71.5 mm between holes, 4.30 mm holes, https://support.arctic.de/products/p8max/techdocs/80mm_fan-Mounting_hole_pattern.pdf';
const SPACINGS = 'A guide to fan sizes listing 82.5 mm spacing for 92 mm fans and 105 mm for 120 mm fans, https://gadgetsfeed.com/how-to-measure-pc-fan-size/: one secondary source, not a maker\'s drawing';
const WEID = 'Weidmüller TS 35X7.5 terminal rail data sheet: depth 7.5 mm, height 35 mm, thickness 1.00 mm, to DIN EN 60715, https://www.mouser.com/datasheet/3/864/1/8000006717_TS35X7.5_ST_KTB7650_VER_en.pdf';

/** The working figures of the service fittings, each with what it rests on. */
export const SERVICE_DEFAULTS = {
  load: rule(50, 'N', 'The design load on a device\'s mount where none is given: a hand pressing on the device at its farthest mounting hole', 'default', 'A working figure of @rulecad/frames, so every mount is sized and compared at one named load'),
  gap: rule(1, 'mm', 'Room between a device\'s body and a screw head beside it', 'default', 'A working figure of @rulecad/frames'),
  standoff: rule(3, 'mm', 'The least a board stands off its mount, for the leads soldered through it', 'estimate', 'A working figure of @rulecad/frames: through-hole leads trimmed short stand about 1.5 to 2 mm under a board; measure yours'),
  walls: rule(3, 'lines', 'A printed part\'s thinnest wall or floor, in the printer\'s lines', 'default', 'A working figure of @rulecad/frames, as PANEL_DEFAULTS.walls'),
  head: rule(0.2, 'mm', 'A counterbore is this much deeper than the head it takes', 'default', 'A working figure of @rulecad/frames'),
  cable: rule(6, 'mm', 'A cable clip\'s bundle where none is given', 'default', 'A working figure of @rulecad/frames'),
  clipWidth: rule(8, 'mm', 'A cable clip\'s length along its slot', 'default', 'A working figure of @rulecad/frames'),
  snap: rule(0.7, '× cable', 'A cable clip\'s ring opens this share of the bundle\'s diameter, so the bundle snaps in past it and stays', 'estimate', 'A working figure of @rulecad/frames, to be checked by a test print'),
  clipLoad: rule(10, 'N', 'The design load on a cable clip: the bundle pulled out of the slot by hand', 'default', 'A working figure of @rulecad/frames'),
  pitch: rule(100, 'mm', 'Cable clips along a slot are no further apart than this, with one at each end of the run', 'estimate', 'A working figure of @rulecad/frames: a light bundle between clips this far apart does not sag out of the slot\'s line'),
  barb: rule(0.3, 'mm', 'How far a clip\'s barbs reach past the slot\'s opening under its lips', 'estimate', 'A working figure of @rulecad/frames, as PANEL_DEFAULTS.barb'),
  tie: rule([3.6, 1.2], 'mm', 'A cable tie\'s band, width and thickness: the common 3.6 mm tie', 'community', 'Cable ties are sold by band width, 2.5, 3.6 and 4.8 mm the common ones; the thickness is a typical band\'s, not one maker\'s: measure yours'),
  tieLoad: rule(50, 'N', 'The design load on a tie anchor: its tie pulled tight round a bundle', 'estimate', 'A working figure of @rulecad/frames'),
  spool: rule({ bore: 52, width: 70, mass: 1.25 }, '', 'A 1 kg spool of filament: its bore (mm), its width (mm) and its mass full (kg)', 'estimate', 'A working figure of @rulecad/frames: spools differ by maker, so measure yours'),
  pull: rule(2, '× weight', 'A spool holder carries this many times the full spool\'s weight, for the tug as the printer draws filament off it', 'estimate', 'A working figure of @rulecad/frames'),
  chainFlange: rule(2, 'mm', 'A drag chain\'s end bracket where its screws pass, where its maker gives none', 'estimate', 'A working figure of @rulecad/frames: check your chain\'s drawing'),
};

/** Fans by size: their hole spacing, the screw that goes through their corners into the mount, and a usual frame depth. */
export const FANS = {
  40: { spacing: rule(32, 'mm', 'Between a 40 mm fan\'s holes', 'spec', ARCTIC40), thread: 'M3', depth: rule(10, 'mm', 'A 40 mm fan\'s usual frame depth', 'estimate', 'Common 40 x 10 mm fans: measure yours') },
  60: { spacing: rule(50, 'mm', 'Between a 60 mm fan\'s holes', 'estimate', 'No maker\'s drawing was found for it: measure yours'), thread: 'M3', depth: rule(15, 'mm', 'A 60 mm fan\'s usual frame depth', 'estimate', 'Common 60 x 15 mm fans: measure yours') },
  80: { spacing: rule(71.5, 'mm', 'Between an 80 mm fan\'s holes', 'spec', ARCTIC80), thread: 'M4', depth: rule(25, 'mm', 'An 80 mm fan\'s usual frame depth', 'estimate', 'Common 80 x 25 mm fans: measure yours') },
  92: { spacing: rule(82.5, 'mm', 'Between a 92 mm fan\'s holes', 'community', SPACINGS), thread: 'M4', depth: rule(25, 'mm', 'A 92 mm fan\'s usual frame depth', 'estimate', 'Common 92 x 25 mm fans: measure yours') },
  120: { spacing: rule(105, 'mm', 'Between a 120 mm fan\'s holes', 'community', SPACINGS), thread: 'M4', depth: rule(25, 'mm', 'A 120 mm fan\'s usual frame depth', 'estimate', 'Common 120 x 25 mm fans: measure yours') },
};

/** A TS35 top-hat rail (DIN EN 60715), as a DIN rail adapter carries it. */
export const DIN_RAIL = {
  width: rule(35, 'mm', 'A TS35 rail\'s width across its flanges', 'spec', WEID),
  depth: rule(7.5, 'mm', 'How far its flanges stand off what it is screwed to', 'spec', WEID),
  thickness: rule(1, 'mm', 'Its steel\'s thickness', 'spec', WEID),
  hole: rule(5.2, 'mm', 'The holes or slots down its middle that its screws pass', 'community', 'Weidmüller TS 35X7.5/LL perforated rail (hole D 5.2 mm); slotted rails differ by maker: measure yours'),
  thread: rule('M4', '', 'The screw through the rail into the adapter', 'default', 'A working figure of @rulecad/frames: an M4 passes a 5.2 mm hole with room'),
};

// a rectangle [[x0, y0], [x1, y1]] with its corners rounded r, as a counter-clockwise loop
function roundRect([[x0, y0], [x1, y1]], r, n = 6) {
  if (!(r > 0)) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const out = [], cs = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  for (const [cx, cy, a0] of cs) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); out.push([r3(cx + r * Math.cos(a)), r3(cy + r * Math.sin(a))]); }
  return out;
}
const headHeight = (thread, head) => fixingModel(thread).figures[head === 'cap' ? 'head_height' : `${head}_head_height`]?.value ?? fixingModel(thread).major;
const TURNS = { 0: [1, 0, 0, 1], 90: [0, -1, 1, 0], 180: [-1, 0, 0, -1], 270: [0, 1, -1, 0] };
const turned = (T, [x, y]) => [r3(T[0] * x + T[1] * y), r3(T[2] * x + T[3] * y)];
const sideHead = (what, head) => { const h = head ?? 'button'; if (!['cap', 'button'].includes(h)) throw new Error(`${what}: head is cap or button (got ${shown(head)})`); return h; };

// ---------- a plate mount: the core of a device, fan, drag chain or DIN rail mount ----------
// dev: { noun, name, title, holes (in the plate's frame), thread, fix: 'tapped' | 'through', reach (tapped), thickness
// (through: the device at its holes), standoff (through), head, footprint [[x0, y0], [x1, y1]], cover (the plate under
// all of the footprint), opening (a round hole's diameter at the footprint's middle), anchor { at, ref }, hardware }
function plateMount(what, profile, o, dev) {
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  loadOk(what, o.load, `the force on the ${dev.noun} at its farthest hole`);
  const head = sideHead(what, o.head), sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, head, k.pr), cell = sd.cell;
  const dh = dev.head ?? 'button', ds = screwOf(what, dev.thread, dh, k.pr), gap = SERVICE_DEFAULTS.gap.value, reach = FITTING_DEFAULTS.reach.value;
  const walls = up(SERVICE_DEFAULTS.walls.value * k.line, k.layer), endBy = r3(up(Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + reach), 0.5));
  const [[fx0, fy0], [fx1, fy1]] = dev.footprint;
  // the device's own screws: into its tapped holes from under the plate, or through it into pilots in the plate's bosses
  let L, floor = 0, pocket = 0, engaged, pilot = 0, rb = 0, need = null;
  const sold0 = [...(fixingModel(dev.thread).figures.lengths?.value ?? [])].sort((a, b) => a - b);
  if (dev.fix === 'tapped') {
    L = sold0.find((l) => l - dev.reach >= walls - 1e-9);
    if (L == null) throw new Error(`${what}: no ${dev.thread} ${dh} screw sold leaves a ${mm(walls)} mm floor under its head and goes no further than the ${mm(dev.reach)} mm the ${dev.noun}'s maker allows`);
    floor = r3(L - dev.reach); engaged = dev.reach; pocket = r3(up(headHeight(dev.thread, dh) + SERVICE_DEFAULTS.head.value, k.layer));
  } else {
    need = engagement(dev.thread, { depth: 1, material: k.mat.name }).need;
    L = sold0.find((l) => l - dev.thickness >= need - 1e-9);
    if (L == null) throw new Error(`${what}: no ${dev.thread} screw sold goes through the ${mm(dev.thickness)} mm ${dev.noun} and ${mm(need)} mm into ${k.mat.name} (engagement.${k.mat.name === 'petg' ? 'petg' : 'pla'})`);
    engaged = r3(L - dev.thickness); pilot = r3(engaged + FIX.tip_room.value);
    rb = r3(up(Math.max(1.25 * ds.major, holeModel(dev.thread, { kind: 'pilot', printer: k.pr }).diameter / 2 + walls), 0.1));
  }
  const endD = r3(up(dev.fix === 'tapped' ? ds.dk / 2 + walls : Math.max(rb + 1 + walls, FITTING_DEFAULTS.end.value * ds.hd), 0.5)); // (a boss and its root's chamfer stay on the plate)
  // the screws into the slot nuts: past the device's body where it lies over the slot's line, else under its footprint
  const covers = fy0 < sc.dk / 2 + gap && fy1 > -sc.dk / 2 - gap;
  const xs = covers ? [r3(fx0 - gap - sc.dk / 2 - reach), r3(fx1 + gap + sc.dk / 2 + reach)] : (fx1 - fx0 >= 4 * endBy ? [r3(fx0 + endBy), r3(fx1 - endBy)] : [r3((fx0 + fx1) / 2), null]).filter((x) => x != null);
  const hx = dev.holes.map((h) => h[0]), hy = dev.holes.map((h) => h[1]);
  const X0 = r3(Math.min(xs[0] - endBy, ...hx.map((x) => x - endD), ...(dev.cover ? [fx0] : []))), X1 = r3(Math.max(xs.at(-1) + endBy, ...hx.map((x) => x + endD), ...(dev.cover ? [fx1] : [])));
  const Y0 = r3(Math.min(-cell / 2, ...hy.map((y) => y - endD), ...(dev.cover ? [fy0] : []))), Y1 = r3(Math.max(cell / 2, ...hy.map((y) => y + endD), ...(dev.cover ? [fy1] : [])));
  for (const x of xs) for (const [px, py] of dev.holes) if (Math.hypot(px - x, py) < sc.dk / 2 + Math.max(rb, ds.dk / 2) + reach) throw new Error(`${what}: the ${dev.noun}'s hole at [${mm(px)}, ${mm(py)}] lies over the screw into the slot at ${mm(x)} mm: turn it, or move it along with offset`);
  // sized: the load at the farthest hole bends the plate where it leaves the beam's face, along its whole length
  const F = o.load ?? SERVICE_DEFAULTS.load.value, a = r3(Math.max(endD, ...dev.holes.map(([, y]) => Math.abs(y) - cell / 2))), b = r3(X1 - X0), M = F * a;
  const least = up(FITTING_DEFAULTS.least.value * sc.major, k.layer), tb = up(bendT(M, b, k.S, want()), k.layer), tdev = r3(floor + pocket);
  const t0 = r3(Math.max(least, tb, tdev, dev.fix === 'through' ? walls : 0)), fits = sold(t0, k.layer, [sd], sd.thread), t = fits ? fits.t : t0;
  if (dev.fix === 'tapped') pocket = r3(t - floor);
  const standoff = dev.fix === 'through' ? r3(up(Math.max(dev.standoff ?? 0, pilot + walls - t), k.layer)) : 0, top = r3(t + standoff);
  if (dev.opening) { const [cx, cy] = [(fx0 + fx1) / 2, (fy0 + fy1) / 2]; for (const [px, py] of dev.holes) if (Math.hypot(px - cx, py - cy) < dev.opening / 2 + rb + walls - 1e-9) throw new Error(`${what}: a ${mm(dev.opening)} mm opening reaches the ${dev.noun}'s hole at [${mm(px)}, ${mm(py)}]`); }
  // design small: a window through the plate inside its holes, where it leaves a frame round each; the plate is then
  // checked at the beam's edge with the window out of its section
  const windows = [], ring = endD + walls;
  if (dev.fix === 'through' && !dev.opening && dev.holes.length >= 3) {
    const rect = [[Math.min(...hx) + ring, Math.min(...hy) + ring], [Math.max(...hx) - ring, Math.max(...hy) - ring]].map((q) => q.map(r3));
    const clear = !dev.holes.some(([x, y]) => x > rect[0][0] - ring + 1e-6 && x < rect[1][0] + ring - 1e-6 && y > rect[0][1] - ring + 1e-6 && y < rect[1][1] + ring - 1e-6);
    if (clear && rect[1][0] - rect[0][0] >= 10 && rect[1][1] - rect[0][1] >= 10) windows.push({ rect, lever: a, across: r3(b - (rect[1][0] - rect[0][0])) });
  }
  const sections = [{ M, b }, ...windows.map((w) => ({ M: F * w.lever, b: w.across }))], worst = sections.reduce((x, y) => (y.M / y.b > x.M / x.b ? y : x));
  const stress = r3((6 * worst.M) / (worst.b * t * t)), margin = r3(bendMargin(worst.M, worst.b, t, k.S));
  const m = { kind: 'fitting', fitting: dev.fitting, name: dev.name(short(p), sd.thread), title: dev.title(short(p)), profile: p.name, face: sd.face, thread: sd.thread, head, thickness: t, standoff, top,
    outline: roundRect([[X0, Y0], [X1, Y1]], 2), windows: windows.map((w) => w.rect), size: { x: b, y: r3(Y1 - Y0), thickness: t, standoff }, fix: dev.fix, device: { thread: dev.thread, head: dh, holes: dev.holes, length: L, engaged, floor, pocket, pilot, boss: rb, thickness: dev.thickness ?? null, reach: dev.reach ?? null, need },
    opening: dev.opening ? { at: [r3((fx0 + fx1) / 2), r3((fy0 + fy1) / 2)], d: dev.opening } : null,
    screws: xs.map((x) => ({ thread: sd.thread, head, grip: t, at: [x, 0, t], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null })),
    deviceScrews: dev.holes.map(([x, y]) => (dev.fix === 'tapped' ? { thread: dev.thread, head: dh, at: [x, y, pocket], axis: [0, 0, 1], length: L, into: 'device' } : { thread: dev.thread, head: dh, at: [x, y, r3(top + dev.thickness)], axis: [0, 0, -1], length: L, into: 'pilot' })),
    anchors: { device: { at: [...dev.anchor.at, top], axis: [0, 0, 1], ref: dev.anchor.ref }, ...Object.fromEntries(dev.holes.map(([x, y], i) => [`d${i + 1}`, dev.fix === 'tapped' ? { at: [x, y, pocket], axis: [0, 0, -1] } : { at: [x, y, r3(top + dev.thickness)], axis: [0, 0, 1] }])) },
    hardware: dev.hardware ?? [], load: { force: F, what: `${F} N on the ${dev.noun} at its farthest hole, ${mm(a)} mm past the beam's face` }, stress, margin,
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['load', 'gap', 'walls'].map((x) => ({ name: `SERVICE_DEFAULTS.${x}`, value: SERVICE_DEFAULTS[x].value, kind: SERVICE_DEFAULTS[x].kind })), ...(dev.rests ?? [])] };
  weigh(m, plateSolid(m, k.pr), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} ${head} into ${xs.length > 1 ? 'each' : 'its'} slot nut through ${mm(t)} mm of plate, its tip between ${mm(fits.windows[0].lo)} (its nut's thread engaged) and ${mm(fits.windows[0].hi)} mm under the face`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } })
    : finding('warn', `no ${sd.thread} ${head} screw sold engages its slot nut fully and stops short of the slot's floor through ${mm(t)} mm: the screw's length is the fasten check's to choose`, 'fitting.screw', {}));
  m.findings.push(finding('pass', dev.fix === 'tapped'
    ? `${dev.holes.length} × ${dev.thread}x${L} ${dh} up through ${mm(floor)} mm of plate into the ${dev.noun}'s own thread, ${mm(engaged)} mm in: as far as its maker allows (${dev.reachSource}). Their heads sit in ${mm(pocket)} mm counterbores under the plate, so they go in before the plate goes on the beam`
    : `${dev.holes.length} × ${dev.thread}x${L} ${dh} through the ${mm(dev.thickness)} mm ${dev.noun} into pilots in the plate, ${mm(engaged)} mm of ${k.mat.name} engaged (${mm(need)} mm asked)${standoff > 0 ? `, on ${mm(standoff)} mm bosses` : ''}`, 'fitting.device', { values: { length: L, engaged, holes: dev.holes.length, standoff } }));
  closingFindings(m, { S: k.S, sizeText: `${mm(b)} x ${mm(Y1 - Y0)} mm, ${mm(t)} mm thick${windows.length ? `, ${windows.length} window${windows.length > 1 ? 's' : ''} through it to save plastic` : ''}${standoff > 0 ? `, the ${dev.noun} on ${mm(standoff)} mm bosses` : ''}${dev.opening ? `, a ${mm(dev.opening)} mm opening for the air` : ''}; ${xs.length} ${sd.thread} into the slot`, marginText: `under ${m.load.what}, the plate bends to ${mm(stress)} MPa`, pose: dev.fix === 'tapped' ? 'its top face down, the counterbores opening up' : 'its beam side down, the bosses up' });
  return m;
}

function plateSolid(m, pr, ops = null) {
  const t = m.thickness, D = m.device, parts = [prism(m.outline, t)], cuts = [], o = { printer: pr };
  if (m.standoff > 0) for (const [x, y] of D.holes) {
    const c = Math.min(1, m.standoff / 2); // (a 45° chamfer round each boss's root: no square inside corner)
    parts.push(translate([x, y, t - 0.01], cylinder({ radius: D.boss, height: m.standoff + 0.01, segments: 32, center: [0, 0, (m.standoff + 0.01) / 2] })));
    parts.push(translate([x, y, t - 0.01], cylinderElliptic({ startRadius: [D.boss + c, D.boss + c], endRadius: [D.boss, D.boss], height: c + 0.01, segments: 32, center: [0, 0, (c + 0.01) / 2] })));
  }
  for (const sc of m.screws) cuts.push(hole(sc.thread, { kind: 'clearance', into: '-z', depth: t + 2, at: [sc.at[0], sc.at[1], t + 1], ...o }));
  for (const sc of m.deviceScrews) cuts.push(sc.into === 'device'
    ? counterbore(sc.thread, { head: sc.head, depth: D.pocket, length: t + 2, into: '+z', at: [sc.at[0], sc.at[1], 0], ...o })
    : hole(sc.thread, { kind: 'pilot', into: '-z', depth: D.pilot, at: [sc.at[0], sc.at[1], m.top], ...o }));
  for (const w of m.windows ?? []) cuts.push(translate([0, 0, -1], prism(roundRect(w, 3), t + 2)));
  if (m.opening) cuts.push(translate([m.opening.at[0], m.opening.at[1], t / 2], cylinder({ radius: m.opening.d / 2, height: t + 2, segments: 64 })));
  return combine(parts, cuts, ops);
}
// The solid of any plate mount: fitted, or laid to print (a tapped one's top face down)
function plateOut(name, m, o) {
  const pr = printerOf(name, o.printer), g = plateSolid(m, pr, o.ops ?? null);
  return Object.assign(o.pose === 'fit' || m.fix !== 'tapped' ? g : translate([0, 0, m.thickness], rotateX(Math.PI, g)), { model: m });
}

// ---------- a board's or a supply's mount ----------
// a rule set's figures with a variant's values and whole rules over them (as cad's bought parts read them)
function rulesOf(what, set, variant) {
  if (!set || typeof set !== 'object' || !set.rules) throw new Error(`${what}: device is the device's rule set ({ name, part, rules }), as @rulecad/rules/supply-24v.json (got ${shown(set)})`);
  if (variant == null) return set.rules;
  const v = set.variants?.[variant];
  if (!v) throw new Error(`${what}: ${set.name} has no variant ${shown(variant)} (${Object.keys(set.variants ?? {}).join(', ') || 'none'})`);
  return { ...set.rules, ...Object.fromEntries(Object.entries(v.values ?? {}).map(([k, value]) => [k, { ...set.rules[k], value, kind: v.kind ?? set.rules[k]?.kind, source: v.source ?? set.rules[k]?.source }])), ...(v.rules ?? {}) };
}

/**
 * A printed plate that holds a bought device on a beam's slotted face, its holes read from the device's rule set
 * (mount_holes, with mount_hole_thread and mount_hole_reach for tapped holes, as a supply's; mount_hole_diameter and
 * board_thickness for plain ones, as a board's). A supply is screwed up from under the plate into its own thread, no
 * further than its maker allows; a board is screwed down through its holes into pilots in bosses that stand it off.
 * The plate is screwed into slot nuts past the device's body. Sized from a named load at the farthest hole by beam
 * formulas to about twice the margin, then made thick enough for a sold screw into the slot nut.
 * @param {string | object} profile
 * @param {{ device: object, variant?: string, turn?: 0 | 90 | 180 | 270, offset?: number, standoff?: number, screw?: string, deviceHead?: 'cap' | 'button', load?: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} o
 *   device: its rule set; turn: the device's x from the slot's line, in degrees; offset: its middle across the slot (y), mm; screw: a board's screws, where not the largest its holes pass
 * @returns {object} its model: anchors.device (where the device's own frame goes), screws (into the slot), deviceScrews, findings
 */
export function deviceMountModel(profile, o = {}) {
  const what = 'deviceMountModel';
  options(what, o ?? {}, ['device', 'variant', 'turn', 'offset', 'standoff', 'screw', 'deviceHead', 'load', 'face', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  const r = rulesOf(what, o.device, o.variant), set = o.device.name ?? 'the device', label = `${set}${o.variant ? ` (${o.variant})` : ''}`;
  const holes = r.mount_holes?.value;
  if (!(Array.isArray(holes) && holes.length && holes.every((h) => Array.isArray(h) && h.length === 2 && h.every(isNum)))) throw new Error(`${what}: ${label} gives no mounting holes (mount_holes, [[x, y], ...] from its middle): a mount reads them from its rule set, so add them from its maker's drawing, or measure them`);
  const turn = o.turn ?? 0;
  if (!TURNS[turn]) throw new Error(`${what}: turn is 0, 90, 180 or 270, the device's x from the slot's line in degrees (got ${shown(o.turn)})`);
  const dy = o.offset ?? 0;
  if (!isNum(dy)) throw new Error(`${what}: offset is the device's middle across the slot, in mm (got ${shown(o.offset)})`);
  const T = TURNS[turn], w = r.body_width?.value, d = r.body_depth?.value;
  if (!(isNum(w) && isNum(d))) throw new Error(`${what}: ${label} gives no body_width and body_depth: a mount keeps its screws clear of the body`);
  const at = (p) => { const [x, y] = turned(T, p); return [x, r3(y + dy)]; }, corners = [[-w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2]].map(at);
  const footprint = [[Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1]))], [Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))]];
  const thread = r.mount_hole_thread?.value, dia = r.mount_hole_diameter?.value, tapped = typeof thread === 'string';
  let screw = thread;
  if (!tapped) {
    if (!isNum(dia)) throw new Error(`${what}: ${label}'s mounting holes have no thread (mount_hole_thread) and no diameter (mount_hole_diameter): the mount takes one or the other`);
    screw = o.screw ?? ['M5', 'M4', 'M3', 'M2.5', 'M2'].find((t) => { try { return fixingModel(t).major <= dia - 0.15; } catch { return false; } });
    if (!screw) throw new Error(`${what}: ${label}'s ${mm(dia)} mm holes pass no metric screw from M2 up`);
  } else if (!isNum(r.mount_hole_reach?.value)) throw new Error(`${what}: ${label}'s tapped holes give no mount_hole_reach, how far a screw may go in: take it from its maker's drawing`);
  const kindOf = r.mount_holes.kind ?? 'estimate';
  return plateMount(what, profile, o, {
    noun: o.device.part ?? 'device', fitting: 'device-mount', fix: tapped ? 'tapped' : 'through', holes: holes.map(at), thread: screw, head: o.deviceHead ?? 'button',
    reach: tapped ? r.mount_hole_reach.value : null, reachSource: tapped ? `${set}.mount_hole_reach, ${r.mount_hole_reach.kind}` : null,
    thickness: tapped ? null : r.board_thickness?.value ?? 1.6, standoff: o.standoff ?? (tapped ? 0 : SERVICE_DEFAULTS.standoff.value), footprint, anchor: { at: [0, r3(dy)], ref: [T[0], T[2], 0] },
    name: (pf, th) => `device-mount-${pf}-${String(o.variant ?? set).toLowerCase()}-${th.toLowerCase()}`, title: (pf) => `printed mount for ${label} on ${pf}`,
    rests: [{ name: `${set}.mount_holes`, value: holes, kind: kindOf }, ...(tapped ? [{ name: `${set}.mount_hole_reach`, value: r.mount_hole_reach.value, kind: r.mount_hole_reach.kind }] : [{ name: `${set}.mount_hole_diameter`, value: dia, kind: r.mount_hole_diameter.kind }]), ...(o.standoff == null && !tapped ? [{ name: 'SERVICE_DEFAULTS.standoff', value: SERVICE_DEFAULTS.standoff.value, kind: 'estimate' }] : [])],
  });
}
/** A device mount's solid: fitted (pose 'fit'), or laid to print. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function deviceMount(m, o = {}) {
  if (m?.fitting !== 'device-mount') throw new Error(`deviceMount: give a device mount's model (deviceMountModel), not ${shown(m)}`);
  return plateOut('deviceMount', m, o);
}

// ---------- a fan mount ----------
/**
 * A printed plate that holds a fan beside a beam, blowing out of its face: the fan's four holes by its size (FANS),
 * screws through the fan's corners into pilots in the plate, a round opening for the air, screwed into the slot.
 * @param {string | object} profile @param {{ size: 40 | 60 | 80 | 92 | 120, depth?: number, side?: 1 | -1, load?: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} o
 *   depth: the fan's frame depth (default the usual, FANS); side: which side of the slot it stands (+y or -y)
 * @returns {object} its model
 */
export function fanMountModel(profile, o = {}) {
  const what = 'fanMountModel';
  options(what, o ?? {}, ['size', 'depth', 'side', 'load', 'face', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  const f = FANS[o.size];
  if (!f) throw new Error(`${what}: size is a fan's size in mm, one of ${Object.keys(FANS).join(', ')} (got ${shown(o.size)})`);
  const depth = o.depth ?? f.depth.value, side = o.side ?? 1;
  if (!(isNum(depth) && depth > 0)) throw new Error(`${what}: depth is the fan's frame depth in mm, above 0 (got ${shown(o.depth)})`);
  if (![1, -1].includes(side)) throw new Error(`${what}: side is 1 or -1, the side of the slot the fan stands (got ${shown(o.side)})`);
  const p = profileOf(what, profile, o.given ?? {}), cell = Math.min(p.width, p.height), S = o.size, s = f.spacing.value / 2, cy = side * r3(cell / 2 + SERVICE_DEFAULTS.gap.value + S / 2);
  const holes = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([x, y]) => [r3(x), r3(cy + y)]), rb = 1.25 * fixingModel(f.thread).major + 1;
  const opening = r3(Math.min(0.95 * S, 2 * (s * Math.SQRT2 - rb - 2)));
  return plateMount(what, profile, o, {
    noun: 'fan', fitting: 'fan-mount', fix: 'through', holes, thread: f.thread, head: 'button', thickness: depth, standoff: 0, cover: true, opening,
    footprint: [[-S / 2, cy - S / 2], [S / 2, cy + S / 2]], anchor: { at: [0, cy], ref: [1, 0, 0] },
    name: (pf, th) => `fan-mount-${pf}-${S}-${th.toLowerCase()}`, title: (pf) => `printed mount for a ${S} mm fan on ${pf}`,
    rests: [{ name: `FANS.${S}.spacing`, value: f.spacing.value, kind: f.spacing.kind }, ...(o.depth == null ? [{ name: `FANS.${S}.depth`, value: depth, kind: f.depth.kind }] : [])],
  });
}
/** A fan mount's solid. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function fanMount(m, o = {}) {
  if (m?.fitting !== 'fan-mount') throw new Error(`fanMount: give a fan mount's model (fanMountModel), not ${shown(m)}`);
  return plateOut('fanMount', m, o);
}

// ---------- a drag chain's end ----------
/**
 * A printed plate for a drag chain's end bracket on a beam's slot: the bracket's holes from its maker's drawing, its
 * screws through the bracket into pilots in the plate, the plate screwed into the slot past it.
 * @param {string | object} profile @param {{ holes: number[][], screw: string, flange?: number, load?: number, face?: string, thread?: string, nut?: string, head?: 'cap' | 'button', printer?: object, material?: string | object, given?: object }} o
 *   holes: [[x, y], ...] the end bracket's holes from its middle, x along the slot; screw: their thread; flange: the bracket's thickness at its holes; thread: the screws into the slot's
 * @returns {object} its model
 */
export function dragChainEndModel(profile, o = {}) {
  const what = 'dragChainEndModel';
  options(what, o ?? {}, ['holes', 'screw', 'flange', 'load', 'face', 'thread', 'nut', 'head', 'printer', 'material', 'given']);
  if (!(Array.isArray(o.holes) && o.holes.length && o.holes.every((h) => Array.isArray(h) && h.length === 2 && h.every(isNum)))) throw new Error(`${what}: holes is the chain's end bracket's holes, [[x, y], ...] in mm from its middle, from its maker's drawing (got ${shown(o.holes)})`);
  if (typeof o.screw !== 'string') throw new Error(`${what}: screw is the end bracket's screws' thread, as 'M3' (got ${shown(o.screw)})`);
  let major; try { major = fixingModel(o.screw).major; } catch (e) { throw new Error(`${what}: screw: ${String(e.message).replace(/^\w+: /, '')}`); }
  const flange = o.flange ?? SERVICE_DEFAULTS.chainFlange.value, room = 1.25 * major + 1;
  if (!(isNum(flange) && flange > 0)) throw new Error(`${what}: flange is the end bracket's thickness at its holes, in mm, above 0 (got ${shown(o.flange)})`);
  const xs = o.holes.map((h) => h[0]), ys = o.holes.map((h) => h[1]);
  return plateMount(what, profile, o, {
    noun: 'chain\'s end', fitting: 'drag-chain-end', fix: 'through', holes: o.holes.map((h) => h.map(r3)), thread: o.screw, head: 'button', thickness: flange, standoff: 0,
    footprint: [[Math.min(...xs) - room, Math.min(...ys) - room], [Math.max(...xs) + room, Math.max(...ys) + room]], anchor: { at: [0, 0], ref: [1, 0, 0] },
    name: (pf, th) => `drag-chain-end-${pf}-${o.screw.toLowerCase()}-${th.toLowerCase()}`, title: (pf) => `printed drag chain end plate on ${pf}`,
    rests: o.flange == null ? [{ name: 'SERVICE_DEFAULTS.chainFlange', value: flange, kind: 'estimate' }] : [],
  });
}
/** A drag chain end plate's solid. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function dragChainEnd(m, o = {}) {
  if (m?.fitting !== 'drag-chain-end') throw new Error(`dragChainEnd: give a drag chain end's model (dragChainEndModel), not ${shown(m)}`);
  return plateOut('dragChainEnd', m, o);
}

// ---------- a DIN rail adapter ----------
/**
 * A printed block that carries a length of TS35 top-hat rail across a beam: the rail screwed through its middle into a
 * pilot in the block, the block screwed into the slot each side of the rail, clear of its flanges.
 * @param {string | object} profile @param {{ length?: number, load?: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} [o]
 *   length: how far the block reaches along the rail, across the beam (default the beam's cell)
 * @returns {object} its model, with the rail in its hardware
 */
export function dinRailAdapterModel(profile, o = {}) {
  const what = 'dinRailAdapterModel';
  options(what, o ?? {}, ['length', 'load', 'face', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  const p = profileOf(what, profile, o.given ?? {}), L = o.length ?? Math.min(p.width, p.height), W = DIN_RAIL.width.value;
  if (!(isNum(L) && L > 0)) throw new Error(`${what}: length is how far the block reaches along the rail, in mm, above 0 (got ${shown(o.length)})`);
  return plateMount(what, profile, o, {
    noun: 'rail', fitting: 'din-rail', fix: 'through', holes: [[0, 0]], thread: DIN_RAIL.thread.value, head: 'button', thickness: DIN_RAIL.thickness.value, standoff: 0,
    footprint: [[-W / 2, -L / 2], [W / 2, L / 2]], anchor: { at: [0, 0], ref: [0, 1, 0] },
    hardware: [{ kind: 'rail', name: 'TS35 x 7.5 top-hat rail (DIN EN 60715)', count: 1, why: 'cut to length, carried across the beam' }],
    name: (pf, th) => `din-rail-adapter-${pf}-${th.toLowerCase()}`, title: (pf) => `printed DIN rail adapter on ${pf}`,
    rests: ['width', 'thickness', 'hole'].map((k) => ({ name: `DIN_RAIL.${k}`, value: DIN_RAIL[k].value, kind: DIN_RAIL[k].kind })),
  });
}
/** A DIN rail adapter's solid. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function dinRailAdapter(m, o = {}) {
  if (m?.fitting !== 'din-rail') throw new Error(`dinRailAdapter: give a DIN rail adapter's model (dinRailAdapterModel), not ${shown(m)}`);
  return plateOut('dinRailAdapter', m, o);
}

// ---------- a cable clip ----------
/**
 * A printed clip that snaps into a slot and holds a cable bundle along it: a stem through the slot's opening with
 * barbs under its lips (as a slot cover's), a flange on the face, and a ring over it that opens to let the bundle in.
 * It prints on its side, its section the first layer. No screw: it goes in anywhere along the slot.
 * @param {string | object} profile @param {{ cable?: number, width?: number, load?: number, face?: string, printer?: object, material?: string | object, given?: object }} [o]
 *   cable: the bundle's diameter; width: the clip along the slot
 * @returns {object} its model: anchors.cable (the bundle's centre line), findings
 */
export function cableClipModel(profile, o = {}) {
  const what = 'cableClipModel';
  options(what, o ?? {}, ['cable', 'width', 'load', 'face', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  loadOk(what, o.load, 'the pull on the bundle out of the slot');
  const D = o.cable ?? SERVICE_DEFAULTS.cable.value, w = o.width ?? SERVICE_DEFAULTS.clipWidth.value;
  if (!(isNum(D) && D > 0 && D <= 30)) throw new Error(`${what}: cable is the bundle's diameter in mm, above 0 and up to 30 (got ${shown(o.cable)})`);
  if (!(isNum(w) && w >= 4)) throw new Error(`${what}: width is the clip's length along the slot in mm, at least 4 (got ${shown(o.width)})`);
  const sd = slotSide(what, p, o.face ?? 'top', undefined, null, k.fit, given), op = sd.slot.opening, lip = sd.slot.lip, ws = r3(op - 2 * k.fit), b = SERVICE_DEFAULTS.barb.value;
  if (ws < 2 * k.line) throw new Error(`${what}: ${sd.slot.name}'s ${mm(op)} mm opening leaves a stem ${mm(ws)} mm wide: too thin to print`);
  const tf = r3(up(3 * k.layer, k.layer)), wall = r3(up(SERVICE_DEFAULTS.walls.value * k.line, 0.1)), Ri = r3(D / 2 + k.fit), Ro = r3(Ri + wall), half = r3(Math.max(op / 2 + 1, Ro * 0.6)), zc = r3(tf + Ro - wall / 2);
  const alpha = Math.asin(Math.min(0.95, (SERVICE_DEFAULTS.snap.value * D) / 2 / Ri)), n = 32;
  // the ring, open at its top: the outer arc round from the opening's left to its right, the inner back
  const arc = (R, a0, a1) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [r3(R * Math.cos(a)), r3(zc + R * Math.sin(a))]; });
  const ring = [...arc(Ro, Math.PI / 2 + alpha, 2.5 * Math.PI - alpha), ...arc(Ri, 2.5 * Math.PI - alpha, Math.PI / 2 + alpha)];
  const base = [[-half, 0], [-ws / 2, 0], [-ws / 2, -lip], [-ws / 2 - b, -lip - b], [-ws / 2, -lip - 2 * b], [-ws / 2 + b, -lip - 3 * b], [ws / 2 - b, -lip - 3 * b], [ws / 2, -lip - 2 * b], [ws / 2 + b, -lip - b], [ws / 2, -lip], [ws / 2, 0], [half, 0], [half, tf], [-half, tf]].map(([y, z]) => [r3(y), r3(z)]);
  const neck = [[-Math.min(half, Ro * 0.6), tf - 0.01], [Math.min(half, Ro * 0.6), tf - 0.01], [Math.min(half, Ro * 0.6), zc - Ri * 0.5], [-Math.min(half, Ro * 0.6), zc - Ri * 0.5]].map(([y, z]) => [r3(y), r3(z)]);
  const F = o.load ?? SERVICE_DEFAULTS.clipLoad.value, sStem = r3(F / (ws * w)), sRing = r3(F / (2 * wall * w)), stress = Math.max(sStem, sRing), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'cable-clip', name: `cable-clip-${sd.slot.name.replace(/^slot-/, '')}-${mm(D)}mm`, title: `printed cable clip for a ${mm(D)} mm bundle in ${sd.slot.name}`, profile: p.name, face: sd.face, slot: sd.slot.name, cable: D, width: w,
    sections: [base, neck, ring], stem: ws, barb: b, flange: tf, ring: { inner: Ri, outer: Ro, centre: zc, opening: r3(2 * Ri * Math.sin(alpha)) }, screws: [],
    anchors: { cable: { at: [0, 0, zc], axis: [1, 0, 0] } }, load: { force: F, what: `${F} N pulling the bundle out of the slot` }, stress, margin, size: { width: w, height: r3(zc + Ro), cable: D, opening: r3(2 * Ri * Math.sin(alpha)) },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: ['cable', 'snap', 'barb', 'clipLoad'].map((x) => ({ name: `SERVICE_DEFAULTS.${x}`, value: SERVICE_DEFAULTS[x].value, kind: SERVICE_DEFAULTS[x].kind })) };
  weigh(m, cableClip(m, { printer: k.pr }), k.density);
  closingFindings(m, { S: k.S, sizeText: `a ${mm(D)} mm bundle in a ring ${mm(wall)} mm thick, its centre ${mm(zc)} mm off the face, opening ${mm(m.ring.opening)} mm to snap it in; a ${mm(ws)} mm stem through the ${mm(lip)} mm lip, barbs ${mm(b)} mm under it (an estimate: try one in a scrap of beam); ${mm(w)} mm along the slot`, marginText: `under ${m.load.what}, the stem and the ring pull to ${mm(stress)} MPa by their sections`, pose: 'on its side, its section the first layer' });
  return m;
}
/** A cable clip's solid: on its side to print, or fitted. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function cableClip(m, o = {}) {
  if (m?.fitting !== 'cable-clip') throw new Error(`cableClip: give a cable clip's model (cableClipModel), not ${shown(m)}`);
  const g = combine(m.sections.map((s) => prism(s, m.width)), [], o.ops ?? null);
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.width), g) : g, { model: m });
}

/**
 * Where cable clips go along a run of slot: one at each end and as many between as keep them no further apart than the
 * pitch, evenly spaced. @param {number} length the run, mm @param {{ pitch?: number }} [o] @returns {{ count: number, pitch: number, at: number[] }}
 */
export function runClips(length, o = {}) {
  const pitch = o.pitch ?? SERVICE_DEFAULTS.pitch.value;
  if (!(isNum(length) && length >= 0)) throw new Error(`runClips: length is the run along the slot in mm, 0 or more (got ${shown(length)})`);
  if (!(isNum(pitch) && pitch > 0)) throw new Error(`runClips: pitch is the most between clips in mm, above 0 (got ${shown(o.pitch)})`);
  const count = length < 1e-9 ? 1 : Math.max(2, Math.ceil(length / pitch - 1e-9) + 1), step = count > 1 ? length / (count - 1) : 0;
  return { count, pitch: r3(step), at: Array.from({ length: count }, (_, i) => r3(i * step)) };
}

// ---------- a cable tie anchor ----------
/**
 * A printed block screwed into a slot nut, with a tunnel across it beside the screw for a cable tie, so a bundle along
 * the slot is tied down. It prints on its side; the tunnel's roof is pointed, so it needs no bridge.
 * @param {string | object} profile @param {{ tie?: number[], load?: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} [o]
 *   tie: the tie's band [width, thickness]
 * @returns {object} its model
 */
export function tieAnchorModel(profile, o = {}) {
  const what = 'tieAnchorModel';
  options(what, o ?? {}, ['tie', 'load', 'face', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o);
  loadOk(what, o.load, 'the tie\'s pull');
  const [tw, tt] = o.tie ?? SERVICE_DEFAULTS.tie.value;
  if (!(isNum(tw) && isNum(tt) && tw > 0 && tt > 0)) throw new Error(`${what}: tie is the tie's band [width, thickness] in mm (got ${shown(o.tie)})`);
  const head = sideHead(what, o.head), sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, head, k.pr);
  const e = r3(up(Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + FITTING_DEFAULTS.reach.value), 0.5)), walls = up(SERVICE_DEFAULTS.walls.value * k.line, k.layer);
  const tunnel = { w: r3(tw + 2 * k.fit), h: r3(tt + 2 * k.fit) }, floor = walls, F = o.load ?? SERVICE_DEFAULTS.tieLoad.value;
  // the roof over the tunnel, a beam across the tie's width, both ends held, the tie's pull at its middle
  const Mr = (F * tunnel.w) / 8, roof0 = Math.max(walls, up(bendT(Mr, 2 * e, k.S, want()), k.layer)), H0 = r3(floor + tunnel.h + tunnel.h / 2 + roof0), least = up(FITTING_DEFAULTS.least.value * sc.major, k.layer);
  const fits = sold(Math.max(H0, least), k.layer, [sd], sd.thread), H = fits ? fits.t : r3(Math.max(H0, least)), roof = r3(H - floor - 1.5 * tunnel.h);
  const w = r3(2 * e + tunnel.w + 2 * walls), stress = r3((6 * Mr) / (2 * e * roof * roof)), margin = r3(k.S / stress);
  const m = { kind: 'fitting', fitting: 'tie-anchor', name: `tie-anchor-${short(p)}-${sd.thread.toLowerCase()}-${mm(tw)}mm`, title: `printed cable tie anchor for ${short(p)}, ${mm(tw)} mm ties, ${sd.thread}`, profile: p.name, face: sd.face, thread: sd.thread, head,
    width: w, height: H, edge: e, tunnel: { ...tunnel, floor, at: r3(-w / 2 + 2 * e + walls + tunnel.w / 2) }, section: [[-e, 0], [e, 0], [e, H], [-e, H]], tongue: { slot: sd.slot.name, ...sd.tongue, nut: sd.nut.name },
    screws: [{ thread: sd.thread, head, grip: H, at: [r3(-w / 2 + e), 0, H], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null }],
    anchors: { tie: { at: [r3(-w / 2 + 2 * e + walls + tunnel.w / 2), 0, r3(floor + tunnel.h / 2)], axis: [0, 1, 0] } },
    load: { force: F, what: `${F} N pulling on the tie in its tunnel` }, stress, margin, size: { width: w, height: H, across: 2 * e, tunnel: tunnel.w }, volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [],
    rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...['tie', 'tieLoad', 'walls'].map((x) => ({ name: `SERVICE_DEFAULTS.${x}`, value: SERVICE_DEFAULTS[x].value, kind: SERVICE_DEFAULTS[x].kind }))] };
  weigh(m, tieAnchor(m, { printer: k.pr }), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} ${head} into its slot nut through ${mm(H)} mm, its tip between ${mm(fits.windows[0].lo)} and ${mm(fits.windows[0].hi)} mm under the face`, 'fitting.screw', { values: { lengths: fits.lengths, windows: fits.windows } }) : finding('warn', `no ${sd.thread} ${head} screw sold engages its slot nut fully and stops short of the slot's floor here`, 'fitting.screw', {}));
  closingFindings(m, { S: k.S, sizeText: `${mm(w)} mm along the slot, ${mm(2 * e)} mm across, ${mm(H)} mm high; a ${mm(tunnel.w)} x ${mm(tunnel.h)} mm tunnel across it beside the screw, ${mm(floor)} mm off the face`, marginText: `under ${m.load.what}, the roof over the tunnel bends to ${mm(stress)} MPa`, pose: 'on its side, its section the first layer, the tunnel\'s roof pointed' });
  return m;
}
/** A tie anchor's solid: on its side to print, or fitted. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function tieAnchor(m, o = {}) {
  if (m?.fitting !== 'tie-anchor') throw new Error(`tieAnchor: give a tie anchor's model (tieAnchorModel), not ${shown(m)}`);
  const pr = printerOf('tieAnchor', o.printer), w = m.width, e = m.edge, sw = 2 * e;
  // the screw's end: a side part 2e long (print Z from 0 to 2e), the screw at its middle; the tunnel's end beyond it
  const screwEnd = sidePart({ loop: m.section, width: sw, tongue: { at: 0, ...m.tongue }, holes: [{ thread: m.thread, y: 0, top: m.height }], pr });
  const rest = translate([0, 0, sw - 0.01], prism(m.section, w - sw + 0.01));
  const T = m.tunnel, z0 = sw + (w - sw - T.w) / 2, z1 = z0 + T.w; // (in print Z: along the slot; the tunnel runs across, along print X)
  const gable = [[T.floor, z0], [T.floor + T.h, z0], [T.floor + T.h, z1 - T.h / 2], [T.floor + T.h / 2, z1], [T.floor, z1 - T.h / 2]]; // (Y, Z): its far end pointed, the print's up
  const cut = transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, -e - 1, 0, 0, 1], extrudeLinear({ height: sw + 2 }, polygon({ points: ccw(gable) })));
  const g = combine([screwEnd, rest], [cut], o.ops ?? null);
  return Object.assign(o.pose === 'fit' ? transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, -w / 2, 0, 0, 1], g) : g, { model: m });
}

// ---------- a spool holder ----------
/**
 * A printed arm that carries a spool of filament off a beam's side: a pad screwed into the slot, an arm out from the
 * face that the spool's bore hangs on, a lip at its tip. The beam lies level with the face looking sideways, so the
 * spool's weight bends the arm in the section's plane. Sized from the full spool's weight times SERVICE_DEFAULTS.pull.
 * It prints on its side, its section the first layer.
 * @param {string | object} profile @param {{ spool?: { bore: number, width: number, mass: number }, width?: number, load?: number, face?: string, thread?: string, head?: 'cap' | 'button', nut?: string, printer?: object, material?: string | object, given?: object }} [o]
 *   spool: its bore and width (mm) and mass full (kg); width: the arm along the slot (default the cell)
 * @returns {object} its model
 */
export function spoolHolderModel(profile, o = {}) {
  const what = 'spoolHolderModel';
  options(what, o ?? {}, ['spool', 'width', 'load', 'face', 'thread', 'head', 'nut', 'printer', 'material', 'given']);
  const given = o.given ?? {}, p = profileOf(what, profile, given), k = partSetup(what, o), sp = { ...SERVICE_DEFAULTS.spool.value, ...(o.spool ?? {}) };
  for (const x of ['bore', 'width', 'mass']) if (!(isNum(sp[x]) && sp[x] > 0)) throw new Error(`${what}: spool is { bore, width, mass }: its bore and width in mm and its mass full in kg, each above 0 (got ${shown(o.spool)})`);
  loadOk(what, o.load, 'the spool\'s pull down on the arm');
  const head = sideHead(what, o.head), sd = slotSide(what, p, o.face ?? 'top', o.thread, o.nut, k.fit, given), sc = screwOf(what, sd.thread, head, k.pr), w = o.width ?? sd.cell;
  if (!(isNum(w) && w > 0)) throw new Error(`${what}: width is the arm along the slot in mm (got ${shown(o.width)})`);
  const e = r3(up(Math.max(FITTING_DEFAULTS.end.value * sc.hd, sc.dk / 2 + FITTING_DEFAULTS.reach.value), 0.5)), clear = 2, lipW = 5, lip = 5;
  const F = o.load ?? r3(sp.mass * G * SERVICE_DEFAULTS.pull.value), L = r3(clear + sp.width + lipW), M = F * (clear + sp.width / 2);
  const least = up(FITTING_DEFAULTS.least.value * sc.major, k.layer), ta = r3(Math.max(least, up(bendT(M, w, k.S, want()), k.layer)));
  if (ta + lip > sp.bore - 4) throw new Error(`${what}: an arm ${mm(ta)} mm deep with its ${lip} mm lip does not pass a ${mm(sp.bore)} mm bore with 2 mm round it: a lighter spool, or a wider arm (width)`);
  const fits = sold(least, k.layer, [sd], sd.thread), tb = fits ? fits.t : least;
  const loop = roundConcave(ccw([[-e, 0], [r3(e + ta), 0], [r3(e + ta), r3(L - lipW)], [r3(e + ta + lip), r3(L - lipW)], [r3(e + ta + lip), L], [e, L], [e, tb], [-e, tb]]), Math.min(3, tb), null, 8).map(([y, z]) => [r3(y), r3(z)]);
  const stress = r3((6 * M) / (w * ta * ta)), margin = r3(bendMargin(M, w, ta, k.S)), pull = r3(M / (e + ta));
  const m = { kind: 'fitting', fitting: 'spool-holder', name: `spool-holder-${short(p)}-${mm(sp.bore)}x${mm(sp.width)}`, title: `printed spool holder for ${short(p)}, a ${mm(sp.bore)} mm bore spool ${mm(sp.width)} mm wide`, profile: p.name, face: sd.face, thread: sd.thread, head,
    width: w, spool: sp, arm: { depth: ta, length: L, lip }, pad: tb, section: loop, tongue: { slot: sd.slot.name, ...sd.tongue, nut: sd.nut.name },
    screws: [{ thread: sd.thread, head, grip: tb, at: [0, 0, tb], axis: [0, 0, -1], nut: sd.nut.name, nutKind: sd.nut.nutKind, length: fits?.lengths[0] ?? null }],
    anchors: { spool: { at: [0, r3(e + ta), r3(clear + sp.width / 2)], axis: [0, 0, 1] } },
    load: { force: F, what: `${mm(F)} N down on the arm at the spool's middle (its ${mm(sp.mass)} kg full, × ${SERVICE_DEFAULTS.pull.value} for the tug)` }, stress, margin, size: { width: w, depth: ta, length: L, pad: tb, pull },
    volume: 0, grams: 0, material: k.mat.name, printer: k.pr.name, findings: [], rests: [{ name: `${k.mat.name}.strength`, value: k.S }, ...(o.spool ? [] : [{ name: 'SERVICE_DEFAULTS.spool', value: sp, kind: 'estimate' }]), { name: 'SERVICE_DEFAULTS.pull', value: SERVICE_DEFAULTS.pull.value, kind: 'estimate' }] };
  weigh(m, spoolHolder(m, { printer: k.pr }), k.density);
  m.findings.push(fits ? finding('pass', `${sd.thread}x${fits.lengths[0]} ${head} into its slot nut through the ${mm(tb)} mm pad; it pulls about ${mm(pull)} N as the arm tips the pad about its edge (a lever estimate)`, 'fitting.screw', { values: { lengths: fits.lengths, pull } }) : finding('warn', `no ${sd.thread} ${head} screw sold engages its slot nut fully through the pad`, 'fitting.screw', { values: { pull } }));
  closingFindings(m, { S: k.S, sizeText: `an arm ${mm(L)} mm out from the face, ${mm(ta)} mm deep and ${mm(w)} mm wide, a ${lip} mm lip at its tip; the pad ${mm(tb)} mm thick`, marginText: `under ${m.load.what}, the arm's root bends to ${mm(stress)} MPa`, pose: 'on its side, its section the first layer' });
  return m;
}
/** A spool holder's solid: on its side to print, or fitted. @param {object} m @param {{ pose?: 'print' | 'fit', printer?: object, ops?: object }} [o] @returns {object} */
export function spoolHolder(m, o = {}) {
  if (m?.fitting !== 'spool-holder') throw new Error(`spoolHolder: give a spool holder's model (spoolHolderModel), not ${shown(m)}`);
  const pr = printerOf('spoolHolder', o.printer), g = sidePart({ loop: m.section, width: m.width, tongue: { at: 0, ...m.tongue }, holes: [{ thread: m.thread, y: 0, top: m.pad }], pr, ops: o.ops });
  return Object.assign(o.pose === 'fit' ? transform(sideToFit(m.width), g) : g, { model: m });
}

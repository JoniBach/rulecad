// A lamina whose frame is flooded: the mechanism is solved first on the ground you drew (a probe, kept between
// builds), the frame is what's left of the outline round the room the moving parts need, and the mechanism is
// solved again on it (lamina.mjs). Split from lamina.mjs.
import { ports } from './compose.mjs';
import { stage } from './cache.mjs';
import { lamina, timer } from './lamina.mjs';
import { AREA, TOUCH, OWN_ROUNDS, rad, mul, apply, shift, turn, empty, union, intersect, subtract, grow, shrink, area, apart, box, all, within } from './plane.mjs';

/**
 * A lamina whose frame is flooded: everything inside `flood.outline` is solid but the room the moving parts need (where
 * each body and flexure goes, through the whole sequence, grown by a clearance) and the spaces `flood.keep` holds open
 * (a disc's way out). A thin frame bends and spoils everything it holds; a flooded one is as stiff as the outline
 * allows, so the mechanism is all that moves. The moving parts are solved through the sequence first (with the ground
 * you draw: the blocks the flexures grow from), then the frame is what's left, slivers thinner than `least` and islands
 * that would print loose taken out, and your ground added back.
 * @param {object} spec a lamina spec, with flood: { outline?, keep?, clear?: number | Record<string, number>, least?, wall?,
 *   pad?, corner?, band?, holes?, posts? }: posts, shapes of the frame standing apart from it in the plane (a pin in a
 *   slot in what slides), kept though they are islands, for the frame's straps to join (bridges with strap: true); holes, [{ at, diameter, wall? }] through the frame for fasteners (pins holding plates
 *   either side), each in a solid boss `wall` thick (default half `wall`), checked to be all frame; band, solid only this far round the moving parts' room, the kept spaces and the outline's
 *   edge, the rest windows (a web: lighter, as stiff where it matters); outline, the frame's (default: everything the moving parts reach and `keep`, `wall` round it,
 *   corners rounded to `corner`); clear, the gap round the moving parts (the print gap; or by part, a sliding fit for
 *   what slides in a channel); pad, how far the solid round each flexure's root reaches (its roots are found: the part
 *   of it that never moves). spec.ground may then be left out
 */
export async function flooded(spec) {
  const { keep = [], least = 2, wall = 4, pad = 3, corner = 6 } = spec.flood, gap = spec.gap, clearOf = (n) => (typeof spec.flood.clear === 'object' ? spec.flood.clear[n] ?? spec.flood.clear.default ?? gap : spec.flood.clear ?? gap);
  // The mechanism solved through its sequence, on the ground you drew (or none: a speck far off, for the solver)
  const mine = all(spec.ground || []), far = [[[-1e4, -1e4], [-1e4 + 1, -1e4], [-1e4 + 1, -1e4 + 1], [-1e4, -1e4 + 1]]];
  const markF = timer('flood');
  // (only the frames are read of it: kept between builds by what the probe is made from, which no strap, guide or finish
  // is part of)
  const probeSpec = { ...spec, ground: empty(mine) ? far : mine, groundRounded: true, flood: undefined, fire: undefined, bridges: undefined, guides: undefined, finish: undefined, check: { ...(spec.check || {}), fe: false, frame: false } };
  const probe = await stage('flood probe', probeSpec, async () => { const r = await lamina(probeSpec); const frame = (fr) => ({ ...(fr.off != null ? { off: fr.off } : {}), parts: fr.parts }); return { planned: r.planned.map(frame), frames: r.planned === r.frames ? null : r.frames.map(frame) }; });
  if (probe.frames === null) probe.frames = probe.planned;
  markF('probe');
  const free = new Set(Object.keys(spec.free || {})), by = {};
  // The room: everything where it's meant to go, the kinematic frames (solved without a frame, the physics lets a body
  // tip anywhere its play allows: room cut round that would let it)
  for (const fr of probe.planned) for (const [n, o] of Object.entries(fr.parts)) if (n !== 'ground' && !free.has(n)) (by[n] ??= []).push(o);
  // and each flexure as it really bends, wherever its bodies are where they're meant to be (within the gap and a bit)
  if (probe.planned !== probe.frames) for (const fr of probe.frames) if (fr.off != null && fr.off <= Math.max(gap * 3, 2)) for (const [n, o] of Object.entries(fr.parts)) if (n !== 'ground' && !free.has(n) && !spec.bodies?.[n]) (by[n] ??= []).push(o);
  const swept = union(Object.entries(by).map(([n, os]) => grow(union(os), clearOf(n) * 1.05 + 0.02))); // (a little over: a round offset's segments cut its corners)
  // The outline: yours, or everything the moving parts reach and the spaces kept, a wall round it, its corners rounded
  let outline = spec.flood.outline ? all(spec.flood.outline) : null;
  if (!outline) {
    const { lo, hi } = box(union([swept, all(keep)])), r = Math.min(corner, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2);
    const square = [[[lo[0] - wall, lo[1] - wall], [hi[0] + wall, lo[1] - wall], [hi[0] + wall, hi[1] + wall], [lo[0] - wall, hi[1] + wall]]];
    outline = grow(shrink(square, r, 'Miter'), r);
  }
  // Each flexure's root: a block behind the face it grows from (its root port, facing back into the frame), `pad` deep
  // and as wide again either side, clear of every other moving part, so it grows from solid however the flood falls
  const kind = (j) => j.kind === 'curve' || OWN_ROUNDS.has(j.kind); // (these draw their own rounds)
  const roots = Object.entries(spec.joints || {}).filter(([, j]) => j.from === 'ground' && j.kind).map(([n, j]) => {
    const params = { ...j.params, width: j.params?.width ?? spec.height }, root = ports(j.kind, params).root, a = rad(j.angle || 0);
    const c = apply(mul(shift(j.at || [0, 0]), turn(a)), root.at), l = Math.hypot(root.dir[0], root.dir[1]) || 1;
    const u = [(Math.cos(a) * root.dir[0] - Math.sin(a) * root.dir[1]) / l, (Math.sin(a) * root.dir[0] + Math.cos(a) * root.dir[1]) / l], v = [-u[1], u[0]];
    const t = Math.max(...[params.thickness ?? params.neck ?? 1].flat()), w = pad + t + (params.fillet ?? 0) * 1.5;
    const block = [[[c[0] + v[0] * w, c[1] + v[1] * w], [c[0] + v[0] * w + u[0] * pad, c[1] + v[1] * w + u[1] * pad], [c[0] - v[0] * w + u[0] * pad, c[1] - v[1] * w + u[1] * pad], [c[0] - v[0] * w, c[1] - v[1] * w]]];
    const others = union(Object.entries(by).filter(([m]) => m !== n).map(([m, os]) => grow(union(os), clearOf(m) * 1.05 + 0.02)));
    const mirror = params.mirror != null ? [block[0].map(([x, y]) => [x, 2 * params.mirror - y]).reverse()] : []; // (a mirrored curve's other arm roots in its mirror image)
    // and its rounds: a quarter circle either side of it where it leaves the block's face, standing in its room
    const r = kind(j) ? 0 : params.fillet ?? 0, fillets = r > 0 ? [1, -1].map((sd) => {
      const at = (a, b) => [c[0] + v[0] * sd * a - u[0] * b, c[1] + v[1] * sd * a - u[1] * b], h = t / 2;
      const arc = Array.from({ length: 9 }, (_, i) => { const th = (Math.PI / 2) * (i / 8); return at(h + r - r * Math.cos(th), r - r * Math.sin(th)); }); // round from the leaf's side to the block's face
      const loop = [at(h, -pad / 4), at(h + r, -pad / 4), ...arc.slice().reverse()];
      const signed = loop.reduce((a, p, i) => { const q = loop[(i + 1) % loop.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
      return [signed < 0 ? loop.reverse() : loop]; // (anticlockwise)
    }) : [];
    return subtract(union([block, mirror, ...fillets]), others);
  });
  // Holes through the frame for fasteners (pins holding plates either side, should it ever need them): each in a solid
  // boss, a wall round it, that no window opens into
  const ring = ([x, y], r) => [Array.from({ length: 48 }, (_, i) => [x + r * Math.cos((2 * Math.PI * i) / 48), y + r * Math.sin((2 * Math.PI * i) / 48)])];
  const holes = (spec.flood.holes || []).map((h) => ({ ...h, hole: ring(h.at, h.diameter / 2), boss: ring(h.at, h.diameter / 2 + (h.wall ?? wall / 2)) }));
  const bosses = holes.length ? union(holes.map((h) => h.boss)) : [];
  let space = subtract(outline, union([swept, all(keep)]));
  // A web, not a slab: with `band`, solid only that far round the moving parts' room, the kept spaces and the
  // outline's edge; the rest opens up as windows, rounded (every rib a closed loop, so nothing hangs free)
  if (spec.flood.band > 0) {
    const band = spec.flood.band, rim = subtract(outline, shrink(outline, band, 'Round'));
    const web = intersect(space, union([grow(union([swept, all(keep)]), band), rim, bosses]));
    // (only windows worth having: one no wider than the band, a sliver between ribs, is left solid; the rest rounded)
    const windows = apart(subtract(space, web)).filter((w) => !empty(shrink(w, band / 2, 'Round'))).map((w) => grow(shrink(w, band / 2, 'Round'), band / 2));
    space = subtract(space, union(windows));
  }
  space = grow(shrink(space, least / 2, 'Round'), least / 2); // no sliver thinner than `least`
  // Only what's joined to the main frame, a root or your ground: an island (inside an arm's loop, a ring's hole) prints loose
  // (and its posts: pins of the frame's standing apart from it in the plane, each in a slot in what slides, joined to
  // it by the frame's straps over and under. They aren't the solver's ground, as yours is: the mechanism is solved, and
  // its room found, as if they weren't there, so adding one moves nothing else)
  const posts = all(spec.flood.posts || []);
  const anchors = union([mine, posts, ...roots]), bits = apart(space), biggest = Math.max(0, ...bits.map(area));
  const kept = bits.filter((b) => area(b) >= biggest - 1e-9 || area(intersect(b, grow(anchors, TOUCH))) > AREA);
  let ground = union([anchors, ...kept]);
  // Each hole's boss must be all frame: inside the outline, clear of the moving parts' room and anything kept open
  const holed = holes.map((h, i) => {
    const out = !empty(subtract(h.boss, outline)), open = !empty(intersect(h.boss, union([swept, all(keep)])));
    return { level: out || open ? 'fail' : 'pass', text: `hole ${i + 1} (⌀${h.diameter} at ${h.at.map((c) => +c.toFixed(1)).join(', ')}) ${out ? 'sticks out of the outline' : open ? 'breaks into the room the moving parts sweep' : `is in solid frame, ${+(h.wall ?? wall / 2).toFixed(2)} mm of wall round it`}`, code: 'lamina.holes', hole: i };
  });
  if (holes.length) ground = subtract(ground, union(holes.map((h) => h.hole)));
  markF('fill');
  const out = await lamina({ ...spec, flood: undefined, ground, groundRounded: true });
  markF('final');
  out.findings.unshift({ level: 'info', text: `the frame is flooded: ${area(ground).toFixed(0)} mm² solid, all but the room the moving parts sweep (${bits.length - kept.length} loose bits left out)`, code: 'lamina.flood' }, ...holed);
  return out;
}

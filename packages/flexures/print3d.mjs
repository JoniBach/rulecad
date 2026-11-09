// The print in 3D, for lamina.mjs: what's added over and under what moves, and cut back from it, so the flat
// mechanism prints in one piece and stays in its plane. Bridges and straps (the frame, or a body, printed over or under
// what moves, a gap off it), guides (a ridge in a groove, flanks at 45°) and pins (a post on a floor of its own body,
// capped). Each is a stage of lamina(): it reads the mechanism as solved, says what it finds through f, and hands back
// what it declares for the print (solidWith, plane.mjs) and the checks after it.
import { AREA, FRAMES, rad, mul, empty, union, intersect, subtract, grow, shrink, area, pieces, box, moved, all } from './plane.mjs';

// Bridges and straps: the frame (or a body) printed over or under what moves, and what passes them cut back. (From lamina(): it reads the mechanism as solved; what it declares goes back)
export function bridgesStage({ spec, f, height, inverse, parts, places, printer, reached, seq, solve, state }) {
  // ---- bridges: the frame printed over a moving part on the top layers (a barrel's roof over a stem, so it can't lift
  // out of its channel). Every body that passes under one is cut down by the bridge and a gap, along all of it that
  // ever passes under; the bridge spans no wider than the printer bridges, and stands on the frame both sides ----
  const layer = printer?.layer ?? 0.2, bridgeMost = printer?.bridge ?? 5;
  // (a bridge may belong to a moving body rather than the frame, `body`: a strap from it over or under another, to a post
  // of its own on the far side, a clevis; it moves with that body, and what passes it is cut back where it ever passes.
  // The frame may have straps too, `strap`: from the frame to a post of its own standing in a slot in what slides, over
  // it and under it, cut back the same way: a gap all round, flat under the upper, and over the lower a ceiling
  // slanting in from the walls at 45° (not arched along the travel as over a floor, which a long travel would stand
  // taller than the print)
  const bridges = [spec.bridges || []].flat().map((b) => ({ shape: all(b.shape), depth: b.depth ?? layer * 6, gap: b.gap ?? layer * 3, bottom: b.side === 'bottom', owner: b.body ?? 'ground', strap: !!b.body || !!b.strap }));
  for (const br of bridges) if (!parts[br.owner] || parts[br.owner].kind === 'flexure') throw new Error(`a bridge's body "${br.owner}" is not the ground or a body`);
  const arches = []; // a floor strip's: the parts passing over it arched up at 45°, which prints without support
  const guidesHeld = []; // what guides hold across the plane
  const cuts = [];
  if (bridges.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    bridges.forEach((br, i) => {
      const own = br.owner, onBody = own !== 'ground', mine = parts[own].shape, whose = onBody ? own : 'the frame';
      const name = br.strap ? `${onBody ? `${own}'s` : "the frame's"} ${br.bottom ? 'lower' : 'upper'} strap` : br.bottom ? `floor ${i + 1}` : `bridge ${i + 1}`, left = height - br.depth - br.gap;
      // (what it crosses: off its own; a body's strap rests on what it passes over, a support gap up, so only open air is spanned)
      const under = subtract(br.shape, onBody ? union(Object.values(parts).map((x) => x.shape)) : mine);
      if (empty(subtract(br.shape, mine))) { f('warn', `${name} has nothing to cross: it's all on ${whose}`, 'lamina.bridge'); return; }
      if (!br.bottom) { // (a floor stands on the bed: it spans nothing)
        const wide = !empty(under) && !empty(shrink(under, bridgeMost / 2 + 0.01, 'Round'));
        f(wide ? 'fail' : 'pass', `${name} spans ${wide ? 'more than' : 'no more than'} the ${bridgeMost} mm the printer bridges`, 'lamina.bridge', { bridge: i });
      }
      const feet = pieces(intersect(br.shape, mine));
      const need = br.bottom && !br.strap ? 1 : 2; // (a floor is printed on the bed: a ledge off the frame on one side is held; a bridge must stand on both, and a strap joins its body, or the frame, to its post)
      f(feet >= need ? 'pass' : 'fail', `${name} stands on ${whose} ${feet >= 2 ? 'on both sides' : feet ? (br.bottom ? 'on one side, a ledge on the bed' : 'on one side only: it would droop') : br.bottom ? 'nowhere: it would come loose' : 'nowhere: it would print in mid-air'}`, 'lamina.bridge', { bridge: i });
      for (const [n, p] of Object.entries(parts)) {
        if (p.kind === 'flexure' && area(intersect(br.shape, p.shape)) > AREA) f('fail', `${name} is over the ${n} flexure: a bridge goes over what slides, not what bends`, 'lamina.bridge', { bridge: i, joint: n });
        if (n === own || (p.kind !== 'body' && !(onBody && n === 'ground'))) continue;
        // all of it that ever passes under, where it is at rest, and for a strap a gap round it in the plane too: a
        // strap narrower than what it passes would otherwise print touching the walls left either side of it (a frame's
        // floor or bridge needs none: what passes is arched or cut clear of it, and a wider arch would stand taller)
        const swept = union(poses.map((P) => moved(mul(inverse(P[n]), P[own]), br.shape)));
        const pocket = br.strap ? grow(swept, br.gap) : swept, cut = intersect(p.shape, pocket);
        if (empty(cut)) continue;
        if (br.strap && br.bottom) { // (a lower strap: what passes over it is cut back, a gap over it, and prints on it a support gap up, as a pin's ring does on its floor)
          const top = br.depth + br.gap;
          cuts.push({ shape: cut, from: 0, to: top, body: n, gap: br.gap, bottom: true, ...(onBody ? { owner: own } : {}) });
          // Its ceiling isn't flat: either side of the slot that would be a ledge hanging in the air over the strap,
          // each layer a string drooping onto it. From the pocket's walls it slants in at 45°, a layer in for each
          // layer up (a hip roof, no taller than the pocket is wide), so every layer stands on the one below
          let rise = 0;
          for (let k = 0; ; k++) {
            const s = intersect(p.shape, shrink(pocket, (k + 1) * layer));
            if (empty(s)) break;
            cuts.push({ shape: s, from: top + k * layer, to: top + (k + 1) * layer });
            rise = (k + 1) * layer;
          }
          f(height - top >= 2 * layer * 5 ? 'pass' : 'fail', `${name}: ${n} passes over it, cut up to ${top.toFixed(2)} mm there, its ceiling slanting in at 45° from the walls to ${(top + rise).toFixed(2)} mm`, 'lamina.bridge', { bridge: i, body: n, left, rise });
          continue;
        }
        if (!br.bottom) {
          cuts.push({ shape: cut, from: left, to: height, body: n, gap: br.gap, ...(onBody ? { owner: own } : {}) });
          f(left >= 2 * layer * 5 ? 'pass' : 'fail', `${name}: ${n} passes under it, cut down to ${left.toFixed(2)} mm there (the bridge ${br.depth.toFixed(2)} mm, a gap of ${br.gap.toFixed(2)} mm over it)`, 'lamina.bridge', { bridge: i, body: n, left });
          continue;
        }
        // Over a floor: the part's underside arched up over all of it that ever passes over, the arch's flanks at 45°
        // along the way it moves (so each layer overhangs the one below by no more than it rises), high enough over
        // the whole stretch
        const T = poses.reduce((a, P) => { const d = Math.hypot(P[n][2], P[n][5]); return d > a.d ? { d, u: [P[n][2] / d, P[n][5] / d] } : a; }, { d: 0, u: [1, 0] });
        const turned = poses.some((P) => Math.abs(Math.atan2(P[n][3], P[n][0])) > rad(1));
        if (turned) { f('fail', `${name}: ${n} turns as it passes over it: a floor's arch is for what slides`, 'lamina.bridge', { bridge: i, body: n }); continue; }
        const u = T.u, along = cut.flat().map(([x, y]) => x * u[0] + y * u[1]), lo = Math.min(...along), hi = Math.max(...along), clear = br.depth + br.gap;
        const apex = clear + (hi - lo) / 2;
        arches.push({ body: n, shape: intersect(p.shape, grow(cut, clear + 0.5)), u, lo: lo - clear, hi: hi + clear, apex, gap: br.gap });
        f(height - apex >= 2 ? 'pass' : 'fail', `${name}: ${n} passes over it, its underside arched up to ${apex.toFixed(2)} mm at 45° (${clear.toFixed(2)} mm clear over the floor all along), leaving ${(height - apex).toFixed(2)} mm above`, 'lamina.bridge', { bridge: i, body: n, apex });
      }
    });
  }

  return { layer, bridgeMost, bridges, arches, guidesHeld, cuts };
}

// Guides: a ridge on what slides in a groove of the frame, flanks at 45°. (From lamina(): it reads the mechanism as solved; what it declares goes back)
export function guidesStage({ spec, f, gap, guidesHeld, height, inverse, layer, parts, places, reached, seq, solve, state }) {
  // ---- guides: where a body slides through a strip of the frame, a ridge on its sides with 45° flanks, centred on
  // the print's height, runs in a matching groove in the frame's wall (a tortoise's shell in its socket), so it can't
  // lift or tip out of the plane. Both are drawn out from the same faces by the same amount at each height, so the gap
  // between them is the gap in the plane; each flank overhangs at 45° and prints without support ----
  const guides = [spec.guides || []].flat().map((x) => ({ body: x.body, shape: all(x.shape), depth: x.depth ?? Math.min(1.5, height / 4) }));
  const layers = []; // slabs added to and cut from the print: { from, to, add?, cut? }
  if (guides.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    guides.forEach((gd, i) => {
      const n = gd.body, body = parts[n]?.shape;
      if (!body || parts[n].kind !== 'body') { f('fail', `guide ${i + 1}: no body "${n}" to guide`, 'lamina.guide'); return; }
      const mine = intersect(body, union(poses.map((P) => moved(inverse(P[n]), gd.shape)))); // all of the body that ever passes through the strip, at rest
      if (empty(mine)) { f('fail', `guide ${i + 1}: ${n} never passes through it`, 'lamina.guide'); return; }
      const sweptAll = (a) => union(poses.map((P) => moved(P[n], a)));
      const away = (a) => subtract(a, body); // (what's drawn out from the body's faces, not the body)
      // A slab a layer: on the printer's layers, so each layer steps out (or in) by no more than a layer, 45°
      for (let k = Math.floor((height / 2 - gd.depth) / layer); k * layer < height / 2 + gd.depth; k++) {
        const z0 = k * layer, z1 = z0 + layer, v = Math.max(0, gd.depth - Math.abs((z0 + z1) / 2 - height / 2));
        if (v < 0.01) continue;
        const ridge = intersect(away(grow(body, v)), grow(mine, v)); // the body's sides there, drawn out by v
        const groove = intersect(parts.ground.shape, grow(sweptAll(ridge), gap * 1.05 + 0.02)); // the frame cut back to clear the ridge wherever it goes (not only in the strip: the ridge runs on past it)
        layers.push({ from: z0, to: z1, add: ridge }, { from: z0, to: z1, cut: groove });
      }
      const span = box(mine);
      f('pass', `guide ${i + 1}: ${n} runs in it for ${(span.hi[0] - span.lo[0]).toFixed(1)} mm with a ${gd.depth.toFixed(2)} mm ridge in a groove, flanks at 45°: held across the plane`, 'lamina.guide', { guide: i, body: n });
      guidesHeld.push({ body: n, shape: mine });
    });
  }

  return { guides, layers };
}

// Pins: each post on a floor of its own body, capped, and what turns on it cut back. (From lamina(): it reads the mechanism as solved; what it declares goes back)
export function pinsStage({ spec, f, gap, height, inverse, joined, parts, pinsOf, places, printer, reached, ring, seq, solve, state }) {
  // ---- pins: each post stands on a floor of its own body (`under`, from the bed up `base`) that runs under the body
  // it carries, and is capped at the top by a cone flaring out at 45° over the hole's rim (prints without support).
  // The carried body is cut back from the floor, a lift over it, wherever it ever passes over, and from the cap a lift
  // under it: it breaks free with a twist, and can't lift off the post ----
  const pinWork = [];
  if (pinsOf.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    for (const P of pinsOf) {
      const post = ring(P.at, P.r), mine = subtract(parts[P.from].shape, grow(post, 0.01));
      const joined = P.under && area(intersect(P.under, grow(post, 0.05))) > AREA && area(intersect(P.under, mine)) > AREA;
      f(joined ? 'pass' : 'fail', `${P.joint}: its pin (${(2 * P.r).toFixed(1)} mm, ${P.c.toFixed(2)} mm round it) ${joined ? `stands on a floor ${P.base.toFixed(2)} mm thick that joins it to ${P.from} under ${P.to}` : `isn't joined to ${P.from}: give it a floor (pin.under) from the post to ${P.from}, under ${P.to}`}`, 'lamina.pin', { joint: P.joint });
      if (P.c < (printer?.fit ?? gap) - 1e-9) f('warn', `${P.joint}: ${P.c} mm round the pin is under the printer's fit: it may print onto the post`, 'lamina.pin', { joint: P.joint });
      const left = height - P.base - 2 * P.lift - P.lip;
      f(left >= height / 2 ? 'pass' : 'fail', `${P.joint}: ${P.to} turns on it ${left.toFixed(2)} mm tall (the floor and the cap take the rest)`, 'lamina.pin', { joint: P.joint, left });
      const floorCut = P.under ? intersect(parts[P.to].shape, union(poses.map((T) => moved(mul(inverse(T[P.to]), T[P.from]), P.under)))) : [];
      pinWork.push({ at: P.at, r: P.r, c: P.c, lip: P.lip, lift: P.lift, base: P.base, under: P.under ? subtract(P.under, parts.ground.shape) : [], floorCut });
    }
  }

  return { pinWork };
}

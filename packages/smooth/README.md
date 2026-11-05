# @rulecad/smooth

Autorouted circuit-board tracks, pulled tight. An autorouter searching a grid leaves wiggles, small detours, hooks and
places where a track doubles back on itself. `smooth()` straightens them:
- **Pulling tight:** along each track, it joins each point it keeps straight to the farthest point after it that it can
  reach with clearance, and drops the bend points in between. It repeats until nothing changes.
- **Sharp bends:** a bend sharper than a right angle (a hook, or a spike out and back) is cut across, as far back as the
  cut keeps its clearance.
- **Never worse:** a new straight run must keep its clearance from all other copper, holes and the board's edge, or at
  least come no closer to anything than the stretch it replaces already did. So a track the router packed in tight can
  still be tidied, and nothing ends up closer than before.

A track's ends and vias stay exactly where they were, so it still starts and finishes on the same pads and changes
layer in the same places. Tracks you don't pass in are never moved, only kept clear of. No dependencies.

**Lead-ins:** a track may carry on from copper you keep, such as a stub of an earlier board's routing. Pass it as the
track's `leads` (`{ start, end }`, points from the stub's root to the track's end). Where the track turns straight back
on it, it is cut back to where the track can leave cleanly, never into its first segment. `trimmed` then says what's
left of it, so you can shorten that copper to match.

```js
import { smoothCircuit } from '@rulecad/smooth';

// Circuit JSON (tscircuit's board format): pick the tracks that may change
const { json, changed, dropped, trimmed } = smoothCircuit(circuitJson, { movable: (trace) => trace.autorouted, clearance: 0.15, leads });
```

- **Clearance:** copper to copper is `clearance` (default: the board's `min_trace_to_pad_edge_clearance`, else 0.1 mm).
  Holes keep `min_trace_to_hole_edge_clearance` (0.2 mm) from their edge. The board's edge keeps
  `min_board_edge_clearance` (0.2 mm), measured to the outline, or to the board's rectangle.
- **Nets:** copper of a track's own net isn't in its way. Nets come from the board's source traces.
- **What's in the way:** pads (rectangles, turned rectangles, circles, pills, polygons), plated holes and their pads,
  vias, mounting holes (with `rulecad_keepout`, a screw head's room, from the centre), and every other track.
- **Runs:** a track is pulled tight one run at a time. A run is the points on one layer at one width, so a via or a
  necked-down stretch stays where it is.
- **Result:** `json` is a copy with the changed tracks replaced. `routes` maps each changed track's `pcb_trace_id`
  to its new route.

For any other board description, `smooth(tracks, obstacles, { clearance, outline, edge })` does the geometry:
`tracks` are `{ route, net }`, and `obstacles` are `{ layer, net, shape }`. A `shape` is `{ circle: { x, y, r } }`,
`{ capsule: { a, b, r } }` or `{ polygon: [{ x, y }, ...] }`. The layer may be `'*'` for every layer, and an
optional `clear` overrides the clearance.

The straight runs can be at any angle; they aren't snapped to 45°. Check the board again after smoothing, as with any
change to copper. `@rulecad/pcb` does that itself: with `smooth: true`, it smooths the router's tracks, and puts back
any track the design checks then find in a new error.

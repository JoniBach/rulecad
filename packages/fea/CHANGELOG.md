# Changelog: @rulecad/fea

What changed in each release, for someone upgrading a workspace.

## Unreleased: frame layout optimisation

### Added

- `@rulecad/fea/layout`, a new entry: `layout(problem)` finds the least-volume pin-jointed frame that carries the
  loads to the supports, choosing members from every pair of candidate nodes (a ground structure) and giving each its
  area. It solves the plastic layout programme by an interior point method and adds members a few at a time where
  the solution's virtual strains say they would help (Gilbert and Tyas 2003), so it proves the least volume over
  every candidate while holding a small share of them. Several load cases share one set of areas; strengths may
  differ in tension and compression; a joint can be given a cost as a length of member (fewer, longer members);
  balls can be kept clear of nodes and members, or of nodes only (`through`, a wheel the stays straddle). Flat
  layouts (every node and load at z = 0) and layouts in space.
- `groundStructure(nodes)` (the candidates, less members through a third node) and `nodeGrid({ from, to, pitch })`.
- `layoutFrame(result, { material })`: the layout as a frame of beams with its load cases, for `sizing` to pick each
  member from tubes that can be bought. `layoutJoints(result, { material })`: each joint as a problem file for the
  voxel optimiser, the members as stubs carrying their forces in each case (the layout's, or the sized frame's).
- Refused by name (`fea.layout.input`, `node`, `support`, `load`, `strength`) before any maths, and
  `fea.layout.unstable` when the programme has no answer. A load may name its node by number, as nodes given as a list
  are named by place.
- The interior point method stops at a relative error of 1e-9 in equilibrium, the members' limits and the gap; where
  rounding stalls it short of that (some problems in space with several cases), it keeps its best point and answers
  if that point is within 1e-6, so a solvable problem is not refused as unstable.

## 0.2.11: frames held, sized and their modes said (Frames 3)

### Added

- `frame(model, { loose: 'hold' })` holds each way a frame could move that nothing resists and its loads do not push,
  names it in `frame().loose`, and refuses a solve whose loads would move the frame that way. The default is unchanged.
- Modes and buckling on a held frame count the held ways as free: a way the frame moves mass with nothing resisting is
  a 0 Hz mode marked `free`, and a frame its squeezed members lean further over tips at factor 0 (`tipped`).
- `sizing()`: the lightest section for each group of members that meets limits on deflection, stress, buckling and
  frequency in every load case, by trying every design where there are few, else by steps; each group says the limit
  that set it.

# Changelog: @rulecad/fea

What changed in each release, for someone upgrading a workspace.

## Unreleased

### Added

- `frame().mechanisms`: for each freedom a held frame (`loose: 'hold'`) holds, the way the frame moves there with
  nothing resisting, as each node's six, so a caller can say how it moves (a portal tipping over out of its plane)
  rather than name a freedom at a node.
- `sizing({ fits })`: a function of each group's choice that lists what does not go together (a join one profile
  cannot make with another). Designs that do not fit are never solved; a group whose next lighter choice does not fit
  says so (`governs.limit: 'fit'`, with where and why); none fitting is refused (`fea.frame.fit`).
- `sizing` cases take their own `gravity` (a side push alone) and `limits` (the limits they are held to), and a
  deflection limit takes `cases`, the load cases it holds in: a racking sway held under a push alone.

## 0.2.11: frames held, sized and their modes said (Frames 3)

### Added

- `frame(model, { loose: 'hold' })` holds each way a frame could move that nothing resists and its loads do not push,
  names it in `frame().loose`, and refuses a solve whose loads would move the frame that way. The default is unchanged.
- Modes and buckling on a held frame count the held ways as free: a way the frame moves mass with nothing resisting is
  a 0 Hz mode marked `free`, and a frame its squeezed members lean further over tips at factor 0 (`tipped`).
- `sizing()`: the lightest section for each group of members that meets limits on deflection, stress, buckling and
  frequency in every load case, by trying every design where there are few, else by steps; each group says the limit
  that set it.

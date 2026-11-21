# Changelog: @rulecad/fea

What changed in each release, for someone upgrading a workspace.

## 0.2.11: frames held, sized and their modes said (Frames 3)

### Added

- `frame(model, { loose: 'hold' })` holds each way a frame could move that nothing resists and its loads do not push,
  names it in `frame().loose`, and refuses a solve whose loads would move the frame that way. The default is unchanged.
- Modes and buckling on a held frame count the held ways as free: a way the frame moves mass with nothing resisting is
  a 0 Hz mode marked `free`, and a frame its squeezed members lean further over tips at factor 0 (`tipped`).
- `sizing()`: the lightest section for each group of members that meets limits on deflection, stress, buckling and
  frequency in every load case, by trying every design where there are few, else by steps; each group says the limit
  that set it.

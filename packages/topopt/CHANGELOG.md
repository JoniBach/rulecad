# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

## 0.3.2: stress-limited optimisation
### Added

- `strain`: a strain limit in place of `stress` (0.02 is 2%), times the material's E. Both at once is refused.
- A mechanism (a problem with an `output`) given a stress or strain limit is optimised as before, then checked at its
  input force: `result.stress` gives its peak (MPa, in cells at least half solid), the limit, and the input force and
  output travel that take the peak to the limit (the part is linear, so both scale with the force). With `strain`, the
  peak and limit as strains too. Optimising a mechanism under the limit is still to come.

### Changed

- A problem's `volume` is optional in its type, as it already was with a stress limit.

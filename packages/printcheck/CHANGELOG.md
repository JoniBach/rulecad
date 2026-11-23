# Changelog: @rulecad/printcheck

What changed in each release, for someone upgrading a workspace. Releases before this file was started are described
in their pull requests on GitHub.

## Unreleased

### Changed

- `check` with many parts is far faster: whether a face rests on another part is found from the faces filed on a 2 mm
  grid across the bed, not from every face of every part. A gearbox printed in place (six parts, about 340,000 faces)
  went from over ten minutes to 44 s. Every finding is the same (#162).

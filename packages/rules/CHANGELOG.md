# Changelog: @rulecad/rules

What changed in each release, for someone upgrading a workspace. A rule set's **values** are the figures designs
read (`m3.clearance`, `x1c.hole_comp`). Each release says whether any value changed, and why.

## Next release: old thread names kept and checked (Fixings 3)

The version number is set when the release is published.

### What reads fixings now

This package holds data only and reads nothing. Its thread sets (`m1_6` to `m12`, `unc_4_40` to `unc_3_8_16`) are what
`@rulecad/fixings` reads for every screw in the kit, so through fixings they now size every screw hole in cad's
designs (`v.fixings`), motors' mounts and pcb's board holes.

### Changed

- A test holds that every thread name a design in the repository reads (its examples, the create-rulecad templates
  and machines, and cad's worked examples) is in the kit's set, that each old name is the vocabulary's own name for
  its figure, and that each alias a set lists in `"interface"` (`screw_clearance` is `clearance`) names a vocabulary
  field and a rule the set has.
- The README says which names designs read stay, and what happens to a workspace's own copy of a set after an
  upgrade: it is read as it is, and `cad rules check m3` lists what the kit's set has that the copy lacks.

### Values that changed

None. No rule's value, unit or kind changed in this release.

### What a workspace should change

- A workspace that keeps its own copy of a thread set (`rules/m3.json`, made before the sets were widened) keeps
  working, and reads its copy first. Run `npx cad rules check` to see what the kit's set has that the copy lacks (a
  pilot, nut flats, insert hole, sold lengths): copy those across, or delete the copy to read the kit's. A copy that
  holds only some figures makes a design read its clearances from the copy and its pilots and lengths from the kit,
  so a later kit release could move a printed part without the copy changing.

# Changelog: @rulecad/variables

What changed in each release, for someone upgrading a workspace.

## Unreleased

### Added

- `checkRuleSet` holds a rule's range to its value: `low` at most it, `high` at least it, both numbers (`rules.range`).

## 0.3.5: points in a rule set

### Added

- A vocabulary field may be `points` (so many numbers each, one after another), and a rule set's list is checked to
  hold whole points.


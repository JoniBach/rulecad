# Changelog: @rulecad/variables

What changed in each release, for someone upgrading a workspace.

## 0.3.7: range ends in expressions
### Added

- An expression reads either end of a rule's range: `pa_cf.strength.low`, `pa_cf.strength.high`, in the rule's unit.
  An end the rule does not give is refused by name (`var.range`). Names with two dots that are not `low` or `high` are
  refused as before. No value read by an existing name changes.

## 0.3.6: material ranges
### Added

- `checkRuleSet` holds a rule's range to its value: `low` at most it, `high` at least it, both numbers (`rules.range`).

## 0.3.5: points in a rule set

### Added

- A vocabulary field may be `points` (so many numbers each, one after another), and a rule set's list is checked to
  hold whole points.


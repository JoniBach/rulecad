# Changelog: @rulecad/gears

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a gear's tip diameter, a tooth's thickness). Each release says whether any printed size moved, and why.
Releases before this file was started are described in their pull requests on GitHub.

## 0.3.3: no import loops (#278)

### Fixed

- Loaders without cycle support, such as the JSCAD web app's, now load this package. Its modules imported each other
  in a loop (issue #278): Node links such a loop and runs it, but a loader that caches a module only once it has run
  loads it again and again until the stack runs out (`RangeError: Maximum call stack size exceeded / failed loading
  module ...`).
- The code the other modules share moved from `gears.mjs` to a new `core.mjs`, which `planetary.mjs`, `contact.mjs`,
  `tooth.mjs`, `worm.mjs` and `diagram.mjs` import. `gears.mjs` now only re-exports. Every export keeps its name and
  behaviour, and no printed size moved.

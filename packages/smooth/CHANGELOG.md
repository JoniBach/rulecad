# Changelog: @rulecad/smooth

What changed in each release, for someone upgrading a workspace. Releases before this file was started are
described in their pull requests on GitHub.

## Unreleased

### Fixed

- Loaders without cycle support, such as the JSCAD web app's, now load this package. Its modules imported each other
  in a loop (issue #278): Node links such a loop and runs it, but a loader that caches a module only once it has run
  loads it again and again until the stack runs out (`RangeError: Maximum call stack size exceeded / failed loading
  module ...`).
- The code `finish.mjs` builds on moved from `smooth.mjs` to a new `core.mjs`. `smooth.mjs` now only re-exports. Every
  export keeps its name and behaviour.

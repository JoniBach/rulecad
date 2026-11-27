---
title: dot-files are not a package's sources
bump: patch
---
### Fixed

- cad's build keys read every module of its helper packages, and so also a scratch module another package's tests write beside them for a moment (the fixings README test's `.readme-example-<n>.mjs`). Run in parallel, as CI runs the packages' tests, cad could list it and then fail to read it once deleted (ENOENT, seen on Windows twice). Dot-files are now left out, in the build key, the gears' key and the board engine's. Builds miss the cache once (this code is part of its key). No printed size changes.

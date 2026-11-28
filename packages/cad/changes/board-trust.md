---
title: board designs, and designs in a workspace held in memory, ask for trust before they run outside the sandbox
bump: minor
---
### Changed

- A board design (an object whose JSON says `"engine": "pcb"`) runs in the tool's own process, with the board engine, not in the design sandbox. A workspace with one is now asked about once: `cad check`, `cad preview` and the rest stop with a message naming the object file and its `engine` field until you run `cad trust` in the workspace, which lists and records "board designs run outside the sandbox". Before, a cloned board workspace ran its designs' code on its first command, and `cad trust` said there was nothing to trust.
- A workspace held in memory (`memoryHost`) has no sandbox, so `build` now runs its designs only when called with `{ trusted: true }`; without it, it refuses with the `workspace.untrusted` code. No shipped command uses `memoryHost`.
- Upgrading: run `cad trust` once in every workspace with board designs (the thin-picro example, your keyboards), and in its CI, or set `CAD_TRUST=1` there. Code that builds through `memoryHost` passes `{ trusted: true }` to `build` for designs it trusts. No printed size changes.

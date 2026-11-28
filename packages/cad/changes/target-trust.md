---
title: every target but the kit's own is asked about
bump: patch
---
### Fixed

- A target in cad.config.json is now the kit's own only when its name is exactly one of the kit's (today only `gist`). Every other name is the workspace's own code, run in the tool's process, and is asked about with `cad trust` first, whatever it looks like: a bare name (`"show": "show"`), a backslash path, or a `../` name that reaches one of the kit's modules. Before, those ran in a cloned workspace on its first `cad show` or `cad link --md` with nothing asked. A target outside the workspace's folder is refused even once trusted: put the module in the workspace and name it from there.
- Upgrading: a workspace whose own target is named without a slash or extension is asked for `cad trust` once; after that it runs as before. Workspaces using `gist` change nothing. No printed size changes.

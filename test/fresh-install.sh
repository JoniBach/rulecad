#!/bin/bash
# The packages as a stranger gets them: packed, installed into an empty project with no lockfile (npm resolves every
# dependency afresh, which rulecad's own lockfile hides), then used: a design checked, the board engine loaded.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
for p in "$ROOT"/packages/*/; do npm pack -s "$p" --pack-destination "$WORK" >/dev/null; done
cd "$WORK" && npm init -y >/dev/null && npm pkg set type=module
npm install --silent --no-audit --no-fund ./rulecad-*.tgz ./create-rulecad-*.tgz @jscad/modeling
node -e "import('@rulecad/pcb').then(() => import('@tscircuit/checks')).then(() => console.log('board engine and its checks load'))"
node "$WORK/node_modules/create-rulecad/index.mjs" project --no-install >/dev/null
cd project && ln -s "$WORK/node_modules" node_modules
npx cad check home/soap-tray | tail -2

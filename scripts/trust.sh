#!/bin/bash
# One time, for each package: let npm accept publishes from .github/workflows/publish.yml (trusted publishing). Run it
# yourself in a terminal: npm asks you to approve in the browser (two-factor). Then releases need no terminal at all.
# A new package needs it too, after its first publish.
#   scripts/trust.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for dir in packages/*/; do
  name="$(node -p "require('./${dir}package.json').name")"
  echo "== $name"
  npm trust github "$name" --file publish.yml --repo JoniBach/rulecad --allow-publish --yes
done
npm trust list @rulecad/cad

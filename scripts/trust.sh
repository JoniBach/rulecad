#!/bin/bash
# One time, for each package: let npm accept publishes from .github/workflows/publish.yml (trusted publishing), from its
# publish job only (the one that runs in the GitHub environment npm-publish, holding no other rights). Run it
# yourself in a terminal: npm asks you to approve in the browser (two-factor), once per package, so let each finish
# before answering the next. Then releases need no terminal at all. A new package needs it too, after its first
# publish (scripts/first-publish.sh does both).
#   scripts/trust.sh                 every package
#   scripts/trust.sh smooth viewer   just these (folder names under packages/)
# A package that is already trusted answers E409: that is fine, and the script carries on to the next. To move a package
# trusted before the environment was named onto it, remove its old entry first (npm trust list <name> shows its id,
# then npm trust revoke <name> --id=<id>) and run this for it again.
set -uo pipefail
cd "$(dirname "$0")/.."
if [ "$#" -gt 0 ]; then dirs="$*"; else dirs="$(ls packages)"; fi
refused=""
for dir in $dirs; do
  if [ ! -f "packages/$dir/package.json" ]; then echo "no package in packages/$dir" >&2; exit 1; fi
  name="$(node -p "require('./packages/$dir/package.json').name")"
  private="$(node -p "!!require('./packages/$dir/package.json').private")"
  if [ "$private" = "true" ]; then continue; fi
  echo "== $name"
  if ! npm trust github "$name" --file publish.yml --repo JoniBach/rulecad --environment npm-publish --allow-publish --yes; then refused="$refused $name"; fi
done
echo
if [ -n "$refused" ]; then
  echo "npm answered with an error for:$refused"
  echo "E409 above means that package is already trusted, which is what you want. Anything else needs a look."
else
  echo "Every package named is trusted."
fi

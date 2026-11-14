#!/bin/bash
# A package npm has never seen can't be published by the release workflow: npm only trusts a workflow for a package
# that already exists. This publishes each such package once from your terminal and then trusts the workflow for it,
# so every later release needs no terminal. npm asks you to approve in the browser (two-factor) for each step: let
# each finish before answering the next.
#   scripts/first-publish.sh                  every package that isn't on npm yet
#   scripts/first-publish.sh fixings frames   just these (folder names under packages/)
#   scripts/first-publish.sh --dry-run        say what it would publish, and publish nothing
# A package that is already on npm is left alone. Publish a package before the ones that depend on it.
set -euo pipefail
cd "$(dirname "$0")/.."
dry=""; dirs=""
for a in "$@"; do if [ "$a" = "--dry-run" ]; then dry="yes"; else dirs="$dirs $a"; fi; done
if [ -z "$dirs" ]; then dirs="$(ls packages)"; fi

new=""
for dir in $dirs; do
  if [ ! -f "packages/$dir/package.json" ]; then echo "no package in packages/$dir" >&2; exit 1; fi
  name="$(node -p "require('./packages/$dir/package.json').name")"
  private="$(node -p "!!require('./packages/$dir/package.json').private")"
  if [ "$private" = "true" ]; then continue; fi
  if npm view "$name" name >/dev/null 2>&1; then echo "$name is on npm already: left alone"; else new="$new $dir"; fi
done
if [ -z "$new" ]; then echo "Nothing new to publish."; exit 0; fi
if [ -n "$dry" ]; then
  for dir in $new; do echo "would publish $(node -p "const p = require('./packages/$dir/package.json'); p.name + '@' + p.version") and trust the workflow for it"; done
  exit 0
fi

node scripts/types.mjs >/dev/null # the declarations each package ships, which are never committed
for dir in $new; do
  name="$(node -p "require('./packages/$dir/package.json').name")"
  echo "== $name: first publish"
  npm publish --workspace "packages/$dir" --access public
done
# shellcheck disable=SC2086
scripts/trust.sh $new
echo
echo "Now on npm:"
for dir in $new; do
  name="$(node -p "require('./packages/$dir/package.json').name")"
  echo "  $name $(npm view "$name" version 2>/dev/null || echo '(not found: look above)')"
done
echo "Later releases go out through the workflow: bump a version, merge, done."

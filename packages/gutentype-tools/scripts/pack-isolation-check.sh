#!/usr/bin/env bash
# ISC-26: adding a pack touches no file outside the content package.
#
#   bash packages/gutentype-tools/scripts/pack-isolation-check.sh
#
# Adds a dummy Spanish pack (packs/es plus a regenerated lib/generated.ts) inside packages/gutentype-content,
# loads it through the public package APIs, and checks that git sees no change anywhere outside
# packages/gutentype-content. Everything it added is removed again on exit, pass or fail.
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"
content="packages/gutentype-content"
tools="packages/gutentype-tools"

if [ -e "$content/lib/packs/es" ]; then
  echo "FAIL $content/lib/packs/es already exists; refusing to overwrite it" >&2
  exit 1
fi

outside() { git status --porcelain --untracked-files=all -- . ":(exclude)$content" | sort; }

before="$(outside)"
backup="$(mktemp)"
cp "$content/lib/generated.ts" "$backup"
cleanup() {
  rm -rf "$content/lib/packs/es"
  cp "$backup" "$content/lib/generated.ts"
  rm -f "$backup"
}
trap cleanup EXIT

bun "$tools/lib/pack-isolation.ts" add
echo "added: $(git status --porcelain --untracked-files=all -- "$content" | tr '\n' ' ')"
bun "$tools/lib/pack-isolation.ts" check

after="$(outside)"
if [ "$before" != "$after" ]; then
  echo "FAIL files outside $content changed:" >&2
  diff <(echo "$before") <(echo "$after") >&2 || true
  exit 1
fi
echo "PASS no file outside $content changed"

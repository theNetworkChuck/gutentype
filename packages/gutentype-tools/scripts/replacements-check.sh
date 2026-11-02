#!/usr/bin/env bash
# ISC-74: Keybr files reach Gutentype only through webpack's module-replacement rule, and the bundle carries the
# replacements. For every packages/gutentype-*/keybr-replacements.json ({"<Keybr path>": "<Gutentype path>"}):
#   - both paths exist (an upstream rename or a moved Gutentype file fails here, not silently in the bundle),
#   - each Gutentype module names a marker, `displayName = "<marker>"` or `replacementMarker = "<marker>"` (a
#     property assignment or a used string survives minification; a comment does not),
#   - a production build (`bun run build`, output root/public/assets) contains every marker,
#   - thin-fork-check.sh still reports the expected count of modified upstream files and no errors.
# Usage: replacements-check.sh [--no-build]   (--no-build checks the existing root/public/assets)
set -euo pipefail
repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$repo"

# ISC-2's count of modified upstream source files (README included) since the Typing Test and Profile swaps landed.
# A change to fork.json's "modified" list changes this number with it.
expected_modified=14
assets="root/public/assets"
errors=0
fail() {
  echo "FAIL: $*" >&2
  errors=$((errors + 1))
}

shopt -s nullglob
files=(packages/gutentype-*/keybr-replacements.json)
shopt -u nullglob
if [[ ${#files[@]} -eq 0 ]]; then
  echo "FAIL: no packages/gutentype-*/keybr-replacements.json found" >&2
  exit 1
fi

# One "<file>\t<from>\t<to>" line per swap; a file that is not a JSON object of strings fails the check.
swaps="$(bun -e '
const fs = require("node:fs");
for (const file of process.argv.slice(1)) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.log(`${file}\t!\tnot valid JSON: ${e.message}`); continue; }
  if (j == null || typeof j !== "object" || Array.isArray(j)) { console.log(`${file}\t!\tnot a JSON object`); continue; }
  const entries = Object.entries(j);
  if (entries.length === 0) console.log(`${file}\t!\tdeclares no swaps`);
  for (const [from, to] of entries) {
    if (typeof to !== "string") { console.log(`${file}\t!\t${from} maps to a non-string`); continue; }
    console.log(`${file}\t${from}\t${to}`);
  }
}
' "${files[@]}")"

markers=()
count=0
while IFS=$'\t' read -r file from to; do
  [[ -z "$file" ]] && continue
  if [[ "$from" == "!" ]]; then
    fail "$file: $to"
    continue
  fi
  count=$((count + 1))
  [[ -f "$from" ]] || fail "$file: Keybr path $from does not exist"
  if [[ ! -f "$to" ]]; then
    fail "$file: Gutentype path $to does not exist"
    continue
  fi
  [[ "$to" == packages/gutentype-* ]] || fail "$file: $to is not under packages/gutentype-*"
  marker="$(sed -nE 's/.*(displayName|replacementMarker)[[:space:]]*=[[:space:]]*"([^"]+)".*/\2/p' "$to" | head -n 1)"
  if [[ -z "$marker" ]]; then
    fail "$to has no displayName = \"...\" or replacementMarker = \"...\" marker"
    continue
  fi
  markers+=("$marker|$to")
  echo "swap: $from -> $to (marker $marker)"
done <<<"$swaps"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "building (bun run build)..."
  GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD)}" bun run build >/dev/null 2>&1 || {
    echo "FAIL: bun run build failed; run it directly to see why" >&2
    exit 1
  }
fi
if [[ ! -d "$assets" ]] || ! compgen -G "$assets/*.js" >/dev/null; then
  echo "FAIL: no built scripts in $assets (run without --no-build)" >&2
  exit 1
fi
for entry in "${markers[@]+"${markers[@]}"}"; do
  marker="${entry%%|*}"
  to="${entry#*|}"
  if grep -lF --include='*.js' -r "$marker" "$assets" >/dev/null; then
    echo "bundle: $marker found ($to)"
  else
    fail "the bundle in $assets lacks marker $marker from $to"
  fi
done

thin="$(bash packages/gutentype-tools/scripts/thin-fork-check.sh 2>&1)" || true
if ! bun -e '
const out = process.argv[1];
const expected = Number(process.argv[2]);
const start = out.indexOf("{");
let j;
try { j = JSON.parse(out.slice(start, out.lastIndexOf("}") + 1)); } catch { console.error("FAIL: thin-fork-check printed no report:\n" + out); process.exit(1); }
const bad = [];
if (j.modifiedSourceFiles !== expected) bad.push(`thin-fork-check counts ${j.modifiedSourceFiles} modified upstream files, expected ${expected}`);
if (j.errors.length > 0) bad.push(`thin-fork-check errors: ${j.errors.join("; ")}`);
for (const b of bad) console.error("FAIL: " + b);
if (bad.length === 0) console.log(`thin-fork: ${j.modifiedSourceFiles} modified upstream files, no errors`);
process.exit(bad.length ? 1 : 0);
' "$thin" "$expected_modified"; then
  errors=$((errors + 1))
fi

if [[ $errors -gt 0 ]]; then
  echo "replacements-check: $errors problem(s) in $count swap(s)" >&2
  exit 1
fi
echo "replacements-check: ok ($count swap(s))"

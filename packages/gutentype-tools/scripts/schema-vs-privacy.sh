#!/usr/bin/env bash
# ISC-64: the database schema holds only the fields /privacy names. Dumps every table.column of a fresh database
# made by Gutentype's initdb, lists the columns whose phrase is on /privacy, and diffs the two. Empty diff = pass.
#
#   bash packages/gutentype-tools/scripts/schema-vs-privacy.sh
set -euo pipefail
source "$(dirname "$0")/server-lib.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gt_tsnode packages/gutentype-server/lib/cli/schema.ts --schema >"$work/schema.txt"
gt_tsnode packages/gutentype-server/lib/cli/schema.ts --privacy >"$work/privacy.txt"

echo "schema: $(wc -l <"$work/schema.txt" | tr -d ' ') columns; named on /privacy: $(wc -l <"$work/privacy.txt" | tr -d ' ')"
if diff -u --label schema "$work/schema.txt" --label privacy "$work/privacy.txt"; then
  echo "PASS ISC-64: empty diff"
else
  echo "FAIL ISC-64: '-' lines are stored but not named on /privacy, '+' lines are named but not stored"
  exit 1
fi

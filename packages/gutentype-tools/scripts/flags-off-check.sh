#!/usr/bin/env bash
# ISC-50: the multiplayer and highscores routes return 404 (switched off by flag, not deleted).
#
#   bash packages/gutentype-tools/scripts/flags-off-check.sh                  # in process (flags-off.test.ts)
#   bash packages/gutentype-tools/scripts/flags-off-check.sh --url <base>     # a running site
set -euo pipefail
source "$(dirname "$0")/server-lib.sh"

if [ "${1:-}" != "--url" ]; then
  gt_test flags-off.test.ts
  exit $?
fi
url="${2:?--url needs a base URL}"
fail=0
for path in /multiplayer /high-scores /_/high-scores /privacy-policy /terms-of-service; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url$path")
  echo "$path: $code (want 404)"
  [ "$code" = "404" ] || fail=1
done
if [ "$fail" -eq 0 ]; then echo "PASS ISC-50"; else echo "FAIL ISC-50"; fi
exit "$fail"

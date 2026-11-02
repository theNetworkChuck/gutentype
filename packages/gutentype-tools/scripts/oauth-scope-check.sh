#!/usr/bin/env bash
# ISC-23 (scope in code) and ISC-21 (server side): Google is the only OAuth door and asks for the email scope only;
# facebook and microsoft answer 404.
#
#   bash packages/gutentype-tools/scripts/oauth-scope-check.sh                  # in process, the ISA check
#   bash packages/gutentype-tools/scripts/oauth-scope-check.sh --url <base>     # a running site
set -euo pipefail
source "$(dirname "$0")/server-lib.sh"

if [ "${1:-}" != "--url" ]; then
  gt_test oauth-scope.test.ts
  exit $?
fi
url="${2:?--url needs a base URL}"
year=$(( $(date -u +%Y) - 30 ))
location=$(curl -s -o /dev/null -w '%{redirect_url}' "$url/auth/oauth-init/google?birthYear=$year&consent=true")
scope=$(node -e 'console.log(new URL(process.argv[1]).searchParams.get("scope"))' "$location")
echo "Google scope: $scope"
fail=0
[ "$scope" = "email" ] || fail=1
for p in facebook microsoft; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url/auth/oauth-init/$p")
  echo "$p: $code (want 404)"
  [ "$code" = "404" ] || fail=1
done
if [ "$fail" -eq 0 ]; then echo "PASS ISC-23"; else echo "FAIL ISC-23"; fi
exit "$fail"

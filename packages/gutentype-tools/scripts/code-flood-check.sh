#!/usr/bin/env bash
# ISC-58: the sign-in-link endpoint stops at 3 links per address per hour and 20 per network address per hour.
#
#   bash packages/gutentype-tools/scripts/code-flood-check.sh
#       Floods Keybr's app in process (fake mailer, nothing sent): the 4th link for one address and the 21st from
#       one network address return 429. This is the check the ISA runs.
#
#   bash packages/gutentype-tools/scripts/code-flood-check.sh --url https://gutentype.app --email test@example.org
#       The same flood against a running site. It sends REAL emails (up to 20) to plus-addresses of --email, and
#       uses up this machine's hourly allowance for an hour. Run it only against a test inbox.
set -euo pipefail
source "$(dirname "$0")/server-lib.sh"

if [ "${1:-}" != "--url" ]; then
  gt_test code-flood.test.ts
  exit $?
fi

url="${2:?--url needs a base URL}"
[ "${3:-}" = "--email" ] || { echo "--url needs --email <test address>" >&2; exit 2; }
email="${4:?--email needs an address}"
user="${email%@*}"
domain="${email#*@}"
year=$(( $(date -u +%Y) - 30 ))

ask() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$url/auth/login/register-email" \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"$1\",\"birthYear\":$year,\"consent\":true}"
}

fail=0
for i in 1 2 3 4; do
  code=$(ask "$email")
  expect=200; [ "$i" -eq 4 ] && expect=429
  echo "address flood, request $i: $code (want $expect)"
  [ "$code" = "$expect" ] || fail=1
done

# Three links already count against this network address; 17 more succeed, the next is refused.
ok=0
for i in $(seq 1 25); do
  code=$(ask "$user+flood$i@$domain")
  if [ "$code" = "429" ]; then break; fi
  [ "$code" = "200" ] || { echo "unexpected $code" >&2; fail=1; break; }
  ok=$((ok + 1))
done
echo "network flood: $ok links before 429 (want 17, so the 21st request from this address was refused)"
[ "$ok" -eq 17 ] || fail=1

if [ "$fail" -eq 0 ]; then echo "PASS ISC-58"; else echo "FAIL ISC-58"; fi
exit "$fail"

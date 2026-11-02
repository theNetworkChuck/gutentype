#!/usr/bin/env bash
# ISC-45: the built bundle and the server contain no ad, Paddle or checkout code.
# Scans root/ as `bun run build` leaves it (the browser assets and the server bundle). Source maps are skipped:
# they repeat the bundled code with its comments. Scripture mentions a paddle in lowercase (Deuteronomy 23:13,
# KJV), so the Paddle pattern is case-sensitive and code-shaped; checkout and ad-network names are not.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if [[ ! -f root/index.js || ! -d root/public/assets ]]; then
  echo "no build in root/: run bun run build first" >&2
  exit 2
fi
fail=0
check() {
  local label=$1
  shift
  local hits
  hits=$(rg -l "$@" root/index.js root/keybr.js root/public/assets -g '!*.map' || true)
  if [[ -n $hits ]]; then
    echo "FAIL $label:"
    echo "$hits"
    fail=1
  else
    echo "ok   no $label"
  fi
}
check "Paddle code" -e 'Paddle|paddle\.com|paddle-js|paddle_'
check "checkout code" -i -e 'checkout'
check "ad code" -i -e 'adsense|adsbygoogle|googlesyndication|doubleclick\.net|AdBanner|BANNER_970X90|BANNER_160X600'
exit $fail

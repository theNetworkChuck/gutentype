#!/usr/bin/env bash
# ISC-51: no password input exists on any page or in the bundle.
# 1. No Gutentype or Keybr browser source renders an input of type password (test files aside).
# 2. The built browser bundle sets no input type to "password". Library code that only reads an input's type
#    (React's text-input check: "password"===e.type) and word lists that contain the English word are not inputs,
#    so the bundle check looks for the shapes that create one: type:"password" and type="password".
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0
src=$(rg -l -i 'type=\{?"password"|type:\s*"password"|\.type\s*=\s*"password"' packages \
  -g '*.{ts,tsx,js,jsx,html}' -g '!**/.types/**' -g '!**/*.test.*' -g '!packages/server/**' \
  -g '!packages/server-cli/**' -g '!packages/keybr-widget/lib/components/textfield/TextField.types.ts' || true)
if [[ -n $src ]]; then
  echo "FAIL a source renders a password input:"
  echo "$src"
  fail=1
else
  echo "ok   no source renders a password input"
fi
if [[ -d root/public/assets ]]; then
  built=$(rg -l -e 'type:"password"' -e 'type="password"' -e "type='password'" root/public/assets -g '!*.map' || true)
  if [[ -n $built ]]; then
    echo "FAIL the bundle creates a password input:"
    echo "$built"
    fail=1
  else
    echo "ok   the bundle creates no password input"
  fi
else
  echo "no build in root/: run bun run build first" >&2
  exit 2
fi
exit $fail

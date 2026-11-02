#!/usr/bin/env bash
# ISC-70: no fixed or seeded login token exists in a production database, and the image never runs Keybr's
# `devenv/initdb.ts` (which seeds token `xyz` for user@localhost) or Keybr's `start-docker` script.
#
#   bash packages/gutentype-tools/scripts/no-seed-token-check.sh
#       Static check of the deploy files, then Gutentype's initdb on a fresh database file: 0 login requests.
#
#   bash packages/gutentype-tools/scripts/no-seed-token-check.sh --container <name>
#       Also inspects a running container: its command never names devenv or start-docker, and its database
#       (DATABASE_FILENAME inside the container) holds 0 rows in user_login_request.
set -euo pipefail
source "$(dirname "$0")/server-lib.sh"
fail=0

# 1. The deploy files never call Keybr's initdb.
deploy_files=()
while IFS= read -r f; do deploy_files+=("$f"); done < <(
  cd "$GT_ROOT" &&
    { find packages/gutentype-deploy -type f -not -path '*/node_modules/*' 2>/dev/null
      find . -maxdepth 1 -type f \( -iname 'Dockerfile*' -o -iname '*compose*.y*ml' \) 2>/dev/null; }
)
if [ "${#deploy_files[@]}" -gt 0 ]; then
  if (cd "$GT_ROOT" && grep -nE 'devenv|start-docker|accessToken *= *"xyz"' "${deploy_files[@]}"); then
    echo "FAIL: a deploy file calls Keybr's devenv initdb or start-docker"
    fail=1
  else
    echo "deploy files (${#deploy_files[@]}) never call devenv or start-docker"
  fi
else
  echo "no deploy files yet (packages/gutentype-deploy is empty); nothing to inspect"
fi

# 2. Gutentype's initdb on a fresh file writes no row.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
db="$work/database.sqlite"
(cd "$GT_ROOT" && env DATABASE_CLIENT=sqlite DATABASE_FILENAME="$db" \
  node --no-deprecation --import @keybr/tsl packages/gutentype-server/lib/cli/initdb.ts >/dev/null)
rows=$(node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  console.log(n("user_login_request") + n("user"));
' "$db")
echo "fresh database after initdb: $rows rows in user_login_request and user (want 0)"
[ "$rows" = "0" ] || fail=1

# 3. A running container, when named.
if [ "${1:-}" = "--container" ]; then
  name="${2:?--container needs a name}"
  cmd=$(docker inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}' "$name")
  echo "container command: $cmd"
  if echo "$cmd" | grep -qE 'devenv|start-docker'; then
    echo "FAIL: the container runs Keybr's initdb"
    fail=1
  fi
  n=$(docker exec "$name" node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.env.DATABASE_FILENAME, { readOnly: true });
    console.log(db.prepare("SELECT COUNT(*) AS n FROM user_login_request WHERE access_token = ? OR email = ?").get("xyz", "user@localhost").n);
  ')
  echo "container: $n seeded login rows (want 0)"
  [ "$n" = "0" ] || fail=1
fi

if [ "$fail" -eq 0 ]; then echo "PASS ISC-70"; else echo "FAIL ISC-70"; fi
exit "$fail"

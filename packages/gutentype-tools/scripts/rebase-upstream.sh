#!/usr/bin/env bash
# Rebases this branch onto upstream Keybr master (ISC-2). Paths Gutentype deleted (fork.json "deleted") are
# re-deleted when upstream changed them; bun.lock is regenerated, never merged by hand. Any other conflict stops
# the rebase and names the file, because that is a real collision with one of the declared modified files.
# Usage: rebase-upstream.sh [--no-install]
set -euo pipefail
repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$repo"
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream https://github.com/aradzie/keybr.com.git
git fetch -q upstream master
deleted=()
while IFS= read -r d; do deleted+=("$d"); done < <(bun -e 'console.log(JSON.parse(require("node:fs").readFileSync("packages/gutentype-tools/fork.json","utf8")).deleted.map(d=>d.path).join("\n"))')
resolve() {
  local unresolved=0
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    local hit=0
    for d in "${deleted[@]}"; do
      if [[ "$path" == "$d" || "$path" == "$d/"* ]]; then hit=1; fi
    done
    if [[ $hit == 1 ]]; then
      git rm -q --cached "$path" 2>/dev/null || true
      rm -rf "$path"
    elif [[ "$path" == "bun.lock" ]]; then
      git checkout -q --theirs bun.lock 2>/dev/null || true
      git add bun.lock
    else
      echo "conflict needs a hand: $path" >&2
      unresolved=1
    fi
  done < <(git diff --name-only --diff-filter=U)
  return $unresolved
}
if git -c core.hooksPath=/dev/null rebase -q upstream/master; then
  :
else
  while true; do
    resolve || { echo "rebase stopped; run 'git rebase --abort' to undo" >&2; exit 1; }
    GIT_EDITOR=true git -c core.hooksPath=/dev/null rebase --continue && break || true
    git diff --name-only --diff-filter=U | grep -q . || break
  done
fi
if [[ "${1:-}" != "--no-install" ]]; then
  bun install
  git add bun.lock
  git diff --cached --quiet || git -c core.hooksPath=/dev/null commit -qm "Regenerate bun.lock after rebasing onto upstream Keybr"
fi
echo "rebased onto $(git rev-parse --short upstream/master)"

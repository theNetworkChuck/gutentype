#!/usr/bin/env bash
# ISC-2: the fork stays thin. Compares this branch with upstream Keybr and fails unless
#   - every modified upstream source file is declared in fork.json and the count is under the budget,
#   - every modified package.json is declared as a manifest, package-lock.json is untouched,
#   - every deleted upstream path is declared, and every new file lives under packages/gutentype-* (or bun.lock),
#   - the README names every declared modified file and deleted path.
# Usage: thin-fork-check.sh [--rebase]   (--rebase also runs rebase-upstream.sh in a throwaway clone)
set -euo pipefail
repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$repo"
git remote get-url upstream >/dev/null 2>&1 || git remote add upstream https://github.com/aradzie/keybr.com.git
git fetch -q upstream master
base="$(git merge-base HEAD upstream/master)"
fork="packages/gutentype-tools/fork.json"
bun -e '
const [base, fork] = process.argv.slice(1);
const { execFileSync } = require("node:child_process");
const j = JSON.parse(require("node:fs").readFileSync(fork, "utf8"));
const lines = execFileSync("git", ["diff", "--name-status", "--no-renames", base, "HEAD"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const readme = require("node:fs").readFileSync("README.md", "utf8");
const errors = [];
const declared = new Set(j.modified.map((m) => m.path));
const manifests = new Set(j.manifests.map((m) => m.path));
const deleted = j.deleted.map((d) => d.path);
const ours = (p) => /^packages\/gutentype-[^/]+\//.test(p) || p === "bun.lock";
let source = 0;
for (const line of lines) {
  const [status, path] = line.split("\t");
  if (ours(path)) continue;
  if (status === "A") { errors.push(`new file outside packages/gutentype-*: ${path}`); continue; }
  if (status === "D") { if (!deleted.some((d) => path === d || path.startsWith(d + "/"))) errors.push(`undeclared deletion: ${path}`); continue; }
  if (path === "package-lock.json") { errors.push("package-lock.json is modified (Gutentype installs with bun)"); continue; }
  if (path === "README.md") { source++; continue; }
  if (path.endsWith("package.json")) { if (!manifests.has(path)) errors.push(`undeclared manifest change: ${path}`); continue; }
  source++;
  if (!declared.has(path)) errors.push(`undeclared modified file: ${path}`);
}
for (const p of [...declared, ...deleted]) if (!readme.includes(p)) errors.push(`README does not name ${p}`);
if (source >= j.budget) errors.push(`${source} modified upstream source files (README included), budget is under ${j.budget}`);
console.log(JSON.stringify({ modifiedSourceFiles: source, budget: j.budget, manifests: manifests.size, deletedPaths: deleted.length, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
' "$base" "$fork"
if [[ "${1:-}" == "--rebase" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git clone -q "$repo" "$tmp/clone"
  git -C "$tmp/clone" remote add upstream https://github.com/aradzie/keybr.com.git
  bash "$tmp/clone/packages/gutentype-tools/scripts/rebase-upstream.sh" --no-install
  echo "rebase: ok"
fi

# Shared by the server lane's check scripts. Sourced, not run.
# Repo root, Node 26 on PATH, and a runner for one Gutentype test file on Keybr's test runner (the same flags
# Keybr's `tstest` passes).

GT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [ -d "$HOME/.local/share/node26/current/bin" ]; then
  export PATH="$HOME/.local/share/node26/current/bin:$PATH"
fi

gt_node_major() { node -p 'process.versions.node.split(".")[0]'; }
if [ "$(gt_node_major)" -lt 26 ]; then
  echo "needs Node 26 or later on PATH (found $(node --version))" >&2
  exit 2
fi

# gt_test <file in packages/gutentype-tests/lib>
gt_test() {
  (cd "$GT_ROOT/packages/gutentype-tests" &&
    env NODE_ENV=test node --enable-source-maps --import @keybr/tsl \
      --import=@keybr/test-env-server --import=@keybr/test-env-bundler \
      --test --test-timeout=60000 "lib/$1")
}

# gt_tsnode <file under the repo root> [args...]
gt_tsnode() {
  local file="$1"
  shift
  (cd "$GT_ROOT" && node --enable-source-maps --no-deprecation --import @keybr/tsl "$file" "$@")
}

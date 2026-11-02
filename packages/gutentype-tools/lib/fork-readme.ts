#!/usr/bin/env bun
/** Rewrites the README's fork section from fork.json, so the list of changed Keybr files never drifts (ISC-2). */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../../..");
const fork = JSON.parse(
  readFileSync(join(root, "packages/gutentype-tools/fork.json"), "utf8"),
);
const start = "<!-- fork:start -->";
const end = "<!-- fork:end -->";
const row = (x: { path: string; reason: string }) =>
  `| \`${x.path}\` | ${x.reason} |`;
const section = [
  start,
  "",
  `Gutentype changes ${fork.modified.length + 1} of Keybr's own source files (this README included; the budget is under ${fork.budget}). Everything else lives in new \`packages/gutentype-*\` packages, so upstream fixes keep arriving with \`packages/gutentype-tools/scripts/rebase-upstream.sh\`.`,
  "",
  "**Modified Keybr files**",
  "",
  "| File | Why |",
  "|---|---|",
  "| `README.md` | This file. |",
  ...fork.modified.map(row),
  "",
  "**Dependency lines added to Keybr manifests** (not counted)",
  "",
  "| File | Why |",
  "|---|---|",
  ...fork.manifests.map(row),
  "",
  "**Deleted from Keybr**",
  "",
  "| Path | Why |",
  "|---|---|",
  ...fork.deleted.map(row),
  "",
  "Keybr's `package-lock.json` is left untouched: Gutentype installs with bun (`bun.lock`).",
  "",
  end,
].join("\n");
const path = join(root, "README.md");
const text = readFileSync(path, "utf8");
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0) throw new Error("README has no fork markers");
writeFileSync(path, text.slice(0, a) + section + text.slice(b + end.length));
console.log("README fork section updated");

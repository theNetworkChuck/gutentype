#!/usr/bin/env bun
/**
 * Writes each pack's `learn.json` (CONTRACTS § 1): verse fragments, the reviewed blocklist and the divine names.
 *
 *   bun packages/gutentype-tools/lib/build-learn.ts
 *
 * Run after `build-packs.ts` (which resets `learn.json` to a placeholder). It reads only the built pack in
 * `packages/gutentype-content/lib/packs/<id>/`, so any pack directory there is handled, a new one included.
 *
 * Fragments are runs of 3 to 5 consecutive words of one verse, lowercased. A run never crosses punctuation (a
 * comma, a full stop, a quote, a dash), a word with an apostrophe or hyphen inside it, or a digit, so every word
 * in a fragment is a whole `[a-z]+` word of the pack's word list. A fragment is dropped when it contains a
 * blocklisted word or starts or ends with a divine name (so a divine name only ever sits between words of its own
 * verse). Fragments are grouped by the unlock stage at which all their letters are available (the pack's letter
 * order, six letters at the earliest, as Keybr's guided lessons start); every fragment of the early, thin stages is
 * kept and later stages are sampled down to a fixed cap so the chunk stays small.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { blocklist, divineNames } from "./learn-blocklist.ts";

export type LearnJson = {
  fragments: string[][];
  blocklist: string[];
  divineNames: string[];
  names: string[];
};

type PackJson = {
  id: string;
  letters: [string, number][];
  books: { id: string }[];
};

type BookJson = { chapters: string[][] };

/** The smallest number of letters a guided lesson ever has (`guided.ts` `minSize`). */
export const minStage = 6;
/** Fragments kept per stage past the thin early stages. */
export const stageCap = 600;

const leading = /^["'“‘([«]+/;
const trailing = /["'”’)\].,;:!?»—–-]+$/;

/**
 * Splits a verse into runs of whole lowercase words that a fragment may span.
 * A run ends at any punctuation or at a token that is not a plain word.
 */
export function wordRuns(verse: string): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) runs.push(run);
    run = [];
  };
  for (const token of verse.split(/\s+/)) {
    if (token === "") continue;
    const lead = leading.exec(token);
    if (lead != null) flush();
    const tail = trailing.exec(token.slice(lead?.[0].length ?? 0));
    const core = token
      .slice(
        lead?.[0].length ?? 0,
        tail == null ? undefined : token.length - tail[0].length,
      )
      .toLowerCase();
    if (/^[a-z]+$/.test(core)) {
      run.push(core);
    } else {
      flush();
      continue;
    }
    if (tail != null) flush();
  }
  flush();
  return runs;
}

/** Every 3 to 5 word window of every run. */
export function fragmentsOf(verse: string): string[][] {
  const out: string[][] = [];
  for (const run of wordRuns(verse)) {
    for (let n = 3; n <= 5; n++) {
      for (let i = 0; i + n <= run.length; i++) {
        out.push(run.slice(i, i + n));
      }
    }
  }
  return out;
}

/** A small deterministic hash, so the sample is the same on every build. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildLearn(
  pack: PackJson,
  verses: Iterable<string>,
  words: ReadonlySet<string>,
): { learn: LearnJson; perStage: Record<number, number> } {
  const blocked = new Set(
    blocklist.map(([w]) => w).filter((w) => words.has(w)),
  );
  const divine = new Set(divineNames.filter((w) => words.has(w)));
  const rank = new Map(pack.letters.map(([ch], i) => [ch, i]));
  const byStage = new Map<number, Map<string, string[]>>();
  const seenLower = new Set<string>();
  for (const verse of verses) {
    for (const [w] of verse.matchAll(/[A-Za-z]+/g)) {
      if (w[0] === w[0].toLowerCase()) seenLower.add(w.toLowerCase());
    }
    for (const fragment of fragmentsOf(verse)) {
      if (fragment.some((w) => blocked.has(w))) continue;
      if (divine.has(fragment[0]) || divine.has(fragment.at(-1)!)) continue;
      let top = 0;
      for (const w of fragment)
        for (const ch of w) top = Math.max(top, rank.get(ch)! + 1);
      const stage = Math.max(minStage, top);
      let m = byStage.get(stage);
      if (m == null) byStage.set(stage, (m = new Map()));
      m.set(fragment.join(" "), fragment);
    }
  }
  const fragments: string[][] = [];
  const perStage: Record<number, number> = {};
  for (const stage of [...byStage.keys()].sort((a, b) => a - b)) {
    const all = [...byStage.get(stage)!.entries()];
    all.sort((a, b) => hash(a[0]) - hash(b[0]) || (a[0] < b[0] ? -1 : 1));
    const kept = all.slice(0, stageCap).map(([, f]) => f);
    kept.sort((a, b) => (a.join(" ") < b.join(" ") ? -1 : 1));
    perStage[stage] = kept.length;
    fragments.push(...kept);
  }
  return {
    learn: {
      fragments,
      blocklist: [...blocked].sort(),
      divineNames: [...divine].sort(),
      // ISC-71: words that appear only with a capital first letter (names, in practice).
      names: [...words].filter((w) => !seenLower.has(w)).sort(),
    },
    perStage,
  };
}

export function* packVerses(
  packDir: string,
  pack: PackJson,
): Generator<string> {
  for (const { id } of pack.books) {
    const book = JSON.parse(
      readFileSync(join(packDir, "books", `${id}.json`), "utf8"),
    ) as BookJson;
    for (const chapter of book.chapters)
      for (const verse of chapter) if (verse !== "") yield verse;
  }
}

export function buildPackDir(packDir: string) {
  const pack = JSON.parse(
    readFileSync(join(packDir, "pack.json"), "utf8"),
  ) as PackJson;
  const words = new Set(
    (
      JSON.parse(readFileSync(join(packDir, "words.json"), "utf8")) as [
        string,
        number,
      ][]
    ).map(([w]) => w),
  );
  const { learn, perStage } = buildLearn(
    pack,
    packVerses(packDir, pack),
    words,
  );
  writeFileSync(join(packDir, "learn.json"), JSON.stringify(learn));
  return {
    fragments: learn.fragments.length,
    blocklist: learn.blocklist.length,
    divineNames: learn.divineNames,
    perStage,
  };
}

if (import.meta.main) {
  const packsDir = resolve(
    dirname(new URL(import.meta.url).pathname),
    "../../gutentype-content/lib/packs",
  );
  const summary: Record<string, unknown> = {};
  // Only directories that hold a pack.json are packs (the folder also holds a .gitattributes).
  for (const id of readdirSync(packsDir)
    .filter((id) => existsSync(join(packsDir, id, "pack.json")))
    .sort()) {
    summary[id] = buildPackDir(join(packsDir, id));
  }
  console.log(JSON.stringify(summary, null, 1));
}

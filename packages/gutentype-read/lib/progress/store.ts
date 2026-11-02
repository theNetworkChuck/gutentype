import { Pack } from "@gutentype/content";
import { getPageData, PageDataContext } from "@keybr/pages-shared";
import { useContext, useEffect, useSyncExternalStore } from "react";
import { IdbReadRows, type LocalReadRows } from "./local.ts";
import { HttpReadRows, type RemoteReadRows } from "./remote.ts";
import { rowKey, toVerseRow, type VerseRow } from "./rows.ts";

export type ReadProgressView = {
  readonly rows: readonly VerseRow[];
  readonly loading: boolean;
};

export type ReadProgressOptions = {
  readonly local?: LocalReadRows;
  readonly remote?: RemoteReadRows;
  /** Whether a session exists. Without one nothing is ever sent (ISC-63). */
  readonly signedIn?: () => boolean;
};

type PackState = {
  readonly rows: Map<string, VerseRow>;
  view: ReadProgressView;
  local: Promise<void> | null;
  loaded: Promise<void> | null;
};

/** Signed in means the page data names a user; the server only makes a session after consent (CONTRACTS § 2). */
export function isSignedIn(): boolean {
  try {
    return getPageData()?.user != null;
  } catch {
    return false;
  }
}

async function quiet<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Read progress for every pack: the rows in memory (what the pages render), mirrored to IndexedDB, and, only while
 * signed in, to the account. A finished verse is in memory the moment it is recorded (ISC-15); storage and the
 * network follow without blocking typing and fail quietly.
 */
export class ReadProgressStore {
  readonly #local: LocalReadRows;
  readonly #remote: RemoteReadRows;
  readonly #signedIn: () => boolean;
  readonly #packs = new Map<string, PackState>();
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Set<Promise<unknown>>();

  constructor({
    local = new IdbReadRows(),
    remote = new HttpReadRows(),
    signedIn = isSignedIn,
  }: ReadProgressOptions = {}) {
    this.#local = local;
    this.#remote = remote;
    this.#signedIn = signedIn;
  }

  #state(pack: string): PackState {
    let state = this.#packs.get(pack);
    if (state == null) {
      state = {
        rows: new Map(),
        view: { rows: [], loading: true },
        local: null,
        loaded: null,
      };
      this.#packs.set(pack, state);
    }
    return state;
  }

  #track<T>(promise: Promise<T>): Promise<T> {
    this.#pending.add(promise);
    void promise.finally(() => this.#pending.delete(promise));
    return promise;
  }

  #merge(pack: string, rows: readonly VerseRow[]): void {
    const state = this.#state(pack);
    let changed = false;
    for (const row of rows) {
      if (row.pack !== pack) continue;
      const key = rowKey(row);
      const have = state.rows.get(key);
      if (have == null || row.ts > have.ts) {
        state.rows.set(key, row);
        changed = true;
      }
    }
    if (changed) {
      state.view = { ...state.view, rows: [...state.rows.values()] };
      this.#emit();
    }
  }

  #setLoading(pack: string, loading: boolean): void {
    const state = this.#state(pack);
    if (state.view.loading !== loading) {
      state.view = { ...state.view, loading };
      this.#emit();
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }

  #loadLocal(pack: string): Promise<void> {
    const state = this.#state(pack);
    state.local ??= this.#track(
      (async () => {
        const rows = await quiet(() => this.#local.read(pack));
        if (rows != null) this.#merge(pack, rows);
      })(),
    );
    return state.local;
  }

  /** Reads this browser's rows, then (signed in) merges the account's. Idempotent per pack. */
  load(pack: string): Promise<void> {
    const state = this.#state(pack);
    state.loaded ??= this.#track(
      (async () => {
        await this.#loadLocal(pack);
        if (this.#signedIn()) await this.sync(pack);
        this.#setLoading(pack, false);
      })(),
    );
    return state.loaded;
  }

  /**
   * Signed in only: GET the account's rows, merge (newest ts wins), keep the account's newer rows locally, and PUT
   * the rows the account does not have yet. Signed out it does nothing at all.
   */
  async sync(pack: string): Promise<void> {
    if (!this.#signedIn()) return;
    await this.#loadLocal(pack);
    const remote = await quiet(() => this.#remote.get(pack));
    if (remote == null) return;
    const state = this.#state(pack);
    const theirs = new Map(remote.map((row) => [rowKey(row), row]));
    const toSend = [...state.rows.values()].filter((row) => {
      const have = theirs.get(rowKey(row));
      return have == null || have.ts < row.ts;
    });
    const toKeep = remote.filter((row) => {
      const have = state.rows.get(rowKey(row));
      return have == null || have.ts < row.ts;
    });
    this.#merge(pack, toKeep);
    await Promise.all([
      this.#track(quiet(() => this.#local.put(toKeep))),
      toSend.length > 0
        ? this.#track(quiet(() => this.#remote.put(toSend)))
        : null,
    ]);
  }

  /** A finished verse: in memory now, then IndexedDB, then (signed in) the account. */
  record(row: VerseRow): void {
    const clean = toVerseRow(row);
    this.#merge(clean.pack, [clean]);
    this.#track(quiet(() => this.#local.put([clean])));
    if (this.#signedIn()) {
      this.#track(quiet(() => this.#remote.put([clean])));
    }
  }

  rows(pack: string): readonly VerseRow[] {
    return this.#state(pack).view.rows;
  }

  view(pack: string): ReadProgressView {
    return this.#state(pack).view;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Resolves once every storage and network write started so far has finished. */
  async settled(): Promise<void> {
    while (this.#pending.size > 0) {
      await Promise.allSettled([...this.#pending]);
    }
  }
}

/** The page's one progress store. */
export const readProgress = new ReadProgressStore();

/** The active pack's rows, live: every component reading them re-renders when a verse is finished. */
export function useReadProgress(pack: Pack): ReadProgressView {
  useContext(PageDataContext); // Re-render under a new page data (sign-in).
  useEffect(() => {
    void readProgress.load(pack.id);
  }, [pack]);
  const view = () => readProgress.view(pack.id);
  return useSyncExternalStore(readProgress.subscribe, view, view);
}

/**
 * The first-sign-in merge, called by the account page once a session exists: for every pack, GET the account's
 * rows, merge them in, and PUT the local-only ones. Signed out it returns at once and sends nothing.
 */
export async function syncReadProgress(): Promise<void> {
  if (!isSignedIn()) return;
  await Promise.all(Pack.ALL.map((pack) => readProgress.sync(pack.id)));
  await readProgress.settled();
}

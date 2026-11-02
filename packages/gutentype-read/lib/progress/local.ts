import { isVerseRow, toVerseRow, type VerseRow } from "./rows.ts";

/** Where signed-out progress lives (CONTRACTS § 2): this browser only. */
export type LocalReadRows = {
  read(pack: string): Promise<VerseRow[]>;
  /** Writes each row unless the stored row for that verse is newer. */
  put(rows: readonly VerseRow[]): Promise<void>;
};

export const readDbName = "gutentype-read";
export const readStoreName = "rows";
const keyPath = ["pack", "book", "chapter", "verse"];

function idb(): IDBFactory | null {
  try {
    return typeof indexedDB === "undefined" ? null : indexedDB;
  } catch {
    return null; // Blocked storage (some private modes) throws on access.
  }
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(readDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(readStoreName)) {
        db.createObjectStore(readStoreName, { keyPath });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
}

/**
 * IndexedDB `gutentype-read`, store `rows`, key `[pack, book, chapter, verse]`. Without IndexedDB (blocked storage)
 * it keeps rows in memory for the page's lifetime, so typing still works; nothing is ever sent anywhere instead.
 */
export class IdbReadRows implements LocalReadRows {
  static readonly #memory = new Map<string, VerseRow>();

  async read(pack: string): Promise<VerseRow[]> {
    const factory = idb();
    if (factory == null) {
      return [...IdbReadRows.#memory.values()].filter((r) => r.pack === pack);
    }
    const db = await open(factory);
    try {
      const tx = db.transaction(readStoreName, "readonly");
      const all = await done(tx.objectStore(readStoreName).getAll());
      return (all as unknown[])
        .filter(isVerseRow)
        .filter((r) => r.pack === pack)
        .map(toVerseRow);
    } finally {
      db.close();
    }
  }

  async put(rows: readonly VerseRow[]): Promise<void> {
    if (rows.length === 0) return;
    const factory = idb();
    if (factory == null) {
      for (const row of rows) {
        const key = keyPath.map((k) => (row as any)[k]).join("/");
        const have = IdbReadRows.#memory.get(key);
        if (have == null || have.ts <= row.ts) {
          IdbReadRows.#memory.set(key, toVerseRow(row));
        }
      }
      return;
    }
    const db = await open(factory);
    try {
      const tx = db.transaction(readStoreName, "readwrite");
      const store = tx.objectStore(readStoreName);
      const finished = completed(tx);
      for (const row of rows) {
        const request = store.get([row.pack, row.book, row.chapter, row.verse]);
        request.onsuccess = () => {
          const have = request.result as VerseRow | undefined;
          if (have == null || !isVerseRow(have) || have.ts <= row.ts) {
            store.put(toVerseRow(row));
          }
        };
      }
      await finished;
    } finally {
      db.close();
    }
  }

  /** Deletes every stored row (tests, and a future "clear my progress" control). */
  async clear(): Promise<void> {
    IdbReadRows.#memory.clear();
    const factory = idb();
    if (factory == null) return;
    const db = await open(factory);
    try {
      const tx = db.transaction(readStoreName, "readwrite");
      const finished = completed(tx);
      tx.objectStore(readStoreName).clear();
      await finished;
    } finally {
      db.close();
    }
  }
}

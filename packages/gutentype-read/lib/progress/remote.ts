import { isVerseRow, toVerseRow, type VerseRow } from "./rows.ts";

/** The account copy of the rows (CONTRACTS § 2), used only while signed in. */
export type RemoteReadRows = {
  /** The account's rows for a pack, or null when the server cannot be reached or refuses. */
  get(pack: string): Promise<VerseRow[] | null>;
  /** Sends rows the account does not have yet; false when the server cannot be reached or refuses. */
  put(rows: readonly VerseRow[]): Promise<boolean>;
};

export const readSyncPath = "/_/gutentype/read";

/** `GET /_/gutentype/read?pack=<id>` and `PUT /_/gutentype/read {rows}`. Every failure is quiet. */
export class HttpReadRows implements RemoteReadRows {
  async get(pack: string): Promise<VerseRow[] | null> {
    try {
      const response = await fetch(
        `${readSyncPath}?pack=${encodeURIComponent(pack)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { accept: "application/json" },
        },
      );
      if (!response.ok) return null;
      const body = (await response.json()) as { rows?: unknown };
      if (body == null || !Array.isArray(body.rows)) return null;
      return body.rows
        .filter(isVerseRow)
        .filter((r) => r.pack === pack)
        .map(toVerseRow);
    } catch {
      return null;
    }
  }

  async put(rows: readonly VerseRow[]): Promise<boolean> {
    if (rows.length === 0) return true;
    try {
      const response = await fetch(readSyncPath, {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: rows.map(toVerseRow) }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

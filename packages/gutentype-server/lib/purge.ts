import { readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type DataDir } from "@keybr/config";
import { Order, User, UserExternalId, UserLoginRequest } from "@keybr/database";
import { File } from "@sosimple/fsx-file";
import { LockFile } from "@sosimple/fsx-lockfile";
import { exponentialDelay } from "@sosimple/retry";
import { type Knex } from "knex";
import { Model } from "objection";
import {
  ensureDatabase,
  readProgressTable,
  signInAttemptTable,
} from "./schema.ts";
import { signInEmailHash } from "./signin.ts";

/**
 * Deletes everything stored about one person (ISC-24, CONTRACTS § 6): their user row and the rows that hang off it
 * (Google ids, orders, login requests, read progress, sign-in attempts made with their email), their settings and
 * stats files with every copy Keybr's "reset statistics" renamed aside, their session files on every device, and
 * their rows in `highscores.json`. sqlite does not enforce Keybr's ON DELETE CASCADE, so each table is cleared here.
 */
export async function purgeUser(
  dataDir: DataDir,
  user: Pick<User, "id" | "email">,
  knex: Knex = Model.knex(),
): Promise<void> {
  const id = user.id!;
  const email = user.email!;
  await ensureDatabase(knex);
  const emailHash = await signInEmailHash(dataDir, email);
  await knex.transaction(async (trx) => {
    await trx(readProgressTable).where("user_id", id).delete();
    await trx(signInAttemptTable).where("email_hash", emailHash).delete();
    await UserLoginRequest.query(trx).where({ email }).delete();
    await UserExternalId.query(trx).where("userId", id).delete();
    await Order.query(trx).where("userId", id).delete();
    await User.query(trx).deleteById(id);
  });
  await removeUserFile(dataDir.userSettingsFile(id));
  await removeUserFile(dataDir.userStatsFile(id));
  await removeSessions(dataDir.dataPath("sessions"), id);
  await removeHighScores(dataDir.dataPath("highscores.json"), id);
}

/** The file, its `~N` copies and any lock file beside it. */
async function removeUserFile(path: string): Promise<void> {
  const dir = dirname(path);
  const name = basename(path);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err: any) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    if (
      entry === name ||
      entry.startsWith(name + "~") ||
      entry.startsWith(name + ".")
    ) {
      await rm(join(dir, entry), { recursive: true, force: true });
    }
  }
}

async function removeSessions(dir: string, id: number): Promise<void> {
  for (const path of await listFiles(dir)) {
    try {
      const session = JSON.parse(await readFile(path, "utf8"));
      if (session?.data?.userId === id) {
        await rm(path, { force: true });
      }
    } catch {
      // Not a session file, or one being written right now: leave it.
    }
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err.code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

async function removeHighScores(path: string, id: number): Promise<void> {
  const file = new File(path);
  if (!(await file.exists())) {
    return;
  }
  await LockFile.withLock(
    file,
    { retryLimit: 5, delayer: exponentialDelay(10) },
    async (lock) => {
      let rows: unknown;
      try {
        rows = JSON.parse(await readFile(path, "utf8"));
      } catch {
        await lock.rollback();
        return;
      }
      if (!Array.isArray(rows)) {
        await lock.rollback();
        return;
      }
      const kept = rows.filter((row) => row?.user !== id);
      if (kept.length === rows.length) {
        await lock.rollback();
        return;
      }
      await lock.writeFile(JSON.stringify(kept));
      await lock.commit();
    },
  );
}

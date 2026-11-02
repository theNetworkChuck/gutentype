import { createSchema } from "@keybr/database";
import { type Knex } from "knex";
import { Model } from "objection";

/*
 * Gutentype's own tables. None carries an IP address, and only the read progress carries a user id (CONTRACTS § 2,
 * § 4, § 5). Timestamps Gutentype writes are epoch milliseconds, so sqlite and MySQL store them the same way.
 */

export const readProgressTable = "gutentype_read_progress";
export const counterTable = "gutentype_counter";
export const signInAttemptTable = "gutentype_sign_in_attempt";

const tables: readonly {
  readonly name: string;
  readonly create: (table: Knex.CreateTableBuilder) => void;
}[] = [
  {
    name: readProgressTable,
    create: (table) => {
      table.integer("user_id").unsigned().notNullable();
      table.string("pack", 16).notNullable();
      table.string("book", 32).notNullable();
      table.integer("chapter").unsigned().notNullable();
      table.integer("verse").unsigned().notNullable();
      table.float("speed").notNullable();
      table.float("accuracy").notNullable();
      table.bigInteger("ts").notNullable();
      table.primary(["user_id", "pack", "book", "chapter", "verse"]);
    },
  },
  {
    name: counterTable,
    create: (table) => {
      table.string("name", 32).notNullable();
      table.string("day", 10).notNullable();
      table.integer("count").unsigned().notNullable().defaultTo(0);
      table.primary(["name", "day"]);
    },
  },
  {
    name: signInAttemptTable,
    create: (table) => {
      table.string("email_hash", 64).notNullable();
      table.string("ip_hash", 64).notNullable();
      table.bigInteger("created_at").notNullable();
      table.index(["email_hash"]);
      table.index(["ip_hash"]);
      table.index(["created_at"]);
    },
  },
];

export const gutentypeTables: readonly string[] = tables.map((t) => t.name);

export function isSqlite(knex: Knex): boolean {
  return (knex.client.config as { __client?: string }).__client === "sqlite";
}

/** Milliseconds a sqlite connection waits on a lock held by another worker process before it gives up. */
export const busyTimeoutMs = 5000;

/** Creates the Gutentype tables that do not exist yet. */
export async function createGutentypeSchema(knex: Knex): Promise<void> {
  for (const { name, create } of tables) {
    if (!(await knex.schema.hasTable(name))) {
      await knex.schema.createTable(name, create);
    }
  }
}

/**
 * Sets the sqlite pragmas on the current connection and on every connection the pool opens later: WAL, so four
 * worker processes can read while one writes, and a busy timeout, so a writer waits instead of failing.
 */
export async function sqlitePragmas(knex: Knex): Promise<void> {
  if (!isSqlite(knex)) {
    return;
  }
  const pool = (knex.client as any).pool;
  if (pool != null && !hooked.has(pool)) {
    hooked.add(pool);
    pool.on("createSuccess", (_id: unknown, connection: any) => {
      try {
        connection.exec?.(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
      } catch {
        // A pragma that fails leaves the default timeout; the next query reports the real problem.
      }
    });
  }
  await knex.raw(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  await knex.raw("PRAGMA journal_mode = WAL");
}

const hooked = new WeakSet<object>();

/**
 * Gutentype's initdb: the pragmas, Keybr's tables and Gutentype's. It writes no row, so no login token exists
 * until someone asks for a sign-in link (ISC-70; Keybr's `devenv/initdb.ts` seeds token `xyz` and is never run).
 */
export async function initDatabase(knex: Knex): Promise<void> {
  await sqlitePragmas(knex);
  await createSchema(knex);
  await createGutentypeSchema(knex);
}

const ready = new WeakMap<Knex, Promise<void>>();

/**
 * Once per process and database, before the first request uses it: the same work as initdb (pragmas, Keybr's tables,
 * Gutentype's), so a fresh data volume works without a separate step. Four workers may race to create a table;
 * the loser sees "already exists" and simply checks again.
 */
export function ensureDatabase(knex: Knex = Model.knex()): Promise<void> {
  let p = ready.get(knex);
  if (p == null) {
    p = (async () => {
      try {
        await initDatabase(knex);
      } catch (err: any) {
        if (!/already exists/i.test(String(err?.message))) throw err;
        await initDatabase(knex);
      }
    })();
    ready.set(knex, p);
    p.catch(() => ready.delete(knex));
  }
  return p;
}

/** Empties the Gutentype tables (tests). */
export async function clearGutentypeTables(
  knex: Knex = Model.knex(),
): Promise<void> {
  await ensureDatabase(knex);
  for (const name of gutentypeTables) {
    await knex(name).delete();
  }
}

/** Every `table.column` in the database, sorted: the schema dump ISC-64 diffs against `/privacy`. */
export async function dumpSchema(knex: Knex): Promise<string[]> {
  let names: string[];
  if (isSqlite(knex)) {
    const rows = await knex.raw(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    names = rows.map((r: { name: string }) => r.name);
  } else {
    const [rows] = await knex.raw(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    names = rows.map((r: { name: string }) => r.name);
  }
  const out: string[] = [];
  for (const name of names) {
    for (const column of Object.keys(await knex(name).columnInfo())) {
      out.push(`${name}.${column}`);
    }
  }
  return out.sort();
}

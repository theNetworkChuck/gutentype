# Gutentype lane contracts

Fixed before the build lanes branch (2026-11-02). A lane may add to its own package freely; it changes nothing here without the integrator. Every name below is exported exactly as written.

## Packages and owners

| Package | Lane | May modify these Keybr files |
|---|---|---|
| `@gutentype/content` | integrator (done) | none |
| `@gutentype/lesson` | Learn | `keybr-lesson-loader/lib/LessonLoader.tsx`, the practice settings file that lists lesson types |
| `@gutentype/read` | Read | none |
| `@gutentype/server` | Server | `server/lib/app/routes.ts`, `server/lib/app/auth/controller.ts`, `server/lib/app/auth/module.ts` |
| `@gutentype/pages` | Shell | `keybr-pages-browser/lib/App.tsx`, `keybr-pages-browser/lib/Template.tsx`, `keybr-lesson-ui/lib/styles.ts`, `keybr-textinput-ui/lib/styles.ts` |
| `@gutentype/tools`, `@gutentype/tests` | every lane adds its own files (`lib/<lane>-*.ts`, `lib/<criterion>.test.ts`) | none |
| `@keybr/thirdparties` stub, `Shell.tsx`, `webpack.config.js` | integrator (done) | |

Dependency lines in Keybr `package.json` files and `bun.lock` have one writer: the integrator. A lane that needs a new dependency says so in its report.

## 1. Pack API (`@gutentype/content`, built)

- `Pack` (Keybr `Enum` item): `Pack.ALL`, `Pack.BSB`, `Pack.KJV`; `pack.info: PackInfo` is `pack.json` as built: `id, label, short, language, license, sourceUrl, sourceSha256, verses, omitted: string[] ("<bookId> <c>:<v>"), letters: [letter, count][] most frequent first, books: {id, name, chapters: number[]}[]`. Book ids are lowercase names with dashes (`john`, `1-samuel`, `song-of-solomon`).
- `pack.letterOrder`, `pack.letterCounts()`, `pack.book(id)`, `pack.isOmitted(book, c, v)`.
- `loadBook(pack, bookId): Promise<BookText>`; `chapters[c][v]`, `""` is an omitted verse (16 in BSB, none in KJV). One webpack chunk per book.
- `loadWords(pack)`: `[word, count][]`, every distinct lowercase `[a-z]+` run, most frequent first.
- `loadLearn(pack): LearnData` `{fragments: string[][], blocklist: string[], divineNames: string[]}`. Placeholder today; the Learn lane's `gutentype-tools/lib/build-learn.ts` writes the real `learn.json` for each pack (run after `build-packs.ts`, which resets it).
- `gutentypeProps.pack` (`itemProp("gutentype.pack", Pack.ALL, Pack.BSB)`), `activePack(settings)`, `activePackFromJson(json)`.
- Copy: `siteName`, `tagline`, `translationLabel(pack)` ("Berean Standard Bible (BSB)"), `homeLine(pack)`.
- Links: `GutentypePaths`, `readBookPath`, `readChapterPath`, `footerLinks(sha?)`, `sourceUrl(sha?)`, `gitSha` (from `process.env.GIT_SHA`, defined by the stub's `webpack-env.js`), `flaggedRoutes`.
- Counters: `countOnce(name, key?)`, `counterPath(name)`, `counterNames`.

Text rule: verses are stored exactly as the source has them. Keybr's text input already accepts `'` `"` `-` for curly quotes and dashes (`keybr-unicode/lib/normalize.ts:585-608`).

## 2. Read progress (`@gutentype/read` client, `@gutentype/server` server)

- Row: `VerseRow = {pack, book, chapter, verse, speed, accuracy, ts}`; speed in characters per minute as Keybr's `makeStats` gives it, accuracy 0..1, `ts` epoch ms.
- Signed out: IndexedDB database `gutentype-read`, store `rows`, key `[pack, book, chapter, verse]`.
- Signed in: `GET /_/gutentype/read?pack=<id>` returns `{rows: VerseRow[]}`; `PUT /_/gutentype/read` with body `{rows: VerseRow[]}` (only new rows) returns 204. Both 403 without a session.
- Merge: union by `(pack, book, chapter, verse)`, newest `ts` wins. Cursor: the first verse that is not omitted and has no row. Chapter done: every non-omitted verse has a row. Book done: every chapter done.
- First sign-in: GET, merge, PUT the local-only rows. No PUT happens without a session, and no session exists without consent (server-enforced): that is ISC-63.
- `@gutentype/read` exports, consumed by `@gutentype/pages`:
  - `ReadIndexPage`, `ReadBookPage`, `ReadChapterPage`, `SharePage`: React components taking no props (they read route params with react-router `useParams` and the pack from settings).
  - `NextVerseOffer`: no props; renders a one-click link to the next untyped verse of John in the active pack, or nothing.
  - `useReadProgress(pack): {rows: VerseRow[], loading: boolean}`, `nextUntypedVerse(rows, pack, bookId, bookInfo?)`.
  - `syncReadProgress(): Promise<void>`: the first-sign-in merge, called by the account page after sign-in.

## 3. Routes

One list, `GutentypePaths`: `/`, `/read`, `/read/:book`, `/read/:book/:chapter`, `/share` (card fields in the query: `pack, book, wpm, acc, date`; nothing else), `/share.png` (same query, PNG), `/translations`, `/privacy`, `/donate`, `/account`, each also under `/{locale}`.

- Browser: `gutentypeRoutes(Template, Title)` in `@gutentype/pages` returns a Fragment of `<Route>` elements (a function call, not a component: react-router asserts on element type). `App.tsx` renders it inside `<Routes>` before `*`, points `/` at `GutentypeHome` and `/account` at the Gutentype account page.
- Server: `@gutentype/server` registers a controller with a GET for each path above (locale variants included) that renders Keybr's `Shell` with `body`: real content from pack metadata only (book list, license text, privacy text, home line), so curl checks see it. It copies Keybr's `renderPage`/`pageData` (`server/lib/app/page/controller.tsx:186-227`) rather than importing it.
- 404 by env flag, default off: `GUTENTYPE_MULTIPLAYER` (`/multiplayer`, `/_/game/*`), `GUTENTYPE_HIGHSCORES` (`/high-scores`, `/_/high-scores`); also `/privacy-policy` and `/terms-of-service` (Keybr's keybr.com text), always 404. The browser hides the same routes with constants in `@gutentype/content` (`flaggedRoutes`).

## 4. Counters

`POST /_/count/{name}`, `name` in `book-finished`, `lesson-ten`; no body. The client is `countOnce` (`credentials: "omit"`, `keepalive`, a local once-flag). The server always answers 204, unknown names included, and never throws (Keybr's error handler logs every header, IP included). Table `gutentype_counter(name, day, count)`, primary key `(name, day)`; no id, IP or user column. `gutentype-tools/stats.ts` sums the last 90 days per name. Who sends: Read sends `book-finished` with the book id as key when a book is done; the Shell lane's home sends `lesson-ten` when the local result count first reaches ten.

## 5. Sign-in and account (Shell form, Server checks)

- `POST /auth/login/register-email` body `{email, birthYear, consent: true}`: 400 with no row written when `birthYear` says under 13 or `consent` is not `true`; 429 past 3 links per address per hour or 20 per IP per hour (`gutentype_sign_in_attempt(email_hash, ip_hash, created_at)`, salted SHA-256, pruned after an hour).
- `GET /auth/oauth-init/google?birthYear=&consent=true` stores both in the session beside Keybr's `authState`; the callback refuses to create a user without them. Google requests the `email` scope only; facebook and microsoft are not registered.
- `GET /login/{token}` renders a page with one "Sign in" button; `POST /login/{token}` consumes the token: single use, 15 minutes, made with `crypto.randomBytes`. Mail scanners that prefetch links cannot burn it.
- `DELETE /_/account` (Keybr's route) also deletes the person's login requests, read progress, sign-in attempts, their stats and settings files (and Keybr's renamed stats copies) and their entries in `highscores.json`.
- The consent sentence, shown before the first sync, plain words: "Signing in stores your email and your reading progress (which books and chapters you typed) so they follow you to other devices."

## 6. Stored data (for `/privacy`, `purgeUser` and the schema check)

Signed out: nothing on the server; in the browser, Keybr's settings and results (localStorage, IndexedDB `history`), Gutentype's read rows (IndexedDB `gutentype-read`), the counter once-flags, the theme cookie `prefs`. Signed in, on the server: Keybr tables `user` (id, email, name, anonymized, created_at), `user_external_id` (provider, id, name, url, image_url), `user_login_request`, `order` (always empty, checkout removed); Gutentype tables `gutentype_read_progress`, `gutentype_counter`, `gutentype_sign_in_attempt`; files under the data directory: per-user stats and settings, `highscores.json` entries; session files (14 days). Sessions use Keybr's cookie only after sign-in starts.

## 7. Phones and layout

At 390 px a phone lands on `/read` (Chuck, 2026-11-02); Learn stays desktop-first. `Template.tsx` carries `data-gt="layout"`, `data-gt="nav"` and `data-gt="main"` so a Gutentype stylesheet can stack the layout under 40rem; Read pages never use Keybr's `Screen` (60rem minimum width).

# Gutentype

Learn to touch-type. Every word you type is from the Bible.

Gutentype is a free typing trainer built on [Keybr](https://github.com/aradzie/keybr.com)'s adaptive lesson engine. It has two tracks:

* **Learn.** Keybr's lessons, unchanged in what makes them work: they start with six letters, add the next key once the current ones are fast and accurate, and focus on your weakest key. Every word in every lesson is a real word from the Bible in the translation you picked, and the order the letters unlock in comes from that translation's own text.
* **Read.** A chapter is the page. You type through a book verse by verse, with no timer, and pick up at the verse you stopped on. Finish a book and you get a card you can download and share.

No account is needed; your progress stays in your browser. Signing in (an emailed link or Google) only carries it to your other devices. No ads, no trackers, nothing to buy.

## Translations

The Berean Standard Bible (public domain) is the default and the King James Version sits beside it. A translation is a content pack in `packages/gutentype-content`, built from its canonical source file by `packages/gutentype-tools/lib/build-packs.ts`; each pack records its source URL and the file's SHA-256.

## Running it

Gutentype runs on Node 26 and installs with [bun](https://bun.sh):

```shell
bun install
bun run compile
bun run build
bun run start        # http://localhost:3000
```

Production runs from `packages/gutentype-deploy` (Docker, sqlite on a data volume).

## How it relates to Keybr

<!-- fork:start -->

Gutentype changes 4 of Keybr's own source files (this README included; the budget is under 15). Everything else lives in new `packages/gutentype-*` packages, so upstream fixes keep arriving with `packages/gutentype-tools/scripts/rebase-upstream.sh`.

**Modified Keybr files**

| File | Why |
|---|---|
| `README.md` | This file. |
| `webpack.config.js` | Drops Keybr's ads bundle entry. |
| `packages/keybr-pages-server/lib/Shell.tsx` | No third-party scripts; version meta; Gutentype title and metas; optional server-rendered body; plain-text label and footer. |
| `packages/server/lib/app/routes.ts` | Drops Keybr's checkout; registers Gutentype's controllers and the route gate. |

**Dependency lines added to Keybr manifests** (not counted)

| File | Why |
|---|---|
| `packages/keybr-pages-server/package.json` | Depends on @gutentype/content. |
| `packages/server/package.json` | Drops the Paddle SDK. |

**Deleted from Keybr**

| Path | Why |
|---|---|
| `packages/thirdparties` | Ads, analytics and consent scripts; replaced by packages/gutentype-thirdparties (same package name, no third-party code). |
| `packages/thirdparties-ads` | Ad network loader. |
| `packages/server/lib/app/checkout` | Paddle checkout for Keybr's premium tier; Gutentype sells nothing. |
| `packages/server/lib/app/auth/auth-email.test.ts` | Tests the reusable sign-in token that Gutentype replaces with single-use links; covered by gutentype-tests. |
| `Dockerfile` | Ran Keybr's devenv initdb, which seeds a login token on every start; replaced by packages/gutentype-deploy. |
| `docker-compose.yaml` | Built the removed Dockerfile; replaced by packages/gutentype-deploy/compose.yaml. |

Keybr's `package-lock.json` is left untouched: Gutentype installs with bun (`bun.lock`).

<!-- fork:end -->

## License

Gutentype is a fork of keybr.com by Aliaksandr Radzivanovich and its contributors, and like Keybr it is licensed under the GNU Affero General Public License v3.0 (see `LICENSE`). The source of the running site is linked from its footer.

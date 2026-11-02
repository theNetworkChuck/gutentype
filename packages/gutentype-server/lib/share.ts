import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BookInfo,
  Pack,
  siteName,
  translationLabel,
} from "@gutentype/content";
import { type Resvg } from "@resvg/resvg-js";
import { boldTtf, fontFamily, regularTtf } from "./font-data.ts";

/*
 * The finished-book card (ISC-18, ISC-55; CONTRACTS § 3). The share URL carries the card itself, so nothing is
 * stored for anyone: `pack, book, wpm, acc, date` and nothing else. Any other query field is ignored and never
 * reaches the page, the image or the og:image link.
 */

export type ShareCard = {
  readonly pack: Pack;
  readonly book: BookInfo;
  /** Words per minute, as the browser sent it. */
  readonly wpm: number;
  /** Accuracy 0..1 (the query may say `0.98` or `98`). */
  readonly acc: number;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** The five fields exactly as they came, in order, for the og:image link. */
  readonly query: string;
};

const numberPattern = /^\d{1,4}(\.\d{1,4})?$/;

/** The card in a share query, or null when any of the five fields is missing or wrong. */
export function parseShareCard(params: URLSearchParams): ShareCard | null {
  const raw = {
    pack: params.get("pack"),
    book: params.get("book"),
    wpm: params.get("wpm"),
    acc: params.get("acc"),
    date: params.get("date"),
  };
  const pack = Pack.ALL.find((p) => p.id === raw.pack);
  const book = pack != null && raw.book != null ? pack.book(raw.book) : null;
  if (pack == null || book == null) return null;
  if (raw.wpm == null || !numberPattern.test(raw.wpm)) return null;
  const wpm = Number(raw.wpm);
  if (!(wpm >= 0 && wpm <= 400)) return null;
  if (raw.acc == null || !numberPattern.test(raw.acc)) return null;
  let acc = Number(raw.acc);
  if (acc > 1) acc /= 100; // A percent.
  if (!(acc >= 0 && acc <= 1)) return null;
  if (raw.date == null || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
  const date = new Date(`${raw.date}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== raw.date
  )
    return null;
  const query = new URLSearchParams({
    pack: pack.id,
    book: book.id,
    wpm: raw.wpm,
    acc: raw.acc,
    date: raw.date,
  }).toString();
  return { pack, book, wpm, acc, date: raw.date, query };
}

/** The card's lines, shared by the page and the image so they always say the same thing. */
export function shareLines(
  card: Pick<ShareCard, "pack" | "book" | "wpm" | "acc" | "date">,
) {
  return {
    book: card.book.name,
    translation: translationLabel(card.pack),
    speed: `${Math.round(card.wpm)} WPM`,
    accuracy: `${Math.round(card.acc * 100)}% accuracy`,
    date: card.date,
  };
}

export const shareImageSize = { width: 1200, height: 630 } as const;

const escapeXml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function shareSvg(
  card: Pick<ShareCard, "pack" | "book" | "wpm" | "acc" | "date">,
): string {
  const { width, height } = shareImageSize;
  const lines = shareLines(card);
  const titleSize = Math.min(
    112,
    Math.floor(1060 / (lines.book.length * 0.62)),
  );
  const text = (
    y: number,
    size: number,
    weight: number,
    value: string,
    fill = "#1d2433",
  ) =>
    `<text x="72" y="${y}" font-family="${fontFamily}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#fbf8f1"/>`,
    `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#1d2433" stroke-width="4"/>`,
    text(120, 44, 700, siteName),
    text(214, 40, 400, "Finished"),
    text(214 + titleSize, titleSize, 700, lines.book),
    text(214 + titleSize + 62, 36, 400, lines.translation, "#3b4252"),
    text(510, 52, 700, `${lines.speed} · ${lines.accuracy}`),
    text(570, 34, 400, lines.date, "#3b4252"),
    `</svg>`,
  ].join("");
}

let fontFiles: Promise<string[]> | null = null;

/** The shipped fonts as files resvg can load; written once per process to a private temp directory. */
function shippedFontFiles(): Promise<string[]> {
  if (fontFiles == null) {
    fontFiles = (async () => {
      const hash = createHash("sha256")
        .update(regularTtf)
        .update(boldTtf)
        .digest("hex")
        .slice(0, 12);
      const dir = join(tmpdir(), `gutentype-fonts-${process.pid}-${hash}`);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const files = [
        join(dir, "OpenSans-Regular.ttf"),
        join(dir, "OpenSans-Bold.ttf"),
      ];
      await writeFile(files[0], Buffer.from(regularTtf, "base64"));
      await writeFile(files[1], Buffer.from(boldTtf, "base64"));
      return files;
    })();
    fontFiles.catch(() => (fontFiles = null));
  }
  return fontFiles;
}

type ResvgModule = { readonly Resvg: typeof Resvg };

let resvg: Promise<ResvgModule> | null = null;

/** `@resvg/resvg-js` is a native module, so the server bundle loads it from node_modules at run time. */
function loadResvg(): Promise<ResvgModule> {
  if (resvg == null) {
    resvg = import(
      /* webpackIgnore: true */ "@resvg/resvg-js"
    ) as Promise<ResvgModule>;
    resvg.catch(() => (resvg = null));
  }
  return resvg;
}

export type ShareImage = {
  readonly png: Buffer;
  readonly width: number;
  readonly height: number;
  /** Raw RGBA pixels. */
  readonly pixels: Buffer;
  /** Pixels dark enough to be text or the border. */
  readonly inkPixels: number;
};

/** Renders the card to a PNG with the shipped font only (system fonts off). */
export async function renderShareImage(card: {
  pack: string;
  book: string;
  wpm: number;
  acc: number;
  date: string;
}): Promise<ShareImage> {
  const pack = Pack.ALL.get(card.pack);
  const book = pack.book(card.book);
  if (book == null) {
    throw new TypeError(`Unknown book ${card.book}`);
  }
  const { Resvg } = await loadResvg();
  const rendered = new Resvg(
    shareSvg({ pack, book, wpm: card.wpm, acc: card.acc, date: card.date }),
    {
      font: {
        loadSystemFonts: false,
        fontFiles: await shippedFontFiles(),
        defaultFontFamily: fontFamily,
      },
    },
  ).render();
  const pixels = Buffer.from(rendered.pixels);
  let inkPixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 128 && pixels[i + 1] < 128 && pixels[i + 2] < 128)
      inkPixels++;
  }
  return {
    png: Buffer.from(rendered.asPng()),
    width: rendered.width,
    height: rendered.height,
    pixels,
    inkPixels,
  };
}

const cache = new Map<string, Buffer>();
const cacheSize = 200;

/** The PNG for a parsed card, from a small in-memory cache (Cloudflare caches it in front as well). */
export async function sharePng(card: ShareCard): Promise<Buffer> {
  let png = cache.get(card.query);
  if (png == null) {
    png = (
      await renderShareImage({
        pack: card.pack.id,
        book: card.book.id,
        wpm: card.wpm,
        acc: card.acc,
        date: card.date,
      })
    ).png;
    if (cache.size >= cacheSize) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(card.query, png);
  }
  return png;
}

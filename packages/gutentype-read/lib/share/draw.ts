import { type ShareCard, type ShareCardText, shareCardText } from "./card.ts";

/** Open Graph's preferred image size; the server's `/share.png` uses the same. */
export const shareCardSize = { width: 1200, height: 630 } as const;

/*
 * Neutral, high-contrast colors. Nothing on the card is carried by color: every value is a labeled word, and the
 * finished mark is a check drawn as a shape.
 */
const ink = "#1b1b1f";
const muted = "#55555c";
const paper = "#fbfaf7";
const rule = "#d9d6cf";
const fontFamily =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  size: number,
  maxWidth: number,
): void {
  let px = size;
  ctx.font = `${weight} ${px}px ${fontFamily}`;
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = `${weight} ${px}px ${fontFamily}`;
  }
}

function drawCheck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  ctx.lineWidth = 6;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y + r * 0.02);
  ctx.lineTo(x - r * 0.1, y + r * 0.38);
  ctx.lineTo(x + r * 0.5, y - r * 0.35);
  ctx.stroke();
}

/** Draws the card onto a 2D context of `shareCardSize`. */
export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  text: ShareCardText | null = shareCardText(card),
): void {
  const { width, height } = shareCardSize;
  const pad = 80;
  const maxWidth = width - pad * 2;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  if (text == null) return;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.fillStyle = ink;
  ctx.font = `700 34px ${fontFamily}`;
  ctx.fillText(text.site, pad, pad + 20);

  drawCheck(ctx, width - pad - 34, pad + 8, 34);

  ctx.fillStyle = muted;
  ctx.font = `500 38px ${fontFamily}`;
  ctx.fillText(text.heading, pad, 210);

  ctx.fillStyle = ink;
  fit(ctx, text.book, "800", 116, maxWidth);
  ctx.fillText(text.book, pad, 330);

  ctx.fillStyle = muted;
  fit(ctx, text.translation, "500", 38, maxWidth);
  ctx.fillText(text.translation, pad, 390);

  ctx.fillStyle = rule;
  ctx.fillRect(pad, 430, maxWidth, 3);

  ctx.fillStyle = ink;
  const stats = `${text.speed} · ${text.accuracy}`;
  fit(ctx, stats, "700", 54, maxWidth);
  ctx.fillText(stats, pad, 510);

  ctx.fillStyle = muted;
  ctx.font = `500 34px ${fontFamily}`;
  ctx.fillText(text.date, pad, 565);
}

/** The card as a PNG, drawn in this browser (ISC-18). */
export function shareCardPng(
  card: ShareCard,
  createCanvas: () => HTMLCanvasElement = () =>
    document.createElement("canvas"),
): Promise<Blob> {
  const canvas = createCanvas();
  canvas.width = shareCardSize.width;
  canvas.height = shareCardSize.height;
  const ctx = canvas.getContext("2d");
  if (ctx == null) {
    return Promise.reject(new Error("Canvas is not available"));
  }
  drawShareCard(ctx, card);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob != null) {
        resolve(blob);
      } else {
        reject(new Error("The card could not be drawn"));
      }
    }, "image/png");
  });
}

export function shareCardFileName(card: ShareCard): string {
  return `gutentype-${card.book}-${card.pack}-${card.date}.png`;
}

/** Saves the card's PNG through a temporary download link. */
export async function downloadShareCard(card: ShareCard): Promise<void> {
  const blob = await shareCardPng(card);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = shareCardFileName(card);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/*
 * Interface stubs fixed by docs/CONTRACTS.md § 2; the Read lane replaces each body. Every export keeps its name
 * and signature.
 */
import { type BookInfo, type Pack } from "@gutentype/content";
import { type ReactNode } from "react";

export type VerseRow = {
  readonly pack: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  /** Characters per minute, as Keybr's makeStats reports speed. */
  readonly speed: number;
  /** 0..1 */
  readonly accuracy: number;
  readonly ts: number;
};

export function ReadIndexPage(): ReactNode {
  return null;
}

export function ReadBookPage(): ReactNode {
  return null;
}

export function ReadChapterPage(): ReactNode {
  return null;
}

export function SharePage(): ReactNode {
  return null;
}

export function NextVerseOffer(): ReactNode {
  return null;
}

export function useReadProgress(_pack: Pack): {
  readonly rows: readonly VerseRow[];
  readonly loading: boolean;
} {
  return { rows: [], loading: true };
}

export function nextUntypedVerse(
  _rows: readonly VerseRow[],
  _pack: Pack,
  _bookId: string,
  _bookInfo?: BookInfo,
): { readonly chapter: number; readonly verse: number } | null {
  return null;
}

export async function syncReadProgress(): Promise<void> {}

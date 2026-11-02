/*
 * Gutentype ships no ads, no analytics, no consent banner and no checkout. Keybr's packages import these
 * names, so they exist, and every one of them renders nothing or holds a placeholder.
 */
import { type ReactNode } from "react";

export const slot1 = "";
export const slot2 = "";

export type AdDetails = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
};

export const inventory: Record<string, AdDetails> = {};

export function SetupAds(_props: { readonly children?: ReactNode }): ReactNode {
  return null;
}

export function AdBanner(_props: {
  readonly name: "BANNER_160X600_1" | "BANNER_970X90_1";
}): ReactNode {
  return null;
}

export function CloudflareAnalytics(_props: { id?: string }): ReactNode {
  return null;
}

export function GoogleTagManager(_props: { id?: string }): ReactNode {
  return null;
}

export function CookieDeclaration(_props: { id?: string }): ReactNode {
  return null;
}

export const googleTagManagerId = "0";
export const cloudflareAnalyticsId = "0";
export const cookiebotClientId = "0";
export const paddleToken = "0";
export const paddlePriceId = "0";

export const placeholder = "";

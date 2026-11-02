import { itemProp, Settings } from "@keybr/settings";
import { Pack } from "./pack.ts";

/** Settings Gutentype adds beside Keybr's. They sync for signed-in people through Keybr's settings store. */
export const gutentypeProps = {
  /** The active translation; an unknown id falls back to BSB. */
  pack: itemProp("gutentype.pack", Pack.ALL, Pack.BSB),
} as const;

export function activePack(settings: Settings): Pack {
  return settings.get(gutentypeProps.pack);
}

/** The pack in a raw settings object, such as the page data the server sends (signed-out: always BSB). */
export function activePackFromJson(json: unknown): Pack {
  if (json == null || typeof json !== "object") return Pack.BSB;
  return new Settings(json as any).get(gutentypeProps.pack);
}

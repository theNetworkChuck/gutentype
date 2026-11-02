import { activePack, Pack } from "@gutentype/content";
import { SettingsContext } from "@keybr/settings";
import { useContext } from "react";

/**
 * The active translation, or the default pack where no settings exist yet (Keybr's own Template test renders the
 * chrome without a SettingsLoader).
 */
export function useActivePack(): Pack {
  const context = useContext(SettingsContext);
  return context != null ? activePack(context.settings) : Pack.BSB;
}

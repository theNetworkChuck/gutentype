import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Language } from "@keybr/keyboard";
import {
  censor,
  makePhoneticModel,
  type PhoneticModel,
} from "@keybr/phonetic-model";

/** Keybr's English phonetic model, read from its asset file and censored exactly as Keybr's browser loader does. */
export function englishModel(): PhoneticModel {
  const path = fileURLToPath(
    import.meta.resolve("@keybr/phonetic-model/assets/model-en.data"),
  );
  return censor(
    makePhoneticModel(Language.EN, new Uint8Array(readFileSync(path))),
  );
}

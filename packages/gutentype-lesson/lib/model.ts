import { type Pack } from "@gutentype/content";
import { type Ngram1, type Ngram2 } from "@keybr/keyboard";
import { Letter, PhoneticModel } from "@keybr/phonetic-model";
import { type Filter } from "@keybr/phonetic-model";
import { type RNG } from "@keybr/rand";

/**
 * Keybr's phonetic model for the keyboard's language with each letter's relative frequency `f` replaced by the
 * pack's corpus count, so `guided.ts` (`Letter.frequencyOrder`) unlocks letters in the pack's order.
 *
 * Only `f` changes: the letters keep Keybr's array order, code points and labels, and words, n-grams and the
 * language come from the wrapped model. A letter the pack never uses gets frequency 0 and unlocks last.
 */
export function packModel(model: PhoneticModel, pack: Pack): PhoneticModel {
  const counts = pack.letterCounts();
  const total = model.letters.reduce(
    (sum, { codePoint }) => sum + (counts.get(codePoint) ?? 0),
    0,
  );
  const letters = model.letters.map(
    ({ codePoint, label }) =>
      new Letter(
        codePoint,
        total > 0 ? (counts.get(codePoint) ?? 0) / total : 0,
        label,
      ),
  );
  return new (class extends PhoneticModel {
    constructor() {
      super(model.language, letters);
    }

    override nextWord(filter: Filter, random?: RNG): string {
      return model.nextWord(filter, random);
    }

    override ngram1(): Ngram1 {
      return model.ngram1();
    }

    override ngram2(): Ngram2 {
      return model.ngram2();
    }
  })();
}

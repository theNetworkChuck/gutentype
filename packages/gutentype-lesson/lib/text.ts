// Word helpers copied from Keybr's `keybr-lesson/lib/text/words.ts` (AGPL, unchanged in behavior) rather than
// deep-imported, so an upstream refactor of that private module never breaks Gutentype.
import { type Language } from "@keybr/keyboard";
import { type Letter } from "@keybr/phonetic-model";
import { randomSample, type RNG, weightedRandomSample } from "@keybr/rand";

export type WordGenerator = () => string | "" | null;

export function randomWords(
  wordList: readonly string[],
  random: RNG,
): WordGenerator {
  return () => {
    if (wordList.length > 0) {
      return randomSample(wordList, random);
    } else {
      return null;
    }
  };
}

export function uniqueWords(nextWord: WordGenerator): WordGenerator {
  let last = "";
  return () => {
    let n = 0;
    let word = null;
    while (n < 3) {
      word = nextWord();
      if (word == null || word === "") {
        return null;
      }
      if (word !== last) {
        last = word;
        return word;
      }
      n++;
    }
    return word;
  };
}

export function mangledWords(
  nextWord: WordGenerator,
  language: Language,
  punctuators: readonly Letter[],
  {
    withCapitals = 0,
    withPunctuators = 0,
  }: {
    withCapitals?: number;
    withPunctuators?: number;
  },
  random: RNG,
): WordGenerator {
  return () => {
    let word = nextWord();
    if (word == null || word === "") {
      return null;
    }
    if (withCapitals > 0 && withCapitals >= random()) {
      word = language.capitalCase(word);
    }
    if (withPunctuators > 0 && withPunctuators >= random()) {
      const { codePoint } = weightedRandomSample(
        punctuators,
        ({ f }) => f,
        random,
      );
      switch (codePoint) {
        case 33:
          word = `${word}!`;
          break;
        case 34:
          word = `"${word}"`;
          break;
        case 39:
          word = `'${word}'`;
          break;
        case 44:
          word = `${word},`;
          break;
        case 45:
          word = `${word}-${nextWord()}`;
          break;
        case 46:
          word = `${word}.`;
          break;
        case 58:
          word = `${word}:`;
          break;
        case 59:
          word = `${word};`;
          break;
        case 63:
          word = `${word}?`;
          break;
      }
    }
    return word;
  };
}

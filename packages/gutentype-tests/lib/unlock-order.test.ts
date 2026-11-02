// ISC-9: guided lessons start at six letters, and the unlock order comes from the pack's corpus so that at least
// 50 distinct real words (three letters or more) exist at six letters and at every later stage.
import { test } from "node:test";
import { Pack } from "@gutentype/content";
import { packModel } from "@gutentype/lesson";
import { englishModel } from "@gutentype/tools/lib/learn-model.ts";
import { scriptureLesson } from "@gutentype/tools/lib/learn-sim.ts";
import { lessonProps } from "@keybr/lesson";
import { Filter, Letter } from "@keybr/phonetic-model";
import { makeKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { deepEqual, equal, isTrue } from "rich-assert";
import { included, unlockOrder } from "./learn-helpers.ts";

test("packModel replaces only each letter's frequency: Keybr's array order and labels stay", () => {
  const model = englishModel();
  for (const pack of [Pack.BSB, Pack.KJV]) {
    const m = packModel(model, pack);
    deepEqual(
      m.letters.map(({ codePoint, label }) => [codePoint, label]),
      model.letters.map(({ codePoint, label }) => [codePoint, label]),
    );
    equal(m.language, model.language);
    equal(
      Letter.frequencyOrder(m.letters)
        .map(({ codePoint }) => String.fromCodePoint(codePoint))
        .join(""),
      pack.letterOrder,
    );
  }
});

for (const pack of [Pack.BSB, Pack.KJV]) {
  for (const keyboardOrder of [false, true]) {
    test(`${pack.id}, keyboardOrder ${keyboardOrder}: six letters first, then at least 50 words at every stage`, async () => {
      const lesson = await scriptureLesson(
        pack,
        new Settings().set(lessonProps.guided.keyboardOrder, keyboardOrder),
      );
      const order = unlockOrder(lesson);
      equal(order.length, 26);
      if (!lesson.settings.get(lessonProps.guided.keyboardOrder)) {
        equal(
          order.map((l) => String.fromCodePoint(l.codePoint)).join(""),
          pack.letterOrder,
        );
      }
      const first = lesson.update(makeKeyStatsMap(lesson.letters, []));
      equal(first.findIncludedKeys().length, 6);
      equal(
        included(first),
        order
          .slice(0, 6)
          .map((l) => String.fromCodePoint(l.codePoint))
          .join(""),
      );
      const counts: number[] = [];
      for (let k = 6; k <= order.length; k++) {
        const n = new Set(lesson.dictionary.find(new Filter(order.slice(0, k))))
          .size;
        counts.push(n);
        isTrue(n >= 50, `${k} letters: ${n} words`);
      }
      console.log(
        pack.id,
        `keyboardOrder asked ${keyboardOrder}, used ${lesson.settings.get(lessonProps.guided.keyboardOrder)}:`,
        counts.join(" "),
      );
    });
  }
}

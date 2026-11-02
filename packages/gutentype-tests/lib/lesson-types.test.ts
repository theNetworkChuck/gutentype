// ISC-68: Learn offers only scripture: the lesson-type choice shows the scripture lesson and the person's own
// custom text; Keybr's books, code, common-words and numbers types are not offered, and a saved profile that
// points at one of them falls back to the scripture lesson.
// The DOM this file renders into, set up here so the package test script (server and bundler envs only) runs it too.
import "@keybr/test-env-browser";
import { test } from "node:test";
import {
  offeredLessonType,
  offeredLessonTypes,
  ScriptureLesson,
} from "@gutentype/lesson";
import { englishModel } from "@gutentype/tools/lib/learn-model.ts";
/* eslint-disable n/no-extraneous-import -- dependency lines for these three are the integrator's to add */
import { FakeIntlProvider } from "@keybr/intl";
import { KeyboardContext, Layout, loadKeyboard } from "@keybr/keyboard";
import { type Lesson, lessonProps, LessonType } from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { LessonSettings } from "@keybr/page-practice/lib/settings/LessonSettings.tsx";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
/* eslint-enable n/no-extraneous-import */
import { FakeResultContext } from "@keybr/result";
import { FakeSettingsContext, Settings, useSettings } from "@keybr/settings";
import { render } from "@testing-library/react";
import { createElement as h, type ReactNode } from "react";
import { deepEqual, equal, isNotNull, isNull, isTrue } from "rich-assert";

test("exactly two lesson types are offered: the scripture lesson and custom text", () => {
  deepEqual(offeredLessonTypes, [LessonType.GUIDED, LessonType.CUSTOM]);
  for (const type of LessonType.ALL) {
    equal(
      offeredLessonType(type),
      type === LessonType.CUSTOM ? LessonType.CUSTOM : LessonType.GUIDED,
    );
  }
});

function wrap(settings: Settings, child: ReactNode) {
  return h(FakeIntlProvider, {
    children: h(FakeSettingsContext, {
      initialSettings: settings,
      children: h(KeyboardContext.Provider, {
        value: loadKeyboard(Layout.EN_US),
        children: h(FakeResultContext, { children: child }),
      }),
    }),
  });
}

test("the practice settings show two lesson-type tabs", async () => {
  PhoneticModelLoader.loader = async () => englishModel();
  const r = render(wrap(new Settings(), h(LessonSettings)));
  isNotNull(await r.findByText("Guided lessons"));
  isNotNull(r.queryByText("Custom text"));
  for (const hidden of ["Common words", "Books", "Source code", "Numbers"])
    isNull(r.queryByText(hidden));
  r.unmount();
});

for (const saved of [
  LessonType.BOOKS,
  LessonType.CODE,
  LessonType.WORDLIST,
  LessonType.NUMBERS,
]) {
  test(`a saved profile on "${saved.id}" falls back to the scripture lesson`, async () => {
    PhoneticModelLoader.loader = async () => englishModel();
    const seen: Lesson[] = [];
    let type: LessonType | null = null;
    function Probe({ lesson }: { lesson: Lesson }) {
      const { settings } = useSettings();
      seen.push(lesson);
      type = settings.get(lessonProps.type);
      return h("span", { title: "lesson" }, lesson.constructor.name);
    }
    const r = render(
      wrap(
        new Settings().set(lessonProps.type, saved),
        h(LessonLoader, { children: (lesson: Lesson) => h(Probe, { lesson }) }),
      ),
    );
    isNotNull(await r.findByTitle("lesson"));
    isTrue(seen.length > 0 && seen.every((l) => l instanceof ScriptureLesson));
    equal(type, LessonType.GUIDED);
    r.unmount();
  });
}

test("custom text stays custom text", async () => {
  PhoneticModelLoader.loader = async () => englishModel();
  const seen: Lesson[] = [];
  const r = render(
    wrap(
      new Settings().set(lessonProps.type, LessonType.CUSTOM),
      h(LessonLoader, {
        children: (lesson: Lesson) => {
          seen.push(lesson);
          return h("span", { title: "lesson" }, "x");
        },
      }),
    ),
  );
  isNotNull(await r.findByTitle("lesson"));
  isTrue(seen.every((l) => !(l instanceof ScriptureLesson)));
  r.unmount();
});

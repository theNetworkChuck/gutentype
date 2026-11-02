import { afterEach, beforeEach, test } from "node:test";
import { lessonCountedFlag } from "@gutentype/content";
import { type Result, ResultContext, ResultFaker } from "@keybr/result";
import { act, render } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { deepEqual, equal } from "rich-assert";
import { LessonSpeedCounter } from "./LessonSpeedCounter.tsx";

const sent: { url: string; init: RequestInit }[] = [];
const savedFetch = globalThis.fetch;

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

let append: (results: readonly Result[]) => void = () => {};

function Results({
  initial,
  children,
}: {
  readonly initial: readonly Result[];
  readonly children: ReactNode;
}) {
  const [results, setResults] = useState(initial);
  append = (more) => setResults((before) => [...before, ...more]);
  return (
    <ResultContext.Provider
      value={{
        results,
        appendResults: append,
        clearResults: () => setResults([]),
      }}
    >
      {children}
    </ResultContext.Provider>
  );
}

test("one ping per lesson finished on the page, none for the history it loaded with", async () => {
  const faker = new ResultFaker();
  const history = faker.nextResultList(20);
  const r = render(
    <Results initial={history}>
      <LessonSpeedCounter />
    </Results>,
  );
  equal(sent.length, 0);
  equal(
    localStorage.getItem(lessonCountedFlag),
    String(Math.max(...history.map((h) => h.timeStamp))),
  );

  const [lesson] = faker.nextResultList(1);
  await act(async () => {
    append([lesson]);
  });
  equal(sent.length, 1);
  const [{ url, init }] = sent;
  equal(url.startsWith("/_/count/lesson-s"), true);
  deepEqual(
    { method: init.method, credentials: init.credentials, body: init.body },
    { method: "POST", credentials: "omit", body: undefined },
  );

  // The same lesson again (a remount, another tab, a sync) is not sent twice.
  await act(async () => {
    append([lesson]);
  });
  equal(sent.length, 1);

  const next = faker.nextResultList(2);
  await act(async () => {
    append(next);
  });
  equal(sent.length, 3);

  r.unmount();
});

test("a page reload does not count the lessons already counted", async () => {
  const faker = new ResultFaker();
  const results = faker.nextResultList(5);
  const first = render(
    <Results initial={[]}>
      <LessonSpeedCounter />
    </Results>,
  );
  await act(async () => {
    append(results);
  });
  equal(sent.length, 5);
  first.unmount();

  const second = render(
    <Results initial={results}>
      <LessonSpeedCounter />
    </Results>,
  );
  equal(sent.length, 5);
  second.unmount();
});

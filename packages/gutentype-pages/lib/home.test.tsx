/*
 * The homepage: one plain line naming the Bible and the translation (ISC-30), one button to typing (ISC-29), the
 * tour cleared before practice mounts (ISC-69), phones sent to Read on landing (ISC-43), and the lesson-ten counter.
 */
import { afterEach, test } from "node:test";
import { counterPath, homeLine, Pack } from "@gutentype/content";
import { type Result, ResultContext } from "@keybr/result";
import { Settings, useSettings } from "@keybr/settings";
import { act, fireEvent, render } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { deepEqual, equal, isNotNull, isNull } from "rich-assert";
import { HomeView, LessonTenCounter } from "./index.ts";
import { TestProviders } from "./providers.test-helper.tsx";

const seen: boolean[] = [];

function PracticeProbe() {
  const { settings } = useSettings();
  seen.push(settings.isNew);
  return <textarea aria-label="practice text" />;
}

function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function setScreenWidth(width: number | undefined) {
  Object.defineProperty(window, "screen", {
    configurable: true,
    writable: true,
    value: width == null ? undefined : { width },
  });
}

afterEach(() => {
  setWidth(1024);
  setScreenWidth(undefined);
});

test("the homepage line names the Bible and the active translation, then one button to typing", async () => {
  const r = render(
    <TestProviders settings={new Settings(undefined, true)}>
      <HomeView practice={<PracticeProbe />} />
    </TestProviders>,
  );
  await act(async () => {});
  isNotNull(r.queryByText(homeLine(Pack.BSB)));
  const start = r.getByRole("button", { name: "Start typing" });
  fireEvent.click(start);
  equal(document.activeElement, r.getByLabelText("practice text"));
  r.unmount();
});

test("the practice tour can never open: a new profile is cleared before practice mounts", async () => {
  seen.length = 0;
  const r = render(
    <TestProviders settings={new Settings(undefined, true)}>
      <HomeView practice={<PracticeProbe />} />
    </TestProviders>,
  );
  await act(async () => {});
  isNotNull(r.queryByLabelText("practice text"));
  deepEqual([...new Set(seen)], [false]);
  r.unmount();
});

test("a phone landing on / goes to Read", async () => {
  setWidth(390);
  const r = render(
    <TestProviders>
      <Routes>
        <Route path="/" element={<HomeView practice={<PracticeProbe />} />} />
        <Route path="/read" element={<p>Read index</p>} />
      </Routes>
    </TestProviders>,
  );
  await act(async () => {});
  isNotNull(r.queryByText("Read index"));
  r.unmount();
});

test("a desktop landing on / stays on Learn", async () => {
  setWidth(1440);
  const r = render(
    <TestProviders>
      <Routes>
        <Route path="/" element={<HomeView practice={<PracticeProbe />} />} />
        <Route path="/read" element={<p>Read index</p>} />
      </Routes>
    </TestProviders>,
  );
  await act(async () => {});
  isNull(r.queryByText("Read index"));
  isNotNull(r.queryByLabelText("practice text"));
  r.unmount();
});

test("the tenth result sends one anonymous lesson-ten count", () => {
  localStorage.clear();
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const results = (n: number) => Array.from({ length: n }) as Result[];
    const view = (n: number) => (
      <ResultContext.Provider
        value={{
          results: results(n),
          appendResults: () => {},
          clearResults: () => {},
        }}
      >
        <LessonTenCounter />
      </ResultContext.Provider>
    );
    const r = render(view(9));
    equal(requests.length, 0);
    r.rerender(view(10));
    r.rerender(view(11));
    equal(requests.length, 1);
    equal(requests[0].url, counterPath("lesson-ten"));
    equal(requests[0].init?.credentials, "omit");
    equal(requests[0].init?.body, undefined);
    r.unmount();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an account that already has many results does not count again", () => {
  localStorage.clear();
  let count = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    count++;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const r = render(
      <ResultContext.Provider
        value={{
          results: Array.from({ length: 40 }) as Result[],
          appendResults: () => {},
          clearResults: () => {},
        }}
      >
        <LessonTenCounter />
      </ResultContext.Provider>,
    );
    equal(count, 0);
    r.unmount();
  } finally {
    globalThis.fetch = realFetch;
  }
});

// Browser check (2026-11-02): before the viewport meta applies, a phone reports the 980px default layout width
// (traced in Chrome: innerWidth 980 at document start, 390 by DOMContentLoaded), so an innerWidth check alone can
// keep a phone on Learn. The screen width settles it.
test("a phone that still reports the 980px default layout width goes to Read", async () => {
  setWidth(980);
  setScreenWidth(390);
  const r = render(
    <TestProviders>
      <Routes>
        <Route path="/" element={<HomeView practice={<PracticeProbe />} />} />
        <Route path="/read" element={<p>Read index</p>} />
      </Routes>
    </TestProviders>,
  );
  await act(async () => {});
  isNotNull(r.queryByText("Read index"));
  r.unmount();
});

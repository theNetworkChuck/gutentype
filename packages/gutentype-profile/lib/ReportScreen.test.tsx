import { afterEach, test } from "node:test";
import { minComparisonLessons, populationPath } from "@gutentype/content";
import { FakeIntlProvider } from "@keybr/intl";
import { KeyboardProvider } from "@keybr/keyboard";
import { mockResult } from "@keybr/page-typing-test/lib/mock.ts";
import { FakeSettingsContext } from "@keybr/settings";
import { render } from "@testing-library/react";
import { equal, isNotNull, isNull } from "rich-assert";
import { ReportScreen } from "./ReportScreen.tsx";

const savedFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = savedFetch;
});

test("the typing test report says there is not enough data yet, and shows no percentage", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return Response.json({
      days: 90,
      since: "2026-08-05",
      lessons: minComparisonLessons - 1,
      speed: null,
      accuracy: null,
    });
  }) as typeof fetch;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <KeyboardProvider>
          <ReportScreen result={mockResult()} />
        </KeyboardProvider>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  isNotNull(await r.findByText(/Not enough data yet/));
  isNull(r.queryByText(/of all other people/));
  isNull(r.queryByText(/You are in the top/));
  equal(urls[0], populationPath);

  r.unmount();
});

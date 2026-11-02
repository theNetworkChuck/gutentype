import { test } from "node:test";
import { accuracyBuckets, speedBuckets } from "@gutentype/content";
import { FakeIntlProvider } from "@keybr/intl";
import { type SummaryStats } from "@keybr/result";
import { FakeSettingsContext } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { type ReactNode } from "react";
import { isNotNull, isNull } from "rich-assert";
import { AccuracyComparison, SpeedComparison } from "./Comparison.tsx";
import { type Comparison, comparisonOf } from "./population.ts";

function stats(
  speedCpm: number,
  topCpm: number,
  accuracy: number,
): SummaryStats {
  const metric = (avg: number, max: number) => ({
    last: avg,
    delta: 0,
    min: avg,
    max,
    avg,
  });
  return {
    count: 10,
    time: 60_000,
    speed: metric(speedCpm, topCpm),
    accuracy: metric(accuracy, accuracy),
    score: metric(1, 1),
  };
}

function ready(): Comparison {
  const speed = new Array<number>(speedBuckets).fill(0);
  speed[8] = 40; // 40 to 44 wpm
  speed[12] = 60; // 60 to 64 wpm
  const accuracy = new Array<number>(accuracyBuckets).fill(0);
  accuracy[90] = 25;
  accuracy[99] = 75;
  return comparisonOf({
    days: 90,
    since: "2026-08-05",
    lessons: 100,
    speed,
    accuracy,
  });
}

function wrap(node: ReactNode) {
  return render(
    <FakeIntlProvider>
      <FakeSettingsContext>{node}</FakeSettingsContext>
    </FakeIntlProvider>,
  );
}

test("the speed line and chart come from Gutentype's lessons", () => {
  // Average 50 wpm (250 cpm), top 70 wpm (350 cpm).
  const r = wrap(
    <SpeedComparison stats={stats(250, 350, 0.95)} comparison={ready()} />,
  );
  isNotNull(r.queryByText("40%"));
  isNotNull(r.container.querySelector("canvas"));
  isNotNull(
    r.queryByText(
      /of the 100 Learn lessons typed on Gutentype in the last 90 days/,
    ),
  );

  fireEvent.click(r.getByText("Top speed"));
  isNotNull(r.queryByText("100%"));

  r.unmount();
});

test("the accuracy line comes from Gutentype's lessons", () => {
  const r = wrap(
    <AccuracyComparison stats={stats(250, 350, 0.95)} comparison={ready()} />,
  );
  isNotNull(r.queryByText("25%"));
  r.unmount();
});

test("under 100 lessons: no chart, no percentage", () => {
  for (const comparison of [
    { kind: "not-enough", lessons: 12 },
    { kind: "loading" },
    { kind: "unavailable" },
  ] as const) {
    const r = wrap(
      <SpeedComparison stats={stats(250, 350, 0.95)} comparison={comparison} />,
    );
    isNull(r.container.querySelector("canvas"));
    isNull(r.queryByText(/%/));
    r.unmount();
  }
  const r = wrap(
    <AccuracyComparison
      stats={stats(250, 350, 0.95)}
      comparison={{ kind: "not-enough", lessons: 12 }}
    />,
  );
  isNotNull(r.queryByText(/Not enough data yet/));
  r.unmount();
});

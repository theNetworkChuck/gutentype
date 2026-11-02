import { minComparisonLessons } from "@gutentype/content";
import { AccuracyHistogram, SpeedHistogram } from "@keybr/chart";
import { useIntlNumbers } from "@keybr/intl";
import { ChartWrapper } from "@keybr/page-profile/lib/profile/ChartWrapper.tsx";
import { type SummaryStats } from "@keybr/result";
import {
  Explainer,
  Field,
  FieldList,
  Figure,
  Para,
  RadioBox,
  Value,
} from "@keybr/widget";
import { type ReactNode, useState } from "react";
import { type Comparison } from "./population.ts";

/*
 * Keybr's two Profile histograms (`SpeedHistogramSection`, `AccuracyHistogramSection` in `@keybr/page-profile`),
 * drawn from Gutentype's own 90-day lesson counts instead of keybr.com's shipped distribution (ISC-75). Same
 * layout, same charts; the copy says what the numbers are: Learn lessons typed on Gutentype, not keybr.com users.
 */

type Period = "average" | "top";

type Metric = {
  /** Caption and tab name, as Keybr has it. */
  readonly caption: string;
  /** "speed" or "accuracy", inside sentences. */
  readonly noun: string;
  /** "faster than" or "more accurate than". */
  readonly beats: string;
  /** "at that speed" or "at that accuracy". */
  readonly atThat: string;
};

const speedMetric: Metric = {
  caption: "Relative Typing Speed",
  noun: "speed",
  beats: "faster than",
  atThat: "at that speed",
};

const accuracyMetric: Metric = {
  caption: "Relative Accuracy",
  noun: "accuracy",
  beats: "more accurate than",
  atThat: "at that accuracy",
};

export function SpeedComparison({
  stats,
  comparison,
}: {
  readonly stats: SummaryStats;
  readonly comparison: Comparison;
}): ReactNode {
  const [period, setPeriod] = useState<Period>("average");
  const value = period === "top" ? stats.speed.max : stats.speed.avg;
  return (
    <ComparisonFigure
      metric={speedMetric}
      comparison={comparison}
      period={period}
      onSelectPeriod={setPeriod}
      percentile={(c) => c.speed.cdf(value)}
      hasValue={value > 0}
      chart={(c) => (
        <SpeedHistogram
          distribution={c.speed}
          thresholds={[{ label: periodLabel(period, speedMetric), value }]}
          width="100%"
          height="25rem"
        />
      )}
    />
  );
}

export function AccuracyComparison({
  stats,
  comparison,
}: {
  readonly stats: SummaryStats;
  readonly comparison: Comparison;
}): ReactNode {
  const [period, setPeriod] = useState<Period>("average");
  const value = period === "top" ? stats.accuracy.max : stats.accuracy.avg;
  return (
    <ComparisonFigure
      metric={accuracyMetric}
      comparison={comparison}
      period={period}
      onSelectPeriod={setPeriod}
      percentile={(c) => c.accuracy.cdf(c.accuracy.scale(value))}
      hasValue={value > 0}
      chart={(c) => (
        <AccuracyHistogram
          distribution={c.accuracy}
          thresholds={[{ label: periodLabel(period, accuracyMetric), value }]}
          width="100%"
          height="25rem"
        />
      )}
    />
  );
}

type Ready = Extract<Comparison, { kind: "ready" }>;

function periodLabel(period: Period, metric: Metric): string {
  return period === "top" ? `Top ${metric.noun}` : `Average ${metric.noun}`;
}

function ComparisonFigure({
  metric,
  comparison,
  period,
  onSelectPeriod,
  percentile,
  hasValue,
  chart,
}: {
  readonly metric: Metric;
  readonly comparison: Comparison;
  readonly period: Period;
  readonly onSelectPeriod: (period: Period) => void;
  readonly percentile: (comparison: Ready) => number;
  readonly hasValue: boolean;
  readonly chart: (comparison: Ready) => ReactNode;
}): ReactNode {
  return (
    <Figure>
      <Figure.Caption>{metric.caption}</Figure.Caption>
      <Explainer>
        <Figure.Description>
          This compares your {metric.noun} with every Learn lesson typed on
          Gutentype in the last 90 days. The lessons are counted anonymously:
          each one is only a {metric.noun} range, with no name or id.
        </Figure.Description>
      </Explainer>
      {comparison.kind === "ready" ? (
        <ReadyComparison
          metric={metric}
          comparison={comparison}
          period={period}
          onSelectPeriod={onSelectPeriod}
          percentile={percentile}
          hasValue={hasValue}
          chart={chart}
        />
      ) : (
        <Para align="center">
          <ComparisonStatus comparison={comparison} />
        </Para>
      )}
    </Figure>
  );
}

function ComparisonStatus({
  comparison,
}: {
  readonly comparison: Exclude<Comparison, Ready>;
}): ReactNode {
  switch (comparison.kind) {
    case "loading":
      return "Loading the comparison with other Gutentype lessons.";
    case "unavailable":
      return "The comparison with other Gutentype lessons could not be loaded. Try again later.";
    case "not-enough":
      return (
        <>
          Not enough data yet. The comparison appears once Gutentype has counted{" "}
          {minComparisonLessons} Learn lessons in the last 90 days; so far it
          has counted <Value value={comparison.lessons} />.
        </>
      );
  }
}

function ReadyComparison({
  metric,
  comparison,
  period,
  onSelectPeriod,
  percentile,
  hasValue,
  chart,
}: {
  readonly metric: Metric;
  readonly comparison: Ready;
  readonly period: Period;
  readonly onSelectPeriod: (period: Period) => void;
  readonly percentile: (comparison: Ready) => number;
  readonly hasValue: boolean;
  readonly chart: (comparison: Ready) => ReactNode;
}): ReactNode {
  const { formatPercents } = useIntlNumbers();
  const label = periodLabel(period, metric);
  return (
    <>
      <Para align="center">
        {hasValue ? (
          <>
            Your {label.toLowerCase()} is {metric.beats}{" "}
            <Value value={formatPercents(percentile(comparison))} /> of the{" "}
            {comparison.lessons} Learn lessons typed on Gutentype in the last{" "}
            {comparison.days} days.
          </>
        ) : (
          <>Finish a Learn lesson to see how your {metric.noun} compares.</>
        )}
      </Para>
      <ChartWrapper>{chart(comparison)}</ChartWrapper>
      <FieldList>
        <Field.Filler />
        <Field>
          <RadioBox
            name="period"
            value="average"
            checked={period === "average"}
            label={periodLabel("average", metric)}
            onSelect={() => {
              onSelectPeriod("average");
            }}
          />
        </Field>
        <Field>
          <RadioBox
            name="period"
            value="top"
            checked={period === "top"}
            label={periodLabel("top", metric)}
            onSelect={() => {
              onSelectPeriod("top");
            }}
          />
        </Field>
        <Field.Filler />
      </FieldList>
      <Explainer>
        <Figure.Legend>
          The higher the bar, the more lessons were typed {metric.atThat}. Your
          position is marked with the colored vertical lines.
        </Figure.Legend>
      </Explainer>
    </>
  );
}

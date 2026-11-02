import { type Comparison } from "@gutentype/profile/lib/population.ts";
import { useComparison } from "@gutentype/profile/lib/useComparison.ts";
import {
  AccuracyHistogram,
  RollingSpeedChart,
  SpeedHistogram,
  TimeToTypeHistogram,
} from "@keybr/chart";
import { useIntlNumbers } from "@keybr/intl";
import { useFormatter } from "@keybr/lesson-ui";
import { Replay } from "@keybr/page-typing-test/lib/components/Replay.tsx";
import * as styles from "@keybr/page-typing-test/lib/components/ReportScreen.module.less";
import { type TestResult } from "@keybr/page-typing-test/lib/session/index.ts";
import { views } from "@keybr/page-typing-test/lib/views.tsx";
import { Screen } from "@keybr/pages-shared";
import {
  Box,
  Button,
  Field,
  FieldList,
  formatDuration,
  Icon,
  Kbd,
  Name,
  NameValue,
  Para,
  Spacer,
  useHotkeys,
  useView,
  Value,
} from "@keybr/widget";
import { mdiSkipNext } from "@mdi/js";
import { type ReactNode } from "react";

/*
 * Replaces `@keybr/page-typing-test/lib/components/ReportScreen.tsx` at bundle time (keybr-replacements.json,
 * ISC-74). Keybr's report, unchanged except its two "faster than N% of all other people" blocks, which drew
 * keybr.com's shipped distribution: they now read Gutentype's 90-day Learn lesson counts (ISC-75), and say there
 * is not enough data yet under 100 lessons.
 */

export function ReportScreen({ result }: { result: TestResult }) {
  const { setView } = useView(views);
  const { formatNumber } = useIntlNumbers();
  const { speedUnit, formatSpeed } = useFormatter();
  const comparison = useComparison();

  const handleNext = () => setView("test");

  useHotkeys({
    ["Enter"]: handleNext,
  });

  const { time, speed, length, errors, accuracy } = result.stats;

  return (
    <Screen>
      <Box alignItems="center" justifyContent="center">
        <Indicator
          name="Speed"
          value={
            <Metric
              value={formatSpeed(speed, { unit: false })}
              unit={speedUnit.id}
            />
          }
        />
        <Separator />
        <Indicator
          name="Accuracy"
          value={
            <Metric value={`${formatNumber(accuracy * 100, 2)}`} unit="%" />
          }
        />
      </Box>

      <Para align="center">
        <NameValue name="Characters" value={formatNumber(length)} />
        <NameValue name="Errors" value={formatNumber(errors)} />
        <NameValue
          name="Time"
          value={formatDuration(time, { showMillis: true })}
        />
      </Para>

      <ReportComparison
        comparison={comparison}
        speed={speed}
        accuracy={accuracy}
      />

      <Box alignItems="center" justifyContent="center">
        <TimeToTypeHistogram
          steps={result.steps}
          width="45rem"
          height="15rem"
        />
      </Box>

      <Para align="center">Time to type a character histogram.</Para>

      <Box alignItems="center" justifyContent="center">
        <RollingSpeedChart
          stats={result.stats}
          steps={result.steps}
          width="45rem"
          height="15rem"
        />
      </Box>

      <Para align="center">Typing speed change over time chart.</Para>

      <Spacer size={3} />

      <Replay result={result} />

      <Spacer size={3} />

      <FieldList>
        <Field.Filler />
        <Field>
          <Button
            label="Next test"
            icon={<Icon shape={mdiSkipNext} />}
            onClick={handleNext}
          />
        </Field>
        <Field.Filler />
      </FieldList>

      <Para align="center">
        Press <Kbd>Enter</Kbd> to start a new test.
      </Para>
    </Screen>
  );
}

/** The two comparison blocks: Gutentype's histograms with 100+ lessons, otherwise one plain status line. */
function ReportComparison({
  comparison,
  speed,
  accuracy,
}: {
  readonly comparison: Comparison;
  readonly speed: number;
  readonly accuracy: number;
}): ReactNode {
  const { formatPercents } = useIntlNumbers();
  switch (comparison.kind) {
    case "loading":
      return (
        <Para align="center">
          Loading the comparison with other Gutentype lessons.
        </Para>
      );
    case "unavailable":
      return (
        <Para align="center">
          The comparison with other Gutentype lessons could not be loaded.
        </Para>
      );
    case "not-enough":
      return (
        <Para align="center">
          Not enough data yet to compare you with other Gutentype lessons.
        </Para>
      );
    case "ready": {
      const pSpeed = comparison.speed.cdf(speed);
      const pAccuracy = comparison.accuracy.cdf(
        comparison.accuracy.scale(accuracy),
      );
      return (
        <>
          <Box alignItems="center" justifyContent="center">
            <SpeedHistogram
              distribution={comparison.speed}
              thresholds={[{ label: "Speed", value: speed }]}
              width="45rem"
              height="15rem"
            />
          </Box>

          <Para align="center">
            <Name>
              Faster than <Value value={formatPercents(pSpeed)} /> of the Learn
              lessons typed on Gutentype in the last {comparison.days} days.
            </Name>{" "}
            <Name>
              You are in the top <Value value={formatPercents(top(pSpeed))} />.
            </Name>
          </Para>

          <Box alignItems="center" justifyContent="center">
            <AccuracyHistogram
              distribution={comparison.accuracy}
              thresholds={[{ label: "Accuracy", value: accuracy }]}
              width="45rem"
              height="15rem"
            />
          </Box>

          <Para align="center">
            <Name>
              More accurate than <Value value={formatPercents(pAccuracy)} /> of
              the Learn lessons typed on Gutentype in the last {comparison.days}{" "}
              days.
            </Name>{" "}
            <Name>
              You are in the top{" "}
              <Value value={formatPercents(top(pAccuracy))} />.
            </Name>
          </Para>
        </>
      );
    }
  }
}

function Indicator({ name, value }: { name: ReactNode; value: ReactNode }) {
  return (
    <div className={styles.indicator}>
      <div className={styles.indicatorValue}>
        <Value>{value}</Value>
      </div>
      <div className={styles.indicatorName}>
        <Name>{name}</Name>
      </div>
    </div>
  );
}

function Metric({ value, unit }: { value: ReactNode; unit: ReactNode }) {
  return (
    <>
      <span className={styles.valueLabel}>{value}</span>
      <span className={styles.unitLabel}>{unit}</span>
    </>
  );
}

function Separator() {
  return <div className={styles.separator} />;
}

function top(value: number) {
  return Math.max(0, 1 - value); // Takes care of negative zero.
}

// ISC-74: the bundle check finds this marker in the build, proving the swap.
ReportScreen.displayName = "GutentypeReportScreen";

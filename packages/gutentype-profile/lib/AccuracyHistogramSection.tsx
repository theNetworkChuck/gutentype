import { AccuracyComparison } from "@gutentype/profile/lib/Comparison.tsx";
import { useComparison } from "@gutentype/profile/lib/useComparison.ts";
import { type SummaryStats } from "@keybr/result";
import { type ReactNode } from "react";

/**
 * Replaces `@keybr/page-profile/lib/profile/AccuracyHistogramSection.tsx` at bundle time (keybr-replacements.json,
 * ISC-74): the same export, compared against Gutentype's own lessons (ISC-75).
 */
export function AccuracyHistogramSection({
  stats,
}: {
  stats: SummaryStats;
}): ReactNode {
  return <AccuracyComparison stats={stats} comparison={useComparison()} />;
}

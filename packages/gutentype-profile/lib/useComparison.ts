import { useEffect, useState } from "react";
import { type Comparison, loadComparison } from "./population.ts";

/** The comparison for Profile's histograms: loading first, then whatever `loadComparison` settles on. */
export function useComparison(): Comparison {
  const [comparison, setComparison] = useState<Comparison>({
    kind: "loading",
  });
  useEffect(() => {
    let mounted = true;
    void loadComparison().then((value) => {
      if (mounted) setComparison(value);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return comparison;
}

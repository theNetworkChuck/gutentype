// ISC-39: the scripture corpus does not slow learning. One simulated typist, the same code on both corpora:
// all 26 letters unlock in no more lessons on BSB than on Keybr's stock English, within 10 percent.
import { test } from "node:test";
import {
  compareLearningSpeed,
  fixedTypist,
  practiceTypist,
} from "@gutentype/tools/lib/learn-sim.ts";
import { isTrue } from "rich-assert";

for (const typist of [fixedTypist, practiceTypist]) {
  test(`${typist.name}: BSB unlocks every letter within 10 percent of stock English`, async () => {
    const { rows, stockTotal, bsbTotal } = await compareLearningSpeed(typist);
    for (const r of rows)
      console.log(`seed ${r.seed}: stock ${r.stock}, BSB ${r.bsb}`);
    console.log(
      `total stock ${stockTotal}, BSB ${bsbTotal}, ratio ${(bsbTotal / stockTotal).toFixed(3)}`,
    );
    isTrue(
      Number.isFinite(stockTotal) && Number.isFinite(bsbTotal),
      "both unlock all 26 letters",
    );
    isTrue(
      bsbTotal <= stockTotal * 1.1,
      `BSB ${bsbTotal} vs stock ${stockTotal}`,
    );
  });
}

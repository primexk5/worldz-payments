import assert from "node:assert/strict";
import test from "node:test";
import { spendableNear } from "./spendable.ts";

test("ordinary accounts retain required storage stake", () => {
  assert.equal(spendableNear("10000", "0", 800, "10"), 2000n);
});
test("staked funds are separate from liquid amount and can cover storage", () => {
  assert.equal(spendableNear("10000", "10000", 800, "10"), 10000n);
  assert.equal(spendableNear("10000", "4000", 800, "10"), 6000n);
});
test("unavailable balances clamp to zero and invalid usage is rejected", () => {
  assert.equal(spendableNear("100", "0", 800, "10"), 0n);
  assert.throws(() => spendableNear("1000", "0", -1, "10"));
});
test("NEP-448 exempts small accounts at the protocol boundary", () => {
  assert.equal(spendableNear("10000", "0", 770, "10"), 10000n);
  assert.equal(spendableNear("10000", "0", 771, "10"), 2290n);
});

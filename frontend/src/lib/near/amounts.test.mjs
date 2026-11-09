import assert from "node:assert/strict";
import test from "node:test";
import { calculateFee, calculateNet, formatUnitsExact, parseUnitsExact } from "./amounts.ts";
import { isVerifiedSettlement } from "./order-state.ts";

test("native NEAR conversion preserves all 24 decimal places", () => {
  assert.equal(parseUnitsExact("1.000000000000000000000001", 24).toString(), "1000000000000000000000001");
  assert.equal(formatUnitsExact("1000000000000000000000001", 24), "1.000000000000000000000001");
});

test("service checkout displays the quoted token amount rather than its USD value", () => {
  const quotedNearBaseUnits = "200000000000000000000000"; // $1 at $5 per NEAR
  const amountDisplay = formatUnitsExact(quotedNearBaseUnits, 24);
  assert.equal(amountDisplay, "0.2");
  assert.equal(parseUnitsExact(amountDisplay, 24).toString(), quotedNearBaseUnits);
  assert.notEqual(amountDisplay, "1");
});

test("NEP-141 conversion uses the metadata precision", () => {
  assert.equal(parseUnitsExact("24.125", 6).toString(), "24125000");
  assert.equal(formatUnitsExact("24125000", 6), "24.125");
});

test("invalid or over-precise amounts are rejected rather than rounded", () => {
  assert.throws(() => parseUnitsExact("1.0000001", 6), /at most 6 decimal places/);
  assert.throws(() => parseUnitsExact("-1", 24), /valid non-negative amount/);
  assert.throws(() => parseUnitsExact("1e-3", 24), /valid non-negative amount/);
});

test("fee arithmetic is integer-safe, floored, and capped at 500 bps", () => {
  assert.equal(calculateFee("101", 30), "0");
  assert.equal(calculateFee("10000", 30), "30");
  assert.equal(calculateFee("10000", 500), "500");
  assert.equal(calculateNet("10000", "30"), "9970");
  assert.throws(() => calculateFee("10000", 501), /outside the supported range/);
});

test("only a SETTLED state with a verified settlement receipt counts as settled", () => {
  assert.equal(isVerifiedSettlement({ state: "SETTLED", settlementReceiptId: "receipt-final-1" }), true);
  assert.equal(isVerifiedSettlement({ state: "SETTLED", settlementReceiptId: null }), false);
  assert.equal(isVerifiedSettlement({ state: "SETTLED" }), false);
  assert.equal(isVerifiedSettlement({ state: "PROCESSING", settlementReceiptId: "receipt-1" }), false);
  assert.equal(isVerifiedSettlement({ state: "PAYOUT_RETRYABLE", settlementReceiptId: "receipt-1" }), false);
});

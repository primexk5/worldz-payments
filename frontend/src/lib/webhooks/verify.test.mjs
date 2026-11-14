import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyWorldzWebhook } from "./verify.ts";

const secret = "worldz-test-secret-that-is-longer-than-32-characters";
const body = JSON.stringify({ id: "evt_1", type: "payment.confirmed", data: {} });
const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

test("accepts an authentic WorldzPayments signature", () => {
  assert.equal(verifyWorldzWebhook(body, signature, secret), true);
});

test("rejects tampered bodies and malformed signatures", () => {
  assert.equal(verifyWorldzWebhook(`${body} `, signature, secret), false);
  assert.equal(verifyWorldzWebhook(body, "sha256=bad", secret), false);
  assert.equal(verifyWorldzWebhook(body, signature, undefined), false);
});

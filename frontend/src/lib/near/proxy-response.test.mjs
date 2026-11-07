import assert from "node:assert/strict";
import test from "node:test";
import { proxyResponse } from "./proxy-response.ts";

test("successful no-content API replies stay successful through the proxy", async () => {
  for (const status of [204, 205, 304]) {
    const response = await proxyResponse(new Response(null, { status, headers: { "x-request-id": "payment" } }));
    assert.equal(response.status, status);
    assert.equal(response.body, null);
    assert.equal(response.headers.get("x-request-id"), "payment");
  }
});

test("JSON errors and success bodies keep their status and content", async () => {
  for (const status of [200, 400, 503]) {
    const response = await proxyResponse(Response.json({ status }, { status }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { status });
    assert.match(response.headers.get("content-type"), /application\/json/);
  }
});

test("proxy strips stale length and encoding headers but preserves cookies", async () => {
  const response = await proxyResponse(new Response("decoded", { headers: {
    "content-encoding": "gzip", "content-length": "100", "set-cookie": "session=valid; HttpOnly",
  } }));
  assert.equal(await response.text(), "decoded");
  assert.equal(response.headers.has("content-encoding"), false);
  assert.equal(response.headers.has("content-length"), false);
  assert.equal(response.headers.get("set-cookie"), "session=valid; HttpOnly");
});

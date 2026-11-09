import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Compile the real browser client, replacing only its environment configuration.
const source = await readFile(new URL("./api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function fixture(run) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = { sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  const compiledModule = { exports: {} };
  const config = (name) => { assert.equal(name, "./config"); return { NEAR_NETWORK_ID: "testnet" }; };
  new Function("require", "exports", "module", compiled)(config, compiledModule.exports, compiledModule);
  try { await run(compiledModule.exports.nearApi, storage); }
  finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
}

test("customers recover a transaction through POST once, then poll with their private capability", async () => fixture(async (api) => {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, ...init });
    if (url.endsWith("/claim")) return Response.json({ merchantId: "merchant", orderId: "order", editToken: "private-customer-token" });
    if (init.method === "POST") return new Response(null, { status: 204 });
    return Response.json({ state: "SETTLED", settlementReceiptId: "verified" });
  };
  await api.claimLink("link", "payer.testnet", "Yusef", { message: "proof" });
  await api.submitPaymentMeta("merchant", "order", undefined, "link", "hash");
  await Promise.all([api.order("merchant", "order", "hash"), api.order("merchant", "order", "hash")]);
  await api.order("merchant", "order", "hash");
  const submissions = requests.filter((r) => r.url.endsWith("/meta"));
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].headers["x-checkout-token"], "private-customer-token");
  assert.equal(JSON.parse(submissions[0].body).transactionHash, "hash");
  const reads = requests.filter((r) => !r.method);
  assert.equal(reads.length, 3);
  for (const request of reads) {
    assert.equal(request.headers["x-checkout-token"], "private-customer-token");
    assert.equal(request.credentials, "include");
    assert.equal(request.cache, "no-store");
    assert.equal(request.url.includes("transactionHash"), false);
    assert.equal(request.url.includes("private-customer-token"), false);
  }
}));

test("failed submissions can be retried and capabilities never cross order boundaries", async () => fixture(async (api, storage) => {
  storage.set("worldz:receipt-edit:merchant:order", "private-customer-token");
  let attempts = 0;
  const reads = [];
  globalThis.fetch = async (url, init) => {
    if (init.method === "POST") {
      attempts++;
      if (attempts === 1) return Response.json({ error: "RPC unavailable" }, { status: 503 });
      return new Response(null, { status: 204 });
    }
    reads.push({ url, ...init });
    return Response.json({ state: attempts === 1 ? "OPEN" : "PROCESSING" });
  };
  await assert.rejects(api.order("merchant", "order", "hash"), /RPC unavailable/);
  await api.order("merchant", "order", "hash");
  await api.order("merchant", "another-order");
  assert.equal(attempts, 2);
  assert.equal(reads[0].headers["x-checkout-token"], "private-customer-token");
  assert.equal(reads[2].headers["x-checkout-token"], undefined);
}));

test("verified receipts remain readable when transaction validation RPC is unavailable", async () => fixture(async (api, storage) => {
  storage.set("worldz:receipt-edit:merchant:order", "private-customer-token");
  globalThis.fetch = async (_url, init) => init.method === "POST"
    ? Response.json({ error: "RPC unavailable" }, { status: 503 })
    : Response.json({ state: "SETTLED", settlementReceiptId: "verified" });
  const order = await api.order("merchant", "order", "hash");
  assert.equal(order.settlementReceiptId, "verified");
}));

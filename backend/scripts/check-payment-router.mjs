// Read-only diagnosis. Prints an admin repair command; never signs or sends it.
const origin = process.argv[2] ?? "https://worldz-payments.vercel.app";
const network = process.argv[3] ?? "testnet";
if (!["testnet", "mainnet"].includes(network)) throw new Error("Network must be testnet or mainnet.");
const rpcUrl = process.env.WORLDZ_RPC_URL ?? (network === "testnet"
  ? "https://archival-rpc.testnet.fastnear.com" : "https://rpc.mainnet.near.org");

async function fetchJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}
async function query(params) {
  const response = await fetchJson(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "worldz-router-check", method: "query", params: { finality: "final", ...params } }),
  });
  if (response.error) throw new Error(JSON.stringify(response.error));
  return response.result;
}
const config = await fetchJson(new URL(`/api/v1/network-config?networkId=${network}`, origin));
const expectedKey = Buffer.from(config.signerPublicKeyBase64 ?? "", "base64");
if (expectedKey.length !== 32 || !config.signerKeyId || config.networkId !== network) throw new Error("API signing configuration is incomplete.");
const keyId = Buffer.from(config.signerKeyId);
const length = Buffer.alloc(4); length.writeUInt32LE(keyId.length);
const storageKey = Buffer.concat([Buffer.from("signer_keys"), length, keyId]);
const [view, state] = await Promise.all([
  query({ request_type: "call_function", account_id: config.routerId, method_name: "get_config", args_base64: "e30=" }),
  query({ request_type: "view_state", account_id: config.routerId, prefix_base64: storageKey.toString("base64") }),
]);
const router = JSON.parse(Buffer.from(view.result).toString());
if (router.networkId !== network || router.contractId !== config.routerId) throw new Error("Router network/account mismatch.");
const entry = state.values.find((v) => Buffer.from(v.key, "base64").equals(storageKey));
const stored = entry ? Buffer.from(entry.value, "base64") : null;
const installedKey = stored?.length === 36 && stored.readUInt32LE() === 32 ? stored.subarray(4) : null;
const matches = installedKey?.equals(expectedKey) ?? false;
console.log(JSON.stringify({ network, routerId: config.routerId, adminId: router.adminId, signerKeyId: config.signerKeyId,
  apiPublicKey: expectedKey.toString("base64"), routerPublicKey: installedKey?.toString("base64") ?? null,
  signerMatches: matches, paused: router.paused, storageReserveYocto: router.storageReserveYocto }, null, 2));
if (!matches) {
  const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
  const args = JSON.stringify({ key_id: config.signerKeyId, public_key_base64: expectedKey.toString("base64"), enabled: true });
  console.log("\nThe router admin must review and run this command to register the API's public signer key:");
  console.log(`near contract call-function as-transaction ${quote(config.routerId)} set_signer_key json-args ${quote(args)} prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${quote(router.adminId)} network-config ${network} sign-with-keychain send`);
  process.exitCode = 1;
}

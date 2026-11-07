import { NEAR_NATIVE_ASSET, NEAR_NETWORK_ID, NEAR_RPC_URL } from "./config";
import type { NearAsset, TokenMetadata } from "./types";
import { spendableNear } from "./spendable";

export const nativeNearAsset: NearAsset = NEAR_NATIVE_ASSET;

async function viewFunction<T>(contractId: string, methodName: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(NEAR_RPC_URL, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "worldz-frontend",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: methodName,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const result = (await response.json()) as { result?: { result?: number[] }; error?: { cause?: { name?: string }; message?: string } };
  if (!response.ok || result.error || !result.result?.result) {
    throw new Error(result.error?.message ?? `NEAR view call ${methodName} failed.`);
  }
  const text = new TextDecoder().decode(new Uint8Array(result.result.result));
  return JSON.parse(text) as T;
}

export async function getNativeNearBalance(accountId: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(NEAR_RPC_URL, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "worldz-frontend",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: accountId },
    }),
  });
  const result = (await response.json()) as { result?: { amount?: string }; error?: { message?: string } };
  if (!response.ok || result.error || !result.result?.amount) throw new Error(result.error?.message ?? "Could not read NEAR account balance.");
  return result.result.amount;
}

export async function getNativeNearAvailableBalance(accountId: string): Promise<bigint> {
  const response = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "worldz-frontend",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: accountId },
    }),
  });
  const result = (await response.json()) as { result?: { amount?: string; locked?: string; storage_usage?: number }; error?: { message?: string } };
  if (!response.ok || result.error || !result.result?.amount || result.result.locked == null || result.result.storage_usage == null) {
    throw new Error(result.error?.message ?? "Could not read available NEAR balance.");
  }
  const protocolResponse = await fetch(NEAR_RPC_URL, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "worldz-storage-cost", method: "EXPERIMENTAL_protocol_config", params: { finality: "final" } }),
  });
  const protocol = await protocolResponse.json() as { result?: { runtime_config?: { storage_amount_per_byte?: string } } };
  const perByte = protocol.result?.runtime_config?.storage_amount_per_byte;
  if (!protocolResponse.ok || !perByte) throw new Error("Could not read the NEAR storage staking requirement.");
  return spendableNear(result.result.amount, result.result.locked, result.result.storage_usage, perByte);
}

export async function estimateNearGasCostYocto(gasUnits: bigint): Promise<bigint> {
  const response = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "worldz-frontend", method: "gas_price", params: [null] }),
  });
  const result = (await response.json()) as { result?: { gas_price?: string }; error?: { message?: string } };
  if (!response.ok || result.error || !result.result?.gas_price) {
    throw new Error(result.error?.message ?? "Could not estimate the current NEAR gas cost.");
  }
  // The estimate is based on current protocol gas pricing with a 2x buffer; it is not a
  // confirmation-count heuristic. Actual execution gas is determined by NEAR receipts.
  return gasUnits * BigInt(result.result.gas_price) * 2n;
}

export async function getFungibleTokenMetadata(contractId: string): Promise<TokenMetadata> {
  const metadata = await viewFunction<TokenMetadata>(contractId, "ft_metadata");
  if (!Number.isInteger(metadata.decimals) || metadata.decimals < 0 || metadata.decimals > 255 || !metadata.symbol) {
    throw new Error("The fungible token returned invalid metadata.");
  }
  return metadata;
}

export async function getFungibleTokenBalance(contractId: string, accountId: string, signal?: AbortSignal): Promise<string> {
  return viewFunction<string>(contractId, "ft_balance_of", { account_id: accountId }, signal);
}

export interface TokenStoragePreflight {
  contractId: string;
  minimumDeposit: string;
  unregisteredAccountIds: string[];
}

export async function getTokenStoragePreflight(
  tokenContractId: string,
  accountIds: string[],
): Promise<TokenStoragePreflight> {
  const [bounds, ...balances] = await Promise.all([
    viewFunction<{ min: string; max: string | null }>(tokenContractId, "storage_balance_bounds"),
    ...accountIds.map((accountId) =>
      viewFunction<{ total: string; available: string } | null>(tokenContractId, "storage_balance_of", { account_id: accountId }),
    ),
  ]);
  const unregisteredAccountIds = accountIds.filter((_, index) => balances[index] == null);
  return { contractId: tokenContractId, minimumDeposit: bounds.min, unregisteredAccountIds };
}

export function formatAssetAmount(amount: string, asset: NearAsset): string {
  const base = BigInt(amount);
  const divisor = 10n ** BigInt(asset.decimals);
  const whole = base / divisor;
  const remainder = base % divisor;
  if (remainder === 0n) return `${whole} ${asset.symbol}`;
  const fraction = remainder.toString().padStart(asset.decimals, "0").replace(/0+$/, "");
  return `${whole}.${fraction} ${asset.symbol}`;
}

export function tokenBalanceArgs(accountId: string): Record<string, unknown> {
  return { account_id: accountId, networkId: NEAR_NETWORK_ID };
}

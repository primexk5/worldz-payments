import type { NearNetworkId } from "./types";

const networkValue = process.env.NEXT_PUBLIC_NEAR_NETWORK_ID ?? "testnet";

if (networkValue !== "testnet" && networkValue !== "mainnet") {
  throw new Error("NEXT_PUBLIC_NEAR_NETWORK_ID must be 'testnet' or 'mainnet'.");
}

export const NEAR_NETWORK_ID: NearNetworkId = networkValue;
export const NEAR_RPC_URL =
  process.env.NEXT_PUBLIC_NEAR_RPC_URL ??
  (NEAR_NETWORK_ID === "testnet"
    ? "https://rpc.testnet.near.org"
    : "https://rpc.mainnet.near.org");
export const NEAR_EXPLORER_URL =
  process.env.NEXT_PUBLIC_NEAR_EXPLORER_URL ??
  (NEAR_NETWORK_ID === "testnet"
    ? "https://testnet.nearblocks.io"
    : "https://nearblocks.io");
export const NEAR_CONTRACT_ID = process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID ?? "";
export const NEAR_NATIVE_ASSET = { type: "native", symbol: "NEAR", decimals: 24 } as const;

export function requireNearContractId(): string {
  if (!NEAR_CONTRACT_ID) {
    throw new Error("NEAR router is not configured. Set NEXT_PUBLIC_NEAR_CONTRACT_ID.");
  }
  return NEAR_CONTRACT_ID;
}

export function nearExplorerTransactionUrl(hash: string): string {
  return `${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(hash)}`;
}

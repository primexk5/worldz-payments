import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { NEAR_NETWORK_ID } from "./config";

let connectorPromise: Promise<NearConnector> | undefined;

export function getNearConnector(): Promise<NearConnector> {
  if (typeof window === "undefined") return Promise.reject(new Error("Wallet connection is only available in a browser."));
  connectorPromise ??= import("@hot-labs/near-connect").then(({ NearConnector: Connector }) =>
    new Connector({
      network: NEAR_NETWORK_ID,
      features: { testnet: NEAR_NETWORK_ID === "testnet", signAndSendTransaction: true, signMessage: true },
      footerBranding: null,
    }),
  );
  return connectorPromise;
}

export interface ConnectedNearWallet {
  wallet: NearWalletBase;
  accountId: string;
}

export async function connectNearWallet(): Promise<ConnectedNearWallet> {
  const connector = await getNearConnector();
  const wallet = await connector.connect();
  const accounts = await wallet.getAccounts({ network: NEAR_NETWORK_ID });
  const accountId = accounts[0]?.accountId;
  if (!accountId) throw new Error("The selected wallet did not return a NEAR account.");
  return { wallet, accountId };
}

export async function getConnectedNearWallet(): Promise<ConnectedNearWallet | null> {
  try {
    const connector = await getNearConnector();
    const { wallet, accounts } = await connector.getConnectedWallet();
    const accountId = accounts[0]?.accountId;
    if (!accountId) return null;
    return { wallet, accountId };
  } catch {
    return null;
  }
}

export async function disconnectNearWallet(): Promise<void> {
  const connector = await getNearConnector();
  await connector.disconnect();
}

export async function sendNearFunctionCall(input: {
  wallet: NearWalletBase;
  signerId: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  depositYocto: string;
  gas: string;
}): Promise<{ transactionHash: string; outcome: Awaited<ReturnType<NearWalletBase["signAndSendTransaction"]>> }> {
  const outcome = await input.wallet.signAndSendTransaction({
    network: NEAR_NETWORK_ID,
    signerId: input.signerId,
    receiverId: input.receiverId,
    actions: [{
      type: "FunctionCall",
      params: {
        methodName: input.methodName,
        args: input.args,
        gas: input.gas,
        deposit: input.depositYocto,
      },
    }],
  });
  const transactionHash = outcome.transaction?.hash;
  if (!transactionHash) throw new Error("The wallet returned no NEAR transaction hash.");
  return { transactionHash, outcome };
}

export function decodeNearNonce(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("The authentication challenge nonce must contain 32 bytes.");
  return bytes;
}

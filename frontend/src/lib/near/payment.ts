import type { NearWalletBase } from "@hot-labs/near-connect";
import { NEAR_CONTRACT_ID, NEAR_NETWORK_ID, requireNearContractId } from "./config";
import { nearApi } from "./api";
import { estimateNearGasCostYocto, getFungibleTokenBalance, getNativeNearAvailableBalance, getTokenStoragePreflight } from "./tokens";
import type { LinkClaim, OrderStatus, SignedOrderAuthorization } from "./types";
import { isVerifiedSettlement } from "./order-state";
export { isVerifiedSettlement } from "./order-state";

const YOCTO_PER_NEAR = 10n ** 24n;
const YOCTO_DEPOSIT = "1";
const TX_GAS = "180000000000000";
const STORAGE_GAS = "50000000000000";
const PENDING_PREFIX = "worldz:near:pending:";

export interface PendingPayment {
  version: 1;
  networkId: typeof NEAR_NETWORK_ID;
  contractId: string;
  merchantId: string;
  orderId: string;
  linkSlug: string | null;
  payerAccountId: string;
  transactionHash: string | null;
  createdAtMs: number;
}

export class TokenStorageRequiredError extends Error {
  constructor(readonly tokenContractId: string, readonly accountIds: string[], readonly minimumDeposit: string) {
    super(`Register ${accountIds.length} account(s) with ${tokenContractId} before paying.`);
    this.name = "TokenStorageRequiredError";
  }
}

function pendingKey(order: Pick<PendingPayment, "networkId" | "contractId" | "orderId">): string {
  return `${PENDING_PREFIX}${order.networkId}:${order.contractId}:${order.orderId}`;
}

export function savePendingPayment(payment: PendingPayment): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(pendingKey(payment), JSON.stringify(payment));
}

export function getPendingPayment(networkId: typeof NEAR_NETWORK_ID, contractId: string, orderId: string): PendingPayment | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(pendingKey({ networkId, contractId, orderId }));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingPayment;
    if (parsed.version !== 1 || parsed.networkId !== networkId || parsed.contractId !== contractId || parsed.orderId !== orderId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getPendingPaymentForSlug(slug: string): PendingPayment | null {
  if (typeof window === "undefined") return null;
  for (let index = 0; index < window.sessionStorage.length; index++) {
    const key = window.sessionStorage.key(index);
    if (!key?.startsWith(PENDING_PREFIX)) continue;
    try {
      const pending = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as PendingPayment | null;
      if (pending?.version === 1 && pending.linkSlug === slug) return pending;
    } catch { /* ignore corrupt browser-local progress */ }
  }
  return null;
}

export function clearPendingPayment(payment: Pick<PendingPayment, "networkId" | "contractId" | "orderId">): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(pendingKey(payment));
}

function assertAuthorization(authorization: SignedOrderAuthorization, payerAccountId: string): void {
  if (authorization.networkId !== NEAR_NETWORK_ID) throw new Error("This authorization is for a different NEAR network.");
  if (authorization.contractId !== requireNearContractId() || authorization.contractId !== NEAR_CONTRACT_ID) {
    throw new Error("The payment router does not match the signed authorization.");
  }
  if (authorization.expectedPayerAccountId && authorization.expectedPayerAccountId !== payerAccountId) {
    throw new Error(`This payment is authorized for ${authorization.expectedPayerAccountId}.`);
  }
  if (BigInt(authorization.amount) <= 0n) throw new Error("The authorized payment amount is invalid.");
  if (authorization.feeBps < 0 || authorization.feeBps > 500) throw new Error("The authorized fee exceeds the 5% cap.");
  if (authorization.expiresAtSeconds > 0 && Math.floor(Date.now() / 1000) >= authorization.expiresAtSeconds) {
    throw new Error("This payment authorization has expired. Request a new checkout.");
  }
}

export async function preflightFungibleTokenPayment(authorization: SignedOrderAuthorization): Promise<void> {
  if (authorization.asset.type !== "nep141") return;
  const accounts = [...new Set([
    authorization.contractId,
    authorization.payoutAccountId,
    authorization.feeRecipientAccountId,
  ])];
  const preflight = await getTokenStoragePreflight(authorization.asset.contractId, accounts);
  if (preflight.unregisteredAccountIds.length) {
    throw new TokenStorageRequiredError(
      preflight.contractId,
      preflight.unregisteredAccountIds,
      preflight.minimumDeposit,
    );
  }
}

export async function preflightPayerFunds(authorization: SignedOrderAuthorization, payerAccountId: string): Promise<void> {
  const gasUnits = BigInt(TX_GAS);
  const gasEstimate = await estimateNearGasCostYocto(gasUnits);
  const availableNear = await getNativeNearAvailableBalance(payerAccountId);
  if (authorization.asset.type === "native") {
    const required = BigInt(authorization.amount) + gasEstimate;
    if (availableNear < required) throw new Error("Your available NEAR balance must cover the exact payment amount plus estimated transaction gas.");
    return;
  }
  const tokenBalance = BigInt(await getFungibleTokenBalance(authorization.asset.contractId, payerAccountId));
  if (tokenBalance < BigInt(authorization.amount)) throw new Error(`Insufficient ${authorization.asset.symbol} balance for this payment.`);
  if (availableNear < gasEstimate + BigInt(YOCTO_DEPOSIT)) throw new Error("Your NEAR balance must cover transaction gas and the 1 yoctoNEAR token-call deposit.");
}

export async function registerFungibleTokenRecipients(input: {
  wallet: NearWalletBase;
  accountId: string;
  authorization: SignedOrderAuthorization;
  accountIds: string[];
  minimumDeposit: string;
}): Promise<string> {
  const tokenContractId = input.authorization.asset.type === "nep141"
    ? input.authorization.asset.contractId
    : null;
  if (!tokenContractId) throw new Error("Native NEAR payments do not require token storage registration.");
  const registrationGas = BigInt(STORAGE_GAS) * BigInt(input.accountIds.length);
  const gasEstimate = await estimateNearGasCostYocto(registrationGas);
  const registrationDeposit = BigInt(input.minimumDeposit) * BigInt(input.accountIds.length);
  const availableNear = await getNativeNearAvailableBalance(input.accountId);
  if (availableNear < registrationDeposit + gasEstimate) {
    throw new Error("The connected account needs enough NEAR for token storage deposits and transaction gas.");
  }
  const actions = input.accountIds.map((accountId) => ({
    type: "FunctionCall" as const,
    params: {
      methodName: "storage_deposit",
      args: { account_id: accountId, registration_only: true },
      gas: STORAGE_GAS,
      deposit: input.minimumDeposit,
    },
  }));
  const outcome = await input.wallet.signAndSendTransaction({
    network: NEAR_NETWORK_ID,
    signerId: input.accountId,
    receiverId: tokenContractId,
    actions,
  });
  if (outcome.status && "Failure" in outcome.status) throw new Error("Token storage registration failed on NEAR.");
  return outcome.transaction.hash;
}

export async function submitAuthorizedPayment(input: {
  wallet: NearWalletBase;
  accountId: string;
  claim: LinkClaim;
  linkSlug?: string;
  onSubmitted?: (pending: PendingPayment) => void;
}): Promise<PendingPayment> {
  const { authorization } = input.claim;
  assertAuthorization(authorization, input.accountId);
  await preflightFungibleTokenPayment(authorization);
  await preflightPayerFunds(authorization, input.accountId);
  const pending: PendingPayment = {
    version: 1,
    networkId: NEAR_NETWORK_ID,
    contractId: authorization.contractId,
    merchantId: input.claim.merchantId,
    orderId: input.claim.orderId,
    linkSlug: input.linkSlug ?? null,
    payerAccountId: input.accountId,
    transactionHash: null,
    createdAtMs: Date.now(),
  };
  // Save before opening the wallet: connectors may redirect to an external wallet and return to
  // this page after the signer has approved the transaction.
  savePendingPayment(pending);
  input.onSubmitted?.(pending);

  const outcome = authorization.asset.type === "native"
    ? await input.wallet.signAndSendTransaction({
        network: NEAR_NETWORK_ID,
        signerId: input.accountId,
        receiverId: authorization.contractId,
        actions: [{
          type: "FunctionCall",
          params: {
            methodName: "pay_native",
            args: { authorization, signature: authorization.signature },
            gas: TX_GAS,
            deposit: authorization.amount,
          },
        }],
      })
    : await input.wallet.signAndSendTransaction({
        network: NEAR_NETWORK_ID,
        signerId: input.accountId,
        receiverId: authorization.asset.contractId,
        actions: [{
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: {
              receiver_id: authorization.contractId,
              amount: authorization.amount,
              msg: JSON.stringify({ action: "pay", authorization, signature: authorization.signature }),
            },
            gas: TX_GAS,
            deposit: YOCTO_DEPOSIT,
          },
        }],
      });

  if (outcome.status && "Failure" in outcome.status) {
    throw new Error("The NEAR transaction failed. Check the wallet and retry after verifying its status.");
  }
  const submitted = { ...pending, transactionHash: outcome.transaction.hash };
  savePendingPayment(submitted);
  input.onSubmitted?.(submitted);
  void nearApi
    .submitPaymentMeta(input.claim.merchantId, input.claim.orderId, undefined, input.linkSlug, outcome.transaction.hash)
    .catch(() => undefined);
  return submitted;
}

/** Only the API/indexer's reconciled final state can promote a wallet submission to SETTLED. */
export async function waitForVerifiedSettlement(
  merchantId: string,
  orderId: string,
  onStatus?: (status: OrderStatus) => void,
  timeoutMs = 180_000,
  transactionHash?: string | null,
): Promise<OrderStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await nearApi.order(merchantId, orderId, transactionHash);
    onStatus?.(status);
    if (isVerifiedSettlement(status) || status.state === "REFUNDED" || status.state === "RECONCILIATION_REQUIRED") {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Payment is still processing. Your order is saved; check its status before trying again.");
}

export const YOCTO_NEAR = YOCTO_PER_NEAR;
export function nearUnitsFromNear(near: string): bigint {
  if (!/^\d+(?:\.\d{1,24})?$/.test(near)) throw new Error("Invalid NEAR amount.");
  const [whole, fraction = ""] = near.split(".");
  return BigInt(whole!) * YOCTO_PER_NEAR + BigInt((fraction + "0".repeat(24)).slice(0, 24));
}

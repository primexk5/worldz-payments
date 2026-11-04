import { nearApi } from "./api";
import { NEAR_NETWORK_ID } from "./config";
import { decodeNearNonce } from "./wallet";
import type { AuthSession } from "./types";
import type { NearWalletBase } from "@hot-labs/near-connect";

export async function signInWithNearWallet(wallet: NearWalletBase, accountId: string): Promise<AuthSession> {
  const state = crypto.randomUUID();
  const challenge = await nearApi.challenge(accountId, state, { purpose: "login" });
  if (challenge.networkId !== NEAR_NETWORK_ID || challenge.state !== state) {
    throw new Error("The authentication challenge did not match this browser session and network.");
  }
  const signed = await wallet.signMessage({
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: decodeNearNonce(challenge.nonce),
    network: NEAR_NETWORK_ID,
  });
  if (signed.accountId !== accountId) {
    throw new Error("The wallet signed in with a different NEAR account. Confirm the account and retry.");
  }
  return nearApi.login({
    accountId,
    publicKey: signed.publicKey,
    signature: signed.signature,
    message: challenge.message,
    nonce: challenge.nonce,
    state,
  });
}

export async function onboardWithNearWallet(input: {
  wallet: NearWalletBase;
  accountId: string;
  payoutAccountId: string;
  displayName: string;
  webhookUrl?: string;
}): Promise<AuthSession> {
  const state = crypto.randomUUID();
  const challenge = await nearApi.challenge(input.accountId, state, {
    purpose: "onboarding",
    payoutAccountId: input.payoutAccountId,
    displayName: input.displayName,
    webhookUrl: input.webhookUrl,
  });
  if (challenge.networkId !== NEAR_NETWORK_ID || challenge.state !== state) {
    throw new Error("The onboarding challenge did not match this browser session and network.");
  }
  const signed = await input.wallet.signMessage({
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: decodeNearNonce(challenge.nonce),
    network: NEAR_NETWORK_ID,
  });
  if (signed.accountId !== input.accountId) throw new Error("The signed account changed during onboarding.");
  return nearApi.onboarding({
    accountId: input.accountId,
    payoutAccountId: input.payoutAccountId,
    displayName: input.displayName,
    webhookUrl: input.webhookUrl,
    proof: {
      message: challenge.message,
      nonce: challenge.nonce,
      state,
      publicKey: signed.publicKey,
      signature: signed.signature,
    },
  });
}

export async function updatePayoutWithNearWallet(input: {
  wallet: NearWalletBase;
  accountId: string;
  payoutAccountId: string;
}): Promise<AuthSession["merchant"]> {
  const state = crypto.randomUUID();
  const challenge = await nearApi.challenge(input.accountId, state, {
    purpose: "payout_update",
    payoutAccountId: input.payoutAccountId,
  });
  if (challenge.networkId !== NEAR_NETWORK_ID || challenge.state !== state) {
    throw new Error("The payout authorization challenge did not match this session.");
  }
  const signed = await input.wallet.signMessage({
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: decodeNearNonce(challenge.nonce),
    network: NEAR_NETWORK_ID,
  });
  if (signed.accountId !== input.accountId) throw new Error("Confirm the signed-in merchant account to change payouts.");
  return nearApi.updatePayoutAddress({
    payoutAccountId: input.payoutAccountId,
    proof: {
      accountId: input.accountId,
      message: challenge.message,
      nonce: challenge.nonce,
      state,
      publicKey: signed.publicKey,
      signature: signed.signature,
    },
  });
}

import { NEAR_NETWORK_ID } from "./config";
import type {
  ApiError,
  AllowedFungibleToken,
  AuthChallenge,
  AuthSession,
  DashboardDelivery,
  LinkClaim,
  MerchantApiKey,
  MerchantProfile,
  NewMerchantApiKey,
  OrderStatus,
  PaymentLink,
} from "./types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: `Request failed (${response.status}).` }))) as ApiError;
    throw new Error(error.error ?? `Request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const body = (value: unknown) => JSON.stringify(value);

export const nearApi = {
  request,
  challenge(accountId: string, state: string, intent: { purpose: "login" | "onboarding" | "payout_update"; payoutAccountId?: string; displayName?: string; webhookUrl?: string } = { purpose: "login" }) {
    return request<AuthChallenge>("/auth/challenge", {
      method: "POST",
      body: body({ accountId, networkId: NEAR_NETWORK_ID, state, ...intent }),
    });
  },
  login(input: { accountId: string; publicKey: string; signature: string; message: string; nonce: string; state: string }) {
    return request<AuthSession>("/auth/login", {
      method: "POST",
      body: body({ ...input, networkId: NEAR_NETWORK_ID }),
    });
  },
  logout() {
    return request<void>("/auth/logout", { method: "POST" });
  },
  me() {
    return request<MerchantProfile>("/me");
  },
  updateProfile(input: Partial<Pick<MerchantProfile, "displayName" | "webhookUrl">>) {
    return request<MerchantProfile>("/me", { method: "PATCH", body: body(input) });
  },
  updatePayoutAddress(input: { payoutAccountId: string; proof: { accountId: string; message: string; nonce: string; state: string; publicKey: string; signature: string } }) {
    return request<MerchantProfile>("/me/payouts", { method: "PUT", body: body({ ...input, networkId: NEAR_NETWORK_ID }) });
  },
  deliveries() {
    return request<{ deliveries: DashboardDelivery[] }>("/me/deliveries");
  },
  links() {
    return request<{ links: PaymentLink[] }>("/links");
  },
  allowedAssets() {
    return request<{ tokens: AllowedFungibleToken[] }>(`/assets?networkId=${NEAR_NETWORK_ID}`);
  },
  createLink(input: Omit<PaymentLink, "slug" | "createdAtMs" | "claimsUsed" | "merchantId" | "payoutAccountId">) {
    return request<PaymentLink>("/links", { method: "POST", body: body(input) });
  },
  link(slug: string) {
    return request<PaymentLink>(`/links/${encodeURIComponent(slug)}`);
  },
  claimLink(slug: string, payerAccountId: string) {
    return request<LinkClaim>(`/links/${encodeURIComponent(slug)}/claim`, {
      method: "POST",
      body: body({ payerAccountId, networkId: NEAR_NETWORK_ID }),
    });
  },
  order(merchantId: string, orderId: string) {
    return request<OrderStatus>(`/orders/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}?networkId=${NEAR_NETWORK_ID}`);
  },
  submitPaymentMeta(merchantId: string, orderId: string, customerName?: string, slug?: string) {
    return request<void>(`/orders/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}/meta`, {
      method: "POST",
      body: body({ customerName, slug, networkId: NEAR_NETWORK_ID }),
    });
  },
  apiKeys() {
    return request<{ keys: MerchantApiKey[] }>("/me/apikeys");
  },
  createApiKey(label: string) {
    return request<NewMerchantApiKey>("/me/apikeys", { method: "POST", body: body({ label }) });
  },
  revokeApiKey(keyRef: string) {
    return request<void>(`/me/apikeys/${encodeURIComponent(keyRef)}`, { method: "DELETE" });
  },
  onboarding(input: {
    accountId: string;
    payoutAccountId: string;
    displayName: string;
    webhookUrl?: string;
    proof: { message: string; nonce: string; state: string; publicKey: string; signature: string };
  }) {
    return request<AuthSession>("/onboarding", { method: "POST", body: body({ ...input, networkId: NEAR_NETWORK_ID }) });
  },
};

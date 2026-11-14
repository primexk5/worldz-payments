import { NEAR_NETWORK_ID } from "./config";
import type {
  ApiError,
  AllowedFungibleToken,
  NearAsset,
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
import type { AttemptStatus, OneClickAttempt, OneClickQuote, OneClickToken } from "@/lib/crosschain/types";

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

function checkoutHeaders(merchantId: string, orderId: string): Record<string, string> {
  const token = typeof window === "undefined" ? null : window.sessionStorage.getItem(`worldz:receipt-edit:${merchantId}:${orderId}`);
  return token ? { "x-checkout-token": token } : {};
}

// Polling must not repeat an expensive RPC-backed submission on every status read.
const submissions = new Map<string, Promise<void>>();

function submitTransaction(merchantId: string, orderId: string, transactionHash: string, slug?: string): Promise<void> {
  const key = `${merchantId}:${orderId}:${transactionHash}`;
  const existing = submissions.get(key);
  if (existing) return existing;
  const submission = request<void>(`/orders/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}/meta`, {
    method: "POST",
    headers: checkoutHeaders(merchantId, orderId),
    body: body({ transactionHash, slug, networkId: NEAR_NETWORK_ID }),
  }).catch((error) => { submissions.delete(key); throw error; });
  if (submissions.size >= 256) submissions.delete(submissions.keys().next().value!);
  submissions.set(key, submission);
  return submission;
}

export const nearApi = {
  request,
  challenge(accountId: string, state: string, intent: { purpose: "login" | "onboarding" | "payout_update" | "checkout"; checkoutSlug?: string; payoutAccountId?: string; displayName?: string; webhookUrl?: string } = { purpose: "login" }) {
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
  shopifyConnection() {
    return request<{ shops: { shopDomain: string; scopes: string; installedAtMs: number }[] }>("/shopify/connection");
  },
  shopifyCheckout(slug: string) {
    return request<{ productTitle: string; variantTitle: string; requiresShipping: boolean; networkId: string; asset: PaymentLink["asset"]; amountDisplay: string }>(`/shopify/checkouts/${encodeURIComponent(slug)}`);
  },
  saveShopifyBuyerDetails(slug: string, details: { email: string; firstName: string; lastName: string; address1: string; address2: string; city: string; province: string; postalCode: string; countryCode: string; phone: string }) {
    return request<void>(`/shopify/checkouts/${encodeURIComponent(slug)}`, { method: "PUT", body: body(details) });
  },
  updateProfile(input: Partial<Pick<MerchantProfile, "displayName" | "webhookUrl">>) {
    return request<MerchantProfile>("/me", { method: "PATCH", body: body(input) });
  },
  updatePayoutAddress(input: { payoutAccountId: string; proof: { accountId: string; message: string; nonce: string; state: string; publicKey: string; signature: string } }) {
    return request<MerchantProfile>("/me/payouts", { method: "PUT", body: body({ ...input, networkId: NEAR_NETWORK_ID }) });
  },
  retryWebhook(eventId: string) {
    return request<{ eventId: string; state: "pending" }>(`/me/deliveries/${encodeURIComponent(eventId)}/retry`, { method: "POST" });
  },
  deliveries() {
    return request<{ deliveries: DashboardDelivery[] }>("/me/deliveries");
  },
  links() {
    return request<{ links: PaymentLink[] }>("/links");
  },
  allowedAssets(signal?: AbortSignal) {
    return request<{ tokens: AllowedFungibleToken[] }>(`/assets?networkId=${NEAR_NETWORK_ID}`, { signal });
  },
  vtpassCategories() {
    return request<{ content?: { identifier: string; name: string }[] }>("/vtpass/categories");
  },
  vtpassServices(identifier: string) {
    return request<{ content?: { serviceID: string; name: string; minimium_amount?: string; maximum_amount?: string; product_type?: string }[] }>(`/vtpass/services?identifier=${encodeURIComponent(identifier)}`);
  },
  vtpassVariations(serviceId: string) {
    return request<{ content?: { variations?: { variation_code: string; name: string; variation_amount: string; fixedPrice?: string }[] } }>(`/vtpass/variations?serviceId=${encodeURIComponent(serviceId)}`);
  },
  vtpassQuote(input: { amountNgn: string; asset: NearAsset }) {
    return request<{ quoteId: string; amountNgn: string; amountUsd: string; asset: NearAsset; tokenAmountBaseUnits: string; exchangeRateNgnPerUsd: string; fxSource: string; fxSourceUpdatedAtSeconds: number; tokenUsdPrice: string; tokenPriceSource: string; tokenPriceUpdatedAtSeconds: number; expiresAtSeconds: number }>("/vtpass/quote", { method: "POST", body: body(input) });
  },
  vtpassVerify(input: { serviceID: string; billersCode: string; type?: string }) {
    return request<Record<string, unknown>>("/vtpass/verify", { method: "POST", body: body(input) });
  },
  vtpassCreatePurchase(input: { linkSlug: string; quoteId: string; category: string; serviceID: string; variationCode?: string; providerFields: Record<string, string> }) {
    return request<{ purchaseId: string; linkSlug: string; category: string; serviceID: string; amountNgn: string; amountUsd: string; state: string; networkId: string }>("/vtpass/purchases", { method: "POST", body: body(input) });
  },
  vtpassPurchase(purchaseId: string) {
    return request<VtpassPurchaseStatus>(`/vtpass/purchases/${encodeURIComponent(purchaseId)}`, { cache: "no-store" });
  },
  vtpassFulfill(purchaseId: string) {
    return request<VtpassPurchaseStatus>(`/vtpass/purchases/${encodeURIComponent(purchaseId)}/fulfill`, { method: "POST", body: "{}" });
  },
  createLink(input: Omit<PaymentLink, "slug" | "createdAtMs" | "claimsUsed" | "merchantId" | "payoutAccountId">) {
    return request<PaymentLink>("/links", { method: "POST", body: body(input) });
  },
  deleteLink(slug: string) {
    return request<void>(`/links/${encodeURIComponent(slug)}`, { method: "DELETE" });
  },
  link(slug: string) {
    return request<PaymentLink>(`/links/${encodeURIComponent(slug)}`);
  },
  oneclickTokens() {
    return request<{ mode: string; tokens: OneClickToken[] }>("/oneclick/tokens", { cache: "no-store" });
  },
  oneclickQuote(slug: string, input: { originAsset: string; refundTo: string; slippageBps?: number }) {
    return request<OneClickQuote>(`/links/${encodeURIComponent(slug)}/oneclick/quote`, { method: "POST", body: body(input) });
  },
  oneclickCreateAttempt(slug: string, input: { originAsset: string; refundTo: string; slippageBps?: number }) {
    return request<OneClickAttempt>(`/links/${encodeURIComponent(slug)}/oneclick/attempts`, { method: "POST", body: body(input) });
  },
  oneclickSubmitDeposit(attemptId: string, txHash: string) {
    return request<{ attemptId: string; status: string; orderState: string | null; simulated: boolean }>(`/oneclick/attempts/${encodeURIComponent(attemptId)}/deposit`, { method: "POST", body: body({ txHash }) });
  },
  oneclickAttempt(attemptId: string) {
    return request<AttemptStatus>(`/oneclick/attempts/${encodeURIComponent(attemptId)}`, { cache: "no-store" });
  },
  async claimLink(slug: string, payerAccountId: string, customerName: string | undefined, proof: {message:string;nonce:string;state:string;publicKey:string;signature:string}) {
    const claim = await request<LinkClaim>(`/links/${encodeURIComponent(slug)}/claim`, {
      method: "POST",
      body: body({ payerAccountId, networkId: NEAR_NETWORK_ID, customerName: customerName?.trim() || undefined, proof }),
    });
    if (claim.editToken && typeof window !== "undefined") window.sessionStorage.setItem(`worldz:receipt-edit:${claim.merchantId}:${claim.orderId}`, claim.editToken);
    return claim;
  },
  paymentReadiness() {
    return request<void>(`/payment-readiness?networkId=${NEAR_NETWORK_ID}`, { cache: "no-store" });
  },
  async order(merchantId: string, orderId: string, transactionHash?: string | null) {
    const query = new URLSearchParams({ networkId: NEAR_NETWORK_ID });
    let submissionError: unknown;
    if (transactionHash) {
      try { await submitTransaction(merchantId, orderId, transactionHash); }
      catch (error) { submissionError = error; }
    }
    const status = await request<OrderStatus>(`/orders/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}?${query.toString()}`, { headers: checkoutHeaders(merchantId, orderId), cache: "no-store" });
    // A temporary RPC failure must not hide an already verified receipt.
    if (submissionError && status.state === "OPEN" && !status.transactionHash) throw submissionError;
    return status;
  },
  submitPaymentMeta(merchantId: string, orderId: string, customerName?: string, slug?: string, transactionHash?: string) {
    if (transactionHash && !customerName) return submitTransaction(merchantId, orderId, transactionHash, slug);
    return request<void>(`/orders/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}/meta`, {
      method: "POST",
      headers: checkoutHeaders(merchantId, orderId),
      body: body({ customerName, slug, transactionHash, networkId: NEAR_NETWORK_ID, editToken: typeof window === "undefined" ? undefined : window.sessionStorage.getItem(`worldz:receipt-edit:${merchantId}:${orderId}`) ?? undefined }),
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

export interface VtpassPurchaseStatus {
  purchaseId: string;
  linkSlug: string;
  category: string;
  serviceID: string;
  amountNgn: string;
  amountUsd: string;
  state: "AWAITING_PAYMENT" | "SUBMITTING" | "FULFILLMENT_PENDING" | "SUBMITTED" | "FULFILLED" | "FAILED" | "RECONCILIATION_REQUIRED";
  providerTransactionId: string | null;
  providerResponse: { code?: string | null; description?: string | null; requestId?: string | null; transactionId?: string | null; purchasedCode?: string | null; status?: string | null } | null;
  failureReason: string | null;
}

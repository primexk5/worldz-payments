export type NearNetworkId = "testnet" | "mainnet";

export type NearAsset =
  | { type: "native"; symbol: "NEAR"; decimals: 24 }
  | { type: "nep141"; contractId: string; symbol: string; decimals: number };

export type OrderState =
  | "OPEN"
  | "PROCESSING"
  | "PAYOUT_RETRYABLE"
  | "PARTIAL_PAYOUT"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "SETTLED"
  | "EXPIRED"
  | "CANCELLED"
  | "RECONCILIATION_REQUIRED";

export interface SignedOrderAuthorization {
  protocolVersion: number;
  signerKeyId: string;
  networkId: NearNetworkId;
  contractId: string;
  merchantId: string;
  merchantAccountId: string;
  payoutAccountId: string;
  orderId: string;
  asset: NearAsset;
  amount: string;
  expiresAtSeconds: number;
  feeBps: number;
  feeRecipientAccountId: string;
  expectedPayerAccountId: string | null;
  nonce: string;
  signature: string;
}

export interface MerchantProfile {
  merchantId: string;
  accountId: string;
  payoutAccountId: string;
  displayName: string;
  webhookUrl: string | null;
  createdAtMs: number;
}

export interface PaymentLink {
  slug: string;
  merchantId: string;
  displayName: string;
  payoutAccountId: string;
  networkId: NearNetworkId;
  asset: NearAsset;
  amount: string;
  amountDisplay: string;
  expiresAtSeconds: number | null;
  multiPay: boolean;
  maxRedemptions: number | null;
  createdAtMs: number;
  claimsUsed: number;
}

export interface LinkClaim {
  orderId: string;
  merchantId: string;
  payerAccountId: string;
  authorization: SignedOrderAuthorization;
}

export interface OrderStatus {
  orderId: string;
  merchantId: string;
  networkId: NearNetworkId;
  contractId: string;
  state: OrderState;
  asset: NearAsset;
  amount: string;
  fee: string;
  net: string;
  payerAccountId: string;
  merchantAccountId: string;
  payoutAccountId: string;
  transactionHash: string | null;
  settlementReceiptId: string | null;
  updatedAtMs: number;
  authorization?: SignedOrderAuthorization | null;
  failureReason?: string | null;
}

export interface PaymentEvent {
  id: string;
  networkId: NearNetworkId;
  contractId: string;
  receiptId: string;
  settlementReceiptId?: string | null;
  transactionHash: string;
  orderId: string;
  merchantId: string;
  payerAccountId: string;
  payoutAccountId: string;
  asset: NearAsset;
  amount: string;
  fee: string;
  net: string;
  state: OrderState;
  timestampMs: number;
  merchantReference?: string | null;
  source?: "link" | "checkout" | "gateway";
}

export interface WebhookDelivery {
  id: string;
  eventId: string;
  state: "pending" | "delivered" | "failed" | "skipped";
  attempts: number;
  lastError: string | null;
  updatedAtMs: number;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface AuthChallenge {
  message: string;
  nonce: string;
  recipient: string;
  state: string;
  networkId: NearNetworkId;
  expiresAtSeconds: number;
  purpose?: "login" | "onboarding" | "payout_update";
}

export interface AuthSession {
  merchant: MerchantProfile;
  expiresAtMs: number;
}

export interface MerchantApiKey {
  keyRef: string;
  label: string;
  createdAtMs: number;
  lastUsedAtMs: number | null;
}

export interface NewMerchantApiKey extends MerchantApiKey {
  secret: string;
}

export interface DashboardDelivery extends PaymentEvent {
  webhook: WebhookDelivery | null;
}

export interface TokenMetadata {
  spec: string;
  name: string;
  symbol: string;
  icon: string | null;
  reference: string | null;
  reference_hash: string | null;
  decimals: number;
}

export interface AllowedFungibleToken {
  contractId: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string | null;
}

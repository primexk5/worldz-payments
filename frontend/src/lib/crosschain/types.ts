export interface OneClickToken {
  assetId: string;
  blockchain: string;
  symbol: string;
  decimals: number;
  contractAddress: string;
}

export interface OneClickQuote {
  amountIn: string;
  minAmountIn: string;
  amountOut: string;
  originDecimals: number;
  timeEstimateSeconds: number;
  expiresAtSeconds: number;
  simulated: boolean;
}

export interface OneClickAttempt {
  attemptId: string;
  orderId: string;
  merchantId: string;
  amountIn: string;
  minAmountIn: string;
  depositAddress: string;
  depositMemo: string | null;
  deadlineSeconds: number;
  originDecimals: number;
  simulated: boolean;
}

export interface AttemptStatus {
  attemptId: string;
  status: "AWAITING_DEPOSIT" | "PENDING_DEPOSIT" | "PROCESSING" | "SETTLED" | "REFUNDED" | "FAILED" | "INCOMPLETE_DEPOSIT" | "EXPIRED" | "RECONCILIATION_REQUIRED";
  orderState: string | null;
  txHash: string | null;
  failureReason: string | null;
  simulated: boolean;
}

export type CrossChainKind = "evm" | "solana";

export interface DepositRequest {
  depositAddress: string;
  amountRaw: string;
  origin: OneClickToken;
  sender: string;
}

export interface CrossChainWallet {
  kind: CrossChainKind;
  name: string;
  address: string;
  sendTransfer(request: DepositRequest): Promise<string>;
}

import { formatAssetAmount } from "./tokens";
import type { OrderStatus, PaymentReceiptDetails } from "./types";

export type ReceiptOrder = Pick<OrderStatus, "orderId" | "networkId" | "asset" | "amount" | "fee" | "payoutAccountId" | "transactionHash"> & PaymentReceiptDetails & {
  settlementReceiptId?: string | null;
  payerAccountId?: string;
  updatedAtMs?: number;
  timestampMs?: number;
};

export interface ReceiptRow {
  label: string;
  value: string;
  mono: boolean;
}

const text = (value?: string | null) => value?.trim() || null;

/** One receipt model for the checkout, merchant history, and downloaded PDF. */
export function getReceiptDetails(order: ReceiptOrder) {
  const row = (label: string, value: string, mono = true): ReceiptRow => ({ label, value, mono });
  const timestamp = order.timestampMs ?? order.updatedAtMs;
  const date = timestamp != null && Number.isFinite(timestamp)
    ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(timestamp)} UTC`
    : null;
  const merchantName = text(order.merchantName);
  const reference = text(order.merchantReference);
  return {
    amount: formatAssetAmount(order.amount, order.asset),
    date,
    rows: [
      row("Payment for", text(order.paymentDescription) ?? "Not provided", false),
      row("Payer name", text(order.customerName) ?? "Not provided", false),
      row("Payer wallet", text(order.payerAccountId) ?? "Not available"),
      ...(merchantName ? [row("Merchant", merchantName, false)] : []),
      ...(reference ? [row("Merchant reference", reference)] : []),
      row("Network", `NEAR ${order.networkId}`),
      row("Payout account", order.payoutAccountId),
      row("Payment amount", formatAssetAmount(order.amount, order.asset)),
      row("Transaction hash", text(order.transactionHash) ?? "Not available"),
      row("Settlement receipt", text(order.settlementReceiptId) ?? "Unavailable"),
    ],
  };
}

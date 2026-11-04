export function isVerifiedSettlement(status: { state: string; settlementReceiptId?: string | null }): boolean {
  return status.state === "SETTLED" && typeof status.settlementReceiptId === "string" && status.settlementReceiptId.length > 0;
}

import { Check, ExternalLink } from "lucide-react";
import { NEAR_EXPLORER_URL } from "@/lib/near/config";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { OrderStatus } from "@/lib/near/types";

type ReceiptOrder = Pick<OrderStatus, "orderId" | "networkId" | "asset" | "amount" | "fee" | "payoutAccountId" | "transactionHash"> & { settlementReceiptId?: string | null };

export function NearReceipt({ order }: { order: ReceiptOrder }) {
  return <section className="mx-auto w-full max-w-[440px] rounded-2xl border border-line bg-white p-5 text-left shadow-[0_14px_50px_rgba(11,15,14,.08)] sm:p-7">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-green-deep/10 text-green-deep"><Check size={20}/></span><div><p className="text-sm font-semibold">Payment settled</p><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-mist">Verified by the merchant service</p></div></div>
    <p className="my-6 text-center text-3xl font-semibold tracking-tight">{formatAssetAmount(order.amount, order.asset)}</p>
    <dl className="space-y-3 rounded-xl bg-paper p-4 text-xs"><div className="flex justify-between gap-4"><dt className="text-mist">Network</dt><dd className="font-medium">{order.networkId}</dd></div><div className="flex justify-between gap-4"><dt className="text-mist">Payout account</dt><dd className="max-w-[65%] break-all text-right font-mono text-[10px]">{order.payoutAccountId}</dd></div><div className="flex justify-between gap-4"><dt className="text-mist">Order</dt><dd className="max-w-[65%] break-all text-right font-mono text-[10px]">{order.orderId}</dd></div><div className="flex justify-between gap-4"><dt className="text-mist">Platform fee</dt><dd className="font-mono text-[10px]">{formatAssetAmount(order.fee, order.asset)}</dd></div><div className="flex justify-between gap-4"><dt className="text-mist">Settlement receipt</dt><dd className="max-w-[65%] break-all text-right font-mono text-[9px]">{order.settlementReceiptId}</dd></div></dl>
    {order.transactionHash && <a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(order.transactionHash)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-green-deep hover:underline">View transaction <ExternalLink size={13}/></a>}
  </section>;
}

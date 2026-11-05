"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MonoLabel } from "@/components/atoms/mono-label";
import { NearReceipt } from "@/components/checkout/near-receipt";
import { nearApi } from "@/lib/near/api";
import { NEAR_EXPLORER_URL } from "@/lib/near/config";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { DashboardDelivery, OrderState } from "@/lib/near/types";
import { isVerifiedSettlement } from "@/lib/near/order-state";

const filters = ["ALL","OPEN","PROCESSING","SETTLED","PAYOUT_RETRYABLE","PARTIAL_PAYOUT","REFUND_PENDING","REFUNDED","EXPIRED","CANCELLED","RECONCILIATION_REQUIRED"] as const;
type Filter = typeof filters[number];

function stateStyle(state: OrderState): string {
  if (state === "SETTLED") return "bg-green-deep/10 text-green-deep";
  if (state === "PROCESSING" || state === "REFUND_PENDING") return "bg-amber/15 text-amber-800";
  if (state === "PAYOUT_RETRYABLE" || state === "PARTIAL_PAYOUT" || state === "RECONCILIATION_REQUIRED") return "bg-alert/10 text-alert";
  return "bg-ink/5 text-mist";
}

function displayState(payment: DashboardDelivery): OrderState {
  return payment.state === "SETTLED" && !isVerifiedSettlement(payment) ? "RECONCILIATION_REQUIRED" : payment.state;
}

export default function PaymentsPage() {
  const [deliveries,setDeliveries]=useState<DashboardDelivery[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<Filter>("ALL");
  const [expandedId,setExpandedId]=useState<string|null>(null);
  useEffect(()=>{let active=true;void nearApi.deliveries().then((response)=>{if(active)setDeliveries(response.deliveries);}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"Could not load payment history.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const filtered=useMemo(()=>deliveries.filter((delivery)=>{
    if(filter!=="ALL"&&displayState(delivery)!==filter)return false;
    const term=query.trim().toLowerCase();if(!term)return true;
    return [delivery.orderId,delivery.payerAccountId,delivery.transactionHash,delivery.merchantReference??"",delivery.paymentDescription??"",delivery.customerName??""].some((value)=>value.toLowerCase().includes(term));
  }),[deliveries,filter,query]);

  return <div className="space-y-7"><div><MonoLabel>Merchant workspace / Ledger</MonoLabel><h1 className="mt-2 text-3xl font-semibold tracking-tight">Payments</h1><p className="mt-2 max-w-[650px] text-sm leading-6 text-ink/60">All your payments in one place. Track settlement, search transactions, and download receipts.</p></div>
    {error&&<p role="alert" className="rounded-xl border border-alert/20 bg-alert/5 p-4 text-xs text-alert">{error}</p>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><label className="relative block w-full lg:max-w-[340px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist"/><Input aria-label="Search payments" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search item, payer, order…" className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-xs outline-none placeholder:text-mist focus:border-green-deep"/></label><div className="flex gap-1.5 overflow-x-auto pb-1">{filters.map((value)=><button key={value} onClick={()=>setFilter(value)} className={`shrink-0 rounded-full px-3 py-2 font-mono text-xs transition ${filter===value?"bg-ink text-paper":"border border-line text-mist hover:text-ink"}`}>{value.replaceAll("_"," ")}</button>)}</div></div>
    <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-line bg-paper/70 font-mono text-xs uppercase tracking-wider text-mist"><tr><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Order / reference</th><th className="px-4 py-3">Payer</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">State</th><th className="px-4 py-3"/></tr></thead><tbody className="divide-y divide-line/60">{loading?<tr><td colSpan={6} className="p-10 text-center text-mist">Loading payments…</td></tr>:filtered.length===0?<tr><td colSpan={6} className="p-10 text-center text-mist">No payments match this filter.</td></tr>:filtered.map((payment)=><Fragment key={payment.id}>{(()=>{const shownState=displayState(payment);return <><tr onClick={()=>setExpandedId(expandedId===payment.id?null:payment.id)} className={`cursor-pointer transition hover:bg-paper/50 ${expandedId===payment.id?"bg-paper/50":""}`}><td className="px-4 py-4 font-medium">{formatAssetAmount(payment.amount,payment.asset)}</td><td className="px-4 py-4"><span className="block max-w-[180px] truncate font-mono text-[11px]">{payment.orderId}</span>{payment.merchantReference&&<span className="mt-1 block text-[11px] text-mist">Ref: {payment.merchantReference}</span>}</td><td className="max-w-[170px] truncate px-4 py-4 font-mono text-[11px] text-mist">{payment.payerAccountId}</td><td className="px-4 py-4 text-xs text-mist">{new Date(payment.timestampMs).toLocaleString()}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 font-mono text-xs uppercase ${stateStyle(shownState)}`}>{shownState.replaceAll("_"," ")}</span></td><td className="px-4 py-4"><ChevronDown size={15} className={`transition ${expandedId===payment.id?"rotate-180":""}`}/></td></tr>{expandedId===payment.id&&<tr><td colSpan={6} className="bg-paper/40 p-4 sm:p-6"><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="grid content-start gap-3 sm:grid-cols-2">{[["Gross",formatAssetAmount(payment.amount,payment.asset)],["Platform fee",formatAssetAmount(payment.fee,payment.asset)],["Merchant net",formatAssetAmount(payment.net,payment.asset)],["Payout account",payment.payoutAccountId],["Network",payment.networkId],["Settlement receipt",payment.settlementReceiptId??"Awaiting verified settlement"]].map(([label,value])=><div key={label} className="rounded-xl border border-line bg-white p-3"><MonoLabel className="text-xs">{label}</MonoLabel><p className="mt-2 break-all font-mono text-xs">{value}</p></div>)}{payment.transactionHash&&<a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(payment.transactionHash)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-medium text-green-deep hover:underline">Open NEAR transaction <ArrowUpRight size={13}/><ExternalLink size={12}/></a>}</div>{isVerifiedSettlement(payment)&&<NearReceipt order={payment}/>}</div></td></tr>}</>})()}</Fragment>)}</tbody></table></div></section>
  </div>;
}

"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleDollarSign, Clock3, Plus, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentActivity } from "@/components/dashboard/payment-activity";
import { NearLogo } from "@/components/atoms/near-logo";
import { MonoLabel } from "@/components/atoms/mono-label";
import { nearApi } from "@/lib/near/api";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { DashboardDelivery, MerchantProfile } from "@/lib/near/types";
import { WalletBalances } from "@/components/dashboard/wallet-balances";
import { isVerifiedSettlement } from "@/lib/near/order-state";

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CircleDollarSign }) {
  return <Card className="gap-0 shadow-none"><CardContent className="px-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-mist">{label}</p>{label==="Network"?<NearLogo className="size-4 text-ink"/>:<Icon size={17} className="text-mist"/>}</div><p className="mt-5 truncate font-mono text-[28px] font-semibold tracking-tight">{value}</p><p className="mt-2 text-[11px] text-mist">{detail}</p></CardContent></Card>;
}

export default function DashboardOverviewPage() {
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [deliveries, setDeliveries] = useState<DashboardDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([nearApi.me(), nearApi.deliveries()]).then(([profile, result]) => {
      if (!active) return;
      setMerchant(profile);
      setDeliveries(result.deliveries);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load merchant activity.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const settled = deliveries.filter(isVerifiedSettlement);
  const processing = deliveries.filter((item) => !isVerifiedSettlement(item) && !["REFUNDED", "CANCELLED", "EXPIRED"].includes(item.state));
  const totals = new Map<string, { asset: DashboardDelivery["asset"]; amount: bigint }>();
  for (const item of settled) {
    const key = item.asset.type === "native" ? "native" : item.asset.contractId;
    const current = totals.get(key) ?? { asset: item.asset, amount: 0n };
    current.amount += BigInt(item.net);
    totals.set(key, current);
  }

  return <div className="space-y-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-xs font-medium text-mist">YOUR BUSINESS AT A GLANCE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{merchant?.displayName ? `Welcome back, ${merchant.displayName}.` : "Welcome to your workspace."}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-ink/60">Here’s what’s happening with your payments today.</p></div><Link href="/dashboard/links" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-paper transition hover:bg-vault">Create payment link<span className="grid size-7 place-items-center rounded-full bg-signal text-ink"><Plus size={16}/></span></Link></div>
    {error&&<p role="alert" className="rounded-[20px] border border-alert/20 bg-alert/5 p-4 text-xs text-alert">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Settled payments" value={String(settled.length)} detail="Completed payout legs, verified" icon={CircleDollarSign}/><Metric label="Processing" value={String(processing.length)} detail="Awaiting payout or reconciliation" icon={Clock3}/><Metric label="Network" value="NEAR" detail="Configured deployment network" icon={ArrowUpRight}/><Metric label="Payout account" value={merchant?.payoutAccountId ? `${merchant.payoutAccountId.slice(0, 9)}…` : "Not set"} detail="Your direct settlement destination" icon={WalletCards}/></section>
    <PaymentActivity deliveries={deliveries} loading={loading}/>
    <WalletBalances />
    <section className="grid gap-5 xl:grid-cols-[1fr_350px]">
      <div className="overflow-hidden rounded-[20px] border border-line bg-white"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold">Recent payments</h2><p className="mt-1 text-xs text-mist">Processing and verified settlement activity</p></div><Link href="/dashboard/payments" className="flex items-center gap-1 text-xs font-medium text-ink">View all <ArrowRight size={13}/></Link></div>{loading?<p className="p-8 text-center text-xs text-mist">Loading payments…</p>:deliveries.length===0?<p className="p-8 text-center text-xs text-mist">You’re ready for your first payment. Share a payment link to get started.</p>:<div className="divide-y divide-line/60">{deliveries.slice(0,8).map((payment)=>{const state=isVerifiedSettlement(payment)?"SETTLED":payment.state==="SETTLED"?"RECONCILIATION_REQUIRED":payment.state;return <Link key={payment.id} href={`/dashboard/payments?order=${encodeURIComponent(payment.orderId)}`} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-paper/60"><div className="min-w-0"><p className="truncate font-mono text-xs font-medium">{formatAssetAmount(payment.net,payment.asset)}</p><p className="mt-1 truncate font-mono text-[11px] text-mist">{payment.payerAccountId} · {payment.orderId.slice(0,16)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-xs uppercase tracking-wider ${state==="SETTLED"?"bg-green-deep/10 text-green-deep":state==="RECONCILIATION_REQUIRED"?"bg-alert/10 text-alert":"bg-amber/15 text-amber-700"}`}>{state.replaceAll("_"," ")}</span></Link>})}</div>}</div>
      <div className="space-y-4"><section className="rounded-[20px] border border-line bg-paper p-5 text-ink"><MonoLabel className="text-mist">Direct payout</MonoLabel><h2 className="mt-3 text-lg font-semibold tracking-tight">Your funds settle to your wallet.</h2><p className="mt-2 text-[11px] leading-5 text-ink/65">NEAR executes payouts asynchronously. Orders remain processing until the API verifies all required payout legs.</p><Link href="/#settlement" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-ink">Settlement details <ArrowRight size={13}/></Link></section><section className="rounded-[20px] border border-line bg-white p-5"><MonoLabel>Settled net by asset</MonoLabel>{totals.size===0?<p className="mt-4 text-xs text-mist">No settled volume yet.</p>:<div className="mt-4 space-y-3">{[...totals.entries()].map(([key,total])=><div key={key} className="flex items-center justify-between gap-2 border-b border-line/60 pb-3 last:border-0 last:pb-0"><span className="text-xs text-mist">{total.asset.symbol}</span><strong className="font-mono text-xs">{formatAssetAmount(total.amount.toString(),total.asset)}</strong></div>)}</div>}</section><section className="rounded-[20px] border border-line bg-white p-5"><div className="flex items-center justify-between"><MonoLabel>Webhook status</MonoLabel><span className={`rounded-full px-2.5 py-1 font-mono text-xs uppercase ${merchant?.webhookUrl?"bg-green-deep/10 text-green-deep":"bg-paper text-mist"}`}>{merchant?.webhookUrl?"Configured":"Optional"}</span></div><p className="mt-3 text-xs leading-5 text-mist">{merchant?.webhookUrl?`${deliveries.filter((item)=>item.webhook?.state==="failed").length} failed delivery attempt(s) need review.`:"Payments settle without a webhook. Configure an HTTPS endpoint in Settings to receive notifications."}</p><Link href="/dashboard/settings" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink">Webhook settings <ArrowRight size={12}/></Link></section></div>
    </section>
  </div>;
}

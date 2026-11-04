"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Clock3, Layers3, TrendingUp } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { nearApi } from "@/lib/near/api";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { DashboardDelivery } from "@/lib/near/types";
import { isVerifiedSettlement } from "@/lib/near/order-state";

export default function AnalyticsPage() {
  const [payments,setPayments]=useState<DashboardDelivery[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;void nearApi.deliveries().then(({deliveries})=>{if(active)setPayments(deliveries);}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"Could not load analytics.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const settled=payments.filter(isVerifiedSettlement);
  const assetGroups=useMemo(()=>{
    const groups=new Map<string,{asset:DashboardDelivery["asset"];amount:bigint;count:number;daily:Map<string,bigint>}>();
    for(const payment of settled){const key=payment.asset.type==="native"?"native":payment.asset.contractId;const group=groups.get(key)??{asset:payment.asset,amount:0n,count:0,daily:new Map<string,bigint>()};group.amount+=BigInt(payment.net);group.count+=1;const day=new Date(payment.timestampMs).toISOString().slice(0,10);group.daily.set(day,(group.daily.get(day)??0n)+BigInt(payment.net));groups.set(key,group);}
    return [...groups.entries()];
  },[settled]);
  const processing=payments.filter((payment)=>!(["SETTLED","REFUNDED","CANCELLED","EXPIRED"].includes(payment.state))).length;
  const completion=payments.length?Math.round((settled.length/payments.length)*100):0;
  const days=Array.from({length:14},(_,index)=>{const date=new Date();date.setDate(date.getDate()-(13-index));return date.toISOString().slice(0,10);});
  const metrics=[{label:"Settled orders",value:String(settled.length),Icon:Layers3},{label:"Processing",value:String(processing),Icon:Clock3},{label:"Completion",value:`${completion}%`,Icon:TrendingUp},{label:"Assets with activity",value:String(assetGroups.length),Icon:BarChart3}];

  return <div className="space-y-7"><div><MonoLabel>Merchant workspace / Performance</MonoLabel><h1 className="mt-2 text-3xl font-semibold tracking-tight">Analytics</h1><p className="mt-2 text-sm text-ink/60">Volumes stay separated by asset. No native NEAR and FT base units are combined.</p></div>{error&&<p role="alert" className="rounded-xl border border-alert/20 bg-alert/5 p-4 text-xs text-alert">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({label,value,Icon})=><article key={label} className="rounded-2xl border border-line bg-white p-5"><div className="flex items-center justify-between"><MonoLabel>{label}</MonoLabel><Icon size={17} className="text-green-deep"/></div><p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p></article>)}</section>
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-7"><div className="mb-6"><h2 className="text-sm font-semibold">Daily settled net</h2><p className="mt-1 text-[10px] text-mist">Last 14 days · independent series for each asset</p></div>{loading?<p className="py-10 text-center text-xs text-mist">Loading analytics…</p>:assetGroups.length===0?<p className="py-10 text-center text-xs text-mist">Settled payments will appear here.</p>:<div className="space-y-8">{assetGroups.map(([key,group])=>{const max=group.daily.size?Array.from(group.daily.values()).reduce((a,b)=>a>b?a:b,1n):1n;return <div key={key}><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium">{group.asset.symbol}</span><span className="font-mono text-[10px] text-mist">{formatAssetAmount(group.amount.toString(),group.asset)} net · {group.count} orders</span></div><div className="space-y-2">{days.map((day)=><div key={day} className="flex items-center gap-3"><span className="w-14 shrink-0 font-mono text-[8px] text-mist">{day.slice(5)}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-green-deep" style={{width:`${group.daily.has(day)?Math.max(3,Number((group.daily.get(day)!*100n)/max)):0}%`}}/></div><span className="w-24 shrink-0 truncate text-right font-mono text-[8px] text-mist">{group.daily.has(day)?formatAssetAmount(group.daily.get(day)!.toString(),group.asset):"—"}</span></div>)}</div></div>})}</div>}</section>
  </div>;
}

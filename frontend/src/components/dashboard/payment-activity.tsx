"use client";

import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isVerifiedSettlement } from "@/lib/near/order-state";
import type { DashboardDelivery } from "@/lib/near/types";

export function PaymentActivity({ deliveries, loading }: { deliveries: DashboardDelivery[]; loading: boolean }) {
  const [days, setDays] = useState(7);
  const now = new Date();
  const buckets = Array.from({ length: days }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1 + i);
    const end = new Date(date); end.setDate(end.getDate() + 1);
    const payments = deliveries.filter(p => p.timestampMs >= date.getTime() && p.timestampMs < end.getTime());
    return { date, settled: payments.filter(isVerifiedSettlement).length, other: payments.filter(p=>!isVerifiedSettlement(p)).length };
  });
  const max = Math.max(4, ...buckets.map(b=>b.settled+b.other));
  const count = buckets.reduce((sum,b)=>sum+b.settled+b.other,0);
  return <Card className="gap-0 shadow-none"><CardHeader className="flex flex-row items-center justify-between gap-4"><div><CardTitle>Payment activity</CardTitle><p className="mt-2 text-xs text-mist">A clear view of how your business is moving.</p></div><label className="relative shrink-0"><span className="sr-only">Activity period</span><select value={days} onChange={e=>setDays(Number(e.target.value))} className="h-9 appearance-none rounded-lg border border-line bg-white pl-3 pr-8 text-xs outline-ring"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-3"/></label></CardHeader>
    <CardContent className="pt-6"><div className="flex items-baseline gap-2"><strong className="font-mono text-3xl font-semibold tracking-tight">{loading?"—":count}</strong><span className="text-xs text-mist">payments in this period</span></div>
      <div className="relative mt-6 pl-7"><div aria-hidden className="pointer-events-none absolute inset-0 bottom-7 flex flex-col justify-between">{[max,Math.round(max/2),0].map((value,i)=><div key={i} className="flex items-center gap-3 text-[10px] text-mist"><span className="w-4 text-right">{value}</span><div className="flex-1 border-t border-dashed border-line"/></div>)}</div>
        <div className="relative flex h-44 items-end gap-1.5 sm:gap-3" aria-label="Daily payment counts">{buckets.map((bucket,i)=><div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${bucket.date.toLocaleDateString()}: ${bucket.settled} settled, ${bucket.other} other payments`}><div className="flex min-h-0 flex-col justify-end overflow-hidden rounded-t-md" style={{height:`${(bucket.settled+bucket.other)/max*100}%`}}><div className="bg-line" style={{flex:bucket.other}}/><div className="bg-green-deep transition-colors group-hover:bg-signal/100" style={{flex:bucket.settled}}/></div>{count===0&&<div className="h-1 rounded-t bg-green-deep/15"/>}</div>)}</div>
        <div className="mt-3 flex justify-between text-[10px] text-mist"><span>{buckets[0].date.toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span><span>Today</span></div>
        {!loading&&count===0&&<div className="absolute inset-0 bottom-8 grid place-items-center"><div className="rounded-xl border border-line bg-white/95 px-5 py-4 text-center shadow-sm"><Activity size={20} className="mx-auto text-mist"/><p className="mt-2 text-xs font-medium">No payments in this period.</p><p className="mt-1 text-[11px] text-mist">Activity will appear here as payments arrive.</p></div></div>}
      </div><div className="mt-5 flex justify-center gap-5 text-[11px] text-mist"><span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-green-deep"/>Settled</span><span className="flex items-center gap-2"><i className="size-2 rounded-sm bg-line"/>Other activity</span></div>
    </CardContent></Card>;
}

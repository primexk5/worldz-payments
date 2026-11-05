"use client";

import { useState } from "react";
import { Check, Download, ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/atoms/brand-mark";
import { Button } from "@/components/ui/button";
import { NEAR_EXPLORER_URL } from "@/lib/near/config";
import { getReceiptDetails } from "@/lib/near/receipt-details";
import { createReceiptPdf, type ReceiptOrder } from "@/lib/near/receipt";

export function NearReceipt({ order }: { order: ReceiptOrder }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { amount, date, rows } = getReceiptDetails(order);
  const download = async () => {
    setDownloading(true); setError(null);
    try {
      const doc = await createReceiptPdf(order);
      doc.save(`WorldzPayments-receipt-${order.orderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0,80)}.pdf`);
    } catch { setError("Could not download your receipt. Please try again."); }
    finally { setDownloading(false); }
  };
  return <section className="workspace-theme mx-auto w-full max-w-[460px] overflow-hidden rounded-[20px] border border-line bg-paper text-left text-ink shadow-[0_12px_40px_-16px_#0b0f0e22]">
    <div className="border-b border-dashed border-line bg-vault px-6 pb-7 pt-6 text-paper"><div className="flex items-center justify-between"><BrandLogo inverse className="w-[156px] sm:w-[176px]"/><span className="rounded-md border border-paper/20 bg-paper/5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-paper/60">Receipt</span></div><div className="mx-auto mt-7 grid size-12 place-items-center rounded-full bg-signal ring-8 ring-signal/10"><Check size={24} className="text-ink"/></div><p className="mt-5 text-center text-sm font-medium text-signal">Payment settled</p><p className="mt-2 break-words text-center font-mono text-3xl font-semibold tracking-tight">{amount}</p>{date&&<p className="mt-2 text-center text-xs text-paper/60">{date}</p>}</div>
    <div className="p-6"><dl className="space-y-4 text-xs">{rows.map(({label,value,mono})=><div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-4"><dt className="min-w-0 text-mist leading-5">{label}</dt><dd className={`min-w-0 whitespace-pre-wrap break-words text-right font-medium leading-5 [overflow-wrap:anywhere] ${mono?"font-mono":""}`}>{value}</dd></div>)}</dl>
      <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-line pt-4 text-[10px] text-mist"><ShieldCheck size={13} className="text-green-deep"/>Settlement verified by the merchant service</div>
      <Button onClick={()=>void download()} disabled={downloading||!order.settlementReceiptId} className="mt-5 h-[46px] w-full gap-2 rounded-full">{downloading?<LoaderCircle size={16} className="animate-spin"/>:<Download size={16}/>} {downloading?"Preparing receipt…":"Download receipt"}<span className="ml-auto text-[10px] opacity-70">PDF</span></Button>
      {error&&<p role="alert" className="mt-3 text-xs text-alert">{error}</p>}
      {order.transactionHash&&<a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(order.transactionHash)}`} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-1.5 text-xs text-mist hover:text-green-deep">View on NEAR Explorer <ExternalLink size={12}/></a>}
    </div>
  </section>;
}

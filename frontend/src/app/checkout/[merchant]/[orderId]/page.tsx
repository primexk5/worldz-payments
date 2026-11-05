"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { NearLogo } from "@/components/atoms/near-logo";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { Input } from "@/components/ui/input";
import { NearReceipt } from "@/components/checkout/near-receipt";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi } from "@/lib/near/api";
import { NEAR_NETWORK_ID } from "@/lib/near/config";
import { getPendingPayment, isVerifiedSettlement, submitAuthorizedPayment, waitForVerifiedSettlement, type PendingPayment } from "@/lib/near/payment";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { LinkClaim, OrderStatus } from "@/lib/near/types";

const recoverableStates = ["PROCESSING","PAYOUT_RETRYABLE","PARTIAL_PAYOUT","REFUND_PENDING","RECONCILIATION_REQUIRED"];

export default function DirectCheckoutPage({ params }: { params: Promise<{ merchant: string; orderId: string }> }) {
  const [route,setRoute]=useState<{merchant:string;orderId:string}|null>(null);
  const merchantId=route?.merchant??"";
  const orderId=route?.orderId??"";
  const {accountId,wallet,connect,connecting}=useNearWallet();
  const [order,setOrder]=useState<OrderStatus|null>(null);
  const [pending,setPending]=useState<PendingPayment|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [processing,setProcessing]=useState(false);
  const [customerName,setCustomerName]=useState("");

  useEffect(()=>{let active=true;void params.then((value)=>{if(!active)return;setRoute(value);return nearApi.order(value.merchant,value.orderId).then((status)=>{if(!active)return;setOrder(status);if(!isVerifiedSettlement(status)&&recoverableStates.includes(status.state)){const restored=getPendingPayment(NEAR_NETWORK_ID,status.contractId,value.orderId);if(restored){setPending(restored);setProcessing(true);}}});}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"Could not load this checkout order.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[params]);

  const refreshStatus=useCallback(async()=>{if(!merchantId||!orderId)return null;try{const status=await nearApi.order(merchantId,orderId,pending?.transactionHash);setOrder(status);if(isVerifiedSettlement(status)){setProcessing(false);if(pending){(await import("@/lib/near/payment")).clearPendingPayment(pending);}}return status;}catch(cause){setError(cause instanceof Error?cause.message:"Could not refresh order status.");return null;}},[merchantId,orderId,pending]);

  useEffect(()=>{if(!processing)return;const interval=window.setInterval(()=>void refreshStatus(),4000);return()=>window.clearInterval(interval);},[processing,refreshStatus]);

  const pay=async()=>{
    if(!order?.authorization||!accountId||!wallet)return;
    setBusy(true);setError(null);
    try{
      const claim:LinkClaim={orderId,merchantId,payerAccountId:accountId,authorization:order.authorization};
      if(customerName.trim())await nearApi.submitPaymentMeta(merchantId,orderId,customerName.trim());
      const submitted=await submitAuthorizedPayment({wallet,accountId,claim});
      setPending(submitted);setProcessing(true);
      await refreshStatus();
      const verified=await waitForVerifiedSettlement(merchantId,orderId,(status)=>setOrder(status),180_000,submitted.transactionHash);
      setOrder(verified);
      if(isVerifiedSettlement(verified))setProcessing(false);
    }catch(cause){setError(cause instanceof Error?cause.message:"Payment could not be submitted.");}
    finally{setBusy(false);}
  };

  const currentState=order?.state==="SETTLED"&&!isVerifiedSettlement(order)?"RECONCILIATION_REQUIRED":order?.state??"OPEN";
  const receiptReady=Boolean(order&&isVerifiedSettlement(order));
  const stateMessage=currentState==="PARTIAL_PAYOUT"?"A payout leg is being recovered. Do not pay again; the order remains locked while the merchant service reconciles it.":currentState==="PAYOUT_RETRYABLE"?"A payout retry is underway. Do not submit another payment for this order.":currentState==="REFUND_PENDING"?"The order is in its refund flow. Wait for the verified refund receipt.":currentState==="RECONCILIATION_REQUIRED"?"This order needs manual reconciliation. Do not retry or submit another payment.":"The NEAR transaction is processing. Settlement will be shown only after payout receipts are verified.";

  if(receiptReady&&order)return <main className="min-h-screen bg-paper px-5 py-10"><div className="mx-auto w-full max-w-[460px]"><header className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR network"><NearLogo className="size-4"/></span></header><div className="mt-10"><NearReceipt order={order}/></div><div className="mt-5 text-center"><Link href="/" className="text-xs text-mist hover:text-ink">Return to WorldzPayments</Link></div></div></main>;

  return <main className="min-h-screen bg-paper px-5 py-8 sm:py-12"><div className="mx-auto w-full max-w-[510px]"><header className="flex items-center justify-between"><div className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR network"><NearLogo className="size-4"/></span></div><Link href="/" className="inline-flex items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14}/>WorldzPayments</Link></header><section className="mt-9 rounded-[24px] border border-line bg-white p-5 shadow-[0_16px_60px_rgba(11,15,14,.08)] sm:p-7"><MonoLabel>Direct checkout · {NEAR_NETWORK_ID}</MonoLabel><h1 className="mt-2 text-xl font-semibold">Pay merchant order</h1>
    {loading?<p className="py-12 text-center text-xs text-mist">Loading order…</p>:error&&!order?<p role="alert" className="mt-5 rounded-xl bg-alert/5 p-4 text-xs text-alert">{error}</p>:order?<>
      {order.paymentDescription&&<div className="mt-5 rounded-xl border border-line p-4"><p className="text-xs text-mist">Payment for</p><p className="mt-2 break-words text-sm font-medium">{order.paymentDescription}</p></div>}
      <div className="my-5 rounded-[20px] bg-paper px-5 py-6 text-center"><p className="font-mono text-[11px] uppercase tracking-wider text-mist">Amount due</p><p className="mt-3 text-3xl font-semibold">{formatAssetAmount(order.amount,order.asset)}</p></div>
      <div className="space-y-3 rounded-xl border border-line p-4 text-xs"><div className="flex justify-between gap-4"><span className="text-mist">Payout account</span><span className="break-all text-right font-mono">{order.payoutAccountId}</span></div><div className="flex justify-between gap-4"><span className="text-mist">Order state</span><span className="font-mono">{order.state.replaceAll("_"," ")}</span></div></div>
      {currentState==="OPEN"&&<label htmlFor="receipt-name" className="mt-5 block text-xs font-medium">Your name on the receipt <span className="font-normal text-mist">(optional)</span><Input id="receipt-name" className="mb-4 mt-2 h-11 bg-paper" maxLength={120} autoComplete="name" disabled={busy} value={customerName} onChange={(event)=>setCustomerName(event.target.value)} placeholder="e.g. Ada Okafor"/></label>}
      {currentState!=="OPEN"?<div className={`mt-5 rounded-xl border p-4 ${currentState==="PARTIAL_PAYOUT"||currentState==="PAYOUT_RETRYABLE"||currentState==="RECONCILIATION_REQUIRED"?"border-alert/20 bg-alert/5":"border-amber/40 bg-amber/10"}`}><p className="flex items-center gap-2 text-xs font-medium"><CircleAlert size={15}/>{currentState.replaceAll("_"," ")}</p><p className="mt-2 text-xs leading-5 text-ink/65">{stateMessage}</p><button onClick={()=>void refreshStatus()} className="mt-3 text-xs font-medium text-green-deep underline">Refresh verified status</button></div>:<button onClick={()=>{if(!accountId)void connect().catch((cause)=>setError(cause instanceof Error?cause.message:"Wallet connection failed."));else void pay();}} disabled={busy||connecting||!order.authorization} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-xs font-medium text-paper disabled:opacity-50">{busy||connecting?<LoaderCircle size={15} className="animate-spin"/>:<WalletCards size={16} className="text-signal"/>}{accountId?"Pay with NEAR wallet":"Connect NEAR wallet"}</button>}
      {error&&<p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs text-alert">{error}</p>}
    </>:null}
    <p className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-mist"><ShieldCheck size={13} className="text-green-deep"/>Payout destination and signed order terms are shown before payment.</p>
  </section></div></main>;
}

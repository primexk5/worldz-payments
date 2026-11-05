"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NearLogo } from "@/components/atoms/near-logo";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { NearReceipt } from "@/components/checkout/near-receipt";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi } from "@/lib/near/api";
import { NEAR_EXPLORER_URL, NEAR_NETWORK_ID } from "@/lib/near/config";
import { calculateFee, calculateNet } from "@/lib/near/amounts";
import { clearPendingPayment, getPendingPaymentForSlug, isVerifiedSettlement, registerFungibleTokenRecipients, submitAuthorizedPayment, TokenStorageRequiredError, waitForVerifiedSettlement, type PendingPayment } from "@/lib/near/payment";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { LinkClaim, OrderStatus, PaymentLink } from "@/lib/near/types";

type PageState = "loading"|"ready"|"claiming"|"awaiting-wallet"|"processing"|"settled"|"refunded"|"not-found"|"error";

export default function PayLinkPage({params}:{params:Promise<{slug:string}>}) {
  const [slug,setSlug]=useState("");
  const {accountId,wallet,connect,connecting}=useNearWallet();
  const [link,setLink]=useState<PaymentLink|null>(null);
  const [claim,setClaim]=useState<LinkClaim|null>(null);
  const [order,setOrder]=useState<OrderStatus|null>(null);
  const [pending,setPending]=useState<PendingPayment|null>(null);
  const [state,setState]=useState<PageState>("loading");
  const [message,setMessage]=useState<string|null>(null);
  const [customerName,setCustomerName]=useState("");
  const [storageIssue,setStorageIssue]=useState<TokenStorageRequiredError|null>(null);
  const [registering,setRegistering]=useState(false);

  useEffect(()=>{let active=true;void params.then(({slug:resolvedSlug})=>{if(!active)return;setSlug(resolvedSlug);return nearApi.link(resolvedSlug).then((value)=>{if(!active)return;setLink(value);const restored=getPendingPaymentForSlug(resolvedSlug);if(restored){setPending(restored);setState("processing");void nearApi.order(restored.merchantId,restored.orderId,restored.transactionHash).then((status)=>{if(!active)return;setOrder(status);if(isVerifiedSettlement(status))setState("settled");else if(status.state==="REFUNDED")setState("refunded");else setState("processing");}).catch(()=>{if(active)setMessage("Payment progress is saved. Waiting for the merchant service to reconnect.");});}else setState("ready");});}).catch((cause)=>{if(active){setState("not-found");setMessage(cause instanceof Error?cause.message:"This payment link is unavailable.");}});return()=>{active=false;};},[params]);

  const checkStatus=useCallback(async(current:PendingPayment)=>{
    setState("processing");
    try{const result=await waitForVerifiedSettlement(current.merchantId,current.orderId,(status)=>setOrder(status),180_000,current.transactionHash);setOrder(result);if(isVerifiedSettlement(result)){setState("settled");}else if(result.state==="REFUNDED")setState("refunded");else setMessage(result.failureReason??"Payment needs attention. Check the status before retrying.");}
    catch(cause){setMessage(cause instanceof Error?cause.message:"Payment is still processing.");}
  },[]);

  useEffect(()=>{if(state!=="processing"||!pending)return;const interval=window.setInterval(()=>{void nearApi.order(pending.merchantId,pending.orderId,pending.transactionHash).then((status)=>{setOrder(status);if(isVerifiedSettlement(status)){setState("settled");clearPendingPayment(pending);}else if(status.state==="REFUNDED"){setState("refunded");clearPendingPayment(pending);}}).catch(()=>{});},4000);return()=>window.clearInterval(interval);},[state,pending]);

  const connectWallet=async()=>{setMessage(null);try{await connect();}catch(cause){setMessage(cause instanceof Error?cause.message:"Wallet connection failed.");}};

  const pay=async()=>{
    if(!link)return;
    if(!wallet||!accountId){await connectWallet();return;}
    setState(claim?"awaiting-wallet":"claiming");setMessage(null);setStorageIssue(null);
    try{
      const currentClaim=claim??await nearApi.claimLink(slug,accountId);
      setClaim(currentClaim);
      if(customerName.trim())await nearApi.submitPaymentMeta(currentClaim.merchantId,currentClaim.orderId,customerName.trim(),slug);
      const submitted=await submitAuthorizedPayment({wallet,accountId,claim:currentClaim,linkSlug:slug,onSubmitted:(value)=>{setPending(value);setState("processing");}});
      setPending(submitted);
      await checkStatus(submitted);
    }catch(cause){
      if(cause instanceof TokenStorageRequiredError){setStorageIssue(cause);setState("ready");setMessage("The receiving token accounts need storage registration before this payment.");return;}
      setState("error");setMessage(cause instanceof Error?cause.message:"Could not submit the NEAR payment.");
    }
  };

  const registerStorage=async()=>{
    if(!wallet||!accountId||!claim||!storageIssue)return;
    setRegistering(true);setMessage(null);
    try{await registerFungibleTokenRecipients({wallet,accountId,authorization:claim.authorization,accountIds:storageIssue.accountIds,minimumDeposit:storageIssue.minimumDeposit});setStorageIssue(null);setMessage("Token storage registration completed. Review the payment and submit it when ready.");}
    catch(cause){setMessage(cause instanceof Error?cause.message:"Token storage registration failed.");}
    finally{setRegistering(false);}
  };

  const visibleOrderState = order?.state === "SETTLED" && !isVerifiedSettlement(order)
    ? "RECONCILIATION_REQUIRED"
    : order?.state;

  if(state==="settled"&&order)return <main className="min-h-screen bg-paper px-5 py-10"><div className="mx-auto w-full max-w-[460px]"><div className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR network"><NearLogo className="size-4"/></span></div><div className="mt-10"><NearReceipt order={{...order,paymentDescription:order.paymentDescription??link?.displayName,customerName:order.customerName??(customerName.trim()||null)}}/></div><div className="mt-5 text-center"><Link href="/" className="text-xs text-mist hover:text-ink">Return to WorldzPayments</Link></div></div></main>;

  return <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:py-12"><div className="mx-auto w-full max-w-[460px]"><header className="flex items-center justify-between"><div className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR network"><NearLogo className="size-4"/></span></div><Link href="/" className="inline-flex items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14}/>WorldzPayments</Link></header>
    <section className="mt-9 overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_18px_65px_rgba(11,15,14,.07)]"><div className="border-b border-line/70 px-5 py-5 sm:px-7"><div className="flex items-center gap-2"><NearLogo className="size-4"/><MonoLabel>NEAR checkout · {NEAR_NETWORK_ID}</MonoLabel></div><h1 className="mt-2 text-xl font-semibold tracking-tight">{link?.displayName||link?.merchantId||"Secure checkout"}</h1><p className="mt-1 text-xs text-mist">Merchant payout goes directly to its configured NEAR account.</p></div>
      {state==="loading"?<div className="flex items-center justify-center gap-2 p-14 text-xs text-mist"><LoaderCircle size={16} className="animate-spin"/>Loading payment link…</div>:state==="not-found"?<div className="p-8 text-center"><p className="text-sm font-medium">Payment link unavailable</p><p className="mt-2 text-xs text-mist">{message}</p></div>:link&&<div className="p-5 sm:p-7"><div className="rounded-[20px] bg-paper px-5 py-6 text-center"><MonoLabel>Total to pay</MonoLabel><p className="mt-3 text-4xl font-semibold tracking-tight">{link.amountDisplay}<span className="ml-2 text-sm font-medium text-green-deep">{link.asset.symbol}</span></p><p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-mist">{link.networkId} · {link.asset.type==="native"?"Native NEAR":link.asset.contractId}</p></div>
        {claim&&<div className="mt-4 rounded-xl border border-line p-4"><div className="flex justify-between gap-3 text-xs"><span className="text-mist">Platform fee · {claim.authorization.feeBps/100}%</span><span className="font-mono">{formatAssetAmount(calculateFee(claim.authorization.amount,claim.authorization.feeBps),claim.authorization.asset)}</span></div><div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Merchant net</span><span className="font-mono">{formatAssetAmount(calculateNet(claim.authorization.amount,calculateFee(claim.authorization.amount,claim.authorization.feeBps)),claim.authorization.asset)}</span></div></div>}
        <div className="mt-5 rounded-xl border border-line p-4"><div className="flex items-center gap-2"><LockKeyhole size={14} className="text-green-deep"/><p className="text-xs font-medium">Payout destination</p></div><p className="mt-2 break-all font-mono text-xs text-ink/75">{link.payoutAccountId}</p></div>
        <label htmlFor="receipt-customer-name" className="mt-5 block text-xs font-medium">Your name on the receipt <span className="font-normal text-mist">(optional)</span><input id="receipt-customer-name" maxLength={120} autoComplete="name" disabled={!["ready","error"].includes(state)} value={customerName} onChange={(event)=>setCustomerName(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-xs outline-none focus:border-green-deep" placeholder="e.g. Ada Okafor"/></label>
        {state==="processing"&&<div className={`mt-5 rounded-xl border p-4 ${visibleOrderState==="PAYOUT_RETRYABLE"||visibleOrderState==="PARTIAL_PAYOUT"||visibleOrderState==="RECONCILIATION_REQUIRED"?"border-alert/20 bg-alert/5":"border-amber/40 bg-amber/10"}`}><div className={`flex items-center gap-2 ${visibleOrderState==="PAYOUT_RETRYABLE"||visibleOrderState==="PARTIAL_PAYOUT"||visibleOrderState==="RECONCILIATION_REQUIRED"?"text-alert":"text-amber-800"}`}>{visibleOrderState==="PAYOUT_RETRYABLE"||visibleOrderState==="PARTIAL_PAYOUT"||visibleOrderState==="RECONCILIATION_REQUIRED"?<CircleAlert size={15}/>:<LoaderCircle size={15} className="animate-spin"/>}<p className="text-xs font-medium">{visibleOrderState?.replaceAll("_"," ")??"Payment processing"}</p></div><p className="mt-2 text-xs leading-5 text-ink/60">{visibleOrderState==="PARTIAL_PAYOUT"?"A payout leg needs recovery. Do not pay this order again; the merchant service is reconciling the existing payment.":visibleOrderState==="PAYOUT_RETRYABLE"?"A payout is being retried. Do not submit another payment for this order.":visibleOrderState==="RECONCILIATION_REQUIRED"?"This order requires manual reconciliation. Do not retry or submit another payment.":"The wallet transaction is submitted, but the order stays Processing until the backend verifies successful merchant and fee payout receipts."}</p>{pending?.transactionHash&&<a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(pending.transactionHash)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] text-green-deep underline">View submitted transaction</a>}</div>}
        {state==="refunded"&&<div className="mt-4 rounded-xl border border-line bg-paper p-4 text-xs">The order was refunded. Check your wallet for the returned funds.</div>}
        {message&&<p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{message}</p>}
        {storageIssue&&<div className="mt-4 rounded-xl border border-amber-500/25 bg-amber/10 p-4"><p className="text-xs leading-5">The token requires storage registration for {storageIssue.accountIds.length} receiving account(s). Required deposit is {formatAssetAmount(storageIssue.minimumDeposit,{type:"native",symbol:"NEAR",decimals:24})} per account.</p><button onClick={()=>void registerStorage()} disabled={registering} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-4 text-xs font-medium disabled:opacity-50">{registering?<LoaderCircle size={13} className="animate-spin"/>:<Check size={13}/>}Register token accounts</button></div>}
        {state!=="processing"&&state!=="refunded"&&<button onClick={()=>void pay()} disabled={connecting||state==="claiming"||state==="awaiting-wallet"} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{connecting||state==="claiming"||state==="awaiting-wallet"?<LoaderCircle size={16} className="animate-spin"/>:<WalletCards size={16} className="text-signal"/>}{!accountId?"Connect NEAR wallet":state==="claiming"?"Preparing order…":state==="awaiting-wallet"?"Approve in your wallet…":"Pay with NEAR wallet"}<ArrowRight size={14}/></button>}
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-mist"><ShieldCheck size={13} className="shrink-0 text-green-deep"/>Your keys stay in your wallet. Check order status before retrying a pending payment.</p>
      </div>}
    </section></div></main>;
}

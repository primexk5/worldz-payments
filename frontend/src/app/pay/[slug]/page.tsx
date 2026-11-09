"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NearLogo } from "@/components/atoms/near-logo";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { NearReceipt } from "@/components/checkout/near-receipt";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi } from "@/lib/near/api";
import { claimPaymentLinkWithNearWallet } from "@/lib/near/auth";
import { NEAR_EXPLORER_URL, NEAR_NETWORK_ID } from "@/lib/near/config";
import { calculateFee, calculateNet } from "@/lib/near/amounts";
import { clearPendingPayment, getPendingPaymentForSlug, isVerifiedSettlement, registerFungibleTokenRecipients, savePendingPayment, submitAuthorizedPayment, TokenStorageRequiredError, waitForVerifiedSettlement, type PendingPayment } from "@/lib/near/payment";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { LinkClaim, OrderStatus, PaymentLink } from "@/lib/near/types";
import type { VtpassPurchaseStatus } from "@/lib/near/api";

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
  const [transactionHash,setTransactionHash]=useState("");
  const [servicePurchaseId,setServicePurchaseId]=useState<string|null>(null);
  const [serviceStatus,setServiceStatus]=useState<VtpassPurchaseStatus|null>(null);
  const fulfillmentStarted=useRef(false);

  const applyStatus=useCallback((status:OrderStatus,current:PendingPayment)=>{
    setOrder(status);
    if(isVerifiedSettlement(status)||status.state==="REFUNDED"){
      setState(isVerifiedSettlement(status)?"settled":"refunded");
      clearPendingPayment(current);
      if(isVerifiedSettlement(status)&&servicePurchaseId&&!fulfillmentStarted.current){
        fulfillmentStarted.current=true;
        void nearApi.vtpassFulfill(servicePurchaseId).then(setServiceStatus).catch((cause)=>{
          setMessage(cause instanceof Error?cause.message:"Payment is verified; VTpass fulfillment status needs to be checked.");
          void nearApi.vtpassPurchase(servicePurchaseId).then(setServiceStatus).catch(()=>undefined);
        });
      }
    }else if(status.state==="OPEN"&&status.failureReason){
      clearPendingPayment(current);setPending(null);setState("ready");setMessage(status.failureReason);
      if(status.authorization)setClaim({merchantId:status.merchantId,orderId:status.orderId,payerAccountId:status.payerAccountId,authorization:status.authorization});
    }else setState("processing");
  },[servicePurchaseId]);

  useEffect(()=>{
    let active=true;
    void params.then(async({slug:resolvedSlug})=>{
       const value=await nearApi.link(resolvedSlug);
       if(!active)return;
       setSlug(resolvedSlug);setLink(value);
        const purchaseId=new URLSearchParams(window.location.search).get("vtpassPurchase")??window.sessionStorage.getItem(`worldz:vtpass:purchase:${resolvedSlug}`);
        if(purchaseId){
          const purchase=await nearApi.vtpassPurchase(purchaseId).catch(()=>null);
          if(purchase?.linkSlug===resolvedSlug){setServicePurchaseId(purchaseId);setServiceStatus(purchase);}
        }
      const restored=getPendingPaymentForSlug(resolvedSlug);
      if(!restored){setCustomerName(window.sessionStorage.getItem(`worldz:near:customer:${resolvedSlug}`)??"");setState("ready");return;}
      const callbackHash=new URLSearchParams(window.location.search).get("transactionHashes")?.split(",")[0];
      const current={...restored,transactionHash:restored.transactionHash??callbackHash??null};
      savePendingPayment(current);setPending(current);setCustomerName(current.customerName??"");setState("processing");
      try{
        const status=await nearApi.order(current.merchantId,current.orderId,current.transactionHash);
        if(active){setCustomerName(current.customerName??status.customerName??"");applyStatus(status,current);}
      }catch(cause){if(active){
        if(callbackHash&&!restored.transactionHash){savePendingPayment(restored);setPending(restored);}
        setMessage(cause instanceof Error?cause.message:"Payment progress is saved. Waiting for the merchant service to reconnect.");
      }}
    }).catch((cause)=>{if(active){setState("not-found");setMessage(cause instanceof Error?cause.message:"This payment link is unavailable.");}});
    return()=>{active=false;};
  },[params,applyStatus]);

  const checkStatus=useCallback(async(current:PendingPayment)=>{
    setState("processing");
    try{const result=await waitForVerifiedSettlement(current.merchantId,current.orderId,(status)=>setOrder(status),180_000,current.transactionHash);applyStatus(result,current);if(result.state==="RECONCILIATION_REQUIRED")setMessage(result.failureReason??"Payment needs attention. Check the status before retrying.");}
    catch(cause){setMessage(cause instanceof Error?cause.message:"Payment is still processing.");}
  },[applyStatus]);

  useEffect(()=>{if(state!=="processing"||!pending)return;const interval=window.setInterval(()=>{void nearApi.order(pending.merchantId,pending.orderId,pending.transactionHash).then((status)=>applyStatus(status,pending)).catch(()=>{});},4000);return()=>window.clearInterval(interval);},[state,pending,applyStatus]);

  useEffect(()=>{
    if(state!=="settled"||!servicePurchaseId||serviceStatus?.state==="FULFILLED"||serviceStatus?.state==="FAILED")return;
    let active=true;
    const refresh=()=>void nearApi.vtpassPurchase(servicePurchaseId).then((status)=>{if(active)setServiceStatus(status);}).catch(()=>undefined);
    refresh();
    const interval=window.setInterval(refresh,4000);
    return()=>{active=false;window.clearInterval(interval);};
  },[state,servicePurchaseId,serviceStatus?.state]);

  // Edits to an existing checkout save automatically, including after a redirect.
  // The claim request also saves the initial name in the order transaction.
  const nameMerchantId=pending?.merchantId??claim?.merchantId;
  const nameOrderId=pending?.orderId??claim?.orderId;
  useEffect(()=>{
    if(!nameMerchantId||!nameOrderId||!customerName.trim()||state==="refunded"||state==="settled")return;
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const sync=async()=>{
      try{await nearApi.submitPaymentMeta(nameMerchantId,nameOrderId,customerName.trim(),slug);}
      catch{if(active)timer=setTimeout(()=>void sync(),5000);}
    };
    timer=setTimeout(()=>void sync(),600);
    return()=>{active=false;clearTimeout(timer);};
  },[nameMerchantId,nameOrderId,customerName,slug,state]);

  const connectWallet=async()=>{setMessage(null);try{await connect();}catch(cause){setMessage(cause instanceof Error?cause.message:"Wallet connection failed.");}};

  const pay=async()=>{
    if(!link)return;
    if(!wallet||!accountId){await connectWallet();return;}
    setState("claiming");setMessage(null);setStorageIssue(null);
    try{
      const currentClaim=await claimPaymentLinkWithNearWallet(wallet,accountId,slug,customerName);
      setClaim(currentClaim);
      const submitted=await submitAuthorizedPayment({wallet,accountId,claim:currentClaim,linkSlug:slug,customerName,onSubmitted:(value)=>{setPending(value);setState("awaiting-wallet");}});
      setPending(submitted);
      await checkStatus(submitted);
    }catch(cause){
      if(cause instanceof TokenStorageRequiredError){setStorageIssue(cause);setState("ready");setMessage("The receiving token accounts need storage registration before this payment.");return;}
      const saved=getPendingPaymentForSlug(slug);setPending(saved);setState(saved?"processing":"error");setMessage(cause instanceof Error?cause.message:"Could not submit the NEAR payment.");
    }
  };

  const recoverTransaction=async()=>{
    if(!pending||!transactionHash.trim())return;
    setMessage(null);
    try{
      const status=await nearApi.order(pending.merchantId,pending.orderId,transactionHash.trim());
      const updated={...pending,transactionHash:transactionHash.trim()};savePendingPayment(updated);setPending(updated);applyStatus(status,updated);
    }catch(cause){setMessage(cause instanceof Error?cause.message:"Could not verify this transaction.");}
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
  const isServiceCheckout = Boolean(servicePurchaseId);

  if(state==="settled"&&order&&isServiceCheckout)return <main className="min-h-screen bg-paper px-5 py-10 text-ink"><div className="mx-auto w-full max-w-[460px]"><header className="flex items-center justify-between"><div className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR testnet"><NearLogo className="size-4"/></span></div><MonoLabel>VTpass · Nigeria · Testnet</MonoLabel></header><section className="mt-9 overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_18px_65px_rgba(11,15,14,.07)]"><div className="border-b border-line/70 px-6 py-6 text-center"><div className="mx-auto grid size-12 place-items-center rounded-full bg-green-deep/10 text-green-deep"><Check size={22}/></div><h1 className="mt-4 text-xl font-semibold">VTpass service receipt</h1><p className="mt-2 text-xs leading-5 text-mist">Shown here in your service checkout—not the merchant payment receipt.</p></div><div className="p-5 sm:p-6"><div className="rounded-2xl bg-paper p-4"><p className="font-mono text-[10px] uppercase tracking-[.12em] text-mist">Service</p><p className="mt-2 text-sm font-semibold">{link?.displayName??serviceStatus?.serviceID??"Nigeria service"}</p><div className="mt-4 flex items-center justify-between gap-3 text-xs"><span className="text-mist">VTpass status</span><span className="font-medium">{serviceStatus?.state?.replaceAll("_"," ")??"Checking…"}</span></div><div className="mt-2 flex items-center justify-between gap-3 text-xs"><span className="text-mist">Service amount</span><span className="font-mono">₦{serviceStatus?.amountNgn??"—"}</span></div><div className="mt-1 flex items-center justify-between gap-3 text-xs"><span className="text-mist">Locked USD quote</span><span className="font-mono">${serviceStatus?.amountUsd??"—"}</span></div></div>{serviceStatus?.failureReason&&<p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{serviceStatus.failureReason}</p>}{serviceStatus?.providerResponse?.purchasedCode&&<div className="mt-4 rounded-xl border border-line p-4"><p className="text-[10px] uppercase tracking-[.1em] text-mist">Purchased code / electricity token</p><p className="mt-2 break-all font-mono text-sm">{serviceStatus.providerResponse.purchasedCode}</p></div>}{serviceStatus?.providerTransactionId&&<p className="mt-3 text-[10px] text-mist">VTpass reference: <span className="font-mono">{serviceStatus.providerTransactionId}</span></p>}<div className="mt-4 rounded-xl border border-line p-4"><p className="text-xs font-medium">NEAR testnet payment</p><p className="mt-2 font-mono text-xs">{formatAssetAmount(order.amount,order.asset)} · verified</p>{order.transactionHash&&<a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(order.transactionHash)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] text-green-deep underline">View testnet transaction</a>}</div><p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-3 text-[10px] leading-4 text-amber-900">Sandbox only. No real airtime, data, electricity, or subscription was delivered.</p></div></section><div className="mt-5 flex justify-center gap-5 text-xs"><Link href="/dashboard/services" className="text-green-deep underline underline-offset-4">Make another service purchase</Link><Link href="/" className="text-mist hover:text-ink">WorldzPayments</Link></div></div></main>;
  if(state==="settled"&&order)return <main className="min-h-screen bg-paper px-5 py-10"><div className="mx-auto w-full max-w-[460px]"><div className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR network"><NearLogo className="size-4"/></span></div><div className="mt-10"><NearReceipt order={{...order,paymentDescription:order.paymentDescription??link?.displayName,customerName:order.customerName??(customerName.trim()||null)}}/></div><div className="mt-5 text-center"><Link href="/" className="text-xs text-mist hover:text-ink">Return to WorldzPayments</Link></div></div></main>;

  return <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:py-12"><div className="mx-auto w-full max-w-[460px]"><header className="flex items-center justify-between"><div className="flex items-center gap-4"><BrandMark/><span className="border-l border-line pl-4" aria-label="NEAR network"><NearLogo className="size-4"/></span></div><Link href="/" className="inline-flex items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14}/>WorldzPayments</Link></header>
    <section className="mt-9 overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_18px_65px_rgba(11,15,14,.07)]"><div className="border-b border-line/70 px-5 py-5 sm:px-7"><div className="flex items-center gap-2"><NearLogo className="size-4"/><MonoLabel>{isServiceCheckout?"VTpass service · testnet":"NEAR checkout · "+NEAR_NETWORK_ID}</MonoLabel></div><h1 className="mt-2 text-xl font-semibold tracking-tight">{isServiceCheckout?"Nigeria service checkout":link?.displayName||link?.merchantId||"Secure checkout"}</h1><p className="mt-1 text-xs text-mist">{isServiceCheckout?"Review this sandbox purchase and authorize it with your NEAR wallet.":"Merchant payout goes directly to its configured NEAR account."}</p></div>
      {state==="loading"?<div className="flex items-center justify-center gap-2 p-14 text-xs text-mist"><LoaderCircle size={16} className="animate-spin"/>Loading payment link…</div>:state==="not-found"?<div className="p-8 text-center"><p className="text-sm font-medium">Payment link unavailable</p><p className="mt-2 text-xs text-mist">{message}</p></div>:link&&<div className="p-5 sm:p-7"><div className="rounded-[20px] bg-paper px-5 py-6 text-center"><MonoLabel>Total to pay</MonoLabel><p className="mt-3 text-4xl font-semibold tracking-tight">{link.amountDisplay}<span className="ml-2 text-sm font-medium text-green-deep">{link.asset.symbol}</span></p><p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-mist">{link.networkId} · {link.asset.type==="native"?"Native NEAR":link.asset.contractId}</p></div>
         {claim&&!isServiceCheckout&&<div className="mt-4 rounded-xl border border-line p-4"><div className="flex justify-between gap-3 text-xs"><span className="text-mist">Platform fee · {claim.authorization.feeBps/100}%</span><span className="font-mono">{formatAssetAmount(calculateFee(claim.authorization.amount,claim.authorization.feeBps),claim.authorization.asset)}</span></div><div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Merchant net</span><span className="font-mono">{formatAssetAmount(calculateNet(claim.authorization.amount,calculateFee(claim.authorization.amount,claim.authorization.feeBps)),claim.authorization.asset)}</span></div></div>}
         {!isServiceCheckout&&<div className="mt-5 rounded-xl border border-line p-4"><div className="flex items-center gap-2"><LockKeyhole size={14} className="text-green-deep"/><p className="text-xs font-medium">Payout destination</p></div><p className="mt-2 break-all font-mono text-xs text-ink/75">{link.payoutAccountId}</p></div>}
         {!isServiceCheckout&&<label htmlFor="receipt-customer-name" className="mt-5 block text-xs font-medium">Your name on the receipt <span className="font-normal text-mist">(optional)</span><input id="receipt-customer-name" name="customerName" maxLength={120} autoComplete="name" disabled={state==="refunded"||state==="claiming"||state==="awaiting-wallet"} value={customerName} onChange={(event)=>{const name=event.target.value;setCustomerName(name);window.sessionStorage.setItem(`worldz:near:customer:${slug}`,name);if(pending){const updated={...pending,customerName:name};savePendingPayment(updated);setPending(updated);}}} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/30 disabled:opacity-50" placeholder="e.g. Ada Okafor"/></label>}
        {state==="processing"&&pending&&!pending.transactionHash&&<div className="mt-4 rounded-xl border border-line p-4"><p className="text-xs leading-5 text-mist">Your wallet did not return a transaction hash. Copy it from your wallet history to check whether the payment failed or completed.</p><label htmlFor="payment-transaction-hash" className="mt-3 block text-xs font-medium">Wallet transaction hash<input id="payment-transaction-hash" value={transactionHash} onChange={(event)=>setTransactionHash(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-line px-3 text-xs"/></label><button onClick={()=>void recoverTransaction()} disabled={!transactionHash.trim()} className="mt-3 text-xs font-medium text-green-deep underline disabled:opacity-50">Check payment status</button></div>}
        {state==="processing"&&<div className={`mt-5 rounded-xl border p-4 ${visibleOrderState==="PAYOUT_RETRYABLE"||visibleOrderState==="PARTIAL_PAYOUT"||visibleOrderState==="RECONCILIATION_REQUIRED"?"border-alert/20 bg-alert/5":"border-amber/40 bg-amber/10"}`}><div className={`flex items-center gap-2 ${visibleOrderState==="PAYOUT_RETRYABLE"||visibleOrderState==="PARTIAL_PAYOUT"||visibleOrderState==="RECONCILIATION_REQUIRED"?"text-alert":"text-amber-800"}`}>{visibleOrderState==="PAYOUT_RETRYABLE"||visibleOrderState==="PARTIAL_PAYOUT"||visibleOrderState==="RECONCILIATION_REQUIRED"?<CircleAlert size={15}/>:<LoaderCircle size={15} className="animate-spin"/>}<p className="text-xs font-medium">{visibleOrderState?.replaceAll("_"," ")??"Payment processing"}</p></div><p className="mt-2 text-xs leading-5 text-ink/60">{visibleOrderState==="PARTIAL_PAYOUT"?"A payout leg needs recovery. Do not pay this order again; the merchant service is reconciling the existing payment.":visibleOrderState==="PAYOUT_RETRYABLE"?"A payout is being retried. Do not submit another payment for this order.":visibleOrderState==="RECONCILIATION_REQUIRED"?"This order requires manual reconciliation. Do not retry or submit another payment.":"We are checking your payment and merchant payout. If your wallet showed an error, use its transaction hash to verify the result."}</p>{pending?.transactionHash&&<a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(pending.transactionHash)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] text-green-deep underline">View submitted transaction</a>}</div>}
        {state==="refunded"&&<div className="mt-4 rounded-xl border border-line bg-paper p-4 text-xs">The order was refunded. Check your wallet for the returned funds.</div>}
        {message&&<p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{message}</p>}
        {storageIssue&&<div className="mt-4 rounded-xl border border-amber-500/25 bg-amber/10 p-4"><p className="text-xs leading-5">The token requires storage registration for {storageIssue.accountIds.length} receiving account(s). Required deposit is {formatAssetAmount(storageIssue.minimumDeposit,{type:"native",symbol:"NEAR",decimals:24})} per account.</p><button onClick={()=>void registerStorage()} disabled={registering} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-4 text-xs font-medium disabled:opacity-50">{registering?<LoaderCircle size={13} className="animate-spin"/>:<Check size={13}/>}Register token accounts</button></div>}
        {state!=="processing"&&state!=="refunded"&&<button onClick={()=>void pay()} disabled={connecting||state==="claiming"||state==="awaiting-wallet"} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{connecting||state==="claiming"||state==="awaiting-wallet"?<LoaderCircle size={16} className="animate-spin"/>:<WalletCards size={16} className="text-signal"/>}{!accountId?"Connect NEAR wallet":state==="claiming"?"Verify checkout in your wallet…":state==="awaiting-wallet"?"Approve in your wallet…":"Pay with NEAR wallet"}<ArrowRight size={14}/></button>}
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-mist"><ShieldCheck size={13} className="shrink-0 text-green-deep"/>Your keys stay in your wallet. Check order status before retrying a pending payment.</p>
      </div>}
    </section></div></main>;
}

"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, Copy, ExternalLink, Link2, LoaderCircle, LockKeyhole, Plus, ShieldCheck, Trash2, Users, Wallet } from "lucide-react";
import { ChoiceSelect, type SelectOption } from "@/components/molecules/choice-select";
import { TokenLogo } from "@/components/atoms/token-logo";
import { MonoLabel } from "@/components/atoms/mono-label";
import { nearApi } from "@/lib/near/api";
import { getPublicAppUrl, NEAR_NETWORK_ID, NEAR_NATIVE_ASSET } from "@/lib/near/config";
import { parseUnitsExact } from "@/lib/near/amounts";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { AllowedFungibleToken, MerchantProfile, NearAsset, PaymentLink } from "@/lib/near/types";

const redemptionOptions = [0,5,10,25,50,100];
const expiryOptions: SelectOption[] = [
  { value: "", label: "No expiry", description: "Available until you stop sharing it" },
  { value: "0.25", label: "15 minutes" },
  { value: "1", label: "1 hour" },
  { value: "6", label: "6 hours" },
  { value: "24", label: "24 hours" },
  { value: "168", label: "7 days" },
].map(option => ({ ...option, icon: <Clock3 className="size-4 shrink-0 text-ink/45"/> }));

function getExpiryTimestamp(hours: string): number {
  return Math.floor(Date.now() / 1000 + Number(hours) * 3600);
}

export default function PaymentLinksPage() {
  const [merchant,setMerchant] = useState<MerchantProfile|null>(null);
  const [links,setLinks] = useState<PaymentLink[]>([]);
  const [assetChoice,setAssetChoice] = useState("native");
  const [allowedTokens,setAllowedTokens] = useState<AllowedFungibleToken[]>([]);
  const [amount,setAmount] = useState("");
  const [shopName,setShopName] = useState("");
  const [expiryHours,setExpiryHours] = useState("");
  const [multiPay,setMultiPay] = useState(false);
  const [maxRedemptions,setMaxRedemptions] = useState(0);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const [createdUrl,setCreatedUrl] = useState<string|null>(null);
  const [copied,setCopied] = useState<string|null>(null);
  const [deletingSlug,setDeletingSlug] = useState<string|null>(null);

  useEffect(()=>{let active=true;void Promise.all([nearApi.me(),nearApi.links(),nearApi.allowedAssets().catch(()=>({tokens:[]}))]).then(([profile,result,assetResponse])=>{if(!active)return;setMerchant(profile);setLinks(result.links);setAllowedTokens(assetResponse.tokens);}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"Could not load merchant links.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);

  const selectedToken=allowedTokens.find((token)=>token.contractId===assetChoice);
  const asset: NearAsset|null=assetChoice==="native"?NEAR_NATIVE_ASSET:selectedToken?{type:"nep141",contractId:selectedToken.contractId,symbol:selectedToken.symbol,decimals:selectedToken.decimals}:null;
  const create=async()=>{if(!merchant)return setError("Complete merchant onboarding before creating a link.");if(!asset)return setError("Choose an available payment asset.");setBusy(true);setError(null);setCreatedUrl(null);try{const units=parseUnitsExact(amount,asset.decimals);if(units<=0n)throw new Error("Amount must be greater than zero.");if(expiryHours&&(!Number.isFinite(Number(expiryHours))||Number(expiryHours)<=0))throw new Error("Choose a valid expiry.");const expiresAtSeconds=expiryHours?getExpiryTimestamp(expiryHours):null;const created=await nearApi.createLink({networkId:NEAR_NETWORK_ID,asset,amount:units.toString(),amountDisplay:amount,displayName:shopName.trim(),expiresAtSeconds,multiPay,maxRedemptions:multiPay?maxRedemptions:1});const paymentPath=`/pay/${created.slug}`;const url=getPublicAppUrl(paymentPath);setCreatedUrl(url.startsWith("/")?new URL(url,window.location.origin).toString():url);setLinks((previous)=>[created,...previous]);setAmount("");setShopName("");}catch(cause){setError(cause instanceof Error?cause.message:"Could not create payment link.");}finally{setBusy(false);}};
  const copy=async(value:string)=>{try{const shareUrl=value.startsWith("/")?new URL(value,window.location.origin).toString():value;await navigator.clipboard.writeText(shareUrl);setCopied(value);window.setTimeout(()=>setCopied(null),1500);}catch{setError("Could not access the clipboard.");}};
  const removeLink=async(link:PaymentLink)=>{if(!window.confirm("Delete this payment link? It will stop accepting new claims. Existing orders remain in your payment history."))return;setDeletingSlug(link.slug);setError(null);setNotice(null);try{await nearApi.deleteLink(link.slug);setLinks((current)=>current.filter((item)=>item.slug!==link.slug));}catch(cause){try{const latest=await nearApi.links();if(!latest.links.some((item)=>item.slug===link.slug)){setLinks(latest.links);setNotice("The link is deleted and no longer accepts new claims.");return;}}catch{/* Keep the original request error if the status check also fails. */}setError(cause instanceof Error?cause.message:"Could not delete payment link.");}finally{setDeletingSlug(null);}};

  const assetOptions: SelectOption[] = [
    { value: "native", label: "NEAR", description: "Native NEAR token", icon: <TokenLogo symbol="NEAR"/> },
    ...allowedTokens.map(token => ({ value: token.contractId, label: token.symbol, description: token.name, icon: <TokenLogo symbol={token.symbol} icon={token.icon}/> })),
  ];
  let validAmount = false;
  try { validAmount = !!asset && parseUnitsExact(amount, asset.decimals) > 0n; } catch { /* Incomplete amounts stay editable. */ }
  const expiryLabel = expiryOptions.find(option => option.value === expiryHours)?.label ?? "No expiry";

  return <div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><MonoLabel>Merchant workspace / Payment links</MonoLabel><h1 className="mt-2 text-3xl font-semibold tracking-tight">One link. Ready to get paid.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-ink/60">Set an amount, share your link, and let customers pay from their wallet.</p></div><span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-wider"><span className="size-1.5 rounded-full bg-green-deep"/>{NEAR_NETWORK_ID}</span></header>{notice&&<p role="status" className="rounded-xl border border-green-deep/20 bg-green-deep/5 p-3 text-xs text-green-deep">{notice}</p>}
    <section className="overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_8px_30px_-24px_#07382e40]">
      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <form onSubmit={event => { event.preventDefault(); if (validAmount && !busy && !loading && merchant) void create(); }} className="payment-link-form min-w-0 p-5 sm:p-8">
          <div className="mb-8 flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-vault text-signal"><Link2 size={20}/></span><div><h2 className="text-base font-semibold tracking-tight">Create a payment link</h2><p className="mt-1 text-xs text-ink/50">A few details. A checkout that’s yours.</p></div></div>
          <fieldset disabled={busy || loading} className="min-w-0 space-y-6 disabled:opacity-60">
            <div><label htmlFor="payment-asset" className="mb-2 block text-xs font-medium">Accept payment in</label><ChoiceSelect id="payment-asset" value={assetChoice} onValueChange={setAssetChoice} options={assetOptions}/><p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink/50"><ShieldCheck size={12} className="text-green-deep"/>Available assets verified for this network</p></div>
            <div><label htmlFor="payment-amount" className="mb-2 block text-xs font-medium">Amount <span className="text-green-deep">*</span></label><div className="flex items-center gap-3 rounded-xl border border-line bg-paper/40 px-4 transition focus-within:border-ink/30 focus-within:ring-2 focus-within:ring-green-deep/20"><input id="payment-amount" value={amount} onChange={event=>setAmount(event.target.value)} required autoComplete="off" inputMode="decimal" aria-describedby="amount-hint" className="h-20 w-full min-w-0 bg-transparent font-mono text-4xl tracking-tight outline-none placeholder:text-ink/20 focus-visible:outline-none" placeholder="0.00"/><span className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium">{asset?.symbol ?? "—"}</span></div><p id="amount-hint" className="mt-2 text-[11px] text-ink/50">Each customer pays this exact amount.</p></div>
            <div><div className="mb-2 flex justify-between gap-3"><label htmlFor="payment-description" className="text-xs font-medium">What is it for? <span className="font-normal text-ink/40">Optional</span></label><span className="font-mono text-[10px] text-ink/40">{shopName.length}/80</span></div><input id="payment-description" value={shopName} onChange={event=>setShopName(event.target.value)} maxLength={80} className="h-12 w-full rounded-xl border border-line bg-white px-4 text-sm outline-none transition placeholder:text-ink/35 focus:border-ink/30" placeholder="e.g. Website design deposit"/><p className="mt-2 text-[11px] text-ink/50">Shown to your customer at checkout and on their receipt.</p></div>
            <div><label htmlFor="payment-expiry" className="mb-2 block text-xs font-medium">Link expires after</label><ChoiceSelect id="payment-expiry" value={expiryHours} onValueChange={setExpiryHours} options={expiryOptions}/></div>
            <div className={`rounded-2xl border p-4 transition-colors ${multiPay ? "border-green-deep/30 bg-green-deep/5" : "border-line bg-paper/35"}`}><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Users size={18} className="shrink-0 text-vault"/><div><p id="repeat-payment-label" className="text-xs font-medium">Allow repeated payments</p><p className="mt-1 text-[11px] leading-5 text-ink/50">Let more than one customer use this link.</p></div></div><button type="button" role="switch" aria-labelledby="repeat-payment-label" aria-checked={multiPay} onClick={()=>setMultiPay(value=>!value)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${multiPay ? "bg-vault" : "bg-ink/20"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${multiPay ? "left-1 translate-x-5" : "left-1"}`}/></button></div>{multiPay && <div className="mt-4 border-t border-green-deep/15 pt-4"><p className="mb-2 text-[11px] text-ink/60">Maximum number of payments</p><div className="flex flex-wrap gap-2">{redemptionOptions.map(limit=><button type="button" key={limit} aria-pressed={maxRedemptions===limit} onClick={()=>setMaxRedemptions(limit)} className={`rounded-lg border px-3 py-2 text-xs transition ${maxRedemptions===limit ? "border-vault bg-vault text-white" : "border-line bg-white text-ink/60"}`}>{limit===0 ? "Unlimited" : limit}</button>)}</div></div>}</div>
          </fieldset>
          {error && <p role="alert" className="mt-5 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{error}</p>}
          <button type="submit" disabled={busy || loading || !merchant || !validAmount} className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-vault px-5 text-sm font-medium text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40">{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Plus size={16}/>}{busy ? "Creating your link…" : "Create payment link"}{!busy && <ArrowRight size={16} className="ml-auto"/>}</button>
          <p className="mt-3 text-center text-[10px] leading-5 text-ink/45">Create your link, then copy it to share with your customer.</p>
        </form>
        <aside className="min-w-0 border-t border-line bg-[#edf0e7] p-5 sm:p-8 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3"><MonoLabel className="text-[9px] text-vault/60">Checkout preview</MonoLabel><span className="rounded-full border border-vault/15 px-2.5 py-1 text-[9px] text-vault/60">Updates as you type</span></div>
          <div className="mt-7 rounded-[22px] border border-white bg-[#fffefa] p-5 shadow-[0_16px_40px_-24px_#07382e40] sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-vault text-white"><Wallet size={18}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{merchant?.displayName || "Your store"}</p><p className="mt-1 text-[10px] text-ink/45">Payment request</p></div></div>
            <div className="py-8"><p className="text-[11px] text-ink/50">Amount to pay</p><p className="mt-3 break-all font-mono text-4xl font-medium tracking-[-.06em]">{amount || "0.00"}</p><span className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink/55">{asset && <TokenLogo symbol={asset.symbol} icon={selectedToken?.icon} className="size-4"/>}{asset?.symbol ?? "Choose an asset"}</span><p className="mt-5 break-words text-sm leading-6 text-ink/70">{shopName.trim() || "Your item or service"}</p></div>
            <div className="space-y-3 border-t border-dashed border-line py-5 text-[11px]"><div className="flex justify-between gap-3"><span className="text-ink/45">Link expiry</span><span>{expiryLabel}</span></div><div className="flex justify-between gap-3"><span className="text-ink/45">Payments</span><span>{multiPay ? (maxRedemptions ? `Up to ${maxRedemptions}` : "Unlimited") : "One-time"}</span></div><div className="flex justify-between gap-3"><span className="text-ink/45">Network</span><span className="capitalize">{NEAR_NETWORK_ID}</span></div></div>
            <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-xs font-medium text-white"><Wallet size={14}/>Pay with your wallet</div><p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-ink/40"><LockKeyhole size={10}/>Checkout by WorldzPayments</p>
          </div>
          <div className="mt-6 flex items-start gap-3 px-1"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-vault"/><div><p className="text-xs font-medium text-vault">Straight to your payout wallet</p><p className="mt-2 break-all font-mono text-[11px] leading-5 text-vault/60">{merchant?.payoutAccountId || "Your wallet appears here"}</p><p className="mt-3 text-[11px] leading-5 text-vault/60">Your customer can track payment progress. A receipt is available once settlement is verified.</p></div></div>
        </aside>
      </div>
      {createdUrl && <div role="status" className="flex flex-col gap-3 border-t border-green-deep/20 bg-green-deep/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div className="min-w-0"><MonoLabel className="text-green-deep">Your link is ready to share</MonoLabel><p className="mt-2 break-all font-mono text-xs">{createdUrl}</p></div><button type="button" onClick={()=>void copy(createdUrl)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-vault px-4 text-xs text-white">{copied===createdUrl ? <Check size={14}/> : <Copy size={14}/>}{copied===createdUrl ? "Copied" : "Copy payment link"}</button></div>}
    </section>
    <section className="overflow-hidden rounded-[20px] border border-line bg-white"><div className="border-b border-line px-5 py-4"><h2 className="text-sm font-semibold">Your links</h2><p className="mt-1 text-xs text-mist">{links.length} active payment link{links.length===1?"":"s"}</p></div>{loading?<p className="p-6 text-xs text-mist">Loading links…</p>:links.length===0?<p className="p-6 text-xs text-mist">No active links.</p>:<div className="divide-y divide-line/60">{links.map((link)=>{const url=getPublicAppUrl(`/pay/${link.slug}`);const deleting=deletingSlug===link.slug;return <article key={link.slug} className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-xs font-medium">{link.displayName||formatAssetAmount(link.amount,link.asset)} <span className="font-normal text-mist">· {link.asset.symbol}</span></p><p className="mt-1 truncate font-mono text-[11px] text-mist">/pay/{link.slug} · {link.multiPay?(link.maxRedemptions?`up to ${link.maxRedemptions} claims`:"unlimited claims"):"one-time"}</p></div><div className="flex items-center gap-2"><button onClick={()=>void copy(url)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[11px] text-ink/70 hover:text-ink">{copied===url?<Check size={12}/>:<Copy size={12}/>}Copy</button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[11px] text-ink/70 hover:text-ink">Open <ExternalLink size={11}/></a><button type="button" onClick={()=>void removeLink(link)} disabled={deleting} aria-label={`Delete ${link.displayName||"payment link"}`} title="Delete payment link" className="grid size-8 place-items-center rounded-full border border-alert/20 text-alert transition hover:bg-alert/5 disabled:opacity-50">{deleting?<LoaderCircle size={13} className="animate-spin"/>:<Trash2 size={13}/>}</button></div></article>})}</div>}</section>
  </div>;
}

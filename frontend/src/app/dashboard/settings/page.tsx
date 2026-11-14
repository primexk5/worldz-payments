"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, KeyRound, LoaderCircle, Save, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { ShopifyLogo } from "@/components/atoms/shopify-logo";
import { nearApi } from "@/lib/near/api";
import type { MerchantApiKey, MerchantProfile, NewMerchantApiKey } from "@/lib/near/types";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { updatePayoutWithNearWallet } from "@/lib/near/auth";
import { getNativeNearBalance } from "@/lib/near/tokens";

export default function SettingsPage() {
  const [profile,setProfile]=useState<MerchantProfile|null>(null);
  const {accountId,wallet,connect,connecting}=useNearWallet();
  const [displayName,setDisplayName]=useState("");
  const [payoutAccountId,setPayoutAccountId]=useState("");
  const [webhookUrl,setWebhookUrl]=useState("");
  const [keys,setKeys]=useState<MerchantApiKey[]>([]);
  const [newKey,setNewKey]=useState<NewMerchantApiKey|null>(null);
  const [keyLabel,setKeyLabel]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [saved,setSaved]=useState(false);
  const [keyBusy,setKeyBusy]=useState(false);
  const [shopDomain,setShopDomain]=useState("");
  const [shopifyShops,setShopifyShops]=useState<{shopDomain:string;scopes:string;installedAtMs:number}[]>([]);
  const [merchantIdCopied,setMerchantIdCopied]=useState(false);

  useEffect(()=>{if(!merchantIdCopied)return;const timeout=window.setTimeout(()=>setMerchantIdCopied(false),2000);return()=>window.clearTimeout(timeout);},[merchantIdCopied]);

  const reload=async()=>{const [me,keyList,shopify]=await Promise.all([nearApi.me(),nearApi.apiKeys(),nearApi.shopifyConnection()]);setProfile(me);setDisplayName(me.displayName);setPayoutAccountId(me.payoutAccountId);setWebhookUrl(me.webhookUrl??"");setKeys(keyList.keys);setShopifyShops(shopify.shops);};
  useEffect(()=>{let active=true;void Promise.all([nearApi.me(),nearApi.apiKeys(),nearApi.shopifyConnection()]).then(([me,keyList,shopify])=>{if(!active)return;setProfile(me);setDisplayName(me.displayName);setPayoutAccountId(me.payoutAccountId);setWebhookUrl(me.webhookUrl??"");setKeys(keyList.keys);setShopifyShops(shopify.shops);}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"Could not load settings.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);

  const save=async()=>{setSaving(true);setError(null);setSaved(false);try{const updated=await nearApi.updateProfile({displayName:displayName.trim(),webhookUrl:webhookUrl.trim()||null});setProfile((current)=>current?{...current,...updated,payoutAccountId:current.payoutAccountId}:updated);setSaved(true);}catch(cause){setError(cause instanceof Error?cause.message:"Could not save settings.");}finally{setSaving(false);}};
  const savePayout=async()=>{if(!profile)return;if(!payoutAccountId.trim())return setError("Enter the payout NEAR account.");if(!wallet||!accountId){try{await connect();setError("Wallet connected. Confirm the merchant account and press the payout button again.");}catch(cause){setError(cause instanceof Error?cause.message:"Wallet connection failed.");}return;}if(accountId!==profile.accountId){setError("The connected wallet differs from the signed-in merchant identity. Reconnect the merchant account before changing payouts.");return;}setSaving(true);setError(null);setSaved(false);try{await getNativeNearBalance(payoutAccountId.trim());const updated=await updatePayoutWithNearWallet({wallet,accountId,payoutAccountId:payoutAccountId.trim()});setProfile(updated);setPayoutAccountId(updated.payoutAccountId);setSaved(true);}catch(cause){setError(cause instanceof Error?cause.message:"Could not authorize the payout destination.");}finally{setSaving(false);}};
  const createKey=async()=>{if(!keyLabel.trim())return setError("Give the API key a label.");setKeyBusy(true);setError(null);try{const created=await nearApi.createApiKey(keyLabel.trim());setNewKey(created);setKeyLabel("");await reload();}catch(cause){setError(cause instanceof Error?cause.message:"Could not create API key.");}finally{setKeyBusy(false);}};
  const revoke=async(keyRef:string)=>{setKeyBusy(true);setError(null);try{await nearApi.revokeApiKey(keyRef);setKeys((current)=>current.filter((key)=>key.keyRef!==keyRef));}catch(cause){setError(cause instanceof Error?cause.message:"Could not revoke API key.");}finally{setKeyBusy(false);}};
  const copyKey=async()=>{if(!newKey)return;try{await navigator.clipboard.writeText(newKey.secret);}catch{setError("Clipboard permission was denied.");}};
  const copyMerchantId=async()=>{if(!profile?.merchantId)return;try{await navigator.clipboard.writeText(profile.merchantId);setMerchantIdCopied(true);}catch{setError("Could not copy the merchant ID. Select and copy it from the field below.");}};

  const inputClass = "mt-2 h-12 min-h-12 w-full min-w-0 shrink-0 rounded-xl border border-line bg-white px-4 text-base outline-none transition-colors placeholder:text-ink/35 focus:border-ink/30 sm:text-sm";
  const actionClass = "inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-vault px-5 text-sm font-medium text-white transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto";

  return <div className="space-y-6">
    <header><MonoLabel>Merchant workspace / Account</MonoLabel><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 max-w-xl text-sm leading-6 text-ink/60">Your business details, payout wallet, and store connections. All in one place.</p></header>
    {error && <p role="alert" className="rounded-2xl border border-alert/20 bg-alert/5 p-4 text-sm leading-6 text-alert">{error}</p>}
    {saved && <p role="status" className="flex items-center gap-2 rounded-2xl border border-green-deep/20 bg-green-deep/5 p-4 text-sm text-vault"><Check size={16}/>Your changes have been saved.</p>}
    {loading ? <p role="status" className="py-12 text-center text-sm text-ink/50">Loading your settings…</p> : <div className="space-y-6">
      <section className="overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="flex items-start gap-3 border-b border-line/65 p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3f8eb]"><ShopifyLogo className="size-7"/></span><div className="min-w-0"><h2 className="text-base font-semibold tracking-tight">Connect your Shopify store</h2><p className="mt-1 text-xs leading-6 text-ink/50">Add NEAR payments to your development store’s product pages.</p></div></div>
        <div className="p-5 sm:p-6">
          {shopifyShops.length > 0 && <ul className="mb-5 divide-y divide-line rounded-xl border border-line bg-paper/30 px-4">{shopifyShops.map(shop => <li key={shop.shopDomain} className="flex flex-wrap items-center justify-between gap-2 py-4"><span className="min-w-0 break-all font-mono text-xs">{shop.shopDomain}</span><span className="inline-flex items-center gap-1 text-[11px] text-vault"><Check size={12}/>Connected · {new Date(shop.installedAtMs).toLocaleDateString()}</span></li>)}</ul>}
          <form onSubmit={event => { event.preventDefault(); const shop = shopDomain.trim().toLowerCase(); if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(shop)) { setError("Enter a valid store domain ending in .myshopify.com."); return; } window.location.assign(new URL(`/api/v1/shopify/install?shop=${encodeURIComponent(shop)}`, window.location.origin).toString()); }}>
            <label htmlFor="shopify-domain" className="block text-xs font-medium">Store domain</label>
            <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start"><input id="shopify-domain" required value={shopDomain} onChange={event => setShopDomain(event.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="store-name.myshopify.com" className={`${inputClass} !mt-0 sm:flex-1`}/><button type="submit" className={actionClass}>Connect Shopify<ArrowRight size={15}/></button></div>
            <p className="mt-3 text-xs leading-6 text-ink/50">Use your store’s .myshopify.com address. After connecting, set product token prices and add the Pay with NEAR theme block.</p>
          </form>
          <Link href="/docs#shopify" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-vault">View the Shopify setup guide<ArrowRight size={13}/></Link>
        </div>
      </section>
      <section className="overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="flex items-start gap-3 border-b border-line/65 p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-deep/10 text-vault"><ShieldCheck size={20}/></span><div><h2 className="text-base font-semibold tracking-tight">Merchant profile</h2><p className="mt-1 text-xs leading-6 text-ink/50">The details customers see at checkout and on receipts.</p></div></div>
        <div className="space-y-6 p-5 sm:p-6">
          <div className="rounded-2xl border border-line bg-paper/35 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs text-ink/50">Login account</span><span className="inline-flex items-center gap-1 text-[10px] font-medium text-vault"><ShieldCheck size={12}/>Verified</span></div><p className="mt-3 break-all font-mono text-sm leading-6">{profile?.accountId}</p></div>
          <div>
            <label htmlFor="merchant-id" className="text-xs font-medium">Merchant ID</label>
            <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row">
              <input id="merchant-id" readOnly value={profile?.merchantId ?? ""} aria-describedby="merchant-id-description" spellCheck={false} className={`${inputClass} !mt-0 font-mono sm:flex-1`}/>
              <button type="button" onClick={()=>void copyMerchantId()} disabled={!profile?.merchantId} className={actionClass} aria-label="Copy merchant ID">
                {merchantIdCopied ? <Check size={16}/> : <Copy size={16}/>}<span role="status">{merchantIdCopied ? "Copied" : "Copy ID"}</span>
              </button>
            </div>
            <p id="merchant-id-description" className="mt-2 text-xs leading-6 text-ink/50">Your unique workspace ID. Use it when setting up API and webhook integrations.</p>
          </div>
          <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-5">
            <div><label htmlFor="business-name" className="text-xs font-medium">Business name</label><input id="business-name" value={displayName} onChange={event => setDisplayName(event.target.value)} autoComplete="organization" className={inputClass}/></div>
            <div><label htmlFor="webhook-url" className="text-xs font-medium">Webhook URL <span className="font-normal text-ink/40">Optional</span></label><input id="webhook-url" inputMode="url" type="url" value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)} autoCapitalize="none" spellCheck={false} placeholder="https://shop.example/webhooks/worldz" className={inputClass}/><p className="mt-2 text-xs leading-6 text-ink/50">Receive payment updates at your server’s webhook endpoint.</p></div>
            <div className="flex justify-end"><button type="submit" disabled={saving} className={actionClass}>{saving ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}Save profile</button></div>
          </form>
          <div className="border-t border-line pt-6"><div className="mb-4 flex items-center gap-2"><Wallet size={16} className="text-vault"/><h3 className="text-sm font-semibold">Payout destination</h3></div><label htmlFor="payout-account" className="text-xs font-medium">NEAR account receiving your payments</label><input id="payout-account" value={payoutAccountId} onChange={event => setPayoutAccountId(event.target.value)} autoCapitalize="none" spellCheck={false} className={`${inputClass} font-mono`}/><p className="mt-3 text-xs leading-6 text-ink/50">Updating this wallet requires approval from your merchant login account. Save your profile details separately above.</p><div className="mt-4 flex justify-end"><button type="button" onClick={() => void savePayout()} disabled={saving || connecting || payoutAccountId.trim() === profile?.payoutAccountId} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-vault transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{saving ? <LoaderCircle size={16} className="animate-spin"/> : <ShieldCheck size={16}/>}Authorize payout change</button></div></div>
        </div>
      </section>
      <section className="overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="flex items-start gap-3 border-b border-line/65 p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-vault text-signal"><KeyRound size={20}/></span><div><h2 className="text-base font-semibold tracking-tight">API keys</h2><p className="mt-1 text-xs leading-6 text-ink/50">Connect your server to WorldzPayments. New keys are shown once.</p></div></div>
        <div className="p-5 sm:p-6">
          {newKey && <div role="status" className="mb-6 rounded-2xl border border-green-deep/20 bg-green-deep/5 p-4"><p className="text-xs font-medium leading-6 text-vault">Copy your new key and keep it somewhere safe. You won’t see it again.</p><div className="mt-3 flex items-start gap-2"><code className="min-w-0 flex-1 break-all font-mono text-xs leading-6">{newKey.secret}</code><button type="button" onClick={() => void copyKey()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-vault text-white" aria-label="Copy API key"><Copy size={16}/></button></div><button type="button" onClick={() => setNewKey(null)} className="mt-3 min-h-11 text-xs text-vault underline underline-offset-4">I’ve saved my key</button></div>}
          <form onSubmit={event => { event.preventDefault(); void createKey(); }}><label htmlFor="api-key-label" className="block text-xs font-medium">Key name</label><div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start"><input id="api-key-label" required value={keyLabel} onChange={event => setKeyLabel(event.target.value)} placeholder="e.g. Shopify store" className={`${inputClass} !mt-0 sm:flex-1`}/><button type="submit" disabled={keyBusy || !keyLabel.trim()} className={actionClass}>{keyBusy ? <LoaderCircle size={16} className="animate-spin"/> : <KeyRound size={16}/>}Create API key</button></div></form>
          <div className="mt-6 border-t border-line pt-2">{keys.length === 0 ? <div className="py-6 text-center"><KeyRound size={21} className="mx-auto text-ink/25"/><p className="mt-3 text-xs font-medium text-ink/60">No API keys yet</p><p className="mt-2 text-xs leading-6 text-ink/40">Create one when you’re ready to connect an integration.</p></div> : <ul className="divide-y divide-line/60">{keys.map(key => <li key={key.keyRef} className="flex min-w-0 items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words text-sm font-medium">{key.label}</p><p className="mt-2 break-all font-mono text-[10px] leading-5 text-ink/45">{key.keyRef}</p><p className="mt-1 text-[11px] text-ink/45">Created {new Date(key.createdAtMs).toLocaleDateString()}</p></div><button type="button" onClick={() => void revoke(key.keyRef)} disabled={keyBusy} className="grid size-11 shrink-0 place-items-center rounded-xl border border-alert/20 text-alert transition-colors hover:bg-alert/5 disabled:opacity-40" aria-label={`Revoke ${key.label}`}><Trash2 size={16}/></button></li>)}</ul>}</div>
        </div>
      </section>
    </div>}
  </div>;
}

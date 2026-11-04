"use client";

import Link from "next/link";
import { ArrowRight, Check, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { onboardWithNearWallet } from "@/lib/near/auth";
import { getNativeNearBalance } from "@/lib/near/tokens";

export default function OnboardingPage() {
  const router = useRouter();
  const { accountId, wallet, connect, connecting } = useNearWallet();
  const [displayName, setDisplayName] = useState("");
  const [payoutAccountId, setPayoutAccountId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = async () => {
    setError(null);
    try {
      const id = await connect();
      setPayoutAccountId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect wallet.");
    }
  };

  const createAccount = async () => {
    if (!wallet || !accountId) return setError("Connect a NEAR wallet first.");
    if (!displayName.trim()) return setError("Enter your business name.");
    if (!payoutAccountId.trim()) return setError("Enter a NEAR payout account.");
    setBusy(true);
    setError(null);
    try {
      // NEAR RPC's account query validates protocol account IDs and confirms the payout account
      // exists before it is signed into the merchant profile; no Ethereum-style address regex.
      await getNativeNearBalance(payoutAccountId.trim());
      await onboardWithNearWallet({
        wallet,
        accountId,
        payoutAccountId: payoutAccountId.trim(),
        displayName: displayName.trim(),
        webhookUrl: webhookUrl.trim() || undefined,
      });
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create merchant account.");
    } finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-paper px-5 py-9 text-ink sm:py-14"><div className="mx-auto w-full max-w-[760px]"><header className="mb-10 flex items-center justify-between"><BrandMark/><Link href="/login" className="text-xs text-mist hover:text-ink">Already registered? Sign in</Link></header><div className="mb-7"><p className="font-mono text-[9px] uppercase tracking-[.15em] text-mist">Merchant onboarding · NEAR</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Your business, <em className="font-serif font-normal italic text-green-deep">your wallet.</em></h1><p className="mt-3 max-w-[550px] text-sm leading-6 text-ink/65">Connect a wallet to prove account ownership. Choose the account that will receive merchant payouts separately.</p></div>
    <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_12px_45px_rgba(11,15,14,.06)] sm:p-8"><div className="mb-7 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-ink text-signal"><WalletCards size={18}/></span><div><h2 className="text-sm font-semibold">Merchant identity</h2><p className="text-[10px] text-mist">Sign in with the wallet you control</p></div></div>
      {!accountId?<button onClick={()=>void connectWallet()} disabled={connecting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-paper text-sm font-medium transition hover:border-green-deep disabled:opacity-50">{connecting?<LoaderCircle className="animate-spin" size={16}/>:<WalletCards size={16}/>} {connecting?"Connecting…":"Connect NEAR wallet"}</button>:<div className="rounded-xl border border-green-deep/20 bg-green-deep/5 p-4"><p className="text-[9px] font-mono uppercase tracking-wider text-green-deep">Connected identity account</p><p className="mt-2 break-all font-mono text-xs">{accountId}</p></div>}
      <div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-xs font-medium">Business name<input className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-green-deep focus:ring-2 focus:ring-green-deep/15" maxLength={100} value={displayName} onChange={(event)=>setDisplayName(event.target.value)} placeholder="Ada Studio"/></label><label className="text-xs font-medium">Payout NEAR account<input className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-xs outline-none focus:border-green-deep focus:ring-2 focus:ring-green-deep/15" value={payoutAccountId} onChange={(event)=>setPayoutAccountId(event.target.value)} placeholder="your-business.near"/><span className="mt-2 block text-[10px] font-normal leading-4 text-mist">This is where merchant funds settle. It can differ from your login account.</span></label><label className="text-xs font-medium sm:col-span-2">Webhook URL <span className="font-normal text-mist">(optional)</span><input className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-green-deep focus:ring-2 focus:ring-green-deep/15" inputMode="url" value={webhookUrl} onChange={(event)=>setWebhookUrl(event.target.value)} placeholder="https://your-store.example/webhooks/worldz"/></label></div>
      <div className="mt-6 flex items-start gap-2 rounded-xl bg-paper p-3 text-[10px] leading-5 text-mist"><Check size={14} className="mt-0.5 shrink-0 text-green-deep"/>Payout destination is displayed separately and submitted with your signed, single-use onboarding proof.</div>
      {error&&<p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs text-alert">{error}</p>}
      <button onClick={()=>void createAccount()} disabled={busy||!accountId} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{busy?<LoaderCircle size={17} className="animate-spin"/>:<ShieldCheck size={17} className="text-signal"/>}{busy?"Sign in with your wallet…":"Create merchant account"}<ArrowRight size={15}/></button>
    </section></div></main>;
}

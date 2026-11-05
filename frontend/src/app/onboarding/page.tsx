"use client";

import Link from "next/link";
import { NearLogo } from "@/components/atoms/near-logo";
import { ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/organisms/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    if (!(payoutAccountId || accountId).trim()) return setError("Enter a NEAR payout account.");
    setBusy(true);
    setError(null);
    try {
      // NEAR RPC's account query validates protocol account IDs and confirms the payout account
      // exists before it is signed into the merchant profile; no Ethereum-style address regex.
      await getNativeNearBalance((payoutAccountId || accountId).trim());
      await onboardWithNearWallet({
        wallet,
        accountId,
        payoutAccountId: (payoutAccountId || accountId).trim(),
        displayName: displayName.trim(),
        webhookUrl: webhookUrl.trim() || undefined,
      });
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create merchant account.");
    } finally { setBusy(false); }
  };

  return <AuthLayout signup>
    <div className="mb-5 flex gap-1 border-b border-line"><Link href="/login" className="px-4 pb-3 text-sm text-mist hover:text-ink">Sign in</Link><span className="border-b-2 border-ink px-4 pb-3 text-sm font-medium text-ink">Create account</span></div>
    <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Create your workspace.</h1><p className="mt-3 text-sm leading-6 text-mist">Set up your workspace and start getting paid directly to your wallet.</p>
    <form className="mt-5 space-y-3" onSubmit={(event)=>{event.preventDefault();void createAccount();}}>
      <div><p className="mb-2 text-sm font-medium">Your wallet</p>{accountId?<div className="flex items-center gap-3 rounded-lg border border-green-deep/20 bg-signal/10 p-3 text-sm"><Check size={17} className="shrink-0 text-green-deep"/><span className="min-w-0 flex-1 truncate">{accountId}</span><span className="text-xs text-green-deep">Connected</span></div>:<Button type="button" variant="outline" onClick={()=>void connectWallet()} disabled={connecting} className="h-[46px] w-full rounded-[12px] bg-white">{connecting?<LoaderCircle size={16} className="animate-spin"/>:<NearLogo className="size-4"/>} {connecting?"Connecting…":"Connect NEAR wallet"}</Button>}</div>
      <label className="block text-sm font-medium" htmlFor="business-name">Business name<Input id="business-name" className="mt-2 h-11 bg-white" required maxLength={100} autoComplete="organization" value={displayName} onChange={(event)=>setDisplayName(event.target.value)} placeholder="e.g. Ada Studio"/></label>
      <label className="block text-sm font-medium" htmlFor="payout-account">Payout account<Input id="payout-account" className="mt-2 h-11 bg-white" required value={payoutAccountId||accountId||""} onChange={(event)=>setPayoutAccountId(event.target.value)} placeholder="your-business.near"/><span className="mt-2 block text-xs font-normal leading-5 text-mist">Where your payments arrive. You can use a different account from your login wallet.</span></label>
      <details className="rounded-lg border border-line px-4 py-3"><summary className="cursor-pointer text-xs font-medium text-mist">Developer options <span className="font-normal">(optional)</span></summary><label className="mt-4 block text-xs font-medium" htmlFor="webhook">Webhook URL<Input id="webhook" type="url" className="mt-2 h-10 bg-white" value={webhookUrl} onChange={(event)=>setWebhookUrl(event.target.value)} placeholder="https://your-store.com/webhooks/worldz"/></label></details>
      {error&&<p role="alert" className="rounded-lg border border-alert/20 bg-alert/5 p-3 text-sm text-alert">{error}</p>}
      <Button type="submit" disabled={busy||!accountId} className="h-[46px] w-full rounded-full">{busy?<LoaderCircle size={17} className="animate-spin"/>:<ShieldCheck size={17}/>} {busy?"Approve in your wallet…":"Create your workspace"}<ArrowRight size={16} className="ml-auto"/></Button>
    </form>
    <p className="mt-4 text-xs leading-5 text-mist">Your wallet verifies your identity. By creating an account, you agree to our <Link href="/terms" className="text-ink underline underline-offset-4">Terms & privacy notice</Link>.</p>
  </AuthLayout>;
}

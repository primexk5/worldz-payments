"use client";

import Link from "next/link";
import { NearLogo } from "@/components/atoms/near-logo";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/organisms/auth-layout";

import { Button } from "@/components/ui/button";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { signInWithNearWallet } from "@/lib/near/auth";
import { nearApi } from "@/lib/near/api";


export function LoginPanel({nextPath="/dashboard"}:{nextPath?:string}) {
  const router=useRouter();
  const {accountId,wallet,connect,connecting}=useNearWallet();
  const [returnPath]=useState(()=>{
    if(typeof window==="undefined")return nextPath;
    const requested=new URLSearchParams(window.location.search).get("next");
    return requested?.startsWith("/")&&!requested.startsWith("//")?requested:nextPath;
  });
  const [signing,setSigning]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{let active=true;void nearApi.me().then(()=>{if(active)router.replace(returnPath);}).catch(()=>{});return()=>{active=false;};},[router,returnPath]);

  const connectWallet=async()=>{setError(null);try{await connect();}catch(cause){setError(cause instanceof Error?cause.message:"Wallet connection failed.");}};
  const signIn=async()=>{if(!wallet||!accountId)return;setSigning(true);setError(null);try{await signInWithNearWallet(wallet,accountId);router.replace(returnPath);}catch(cause){setError(cause instanceof Error?cause.message:"NEP-413 sign-in failed.");}finally{setSigning(false);}};

  return <AuthLayout>
    <div className="mb-5 flex items-center gap-1 border-b border-line"><span className="border-b-2 border-ink px-4 pb-3 text-sm font-medium text-ink">Sign in</span><Link href="/onboarding" className="px-4 pb-3 text-sm text-mist hover:text-ink">Create account</Link></div>
    <span className="mb-6 grid size-12 place-items-center rounded-xl border border-line bg-white/60 text-ink"><WalletCards size={23}/></span>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back.</h1><p className="mt-3 text-sm leading-6 text-mist">Sign in to manage your payments, links and receipts.</p>
    <div className="mt-6 rounded-xl border border-line bg-paper/60 p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border border-line bg-white"><NearLogo className="size-4"/></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">NEAR wallet</p><p className="mt-1 truncate text-xs text-mist">{accountId ?? "Connect your wallet to continue"}</p></div>{accountId&&<Check size={17} className="text-green-deep"/>}</div></div>
    {error&&<p role="alert" className="mt-4 flex gap-2 rounded-lg border border-alert/20 bg-alert/5 p-3 text-sm text-alert"><CircleAlert size={17} className="shrink-0"/>{error}</p>}
    <Button onClick={()=>void (accountId?signIn():connectWallet())} disabled={signing||connecting} className="mt-5 h-[46px] w-full gap-2 rounded-[12px] text-sm shadow-sm">{signing||connecting?<LoaderCircle size={17} className="animate-spin"/>:<NearLogo className="size-4"/>} {signing?"Approve sign-in in your wallet":connecting?"Connecting wallet…":accountId?"Sign in with NEAR":"Connect NEAR wallet"}{!signing&&!connecting&&<ArrowRight size={16} className="ml-auto"/>}</Button>
    <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-line"/><span className="text-xs text-mist">Secure by design</span><div className="h-px flex-1 bg-line"/></div>
    <p className="flex gap-3 text-xs leading-6 text-mist"><ShieldCheck size={18} className="mt-1 shrink-0 text-ink"/>Approve a one-time message to verify wallet ownership. No password to remember and no transaction to send.</p>
    <p className="mt-5 text-xs leading-5 text-mist">By continuing, you agree to our <Link href="/terms" className="font-medium text-ink underline underline-offset-4">Terms of service</Link> and acknowledge our <Link href="/privacy" className="text-ink underline underline-offset-4">Privacy notice</Link>.</p>
  </AuthLayout>;
}

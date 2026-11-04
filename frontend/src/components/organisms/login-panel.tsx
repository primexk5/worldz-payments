"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { Button } from "@/components/ui/button";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { signInWithNearWallet } from "@/lib/near/auth";
import { nearApi } from "@/lib/near/api";
import { NEAR_NETWORK_ID } from "@/lib/near/config";

function ActivityPreview() {
  return <div className="relative min-h-[410px] overflow-hidden rounded-[22px] bg-vault p-5 text-paper sm:min-h-[480px] sm:p-7 lg:min-h-full lg:rounded-l-none lg:rounded-r-[27px] lg:p-9">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(18,224,138,.15),transparent_30%),radial-gradient(circle,rgba(242,239,230,.28)_1px,transparent_1.4px)] bg-[length:auto,9px_9px] opacity-80" />
    <div className="relative z-10 flex items-center justify-between"><div><MonoLabel className="text-paper/60">WorldzPayments · {NEAR_NETWORK_ID}</MonoLabel><h2 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-[-.055em] sm:text-4xl">Payments move.<br/>Your keys <em className="font-serif font-normal italic text-signal">stay yours.</em></h2></div><span className="rounded-full border border-signal/25 bg-ink/20 px-3 py-1.5 font-mono text-[8px] uppercase tracking-wider text-signal">Preview</span></div>
    <div className="relative mx-auto mt-8 max-w-[480px] rounded-2xl border border-paper/15 bg-paper/95 p-4 text-ink shadow-2xl shadow-ink/20 sm:mt-10 sm:p-5">
      <div className="flex items-center justify-between border-b border-line/70 pb-3"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-ink text-signal"><WalletCards size={14}/></span><div><p className="text-[10px] font-semibold">Merchant activity</p><p className="font-mono text-[7px] uppercase tracking-wider text-mist">NEAR testnet preview</p></div></div><span className="flex items-center gap-1.5 text-[8px] text-green-deep"><i className="size-1.5 rounded-full bg-signal"/>Live status</span></div>
      <div className="py-4"><MonoLabel className="text-[8px]">Total received · sample</MonoLabel><div className="mt-1 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight">12,846.20</strong><span className="font-mono text-[10px] text-mist">NEAR</span></div><svg className="mt-2 h-11 w-full" viewBox="0 0 380 44" preserveAspectRatio="none" aria-hidden="true"><path d="M0 35 C26 34 31 30 56 31 S82 13 111 22 S151 31 176 19 S209 26 237 14 S269 23 294 11 S332 20 355 7 S371 12 380 3" fill="none" stroke="#0bb06b" strokeWidth="2"/><path d="M0 35 C26 34 31 30 56 31 S82 13 111 22 S151 31 176 19 S209 26 237 14 S269 23 294 11 S332 20 355 7 S371 12 380 3 L380 44 L0 44Z" fill="url(#login-chart-fill)" opacity=".11"/><defs><linearGradient id="login-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#0bb06b"/><stop offset="1" stopColor="#0bb06b" stopOpacity="0"/></linearGradient></defs></svg></div>
      <div className="space-y-2">{[["Payment settled","Order 4821","25.00 NEAR","SETTLED"],["New payment","Order 4820","80.00 NEAR","PROCESSING"]].map(([title,order,amount,status])=><div key={order} className="flex items-center gap-3 rounded-xl border border-line/70 bg-white px-3 py-2.5"><span className={`grid size-7 shrink-0 place-items-center rounded-full ${status==="SETTLED"?"bg-green-deep/10 text-green-deep":"bg-amber-500/10 text-amber-700"}`}>{status==="SETTLED"?<Check size={13}/>:<LoaderCircle size={13} className="animate-spin"/>}</span><div className="min-w-0 flex-1"><p className="text-[9px] font-medium">{title}</p><p className="mt-0.5 font-mono text-[7px] text-mist">{order} · ASYNC RECEIPTS</p></div><div className="text-right"><p className="font-mono text-[8px] font-medium">{amount}</p><p className={`mt-0.5 font-mono text-[6px] tracking-wider ${status==="SETTLED"?"text-green-deep":"text-amber-700"}`}>{status}</p></div></div>)}</div>
    </div>
    <div className="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-3 text-[9px] text-paper/65"><span className="inline-flex items-center gap-2"><LockKeyhole size={13} className="text-signal"/>Wallet keys stay with you</span><span className="font-mono uppercase tracking-wider">Order-scoped · verifiable</span></div>
  </div>;
}

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

  return <main className="grid min-h-screen place-items-center bg-[#e8e6df] p-3 text-ink sm:p-6 lg:p-10"><div className="grid min-h-[min(850px,calc(100vh-48px))] w-full max-w-[1280px] overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-[0_35px_100px_rgba(11,15,14,.15)] lg:grid-cols-2">
    <section className="flex flex-col px-6 py-7 sm:px-10 sm:py-9 lg:px-14 xl:px-[72px]"><div className="flex items-center justify-between"><BrandMark/><Link href="/" className="inline-flex items-center gap-1.5 text-[10px] text-mist transition hover:text-ink lg:hidden"><ArrowRight size={12} className="rotate-180"/>Back</Link></div>
      <div className="mx-auto my-auto w-full max-w-[430px] py-10 lg:py-8"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-signal/15 text-green-deep"><span className="relative grid size-7 grid-cols-3 grid-rows-3 gap-1">{Array.from({length:7},(_,index)=><i key={index} className={`size-1.5 rounded-full bg-green-deep ${[0,1,3,4,5,7,8].includes(index)?"":"opacity-0"}`}/>)}</span></div>
        <div className="text-center"><h1 className="text-3xl font-semibold tracking-[-.055em] sm:text-[34px]">Welcome back</h1><p className="mt-2 text-xs leading-5 text-mist">Your merchant workspace, secured by your NEAR wallet.</p></div>
        <div className="mt-7 grid grid-cols-2 rounded-full bg-paper p-1"><span className="flex h-9 items-center justify-center rounded-full bg-white text-[10px] font-medium shadow-sm"><Check size={13} className="mr-2 text-green-deep"/>Sign in</span><Link href="/onboarding" className="flex h-9 items-center justify-center rounded-full text-[10px] text-mist transition hover:text-ink">Create account <ArrowRight size={12} className="ml-1.5"/></Link></div>
        <div className="mt-6"><p className="mb-2 text-[10px] font-medium">NEAR account</p>{accountId?<div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-green-deep/50 bg-white px-3 shadow-[0_0_0_2px_rgba(11,176,107,.08)]"><span className="truncate font-mono text-[10px]">{accountId}</span><Check size={15} className="shrink-0 text-green-deep"/></div>:<button onClick={()=>void connectWallet()} disabled={connecting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-xs transition hover:border-green-deep disabled:opacity-50">{connecting?<LoaderCircle size={15} className="animate-spin"/>:<WalletCards size={15}/>}Connect your NEAR wallet</button>}</div>
        <div className="mt-4 flex items-start gap-2 text-[9px] leading-5 text-mist"><Check size={13} className="mt-0.5 shrink-0 text-green-deep"/><span>Sign in with a wallet that owns your merchant account. A one-time NEP-413 challenge verifies ownership without sending a transaction.</span></div>
        {error&&<p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-[10px] leading-5 text-alert"><CircleAlert size={13} className="mt-0.5 shrink-0"/>{error}</p>}
        {accountId&&<Button onClick={()=>void signIn()} disabled={signing} className="mt-5 h-12 w-full gap-2 rounded-xl bg-green-deep text-sm font-medium text-white shadow-[0_5px_14px_rgba(11,176,107,.18)] hover:bg-vault disabled:opacity-50">{signing?<LoaderCircle size={16} className="animate-spin"/>:<ShieldCheck size={16}/>} {signing?"Approve sign-in in wallet":"Sign in with NEAR"} {!signing&&<ArrowRight size={15}/>}</Button>}
        <p className="mt-6 text-center text-[9px] text-mist">By continuing, you agree to our <Link href="/terms" className="text-green-deep hover:underline">Terms</Link> and <Link href="/terms" className="text-green-deep hover:underline">Privacy notice</Link>.</p>
      </div>
      <div className="flex items-center justify-between text-[8px] text-mist"><span>© 2026 WorldzPayments</span><Link href="/docs" className="hover:text-ink">Need help?</Link></div>
    </section>
    <div className="hidden p-2 lg:block"><ActivityPreview/></div>
    <div className="lg:hidden"><ActivityPreview/></div>
  </div></main>;
}

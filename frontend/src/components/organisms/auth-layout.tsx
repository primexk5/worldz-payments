import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, Globe2, ShieldCheck, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { NearLogo } from "@/components/atoms/near-logo";
import { BrandMark } from "@/components/atoms/brand-mark";
import { NEAR_NETWORK_ID } from "@/lib/near/config";

export function AuthLayout({ children, signup = false }: { children: ReactNode; signup?: boolean }) {
  return <main className="auth-page workspace-theme grid h-svh grid-rows-[minmax(0,1fr)] overflow-hidden bg-paper text-ink lg:grid-cols-[1fr_1fr]">
    <section className="auth-section flex h-full min-h-0 flex-col px-6 py-5 sm:px-12 lg:px-16 xl:px-24">
      <header className="flex items-center justify-between gap-4"><BrandMark/><Link href="/" className="text-xs text-mist hover:text-ink">Back to website <span aria-hidden>↗</span></Link></header>
      <div className="auth-content mx-auto flex w-full min-h-0 max-w-[420px] flex-1 flex-col justify-center py-6">{children}</div>
      <footer className="flex justify-between gap-4 text-xs text-mist"><span>© 2026 WorldzPayments</span><Link href="/docs" className="hover:text-ink">Help & documentation</Link></footer>
    </section>
    <aside className="relative hidden min-h-0 overflow-hidden border-l border-line bg-paper p-12 lg:flex lg:flex-col lg:justify-center xl:p-20">
      <div aria-hidden className="absolute -right-44 -top-44 size-[580px] rounded-full border border-ink/5 shadow-[0_0_0_70px_#0b0f0e03,0_0_0_140px_#0b0f0e03]"/>
      <div className="relative mx-auto w-full max-w-lg"><span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1.5 font-mono text-[11px] font-medium text-ink"><NearLogo className="size-3.5"/>Built on NEAR · {NEAR_NETWORK_ID}</span>
        <h2 className="mt-7 text-5xl font-semibold leading-[1.12] tracking-[-.05em] xl:text-6xl">Get paid.<br/>Keep your <em className="font-serif font-normal italic text-green-deep">keys.</em></h2>
        <p className="mt-5 max-w-sm text-sm leading-7 text-ink/55">Checkout, payment links and invoices. Every payment settles straight to your wallet. Keys stay yours.</p>
        <div className="auth-preview mt-8 rounded-[26px] border border-line bg-white/80 p-6 shadow-[0_20px_60px_-25px_#0b0f0e25]">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-medium"><span className="grid size-8 place-items-center rounded-lg bg-signal/10 text-green-deep"><Wallet size={16}/></span>Your wallet, at a glance</div><span className="text-[10px] text-mist">ILLUSTRATION</span></div>
          <div className="mt-7 flex items-end justify-between"><div><p className="text-xs text-mist">Payments received</p><p className="mt-2 font-mono text-3xl font-semibold tracking-tight">1,280.00 <span className="text-sm font-normal text-mist">NEAR</span></p></div><span className="rounded-full bg-signal/10 px-2 py-1 text-xs text-green-deep"><ArrowUpRight size={14} className="inline"/> 12.8%</span></div>
          <div className="mt-6 flex h-24 items-end gap-2" aria-hidden>{[24,36,29,52,44,58,45,67,56,80,72,94,83,100].map((height,i)=><div key={i} className={`flex-1 rounded-t ${i>10?"bg-green-deep":"bg-green-deep/15"}`} style={{height:`${height}%`}}/>)}</div>
          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4"><span className="grid size-9 place-items-center rounded-full bg-signal/10 text-green-deep"><ArrowDownLeft size={17}/></span><div className="flex-1"><p className="text-xs font-medium">Payment received</p><p className="mt-1 text-[11px] text-mist">Directly to your wallet</p></div><span className="rounded-full bg-signal/10 px-2 py-1 text-[11px] text-green-deep"><Check size={12} className="mr-1 inline"/>Settled</span></div>
        </div>
        <div className="auth-features mt-8 grid grid-cols-2 gap-5"><div><ShieldCheck size={19} className="text-ink"/><p className="mt-2 text-xs font-medium">Your keys stay yours</p><p className="mt-1 text-xs leading-5 text-mist">Wallet-based, non-custodial access.</p></div><div><Globe2 size={19} className="text-ink"/><p className="mt-2 text-xs font-medium">Open and verifiable</p><p className="mt-1 text-xs leading-5 text-mist">{signup?"Create a link. Get paid to your wallet.":"Check every settled payment on-chain."}</p></div></div>
      </div>
    </aside>
  </main>;
}

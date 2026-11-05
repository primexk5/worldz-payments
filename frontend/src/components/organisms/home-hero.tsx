import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { NearLogo } from "@/components/atoms/near-logo";
import { MonoLabel } from "@/components/atoms/mono-label";
import { PrimaryAction, SecondaryAction } from "@/components/molecules/actions";
import { AnimatedGlobe } from "@/components/organisms/animated-globe";

function BalanceCard() {
  return <div className="absolute right-0 top-[2%] z-10 w-[158px] rounded-[20px] border border-line/70 bg-white/90 p-4 shadow-[0_12px_40px_-20px_#0b0f0e35] backdrop-blur-sm sm:right-[1%] sm:w-[205px] sm:p-5"><MonoLabel className="text-[8px] tracking-[.08em]">Total received · preview</MonoLabel><p className="mt-2 font-mono text-xl font-medium tracking-tight sm:text-[26px]">12,846.20</p><span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-mist"><NearLogo className="size-3"/>NEAR</span><svg viewBox="0 0 160 36" className="my-3 h-8 w-full" aria-hidden="true"><path d="M0 30C18 27 20 29 36 24S58 26 78 17S102 21 121 11S145 10 160 3" fill="none" stroke="#0bb06b" strokeWidth="1.5"/></svg><div className="flex gap-1.5 font-mono text-[8px]"><span className="rounded border border-line px-1.5 py-1">NEAR</span><span className="rounded border border-line px-1.5 py-1">NEP-141</span></div></div>;
}
function PaymentCard() {
  return <div className="absolute left-0 top-[45%] z-20 w-[195px] rounded-[20px] border border-line/70 bg-white/95 p-4 shadow-[0_12px_40px_-20px_#0b0f0e35] backdrop-blur-sm sm:left-[1%] sm:w-[245px] sm:p-5"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-green-deep text-white"><Check size={13}/></span><div><p className="text-[11px] font-medium">Payment settled</p><p className="mt-1 font-mono text-[8px] text-mist">ORDER 4821 · VERIFIED</p></div></div><div className="mt-4 flex items-end justify-between gap-3"><p className="font-mono text-lg font-medium sm:text-xl">25.00 <span className="text-[10px]">NEAR</span></p><span className="pb-1 font-mono text-[9px] text-green-deep">To your wallet</span></div></div>;
}
function NetworkCard() {
  return <div className="absolute bottom-[8%] right-0 z-10 w-[164px] rounded-[20px] border border-line/70 bg-white/90 p-4 shadow-[0_12px_40px_-20px_#0b0f0e35] backdrop-blur-sm sm:right-0 sm:w-[205px] sm:p-5"><MonoLabel className="text-[8px] tracking-[.08em]">Settlement network</MonoLabel><p className="mt-3 flex items-center gap-2.5 text-lg font-medium"><NearLogo className="size-6"/>NEAR</p><p className="mt-3 flex items-center gap-1.5 text-[9px] text-mist"><LockKeyhole size={11}/>Your keys stay yours</p></div>;
}

export function HomeHero() {
  return <section className="relative isolate overflow-hidden border-b border-line bg-paper">
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(11,15,14,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(11,15,14,.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_right,black,transparent)]"/>
    <div className="site-container relative grid items-center gap-6 pb-10 pt-10 sm:pb-14 sm:pt-14 lg:min-h-[660px] lg:grid-cols-[1fr_1.12fr] lg:gap-0 lg:py-14 xl:min-h-[710px]">
      <div className="relative z-20 max-w-[590px] lg:pb-8"><a href="https://near.org" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/65 py-1.5 pl-1.5 pr-3 text-[10px] text-ink/65"><span className="grid size-5 place-items-center rounded-full bg-ink text-paper"><NearLogo className="size-2.5"/></span>Non-custodial payments, built on NEAR</a>
        <h1 className="my-6 text-[clamp(3rem,4.65vw,4.5rem)] font-semibold leading-[1.02] tracking-[-.065em]"><span className="xl:whitespace-nowrap">Money that moves</span><br className="hidden xl:block"/> at the <em className="font-serif font-normal italic text-green-deep">speed</em> of<br className="hidden xl:block"/> your business.</h1>
        <p className="max-w-[390px] text-[15px] leading-7 text-ink/65">Checkout, payment links and verified receipts. One workspace for your business. Every settled payment goes straight to your wallet.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3"><PrimaryAction>Open an account</PrimaryAction><SecondaryAction href="/checkout/demo">Explore checkout</SecondaryAction></div>
        <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[.08em] text-mist"><span className="flex items-center gap-1.5"><ShieldCheck size={12}/>Keys stay yours</span><span>Verifiable on-chain</span><span>Built for NEAR</span></div>
      </div>
      <div className="relative mx-auto h-[360px] w-full max-w-[590px] sm:h-[490px] lg:ml-0 lg:h-[560px] xl:h-[590px]" role="img" aria-label="Animated dotted globe with sample NEAR payment and settlement activity">
        <div className="absolute -inset-x-7 -bottom-10 -top-2 sm:-inset-x-10 sm:-bottom-20 sm:top-0 lg:-bottom-32 lg:-left-10 lg:-right-40 lg:top-0"><AnimatedGlobe/></div>
        <BalanceCard/><PaymentCard/><NetworkCard/>
        <div className="pointer-events-none absolute inset-x-[-100px] -bottom-24 h-32 bg-gradient-to-t from-paper via-paper/80 to-transparent"/>
      </div>
    </div>
    <div className="site-container relative z-20 flex flex-col justify-between gap-4 border-t border-line/60 py-5 sm:flex-row sm:items-center"><MonoLabel className="text-[9px]">From customer to your wallet</MonoLabel><Link href="/#how-it-works" className="inline-flex items-center gap-2 text-xs text-ink/65 hover:text-ink">One direct route. See how it works<ArrowRight size={13}/></Link></div>
  </section>;
}

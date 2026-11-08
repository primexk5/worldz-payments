import Link from "next/link";
import { ArrowDownLeft, ArrowRight, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { NearLogo } from "@/components/atoms/near-logo";
import { MonoLabel } from "@/components/atoms/mono-label";
import { PrimaryAction, SecondaryAction } from "@/components/molecules/actions";
import { AnimatedGlobe } from "@/components/organisms/animated-globe";

function BalanceCard() {
  return <div className="hero-globe-card absolute right-0 top-[2%] z-10 w-[176px] rounded-[20px] border border-white bg-[#fffefa]/95 p-4 shadow-[0_16px_48px_-20px_#0b0f0e30,0_0_0_1px_#0b0f0e08] backdrop-blur-md sm:right-[1%] sm:w-[218px] sm:p-5">
    <div className="flex items-center justify-between gap-2"><span className="whitespace-nowrap font-mono text-[8px] uppercase tracking-[.12em] text-ink/45">Total received</span><span className="rounded-full bg-paper px-2 py-1 text-[8px] text-ink/45">Preview</span></div>
    <p className="mt-3 font-mono text-[23px] font-medium tracking-[-.06em] sm:text-[29px]">12,846.20</p>
    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink/45"><NearLogo className="size-3"/>NEAR</div>
    <svg viewBox="0 0 180 48" className="mt-2 h-7 w-full sm:mt-4 sm:h-10" aria-hidden="true"><defs><linearGradient id="hero-balance-area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#0bb06b" stopOpacity=".14"/><stop offset="1" stopColor="#0bb06b" stopOpacity="0"/></linearGradient></defs><path d="M0 38C17 37 22 32 36 33S57 34 72 25S92 27 108 19S131 23 145 12S165 13 180 4V48H0Z" fill="url(#hero-balance-area)"/><path d="M0 38C17 37 22 32 36 33S57 34 72 25S92 27 108 19S131 23 145 12S165 13 180 4" fill="none" stroke="#0bb06b" strokeWidth="1.5"/></svg>
    <div className="mt-2 hidden items-center justify-between border-t border-line/50 pt-3 text-[8px] text-ink/40 sm:flex"><span>Illustrative activity</span><span className="font-mono">NEAR / NEP-141</span></div>
  </div>;
}
function PaymentCard() {
  return <div className="hero-globe-card hero-globe-card-payment absolute left-0 top-[47%] z-20 w-[176px] sm:top-[43%] rounded-[20px] border border-white bg-[#fffefa]/95 p-4 shadow-[0_16px_48px_-20px_#0b0f0e30,0_0_0_1px_#0b0f0e08] backdrop-blur-md sm:left-[1%] sm:w-[256px] sm:p-5">
    <div className="flex items-center justify-between gap-2"><span className="grid size-8 place-items-center rounded-full bg-green-deep/10 text-green-deep"><ArrowDownLeft size={17}/></span><span className="flex items-center gap-1 rounded-full bg-green-deep/10 px-2 py-1 text-[8px] font-medium text-vault"><Check size={10}/>Verified</span></div>
    <p className="mt-2 text-[10px] text-ink/50 sm:mt-3">Payment settled</p><p className="mt-1 font-mono text-[27px] font-medium tracking-[-.06em]">25.00 <span className="text-[11px] font-normal tracking-normal text-ink/50">NEAR</span></p>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/50 pt-3"><span className="flex items-center gap-1.5 text-[9px] text-ink/65"><span className="size-1 rounded-full bg-green-deep"/>To your wallet</span><span className="hidden font-mono text-[8px] text-ink/35 sm:inline">EXAMPLE / 4821</span></div>
  </div>;
}
function NetworkCard() {
  return <div className="hero-globe-card hero-globe-card-network absolute hidden sm:block bottom-[6%] right-0 z-10 w-[170px] rounded-[20px] border border-white bg-[#fffefa]/95 p-4 shadow-[0_16px_48px_-20px_#0b0f0e30,0_0_0_1px_#0b0f0e08] backdrop-blur-md sm:w-[214px] sm:p-5">
    <div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white"><NearLogo className="size-4"/></span><div><p className="font-mono text-[8px] uppercase tracking-[.1em] text-ink/40">Settlement network</p><p className="mt-1 text-sm font-semibold tracking-tight">Built on NEAR</p></div></div>
    <p className="mt-4 flex items-center gap-1.5 border-t border-line/50 pt-3 text-[9px] text-ink/45"><LockKeyhole size={10}/>Your keys. Your control.</p>
  </div>;
}

export function HomeHero() {
  return <section className="relative isolate overflow-hidden border-b border-line bg-paper">
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(11,15,14,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(11,15,14,.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_right,black,transparent)]"/>
    <div className="site-container relative grid items-center gap-6 pb-10 pt-10 sm:pb-14 sm:pt-14 lg:min-h-[660px] lg:grid-cols-[1fr_1.12fr] lg:gap-0 lg:py-14 xl:min-h-[710px]">
      <div className="relative z-20 max-w-[590px] lg:pb-8"><a href="https://near.org" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/65 py-1.5 pl-1.5 pr-3 text-[10px] text-ink/65"><span className="grid size-5 place-items-center rounded-full bg-ink text-paper"><NearLogo className="size-2.5"/></span>Non-custodial payments, built on NEAR</a>
        <h1 className="my-6 text-[clamp(2.5rem,10.5vw,3.25rem)] sm:text-[clamp(3rem,4.65vw,4.5rem)] font-semibold leading-[1.02] tracking-[-.065em]"><span className="xl:whitespace-nowrap">Money that moves</span><br className="hidden xl:block"/> at the <em className="font-serif font-normal italic text-green-deep">speed</em> of<br className="hidden xl:block"/> your business.</h1>
        <p className="max-w-[390px] text-[15px] leading-7 text-ink/65">For your Shopify store, your next payment link or the product you’re building. Accept NEAR payments in one workspace, with verified settlement to your wallet.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3"><PrimaryAction>Open an account</PrimaryAction><SecondaryAction href="/checkout/demo">Watch the demo</SecondaryAction></div>
        <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[.08em] text-mist"><span className="flex items-center gap-1.5"><ShieldCheck size={12}/>Keys stay yours</span><span>Verifiable on-chain</span><span>Built for NEAR</span></div>
      </div>
      <div className="relative mx-auto h-[400px] w-full max-w-[590px] sm:h-[490px] lg:ml-0 lg:h-[560px] xl:h-[590px]" role="img" aria-label="Animated dotted globe with sample NEAR payment and settlement activity">
        <div className="absolute inset-x-0 bottom-10 top-0 sm:bottom-0"><AnimatedGlobe/></div>
        <BalanceCard/><PaymentCard/><NetworkCard/>
        <div className="absolute inset-x-0 bottom-0 flex justify-center sm:hidden"><div className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-paper/90 px-4 py-2.5 text-[10px] text-ink/60"><NearLogo className="size-3"/><span>Built on NEAR</span><span className="mx-1 h-3 border-l border-line"/><LockKeyhole size={11}/><span>Your keys stay yours</span></div></div>
        <div className="pointer-events-none absolute inset-x-[-100px] -bottom-24 h-32 bg-gradient-to-t from-paper via-paper/80 to-transparent"/>
      </div>
    </div>
    <div className="site-container relative z-20 flex flex-col justify-between gap-4 border-t border-line/60 py-5 sm:flex-row sm:items-center"><MonoLabel className="text-[9px]">From customer to your wallet</MonoLabel><Link href="/#how-it-works" className="inline-flex items-center gap-2 text-xs text-ink/65 hover:text-ink">One direct route. See how it works<ArrowRight size={13}/></Link></div>
  </section>;
}

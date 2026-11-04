import { ArrowRight, Check, Copy, LockKeyhole, Sparkles } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { PrimaryAction, SecondaryAction } from "@/components/molecules/actions";

function BalanceCard() {
  return <div className="absolute right-0 top-3 z-20 w-[205px] animate-pulse rounded-2xl border border-ink/10 bg-white p-4 shadow-xl shadow-ink/10 [animation-duration:6s] sm:right-2 sm:top-4 sm:w-[225px] sm:p-5"><MonoLabel className="text-[8px]">Total received</MonoLabel><strong className="mt-2 block text-[28px] font-semibold tracking-[-.06em] sm:text-[32px]">12,846<span className="text-mist">.20</span> <span className="font-mono text-[10px] tracking-normal">NEAR</span></strong><div className="mt-2 h-8"><svg className="h-full w-full overflow-visible" viewBox="0 0 150 38" preserveAspectRatio="none" aria-hidden="true"><path d="M1 31 C22 28 30 30 45 23 S70 28 85 17 S110 21 122 9 S140 10 149 2" fill="none" stroke="#0bb06b" strokeWidth="2" /></svg></div><div className="mt-2 flex gap-1"><span className="rounded-md border border-line px-2 py-1 text-[8px]">NEAR</span><span className="rounded-md border border-line px-2 py-1 text-[8px]">NEP-141</span></div></div>;
}

function PaymentCard() {
  return <div className="absolute left-0 top-[46%] z-20 w-[205px] animate-pulse rounded-2xl border border-ink/10 bg-white p-4 shadow-xl shadow-ink/10 [animation-duration:7s] sm:left-1 sm:w-[235px] sm:p-5"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-signal text-ink"><Check size={15} /></span><div><strong className="block text-[10px]">Payment settled</strong><MonoLabel className="mt-1 text-[7px] tracking-[.07em]">Order 4821 · async receipt</MonoLabel></div></div><div className="mb-1 ml-9 mt-4 text-[21px] font-semibold tracking-tight">25.00 <span className="text-[10px]">NEAR</span></div><div className="ml-9 flex justify-between text-[8px] text-mist"><span>to your wallet</span><b className="text-green-deep">Verified</b></div></div>;
}

function WalletCard() {
  return <div className="absolute bottom-2 right-0 z-20 w-[205px] rounded-2xl border border-ink/10 bg-white p-4 shadow-xl shadow-ink/10 sm:right-1 sm:w-[225px] sm:p-5"><MonoLabel className="text-[8px]">Unique order address</MonoLabel><div className="my-3 font-mono text-[15px] font-medium sm:text-[17px]">0x91c3...e07d</div><div className="flex items-center gap-2 border-t border-line/60 pt-3 text-[8px] text-mist"><LockKeyhole size={12} className="text-green-deep" /> Yours from the start <Copy size={13} className="ml-auto" /></div></div>;
}

function Globe() {
  return <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
    <div className="absolute aspect-square w-[96%] rounded-full bg-[radial-gradient(circle,rgba(11,15,14,.75)_1px,transparent_1.4px)] bg-[length:7px_7px] [mask-image:radial-gradient(circle,transparent_53%,#000_55%,#000_67%,transparent_69%)] motion-reduce:animate-none animate-spin [animation-duration:44s]" />
    <div className="relative aspect-square w-[88%] overflow-hidden rounded-full border border-ink/15 bg-[radial-gradient(circle_at_35%_28%,#fffef8_0%,#f2efe6_60%,#d5d8cc_100%)] shadow-[inset_-35px_-10px_60px_rgba(7,56,46,.12),inset_16px_12px_36px_rgba(255,255,255,.82)]">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(11,15,14,.8)_1px,transparent_1.35px)] bg-[length:6px_6px] opacity-60 [mask-image:radial-gradient(ellipse_at_center,#000_52%,transparent_72%)] motion-reduce:animate-none animate-spin [animation-duration:80s]" />
      <div className="absolute inset-y-[1%] left-1/4 right-1/4 rounded-[50%] border border-vault/20 motion-reduce:animate-none animate-spin [animation-duration:18s]" />
      <div className="absolute inset-y-[1%] left-[8%] right-[8%] rounded-[50%] border border-vault/15 motion-reduce:animate-none animate-spin [animation-duration:24s] [animation-direction:reverse]" />
      <div className="absolute -left-[5%] right-[-5%] top-[34%] h-[32%] rotate-[-10deg] rounded-[50%] border border-vault/20" />
      <div className="absolute -left-[12%] top-[27%] h-[46%] w-[125%] rotate-[17deg] rounded-[50%] border-t-2 border-green-deep/70 motion-reduce:animate-none animate-pulse [animation-duration:4s]"><i className="absolute right-[10%] top-[-5px] size-[9px] rounded-full bg-signal shadow-[0_0_0_5px_rgba(18,224,138,.15)]" /></div>
      <span className="absolute left-[20%] top-[42%] rounded bg-ink px-2 py-1 font-mono text-[7px] tracking-widest text-paper">BUYER</span><span className="absolute right-[19%] top-[30%] rounded bg-ink px-2 py-1 font-mono text-[7px] tracking-widest text-paper">NEAR</span>
    </div>
    <div className="absolute left-[-3%] top-[21%] h-[58%] w-[107%] rotate-[19deg] rounded-[50%] border-t border-signal/50 motion-reduce:animate-none animate-pulse [animation-duration:6s]" />
  </div>;
}

export function HomeHero() {
  return <section className="relative isolate overflow-hidden bg-paper px-5 pb-5 pt-11 text-ink sm:px-8 sm:pt-12 lg:px-[5vw] lg:pt-10">
    <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(11,15,14,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(11,15,14,.035)_1px,transparent_1px)] bg-[length:48px_48px] [mask-image:linear-gradient(90deg,#000_0%,#000_56%,transparent_100%)]" />
    <div className="mx-auto grid min-h-[560px] w-full max-w-[1320px] items-center gap-2 lg:grid-cols-[.93fr_1fr] lg:gap-6">
      <div className="relative z-10 max-w-[620px] py-4 lg:py-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 py-1.5 pl-1.5 pr-3 text-[10px] text-ink/75 sm:text-[11px]"><span className="grid size-6 place-items-center rounded-full bg-ink text-signal"><Sparkles size={12} /></span>Non-custodial payments on NEAR</div>
        <h1 className="my-6 max-w-[700px] text-[clamp(3.25rem,6.3vw,5.5rem)] font-semibold leading-[.98] tracking-[-.077em]">Money that moves at the <em className="font-serif font-normal italic tracking-[-.065em] text-green-deep">speed</em> of your business.</h1>
        <p className="max-w-[460px] text-[13px] leading-7 text-ink/65 sm:text-sm">Accept crypto with checkout, payment links and invoices. Every payment settles straight to your wallet.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5"><PrimaryAction>Open an account</PrimaryAction><SecondaryAction href="/checkout/demo">Explore checkout</SecondaryAction></div>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[8px] uppercase tracking-[.08em] text-mist"><span className="flex items-center gap-2"><i className="size-1.5 rounded-full bg-signal shadow-[0_0_0_3px_rgba(18,224,138,.14)]" />Built for NEAR</span><span>Keys stay yours</span><span>Verifiable on-chain</span></div>
      </div>
      <div className="relative mx-auto h-[375px] w-full max-w-[570px] sm:h-[470px] lg:h-[520px]">
        <Globe /><BalanceCard /><PaymentCard /><WalletCard />
        <div className="absolute bottom-2 left-[28%] z-30 flex items-center gap-2 sm:bottom-3 sm:left-[31%]"><span className="grid size-7 place-items-center rounded-full bg-ink text-signal"><ArrowRight size={13} /></span><div><MonoLabel className="text-[7px]">Buyer to merchant</MonoLabel><strong className="text-[9px] font-medium">One direct route. No middleman.</strong></div></div>
      </div>
    </div>
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2 border-t border-ink/10 pt-3 sm:flex-row sm:items-center sm:justify-between"><MonoLabel className="text-[7px] sm:text-[8px]">Payments that settle straight to your wallet</MonoLabel><a className="flex items-center gap-2 self-end text-[8px] text-ink/65 hover:text-green-deep sm:self-auto sm:text-[9px]" href="/settlement">See how settlement works <ArrowRight size={13} /></a></div>
  </section>;
}

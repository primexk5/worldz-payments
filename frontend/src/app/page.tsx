import Link from "next/link";
import { ArrowRight, Check, Link2, LockKeyhole, MoveUpRight, ReceiptText } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { PrimaryAction } from "@/components/molecules/actions";
import { HomeHero } from "@/components/organisms/home-hero";

const audiences = ["Social sellers", "Online stores", "Freelancers", "Marketplaces", "Creators", "SaaS"];

function AudienceStrip() {
  return <section className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 border-y border-ink/10 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:gap-10 lg:px-16"><MonoLabel className="shrink-0">Built for</MonoLabel><div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{audiences.map((audience) => <span className="rounded-full border border-ink/20 px-3 py-2.5 text-center text-[10px] text-ink/75 sm:text-[11px]" key={audience}>{audience}</span>)}</div></section>;
}

const features = [
  { number: "01", title: "Your keys. Your funds.", text: "You keep control of your wallet keys. The router may hold order funds briefly while NEAR completes the merchant and fee payout receipts.", icon: LockKeyhole },
  { number: "02", title: "A fresh address for every order.", text: "Each checkout gets a unique address, so incoming payments are matched to the right order automatically.", icon: MoveUpRight },
  { number: "03", title: "Clear proof on-chain.", text: "Follow every payment from sent to settled. Anyone can verify the transaction on-chain.", icon: Check },
];

function FeatureSection() {
  return (
    <section className="mx-auto w-full max-w-[1440px] px-5 py-20 sm:px-8 sm:py-24 lg:px-32" id="settlement">
      <div className="mx-auto mb-10 max-w-xl text-center"><MonoLabel>Money moves differently</MonoLabel><h2 className="my-4 text-[clamp(2.6rem,5vw,3.875rem)] font-semibold leading-tight tracking-[-.065em]">Built for the way you <em className="font-serif font-normal italic text-green-deep">sell.</em></h2><p className="mx-auto max-w-[440px] text-sm leading-6 text-ink/65">One simple flow from customer to your wallet. No detours, no waiting on a middleman.</p></div>
      <div className="mx-auto grid max-w-[1120px] gap-3 md:grid-cols-3">
        {features.map(({ number, title, text, icon: Icon }) => <article className="min-h-[210px] rounded-[20px] border border-line bg-white/60 p-6 transition hover:-translate-y-1 hover:border-[#b7b5a8]" key={number}><div className="flex items-center justify-between"><MonoLabel>{number} / 03</MonoLabel><span className="grid size-[38px] place-items-center rounded-full border border-line text-green-deep"><Icon size={19} /></span></div><h3 className="mb-2 mt-6 text-[17px] font-semibold tracking-tight">{title}</h3><p className="m-0 max-w-[290px] text-xs leading-5 text-ink/65">{text}</p></article>)}
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="grid gap-10 bg-ink px-6 py-16 text-paper sm:px-10 lg:grid-cols-[.9fr_1fr] lg:items-center lg:gap-20 lg:px-[12vw] lg:py-24" id="how-it-works">
      <div><MonoLabel className="text-paper/60">From sale to settled</MonoLabel><h2 className="my-5 text-[clamp(2.8rem,5vw,4rem)] font-semibold leading-tight tracking-[-.065em]">Three steps.<br />Straight to <em className="font-serif font-normal italic text-signal">you.</em></h2><p className="max-w-[440px] text-sm leading-6 text-paper/65">Give every customer a clear way to pay, and keep every payment in your hands.</p></div>
      <ol className="m-0 list-none p-0">{[["Create a checkout","Set an amount, share a payment link or add checkout to your store."],["Your customer pays","A unique address makes every order easy to identify and track."],["It settles to your wallet","See the on-chain confirmation, directly where your funds belong."]].map(([title,description],i)=><li className="flex gap-5 border-b border-paper/15 py-5 first:border-t" key={title}><span className="pt-1 font-mono text-[10px] text-signal">0{i+1}</span><div><h3 className="mb-2 text-[15px] font-medium">{title}</h3><p className="m-0 text-[11px] leading-5 text-paper/60">{description}</p></div></li>)}</ol>
    </section>
  );
}

function AboutSection() {
  return <section id="about" className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 py-16 sm:px-8 md:grid-cols-[.8fr_1.2fr] md:items-end lg:px-32 lg:py-24"><div><MonoLabel>About WorldzPayments</MonoLabel><h2 className="mt-4 text-[clamp(2.7rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-.065em]">Commerce that moves at the <em className="font-serif font-normal italic text-green-deep">speed</em> of NEAR.</h2></div><div className="max-w-[560px]"><p className="text-sm leading-7 text-ink/70">WorldzPayments gives social sellers, online stores and independent businesses a clear way to accept NEAR-native payments.</p><p className="mt-4 text-sm leading-7 text-ink/70">Your wallet keys stay yours. The router accounts for each order while NEAR payout receipts execute asynchronously, and the merchant dashboard only marks an order settled after verification.</p></div></section>;
}

const products = [
  { title: "Checkout", description: "A clear, wallet-signed payment flow with order details and payout status.", href: "/checkout/demo", icon: ArrowRight },
  { title: "Payment links", description: "Create fixed-amount links and share them wherever your customers are.", href: "/onboarding", icon: Link2 },
  { title: "Invoices", description: "Send clients a direct invoice and verify settlement against the order.", href: "/onboarding", icon: ReceiptText },
];

function ProductsSection() {
  return <section id="products" className="bg-[#eae7dc] px-5 py-16 sm:px-8 lg:px-32 lg:py-24"><div className="mx-auto max-w-[1120px]"><div className="mb-9 max-w-xl"><MonoLabel>One merchant toolkit</MonoLabel><h2 className="mt-4 text-[clamp(2.5rem,4.8vw,3.8rem)] font-semibold leading-tight tracking-[-.065em]">The right way to get <em className="font-serif font-normal italic text-green-deep">paid.</em></h2></div><div className="grid gap-3 md:grid-cols-3">{products.map(({title,description,href,icon:Icon})=><Link key={title} href={href} className="group rounded-2xl border border-line bg-white/70 p-5 transition hover:-translate-y-1 hover:bg-white sm:p-6"><span className="grid size-10 place-items-center rounded-xl bg-ink text-signal"><Icon size={18}/></span><h3 className="mt-7 text-base font-semibold">{title}</h3><p className="mt-2 min-h-10 text-[11px] leading-5 text-mist">{description}</p><span className="mt-5 inline-flex items-center gap-2 text-[10px] font-medium text-green-deep">Explore {title.toLowerCase()} <ArrowRight size={13} className="transition group-hover:translate-x-1"/></span></Link>)}</div></div></section>;
}

function DocsSection() {
  return <section id="docs" className="mx-auto grid w-full max-w-[1440px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:gap-16 lg:px-32 lg:py-24"><div><MonoLabel>For builders</MonoLabel><h2 className="my-4 text-[clamp(2.5rem,4.5vw,3.5rem)] font-semibold leading-tight tracking-[-.065em]">Build with <em className="font-serif font-normal italic text-green-deep">NEAR.</em></h2><p className="max-w-[430px] text-sm leading-6 text-ink/65">Create an order through the merchant API, request a payer-bound authorization, and let the customer sign in their selected NEAR wallet.</p><Link href="/developers" className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-green-deep hover:underline">Read integration docs <ArrowRight size={14}/></Link></div><div className="overflow-hidden rounded-2xl bg-ink text-paper"><div className="flex items-center gap-1.5 border-b border-paper/10 px-4 py-3"><i className="size-2 rounded-full bg-mist"/><i className="size-2 rounded-full bg-mist"/><i className="size-2 rounded-full bg-mist"/><MonoLabel className="ml-2 text-[8px] text-paper/50">checkout.ts</MonoLabel></div><pre className="overflow-x-auto p-5 font-mono text-[10px] leading-6 text-[#c6eccf] sm:p-6 sm:text-xs"><code>{`const order = await worldz.orders.create({\n  amount: "25000000000000000000000000",\n  asset: { type: "native" },\n  networkId: "testnet",\n});\n\nreturn redirect(order.checkoutUrl);`}</code></pre></div></section>;
}

function PricingSection() {
  return <section id="pricing" className="bg-[#eae7dc] px-5 py-16 sm:px-8 lg:px-32 lg:py-24"><div className="mx-auto max-w-[1120px]"><div className="mx-auto mb-10 max-w-xl text-center"><MonoLabel>Clear payment economics</MonoLabel><h2 className="mt-4 text-[clamp(2.6rem,5vw,3.8rem)] font-semibold leading-tight tracking-[-.065em]">No surprises between <em className="font-serif font-normal italic text-green-deep">sale</em> and payout.</h2><p className="mt-3 text-sm leading-6 text-ink/65">Review order fees and network costs before signing. The signed order locks the agreed fee for that payment.</p></div><div className="grid gap-3 md:grid-cols-3"><article className="rounded-2xl border border-line bg-white p-5 sm:p-6"><MonoLabel>Default platform fee</MonoLabel><p className="mt-4 text-4xl font-semibold tracking-tight">0.30<span className="text-lg text-mist">%</span></p><p className="mt-3 text-[11px] leading-5 text-mist">30 basis points by default. The configured cap is 5% (500 bps).</p></article><article className="rounded-2xl border border-line bg-white p-5 sm:p-6"><MonoLabel>Network gas</MonoLabel><p className="mt-4 text-lg font-semibold">Shown in wallet</p><p className="mt-3 text-[11px] leading-5 text-mist">NEAR gas is paid by the account signing the transaction and is distinct from payment amount.</p></article><article className="rounded-2xl border border-line bg-white p-5 sm:p-6"><MonoLabel>Token storage</MonoLabel><p className="mt-4 text-lg font-semibold">Preflighted</p><p className="mt-3 text-[11px] leading-5 text-mist">NEP-141 recipient registration may require a one-time storage deposit. Checkout checks before payment.</p></article></div></div></section>;
}

function FinalCta() {
  return <section className="relative isolate min-h-[340px] overflow-hidden bg-vault px-5 py-16 text-center text-paper sm:px-8 sm:py-20" id="get-started"><MonoLabel className="text-paper/60">Payments, on your terms</MonoLabel><h2 className="my-4 text-[clamp(3rem,6vw,4.625rem)] font-semibold leading-none tracking-[-.07em]">Get paid.<br />Keep your <em className="font-serif font-normal italic text-signal">keys.</em></h2><p className="mx-auto mb-6 max-w-[320px] text-[13px] leading-6 text-paper/70">Start accepting crypto payments that settle straight to your wallet.</p><PrimaryAction>Start accepting crypto</PrimaryAction><div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[490px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-signal/15" /></section>;
}

export default function Home() {
  return <main><HomeHero /><AudienceStrip /><AboutSection /><ProductsSection /><FeatureSection /><HowItWorksSection /><DocsSection /><PricingSection /><FinalCta /></main>;
}

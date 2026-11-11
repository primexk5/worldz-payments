import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Globe2, Wallet } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";

const actionClass = "inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-ink px-6 text-xs font-medium text-paper transition hover:bg-vault";
const chains = [
  { name: "Ethereum", icon: "eth" },
  { name: "Base", icon: "base" },
  { name: "Arbitrum", icon: "arb" },
  { name: "Solana", icon: "sol" },
];

export function CrossChainPromotion() {
  return <section id="cross-chain" className="border-y border-line bg-white/40">
    <div className="site-container site-section">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <MonoLabel>03 / Across chains</MonoLabel><span className="flex items-center gap-2 text-xs text-ink/60"><Globe2 size={15}/>Powered by NEAR Intents</span>
      </div>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="site-heading">Their chain.<br/>Your <em className="font-serif font-normal italic text-green-deep">NEAR wallet.</em></h2>
          <p className="site-description mt-5 max-w-md">Let customers pay from Ethereum, Base, Arbitrum or Solana. They approve in their wallet. You receive the supported token specified by your payment link on NEAR.</p>
          <div className="mt-7 space-y-3">{["Review the conversion and fees before signing", "Approve the transfer directly in your wallet", "Track the payment through verified settlement"].map(text => <p key={text} className="flex gap-3 text-sm text-ink/75"><Check size={16} className="mt-0.5 shrink-0 text-green-deep"/>{text}</p>)}</div>
          <div className="mt-8 flex flex-wrap items-center gap-5"><Link href="/dashboard/links" className={actionClass}>Create a payment link<ArrowUpRight size={16}/></Link><Link href="/docs" className="inline-flex min-h-12 items-center gap-2 text-xs font-medium hover:underline">Explore cross-chain<ArrowRight size={15}/></Link></div>
          <p className="mt-4 max-w-md text-xs leading-6 text-ink/55">Live swaps require mainnet, an enabled route and a supported NEAR token. Testnet payments are simulated.</p>
        </div>
        <div className="overflow-hidden rounded-[28px] bg-vault p-5 sm:p-9">
          <div className="flex items-center justify-between gap-3 text-[10px] text-white/60"><span className="font-mono uppercase tracking-wider">One checkout. More ways to pay.</span><span>Flow preview</span></div>
          <div className="my-8 grid grid-cols-2 gap-3">{chains.map(chain => <div key={chain.icon} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-4"><Image src={`/promotions/icons/${chain.icon}.png`} width={32} height={32} alt="" className="size-8 rounded-full bg-white p-1"/><span className="text-sm text-white">{chain.name}</span></div>)}</div>
          <div aria-hidden="true" className="mx-auto -mt-3 mb-5 flex h-10 w-px items-end justify-center bg-gradient-to-b from-white/0 to-signal"><ArrowRight size={18} className="shrink-0 rotate-90 text-signal"/></div>
          <div className="rounded-2xl bg-paper p-5 sm:p-6">
            <div className="flex items-center gap-3"><Image src="/promotions/icons/near.png" width={40} height={40} alt="NEAR" className="size-10 rounded-full"/><div><p className="text-sm font-semibold">Your NEAR payout wallet</p><p className="mt-1 text-xs text-ink/50">The token and amount on your payment link</p></div></div>
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4 text-xs"><span className="flex items-center gap-2 text-green-deep"><Check size={15}/>Verified settlement</span><span className="flex items-center gap-2 text-ink/55"><Wallet size={14}/>Keys stay yours</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

export function SubscriptionPromotion() {
  return <section id="subscriptions" className="site-container site-section">
    <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5"><MonoLabel>04 / For everyday life</MonoLabel><span className="rounded-full border border-line px-3 py-1.5 text-[10px] text-ink/60">Nigeria · Testnet preview</span></div>
    <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
      <div className="order-2 grid grid-cols-2 gap-3 sm:gap-4 lg:order-1">{[
        ["airtime", "Airtime", "A little more talk time"],
        ["data", "Data bundles", "Stay connected"],
        ["electricity", "Electricity", "Keep the lights on"],
        ["tv", "TV subscriptions", "Your next watch awaits"],
      ].map(([image, title, subtitle]) => <Link href="/dashboard/services" key={image} className="group overflow-hidden rounded-[20px] border border-line bg-white transition hover:border-green-deep/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-deep"><div className="relative aspect-[1.3] overflow-hidden bg-paper"><Image src={`/promotions/services/${image}.png`} alt={`${title} in emerald glass and brushed metal`} fill sizes="(max-width: 640px) 45vw, (max-width: 1024px) 35vw, 260px" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"/></div><div className="p-3.5 sm:p-5"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-5 text-ink/55">{subtitle}</p></div></Link>)}</div>
      <div className="order-1 lg:order-2">
        <h2 className="site-heading">Everyday essentials.<br/><em className="font-serif font-normal italic text-green-deep">Meet your wallet.</em></h2>
        <p className="site-description mt-5 max-w-md">Top up airtime, buy a data bundle, pay for electricity or renew a TV package. Choose a provider, review your quote and approve with your NEAR wallet.</p>
        <div className="mt-6 flex flex-wrap gap-2">{["near", "usdc", "usdt", "dai"].map(icon => <span key={icon} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-[11px]"><Image src={`/promotions/icons/${icon}.png`} width={20} height={20} alt="" className="size-5 rounded-full"/>{icon.toUpperCase()}</span>)}</div>
        <p className="mt-3 text-xs leading-6 text-ink/55">Enabled testnet tokens, including bridged USDC and USDT.</p>
        <div className="mt-7 border-y border-line py-4"><p className="text-xs font-medium">Starting in Nigeria. More countries planned.</p><p className="mt-2 text-xs leading-6 text-ink/55">One-time purchases and renewals. No automatic charges.</p></div>
        <Link href="/dashboard/services" className={`${actionClass} mt-7`}>Try bills & subscriptions<ArrowUpRight size={16}/></Link>
        <p className="mt-4 max-w-md text-xs leading-6 text-ink/55">VTpass sandbox only. No real airtime, data, electricity or TV service is delivered.</p>
      </div>
    </div>
  </section>;
}

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Globe2, Smartphone, Tv, Wallet, Wifi, Zap } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";

const actionClass = "inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-ink px-6 text-xs font-medium text-paper transition hover:bg-vault";
const chains = [
  { name: "Ethereum", icon: "eth" },
  { name: "Base", icon: "base" },
  { name: "Arbitrum", icon: "arb" },
  { name: "Solana", icon: "sol" },
];

export function CrossChainPromotion() {
  return <section id="cross-chain" className="bg-white/40">
    <div className="site-container site-section">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 pb-5">
        <MonoLabel>03 / Across chains</MonoLabel><span className="flex items-center gap-2 text-xs text-ink/60"><Globe2 size={15}/>Powered by NEAR Intents</span>
      </div>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="site-heading">Their chain.<br/>Your <em className="font-serif font-normal italic text-green-deep">NEAR wallet.</em></h2>
          <p className="site-description mt-5 max-w-md">Let customers pay from Ethereum, Base, Arbitrum or Solana. They approve in their wallet. You receive the supported token specified by your payment link on NEAR.</p>
          <div className="mt-7 space-y-3">{["Review the conversion and fees before signing", "Approve the transfer directly in your wallet", "Track the payment through verified settlement"].map(text => <p key={text} className="flex gap-3 text-sm text-ink/75"><Check size={16} className="mt-0.5 shrink-0 text-green-deep"/>{text}</p>)}</div>
          <div className="mt-8 flex flex-wrap items-center gap-5"><Link href="/dashboard/links" className={actionClass}>Create a payment link<ArrowUpRight size={16}/></Link><Link href="/docs" className="inline-flex min-h-12 items-center gap-2 text-xs font-medium hover:text-green-deep">Explore cross-chain<ArrowRight size={15}/></Link></div>
          <p className="mt-4 max-w-md text-xs leading-6 text-ink/55">Live swaps require mainnet, an enabled route and a supported NEAR token. Testnet payments are simulated.</p>
        </div>
        <div className="overflow-hidden rounded-[28px] bg-[#e9ece4] p-5 sm:p-9">
          <div className="flex items-center justify-between gap-3 text-[10px] text-ink/50"><span className="font-mono uppercase tracking-wider">One checkout. More ways to pay.</span><span>Flow preview</span></div>
          <div className="my-8 grid grid-cols-2 gap-3">{chains.map(chain => <div key={chain.icon} className="flex items-center gap-3 rounded-2xl border border-ink/5 bg-white/75 p-4"><Image src={`/promotions/icons/${chain.icon}.png`} width={32} height={32} alt="" className="size-8 rounded-full bg-white p-1"/><span className="text-sm text-ink">{chain.name}</span></div>)}</div>
          <div aria-hidden="true" className="mx-auto -mt-3 mb-5 flex h-10 w-px items-end justify-center bg-gradient-to-b from-black/0 to-green-deep"><ArrowRight size={18} className="shrink-0 rotate-90 text-signal"/></div>
          <div className="rounded-2xl bg-paper p-5 sm:p-6">
            <div className="flex items-center gap-3"><Image src="/promotions/icons/near.png" width={40} height={40} alt="NEAR" className="size-10 rounded-full"/><div><p className="text-sm font-semibold">Your NEAR payout wallet</p><p className="mt-1 text-xs text-ink/50">The token and amount on your payment link</p></div></div>
            <div className="mt-6 flex items-center justify-between gap-3 pt-4 text-xs"><span className="flex items-center gap-2 text-green-deep"><Check size={15}/>Verified settlement</span><span className="flex items-center gap-2 text-ink/55"><Wallet size={14}/>Keys stay yours</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

const services = [
  { title: "Airtime", description: "Quick mobile top-ups", icon: Smartphone },
  { title: "Data bundles", description: "Stay connected", icon: Wifi },
  { title: "Electricity", description: "Keep the lights on", icon: Zap },
  { title: "TV subscriptions", description: "Pick your next package", icon: Tv },
];

export function SubscriptionPromotion() {
  return <section id="subscriptions" className="site-container site-section">
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="order-2 mx-auto w-full max-w-md rounded-[28px] bg-white/75 p-6 sm:p-8 lg:order-1">
        <div className="mb-7 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Bills & subscriptions</span>
          <span className="flex items-center gap-2 text-xs text-ink/50"><span aria-hidden="true" className="size-1.5 rounded-full bg-green-deep"/>Nigeria</span>
        </div>
        <div className="space-y-5">{services.map(({ title, description, icon: Icon }) => <Link href="/dashboard/services" key={title} className="group flex items-center gap-4 rounded-2xl p-2 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-deep">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-green-deep/5 text-green-deep"><Icon size={21} strokeWidth={1.5}/></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs text-ink/45">{description}</span></span>
          <ArrowUpRight size={16} className="shrink-0 text-ink/30 transition-colors group-hover:text-green-deep"/>
        </Link>)}</div>
      </div>
      <div className="order-1 lg:order-2">
        <MonoLabel>For everyday life</MonoLabel>
        <h2 className="site-heading mt-4">Everyday payments.<br/><em className="font-serif font-normal italic text-green-deep">From your wallet.</em></h2>
        <p className="site-description mt-5 max-w-md">Airtime, data, electricity and TV. Choose your service, review the amount and approve in your wallet.</p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3">{["near", "usdc", "usdt", "dai"].map(icon => <span key={icon} className="inline-flex items-center gap-2 text-xs text-ink/65"><Image src={`/promotions/icons/${icon}.png`} width={20} height={20} alt="" className="size-5 rounded-full"/>{icon.toUpperCase()}</span>)}</div>
        <p className="mt-6 text-xs leading-6 text-ink/55">Starting in Nigeria. More countries planned.<br/>One-time payments. No automatic charges.</p>
        <Link href="/dashboard/services" className={`${actionClass} mt-6`}>Explore bills & subscriptions<ArrowUpRight size={16}/></Link>
        <p className="mt-4 max-w-md text-[11px] leading-5 text-ink/45">Testnet preview · Enabled tokens only · No real services delivered.</p>
      </div>
    </div>
  </section>;
}

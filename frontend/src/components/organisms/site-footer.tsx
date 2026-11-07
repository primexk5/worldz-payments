import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { NearLogo } from "@/components/atoms/near-logo";
import { PrivacySettingsButton } from "@/components/organisms/privacy-notice";

const groups = [
  { title: "Product", links: [["Checkout", "/checkout/demo"], ["Payment links", "/payment-links"], ["Merchant dashboard", "/dashboard"], ["Pricing", "/pricing"]] },
  { title: "Resources", links: [["How it works", "/#how-it-works"], ["Settlement", "/settlement"], ["Documentation", "/docs"], ["Developer reference", "/docs#typescript-client"], ["Try the demo", "/checkout/demo"]] },
  { title: "WorldzPayments", links: [["About us", "/about"], ["Create an account", "/onboarding"], ["Sign in", "/login"], ["Terms of service", "/terms"], ["Privacy & cookies", "/privacy"]] },
];

export function SiteFooter() {
  return <footer className="border-t border-line bg-paper">
    <div className="site-container pb-7 pt-12 sm:pt-16"><div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-12"><div><BrandMark/><p className="mt-5 max-w-64 text-sm leading-7 text-ink/60">Payments for your business.<br/>Straight to your wallet.<br/>Keys stay yours.</p><a href="https://near.org" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs"><NearLogo className="size-4"/>Built on NEAR<ArrowUpRight size={12} className="text-mist"/></a></div>{groups.map(group=><div key={group.title}><h2 className="font-mono text-[11px] font-medium uppercase tracking-[.12em] text-mist">{group.title}</h2><ul className="mt-5 space-y-3.5">{group.links.map(([label,href])=><li key={label}><Link href={href} className="text-sm text-ink/70 transition-colors hover:text-ink">{label}</Link></li>)}</ul></div>)}</div>
      <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs text-mist sm:flex-row sm:items-center sm:justify-between"><p>© 2026 worldzPayments. All rights reserved.</p><p className="font-mono text-[10px] uppercase tracking-wider">Non-custodial · Verifiable on-chain</p><a href="#top" className="inline-flex items-center gap-2 self-start text-ink/65 sm:self-auto">Back to top<ArrowRight size={13} className="-rotate-90"/></a></div>
      <div className="mt-4"><PrivacySettingsButton /></div>
    </div>
  </footer>;
}

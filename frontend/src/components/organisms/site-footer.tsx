import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { NearLogo } from "@/components/atoms/near-logo";
import { PrivacySettingsButton } from "@/components/organisms/privacy-notice";

const groups = [
  { title: "Product", links: [["Checkout", "/checkout/demo"], ["Payment links", "/payment-links"], ["Cross-chain payments", "/#cross-chain"], ["Bills & subscriptions", "/#subscriptions"], ["Merchant dashboard", "/dashboard"], ["Pricing", "/pricing"]] },
  { title: "Resources", links: [["How it works", "/#how-it-works"], ["Settlement", "/settlement"], ["Documentation", "/docs"], ["Developer reference", "/docs#typescript-client"], ["Watch the demo", "/checkout/demo"]] },
  { title: "WorldzPayments", links: [["About us", "/about"], ["Create an account", "/onboarding"], ["Sign in", "/login"], ["Terms of service", "/terms"], ["Rules & violations", "/terms#acceptable-use"], ["Privacy & cookies", "/privacy"]] },
];

export function SiteFooter() {
  return <footer className="border-t border-line bg-paper">
    <div className="site-container pb-6 pt-10 sm:pb-8 sm:pt-14">
      <div className="grid gap-8 lg:grid-cols-[1.35fr_2fr] lg:gap-16">
        <div className="rounded-[24px] bg-white/55 p-5 sm:p-6 lg:bg-transparent lg:p-0">
          <BrandMark/>
          <p className="mt-4 max-w-64 text-sm leading-6 text-ink/60">Payments for your business.<br/>Straight to your wallet.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a href="https://near.org" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-paper px-3 text-xs"><NearLogo className="size-4"/>Built on NEAR<ArrowUpRight size={12} className="text-mist"/></a>
            <Link href="/dashboard/links" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 text-xs font-medium text-white transition-colors hover:bg-vault">Create a payment link<ArrowRight size={14}/></Link>
          </div>
        </div>
        <nav aria-label="Footer" className="grid gap-2 lg:grid-cols-3 lg:gap-8">
          {groups.map(group=><details key={group.title} className="group rounded-2xl bg-white/55 px-4 open:pb-3 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden lg:hidden">{group.title}<ChevronDown size={16} className="text-mist transition-transform group-open:rotate-180"/></summary>
            <h2 className="hidden font-mono text-[11px] font-medium uppercase tracking-[.12em] text-mist lg:block">{group.title}</h2>
            <ul className="hidden space-y-3.5 pb-1 group-open:block lg:mt-5 lg:block">{group.links.map(([label,href])=><li key={label}><Link href={href} className="block rounded-lg py-1 text-sm text-ink/65 transition-colors hover:text-green-deep lg:py-0">{label}</Link></li>)}</ul>
          </details>)}
        </nav>
      </div>
      <div className="mt-8 flex flex-col gap-3 rounded-2xl bg-white/45 p-4 text-xs text-mist sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p>© 2026 worldzPayments</p>
        <p className="font-mono text-[9px] uppercase tracking-wider">Non-custodial · Verifiable on-chain</p>
        <a href="#top" className="inline-flex min-h-9 items-center gap-2 text-ink/65 transition-colors hover:text-green-deep">Back to top<ArrowRight size={13} className="-rotate-90"/></a>
      </div>
      <div className="mt-3 px-1"><PrivacySettingsButton /></div>
    </div>
  </footer>;
}

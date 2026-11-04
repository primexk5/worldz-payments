import { ArrowRight, Menu } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/atoms/brand-mark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 mx-auto grid h-[70px] w-full max-w-[1680px] grid-cols-[1fr_auto] items-center gap-4 border-b border-ink/10 bg-paper px-5 sm:h-[74px] sm:px-7 lg:h-[82px] lg:grid-cols-[1fr_auto_1fr] lg:gap-6 lg:px-[4.5vw] xl:px-[72px]" id="top">
      <div className="justify-self-start"><BrandMark /></div>
      <nav className="hidden items-center justify-self-center gap-5 whitespace-nowrap lg:flex xl:gap-8" aria-label="Main navigation">
        <Link className="text-[10px] text-ink/65 transition-colors hover:text-ink xl:text-xs" href="/#top">Home</Link><Link className="text-[10px] text-ink/65 transition-colors hover:text-ink xl:text-xs" href="/#about">About</Link><Link className="text-[10px] text-ink/65 transition-colors hover:text-ink xl:text-xs" href="/#docs">Docs</Link><Link className="text-[10px] text-ink/65 transition-colors hover:text-ink xl:text-xs" href="/#pricing">Pricing</Link>
      </nav>
      <div className="flex items-center justify-self-end gap-2 whitespace-nowrap sm:gap-5"><details className="relative lg:hidden"><summary aria-label="Open navigation" className="grid size-9 list-none cursor-pointer place-items-center rounded-lg border border-line bg-white [&::-webkit-details-marker]:hidden"><Menu size={16}/></summary><nav aria-label="Mobile navigation" className="absolute right-0 top-11 z-50 grid min-w-40 gap-1 rounded-xl border border-line bg-white p-2 shadow-xl"><Link className="rounded-lg px-3 py-2 text-xs hover:bg-paper" href="/#top">Home</Link><Link className="rounded-lg px-3 py-2 text-xs hover:bg-paper" href="/#about">About</Link><Link className="rounded-lg px-3 py-2 text-xs hover:bg-paper" href="/#docs">Docs</Link><Link className="rounded-lg px-3 py-2 text-xs hover:bg-paper" href="/#pricing">Pricing</Link></nav></details><Link className="hidden text-xs text-ink/65 transition-colors hover:text-ink sm:inline" href="/login">Log in</Link>
        <Button className="h-[42px] gap-2 rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper transition hover:bg-ink/90 hover:shadow-[0_0_0_1px_#12e08a] focus-visible:ring-2 focus-visible:ring-green-deep focus-visible:ring-offset-4 sm:h-[46px] sm:gap-4 sm:px-5 sm:text-xs" render={<a href="/onboarding" />}>Open store <span className="grid size-7 place-items-center rounded-full bg-signal text-ink sm:size-8"><ArrowRight size={16} /></span></Button>
      </div>
    </header>
  );
}

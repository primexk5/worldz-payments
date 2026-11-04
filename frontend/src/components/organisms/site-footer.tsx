import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";

export function SiteFooter() {
  return <footer className="bg-ink px-5 py-8 text-paper sm:px-8 sm:py-10 lg:px-[6vw]"><BrandMark inverse /><p className="my-4 mb-8 text-[11px] leading-7 text-paper/65">Non-custodial payments for merchants.<br />Keys stay yours.</p><div className="flex flex-col items-start gap-5 border-t border-paper/15 pt-5 sm:flex-row sm:items-center sm:justify-between"><MonoLabel className="text-[8px] text-paper/50">© 2026 worldzPayments</MonoLabel><div className="flex w-full justify-between gap-5 sm:w-auto"><a className="text-[9px] text-paper/65 transition-colors hover:text-signal sm:text-[10px]" href="/developers">Developers</a><a className="text-[9px] text-paper/65 transition-colors hover:text-signal sm:text-[10px]" href="/pricing">Pricing</a><a className="text-[9px] text-paper/65 transition-colors hover:text-signal sm:text-[10px]" href="#top">Back to top ↑</a></div></div></footer>;
}

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Code2, Link2, LockKeyhole, ShoppingBag, Wallet } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { NearLogo } from "@/components/atoms/near-logo";
import { ShopifyLogo } from "@/components/atoms/shopify-logo";
import { IntegrationCode } from "@/components/organisms/integration-code";

const actionClass = "inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-ink px-6 text-xs font-medium text-paper transition hover:bg-vault";
const textActionClass = "inline-flex min-h-12 items-center gap-2 text-xs font-medium transition-colors hover:text-green-deep";

export function ShopifyPromotion() {
  return (
    <section id="shopify" className="overflow-hidden bg-white/45">
      <div className="site-container site-section">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 pb-5">
          <MonoLabel>01 / For your storefront</MonoLabel>
          <span className="text-xs text-ink/60">Shopify × WorldzPayments</span>
        </div>
        <div className="grid items-center gap-10 lg:grid-cols-[.95fr_1.05fr] lg:gap-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[#95bf47]/35 bg-[#95bf47]/10 py-2 pl-3 pr-4">
              <ShopifyLogo className="h-6 w-5"/>
              <span className="text-xs font-medium text-vault">Made for your Shopify store</span>
            </div>
            <h2 className="site-heading">Your store.<br/>Their wallet.<br/><em className="font-serif font-normal italic text-green-deep">A whole new checkout.</em></h2>
            <p className="site-description mt-5 max-w-md">Bring NEAR payments to your Shopify product pages. Give customers a new way to pay, with verified payments synced back to your store as orders.</p>
            <div className="mt-7 space-y-3">
              {["Set token prices for your product variants", "Let customers pay from their NEAR wallet", "Track paid orders inside Shopify"].map(text => (
                <p key={text} className="flex items-center gap-3 text-sm text-ink/75"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-vault/5"><Check className="size-3 text-vault"/></span>{text}</p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/dashboard/settings" className={actionClass}>Connect Shopify<ArrowUpRight size={16}/></Link>
              <Link href="/docs#shopify" className={textActionClass}>How it works<ArrowRight size={15}/></Link>
            </div>
            <p className="mt-5 max-w-md text-xs leading-6 text-ink/55">Requires a NEAR wallet and merchant setup. Shipping and taxes are arranged separately by the merchant.</p>
          </div>
          <div className="relative isolate overflow-hidden rounded-[28px] bg-[#092f26] p-5 sm:p-9">
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 size-80 rounded-full border-[48px] border-[#95bf47]/10"/>
            <div className="flex items-center justify-between gap-3 pb-5">
              <span className="font-mono text-[10px] uppercase tracking-[.16em] text-white/65">Your next way to get paid</span>
              <span className="rounded-full border border-white/20 px-2.5 py-1 text-[9px] text-white/65">Integration preview</span>
            </div>
            <div className="flex items-center justify-center gap-6 py-10 sm:gap-9 sm:py-12">
              <div className="flex flex-col items-center gap-4">
                <ShopifyLogo className="h-28 w-24 drop-shadow-[0_12px_16px_#00000025] sm:h-36 sm:w-32"/>
                <span className="text-lg font-semibold italic tracking-tight text-white">shopify</span>
              </div>
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/20 text-[#c4ed92]"><Link2 size={16}/></span>
              <div className="flex flex-col items-center gap-4">
                <div className="grid h-28 w-24 place-items-center rounded-2xl border border-white/20 bg-white/5 sm:h-36 sm:w-32"><NearLogo className="size-12 text-white sm:size-16"/></div>
                <span className="text-lg font-medium tracking-tight text-white">NEAR</span>
              </div>
            </div>
            <div className="rounded-2xl bg-[#fffefa] p-5 shadow-[0_16px_40px_-20px_#00000080] sm:p-6">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium">Your store checkout</span><span className="font-mono text-[9px] uppercase tracking-wider text-ink/45">Example order</span></div>
              <div className="my-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] text-ink/55">Total to pay</p><p className="mt-1 font-mono text-3xl tracking-[-.06em]">25.00 <span className="text-sm tracking-normal text-ink/55">NEAR</span></p></div><span className="mb-1 flex items-center gap-1.5 text-[10px] text-ink/55"><LockKeyhole size={11}/>Wallet checkout</span></div>
              <div className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-vault px-4 text-xs font-medium text-white"><NearLogo className="size-3.5"/>Pay with NEAR<ArrowUpRight className="ml-auto size-3.5"/></div>
              <div className="mt-4 flex items-center gap-2 pt-4"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#95bf47]/20 text-vault"><Check size={12}/></span><p className="text-[11px] text-ink/65">Payment verified. Order synced to Shopify.</p></div>
            </div>
            <p className="mt-5 text-center text-[10px] leading-5 text-white/50">From product page to wallet payment to Shopify order.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PaymentLinksPromotion() {
  return (
    <section id="payment-links" className="site-container site-section">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 pb-5"><MonoLabel>02 / For wherever you sell</MonoLabel><span className="flex items-center gap-2 text-xs text-ink/60"><Link2 size={15}/>Payment links</span></div>
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-16">
        <div className="relative order-2 overflow-hidden rounded-[28px] bg-[#f1eee6] p-6 sm:p-10 lg:order-1">
          <div className="relative mx-auto max-w-[370px]">
            <div className="mb-5 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-ink/45"><span>One link. Ready to share.</span><span>Preview</span></div>
            <div className="rounded-2xl bg-white p-6 shadow-[0_12px_35px_-24px_rgba(11,15,14,.35)] sm:p-7">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-line bg-paper"><ShoppingBag size={18}/></span><div><p className="text-sm font-semibold">Studio North</p><p className="mt-1 text-[11px] text-ink/50">Design deposit</p></div></div>
              <p className="mt-8 text-xs text-ink/55">Amount to pay</p><p className="mt-2 font-mono text-4xl tracking-[-.06em]">25.00 <span className="text-base tracking-normal text-ink/50">NEAR</span></p>
              <div className="my-6 h-px bg-ink/10"/>
              <div className="flex items-center justify-between gap-3 text-xs"><span className="text-ink/55">Payment method</span><span className="flex items-center gap-2"><NearLogo className="size-3"/>NEAR wallet</span></div>
              <div className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-ink text-xs font-medium text-white"><Wallet size={14}/>Connect wallet to pay</div>
              <p className="mt-3 text-center text-[10px] text-ink/50">Review the amount and fees before signing.</p>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-ink/10 bg-white/60 px-4 py-3 text-ink/75"><Link2 size={15} className="shrink-0 text-signal"/><span className="min-w-0 flex-1 truncate font-mono text-[11px]">your-domain.com/pay/your-link</span><span className="rounded bg-paper px-2 py-1 text-[9px] text-ink/50">URL preview</span></div>
          </div>
        </div>
        <div className="order-1 lg:order-2"><span className="mb-5 inline-flex rounded-full border border-line bg-white/50 px-3 py-1.5 text-[10px] font-medium">No storefront required</span><h2 className="site-heading">A payment link.<br/>A world of <em className="font-serif font-normal italic text-green-deep">possibility.</em></h2><p className="site-description mt-5 max-w-md">From a client deposit to your next social sale. Set your amount, create a link and give customers a clear way to pay from their NEAR wallet.</p>
          <div className="mt-7 grid grid-cols-3 gap-3 py-5">{[["01", "Create a link"], ["02", "Share it anywhere"], ["03", "Track settlement"]].map(([number, title]) => <div key={number}><span className="font-mono text-[10px] text-green-deep">{number}</span><p className="mt-2 text-xs leading-5 font-medium">{title}</p></div>)}</div>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2"><Link href="/dashboard/links" className={actionClass}>Create a payment link<ArrowUpRight size={16}/></Link><Link href="/checkout/demo" className={textActionClass}>Watch the demo<ArrowRight size={15}/></Link></div>
        </div>
      </div>
    </section>
  );
}

export function DeveloperPromotion() {
  return (
    <section id="docs" className="bg-white/40">
      <div className="site-container site-section">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 pb-5"><MonoLabel>05 / For what you’re building</MonoLabel><span className="flex items-center gap-2 text-xs text-ink/60"><Code2 size={15}/>SDK & developer tools</span></div>
        <div className="grid items-center gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-16">
          <div><h2 className="site-heading">Your product.<br/>Our payment <em className="font-serif font-normal italic text-green-deep">primitives.</em></h2><p className="site-description mt-5 max-w-md">Build a payment experience that fits your business. Start with the TypeScript source client, connect your checkout and follow each payment through to verified settlement.</p>
            <div className="mt-7 space-y-4">{[["TypeScript source client", "Payment links, order status and receipt metadata."], ["Wallet & payment helpers", "Wallet sign-in, exact amounts and settlement checks."], ["REST API reference", "Documented requests for your own integration."]].map(([title, text]) => <div key={title} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-green-deep"/><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-ink/60">{text}</p></div></div>)}</div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2"><Link href="/docs#typescript-client" className={actionClass}>Explore the SDK guide<ArrowUpRight size={16}/></Link><Link href="/docs#api-reference" className={textActionClass}>API reference<ArrowRight size={15}/></Link></div>
            <p className="mt-5 text-xs leading-6 text-ink/55">Included in this project as source. No standalone npm package.</p>
          </div>
          <div className="min-w-0"><IntegrationCode/><div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-ink/55"><span className="flex items-center gap-1.5"><LockKeyhole size={12}/>Authenticated merchant session required</span><Link href="/docs#authentication" className="inline-flex items-center gap-1 transition-colors hover:text-green-deep">Authentication guide<ArrowUpRight size={12}/></Link></div></div>
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";

export const metadata: Metadata = {
  title: "Watch the demo — WorldzPayments",
  description: "See WorldzPayments in action in our 60-second product video.",
};

export default function DemoPage() {
  return <main id="main-content" className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-8 sm:py-12"><div className="mx-auto max-w-[1100px]">
    <header className="flex items-center justify-between"><BrandMark /><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14} />Back to home</Link></header>
    <section className="mt-10 sm:mt-14" aria-labelledby="demo-title">
      <MonoLabel>WorldzPayments · Product demo</MonoLabel>
      <h1 id="demo-title" className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">See how payments should feel.</h1>
      <p id="demo-description" className="mt-4 max-w-xl text-sm leading-7 text-mist">Watch our 60-second introduction to WorldzPayments. Payments for your business, straight to your wallet.</p>
      <div className="mt-7 overflow-hidden rounded-[24px] border border-line bg-ink shadow-[0_20px_70px_rgba(11,15,14,.12)]">
        <video controls playsInline preload="metadata" poster="/media/worldzpayments-demo-poster.jpg" aria-label="WorldzPayments 60-second product demo" aria-describedby="demo-description" className="aspect-video w-full">
          <source src="/media/worldzpayments-advert-60s.mp4" type="video/mp4" />
          Your browser does not support embedded video. <a href="/media/worldzpayments-advert-60s.mp4">Open the demo video</a>.
        </video>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-mist"><span className="inline-flex items-center gap-2"><Play size={13} aria-hidden="true" />60 seconds · Video with sound</span><a href="/media/worldzpayments-advert-60s.mp4" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">Open video in a new tab</a></div>
      <div className="mt-8 flex flex-wrap items-center gap-5"><Link href="/onboarding" className="inline-flex min-h-11 items-center gap-3 rounded-full bg-ink px-6 py-3 text-xs font-medium text-paper">Create your workspace<ArrowRight size={14} className="text-signal" /></Link><Link href="/docs" className="text-xs font-medium text-green-deep underline underline-offset-4">Read the product guide</Link></div>
    </section>
  </div></main>;
}

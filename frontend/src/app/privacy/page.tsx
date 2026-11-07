import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { PrivacySettingsButton } from "@/components/organisms/privacy-notice";

export const metadata: Metadata = {
  title: "Privacy & cookies — WorldzPayments",
  description: "How WorldzPayments uses account information, payment details, essential cookies, and browser storage.",
};

export default function PrivacyPage() {
  return <main id="main-content" className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12"><div className="mx-auto max-w-[820px]">
    <header className="flex items-center justify-between"><BrandMark /><Link href="/" className="inline-flex items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14} />Home</Link></header>
    <article className="mt-10 rounded-[20px] border border-line bg-white/50 p-6 sm:p-10 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-ink/65">
      <MonoLabel>WorldzPayments · Privacy & cookies</MonoLabel>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your privacy at checkout.</h1>
      <p>Last updated: November 7, 2026</p>
      <h2>Information used by the service</h2>
      <p>WorldzPayments uses wallet account IDs, merchant profiles, payout addresses, payment-link details, order records, and transaction hashes to provide checkout, sign-in, receipts, and merchant reporting. If you enter a customer name, it is saved with the order so it can appear on the receipt and in merchant payment records.</p>
      <p>For Shopify checkouts, customer and shipping information entered in checkout may be shared with the connected merchant and Shopify to process and fulfil the order. Your selected wallet and the services that host this application or provide network access also handle requests under their own privacy policies.</p>
      <h2>Wallets and public blockchain records</h2>
      <p>Your wallet handles signing. WorldzPayments does not ask you to enter your wallet seed phrase or private key. Account IDs, transfers, transaction hashes, and other transaction data recorded on NEAR are public. Clearing your browser data or signing out does not remove blockchain records.</p>
      <h2>Essential cookies and browser storage</h2>
      <p>Essential storage supports features you request, including sign-in and recovering a checkout after a wallet redirect. This site currently does not set advertising or analytics cookies.</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[460px] text-left text-xs leading-6"><caption className="sr-only">Cookies and storage used by WorldzPayments</caption><thead className="border-b border-line bg-paper"><tr><th scope="col" className="p-3 font-medium">Storage</th><th scope="col" className="p-3 font-medium">Purpose</th><th scope="col" className="p-3 font-medium">Duration</th></tr></thead><tbody className="divide-y divide-line"><tr><td className="p-3">Sign-in session cookie</td><td className="p-3">Authenticates merchant requests.</td><td className="p-3">Until sign-out or expiry; normally 7 days.</td></tr><tr><td className="p-3">Checkout session storage</td><td className="p-3">Remembers receipt names and pending payment details in this tab.</td><td className="p-3">For the browser tab session; payment progress is removed when verified as complete.</td></tr><tr><td className="p-3">Privacy notice cookie</td><td className="p-3">Remembers that you dismissed this notice.</td><td className="p-3">180 days.</td></tr></tbody></table></div>
      <h2>Your browser controls</h2>
      <p>You can clear cookies and browser storage using your browser settings. Blocking essential storage may prevent sign-in or payment recovery from working. Clearing storage does not cancel a submitted payment; check its transaction status before paying again.</p>
      <p>You can reopen the cookie notice using the privacy and cookie settings link in the footer or the control below.</p>
      <div className="mt-4"><PrivacySettingsButton /></div>
      <h2>Questions about your information</h2>
      <p>For a receipt correction or a question about an order, contact the merchant shown on your checkout or receipt. For information held by WorldzPayments, use the project’s published support channel. Avoid sharing private keys or seed phrases when requesting support.</p>
      <p><Link href="/terms" className="font-medium text-green-deep underline underline-offset-4">Read the terms of service</Link></p>
    </article>
  </div></main>;
}

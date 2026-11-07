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
      <h2>Why information is processed</h2>
      <p>Account and transaction information supports the checkout or merchant service you request, payment verification, receipts, order fulfilment, and customer support. Relevant records may also be used to investigate fraud, protect accounts, resolve disputes, and meet applicable legal obligations. Where an optional use requires permission, it must be explained separately; dismissing the cookie notice does not authorize unrelated marketing.</p>
      <h2>Sharing and merchant responsibility</h2>
      <p>Merchants receive information relevant to their own orders. Hosting providers, wallet services, blockchain infrastructure, and connected commerce services may process requests needed to deliver their services. Blockchain information can be viewed publicly by anyone. Information may also be disclosed when permitted or required by a valid legal process.</p>
      <p>Merchants must protect customer details, limit access to authorized people, and use those details for legitimate order and support purposes. Our <Link href="/terms#acceptable-use" className="font-medium text-green-deep underline underline-offset-4">rules of use</Link> prohibit unauthorized data collection, disclosure, impersonation, and credential theft.</p>
      <h2>Retention and security</h2>
      <p>Browser storage durations are described above. Server-side account, order, and support records are separate from browser cookies. Retention depends on the record’s purpose, unresolved disputes, fraud prevention, and applicable obligations; clearing a browser does not delete server-side records. No fixed server-side deletion deadline is promised by this notice.</p>
      <p>Signing and authentication controls help protect account access, but no online service is guaranteed to be free of security risks. Protect your devices and wallet credentials. Do not put private keys, seed phrases, or confidential information in receipt names, descriptions, or support messages.</p>
      <h2>Access, correction, and privacy requests</h2>
      <p>Depending on the laws that apply to your information, you may be able to request access, correction, deletion, a copy of your information, or limits on certain uses. You may also be entitled to object to processing, withdraw permission for an optional use, or complain to a relevant data protection authority. Required transaction records and public blockchain data may be subject to limits on deletion.</p>
      <p>Use an official WorldzPayments support channel for information held by the platform, and contact the merchant for information it holds about your order. Describe the request and provide an order or account reference. We may need to verify that you are entitled to access the information before responding. Never submit a seed phrase or private key as proof of identity.</p>
      <h2>Updates to this notice</h2>
      <p>We may update this notice when the service or its data practices change. Check the date above for the current published version. New optional tracking or unrelated uses should be explained before they are introduced; essential-cookie acknowledgement is not blanket permission for future uses.</p>
      <h2>Questions about your information</h2>
      <p>For a receipt correction or a question about an order, contact the merchant shown on your checkout or receipt. For information held by WorldzPayments, use the project’s published support channel. Avoid sharing private keys or seed phrases when requesting support.</p>
      <p><Link href="/terms" className="font-medium text-green-deep underline underline-offset-4">Read the terms of service</Link></p>
    </article>
  </div></main>;
}

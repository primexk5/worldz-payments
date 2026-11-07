import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";

export const metadata: Metadata = {
  title: "Terms, rules & violations — WorldzPayments",
  description: "WorldzPayments rules of use, merchant and customer responsibilities, prohibited activity, payment disputes, and policy enforcement.",
};

const sections = [
  ["using-the-service", "Using the service"],
  ["responsibilities", "Merchant & customer responsibilities"],
  ["acceptable-use", "Rules & prohibited activity"],
  ["payments", "Payments, networks & fees"],
  ["refunds", "Refunds & disputes"],
  ["security", "Security & integrations"],
  ["violations", "Violations & enforcement"],
  ["reports", "Reports & review requests"],
  ["privacy", "Privacy & other services"],
  ["availability", "Availability & policy updates"],
];

export default function TermsPage() {
  return <main id="main-content" className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12"><div className="mx-auto max-w-[820px]">
    <header className="flex items-center justify-between"><BrandMark /><Link href="/" className="inline-flex items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14} />Home</Link></header>
    <article className="mt-10 rounded-[20px] border border-line bg-white/50 p-6 sm:p-10 [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:scroll-mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-ink/65 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:text-sm [&_li]:leading-7 [&_li]:text-ink/65">
      <MonoLabel>WorldzPayments · Terms & acceptable use</MonoLabel>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Rules for using WorldzPayments.</h1>
      <p>Last updated: November 7, 2026</p>
      <div className="mt-6 rounded-2xl border border-green-deep/15 bg-green-deep/5 p-4"><div className="flex items-center gap-2 text-green-deep"><ShieldCheck size={17} /><span className="text-sm font-medium">Honest payments. Clear responsibilities.</span></div><p>Use WorldzPayments for lawful, accurately described transactions. Protect your wallet, respect other users, and verify payment status before fulfilling an order or paying again.</p></div>
      <nav aria-label="Policy sections" className="mt-7 grid gap-2 rounded-2xl border border-line p-4 sm:grid-cols-2">{sections.map(([id, title]) => <a key={id} href={`#${id}`} className="text-xs font-medium text-green-deep underline underline-offset-4">{title}</a>)}</nav>

      <h2 id="using-the-service">1. Using the service</h2>
      <p>These rules apply to merchants, paying customers, developers, and anyone using our website, checkout, payment links, dashboard, or API. By creating a merchant account or submitting a payment request, you agree to use the service in accordance with these terms. Dismissing the cookie notice only records your privacy-notice preference.</p>
      <p>You must have the legal capacity to enter into a transaction and authority to act for any business or wallet you represent. Provide accurate information and use only accounts, funds, content, and integrations you are authorized to control. Do not use the service where your activity is prohibited by applicable law.</p>
      <p>WorldzPayments provides payment software and transaction reporting. The merchant remains the seller responsible for the goods or services offered. A payment link or receipt does not certify a merchant, guarantee delivery, or guarantee the value of a token.</p>

      <h2 id="responsibilities">2. Merchant and customer responsibilities</h2>
      <ul>
        <li><strong>Merchants:</strong> describe your products truthfully, show prices and assets clearly, and disclose delivery, cancellation, and refund conditions before requesting payment.</li>
        <li><strong>Merchants:</strong> verify your payout destination, obtain permissions required for your business, meet tax and consumer obligations, fulfil orders as agreed, and provide customers with a way to contact you.</li>
        <li><strong>Merchants:</strong> protect customer information. Use it for legitimate order, receipt, fulfilment, and support purposes. Do not expose it, sell it, or use it for unsolicited marketing without an appropriate basis.</li>
        <li><strong>Customers:</strong> confirm the merchant, item, amount, token, network, and destination before approving a wallet request. Enter accurate receipt and shipping details and use only funds you are entitled to spend.</li>
        <li><strong>Everyone:</strong> keep order references and transaction hashes. After an error, check the existing order before paying again. Do not treat a pending or partial payout as an instruction to submit another payment.</li>
      </ul>

      <h2 id="acceptable-use">3. Prohibited activity</h2>
      <p>You must not use WorldzPayments to conduct, promote, conceal, or assist any of the following:</p>
      <ul>
        <li><strong>Fraud and deception:</strong> fake shops, misleading payment requests, false invoices, counterfeit receipts, impersonation, phishing, advance-fee scams, or promises you do not intend to honour.</li>
        <li><strong>Illegal transactions:</strong> stolen goods or funds, money laundering, terrorist financing, exploitation, trafficking, or transactions that violate applicable sanctions or other legal restrictions.</li>
        <li><strong>Unauthorized regulated activity:</strong> offering restricted goods, financial services, gambling, or other regulated products without the permissions required in the locations involved.</li>
        <li><strong>Account and data abuse:</strong> stealing credentials, collecting seed phrases, accessing another merchant’s records, publishing private customer information, or using information without authorization.</li>
        <li><strong>Technical attacks:</strong> malware, denial-of-service attacks, abusive scraping, exploiting live systems, bypassing access controls or usage limits, or manipulating signatures, receipts, amounts, or settlement records.</li>
        <li><strong>Evasion and harassment:</strong> creating replacement accounts or links to evade a restriction, sending spam or threats, harassing users or support staff, or making knowingly false reports.</li>
        <li><strong>Rights violations:</strong> selling counterfeit products, infringing intellectual property, or sharing content or personal information you are not entitled to use.</li>
      </ul>
      <p>These examples do not authorize other unlawful or harmful conduct. If you are unsure whether a proposed activity is permitted, seek clarification before requesting payments.</p>

      <h2 id="payments">4. Wallets, settlement, networks, and fees</h2>
      <p>Your selected wallet handles signing. Secure your wallet, devices, access keys, and recovery information. WorldzPayments will not ask you to send a seed phrase or private key to support.</p>
      <p>Routing and payout receipts execute asynchronously on NEAR. Funds may be held by the routing contract while merchant and fee transfers complete. Settlement is reported only after the service verifies the required payouts. A transaction hash or wallet approval alone is not proof of completed merchant settlement.</p>
      <p>Review the platform fee shown at checkout. Gas and token-account storage registration are separate network costs. Gas may be charged even when execution fails. Token availability and precision depend on the configured network and token contract. Testnet activity uses test assets and does not establish a real-money payment or redeemable balance.</p>

      <h2 id="refunds">5. Refunds, cancellations, and disputes</h2>
      <p>The merchant is responsible for its delivery, cancellation, and refund policy and any obligations that applicable law places on the sale. Contact the merchant shown on the checkout or receipt about incorrect items, non-delivery, duplicate payments, or refunds. Include the order reference and transaction hash.</p>
      <p>Closing a page, clearing cookies, or disabling a payment link does not cancel a finalized blockchain transfer. Where available, contract recovery and refund operations depend on the payment’s actual state and authorization. A completed merchant payout may require a separate return transfer from the merchant. Refunds are not guaranteed to be automatic, immediate, or inclusive of network fees.</p>
      <p>WorldzPayments can review technical payment records within the service, but a receipt does not determine whether a merchant fulfilled an order. Nothing in these rules removes mandatory consumer rights that apply to a transaction.</p>

      <h2 id="security">6. Developers, integrations, and security reports</h2>
      <p>Protect API credentials and webhook secrets. Integrate only for merchants who have authorized you. Verify payment status and webhook authenticity before fulfilment, respect documented usage limits, and keep customer information out of public logs and support tickets.</p>
      <p>Report suspected vulnerabilities privately through an official WorldzPayments support channel. Stop testing if it exposes another person’s data or could disrupt payments. Do not move funds, extract additional information, or publish exploit instructions while requesting a review. These terms do not grant permission to test systems owned by wallets, hosting providers, merchants, or other third parties.</p>

      <h2 id="violations">7. Violations and enforcement</h2>
      <p>We may review credible reports, service records, and available transaction evidence when investigating suspected abuse. A report does not automatically establish a violation. We consider the conduct, available evidence, risk of harm, and repeated attempts to evade restrictions.</p>
      <ul>
        <li><strong>Warnings and corrections:</strong> we may request clarification or require misleading information or unsafe activity to be corrected.</li>
        <li><strong>Temporary restrictions:</strong> we may disable hosted payment links, decline new payment requests, or limit hosted-service access while a concern is reviewed.</li>
        <li><strong>Ending access:</strong> serious fraud, repeated abuse, evasion, or failure to address a violation may result in loss of access to the hosted service.</li>
        <li><strong>Protective and legal action:</strong> where necessary, we may preserve relevant records, take technical protective measures, and respond to valid legal requests. Personal information is disclosed only as permitted or required by applicable law.</li>
      </ul>
      <p>Protective action may occur before notice when delay could expose users or the service to further harm. Where practical and lawful, we will explain the reason for a restriction and how to request review. The appropriate response depends on the circumstances; a warning is not guaranteed before a serious violation is addressed.</p>
      <p>A restriction does not transfer control of your wallet to WorldzPayments or reverse a finalized transaction. Existing payment recovery remains subject to contract state, authorization, and network execution.</p>

      <h2 id="reports">8. Reporting violations and requesting review</h2>
      <p>Use an official WorldzPayments support channel to report platform abuse or request review of a restriction. For an order or fulfilment issue, contact the merchant first. If you received an enforcement notice, use the contact channel stated in that notice.</p>
      <p>Include the payment-link URL or order reference, relevant account IDs and transaction hashes, the date, a clear description, and screenshots with unrelated personal information removed. Explain the correction or outcome you are seeking. To challenge a restriction, include the notice reference and evidence showing an error or steps taken to correct the issue.</p>
      <p>Never include private keys, seed phrases, passwords, API secrets, or unnecessary identity documents. We may request enough information to verify your relationship to the affected account or order. Review does not guarantee reinstatement or a particular completion time.</p>

      <h2 id="privacy">9. Privacy and third-party services</h2>
      <p>Read the <Link href="/privacy" className="font-medium text-green-deep underline underline-offset-4">privacy and cookie notice</Link> for information about account records, receipt names, storage, and public blockchain data. Do not place confidential information in payment descriptions or on-chain data.</p>
      <p>Wallets, NEAR infrastructure, token contracts, hosting services, Shopify, and merchant websites may have separate terms and privacy practices. Review the terms of any service you choose to use.</p>

      <h2 id="availability">10. Availability, limitations, and policy updates</h2>
      <p>Wallets, transactions, tokens, integrations, and the website may experience outages, delays, defects, or configuration changes. We do not promise uninterrupted service, successful execution of every transaction, a particular token value, or recovery of every lost payment. Keep your own business records. These terms do not exclude responsibilities or remedies that applicable law does not allow to be excluded.</p>
      <p>We may update these rules as the service changes. The date at the top identifies the published version. Review the terms before using new features or submitting further payment requests. Updates do not alter the historical facts of completed blockchain transactions.</p>
      <p>Raise questions about permitted use or these rules through an official WorldzPayments support channel. Stop the affected activity while seeking clarification if it could put other users or their funds at risk.</p>
    </article>
  </div></main>;
}

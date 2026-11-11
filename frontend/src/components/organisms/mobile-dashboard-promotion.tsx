import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, BarChart3, BatteryFull, CheckCheck, ChevronDown, CreditCard, LayoutDashboard, Link2, Menu, ReceiptText, Search, Settings, ShieldCheck, Signal, Smartphone, WalletCards, Wifi } from "lucide-react";
import { BrandLogo } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { NearLogo } from "@/components/atoms/near-logo";
import styles from "./mobile-dashboard-promotion.module.css";

const samplePayments = [
  { amount: "0.15", description: "Custom print", time: "09:37", status: "Processing", settled: false },
  { amount: "0.40", description: "Canvas order", time: "09:32", status: "Settled", settled: true },
  { amount: "0.20", description: "Design deposit", time: "09:18", status: "Settled", settled: true },
];
const mobileTabs = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Links", icon: Link2 },
  { label: "Payments", icon: CreditCard },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

function IPhoneDashboard() {
  return <figure className={styles.figure}>
    <div className={styles.stage} role="img" aria-label="iPhone-style mockup of the WorldzPayments mobile payments dashboard. Sample data shows 0.60 NEAR settled, three payments, two settled and one processing.">
      <div className={styles.device}>
        <span className={styles.silentSwitch}/><span className={styles.volumeUp}/><span className={styles.volumeDown}/><span className={styles.powerButton}/>
        <div className={styles.screen}>
          <div className={styles.island}><span/></div>
          <div className={styles.statusBar}><span>9:41</span><div><Signal/><Wifi/><BatteryFull/></div></div>
          <div className={styles.appHeader}>
            <Menu className={styles.menuIcon}/>
            <BrandLogo className={styles.wordmark}/>
            <span className={styles.previewBadge}><ShieldCheck/>Preview</span>
          </div>
          <div className={styles.content}>
            <div className={styles.pageHeading}><span className={styles.eyebrow}>MERCHANT WORKSPACE / LEDGER</span><h3>Payments</h3><p>Your payments, in focus.</p></div>
            <div className={styles.metrics}>
              <div className={styles.volumeMetric}><span>Settled volume<ArrowUpRight/></span><strong>0.60 <small>NEAR</small></strong><p>Verified payments</p></div>
              <div className={styles.metric}><span>Total payments<CreditCard/></span><strong>3</strong><p>All payment statuses</p></div>
              <div className={styles.metric}><span>Settled<CheckCheck/></span><strong>2</strong><p>Ready for a receipt</p></div>
              <div className={styles.metric}><span>Needs attention<ShieldCheck/></span><strong>0</strong><p>Nothing to review</p></div>
            </div>
            <div className={styles.activity}>
              <div className={styles.activityHeading}><span><Activity/>Payment activity</span><span className={styles.sampleBadge}>Sample data</span></div>
              <div className={styles.filters}><span><Search/>Search payments…</span><span>All statuses<ChevronDown/></span></div>
              <div className={styles.paymentList}>{samplePayments.map(payment => <div className={styles.payment} key={payment.description}>
                <div className={styles.paymentTop}><span className={styles.paymentAmount}><span className={styles.nearToken}><NearLogo/></span>{payment.amount} <small>NEAR</small></span><span className={payment.settled ? styles.settled : styles.processing}><i/>{payment.status}</span></div>
                <div className={styles.paymentBottom}><span>{payment.description}</span><time>{payment.time}</time></div>
              </div>)}</div>
              <p className={styles.listFooter}>3 payments<span>Newest first</span></p>
            </div>
          </div>
          <div className={styles.bottomNav}>{mobileTabs.map(({ label, icon: Icon }) => <span key={label} className={label === "Payments" ? styles.activeTab : undefined}><Icon/><span>{label}</span></span>)}</div>
          <div className={styles.homeIndicator}><span/></div>
        </div>
      </div>
    </div>
    <figcaption className={styles.caption}>Illustrative mobile web dashboard · sample data</figcaption>
  </figure>;
}

export function MobileDashboardPromotion() {
  return <section id="mobile-dashboard" aria-labelledby="mobile-dashboard-heading" className="overflow-hidden bg-[#e9ece4]">
    <div className="site-container site-section grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
      <div className="max-w-lg">
        <MonoLabel>Your workspace, wherever business happens</MonoLabel>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/60 px-3 py-2 text-[11px] text-vault"><Smartphone size={14}/>Made for your mobile browser</span>
        <h2 id="mobile-dashboard-heading" className="site-heading mt-5">Your business.<br/>Always within <em className="font-serif font-normal italic text-green-deep">reach.</em></h2>
        <p className="site-description mt-5 max-w-md">Check your balances, follow incoming payments and open verified receipts. Your merchant workspace goes where you do.</p>
        <ul className="mt-8 space-y-6">{[
          { icon: WalletCards, title: "Your balances, asset by asset", text: "See NEAR and supported tokens in your payout wallet." },
          { icon: Activity, title: "A clear view of every payment", text: "Search orders and follow their settlement status." },
          { icon: ReceiptText, title: "The proof, right at hand", text: "Open and download receipts for verified payments." },
        ].map(({ icon: Icon, title, text }) => <li key={title} className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-vault/10 bg-white/55 text-vault"><Icon size={18}/></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1.5 text-xs leading-6 text-ink/55">{text}</p></div></li>)}</ul>
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3"><Link href="/dashboard" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-vault px-6 text-xs font-medium text-white transition-colors hover:bg-ink">Open your dashboard<ArrowUpRight size={16}/></Link><Link href="/onboarding" className="inline-flex min-h-12 items-center gap-2 text-xs font-medium text-vault transition-colors hover:text-green-deep">Create an account<ArrowRight size={14}/></Link></div>
      </div>
      <div className={styles.visual}><span className={styles.orbitOne} aria-hidden="true"/><span className={styles.orbitTwo} aria-hidden="true"/><IPhoneDashboard/></div>
    </div>
  </section>;
}

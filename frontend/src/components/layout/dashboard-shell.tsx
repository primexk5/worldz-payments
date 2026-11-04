"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Link2, LogOut, Menu, Settings, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi } from "@/lib/near/api";
import type { MerchantProfile } from "@/lib/near/types";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Payment links", href: "/dashboard/links", icon: Link2 },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accountId, connect, connecting } = useNearWallet();
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void nearApi.me().then((profile) => {
      if (!active) return;
      setMerchant(profile);
      setError(null);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Merchant session unavailable.");
      router.replace("/login?next=" + encodeURIComponent(pathname));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pathname, router]);

  const activeNavigation = useMemo(() => navigation.find((item) =>
    pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)),
  ), [pathname]);

  const signOut = async () => {
    try { await nearApi.logout(); } finally { router.replace("/login"); }
  };

  const connectWallet = async () => {
    try { await connect(); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Wallet connection failed."); }
  };

  return <div className="min-h-screen bg-paper text-ink lg:flex">
    <aside className="hidden w-[250px] shrink-0 flex-col border-r border-line bg-white/65 lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="flex h-[82px] items-center border-b border-line px-6"><BrandMark /></div>
      <p className="px-6 pb-2 pt-7 font-mono text-[9px] uppercase tracking-[.15em] text-mist">Merchant workspace</p>
      <nav className="space-y-1 px-3">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] transition ${activeNavigation?.href === href ? "bg-ink text-paper" : "text-ink/65 hover:bg-paper hover:text-ink"}`}><Icon size={17} />{label}</Link>)}</nav>
      <div className="mt-auto border-t border-line p-4"><p className="truncate text-xs font-medium">{merchant?.displayName ?? "Merchant"}</p><p className="mt-1 truncate font-mono text-[9px] text-mist">{merchant?.accountId ?? "Loading account…"}</p><button onClick={() => void signOut()} className="mt-4 flex items-center gap-2 text-xs text-mist transition hover:text-ink"><LogOut size={14} />Sign out</button></div>
    </aside>
    <div className="min-w-0 flex-1 pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur sm:px-7 lg:h-[82px] lg:px-10">
        <div className="flex items-center gap-3"><button aria-label="Open dashboard menu" className="rounded-lg p-2 hover:bg-white lg:hidden" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button><div className="lg:hidden"><BrandMark /></div><span className="hidden text-sm font-medium text-ink/65 lg:block">{activeNavigation?.label ?? "Merchant dashboard"}</span></div>
        <div className="flex items-center gap-3"><span className="hidden max-w-52 truncate font-mono text-[10px] text-mist sm:block">{accountId ?? merchant?.accountId ?? "Wallet disconnected"}</span><button onClick={() => void connectWallet()} disabled={connecting} className="rounded-full border border-line bg-white px-4 py-2 text-[11px] font-medium hover:border-green-deep disabled:opacity-50">{accountId ? "Wallet connected" : connecting ? "Connecting…" : "Connect wallet"}</button></div>
      </header>
      {mobileMenuOpen && <div className="fixed inset-0 z-50 bg-ink/30 lg:hidden" onClick={() => setMobileMenuOpen(false)}><aside className="h-full w-[min(82vw,320px)] bg-paper p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-8 flex items-center justify-between"><BrandMark /><button aria-label="Close dashboard menu" onClick={() => setMobileMenuOpen(false)}><X size={19} /></button></div><nav className="space-y-1">{navigation.map(({ label, href, icon: Icon }) => <Link onClick={() => setMobileMenuOpen(false)} key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${activeNavigation?.href === href ? "bg-ink text-paper" : "text-ink/70 hover:bg-white"}`}><Icon size={17} />{label}</Link>)}</nav><button onClick={() => void signOut()} className="mt-10 flex items-center gap-2 text-xs text-mist"><LogOut size={14} />Sign out</button></aside></div>}
      <main className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">{error && !merchant && !loading ? <p className="rounded-xl border border-alert/20 bg-alert/5 p-4 text-sm text-alert">{error}</p> : loading ? <div className="py-20 text-center text-sm text-mist">Loading merchant workspace…</div> : children}</main>
    </div>
    <nav aria-label="Mobile dashboard tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-paper/95 px-1 py-2 backdrop-blur lg:hidden">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-1 text-[9px] ${activeNavigation?.href === href ? "text-green-deep" : "text-mist"}`}><Icon size={17} /><span>{label}</span></Link>)}</nav>
  </div>;
}

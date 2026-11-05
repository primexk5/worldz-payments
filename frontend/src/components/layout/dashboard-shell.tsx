"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Link2, LogOut, Menu, Settings, X, ChevronDown, CircleHelp, ArrowUpRight, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NEAR_NETWORK_ID } from "@/lib/near/config";
import { NearLogo } from "@/components/atoms/near-logo";
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

  return <div className="workspace-theme min-h-screen bg-background text-foreground lg:flex">
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="flex h-[88px] items-center px-6"><BrandMark /></div>
      <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-paper/50 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-sm font-semibold text-paper">{merchant?.displayName?.slice(0,1).toUpperCase() ?? "W"}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{merchant?.displayName ?? "Your workspace"}</p><p className="mt-1 text-[10px] text-mist">Merchant account</p></div><ChevronDown size={14} className="text-mist"/></div><p className="px-6 pb-2 pt-7 font-mono text-[9px] uppercase tracking-[.15em] text-mist">WORKSPACE</p>
      <nav className="space-y-1 px-4">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] transition ${activeNavigation?.href === href ? "bg-paper font-medium text-ink" : "text-ink/65 hover:bg-paper hover:text-ink"}`}><Icon size={17} />{label}</Link>)}</nav>
      <div className="mt-auto p-4"><div className="mb-5 rounded-xl border border-line bg-paper/70 p-4"><CircleHelp size={19} className="text-ink"/><p className="mt-2 text-xs font-medium">A little help goes a long way.</p><p className="mt-1 text-[11px] leading-5 text-mist">Find answers and build your integration.</p><Link href="/docs" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink">Explore the docs <ArrowUpRight size={13}/></Link></div><div className="border-t border-line pt-4"><p className="truncate text-xs font-medium">{merchant?.displayName ?? "Merchant"}</p><p className="mt-1 truncate font-mono text-[9px] text-mist">{merchant?.accountId ?? "Loading account…"}</p><button onClick={() => void signOut()} className="mt-4 flex items-center gap-2 text-xs text-mist transition hover:text-ink"><LogOut size={14} />Sign out</button></div></div>
    </aside>
    <div className="min-w-0 flex-1 pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur sm:px-7 lg:h-[76px] lg:px-10">
        <div className="flex items-center gap-3"><button aria-label="Open dashboard menu" className="rounded-lg p-2 hover:bg-white lg:hidden" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button><div className="lg:hidden"><BrandMark /></div><span className="hidden text-sm text-mist lg:block">Workspace <span className="mx-3 text-line">/</span><span className="font-medium text-ink">{activeNavigation?.label ?? "Merchant dashboard"}</span></span></div>
        <div className="flex items-center gap-3"><span className="hidden max-w-52 truncate font-mono text-[10px] text-mist sm:block">{accountId ?? merchant?.accountId ?? "Wallet disconnected"}</span><span className="hidden items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 font-mono text-[10px] capitalize text-mist sm:inline-flex"><NearLogo className="size-3"/>{NEAR_NETWORK_ID}</span><Button variant="outline" onClick={() => void connectWallet()} disabled={connecting} className="h-9 bg-white text-xs"><ShieldCheck size={14}/>{accountId ? "Wallet connected" : connecting ? "Connecting…" : "Connect wallet"}</Button></div>
      </header>
      {mobileMenuOpen && <div className="fixed inset-0 z-50 bg-ink/30 lg:hidden" onClick={() => setMobileMenuOpen(false)}><aside className="h-full w-[min(82vw,320px)] bg-paper p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-8 flex items-center justify-between"><BrandMark /><button aria-label="Close dashboard menu" onClick={() => setMobileMenuOpen(false)}><X size={19} /></button></div><nav className="space-y-1">{navigation.map(({ label, href, icon: Icon }) => <Link onClick={() => setMobileMenuOpen(false)} key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${activeNavigation?.href === href ? "bg-paper font-medium text-ink" : "text-ink/70 hover:bg-white"}`}><Icon size={17} />{label}</Link>)}</nav><button onClick={() => void signOut()} className="mt-10 flex items-center gap-2 text-xs text-mist"><LogOut size={14} />Sign out</button></aside></div>}
      <main className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">{error && !merchant && !loading ? <p className="rounded-xl border border-alert/20 bg-alert/5 p-4 text-sm text-alert">{error}</p> : loading ? <div role="status" className="space-y-6"><div className="h-16 w-2/5 rounded-xl bg-muted"/><div className="grid gap-4 sm:grid-cols-4">{[0,1,2,3].map(i=><div key={i} className="h-32 rounded-xl border border-line bg-white"/>)}</div><div className="h-80 rounded-xl border border-line bg-white"/><span className="sr-only">Loading workspace</span></div> : children}</main>
    </div>
    <nav aria-label="Mobile dashboard tabs" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white/95 px-1 py-2 backdrop-blur lg:hidden">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={`flex flex-col items-center gap-1 py-1 text-[9px] ${activeNavigation?.href === href ? "text-ink" : "text-mist"}`}><Icon size={17} /><span>{label}</span></Link>)}</nav>
  </div>;
}

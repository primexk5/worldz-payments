"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CreditCard, LayoutDashboard, Link2, LogOut, Menu, Settings, X, CircleHelp, ShieldCheck, PanelLeftOpen, PanelLeftClose } from "lucide-react";
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
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

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
    <aside aria-label="Dashboard sidebar" className={`hidden shrink-0 flex-col items-center gap-5 px-3 pb-4 pt-5 transition-[width] duration-300 motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-dvh ${sidebarExpanded ? "w-[240px]" : "w-[88px]"}`}>
      <button type="button" onClick={() => setSidebarExpanded((expanded) => !expanded)} aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={sidebarExpanded} aria-controls="desktop-dashboard-navigation" title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"} className="group flex h-12 w-full shrink-0 items-center justify-center gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-deep">
        <Image src="/brand/symbol-light.svg" alt="" width={40} height={40} unoptimized className="size-10 shrink-0" />
        {sidebarExpanded && <><span className="min-w-0 flex-1 text-left text-sm font-semibold tracking-tight">worldzPayments</span><PanelLeftClose size={16} className="shrink-0 text-mist" /></>}
      </button>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center rounded-[32px] border border-line/50 bg-white px-2 py-2 shadow-[0_4px_20px_rgba(11,15,14,.025)]">
        <nav id="desktop-dashboard-navigation" aria-label="Dashboard navigation" className="flex w-full flex-col items-center gap-2 overflow-y-auto">{navigation.filter(({href}) => href !== "/dashboard/settings").map(({ label, href, icon: Icon }) => <Link key={href} href={href} aria-label={label} title={!sidebarExpanded ? label : undefined} aria-current={activeNavigation?.href === href ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center rounded-full transition-colors ${sidebarExpanded ? "w-full gap-3 px-4" : "w-11 justify-center"} ${activeNavigation?.href === href ? "bg-ink text-paper" : "text-ink/65 hover:bg-paper hover:text-ink"}`}><Icon size={18} strokeWidth={1.6} className="shrink-0" />{sidebarExpanded && <span className="whitespace-nowrap text-xs font-medium">{label}</span>}</Link>)}</nav>
        <div className="mt-auto flex w-full flex-col items-center gap-2 pt-5">
          <Link href="/docs" aria-label="Documentation and help" title={!sidebarExpanded ? "Documentation and help" : undefined} className={`flex min-h-11 items-center rounded-full text-ink/65 transition-colors hover:bg-paper hover:text-ink ${sidebarExpanded ? "w-full gap-3 px-4" : "w-11 justify-center"}`}><CircleHelp size={18} strokeWidth={1.6} className="shrink-0" />{sidebarExpanded && <span className="text-xs">Help & documentation</span>}</Link>
          <Link href="/dashboard/settings" aria-label="Settings" title={!sidebarExpanded ? "Settings" : undefined} aria-current={activeNavigation?.href === "/dashboard/settings" ? "page" : undefined} className={`flex min-h-11 items-center rounded-full transition-colors ${sidebarExpanded ? "w-full gap-3 px-4" : "w-11 justify-center"} ${activeNavigation?.href === "/dashboard/settings" ? "bg-ink text-paper" : "text-ink/65 hover:bg-paper hover:text-ink"}`}><Settings size={18} strokeWidth={1.6} className="shrink-0" />{sidebarExpanded && <span className="text-xs">Settings</span>}</Link>
          <button type="button" onClick={() => void signOut()} aria-label="Sign out" title={!sidebarExpanded ? "Sign out" : undefined} className={`flex min-h-11 items-center rounded-full text-ink/65 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-green-deep ${sidebarExpanded ? "w-full gap-3 px-4" : "w-11 justify-center"}`}><LogOut size={18} strokeWidth={1.6} className="shrink-0" />{sidebarExpanded && <span className="text-xs">Sign out</span>}</button>
          <button type="button" onClick={() => setSidebarExpanded((expanded) => !expanded)} aria-label={sidebarExpanded ? "Collapse workspace details" : "Expand workspace details"} aria-expanded={sidebarExpanded} aria-controls="desktop-dashboard-navigation" title={!sidebarExpanded ? `${merchant?.displayName ?? "Your workspace"} · Click to expand` : "Collapse sidebar"} className={`mt-1 flex min-h-11 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-deep ${sidebarExpanded ? "w-full gap-3 bg-paper px-2 py-2" : "w-11 justify-center"}`}><span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-paper">{merchant?.displayName?.slice(0,1).toUpperCase() ?? "W"}</span>{sidebarExpanded && <span className="min-w-0 text-left"><span className="block truncate text-xs font-medium">{merchant?.displayName ?? "Your workspace"}</span><span className="mt-1 block truncate font-mono text-[9px] text-mist">{merchant?.accountId ?? "Merchant account"}</span></span>}</button>
          <button type="button" onClick={() => setSidebarExpanded((expanded) => !expanded)} aria-label={sidebarExpanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={sidebarExpanded} aria-controls="desktop-dashboard-navigation" title={sidebarExpanded ? "Collapse navigation" : "Expand navigation"} className="flex h-7 w-full shrink-0 items-center justify-center rounded-full text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-green-deep">{sidebarExpanded ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}</button>
        </div>
      </div>
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

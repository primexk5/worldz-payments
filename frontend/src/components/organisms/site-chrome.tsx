"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/organisms/site-header";
import { SiteFooter } from "@/components/organisms/site-footer";

function isFocusedFlow(pathname: string): boolean {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/pay/") ||
    pathname.startsWith("/checkout/") || pathname === "/login" || pathname === "/onboarding" || pathname === "/terms" || pathname === "/privacy" || pathname === "/brand-concepts";
}

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFocusedFlow(pathname)) return <>{children}</>;
  return <><a href="#main-content" className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-full bg-ink px-5 py-3 text-sm text-paper focus:translate-y-0">Skip to content</a><SiteHeader />{children}<SiteFooter /></>;
}

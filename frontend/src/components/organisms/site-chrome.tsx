"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/organisms/site-header";
import { SiteFooter } from "@/components/organisms/site-footer";

function isFocusedFlow(pathname: string): boolean {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/pay/") ||
    pathname.startsWith("/checkout/") || pathname === "/login" || pathname === "/onboarding" || pathname === "/terms";
}

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFocusedFlow(pathname)) return <>{children}</>;
  return <><SiteHeader />{children}<SiteFooter /></>;
}

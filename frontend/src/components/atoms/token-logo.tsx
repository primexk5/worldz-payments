"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { NearLogo } from "@/components/atoms/near-logo";

/** Uses the icon supplied by verified NEP-141 metadata, including SVG data URIs. */
export function TokenLogo({ symbol, icon, className = "size-9" }: { symbol: string; icon?: string | null; className?: string }) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const source = icon?.trim();
  const image = source && source !== failedIcon && /^(https:\/\/|data:image\/)/i.test(source) ? source : null;
  return <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full ${symbol === "NEAR" ? "bg-ink text-white" : "border border-ink/5 bg-white text-ink/40"} ${className}`}>
    {symbol === "NEAR" ? <NearLogo className="h-[48%] w-[48%]"/> : image ? (
      // Metadata icons may be remote URLs or data URIs; serve them without an image proxy.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" width={36} height={36} className="h-full w-full object-contain" referrerPolicy="no-referrer" onError={() => setFailedIcon(source ?? null)}/>
    ) : <Coins className="h-1/2 w-1/2"/>}
  </span>;
}

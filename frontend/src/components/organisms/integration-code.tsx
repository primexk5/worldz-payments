"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, FileCode2 } from "lucide-react";

const lines = [
  'import { nearApi } from "@/lib/near/api";',
  'import { parseUnitsExact } from "@/lib/near/amounts";',
  'import { NEAR_NETWORK_ID } from "@/lib/near/config";',
  '',
  '// After merchant sign-in',
  'const link = await nearApi.createLink({',
  '  networkId: NEAR_NETWORK_ID,',
  '  displayName: "Your next sale",',
  '  asset: {',
  '    type: "native", symbol: "NEAR", decimals: 24',
  '  },',
  '  amount: parseUnitsExact("25", 24).toString(),',
  '  amountDisplay: "25",',
  '  expiresAtSeconds: null,',
  '  multiPay: false,',
  '  maxRedemptions: 1,',
  '});',
  '',
  'const paymentUrl = new URL(',
  '  `/pay/${link.slug}`,',
  '  process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin',
  ');',
];

export function IntegrationCode() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  async function copyCode() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    resetTimer.current = setTimeout(() => setCopyState("idle"), 3000);
  }

  return <div className="overflow-hidden rounded-[20px] border border-[#253c34] bg-[#101e19] text-[#dee9df] shadow-[0_24px_64px_-36px_#07382e65]">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[.025] px-4 py-3 sm:px-5"><div className="flex items-center gap-2 text-xs"><FileCode2 size={15} className="text-[#8cb69d]"/><span>create-payment.ts</span></div><button type="button" onClick={copyCode} aria-label="Copy TypeScript payment link example" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-[10px] text-white/75 transition hover:bg-white/10">{copyState === "copied" ? <Check size={12}/> : <Copy size={12}/>}<span aria-live="polite">{copyState === "copied" ? "Copied" : copyState === "error" ? "Retry copy" : "Copy code"}</span></button></div>
    <div className="overflow-x-auto px-4 py-6 sm:px-5" tabIndex={0} role="region" aria-label="TypeScript source client example"><pre className="font-mono text-[10px] leading-[1.9] sm:text-[11px]"><code>{lines.map((line, index) => <span key={index}><span aria-hidden className="mr-5 inline-block w-4 select-none text-right text-[#71897a]">{index + 1}</span><span className={line.startsWith("//") ? "text-[#8ca394]" : /^(import|const)/.test(line) ? "text-[#a9e6c2]" : "text-[#d4ded6]"}>{line || " "}</span>{"\n"}</span>)}</code></pre></div>
    <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3 font-mono text-[9px] text-[#8ca394]"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-signal"/>TypeScript source client</span><span>NEAR / NEP-141</span></div>
    <p role="status" className="sr-only">{copyState === "error" ? "Clipboard unavailable. Select and copy the code manually." : ""}</p>
  </div>;
}

"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowDownLeft, ArrowUpRight, Search, X } from "lucide-react";
import { TokenLogo } from "@/components/atoms/token-logo";
import { formatUnitsDisplay } from "@/lib/near/amounts";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { AllowedFungibleToken, NearAsset, NearNetworkId } from "@/lib/near/types";

type AssetTotal = { amount: bigint; asset: NearAsset; networkId: NearNetworkId };

function assetKey(total: AssetTotal) {
  return `${total.networkId}:${total.asset.type === "native" ? "native" : total.asset.contractId}`;
}

export function SettledVolumeCard({ totals, tokens, loading }: {
  totals: AssetTotal[];
  tokens: AllowedFungibleToken[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const metadata = (asset: NearAsset) => asset.type === "nep141"
    ? tokens.find((token) => token.contractId === asset.contractId) : undefined;
  const needle = query.trim().toLowerCase();
  const matching = totals.filter((total) => [total.asset.symbol, total.networkId,
    total.asset.type === "nep141" ? total.asset.contractId : "native", metadata(total.asset)?.name ?? (total.asset.type === "native" ? "Native NEAR" : total.asset.symbol),
  ].some((value) => value.toLowerCase().includes(needle)));
  const showTokens = (search = "") => { setQuery(search); setOpen(true); };

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <article className="flex h-[232px] min-w-0 flex-col rounded-2xl border border-vault bg-vault p-4 text-white sm:p-5">
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-white/65">Settled volume</span><ArrowDownLeft size={16} className="text-signal"/></div>
      <div className="mt-3 min-h-0 flex-1 space-y-1">
        {loading ? <p className="py-2 text-2xl">—</p> : totals.length ? totals.slice(0, 3).map((total) => <button type="button" key={assetKey(total)} onClick={() => showTokens(total.asset.symbol)} aria-label={`View exact settled total for ${total.asset.symbol} on ${total.networkId}`} className="flex min-h-9 w-full items-center gap-2 rounded-lg text-left transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-signal/60">
          <span className="min-w-0 truncate font-mono text-xl font-medium tracking-tight">{formatUnitsDisplay(total.amount, total.asset.decimals)}</span>
          <span className="shrink-0 text-xs font-medium text-white/75">{total.asset.symbol}</span>
        </button>) : <p className="py-2 text-2xl">—</p>}
      </div>
      <div className="mt-3 shrink-0 border-t border-white/10 pt-3">
        {!loading && totals.length ? <button type="button" onClick={() => showTokens()} className="flex w-full items-center justify-between gap-2 rounded text-[11px] text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-signal/60"><span>View all tokens <span className="text-white/45">({totals.length})</span></span><ArrowUpRight size={14}/></button> : <p className="text-[10px] text-white/50">Gross totals per asset</p>}
      </div>
    </article>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[120] bg-ink/45 backdrop-blur-sm"/>
      <Dialog.Popup className="fixed left-1/2 top-1/2 z-[121] flex h-[min(560px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-line bg-white text-ink shadow-2xl outline-none">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line/70 p-5 sm:p-6">
          <div><Dialog.Title className="text-lg font-semibold tracking-tight">Settled token totals</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-5 text-ink/55">Gross amounts from verified payments, grouped by token and network.</Dialog.Description></div>
          <Dialog.Close aria-label="Close token totals" className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-ink/50 hover:bg-paper"><X size={17}/></Dialog.Close>
        </div>
        <div className="shrink-0 px-5 py-4 sm:px-6">
          <div className="relative"><Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40"/><input aria-label="Search settled tokens" placeholder="Search token, network or contract…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-xl border border-line bg-paper/30 pl-10 pr-11 text-base outline-none focus:border-green-deep sm:text-sm"/>{query && <button type="button" aria-label="Clear token search" onClick={() => setQuery("")} className="absolute right-1 top-1 grid size-10 place-items-center rounded-lg text-ink/45 hover:bg-paper"><X size={15}/></button>}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
          {matching.length ? <ul className="divide-y divide-line/60">{matching.map((total) => {
            const token = metadata(total.asset);
            return <li key={assetKey(total)} className="py-4 first:pt-1">
              <div className="flex items-center gap-3"><TokenLogo symbol={total.asset.symbol} icon={token?.icon} className="size-9"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{total.asset.symbol}</p><p className="mt-0.5 truncate text-[10px] text-ink/45">{total.networkId} · {token?.name ?? (total.asset.type === "native" ? "Native NEAR" : total.asset.contractId)}</p></div><p className="min-w-0 max-w-[45%] truncate text-right text-sm font-semibold tabular-nums">{formatUnitsDisplay(total.amount, total.asset.decimals)}</p></div>
              <p className="mt-2 break-all rounded-lg bg-paper/40 px-3 py-2 font-mono text-[11px] leading-5 text-ink/65"><span className="mr-2 font-sans text-[10px] text-ink/40">Exact</span>{formatAssetAmount(total.amount.toString(), total.asset)}</p>
            </li>;
          })}</ul> : <div className="py-12 text-center"><Search size={24} className="mx-auto text-ink/25"/><p className="mt-3 text-sm font-medium">No matching tokens</p><p className="mt-1 text-xs text-ink/45">Try a different symbol or network.</p></div>}
        </div>
        <p aria-live="polite" className="shrink-0 border-t border-line/70 bg-paper/25 px-5 py-3 text-[10px] text-ink/45 sm:px-6">{matching.length} of {totals.length} token totals · amounts remain in their original token</p>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

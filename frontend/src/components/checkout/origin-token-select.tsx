"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CryptoTokenIcon } from "@/components/atoms/crypto-icon";
import type { OneClickToken } from "@/lib/crosschain/types";

const CHAIN_LABELS: Record<string, string> = {
  eth: "Ethereum",
  base: "Base",
  arb: "Arbitrum",
  sol: "Solana",
  btc: "Bitcoin",
  near: "NEAR",
};

const TOKEN_NAMES: Record<string, string> = {
  ETH: "Ether",
  WETH: "Wrapped Ether",
  USDC: "USD Coin",
  USDT: "Tether USD",
  SOL: "Solana",
  BTC: "Bitcoin",
  WBTC: "Wrapped Bitcoin",
  DAI: "Dai Stablecoin",
  NEAR: "NEAR",
  WNEAR: "Wrapped NEAR",
  BRZ: "Brazilian Digital Token",
};

interface OriginTokenSelectProps {
  tokens: OneClickToken[];
  value: string;
  onChange: (assetId: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function OriginTokenSelect({
  tokens,
  value,
  onChange,
  disabled = false,
  className = "",
  placeholder = "Choose origin token",
}: OriginTokenSelectProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => tokens.find((token) => token.assetId === value) ?? null,
    [tokens, value]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter((token) => {
      const symbolMatch = token.symbol.toLowerCase().includes(needle);
      const chainName = CHAIN_LABELS[token.blockchain] ?? token.blockchain;
      const chainMatch = chainName.toLowerCase().includes(needle);
      const nameMatch = (TOKEN_NAMES[token.symbol] ?? "").toLowerCase().includes(needle);
      return symbolMatch || chainMatch || nameMatch;
    });
  }, [tokens, query]);

  return (
    <div className={`min-w-0 ${className}`}>
      <Combobox.Root items={tokens} filteredItems={filtered} value={selected} onValueChange={(token) => { if (token) onChange(token.assetId); }} onInputValueChange={setQuery} onOpenChange={(open) => { if (!open) setQuery(""); }} itemToStringLabel={(token) => token.symbol} isItemEqualToValue={(a, b) => a.assetId === b.assetId} disabled={disabled || tokens.length === 0} autoHighlight>
      {/* Trigger Button */}
      <Combobox.Trigger aria-label="Select origin token and network" className="group flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm transition hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-deep disabled:opacity-50 data-[popup-open]:border-green-deep">
        {selected ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <CryptoTokenIcon
              symbol={selected.symbol}
              blockchain={selected.blockchain}
              size={34}
            />
            <div className="flex min-w-0 flex-col gap-0.5 text-left">
              <span className="font-semibold text-ink text-sm tracking-tight">
                {selected.symbol}
              </span>

              <span className="text-xs font-medium text-ink/70 truncate">
                {CHAIN_LABELS[selected.blockchain] ?? selected.blockchain}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-mist text-xs font-medium">
            {tokens.length === 0 ? "Loading tokens…" : placeholder}
          </span>
        )}
        <div className="flex items-center gap-1 text-mist shrink-0">
          <ChevronDown size={16} className="transition-transform group-data-[popup-open]:rotate-180"/>
        </div>
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={8} align="start" collisionPadding={12} className="z-[110] outline-none">
        <Combobox.Popup initialFocus={searchInputRef} className="flex max-h-[min(420px,var(--available-height))] w-[min(360px,calc(100vw-24px))] min-w-[min(var(--anchor-width),calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-[0_16px_48px_rgba(11,15,14,.16)] outline-none">
          {/* Search Header */}
          <div className="shrink-0 border-b border-line/60 bg-paper/50 p-2">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-1.5 transition-all focus-within:border-ink/50 focus-within:ring-2 focus-within:ring-ink/5">
              <Search size={13} className="shrink-0 text-mist" />
              <Combobox.Input
                ref={searchInputRef}
                aria-label="Search tokens or networks"
                placeholder="Search token or chain…"
                className="h-10 w-full min-w-0 bg-transparent text-base sm:text-sm text-ink outline-none placeholder:text-mist"
              />
              {query && (
                <Combobox.Clear
                  className="shrink-0 text-mist hover:text-ink"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </Combobox.Clear>
              )}
            </div>
          </div>

          <p className="shrink-0 px-4 pt-3 pb-2 text-[10px] font-medium uppercase tracking-widest text-ink/50">Available tokens</p>
          <Combobox.List className="min-h-0 overflow-y-auto overscroll-contain p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <Combobox.Empty className="px-3 py-6 text-center text-xs text-mist">
                No matching tokens or networks
              </Combobox.Empty>
            ) : (
              filtered.map((token) => {
                const isSelected = token.assetId === value;
                const chainName = CHAIN_LABELS[token.blockchain] ?? token.blockchain;
                const tokenFullName = TOKEN_NAMES[token.symbol] ?? token.symbol;

                return (
                  <Combobox.Item key={token.assetId} value={token}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left outline-none data-[highlighted]:bg-paper transition-all ${
                        isSelected
                          ? "bg-paper font-medium border border-line/60"
                          : "hover:bg-paper/80 border border-transparent"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <CryptoTokenIcon
                          symbol={token.symbol}
                          blockchain={token.blockchain}
                          size={32}
                        />
                        <div className="flex flex-col min-w-0 text-left">
                          <span className="font-semibold text-sm text-ink leading-tight">
                            {token.symbol}
                          </span>
                          <span className="text-[11px] text-mist truncate leading-tight mt-0.5">
                            {tokenFullName} on {chainName}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-md bg-paper border border-line/60 px-1.5 py-0.5 font-mono text-[9px] uppercase font-semibold text-ink/70">
                          {chainName}
                        </span>
                        {isSelected && (
                          <Check
                            size={16}
                            className="text-green-deep stroke-[2.5] shrink-0"
                          />
                        )}
                      </div>
                  </Combobox.Item>
                );
              })
            )}
          </Combobox.List>
        </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}

"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    } else {
      setQuery("");
    }
  }, [open]);

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

  const toggle = () => {
    if (disabled || tokens.length === 0) return;
    setOpen((prev) => !prev);
  };

  return (
    <div ref={container} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select origin token and network"
        disabled={disabled || tokens.length === 0}
        onClick={toggle}
        className={`group flex h-11 w-full items-center justify-between gap-2.5 rounded-xl border bg-white px-3 text-xs transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-ink ring-2 ring-ink/10 shadow-sm"
            : "border-line hover:border-ink/40 hover:shadow-sm"
        }`}
      >
        {selected ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <CryptoTokenIcon
              symbol={selected.symbol}
              blockchain={selected.blockchain}
              size={26}
            />
            <div className="flex items-center gap-1.5 text-left truncate">
              <span className="font-semibold text-ink text-xs tracking-tight">
                {selected.symbol}
              </span>
              <span className="text-mist text-xs">·</span>
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
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${
              open ? "rotate-180 text-ink" : "group-hover:text-ink/80"
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-full min-w-[280px] sm:min-w-[320px] max-w-[360px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_48px_rgba(11,15,14,.14)] animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Search Header */}
          <div className="border-b border-line/60 bg-paper/50 p-2">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-1.5 transition-all focus-within:border-ink/50 focus-within:ring-2 focus-within:ring-ink/5">
              <Search size={13} className="shrink-0 text-mist" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search token or chain…"
                className="h-5 w-full bg-transparent text-xs text-ink outline-none placeholder:text-mist"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="shrink-0 text-mist hover:text-ink"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Tokens List */}
          <ul role="listbox" className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-mist">
                No matching tokens on this chain
              </li>
            ) : (
              filtered.map((token) => {
                const isSelected = token.assetId === value;
                const chainName = CHAIN_LABELS[token.blockchain] ?? token.blockchain;
                const tokenFullName = TOKEN_NAMES[token.symbol] ?? token.symbol;

                return (
                  <li key={token.assetId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(token.assetId);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
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
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OneClickToken } from "@/lib/crosschain/types";

const CHAIN_LABELS: Record<string, string> = {
  eth: "Ethereum",
  base: "Base",
  arb: "Arbitrum",
  sol: "Solana",
  btc: "Bitcoin",
  near: "NEAR",
};

const CHAIN_BADGE_STYLES: Record<string, string> = {
  eth: "bg-slate-100 text-slate-800 border-slate-200",
  base: "bg-blue-50 text-blue-700 border-blue-200/70",
  arb: "bg-sky-50 text-sky-700 border-sky-200/70",
  sol: "bg-purple-50 text-purple-700 border-purple-200/70",
  btc: "bg-amber-50 text-amber-800 border-amber-200/70",
  near: "bg-emerald-50 text-emerald-800 border-emerald-200/70",
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
  placeholder = "Choose a token",
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
      // Focus search input on open
      setTimeout(() => searchInputRef.current?.focus(), 50);
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
      return symbolMatch || chainMatch;
    });
  }, [tokens, query]);

  const toggle = () => {
    if (disabled || tokens.length === 0) return;
    setOpen((prev) => !prev);
  };

  return (
    <div ref={container} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select origin token"
        disabled={disabled || tokens.length === 0}
        onClick={toggle}
        className={`flex h-11 w-full items-center justify-between gap-2.5 rounded-xl border bg-white px-3.5 text-sm transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-ink ring-1 ring-ink/20 shadow-sm"
            : "border-line hover:border-ink/30"
        }`}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                CHAIN_BADGE_STYLES[selected.blockchain] ??
                "bg-paper text-ink/70 border-line"
              }`}
            >
              {CHAIN_LABELS[selected.blockchain] ?? selected.blockchain}
            </span>
            <span className="font-semibold text-ink">{selected.symbol}</span>
          </span>
        ) : (
          <span className="text-mist">
            {tokens.length === 0 ? "Loading tokens…" : placeholder}
          </span>
        )}
        <ChevronDown
          size={15}
          className={`shrink-0 text-mist transition-transform duration-200 ${
            open ? "rotate-180 text-ink" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_40px_rgba(11,15,14,.12)] animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="flex items-center gap-2 border-b border-line bg-paper/60 px-3 py-2">
            <Search size={13} className="shrink-0 text-mist" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search token or chain…"
              className="h-6 w-full bg-transparent text-xs text-ink outline-none placeholder:text-mist"
            />
          </div>

          <ul role="listbox" className="max-h-60 overflow-y-auto py-1.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-mist">
                No matching tokens found
              </li>
            ) : (
              filtered.map((token) => {
                const isSelected = token.assetId === value;
                const badgeStyle =
                  CHAIN_BADGE_STYLES[token.blockchain] ??
                  "bg-paper text-ink/70 border-line";
                const chainLabel =
                  CHAIN_LABELS[token.blockchain] ?? token.blockchain;

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
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs transition hover:bg-paper ${
                        isSelected ? "bg-paper/80 font-medium" : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`w-20 shrink-0 rounded-md border px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold uppercase tracking-wider ${badgeStyle}`}
                        >
                          {chainLabel}
                        </span>
                        <span className="font-medium text-ink">{token.symbol}</span>
                      </span>
                      {isSelected && (
                        <Check size={14} className="shrink-0 text-green-deep" />
                      )}
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

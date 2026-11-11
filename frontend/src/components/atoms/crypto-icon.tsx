"use client";

import { useId } from "react";

export type SupportedTokenSymbol =
  | "ETH"
  | "WETH"
  | "USDC"
  | "USDT"
  | "SOL"
  | "BTC"
  | "WBTC"
  | "DAI"
  | "NEAR"
  | "WNEAR"
  | "BRZ"
  | string;

export type SupportedBlockchain =
  | "eth"
  | "base"
  | "arb"
  | "sol"
  | "btc"
  | "near"
  | string;

export function ChainBadgeIcon({
  blockchain,
  className = "size-3.5",
}: {
  blockchain: string;
  className?: string;
}) {
  const norm = blockchain.toLowerCase().trim();
  switch (norm) {
    case "base":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-label="Base">
          <circle cx="8" cy="8" r="8" fill="#0052FF" />
          <circle cx="8" cy="8" r="4.2" fill="#FFFFFF" />
        </svg>
      );
    case "arb":
    case "arbitrum":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-label="Arbitrum">
          <circle cx="8" cy="8" r="8" fill="#12AAFF" />
          <path d="M8 3.5l3.5 6-1.2 2L8 7.5 5.7 11.5 4.5 9.5 8 3.5z" fill="#FFFFFF" />
          <path d="M8 8.8l1.8 3.2H6.2L8 8.8z" fill="#FFFFFF" />
        </svg>
      );
    case "eth":
    case "ethereum":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-label="Ethereum">
          <circle cx="8" cy="8" r="8" fill="#627EEA" />
          <path d="M8 3v4.2l3.5 1.6L8 3z" fill="#FFFFFF" fillOpacity="0.6" />
          <path d="M8 3L4.5 8.8 8 7.2V3z" fill="#FFFFFF" />
          <path d="M8 10.4v2.8l3.5-2-3.5-.8z" fill="#FFFFFF" fillOpacity="0.6" />
          <path d="M8 13.2v-2.8L4.5 11.2l3.5 2z" fill="#FFFFFF" />
        </svg>
      );
    case "sol":
    case "solana":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-label="Solana">
          <circle cx="8" cy="8" r="8" fill="#18181B" />
          <path d="M4.5 5.8h5.8c.2 0 .4-.1.5-.2l.8-.9c.2-.2 0-.5-.3-.5H5.5c-.2 0-.4.1-.5.2l-.8.9c-.2.2 0 .5.3.5z" fill="#00FFA3" />
          <path d="M11.5 7.5H5.7c-.2 0-.4.1-.5.2l-.8.9c-.2.2 0 .5.3.5h5.8c.2 0 .4-.1.5-.2l.8-.9c.2-.2 0-.5-.3-.5z" fill="#DC1FFF" />
          <path d="M4.5 11.2h5.8c.2 0 .4-.1.5-.2l.8-.9c.2-.2 0-.5-.3-.5H5.5c-.2 0-.4.1-.5.2l-.8.9c-.2.2 0 .5.3.5z" fill="#00FFA3" />
        </svg>
      );
    case "btc":
    case "bitcoin":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-label="Bitcoin">
          <circle cx="8" cy="8" r="8" fill="#F7931A" />
          <path d="M11.2 7c.2-1-.6-1.6-1.7-2l.4-1.4-.9-.2-.4 1.4c-.2 0-.5-.1-.7-.2l.4-1.4-.9-.2-.4 1.4-.6-.1-1.2-.3-.2.9s.5.1.5.2c.3 0 .4.2.3.4l-.9 3.5c0 .1-.2.2-.3.1 0 0-.5-.1-.5-.1l-.4 1 1.1.3c.2 0 .4.1.6.2l-.4 1.4.9.2.4-1.4c.3 0 .5.1.7.2l-.4 1.4.9.2.4-1.4c1.5.3 2.6.2 3-1.2.4-1.1 0-1.7-.8-2.1.6-.2 1-.6 1.1-1.4zm-2 2.8c-.3 1.1-2 .5-2.6.4l.5-1.9c.6.1 2.4.4 2.1 1.5zm.3-2.8c-.3 1-1.8.5-2.2.4l.4-1.7c.5.1 2.1.4 1.8 1.3z" fill="#FFFFFF" />
        </svg>
      );
    case "near":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-label="NEAR">
          <circle cx="8" cy="8" r="8" fill="#000000" />
          <path d="M11 4.2c-.4-.3-.9-.3-1.2 0l-4.5 3.4c-.2.2-.3.4-.3.7v3.6c0 .2.3.3.4.2l4.6-3.4c.4-.3.9-.3 1.2 0l.9.6c.2.2.5 0 .5-.3V4.9c0-.3-.1-.5-.4-.7l-1.2-.7v.7z" fill="#FFFFFF" />
          <path d="M10.8 8.8L6.2 12.2c-.4.3-.9.3-1.2 0l-.9-.6c-.2-.2-.5 0-.5.3v4.2c0 .3.2.5.4.6l1.1.8c.4.3.9.3 1.2 0l4.6-3.4c.2-.2.3-.4.3-.7v-3.6c0-.2-.3-.3-.4-.2z" fill="#00EC97" />
        </svg>
      );
    default:
      return null;
  }
}

export function TokenSvg({
  symbol,
  className = "size-8",
}: {
  symbol: string;
  className?: string;
}) {
  const norm = symbol.toUpperCase().trim().replace(/\.E$/, "");
  const id = useId();

  if (norm === "ETH" || norm === "WETH") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label={symbol}>
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <g fill="#FFFFFF" fillRule="nonzero">
          <path fillOpacity="0.602" d="M16.498 4v8.87l7.497 3.35z" />
          <path d="M16.498 4L9 16.22l7.498-3.35z" />
          <path fillOpacity="0.602" d="M16.498 21.968v6.027L24 17.616z" />
          <path d="M16.498 27.995v-6.028L9 17.616z" />
          <path fillOpacity="0.2" d="M16.498 20.573l7.497-4.353-7.497-3.348z" />
          <path fillOpacity="0.602" d="M9 16.22l7.498 4.353v-7.701z" />
        </g>
      </svg>
    );
  }

  if (norm === "USDC") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="USDC">
        <circle cx="16" cy="16" r="16" fill="#2775CA" />
        <path
          d="M20.2 17.5c0-1.8-1.1-2.4-3.2-2.7-1.5-.2-1.8-.6-1.8-1.3 0-.8.7-1.3 1.9-1.3 1.1 0 1.8.4 2.1 1.2.1.2.3.3.5.3h1c.3 0 .5-.2.5-.5-.4-1.3-1.6-2.2-3.1-2.4V9.3c0-.3-.2-.5-.5-.5h-1.1c-.3 0-.5.2-.5.5v1.4c-1.8.3-3 1.5-3 3.1 0 1.9 1.2 2.5 3.3 2.8 1.4.3 1.7.7 1.7 1.4 0 .9-.8 1.5-2.1 1.5-1.5 0-2.2-.6-2.5-1.5 0-.2-.2-.3-.4-.3h-1.2c-.3 0-.5.2-.5.5.4 1.5 1.7 2.6 3.6 2.8v1.5c0 .3.2.5.5.5h1.1c.3 0 .5-.2.5-.5v-1.5c1.9-.3 3.3-1.6 3.3-3.5z"
          fill="#FFFFFF"
        />
        <path
          d="M12.5 6.2c-5.4 2-8.2 8-6.2 13.4 2 5.4 8 8.2 13.4 6.2 5.4-2 8.2-8 6.2-13.4-2-5.4-8-8.2-13.4-6.2zm11.9 15.6c-4.4 4.4-11.4 4.4-15.8 0-4.4-4.4-4.4-11.4 0-15.8 4.4-4.4 11.4-4.4 15.8 0 4.4 4.4 4.4 11.4 0 15.8z"
          fill="#FFFFFF"
          fillOpacity="0.25"
        />
      </svg>
    );
  }

  if (norm === "USDT") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="USDT">
        <circle cx="16" cy="16" r="16" fill="#26A17B" />
        <path
          d="M17.8 14.5v-2.3h5V9h-13.6v3.2h5v2.3c-4.1.2-7.2 1-7.2 2s3.1 1.8 7.2 2v6.6h3.6V18.5c4.1-.2 7.2-1 7.2-2s-3.1-1.8-7.2-2zm0 3.1v-.1c-2.4.1-4.7.1-6.2 0 1.1-.5 3.4-.7 6.2-.7s5.1.2 6.2.7c-1.5.1-3.8.1-6.2.1z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (norm === "SOL") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="SOL">
        <circle cx="16" cy="16" r="16" fill="#09090B" />
        <defs>
          <linearGradient id={`${id}-g1`} x1="23.5" y1="9" x2="8.5" y2="13.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <linearGradient id={`${id}-g2`} x1="23.5" y1="14" x2="8.5" y2="18.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
          <linearGradient id={`${id}-g3`} x1="23.5" y1="19" x2="8.5" y2="23.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00FFA3" />
            <stop offset="1" stopColor="#DC1FFF" />
          </linearGradient>
        </defs>
        <path d="M9.5 12.8h10.9c.4 0 .7-.2.9-.4l2-2.1c.4-.4.1-1.1-.4-1.1H12c-.4 0-.7.2-.9.4l-2 2.1c-.4.4-.1 1.1.4 1.1z" fill={`url(#${id}-g1)`} />
        <path d="M22.5 14h-10.9c-.4 0-.7.2-.9.4l-2 2.1c-.4.4-.1 1.1.4 1.1H20c.4 0 .7-.2.9-.4l2-2.1c.4-.4.1-1.1-.4-1.1z" fill={`url(#${id}-g2)`} />
        <path d="M9.5 22.8h10.9c.4 0 .7-.2.9-.4l2-2.1c.4-.4.1-1.1-.4-1.1H12c-.4 0-.7.2-.9.4l-2 2.1c-.4.4-.1 1.1.4 1.1z" fill={`url(#${id}-g3)`} />
      </svg>
    );
  }

  if (norm === "BTC" || norm === "WBTC") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label={symbol}>
        <circle cx="16" cy="16" r="16" fill="#F7931A" />
        <path
          d="M22.2 13.7c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6c-.4-.1-.9-.2-1.4-.3l.7-2.6-1.7-.4-.7 2.7c-.4-.1-.7-.2-1.1-.2l-2.3-.6-.5 1.8s1 .2 1 .3c.5.1.7.4.7.7l-1.7 6.8c-.1.2-.3.4-.6.3 0 0-1-.3-1-.3l-.8 1.9 2.2.6c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.7c.5.1.9.2 1.4.3l-.7 2.7 1.7.4.7-2.8c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.4c-.5 2.1-4 1-5.1.7l.9-3.7c1.1.3 4.7.8 4.2 3zm.5-5.5c-.5 1.9-3.4.9-4.3.7l.8-3.3c.9.2 3.9.7 3.5 2.6z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (norm === "DAI") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="DAI">
        <circle cx="16" cy="16" r="16" fill="#F5AC37" />
        <path d="M10 9h6.2c3.5 0 6.3 2.7 6.3 7s-2.8 7-6.3 7H10V9zm6.1 12c2.4 0 4.2-1.9 4.2-5s-1.8-5-4.2-5h-4v10h4z" fill="#FFFFFF" />
        <path d="M8 13.5h16v1.5H8zM8 17h16v1.5H8z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (norm === "NEAR" || norm === "WNEAR") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label={symbol}>
        <circle cx="16" cy="16" r="16" fill="#000000" />
        <path d="M22.1 8.2c-.7-.5-1.7-.5-2.4 0L10.5 15c-.4.3-.6.8-.6 1.3v7.2c0 .4.5.6.8.3l9.2-6.8c.7-.5 1.7-.5 2.4 0l1.8 1.3c.4.3.9 0 .9-.5V9.5c0-.5-.2-1-.7-1.3l-2.2-1.5v1.5z" fill="#FFFFFF" />
        <path d="M21.5 17.5L12.3 24.3c-.7.5-1.7.5-2.4 0l-1.8-1.3c-.4-.3-.9 0-.9.5v8.3c0 .5.3.9.7 1.2l2.2 1.5c.7.5 1.7.5 2.4 0l9.2-6.8c.4-.3.6-.8.6-1.3v-7.2c0-.4-.5-.6-.8-.3z" fill="#00EC97" />
      </svg>
    );
  }

  if (norm === "BRZ") {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="BRZ">
        <circle cx="16" cy="16" r="16" fill="#009B3A" />
        <path d="M16 8l8 8-8 8-8-8 8-8z" fill="#FEDF00" />
        <circle cx="16" cy="16" r="4.5" fill="#002776" />
      </svg>
    );
  }

  // Fallback generic crypto token avatar
  return (
    <div className={`grid place-items-center rounded-full bg-paper border border-line font-mono font-bold text-ink/70 ${className}`}>
      {symbol.slice(0, 3)}
    </div>
  );
}

/**
 * Combined Token Icon with official Chain Sub-Badge on bottom-right.
 */
export function CryptoTokenIcon({
  symbol,
  blockchain,
  size = 32,
  className = "",
}: {
  symbol: string;
  blockchain?: string;
  size?: number;
  className?: string;
}) {
  const badgeSize = Math.max(12, Math.round(size * 0.42));

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <TokenSvg symbol={symbol} className="h-full w-full rounded-full shadow-sm" />
      {blockchain && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <ChainBadgeIcon blockchain={blockchain} className="h-full w-full" />
        </span>
      )}
    </div>
  );
}


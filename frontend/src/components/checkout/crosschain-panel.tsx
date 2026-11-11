"use client";

import { ArrowRight, Check, Coins, LoaderCircle, RefreshCcw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { OriginTokenSelect } from "@/components/checkout/origin-token-select";
import { nearApi } from "@/lib/near/api";
import { formatAssetAmount } from "@/lib/near/tokens";
import { discoverEvmWallets, connectEvmWallet } from "@/lib/crosschain/evm";
import { connectSolanaWallet } from "@/lib/crosschain/solana";
import type { AttemptStatus, CrossChainWallet, OneClickAttempt, OneClickQuote, OneClickToken } from "@/lib/crosschain/types";
import type { PaymentLink } from "@/lib/near/types";

type PanelState = "choose" | "quoted" | "depositing" | "processing" | "settled" | "closed";

interface EvmOption {
  name: string;
  connect(): Promise<CrossChainWallet>;
}

const BLOCKCHAIN_LABELS: Record<string, string> = { eth: "Ethereum", base: "Base", arb: "Arbitrum", sol: "Solana" };

function originAssetOf(token: OneClickToken): NearAssetLike {
  return { type: "nep141", contractId: token.contractAddress, symbol: token.symbol, decimals: token.decimals };
}

type NearAssetLike = { type: "nep141"; contractId: string; symbol: string; decimals: number };

export function CrossChainPanel({ slug, link, onSettled }: { slug: string; link: PaymentLink; onSettled: (orderId: string, merchantId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<OneClickToken[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [wallet, setWallet] = useState<CrossChainWallet | null>(null);
  const [evmOptions, setEvmOptions] = useState<EvmOption[]>([]);
  const [quote, setQuote] = useState<OneClickQuote | null>(null);
  const [attempt, setAttempt] = useState<OneClickAttempt | null>(null);
  const [status, setStatus] = useState<AttemptStatus | null>(null);
  const [minutesLeft, setMinutesLeft] = useState(0);
  const [state, setState] = useState<PanelState>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const loadTokens = useCallback(async () => {
    setError(null);
    try {
      const response = await nearApi.oneclickTokens();
      setTokens(response.tokens);
      setMode(response.mode);
      const options = await discoverEvmWallets();
      setEvmOptions(options.map((option) => ({ name: option.info.name, connect: () => connectEvmWallet(option) })));
      loaded.current = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cross-chain payments are unavailable right now.");
    }
  }, []);

  useEffect(() => {
    if (open && !loaded.current) void loadTokens();
  }, [open, loadTokens]);

  useEffect(() => {
    if (state !== "processing" || !attempt) return;
    const tick = async () => {
      try {
        const current = await nearApi.oneclickAttempt(attempt.attemptId);
        setStatus(current);
        if (current.status === "SETTLED" && current.orderState === "SETTLED") {
          setState("settled");
          onSettled(attempt.orderId, attempt.merchantId);
        } else if (["REFUNDED", "FAILED", "EXPIRED"].includes(current.status)) {
          setState("closed");
          setError(current.failureReason ?? `The cross-chain payment ended as ${current.status.toLowerCase().replaceAll("_", " ")}.`);
        } else if (current.status === "INCOMPLETE_DEPOSIT") {
          setState("closed");
          setError(current.failureReason ?? "The deposit was less than the quoted amount. The order needs manual attention; do not start a new payment for the same receipt.");
        }
      } catch {
        // transient RPC or network failure; the next poll retries
      }
    };
    void tick();
    const interval = window.setInterval(() => void tick(), 4000);
    return () => window.clearInterval(interval);
  }, [state, attempt, onSettled]);

  const connect = async (connectWallet: () => Promise<CrossChainWallet>) => {
    setError(null);
    try {
      setWallet(await connectWallet());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cross-chain payment failed.");
    } finally {
      setBusy(false);
    }
  };

  const getQuote = () => run(async () => {
    if (!wallet || !selected) return;
    const result = await nearApi.oneclickQuote(slug, { originAsset: selected, refundTo: wallet.address });
    setQuote(result);
    setState("quoted");
  });

  const startPayment = () => run(async () => {
    if (!wallet || !selected) return;
    const created = await nearApi.oneclickCreateAttempt(slug, { originAsset: selected, refundTo: wallet.address });
    setAttempt(created);
    setMinutesLeft(Math.max(0, Math.round((created.deadlineSeconds - Date.now() / 1000) / 60)));
    setState("depositing");
  });

  const origin = tokens.find((token) => token.assetId === selected) ?? null;

  const originTokens = useMemo(() => {
    return tokens.filter((token) => {
      // Exclude tokens on NEAR, as this panel is for paying from external chains into NEAR
      if (token.blockchain === "near") return false;
      if (!wallet) {
        return ["eth", "base", "arb", "sol"].includes(token.blockchain);
      }
      if (wallet.kind === "evm") {
        return ["eth", "base", "arb"].includes(token.blockchain);
      }
      if (wallet.kind === "solana") {
        return token.blockchain === "sol";
      }
      return false;
    });
  }, [tokens, wallet]);

  useEffect(() => {
    if (originTokens.length === 0) {
      if (selected) setSelected("");
      return;
    }
    const isValid = originTokens.some((t) => t.assetId === selected);
    if (!isValid) {
      setSelected(originTokens[0].assetId);
    }
  }, [originTokens, selected]);

  const sendDeposit = () => run(async () => {
    if (!wallet || !attempt || !origin) return;
    const txHash = attempt.simulated
      ? `0xsim-${attempt.attemptId}`
      : await wallet.sendTransfer({ depositAddress: attempt.depositAddress, amountRaw: attempt.amountIn, origin, sender: wallet.address });
    const submitted = await nearApi.oneclickSubmitDeposit(attempt.attemptId, txHash);
    setStatus({ attemptId: attempt.attemptId, status: submitted.status as AttemptStatus["status"], orderState: submitted.orderState, txHash, failureReason: null, simulated: submitted.simulated });
    setState("processing");
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-xs font-medium text-ink transition hover:border-ink/30">
        <Coins size={15} className="text-green-deep" />
        Pay with another chain
        <ArrowRight size={14} />
      </button>
    );
  }

  return (
    <section className="mt-3 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Coins size={14} className="text-green-deep" />
          <MonoLabel>Pay with another chain</MonoLabel>
        </div>
        {mode === "mock" && <span className="rounded-full border border-amber-500/30 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber-800">Simulated settlement</span>}
        {mode === "live" && <span className="rounded-full border border-alert/20 bg-alert/5 px-2 py-0.5 text-[10px] font-medium text-alert">Mainnet · live</span>}
      </div>
      <p className="mt-2 text-xs leading-5 text-mist">
        {mode === "mock"
          ? "Sandbox mode: the swap runs locally with fake money so you can try the full flow. Nothing is broadcast to any chain."
          : `A NEAR Intents swap pays the merchant on NEAR from ${link.networkId}. Refunds go back to your wallet if the swap fails.`}
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{error}</p>}
      {state === "choose" && (
        <>
          {!wallet ? (
            <>
              <label className="mt-4 block text-xs font-medium">Origin token</label>
              <div className="mt-2">
                <OriginTokenSelect
                  tokens={originTokens}
                  value={selected}
                  onChange={setSelected}
                  disabled={busy}
                />
              </div>
              <p className="mt-4 text-xs font-medium">Connect a wallet</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {evmOptions.map((option) => <button key={option.name} onClick={() => void connect(option.connect)} disabled={busy} className="flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-xs font-medium transition hover:border-ink/30 disabled:opacity-50"><WalletCards size={14} />{option.name}</button>)}
                <button onClick={() => void connect(connectSolanaWallet)} disabled={busy} className="flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-xs font-medium transition hover:border-ink/30 disabled:opacity-50"><WalletCards size={14} />Phantom (Solana)</button>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-xl bg-paper p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-mist">{wallet.name} · {wallet.kind === "evm" ? "EVM" : "Solana"}</span>
                <span className="break-all font-mono text-[11px]">{wallet.address}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <OriginTokenSelect
                  tokens={originTokens}
                  value={selected}
                  onChange={setSelected}
                  disabled={busy}
                  className="flex-1"
                />
                <button onClick={() => void getQuote()} disabled={busy || !selected} className="flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-xs font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCcw size={14} />}Get quote</button>
              </div>
            </div>
          )}
        </>
      )}
      {state === "quoted" && quote && wallet && (
        <div className="mt-4 rounded-xl bg-paper p-4">
          <div className="flex justify-between gap-3 text-xs"><span className="text-mist">You send</span><span className="font-mono">≈ {formatAssetAmount(quote.amountIn, originAssetOf(origin!))} {origin?.symbol}</span></div>
          <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Minimum accepted</span><span className="font-mono">{formatAssetAmount(quote.minAmountIn, originAssetOf(origin!))} {origin?.symbol}</span></div>
          <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Merchant receives</span><span className="font-mono">{formatAssetAmount(quote.amountOut, link.asset)} {link.asset.symbol} on NEAR</span></div>
          <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Estimated time</span><span className="font-mono">~{quote.timeEstimateSeconds}s</span></div>
          <button onClick={() => void startPayment()} disabled={busy} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={14} />}Start cross-chain payment</button>
          <button onClick={() => { setState("choose"); setQuote(null); }} className="mt-2 w-full text-center text-[11px] text-mist underline">Back</button>
        </div>
      )}
      {attempt && (state === "depositing" || state === "processing" || state === "closed" || state === "settled") && (
        <div className="mt-4 rounded-xl bg-paper p-4">
          <p className="font-mono text-[10px] uppercase tracking-[.12em] text-mist">Deposit address</p>
          <p className="mt-1 break-all font-mono text-xs">{attempt.depositAddress}</p>
          <p className="mt-2 text-xs leading-5 text-ink/70">Send exactly {formatAssetAmount(attempt.amountIn, originAssetOf(origin!))} {origin?.symbol} to this address within {minutesLeft} minutes. If the swap fails, funds are refunded to your wallet.</p>
          {state === "depositing" && (
            attempt.simulated
              ? <button onClick={() => void sendDeposit()} disabled={busy} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={14} />}Simulate deposit</button>
              : <button onClick={() => void sendDeposit()} disabled={busy} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <WalletCards size={15} />}Send {origin?.symbol} from {wallet?.name}</button>
          )}
          {state === "processing" && (
            <div className="mt-3 rounded-xl border border-amber/40 bg-amber/10 p-3">
              <div className="flex items-center gap-2 text-amber-800"><LoaderCircle size={15} className="animate-spin" /><p className="text-xs font-medium">{status?.status.replaceAll("_", " ") ?? "PENDING DEPOSIT"}</p></div>
              <p className="mt-2 text-xs leading-5 text-ink/60">We are waiting for the swap to settle on NEAR. You can leave this page; the deposit address is tied to this order.</p>
            </div>
          )}
          {state === "settled" && <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-deep/20 bg-green-deep/5 p-3 text-xs font-medium text-green-deep"><Check size={15} />Cross-chain payment settled on NEAR.</div>}
          {(state === "closed" || state === "settled") && <button onClick={() => { setOpen(false); setState("choose"); setAttempt(null); setQuote(null); setStatus(null); }} className="mt-3 w-full text-center text-[11px] text-mist underline">Close</button>}
        </div>
      )}
    </section>
  );
}

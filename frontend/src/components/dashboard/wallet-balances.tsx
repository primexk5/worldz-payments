"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import { TokenLogo } from "@/components/atoms/token-logo";
import { nearApi } from "@/lib/near/api";
import { NEAR_EXPLORER_URL, NEAR_NATIVE_ASSET, NEAR_NETWORK_ID } from "@/lib/near/config";
import { formatUnitsExact } from "@/lib/near/amounts";
import { getFungibleTokenBalance, getNativeNearBalance } from "@/lib/near/tokens";
import type { NearAsset } from "@/lib/near/types";

type BalanceRow = { key: string; name: string; asset: NearAsset; icon?: string | null; amount: string | null; error: string | null };
type Snapshot = { accountId: string | null; rows: BalanceRow[]; loading: boolean; tokenError: string | null; checkedAt: number | null };
const initial: Snapshot = { accountId: null, rows: [], loading: false, tokenError: null, checkedAt: null };

function BalanceAmount({ amount, asset }: { amount: string; asset: NearAsset }) {
  const exact = formatUnitsExact(amount, asset.decimals);
  const shortened = formatUnitsExact(amount, asset.decimals, 6);
  const shortenedDisplay = exact !== shortened;
  const display = !shortenedDisplay ? exact : shortened === "0" ? "<0.000001" : `≈ ${shortened}`;
  return <>
    <p className="break-all font-mono text-2xl font-medium leading-8 tracking-tight" title={`${exact} ${asset.symbol}`}>{display}</p>
    {shortenedDisplay && <details className="mt-1 text-ink/45"><summary className="min-h-8 py-1 text-[10px] underline underline-offset-4">Exact balance</summary><p className="break-all font-mono text-xs leading-5">{exact} {asset.symbol}</p></details>}
  </>;
}

export function WalletBalances({ payoutAccountId, loadingAccount = false }: { payoutAccountId: string | null; loadingAccount?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!payoutAccountId) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    const native: BalanceRow = { key: "native", name: "NEAR", asset: NEAR_NATIVE_ASSET, amount: null, error: null };
    const update = (change: (current: Snapshot) => Snapshot) => { if (active) setSnapshot(change); };
    update(() => ({ accountId: payoutAccountId, rows: [native], loading: true, tokenError: null, checkedAt: null }));

    const read = async (row: BalanceRow) => {
      try {
        const amount = row.asset.type === "native"
          ? await getNativeNearBalance(payoutAccountId, controller.signal)
          : await getFungibleTokenBalance(row.asset.contractId, payoutAccountId, controller.signal);
        if (typeof amount !== "string" || !/^\d+$/.test(amount)) throw new Error("Invalid token balance.");
        update(current => ({ ...current, rows: current.rows.map(item => item.key === row.key ? { ...item, amount, error: null } : item) }));
      } catch {
        update(current => ({ ...current, rows: current.rows.map(item => item.key === row.key ? { ...item, amount: null, error: "Could not read this balance. Try refreshing." } : item) }));
      }
    };
    const nativeRequest = read(native);
    const tokenRequest = (async () => {
      try {
        const { tokens } = await nearApi.allowedAssets(controller.signal);
        if (!active) return;
        const unique = [...new Map(tokens.map(token => [token.contractId, token])).values()];
        const rows: BalanceRow[] = unique.map(token => ({ key: token.contractId, name: token.name, icon: token.icon, asset: { type: "nep141", contractId: token.contractId, symbol: token.symbol, decimals: token.decimals }, amount: null, error: null }));
        update(current => ({ ...current, rows: [...current.rows, ...rows] }));
        await Promise.all(rows.map(read));
      } catch {
        update(current => ({ ...current, tokenError: "Could not load the supported token list. Refresh to check all token balances." }));
      }
    })();
    void Promise.all([nativeRequest, tokenRequest]).finally(() => {
      window.clearTimeout(timeout);
      update(current => ({ ...current, loading: false, checkedAt: Date.now() }));
    });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [payoutAccountId, refresh]);

  // A changed payout account must never display the previous account's holdings.
  const current = snapshot.accountId === payoutAccountId ? snapshot : initial;
  const loading = loadingAccount || !!payoutAccountId && (current.loading || current.accountId !== payoutAccountId);
  const failed = current.rows.filter(row => row.error).length;

  return <section aria-label="Payout wallet balances" aria-busy={loading} className="overflow-hidden rounded-[22px] border border-line bg-white">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line/65 p-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-vault text-signal"><WalletCards size={20}/></span><div className="min-w-0"><h2 className="text-base font-semibold tracking-tight">Your token balances</h2><p className="mt-1 text-xs leading-6 text-ink/50">Current holdings in your payout wallet.</p>{payoutAccountId && <a href={`${NEAR_EXPLORER_URL}/address/${encodeURIComponent(payoutAccountId)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-8 max-w-full items-center gap-1.5 text-xs text-vault hover:underline"><span className="min-w-0 break-all font-mono">{payoutAccountId}</span><ArrowUpRight size={12} className="shrink-0"/></a>}</div></div>
      <div className="flex items-center gap-2"><span className="rounded-full border border-line bg-paper/40 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-ink/50">{NEAR_NETWORK_ID}</span><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading || !payoutAccountId} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-xs font-medium text-ink/65 transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40" aria-label="Refresh token balances"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/><span>{loading ? "Checking…" : "Refresh"}</span></button></div>
    </header>
    <div className="p-5 sm:p-6">
      {!payoutAccountId ? <p role="status" className="rounded-xl bg-paper/40 p-4 text-xs leading-6 text-ink/50">{loadingAccount ? "Loading your payout wallet…" : "Set up your merchant payout wallet to view token balances here."}</p> : <>
        {current.tokenError && <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-6 text-alert"><AlertCircle size={15} className="mt-1 shrink-0"/>{current.tokenError}</p>}
        <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{current.rows.map(row => <li key={row.key} data-token={row.key} className="min-w-0 rounded-2xl border border-line/75 bg-paper/20 p-4 sm:p-5">
          <div className="flex items-center gap-3"><TokenLogo symbol={row.asset.symbol} icon={row.icon} className="size-10"/><div className="min-w-0"><h3 className="text-sm font-semibold">{row.asset.symbol}</h3><p className="mt-1 truncate text-[10px] text-ink/45" title={row.name}>{row.asset.type === "native" ? "Native token" : row.name}</p></div></div>
          <div className="mt-5 min-h-9">{row.error ? <p className="flex items-center gap-1.5 text-sm font-medium text-alert"><AlertCircle size={14}/>Unavailable</p> : row.amount === null ? <p role="status" className="flex items-center gap-2 text-xs text-ink/45"><LoaderCircle size={14} className="animate-spin"/>Reading balance…</p> : <BalanceAmount amount={row.amount} asset={row.asset}/>}</div>
          {row.error ? <p className="mt-2 text-[10px] leading-5 text-ink/45">{row.error}</p> : row.amount !== null && <p className="mt-2 flex items-center gap-1 text-[10px] text-ink/40"><Check size={11} className="text-green-deep"/>On-chain balance</p>}
        </li>)}</ul>
        {!current.rows.length && loading && <p role="status" className="py-6 text-xs text-ink/45">Loading token balances…</p>}
      </>}
    </div>
    {payoutAccountId && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 bg-paper/15 px-5 py-4 text-[10px] leading-5 text-ink/45 sm:px-6"><p>Includes all wallet transfers. Each asset is shown separately.</p><p aria-live="polite">{loading ? "Checking balances…" : current.checkedAt ? `${failed || current.tokenError ? "Checked" : "Updated"} ${new Date(current.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}${failed ? ` · ${failed} unavailable` : ""}` : ""}</p></footer>}
  </section>;
}

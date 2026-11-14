"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, ArrowUpRight, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Clock3, CreditCard, Link2, RefreshCw, Search, X } from "lucide-react";
import { MonoLabel } from "@/components/atoms/mono-label";
import { TokenLogo } from "@/components/atoms/token-logo";
import { ChoiceSelect, type SelectOption } from "@/components/molecules/choice-select";
import { NearReceipt } from "@/components/checkout/near-receipt";
import { nearApi } from "@/lib/near/api";
import { NEAR_EXPLORER_URL } from "@/lib/near/config";
import { WebhookDeliveryStatus } from "@/components/dashboard/webhook-delivery";
import { SettledVolumeCard } from "@/components/dashboard/settled-volume-card";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { AllowedFungibleToken, DashboardDelivery, OrderState } from "@/lib/near/types";
import { isVerifiedSettlement } from "@/lib/near/order-state";

const filters = ["ALL", "OPEN", "PROCESSING", "SETTLED", "PAYOUT_RETRYABLE", "PARTIAL_PAYOUT", "REFUND_PENDING", "REFUNDED", "EXPIRED", "CANCELLED", "RECONCILIATION_REQUIRED"] as const;
type Filter = typeof filters[number];
const pageSize = 10;
const labels: Record<Filter, string> = { ALL: "All statuses", OPEN: "Open", PROCESSING: "Processing", SETTLED: "Settled", PAYOUT_RETRYABLE: "Payout retryable", PARTIAL_PAYOUT: "Partial payout", REFUND_PENDING: "Refund pending", REFUNDED: "Refunded", EXPIRED: "Expired", CANCELLED: "Cancelled", RECONCILIATION_REQUIRED: "Needs reconciliation" };
const needsAttention = (state: OrderState) => ["PAYOUT_RETRYABLE", "PARTIAL_PAYOUT", "RECONCILIATION_REQUIRED"].includes(state);
function displayState(payment: DashboardDelivery): OrderState {
  return payment.state === "SETTLED" && !isVerifiedSettlement(payment) ? "RECONCILIATION_REQUIRED" : payment.state;
}
function Status({ state }: { state: OrderState }) {
  const style = state === "SETTLED" ? "bg-green-deep/10 text-vault" : needsAttention(state) ? "bg-alert/10 text-alert" : state === "PROCESSING" || state === "REFUND_PENDING" ? "bg-amber/15 text-amber-800" : "bg-ink/5 text-ink/55";
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-medium ${style}`}><span className="size-1.5 shrink-0 rounded-full bg-current"/>{labels[state]}</span>;
}

export default function PaymentsPage() {
  const [deliveries, setDeliveries] = useState<DashboardDelivery[]>([]);
  const [tokens, setTokens] = useState<AllowedFungibleToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void nearApi.deliveries().then(response => { if (active) setDeliveries(response.deliveries); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load payments."); }).finally(() => { if (active) setLoading(false); });
    void nearApi.allowedAssets().then(response => { if (active) setTokens(response.tokens); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const refresh = async () => {
    setRefreshing(true); setError(null);
    try { setDeliveries((await nearApi.deliveries()).deliveries); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh payments."); }
    finally { setRefreshing(false); }
  };
  const retryWebhook = async (eventId: string) => {
    setRetryingEventId(eventId); setError(null);
    try { await nearApi.retryWebhook(eventId); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry webhook."); }
    finally { setRetryingEventId(null); }
  };
  const filtered = useMemo(() => deliveries.filter(payment => {
    if (filter !== "ALL" && displayState(payment) !== filter) return false;
    const term = query.trim().toLowerCase();
    return !term || [payment.orderId, payment.payerAccountId, payment.transactionHash, payment.merchantReference, payment.paymentDescription, payment.customerName].some(value => value?.toLowerCase().includes(term));
  }).sort((a, b) => b.timestampMs - a.timestampMs), [deliveries, filter, query]);
  const summary = useMemo(() => {
    const settled = deliveries.filter(isVerifiedSettlement);
    const totals = new Map<string, { amount: bigint; asset: DashboardDelivery["asset"]; networkId: DashboardDelivery["networkId"] }>();
    for (const payment of settled) {
      const key = `${payment.networkId}:${payment.asset.type === "native" ? "native" : payment.asset.contractId}`;
      const total = totals.get(key);
      totals.set(key, { amount: (total?.amount ?? 0n) + BigInt(payment.amount), asset: payment.asset, networkId: payment.networkId });
    }
    return { settled: settled.length, attention: deliveries.filter(payment => needsAttention(displayState(payment))).length, totals: [...totals.values()] };
  }, [deliveries]);
  const failedWebhooks = deliveries.filter(payment => payment.webhook?.state === "failed").length;
  const statusOptions: SelectOption[] = filters.map(value => ({ value, label: labels[value], icon: <span className={`size-2 shrink-0 rounded-full ${value === "SETTLED" ? "bg-green-deep" : value !== "ALL" && needsAttention(value) ? "bg-alert" : "bg-ink/30"}`}/> }));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const chooseFilter = (value: string) => { if (filters.includes(value as Filter)) { setFilter(value as Filter); setPage(1); } };
  const resetFilters = () => { setQuery(""); setFilter("ALL"); setPage(1); };
  const stats = [
    { label: "Total payments", value: deliveries.length, detail: "Across all payment statuses", icon: CreditCard, tone: "bg-paper text-ink/60" },
    { label: "Settled", value: summary.settled, detail: "Verified and ready for a receipt", icon: CheckCheck, tone: "bg-green-deep/10 text-vault" },
    { label: "Needs attention", value: summary.attention, detail: "Payouts requiring a closer look", icon: AlertCircle, tone: summary.attention ? "bg-alert/10 text-alert" : "bg-paper text-ink/60" },
  ];

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><MonoLabel>Merchant workspace / Ledger</MonoLabel><h1 className="mt-2 text-3xl font-semibold tracking-tight">Your payments, in focus.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-ink/60">Follow every payment from checkout to settlement. The details and receipts are all here.</p></div><button type="button" onClick={() => void refresh()} disabled={loading || refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-xs font-medium transition hover:bg-paper disabled:opacity-50"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""}/>{refreshing ? "Refreshing…" : "Refresh"}</button></header>
    {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-alert/20 bg-alert/5 p-4 text-xs leading-5 text-alert"><AlertCircle size={16} className="mt-0.5 shrink-0"/>{error}</div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <SettledVolumeCard totals={summary.totals} tokens={tokens} loading={loading}/>
      {stats.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-ink/55">{label}</span><span className={`grid size-7 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={14}/></span></div><p className="mt-4 font-mono text-3xl font-medium tracking-tight">{loading ? "—" : value}</p><p className="mt-3 hidden text-[10px] leading-5 text-ink/45 sm:block">{detail}</p></article>)}
    </div>
    {!loading && failedWebhooks > 0 && <div role="alert" className="rounded-2xl border border-alert/20 bg-alert/5 p-4 text-xs leading-6 text-alert"><strong>{failedWebhooks} failed webhook notification{failedWebhooks === 1 ? "" : "s"}.</strong> Open payment details to see delivery attempts and errors. Payment settlement is tracked separately.</div>}
    <section className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-paper text-vault"><Activity size={17}/></span><div><h2 className="text-sm font-semibold">Payment activity</h2><p className="mt-1 text-[11px] text-ink/45">{loading ? "Loading your ledger…" : `${deliveries.length} payment${deliveries.length === 1 ? "" : "s"} · newest first`}</p></div></div><span className="inline-flex items-center gap-1.5 text-[10px] text-ink/45"><CheckCheck size={13} className="text-green-deep"/>Receipts for verified payments</span></div>
      <div className="grid gap-3 border-b border-line bg-paper/20 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-6"><div className="relative min-w-0"><Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/40"/><input aria-label="Search payments" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search payer, description or order…" className="h-14 w-full min-w-0 rounded-xl border border-line bg-white pl-11 pr-11 text-base outline-none placeholder:text-ink/40 focus:border-ink/30 sm:text-sm"/>{query && <button type="button" aria-label="Clear payment search" onClick={() => { setQuery(""); setPage(1); }} className="absolute right-1 top-1 grid size-12 place-items-center rounded-lg text-ink/45"><X size={15}/></button>}</div><div><label htmlFor="payment-status" className="sr-only">Payment status</label><ChoiceSelect id="payment-status" value={filter} onValueChange={chooseFilter} options={statusOptions}/></div></div>
      <div className="hidden grid-cols-[1.2fr_1.6fr_1.3fr_1.15fr_1.1fr_32px] gap-4 border-b border-line bg-paper/35 px-6 py-3 font-mono text-[9px] uppercase tracking-wider text-ink/45 xl:grid"><span>Amount</span><span>Payment</span><span>Customer / payer</span><span>Updated</span><span>Status</span><span className="sr-only">Details</span></div>
      {loading ? <div role="status" className="space-y-4 p-6">{[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-paper/65 motion-safe:animate-pulse"/>)}<span className="sr-only">Loading payments</span></div> : filtered.length === 0 ? <div className="flex flex-col items-center px-5 py-14 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-paper text-ink/40">{deliveries.length ? <Search size={21}/> : <CreditCard size={21}/>}</span><h3 className="mt-4 text-sm font-semibold">{deliveries.length ? "No matching payments" : "Your first payment starts here"}</h3><p className="mt-2 max-w-xs text-xs leading-6 text-ink/50">{deliveries.length ? "Try another search or choose a different status." : "Share a payment link. Your customer’s payment will appear here."}</p>{query || filter !== "ALL" ? <button type="button" onClick={resetFilters} className="mt-5 min-h-11 rounded-xl bg-vault px-5 text-xs text-white">Clear filters</button> : !error && <Link href="/dashboard/links" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-vault px-5 text-xs text-white"><Link2 size={14}/>Create a payment link</Link>}</div> : <ul className="divide-y divide-line/65">{visible.map(payment => {
        const state = displayState(payment), expanded = expandedId === payment.id;
        const tokenId = payment.asset.type === "nep141" ? payment.asset.contractId : null;
        const icon = tokens.find(token => token.contractId === tokenId)?.icon;
        const title = payment.paymentDescription || payment.merchantReference || "Wallet payment";
        const date = new Date(payment.timestampMs);
        return <li key={payment.id}>
          <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 p-5 transition-colors hover:bg-paper/25 sm:px-6 xl:grid-cols-[1.2fr_1.6fr_1.3fr_1.15fr_1.1fr_32px] xl:gap-4 ${expanded ? "bg-paper/35" : ""}`}>
            <div className="flex min-w-0 items-center gap-3"><TokenLogo symbol={payment.asset.symbol} icon={icon} className="size-9"/><div className="min-w-0"><p className="break-words font-mono text-sm font-medium tracking-tight">{formatAssetAmount(payment.amount, payment.asset)}</p><p className="mt-1 text-[10px] text-ink/45">{isVerifiedSettlement(payment) ? "Payment received" : "Incoming payment"}</p></div></div>
            <div className="col-start-1 row-start-2 min-w-0 xl:col-auto xl:row-auto"><p className="truncate text-xs font-medium" title={title}>{title}</p><p className="mt-1.5 truncate font-mono text-[10px] text-ink/40" title={payment.orderId}>{payment.orderId}</p></div>
            <div className="col-start-1 row-start-3 min-w-0 xl:col-auto xl:row-auto"><p className="truncate text-xs text-ink/65">{payment.customerName || payment.payerAccountId}</p>{payment.customerName && <p className="mt-1.5 truncate font-mono text-[10px] text-ink/40">{payment.payerAccountId}</p>}</div>
            <div className="hidden min-w-0 xl:block"><p className="text-[11px] text-ink/65">{date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-1.5 text-[10px] text-ink/40">{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p></div>
            <div className="col-start-2 row-start-1 text-right xl:col-auto xl:row-auto xl:text-left"><Status state={state}/><div className="mt-2"><WebhookDeliveryStatus delivery={payment.webhook}/></div></div>
            <button type="button" aria-expanded={expanded} aria-controls={`payment-details-${payment.id}`} aria-label={`${expanded ? "Hide" : "Show"} details for ${payment.orderId}`} onClick={() => setExpandedId(expanded ? null : payment.id)} className="col-start-2 row-start-2 row-span-2 inline-flex min-h-11 items-center justify-end gap-1.5 rounded-lg text-xs text-ink/50 hover:bg-paper xl:col-auto xl:row-auto xl:justify-center"><span className="xl:hidden">Details</span><ChevronDown size={16} className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}/></button>
            <p className="col-span-2 row-start-4 border-t border-line/40 pt-3 text-[10px] text-ink/40 xl:hidden"><Clock3 size={11} className="mr-1.5 inline"/>{date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          {expanded && <div id={`payment-details-${payment.id}`} className="border-t border-line/60 bg-paper/30 p-4 sm:p-6"><div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]"><div className="min-w-0"><h3 className="mb-4 text-xs font-semibold">Payment details</h3><dl className="grid gap-3 sm:grid-cols-2">{[["Gross amount", formatAssetAmount(payment.amount, payment.asset)], ["Platform fee", formatAssetAmount(payment.fee, payment.asset)], ["Merchant receives", formatAssetAmount(payment.net, payment.asset)], ["Payout wallet", payment.payoutAccountId], ["Network", payment.networkId], ["Settlement reference", isVerifiedSettlement(payment) ? payment.settlementReceiptId! : "Awaiting verified settlement"]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-line bg-white p-4"><dt className="text-[10px] text-ink/45">{label}</dt><dd className="mt-2 break-all font-mono text-xs leading-5">{value}</dd></div>)}</dl><WebhookDeliveryStatus delivery={payment.webhook} details onRetry={() => void retryWebhook(payment.id)} retrying={retryingEventId !== null}/>{payment.transactionHash && <a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(payment.transactionHash)}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-vault hover:underline">View transaction on NEAR Explorer<ArrowUpRight size={14}/></a>}</div>{isVerifiedSettlement(payment) ? <NearReceipt order={payment}/> : <div className="flex items-start gap-3 rounded-2xl border border-line bg-white p-5"><Clock3 size={18} className="mt-0.5 shrink-0 text-ink/40"/><p className="text-xs leading-6 text-ink/55">A receipt will be available once the payment’s settlement is verified.</p></div>}</div></div>}
        </li>;
      })}</ul>}
      {!loading && filtered.length > 0 && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/20 px-5 py-4 sm:px-6"><p aria-live="polite" className="text-[11px] text-ink/45">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} payments</p><div className="flex items-center gap-2"><button type="button" aria-label="Previous payments page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="grid size-11 place-items-center rounded-xl border border-line bg-white text-ink/60 hover:bg-paper disabled:opacity-30"><ChevronLeft size={15}/></button><span className="px-2 font-mono text-[10px] text-ink/50">{currentPage} / {pages}</span><button type="button" aria-label="Next payments page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="grid size-11 place-items-center rounded-xl border border-line bg-white text-ink/60 hover:bg-paper disabled:opacity-30"><ChevronRight size={15}/></button></div></footer>}
    </section>
  </div>;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Check, CircleAlert, LoaderCircle, Smartphone, Zap } from "lucide-react";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi, type VtpassPurchaseStatus } from "@/lib/near/api";
import { claimPaymentLinkWithNearWallet } from "@/lib/near/auth";
import { NEAR_EXPLORER_URL, NEAR_NATIVE_ASSET, NEAR_NETWORK_ID } from "@/lib/near/config";
import { formatUnitsExact } from "@/lib/near/amounts";
import { getPendingPaymentForSlug, isVerifiedSettlement, registerFungibleTokenRecipients, savePendingPayment, submitAuthorizedPayment, TokenStorageRequiredError, type PendingPayment } from "@/lib/near/payment";
import { formatAssetAmount } from "@/lib/near/tokens";
import type { AllowedFungibleToken, LinkClaim, NearAsset, OrderStatus, PaymentLink } from "@/lib/near/types";

type Category = "airtime" | "data" | "electricity" | "tv";
type Service = { serviceID: string; name: string; minimium_amount?: string; maximum_amount?: string };
type Variation = { variation_code: string; name: string; variation_amount: string; fixedPrice?: string };
type Quote = Awaited<ReturnType<typeof nearApi.vtpassQuote>>;
type ServiceCheckout = { purchaseId: string; slug: string; merchantId: string; orderId?: string };
const CHECKOUT_KEY = "worldz:vtpass:checkout";

const categories: { id: Category; label: string; identifier: string; help: string }[] = [
  { id: "airtime", label: "Airtime", identifier: "airtime", help: "Top up a Nigerian mobile number." },
  { id: "data", label: "Data", identifier: "data", help: "Choose a data bundle for a Nigerian network." },
  { id: "electricity", label: "Electricity", identifier: "electricity-bill", help: "Pay a prepaid or postpaid electricity meter." },
  { id: "tv", label: "TV subscription", identifier: "tv-subscription", help: "Choose a one-time TV package renewal." },
];

function providerError(error: unknown): string {
  return error instanceof Error ? error.message : "VTpass sandbox request failed.";
}

export default function NigeriaServicesPage() {
  const { accountId, wallet, connect, connecting } = useNearWallet();
  const [category, setCategory] = useState<Category>("airtime");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationCode, setVariationCode] = useState("");
  const [tokens, setTokens] = useState<AllowedFungibleToken[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [tokenContract, setTokenContract] = useState("native:NEAR");
  const [phone, setPhone] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [meterType, setMeterType] = useState("prepaid");
  const [amountNgn, setAmountNgn] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [verifiedCustomer, setVerifiedCustomer] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<ServiceCheckout | null>(null);
  const [checkoutLink, setCheckoutLink] = useState<PaymentLink | null>(null);
  const [claim, setClaim] = useState<LinkClaim | null>(null);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [serviceStatus, setServiceStatus] = useState<VtpassPurchaseStatus | null>(null);
  const [storageIssue, setStorageIssue] = useState<TokenStorageRequiredError | null>(null);
  const [transactionHash, setTransactionHash] = useState("");
  const checking = useRef(false);

  const selectedToken = useMemo<NearAsset | null>(() => {
    if (tokenContract === "native:NEAR") return NEAR_NATIVE_ASSET;
    const token = tokens.find((item) => item.contractId === tokenContract);
    return token ? { type: "nep141", contractId: token.contractId, symbol: token.symbol, decimals: token.decimals } : null;
  }, [tokens, tokenContract]);
  const selectedService = useMemo(() => services.find((service) => service.serviceID === serviceId) ?? null, [services, serviceId]);
  const selectedVariation = useMemo(() => variations.find((variation) => variation.variation_code === variationCode) ?? null, [variations, variationCode]);
  const needsCustomerNumber = category === "electricity" || category === "tv";
  const purchaseAmount = category === "data" || category === "tv" ? selectedVariation?.variation_amount ?? "" : amountNgn;

  const fetchPaymentTokens = useCallback(async () => {
    try {
      const assets = await nearApi.allowedAssets();
      const stable = assets.tokens.filter((token) => ["USDC", "USDT", "DAI"].includes(token.symbol.toUpperCase()));
      const missing = ["USDC", "USDT"].filter((symbol) => !stable.some((token) => token.symbol.toUpperCase() === symbol));
      return { stable, missing, error: null as string | null };
    } catch (cause) {
      return { stable: [] as AllowedFungibleToken[], missing: ["USDC", "USDT"], error: `Could not load USDC and USDT: ${providerError(cause)}` };
    }
  }, []);

  const applyPaymentTokens = useCallback((result: { stable: AllowedFungibleToken[]; missing: string[]; error: string | null }) => {
    setTokens(result.stable);
    setTokenContract((current) => current === "native:NEAR" || result.stable.some((token) => token.contractId === current) ? current : "native:NEAR");
    if (result.error || result.missing.length) {
      setAssetError(result.error ?? `${result.missing.join(" and ")} ${result.missing.length === 1 ? "is" : "are"} not enabled or available on this testnet. Check the backend and router token allowlists.`);
    } else {
      setAssetError(null);
    }
  }, []);

  const loadPaymentTokens = () => void fetchPaymentTokens().then((result) => applyPaymentTokens(result)).catch((cause) => { setTokens([]); setAssetError(`Could not load USDC and USDT: ${providerError(cause)}`); });

  useEffect(() => {
    const raw = window.sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return;
    let saved: ServiceCheckout;
    try { saved = JSON.parse(raw) as ServiceCheckout; } catch { window.sessionStorage.removeItem(CHECKOUT_KEY); return; }
    if (!saved.purchaseId || !saved.slug || !saved.merchantId) { window.sessionStorage.removeItem(CHECKOUT_KEY); return; }
    let active = true;
    void Promise.all([nearApi.vtpassPurchase(saved.purchaseId), nearApi.link(saved.slug).catch(() => null)]).then(([purchase, link]) => {
      if (!active) return;
      if (purchase.linkSlug !== saved.slug || (link && link.merchantId !== saved.merchantId)) throw new Error("Saved service checkout does not match the purchase.");
      if (!link && !saved.orderId) throw new Error("This service quote expired. Request a new quote.");
      setServiceStatus(purchase); setCheckoutLink(link); setCheckout(saved);
      const restored = getPendingPaymentForSlug(saved.slug);
      if (restored) {
        const callbackHash = new URLSearchParams(window.location.search).get("transactionHashes")?.split(",")[0];
        const current = { ...restored, transactionHash: restored.transactionHash ?? callbackHash ?? null };
        savePendingPayment(current); setPending(current);
      }
    }).catch((cause) => { if (active) setError(providerError(cause)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if ((!checkout?.orderId && !pending) || serviceStatus?.state === "FULFILLED" || serviceStatus?.state === "FAILED") return;
    let active = true;
    const refresh = async () => {
      if (checking.current || !active) return;
      checking.current = true;
      try {
        const current = pending;
        const status = await nearApi.order(checkout!.merchantId, current?.orderId ?? checkout!.orderId!, current?.transactionHash);
        if (!active) return;
        setOrder(status);
        if (isVerifiedSettlement(status)) {
          try {
            await nearApi.vtpassFulfill(checkout!.purchaseId);
            if (active) setServiceStatus(await nearApi.vtpassPurchase(checkout!.purchaseId));
          }
          catch (cause) { if (active) setError(providerError(cause)); }
        } else if (status.state === "OPEN" && status.failureReason) {
          setError(status.failureReason);
          setPending(null);
        }
      } catch (cause) { if (active) setError(providerError(cause)); }
      finally { checking.current = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [checkout, pending, serviceStatus?.state]);

  useEffect(() => {
    let active = true;
    const identifier = categories.find((item) => item.id === category)!.identifier;
    void nearApi.vtpassServices(identifier).then((catalog) => {
      if (!active) return;
      const available = catalog.content ?? [];
      setServices(available);
      setServiceId(available[0]?.serviceID ?? "");
    }).catch((cause) => { if (active) setError(providerError(cause)); }).finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, [category]);

  useEffect(() => {
    let active = true;
    void fetchPaymentTokens().then((result) => { if (active) applyPaymentTokens(result); }).catch(() => { if (active) { setTokens([]); setAssetError("Could not load USDC and USDT."); } });
    return () => { active = false; };
  }, [fetchPaymentTokens, applyPaymentTokens]);

  useEffect(() => {
    if (!serviceId || (category !== "data" && category !== "tv")) return;
    let active = true;
    void nearApi.vtpassVariations(serviceId).then((result) => {
      if (!active) return;
      const options = result.content?.variations ?? [];
      setVariations(options); setVariationCode(options[0]?.variation_code ?? "");
    }).catch((cause) => { if (active) setError(providerError(cause)); });
    return () => { active = false; };
  }, [category, serviceId]);

  const changeCategory = (value: Category) => {
    if (value === category) return;
    setLoadingCatalog(true); setServices([]); setServiceId(""); setVariations([]); setVariationCode("");
    setQuote(null); setVerifiedCustomer(null); setError(null); setCategory(value);
  };

  const verifyCustomer = async () => {
    if (!serviceId || !customerNumber.trim()) { setError("Enter the meter or smartcard number first."); return; }
    setBusy(true); setError(null); setVerifiedCustomer(null);
    try {
      const result = await nearApi.vtpassVerify({ serviceID: serviceId, billersCode: customerNumber.trim(), type: category === "electricity" ? meterType : undefined });
      setVerifiedCustomer(result);
    } catch (cause) { setError(providerError(cause)); }
    finally { setBusy(false); }
  };

  const getQuote = async () => {
    if (NEAR_NETWORK_ID !== "testnet") { setError("VTpass sandbox purchases are available only when the app is configured for NEAR testnet."); return; }
    if (!selectedToken) { setError("No supported NEAR payment asset is selected."); return; }
    if (!selectedService) { setError("Choose an available VTpass service."); return; }
    if (!purchaseAmount || !/^\d+(?:\.\d{1,2})?$/.test(purchaseAmount) || Number(purchaseAmount) <= 0) { setError("Choose a product or enter a valid NGN amount."); return; }
    if (!phone.trim()) { setError("Enter a contact phone number."); return; }
    if (needsCustomerNumber && !verifiedCustomer) { setError("Verify the meter or subscriber number before requesting a quote."); return; }
    setBusy(true); setError(null); setQuote(null);
    try { setQuote(await nearApi.vtpassQuote({ amountNgn: purchaseAmount, asset: selectedToken })); }
    catch (cause) { setError(providerError(cause)); }
    finally { setBusy(false); }
  };

  const continueToPayment = async () => {
    if (NEAR_NETWORK_ID !== "testnet") { setError("VTpass sandbox purchases require NEAR testnet."); return; }
    if (!quote || !selectedToken || !selectedService || !accountId) return;
    if (quote.expiresAtSeconds <= Math.floor(Date.now() / 1000)) { setQuote(null); setError("Quote expired. Request a fresh quote."); return; }
    setBusy(true); setError(null);
    let slug: string | null = null;
    try {
      const created = await nearApi.createLink({
        networkId: NEAR_NETWORK_ID,
        asset: selectedToken,
        amount: quote.tokenAmountBaseUnits,
        amountDisplay: formatUnitsExact(quote.tokenAmountBaseUnits, selectedToken.decimals),
        displayName: `Nigeria ${category === "tv" ? "TV subscription" : category} · ${selectedService.name}`,
        expiresAtSeconds: quote.expiresAtSeconds,
        multiPay: false,
        maxRedemptions: 1,
      });
      slug = created.slug;
      const providerFields: Record<string, string> = { phone: phone.trim() };
      if (category === "airtime" || category === "data") providerFields.billersCode = phone.trim();
      if (needsCustomerNumber) providerFields.billersCode = customerNumber.trim();
      if (category === "electricity") providerFields.type = meterType;
      const purchase = await nearApi.vtpassCreatePurchase({
        linkSlug: created.slug,
        quoteId: quote.quoteId,
        category,
        serviceID: serviceId,
        variationCode: category === "electricity" ? meterType : variationCode || undefined,
        providerFields,
      });
      const current = { purchaseId: purchase.purchaseId, slug: created.slug, merchantId: created.merchantId };
      window.sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(current));
      setCheckout(current); setCheckoutLink(created);
      setServiceStatus({ ...purchase, providerTransactionId: null, providerResponse: null, failureReason: null } as VtpassPurchaseStatus);
    } catch (cause) {
      if (slug) void nearApi.deleteLink(slug).catch(() => undefined);
      setError(providerError(cause));
    } finally { setBusy(false); }
  };

  const payService = async () => {
    if (!checkout || !wallet || !accountId) { if (!accountId) await connect(); return; }
    setBusy(true); setError(null); setStorageIssue(null);
    try {
      const currentClaim = await claimPaymentLinkWithNearWallet(wallet, accountId, checkout.slug);
      setClaim(currentClaim);
      const saved = { ...checkout, orderId: currentClaim.orderId };
      window.sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(saved));
      setCheckout(saved);
      const submitted = await submitAuthorizedPayment({ wallet, accountId, claim: currentClaim, linkSlug: checkout.slug, onSubmitted: setPending });
      setPending(submitted);
    } catch (cause) {
      if (cause instanceof TokenStorageRequiredError) { setStorageIssue(cause); setError("Register the receiving token accounts before approving this payment."); }
      else { setPending(getPendingPaymentForSlug(checkout.slug)); setError(providerError(cause)); }
    } finally { setBusy(false); }
  };

  const registerStorage = async () => {
    if (!wallet || !accountId || !claim || !storageIssue) return;
    setBusy(true); setError(null);
    try {
      await registerFungibleTokenRecipients({ wallet, accountId, authorization: claim.authorization, accountIds: storageIssue.accountIds, minimumDeposit: storageIssue.minimumDeposit });
      setStorageIssue(null);
    } catch (cause) { setError(providerError(cause)); }
    finally { setBusy(false); }
  };

  const recoverPayment = async () => {
    if (!checkout?.orderId || !transactionHash.trim()) return;
    setError(null);
    try {
      const status = await nearApi.order(checkout.merchantId, checkout.orderId, transactionHash.trim());
      setOrder(status);
      if (pending) { const updated = { ...pending, transactionHash: transactionHash.trim() }; savePendingPayment(updated); setPending(updated); }
    } catch (cause) { setError(providerError(cause)); }
  };

  const startAgain = () => {
    window.sessionStorage.removeItem(CHECKOUT_KEY);
    setCheckout(null); setCheckoutLink(null); setOrder(null); setPending(null); setServiceStatus(null); setClaim(null);
    setQuote(null); setError(null);
  };

  const needsVariation = category === "data" || category === "tv";

  return <section className="mx-auto max-w-4xl">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-mist">Sandbox · Nigeria</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Subscription services</h1><p className="mt-2 max-w-xl text-sm leading-6 text-mist">Top up airtime and data, pay electricity, or renew a TV package. Get a USD quote and pay with NEAR or a supported testnet stable token.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-3 py-2 font-mono text-[10px] text-amber-800"><Zap size={13}/>TESTNET · NO REAL SERVICE</span>
    </div>

    <div className="mt-5 rounded-2xl border border-green-deep/20 bg-green-deep/[.06] px-5 py-4 text-sm font-medium text-green-deep">More countries coming soon. Nigeria is available in the VTpass sandbox.</div>

    {checkout ? <div className="mt-6 rounded-[24px] border border-line bg-white p-5 sm:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[.14em] text-mist">Nigeria · VTpass sandbox · NEAR testnet</p>
      <h2 className="mt-2 text-xl font-semibold">{order && isVerifiedSettlement(order) ? "Service receipt" : "Review your service"}</h2>
      <p className="mt-1 text-xs leading-5 text-mist">{checkoutLink?.displayName ?? serviceStatus?.serviceID ?? "Your service purchase"}</p>
      <div className="mt-5 rounded-2xl bg-paper p-5">
        <div className="flex justify-between gap-3 text-xs"><span className="text-mist">VTpass amount</span><span className="font-mono">₦{serviceStatus?.amountNgn ?? "—"}</span></div>
        <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Locked USD quote</span><span className="font-mono">${serviceStatus?.amountUsd ?? "—"}</span></div>
        {checkoutLink && <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Testnet wallet payment</span><span className="font-mono">{formatAssetAmount(checkoutLink.amount, checkoutLink.asset)}</span></div>}
      </div>
      {order && isVerifiedSettlement(order) ? <div className="mt-5 space-y-4" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium text-green-deep"><Check size={17}/>Wallet payment verified</div>
        <div className="rounded-xl border border-line p-4 text-xs"><span className="text-mist">VTpass fulfillment: </span><span className="font-medium">{serviceStatus?.state?.replaceAll("_", " ") ?? "Checking provider…"}</span></div>
        {serviceStatus?.providerResponse?.purchasedCode && <div className="rounded-xl border border-line p-4 text-xs"><p className="text-mist">Purchased code / electricity token</p><p className="mt-2 break-all font-mono">{serviceStatus.providerResponse.purchasedCode}</p></div>}
        {serviceStatus?.providerTransactionId && <p className="text-xs text-mist">VTpass reference: <span className="font-mono">{serviceStatus.providerTransactionId}</span></p>}
        {serviceStatus?.failureReason && <p className="rounded-xl border border-alert/20 bg-alert/5 p-4 text-xs text-alert">{serviceStatus.failureReason}</p>}
        {order.transactionHash && <a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(order.transactionHash)}`} target="_blank" rel="noreferrer" className="inline-flex text-xs text-green-deep underline">View NEAR testnet transaction</a>}
        <p className="text-[11px] text-mist">Sandbox receipt only · no real service is delivered.</p>
        <button type="button" onClick={startAgain} className="block rounded-full border border-line px-5 py-3 text-xs font-medium">Make another purchase</button>
      </div> : <div className="mt-5 space-y-4">
        {order && <p className="rounded-xl bg-paper p-4 text-xs">Wallet payment: {order.state.replaceAll("_", " ")}. {order.failureReason ?? "Check the status here before paying again."}</p>}
        {pending && <p className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-xs">Payment is being verified. Do not submit it again while processing.</p>}
        {pending && !pending.transactionHash && <div className="rounded-xl border border-line p-4"><label className="text-xs font-medium">Wallet transaction hash<input value={transactionHash} onChange={(event) => setTransactionHash(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-line px-3 text-xs"/></label><button onClick={() => void recoverPayment()} disabled={!transactionHash.trim()} className="mt-3 text-xs text-green-deep underline disabled:opacity-50">Check transaction</button></div>}
        {storageIssue && <button type="button" onClick={() => void registerStorage()} disabled={busy} className="rounded-full border border-line px-5 py-3 text-xs font-medium disabled:opacity-50">Register token accounts ({storageIssue.accountIds.length})</button>}
        {!pending && <button type="button" onClick={() => void payService()} disabled={busy || connecting || !checkoutLink || (order != null && order.state !== "OPEN")} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-white disabled:opacity-50">{busy || connecting ? <LoaderCircle size={15} className="animate-spin"/> : <ArrowRight size={15}/>} {accountId ? "Approve testnet payment" : "Connect wallet"}</button>}
        {!checkoutLink && !pending && (!order || order.state === "OPEN" || order.state === "REFUNDED") && <button type="button" onClick={startAgain} className="text-xs text-green-deep underline">Start a new quote</button>}
        <p className="text-[11px] text-mist">Payment is routed to the configured workspace wallet; VTpass sandbox fulfillment begins only after verified settlement.</p>
      </div>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-4 text-xs text-alert">{error}</p>}
    </div> : <>

    <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">{categories.map((item) => <button key={item.id} onClick={() => changeCategory(item.id)} className={`min-h-12 rounded-2xl border px-3 text-xs font-medium transition ${category === item.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/70 hover:bg-paper"}`}>{item.label}</button>)}</div>

    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[24px] border border-line bg-white p-5 shadow-[0_4px_20px_rgba(11,15,14,.025)] sm:p-7">
        <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-green-deep/10 text-green-deep"><Smartphone size={18}/></div><div><h2 className="text-sm font-semibold">{categories.find((item) => item.id === category)?.label} details</h2><p className="mt-1 text-xs leading-5 text-mist">{categories.find((item) => item.id === category)?.help}</p></div></div>
        {loadingCatalog ? <div role="status" className="mt-8 flex items-center gap-2 text-xs text-mist"><LoaderCircle size={15} className="animate-spin"/>Loading VTpass sandbox catalog…</div> : <div className="mt-6 space-y-4">
          <label className="block text-xs font-medium">Provider<select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setQuote(null); setVerifiedCustomer(null); setVariations([]); setVariationCode(""); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40"><option value="">Select provider</option>{services.map((service) => <option value={service.serviceID} key={service.serviceID}>{service.name}</option>)}</select></label>
          {(category === "airtime" || category === "electricity") && <label className="block text-xs font-medium">Amount in NGN<input type="number" min="1" max="1000000" step="1" inputMode="numeric" value={amountNgn} onChange={(event) => { setAmountNgn(event.target.value); setQuote(null); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40" placeholder="e.g. 1000"/></label>}
          {needsVariation && <label className="block text-xs font-medium">{category === "data" ? "Data bundle" : "TV package"}<select value={variationCode} onChange={(event) => { setVariationCode(event.target.value); setQuote(null); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40"><option value="">Select package</option>{variations.map((variation) => <option value={variation.variation_code} key={variation.variation_code}>{variation.name} · ₦{variation.variation_amount}</option>)}</select></label>}
          {category === "electricity" && <label className="block text-xs font-medium">Meter type<select value={meterType} onChange={(event) => { setMeterType(event.target.value); setVerifiedCustomer(null); setQuote(null); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40"><option value="prepaid">Prepaid</option><option value="postpaid">Postpaid</option></select></label>}
          {needsCustomerNumber && <div><label className="block text-xs font-medium">{category === "electricity" ? "Meter number" : "Smartcard / IUC number"}<input value={customerNumber} onChange={(event) => { setCustomerNumber(event.target.value); setVerifiedCustomer(null); setQuote(null); }} maxLength={80} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40" placeholder="Enter the account number"/></label><button type="button" disabled={busy || !customerNumber.trim() || !serviceId} onClick={() => void verifyCustomer()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-xs font-medium disabled:opacity-50">{busy ? <LoaderCircle size={13} className="animate-spin"/> : <BadgeCheck size={13}/>}Verify account with VTpass</button>{verifiedCustomer && <pre className="mt-3 max-h-28 overflow-auto rounded-xl bg-paper p-3 text-[10px] leading-4 text-mist">{JSON.stringify(verifiedCustomer.content ?? verifiedCustomer, null, 2)}</pre>}</div>}
          <label className="block text-xs font-medium">Contact phone number<input type="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setQuote(null); }} maxLength={20} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40" placeholder="080…"/></label>
          <label className="block text-xs font-medium">Payment asset<select value={tokenContract} onChange={(event) => { setTokenContract(event.target.value); setQuote(null); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40"><option value="native:NEAR">NEAR · native</option>{tokens.map((token) => <option key={token.contractId} value={token.contractId}>{token.symbol} · NEP-141</option>)}</select></label>
          {assetError && <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-amber-900">{assetError} <button type="button" onClick={() => { setAssetError(null); void loadPaymentTokens(); }} className="ml-1 font-medium underline">Retry loading tokens</button></div>}
          {error && <p role="alert" className="rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{error}</p>}
          {!quote ? <button onClick={() => void getQuote()} disabled={busy || loadingCatalog || !selectedToken} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <ArrowRight size={14}/>}Get a 10-minute quote</button> : <div className="rounded-2xl border border-green-deep/20 bg-green-deep/[.04] p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs text-mist">VTpass sandbox price</span><span className="font-mono text-sm">₦{quote.amountNgn}</span></div><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-mist">Locked quote</span><span className="font-mono text-lg font-semibold">${quote.amountUsd} USD</span></div><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-mist">Wallet payment</span><span className="font-mono text-xs">{formatAssetAmount(quote.tokenAmountBaseUnits, quote.asset)}</span></div><p className="mt-3 text-[10px] leading-4 text-mist">₦{quote.exchangeRateNgnPerUsd}/USD · {quote.fxSource} updated {new Date(quote.fxSourceUpdatedAtSeconds * 1000).toLocaleString()}. {selectedToken?.symbol} price: ${quote.tokenUsdPrice} ({quote.tokenPriceSource}, updated {new Date(quote.tokenPriceUpdatedAtSeconds * 1000).toLocaleString()}). Quote expires {new Date(quote.expiresAtSeconds * 1000).toLocaleTimeString()}.</p><button onClick={() => accountId ? void continueToPayment() : void connect().catch((cause) => setError(providerError(cause)))} disabled={busy || connecting} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-xs font-medium text-white disabled:opacity-50">{busy || connecting ? <LoaderCircle size={14} className="animate-spin"/> : <ArrowRight size={14}/>} {accountId ? "Review and pay here" : "Connect NEAR wallet"}</button></div>}
        </div>}
      </div>
      <aside className="rounded-[24px] border border-line bg-paper p-5 sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-mist">Sandbox flow</p><ol className="mt-4 space-y-4 text-xs leading-5 text-ink/75"><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">01</span>Catalog, packages, and account checks come from VTpass sandbox.</li><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">02</span>Quotes use a cached live USD/NGN reference rate and expire after 10 minutes.</li><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">03</span>Approve a NEAR testnet stable-token payment in your wallet.</li><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">04</span>VTpass fulfillment is requested only after verified payment settlement.</li></ol><div className="mt-5 rounded-xl border border-amber/40 bg-amber/10 p-3 text-[10px] leading-4 text-amber-900"><CircleAlert size={13} className="mb-1"/>Testnet only. This does not convert test tokens into NGN or deliver a real-world service.</div></aside>
    </div></>}
  </section>;
}

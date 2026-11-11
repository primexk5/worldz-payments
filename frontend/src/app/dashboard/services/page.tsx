"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Check, CircleAlert, Clock3, Globe2, LoaderCircle, LockKeyhole, ShieldCheck, Smartphone, Tv, WalletCards, Wifi, Zap, type LucideIcon } from "lucide-react";
import { ChoiceSelect } from "@/components/molecules/choice-select";
import { TokenLogo } from "@/components/atoms/token-logo";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi, type VtpassPurchaseStatus } from "@/lib/near/api";
import { claimPaymentLinkWithNearWallet } from "@/lib/near/auth";
import { NEAR_EXPLORER_URL, NEAR_NATIVE_ASSET, NEAR_NETWORK_ID } from "@/lib/near/config";
import { formatUnitsDisplay, formatUnitsExact } from "@/lib/near/amounts";
import { clearPendingPayment, getPendingPaymentForSlug, isVerifiedSettlement, registerFungibleTokenRecipients, savePendingPayment, submitAuthorizedPayment, TokenStorageRequiredError, type PendingPayment } from "@/lib/near/payment";
import type { AllowedFungibleToken, LinkClaim, NearAsset, OrderStatus, PaymentLink } from "@/lib/near/types";

type Category = "airtime" | "data" | "electricity" | "tv";
type Service = { serviceID: string; name: string; minimium_amount?: string; maximum_amount?: string };
type Variation = { variation_code: string; name: string; variation_amount: string; fixedPrice?: string };
type Quote = Awaited<ReturnType<typeof nearApi.vtpassQuote>>;
type ServiceCheckout = { purchaseId: string; slug: string; merchantId: string; orderId?: string };
const CHECKOUT_KEY = "worldz:vtpass:checkout";

const categories: { id: Category; label: string; identifier: string; help: string; icon: LucideIcon; subtitle: string }[] = [
  { id: "airtime", icon: Smartphone, subtitle: "Top up & talk", label: "Airtime", identifier: "airtime", help: "Top up a Nigerian mobile number." },
  { id: "data", icon: Wifi, subtitle: "Stay connected", label: "Data", identifier: "data", help: "Choose a data bundle for a Nigerian network." },
  { id: "electricity", icon: Zap, subtitle: "Keep the lights on", label: "Electricity", identifier: "electricity-bill", help: "Pay a prepaid or postpaid electricity meter." },
  { id: "tv", icon: Tv, subtitle: "More to watch", label: "TV subscription", identifier: "tv-subscription", help: "Choose a TV package for your smartcard." },
];

function naira(value: string) {
  const amount = Number(value);
  return value && Number.isFinite(amount) ? `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : "—";
}

function ProviderBadge({ name }: { name: string }) {
  const key = name.toLowerCase();
  const style = key.includes("mtn") ? "bg-yellow-300 text-black" : key.includes("airtel") ? "bg-red-600 text-white" : key.includes("glo") || key.includes("gotv") ? "bg-green-700 text-white" : key.includes("9mobile") ? "bg-lime-200 text-green-950" : "bg-vault/10 text-vault";
  return <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${style}`}>{name.replace(/[^a-z0-9 ]/gi, "").split(" ")[0].slice(0, 3).toUpperCase()}</span>;
}

function VerifiedAccount({ result }: { result: Record<string, unknown> }) {
  const content = result.content && typeof result.content === "object" ? result.content as Record<string, unknown> : result;
  const name = ["Customer_Name", "CustomerName", "customerName", "customer_name", "name"].map((key) => content[key]).find((value) => typeof value === "string" && value.trim());
  const address = ["Address", "address", "Customer_Address"].map((key) => content[key]).find((value) => typeof value === "string" && value.trim());
  return <div role="status" className="mt-3 flex items-start gap-2.5 rounded-xl border border-green-deep/20 bg-green-deep/5 p-3 text-xs"><BadgeCheck size={17} className="shrink-0 text-green-deep"/><div className="min-w-0"><p className="font-medium text-vault">{typeof name === "string" ? name : "Account verified"}</p><p className="mt-1 break-words leading-5 text-ink/55">{typeof address === "string" ? address : "Account details confirmed by your provider."}</p></div></div>;
}

function providerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/closed.*window|user.*reject|user.*denied|cancel/i.test(message)) return "Payment cancelled. You can try again.";
  if (/fetch|network|unavailable|invalid response|request failed|not configured/i.test(message)) return "Service unavailable. Please try again shortly.";
  const firstLine = message.split(/\n|\. /)[0];
  return firstLine && firstLine.length <= 160 ? `${firstLine.replace(/\.$/, "")}.` : "Couldn’t complete this step. Please try again.";
}

export default function NigeriaServicesPage() {
  const { accountId, wallet, connect, connecting } = useNearWallet();
  const [category, setCategory] = useState<Category>("airtime");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [loadingVariations, setLoadingVariations] = useState(false);
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
  const paymentVerified = order ? isVerifiedSettlement(order) : false;

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
      const stable = assets.tokens.filter((token) => ["USDC", "USDC.E", "USDT", "USDT.E", "DAI"].includes(token.symbol.toUpperCase()));
      const missing = ["USDC", "USDT"].filter((symbol) => !stable.some((token) => token.symbol.toUpperCase().replace(/\.E$/, "") === symbol));
      return { stable, missing, error: null as string | null };
    } catch (cause) {
      return { stable: [] as AllowedFungibleToken[], missing: ["USDC", "USDT"], error: `Could not load USDC and USDT: ${providerError(cause)}` };
    }
  }, []);

  const applyPaymentTokens = useCallback((result: { stable: AllowedFungibleToken[]; missing: string[]; error: string | null }) => {
    setTokens(result.stable);
    setTokenContract((current) => current === "native:NEAR" || result.stable.some((token) => token.contractId === current) ? current : "native:NEAR");
    if (result.error || result.missing.length) {
      setAssetError(result.error ?? `${result.missing.join(" and ")} currently unavailable.`);
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
      if (!link && !saved.orderId && !getPendingPaymentForSlug(saved.slug)) throw new Error("This service quote expired. Request a new quote.");
      setServiceStatus(purchase); setCheckoutLink(link);
      const recoveredOrderId = saved.orderId ?? getPendingPaymentForSlug(saved.slug)?.orderId;
      const recovered = { ...saved, orderId: recoveredOrderId };
      window.sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(recovered));
      setCheckout(recovered);
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
    if ((!checkout?.orderId && !pending) || (paymentVerified && (serviceStatus?.state === "FULFILLED" || serviceStatus?.state === "FAILED"))) return;
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
            if (active) { setServiceStatus(await nearApi.vtpassPurchase(checkout!.purchaseId)); setError(null); if (current) clearPendingPayment(current); }
          }
          catch (cause) { if (active) setError(providerError(cause)); }
        } else if (status.state === "OPEN" && status.failureReason) {
          setError(providerError(new Error(status.failureReason)));
          if (current) clearPendingPayment(current);
          setPending(null);
        }
      } catch (cause) { if (active) setError(providerError(cause)); }
      finally { checking.current = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [checkout, pending, serviceStatus?.state, paymentVerified]);

  useEffect(() => {
    let active = true;
    const identifier = categories.find((item) => item.id === category)!.identifier;
    void nearApi.vtpassServices(identifier).then((catalog) => {
      if (!active) return;
      const available = catalog.content ?? [];
      setServices(available);
      setLoadingVariations((category === "data" || category === "tv") && available.length > 0);
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
    }).catch((cause) => { if (active) setError(providerError(cause)); }).finally(() => { if (active) setLoadingVariations(false); });
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
    let purchaseCreated = false;
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
      purchaseCreated = true;
      const current = { purchaseId: purchase.purchaseId, slug: created.slug, merchantId: created.merchantId };
      window.sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(current));
      setCheckout(current); setCheckoutLink(created);
      setServiceStatus({ ...purchase, providerTransactionId: null, providerResponse: null, failureReason: null } as VtpassPurchaseStatus);
    } catch (cause) {
      if (slug && !purchaseCreated) void nearApi.deleteLink(slug).catch(() => undefined);
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
    setStorageIssue(null); setTransactionHash("");
    setCheckout(null); setCheckoutLink(null); setOrder(null); setPending(null); setServiceStatus(null); setClaim(null);
    setQuote(null); setError(null);
  };

  const needsVariation = category === "data" || category === "tv";

  const currentCategory = categories.find((item) => item.id === category)!;
  const CategoryIcon = currentCategory.icon;
  const inputClass = "mt-2 h-14 w-full rounded-xl border border-line bg-white px-4 text-base outline-none transition placeholder:text-ink/30 focus:border-green-deep focus:ring-2 focus:ring-green-deep/10 disabled:opacity-50 sm:text-sm";
  const amountPresets = category === "electricity" ? [1000, 5000, 10000, 20000] : [500, 1000, 2000, 5000];

  return <section className="mx-auto max-w-[1120px] pb-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="flex items-center gap-2 text-[11px] font-medium text-ink/50"><Globe2 size={13}/>EVERYDAY PAYMENTS <span className="text-ink/20">/</span> NIGERIA</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bills & subscriptions</h1><p className="mt-3 max-w-lg text-sm leading-6 text-ink/55">A little data. A full recharge. Your everyday essentials, paid from your wallet.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-medium"><span aria-hidden="true" className="flex h-3 w-4 overflow-hidden rounded-[2px]"><span className="w-1/3 bg-green-700"/><span className="w-1/3 bg-white"/><span className="w-1/3 bg-green-700"/></span>Nigeria<span className="ml-1 size-1.5 rounded-full bg-green-deep"/></span>
    </header>
    <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-xs leading-5 text-amber-900"><CircleAlert size={15} className="mt-0.5 shrink-0"/><p><span className="font-semibold">Testnet preview.</span> Test tokens only. No real services are delivered.</p></div>

    {checkout ? <div className="mx-auto mt-6 max-w-xl rounded-[24px] border border-line bg-white p-5 sm:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[.14em] text-mist">Nigeria · VTpass sandbox · NEAR testnet</p>
      <h2 className="mt-2 text-xl font-semibold">{order && isVerifiedSettlement(order) ? "Service receipt" : "Review your service"}</h2>
      <p className="mt-1 text-xs leading-5 text-mist">{checkoutLink?.displayName ?? serviceStatus?.serviceID ?? "Your service purchase"}</p>
      <div className="mt-5 rounded-2xl bg-paper p-5">
        <div className="flex justify-between gap-3 text-xs"><span className="text-mist">VTpass amount</span><span className="font-mono">₦{serviceStatus?.amountNgn ?? "—"}</span></div>
        <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">USD equivalent</span><span className="font-mono">${serviceStatus?.amountUsd ?? "—"}</span></div>
        {checkoutLink && <div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-mist">Testnet wallet payment</span><span className="font-mono">{`${formatUnitsDisplay(checkoutLink.amount, checkoutLink.asset.decimals)} ${checkoutLink.asset.symbol}`}</span></div>}
      </div>
      {checkoutLink && <details className="mt-3 text-[11px] text-mist"><summary className="cursor-pointer">Exact payment amount</summary><p className="mt-2 break-all font-mono">{formatUnitsExact(checkoutLink.amount, checkoutLink.asset.decimals)} {checkoutLink.asset.symbol}</p></details>}
      {order && isVerifiedSettlement(order) ? <div className="mt-5 space-y-4" aria-live="polite">
        {!error && <p role="status" className="flex items-center gap-2 text-sm font-medium text-green-deep">{serviceStatus?.state === "FULFILLED" ? <Check size={17}/> : serviceStatus?.state !== "FAILED" ? <LoaderCircle size={17} className="animate-spin"/> : <CircleAlert size={17}/>} {serviceStatus?.state === "FULFILLED" ? "Service confirmed." : serviceStatus?.state === "FAILED" ? "Service unsuccessful. Payment verified." : "Payment verified. Confirming your service…"}</p>}
        {serviceStatus?.providerResponse?.purchasedCode && <div className="rounded-xl border border-line p-4 text-xs"><p className="text-mist">Purchased code / electricity token</p><p className="mt-2 break-all font-mono">{serviceStatus.providerResponse.purchasedCode}</p></div>}
        {serviceStatus?.providerTransactionId && <details className="text-xs text-mist"><summary className="cursor-pointer">Receipt reference</summary><p className="mt-2 break-all font-mono">{serviceStatus.providerTransactionId}</p></details>}
        {serviceStatus?.failureReason && !error && <p role="alert" className="text-xs text-alert">{providerError(new Error(serviceStatus.failureReason))}</p>}
        {order.transactionHash && <a href={`${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(order.transactionHash)}`} target="_blank" rel="noreferrer" className="inline-flex text-xs text-green-deep underline">View NEAR testnet transaction</a>}
        <p className="text-[11px] text-mist">Sandbox receipt only · no real service is delivered.</p>
        <button type="button" onClick={startAgain} className="block rounded-full border border-line px-5 py-3 text-xs font-medium">Make another purchase</button>
      </div> : <div className="mt-5 space-y-4">
        {!error && (pending || order) && <p role="status" className="flex items-center gap-2 text-xs text-ink/60">{pending && <LoaderCircle size={14} className="animate-spin"/>}{pending ? "Confirming payment… Please don’t pay again." : `Payment ${order!.state.toLowerCase().replaceAll("_", " ")}.`}</p>}
        {pending && !pending.transactionHash && <details className="text-xs text-mist"><summary className="cursor-pointer">Find a missing wallet transaction</summary><div className="mt-3 rounded-xl border border-line p-4"><label className="text-xs font-medium">Wallet transaction hash<input value={transactionHash} onChange={(event) => setTransactionHash(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-line px-3 text-xs"/></label><button onClick={() => void recoverPayment()} disabled={!transactionHash.trim()} className="mt-3 text-xs text-green-deep underline disabled:opacity-50">Check transaction</button></div></details>}
        {storageIssue && <button type="button" onClick={() => void registerStorage()} disabled={busy} className="rounded-full border border-line px-5 py-3 text-xs font-medium disabled:opacity-50">Register token accounts ({storageIssue.accountIds.length})</button>}
        {!pending && <button type="button" onClick={() => void payService()} disabled={busy || connecting || !checkoutLink || (!!checkout.orderId && !order) || (order != null && order.state !== "OPEN")} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-white disabled:opacity-50">{busy || connecting ? <LoaderCircle size={15} className="animate-spin"/> : <ArrowRight size={15}/>} {accountId ? "Approve testnet payment" : "Connect wallet"}</button>}
        {!checkoutLink && !pending && (!order || order.state === "OPEN" || order.state === "REFUNDED") && <button type="button" onClick={startAgain} className="text-xs text-green-deep underline">Start a new quote</button>}
        <p className="text-[11px] text-mist">Your wallet confirms the amount before you pay.</p>
      </div>}
      {error && <p role="alert" className="mt-4 text-xs leading-5 text-alert">{error}</p>}
    </div> : <>

    <div aria-label="Choose a service" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{categories.map((item) => {
      const Icon = item.icon;
      const active = category === item.id;
      return <button type="button" key={item.id} aria-pressed={active} disabled={busy} onClick={() => changeCategory(item.id)} className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-deep ${active ? "border-vault bg-vault text-white shadow-sm" : "border-line bg-white text-ink hover:border-vault/30 hover:bg-white/70"}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? "bg-white/10 text-signal" : "bg-paper text-ink/60"}`}><Icon size={20}/></span><span className="min-w-0"><span className="block text-sm font-semibold">{item.id === "tv" ? "TV" : item.label}</span><span className={`mt-1 hidden text-[11px] sm:block ${active ? "text-white/60" : "text-ink/45"}`}>{item.subtitle}</span></span></button>;
    })}</div>

    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 rounded-[24px] border border-line bg-white shadow-[0_4px_20px_rgba(11,15,14,.025)]">
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-5 sm:px-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper"><CategoryIcon size={20} className="text-vault"/></span><div><h2 className="text-base font-semibold">{currentCategory.label} details</h2><p className="mt-1 text-xs leading-5 text-ink/50">{currentCategory.help}</p></div></div>
        {loadingCatalog ? <div role="status" className="flex items-center justify-center gap-2 px-5 py-20 text-sm text-ink/50"><LoaderCircle size={17} className="animate-spin"/>Loading providers…</div> : <div className="space-y-6 p-5 sm:p-6">
          <div><label htmlFor="service-provider" className="mb-2 block text-xs font-medium">Service provider</label><ChoiceSelect id="service-provider" value={serviceId} onValueChange={(value) => { setServiceId(value); setLoadingVariations(needsVariation); setQuote(null); setVerifiedCustomer(null); setVariations([]); setVariationCode(""); }} disabled={busy || !services.length} options={services.map((service) => ({ value: service.serviceID, label: service.name, icon: <ProviderBadge name={service.name}/> }))}/>{!services.length && <p className="mt-2 text-xs text-ink/50">No providers available for this service right now.</p>}</div>
          {needsVariation && <div><label htmlFor="service-package" className="mb-2 block text-xs font-medium">{category === "data" ? "Data bundle" : "TV package"}</label><ChoiceSelect id="service-package" value={variationCode} onValueChange={(value) => { setVariationCode(value); setQuote(null); }} disabled={busy || loadingVariations || !variations.length} options={variations.map((variation) => ({ value: variation.variation_code, label: variation.name, description: naira(variation.variation_amount), icon: <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-paper"><CategoryIcon size={16} className="text-vault"/></span> }))}/>{(loadingVariations || !variations.length) && <p role="status" className="mt-2 text-xs text-ink/50">{loadingVariations ? "Loading packages…" : serviceId ? "No packages available. Choose another provider or try again shortly." : "Choose a provider to see packages."}</p>}</div>}
          {category === "electricity" && <div><p className="mb-2 text-xs font-medium" id="meter-type-label">Meter type</p><div role="group" aria-labelledby="meter-type-label" className="grid grid-cols-2 gap-2">{["prepaid", "postpaid"].map((type) => <button type="button" key={type} disabled={busy} aria-pressed={meterType === type} onClick={() => { setMeterType(type); setVerifiedCustomer(null); setQuote(null); }} className={`rounded-xl border px-4 py-3 text-sm capitalize transition disabled:opacity-50 ${meterType === type ? "border-vault bg-vault/5 font-medium text-vault" : "border-line text-ink/55"}`}>{type}</button>)}</div></div>}
          {(category === "airtime" || category === "electricity") && <div><label htmlFor="service-amount" className="block text-xs font-medium">How much would you like to pay?</label><div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 mt-1 -translate-y-1/2 text-lg text-ink/40">₦</span><input id="service-amount" type="number" min="1" max="1000000" step="1" inputMode="numeric" disabled={busy} value={amountNgn} onChange={(event) => { setAmountNgn(event.target.value); setQuote(null); }} className={`${inputClass} pl-10 text-lg font-medium`} placeholder="0.00"/></div><div className="mt-2.5 grid grid-cols-4 gap-2">{amountPresets.map((amount) => <button type="button" key={amount} disabled={busy} onClick={() => { setAmountNgn(String(amount)); setQuote(null); }} aria-pressed={amountNgn === String(amount)} className={`rounded-lg border px-1 py-2.5 text-[11px] font-medium transition disabled:opacity-50 ${amountNgn === String(amount) ? "border-vault/40 bg-vault/5 text-vault" : "border-line/70 text-ink/55 hover:border-vault/30"}`}>{naira(String(amount))}</button>)}</div></div>}
          {needsCustomerNumber && <div><label htmlFor="service-customer" className="block text-xs font-medium">{category === "electricity" ? "Meter number" : "Smartcard / IUC number"}</label><div className="flex flex-wrap items-start gap-2"><input id="service-customer" inputMode="numeric" disabled={busy} value={customerNumber} onChange={(event) => { setCustomerNumber(event.target.value); setVerifiedCustomer(null); setQuote(null); }} maxLength={80} className={`${inputClass} min-w-0 flex-[1_1_160px]`} placeholder={category === "electricity" ? "Enter meter number" : "Enter smartcard number"}/><button type="button" disabled={busy || !customerNumber.trim() || !serviceId} onClick={() => void verifyCustomer()} className="mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-line px-4 text-xs font-medium text-vault transition hover:bg-paper disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin"/> : <BadgeCheck size={15}/>}Verify</button></div>{verifiedCustomer && <VerifiedAccount result={verifiedCustomer}/>}</div>}
          <div><label htmlFor="service-phone" className="block text-xs font-medium">{category === "airtime" || category === "data" ? "Recipient phone number" : "Contact phone number"}</label><input id="service-phone" type="tel" autoComplete="tel" disabled={busy} value={phone} onChange={(event) => { setPhone(event.target.value); setQuote(null); }} maxLength={20} className={inputClass} placeholder="e.g. 08012345678"/><p className="mt-2 text-[11px] leading-5 text-ink/45">{category === "airtime" || category === "data" ? "Double-check the number before continuing." : "Use a number where you can receive service updates."}</p></div>
          <div className="border-t border-line/70 pt-5"><label htmlFor="service-payment-asset" className="mb-2 flex items-center gap-2 text-xs font-medium"><WalletCards size={14} className="text-vault"/>Pay with</label><ChoiceSelect id="service-payment-asset" value={tokenContract} disabled={busy} onValueChange={(value) => { setTokenContract(value); setQuote(null); }} options={[{ value: "native:NEAR", label: "NEAR", description: "Native token · testnet", icon: <TokenLogo symbol="NEAR" className="size-8"/> }, ...tokens.map((token) => ({ value: token.contractId, label: token.symbol.replace(/\.e$/i, ""), description: `${/\.e$/i.test(token.symbol) ? `Bridged ${token.symbol}` : "Stable token"} · testnet`, icon: <TokenLogo symbol={token.symbol} icon={token.icon} className="size-8"/> }))]}/></div>
          {assetError && <div role="status" className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-xs leading-5 text-amber-900">{assetError} <button type="button" onClick={() => { setAssetError(null); void loadPaymentTokens(); }} className="font-medium underline">Retry</button></div>}
        </div>}
      </div>
      <aside aria-label="Payment summary" className="min-w-0 space-y-4 lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-[24px] border border-vault bg-vault text-white shadow-[0_8px_30px_rgba(7,56,46,.08)]">
          <div className="border-b border-white/10 p-5 sm:p-6"><p className="text-[10px] font-medium uppercase tracking-[.16em] text-white/55">Your payment</p><div className="mt-5 flex items-end justify-between gap-3"><div className="min-w-0"><p className="text-[11px] text-white/55">Service amount</p><p className="mt-1 break-words text-3xl font-semibold tracking-tight">{naira(quote?.amountNgn ?? purchaseAmount)}</p></div><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-signal"><CategoryIcon size={21}/></span></div><dl className="mt-5 space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="shrink-0 text-white/50">Service</dt><dd className="text-right">{currentCategory.label}</dd></div><div className="flex justify-between gap-4"><dt className="shrink-0 text-white/50">Provider</dt><dd className="min-w-0 break-words text-right">{selectedService?.name ?? "Choose a provider"}</dd></div>{selectedVariation && <div className="flex justify-between gap-4"><dt className="shrink-0 text-white/50">Package</dt><dd className="min-w-0 break-words text-right leading-5">{selectedVariation.name}</dd></div>}<div className="flex justify-between gap-4"><dt className="shrink-0 text-white/50">{needsCustomerNumber ? "Account" : "Recipient"}</dt><dd className="break-all text-right font-mono">{(needsCustomerNumber ? customerNumber : phone) || "—"}</dd></div></dl></div>
          <div className="p-5 sm:p-6">{quote ? <><div className="flex items-center justify-between gap-3"><span className="text-xs text-white/55">USD equivalent</span><span className="font-mono text-sm">${quote.amountUsd}</span></div><div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"><TokenLogo symbol={quote.asset.symbol} icon={tokens.find((token) => token.contractId === tokenContract)?.icon} className="size-9"/><div className="min-w-0"><p className="text-[10px] text-white/55">You pay on testnet</p><p className="mt-1 break-all font-mono text-sm font-medium">{`${formatUnitsDisplay(quote.tokenAmountBaseUnits, quote.asset.decimals)} ${quote.asset.symbol}`}</p></div><BadgeCheck size={16} className="ml-auto shrink-0 text-signal"/></div><p className="mt-3 flex items-center gap-1.5 text-[10px] text-white/55"><Clock3 size={12}/>Quote expires at {new Date(quote.expiresAtSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><button type="button" onClick={() => accountId ? void continueToPayment() : void connect().catch((cause) => setError(providerError(cause)))} disabled={busy || connecting} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-vault transition hover:bg-signal/90 disabled:opacity-50">{busy || connecting ? <LoaderCircle size={16} className="animate-spin"/> : <WalletCards size={16}/>} {accountId ? "Review payment" : "Connect NEAR wallet"}<ArrowRight size={15}/></button><button type="button" disabled={busy} onClick={() => setQuote(null)} className="mt-3 w-full py-1 text-center text-[11px] text-white/60 underline underline-offset-4 disabled:opacity-50">Update quote</button><details className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-5 text-white/55"><summary className="cursor-pointer">Amount & exchange rate details</summary><p className="mt-2 break-all">Exact amount: {formatUnitsExact(quote.tokenAmountBaseUnits, quote.asset.decimals)} {quote.asset.symbol}</p><p className="mt-2">{naira(quote.exchangeRateNgnPerUsd)}/USD · {quote.fxSource}. Updated {new Date(quote.fxSourceUpdatedAtSeconds * 1000).toLocaleString()}.</p><p>{quote.asset.symbol}: ${quote.tokenUsdPrice} · {quote.tokenPriceSource}. Updated {new Date(quote.tokenPriceUpdatedAtSeconds * 1000).toLocaleString()}.</p></details></> : <><div className="flex items-center justify-between gap-3 text-xs"><span className="text-white/55">Payment token</span><span className="inline-flex items-center gap-2">{selectedToken && <TokenLogo symbol={selectedToken.symbol} icon={tokens.find((token) => token.contractId === tokenContract)?.icon} className="size-5"/>}{selectedToken?.symbol ?? "—"}</span></div><p className="mt-4 text-xs leading-5 text-white/55">Get a quote to see your wallet amount.</p><button type="button" onClick={() => void getQuote()} disabled={busy || loadingCatalog || !selectedToken || !serviceId || (needsVariation && !selectedVariation)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-vault transition hover:bg-signal/90 disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin"/> : <ArrowRight size={16}/>}Get payment quote</button></>}
          {error && <p role="alert" className="mt-4 text-xs leading-5 text-red-200">{error}</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5"><div className="flex items-center gap-2 text-xs font-semibold text-vault"><ShieldCheck size={16}/>You approve every payment</div><p className="mt-2 text-xs leading-6 text-ink/50">One-time purchases. No automatic renewals.</p><div className="mt-4 flex items-center gap-2 border-t border-line/70 pt-3 text-[10px] text-ink/45"><LockKeyhole size={12}/>Your wallet keys stay with you.</div></div>
      </aside>
    </div></>}
  </section>;
}

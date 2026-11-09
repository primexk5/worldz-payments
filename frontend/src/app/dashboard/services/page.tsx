"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CircleAlert, LoaderCircle, Smartphone, Zap } from "lucide-react";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { nearApi } from "@/lib/near/api";
import { NEAR_NETWORK_ID } from "@/lib/near/config";
import type { AllowedFungibleToken } from "@/lib/near/types";

type Category = "airtime" | "data" | "electricity" | "tv";
type Service = { serviceID: string; name: string; minimium_amount?: string; maximum_amount?: string };
type Variation = { variation_code: string; name: string; variation_amount: string; fixedPrice?: string };
type Quote = Awaited<ReturnType<typeof nearApi.vtpassQuote>>;

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
  const router = useRouter();
  const { accountId, connect, connecting } = useNearWallet();
  const [category, setCategory] = useState<Category>("airtime");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationCode, setVariationCode] = useState("");
  const [tokens, setTokens] = useState<AllowedFungibleToken[]>([]);
  const [tokenContract, setTokenContract] = useState("");
  const [phone, setPhone] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [meterType, setMeterType] = useState("prepaid");
  const [amountNgn, setAmountNgn] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [verifiedCustomer, setVerifiedCustomer] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedToken = useMemo(() => tokens.find((token) => token.contractId === tokenContract) ?? null, [tokens, tokenContract]);
  const selectedService = useMemo(() => services.find((service) => service.serviceID === serviceId) ?? null, [services, serviceId]);
  const selectedVariation = useMemo(() => variations.find((variation) => variation.variation_code === variationCode) ?? null, [variations, variationCode]);
  const needsCustomerNumber = category === "electricity" || category === "tv";
  const purchaseAmount = category === "data" || category === "tv" ? selectedVariation?.variation_amount ?? "" : amountNgn;

  useEffect(() => {
    let active = true;
    const identifier = categories.find((item) => item.id === category)!.identifier;
    void Promise.all([nearApi.vtpassServices(identifier), nearApi.allowedAssets()]).then(([catalog, assets]) => {
      if (!active) return;
      const available = catalog.content ?? [];
      setServices(available);
      setServiceId(available[0]?.serviceID ?? "");
      const stable = assets.tokens.filter((token) => ["USDC", "USDT", "DAI"].includes(token.symbol.toUpperCase()));
      setTokens(stable);
      setTokenContract((current) => stable.some((token) => token.contractId === current) ? current : stable.find((token) => token.symbol.toUpperCase() === "USDC")?.contractId ?? stable[0]?.contractId ?? "");
    }).catch((cause) => { if (active) setError(providerError(cause)); }).finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, [category]);

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
    if (!selectedToken) { setError("No supported stable token is enabled on this NEAR network."); return; }
    if (!selectedService) { setError("Choose an available VTpass service."); return; }
    if (!purchaseAmount || !/^\d+$/.test(purchaseAmount) || Number(purchaseAmount) <= 0) { setError("Choose a product or enter a whole-NGN amount."); return; }
    if (!phone.trim()) { setError("Enter a contact phone number."); return; }
    if (needsCustomerNumber && !verifiedCustomer) { setError("Verify the meter or subscriber number before requesting a quote."); return; }
    setBusy(true); setError(null); setQuote(null);
    try { setQuote(await nearApi.vtpassQuote({ amountNgn: purchaseAmount, tokenDecimals: selectedToken.decimals })); }
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
        asset: { type: "nep141", contractId: selectedToken.contractId, symbol: selectedToken.symbol, decimals: selectedToken.decimals },
        amount: quote.tokenAmountBaseUnits,
        amountDisplay: quote.amountUsd,
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
      window.sessionStorage.setItem(`worldz:vtpass:purchase:${created.slug}`, purchase.purchaseId);
      router.push(`/pay/${encodeURIComponent(created.slug)}?vtpassPurchase=${encodeURIComponent(purchase.purchaseId)}`);
    } catch (cause) {
      if (slug) void nearApi.deleteLink(slug).catch(() => undefined);
      setError(providerError(cause));
    } finally { setBusy(false); }
  };

  const needsVariation = category === "data" || category === "tv";

  return <section className="mx-auto max-w-4xl">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-mist">Sandbox · Nigeria</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Everyday services</h1><p className="mt-2 max-w-xl text-sm leading-6 text-mist">Browse VTpass sandbox products, lock the NGN price into a USDC-denominated quote, then pay with a NEAR testnet stable token.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-3 py-2 font-mono text-[10px] text-amber-800"><Zap size={13}/>TESTNET · NO REAL SERVICE</span>
    </div>

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
          <label className="block text-xs font-medium">Payment token<select value={tokenContract} onChange={(event) => { setTokenContract(event.target.value); setQuote(null); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink/40"><option value="">Select testnet stable token</option>{tokens.map((token) => <option key={token.contractId} value={token.contractId}>{token.symbol} · NEAR testnet</option>)}</select></label>
          {tokens.length === 0 && !loadingCatalog && <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs leading-5 text-amber-900">No USDC, USDT, or DAI test token is available in the configured NEAR testnet allowlist.</p>}
          {error && <p role="alert" className="rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{error}</p>}
          {!quote ? <button onClick={() => void getQuote()} disabled={busy || loadingCatalog || !selectedToken} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-xs font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <ArrowRight size={14}/>}Get a 10-minute quote</button> : <div className="rounded-2xl border border-green-deep/20 bg-green-deep/[.04] p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs text-mist">VTpass sandbox price</span><span className="font-mono text-sm">₦{quote.amountNgn}</span></div><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-mist">Locked quote</span><span className="font-mono text-lg font-semibold">${quote.amountUsd} USD</span></div><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-mist">Wallet payment</span><span className="font-mono text-xs">{selectedToken?.symbol} · {quote.tokenAmountBaseUnits}</span></div><p className="mt-3 text-[10px] leading-4 text-mist">Latest FX reference rate: ₦{quote.exchangeRateNgnPerUsd} per USD · {quote.fxSource}, source updated {new Date(quote.fxSourceUpdatedAtSeconds * 1000).toLocaleString()}. Quote expires {new Date(quote.expiresAtSeconds * 1000).toLocaleTimeString()}.</p><button onClick={() => accountId ? void continueToPayment() : void connect().catch((cause) => setError(providerError(cause)))} disabled={busy || connecting} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-xs font-medium text-white disabled:opacity-50">{busy || connecting ? <LoaderCircle size={14} className="animate-spin"/> : <ArrowRight size={14}/>} {accountId ? "Continue to NEAR testnet checkout" : "Connect NEAR wallet"}</button></div>}
        </div>}
      </div>
      <aside className="rounded-[24px] border border-line bg-paper p-5 sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[.14em] text-mist">Sandbox flow</p><ol className="mt-4 space-y-4 text-xs leading-5 text-ink/75"><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">01</span>Catalog, packages, and account checks come from VTpass sandbox.</li><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">02</span>Quotes use a cached live USD/NGN reference rate and expire after 10 minutes.</li><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">03</span>Approve a NEAR testnet stable-token payment in your wallet.</li><li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white font-mono text-[10px]">04</span>VTpass fulfillment is requested only after verified payment settlement.</li></ol><div className="mt-5 rounded-xl border border-amber/40 bg-amber/10 p-3 text-[10px] leading-4 text-amber-900"><CircleAlert size={13} className="mb-1"/>Testnet only. This does not convert test tokens into NGN or deliver a real-world service.</div></aside>
    </div>
  </section>;
}

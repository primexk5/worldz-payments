"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { BrandMark } from "@/components/atoms/brand-mark";
import { MonoLabel } from "@/components/atoms/mono-label";
import { ShopifyLogo } from "@/components/atoms/shopify-logo";
import { nearApi } from "@/lib/near/api";

type CheckoutInfo = Awaited<ReturnType<typeof nearApi.shopifyCheckout>>;

export default function ShopifyCheckoutDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("");
  const router = useRouter();
  const [checkout, setCheckout] = useState<CheckoutInfo | null>(null);
  const [buyer, setBuyer] = useState({ email: "", firstName: "", lastName: "", address1: "", address2: "", city: "", province: "", postalCode: "", countryCode: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void params.then(({ slug: value }) => {
      if (!active) return;
      setSlug(value);
      return nearApi.shopifyCheckout(value).then((result) => { if (active) setCheckout(result); });
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Shopify checkout is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params]);

  const setField = (field: keyof typeof buyer, value: string) => setBuyer((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await nearApi.saveShopifyBuyerDetails(slug, buyer);
      router.replace(`/pay/${encodeURIComponent(slug)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Shopify order details.");
      setSaving(false);
    }
  };

  const textField = (field: keyof typeof buyer, label: string, autoComplete: string, required = false, maxLength?: number) => (
    <label key={field} className="block text-xs font-medium">{label}
      <input type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={buyer[field]} onChange={(event) => setField(field, field === "countryCode" ? event.target.value.toUpperCase() : event.target.value)} autoComplete={autoComplete} required={required} maxLength={maxLength} disabled={saving} className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3 text-xs outline-none focus:border-ink/30" />
    </label>
  );

  return <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:py-12"><div className="mx-auto w-full max-w-[500px]"><header className="flex items-center justify-between"><BrandMark/><Link href="/" className="inline-flex items-center gap-2 text-xs text-mist hover:text-ink"><ArrowLeft size={14}/>WorldzPayments</Link></header><section className="mt-9 rounded-[24px] border border-line bg-white p-5 shadow-[0_18px_65px_rgba(11,15,14,.07)] sm:p-7"><div className="flex items-center gap-2"><ShopifyLogo className="size-7"/><MonoLabel>SHOPIFY · NEAR CHECKOUT</MonoLabel></div><h1 className="mt-2 text-xl font-semibold">Order details</h1>
    {loading?<p className="py-12 text-center text-xs text-mist">Loading Shopify item…</p>:checkout&&<><div className="mt-5 rounded-xl bg-paper p-4"><p className="text-sm font-medium">{checkout.productTitle}</p><p className="mt-1 text-xs text-mist">{checkout.variantTitle} · {checkout.amountDisplay} {checkout.asset.symbol}</p></div><form onSubmit={(event)=>void submit(event)} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2">{textField("firstName","First name","given-name",true,100)}{textField("lastName","Last name","family-name",true,100)}</div>{textField("email","Email","email",true,254)}{checkout.requiresShipping&&<><div className="border-t border-line pt-4"><p className="text-xs font-semibold">Shipping address</p><p className="mt-1 text-[11px] leading-5 text-mist">The merchant will arrange shipping and any applicable taxes after payment.</p></div>{textField("address1","Address","address-line1",true,255)}{textField("address2","Apartment, suite, etc. (optional)","address-line2",false,255)}<div className="grid gap-4 sm:grid-cols-2">{textField("city","City","address-level2",true,100)}{textField("province","State / Province","address-level1",false,100)}{textField("postalCode","Postal code","postal-code",true,32)}{textField("countryCode","Country code (e.g. US)","country",true,2)}</div>{textField("phone","Phone (optional)","tel",false,40)}</>}<button type="submit" disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-xs font-medium text-paper disabled:opacity-50">{saving&&<LoaderCircle size={15} className="animate-spin"/>}Continue to NEAR payment</button></form></>}
    {error&&<p role="alert" className="mt-4 rounded-xl border border-alert/20 bg-alert/5 p-3 text-xs leading-5 text-alert">{error}</p>}
  </section></div></main>;
}

import type { Metadata } from "next";
import { Documentation } from "@/components/docs/documentation";
import { NEAR_NETWORK_ID } from "@/lib/near/config";

export const metadata: Metadata = {
  title: "Documentation — worldzPayments",
  description: "Learn to accept NEAR payments with WorldzPayments. Merchant setup, payment links, checkout, receipts, TypeScript integration, REST API, webhooks and settlement.",
};

export default function DocsPage() {
  return <Documentation network={NEAR_NETWORK_ID}/>;
}

import type { Metadata } from "next";
import { LogoConceptReview } from "@/components/brand/logo-concept-review";

export const metadata: Metadata = {
  title: "Logo concepts — worldzPayments",
  description: "Three logo directions for worldzPayments: connected nodes, a custom W, and a clean wordmark.",
  robots: { index: false, follow: false },
};

export default function BrandConceptsPage() {
  return <LogoConceptReview/>;
}

import type { Metadata } from "next";
import { LoginPanel } from "@/components/organisms/login-panel";

export const metadata: Metadata = {
  title: "Sign in — WorldzPayments",
  description: "Sign in to your WorldzPayments merchant workspace with a NEAR wallet.",
};

export default function LoginPage() { return <LoginPanel />; }

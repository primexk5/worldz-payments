"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NearWalletBase } from "@hot-labs/near-connect";
import { connectNearWallet, disconnectNearWallet, getConnectedNearWallet, getNearConnector } from "@/lib/near/wallet";

interface NearWalletState {
  accountId: string | null;
  wallet: NearWalletBase | null;
  connecting: boolean;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NearWalletContext = createContext<NearWalletState | null>(null);

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    const connected = await getConnectedNearWallet();
    setWallet(connected?.wallet ?? null);
    setAccountId(connected?.accountId ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    void getNearConnector().then((connector) => {
      const onSignIn = (event: { wallet: NearWalletBase; accounts: { accountId: string }[] }) => {
        if (!active) return;
        setWallet(event.wallet);
        setAccountId(event.accounts[0]?.accountId ?? null);
      };
      const onSignOut = () => {
        if (!active) return;
        setWallet(null);
        setAccountId(null);
      };
      connector.on("wallet:signIn", onSignIn);
      connector.on("wallet:signOut", onSignOut);
      cleanup = () => {
        connector.off("wallet:signIn", onSignIn);
        connector.off("wallet:signOut", onSignOut);
      };
    });
    void getConnectedNearWallet().then((connected) => {
      if (!active) return;
      setWallet(connected?.wallet ?? null);
      setAccountId(connected?.accountId ?? null);
    });
    return () => { active = false; cleanup?.(); };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const connected = await connectNearWallet();
      setWallet(connected.wallet);
      setAccountId(connected.accountId);
      return connected.accountId;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectNearWallet();
    setWallet(null);
    setAccountId(null);
  }, []);

  const value = useMemo(() => ({ accountId, wallet, connecting, connect, disconnect, refresh }), [accountId, wallet, connecting, connect, disconnect, refresh]);
  return <NearWalletContext.Provider value={value}>{children}</NearWalletContext.Provider>;
}

export function useNearWallet(): NearWalletState {
  const value = useContext(NearWalletContext);
  if (!value) throw new Error("useNearWallet must be used inside NearWalletProvider.");
  return value;
}

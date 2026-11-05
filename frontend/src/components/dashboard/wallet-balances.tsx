"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import { NearLogo } from "@/components/atoms/near-logo";
import { MonoLabel } from "@/components/atoms/mono-label";
import { useNearWallet } from "@/components/providers/near-wallet-provider";
import { formatAssetAmount, getFungibleTokenBalance, getFungibleTokenMetadata, getNativeNearBalance } from "@/lib/near/tokens";
import { nativeNearAsset } from "@/lib/near/tokens";
import type { NearAsset } from "@/lib/near/types";

interface BalanceRow { key:string; asset:NearAsset; amount:string; }
const ftContracts=(process.env.NEXT_PUBLIC_NEAR_FT_CONTRACTS??"").split(",").map((id)=>id.trim()).filter(Boolean);

export function WalletBalances(){
  const {accountId}=useNearWallet();
  const [rows,setRows]=useState<BalanceRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const read=useCallback(async()=>{if(!accountId){setRows([]);return;}setLoading(true);setError(null);try{const [nativeAmount,tokenBalances]=await Promise.all([getNativeNearBalance(accountId),Promise.all(ftContracts.map(async(contractId)=>{const [metadata,amount]=await Promise.all([getFungibleTokenMetadata(contractId),getFungibleTokenBalance(contractId,accountId)]);return {key:contractId,asset:{type:"nep141" as const,contractId,symbol:metadata.symbol,decimals:metadata.decimals},amount};}))]);setRows([{key:"native",asset:nativeNearAsset,amount:nativeAmount},...tokenBalances]);}catch(cause){setError(cause instanceof Error?cause.message:"Could not load wallet balances.");}finally{setLoading(false);}},[accountId]);
  useEffect(()=>{const timer=window.setTimeout(()=>void read(),0);return()=>window.clearTimeout(timer);},[read]);
  return <section className="rounded-[20px] border border-line bg-white p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[20px] bg-green-deep/10 text-green-deep"><WalletCards size={17}/></span><div><h2 className="text-sm font-semibold">Wallet balances</h2><MonoLabel className="mt-1 text-xs">{accountId??"Connect a wallet to view balances"}</MonoLabel></div></div><button onClick={()=>void read()} disabled={loading||!accountId} className="rounded-full border border-line p-2 text-mist hover:text-ink disabled:opacity-40" aria-label="Refresh wallet balances">{loading?<LoaderCircle size={14} className="animate-spin"/>:<RefreshCw size={14}/>}</button></div>{error&&<p className="mb-3 text-xs text-alert">{error}</p>}{!accountId&&<p className="rounded-lg bg-paper p-4 text-xs leading-6 text-mist">Connect your NEAR wallet using the button above to see your available balances.</p>}<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{accountId&&rows.map((row)=><div className="rounded-[20px] bg-paper p-3" key={row.key}><div className="flex items-center gap-2">{row.asset.type==="native"&&<NearLogo className="size-4"/>}<MonoLabel className="text-xs">{row.asset.symbol}</MonoLabel></div><p className="mt-2 font-mono text-sm font-medium">{loading?"Loading…":formatAssetAmount(row.amount,row.asset)}</p></div>)}</div></section>;
}

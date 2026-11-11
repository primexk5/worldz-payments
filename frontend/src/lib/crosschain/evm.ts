import type { CrossChainWallet, DepositRequest, OneClickToken } from "./types";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  rdns: string;
}

interface Eip6963Detail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

const ERC20_TRANSFER_SELECTOR = "a9059cbb";

export function erc20TransferCalldata(to: string, amountRaw: bigint): string {
  const hex = to.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) throw new Error("The deposit address is not a valid EVM address.");
  return `0x${ERC20_TRANSFER_SELECTOR}${hex.padStart(64, "0")}${amountRaw.toString(16).padStart(64, "0")}`;
}

const CHAIN_IDS: Record<string, string> = { eth: "0x1", base: "0x2105", arb: "0xa4b1" };

export function evmTransferTransaction(origin: OneClickToken, depositAddress: string, amountRaw: string, sender: string) {
  if (!CHAIN_IDS[origin.blockchain]) throw new Error(`This wallet cannot send tokens on ${origin.blockchain}.`);
  if (!/^0x[0-9a-f]{40}$/i.test(depositAddress) || !/^0x[0-9a-f]{40}$/i.test(sender)) {
    throw new Error("The payment contains an invalid EVM address.");
  }
  if (!/^[0-9]+$/.test(amountRaw)) throw new Error("The payment amount is invalid.");
  const amount = BigInt(amountRaw);
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("The payment amount is invalid.");
  const native = !origin.contractAddress || /^0x0{40}$/i.test(origin.contractAddress);
  if (native) {
    if (origin.symbol.toUpperCase() !== "ETH" || origin.decimals !== 18) throw new Error("Unsupported native token.");
    return { from: sender, to: depositAddress, value: `0x${amount.toString(16)}` };
  }
  if (!/^0x[0-9a-f]{40}$/i.test(origin.contractAddress!)) throw new Error("The token contract address is invalid.");
  return { from: sender, to: origin.contractAddress!, value: "0x0", data: erc20TransferCalldata(depositAddress, amount) };
}

export async function discoverEvmWallets(timeoutMs = 300): Promise<{ info: Eip6963ProviderInfo; provider: Eip1193Provider }[]> {
  if (typeof window === "undefined") return [];
  const found: { info: Eip6963ProviderInfo; provider: Eip1193Provider }[] = [];
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    if (detail?.info && detail.provider) found.push({ info: detail.info, provider: detail.provider });
  };
  window.addEventListener("eip6963:announceProvider", listener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  window.removeEventListener("eip6963:announceProvider", listener);
  return found;
}

export async function connectEvmWallet(option: { info: Eip6963ProviderInfo; provider: Eip1193Provider }): Promise<CrossChainWallet> {
  const accounts = (await option.provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error(`${option.info.name} did not share an account.`);
  return {
    kind: "evm",
    name: option.info.name,
    address,
    sendTransfer: async (request: DepositRequest) => {
      const transaction = evmTransferTransaction(request.origin, request.depositAddress, request.amountRaw, address);
      const chainId = CHAIN_IDS[request.origin.blockchain];
      if (await option.provider.request({ method: "eth_chainId" }) !== chainId) {
        await option.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
      }
      if (await option.provider.request({ method: "eth_chainId" }) !== chainId) throw new Error("Switch your wallet to the selected payment network.");
      const current = await option.provider.request({ method: "eth_accounts" }) as string[];
      if (current?.[0]?.toLowerCase() !== address.toLowerCase()) throw new Error("Your wallet account changed. Reconnect before paying.");
      const hash = await option.provider.request({ method: "eth_sendTransaction", params: [transaction] }) as string;
      if (!hash) throw new Error("The wallet did not return a transaction hash.");
      return hash;
    },
  };
}

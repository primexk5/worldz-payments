import type { CrossChainWallet, DepositRequest } from "./types";

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
      if (request.origin.blockchain !== "eth" && request.origin.blockchain !== "base" && request.origin.blockchain !== "arb") {
        throw new Error(`This wallet cannot send tokens on ${request.origin.blockchain}.`);
      }
      const hash = (await option.provider.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: request.depositAddress, data: erc20TransferCalldata(request.depositAddress, BigInt(request.amountRaw)) }],
      })) as string;
      if (!hash) throw new Error("The wallet did not return a transaction hash.");
      return hash;
    },
  };
}

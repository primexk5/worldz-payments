import assert from "node:assert/strict";
import test from "node:test";

import { erc20TransferCalldata, evmTransferTransaction, connectEvmWallet } from "./evm.ts";

test("erc-20 transfer calldata encodes selector, address and amount", () => {
  const calldata = erc20TransferCalldata("0xDE00000000000000000000000000000000000001", 1050000n);
  assert.equal(calldata.length, 138);
  assert.equal(calldata.slice(0, 10), "0xa9059cbb");
  assert.equal(calldata.slice(10, 50), "000000000000000000000000de00000000000000");
  assert.equal(BigInt(`0x${calldata.slice(74)}`), 1050000n);
});

test("erc-20 transfer calldata rejects malformed addresses", () => {
  assert.throws(() => erc20TransferCalldata("not-an-address", 1n), /not a valid EVM address/);
});

const sender = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const usdc = { assetId: "usdc", blockchain: "base", symbol: "USDC", decimals: 6, contractAddress: "0x3333333333333333333333333333333333333333" };

test("ERC-20 payments call the token contract with the deposit recipient encoded", () => {
  const tx = evmTransferTransaction(usdc, recipient, "2020000", sender);
  assert.equal(tx.to, usdc.contractAddress);
  assert.equal(tx.value, "0x0");
  assert.equal(tx.data, erc20TransferCalldata(recipient, 2020000n));
});

test("native ETH payments use value without ERC-20 calldata", () => {
  const tx = evmTransferTransaction({ ...usdc, blockchain: "eth", symbol: "ETH", decimals: 18, contractAddress: null }, recipient, "1010000000000000", sender);
  assert.equal(tx.to, recipient);
  assert.equal(BigInt(tx.value), 1010000000000000n);
  assert.equal(tx.data, undefined);
  assert.throws(() => evmTransferTransaction(usdc, recipient, "0", sender), /amount is invalid/);
  assert.throws(() => evmTransferTransaction(usdc, "bad", "1", sender), /invalid EVM address/);
});

test("wallet switches to the selected chain before requesting transaction approval", async () => {
  const calls = [];
  let chainId = "0x1";
  const provider = { request: async ({ method, params }) => {
    calls.push({ method, params });
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [sender];
    if (method === "eth_chainId") return chainId;
    if (method === "wallet_switchEthereumChain") { chainId = params[0].chainId; return null; }
    if (method === "eth_sendTransaction") return "0xpayment";
    throw new Error(method);
  }};
  const wallet = await connectEvmWallet({ info: { uuid: "test", name: "Test wallet", rdns: "test.wallet" }, provider });
  assert.equal(await wallet.sendTransfer({ origin: usdc, depositAddress: recipient, amountRaw: "2000000", sender }), "0xpayment");
  assert.equal(chainId, "0x2105");
  assert.equal(calls.at(-1).method, "eth_sendTransaction");
  assert.equal(calls.at(-1).params[0].to, usdc.contractAddress);
});

test("account changes prevent transaction submission", async () => {
  let submitted = false;
  const provider = { request: async ({ method }) => {
    if (method === "eth_requestAccounts") return [sender];
    if (method === "eth_accounts") return [recipient];
    if (method === "eth_chainId") return "0x2105";
    if (method === "eth_sendTransaction") submitted = true;
  }};
  const wallet = await connectEvmWallet({ info: { uuid: "test", name: "Test", rdns: "test" }, provider });
  await assert.rejects(wallet.sendTransfer({ origin: usdc, depositAddress: recipient, amountRaw: "2000000", sender }), /account changed/);
  assert.equal(submitted, false);
});

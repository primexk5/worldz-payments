import assert from "node:assert/strict";
import test from "node:test";
import { buildSolanaPayment } from "./solana.ts";

const sender = "11111111111111111111111111111111";
const recipient = "So11111111111111111111111111111111111111112";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const origin = { assetId: "sol-usdc", blockchain: "sol", symbol: "USDC", decimals: 6, contractAddress: mint };

test("SPL transfer includes mint and correct recipient token account", async () => {
  const tx = await buildSolanaPayment({ origin, sender, depositAddress: recipient, amountRaw: "2020000" }, true);
  assert.equal(tx.instructions.length, 1);
  const ix = tx.instructions[0];
  assert.equal(ix.programId.toBase58(), "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  assert.equal(ix.keys[1].pubkey.toBase58(), mint);
  assert.equal(ix.keys[2].pubkey.toBase58(), recipient);
  assert.equal(ix.keys[3].pubkey.toBase58(), sender);
  assert.equal(ix.data[0], 12);
  assert.equal(ix.data.readBigUInt64LE(1), 2020000n);
  assert.equal(ix.data[9], 6);
});

test("SPL recipient ATA creation targets the derived writable token account", async () => {
  const tx = await buildSolanaPayment({ origin, sender, depositAddress: recipient, amountRaw: "2000000" });
  assert.equal(tx.instructions.length, 2);
  const [create, transfer] = tx.instructions;
  assert.equal(create.keys[1].isWritable, true);
  assert.equal(create.keys[1].pubkey.toBase58(), transfer.keys[2].pubkey.toBase58());
  assert.equal(create.keys[2].pubkey.toBase58(), recipient);
});

test("native SOL uses SystemProgram transfer with the quoted lamports", async () => {
  const tx = await buildSolanaPayment({ origin: { ...origin, symbol: "SOL", decimals: 9, contractAddress: null }, sender, depositAddress: recipient, amountRaw: "12345678" });
  assert.equal(tx.instructions.length, 1);
  assert.equal(tx.instructions[0].programId.toBase58(), "11111111111111111111111111111111");
  assert.equal(tx.instructions[0].data.readBigUInt64LE(4), 12345678n);
  await assert.rejects(buildSolanaPayment({ origin, sender, depositAddress: recipient, amountRaw: "0" }), /amount is invalid/);
});

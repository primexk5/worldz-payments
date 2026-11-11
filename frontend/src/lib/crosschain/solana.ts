import type { CrossChainWallet, DepositRequest } from "./types";

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<unknown>;
  signAndSendTransaction(transaction: unknown): Promise<{ signature: string } | string>;
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

type Web3 = typeof import("@solana/web3.js");

async function loadWeb3(): Promise<Web3> {
  return import("@solana/web3.js");
}

function provider(): SolanaProvider {
  const injected = (window as unknown as { solana?: SolanaProvider; phantom?: { solana?: SolanaProvider } });
  const found = injected.phantom?.solana ?? injected.solana;
  if (!found?.connect) throw new Error("No Solana wallet found. Install Phantom to pay from Solana.");
  return found;
}

export async function connectSolanaWallet(): Promise<CrossChainWallet> {
  const found = provider();
  await found.connect();
  const address = found.publicKey?.toString();
  if (!address) throw new Error("The Solana wallet did not share an account.");
  return {
    kind: "solana",
    name: found.isPhantom ? "Phantom" : "Solana wallet",
    address,
    sendTransfer: async (request: DepositRequest) => sendSolanaTransfer(found, request),
  };
}

export async function buildSolanaPayment(request: DepositRequest, destinationIsTokenAccount = false) {
  if (request.origin.blockchain !== "sol") throw new Error("This wallet cannot send tokens on Solana.");
  const { PublicKey, Transaction, TransactionInstruction, SystemProgram } = await loadWeb3();
  const owner = new PublicKey(request.sender);
  const destination = new PublicKey(request.depositAddress);
  if (!/^[0-9]+$/.test(request.amountRaw)) throw new Error("The payment amount is invalid.");
  const amount = BigInt(request.amountRaw);
  if (amount <= 0n || amount >= 2n ** 64n) throw new Error("The payment amount is invalid.");
  const transaction = new Transaction();
  transaction.feePayer = owner;
  if (!request.origin.contractAddress) {
    if (request.origin.symbol.toUpperCase() !== "SOL" || request.origin.decimals !== 9) throw new Error("Unsupported native token.");
    transaction.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: destination, lamports: amount }));
  } else {
    const mint = new PublicKey(request.origin.contractAddress);
    const tokenProgram = new PublicKey(TOKEN_PROGRAM);
    const ataProgram = new PublicKey(ATA_PROGRAM);
    const source = PublicKey.findProgramAddressSync([owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ataProgram)[0];
    const isTokenAccount = destinationIsTokenAccount;
    const target = isTokenAccount ? destination : PublicKey.findProgramAddressSync([destination.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ataProgram)[0];
    if (!isTokenAccount) {
      transaction.add(new TransactionInstruction({
        programId: ataProgram,
        keys: [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: target, isSigner: false, isWritable: true },
          { pubkey: destination, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]),
      }));
    }
    const amountBytes = Buffer.alloc(8);
    for (let index = 0; index < 8; index += 1) amountBytes[index] = Number((amount >> BigInt(index * 8)) & 0xffn);
    transaction.add(new TransactionInstruction({
      programId: tokenProgram,
      keys: [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: target, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([12, ...amountBytes, request.origin.decimals]),
    }));
  }
  return transaction;
}

async function sendSolanaTransfer(found: SolanaProvider, request: DepositRequest): Promise<string> {
  if (found.publicKey?.toString() !== request.sender) throw new Error("Your wallet account changed. Reconnect before paying.");
  const { Connection, PublicKey } = await loadWeb3();
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const destinationInfo = request.origin.contractAddress
    ? await connection.getAccountInfo(new PublicKey(request.depositAddress)) : null;
  const isTokenAccount = destinationInfo?.owner.toBase58() === TOKEN_PROGRAM;
  const transaction = await buildSolanaPayment(request, isTokenAccount);
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const result = await found.signAndSendTransaction(transaction);
  const signature = typeof result === "string" ? result : result?.signature;
  if (!signature) throw new Error("The wallet did not return a transaction signature.");
  return signature;
}

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

async function sendSolanaTransfer(found: SolanaProvider, request: DepositRequest): Promise<string> {
  if (request.origin.blockchain !== "sol") throw new Error("This wallet cannot send tokens on Solana.");
  const { Connection, PublicKey, Transaction, TransactionInstruction } = await loadWeb3();
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const owner = new PublicKey(request.sender);
  const mint = new PublicKey(request.origin.contractAddress);
  const tokenProgram = new PublicKey(TOKEN_PROGRAM);
  const ataProgram = new PublicKey(ATA_PROGRAM);
  const source = PublicKey.findProgramAddressSync([owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ataProgram)[0];
  const amount = BigInt(request.amountRaw);
  const amountBytes = Buffer.alloc(8);
  for (let index = 0; index < 8; index += 1) amountBytes[index] = Number((amount >> BigInt(index * 8)) & 0xffn);
  const destination = new PublicKey(request.depositAddress);
  const destinationInfo = await connection.getAccountInfo(destination);
  const isTokenAccount = destinationInfo?.owner.equals(tokenProgram) ?? false;
  const transfer = new TransactionInstruction({
    programId: tokenProgram,
    keys: isTokenAccount
      ? [{ pubkey: source, isSigner: false, isWritable: true }, { pubkey: destination, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }]
      : (() => {
          const derived = PublicKey.findProgramAddressSync([destination.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ataProgram)[0];
          return [
            { pubkey: source, isSigner: false, isWritable: true },
            { pubkey: derived, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
          ];
        })(),
    data: Buffer.from([12, ...amountBytes, request.origin.decimals]),
  });
  const transaction = new Transaction();
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = owner;
  if (!isTokenAccount) {
    transaction.add(new TransactionInstruction({
      programId: ataProgram,
      keys: [
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    }));
  }
  transaction.add(transfer);
  const result = await found.signAndSendTransaction(transaction);
  const signature = typeof result === "string" ? result : result?.signature;
  if (!signature) throw new Error("The wallet did not return a transaction signature.");
  return signature;
}

/** Staked NEAR can cover storage requirements; it is not part of liquid amount. */
export function spendableNear(amount: string, locked: string, storageUsage: number, storageAmountPerByte: string): bigint {
  if (!Number.isSafeInteger(storageUsage) || storageUsage < 0) throw new Error("Invalid account storage usage.");
  const liquid = BigInt(amount);
  // NEP-448: accounts using at most 770 bytes are exempt from storage staking.
  const storage = storageUsage <= 770 ? 0n : BigInt(storageUsage) * BigInt(storageAmountPerByte);
  const fromLiquid = storage > BigInt(locked) ? storage - BigInt(locked) : 0n;
  return liquid > fromLiquid ? liquid - fromLiquid : 0n;
}

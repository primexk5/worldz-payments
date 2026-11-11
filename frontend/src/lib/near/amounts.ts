/** Convert a user-facing decimal to base units without floating point or silent truncation. */
export function parseUnitsExact(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid token precision.");
  }
  const input = value.trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(input);
  if (!match) throw new Error("Enter a valid non-negative amount.");
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`This asset supports at most ${decimals} decimal places.`);
  }
  const unit = BigInt(10) ** BigInt(decimals);
  return BigInt(whole) * unit + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function formatUnitsExact(value: string | bigint, decimals: number, maxFraction = decimals): string {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  if (amount < BigInt(0)) throw new Error("Amount cannot be negative.");
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error("Invalid token precision.");
  const unit = BigInt(10) ** BigInt(decimals);
  const whole = amount / unit;
  if (decimals === 0) return whole.toString();
  const fraction = (amount % unit).toString().padStart(decimals, "0").slice(0, Math.min(decimals, maxFraction));
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

/** Readable token amounts for summaries; exact values remain available in payment details. */
export function formatUnitsDisplay(value: string | bigint, decimals: number): string {
  const exact = formatUnitsExact(value, decimals);
  const places = Math.min(decimals, 4);
  const amount = BigInt(value);
  const scale = 10n ** BigInt(decimals - places);
  const rounded = (amount + scale / 2n) / scale;
  if (amount > 0n && rounded === 0n) return `<0.${"0".repeat(places - 1)}1`;
  const readable = formatUnitsExact(rounded, places);
  const [whole, fraction] = readable.split(".");
  const grouped = BigInt(whole!).toLocaleString("en-US");
  return `${readable === exact ? "" : "≈ "}${grouped}${fraction ? `.${fraction}` : ""}`;
}

export function calculateFee(amount: string, feeBps: number): string {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 500) {
    throw new Error("The fee rate is outside the supported range.");
  }
  return ((BigInt(amount) * BigInt(feeBps)) / BigInt(10_000)).toString();
}

export function calculateNet(amount: string, fee: string): string {
  const net = BigInt(amount) - BigInt(fee);
  if (net < BigInt(0)) throw new Error("Fee exceeds payment amount.");
  return net.toString();
}

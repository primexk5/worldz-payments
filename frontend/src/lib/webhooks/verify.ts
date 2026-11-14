import { createHmac, timingSafeEqual } from "node:crypto";

const WORLDZ_SIGNATURE = /^sha256=([a-f0-9]{64})$/i;

export function verifyWorldzWebhook(
  rawBody: string | Buffer,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 32 || !signature) return false;
  const match = WORLDZ_SIGNATURE.exec(signature);
  if (!match) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

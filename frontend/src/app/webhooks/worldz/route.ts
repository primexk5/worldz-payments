import { verifyWorldzWebhook } from "@/lib/webhooks/verify";

type WorldzEvent = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
};

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json(
      { error: "Webhook receiver is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  if (
    !verifyWorldzWebhook(
      rawBody,
      request.headers.get("x-worldz-signature"),
      secret,
    )
  ) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: WorldzEvent;
  try {
    event = JSON.parse(rawBody) as WorldzEvent;
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (
    typeof event.id !== "string" ||
    !event.id ||
    event.type !== "payment.confirmed" ||
    typeof event.data !== "object" ||
    event.data === null
  ) {
    return Response.json({ error: "Unsupported webhook payload." }, { status: 400 });
  }

  // This sample receiver intentionally performs no fulfilment. Production consumers
  // should persist event.id and make downstream work idempotent before returning 2xx.
  console.info("WorldzPayments webhook verified", {
    eventId: event.id,
    type: event.type,
  });
  return new Response(null, { status: 204 });
}

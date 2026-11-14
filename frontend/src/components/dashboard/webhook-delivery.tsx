import type { WebhookDelivery } from "@/lib/near/types";

export function WebhookDeliveryStatus({ delivery, details = false }: { delivery: WebhookDelivery | null; details?: boolean }) {
  const state = delivery?.state;
  const label = state === "failed" ? "Webhook failed" : state === "delivered" ? "Webhook delivered" : state === "pending" ? "Webhook pending" : state === "skipped" ? "Webhook skipped" : "Webhook not recorded";
  const tone = state === "failed" ? "bg-alert/10 text-alert" : state === "delivered" ? "bg-green-deep/10 text-vault" : state === "pending" ? "bg-amber/15 text-amber-800" : "bg-ink/5 text-ink/55";
  const badge = <span className={`inline-flex rounded-full px-2.5 py-1.5 text-[10px] font-medium ${tone}`}>{label}</span>;
  if (!details) return badge;
  return <section aria-label="Webhook delivery" className="mt-4 rounded-xl border border-line bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-xs font-semibold">Webhook delivery</h4>{badge}</div>
    {delivery ? <>
      <p className="mt-3 text-xs text-ink/65">{delivery.attempts} delivery attempt{delivery.attempts === 1 ? "" : "s"}</p>
      <p className="mt-2 break-all font-mono text-[10px] leading-5 text-ink/50">Event: {delivery.eventId}</p>
      {delivery.lastError && <p className="mt-3 break-words text-xs leading-6 text-alert">Last delivery error: {delivery.lastError}</p>}
      {state === "failed" && <p className="mt-3 text-xs leading-6 text-ink/60">Check the receiving URL, signing secret and receiver logs. A notification failure does not change payment settlement. Automatic retries have stopped after the attempt limit.</p>}
    </> : <p className="mt-3 text-xs leading-6 text-ink/60">No webhook delivery record is available for this payment.</p>}
    <a href="/dashboard/settings#webhook-url" className="mt-3 inline-flex min-h-9 items-center text-xs font-medium text-vault underline underline-offset-4">Webhook settings</a>
  </section>;
}

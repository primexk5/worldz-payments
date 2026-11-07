"use client";

import Link from "next/link";
import { Cookie, ShieldCheck, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const COOKIE = "worldz_privacy_notice";
const CHANGE_EVENT = "worldz:privacy-change";
const OPEN_EVENT = "worldz:privacy-open";
let dismissedInSession = false;

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function isDismissed() {
  return dismissedInSession || document.cookie.split(";").some((cookie) => cookie.trim() === `${COOKIE}=v1`);
}

export function PrivacyNotice() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => false);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  function dismiss() {
    dismissedInSession = true;
    try {
      document.cookie = `${COOKIE}=v1; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch { /* The notice can still be dismissed when browser storage is blocked. */ }
    setReopened(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  if (dismissed && !reopened) return null;

  return (
    <section aria-labelledby="privacy-notice-title" className="fixed inset-x-4 bottom-4 z-[110] mx-auto max-h-[75dvh] max-w-[560px] overflow-y-auto rounded-[24px] border border-line bg-paper p-5 text-ink shadow-[0_12px_70px_rgba(11,15,14,.2)] sm:bottom-6 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-green-deep/15 bg-green-deep/5 text-green-deep"><Cookie size={20} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-green-deep">Privacy & cookies</p>
          <h2 id="privacy-notice-title" className="mt-1 text-lg font-semibold tracking-tight">A little storage. Your privacy matters.</h2>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss privacy notice" className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-mist hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-deep"><X size={17} aria-hidden="true" /></button>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink/70">We use essential cookies and browser storage to keep you signed in, remember checkout details, and recover payments. This site currently uses no advertising or analytics cookies.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><Link href="/privacy" className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-green-deep underline underline-offset-4"><ShieldCheck size={15} aria-hidden="true" />Privacy & cookies</Link><Link href="/terms#acceptable-use" className="ml-4 inline-flex min-h-11 items-center text-xs font-medium text-green-deep underline underline-offset-4">Rules of use</Link></div>
        <button type="button" onClick={dismiss} className="min-h-11 rounded-full bg-ink px-5 py-3 text-xs font-medium text-paper transition hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-deep">Continue with essential cookies</button>
      </div>
    </section>
  );
}

export function PrivacySettingsButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className="text-left text-xs text-mist underline underline-offset-4 hover:text-ink">Privacy & cookie settings</button>;
}

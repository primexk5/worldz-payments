import { ArrowRight, CirclePlay } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PrimaryAction({ children, href = "/onboarding" }: { children: ReactNode; href?: string }) {
  return <Button nativeButton={false} className="h-12 gap-4 rounded-full bg-ink py-1 pl-5 pr-1.5 text-[13px] font-medium text-paper transition hover:bg-ink/90 active:translate-y-0.5 focus-visible:ring-2 focus-visible:ring-green-deep focus-visible:ring-offset-4" render={<a href={href} />}>{children}<span className="grid size-[34px] place-items-center rounded-full bg-signal text-ink"><ArrowRight size={18} /></span></Button>;
}

export function SecondaryAction({ children, href = "/developers" }: { children: ReactNode; href?: string }) {
  return <Button nativeButton={false} variant="outline" className="h-12 gap-2 rounded-full border-ink/20 bg-transparent px-5 text-[13px] text-ink hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-green-deep focus-visible:ring-offset-4" render={<a href={href} />}><CirclePlay size={18} />{children}</Button>;
}

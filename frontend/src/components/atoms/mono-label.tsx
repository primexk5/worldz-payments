import type { ReactNode } from "react";

export function MonoLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`block font-mono text-[9px] font-medium uppercase leading-relaxed tracking-[.15em] text-mist ${className}`}>{children}</span>;
}

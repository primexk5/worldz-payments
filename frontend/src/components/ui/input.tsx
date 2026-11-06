import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ink/30 focus-visible:ring-1 focus-visible:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",className)} {...props}/>;
}
export { Input };

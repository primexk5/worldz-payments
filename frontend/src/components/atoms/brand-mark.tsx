import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ inverse = false, className }: { inverse?: boolean; className?: string }) {
  return <Image src={`/brand/logo-${inverse ? "dark" : "light"}.svg`} alt="worldzPayments" width={330} height={64} priority unoptimized className={cn("h-auto w-[150px] object-contain sm:w-[176px]", className)}/>;
}

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return <Link className="inline-flex shrink-0 items-center" href="/" aria-label="worldzPayments home"><BrandLogo inverse={inverse}/></Link>;
}

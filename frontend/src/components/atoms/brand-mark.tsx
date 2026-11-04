import Link from "next/link";
import Image from "next/image";

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className={`inline-flex shrink-0 items-center no-underline ${inverse ? "rounded-md bg-paper px-2 py-1" : ""}`} href="/" aria-label="worldzPayments home">
      <Image src="/worldz-logo.png" alt="WorldzPayments" width={270} height={48} priority className="h-auto w-[142px] object-contain sm:w-[170px]" />
    </Link>
  );
}

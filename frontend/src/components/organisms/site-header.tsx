"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/atoms/brand-mark";

const navigation = [
  { label: "Products", href: "/#products" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/#pricing" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <header id="top" className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur-xl">
    <div className="site-container flex h-20 items-center justify-between gap-5">
      <BrandMark/>
      <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">{navigation.map(item=><Link key={item.href} href={item.href} className="text-[13px] text-ink/65 transition-colors hover:text-ink">{item.label}</Link>)}</nav>
      <div className="flex items-center gap-3 sm:gap-5"><Link href="/login" className="hidden text-sm font-medium text-ink/75 hover:text-ink sm:block">Sign in</Link><Button render={<Link href="/onboarding"/>} className="h-11 gap-3 rounded-full py-1 pl-4 pr-1.5 text-xs sm:pl-5 sm:text-sm">Get started<span className="grid size-8 place-items-center rounded-full bg-signal text-ink"><ArrowRight size={16}/></span></Button>
        <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger aria-label="Open navigation" className="grid size-10 place-items-center rounded-xl border border-line lg:hidden"><Menu size={19}/></Dialog.Trigger><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[70] bg-ink/25 backdrop-blur-sm"/><Dialog.Popup className="fixed inset-x-3 top-3 z-[71] rounded-[20px] border border-line bg-paper p-6 shadow-xl"><div className="flex items-center justify-between"><BrandMark/><Dialog.Close aria-label="Close navigation" className="grid size-10 place-items-center rounded-full border border-line"><X size={19}/></Dialog.Close></div><Dialog.Title className="sr-only">Site navigation</Dialog.Title><Dialog.Description className="sr-only">Explore WorldzPayments and access your merchant account.</Dialog.Description><nav aria-label="Mobile navigation" className="mt-6 divide-y divide-line">{navigation.map((item,i)=><Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className="flex items-center justify-between py-4 text-lg font-medium"><span><span className="mr-4 font-mono text-xs text-mist">0{i+1}</span>{item.label}</span><ArrowRight size={17}/></Link>)}</nav><div className="mt-6 flex items-center justify-between gap-4"><Link onClick={()=>setOpen(false)} href="/login" className="text-sm font-medium">Sign in to your workspace</Link><ArrowRight size={16}/></div></Dialog.Popup></Dialog.Portal></Dialog.Root>
      </div>
    </div>
  </header>;
}

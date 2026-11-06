"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, Copy, Hash, Link2, Search, ShieldCheck, Terminal, X } from "lucide-react";
import { NearLogo } from "@/components/atoms/near-logo";
import { Button } from "@/components/ui/button";
import { docsSections, type DocBlock } from "@/lib/docs/content";

const groups = ["Get started", "Accept payments", "Build an integration", "Manage & troubleshoot"] as const;

function InlineText({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`")
    ? <code key={index} className="rounded border border-line/80 bg-white/60 px-1.5 py-0.5 font-mono text-[.85em] text-ink">{part.slice(1, -1)}</code>
    : part);
}

function CodeExample({ title, language, code }: { title: string; language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 2000); return () => window.clearTimeout(timer); }, [copied]);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setError(false); } catch { setError(true); } };
  return <div className="my-6 min-w-0 overflow-hidden rounded-[16px] border border-line bg-white/70"><div className="flex items-center justify-between gap-3 border-b border-line bg-paper/45 px-4 py-3"><div className="flex min-w-0 items-center gap-2"><Terminal size={14} className="shrink-0 text-mist"/><span className="truncate font-mono text-[10px] text-ink/65 sm:text-[11px]">{title}</span></div><Button onClick={() => void copy()} variant="ghost" aria-label={`Copy ${title}`} className="h-7 shrink-0 gap-1.5 rounded-md px-2 text-[11px]">{copied ? <Check size={13}/> : <Copy size={13}/>}<span aria-live="polite">{copied ? "Copied" : "Copy"}</span></Button></div><pre tabIndex={0} aria-label={`${language} example: ${title}`} className="max-w-full overflow-x-auto p-4 font-mono text-[11px] leading-7 text-ink/80 sm:p-5 sm:text-xs"><code>{code}</code></pre><div className="flex justify-between border-t border-line px-4 py-2 font-mono text-[9px] uppercase tracking-wider text-mist"><span>{language}</span><span>{error ? "Select the code to copy it manually" : "Example · review values before use"}</span></div></div>;
}

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "paragraph": return <p className="my-4 text-sm leading-7 text-ink/70"><InlineText text={block.text}/></p>;
    case "list": return <ul className="my-5 space-y-3">{block.items.map((item,i) => <li key={i} className="flex items-start gap-3 text-sm leading-7 text-ink/70"><Check size={15} className="mt-1.5 shrink-0 text-ink/50"/><span><InlineText text={item}/></span></li>)}</ul>;
    case "steps": return <ol className="my-6 space-y-6">{block.items.map((step,i) => <li key={step.title} className="flex gap-4"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-white/70 font-mono text-[10px]">{String(i+1).padStart(2,"0")}</span><div><h3 className="text-sm font-semibold leading-7">{step.title}</h3><p className="mt-1 text-sm leading-7 text-ink/65"><InlineText text={step.text}/></p></div></li>)}</ol>;
    case "callout": return <aside className="my-6 rounded-xl border border-line border-l-[3px] border-l-ink bg-white/50 p-4 sm:p-5"><p className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={15}/>{block.title}</p><p className="mt-2 text-xs leading-6 text-ink/65"><InlineText text={block.text}/></p></aside>;
    case "code": return <CodeExample {...block}/>;
    case "table": return <div className="my-6 max-w-full overflow-x-auto rounded-xl border border-line bg-white/40"><table className="w-full min-w-[480px] text-left text-xs"><thead className="border-b border-line bg-white/60"><tr>{block.headers.map(header => <th key={header} scope="col" className="px-4 py-3 font-medium text-ink/70">{header}</th>)}</tr></thead><tbody className="divide-y divide-line/70">{block.rows.map((row,i) => <tr key={i} className="align-top">{row.map((cell,j) => <td key={j} className={`px-4 py-3 leading-6 ${j===0 ? "min-w-32 font-medium text-ink" : "text-ink/65"}`}><InlineText text={cell}/></td>)}</tr>)}</tbody></table></div>;
    case "links": return <div className="my-5 flex flex-wrap gap-3">{block.items.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-white/50 px-3.5 py-2 text-xs font-medium transition-colors hover:bg-white">{link.label}<ArrowRight size={13}/></Link>)}</div>;
  }
}

export function Documentation({ network }: { network: string }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("quickstart");
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const term = query.trim().toLowerCase();
  const matches = docsSections.filter(section => `${section.title} ${section.description} ${section.keywords} ${JSON.stringify(section.blocks)}`.toLowerCase().includes(term));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditing = target.matches("input, textarea, select") || target.isContentEditable;
      if ((event.key === "/" && !isEditing) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
    };
    document.addEventListener("keydown", onKey);
    const observer = new IntersectionObserver(entries => {
      const entry = entries.filter(item => item.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if (entry) setActive(entry.target.id);
    }, { rootMargin: "-155px 0px -55% 0px", threshold: 0 });
    for (const section of docsSections) { const el = document.getElementById(section.id); if(el)observer.observe(el); }
    return () => { document.removeEventListener("keydown",onKey); observer.disconnect(); };
  }, []);
  const navigate = (id: string) => { setActive(id); setQuery(""); setMobileOpen(false); };
  const navigation = <nav aria-label="Documentation topics" className="space-y-6">{groups.map(group => {
    const sections = matches.filter(section => section.group===group);
    return sections.length > 0 ? <div key={group}><p className="mb-2 px-3 font-mono text-[9px] uppercase tracking-[.12em] text-mist">{group}</p><ul className="space-y-0.5">{sections.map(section => <li key={section.id}><a onClick={() => navigate(section.id)} href={`#${section.id}`} aria-current={active===section.id ? "location" : undefined} className={`block rounded-lg px-3 py-2 text-xs leading-5 transition-colors ${active===section.id ? "bg-ink font-medium text-paper" : "text-ink/60 hover:bg-white/70 hover:text-ink"}`}>{section.title}</a></li>)}</ul></div> : null;
  })}{matches.length===0 && <p className="px-3 text-xs leading-6 text-mist">No matching topics. Try “receipts”, “wallet” or “API”.</p>}</nav>;
  return <main id="main-content" className="docs-page workspace-theme bg-paper text-ink">
    <div className="docs-toolbar sticky top-20 z-30 border-b border-line bg-paper/95 backdrop-blur-lg"><div className="site-container flex min-h-16 items-center justify-between gap-4"><div className="flex shrink-0 items-center gap-2.5"><BookOpen size={18}/><span className="hidden text-sm font-medium sm:inline">Documentation</span><span className="rounded-md border border-line bg-white/50 px-1.5 py-0.5 font-mono text-[9px] text-mist">v1</span></div><div className="relative w-full max-w-[380px]"><label className="relative block"><span className="sr-only">Search documentation</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist"/><input ref={searchRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search documentation…" aria-controls={term ? "docs-search-results" : undefined} className="h-10 w-full rounded-xl border border-line bg-white/60 pl-9 pr-12 text-xs outline-none transition-colors focus:border-ink/40"/>{query ? <button type="button" aria-label="Clear documentation search" onClick={()=>setQuery("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center"><X size={13}/></button> : <kbd aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-mist">/</kbd>}</label>{term && <div id="docs-search-results" className="absolute inset-x-0 top-12 max-h-[min(60vh,420px)] overflow-y-auto rounded-xl border border-line bg-paper p-2 shadow-xl"><p role="status" className="px-3 py-2 font-mono text-[9px] uppercase text-mist">{matches.length} matching topic{matches.length===1?"":"s"}</p>{matches.length ? matches.map(section=><a key={section.id} href={`#${section.id}`} onClick={()=>navigate(section.id)} className="block rounded-lg px-3 py-3 hover:bg-white"><p className="flex items-center justify-between gap-3 text-xs font-medium">{section.title}<ArrowRight size={13}/></p><p className="mt-1 text-[11px] leading-5 text-mist">{section.description}</p></a>) : <p className="px-3 pb-3 text-xs leading-6 text-mist">Try a product name, “SDK”, “webhooks” or “receipts”.</p>}</div>}</div><a href="/docs/worldzpayments-guide.md" download className="hidden items-center gap-2 text-xs text-ink/60 hover:text-ink lg:inline-flex"><ArrowDownToLine size={14}/>Download guide</a></div></div>
    <div className="site-container grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 xl:gap-20">
      <aside className="docs-sidebar hidden border-r border-line pr-5 lg:block"><div className="sticky top-40 max-h-[calc(100svh-180px)] overflow-y-auto py-8">{navigation}<div className="mx-3 mt-7 border-t border-line pt-5"><p className="flex items-center gap-2 text-[11px] text-ink/65"><NearLogo className="size-3.5"/>Built on NEAR</p><p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-mist">Current network: {network}</p></div></div></aside>
      <div className="min-w-0 max-w-[860px] pb-16 pt-5 sm:pt-8 lg:pt-10">
        <details open={mobileOpen} onToggle={event=>setMobileOpen(event.currentTarget.open)} className="docs-mobile-nav mb-8 rounded-xl border border-line bg-white/40 lg:hidden"><summary className="flex list-none items-center justify-between px-4 py-3 text-xs font-medium [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><BookOpen size={14}/>Browse all topics</span><ChevronDown size={15}/></summary><div className="max-h-[55svh] overflow-y-auto border-t border-line p-3">{navigation}</div></details>
        <header className="pb-10"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-mist"><span>WorldzPayments</span><span>/</span><span>Product guide & API</span></div><h1 className="mt-5 text-[clamp(2.5rem,4.5vw,3.75rem)] font-semibold leading-[1.06] tracking-[-.055em]">Everything you need<br/>to get <em className="font-serif font-normal italic text-green-deep">paid.</em></h1><p className="mt-5 max-w-xl text-sm leading-7 text-ink/65">From your first payment link to a custom checkout. Find the steps, examples and reference details to run your business on WorldzPayments.</p><div className="mt-7 grid gap-3 sm:grid-cols-3">{[{title:"Accept a payment",text:"No-code merchant guide",href:"#quickstart",Icon:Link2},{title:"Build an integration",text:"TypeScript & REST API",href:"#typescript-client",Icon:Terminal},{title:"Track & reconcile",text:"Settlement & receipts",href:"#settlement",Icon:ShieldCheck}].map(({title,text,href,Icon})=><a key={title} href={href} className="group rounded-[16px] border border-line bg-white/60 p-4 transition-colors hover:bg-white"><Icon size={19}/><p className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold">{title}<ArrowRight size={13}/></p><p className="mt-1.5 text-[10px] leading-5 text-mist">{text}</p></a>)}</div></header>
        <article>{docsSections.map((section,index)=><section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-40 border-t border-line py-10 sm:py-12"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-mist">{String(index+1).padStart(2,"0")} / {section.group}</p><h2 id={`${section.id}-title`} className="group mt-3 flex items-center gap-3 text-2xl font-semibold tracking-[-.035em] sm:text-[28px]">{section.title}<a href={`#${section.id}`} aria-label={`Link to ${section.title}`} className="shrink-0 text-mist opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"><Hash size={16}/></a></h2><p className="mb-6 mt-2 text-xs leading-6 text-mist">{section.description}</p>{section.blocks.map((block,i)=><Block key={i} block={block}/>)}</section>)}</article>
        <div className="flex flex-col justify-between gap-4 rounded-[20px] border border-line bg-white/50 p-6 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold">Ready for your next payment?</p><p className="mt-2 text-xs leading-6 text-ink/60">Create a link, share it, and follow verified settlement.</p></div><Button className="h-11 shrink-0 self-start rounded-full px-5 text-xs" render={<Link href="/dashboard/links"/>}>Create a payment link<ArrowRight size={14}/></Button></div>
        <div className="mt-6 flex flex-wrap gap-4 text-[11px] text-mist"><a href="/docs/worldzpayments-guide.md" download className="inline-flex items-center gap-1.5"><ArrowDownToLine size={12}/>Download the full guide</a><a href="#main-content" className="inline-flex items-center gap-1.5">Back to the start<ArrowRight size={12} className="-rotate-90"/></a></div>
      </div>
    </div>
  </main>;
}

"use client";

import type { ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string; description?: string; icon?: ReactNode };

export function ChoiceSelect({ id, value, onValueChange, options, disabled = false }: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}) {
  const selected = options.find(option => option.value === value);
  return (
    <Select.Root value={value} onValueChange={next => { if (next !== null) onValueChange(next); }} items={options} disabled={disabled}>
      <Select.Trigger id={id} className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left text-sm transition focus-visible:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/30 disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ink/30">
        {selected?.icon}
        <span className="min-w-0 flex-1"><Select.Value className="block truncate font-medium">{selected?.label ?? "Choose an option"}</Select.Value>{selected?.description && <span className="mt-0.5 block truncate text-[11px] text-ink/50">{selected.description}</span>}</span>
        <Select.Icon><ChevronDown className="size-4 text-ink/45 transition-transform group-data-[popup-open]:rotate-180"/></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={8} alignItemWithTrigger={false} className="z-[100] outline-none">
          <Select.Popup className="max-h-[min(360px,var(--available-height))] w-[var(--anchor-width)] min-w-48 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 text-ink shadow-[0_16px_48px_-12px_#07382e30] outline-none">
            <Select.List>
              {options.map(option => (
                <Select.Item key={option.value} value={option.value} label={option.label} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm outline-none data-[highlighted]:bg-paper data-[selected]:bg-vault/5">
                  {option.icon}
                  <span className="min-w-0 flex-1"><Select.ItemText className="block truncate font-medium">{option.label}</Select.ItemText>{option.description && <span className="mt-0.5 block truncate text-[11px] text-ink/50">{option.description}</span>}</span>
                  <span className="grid size-5 shrink-0 place-items-center"><Select.ItemIndicator><Check className="size-4 text-green-deep"/></Select.ItemIndicator></span>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

"use client";

import { Input } from "@/components/ui/input";

/**
 * A swatch and a hex field for the same colour. The native picker is stretched
 * invisibly over the swatch so the whole square is clickable, which is a much
 * bigger target than the browser's own control.
 */
export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-9 w-9 shrink-0">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={label}
        />
        <div
          className="h-9 w-9 rounded-lg border border-border shadow-sm"
          style={{ backgroundColor: value }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 h-8 font-mono text-xs"
          placeholder="#000000"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

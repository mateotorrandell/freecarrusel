"use client";

import { useEffect, useRef } from "react";

interface ColorFieldProps {
  label: string;
  value: string;
  /** Live while the picker is open — applied to the slide, not to history. */
  onPreview: (value: string) => void;
  /** Fired when the picker closes: this is the one undo step. */
  onCommit: (value: string) => void;
  /** Swatch only — for the toolbar row, where a label doesn't fit. */
  compact?: boolean;
}

/**
 * Colour input that separates preview from commit.
 *
 * React's `onChange` on an <input type="color"> maps to the *input* event,
 * which fires for every shade the cursor passes over. Wiring history to that
 * recorded the whole gradient as undo steps. The native `change` event fires
 * once, when the picker closes — that's the commit.
 */
export function ColorField({ label, value, onPreview, onCommit, compact }: ColorFieldProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const preview = () => onPreview(el.value);
    const commit = () => onCommit(el.value);
    el.addEventListener("input", preview);
    el.addEventListener("change", commit);
    return () => {
      el.removeEventListener("input", preview);
      el.removeEventListener("change", commit);
    };
  }, [onPreview, onCommit]);

  if (compact) {
    return (
      <div className="relative h-7 w-7 shrink-0" title={label}>
        <input
          ref={ref}
          type="color"
          defaultValue={value}
          key={value}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={label}
        />
        <div
          className="h-7 w-7 rounded-md border border-border shadow-sm cursor-pointer"
          style={{ backgroundColor: value || "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <input
          ref={ref}
          type="color"
          defaultValue={value}
          key={value}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={label}
        />
        <div
          className="h-9 w-9 rounded-lg border border-border shadow-sm cursor-pointer"
          style={{ backgroundColor: value || "transparent" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <input
          value={value}
          onChange={(e) => onPreview(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          className="mt-0.5 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

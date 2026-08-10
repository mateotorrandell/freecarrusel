"use client";

import { useState, useEffect } from "react";
import { useGoogleFonts } from "@/lib/use-google-font";

interface Font {
  name: string;
  category: string;
}

interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Sample text — shown in the selected typeface. */
  sample?: string;
}

export function FontSelector({
  label,
  value,
  onChange,
  sample,
}: FontSelectorProps) {
  const [fonts, setFonts] = useState<Font[]>([]);

  useEffect(() => {
    fetch("/api/fonts")
      .then((r) => r.json())
      .then((data) => setFonts(data.fonts || []))
      .catch(() => {});
  }, []);

  // Actually load the selected family so the preview isn't a system fallback.
  useGoogleFonts([value]);

  const grouped = fonts.reduce<Record<string, Font[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 rounded-lg border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {Object.entries(grouped).map(([category, list]) => (
          <optgroup key={category} label={category}>
            {list.map((font) => (
              <option key={font.name} value={font.name}>
                {font.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p
        className="mt-2 text-lg leading-snug truncate"
        style={{ fontFamily: `'${value}', sans-serif` }}
        title={value}
      >
        {sample ?? "Aa Bb Cc — 123"}
      </p>
    </div>
  );
}

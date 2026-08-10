"use client";

import { useState, useEffect, useCallback } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "./ColorPicker";
import { FontSelector } from "./FontSelector";
import { LogoUpload } from "./LogoUpload";
import { useLanguage } from "@/lib/i18n";
import type { BrandConfig } from "@/types/brand";
import { DEFAULT_BRAND } from "@/types/brand";

const STYLE_OPTIONS = [
  "minimal",
  "bold",
  "playful",
  "corporate",
  "luxury",
  "vintage",
  "modern",
  "elegant",
  "creative",
  "professional",
  "editorial",
  "brutalist",
];

/**
 * Flat, always-visible brand editor for the sidebar. This replaced the stepped
 * BrandSetup wizard, which used to hijack the dashboard on every visit; an
 * unconfigured brand now surfaces as the dismissible BrandNudge toast.
 */
export function BrandPanel() {
  const { t } = useLanguage();
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then((data: BrandConfig) => setBrand({ ...DEFAULT_BRAND, ...data }))
      .catch(() => {});
  }, []);

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brand),
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("idle");
    }
  }, [brand]);

  const setColor = (key: keyof BrandConfig["colors"]) => (v: string) =>
    setBrand((b) => ({ ...b, colors: { ...b.colors, [key]: v } }));

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          {t("brandName")}
        </label>
        <Input
          value={brand.name}
          onChange={(e) => setBrand({ ...brand, name: e.target.value })}
          placeholder={t("brandNamePlaceholder")}
          className="mt-1"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("colors")}
        </p>
        <ColorPicker label={t("primary")} value={brand.colors.primary} onChange={setColor("primary")} />
        <ColorPicker label={t("secondary")} value={brand.colors.secondary} onChange={setColor("secondary")} />
        <ColorPicker label={t("accent")} value={brand.colors.accent} onChange={setColor("accent")} />
        <ColorPicker label={t("background")} value={brand.colors.background} onChange={setColor("background")} />
        <ColorPicker label={t("surface")} value={brand.colors.surface} onChange={setColor("surface")} />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("fonts")}
        </p>
        <FontSelector
          label={t("headingFont")}
          value={brand.fonts.heading}
          onChange={(v) => setBrand({ ...brand, fonts: { ...brand.fonts, heading: v } })}
          sample={brand.name || "Titular de ejemplo"}
        />
        <FontSelector
          label={t("bodyFont")}
          value={brand.fonts.body}
          onChange={(v) => setBrand({ ...brand, fonts: { ...brand.fonts, body: v } })}
          sample="Texto de cuerpo para leer cómodo."
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("logo")}
        </p>
        <LogoUpload
          value={brand.logoPath}
          onChange={(path) => setBrand({ ...brand, logoPath: path })}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("style")}
        </p>
        <p className="text-xs text-muted-foreground">{t("styleHint")}</p>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_OPTIONS.map((keyword) => {
            const on = brand.styleKeywords.includes(keyword);
            return (
              <button
                key={keyword}
                onClick={() =>
                  setBrand({
                    ...brand,
                    styleKeywords: on
                      ? brand.styleKeywords.filter((k) => k !== keyword)
                      : [...brand.styleKeywords, keyword],
                  })
                }
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                  on
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-transparent text-foreground border-border hover:border-muted-foreground"
                }`}
              >
                {keyword}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        variant="accent"
        onClick={save}
        disabled={status === "saving"}
        className="w-full"
      >
        {status === "saving" && t("saving")}
        {status === "saved" && (
          <>
            <Check className="h-4 w-4" />
            {t("saved")}
          </>
        )}
        {status === "idle" && t("save")}
      </Button>
    </div>
  );
}

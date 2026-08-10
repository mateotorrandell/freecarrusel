"use client";

import { useEffect, useState } from "react";
import { Palette, X } from "lucide-react";
import { useSidebar } from "./sidebar-context";
import { useLanguage } from "@/lib/i18n";
import type { BrandConfig } from "@/types/brand";

const DISMISS_KEY = "oc-brand-nudge-dismissed";

/**
 * Replaces the old auto-opening brand wizard. If the brand has no name we show
 * a small, dismissible prompt in the bottom-left instead of hijacking the
 * screen on every visit. Dismissal is remembered.
 */
export function BrandNudge() {
  const { t } = useLanguage();
  const { openSection } = useSidebar();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    fetch("/api/brand")
      .then((r) => r.json())
      .then((b: BrandConfig) => {
        if (!b?.name?.trim()) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    // Inline placement: this project's Tailwind theme doesn't emit the whole
    // scale, and a missing `bottom-4` rule dropped the toast to the top-left
    // where it covered the toolbar.
    <div
      style={{ position: "fixed", bottom: 16, left: 16, zIndex: 40, maxWidth: 320 }}
      className="oc-fade"
    >
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface shadow-lg px-3.5 py-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-accent/10 flex items-center justify-center">
          <Palette className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">
            {t("brandNudgeTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
            {t("brandNudgeBody")}
          </p>
          <button
            onClick={() => {
              dismiss();
              openSection("brand");
            }}
            className="mt-2 text-xs font-medium text-accent hover:underline"
          >
            {t("brandNudgeCta")}
          </button>
        </div>
        <button
          onClick={dismiss}
          className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("dismiss")}
          title={t("dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

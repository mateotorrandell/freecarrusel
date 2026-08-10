"use client";

import Link from "next/link";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Palette,
  Home,
  Languages,
  ChevronDown,
} from "lucide-react";
import { BrandPanel } from "@/components/brand/BrandPanel";
import { Logo, LogoLockup } from "./Logo";
import { useSidebar } from "./sidebar-context";
import { useLanguage } from "@/lib/i18n";
import { LANGUAGES } from "@/types/settings";
import { cn } from "@/lib/utils";

/**
 * Collapsible left rail, present on every page via AppShell. Collapsed it's a
 * strip of icons; expanded it opens accordion sections for settings and brand
 * so the user never leaves the page to change them. Open state lives in
 * SidebarContext so the TopBar gear can drive it too.
 */
export function Sidebar() {
  const { t, language, setLanguage } = useLanguage();
  const { open, setOpen, section, toggleSection: toggle } = useSidebar();

  return (
    <aside
      className={cn(
        "shrink-0 rounded-xl border border-border bg-surface flex flex-col min-h-0 overflow-hidden",
        "transition-[width] duration-200 ease-out",
        open ? "w-72" : "w-12"
      )}
    >
      {/* Header / collapse toggle */}
      <div
        className={cn(
          "h-11 shrink-0 border-b border-border flex items-center",
          open ? "px-3 justify-between" : "justify-center"
        )}
      >
        {open ? (
          <>
            <LogoLockup />
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={t("menu")}
              aria-expanded
              title={t("menu")}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        ) : (
          /* Collapsed the mark IS the button: it swaps to the expand icon on
             hover, so the rail stays a clean single glyph until you reach it. */
          <button
            onClick={() => setOpen(true)}
            className="group h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
            aria-label={t("menu")}
            aria-expanded={false}
            title={t("menu")}
          >
            <span className="group-hover:hidden">
              <Logo size={18} />
            </span>
            <PanelLeftOpen className="hidden h-4 w-4 text-foreground group-hover:block" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto min-h-0">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2.5 text-sm text-foreground hover:bg-muted transition-colors",
            open ? "px-3 py-2.5" : "px-0 py-2.5 justify-center"
          )}
          title={t("home")}
        >
          <Home className="h-4 w-4 shrink-0 text-muted-foreground" />
          {open && <span>{t("home")}</span>}
        </Link>

        {/* Settings */}
        <SectionButton
          open={open}
          active={section === "settings"}
          icon={<Settings className="h-4 w-4 shrink-0 text-muted-foreground" />}
          label={t("settings")}
          onClick={() => toggle("settings")}
        />
        {open && section === "settings" && (
          <div className="oc-fade px-3 pb-4 pt-1 space-y-2 border-b border-border">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Languages className="h-3.5 w-3.5" />
              {t("language")}
            </label>
            <select
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value as (typeof LANGUAGES)[number]["value"])
              }
              className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.nativeLabel}
                </option>
              ))}
            </select>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t("languageHint")}
            </p>
          </div>
        )}

        {/* Brand */}
        <SectionButton
          open={open}
          active={section === "brand"}
          icon={<Palette className="h-4 w-4 shrink-0 text-muted-foreground" />}
          label={t("myBrand")}
          onClick={() => toggle("brand")}
        />
        {open && section === "brand" && (
          <div className="oc-fade px-3 pb-6 pt-2">
            <BrandPanel />
          </div>
        )}
      </nav>
    </aside>
  );
}

function SectionButton({
  open,
  active,
  icon,
  label,
  onClick,
}: {
  open: boolean;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 text-sm hover:bg-muted transition-colors",
        open ? "px-3 py-2.5" : "px-0 py-2.5 justify-center",
        active && "bg-muted"
      )}
      aria-expanded={open ? active : undefined}
      title={label}
    >
      {icon}
      {open && (
        <>
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              active && "rotate-180"
            )}
          />
        </>
      )}
    </button>
  );
}

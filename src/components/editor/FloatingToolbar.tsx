"use client";

import { Bold, Italic, Underline, Minus, Plus, Type } from "lucide-react";
import { ColorField } from "./ColorField";
import { useLanguage } from "@/lib/i18n";
import type { SelectedElement } from "@/types/editor";

interface FloatingToolbarProps {
  selected: SelectedElement | null;
  /** `scope: "range"` tells the runtime to format the highlighted run only. */
  onStyle: (
    styles: Record<string, string>,
    opts?: { transient?: boolean; scope?: "range" }
  ) => void;
  onEditText: () => void;
}

/**
 * Quick text bar. It sits in its own row above the canvas rather than floating
 * over the selection: hovering the slide moved the artwork off-centre and hid
 * the very text being edited.
 *
 * Everything here is scoped to the SELECTION. Highlight a few words and the
 * colour, weight and size land on those words only; with nothing highlighted it
 * falls through to the whole block. The properties panel is the opposite — it
 * always edits the block — so the two never fight over the same click.
 */
export function FloatingToolbar({
  selected,
  onStyle,
  onEditText,
}: FloatingToolbarProps) {
  const { t } = useLanguage();
  const active = !!selected && selected.isTextNode;

  // The row is ALWAYS in the layout, even when empty. Mounting it only on
  // selection pushed the canvas down 44px the moment you clicked a text block,
  // so every following click landed 44px above its target — which read as
  // "selection is broken".
  if (!active) {
    return <div className="h-11 shrink-0 border-b border-border bg-surface" />;
  }

  const size = Math.round(selected.fontSize) || 16;
  const bold = Number(selected.fontWeight) >= 600;
  const italic = selected.fontStyle === "italic";
  const underline = (selected.textDecoration || "").includes("underline");
  const run = selected.selectedText?.trim();

  // Every button formats the highlighted run when there is one.
  const style = (styles: Record<string, string>, transient?: boolean) =>
    onStyle(styles, { transient, scope: "range" });

  return (
    <div
      className="oc-fade h-11 shrink-0 border-b border-border bg-surface flex items-center gap-1 px-3 overflow-x-auto"
      // Keep the canvas selection alive when clicking the bar.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={onEditText}
        className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title={t("editOnCanvas")}
      >
        <Type className="h-3.5 w-3.5" />
      </button>

      <Divider />

      <button
        onClick={() => style({ fontSize: `${Math.max(8, size - 4)}px` })}
        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
        title={t("size")}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[34px] text-center text-[11px] font-mono tabular-nums">
        {size}
      </span>
      <button
        onClick={() => style({ fontSize: `${Math.min(240, size + 4)}px` })}
        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
        title={t("size")}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <Divider />

      <Toggle
        on={bold}
        onClick={() => style({ fontWeight: bold ? "400" : "700" })}
        title={t("bold")}
      >
        <Bold className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        on={italic}
        onClick={() => style({ fontStyle: italic ? "normal" : "italic" })}
        title={t("italic")}
      >
        <Italic className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        on={underline}
        onClick={() =>
          style({ textDecoration: underline ? "none" : "underline" })
        }
        title={t("underline")}
      >
        <Underline className="h-3.5 w-3.5" />
      </Toggle>

      <Divider />

      <ColorField
        compact
        label={t("textColor")}
        value={selected.color || "#000000"}
        onPreview={(v) => style({ color: v }, true)}
        onCommit={(v) => style({ color: v })}
      />
      {/* Say out loud what the next click will hit. */}
      <span className="ml-1 text-[11px] text-muted-foreground truncate max-w-[220px]">
        {run ? `“${run}”` : t("wholeBlock")}
      </span>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
        on
          ? "bg-accent/15 text-accent"
          : "text-muted-foreground hover:bg-muted"
      }`}
      title={title}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

"use client";

import { useEffect, useRef } from "react";
import { Copy, Scissors, ClipboardPaste, Trash2, Sparkles } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export interface ContextMenuState {
  /** Position in host-page coordinates. */
  x: number;
  y: number;
}

interface SlideContextMenuProps {
  state: ContextMenuState | null;
  canPaste: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onAskAI: () => void;
}

export function SlideContextMenu({
  state,
  canPaste,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onAskAI,
}: SlideContextMenuProps) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Capture phase: the slide iframe swallows clicks in its own document.
    window.addEventListener("mousedown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("mousedown", away, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  // Keep the menu inside the viewport when right-clicking near an edge.
  const W = 208;
  const H = 210;
  const left = Math.min(state.x, window.innerWidth - W - 8);
  const top = Math.min(state.y, window.innerHeight - H - 8);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ left, top, width: W }}
      className="oc-enter-pop fixed z-50 rounded-xl border border-border bg-surface shadow-xl py-1.5"
      role="menu"
    >
      <Item icon={<Sparkles className="h-3.5 w-3.5 text-accent" />} label={t("askAI")} onClick={run(onAskAI)} accent />
      <div className="my-1 border-t border-border" />
      <Item icon={<Copy className="h-3.5 w-3.5" />} label={t("copy")} onClick={run(onCopy)} />
      <Item icon={<Scissors className="h-3.5 w-3.5" />} label={t("cut")} onClick={run(onCut)} />
      <Item
        icon={<ClipboardPaste className="h-3.5 w-3.5" />}
        label={t("paste")}
        onClick={run(onPaste)}
        disabled={!canPaste}
      />
      <div className="my-1 border-t border-border" />
      <Item
        icon={<Trash2 className="h-3.5 w-3.5" />}
        label={t("delete")}
        onClick={run(onDelete)}
        destructive
      />
    </div>
  );
}

function Item({
  icon,
  label,
  onClick,
  disabled,
  destructive,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${destructive ? "text-destructive hover:bg-destructive/10" : ""}
        ${accent ? "font-medium" : ""}
        ${!destructive ? "hover:bg-muted" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

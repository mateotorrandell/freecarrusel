"use client";

import { useRef, useState } from "react";
import {
  Type,
  Square,
  Image as ImageIcon,
  Sparkle,
  Frame,
  Blend,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export type LayerKind = "text" | "image" | "icon" | "group" | "shape" | "background";

export interface Layer {
  uid: string;
  kind: LayerKind;
  label: string;
  depth: number;
  isText: boolean;
  hidden: boolean;
  canUp: boolean;
  canDown: boolean;
}

interface LayersPanelProps {
  layers: Layer[];
  selectedUid?: string;
  onSelect: (uid: string) => void;
  onToggleHidden: (uid: string) => void;
  onMove: (uid: string, dir: "up" | "down") => void;
  /** Drop `uid` in front of (`above: true`) or behind `targetUid`. */
  onReorder: (uid: string, targetUid: string, above: boolean) => void;
  onRemove: (uid: string) => void;
}

const ICONS = {
  text: Type,
  image: ImageIcon,
  icon: Sparkle,
  group: Square,
  shape: Blend,
  background: Frame,
} as const;

/**
 * Element tree for the current slide, Canva-style: only things the user can
 * actually manipulate. The runtime already drops scripts, <br>, and zero-size
 * wrappers, so what lands here is real layers.
 *
 * The list runs FRONT TO BACK — the first row is what covers everything else —
 * so dragging a row upwards brings that layer forward. That direction has to
 * match the arrows and the drag, or the panel lies about the stack.
 */
export function LayersPanel({
  layers,
  selectedUid,
  onSelect,
  onToggleHidden,
  onMove,
  onReorder,
  onRemove,
}: LayersPanelProps) {
  const { t } = useLanguage();
  // Reordering runs on plain pointer events, not HTML5 drag-and-drop. The
  // native API kept firing dragstart and dragover and then ending in dragend
  // with no drop at all once the pointer crossed more than one row — the list
  // re-renders as the indicator moves and the browser abandons a drag whose
  // target went away. Pointer events have no such contract to lose.
  const drag = useRef<{ uid: string; y: number; active: boolean } | null>(null);
  const [over, setOver] = useState<{ uid: string; above: boolean } | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  /** Which row the pointer is on, and whether it's the front or back half. */
  const rowAt = (clientY: number) => {
    for (const [uid, el] of rows.current) {
      const box = el.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) {
        return { uid, above: clientY < box.top + box.height / 2 };
      }
    }
    return null;
  };

  const onDown = (e: React.MouseEvent) => {
    // Buttons inside a row (eye, trash, arrows, the label itself) keep working:
    // a press only becomes a drag once the pointer actually travels.
    const target = rowAt(e.clientY);
    if (!target || e.button !== 0) return;
    drag.current = { uid: target.uid, y: e.clientY, active: false };

    const move = (ev: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active && Math.abs(ev.clientY - d.y) < 5) return;
      d.active = true;
      ev.preventDefault();
      const at = rowAt(ev.clientY);
      setOver((o) =>
        !at || at.uid === d.uid
          ? null
          : o?.uid === at.uid && o.above === at.above
            ? o
            : at
      );
    };

    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const d = drag.current;
      drag.current = null;
      setOver(null);
      if (!d?.active) return; // a click, not a drag — let it select
      const at = rowAt(ev.clientY);
      if (at && at.uid !== d.uid) onReorder(d.uid, at.uid, at.above);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const fallback: Record<LayerKind, string> = {
    text: t("layerText"),
    image: t("layerImage"),
    icon: t("layerIcon"),
    group: t("layerGroup"),
    shape: t("layerShape"),
    background: t("layerBackground"),
  };

  if (layers.length === 0) {
    return (
      <p className="px-3 py-4 text-[11px] text-muted-foreground">
        {t("noLayers")}
      </p>
    );
  }

  return (
    <div className="py-1" onMouseDown={onDown}>
      {layers.map((l) => {
        const Icon = ICONS[l.kind] ?? Square;
        const active = l.uid === selectedUid;
        const marker = over?.uid === l.uid ? over.above : null;
        return (
          <div
            key={l.uid}
            ref={(el) => {
              if (el) rows.current.set(l.uid, el);
              else rows.current.delete(l.uid);
            }}
            className={`group flex items-center gap-1 pr-1.5 transition-colors cursor-grab active:cursor-grabbing ${
              active ? "bg-accent/10" : "hover:bg-muted"
            }`}
            style={{
              boxShadow:
                marker === true
                  ? "inset 0 2px 0 0 var(--accent)"
                  : marker === false
                    ? "inset 0 -2px 0 0 var(--accent)"
                    : undefined,
            }}
          >
            <button
              onClick={() => onSelect(l.uid)}
              style={{ paddingLeft: 10 + Math.min(l.depth, 5) * 12 }}
              className={`flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left text-xs ${
                active ? "text-accent font-medium" : "text-foreground"
              } ${l.hidden ? "opacity-40" : ""}`}
              title={l.label || fallback[l.kind]}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="truncate">{l.label || fallback[l.kind]}</span>
            </button>

            {/* Up is toward the front, matching the order the list reads in. */}
            <IconButton
              onClick={() => onMove(l.uid, "up")}
              disabled={!l.canUp}
              title={t("bringForward")}
            >
              <ChevronUp className="h-3 w-3" />
            </IconButton>
            <IconButton
              onClick={() => onMove(l.uid, "down")}
              disabled={!l.canDown}
              title={t("sendBackward")}
            >
              <ChevronDown className="h-3 w-3" />
            </IconButton>

            <button
              onClick={() => onToggleHidden(l.uid)}
              className={`h-5 w-5 shrink-0 rounded flex items-center justify-center transition-opacity ${
                l.hidden
                  ? "text-accent opacity-100"
                  : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
              }`}
              title={l.hidden ? t("showLayer") : t("hideLayer")}
              aria-label={l.hidden ? t("showLayer") : t("hideLayer")}
            >
              {l.hidden ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </button>

            {/* Deleting is separate from hiding on purpose: the eye is a view
                toggle, this is the one that removes the element. */}
            <IconButton
              onClick={() => onRemove(l.uid)}
              title={t("delete")}
              danger
            >
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-5 w-5 shrink-0 rounded flex items-center justify-center disabled:opacity-20 opacity-0 group-hover:opacity-100 disabled:group-hover:opacity-20 ${
        danger
          ? "text-muted-foreground hover:text-destructive"
          : "text-muted-foreground hover:text-foreground"
      }`}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

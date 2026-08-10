"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ResizablePanelProps {
  /** localStorage key so each panel remembers its own width. */
  storageKey: string;
  defaultWidth: number;
  min?: number;
  max?: number;
  /** Which edge of the layout the panel is docked to. */
  side?: "left" | "right";
  children: React.ReactNode;
  className?: string;
  /** Tooltip for the drag handle. */
  title?: string;
  /**
   * Whether the panel can be folded away. The chat is always on screen — you
   * can only change how wide it is — so it opts out.
   */
  collapsible?: boolean;
}

/**
 * Side panel the user can drag to resize, with the width persisted.
 *
 * Width is an inline style rather than a Tailwind class on purpose: this
 * project's `@theme` doesn't emit the full spacing scale, so classes like
 * `w-72` silently produce no rule at all and the panel stretches to fill the
 * row. Inline px can't fall through like that.
 */
export function ResizablePanel({
  storageKey,
  defaultWidth,
  min = 220,
  max = 640,
  side = "right",
  children,
  className = "",
  title,
  collapsible = true,
}: ResizablePanelProps) {
  // Read the stored width during the initial state computation rather than in
  // an effect: setting it afterwards causes a cascading render and a visible
  // jump from the default width to the saved one.
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth;
    const saved = Number(window.localStorage.getItem(storageKey));
    return saved >= min && saved <= max ? saved : defaultWidth;
  });
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || !boxRef.current) return;
      const box = boxRef.current.getBoundingClientRect();
      // Measure from the panel's own fixed edge: a left-docked panel grows as
      // the cursor moves right, a right-docked one as it moves left.
      const raw = side === "left" ? e.clientX - box.left : box.right - e.clientX;
      setWidth(Math.min(max, Math.max(min, raw)));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        window.localStorage.setItem(storageKey, String(w));
        return w;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [min, max, storageKey, side]);

  if (collapsed && collapsible) {
    return (
      <div className="relative shrink-0 w-8 rounded-xl border border-border bg-surface flex justify-center pt-2">
        <button
          onClick={() => setCollapsed(false)}
          className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={title}
          aria-label={title}
        >
          {side === "left" ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      style={{ width }}
      className={`relative shrink-0 rounded-xl border border-border bg-surface flex flex-col min-h-0 ${className}`}
    >
      {/* Visible collapse control — an invisible drag strip alone was
          undiscoverable, so there was no obvious way to get the space back. */}
      {collapsible && (
        <button
          onClick={() => setCollapsed(true)}
          style={{ zIndex: 25, [side === "left" ? "right" : "left"]: -12, top: 12 }}
          className="absolute h-6 w-6 rounded-full border border-border bg-surface shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
          title={title}
          aria-label={title}
        >
          {side === "left" ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {/* Grab strip in the gutter between panels, with a visible grip so it's
          findable. A 6px invisible hit area was there before and nobody could
          find it. */}
      <div
        onMouseDown={onDown}
        onDoubleClick={() => setWidth(defaultWidth)}
        style={{ zIndex: 20, [side === "left" ? "right" : "left"]: -8 }}
        className="group absolute top-0 h-full w-4 cursor-col-resize flex items-center justify-center"
        role="separator"
        aria-orientation="vertical"
        title={title}
      >
        <div className="absolute flex flex-col gap-0.5 rounded-full bg-border group-hover:bg-accent px-[3px] py-1.5 transition-colors">
          <span className="block h-0.5 w-0.5 rounded-full bg-surface" />
          <span className="block h-0.5 w-0.5 rounded-full bg-surface" />
          <span className="block h-0.5 w-0.5 rounded-full bg-surface" />
        </div>
      </div>
      {children}
    </div>
  );
}

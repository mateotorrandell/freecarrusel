"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { wrapSlideHtml } from "@/lib/slide-html";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import type { SelectedElement } from "@/types/editor";
import type { Layer } from "./LayersPanel";

interface SlideCanvasProps {
  html: string;
  aspectRatio: AspectRatio;
  onSelect: (element: SelectedElement | null) => void;
  onChange: (html: string, transient: boolean) => void;
  /** Right-click position, in the slide's own coordinate space. */
  onContextMenu: (x: number, y: number) => void;
  /** Markup produced by a copy/cut, for the app-level clipboard. */
  onClipboard: (html: string) => void;
  /** Markup of the selected element, requested for the AI attachment. */
  onElementHtml: (html: string, element: SelectedElement) => void;
  /** Element tree, refreshed whenever the slide changes. */
  onLayers: (layers: Layer[]) => void;
  /** Bumped by the parent to force a reload (e.g. switching slides). */
  reloadKey: string;
  /** Owned by the parent so the properties panel can post commands in. */
  frameRef: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * Editable slide surface. The iframe gets `allow-scripts` but deliberately NOT
 * `allow-same-origin`, so the document lives in an opaque origin and can't
 * touch the app, its cookies or storage. postMessage is the only channel, and
 * we verify every message came from this iframe's own window.
 */
export function SlideCanvas({
  html,
  aspectRatio,
  onSelect,
  onChange,
  onContextMenu,
  onClipboard,
  onElementHtml,
  onLayers,
  reloadKey,
  frameRef,
}: SlideCanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { width: slideW, height: slideH } = DIMENSIONS[aspectRatio];

  // Built once per slide load. Live edits happen inside the iframe, so we must
  // NOT rebuild srcDoc on every change or the document would reset mid-edit.
  const srcDoc = useMemo(
    () => wrapSlideHtml(html, aspectRatio, { editable: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadKey, aspectRatio]
  );

  const measure = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setDims({ w: rect.width, h: rect.height });
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, [measure]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Opaque-origin frames report origin "null", so identity is established
      // by comparing the source window, not the origin string.
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const d = e.data as
        | {
            source?: string;
            type?: string;
            element?: SelectedElement | null;
            html?: string;
            x?: number;
            y?: number;
            layers?: Layer[];
            transient?: boolean;
          }
        | undefined;
      if (!d || d.source !== "oc-editor") return;

      if (d.type === "select") onSelect(d.element ?? null);
      else if (d.type === "change" && typeof d.html === "string") onChange(d.html, !!d.transient);
      else if (d.type === "contextmenu" && typeof d.x === "number" && typeof d.y === "number") {
        onSelect(d.element ?? null);
        onContextMenu(d.x, d.y);
      } else if (d.type === "clipboard" && typeof d.html === "string") {
        onClipboard(d.html);
      } else if (d.type === "elementHtml" && typeof d.html === "string" && d.element) {
        onElementHtml(d.html, d.element);
      } else if (d.type === "layers" && Array.isArray(d.layers)) {
        onLayers(d.layers);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSelect, onChange, onContextMenu, onClipboard, onElementHtml, onLayers, frameRef]);

  const scale = dims ? Math.min(dims.w / slideW, dims.h / slideH) : 0;

  return (
    <div
      ref={outerRef}
      className="flex-1 min-h-0 flex items-center justify-center p-6 bg-muted/40"
    >
      {scale > 0 && (
        <div
          style={{
            width: Math.floor(slideW * scale),
            height: Math.floor(slideH * scale),
            overflow: "hidden",
            borderRadius: 8,
            position: "relative",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <iframe
            ref={frameRef}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            title="Slide editor"
            style={{
              width: slideW,
              height: slideH,
              border: "none",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
        </div>
      )}
    </div>
  );
}

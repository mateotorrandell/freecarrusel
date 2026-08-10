"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { wrapSlideHtml } from "@/lib/slide-html";
import { DIMENSIONS, type AspectRatio } from "@/types/carousel";

/**
 * Read-only view of a slide, scaled to fit whatever box it is given.
 *
 * The slide renders at its true size (1080 wide) inside an iframe and is scaled
 * with a transform, rather than being re-laid-out smaller. That way a thumbnail
 * and the exported PNG are the same composition — type doesn't reflow, and a
 * headline that fits here fits there.
 *
 * `sandbox=""` with no tokens: no scripts, no forms, no navigation. This is the
 * viewer, not the editor.
 */
export function SlideRenderer({
  html,
  aspectRatio,
  className,
  style,
}: {
  html: string;
  aspectRatio: AspectRatio;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const { width: nativeW, height: nativeH } = DIMENSIONS[aspectRatio];

  const document = useMemo(
    () => wrapSlideHtml(html, aspectRatio),
    [html, aspectRatio]
  );

  const measure = useCallback(() => {
    const box = hostRef.current?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0) {
      setAvailable({ width: box.width, height: box.height });
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // ResizeObserver reports the current size as soon as it starts observing,
    // so there is no need to measure by hand first — doing that set state
    // during the effect and triggered a second render for nothing.
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [measure]);

  const scale = available.width
    ? Math.min(available.width / nativeW, available.height / nativeH)
    : 0;

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {scale > 0 && (
        <div
          style={{
            position: "relative",
            width: Math.floor(nativeW * scale),
            height: Math.floor(nativeH * scale),
            overflow: "hidden",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
          }}
        >
          <iframe
            sandbox=""
            srcDoc={document}
            title="Slide"
            tabIndex={-1}
            style={{
              position: "absolute",
              inset: 0,
              width: nativeW,
              height: nativeH,
              border: "none",
              pointerEvents: "none",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      )}
    </div>
  );
}

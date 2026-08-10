"use client";

import { DIMENSIONS, type AspectRatio } from "@/types/carousel";

/**
 * Where Instagram will cover or crop your slide.
 *
 * Three things eat into a carousel and none of them are visible while you
 * design: the profile grid crops a portrait post to a centre square, the app's
 * own buttons sit over the bottom of the feed view, and anything near an edge
 * reads as cramped. This draws all three so a headline doesn't end up under a
 * "Save" icon.
 */

/** Share of the height covered by the feed's action row. */
const APP_CHROME = 14;
/** Breathing room to keep clear of every edge. */
const MARGIN = 10;

export function SafeZoneOverlay({
  aspectRatio,
  visible,
}: {
  aspectRatio: AspectRatio;
  visible: boolean;
}) {
  if (!visible) return null;

  const { width, height } = DIMENSIONS[aspectRatio];
  const portrait = height > width;
  // The grid shows a square, so a portrait slide loses a band top and bottom.
  const cropped = portrait ? ((height - width) / 2 / height) * 100 : 0;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {portrait && (
        <>
          <Zone
            style={{ top: 0, height: `${cropped}%` }}
            className="border-b bg-red-500/10 border-red-400/50"
            label="Grid crop"
            labelClass="bottom-1 left-2 text-red-500/70"
          />
          <Zone
            style={{ bottom: 0, height: `${cropped}%` }}
            className="border-t bg-red-500/10 border-red-400/50"
            label="Grid crop"
            labelClass="top-1 left-2 text-red-500/70"
          />
        </>
      )}

      <Zone
        style={{ bottom: 0, height: `${APP_CHROME}%` }}
        className="border-t bg-blue-500/10 border-blue-400/40"
        label="App buttons"
        labelClass="top-1 right-2 text-blue-500/60"
      />

      <div
        className="absolute rounded-sm border border-dashed border-emerald-400/40"
        style={{
          left: `${MARGIN}%`,
          right: `${MARGIN}%`,
          top: `${MARGIN}%`,
          bottom: `${Math.max(MARGIN, APP_CHROME + 2)}%`,
        }}
      >
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1 text-[8px] font-medium text-emerald-300">
          Safe zone
        </span>
      </div>
    </div>
  );
}

function Zone({
  style,
  className,
  label,
  labelClass,
}: {
  style: React.CSSProperties;
  className: string;
  label: string;
  labelClass: string;
}) {
  return (
    <div className={`absolute left-0 right-0 border-dashed ${className}`} style={style}>
      <span className={`absolute text-[8px] font-medium ${labelClass}`}>{label}</span>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";

import {
  MousePointerSquareDashed,
  Trash2,
  Copy,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
} from "lucide-react";
import { ColorField } from "./ColorField";
import { BackgroundSection } from "./BackgroundSection";
import { FontSelector } from "@/components/brand/FontSelector";
import { useLanguage } from "@/lib/i18n";
import type { SelectedElement } from "@/types/editor";
import type { ReferenceImage } from "@/types/carousel";

interface PropertiesPanelProps {
  selected: SelectedElement | null;
  onStyle: (styles: Record<string, string>, transient?: boolean) => void;
  onText: (text: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Focus the block on the canvas for rich-text editing. */
  onEditOnCanvas: () => void;
  /** Replace the file behind an <img> layer. */
  onSetSrc: (url: string) => void;
  /** Carousel images, offered as backdrops for background/shape layers. */
  images: ReferenceImage[];
}

const WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];

export function PropertiesPanel({
  selected,
  onStyle,
  onText,
  onDelete,
  onDuplicate,
  onEditOnCanvas,
  onSetSrc,
  images,
}: PropertiesPanelProps) {
  const { t } = useLanguage();

  if (!selected) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <MousePointerSquareDashed className="h-9 w-9 text-muted-foreground mb-3" />
        <h3 className="text-sm font-semibold mb-1">{t("nothingSelected")}</h3>
        <p className="text-xs text-muted-foreground max-w-[220px]">
          {t("nothingSelectedHint")}
        </p>
      </div>
    );
  }

  const align = (v: string) => onStyle({ textAlign: v });
  const isText = selected.isTextNode;
  const bgImage = selected.backgroundImage || "";
  // A PATTERN repeats at an explicit size — a grid, stripes, dots. A gradient
  // that simply covers the box is a wash (designers call it a scrim) and needs
  // the gradient editor instead: recolouring one like a pattern flattened it
  // into a single solid colour.
  const tiled =
    selected.backgroundRepeat !== "no-repeat" &&
    !/^(auto|cover|contain)/.test(selected.backgroundSize || "auto");
  const isPattern = !isText && bgImage.includes("gradient") && tiled;
  // A wash over a photo: dark at one end, transparent at the other. Its whole
  // job is that fade, so its colour control has to keep every stop's alpha.
  const isScrim = !isText && bgImage.includes("gradient") && !tiled;
  const hasFill = !isText && bgImage !== "" && !isScrim;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t("properties")}</h2>
          <p className="text-[11px] text-muted-foreground">
            {selected.label || t(("layer" + selected.kind.charAt(0).toUpperCase() + selected.kind.slice(1)) as never)}
            {" · "}
            {selected.width}×{selected.height}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onDuplicate}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
            title={t("duplicate")}
            aria-label={t("duplicate")}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted"
            title={t("delete")}
            aria-label={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-5">
        {/* Controls are chosen by what the element IS. A background has no
            typography; a decorative box with no words has no text colour. */}

        {isText && selected.hasInlineFormatting && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("text")}
            </label>
            <p className="mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
              {selected.text}
            </p>
            <button
              onClick={onEditOnCanvas}
              className="mt-1.5 w-full rounded-lg border border-accent/50 text-accent text-xs py-1.5 hover:bg-accent/10 transition-colors"
            >
              {t("editOnCanvas")}
            </button>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {t("richTextHint")}
            </p>
          </div>
        )}

        {isText && !selected.hasInlineFormatting && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("text")}
            </label>
            {/* Uncontrolled and keyed on the selection: the runtime is the
                source of truth for text, so mirroring it in React state would
                just fight the caret while typing. */}
            <textarea
              key={selected.uid}
              defaultValue={selected.text}
              onChange={(e) => onText(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {isText && (
          <>
            <FontSelector
              label={t("fonts")}
              value={selected.fontFamily || "Inter"}
              onChange={(v) => onStyle({ fontFamily: `'${v}', sans-serif` })}
              sample={selected.text || "Aa Bb Cc"}
            />

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label={t("size")}
                value={selected.fontSize}
                min={8}
                max={240}
                onChange={(v) => onStyle({ fontSize: `${v}px` })}
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {t("weight")}
                </label>
                <select
                  value={String(parseInt(selected.fontWeight, 10) || 400)}
                  onChange={(e) => onStyle({ fontWeight: e.target.value })}
                  className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {WEIGHTS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("align")}
              </label>
              <div className="mt-1 flex gap-1">
                {[
                  { v: "left", Icon: AlignLeft },
                  { v: "center", Icon: AlignCenter },
                  { v: "right", Icon: AlignRight },
                ].map(({ v, Icon }) => (
                  <button
                    key={v}
                    onClick={() => align(v)}
                    className={`h-9 flex-1 rounded-lg border flex items-center justify-center transition-colors ${
                      selected.textAlign === v
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                    aria-label={v}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <ColorField
              label={t("textColor")}
              value={selected.color || "#000000"}
              onPreview={(v) => onStyle({ color: v }, true)}
              onCommit={(v) => onStyle({ color: v })}
            />
          </>
        )}

        {/* An icon is drawn in the text colour, so that one control stays. */}
        {selected.kind === "icon" && (
          <ColorField
            label={t("textColor")}
            value={selected.color || "#000000"}
            onPreview={(v) => onStyle({ color: v }, true)}
            onCommit={(v) => onStyle({ color: v })}
          />
        )}

        {/* A pattern (grid, stripes, dotted wash) is painted by its background
            image. Offering a solid fill here would drop an opaque sheet over
            the whole slide — which is exactly what turned a grid into a red
            rectangle. Recolour the pattern itself instead. */}
        {isPattern && (
          <div>
            <ColorField
              label={t("patternColor")}
              value={patternColor(selected.backgroundImage) || "#0a0a0a"}
              onPreview={(v) =>
                onStyle(
                  { backgroundImage: recolorPattern(selected.backgroundImage, v) },
                  true
                )
              }
              onCommit={(v) =>
                onStyle({
                  backgroundImage: recolorPattern(selected.backgroundImage, v),
                })
              }
            />
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {t("patternHint")}
            </p>
          </div>
        )}

        {/* A gradient wash keeps its fade: only the hue changes, every stop
            keeps the alpha and position the design gave it. Rebuilding it from
            two solid colours is what turned it into a flat block that hid the
            photo underneath. */}
        {isScrim && (
          <div>
            <ColorField
              label={t("gradientColor")}
              value={patternColor(bgImage) || "#000000"}
              onPreview={(v) =>
                onStyle({ backgroundImage: recolorKeepingAlpha(bgImage, v) }, true)
              }
              onCommit={(v) =>
                onStyle({ backgroundImage: recolorKeepingAlpha(bgImage, v) })
              }
            />
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {t("gradientHint")}
            </p>
          </div>
        )}

        {/* Swap the photo behind an <img> layer. Without this the only way to
            change a picture was asking the assistant to rewrite the slide. */}
        {selected.kind === "image" && (
          <ImagePicker current={selected.src} images={images} onPick={onSetSrc} />
        )}

        {/* Fill controls for the surfaces that carry the artwork: flat colour,
            gradient, or one of the carousel's photos. */}
        {!isPattern &&
          (selected.kind === "background" ||
            selected.kind === "shape" ||
            hasFill) && (
            <BackgroundSection
              color={selected.background}
              image={bgImage}
              images={images}
              onStyle={onStyle}
            />
          )}

        {/* Boxes that hold something (a badge, a card) get a plain fill. */}
        {(selected.kind === "group" || isText) && (
          <div>
            <ColorField
              label={t("bgColor")}
              value={selected.background || "#ffffff"}
              onPreview={(v) => onStyle({ backgroundColor: v }, true)}
              onCommit={(v) => onStyle({ backgroundColor: v })}
            />
            <div className="flex items-center gap-2 mt-1 pl-12">
              {!selected.background && (
                <span className="text-[11px] text-muted-foreground">
                  {t("transparent")}
                </span>
              )}
              {selected.background && (
                <button
                  onClick={() => onStyle({ backgroundColor: "transparent" })}
                  className="text-[11px] text-muted-foreground hover:text-accent underline"
                >
                  {t("makeTransparent")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Geometry. The background IS the slide, so it has no box to move. */}
        {selected.kind !== "background" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label={t("width")}
                value={selected.width}
                min={1}
                max={4000}
                onChange={(v) => onStyle({ width: `${v}px` })}
              />
              <NumberField
                label={t("height")}
                value={selected.height}
                min={1}
                max={4000}
                onChange={(v) => onStyle({ height: `${v}px` })}
              />
              <NumberField
                label="X"
                value={selected.offsetX}
                min={-4000}
                max={4000}
                onChange={(v) =>
                  onStyle({
                    position:
                      selected.position === "static" ? "relative" : selected.position,
                    left: `${v}px`,
                  })
                }
              />
              <NumberField
                label="Y"
                value={selected.offsetY}
                min={-4000}
                max={4000}
                onChange={(v) =>
                  onStyle({
                    position:
                      selected.position === "static" ? "relative" : selected.position,
                    top: `${v}px`,
                  })
                }
              />
            </div>

            <NumberField
              label={t("radius")}
              value={selected.borderRadius}
              min={0}
              max={400}
              onChange={(v) => onStyle({ borderRadius: `${v}px` })}
            />
          </>
        )}

        {/* Opacity is a feel, not a number you look up: drag it and watch the
            slide. Dragging previews (no undo entry); letting go commits one.

            Never offered on the root: it holds every other layer, so fading it
            fades the whole design — which is not what anyone means by
            "background opacity". */}
        {selected.kind === "background" ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("rootOpacityHint")}
          </p>
        ) : (
          <SliderField
            label={t("opacity")}
            value={Math.round(
              (selected.opacity === "" ? 1 : parseFloat(selected.opacity)) * 100
            )}
            onPreview={(v) => onStyle({ opacity: String(v / 100) }, true)}
            onCommit={(v) => onStyle({ opacity: String(v / 100) })}
          />
        )}

        <p className="text-[11px] leading-snug text-muted-foreground border-t border-border pt-3">
          {t("editorHint")}
        </p>
      </div>
    </div>
  );
}

/**
 * 0–100 % slider. `input` fires continuously while dragging (preview, no undo
 * step); `change` fires once on release, which is the one edit worth undoing.
 */
function SliderField({
  label,
  value,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onPreview(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="mt-2 w-full accent-[var(--accent)] cursor-pointer"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

/**
 * The colour a repeating background pattern is drawn in — the first stop that
 * isn't transparent. Used to seed the swatch.
 */
function patternColor(image: string): string {
  const m = (image || "").match(/rgba?\(([^)]+)\)/g) || [];
  for (const raw of m) {
    const parts = raw
      .replace(/rgba?\(|\)/g, "")
      .split(",")
      .map((x) => parseFloat(x.trim()));
    if (parts.length > 3 && parts[3] === 0) continue; // a transparent stop
    return (
      "#" +
      parts
        .slice(0, 3)
        .map((n) => Math.round(n).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return "";
}

/**
 * Repaint a pattern without touching its geometry: every visible colour stop
 * takes the new hue and keeps its own alpha, and the transparent stops (the
 * gaps between the grid lines) are left alone.
 */
function recolorPattern(image: string, hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (image || "").replace(/rgba?\(([^)]+)\)/g, (whole, inner: string) => {
    const parts = inner.split(",").map((x) => x.trim());
    const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if (alpha === 0) return whole; // a gap between the lines: leave it alone
    // Full strength on purpose. Keeping the old alpha meant picking a colour on
    // a 4%-black grid produced a 4% version of it — invisible, and it read as
    // "the control does nothing". How subtle it looks is the opacity slider's
    // job, right below.
    return `rgb(${r}, ${g}, ${b})`;
  });
}

/**
 * Swap the file behind an <img> layer: pick one already in the carousel or
 * upload a new one. Uploading from here matters because the assistant's own
 * downloads don't always land in the reference list, and then the grid below
 * would be empty with no way out.
 */
function ImagePicker({
  current,
  images,
  onPick,
}: {
  current: string;
  images: ReferenceImage[];
  onPick: (url: string) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      if (res.ok) {
        const data: { url?: string } = await res.json();
        if (data.url) onPick(data.url);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("layerImage")}
      </p>

      {current && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={current}
          alt=""
          className="w-full h-24 object-cover rounded-lg border border-border"
        />
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => onPick(img.url)}
              className={`aspect-square rounded-md overflow-hidden border transition-colors ${
                img.url === current
                  ? "border-accent"
                  : "border-border hover:border-accent"
              }`}
              title={img.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.name}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        <Upload className="h-3 w-3" />
        {busy ? t("uploading") : t("changeImage")}
      </button>
    </div>
  );
}

/**
 * Recolour a gradient without touching its shape: every stop keeps its own
 * alpha and its position along the fade, so a scrim that goes from clear to
 * 85 % black stays a scrim — it just fades to a different colour.
 */
function recolorKeepingAlpha(image: string, hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (image || "").replace(/rgba?\(([^)]+)\)/g, (_whole, inner: string) => {
    const parts = inner.split(",").map((x) => x.trim());
    const alpha = parts.length > 3 ? parts[3] : "1";
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
}

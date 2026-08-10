"use client";

import { useState } from "react";
import { Paintbrush, Image as ImageIcon, Blend, X } from "lucide-react";
import { ColorField } from "./ColorField";
import { useLanguage } from "@/lib/i18n";
import type { ReferenceImage } from "@/types/carousel";

interface BackgroundSectionProps {
  /** Current background colour of the selected element, "" when transparent. */
  color: string;
  /** Current `background-image`, so the editor opens on what is actually there. */
  image?: string;
  /** Images already uploaded to this carousel, usable as a backdrop. */
  images: ReferenceImage[];
  onStyle: (styles: Record<string, string>, transient?: boolean) => void;
}

type Mode = "color" | "gradient" | "image";

const GRADIENT_ANGLES = [
  { label: "↘", value: "135deg" },
  { label: "→", value: "90deg" },
  { label: "↓", value: "180deg" },
  { label: "◜", value: "circle at 30% 20%" },
];

/**
 * Fill controls for a background or shape layer: flat colour, a two-stop
 * gradient, or one of the carousel's own images. Without this the only way to
 * restyle the canvas was typing CSS by hand.
 */
export function BackgroundSection({
  color,
  image = "",
  images,
  onStyle,
}: BackgroundSectionProps) {
  const { t } = useLanguage();
  // Open on the fill that is actually there. Defaulting to "color" meant
  // selecting a photo or a gradient showed the solid-colour tab, and one click
  // painted over the artwork.
  const initial: Mode = image.includes("gradient")
    ? "gradient"
    : image.includes("url(")
      ? "image"
      : "color";
  const stops = readStops(image);
  const [mode, setMode] = useState<Mode>(initial);
  const [from, setFrom] = useState(stops[0] || "#14120F");
  const [to, setTo] = useState(stops[1] || "#E2653C");
  const [angle, setAngle] = useState(readAngle(image) || "135deg");

  const applyGradient = (f = from, tcol = to, a = angle) => {
    const css = a.startsWith("circle")
      ? `radial-gradient(${a}, ${f}, ${tcol})`
      : `linear-gradient(${a}, ${f}, ${tcol})`;
    onStyle({ backgroundImage: css });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("fill")}
      </p>

      <div className="flex gap-1">
        <ModeTab active={mode === "color"} onClick={() => setMode("color")} icon={<Paintbrush className="h-3.5 w-3.5" />} label={t("solid")} />
        <ModeTab active={mode === "gradient"} onClick={() => setMode("gradient")} icon={<Blend className="h-3.5 w-3.5" />} label={t("gradient")} />
        <ModeTab active={mode === "image"} onClick={() => setMode("image")} icon={<ImageIcon className="h-3.5 w-3.5" />} label={t("layerImage")} />
      </div>

      {mode === "color" && (
        <ColorField
          label={t("bgColor")}
          value={color || "#ffffff"}
          onPreview={(v) => onStyle({ backgroundImage: "none", backgroundColor: v }, true)}
          onCommit={(v) => onStyle({ backgroundImage: "none", backgroundColor: v })}
        />
      )}

      {mode === "gradient" && (
        <div className="space-y-2">
          <ColorField
            label={t("from")}
            value={from}
            onPreview={(v) => { setFrom(v); applyGradient(v, to, angle); }}
            onCommit={(v) => { setFrom(v); applyGradient(v, to, angle); }}
          />
          <ColorField
            label={t("to")}
            value={to}
            onPreview={(v) => { setTo(v); applyGradient(from, v, angle); }}
            onCommit={(v) => { setTo(v); applyGradient(from, v, angle); }}
          />
          <div className="flex gap-1">
            {GRADIENT_ANGLES.map((g) => (
              <button
                key={g.value}
                onClick={() => { setAngle(g.value); applyGradient(from, to, g.value); }}
                className={`h-8 flex-1 rounded-lg border text-sm transition-colors ${
                  angle === g.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "image" && (
        <div className="space-y-2">
          {images.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t("noImagesYet")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() =>
                    onStyle({
                      backgroundImage: `url('${img.url}')`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    })
                  }
                  className="aspect-square rounded-md overflow-hidden border border-border hover:border-accent transition-colors"
                  title={img.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() =>
          onStyle({ backgroundImage: "none", backgroundColor: "transparent" })
        }
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <X className="h-3 w-3" />
        {t("clearFill")}
      </button>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** The first two colour stops of a CSS gradient, as hex. */
function readStops(image: string): string[] {
  const out: string[] = [];
  for (const raw of image.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g) || []) {
    if (raw.startsWith("#")) {
      out.push(raw);
      continue;
    }
    const p = raw
      .replace(/rgba?\(|\)/g, "")
      .split(",")
      .map((x) => parseFloat(x.trim()));
    // Fully transparent stops carry no colour worth showing in a swatch.
    if (p.length > 3 && p[3] === 0) continue;
    out.push(
      "#" +
        p
          .slice(0, 3)
          .map((n) => Math.round(n).toString(16).padStart(2, "0"))
          .join("")
    );
  }
  return out;
}

/** The direction of a linear gradient, or the shape of a radial one. */
function readAngle(image: string): string {
  const linear = image.match(/linear-gradient\(\s*(-?[\d.]+deg|to [a-z ]+)/);
  if (linear) return linear[1];
  if (image.includes("radial-gradient")) return "circle at 30% 20%";
  return "";
}

"use client";

import { useState } from "react";
import { SlidersHorizontal, Layers as LayersIcon } from "lucide-react";
import { PropertiesPanel } from "./PropertiesPanel";
import { LayersPanel, type Layer } from "./LayersPanel";
import { useLanguage } from "@/lib/i18n";
import type { SelectedElement } from "@/types/editor";
import type { ReferenceImage } from "@/types/carousel";

interface EditorPanelProps {
  selected: SelectedElement | null;
  layers: Layer[];
  onSelectLayer: (uid: string) => void;
  onToggleHidden: (uid: string) => void;
  onMoveLayer: (uid: string, dir: "up" | "down") => void;
  onReorderLayer: (uid: string, targetUid: string, above: boolean) => void;
  onRemoveLayer: (uid: string) => void;
  onStyle: (styles: Record<string, string>, transient?: boolean) => void;
  onText: (text: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditOnCanvas: () => void;
  onSetSrc: (url: string) => void;
  images: ReferenceImage[];
}

/**
 * Two tabs in one column — Edit and Layers. Stacking them ate the vertical
 * space and left the properties squeezed into a sliver.
 */
export function EditorPanel(props: EditorPanelProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"edit" | "layers">("edit");

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex shrink-0 border-b border-border">
        <Tab
          active={tab === "edit"}
          onClick={() => setTab("edit")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label={t("edit")}
        />
        <Tab
          active={tab === "layers"}
          onClick={() => setTab("layers")}
          icon={<LayersIcon className="h-3.5 w-3.5" />}
          label={t("layers")}
          badge={props.layers.length}
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "edit" ? (
          <PropertiesPanel
            selected={props.selected}
            onStyle={props.onStyle}
            onText={props.onText}
            onDelete={props.onDelete}
            onDuplicate={props.onDuplicate}
            onEditOnCanvas={props.onEditOnCanvas}
            onSetSrc={props.onSetSrc}
            images={props.images}
          />
        ) : (
          <LayersPanel
            layers={props.layers}
            selectedUid={props.selected?.uid}
            onSelect={props.onSelectLayer}
            onToggleHidden={props.onToggleHidden}
            onMove={props.onMoveLayer}
            onReorder={props.onReorderLayer}
            onRemove={props.onRemoveLayer}
          />
        )}
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] opacity-50">{badge}</span>
      )}
    </button>
  );
}

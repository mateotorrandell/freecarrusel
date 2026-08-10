"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Layers,
  Calendar,
  SlidersHorizontal,
  Trash2,
  Copy,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreateCarouselDialog } from "@/components/ui/create-carousel-dialog";
import { SlideRenderer } from "@/components/editor/SlideRenderer";
import { TemplateGallery } from "@/components/templates/TemplateGallery";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ResizablePanel } from "@/components/layout/ResizablePanel";
import { Logo } from "@/components/layout/Logo";
import { useLanguage } from "@/lib/i18n";
import type { Carousel, AspectRatio } from "@/types/carousel";
import type { BrandConfig } from "@/types/brand";

/** width ÷ height, for sizing thumbnails and the big preview. */
const RATIO: Record<AspectRatio, number> = {
  "1:1": 1,
  "4:5": 0.8,
  "9:16": 0.5625,
};

/**
 * Home: chat on the left, the carousel you're looking at in the middle, and the
 * list of everything you've made on the right. Same three-pane shape as the
 * editor, so moving between them doesn't move the furniture around.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setBrand] = useState<BrandConfig | null>(null);
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawSlideIndex, setSlideIndex] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"carousels" | "templates">(
    "carousels"
  );
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const selected = useMemo(
    () => carousels.find((c) => c.id === selectedId) ?? carousels[0] ?? null,
    [carousels, selectedId]
  );

  useEffect(() => {
    Promise.all([
      fetch("/api/carousels").then((r) => r.json()),
      fetch("/api/brand").then((r) => r.json()),
    ])
      .then(([carouselData, brandData]) => {
        setCarousels(carouselData.carousels || []);
        setBrand(brandData);
        // No auto-opening wizard here: an unconfigured brand surfaces as the
        // dismissible BrandNudge toast instead of blocking the dashboard.
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // The home chat only renders if the CLI is actually reachable.
    fetch("/api/chat/check")
      .then((r) => r.json())
      .then((d: { available?: boolean }) => setClaudeAvailable(!!d.available))
      .catch(() => {});
  }, []);

  // While the assistant is working it may create carousels and slides through
  // the API; poll so they show up without a manual refresh.
  useEffect(() => {
    if (!isGenerating) return;
    const id = setInterval(() => {
      fetch("/api/carousels")
        .then((r) => r.json())
        .then((d) => setCarousels(d.carousels || []))
        .catch(() => {});
    }, 1500);
    return () => clearInterval(id);
  }, [isGenerating]);

  // Slides come and go while the AI works, so the stored index can outlive the
  // slide it pointed at. Clamp on the way out instead of correcting it in an
  // effect — that would render one frame with a bad index first.
  const slideIndex = selected
    ? Math.min(rawSlideIndex, Math.max(0, selected.slides.length - 1))
    : 0;

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string, name: string) => {
      e.stopPropagation();
      setConfirmState({
        open: true,
        title: `${t("delete")} "${name}"?`,
        description: t("deleteCarouselWarning"),
        onConfirm: async () => {
          const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
          if (res.ok) setCarousels((prev) => prev.filter((c) => c.id !== id));
        },
      });
    },
    [t]
  );

  const handleCreate = useCallback(
    async (name: string, aspectRatio: string) => {
      const res = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, aspectRatio }),
      });
      if (res.ok) {
        const carousel = await res.json();
        router.push(`/carousel/${carousel.id}`);
      }
    },
    [router]
  );

  const slide = selected?.slides[slideIndex];

  return (
    <>
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={t("delete")}
        variant="destructive"
        onConfirm={confirmState.onConfirm}
      />

      <CreateCarouselDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreate}
      />

      {/* Left: the assistant, so the session carries on from the dashboard. */}
      {claudeAvailable && (
        <ResizablePanel
          storageKey="oc-home-chat-width"
          defaultWidth={330}
          min={280}
          max={520}
          side="left"
          collapsible={false}
          title={t("resizeHint")}
        >
          <ChatPanel
            carouselId=""
            claudeAvailable={claudeAvailable}
            onStreamStart={() => setIsGenerating(true)}
            onStreamEnd={() => {
              setIsGenerating(false);
              fetch("/api/carousels")
                .then((r) => r.json())
                .then((d) => setCarousels(d.carousels || []))
                .catch(() => {});
            }}
          />
        </ResizablePanel>
      )}

      {/* Centre: preview of whichever carousel is selected. */}
      <main className="flex-1 min-w-0 min-h-0 rounded-xl border border-border bg-surface flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="h-11 shrink-0 border-b border-border flex items-center gap-2 px-4">
              <h2 className="text-sm font-semibold truncate">
                {selected.name}
              </h2>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                <SlidersHorizontal className="h-2.5 w-2.5 mr-1" />
                {selected.aspectRatio}
              </Badge>
              <span className="text-xs text-muted-foreground shrink-0">
                {selected.slides.length} slides
              </span>
              <div className="flex-1" />
              <Button
                variant="accent"
                size="sm"
                onClick={() => router.push(`/carousel/${selected.id}`)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("edit")}
              </Button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center gap-3 p-4">
              <button
                onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                disabled={slideIndex === 0}
                className="h-8 w-8 shrink-0 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent disabled:opacity-20 transition-colors"
                aria-label={t("previousSlide")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {slide ? (
                <div
                  className="h-full rounded-lg overflow-hidden border border-border shadow-lg"
                  style={{ aspectRatio: RATIO[selected.aspectRatio] }}
                >
                  <SlideRenderer
                    html={slide.html}
                    aspectRatio={selected.aspectRatio}
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <div className="text-center">
                  <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t("noSlides")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("noSlidesHint")}
                  </p>
                </div>
              )}

              <button
                onClick={() =>
                  setSlideIndex((i) =>
                    Math.min(selected.slides.length - 1, i + 1)
                  )
                }
                disabled={slideIndex >= selected.slides.length - 1}
                className="h-8 w-8 shrink-0 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent disabled:opacity-20 transition-colors"
                aria-label={t("nextSlide")}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {selected.slides.length > 0 && (
              <div className="shrink-0 border-t border-border flex gap-2 overflow-x-auto p-3">
                {selected.slides.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setSlideIndex(i)}
                    className={`relative shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                      i === slideIndex
                        ? "border-accent"
                        : "border-border hover:border-muted-foreground"
                    }`}
                    style={{
                      width: 56,
                      height: Math.round(56 / RATIO[selected.aspectRatio]),
                    }}
                    aria-label={`${t("slide")} ${i + 1}`}
                  >
                    <SlideRenderer
                      html={s.html}
                      aspectRatio={selected.aspectRatio}
                      className="w-full h-full"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            {/* The mark, not a generic stack icon: an empty screen is the
                first thing a new user sees. */}
            <span className="mb-5 opacity-70">
              <Logo size={52} />
            </span>
            <h2 className="text-lg font-semibold mb-2">{t("noCarousels")}</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t("noCarouselsHint")}
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              variant="accent"
              size="lg"
            >
              <Plus className="h-5 w-5" />
              {t("createFirst")}
            </Button>
          </div>
        )}
      </main>

      {/* Right: everything you've made. */}
      <ResizablePanel
        storageKey="oc-home-list-width"
        defaultWidth={330}
        min={260}
        max={560}
        side="right"
        collapsible={false}
        title={t("resizeHint")}
      >
        <div className="h-11 shrink-0 border-b border-border flex items-center gap-1 px-2">
          <button
            onClick={() => setActiveTab("carousels")}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "carousels"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("myCarousels")}
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "templates"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("templates")}
          </button>
          <div className="flex-1" />
          <Button
            onClick={() => setShowCreateDialog(true)}
            variant="accent"
            size="sm"
            aria-label={t("newCarousel")}
            title={t("newCarousel")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {activeTab === "templates" ? (
            <TemplateGallery gridClassName="grid-cols-1" />
          ) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : carousels.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t("noCarousels")}
            </p>
          ) : (
            /* One carousel per ROW, showing every slide: the 3-up card grid
               only ever showed slide 1, so asking for three carousels looked
               like one and you couldn't compare them at a glance. */
            <div className="oc-stagger space-y-3">
              {carousels.map((carousel) => (
                <div
                  key={carousel.id}
                  onClick={() => {
                    setSelectedId(carousel.id);
                    setSlideIndex(0);
                  }}
                  onDoubleClick={() => router.push(`/carousel/${carousel.id}`)}
                  className={`relative rounded-xl border bg-background p-3 group cursor-pointer transition-colors ${
                    selected?.id === carousel.id
                      ? "border-accent"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 pr-16">
                    <h3 className="font-semibold text-xs truncate">
                      {carousel.name}
                    </h3>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {carousel.slides.length}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Calendar className="h-2.5 w-2.5" />
                      {new Date(carousel.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const res = await fetch(
                          `/api/carousels/${carousel.id}/duplicate`,
                          { method: "POST" }
                        );
                        if (res.ok) {
                          const dup = await res.json();
                          setCarousels((prev) => [dup, ...prev]);
                        }
                      }}
                      className="h-6 w-6 rounded-md flex items-center justify-center border border-border bg-surface hover:border-accent"
                      aria-label={`${t("duplicate")} ${carousel.name}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) =>
                        handleDelete(e, carousel.id, carousel.name)
                      }
                      className="h-6 w-6 rounded-md flex items-center justify-center border border-border bg-surface hover:bg-destructive hover:border-destructive"
                      aria-label={`${t("delete")} ${carousel.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {carousel.slides.length === 0 ? (
                    <div className="h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Layers className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                  ) : (
                    /* Wrapping, not scrolling: the point of a row per carousel
                       is seeing every slide at once. */
                    <div className="flex flex-wrap gap-1.5">
                      {carousel.slides.map((s, i) => (
                        <div
                          key={s.id}
                          className="relative shrink-0 rounded overflow-hidden border border-border bg-muted"
                          style={{
                            width: 52,
                            height: Math.round(52 / RATIO[carousel.aspectRatio]),
                          }}
                        >
                          <SlideRenderer
                            html={s.html}
                            aspectRatio={carousel.aspectRatio}
                            className="w-full h-full"
                          />
                          <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[8px] text-white">
                            {i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ResizablePanel>
    </>
  );
}

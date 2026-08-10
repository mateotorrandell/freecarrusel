"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Grid3X3,
  Bookmark,
  Maximize2,
  Undo2,
  Redo2,
  ArrowLeft,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { CarouselPreview } from "@/components/editor/CarouselPreview";
import { SlideFilmstrip } from "@/components/editor/SlideFilmstrip";
import { AspectRatioSelector } from "@/components/editor/AspectRatioSelector";
import { ExportButton } from "@/components/editor/ExportButton";
import { CaptionPanel } from "@/components/editor/CaptionPanel";
import { FullscreenPreview } from "@/components/editor/FullscreenPreview";
import { SlideCanvas } from "@/components/editor/SlideCanvas";
import { EditorPanel } from "@/components/editor/EditorPanel";
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import type { Layer } from "@/components/editor/LayersPanel";
import { ResizablePanel } from "@/components/layout/ResizablePanel";
import {
  SlideContextMenu,
  type ContextMenuState,
} from "@/components/editor/SlideContextMenu";
import type { ChatAttachment } from "@/components/chat/ChatPanel";
import type { Carousel, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import type { SelectedElement } from "@/types/editor";

/**
 * Cheap content hash. It rides in the canvas reload key so a slide the AI
 * rewrote behind our back re-renders on its own — before this you had to
 * refresh the browser to see what the assistant had just done. Our own edits
 * never change it: they go straight to the API without touching this state.
 */
function htmlSignature(html: string) {
  let h = 5381;
  for (let i = 0; i < html.length; i++) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return `${html.length}.${h}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CarouselEditorPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useLanguage();
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [claudeAvailable, setClaudeAvailable] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // --- visual editor (always on: editing and chat share one screen) ---
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  // App-level clipboard: the sandboxed frame has no OS clipboard access, and we
  // only ever move slide markup around.
  const [clipboard, setClipboard] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  // Edit history for the undo/redo arrows. Kept client-side and per edit
  // session: the server's per-slide version stack only holds 5 entries and has
  // no redo, which is too coarse for direct manipulation.
  //
  // Items and cursor live in ONE state object updated functionally. Held apart,
  // a second edit arriving before React re-rendered would compute its slice
  // from a stale cursor and overwrite the previous entry instead of appending —
  // which collapsed a whole session of edits down to a single step.
  const [hist, setHist] = useState<{ items: string[]; index: number }>({
    items: [],
    index: -1,
  });
  // Bumped to force the canvas to reload with a different HTML (undo/redo).
  const [canvasVersion, setCanvasVersion] = useState(0);
  // The debounced flush fires long after it was armed; read the stack through a
  // ref so it syncs the latest state rather than a stale closure copy.
  const histRef = useRef(hist);
  histRef.current = hist;
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Latest HTML reported by the canvas, flushed to the API on a debounce.
  const pendingHtml = useRef<string | null>(null);
  // The exact HTML the canvas was loaded from. Every save is checked against it
  // so two writers can't overwrite each other blind.
  const baseHtml = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Ref for focusing chat input when + button is clicked
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchCarousel = useCallback(async () => {
    try {
      const res = await fetch(`/api/carousels/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setCarousel((prev) => {
          // If new slides were added during generation, jump to the latest slide
          if (prev && data.slides.length > prev.slides.length) {
            setActiveSlide(data.slides.length - 1);
          } else {
            setActiveSlide((prevIdx) =>
              data.slides.length === 0 ? 0 : Math.min(prevIdx, data.slides.length - 1)
            );
          }
          return data;
        });
      }
    } catch {
      // ignore network errors
    }
  }, [id]);

  // Initial data load
  useEffect(() => {
    const load = async () => {
      await fetchCarousel();
      try {
        const res = await fetch("/api/chat/check");
        const data: { available?: boolean } = await res.json();
        if (data.available === false) setClaudeAvailable(false);
      } catch {
        // assume available
      }
    };
    load();
  }, [fetchCarousel]);

  // Whatever HTML the canvas is currently showing is the version our next save
  // will claim to be based on. When it changes underneath us — the assistant
  // rewrote the slide, or we switched slides — any edit still sitting in the
  // debounce belongs to a document that no longer exists, so it's dropped
  // instead of being written over the newer one.
  const activeHtml = carousel?.slides[activeSlide]?.html ?? "";
  useEffect(() => {
    baseHtml.current = activeHtml;
    pendingHtml.current = null;
  }, [activeHtml]);

  // Poll for carousel updates while AI is generating slides
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      fetchCarousel();
    }, 500);
    return () => clearInterval(interval);
  }, [isGenerating, fetchCarousel]);

  const handleAspectChange = async (ratio: AspectRatio) => {
    if (!carousel) return;
    const res = await fetch(`/api/carousels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspectRatio: ratio }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCarousel(updated);
    }
  };

  const handleDeleteSlide = (slideId: string) => {
    if (!carousel) return;
    const slideIndex = carousel.slides.findIndex((s) => s.id === slideId);
    setConfirmState({
      open: true,
      title: `${t("delete")} ${t("slide")} ${slideIndex + 1}?`,
      description: t("deleteSlideWarning"),
      onConfirm: async () => {
        const res = await fetch(`/api/carousels/${id}/slides/${slideId}`, {
          method: "DELETE",
        });
        if (res.ok) await fetchCarousel();
      },
    });
  };

  const handleUndoSlide = async (slideId: string) => {
    const res = await fetch(`/api/carousels/${id}/slides/${slideId}/undo`, {
      method: "POST",
    });
    if (res.ok) await fetchCarousel();
  };

  const handleDeleteCarousel = useCallback(() => {
    if (!carousel) return;
    setConfirmState({
      open: true,
      title: `${t("delete")} "${carousel.name}"?`,
      description: t("deleteCarouselWarning"),
      onConfirm: async () => {
        const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/");
      },
    });
  }, [carousel, id, router, t]);

  const handleStreamStart = useCallback(() => {
    setIsGenerating(true);
  }, []);

  const handleStreamEnd = useCallback(() => {
    setIsGenerating(false);
    fetchCarousel();
  }, [fetchCarousel]);

  const handleReorderSlides = useCallback(
    async (slideIds: string[]) => {
      await fetch(`/api/carousels/${id}/slides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideIds }),
      });
      await fetchCarousel();
    },
    [id, fetchCarousel]
  );

  // Persist edits on a debounce. Each PUT pushes the previous HTML onto the
  // slide's version stack, so a burst of keystrokes would otherwise blow
  // through the 5-deep undo history in seconds.
  const flushEdit = useCallback(async () => {
    const slide = carousel?.slides[activeSlide];
    const html = pendingHtml.current;
    if (!slide || html === null) {
      setDirty(false);
      return;
    }
    pendingHtml.current = null;

    // Send the version this edit was made against. If the assistant rewrote the
    // slide while our save was sitting in the debounce, the server refuses and
    // hands back what it has — otherwise this stale snapshot would quietly undo
    // the assistant's work, which is how a whole edit could vanish.
    const res = await fetch(`/api/carousels/${id}/slides/${slide.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, expectedHtml: baseHtml.current }),
    });
    if (res.status === 409) {
      setDirty(false);
      await fetchCarousel(); // the canvas reloads onto the newer version
      return;
    }
    baseHtml.current = html;
    // Mirror the whole stack so undo/redo survives a refresh. Pushing one
    // entry per flush would collapse a burst of edits into a single step,
    // because the debounce coalesces them.
    const snapshot = histRef.current;
    await fetch(`/api/carousels/${id}/slides/${slide.id}/history`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    }).catch(() => {});
    setDirty(false);
  }, [carousel, activeSlide, id, fetchCarousel]);

  const handleCanvasChange = useCallback(
    (html: string, transient: boolean) => {
      pendingHtml.current = html;
      setDirty(true);

      // Live preview from a control still being dragged (the colour picker is
      // open): apply it, but don't record it. Recording every shade the cursor
      // passed over buried the real "before" state under dozens of steps.
      // The commit event — picker closed — arrives with transient=false.
      if (!transient) {
        setHist((h) => {
          if (h.items[h.index] === html) return h; // nothing actually changed
          return {
            items: [...h.items.slice(0, h.index + 1), html],
            index: h.index + 1,
          };
        });
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushEdit, 900);
    },
    [flushEdit]
  );

  /** Reload the canvas at a given history position and persist it. */
  const applyHistory = useCallback(
    async (index: number) => {
      const slide = carousel?.slides[activeSlide];
      if (!slide) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingHtml.current = null;
      setSelected(null);

      const html = hist.items[index];
      if (html === undefined) return;

      const next = { items: hist.items, index };
      setHist(next);
      setCarousel((prev) =>
        prev
          ? {
              ...prev,
              slides: prev.slides.map((s) =>
                s.id === slide.id ? { ...s, html } : s
              ),
            }
          : prev
      );
      await fetch(`/api/carousels/${id}/slides/${slide.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      baseHtml.current = html;
      await fetch(`/api/carousels/${id}/slides/${slide.id}/history`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => {});
      setCanvasVersion((v) => v + 1);
      setDirty(false);
    },
    [carousel, activeSlide, id, hist]
  );

  const canUndo = hist.index > 0;
  const canRedo = hist.index >= 0 && hist.index < hist.items.length - 1;

  /** Pull the persisted stack for a slide (the API seeds it on first read). */
  const loadHistory = useCallback(
    async (slideId: string) => {
      try {
        const res = await fetch(`/api/carousels/${id}/slides/${slideId}/history`);
        if (res.ok) setHist(await res.json());
      } catch {
        setHist({ items: [], index: -1 });
      }
    },
    [id]
  );

  // Each slide keeps its own stack, so switching slides swaps it in.
  useEffect(() => {
    const slide = carousel?.slides[activeSlide];
    if (!slide) return;
    setSelected(null);
    setMenu(null);
    loadHistory(slide.id);
    // Only when the active slide changes — not on every carousel refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlide, carousel?.slides[activeSlide]?.id]);

  // --- context menu / clipboard / AI attachment ---
  const handleContextMenu = useCallback(
    (x: number, y: number) => {
      // Coordinates arrive in the slide's own 1080-wide space; map them onto
      // the page through the iframe's scale and offset.
      const frame = frameRef.current;
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      const scale = r.width / DIMENSIONS[carousel?.aspectRatio ?? "4:5"].width;
      setMenu({ x: r.left + x * scale, y: r.top + y * scale });
    },
    [carousel?.aspectRatio]
  );

  const handleElementHtml = useCallback(
    (html: string, element: SelectedElement) => {
      const slide = carousel?.slides[activeSlide];
      if (!slide) return;
      setAttachment({
        html,
        // Friendly label — the UI never shows markup to the user.
        label:
          element.text?.trim().slice(0, 32) ||
          element.label ||
          `${element.width}×${element.height}`,
        slideId: slide.id,
        slideIndex: activeSlide,
      });
      setTimeout(() => chatInputRef.current?.focus(), 80);
    },
    [carousel, activeSlide]
  );

  // Don't lose the last edit when leaving edit mode or unmounting.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const sendToCanvas = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(
      { ...message, source: "oc-host" },
      "*"
    );
  }, []);

  const handleAddSlideRequest = useCallback(() => {
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  }, []);

  if (notFound) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">{t("notFound")}</p>
        <p className="text-sm text-muted-foreground">{t("notFoundHint")}</p>
        <Link href="/" className="text-sm text-accent underline">
          {t("dashboard")}
        </Link>
      </div>
    );
  }

  if (!carousel) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col gap-2">


      {/* Fullscreen preview */}
      <FullscreenPreview
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        slides={carousel.slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
      />

      {/* Right-click menu for the canvas */}
      <SlideContextMenu
        state={menu}
        canPaste={!!clipboard}
        onClose={() => setMenu(null)}
        onCopy={() => sendToCanvas({ type: "copy" })}
        onCut={() => sendToCanvas({ type: "cut" })}
        onPaste={() => sendToCanvas({ type: "paste", html: clipboard })}
        onDelete={() => sendToCanvas({ type: "delete" })}
        onAskAI={() => sendToCanvas({ type: "describe" })}
      />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((s) => ({ ...s, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={t("delete")}
        variant="destructive"
        onConfirm={confirmState.onConfirm}
      />

      {/* Main editor area — the left rail lives in AppShell */}
      <div className="flex-1 flex min-h-0 gap-2">
        {/* Edit + Layers, docked left beside the menu; the canvas stays centred */}
        <ResizablePanel
          storageKey="oc-editor-width"
          defaultWidth={280}
          min={240}
          max={480}
          side="left"
          className="oc-fade"
          title={t("resizeHint")}
        >
          <EditorPanel
            selected={selected}
            layers={layers}
            onSelectLayer={(uid) => sendToCanvas({ type: "selectUid", uid })}
            onToggleHidden={(uid) => sendToCanvas({ type: "toggleHidden", uid })}
            onMoveLayer={(uid, dir) => sendToCanvas({ type: "move", uid, dir })}
            onReorderLayer={(uid, targetUid, above) =>
              sendToCanvas({ type: "reorder", uid, targetUid, above })
            }
            onRemoveLayer={(uid) => sendToCanvas({ type: "removeUid", uid })}
            onStyle={(styles, transient) =>
              sendToCanvas({ type: "style", styles, transient: !!transient })
            }
            onText={(text) => sendToCanvas({ type: "text", text })}
            onDelete={() => sendToCanvas({ type: "delete" })}
            onDuplicate={() => sendToCanvas({ type: "duplicate" })}
            onEditOnCanvas={() => sendToCanvas({ type: "editText" })}
            onSetSrc={(url) => sendToCanvas({ type: "setSrc", value: url })}
            images={carousel.referenceImages || []}
          />
        </ResizablePanel>

        {/* Center: toolbar + preview */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-xl border border-border bg-surface overflow-hidden">
          {/* Toolbar */}
          <div className="h-11 border-b border-border bg-surface flex items-center px-3 gap-2 shrink-0">
            {/* The old header is gone: back-link and carousel name live in the
                canvas toolbar so the slide gets the vertical space. */}
            <Link
              href="/"
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t("dashboard")}
              title={t("dashboard")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm font-semibold truncate shrink-0 max-w-[160px]">
              {carousel.name}
            </span>
            <AspectRatioSelector
              value={carousel.aspectRatio}
              onChange={handleAspectChange}
            />
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyHistory(hist.index - 1)}
              disabled={!canUndo}
              className="text-muted-foreground disabled:opacity-30"
              aria-label={t("undoEdit")}
              title={t("undoEdit")}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyHistory(hist.index + 1)}
              disabled={!canRedo}
              className="text-muted-foreground disabled:opacity-30"
              aria-label={t("redoEdit")}
              title={t("redoEdit")}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
              {dirty ? t("savingChanges") : t("changesSaved")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullscreen(true)}
              className="text-muted-foreground"
              aria-label={t("fullscreen")}
              title={t("fullscreen")}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={showSafeZones ? "outline" : "ghost"}
              size="sm"
              onClick={() => setShowSafeZones(!showSafeZones)}
              className={showSafeZones ? "border-accent text-accent" : "text-muted-foreground"}
              aria-label={t("safeZones")}
              title={t("safeZones")}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch("/api/templates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ carouselId: carousel.id }),
                });
              }}
              className="text-muted-foreground"
              aria-label={t("saveTemplate")}
              title={t("saveTemplate")}
            >
              <Bookmark className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteCarousel}
              className="text-muted-foreground hover:text-destructive"
              aria-label={t("deleteCarousel")}
              title={t("deleteCarousel")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <ExportButton
              carouselId={carousel.id}
              slideCount={carousel.slides.length}
            />
          </div>

          {/* Text quick-bar: its own row, so the slide stays centred */}
          <FloatingToolbar
            selected={selected}
            onStyle={(styles, opts) =>
              sendToCanvas({
                type: "style",
                styles,
                transient: !!opts?.transient,
                scope: opts?.scope,
              })
            }
            onEditText={() => sendToCanvas({ type: "editText" })}
          />

          {/* The canvas is always editable — no mode switch */}
          {carousel.slides[activeSlide] ? (
            <SlideCanvas
              html={carousel.slides[activeSlide].html}
              aspectRatio={carousel.aspectRatio}
              onSelect={setSelected}
              onChange={handleCanvasChange}
              onContextMenu={handleContextMenu}
              onClipboard={setClipboard}
              onElementHtml={handleElementHtml}
              onLayers={setLayers}
              reloadKey={`${carousel.slides[activeSlide].id}-${carousel.aspectRatio}-${canvasVersion}-${htmlSignature(carousel.slides[activeSlide].html)}`}
              frameRef={frameRef}
            />
          ) : (
            <CarouselPreview
              slides={carousel.slides}
              aspectRatio={carousel.aspectRatio}
              activeIndex={activeSlide}
              onActiveChange={setActiveSlide}
              showSafeZones={showSafeZones}
            />
          )}

          {/* Caption panel */}
          <CaptionPanel
            caption={carousel.caption}
            hashtags={carousel.hashtags}
          />
        </div>

        <ResizablePanel
          storageKey="oc-chat-width"
          defaultWidth={320}
          min={260}
          max={520}
          side="right"
          collapsible={false}
          title={t("resizeHint")}
        >
            <ChatPanel
              carouselId={id}
              claudeAvailable={claudeAvailable}
              referenceImages={carousel.referenceImages || []}
              onStreamStart={handleStreamStart}
              onStreamEnd={handleStreamEnd}
              chatInputRef={chatInputRef}
              attachment={attachment}
              onClearAttachment={() => setAttachment(null)}
            />
        </ResizablePanel>
      </div>

      {/* Filmstrip */}
      <SlideFilmstrip
        slides={carousel.slides}
        aspectRatio={carousel.aspectRatio}
        activeIndex={activeSlide}
        onActiveChange={setActiveSlide}
        onDeleteSlide={handleDeleteSlide}
        onUndoSlide={handleUndoSlide}
        onAddSlideRequest={handleAddSlideRequest}
        onReorderSlides={handleReorderSlides}
        isGenerating={isGenerating}
      />
    </div>
  );
}

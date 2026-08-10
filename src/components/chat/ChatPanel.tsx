"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ReferenceImages } from "./ReferenceImages";
import { AlertCircle, Plug, Sparkles, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import type { ReferenceImage } from "@/types/carousel";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** An element pulled from the canvas via "Edit with AI". */
export interface ChatAttachment {
  html: string;
  label: string;
  slideId: string;
  slideIndex: number;
}

interface ChatPanelProps {
  carouselId: string;
  referenceImages?: ReferenceImage[];
  claudeAvailable: boolean;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  attachment?: ChatAttachment | null;
  onClearAttachment?: () => void;
}

export function ChatPanel({
  carouselId,
  claudeAvailable,
  referenceImages = [],
  onStreamStart,
  onStreamEnd,
  chatInputRef,
  attachment,
  onClearAttachment,
}: ChatPanelProps) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "images">("chat");

  // Attaching an element from the canvas is a request to talk about it, so the
  // conversation has to be the thing you're looking at.
  useEffect(() => {
    if (attachment) setTab("chat");
  }, [attachment]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load session ID and chat history from localStorage
  useEffect(() => {
    const storedSession = localStorage.getItem(`chat-session-${carouselId}`);
    if (storedSession) setSessionId(storedSession);
    try {
      const storedMessages = localStorage.getItem(`chat-messages-${carouselId}`);
      if (storedMessages) setMessages(JSON.parse(storedMessages));
    } catch {
      // ignore corrupted data
    }
  }, [carouselId]);

  // Persist messages to localStorage
  const persistMessages = useCallback(
    (msgs: Message[]) => {
      try {
        localStorage.setItem(`chat-messages-${carouselId}`, JSON.stringify(msgs));
      } catch {
        // ignore quota errors
      }
    },
    [carouselId]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(`chat-messages-${carouselId}`);
    localStorage.removeItem(`chat-session-${carouselId}`);
  }, [carouselId]);

  const handleStopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (message: string) => {
      if (isStreaming) return;
      setError(null);
      setIsStreaming(true);
      onStreamStart?.();

      // Add user message — the transcript shows what the user typed; the
      // attached markup is extra context for the agent, not chat noise.
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);

      const outgoing = attachment
        ? `${message}\n\n---\nAplicá ese cambio SOLO a este elemento de la slide ${attachment.slideIndex + 1} (slideId: ${attachment.slideId}). Mantené el resto de la slide igual y guardá con PUT /api/carousels/${carouselId}/slides/${attachment.slideId}.\n\nElemento actual:\n\`\`\`html\n${attachment.html}\n\`\`\``
        : message;
      onClearAttachment?.();

      // Add empty assistant message for streaming
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: outgoing,
            sessionId,
            carouselId,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error || "Failed to connect to AI"
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "token" && typeof data.text === "string") {
                  accumulated += data.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulated }
                        : m
                    )
                  );
                } else if (data.type === "result" && typeof data.text === "string") {
                  accumulated = data.text; // result is the final complete text
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulated }
                        : m
                    )
                  );
                }
              } catch {
                // skip unparseable
              }
            } else if (line.startsWith("event: done")) {
              // Next line has the done data
            } else if (
              line.startsWith("data: ") &&
              line.includes("sessionId")
            ) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.sessionId) {
                  setSessionId(data.sessionId);
                  localStorage.setItem(
                    `chat-session-${carouselId}`,
                    data.sessionId
                  );
                }
              } catch {
                // skip
              }
            }
          }
        }

        // Parse any remaining buffer for the done event
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.sessionId) {
                  setSessionId(data.sessionId);
                  localStorage.setItem(
                    `chat-session-${carouselId}`,
                    data.sessionId
                  );
                }
              } catch {
                // skip
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        // Remove empty assistant message on error
        setMessages((prev) =>
          prev.filter(
            (m) => m.id !== assistantId || m.content.length > 0
          )
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        // Persist messages after stream completes
        setMessages((prev) => {
          persistMessages(prev);
          return prev;
        });
        onStreamEnd?.();
      }
    },
    [
      isStreaming,
      sessionId,
      carouselId,
      onStreamStart,
      onStreamEnd,
      persistMessages,
      attachment,
      onClearAttachment,
    ]
  );

  if (!claudeAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Plug className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm mb-1">{t("connectCli")}</h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          {t("connectCliHint")}{" "}
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            {t("installGuide")}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Two tabs, chat first. The reference-image dropzone used to sit above
          every conversation, eating a third of the panel while you were editing
          and had no images to give. */}
      <div className="h-11 shrink-0 border-b border-border flex items-center gap-1 px-2">
        <button
          onClick={() => setTab("chat")}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "chat"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("aiAssistant")}
        </button>
        <button
          onClick={() => setTab("images")}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            tab === "images"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("referenceImages")}
          {referenceImages.length > 0 && (
            <span className="ml-1 text-accent">{referenceImages.length}</span>
          )}
        </button>
        <div className="flex-1" />
        {messages.length > 0 && tab === "chat" && (
          <button
            onClick={handleClearChat}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded"
          >
            {t("clear")}
          </button>
        )}
      </div>

      {tab === "images" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ReferenceImages
            carouselId={carouselId}
            images={referenceImages}
            onImagesChange={() => onStreamEnd?.()}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        hidden={tab !== "chat"}
      >
        {messages.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            <p className="text-sm mb-1">{t("noMessages")}</p>
            <p className="text-xs">{t("noMessagesHint")}</p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={
              isStreaming &&
              msg.role === "assistant" &&
              msg.id === messages[messages.length - 1]?.id
            }
          />
        ))}
        {error && (
          <div className="mx-4 my-2 flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {attachment && (
        <div className="oc-enter-pop mx-3 mb-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-accent">
                {t("attached")}
              </p>
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                {attachment.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t("attachedHint")}
              </p>
            </div>
            <button
              onClick={onClearAttachment}
              className="h-5 w-5 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted"
              aria-label={t("removeAttachment")}
              title={t("removeAttachment")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        isStreaming={isStreaming}
        textareaRef={chatInputRef}
        onStop={handleStopGenerating}
      />
    </div>
  );
}

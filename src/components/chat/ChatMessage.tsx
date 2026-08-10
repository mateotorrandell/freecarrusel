"use client";

import { User } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * One turn of the conversation. The assistant's rows sit on a tinted band so a
 * long exchange stays readable without a bubble for every line.
 */
export function ChatMessage({
  role,
  content,
  isStreaming,
}: {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}) {
  const { t } = useLanguage();
  const mine = role === "user";

  return (
    <div className={cn("oc-enter flex gap-3 px-4 py-3", !mine && "bg-muted/50")}>
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          mine ? "bg-foreground text-background" : "bg-accent/15 text-accent"
        )}
      >
        {mine ? <User className="h-3.5 w-3.5" /> : <Logo size={16} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {mine ? t("you") : t("assistantName")}
        </p>
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="oc-caret ml-0.5 inline-block h-4 w-1.5 align-text-bottom bg-accent" />
          )}
        </div>
      </div>
    </div>
  );
}

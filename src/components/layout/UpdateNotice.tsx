"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface VersionStatus {
  current: string | null;
  latest: string | null;
  behind: number | null;
  updatable: boolean;
  reason?: string;
  releasesUrl: string;
}

/**
 * Offers the new version when there is one, and applies it.
 *
 * Updating stops the server on purpose — it cannot rebuild itself while it is
 * running — so the interesting part is what happens next: the page waits for
 * the server to answer again and reloads. From the user's side it is a button
 * and a wait, which is the whole point of doing it in here instead of asking
 * them to run git commands.
 */
export function UpdateNotice({ collapsed }: { collapsed: boolean }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<VersionStatus | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch("/api/version")
        .then((r) => r.json())
        .then((data: VersionStatus) => !cancelled && setStatus(data))
        .catch(() => {});

    check();
    // Once an hour is plenty for a tool you keep open all day.
    const timer = setInterval(check, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const waitForRestart = useCallback(async () => {
    // The server goes away and comes back on the same port. Give the rebuild
    // real time — it installs dependencies and compiles.
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (res.ok) {
          window.location.reload();
          return;
        }
      } catch {
        /* still down, keep waiting */
      }
    }
    setPhase("failed");
  }, []);

  const update = useCallback(async () => {
    setPhase("working");
    try {
      const res = await fetch("/api/version", { method: "POST" });
      if (!res.ok) {
        setPhase("failed");
        return;
      }
      await waitForRestart();
    } catch {
      // The connection dropping IS the server stopping, which is expected.
      await waitForRestart();
    }
  }, [waitForRestart]);

  if (!status || (!status.updatable && phase === "idle")) return null;

  if (collapsed) {
    return (
      <button
        onClick={update}
        className="flex w-full items-center justify-center py-2.5 text-accent hover:bg-muted transition-colors"
        title={t("updateAvailable")}
        aria-label={t("updateAvailable")}
      >
        {phase === "working" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowUpCircle className="h-4 w-4" />
        )}
      </button>
    );
  }

  return (
    <div className="m-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
        <ArrowUpCircle className="h-3.5 w-3.5" />
        {t("updateAvailable")}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {phase === "working"
          ? t("updateWorking")
          : phase === "failed"
            ? t("updateFailed")
            : status.behind
              ? t("updateBehind").replace("{n}", String(status.behind))
              : t("updateReady")}
      </p>
      {phase !== "working" && (
        <button
          onClick={update}
          className="mt-2 w-full rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          {phase === "failed" ? t("retry") : t("updateNow")}
        </button>
      )}
    </div>
  );
}

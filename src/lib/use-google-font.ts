"use client";

import { useEffect } from "react";

const loaded = new Set<string>();

/**
 * Injects the Google Fonts stylesheet for the given families so previews render
 * in the actual typeface instead of a system fallback. Links are added once per
 * family and left in place — swapping fonts in the picker shouldn't re-fetch.
 */
export function useGoogleFonts(families: (string | undefined | null)[]) {
  const key = families.filter(Boolean).join("|");

  useEffect(() => {
    if (!key) return;
    for (const family of key.split("|")) {
      if (loaded.has(family)) continue;
      loaded.add(family);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        family
      )}:wght@400;600;700&display=swap`;
      document.head.appendChild(link);
    }
  }, [key]);
}

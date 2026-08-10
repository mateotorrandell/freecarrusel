"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type SidebarSection = "settings" | "brand" | null;

interface SidebarState {
  open: boolean;
  section: SidebarSection;
  setOpen: (open: boolean) => void;
  /** Expand the rail and reveal a section — used by the TopBar gear. */
  openSection: (section: Exclude<SidebarSection, null>) => void;
  /** Expand+reveal, or collapse the section if it's already showing. */
  toggleSection: (section: Exclude<SidebarSection, null>) => void;
}

const Ctx = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SidebarSection>(null);

  const openSection = useCallback((next: Exclude<SidebarSection, null>) => {
    setOpen(true);
    setSection(next);
  }, []);

  const toggleSection = useCallback(
    (next: Exclude<SidebarSection, null>) => {
      if (!open) {
        setOpen(true);
        setSection(next);
        return;
      }
      setSection((cur) => (cur === next ? null : next));
    },
    [open]
  );

  return (
    <Ctx.Provider value={{ open, section, setOpen, openSection, toggleSection }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

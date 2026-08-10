"use client";

import { Sidebar } from "./Sidebar";
import { BrandNudge } from "./BrandNudge";
import { SidebarProvider } from "./sidebar-context";

/**
 * App-wide chrome: the collapsible rail on the left of every page, plus the
 * brand nudge. Pages render their own content inside the right column.
 *
 * Nothing touches the window edges — the shell keeps a gutter around itself and
 * between panels, so every surface reads as a floating card over the page
 * background instead of a wall of docked columns.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="h-full flex min-h-0 gap-2 p-2">
        <Sidebar />
        <div className="flex-1 flex min-w-0 min-h-0 gap-2">{children}</div>
        <BrandNudge />
      </div>
    </SidebarProvider>
  );
}

"use client";

import { useCallback, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** Keep the fixed surface aligned with its real flex column, not viewport width. */
export function StandaloneTopBar({ children, sidebarWidth }: { children: ReactNode; sidebarWidth: number }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const measure = useCallback(() => {
    const slot = slotRef.current;
    const surface = surfaceRef.current;
    if (!slot || !surface) return;
    const rect = slot.getBoundingClientRect();
    surface.style.setProperty("--topbar-left", `${rect.left}px`);
    surface.style.setProperty("--topbar-width", `${rect.width}px`);
    surface.dataset.measured = "true";
  }, []);

  // Also covers a column moving without changing width during a React update.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    window.addEventListener("resize", measure);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [measure]);

  return (
    <div ref={slotRef} className="app-topbar-slot" style={{ "--topbar-sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <div ref={surfaceRef} className="app-topbar-surface" data-app-topbar="chat">
        {children}
      </div>
    </div>
  );
}

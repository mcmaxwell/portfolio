"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Eased wheel scrolling for the page (Lenis). Touch keeps native scrolling, reduced motion keeps
 * native scrolling everywhere, and Lenis stops while the 3D world owns the page
 * (html[data-experience], set by components/game/shell), so the shell's scroll lock and restore
 * work exactly as before.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: { offset: 0 }, lerp: 0.1 });
    const root = document.documentElement;
    const sync = () => (root.hasAttribute("data-experience") ? lenis.stop() : lenis.start());
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-experience"] });
    sync();
    return () => {
      mo.disconnect();
      lenis.destroy();
    };
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

/**
 * First-visit curtain: a 0 to 100 count, then a wipe up into the hero. The motion is CSS only
 * (globals.css, "Intro preloader"), so it starts with the first server-rendered paint and clears
 * itself even if JavaScript is slow. This component only remembers that the tab has seen it.
 */
export function Preloader() {
  useEffect(() => {
    try {
      sessionStorage.setItem("ml-intro", "1");
    } catch {
      // Storage blocked: the intro simply plays again next time.
    }
  }, []);
  return (
    <div aria-hidden className="preloader">
      <div className="flex items-start justify-between font-mono text-xs uppercase tracking-[0.2em] text-term-muted">
        <span className="overflow-hidden">
          <span className="preloader-word">Maksym Liutsko</span>
        </span>
        <span className="overflow-hidden">
          <span className="preloader-word" style={{ animationDelay: "80ms" }}>
            Portfolio 2026
          </span>
        </span>
      </div>
      <div>
        <div className="flex items-end justify-between gap-6">
          <p className="max-w-[12ch] overflow-hidden font-display text-3xl font-medium leading-none tracking-tight md:text-5xl">
            <span className="preloader-word" style={{ animationDelay: "160ms" }}>
              AI products that do real work
            </span>
          </p>
          <p className="font-display text-[22vw] font-medium leading-[0.8] tracking-[-0.05em] text-term-accent md:text-[12vw]">
            <span className="preloader-count" />
          </p>
        </div>
        <div className="mt-6 h-px w-full bg-term-line">
          <div className="preloader-bar h-px w-full bg-term-accent" />
        </div>
      </div>
    </div>
  );
}

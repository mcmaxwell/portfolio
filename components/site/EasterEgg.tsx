"use client";

import { useEffect } from "react";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/**
 * Two small things for the curious: a hello in the console for developers, and the Konami code,
 * which takes you back to the hero and makes the avatar dance (TalkingAvatar listens for the
 * "avatar-gesture" event).
 */
export function EasterEgg() {
  useEffect(() => {
    console.log(
      "%cHi, fellow developer.%c\nThe avatar, the particles and the memory search are explained at /colophon.\nTry the Konami code on the page, too.",
      "font: 600 16px system-ui; color: #ff5b26",
      "font: 13px system-ui; color: inherit"
    );
    let at = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? 1 : 0;
      if (at < KONAMI.length) return;
      at = 0;
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("avatar-gesture", { detail: "dance" })), 700);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

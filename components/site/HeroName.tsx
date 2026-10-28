"use client";

import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "./ui";
import { voice } from "@/lib/voice";

const LINES = [
  { text: "Maksym", className: "text-term-paper" },
  { text: "Liutsko", className: "text-outline" },
];

// Space Grotesk is variable (300 to 700): letters near the pointer swell to full weight.
const BASE_WEIGHT = 400;
const PEAK_WEIGHT = 700;
const RADIUS = 260;

/**
 * The giant hero name. Server-rendered letters rise in after the intro (CSS, .hero-letter), then
 * each one thickens as the pointer comes near, and the whole name drifts up and opens its
 * tracking as the page scrolls away. While the avatar speaks, a wave of weight runs through the
 * letters with its voice. Pointer and scroll effects are off with reduced motion and on touch
 * screens; the voice wave is off with reduced motion.
 */
export function HeroName() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, reduced ? 0 : -160]);
  const opacity = useTransform(scrollY, [0, 700], [1, reduced ? 1 : 0.1]);
  const tracking = useTransform(scrollY, [0, 900], ["-0.04em", reduced ? "-0.04em" : "0.02em"]);

  // The voice wave: runs only while <html data-voice="speaking">, one frame loop, no React state.
  useEffect(() => {
    const root = ref.current;
    if (!root || reduced) return;
    const letters = Array.from(root.querySelectorAll<HTMLElement>("[data-letter]"));
    const html = document.documentElement;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = now / 1000;
      letters.forEach((el, i) => {
        const wave = 0.5 + 0.5 * Math.sin(t * 7 - i * 0.55);
        const w = BASE_WEIGHT + (PEAK_WEIGHT - BASE_WEIGHT) * Math.min(1, voice.level * 1.6) * wave;
        el.style.fontVariationSettings = `"wght" ${Math.round(w)}`;
      });
    };
    const sync = () => {
      const speaking = html.dataset.voice === "speaking";
      if (speaking && !raf) {
        letters.forEach((el) => (el.style.transitionDuration = "80ms"));
        raf = requestAnimationFrame(loop);
      } else if (!speaking && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        letters.forEach((el) => {
          el.style.transitionDuration = "";
          el.style.fontVariationSettings = `"wght" ${BASE_WEIGHT}`;
        });
      }
    };
    const mo = new MutationObserver(sync);
    mo.observe(html, { attributes: true, attributeFilter: ["data-voice"] });
    sync();
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  useEffect(() => {
    const root = ref.current;
    if (!root || reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const letters = Array.from(root.querySelectorAll<HTMLElement>("[data-letter]"));
    let frame = 0;
    let px = -1e4;
    let py = -1e4;
    const paint = () => {
      frame = 0;
      for (const el of letters) {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
        const k = Math.max(0, 1 - d / RADIUS);
        const eased = k * k * (3 - 2 * k);
        el.style.fontVariationSettings = `"wght" ${Math.round(BASE_WEIGHT + (PEAK_WEIGHT - BASE_WEIGHT) * eased)}`;
      }
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!frame && window.scrollY < window.innerHeight && document.documentElement.dataset.voice !== "speaking")
        frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  let i = 0;
  return (
    <motion.h1
      ref={ref}
      style={{ y, opacity, letterSpacing: tracking }}
      className="absolute inset-x-0 top-[17vh] text-center font-display uppercase leading-[0.82] md:top-[15vh]"
    >
      <span className="sr-only">Maksym Liutsko, AI Automation Engineer and Product Builder</span>
      {LINES.map((line) => (
        <span key={line.text} aria-hidden className="block overflow-hidden pb-[0.04em] text-[19vw] md:text-[16.5vw]">
          <span className={line.className}>
            {line.text.split("").map((ch) => (
              <span
                key={i}
                data-letter
                className="hero-letter transition-[font-variation-settings] duration-300 ease-out"
                style={{ ["--i" as string]: i++, fontVariationSettings: `"wght" ${BASE_WEIGHT}` }}
              >
                {ch}
              </span>
            ))}
          </span>
        </span>
      ))}
    </motion.h1>
  );
}

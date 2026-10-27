"use client";

import { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "./ui";

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
 * tracking as the page scrolls away. Pointer and scroll effects are off with reduced motion and
 * on touch screens.
 */
export function HeroName() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, reduced ? 0 : -160]);
  const opacity = useTransform(scrollY, [0, 700], [1, reduced ? 1 : 0.1]);
  const tracking = useTransform(scrollY, [0, 900], ["-0.04em", reduced ? "-0.04em" : "0.02em"]);

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
      if (!frame && window.scrollY < window.innerHeight) frame = requestAnimationFrame(paint);
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

"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion as useMotionPreference } from "framer-motion";

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * framer-motion's useReducedMotion, but hydration-safe: false on the server render and the first
 * client render, the real preference from the next one. Reading it straight away made the first
 * client render differ from the server HTML, and React then threw the whole page away and rendered
 * it again. The first frames for reduced-motion visitors are covered by <MotionConfig
 * reducedMotion="user"> (app/page.tsx), which makes the entrance transforms instant.
 */
export function useReducedMotion() {
  const preference = useMotionPreference();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? !!preference : false;
}

/** "01 / About" row with a hairline that draws across when it scrolls into view. */
export function SectionLabel({ index, label }: { index: string; label: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="mb-10 flex items-center gap-4 font-mono text-xs uppercase tracking-[0.2em] text-term-muted md:mb-16">
      <span className="text-term-accent">{index}</span>
      <span>{label}</span>
      <motion.span
        aria-hidden
        className="h-px flex-1 origin-left bg-term-line"
        initial={reduced ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 1.2, ease: EASE_OUT_EXPO }}
      />
    </div>
  );
}

/**
 * Display text whose words rise out of a mask, one after another, the first time it scrolls into
 * view. Screen readers get the plain string; the animated copy is aria-hidden.
 */
export function RevealText({
  text,
  as: Tag = "h2",
  className = "",
  delay = 0,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const words = text.split(" ");
  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <motion.span
        aria-hidden
        className="block"
        initial={reduced ? false : "hidden"}
        whileInView="shown"
        viewport={{ once: true, margin: "-40px" }}
        transition={{ staggerChildren: 0.06, delayChildren: delay }}
      >
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <motion.span
              className="inline-block"
              variants={{ hidden: { y: "110%" }, shown: { y: "0%" } }}
              transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/** Fades and lifts its children in once, when they enter the viewport. */
export function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay }}
    >
      {children}
    </motion.div>
  );
}

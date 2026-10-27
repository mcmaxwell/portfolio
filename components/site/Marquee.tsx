"use client";

import { useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "framer-motion";

const CAPABILITIES = [
  "AI agents",
  "Voice interfaces",
  "Multi-agent orchestration",
  "Automation pipelines",
  "React & Next.js",
  "TypeScript",
  "Three.js",
  "Adobe Commerce",
];

/**
 * One band that drifts on its own and speeds up with the scroll, flips direction when the scroll
 * does, and leans into fast scrolls. Four copies of the list keep the loop seamless.
 */
function Band({ baseVelocity, outline = false }: { baseVelocity: number; outline?: boolean }) {
  const reduced = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [-2000, 0, 2000], [-4, 0, 4], { clamp: false });
  const skew = useTransform(velocity, [-2500, 0, 2500], [7, 0, -7]);
  const x = useTransform(baseX, (v) => `${wrap(-25, -50, v)}%`);
  const direction = useRef(1);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);

  useAnimationFrame((_, delta) => {
    if (reduced || !inView) return;
    let move = direction.current * baseVelocity * (delta / 1000);
    const f = factor.get();
    if (f < 0) direction.current = -1;
    else if (f > 0) direction.current = 1;
    move += direction.current * move * f;
    baseX.set(baseX.get() + move);
  });

  const row = (
    <span className="flex shrink-0 items-center">
      {CAPABILITIES.map((c) => (
        <span key={c} className="flex items-center whitespace-nowrap">
          <span
            className={`px-6 font-display text-4xl font-medium tracking-tight md:px-10 md:text-7xl ${
              outline ? "text-outline" : "text-term-paper"
            }`}
          >
            {c}
          </span>
          <span className="text-term-accent md:text-3xl">✦</span>
        </span>
      ))}
    </span>
  );

  return (
    <div ref={box} className="overflow-hidden">
      <motion.div className="flex w-max" style={{ x, skewX: skew }}>
        {row}
        {row}
        {row}
        {row}
      </motion.div>
    </div>
  );
}

/** The capabilities band between the hero and the content. Decorative: the same words are in About. */
export function Marquee() {
  return (
    <div aria-hidden className="relative space-y-2 border-y border-term-line bg-term-bg py-8 md:space-y-4 md:py-12">
      <Band baseVelocity={-2} />
      <Band baseVelocity={2} outline />
    </div>
  );
}

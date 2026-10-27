"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useTransform, type MotionValue } from "framer-motion";
import { owner, skills } from "@/lib/persona";
import { FadeIn, SectionLabel, useReducedMotion } from "./ui";

const STATEMENT =
  "I build what a business runs on. Websites, apps, AI agents and the automation between them, backed by twelve years of shipping.";

const STATS = [
  { value: 12, suffix: "+", label: "years building for the web" },
  { value: 20, suffix: "+", label: "online stores launched" },
  { value: 2, suffix: "", label: "companies co-founded" },
  { value: 1, suffix: "", label: "Startup Weekend award" },
];

/**
 * One word of the statement: dim until the scroll position reaches its slice of the paragraph. The
 * dim floor still gives the large type 3:1 contrast on the ink background (WCAG 1.4.3).
 */
function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.38, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {word}&nbsp;
    </motion.span>
  );
}

function Statement() {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.5"] });
  const words = STATEMENT.split(" ");
  return (
    <h2
      ref={ref}
      data-memory="statement"
      className="max-w-[18ch] font-display text-[2.6rem] font-medium leading-[1.02] tracking-[-0.03em] text-term-paper sm:max-w-[20ch] md:text-7xl lg:text-[5.5rem]"
    >
      <span className="sr-only">{STATEMENT}</span>
      <span aria-hidden>
        {reduced
          ? STATEMENT
          : words.map((w, i) => (
              <Word key={i} word={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />
            ))}
      </span>
    </h2>
  );
}

/** Counts up to its value the first time it scrolls into view. */
function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [n, setN] = useState(value);
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1400);
      setN(Math.round(value * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value]);
  return (
    <span ref={ref}>
      {n}
      <span className="text-term-accent">{suffix}</span>
    </span>
  );
}

export function About() {
  const groups = skills.map((s) => {
    const i = s.indexOf(": ");
    return i < 0 ? { group: s, items: "" } : { group: s.slice(0, i), items: s.slice(i + 2) };
  });
  return (
    <section id="about" aria-label="About" className="mx-auto w-full max-w-[1400px] px-5 pb-24 pt-24 md:px-10 md:pb-40 md:pt-40">
      <SectionLabel index="01" label="About" />
      <Statement />

      <div className="mt-20 grid gap-16 md:mt-32 md:grid-cols-12">
        <FadeIn className="md:col-span-6 lg:col-span-5">
          <p className="text-base leading-relaxed text-term-fg/85 md:text-lg">{owner.aboutShort}</p>
          <p className="mt-6 text-sm text-term-muted">
            <span className="text-term-accent">●</span> {owner.location}
          </p>
        </FadeIn>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-12 md:col-span-6 md:col-start-7 lg:col-span-6 lg:col-start-7">
          {STATS.map((s, i) => (
            <FadeIn key={s.label} delay={i * 0.08} className="flex flex-col border-t border-term-line pt-5">
              <dt className="order-2 mt-2 text-sm text-term-muted">{s.label}</dt>
              <dd className="font-display text-6xl font-medium tracking-tight text-term-paper md:text-7xl">
                <Counter value={s.value} suffix={s.suffix} />
              </dd>
            </FadeIn>
          ))}
        </dl>
      </div>

      <div className="mt-24 md:mt-40">
        <FadeIn>
          <h3 className="mb-8 font-display text-3xl font-medium tracking-tight text-term-paper md:text-5xl">Toolkit</h3>
        </FadeIn>
        <ul>
          {groups.map((g) => (
            <li
              key={g.group}
              className="group grid gap-2 border-t border-term-line py-5 transition-colors last:border-b hover:bg-term-panel/60 md:grid-cols-12 md:gap-6 md:px-3"
            >
              <span className="text-xs uppercase tracking-[0.18em] text-term-accent md:col-span-4 md:pt-1">{g.group}</span>
              <span className="text-sm leading-relaxed text-term-fg/85 md:col-span-8 md:text-base">{g.items}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

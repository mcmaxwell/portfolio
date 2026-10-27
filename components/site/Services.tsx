"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useScroll, useSpring, type MotionValue } from "framer-motion";
import { services } from "@/lib/persona";
import { EASE_OUT_EXPO, FadeIn, RevealText, SectionLabel, useReducedMotion } from "./ui";
import { Magnetic } from "./Cursor";

type Service = (typeof services)[number];

/** One line drawing per service, on a 120 x 120 grid. Each is a single path so it can draw itself in. */
const GLYPHS: Record<Service["id"], string> = {
  websites:
    "M20 24h80a6 6 0 0 1 6 6v60a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6Z M14 40h92 M26 52h30v32H26Z M66 56h28 M66 68h28 M66 80h18",
  apps: "M50 12h20a10 10 0 0 1 10 10v76a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10V22a10 10 0 0 1 10-10Z M54 22h12 M48 36h24v18H48Z M48 64h24 M48 74h16 M56 96h8",
  voice: "M18 56v8 M30 46v28 M42 34v52 M54 20v80 M66 30v60 M78 42v36 M90 50v20 M102 56v8",
  agents:
    "M68 24a8 8 0 1 1-16 0a8 8 0 1 1 16 0Z M36 88a8 8 0 1 1-16 0a8 8 0 1 1 16 0Z M100 88a8 8 0 1 1-16 0a8 8 0 1 1 16 0Z M68 62a8 8 0 1 1-16 0a8 8 0 1 1 16 0Z M60 32v22 M53 66l-21 16 M67 66l21 16 M36 88h48",
  social:
    "M28 52a32 32 0 0 1 56-18 M84 18v16H68 M92 68a32 32 0 0 1-56 18 M36 102V86h16 M50 60a10 10 0 0 1 20 0a10 10 0 0 1-20 0Z",
  ads: "M22 50v20h14l42 22V28L36 50Z M36 70l8 24h10l-6-24 M90 46c6 5 6 23 0 28 M100 36c12 10 12 38 0 48",
  video: "M22 26h76a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8Z M50 44v28l24-14Z M14 104h92 M40 98v12",
};

/** The service's line drawing, drawn in stroke by stroke when it mounts. */
function Glyph({ id, className = "" }: { id: Service["id"]; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden className={className}>
      <motion.path
        d={GLYPHS[id]}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: EASE_OUT_EXPO }}
      />
    </svg>
  );
}

/**
 * The sticky stage beside the list on wide screens: the active service's number rolls over, its
 * drawing redraws inside a slowly turning ring, and the ring's arc tracks progress through the list.
 */
function Stage({ active, progress }: { active: number; progress: MotionValue<number> }) {
  const s = services[active];
  return (
    <div className="sticky top-28 hidden md:block">
      <div className="relative aspect-square w-full max-w-[460px]">
        <div
          aria-hidden
          className="absolute inset-[12%] rounded-full bg-term-accent/10 blur-3xl transition-opacity duration-700"
        />
        <svg viewBox="0 0 200 200" aria-hidden className="absolute inset-0 h-full w-full">
          <circle cx="100" cy="100" r="96" className="stroke-term-line" strokeWidth="0.5" fill="none" />
          <g className="animate-[spin_40s_linear_infinite]" style={{ transformOrigin: "100px 100px" }}>
            <circle
              cx="100"
              cy="100"
              r="84"
              className="stroke-term-line"
              strokeWidth="0.5"
              strokeDasharray="1 5"
              fill="none"
            />
            <circle cx="100" cy="16" r="2" className="fill-term-accent" />
          </g>
          <motion.circle
            cx="100"
            cy="100"
            r="96"
            className="stroke-term-accent"
            strokeWidth="1"
            fill="none"
            transform="rotate(-90 100 100)"
            style={{ pathLength: progress }}
          />
        </svg>

        <div className="absolute inset-[24%] text-term-accent-bright">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={s.id}
              className="h-full w-full"
              initial={{ opacity: 0, scale: 0.85, rotate: -8, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.1, rotate: 8, filter: "blur(8px)" }}
              transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
            >
              <Glyph id={s.id} className="h-full w-full" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 flex items-end gap-4">
        <span className="relative block h-[1em] overflow-hidden font-display text-7xl font-medium leading-none tracking-[-0.04em] text-term-paper lg:text-8xl">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={active}
              className="block"
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              {String(active + 1).padStart(2, "0")}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="pb-2 font-mono text-xs uppercase tracking-[0.2em] text-term-muted">
          / {String(services.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

/**
 * One service. It becomes the active one when it crosses the middle of the viewport, or when the
 * pointer or keyboard focus lands on it. On small screens every row is shown at full strength.
 */
function Row({
  s,
  index,
  active,
  onActivate,
}: {
  s: Service;
  index: number;
  active: boolean;
  onActivate: (i: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const centred = useInView(ref, { margin: "-45% 0px -50% 0px" });
  useEffect(() => {
    if (centred) onActivate(index);
  }, [centred, index, onActivate]);

  return (
    <li
      ref={ref}
      onMouseEnter={() => onActivate(index)}
      onFocus={() => onActivate(index)}
      className="group relative border-t border-term-line"
    >
      <motion.span
        aria-hidden
        className="absolute left-0 top-0 h-px w-full origin-left bg-term-accent"
        initial={false}
        animate={{ scaleX: active ? 1 : 0 }}
        transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
      />
      <FadeIn className="py-10 md:py-14">
        <div className="flex items-start gap-5">
          <Glyph id={s.id} className="mt-1 h-10 w-10 shrink-0 text-term-accent md:hidden" />
          <div className="min-w-0 flex-1">
            <p className="mb-3 font-mono text-xs text-term-accent">{String(index + 1).padStart(2, "0")}</p>
            <h3
              className={`font-display text-3xl font-medium leading-[1.02] tracking-[-0.03em] transition-[color,transform] duration-500 md:text-5xl lg:text-6xl ${
                active ? "text-term-paper md:translate-x-3" : "text-term-paper md:text-term-muted"
              }`}
            >
              {s.title}
            </h3>
            <p
              className={`mt-5 max-w-xl text-base leading-relaxed transition-colors duration-500 md:text-lg ${
                active ? "text-term-fg/85" : "text-term-fg/85 md:text-term-fg/60"
              }`}
            >
              {s.summary}
            </p>

            <ul className="mt-6 space-y-1.5 text-sm text-term-fg/75">
              {s.proof.map((p) => (
                <li key={p} className="flex gap-3">
                  <span aria-hidden className="select-none text-term-accent">✦</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>

            <ul aria-label="Tools" className="mt-6 flex flex-wrap gap-2">
              {s.tags.map((t, i) => (
                <li
                  key={t}
                  style={{ transitionDelay: active ? `${i * 50}ms` : "0ms" }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors duration-500 ${
                    active ? "border-term-accent/60 text-term-paper" : "border-term-line text-term-muted"
                  }`}
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </FadeIn>
    </li>
  );
}

export function Services() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 0.6", "end 0.6"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  return (
    <section id="services" aria-label="Services" className="mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-40">
      <SectionLabel index="04" label="Services" />
      <RevealText
        text="Not only front end. Whatever your business needs."
        className="max-w-[16ch] font-display text-5xl font-medium leading-[0.95] tracking-[-0.04em] text-term-paper md:text-8xl"
      />
      <FadeIn delay={0.2}>
        <p className="mt-10 max-w-2xl text-base leading-relaxed text-term-fg/80 md:mt-12 md:text-lg">
          Front end is where I started. Today I build the whole thing: the website or app, the AI agents behind it,
          and the automations that keep your marketing running while you get on with the work.
        </p>
      </FadeIn>

      <div className="mt-16 grid gap-10 md:mt-24 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-5">
          <Stage active={active} progress={progress} />
        </div>
        <ol ref={listRef} className="border-b border-term-line md:col-span-7">
          {services.map((s, i) => (
            <Row key={s.id} s={s} index={i} active={active === i} onActivate={setActive} />
          ))}
        </ol>
      </div>

      <FadeIn className="mt-20 flex flex-col items-start justify-between gap-8 border-t border-term-line pt-10 md:mt-28 md:flex-row md:items-center">
        <p className="max-w-xl font-display text-2xl font-medium leading-snug tracking-tight text-term-paper md:text-4xl">
          Something else in mind? If it runs on software, I can most likely build it.
        </p>
        <Magnetic>
          <a
            href="#contact"
            data-cursor="Let's talk"
            className="group inline-flex items-center gap-3 rounded-full bg-term-accent px-7 py-4 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright"
          >
            Tell me about it
            <span aria-hidden className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1">
              ↗
            </span>
          </a>
        </Magnetic>
      </FadeIn>
    </section>
  );
}

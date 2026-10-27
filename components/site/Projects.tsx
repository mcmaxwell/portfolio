"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { projects } from "@/data";
import { caseForProject } from "@/data/cases";
import { vt } from "./CaseStudy";
import { Magnetic } from "./Cursor";
import { EASE_OUT_EXPO, FadeIn, RevealText, SectionLabel, useReducedMotion } from "./ui";

type Project = {
  id: number;
  title: string;
  des: string;
  summary: string;
  role: string;
  stack: string[];
  img?: string;
  link: string;
  tag?: string;
  clients?: { name: string; url: string }[];
};

/** "XecSuite - AI Operating Layer" gives ["XecSuite", "AI Operating Layer"]. */
function splitTitle(title: string): [string, string] {
  const [name, ...rest] = title.split(/\s[–—-]\s/);
  return [name.trim(), rest.join(" - ").trim()];
}

function isExternal(p: Project) {
  return p.link?.startsWith("http") ?? false;
}

function VisitLink({ p, name }: { p: Project; name: string }) {
  if (!isExternal(p)) return null;
  return (
    <Magnetic>
      <a
        href={p.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group/link inline-flex items-center gap-3 rounded-full border border-term-paper/25 px-5 py-2.5 text-sm text-term-paper transition-colors hover:border-term-accent hover:bg-term-accent hover:text-term-bg"
      >
        Visit {name}
        <span aria-hidden className="transition-transform duration-300 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5">
          ↗
        </span>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Magnetic>
  );
}

function Clients({ p }: { p: Project }) {
  if (!p.clients) return null;
  return (
    <ul className="mt-6 flex flex-wrap gap-2" aria-label="Clients">
      {p.clients.map((c) => (
        <li key={c.name}>
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full border border-term-line px-3 py-1 text-xs text-term-muted transition-colors hover:border-term-accent hover:text-term-accent"
          >
            {c.name} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

/** True on screens big enough to hold a whole case-study card (the stacking cards need that). */
function useStackMode() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)");
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return on;
}

/**
 * A screenshot that ripples when the pointer arrives: an SVG turbulence field displaces the
 * image for a moment and settles back. The filter is attached only while it plays.
 */
function RippleImage({ src, alt, id }: { src: string; alt: string; id: string }) {
  const disp = useRef<SVGFEDisplacementMapElement>(null);
  const turb = useRef<SVGFETurbulenceElement>(null);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const play = () => {
    if (reduced || playing) return;
    setPlaying(true);
    const controls = animate(0, 1, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (t) => {
        disp.current?.setAttribute("scale", String(Math.sin(Math.PI * t) * 46));
        turb.current?.setAttribute("baseFrequency", `${0.012 + t * 0.01} ${0.03 - t * 0.012}`);
      },
      onComplete: () => setPlaying(false),
    });
    return () => controls.stop();
  };
  return (
    <>
      <svg aria-hidden className="absolute h-0 w-0">
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="3" />
          <feDisplacementMap ref={disp} in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onPointerEnter={play}
        style={playing ? { filter: `url(#${id})` } : undefined}
        className="h-full w-full object-cover object-top transition-transform duration-1000 ease-out group-hover:scale-[1.06]"
      />
    </>
  );
}

/**
 * A case-study card: screenshot with a clip reveal, a slow parallax and a hover ripple, then the
 * story. On large screens the cards pin and stack, and each one sinks back a little as the next
 * slides over it.
 */
function Featured({
  p,
  index,
  total,
  stack,
  progress,
}: {
  p: Project;
  index: number;
  total: number;
  stack: boolean;
  progress: MotionValue<number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? ["0%", "0%"] : ["-6%", "6%"]);
  const targetScale = 1 - (total - 1 - index) * 0.05;
  const scale = useTransform(progress, [index / total, 1], [1, stack ? targetScale : 1]);
  const dim = useTransform(progress, [index / total, 1], [0, stack ? (total - 1 - index) * 0.18 : 0]);
  const [name, subtitle] = splitTitle(p.title);
  const flip = index % 2 === 1;
  const num = String(index + 1).padStart(2, "0");
  const study = caseForProject(p.id);
  const caseHref = study ? `/work/${study.slug}` : null;

  const image = (
    <motion.div
      style={study ? vt(`case-media-${study.slug}`) : undefined}
      className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-term-bg md:aspect-[16/11]"
      initial={reduced ? false : { clipPath: "inset(14% 14% 14% 14% round 16px)" }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0% round 16px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 1.4, ease: EASE_OUT_EXPO }}
    >
      <motion.div style={{ y }} className="absolute inset-[-7%]">
        <RippleImage src={p.img!} alt={`Screenshot of ${name}`} id={`ripple-${p.id}`} />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-term-bg/40 via-transparent to-transparent" />
      {p.tag && (
        <span className="absolute left-4 top-4 rounded-full bg-term-bg/80 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-term-accent backdrop-blur">
          {p.tag}
        </span>
      )}
    </motion.div>
  );

  return (
    <div
      ref={ref}
      // The last card has nothing sliding over it, so it scrolls normally (and may be taller than the screen).
      className={stack && index < total - 1 ? "sticky top-0 flex h-screen items-center" : ""}
    >
      <motion.article
        style={{ scale, top: stack ? `calc(-4vh + ${index * 28}px)` : undefined }}
        className="relative w-full origin-top rounded-[28px] border border-term-line bg-term-panel p-5 md:p-8 lg:p-10"
      >
        <div className="grid items-center gap-8 md:grid-cols-12 md:gap-12">
          <div className={`md:col-span-7 ${flip ? "md:order-2" : ""}`}>
            {/* A plain anchor, not <Link>: the case page is a full navigation so the browser can run the
                view transition from this card. */}
            {caseHref ? (
              <a href={caseHref} tabIndex={-1} aria-hidden data-cursor="Read">
                {image}
              </a>
            ) : (
              image
            )}
          </div>
          <div className={`md:col-span-5 ${flip ? "md:order-1" : ""}`}>
            <FadeIn>
              <div className="mb-5 flex items-center gap-3 font-mono text-xs text-term-muted">
                <span className="text-term-accent">{num}</span>
                <span className="h-px w-8 bg-term-line" />
                <span>{p.role}</span>
              </div>
              <h3
                style={study ? vt(`case-title-${study.slug}`) : undefined}
                className="font-display text-[clamp(2.25rem,10vw,3rem)] font-medium leading-none [overflow-wrap:anywhere] tracking-[-0.03em] text-term-paper md:text-6xl"
              >
                {name}
              </h3>
              {subtitle && <p className="mt-3 text-sm text-term-muted">{subtitle}</p>}
              <p className="mt-6 text-lg leading-snug text-term-paper/90 md:text-xl">{study?.hook ?? p.summary}</p>
              {study && (
                <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-term-line pt-4">
                  {study.facts.map((f) => (
                    <div key={f.label}>
                      <dd className="font-display text-2xl font-medium tracking-tight text-term-paper md:text-3xl">{f.value}</dd>
                      <dt className="mt-0.5 text-[11px] leading-snug text-term-muted">{f.label}</dt>
                    </div>
                  ))}
                </dl>
              )}
              <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-term-muted" aria-label="Stack">
                {p.stack.map((s) => (
                  <li key={s}>
                    <span className="text-term-accent">/</span> {s}
                  </li>
                ))}
              </ul>
              {!study?.clients && <Clients p={p} />}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {caseHref && (
                  <Magnetic>
                    <a
                      href={caseHref}
                      className="group/case inline-flex items-center gap-3 rounded-full bg-term-accent px-5 py-2.5 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright"
                    >
                      Read the case
                      <span aria-hidden className="transition-transform duration-300 group-hover/case:translate-x-1">→</span>
                    </a>
                  </Magnetic>
                )}
                <VisitLink p={p} name={name} />
              </div>
            </FadeIn>
          </div>
        </div>
        {/* Sinks into shadow as the next card covers it */}
        <motion.div aria-hidden style={{ opacity: dim }} className="pointer-events-none absolute inset-0 rounded-[28px] bg-black" />
      </motion.article>
    </div>
  );
}

export function Projects() {
  const all: readonly Project[] = projects;
  const featured = all.filter((p) => p.img);
  const stackRef = useRef<HTMLDivElement>(null);
  const stack = useStackMode();
  const { scrollYProgress } = useScroll({ target: stackRef, offset: ["start start", "end end"] });
  return (
    <section id="projects" aria-label="Selected work" className="mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-40">
      <SectionLabel index="02" label="Selected work" />
      <RevealText
        text="Things I've built and shipped."
        className="mb-20 max-w-[14ch] font-display text-5xl font-medium leading-[0.95] tracking-[-0.04em] text-term-paper md:mb-32 md:text-8xl"
      />

      <div ref={stackRef} className={stack ? "relative" : "space-y-16 md:space-y-24"}>
        {featured.map((p, i) => (
          <Featured key={p.id} p={p} index={i} total={featured.length} stack={stack} progress={scrollYProgress} />
        ))}
      </div>

    </section>
  );
}

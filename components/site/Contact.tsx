"use client";

import { useEffect, useState } from "react";
import { owner } from "@/lib/persona";
import { RevealText, SectionLabel } from "./ui";
import { Magnetic } from "./Cursor";

/** Maksym's local time, ticking each minute. Empty until mounted so server and client agree. */
function LocalTime() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Toronto",
    });
    const update = () => setTime(fmt.format(new Date()));
    update();
    const id = setInterval(update, 15_000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{time || "--:--"}</span>;
}

export function Contact() {
  return (
    <section id="contact" aria-label="Contact" className="relative overflow-hidden border-t border-term-line">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[60vh] w-[90vw] -translate-x-1/2 -translate-y-1/3 rounded-full bg-term-accent/10 blur-[120px]"
      />
      <div className="relative mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-40">
        <SectionLabel index="04" label="Contact" />
        <RevealText
          text="Let's build something."
          className="font-display text-[15vw] font-medium leading-[0.9] tracking-[-0.05em] text-term-paper md:text-[10vw]"
        />

        <p className="mt-10 max-w-xl text-base leading-relaxed text-term-fg/80 md:text-lg">
          I&apos;m open to AI and front-end roles, product collaborations and automation projects. Send a line and
          I&apos;ll usually reply within a day.
        </p>

        <a
          href={`mailto:${owner.email}`}
          data-cursor="Say hi"
          className="group mt-12 inline-flex max-w-full items-center gap-4 break-all font-display text-2xl text-term-accent-bright sm:text-4xl md:text-5xl"
        >
          <span className="link-draw">{owner.email}</span>
          <Magnetic strength={0.5}>
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-term-accent text-xl text-term-bg transition-transform duration-500 group-hover:rotate-45 md:h-16 md:w-16"
            >
              ↗
            </span>
          </Magnetic>
        </a>

        <div className="mt-20 grid gap-10 border-t border-term-line pt-10 text-sm sm:grid-cols-3">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-term-muted">Elsewhere</p>
            <ul className="space-y-1">
              <li>
                <a href={owner.linkedin} target="_blank" rel="noopener noreferrer" className="link-draw text-term-paper">
                  LinkedIn ↗
                </a>
              </li>
              <li>
                <a href="https://www.xecsuite.com" target="_blank" rel="noopener noreferrer" className="link-draw text-term-paper">
                  XecSuite ↗
                </a>
              </li>
              <li>
                <a href="https://apexmind.studio" target="_blank" rel="noopener noreferrer" className="link-draw text-term-paper">
                  Apex Mind ↗
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-term-muted">Local time</p>
            <p className="text-term-paper">
              <LocalTime /> in London, Ontario
            </p>
          </div>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-term-muted">Prefer to talk?</p>
            <a href="#top" className="link-draw text-term-paper">
              Ask my avatar at the top ↑
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-term-line px-5 py-8 md:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 text-xs text-term-muted">
        <span>© 2026 {owner.name}</span>
        <span className="flex items-center gap-1.5">
          Designed and built in London, Ontario with Next.js and Three.js
          <span aria-hidden className="inline-block h-3 w-1.5 translate-y-px bg-term-accent animate-blink" />
        </span>
        <a href="#top" className="link-draw text-term-paper">
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}

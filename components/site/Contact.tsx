"use client";

import { useEffect, useState } from "react";
import { owner } from "@/lib/persona";
import { RevealText, SectionLabel } from "./ui";
import { Magnetic } from "./Cursor";
import { LENS_PITCH } from "@/lib/memory/lenses";
import { useLens } from "@/lib/memory/useLens";
import { SoundToggle } from "./SoundToggle";
import { TransitionLink } from "@/components/site/TransitionLink";

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

/** Copies the address for visitors whose mail links open nothing (webmail, locked-down machines). */
function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
    } catch {
      // Clipboard refused: leave the address to be selected by hand.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      data-cursor={copied ? "Copied" : "Copy"}
      className="rounded-full border border-term-paper/25 px-5 py-2.5 text-sm text-term-paper transition-colors hover:border-term-accent hover:text-term-accent"
    >
      <span aria-live="polite">{copied ? "Copied ✓" : "Copy email"}</span>
    </button>
  );
}

/** The line under the headline, in the words of whoever is reading (the "Who are you?" lens). */
function Pitch() {
  const { lens, chosen } = useLens();
  return (
    <p className="mt-10 max-w-xl text-base leading-relaxed text-term-fg/80 md:text-lg">
      {chosen
        ? LENS_PITCH[lens]
        : "Tell me what your business needs: a website, an app, a voice agent, automated posts and ads, or something that doesn't have a name yet. I'm also open to AI and front-end roles. Send a line and I'll usually reply within a day."}
    </p>
  );
}

export function Contact() {
  return (
    <section id="contact" aria-label="Contact" className="relative overflow-hidden border-t border-term-line">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[60vh] w-[90vw] -translate-x-1/2 -translate-y-1/3 rounded-full bg-term-accent/10 blur-[120px]"
      />
      <div className="relative mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-40">
        {/* Where the memory layer's particles come back together as the avatar (components/memory):
            beside the text on wide screens, in a strip of its own below the email on narrow ones. */}
        <div aria-hidden data-memory="wave" className="pointer-events-none absolute right-10 top-1/2 hidden h-[64vh] w-[26vw] -translate-y-1/2 lg:block" />
        <SectionLabel index="05" label="Contact" />
        <RevealText
          text="Let's build something."
          className="font-display text-[15vw] font-medium leading-[0.9] tracking-[-0.05em] text-term-paper md:text-[10vw]"
        />

        <Pitch />

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-4">
        <a
          href={`mailto:${owner.email}`}
          data-cursor="Say hi"
          className="group inline-flex max-w-full items-center gap-4 break-all font-display text-[clamp(1.05rem,5.2vw,1.5rem)] text-term-accent-bright sm:text-4xl md:text-5xl"
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
        <CopyEmail email={owner.email} />
        </div>
        <div aria-hidden data-memory="wave" className="mt-6 h-[42vh] lg:hidden" />

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
          Designed and built in London, Ontario.{" "}
          <TransitionLink href="/colophon" className="link-draw text-term-paper">
            How it&apos;s made
          </TransitionLink>
          <span aria-hidden className="inline-block h-3 w-1.5 translate-y-px bg-term-accent animate-blink" />
        </span>
        <span className="flex items-center gap-6">
          <SoundToggle />
          <a href="#top" className="link-draw text-term-paper">
            Back to top ↑
          </a>
        </span>
      </div>
    </footer>
  );
}

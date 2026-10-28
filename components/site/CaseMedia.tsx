"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { CaseScreen, CaseStudy } from "@/data/cases";

/** Plays a muted loop only while it is on screen, and never with reduced motion (the poster stays). */
function useLoop(ref: RefObject<HTMLVideoElement>) {
  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [ref]);
}

/**
 * The picture at the top of a case page: a short silent loop when the case has one, otherwise its
 * screenshot. The loop plays only while on screen and never with reduced motion (the poster shows).
 */
export function CaseMedia({ media, name }: { media: CaseStudy["media"]; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useLoop(ref);

  if (media.video) {
    return (
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        poster={media.video.poster ?? media.image}
        aria-label={`${name}, screen recording`}
        className="h-full w-full object-cover object-top"
      >
        {media.video.webm && <source src={media.video.webm} type="video/webm" />}
        <source src={media.video.mp4} type="video/mp4" />
      </video>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media.image} alt={media.alt} className="h-full w-full object-cover object-top" />;
}

const SPAN: Record<CaseScreen["layout"], string> = {
  wide: "md:col-span-4",
  half: "md:col-span-3",
  full: "md:col-span-6",
  phone: "md:col-span-2 md:row-span-2",
};

function Screen({ s }: { s: CaseScreen }) {
  const ref = useRef<HTMLVideoElement>(null);
  useLoop(ref);
  const phone = s.layout === "phone";
  const frame = phone
    ? "mx-auto w-full max-w-[280px] overflow-hidden rounded-[2rem] border-[6px] border-term-line bg-term-panel"
    : "overflow-hidden rounded-xl border border-term-line bg-term-panel";
  return (
    <figure className={`flex min-w-0 flex-col gap-3 ${SPAN[s.layout]} ${phone ? "md:justify-center" : ""}`}>
      <div className={frame}>
        {s.kind === "video" ? (
          <video
            ref={ref}
            muted
            loop
            playsInline
            preload="none"
            poster={s.poster}
            width={s.width}
            height={s.height}
            aria-label={s.caption}
            className="block h-auto w-full"
          >
            <source src={s.src} type="video/mp4" />
          </video>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.src} alt={s.caption} width={s.width} height={s.height} loading="lazy" className="block h-auto w-full" />
        )}
      </div>
      <figcaption className={`text-sm text-term-muted ${phone ? "mx-auto max-w-[280px]" : ""}`}>{s.caption}</figcaption>
    </figure>
  );
}

/** More of the product below the story: loops and stills on a six-column grid, phones in a frame. */
export function CaseScreens({ screens }: { screens: readonly CaseScreen[] }) {
  return (
    <div className="grid gap-x-6 gap-y-10 md:grid-cols-6">
      {screens.map((s) => (
        <Screen key={s.src} s={s} />
      ))}
    </div>
  );
}

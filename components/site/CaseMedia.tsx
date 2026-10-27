"use client";

import { useEffect, useRef } from "react";
import type { CaseStudy } from "@/data/cases";

/**
 * The picture at the top of a case page: a short silent loop when the case has one, otherwise its
 * screenshot. The loop plays only while on screen and never with reduced motion (the poster shows).
 */
export function CaseMedia({ media, name }: { media: CaseStudy["media"]; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, []);

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

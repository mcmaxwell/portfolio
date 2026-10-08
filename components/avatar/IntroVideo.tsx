"use client";

import { useEffect, useRef, useState } from "react";

// Cinematic intro that plays over the avatar hero and hands off to the live
// 3D avatar. The video's last frame is a screenshot of the avatar taken with
// ?capture=1, so hiding the video on "ended" reads as one continuous shot.
// Disabled until NEXT_PUBLIC_INTRO_VIDEO_URL is set.
const SRC = process.env.NEXT_PUBLIC_INTRO_VIDEO_URL;
const SRC_MOBILE = process.env.NEXT_PUBLIC_INTRO_VIDEO_MOBILE_URL;
const SEEN_KEY = "intro-video-seen";
const FADE_MS = 300;

function shouldPlay() {
  if (!SRC) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("capture")) return false;
  if (params.has("intro")) return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}

type Props = {
  /** True while the cover is mounted (playing or fading), false once it is gone or never started. */
  onActiveChange?: (active: boolean) => void;
};

export const IntroVideo = ({ onActiveChange }: Props) => {
  const [state, setState] = useState<"off" | "playing" | "fading">("off");
  const [src, setSrc] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!shouldPlay()) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    setSrc(mobile && SRC_MOBILE ? SRC_MOBILE : SRC);
    setState("playing");
  }, []);

  // Report the cover's presence so the hero controls beneath it can be made inert while it is up.
  const active = state !== "off" && !!src;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const finish = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setState("fading");
    setTimeout(() => setState("off"), FADE_MS);
  };

  useEffect(() => {
    if (state !== "playing") return;
    // Autoplay can be blocked (low-power mode); skip straight to the avatar.
    videoRef.current?.play().catch(finish);
  }, [state, src]);

  if (state === "off" || !src) return null;

  return (
    <div
      className="absolute inset-0 z-30 bg-term-bg transition-opacity ease-out"
      style={{
        opacity: state === "fading" ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        className="h-full w-full object-cover"
      />
      <button
        onClick={finish}
        className="absolute bottom-6 right-6 border border-term-line bg-term-bg/70 px-3 py-1.5 text-xs text-term-muted backdrop-blur transition-colors hover:border-term-green hover:text-term-green"
      >
        [ skip intro ]
      </button>
    </div>
  );
};

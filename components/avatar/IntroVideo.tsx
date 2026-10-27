"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

// Cinematic intro that plays over the avatar hero and hands off to the live 3D avatar. The film's
// last shot is the avatar alone on a dark ground; when it ends, the held frame is scaled and moved
// so that avatar lands exactly on the live one, then the cover dissolves into the canvas beneath.
//
// Sources: the built-in encodes in public/intro (AV1 WebM first, H.264 MP4 for Safari; a 9:16 cut
// for portrait phones). NEXT_PUBLIC_INTRO_VIDEO_URL (and _MOBILE_URL) replace them with one file
// each, and setting it to an empty string turns the intro off.
const ENV_SRC = process.env.NEXT_PUBLIC_INTRO_VIDEO_URL;
const ENV_SRC_MOBILE = process.env.NEXT_PUBLIC_INTRO_VIDEO_MOBILE_URL;

type Source = { src: string; type?: string };
type Cut = { sources: Source[]; poster?: string };

const BUILT_IN: { desktop: Cut; mobile: Cut } = {
  desktop: {
    sources: [
      { src: "/intro/intro-720.webm", type: 'video/webm; codecs="av01.0.05M.08, opus"' },
      { src: "/intro/intro-720.mp4", type: "video/mp4" },
    ],
    poster: "/intro/intro-poster.webp",
  },
  mobile: {
    sources: [
      { src: "/intro/intro-mobile.webm", type: 'video/webm; codecs="av01.0.04M.08, opus"' },
      { src: "/intro/intro-mobile.mp4", type: "video/mp4" },
    ],
    poster: "/intro/intro-poster-mobile.webp",
  },
};

// Where the avatar stands in the film's last frame, as fractions of the frame height (both cuts
// keep the full frame height, and the avatar is centred horizontally).
export const FILM_AVATAR = { top: 0.025, bottom: 0.975 };
// Where the live avatar stands in the hero, as fractions of the hero height. The hero camera has a
// fixed vertical field of view (shell/transition.ts HERO), so this holds at every aspect ratio;
// measured from a ?capture=1 render.
export const LIVE_AVATAR = { top: 0.124, bottom: 0.799 };
// The film's own background, so the scaled-down frame has no visible edge on the cover.
const FILM_BG = "#030404";

const SEEN_KEY = "intro-video-seen";
const MATCH_MS = 1100;
const DISSOLVE_MS = 700;
const SKIP_MS = 400;
const EASE = "cubic-bezier(0.76, 0, 0.24, 1)";
// The first-visit curtain (Preloader, globals.css) starts lifting 1.55 s after the first paint.
const CURTAIN_LIFT_MS = 1550;

function pickCut(): Cut | null {
  if (ENV_SRC === "") return null;
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  if (ENV_SRC) return { sources: [{ src: mobile && ENV_SRC_MOBILE ? ENV_SRC_MOBILE : ENV_SRC }] };
  return mobile && window.innerHeight > window.innerWidth ? BUILT_IN.mobile : BUILT_IN.desktop;
}

function shouldPlay() {
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

// Time left until the curtain starts lifting, so the film's opening is not spent behind it.
function curtainDelay() {
  const curtain = document.querySelector(".preloader");
  if (!curtain || document.documentElement.classList.contains("intro-seen")) return 0;
  if (getComputedStyle(curtain).display === "none") return 0;
  return Math.max(0, CURTAIN_LIFT_MS - performance.now());
}

// The transform that puts the film's avatar on the live one: the video is object-cover inside the
// hero box, so its rendered height is max(box height, box width / aspect), centred.
export function matchTransform(box: DOMRect, video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight || !box.height) return null;
  const aspect = video.videoWidth / video.videoHeight;
  const H = box.height;
  const shown = Math.max(H, box.width / aspect);
  const offset = (H - shown) / 2;
  const filmTop = offset + FILM_AVATAR.top * shown;
  const filmBottom = offset + FILM_AVATAR.bottom * shown;
  const liveTop = LIVE_AVATAR.top * H;
  const liveBottom = LIVE_AVATAR.bottom * H;
  const scale = (liveBottom - liveTop) / (filmBottom - filmTop);
  // Scaling about the box centre moves the film avatar's centre; translate the rest of the way.
  const y = (liveTop + liveBottom) / 2 - (H / 2 + scale * ((filmTop + filmBottom) / 2 - H / 2));
  return `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
}

type Phase = "off" | "playing" | "matching" | "dissolving";

type Props = {
  /** True while the cover is mounted (playing or fading), false once it is gone or never started. */
  onActiveChange?: (active: boolean) => void;
  /** True only while the film fully covers the hero (before the hand-off starts). */
  onCoveringChange?: (covering: boolean) => void;
};

export const IntroVideo = ({ onActiveChange, onCoveringChange }: Props) => {
  const [phase, setPhase] = useState<Phase>("off");
  const [cut, setCut] = useState<Cut | null>(null);
  const [muted, setMuted] = useState(true);
  const [match, setMatch] = useState<string | null>(null);
  const [fadeMs, setFadeMs] = useState(DISSOLVE_MS);
  const coverRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!shouldPlay()) return;
    const picked = pickCut();
    if (!picked) return;
    setCut(picked);
    setPhase("playing");
  }, []);

  // Report the cover's presence so the hero controls beneath it can be made inert while it is up.
  const active = phase !== "off" && !!cut;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  const covering = phase === "playing" && !!cut;
  useEffect(() => {
    onCoveringChange?.(covering);
  }, [covering, onCoveringChange]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const markSeen = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };

  const dissolve = useCallback((ms: number) => {
    markSeen();
    setFadeMs(ms);
    setPhase("dissolving");
    later(() => setPhase("off"), ms);
  }, [later]);

  // The film ended on the avatar: glide the held frame onto the live avatar, then dissolve.
  const handOff = () => {
    const video = videoRef.current;
    const box = coverRef.current?.getBoundingClientRect();
    const transform = video && box ? matchTransform(box, video) : null;
    if (!transform) return dissolve(SKIP_MS);
    markSeen();
    setMatch(transform);
    setPhase("matching");
    later(() => dissolve(DISSOLVE_MS), MATCH_MS);
  };

  useEffect(() => {
    if (phase !== "playing") return;
    // Start as the curtain lifts. Autoplay can be blocked (low-power mode): skip to the avatar.
    const t = window.setTimeout(() => {
      videoRef.current?.play().catch(() => dissolve(SKIP_MS));
    }, curtainDelay());
    return () => clearTimeout(t);
  }, [phase, cut, dissolve]);

  // A thin progress line, written straight to the DOM once per frame.
  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && barRef.current && v.duration) {
        barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
    setMuted(v.muted);
  };

  if (phase === "off" || !cut) return null;

  const controlsShown = phase === "playing";
  const pill =
    "flex items-center gap-2 rounded-full border border-term-paper/20 bg-term-bg/50 px-4 py-2 text-xs text-term-paper backdrop-blur transition-colors hover:border-term-accent hover:text-term-accent";
  const videoStyle: CSSProperties = match
    ? { transform: match, transition: `transform ${MATCH_MS}ms ${EASE}`, willChange: "transform" }
    : {};

  return (
    <div
      ref={coverRef}
      className="absolute inset-0 z-30 overflow-hidden"
      style={{
        backgroundColor: FILM_BG,
        opacity: phase === "dissolving" ? 0 : 1,
        transition: `opacity ${fadeMs}ms ease-out`,
      }}
    >
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        preload="auto"
        poster={cut.poster}
        disablePictureInPicture
        aria-label="Intro film"
        onEnded={handOff}
        onError={() => dissolve(SKIP_MS)}
        className="h-full w-full object-cover"
        style={videoStyle}
      >
        {cut.sources.map((s, i) => (
          <source
            key={s.src}
            src={s.src}
            type={s.type}
            // A <source> failure does not reach the <video>: the last one failing means none played.
            onError={i === cut.sources.length - 1 ? () => dissolve(SKIP_MS) : undefined}
          />
        ))}
      </video>

      <div
        className="absolute inset-x-5 bottom-6 flex items-center justify-between gap-3 md:inset-x-10 md:bottom-10"
        style={{
          opacity: controlsShown ? 1 : 0,
          transition: `opacity 300ms ease-out`,
          pointerEvents: controlsShown ? "auto" : "none",
        }}
      >
        <button
          type="button"
          onClick={toggleSound}
          className={pill}
        >
          <SpeakerIcon muted={muted} />
          <span>{muted ? "Sound on" : "Sound off"}</span>
        </button>
        <button type="button" onClick={() => dissolve(SKIP_MS)} className={pill}>
          Skip intro
        </button>
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-term-paper/10" style={{ opacity: controlsShown ? 1 : 0 }}>
        <div ref={barRef} className="h-px w-full origin-left bg-term-accent" style={{ transform: "scaleX(0)" }} />
      </div>
    </div>
  );
};

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? (
        <path d="m22 9-6 6m0-6 6 6" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      )}
    </svg>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { EASE } from "@/components/game/shell/transition";

// Cinematic intro that plays over the avatar hero and hands off to the live 3D avatar. The video
// ends on the avatar alone on the site's background; on "ended" the frame glides from the video's
// framing onto the live avatar's (landingTransform) and then dissolves into the canvas beneath.
// Plays once per tab session, never with reduced motion or Save-Data, and never with ?capture.
// NEXT_PUBLIC_INTRO_VIDEO=off disables it; NEXT_PUBLIC_INTRO_VIDEO_URL(_MOBILE) override the files.
type Source = { src: string; type: string };

const DISABLED = process.env.NEXT_PUBLIC_INTRO_VIDEO === "off";
const URL_OVERRIDE = process.env.NEXT_PUBLIC_INTRO_VIDEO_URL;
const URL_OVERRIDE_MOBILE = process.env.NEXT_PUBLIC_INTRO_VIDEO_MOBILE_URL;
const SOURCES: Record<"desktop" | "mobile", Source[]> = {
  desktop: [
    { src: "/intro/intro-1080.webm", type: "video/webm" },
    { src: "/intro/intro-1080.mp4", type: "video/mp4" },
  ],
  mobile: [
    { src: "/intro/intro-720.webm", type: "video/webm" },
    { src: "/intro/intro-720.mp4", type: "video/mp4" },
  ],
};
const POSTER = "/intro/intro-poster.jpg";

const SEEN_KEY = "intro-video-seen";
/** The page preloader's curtain starts lifting at 1.55s (globals.css): start the film under it. */
const PRELOADER_LIFT_MS = 1550;
const LAND_MS = 1100;
const FADE_MS = 450;
/** Longest hold on the last frame waiting for the 3D avatar before dissolving anyway. */
const READY_WAIT_MS = 6000;
/** Seconds before the film ends at which the hero may start building the (hidden) 3D avatar. */
const STAGE_LEAD_S = 15;

// The avatar's place in the video's last frame (source pixels of the 1920x1080 film) and in the live
// hero (CSS pixels at a 1080px-tall hero, x from the canvas centre). Measured from the final frame
// and a ?capture=1 screenshot: head centre, head top and head-to-sole height.
const FILM = { w: 1920, h: 1080, headX: 964, top: 28, height: 1025 };
const LIVE = { refH: 1080, headDX: 5.5, top: 135, height: 727 };

/** The transform that moves the object-cover video's avatar exactly onto the live avatar. */
export function landingTransform(w: number, h: number) {
  const cover = Math.max(w / FILM.w, h / FILM.h);
  // The hero camera's field of view is vertical, so the live avatar scales with the hero's height.
  const k = h / LIVE.refH;
  const a = LIVE.height / FILM.height;
  const scale = (k * a) / cover;
  const x = k * (LIVE.headDX - a * (FILM.headX - FILM.w / 2));
  const y = k * (LIVE.top - a * (FILM.top - FILM.h / 2)) - h / 2;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

/** Whether the intro will play on this page view. Stable until the intro has played (session flag). */
export function introWillPlay() {
  if (DISABLED) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("capture")) return false;
  if (params.has("intro")) return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return false;
  try {
    return !sessionStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}

function pickSources(): Source[] {
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  if (URL_OVERRIDE) {
    const src = mobile && URL_OVERRIDE_MOBILE ? URL_OVERRIDE_MOBILE : URL_OVERRIDE;
    return [{ src, type: src.endsWith(".webm") ? "video/webm" : "video/mp4" }];
  }
  return SOURCES[mobile ? "mobile" : "desktop"];
}

type Props = {
  /** True once the live avatar has rendered: the dissolve waits for it so the hand-off never shows an empty stage. */
  avatarReady?: boolean;
  /** True while the cover is mounted (playing, landing or fading), false once it is gone or never started. */
  onActiveChange?: (active: boolean) => void;
  /** True while the film fully hides the stage, so the hero can stop rendering frames nobody sees. */
  onCoveringChange?: (covering: boolean) => void;
  /** Called once, STAGE_LEAD_S before the film ends (or as soon as the cover goes away early): time to build the avatar. */
  onStageNeeded?: () => void;
};

type State = "off" | "playing" | "landing" | "fading";

export const IntroVideo = ({ avatarReady = true, onActiveChange, onCoveringChange, onStageNeeded }: Props) => {
  const [state, setState] = useState<State>("off");
  const [sources, setSources] = useState<Source[]>();
  const [muted, setMuted] = useState(true);
  const [landing, setLanding] = useState<string>();
  const [landed, setLanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!introWillPlay()) return;
    setSources(pickSources());
    setState("playing");
  }, []);

  // Report the cover's presence so the hero controls beneath it can be made inert while it is up.
  const active = state !== "off" && !!sources;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  const covering = state === "playing" && !!sources;
  useEffect(() => {
    onCoveringChange?.(covering);
  }, [covering, onCoveringChange]);
  useEffect(() => {
    if (state === "landing" || state === "fading") onStageNeeded?.();
  }, [state, onStageNeeded]);
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v && v.duration - v.currentTime <= STAGE_LEAD_S) onStageNeeded?.();
  };

  const fadeOut = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    videoRef.current?.pause();
    setState("fading");
    setTimeout(() => setState("off"), FADE_MS);
  }, []);

  useEffect(() => {
    if (state !== "playing") return;
    // Start as the preloader curtain lifts, so its wipe reveals the film's first frame. Autoplay
    // can still be blocked (low-power mode): then skip straight to the avatar.
    const preloader = !document.documentElement.classList.contains("intro-seen");
    const t = setTimeout(() => {
      videoRef.current?.play().catch(fadeOut);
    }, preloader ? PRELOADER_LIFT_MS : 0);
    return () => clearTimeout(t);
  }, [state, sources, fadeOut]);

  const land = () => {
    const el = coverRef.current;
    if (!el || !el.clientWidth || !el.clientHeight) return fadeOut();
    setLanding(landingTransform(el.clientWidth, el.clientHeight));
    setState("landing");
    setTimeout(() => setLanded(true), LAND_MS);
  };

  // Landed on the live avatar's framing: dissolve once the avatar is actually there.
  useEffect(() => {
    if (state !== "landing" || !landed) return;
    if (avatarReady) return fadeOut();
    const t = setTimeout(fadeOut, READY_WAIT_MS);
    return () => clearTimeout(t);
  }, [state, landed, avatarReady, fadeOut]);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  if (state === "off" || !sources) return null;

  const videoStyle: CSSProperties = landing
    ? { transform: landing, transition: `transform ${LAND_MS}ms ${EASE.inOut}` }
    : {};
  const controlsHidden = state !== "playing";

  return (
    <div
      ref={coverRef}
      className="absolute inset-0 z-30 overflow-hidden bg-term-bg transition-opacity ease-out"
      style={{ opacity: state === "fading" ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        poster={POSTER}
        onTimeUpdate={onTimeUpdate}
        onEnded={land}
        onError={fadeOut}
        aria-label="Intro film: from a desk in the city, across the desert, ending on Maksym's avatar"
        className="h-full w-full object-cover will-change-transform"
        style={videoStyle}
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} onError={s === sources[sources.length - 1] ? fadeOut : undefined} />
        ))}
      </video>
      <div
        className="absolute bottom-6 right-5 flex items-center gap-2 transition-opacity duration-300 md:bottom-8 md:right-10"
        style={{ opacity: controlsHidden ? 0 : 1, pointerEvents: controlsHidden ? "none" : undefined }}
      >
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="flex h-10 items-center gap-2 rounded-full border border-term-paper/25 bg-term-bg/50 pl-3.5 pr-4 text-xs text-term-paper backdrop-blur transition-colors hover:border-term-accent hover:text-term-accent"
        >
          <SpeakerIcon muted={muted} />
          <span>{muted ? "Unmute" : "Mute"}</span>
        </button>
        <button
          type="button"
          onClick={fadeOut}
          className="h-10 rounded-full border border-term-paper/25 bg-term-bg/50 px-4 text-xs text-term-paper backdrop-blur transition-colors hover:border-term-accent hover:text-term-accent"
        >
          Skip intro
        </button>
      </div>
    </div>
  );
};

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <>
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
          <path d="M18.5 6.5a8 8 0 0 1 0 11" />
        </>
      )}
    </svg>
  );
}

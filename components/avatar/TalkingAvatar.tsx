"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Avatar, type GestureTrigger } from "./Avatar";
import { AskHints } from "./AskHints";
import { IntroVideo, introAvailable, introWillPlay } from "./IntroVideo";
import { RetryBoundary } from "./LoadBoundary";
import { useRealtimeChat, type ChatStatus } from "./useRealtimeChat";
import { GESTURES } from "@/lib/gestures";
import { avatarUrl, markMeshoptBroken, usesMeshopt } from "@/lib/avatarSource";
import { isSoftwareGL } from "@/lib/gpu";
import { AvatarPoster } from "./AvatarPoster";
import { LoadingStrip, FailureDialog } from "@/components/game/shell/LoadingOverlay";
import { ReadySignal } from "@/components/game/shell/ReadySignal";
import { CHROME, chromeTransition, chromeTranslate, EASE, HERO, TIMING, type ChromeItemId } from "@/components/game/shell/transition";
import { isWebGLAvailable, useExperienceShell } from "@/components/game/shell/useExperienceShell";

// A dropped or stalled connection on a phone must not leave the hero empty: the model is fetched again
// after these delays before the hero gives up and offers a manual retry.
const AVATAR_RETRY_MS = [1000, 3000, 8000] as const;

// Single fixed framing: pulled back a bit so head + torso/arms are visible,
// and it never moves (gestures play within this frame). Avatar group sits at
// y=HERO.feetY, so the head is at world y≈0.1, feet at y≈-1.5. The numbers live in
// shell/transition.ts because the Play transition hands this exact pose to the game camera.
const FRAME = {
  pos: new THREE.Vector3(...HERO.cameraPosition),
  target: new THREE.Vector3(...HERO.cameraTarget),
};

/**
 * Frames for the on-demand hero: one per pointer move (at most ~20 a second), one on any press or
 * key (a gesture may have been asked for), and every frame while a gesture plays or the camera is
 * still settling.
 */
function DrawOnChange({ gesturingRef, ready }: { gesturingRef: React.MutableRefObject<boolean>; ready: boolean }) {
  const { invalidate, camera } = useThree();
  // The avatar arrives after the canvas: draw it a few times so the idle clip is applied, not the
  // bind pose.
  useEffect(() => {
    if (!ready) return;
    const timers = [0, 120, 400].map((ms) => window.setTimeout(() => invalidate(), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [ready, invalidate]);
  useEffect(() => {
    let last = 0;
    const on = () => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      invalidate();
    };
    const now = () => invalidate();
    window.addEventListener("pointermove", on, { passive: true });
    window.addEventListener("pointerdown", now, { passive: true });
    window.addEventListener("keydown", now);
    window.addEventListener("avatar-gesture", now);
    const settle = window.setTimeout(() => invalidate(), 100);
    return () => {
      window.removeEventListener("pointermove", on);
      window.removeEventListener("pointerdown", now);
      window.removeEventListener("keydown", now);
      window.removeEventListener("avatar-gesture", now);
      window.clearTimeout(settle);
    };
  }, [invalidate]);
  useFrame(() => {
    if (gesturingRef.current || camera.position.distanceToSquared(FRAME.pos) > 1e-6) invalidate();
  });
  return null;
}

function CameraRig() {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.lerp(FRAME.pos, 0.1);
    camera.lookAt(FRAME.target);
  });
  return null;
}

const statusLabel: Record<ChatStatus, string> = {
  idle: "",
  connecting: "Connecting…",
  listening: "Listening, just speak",
  speaking: "Speaking…",
  error: "Connection error",
};

const INERT = { inert: "", "aria-hidden": true } as Record<string, string | boolean>;

const TOOL_PILL =
  "flex items-center gap-2 rounded-full border border-term-line bg-term-bg/70 px-3.5 py-1.5 text-xs text-term-paper backdrop-blur transition-colors hover:border-term-accent hover:text-term-accent disabled:opacity-50";

function PlayIcon() {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="fill-term-accent">
      <path d="M2 1.2v7.6L8.6 5z" />
    </svg>
  );
}

const TalkingAvatar = () => {
  const gestureRef = useRef<GestureTrigger>({ seq: 0, name: null });
  const gesturingRef = useRef(false);
  const { status, errorMessage, volumeRef, connect, disconnect } =
    useRealtimeChat(gestureRef);

  const active = status !== "idle" && status !== "error";
  // The chat status on <html data-voice>, for what reacts to the voice (the hero name, lib/voice.ts).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.voice = status;
    return () => {
      delete root.dataset.voice;
    };
  }, [status]);
  // ?capture=1 shows the avatar alone, for screenshotting the intro video's
  // last frame (same camera and background as the live hero).
  const [capture] = useState(
    () => new URLSearchParams(window.location.search).has("capture")
  );

  // Play / explore: the game mounts in this same canvas (design 3.1). The hero subtree renders
  // only outside the game; the page chrome stays mounted while it animates out and back.
  const sectionRef = useRef<HTMLElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [avatarReady, setAvatarReady] = useState(false);
  // Bumped by the manual retry, which remounts the retry boundary with a fresh set of attempts.
  const [avatarTry, setAvatarTry] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  // The compressed model where it can be decoded (lib/avatarSource.ts); a failed load of it retries
  // with the plain file, and so does everything after (the game, the next visit to the hero).
  const [avatarSrc, setAvatarSrc] = useState(avatarUrl);
  const clearAvatar = useCallback(() => {
    useGLTF.clear(avatarSrc);
    if (usesMeshopt(avatarSrc)) {
      markMeshoptBroken();
      setAvatarSrc(avatarUrl());
    }
  }, [avatarSrc]);
  const onAvatarGiveUp = useCallback((error: Error) => {
    console.error("avatar failed to load", error);
    setAvatarFailed(true);
  }, []);
  const retryAvatar = () => {
    setAvatarFailed(false);
    setAvatarTry((n) => n + 1);
  };

  const [webgl] = useState(isWebGLAvailable);
  const shellRef = useRef<{ heroReady(): void } | null>(null);
  const onAvatarReady = useCallback(() => {
    setAvatarReady(true);
    shellRef.current?.heroReady();
  }, []);
  const shell = useExperienceShell({
    stopVoice: disconnect,
    returnFocusRef: playRef,
    stageRef: sectionRef,
    canvasWrapRef,
  });
  shellRef.current = shell;
  const { phase, inGame, reduced } = shell;
  const busy = phase !== "hero";

  // The hero canvas is a full-screen WebGL scene that renders every frame. Once it is scrolled out of
  // view that work only competes with page scrolling (dropped frames, flickering images), so the render
  // loop stops until the hero comes back. Only in the plain hero phase: the transition and the game own
  // the loop themselves.
  const [heroInView, setHeroInView] = useState(true);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setHeroInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const offscreen = phase === "hero" && !heroInView;
  // IntroVideo keeps its own state and reports whether its cover is up (playing or fading). While it
  // is, the hero controls beneath it are inert, Play is ignored and the game prefetch waits.
  const [introActive, setIntroActive] = useState(false);
  // On <html data-intro-film> too: the memory particles (components/memory) stay off while the film
  // is up, so a scroll during it does not draw them over the video.
  useEffect(() => {
    if (!introActive) return;
    const root = document.documentElement;
    root.dataset.introFilm = "";
    return () => {
      delete root.dataset.introFilm;
    };
  }, [introActive]);
  // While the film fully covers the hero, the avatar beneath it does not need to render: once it has
  // loaded and drawn for a moment (shaders compiled), the loop sleeps until the hand-off starts. That
  // leaves the GPU and main thread to the video for the length of the film.
  const [introCovering, setIntroCovering] = useState(false);
  const [avatarWarm, setAvatarWarm] = useState(false);
  useEffect(() => {
    if (!avatarReady) return;
    const t = setTimeout(() => setAvatarWarm(true), 600);
    return () => clearTimeout(t);
  }, [avatarReady]);
  // On a first visit the avatar itself is held back until the film cues it (IntroVideo, AVATAR_LEAD_S),
  // and the empty canvas does not render until then either.
  const [avatarCued, setAvatarCued] = useState(() => !introWillPlay());
  const cueAvatar = useCallback(() => setAvatarCued(true), []);
  // The film and the gesture list stay behind two quiet buttons, so the hero itself shows only the
  // name, the avatar and the two main actions.
  const [film] = useState(introAvailable);
  const [filmRequest, setFilmRequest] = useState(0);
  const [movesOpen, setMovesOpen] = useState(false);
  useEffect(() => {
    if (!movesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMovesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [movesOpen]);
  const asleepUnderIntro = introCovering && (avatarWarm || !avatarCued);
  // On CPU-drawn WebGL (lib/gpu.ts) the resting hero draws only when something changes; the game,
  // a conversation and the transition still run every frame.
  // Until the visitor first moves over the hero, presses or types, a still image of the avatar stands
  // in for it, so the first 3D draw (seconds of CPU there) never lands during page load.
  const [softwareGL] = useState(() => !capture && isSoftwareGL());
  const onDemand = softwareGL && phase === "hero" && !active;
  const [awake, setAwake] = useState(!softwareGL);
  useEffect(() => {
    if (awake) return;
    const wake = () => setAwake(true);
    const section = sectionRef.current;
    section?.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("avatar-gesture", wake);
    return () => {
      section?.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("avatar-gesture", wake);
    };
  }, [awake]);
  // The still avatar from the first paint (AvatarPoster) until the live one has drawn, then a dissolve.
  const [posterState, setPosterState] = useState<"shown" | "fading" | "gone">(capture ? "gone" : "shown");
  useEffect(() => {
    if (!avatarReady) return;
    const t = window.setTimeout(() => setPosterState((s) => (s === "shown" ? "fading" : s)), 150);
    return () => window.clearTimeout(t);
  }, [avatarReady]);
  useEffect(() => {
    if (posterState !== "fading") return;
    const t = window.setTimeout(() => setPosterState("gone"), 650);
    return () => window.clearTimeout(t);
  }, [posterState]);
  const poster = phase === "hero" ? posterState : "gone";
  const leavingChrome = phase === "chrome-out";
  const GameScene = shell.game?.module.GameScene;
  const GameInterface = shell.game?.module.GameInterface;

  // Chrome exit and return: per-item opacity and translate transitions (play-transition.md 2.1, 4.3).
  const chrome = (id: ChromeItemId, childIndex = 0, extraTransition = ""): CSSProperties => {
    const item = CHROME[id];
    const hidden = shell.chromeHidden;
    const translate = chromeTranslate(item, hidden, reduced);
    return {
      opacity: hidden ? 0 : 1,
      ...(translate ? { translate } : {}),
      transition: chromeTransition(item, hidden, childIndex, reduced) + extraTransition,
    };
  };
  // Tailwind's transition-colors, kept for the buttons whose inline transition replaces it.
  const inert = leavingChrome || introActive ? INERT : {};

  // Loading progress never goes backwards.
  const progressRef = useRef(0);
  if (phase === "hero") progressRef.current = 0;
  const raw = shell.load.kind === "loading" ? shell.load.progress : shell.load.kind === "ready" ? 1 : 0;
  progressRef.current = Math.max(progressRef.current, raw);

  const wrapClass = shell.canvasFixed
    ? `fixed inset-0 ${shell.canvasRaised ? "z-50" : "z-10"}`
    : "absolute inset-0";
  const wrapStyle: CSSProperties = {
    transform: shell.flip.y !== 0 || shell.flip.animate ? `translateY(${shell.flip.y}px)` : undefined,
    // A permanent compositing layer: switching fixed <-> absolute must not re-create the canvas layer
    // (that shows one empty compositor frame, a flash of the bare stage).
    willChange: "transform",
    transition: shell.flip.animate ? `transform ${TIMING.flipMs}ms ${EASE.inOut}` : "none",
    ...(shell.canvasFixed ? { height: "100dvh" } : {}),
    ...(shell.backdrop ? { backgroundColor: HERO.fog.color } : {}),
  };

  const gesture = (g: (typeof GESTURES)[number]) => () =>
    (gestureRef.current = { seq: gestureRef.current.seq + 1, name: g });

  // Other parts of the page can ask for a move (the Konami code in components/site/EasterEgg.tsx).
  useEffect(() => {
    const on = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if ((GESTURES as readonly string[]).includes(name)) gestureRef.current = { seq: gestureRef.current.seq + 1, name };
    };
    window.addEventListener("avatar-gesture", on);
    return () => window.removeEventListener("avatar-gesture", on);
  }, []);

  return (
    <section
      ref={sectionRef}
      id="talk"
      aria-label="Interactive 3D AI avatar — talk to Maksym"
      className={
        capture
          ? "fixed inset-0 z-[100] bg-term-bg"
          : "relative h-screen w-full [overflow-x:clip]"
      }
    >
      {/* Canvas wrapper: absolute in the hero, fixed from the click (the section keeps its h-screen
          place, so nothing below it shifts). The scanlines travel with the canvas. */}
      <div ref={canvasWrapRef} data-stage-canvas className={wrapClass} style={wrapStyle}>
        {poster !== "gone" && <AvatarPoster fading={poster === "fading"} />}
        {/* Without WebGL the canvas cannot be created and would throw, blanking the whole page: skip it
            (the portfolio stays usable, without the 3D hero and without Play). */}
        {webgl && (
        <Canvas
          camera={{ position: [...HERO.cameraPosition], fov: HERO.fov }}
          frameloop={shell.renderPaused || offscreen || asleepUnderIntro ? "never" : onDemand ? "demand" : "always"}
          onCreated={shell.onCanvasCreated}
        >
          {!inGame && <>
          <ambientLight intensity={HERO.lights.ambient} />
          <hemisphereLight args={[0xffffff, 0x2a2520, HERO.lights.hemisphere]} />
          <directionalLight position={[...HERO.lights.key.position]} intensity={HERO.lights.key.intensity} />
          <directionalLight position={[...HERO.lights.fill.position]} intensity={HERO.lights.fill.intensity} />
          <fog attach="fog" args={[HERO.fog.color, HERO.fog.near, HERO.fog.far]} />
          {avatarCued && awake && <RetryBoundary
            key={avatarTry}
            clear={clearAvatar}
            retryDelaysMs={AVATAR_RETRY_MS}
            onGiveUp={onAvatarGiveUp}
          ><Suspense
            fallback={
              poster === "shown" ? null : (
                <Html center className="whitespace-nowrap text-sm text-term-accent">
                  loading avatar…
                </Html>
              )
            }
          >
            {/* Avaturn full-body: feet at origin, so lift view to the head. */}
            <Avatar
              url={avatarSrc}
              volumeRef={volumeRef}
              gestureRef={gestureRef}
              gesturingRef={gesturingRef}
              position={[0, HERO.feetY, 0]}
            />
            <ReadySignal onReady={onAvatarReady} />
          </Suspense></RetryBoundary>}
          <CameraRig />
          {onDemand && <DrawOnChange gesturingRef={gesturingRef} ready={avatarReady} />}
          </>}
          {GameScene && shell.game && (
            <GameScene
              key={shell.game.key}
              game={shell.game.handle}
              assets={shell.assets}
              active={inGame}
              avatarUrl={avatarSrc}
              layout={shell.layout}
              onPhysics={shell.reportPhysics}
              onExit={shell.exit}
              onFault={shell.reportFault}
              onExitLegDone={shell.exitLegDone}
              warmGate={shell.chromeDone}
            />
          )}
        </Canvas>
        )}
      </div>

      {/* Cinematic intro (first visit per tab, ?intro to replay): a z-30 cover over the hero chrome that
          hands off to the live avatar. While it is mounted it holds a <video>; Play is ignored then. */}
      <IntroVideo
        onActiveChange={setIntroActive}
        onCoveringChange={setIntroCovering}
        onAvatarCue={cueAvatar}
        requestKey={filmRequest}
      />

      {!capture && shell.chromeMounted && <>
      {/* Quiet toolbar: the film, the gesture list and, during a voice session, its status */}
      <div
        {...inert}
        data-xfade
        className="absolute left-5 top-20 z-20 flex max-w-[calc(100%-2.5rem)] flex-col items-start gap-3 md:left-10"
        style={chrome("status")}
      >
        <div className="flex flex-wrap items-center gap-2">
          {film && (
            <button
              type="button"
              onClick={() => {
                setMovesOpen(false);
                setFilmRequest((n) => n + 1);
              }}
              className={TOOL_PILL}
            >
              <PlayIcon />
              Watch the film
            </button>
          )}
          {webgl && (
            <button
              type="button"
              aria-expanded={movesOpen}
              aria-controls="avatar-moves"
              disabled={!avatarReady}
              onClick={() => setMovesOpen((o) => !o)}
              className={`${TOOL_PILL} ${movesOpen ? "border-term-accent text-term-accent" : ""}`}
            >
              <span aria-hidden className={`text-term-accent transition-transform duration-300 ${movesOpen ? "rotate-45" : ""}`}>✦</span>
              Make me move
            </button>
          )}
          {status !== "idle" && (
            <span role="status" className="flex items-center gap-2 rounded-full border border-term-line bg-term-bg/70 px-3 py-1.5 text-xs text-term-fg backdrop-blur">
              <span
                className={`h-2 w-2 rounded-full ${
                  status === "speaking"
                    ? "bg-term-accent animate-pulse"
                    : status === "listening"
                    ? "bg-term-sand animate-pulse"
                    : status === "connecting"
                    ? "bg-term-amber animate-pulse"
                    : "bg-term-red"
                }`}
              />
              {statusLabel[status]}
            </span>
          )}
        </div>
        {movesOpen && (
          <ul id="avatar-moves" aria-label="Avatar moves" className="flex max-w-[19rem] flex-wrap gap-2">
            {GESTURES.map((g, i) => (
              <li key={g} className="animate-chip-in" style={{ animationDelay: `${i * 25}ms` }}>
                <button
                  type="button"
                  onClick={gesture(g)}
                  className="rounded-full border border-term-line bg-term-bg/70 px-3 py-1.5 text-xs text-term-muted backdrop-blur transition-colors hover:border-term-accent hover:text-term-accent active:border-term-accent active:text-term-accent"
                >
                  {g.replace("_", " ")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Example prompts (top-right, typewriter), only while a voice session can hear them. */}
      {active && (
        <div {...inert} data-xfade className="pointer-events-none absolute inset-0 z-20" style={chrome("hints")}>
          <AskHints />
        </div>
      )}

      {errorMessage && (
        <p
          {...inert}
          data-xfade
          className="absolute left-0 right-0 top-32 z-20 text-center text-sm text-term-red"
          style={chrome("status")}
        >
          ! {errorMessage}
        </p>
      )}

      {avatarFailed && webgl && (
        <div {...inert} className="absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-5">
          <button
            type="button"
            onClick={retryAvatar}
            className="rounded-full border border-term-paper/30 bg-term-bg/60 px-5 py-2.5 text-sm text-term-paper backdrop-blur transition-colors hover:border-term-accent hover:text-term-accent"
          >
            The 3D avatar did not load. Try again ↻
          </button>
        </div>
      )}

      {/* Talk and Play buttons (the name and role are the server-rendered HeroTitle behind the canvas) */}
      <div
        data-xfade
        className="absolute bottom-24 left-0 right-0 z-20 flex flex-col items-center gap-5 text-center md:bottom-10"
        style={chrome("title")}
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          <button
            {...inert}
            onClick={busy ? undefined : active ? disconnect : connect}
            disabled={status === "connecting"}
            aria-disabled={busy || undefined}
            className="group flex items-center gap-3 rounded-full bg-term-accent px-7 py-3.5 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright disabled:opacity-50"
          >
            <span aria-hidden className={`h-2 w-2 rounded-full bg-term-bg ${active ? "animate-pulse" : ""}`} />
            {active ? "end session" : "talk to me"}
          </button>
          {webgl && (
          <button
            {...(introActive ? INERT : {})}
            ref={playRef}
            onClick={() => {
              if (!introActive) shell.play();
            }}
            onPointerEnter={() => {
              if (!introActive) shell.prefetch("hover");
            }}
            onFocus={() => {
              if (!introActive) shell.prefetch("focus");
            }}
            onPointerDown={() => {
              if (!introActive) shell.prefetch("press");
            }}
            disabled={!avatarReady || status === "connecting"}
            aria-disabled={busy || undefined}
            className={`rounded-full border border-term-paper/30 bg-term-bg/40 px-7 py-3.5 text-sm text-term-paper backdrop-blur transition-colors hover:border-term-paper hover:bg-term-paper hover:text-term-bg disabled:opacity-50 ${
              leavingChrome ? "animate-play-press" : ""
            } ${busy ? "pointer-events-none" : ""}`}
          >
            {busy && phase !== "returning" ? "starting…" : "play / explore ↗"}
          </button>
          )}
        </div>
      </div>

      </>}

      {shell.strip !== "off" && (
        <LoadingStrip
          progress={progressRef.current}
          visible={shell.strip === "in"}
          reduced={reduced}
          onCancel={shell.cancel}
        />
      )}
      {shell.failure && (
        <FailureDialog
          title={shell.failure.title}
          message={shell.failure.message}
          onRetry={shell.retry}
          onBack={shell.back}
        />
      )}
      {inGame && GameInterface && shell.game && <GameInterface game={shell.game.handle} onExit={shell.exit} />}
      <div role="status" aria-live="polite" className="sr-only">
        {shell.announce}
      </div>
    </section>
  );
};

export default TalkingAvatar;

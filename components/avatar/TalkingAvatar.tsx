"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Avatar, type GestureTrigger } from "./Avatar";
import { AskHints } from "./AskHints";
import { IntroVideo } from "./IntroVideo";
import { useRealtimeChat, type ChatStatus } from "./useRealtimeChat";
import { GESTURES } from "@/lib/gestures";
import { LoadingStrip, FailureDialog } from "@/components/game/shell/LoadingOverlay";
import { ReadySignal } from "@/components/game/shell/ReadySignal";
import { CHROME, chromeTransition, chromeTranslate, EASE, HERO, TIMING, type ChromeItemId } from "@/components/game/shell/transition";
import { isWebGLAvailable, useExperienceShell } from "@/components/game/shell/useExperienceShell";

// Your local Avaturn model in /public. Override via NEXT_PUBLIC_AVATAR_URL.
const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || "/avatar.glb";

// Single fixed framing: pulled back a bit so head + torso/arms are visible,
// and it never moves (gestures play within this frame). Avatar group sits at
// y=HERO.feetY, so the head is at world y≈0.1, feet at y≈-1.5. The numbers live in
// shell/transition.ts because the Play transition hands this exact pose to the game camera.
const FRAME = {
  pos: new THREE.Vector3(...HERO.cameraPosition),
  target: new THREE.Vector3(...HERO.cameraTarget),
};

function CameraRig() {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.lerp(FRAME.pos, 0.1);
    camera.lookAt(FRAME.target);
  });
  return null;
}

const statusLabel: Record<ChatStatus, string> = {
  idle: "Voice chat is off",
  connecting: "Connecting…",
  listening: "Listening, just speak",
  speaking: "Speaking…",
  error: "Connection error",
};

const INERT = { inert: "", "aria-hidden": true } as Record<string, string | boolean>;

const TalkingAvatar = () => {
  const gestureRef = useRef<GestureTrigger>({ seq: 0, name: null });
  const gesturingRef = useRef(false);
  const { status, errorMessage, volumeRef, connect, disconnect } =
    useRealtimeChat(gestureRef);

  const active = status !== "idle" && status !== "error";
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
  const asleepUnderIntro = introCovering && avatarWarm;
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
  const COLORS = ", color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)";
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
        {/* Without WebGL the canvas cannot be created and would throw, blanking the whole page: skip it
            (the portfolio stays usable, without the 3D hero and without Play). */}
        {webgl && (
        <Canvas
          camera={{ position: [...HERO.cameraPosition], fov: HERO.fov }}
          frameloop={shell.renderPaused || offscreen || asleepUnderIntro ? "never" : "always"}
          onCreated={shell.onCanvasCreated}
        >
          {!inGame && <>
          <ambientLight intensity={HERO.lights.ambient} />
          <hemisphereLight args={[0xffffff, 0x2a2520, HERO.lights.hemisphere]} />
          <directionalLight position={[...HERO.lights.key.position]} intensity={HERO.lights.key.intensity} />
          <directionalLight position={[...HERO.lights.fill.position]} intensity={HERO.lights.fill.intensity} />
          <fog attach="fog" args={[HERO.fog.color, HERO.fog.near, HERO.fog.far]} />
          <Suspense
            fallback={
              <Html center className="whitespace-nowrap text-sm text-term-accent">
                loading avatar…
              </Html>
            }
          >
            {/* Avaturn full-body: feet at origin, so lift view to the head. */}
            <Avatar
              url={AVATAR_URL}
              volumeRef={volumeRef}
              gestureRef={gestureRef}
              gesturingRef={gesturingRef}
              position={[0, HERO.feetY, 0]}
            />
            <ReadySignal onReady={onAvatarReady} />
          </Suspense>
          <CameraRig />
          </>}
          {GameScene && shell.game && (
            <GameScene
              key={shell.game.key}
              game={shell.game.handle}
              assets={shell.assets}
              active={inGame}
              avatarUrl={AVATAR_URL}
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
      <IntroVideo onActiveChange={setIntroActive} onCoveringChange={setIntroCovering} />

      {!capture && shell.chromeMounted && <>
      {/* Status line */}
      <div
        {...inert}
        data-xfade
        className="absolute left-5 top-20 z-20 flex items-center gap-2 rounded-full border border-term-line bg-term-bg/70 px-3 py-1.5 text-xs backdrop-blur md:left-10"
        style={chrome("status")}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            status === "speaking"
              ? "bg-term-accent animate-pulse"
              : status === "listening"
              ? "bg-term-sand animate-pulse"
              : status === "connecting"
              ? "bg-term-amber animate-pulse"
              : status === "error"
              ? "bg-term-red"
              : "bg-term-muted"
          }`}
        />
        <span className="text-term-fg">{statusLabel[status]}</span>
      </div>

      {/* Example prompts (top-right, typewriter). The wrapper fills the section so the untouched
          absolute-positioned component keeps its place while the wrapper animates. */}
      <div {...inert} data-xfade className="pointer-events-none absolute inset-0 z-20" style={chrome("hints")}>
        <AskHints />
      </div>

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

      {/* Gesture command list — vertical on desktop, compact chip row on mobile
          (so it doesn't cover the avatar on small screens) */}
      <div
        {...inert}
        className="absolute left-10 top-[58%] z-20 hidden -translate-y-1/2 flex-col gap-1.5 md:flex"
      >
        <span
          data-xfade
          className="mb-1 text-[10px] uppercase tracking-widest text-term-muted"
          style={chrome("gestures", 0)}
        >
          Try a gesture
        </span>
        {GESTURES.map((g, i) => (
          <button
            key={g}
            data-xfade
            onClick={gesture(g)}
            className="text-left text-xs text-term-muted hover:text-term-accent"
            style={chrome("gestures", i + 1, COLORS)}
          >
            {g.replace("_", " ")}
          </button>
        ))}
      </div>
      <div
        {...inert}
        className="absolute bottom-6 left-0 right-0 z-20 flex gap-2 overflow-x-auto px-5 pb-1 md:hidden [scrollbar-width:none]"
      >
        {GESTURES.map((g, i) => (
          <button
            key={g}
            data-xfade
            onClick={gesture(g)}
            className="shrink-0 rounded-full border border-term-line bg-term-bg/70 px-3 py-1 text-xs text-term-muted backdrop-blur active:border-term-accent active:text-term-accent"
            style={chrome("chips", i, COLORS)}
          >
            {g.replace("_", " ")}
          </button>
        ))}
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

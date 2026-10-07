"use client";

import { Suspense, useCallback, useRef, useState, type CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Avatar, type GestureTrigger } from "./Avatar";
import { AskHints } from "./AskHints";
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
  idle: "idle — press to connect",
  connecting: "connecting…",
  listening: "listening — just speak",
  speaking: "speaking…",
  error: "connection error",
};

const INERT = { inert: "", "aria-hidden": true } as Record<string, string | boolean>;

const TalkingAvatar = () => {
  const gestureRef = useRef<GestureTrigger>({ seq: 0, name: null });
  const gesturingRef = useRef(false);
  const { status, errorMessage, volumeRef, connect, disconnect } =
    useRealtimeChat(gestureRef);

  const active = status !== "idle" && status !== "error";

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
  const inert = leavingChrome ? INERT : {};

  // Loading progress never goes backwards.
  const progressRef = useRef(0);
  if (phase === "hero") progressRef.current = 0;
  const raw = shell.load.kind === "loading" ? shell.load.progress : shell.load.kind === "ready" ? 1 : 0;
  progressRef.current = Math.max(progressRef.current, raw);

  const scanOpacity = phase === "entering" || phase === "game" ? 0 : 0.6;
  const scanTransition =
    phase === "entering" || phase === "game"
      ? `opacity ${reduced ? TIMING.reduced.fadeMs : TIMING.entry.envMs}ms ${EASE.out}`
      : phase === "leaving"
      ? reduced
        ? `opacity ${TIMING.reduced.fadeMs}ms ${EASE.in}`
        : `opacity ${TIMING.exit.envEndMs - TIMING.exit.envStartMs}ms ${EASE.in} ${TIMING.exit.envStartMs}ms`
      : "none";

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
      className="relative h-screen w-full [overflow-x:clip]"
    >
      {/* Canvas wrapper: absolute in the hero, fixed from the click (the section keeps its h-screen
          place, so nothing below it shifts). The scanlines travel with the canvas. */}
      <div ref={canvasWrapRef} data-stage-canvas className={wrapClass} style={wrapStyle}>
        <Canvas
          camera={{ position: [...HERO.cameraPosition], fov: HERO.fov }}
          frameloop={shell.renderPaused ? "never" : "always"}
          onCreated={shell.onCanvasCreated}
        >
          {!inGame && <>
          <ambientLight intensity={HERO.lights.ambient} />
          <hemisphereLight args={[0xffffff, 0x1a2a1f, HERO.lights.hemisphere]} />
          <directionalLight position={[...HERO.lights.key.position]} intensity={HERO.lights.key.intensity} />
          <directionalLight position={[...HERO.lights.fill.position]} intensity={HERO.lights.fill.intensity} />
          <fog attach="fog" args={[HERO.fog.color, HERO.fog.near, HERO.fog.far]} />
          <Suspense
            fallback={
              <Html center className="whitespace-nowrap text-sm text-term-green">
                booting avatar<span className="animate-blink">_</span>
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
        {/* scanline overlay: stays over the canvas until the world takes over, then fades */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            opacity: scanOpacity,
            transition: scanTransition,
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 3px, rgba(0,0,0,0) 4px)",
          }}
        />
      </div>

      {shell.chromeMounted && <>
      {/* Status line */}
      <div
        {...inert}
        data-xfade
        className="absolute left-5 top-20 z-20 flex items-center gap-2 border border-term-line bg-term-bg/70 px-3 py-1.5 text-xs backdrop-blur"
        style={chrome("status")}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            status === "speaking"
              ? "bg-term-green animate-pulse"
              : status === "listening"
              ? "bg-term-cyan animate-pulse"
              : status === "connecting"
              ? "bg-term-amber animate-pulse"
              : status === "error"
              ? "bg-term-red"
              : "bg-term-muted"
          }`}
        />
        <span className="text-term-muted">status:</span>
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

      {/* Title + talk button */}
      <div
        data-xfade
        className="absolute bottom-10 left-0 right-0 z-20 flex flex-col items-center gap-5 text-center"
        style={chrome("title")}
      >
        <h1
          {...inert}
          className="pointer-events-none text-2xl font-bold text-term-green-bright text-glow md:text-4xl"
        >
          maksym.liutsko
          <span className="ml-1 inline-block h-6 w-2.5 translate-y-1 bg-term-green animate-blink" />
        </h1>
        <p {...inert} className="pointer-events-none -mt-3 px-6 text-xs text-term-muted md:text-sm">
          AI Automation Engineer &amp; Product Builder · Co-founder &amp; CTO @
          XecSuite
        </p>
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          <button
            {...inert}
            onClick={busy ? undefined : active ? disconnect : connect}
            disabled={status === "connecting"}
            aria-disabled={busy || undefined}
            className="border border-term-green bg-term-green/10 px-8 py-3 text-sm text-term-green-bright transition-colors hover:bg-term-green hover:text-term-bg disabled:opacity-50 box-glow"
          >
            {active ? "[ end session ]" : "[ talk to me ]"}
          </button>
          <button
            ref={playRef}
            onClick={shell.play}
            onPointerEnter={() => shell.prefetch("hover")}
            onFocus={() => shell.prefetch("focus")}
            onPointerDown={() => shell.prefetch("press")}
            disabled={!avatarReady || status === "connecting" || !webgl}
            aria-disabled={busy || undefined}
            className={`border border-term-cyan bg-term-cyan/10 px-8 py-3 text-sm text-term-cyan transition-colors hover:bg-term-cyan hover:text-term-bg disabled:opacity-50 ${
              leavingChrome ? "animate-play-press" : ""
            } ${busy ? "pointer-events-none" : ""}`}
          >
            {busy && phase !== "returning" ? "[ starting… ]" : "[ play / explore ]"}
          </button>
        </div>
      </div>

      {/* Gesture command list — vertical on desktop, compact chip row on mobile
          (so it doesn't cover the avatar on small screens) */}
      <div
        {...inert}
        className="absolute left-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-1.5 md:flex"
      >
        <span
          data-xfade
          className="mb-1 text-[10px] uppercase tracking-widest text-term-muted"
          style={chrome("gestures", 0)}
        >
          gestures
        </span>
        {GESTURES.map((g, i) => (
          <button
            key={g}
            data-xfade
            onClick={gesture(g)}
            className="text-left text-xs text-term-muted hover:text-term-green"
            style={chrome("gestures", i + 1, COLORS)}
          >
            <span className="text-term-green">&gt;</span> {g.replace("_", " ")}
          </button>
        ))}
      </div>
      <div
        {...inert}
        className="absolute bottom-44 left-0 right-0 z-20 flex gap-2 overflow-x-auto px-5 pb-1 md:hidden [scrollbar-width:none]"
      >
        {GESTURES.map((g, i) => (
          <button
            key={g}
            data-xfade
            onClick={gesture(g)}
            className="shrink-0 border border-term-line bg-term-bg/70 px-2.5 py-1 text-xs text-term-muted backdrop-blur active:border-term-green active:text-term-green"
            style={chrome("chips", i, COLORS)}
          >
            &gt; {g.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Scroll hint */}
      <div
        {...inert}
        data-xfade
        className="absolute bottom-3 left-0 right-0 z-20 text-center text-xs text-term-muted"
        style={chrome("status")}
      >
        ↓ scroll
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

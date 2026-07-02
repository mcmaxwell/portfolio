"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { Avatar, type GestureTrigger } from "./Avatar";
import { AskHints } from "./AskHints";
import { useRealtimeChat, type ChatStatus } from "./useRealtimeChat";
import { GESTURES } from "@/lib/gestures";

// Your local Avaturn model in /public. Override via NEXT_PUBLIC_AVATAR_URL.
const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || "/avatar.glb";

// Single fixed framing: pulled back a bit so head + torso/arms are visible,
// and it never moves (gestures play within this frame). Avatar group sits at
// y=-1.5, so the head is at world y≈0.1, feet at y≈-1.5.
const FRAME = {
  // pulled back so the whole avatar sits higher with margin above the head and
  // clear space below the feet (so the bottom title doesn't cover the legs)
  pos: new THREE.Vector3(0, -0.3, 4.9),
  target: new THREE.Vector3(0, -0.7, 0),
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

const TalkingAvatar = () => {
  const gestureRef = useRef<GestureTrigger>({ seq: 0, name: null });
  const gesturingRef = useRef(false);
  const { status, errorMessage, volumeRef, connect, disconnect } =
    useRealtimeChat(gestureRef);

  const active = status !== "idle" && status !== "error";

  return (
    <section
      id="talk"
      className="relative h-screen w-full"
    >
      <Canvas
        camera={{ position: [0, -0.3, 4.9], fov: 32 }}
        className="!absolute inset-0"
        style={{ touchAction: "pan-y" }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} />
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
            position={[0, -1.5, 0]}
          />
          <Environment preset="city" />
        </Suspense>
        <CameraRig />
      </Canvas>

      {/* scanline overlay (scoped to the hero) */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 3px, rgba(0,0,0,0) 4px)",
        }}
      />

      {/* Status line */}
      <div className="absolute left-5 top-20 z-20 flex items-center gap-2 border border-term-line bg-term-bg/70 px-3 py-1.5 text-xs backdrop-blur">
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

      {/* Example prompts (top-right, typewriter) */}
      <AskHints />

      {errorMessage && (
        <p className="absolute left-0 right-0 top-32 z-20 text-center text-sm text-term-red">
          ! {errorMessage}
        </p>
      )}

      {/* Title + talk button */}
      <div className="absolute bottom-10 left-0 right-0 z-20 flex flex-col items-center gap-5 text-center">
        <h1 className="pointer-events-none text-2xl font-bold text-term-green-bright text-glow md:text-4xl">
          maksym.liutsko
          <span className="ml-1 inline-block h-6 w-2.5 translate-y-1 bg-term-green animate-blink" />
        </h1>
        <button
          onClick={active ? disconnect : connect}
          disabled={status === "connecting"}
          className="pointer-events-auto border border-term-green bg-term-green/10 px-8 py-3 text-sm text-term-green-bright transition-colors hover:bg-term-green hover:text-term-bg disabled:opacity-50 box-glow"
        >
          {active ? "[ end session ]" : "[ talk to me ]"}
        </button>
      </div>

      {/* Gesture command list */}
      <div className="absolute left-5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5">
        <span className="mb-1 text-[10px] uppercase tracking-widest text-term-muted">
          gestures
        </span>
        {GESTURES.map((g) => (
          <button
            key={g}
            onClick={() =>
              (gestureRef.current = {
                seq: gestureRef.current.seq + 1,
                name: g,
              })
            }
            className="text-left text-xs text-term-muted transition-colors hover:text-term-green"
          >
            <span className="text-term-green">&gt;</span> {g.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-3 left-0 right-0 z-20 text-center text-xs text-term-muted">
        ↓ scroll
      </div>
    </section>
  );
};

export default TalkingAvatar;

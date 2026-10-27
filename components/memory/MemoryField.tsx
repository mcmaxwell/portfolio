"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { HERO } from "@/components/game/shell/transition";
import { AVATAR_CLOUD, bodyShape, decodeFrames, heroShape, projectFrame, type AvatarFrames } from "./avatarCloud";
import { Choreographer, type AnchorKind } from "./choreography";
import { Morph } from "./morph";
import { fibonacciCore, textShape, type Shape } from "./shapes";

/**
 * The memory layer: one fixed canvas of particles over the page. They light up on the avatar as the
 * hero scrolls away and take it apart, gather into a memory core beside the About statement, spell
 * each project's name over its screenshot as the card arrives, drift as dust in between, and at
 * Contact come back together as the avatar, which waves. One draw call of ~16k points; the shapes
 * are morphed on the GPU and the choreography (components/memory/choreography.ts) only reads a few
 * rects a frame. Not mounted with reduced motion, and it draws nothing while the hero is at rest
 * (the points wait there, formed on the avatar), so the hero's own canvas is the only one drawing.
 */

const vertexShader = /* glsl */ `
attribute vec3 aB;
attribute vec4 aR;
uniform vec4 uPlaceA, uPlaceB;
uniform float uRotA, uRotB, uMix, uBulge, uScatter, uTime, uDpr, uSize, uLayer;
uniform vec2 uView, uPointer;
varying float vAlpha;
varying float vTint;
const float PI = 3.14159265;
const float TAU = 6.2831853;

// Shape-local units to the screen: turn about the vertical axis, scale, move.
vec3 place(vec3 l, vec4 p, float rot) {
  float c = cos(rot), s = sin(rot);
  vec3 r = vec3(l.x * c + l.z * s, l.y, -l.x * s + l.z * c);
  return vec3(p.xy + r.xy * p.z, r.z * p.z);
}

void main() {
  vec3 pA = place(position, uPlaceA, uRotA);
  vec3 pB = place(aB, uPlaceB, uRotB);
  float m = smoothstep(0.0, 1.0, uMix);
  vec3 p = mix(pA, pB, m);
  // Between two shapes the cloud swells sideways instead of sliding as a block.
  vec3 dir = normalize(aR.xyz * 2.0 - 1.0);
  p += dir * sin(m * PI) * uBulge * (40.0 + 160.0 * aR.w);
  // Dust: a slow fall across the whole viewport.
  float fall = fract(aR.y + uTime * 0.012 * (0.4 + aR.z));
  vec3 dust = vec3(aR.x * uView.x + sin(uTime * 0.3 + aR.w * TAU) * 30.0, fall * uView.y, (aR.z - 0.5) * 200.0);
  p = mix(p, dust, uScatter);
  // Breathing, a little more when loose.
  p.xy += vec2(sin(uTime * (0.6 + aR.z) + aR.w * TAU), cos(uTime * (0.5 + aR.w) + aR.x * TAU)) * (0.8 + 2.5 * uScatter);
  // Depth parallax towards the pointer.
  p.xy += (uPointer - 0.5 * uView) * p.z * 0.00012;

  float formed = mix(uPlaceA.w, uPlaceB.w, m);
  vAlpha = mix(formed, 0.28 * step(0.55, aR.w), uScatter) * uLayer;
  vTint = aR.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.xy, 0.0, 1.0);
  float depth = clamp(1.0 + p.z * 0.0015, 0.6, 1.5);
  gl_PointSize = uSize * uDpr * depth * mix(1.0, 0.75, uScatter) * (0.7 + 0.6 * aR.z);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uPaper, uAccent;
varying float vAlpha;
varying float vTint;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float a = smoothstep(0.25, 0.06, r2) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uPaper, uAccent, step(0.92, vTint)), a);
}
`;

const CAMERA = { position: HERO.cameraPosition, target: HERO.cameraTarget, fov: HERO.fov, feetY: HERO.feetY };

type AnchorEl = { kind: AnchorKind; id: string; el: Element };

function start(renderer: THREE.WebGLRenderer) {
  const n = window.innerWidth < 768 ? 9000 : AVATAR_CLOUD.n;
  const morph = new Morph(n);
  const choreo = new Choreographer();

  const geometry = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(morph.a.pts, 3).setUsage(THREE.DynamicDrawUsage);
  const posB = new THREE.BufferAttribute(morph.b.pts, 3).setUsage(THREE.DynamicDrawUsage);
  const rand = new Float32Array(n * 4);
  for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
  geometry.setAttribute("position", posA);
  geometry.setAttribute("aB", posB);
  geometry.setAttribute("aR", new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uPlaceA: { value: new THREE.Vector4() },
    uPlaceB: { value: new THREE.Vector4() },
    uRotA: { value: 0 },
    uRotB: { value: 0 },
    uMix: { value: 0 },
    uBulge: { value: 1 },
    uScatter: { value: 1 },
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uSize: { value: n < AVATAR_CLOUD.n ? 2 : 2.4 },
    uLayer: { value: 0 },
    uView: { value: new THREE.Vector2(1, 1) },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uPaper: { value: new THREE.Color("#f1ece3") },
    uAccent: { value: new THREE.Color("#ff5b26") },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);

  const shapes = new Map<string, Shape>([["core", fibonacciCore(n)]]);
  let frames: AvatarFrames | null = null;
  let vw = 1;
  let vh = 1;
  let pointerSet = false;

  // The avatar poses depend on the viewport's aspect (the hero camera's), so they are rebuilt on resize.
  const buildAvatar = () => {
    if (!frames) return;
    shapes.set("hero", heroShape(projectFrame(frames.idle, vw / vh, CAMERA), n));
    for (const f of AVATAR_CLOUD.frames) shapes.set(`wave:${f}`, bodyShape(projectFrame(frames[f], 1, CAMERA), n, `wave:${f}`));
  };
  const resize = () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(vw, vh, false);
    camera.right = vw;
    camera.bottom = vh;
    camera.updateProjectionMatrix();
    uniforms.uView.value.set(vw, vh);
    uniforms.uDpr.value = renderer.getPixelRatio();
    if (!pointerSet) uniforms.uPointer.value.set(vw / 2, vh / 2);
    buildAvatar();
  };
  resize();

  // The data arrives off the critical path: the baked poses, then the project names once the
  // display face is ready to draw with.
  let disposed = false;
  const aborter = new AbortController();
  fetch(AVATAR_CLOUD.url, { signal: aborter.signal })
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((buf) => {
      frames = decodeFrames(new Uint8Array(buf), AVATAR_CLOUD);
      buildAvatar();
    })
    .catch(() => {});
  const buildWords = () => {
    if (disposed) return;
    const family = getComputedStyle(document.body).fontFamily;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-memory="word"]'))) {
      const id = el.dataset.memoryId;
      const word = el.dataset.memoryWord;
      if (!id || !word) continue;
      const shape = textShape(n, word, family, `word:${id}`);
      if (shape) shapes.set(shape.id, shape);
    }
  };
  (document.fonts?.ready ?? Promise.resolve()).then(buildWords, buildWords);

  let anchors: AnchorEl[] = [];
  let hero: Element | null = null;
  let lastCollect = -Infinity;
  const collect = () => {
    hero = document.querySelector("[data-stage-canvas]");
    anchors = Array.from(document.querySelectorAll<HTMLElement>("[data-memory]")).map((el) => ({
      kind: el.dataset.memory as AnchorKind,
      id: el.dataset.memoryId ?? el.dataset.memory!,
      el,
    }));
  };

  const root = document.documentElement;
  // Hidden tab, or the 3D world owns the page (the canvas is display:none then too).
  const paused = () => document.hidden || (root.dataset.experience !== undefined && root.dataset.experience !== "hero");
  const onPointer = (e: PointerEvent) => {
    pointerSet = true;
    uniforms.uPointer.value.set(e.clientX, e.clientY);
  };

  let raf = 0;
  let last = performance.now() / 1000;
  let cleared = true;
  let lastDissolve = -1;
  const veils = new Map<string, number>();
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (paused()) return;
    const t = now / 1000;
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    // The hero canvas mounts late (client-only); look again until it is there.
    if ((!hero || !anchors.length) && t - lastCollect > 1) {
      collect();
      lastCollect = t;
    }
    const cue = choreo.cue({
      vw,
      vh,
      scrollY: window.scrollY,
      t,
      hero: hero?.getBoundingClientRect() ?? null,
      anchors: anchors.map((a) => ({ kind: a.kind, id: a.id, rect: a.el.getBoundingClientRect() })),
    });
    // Dim the screenshot under a project's name while the particles spell it, so the word reads on
    // a light page; it lights back up as they let go.
    const veilId = cue.want?.id.startsWith("word:") ? cue.want.id.slice(5) : null;
    const veil = veilId ? Math.round(cue.want!.weight * (1 - morph.scatter) * 100) / 100 : 0;
    for (const a of anchors) {
      if (a.kind !== "word") continue;
      const v = a.id === veilId ? veil : 0;
      if (veils.get(a.id) === v) continue;
      veils.set(a.id, v);
      (a.el as HTMLElement).style.setProperty("--memory-veil", String(v));
    }
    if (Math.abs(cue.dissolve - lastDissolve) > 0.004) {
      lastDissolve = cue.dissolve;
      root.style.setProperty("--memory-dissolve", cue.dissolve.toFixed(3));
    }
    const shape = cue.want ? shapes.get(cue.want.id) : undefined;
    const target =
      cue.want && shape
        ? {
            id: shape.id,
            family: shape.family,
            pts: shape.pts,
            place: {
              cx: cue.want.cx,
              cy: cue.want.cy,
              scale: Math.min(cue.want.fitW / shape.aspect, cue.want.fitH),
              alpha: cue.want.alpha,
              rot: cue.want.rot,
            },
          }
        : null;
    morph.update(dt, target, target ? cue.scatter : 1);

    if (cue.layer <= 0.001) {
      if (!cleared) {
        renderer.clear();
        cleared = true;
      }
      return;
    }
    cleared = false;
    if (morph.a.dirty) {
      posA.needsUpdate = true;
      morph.a.dirty = false;
    }
    if (morph.b.dirty) {
      posB.needsUpdate = true;
      morph.b.dirty = false;
    }
    const pa = morph.a.place;
    const pb = morph.b.place;
    uniforms.uPlaceA.value.set(pa.cx, pa.cy, pa.scale, pa.alpha);
    uniforms.uPlaceB.value.set(pb.cx, pb.cy, pb.scale, pb.alpha);
    uniforms.uRotA.value = pa.rot;
    uniforms.uRotB.value = pb.rot;
    uniforms.uMix.value = morph.mix;
    uniforms.uBulge.value = morph.bulge;
    uniforms.uScatter.value = morph.scatter;
    uniforms.uTime.value = t;
    uniforms.uLayer.value = cue.layer;
    renderer.render(scene, camera);
  };

  collect();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointer, { passive: true });
  raf = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    aborter.abort();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    root.style.removeProperty("--memory-dissolve");
    for (const a of anchors) (a.el as HTMLElement).style.removeProperty("--memory-veil");
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}

export default function MemoryField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    } catch {
      return;
    }
    return start(renderer);
  }, []);
  return <canvas ref={ref} aria-hidden className="memory-field pointer-events-none fixed inset-0 z-40 h-[100dvh] w-full" />;
}

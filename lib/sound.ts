/**
 * Interface sound: a soft tick when the pointer reaches a link or button and a two-note blip on
 * click, synthesised with Web Audio (no files). Off until the visitor turns it on, remembered per
 * browser, and the audio context is only created by that click, so browsers never block it.
 */
const KEY = "ui-sound";
const EVENT = "ui-sound";

let ctx: AudioContext | null = null;
let on = false;
let lastTick = 0;
let wired = false;

export function soundEnabled() {
  return on;
}

export function restoreSound() {
  try {
    on = window.localStorage.getItem(KEY) === "on";
  } catch {
    on = false;
  }
  return on;
}

export function setSound(next: boolean) {
  on = next;
  try {
    window.localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    // Private mode: lasts for this page.
  }
  if (next) {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume();
    blip();
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: next }));
}

export function onSoundChange(cb: (on: boolean) => void) {
  const h = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

function tone(freq: number, at: number, dur: number, gain: number) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function tick() {
  const now = performance.now();
  if (!on || !ctx || now - lastTick < 70) return;
  lastTick = now;
  tone(1850, 0, 0.035, 0.025);
}

export function blip() {
  if (!on || !ctx) return;
  tone(660, 0, 0.09, 0.05);
  tone(990, 0.055, 0.12, 0.04);
}

/** One set of page-wide listeners: tick on reaching a link or button, blip on pressing one. */
export function wireSound() {
  if (wired) return;
  wired = true;
  const target = (e: Event) => (e.target as Element | null)?.closest?.("a, button, [role='button']") ?? null;
  document.addEventListener(
    "pointerover",
    (e) => {
      const el = target(e);
      if (el && !el.contains((e as PointerEvent).relatedTarget as Node | null)) tick();
    },
    { passive: true }
  );
  document.addEventListener("click", (e) => {
    if (target(e)) blip();
  });
}

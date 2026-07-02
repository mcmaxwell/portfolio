"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Executes a voice command on the page. Add more actions here as you add tools.
function runSiteAction(
  name: string,
  args: Record<string, unknown>
): { ok: boolean; detail?: string } {
  if (name === "navigate_to_section") {
    const section = String(args.section || "");
    if (section === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return { ok: true, detail: "scrolled to top" };
    }
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return { ok: true, detail: `scrolled to ${section}` };
    }
    return { ok: false, detail: `section "${section}" not found` };
  }
  return { ok: false, detail: `unknown action "${name}"` };
}

export type ChatStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "error";

/**
 * Manages the full real-time voice loop with the OpenAI Realtime API over
 * WebRTC: mic in, model audio out, and a live "volume" value (0..1) tapped
 * from the model's voice so the avatar can lip-sync to it.
 *
 * `volumeRef.current` is updated continuously and read by the Avatar each
 * frame — we use a ref (not state) to avoid re-rendering 60x/second.
 */
export function useRealtimeChat(
  gestureRef?: React.MutableRefObject<{ seq: number; name: string | null }>
) {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const volumeRef = useRef(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    dcRef.current?.close();
    dcRef.current = null;

    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;

    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
    volumeRef.current = 0;
  }, []);

  // Continuously measure loudness of the model's voice for lip-sync.
  const startVolumeLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS around the 128 mid-point -> 0..1
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // Smooth a little so the jaw doesn't jitter.
      volumeRef.current = volumeRef.current * 0.6 + Math.min(1, rms * 2.2) * 0.4;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const connect = useCallback(async () => {
    setErrorMessage(null);
    setStatus("connecting");

    try {
      // 1. Get an ephemeral key from our server route.
      const tokenRes = await fetch("/api/realtime-session");
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || "Could not start session");
      }
      const session = await tokenRes.json();
      // New Realtime API returns the ephemeral key at data.value.
      const ephemeralKey: string | undefined =
        session?.value ?? session?.client_secret?.value;
      if (!ephemeralKey) throw new Error("No ephemeral key returned");

      // 2. Set up the peer connection.
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Play + analyse the model's audio.
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        audioEl.srcObject = remoteStream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(remoteStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
        startVolumeLoop();
      };

      // 4. Send mic audio.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = mic;
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      // 5. Data channel for events (status, transcripts, etc.).
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === "input_audio_buffer.speech_started") {
            setStatus("listening");
          } else if (evt.type === "response.audio.delta") {
            setStatus("speaking");
          } else if (
            evt.type === "response.done" ||
            evt.type === "output_audio_buffer.stopped"
          ) {
            setStatus("listening");
          } else if (
            evt.type === "response.output_item.done" &&
            evt.item?.type === "function_call"
          ) {
            // The model wants to run a command.
            let result: { ok: boolean; detail?: string } = { ok: false };
            try {
              const args = JSON.parse(evt.item.arguments || "{}");
              if (evt.item.name === "play_gesture" && gestureRef) {
                const name = String(args.gesture || "");
                gestureRef.current = { seq: gestureRef.current.seq + 1, name };
                result = { ok: true, detail: `playing ${name}` };
              } else {
                result = runSiteAction(evt.item.name, args);
              }
            } catch {
              /* bad args */
            }
            // Report the result and let the model continue speaking.
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: evt.item.call_id,
                  output: JSON.stringify(result),
                },
              })
            );
            dc.send(JSON.stringify({ type: "response.create" }));
          }
        } catch {
          /* ignore non-JSON */
        }
      });

      // 6. SDP offer/answer handshake with OpenAI.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpRes.ok) throw new Error("WebRTC handshake failed");

      const answer = { type: "answer" as const, sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);

      setStatus("listening");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
      cleanup();
    }
  }, [cleanup, startVolumeLoop]);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { status, errorMessage, volumeRef, connect, disconnect };
}

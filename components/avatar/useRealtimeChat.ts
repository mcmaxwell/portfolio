"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voice } from "@/lib/voice";
import { track } from "@/lib/analytics";
import { newChatId, referrerHost, sendTurns, type ClientTurn } from "@/lib/chatLogClient";

/** A short, non-personal reason for a failed start, for analytics. */
function failureReason(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") return "mic_denied";
    if (err.name === "NotFoundError") return "no_mic";
    return err.name.slice(0, 40);
  }
  const msg = err instanceof Error ? err.message : "";
  if (/handshake/i.test(msg)) return "handshake";
  if (/session|ephemeral/i.test(msg)) return "token";
  return "other";
}

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

  // One conversation for the log and the analytics: its id, when it started, how many turns.
  const sessionRef = useRef<{ id: string; startedAt: number; questions: number; answers: number; spokenAt: Map<string, number> } | null>(null);

  const log = useCallback((turn: ClientTurn) => {
    const s = sessionRef.current;
    if (!s) return;
    const first = s.questions + s.answers === 0;
    sendTurns(s.id, "voice", [turn], first ? { referrer: referrerHost() } : {});
  }, []);

  const endSession = useCallback((how: "ended" | "error") => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    if (how === "ended") {
      track("avatar_chat_end", {
        duration_sec: Math.round((Date.now() - s.startedAt) / 1000),
        questions: s.questions,
        answers: s.answers,
      });
    }
  }, []);

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
    voice.level = 0;
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
      voice.level = volumeRef.current;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const connect = useCallback(async () => {
    setErrorMessage(null);
    setStatus("connecting");
    sessionRef.current = { id: newChatId(), startedAt: Date.now(), questions: 0, answers: 0, spokenAt: new Map() };
    track("avatar_chat_start");

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
          const s = sessionRef.current;
          if (s && evt.type === "input_audio_buffer.committed" && evt.item_id) {
            // The question's transcript can arrive after the answer starts: keep when it was said.
            s.spokenAt.set(evt.item_id, Date.now());
          } else if (s && evt.type === "conversation.item.input_audio_transcription.completed") {
            const text = String(evt.transcript ?? "").trim();
            if (text) {
              log({ role: "visitor", text, at: s.spokenAt.get(evt.item_id) });
              s.questions++;
              track("avatar_question", { turn: s.questions });
            }
          } else if (
            s &&
            (evt.type === "response.output_audio_transcript.done" || evt.type === "response.audio_transcript.done")
          ) {
            const text = String(evt.transcript ?? "").trim();
            if (text) {
              log({ role: "avatar", text });
              s.answers++;
              track("avatar_answer", { turn: s.answers });
            }
          }
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
              const value = String(args.gesture ?? args.section ?? "").slice(0, 40);
              if (evt.item.name === "play_gesture" && gestureRef) {
                const name = String(args.gesture || "");
                gestureRef.current = { seq: gestureRef.current.seq + 1, name };
                result = { ok: true, detail: `playing ${name}` };
              } else {
                result = runSiteAction(evt.item.name, args);
              }
              track("avatar_action", { action: String(evt.item.name).slice(0, 40), value });
              log({ role: "action", text: `${evt.item.name}(${value})${result.ok ? "" : " failed"}` });
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
      track("avatar_chat_connected");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
      track("avatar_chat_error", { reason: failureReason(err) });
      endSession("error");
      cleanup();
    }
  }, [cleanup, endSession, gestureRef, log, startVolumeLoop]);

  const disconnect = useCallback(() => {
    endSession("ended");
    cleanup();
    setStatus("idle");
  }, [cleanup, endSession]);

  // Leaving the page mid-conversation still counts as an end.
  useEffect(() => {
    const onHide = () => endSession("ended");
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      endSession("ended");
      cleanup();
    };
  }, [cleanup, endSession]);

  return { status, errorMessage, volumeRef, connect, disconnect };
}

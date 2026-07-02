import { NextResponse } from "next/server";
import { buildInstructions } from "@/lib/persona";
import { GESTURES } from "@/lib/gestures";

// Mint a short-lived ephemeral key so the browser can connect directly to
// the OpenAI Realtime API over WebRTC without ever exposing OPENAI_API_KEY.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REALTIME_MODEL = "gpt-realtime-2";
const VOICE = "cedar"; // male voice. Other male options: ash | echo | verse. Female: marin | shimmer | coral

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: buildInstructions(),
          audio: { output: { voice: VOICE } },
          tool_choice: "auto",
          tools: [
            {
              type: "function",
              name: "navigate_to_section",
              description:
                "Scroll the portfolio website to a section when the visitor asks to see it (e.g. 'show me your projects', 'take me to contact', 'go back to the top').",
              parameters: {
                type: "object",
                properties: {
                  section: {
                    type: "string",
                    enum: ["top", "about", "projects", "experience", "contact"],
                    description: "Which section to scroll to.",
                  },
                },
                required: ["section"],
              },
            },
            {
              type: "function",
              name: "play_gesture",
              description:
                "Make the avatar physically perform a body animation when asked (e.g. 'wave at me', 'do a dance', 'run', 'walk').",
              parameters: {
                type: "object",
                properties: {
                  gesture: {
                    type: "string",
                    enum: [...GESTURES],
                    description: "Which gesture/animation to play.",
                  },
                },
                required: ["gesture"],
              },
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: "Failed to create realtime session", detail },
        { status: res.status }
      );
    }

    const data = await res.json();
    // data.value is the ephemeral key the browser uses.
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error creating realtime session", detail: String(err) },
      { status: 500 }
    );
  }
}

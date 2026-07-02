import { ImageResponse } from "next/og";
import { owner } from "@/lib/persona";

export const runtime = "edge";
export const alt = `${owner.name} — ${owner.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Terminal-styled Open Graph / social share image, generated at the edge.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#050807",
          padding: "72px",
          fontFamily: "monospace",
          color: "#c7f5d9",
          border: "2px solid #14241c",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#5f8a72" }}>
          maksym@portfolio:~$ whoami
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 700, color: "#7cffb0" }}>
            {owner.name}
          </div>
          <div style={{ fontSize: 40, marginTop: 12, color: "#c7f5d9" }}>
            {owner.role}
          </div>
          <div style={{ fontSize: 28, marginTop: 24, color: "#22d3ee" }}>
            Co-founder &amp; CTO @ XecSuite · Co-founder @ Apex Mind Automation
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#5f8a72" }}>
          AI-integrated products · autonomous agents · end-to-end automation
        </div>
      </div>
    ),
    { ...size }
  );
}

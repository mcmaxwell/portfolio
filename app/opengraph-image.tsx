import { ImageResponse } from "next/og";
import { owner } from "@/lib/persona";

export const runtime = "edge";
export const alt = `${owner.name}, ${owner.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Open Graph / social share image in the site palette (ink, cream, ember), generated at the edge.
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
          background: "#0c0c0b",
          padding: "72px",
          fontFamily: "sans-serif",
          color: "#f1ece3",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#ff5b26" }}>
          liutsko.me
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, fontWeight: 700, color: "#f1ece3", letterSpacing: -4 }}>
            {owner.name}
          </div>
          <div style={{ fontSize: 40, marginTop: 12, color: "#d8d3ca" }}>
            {owner.role}
          </div>
          <div style={{ fontSize: 28, marginTop: 24, color: "#ff5b26" }}>
            Co-founder &amp; CTO @ XecSuite · Co-founder @ Apex Mind Automation
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#8c877e" }}>
          AI-integrated products · autonomous agents · end-to-end automation
        </div>
      </div>
    ),
    { ...size }
  );
}

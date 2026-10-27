import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: the "ML" monogram from app/icon.svg on a full-bleed ink square (iOS rounds the
// corners itself). Rendered once at build time.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0c0b" }}>
        <svg width="116" height="116" viewBox="0 0 64 64">
          <path
            d="M15 42V22l8.5 13L32 22v20M38 22v20h11"
            fill="none"
            stroke="#ff5b26"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}

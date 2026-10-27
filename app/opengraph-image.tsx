import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { owner } from "@/lib/persona";

export const alt = `${owner.name}, ${owner.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Open Graph / social share image in the site palette (ink, cream, ember), rendered once at build
// time. The photo is a crop of the intro film's poster (public/intro/intro-poster.webp), fading into
// the ink on its left edge so the type has a clean ground.
export default async function OpengraphImage() {
  const [photo, medium, bold] = await Promise.all([
    readFile(join(process.cwd(), "app/og-photo.jpg")),
    readFile(join(process.cwd(), "app/fonts/space-grotesk/space-grotesk-latin-500-static.ttf")),
    readFile(join(process.cwd(), "app/fonts/space-grotesk/space-grotesk-latin-700-static.ttf")),
  ]);
  const src = `data:image/jpeg;base64,${photo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0c0b", color: "#f1ece3", fontFamily: "Space Grotesk" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={src} width={630} height={630} style={{ position: "absolute", right: 0, top: 0 }} />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 630,
            height: 630,
            display: "flex",
            background: "linear-gradient(90deg, #0c0c0b 0%, rgba(12,12,11,0.75) 30%, rgba(12,12,11,0) 70%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: 820 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 500, color: "#f1ece3" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
                borderRadius: 26,
                border: "2px solid rgba(255,91,38,0.6)",
                color: "#ff5b26",
                fontSize: 20,
                fontWeight: 700,
                marginRight: 16,
              }}
            >
              ML
            </div>
            maksym<span style={{ color: "#ff5b26" }}>.</span>liutsko
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 120, fontWeight: 700, lineHeight: 0.88, letterSpacing: -5, textTransform: "uppercase" }}>
              <span>Maksym</span>
              <span style={{ color: "#ff5b26" }}>Liutsko</span>
            </div>
            <div style={{ fontSize: 31, fontWeight: 500, marginTop: 28, color: "#d8d3ca" }}>{owner.role}</div>
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#8c877e" }}>
            AI agents · voice interfaces · automation
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Space Grotesk", data: medium, weight: 500, style: "normal" },
        { name: "Space Grotesk", data: bold, weight: 700, style: "normal" },
      ],
    }
  );
}

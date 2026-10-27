import type { MetadataRoute } from "next";
import { owner } from "@/lib/persona";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${owner.name} | ${owner.role}`,
    short_name: owner.name,
    description: "Portfolio of Maksym Liutsko, AI Automation Engineer and Product Builder.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0c0b",
    theme_color: "#0c0c0b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}

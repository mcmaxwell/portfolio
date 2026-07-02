"use client";

import dynamic from "next/dynamic";

import { Nav } from "@/components/site/Nav";
import { About } from "@/components/site/About";
import { Projects } from "@/components/site/Projects";
import { Experience } from "@/components/site/Experience";
import { Contact, SiteFooter } from "@/components/site/Contact";

// Browser-only (WebRTC + Canvas), so disable SSR.
const TalkingAvatar = dynamic(
  () => import("@/components/avatar/TalkingAvatar"),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="relative min-h-screen bg-term-bg text-term-fg">
      <span id="top" className="absolute top-0" />
      <Nav />

      {/* Full-screen talking avatar hero */}
      <TalkingAvatar />

      {/* Content */}
      <About />
      <Projects />
      <Experience />
      <Contact />
      <SiteFooter />
    </main>
  );
}

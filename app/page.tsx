"use client";

import dynamic from "next/dynamic";

import { Nav } from "@/components/site/Nav";
import { HeroTitle } from "@/components/site/HeroTitle";
import { SmoothScroll } from "@/components/site/SmoothScroll";
import { Preloader } from "@/components/site/Preloader";
import { Cursor } from "@/components/site/Cursor";
import { Marquee } from "@/components/site/Marquee";
import { About } from "@/components/site/About";
import { Projects } from "@/components/site/Projects";
import { Experience } from "@/components/site/Experience";
import { Contact, SiteFooter } from "@/components/site/Contact";

// Browser-only (WebRTC + Canvas), so disable SSR. The placeholder holds the hero's full height, so
// nothing below it moves when the avatar mounts.
const TalkingAvatar = dynamic(
  () => import("@/components/avatar/TalkingAvatar"),
  { ssr: false, loading: () => <div aria-hidden className="h-screen" /> }
);

export default function Home() {
  return (
    <main className="relative min-h-screen bg-term-bg text-term-fg">
      <span id="top" className="absolute top-0" />
      <Preloader />
      <SmoothScroll />
      <Cursor />
      <Nav />

      {/* Hero: the server-rendered name sits behind the talking avatar's transparent canvas */}
      <div className="relative">
        <HeroTitle />
        <TalkingAvatar />
      </div>

      <Marquee />
      <About />
      <Projects />
      <Experience />
      <Contact />
      <SiteFooter />
      <div aria-hidden className="grain" />
    </main>
  );
}

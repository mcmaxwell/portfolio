"use client";

import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";

import { Nav } from "@/components/site/Nav";
import { HeroTitle } from "@/components/site/HeroTitle";
import { SmoothScroll } from "@/components/site/SmoothScroll";
import { Preloader } from "@/components/site/Preloader";
import { Cursor } from "@/components/site/Cursor";
import { TabPresence } from "@/components/site/TabPresence";
import { Marquee } from "@/components/site/Marquee";
import { About } from "@/components/site/About";
import { Projects } from "@/components/site/Projects";
import { Experience } from "@/components/site/Experience";
import { Services } from "@/components/site/Services";
import { Contact, SiteFooter } from "@/components/site/Contact";
import { AskMemory } from "@/components/site/AskMemory";
import { EasterEgg } from "@/components/site/EasterEgg";
import { HeroBoundary } from "@/components/avatar/LoadBoundary";
import { MemoryFieldSlot } from "@/components/memory/MemoryFieldSlot";

// Browser-only (WebRTC + Canvas), so disable SSR. The placeholder holds the hero's full height, so
// nothing below it moves when the avatar mounts.
const TalkingAvatar = dynamic(
  () => import("@/components/avatar/TalkingAvatar"),
  { ssr: false, loading: () => <div aria-hidden className="h-screen" /> }
);

export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen bg-term-bg text-term-fg [overflow-x:clip]">
        <span id="top" className="absolute top-0" />
        <a
          href="#about"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-term-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-bold focus:text-term-bg"
        >
          Skip to content
        </a>
        <Preloader />
        <SmoothScroll />
        <Cursor />
        <TabPresence />
        <EasterEgg />
        <Nav />
        <MemoryFieldSlot />

        {/* Hero: the server-rendered name sits behind the talking avatar's transparent canvas */}
        <div className="relative">
          <HeroTitle />
          <HeroBoundary fallback={<div aria-hidden className="h-screen" />}>
            <TalkingAvatar />
          </HeroBoundary>
        </div>

        <Marquee />
        <About />
        <Projects />
        <Experience />
        <Services />
        <AskMemory />
        <Contact />
        <SiteFooter />
        <div aria-hidden className="grain" />
      </main>
    </MotionConfig>
  );
}

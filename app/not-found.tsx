import type { Metadata } from "next";
import Link from "next/link";
import { LostAvatarSlot } from "@/components/site/LostAvatarSlot";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * The 404 page reuses the hero's composition: a giant outlined number behind the avatar, who has
 * clearly lost the page too.
 */
export default function NotFound() {
  return (
    <main className="relative h-[100dvh] min-h-[560px] overflow-hidden bg-term-bg text-term-fg">
      <p
        aria-hidden
        className="text-outline pointer-events-none absolute inset-x-0 top-[12%] select-none text-center font-display text-[42vw] font-medium leading-[0.8] tracking-[-0.06em] md:top-[8%] md:text-[30vw]"
      >
        404
      </p>
      {/* The hero camera has a fixed vertical field of view, so the avatar scales with this box: it
          stops above the message instead of standing on it. */}
      <div className="absolute inset-x-0 top-0 bottom-[27%] md:bottom-[24%]">
        <LostAvatarSlot />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-6 px-5 pb-12 text-center md:pb-14">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-[-0.03em] text-term-paper md:text-5xl">
            This page wandered off.
          </h1>
          <p className="mt-3 text-sm text-term-muted md:text-base">So did I, for a second. Let&apos;s get you back.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-term-accent px-7 py-3.5 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright"
          >
            Take me home
          </Link>
          <Link
            href="/#projects"
            className="rounded-full border border-term-paper/30 px-7 py-3.5 text-sm text-term-paper transition-colors hover:border-term-paper hover:bg-term-paper hover:text-term-bg"
          >
            See the work
          </Link>
        </div>
      </div>
    </main>
  );
}

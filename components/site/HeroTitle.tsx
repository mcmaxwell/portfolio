import { HeroName } from "./HeroName";

/**
 * The hero's type layer. It is server-rendered and sits behind the client-only avatar canvas
 * (app/page.tsx), so the name is the first thing painted, the LCP element and crawlable, and the
 * avatar then steps in front of it. The play transition fades it out with the rest of the hero
 * chrome through html[data-experience] (globals.css).
 */
export function HeroTitle() {
  return (
    <div
      data-hero-title
      className="pointer-events-none absolute inset-x-0 top-0 h-screen select-none overflow-hidden"
    >
      <HeroName />

      <div className="absolute bottom-10 left-10 hidden max-w-[16rem] text-xs leading-relaxed text-term-muted md:block">
        <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-term-accent">Role</p>
        <p className="text-term-paper">AI Automation Engineer &amp; Product Builder</p>
        <p>Co-founder &amp; CTO, XecSuite</p>
      </div>
      <div className="absolute bottom-10 right-10 hidden text-right text-xs leading-relaxed text-term-muted md:block">
        <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-term-accent">Based in</p>
        <p className="text-term-paper">London, Ontario</p>
        <p>Open to remote</p>
      </div>
    </div>
  );
}

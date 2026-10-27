import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/Contact";
import { owner } from "@/lib/persona";

export const metadata: Metadata = {
  title: "How it's made",
  description:
    "Colophon of liutsko.me: the talking avatar, the particle memory, the retrieval behind Ask my memory, the performance budget and the credits.",
  alternates: { canonical: "/colophon" },
};

type Entry = { label: string; body: React.ReactNode };

const SECTIONS: { title: string; entries: Entry[] }[] = [
  {
    title: "The avatar",
    entries: [
      {
        label: "Model",
        body: "An Avaturn scan of me, rigged, with the collar and sleeves cleaned up by a one-time bake. Its geometry and face shapes are compressed with meshoptimizer, 5.8 MB down to 3.1 MB; browsers without WebAssembly get the plain file.",
      },
      {
        label: "Voice",
        body: "OpenAI Realtime over WebRTC. The server mints a short-lived key per conversation, so the real key never reaches the browser. The avatar can scroll the page and play a gesture when you ask.",
      },
      {
        label: "Life",
        body: "An idle loop with the head and eyes following your pointer on top of it, nine Mixamo moves retargeted onto my own skeleton, and a nod while it speaks. While it talks, the giant name behind it pulses with its voice.",
      },
      {
        label: "The world",
        body: "Play / explore opens a small 3D campus in the same canvas: Rapier physics, a follow camera, and the same avatar handed over from the hero pose without a cut.",
      },
    ],
  },
  {
    title: "Agent memory",
    entries: [
      {
        label: "Particles",
        body: "16,000 points sampled on the avatar's surface in four poses, baked offline from the rig and stored one byte per axis: 192 KB. They take the avatar apart as you leave the hero, become a memory core, spell each project's name and come back together at the end to wave.",
      },
      {
        label: "Cost",
        body: "One draw call, shapes morphed on the GPU, a few rectangles read per frame. The layer loads after the page is idle, draws nothing while the hero is at rest, pauses with the tab and is skipped with reduced motion.",
      },
      {
        label: "Ask my memory",
        body: "The site's own content cut into short passages. Your question is embedded (text-embedding-3-small), ranked by cosine similarity, and a short answer is written from the top four passages only (gpt-4o-mini). Without the server it falls back to BM25 keyword ranking in your browser.",
      },
    ],
  },
  {
    title: "The rest",
    entries: [
      {
        label: "Stack",
        body: "Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Framer Motion, Lenis, React Three Fiber and three.js.",
      },
      {
        label: "Pages",
        body: "Case studies are static pages. A plain link and a shared view-transition name let the card's title and screenshot morph into the case page across a full navigation.",
      },
      {
        label: "Quality",
        body: "Around 1,400 Vitest tests, from the particle choreography and the retrieval handler to the game's physics, plus Playwright screenshots at desktop and phone widths for every change. The avatar is a still image in the first paint and the live one dissolves in over it; on a machine that draws WebGL without a GPU it wakes only when you reach for it, and then draws only when something changes.",
      },
      {
        label: "Access",
        body: "Reduced motion turns off the film, the particles, smooth scrolling and the hover effects. Everything works by keyboard, the hero controls are inert under the film, screenshots have alt text and the 3D hero has a label.",
      },
      {
        label: "Type",
        body: "Space Grotesk, a variable font whose weight follows your pointer, and JetBrains Mono. Ink and ember: near-black, cream and one orange.",
      },
      {
        label: "Credits",
        body: "Avatar by Avaturn, moves from Adobe Mixamo, fonts by Florian Karsten and JetBrains (both SIL Open Font License). Design, code and words by me.",
      },
    ],
  },
];

export default function Colophon() {
  return (
    <main className="min-h-screen bg-term-bg text-term-fg [overflow-x:clip]">
      <header className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between px-5 text-sm md:px-10">
        <a href="/" className="flex items-center gap-3 text-term-paper">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-term-accent/60 font-mono text-[10px] font-bold text-term-accent">
            ML
          </span>
          <span className="hidden sm:inline">maksym.liutsko</span>
        </a>
        <a href="/" className="link-draw text-term-muted hover:text-term-paper">
          ← Back to the site
        </a>
      </header>

      <article className="mx-auto w-full max-w-[1400px] px-5 pb-24 pt-10 md:px-10 md:pt-20">
        <p className="font-mono text-xs text-term-accent">Colophon</p>
        <h1 className="mt-6 max-w-[12ch] font-display text-[clamp(2.75rem,10vw,7.5rem)] font-medium leading-[0.92] tracking-[-0.04em] text-term-paper">
          How it&apos;s made
        </h1>
        <p className="mt-6 max-w-[46ch] text-lg text-term-muted md:text-2xl">
          A portfolio that is also a working sample: a talking avatar, a memory you can ask, and the engineering that keeps
          it light.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title} aria-labelledby={`c-${s.title}`} className="mt-20 md:mt-28">
            <h2 id={`c-${s.title}`} className="font-display text-3xl font-medium tracking-tight text-term-paper md:text-5xl">
              {s.title}
            </h2>
            <dl className="mt-8">
              {s.entries.map((e) => (
                <div key={e.label} className="grid gap-3 border-t border-term-line py-8 md:grid-cols-12 md:gap-8">
                  <dt className="font-mono text-xs uppercase tracking-[0.2em] text-term-accent md:col-span-3 md:pt-1.5">{e.label}</dt>
                  <dd className="text-base leading-relaxed text-term-fg/85 md:col-span-8 md:col-start-5 md:text-lg">{e.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <div className="mt-20 flex flex-wrap items-center gap-3 border-t border-term-line pt-12">
          <a
            href="/#memory"
            className="rounded-full bg-term-accent px-7 py-3.5 text-sm font-bold text-term-bg transition-colors hover:bg-term-accent-bright"
          >
            Ask my memory
          </a>
          <a
            href={`mailto:${owner.email}`}
            className="rounded-full border border-term-paper/30 px-7 py-3.5 text-sm text-term-paper transition-colors hover:border-term-paper hover:bg-term-paper hover:text-term-bg"
          >
            Talk to me about it
          </a>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}

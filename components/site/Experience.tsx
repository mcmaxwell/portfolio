"use client";

import { experience, education } from "@/lib/persona";
import { FadeIn, RevealText, SectionLabel } from "./ui";

export function Experience() {
  return (
    <section id="experience" aria-label="Career" className="mx-auto w-full max-w-[1400px] px-5 py-24 md:px-10 md:py-40">
      <SectionLabel index="03" label="Career" />
      <RevealText
        text="Built for clients. Now building with agents."
        className="mb-16 max-w-[16ch] font-display text-5xl font-medium leading-[0.95] tracking-[-0.04em] text-term-paper md:mb-24 md:text-8xl"
      />

      <ol className="border-b border-term-line">
        {experience.map((e) => (
          <li key={e.role + e.company}>
            <FadeIn className="group relative grid gap-2 border-t border-term-line py-8 md:grid-cols-12 md:gap-6 md:px-3 md:py-10">
              <span
                aria-hidden
                className="absolute left-0 top-0 h-px w-full origin-left scale-x-0 bg-term-accent transition-transform duration-700 ease-out group-hover:scale-x-100"
              />
              <span className="text-xs text-term-muted md:col-span-3 md:pt-2">{e.period}</span>
              <div className="md:col-span-4">
                <h3 className="font-display text-2xl font-medium tracking-tight text-term-paper md:text-3xl">{e.role}</h3>
                <p className="mt-1 text-sm text-term-accent">{e.company}</p>
              </div>
              <p className="text-sm leading-relaxed text-term-fg/75 md:col-span-5 md:text-base">{e.detail}</p>
            </FadeIn>
          </li>
        ))}
      </ol>

      <div className="mt-20 grid gap-6 md:mt-28 md:grid-cols-12">
        <h3 className="text-xs uppercase tracking-[0.2em] text-term-muted md:col-span-3">Education &amp; certifications</h3>
        <ul className="space-y-3 md:col-span-9">
          {education.map((ed) => (
            <li key={ed} className="flex gap-3 text-sm text-term-paper/90 md:text-base">
              <span aria-hidden className="select-none text-term-accent">✦</span>
              <span>{ed}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

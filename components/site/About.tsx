import { owner, skills } from "@/lib/persona";
import { TermSection } from "./TermWindow";

export function About() {
  return (
    <TermSection id="about" command="cat about.md" title="~/about.md">
      <div className="grid gap-10 md:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="mb-4 text-2xl font-bold text-term-green-bright text-glow md:text-3xl">
            # {owner.name}
          </h2>
          <p className="mb-3 text-sm leading-relaxed text-term-fg/90 md:text-base">
            {owner.about}
          </p>
          <p className="text-sm text-term-muted">
            <span className="text-term-cyan">location</span> = &quot;
            {owner.location}&quot;
          </p>
        </div>

        <div>
          <p className="mb-3 text-sm text-term-muted">
            <span className="text-term-green">$</span> stack --list
          </p>
          <ul className="space-y-2 text-sm">
            {skills.map((s) => (
              <li key={s} className="flex gap-2 text-term-fg/90">
                <span className="select-none text-term-green">▸</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TermSection>
  );
}

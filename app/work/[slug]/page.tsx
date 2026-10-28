import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseStudy } from "@/components/site/CaseStudy";
import { caseBySlug, cases } from "@/data/cases";
import { owner } from "@/lib/persona";

const SITE_URL = "https://liutsko.me";

export function generateStaticParams() {
  return cases.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = caseBySlug(params.slug);
  if (!c) return {};
  const title = `${c.name}: ${c.tagline}`;
  return {
    title,
    description: c.hook,
    alternates: { canonical: `/work/${c.slug}` },
    openGraph: {
      type: "article",
      url: `${SITE_URL}/work/${c.slug}`,
      title,
      description: c.hook,
      images: [{ url: c.media.image }],
    },
    twitter: { card: "summary_large_image", title, description: c.hook, images: [c.media.image] },
  };
}

export default function CasePage({ params }: { params: { slug: string } }) {
  const c = caseBySlug(params.slug);
  if (!c) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: c.name,
    headline: c.tagline,
    description: c.hook,
    url: `${SITE_URL}/work/${c.slug}`,
    image: `${SITE_URL}${c.media.image}`,
    author: { "@id": `${SITE_URL}/#person`, "@type": "Person", name: owner.name },
    ...(c.link ? { sameAs: c.link } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CaseStudy c={c} />
    </>
  );
}

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";

import "./globals.css";
import { ThemeProvider } from "./provider";
import { education, owner } from "@/lib/persona";

const GA_ID = "G-RW77DJRDV1";
const SITE_URL = "https://liutsko.me";
const TITLE = `${owner.name} | ${owner.role}`;
const DESCRIPTION =
  "Maksym Liutsko, AI Automation Engineer and Product Builder. Co-founder and CTO of XecSuite, co-founder of Apex Mind Automation. I build AI-integrated products, autonomous agents and end-to-end automation with React, TypeScript and LLMs.";

// Self-hosted so the build needs no network. Weights 400 and 700 are the only
// ones the site uses (default text and font-bold). Provenance: ASSETS.md.
const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono/jetbrains-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

// Display face for headings and large type: one variable file, weights 300 to 700. Provenance: ASSETS.md.
const display = localFont({
  src: "./fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2",
  weight: "300 700",
  variable: "--font-display",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0c0c0b",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${owner.name}` },
  description: DESCRIPTION,
  applicationName: `${owner.name} Portfolio`,
  authors: [{ name: owner.name, url: SITE_URL }],
  creator: owner.name,
  keywords: [
    "Maksym Liutsko",
    "AI Automation Engineer",
    "Front-End Developer",
    "React",
    "TypeScript",
    "Next.js",
    "AI agents",
    "multi-agent orchestration",
    "LLM",
    "Adobe Commerce",
    "Magento",
    "XecSuite",
    "Apex Mind Automation",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: owner.name,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_CA",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  formatDetection: { telephone: false },
  other: { "llms-txt": `${SITE_URL}/llms.txt` },
};

// Structured data for search engines and AI agents: one graph with the site, the profile page
// (Google's ProfilePage rich result) and the person it is about.
const PERSON_ID = `${SITE_URL}/#person`;
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: owner.name,
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": PERSON_ID },
    },
    {
      "@type": "ProfilePage",
      "@id": `${SITE_URL}/#profile`,
      url: SITE_URL,
      name: TITLE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": PERSON_ID },
      mainEntity: { "@id": PERSON_ID },
      primaryImageOfPage: `${SITE_URL}/opengraph-image`,
      inLanguage: "en",
    },
    {
      "@type": "Person",
      "@id": PERSON_ID,
      name: owner.name,
      alternateName: "Max Liutsko",
      jobTitle: owner.role,
      description: owner.about,
      url: SITE_URL,
      image: `${SITE_URL}/opengraph-image`,
      email: `mailto:${owner.email}`,
      address: {
        "@type": "PostalAddress",
        addressLocality: "London",
        addressRegion: "ON",
        addressCountry: "CA",
      },
      sameAs: [owner.linkedin, "https://github.com/mcmaxwell"],
      worksFor: [
        { "@type": "Organization", name: "XecSuite", url: "https://www.xecsuite.com" },
        { "@type": "Organization", name: "Apex Mind Automation", url: "https://apexmind.studio" },
      ],
      hasCredential: education
        .filter((e) => e.startsWith("Adobe Certified"))
        .map((name) => ({ "@type": "EducationalOccupationalCredential", name })),
      alumniOf: { "@type": "CollegeOrUniversity", name: "National Metallurgical Academy of Ukraine" },
      knowsAbout: [
        "AI agents",
        "Multi-agent orchestration",
        "Large language models",
        "Voice interfaces",
        "Business process automation",
        "React",
        "TypeScript",
        "Next.js",
        "Adobe Commerce",
        "Magento 2",
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${mono.variable} ${display.variable} font-display`} suppressHydrationWarning>
        {/* Before first paint: skip the intro curtain on a repeat visit in this tab (Preloader.tsx). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem("ml-intro"))document.documentElement.classList.add("intro-seen")}catch(e){}`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>

        {/* Google Analytics (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import { ThemeProvider } from "./provider";
import { owner } from "@/lib/persona";

const GA_ID = "G-RW77DJRDV1";
const SITE_URL = "https://liutsko.me";
const TITLE = `${owner.name} — ${owner.role}`;
const DESCRIPTION =
  "Maksym Liutsko — Front-End & AI Automation Engineer. Co-founder & CTO of XecSuite, co-founder of Apex Mind Automation. I build AI-integrated products, autonomous agents and end-to-end automation with React, TypeScript and LLMs.";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s — ${owner.name}` },
  description: DESCRIPTION,
  applicationName: `${owner.name} — Portfolio`,
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
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: owner.name,
  jobTitle: owner.role,
  url: SITE_URL,
  email: `mailto:${owner.email}`,
  address: {
    "@type": "PostalAddress",
    addressLocality: "London",
    addressRegion: "ON",
    addressCountry: "CA",
  },
  sameAs: [owner.linkedin, "https://www.xecsuite.com", "https://apexmind.studio"],
  worksFor: [
    { "@type": "Organization", name: "XecSuite" },
    { "@type": "Organization", name: "Apex Mind Automation" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${mono.variable} font-mono`} suppressHydrationWarning>
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

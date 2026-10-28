/**
 * Case studies behind the project cards: one page per featured project at /work/<slug>. Every
 * number here is a scale fact Max can stand behind (what was built and how much it does), never a
 * conversion or revenue claim. Sources: profile/case-facts.md in the project files.
 */

export type CaseFact = { value: string; label: string };

export type CaseClient = { name: string; url: string; work: string };

/**
 * One more screen of the product, below the story: a silent loop or a still. `wide` takes two thirds
 * of the row, `half` half, `full` all of it, `phone` a third over two rows (portrait recordings).
 */
export type CaseScreen = {
  kind: "video" | "image";
  src: string;
  /** Still shown before a loop plays, and instead of it with reduced motion. */
  poster?: string;
  caption: string;
  layout: "wide" | "half" | "full" | "phone";
  width: number;
  height: number;
};

export type CaseStudy = {
  slug: string;
  /** `id` of the matching entry in `projects` (data/index.ts). */
  projectId: number;
  name: string;
  /** What the memory layer spells over the card when the name is too long (defaults to `name`). */
  mark?: string;
  tagline: string;
  eyebrow: string;
  /** The one sentence the card and the page open with. */
  hook: string;
  facts: readonly [CaseFact, CaseFact, CaseFact];
  problem: string;
  built: readonly string[];
  how: string;
  results: string;
  role: string;
  stack: readonly string[];
  link?: string;
  linkLabel?: string;
  clients?: readonly CaseClient[];
  /** Recordings and stills of the product, from public/cases (ASSETS.md). */
  screens?: readonly CaseScreen[];
  /** Heading of the screens section (default "Screens"). */
  screensLabel?: string;
  media: {
    image: string;
    alt: string;
    /** Short silent loop, shown instead of the image once the files exist (public/cases). */
    video?: { mp4: string; webm?: string; poster?: string };
  };
};

export const cases: readonly CaseStudy[] = [
  {
    slug: "xecsuite",
    projectId: 1,
    name: "XecSuite",
    tagline: "AI operating layer for supply chain teams",
    eyebrow: "Co-founder & CTO",
    hook: "A governed workforce of AI agents that runs the back office of a logistics company, with a human approving what matters.",
    facts: [
      { value: "6", label: "connected modules" },
      { value: "8", label: "agent roles" },
      { value: "2", label: "countries, Canada and the US" },
    ],
    problem:
      "Freight, finance and customer work in a logistics company lives in email, spreadsheets, a TMS and people's heads. Every request means someone reading, deciding and retyping, and the knowledge of how things are done leaves with them.",
    built: [
      "A tenant-private company memory that connects the client's systems and knowledge once.",
      "A support agent that reads, answers and resolves tickets on its own.",
      "A voice agent, a system that places phone calls, and a meeting agent that joins, tracks and follows up on meetings.",
      "Email automation and custom per-client features on top of the core.",
      "Approval gates: every agent action that matters waits for a person.",
    ],
    how:
      "Modules around the memory core: Freight Desk, Load Coverage, Logistics, Premium CRM, Meeting Agent and RFP. Hybrid model routing sends routine steps to private models and high-stakes reasoning to frontier models. Built with Nik, my co-founder.",
    results: "Built and awarded at a Startup Weekend; now live, and improved every week with new custom features.",
    role: "Co-founder and CTO: architecture, agent runtime, model routing and product engineering.",
    stack: ["Next.js", "TypeScript", "Agents", "Hybrid model routing", "Voice"],
    link: "https://www.xecsuite.com",
    linkLabel: "Visit XecSuite",
    screens: [
      { kind: "image", src: "/cases/xecsuite-lanes.webp", caption: "A lane, not a shipment: quote requests checked against the lane's history.", layout: "wide", width: 1280, height: 413 },
      { kind: "video", src: "/cases/xecsuite-site-mobile.mp4", poster: "/cases/xecsuite-site-mobile.webp", caption: "The same site on a phone.", layout: "phone", width: 480, height: 1038 },
      { kind: "image", src: "/cases/xecsuite-council.webp", caption: "One question, every system: freight, finance, customer and operations evidence side by side.", layout: "wide", width: 1280, height: 487 },
    ],
    media: {
      image: "/proj-xecsuite.webp",
      alt: "XecSuite: the AI operating layer for your supply chain",
      video: { mp4: "/cases/xecsuite-site.mp4", poster: "/cases/xecsuite-site.webp" },
    },
  },
  {
    slug: "newsstocks",
    projectId: 2,
    name: "NewsStocks.live",
    mark: "NewsStocks",
    tagline: "A financial news site that writes, illustrates, films and publishes itself",
    eyebrow: "Built solo at Apex Mind",
    hook: "A newsroom with nobody in it: over a hundred articles a day, market analysis every day, week and month, and short videos for the social channels.",
    facts: [
      { value: "100+", label: "articles a day" },
      { value: "27.9K", label: "articles published since February 2026" },
      { value: "20", label: "kinds of content, from briefs to market games" },
    ],
    problem:
      "A news product normally needs a newsroom: writers, an editor, a designer, a social team. I wanted to see how far one engineer and a pipeline could go instead.",
    built: [
      "A cron pipeline that pulls S&P 500 news and writes per-article summaries plus a daily market analysis: direction, confidence, drivers, risks, sector outlooks, strategy.",
      "Illustrations through a Pexels to DALL·E pipeline into Cloudinary.",
      "Short-form videos for TikTok, Instagram, Facebook and YouTube, about 30 posts a day on Telegram, and automatic replies in some channels.",
      "Around the news: market games, quizzes, weekly and monthly analytics.",
      "Admin dashboard, role-based auth, PIPEDA and CASL compliance.",
    ],
    how:
      "Next.js front end with structured data, sitemaps and fast pages, so search engines treat it as a real publication. GPT-4o-mini writes, cron pipelines schedule, Cloudinary serves media, a Telegram bot broadcasts. New videos now include short animated pieces.",
    results: "Live since February 2026 and still growing: several deploys a month with new or improved features, and a desktop PageSpeed score of 92.",
    role: "Everything: product, design, code, pipelines and operations.",
    stack: ["Next.js", "GPT-4o-mini", "Cron pipelines", "Cloudinary", "Telegram", "ElevenLabs", "HeyGen", "Kling AI"],
    link: "https://newsstocks.live",
    linkLabel: "Visit NewsStocks.live",
    screens: [
      { kind: "video", src: "/cases/newsstocks-analysis.mp4", poster: "/cases/newsstocks-analysis.webp", caption: "The daily market analysis: direction, drivers, risks and sector outlooks.", layout: "wide", width: 1280, height: 720 },
      { kind: "video", src: "/cases/newsstocks-home-mobile.mp4", poster: "/cases/newsstocks-home-mobile.webp", caption: "The home page on a phone.", layout: "phone", width: 480, height: 1038 },
      { kind: "video", src: "/cases/newsstocks-article.mp4", poster: "/cases/newsstocks-article.webp", caption: "An article: summary, our take, key numbers and related news.", layout: "wide", width: 1280, height: 720 },
      { kind: "video", src: "/cases/newsstocks-extras.mp4", poster: "/cases/newsstocks-extras.webp", caption: "The S&P 500 heatmap, one of the extras around the news.", layout: "full", width: 1280, height: 720 },
    ],
    media: {
      image: "/proj-newsstocks.webp",
      alt: "NewsStocks.live home page with AI market analysis",
      video: { mp4: "/cases/newsstocks-home.mp4", poster: "/cases/newsstocks-home.webp" },
    },
  },
  {
    slug: "apexmind",
    projectId: 3,
    name: "Apex Mind",
    tagline: "AI automation studio for small businesses",
    eyebrow: "Co-founder",
    hook: "Practical automation for 5 to 50 person businesses in London, Ontario: we map the week, build into the tools you already run, and train the team.",
    facts: [
      { value: "7", label: "services, from websites to video ads" },
      { value: "5–50", label: "person businesses we build for" },
      { value: "2", label: "founders, Olha and me" },
    ],
    problem:
      "Small businesses lose their week to quoting, scheduling, invoicing, follow-ups, paperwork, phone calls and social posts. Enterprise automation does not fit them, and generic AI tools do not know their business.",
    built: [
      "Automations built into the tools a client already uses, not a new platform to learn.",
      "AI voice agents that answer and place calls, LLM assistants, Telegram bots and content pipelines.",
      "Products of the studio: NewsStocks.live and an AI HR assistant that answers candidates, books interviews and shortlists résumés.",
      "The studio site itself, built with GSAP and Lenis.",
    ],
    how: "Make.com and n8n where a flow is enough, custom Next.js and Node where it is not, and a model per task across OpenAI, Claude and Gemini.",
    results: "Every engagement ends with the team running the automation themselves.",
    role: "Co-founder and the engineer behind every automation.",
    stack: ["Make.com", "n8n", "LLMs", "Voice agents", "Next.js", "GSAP"],
    link: "https://apexmind.studio",
    linkLabel: "Visit Apex Mind",
    media: {
      image: "/proj-apexmind.webp",
      alt: "Apex Mind studio site",
      video: { mp4: "/cases/apexmind-site.mp4", poster: "/cases/apexmind-site.webp" },
    },
  },
  {
    slug: "ecommerce",
    projectId: 9,
    name: "E-commerce",
    tagline: "Twelve years of front end, most of it in retail storefronts",
    eyebrow: "Front-end developer and team lead",
    hook: "Over a hundred websites across the career, and six years of Magento 2 storefronts for retail brands in Canada, New Zealand and Australia.",
    facts: [
      { value: "20+", label: "stores launched" },
      { value: "100+", label: "websites over the career" },
      { value: "3", label: "countries of retail clients" },
    ],
    problem:
      "Retail brands live on their storefront. Every redesign, checkout change or new feature has to ship without breaking the store that pays the bills.",
    built: [
      "Theme builds from Figma, custom UI components and full from-scratch storefronts.",
      "Custom checkout flows and a booking system on Knockout widgets.",
      "Redesigns and ongoing support for brands with live traffic.",
      "Salesforce LWC and Commerce Cloud components for a B2C site.",
    ],
    how: "Magento 2 (Adobe Commerce) with Knockout.js, jQuery, LESS/SASS and Gulp/Grunt pipelines; Salesforce LWC and WordPress where the client ran on them. Adobe Certified Expert, Adobe Commerce Front-End Developer.",
    results: "20+ stores launched and kept running; team lead on checkout and front end for two agencies.",
    role: "Front-end developer, later team lead: code reviews, estimates and mentoring alongside the build work.",
    stack: ["Magento 2", "Knockout.js", "jQuery", "LESS/SASS", "Gulp/Grunt", "Salesforce LWC", "WordPress"],
    clients: [
      { name: "Rexall", url: "https://www.rexall.ca", work: "Site restorations, landing pages, custom features" },
      { name: "Tepperman's", url: "https://www.teppermans.com", work: "Site update, custom features, checkout work" },
      { name: "Chatters", url: "https://www.chatters.ca", work: "Booking system, design update" },
      { name: "BK Products", url: "https://bkproducts.com", work: "Design update and the storefront features live today" },
      { name: "Coco Republic", url: "https://www.cocorepublic.com.au", work: "Design update, front end, small back-end pieces" },
      { name: "Max", url: "https://www.max.co.nz", work: "Design update, front end" },
      { name: "West Coast Kids", url: "https://www.westcoastkids.ca", work: "Front end rebuilt on a new storefront stack, custom features" },
    ],
    screensLabel: "Storefronts today",
    screens: [
      { kind: "image", src: "/cases/client-westcoastkids.webp", caption: "West Coast Kids, live on Magento 2.", layout: "half", width: 1280, height: 667 },
      { kind: "image", src: "/cases/client-bkproducts.webp", caption: "BK Products, live on Magento 2.", layout: "half", width: 1280, height: 667 },
    ],
    media: { image: "/proj-max.webp", alt: "Max storefront, one of the Magento 2 builds" },
  },
];

export function caseBySlug(slug: string): CaseStudy | undefined {
  return cases.find((c) => c.slug === slug);
}

export function caseForProject(projectId: number): CaseStudy | undefined {
  return cases.find((c) => c.projectId === projectId);
}

/** The case after this one, wrapping around, for the "next" link at the bottom of a page. */
export function nextCase(slug: string): CaseStudy {
  const i = cases.findIndex((c) => c.slug === slug);
  return cases[(i + 1) % cases.length];
}

export const navItems = [
  { name: "About", link: "#about" },
  { name: "Projects", link: "#projects" },
  { name: "Testimonials", link: "#testimonials" },
  { name: "Contact", link: "#contact" },
];

export const gridItems = [
  {
    id: 1,
    title:
      "I write clean code and collaborate closely with backend and AI teams",
    description: "",
    className: "lg:col-span-3 md:col-span-6 md:row-span-4 lg:min-h-[60vh]",
    imgClassName: "w-full h-full",
    titleClassName: "justify-end",
    img: "/b1.svg",
    spareImg: "",
  },
  {
    id: 2,
    title: "Based in London, Ontario — flexible across time zones",
    description: "",
    className: "lg:col-span-2 md:col-span-3 md:row-span-2",
    imgClassName: "",
    titleClassName: "justify-start",
    img: "",
    spareImg: "",
  },
  {
    id: 3,
    title: "My tech stack",
    description: "React, TypeScript, Tailwind & AI",
    className: "lg:col-span-2 md:col-span-3 md:row-span-2",
    imgClassName: "",
    titleClassName: "justify-center",
    img: "",
    spareImg: "",
  },
  {
    id: 4,
    title: "AI Automation Engineer & Product Builder — 12+ years in software.",
    description: "",
    className: "lg:col-span-2 md:col-span-3 md:row-span-1",
    imgClassName: "",
    titleClassName: "justify-start",
    img: "/grid.svg",
    spareImg: "/b4.svg",
  },
  {
    id: 5,
    title: "Currently building AI-integrated, voice-driven web experiences",
    description: "The Inside Scoop",
    className: "md:col-span-3 md:row-span-2",
    imgClassName: "absolute right-0 bottom-0 md:w-96 w-60",
    titleClassName: "justify-center md:justify-start lg:justify-center",
    img: "/b5.svg",
    spareImg: "/grid.svg",
  },
  {
    id: 6,
    title: "Do you want to start a project together?",
    description: "",
    className: "lg:col-span-2 md:col-span-3 md:row-span-1",
    imgClassName: "",
    titleClassName: "justify-center md:max-w-full max-w-60 text-center",
    img: "",
    spareImg: "",
  },
];

// `link` starting with http is treated as an external (clickable) project;
// otherwise it's marked "private". `tag` shows a small badge.
export const projects = [
  {
    id: 1,
    title: "XecSuite — AI Operating Layer for 3PLs",
    des: "The operating layer cross-border (Canada–US) logistics companies run on. A tenant-private company-memory core plus configurable modules — CRM, marketing, meeting intelligence, freight analysis, ops/SOP and an executive assistant — run by a governed, approval-gated agent workforce with hybrid model routing (private models for routine work, frontier models for high-stakes reasoning). Built and awarded at a Startup Weekend; now live.",
    img: "/proj-xecsuite.png",
    iconLists: ["/next.svg", "/ts.svg", "/tail.svg"],
    link: "https://www.xecsuite.com",
    tag: "Startup Weekend",
  },
  {
    id: 2,
    title: "NewsStocks.live — Autonomous Financial-News Platform",
    des: "A fully automated Next.js news platform. A cron pipeline pulls S&P 500 news, and GPT-4o-mini generates per-article summaries plus comprehensive market analysis (direction, confidence, key drivers, risk, sector outlooks, strategy). Images via a Pexels→DALL·E pipeline to Cloudinary, a Telegram bot broadcasts daily analysis, and the system auto-produces social posts and short-form videos for TikTok, YouTube, Instagram & Facebook. Admin dashboard, role-based auth, PIPEDA/CASL-compliant.",
    img: "/proj-newsstocks.png",
    iconLists: ["/next.svg", "/ts.svg", "/tail.svg"],
    link: "https://newsstocks.live",
    tag: "Live",
  },
  {
    id: 3,
    title: "Apex Mind Automation — Automation Studio",
    des: "My automation studio: I design custom automations, AI agents and web apps for businesses — from lead handling and content pipelines to full multi-agent systems. The brand system pairs a GSAP + Lenis marketing site with Node generators that produce branded docs, decks and one-pagers automatically. (Public site launching soon.)",
    img: "/proj-apexmind.png",
    iconLists: ["/ts.svg", "/tail.svg", "/gsap.svg"],
    link: "https://apexmind.studio",
    tag: "Founder",
  },
  {
    id: 4,
    title: "AI HR Assistant",
    des: "End-to-end recruitment automation (Make.com / n8n + LLMs): answers candidate questions on social media, books interviews, parses and structures résumés, and shortlists candidates automatically.",
    iconLists: [],
    link: "",
  },
  {
    id: 5,
    title: "Document & Image Archive Bot",
    des: "A Telegram bot that ingests photos and documents, extracts and analyzes their text, files structured records into Google Docs and a database, and replies with a link and a short summary.",
    iconLists: [],
    link: "",
  },
  {
    id: 6,
    title: "Self-Hosted Family AI Agent",
    des: "A private home assistant running on open-source LLMs — searches our photo and document archive, plans schedules (school activities, meals), analyzes data (calories, recipes), and generates images and code, with no subscriptions or per-token cost.",
    iconLists: [],
    link: "",
  },
  {
    id: 7,
    title: "Dewy — AI Plant-Care PWA",
    des: "AI-guided plant rescue and care as a Next.js PWA (wrapped for iOS & Android via Capacitor). Smart Scan diagnoses plants against Google Gemini, with care logging, reminders, weather alerts and XP/badges.",
    iconLists: ["/next.svg", "/ts.svg", "/tail.svg"],
    link: "",
  },
  {
    id: 8,
    title: "AI Talking Avatar Portfolio",
    des: "This site — a real-time 3D avatar you can talk to, built with React Three Fiber and the OpenAI Realtime API, with voice-driven navigation, gestures and live lip-sync.",
    iconLists: ["/re.svg", "/ts.svg", "/tail.svg", "/three.svg"],
    link: "https://liutsko.me",
  },
  {
    id: 9,
    title: "E-commerce — Magento / Adobe Commerce",
    des: "Six+ years building and supporting Magento 2 (Adobe Commerce) storefronts for retail brands across Canada, NZ and Australia — theme development, ongoing support, deep customization, custom checkout flows, and full from-scratch builds. Built with Knockout.js, jQuery, LESS/SASS and Gulp/Grunt pipelines, plus custom UI components and Figma-to-theme conversion.",
    img: "/proj-max.png",
    iconLists: ["/ts.svg", "/tail.svg", "/c.svg"],
    link: "",
    tag: "Client Work",
    clients: [
      { name: "Rexall", url: "https://www.rexall.ca" },
      { name: "Tepperman's", url: "https://www.teppermans.com" },
      { name: "Max", url: "https://www.max.co.nz" },
      { name: "Coco Republic", url: "https://www.cocorepublic.com.au" },
      { name: "BK Products", url: "https://bkproducts.com" },
      { name: "West Coast Kids", url: "https://www.westcoastkids.ca" },
    ],
  },
];

// NOTE: placeholder testimonials — replace with real quotes/clients.
export const testimonials = [
  {
    quote:
      "Maksym is a rare front-end developer who pairs strong design sense with clean, maintainable code. He turned complex Figma designs into flawless, responsive interfaces and was a pleasure to collaborate with.",
    name: "Placeholder Name",
    title: "Design Lead",
  },
  {
    quote:
      "As our frontend lead, Maksym raised the quality bar for the whole team — thoughtful code reviews, reliable estimates, and a real talent for mentoring. Our checkout and UI work shipped faster and cleaner.",
    name: "Placeholder Name",
    title: "Engineering Manager",
  },
  {
    quote:
      "Maksym brings a genuine curiosity about AI and human behavior to his work. He prototyped an AI-driven, voice-enabled interface for us incredibly fast and made it feel effortless to use.",
    name: "Placeholder Name",
    title: "Product Manager",
  },
  {
    quote:
      "Dependable, communicative, and detail-obsessed. Maksym delivered high-quality e-commerce features under tight deadlines and always kept the user first.",
    name: "Placeholder Name",
    title: "Project Owner",
  },
];

// NOTE: logos below are still template brands — replace img/nameImg with your
// real employers' or clients' logos when you have them.
export const companies = [
  {
    id: 1,
    name: "cloudinary",
    img: "/cloud.svg",
    nameImg: "/cloudName.svg",
  },
  {
    id: 2,
    name: "appwrite",
    img: "/app.svg",
    nameImg: "/appName.svg",
  },
  {
    id: 3,
    name: "HOSTINGER",
    img: "/host.svg",
    nameImg: "/hostName.svg",
  },
  {
    id: 4,
    name: "stream",
    img: "/s.svg",
    nameImg: "/streamName.svg",
  },
  {
    id: 5,
    name: "docker.",
    img: "/dock.svg",
    nameImg: "/dockerName.svg",
  },
];

export const workExperience = [
  {
    id: 1,
    title: "E-commerce Developer — Northern Commerce",
    desc: "Custom Magento 2 themes, UI components and a Knockout booking system; Salesforce LWC + Cloud Commerce for B2C. May 2022 – present.",
    className: "md:col-span-2",
    thumbnail: "/exp1.svg",
  },
  {
    id: 2,
    title: "Senior Frontend Developer — Overdose",
    desc: "Led Magento 2 frontend and custom checkout as team lead: code reviews, estimations and mentoring. Dec 2020 – Apr 2022.",
    className: "md:col-span-2",
    thumbnail: "/exp2.svg",
  },
  {
    id: 3,
    title: "Frontend Developer — Orot Technologies",
    desc: "ReactJS + TypeScript UIs with Styled Components, Storybook and Redux, integrated with Magento's REST API. Feb 2018 – Feb 2020.",
    className: "md:col-span-2",
    thumbnail: "/exp3.svg",
  },
  {
    id: 4,
    title: "Junior → Frontend Developer — 111Minutes & Soulmates",
    desc: "Built websites and SPAs with ReactJS, ES6 and Sass; converted designs into responsive themes. 2016 – 2018.",
    className: "md:col-span-2",
    thumbnail: "/exp4.svg",
  },
];

export const socialMedia = [
  {
    id: 1,
    img: "/git.svg",
    link: "https://github.com/",
  },
  {
    id: 2,
    img: "/twit.svg",
    link: "https://twitter.com/",
  },
  {
    id: 3,
    img: "/link.svg",
    link: "https://www.linkedin.com/in/mcmaxwelll/",
  },
];

/**
 * Seed script: create a batch of varied UAT profiles and publish their pages.
 *
 * Usage:
 *   EXTENDED_SECTIONS=true INVITE_CODES=code1 npx tsx scripts/seed-uat-profiles.ts
 *   EXTENDED_SECTIONS=true INVITE_CODES=code1 npx tsx scripts/seed-uat-profiles.ts --count=10 --tag=round1
 *
 * Outputs:
 *   - docs/uat/profiles/latest.json
 *   - docs/uat/profiles/latest.md
 *   - docs/uat/profiles/<timestamp>-<tag>.json
 *   - docs/uat/profiles/<timestamp>-<tag>.md
 *   - screenshot/uat-profiles-<timestamp>-<tag>/*.png
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/index";
import { facts } from "../src/lib/db/schema";
import { composeOptimisticPage } from "../src/lib/services/page-composer";
import { upsertDraft, requestPublish, confirmPublish } from "../src/lib/services/page-service";
import { isUsernameTaken, registerUsername } from "../src/lib/services/session-service";
import { updateSoulOverlay, type SoulOverlay } from "../src/lib/services/soul-service";
import { saveMemory, type MemoryType } from "../src/lib/services/memory-service";
import {
  createUser,
  createProfile,
  linkProfileToUser,
  setProfileUsername,
  createAuthSession,
  isEmailTaken,
} from "../src/lib/services/auth-service";
import type { LayoutTemplateId } from "../src/lib/layout/contracts";
import type { AvailableTheme } from "../src/lib/page-config/schema";


type ExperienceInput = {
  role: string;
  company: string;
  period: string;
  description: string;
  current?: boolean;
};

type EducationInput = {
  institution: string;
  degree?: string;
  field?: string;
  period?: string;
  description?: string;
};

type ProjectInput = {
  title: string;
  description: string;
  url?: string;
  tags?: string[];
};

type InterestInput = {
  name: string;
  detail?: string;
};

type ActivityInput = {
  name: string;
  activityType: string;
  frequency: string;
  description?: string;
};

type AchievementInput = {
  title: string;
  description?: string;
  date?: string;
  issuer?: string;
};

type StatInput = {
  label: string;
  value: string;
};

type SocialInput = {
  platform: string;
  url: string;
  label?: string;
};

type ReadingInput = {
  title: string;
  author?: string;
  note?: string;
};

type MusicInput = {
  title: string;
  artist?: string;
  note?: string;
};

type LanguageInput = {
  language: string;
  proficiency: string;
};

type ProfileBlueprint = {
  id: string;
  displayName: string;
  usernameBase: string;
  emailLocal: string;
  language: string;
  layoutTemplate: LayoutTemplateId;
  theme: AvailableTheme;
  style?: {
    colorScheme?: "light" | "dark";
    primaryColor?: string;
    fontFamily?: string;
    layout?: "centered" | "split" | "stack";
  };
  identity: {
    role: string;
    tagline: string;
    location: string;
    bio: string;
  };
  experience: ExperienceInput[];
  education?: EducationInput[];
  skills?: string[];
  projects?: ProjectInput[];
  interests?: InterestInput[];
  activities?: ActivityInput[];
  achievements?: AchievementInput[];
  stats?: StatInput[];
  social?: SocialInput[];
  reading?: ReadingInput[];
  music?: MusicInput[];
  spokenLanguages?: LanguageInput[];
  memories?: string[];
  soul: SoulOverlay;
};

type CreatedProfileRecord = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  password: string;
  language: string;
  layoutTemplate: LayoutTemplateId;
  theme: AvailableTheme;
  factCount: number;
  sectionCount: number;
  publishedUrl: string;
  loginUrl: string;
  builderUrl: string;
};

const PROFILE_BLUEPRINTS: ProfileBlueprint[] = [
  {
    id: "ava-engineer",
    displayName: "Ava Stone",
    usernameBase: "ava-stone",
    emailLocal: "ava.stone",
    language: "en",
    layoutTemplate: "architect",
    theme: "editorial-360",
    style: {
      colorScheme: "light",
      primaryColor: "#0f172a",
      fontFamily: "Merriweather",
      layout: "centered",
    },
    identity: {
      role: "Staff Platform Engineer",
      tagline: "Designing reliable systems for distributed product teams",
      location: "Austin, Texas",
      bio: "Platform engineer focused on developer productivity, observability, and shipping safely at scale. Mentors early-career engineers and runs internal architecture clinics.",
    },
    experience: [
      {
        role: "Staff Platform Engineer",
        company: "Northline",
        period: "2023 - Present",
        description: "Led migration from monolith deploy pipeline to service-oriented release trains. Reduced failed deploys by 41 percent and cut rollback time under 3 minutes.",
        current: true,
      },
      {
        role: "Senior Site Reliability Engineer",
        company: "Cloudyard",
        period: "2020 - 2023",
        description: "Built incident command playbooks and service-level objective tooling used by 18 squads.",
      },
      {
        role: "Software Engineer",
        company: "Waypoint Labs",
        period: "2017 - 2020",
        description: "Owned internal developer portal and release automation scripts.",
      },
    ],
    education: [
      {
        institution: "University of Illinois Urbana-Champaign",
        degree: "B.S.",
        field: "Computer Engineering",
        period: "2013 - 2017",
      },
    ],
    skills: [
      "TypeScript",
      "Go",
      "Kubernetes",
      "PostgreSQL",
      "Terraform",
      "Observability",
      "Incident Response",
      "CI/CD",
      "Distributed Systems",
    ],
    projects: [
      {
        title: "Deploy Radar",
        description: "Internal release risk dashboard that maps change size to incident probability.",
        url: "https://github.com/ava-stone/deploy-radar",
        tags: ["Go", "SRE", "Dashboards"],
      },
      {
        title: "Error Budget Coach",
        description: "Slack bot that nudges teams when SLO burn accelerates.",
        url: "https://github.com/ava-stone/error-budget-coach",
        tags: ["TypeScript", "Slack", "Ops"],
      },
      {
        title: "Chaos Notes",
        description: "Template kit for lightweight chaos game days and postmortems.",
        tags: ["Reliability", "Playbooks"],
      },
    ],
    interests: [
      { name: "Reliability engineering", detail: "Error budgets and graceful degradation" },
      { name: "Knowledge systems", detail: "Living docs for engineering teams" },
      { name: "Trail running", detail: "Weekend hill routes" },
      { name: "Mechanical keyboards", detail: "Build and tune custom boards" },
    ],
    activities: [
      {
        name: "Architecture Office Hours",
        activityType: "community",
        frequency: "biweekly",
        description: "Hosts 60-minute sessions to help teams review system tradeoffs.",
      },
      {
        name: "Trail Running Club",
        activityType: "sport",
        frequency: "weekly",
        description: "Group long run every Saturday morning.",
      },
    ],
    achievements: [
      {
        title: "Engineering Impact Award",
        description: "Recognized for reducing incident volume across three quarters.",
        date: "2025",
        issuer: "Northline",
      },
      {
        title: "SRE Conf Speaker",
        description: "Talk: Practical SLO adoption in product organizations.",
        date: "2024",
      },
    ],
    stats: [
      { label: "Services Supported", value: "37" },
      { label: "P1 Incidents Reduced", value: "41%" },
      { label: "Mentored Engineers", value: "12" },
    ],
    social: [
      { platform: "GitHub", url: "https://github.com/ava-stone", label: "ava-stone" },
      { platform: "LinkedIn", url: "https://linkedin.com/in/ava-stone", label: "ava-stone" },
      { platform: "Website", url: "https://avastone.dev", label: "avastone.dev" },
    ],
    reading: [
      {
        title: "Accelerate",
        author: "Forsgren, Humble, Kim",
        note: "Still the cleanest data-backed framework for delivery performance.",
      },
      {
        title: "Team Topologies",
        author: "Skelton, Pais",
        note: "Useful for platform ownership boundaries.",
      },
    ],
    music: [
      { title: "The New Abnormal", artist: "The Strokes", note: "Focus mode album" },
      { title: "Immunity", artist: "Jon Hopkins", note: "Deep work soundtrack" },
    ],
    spokenLanguages: [
      { language: "English", proficiency: "native" },
      { language: "Spanish", proficiency: "conversational" },
    ],
    memories: [
      "Prefers concise copy and dislikes inflated claims in bios.",
      "Asks for measurable outcomes before accepting architecture proposals.",
      "Frequently updates projects section after each quarter review.",
      "Wants public page to feel useful to hiring managers and peers.",
      "Has strong preference for practical examples over abstract concepts.",
    ],
    soul: {
      voice: "Grounded engineer with a practical teaching style",
      tone: "Direct, clear, and low drama",
      values: [
        "Reliability over novelty",
        "Transparent decision making",
        "Mentorship as leverage",
      ],
      selfDescription: "I build stable systems and help teams ship with confidence.",
      communicationStyle: "Short paragraphs, specific metrics, and concrete tradeoffs.",
    },
  },
  {
    id: "marco-designer",
    displayName: "Marco Rinaldi",
    usernameBase: "marco-rinaldi",
    emailLocal: "marco.rinaldi",
    language: "it",
    layoutTemplate: "curator",
    theme: "warm",
    style: {
      colorScheme: "light",
      primaryColor: "#7a3e2b",
      fontFamily: "Lora",
      layout: "split",
    },
    identity: {
      role: "Lead Product Designer",
      tagline: "Trasformo processi complessi in esperienze semplici",
      location: "Milano, Italia",
      bio: "Designer di prodotto con focus su flussi ad alta complessita. Lavoro tra ricerca utenti, design system e delivery con team cross-funzionali.",
    },
    experience: [
      {
        role: "Lead Product Designer",
        company: "Banca Nova",
        period: "2022 - Presente",
        description: "Ha guidato il redesign end-to-end dell'onboarding digitale, riducendo l'abbandono del 28 percento.",
        current: true,
      },
      {
        role: "Senior UX Designer",
        company: "Shopio",
        period: "2019 - 2022",
        description: "Ha costruito un design system modulare adottato da 9 product team.",
      },
      {
        role: "Interaction Designer",
        company: "Studio Forma",
        period: "2016 - 2019",
        description: "Ha progettato prodotti B2B per logistica e retail.",
      },
    ],
    education: [
      {
        institution: "Politecnico di Milano",
        degree: "M.Sc.",
        field: "Design della Comunicazione",
        period: "2014 - 2016",
      },
      {
        institution: "IUAV Venezia",
        degree: "B.A.",
        field: "Disegno Industriale",
        period: "2011 - 2014",
      },
    ],
    skills: [
      "Product Design",
      "Service Design",
      "Design Systems",
      "Figma",
      "Research Ops",
      "Journey Mapping",
      "Usability Testing",
      "Design Leadership",
    ],
    projects: [
      {
        title: "Onboarding Banking Reboot",
        description: "Percorso multicanale con verifica identita e firma digitale in meno di 7 minuti.",
        tags: ["Fintech", "UX", "Service Design"],
      },
      {
        title: "Systeme UI Nova",
        description: "Libreria componenti con governance condivisa tra design e front-end.",
        tags: ["Design System", "Governance"],
      },
      {
        title: "Research Wall",
        description: "Template e rituali per rendere riusabili gli insight qualitativi.",
        url: "https://marcorinaldi.design/research-wall",
      },
    ],
    interests: [
      { name: "Information architecture", detail: "Navigazione e tassonomie" },
      { name: "Behavioral design", detail: "Decisioni e frizioni sane" },
      { name: "Art direction", detail: "Poster design e tipografia" },
      { name: "Urban sketching", detail: "Disegno dal vero" },
    ],
    activities: [
      {
        name: "Design Critique Circle",
        activityType: "community",
        frequency: "weekly",
        description: "Sessione aperta con designer junior e mid.",
      },
      {
        name: "Guest Lectures",
        activityType: "teaching",
        frequency: "monthly",
        description: "Lezioni su product thinking in scuole di design.",
      },
    ],
    achievements: [
      {
        title: "IF Design Award Shortlist",
        description: "Progetto onboarding fintech selezionato in shortlist.",
        date: "2024",
      },
      {
        title: "Best Internal Mentor",
        description: "Riconoscimento annuale per mentoring cross-team.",
        date: "2023",
        issuer: "Banca Nova",
      },
    ],
    stats: [
      { label: "User Interviews", value: "180+" },
      { label: "Drop-off Reduced", value: "28%" },
      { label: "Teams Using DS", value: "9" },
    ],
    social: [
      { platform: "LinkedIn", url: "https://linkedin.com/in/marco-rinaldi", label: "marco-rinaldi" },
      { platform: "Dribbble", url: "https://dribbble.com/marcorinaldi", label: "marcorinaldi" },
      { platform: "Website", url: "https://marcorinaldi.design", label: "marcorinaldi.design" },
    ],
    reading: [
      { title: "The Design of Everyday Things", author: "Don Norman" },
      { title: "MaaS and UX", author: "Various", note: "Case studies su mobilita urbana" },
    ],
    music: [
      { title: "La voce del padrone", artist: "Franco Battiato" },
      { title: "In Between Dreams", artist: "Jack Johnson" },
    ],
    spokenLanguages: [
      { language: "Italian", proficiency: "native" },
      { language: "English", proficiency: "fluent" },
      { language: "French", proficiency: "intermediate" },
    ],
    memories: [
      "Preferisce testi con ritmo naturale, evitando termini troppo tecnici.",
      "Rivede spesso la sezione esperienza per migliorare la chiarezza narrativa.",
      "Chiede esempi visivi concreti quando si discute di layout.",
      "Valuta molto la coerenza tra tono della pagina e personalita reale.",
      "Non vuole frasi autocelebrative senza evidenze.",
    ],
    soul: {
      voice: "Designer strategico con sensibilita editoriale",
      tone: "Empatico ma preciso",
      values: ["Chiarezza", "Responsabilita del design", "Inclusivita"],
      selfDescription: "Progetto esperienze che fanno risparmiare tempo e stress alle persone.",
      communicationStyle: "Narrazione lineare, esempi pratici e linguaggio accessibile.",
    },
  },
  {
    id: "lena-data",
    displayName: "Lena Fischer",
    usernameBase: "lena-fischer",
    emailLocal: "lena.fischer",
    language: "de",
    layoutTemplate: "monolith",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#1f2937",
      fontFamily: "Source Serif 4",
      layout: "centered",
    },
    identity: {
      role: "Climate Data Scientist",
      tagline: "Turning messy geospatial data into actionable climate insights",
      location: "Hamburg, Germany",
      bio: "Data scientist specializing in climate risk models, geospatial pipelines, and uncertainty communication for policy teams.",
    },
    experience: [
      {
        role: "Climate Data Scientist",
        company: "BlueCurrent Institute",
        period: "2021 - Present",
        description: "Built flood-risk forecasting models for municipal adaptation plans.",
        current: true,
      },
      {
        role: "Research Analyst",
        company: "GeoSense Lab",
        period: "2018 - 2021",
        description: "Developed satellite-derived drought indicators and public dashboards.",
      },
    ],
    education: [
      {
        institution: "ETH Zurich",
        degree: "M.Sc.",
        field: "Environmental Systems Science",
        period: "2016 - 2018",
      },
      {
        institution: "University of Freiburg",
        degree: "B.Sc.",
        field: "Geography",
        period: "2012 - 2016",
      },
    ],
    skills: [
      "Python",
      "Geospatial Analysis",
      "xarray",
      "Pandas",
      "Machine Learning",
      "Uncertainty Modeling",
      "Data Visualization",
      "Public Policy",
    ],
    projects: [
      {
        title: "City Flood Atlas",
        description: "Open dashboard for neighborhood-level flood vulnerability.",
        url: "https://github.com/lenaf/city-flood-atlas",
        tags: ["Python", "GIS", "Public Data"],
      },
      {
        title: "Heatwave Alert Toolkit",
        description: "Reusable pipeline for short-term heat stress indicators.",
        tags: ["Forecasting", "Climate"],
      },
    ],
    interests: [
      { name: "Climate adaptation", detail: "Local resilience planning" },
      { name: "Open science", detail: "Transparent reproducible workflows" },
      { name: "Data storytelling", detail: "Communicating uncertainty clearly" },
    ],
    activities: [
      {
        name: "Civic Data Workshops",
        activityType: "community",
        frequency: "monthly",
        description: "Teaches city staff how to read model outputs responsibly.",
      },
    ],
    achievements: [
      {
        title: "Open Data Impact Prize",
        description: "Awarded for public flood atlas adoption by three cities.",
        date: "2025",
      },
    ],
    stats: [
      { label: "Datasets Maintained", value: "22" },
      { label: "Municipal Partners", value: "14" },
      { label: "Forecast Accuracy Gain", value: "+18%" },
    ],
    social: [
      { platform: "GitHub", url: "https://github.com/lenaf", label: "lenaf" },
      { platform: "LinkedIn", url: "https://linkedin.com/in/lena-fischer", label: "lena-fischer" },
    ],
    reading: [
      { title: "The Signal and the Noise", author: "Nate Silver" },
      { title: "Data Feminism", author: "D'Ignazio and Klein" },
    ],
    music: [
      { title: "Untrue", artist: "Burial" },
    ],
    spokenLanguages: [
      { language: "German", proficiency: "native" },
      { language: "English", proficiency: "fluent" },
    ],
    memories: [
      "Wants explanations that highlight assumptions and uncertainty boundaries.",
      "Avoids sensational language when presenting climate projections.",
      "Prefers plots and numbers over adjectives.",
      "Updates stats section regularly after each policy cycle.",
      "Values reproducibility and source links.",
    ],
    soul: {
      voice: "Analytical and calm",
      tone: "Precise, transparent, and science-first",
      values: ["Integrity", "Open data", "Public usefulness"],
      selfDescription: "I translate complex climate data into decisions people can actually use.",
      communicationStyle: "Clear claims, explicit caveats, and concise summaries.",
    },
  },
  {
    id: "sofia-growth",
    displayName: "Sofia Alvarez",
    usernameBase: "sofia-alvarez",
    emailLocal: "sofia.alvarez",
    language: "es",
    layoutTemplate: "architect",
    theme: "editorial-360",
    style: {
      colorScheme: "light",
      primaryColor: "#9a3412",
      fontFamily: "Libre Baskerville",
      layout: "stack",
    },
    identity: {
      role: "Growth Marketing Lead",
      tagline: "Building measurable growth loops for mission-driven products",
      location: "Madrid, Spain",
      bio: "Growth lead with a background in content strategy and experimentation. Focused on full-funnel systems and retention-driven campaigns.",
    },
    experience: [
      {
        role: "Growth Marketing Lead",
        company: "Nexo Health",
        period: "2023 - Present",
        description: "Built lifecycle program that increased 90-day retention by 22 percent.",
        current: true,
      },
      {
        role: "Senior Growth Manager",
        company: "Atlas Learning",
        period: "2020 - 2023",
        description: "Scaled acquisition from 0 to 350k annual organic visitors.",
      },
      {
        role: "Content Strategist",
        company: "Pixel Norte",
        period: "2017 - 2020",
        description: "Led editorial programs for SaaS startups in health and education.",
      },
    ],
    education: [
      {
        institution: "Universidad Carlos III de Madrid",
        degree: "M.A.",
        field: "Digital Communication",
        period: "2015 - 2017",
      },
    ],
    skills: [
      "Growth Strategy",
      "Experimentation",
      "Lifecycle Marketing",
      "SEO",
      "Copywriting",
      "Attribution",
      "Looker",
      "CRM Automation",
    ],
    projects: [
      {
        title: "Retention Loop Playbook",
        description: "Framework to align product, lifecycle, and support touchpoints.",
        tags: ["Growth", "Retention"],
      },
      {
        title: "Experiment Scorecard",
        description: "Prioritization model that balances impact, effort, and learning value.",
        url: "https://github.com/sofiaa/experiment-scorecard",
        tags: ["Analytics", "Decisioning"],
      },
      {
        title: "Health Content Engine",
        description: "Editorial pipeline for evidence-backed articles mapped to funnel stages.",
      },
    ],
    interests: [
      { name: "Behavioral economics", detail: "Choice architecture in digital products" },
      { name: "Community-led growth", detail: "Programs that compound over time" },
      { name: "Longform interviews", detail: "Founder and user stories" },
      { name: "Pilates", detail: "Morning routine" },
    ],
    activities: [
      {
        name: "Mentoring marketers",
        activityType: "community",
        frequency: "weekly",
        description: "Supports early-stage teams with experiment design.",
      },
      {
        name: "Newsletter writing",
        activityType: "writing",
        frequency: "biweekly",
        description: "Writes practical growth teardown notes.",
      },
    ],
    achievements: [
      {
        title: "Growth Team of the Year",
        description: "Recognized for cross-functional growth operating model.",
        date: "2025",
        issuer: "Nexo Health",
      },
      {
        title: "Top 20 Women in Growth",
        date: "2024",
      },
    ],
    stats: [
      { label: "Experiments Run", value: "146" },
      { label: "Retention Lift", value: "+22%" },
      { label: "Newsletter Readers", value: "18k" },
    ],
    social: [
      { platform: "LinkedIn", url: "https://linkedin.com/in/sofia-alvarez", label: "sofia-alvarez" },
      { platform: "X", url: "https://x.com/sofia_growth", label: "@sofia_growth" },
      { platform: "Website", url: "https://sofiaalvarez.io", label: "sofiaalvarez.io" },
    ],
    reading: [
      { title: "Obviously Awesome", author: "April Dunford" },
      { title: "Thinking, Fast and Slow", author: "Daniel Kahneman" },
    ],
    music: [
      { title: "El Madrileno", artist: "C. Tangana" },
      { title: "Future Nostalgia", artist: "Dua Lipa" },
    ],
    spokenLanguages: [
      { language: "Spanish", proficiency: "native" },
      { language: "English", proficiency: "fluent" },
      { language: "Portuguese", proficiency: "intermediate" },
    ],
    memories: [
      "Always asks for baseline and control before discussing results.",
      "Prefers copy with concrete verbs and no buzzwords.",
      "Iterates frequently on hero tagline.",
      "Wants project descriptions tied to measurable outcomes.",
      "Values ethical growth and user trust.",
    ],
    soul: {
      voice: "Energetic strategist",
      tone: "Confident, practical, and user-respectful",
      values: ["Evidence", "Ethical growth", "Cross-team collaboration"],
      selfDescription: "I build growth systems that scale without sacrificing trust.",
      communicationStyle: "Outcome-first summaries with clear next actions.",
    },
  },
  {
    id: "priya-devrel",
    displayName: "Priya Nair",
    usernameBase: "priya-nair",
    emailLocal: "priya.nair",
    language: "en",
    layoutTemplate: "curator",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#0b5cab",
      fontFamily: "IBM Plex Serif",
      layout: "split",
    },
    identity: {
      role: "Developer Relations Engineer",
      tagline: "Helping developers ship faster with better docs and tooling",
      location: "Bengaluru, India",
      bio: "DevRel engineer bridging product, docs, and community. Builds reference apps, teaches workshops, and turns support pain points into roadmap inputs.",
    },
    experience: [
      {
        role: "Developer Relations Engineer",
        company: "GraphArc",
        period: "2022 - Present",
        description: "Launched sample app program and monthly office hours that cut time-to-first-success by 35 percent.",
        current: true,
      },
      {
        role: "Technical Writer",
        company: "Cloudline",
        period: "2019 - 2022",
        description: "Rebuilt API docs information architecture and migration guides.",
      },
      {
        role: "Software Engineer",
        company: "ByteNest",
        period: "2016 - 2019",
        description: "Worked on SDK integrations and support tooling.",
      },
    ],
    education: [
      {
        institution: "National Institute of Technology, Trichy",
        degree: "B.Tech",
        field: "Computer Science",
        period: "2012 - 2016",
      },
    ],
    skills: [
      "API Design",
      "Technical Writing",
      "TypeScript",
      "Node.js",
      "Community Programs",
      "Docs IA",
      "Public Speaking",
      "DX Research",
    ],
    projects: [
      {
        title: "Starter Kit Index",
        description: "Curated collection of starter repos across frameworks and languages.",
        url: "https://github.com/priyanair/starter-kit-index",
      },
      {
        title: "Doc Drift Detector",
        description: "CI check that flags docs sections outdated after API changes.",
        tags: ["DX", "Automation"],
      },
      {
        title: "Office Hours Playbook",
        description: "Repeatable format for product-aware community support sessions.",
      },
    ],
    interests: [
      { name: "Developer experience", detail: "Reducing setup friction" },
      { name: "Community building", detail: "Sustainable support loops" },
      { name: "Documentation craft", detail: "Examples that actually run" },
    ],
    activities: [
      {
        name: "Webinars",
        activityType: "teaching",
        frequency: "monthly",
        description: "Live coding sessions for integration patterns.",
      },
      {
        name: "Community office hours",
        activityType: "community",
        frequency: "weekly",
      },
    ],
    achievements: [
      {
        title: "DX Excellence Award",
        issuer: "GraphArc",
        date: "2025",
      },
    ],
    stats: [
      { label: "Sample Apps Published", value: "24" },
      { label: "Workshop Attendees", value: "4.2k" },
      { label: "TTFS Improvement", value: "35%" },
    ],
    social: [
      { platform: "GitHub", url: "https://github.com/priyanair", label: "priyanair" },
      { platform: "LinkedIn", url: "https://linkedin.com/in/priya-nair", label: "priya-nair" },
      { platform: "YouTube", url: "https://youtube.com/@priyanairdev", label: "@priyanairdev" },
    ],
    reading: [
      { title: "Docs for Developers", author: "Jared Bhatti" },
      { title: "The Making of a Manager", author: "Julie Zhuo" },
    ],
    music: [
      { title: "When We All Fall Asleep", artist: "Billie Eilish" },
    ],
    spokenLanguages: [
      { language: "English", proficiency: "fluent" },
      { language: "Hindi", proficiency: "native" },
      { language: "Malayalam", proficiency: "native" },
    ],
    memories: [
      "Prefers examples that developers can copy and run in under five minutes.",
      "Asks for pragmatic checklists rather than long conceptual intros.",
      "Likes conversational but technically precise tone.",
      "Updates reading section with books about teaching and communication.",
      "Wants profile to show both engineering depth and community impact.",
    ],
    soul: {
      voice: "Helpful engineer-teacher",
      tone: "Friendly and concrete",
      values: ["Accessibility", "Clarity", "Community care"],
      selfDescription: "I make technical products easier to adopt and easier to trust.",
      communicationStyle: "Step-by-step examples, short sentences, and clear caveats.",
    },
  },
  {
    id: "malik-security",
    displayName: "Malik Johnson",
    usernameBase: "malik-johnson",
    emailLocal: "malik.johnson",
    language: "en",
    layoutTemplate: "monolith",
    theme: "editorial-360",
    style: {
      colorScheme: "light",
      primaryColor: "#111827",
      fontFamily: "Spectral",
      layout: "centered",
    },
    identity: {
      role: "Senior Security Analyst",
      tagline: "Practical security programs that teams actually adopt",
      location: "Chicago, Illinois",
      bio: "Security analyst focused on detection engineering, threat modeling, and secure SDLC coaching for product teams.",
    },
    experience: [
      {
        role: "Senior Security Analyst",
        company: "HelixPay",
        period: "2022 - Present",
        description: "Built detection-as-code workflows and reduced mean-time-to-contain by 46 percent.",
        current: true,
      },
      {
        role: "Security Engineer",
        company: "Mosaic Cloud",
        period: "2019 - 2022",
        description: "Implemented baseline threat modeling for all new product launches.",
      },
      {
        role: "IT Auditor",
        company: "Grant and Pike",
        period: "2016 - 2019",
        description: "Performed SOC2 and ISO27001 readiness assessments.",
      },
    ],
    education: [
      {
        institution: "DePaul University",
        degree: "B.S.",
        field: "Information Assurance",
        period: "2012 - 2016",
      },
    ],
    skills: [
      "Threat Modeling",
      "Detection Engineering",
      "SIEM",
      "Incident Response",
      "Cloud Security",
      "SOC2",
      "Security Awareness",
      "Risk Assessment",
    ],
    projects: [
      {
        title: "Runbook Library",
        description: "Incident runbooks for auth abuse, API key leaks, and account takeovers.",
      },
      {
        title: "Security Champion Toolkit",
        description: "Playbook for embedding security reps inside product squads.",
      },
    ],
    interests: [
      { name: "Security culture", detail: "Habits over fear-based training" },
      { name: "Fraud prevention", detail: "Signals and behavior modeling" },
      { name: "Community mentoring", detail: "Career support for new analysts" },
    ],
    activities: [
      {
        name: "Blue Team Labs",
        activityType: "community",
        frequency: "weekly",
      },
      {
        name: "Mentorship",
        activityType: "community",
        frequency: "biweekly",
        description: "Mentors analysts transitioning from IT support roles.",
      },
    ],
    achievements: [
      {
        title: "Security Program MVP",
        issuer: "HelixPay",
        date: "2025",
      },
      {
        title: "SANS Scholarship Recipient",
        date: "2021",
      },
    ],
    stats: [
      { label: "MTTC Improvement", value: "46%" },
      { label: "Critical Findings Closed", value: "312" },
      { label: "Security Champions", value: "26" },
    ],
    social: [
      { platform: "LinkedIn", url: "https://linkedin.com/in/malik-johnson", label: "malik-johnson" },
      { platform: "GitHub", url: "https://github.com/maliksec", label: "maliksec" },
    ],
    reading: [
      { title: "The Cuckoo's Egg", author: "Cliff Stoll" },
      { title: "Blue Team Handbook", author: "Don Murdoch" },
    ],
    spokenLanguages: [
      { language: "English", proficiency: "native" },
    ],
    memories: [
      "Rejects fear-based messaging; prefers practical risk framing.",
      "Focuses on what teams can do this sprint, not abstract security ideals.",
      "Prefers tight bullets over long narrative blocks.",
      "Wants clear ownership in every project description.",
      "Emphasizes collaborative security, not gatekeeping.",
    ],
    soul: {
      voice: "Calm operator",
      tone: "Firm, practical, and collaborative",
      values: ["Trust", "Preparedness", "Shared responsibility"],
      selfDescription: "I help teams build secure habits that survive real deadlines.",
      communicationStyle: "Action-oriented bullets with explicit risk context.",
    },
  },
  {
    id: "elise-sustainability",
    displayName: "Elise Dubois",
    usernameBase: "elise-dubois",
    emailLocal: "elise.dubois",
    language: "fr",
    layoutTemplate: "curator",
    theme: "warm",
    style: {
      colorScheme: "light",
      primaryColor: "#14532d",
      fontFamily: "Cormorant Garamond",
      layout: "split",
    },
    identity: {
      role: "Sustainability Program Consultant",
      tagline: "Helping operations teams turn ESG goals into executable roadmaps",
      location: "Lyon, France",
      bio: "Consultant working with manufacturing and logistics companies on emissions baselines, transition plans, and stakeholder reporting.",
    },
    experience: [
      {
        role: "Sustainability Program Consultant",
        company: "GreenRoute Advisory",
        period: "2021 - Present",
        description: "Designed emissions reduction roadmaps across 11 industrial sites.",
        current: true,
      },
      {
        role: "Operations Analyst",
        company: "TransLigne",
        period: "2017 - 2021",
        description: "Led process efficiency initiatives and supplier audits.",
      },
    ],
    education: [
      {
        institution: "EM Lyon",
        degree: "M.Sc.",
        field: "Sustainable Management",
        period: "2015 - 2017",
      },
    ],
    skills: [
      "ESG Reporting",
      "Carbon Accounting",
      "Stakeholder Facilitation",
      "Program Management",
      "Supply Chain",
      "Materiality Assessment",
      "Change Management",
    ],
    projects: [
      {
        title: "Factory Decarbonization Sprint",
        description: "90-day program to identify top emissions hotspots and quick wins.",
      },
      {
        title: "Supplier Transparency Toolkit",
        description: "Questionnaire + scoring method for upstream sustainability risk.",
      },
      {
        title: "Board ESG Briefing Pack",
        description: "Template pack for quarterly executive updates.",
      },
    ],
    interests: [
      { name: "Circular economy", detail: "Designing for longer product life" },
      { name: "Industrial policy", detail: "Public-private transition models" },
      { name: "Community gardens", detail: "Local food systems" },
    ],
    activities: [
      {
        name: "Climate roundtables",
        activityType: "community",
        frequency: "monthly",
      },
      {
        name: "University guest talks",
        activityType: "teaching",
        frequency: "quarterly",
      },
    ],
    achievements: [
      {
        title: "Top Sustainability Advisor",
        issuer: "Operations Leaders Forum",
        date: "2025",
      },
    ],
    stats: [
      { label: "Sites Supported", value: "11" },
      { label: "Programs Delivered", value: "34" },
      { label: "Average Energy Savings", value: "19%" },
    ],
    social: [
      { platform: "LinkedIn", url: "https://linkedin.com/in/elise-dubois", label: "elise-dubois" },
      { platform: "Website", url: "https://elisedubois.consulting", label: "elisedubois.consulting" },
    ],
    reading: [
      { title: "Doughnut Economics", author: "Kate Raworth" },
      { title: "Net Positive", author: "Andrew Winston" },
    ],
    music: [
      { title: "Parachutes", artist: "Coldplay" },
    ],
    spokenLanguages: [
      { language: "French", proficiency: "native" },
      { language: "English", proficiency: "fluent" },
    ],
    memories: [
      "Prefers balanced communication that avoids alarmist framing.",
      "Uses examples from operations rather than abstract policy terms.",
      "Frequently revises bio for clarity with non-technical audiences.",
      "Wants projects framed around execution, not only vision.",
      "Values cross-functional coordination language.",
    ],
    soul: {
      voice: "Strategic advisor with operational grounding",
      tone: "Measured and constructive",
      values: ["Pragmatism", "Long-term thinking", "Collective accountability"],
      selfDescription: "I help organizations move from sustainability intent to operational change.",
      communicationStyle: "Structured narratives with clear milestones and owners.",
    },
  },
  {
    id: "kenji-robotics",
    displayName: "Kenji Sato",
    usernameBase: "kenji-sato",
    emailLocal: "kenji.sato",
    language: "ja",
    layoutTemplate: "architect",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#1d4ed8",
      fontFamily: "Noto Serif",
      layout: "centered",
    },
    identity: {
      role: "Robotics Systems Engineer",
      tagline: "Shipping dependable robotics software from prototype to factory floor",
      location: "Yokohama, Japan",
      bio: "Robotics engineer working across motion planning, safety validation, and production deployment for warehouse automation.",
    },
    experience: [
      {
        role: "Robotics Systems Engineer",
        company: "Kairo Automation",
        period: "2022 - Present",
        description: "Owns integration of perception stack with fleet orchestration in mixed-traffic facilities.",
        current: true,
      },
      {
        role: "Controls Engineer",
        company: "Nexa Robotics",
        period: "2018 - 2022",
        description: "Developed calibration workflows and simulation test benches.",
      },
    ],
    education: [
      {
        institution: "University of Tokyo",
        degree: "M.Eng",
        field: "Mechanical and Intelligent Systems",
        period: "2016 - 2018",
      },
    ],
    skills: [
      "ROS2",
      "C++",
      "Python",
      "Motion Planning",
      "Computer Vision",
      "Embedded Linux",
      "Simulation",
      "Functional Safety",
    ],
    projects: [
      {
        title: "Warehouse Twin",
        description: "Simulation environment for evaluating routing and congestion behavior.",
        tags: ["Robotics", "Simulation"],
      },
      {
        title: "Fleet Health Monitor",
        description: "Predictive diagnostics dashboard for autonomous carts.",
      },
      {
        title: "Safety Validation Kit",
        description: "Test harness for edge-case scenario replay.",
      },
    ],
    interests: [
      { name: "Human-robot interaction", detail: "Safer shared spaces" },
      { name: "Industrial design", detail: "Hardware ergonomics" },
      { name: "Film photography", detail: "35mm street scenes" },
    ],
    activities: [
      {
        name: "Robotics meetup speaker",
        activityType: "community",
        frequency: "monthly",
      },
      {
        name: "Mentor interns",
        activityType: "teaching",
        frequency: "quarterly",
      },
    ],
    achievements: [
      {
        title: "Factory Innovation Award",
        issuer: "Kairo Automation",
        date: "2025",
      },
    ],
    stats: [
      { label: "Robots in Production", value: "420" },
      { label: "Deployment Sites", value: "17" },
      { label: "Safety Incidents", value: "0 major" },
    ],
    social: [
      { platform: "GitHub", url: "https://github.com/kenjisato", label: "kenjisato" },
      { platform: "LinkedIn", url: "https://linkedin.com/in/kenji-sato", label: "kenji-sato" },
    ],
    reading: [
      { title: "Probabilistic Robotics", author: "Thrun, Burgard, Fox" },
      { title: "Designing Machine Learning Systems", author: "Chip Huyen" },
    ],
    spokenLanguages: [
      { language: "Japanese", proficiency: "native" },
      { language: "English", proficiency: "fluent" },
    ],
    memories: [
      "Prefers plain language over academic jargon when describing robotics work.",
      "Wants reliability and safety outcomes visible above technical stack details.",
      "Uses project pages to explain real-world constraints.",
      "Values concise writing and avoids hype terms.",
      "Requests diagrams or structured bullets when explaining system behavior.",
    ],
    soul: {
      voice: "Methodical engineer",
      tone: "Calm and exact",
      values: ["Safety", "Craft", "Continuous improvement"],
      selfDescription: "I build robotics systems that perform reliably in messy real environments.",
      communicationStyle: "Compact explanations with explicit assumptions and boundaries.",
    },
  },
  {
    id: "carla-chef",
    displayName: "Carla Mendes",
    usernameBase: "carla-mendes",
    emailLocal: "carla.mendes",
    language: "pt",
    layoutTemplate: "monolith",
    theme: "warm",
    style: {
      colorScheme: "light",
      primaryColor: "#9f1239",
      fontFamily: "Playfair Display",
      layout: "stack",
    },
    identity: {
      role: "Chef and Food Studio Founder",
      tagline: "Seasonal cuisine, storytelling menus, and community dinners",
      location: "Porto, Portugal",
      bio: "Chef and entrepreneur running a small studio that blends modern Portuguese cuisine with local sourcing and educational workshops.",
    },
    experience: [
      {
        role: "Founder and Head Chef",
        company: "Mesa Clara Studio",
        period: "2021 - Present",
        description: "Runs tasting events, private dining, and culinary workshops with a seasonal menu program.",
        current: true,
      },
      {
        role: "Sous Chef",
        company: "Casa do Norte",
        period: "2017 - 2021",
        description: "Managed prep team and supplier relations for farm-to-table restaurant operations.",
      },
    ],
    education: [
      {
        institution: "Escola de Hotelaria e Turismo do Porto",
        degree: "Diploma",
        field: "Culinary Arts",
        period: "2014 - 2016",
      },
    ],
    skills: [
      "Menu Design",
      "Seasonal Sourcing",
      "Team Leadership",
      "Food Styling",
      "Workshop Facilitation",
      "Cost Control",
      "Event Curation",
    ],
    projects: [
      {
        title: "Seasonal Supper Series",
        description: "Monthly dinner series pairing regional ingredients with storytelling menus.",
      },
      {
        title: "Kitchen Basics for Beginners",
        description: "Hands-on class format for home cooks.",
      },
      {
        title: "Producers Map",
        description: "Directory of local farmers and artisans used by the studio.",
      },
    ],
    interests: [
      { name: "Fermentation", detail: "Natural preservation methods" },
      { name: "Food anthropology", detail: "Cuisine and identity" },
      { name: "Ceramics", detail: "Handmade serving pieces" },
      { name: "Coastal hiking", detail: "Weekend reset" },
    ],
    activities: [
      {
        name: "Community dinners",
        activityType: "community",
        frequency: "monthly",
      },
      {
        name: "Cooking workshops",
        activityType: "teaching",
        frequency: "weekly",
      },
    ],
    achievements: [
      {
        title: "Independent Food Creator Award",
        date: "2025",
      },
    ],
    stats: [
      { label: "Events Hosted", value: "96" },
      { label: "Workshop Alumni", value: "540" },
      { label: "Local Suppliers", value: "23" },
    ],
    social: [
      { platform: "Instagram", url: "https://instagram.com/mesaclara", label: "@mesaclara" },
      { platform: "Website", url: "https://mesaclara.pt", label: "mesaclara.pt" },
      { platform: "LinkedIn", url: "https://linkedin.com/in/carla-mendes", label: "carla-mendes" },
    ],
    reading: [
      { title: "Salt Fat Acid Heat", author: "Samin Nosrat" },
      { title: "The Flavor Matrix", author: "James Briscione" },
    ],
    music: [
      { title: "Fado em Mim", artist: "Ana Moura" },
      { title: "Getz/Gilberto", artist: "Stan Getz and Joao Gilberto" },
    ],
    spokenLanguages: [
      { language: "Portuguese", proficiency: "native" },
      { language: "English", proficiency: "fluent" },
      { language: "Spanish", proficiency: "intermediate" },
    ],
    memories: [
      "Wants writing that feels warm and human, never corporate.",
      "Prefers sensory detail in project descriptions.",
      "Updates activities frequently around seasonal event calendar.",
      "Values local community impact as much as business growth.",
      "Avoids exaggerated claims and keeps tone grounded.",
    ],
    soul: {
      voice: "Warm craftsperson",
      tone: "Inviting and intentional",
      values: ["Hospitality", "Seasonality", "Community"],
      selfDescription: "I create food experiences that connect people to place and season.",
      communicationStyle: "Clear and vivid language with practical details.",
    },
  },
  {
    id: "noah-edtech",
    displayName: "Noah Brooks",
    usernameBase: "noah-brooks",
    emailLocal: "noah.brooks",
    language: "en",
    layoutTemplate: "curator",
    theme: "editorial-360",
    style: {
      colorScheme: "light",
      primaryColor: "#374151",
      fontFamily: "Bitter",
      layout: "split",
    },
    identity: {
      role: "Former Teacher, EdTech Founder",
      tagline: "Building classroom tools that reduce teacher admin load",
      location: "Denver, Colorado",
      bio: "Former high school teacher now building scheduling and feedback tools for schools. Focused on practical adoption in real classroom constraints.",
    },
    experience: [
      {
        role: "Founder",
        company: "Bellframe",
        period: "2023 - Present",
        description: "Building school operations software with district pilots across three states.",
        current: true,
      },
      {
        role: "Instructional Coach",
        company: "Denver Public Schools",
        period: "2020 - 2023",
        description: "Supported teachers with assessment strategy and curriculum design.",
      },
      {
        role: "High School Teacher",
        company: "Northfield High",
        period: "2014 - 2020",
        description: "Taught history and civic studies; led after-school debate program.",
      },
    ],
    education: [
      {
        institution: "University of Colorado Boulder",
        degree: "M.Ed",
        field: "Curriculum and Instruction",
        period: "2017 - 2019",
      },
      {
        institution: "Colorado State University",
        degree: "B.A.",
        field: "History",
        period: "2010 - 2014",
      },
    ],
    skills: [
      "Curriculum Design",
      "Product Discovery",
      "User Interviews",
      "EdTech Operations",
      "Pilot Programs",
      "Stakeholder Communication",
      "Teacher Training",
    ],
    projects: [
      {
        title: "Bellframe Pilot Program",
        description: "Multi-school pilot to streamline assignment tracking and parent communication.",
      },
      {
        title: "Teacher Workflow Map",
        description: "Visual map of administrative bottlenecks across the school week.",
      },
      {
        title: "Classroom Feedback Toolkit",
        description: "Reusable rubric templates and student reflection prompts.",
      },
    ],
    interests: [
      { name: "Education equity", detail: "Resource access across districts" },
      { name: "Civic literacy", detail: "Critical thinking skills" },
      { name: "Coaching", detail: "Teacher development" },
      { name: "Cycling", detail: "Commuter and weekend rides" },
    ],
    activities: [
      {
        name: "School district workshops",
        activityType: "teaching",
        frequency: "monthly",
      },
      {
        name: "Founder peer group",
        activityType: "community",
        frequency: "biweekly",
      },
    ],
    achievements: [
      {
        title: "State Innovation in Education Finalist",
        date: "2025",
      },
      {
        title: "Teacher Excellence Recognition",
        issuer: "Denver Public Schools",
        date: "2019",
      },
    ],
    stats: [
      { label: "Schools Piloting", value: "19" },
      { label: "Teachers Supported", value: "1,300+" },
      { label: "Admin Time Reduced", value: "6 hrs/week" },
    ],
    social: [
      { platform: "LinkedIn", url: "https://linkedin.com/in/noah-brooks", label: "noah-brooks" },
      { platform: "Website", url: "https://bellframe.app", label: "bellframe.app" },
    ],
    reading: [
      { title: "The Courage to Teach", author: "Parker Palmer" },
      { title: "Inspired", author: "Marty Cagan" },
    ],
    spokenLanguages: [
      { language: "English", proficiency: "native" },
      { language: "Spanish", proficiency: "intermediate" },
    ],
    memories: [
      "Keeps language accessible for educators who are not technical.",
      "Asks for practical classroom examples in every product narrative.",
      "Wants outcomes tied to teacher time savings and student support.",
      "Prefers honest tradeoffs over big visionary statements.",
      "Often revises project section after pilot feedback sessions.",
    ],
    soul: {
      voice: "Teacher-founder with practical empathy",
      tone: "Clear, grounded, and mission-driven",
      values: ["Equity", "Practicality", "Teacher trust"],
      selfDescription: "I build education tools that respect how schools really work.",
      communicationStyle: "Plain language, concrete examples, and measurable outcomes.",
    },
  },
  {
    id: "amina-product",
    displayName: "Amina Hassan",
    usernameBase: "amina-hassan",
    emailLocal: "amina.hassan",
    language: "en",
    layoutTemplate: "monolith",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#4338ca",
      fontFamily: "Charter",
      layout: "centered",
    },
    identity: {
      role: "Principal Product Manager",
      tagline: "Aligning strategy, research, and execution for complex B2B products",
      location: "Toronto, Canada",
      bio: "Product leader with background in fintech and enterprise workflow software. Builds durable product operating systems and decision frameworks.",
    },
    experience: [
      {
        role: "Principal Product Manager",
        company: "LedgerFlow",
        period: "2022 - Present",
        description: "Owns core billing workflow roadmap and cross-functional planning rituals.",
        current: true,
      },
      {
        role: "Senior Product Manager",
        company: "ClearPanel",
        period: "2019 - 2022",
        description: "Led migration from service-based pricing to usage-based plans.",
      },
      {
        role: "Product Analyst",
        company: "Vertex Commerce",
        period: "2015 - 2019",
        description: "Ran experiment pipeline and quarterly customer research synthesis.",
      },
    ],
    education: [
      {
        institution: "University of Toronto",
        degree: "B.Comm",
        field: "Business and Technology",
        period: "2011 - 2015",
      },
    ],
    skills: [
      "Product Strategy",
      "Roadmapping",
      "User Research",
      "Pricing",
      "SQL",
      "Stakeholder Management",
      "Experiment Design",
      "Discovery",
    ],
    projects: [
      {
        title: "Usage Pricing Migration",
        description: "Rollout framework balancing revenue, adoption, and customer communication.",
      },
      {
        title: "PM Decision Journal",
        description: "Template system to log assumptions, decisions, and outcomes.",
      },
    ],
    interests: [
      { name: "Product ops", detail: "Cleaner decision loops" },
      { name: "Leadership coaching", detail: "Manager enablement" },
      { name: "Behavioral research", detail: "Decision science in products" },
    ],
    activities: [
      {
        name: "PM mentorship",
        activityType: "community",
        frequency: "weekly",
      },
      {
        name: "Conference speaking",
        activityType: "community",
        frequency: "quarterly",
      },
    ],
    achievements: [
      {
        title: "Product Leader of the Year Finalist",
        date: "2025",
      },
    ],
    stats: [
      { label: "Roadmaps Delivered", value: "18" },
      { label: "NPS Increase", value: "+14" },
      { label: "Teams Coached", value: "11" },
    ],
    social: [
      { platform: "LinkedIn", url: "https://linkedin.com/in/amina-hassan", label: "amina-hassan" },
      { platform: "Website", url: "https://aminahassan.co", label: "aminahassan.co" },
    ],
    reading: [
      { title: "Escaping the Build Trap", author: "Melissa Perri" },
      { title: "Good Strategy Bad Strategy", author: "Richard Rumelt" },
    ],
    spokenLanguages: [
      { language: "English", proficiency: "native" },
      { language: "Arabic", proficiency: "fluent" },
    ],
    memories: [
      "Prefers strategic clarity with explicit tradeoffs.",
      "Wants objective metrics in every impact statement.",
      "Rewrites project blurbs to keep them concise.",
      "Likes section order that mirrors product narrative flow.",
      "Avoids vanity metrics when describing wins.",
    ],
    soul: {
      voice: "Strategic operator",
      tone: "Clear, structured, and decisive",
      values: ["Clarity", "Customer value", "Cross-functional trust"],
      selfDescription: "I turn ambiguous product problems into executable plans.",
      communicationStyle: "Top-down summaries followed by concrete supporting details.",
    },
  },
];

const BASE_URL_CANDIDATES = [
  process.env.UAT_BASE_URL,
  process.env.NEXT_PUBLIC_BASE_URL,
  "http://localhost:3000",
  "http://localhost:3001",
].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
const OUTPUT_DIR = path.join(process.cwd(), "docs", "uat", "profiles");
const SCREENSHOT_ROOT_DIR = path.join(process.cwd(), "screenshot");
const MEMORY_TYPES: MemoryType[] = ["observation", "preference", "insight", "pattern", "observation"];

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 10;
  let tag = "";
  let screenshots = true;

  for (const arg of args) {
    if (arg.startsWith("--count=")) {
      const raw = Number.parseInt(arg.split("=")[1] ?? "", 10);
      if (Number.isNaN(raw) || raw <= 0) {
        throw new Error(`Invalid --count value: ${arg}`);
      }
      count = raw;
    }
    if (arg.startsWith("--tag=")) {
      tag = arg.split("=")[1] ?? "";
    }
    if (arg === "--skip-screenshots" || arg === "--no-screenshots") {
      screenshots = false;
    }
  }

  if (count > PROFILE_BLUEPRINTS.length) {
    throw new Error(`Requested ${count} profiles but only ${PROFILE_BLUEPRINTS.length} blueprints are available.`);
  }

  return {
    count,
    tag: sanitizeUsername(tag).slice(0, 12),
    screenshots,
  };
}

async function isUrlReachable(url: string, timeoutMs: number = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveBaseUrl(): Promise<string> {
  const seen = new Set<string>();
  const candidates = BASE_URL_CANDIDATES.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  for (const baseUrl of candidates) {
    const ok = await isUrlReachable(`${baseUrl}/login`);
    if (ok) return baseUrl;
  }

  return candidates[0] ?? "http://localhost:3000";
}

function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return cleaned || "user";
}

function trimUsername(raw: string): string {
  const trimmed = raw.slice(0, 39).replace(/-+$/, "");
  return trimmed || "uat-user";
}

function ensureUniqueUsername(base: string, tag: string): string {
  const baseSlug = sanitizeUsername(base);
  const tagPart = tag ? `-${tag}` : "";
  let candidate = trimUsername(`uat-${baseSlug}${tagPart}`);
  let i = 1;

  while (isUsernameTaken(candidate)) {
    candidate = trimUsername(`uat-${baseSlug}${tagPart}-${i}`);
    i += 1;
  }

  return candidate;
}

function sanitizeEmailLocal(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  return cleaned || "uat.user";
}

function ensureUniqueEmail(local: string, tag: string): string {
  const localPart = sanitizeEmailLocal(local);
  const tagPart = tag ? `.${tag}` : "";
  let candidate = `${localPart}${tagPart}@uat.openself.dev`;
  let i = 1;

  while (isEmailTaken(candidate)) {
    candidate = `${localPart}${tagPart}.${i}@uat.openself.dev`;
    i += 1;
  }

  return candidate;
}

function makePassword(index: number): string {
  return `UatDemo2026!${String(index + 1).padStart(2, "0")}`;
}

function slugify(input: string, fallback: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return normalized || fallback;
}

function nowMinusDays(days: number): string {
  const ts = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ts).toISOString();
}

function buildFacts(
  profile: ProfileBlueprint,
  sessionId: string,
  profileId: string,
  email: string,
) {
  const rows: Array<typeof facts.$inferInsert> = [];
  let cursor = 0;

  const pushFact = (
    category: string,
    key: string,
    value: Record<string, unknown>,
  ) => {
    const createdAt = nowMinusDays(65 - (cursor % 45));
    cursor += 1;
    rows.push({
      id: randomUUID(),
      sessionId,
      profileId,
      category,
      key,
      value,
      source: "chat",
      confidence: 1,
      visibility: "public",
      createdAt,
      updatedAt: createdAt,
    });
  };

  pushFact("identity", "full-name", {
    full: profile.displayName,
    name: profile.displayName,
  });
  pushFact("identity", "role", {
    role: profile.identity.role,
    title: profile.identity.role,
  });
  pushFact("identity", "tagline", {
    tagline: profile.identity.tagline,
  });
  pushFact("identity", "location", {
    value: profile.identity.location,
  });
  pushFact("identity", "bio", {
    value: profile.identity.bio,
  });

  profile.experience.forEach((item, idx) => {
    pushFact("experience", `job-${idx + 1}`, {
      role: item.role,
      company: item.company,
      period: item.period,
      description: item.description,
      current: item.current ?? false,
      status: item.current ? "current" : "past",
    });
  });

  (profile.education ?? []).forEach((item, idx) => {
    pushFact("education", `edu-${idx + 1}`, {
      institution: item.institution,
      degree: item.degree,
      field: item.field,
      period: item.period,
      description: item.description,
    });
  });

  (profile.skills ?? []).forEach((skill, idx) => {
    pushFact("skill", `skill-${slugify(skill, String(idx + 1))}`, {
      name: skill,
    });
  });

  (profile.projects ?? []).forEach((item, idx) => {
    pushFact("project", `project-${slugify(item.title, String(idx + 1))}`, {
      title: item.title,
      description: item.description,
      url: item.url,
      tags: item.tags,
    });
  });

  (profile.interests ?? []).forEach((item, idx) => {
    pushFact("interest", `interest-${idx + 1}`, {
      name: item.name,
      detail: item.detail,
    });
  });

  (profile.activities ?? []).forEach((item, idx) => {
    pushFact("activity", `activity-${idx + 1}`, {
      name: item.name,
      activityType: item.activityType,
      frequency: item.frequency,
      description: item.description,
    });
  });

  (profile.achievements ?? []).forEach((item, idx) => {
    pushFact("achievement", `achievement-${idx + 1}`, {
      title: item.title,
      description: item.description,
      date: item.date,
      issuer: item.issuer,
    });
  });

  (profile.stats ?? []).forEach((item, idx) => {
    pushFact("stat", `stat-${idx + 1}`, {
      label: item.label,
      value: item.value,
    });
  });

  (profile.social ?? []).forEach((item, idx) => {
    pushFact("social", `social-${idx + 1}`, {
      platform: item.platform,
      url: item.url,
      label: item.label,
    });
  });

  (profile.reading ?? []).forEach((item, idx) => {
    pushFact("reading", `book-${idx + 1}`, {
      title: item.title,
      author: item.author,
      note: item.note,
    });
  });

  (profile.music ?? []).forEach((item, idx) => {
    pushFact("music", `music-${idx + 1}`, {
      title: item.title,
      artist: item.artist,
      note: item.note,
    });
  });

  (profile.spokenLanguages ?? []).forEach((item, idx) => {
    pushFact("language", `lang-${idx + 1}`, {
      language: item.language,
      proficiency: item.proficiency,
    });
  });

  pushFact("contact", "email", {
    type: "email",
    value: email,
    email,
    label: "Email",
  });

  return rows;
}

function writeCredentialFiles(runId: string, records: CreatedProfileRecord[], baseUrl: string) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    totalProfiles: records.length,
    profiles: records,
  };

  const jsonText = JSON.stringify(payload, null, 2);
  const mdText = renderMarkdown(payload.generatedAt, records, baseUrl);

  fs.writeFileSync(path.join(OUTPUT_DIR, `${runId}.json`), jsonText, "utf8");
  fs.writeFileSync(path.join(OUTPUT_DIR, `${runId}.md`), mdText, "utf8");
  fs.writeFileSync(path.join(OUTPUT_DIR, "latest.json"), jsonText, "utf8");
  fs.writeFileSync(path.join(OUTPUT_DIR, "latest.md"), mdText, "utf8");
}

function renderMarkdown(generatedAt: string, records: CreatedProfileRecord[], baseUrl: string): string {
  const lines: string[] = [];
  lines.push("# UAT Profile Batch");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push(`Base URL: ${baseUrl}`);
  lines.push("");
  lines.push("| # | Name | Username | Email | Password | Layout | Theme | Public URL |");
  lines.push("|---|---|---|---|---|---|---|---|");

  records.forEach((row, idx) => {
    lines.push(
      `| ${idx + 1} | ${row.displayName} | ${row.username} | ${row.email} | ${row.password} | ${row.layoutTemplate} | ${row.theme} | ${row.publishedUrl} |`,
    );
  });

  lines.push("");
  lines.push("## Notes");
  lines.push("- All profiles are pre-published.");
  lines.push("- Use the same login page for all users.");
  lines.push(`- Login URL: ${baseUrl}/login`);
  lines.push(`- Builder URL: ${baseUrl}/builder`);

  return lines.join("\n");
}

async function captureProfileScreenshots(
  runId: string,
  records: CreatedProfileRecord[],
): Promise<string | null> {
  if (records.length === 0) return null;

  const probeUrl = records[0].publishedUrl;
  const reachable = await isUrlReachable(probeUrl, 7000);
  if (!reachable) {
    console.warn(`[seed-uat-profiles] Screenshot skipped: URL not reachable (${probeUrl})`);
    return null;
  }

  try {
    const { chromium } = await import("@playwright/test");
    const outDir = path.join(SCREENSHOT_ROOT_DIR, `uat-profiles-${runId}`);
    fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 2200 },
    });

    try {
      for (const row of records) {
        const page = await context.newPage();
        try {
          await page.goto(row.publishedUrl, {
            waitUntil: "networkidle",
            timeout: 120_000,
          });
          await page.waitForTimeout(1200);
          await page.screenshot({
            path: path.join(outDir, `${row.username}.png`),
            fullPage: true,
          });
        } finally {
          await page.close();
        }
      }

      const indexContent = records
        .map((row, idx) => `${String(idx + 1).padStart(2, "0")}. ${row.username} -> ${row.publishedUrl}`)
        .join("\n");
      fs.writeFileSync(path.join(outDir, "index.txt"), `${indexContent}\n`, "utf8");
    } finally {
      await context.close();
      await browser.close();
    }

    return outDir;
  } catch (err) {
    console.warn(`[seed-uat-profiles] Screenshot failed: ${String(err)}`);
    return null;
  }
}

async function createProfileFromBlueprint(
  blueprint: ProfileBlueprint,
  index: number,
  tag: string,
  baseUrl: string,
): Promise<CreatedProfileRecord> {
  const password = makePassword(index);
  const username = ensureUniqueUsername(blueprint.usernameBase, tag);
  const email = ensureUniqueEmail(blueprint.emailLocal, tag);

  const user = await createUser(email, password, blueprint.displayName);
  const profile = createProfile(user.id);
  linkProfileToUser(profile.id, user.id);
  setProfileUsername(profile.id, username);

  const sessionId = createAuthSession(user.id, profile.id);
  registerUsername(sessionId, username);

  const factRows = buildFacts(blueprint, sessionId, profile.id, email);
  for (const row of factRows) {
    db.insert(facts).values(row).run();
  }

  updateSoulOverlay(profile.id, blueprint.soul);

  (blueprint.memories ?? []).slice(0, 5).forEach((content, idx) => {
    saveMemory(
      profile.id,
      content,
      MEMORY_TYPES[idx % MEMORY_TYPES.length],
      "uat",
      1,
    );
  });

  const insertedFacts = db
    .select()
    .from(facts)
    .where(eq(facts.sessionId, sessionId))
    .all();

  let config = composeOptimisticPage(
    insertedFacts,
    username,
    blueprint.language,
    blueprint.layoutTemplate,
  );

  config = {
    ...config,
    theme: blueprint.theme,
    style: {
      ...config.style,
      colorScheme: blueprint.style?.colorScheme ?? config.style.colorScheme,
      primaryColor: blueprint.style?.primaryColor ?? config.style.primaryColor,
      fontFamily: blueprint.style?.fontFamily ?? config.style.fontFamily,
      layout: blueprint.style?.layout ?? config.style.layout,
    },
  };

  upsertDraft(username, config, sessionId, profile.id);
  requestPublish(username, sessionId);
  confirmPublish(username, sessionId);

  return {
    id: blueprint.id,
    displayName: blueprint.displayName,
    username,
    email,
    password,
    language: blueprint.language,
    layoutTemplate: blueprint.layoutTemplate,
    theme: blueprint.theme,
    factCount: factRows.length,
    sectionCount: config.sections.length,
    publishedUrl: `${baseUrl}/${username}`,
    loginUrl: `${baseUrl}/login`,
    builderUrl: `${baseUrl}/builder`,
  };
}

async function main() {
  const { count, tag, screenshots } = parseArgs();
  const selected = PROFILE_BLUEPRINTS.slice(0, count);
  const baseUrl = await resolveBaseUrl();

  console.log(`🌱 Seeding ${selected.length} UAT profiles...`);
  console.log(`   Base URL: ${baseUrl}`);

  const runIdBase = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = tag ? `${runIdBase}-${tag}` : runIdBase;

  const created: CreatedProfileRecord[] = [];

  for (let i = 0; i < selected.length; i += 1) {
    const blueprint = selected[i];
    console.log(`   → ${blueprint.displayName}`);
    const result = await createProfileFromBlueprint(blueprint, i, tag, baseUrl);
    created.push(result);
    console.log(`      created ${result.username} (${result.factCount} facts, ${result.sectionCount} sections)`);
  }

  writeCredentialFiles(runId, created, baseUrl);

  let screenshotDir: string | null = null;
  if (screenshots) {
    console.log("");
    console.log("📸 Capturing screenshots...");
    screenshotDir = await captureProfileScreenshots(runId, created);
  }

  console.log("");
  console.log("✅ UAT batch completed");
  console.log(`   Profiles created: ${created.length}`);
  console.log(`   Credentials file: ${path.join(OUTPUT_DIR, "latest.md")}`);
  console.log(`   JSON file:        ${path.join(OUTPUT_DIR, "latest.json")}`);
  if (screenshots) {
    console.log(`   Screenshot dir:   ${screenshotDir ?? "(skipped/unavailable)"}`);
  }
  console.log("");
  console.log("Public URLs:");
  created.forEach((row) => {
    console.log(`   - ${row.publishedUrl}`);
  });
}

main().catch((err) => {
  console.error("❌ UAT batch seed failed:", err);
  process.exit(1);
});

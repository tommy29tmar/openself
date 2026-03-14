import { Bot, Plug, Paintbrush, Eye } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.06]">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9a96e]/10">
        <Icon className="h-5 w-5 text-[#c9a96e]" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-[#999]">{description}</p>
    </div>
  );
}

const features: FeatureCardProps[] = [
  {
    icon: Bot,
    title: "AI Conversation",
    description:
      "A smart agent that understands context, asks the right questions, and builds your page from natural dialogue — no forms to fill.",
  },
  {
    icon: Plug,
    title: "Smart Connectors",
    description:
      "GitHub, Spotify, Strava, LinkedIn, RSS — connect once and your page updates automatically with real activity from your life.",
  },
  {
    icon: Paintbrush,
    title: "Presence Design System",
    description:
      "Choose your surface, voice, and light. Nine signature combinations that give your page a unique visual identity.",
  },
  {
    icon: Eye,
    title: "Real-time Preview",
    description:
      "See every change as you make it. Split-view editing with live preview, so you always know what your visitors will see.",
  },
];

export function Features() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-[#c9a96e]">
          Features
        </h2>
        <p className="mx-auto mb-16 max-w-xl text-center text-2xl font-bold text-white sm:text-3xl">
          Everything you need, nothing you don&apos;t
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
